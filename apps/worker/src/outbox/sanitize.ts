// Sanitización de errores y política de backoff — DATATEK_R0_E sección 8
// ("error sanitizado", "backoff", "next_attempt_at").
//
// `outbox_messages.last_error` es una columna que un operador humano lee
// para entender por qué un mensaje quedó `dead`. Eso la vuelve una
// superficie de fuga: si se escribiera `String(error)` crudo, un mensaje de
// error que incluya el email del cliente, un token, o la ruta absoluta del
// código quedaría persistido en una tabla que sobrevive al incidente.
// El comentario de la propia columna en `0085` ya lo exige: "Mensaje de
// error SANITIZADO — nunca un stack trace crudo ni datos sensibles".

/** Tope duro de longitud — un `last_error` no es un log, es una etiqueta. */
export const MAX_SANITIZED_ERROR_LENGTH = 200;

/** Texto usado cuando no queda nada seguro que reportar. */
export const OPAQUE_ERROR_TEXT = "error no clasificado (detalle omitido por seguridad)";

/**
 * Patrones redactados ANTES de truncar.
 *
 * EL ORDEN ES SIGNIFICATIVO y se descubrió con un test que falló: la URL
 * debe redactarse ANTES que las rutas, porque el patrón de ruta POSIX
 * (`(?:\/[\w.-]+){2,}`) también encaja con el `//host/segmento` de una URL
 * y la degradaba a `https:/[path]`. El host quedaba igualmente redactado
 * (no había fuga), pero la etiqueta resultante era engañosa para quien lee
 * la columna. Regla general: de más específico a más genérico.
 */
const REDACTIONS: readonly { pattern: RegExp; replacement: string }[] = [
  // Email.
  { pattern: /[\w.+-]+@[\w-]+\.[\w.-]+/g, replacement: "[email]" },
  // JWT (tres segmentos) — antes que el token genérico, que también
  // encajaría con sus dos primeros segmentos.
  { pattern: /\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/g, replacement: "[jwt]" },
  // URL completa — antes que las rutas (ver nota de orden arriba). Redacta
  // también cualquier token o hash que viajara en el query string.
  { pattern: /\bhttps?:\/\/\S+/gi, replacement: "[url]" },
  // Token de autorización con la forma `${tokenRowId}.${secret}` de
  // authorization-commands.ts — el secreto es base64url de 32 bytes.
  { pattern: /\b[\w-]{8,}\.[A-Za-z0-9_-]{20,}\b/g, replacement: "[token]" },
  // Hash hex largo (sha256 de 64 chars, p. ej. un `tokenHash`).
  { pattern: /\b[a-f0-9]{32,}\b/gi, replacement: "[hash]" },
  // Rutas de sistema de archivos (Windows y POSIX) — filtran estructura
  // interna y a veces el nombre de usuario del host.
  { pattern: /[A-Za-z]:\\[^\s"']+/g, replacement: "[path]" },
  { pattern: /(?:\/[\w.-]+){2,}\/?/g, replacement: "[path]" },
  // Teléfono (>= 8 dígitos, con separadores opcionales) y cualquier corrida
  // larga de dígitos que pudiera ser un identificador personal.
  { pattern: /\+?\d[\d\s().-]{7,}\d/g, replacement: "[phone]" },
];

/**
 * Convierte cualquier valor lanzado en una etiqueta corta, estable y segura
 * de persistir.
 *
 * Garantías (probadas en `sanitize.test.ts`):
 * - NUNCA incluye `error.stack`, ni siquiera parcialmente;
 * - nunca incluye email, teléfono, token, JWT, hash largo, URL ni ruta;
 * - siempre <= `MAX_SANITIZED_ERROR_LENGTH` caracteres;
 * - es de una sola línea (los saltos se colapsan a espacio);
 * - es determinista: la misma entrada produce la misma salida, así que un
 *   operador puede agrupar fallos repetidos por su texto.
 */
export function sanitizeOutboxError(error: unknown): string {
  const raw = extractMessage(error);
  if (!raw) return OPAQUE_ERROR_TEXT;

  // Colapsa a una línea ANTES de redactar: un stack multilinea que se
  // hubiera colado por un `message` con saltos queda plano y luego truncado.
  let text = raw.replace(/\s+/g, " ").trim();
  if (!text) return OPAQUE_ERROR_TEXT;

  for (const { pattern, replacement } of REDACTIONS) {
    text = text.replace(pattern, replacement);
  }

  text = text.trim();
  if (!text) return OPAQUE_ERROR_TEXT;

  if (text.length > MAX_SANITIZED_ERROR_LENGTH) {
    return `${text.slice(0, MAX_SANITIZED_ERROR_LENGTH - 1).trimEnd()}…`;
  }
  return text;
}

/**
 * Extrae SOLO el mensaje. Deliberadamente ignora `error.stack`, `error.cause`
 * y cualquier propiedad extra: un `cause` anidado suele traer el payload
 * original del fallo, que es justo lo que no debe persistirse.
 */
function extractMessage(error: unknown): string {
  if (error instanceof Error) return error.message ?? "";
  if (typeof error === "string") return error;
  if (typeof error === "number" || typeof error === "boolean") return String(error);
  // Un objeto arbitrario NO se serializa con JSON.stringify — ese es
  // exactamente el camino por el que un payload con PII terminaría en la
  // columna. Se reporta solo su tipo.
  if (error && typeof error === "object") {
    const name = (error as { name?: unknown }).name;
    return typeof name === "string" && name.trim() ? `error tipo ${name}` : OPAQUE_ERROR_TEXT;
  }
  return OPAQUE_ERROR_TEXT;
}

export interface BackoffPolicy {
  /** Retraso del primer reintento, en ms. */
  baseDelayMs: number;
  /** Tope superior — un backoff exponencial sin techo puede empujar
   * `next_attempt_at` a semanas y hacer que el mensaje parezca perdido. */
  maxDelayMs: number;
}

export const DEFAULT_BACKOFF: BackoffPolicy = {
  baseDelayMs: 30_000, // 30 s
  maxDelayMs: 15 * 60_000, // 15 min
};

/**
 * Backoff exponencial determinista: `base * 2^(attempts-1)`, con techo.
 *
 * Deliberadamente SIN jitter aleatorio. Dos razones: (1) los tests de
 * sección 8 verifican `next_attempt_at` exacto, y un jitter lo volvería no
 * determinista; (2) el jitter sirve para desincronizar una flota de
 * workers compitiendo por el mismo backend, y R0 no tiene flota. Cuando
 * exista un backend distribuido (ver la deuda de rate limits), agregar
 * jitter acotado aquí es un cambio de una línea — la firma ya recibe
 * `attempts`, que es todo lo que necesita.
 */
export function computeBackoffDelayMs(attempts: number, policy: BackoffPolicy): number {
  const safeAttempts = Math.max(1, Math.floor(attempts));
  // `2 ** 30` ya excede cualquier techo razonable; se acota el exponente
  // para no producir `Infinity` con un `attempts` corrupto.
  const exponent = Math.min(safeAttempts - 1, 30);
  const delay = policy.baseDelayMs * 2 ** exponent;
  return Math.min(delay, policy.maxDelayMs);
}

/** `next_attempt_at` resultante tras un fallo, como ISO 8601. */
export function computeNextAttemptAt(
  now: Date,
  attempts: number,
  policy: BackoffPolicy = DEFAULT_BACKOFF,
): string {
  return new Date(now.getTime() + computeBackoffDelayMs(attempts, policy)).toISOString();
}
