// Contratos de rate limit — DATATEK_R0_E sección 10.
//
// =========================================================================
// DECLARACIÓN OBLIGATORIA — LÉASE ANTES QUE EL CÓDIGO
// =========================================================================
//
// La sección 10 termina con una regla dura:
//
//   "No se declara rate limiting productivo si solo existe una interfaz
//    local."
//
// Este archivo es EXACTAMENTE esa interfaz local. `InMemoryRateLimiter`
// cuenta en un `Map` dentro de UN proceso Node. Por lo tanto:
//
//   - NO es rate limiting productivo y no debe declararse como tal;
//   - no protege nada si hay más de una instancia de la app (cada proceso
//     lleva su propio conteo, así que N instancias multiplican por N el
//     límite efectivo);
//   - se reinicia con el proceso, así que un atacante que provoque un
//     reinicio limpia su cuota;
//   - no sobrevive a un despliegue ni a un escalado horizontal.
//
// Producción necesita un backend distribuido (Redis/Upstash o equivalente)
// detrás de `RateLimiterAdapter`. Ese cambio no toca las políticas de
// abajo: son datos, y son lo que esta fase sí entrega probado.
//
// Estado honesto: **contrato definido y probado; adapter local probado;
// NINGUNA ruta lo aplica todavía** — ver la nota de "cableado" al final del
// archivo y la deuda declarada en DATATEK_R0_E_FASE2_REPORT.md.

import { createHmac, randomBytes } from "node:crypto";

// -------------------------------------------------------------------------
// 1. Tipo de política — los 8 campos que la sección 10 exige por ámbito
// -------------------------------------------------------------------------

/** De qué se lleva la cuenta. */
export type RateLimitSubject =
  /** Identificador de red del cliente. SIEMPRE hasheado antes de usarse
   * como clave — ver `hashSubject`. */
  | "client_ip"
  /** El id de fila PÚBLICO del token (`tokenRowId`), nunca el secreto. */
  | "authorization_token_id"
  /** Actor autenticado (id de usuario), para límites por cuenta. */
  | "actor_id"
  /** Organización, para topes de consumo por tenant. */
  | "organization_id";

/** Qué hacer si el backend de conteo no responde. */
export type ProviderFailureMode =
  /** Deja pasar la petición. Se elige solo donde existe OTRO control duro
   * e independiente que ya acota el daño. */
  | "fail_open"
  /** Rechaza la petición. Se elige donde no hay tope independiente y el
   * recurso consumido es acumulativo. */
  | "fail_closed";

export interface RateLimitPolicy {
  /** Identificador estable de la política, usado en logs y métricas. */
  key: string;
  /** (1) Sujeto/bucket. */
  subject: RateLimitSubject;
  /** Sufijo que separa buckets del mismo sujeto en ámbitos distintos —
   * el bucket real es `${key}:${hash(subject)}`, así que agotar el límite
   * de login no consume el de booking. */
  bucketScope: string;
  /** (2) Ventana, en segundos. */
  windowSeconds: number;
  /** (3) Límite de peticiones dentro de la ventana. */
  limit: number;
  /** (4) Respuesta al exceder. */
  response: {
    status: 429;
    /** Cuerpo/mensaje NEUTRAL: nunca revela si el sujeto existe, ni cuánta
     * cuota le queda a otro sujeto. */
    message: string;
  };
  /** (5) Retry-after: se emite SIEMPRE que se rechaza, en segundos. */
  emitsRetryAfter: true;
  /** (6) Privacidad del identificador. */
  identifierPrivacy: {
    /** `true` => el identificador crudo nunca se persiste ni se loguea. */
    hashed: boolean;
    /** Qué se guarda realmente. */
    storedForm: string;
  };
  /** (7) Observabilidad: nombre del evento estructurado que se emite. */
  observabilityEvent: string;
  /** (8) Comportamiento ante caída del proveedor, con su justificación. */
  providerFailure: {
    mode: ProviderFailureMode;
    /** Por qué ese modo es el correcto AQUÍ. */
    rationale: string;
  };
}

// -------------------------------------------------------------------------
// 2. Las seis políticas obligatorias (sección 10, "Ámbitos")
// -------------------------------------------------------------------------

const NEUTRAL_MESSAGE = "Demasiadas solicitudes. Intenta de nuevo en unos momentos.";

export const RATE_LIMIT_POLICIES = {
  /** Ámbito: login. */
  login: {
    key: "login",
    subject: "client_ip",
    bucketScope: "auth:login",
    windowSeconds: 300,
    limit: 10,
    response: { status: 429, message: NEUTRAL_MESSAGE },
    emitsRetryAfter: true,
    identifierPrivacy: {
      hashed: true,
      storedForm: "HMAC-SHA256(ip, salt de proceso), 32 hex — nunca la IP",
    },
    observabilityEvent: "rate_limit.login.exceeded",
    providerFailure: {
      mode: "fail_open",
      rationale:
        "Dejar entrar tráfico legítimo pesa más que bloquear un intento: el login fixture de R0 no acepta contraseña, así que no hay credencial que adivinar por fuerza bruta. Con Supabase Auth real esta decisión debe re-evaluarse a fail_closed.",
    },
  },

  /** Ámbito: verificación de autorización (`VerifyAuthorizationAccess`). */
  authorizationVerify: {
    key: "authorization_verify",
    subject: "authorization_token_id",
    bucketScope: "auth:verify",
    windowSeconds: 300,
    limit: 10,
    response: { status: 429, message: NEUTRAL_MESSAGE },
    emitsRetryAfter: true,
    identifierPrivacy: {
      hashed: true,
      storedForm:
        "HMAC-SHA256(tokenRowId, salt de proceso). El tokenRowId ya es público (no es el secreto), pero se hashea igual para que el bucket no sea un índice de qué enlaces existen",
    },
    observabilityEvent: "rate_limit.authorization_verify.exceeded",
    providerFailure: {
      mode: "fail_open",
      rationale:
        "Existe un tope duro INDEPENDIENTE que no depende de este limiter: el contador de 5 intentos por token con bloqueo permanente (SECURITY_SPEC.authorization_token_max_attempts, aplicado dentro de resolveToken). Aunque el limiter caiga, un atacante sigue sin poder pasar de 5 intentos fallidos.",
    },
  },

  /** Ámbito: `/a/[token]` (render de la página del enlace). */
  authorizationTokenPage: {
    key: "authorization_token_page",
    subject: "client_ip",
    bucketScope: "public:a-token",
    windowSeconds: 60,
    limit: 30,
    response: { status: 429, message: NEUTRAL_MESSAGE },
    emitsRetryAfter: true,
    identifierPrivacy: {
      hashed: true,
      storedForm: "HMAC-SHA256(ip, salt de proceso) — nunca la IP, nunca el token de la URL",
    },
    observabilityEvent: "rate_limit.authorization_token_page.exceeded",
    providerFailure: {
      mode: "fail_open",
      rationale:
        "Es una vista de lectura; el mismo tope de 5 intentos protege la parte que decide. Bloquear a un cliente legítimo que recarga su enlace es peor que servir de más.",
    },
  },

  /** Ámbito: booking (`ScheduleAppointment`). */
  booking: {
    key: "booking",
    subject: "actor_id",
    bucketScope: "agenda:booking",
    windowSeconds: 60,
    limit: 20,
    response: { status: 429, message: NEUTRAL_MESSAGE },
    emitsRetryAfter: true,
    identifierPrivacy: {
      hashed: true,
      storedForm: "HMAC-SHA256(actorId, salt de proceso) — el id del actor no queda en el bucket",
    },
    observabilityEvent: "rate_limit.booking.exceeded",
    providerFailure: {
      mode: "fail_open",
      rationale:
        "La integridad de la agenda NO depende de este limiter: la doble reserva la impide la restricción EXCLUDE de resource_reservations (migración 0060) y, en el motor en memoria, overlapsActiveReservation. El limiter solo modera el volumen.",
    },
  },

  /** Ámbito: endpoints públicos (cualquier ruta sin sesión). */
  publicEndpoints: {
    key: "public_endpoints",
    subject: "client_ip",
    bucketScope: "public:generic",
    windowSeconds: 60,
    limit: 60,
    response: { status: 429, message: NEUTRAL_MESSAGE },
    emitsRetryAfter: true,
    identifierPrivacy: {
      hashed: true,
      storedForm: "HMAC-SHA256(ip, salt de proceso)",
    },
    observabilityEvent: "rate_limit.public_endpoints.exceeded",
    providerFailure: {
      mode: "fail_open",
      rationale:
        "Superficie de solo lectura (marketing/legal). Un fallo del limiter no habilita ninguna escritura.",
    },
  },

  /** Ámbito: creación de upload intent (`CreateUploadIntent`). */
  uploadIntentCreate: {
    key: "upload_intent_create",
    subject: "actor_id",
    bucketScope: "evidence:upload-intent",
    windowSeconds: 60,
    limit: 30,
    response: { status: 429, message: NEUTRAL_MESSAGE },
    emitsRetryAfter: true,
    identifierPrivacy: {
      hashed: true,
      storedForm: "HMAC-SHA256(actorId, salt de proceso)",
    },
    observabilityEvent: "rate_limit.upload_intent_create.exceeded",
    providerFailure: {
      mode: "fail_closed",
      rationale:
        "ÚNICO fail_closed de las seis, y a propósito: cada upload intent reserva capacidad de almacenamiento y no existe ningún otro tope independiente que lo acote (a diferencia del token, que tiene sus 5 intentos, o de la agenda, que tiene su EXCLUDE). Sin conteo fiable, permitir creación ilimitada es un vector de agotamiento de recursos. Un upload bloqueado es recuperable: la persona reintenta.",
    },
  },
} as const satisfies Record<string, RateLimitPolicy>;

export type RateLimitPolicyName = keyof typeof RATE_LIMIT_POLICIES;

// -------------------------------------------------------------------------
// 3. Privacidad del identificador
// -------------------------------------------------------------------------

// Sal de PROCESO, aleatoria en cada arranque. Dos consecuencias, ambas
// deliberadas:
//
//  - una IP nunca puede correlacionarse entre reinicios ni cruzarse con
//    ninguna tabla externa: el hash no es reversible NI estable en el
//    tiempo. Esto es lo que hace que el bucket no sea PII persistida;
//  - los contadores se pierden al reiniciar. Es una limitación REAL del
//    adapter local, no un descuido — otra razón por la que esto no es
//    rate limiting productivo.
//
// Un backend distribuido necesitará una sal COMPARTIDA y secreta (variable
// de entorno), no esta.
const PROCESS_SALT = randomBytes(32);

/**
 * Convierte un identificador crudo (IP, id de actor, id de token) en una
 * clave de bucket opaca. La sección 10 pide explícitamente no usar la IP
 * cruda como identificador persistido: es PII.
 */
export function hashSubject(rawIdentifier: string): string {
  return createHmac("sha256", PROCESS_SALT)
    .update(rawIdentifier, "utf8")
    .digest("hex")
    .slice(0, 32);
}

/** Clave completa del bucket: separa ámbitos para que no se contaminen. */
export function buildBucketKey(policy: RateLimitPolicy, rawIdentifier: string): string {
  return `${policy.bucketScope}:${hashSubject(rawIdentifier)}`;
}

// -------------------------------------------------------------------------
// 4. Adapter
// -------------------------------------------------------------------------

export interface RateLimitDecision {
  allowed: boolean;
  /** Peticiones restantes en la ventana actual (0 si se rechazó). */
  remaining: number;
  /** Segundos hasta que la ventana se reinicie. Es el valor exacto que
   * debe ir en la cabecera `Retry-After` cuando `allowed === false`. */
  retryAfterSeconds: number;
  /** `true` cuando la decisión la tomó el modo de fallo, no un conteo
   * real — para que la observabilidad pueda distinguirlas. */
  degraded: boolean;
}

export interface RateLimiterAdapter {
  /**
   * Consume una unidad de cuota.
   *
   * Contrato para CUALQUIER implementación (incluida la de Redis):
   * - debe ser atómico por bucket (en Redis: `INCR` + `EXPIRE` en un script
   *   Lua o una transacción, nunca `GET` seguido de `SET`);
   * - nunca lanza: un fallo del backend se traduce al `providerFailure.mode`
   *   de la política y se marca `degraded: true`.
   */
  consume(policy: RateLimitPolicy, rawIdentifier: string, now: Date): RateLimitDecision;
}

interface Bucket {
  count: number;
  /** Epoch ms en el que la ventana termina. */
  resetAtMs: number;
}

/**
 * Adapter local de ventana fija. Ver la declaración obligatoria al inicio
 * del archivo: NO es rate limiting productivo.
 *
 * Se eligió ventana fija (y no sliding window) a propósito: es la
 * semántica que un `INCR`+`EXPIRE` de Redis reproduce exactamente, así que
 * el reemplazo por el adapter distribuido no cambia el comportamiento
 * observable que estos tests fijan.
 */
export class InMemoryRateLimiter implements RateLimiterAdapter {
  private readonly buckets = new Map<string, Bucket>();
  /** Inyectable solo para probar el modo de fallo del proveedor. */
  private readonly failNext: () => boolean;

  constructor(options: { simulateProviderFailure?: () => boolean } = {}) {
    this.failNext = options.simulateProviderFailure ?? (() => false);
  }

  consume(policy: RateLimitPolicy, rawIdentifier: string, now: Date): RateLimitDecision {
    if (this.failNext()) {
      const allowed = policy.providerFailure.mode === "fail_open";
      return {
        allowed,
        remaining: 0,
        retryAfterSeconds: allowed ? 0 : policy.windowSeconds,
        degraded: true,
      };
    }

    const key = buildBucketKey(policy, rawIdentifier);
    const nowMs = now.getTime();
    const existing = this.buckets.get(key);

    if (!existing || existing.resetAtMs <= nowMs) {
      this.buckets.set(key, { count: 1, resetAtMs: nowMs + policy.windowSeconds * 1000 });
      return {
        allowed: true,
        remaining: policy.limit - 1,
        retryAfterSeconds: 0,
        degraded: false,
      };
    }

    const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAtMs - nowMs) / 1000));

    if (existing.count >= policy.limit) {
      return { allowed: false, remaining: 0, retryAfterSeconds, degraded: false };
    }

    existing.count += 1;
    return {
      allowed: true,
      remaining: policy.limit - existing.count,
      retryAfterSeconds: 0,
      degraded: false,
    };
  }

  /** Solo para tests. */
  size(): number {
    return this.buckets.size;
  }
}

// -------------------------------------------------------------------------
// 5. Observabilidad
// -------------------------------------------------------------------------

export interface RateLimitEvent {
  event: string;
  policy: RateLimitPolicyName;
  /** El bucket HASHEADO. Nunca la IP ni el id crudo. */
  bucket: string;
  degraded: boolean;
  retryAfterSeconds: number;
}

/**
 * Construye el evento estructurado de un rechazo. Es una función pura para
 * que un test pueda comprobar que NUNCA contiene el identificador crudo.
 */
export function buildRateLimitEvent(
  policyName: RateLimitPolicyName,
  rawIdentifier: string,
  decision: RateLimitDecision,
): RateLimitEvent {
  const policy = RATE_LIMIT_POLICIES[policyName];
  return {
    event: policy.observabilityEvent,
    policy: policyName,
    bucket: buildBucketKey(policy, rawIdentifier),
    degraded: decision.degraded,
    retryAfterSeconds: decision.retryAfterSeconds,
  };
}

// -------------------------------------------------------------------------
// 6. Cableado — estado real, sin adornos
// -------------------------------------------------------------------------
//
// NINGUNA ruta ni Server Action invoca todavía a `consume()`. Esta fase
// entrega el contrato, las seis políticas con sus ocho campos, el adapter
// local y sus pruebas. Aplicarlo en la ruta requiere decidir de dónde sale
// la IP del cliente (`x-forwarded-for` solo es confiable detrás de un proxy
// que uno controla; sin él es falsificable, y usarlo tal cual sería peor
// que no limitar porque daría una falsa sensación de protección), y esa
// decisión depende de una topología de despliegue que R0 no tiene.
//
// Se declara así, sin cableado, en vez de conectarlo a un identificador
// falsificable y declararlo "listo".
