// 0042 Wave D-b — as-built ladder ROUND-10 FIX WAVE, lane O3: THE DOOR x FIFTH-WALL
// COMPOSITION, AND CENSUS TRUTH.
//
// Four Codex round-10 findings, fixed in s2-adjustments.sql / s3-advances.sql:
//
//   C1 (HIGH, Codex #1) — `_adj_correction_door` ROUTED a wall token into a verb and never
//   asked whether that verb admits. MEASURED on this rig, in BOTH branches (probes
//   scratchpad/o3/probes/p1-door-composition.mjs and p2-solo-branch.mjs):
//     * PAIR: an auto-reverse template accrues onto an asset code; the pair nets the code to
//       zero; the template is retired; an admin lawfully enrols the code as a staff advance.
//       The door and clara.get_adjustment_run both said {correctable:true, correction_verb:
//       'clara.reverse_adjustment_pair'}; clara._adv_reversal_admission said admitted=false /
//       advance_movement_unregistered / unregistered_mirror about BOTH halves; the advertised
//       call refused CLR40 with that token and rolled back with zero pair rows.
//     * SOLO: the same shape on a NON-auto-reverse occurrence read {correctable:true,
//       correction_verb:'clara.reverse_entry', wall:null} while `carried.admitted` was TRUE and
//       `dated.axis` was unregistered_mirror — because clara._wdb_reversal_blocked raises only
//       the CARRIED half. Codex's finding named the pair branch; the solo branch is the same
//       root and is fixed with it (WDB-R1: never a point-patch over a class defect).
//   FIX: a new ONE authority, clara._wdb_correction_admission(verb, entry, mirror) — an
//   exhaustive, fail-closed dispatch over the correction verbs that ASKS each verb's own walls
//   (`at_verb`: allocated items, live bank match, the FA wall, and for reverse_entry the 7th
//   splice) and REPORTS the advance-side envelope of every half (`at_approve`). The door
//   consults it after routing; clara._pair_reverse_core RAISES its at_verb half in place of the
//   three inline copies it used to carry, so the courtesy and the authority are one derivation.
//
//   C2 (MEDIUM, Codex #2) — the fifth-wall census compared axis LITERALS as a set. Fixed in
//   x42-r9-n2.test.mjs (the cell) + x42-r10-o3-kit.mjs (the instrument); the consumer half
//   Codex named as the reason its own HIGH slipped past is CELL c1e below.
//
//   C3 (LOW, Codex #3) — a standing charge whose WRITER cannot be attributed took the PLAIN
//   distinct-codes branch. Fixed at the census (clara._wdb_overlapping_siblings gained a second,
//   unattributed term), so all three doors that read it move together.
//
//   C4 (LOW, Codex #4) — comments still claiming FOUR advance-side reversal walls where five
//   live. Fixed in s3; CELL c4 turns the class into an instrument.
//
// CONTRACT-BLIND POSTURE: every assertion below states what the FINDING (plus this lane's work
// order and WDB-R1/R2/R4) says must now be true — never a description of the SQL after the fact.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  opk, endPool, printLaneNotes, printSkipCount, noteLane, rootQuery, humanQuery, namedCall,
  x42EnsureReady, skip42, caught, reasonToken,
  adjWorld, freshAdjClient, liveTemplate, runManual, approveDraft, mirrorOf, retireTemplate,
  prepaymentLines, accrualLines, enrolAdvance, reversePair, reverseEntry, forgeStamp,
  draftEntryV3, approveEntry, manualRes, mon, PREP, EXPA, EXPB, ACCR2,
} from "./x42-adj-helpers.mjs";
import { admissionConsumers, admissionArms } from "./x42-r10-o3-kit.mjs";

let live = false;
let w = null;

before(async () => {
  live = await x42EnsureReady();
  if (live) w = await adjWorld();
});
after(async () => {
  printLaneNotes("x42-r10-o3");
  printSkipCount("x42-r10-o3");
  await endPool();
});

const skipHere = (t) => skip42(t, live, "the round-10 fix-wave O3 battery (door x fifth wall)");
const doorOf = async (entry) =>
  (await rootQuery("select clara._adj_correction_door($1) as j", [entry])).rows[0].j;
const admissionOf = async (entry) =>
  (await rootQuery("select clara._adv_reversal_admission($1) as j", [entry])).rows[0].j;
const runJsonOf = async (entry) => (await humanQuery(w.users.alice,
  "select clara.get_adjustment_run(p_run => (select id from clara.adjustment_runs where entry_id=$1)) as j",
  [entry])).rows[0].j.run;
const axisOf = (err) => /"axis"\s*:\s*"([a-z0-9_]+)"/.exec(String(err?.detail ?? ""))?.[1] ?? null;
const retireEnrolment = (sub, { client, enrolment }) => humanQuery(sub, namedCall(
  "retire_staff_advance_account",
  [{ name: "p_client" }, { name: "p_enrolment" }, { name: "p_reason" }, { name: "p_op_key" }]),
[client, enrolment, "o3 unwind", opk("o3ret")]);

/** Codex's public recipe, staged: an adjustment occurrence whose ASSET leg has since become a
 *  lawfully enrolled staff-advance account. `autoReverse` picks which door the run gets. */
async function stagedOverEnrolledCode(label, { autoReverse }) {
  const CENTS = 60_000;
  const client = await freshAdjClient(label);
  const period = mon(-3);
  const tpl = await liveTemplate({
    client, label, start: period.start, cents: CENTS, autoReverse,
    lines: prepaymentLines(CENTS), memo: "Prepaid insurance" });
  const r = await runManual(w.users.bob, {
    client, template: tpl.id, periodStart: period.start, periodEnd: period.end });
  await approveDraft(w.users.alice, r.entry_id);
  if (!autoReverse) {
    // an auto-reverse pair nets the code to zero by itself; a SOLO occurrence needs the
    // design's own named migration path (carry the balance down before enrolling).
    const res = await manualRes(w.users.alice, client);
    const d = await draftEntryV3(w.users.alice, {
      client, resolution: res, postingDate: period.end, memo: `${label} carry-down`,
      lines: [
        { account_code: EXPA, debit_cents: CENTS, credit_cents: 0, description: "expensed" },
        { account_code: PREP, debit_cents: 0, credit_cents: CENTS, description: "released" },
      ], opKey: opk(`${label}wo`) });
    await approveEntry(w.users.alice, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk(`${label}woa`) });
  }
  await retireTemplate(w.users.hana, { client, template: tpl.id, reason: `${label} engagement ended` });
  const enr = await caught(() => enrolAdvance(w.users.hana, {
    client, accountCode: PREP, personLabel: `${label} staff`, opKey: opk(`${label}enrol`) }));
  assert.equal(enr, null, "MANDATORY SETUP: the enrolment is a lawful public act on a clean code — if it is refused the scenario is not the one Codex measured");
  return { client, occurrence: r.entry_id, cents: CENTS, period };
}

// ===========================================================================
// C1 — the PAIR branch, end to end. The door must be honest BEFORE the call.
// ===========================================================================
test("x42.r10o3.c1a the correction door does not advertise clara.reverse_adjustment_pair on a pair whose corrections the advance register refuses — correctable:false, the WALL'S OWN token, and the run receipt says the same", async (t) => {
  if (skipHere(t)) return;
  const s = await stagedOverEnrolledCode("o3c1a", { autoReverse: true });
  const mirror = await mirrorOf(s.occurrence);
  assert.ok(mirror, "setup: the pair was born");

  // BOTH halves are genuinely inadmissible — the premise the door has to see.
  for (const half of [s.occurrence, mirror.id]) {
    const adm = await admissionOf(half);
    assert.equal(adm.admitted, false, "each half's advance-side admission refuses");
    assert.equal(adm.blocked_by, "advance_movement_unregistered");
    assert.equal(adm.dated?.axis, "unregistered_mirror");
  }

  const door = await doorOf(s.occurrence);
  assert.equal(door.correctable, false,
    "a run no verb can correct today must not read correctable — the walled-corridor class this ladder polices");
  assert.equal(door.verb, null, "…and it must name no verb at all");
  assert.equal(door.wall, "advance_movement_unregistered",
    "the wall reported must be the wall that actually closed the door, never the ROUTING token (adjustment_pair_locked), which would send the reader at the pair machine when the obstacle is the advance register");
  assert.ok(String(door.wall_advice ?? "").length > 0,
    "a token with no sentence is not a followable remedy — the closing wall's own advice must ride with it");
  assert.match(String(door.wall_advice), /staff-advance account/,
    "…and the advice must be the OWNING body's own words, not a second opinion composed here");

  const run = await runJsonOf(s.occurrence);
  assert.equal(run.correctable, false, "the persisted run receipt exports the same verdict — one derivation, two consumers");
  assert.equal(run.correction_verb, null);
  assert.equal(run.correction_wall, "advance_movement_unregistered");

  // AND THE ADVERTISED-BEFORE VERB REALLY DOES REFUSE.
  const err = await caught(() => reversePair(w.users.bob, {
    client: s.client, occurrence: s.occurrence, reason: "o3c1a correct", opKey: opk("o3c1apair") }));
  assert.ok(err, "clara.reverse_adjustment_pair must refuse — the door's new answer is the truth, not a new opinion");
  assert.equal(err.code, "CLR40");
  assert.equal(reasonToken(err), "advance_movement_unregistered");
  assert.equal(axisOf(err), "unregistered_mirror");
  const after = await rootQuery(
    "select (select count(*) from clara.adjustment_pair_reversals where occurrence_id=$1)::int as pairs", [s.occurrence]);
  assert.equal(after.rows[0].pairs, 0, "nothing was minted — the refusal is total");
});

// ===========================================================================
// C1 — the SOLO branch. Codex's finding named the pair; this lane MEASURED the same root on
// the other branch, so it ships its own cell rather than trusting the symmetry.
// ===========================================================================
test("x42.r10o3.c1b the SAME defect on the door's OTHER branch: a solo occurrence whose reverse_entry the advance register refuses must not read correctable — the carried half's silence is not admission", async (t) => {
  if (skipHere(t)) return;
  const s = await stagedOverEnrolledCode("o3c1b", { autoReverse: false });

  const adm = await admissionOf(s.occurrence);
  assert.equal(adm.carried?.admitted, true,
    "the CARRIED half admits — which is exactly why clara._wdb_reversal_blocked stayed silent and the door believed it");
  assert.equal(adm.admitted, false, "…while the DATED half refuses");
  assert.equal(adm.dated?.axis, "unregistered_mirror");

  const door = await doorOf(s.occurrence);
  assert.equal(door.correctable, false, "the solo branch must ask the same complete admission the pair branch asks");
  assert.equal(door.verb, null);
  assert.equal(door.wall, "advance_movement_unregistered");
  assert.ok(String(door.wall_advice ?? "").length > 0);

  const err = await caught(() => reverseEntry(w.users.alice, {
    entry: s.occurrence, reason: "o3c1b correct", opKey: opk("o3c1brev") }));
  assert.ok(err, "clara.reverse_entry must refuse");
  assert.equal(err.code, "CLR40");
  assert.equal(reasonToken(err), "advance_movement_unregistered");
});

// ===========================================================================
// C1 [WDB-R4 off-path] — THE ESCAPE. A fix that turns "correctable" off must not turn it off
// FOREVER: the wall's own remedy has to move the door back. This is the arm a fix aimed only
// at its own corridor never walks.
// ===========================================================================
test("x42.r10o3.c1c [WDB-R4 off-path] the door re-OPENS the moment the wall's own remedy is taken: retire the enrolment and the pair verb is advertised again — and really admits", async (t) => {
  if (skipHere(t)) return;
  const s = await stagedOverEnrolledCode("o3c1c", { autoReverse: true });
  assert.equal((await doorOf(s.occurrence)).correctable, false, "closed while the enrolment stands");

  const enrolment = (await rootQuery(
    "select id from clara.staff_advance_accounts where client_id=$1 and account_code=$2 and active",
    [s.client, PREP])).rows[0].id;
  const retired = await caught(() => retireEnrolment(w.users.hana, { client: s.client, enrolment }));
  assert.equal(retired, null, "retiring a zero-balance enrolment is lawful — the wall's own named remedy must exist");

  const door = await doorOf(s.occurrence);
  assert.equal(door.correctable, true, "…and taking it must re-open the door, or the fix is a permanent wall");
  assert.equal(door.verb, "clara.reverse_adjustment_pair");
  assert.equal(door.wall, "adjustment_pair_locked", "the routing token is reported again, unchanged, on an ADMITTED answer");
  assert.equal(door.wall_advice, null, "an admitted answer carries no advice — the key is present and honestly empty");

  const res = await caught(() => reversePair(w.users.bob, {
    client: s.client, occurrence: s.occurrence, reason: "o3c1c correct", opKey: opk("o3c1cpair") }));
  assert.equal(res, null, "and the advertised verb must really run — a door that says yes and a verb that says no is the same defect mirrored");
  const pair = await rootQuery(
    "select status from clara.adjustment_pair_reversals where occurrence_id=$1", [s.occurrence]);
  assert.equal(pair.rows[0]?.status, "completed", "the correction completed in one act (low stakes)");
});

// ===========================================================================
// C1 [WDB-R4 off-path] — THE AUTHORITY'S OWN CONTRACT. It fails CLOSED on a verb it cannot
// speak for, refuses a half-specified pair question, and answers the at_verb half for a caller
// that did NOT route first.
// ===========================================================================
test("x42.r10o3.c1d the correction-admission authority is an EXHAUSTIVE, fail-closed dispatch — an unregistered verb, a mirrorless pair question and a mirrored solo question are each refused by name, and its at_verb half answers an un-routed caller", async (t) => {
  if (skipHere(t)) return;
  const CENTS = 40_000;
  const client = await freshAdjClient("o3c1d");
  const period = mon(-3);
  const tpl = await liveTemplate({
    client, label: "o3c1d", start: period.start, cents: CENTS, autoReverse: true,
    lines: accrualLines(CENTS), memo: "Accrued audit fee" });
  const r = await runManual(w.users.bob, {
    client, template: tpl.id, periodStart: period.start, periodEnd: period.end });
  await approveDraft(w.users.alice, r.entry_id);
  const mirror = await mirrorOf(r.entry_id);

  const ask = async (verb, entry, mir = null) => (await rootQuery(
    "select clara._wdb_correction_admission($1,$2,$3) as j", [verb, entry, mir])).rows[0].j;
  const askRefusal = (verb, entry, mir = null) => caught(() => ask(verb, entry, mir));

  const bogus = await askRefusal("clara.approve_wrong_client_correction", r.entry_id);
  assert.ok(bogus, "a correction verb with no arm must RAISE, never answer 'admitted' — a third door has to be adjudicated in, not silently inherit a yes");
  assert.equal(reasonToken(bogus), "correction_verb_unregistered");
  const noMirror = await askRefusal("clara.reverse_adjustment_pair", r.entry_id);
  assert.ok(noMirror, "the pair verb corrects BOTH halves; an admission that saw one is the half-answer this body replaces");
  assert.equal(reasonToken(noMirror), "correction_mirror_required");
  const strayMirror = await askRefusal("clara.reverse_entry", r.entry_id, mirror.id);
  assert.ok(strayMirror, "a mirror handed to the solo verb means the caller is asking the wrong question");
  assert.equal(reasonToken(strayMirror), "correction_mirror_not_taken");

  // THE at_verb HALF IS LIVE AND COMPLETE FOR AN UN-ROUTED CALLER: asked about the SOLO verb on
  // a pair half, it reports clara.reverse_entry's own 7th-splice refusal rather than admitting.
  const solo = await ask("clara.reverse_entry", r.entry_id);
  assert.equal(solo.at_verb.admitted, false,
    "a body that answers correctly only when its caller pre-computed half of it is the composition seam this ladder keeps finding");
  assert.equal(solo.at_verb.reason, "adjustment_pair_locked");
  assert.equal(solo.blocked_by, "adjustment_pair_locked");
  // …while the PAIR verb on the same, ordinary pair is admitted on both halves.
  const pair = await ask("clara.reverse_adjustment_pair", r.entry_id, mirror.id);
  assert.equal(pair.admitted, true, "an ordinary pair on ordinary codes is admitted — the fix must not close a lawful door");
  assert.equal(pair.at_verb.admitted, true);
  assert.equal(pair.at_approve.admitted, true);
});

// ===========================================================================
// C2 — THE CONSUMER CENSUS. Codex named this as the reason a belt->admission text census could
// not catch the round-10 HIGH: "the census does not enumerate admission consumers". This arm
// asks the other direction — who promises a reversal outcome, and do they all ask?
// ===========================================================================
test("x42.r10o3.c1e every body that PROMISES a reversal outcome reaches the advance-side admission authority, and its consumer roster is exactly the adjudicated set — a new promiser that never asks must fail HERE", async (t) => {
  if (skipHere(t)) return;

  const consumers = (await admissionConsumers(rootQuery, "_adv_reversal_admission")).split(", ").filter(Boolean);
  // THE ADJUDICATED ROSTER, each classified — the S5.15e idiom (one authority, an EXACT
  // consumer set, every member justified in the sentence that fails).
  assert.deepEqual(consumers.sort(), [
    "_adv_on_approve",        // THE AUTHORITY: GUARD III raises `first` under its own row locks
    "_adv_reversal_blocked",  // the CARRIED-only raiser clara._wdb_reversal_blocked calls
    "_wdb_correction_admission", // [round 10] the correction door's own admission composer
    "_wdb_line_booking_block",   // S4.6A's release report, which READS the dated half
  ], "the consumers of the advance-side reversal admission must be exactly the four adjudicated bodies — a FIFTH that appears without adjudication is a new promiser, and a body that DISAPPEARS from this list is one that went back to predicting");

  // …AND THE DOOR MUST REACH IT. The door is the body every surface consumes for "can this run
  // be corrected"; until round 10 it reached only clara._wdb_reversal_blocked, whose silence is
  // one splice's answer and not the verb's.
  const door = (await rootQuery(
    "select prosrc from pg_proc where pronamespace='clara'::regnamespace and proname='_adj_correction_door'")).rows[0].prosrc;
  assert.match(door, /clara\._wdb_correction_admission\(/,
    "clara._adj_correction_door must consult the correction-admission authority — routing a wall token into a verb without asking that verb is the defect Codex measured");
  // …and so must the verb it advertises, from the SAME body, or the two can drift again.
  const core = (await rootQuery(
    "select prosrc from pg_proc where pronamespace='clara'::regnamespace and proname='_pair_reverse_core'")).rows[0].prosrc;
  assert.match(core, /clara\._wdb_correction_admission\(/,
    "clara._pair_reverse_core must RAISE from the same envelope the door READS — one derivation is the whole point (WDB-R2)");
  assert.doesNotMatch(core, /clara\._subledger_allocated_items_present\(/,
    "…and it must no longer carry its own inline copy of a wall the shared body states: two enumerations of one wall set is exactly the drift this round found");
  noteLane(`c1e: admission consumers {${consumers.join(", ")}}; door + pair core both consult _wdb_correction_admission`);
});

// ===========================================================================
// C3 — the unattributable writer. Uncertainty must fail toward the CAUTION.
// ===========================================================================
test("x42.r10o3.c3a a standing charge whose WRITER these books cannot attribute still draws the predecessor caution — uncertainty fails toward the measurement, never away from it", async (t) => {
  if (skipHere(t)) return;
  const CENTS = 300_000;
  const client = await freshAdjClient("o3c3a");
  const period = mon(-3);
  const tplA = await liveTemplate({
    client, label: "o3c3a first", start: period.start, cents: CENTS, autoReverse: false,
    lines: accrualLines(CENTS), memo: "Audit fee accrual" });
  const rA = await runManual(w.users.bob, {
    client, template: tplA.id, periodStart: period.start, periodEnd: period.end });
  await approveDraft(w.users.alice, rA.entry_id);
  // THE LEGACY STAMP: the writer can no longer be resolved, and the period keys no longer parse.
  await forgeStamp(rA.entry_id, {
    template_id: "legacy-not-a-uuid", period_start: "2026/05/01", period_end: "May 2026" });

  const tplB = await liveTemplate({
    client, label: "o3c3a second", start: period.start, cents: CENTS, autoReverse: false,
    lines: accrualLines(CENTS), memo: "Audit fee accrual v2" });
  const err = await caught(() => runManual(w.users.bob, {
    client, template: tplB.id, periodStart: period.start, periodEnd: period.end }));
  assert.ok(err, "the gate still refuses on the money — the standing charge is real whoever wrote it");
  assert.equal(reasonToken(err), "period_shape_already_met");
  const d = JSON.parse(err.detail);
  assert.equal(d.standing_template_status, "unknown", "the writer cannot be resolved to a template");
  assert.deepEqual(d.remedy, ["correct_the_standing_entry_in_period", "distinct_codes_with_predecessor_caution"],
    "…so the distinct-codes act is offered CAUTIONED: whether this charge is the generation the caller replaces is exactly the lineage nothing in these books can prove, and the round-10 law is that no surface may assert OR ASSUME either way");
  assert.equal(d.predecessor_candidates.length, 1, "the caution names what it measured");
  const cand = d.predecessor_candidates[0];
  assert.equal(cand.template_id, null, "…and says honestly that there is no template to name");
  assert.equal(cand.status, "unknown");
  assert.equal(cand.containment, "unattributed");
  assert.equal(cand.standing, 1, "one standing charge would survive a re-cut onto fresh codes");
  assert.match(err.message, /BUT MEASURE FIRST/, "the sentence carries the measurement");
  assert.match(err.message, /cannot attribute to any template of this client/,
    "…in words that do not pretend to name a template");
});

// ===========================================================================
// C3 [WDB-R4 off-path] — the second census term must not swallow the first, and the PLAIN
// branch must still be reachable. A caution that fires on everything is not a caution.
// ===========================================================================
test("x42.r10o3.c3b [WDB-R4 off-path] the census's two terms stay disjoint: an ATTRIBUTABLE sibling is still named as itself, and a client with nothing unattributable still gets the PLAIN clause", async (t) => {
  if (skipHere(t)) return;
  const CENTS = 120_000;
  const period = mon(-3);

  // (a) ORDINARY WORLD — a real live sibling with standing charges. The caution must name IT,
  // by id, and must NOT invent an unattributed row beside it.
  const c1 = await freshAdjClient("o3c3b1");
  const sib = await liveTemplate({
    client: c1, label: "o3c3b sibling", start: period.start, cents: CENTS, autoReverse: false,
    lines: accrualLines(CENTS), memo: "Audit fee" });
  const rs = await runManual(w.users.bob, {
    client: c1, template: sib.id, periodStart: period.start, periodEnd: period.end });
  await approveDraft(w.users.alice, rs.entry_id);
  const caller = await liveTemplate({
    client: c1, label: "o3c3b caller", start: period.start, cents: CENTS, autoReverse: false,
    lines: accrualLines(CENTS), memo: "Audit fee v2" });
  const e1 = await caught(() => runManual(w.users.bob, {
    client: c1, template: caller.id, periodStart: period.start, periodEnd: period.end }));
  assert.ok(e1);
  const d1 = JSON.parse(e1.detail);
  assert.equal(d1.predecessor_candidates.length, 1, "exactly one candidate — the two census terms are disjoint, so a stamped charge is counted ONCE");
  assert.equal(d1.predecessor_candidates[0].template_id, sib.id,
    "…and it is the REAL sibling, named by id: a charge that CAN be attributed must never fall into the anonymous term");
  assert.notEqual(d1.predecessor_candidates[0].status, "unknown");

  // (b) NOTHING STANDING ANYWHERE — the PLAIN clause must survive. (A sibling that has never
  // posted cannot leave a charge behind a re-cut, so there is nothing to measure.)
  const c2 = await freshAdjClient("o3c3b2");
  const quiet = await liveTemplate({
    client: c2, label: "o3c3b quiet", start: period.start, cents: CENTS, autoReverse: false,
    lines: accrualLines(CENTS), memo: "never run" });
  assert.ok(quiet.id);
  const other = await liveTemplate({
    client: c2, label: "o3c3b other", start: period.start, cents: CENTS, autoReverse: false,
    lines: accrualLines(CENTS, { debit: EXPB, credit: ACCR2 }), memo: "disjoint" });
  const r2 = await runManual(w.users.bob, {
    client: c2, template: other.id, periodStart: period.start, periodEnd: period.end });
  assert.equal(r2.status, "drafted", "a fully disjoint shape is admitted — the caution has not become a refusal");
  const cen = (await rootQuery(
    "select clara._wdb_overlapping_siblings($1, null, clara._wdb_line_shape((select lines from clara.adjustment_templates where id=$2))) as j",
    [c2, quiet.id])).rows[0].j;
  assert.ok(Array.isArray(cen));
  assert.equal(cen.filter((x) => x.template_id === null).length, 0,
    "a client with no unattributable charge gets NO anonymous row at all — the second term is a measurement, not a decoration");
});

// ===========================================================================
// C4 — the stale wall counts, turned into an instrument. A comment is the only place this
// migration records "is the set closed?", and a stale one is how the next author concludes it
// is. Codex measured two of them (s3's "no future round can add a fifth wall" and "ALL FOUR
// WALLS / All four now live"), and this lane measured a third in the release report ("TWO MORE
// decide a reversal", after round 9 made it three).
//
// A CELL THAT ONLY PINNED THE WORD "five" WOULD BE THE SAME DEFECT ONE LAYER OUT: a SIXTH wall
// would leave every "five" claim stale and every such cell green. So the count is ANCHORED to
// the structure, in two arms that have to move together —
//   (a) the EXACT (reason, axis) roster the admission body can produce. Five WALLS produce SIX
//       pairs today, because the date-ordering wall carries two axes (an application's
//       correction and a disbursement's void) and the enrolment wall's one axis serves two
//       sites. A sixth wall cannot join without changing this roster, which fails HERE and
//       forces arm (b)'s prose to be revisited in the same edit.
//   (b) every in-source claim about how many walls there are, against a MEASURED allowlist of
//       claims that are honestly about a SUBSET (the S5.25 arm-D roster idiom: an explicit,
//       justified exemption beats a loose pattern that quietly stops firing).
// ===========================================================================
test("x42.r10o3.c4 the advance-side reversal wall roster is EXACT and every in-source count claim agrees with it — the stale-count class Codex found, anchored to structure rather than to the word 'five'", async (t) => {
  if (skipHere(t)) return;

  // --- (a) THE ROSTER. Six (reason, axis) pairs, five walls; the mapping is stated so the next
  // author who adds one has to decide which wall theirs is rather than appending silently.
  const admission = (await rootQuery(
    "select prosrc from pg_proc where pronamespace='clara'::regnamespace and proname='_adv_reversal_admission'")).rows[0].prosrc;
  const pairs = [...new Set([...admissionArms(admission)].map((a) => `${a.reason}|${a.axis}`))].sort();
  assert.deepEqual(pairs, [
    "advance_applications_outstanding|net_applications_live",     // wall (b), carried
    "advance_movement_unregistered|enrolment_closed",             // wall (1a)/(1b), dated
    "advance_movement_unregistered|unregistered_mirror",          // wall (1c), dated  [round 9]
    "advance_reversal_predates_movement|correction_predates_application", // wall (1a)/(1b), dated
    "advance_reversal_predates_movement|void_predates_issue",     // …the same wall, other side
    "correction_entry_irreversible|correction_carried",           // wall (c), carried
  ], "the advance-side reversal admission's (reason, axis) roster is EXACT: five walls, six pairs. A SIXTH wall changes this list — and when it does, every count claim scanned below has to change with it, which is the whole point of pinning both in one cell");

  // --- (b) THE PROSE.
  const rows = (await rootQuery(
    `select p.proname,
            regexp_replace(m[1], '\\s+', ' ', 'g') as claim
       from pg_proc p,
            lateral regexp_matches(coalesce(p.prosrc, ''),
              '(all (one|two|three|four|five|six)[^.]{0,60}walls?|(one|two|three|four|five|six) more[^.]{0,60}(decide|refuse|wall))', 'gi') m
      where p.pronamespace = 'clara'::regnamespace
      order by 1, 2`)).rows;

  // Claims that are honestly about a SUBSET of the five, each named and justified. Everything
  // else is a claim about the whole set and must say FIVE.
  const EXEMPT = new Map([
    // clara.reverse_entry's OWN walls beyond its 7th splice — allocated items, live bank match,
    // the FA wall. A different, accurate count about a different set.
    ["_adj_correction_door", /three more wall/i],
    // S4.6A's release report speaks about the MIRROR-DATED subset only: the walls
    // clara.reverse_entry cannot raise at all (enrolment window, date ordering, and round 9's
    // unregistered mirror). Three of the five, correctly.
    ["_wdb_line_booking_block", /three more decide/i],
    // 裁-18b PR-1. A DIFFERENT SET ENTIRELY, not a subset of the five: the three DIRECTOR walls
    // at the vendor-binding proposal door (`mint_wake_credential` refuses a non-standing
    // principal; `wake_context` drops a credential whose director lost standing; this body
    // refuses a null `on_behalf_of`). The scan is deliberately estate-wide, so a claim in an
    // unrelated body reaches it — and the honest answer is to NAME the other set here rather
    // than to reword the comment until the detector stops firing, which is how a broad pattern
    // quietly rots. Inert until this PR's migration lands: the function does not exist before it.
    ["_propose_vendor_binding_agent_core", /^all three walls$/i],
  ]);
  const bad = [];
  for (const r of rows) {
    const ex = EXEMPT.get(r.proname);
    if (ex && ex.test(r.claim)) continue;
    if (!/\bfive\b/i.test(r.claim)) bad.push(`${r.proname}: "${r.claim}"`);
  }
  assert.deepEqual(bad, [],
    `every in-source claim about the SIZE of the advance-side reversal wall set must agree with the roster above — stale claim(s): ${bad.join(" | ")}. A claim about a genuine SUBSET belongs in this cell's measured allowlist, with the subset named; a claim left at the old number is the defect Codex found.`);
  assert.ok(rows.length >= 3,
    "the scan must find the live claims it exists to police — too few matches means the pattern rotted, not that the comments are clean");
  noteLane(`c4: roster ${pairs.length} (reason, axis) pair(s) / five walls; ${rows.length} in-source count claim(s) scanned, ${EXEMPT.size} measured subset exemption(s), zero stale`);
});
