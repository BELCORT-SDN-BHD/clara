// #871 — THE SIGNED-OUT INVITE PREVIEW LANE, driven through the SHIPPED router against a real
// migrated Postgres.
//
// The owner's ruling of 2026-09-23 puts this lane on the auth-wall's own shape: a NOLOGIN group
// role the runtime reaches through its own pool, and ONE courier route (peppered, trusted header,
// no cookie) that `apps/web`'s server calls. So the properties below are asserted against the
// composed express app and against the pool wrapper, never against a helper's copy of either.
//
// THE SEAMS (WORK-ORDER rule 4):
//   S5. `previewInviteByToken(token, originDigest)` — the pool wrapper. One frozen statement, the
//       lane's SET ROLE, and the door's own receipt returned verbatim.
//   S6. `POST /api/invite-preview` — the courier route: the service-token bearer, the trusted
//       client-IP header, the peppered digest, and the three outcomes mapped to three statuses.
//
// WHY THE ROUTE GETS ITS OWN CELLS RATHER THAN TRUSTING THE DOOR'S. Everything the DB can prove
// about the preview is proven in `packages/db/tests/invite-preview-public.test.mjs` under real
// least-privileged roles. What only the route can prove is the half the DB cannot see: that an
// anonymous caller is refused, that a caller who forges the client address cannot mint a fresh
// rate-wall budget, and that no answer of any shape crosses the wire without the pepper.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import http from "node:http";
import express from "express";
import { register } from "tsx/esm/api";

import * as rig from "./rig.mjs";
import { cohortGate } from "./c5-cohort-gate.mjs";
import { pepperedDigest } from "../lib/rate-wall-courier.mjs";
import { endPools } from "../lib/pools.mjs";

register();

const SERVICE_TOKEN_FIXTURE = "p871-db-service-token-fixture";
const PEPPER_FIXTURE = "p871-db-pepper";
const TRUSTED_HEADER = "x-clara-test-client-ip";

const skip = await cohortGate(
  "the signed-out invite-preview cohort (0309)",
  `select to_regprocedure('clara.preview_invite_by_token(text,bytea)') is not null as ok`,
);
const READY = skip === false;

const PREVIEW_PATH = "/api/invite-preview";
let app = null;
let server = null;
let base = "";

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
  setEnv({
    CLARA_AUTH_WALL_SERVICE_TOKEN: SERVICE_TOKEN_FIXTURE,
    CLARA_RATE_WALL_PEPPER: PEPPER_FIXTURE,
    CLARA_TRUSTED_CLIENT_IP_HEADER: TRUSTED_HEADER,
  });

  const { invitePreviewRoutes } = await import("../src/invitePreviewRoutes.ts");
  app = express();
  app.use(invitePreviewRoutes());
  app.use((_req, res) => res.status(404).json({ error: "no_such_route" }));
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  setEnv(priorEnv);
  await endPools();
  await rig.endPool();
});

/** PER-RUN UNIQUE ADDRESSES, for the reason c5-auth-wall-db.test.mjs measured: the origin limb
 *  counts per DIGEST over a rolling fifteen minutes, and the digest is a pure function of the
 *  address, so a fixed fixture inherits every attempt the previous run made. */
const IP_RUN_KEY = randomUUID().replaceAll("-", "").slice(0, 12);
let ipCounter = 0;
const freshIp = () =>
  `2001:db8:871:${IP_RUN_KEY.slice(0, 4)}:${IP_RUN_KEY.slice(4, 8)}:${IP_RUN_KEY.slice(8, 12)}::${(ipCounter++).toString(16)}`;

/** A firm with an owner and an admin who issues invites, then one pending invitation. */
async function pendingInvite(tag, role = "bookkeeper") {
  // A per-invocation tag: `insertUser` derives a UNIQUE e-mail from prefix+tag, so a fixed one
  // collides with the previous run of this file on the same rig database.
  const uniq = `${tag}_${randomUUID().slice(0, 8)}`;
  const owner = await rig.insertUser("p871", `${uniq}_owner`);
  const token = await rig.seedAdmission(`p871-rt-${uniq}`);
  const name = `P871 RT ${tag} ${Date.now()}`;
  const firm = await rig.createFirm(owner, { name, token, opKey: rig.opk(`firm_${uniq}`) });
  const admin = await rig.addMember(owner, firm, { role: "admin", prefix: `p871${uniq}` });
  const email = `p871_${uniq}@rig.test`;
  const issued = await rig.humanQuery(
    admin,
    "select clara.invite_member(p_email => $1, p_role => $2, p_op_key => $3) as receipt",
    [email, role, rig.opk(`inv_${uniq}`)],
  );
  return { firm, firmName: name, owner, admin, email, ...issued.rows[0].receipt };
}

// ---------------------------------------------------------------------------
// S5 — the pool wrapper
// ---------------------------------------------------------------------------

test("p871rt.pool — the lane issues ONE frozen statement and returns the door's own receipt verbatim", { skip }, async () => {
  const { previewInviteByToken, INVITE_PREVIEW_POOL_SQL_TEXTS, INVITE_PREVIEW_ROLE, INVITE_PREVIEW_LOGIN } =
    await import("../lib/invite-preview-pool.mjs");

  // THE S-1 CENSUS, MECHANISED: every SQL text this module is capable of issuing. A lane whose
  // blast radius is one function has to be able to SHOW that, not promise it.
  assert.deepEqual(INVITE_PREVIEW_POOL_SQL_TEXTS, [
    "select clara.preview_invite_by_token($1::text,$2::bytea) as receipt",
  ]);
  assert.equal(INVITE_PREVIEW_ROLE, "clara_invite_preview");
  assert.equal(INVITE_PREVIEW_LOGIN, "clara_invite_preview_login");

  const inv = await pendingInvite("pool");
  const receipt = await previewInviteByToken(inv.token, pepperedDigest(freshIp()));
  assert.deepEqual(
    receipt,
    {
      outcome: "preview",
      firm_name: inv.firmName,
      role: "bookkeeper",
      status: "pending",
      masked_email: `${inv.email[0]}***@${inv.email.split("@")[1]}`,
    },
    "the door's own answer, untouched by this lane -- the runtime computes nothing the DB owns",
  );

  // …and the call ran as the LANE, not as the connection's own identity: the wall's evidence row
  // exists, which only the definer body can write.
  const rows = await rig.rootQuery(
    "select count(*)::int as n from clara.invite_preview_attempts where token_hash = sha256(convert_to($1,'UTF8'))",
    [inv.token],
  );
  assert.equal(rows.rows[0].n, 1, "one attempt was counted -- the wall ran inside the door");
});

// ---------------------------------------------------------------------------
// S6 -- the courier route
// ---------------------------------------------------------------------------

/** One request to the route, with the header bag the web server sends. */
async function preview(body, { ip = freshIp(), token = SERVICE_TOKEN_FIXTURE, path = PREVIEW_PATH, method = "POST" } = {}) {
  const headers = { "content-type": "application/json" };
  if (token !== null) headers.authorization = `Bearer ${token}`;
  if (ip !== null) headers[TRUSTED_HEADER] = ip;
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: method === "POST" ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null, headers: res.headers };
}

const attemptsFor = (token) =>
  rig
    .rootQuery(
      "select count(*)::int as n from clara.invite_preview_attempts where token_hash = sha256(convert_to($1,'UTF8'))",
      [token],
    )
    .then((r) => r.rows[0].n);

test("p871rt.route.bearer -- an anonymous or wrongly-bearing caller is 401 and spends NOBODY's budget", { skip }, async () => {
  const inv = await pendingInvite("bearer");
  for (const bad of [null, "not-the-service-token", `${SERVICE_TOKEN_FIXTURE}x`]) {
    const res = await preview({ token: inv.token }, { token: bad });
    assert.equal(res.status, 401, String(bad));
    assert.deepEqual(res.json, { error: "unauthorized" }, String(bad));
  }
  assert.equal(await attemptsFor(inv.token), 0,
    "a refused caller never reaches the door, so the invitee's own wall is untouched by a stranger's probing");
});

test("p871rt.route.no_cookie -- the route carries no session: a cookie is neither read nor set", { skip }, async () => {
  const inv = await pendingInvite("cookie");
  const res = await fetch(`${base}${PREVIEW_PATH}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${SERVICE_TOKEN_FIXTURE}`,
      [TRUSTED_HEADER]: freshIp(),
      cookie: "sb-access-token=someone-elses-session; other=1",
    },
    body: JSON.stringify({ token: inv.token }),
  });
  assert.equal(res.status, 200, "a cookie changes nothing: the answer is the same");
  assert.equal(res.headers.get("set-cookie"), null, "and the route sets none");
  // …and the route has no CODE that could read or write one. The prose says "no cookie" in as many
  // words, so the scan is over the source with its comments stripped: a claim in a comment is not
  // a property, and a property asserted against prose is a test of the prose.
  const src = readFileSync(new URL("../src/invitePreviewRoutes.ts", import.meta.url), "utf8");
  const code = src.replace(/^\s*\/\/.*$/gm, "");
  for (const pattern of [/\bcookie/i, /\bsession\b/i]) {
    assert.equal(pattern.test(code), false,
      `the route's CODE must not mention ${pattern} -- this lane is pre-session by construction`);
  }
});

test("p871rt.route.trusted_header -- an absent or unparseable client address refuses 503 and counts nothing", { skip }, async () => {
  const inv = await pendingInvite("header");
  const absent = await preview({ token: inv.token }, { ip: null });
  assert.equal(absent.status, 503);
  assert.deepEqual(absent.json, { outcome: "unavailable" });
  const garbage = await preview({ token: inv.token }, { ip: "not-an-address" });
  assert.equal(garbage.status, 503, "a header that carries no IP literal is the same fail-closed arm");
  assert.deepEqual(garbage.json, { outcome: "unavailable" });
  assert.equal(await attemptsFor(inv.token), 0,
    "no digest means the wall cannot be keyed, so the call never reaches the door -- proceeding with a constant is the M1 defect in a new costume");
});

test("p871rt.route.pepper -- with the rate-wall pepper absent the route refuses rather than keying the wall on a constant", { skip }, async () => {
  const inv = await pendingInvite("pepper");
  const saved = process.env.CLARA_RATE_WALL_PEPPER;
  delete process.env.CLARA_RATE_WALL_PEPPER;
  try {
    const res = await preview({ token: inv.token });
    assert.equal(res.status, 503);
    assert.deepEqual(res.json, { outcome: "unavailable" });
  } finally {
    process.env.CLARA_RATE_WALL_PEPPER = saved;
  }
  assert.equal(await attemptsFor(inv.token), 0, "nothing was counted");
  // ...and with the pepper back, the same request is served -- so the cell above proved the
  // PEPPER's absence, not a broken fixture.
  const ok = await preview({ token: inv.token });
  assert.equal(ok.status, 200);
});

test("p871rt.route.body -- a missing, blank or non-string token is 400, and there is no GET entrance", { skip }, async () => {
  for (const body of [{}, { token: "" }, { token: "   " }, { token: 42 }, { token: null }]) {
    const res = await preview(body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.deepEqual(res.json, { outcome: "invalid_token" }, JSON.stringify(body));
  }
  // A GET would put the invite token in a URL -- in access logs, in Referer headers, in a proxy's
  // history. There is no GET entrance, and that is a property rather than an oversight.
  const get = await preview(null, { method: "GET" });
  assert.equal(get.status, 404);
});

test("p871rt.route.preview -- an OPEN invite answers 200 with the door's four fields and nothing else", { skip }, async () => {
  const inv = await pendingInvite("open", "admin");
  const res = await preview({ token: inv.token });
  assert.equal(res.status, 200);
  assert.deepEqual(res.json, {
    outcome: "preview",
    preview: {
      firm_name: inv.firmName,
      role: "admin",
      status: "pending",
      masked_email: `${inv.email[0]}***@${inv.email.split("@")[1]}`,
    },
  }, "the door's own four fields, relayed untouched");
  // THE PROPERTY, checked over the whole serialised body rather than key by key: neither the
  // token the caller sent nor the real address may come back.
  const wire = JSON.stringify(res.json);
  assert.equal(wire.includes(inv.token), false, "the token never comes back");
  assert.equal(wire.includes(inv.email), false, "the unmasked address never comes back");
  assert.equal(wire.includes(inv.admin), false, "the inviter never comes back");
});

test("p871rt.route.one_refusal -- an unknown, an expired and a revoked token get ONE identical 404", { skip }, async () => {
  const expired = await pendingInvite("rt_expired");
  await rig.rootQuery("update clara.firm_invites set expires_at = now() - interval '1 minute' where id = $1", [expired.invite_id]);
  const revoked = await pendingInvite("rt_revoked");
  await rig.humanQuery(revoked.admin, "select clara.revoke_invite(p_invite => $1, p_op_key => $2)", [
    revoked.invite_id, rig.opk("rt_rev"),
  ]);

  const unknown = await preview({ token: `unknown-${randomUUID()}` });
  const onExpired = await preview({ token: expired.token });
  const onRevoked = await preview({ token: revoked.token });

  assert.equal(unknown.status, 404);
  assert.deepEqual(unknown.json, { outcome: "not_previewable" });
  for (const [label, res] of [["expired", onExpired], ["revoked", onRevoked]]) {
    assert.equal(res.status, unknown.status, `${label}: the same status`);
    assert.deepEqual(res.json, unknown.json, `${label}: the same body, byte for byte -- no existence oracle`);
  }
});

test("p871rt.route.rate_wall -- the sixth read from one address is 429 with Retry-After, and the wall is the DOOR's, not this route's", { skip }, async () => {
  const inv = await pendingInvite("rt_wall");
  const ip = freshIp();
  const served = [];
  for (let i = 0; i < 5; i += 1) served.push(await preview({ token: inv.token }, { ip }));
  assert.deepEqual(served.map((r) => r.status), [200, 200, 200, 200, 200], "five reads are served");

  const walled = await preview({ token: inv.token }, { ip });
  assert.equal(walled.status, 429);
  assert.equal(walled.json.outcome, "rate_limited");
  assert.ok(Number.isInteger(walled.json.retryAfterSeconds) && walled.json.retryAfterSeconds >= 0
    && walled.json.retryAfterSeconds <= 900, `the wait is the door's own clamped integer, got ${walled.json.retryAfterSeconds}`);
  assert.equal(walled.headers.get("retry-after"), String(walled.json.retryAfterSeconds),
    "the header carries the same number the body does -- a proxy can see a lockout without parsing JSON");

  // A FORGED ADDRESS DOES NOT MINT A FRESH BUDGET FOR THE SAME LINK: the TOKEN limb is what stops
  // it, which is why this route is walled on two keys and not only on the caller's address.
  const fromElsewhere = await preview({ token: inv.token }, { ip: freshIp() });
  assert.equal(fromElsewhere.status, 429, "a new address does not buy a sixth read of the same link");
});
