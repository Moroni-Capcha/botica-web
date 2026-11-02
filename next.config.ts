import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // El proyecto aún no tiene ESLint configurado; los tipos se revisan con `npm run typecheck`.
  eslint: { ignoreDuringBuilds: true },
  async headers() {
    return [
      // El service worker nunca debe quedar en la caché del navegador: así una versión nueva se instala al abrir la app.
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
