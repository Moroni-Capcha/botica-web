import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // El proyecto aún no tiene ESLint configurado; los tipos se revisan con `npm run typecheck`.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
