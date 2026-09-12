// Ticket #621 (journey A2, spec #612 §8) — THE RESEND LEG of the pre-session auth wall, through
// the SHIPPED router against a real migrated Postgres and a local stand-in for GoTrue.
//
// Modelled directly on `c5-auth-wall-db.test.mjs`: same rig, same real-HTTP GoTrue stand-in
// (there is deliberately no injected seam for `resendSignupOtp` any more than there is one for
// `verifySignupOtp` — see `authWallRoutes.ts`'s header), same per-run IPv6 address space so this
// file's own history never bleeds into a re-run, and the same composed express app so the
// resend and confirm routes are proven to share ONE wall rather than two coincidentally-similar
// ones.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import http from "node:http";
import express from "express";
import { register } from "tsx/esm/api";

import * as rig from "./rig.mjs";
import { cohortGate } from "./c5-cohort-gate.mjs";
import { emailDigestFor, pepperedDigest } from "../lib/rate-wall-courier.mjs";
import { endPools } from "../lib/pools.mjs";

register();

const SERVICE_TOKEN_FIXTURE = "c5-db-resend-service-token-fixture";
const PEPPER_FIXTURE = "c5-db-resend-pepper";
const TRUSTED_HEADER = "x-clara-test-client-ip";
const ANON_FIXTURE = "c5-db-resend-anon-key-fixture";

// The door's own budget (0163_checkout_gate_c3_folded_door.sql:754,
// `v_allowed:=(v_email_count<5 and v_origin_count<5)`): 5 attempts are allowed per digest per
// rolling 15-minute window; the 6th is refused. Read here as a named constant so every cell
// below says WHY it loops this many times rather than repeating a bare "5".
const WINDOW_BUDGET = 5;

const skip = await cohortGate(
  "the auth-wall cohort (0161)",
  `select to_regprocedure('clara.claim_confirmation_attempt(bytea,bytea)') is not null
      and to_regprocedure('clara.settle_confirmation_attempt(uuid,text)') is not null as ok`,
);
const READY = skip === false;

let app = null;
let server = null;
let base = "";
let gotrue = null;
/** What the stand-in answers a `/verify` next — only the shared-budget cell (c5awr.7) uses this. */
let verifyMode = "reject";
/** What the stand-in answers a `/resend` next. */
let resendMode = "accept";
/** Every request body the stand-in saw for `/resend` — the cell that proves what the route sent. */
const resendCalls = [];

const priorEnv = {};
function setEnv(patch) {
  for (const [k, v] of Object.entries(patch)) {
    if (!(k in priorEnv)) priorEnv[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

before(async () => {
  if (!READY) return;
  gotrue = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = raw ? JSON.parse(raw) : null;

      if (req.url === "/auth/v1/verify") {
        if (verifyMode === "accept") {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ access_token: `at_${randomUUID()}`, refresh_token: `rt_${randomUUID()}`, token_type: "bearer", expires_in: 3600, user: { id: randomUUID() } }));
          return;
        }
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "invalid_grant", error_description: "Token has expired or is invalid" }));
        return;
      }

      // req.url === "/auth/v1/resend"
      resendCalls.push({ url: req.url, headers: req.headers, body });
      if (resendMode === "accept") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({}));
        return;
      }
      if (resendMode === "rate_limited_with_header") {
        res.writeHead(429, { "content-type": "application/json", "retry-after": "45" });
        res.end(JSON.stringify({ error_code: "over_email_send_rate_limit", msg: "For security purposes, you can only request this after 45 seconds." }));
        return;
      }
      if (resendMode === "rate_limited_no_header") {
        res.writeHead(429, { "content-type": "application/json" });
        res.end(JSON.stringify({ error_code: "over_email_send_rate_limit", msg: "rate limited" }));
        return;
      }
      if (resendMode === "already_confirmed") {
        // A representative "this address doesn't need a resend" 4xx — the exact GoTrue
        // error_code is unverified offline; the route must not distinguish these from any other
        // 4xx (see `resendSignupOtp`'s header), so the stand-in's own code is deliberately
        // unremarkable.
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error_code: "email_already_confirmed", msg: "already confirmed" }));
        return;
      }
      if (resendMode === "provider_5xx") {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ msg: "internal error" }));
        return;
      }
      throw new Error(`unknown resendMode ${resendMode}`);
    });
  });
  await new Promise((resolve) => gotrue.listen(0, "127.0.0.1", resolve));

  setEnv({
    CLARA_AUTH_WALL_SERVICE_TOKEN: SERVICE_TOKEN_FIXTURE,
    CLARA_RATE_WALL_PEPPER: PEPPER_FIXTURE,
    CLARA_TRUSTED_CLIENT_IP_HEADER: TRUSTED_HEADER,
    CLARA_SUPABASE_URL: `http://127.0.0.1:${gotrue.address().port}`,
    CLARA_SUPABASE_ANON_KEY: ANON_FIXTURE,
  });

  const { authWallRoutes } = await import("../src/authWallRoutes.ts");
  app = express();
  app.use(authWallRoutes());
  app.use((_req, res) => res.status(404).json({ error: "no_such_route" }));
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (gotrue) await new Promise((resolve) => gotrue.close(resolve));
  setEnv(priorEnv);
  await endPools();
  await rig.endPool();
});

// PER-RUN UNIQUE — see `c5-auth-wall-db.test.mjs`'s own comment on `IP_RUN_KEY` for why (a fixed
// fixture address inherits every attempt a PREVIOUS run made within the 15-minute window).
const IP_RUN_KEY = randomUUID().replaceAll("-", "").slice(0, 12);
let ipCounter = 0;
const freshIp = () =>
  `2001:db8:c5b:${IP_RUN_KEY.slice(0, 4)}:${IP_RUN_KEY.slice(4, 8)}:${IP_RUN_KEY.slice(8, 12)}::${(ipCounter++).toString(16)}`;

async function post(path, body, { ip = freshIp(), token = SERVICE_TOKEN_FIXTURE } = {}) {
  const headers = { "content-type": "application/json" };
  if (token !== null) headers.authorization = `Bearer ${token}`;
  if (ip !== null) headers[TRUSTED_HEADER] = ip;
  const res = await fetch(`${base}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, headers: res.headers, json: text ? JSON.parse(text) : null };
}

const resend = (body, opts) => post("/api/auth-wall/resend", body, opts);
const confirm = (body, opts) => post("/api/auth-wall/confirm", body, opts);

const attemptsFor = (email, ip) =>
  rig
    .rootQuery(
      "select id,outcome,settled_at from clara.confirmation_attempts where email_digest=$1 and origin_digest=$2 order by attempted_at",
      [emailDigestFor(email), pepperedDigest(ip)],
    )
    .then((r) => r.rows);

// ---------------------------------------------------------------------------

test("c5awr.1 the service-token gate — no bearer, a wrong bearer, and an unset token", { skip }, async () => {
  const email = `c5awr1_${randomUUID()}@rig.test`;
  const ip = freshIp();
  const noBearer = await resend({ email }, { ip, token: null });
  assert.equal(noBearer.status, 401);
  assert.deepEqual(noBearer.json, { error: "unauthorized" });
  assert.equal((await resend({ email }, { ip, token: "wrong-token-of-the-same-ish-length" })).status, 401);
  const sameLength = "x".repeat(SERVICE_TOKEN_FIXTURE.length);
  assert.equal((await resend({ email }, { ip, token: sameLength })).status, 401);
  assert.deepEqual(await attemptsFor(email, ip), [], "an unauthorised request must claim nothing");

  setEnv({ CLARA_AUTH_WALL_SERVICE_TOKEN: undefined });
  const res = await resend({ email }, { ip });
  assert.equal(res.status, 503);
  assert.deepEqual(res.json, { outcome: "unavailable" });
  setEnv({ CLARA_AUTH_WALL_SERVICE_TOKEN: SERVICE_TOKEN_FIXTURE });
});

test("c5awr.2 invalid email shapes are refused 400 before anything is claimed", { skip }, async () => {
  const ip = freshIp();
  for (const body of [{}, { email: "" }, { email: "   " }, { email: "not-an-email" }, { email: "a@b" }, { email: 42 }, { email: null }]) {
    const res = await resend(body, { ip });
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.deepEqual(res.json, { outcome: "invalid_email" }, JSON.stringify(body));
  }
  const any = await rig.rootQuery(
    "select count(*)::int as n from clara.confirmation_attempts where origin_digest=$1",
    [pepperedDigest(ip)],
  );
  assert.equal(any.rows[0].n, 0, "an invalid shape must not claim an attempt");
});

test("c5awr.3 a successful resend — sent, settled 'rejected', and the exact GoTrue call", { skip }, async () => {
  resendMode = "accept";
  const email = `c5awr3_${randomUUID()}@rig.test`;
  const ip = freshIp();
  const before = resendCalls.length;
  const res = await resend({ email }, { ip });

  assert.equal(res.status, 200);
  assert.deepEqual(res.json, { outcome: "sent" });

  const rows = await attemptsFor(email, ip);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].outcome, "rejected", "a resend must count against the budget, never reset it");
  assert.ok(rows[0].settled_at);

  assert.equal(resendCalls.length, before + 1);
  const call = resendCalls[resendCalls.length - 1];
  assert.equal(call.url, "/auth/v1/resend");
  assert.equal(call.headers.apikey, ANON_FIXTURE);
  assert.equal(call.body.type, "signup");
  assert.equal(call.body.email, email);
});

test("c5awr.4 provider rate-limit — 429 rate_limited with the provider's own Retry-After, or the 60s default", { skip }, async () => {
  resendMode = "rate_limited_with_header";
  const email1 = `c5awr4a_${randomUUID()}@rig.test`;
  const ip1 = freshIp();
  const res1 = await resend({ email: email1 }, { ip: ip1 });
  assert.equal(res1.status, 429);
  assert.deepEqual(res1.json, { outcome: "rate_limited", retryAfterSeconds: 45 });
  assert.equal(res1.headers.get("retry-after"), "45");
  assert.equal((await attemptsFor(email1, ip1))[0].outcome, "rejected");

  resendMode = "rate_limited_no_header";
  const email2 = `c5awr4b_${randomUUID()}@rig.test`;
  const ip2 = freshIp();
  const res2 = await resend({ email: email2 }, { ip: ip2 });
  assert.equal(res2.status, 429);
  assert.deepEqual(res2.json, { outcome: "rate_limited", retryAfterSeconds: 60 }, "GoTrue's documented default cooldown");
  assert.equal(res2.headers.get("retry-after"), "60");
  assert.equal((await attemptsFor(email2, ip2))[0].outcome, "rejected");

  resendMode = "accept";
});

test("c5awr.5 provider says already-confirmed-or-unknown — still 200 sent (never leaked)", { skip }, async () => {
  resendMode = "already_confirmed";
  const email = `c5awr5_${randomUUID()}@rig.test`;
  const ip = freshIp();
  const res = await resend({ email }, { ip });
  assert.equal(res.status, 200);
  assert.deepEqual(res.json, { outcome: "sent" });
  assert.equal((await attemptsFor(email, ip))[0].outcome, "rejected", "still spends the budget");
  resendMode = "accept";
});

test("c5awr.6 a provider 5xx is unavailable, not a fabricated sent", { skip }, async () => {
  resendMode = "provider_5xx";
  const email = `c5awr6_${randomUUID()}@rig.test`;
  const ip = freshIp();
  const res = await resend({ email }, { ip });
  assert.equal(res.status, 503);
  assert.deepEqual(res.json, { outcome: "unavailable" });
  assert.equal((await attemptsFor(email, ip))[0].outcome, "rejected", "a provider failure still spends the budget — the attempt already claimed before GoTrue was called");
  resendMode = "accept";
});

test("c5awr.7 the wall through the route — the sixth action is 429/locked with the door's own numbers", { skip }, async () => {
  resendMode = "accept";
  const email = `c5awr7_${randomUUID()}@rig.test`;
  const ip = freshIp();
  for (let i = 0; i < WINDOW_BUDGET; i += 1) {
    const res = await resend({ email }, { ip });
    assert.equal(res.status, 200, `resend ${i + 1} should be allowed`);
    assert.deepEqual(res.json, { outcome: "sent" }, `resend ${i + 1}`);
  }
  const sixth = await resend({ email }, { ip });
  assert.equal(sixth.status, 429);
  assert.equal(sixth.json.outcome, "locked");
  assert.ok(Number.isInteger(sixth.json.retryAfterSeconds) && sixth.json.retryAfterSeconds >= 0 && sixth.json.retryAfterSeconds <= 900, "the seam's own display bounds, same as confirm's retry_after_seconds");
  assert.equal(sixth.headers.get("retry-after"), String(sixth.json.retryAfterSeconds));

  const callsBefore = resendCalls.length;
  const seventh = await resend({ email }, { ip });
  assert.equal(seventh.status, 429);
  assert.equal(resendCalls.length, callsBefore, "a refused claim must not reach the provider");
  assert.equal((await attemptsFor(email, ip)).length, WINDOW_BUDGET + 2, "a refused attempt is still recorded");
});

test("c5awr.8 a resend spree and a guess spree share ONE budget", { skip }, async () => {
  resendMode = "accept";
  verifyMode = "reject";
  const email = `c5awr8_${randomUUID()}@rig.test`;
  const ip = freshIp();
  // Exhaust the ENTIRE budget through resends alone...
  for (let i = 0; i < WINDOW_BUDGET; i += 1) {
    const res = await resend({ email }, { ip });
    assert.equal(res.status, 200, `resend ${i + 1} should be allowed`);
  }
  // ...then ONE wrong verify attempt, in the SAME email+origin bucket, is refused by /confirm's
  // OWN wall — proving the counter the two routes charge against is the identical one, not two
  // coincidentally-similar ones.
  const wrongConfirm = await confirm({ email, token: "000000" }, { ip });
  assert.equal(wrongConfirm.status, 429, "a confirm attempt must be refused purely from the resends' own spend");
  assert.equal(wrongConfirm.json.allowed, false);
  assert.ok(["email", "origin"].includes(wrongConfirm.json.scope));

  // Every claim persists a row BEFORE the window is evaluated (0163_checkout_gate_c3_folded_door
  // .sql:700, "the claim always persists before the window is evaluated") — so the refused
  // confirm claim above IS a 6th row, just an unsettled one (outcome stays NULL forever, since a
  // refused claim never reaches verify/settle).
  const rows = await attemptsFor(email, ip);
  assert.equal(rows.length, WINDOW_BUDGET + 1);
  assert.deepEqual(
    rows.slice(0, WINDOW_BUDGET).map((r) => r.outcome),
    Array(WINDOW_BUDGET).fill("rejected"),
    "the 5 resends settled 'rejected'",
  );
  assert.equal(rows[WINDOW_BUDGET].outcome, null, "the refused confirm claim is claimed but never settled");
});

test("c5awr.9 unconfigured Supabase endpoint — 503 unavailable (item 1 of the #621 contract)", { skip }, async () => {
  const email = `c5awr9_${randomUUID()}@rig.test`;
  const ip = freshIp();
  setEnv({ CLARA_SUPABASE_ANON_KEY: undefined });
  const res = await resend({ email }, { ip });
  assert.equal(res.status, 503);
  assert.deepEqual(res.json, { outcome: "unavailable" });
  assert.deepEqual(await attemptsFor(email, ip), [], "refused before anything is claimed");
  setEnv({ CLARA_SUPABASE_ANON_KEY: ANON_FIXTURE });
});

test("c5awr.10 no trusted client-IP header — 503 unavailable, no claim", { skip }, async () => {
  const email = `c5awr10_${randomUUID()}@rig.test`;
  const res = await fetch(`${base}/api/auth-wall/resend`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${SERVICE_TOKEN_FIXTURE}` },
    body: JSON.stringify({ email }),
  });
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { outcome: "unavailable" });
  const any = await rig.rootQuery(
    "select count(*)::int as n from clara.confirmation_attempts where email_digest=$1",
    [emailDigestFor(email)],
  );
  assert.equal(any.rows[0].n, 0);
});

test("c5awr.11 nothing about the email ever reaches a log line", { skip }, async () => {
  resendMode = "accept";
  const SECRET_EMAIL = `c5awr11-secret-marker-${randomUUID()}@rig.test`;
  const ip = freshIp();
  const capturedLog = [];
  const capturedError = [];
  const origLog = console.log;
  const origError = console.error;
  console.log = (...args) => capturedLog.push(args.map(String).join(" "));
  console.error = (...args) => capturedError.push(args.map(String).join(" "));
  try {
    // One successful call, one rate-limited call, and one config-absent 503 — the three shapes
    // most likely to tempt a debugging println of the request body.
    await resend({ email: SECRET_EMAIL }, { ip });
    resendMode = "rate_limited_with_header";
    await resend({ email: SECRET_EMAIL }, { ip: freshIp() });
    setEnv({ CLARA_SUPABASE_ANON_KEY: undefined });
    await resend({ email: SECRET_EMAIL }, { ip: freshIp() });
    setEnv({ CLARA_SUPABASE_ANON_KEY: ANON_FIXTURE });
  } finally {
    console.log = origLog;
    console.error = origError;
    resendMode = "accept";
  }
  const allLines = [...capturedLog, ...capturedError].join("\n");
  assert.equal(allLines.includes(SECRET_EMAIL), false, `the email must never appear in a log line; captured:\n${allLines}`);
  assert.equal(allLines.includes("@rig.test"), false, "not even a fragment of the address (defends against a partial-string leak)");
});
