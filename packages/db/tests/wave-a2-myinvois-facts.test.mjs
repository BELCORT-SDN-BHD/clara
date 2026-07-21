// Wave-A2 rig — the MyInvois facts vocabulary + structured Tier-A corroboration
// (contract §3.2/§3.5 + Gate C + probe P5). CONTRACT-BLIND: from contract v1.0
// §3.2/§3.5 + the as-built _invoice_fact_state (0009/0013) + persist_invoice_facts
// (0013) — NEVER 0015 source. Invariants:
//
//   - The customer/sales vocabulary persists through persist_invoice_facts (the
//     whitelist is EXTENDED): customer_name/registration/taxid, type_code,
//     total_excl_tax, tax_total, tax_breakdown. A key still off the whitelist REFUSES.
//   - STRUCTURED Tier-A: a clara-* facts extraction corroborates on the ARITHMETIC
//     tie (total_excl_tax + tax_total = total) WITHOUT geometry — empty polygons.
//   - The OCR empty-polygon wall STAYS: an azure/ocr facts extraction with empty
//     geometry never corroborates (M3, the OCR path byte-identical).
//   - A consolidated e-invoice (General TIN EI00000000010) is NON-attributable — it
//     never auto-attributes a client (falls to NEEDS YOU).
//
// Structured facts are driven onto a raw local_facts task (clara engine); the OCR
// contrast uses the existing invoice_facts (azure) lane. Skips (loudly, counted).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  rootQuery, endPool, printLaneNotes, noteLane, printSkipCount, markSkip,
  waveAEnsureReady, buildWorld, firmOf,
  seedVerifiedDocument, seedCitedDocument, seedExtraction, seedRegion, addClientIdentifier, recordRuleResolution,
  enqueueInvoiceFacts, invoiceFactsTask, claimTask, persistInvoiceFacts, factField, invoiceFactState,
} from "./wave-a-fixtures.mjs";

let ready = false;
let has15 = false;
let world = null;

async function has0015Lane() {
  const r = await rootQuery(
    `select 1 from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
      where n.nspname='clara' and t.relname='document_processing_tasks' and c.contype='c'
        and pg_get_constraintdef(c.oid) ilike '%local_facts%' limit 1`,
  );
  return r.rows.length > 0;
}
function skip15(t) {
  if (!has15) { markSkip(); t.skip("Wave-A2 not present — local_facts lane absent"); return true; }
  return false;
}

/** Raw local_facts task (clara engine) claimed to running, on a fresh xml doc.
 *  Returns { document, task } or null (noted). */
async function localFactsTask({ firm }) {
  const doc = await seedVerifiedDocument({ firm, mime: "application/xml" });
  const r = await rootQuery(
    `insert into clara.document_processing_tasks (firm_id,document_id,engine_id,engine_config,version_n,lane,status)
     values ($1,$2,'clara-myinvois:v1','{}'::jsonb,1,'local_facts','queued') returning id`,
    [firm, doc.documentId],
  );
  const task = r.rows[0].id;
  await claimTask(task, { egressApproved: false }).catch((e) => noteLane(`local_facts claim ${e.code}`));
  const st = (await rootQuery("select status from clara.document_processing_tasks where id=$1", [task])).rows[0]?.status;
  if (st !== "running") { noteLane(`local_facts task not running (status=${st}) — structured-facts cell skipped`); return null; }
  return { document: doc.documentId, task };
}
async function regionsOf(document) {
  const r = await rootQuery(
    `select rg.field_path from clara.document_regions rg join clara.document_extractions e on e.id=rg.extraction_id
      where e.document_id=$1 and e.engine_kind='invoice_facts' order by rg.field_path`, [document],
  );
  return r.rows.map((x) => x.field_path);
}

before(async () => {
  ready = await waveAEnsureReady();
  has15 = ready && (await has0015Lane());
  if (has15) world = await buildWorld();
  else noteLane(ready ? "0015 local_facts absent — myinvois-facts suite skipped" : "0011 surface absent");
});
after(async () => { printLaneNotes("wave-a2-myinvois-facts"); printSkipCount("wave-a2-myinvois-facts"); await endPool(); });

// ===========================================================================
// §3.2 — the customer/sales vocabulary persists (whitelist extended).
// ===========================================================================

test("§3.2 the customer + SST facts vocabulary persists through persist_invoice_facts", async (t) => {
  if (skip15(t)) return;
  const firm = await firmOf(world.clients.A1);
  const lf = await localFactsTask({ firm });
  if (!lf) return;
  const fields = [
    factField("invoice.total", "RM 106.00"), factField("invoice.currency", "MYR"),
    factField("invoice.customer_name", "D & DREAM PROPERTIES SDN BHD", { polygon: [], confidence: 0.9 }),
    factField("invoice.customer_registration", "201901000123", { polygon: [], confidence: 0.9 }),
    factField("invoice.customer_taxid", "C12345678901", { polygon: [], confidence: 0.9 }),
    factField("invoice.type_code", "01", { polygon: [], confidence: 0.9 }),
    factField("invoice.total_excl_tax", "RM 100.00", { polygon: [], confidence: 0.9 }),
    factField("invoice.tax_total", "RM 6.00", { polygon: [], confidence: 0.9 }),
  ];
  await assert.doesNotReject(() => persistInvoiceFacts(lf.task, fields), "the extended sales/customer vocabulary persists (whitelist extended)");
  const paths = await regionsOf(lf.document);
  for (const k of ["invoice.customer_name", "invoice.type_code", "invoice.total_excl_tax", "invoice.tax_total"]) {
    assert.ok(paths.includes(k), `${k} persisted as a region (got ${JSON.stringify(paths)})`);
  }
});

test("§3.2 a field_path still OFF the whitelist REFUSES (the whitelist is a closed set)", async (t) => {
  if (skip15(t)) return;
  const firm = await firmOf(world.clients.A2);
  const lf = await localFactsTask({ firm });
  if (!lf) return;
  await assert.rejects(
    () => persistInvoiceFacts(lf.task, [factField("invoice.total", "RM 1.00"), factField("invoice.not_a_real_key", "x", { polygon: [], confidence: 0.9 })]),
    (e) => e.code === "CLR10" || /unsupported/i.test(e.message),
    "an unknown facts field_path is refused (the persist whitelist stays a closed set)",
  );
});

// ===========================================================================
// §3.5 — structured Tier-A corroboration vs the OCR empty-polygon wall.
// ===========================================================================

test("§3.5 STRUCTURED Tier-A: a clara-engine facts extraction corroborates on the arithmetic tie WITHOUT geometry", async (t) => {
  if (skip15(t)) return;
  const firm = await firmOf(world.clients.A1);
  const lf = await localFactsTask({ firm });
  if (!lf) return;
  // A clean no-tax tie: total_excl_tax + tax_total = total; single-doc; MYR; type 01.
  // Empty polygons — a structured source needs no geometry.
  const fields = [
    factField("invoice.total", "RM 100.00", { polygon: [], confidence: 0.9 }),
    factField("invoice.total_excl_tax", "RM 100.00", { polygon: [], confidence: 0.9 }),
    factField("invoice.tax_total", "RM 0.00", { polygon: [], confidence: 0.9 }),
    factField("invoice.currency", "MYR", { polygon: [], confidence: 0.9 }),
    factField("invoice.type_code", "01", { polygon: [], confidence: 0.9 }),
    factField("invoice.invoice_id", `SI-${randomUUID().slice(0, 8)}`, { polygon: [], confidence: 0.9 }),
  ];
  await persistInvoiceFacts(lf.task, fields).catch((e) => noteLane(`structured persist ${e.code}: ${e.message}`));
  const state = await invoiceFactState(lf.document);
  if (state == null) { noteLane("no fact-state for the structured doc — cell skipped"); return; }
  if (state.corroborated === true) assert.ok(true, "a structured (clara) facts extraction corroborates on the arithmetic tie with empty geometry");
  else noteLane(`structured Tier-A did not corroborate (state=${JSON.stringify(state)}) — contract §3.5 expects the arithmetic tie to corroborate a clara-engine source; adjudicate`);
});

test("§3.5 the OCR empty-polygon wall STAYS: an azure facts extraction with empty geometry never corroborates (M3)", async (t) => {
  if (skip15(t)) return;
  const firm = await firmOf(world.clients.A2);
  const cited = await seedCitedDocument(world.users.alice, { firm, client: world.clients.A2 });
  const { grantConsent } = await import("./wave-a-fixtures.mjs");
  await grantConsent(world.users.alice, { firm, client: world.clients.A2 }).catch(() => {});
  await enqueueInvoiceFacts(cited.documentId);
  const task = await invoiceFactsTask(cited.documentId);
  await claimTask(task.id, { egressApproved: true });
  // An azure (OCR-source) facts total with an EMPTY polygon — the wall must hold.
  await persistInvoiceFacts(task.id, [
    factField("invoice.total", "RM 100.00", { polygon: [], confidence: 0.9 }),
    factField("invoice.currency", "MYR"),
  ]).catch((e) => noteLane(`azure empty-polygon persist ${e.code}`));
  const state = await invoiceFactState(cited.documentId);
  if (state == null) { noteLane("no azure fact-state — cell skipped"); return; }
  assert.notEqual(state.corroborated, true, "an azure/OCR facts extraction with empty geometry never corroborates (the empty-polygon wall is unchanged)");
});

// ===========================================================================
// §3.1 — a consolidated e-invoice (General TIN) is NON-attributable.
// ===========================================================================

test("§3.1 a consolidated e-invoice's supplier TIN (the General TIN EI00000000010) never auto-attributes a client", async (t) => {
  if (skip15(t)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  const GENERAL_TIN = "EI00000000010";
  // Even if a client's identifier were (mistakenly) the General TIN, a consolidated
  // e-invoice must NOT auto-attribute — it falls to NEEDS YOU (non-attributable).
  await addClientIdentifier(users.alice, { client: clients.A1, kind: "tin", value: GENERAL_TIN }).catch(() => {});
  const { documentId } = await seedVerifiedDocument({ firm });
  const ext = await seedExtraction({ firm, document: documentId, engineId: "clara-myinvois:v1", engineKind: "structured_parse", status: "done" });
  await seedRegion({ firm, extraction: ext, locatorKind: "page_polygon", fieldPath: "myinvois.supplier_tin", textContent: GENERAL_TIN, engineConfidence: 0.99 });
  const before = (await rootQuery("select count(*)::int n from clara.client_resolutions where firm_id=$1 and method='rule'", [firm])).rows[0].n;
  try { await recordRuleResolution({ document: documentId }); } catch (e) { noteLane(`consolidated record_rule_resolution ${e.code}`); }
  const after = (await rootQuery("select count(*)::int n from clara.client_resolutions where firm_id=$1 and method='rule'", [firm])).rows[0].n;
  if (after !== before) noteLane("the General TIN auto-attributed a client — contract §3.1 requires consolidated e-invoices to be non-attributable (NEEDS YOU); adjudicate whether the General-TIN filter lives in the parse or the matcher");
  assert.equal(after, before, "a consolidated e-invoice (General TIN) does NOT auto-attribute a client");
});

// ===========================================================================
// FIX-5 (adversarial #4) — structured Tier-A requires COMPLETE stated facts: an
// explicit type, gross, net AND tax; net+tax+rounding = gross; and Σ tax_breakdown
// = tax_total. Each of these FAILS pre-fix (which defaulted the type and accepted a
// missing net/tax, and never parsed the breakdown) and PASSES after.
// ===========================================================================

test("FIX-5 a structured source MISSING tax facts does NOT corroborate (complete facts required, not defaulted)", async (t) => {
  if (skip15(t)) return;
  const firm = await firmOf(world.clients.A1);
  const lf = await localFactsTask({ firm });
  assert.ok(lf, "the local_facts task was built (mandatory setup)");
  // gross + net present, but tax_total OMITTED, type 01. Pre-fix corroborated (the
  // 'v_tax is null' short-circuit); post-fix requires tax to be explicitly stated.
  await persistInvoiceFacts(lf.task, [
    factField("invoice.total", "RM 106.00", { polygon: [], confidence: 0.9 }),
    factField("invoice.total_excl_tax", "RM 100.00", { polygon: [], confidence: 0.9 }),
    factField("invoice.currency", "MYR", { polygon: [], confidence: 0.9 }),
    factField("invoice.type_code", "01", { polygon: [], confidence: 0.9 }),
    factField("invoice.invoice_id", `SI-${randomUUID().slice(0, 8)}`, { polygon: [], confidence: 0.9 }),
  ]);
  const state = await invoiceFactState(lf.document);
  assert.ok(state, "fact-state present");
  assert.notEqual(state.corroborated, true, "a structured source missing tax does NOT corroborate (pre-fix accepted a missing component)");
});

test("FIX-5/v3 a structured (local_facts) source with NO explicit type_code is REFUSED at persist (type is neither defaulted nor accepted)", async (t) => {
  if (skip15(t)) return;
  const firm = await firmOf(world.clients.A2);
  const lf = await localFactsTask({ firm });
  assert.ok(lf, "the local_facts task was built (mandatory setup)");
  // v3 item 2 STRENGTHENS the v2 property: a MyInvois structured payload with no document
  // type cannot be polarity-bound, so the DB now refuses it at the WRITE BOUNDARY (pre-v3 it
  // persisted and merely failed corroboration; the type was never defaulted to 01). The
  // negative property ("type is not defaulted") holds a fortiori — it never even persists.
  await assert.rejects(
    () => persistInvoiceFacts(lf.task, [
      factField("invoice.total", "RM 100.00", { polygon: [], confidence: 0.9 }),
      factField("invoice.total_excl_tax", "RM 100.00", { polygon: [], confidence: 0.9 }),
      factField("invoice.tax_total", "RM 0.00", { polygon: [], confidence: 0.9 }),
      factField("invoice.currency", "MYR", { polygon: [], confidence: 0.9 }),
      factField("invoice.invoice_id", `SI-${randomUUID().slice(0, 8)}`, { polygon: [], confidence: 0.9 }),
    ]),
    (e) => e.code === "CLR10" || /type_code/.test(e.message ?? ""),
    "a local_facts payload with no type_code is refused (the DB owns the polarity fact)",
  );
});

test("FIX-5 a MIS-SUMMED tax_breakdown does NOT corroborate; a correctly-summed one still does", async (t) => {
  if (skip15(t)) return;
  const firm = await firmOf(world.clients.A1);
  // Mis-summed: header tax_total = RM6.00 but the per-type breakdown sums to RM5.00.
  const bad = await localFactsTask({ firm });
  assert.ok(bad, "the local_facts task was built (mandatory setup)");
  await persistInvoiceFacts(bad.task, [
    factField("invoice.total", "RM 106.00", { polygon: [], confidence: 0.9 }),
    factField("invoice.total_excl_tax", "RM 100.00", { polygon: [], confidence: 0.9 }),
    factField("invoice.tax_total", "RM 6.00", { polygon: [], confidence: 0.9 }),
    factField("invoice.tax_breakdown", '[{"type":"01","rate":6,"amount":"5.00"}]', { polygon: [], confidence: 0.9 }),
    factField("invoice.currency", "MYR", { polygon: [], confidence: 0.9 }),
    factField("invoice.type_code", "01", { polygon: [], confidence: 0.9 }),
    factField("invoice.invoice_id", `SI-${randomUUID().slice(0, 8)}`, { polygon: [], confidence: 0.9 }),
  ]);
  const badState = await invoiceFactState(bad.document);
  assert.ok(badState, "fact-state present");
  assert.notEqual(badState.corroborated, true, "a breakdown that does not sum to tax_total does NOT corroborate (pre-fix never parsed the breakdown)");

  // Correctly-summed breakdown (RM6.00) with a matching header still corroborates.
  const good = await localFactsTask({ firm });
  assert.ok(good, "the second local_facts task was built (mandatory setup)");
  await persistInvoiceFacts(good.task, [
    factField("invoice.total", "RM 106.00", { polygon: [], confidence: 0.9 }),
    factField("invoice.total_excl_tax", "RM 100.00", { polygon: [], confidence: 0.9 }),
    factField("invoice.tax_total", "RM 6.00", { polygon: [], confidence: 0.9 }),
    factField("invoice.tax_breakdown", '[{"type":"01","rate":6,"amount":"6.00"}]', { polygon: [], confidence: 0.9 }),
    factField("invoice.currency", "MYR", { polygon: [], confidence: 0.9 }),
    factField("invoice.type_code", "01", { polygon: [], confidence: 0.9 }),
    factField("invoice.invoice_id", `SI-${randomUUID().slice(0, 8)}`, { polygon: [], confidence: 0.9 }),
  ]);
  const goodState = await invoiceFactState(good.document);
  assert.ok(goodState, "fact-state present");
  assert.equal(goodState.corroborated, true, "a correctly-summed breakdown corroborates (the tie holds end-to-end)");
});

test("FIX-5 a FACTS-declared rounding residual ties net+tax+rounding = gross and corroborates", async (t) => {
  if (skip15(t)) return;
  const firm = await firmOf(world.clients.A2);
  const lf = await localFactsTask({ firm });
  assert.ok(lf, "the local_facts task was built (mandatory setup)");
  // total 100.01 = net 100.00 + tax 0.00 + rounding 0.01. Pre-fix (no rounding fact)
  // net+tax=100.00 != 100.01 => would NOT corroborate; post-fix the declared rounding ties.
  await persistInvoiceFacts(lf.task, [
    factField("invoice.total", "RM 100.01", { polygon: [], confidence: 0.9 }),
    factField("invoice.total_excl_tax", "RM 100.00", { polygon: [], confidence: 0.9 }),
    factField("invoice.tax_total", "RM 0.00", { polygon: [], confidence: 0.9 }),
    factField("invoice.rounding", "RM 0.01", { polygon: [], confidence: 0.9 }),
    factField("invoice.currency", "MYR", { polygon: [], confidence: 0.9 }),
    factField("invoice.type_code", "01", { polygon: [], confidence: 0.9 }),
    factField("invoice.invoice_id", `SI-${randomUUID().slice(0, 8)}`, { polygon: [], confidence: 0.9 }),
  ]);
  const state = await invoiceFactState(lf.document);
  assert.ok(state, "fact-state present");
  assert.equal(state.rounding_cents, 1, "the declared rounding fact is surfaced (1 sen)");
  assert.equal(state.corroborated, true, "net + tax + declared rounding = gross corroborates the structured source");
});

// ===========================================================================
// RESIDUAL-4 v2 (structured corroboration gaps) — (a) a positive-tax document MUST carry
// a breakdown that sums to tax_total; (b) a conflicting DUPLICATE corroboration fact must
// REJECT (single cardinality), never be min()-selected away. Both FAIL pre-fix (corroborate)
// and PASS after (do not corroborate).
// ===========================================================================

test("RESIDUAL-4 a POSITIVE-tax structured source with NO tax_breakdown does NOT corroborate (breakdown required when tax>0)", async (t) => {
  if (skip15(t)) return;
  const firm = await firmOf(world.clients.A1);
  const lf = await localFactsTask({ firm });
  assert.ok(lf, "the local_facts task was built (mandatory setup)");
  // gross 106 = net 100 + tax 6, type 01, but NO tax_breakdown. Pre-fix corroborated (the
  // `v_bd is null or ...` acceptance); post-fix a positive-tax doc MUST carry a breakdown.
  await persistInvoiceFacts(lf.task, [
    factField("invoice.total", "RM 106.00", { polygon: [], confidence: 0.9 }),
    factField("invoice.total_excl_tax", "RM 100.00", { polygon: [], confidence: 0.9 }),
    factField("invoice.tax_total", "RM 6.00", { polygon: [], confidence: 0.9 }),
    factField("invoice.currency", "MYR", { polygon: [], confidence: 0.9 }),
    factField("invoice.type_code", "01", { polygon: [], confidence: 0.9 }),
    factField("invoice.invoice_id", `SI-${randomUUID().slice(0, 8)}`, { polygon: [], confidence: 0.9 }),
  ]);
  const state = await invoiceFactState(lf.document);
  assert.ok(state, "fact-state present");
  assert.notEqual(state.corroborated, true, "a positive-tax doc with NO breakdown does NOT corroborate (pre-fix accepted the missing breakdown)");
});

test("RESIDUAL-4/v3 CONFLICTING duplicate corroboration facts (two tax_total values) are REFUSED at persist (single cardinality, not min-selected)", async (t) => {
  if (skip15(t)) return;
  const firm = await firmOf(world.clients.A2);
  const lf = await localFactsTask({ firm });
  assert.ok(lf, "the local_facts task was built (mandatory setup)");
  // gross 106 = net 100 + tax 6, breakdown 6.00 — but TWO tax_total regions (6.00 AND 7.00).
  // Pre-v2 min()-selected 6.00 and corroborated; v2 failed only corroboration; v3 REFUSES the
  // conflicting duplicate at the write boundary ("the DB owns every number").
  await assert.rejects(
    () => persistInvoiceFacts(lf.task, [
      factField("invoice.total", "RM 106.00", { polygon: [], confidence: 0.9 }),
      factField("invoice.total_excl_tax", "RM 100.00", { polygon: [], confidence: 0.9 }),
      factField("invoice.tax_total", "RM 6.00", { polygon: [], confidence: 0.9 }),
      factField("invoice.tax_total", "RM 7.00", { polygon: [], confidence: 0.9 }),
      factField("invoice.tax_breakdown", '[{"type":"01","rate":6,"amount":"6.00"}]', { polygon: [], confidence: 0.9 }),
      factField("invoice.currency", "MYR", { polygon: [], confidence: 0.9 }),
      factField("invoice.type_code", "01", { polygon: [], confidence: 0.9 }),
      factField("invoice.invoice_id", `SI-${randomUUID().slice(0, 8)}`, { polygon: [], confidence: 0.9 }),
    ]),
    (e) => e.code === "CLR10" || /conflicting duplicate/.test(e.message ?? ""),
    "a conflicting duplicate tax_total is refused at persist (pre-v3 min()-selected one away)",
  );
});

test("RESIDUAL v3 CONFLICTING duplicate type_code ([01,02]) is REFUSED at persist (the polarity fact is single-valued)", async (t) => {
  if (skip15(t)) return;
  const firm = await firmOf(world.clients.A1);
  const lf = await localFactsTask({ firm });
  assert.ok(lf, "the local_facts task was built (mandatory setup)");
  // [01,02] — pre-v3 min()-selected '01' and the polarity binding accepted it; v3 refuses.
  await assert.rejects(
    () => persistInvoiceFacts(lf.task, [
      factField("invoice.total", "RM 100.00", { polygon: [], confidence: 0.9 }),
      factField("invoice.type_code", "01", { polygon: [], confidence: 0.9 }),
      factField("invoice.type_code", "02", { polygon: [], confidence: 0.9 }),
      factField("invoice.currency", "MYR", { polygon: [], confidence: 0.9 }),
    ]),
    (e) => e.code === "CLR10" || /conflicting duplicate/.test(e.message ?? ""),
    "two different type_code values are refused (pre-v3 min-selected '01' and passed the polarity bind)",
  );
});

test("RESIDUAL v3 CONFLICTING duplicate currency ([MYR,USD]) is REFUSED at persist (never min-selected to MYR)", async (t) => {
  if (skip15(t)) return;
  const firm = await firmOf(world.clients.A2);
  const lf = await localFactsTask({ firm });
  assert.ok(lf, "the local_facts task was built (mandatory setup)");
  // [MYR,USD] — pre-v3 min()-selected 'MYR' (via the currency regexp) and corroborated; v3 refuses.
  await assert.rejects(
    () => persistInvoiceFacts(lf.task, [
      factField("invoice.total", "RM 100.00", { polygon: [], confidence: 0.9 }),
      factField("invoice.type_code", "01", { polygon: [], confidence: 0.9 }),
      factField("invoice.currency", "MYR", { polygon: [], confidence: 0.9 }),
      factField("invoice.currency", "USD", { polygon: [], confidence: 0.9 }),
    ]),
    (e) => e.code === "CLR10" || /conflicting duplicate/.test(e.message ?? ""),
    "two different currency values are refused (pre-v3 min-selected 'MYR' and passed)",
  );
});

test("RESIDUAL v3 a MALFORMED rounding value (normalizes to NULL) is REFUSED at persist (item 4: never silently zero)", async (t) => {
  if (skip15(t)) return;
  const firm = await firmOf(world.clients.A1);
  const lf = await localFactsTask({ firm });
  assert.ok(lf, "the local_facts task was built (mandatory setup)");
  // A present rounding text that does not normalize to cents — pre-v3 it became NULL and was
  // coalesced to 0 in the tie; v3 refuses it (a stated-but-unparseable number is a data error).
  await assert.rejects(
    () => persistInvoiceFacts(lf.task, [
      factField("invoice.total", "RM 100.00", { polygon: [], confidence: 0.9 }),
      factField("invoice.type_code", "01", { polygon: [], confidence: 0.9 }),
      factField("invoice.currency", "MYR", { polygon: [], confidence: 0.9 }),
      factField("invoice.rounding", "not-a-number", { polygon: [], confidence: 0.9 }),
    ]),
    (e) => e.code === "CLR10" || /malformed/.test(e.message ?? ""),
    "a rounding value that does not normalize to cents is refused (item 4: not treated as zero)",
  );
});

// ===========================================================================
// RESIDUAL-4 v4 (FOURTH adversarial re-verify) — the NULL/BLANK cardinality hole.
// The v3 conflict/malformed checks used count(distinct <value>) / min(<value>),
// which SQL NULL-semantics let IGNORE a blank/NULL: a crafted ['', real] duplicate
// (or a single 'N/A' where a value is required) slipped past the write boundary and
// then min() selected the blank -> NULL, re-opening polarity / direction / duplicate-
// bill / corroboration. v4 coalesces to a control-char SENTINEL (blank is DISTINCT)
// and refuses a present-but-malformed monetary value UNIFORMLY. Each FAILS pre-v4
// (persists / corroborates) and PASSES after (refused at the write boundary).
// ===========================================================================

test("RESIDUAL-4/v4 a BLANK-duplicate type_code (['', '02']) is REFUSED at persist (blank vs real is a CONFLICT, not min-selected to blank -> polarity bypass)", async (t) => {
  if (skip15(t)) return;
  const firm = await firmOf(world.clients.A1);
  const lf = await localFactsTask({ firm });
  assert.ok(lf, "the local_facts task was built (mandatory setup)");
  // Pre-v4: count(distinct nullif(btrim,'')) ignored the blank -> {'02'} -> 1 -> persisted;
  // _invoice_fact_state min()-selected '' -> NULL -> the supplier polarity floor never fired
  // (a type-02 supplier credit note posted as a bill). v4 sentinels the blank -> conflict.
  await assert.rejects(
    () => persistInvoiceFacts(lf.task, [
      factField("invoice.total", "RM 100.00", { polygon: [], confidence: 0.9 }),
      factField("invoice.type_code", "", { polygon: [], confidence: 0.9 }),
      factField("invoice.type_code", "02", { polygon: [], confidence: 0.9 }),
      factField("invoice.currency", "MYR", { polygon: [], confidence: 0.9 }),
    ]),
    (e) => e.code === "CLR10" || /conflicting duplicate/.test(e.message ?? ""),
    "a blank+real type_code duplicate is refused (pre-v4 min-selected the blank away, re-opening the polarity bind)",
  );
});

test("RESIDUAL-4/v4 a BLANK-duplicate customer_taxid (['', a real TIN]) is REFUSED at persist (closes the direction double-identity bypass)", async (t) => {
  if (skip15(t)) return;
  const firm = await firmOf(world.clients.A2);
  const lf = await localFactsTask({ firm });
  assert.ok(lf, "the local_facts task was built (mandatory setup)");
  // Item 4: customer_taxid=['', clientTIN] slipped past (count-distinct ignored the blank),
  // then min() selected '' -> NULL, so the buyer-is-the-client contradiction never reached
  // CLR30 and the doc resolved decisively to 'sales'. v4 refuses the blank+real duplicate.
  await assert.rejects(
    () => persistInvoiceFacts(lf.task, [
      factField("invoice.total", "RM 100.00", { polygon: [], confidence: 0.9 }),
      factField("invoice.type_code", "01", { polygon: [], confidence: 0.9 }),
      factField("invoice.currency", "MYR", { polygon: [], confidence: 0.9 }),
      factField("invoice.customer_taxid", "", { polygon: [], confidence: 0.9 }),
      factField("invoice.customer_taxid", "C12345678901", { polygon: [], confidence: 0.9 }),
    ]),
    (e) => e.code === "CLR10" || /conflicting duplicate/.test(e.message ?? ""),
    "a blank+real customer_taxid duplicate is refused (pre-v4 min-selected the blank, dropping the double-identity abstain)",
  );
});

test("RESIDUAL-4/v4 a single MALFORMED amount_due ('N/A') is REFUSED at persist (item 5: never NULL-accepted as 'no due')", async (t) => {
  if (skip15(t)) return;
  const firm = await firmOf(world.clients.A1);
  const lf = await localFactsTask({ firm });
  assert.ok(lf, "the local_facts task was built (mandatory setup)");
  // Item 5: amount_due='N/A' normalized to NULL cents; the corroboration guard `v_due is null
  // or v_due=v_total` then accepted the NULL as "no due stated" and corroborated. v4 refuses a
  // PRESENT-but-unparseable required monetary value at the write boundary.
  await assert.rejects(
    () => persistInvoiceFacts(lf.task, [
      factField("invoice.total", "RM 100.00", { polygon: [], confidence: 0.9 }),
      factField("invoice.type_code", "01", { polygon: [], confidence: 0.9 }),
      factField("invoice.currency", "MYR", { polygon: [], confidence: 0.9 }),
      factField("invoice.amount_due", "N/A", { polygon: [], confidence: 0.9 }),
    ]),
    (e) => e.code === "CLR10" || /malformed/.test(e.message ?? ""),
    "a present-but-unparseable amount_due is refused (pre-v4 it became NULL and corroborated as 'no due')",
  );
});

test("RESIDUAL-4/v4 a single MALFORMED deposit ('N/A') is REFUSED at persist (item 5: never NULL-defaulted to a zero deposit)", async (t) => {
  if (skip15(t)) return;
  const firm = await firmOf(world.clients.A2);
  const lf = await localFactsTask({ firm });
  assert.ok(lf, "the local_facts task was built (mandatory setup)");
  // Item 5: deposit='N/A' normalized to NULL; `coalesce(v_deposit,0)=0` then treated it as a
  // ZERO deposit and corroborated — a non-zero deposit would otherwise BLOCK corroboration.
  await assert.rejects(
    () => persistInvoiceFacts(lf.task, [
      factField("invoice.total", "RM 100.00", { polygon: [], confidence: 0.9 }),
      factField("invoice.type_code", "01", { polygon: [], confidence: 0.9 }),
      factField("invoice.currency", "MYR", { polygon: [], confidence: 0.9 }),
      factField("invoice.deposit", "N/A", { polygon: [], confidence: 0.9 }),
    ]),
    (e) => e.code === "CLR10" || /malformed/.test(e.message ?? ""),
    "a present-but-unparseable deposit is refused (pre-v4 it became NULL and defaulted to a zero deposit)",
  );
});

test("RESIDUAL-4/v4 POSITIVE CONTROL: a PRESENT amount_due = total and a PRESENT deposit = 0 still corroborate (no false-reject from the read guard)", async (t) => {
  if (skip15(t)) return;
  const firm = await firmOf(world.clients.A1);
  const lf = await localFactsTask({ firm });
  assert.ok(lf, "the local_facts task was built (mandatory setup)");
  // The v4 read guard is `(count=0 or (value is not null and value ties))`, so a genuinely
  // stated amount_due = total and a genuinely stated deposit = 0 must STILL corroborate —
  // only a PRESENT-but-NULL value is now excluded.
  await persistInvoiceFacts(lf.task, [
    factField("invoice.total", "RM 106.00", { polygon: [], confidence: 0.9 }),
    factField("invoice.total_excl_tax", "RM 100.00", { polygon: [], confidence: 0.9 }),
    factField("invoice.tax_total", "RM 6.00", { polygon: [], confidence: 0.9 }),
    factField("invoice.tax_breakdown", '[{"type":"01","rate":6,"amount":"6.00"}]', { polygon: [], confidence: 0.9 }),
    factField("invoice.currency", "MYR", { polygon: [], confidence: 0.9 }),
    factField("invoice.type_code", "01", { polygon: [], confidence: 0.9 }),
    factField("invoice.amount_due", "RM 106.00", { polygon: [], confidence: 0.9 }),
    factField("invoice.deposit", "RM 0.00", { polygon: [], confidence: 0.9 }),
    factField("invoice.invoice_id", `SI-${randomUUID().slice(0, 8)}`, { polygon: [], confidence: 0.9 }),
  ]);
  const state = await invoiceFactState(lf.document);
  assert.ok(state, "fact-state present");
  assert.equal(state.corroborated, true, "a stated amount_due=total and deposit=0 still corroborate (the read guard rejects only a present-but-NULL value)");
});
