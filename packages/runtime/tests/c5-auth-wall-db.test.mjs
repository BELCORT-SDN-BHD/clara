// FS-4 C-5 item 8 (A-M3) — the PRE-SESSION CONFIRM battery, through the SHIPPED router against
// a real migrated Postgres and a local stand-in for GoTrue.
//
// A-M3 IS A ROUTE CONTRACT, SO THE ROUTE IS WHAT THESE CELLS DRIVE. The DB cannot close it:
// `settle_confirmation_attempt` takes a bare uuid and proves nothing about who claimed it, and
// settling `'accepted'` returns a spent budget to full. Every property below is therefore
// asserted against the composed express app, not against a helper.
//
// THE VERIFY LEG IS A REAL HTTP SERVER, NOT AN INJECTED STUB. `src/authWallRoutes.ts` imports
// `verifySignupOtp` directly and has no seam for it — deliberately, because a seam that can
// substitute the verification is a seam that can BYPASS it. The cells point
// `CLARA_SUPABASE_URL` at a local server instead, so the route's own fetch, its own body shape
// and its own "verified iff access_token" test all execute.

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

const SERVICE_TOKEN_FIXTURE = "c5-db-service-token-fixture";
const PEPPER_FIXTURE = "c5-db-pepper";
const TRUSTED_HEADER = "x-clara-test-client-ip";
const ANON_FIXTURE = "c5-db-anon-key-fixture";

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
/** What the stand-in answers next. `accept` ⇒ 200 with a session; `reject` ⇒ 400. */
let verifyMode = "accept";
/** Every request body the stand-in saw — the cell that proves what the route actually sends. */
const verifyCalls = [];

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
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      verifyCalls.push({ url: req.url, headers: req.headers, body: body ? JSON.parse(body) : null });
      if (verifyMode === "accept") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            access_token: `at_${randomUUID()}`,
            refresh_token: `rt_${randomUUID()}`,
            token_type: "bearer",
            expires_in: 3600,
            user: { id: randomUUID(), email: "person@rig.test" },
          }),
        );
        return;
      }
      if (verifyMode === "empty200") {
        // A 200 with NO access_token. GoTrue does this on some arms, and a route that read the
        // STATUS instead of the token would call it verified.
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ user: null }));
        return;
      }
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "invalid_grant", error_description: "Token has expired or is invalid" }));
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

// PER-RUN UNIQUE, AND THAT IS NOT COSMETIC. The C2 limb counts attempts per ORIGIN DIGEST over
// a rolling 15 minutes, and the digest is a pure function of the address. A fixed fixture
// address therefore inherits every attempt the PREVIOUS run of this file made — measured: with
// a counter over `198.51.100.10..209` the rate cell reddened on the second run inside the
// window, because five leftover rejected attempts were already in the origin's budget. The
// documentation-range IPv6 block gives each run its own key space, so the cells are isolated
// from their own history as well as from a sibling lane's.
const IP_RUN_KEY = randomUUID().replaceAll("-", "").slice(0, 12);
let ipCounter = 0;
const freshIp = () =>
  `2001:db8:c5:${IP_RUN_KEY.slice(0, 4)}:${IP_RUN_KEY.slice(4, 8)}:${IP_RUN_KEY.slice(8, 12)}::${(ipCounter++).toString(16)}`;

async function confirm(body, { ip = freshIp(), token = SERVICE_TOKEN_FIXTURE, path = "/api/auth-wall/confirm" } = {}) {
  const headers = { "content-type": "application/json" };
  if (token !== null) headers.authorization = `Bearer ${token}`;
  if (ip !== null) headers[TRUSTED_HEADER] = ip;
  const res = await fetch(`${base}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

const attemptsFor = (email, ip) =>
  rig
    .rootQuery(
      "select id,outcome,settled_at from clara.confirmation_attempts where email_digest=$1 and origin_digest=$2 order by attempted_at",
      [emailDigestFor(email), pepperedDigest(ip)],
    )
    .then((r) => r.rows);

// ---------------------------------------------------------------------------

test("c5aw.1 A-M3 — a request naming an attempt or an outcome is REFUSED, not ignored", { skip }, async () => {
  const email = `c5aw1_${randomUUID()}@rig.test`;
  const ip = freshIp();
  for (const field of ["attempt_id", "attemptId", "outcome"]) {
    const res = await confirm({ email, token: "123456", [field]: field === "outcome" ? "accepted" : randomUUID() }, { ip });
    assert.equal(res.status, 400, field);
    assert.equal(res.json.error, "unexpected_field", field);
    assert.match(res.json.message, new RegExp(field), "the refusal must name the field so the caller fixes it");
  }
  // AND the refusal happened before anything was claimed — a refused shape must not spend one
  // of the applicant's five guesses.
  assert.deepEqual(await attemptsFor(email, ip), []);
});

test("c5aw.2 A-M3 — there is NO claim route and NO settle route", { skip }, async () => {
  for (const path of ["/api/auth-wall/claim", "/api/auth-wall/settle", "/api/auth-wall"]) {
    const res = await confirm({ email: "x@rig.test", token: "123456" }, { path });
    assert.equal(res.status, 404, path);
    assert.deepEqual(res.json, { error: "no_such_route" }, path);
  }
});

test("c5aw.3 the ACCEPTED arm — verified, settled 'accepted', and attempt_id never on the wire", { skip }, async () => {
  verifyMode = "accept";
  const email = `c5aw3_${randomUUID()}@rig.test`;
  const ip = freshIp();
  const before = verifyCalls.length;
  const res = await confirm({ email, token: "654321" }, { ip });

  assert.equal(res.status, 200);
  assert.equal(res.json.allowed, true);
  assert.equal(res.json.verified, true);
  assert.equal(typeof res.json.remaining, "number");
  assert.ok(res.json.session?.access_token, "apps/web needs the session to seal its own cookie");

  // THE PROPERTY. Not "attempt_id is undefined" — the whole serialised body is searched, so a
  // future field that carried it under another name reddens here too.
  const rows = await attemptsFor(email, ip);
  assert.equal(rows.length, 1);
  assert.equal(JSON.stringify(res.json).includes(rows[0].id), false, "attempt_id crossed the wire");
  assert.equal(Object.hasOwn(res.json, "attempt_id"), false);
  assert.equal(Object.hasOwn(res.json, "attemptId"), false);

  // The outcome came from the verification, and the row says so.
  assert.equal(rows[0].outcome, "accepted");
  assert.ok(rows[0].settled_at);

  // What the route actually SENT to GoTrue — the shape `supabase-js` sends, read off the wire.
  assert.equal(verifyCalls.length, before + 1);
  const call = verifyCalls[verifyCalls.length - 1];
  assert.equal(call.url, "/auth/v1/verify");
  assert.equal(call.headers.apikey, ANON_FIXTURE);
  assert.equal(call.body.type, "signup");
  assert.equal(call.body.email, email);
  assert.equal(call.body.token, "654321");
});

test("c5aw.4 the REJECTED arm — a wrong code settles 'rejected' and mints no session", { skip }, async () => {
  verifyMode = "reject";
  const email = `c5aw4_${randomUUID()}@rig.test`;
  const ip = freshIp();
  const res = await confirm({ email, token: "000000" }, { ip });
  assert.equal(res.status, 200);
  assert.equal(res.json.allowed, true, "the WALL allowed the attempt; the CODE was wrong — two different facts");
  assert.equal(res.json.verified, false);
  assert.equal(res.json.session, null);
  const rows = await attemptsFor(email, ip);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].outcome, "rejected");

  // A 200 carrying NO access_token is ALSO unverified. A route that read the STATUS rather than
  // the token would call this a success and mint a firm-owning session out of nothing.
  verifyMode = "empty200";
  const email2 = `c5aw4b_${randomUUID()}@rig.test`;
  const ip2 = freshIp();
  const res2 = await confirm({ email: email2, token: "000000" }, { ip: ip2 });
  assert.equal(res2.json.verified, false);
  assert.equal((await attemptsFor(email2, ip2))[0].outcome, "rejected");
  verifyMode = "accept";
});

test("c5aw.5 the RATE WALL through the route — the sixth guess is 429 with the door's own numbers", { skip }, async () => {
  verifyMode = "reject";
  const email = `c5aw5_${randomUUID()}@rig.test`;
  const ip = freshIp();
  for (let i = 0; i < 5; i += 1) {
    const res = await confirm({ email, token: "000000" }, { ip });
    assert.equal(res.status, 200, `guess ${i + 1} should be allowed`);
    assert.equal(res.json.allowed, true);
    // `remaining` counts attempts left AFTER this one (0161's F5 fix), so the fifth reads 0.
    assert.equal(res.json.remaining, 4 - i, `guess ${i + 1} remaining`);
  }
  const sixth = await confirm({ email, token: "000000" }, { ip });
  assert.equal(sixth.status, 429);
  assert.equal(sixth.json.allowed, false);
  assert.ok(["email", "origin"].includes(sixth.json.scope), `scope was ${sixth.json.scope}`);
  // The seam's own display bounds (part 1 §3.4): remaining in [0,5], retryAfterSeconds in
  // [0,900]. Outside them the confirm page renders the generic `invalid` card instead of the
  // honest wait, so a door change that widened either would break the page silently.
  assert.ok(sixth.json.retry_after_seconds >= 0 && sixth.json.retry_after_seconds <= 900);
  assert.ok(sixth.json.remaining >= 0 && sixth.json.remaining <= 5);
  assert.equal(JSON.stringify(sixth.json).includes("attempt_id"), false);

  // THE REFUSAL COST A GUESS AND CALLED NO VERIFIER — the wall runs BEFORE verifyOtp
  // (design part 3 §2.1: "the attempt is recorded BEFORE the verification, never after").
  const callsBefore = verifyCalls.length;
  const seventh = await confirm({ email, token: "000000" }, { ip });
  assert.equal(seventh.status, 429);
  assert.equal(verifyCalls.length, callsBefore, "a refused claim must not reach the verifier");
  assert.equal((await attemptsFor(email, ip)).length, 7, "a refused attempt is still recorded");
  verifyMode = "accept";
});

test("c5aw.6 the service-token gate — no bearer, a wrong bearer, and an unset token", { skip }, async () => {
  const email = `c5aw6_${randomUUID()}@rig.test`;
  const ip = freshIp();
  assert.equal((await confirm({ email, token: "1" }, { ip, token: null })).status, 401);
  assert.equal((await confirm({ email, token: "1" }, { ip, token: "wrong-token-of-the-same-ish-length" })).status, 401);
  // A token of the SAME length but different bytes — the arm a length-only compare would pass.
  const sameLength = `${"x".repeat(SERVICE_TOKEN_FIXTURE.length)}`;
  assert.equal(sameLength.length, SERVICE_TOKEN_FIXTURE.length);
  assert.equal((await confirm({ email, token: "1" }, { ip, token: sameLength })).status, 401);
  assert.deepEqual(await attemptsFor(email, ip), [], "an unauthorised request must claim nothing");

  // FAIL CLOSED when the token is not configured at all — never "allow when unset".
  setEnv({ CLARA_AUTH_WALL_SERVICE_TOKEN: undefined });
  const res = await confirm({ email, token: "1" }, { ip });
  assert.equal(res.status, 503);
  assert.deepEqual(res.json, { error: "auth_wall_unconfigured" });
  setEnv({ CLARA_AUTH_WALL_SERVICE_TOKEN: SERVICE_TOKEN_FIXTURE });
});

test("c5aw.7 M1 — no trusted client-IP header means NO claim at all", { skip }, async () => {
  const email = `c5aw7_${randomUUID()}@rig.test`;
  // The request carries an Origin, a Referer and a Host. None of them is a client address, and
  // the route must not quietly key the wall on one of them (the M1 defect).
  const res = await fetch(`${base}/api/auth-wall/confirm`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${SERVICE_TOKEN_FIXTURE}`,
      origin: "https://app.clarabook.test",
      referer: "https://app.clarabook.test/auth/confirm",
    },
    body: JSON.stringify({ email, token: "123456" }),
  });
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { error: "origin_digest_unavailable" });
  const any = await rig.rootQuery(
    "select count(*)::int as n from clara.confirmation_attempts where email_digest=$1",
    [emailDigestFor(email)],
  );
  assert.equal(any.rows[0].n, 0, "no digest ⇒ no attempt row");

  // The same for a missing pepper.
  setEnv({ CLARA_RATE_WALL_PEPPER: undefined });
  const res2 = await confirm({ email, token: "123456" });
  assert.equal(res2.status, 503);
  setEnv({ CLARA_RATE_WALL_PEPPER: PEPPER_FIXTURE });
});

test("c5aw.8 a malformed body is refused before anything is claimed", { skip }, async () => {
  const ip = freshIp();
  for (const body of [{}, { email: "" }, { email: "a@b.test" }, { token: "123456" }, { email: "a@b.test", token: "" }]) {
    const res = await confirm(body, { ip });
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal(res.json.error, "bad_request", JSON.stringify(body));
  }
});

test("c5aw.9 W-O for the auth wall — EXACTLY two routines, zero relations", { skip }, async () => {
  const routines = await rig.rootQuery(
    `select p.oid::regprocedure::text as sig
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='clara' and has_function_privilege('clara_auth_wall',p.oid,'EXECUTE')
      order by 1`,
  );
  assert.deepEqual(
    routines.rows.map((r) => r.sig),
    ["clara.claim_confirmation_attempt(bytea,bytea)", "clara.settle_confirmation_attempt(uuid,text)"],
  );
  const relations = await rig.rootQuery(
    `select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='clara' and c.relkind in ('r','v','m','p')
        and (has_table_privilege('clara_auth_wall',c.oid,'SELECT')
          or has_table_privilege('clara_auth_wall',c.oid,'INSERT')
          or has_table_privilege('clara_auth_wall',c.oid,'UPDATE')
          or has_table_privilege('clara_auth_wall',c.oid,'DELETE'))
      order by 1`,
  );
  assert.deepEqual(relations.rows.map((r) => r.relname), []);
  // And no route into the human lane — the wall the 0022 post-verify gate maintains estate-wide.
  const reach = await rig.rootQuery(
    `select pg_has_role('clara_auth_wall','clara_authenticated','MEMBER') as member,
            pg_has_role('clara_auth_wall','clara_authenticated','SET') as can_set`,
  );
  assert.deepEqual(reach.rows[0], { member: false, can_set: false });
});
