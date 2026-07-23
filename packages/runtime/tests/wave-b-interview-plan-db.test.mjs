// Wave-B interview — DB-backed tests for the ONLY runtime-lane write the interview family
// performs: clara.update_onboarding_plan against the REAL 0017 schema (rig port 55432).
// Proves the receipt shape my writer parses, the CLR06 stale-revision raise (AMB-9), and
// my updatePlanWithCas re-read+retry path end-to-end. Gated on CLARA_RIG_DB=1 so the
// closure suites still run with no database. Stage: a firm owner (admin+ floor) births an
// onboarding client+plan via begin_client_onboarding (human lane, JWT-claims GUC); the
// interview writer then rides clara_runtime, exactly as production does.
//
//   Setup (once): a throwaway PG17 on 55432 with all 17 migrations + the core seed, then
//   PGHOST/PGPORT/PGUSER/PGDATABASE set and CLARA_RIG_DB=1.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";

const RIG = process.env.CLARA_RIG_DB === "1";
const skip = !RIG;

const { register } = await import("tsx/esm/api");
register();
const { updatePlanWithCas, readPlan, isStalePlan } = await import("../workflows/interview.v1.writer.ts");

// Firm A fixtures (packages/db seed 0002_core_seed): Alara Advisory. USER ids are fixed by
// the seed; FIRM ids are gen_random_uuid()'d at seed time and differ per rig — so the
// owner's firm is derived from the live membership row in before(), never hardcoded.
const OWNER_A = "5eed0000-0000-4000-8000-00000000a11e"; // owner (admin+ floor)
const BOOKKEEPER_A = "5eed0000-0000-4000-8000-00000000b0b1"; // active bookkeeper (a valid answered_by)
let FIRM_A;

let pg, client;

before(async () => {
  if (skip) return;
  pg = (await import("pg")).default;
  client = new pg.Client({
    host: process.env.PGHOST || "localhost",
    port: Number(process.env.PGPORT || 55432),
    user: process.env.PGUSER || "postgres",
    database: process.env.PGDATABASE || "clara_ci",
  });
  await client.connect();
  const fr = await client.query(
    "select firm_id from clara.firm_memberships where user_id=$1 and status='active' and role='owner'",
    [OWNER_A],
  );
  FIRM_A = fr.rows[0]?.firm_id;
  assert.ok(FIRM_A, "seed owner has exactly one active owner membership");
});

after(async () => {
  if (client) await client.end().catch(() => {});
});

/** Run fn as clara_runtime on the shared client (SET ROLE / RESET each call) — the
 *  interview's runtime lane. */
const withRuntime = async (fn) => {
  await client.query("set role clara_runtime");
  try {
    return await fn(client);
  } finally {
    await client.query("reset role").catch(() => {});
  }
};

/** Birth an onboarding client + plan via the human admin lane (JWT-claims GUC), returning
 *  {clientId, planId}. */
async function beginOnboarding(name) {
  await client.query("set role clara_authenticated");
  await client.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: OWNER_A, role: "authenticated" })]);
  const r = await client.query("select clara.begin_client_onboarding($1, $2) as receipt", [name, `begin:${name}`]);
  await client.query("select set_config('request.jwt.claims', '', false)");
  await client.query("reset role");
  return r.rows[0].receipt;
}

const ITEM = (key, state = "answered") => [{ item_key: key, item_kind: "capture", question: `q ${key}`, answer: { v: key }, state, required_for_commit: false }];

test("update_onboarding_plan happy path returns the receipt the writer parses", { skip }, async () => {
  const { client_id, plan_id } = await beginOnboarding(`DB Happy ${Date.now()}`);
  assert.ok(client_id && plan_id);
  const snap = await readPlan(withRuntime, plan_id);
  assert.equal(snap.state, "open");
  assert.equal(snap.firmId, FIRM_A);

  const out = await updatePlanWithCas(withRuntime, {
    planId: plan_id,
    expectedRevision: snap.revisionToken,
    items: ITEM("legal_name"),
    answeredBy: BOOKKEEPER_A,
    opKey: `happy:${plan_id}`,
    retryOpKey: `happy:${plan_id}:retry`,
  });
  assert.equal(out.status, "updated");
  assert.notEqual(out.revisionToken, snap.revisionToken, "revision advanced");
  assert.equal(out.revisionN, snap.revisionN + 1);

  // The item is persisted with the state we sent (P19 — only a confirmed answer reaches here).
  const persisted = await withRuntime((c) => c.query("select state from clara.onboarding_plan_items where plan_id=$1 and item_key='legal_name'", [plan_id]));
  assert.equal(persisted.rows[0].state, "answered");
});

test("a stale revision raises CLR06 (AMB-9), and updatePlanWithCas re-reads + retries ONCE to success", { skip }, async () => {
  const { plan_id } = await beginOnboarding(`DB Cas ${Date.now()}`);
  const snap0 = await readPlan(withRuntime, plan_id);

  // Bump the revision out from under us (a concurrent dashboard edit during a park).
  const bump = await updatePlanWithCas(withRuntime, {
    planId: plan_id, expectedRevision: snap0.revisionToken, items: ITEM("entity_type"),
    answeredBy: BOOKKEEPER_A, opKey: `bump:${plan_id}`, retryOpKey: `bump:${plan_id}:r`,
  });
  assert.notEqual(bump.revisionToken, snap0.revisionToken);

  // A raw call with the now-STALE token raises CLR06 (the DB behaviour my writer relies on).
  await assert.rejects(
    withRuntime((c) => c.query("select clara.update_onboarding_plan($1,$2,$3::jsonb,$4,$5)", [plan_id, snap0.revisionToken, JSON.stringify(ITEM("ssm")), BOOKKEEPER_A, `raw-stale:${plan_id}`])),
    (e) => isStalePlan(e),
    "raw stale update raises CLR06",
  );

  // The writer swallows that CLR06, re-reads the live revision, and retries once → success.
  const out = await updatePlanWithCas(withRuntime, {
    planId: plan_id, expectedRevision: snap0.revisionToken /* deliberately stale */, items: ITEM("fye"),
    answeredBy: BOOKKEEPER_A, opKey: `cas:${plan_id}`, retryOpKey: `cas:${plan_id}:retry`,
  });
  assert.equal(out.status, "updated");
  assert.equal(out.revisionN, bump.revisionN + 1, "the retry landed on the live revision");
});

test("update_onboarding_plan refuses an answered_by that is not an active bookkeeper+ (the real boundary)", { skip }, async () => {
  const { plan_id } = await beginOnboarding(`DB Authz ${Date.now()}`);
  const snap = await readPlan(withRuntime, plan_id);
  await assert.rejects(
    withRuntime((c) => c.query("select clara.update_onboarding_plan($1,$2,$3::jsonb,$4,$5)", [plan_id, snap.revisionToken, JSON.stringify(ITEM("x")), "00000000-0000-4000-8000-0000000000ff", `authz:${plan_id}`])),
    (e) => e.code === "CLR04",
    "a non-member answered_by is CLR04",
  );
});
