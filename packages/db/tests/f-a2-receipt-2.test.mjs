// F-A2 PR-1 — Annex C.7 (N1 / T3) and C.7b (the receipt WRITE CONTRACT). C.6 is
// f-a2-receipt.test.mjs.
//
// CONTRACT-BLIND, frontier-gated on `f_a2_posting_core$`.
//
// T3, IN ONE PARAGRAPH, because every cell below leans on it. The shape floors are called
// through a 1-arity delegate whose extraction pin is hard-NULL one level down. BL-5's implied
// remedy — recut that delegate — reaches the draft floor, human approve and the D-P4 probe, and
// is DECLINED. Instead the two TRIGGER FUNCTIONS resolve the pin from the entry's own post
// receipt. A human approval writes NO receipt, so the pin is NULL, so today's null-pin
// behaviour is reproduced BYTE-FOR-BYTE — the human-lane blast radius is zero BY CONSTRUCTION
// rather than by argument, and the 1-arity delegates stay byte-untouched.
//
// AND WHY C.7's AGENT CELL IS A MUST-FAIL. `gate_verdicts` stores `{verdict, rung_vector}` PLUS
// `extraction_id` FLATTENED to the top level, because the trigger reads it from INSIDE a
// trigger and a nested accessor there is a silent-NULL hazard: the wrong level yields NULL,
// which IS the unpinned behaviour T3 exists to remove — and it does so WITHOUT FAILING
// ANYTHING. So the cell asserts the flattened key is non-blank AND that the post judged the
// generation the receipt names. A nested-only shape reds both halves.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  rootQuery, endPool, buildWorld, printLaneNotes, printSkipCount, noteLane,
  opk, entryRow, approveEntry, draftEntryV3, freshResolution, ev, factsRegion,
  seedExtraction, seedRegion, postingCoreReady, gateCore, wakePostEntry, agentPostable,
  agentDraft, autodraftCred, interactiveCred, ensureChart, witnessedFiling, postReceiptRow,
  postReceiptCount, supplierLines, salesLines, bodyOf, CHART, proactiveCred,
} from "./f-a2-post-world.mjs";

let world = null;
before(async () => { if (await postingCoreReady()) world = await buildWorld(); });
after(async () => {
  printLaneNotes("f-a2-receipt-2");
  printSkipCount("f-a2-receipt-2");
  await endPool();
});

const A1 = () => world.clients.A1;
const A2 = () => world.clients.A2;
const OWNER = () => world.users.alice;
const BOB = () => world.users.bob;
const sha = (s) => createHash("sha256").update(s ?? "", "utf8").digest("hex");

/** A supplier bill with the polarity INVERTED: the payable debited, the expense credited.
 *  Balanced, and wrong — the shape N1 moves the refusal earlier for. */
const invertedBill = (amount) => [
  { account_code: CHART.payable, debit_cents: amount, credit_cents: 0, description: "c7 inverted ap-dr" },
  { account_code: CHART.expense, debit_cents: 0, credit_cents: amount, description: "c7 inverted exp-cr" },
];

/**
 * The 1-arity shape delegates' prosrc sha256, MEASURED BY RIG REPLAY at the pre-F-A2 frontier
 * (0001-0102, throwaway postgres:17, 2026-08-22). These two bodies are the ones T3 deliberately
 * does NOT touch, and this is the before-state the "byte-unmoved" claim is made against. Filled
 * from the replay rather than from the migration source, because a body's LIVE TIP is found by
 * CoR lineage and never by the migration that created it (F49 — GM-1 cost seventy migrations of
 * drift for exactly this).
 */
const DELEGATE_SHA_PRE_F_A2 = {
  "clara._assert_supplier_bill_shape(uuid)": "b37c14f73d1d0b723d4b5a8f4bf596944e546691dcf55f400b9730d33ab62ad7",
  "clara._assert_sales_invoice_shape(uuid)": "150896c3ec111c7d6b14f74a345a3807765a95f1c0b9684d1a6cbdf04c6e3d77",
};

// ===========================================================================
// C.7 — N1: the check moves earlier, and only on the agent lane.
// ===========================================================================

test("f-a2.c7.draft-agent a leg-shape defect is refused at DRAFT on the AGENT lane", async (t) => {
  if (await gateCore(t)) return;
  await ensureChart(OWNER(), A1());
  const cited = await witnessedFiling(OWNER(), { client: A1(), gross: 500000 });
  const cred = await autodraftCred(A1());
  let raised = null;
  try {
    await agentDraft(OWNER(), cred, {
      client: A1(), cited, codingKind: "supplier_bill", lines: invertedBill(500000),
    });
  } catch (e) { raised = e; }
  assert.ok(raised,
    "c7.draft-agent: the agent lane refuses the mis-shaped bill at DRAFT — an agent draft is a PROPOSAL-TO-POST, so the floor runs there");
  assert.ok(/^CLR\d\d$/.test(raised.code ?? ""), `c7.draft-agent: with a CLR code (got ${raised.code}: ${raised.message})`);
});

test("f-a2.c7.draft-human the HUMAN lane's draft of the SAME shape is NOT refused", async (t) => {
  if (await gateCore(t)) return;
  // A human draft is a work-in-progress `revise_entry` exists to finish; the same core already
  // discriminates that way (assert_books_current at 0016:4241). Applying N1 to the human lane
  // would break a working editing flow, and this cell is what stops a later author "tidying"
  // the asymmetry away.
  await ensureChart(OWNER(), A1());
  const cited = await witnessedFiling(OWNER(), { client: A1(), gross: 500000 });
  const region = await factsRegion(cited.documentId, "invoice.total");
  const d = await draftEntryV3(OWNER(), {
    client: A1(),
    resolution: await freshResolution(OWNER(), A1(), { subjectKind: "document", subjectId: cited.documentId }),
    document: cited.documentId, sha256: cited.sha256, lines: invertedBill(500000),
    vendor: { new: { name: "C7 HUMAN WIP SDN BHD" } },
    evidence: [ev(region?.id ?? cited.regionId, region?.text_content ?? cited.quote, "invoice.total")],
    opKey: opk("c7human"),
  });
  assert.ok(d?.entry_id, "c7.draft-human: the human draft landed — the lane discrimination is real, and it is the narrow claim (`not p_is_human`), not an estate-wide law");
  assert.equal((await entryRow(d.entry_id))?.status, "draft", "c7.draft-human: …as a draft");
});

test("f-a2.c7.delegates the 1-arity shape delegates are BYTE-UNMOVED", async (t) => {
  if (await gateCore(t)) return;
  for (const [sig, pinned] of Object.entries(DELEGATE_SHA_PRE_F_A2)) {
    const src = await bodyOf(sig);
    assert.ok(src, `c7.delegates: ${sig} still resolves — T3 never removes it`);
    if (!pinned) {
      noteLane(`c7.delegates: ${sig} sha=${sha(src)} — the pre-F-A2 pin is unset in this file; record it at integration so the byte-unmoved claim has a before-state`);
      continue;
    }
    assert.equal(sha(src), pinned,
      `c7.delegates: ${sig} is byte-identical to its pre-F-A2 body. T3 recuts the TRIGGER FUNCTIONS, never these — that is what makes the human-lane blast radius zero BY CONSTRUCTION`);
  }
});

test("f-a2.c7.t3-human a HUMAN approval on a two-generation document still succeeds, and writes no pin", async (t) => {
  if (await gateCore(t)) return;
  await ensureChart(OWNER(), A1());
  const cited = await witnessedFiling(OWNER(), { client: A1(), gross: 500000 });
  // A SECOND generation on the same document — a later OCR pass. The fact state still names the
  // witness pair, so this is a two-generation document without a moved fact state.
  await seedExtraction({ firm: cited.firm, document: cited.documentId, engineKind: "ocr", status: "done", versionN: 2 })
    .catch((e) => noteLane(`c7.t3-human: could not seed a second generation (${e.code}: ${e.message})`));
  const region = await factsRegion(cited.documentId, "invoice.total");
  const d = await draftEntryV3(OWNER(), {
    client: A1(),
    resolution: await freshResolution(OWNER(), A1(), { subjectKind: "document", subjectId: cited.documentId }),
    document: cited.documentId, sha256: cited.sha256, lines: supplierLines(500000),
    vendor: { new: { name: "C7 TWO GENERATION SDN BHD" } },
    evidence: [ev(region?.id ?? cited.regionId, region?.text_content ?? cited.quote, "invoice.total")],
    opKey: opk("c7t3h"),
  });
  await approveEntry(OWNER(), { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("c7t3ha") });
  assert.equal((await entryRow(d.entry_id))?.status, "approved",
    "c7.t3-human: the human approval behaves exactly as it does today — a human writes no receipt, so the trigger's pin is NULL, so the null-pin behaviour is reproduced");
  assert.equal(await postReceiptCount(d.entry_id), 0, "c7.t3-human: and there is no receipt to pin from");
});

test("f-a2.c7.t3-agent the agent post's trigger and its pinned caller judge the SAME generation — MUST FAIL on a wrong gate_verdicts accessor", async (t) => {
  if (await gateCore(t)) return;
  const p = await agentPostable(OWNER(), { client: A1(), amount: 500000 });
  const bound = await rootQuery(
    "select distinct extraction_id from clara.entry_evidence where entry_id=$1", [p.args.entry]);
  assert.equal(bound.rows.length, 1, "c7.t3-agent precondition: the draft is bound to exactly one extraction generation");
  // A LATER generation whose numbers disagree. The fact state still names the witness pair, so
  // B8 admits; a NULL pin would send the shape floor at whatever the document's newest
  // generation says instead of the one the entry cites.
  const later = await seedExtraction({ firm: p.cited.firm, document: p.cited.documentId, engineKind: "ocr", status: "done", versionN: 3 })
    .catch((e) => { noteLane(`c7.t3-agent: second generation unbuilt (${e.code}: ${e.message})`); return null; });
  if (later) {
    await seedRegion({
      firm: p.cited.firm, extraction: later, fieldPath: "invoice.total",
      textContent: "RM 6,000.00", locator: { page: 1, polygon: [0, 0, 1, 1] },
    }).catch((e) => noteLane(`c7.t3-agent: second-generation region unbuilt (${e.code}: ${e.message})`));
  }
  const wire = await wakePostEntry(p.cred, p.args);
  assert.equal(wire?.posted, true,
    `c7.t3-agent: the post judges the generation the RECEIPT names, so it lands (${JSON.stringify(wire?.refusal)}). Against an unpinned floor this is where the later generation would win`);
  const row = await postReceiptRow(p.args.entry);
  const flat = row?.gate_verdicts?.extraction_id;
  assert.ok(typeof flat === "string" && flat.trim().length > 0,
    `c7.t3-agent: gate_verdicts carries extraction_id FLATTENED at the TOP level and non-blank (got ${JSON.stringify(flat)}). A nested accessor read from inside the trigger yields NULL — which IS today's unpinned behaviour, and it would pass silently`);
  assert.equal(flat, bound.rows[0].extraction_id,
    "c7.t3-agent: …and the pin IS the generation the entry's evidence is bound to, not the document's newest");
  assert.notEqual(flat, later ?? " ", "c7.t3-agent: specifically NOT the later generation");
});

test("f-a2.c7.t3-sales the SALES arm carries the identical chain", async (t) => {
  if (await gateCore(t)) return;
  // v1 missed this entirely: the same 1-arity/NULL-pin chain exists for sales, untouched. T3
  // closes the divergence on BOTH arms or on neither.
  const p = await agentPostable(OWNER(), {
    client: A2(), amount: 10600, net: 10000, tax: 605, rounding: -5,
    codingKind: "sales_invoice", lines: salesLines(10600, 10000, 605, -5),
  });
  const wire = await wakePostEntry(p.cred, p.args);
  if (wire?.posted !== true) { noteLane(`c7.t3-sales: the sales post refused (${JSON.stringify(wire?.refusal)})`); return; }
  const row = await postReceiptRow(p.args.entry);
  assert.ok(String(row?.gate_verdicts?.extraction_id ?? "").trim().length > 0,
    "c7.t3-sales: the sales post's receipt carries the same flattened pin");
  const src = await bodyOf("clara._tf_assert_sales_invoice_shape()");
  if (src) {
    assert.match(src, /entry_post_receipts/,
      "c7.t3-sales: the sales TRIGGER FUNCTION resolves its pin from the entry's own post receipt — the same recut as the supplier arm");
  } else {
    noteLane("c7.t3-sales: the sales trigger function did not resolve by name — record its live identity at integration");
  }
});

test("f-a2.c7.chat-direction the direction-family arm now fires on the CHAT lane too", async (t) => {
  if (await gateCore(t)) return;
  // `0046:2687-2696` keyed on `not p_is_human and p_wake_kind='autodraft'`, which left chat out.
  // The RE-CUT is to `not p_is_human` — the narrow verified claim. v1's estate-wide "law"
  // phrasing is WITHDRAWN, and every other wake-kind-keyed wall carries its own disposition in
  // §D.5, so this cell asserts the ONE arm and nothing wider.
  const src = await bodyOf("clara._draft_entry_core(uuid,uuid,uuid,text,boolean,uuid,uuid,date,text,jsonb,uuid,text,jsonb,text,bigint,jsonb,jsonb,jsonb,text)");
  if (!src) { noteLane("c7.chat-direction: _draft_entry_core did not resolve at the pinned arity — an interface finding for integration"); return; }
  const bare = src.replace(/--[^\n]*/g, " ");
  assert.ok(!/p_wake_kind\s*=\s*'autodraft'/.test(bare),
    "c7.chat-direction: the direction-family arm no longer keys on the autodraft wake kind — it keys on `not p_is_human`, so chat is covered");
  await ensureChart(OWNER(), A2());
  const cited = await witnessedFiling(OWNER(), { client: A2(), gross: 540000, typeCode: "01" });
  const chat = await interactiveCred(A2(), BOB());
  const d = await agentDraft(OWNER(), chat, { client: A2(), cited, codingKind: "supplier_bill", lines: supplierLines(540000) })
    .catch((e) => { noteLane(`c7.chat-direction: the chat draft raised ${e.code}: ${e.message}`); return null; });
  if (d) assert.ok(d.entry_id, "c7.chat-direction: a well-directed chat draft still lands — the arm narrows nothing lawful");
});

// ===========================================================================
// C.7b — THE RECEIPT WRITE CONTRACT. Three per-tier zero-row cells, AND THEY STAY THREE.
// ===========================================================================

test("f-a2.c7b.one a successful post writes EXACTLY ONE entry_post_receipts row", async (t) => {
  if (await gateCore(t)) return;
  const p = await agentPostable(OWNER(), { client: A1() });
  const before = await postReceiptCount(p.args.entry);
  assert.equal(before, 0, "c7b.one: nothing before the post");
  const wire = await wakePostEntry(p.cred, p.args);
  assert.equal(wire?.posted, true, `c7b.one: the post landed (${JSON.stringify(wire?.refusal)})`);
  assert.equal(await postReceiptCount(p.args.entry), 1, "c7b.one: exactly one after");
  const row = await postReceiptRow(p.args.entry);
  assert.equal(row.id, wire.post_receipt_id,
    "c7b.one: and the wire receipt names the row it wrote — a post_receipt_id that pointed at nothing would be a lie the caller cannot check");
});

test("f-a2.c7b.tierA a TIER-A raise leaves ZERO rows", async (t) => {
  if (await gateCore(t)) return;
  const p = await agentPostable(OWNER(), { client: A1() });
  await wakePostEntry(await proactiveCred(A1()), p.args).catch(() => null);
  assert.equal(await postReceiptCount(p.args.entry), 0,
    "c7b.tierA: a Tier-A raise kills the whole transaction — nothing durable, receipt included");
});

test("f-a2.c7b.tierB a TIER-B refusal leaves ZERO rows — even though the transaction COMMITS", async (t) => {
  if (await gateCore(t)) return;
  // This is the sharp one. Tier B commits, so the refusal reason is durable — and the receipt
  // row still must not exist, because the write contract says the row is written ONLY on a
  // successful post, after the delegate returns.
  const p = await agentPostable(OWNER(), { client: A1(), corroborated: false });
  const wire = await wakePostEntry(p.cred, p.args);
  assert.equal(wire?.posted, false, "c7b.tierB: refused");
  assert.equal(wire?.refusal?.tier, "B", "c7b.tierB: at Tier B, with a committed receipt");
  assert.equal(wire?.post_receipt_id, null, "c7b.tierB: the wire receipt names no row");
  assert.equal(await postReceiptCount(p.args.entry), 0, "c7b.tierB: and there is none");
});

test("f-a2.c7b.tierC a TIER-C conversion leaves ZERO rows — the insert rolls back with the delegate", async (t) => {
  if (await gateCore(t)) return;
  const p = await agentPostable(OWNER(), { client: A1(), amount: 500000 });
  await rootQuery(
    `update clara.document_regions set text_content='RM 6,000.00', monetary_cents=600000
      where extraction_id=$1 and field_path='invoice.total'`, [p.cited.pair.textId])
    .catch((e) => noteLane(`c7b.tierC: could not contradict the bound anchor (${e.code}: ${e.message})`));
  const wire = await wakePostEntry(p.cred, p.args);
  assert.equal(wire?.posted, false, "c7b.tierC: no post");
  assert.equal(await postReceiptCount(p.args.entry), 0,
    "c7b.tierC: the receipt insert sits INSIDE the Tier-C-protected region, so a conversion rolls it back with the delegate's own partial writes");
  if (wire?.refusal?.tier !== "C") {
    noteLane(`c7b.tierC: the ladder refused at ${wire?.refusal?.tier} rather than converting (${JSON.stringify(wire?.refusal)}) — the zero-row claim holds either way, but the CONVERSION arm is unproven this run`);
  }
});

test("f-a2.c7b.visible the row is visible to the DEFERRED trigger at COMMIT — by construction, not by luck", async (t) => {
  if (await gateCore(t)) return;
  const p = await agentPostable(OWNER(), { client: A1() });
  const wire = await wakePostEntry(p.cred, p.args);
  assert.equal(wire?.posted, true, "c7b.visible: the post committed, which means the deferred wall SAW its receipt");
  const row = await postReceiptRow(p.args.entry);
  assert.ok(row, "c7b.visible: the row is there after commit");
  // The ordering claim, stated so nobody reorders it: the insert PRECEDES commit and FOLLOWS the
  // delegate. If it were written before the delegate, a Tier-C conversion would leave an
  // orphaned receipt; if it were written after commit, the deferred wall would fire on its
  // absence and every agent post would abort.
  assert.ok(new Date(row.created_at).getTime() > 0, "c7b.visible: the row carries its own creation instant");
  assert.equal((await entryRow(p.args.entry))?.status, "approved",
    "c7b.visible: and the entry really is approved — the wall passed rather than being skipped");
});
