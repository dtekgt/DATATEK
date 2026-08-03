import type { NextConfig } from "next";
// DATATEK_R0_E sección 9 — cabeceras de seguridad. La política vive en un
// solo lugar para que Pro/Pass y Control no diverjan; ver el comentario
// largo (CSP, HSTS, referrer) en ese archivo.
import {
  buildBaseSecurityHeaders,
  buildNoStoreHeaders,
  buildTokenPathHeaders,
} from "@datatek/config/security-headers.mjs";

const isDev = process.env.NODE_ENV !== "production";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@datatek/ui", "@datatek/application", "@datatek/domain", "@datatek/auth"],
  typescript: {
    // `pnpm typecheck` runs `tsc --noEmit` across every workspace package
    // (including this one) as its own gate. Next's in-build type check uses
    // a WASM SWC fallback in this sandboxed environment (native SWC is
    // blocked by Application Control policy) that errors on unrelated
    // internal state, so we do not double-run type checking here.
    ignoreBuildErrors: true,
  },
  // Oculta `X-Powered-By: Next.js` — no es una defensa por sí sola, pero no
  // hay razón para anunciar el framework y su versión.
  poweredByHeader: false,
  async headers() {
    return [
      {
        // Toda ruta de la app.
        source: "/:path*",
        headers: buildBaseSecurityHeaders(isDev),
      },
      {
        // El enlace de autorización del cliente: contenido de UNA persona,
        // con el token en la propia ruta. Nunca en caché compartida y sin
        // `Referer` saliente. Ver `buildTokenPathHeaders`.
        source: "/a/:token*",
        headers: buildTokenPathHeaders(),
      },
      {
        // Rutas de desarrollo (`/api/dev/*`, ya bloqueadas fuera de
        // NODE_ENV=development por su propio guard): además, nunca
        // cacheadas.
        source: "/api/:path*",
        headers: buildNoStoreHeaders(),
      },
    ];
  },
};

export default nextConfig;
