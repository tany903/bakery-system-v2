import type { NextConfig } from "next";

const supabaseHost = "https://bnsfrotpjbfgkwjfydbk.supabase.co";
const supabaseWs = "wss://bnsfrotpjbfgkwjfydbk.supabase.co";
const productionOrigin = "https://bakery-system-v2.vercel.app";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
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
        ],
      },
      {
        // CORS: only /api/* needs it, scoped to our own origin — not the whole site
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: productionOrigin },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization" },
        ],
      },
      {
        // Never cache the login page
        source: "/login",
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
        ],
      },
      {
        // Never cache the dashboard
        source: "/dashboard/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
        ],
      },
      {
        // Other authenticated/sensitive pages: same treatment as before
        source: "/(pos|transactions|expenses|purchase-orders|reservations|inventory|products|ingredients|staff|audit-logs|analytics)/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;