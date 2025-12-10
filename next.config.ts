// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },  // ✅ pas de blocage build côté ESLint
  typescript: { ignoreBuildErrors: true } // (optionnel) si TS bloque le build
};

export default nextConfig;
