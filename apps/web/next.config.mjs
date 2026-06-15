/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Server Actions are enabled by default in Next 14; keep body limit generous for uploads
    serverActions: {
      bodySizeLimit: "10mb",
    },
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
  // O rastreamento de arquivos (nft) também usa readlink — desabilitado por incompatibilidade do exFAT.
  outputFileTracing: false,
};

export default nextConfig;
