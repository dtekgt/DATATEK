import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@datatek/ui", "@datatek/application", "@datatek/domain", "@datatek/auth"],
  typescript: {
    // See apps/web/next.config.ts for why: `pnpm typecheck` is the real gate.
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
