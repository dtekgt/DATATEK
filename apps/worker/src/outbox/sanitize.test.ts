// Sanitización de errores — DATATEK_R0_E sección 8 ("error sanitizado") y
// sección 9 ("errores sin stack/PII").
//
// `outbox_messages.last_error` sobrevive al incidente que lo produjo y la
// lee un humano. Estos tests son la evidencia de que nada sensible llega
// a esa columna.
import { describe, it } from "node:test";
import { expect } from "expect";
import { MAX_SANITIZED_ERROR_LENGTH, OPAQUE_ERROR_TEXT, sanitizeOutboxError } from "./sanitize.ts";

describe("sanitizeOutboxError", () => {
  it("nunca incluye el stack trace, ni siquiera parcialmente", () => {
    const error = new Error("fallo al notificar");
    // Un stack real, con rutas y nombres de función.
    error.stack = [
      "Error: fallo al notificar",
      "    at recordLocalNotificationAttempt (C:\\Users\\Dominic\\app\\worker.ts:120:11)",
      "    at OutboxWorker.processOne (C:\\Users\\Dominic\\app\\worker.ts:210:7)",
    ].join("\n");

    const result = sanitizeOutboxError(error);
    expect(result).toBe("fallo al notificar");
    expect(result).not.toContain("at ");
    expect(result).not.toContain("worker.ts");
    expect(result).not.toContain("C:\\Users");
  });

  it("redacta email", () => {
    const result = sanitizeOutboxError(new Error("no se pudo enviar a juan.perez@ejemplo.com"));
    expect(result).toContain("[email]");
    expect(result).not.toContain("juan.perez@ejemplo.com");
  });

  it("redacta teléfono", () => {
    const result = sanitizeOutboxError(new Error("número inválido: +502 5555 1234"));
    expect(result).toContain("[phone]");
    expect(result).not.toContain("5555 1234");
  });

  it("redacta un token de autorización con la forma `id.secreto`", () => {
    const token = "tok-01HZX9ABCDEF.Zm9vYmFyYmF6cXV1eDEyMzQ1Njc4OTBhYmNkZWY";
    const result = sanitizeOutboxError(new Error(`token rechazado: ${token}`));
    expect(result).toContain("[token]");
    expect(result).not.toContain("Zm9vYmFyYmF6");
  });

  it("redacta un JWT", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
    const result = sanitizeOutboxError(new Error(`credencial: ${jwt}`));
    expect(result).not.toContain("eyJzdWIiOiIxMjM0NTY3ODkwIn0");
  });

  it("redacta un hash largo", () => {
    const hash = "a".repeat(64);
    const result = sanitizeOutboxError(new Error(`hash no coincide ${hash}`));
    expect(result).toContain("[hash]");
    expect(result).not.toContain(hash);
  });

  it("redacta rutas de Windows y POSIX", () => {
    expect(sanitizeOutboxError(new Error("no existe C:\\Users\\Dominic\\secreto.txt"))).toContain(
      "[path]",
    );
    expect(sanitizeOutboxError(new Error("no existe /home/dominic/secreto.txt"))).toContain(
      "[path]",
    );
  });

  it("redacta URLs", () => {
    const result = sanitizeOutboxError(
      new Error("falló POST https://api.ejemplo.com/v1/send?to=x"),
    );
    expect(result).toContain("[url]");
    expect(result).not.toContain("api.ejemplo.com");
  });

  it("colapsa saltos de línea a una sola línea", () => {
    const result = sanitizeOutboxError(new Error("primera línea\nsegunda línea\n\ttercera"));
    expect(result).not.toContain("\n");
    expect(result).toBe("primera línea segunda línea tercera");
  });

  it("trunca al tope y marca el corte", () => {
    const result = sanitizeOutboxError(new Error("x".repeat(500)));
    expect(result.length).toBeLessThanOrEqual(MAX_SANITIZED_ERROR_LENGTH);
    expect(result.endsWith("…")).toBe(true);
  });

  it("nunca serializa un objeto arbitrario lanzado", () => {
    // Este es el camino por el que un payload con PII llegaría a la columna.
    const thrown = { name: "ProviderError", email: "cliente@ejemplo.com", token: "abc.def" };
    const result = sanitizeOutboxError(thrown);
    expect(result).toBe("error tipo ProviderError");
    expect(result).not.toContain("cliente@ejemplo.com");
  });

  it("ignora `cause`, que suele traer el payload original", () => {
    const error = new Error("fallo de envío", {
      cause: new Error("destinatario cliente@ejemplo.com rechazado"),
    });
    const result = sanitizeOutboxError(error);
    expect(result).toBe("fallo de envío");
    expect(result).not.toContain("cliente@ejemplo.com");
  });

  it("degrada a un texto opaco cuando no queda nada seguro", () => {
    expect(sanitizeOutboxError(null)).toBe(OPAQUE_ERROR_TEXT);
    expect(sanitizeOutboxError(undefined)).toBe(OPAQUE_ERROR_TEXT);
    expect(sanitizeOutboxError(new Error(""))).toBe(OPAQUE_ERROR_TEXT);
    expect(sanitizeOutboxError({})).toBe(OPAQUE_ERROR_TEXT);
  });

  it("es determinista: la misma entrada agrupa igual", () => {
    const a = sanitizeOutboxError(new Error("proveedor no respondió"));
    const b = sanitizeOutboxError(new Error("proveedor no respondió"));
    expect(a).toBe(b);
  });
});
