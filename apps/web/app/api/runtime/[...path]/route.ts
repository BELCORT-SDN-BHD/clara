import { NextResponse, type NextRequest } from "next/server";

// The same-origin runtime proxy — REPLACES next.config.ts's build-time `rewrites()`
// (independent review 2026-08-27, F1/F2/F3/note16). Two findings drove this:
//
//   F1/F2 (HIGH): a `rewrites()` destination is baked into `.next/routes-manifest.json`
//   at BUILD time — `process.env.NEXT_PUBLIC_CLARA_RUNTIME_URL` is read once, when
//   `next build` runs, and the literal value (the review found `localhost:3200`, the
//   dev fallback) ships in every deployed bundle regardless of the runtime's actual
//   deploy-time env. A Route Handler reads `process.env` at REQUEST time — this file's
//   whole reason to exist.
//
//   F3/note16: a framework `rewrites()` proxy forwards the ENTIRE incoming request
//   (the review measured the full Supabase cookie jar, refresh token included,
//   reaching the runtime). This handler builds a BRAND NEW outbound request and
//   allow-lists exactly three headers in — `authorization`, `content-type`,
//   `content-length` — everything else (Cookie, browser Origin, Referer, …) is
//   dropped by construction, never read off the inbound request at all.
//
// `CLARA_RUNTIME_URL` is SERVER-SIDE ONLY (no `NEXT_PUBLIC_` prefix — never inlined
// into the browser bundle). Absent → a typed 503, never a silent localhost default
// (wire.ts's fail-closed precedent: a missing destination is a configuration fact to
// surface honestly, not to paper over).
//
// Scope: this proxies `/api/runtime/*` to the runtime's `/api/*` — today that is
// exactly the document-intake legs (lib/documents/intake.ts: begin/bytes/finalize)
// and the document-bytes evidence viewer (lib/documents/bytes.ts). It carries no
// per-route allowlist of its own; the runtime is the authority on which paths exist
// (an unknown path 404s from the runtime itself, forwarded verbatim).

function runtimeBase(): string | null {
  const url = process.env.CLARA_RUNTIME_URL;
  if (!url) return null;
  return url.replace(/\/+$/, "");
}

const METHODS_WITH_BODY = new Set(["POST", "PUT", "PATCH"]);

async function proxy(req: NextRequest, path: string[]): Promise<Response> {
  const base = runtimeBase();
  if (!base) {
    return NextResponse.json({ error: "runtime_not_configured" }, { status: 503 });
  }

  const target = `${base}/api/${path.map(encodeURIComponent).join("/")}${req.nextUrl.search}`;

  // Allow-list ONLY these three inbound headers — never a wholesale copy (F3/note16:
  // that is exactly how the old rewrite leaked the Supabase cookie jar).
  const headers = new Headers();
  const authorization = req.headers.get("authorization");
  if (authorization) headers.set("authorization", authorization);
  const contentType = req.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  const contentLength = req.headers.get("content-length");
  if (contentLength) headers.set("content-length", contentLength);

  const hasBody = METHODS_WITH_BODY.has(req.method) && req.body !== null;

  let res: Response;
  try {
    res = await fetch(target, {
      method: req.method,
      headers,
      body: hasBody ? req.body : undefined,
      // Required by the fetch spec whenever a streamed body is supplied (undici/Node
      // fetch and the Cloudflare Workers runtime both enforce this).
      ...(hasBody ? { duplex: "half" as const } : {}),
      redirect: "manual", // never silently follow a redirect into an unexpected origin/shape
      cache: "no-store",
      signal: req.signal,
    });
  } catch {
    return NextResponse.json({ error: "runtime_unreachable" }, { status: 502 });
  }

  // A redirect from the runtime is not a shape this proxy interprets — forward it
  // as an honest opaque failure rather than following it. CLASSIFIED BY STATUS,
  // never by `res.type` (independent review 2026-08-27, R4): "opaqueredirect" is
  // a BROWSER-fetch concept for a manual-redirect response filtered by the
  // Fetch spec's CORS/service-worker machinery — this `fetch` call runs
  // SERVER-SIDE (Node.js/undici, or the Workers runtime once deployed), where a
  // manual-redirect 3xx comes back as an ordinary Response carrying its real
  // status — `res.type` here is never "opaqueredirect", so that check was dead
  // code and a genuine 3xx from the runtime silently fell through to the
  // generic forward below as a bare, bodyless 307.
  if (res.status >= 300 && res.status < 400) {
    return NextResponse.json({ error: "runtime_redirected" }, { status: 502 });
  }

  const outHeaders = new Headers();
  const outContentType = res.headers.get("content-type");
  if (outContentType) outHeaders.set("content-type", outContentType);
  const outContentLength = res.headers.get("content-length");
  if (outContentLength) outHeaders.set("content-length", outContentLength);

  return new Response(res.body, { status: res.status, headers: outHeaders });
}

async function handle(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const { path } = await ctx.params;
  return proxy(req, path);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
