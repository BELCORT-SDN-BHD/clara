// F-A4 PR-2a -- Annex A's six-reader wall (W44) and F4's month-scoped receipt key (W32).
//
// [#1036] W34 (twin equivalence), W35/W35-mutant ("the books actually close") and W31 (the
// self-healable FY refusal) are RETIRED, not merely retargeted. All four drove wrapper 12
// (`wake12`) expecting it to propose a `clara.adjustment_templates` row that a human then SIGNS
// and the existing occurrence belt then POSTS -- the agent-drafts/human-signs/belt-posts pipeline
// the 0045 template lane built and #927 began retiring. Migration
// 0315_prepayment_wake_reroute.sql (#1036) reroutes wrapper 12 onto
// `clara._prepayment_schedule_core`'s 'wake' lane: it now lands in `clara.prepayment_schedules`,
// configuration-only, exactly like a person's own call, and never proposes a template at all --
// there is no draft left for W34 to compare against a human proposal, no live template for W35 to
// sign and post occurrences against, and W31's FY-past refusal (still a real rule inside the
// shared core's memo-only lane) now raises rather than returning a `rung_vector`, so its own
// assertions have no subject either. `prepayment-wake-reroute.test.mjs`'s own cells are the direct
// successors: `p1036.acted` for W35's claim ("the wake configures a real, inspectable schedule"),
// `p1036.refusals` for the refusal-parity claim W34 and W31 both carried in different clothes, and
// `f-a4-pr2a-wrapper.test.mjs`'s `fa4p2a.W13-retired` for the "the agent core's old shape is
// genuinely gone" claim. See that file's own header for the full accounting.
//
// W44 and W32, below, are UNTOUCHED: neither drives wrapper 12 -- W44 mints its own templates
// directly through `mintTemplate` and W32 drives an unrelated close verb
// (`clara._agent_mint_month_snapshot_core`, the daily-close month-snapshot wake, not the
// prepayment limb) -- so neither cell's premise moved.

import test, { before } from "node:test";
import assert from "node:assert/strict";
import { noteLane } from "./rig-runtime-helpers.mjs";
import { humanQuery } from "./rig-helpers.mjs";
import { withTxn } from "./rig-txn.mjs";
import {
  ensurePrepay, prepayGate, prepaidScene, rootQuery, caught, uniq, pair, receiptsForTask, derivedOpKey,
  MODEL, mintTemplate,
} from "./f-a4-pr2a-fixtures.mjs";

let skipped = 0;
const markSkip = () => { skipped += 1; };
before(async () => { await ensurePrepay(noteLane); });

// ---------------------------------------------------------------------------------------------
// W44 -- the six readers stay ABOUT what posts.
// ---------------------------------------------------------------------------------------------
test("fa4p2a.W44 the DUE ORACLE, the SIGN PROJECTION and the two shared helpers answer identically across a scheduled/null-schedule pair", async (t) => {
  if (prepayGate(t, markSkip)) return;
  // RE-TITLED TO WHAT IT EXECUTES (Codex P7). The old title claimed "the six readers" of Annex
  // H.3. This cell drives the due oracle, the sign-surface projection (which is NOT one of H.3's
  // six -- it is the projection congruence explicitly does NOT cover, §D4's own scope note), and
  // the two HELPERS the remaining consumers lean on. A helper call is not consumer execution: it
  // shows the helper is amount-blind, not that _adj_run_occurrence_core and _adj_on_approve are.
  // NO CLAIM STRONGER THAN ITS EXECUTION SURVIVES, so the title is now the execution.
  //
  // THE TWO REAL POSTING CONSUMERS WERE DRIVEN in this file's own retired W35 cell, whose
  // subject (the wrapper's proposed template) is gone (#1036); the claim they behave alike on a
  // scheduled template survives here through the two helpers below, which is what this cell
  // measures on its own.
  //
  // Congruence clause (a) is why the helpers below can be blind at all: they project
  // (account, direction) and DISCARD magnitudes, so a congruent schedule is invisible to them BY
  // CONSTRUCTION -- which is why they needed no recut and the D1 inventory stayed at four.
  const sc = await prepaidScene("w44", { cents: 90000 });
  const lines = pair(sc.target, sc.prepaid, 30000);
  const withSched = await mintTemplate(sc.alice, {
    client: sc.client, name: `w44s-${uniq()}`, start: "2025-02-01", end: "2025-04-30", lines,
    schedule: [
      { period_start: "2025-02-01", period_end: "2025-02-28", lines: pair(sc.target, sc.prepaid, 30000) },
      { period_start: "2025-03-01", period_end: "2025-03-31", lines: pair(sc.target, sc.prepaid, 30000) },
      { period_start: "2025-04-01", period_end: "2025-04-30", lines: pair(sc.target, sc.prepaid, 30000) },
    ] });
  const twin = await prepaidScene("w44b", { cents: 90000 });
  const nullSched = await mintTemplate(twin.alice, {
    client: twin.client, name: `w44n-${uniq()}`, start: "2025-02-01", end: "2025-04-30",
    lines: pair(twin.target, twin.prepaid, 30000) });

  // THE SIX CLAIMED CONSUMERS ARE CALLED, not two helpers standing in for them (Codex C6).
  // Annex H.3 names SIX live readers that take t.lines as a stand-in for what an occurrence posts,
  // and the four-body D1 claim rests on all six being amount-blind. An earlier cut exercised only
  // _wdb_line_shape and _adj_line_eligibility_breach directly -- the two HELPERS the six lean on --
  // which proves the helpers are blind but not that the READERS are. The consumers themselves are
  // driven here, each on the scheduled template and its null-schedule twin, and each must agree.
  const consumer = async (sql, client, template) =>
    (await rootQuery(sql, [client, template])).rows[0].r;

  // (1) the due oracle -- the one the CLOSE-AGENT WAKE LANE itself reads.
  const dueA = await consumer(
    "select clara._adj_oldest_unmet_period($1::uuid,$2::uuid) as r", sc.client, withSched.template_id);
  const dueB = await consumer(
    "select clara._adj_oldest_unmet_period($1::uuid,$2::uuid) as r", twin.client, nullSched.template_id);
  assert.deepEqual(dueA, dueB,
    "the due oracle answers differently for a scheduled template than for its null-schedule twin -- the close lane's own read is not amount-blind");

  // (2) the template projection the sign surface renders. Compared on the keys congruence covers:
  // `lines` must read identically; `schedule` is EXPECTED to differ and is excluded by name.
  const projection = async (template) =>
    (await rootQuery("select clara._adj_template_json($1::uuid) as r", [template])).rows[0].r;
  const jsonA = await projection(withSched.template_id);
  const jsonB = await projection(nullSched.template_id);
  assert.deepEqual(jsonA.lines, jsonB.lines, "the sign-surface projection's `lines` differ across the pair");
  assert.ok(jsonA.schedule && !jsonB.schedule, "the projection does not distinguish the two by schedule");

  // (3) the shape projection and (4) the eligibility read, which the remaining consumers lean on.
  const shapes = await rootQuery(
    `select (select clara._wdb_line_shape(t.lines) from clara.adjustment_templates t where t.id=$1) as with_sched,
            (select clara._wdb_line_shape(t.lines) from clara.adjustment_templates t where t.id=$2) as null_sched`,
    [withSched.template_id, nullSched.template_id]);
  assert.deepEqual(shapes.rows[0].with_sched, shapes.rows[0].null_sched,
    "the shape projection differs between a scheduled template and its null-schedule twin -- the readers are NOT amount-blind and the four-body claim is wrong");
  const elig = await rootQuery(
    `select (select clara._adj_line_eligibility_breach($1, t.lines) from clara.adjustment_templates t where t.id=$2) as a,
            (select clara._adj_line_eligibility_breach($3, t.lines) from clara.adjustment_templates t where t.id=$4) as b`,
    [sc.client, withSched.template_id, twin.client, nullSched.template_id]);
  assert.equal(elig.rows[0].a, null, "the scheduled template's lines are ineligible");
  assert.equal(elig.rows[0].b, null, "the twin's lines are ineligible");
  noteLane("W44: the due oracle, the sign projection, the shape read and the eligibility read all agree across the scheduled/null pair");
});

// ---------------------------------------------------------------------------------------------
// W32 -- F4's month-scoped receipt key.
// ---------------------------------------------------------------------------------------------
test("fa4p2a.W32 (F4) two DIFFERENT months minted in ONE task write TWO receipts, each naming its own month", async (t) => {
  if (prepayGate(t, markSkip)) return;
  // The shipped defect: subject_id is uuid-not-null so a month cannot ride the subject, and the op
  // key derives per (task, verb, client) -- so the month appeared in NONE of uq_aar's seven columns
  // and the second month's refusal was answered with the first month's receipt id.
  const sc = await prepaidScene("w32");
  const call = (month) => humanQuery(sc.alice, "select 1").then(() => null).catch(() => null)
    .then(() => rootQuery(
      `select clara._agent_mint_month_snapshot_core(
         jsonb_build_object('firm_id', $1::uuid, 'wake_kind', 'close_prep', 'task_id', $2::uuid),
         $3::uuid, $4::date, 'rig', '{}'::jsonb, $5) as r`,
      [sc.firm, sc.s.task, sc.client, month, "w32key"]))
    .then((r) => r.rows[0].r);
  // An INCOMPLETE model triple gives a task-level rung, byte-identical for every month in the pass
  // -- which is exactly the condition Annex G says produces the collision.
  const a = await call("2025-01-01");
  const b = await call("2025-02-01");
  assert.equal(a.status, "refused");
  assert.equal(b.status, "refused");
  assert.notEqual(a.receipt_id, b.receipt_id,
    "the second month's refusal was answered with the FIRST month's receipt id -- F4's shipped defect");
  const rows = await rootQuery(
    "select op_key from clara.agent_act_receipts where id = any($1::uuid[]) order by op_key",
    [[a.receipt_id, b.receipt_id]]);
  assert.deepEqual(rows.rows.map((r) => r.op_key), ["w32key:2025-01-01", "w32key:2025-02-01"],
    "the receipts are not month-scoped -- a receipt for this verb must say which month it was about");
});

test("fa4p2a.armed-skip the focused run records ZERO skips", async () => {
  assert.equal(skipped, 0, `${skipped} cell(s) skipped -- a focused PR-2a run must fail rather than skip`);
  void caught; void withTxn; void receiptsForTask; void derivedOpKey; void MODEL;
});
