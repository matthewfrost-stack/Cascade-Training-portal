import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  // Force HTTPS for two years, including subdomains.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Content-Security-Policy", value: buildContentSecurityPolicy() },
];

// The app loads nothing from third-party sites: all scripts, styles and fonts
// are self-hosted and the browser only talks to this domain and Supabase.
// 'unsafe-inline' is needed for Next.js's inline bootstrap scripts and the
// theme script in layout.tsx. If a new feature needs an outside resource,
// add its origin to the matching directive here.
function buildContentSecurityPolicy(): string {
  const isDevServer = process.env.NODE_ENV === "development";
  // Vercel's preview toolbar (comments/feedback) only runs on preview deploys.
  const isVercelPreview = process.env.VERCEL_ENV === "preview";
  const vercelLive = isVercelPreview ? " https://vercel.live" : "";

  return [
    "default-src 'self'",
    // React's dev server uses eval for debugging; never allowed in production.
    `script-src 'self' 'unsafe-inline'${isDevServer ? " 'unsafe-eval'" : ""}${vercelLive}`,
    `style-src 'self' 'unsafe-inline'${vercelLive}`,
    "img-src 'self' data: blob: https:",
    `font-src 'self' data:${vercelLive}`,
    `connect-src 'self' https://*.supabase.co wss://*.supabase.co${isDevServer ? " ws:" : ""}${isVercelPreview ? " https://vercel.live wss://ws-us3.pusher.com" : ""}`,
    `frame-src 'self'${vercelLive}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    ...(isDevServer ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Automatic memoisation of components and hooks: fewer unnecessary
  // re-renders without hand-written useMemo/useCallback.
  reactCompiler: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
