// Declaraciones de tipos para `security-headers.mjs`.
//
// El módulo se escribió en `.mjs` (no `.ts`) por una razón concreta:
// `next.config.ts` lo carga en tiempo de configuración, antes de que exista
// cualquier pipeline de compilación de TypeScript del workspace, así que
// debe ser JavaScript ejecutable tal cual. Este `.d.mts` le da a
// `tsc --noEmit` (el gate real de tipos, ver `apps/web/next.config.ts`) la
// forma exacta del módulo, para que ambas apps sigan pasando typecheck.

export interface SecurityHeader {
  key: string;
  value: string;
}

/** Cabeceras aplicables a toda ruta. `isDev` = `next dev`. */
export function buildBaseSecurityHeaders(isDev: boolean): SecurityHeader[];

/** Cabeceras de "nunca cachear" para contenido sensible. */
export function buildNoStoreHeaders(): SecurityHeader[];

/** `buildNoStoreHeaders()` + `Referrer-Policy: no-referrer`, para `/a/[token]`. */
export function buildTokenPathHeaders(): SecurityHeader[];
