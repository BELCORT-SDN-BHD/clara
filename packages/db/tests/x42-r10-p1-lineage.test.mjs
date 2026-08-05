// 0042 Wave D-b — ROUND 10, LANE P1: THE RECORDED LINEAGE (the OWNER's option (b), ruled
// 2026-08-04 as an ADDITIVE [WDB-G13] amendment — template immutability and the
// retire-and-re-propose idiom are UNCHANGED; a replacement now merely RECORDS what it replaces).
//
// THE ROOT THREE ROUNDS FAILED TO REACH. "Is the standing charge in the way the generation this
// template replaces?" is the question every remedy at the shape_already_met refusal turns on, and
// until now the schema held nothing that could answer it. Round 9 answered it from the standing
// writer's STATUS and was measured wrong in BOTH directions with money — a retired SIBLING whose
// only offered act erased RM6,000 of a legitimate audit accrual (z1/p1-retired-sibling.mjs), and
// the propose-then-retire click ORDER, where the status reads `live` and the doubling instruction
// printed anyway (z1/p5-order-bypass.mjs, RM18,000 against an RM6,000 intention). Round 10 lane O1
// deleted the inference and shipped an honest MEASURED caution — correct, and still unable to stop
// anything. `clara.adjustment_templates.replaces_template_id`, declared at propose and immutable
// afterwards, is the fact that closes it: where the recorded lineage reaches a generation with
// charges still standing, the refusal stops cautioning and ASSERTS.
//
// THE LAW UNDER TEST (contract-blind: authored from the ruling and from lane O1's shipped grammar,
// never from the SQL):
//   * the declaration is OPTIONAL and validated FAIL-CLOSED — the named predecessor must be a
//     template of THIS client and must be RETIRED, and a chain already at the walk's cap may not
//     be extended. Everything that cannot be verified is refused by name, and every refusal names
//     an act the caller can take (propose it without a predecessor / retire it first);
//   * where it reaches standing money the sentence ASSERTS and FORBIDS the distinct-codes act, and
//     the machine `remedy` carries `distinct_codes_forbidden_replaced_generation` plus the second
//     act the sentence offers (`start_after_replaced_generation`) — a prohibition that leaves no
//     act is the walled corridor this ladder keeps rebuilding;
//   * where it does NOT, lane O1's caution stands VERBATIM. That fallback is not dead code: every
//     template proposed without a declaration lands on it, forever.
//
// THE OFF-PATH ARMS (WDB-R4) are the point of half this file: the retired SIBLING that must still
// get the caution and must still be allowed to re-cut (round 9's own defect, re-asked of round
// 10's repair); a declaration that reaches NO standing money, where the prohibition must NOT fire;
// the MIRROR grain, where the shape census sees nothing at all and only the standing entry's own
// stamp names the ancestor; a forged CYCLE and a forged over-cap chain, neither reachable through
// these verbs; and the op-key replay that would otherwise swallow a corrected declaration.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  opk, endPool, printLaneNotes, printSkipCount, rootQuery, getPool, humanQuery, namedCall,
  x42EnsureReady, skip42, caught, reasonToken,
  EXPA, EXPB, ACCR, ACCR2, CLR38, CLR10, mon,
  runManual, retireTemplate, signTemplate, reverseEntry,
  accrualLines, adjWorld, freshAdjClient, liveTemplate, approveDraft, glNet, templateRow,
} from "./x42-adj-helpers.mjs";

let live = false;
let w = null;

before(async () => {
  live = await x42EnsureReady();
  if (live) w = await adjWorld();
});
after(async () => {
  printLaneNotes("x42-r10p1");
  printSkipCount("x42-r10p1");
  await endPool();
});
const skipHere = (t) => skip42(t, live);

/** propose WITH the optional trailing lineage declaration. The argument is LAST and defaults to
 *  NULL, so this is the same call every other cell in the battery makes plus one name — which is
 *  the whole content of "additive ABI delta" and is asserted as such by the cells that omit it. */
const proposeR = async (sub, {
  client, name, cadence = "monthly", start, end = null, autoReverse = false,
  lines, memo = "x42 p1 accrual", replaces = null, opKey = null,
}) => (await humanQuery(sub, namedCall("propose_adjustment_template", [
  { name: "p_client" }, { name: "p_name" }, { name: "p_cadence" },
  { name: "p_start_date", cast: "date" }, { name: "p_end_date", cast: "date" },
  { name: "p_auto_reverse", cast: "boolean" }, { name: "p_lines", cast: "jsonb" },
  { name: "p_memo_template" }, { name: "p_op_key" }, { name: "p_replaces", cast: "uuid" },
]), [client, name, cadence, start, end, autoReverse, JSON.stringify(lines), memo,
  opKey ?? opk("x42p1prop"), replaces])).rows[0].result;

/** propose + sign a LIVE template that DECLARES a predecessor. */
async function liveReplacement(o) {
  const p = await proposeR(w.users.bob, o);
  await signTemplate(w.users.hana, { client: o.client, template: p.template_id, opKey: opk("x42p1sig") });
  return p;
}

const refusalOf = (client, template, period) => caught(() => runManual(w.users.bob, {
  client, template, periodStart: period.start, periodEnd: period.end }));

const detailOf = (err) => JSON.parse(err.detail);

/** Four months of an ordinary accrual, standing and approved. */
async function standingMonths(client, template, months) {
  for (const P of months) {
    const r = await runManual(w.users.bob, {
      client, template, periodStart: P.start, periodEnd: P.end });
    await approveDraft(w.users.alice, r.entry_id);
  }
}

/** Forge a row past the transition trigger. The trigger is BEFORE DELETE OR UPDATE, so a plain
 *  INSERT needs no bypass; only the cycle arm (an UPDATE) does, and it says so at its own site.
 *
 *  IT CARRIES THE INHERITED LINEAGE ROOT, and that is not decoration [W-R13, Codex RC1]. This
 *  helper stages a CHAIN, and a chain's whole descent carries ONE root from its first edge onward
 *  -- which is what clara.propose_adjustment_template writes and what
 *  clara._tf_adjustment_template_lineage_root now proves at the storage layer. Leaving the column
 *  null while declaring a predecessor is precisely the forgery that belt refuses (it is how a
 *  hand-written row escapes uq_adjustment_templates_one_live_leaf into a bucket of its own), so a
 *  fixture that wrote it would be staging an UNSTORABLE shape and measuring the belt instead of
 *  the walk's cap. The scalar subselect yields null when nothing is declared, which is the
 *  first row of every chain. */
async function stageRetiredChainRow(sourceTemplate, label, replaces) {
  const r = await rootQuery(
    `insert into clara.adjustment_templates(firm_id, client_id, status, name, cadence,
        start_date, auto_reverse, lines, memo_template, content_hash, replaces_template_id,
        lineage_root_id,
        proposed_by, proposed_op_key, signed_by, signed_at, retired_by, retired_at, retired_reason)
     select t.firm_id, t.client_id, 'retired', 'x42 p1 staged ' || $2, 'monthly', t.start_date,
            false, t.lines, 'x42 p1 staged', md5(random()::text) || md5(random()::text), $3,
            (select coalesce(pp.lineage_root_id, pp.id) from clara.adjustment_templates pp
              where pp.id = $3),
            t.proposed_by, 'x42-p1-staged-' || $2, t.proposed_by, now(), t.proposed_by, now(),
            'x42 p1 staged chain'
       from clara.adjustment_templates t where t.id = $1 returning id`,
    [sourceTemplate, label, replaces]);
  return r.rows[0].id;
}

// ---------------------------------------------------------------------------------------
// x42.r10p1a — THE TRUE EDIT. The lineage is declared, so the refusal states it, forbids the act
// that would double, and the cell then FOLLOWS what it DOES offer and asserts the books.
// ---------------------------------------------------------------------------------------
test("x42.r10p1a a template that DECLARES its predecessor is told so: the refusal asserts the recorded lineage, forbids the distinct-codes act by name, and the acts it still offers leave the books at the corrected figure", async (t) => {
  if (skipHere(t)) return;
  const M = [mon(-5), mon(-4)];
  const client = await freshAdjClient("r10p1a");

  const gen1 = await liveTemplate({
    client, label: "r10p1a gen1", start: M[0].start,
    lines: accrualLines(300_000, { debit: EXPA, credit: ACCR }), memo: "audit accrual" });
  await standingMonths(client, gen1.id, M);
  assert.equal(await glNet(client, EXPA), 600_000, "two months of the OLD figure stand");

  // [WDB-G13]'s edit, in the order that can carry the declaration.
  await retireTemplate(w.users.hana, { client, template: gen1.id, reason: "figure corrected" });
  const gen2 = await liveReplacement({
    client, name: `x42 r10p1a gen2 ${Date.now()}`, start: M[0].start,
    lines: accrualLines(150_000, { debit: EXPA, credit: ACCR }), memo: "audit accrual (revised)",
    replaces: gen1.id });
  const row = await templateRow(gen2.template_id);
  assert.equal(row.replaces_template_id, gen1.id, "the declaration is RECORDED on the row itself");

  const err = await refusalOf(client, gen2.template_id, M[0]);
  assert.ok(err, "the standing month is still met");
  assert.equal(err.code, CLR38);
  assert.equal(reasonToken(err), "period_shape_already_met");
  const d = detailOf(err);

  assert.match(err.message, /Do NOT give this template distinct account codes/,
    "the act is FORBIDDEN, because with a recorded lineage the doubling is arithmetic, not a risk");
  assert.match(err.message, /PROPOSED AS THE REPLACEMENT FOR/, "…and the refusal says why it knows");
  assert.match(err.message, /that lineage is RECORDED on this template/,
    "…naming the SOURCE of the claim, so nobody reads it as another inference");
  assert.doesNotMatch(err.message, /BUT MEASURE FIRST/,
    "the caution grammar is for the branch that is GUESSING; this branch is not");
  assert.doesNotMatch(err.message, /IF this template replaces that one/,
    "…and nothing here is conditional any more");

  // THE PROHIBITION LEAVES ACTS BEHIND IT (the walled-corridor law, the ladder's #1 defect family).
  assert.match(err.message, /Correct entry .* within its own period with clara\.reverse_entry/,
    "act 1: correct the standing entry, with the verb the correction door names");
  assert.match(err.message, /the only other act that does not double them is a replacement starting after 2026/,
    "act 2: a replacement that starts after the replaced generation's last charged period");

  assert.match(err.message, /retire it \(clara\.retire_adjustment_template\) and propose it again without naming a predecessor/,
    "act 3: the recovery, because a declaration is a CLAIM and a professional can be wrong — a prohibition with no way out is round 9's ghost");
  assert.deepEqual(d.remedy, [
    "correct_the_standing_entry_in_period",
    "distinct_codes_forbidden_replaced_generation",
    "start_after_replaced_generation",
    "re_propose_without_predecessor",
  ], "the machine list carries EVERY act the sentence carries — position 2 still says which spelling of the distinct-codes clause was printed");
  assert.deepEqual(d.replaced_generations, [gen1.id],
    "the prohibition names the proof it rests on");
  assert.equal(d.lineage_truncated, false, "…and the walk reached a root");
  assert.equal(d.predecessor_candidates.length, 1);
  assert.equal(d.predecessor_candidates[0].replaced, true,
    "the census row carries the lineage fact about itself, so a surface need not re-derive it");
  assert.equal(d.predecessor_candidates[0].standing, 2);

  // NOW FOLLOW WHAT IS OFFERED, and assert the MONEY (WDB-R4: the books, not the gate's answer).
  const standing = await rootQuery(
    `select je.id from clara.journal_entries je
      where je.client_id = $1 and je.status = 'approved' and je.reversed_by is null
        and (je.flags -> 'recurring_adjustment' ->> 'template_id') = $2
      order by je.posting_date`, [client, gen1.id]);
  assert.equal(standing.rowCount, 2, "the old generation's two charges are what stand");
  for (const s of standing.rows) {
    await reverseEntry(w.users.bob, { entry: s.id, reason: "x42 r10p1a correct the generation", opKey: opk("r10p1arev") });
  }
  await standingMonths(client, gen2.template_id, M);
  assert.equal(await glNet(client, EXPA), 300_000,
    "two months at the CORRECTED figure and nothing else — RM1,500 x 2, to the sen");
  assert.equal(await glNet(client, ACCR), -300_000, "…and the liability matches it exactly");
});

// ---------------------------------------------------------------------------------------
// x42.r10p1b — BOTH CLICK ORDERS. The propose-first order stays lawful and unstamped (lane O1's
// warning, untouched); the professional who then retires and re-proposes reaches the assertion.
// The click order can no longer decide what the product knows.
// ---------------------------------------------------------------------------------------
test("x42.r10p1b the propose-first order is still lawful, still only WARNED and still lands on the O1 caution — and the same professional, having retired the predecessor and re-proposed with the declaration, gets the assertion: the order cannot switch it off", async (t) => {
  if (skipHere(t)) return;
  const M = [mon(-5), mon(-4)];
  const client = await freshAdjClient("r10p1b");
  const gen1 = await liveTemplate({
    client, label: "r10p1b gen1", start: M[0].start,
    lines: accrualLines(300_000, { debit: EXPA, credit: ACCR }), memo: "accrual v1" });
  await standingMonths(client, gen1.id, M);

  // ORDER B, step 1: propose the replacement while the predecessor is still LIVE. The declaration
  // is refused BY NAME (it would not be true yet) and the proposal itself is admitted.
  const eLive = await caught(() => proposeR(w.users.bob, {
    client, name: `x42 r10p1b early ${Date.now()}`, start: M[0].start,
    lines: accrualLines(150_000, { debit: EXPA, credit: ACCR }), memo: "accrual v2",
    replaces: gen1.id }));
  assert.equal(eLive.code, CLR10);
  assert.equal(reasonToken(eLive), "template_replaces_not_retired");
  assert.match(eLive.message, /retire it first \(clara\.retire_adjustment_template\)/,
    "the refusal names the act that makes the declaration true — and that verb really admits");
  assert.match(eLive.message, /or propose it now without naming a predecessor/,
    "…and the act that keeps the propose-first order open");

  const early = await liveReplacement({
    client, name: `x42 r10p1b gen2 ${Date.now()}`, start: M[0].start,
    lines: accrualLines(150_000, { debit: EXPA, credit: ACCR }), memo: "accrual v2" });
  assert.equal(early.warnings.length, 1, "lane O1's propose advisory is untouched by this round");
  assert.equal(early.warnings[0].axis, "colliding_live_sibling");
  const dEarly = detailOf(await refusalOf(client, early.template_id, M[0]));
  assert.deepEqual(dEarly.remedy,
    ["correct_the_standing_entry_in_period", "distinct_codes_with_predecessor_caution"],
    "with no declaration the O1 caution stands VERBATIM — the fallback is the ordinary case, not dead code");
  assert.deepEqual(dEarly.replaced_generations, [], "…and nothing is asserted");
  assert.equal(dEarly.predecessor_candidates[0].replaced, false);

  // ORDER B, step 2: the professional retires both and re-proposes, this time declaring.
  await retireTemplate(w.users.hana, { client, template: gen1.id, reason: "superseded" });
  await retireTemplate(w.users.hana, { client, template: early.template_id, reason: "re-proposed with lineage" });
  const gen2 = await liveReplacement({
    client, name: `x42 r10p1b gen2b ${Date.now()}`, start: M[0].start,
    lines: accrualLines(150_000, { debit: EXPA, credit: ACCR }), memo: "accrual v2",
    replaces: gen1.id });
  const dLate = detailOf(await refusalOf(client, gen2.template_id, M[0]));
  assert.deepEqual(dLate.remedy, [
    "correct_the_standing_entry_in_period",
    "distinct_codes_forbidden_replaced_generation",
    "start_after_replaced_generation",
    "re_propose_without_predecessor",
  ], "the SAME edit, reached the other way round, now asserts");
  assert.deepEqual(dLate.replaced_generations, [gen1.id]);
});

// ---------------------------------------------------------------------------------------
// x42.r10p1c — THE MIRROR GRAIN (OFF-PATH). The shape census cannot see the ancestor at all here:
// the collision is with the predecessor's auto-reversal MIRROR, whose shape is its occurrence's
// leg-SWAPPED. Only the standing entry's own stamp names the writer — so this arm proves the
// assertion is driven by the recorded edge and not by the census.
// ---------------------------------------------------------------------------------------
test("x42.r10p1c the standing member is a predecessor's auto-reversal MIRROR: the shape census returns nothing, and the recorded lineage still carries the assertion — with the pair verb named, not clara.reverse_entry", async (t) => {
  if (skipHere(t)) return;
  const P = mon(-4), P2 = mon(-3);
  const client = await freshAdjClient("r10p1c");
  const gen1 = await liveTemplate({
    client, label: "r10p1c accrue", start: P.start, autoReverse: true,
    lines: accrualLines(500_000, { debit: EXPA, credit: ACCR }), memo: "accrue" });
  const r = await runManual(w.users.bob, {
    client, template: gen1.id, periodStart: P.start, periodEnd: P.end });
  await approveDraft(w.users.alice, r.entry_id);
  await retireTemplate(w.users.hana, { client, template: gen1.id, reason: "re-cut" });

  const gen2 = await liveReplacement({
    client, name: `x42 r10p1c release ${Date.now()}`, start: P.start, autoReverse: false,
    lines: accrualLines(500_000, { debit: ACCR, credit: EXPA }), memo: "release",
    replaces: gen1.id });

  const err = await refusalOf(client, gen2.template_id, P2);
  const d = detailOf(err);
  assert.equal(reasonToken(err), "period_shape_already_met");
  assert.equal(d.role, "reversal", "the standing member is the MIRROR, in the set by its own money");
  assert.deepEqual(d.predecessor_candidates, [],
    "the shape census is EMPTY — the predecessor's own template lines do not collide with this shape at all");
  assert.deepEqual(d.replaced_generations, [gen1.id],
    "…and the assertion still fires, from the standing entry's own stamp");
  assert.match(err.message, /which wrote the standing charge named above/,
    "the sentence says only what it measured — no fabricated period count for a generation the census never counted");
  assert.match(err.message, /clara\.reverse_adjustment_pair/,
    "and clause 1 still names the verb the correction door admits for a PAIR, never clara.reverse_entry");
  assert.equal(d.remedy[1], "distinct_codes_forbidden_replaced_generation");
});

// ---------------------------------------------------------------------------------------
// x42.r10p1d — A DECLARATION THAT REACHES NO STANDING MONEY (OFF-PATH). Declaring a predecessor
// must not, on its own, switch the prohibition on: the charge in the way here belongs to a
// genuinely separate live template, and the lawful distinct-codes act must stay offered.
// ---------------------------------------------------------------------------------------
test("x42.r10p1d a template that declares a predecessor with nothing standing is NOT given the prohibition: the charge in the way was written by an unrelated template, so the O1 caution is what prints and the distinct-codes act stays offered", async (t) => {
  if (skipHere(t)) return;
  const M = [mon(-5)];
  const client = await freshAdjClient("r10p1d");

  // The unrelated live template that actually holds the period.
  const other = await liveTemplate({
    client, label: "r10p1d other", start: M[0].start,
    lines: accrualLines(300_000, { debit: EXPA, credit: ACCR }), memo: "someone else's accrual" });
  await standingMonths(client, other.id, M);

  // A REAL predecessor on entirely different codes, retired without ever posting.
  const gen1 = await liveTemplate({
    client, label: "r10p1d gen1", start: M[0].start,
    lines: accrualLines(90_000, { debit: EXPB, credit: ACCR2 }), memo: "prepaid" });
  await retireTemplate(w.users.hana, { client, template: gen1.id, reason: "never ran" });

  const gen2 = await liveReplacement({
    client, name: `x42 r10p1d gen2 ${Date.now()}`, start: M[0].start,
    lines: accrualLines(90_000, { debit: EXPA, credit: ACCR }), memo: "prepaid (re-coded)",
    replaces: gen1.id });

  const err = await refusalOf(client, gen2.template_id, M[0]);
  const d = detailOf(err);
  assert.equal(reasonToken(err), "period_shape_already_met");
  assert.deepEqual(d.replaced_generations, [],
    "the declared predecessor has no standing charge here, so there is nothing to assert");
  assert.match(err.message, /or give this template distinct account codes/,
    "…and the lawful act is still offered — a declaration is not a blanket prohibition");
  assert.doesNotMatch(err.message, /Do NOT give this template distinct account codes/);
  assert.equal(d.remedy[1], "distinct_codes_with_predecessor_caution");
  assert.equal(d.predecessor_candidates.length, 1, "the caution names the LIVE template that really holds the period");
  assert.equal(d.predecessor_candidates[0].template_id, other.id);
  assert.equal(d.predecessor_candidates[0].replaced, false,
    "…and reports honestly that it is NOT the generation this template replaces");
});

// ---------------------------------------------------------------------------------------
// x42.r10p1e — ROUND 9's OWN DEFECT, RE-ASKED OF ROUND 10's REPAIR (OFF-PATH). The retired
// SIBLING that is not a predecessor must be exactly where lane O1 left it: cautioned, never
// asserted, and the act it once forbade must still produce correct books.
// ---------------------------------------------------------------------------------------
test("x42.r10p1e the retired SIBLING that nobody declared is untouched by this round: the caution prints verbatim, nothing is forbidden, and following the once-forbidden act still leaves all four balances right", async (t) => {
  if (skipHere(t)) return;
  const M = [mon(-5), mon(-4)];
  const client = await freshAdjClient("r10p1e");

  const audit = await liveTemplate({
    client, label: "r10p1e audit", start: M[0].start,
    lines: accrualLines(300_000, { debit: EXPA, credit: ACCR }), memo: "audit fee" });
  await standingMonths(client, audit.id, M);
  await retireTemplate(w.users.hana, { client, template: audit.id, reason: "engagement ended" });

  const legal = await liveTemplate({
    client, label: "r10p1e legal", start: M[0].start,
    lines: accrualLines(120_000, { debit: EXPB, credit: ACCR }), memo: "legal fee" });
  const err = await refusalOf(client, legal.id, M[0]);
  const d = detailOf(err);
  assert.doesNotMatch(err.message, /Do NOT give this template distinct account codes/,
    "no declaration was ever made, so this file has no lineage to assert — round 9's prohibition stays deleted");
  assert.match(err.message, /BUT MEASURE FIRST/, "O1's measured caution is what prints");
  assert.match(err.message, /IF this template replaces that one/, "…still conditional");
  assert.deepEqual(d.remedy,
    ["correct_the_standing_entry_in_period", "distinct_codes_with_predecessor_caution"]);
  assert.deepEqual(d.replaced_generations, []);
  assert.equal(d.predecessor_candidates[0].template_id, audit.id);
  assert.equal(d.predecessor_candidates[0].replaced, false);

  const recut = await liveTemplate({
    client, label: "r10p1e legal recut", start: M[0].start,
    lines: accrualLines(120_000, { debit: EXPB, credit: ACCR2 }), memo: "legal fee, own code" });
  await standingMonths(client, recut.id, M);
  assert.equal(await glNet(client, EXPA), 600_000, "the audit accrual the firm must keep is intact");
  assert.equal(await glNet(client, ACCR), -600_000);
  assert.equal(await glNet(client, EXPB), 240_000, "the legal fee is accrued once per month");
  assert.equal(await glNet(client, ACCR2), -240_000);
});

// ---------------------------------------------------------------------------------------
// x42.r10p1f — WHAT MAY NOT BE DECLARED. Every arm is fail-closed and every refusal names an act.
// ---------------------------------------------------------------------------------------
test("x42.r10p1f a declaration this product cannot verify is refused by name — a forged id, another client's template, a live predecessor and an over-cap chain — and each refusal names an act the caller can actually take", async (t) => {
  if (skipHere(t)) return;
  const M = [mon(-5)];
  const cA = await freshAdjClient("r10p1fA");
  const cB = await freshAdjClient("r10p1fB");
  const mine = await liveTemplate({ client: cA, label: "r10p1f mine", start: M[0].start,
    lines: accrualLines(100_000, { debit: EXPA, credit: ACCR }), memo: "mine" });
  const theirs = await liveTemplate({ client: cB, label: "r10p1f theirs", start: M[0].start,
    lines: accrualLines(100_000, { debit: EXPA, credit: ACCR }), memo: "theirs" });

  const attempt = (client, replaces) => caught(() => proposeR(w.users.bob, {
    client, name: `x42 r10p1f ${Math.random().toString(36).slice(2)}`, start: M[0].start,
    lines: accrualLines(90_000, { debit: EXPB, credit: ACCR2 }), replaces }));

  const forged = await attempt(cA, "00000000-0000-4000-8000-000000000000");
  assert.equal(forged.code, CLR10);
  assert.equal(reasonToken(forged), "template_replaces_unknown");
  assert.match(forged.message, /propose it without naming a predecessor/, "…and names the act");

  const cross = await attempt(cA, theirs.id);
  assert.equal(reasonToken(cross), "template_replaces_unknown",
    "another client's template is reported as 'not a template of this client', never as a different fact — the read may not be used to probe another tenant's register");

  const stillLive = await attempt(cA, mine.id);
  assert.equal(reasonToken(stillLive), "template_replaces_not_retired");

  // AN OVER-CAP CHAIN, staged with plain INSERTs (the transition trigger is before DELETE/UPDATE).
  let prev = null;
  for (let i = 0; i < 66; i += 1) prev = await stageRetiredChainRow(mine.id, `f${i}`, prev);
  const anc = (await rootQuery("select clara._wdb_template_ancestry($1,$2) as a", [cA, prev])).rows[0].a;
  assert.equal(anc.cap, 64, "the walk owns the number, and reports it");
  assert.equal(anc.depth, 64, "…and stops there");
  assert.equal(anc.truncated, true, "…saying so rather than answering as if it had reached a root");
  const deep = await attempt(cA, prev);
  assert.equal(reasonToken(deep), "template_replaces_chain_too_long");
  assert.equal(detailOf(deep).axis, "unwalkable");
  assert.match(deep.message, /propose this one without naming a predecessor/);
});

// ---------------------------------------------------------------------------------------
// x42.r10p1g — THE STORAGE LAYER AND THE REPLAY (OFF-PATH). Neither is reachable through the
// verbs; both are what a restored or hand-patched register would try.
// ---------------------------------------------------------------------------------------
test("x42.r10p1g the recorded lineage cannot be forged after the fact: a self-reference is refused by the CHECK, the pointer is immutable like every other non-lifecycle column, a forged CYCLE terminates the walk, and an op_key replayed with a CHANGED declaration is refused instead of silently replaying the old receipt", async (t) => {
  if (skipHere(t)) return;
  const M = [mon(-5)];
  const client = await freshAdjClient("r10p1g");
  const a = await liveTemplate({ client, label: "r10p1g a", start: M[0].start,
    lines: accrualLines(10_000, { debit: EXPA, credit: ACCR }), memo: "a" });
  const b = await liveTemplate({ client, label: "r10p1g b", start: M[0].start,
    lines: accrualLines(20_000, { debit: EXPA, credit: ACCR }), memo: "b" });

  // (i) SELF. A self-referencing FK is satisfied by the row's own key, so the CHECK is what stands.
  const selfId = (await rootQuery("select gen_random_uuid() as id")).rows[0].id;
  const eSelf = await caught(() => rootQuery(
    `insert into clara.adjustment_templates(id, firm_id, client_id, status, name, cadence,
        start_date, auto_reverse, lines, memo_template, content_hash, replaces_template_id,
        proposed_by, proposed_op_key)
     select $1, t.firm_id, t.client_id, 'proposed', 'x42 r10p1g self', 'monthly', t.start_date,
            false, t.lines, 'self', repeat('a', 64), $1, t.proposed_by, 'x42-p1-self'
       from clara.adjustment_templates t where t.id = $2`, [selfId, a.id]));
  assert.equal(eSelf.code, "23514");
  assert.equal(eSelf.constraint, "ck_adjustment_templates_replaces_not_self",
    "a template is never its own predecessor, and the storage layer says so");

  // (ii) IMMUTABLE. The transition trigger freezes everything outside the lifecycle stamps, so the
  // new column needed no allowset edit — which is the whole point of subtraction over enumeration.
  const eUpd = await caught(() => rootQuery(
    "update clara.adjustment_templates set replaces_template_id = $2 where id = $1", [a.id, b.id]));
  assert.equal(eUpd.code, CLR38);
  assert.equal(reasonToken(eUpd), "adjustment_template_immutable");

  // (iii) A FORGED CYCLE — reachable only past the trigger, i.e. only by a restore or a hand patch.
  const conn = await getPool().connect();
  try {
    await conn.query("set session_replication_role = replica");
    await conn.query("update clara.adjustment_templates set replaces_template_id = $2 where id = $1", [a.id, b.id]);
    await conn.query("update clara.adjustment_templates set replaces_template_id = $2 where id = $1", [b.id, a.id]);
  } finally {
    await conn.query("set session_replication_role = origin").catch(() => {});
    conn.release();
  }
  const anc = (await rootQuery("select clara._wdb_template_ancestry($1,$2) as x", [client, a.id])).rows[0].x;
  assert.deepEqual(anc.ancestors, [b.id], "the walk visits each row at most once");
  assert.equal(anc.truncated, true, "…and reports that it never reached a root");

  // ...AND THE CYCLE IS UNWOUND BEFORE THIS CELL ENDS [W-R14, test hygiene]. The two UPDATEs above
  // are the only writes in this battery that leave the SHARED rig in a state no door can produce:
  // each row now declares a parent while carrying no lineage root, which is precisely the shape
  // clara._tf_adjustment_template_lineage_root refuses — so a later reader measuring "rows that
  // violate the root law" would count this cell's staging as the build's posture. (Measured before
  // this restoration existed: two such rows per run of this cell, and six on a rig the battery had
  // been run over three times.) The unwind is keyed on the SHAPE rather than on these two ids, the
  // x42.r11f discipline: a mutual cycle is unstorable through every door, so the predicate can
  // only ever match rows this cell staged — including an earlier run's, on a shared rig.
  const undo = await getPool().connect();
  try {
    await undo.query("set session_replication_role = replica");
    await undo.query(`update clara.adjustment_templates t set replaces_template_id = null
       where t.replaces_template_id is not null
         and exists (select 1 from clara.adjustment_templates o
                      where o.id = t.replaces_template_id and o.replaces_template_id = t.id)`);
  } finally {
    await undo.query("set session_replication_role = origin").catch(() => {});
    undo.release();
  }
  assert.equal((await rootQuery(`select count(*)::int as n from clara.adjustment_templates t
     where t.replaces_template_id is not null
       and exists (select 1 from clara.adjustment_templates o
                    where o.id = t.replaces_template_id and o.replaces_template_id = t.id)`)).rows[0].n,
    0, "the forged cycle is unwound — the rig is left as this cell found it");

  // (iv) THE REPLAY. Same op_key, CHANGED declaration: refused, never replayed.
  const older = await liveTemplate({ client, label: "r10p1g old", start: M[0].start,
    lines: accrualLines(70_000, { debit: EXPB, credit: ACCR2 }), memo: "old" });
  await retireTemplate(w.users.hana, { client, template: older.id, reason: "replay fixture" });
  const key = opk("x42p1replay");
  const name = `x42 r10p1g replay ${Date.now()}`;
  const shot = { client, name, start: M[0].start,
    lines: accrualLines(70_000, { debit: EXPB, credit: ACCR2 }), memo: "old", opKey: key };
  const first = await proposeR(w.users.bob, shot);
  const again = await proposeR(w.users.bob, shot);
  assert.equal(again.template_id, first.template_id, "an identical replay is still idempotent");
  const eReplay = await caught(() => proposeR(w.users.bob, { ...shot, replaces: older.id }));
  assert.equal(eReplay.code, CLR10);
  assert.match(eReplay.message, /op_key reused with different args/,
    "a CORRECTED declaration under the same key must not be swallowed by the first receipt");
});
