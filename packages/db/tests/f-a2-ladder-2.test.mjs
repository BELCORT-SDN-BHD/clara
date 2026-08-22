// F-A2 PR-1 — THE LADDER, part 2: Annex C.3's Tier-B rungs B1 through B6, including GM-1's
// B4 DIFFERENTIAL TRIO. Part 1 is f-a2-ladder.test.mjs (C.1/C.2); part 3 is
// f-a2-ladder-3.test.mjs (B7-B15, the Tier-D-cut belts, the vector cells); part 4 is
// f-a2-ladder-4.test.mjs (C.4/C.5).
//
// CONTRACT-BLIND, frontier-gated on the `f_a2_posting_core$` stem. See part 1's header.
//
// THE B4 TRIO IS THE POINT OF THIS FILE, and it is written to be DIFFERENTIAL rather than
// self-referential (GM-1). v4 derived B4-sales against `0016:2100-2111`, a body superseded
// seventy migrations ago; the live floor `0022:714-930` SUBTRACTS the rounding leg from its
// income tie. So `income + tax = total_cents` is arithmetically false on any rounding invoice,
// in BOTH signs, and B4 would contradict B11 with no journal satisfying both. The trio's first
// cell builds exactly that journal — a printed-rounding sales invoice — and asserts BOTH rungs
// admit it. It goes RED against v4's formula, which is the whole finding.
//
// THE ROUNDING VALUE IS A FACT-SIDE VALUE AND NOTHING ELSE. Annex I: `rounding_cents` is taken
// from the witness facts, NEVER from the entry's own rounding leg — an entry may not supply its
// own slack, or the tie becomes self-certifying. The fixtures below state it on the fact side
// and let the entry carry the matching leg; the absent-fact twin breaks exactly that link.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  endPool, buildWorld, printLaneNotes, printSkipCount, noteLane,
  booksVersion, entryRow, postingCoreReady,
  gateCore, wakePostEntry, agentPostable, admits, admitsAll, nonAdmitting,
  assertVectorShape, assertNonAdmitting,
  salesLines, supplierLines, genericLines,
  unwitnessedFiling, ensureChart, autodraftCred, agentDraft, ev, witnessedFiling,
  stampCodingKind, doctorFlags,
  witnessRegion, rootQuery, doctorLines,
} from "./f-a2-post-world.mjs";

let world = null;
before(async () => { if (await postingCoreReady()) world = await buildWorld(); });
after(async () => {
  printLaneNotes("f-a2-ladder-2");
  printSkipCount("f-a2-ladder-2");
  await endPool();
});

const A1 = () => world.clients.A1;
const A2 = () => world.clients.A2;
const OWNER = () => world.users.alice;
const post = (p, over = {}) => wakePostEntry(p.cred, { ...p.args, ...over });

// ===========================================================================
// B1 — settlement kinds are HUMAN until F-A3 (WCA-R6; finding 6).
// ===========================================================================

test("f-a2.c3.B1 an agent SETTLEMENT post refuses with the rung named — both kinds", async (t) => {
  if (await gateCore(t)) return;
  // THE FIXTURE ROUTE, and it is a rig-replay finding rather than a preference: passing
  // `p_coding_kind => 'customer_receipt'` to `wake_draft_entry` is refused CLR10 "unsupported
  // coding kind" — the DRAFT floor does not mint settlement kinds, they arrive from the bank
  // lane. So the entry is drafted generic and the kind STAMPED afterwards (the a21
  // `stampCodingKind` idiom), which is the only way to put a settlement-kinded AGENT draft in
  // front of B1. That the draft floor is a stronger wall today is worth knowing and is NOT what
  // B1 asserts: B1 has to hold when F-A3 makes those kinds draftable.
  for (const kind of ["customer_receipt", "supplier_payment"]) {
    const p = await agentPostable(OWNER(), { client: A1(), codingKind: null, lines: genericLines(500000) });
    await stampCodingKind(p.args.entry, kind);
    assert.equal((await entryRow(p.args.entry))?.coding_kind, kind,
      `c3.B1 ${kind} precondition: the agent draft really carries the settlement kind`);
    const r = await post(p);
    assertNonAdmitting(assert, r, "B1", `c3.B1 ${kind}`);
    assert.equal(r.rung_vector.B1, "fail",
      `c3.B1 ${kind}: the rung is EVALUATED and fails — not 'not_evaluable', which would mean the kind was unreadable`);
    assert.equal(r.refusal.reason, "settlement_kind_human",
      `c3.B1 ${kind}: B1 is the FIRST rung, so it is the reason the receipt names`);
  }
  noteLane("c3.B1: B1 makes the two deferred settlement shape floors (0037:674, 0037:680) unreachable — §D.1's disposition for both");
});

// ===========================================================================
// B2 — corroboration. The gate that today does not block anything (finding 1).
// ===========================================================================

test("f-a2.c3.B2-neg an UNCORROBORATED document refuses not_corroborated", async (t) => {
  if (await gateCore(t)) return;
  const p = await agentPostable(OWNER(), { client: A1(), corroborated: false });
  const r = await post(p);
  assertNonAdmitting(assert, r, "B2", "c3.B2-neg");
  assert.equal(r.verdict?.corroborated, false,
    "c3.B2-neg: the verdict block records what the DB SAW, not what the model claimed (law 27(2))");
});

test("f-a2.c3.B2-pos a CORROBORATED document DOES post — the §6 gating cell", async (t) => {
  if (await gateCore(t)) return;
  const p = await agentPostable(OWNER(), { client: A1() });
  const r = await post(p);
  assert.equal(r?.posted, true,
    `c3.B2-pos: without this cell the battery reports a SAFE ZERO indistinguishable from a broken build (C.17(1)). Refusal was ${JSON.stringify(r?.refusal)}, non-admitting ${nonAdmitting(r?.rung_vector).join(",")}`);
  assert.equal(r.verdict?.corroborated, true, "c3.B2-pos: …and the verdict says the DB saw corroboration");
  assert.ok(admits(r.rung_vector, "B2"), "c3.B2-pos: B2 admits");
});

test("f-a2.c3.B2-absent a '{}'-shaped or ABSENT fact state refuses — absence IS the refusal", async (t) => {
  if (await gateCore(t)) return;
  // No witness pair at all. Law 2 in its structural form: an absent fact state must fall through
  // to the fail-closed branch, never be read as "nothing contradicted, therefore corroborated".
  //
  // THE CODING KIND IS THE GENERIC LANE, and it is forced rather than chosen (F-A2 PR-1, D11).
  // A document with NO fact generation has no readable direction -- `_document_direction` raises
  // CLR30 and the tri-state answers `unresolved` -- and the draft core's direction-family arm,
  // re-cut to bind every agent lane rather than only the autodraft wake kind, refuses a
  // DIRECTIONAL coding kind on it one door before the ladder. `unresolved` is precisely the
  // shape B15 ADMITS, so the generic lane is the lawful way to put an absent fact state in
  // front of B2 -- and B2 is kind-blind, so the claim is untouched.
  await ensureChart(OWNER(), A1());
  const cited = await unwitnessedFiling(OWNER(), { client: A1(), gross: 500000 });
  const cred = await autodraftCred(A1());
  const d = await agentDraft(OWNER(), cred, {
    client: A1(), cited, codingKind: null, lines: genericLines(500000),
  });
  const r = await wakePostEntry(cred, {
    entry: d.entry_id, expectedRevision: d.revision_token, client: A1(), booksVersion: await booksVersion(A1()),
  });
  assertNonAdmitting(assert, r, "B2", "c3.B2-absent");
  assert.notEqual(r.rung_vector.B2, "pass",
    "c3.B2-absent: an absent fact state is never a pass — that is the ARM-0 defect wearing an accounting hat");
});

// ===========================================================================
// B3 — the anchor must be BOUND.
// ===========================================================================

test("f-a2.c3.B3 an UNBOUND anchor refuses anchor_unbound", async (t) => {
  if (await gateCore(t)) return;
  // THE FIXTURE IS THE FINDING. The obvious construction — cite a region on a DIFFERENT
  // document — cannot be built: `_bind_evidence` resolves the cited region with
  // `de.document_id = p_document` and refuses CLR21 `evidence_invalid` when it does not match
  // (`0009:441-450`). The draft floor is a STRONGER wall than B3 there, not a weaker one, and a
  // cell that swallowed that raise in a try/catch would be reporting a fixture gap as a rung.
  //
  // The lawful input is an entry whose evidence BINDS but whose bound rows carry no VERIFIED
  // total: `_bind_evidence` stamps `verified` only when the state is corroborated AND the field
  // is `invoice.total` AND the cited cents equal the anchor (`0009:462-466`), so citing the TAX
  // region binds real evidence and leaves `_corroboration_bound(entry, total_cents)` with
  // nothing to find. B3 and B7 share that fixture, which is why both cells use the LOOSE
  // non-admission assertion rather than claiming rung isolation they do not have.
  //
  // AND THE LANE IS GENERIC, forced by N1 (F-A2 PR-1, design 3.4). The shape floors now run at
  // the DRAFT door on the agent lane, and a CORROBORATED `supplier_bill` cannot be drafted
  // without citing its own total: `_draft_entry_core` raises CLR21 `evidence_invalid`
  // ("corroborated total is not bound by evidence") on exactly the shape this cell needs, and
  // the supplier floor's tax-leg rule raises CLR21 `tax_leg_missing` on a document stating a
  // nonzero tax. Both are STRONGER walls than B3, and both would mask it. A NULL coding kind
  // skips both -- `_corroboration_bound` is what B3 reads and it is kind-blind -- so the fixture
  // keeps its whole shape (a corroborated document, evidence that BINDS, no verified total row)
  // and changes only the kind. B15 is unavoidably non-admitting on a generic entry anchored to
  // a directional document, which is why this cell keeps the LOOSE assertion it already had.
  await ensureChart(OWNER(), A1());
  const cited = await witnessedFiling(OWNER(), { client: A1(), gross: 10600, net: 10000, tax: 605 });
  const tax = await witnessRegion(cited.documentId, "invoice.tax_total");
  assert.ok(tax?.id, "c3.B3 precondition: the witness text extraction carries a tax region to cite");
  const cred = await autodraftCred(A1());
  const d = await agentDraft(OWNER(), cred, {
    client: A1(), cited, codingKind: null, lines: genericLines(10600),
    evidence: [ev(tax.id, tax.text_content, "invoice.tax_total")],
  });
  const bound = await rootQuery(
    "select count(*)::int as n from clara.entry_evidence where entry_id=$1 and provenance_tier='verified'",
    [d.entry_id]);
  assert.equal(bound.rows[0].n, 0,
    "c3.B3 precondition: the entry binds evidence but NO verified total row — which is exactly what _corroboration_bound reads");
  const r = await wakePostEntry(cred, {
    entry: d.entry_id, expectedRevision: d.revision_token, client: A1(), booksVersion: await booksVersion(A1()),
  });
  assertNonAdmitting(assert, r, "B3", "c3.B3 unbound anchor");
  assert.ok(!admits(r?.rung_vector, "B3"), "c3.B3: the anchor rung does not admit");
});

// ===========================================================================
// B4 — the amount ties, PER KIND (Annex I). GM-1's differential trio first.
// ===========================================================================

test("f-a2.c3.B4a a PRINTED-ROUNDING sales invoice is admitted by BOTH B4 and B11 — the differential cell", async (t) => {
  if (await gateCore(t)) return;
  // total 10600 · net 10000 · tax 605 · fact-side rounding −5.
  //   receivable      = 10600                            = total_cents            ✓ (tie 1)
  //   income + tax    = 10000 + 605 = 10605 = 10600 − (−5) = total − rounding      ✓ (tie 2)
  // v4's `income + tax = total_cents` reads 10605 = 10600 and is FALSE — this cell is the one
  // that goes RED against it, and no journal satisfies both v4's B4 and the live B11.
  const p = await agentPostable(OWNER(), {
    client: A1(), amount: 10600, net: 10000, tax: 605, rounding: -5,
    codingKind: "sales_invoice", lines: salesLines(10600, 10000, 605, -5),
  });
  const r = await post(p);
  assert.ok(admits(r?.rung_vector, "B4"),
    `c3.B4a: B4-sales ADMITS the printed-rounding invoice (got ${JSON.stringify(r?.rung_vector?.B4)}; non-admitting ${nonAdmitting(r?.rung_vector).join(",")})`);
  assert.ok(admits(r?.rung_vector, "B11"),
    `c3.B4a: B11 — which calls the live sales floor — admits the SAME entry (got ${JSON.stringify(r?.rung_vector?.B11)}). A disagreement here is the GM-1 contradiction`);
  assert.equal(r?.posted, true, `c3.B4a: and it POSTS (${JSON.stringify(r?.refusal)})`);
});

test("f-a2.c3.B4b the NIL-TAX rounding twin ties identically — the tie is tax-independent", async (t) => {
  if (await gateCore(t)) return;
  // total 10600 · net 10605 · tax 0 · fact-side rounding −5. Rounding is sanctioned estate-wide
  // and is tax-independent (0022:919-924), so a nil-tax cash invoice breaks the old formula the
  // same way. If this cell needed a different formula from B4a, the tie would be tax-coupled.
  const p = await agentPostable(OWNER(), {
    client: A1(), amount: 10600, net: 10605, tax: 0, rounding: -5,
    codingKind: "sales_invoice", lines: salesLines(10600, 10605, 0, -5),
  });
  const r = await post(p);
  assert.ok(admits(r?.rung_vector, "B4"),
    `c3.B4b: the nil-tax twin ties on the SAME formula (got ${JSON.stringify(r?.rung_vector?.B4)})`);
  assert.ok(admits(r?.rung_vector, "B11"), "c3.B4b: …and the live sales floor agrees");
});

test("f-a2.c3.B4c the ABSENT-FACT twin reports not_evaluable, NEVER pass — and a fabricated sst_output does not admit", async (t) => {
  if (await gateCore(t)) return;
  // RE-CUT AT AUTHORING, and the reason is worth reading rather than a silent narrowing. C.3
  // names this twin "no `rounding_cents` on the fact side", but Annex I's own formula is
  // `income + tax = total_cents − COALESCE(rounding_cents, 0)` — an ABSENT rounding is therefore
  // evaluable BY THE FORMULA'S OWN TEXT, not not_evaluable. And measured on the rig, that shape
  // cannot even be built as a CORROBORATED document: the witness predicate's six-term identity
  // refuses a page stating total 10600 with net 10000 + tax 605 and rounding not printed, so the
  // twin would refuse at B2 and prove nothing about B4.
  //
  // GM-2's actual not_evaluable case is the one Annex I states in words: where the NIL-TAX ARM
  // WITHHOLDS `total_excl_tax_cents` / `tax_total_cents` (`0100:553-554`), ties 2/3/4 of the live
  // floor skip. That is the shape below, and it is also the shape that carries the second half of
  // the cell — so the twin is ONE fixture with both claims rather than two, and the difference
  // from C.3's wording is recorded here rather than papered over.
  const fabricated = await agentPostable(OWNER(), {
    client: A1(), amount: 10600, net: null, tax: null, rounding: null,
    codingKind: "sales_invoice", lines: salesLines(10600, 9000, 1600, 0),
    dropFields: ["invoice.total_excl_tax", "invoice.tax_total"],
  });
  const r = await post(fabricated);
  assert.notEqual(r?.rung_vector?.B4, "pass",
    "c3.B4c: with the components withheld the tie is NOT a pass — a lumped pass there would be the ARM-0 defect wearing an accounting hat");
  assert.equal(r?.rung_vector?.B4, "not_evaluable",
    `c3.B4c: …it is reported DISTINCTLY as not_evaluable (got ${JSON.stringify(r?.rung_vector?.B4)}), which fails admission AND says why`);
  // The FABRICATED sst_output half: 9000 + 1600 ties to 10600 under a LUMPED tie, which is the
  // exact shape `0046:1092`'s `account_mismatch` rung caught. That rung retires with the executor
  // and B4's component tie is its NAMED successor (B.1) — so this entry must be REFUSED.
  assert.equal(r?.posted, false,
    `c3.B4c: …and the fabricated output-SST split is REFUSED, not admitted (${JSON.stringify(r?.refusal)})`);
});

test("f-a2.c3.B4-supplier the supplier tie is payable credit = expense debit = total_cents", async (t) => {
  if (await gateCore(t)) return;
  const ok = await agentPostable(OWNER(), { client: A1(), amount: 500000, codingKind: "supplier_bill" });
  assert.ok(admits((await post(ok))?.rung_vector, "B4"), "c3.B4-supplier: the tying bill admits");
  // THE UNTIED HALF IS DOCTORED, and N1 is why (F-A2 PR-1, design 3.4). The shape floors run at
  // the DRAFT door on the agent lane now, and the supplier floor's verified-total tie refuses a
  // non-tying bill CLR23 before it can become a draft -- a STRONGER wall than B4, and one that
  // would leave this cell with no entry to post. So the bill is drafted TYING and doctored
  // afterwards, which is `doctorLines`' whole reason for existing. The token it returns is not
  // optional: `t_jl_rotate_token` rotates on any line change, and reusing the pre-doctoring one
  // would refuse at A5 and report a revision failure where the cell meant to test a tie.
  const bad = await agentPostable(OWNER(), { client: A1(), amount: 500000, codingKind: "supplier_bill" });
  const doctored = await doctorLines(bad.args.entry, supplierLines(499000));
  assert.equal(doctored.ok, true, `c3.B4-supplier: the untying doctor landed (${doctored.code}: ${doctored.message})`);
  assertNonAdmitting(assert, await post(bad, { expectedRevision: doctored.revisionToken }), "B4", "c3.B4-supplier untied");
});

test("f-a2.c3.B4-generic the generic tie is sum(debit_cents) = total_cents — the weakest honest anchor", async (t) => {
  if (await gateCore(t)) return;
  const ok = await agentPostable(OWNER(), {
    client: A1(), amount: 500000, codingKind: null, lines: genericLines(500000),
  });
  assert.ok(admits((await post(ok))?.rung_vector, "B4"),
    "c3.B4-generic: a document-anchored generic JV ties on its own total");
  // OQ-5's named cost, made a cell rather than an assumption: a generic JV whose amount is NOT
  // the document total — a payslip split across several entries, a partial accrual — cannot tie
  // and lands as a draft. The alternative is no anchor at all (0046:1128-1140).
  const split = await agentPostable(OWNER(), {
    client: A1(), amount: 500000, codingKind: null, lines: genericLines(200000),
  });
  assertNonAdmitting(assert, await post(split), "B4", "c3.B4-generic partial");
  noteLane("c3.B4-generic: OQ-5 population 1 — untieable generic JVs land as drafts; §6 measures the residue");
});

test("f-a2.c3.B4-creditnote a credit note may NOT tie by absolute value — the sign mirror is load-bearing", async (t) => {
  if (await gateCore(t)) return;
  // MEASURED ON THE RIG: a `type_code='02'` page does not corroborate under the current witness
  // predicate, so the POSITIVE half (a sign-mirrored CN admitting at B4) cannot be built here and
  // is left to the corpus run, which has real credit notes. What IS assertable — and is the
  // load-bearing half of Annex I's sentence — is the NEGATIVE: an un-mirrored entry, which ties
  // only by absolute value, must not admit. A cell that asserted the positive half against an
  // uncorroborated fixture would be green on B2's refusal and say nothing about B4.
  const unmirrored = await agentPostable(OWNER(), {
    client: A1(), amount: 10600, net: 10000, tax: 605, rounding: -5, typeCode: "02", kind: "credit_note",
    codingKind: "sales_credit_note", lines: salesLines(10600, 10000, 605, -5),
  });
  const r = await post(unmirrored);
  assert.equal(r?.posted, false, "c3.B4-cn: an un-mirrored credit note does not post");
  assert.ok(!admits(r?.rung_vector, "B4") || !admits(r?.rung_vector, "B11"),
    `c3.B4-cn: and it does not admit at the tie or at the sales floor — the sign mirror is what keeps a credit note from tying by absolute value (${JSON.stringify(r?.rung_vector)})`);
  noteLane("c3.B4-cn: the POSITIVE half (a sign-mirrored CN admitting at B4) needs a corroborating type_code='02' page, which the current witness predicate does not produce on the rig — it is carried by §6's corpus run instead. `creditNoteLines` stays exported for that run");
});

// ===========================================================================
// B5 / B6 — the two human-judgement walls.
// ===========================================================================

test("f-a2.c3.B5 an amount_exception WITHOUT an amount_override refuses amount_conflict", async (t) => {
  if (await gateCore(t)) return;
  // THE STAMP IS EARNED, NOT ASKED FOR. Passing `flags: {amount_exception: true}` to the
  // draft writer does nothing — the core COMPUTES the exception when the proposed legs diverge
  // from the machine-corroborated total (`0009:1361-1367`) and writes its own structured
  // value. So the fixture diverges the legs and lets the estate stamp it. B4 is unavoidably
  // non-admitting too, which is why this cell uses the LOOSE assertion.
  const p = await agentPostable(OWNER(), {
    client: A1(), amount: 500000, codingKind: "supplier_bill", lines: supplierLines(499000),
  });
  const row = await entryRow(p.args.entry);
  assert.ok(row?.flags && "amount_exception" in row.flags,
    `c3.B5 precondition: the core stamped amount_exception (flags were ${JSON.stringify(row?.flags)})`);
  assert.ok(!("amount_override" in (row.flags ?? {})), "c3.B5 precondition: …and no amount_override");
  assertNonAdmitting(assert, await post(p), "B5", "c3.B5");
});

test("f-a2.c3.B6 BOTH override flags refuse human_override_present — the twins", async (t) => {
  if (await gateCore(t)) return;
  // THE OVERRIDE HAS TO ARRIVE WITHOUT A HUMAN EDITOR, and that is the whole reason this cell
  // doctors the flags instead of calling `revise_entry`. Every lawful override comes through
  // that writer, which ALSO stamps `last_human_editor` — and A8 refuses on that first, so a
  // revise-built fixture would prove A8 twice and B6 never. Doctoring isolates the one rung.
  for (const flag of ["amount_override", "duplicate_override"]) {
    const p = await agentPostable(OWNER(), { client: A2() });
    const d = await doctorFlags(p.args.entry, { [flag]: { reason: `c3.B6 rig ${flag}` } });
    assert.ok(d.ok, `c3.B6 (${flag}): the flag was stamped (${d.code}: ${d.message})`);
    const row = await entryRow(p.args.entry);
    assert.ok(row?.flags && flag in row.flags, `c3.B6 precondition (${flag}): the draft carries it`);
    assert.equal(row?.last_human_editor, null,
      `c3.B6 precondition (${flag}): …and NO human editor, so A8 cannot be what refuses`);
    assertNonAdmitting(assert, await post(p), "B6", `c3.B6 ${flag}`);
  }
  // …and the agent lane's own drafts pass `'{}'` flags, so the clean control still admits.
  const clean = await agentPostable(OWNER(), { client: A2() });
  const r = await post(clean);
  assert.ok(admits(r?.rung_vector, "B6"), "c3.B6: an entry with no override flag admits at B6");
  assertVectorShape(assert, r?.rung_vector, "c3.B6 control");
  assert.ok(admitsAll(r?.rung_vector) === (r?.posted === true),
    `c3.B6 control: posting and an all-admitting vector are the SAME condition — an empty failing-rung vector is the only thing that posts (posted=${r?.posted}, non-admitting=${nonAdmitting(r?.rung_vector).join(",")})`);
});
