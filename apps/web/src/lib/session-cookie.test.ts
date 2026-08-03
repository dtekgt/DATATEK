// Política de cookie de sesión de Pro/Pass — DATATEK_R0_E sección 9.
import { describe, it } from "node:test";
import { expect } from "expect";
import {
  buildClearedSessionCookieOptions,
  buildSessionCookieOptions,
  SESSION_MAX_AGE_SECONDS,
} from "./session-cookie";
import { SESSION_COOKIE_NAME } from "./fixture-session";

describe("cookie de sesión de Pro/Pass", () => {
  it("es httpOnly en todo entorno", () => {
    expect(buildSessionCookieOptions(false).httpOnly).toBe(true);
    expect(buildSessionCookieOptions(true).httpOnly).toBe(true);
  });

  it("declara sameSite explícitamente", () => {
    expect(buildSessionCookieOptions(false).sameSite).toBe("lax");
  });

  it("es `secure` en producción y no en desarrollo (localhost es http)", () => {
    expect(buildSessionCookieOptions(true).secure).toBe(true);
    expect(buildSessionCookieOptions(false).secure).toBe(false);
  });

  it("tiene expiración explícita: un turno de taller", () => {
    expect(SESSION_MAX_AGE_SECONDS).toBe(8 * 60 * 60);
    expect(buildSessionCookieOptions(false).maxAge).toBe(SESSION_MAX_AGE_SECONDS);
  });

  it("la revocación conserva path y atributos, solo vence la cookie", () => {
    const live = buildSessionCookieOptions(true);
    const cleared = buildClearedSessionCookieOptions(true);
    expect(cleared.maxAge).toBe(0);
    expect(cleared.path).toBe(live.path);
    expect(cleared.sameSite).toBe(live.sameSite);
    expect(cleared.secure).toBe(live.secure);
    expect(cleared.httpOnly).toBe(true);
  });

  it("el nombre de la cookie es el de Pro, distinto del de Control", () => {
    // En localhost las cookies NO se aíslan por puerto: si ambas apps
    // usaran el mismo nombre, entrar a una cerraría la sesión de la otra.
    // Este test no puede importar el módulo de Control (otro proyecto
    // TypeScript, fuera del `rootDir` de esta app), así que fija el
    // contrato del lado de web; `apps/control/src/lib/session-cookie.test.ts`
    // fija el otro lado con la misma constante literal.
    expect(SESSION_COOKIE_NAME).toBe("dtek_actor");
    expect(SESSION_COOKIE_NAME).not.toBe("dtek_control_actor");
  });
});
