// 0042 Wave D-b — ROUND 10, LANE O1: THE HONEST-MESSAGE MINIMUM.
//
// ONE ROOT, THREE DOORS. Round 9 gave the shape_already_met refusal a discriminant —
// `standing_template_status` — and read `retired` as "this is the generation you replace": it
// ASSERTED that lineage and PROHIBITED the distinct-codes act on it. Round 10 measured the proxy
// wrong in both directions, each with money:
//   * A RETIRED SIBLING THAT IS NOT A PREDECESSOR (probe z1/p1-retired-sibling.mjs). Audit fees
//     accrued on 900/400, engagement over, template retired; legal fees then accrued on 901/400 —
//     the shared "Accruals" code the gate's own comment names as the DESIGNED collision. The
//     product asserted a lineage that does not exist, forbade the act that produces correct books
//     (measured: 401 books both months clean), and its one remaining instruction, followed
//     verbatim, erased RM6,000 of a legitimate audit accrual.
//   * THE ORDER BYPASS (probe z1/p5-order-bypass.mjs). Propose the replacement first and retire
//     the predecessor after — the order a professional works in, and nothing requires the other —
//     and the status reads `live`, the doubling clause prints, four already-charged months re-ran
//     onto fresh codes with blocked:[]: RM18,000 against an RM6,000 intention.
//   * THE CROSS-FAMILY ROAD (probes z2/p5, z2/p6). An FA profile claims a live template's expense
//     code; the template goes terminally blocked; its refusal's remedy — "retire this template and
//     propose a corrected one" — leads to a replacement on FREE codes whose shape is FULLY
//     DISJOINT, which the shape-keyed re-run gate cannot see at all. Measured RM1,000 of expense
//     and RM1,000 of accrual booked twice through ordinary catch-up drafts.
//
// THE LAW UNDER TEST (the orchestrator's round-10 adjudication; option (b), `replaces_template_id`
// at re-propose, is the OWNER's fork and is NOT built): NO SURFACE MAY ASSERT OR PROHIBIT WHAT ONLY
// LINEAGE CAN PROVE. Both acts stay offered; what the books CAN prove — which sibling templates
// collide, what each already has standing, and for which periods — is MEASURED and printed beside
// the second act as a conditional caution; the machine `remedy` key becomes branch-distinct so a
// consumer can finally tell the two spellings apart; and the propose door says so at the moment the
// collision is created.
//
// THE OFF-PATH ARMS (WDB-R4) are the point of half this file: the branch where the caution must NOT
// fire (a standing charge no template wrote), the refusal that must stay clean when there is
// nothing standing to double, the p_shape-is-null read that must acquire no opinion, the propose
// door that must stay SILENT on the designed partial collision, and the walk guard whose stated
// subject round 10 measured unreachable — asked here through the instrument production uses.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  opk, endPool, printLaneNotes, printSkipCount, rootQuery, getPool,
  x42EnsureReady, skip42, caught, reasonToken,
  EXPA, EXPB, ACCR, ACCR2, FACOST, FAACC, CLR38, mon,
  runManual, retireTemplate, proposeTemplate, signTemplate, adjustmentRunDue,
  accrualLines, adjWorld, freshAdjClient, liveTemplate, approveDraft, glNet,
  upsertFaProfile, templateRow,
} from "./x42-adj-helpers.mjs";

let live = false;
let w = null;

before(async () => {
  live = await x42EnsureReady();
  if (live) w = await adjWorld();
});
after(async () => {
  printLaneNotes("x42-r10o1");
  printSkipCount("x42-r10o1");
  await endPool();
});

const skipHere = (t) => skip42(t, live, "the round-10 honest-remedy battery");

const runRefusal = (client, template, period) => caught(() => runManual(w.users.bob, {
  client, template, periodStart: period.start, periodEnd: period.end,
}));

/** A standing machine-posted charge that NO template row wrote — the state that proves the
 *  no-caution branch is real rather than decorative. Staged as the surgery the helpers' header
 *  documents (user triggers silenced for the one statement; the entry carries LINES, because a
 *  line-less entry is unreachable through every door — clara._assert_balanced refuses it). */
async function stageOrphanCharge({ client, period, debit, credit, cents }) {
  const conn = await getPool().connect();
  try {
    await conn.query("set session_replication_role = replica");
    const { rows } = await conn.query(
      `with src as (select cl.firm_id,
                          (select m.user_id from clara.firm_memberships m
                            where m.firm_id = cl.firm_id and m.status = 'active'
                            order by m.created_at limit 1) as actor
                     from clara.clients cl where cl.id = $1),
       ins as (
         insert into clara.journal_entries(client_id, firm_id, status, posting_date, memo, origin,
             is_opening_balance, is_year_end, tax_affecting, maker_actor, last_human_editor,
             approved_at, checker_actor, flags)
         select $1, s.firm_id, 'approved', $2::date, 'r10o1 orphan charge', 'scheduled_run',
                false, false, false, s.actor, s.actor, now(), s.actor,
                jsonb_build_object('recurring_adjustment', jsonb_build_object(
                  'template_id', gen_random_uuid(), 'role', 'occurrence',
                  'period_start', $3::text, 'period_end', $2::text))
           from src s
         returning id, firm_id)
       insert into clara.journal_lines(entry_id, firm_id, client_id, line_no, account_code,
           debit_cents, credit_cents)
       select i.id, i.firm_id, $1, v.n, v.code, v.dr, v.cr
         from ins i, (values (1, $4::text, $6::bigint, 0::bigint),
                             (2, $5::text, 0::bigint, $6::bigint)) v(n, code, dr, cr)
       returning entry_id`,
      [client, period.end, period.start, debit, credit, cents]);
    return rows[0].entry_id;
  } finally {
    await conn.query("set session_replication_role = origin").catch(() => {});
    conn.release();
  }
}

// ---------------------------------------------------------------------------------------
// x42.r10o1a — THE RETIRED SIBLING. The refusal states a measurement, not a lineage; the act it
// used to forbid is offered; and the cell FOLLOWS that act and asserts the four book totals.
// ---------------------------------------------------------------------------------------
test("x42.r10o1a a retired sibling that is NOT a predecessor gets a measured caution, never an assertion or a prohibition — and following the once-forbidden act leaves every one of the four balances right", async (t) => {
  if (skipHere(t)) return;
  const M = [mon(-5), mon(-4)];
  const client = await freshAdjClient("r10o1a");

  // The audit engagement: two standing months on EXPA/ACCR, then RETIRED through the verb.
  const tAudit = await liveTemplate({
    client, label: "r10o1a audit", start: M[0].start,
    lines: accrualLines(300_000, { debit: EXPA, credit: ACCR }), memo: "audit fee" });
  for (const P of M) {
    const r = await runManual(w.users.bob, {
      client, template: tAudit.id, periodStart: P.start, periodEnd: P.end });
    await approveDraft(w.users.alice, r.entry_id);
  }
  await retireTemplate(w.users.hana, { client, template: tAudit.id, reason: "engagement ended" });
  assert.equal((await templateRow(tAudit.id)).status, "retired");
  assert.equal(await glNet(client, EXPA), 600_000, "two months of audit fee stand");

  // A GENUINELY SEPARATE legal-fee template sharing only the accrual code.
  const tLegal = await liveTemplate({
    client, label: "r10o1a legal", start: M[0].start,
    lines: accrualLines(120_000, { debit: EXPB, credit: ACCR }), memo: "legal fee" });
  const err = await runRefusal(client, tLegal.id, M[0]);
  assert.ok(err, "sharing the accrual code with a standing charge is a collision");
  assert.equal(err.code, CLR38);
  assert.equal(reasonToken(err), "period_shape_already_met");

  const d = JSON.parse(err.detail);
  assert.doesNotMatch(err.message, /it is the generation this one replaces/,
    "the product does not claim to know a lineage the schema does not record");
  assert.doesNotMatch(err.message, /Do NOT re-cut this template onto different account codes/,
    "…and it does not forbid an act that is lawful and here CORRECT");
  assert.match(err.message, /or give this template distinct account codes/, "the act is offered");
  assert.match(err.message, /BUT MEASURE FIRST/, "…with the measurement beside it");
  assert.match(err.message, /IF this template replaces that one/, "…stated conditionally");
  assert.deepEqual(d.remedy,
    ["correct_the_standing_entry_in_period", "distinct_codes_with_predecessor_caution"],
    "the machine key names BOTH acts, and says which spelling of the second one was printed");
  assert.deepEqual(d.predecessor_candidates.map((p) => [p.template_id, p.status, p.standing]),
    [[tAudit.id, "retired", 2]],
    "the candidate is measured: the retired sibling, and the two periods it actually carries");
  assert.equal(d.predecessor_candidates[0].containment, "partial",
    "…and the shape relation is reported — a shared accrual code is not a re-cut of the same charge");
  assert.equal(d.predecessor_candidates[0].first_period, M[0].start);
  assert.equal(d.predecessor_candidates[0].last_period, M[1].end);

  // FOLLOW THE ACT ROUND 9 FORBADE, and assert the TOTAL books (WDB-R4: the money, not the gate).
  const tLegal2 = await liveTemplate({
    client, label: "r10o1a legal recut", start: M[0].start,
    lines: accrualLines(120_000, { debit: EXPB, credit: ACCR2 }), memo: "legal fee, own code" });
  for (const P of M) {
    const r = await runManual(w.users.bob, {
      client, template: tLegal2.id, periodStart: P.start, periodEnd: P.end });
    await approveDraft(w.users.alice, r.entry_id);
  }
  assert.equal(await glNet(client, EXPA), 600_000, "the audit accrual the firm must keep is intact");
  assert.equal(await glNet(client, ACCR), -600_000, "…and so is its liability");
  assert.equal(await glNet(client, EXPB), 240_000, "the legal fee is accrued once per month");
  assert.equal(await glNet(client, ACCR2), -240_000, "…against its own accrual code, to the sen");
});

// ---------------------------------------------------------------------------------------
// x42.r10o1b — THE ORDER BYPASS, ANSWERED AT THE DOOR THAT CREATES IT. propose-then-retire is
// lawful and stays lawful: the propose door does not refuse, it WARNS, and it names the sibling.
// ---------------------------------------------------------------------------------------
test("x42.r10o1b proposing a template that collides with a LIVE sibling is admitted (the propose-first order is lawful) and carries an advisory warning naming the sibling, its standing periods and the act that would double them", async (t) => {
  if (skipHere(t)) return;
  const M = [mon(-5), mon(-4), mon(-3)];
  const client = await freshAdjClient("r10o1b");
  const gen1 = await liveTemplate({
    client, label: "r10o1b gen1", start: M[0].start,
    lines: accrualLines(300_000, { debit: EXPA, credit: ACCR }), memo: "accrual v1" });
  for (const P of M) {
    const r = await runManual(w.users.bob, {
      client, template: gen1.id, periodStart: P.start, periodEnd: P.end });
    await approveDraft(w.users.alice, r.entry_id);
  }

  const proposed = await proposeTemplate(w.users.bob, {
    client, name: `r10o1b gen2 ${Date.now()}`, cadence: "monthly", start: M[0].start,
    lines: accrualLines(150_000, { debit: EXPA, credit: ACCR }), memo: "accrual v2",
    opKey: opk("r10o1b") });
  assert.ok(proposed.template_id, "the propose-first ORDER IS LAWFUL and stays admitted");
  assert.equal(proposed.warnings.length, 1, "…and it is not silent about what it just created");
  const wr = proposed.warnings[0];
  assert.equal(wr.axis, "colliding_live_sibling");
  assert.equal(wr.template_id, gen1.id, "the warning NAMES the sibling");
  assert.equal(wr.status, "live");
  assert.equal(wr.containment, "identical", "…and the shape relation, which is what an edit looks like");
  assert.equal(wr.standing_charges, 3, "…and how many periods it already carries");
  assert.equal(wr.first_period, M[0].start);
  assert.equal(wr.last_period, M[2].end);
  assert.match(wr.message, /would book those periods twice/,
    "…and says, in words, what the distinct-codes act would cost if this IS the replacement");
  assert.deepEqual(wr.colliding_elements, [`${ACCR}:C`, `${EXPA}:D`].sort(),
    "the colliding elements come off the gate's own overlap derivation");

  // AND THE POSTER'S CAUTION RIDES THE 'live' BRANCH — the exact branch round 9 left plain.
  await signTemplate(w.users.hana, { client, template: proposed.template_id, opKey: opk("r10o1bs") });
  const err = await runRefusal(client, proposed.template_id, M[0]);
  assert.equal(reasonToken(err), "period_shape_already_met");
  const d = JSON.parse(err.detail);
  assert.equal(d.standing_template_status, "live");
  assert.deepEqual(d.remedy,
    ["correct_the_standing_entry_in_period", "distinct_codes_with_predecessor_caution"],
    "the caution is keyed on what STANDS, so the click order cannot switch it off");
  assert.equal(d.predecessor_candidates[0].standing, 3);
});

// ---------------------------------------------------------------------------------------
// x42.r10o1c — RECUT AT ROUND 10, LANE O3 (Codex r10 finding 3, LOW). As lane O1 shipped it this
// cell asserted that a standing charge NO template wrote cannot be doubled by a re-cut, and
// therefore that the caution must NOT fire. That is the SAME unearned lineage assertion this very
// round deleted one branch over: whether the orphan charge is the generation this template
// replaces is exactly the question `replaces_template_id` would answer (the owner's fork, option
// (b)) and nothing in these books can. Following the PLAIN clause re-cuts onto fresh codes and
// leaves the orphan standing on the old ones — the doubling, arriving through the one branch the
// round-10 repair left with an implicit discriminant on "attributable". MEASURED (probe
// scratchpad/o3/probes/p5-unknown-writer.mjs): an approved RM3,000 accrual restamped
// template_id:'legacy-not-a-uuid', the colliding template's run refused with remedy
// ["correct_the_standing_entry_in_period","distinct_codes"] and predecessor_candidates [] while
// RM3,000 really was standing on 900-D42:D / 400-D42:C. Uncertainty about the WRITER now fails
// toward the CAUTION, and the honest fact rides in predecessor_candidates instead of being
// resolved by inference. The fix is at clara._wdb_overlapping_siblings (a second, disjoint
// unattributed term), so all three doors that read the census move together.
// ---------------------------------------------------------------------------------------
test("x42.r10o1c [recut, round-10 lane O3] a standing charge NO template of this client wrote still draws the CAUTION — uncertainty about the writer fails toward the measurement, never away from it", async (t) => {
  if (skipHere(t)) return;
  const P = mon(-4);
  const client = await freshAdjClient("r10o1c");
  // One template only (the caller). Its own row is never its own predecessor.
  const tpl = await liveTemplate({
    client, label: "r10o1c caller", start: P.start,
    lines: accrualLines(200_000, { debit: EXPA, credit: ACCR }), memo: "caller" });
  const orphan = await stageOrphanCharge({
    client, period: P, debit: EXPA, credit: ACCR, cents: 200_000 });
  assert.ok(orphan, "a standing machine-stamped charge exists with no template row behind it");

  const err = await runRefusal(client, tpl.id, P);
  assert.equal(reasonToken(err), "period_shape_already_met", "the gate still refuses on the money");
  const d = JSON.parse(err.detail);
  assert.equal(d.standing_template_status, "unknown", "the writer cannot be resolved to a template");
  assert.deepEqual(d.remedy, ["correct_the_standing_entry_in_period", "distinct_codes_with_predecessor_caution"],
    "…so the second act is offered CAUTIONED: a charge that a re-cut would leave standing is a charge a re-cut would leave standing, whoever wrote it, and no body here may decide it is not the predecessor");
  assert.equal(d.predecessor_candidates.length, 1, "the caution names exactly what it measured");
  const cand = d.predecessor_candidates[0];
  assert.equal(cand.template_id, null, "…and says honestly that there is no template to name");
  assert.equal(cand.status, "unknown");
  assert.equal(cand.containment, "unattributed");
  assert.equal(cand.standing, 1, "one standing charge would survive a re-cut onto fresh codes");
  assert.match(err.message, /BUT MEASURE FIRST/, "the measurement is printed where one was found");
  assert.match(err.message, /cannot attribute to any template of this client/,
    "…in words that do not pretend to name a template");
});

// ---------------------------------------------------------------------------------------
// x42.r10o1d — THE CROSS-FAMILY ROAD. The remedy this refusal names leads to a FULLY DISJOINT
// re-cut the collision gate cannot see, so the caution has to ride HERE too — and here it needs no
// inference at all: the predecessor of the replacement it asks for is this template.
// ---------------------------------------------------------------------------------------
test("x42.r10o1d template_line_ineligible measures this template's own standing charges and names the date the replacement must start after — and stays clean when there is nothing standing", async (t) => {
  if (skipHere(t)) return;
  const M = [mon(-3), mon(-2)];
  const client = await freshAdjClient("r10o1d");
  const tpl = await liveTemplate({
    client, label: "r10o1d accrual", start: M[0].start,
    lines: accrualLines(50_000, { debit: EXPA, credit: ACCR }), memo: "audit accrual" });
  for (const P of M) {
    const r = await runManual(w.users.bob, {
      client, template: tpl.id, periodStart: P.start, periodEnd: P.end });
    await approveDraft(w.users.alice, r.entry_id);
  }
  assert.equal(await glNet(client, EXPA), 100_000, "two months stand");

  // THE CROSS-FAMILY ACT, on another family's door: an FA profile claims the template's debit leg.
  await upsertFaProfile(w.users.hana, {
    client, assetAccount: FACOST, accumAccount: FAACC, expenseAccount: EXPA });
  const err = await runRefusal(client, tpl.id, mon(-1));
  assert.equal(reasonToken(err), "template_line_ineligible", "the template is terminally blocked");
  const d = JSON.parse(err.detail);
  assert.equal(d.standing_charges, 2, "the refusal measured what this template already carries");
  assert.equal(d.standing_first_period, M[0].start);
  assert.equal(d.standing_last_period, M[1].end);
  assert.match(err.message, /retire this template and propose a corrected one/,
    "the remedy is unchanged — it is the only act that exists");
  assert.match(err.message, /MEASURE FIRST/, "…but it no longer leads there silently");
  assert.match(err.message, new RegExp(`Start the replacement after ${M[1].end}`),
    "…and it names the DATE, because a start date reaching back over those periods is the doubling");
  assert.match(err.message, /the re-run gate cannot see the double/,
    "…and says why the gate will not catch it: the replacement's codes share no account with these");

  // OFF-PATH: the SAME refusal on a template that has never posted must stay clean. A caution
  // printed where nothing can double is the noise that teaches a reader to skip the sentence.
  const client2 = await freshAdjClient("r10o1d2");
  const tpl2 = await liveTemplate({
    client: client2, label: "r10o1d fresh", start: M[0].start,
    lines: accrualLines(50_000, { debit: EXPA, credit: ACCR }), memo: "never ran" });
  await upsertFaProfile(w.users.hana, {
    client: client2, assetAccount: FACOST, accumAccount: FAACC, expenseAccount: EXPA });
  const err2 = await runRefusal(client2, tpl2.id, M[0]);
  assert.equal(reasonToken(err2), "template_line_ineligible");
  const d2 = JSON.parse(err2.detail);
  assert.equal(d2.standing_charges, 0);
  assert.equal(d2.standing_first_period, null);
  assert.doesNotMatch(err2.message, /MEASURE FIRST/,
    "nothing stands, so nothing is cautioned about");
});

// ---------------------------------------------------------------------------------------
// x42.r10o1e — THE PAYLOAD NAMES EVERY COLLIDING ELEMENT IN THE WINDOW, not the first standing
// member's. "These collide" without "on WHAT" is a remedy the reader cannot follow — and half of
// where is half a remedy, one refused re-cut per round trip.
// ---------------------------------------------------------------------------------------
test("x42.r10o1e when two standing members of one window collide on different elements the payload unions them — and a shape-less read still returns no opinion at all", async (t) => {
  if (skipHere(t)) return;
  const client = await freshAdjClient("r10o1e");
  const P = mon(-4);
  // An auto-reverse template: the occurrence posts on the period end (Dr EXPA / Cr ACCR) and its
  // mirror posts the next day with the sides swapped. A caller window that contains BOTH, asked
  // with a shape that collides with the occurrence on EXPA:D and with the mirror on EXPA:C.
  const tpl = await liveTemplate({
    client, label: "r10o1e pair", start: P.start, autoReverse: true,
    lines: accrualLines(250_000, { debit: EXPA, credit: ACCR }), memo: "pair" });
  const r = await runManual(w.users.bob, {
    client, template: tpl.id, periodStart: P.start, periodEnd: P.end });
  await approveDraft(w.users.alice, r.entry_id);
  const mirror = (await rootQuery(
    "select id, status from clara.journal_entries where auto_reversal_of = $1", [r.entry_id])).rows[0];
  if (mirror && mirror.status === "draft") await approveDraft(w.users.alice, mirror.id);

  const wide = { start: `${P.start.slice(0, 4)}-01-01`, end: `${P.start.slice(0, 4)}-12-31` };
  const gate = (await rootQuery(
    `select clara._wdb_rerun_breach($1,'recurring_adjustment',$2::text[],$3::date,$4::date) as b`,
    [client, [`${EXPA}:D`, `${EXPA}:C`], wide.start, wide.end])).rows[0].b;
  assert.equal(gate.axis, "shape_already_met");
  assert.deepEqual(gate.colliding_elements, [`${EXPA}:C`, `${EXPA}:D`],
    "both members' colliding elements, sorted and distinct — one re-cut clears the window, not one per round trip");

  // OFF-PATH: NULL IN, NULL OUT. A shape-less read has no opinion about elements and must not
  // acquire one from the union.
  const noShape = (await rootQuery(
    `select clara._wdb_rerun_breach($1,'recurring_adjustment',null::text[],$2::date,$3::date) as b`,
    [client, wide.start, wide.end])).rows[0].b;
  assert.equal(noShape.axis, "shape_already_met", "every shape collides with 'no opinion'");
  assert.equal(noShape.colliding_elements, null, "…and it still names none");
});

// ---------------------------------------------------------------------------------------
// x42.r10o1f — THE PROPOSE DOOR'S ADVISORIES ARE ADVISORY. They must change no admission, and they
// must stay SILENT on the collision the product deliberately supports.
// ---------------------------------------------------------------------------------------
test("x42.r10o1f the propose advisories change nothing about admission: an implausible start date warns and still signs and runs, a partial (designed) overlap warns not at all, and an ordinary proposal carries an empty warnings array", async (t) => {
  if (skipHere(t)) return;
  const P = mon(-4);

  // (1) ORDINARY: the key is present and empty. A caller that must test for the key's existence
  // is a caller that will one day forget.
  const c1 = await freshAdjClient("r10o1f1");
  const ordinary = await proposeTemplate(w.users.bob, {
    client: c1, name: `r10o1f ordinary ${Date.now()}`, cadence: "monthly", start: P.start,
    lines: accrualLines(100_000, { debit: EXPA, credit: ACCR }), memo: "ordinary",
    opKey: opk("r10o1f1") });
  assert.deepEqual(ordinary.warnings, [], "nothing to say, said as an empty array");

  // (2) THE DESIGNED COLLISION: two liabilities sharing one accrual code. Neither shape contains
  // the other, so this is not an edit — and a warning here would train the reader to skip the key.
  const partial = await proposeTemplate(w.users.bob, {
    client: c1, name: `r10o1f legal ${Date.now()}`, cadence: "monthly", start: P.start,
    lines: accrualLines(70_000, { debit: EXPB, credit: ACCR }), memo: "legal",
    opKey: opk("r10o1f2") });
  assert.deepEqual(partial.warnings, [],
    "a partial overlap is the DESIGNED grain, not a re-cut: the door stays quiet");

  // (3) THE TYPO. Round 8 ruled the date DOMAIN as AD 0001..9999 and that ruling is untouched:
  // this is a plausibility warning, and it may not become an admission.
  const c2 = await freshAdjClient("r10o1f3");
  const typo = await proposeTemplate(w.users.bob, {
    client: c2, name: `r10o1f typo ${Date.now()}`, cadence: "monthly", start: "0001-01-01",
    lines: accrualLines(100_000, { debit: EXPA, credit: ACCR }), memo: "typo",
    opKey: opk("r10o1f3") });
  assert.ok(typo.template_id, "the date domain still ADMITS it — no new date law was invented here");
  assert.equal(typo.warnings.length, 1);
  assert.equal(typo.warnings[0].axis, "implausible_start_date");
  assert.equal(typo.warnings[0].plausible_from, "1900-01-01",
    "the floor is stated as a fact the reader can check, not hidden in prose");
  const signed = await signTemplate(w.users.hana, {
    client: c2, template: typo.template_id, opKey: opk("r10o1f4") });
  assert.equal(signed.status, "live", "sign is unaffected — the warning is not a gate");
  const due = await adjustmentRunDue(c2);
  assert.equal(due.due, true, "and the oracle answers exactly as it did before the warning existed");
  assert.equal(due.period_start, "0001-01-01");
});

// ---------------------------------------------------------------------------------------
// x42.r10o1g — THE WALK GUARD'S SUBJECT, MEASURED THROUGH THE INSTRUMENT PRODUCTION USES. Round 10
// measured that `template_window_scan_exceeded` could not fire for the case its comment named (a
// wide window / a start-date typo): the walk RETURNS at the first unmet period, so an ancient start
// exits at guard = 1. The arm now names what the counter actually measures — a run of MET periods,
// each one an approved un-corrected occurrence — and this cell pins BOTH halves of that claim.
// ---------------------------------------------------------------------------------------
test("x42.r10o1g an ancient start date never trips the scan guard (the walk returns at the first unmet period) while a 2400-long run of MET periods does, on the axis that names it", async (t) => {
  if (skipHere(t)) return;

  // (a) THE CASE THE OLD COMMENT CLAIMED: it does not reach the guard at all.
  const c1 = await freshAdjClient("r10o1g1");
  const ancient = await proposeTemplate(w.users.bob, {
    client: c1, name: `r10o1g ancient ${Date.now()}`, cadence: "monthly", start: "0001-01-01",
    lines: accrualLines(100_000, { debit: EXPA, credit: ACCR }), memo: "ancient",
    opKey: opk("r10o1g1") });
  await signTemplate(w.users.hana, { client: c1, template: ancient.template_id, opKey: opk("r10o1g2") });
  const due = await adjustmentRunDue(c1);
  assert.equal(due.due, true, "the oracle answers on the FIRST iteration — the guard is silent");
  assert.equal(due.period_end, "0001-01-31", "…naming the first period, which is unmet");

  // (b) THE CASE THE COUNTER ACTUALLY MEASURES. 2,401 consecutive MET monthly periods staged as
  // approved, un-corrected occurrences of ONE template — the only state that can walk 2,400 times.
  const c2 = await freshAdjClient("r10o1g3");
  const start = "1800-01-01";
  const tpl = await proposeTemplate(w.users.bob, {
    client: c2, name: `r10o1g long ${Date.now()}`, cadence: "monthly", start,
    lines: accrualLines(1_000, { debit: EXPA, credit: ACCR }), memo: "long",
    opKey: opk("r10o1g4") });
  await signTemplate(w.users.hana, { client: c2, template: tpl.template_id, opKey: opk("r10o1g5") });
  const conn = await getPool().connect();
  try {
    await conn.query("set session_replication_role = replica");
    await conn.query(
      `with src as (select cl.firm_id,
                          (select m.user_id from clara.firm_memberships m
                            where m.firm_id = cl.firm_id and m.status = 'active'
                            order by m.created_at limit 1) as actor
                     from clara.clients cl where cl.id = $1),
       months as (select ($2::date + (g || ' months')::interval)::date as ps,
                         (($2::date + ((g + 1) || ' months')::interval)::date - 1) as pe
                    from generate_series(0, 2400) g),
       ins as (
         insert into clara.journal_entries(client_id, firm_id, status, posting_date, memo, origin,
             is_opening_balance, is_year_end, tax_affecting, maker_actor, last_human_editor,
             approved_at, checker_actor, flags)
         select $1, s.firm_id, 'approved', m.pe, 'r10o1g met ' || m.ps, 'scheduled_run',
                false, false, false, s.actor, s.actor, now(), s.actor,
                jsonb_build_object('recurring_adjustment', jsonb_build_object(
                  'template_id', $3::text, 'role', 'occurrence',
                  'period_start', to_char(m.ps, 'YYYY-MM-DD'),
                  'period_end', to_char(m.pe, 'YYYY-MM-DD')))
           from months m, src s
         returning id, firm_id)
       insert into clara.journal_lines(entry_id, firm_id, client_id, line_no, account_code,
           debit_cents, credit_cents)
       select i.id, i.firm_id, $1, v.n, v.code, v.dr, v.cr
         from ins i, (values (1, $4::text, 1000::bigint, 0::bigint),
                             (2, $5::text, 0::bigint, 1000::bigint)) v(n, code, dr, cr)`,
      [c2, start, tpl.template_id, EXPA, ACCR]);
  } finally {
    await conn.query("set session_replication_role = origin").catch(() => {});
    conn.release();
  }
  const raised = await caught(() => adjustmentRunDue(c2));
  assert.ok(raised, "2,400 consecutive met periods is a state the oracle refuses to walk past");
  assert.equal(raised.code, CLR38);
  const d = JSON.parse(raised.detail);
  assert.equal(d.reason, "template_window_scan_exceeded", "the ABI token is unchanged");
  assert.equal(d.axis, "met_period_run",
    "…and the axis names what the counter measures: a run of MET periods, not a wide window");
  assert.equal(d.periods_walked, 2400);
});
