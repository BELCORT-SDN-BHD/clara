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

// FS-4 C-6's own mock lane — the C-3/C-6 doors and C-5's ONE confirm endpoint.
import { handleAuthWallMock, handleCheckoutMock } from "./fs4-checkout-mock.mjs";
// The chat-parity walk's own mock lane — a file-disjoint sibling (the same shape
// live-stack/serve-live.mjs takes), consulted through the three hooks below so no
// other spec's surface changes. See that file's header for what it does and does not
// prove.
import { handleChatParityRuntime, handleChatParitySupabase, startMockRuntime } from "./chat-parity-mock.mjs";
// P6-5's own lane, the same file-disjoint shape, consulted through the three hooks below.
// Every branch inside is scoped to ITS OWN ids and falls through otherwise, so it can run
// beside the chat-parity lane without either starving the other's fixtures.
import { P6_5_SESSIONS, handleP6_5App, handleP6_5Runtime, handleP6_5Supabase } from "./agentic-finish-mock.mjs";
// 裁-190's journals-table lane, the same file-disjoint shape. Consulted FIRST among the
// four, and that ordering is load-bearing: the chat-parity lane answers an
// `agent_interruptions` read that carries no `task_id` from its own park, so the
// journals tab's FIRM-WIDE pending read would otherwise be served that walk's row AND
// would burn its `emptyReads` budget. Every other handler in the module is client- or
// id-scoped and falls through, so running first costs no sibling anything.
import { handleJournalsTableSupabase } from "./journals-table-mock.mjs";
// L7 (bank/close/registers). ID-scoped like its siblings, hooked in ONE place below, and
// deliberately NOT first: it answers nothing the journals lane needs, and #548's ordering
// note above is the one claim in this import block that is load-bearing.
import { handleL7Supabase } from "./bank-close-registers-mock.mjs";
// The documents-viewer walk's own lane (C-07 / D2 / D3), the same file-disjoint shape.
// Every branch inside is scoped to ITS OWN client/document/extraction ids and falls
// through otherwise; it never claims the shared client register or the session list.
import { handleDocumentsViewerRuntime, handleDocumentsViewerSupabase } from "./documents-viewer-mock.mjs";
// The Home boards' fixture lane (#557). Consulted LAST among the lane hooks and BEFORE this
// file's own generic fixtures — see that module's header for why answering with honest EMPTIES
// cannot starve a lane that owns one of the same routes for its own ids, and why its one
// id-scoped client row has to precede the generic `/rest/v1/clients` branch.
//
// LAST IS ALSO SAFE AGAINST THE CONSUME-THEN-FALL-THROUGH HAZARD the documents lane's note
// below records against L7's module: this lane's handlers never call `readJson`, so a request
// body some earlier hook already drained costs it nothing. Its RPC branch answers on the PATH
// alone, and its one relation branch reads the query string.
import { handleHomeBoardSupabase } from "./home-board-mock.mjs";
// #623's durable-Work lane. Same file-disjoint shape: every branch is scoped to its own
// client (or to an id that module minted) and falls through otherwise, it claims no
// unfiltered register, and its ONE chat thread is APPENDED to the shared `sessions` list
// below rather than answered from a second one. Its runtime half owns `/api/work/*` and
// one control path; see that module's header for what the walk does and does not prove.
import { JOURNAL_WORK_SESSIONS, handleJournalWorkRuntime, handleJournalWorkSupabase } from "./journal-work-mock.mjs";
// #627's own lane (the D4 tax-boundary walk). ID-scoped like its siblings — five client ids,
// one per five/six-state read outcome — hooked in ONE place below, before `handleL7Supabase`
// (see that hook's own note for why order matters here).
import { handleD4Supabase } from "./tax-boundary-mock.mjs";

const e2eRoot = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(e2eRoot, "..");
const appOrigin = process.env.CLARA_E2E_APP_ORIGIN ?? "https://127.0.0.1:3100";
const appUrl = new URL(appOrigin);
const supabaseUrl = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? `${appOrigin}/e2e-supabase`);
const supabasePrefix = supabaseUrl.pathname.replace(/\/$/, "");
// The two INTERNAL ports (the public one is CLARA_E2E_APP_ORIGIN's). Overridable so a
// second lane can run this harness on a host where another already holds the defaults —
// the alternative measured on 2026-09-02 was an EADDRINUSE crash and no browser leg at
// all. Defaults unchanged, so every existing invocation behaves exactly as before.
const nextPort = Number(process.env.CLARA_E2E_NEXT_PORT ?? 3101);
const mockRuntimePort = Number(process.env.CLARA_E2E_RUNTIME_PORT ?? 3102);
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
  // FS-4 C-6: the checkout journey's own progression, advanced only by the
  // acts that advance it in production — a signature, a stamped session, an
  // applied payment, a claim.
  dpaSigned: false,
  checkoutOpen: false,
  paidUnconsumed: false,
  firmOpened: false,
  // The auth wall's scripted verdict, so a spec can drive the locked and
  // wrong-code polarities without inventing a rate wall in the browser.
  authWall: { mode: "verify" },
  authWallRequests: [],
  doorCalls: [],
  // #614 AC6 — the live-permission-loss toggle. `loadClientById`
  // (`app/(firm)/clients/[clientId]/layout.tsx`) runs SERVER-side, so its
  // fetch to `.../e2e-supabase/rest/v1/clients` is issued by the Next.js
  // server process, never by the browser tab — `page.route` cannot reach it.
  // This Set is the mock's own stand-in for "RLS no longer admits this row":
  // every handler below that returns rows from the shared `clients` fixture
  // filters a hidden id out, so a spec can make a client disappear MID-SESSION
  // and prove the shell's real not-found boundary rather than only its
  // bogus-id arm. See `handleClientVisibilityControl` for how a spec flips it.
  hiddenClients: new Set(),
};

const clients = [
  { id: CLIENT_A, name: "Rome Properties", status: "active", created_at: "2026-01-01T00:00:00.000Z" },
  { id: CLIENT_B, name: "Bee Creative Solution", status: "active", created_at: "2026-02-01T00:00:00.000Z" },
];

// #614 — Postgres `uuid` shape (`clara.clients.id`, 0003_books_core.sql:34-40), mirrored
// from `lib/client-id.ts`'s own regex so THIS MOCK'S FAILURE MODE MATCHES THE LIVE ONE.
// The `/rest/v1/clients` handler below used to answer `id=eq.<any string>` with an honest
// `[]` regardless of shape — which is exactly why `shell-migration-walk.spec.ts`'s bogus-id
// cell passed locally while app.clarabook.com (real PostgREST) threw HTTP 400 `22P02` for
// the same input and rendered the route's ERROR boundary instead of the scoped not-found.
// See that handler's own note.
const CLIENT_ID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The exact PostgREST error body a non-uuid `eq.` filter on a uuid column returns —
 *  measured on app.clarabook.com against `/clients/not-a-client/journals` (#614). */
function sendMalformedUuidFilter(response, value, cors) {
  sendJson(
    response,
    400,
    { code: "22P02", details: null, hint: null, message: `invalid input syntax for type uuid: "${value}"` },
    cors,
  );
}

/** Sessions minted at RUNTIME by the create handler below, and the marker transcript each
 *  one serves. Kept beside the list they are appended to.
 *
 *  THEY PERSIST FOR THE SERVER'S LIFETIME, deliberately, and the 裁-117 walk depends on
 *  it: it creates two threads and switches between them, so the first must still be
 *  listed after the second is minted. Nothing resets between specs, which is safe only
 *  because `playwright.config.ts` pins `workers: 1`, `retries: 0` and
 *  `reuseExistingServer: false` — one server, one pass, one process. The walk reads its
 *  markers off the screen rather than hard-coding an ordinal for the same reason: another
 *  spec creating first would shift the count, and only the config keeps that from
 *  happening today. */
let createdSessions = 0;
const createdTranscripts = new Map();

const sessions = [
  { id: COLLEAGUE_THREAD_A, firm_id: FIRM_ID, client_id: CLIENT_A, created_by: "44444444-4444-4444-8444-444444444444", visibility: "firm", title: "Colleague thread", created_at: "2026-09-02T02:00:00.000Z" },
  { id: THREAD_A, firm_id: FIRM_ID, client_id: CLIENT_A, created_by: SUBJECT, visibility: "private", title: "Own A", created_at: "2026-09-02T01:00:00.000Z" },
  { id: THREAD_B, firm_id: FIRM_ID, client_id: CLIENT_B, created_by: SUBJECT, visibility: "private", title: "Own B", created_at: "2026-09-02T01:00:00.000Z" },
  // P6-5's three threads live in the SAME list rather than in a second one. There is exactly
  // one `/api/chat/sessions` response per server, and a lane that claimed it for itself
  // starved the parity-holes walk of its own thread — `selectOwnSession` then resolved a
  // different session and #507's cell went red. Appending is safe in both directions: every
  // row here carries `created_by: SUBJECT` and its OWN client id, and both walks select by
  // (created_by, client_id), so neither can see the other's.
  ...P6_5_SESSIONS,
  // #623's ONE thread, appended for exactly the same reason and with the same property:
  // it carries this list's shared SUBJECT and its OWN client id, so `(created_by,
  // client_id)` can resolve it only from that lane's client and never at the firm altitude.
  ...JOURNAL_WORK_SESSIONS,
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
      target.port === String(nextPort) &&
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

  // #627's OWN FIX for a hazard the L7 hook's header already named for a different verb,
  // now hit by a SECOND lane on `list_review_queue`: `journals-table-mock.mjs`'s own handler
  // for this verb reads the POST body via `readJson(request)` UNCONDITIONALLY (before it
  // knows whether this call is even its own client), then falls through with `return false`
  // when the client does not match — but Node's request stream can only be drained ONCE,
  // so `tax-boundary-mock.mjs`'s own `readJson(request)` call after it (same verb, different
  // client ids) silently saw `{}`, every one of its five branches missed, and every D4 client
  // fell through to the generic empty-envelope default regardless of which state it asked
  // for. Neither lane mock did anything wrong in isolation; two independent readers of ONE
  // request stream is the actual defect, and the fix belongs here; where the dispatcher
  // already owns the request, rather than teaching every current and future
  // `list_review_queue` consumer to coordinate with each other.
  //
  // The fix: drain the body exactly ONCE, right here, before ANY lane hook runs, then
  // re-install the stream's own async-iteration protocol so every later `for await (const
  // chunk of request)` — every lane mock's own `readJson`, unchanged — sees the SAME bytes
  // again, as many times as asked, in whatever order the hooks below call it.
  if (request.method === "POST" && path === "/rest/v1/rpc/list_review_queue") {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const rawBody = Buffer.concat(chunks);
    request[Symbol.asyncIterator] = () => {
      let delivered = false;
      return {
        async next() {
          if (delivered) return { value: undefined, done: true };
          delivered = true;
          return { value: rawBody, done: false };
        },
      };
    };
  }
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

  // FS-4 C-6's half — its own module (this file is at the 500-line gate); see
  // that header for what the browser leg does and does not prove.
  if (await handleCheckoutMock({
    request, response, path, cors, state, sendJson, readJson,
    appOrigin, accessToken, subject: SUBJECT, registrationId: REQUEST_ID,
    firmId: FIRM_ID, signupCode: E2E_SIGNUP_CODE,
  })) {
    return;
  }

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

  // FIRST, and safe there because every branch inside is scoped to the chat-parity ids
  // and falls through otherwise (merge of origin/main `cea3da39` / #507 — see that
  // module's own note). Running it after the generic fixtures below instead would have
  // starved the chat-parity thread of its `chat_sessions` row, which #507's new
  // client/thread pairing check turns into a 404.
  if (await handleJournalsTableSupabase(request, response, path, url, sendJson, cors)) return;
  if (await handleChatParitySupabase(request, response, path, url, sendJson, cors)) return;
  if (await handleP6_5Supabase(request, response, path, url, sendJson, cors)) return;
  // THE DOCUMENTS LANE RUNS BEFORE L7's, and the reason is a measured hazard
  // rather than a preference. `bank-close-registers-mock.mjs:204-246` parses the
  // request body on EVERY `/rest/v1/rpc/` POST and then returns false for verbs
  // that are not its own — and `readJson` consumes the stream, so every lane
  // after it reads `{}` and its own id-scoped guards refuse its own walk's
  // traffic. That is what turned this lane's confirm-and-file into "unhandled
  // e2e Supabase route" the first time the two ran together.
  //
  // Ordering this lane first is safe in the other direction because it never
  // does the same thing: it reads the body only INSIDE a matched verb (see its
  // own note), and its four verbs are disjoint from L7's five. The underlying
  // consume-then-fall-through in L7's module is reported separately — it still
  // starves whatever lane is added after it.
  if (await handleDocumentsViewerSupabase(request, response, path, url, sendJson, cors)) return;
  // #627's D4 lane. SAFE to run before L7's hook for the same reason the documents lane is:
  // its ONE rpc verb (`list_review_queue`) reads the request body only INSIDE that verb's own
  // match, never unconditionally on every `/rest/v1/rpc/` POST — so it never drains a stream a
  // later lane still needs. Placed before `handleL7Supabase` on purpose (that lane's own note
  // above: it consumes the body on every RPC POST before checking the verb, which would starve
  // this lane's `list_review_queue` reads of theirs if this ran after it).
  if (await handleD4Supabase(request, response, path, url, sendJson, cors)) return;
  // #629 MOVED THIS LANE AHEAD OF L7's, and it is the same measured hazard the two notes above
  // describe rather than a preference. `handleJournalWorkSupabase` gained three `/rest/v1/rpc/`
  // verbs (`get_work_question`, `get_work_pending_question`, `answer_work_question`), and L7's hook
  // calls `readJson` on EVERY rpc POST before checking whether the verb is its own — so with this
  // lane after it, every one of those three read `{}` , fell through its own id guard, and the Work
  // detail's question form never appeared. This lane still reads the body only INSIDE a matched
  // verb, so running it earlier starves nothing: its rpc paths are disjoint from every lane above
  // and it falls through for anything else.
  if (await handleJournalWorkSupabase(request, response, path, url, sendJson, cors)) return;
  if (await handleL7Supabase(request, response, path, url, sendJson, cors)) return;
  // LAST among the lane hooks, and still BEFORE the generic fixtures — see home-board-mock.mjs's
  // header. It has to precede the generic `/rest/v1/clients` branch below to serve its ONE
  // id-scoped client row (a SERVER-side layout read `page.route` cannot reach), and it falls
  // through for every other id, so the unfiltered register stays exactly as this file has it.
  // #623's lane runs BEFORE the home board's, and that ordering is LOAD-BEARING rather than
  // a preference — measured, not reasoned. `home-board-mock.mjs`'s `EMPTY_RELATIONS` answers
  // `/rest/v1/coa_accounts` and `/rest/v1/agent_tasks_visible` with an honest `[]` for EVERY
  // subject (its own header names that as deliberate), so with this hook after it the journal
  // composer's account picker held nothing but its placeholder and the Work detail could never
  // read its run's task. Running first costs that lane nothing: every branch in this module is
  // scoped to its own client (or to an id it minted) and falls through otherwise, so the honest
  // empties still answer every other walk. It never calls `readJson` in the PostgREST half, so
  // an earlier hook that already drained a POST body costs its GET branches nothing either — but
  // its three rpc POSTs are not so lucky, which is why the call itself now sits ABOVE L7's hook
  // (see the #629 note there). This position is kept as the record of the ordering it must keep
  // relative to the home board.
  if (await handleHomeBoardSupabase(request, response, path, url, sendJson, cors)) return;

  if (request.method === "GET" && path === "/rest/v1/clients") {
    const filter = url.searchParams.get("id");
    const filterValue = filter?.startsWith("eq.") ? filter.slice(3) : null;
    // #614 — MOCK PARITY WITH REAL POSTGREST: a malformed `id=eq.<value>` (not shaped like
    // `clara.clients.id`, a uuid) is a 400 `22P02` on the live API, never an honest `[]`.
    // Checked BEFORE the `hiddenClients` filter — a malformed id was never a visible client
    // to begin with, so there is nothing for that toggle to hide.
    if (filterValue !== null && !CLIENT_ID_SHAPE.test(filterValue)) {
      sendMalformedUuidFilter(response, filterValue, cors);
      return;
    }
    const visible = clients.filter((client) => !state.hiddenClients.has(client.id));
    const rows = filterValue !== null ? visible.filter((client) => client.id === filterValue) : visible;
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
    // TRUED 2026-09-04 (裁-190). Three of the eight count keys were not the contract's:
    // `drafts`/`uncoded_filings` for `open_drafts`/`open_tasks`, and `open_tasks` was absent
    // entirely (lib/firm/needs-you.ts's `ReviewQueueCounts`, grounded on the live body's own
    // jsonb_build_object). Nothing read them before Firm Home rendered the eight chips, so the
    // drift was invisible; with the scoreboard live, two chips would have printed `undefined`.
    // `compliance` likewise carries its real EMPTY shape rather than `null` — the firm-admin
    // register and the Tax tab both treat an absent envelope as a wire fault, deliberately.
    sendJson(response, 200, {
      counts: { ready: 0, needs_review: 0, needs_you: 0, open_drafts: 0, open_questions: 0, open_tasks: 0, compliance_watches: 0, lint_findings: 0 },
      sweep: null,
      compliance: { stale_evaluator: false, clients: [] },
      lint: null,
      rows: [],
      next_cursor: null,
    }, cors);
    return;
  }

  if (request.method === "POST" && path === "/rest/v1/rpc/get_my_preferences") {
    // #626 — MotionPreferenceSync (components/app-shell/motion-preference-sync.tsx) is mounted
    // in the ROOT layout, so this call fires on EVERY signed-in page across the whole suite, not
    // only personal-settings-walk.spec.ts's own. A generic, honest "nothing saved yet" default
    // here keeps every OTHER spec's page free of an unhandled-route 404 for a call it never
    // asked about; a spec that cares about a SPECIFIC stored preference installs its own
    // `page.route` for this same path, which Playwright's last-registered-wins order lets
    // override this default per test (personal-settings-walk.spec.ts does exactly that).
    sendJson(response, 200, { version: 0, interface: {}, notifications: {}, updated_at: null }, cors);
    return;
  }

  sendJson(response, 404, { message: `unhandled e2e Supabase route: ${request.method} ${path}` }, cors);
}

/** The shared chat legs, AS THE RUNTIME SEES THEM (the chat/SSE repoint): the ONE session
 *  list every walk's rail reads, plus a canned transcript per thread. Returns true when it
 *  answered, so the runtime delegate chain can fall through to FS-4 C-6's confirm route. */
async function handleChat(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/chat/sessions") {
    sendJson(response, 200, { sessions });
    return true;
  }

  // 裁-117 — CREATE, beside the list it appends to, because there is exactly ONE session
  // list per server and a second one would starve every walk that reads this one. The
  // row is minted the way `packages/runtime/src/chatRoutes.ts:137-157` mints it: always
  // `private`, `client_id` from the body, `created_by` from the caller.
  //
  // A PINNED SERVER/MOCK DIVERGENCE, AND IT IS DELIBERATE. The real ingress accepts a
  // firm-altitude create — `chatRoutes.ts:145` inserts `body.clientId ?? null` and the
  // product's own rail offers exactly that at the firm altitude. This mock REFUSES it,
  // because there is one session list for the whole suite and `selectOwnSession` resolves
  // on `(created_by, client_id)`: a row with `client_id: null` under the shared SUBJECT is
  // resolved by EVERY walk's firm rail, which is the third instance of the ownership rule
  // `e2e-fixture-ownership.test.ts` was written for.
  //
  // The divergence is FENCED MECHANICALLY by that file's N6 cell, which reads this file
  // and asserts both halves — that no static row here claims the firm altitude for the
  // shared subject, and that this handler refuses exactly the no-clientId case. N4 is a
  // different cell over a different subject (`P6_5_SESSIONS`) and does not reach this
  // file; citing it here was the reasoning, not the fence.
  if (request.method === "POST" && url.pathname === "/api/chat/sessions") {
    const body = await readJson(request);
    if (!body.clientId) {
      sendJson(response, 400, { error: "e2e: a firm-altitude session would be resolved by EVERY walk's rail — a deliberate mock/server divergence, fenced by e2e-fixture-ownership.test.ts N6" });
      return true;
    }
    createdSessions += 1;
    const id = `e2e0${String(createdSessions).padStart(4, "0")}-0000-4000-8000-000000000000`;
    createdTranscripts.set(id, `CREATED THREAD ${createdSessions}`);
    sessions.unshift({
      id, firm_id: FIRM_ID, client_id: body.clientId, created_by: SUBJECT,
      visibility: "private", title: null, created_at: new Date().toISOString(),
    });
    sendJson(response, 201, { session_id: id });
    return true;
  }

  const match = /^\/api\/chat\/sessions\/([^/]+)\/messages$/.exec(url.pathname);
  if (request.method === "GET" && match) {
    const threadId = decodeURIComponent(match[1]);
    const created = createdTranscripts.get(threadId);
    if (created) {
      // A distinguishable transcript per created thread, so a walk can prove it SWITCHED
      // rather than merely re-rendered. Production would serve an empty list here; the
      // marker is the instrument, and it exists only for ids this handler minted.
      sendJson(response, 200, {
        messages: [{ id: `message-${threadId}`, role: "assistant", parts: [{ type: "text", text: created }], turn_key: null, task_id: null, seq: 1, created_at: "2026-09-04T00:00:00Z" }],
      });
      return true;
    }
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
    return true;
  }
  // NOT a 404 any more: this is one link in the runtime delegate chain, and answering
  // 404 here would swallow FS-4 C-6's confirm route. The mock runtime's own fallback
  // owns the unhandled case.
  return false;
}

/** #614 AC6's own app-origin control endpoint — the same idiom as P6-5's
 *  `/e2e-p6-5/reset` below (a plain POST this server answers directly, never
 *  a runtime route, never proxied to `next start`). It lives OUTSIDE the
 *  Supabase prefix on purpose: `handleSupabase` is reached only under
 *  `supabasePrefix`, and while nothing in this mock actually gates `/rest` on
 *  a bearer token today, a control surface for TEST STATE has no business
 *  living where a real Authorization/apikey header would ever be expected —
 *  keeping it on the bare app origin keeps that true even if `/rest` grows a
 *  token check later.
 *
 *  `POST /e2e-control/clients/<id>/visibility` with `{ "visible": boolean }`
 *  adds or removes `<id>` from `state.hiddenClients`; every client-row read in
 *  `handleSupabase` above (`/rest/v1/clients`, filtered or not) already
 *  consults that Set. `POST /e2e-control/reset` clears it outright — the
 *  `workers: 1` backstop so a spec that ends early (a failed assertion, a
 *  thrown timeout) can never leave a LATER spec's client invisible; the walk
 *  that uses the toggle also restores visibility itself before it finishes,
 *  in a `test.afterEach`, for the same reason defence in depth is cheap here. */
async function handleClientVisibilityControl(request, response, url) {
  const visibilityMatch = /^\/e2e-control\/clients\/([^/]+)\/visibility$/.exec(url.pathname);
  if (request.method === "POST" && visibilityMatch) {
    const id = decodeURIComponent(visibilityMatch[1]);
    const body = await readJson(request);
    if (body.visible === false) state.hiddenClients.add(id);
    else state.hiddenClients.delete(id);
    sendJson(response, 200, { id, visible: !state.hiddenClients.has(id) });
    return true;
  }
  if (request.method === "POST" && url.pathname === "/e2e-control/reset") {
    state.hiddenClients.clear();
    sendJson(response, 200, { reset: true });
    return true;
  }
  return false;
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
    // THE CHAT LEGS NO LONGER LIVE HERE, and their old comment said why they had to
    // move: `runtimeBase()` was empty in this harness, so the browser asked THIS server
    // for `/api/chat/*` and `/api/tasks/*` and "they never reach `next start`" — the
    // suite was green on an origin the deployed Worker does not have, which is exactly
    // how the launch blocker survived CI. They are RUNTIME legs now (the delegate chain
    // where `startMockRuntime` is called below), and the browser's `/api/runtime/chat/*`
    // and `/api/runtime/tasks/*` requests fall through to `proxyToNext` like every other
    // app request — traversing `next start`, the firm-scope guard and the real proxy.
    //
    // What stays here is P6-5's ONE app-origin control endpoint (`/e2e-p6-5/reset`)
    // and #614 AC6's own (`/e2e-control/...`, `handleClientVisibilityControl` above)
    // — neither is a runtime route and neither ever was.
    handleClientVisibilityControl(request, response, url)
      .then((handled) => {
        if (handled) return true;
        return handleP6_5App(request, response, url);
      })
      .then((handled) => {
        if (handled) return;
        proxyToNext(request, response);
      })
      .catch((error) => sendJson(response, 500, { message: error instanceof Error ? error.message : "mock failure" }));
  },
);

function proxyToNext(request, response) {
    const headers = {
      ...request.headers,
      host: appUrl.host,
      "x-forwarded-host": appUrl.host,
      "x-forwarded-proto": "https",
    };
    const upstream = httpRequest(
      {
        hostname: "127.0.0.1",
        port: nextPort,
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
}

await new Promise((resolveListen, rejectListen) => {
  httpsServer.once("error", rejectListen);
  httpsServer.listen(Number(appUrl.port), appUrl.hostname, resolveListen);
});

// The runtime the SAME-ORIGIN proxy route forwards to. `CLARA_RUNTIME_URL` is
// server-side only and read at REQUEST time by app/api/runtime/[...path]/route.ts, so
// pointing it here exercises the real proxy (firm-scope guard, header allow-list,
// credential-by-leg) against a stand-in runtime rather than skipping it.
// FS-4 C-6's ONE runtime route (C-5's A-M3 confirm endpoint) is delegated into
// the same mock runtime the chat-parity lane starts, because `CLARA_RUNTIME_URL`
// can only name one origin. See chat-parity-mock.mjs's `startMockRuntime` for
// the merge defect that made this necessary.
//
// THE CHAT LEGS JOIN THAT CHAIN, in the SAME ORDER they had on the app origin and for
// the same reasons (#507's merge resolution, carried here verbatim): the chat-parity
// mock gets first refusal because it matches EXACT ids — its own thread's `/messages`,
// its own thread's `/turns`, its own task's `/stream` — so it cannot swallow
// `/api/chat/sessions` or any thread #507 owns. The reverse order is NOT safe:
// `handleChat` claims the whole `/api/chat/sessions/` prefix and would answer the
// chat-parity thread's transcript with a canned assistant message, where a PARKED task
// must have an empty one (`clara.settle_chat_turn` writes the assistant row, and it
// cancels the pending interruption in the same breath). P6-5's lane sits between them,
// with the same property: three exact thread ids and nothing else, and it never claims
// the shared session list. `handleChat` is last of the three and now returns false on a
// miss, so FS-4 C-6's confirm route still reaches its own handler.
const mockRuntime = startMockRuntime(mockRuntimePort, async (request, response, url) => {
  if (await handleChatParityRuntime(request, response, url)) return true;
  if (await handleP6_5Runtime(request, response, url)) return true;
  if (await handleDocumentsViewerRuntime(request, response, url)) return true;
  // #623, BEFORE `handleChat` and for the reason its neighbours are: it answers ONE exact
  // thread id, so it cannot swallow the shared session list or any thread another walk owns,
  // while `handleChat` claims the whole `/api/chat/sessions/…/messages` shape and would
  // otherwise serve this lane's thread a canned text message with no Work cards in it.
  if (await handleJournalWorkRuntime(request, response, url)) return true;
  if (await handleChat(request, response, url)) return true;
  return handleAuthWallMock({
    request, response, path: url.pathname, cors: {}, state,
    sendJson, readJson, accessToken, signupCode: E2E_SIGNUP_CODE,
  });
});

const nextBin = join(webRoot, "node_modules", "next", "dist", "bin", "next");
const next = spawn(
  process.execPath,
  [nextBin, "start", "--hostname", "127.0.0.1", "--port", String(nextPort)],
  {
    cwd: webRoot,
    env: {
      ...process.env,
      NODE_EXTRA_CA_CERTS: certPath,
      CLARA_RUNTIME_URL: mockRuntime.origin,
    },
    stdio: "inherit",
  },
);

let stopping = false;
function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  next.kill("SIGTERM");
  mockRuntime.server.close();
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
