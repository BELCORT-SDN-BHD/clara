// Extraction slice X1 (migration 0022) — clara.set_firm_high_stakes_threshold.
//
// `firms.high_stakes_amount_cents` has been the DB-derived, non-bypassable criterion for
// the maker-checker lane since 0002 (0002:204; 0004:70-76) — and settable only by direct
// SQL for just as long. When BELCORT moved from RM10,000 to RM100,000 (PR #109) the change
// shipped as a hand-run file, packages/db/deploy/wave-b-highstakes-rm100k-amendment.sql,
// whose header records the debt this verb pays.
//
// The floor is OWNER, not admin: raising the threshold WIDENS what one person may approve
// alone. That is the firm's own risk posture, not bookkeeping.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  ROLES, CLR, rootQuery, roleQuery, opk, endPool, buildWorld, assertRaises,
  has0022, fail0022, setHighStakes, firmThreshold, auditArgs,
} from "./x1-helpers.mjs";

let W = null;
let live = false;

before(async () => {
  try {
    const { ensureReady } = await import("./rig-docs-fixtures.mjs");
    await ensureReady();
  } catch { /* dirty tree — probe the live catalog as-is */ }
  live = await has0022();
  if (live) W = await buildWorld();
});
after(async () => { await endPool(); });

const gate = () => fail0022(live);

const RM10K = 1_000_000;
const RM100K = 10_000_000;

// ===========================================================================

test("[0022] the owner moves the threshold RM10,000 -> RM100,000 and the receipt names both figures", async () => {
  gate();
  assert.equal(Number(await firmThreshold(W.firms.A)), RM10K,
    "a fresh firm starts at the RM10,000 default (mandatory setup)");

  const res = await setHighStakes(W.users.alice, { cents: RM100K, opKey: opk("hs") });
  assert.equal(res.firm_id, W.firms.A, "the receipt names the caller's firm");
  assert.equal(Number(res.old_cents), RM10K, "…the value it was");
  assert.equal(Number(res.new_cents), RM100K, "…and the value it now is");
  assert.equal(Number(await firmThreshold(W.firms.A)), RM100K, "the committed row carries the new value");

  const aud = await auditArgs("set_firm_high_stakes_threshold", "new_cents", RM100K);
  assert.ok(aud, "an audit row exists");
  assert.equal(aud.actor, W.users.alice, "…attributed to the owner who set it");
  assert.equal(Number(aud.args.old_cents), RM10K,
    "…and it carries the OLD value too: an audit that records only the new figure cannot "
    + "answer 'what was it before this call', which is the question an investigation asks");
  assert.equal(Number(aud.args.new_cents), RM100K, "…alongside the new one");
});

test("[0022] the threshold is REALLY the maker-checker criterion, not a display number", async () => {
  gate();
  // The point of the verb is that it moves a live authority boundary — asserting the column
  // changed proves a write, not an effect. is_high_stakes derives from this column, so an
  // amount BETWEEN the old and new thresholds must change classification with the setting.
  // Firm S, untouched by the cells above.
  const mid = 5_000_000; // RM50,000: over RM10k, under RM100k
  const isHighStakes = async (cents) => (await rootQuery(
    `select $2::bigint >= f.high_stakes_amount_cents as hs from clara.firms f where f.id=$1`,
    [W.firms.S, cents])).rows[0].hs;

  assert.equal(await isHighStakes(mid), true, "at the RM10,000 default RM50,000 is high-stakes");
  await setHighStakes(W.users.erin, { cents: RM100K, opKey: opk("hs") });
  assert.equal(await isHighStakes(mid), false, "…and at RM100,000 the same amount is routine");
  await setHighStakes(W.users.erin, { cents: RM10K, opKey: opk("hs") });
  assert.equal(await isHighStakes(mid), true, "…and back again — the verb moves a live boundary");
});

test("[0022] the floor is OWNER: a bookkeeper and an ADMIN are both refused", async () => {
  gate();
  // Deliberately proving ADMIN too, not just a low role: admin (rank 2) sits one step below
  // owner (rank 3) and is the floor most of the firm's other setup verbs use, so "admin is
  // refused" is the assertion that actually pins this verb's floor.
  await rootQuery(
    "update clara.firm_memberships set role='admin' where firm_id=$1 and user_id=$2 and status='active'",
    [W.firms.A, W.users.bob]);
  try {
    await assertRaises(CLR.authz,
      () => setHighStakes(W.users.bob, { cents: RM100K, opKey: opk("hs") }),
      "an ADMIN moving the high-stakes threshold");
  } finally {
    await rootQuery(
      "update clara.firm_memberships set role='bookkeeper' where firm_id=$1 and user_id=$2 and status='active'",
      [W.firms.A, W.users.bob]);
  }
  await assertRaises(CLR.authz,
    () => setHighStakes(W.users.carol, { cents: RM100K, opKey: opk("hs") }),
    "a viewer moving the high-stakes threshold");
});

test("[0022] zero, negative and null are refused BEFORE the column CHECK sees them", async () => {
  gate();
  const before_ = await firmThreshold(W.firms.B);
  for (const [label, cents] of [["zero", 0], ["a negative amount", -1], ["null", null]]) {
    await assertRaises(CLR.badRequest,
      () => setHighStakes(W.users.dave, { cents, opKey: opk("hs") }),
      `${label} as a high-stakes threshold`);
  }
  for (const [label, key] of [["a null op_key", null], ["a blank op_key", "   "]]) {
    await assertRaises(CLR.badRequest,
      () => setHighStakes(W.users.dave, { cents: RM100K, opKey: key }), label);
  }
  assert.equal(await firmThreshold(W.firms.B), before_, "no refused call moved the threshold");
});

test("[0022] the verb touches the CALLER'S firm and no other", async () => {
  gate();
  const otherBefore = await firmThreshold(W.firms.B);
  await setHighStakes(W.users.alice, { cents: 2_500_000, opKey: opk("hs") });
  assert.equal(Number(await firmThreshold(W.firms.A)), 2_500_000, "firm A moved");
  assert.equal(await firmThreshold(W.firms.B), otherBefore,
    "…and firm B did not: there is no p_firm argument by design, so cross-firm reach is a "
    + "structural impossibility rather than a body check that could be got wrong");
});

test("[0022] re-affirming the SAME value under a NEW op_key is allowed and audited", async () => {
  gate();
  const cents = 7_777_700;
  await setHighStakes(W.users.erin, { cents, opKey: opk("hs") });
  const again = await setHighStakes(W.users.erin, { cents, opKey: opk("hs") });
  assert.equal(Number(again.old_cents), cents, "the second call reports the value was already that");
  assert.equal(Number(again.new_cents), cents, "…and set it to the same");
  const n = await rootQuery(
    `select count(*)::int n from clara.audit_log
      where fn='set_firm_high_stakes_threshold' and firm_id=$1 and args->>'new_cents'=$2`,
    [W.firms.S, String(cents)]);
  assert.equal(n.rows[0].n, 2,
    "TWO audit rows: the outcome is idempotent but the ACT is not — 'the owner re-affirmed "
    + "this today' is a receipt worth having, and refusing it would only teach people to "
    + "work around the verb");
});

test("[0022] the same op_key replays; a different amount under it is refused", async () => {
  gate();
  const key = opk("hs");
  const first = await setHighStakes(W.users.dave, { cents: 3_000_000, opKey: key });
  const replay = await setHighStakes(W.users.dave, { cents: 3_000_000, opKey: key });
  assert.deepEqual(replay, first, "the exact op_key returns the stored receipt byte-identically");
  await assertRaises(CLR.badRequest,
    () => setHighStakes(W.users.dave, { cents: 4_000_000, opKey: key }),
    "a different amount under the same op_key");
  assert.equal(Number(await firmThreshold(W.firms.B)), 3_000_000, "…and the threshold did not move");
});

test("[0022] NO machine lane can move a firm's high-stakes threshold", async () => {
  gate();
  for (const role of [ROLES.runtime, ROLES.agentRo, ROLES.wakeInteractive, ROLES.wakeProactive]) {
    if (!role) continue;
    const err = await roleQuery(role,
      "select clara.set_firm_high_stakes_threshold($1::bigint,$2)", [RM100K, opk("hs")])
      .then(() => null, (e) => e);
    assert.ok(err, `${role} must not be able to execute set_firm_high_stakes_threshold`);
    assert.equal(err.code, "42501", `${role} is refused at the GRANT, not inside the body`);
  }
  const allow = await rootQuery(
    "select count(*)::int n from clara.wake_fn_allowlist where function_name='set_firm_high_stakes_threshold'");
  assert.equal(allow.rows[0].n, 0, "…and no wake allowlist row admits it for any wake kind");
});
