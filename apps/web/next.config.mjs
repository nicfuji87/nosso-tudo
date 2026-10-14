/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Server Actions are enabled by default in Next 14; keep body limit generous for uploads
    serverActions: {
      bodySizeLimit: "10mb",
    },
    // Módulo ML: a composição de criativos (next/og) lê as fontes Geist do disco.
    outputFileTracingIncludes: {
      "/api/ml/**": ["./node_modules/geist/dist/fonts/geist-sans/*.ttf"],
      "/ml/**": ["./node_modules/geist/dist/fonts/geist-sans/*.ttf"],
    },
  },
  // Páginas públicas de produto (destino do Pin): sem iframe, sem formulário, imagens só de hosts conhecidos.
  async headers() {
    return [
      {
        source: "/achados/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'none'; base-uri 'self'; form-action 'none'; object-src 'none'; img-src 'self' data: https://*.mlstatic.com https://*.supabase.co",
          },
        ],
      },
    ];
  },
  images: {
    remotePatterns: [
      // Supabase Storage (avatars, signed URLs)
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
  // O drive é exFAT (sem symlinks); evita readlink (EISDIR) no webpack. Ver ADR 0002.
  webpack: (config) => {
    config.resolve.symlinks = false;
    return config;
  },
  // O rastreamento de arquivos (nft) usa readlink, incompatível com exFAT no build local
  // (Windows). Na Vercel (Linux) o tracing é ESSENCIAL: é o que inclui os
  // client-reference-manifest na função serverless — sem ele, /app quebra em runtime com
  // "Cannot read properties of undefined (reading 'clientModules')". Por isso só desliga local.
  outputFileTracing: process.env.VERCEL ? true : false,
};

export default nextConfig;
