// Política de cookie de sesión de Control — DATATEK_R0_E sección 9,
// "Sesión y cookies", requisito "Control separado".
//
// La separación respecto de apps/web es de TRES clases, no solo de nombre:
//
// 1. **Nombre distinto** — `dtek_control_actor` vs `dtek_actor`. Esto ya
//    existía desde R0-C y es lo que impide el cruce más obvio. Importa más
//    de lo que parece: en `localhost` las cookies NO se aíslan por puerto,
//    así que Pro (`:3000`) y Control (`:3001`) comparten espacio de
//    cookies. Si ambas apps hubieran usado el mismo nombre, entrar a
//    Control habría sobrescrito la sesión de Pro y viceversa. Con nombres
//    distintos cada app solo lee la suya.
// 2. **`sameSite: "strict"`** (aquí) vs `"lax"` (Pro/Pass). Control no se
//    alcanza nunca desde un enlace externo — no hay flujo legítimo en el
//    que alguien llegue a Control desde WhatsApp o desde otro sitio. Al no
//    necesitar la excepción que obliga a `"lax"` en Pro, se aplica la
//    política más restrictiva: la cookie no viaja en NINGUNA navegación
//    iniciada por otro sitio, ni siquiera un GET de nivel superior.
// 3. **Expiración más corta** — 1 hora contra 8. Control opera sobre datos
//    de MÚLTIPLES organizaciones bajo elevación temporal de soporte; una
//    sesión de plataforma olvidada abierta es un riesgo mayor que una
//    sesión de taller olvidada. La ventana corta es la "expiración
//    diferenciada" que pide la sección 9, y está alineada con el modelo de
//    `support_access_sessions` (elevación acotada en el tiempo, R0-C).
//
// Rotación/revocación y el límite honesto de la cookie fixture sin firmar
// son idénticos a los de `apps/web/src/lib/session-cookie.ts` — ver el
// comentario largo de ese archivo.

/** Ventana de sesión de plataforma: deliberadamente corta. */
export const CONTROL_SESSION_MAX_AGE_SECONDS = 60 * 60;

export interface ControlSessionCookieOptions {
  httpOnly: true;
  sameSite: "strict";
  secure: boolean;
  path: "/";
  maxAge: number;
}

export function buildControlSessionCookieOptions(
  isProduction: boolean,
): ControlSessionCookieOptions {
  return {
    httpOnly: true,
    sameSite: "strict",
    secure: isProduction,
    path: "/",
    maxAge: CONTROL_SESSION_MAX_AGE_SECONDS,
  };
}

export function buildClearedControlSessionCookieOptions(
  isProduction: boolean,
): ControlSessionCookieOptions {
  return { ...buildControlSessionCookieOptions(isProduction), maxAge: 0 };
}
