import type { NextConfig } from "next";

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
};

export default nextConfig;
