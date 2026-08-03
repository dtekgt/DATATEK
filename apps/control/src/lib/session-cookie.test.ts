// Política de cookie de sesión de Control — DATATEK_R0_E sección 9,
// requisito "Control separado" y "expiración diferenciada".
import { describe, it } from "node:test";
import { expect } from "expect";
import {
  buildClearedControlSessionCookieOptions,
  buildControlSessionCookieOptions,
  CONTROL_SESSION_MAX_AGE_SECONDS,
} from "./session-cookie";
import { CONTROL_SESSION_COOKIE_NAME } from "./fixture-session";

describe("cookie de sesión de Control", () => {
  it("es httpOnly en todo entorno", () => {
    expect(buildControlSessionCookieOptions(false).httpOnly).toBe(true);
    expect(buildControlSessionCookieOptions(true).httpOnly).toBe(true);
  });

  it("usa sameSite `strict` — más restrictivo que Pro/Pass", () => {
    // Control nunca se alcanza desde un enlace externo legítimo, así que no
    // necesita la excepción que obliga a `lax` en Pro.
    expect(buildControlSessionCookieOptions(false).sameSite).toBe("strict");
  });

  it("es `secure` en producción y no en desarrollo", () => {
    expect(buildControlSessionCookieOptions(true).secure).toBe(true);
    expect(buildControlSessionCookieOptions(false).secure).toBe(false);
  });

  it("expira MÁS PRONTO que Pro/Pass (expiración diferenciada)", () => {
    expect(CONTROL_SESSION_MAX_AGE_SECONDS).toBe(60 * 60);
    // 8 h es la ventana de Pro (apps/web/src/lib/session-cookie.ts). Una
    // sesión de plataforma, que puede leer varias organizaciones bajo
    // elevación, debe durar estrictamente menos.
    const PRO_MAX_AGE_SECONDS = 8 * 60 * 60;
    expect(CONTROL_SESSION_MAX_AGE_SECONDS).toBeLessThan(PRO_MAX_AGE_SECONDS);
  });

  it("la revocación conserva path y atributos, solo vence la cookie", () => {
    const live = buildControlSessionCookieOptions(true);
    const cleared = buildClearedControlSessionCookieOptions(true);
    expect(cleared.maxAge).toBe(0);
    expect(cleared.path).toBe(live.path);
    expect(cleared.sameSite).toBe(live.sameSite);
    expect(cleared.secure).toBe(live.secure);
  });

  it("usa un nombre de cookie SEPARADO del de Pro/Pass", () => {
    expect(CONTROL_SESSION_COOKIE_NAME).toBe("dtek_control_actor");
    expect(CONTROL_SESSION_COOKIE_NAME).not.toBe("dtek_actor");
  });
});
