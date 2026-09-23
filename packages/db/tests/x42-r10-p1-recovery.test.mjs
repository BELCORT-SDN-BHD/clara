// 0042 Wave D-b — ROUND 10, LANE P1 (part 2): THE MIS-DECLARED LINEAGE, AND THE WAY OUT.
//
// WHY THIS FILE EXISTS AT ALL. Lane P1 gives the shape_already_met refusal a branch that ASSERTS
// a lineage and FORBIDS the distinct-codes act. Round 9 had a branch that did exactly that and it
// was the round's worst defect — because the lineage was INFERRED. P1's is DECLARED, which fixes
// the system's guess and does nothing at all about the professional's: a bookkeeper who names the
// wrong predecessor gets round 9's sentence back, word for word, on round 9's own scenario.
//
// THE ADVERSARIAL QUESTION, ASKED OF THE REPAIR RATHER THAN OF THE DEFECT (the ladder's standing
// lesson — six rounds running, the worst finding lived inside the previous round's fix): when the
// declaration is WRONG, is there an act that gets the books right? Correcting the standing entry
// destroys a legitimate audit accrual (measured RM6,000, z1/p1b-follow-the-only-remedy.mjs).
// Starting the replacement later never gives the legal fee the months it is owed. And the
// declaration is IMMUTABLE — there is no un-declaring it. If the refusal named only those two
// acts it would be a walled corridor with the money on the wrong side of the wall.
//
// SO THE SENTENCE NAMES THE RECOVERY, and this file follows it to the sen: retire the
// mis-declared template, propose it again WITHOUT naming a predecessor (which is how a claim
// about the books is corrected — by making it again, leaving both statements in the audit trail,
// never by editing one in place), land back on lane O1's caution, take the act it offers, and
// assert all FOUR balances. Splitting it out of x42-r10-p1-lineage.test.mjs is the repo's
// 500-line ceiling, nothing more.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  opk, endPool, printLaneNotes, printSkipCount, rootQuery, humanQuery, namedCall,
  x42EnsureReady, skip42, caught, reasonToken,
  EXPA, EXPB, ACCR, ACCR2, mon,
  runOccurrence, retireTemplate, signTemplate,
  accrualLines, adjWorld, freshAdjClient, liveTemplate, approveDraft, glNet,
  insertTemplateRaw, x42TemplatesRetiredReady,
} from "./x42-adj-helpers.mjs";

let live = false;
let w = null;

before(async () => {
  live = await x42EnsureReady();
  if (live) w = await adjWorld();
});
after(async () => {
  printLaneNotes("x42-r10p1r");
  printSkipCount("x42-r10p1r");
  await endPool();
});
const skipHere = (t) => skip42(t, live);

// [#927] THE MINT, AT TWO FRONTIERS (the x42-r11-lineage.test.mjs shape). The propose and sign
// doors are typed refusals from migration 0282, so above that frontier the helper mints the row
// the doors used to write -- x42-adj-helpers' SURGERY 5, carrying the declared predecessor and
// the lineage root the propose core derived. This cell's subject is the POSTER's prohibition and
// the recovery walk it names, and both are unchanged by which mint produced the row.
const templatesRetired = () => x42TemplatesRetiredReady();

const proposeR = async (sub, o) => {
  const {
    client, name, cadence = "monthly", start, end = null, autoReverse = false,
    lines, memo = "x42 p1r accrual", replaces = null, opKey = null,
  } = o;
  if (await templatesRetired()) {
    const t = await insertTemplateRaw({
      client, status: "proposed", name, cadence, start, end, autoReverse, lines, memo,
      proposer: sub, replaces });
    return { template_id: t.id, warnings: null };
  }
  return (await humanQuery(sub, namedCall("propose_adjustment_template", [
    { name: "p_client" }, { name: "p_name" }, { name: "p_cadence" },
    { name: "p_start_date", cast: "date" }, { name: "p_end_date", cast: "date" },
    { name: "p_auto_reverse", cast: "boolean" }, { name: "p_lines", cast: "jsonb" },
    { name: "p_memo_template" }, { name: "p_op_key" }, { name: "p_replaces", cast: "uuid" },
  ]), [client, name, cadence, start, end, autoReverse, JSON.stringify(lines), memo,
    opKey ?? opk("x42p1rprop"), replaces])).rows[0].result;
};

async function liveReplacement(o) {
  if (await templatesRetired()) {
    const t = await insertTemplateRaw({
      client: o.client, status: "live", name: o.name, cadence: o.cadence ?? "monthly",
      start: o.start, end: o.end ?? null, autoReverse: o.autoReverse ?? false, lines: o.lines,
      memo: o.memo ?? "x42 p1r accrual", proposer: w.users.bob, signer: w.users.hana,
      replaces: o.replaces ?? null });
    return { template_id: t.id, warnings: null };
  }
  const p = await proposeR(w.users.bob, o);
  await signTemplate(w.users.hana, { client: o.client, template: p.template_id, opKey: opk("x42p1rsig") });
  return p;
}

const refusalOf = (client, template, period) => caught(() => runOccurrence({
  client, template, periodStart: period.start, periodEnd: period.end }));

// ---------------------------------------------------------------------------------------
// x42.r10p1h — round 9's scenario, round 9's sentence, and the exit round 9 did not have.
// ---------------------------------------------------------------------------------------
test("x42.r10p1h a MIS-DECLARED predecessor puts round 9's prohibition back on round 9's scenario — and the refusal names the recovery, which this cell follows to four correct balances", async (t) => {
  if (skipHere(t)) return;
  const M = [mon(-5), mon(-4)];
  const client = await freshAdjClient("r10p1h");

  // The audit engagement: two standing months, then retired through the granted verb.
  const audit = await liveTemplate({
    client, label: "r10p1h audit", start: M[0].start,
    lines: accrualLines(300_000, { debit: EXPA, credit: ACCR }), memo: "audit fee" });
  for (const P of M) {
    const r = await runOccurrence({ client, template: audit.id, periodStart: P.start, periodEnd: P.end });
    await approveDraft(w.users.alice, r.entry_id);
  }
  await retireTemplate(w.users.hana, { client, template: audit.id, reason: "engagement ended" });

  // THE SLIP: a genuinely separate LEGAL-fee template, declared as the audit template's
  // replacement. Nothing about the declaration is verifiable — it is the professional's claim —
  // so the DB records it and, correctly given what it was told, asserts on it.
  const legalName = `x42 r10p1h legal ${Date.now()}`;
  const legalLines = accrualLines(120_000, { debit: EXPB, credit: ACCR });
  const wrong = await liveReplacement({
    client, name: legalName, start: M[0].start, lines: legalLines, memo: "legal fee",
    replaces: audit.id });

  const err = await refusalOf(client, wrong.template_id, M[0]);
  assert.equal(reasonToken(err), "period_shape_already_met");
  const d = JSON.parse(err.detail);
  assert.match(err.message, /Do NOT give this template distinct account codes/,
    "the product forbids the act that is, on THIS scenario, the correct one — because it was told a lineage that is not true");
  assert.deepEqual(d.replaced_generations, [audit.id]);

  // AND THE TWO 'SAFE' ACTS ARE BOTH WRONG HERE, which is what makes the third one load-bearing.
  // The entry clause 1 points at is the firm's own audit accrual: reversing it is the RM6,000
  // erasure round 9 was measured doing. The cell asserts what it points at and does NOT follow it.
  const pointedAt = await rootQuery(
    `select (je.flags -> 'recurring_adjustment' ->> 'template_id') as tpl, je.memo
       from clara.journal_entries je where je.id = $1`, [d.correction_entry]);
  assert.equal(pointedAt.rows[0].tpl, audit.id,
    "clause 1 points at the AUDIT accrual — a charge this firm is required to carry");

  // THE RECOVERY, followed verbatim. Retire admits (the run was refused, so no occurrence draft
  // is outstanding), and the retired row frees its content_hash slot, so the IDENTICAL proposal
  // is admitted — this time with no predecessor named.
  await retireTemplate(w.users.hana, { client, template: wrong.template_id, reason: "lineage was declared in error" });
  const fixed = await liveReplacement({
    client, name: legalName, start: M[0].start, lines: legalLines, memo: "legal fee" });
  assert.notEqual(fixed.template_id, wrong.template_id,
    "a claim about the books is corrected by making it again, never by editing it in place");

  const err2 = await refusalOf(client, fixed.template_id, M[0]);
  const d2 = JSON.parse(err2.detail);
  assert.deepEqual(d2.replaced_generations, [],
    "with the mistaken claim withdrawn there is nothing to assert");
  assert.deepEqual(d2.remedy,
    ["correct_the_standing_entry_in_period", "distinct_codes_with_predecessor_caution"],
    "…and lane O1's caution is what the professional is back on");
  assert.match(err2.message, /or give this template distinct account codes/,
    "…with the act that produces correct books offered again");

  // BOTH DECLARATIONS SURVIVE IN THE TRAIL — the point of never editing one in place.
  // [#927] The trail is the PROPOSE DOOR's own audit row, and that door retired at 0282, so above
  // that frontier the RECORD ON THE ROWS is what carries the same fact: the mistaken declaration
  // and the corrected one are two separate templates, one naming a predecessor and one naming
  // nobody, neither edited in place. The audit-trail form runs on a pre-0282 chain.
  if (await templatesRetired()) {
    const rows = (await rootQuery(
      `select id, replaces_template_id from clara.adjustment_templates
        where client_id = $1 and id = any($2::uuid[]) order by created_at, id`,
      [client, [wrong.template_id, fixed.template_id]])).rows;
    const declared = rows.map((r) => r.replaces_template_id);
    assert.ok(declared.includes(audit.id), "the mistaken declaration is still on the record");
    assert.ok(declared.includes(null), "…beside the corrected proposal that names nobody");
  } else {
    const trail = await rootQuery(
      `select (a.args ->> 'replaces_template_id') as repl
         from clara.audit_log a
        where a.fn = 'propose_adjustment_template'
          and (a.args ->> 'client') = $1::text
        order by a.id`, [client]);
    const declared = trail.rows.map((r) => r.repl);
    assert.ok(declared.includes(audit.id), "the mistaken declaration is still on the record");
    assert.ok(declared.includes(null), "…beside the corrected proposal that names nobody");
  }

  // NOW TAKE THE ACT THE CAUTION OFFERS, and assert the MONEY (WDB-R4).
  const recut = await liveTemplate({
    client, label: "r10p1h legal recut", start: M[0].start,
    lines: accrualLines(120_000, { debit: EXPB, credit: ACCR2 }), memo: "legal fee, own code" });
  for (const P of M) {
    const r = await runOccurrence({ client, template: recut.id, periodStart: P.start, periodEnd: P.end });
    await approveDraft(w.users.alice, r.entry_id);
  }
  assert.equal(await glNet(client, EXPA), 600_000, "the audit accrual the firm must keep is intact");
  assert.equal(await glNet(client, ACCR), -600_000, "…and so is its liability");
  assert.equal(await glNet(client, EXPB), 240_000, "the legal fee is accrued once per month");
  assert.equal(await glNet(client, ACCR2), -240_000, "…against its own accrual code, to the sen");
});
