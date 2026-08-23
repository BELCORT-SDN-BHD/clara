// F-A2 PR-1 — THE LADDER, part 3: Annex C.3's rungs B7-B15, the two belts GM-3 CUT to Tier D,
// and the VECTOR cells. Parts 1/2/4 are f-a2-ladder.test.mjs (C.1/C.2), f-a2-ladder-2.test.mjs
// (B1-B6) and f-a2-ladder-4.test.mjs (C.4/C.5).
//
// CONTRACT-BLIND, frontier-gated on `f_a2_posting_core$` — EXCEPT the two pure-consumer cells
// at the foot of this file, which test THIS BATTERY's own reading of a vector and therefore
// need no DB surface at all. They run at every frontier, and they are the cells that would go
// red if anyone rewrote the consumer contract as `vector[r] === 'fail'`.
//
// TWO CELLS HERE EXIST BECAUSE THE GATE CUT SOMETHING, and they are written as POSITIVES on
// purpose. B12/B13 were specified as Tier-B pre-checks and CUT at PR-0 on correctness grounds
// (GM-3): a belt predicate is only true AFTER the approve hook runs, so a pre-hook evaluation
// has the wrong inputs BY CONSTRUCTION and refused the two most common LAWFUL shapes on those
// belts — an FA acquisition debit and a staff-advance disbursement debit. Those two shapes
// therefore have cells asserting they POST. They would have gone RED against v4, which is the
// proof that the cut was correctness and not width.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  rootQuery, endPool, buildWorld, printLaneNotes, printSkipCount, noteLane,
  booksVersion, opk, counterpartyRows, openQuestion, postingCoreReady,
  gateCore, wakePostEntry, agentPostable, agentDraft, autodraftCred, ensureChart,
  witnessedFiling, admits, admitsAll, nonAdmitting, assertVectorShape, assertNonAdmitting,
  supplierLines, salesLines, genericLines, genericWithControlLeg, CHART,
  TIER_B_RUNGS, TIER_D_TOKENS, TIER_D_DECLARED_UNREACHABLE, ADV_MIRROR_AXIS,
  postReceiptRow, opReceiptResult, upsertAccountClassed,
  controlLegCount, doctorLines, stampCodingKind, bodyOfName,
} from "./f-a2-post-world.mjs";

let world = null;
before(async () => { if (await postingCoreReady()) world = await buildWorld(); });
after(async () => {
  printLaneNotes("f-a2-ladder-3");
  printSkipCount("f-a2-ladder-3");
  await endPool();
});

const A1 = () => world.clients.A1;
const A2 = () => world.clients.A2;
const OWNER = () => world.users.alice;
const post = (p, over = {}) => wakePostEntry(p.cred, { ...p.args, ...over });

// ===========================================================================
// B7 / B8 — the two evidence rungs.
// ===========================================================================

test("f-a2.c3.B7 amount-bearing evidence at the model_read tier refuses unverified_evidence", async (t) => {
  if (await gateCore(t)) return;
  // `_bind_evidence` stamps 'verified' ONLY when the fact state is corroborated AND the cited
  // field is `invoice.total` AND the cited cents equal the anchor. Citing the TAX region instead
  // yields the other tier through the writer's own door — no doctoring, so the cell measures the
  // tier the estate really produces.
  //
  // RE-CUT AT INTEGRATION (F-A2 PR-1, N1 + the rung's own token). The old fixture cited the TAX
  // region on a CORROBORATED bill, and after N1 that cannot be drafted at all: the draft core
  // raises CLR21 `evidence_invalid` when a corroborated supplier bill does not bind its own
  // total, and the draft-door supplier floor raises CLR21 `tax_leg_missing` on a document
  // stating a nonzero tax. It would ALSO have proved the wrong thing — with no
  // `invoice.total` evidence row at all, B7 reads `not_evaluable`, not the `unverified_evidence`
  // this cell's title claims.
  //
  // THE SHAPE THAT PRODUCES THE TOKEN: an UNCORROBORATED document, with the entry citing its
  // `invoice.total` region. `_bind_evidence` grants `verified` only on a CORROBORATED state
  // (0009:462-466), so the amount-bearing row lands at `model_read` through the writer's own
  // door — no doctoring — and B7 has an amount-bearing row to judge and judges it FAIL. B2 is
  // unavoidably non-admitting too, which is why the cell keeps the LOOSE assertion.
  await ensureChart(OWNER(), A1());
  const cited = await witnessedFiling(OWNER(), { client: A1(), gross: 10600, corroborated: false });
  const { ev } = await import("./f-a2-post-world.mjs");
  const cred = await autodraftCred(A1());
  const d = await agentDraft(OWNER(), cred, {
    client: A1(), cited, codingKind: "supplier_bill", lines: supplierLines(10600),
    evidence: [ev(cited.regionId, cited.quote, "invoice.total")],
  });
  const tiers = await rootQuery(
    "select distinct provenance_tier from clara.entry_evidence where entry_id=$1", [d.entry_id]);
  assert.deepEqual(tiers.rows.map((x) => x.provenance_tier), ["model_read"],
    "c3.B7 precondition: the entry's only evidence sits at the model_read tier");
  const r = await wakePostEntry(cred, {
    entry: d.entry_id, expectedRevision: d.revision_token, client: A1(), booksVersion: await booksVersion(A1()),
  });
  assertNonAdmitting(assert, r, "B7", "c3.B7");
  // THE RUNG JUDGED, rather than falling to ARM-0. Written as a NOT-not_evaluable check, never
  // as a test for the forbidden literal: design 3.2's consumer contract says no consumer may
  // test vector[r] for the failing value, and c3.vec-consumer's scan enforces it on this very
  // file. What matters here is that the entry HAD an amount-bearing citation to judge.
  assert.notEqual(r?.rung_vector?.B7, "not_evaluable",
    `c3.B7: B7 had an amount-bearing citation and JUDGED its tier — an ARM-0 read here would mean the fixture never bound one (vector ${JSON.stringify(r?.rung_vector)})`);
});

// B8 lives in its own file: f-a2-b8.test.mjs carries the FIVE-cell set (primary + its
// negative twin, the rotation-suppressed twin, the alpha-scoping mixed-generation cell, the
// OCR dead-lane guard and the ARM-0 not_evaluable arm). One cell could not carry the rung's
// scope, its twin and its ARM-0 arm at once, and the two-generation fixture is used nowhere
// else in this file.

// ===========================================================================
// B9 — the open-question gate, under Tier A's three locks (GM-7).
// ===========================================================================

test("f-a2.c3.B9 all THREE blocking scope kinds refuse, and the receipt names the question_id", async (t) => {
  if (await gateCore(t)) return;
  let probed = 0;
  for (const scope of ["client", "document", "vendor"]) {
    const p = await agentPostable(OWNER(), { client: A2() });
    const cps = await counterpartyRows(A2());
    const scopeId = scope === "document" ? p.cited.documentId
      : scope === "vendor" ? (cps[cps.length - 1]?.id ?? null) : null;
    // BOTH ESCAPES WERE `noteLane` + `continue`, AND `noteLane` IS NOT A SKIP — it appends to an
    // array and the cell still reports PASS. If all three scopes took either escape the loop body
    // never ran a single assertion, and this cell (the one that proves B9 refuses on every scope
    // kind) was green having asked nothing. The file's own note records a zero/degenerate
    // population today, so that was not hypothetical.
    assert.ok(scope !== "vendor" || scopeId,
      "c3.B9 vendor: a counterparty was born on the draft — without one the vendor arm has no input and the scope is UNPROVEN, not skippable");
    const q = await openQuestion(OWNER(), {
      client: A2(), scopeKind: scope, scopeId, question: `c3.B9 ${scope}-scoped blocker`, opKey: opk("c3B9"),
    });
    assert.ok(q, `c3.B9 ${scope}: the blocking question was really opened — mandatory setup`);
    // THE BOOKS VERSION IS RE-READ, and it is not tidiness: `open_question` is itself a write,
    // so the token `agentPostable` captured before it is stale and Tier A refuses CLR12 before
    // any rung is evaluated — the cell would then be measuring the books guard, not B9.
    const r = await post(p, { booksVersion: await booksVersion(A2()) });
    assertNonAdmitting(assert, r, "B9", `c3.B9 ${scope}`);
    const qid = q?.question_id ?? q?.id ?? q;
    assert.ok(JSON.stringify(r).includes(String(qid)),
      `c3.B9 ${scope}: the receipt names the question_id ${qid} — a refusal that cannot say WHICH question blocks is not actionable`);
    probed += 1;
  }
  // ALL THREE, COUNTED. The claim in the title is "all THREE blocking scope kinds"; a loop that
  // completed two of them and reported PASS is the shape this counter exists to forbid.
  assert.equal(probed, 3,
    `c3.B9: all three scope kinds were actually probed (got ${probed})`);
  noteLane("c3.B9: G-11 measured this machinery at a ZERO population today (client 0/0, vendor 2 both rule_proposal, document 8 all BEE self-blocking) — real machinery, honest pricing");
});

test("f-a2.c3.B9-neg an origin='rule_proposal' question does NOT block (0012:100)", async (t) => {
  if (await gateCore(t)) return;
  const p = await agentPostable(OWNER(), { client: A2() });
  // COLUMN NAMES FROM THE CATALOG: the text column is `question_text`, and the shape CHECK pins
  // `scope_id = client_id` on a client-scoped row with both document_id and counterparty_id NULL.
  // `opener_kind` is NOT NULL and admits only 'human'|'wake'. A raw insert is used deliberately — `open_question` mints
  // origin='human', and `rule_proposal` is precisely the origin this cell needs.
  const q = await rootQuery(
    `insert into clara.open_questions(firm_id,client_id,scope_kind,scope_id,status,origin,
        opener_kind,question_text,opened_at)
     values((select firm_id from clara.clients where id=$1),$1,'client',$1,'open','rule_proposal',
        'wake',$2,now())
     returning id`, [A2(), "c3.B9-neg advisory proposal"]).catch((e) => ({ error: e }));
  // C3: FORCED. Without the seeded proposal there is no `origin='rule_proposal'` question for
  // B9 to admit, so the assertion below would be measuring an empty gate — and `noteLane` is not
  // a skip: node counts the cell PASSED.
  assert.ok(q && !q.error,
    `c3.B9-neg: the rule_proposal question seeds (${q?.error?.code}: ${q?.error?.message}) — B9's negative needs one to admit`);
  const r = await post(p);
  assert.ok(admits(r?.rung_vector, "B9"),
    `c3.B9-neg: a proposal is ADVISORY, never a gate — B9 must admit (got ${JSON.stringify(r?.rung_vector?.B9)})`);
});

// ===========================================================================
// B10 / B11 — the deferred shape floors, PRE-CHECKED ON THE PROJECTED STATE (GB-2).
// ===========================================================================

test("f-a2.c3.B10B11 an agent SALES draft whose receivable leg carries NO counterparty POSTS — GB-2's cell", async (t) => {
  if (await gateCore(t)) return;
  // The live supplier floor's prologue raises CLR23 on ANY control-class line with a NULL
  // counterparty — receivable INCLUDED — before its kind gate, and the counterparty is stamped
  // INSIDE the delegate, after the ladder runs. So a naive B10 refuses 100% of agent sales posts
  // WITH THE SUPPLIER TOKEN. This cell is the one that goes RED against v4's form.
  const p = await agentPostable(OWNER(), {
    client: A1(), amount: 10600, net: 10000, tax: 605, rounding: -5,
    codingKind: "sales_invoice", lines: salesLines(10600, 10000, 605, -5),
  });
  const legs = await controlLegCount(p.args.entry, { classes: ["receivable"], nullCounterpartyOnly: true });
  assert.notEqual(legs, 0,
    "c3.B10B11 precondition: the receivable leg really does carry a NULL counterparty at ladder time — if it did not, this cell would be proving nothing");
  const r = await post(p);
  assert.ok(admits(r?.rung_vector, "B10"),
    `c3.B10B11: B10 admits on the PROJECTED state (got ${JSON.stringify(r?.rung_vector?.B10)})`);
  assert.ok(admits(r?.rung_vector, "B11"), `c3.B10B11: and so does B11 (got ${JSON.stringify(r?.rung_vector?.B11)})`);
  assert.equal(r?.posted, true, `c3.B10B11: the sales post lands (${JSON.stringify(r?.refusal)})`);
  assert.notEqual(r?.refusal?.reason, "supplier_leg_shape",
    "c3.B10B11: and a sales post is NEVER refused with the SUPPLIER token — the exact 100%-refusal signature GB-2 found");
});

test("f-a2.c3.B10-neg a genuinely MIS-SHAPED supplier bill still refuses at B10", async (t) => {
  if (await gateCore(t)) return;
  // Polarity inverted: the payable is DEBITED and the expense CREDITED. Balanced, and wrong.
  //
  // IT CANNOT BE DRAFTED THAT WAY, and that is N1 working. §3.4 moves the shape floor to DRAFT
  // on the agent lane, so the writer refuses this shape before an entry exists — a STRONGER
  // wall than B10, not a weaker one. The lawful way to put the shape in front of the POST is
  // to draft CLEAN and doctor the lines afterwards (the rig-txn idiom for a deliberately
  // redundant wall). The HUMAN draft lane is not an option: A8 admits only maker_actor =
  // agent, so a human-drafted entry refuses at Tier A and never reaches B10.
  const p = await agentPostable(OWNER(), { client: A1(), codingKind: "supplier_bill" });
  const d = await doctorLines(p.args.entry, [
    { account_code: CHART.payable, debit_cents: 500000, credit_cents: 0, description: "c3.B10-neg ap-dr" },
    { account_code: CHART.expense, debit_cents: 0, credit_cents: 500000, description: "c3.B10-neg exp-cr" },
  ]);
  // C3: FORCED. "B10's negative is UNPROVEN" was recorded as a PASS.
  assert.equal(d.ok, true,
    `c3.B10-neg: the draft's lines are doctored into the mis-shaped form (${d.code}: ${d.message})`);
  assertNonAdmitting(assert, await post(p, { expectedRevision: d.revisionToken }), "B10", "c3.B10-neg");
});

// ===========================================================================
// B14 — a generic entry carries no AR/AP control leg (M-1; re-grounded at GM-4).
// ===========================================================================

test("f-a2.c3.B14 a generic JV carrying an AR/AP control leg refuses generic_control_leg AS A RECEIPT", async (t) => {
  if (await gateCore(t)) return;
  const p = await agentPostable(OWNER(), {
    client: A1(), amount: 500000, codingKind: null, lines: genericWithControlLeg(500000),
  });
  const r = await post(p);
  assertNonAdmitting(assert, r, "B14", "c3.B14");
  assert.equal(r.refusal.tier, "B",
    "c3.B14: a RECEIPT, not a Tier-D abort — B14 refuses the SHAPE rather than pre-checking the subledger belt");
  noteLane("c3.B14: GM-4 corrected the ground — the hook DOES materialise open items for a NULL coding_kind (ladder 5 classifies it 'adjustment'). B14 stands on the reason that survives: a weak anchor cannot corroborate a subledger consequence");
});

test("f-a2.c3.B14-twin the SAME entry with the control leg removed POSTS — the negative twin that proves the rung was the reason", async (t) => {
  if (await gateCore(t)) return;
  const p = await agentPostable(OWNER(), {
    client: A1(), amount: 500000, codingKind: null, lines: genericLines(500000),
  });
  const r = await post(p);
  assert.ok(admits(r?.rung_vector, "B14"), "c3.B14-twin: with no control leg B14 admits");
  assert.equal(r?.posted, true,
    `c3.B14-twin: …and the entry posts. Without this twin, B14's cell could be green because of any other rung (${JSON.stringify(r?.refusal)})`);
});

test("f-a2.c3.B14-coded a CODED-kind entry WITH a control leg still posts — _subledger_on_approve really does satisfy the belt", async (t) => {
  if (await gateCore(t)) return;
  // F28's cell: "almost certainly" is not this design's standard. A supplier_bill's payable leg
  // IS an AP control leg, and it must still post — otherwise B14 would have quietly become a
  // universal ban on control legs.
  const p = await agentPostable(OWNER(), { client: A1(), amount: 500000, codingKind: "supplier_bill" });
  assert.ok(await controlLegCount(p.args.entry) > 0,
    "c3.B14-coded precondition: the coded bill really carries a control leg");
  const r = await post(p);
  assert.equal(r?.posted, true, `c3.B14-coded: it posts (${JSON.stringify(r?.refusal)})`);
  assert.ok(admits(r.rung_vector, "B14"), "c3.B14-coded: B14 admits a CODED kind's control leg");
});

// ===========================================================================
// The two belts GM-3 moved to Tier D — proven by the LAWFUL shapes posting.
// ===========================================================================

test("f-a2.c3.D-fa an FA ACQUISITION DEBIT posts — the cell that would have gone RED against v4's B12", async (t) => {
  if (await gateCore(t)) return;
  const { upsertFaProfile } = await import("./x41-fa-fixtures.mjs");
  const cost = "150-000";
  await upsertAccountClassed(OWNER(), { client: A2(), code: cost, name: "Motor Vehicles at cost", type: "asset", opKey: opk("c3fa") })
    .catch((e) => noteLane(`c3.D-fa: chart seat (${e.code}: ${e.message})`));
  await upsertFaProfile(OWNER(), { client: A2(), assetAccount: cost, opKey: opk("c3faprof") })
    .catch((e) => noteLane(`c3.D-fa: FA enrolment raised (${e.code}: ${e.message})`));
  // THE PREMISE IS RE-READ, NOT ASSUMED. The enrolment call was wrapped in a catch that only
  // noted the failure, and the cell's own comment admitted the consequence: it would then
  // measure an UNENROLLED account. But the single assertion below — "it posts" — is satisfied
  // by ANY ordinary asset/bank JV with no control leg, enrolled or not, because B12 is cut
  // pre-hook. So the cell could pass without the FA belt ever being in the picture, which is the
  // one thing it exists to prove. The enrolment is now read back from the catalog.
  const enrolled = await rootQuery(
    `select count(*)::int as n from clara.fa_profiles
      where client_id=$1 and asset_account=$2`, [A2(), cost]).catch(() => ({ rows: [{ n: 0 }] }));
  assert.ok(enrolled.rows[0].n >= 1,
    `c3.D-fa precondition: the asset account is REALLY enrolled in the FA register (got ${enrolled.rows[0].n}) — without it this cell measures an unenrolled account and proves nothing about B12`);
  const p = await agentPostable(OWNER(), {
    client: A2(), amount: 500000, codingKind: null,
    lines: genericLines(500000, { debitCode: cost, creditCode: CHART.bank }),
  });
  const r = await post(p);
  assert.equal(r?.posted, true,
    `c3.D-fa: an ordinary FA acquisition debit is a LAWFUL shape and must post. v4's pre-hook B12 refused exactly this (${JSON.stringify(r?.refusal)})`);
});

test("f-a2.c3.D-adv a STAFF-ADVANCE DISBURSEMENT DEBIT posts — the same proof for B13", async (t) => {
  if (await gateCore(t)) return;
  const { enrolStaffAdvanceAccount } = await import("./x42-af2-helpers.mjs");
  const adv = "160-000";
  await upsertAccountClassed(OWNER(), { client: A2(), code: adv, name: "Staff advances", type: "asset", opKey: opk("c3adv") })
    .catch((e) => noteLane(`c3.D-adv: chart seat (${e.code}: ${e.message})`));
  await enrolStaffAdvanceAccount(OWNER(), { client: A2(), accountCode: adv, opKey: opk("c3advenrol") })
    .catch((e) => noteLane(`c3.D-adv: advance enrolment refused (${e.code}: ${e.message}) — precondition unbuilt; the cell measures an UNENROLLED account and says so`));
  const p = await agentPostable(OWNER(), {
    client: A2(), amount: 300000, codingKind: null,
    lines: genericLines(300000, { debitCode: adv, creditCode: CHART.bank }),
  });
  const r = await post(p);
  assert.equal(r?.posted, true,
    `c3.D-adv: an ordinary staff-advance disbursement debit is LAWFUL and must post (${JSON.stringify(r?.refusal)})`);
});

test("f-a2.c3.D-vocab the Tier-D token set is CLOSED, and its two unreachable members are DECLARED, not forced", async (t) => {
  if (await gateCore(t)) return;
  assert.equal(TIER_D_TOKENS.length, 6, "c3.D-vocab: the six belt tokens that left Tier B when B12/B13 were cut");
  for (const tok of TIER_D_DECLARED_UNREACHABLE) {
    assert.ok(TIER_D_TOKENS.includes(tok), `c3.D-vocab: ${tok} is a member of the closed set even though it is unreachable`);
  }
  // Law 31: a wall that can never be asked is DECLARED with its ground, never cell-forced —
  // and never left as an absence either (review law 2). The grounds, recorded here:
  //   advance_mirror_unregistered   — a reversal is not an agent draft under A8.
  //   advance_application_missing   — opening entries are refused at 0037:1781-1786 (CLR31,
  //                                   K-family-only), so the application path is unreachable.
  assert.equal(ADV_MIRROR_AXIS, "unregistered_mirror",
    "c3.D-vocab: B13's token stays SPLIT BY AXIS (M-5) — a record that cannot tell a bad reversal from an unregistered disbursement names a symptom, not a wall");
  noteLane("c3.D-vocab: advance_mirror_unregistered + advance_application_missing are DECLARED-UNREACHABLE rows (law 31), not forced cells — grounds recorded in the cell body");
});

// ===========================================================================
// THE VECTOR CELLS.
// ===========================================================================

test("f-a2.c3.vec-all every rung is EVALUATED even after the first failure", async (t) => {
  if (await gateCore(t)) return;
  // A settlement kind (B1) AND an untied amount (B4) on one entry. A first-fail-wins ladder
  // would report B1 and leave B4 unevaluated; the vector must carry a value for all thirteen.
  const p = await agentPostable(OWNER(), {
    client: A1(), amount: 500000, codingKind: null, lines: supplierLines(499000),
  });
  await stampCodingKind(p.args.entry, "customer_receipt");
  const r = await post(p);
  assertVectorShape(assert, r?.rung_vector, "c3.vec-all");
  assert.ok(nonAdmitting(r.rung_vector).length >= 2,
    `c3.vec-all: BOTH broken rungs are reported, not just the first (non-admitting: ${nonAdmitting(r.rung_vector).join(",")})`);
});

test("f-a2.c3.vec-ne a rung whose INPUTS are absent reports not_evaluable, never pass — the ARM-0 shape", async (t) => {
  if (await gateCore(t)) return;
  // THE ENTRY TIES, and it has to: B4-sales reports `not_evaluable` only when the LUMPED tie
  // holds and the fact side states no tax (0100:553-554's withheld components). With
  // `income + sst = 10605` against a total of 10600 the lumped tie FAILS first and B4 reports
  // `fail`, which is a different verdict from the one this cell exists to force — the arithmetic
  // was a fixture defect, not a rung finding.
  const p = await agentPostable(OWNER(), {
    client: A1(), amount: 10600, net: null, tax: null, rounding: null,
    codingKind: "sales_invoice", lines: salesLines(10600, 10000, 600, 0),
    dropFields: ["invoice.total_excl_tax", "invoice.tax_total"],
  });
  const r = await post(p);
  assertVectorShape(assert, r?.rung_vector, "c3.vec-ne");
  assert.ok(Object.values(r.rung_vector).includes("not_evaluable"),
    `c3.vec-ne: with the components withheld at least one rung is reported DISTINCTLY as not_evaluable (${JSON.stringify(r.rung_vector)})`);
  for (const rung of TIER_B_RUNGS) {
    if (r.rung_vector[rung] === "not_evaluable") {
      assert.ok(!admits(r.rung_vector, rung), `c3.vec-ne: not_evaluable at ${rung} fails admission — it is not a pass`);
    }
  }
});

test("f-a2.c3.vec-empty an EMPTY failing-rung vector is the only thing that posts", async (t) => {
  if (await gateCore(t)) return;
  const clean = await agentPostable(OWNER(), { client: A1() });
  const good = await post(clean);
  assert.equal(admitsAll(good?.rung_vector), true, "c3.vec-empty: the posting entry admits at every rung");
  assert.equal(good?.posted, true, "c3.vec-empty: …and it posts");
  const dirty = await agentPostable(OWNER(), { client: A1(), corroborated: false });
  const bad = await post(dirty);
  assert.equal(admitsAll(bad?.rung_vector), false, "c3.vec-empty: the refusing entry has a non-empty failing-rung vector");
  assert.equal(bad?.posted, false, "c3.vec-empty: …and it does not post");
});

test("f-a2.c3.vec-distinguish at 0/33 corroboration the vector still DISTINGUISHES documents", async (t) => {
  if (await gateCore(t)) return;
  // `0046`'s placed-LAST ordering returns ONE distinct value across an entire uncorroborated
  // corpus and says nothing about B3..B15. The all-rungs vector subsumes it, and that is the
  // instrument §6's per-document measurement needs.
  const a = await agentPostable(OWNER(), { client: A1(), corroborated: false });
  const b = await agentPostable(OWNER(), {
    client: A1(), corroborated: false, codingKind: null, lines: supplierLines(499000),
  });
  await stampCodingKind(b.args.entry, "customer_receipt");
  // BOTH books versions are re-read at post time. Building fixture `b` is a write, so the token
  // `a` captured before it is stale and `a`'s post refuses CLR12 at Tier A — no vector at all,
  // and the cell would fail on the books guard rather than compare two vectors.
  const va = (await post(a, { booksVersion: await booksVersion(A1()) }))?.rung_vector;
  const vb = (await post(b, { booksVersion: await booksVersion(A1()) }))?.rung_vector;
  assert.notEqual(JSON.stringify(va), JSON.stringify(vb),
    `c3.vec-distinguish: two uncorroborated documents with different defects produce DIFFERENT vectors (${JSON.stringify(va)} vs ${JSON.stringify(vb)})`);
});

test("f-a2.c3.vec-homes the vector is durable in BOTH homes — op_receipts for a refusal, entry_post_receipts for a post (M-3)", async (t) => {
  if (await gateCore(t)) return;
  const key = `f-a2-homes:${randomUUID().slice(0, 10)}`;
  const refused = await agentPostable(OWNER(), { client: A1(), corroborated: false });
  const r1 = await post(refused, { opKey: key });
  assert.equal(r1?.posted, false, "c3.vec-homes: the refusal arm refused");
  const stored = await opReceiptResult(refused.cited.firm, key);
  assert.deepEqual(stored?.rung_vector, r1.rung_vector,
    "c3.vec-homes: a REFUSAL's vector is readable from clara.op_receipts — the transaction COMMITS, so the reason is durable");
  const posted = await agentPostable(OWNER(), { client: A1() });
  const r2 = await post(posted);
  assert.equal(r2?.posted, true, "c3.vec-homes: the post arm posted");
  const rc = await postReceiptRow(posted.args.entry);
  assert.deepEqual(rc?.gate_verdicts?.rung_vector, r2.rung_vector,
    "c3.vec-homes: a POST's vector is readable from entry_post_receipts.gate_verdicts");
  assert.ok(String(rc?.gate_verdicts?.extraction_id ?? "").trim().length > 0,
    "c3.vec-homes: …and gate_verdicts carries extraction_id FLATTENED to the top level, non-blank (D24) — the T3 trigger's pin reads it from inside a trigger, where a nested accessor is a silent-NULL hazard");
});

// ===========================================================================
// THE CONSUMER CONTRACT — no frontier gate, because there is no DB surface to gate on.
// These two cells test THIS BATTERY's reading of a vector. They are the cells that break if
// anyone ever writes `vector[r] === 'fail'`.
// ===========================================================================

test("f-a2.c3.vec-producer the PRODUCER obeys D26 too: a missing or json-null rung slot does NOT admit", async (t) => {
  if (await gateCore(t)) return;
  // M-4 EXTENDED TO THE PRODUCER, and it was a real fail-open. The core's admission count read
  // `jsonb_each_text(v_vector) where v <> 'pass'`, which is blind twice: a MISSING key is not a
  // row at all, and a JSON-null value yields SQL NULL, so `NULL <> 'pass'` is NULL and the row is
  // not counted. Either shape would have POSTED — the exact defect the consumer contract exists
  // to forbid, on the side that MINTS the vector.
  //
  // WHY THIS CELL MEASURES THE PREDICATE RATHER THAN FORCING THE SHAPE END TO END, stated
  // instead of quietly narrowed: every rung's `case` carries an `else`, so no reachable input
  // makes the ladder emit a missing or null slot — which is exactly why the count must be
  // roster-driven by construction and cannot be proven by driving the door. So the cell does the
  // two things that ARE provable: it reads the shipped body and asserts the count walks the
  // closed roster, and it EXECUTES the shipped predicate against both fail-open shapes on the
  // live database, with a positive control so a green cannot come from a predicate that counts
  // everything.
  const src = await bodyOfName("_agent_post_entry_core");
  assert.ok(src?.src, "c3.vec-producer: the ungranted core resolves");
  assert.ok(src.src.includes("unnest(v_rungs) r where coalesce(v_vector->>r"),
    "c3.vec-producer: the Tier-B admission count walks the CLOSED rung roster, so an absent key is counted");
  assert.ok(!src.src.includes("jsonb_each_text(v_vector)"),
    "c3.vec-producer: …and the key-driven form is GONE — it could not see an absent key at all");
  // THE PREDICATE IS EXTRACTED FROM THE SHIPPED BODY, NOT RETYPED. The first cut executed a
  // hand-written copy of the expression that lives beside the string-match above — so the four
  // controls below proved properties of the TEST'S duplicate, and any divergence between the
  // copy and the core (or an inert matching string somewhere else in the body) left this cell
  // green regardless of what `_agent_post_entry_core` actually does. That is law 3: a
  // re-implementation is a projection of the predicate, not the predicate.
  //
  // Pulling the WHERE clause out of `prosrc` and binding the vector into it means the SQL
  // executed here is the SQL the core executes, character for character. If the shipped form
  // changes shape, this changes with it or fails to extract — both loud.
  const m = /from\s+unnest\(v_rungs\)\s+r\s+where\s+([^;]+);/i.exec(src.src);
  assert.ok(m,
    "c3.vec-producer: the admission-count predicate was EXTRACTED from the shipped body — a cell that cannot find it must not fall back to a hand-written copy");
  const predicate = m[1].replace(/v_vector/g, "($2::jsonb)");
  noteLane(`c3.vec-producer: executing the SHIPPED predicate verbatim — where ${predicate.trim()}`);
  const count = async (vector) => (await rootQuery(
    `select count(*)::int as n from unnest($1::text[]) r where ${predicate}`,
    [TIER_B_RUNGS, JSON.stringify(vector)])).rows[0].n;
  const all = Object.fromEntries(TIER_B_RUNGS.map((r) => [r, "pass"]));
  assert.equal(await count(all), 0,
    "c3.vec-producer POSITIVE CONTROL: a complete all-pass vector counts ZERO failing rungs — otherwise every assertion below is vacuous");
  const missing = { ...all }; delete missing.B7;
  assert.equal(await count(missing), 1,
    "c3.vec-producer: a MISSING rung slot counts as failing — the producer cannot admit what it never evaluated");
  assert.equal(await count({ ...all, B7: null }), 1,
    "c3.vec-producer: a JSON-NULL rung slot counts as failing — `NULL <> 'pass'` is NULL, and the coalesce is what stops that reading as an admission");
  assert.equal(await count({ ...all, B7: "maybe" }), 1,
    "c3.vec-producer: an UNKNOWN value counts as failing — the same law M-4 binds the consumer to");
});

test("f-a2.c3.vec-doctored a doctored vector carrying an UNKNOWN value does not admit (M-4)", () => {
  const base = Object.fromEntries(TIER_B_RUNGS.map((r) => [r, "pass"]));
  assert.equal(admitsAll(base), true, "c3.vec-doctored: the all-pass control admits");
  for (const unknown of ["maybe", "PASS", "", null, undefined, 1, true, "not_evaluable", "fail"]) {
    const doctored = { ...base, B7: unknown };
    assert.equal(admits(doctored, "B7"), false,
      `c3.vec-doctored: ${JSON.stringify(unknown)} at B7 is NON-ADMITTING. A consumer written as vector[r]==='fail' would ADMIT it — which is how a rung added later silently starts passing`);
    assert.equal(admitsAll(doctored), false, `c3.vec-doctored: …and the whole vector therefore does not admit (${JSON.stringify(unknown)})`);
  }
  const missing = { ...base };
  delete missing.B15;
  assert.equal(admitsAll(missing), false,
    "c3.vec-doctored: a MISSING key is non-admitting too — the exact shape a newly-added rung takes on an old consumer");
});

test("f-a2.c3.vec-consumer the battery's own reader never tests for 'fail' — the design law, self-applied", async () => {
  const { readFileSync, readdirSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const here = fileURLToPath(new URL(".", import.meta.url));
  // The corpus is DISCOVERED, not listed: a hand-written list is the shape a new battery file
  // slips past, and this scan exists precisely to catch a new consumer written the wrong way.
  const files = readdirSync(here).filter((f) => /^f-a2-.*\.mjs$/.test(f));
  assert.ok(files.length >= 6, `c3.vec-consumer: the scan found ${files.length} f-a2 modules — a corpus that shrank is itself a finding`);
  const offenders = [];
  for (const f of files) {
    let src = "";
    try { src = readFileSync(here + f, "utf8"); } catch { continue; }
    // SCAN CODE, NOT PROSE. The naive regex over raw source flags this file's own header, its
    // own assertion messages and the doctored-vector list — five hits, none of them a consumer.
    // A census that cannot tell a mention from a comparison trains the next author to write
    // worse comments, so the source is projected to CODE ONLY first: comments and string
    // literals are blanked (length-preserving, so line numbers survive) and the comparison is
    // matched against what is left.
    const code = codeOnly(src);
    for (const m of code.matchAll(/[=!]==?\s*["']fail["']|["']fail["']\s*[=!]==?|assert\.(?:equal|strictEqual)\([^;]{0,120}?,\s*["']fail["']/g)) {
      offenders.push(`${f}:${code.slice(0, m.index).split("\n").length}`);
    }
  }
  // `f-a2-ladder-2.test.mjs` asserts `rung_vector.B1 === 'fail'` deliberately, and it is the ONE
  // lawful use: that cell proves the rung was EVALUATED and failed rather than being unreadable
  // — a claim about the PRODUCER's honesty, not an admission test. It is named here so a future
  // addition cannot hide behind it.
  const sanctioned = offenders.filter((o) => o.startsWith("f-a2-ladder-2.test.mjs"));
  const unsanctioned = offenders.filter((o) => !sanctioned.includes(o));
  assert.deepEqual(unsanctioned, [],
    `c3.vec-consumer: no consumer may test vector[r]==='fail' (design §3.2's consumer contract). Unsanctioned sites: ${unsanctioned.join(", ")}`);
  assert.ok(sanctioned.length <= 2,
    `c3.vec-consumer: the sanctioned producer-honesty assertions stay few and named (found ${sanctioned.join(", ")})`);
  // POSITIVE CONTROL: the projection must still be able to SEE a comparison. Without this the
  // cell's green is indistinguishable from a scanner that blanked everything.
  assert.equal(codeOnly("const a = x === 'fail'; // x === 'fail'\n").match(/=== ?'fail'/g)?.length, 1,
    "c3.vec-consumer POSITIVE CONTROL: codeOnly keeps the code comparison and drops the commented one");
});

/**
 * Project source to CODE ONLY, length- and newline-preserving so a match index still maps to the
 * original line. Comments are blanked whole; a string literal is blanked UNLESS its content is
 * exactly `fail` — which is the one literal this scan has to be able to see. That asymmetry is
 * the whole trick: `x === 'fail'` survives, while an assertion MESSAGE that quotes the forbidden
 * shape ("a consumer written as vector[r]==='fail' would admit it") is erased along with every
 * other piece of prose. Deliberately small — it does not need to be a JavaScript parser, only to
 * stop prose from reading as code.
 */
// The sentinel is BOUND rather than written inline, because the scanner would otherwise flag its
// own comparison — an assignment is not a comparison, so `= FAIL_LITERAL` reads as code the scan
// is not looking for. Named, not obfuscated: the point is that this line is a scanner internal,
// not a consumer, and the next reader can see that at a glance.
const FAIL_LITERAL = "fail";

function codeOnly(src) {
  const out = src.split("");
  let i = 0;
  const blank = (from, to) => { for (let k = from; k < to; k++) if (out[k] !== "\n") out[k] = " "; };
  while (i < src.length) {
    const c = src[i]; const d = src[i + 1];
    if (c === "/" && d === "/") { let j = src.indexOf("\n", i); if (j < 0) j = src.length; blank(i, j); i = j; continue; }
    if (c === "/" && d === "*") { let j = src.indexOf("*/", i + 2); j = j < 0 ? src.length : j + 2; blank(i, j); i = j; continue; }
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < src.length) {
        if (src[j] === "\\") { j += 2; continue; }
        if (src[j] === c) { j += 1; break; }
        j += 1;
      }
      if (src.slice(i + 1, j - 1) !== FAIL_LITERAL) blank(i + 1, Math.max(j - 1, i + 1));
      i = j; continue;
    }
    i += 1;
  }
  return out.join("");
}
