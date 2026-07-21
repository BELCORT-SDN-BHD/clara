// Cloudflare Pages Function — same-origin proxy for the Clara runtime.
//
// The dashboard is a static SPA (Cloudflare Pages). The browser calls the runtime
// API on the dashboard's OWN origin (`/api/chat|tasks|intake/*`); this Function
// forwards each request to the Fly runtime with headers + body + streaming intact,
// so there is no CORS to configure and the auth header / SSE stream / byte uploads
// pass through unchanged. Workers' 100MB request limit comfortably covers invoice
// uploads (Vercel's 4.5MB serverless cap — the reason the old build split uploads
// to a direct CORS path — does not apply here).
//
// Runtime origin comes from the Pages env var CLARA_RUNTIME_ORIGIN (set in the
// Cloudflare Pages project); it falls back to the production Fly host.
export async function onRequest(context) {
  const { request, env } = context;
  const origin = (env.CLARA_RUNTIME_ORIGIN || "https://clara-runtime.fly.dev").replace(/\/+$/, "");
  const url = new URL(request.url);
  const target = origin + url.pathname + url.search;

  // Clone method/headers/body; preserve streaming (SSE responses, large uploads).
  const proxied = new Request(target, {
    method: request.method,
    headers: request.headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
    redirect: "manual",
  });
  // Workers needs duplex:'half' to stream a request body to the upstream fetch.
  if (proxied.body) {
    try { proxied.duplex = "half"; } catch { /* older runtimes ignore */ }
  }
  return fetch(proxied);
}
