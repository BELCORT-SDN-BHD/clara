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
      // Slice-5 intake (INTERFACE-PINS 3). Begin-intake (JSON) ALWAYS rides this
      // same-origin proxy — only the byte PUT + finalize routes get CORS on the Fly
      // origin, so begin-intake must not go cross-origin. The browser sends the byte
      // PUT/finalize DIRECT to ${NEXT_PUBLIC_CLARA_RUNTIME_URL} when it is set
      // (bypassing the 4.5MB serverless body cap); when it is empty they fall back
      // through this proxy, which is safe ONLY for a LOCAL runtime.
      { source: "/api/intake/:path*", destination: `${runtime}/api/intake/:path*` },
    ];
  },
};

export default nextConfig;
