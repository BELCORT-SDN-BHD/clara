import { spawn, spawnSync } from "node:child_process";
import { request as httpRequest } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { readFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SignJWT } from "jose";

// serve-live.mjs — a FILE-DISJOINT sibling of ../serve-built.mjs (the house
// pattern this repo already settled on: one door dialog per domain, one serve
// harness per stack shape, never a shared import — see serve-built.mjs's own
// header). Same TLS/HTTPS-proxy shell; two real differences:
//
//   1. `/auth/v1/verify` mints a REAL, validly-signed HS256 JWT (via `jose`,
//      the SAME library packages/runtime/tests/interview-e2e.mjs already uses
//      to mint tokens the runtime accepts) instead of a placeholder signature
//      — signed with CLARA_E2E_JWT_SECRET, matching the runtime's own
//      SUPABASE_JWT_SECRET so the SAME token clears both the runtime's
//      authz.mjs check AND PostgREST's own verification.
//   2. `/rest/v1/*` is proxied to a REAL PostgREST instance
//      (CLARA_E2E_POSTGREST_URL) instead of an in-memory fake — every header
//      (Authorization, Accept-Profile, Content-Profile, Prefer, Range, apikey)
//      passes through UNCHANGED, and the path's `/rest/v1` segment is
//      stripped (PostgREST itself serves resources at its own root — the
//      `/rest/v1` prefix is Supabase's front door, not PostgREST's).
//
// Everything else — the temporary TLS cert, the app-origin HTTPS listener,
// the upstream proxy to `next start` on 3101 — is copied verbatim from
// serve-built.mjs; this file owns no logic those two features don't already
// carry, and re-deriving it here (rather than importing it) keeps the two
// harnesses independently readable and independently disposable, matching
// this repo's own file-disjoint-by-construction precedent.
//
// Required env (set by run-live-walk.mjs before spawning this as Playwright's
// webServer): CLARA_E2E_JWT_SECRET, CLARA_E2E_JWT_ISSUER, CLARA_E2E_JWT_AUD,
// CLARA_E2E_JWT_AUTH_ROLE, CLARA_E2E_OWNER_SUB, CLARA_E2E_POSTGREST_URL.

const e2eRoot = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(e2eRoot, "..", "..");
const appOrigin = process.env.CLARA_E2E_APP_ORIGIN ?? "https://127.0.0.1:3100";
// THE UPSTREAM `next start` PORT IS AN INPUT, not a constant — added FS-7 echelon 2, and it is a
// cross-lane collision fix rather than a preference. This host runs several lanes' e2e harnesses at
// once, and 3101 was hardcoded here and in `../serve-built.mjs` both: a second lane's walk finds the
// port held, Playwright reports only "already used", and the honest remedy is a disjoint port — NOT
// killing whatever holds it, which on a shared host is somebody else's live run.
const NEXT_PORT = String(process.env.CLARA_E2E_NEXT_PORT ?? "3101");
const appUrl = new URL(appOrigin);
const supabaseUrl = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? `${appOrigin}/e2e-supabase`);
const supabasePrefix = supabaseUrl.pathname.replace(/\/$/, "");
const runtimeDir = join(e2eRoot, ".runtime", String(process.pid));
const keyPath = join(runtimeDir, "localhost-key.pem");
const certPath = join(runtimeDir, "localhost-cert.pem");

mkdirSync(runtimeDir, { recursive: true });
const openssl = spawnSync(
  "openssl",
  [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", keyPath, "-out", certPath,
    "-days", "1", "-subj", "/CN=localhost",
    "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1",
    "-addext", "basicConstraints=critical,CA:TRUE",
  ],
  { encoding: "utf8" },
);
if (openssl.status !== 0) {
  throw new Error(`could not create the temporary e2e TLS certificate: ${openssl.stderr.trim()}`);
}

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`serve-live.mjs: ${name} is required (set by run-live-walk.mjs)`);
  return v;
}
const JWT_SECRET = required("CLARA_E2E_JWT_SECRET");
const JWT_ISSUER = required("CLARA_E2E_JWT_ISSUER");
const JWT_AUD = required("CLARA_E2E_JWT_AUD");
const JWT_AUTH_ROLE = required("CLARA_E2E_JWT_AUTH_ROLE");
const OWNER_SUB = required("CLARA_E2E_OWNER_SUB");
const POSTGREST_URL = new URL(required("CLARA_E2E_POSTGREST_URL"));
const key = new TextEncoder().encode(JWT_SECRET);

async function mintAccessToken(sub) {
  return new SignJWT({ role: JWT_AUTH_ROLE })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUD)
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(key);
}

function confirmedUser(sub) {
  return {
    id: sub,
    aud: "authenticated",
    role: "authenticated",
    email: "owner@example.test",
    email_confirmed_at: "2026-08-31T00:00:00.000Z",
    phone: "",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    identities: [],
    created_at: "2026-08-31T00:00:00.000Z",
    updated_at: "2026-08-31T00:00:00.000Z",
    is_anonymous: false,
  };
}

function sendJson(response, status, body, extraHeaders = {}) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...extraHeaders,
  });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function proxyTo(request, response, target, extraHeaders = {}) {
  const headers = { ...request.headers, ...extraHeaders };
  delete headers.host;
  const upstream = httpRequest(
    {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port,
      method: request.method,
      path: `${target.pathname}${target.search}`,
      headers,
    },
    (upstreamResponse) => {
      response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
      upstreamResponse.pipe(response);
    },
  );
  upstream.on("error", (error) => {
    if (!response.headersSent) sendJson(response, 502, { message: error.message });
    else response.destroy(error);
  });
  request.pipe(upstream);
}

async function handleSupabase(request, response, url) {
  const path = url.pathname.slice(supabasePrefix.length);
  console.log(`[e2e-live] ${request.method} ${path}`);
  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "access-control-allow-origin": appOrigin,
      "access-control-allow-credentials": "true",
      "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
      "access-control-allow-headers": "apikey,authorization,content-type,accept-profile,content-profile,prefer,range,x-client-info,x-supabase-api-version",
    });
    response.end();
    return;
  }

  const cors = { "access-control-allow-origin": appOrigin, "access-control-allow-credentials": "true" };

  // /rest/v1/* -> the REAL PostgREST instance. PostgREST serves resources at
  // its own root (no /rest/v1 prefix), so that segment is stripped; every
  // other header (Authorization, Accept-Profile, Content-Profile, Prefer,
  // apikey, Range) rides through unchanged — RLS enforcement is PostgREST's
  // and Postgres's, genuinely exercised, never faked here.
  if (path.startsWith("/rest/v1")) {
    const rest = path.slice("/rest/v1".length) || "/";
    const target = new URL(`${rest}${url.search}`, POSTGREST_URL);
    proxyTo(request, response, target);
    return;
  }

  // THE PASSWORD GRANT — added FS-7 echelon 2, and it is the door every live walk has to use now.
  //
  // WHY, MEASURED RATHER THAN PREFERRED. This harness's only session door was the confirm link
  // below, and the confirm FACE has since moved to a six-digit OTP whose handler runs the C1/C2
  // attempt wall BEFORE `verifyOtp`. That wall's production seam
  // (`app/(entry)/auth/confirm/verify/confirmation-wall.ts`) returns `"unavailable"`
  // unconditionally on this tip — Lane B's runtime route (C-5) is not built — so the confirm face
  // signs NOBODY in, in the browser, today. `interview-walk.spec.ts`'s own `establishSession` is
  // dead for the same reason; this endpoint is what gives both walks a session again.
  //
  // It is the `serve-built.mjs` mock's shape with this file's REAL signed token: the app drives its
  // own `@supabase/ssr` client through its own cookie-writing code exactly as it does against
  // Supabase, so nothing here guesses a cookie format. The password is never checked, because this
  // is a stand-in for the identity PROVIDER — what the walk is testing lives after the session.
  if (request.method === "POST" && path === "/auth/v1/token") {
    sendJson(response, 200, {
      access_token: await mintAccessToken(OWNER_SUB),
      token_type: "bearer",
      expires_in: 7_200,
      expires_at: 4_102_444_800,
      refresh_token: "e2e-live-refresh-token",
      user: confirmedUser(OWNER_SUB),
    }, cors);
    return;
  }

  if (request.method === "POST" && path === "/auth/v1/verify") {
    const body = await readJson(request);
    if (body.type !== "email" || body.token_hash !== "e2e-live-token-hash") {
      sendJson(response, 400, { code: "otp_expired", message: "invalid e2e-live token" }, cors);
      return;
    }
    sendJson(response, 200, {
      access_token: await mintAccessToken(OWNER_SUB),
      token_type: "bearer",
      expires_in: 7_200,
      expires_at: 4_102_444_800,
      refresh_token: "e2e-live-refresh-token",
      user: confirmedUser(OWNER_SUB),
    }, cors);
    return;
  }

  if (request.method === "GET" && path === "/auth/v1/user") {
    sendJson(response, 200, confirmedUser(OWNER_SUB), cors);
    return;
  }

  sendJson(response, 404, { message: `unhandled e2e-live Supabase route: ${request.method} ${path}` }, cors);
}

function publicLocation(location) {
  try {
    const target = new URL(location);
    if (target.port === NEXT_PORT && (target.hostname === "127.0.0.1" || target.hostname === "localhost")) {
      return new URL(`${target.pathname}${target.search}${target.hash}`, appOrigin).toString();
    }
  } catch {
    // Preserve relative and otherwise non-URL Location values exactly.
  }
  return location;
}

const httpsServer = createHttpsServer(
  { key: readFileSync(keyPath), cert: readFileSync(certPath) },
  (request, response) => {
    const url = new URL(request.url ?? "/", appOrigin);
    if (url.pathname === supabasePrefix || url.pathname.startsWith(`${supabasePrefix}/`)) {
      handleSupabase(request, response, url).catch((error) => {
        sendJson(response, 500, { message: error instanceof Error ? error.message : "mock failure" });
      });
      return;
    }

    const headers = { ...request.headers, host: appUrl.host, "x-forwarded-host": appUrl.host, "x-forwarded-proto": "https" };
    const upstream = httpRequest(
      { hostname: "127.0.0.1", port: Number(NEXT_PORT), method: request.method, path: request.url, headers },
      (upstreamResponse) => {
        const responseHeaders = { ...upstreamResponse.headers };
        const location = responseHeaders.location;
        if (typeof location === "string") responseHeaders.location = publicLocation(location);
        response.writeHead(upstreamResponse.statusCode ?? 502, responseHeaders);
        upstreamResponse.pipe(response);
      },
    );
    upstream.on("error", (error) => {
      if (!response.headersSent) sendJson(response, 502, { message: error.message });
      else response.destroy(error);
    });
    request.pipe(upstream);
  },
);

await new Promise((resolveListen, rejectListen) => {
  httpsServer.once("error", rejectListen);
  httpsServer.listen(Number(appUrl.port), appUrl.hostname, resolveListen);
});

const nextBin = join(webRoot, "node_modules", "next", "dist", "bin", "next");
const next = spawn(
  process.execPath,
  [nextBin, "start", "--hostname", "127.0.0.1", "--port", NEXT_PORT],
  { cwd: webRoot, env: { ...process.env, NODE_EXTRA_CA_CERTS: certPath }, stdio: "inherit" },
);

let stopping = false;
function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  next.kill("SIGTERM");
  httpsServer.close(() => {
    rmSync(runtimeDir, { recursive: true, force: true });
    process.exit(exitCode);
  });
  setTimeout(() => process.exit(exitCode), 2_000).unref();
}

next.on("exit", (code, signal) => {
  if (!stopping) {
    console.error(`[e2e-live] next start exited early (${signal ?? code ?? "unknown"})`);
    stop(code ?? 1);
  }
});
process.on("SIGINT", () => stop(130));
process.on("SIGTERM", () => stop(143));
