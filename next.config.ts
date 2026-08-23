import type { NextConfig } from "next";

const supabaseHost = "https://bnsfrotpjbfgkwjfydbk.supabase.co";
const supabaseWs = "wss://bnsfrotpjbfgkwjfydbk.supabase.co";
const productionOrigin = "https://bakery-system-v2.vercel.app";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // applies to EVERY route — overrides Vercel's platform default of "*"
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              `connect-src 'self' ${supabaseHost} ${supabaseWs}`,
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              `img-src 'self' data: ${supabaseHost}`,
              "font-src 'self' data:",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // moved here from the /api-only block below — this is what actually
          // overrides Vercel's default "*" on every route, including /login
          { key: "Access-Control-Allow-Origin", value: productionOrigin },
        ],
      },
      {
        // API-specific CORS details only relevant for actual API routes
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Methods", value: "GET, POST, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization" },
        ],
      },
      {
        // Never cache the root/redirect page
        source: "/",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, private" },
        ],
      },
      {
        // Never cache the login page
        source: "/login",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, private" },
        ],
      },
      {
        // Never cache the dashboard
        source: "/dashboard/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, private" },
        ],
      },
      {
        // Other authenticated/sensitive pages: same treatment as before
        source: "/(pos|transactions|expenses|purchase-orders|reservations|inventory|products|ingredients|staff|audit-logs|analytics)/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store, must-revalidate" },
        ],
      },
      {
        // Static build assets: content-hashed filenames, safe to cache
        // aggressively and immutably — the filename itself changes on
        // rebuild, so there's no staleness risk
        source: "/_next/static/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};

export default nextConfig;