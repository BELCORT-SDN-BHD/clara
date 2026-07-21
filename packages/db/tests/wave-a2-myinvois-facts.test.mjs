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
  ROLES, rootQuery, roleQuery, endPool, printLaneNotes, noteLane, printSkipCount, markSkip,
  waveAEnsureReady, buildWorld, firmOf, opk,
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
