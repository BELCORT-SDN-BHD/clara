/** @type {import('next').NextConfig} */

// STATIC_EXPORT=1 → a fully static build (`out/`) for Cloudflare Pages hosting.
// In that mode the same-origin `/api/*` proxy is served by a Cloudflare Pages
// Function (`functions/api/[[path]].js`) instead of Next rewrites, so no CORS
// rework and no runtime change is needed (Workers' 100MB body limit also removes
// Vercel's 4.5MB upload-split constraint). Plain `next dev` / SSR keeps the Next
// rewrites below for local development.
const isExport = process.env.STATIC_EXPORT === "1";

const nextConfig = {
  reactStrictMode: true,
  ...(isExport
    ? { output: "export" }
    : {
        async rewrites() {
          const runtime =
            process.env.CLARA_RUNTIME_PROXY_URL ||
            process.env.NEXT_PUBLIC_CLARA_RUNTIME_URL ||
            "http://localhost:3200";
          return [
            { source: "/api/chat/:path*", destination: `${runtime}/api/chat/:path*` },
            { source: "/api/tasks/:path*", destination: `${runtime}/api/tasks/:path*` },
            { source: "/api/intake/:path*", destination: `${runtime}/api/intake/:path*` },
            // Wave B (settled dashboard plan F6): the interview + document-lane routes
            // stay same-origin; production rides the Pages Function catch-all already.
            { source: "/api/interview/:path*", destination: `${runtime}/api/interview/:path*` },
            { source: "/api/opening/:path*", destination: `${runtime}/api/opening/:path*` },
            { source: "/api/seeding/:path*", destination: `${runtime}/api/seeding/:path*` },
          ];
        },
      }),
};

export default nextConfig;
