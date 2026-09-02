import { spawn, spawnSync } from "node:child_process";
import { request as httpRequest } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import {
  mkdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const e2eRoot = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(e2eRoot, "..");
const appOrigin = process.env.CLARA_E2E_APP_ORIGIN ?? "https://127.0.0.1:3100";
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
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    keyPath,
    "-out",
    certPath,
    "-days",
    "1",
    "-subj",
    "/CN=localhost",
    "-addext",
    "subjectAltName=DNS:localhost,IP:127.0.0.1",
    "-addext",
    "basicConstraints=critical,CA:TRUE",
  ],
  { encoding: "utf8" },
);
if (openssl.status !== 0) {
  throw new Error(`could not create the temporary e2e TLS certificate: ${openssl.stderr.trim()}`);
}

const SUBJECT = "11111111-1111-1111-1111-111111111111";
const REQUEST_ID = "22222222-2222-2222-2222-222222222222";
const FIRM_ID = "33333333-3333-4333-8333-333333333333";
const CLIENT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CLIENT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const THREAD_A = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const THREAD_B = "bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb";
const COLLEAGUE_THREAD_A = "cccccccc-1111-4111-8111-cccccccccccc";
// The fixed "delivered" code the SKELETON journey (signup-confirm-pending.
// spec.ts) types once Lane B wires the real attempt wall.
const E2E_SIGNUP_CODE = "654321";
const state = {
  // Default to the membership-less holding-state persona. Navigation specs
  // opt into their fixture rank explicitly through the sign-in email prefix.
  email: "holding@example.test",
  firmName: "E2E Accounting",
  note: null,
  registrationOpen: false,
  firmScoped: false,
};

const clients = [
  { id: CLIENT_A, name: "Rome Properties", status: "active", created_at: "2026-01-01T00:00:00.000Z" },
  { id: CLIENT_B, name: "Bee Creative Solution", status: "active", created_at: "2026-02-01T00:00:00.000Z" },
];

const sessions = [
  { id: COLLEAGUE_THREAD_A, firm_id: FIRM_ID, client_id: CLIENT_A, created_by: "44444444-4444-4444-8444-444444444444", visibility: "firm", title: "Colleague thread", created_at: "2026-09-02T02:00:00.000Z" },
  { id: THREAD_A, firm_id: FIRM_ID, client_id: CLIENT_A, created_by: SUBJECT, visibility: "private", title: "Own A", created_at: "2026-09-02T01:00:00.000Z" },
  { id: THREAD_B, firm_id: FIRM_ID, client_id: CLIENT_B, created_by: SUBJECT, visibility: "private", title: "Own B", created_at: "2026-09-02T01:00:00.000Z" },
];

function confirmedUser() {
  return {
    id: SUBJECT,
    aud: "authenticated",
    role: "authenticated",
    email: state.email,
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

function accessToken() {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    sub: SUBJECT,
    aud: "authenticated",
    role: "authenticated",
    email: state.email,
    exp: 4_102_444_800,
    iat: 1_788_112_800,
  })).toString("base64url");
  const signature = Buffer.from("e2e-signature").toString("base64url");
  return `${header}.${payload}.${signature}`;
}

function sendJson(response, status, body, extraHeaders = {}) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...extraHeaders,
  });
  response.end(JSON.stringify(body));
}

function publicLocation(location) {
  try {
    const target = new URL(location);
    if (
      target.port === "3101" &&
      (target.hostname === "127.0.0.1" || target.hostname === "localhost")
    ) {
      return new URL(`${target.pathname}${target.search}${target.hash}`, appOrigin).toString();
    }
  } catch {
    // Preserve relative and otherwise non-URL Location values exactly.
  }
  return location;
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function handleSupabase(request, response, url) {
  const path = url.pathname.slice(supabasePrefix.length);
  console.log(`[e2e-mock] ${request.method} ${path}`);
  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "access-control-allow-origin": appOrigin,
      "access-control-allow-credentials": "true",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "apikey,authorization,content-type,accept-profile,content-profile,x-client-info,x-supabase-api-version",
    });
    response.end();
    return;
  }

  const cors = {
    "access-control-allow-origin": appOrigin,
    "access-control-allow-credentials": "true",
  };

  if (request.method === "POST" && path === "/auth/v1/token") {
    const body = await readJson(request);
    const grantType = url.searchParams.get("grant_type");
    if (grantType !== "password" && grantType !== "pkce") {
      sendJson(response, 400, { message: "unsupported e2e grant" }, cors);
      return;
    }
    if (typeof body.email === "string") state.email = body.email;
    state.firmScoped = true;
    sendJson(response, 200, {
      access_token: accessToken(),
      token_type: "bearer",
      expires_in: 7_200,
      expires_at: 4_102_444_800,
      refresh_token: "e2e-refresh-token",
      user: confirmedUser(),
    }, cors);
    return;
  }

  if (request.method === "POST" && path === "/auth/v1/signup") {
    const body = await readJson(request);
    if (typeof body.email === "string") state.email = body.email;
    state.firmScoped = false;
    sendJson(response, 200, {
      id: SUBJECT,
      aud: "authenticated",
      role: "authenticated",
      email: state.email,
      email_confirmed_at: null,
      phone: "",
      app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: {},
      identities: [],
      created_at: "2026-08-31T00:00:00.000Z",
      updated_at: "2026-08-31T00:00:00.000Z",
      is_anonymous: false,
    }, cors);
    return;
  }

  if (request.method === "POST" && path === "/auth/v1/recover") {
    sendJson(response, 200, {}, cors);
    return;
  }

  if (request.method === "POST" && path === "/auth/v1/verify") {
    // FS-4 C-6 (裁-92): verifyOtp is now called {type:"signup", email, token}
    // — a code, never a token_hash link. The confirming caller's own
    // C1/C2 attempt wall (a Lane-B seam) still runs INSIDE the app before
    // this mock is ever reached, so this shape only matters once that seam
    // is wired for real (`CLARA_E2E_CONFIRM_WALL_WIRED=1`).
    const body = await readJson(request);
    if (body.type !== "signup" || body.token !== E2E_SIGNUP_CODE || body.email !== state.email) {
      sendJson(response, 400, { code: "otp_expired", message: "invalid e2e code" }, cors);
      return;
    }
    sendJson(response, 200, {
      access_token: accessToken(),
      token_type: "bearer",
      expires_in: 7_200,
      expires_at: 4_102_444_800,
      refresh_token: "e2e-refresh-token",
      user: confirmedUser(),
    }, cors);
    return;
  }

  if (request.method === "GET" && path === "/auth/v1/user") {
    sendJson(response, 200, confirmedUser(), cors);
    return;
  }

  if (request.method === "PUT" && path === "/auth/v1/user") {
    const body = await readJson(request);
    if (typeof body.password === "string" && body.password.includes("compromised")) {
      sendJson(response, 422, { message: "Password is known to be compromised" }, cors);
      return;
    }
    sendJson(response, 200, confirmedUser(), cors);
    return;
  }

  if (request.method === "POST" && path === "/rest/v1/rpc/claim_identity") {
    const body = await readJson(request);
    sendJson(response, 200, {
      user_id: SUBJECT,
      display_name: body.p_display_name,
    }, cors);
    return;
  }

  if (request.method === "POST" && path === "/rest/v1/rpc/request_firm_registration") {
    const body = await readJson(request);
    state.firmName = body.p_firm_name;
    state.note = body.p_note ?? null;
    state.registrationOpen = true;
    sendJson(response, 200, { request_id: REQUEST_ID, status: "open" }, cors);
    return;
  }

  if (request.method === "GET" && path === "/rest/v1/firm_registration_requests_visible") {
    sendJson(response, 200, state.registrationOpen ? [{
      id: REQUEST_ID,
      applicant: SUBJECT,
      firm_name: state.firmName,
      note: state.note,
      status: "open",
      decided_by: null,
      decided_at: null,
      reason: null,
      firm_id: null,
      created_at: "2026-08-31T00:05:00.000Z",
    }] : [], cors);
    return;
  }

  if (request.method === "GET" && path === "/rest/v1/caller_context") {
    const bookkeeper = state.email.startsWith("bookkeeper@");
    const owner = state.email.startsWith("owner@");
    if (!bookkeeper && !owner) {
      // Every non-navigation persona remains membership-less by default.
      sendJson(response, 200, [], cors);
      return;
    }
    sendJson(response, 200, [{
      user_id: SUBJECT,
      firm_id: FIRM_ID,
      firm_name: "E2E Accounting",
      role: bookkeeper ? "bookkeeper" : "owner",
      role_rank: bookkeeper ? 1 : 3,
      is_operator: owner,
    }], cors);
    return;
  }

  if (request.method === "GET" && path === "/rest/v1/firm_members_visible") {
    sendJson(response, 200, [{
      membership_id: "44444444-4444-4444-4444-444444444444",
      user_id: SUBJECT,
      display_name: state.email.startsWith("bookkeeper@") ? "E2E Bookkeeper" : "E2E Owner",
      email: state.email,
      role: state.email.startsWith("bookkeeper@") ? "bookkeeper" : "owner",
      role_rank: state.email.startsWith("bookkeeper@") ? 1 : 3,
      status: "active",
      created_at: "2026-09-02T00:00:00.000Z",
      removed_at: null,
    }], cors);
    return;
  }

  if (request.method === "GET" && path === "/rest/v1/firm_invites_visible") {
    sendJson(response, 200, [], cors);
    return;
  }

  if (request.method === "GET" && path === "/rest/v1/clients") {
    const filter = url.searchParams.get("id");
    const rows = filter?.startsWith("eq.")
      ? clients.filter((client) => client.id === filter.slice(3))
      : clients;
    sendJson(response, 200, rows, cors);
    return;
  }

  if (request.method === "GET" && path === "/rest/v1/client_facts") {
    sendJson(response, 200, [], cors);
    return;
  }

  if (request.method === "GET" && path === "/rest/v1/chat_sessions") {
    const filter = url.searchParams.get("id");
    const rows = filter?.startsWith("eq.")
      ? sessions.filter((session) => session.id === filter.slice(3))
      : sessions;
    sendJson(response, 200, rows, cors);
    return;
  }

  if (request.method === "GET" && path === "/rest/v1/onboarding_plans") {
    sendJson(response, 200, [], cors);
    return;
  }

  if (request.method === "POST" && path === "/rest/v1/rpc/list_review_queue") {
    sendJson(response, 200, {
      counts: { needs_you: 0, needs_review: 0, ready: 0, drafts: 0, uncoded_filings: 0, open_questions: 0, compliance_watches: 0, lint_findings: 0 },
      sweep: null,
      compliance: null,
      lint: null,
      rows: [],
      next_cursor: null,
    }, cors);
    return;
  }

  sendJson(response, 404, { message: `unhandled e2e Supabase route: ${request.method} ${path}` }, cors);
}

async function handleChat(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/chat/sessions") {
    sendJson(response, 200, { sessions });
    return;
  }
  const match = /^\/api\/chat\/sessions\/([^/]+)\/messages$/.exec(url.pathname);
  if (request.method === "GET" && match) {
    const threadId = decodeURIComponent(match[1]);
    const text = threadId === THREAD_A
      ? "Own message for client A"
      : threadId === THREAD_B
        ? "Own message for client B"
        : "Colleague message must not auto-open";
    sendJson(response, 200, {
      messages: [{
        id: `message-${threadId}`,
        role: "assistant",
        parts: [{ type: "text", text }],
        turn_key: null,
        task_id: null,
        seq: 1,
        created_at: "2026-09-02T03:00:00.000Z",
      }],
    });
    return;
  }
  sendJson(response, 404, { message: `unhandled e2e chat route: ${request.method} ${url.pathname}` });
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
    if (url.pathname === "/api/chat/sessions" || url.pathname.startsWith("/api/chat/sessions/")) {
      handleChat(request, response, url).catch((error) => {
        sendJson(response, 500, { message: error instanceof Error ? error.message : "mock failure" });
      });
      return;
    }

    const headers = {
      ...request.headers,
      host: appUrl.host,
      "x-forwarded-host": appUrl.host,
      "x-forwarded-proto": "https",
    };
    const upstream = httpRequest(
      {
        hostname: "127.0.0.1",
        port: 3101,
        method: request.method,
        path: request.url,
        headers,
      },
      (upstreamResponse) => {
        const responseHeaders = { ...upstreamResponse.headers };
        const location = responseHeaders.location;
        if (typeof location === "string") {
          responseHeaders.location = publicLocation(location);
        }
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
  [nextBin, "start", "--hostname", "127.0.0.1", "--port", "3101"],
  {
    cwd: webRoot,
    env: {
      ...process.env,
      NODE_EXTRA_CA_CERTS: certPath,
    },
    stdio: "inherit",
  },
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
    console.error(`[e2e] next start exited early (${signal ?? code ?? "unknown"})`);
    stop(code ?? 1);
  }
});
process.on("SIGINT", () => stop(130));
process.on("SIGTERM", () => stop(143));

// Keep this orchestrator alive until Playwright terminates its webServer.
