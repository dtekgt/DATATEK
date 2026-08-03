import type { NextConfig } from "next";
// DATATEK_R0_E sección 9 — misma política de cabeceras que apps/web, desde
// la misma fuente única. Control NO tiene `/a/[token]` (el enlace de
// autorización es exclusivo de la app pública), así que aquí no aparece esa
// regla; en cambio TODA la app es contenido sensible de operación
// multiempresa, y por eso el `no-store` se aplica a todas sus rutas.
import {
  buildBaseSecurityHeaders,
  buildNoStoreHeaders,
} from "@datatek/config/security-headers.mjs";

const isDev = process.env.NODE_ENV !== "production";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@datatek/ui", "@datatek/application", "@datatek/domain", "@datatek/auth"],
  typescript: {
    // See apps/web/next.config.ts for why: `pnpm typecheck` is the real gate.
    ignoreBuildErrors: true,
  },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: buildBaseSecurityHeaders(isDev),
      },
      {
        // Control muestra datos de tenants a personal de plataforma bajo
        // elevación temporal. Nada de eso debe quedar en una caché que
        // sobreviva a la sesión elevada.
        source: "/:path*",
        headers: buildNoStoreHeaders(),
      },
    ];
  },
};

export default nextConfig;
