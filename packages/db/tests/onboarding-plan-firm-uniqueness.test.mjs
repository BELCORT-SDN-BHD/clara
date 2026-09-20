// #894 — HARDEN `uq_onboarding_plans_one_open_firm`'s PREDICATE: "a firm holds exactly one
// firm-scope onboarding plan for life" becomes a database FACT, not the sole writer's discipline.
// Migration: 0255_onboarding_plan_firm_uniqueness.sql. Frontier-gated on its own STABLE STEM
// (`onboarding_plan_firm_uniqueness$`), never its number — numbers are claimed at merge
// (packages/db/README.md) — the `legal_acceptance$` / `checkout_convergence$` idiom.
//
// CONTRACT-BLIND against the migration's own tail: its `raise notice ... OK` describes one
// apply, this file describes the live catalog (packages/db/README.md, "Migration and deployment
// behavior").
//
// WHAT IS UNDER TEST, and which acceptance criterion each cell carries:
//   AC1 (the migration's prestate wall refuses to apply over an existing any-state duplicate) is
//     proven by the migration file itself at apply time (0255 §0.7) — not re-run here, since
//     re-running it would mean corrupting THIS database's live data, which no lane may do
//     (RIG.md: never a second from-scratch chain, never a reset). §0.7's own text is the
//     evidence; see the ticket report for a pointer to it.
//   AC2 — a second firm-scope plan for the SAME firm is refused in ANY state, including when the
//     first is CLOSED (cancelled) (cell `p894.plans.any_state`).
//   AC3 — `clara.claim_paid_firm`'s replay arm still answers the ORIGINAL receipt once a real
//     firm has been claimed through the live checkout doors, under the new index (cell
//     `p894.claim.replay`).
//   AC4 — the migration applies from scratch (it is part of the lane's own from-scratch chain;
//     `packages/db/README.md`'s deploy-onto-existing / from-scratch proof covers this, not a rig
//     cell) and its tail re-reads the committed index definition (0255's own §2, restated here as
//     a LIVE re-read rather than trusted — cell `p894.index.identity`).
//
// ROLE DISCIPLINE: cell 1 and the closed half of cell 2 are ROOT by construction — they probe
// `pg_index` directly and plant a plan row no door writes (a firm-scope plan that is already
// CANCELLED with no client ever created one through `clara.commit_client_onboarding` or any
// other door — there is no door that closes a FIRM plan at all, per the ticket's own "out of
// scope"). Cell 3 (the replay arm) drives every step through the REAL doors
// (`clara.open_checkout_intent`, the Stripe applier, `clara.claim_paid_firm`) via the
// `checkout-convergence` fixtures — the SAME `claimPaidFirm` / `liveCheckout` / `deliver` helpers
// `checkout-convergence.test.mjs` itself drives, so this file adds no second implementation of
// that world.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { endPool, insertUser, rootQuery } from "./rig-fixtures.mjs";
import {
  claimPaidFirm, clearOperator, deliver, EVENT, ensureOperatorOwner, liveCheckout, releaseCapacity,
} from "./checkout-convergence-fixtures.mjs";

/** #894's STABLE STEM. */
const STEM = "onboarding_plan_firm_uniqueness$";
const NEW_INDEX = "uq_onboarding_plans_one_firm";
const OLD_INDEX = "uq_onboarding_plans_one_open_firm";

let ready = false;
let operator = null;
let executed = 0;
const EXPECTED_CELLS = 3;

/** True iff a migration whose version matches the stem is recorded applied. Catalog-probed
 *  against `clara.schema_migrations`, never inferred from a file listing. */
async function laneReady() {
  const r = await rootQuery(
    "select count(*)::int as n from clara.schema_migrations where version ~ $1", [STEM]);
  return r.rows[0].n > 0;
}

before(async () => {
  ready = await laneReady();
  if (ready) operator = await ensureOperatorOwner();
});

after(async () => {
  if (operator) await releaseCapacity(operator.owner);
  await clearOperator();
  if (ready) {
    assert.equal(executed, EXPECTED_CELLS, `expected ${EXPECTED_CELLS} cells to run, ${executed} did`);
  }
  await endPool();
});

function gate(t) {
  if (ready) return false;
  if (process.env.CLARA_ALLOW_MISSING_ONBOARDING_PLAN_FIRM_UNIQUENESS === "1") {
    console.warn(`SKIP onboarding-plan-firm-uniqueness: no ${STEM} migration applied (explicit pre-integration run).`);
    t.skip("onboarding-plan-firm-uniqueness lane absent -- explicit pre-integration run");
    return true;
  }
  assert.fail(
    `the #894 onboarding-plan-firm-uniqueness lane is required for a focused run: apply 0255_onboarding_plan_firm_uniqueness.sql`);
}

function cell(name, fn) {
  test(name, async (t) => {
    if (gate(t)) return;
    executed += 1;
    await fn(t);
  });
}

cell("p894.index.identity the committed index carries the new name and the widened predicate; the old name is gone", async () => {
  const oldGone = await rootQuery(`select to_regclass('clara.${OLD_INDEX}') as r`);
  assert.equal(oldGone.rows[0].r, null, "the renamed index must not leave the old name behind");

  const def = await rootQuery(
    `select pg_get_indexdef(i.indexrelid) as d from pg_index i where i.indexrelid = 'clara.${NEW_INDEX}'::regclass`);
  assert.equal(def.rows[0].d,
    "CREATE UNIQUE INDEX uq_onboarding_plans_one_firm ON clara.onboarding_plans USING btree (firm_id) WHERE (scope_kind = 'firm'::text)");

  // …and the CLIENT-scope sibling (0017) is untouched by the rename.
  const sibling = await rootQuery(
    "select pg_get_indexdef(i.indexrelid) as d from pg_index i where i.indexrelid = 'clara.uq_onboarding_plans_one_open'::regclass");
  assert.match(sibling.rows[0].d, /\(firm_id, client_id\)/);
});

cell("p894.plans.any_state a second firm-scope plan for the same firm is refused in ANY state, including when the first is CLOSED", async () => {
  const suffix = randomUUID().slice(0, 8);
  const firm = (await rootQuery(
    "insert into clara.firms(name) values ($1) returning id", [`p894_${suffix}`])).rows[0].id;
  const owner = await insertUser("p894", suffix);

  // The firm's ONE plan, already CLOSED (cancelled) -- exactly the case the OLD `state='open'`
  // predicate would have let a second plan straight through on.
  await rootQuery(
    `insert into clara.onboarding_plans(firm_id, scope_kind, state, cancelled_at, cancelled_by, cancel_reason)
     values ($1,'firm','cancelled', now(), $2, 'p894 fixture: closing the firm''s one plan')`,
    [firm, owner]);

  const err = await rootQuery(
    `insert into clara.onboarding_plans(firm_id, scope_kind, review_maker, reviewed_at, contributors)
     values ($1,'firm',$2, now(), array[$2]::uuid[])`, [firm, owner]).catch((e) => e);
  assert.ok(err instanceof Error, "a second firm-scope plan was admitted over a CLOSED first one");
  assert.equal(err.code, "23505");
  assert.equal(err.constraint, NEW_INDEX);

  // …while a CLIENT plan on the same firm is untouched by it (0017's index still governs those).
  const client = (await rootQuery(
    "insert into clara.clients(firm_id, name, status) values ($1,$2,'active') returning id",
    [firm, `p894 client ${suffix}`])).rows[0].id;
  const ok = await rootQuery(
    `insert into clara.onboarding_plans(firm_id, scope_kind, client_id, review_maker, reviewed_at, contributors)
     values ($1,'client',$2,$3, now(), array[$3]::uuid[]) returning id`,
    [firm, client, owner]);
  assert.ok(ok.rows[0].id);
});

cell("p894.claim.replay clara.claim_paid_firm's replay arm still answers the ORIGINAL receipt under the widened index", async () => {
  const world = await liveCheckout(operator.owner, { tag: "p894" });
  await deliver({
    type: EVENT.asyncSucceeded, intent: world.intent, registration: world.registration,
    applicant: world.sub, session: world.session,
    projection: { payment_status: "paid", mode: "subscription", session_status: "complete" },
  });

  const claimed = await claimPaidFirm(world.sub, world.email, world.registration);
  assert.ok(claimed.firm_id, "the first claim minted a firm");
  assert.ok(claimed.plan_id, "…and its firm-scope onboarding plan");

  const replay = await claimPaidFirm(world.sub, world.email, world.registration);
  assert.equal(replay.firm_id, claimed.firm_id, "the replay names the SAME firm");
  assert.equal(replay.plan_id, claimed.plan_id, "…and the SAME plan");
  assert.equal(replay.replay, true);

  // …and that answer is not merely lucky: the NEW index's own promise is that exactly ONE
  // firm-scope plan exists for this firm, full stop.
  const plans = await rootQuery(
    "select count(*)::int as n from clara.onboarding_plans where firm_id=$1 and scope_kind='firm'",
    [claimed.firm_id]);
  assert.equal(plans.rows[0].n, 1);
});
