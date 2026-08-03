// Logs estructurados — DATATEK_R0_E sección 13.
//
// El grueso de este archivo prueba UNA cosa: que `redactLogValue` no deje
// escapar un secreto de enlace de autorización. El resto del logger es
// deliberadamente pequeño (un objeto cerrado y un sink), así que lo que
// puede fallar en silencio es la redacción.
//
// El bloque "orden de redacción" es una prueba de regresión de un bug real:
// con el orden original (email -> teléfono -> token) el patrón de teléfono
// PARTÍA el secreto en dos fragmentos de menos de 32 caracteres, y el patrón
// de token —que corría después— ya no reconocía ninguno. El resultado era un
// log con casi todo el secreto en claro. Ver el comentario largo de ORDEN en
// logger.ts.
import { describe, it } from "node:test";
import { expect } from "expect";
import {
  createLogger,
  jsonLineSink,
  memorySink,
  redactLogValue,
  resultForErrorCode,
  type LogRecord,
} from "./logger.ts";

/** Forma real del texto plano de un enlace: `${uuid}.${secreto}`, donde el
 * secreto es `randomBytes(32).toString("base64url")` — 43 caracteres del
 * alfabeto [A-Za-z0-9_-], que INCLUYE el guion. */
const UUID = "550e8400-e29b-41d4-a716-446655440000";
const SECRETO_CON_DIGITOS = "xKp2mQ7vRt4nB-12-3456-78ZwLcHdEfGjIkMnOpQrStU";
const SECRETO_TIPICO = "aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789_-abcXY";

describe("redactLogValue — orden de redacción", () => {
  it("no deja fragmentos de un secreto que contiene una corrida de dígitos", () => {
    const salida = String(redactLogValue(SECRETO_CON_DIGITOS));
    expect(salida).toBe("[token]");
    // La aserción que de verdad importa: ni un pedazo reconocible del
    // secreto sobrevive.
    expect(salida).not.toContain("xKp2mQ7vRt4nB");
    expect(salida).not.toContain("ZwLcHdEfGjIkMnOpQrStU");
  });

  it("redacta el secreto en el formato real del enlace `${uuid}.${secreto}`", () => {
    const salida = String(redactLogValue(`${UUID}.${SECRETO_TIPICO}`));
    expect(salida).toBe(`${UUID}.[token]`);
    expect(salida).not.toContain("aBcDeFgHiJkLmNoPqRsTuVwXyZ");
  });

  it("redacta un email completo aunque su local-part supere el umbral de token", () => {
    // Si `token` corriera antes que `email`, esto quedaría como
    // `[token]@ejemplo.com` y el dominio seguiría filtrándose.
    const largo = "unlocalpartemuylargoquepasadetreintaydos@ejemplo.com";
    expect(redactLogValue(largo)).toBe("[email]");
  });

  it("redacta un email cuyo local-part tiene forma de teléfono", () => {
    // Si `phone` corriera antes que `email`: `[phone]@x.com`.
    expect(redactLogValue("5555555555@x.com")).toBe("[email]");
  });
});

describe("redactLogValue — identificadores y datos personales", () => {
  it("deja intacto un uuid suelto", () => {
    // El patrón de teléfono mordía la cola del uuid antes de anclarse:
    // `550e8400-e29b-41d4-a[phone]`.
    expect(redactLogValue(`caso ${UUID} abierto`)).toBe(`caso ${UUID} abierto`);
  });

  it("redacta teléfonos en los formatos que este sistema recibe", () => {
    expect(String(redactLogValue("tel +502 5555-4433 fijo"))).toContain("[phone]");
    expect(redactLogValue("5555-4433")).toBe("[phone]");
  });

  it("redacta un email normal", () => {
    expect(redactLogValue("contacto juan.perez@taller.gt hoy")).toBe("contacto [email] hoy");
  });

  it("no toca valores que no son cadenas", () => {
    expect(redactLogValue(42)).toBe(42);
    expect(redactLogValue(true)).toBe(true);
    expect(redactLogValue(null)).toBe(null);
  });

  it("no redacta un número corto inocuo", () => {
    expect(redactLogValue("duracion 1234 ms")).toBe("duracion 1234 ms");
  });
});

describe("createLogger", () => {
  const opciones = (sink: ReturnType<typeof memorySink>) => ({
    app: "web" as const,
    environment: "test",
    sink,
    now: () => new Date("2026-08-03T00:00:00.000Z"),
  });

  it("emite un registro cerrado con nivel, app, environment y timestamp", () => {
    const sink = memorySink();
    createLogger(opciones(sink)).info({ event: "case.created", result: "succeeded" });

    expect(sink.records).toHaveLength(1);
    const r = sink.records[0] as LogRecord;
    expect(r.level).toBe("info");
    expect(r.app).toBe("web");
    expect(r.environment).toBe("test");
    expect(r.at).toBe("2026-08-03T00:00:00.000Z");
    expect(r.event).toBe("case.created");
    expect(r.result).toBe("succeeded");
  });

  it("redacta `extra` pero NO los campos de primer nivel", () => {
    const sink = memorySink();
    createLogger(opciones(sink)).warn({
      event: "authorization.verify_failed",
      // Referencias seguras: se conservan tal cual, son lo que permite
      // correlacionar.
      actorId: UUID,
      organizationId: "8f14e45f-ceea-467a-9ba6-1e4b0e5d3c2a",
      extra: { intento: `${UUID}.${SECRETO_TIPICO}`, nota: "cliente juan@taller.gt" },
    });

    const r = sink.records[0] as LogRecord;
    expect(r.actorId).toBe(UUID);
    expect(r.organizationId).toBe("8f14e45f-ceea-467a-9ba6-1e4b0e5d3c2a");
    expect(r.extra?.intento).toBe(`${UUID}.[token]`);
    expect(r.extra?.nota).toBe("cliente [email]");
  });

  it("no serializa claves ausentes", () => {
    const sink = memorySink();
    createLogger(opciones(sink)).debug({ event: "ping" });

    const r = sink.records[0] as LogRecord;
    expect(Object.keys(r)).not.toContain("requestId");
    expect(Object.keys(r)).not.toContain("errorCode");
    expect(Object.keys(r)).not.toContain("extra");
  });

  it("child() arrastra los campos base y los sobrescribibles ganan en la llamada", () => {
    const sink = memorySink();
    const raiz = createLogger(opciones(sink));
    const porPeticion = raiz.child({ requestId: "req-1", correlationId: "corr-1" });

    porPeticion.info({ event: "a" });
    porPeticion.child({ command: "CreateCaseFromIntake" }).error({
      event: "b",
      correlationId: "corr-2",
      errorCode: "CONFLICT",
    });

    expect(sink.records[0]?.requestId).toBe("req-1");
    expect(sink.records[0]?.correlationId).toBe("corr-1");
    expect(sink.records[1]?.requestId).toBe("req-1");
    expect(sink.records[1]?.command).toBe("CreateCaseFromIntake");
    expect(sink.records[1]?.correlationId).toBe("corr-2");
    expect(sink.records[1]?.errorCode).toBe("CONFLICT");
  });

  it("child() no contamina al logger padre", () => {
    const sink = memorySink();
    const raiz = createLogger(opciones(sink));
    raiz.child({ requestId: "req-1" }).info({ event: "hijo" });
    raiz.info({ event: "padre" });

    expect(sink.records[1]?.requestId).toBeUndefined();
  });
});

describe("jsonLineSink", () => {
  it("escribe exactamente una línea JSON parseable por registro", () => {
    const lineas: string[] = [];
    createLogger({
      app: "worker",
      environment: "test",
      sink: jsonLineSink((l) => lineas.push(l)),
    }).info({ event: "outbox.claimed", durationMs: 12 });

    expect(lineas).toHaveLength(1);
    expect(lineas[0]).not.toContain("\n");
    const parsed = JSON.parse(lineas[0] as string) as LogRecord;
    expect(parsed.app).toBe("worker");
    expect(parsed.event).toBe("outbox.claimed");
    expect(parsed.durationMs).toBe(12);
  });
});

describe("resultForErrorCode", () => {
  it("separa denegación de fallo técnico, conflicto y no-encontrado", () => {
    // Sección 13 pide contar denegaciones aparte: un FORBIDDEN es el sistema
    // funcionando, no el sistema roto.
    expect(resultForErrorCode("FORBIDDEN")).toBe("denied");
    expect(resultForErrorCode("MEMBERSHIP_INACTIVE")).toBe("denied");
    expect(resultForErrorCode("BRANCH_DENIED")).toBe("denied");
    expect(resultForErrorCode("TOKEN_INVALID")).toBe("denied");
    expect(resultForErrorCode("CONFLICT")).toBe("conflict");
    expect(resultForErrorCode("NOT_FOUND")).toBe("not_found");
    expect(resultForErrorCode("VALIDATION")).toBe("failed");
  });
});
