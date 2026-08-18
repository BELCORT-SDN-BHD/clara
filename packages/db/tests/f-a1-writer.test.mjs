// F-A1 — clara.persist_witness_facts (+ clara.llm_usage_events / clara.record_llm_usage_event):
// THE WRITER BATTERY (Annex C's "Writer" cells + this PR's own additions).
//
// Goes THROUGH the real writer end to end — unlike f-a1-predicate.test.mjs / f-a1-fixtures.mjs's
// landWitnessPair, which insert the pair DIRECTLY because persist_witness_facts did not exist
// when that lane was authored. This file is the other half of that mutual blindness: a
// divergence between what this battery exercises and what the predicate lane assumed is a real
// FINDING on one side or the other, never a test bug to paper over.
//
// Cells: idempotent replay (BLIND) · equal prompt hashes refused · missing input pins refused ·
// malformed answers refused · conflicting-duplicate citations forfeit one read (BLIND) · a
// missing/failed citation persists geometry-less · a verified citation's region carries the OCR
// polygon + source-region uuid + NULL confidence · post-persist neither row superseded and the
// document-wide pointer = the TEXT row · usage rows append-only and UPDATE/DELETE refuse · RLS
// cross-firm SELECT sees nothing (BLIND) · end-to-end corroboration through the real predicate
// and the cross-regime dispatcher · task not claimed/wrong lane/wrong state.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { rootQuery, endPool, humanQuery } from "./rig-helpers.mjs";
import { buildWorld } from "./rig-fixtures.mjs";
import { firmOf, filedDocument } from "./s6-helpers.mjs";
import { seedExtraction, seedRegion } from "./rig-docs-fixtures.mjs";
import { money, box, BELT } from "./f-a1-fixtures.mjs";

let world = null;
let live = false;

before(async () => {
  world = await buildWorld();
  live = (await rootQuery(
    `select to_regprocedure('clara.persist_witness_facts(uuid,jsonb,jsonb,int)') is not null
        and to_regclass('clara.llm_usage_events') is not null
        and to_regprocedure('clara.record_llm_usage_event(uuid,uuid,uuid,text,text,text,int,int,int,text)') is not null as ok`,
  )).rows[0].ok;
});
after(async () => { await endPool(); });

const gate = (t) => {
  if (!live) { t.skip("F-A1 writer lane not applied — clara.persist_witness_facts absent"); return true; }
  return false;
};

// ---------------------------------------------------------------------------------------
// Fixtures. A real invoice's own arithmetic (LAI LOU MEI, the same base the predicate
// battery anchors to): 94.30 + 3.77 + 5.66 + 0.02 = 103.75.
// ---------------------------------------------------------------------------------------
const CENTS = { total: 10375, net: 9430, tax: 566, svc: 377, round: 2 };

// `extraTexts` lands its regions in the SAME pass as the base set, because the citation ordinal
// is `row_number() over (order by id)` over uuids: a region added after idxOf was computed would
// silently RENUMBER the base citations (a uuid sorts anywhere), and the cell would then be
// testing the fixture rather than the writer.
async function ocrFixture(sub, client, extraTexts = {}) {
  const firm = await firmOf(client);
  const doc = await filedDocument(sub, { firm, client, kind: "invoice" });
  const ocrId = await seedExtraction({ firm, document: doc.documentId, engineKind: "ocr", status: "done" });
  const texts = {
    total: `TOTAL DUE ${money(CENTS.total)} nett`,
    net: `SUBTOTAL ${money(CENTS.net)}`,
    tax: `SST 6% ${money(CENTS.tax)}`,
    svc: `SERVICE CHARGE ${money(CENTS.svc)}`,
    round: `ROUNDING ADJ ${money(CENTS.round)}`,
    ccy: "Currency stated: MYR only",
    type: "Doc Type Code: 01",
    ...extraTexts,
  };
  const ids = {};
  for (const [label, textContent] of Object.entries(texts)) {
    ids[label] = await seedRegion({
      firm, extraction: ocrId, fieldPath: `ocr_${label}`, textContent, locator: box(0, 0, 5, 5),
    });
  }
  const rows = (await rootQuery(
    `select id, (row_number() over (order by id))::int as idx
       from clara.document_regions where extraction_id=$1`, [ocrId])).rows;
  const idxOf = {};
  for (const [label, id] of Object.entries(ids)) idxOf[label] = rows.find((r) => r.id === id).idx;
  return { firm, documentId: doc.documentId, sha256: doc.sha256, ocrId, idxOf };
}

async function ocrRegionId(o, label) {
  const r = await rootQuery(
    `select id from clara.document_regions where extraction_id=$1 and field_path=$2`, [o.ocrId, `ocr_${label}`]);
  return r.rows[0].id;
}

async function runningTask(firm, documentId, engineId = `llm-openai:gpt-witness:${randomUUID().slice(0, 8)}`, versionN = 1) {
  const r = await rootQuery(
    `insert into clara.document_processing_tasks(firm_id,document_id,engine_id,version_n,lane,
       status,workflow_run_id,started_at)
     values($1,$2,$3,$4,'llm_witness','running',$5,now()) returning id`,
    [firm, documentId, engineId, versionN, `rig-witness-${randomUUID().slice(0, 8)}`]);
  return { taskId: r.rows[0].id, engineId, versionN };
}

const ans = (raw) => (raw == null ? { state: "not_printed" } : { state: "value", raw });
function envelope(channel, fields) {
  const answers = {};
  for (const f of BELT) answers[f] = ans(Object.prototype.hasOwnProperty.call(fields, f) ? fields[f] : null);
  return { witness: { channel, answers } };
}
const goodFields = () => ({
  "invoice.total": money(CENTS.total), "invoice.total_excl_tax": money(CENTS.net),
  "invoice.tax_total": money(CENTS.tax), "invoice.service_charge": money(CENTS.svc),
  "invoice.rounding": money(CENTS.round), "invoice.currency": "MYR", "invoice.type_code": "01",
});
const goodCitations = (o) => ([
  { field_path: "invoice.total", region_idx: o.idxOf.total },
  { field_path: "invoice.total_excl_tax", region_idx: o.idxOf.net },
  { field_path: "invoice.tax_total", region_idx: o.idxOf.tax },
  { field_path: "invoice.service_charge", region_idx: o.idxOf.svc },
  { field_path: "invoice.rounding", region_idx: o.idxOf.round },
  { field_path: "invoice.currency", region_idx: o.idxOf.ccy },
  { field_path: "invoice.type_code", region_idx: o.idxOf.type },
]);

function textCall(o, { fields = goodFields(), citations = goodCitations(o), prompt = randomUUID(), usage = null } = {}) {
  const call = { input_pin: o.ocrId, prompt_hash: prompt, envelope: envelope("text", fields), citations };
  if (usage) call.usage = usage;
  return call;
}
function visionCall(o, { fields = goodFields(), prompt = randomUUID(), usage = null } = {}) {
  const call = { input_pin: o.sha256, prompt_hash: prompt, envelope: envelope("vision", fields) };
  if (usage) call.usage = usage;
  return call;
}

async function persist(taskId, text, vision, pagesUsed = null) {
  const r = await rootQuery(
    `select clara.persist_witness_facts($1,$2::jsonb,$3::jsonb,$4) as s`,
    [taskId, JSON.stringify(text), JSON.stringify(vision), pagesUsed]);
  return r.rows[0].s;
}
async function persistErr(taskId, text, vision) {
  let err = null;
  try { await persist(taskId, text, vision); } catch (e) { err = e; }
  return err;
}
async function extractionCount(documentId) {
  return (await rootQuery(
    `select count(*)::int as n from clara.document_extractions where document_id=$1`, [documentId])).rows[0].n;
}
async function regionsOf(extractionId) {
  return (await rootQuery(
    `select field_path,text_content,monetary_raw,monetary_cents,engine_confidence,locator_kind,locator
       from clara.document_regions where extraction_id=$1 order by field_path`, [extractionId])).rows;
}

// ===========================================================================
// The base case: verified citations, geometry, confidence, pointer determinism.
// ===========================================================================

test("a well-formed pair persists: verified citations carry the OCR polygon + source-region uuid + NULL confidence; the pointer lands on the TEXT row, neither row superseded", async (t) => {
  if (gate(t)) return;
  const o = await ocrFixture(world.users.alice, world.clients.A1);
  const { taskId, engineId, versionN } = await runningTask(o.firm, o.documentId);
  const r = await persist(taskId, textCall(o), visionCall(o));
  assert.equal(r.status, "done");
  assert.equal(r.replayed, false);
  assert.equal(r.engine_id, engineId);
  assert.equal(r.version_n, versionN);

  const regions = await regionsOf(r.text_extraction_id);
  const total = regions.find((x) => x.field_path === "invoice.total");
  assert.equal(total.monetary_cents, String(CENTS.total));
  assert.equal(total.engine_confidence, null, "engine_confidence is always NULL");
  assert.equal(total.locator_kind, "page_polygon");
  assert.ok(Array.isArray(total.locator.polygon) && total.locator.polygon.length > 0, "verified citation carries the OCR polygon");
  assert.equal(total.locator.source_region_id, await ocrRegionId(o, "total"), "locator names the cited OCR region's own uuid");

  const visionRegions = await regionsOf(r.vision_extraction_id);
  assert.equal(visionRegions.length, 0, "the vision row writes no regions (design §3.1)");

  const ext = (await rootQuery(
    `select id,superseded_by from clara.document_extractions where id = any($1::uuid[])`,
    [[r.text_extraction_id, r.vision_extraction_id]])).rows;
  for (const e of ext) assert.equal(e.superseded_by, null, `${e.id} is not superseded`);
  const doc = (await rootQuery(`select authoritative_extraction_id from clara.documents where id=$1`, [o.documentId])).rows[0];
  assert.equal(doc.authoritative_extraction_id, r.text_extraction_id, "the document-wide pointer lands on the TEXT row");
});

test("idempotent replay returns the stored receipt, never a second insert", async (t) => {
  if (gate(t)) return;
  const o = await ocrFixture(world.users.alice, world.clients.A1);
  const { taskId } = await runningTask(o.firm, o.documentId);
  const first = await persist(taskId, textCall(o), visionCall(o));
  const before_ = await extractionCount(o.documentId);
  const second = await persist(taskId, textCall(o), visionCall(o)); // fresh prompt hashes; replay ignores the payload
  assert.equal(second.replayed, true);
  assert.equal(second.text_extraction_id, first.text_extraction_id);
  assert.equal(second.vision_extraction_id, first.vision_extraction_id);
  assert.equal(await extractionCount(o.documentId), before_, "no second insert");
});

// ===========================================================================
// Structural refusals.
// ===========================================================================

test("equal prompt hashes are refused — the independence receipt", async (t) => {
  if (gate(t)) return;
  const o = await ocrFixture(world.users.alice, world.clients.A1);
  const { taskId } = await runningTask(o.firm, o.documentId);
  const same = randomUUID();
  const err = await persistErr(taskId, textCall(o, { prompt: same }), visionCall(o, { prompt: same }));
  assert.equal(err?.code, "CLR10");
  assert.equal(await extractionCount(o.documentId), 1, "only the seed OCR extraction exists");
});

test("missing or unresolvable input pins are refused", async (t) => {
  if (gate(t)) return;
  // A document carries at most ONE live llm_witness task at a time
  // (uq_document_processing_one_live_lane) — a refused persist leaves the task 'running'
  // (the whole call rolled back), so each sub-case gets its OWN document.
  {
    const o = await ocrFixture(world.users.alice, world.clients.A1);
    const { taskId } = await runningTask(o.firm, o.documentId);
    const bad = textCall(o); delete bad.input_pin;
    assert.equal((await persistErr(taskId, bad, visionCall(o)))?.code, "CLR10", "missing text input_pin");
  }
  {
    const o = await ocrFixture(world.users.alice, world.clients.A1);
    const { taskId } = await runningTask(o.firm, o.documentId);
    const bad = textCall(o); bad.input_pin = randomUUID(); // resolves to no extraction at all
    assert.equal((await persistErr(taskId, bad, visionCall(o)))?.code, "CLR10", "unresolvable text input_pin");
  }
  {
    const o = await ocrFixture(world.users.alice, world.clients.A1);
    const { taskId } = await runningTask(o.firm, o.documentId);
    const bad = visionCall(o); bad.input_pin = "0".repeat(64); // well-formed hex, wrong document
    assert.equal((await persistErr(taskId, textCall(o), bad))?.code, "CLR10", "vision input_pin mismatching documents.sha256");
  }
});

test("malformed answers vocabulary is refused — not all eleven fields answered", async (t) => {
  if (gate(t)) return;
  // One live llm_witness task per document (uq_document_processing_one_live_lane) — a fresh
  // document per sub-case, same reason as the input-pins cell above.
  {
    const o = await ocrFixture(world.users.alice, world.clients.A1);
    const { taskId } = await runningTask(o.firm, o.documentId);
    const bad = textCall(o); delete bad.envelope.witness.answers["invoice.deposit"]; // ten, not eleven
    assert.equal((await persistErr(taskId, bad, visionCall(o)))?.code, "CLR10", "a missing belt answer");
  }
  {
    const o = await ocrFixture(world.users.alice, world.clients.A1);
    const { taskId } = await runningTask(o.firm, o.documentId);
    const bad = textCall(o); bad.envelope.witness.answers["invoice.deposit"] = { state: "printed_but_illegible" };
    assert.equal((await persistErr(taskId, bad, visionCall(o)))?.code, "CLR10", "an unrecognised state token");
  }
  {
    const o = await ocrFixture(world.users.alice, world.clients.A1);
    const { taskId } = await runningTask(o.firm, o.documentId);
    const bad = textCall(o); bad.envelope.witness.answers["invoice.deposit"] = { state: "value", raw: "" };
    assert.equal((await persistErr(taskId, bad, visionCall(o)))?.code, "CLR10", "a value state with empty raw");
  }
  {
    const o = await ocrFixture(world.users.alice, world.clients.A1);
    const { taskId } = await runningTask(o.firm, o.documentId);
    const bad = visionCall(o); bad.envelope.witness.channel = "text"; // wrong channel on the vision row
    assert.equal((await persistErr(taskId, textCall(o), bad))?.code, "CLR10", "a channel mismatch");
  }
});

test("conflicting-duplicate citations for one field_path forfeit the WHOLE call; identical duplicates collapse", async (t) => {
  if (gate(t)) return;
  {
    const o = await ocrFixture(world.users.alice, world.clients.A1);
    const { taskId } = await runningTask(o.firm, o.documentId);
    const bad = textCall(o, {
      citations: [...goodCitations(o), { field_path: "invoice.total", region_idx: o.idxOf.net }], // differing second citation
    });
    assert.equal((await persistErr(taskId, bad, visionCall(o)))?.code, "CLR10", "a conflicting duplicate citation");
    assert.equal(await extractionCount(o.documentId), 1, "nothing was inserted");
  }
  {
    const o = await ocrFixture(world.users.alice, world.clients.A1);
    const { taskId } = await runningTask(o.firm, o.documentId);
    const ok = textCall(o, { citations: [...goodCitations(o), { field_path: "invoice.total", region_idx: o.idxOf.total }] });
    const r = await persist(taskId, ok, visionCall(o));
    assert.equal(r.status, "done", "an identical duplicate citation collapses rather than forfeiting");
  }
});

test("structural refusals: task not claimed / wrong lane / wrong state", async (t) => {
  if (gate(t)) return;
  const o = await ocrFixture(world.users.alice, world.clients.A1);
  assert.equal((await persistErr(randomUUID(), textCall(o), visionCall(o)))?.code, "CLR16", "an unknown task");
  {
    const wr = `rig-${randomUUID().slice(0, 6)}`;
    const r = await rootQuery(
      `insert into clara.document_processing_tasks(firm_id,document_id,engine_id,version_n,lane,status,workflow_run_id,started_at)
       values($1,$2,$3,1,'ocr','running',$4,now()) returning id`,
      [o.firm, o.documentId, `azure-di:x:${randomUUID().slice(0, 6)}`, wr]);
    assert.equal((await persistErr(r.rows[0].id, textCall(o), visionCall(o)))?.code, "CLR16", "a non-llm_witness lane task");
  }
  {
    const wr = `rig-${randomUUID().slice(0, 6)}`;
    const r = await rootQuery(
      `insert into clara.document_processing_tasks(firm_id,document_id,engine_id,version_n,lane,status,error_code,workflow_run_id,started_at,finished_at)
       values($1,$2,$3,1,'llm_witness','failed','engine_error',$4,now(),now()) returning id`,
      [o.firm, o.documentId, `llm-openai:gpt-witness:${randomUUID().slice(0, 6)}`, wr]);
    assert.equal((await persistErr(r.rows[0].id, textCall(o), visionCall(o)))?.code, "CLR16", "a failed (not running) task");
  }
});

// ===========================================================================
// Permissive writer: a missing or failed citation persists geometry-less.
// ===========================================================================

test("a missing or failed citation still persists the fact GEOMETRY-LESS — the writer never refuses a read for being wrong", async (t) => {
  if (gate(t)) return;
  const o = await ocrFixture(world.users.alice, world.clients.A1);
  // (a) NO citation at all for a value-state field.
  {
    const { taskId } = await runningTask(o.firm, o.documentId);
    const text = textCall(o);
    text.envelope.witness.answers["invoice.amount_due"] = { state: "value", raw: money(CENTS.total) };
    const vision = visionCall(o, { fields: { ...goodFields(), "invoice.amount_due": money(CENTS.total) } });
    const r = await persist(taskId, text, vision);
    const rr = (await regionsOf(r.text_extraction_id)).find((x) => x.field_path === "invoice.amount_due");
    assert.ok(rr, "the fact still persists");
    assert.equal(rr.locator.polygon.length, 0, "no citation -> empty polygon");
    assert.equal(rr.locator.source_region_id, undefined, "no citation -> no source region");
  }
  // (b) a citation naming an idx that resolves to nothing.
  {
    const { taskId } = await runningTask(o.firm, o.documentId);
    const text = textCall(o, { citations: [...goodCitations(o), { field_path: "invoice.deposit", region_idx: 9999 }] });
    text.envelope.witness.answers["invoice.deposit"] = { state: "value", raw: money(500) };
    const vision = visionCall(o, { fields: { ...goodFields(), "invoice.deposit": money(500) } });
    const r = await persist(taskId, text, vision);
    const rr = (await regionsOf(r.text_extraction_id)).find((x) => x.field_path === "invoice.deposit");
    assert.equal(rr.locator.polygon.length, 0, "an unresolvable idx -> geometry-less");
    assert.equal(rr.locator.source_region_id, undefined);
  }
  // (c) a citation resolving to a REAL region whose text does not contain the claimed rendering.
  {
    const { taskId } = await runningTask(o.firm, o.documentId);
    const text = textCall(o, { citations: [...goodCitations(o), { field_path: "invoice.discount", region_idx: o.idxOf.ccy }] });
    text.envelope.witness.answers["invoice.discount"] = { state: "value", raw: money(500) }; // the ccy region says "MYR", never RM 5.00
    const vision = visionCall(o, { fields: { ...goodFields(), "invoice.discount": money(500) } });
    const r = await persist(taskId, text, vision);
    const rr = (await regionsOf(r.text_extraction_id)).find((x) => x.field_path === "invoice.discount");
    assert.equal(rr.locator.polygon.length, 0, "substring mismatch -> geometry-less");
    assert.equal(rr.locator.source_region_id, await ocrRegionId(o, "ccy"), "the resolved (but wrong) region uuid is still recorded");
    assert.equal(rr.monetary_raw, money(500), "the witness's claim is still persisted whole");
  }
});

// ===========================================================================
// The adjudicated review fold: M1 · M2 · M3 · M4 · M5 · M6.
// ===========================================================================

test("M1: a cited invoice.customer_taxid persists as a verified region — 0022's buyer-hit disjunct can still read it", async (t) => {
  if (gate(t)) return;
  // The OCR page carries the buyer's tax id; the witness cites it.
  const o = await ocrFixture(world.users.alice, world.clients.A1, { taxid: "Buyer TIN: C12345678900" });
  const { taskId } = await runningTask(o.firm, o.documentId);
  const text = textCall(o, { citations: [...goodCitations(o),
    { field_path: "invoice.customer_taxid", region_idx: o.idxOf.taxid, raw: "C12345678900" }] });
  const r = await persist(taskId, text, visionCall(o));
  const rr = (await regionsOf(r.text_extraction_id)).find((x) => x.field_path === "invoice.customer_taxid");
  assert.ok(rr, "the customer_taxid fact persisted — it was DROPPED from the writer's vocabulary before this fix");
  assert.equal(rr.text_content, "C12345678900");
  assert.equal(rr.locator.source_region_id, await ocrRegionId(o, "taxid"), "a verified citation carries the cited OCR region's uuid");
  assert.ok(rr.locator.polygon.length > 0, "…and its polygon");
});

test("M2: a non-boolean witness.contest is a STRUCTURAL refusal; boolean and absent are both accepted", async (t) => {
  if (gate(t)) return;
  {
    const o = await ocrFixture(world.users.alice, world.clients.A1);
    const { taskId } = await runningTask(o.firm, o.documentId);
    const bad = textCall(o); bad.envelope.witness.contest = "unknown";
    assert.equal((await persistErr(taskId, bad, visionCall(o)))?.code, "CLR10",
      "a string contest is refused at the write boundary — the predicate casts it ::boolean");
    assert.equal(await extractionCount(o.documentId), 1, "nothing was inserted");
  }
  {
    const o = await ocrFixture(world.users.alice, world.clients.A1);
    const { taskId } = await runningTask(o.firm, o.documentId);
    const ok = textCall(o); ok.envelope.witness.contest = true;
    const v = visionCall(o); v.envelope.witness.contest = false;
    assert.equal((await persist(taskId, ok, v)).status, "done", "boolean contest is accepted on both channels");
  }
});

test("M3: the reference-value contract — a value must be a substring of its raw (id) / a real ISO date, and it reaches the envelope", async (t) => {
  if (gate(t)) return;
  {
    const o = await ocrFixture(world.users.alice, world.clients.A1);
    const { taskId } = await runningTask(o.firm, o.documentId);
    const bad = textCall(o);
    bad.envelope.witness.answers["invoice.invoice_id"] =
      { state: "value", raw: "Invoice No.: INV-001", value: "INV-999" };
    assert.equal((await persistErr(taskId, bad, visionCall(o)))?.code, "CLR10",
      "a value the document never prints is a model-invented identifier — refused");
  }
  {
    const o = await ocrFixture(world.users.alice, world.clients.A1);
    const { taskId } = await runningTask(o.firm, o.documentId);
    const bad = textCall(o);
    bad.envelope.witness.answers["invoice.invoice_date"] =
      { state: "value", raw: "31/02/2026", value: "2026-02-31" };
    assert.equal((await persistErr(taskId, bad, visionCall(o)))?.code, "CLR10",
      "a shape-valid but non-existent ISO date is refused (the regex alone would pass it)");
  }
  {
    const o = await ocrFixture(world.users.alice, world.clients.A1);
    const { taskId } = await runningTask(o.firm, o.documentId);
    const text = textCall(o); const vision = visionCall(o);
    for (const call of [text, vision]) {
      call.envelope.witness.answers["invoice.invoice_id"] =
        { state: "value", raw: "Invoice No.: INV-001", value: "INV-001" };
      call.envelope.witness.answers["invoice.invoice_date"] =
        { state: "value", raw: "15/01/2026", value: "2026-01-15" };
    }
    const r = await persist(taskId, text, vision);
    const s = (await rootQuery(`select clara.evaluate_witness_fact_state_v1($1,$2,$3) as s`,
      [o.documentId, r.text_extraction_id, r.vision_extraction_id])).rows[0].s;
    assert.equal(s.invoice_id, "INV-001", "the envelope emits the normalized value the duplicate walls compare");
    assert.equal(s.invoice_date, "2026-01-15");
  }
  {
    // A key outside the eleven-plus-two vocabulary is still refused: an admitting vocabulary
    // admits typos too.
    const o = await ocrFixture(world.users.alice, world.clients.A1);
    const { taskId } = await runningTask(o.firm, o.documentId);
    const bad = textCall(o);
    bad.envelope.witness.answers["invoice.vendor_name"] = { state: "value", raw: "SUPPLIER SDN BHD" };
    assert.equal((await persistErr(taskId, bad, visionCall(o)))?.code, "CLR10",
      "only invoice_id / invoice_date may join the eleven");
  }
});

test("M4: the monetary citation match is TOKEN-BOUNDED — a digit fragment does not verify", async (t) => {
  if (gate(t)) return;
  // The two OCR lines are BOTH seeded up front (see ocrFixture's note on renumbering).
  const o = await ocrFixture(world.users.alice, world.clients.A1, {
    frag: "PREVIOUS BALANCE RM 11,234.56",
    bounded: "Total: RM 1,234.56",
  });
  const RAW = "1,234.56";   // a plain SUBSTRING of "11,234.56" — that is the whole hazard
  // (a) the fragment. Pre-fix this VERIFIED and handed the witness the wrong line's polygon for a
  // figure the document never states.
  {
    const { taskId } = await runningTask(o.firm, o.documentId);
    const text = textCall(o, { citations: [...goodCitations(o),
      { field_path: "invoice.amount_due", region_idx: o.idxOf.frag }] });
    text.envelope.witness.answers["invoice.amount_due"] = { state: "value", raw: RAW };
    const vision = visionCall(o, { fields: { ...goodFields(), "invoice.amount_due": RAW } });
    const r = await persist(taskId, text, vision);
    const rr = (await regionsOf(r.text_extraction_id)).find((x) => x.field_path === "invoice.amount_due");
    assert.equal(rr.locator.polygon.length, 0, "a digit-fragment match does NOT verify — geometry-less");
    assert.equal(rr.locator.source_region_id, await ocrRegionId(o, "frag"),
      "the resolved (but unverified) region uuid is still recorded");
    assert.equal(rr.monetary_cents, "123456", "…while the read still persists whole (C4)");
  }
  // (b) the SAME rendering inside a bounded occurrence DOES verify, so the term under test is the
  // BOUNDARY and not some other wall that happened to be failing too.
  {
    const { taskId } = await runningTask(o.firm, o.documentId);
    const text = textCall(o, { citations: [...goodCitations(o),
      { field_path: "invoice.amount_due", region_idx: o.idxOf.bounded }] });
    text.envelope.witness.answers["invoice.amount_due"] = { state: "value", raw: RAW };
    const vision = visionCall(o, { fields: { ...goodFields(), "invoice.amount_due": RAW } });
    const r = await persist(taskId, text, vision);
    const rr = (await regionsOf(r.text_extraction_id)).find((x) => x.field_path === "invoice.amount_due");
    assert.ok(rr.locator.polygon.length > 0, "a token-bounded occurrence verifies");
    assert.equal(rr.locator.source_region_id, await ocrRegionId(o, "bounded"));
  }
});

test("M5: clara.witness_citation_regions publishes EXACTLY the numbering the resolver resolves against", async (t) => {
  if (gate(t)) return;
  const o = await ocrFixture(world.users.alice, world.clients.A1);
  // The reader's whole (idx -> region_id) map…
  const published = (await rootQuery(
    `select idx, region_id, page, text_content from clara.witness_citation_regions($1) order by idx`, [o.ocrId])).rows;
  assert.ok(published.length >= 7, "the seeded OCR extraction has regions to number");
  // …compared against what the WRITER's own resolver returns for each of those idx values. This
  // is the parity that makes "PR-2 must read this" a fact rather than a claim: the prompt builder
  // reads the left column, the server resolves the right one.
  for (const row of published) {
    const resolved = (await rootQuery(
      `select region_id, text_content from clara._witness_resolve_citation($1,$2)`, [o.ocrId, row.idx])).rows[0];
    assert.equal(resolved.region_id, row.region_id, `idx ${row.idx} resolves to the published region`);
    assert.equal(resolved.text_content, row.text_content);
  }
  // And it is NOT get_document_extract's idx: that ordinal is dense over every chosen extraction,
  // so it renumbers the moment a second done extraction exists. Proven, not asserted.
  const { taskId } = await runningTask(o.firm, o.documentId);
  await persist(taskId, textCall(o), visionCall(o));
  const after = (await rootQuery(
    `select idx, region_id from clara.witness_citation_regions($1) order by idx`, [o.ocrId])).rows;
  assert.deepEqual(after.map((x) => `${x.idx}:${x.region_id}`), published.map((x) => `${x.idx}:${x.region_id}`),
    "the witness numbering is STABLE across a witness persist — it is scoped to the pinned OCR extraction alone");
});

test("M6: a 30-digit rendering persists GEOMETRY-LESS with NULL cents instead of raising 22003", async (t) => {
  if (gate(t)) return;
  const huge = "RM " + "1".repeat(30) + ".00";
  const o = await ocrFixture(world.users.alice, world.clients.A1, { huge: `GRAND TOTAL ${huge}` });
  const { taskId } = await runningTask(o.firm, o.documentId);
  const text = textCall(o, { citations: [...goodCitations(o), { field_path: "invoice.deposit", region_idx: o.idxOf.huge }] });
  text.envelope.witness.answers["invoice.deposit"] = { state: "value", raw: huge };
  const vision = visionCall(o, { fields: { ...goodFields(), "invoice.deposit": huge } });
  const r = await persist(taskId, text, vision);  // must NOT raise
  const rr = (await regionsOf(r.text_extraction_id)).find((x) => x.field_path === "invoice.deposit");
  assert.equal(rr.monetary_cents, null, "an unreadable magnitude normalizes to NULL, never an exception");
  assert.equal(rr.locator.polygon.length, 0, "…and lands geometry-less, the failed-citation landing");
  assert.equal(rr.monetary_raw, huge, "…while the read persists whole (C4)");
  // The predicate then refuses on it WITHOUT raising either.
  const s = (await rootQuery(`select clara.evaluate_witness_fact_state_v1($1,$2,$3) as s`,
    [o.documentId, r.text_extraction_id, r.vision_extraction_id])).rows[0].s;
  assert.equal(s.corroborated, false, "present-but-unreadable is not corroboration");
});

test("M6: a `raw` longer than 200 characters is a structural refusal", async (t) => {
  if (gate(t)) return;
  const o = await ocrFixture(world.users.alice, world.clients.A1);
  const { taskId } = await runningTask(o.firm, o.documentId);
  const bad = textCall(o);
  bad.envelope.witness.answers["invoice.amount_due"] = { state: "value", raw: "RM " + "9".repeat(300) };
  assert.equal((await persistErr(taskId, bad, visionCall(o)))?.code, "CLR10");
  assert.equal(await extractionCount(o.documentId), 1, "nothing was inserted");
});

// ===========================================================================
// Usage metering.
// ===========================================================================

test("usage metering: an inline usage block records one row per channel, and llm_usage_events is append-only", async (t) => {
  if (gate(t)) return;
  const o = await ocrFixture(world.users.alice, world.clients.A1);
  const { taskId } = await runningTask(o.firm, o.documentId);
  const usage = { input_tokens: 1200, output_tokens: 80, duration_ms: 2200, outcome: "success" };
  await persist(taskId, textCall(o, { usage }), visionCall(o, { usage }));
  const rows = (await rootQuery(
    `select channel,outcome,input_tokens from clara.llm_usage_events where task_id=$1 order by channel`, [taskId])).rows;
  assert.equal(rows.length, 2, "one usage row per channel");
  assert.deepEqual(rows.map((x) => x.channel), ["text", "vision"]);
  assert.equal(rows[0].outcome, "success");
  assert.equal(rows[0].input_tokens, 1200);

  let err = null;
  try { await rootQuery(`update clara.llm_usage_events set outcome='error' where task_id=$1`, [taskId]); } catch (e) { err = e; }
  assert.ok(err, "UPDATE is refused"); assert.equal(err.code, "CLR08");
  err = null;
  try { await rootQuery(`delete from clara.llm_usage_events where task_id=$1`, [taskId]); } catch (e) { err = e; }
  assert.ok(err, "DELETE is refused"); assert.equal(err.code, "CLR08");
});

test("clara.record_llm_usage_event meters a call independent of persist_witness_facts — a call that never reaches persist is still recorded, and NO spend refusal fires", async (t) => {
  if (gate(t)) return;
  const o = await ocrFixture(world.users.alice, world.clients.A1);
  const { taskId } = await runningTask(o.firm, o.documentId);
  const id = (await rootQuery(
    `select clara.record_llm_usage_event($1,$2,$3,'text',$4,$5,100,10,500,'error') as id`,
    [o.firm, o.documentId, taskId, "llm-openai:gpt-witness:standalone", randomUUID()])).rows[0].id;
  assert.ok(id);
  const row = (await rootQuery(`select outcome from clara.llm_usage_events where id=$1`, [id])).rows[0];
  assert.equal(row.outcome, "error");
  const task = (await rootQuery(`select status from clara.document_processing_tasks where id=$1`, [taskId])).rows[0];
  assert.equal(task.status, "running", "recording usage never touches the task's own status — no spend cap, law 76");
});

test("RLS: a cross-firm human SELECT on llm_usage_events sees nothing", async (t) => {
  if (gate(t)) return;
  const o = await ocrFixture(world.users.alice, world.clients.A1); // firm A
  const { taskId } = await runningTask(o.firm, o.documentId);
  await persist(taskId, textCall(o, { usage: { outcome: "success" } }), visionCall(o, { usage: { outcome: "success" } }));
  const own = await humanQuery(world.users.alice, `select count(*)::int as n from clara.llm_usage_events where task_id=$1`, [taskId]);
  assert.ok(own.rows[0].n >= 1, "the owning firm's human sees its own rows");
  const cross = await humanQuery(world.users.dave, `select count(*)::int as n from clara.llm_usage_events where task_id=$1`, [taskId]); // dave = firm B
  assert.equal(cross.rows[0].n, 0, "a different firm's human sees nothing");
});

// ===========================================================================
// End-to-end: the persisted pair reaches the real predicate and dispatcher.
// ===========================================================================

test("end-to-end: a persisted corroborable pair corroborates through the real predicate and resolves through the cross-regime dispatcher", async (t) => {
  if (gate(t)) return;
  const o = await ocrFixture(world.users.alice, world.clients.A1);
  const { taskId } = await runningTask(o.firm, o.documentId);
  const r = await persist(taskId, textCall(o), visionCall(o));
  const verdict = (await rootQuery(
    `select clara.evaluate_witness_fact_state_v1($1,$2,$3) as s`,
    [o.documentId, r.text_extraction_id, r.vision_extraction_id])).rows[0].s;
  assert.equal(verdict.corroborated, true, "the persisted pair corroborates through the real predicate");
  assert.equal(verdict.total_cents, CENTS.total);
  const dispatched = (await rootQuery(`select clara._invoice_fact_state($1) as s`, [o.documentId])).rows[0].s;
  assert.equal(dispatched.corroborated, true, "the cross-regime dispatcher resolves the witness pair");
  assert.equal(dispatched.extraction_id, r.text_extraction_id);
});
