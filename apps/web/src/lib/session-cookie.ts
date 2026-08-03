// Política de cookie de sesión de Pro/Pass — DATATEK_R0_E sección 9,
// "Sesión y cookies".
//
// Antes de esta fase las opciones de la cookie estaban escritas inline en
// `components/fixture-login-form.tsx` y en ningún otro lugar, así que no
// había forma de probarlas ni de garantizar que un segundo punto de
// escritura usara las mismas. Este módulo es ahora la ÚNICA definición.
//
// ## Qué cambió respecto de R0-C/R0-D
//
// | Atributo    | Antes                              | Ahora |
// |-------------|------------------------------------|-------|
// | `httpOnly`  | `true`                             | `true` (sin cambio) |
// | `secure`    | `NODE_ENV === "production"`        | igual (sin cambio) |
// | `sameSite`  | `"lax"`                            | `"lax"` (sin cambio, ver abajo) |
// | `path`      | `"/"`                              | `"/"` (sin cambio) |
// | expiración  | NINGUNA (cookie de sesión)         | `maxAge` de 8 h |
// | revocación  | inexistente                        | `buildClearedSessionCookie()` |
//
// ## Por qué `sameSite: "lax"` y no `"strict"` aquí
//
// Pass y `/a/[token]` se abren desde enlaces que el cliente recibe FUERA
// del sitio (WhatsApp, SMS). Con `"strict"` la cookie no viajaría en esa
// primera navegación entrante, y una persona que ya tenía sesión de Pro
// aterrizaría como no autenticada al volver por un enlace. `"lax"` sí la
// envía en navegaciones de nivel superior con método GET, que es
// exactamente ese caso, y sigue sin enviarla en POST cross-site — el vector
// clásico de CSRF. Control usa `"strict"` porque no tiene ese requisito
// (ver `apps/control/src/lib/session-cookie.ts`).
//
// ## Expiración diferenciada (requisito literal de la sección 9)
//
// 8 horas: la duración de un turno de taller. Una persona de mostrador
// abre Pro al empezar el día y no debería reautenticarse a media jornada,
// pero la sesión tampoco debe sobrevivir intacta al día siguiente en una
// computadora compartida. Control usa 1 hora — ver ese archivo para el
// razonamiento de por qué es MÁS corta, no igual.
//
// ## Rotación y revocación
//
// - **Rotación**: cada `loginAction` escribe la cookie completa de nuevo,
//   así que reingresar renueva la ventana de 8 h. No hay rotación
//   automática a mitad de sesión: con Supabase Auth real, la rotación la
//   hará el refresh del JWT, no este módulo.
// - **Revocación**: `buildClearedSessionCookie()` produce la instrucción de
//   borrado (`maxAge: 0`). **Hoy ninguna pantalla la invoca** — no existe
//   un botón de "salir" en Pro ni en Control. Eso se declara como deuda en
//   DATATEK_R0_E_FASE2_REPORT.md; el mecanismo queda listo y probado para
//   que la fase que agregue la UI no tenga que inventar la política.
// - **Límite honesto**: esta cookie fixture guarda el id del actor EN CLARO
//   y sin firmar. Cualquiera que pueda escribir una cookie en el navegador
//   puede suplantar a otro actor sembrado. Eso NO es una regresión sino el
//   diseño explícito de R0-C (no hay contraseña: el formulario de login es
//   un selector de actor), y desaparece cuando Supabase Auth emita un JWT
//   firmado. Está declarado en el reporte como riesgo conocido, no como
//   algo resuelto.

/** Ventana de sesión de Pro/Pass: un turno de taller. */
export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

export interface SessionCookieOptions {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: "/";
  maxAge: number;
}

/**
 * Opciones para ESCRIBIR la cookie de sesión.
 *
 * @param isProduction normalmente `process.env.NODE_ENV === "production"`.
 *   Se recibe como parámetro (en vez de leerse aquí) para que los tests
 *   puedan comprobar ambos entornos sin mutar `process.env`.
 */
export function buildSessionCookieOptions(isProduction: boolean): SessionCookieOptions {
  return {
    // Ningún JavaScript de página puede leerla — cierra el robo de sesión
    // por XSS.
    httpOnly: true,
    // Ver la nota larga arriba.
    sameSite: "lax",
    // No se puede exigir siempre: en http://localhost una cookie `Secure`
    // sencillamente no se guarda, y la app quedaría inutilizable en
    // desarrollo. Se activa en cuanto exista un despliegue real.
    secure: isProduction,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

/**
 * Opciones para REVOCAR la cookie. `maxAge: 0` le ordena al navegador
 * descartarla de inmediato. Mantiene el resto de atributos idénticos
 * porque un navegador solo sobrescribe una cookie si `path` (y dominio)
 * coinciden con los de la original.
 */
export function buildClearedSessionCookieOptions(isProduction: boolean): SessionCookieOptions {
  return { ...buildSessionCookieOptions(isProduction), maxAge: 0 };
}
