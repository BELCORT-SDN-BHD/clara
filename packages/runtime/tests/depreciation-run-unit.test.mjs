// #651 — the depreciation-run successor-contract carrier, tested STANDALONE.
//
// It ships no tool and no workflow: the wave cuts ONE shared `chatTurn_v21` after the ten merges
// (WORK-ORDER rule 8), and this module is what that cut imports. The only way that is worth
// anything is if the schema, the argument order and the refusal map are proven against the
// database's own rules NOW, while migration 0227 is in front of the reviewer.
//
// Every expectation below cites the wall it mirrors in
// packages/db/migrations/0227_depreciation_history.sql or in the 0041/0042/0056 bodies it recuts.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  RUN_DEPRECIATION_PERIOD_TOOL, DEPRECIATION_RUN_DOOR, DEPRECIATION_HUMAN_DOOR,
  runDepreciationInputSchema, depreciationRunDoorArgs, localRunRefusal,
  DEPRECIATION_REFUSAL_MESSAGES, refusalKey, refusalSentence, floorSentence,
  SKIP_REASON_SENTENCES, skipSentence, runSummary,
} from "../lib/depreciation-run.ts";

const CLIENT = "11111111-1111-4111-8111-111111111111";
const OBO = "22222222-2222-4222-8222-222222222222";

test("p651.rt.schema the input is `.strict()` and carries NO period — the period is the database's", () => {
  assert.equal(RUN_DEPRECIATION_PERIOD_TOOL, "run_depreciation_period_for_client");
  const ok = runDepreciationInputSchema.safeParse({ client_id: CLIENT });
  assert.equal(ok.success, true, "a client id alone is a complete instruction");
  const withThrough = runDepreciationInputSchema.safeParse({ client_id: CLIENT, through: "2026-08-31" });
  assert.equal(withThrough.success, true, "…and `through` bounds a catch-up");

  // THE ONE THING A MODEL MUST NOT BE ABLE TO SAY. clara._fa_run_period_core refuses any
  // caller-named window that is not the live authority's own cadence (0041:3457-3470), so a
  // period_start that travelled would be a refusal a person then has to decode.
  for (const key of ["period_start", "period_end", "amount_cents", "account_code", "asset_id"]) {
    const bad = runDepreciationInputSchema.safeParse({ client_id: CLIENT, [key]: "2026-08-01" });
    assert.equal(bad.success, false, `a \`${key}\` key is refused before the round trip`);
  }
  assert.equal(runDepreciationInputSchema.safeParse({ client_id: "not-a-uuid" }).success, false);
  assert.equal(runDepreciationInputSchema.safeParse({ client_id: CLIENT, through: "31/08/2026" }).success, false,
    "`through` is an ISO calendar date, in the book's Asia/Kuala_Lumpur calendar");
});

test("p651.rt.door_args the door's four arguments are built in ITS OWN order, and `through` absent means null", () => {
  const args = depreciationRunDoorArgs({ client_id: CLIENT }, { opKey: "k1", onBehalfOf: OBO });
  assert.deepEqual(args, { p_client: CLIENT, p_through: null, p_op_key: "k1", p_obo: OBO },
    "(p_client, p_through, p_op_key, p_obo) — 0227 fixes this order and it may not be re-arranged");
  assert.deepEqual(Object.keys(args), ["p_client", "p_through", "p_op_key", "p_obo"]);
  const bounded = depreciationRunDoorArgs({ client_id: CLIENT, through: "2026-08-31" },
    { opKey: "k2", onBehalfOf: OBO });
  assert.equal(bounded.p_through, "2026-08-31");
  assert.equal(DEPRECIATION_RUN_DOOR, "clara.run_depreciation_period_for",
    "the MACHINE door carries a NEW name — rig-meta.mjs:691-693 fails the moment run_depreciation_manual reaches a machine role");
  assert.equal(DEPRECIATION_HUMAN_DOOR, "clara.run_depreciation_manual");
});

test("p651.rt.local_refusal exactly ONE local mirror exists, and that is a fact about the door rather than an omission", () => {
  assert.equal(localRunRefusal({ client_id: CLIENT }), null);
  assert.equal(localRunRefusal({ client_id: CLIENT, through: "2026-08-31" }), null);
  const bad = localRunRefusal({ client_id: CLIENT, through: "2026-13-45" });
  assert.ok(bad && bad.refusal === true, "a calendar-impossible date is caught before the round trip");
  assert.equal(bad.reason, "through_not_a_date");
});

test("p651.rt.refusals every CLR the door can raise maps to a sentence, the three period_request_invalid AXES are told apart, and an unmapped code degrades to the verbatim message", () => {
  // The three axes of ONE reason — 0227 added `period_closed` beside 0041's two, and a person must
  // be able to tell "not this client's window" from "not ended" from "the year is closed".
  const axes = ["not_ended", "not_cadence_aligned", "period_closed"];
  const sentences = axes.map((axis) => refusalSentence({ code: "CLR38", reason: "period_request_invalid", axis }));
  assert.equal(new Set(sentences).size, 3, "the three axes say three different things");
  assert.match(sentences[2], /closed financial year/i, "…and the closed-year one names the year and the reopen path");
  assert.match(sentences[2], /reopen/i);

  for (const [key, expect] of [
    ["CLR38:authority_not_live", /no signed depreciation authority/i],
    ["CLR38:period_draft_outstanding", /approve or withdraw/i],
    ["CLR38:period_earlier_unmet", /oldest unmet period/i],
    ["CLR19:write_into_closed_period", /closed financial year/i],
    ["CLR04:obo_not_active", /no longer hold the authority/i],
    ["CLR04:insufficient_role", /no longer hold the authority/i],
    ["CLR10:client_inactive", /archived/i],
    ["CLR11:client_not_found", /cannot find that client/i],
  ]) {
    assert.match(DEPRECIATION_REFUSAL_MESSAGES[key] ?? "", expect, `${key} has its own sentence`);
  }

  // THE VERBATIM-REFUSAL LAW. An unmapped pair is handed back as the door said it, never re-worded.
  const unmapped = refusalSentence({
    code: "CLR99", reason: "something_new", message: "the database said something nobody mapped",
  });
  assert.equal(unmapped, "the database said something nobody mapped");
  const unmappedNoMessage = refusalSentence({ code: "CLR99", reason: "something_new" });
  assert.match(unmappedNoMessage, /CLR99/, "…and with no message at all the CODE still reaches the reader");
  assert.equal(refusalKey("CLR38", "period_request_invalid", "period_closed"),
    "CLR38:period_request_invalid:period_closed");
  assert.equal(refusalKey("CLR04", null), "CLR04:");
});

test("p651.rt.floor the floor sentence points at the HUMAN door, because the machine door carries no bypass", () => {
  const s = floorSentence("2026-09-01");
  assert.match(s, /2026-09-01/, "it names the floor it hit");
  assert.match(s, /run_depreciation_manual/,
    "…and the door where that work can still be done — a model that cannot say why will simply try again");
  assert.match(s, /month it was signed/i);
  assert.match(floorSentence(null), /run_depreciation_manual/,
    "…and it still points somewhere when the floor date is not to hand");
});

test("p651.rt.skips all FIVE measured skip reasons say something, and an unknown one degrades to its verbatim code", () => {
  // MEASURED off the live catalog (M7), not read off 0041's file text: four literals from
  // clara._fa_asset_charges plus `disposal_draft_outstanding`, which clara._fa_compute_charges
  // writes itself and the per-asset body can never return.
  assert.deepEqual(Object.keys(SKIP_REASON_SENTENCES).sort(),
    ["disposal_draft_outstanding", "fully_depreciated", "incomplete", "none_method", "not_in_service"]);
  assert.equal(skipSentence("incomplete"), "waiting on depreciation particulars");
  assert.equal(skipSentence("disposal_draft_outstanding"), "a disposal draft is waiting on this asset");
  const unknown = skipSentence("some_sixth_reason");
  assert.match(unknown, /some_sixth_reason/,
    "an unmapped reason renders as its VERBATIM code beside a neutral sentence — never dropped, never guessed");
});

test("p651.rt.summary the transcript says exactly what the receipt says, including the skips and the closed periods it never ran", () => {
  const nothing = runSummary({ periods: [], still_due: { due: false, reason: "period_not_ended" } });
  assert.match(nothing, /period_not_ended/, "a not-due answer names the database's own reason");

  const one = runSummary({
    periods: [{
      period_start: "2026-07-01", period_end: "2026-07-31",
      result: { status: "drafted", charged_cents: 123_45, entries: 3, skipped: [{ asset_id: "a", reason: "incomplete" }] },
    }],
    still_due: { due: false, reason: "nothing_due", skipped_closed: [{ period_start: "2026-06-01", period_end: "2026-06-30", fy_label: "2026" }] },
  });
  assert.match(one, /QUEUED for approval/, "a drafted run is QUEUED, never reported as posted");
  assert.match(one, /123\.45/, "…and the figure is the receipt's, to the sen");
  assert.match(one, /waiting on depreciation particulars/, "…and every skip is named in words");
  assert.match(one, /2026-06-01\.\.2026-06-30 \(2026\)/,
    "…and a period skipped for a closed financial year is stated, not silently absent");

  const posted = runSummary({
    periods: [{ period_start: "2026-08-01", period_end: "2026-08-31", result: { status: "posted", charged_cents: 1000, entries: 1, skipped: [] } }],
  });
  assert.match(posted, /POSTED/);
  assert.doesNotMatch(posted, /skipped/, "a run with nothing skipped says nothing about skips");
});
