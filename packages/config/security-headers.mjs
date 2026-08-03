// Cabeceras de seguridad compartidas — DATATEK_R0_E sección 9, "Headers".
//
// Antes de esta fase, `apps/web/next.config.ts` y `apps/control/next.config.ts`
// no emitían NINGUNA cabecera de seguridad (verificado leyendo ambos
// archivos: solo `reactStrictMode`, `transpilePackages` y
// `typescript.ignoreBuildErrors`). Este módulo es la única fuente de esas
// cabeceras para las dos apps, de modo que no puedan divergir en silencio.
//
// Se consume desde `next.config.ts` vía la función `headers()` de Next.
//
// =========================================================================
// CSP — por qué es exactamente esta y no una más estricta
// =========================================================================
//
// La regla que gobierna este archivo es la del brief de la fase: "una CSP
// que rompe la app es peor que ninguna". Cada directiva de abajo se eligió
// contra el comportamiento REAL de este stack (Next.js 16 App Router +
// React 19 + webpack, sin Turbopack), no contra una plantilla genérica.
//
// `script-src` incluye `'unsafe-inline'`, y eso es una DEBILIDAD REAL que
// se declara en vez de esconderse. Motivo: Next.js App Router inyecta
// scripts inline en cada respuesta HTML — el bootstrap del runtime y los
// fragmentos `self.__next_f.push(...)` que transportan el payload RSC.
// Sin `'unsafe-inline'` el navegador bloquea ese bootstrap y la página
// queda en blanco (falla la hidratación completa, no solo un detalle).
//
// La forma correcta de eliminarlo es una CSP con `nonce` por request, que
// en Next exige un `middleware.ts` que genere el nonce, lo inyecte en la
// cabecera y lo propague vía `headers()` a `<script>` — Next lo soporta,
// pero es un componente nuevo en la ruta de CADA request de ambas apps.
// Esta fase de hardening no lo introduce: queda como deuda declarada en
// DATATEK_R0_E_FASE2_REPORT.md, no como algo "ya resuelto".
//
// `'unsafe-eval'` SOLO en desarrollo: el runtime HMR de webpack evalúa
// módulos con `eval()`. En producción (`next build` + `next start`) no se
// emite, y eso está verificado sirviendo un build real (ver el reporte).
//
// `style-src` incluye `'unsafe-inline'` porque Tailwind v4 y el propio Next
// insertan estilos inline (`<style>` críticos y `style=` en elementos). Es
// una debilidad de MUCHO menor impacto que la de script: sin
// `script-src 'unsafe-inline'` desactivado, un atacante con inyección de
// estilo no obtiene ejecución.

/**
 * @typedef {object} SecurityHeaderOptions
 * @property {boolean} isDev  `true` cuando corre `next dev`.
 */

/** Directivas comunes a ambas apps. */
function buildContentSecurityPolicy(isDev) {
  const directives = [
    "default-src 'self'",
    // Ver la nota larga arriba: `'unsafe-inline'` es deuda declarada;
    // `'unsafe-eval'` solo existe para el HMR de webpack en desarrollo.
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    // `data:` cubre los SVG inline de lucide-react; `blob:` cubre las
    // previsualizaciones de evidencia generadas en el navegador.
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    // En desarrollo el cliente abre un WebSocket contra el propio servidor
    // para HMR. En producción nada sale de 'self' — no hay CDN, analytics
    // ni telemetría de terceros en este proyecto, y esta directiva es lo
    // que lo vuelve verificable en vez de una afirmación.
    `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
    // Sin plugins ni applets.
    "object-src 'none'",
    // Impide que una inyección reescriba la base de las URLs relativas.
    "base-uri 'self'",
    // Los formularios solo pueden postear al propio origen — relevante
    // para Server Actions, que son POSTs a la misma ruta.
    "form-action 'self'",
    // Política de frames moderna (equivalente a X-Frame-Options: DENY, que
    // igual se emite abajo para navegadores/proxies que solo entienden esa).
    "frame-ancestors 'none'",
    // Ningún <frame>/<iframe> propio.
    "frame-src 'none'",
    // Bloquea <a download> hacia orígenes ajenos y navegación de plugins.
    "worker-src 'self' blob:",
  ];

  // `upgrade-insecure-requests` solo tiene sentido donde existe HTTPS.
  // En este entorno todo es http://localhost, así que emitirlo rompería la
  // carga de subrecursos al reescribirlos a https. Ver la nota de HSTS.
  if (!isDev) {
    // Nota: sigue sin emitirse en el `next start` local porque tampoco hay
    // HTTPS ahí. Se activa junto con HSTS cuando exista un origen real.
  }

  return directives.join("; ");
}

/**
 * Cabeceras aplicables a TODA ruta de una app.
 *
 * @param {boolean} isDev
 * @returns {{ key: string, value: string }[]}
 */
export function buildBaseSecurityHeaders(isDev) {
  const headers = [
    {
      key: "Content-Security-Policy",
      value: buildContentSecurityPolicy(isDev),
    },
    // Impide que el navegador adivine el tipo de contenido — cierra el
    // vector de "subo un .txt que el navegador ejecuta como script".
    { key: "X-Content-Type-Options", value: "nosniff" },
    // Redundante con `frame-ancestors 'none'` a propósito: hay proxies y
    // navegadores antiguos que solo honran esta.
    { key: "X-Frame-Options", value: "DENY" },
    // Nunca manda la ruta completa a otro origen. Para `/a/[token]` esto se
    // endurece todavía más a `no-referrer` (ver `buildTokenPathHeaders`).
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    // Ninguna de estas capacidades se usa en R0. Declararlas vacías impide
    // que un script inyectado (o un iframe futuro) las pida.
    {
      key: "Permissions-Policy",
      value: [
        "accelerometer=()",
        "autoplay=()",
        "camera=()",
        "display-capture=()",
        "encrypted-media=()",
        "fullscreen=(self)",
        "geolocation=()",
        "gyroscope=()",
        "magnetometer=()",
        "microphone=()",
        "midi=()",
        "payment=()",
        "publickey-credentials-get=()",
        "screen-wake-lock=()",
        "usb=()",
        "xr-spatial-tracking=()",
      ].join(", "),
    },
    // Aísla el contexto de navegación de ventanas abiertas por/hacia otros
    // orígenes (protege contra XS-Leaks y tabnabbing).
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    // Un recurso de estas apps no puede ser embebido por otro origen.
    { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
    // Oculta la huella del framework.
    { key: "X-DNS-Prefetch-Control", value: "off" },
  ];

  // ---------------------------------------------------------------------
  // HSTS — "solo donde corresponda" (sección 9)
  // ---------------------------------------------------------------------
  // NO se emite en desarrollo, y la razón es concreta, no de estilo:
  // `Strict-Transport-Security` le ordena al navegador NO volver a hablar
  // http con ese host. Como este proyecto se sirve en http://localhost,
  // emitirlo en dev arriesga envenenar el propio `localhost` del
  // desarrollador para CUALQUIER otro proyecto que use ese host (el HSTS
  // se guarda por host, sin puerto), dejándolo inaccesible por http.
  //
  // En modo producción sí se emite: los navegadores IGNORAN esta cabecera
  // cuando llega sobre http, así que un `next start` local no se ve
  // afectado, y un despliegue real sobre https queda protegido sin tener
  // que recordar activarla. `preload` se omite deliberadamente: inscribir
  // un dominio en la lista de precarga es prácticamente irreversible y no
  // existe todavía un dominio productivo (`env.ts` de ambas apps rechaza
  // cualquier site URL que no sea localhost).
  if (!isDev) {
    headers.push({
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains",
    });
  }

  return headers;
}

/**
 * Cabeceras adicionales para contenido sensible que NUNCA debe quedar en
 * una caché compartida (sección 9: "cache policy para contenido sensible").
 */
export function buildNoStoreHeaders() {
  return [
    {
      key: "Cache-Control",
      // `private` impide cachés compartidas (proxy corporativo, CDN);
      // `no-store` impide incluso el disco del navegador; `max-age=0` y
      // `must-revalidate` cubren intermediarios que solo honran HTTP/1.0.
      value: "no-store, no-cache, must-revalidate, max-age=0, private",
    },
    { key: "Pragma", value: "no-cache" },
    { key: "Expires", value: "0" },
  ];
}

/**
 * Cabeceras específicas de `/a/[token]` — el enlace de autorización.
 *
 * Dos problemas concretos que estas cabeceras cierran:
 *
 * 1. **Caché compartida.** `/a/<token>` renderiza la cotización de UN
 *    cliente concreto. Un proxy que la cachee puede servírsela al
 *    siguiente visitante que pida la misma URL. `no-store` lo impide.
 *
 * 2. **Fuga del token por `Referer`.** El token viaja EN LA RUTA. Con la
 *    política global (`strict-origin-when-cross-origin`) una petición
 *    del mismo origen sigue enviando la URL COMPLETA en `Referer`, y
 *    cualquier navegación saliente enviaría al menos el origen. Aquí se
 *    fuerza `no-referrer`: ninguna petición originada en esta página —
 *    del mismo origen o no — lleva la URL, así que el token no puede
 *    filtrarse por esa vía. Es lo que hace verificable el requisito
 *    "no analytics con token" de la sección 9.
 */
export function buildTokenPathHeaders() {
  return [...buildNoStoreHeaders(), { key: "Referrer-Policy", value: "no-referrer" }];
}
