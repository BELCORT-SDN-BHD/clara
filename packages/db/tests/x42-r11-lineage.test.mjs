// 0045 Wave D-b slice D-b2 — AS-BUILT LADDER ROUND 11, THE HOLD-LADDER'S OPENING FIX WAVE.
//
// Round 11 ran four lenses over the whole unit and was NOT mechanism-free: two HIGH money
// mechanisms in the lineage complex (W1), two HIGH in the admission doors (W2), and Codex's own
// reproduction of the first plus two integrity gaps and a token mismatch. The conditional rule
// fired, the SPLIT became the executed ruling, and this slice was HELD back with that family.
// This file is the ladder's evidence that the held fixes are built and that they are the RIGHT
// fixes — every cell drives a MEASURED failing scenario from the round-11 reports, and the
// probes that produced those scenarios are `slices/d-b2/probes/r11-postchecks.mjs`, which was run
// against the PRE-FIX build (f66f4631) and reported DEFECT on eight of nine before this file
// existed. A cell that cannot fail on the pre-fix build proves nothing, and each one below says
// which behaviour it measured there.
//
// CONTRACT-BLIND, like the rest of this battery: every object is built through the audited verbs
// and every assertion is about the BOOKS or about a payload a caller receives — never about the
// migration's text.
//
// THE LAW UNDER TEST (from ladder-r11-record.md, which is the authority and is not re-derived):
//   * a DECLARED lineage edge is a PERIOD-MEMBERSHIP WALL, independent of account-code shape:
//     the run of a period a generation this template replaces still carries is REFUSED, and the
//     due oracle says so on blocked[] so the unattended sweep never drives into it;
//   * ...and it is a wall for the periods that generation ACTUALLY charged and no others: the
//     lawful forward-only re-code still runs, and the prohibition may not assert on money the
//     replacement can never reach;
//   * a refusal may not tell a professional to correct an entry that belongs to somebody else's
//     accrual, nor promise a period back that a second standing charge still holds;
//   * a parked pair correction may not advertise a completion the walls refuse;
//   * an unfollowable ancestry pointer is a TRUNCATED walk, and a truncated walk may not be
//     extended;
//   * one generation may be replaced ONCE among unretired templates;
//   * and the declaration a professional makes must be visible: propose warns about the periods
//     it reaches back over, and the projection carries the recorded edge.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  opk, endPool, printLaneNotes, printSkipCount, rootQuery, humanQuery, namedCall,
  x42EnsureReady, skip42, caught, reasonToken,
  EXPA, EXPB, ACCR, ACCR2, PREP, CLR38, CLR10, mon,
  runManual, retireTemplate, signTemplate, adjustmentRunDue, reverseEntry,
  accrualLines, prepaymentLines, adjWorld, freshAdjClient, liveTemplate, approveDraft, glNet,
  enrolAdvance, reversePair,
} from "./x42-adj-helpers.mjs";

let live = false;
let w = null;

before(async () => {
  live = await x42EnsureReady();
  if (live) w = await adjWorld();
});
after(async () => {
  printLaneNotes("x42-r11");
  printSkipCount("x42-r11");
  await endPool();
});
const skipHere = (t) => skip42(t, live);

/** propose WITH the optional trailing lineage declaration (the same call every other cell makes,
 *  plus one name — the whole content of "additive ABI delta"). */
const proposeR = async (sub, {
  client, name, cadence = "monthly", start, end = null, autoReverse = false,
  lines, memo = "x42 r11 accrual", replaces = null, opKey = null,
}) => (await humanQuery(sub, namedCall("propose_adjustment_template", [
  { name: "p_client" }, { name: "p_name" }, { name: "p_cadence" },
  { name: "p_start_date", cast: "date" }, { name: "p_end_date", cast: "date" },
  { name: "p_auto_reverse", cast: "boolean" }, { name: "p_lines", cast: "jsonb" },
  { name: "p_memo_template" }, { name: "p_op_key" }, { name: "p_replaces", cast: "uuid" },
]), [client, name, cadence, start, end, autoReverse, JSON.stringify(lines), memo,
  opKey ?? opk("x42r11prop"), replaces])).rows[0].result;

async function liveReplacement(o) {
  const p = await proposeR(w.users.bob, o);
  await signTemplate(w.users.hana, { client: o.client, template: p.template_id, opKey: opk("x42r11sig") });
  return p;
}
const detailOf = (err) => JSON.parse(err.detail);
const doorOf = async (entry) =>
  (await rootQuery("select clara._adj_correction_door($1) as j", [entry])).rows[0].j;

async function standingMonths(client, template, months) {
  for (const P of months) {
    const r = await runManual(w.users.bob, {
      client, template, periodStart: P.start, periodEnd: P.end });
    await approveDraft(w.users.alice, r.entry_id);
  }
}
/** Run every month of `months`, stopping at the first refusal and returning it. */
async function runUntilRefused(client, template, months) {
  for (const P of months) {
    let r = null;
    try {
      r = await runManual(w.users.bob, { client, template, periodStart: P.start, periodEnd: P.end });
    } catch (e) { return e; }
    await approveDraft(w.users.alice, r.entry_id);
  }
  return null;
}

// ---------------------------------------------------------------------------------------
// x42.r11a — THE SILENT RE-CODE DOUBLE (W1 finding 1 HIGH; Codex r11 finding 1 HIGH, conf 1.00).
// MEASURED ON THE PRE-FIX BUILD: all four catch-up months RAN with propose warnings [], the
// oracle's blocked [] and no refusal anywhere — EXPA 1,200,000 standing PLUS EXPB 600,000 booked,
// i.e. RM18,000 of expense against an RM6,000 intention, self-perpetuating.
// ---------------------------------------------------------------------------------------
test("x42.r11a a DECLARED replacement on DISJOINT codes may not re-charge the months its predecessor still carries: the run is refused replaced_generation_period_standing, the oracle carries it on blocked[], and not one sen of the replacement posts", async (t) => {
  if (skipHere(t)) return;
  const M = [mon(-6), mon(-5), mon(-4), mon(-3)];
  const client = await freshAdjClient("r11a");
  const gen1 = await liveTemplate({
    client, label: "r11a gen1", start: M[0].start,
    lines: accrualLines(300_000, { debit: EXPA, credit: ACCR }), memo: "accrual v1" });
  await standingMonths(client, gen1.id, M);
  await retireTemplate(w.users.hana, { client, template: gen1.id, reason: "re-coded" });

  const gen2 = await liveReplacement({
    client, name: `x42 r11a gen2 ${Date.now()}`, start: M[0].start,
    lines: accrualLines(150_000, { debit: EXPB, credit: ACCR2 }), memo: "accrual v2",
    replaces: gen1.id });

  const err = await runUntilRefused(client, gen2.template_id, M);
  assert.ok(err, "the FIRST month is refused — the wall is an ADMISSION predicate, not a report");
  assert.equal(err.code, CLR38);
  assert.equal(reasonToken(err), "replaced_generation_period_standing");
  const d = detailOf(err);
  assert.deepEqual(d.replaced_generations, [gen1.id],
    "the prohibition names the proof it rests on, machine-readably");
  assert.deepEqual(d.remedy, [
    "correct_the_standing_entry_in_period",
    "start_after_replaced_generation",
    "re_propose_without_predecessor",
  ], "and every act the sentence offers is in the machine list — a prohibition with no way out is the walled corridor this ladder keeps rebuilding");
  assert.equal(d.lineage_truncated, false, "the walk reached a root");
  assert.equal(d.standing_in_period?.[0]?.template_id, gen1.id);
  assert.ok(d.start_after, "the date a non-doubling replacement may start after is stated, not implied");
  assert.match(err.message, /the account codes are irrelevant to it/,
    "the sentence says WHY the shape gate could not see this — a re-code doubles just as exactly");

  // THE MONEY (WDB-R4: the books, not the gate's answer).
  assert.equal(await glNet(client, EXPA), 1_200_000, "the predecessor's four months stand untouched");
  assert.equal(await glNet(client, EXPB), 0, "and NOT ONE month of the replacement posted");

  // AND THE UNATTENDED LANE IS TOLD, or the sweep drives into a CLR38 once a day forever.
  const due = await adjustmentRunDue(client);
  assert.equal(due.due, false);
  assert.ok((due.blocked ?? []).some((b) => b.template_id === gen2.template_id
    && b.reason === "replaced_generation_period_standing"),
    "blocked[] carries the fifth reason with the ABI's unchanged {template_id, reason} row shape");
});

// ---------------------------------------------------------------------------------------
// x42.r11b — THE FALSE-POSITIVE PROOF, and it is what makes the wall safe to ship (W1's own
// probe w1b, both lawful re-code roads). If this cell ever reds, the wall has become over-broad
// and is parking healthy books — the failure mode a shape-keyed wall was REJECTED for.
// ---------------------------------------------------------------------------------------
test("x42.r11b the two LAWFUL re-codes are untouched: a forward-only replacement books every month it should, and a correct-then-recut books the corrected figure exactly once", async (t) => {
  if (skipHere(t)) return;
  const M = [mon(-6), mon(-5)];
  const N = [mon(-4), mon(-3)];

  // (1) FORWARD-ONLY: the replacement starts after the predecessor's last charged period.
  const c1 = await freshAdjClient("r11b1");
  const g1 = await liveTemplate({
    client: c1, label: "r11b1 gen1", start: M[0].start,
    lines: accrualLines(300_000, { debit: EXPA, credit: ACCR }), memo: "v1" });
  await standingMonths(c1, g1.id, M);
  await retireTemplate(w.users.hana, { client: c1, template: g1.id, reason: "forward re-code" });
  const g2 = await liveReplacement({
    client: c1, name: `x42 r11b1 gen2 ${Date.now()}`, start: N[0].start,
    lines: accrualLines(150_000, { debit: EXPB, credit: ACCR2 }), memo: "v2", replaces: g1.id });
  assert.equal(await runUntilRefused(c1, g2.template_id, N), null,
    "a forward-only re-code is LAWFUL and the wall may not park it");
  assert.equal(await glNet(c1, EXPA), 600_000);
  assert.equal(await glNet(c1, EXPB), 300_000, "every figure right, nothing doubled");

  // (2) CORRECT-THEN-RECUT: reversing the generation in its own periods opens them again.
  const c2 = await freshAdjClient("r11b2");
  const h1 = await liveTemplate({
    client: c2, label: "r11b2 gen1", start: M[0].start,
    lines: accrualLines(300_000, { debit: EXPA, credit: ACCR }), memo: "v1" });
  await standingMonths(c2, h1.id, M);
  await retireTemplate(w.users.hana, { client: c2, template: h1.id, reason: "re-coded" });
  const h2 = await liveReplacement({
    client: c2, name: `x42 r11b2 gen2 ${Date.now()}`, start: M[0].start,
    lines: accrualLines(150_000, { debit: EXPB, credit: ACCR2 }), memo: "v2", replaces: h1.id });
  assert.ok(await runUntilRefused(c2, h2.template_id, M), "walled while the generation stands");
  const standing = await rootQuery(
    `select je.id from clara.journal_entries je
      where je.client_id = $1 and je.status = 'approved' and je.reversed_by is null
        and (je.flags -> 'recurring_adjustment' ->> 'template_id') = $2
      order by je.posting_date`, [c2, h1.id]);
  assert.equal(standing.rowCount, 2);
  for (const s of standing.rows) {
    await reverseEntry(w.users.bob, {
      entry: s.id, reason: "x42 r11b correct the generation", opKey: opk("r11brev") });
  }
  assert.equal(await runUntilRefused(c2, h2.template_id, M), null,
    "with the generation corrected in its own periods, the wall's subject is gone and the periods reopen");
  assert.equal(await glNet(c2, EXPA), 0);
  assert.equal(await glNet(c2, EXPB), 300_000, "two months at the CORRECTED figure and nothing else");
});

// ---------------------------------------------------------------------------------------
// x42.r11c — THE PERIOD-BLIND ASSERTION (W1 finding 2, HIGH). MEASURED ON THE PRE-FIX BUILD: the
// refusal asserted that distinct codes "would book 2026-01 .. 2026-02 a SECOND time" for a
// template that starts in May and can never book them, forbade the CORRECT act, and offered as
// its first remedy an entry belonging to an unrelated LIVE template — following which erased
// RM900 of a legitimate legal-fee accrual and closed that template's own period forever.
// ---------------------------------------------------------------------------------------
test("x42.r11c a generation whose charges this template can NEVER book is not a prohibition: the honest caution prints, nothing is forbidden, and replaced_generations is empty", async (t) => {
  if (skipHere(t)) return;
  const A = [mon(-8), mon(-7)];
  const P = mon(-4);
  const client = await freshAdjClient("r11c");
  const gen1 = await liveTemplate({
    client, label: "r11c audit", start: A[0].start,
    lines: accrualLines(300_000, { debit: EXPA, credit: ACCR }), memo: "audit v1" });
  await standingMonths(client, gen1.id, A);
  await retireTemplate(w.users.hana, { client, template: gen1.id, reason: "engagement re-cut" });
  // THE DESIGNED COLLISION this file documents: two liabilities sharing one accrual code.
  const u = await liveTemplate({
    client, label: "r11c legal", start: P.start,
    lines: accrualLines(90_000, { debit: EXPB, credit: ACCR }), memo: "legal fee" });
  await standingMonths(client, u.id, [P]);
  const gen2 = await liveReplacement({
    client, name: `x42 r11c gen2 ${Date.now()}`, start: P.start,
    lines: accrualLines(250_000, { debit: EXPA, credit: ACCR }), memo: "audit v2",
    replaces: gen1.id });

  const err = await caught(() => runManual(w.users.bob, {
    client, template: gen2.template_id, periodStart: P.start, periodEnd: P.end }));
  assert.ok(err, "the period IS refused — the legal accrual collides — but on the HONEST grounds");
  const d = detailOf(err);
  assert.deepEqual(d.replaced_generations, [],
    "the recorded ancestor's money is out of this template's reach, so it is not part of the proof");
  assert.deepEqual(d.remedy,
    ["correct_the_standing_entry_in_period", "distinct_codes_with_predecessor_caution"],
    "the caution branch, with the distinct-codes act still OFFERED — measured correct on this shape");
  assert.doesNotMatch(err.message, /Do NOT give this template distinct account codes/,
    "nothing may be forbidden on money the replacement can never touch");
  assert.match(err.message, /BUT MEASURE FIRST/, "…and the honest measurement is what prints instead");

  // THE MONEY: the once-forbidden act is followed, and every figure is right.
  const recut = await liveTemplate({
    client, label: "r11c audit recut", start: P.start,
    lines: accrualLines(250_000, { debit: EXPA, credit: ACCR2 }), memo: "audit v2, own code" });
  await standingMonths(client, recut.id, [P]);
  assert.equal(await glNet(client, EXPA), 600_000 + 250_000, "the two old audit months plus one new");
  assert.equal(await glNet(client, ACCR), -600_000 - 90_000, "the legal accrual is INTACT");
  assert.equal(await glNet(client, ACCR2), -250_000);
});

// ---------------------------------------------------------------------------------------
// x42.r11d — CLAUSE 1 MAY NOT SPEAK FOR MONEY IT DOES NOT OWN (W1 finding 2's remedy[0] half).
// The asserted branch, with the entry blocking THIS period written by a template the subject
// does NOT replace. MEASURED PRE-FIX: the sentence told the professional to correct that entry
// and promised the period back.
// ---------------------------------------------------------------------------------------
test("x42.r11d when the entry in the way belongs to a template this one does NOT replace, the prohibition says so instead of sending the reader to correct a stranger's accrual", async (t) => {
  if (skipHere(t)) return;
  const A = [mon(-8), mon(-7)];
  const P = mon(-4);
  const client = await freshAdjClient("r11d");
  const gen1 = await liveTemplate({
    client, label: "r11d gen1", start: A[0].start,
    lines: accrualLines(300_000, { debit: EXPA, credit: ACCR }), memo: "v1" });
  await standingMonths(client, gen1.id, A);
  await retireTemplate(w.users.hana, { client, template: gen1.id, reason: "superseded" });
  const u = await liveTemplate({
    client, label: "r11d other", start: P.start,
    lines: accrualLines(90_000, { debit: EXPB, credit: ACCR2 }), memo: "other" });
  await standingMonths(client, u.id, [P]);
  const gen2 = await liveReplacement({
    client, name: `x42 r11d gen2 ${Date.now()}`, start: A[0].start,
    lines: accrualLines(150_000, { debit: EXPA, credit: ACCR2 }), memo: "v2", replaces: gen1.id });

  const err = await caught(() => runManual(w.users.bob, {
    client, template: gen2.template_id, periodStart: P.start, periodEnd: P.end }));
  assert.ok(err);
  const d = detailOf(err);
  assert.deepEqual(d.replaced_generations, [gen1.id],
    "the ancestor IS reachable (its months lie inside this template's window), so the assertion is earned");
  assert.notEqual(d.standing_template_id, gen1.id,
    "…but the entry blocking THIS period was written by somebody else — the composition the finding measured");
  assert.match(err.message, /does NOT replace/,
    "and the sentence says so rather than implying that correcting it is what the prohibition asks");
  assert.doesNotMatch(err.message, /Correct the standing entry named above and this period reopens by itself/,
    "the unconditional reopen promise may not be made about an entry that is not the subject");
});

// ---------------------------------------------------------------------------------------
// x42.r11e — THE PARKED PAIR MAY NOT ADVERTISE A COMPLETION THE WALLS REFUSE (W2 finding 1,
// HIGH — Codex r10's C1 class alive inside the O3 repair that closed it). MEASURED PRE-FIX: the
// DURABLE receipt read {correctable:false, wall:'pair_already_active', wall_advice:null} while
// approve_pair_reversal refused CLR40 and rolled back; the one act that works was never
// distinguished from the one that cannot.
// ---------------------------------------------------------------------------------------
test("x42.r11e a pair correction parked over a code that is then enrolled as a staff advance reports the ADMISSION wall with its own sentence — and still reports the pair as active, because the consumer needs both facts", async (t) => {
  if (skipHere(t)) return;
  const CENTS = 1_500_000;                       // above the rig firm's high-stakes threshold
  const P = mon(-3);
  const client = await freshAdjClient("r11e");
  const tpl = await liveTemplate({
    client, label: "r11e", start: P.start, cents: CENTS, autoReverse: true,
    lines: prepaymentLines(CENTS), memo: "Prepaid insurance" });
  const r = await runManual(w.users.bob, {
    client, template: tpl.id, periodStart: P.start, periodEnd: P.end });
  await approveDraft(w.users.alice, r.entry_id);

  await reversePair(w.users.bob, {
    client, occurrence: r.entry_id, reason: "x42 r11e correct the pair", opKey: opk("r11epair") });
  const parked = await doorOf(r.entry_id);
  assert.equal(parked.wall, "pair_already_active",
    "setup: the high-stakes correction PARKED for a second bookkeeper");
  assert.equal(parked.active_pair_status, "pending");

  // THE LAWFUL ACT DURING THE PARK: the pair has netted the prepayment code to zero, so an admin
  // may enrol it as a staff-advance account — another family's door, admitted silently.
  const enr = await caught(() => enrolAdvance(w.users.hana, {
    client, accountCode: PREP, personLabel: "r11e staff", opKey: opk("r11eenrol") }));
  assert.equal(enr, null,
    "MANDATORY SETUP: the enrolment is a lawful public act on a netted code — if it is refused this is not the measured scenario");

  const door = await doorOf(r.entry_id);
  assert.equal(door.correctable, false);
  assert.equal(door.wall, "advance_movement_unregistered",
    "the wall reported is the one that actually closes the completion, never the routing token");
  assert.ok(String(door.wall_advice ?? "").length > 0,
    "…carrying the OWNING body's own followable sentence — a token with no sentence is a dead end");
  assert.match(String(door.wall_advice), /staff-advance account/);
  assert.ok(door.active_pair_id, "and the pair is STILL reported active — the park is real");
  assert.equal(door.active_pair_status, "pending",
    "both facts: the pair is in flight AND its completion is inadmissible");
});

// ---------------------------------------------------------------------------------------
// x42.r11f — FAIL-CLOSED DANGLING ANCESTRY (W1 finding 5; Codex r11 finding 3, conf 0.99).
// MEASURED PRE-FIX: {depth:0, ancestors:[], truncated:FALSE} — "I reached a root" — and propose
// then EXTENDED the damaged lineage.
// ---------------------------------------------------------------------------------------
test("x42.r11f an ancestry pointer whose target is not there is a TRUNCATED walk, and a truncated walk may not be extended", async (t) => {
  if (skipHere(t)) return;
  const client = await freshAdjClient("r11f");
  const src = await liveTemplate({
    client, label: "r11f src", start: mon(-6).start,
    lines: accrualLines(100_000, { debit: EXPA, credit: ACCR }), memo: "src" });
  await retireTemplate(w.users.hana, { client, template: src.id, reason: "staged" });

  // FIXTURE SURGERY, and the reason is the point: the composite FK makes a dangling edge
  // UNSTORABLE through every door, so the only producer of this shape is a partial restore. The
  // FK is dropped for one statement and restored NOT VALID — which is exactly what a restore
  // that did not re-check existing rows leaves behind.
  await rootQuery("alter table clara.adjustment_templates drop constraint if exists fk_adjustment_templates_replaces");
  const staged = (await rootQuery(
    `insert into clara.adjustment_templates(firm_id, client_id, status, name, cadence, start_date,
        auto_reverse, lines, memo_template, content_hash, replaces_template_id, proposed_by,
        proposed_op_key, signed_by, signed_at, retired_by, retired_at, retired_reason)
     select t.firm_id, t.client_id, 'retired', 'x42 r11f dangling', 'monthly', t.start_date, false,
            t.lines, 'x42 r11f', md5(random()::text)||md5(random()::text),
            '00000000-0000-4000-8000-0000000000ff', t.proposed_by, 'x42-r11f-staged', t.proposed_by,
            now(), t.proposed_by, now(), 'x42 r11f staged'
       from clara.adjustment_templates t where t.id=$1 returning id`, [src.id])).rows[0].id;
  await rootQuery(`alter table clara.adjustment_templates add constraint fk_adjustment_templates_replaces
      foreign key (replaces_template_id, firm_id, client_id)
      references clara.adjustment_templates(id, firm_id, client_id) not valid`);

  const anc = (await rootQuery("select clara._wdb_template_ancestry($1,$2) as a", [client, staged]))
    .rows[0].a;
  assert.equal(anc.truncated, true,
    "a row whose pointer produced no child stopped before a root, whatever the reason");
  assert.deepEqual(anc.ancestors, [], "…and it still reports honestly what it DID find");

  const extend = await caught(() => proposeR(w.users.bob, {
    client, name: `x42 r11f child ${Date.now()}`, start: mon(-3).start,
    lines: accrualLines(50_000, { debit: EXPB, credit: ACCR2 }), replaces: staged }));
  assert.ok(extend, "a predecessor whose own ancestry cannot be walked is not a foundation to assert on");
  assert.equal(extend.code, CLR10);
  assert.equal(reasonToken(extend), "template_replaces_chain_too_long");
  assert.equal(detailOf(extend).axis, "unwalkable");
  assert.match(extend.message, /propose this one without naming a predecessor/,
    "…and the refusal names an act the caller can take");

  // AND THE RIG IS LEFT AS IT WAS FOUND [round-12 confirming lens, native finding 7]. This cell
  // is the only one in the battery that changes the SCHEMA, and it was leaving the composite FK
  // behind as NOT VALID — so every later cell (and every later lane sharing the rig) ran against
  // a constraint that no longer checks new rows, and the next reader would have measured that as
  // the build's posture rather than as this cell's litter. The forged rows are deleted with user
  // triggers silenced (the table's transition trigger refuses every DELETE by design, which is
  // the law under test elsewhere and not something to weaken), and the FK is then re-added VALID
  // — which it can be, because no dangling pointer is left anywhere.
  //
  // THE DELETE IS KEYED ON THE SHAPE, NOT ON THIS RUN'S ID, deliberately: a dangling edge is
  // UNSTORABLE through every door, so the only rows this predicate can ever match are ones this
  // cell staged — including any an EARLIER run of it left behind on a shared rig. Cleaning only
  // `staged` would leave the re-validation failing on somebody else's litter, which is how a
  // restoration step quietly stops restoring.
  await rootQuery(`do $$ begin
    set local session_replication_role = 'replica';
    delete from clara.adjustment_templates t
     where t.replaces_template_id is not null
       and not exists (select 1 from clara.adjustment_templates p where p.id = t.replaces_template_id);
  end $$;`);
  assert.equal((await rootQuery("select count(*)::int as n from clara.adjustment_templates where id=$1",
    [staged])).rows[0].n, 0, "the staged forgery is gone");
  await rootQuery(`alter table clara.adjustment_templates drop constraint if exists fk_adjustment_templates_replaces`);
  await rootQuery(`alter table clara.adjustment_templates add constraint fk_adjustment_templates_replaces
      foreign key (replaces_template_id, firm_id, client_id)
      references clara.adjustment_templates(id, firm_id, client_id)`);
  const fk = (await rootQuery(
    `select convalidated from pg_constraint where conname='fk_adjustment_templates_replaces'`)).rows[0];
  assert.equal(fk.convalidated, true,
    "the lineage FK is VALID again — a cell that stages a forged graph puts the guard back");
});

// ---------------------------------------------------------------------------------------
// x42.r11g — ONE GENERATION IS REPLACED ONCE (Codex r11 finding 4, conf 0.92). MEASURED PRE-FIX:
// two concurrent sessions each declared a different child of one retired predecessor, both were
// signed, and the predecessor ended with TWO LIVE DIRECT SUCCESSORS — a lineage FORK, which every
// consumer of the walk is written to treat as a chain.
// ---------------------------------------------------------------------------------------
test("x42.r11g a second declaration of the same predecessor is refused BY NAME at the door, and the storage layer refuses it too when the door is bypassed", async (t) => {
  if (skipHere(t)) return;
  const client = await freshAdjClient("r11g");
  const gen1 = await liveTemplate({
    client, label: "r11g gen1", start: mon(-6).start,
    lines: accrualLines(100_000, { debit: EXPA, credit: ACCR }), memo: "v1" });
  await retireTemplate(w.users.hana, { client, template: gen1.id, reason: "superseded" });

  const a = await proposeR(w.users.bob, {
    client, name: `x42 r11g A ${Date.now()}`, start: mon(-6).start,
    lines: accrualLines(90_000, { debit: EXPA, credit: ACCR }), replaces: gen1.id });
  assert.ok(a.template_id, "the FIRST successor is admitted");

  const b = await caught(() => proposeR(w.users.bob, {
    client, name: `x42 r11g B ${Date.now()}`, start: mon(-6).start,
    lines: accrualLines(80_000, { debit: EXPB, credit: ACCR2 }), replaces: gen1.id }));
  assert.ok(b, "the SECOND is not");
  assert.equal(b.code, CLR10);
  assert.equal(reasonToken(b), "template_replaces_already_succeeded");
  assert.equal(detailOf(b).successor_template_id, a.template_id, "…naming the successor in the way");
  assert.match(b.message, /retire that successor first/, "…and both acts that clear it");
  assert.match(b.message, /without naming a predecessor/);

  // THE BELT: the door refuses under the client rung; the index refuses the writer the rung
  // cannot serialise (a restored register, a hand-written row, a future door that forgets).
  const belt = await rootQuery(
    `insert into clara.adjustment_templates(firm_id, client_id, status, name, cadence, start_date,
        auto_reverse, lines, memo_template, content_hash, replaces_template_id, proposed_by,
        proposed_op_key)
     select t.firm_id, t.client_id, 'proposed', 'x42 r11g belt', 'monthly', t.start_date, false,
            t.lines, 'x42 r11g', md5(random()::text)||md5(random()::text), $1, t.proposed_by,
            'x42-r11g-belt' from clara.adjustment_templates t where t.id=$1 returning id`,
    [gen1.id]).then(() => null).catch((e) => e);
  assert.ok(belt, "a hand-written second successor is refused by the storage layer");
  assert.equal(belt.code, "23505");
  assert.match(String(belt.constraint ?? belt.message), /uq_adjustment_templates_one_successor/);

  // ...AND A RETIRED SUCCESSOR IS STILL STORABLE, so the recovery act the prohibition names
  // (retire this template and propose it again) is not foreclosed by the law above.
  await signTemplate(w.users.hana, { client, template: a.template_id, opKey: opk("r11gsig") });
  await retireTemplate(w.users.hana, { client, template: a.template_id, reason: "mis-declared" });
  const c = await proposeR(w.users.bob, {
    client, name: `x42 r11g C ${Date.now()}`, start: mon(-6).start,
    lines: accrualLines(70_000, { debit: EXPB, credit: ACCR2 }), replaces: gen1.id });
  assert.ok(c.template_id,
    "one generation may be re-declared after its successor retires — the correction path stays open");
});

// ---------------------------------------------------------------------------------------
// x42.r11h — THE PROPOSE-SIDE ADVISORY, WHICH IS THE ONLY DEFENCE THE UNDECLARED CASE HAS
// (W1 finding 1, the half the wall structurally cannot reach). MEASURED PRE-FIX: a back-dated
// re-code onto disjoint codes over two already-charged months warned NOTHING.
// ---------------------------------------------------------------------------------------
test("x42.r11h proposing over a retired generation's standing months warns replaced_period_overlap with the measurement and the act — and a forward-only proposal stays silent", async (t) => {
  if (skipHere(t)) return;
  const M = [mon(-6), mon(-5)];
  const client = await freshAdjClient("r11h");
  const gen1 = await liveTemplate({
    client, label: "r11h gen1", start: M[0].start,
    lines: accrualLines(300_000, { debit: EXPA, credit: ACCR }), memo: "v1" });
  await standingMonths(client, gen1.id, M);
  await retireTemplate(w.users.hana, { client, template: gen1.id, reason: "re-coded" });

  const back = await proposeR(w.users.bob, {
    client, name: `x42 r11h back ${Date.now()}`, start: M[0].start,
    lines: accrualLines(150_000, { debit: EXPB, credit: ACCR2 }), memo: "v2 recoded" });
  const wr = (back.warnings ?? []).find((x) => x.axis === "replaced_period_overlap");
  assert.ok(wr, "NO SHAPE REQUIREMENT: the codes are disjoint and the warning still fires");
  assert.equal(wr.template_id, gen1.id, "it NAMES the generation");
  // THE RETIRED TAIL IS STILL THE RETIRED TAIL [round 12]: the confirming round widened this
  // term's SUBJECT to live siblings as well, and `status` is what tells the two apart on the
  // wire. It is asserted rather than assumed for exactly that reason — a widening that silently
  // re-labelled the retired case would break every consumer that branches on it (x42.r12a is the
  // live half of the same assertion).
  assert.equal(wr.status, "retired");
  assert.equal(wr.standing_charges, 2, "…and how many periods it carries");
  assert.equal(wr.first_period, M[0].start);
  assert.match(wr.message, /Declaring the lineage \(p_replaces\) turns this sentence into a WALL/,
    "…and names the act that upgrades a guess into a fact");

  const fwd = await proposeR(w.users.bob, {
    client, name: `x42 r11h fwd ${Date.now()}`, start: mon(-3).start,
    lines: accrualLines(150_000, { debit: EXPB, credit: ACCR2 }), memo: "v2 forward" });
  assert.equal((fwd.warnings ?? []).some((x) => x.axis === "replaced_period_overlap"), false,
    "a forward-only proposal reaches back over nothing — a warning there would train the reader to skip this key");
});

// ---------------------------------------------------------------------------------------
// x42.r11i — THE TWO PROJECTION KEYS THE SURFACE CHAIN NEEDS (W1 finding 3 / Codex r11 finding 2;
// W2 finding 5). The gate ASSERTS on a declaration and forbids an act on the strength of it, and
// until this round no surface could see the declaration or read a wall's own sentence.
// ---------------------------------------------------------------------------------------
test("x42.r11i the recorded declaration is PROJECTED on the template row and the correction wall's own advice is exported on the run receipt — both keys always present", async (t) => {
  if (skipHere(t)) return;
  const client = await freshAdjClient("r11i");
  const gen1 = await liveTemplate({
    client, label: "r11i gen1", start: mon(-6).start,
    lines: accrualLines(100_000, { debit: EXPA, credit: ACCR }), memo: "v1" });
  await retireTemplate(w.users.hana, { client, template: gen1.id, reason: "superseded" });
  const gen2 = await liveReplacement({
    client, name: `x42 r11i gen2 ${Date.now()}`, start: mon(-3).start,
    lines: accrualLines(90_000, { debit: EXPB, credit: ACCR2 }), replaces: gen1.id });

  const declared = (await rootQuery("select clara._adj_template_json($1) as j", [gen2.template_id]))
    .rows[0].j;
  assert.ok(Object.prototype.hasOwnProperty.call(declared, "replaces_template_id"),
    "ALWAYS present — a key a caller must test for existence before reading is one they will forget");
  assert.equal(declared.replaces_template_id, gen1.id);
  const plain = (await rootQuery("select clara._adj_template_json($1) as j", [gen1.id])).rows[0].j;
  assert.ok(Object.prototype.hasOwnProperty.call(plain, "replaces_template_id"));
  assert.equal(plain.replaces_template_id, null, "…and it says 'nothing' honestly");

  const P = mon(-3);
  const r = await runManual(w.users.bob, {
    client, template: gen2.template_id, periodStart: P.start, periodEnd: P.end });
  await approveDraft(w.users.alice, r.entry_id);
  const run = (await rootQuery(
    "select clara._adj_run_json(x) as j from clara.adjustment_runs x where x.entry_id=$1",
    [r.entry_id])).rows[0].j;
  assert.ok(Object.prototype.hasOwnProperty.call(run, "correction_wall_advice"),
    "the seventh correction key — a wall token with no sentence is a dead end for the reader");
});

// #########################################################################################
// AS-BUILT LADDER, ROUND 12 — THE CONFIRMING ROUND'S OWN FIX WAVE.
//
// Round 11's list was confirmed by two fresh lenses and Codex, and the round was NOT clean: two
// more money mechanisms (CXR1 the still-silent propose-first re-code, MEASURED live at
// RM1,800,000 against an RM600,000 intention; CXR2 two live leaves on one lineage through a
// retired intermediate), a malformed-stamp evasion of round 11's own wall (native H2/H3), and a
// deploy-blocker in the CX6 instrument. `split-build-record.md`'s "D-b2 CONFIRM ROUND" section is
// the adjudication and is not re-derived here. The cells below drive the MEASURED scenarios; the
// probes that produced them are `scratchpad/cfr/cfr-probes*.mjs`, re-run against this build.
//
// THE LAW UNDER TEST:
//   * the period-overlap advisory covers RETIRED **and LIVE** siblings — because in this file's
//     own blessed propose-first order the predecessor is LIVE at propose and all three defences
//     were unavailable at once — and it is re-asked at SIGN, the last human moment;
//   * ...and it stays NARROW: the live arm only where the shapes are disjoint (where they
//     collide, the poster's own wall stops the double and term (a) already speaks), and never on
//     a forward-dated proposal;
//   * one lineage ROOT has at most one unretired template, at the door and in the storage layer;
//   * a period stamp that is not an ISO day is UNSTAMPED, not a smaller date;
//   * and the recovery path E33's gloss describes is the one the DB actually offers.
// #########################################################################################

// ---------------------------------------------------------------------------------------
// x42.r12a — THE PROPOSE-FIRST RE-CODE IS NO LONGER SILENT (Codex CXR1; native probes A/K).
// MEASURED PRE-FIX (0045 @ 17f750e5, rig clara_r12_pre): propose warnings [], oracle blocked [],
// four already-charged months re-run on fresh codes, EXPA 1,200,000 + EXPB 600,000 against a
// 600,000 intention, and clara.adjustment_run_due advertising the first doubling period as DUE.
// ---------------------------------------------------------------------------------------
test("x42.r12a proposing a re-coded replacement while its predecessor is still LIVE warns replaced_period_overlap — the order the file blesses is the order that was silent", async (t) => {
  if (skipHere(t)) return;
  const M = [mon(-6), mon(-5), mon(-4)];
  const client = await freshAdjClient("r12a");
  const gen1 = await liveTemplate({
    client, label: "r12a gen1", start: M[0].start,
    lines: accrualLines(300_000, { debit: EXPA, credit: ACCR }), memo: "v1" });
  await standingMonths(client, gen1.id, M);

  // THE DECLARATION IS IMPOSSIBLE IN THIS ORDER, which is half of why the pair was silent.
  const declined = await caught(() => proposeR(w.users.bob, {
    client, name: `x42 r12a declared ${Date.now()}`, start: M[0].start,
    lines: accrualLines(150_000, { debit: EXPB, credit: ACCR2 }), replaces: gen1.id }));
  assert.equal(reasonToken(declined), "template_replaces_not_retired",
    "the recorded edge — and therefore the WALL — is structurally unavailable at this moment");

  const p = await proposeR(w.users.bob, {
    client, name: `x42 r12a gen2 ${Date.now()}`, start: M[0].start,
    lines: accrualLines(150_000, { debit: EXPB, credit: ACCR2 }), memo: "v2 recoded" });
  const wr = (p.warnings ?? []).find((x) => x.axis === "replaced_period_overlap");
  assert.ok(wr, "the LIVE predecessor is now the advisory's subject too");
  assert.equal(wr.template_id, gen1.id, "…it NAMES the generation");
  assert.equal(wr.status, "live", "…and says which state it is in, because the remedy differs");
  assert.equal(wr.standing_charges, 3, "…and how many periods are already charged");
  assert.equal(wr.first_period, M[0].start);
  assert.equal(wr.last_period, M[2].end);
  assert.match(wr.message, /still LIVE, so nothing has stopped yet/,
    "the LIVE remedy is retire-then-declare, not 'declare' — a declaration now is refused");
  assert.match(wr.message, /start this template after/,
    "…and the forward-only escape names the date it must start after");

  // NO SHAPE COLLISION ANYWHERE: this is the re-code, so term (a) is structurally blind to it.
  assert.equal((p.warnings ?? []).some((x) => x.axis === "colliding_live_sibling"), false,
    "the codes are disjoint — every shape-keyed defence in this file is silent, which is the point");
});

// ---------------------------------------------------------------------------------------
// x42.r12b — ...AND THE QUESTION IS ASKED AGAIN AT SIGN (Codex CXR1's second half; the native
// lens's probe C measured the window). A propose-time snapshot can be honestly empty and the same
// pair be a doubling by the time an admin signs: sign is the act that makes a template able to
// post, and every other freshness check in that body exists for exactly this reason.
// MEASURED PRE-FIX: the sign receipt has no `warnings` key at all.
// ---------------------------------------------------------------------------------------
test("x42.r12b sign re-asks the period advisory at the last human moment, and the key is always present", async (t) => {
  if (skipHere(t)) return;
  const M = [mon(-6), mon(-5)];
  const client = await freshAdjClient("r12b");
  const gen1 = await liveTemplate({
    client, label: "r12b gen1", start: M[0].start,
    lines: accrualLines(300_000, { debit: EXPA, credit: ACCR }), memo: "v1" });

  // PROPOSED BEFORE ANYTHING STANDS: the advisory is honestly empty here, and that is not a bug —
  // there is nothing to measure yet.
  const p = await proposeR(w.users.bob, {
    client, name: `x42 r12b gen2 ${Date.now()}`, start: M[0].start,
    lines: accrualLines(150_000, { debit: EXPB, credit: ACCR2 }), memo: "v2 recoded" });
  assert.deepEqual(p.warnings, [], "nothing was charged at propose time, and it says so honestly");

  // ...and THEN the predecessor charges the months this proposal covers.
  await standingMonths(client, gen1.id, M);

  const signed = await signTemplate(w.users.hana, {
    client, template: p.template_id, opKey: opk("r12bsig") });
  assert.equal(signed.status, "live", "signing is NOT gated by an advisory");
  assert.ok(Object.prototype.hasOwnProperty.call(signed, "warnings"),
    "ALWAYS present — a key a caller must test for before reading is one they will forget");
  const wr = (signed.warnings ?? []).find((x) => x.axis === "replaced_period_overlap");
  assert.ok(wr, "the world moved between propose and sign, and the last human moment says so");
  assert.equal(wr.template_id, gen1.id);
  assert.equal(wr.standing_charges, 2);

  // ORDINARY SIGN: present and empty.
  const c2 = await freshAdjClient("r12b2");
  const q = await proposeR(w.users.bob, {
    client: c2, name: `x42 r12b plain ${Date.now()}`, start: mon(-3).start,
    lines: accrualLines(100_000, { debit: EXPA, credit: ACCR }), memo: "plain" });
  const plain = await signTemplate(w.users.hana, {
    client: c2, template: q.template_id, opKey: opk("r12bsig2") });
  assert.deepEqual(plain.warnings, [], "nothing to say, said as an empty array");
});

// ---------------------------------------------------------------------------------------
// x42.r12c — THE WIDENING IS NARROW, and this cell is what makes it safe to ship. A warning that
// fires on the ordinary case is a warning readers learn to skip, which costs exactly what the
// advisory was built to prevent.
// GREEN ON BOTH BUILDS BY DESIGN — it is the FALSE-POSITIVE CONTROL. A cell that only goes red
// on the pre-fix build proves the fix fires; this one proves it does not fire anywhere else,
// which is the half that makes a widening shippable (x42.r11b is its round-11 sibling).
// ---------------------------------------------------------------------------------------
test("x42.r12c the live arm stays narrow: silent on a forward-dated proposal, silent where the shapes collide (term (a) owns that), silent on an ordinary one", async (t) => {
  if (skipHere(t)) return;
  const M = [mon(-6), mon(-5)];

  // (1) FORWARD-DATED over a live, charging predecessor: nothing this proposal can book is
  // already charged, so there is nothing to say.
  const c1 = await freshAdjClient("r12c1");
  const g1 = await liveTemplate({
    client: c1, label: "r12c1 gen1", start: M[0].start,
    lines: accrualLines(300_000, { debit: EXPA, credit: ACCR }), memo: "v1" });
  await standingMonths(c1, g1.id, M);
  const fwd = await proposeR(w.users.bob, {
    client: c1, name: `x42 r12c fwd ${Date.now()}`, start: mon(-2).start,
    lines: accrualLines(150_000, { debit: EXPB, credit: ACCR2 }), memo: "forward" });
  assert.equal((fwd.warnings ?? []).some((x) => x.axis === "replaced_period_overlap"), false,
    "a forward-dated proposal reaches back over nothing");

  // (2) SHAPES COLLIDE: term (a) already names this sibling, its standing charges and the
  // doubling risk in one sentence, and the poster's own period_shape_already_met wall stops the
  // second charge at the moment money would move. Two warnings about one template would be noise.
  const c2 = await freshAdjClient("r12c2");
  const g2 = await liveTemplate({
    client: c2, label: "r12c2 gen1", start: M[0].start,
    lines: accrualLines(300_000, { debit: EXPA, credit: ACCR }), memo: "v1" });
  await standingMonths(c2, g2.id, M);
  const same = await proposeR(w.users.bob, {
    client: c2, name: `x42 r12c same ${Date.now()}`, start: M[0].start,
    lines: accrualLines(150_000, { debit: EXPA, credit: ACCR }), memo: "v2 same codes" });
  assert.deepEqual((same.warnings ?? []).map((x) => x.axis), ["colliding_live_sibling"],
    "exactly ONE warning: the shape-keyed term owns the shape-colliding case");

  // (3) ORDINARY: a fresh client, nothing standing anywhere.
  const c3 = await freshAdjClient("r12c3");
  const plain = await proposeR(w.users.bob, {
    client: c3, name: `x42 r12c plain ${Date.now()}`, start: mon(-3).start,
    lines: accrualLines(100_000, { debit: EXPA, credit: ACCR }), memo: "plain" });
  assert.deepEqual(plain.warnings, [], "nothing to say, said as an empty array");
});

// ---------------------------------------------------------------------------------------
// x42.r12d — ONE UNRETIRED LEAF PER LINEAGE ROOT (Codex CXR2, MONEY). MEASURED PRE-FIX: the
// five-act walk below ended with TWO LIVE LEAVES on one lineage — round 11's index and door see
// only DIRECT children, so the fork simply moved one generation up.
// ---------------------------------------------------------------------------------------
test("x42.r12d a lineage may have one unretired continuation, however far up the chain the fork is attached — and the recovery path stays open", async (t) => {
  if (skipHere(t)) return;
  const client = await freshAdjClient("r12d");
  // P retired -> A replaces P -> A retired -> B replaces A and goes LIVE.
  const P = await liveTemplate({
    client, label: "r12d P", start: mon(-6).start,
    lines: accrualLines(100_000, { debit: EXPA, credit: ACCR }), memo: "P" });
  await retireTemplate(w.users.hana, { client, template: P.id, reason: "superseded" });
  const A = await proposeR(w.users.bob, {
    client, name: `x42 r12d A ${Date.now()}`, start: mon(-5).start,
    lines: accrualLines(90_000, { debit: EXPA, credit: ACCR }), replaces: P.id });
  await signTemplate(w.users.hana, { client, template: A.template_id, opKey: opk("r12dA") });
  await retireTemplate(w.users.hana, { client, template: A.template_id, reason: "superseded" });
  const B = await proposeR(w.users.bob, {
    client, name: `x42 r12d B ${Date.now()}`, start: mon(-4).start,
    lines: accrualLines(80_000, { debit: EXPA, credit: ACCR }), replaces: A.template_id });
  await signTemplate(w.users.hana, { client, template: B.template_id, opKey: opk("r12dB") });

  // C attaches to P — whose only DIRECT successor A is RETIRED, so every edge-keyed test passes.
  const c = await caught(() => proposeR(w.users.bob, {
    client, name: `x42 r12d C ${Date.now()}`, start: mon(-4).start,
    lines: accrualLines(70_000, { debit: EXPB, credit: ACCR2 }), replaces: P.id }));
  assert.ok(c, "the second live leaf is refused");
  assert.equal(c.code, CLR10);
  assert.equal(reasonToken(c), "template_lineage_root_occupied");
  assert.equal(detailOf(c).occupying_template_id, B.template_id,
    "…NAMING the live template in the way, because 'some other template' is not a remedy");
  assert.equal(detailOf(c).lineage_root_id, P.id, "…and the root the two branches share");
  assert.match(c.message, /retire that one first/);
  assert.match(c.message, /without naming a predecessor/);

  // B IS UNTOUCHED — a refusal at the door may not move anything.
  const brow = (await rootQuery("select status from clara.adjustment_templates where id=$1",
    [B.template_id])).rows[0];
  assert.equal(brow.status, "live", "the branch that was already there stays live");

  // THE STORAGE BELT: a hand-written row that carries the root correctly is refused by the index
  // (the door's own rung cannot serialise a restore or a future door that forgets to ask).
  const belt = await rootQuery(
    `insert into clara.adjustment_templates(firm_id, client_id, status, name, cadence, start_date,
        auto_reverse, lines, memo_template, content_hash, replaces_template_id, lineage_root_id,
        proposed_by, proposed_op_key)
     select t.firm_id, t.client_id, 'proposed', 'x42 r12d belt', 'monthly', t.start_date, false,
            t.lines, 'x42 r12d', md5(random()::text)||md5(random()::text), $1, $2, t.proposed_by,
            'x42-r12d-belt' from clara.adjustment_templates t where t.id=$1 returning id`,
    [P.id, P.id]).then(() => null).catch((e) => e);
  assert.ok(belt, "a hand-written second leaf is refused by the storage layer");
  assert.equal(belt.code, "23505");
  assert.match(String(belt.constraint ?? belt.message), /uq_adjustment_templates_one_live_leaf/);

  // ...AND THE RECOVERY PATH STAYS OPEN: retire B, and C is admitted naming the same predecessor.
  await retireTemplate(w.users.hana, { client, template: B.template_id, reason: "re-declaring" });
  const c2 = await proposeR(w.users.bob, {
    client, name: `x42 r12d C2 ${Date.now()}`, start: mon(-4).start,
    lines: accrualLines(70_000, { debit: EXPB, credit: ACCR2 }), replaces: P.id });
  assert.ok(c2.template_id, "one unretired continuation at a time is a WAIT, not a foreclosure");
  const roots = (await rootQuery(
    `select coalesce(lineage_root_id, id) as root from clara.adjustment_templates
      where id = any($1::uuid[]) order by 1`,
    [[A.template_id, B.template_id, c2.template_id]])).rows.map((r) => r.root);
  assert.deepEqual(roots, [P.id, P.id, P.id],
    "every descendant carries ONE root from the lineage's first edge onward");
});

// ---------------------------------------------------------------------------------------
// x42.r12e — A MALFORMED PERIOD STAMP IS NOT A SMALLER DATE (native H2/H3, MONEY). MEASURED
// PRE-FIX: month grain ('2026-02') and a blank stamp sort BELOW '2026-02-01' under collate "C",
// so the ancestor's standing charge left the wall's window and the replacement POSTED the double
// — on the exact shape the build's own comment said could only ever park a lawful period.
// ---------------------------------------------------------------------------------------
test("x42.r12e a period stamp that is not an ISO day is UNSTAMPED, and an unstamped charge is inside every window — month grain, blank, null, timestamp grain and DD/MM/YYYY all stay walled", async (t) => {
  if (skipHere(t)) return;
  const P = mon(-6);
  for (const [label, expr] of [
    ["month grain", `to_jsonb(left(je.flags->'recurring_adjustment'->>'KEY', 7))`],
    ["blank", `to_jsonb(''::text)`],
    ["null", `'null'::jsonb`],
    ["timestamp grain", `to_jsonb((je.flags->'recurring_adjustment'->>'KEY') || 'T00:00:00')`],
    ["DD/MM/YYYY", `to_jsonb(to_char((je.flags->'recurring_adjustment'->>'KEY')::date,'DD/MM/YYYY'))`],
  ]) {
    const client = await freshAdjClient("r12e");
    const gen1 = await liveTemplate({
      client, label: `r12e ${label} gen1`, start: P.start,
      lines: accrualLines(300_000, { debit: EXPA, credit: ACCR }), memo: "v1" });
    await standingMonths(client, gen1.id, [P]);
    await retireTemplate(w.users.hana, { client, template: gen1.id, reason: "re-coded" });
    const gen2 = await liveReplacement({
      client, name: `x42 r12e ${label} gen2 ${Date.now()}`, start: P.start,
      lines: accrualLines(150_000, { debit: EXPB, credit: ACCR2 }), replaces: gen1.id });

    const pristine = await caught(() => runManual(w.users.bob, {
      client, template: gen2.template_id, periodStart: P.start, periodEnd: P.end }));
    assert.equal(reasonToken(pristine), "replaced_generation_period_standing",
      `${label}: the wall stands on a well-formed register (the control)`);

    // FIXTURE SURGERY, rig-only: the shape a restored or legacy register can carry. User triggers
    // are silenced for the one statement (the wave-B idiom) because the entry belts refuse a
    // flags rewrite by design — which is the law, and not something this cell may weaken.
    const mk = (k) => expr.replace(/KEY/g, k);
    await rootQuery(`do $$ begin
      set local session_replication_role = 'replica';
      update clara.journal_entries je set flags = jsonb_set(jsonb_set(je.flags,
          '{recurring_adjustment,period_end}', ${mk("period_end")}),
          '{recurring_adjustment,period_start}', ${mk("period_start")})
        where je.client_id='${client}'
          and je.flags->'recurring_adjustment'->>'template_id'='${gen1.id}';
    end $$;`);
    const after = await caught(() => runManual(w.users.bob, {
      client, template: gen2.template_id, periodStart: P.start, periodEnd: P.end }));
    assert.ok(after, `${label}: a mangled stamp may not open the wall`);
    assert.equal(reasonToken(after), "replaced_generation_period_standing",
      `${label}: an unstamped charge is INSIDE the window — the fail-closed direction`);
  }
});

// ---------------------------------------------------------------------------------------
// x42.r12f — THE RECOVERY PATH THE REFUSAL DESCRIBES IS THE ONE THE DB OFFERS (Codex CXR4/E33).
// The blocked template's remedy is "start after the generation it replaces last charged", done by
// retiring this template and proposing it afresh. The shipped gloss said that re-proposal must
// NOT name the same predecessor — measured FALSE: a retired successor is not in either lineage
// index, so the same declaration is admitted. This cell is what the gloss is written against.
// GREEN ON BOTH BUILDS BY DESIGN: CXR4 is a defect in the GLOSS, not in the DB. The cell pins
// the DB truth the dashboard sentence is now derived from, so the walled corridor it describes
// cannot re-open silently on either side of the seam.
// ---------------------------------------------------------------------------------------
test("x42.r12f start-after MAY retain the predecessor once this template is retired; what is refused is declaring it while an unretired template of the lineage is still there", async (t) => {
  if (skipHere(t)) return;
  const M = [mon(-6), mon(-5)];
  const client = await freshAdjClient("r12f");
  const gen1 = await liveTemplate({
    client, label: "r12f gen1", start: M[0].start,
    lines: accrualLines(300_000, { debit: EXPA, credit: ACCR }), memo: "v1" });
  await standingMonths(client, gen1.id, M);
  await retireTemplate(w.users.hana, { client, template: gen1.id, reason: "re-coded" });
  const blocked = await liveReplacement({
    client, name: `x42 r12f gen2 ${Date.now()}`, start: M[0].start,
    lines: accrualLines(150_000, { debit: EXPB, credit: ACCR2 }), replaces: gen1.id });
  const refused = await caught(() => runManual(w.users.bob, {
    client, template: blocked.template_id, periodStart: M[0].start, periodEnd: M[0].end }));
  assert.equal(reasonToken(refused), "replaced_generation_period_standing",
    "the state the remedy is offered from");

  // (1) WITHOUT retiring the blocked template first: refused, and NOT by the root rule — the
  // direct-successor rule is the more specific answer and keeps its own message.
  const early = await caught(() => proposeR(w.users.bob, {
    client, name: `x42 r12f early ${Date.now()}`, start: mon(-3).start,
    lines: accrualLines(150_000, { debit: EXPB, credit: ACCR2 }), replaces: gen1.id }));
  assert.equal(reasonToken(early), "template_replaces_already_succeeded",
    "the predecessor still has an unretired direct successor: THIS template");

  // (2) THE ACTUAL REMEDY: retire this one, propose again with the SAME predecessor and a start
  // after the generation's last charge. ADMITTED — this is the sentence the gloss must carry.
  await retireTemplate(w.users.hana, { client, template: blocked.template_id, reason: "re-cut" });
  const after = await proposeR(w.users.bob, {
    client, name: `x42 r12f after ${Date.now()}`, start: mon(-3).start,
    lines: accrualLines(150_000, { debit: EXPB, credit: ACCR2 }), replaces: gen1.id });
  assert.ok(after.template_id,
    "start-after MAY retain the predecessor — a retired successor is not in the way of anything");
  await signTemplate(w.users.hana, { client, template: after.template_id, opKey: opk("r12fsig") });
  const P3 = mon(-3);
  const r = await runManual(w.users.bob, {
    client, template: after.template_id, periodStart: P3.start, periodEnd: P3.end });
  await approveDraft(w.users.alice, r.entry_id);
  assert.equal(await glNet(client, EXPB), 150_000,
    "…and the re-cut template books its own month exactly once");
});

// #########################################################################################
// AS-BUILT LADDER, ROUND 13 — THE RE-CONFIRMING ROUND'S FIX WAVE.
//
// The confirming round's list was itself re-confirmed, and that round was not clean either: two
// more money mechanisms and two deploy blockers, every one of them in a body the PREVIOUS round
// had just repaired. `split-build-record.md`'s "D-b2 RE-CONFIRM ROUND" section is the
// adjudication and is not re-derived here.
//
// THE LAW UNDER TEST:
//   * the lineage root a row CLAIMS is proven at the storage layer, not trusted — because the
//     one-live-leaf index is keyed on that column and the writer it exists to catch is exactly
//     the writer that can lie about it;
//   * a period stamp that is ten characters of digits and dashes but not a real DAY is
//     UNSTAMPED, not a date that sorts above every real one;
//   * and the propose advisory's live arm stays narrow in the direction that costs nothing,
//     because the poster's own wall is what stands where the shapes intersect.
//
// TWO OF THE FOUR RE-CONFIRM FINDINGS HAVE NO CELL HERE AND THAT IS DELIBERATE: RC3 and RC4 are
// DEPLOY-TIME instruments (SECTION 0's probe 11, S5.8-b2, tails 1(c)/3(1)) that no longer exist
// once the migration has applied, so a cell running against an applied rig structurally cannot
// see them. Their controls are the planted deploy and the lexer lab (E39), run both ways at
// work/r13/, and E36 makes running them the acceptance criterion rather than the argument.
// #########################################################################################

// ---------------------------------------------------------------------------------------
// x42.r13a — A DECLARED LINEAGE ROOT IS PROVEN, NOT TRUSTED (Codex RC1, MONEY). MEASURED
// PRE-FIX: uq_adjustment_templates_one_live_leaf is keyed on coalesce(lineage_root_id, id), and
// nothing constrained lineage_root_id — so a hand-written child carrying a WRONG root, or NO
// root, lands in a different bucket of that index and the lineage has two unretired leaves
// again. That is CXR2's measured double, restored through the belt that closed it.
//
// THE FORGERIES RUN IN ORIGIN MODE, AND THAT IS THE WHOLE POINT OF THE CELL. x42.r11f and
// x42.r12d silence user triggers with `session_replication_role = 'replica'` to stage shapes the
// belts refuse; a CONSTRAINT TRIGGER is a user trigger, so under replica mode this one does not
// fire either. It would be trivial — and worthless — to "prove" the belt against a session that
// has switched it off. The writer this belt is for is an ordinary hand-write: a restore, a
// psql session, a future door that forgets to ask. Those run in ORIGIN mode, which is how every
// insert below runs. The replica-mode boundary is not left to prose either: it is MEASURED at
// the end of the cell, because a belt whose limits are only described is a belt nobody checks.
// ---------------------------------------------------------------------------------------
test("x42.r13a a hand-written template may not lie about which lineage it belongs to: a false root and an absent root are both refused by name, and the honest spellings are admitted", async (t) => {
  if (skipHere(t)) return;
  const client = await freshAdjClient("r13a");
  const gen1 = await liveTemplate({
    client, label: "r13a gen1", start: mon(-6).start,
    lines: accrualLines(100_000, { debit: EXPA, credit: ACCR }), memo: "gen1" });
  await retireTemplate(w.users.hana, { client, template: gen1.id, reason: "superseded" });
  // A SECOND, UNRELATED lineage on the same client, retired so it occupies no index slot — the
  // root a forged row will falsely claim. Retired matters: a LIVE one would be caught by
  // uq_adjustment_templates_one_live_leaf first and this cell would be measuring that index
  // instead of the belt it is about.
  const other = await liveTemplate({
    client, label: "r13a other", start: mon(-6).start,
    lines: accrualLines(50_000, { debit: EXPB, credit: ACCR2 }), memo: "other" });
  await retireTemplate(w.users.hana, { client, template: other.id, reason: "unrelated" });

  /** Hand-write one template row in ORIGIN mode. `root` is a SQL expression so a row can name
   *  its own freshly minted id. Returns the error, or null when the row was admitted. */
  const forge = async (tag, { parent, root }) => {
    const q = `with n as (select gen_random_uuid() as id)
      insert into clara.adjustment_templates(id, firm_id, client_id, status, name, cadence,
          start_date, auto_reverse, lines, memo_template, content_hash, replaces_template_id,
          lineage_root_id, proposed_by, proposed_op_key)
      select n.id, t.firm_id, t.client_id, 'proposed', 'x42 r13a ${tag}', 'monthly', t.start_date,
             false, t.lines, 'x42 r13a', md5(random()::text)||md5(random()::text), ${parent},
             ${root}, t.proposed_by, 'x42-r13a-${tag}'
        from clara.adjustment_templates t, n where t.id = $1 returning id`;
    return rootQuery(q, [gen1.id]).then((r) => ({ id: r.rows[0].id })).catch((e) => e);
  };

  // (1) A DECLARED PARENT AND NO ROOT AT ALL. The row would key into the index on its OWN id.
  const noRoot = await forge("noroot", { parent: "t.id", root: "null" });
  assert.ok(noRoot instanceof Error, "a child with no root is refused");
  assert.equal(noRoot.code, CLR38);
  assert.equal(reasonToken(noRoot), "adjustment_template_lineage_root_false");
  assert.equal(detailOf(noRoot).axis, "inherited");
  assert.equal(detailOf(noRoot).expected_lineage_root_id, gen1.id,
    "…and the refusal NAMES the root the row should have carried");
  assert.match(noRoot.message, /no root at all/);

  // (2) A DECLARED PARENT AND SOMEBODY ELSE'S ROOT — the shape that actually re-opens the
  // one-live-leaf law, because it moves the row into a lineage it has no edge into.
  const wrongRoot = await forge("wrongroot", { parent: "t.id", root: `'${other.id}'::uuid` });
  assert.ok(wrongRoot instanceof Error, "a child with a false root is refused");
  assert.equal(wrongRoot.code, CLR38);
  assert.equal(reasonToken(wrongRoot), "adjustment_template_lineage_root_false");
  assert.equal(detailOf(wrongRoot).axis, "inherited");
  assert.equal(detailOf(wrongRoot).lineage_root_id, other.id);
  assert.equal(detailOf(wrongRoot).expected_lineage_root_id, gen1.id);

  // (3) NO PARENT AND SOMEBODY ELSE'S ROOT. A first-generation template is its own root; naming
  // another lineage is the same lie told from the other end.
  const orphanRoot = await forge("orphanroot", { parent: "null", root: `'${other.id}'::uuid` });
  assert.ok(orphanRoot instanceof Error, "a parentless row may not claim another lineage's root");
  assert.equal(reasonToken(orphanRoot), "adjustment_template_lineage_root_false");
  assert.equal(detailOf(orphanRoot).axis, "parentless");

  // (4) THE TWO HONEST SPELLINGS ARE BOTH ADMITTED, which is what keeps a full restore possible:
  // null means "I am my own root", and a row writing that fact out explicitly says the same
  // thing. The column's own comment makes this promise; the belt has to keep it.
  const selfRoot = await forge("selfroot", { parent: "null", root: "n.id" });
  assert.ok(!(selfRoot instanceof Error),
    `a parentless row that names ITSELF as its root is lawful (got ${selfRoot.message ?? ""})`);

  // (5) THE BOUNDARY, MEASURED RATHER THAN DESCRIBED: a constraint trigger IS a user trigger, so
  // a session that has set session_replication_role='replica' — the fixture-surgery idiom this
  // battery uses to stage shapes the belts refuse — is not policed by it. That is not a defect
  // to fix here (replica mode disables the transition trigger, the truncate guard and every
  // other belt on this table by design; it is a superuser act, not an application path), but it
  // IS the belt's limit and the next reader is entitled to see it as a number. `other` is the
  // parent here, not gen1: uq_adjustment_templates_one_successor is an INDEX and replica mode
  // does not silence indexes, so forging a second child of gen1 would measure that index instead
  // of this belt — the same reason `other` was retired above.
  const replicaForged = (await rootQuery(`do $$ begin
    set local session_replication_role = 'replica';
    insert into clara.adjustment_templates(firm_id, client_id, status, name, cadence, start_date,
        auto_reverse, lines, memo_template, content_hash, replaces_template_id, lineage_root_id,
        proposed_by, proposed_op_key)
    select t.firm_id, t.client_id, 'proposed', 'x42 r13a replica', 'monthly', t.start_date, false,
           t.lines, 'x42 r13a', md5(random()::text)||md5(random()::text), t.id, '${gen1.id}',
           t.proposed_by, 'x42-r13a-replica'
      from clara.adjustment_templates t where t.id = '${other.id}';
  end $$;`).then(() => null).catch((e) => e));
  assert.equal(replicaForged, null,
    "with user triggers silenced the same forgery IS storable — the belt is an ORIGIN-mode belt, "
    + "which is the mode every hand-write, restore and future door runs in");

  // ...AND THE RIG IS LEFT AS IT WAS FOUND (the x42.r11f discipline). Both hand-written rows go,
  // keyed on the SHAPE — this cell's op-key prefix — so an earlier run's litter goes with them.
  // This happens BEFORE the lawful path below rather than at the end of the cell, because the
  // forged rows sit in both lineage indexes and the door would meet them, not the belt.
  await rootQuery(`do $$ begin
    set local session_replication_role = 'replica';
    delete from clara.adjustment_templates where proposed_op_key like 'x42-r13a-%';
  end $$;`);
  assert.equal((await rootQuery(
    "select count(*)::int as n from clara.adjustment_templates where proposed_op_key like 'x42-r13a-%'"))
    .rows[0].n, 0, "every hand-written row this cell staged is gone");

  // (6) AND THE DOOR STILL WRITES THE TRUTH THE BELT NOW CHECKS — the lawful path, unchanged.
  const child = await proposeR(w.users.bob, {
    client, name: `x42 r13a child ${Date.now()}`, start: mon(-4).start,
    lines: accrualLines(90_000, { debit: EXPA, credit: ACCR }), replaces: gen1.id });
  assert.ok(child.template_id, "the declared replacement is admitted");
  assert.equal((await rootQuery(
    "select lineage_root_id from clara.adjustment_templates where id=$1", [child.template_id]))
    .rows[0].lineage_root_id, gen1.id,
    "…carrying the predecessor's own root, which is what the belt just refused to let a hand "
    + "write contradict");
});

// ---------------------------------------------------------------------------------------
// x42.r13b — A TEN-CHARACTER NON-DATE IS NOT A DAY (Codex RC2, MONEY). MEASURED PRE-FIX
// (0045 @ d28d5643): clara._wdb_iso_day was a GRAMMAR and returned '2026-13-45' unchanged, so an
// ancestor's standing charge stamped that way sorts ABOVE every real day of its year and falls
// out of the window's UPPER bound — the wall goes silent and the replacement posts the double.
// '2026-00-00' does the same at the LOWER bound. It is round 12's own defect through round 12's
// own fix: month grain fell out one end, an impossible day falls out the other.
// ---------------------------------------------------------------------------------------
test("x42.r13b a period stamp that is not a real calendar day is UNSTAMPED too: an impossible day walls the replacement exactly as month grain does, at both ends of the window, and the propose advisory still speaks", async (t) => {
  if (skipHere(t)) return;
  const P = mon(-6);
  for (const [label, stamp] of [
    ["HIGH (sorts above every real day)", "2026-13-45"],
    ["LOW  (sorts below every real day)", "2026-00-00"],
  ]) {
    // ---- THE WALL ----
    const client = await freshAdjClient("r13b");
    const gen1 = await liveTemplate({
      client, label: `r13b ${label} gen1`, start: P.start,
      lines: accrualLines(300_000, { debit: EXPA, credit: ACCR }), memo: "v1" });
    await standingMonths(client, gen1.id, [P]);
    await retireTemplate(w.users.hana, { client, template: gen1.id, reason: "re-coded" });
    const gen2 = await liveReplacement({
      client, name: `x42 r13b ${label} gen2 ${Date.now()}`, start: P.start,
      lines: accrualLines(150_000, { debit: EXPB, credit: ACCR2 }), replaces: gen1.id });

    const pristine = await caught(() => runManual(w.users.bob, {
      client, template: gen2.template_id, periodStart: P.start, periodEnd: P.end }));
    assert.equal(reasonToken(pristine), "replaced_generation_period_standing",
      `${label}: the wall stands on a well-formed register (the control)`);

    // FIXTURE SURGERY, rig-only, the r12e idiom: the shape a restored or legacy register can
    // carry. User triggers are silenced for the one statement because the entry belts refuse a
    // flags rewrite by design — which is the law, and not something this cell may weaken.
    await rootQuery(`do $$ begin
      set local session_replication_role = 'replica';
      update clara.journal_entries je set flags = jsonb_set(jsonb_set(je.flags,
          '{recurring_adjustment,period_end}', to_jsonb('${stamp}'::text)),
          '{recurring_adjustment,period_start}', to_jsonb('${stamp}'::text))
        where je.client_id='${client}'
          and je.flags->'recurring_adjustment'->>'template_id'='${gen1.id}';
    end $$;`);
    const after = await caught(() => runManual(w.users.bob, {
      client, template: gen2.template_id, periodStart: P.start, periodEnd: P.end }));
    assert.ok(after, `${label}: an impossible day may not open the wall`);
    assert.equal(reasonToken(after), "replaced_generation_period_standing",
      `${label}: an unstamped charge is INSIDE the window — the fail-closed direction`);
    assert.equal(await glNet(client, EXPB), 0,
      `${label}: and not one sen of the replacement posted`);

    // ---- THE ADVISORY, which reads the same stamps through the same body ----
    // A SEPARATE CLIENT, because the lineage above is already occupied: this arm is the
    // UNDECLARED re-code, which is the only case the advisory exists for.
    const c2 = await freshAdjClient("r13b2");
    const g1 = await liveTemplate({
      client: c2, label: `r13b ${label} adv`, start: P.start,
      lines: accrualLines(300_000, { debit: EXPA, credit: ACCR }), memo: "v1" });
    await standingMonths(c2, g1.id, [P]);
    await retireTemplate(w.users.hana, { client: c2, template: g1.id, reason: "re-coded" });
    await rootQuery(`do $$ begin
      set local session_replication_role = 'replica';
      update clara.journal_entries je set flags = jsonb_set(jsonb_set(je.flags,
          '{recurring_adjustment,period_end}', to_jsonb('${stamp}'::text)),
          '{recurring_adjustment,period_start}', to_jsonb('${stamp}'::text))
        where je.client_id='${c2}'
          and je.flags->'recurring_adjustment'->>'template_id'='${g1.id}';
    end $$;`);
    const p = await proposeR(w.users.bob, {
      client: c2, name: `x42 r13b ${label} recode ${Date.now()}`, start: P.start,
      lines: accrualLines(150_000, { debit: EXPB, credit: ACCR2 }), memo: "v2 recoded" });
    const wr = (p.warnings ?? []).find((x) => x.axis === "replaced_period_overlap");
    assert.ok(wr, `${label}: the advisory's own window uses the same grammar and still speaks`);
    assert.equal(wr.template_id, g1.id);
    assert.equal(wr.standing_charges, 1);
  }
});

// ---------------------------------------------------------------------------------------
// x42.r13c — THE NARROWNESS CONTROL'S MISSING SHAPE (Codex RC6). x42.r12c pins that the live arm
// of the advisory is silent on a forward-dated proposal, on a SHAPE-COLLIDING one (term (a) owns
// that) and on an ordinary one. It never pinned the fourth shape, and the fourth shape is the
// one where BOTH advisory terms are structurally silent at once:
//   * term (a) fires only on a CONTAINMENT overlap (identical / contains / contained) and this
//     is a PARTIAL one — two liabilities sharing one accrual code, the designed grain;
//   * term (c)'s live arm fires only where the shapes are DISJOINT (E38: that narrowing is
//     load-bearing — widening it reddens x42.r10p1b and x42.r10o1b and doubles a sentence the
//     reader already has), and these shapes intersect.
// So the propose receipt is honestly EMPTY here, and what stands in its place is the poster's own
// period_shape_already_met wall at the moment money would move. BOTH halves are pinned, because
// the silence is only safe while the wall is there: this cell is what would go red if a later
// round narrowed the wall to containment, or widened term (c) and made r10p1b's `warnings.length
// === 1` a lie.
// GREEN ON BOTH BUILDS BY DESIGN — like x42.r12c and x42.r11b it is a CONTROL, not a
// demonstration: it pins behaviour W-R13 deliberately did NOT change, so that the reasoning the
// narrowing rests on stops being a paragraph and becomes a measurement.
// ---------------------------------------------------------------------------------------
test("x42.r13c a PARTIAL shape overlap warns nothing at propose — both advisory terms are silent by design — and the poster's own wall is what refuses the double at the moment money would move", async (t) => {
  if (skipHere(t)) return;
  const M = [mon(-6), mon(-5)];
  const client = await freshAdjClient("r13c");
  // gen1's shape is {400-D42:C, 900-D42:D}; gen2's is {400-D42:C, 901-D42:D}. They INTERSECT on
  // the shared accrual code and neither contains the other: `partial`, exactly.
  const gen1 = await liveTemplate({
    client, label: "r13c gen1", start: M[0].start,
    lines: accrualLines(300_000, { debit: EXPA, credit: ACCR }), memo: "audit fees" });
  await standingMonths(client, gen1.id, M);

  const p = await proposeR(w.users.bob, {
    client, name: `x42 r13c partial ${Date.now()}`, start: M[0].start,
    lines: accrualLines(150_000, { debit: EXPB, credit: ACCR }), memo: "legal fees, same accrual" });
  assert.deepEqual(p.warnings, [],
    "neither term speaks: (a) is containment-only and this is partial, (c)'s live arm is "
    + "disjoint-only and these intersect");

  // ...AND THE WALL IS WHERE THE SILENCE IS PAID FOR. Sign it and run the month gen1 has already
  // charged: the poster refuses on the shape intersection, names the standing entry, and nothing
  // posts.
  await signTemplate(w.users.hana, { client, template: p.template_id, opKey: opk("r13csig") });
  const refused = await caught(() => runManual(w.users.bob, {
    client, template: p.template_id, periodStart: M[0].start, periodEnd: M[0].end }));
  assert.ok(refused, "the second charge on an intersecting shape is refused");
  assert.equal(refused.code, CLR38);
  assert.equal(reasonToken(refused), "period_shape_already_met",
    "the wall the advisory's narrowness rests on");
  assert.deepEqual(detailOf(refused).account_shape.sort(), [`${ACCR}:C`, `${EXPB}:D`],
    "…on this template's own shape");
  assert.equal(await glNet(client, EXPB), 0, "and not one sen of the second template posted");
  assert.equal(await glNet(client, EXPA), 600_000,
    "…while the first template's two months stand exactly once each");
});
