// Gate K, document-tied — the END-TO-END rig proof for the `opening_tb.line` producer.
// SYNTHETIC document, REAL database, REAL audited writers. Serial, RELAY_TEST_MODE.
//
// WHAT THIS PROVES, and why each hop is here rather than mocked:
//
//   1. The layout cells go in through `clara.persist_document_extraction` exactly as the OCR
//      pipeline writes them, and come back out through the SAME `field_path like 'tables.%'`
//      read the live printed-ledger lane uses. A polygon that does not survive the jsonb
//      round-trip would break the reader in production and be invisible to a pure test.
//   2. The producer reads THOSE rows — not a hand-built array — and emits `opening_tb.line`
//      region payloads.
//   3. Those payloads go in through the SAME audited writer, whose 0017 chain-of-responsibility
//      body independently re-derives `opening_account_code / opening_amount_cents /
//      opening_side` from OUR TEXT via `clara._derive_opening_region_fact`, and refuses the
//      whole extraction if our `monetary_cents` contradicts it. The DB stamping those three
//      columns is the proof that the emitted text is canonical — not our assertion that it is.
//   4. The UNCHANGED consumer (`parseOpeningTargets` → `clara.record_opening_targets_parsed`)
//      then authors document-primary opening targets, which is Gate K's document-tied half.
//
// THE ORDERING IS LOAD-BEARING. `_assert_opening_extraction_ref` demands the cited extraction
// be the document's `authoritative_extraction_id`, and the 0017 authority trigger hands that
// pointer to the chronologically NEWEST accepted run. The producer's derived extraction is
// necessarily newer than the layout run it was derived FROM, so the ordering is correct by
// construction — but it is asserted here, because the printed-ledger lane already shipped one
// bug (PR #104) that lived entirely in an extraction-selection predicate.

process.env.RELAY_TEST_MODE ??= "1";

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { cellsToOpeningTb } from "../lib/opening-tb-cells.mjs";
import { parseOpeningTargets } from "../lib/opening-parse.mjs";
import { readPriorGlCells } from "../lib/seeding-parse.mjs";
import { ACCOUNTS, BALANCED, tbRow } from "./kdoc-opening-tb-testkit.mjs";
import * as rig from "./rig.mjs";

async function openingReady() {
  try {
    const r = await rig.rootQuery(
      `select to_regprocedure('clara.record_opening_targets_parsed(uuid,jsonb,uuid,text)') is not null as parsed,
              to_regprocedure('clara.create_opening_seed(uuid,uuid,date,uuid,text,text)') is not null as seed,
              to_regprocedure('clara.begin_client_onboarding(text,text)') is not null as onb,
              to_regprocedure('clara.persist_document_extraction(uuid,text,integer,jsonb,jsonb,text,text,text)') is not null as persist,
              to_regprocedure('clara._seed_verified_document(uuid,uuid,text,text,text,bigint,text,uuid,integer,text,date,uuid)') is not null as doc`,
    );
    const o = r.rows[0];
    return o.parsed && o.seed && o.onb && o.persist && o.doc;
  } catch {
    return false;
  }
}

const READY = await openingReady();
const skip = READY ? false : "Wave-B (0017) opening surface absent";

// --- the synthetic trial balance (geometry per wave-b-prior-gl-cells.test.mjs) --------------

/** A balanced synthetic trial balance (DR 130,000.00 = CR 130,000.00, the live Gate-K
 *  corroboration figure 65,747.97 on retained earnings) plus the document's own printed
 *  total. Built from the SAME shared builders the pure suites use, so the geometry the rig
 *  proves is byte-for-byte the geometry the unit cells pin. */
const trialBalanceCells = () => [
  ...BALANCED(),
  ...tbRow(2.9, { code: null, label: "TOTAL", dr: "130,000.00", cr: "130,000.00" }),
];

/** The `p_regions` payload the OCR pipeline writes for those cells (`tables.N.cells.M`). */
const layoutRegions = (cells) =>
  cells.map((c, i) => ({
    locator_kind: "page_polygon",
    locator: c.locator,
    field_path: `tables.0.cells.${i}`,
    text_content: c.text_content,
    engine_confidence: null,
    monetary_raw: null,
    monetary_cents: null,
  }));

// --- fixture ------------------------------------------------------------------------------

/** Onboarding client + CoA + a verified filed opening_balance_doc + a TIED opening seed. */
async function buildSeedFixture(label) {
  const { owner, firm } = await rig.buildFirm(label);
  const onb = await rig.asHuman(owner, (c) =>
    c.query("select clara.begin_client_onboarding($1,$2) as r", [`${label}_${randomUUID().slice(0, 6)}`, rig.opk("onb")]));
  const { client_id: client, plan_id: plan } = onb.rows[0].r;
  for (const [code, name, type] of ACCOUNTS) {
    await rig.asHuman(owner, (c) =>
      c.query("select clara.upsert_account($1,$2,$3,$4,$5,$6,$7) as r", [client, code, name, type, null, rig.opk("acct"), null]));
  }
  const sha = rig.sha(`${label}-${randomUUID()}`);
  const doc = await rig.asRoot((c) =>
    c.query("select clara._seed_verified_document($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) as r",
      [firm, client, sha, "trial-balance.pdf", "application/pdf", 4096, `firms/${firm}/docs/${sha}.pdf`,
        owner, 1, "opening_balance_doc", null, null]));
  const documentId = doc.rows[0].r.document_id;
  const seedRes = await rig.asHuman(owner, (c) =>
    c.query("select clara.create_opening_seed($1,$2,$3::date,$4,$5,$6) as r",
      [client, plan, "2026-01-01", documentId, sha, rig.opk("seed")]));
  return { owner, firm, client, plan, seed: seedRes.rows[0].r.seed_id, documentId, sha };
}

/** Persist one extraction through the REAL audited writer (the pipeline's own door). */
async function persistExtraction({ firm, documentId, lane, engineId, regions }) {
  const task = await rig.asRoot((c) =>
    c.query(
      `insert into clara.document_processing_tasks
         (firm_id,document_id,engine_id,engine_config,version_n,lane,status,workflow_run_id,started_at)
       values ($1,$2,$3,'{}'::jsonb,1,$4,'running',$5,now()) returning id`,
      [firm, documentId, engineId, lane, `rig-${randomUUID().slice(0, 8)}`]));
  const taskId = task.rows[0].id;
  const r = await rig.asRuntime((c) =>
    c.query("select clara.persist_document_extraction($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8) as receipt",
      [taskId, "done", 1, JSON.stringify({ schema_version: 1 }), JSON.stringify(regions), null, null,
        `rig-persist:${taskId}`]));
  return r.rows[0].receipt.extraction_id;
}

after(() => rig.endPool());

// --- the proof ----------------------------------------------------------------------------

test("SYNTHETIC K-doc: a printed trial balance becomes document-primary opening targets", { skip }, async () => {
  const fx = await buildSeedFixture("kdoc_ok");
  const cells = trialBalanceCells();

  // (1) The layout run — written exactly as the OCR pipeline writes it.
  const layoutExt = await persistExtraction({
    firm: fx.firm, documentId: fx.documentId, lane: "ocr",
    engineId: "azure-di:prebuilt-layout:2024-11-30", regions: layoutRegions(cells),
  });
  assert.ok(layoutExt);

  // (2) Read the cells back out of the DATABASE with the live lane's own query, and run the
  //     producer over what actually came back — polygons, jsonb round-trip and all.
  const stored = await rig.asRuntime((c) => readPriorGlCells(c, { documentId: fx.documentId, firmId: fx.firm }));
  assert.equal(stored.length, cells.length, "every layout cell is readable as tables.%");
  const read = cellsToOpeningTb(stored);
  assert.equal(read.status, "ok", read?.reason ?? "the producer must read the stored cells");
  assert.equal(read.lines.length, 5);
  assert.equal(read.totals.debitCents, 13_000_000n);
  assert.equal(read.totals.creditCents, 13_000_000n);
  assert.equal(read.printedTotals.debitCents, 13_000_000n, "the document's own total agreed");

  // (3) The producer's regions through the SAME audited writer. `extracted_at` defaults to the
  //     transaction clock, so this later run is chronologically newer and takes authority.
  await rig.sleep(10);
  const openingExt = await persistExtraction({
    firm: fx.firm, documentId: fx.documentId, lane: "structured_parse",
    engineId: "clara-opening-tb:v1", regions: read.regions,
  });

  const authority = await rig.rootQuery(
    "select authoritative_extraction_id from clara.documents where id=$1", [fx.documentId]);
  assert.equal(authority.rows[0].authoritative_extraction_id, openingExt,
    "the derived run supersedes the layout run it was derived from");

  // THE DB DERIVED THE FACTS ITSELF. These three columns are written by 0017's
  // `_derive_opening_region_fact` out of our text_content — never copied from a caller field.
  const regions = await rig.rootQuery(
    `select text_content, opening_account_code, opening_amount_cents, opening_side, monetary_cents
       from clara.document_regions where extraction_id=$1 and field_path='opening_tb.line'
      order by opening_account_code`, [openingExt]);
  assert.equal(regions.rowCount, 5);
  assert.deepEqual(regions.rows.map((r) => r.opening_account_code),
    ["310-000", "400-000", "500-000", "900-RE", "910-000"]);
  assert.deepEqual(regions.rows.map((r) => r.opening_side),
    ["debit", "debit", "credit", "credit", "credit"]);
  const re = regions.rows.find((r) => r.opening_account_code === "900-RE");
  assert.equal(String(re.opening_amount_cents), "6574797", "65,747.97 — the live Gate-K figure, to the sen");
  assert.equal(String(re.monetary_cents), "6574797", "the independent second representation agreed");

  // (4) The UNCHANGED consumer authors the document-primary targets.
  const out = await rig.asRuntime((c) => parseOpeningTargets(c, { seedId: fx.seed, firmId: fx.firm }));
  assert.equal(out.http, 202, JSON.stringify(out.body));
  assert.deepEqual(out.body, { status: "parsed", lines: 5 });

  const targets = await rig.rootQuery(
    `select account_code, source_label, debit_cents, credit_cents, provenance_kind, document_id,
            source_sha256, extraction_ref, entered_by
       from clara.opening_tb_targets where seed_id=$1 order by account_code`, [fx.seed]);
  assert.equal(targets.rowCount, 5);
  for (const t of targets.rows) {
    assert.equal(t.provenance_kind, "document", "document-tied, not keyed");
    assert.equal(t.document_id, fx.documentId);
    assert.equal(t.source_sha256, fx.sha);
    assert.equal(t.entered_by, null, "no human typed these");
    assert.equal(t.extraction_ref.extraction_id, openingExt);
    assert.ok(t.extraction_ref.region_id, "each target cites its own evidence region");
  }
  assert.deepEqual(targets.rows.map((t) => [t.account_code, String(t.debit_cents), String(t.credit_cents)]), [
    ["310-000", "10500000", "0"],
    ["400-000", "2500000", "0"],
    ["500-000", "0", "2425203"],
    ["900-RE", "0", "6574797"],
    ["910-000", "0", "4000000"],
  ]);
  // The seed ties in the DATABASE's own arithmetic, not ours.
  const tie = await rig.rootQuery(
    "select sum(debit_cents)::text as dr, sum(credit_cents)::text as cr from clara.opening_tb_targets where seed_id=$1",
    [fx.seed]);
  assert.equal(tie.rows[0].dr, "13000000");
  assert.equal(tie.rows[0].cr, "13000000");

  // Replay is stable (the op_key is derived from seed+document).
  const again = await rig.asRuntime((c) => parseOpeningTargets(c, { seedId: fx.seed, firmId: fx.firm }));
  assert.equal(again.http, 202);
  assert.equal(again.body.lines, 5);
});

test("SYNTHETIC K-doc: an UNBALANCED trial balance authors NOTHING and falls back to keyed",
  { skip }, async () => {
    const fx = await buildSeedFixture("kdoc_unbal");
    const cells = trialBalanceCells();
    // Break the tie by one sen on the share-capital line — the least visible corruption there is.
    const broken = cells.map((c) => (c.text_content === "40,000.00" ? { ...c, text_content: "40,000.01" } : c))
      // and drop the printed total, so the ONLY thing that can catch this is ΣDr = ΣCr.
      .filter((c) => !["TOTAL", "130,000.00"].includes(c.text_content));

    await persistExtraction({
      firm: fx.firm, documentId: fx.documentId, lane: "ocr",
      engineId: "azure-di:prebuilt-layout:2024-11-30", regions: layoutRegions(broken),
    });
    const stored = await rig.asRuntime((c) => readPriorGlCells(c, { documentId: fx.documentId, firmId: fx.firm }));
    const read = cellsToOpeningTb(stored);
    assert.equal(read.status, "refused");
    assert.match(read.reason, /does not balance: DR 130000\.00 vs CR 130000\.01/);
    assert.deepEqual(read.regions, [], "a refusal emits no evidence, so nothing can be persisted");

    // Nothing was written, so the consumer sees the surface it saw before the producer existed:
    // the honest keyed-fallback signal — never a partial document-tied seed.
    const out = await rig.asRuntime((c) => parseOpeningTargets(c, { seedId: fx.seed, firmId: fx.firm }));
    assert.equal(out.http, 422);
    assert.deepEqual(out.body, { status: "unparseable", reason: "no_opening_tb_lines" });
    const targets = await rig.rootQuery(
      "select count(*)::int as n from clara.opening_tb_targets where seed_id=$1", [fx.seed]);
    assert.equal(targets.rows[0].n, 0);
  });

test("SYNTHETIC K-doc: the DB refuses a fact whose monetary evidence contradicts its own text",
  { skip }, async () => {
    const fx = await buildSeedFixture("kdoc_tamper");
    const read = cellsToOpeningTb(trialBalanceCells());
    assert.equal(read.status, "ok");
    // Tamper with ONE region's cents after the producer emitted it — the shape a corrupted or
    // malicious caller takes. The producer cannot prevent this; the database must.
    const tampered = read.regions.map((r, i) => (i === 0 ? { ...r, monetary_cents: "10500001" } : r));
    await assert.rejects(
      () => persistExtraction({
        firm: fx.firm, documentId: fx.documentId, lane: "structured_parse",
        engineId: "clara-opening-tb:v1", regions: tampered,
      }),
      (err) => err.code === "CLR31" && /monetary_mismatch/.test(err.detail ?? ""),
      "0017 re-derives from the text and refuses the whole extraction",
    );
    const regions = await rig.rootQuery(
      `select count(*)::int as n from clara.document_regions r
         join clara.document_extractions e on e.id=r.extraction_id
        where e.document_id=$1 and r.field_path='opening_tb.line'`, [fx.documentId]);
    assert.equal(regions.rows[0].n, 0, "not one region of the tampered batch landed");
  });
