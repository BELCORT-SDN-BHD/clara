// 0052 (F7) rig — `invoice.contact_person` joins persist_invoice_facts' CLOSED field_path
// allowlist. Driven on the AZURE `invoice_facts` lane, deliberately: that is the lane the X7
// customer-identity reader emits from (packages/runtime/lib/invoice-customer-identity.mjs), so
// the cells exercise the path the fix actually travels rather than a structurally similar one.
//
// WHY THE FACT EXISTS AT ALL. On BOTH real KONG CHENG invoices (docs/plan/wave-7a-acceptance-h1
// .md exhibit E7 + manifest rows 1 and 12) Azure Document Intelligence typed `CustomerName` as
// the `Attn :` CONTACT PERSON — "Lim Xiao Shan" — instead of KONG CHENG RESTAURANTS SDN BHD in
// the bill-to box. Both drafts (`53504c0e-...` RM2,800 and `7995b1a3-...` RM600) still sit
// status='draft' skip=`counterparty_unresolved`. X7 now reads the boxed party for
// `invoice.customer_name` and emits the person here instead.
//
// WHY THE DB HALF IS NOT OPTIONAL: the allowlist is CLOSED and raises CLR10 'unsupported invoice
// field_path %'. Without 0052 the first extraction carrying the new fact does not DROP it — it
// RAISES, forfeiting the whole persist and taking the working `invoice.total` capture with it.
// That is the failure these cells stand guard over.
//
// CONTRACT-BLIND on the migration file: 0052's presence is probed off the LIVE CATALOG
// (pg_proc.prosrc), never by reading the .sql. Cells skip loudly (counted) when it is absent, so
// this file is safe to run against a pre-0052 target.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  rootQuery, endPool, printLaneNotes, noteLane, printSkipCount, markSkip,
  waveAEnsureReady, buildWorld, firmOf, grantConsent,
  seedCitedDocument, mintLegacyInvoiceFactsTask, invoiceFactsTask, claimTask, persistInvoiceFacts,
  failInvoiceFacts, factField,
} from "./wave-a-fixtures.mjs";

let ready = false;
let has52 = false;
let world = null;

/** Is 0052 applied? Read the LIVE function body, not the migration file. */
async function has0052() {
  const r = await rootQuery(
    `select 1 from pg_proc p where p.pronamespace='clara'::regnamespace
       and p.proname='persist_invoice_facts' and position('invoice.contact_person' in p.prosrc) > 0`,
  );
  return r.rows.length > 0;
}

before(async () => {
  ready = await waveAEnsureReady();
  if (!ready) { noteLane("0011 surface absent — x52 suite skipped"); return; }
  has52 = await has0052();
  if (!has52) noteLane("0052 not applied — invoice.contact_person is absent from the live allowlist");
  world = await buildWorld();
});
after(async () => { printLaneNotes("x52-contact-person-facts"); printSkipCount("x52-contact-person-facts"); await endPool(); });

function skip52(t) {
  if (!ready || !has52) { markSkip(); t.skip("0052 (invoice.contact_person) not present"); return true; }
  return false;
}

/**
 * A claimed, RUNNING invoice_facts task on a fresh cited document.
 *
 * THROWS rather than returning null, deliberately. The first cut of this helper noted the
 * failure and returned null, and the cell then `return`ed early and reported **ok** — a green
 * tick for a cell that never ran an assertion. That is the house's own review law 2 in miniature
 * ("absence is not evidence"), and it hid a real defect: the live
 * clara.claim_document_processing_task caps CONCURRENCY at firm_document_limits.ocr_concurrency
 * (default 2) counting every `running` task across ocr/invoice_facts/statement_facts, and the
 * cells whose persist is EXPECTED to reject were leaving their task `running` forever, so the
 * fourth cell could never claim. The leak is settled at each rejection site now (see
 * `settle`), and this helper fails loudly if a task is ever unclaimable again.
 */
async function factsTask(client) {
  const firm = await firmOf(client);
  const sub = world.users.alice;
  await grantConsent(sub, { firm, client }).catch(() => {});
  const cited = await seedCitedDocument(sub, { firm, client, quote: "RM 2,800.00", kind: "invoice" });
  // F-A1 PR-3 CUTOVER: the router's invoice-kind arm now mints llm_witness, never
  // invoice_facts (no dual-run, D9) -- this fixture only needs a task ON the
  // invoice_facts lane to exercise ITS downstream machinery, so it mints directly.
  await mintLegacyInvoiceFactsTask(cited.documentId);
  const task = await invoiceFactsTask(cited.documentId);
  assert.ok(task, "an invoice_facts task must be minted — no task means this cell proved nothing");
  await claimTask(task.id, { egressApproved: true });
  const st = (await rootQuery("select status from clara.document_processing_tasks where id=$1", [task.id])).rows[0]?.status;
  assert.equal(st, "running", "the task must be RUNNING before persist — a skipped cell is not a passing cell");
  return { document: cited.documentId, task: task.id };
}

/** Settle a task whose persist was EXPECTED to reject, so it stops holding a concurrency slot.
 *  A real failed extraction is failed, not left running; the rig models that rather than
 *  quietly starving the cells that follow it. */
async function settle(task) {
  await failInvoiceFacts(task, "engine_error").catch((e) => noteLane(`settle ${e.code}: ${e.message}`));
}

async function regionsOf(document) {
  const r = await rootQuery(
    `select rg.field_path, rg.text_content, rg.monetary_raw, rg.monetary_cents
       from clara.document_regions rg join clara.document_extractions e on e.id=rg.extraction_id
      where e.document_id=$1 and e.engine_kind='invoice_facts' order by rg.field_path`, [document],
  );
  return r.rows;
}

const invoiceId = () => factField("invoice.invoice_id", `RSINV-${randomUUID().slice(0, 8)}`);

// ===========================================================================
// The admission itself
// ===========================================================================

test("0052 invoice.contact_person PERSISTS, and the PARTY stays its own separate fact", async (t) => {
  if (skip52(t)) return;
  const ft = await factsTask(world.clients.A1);
  await assert.doesNotReject(
    () => persistInvoiceFacts(ft.task, [
      factField("invoice.total", "RM 2,800.00"),
      factField("invoice.currency", "MYR"),
      invoiceId(),
      factField("invoice.customer_name", "KONG CHENG RESTAURANTS SDN BHD"),
      factField("invoice.contact_person", "Lim Xiao Shan"),
    ]),
    "the contact person persists ALONGSIDE the customer name — the F7 fix emits two facts, not one",
  );
  const rows = await regionsOf(ft.document);
  const paths = rows.map((r) => r.field_path);
  assert.ok(paths.includes("invoice.contact_person"), `contact_person persisted (got ${JSON.stringify(paths)})`);
  assert.ok(paths.includes("invoice.customer_name"), "and the boxed PARTY is still its own row");
  const contact = rows.find((r) => r.field_path === "invoice.contact_person");
  assert.equal(contact.text_content, "Lim Xiao Shan");
  // NON-MONETARY: it must land as text and never be routed through _normalize_invoice_cents —
  // a text fact in the cents path normalizes to NULL and is then refused as "malformed", which
  // would turn every invoice carrying an Attn line into a hard CLR10 failure.
  assert.equal(contact.monetary_raw, null, "a contact person is not money");
  assert.equal(contact.monetary_cents, null);
});

test("0052 the taxonomy is still CLOSED — an unknown field_path still raises CLR10", async (t) => {
  if (skip52(t)) return;
  const ft = await factsTask(world.clients.A2);
  // The widening admits ONE name. It must not have loosened the guard itself: a taxonomy that
  // stopped refusing would silently absorb any future typo as a first-class fact.
  await assert.rejects(
    () => persistInvoiceFacts(ft.task, [
      factField("invoice.total", "RM 600.00"),
      factField("invoice.contact_persons", "Lim Xiao Shan"), // NB: plural — one letter off
    ]),
    (e) => e.code === "CLR10" || /unsupported/i.test(e.message),
    "a near-miss on the NEW name is refused exactly like any other unknown path",
  );
  await settle(ft.task);
});

// ===========================================================================
// The conflicting-duplicate doctrine, applied uniformly to the new path
// ===========================================================================

test("0052 two DIFFERING contact persons FORFEIT the extraction", async (t) => {
  if (skip52(t)) return;
  const ft = await factsTask(world.clients.A1);
  // The writer's uniform rule: a field appearing more than once with ANY differing value is a
  // contradiction the DB refuses. UNREACHABLE from the only producer that exists today — the X7
  // reader is uniqueness-or-nothing and emits at most one contact row — which is precisely why
  // it is pinned here: the doctrine is what protects the SECOND producer, whenever it arrives.
  await assert.rejects(
    () => persistInvoiceFacts(ft.task, [
      factField("invoice.total", "RM 600.00"),
      invoiceId(),
      factField("invoice.contact_person", "Lim Xiao Shan"),
      factField("invoice.contact_person", "Tan Wei Ming"),
    ]),
    (e) => e.code === "CLR10" || /conflicting duplicate/i.test(e.message),
    "two named contacts for one extraction is a contradiction, exactly as for every other text fact",
  );
  // FORFEIT means FORFEIT: nothing from that payload may survive, not even the total.
  assert.deepEqual(await regionsOf(ft.document), [], "a refused persist writes no regions at all");
  await settle(ft.task);
});

test("0052 two IDENTICAL contact persons COLLAPSE — a repeated print is one fact", async (t) => {
  if (skip52(t)) return;
  const ft = await factsTask(world.clients.A2);
  // The measured shape this admits: a two-page invoice that repeats its bill-to box, which the
  // X7 reader collapses before it ever reaches here. The DB agrees rather than second-guessing.
  await assert.doesNotReject(
    () => persistInvoiceFacts(ft.task, [
      factField("invoice.total", "RM 600.00"),
      invoiceId(),
      factField("invoice.contact_person", "Lim Xiao Shan"),
      factField("invoice.contact_person", "Lim Xiao Shan"),
    ]),
    "the same contact stated twice is one fact, not a contradiction",
  );
  const contacts = (await regionsOf(ft.document)).filter((r) => r.field_path === "invoice.contact_person");
  assert.equal(contacts.length, 2, "both regions persist (identical values collapse at the GUARD, not at the row)");
  assert.deepEqual([...new Set(contacts.map((r) => r.text_content))], ["Lim Xiao Shan"]);
});

// ===========================================================================
// The scoping decision, pinned as a checkable fact
// ===========================================================================

test("0052 does NOT widen the corroboration read surface — that omission is deliberate", async (t) => {
  if (skip52(t)) return;
  // 0052 admits the fact at the WRITE boundary and stops there. clara._invoice_fact_state /
  // _invoice_fact_state_at hand-pick field_paths into named jsonb keys and own CORROBORATION;
  // widening a corroboration-critical body for a non-monetary fact nothing reads yet would be
  // blast radius bought for nothing. The fact is NOT invisible — clara.get_document_extract
  // projects every document_regions row with its field_path, with no enumeration in it at all.
  // A future migration that wants contact_person on the fact-state surface must say so
  // deliberately; this cell (and 0052's own tail guard) is what makes that a decision rather
  // than a drift.
  for (const fn of ["_invoice_fact_state", "_invoice_fact_state_at"]) {
    const r = await rootQuery(
      `select position('contact_person' in p.prosrc) as at from pg_proc p
        where p.pronamespace='clara'::regnamespace and p.proname=$1`, [fn],
    );
    if (r.rows.length === 0) { noteLane(`${fn} absent — scoping cell skipped for it`); continue; }
    for (const row of r.rows) assert.equal(Number(row.at), 0, `clara.${fn} must not mention contact_person`);
  }
});
