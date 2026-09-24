// F-A4 PR-2a -- Annex A, WRAPPER 12's ladder.
//
// [#1036] RETIRED, ALMOST ENTIRELY, BY THE REROUTE (migration 0315_prepayment_wake_reroute.sql).
// Every cell this file used to carry (W13/W13-movedworld/W13-changedargs/W13-basischanged/W45*/
// W13-granularity/W13-arm2/W14/W14-mutant/W15/W16/W39/W40) drove wrapper 12 through
// `clara._agent_prepayment_schedule_core` and asserted its Tier A/B/C shape: a returned
// `{status, rung_vector}` value (never a raise), a request-digest replay identity computed over
// `p_target_account`/`p_target_basis`/`p_rationale`/`p_model`, and an `agent_act_receipts` row for
// every verdict. #1036 reroutes the wrapper onto `clara._prepayment_schedule_core`'s new 'wake'
// lane -- #915/#939/#940's shared body, already proven for the 'human' and 'obo' lanes -- which
// RAISES on refusal exactly as a human or a chat configuration's own call does (the ticket's own
// words: "the same validation... and refusals a person's own creation gets"), idempotently through
// `clara._reserve_op`/`clara._finish_op` rather than a request digest, and writes NO
// `agent_act_receipts` row at all. Every one of those old cells' PREMISES is gone, not merely its
// assertions' expected values, so retyping them against the new shape would be re-authoring this
// file's whole subject rather than updating it -- exactly #927's own precedent for
// `x42-adjustments.test.mjs`'s propose/sign lifecycle cells.
//
// W38 / W38-mutant (the calendar-alignment self-check) and W5 (the agent can never sign) are ALSO
// retired here, for a different reason each: W38's construction invariant now lives inside
// `clara._prepayment_schedule_core` itself (the SAME body every lane shares, unedited by #1036) and
// is exercised there by `prepayment-schedule-obo.test.mjs`'s and `prepayment-wake-reroute.test.mjs`'s
// own cells; W5's claim ("the agent drafts, a human signs") has NO subject left to assert -- the
// wake path never touches `clara.adjustment_templates` at all any more, so there is no draft for a
// human to sign.
//
// THIS FILE'S REMAINING SUBJECT: wrapper 12's OWN shape survives the reroute (the ticket's own
// words -- "same name and arguments") and the ONE thing that changed and is worth a dedicated cell
// HERE rather than in `prepayment-wake-reroute.test.mjs` (which covers the door's new behaviour):
// proving the OLD receipt discipline is genuinely gone, not merely un-asserted.

import test, { before } from "node:test";
import assert from "node:assert/strict";
import { noteLane } from "./rig-runtime-helpers.mjs";
import {
  ensurePrepay, prepayGate, prepaidScene, recordPeriod, rootQuery, wake12, receiptsForTask,
} from "./f-a4-pr2a-fixtures.mjs";

let skipped = 0;
const markSkip = () => { skipped += 1; };
before(async () => { await ensurePrepay(noteLane); });

let rerouted = null;
async function hasReroute() {
  if (rerouted !== null) return rerouted;
  const r = await rootQuery(
    "select count(*)::int as n from clara.schema_migrations where version ~ 'prepayment_wake_reroute$'");
  rerouted = Number(r.rows[0].n) > 0;
  return rerouted;
}
async function rerouteGate(t) {
  if (prepayGate(t, markSkip)) return true;
  if (!(await hasReroute())) {
    if (process.env.CLARA_ALLOW_MISSING_PREPAYMENT_WAKE_REROUTE !== "1") {
      throw new Error(
        "#1036 premise 0315_prepayment_wake_reroute.sql is not applied and "
        + "CLARA_ALLOW_MISSING_PREPAYMENT_WAKE_REROUTE is unset -- FAIL LOUDLY, not skip.");
    }
    markSkip();
    t.skip("#1036 (0315_prepayment_wake_reroute) not applied");
    return true;
  }
  return false;
}

test("fa4p2a.W13-retired (#1036) wrapper 12 writes NO clara.agent_act_receipts row any more, on "
  + "either an acted or a refused call -- the Tier A/B/C receipt discipline this file used to test "
  + "belonged to the retired agent core", async (t) => {
  if (await rerouteGate(t)) return;

  const before1 = await rootQuery("select count(*)::int as n from clara.agent_act_receipts");

  const sc = await prepaidScene("w13r-acted");
  await recordPeriod(sc.alice, { document: sc.document, start: "2025-02-01", end: "2025-04-30" });
  const acted = await wake12(sc.s, { client: sc.client, entry: sc.entry, target: sc.target });
  assert.ok(acted.schedule_id, "the acted call did not produce a schedule");
  assert.deepEqual(await receiptsForTask(sc.s.task), [],
    "an acted wake call wrote an agent_act_receipts row -- the retired discipline is still live");

  const sc2 = await prepaidScene("w13r-refused");
  await recordPeriod(sc2.alice, { document: sc2.document, start: "2025-02-01", end: "2025-04-30" });
  await assert.rejects(
    () => wake12(sc2.s, { client: sc2.client, entry: sc2.entry, target: "" }),
    "a refusal case unexpectedly succeeded");
  assert.deepEqual(await receiptsForTask(sc2.s.task), [],
    "a refused wake call wrote an agent_act_receipts row -- the retired discipline is still live");

  const after1 = await rootQuery("select count(*)::int as n from clara.agent_act_receipts");
  assert.equal(after1.rows[0].n, before1.rows[0].n,
    "clara.agent_act_receipts grew across an acted+refused pair -- wrapper 12 still writes it");
  noteLane("W13-retired: wrapper 12 writes zero agent_act_receipts rows, acted or refused");
});

test("fa4p2a.armed-skip the focused run records ZERO skips", async () => {
  assert.equal(skipped, 0,
    `${skipped} cell(s) skipped -- a focused PR-2a run must fail rather than skip`);
});
