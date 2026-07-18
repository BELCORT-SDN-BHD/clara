/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Same-origin dev proxy for the Clara runtime (Slice-4 chat page). The runtime
  // serves no CORS headers, so when NEXT_PUBLIC_CLARA_RUNTIME_URL is EMPTY the
  // browser calls these paths on the dashboard origin and Next proxies them
  // server-side. Set NEXT_PUBLIC_CLARA_RUNTIME_URL only for a CORS-enabled
  // runtime deployment (then the client calls it directly).
  async rewrites() {
    const runtime = process.env.CLARA_RUNTIME_PROXY_URL || process.env.NEXT_PUBLIC_CLARA_RUNTIME_URL || "http://localhost:3200";
    return [
      { source: "/api/chat/:path*", destination: `${runtime}/api/chat/:path*` },
      { source: "/api/tasks/:path*", destination: `${runtime}/api/tasks/:path*` },
    ];
  },
};

export default nextConfig;
