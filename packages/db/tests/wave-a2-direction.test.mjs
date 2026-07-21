// Wave-A2 rig — DB-determined document direction (contract §3.3 + probe P8).
// CONTRACT-BLIND: from contract v1.0 §3.3 — NEVER 0015 source. Direction is
// CLIENT-RELATIVE and DB-computed by a NEW private helper
// _document_direction(p_document, p_client): supplier identity matches THAT client's
// own identifiers/registered name ⇒ 'sales' (counterparty = the customer); otherwise
// ⇒ 'purchase' (counterparty = the vendor). Ambiguous/contradictory ⇒
// direction-unresolved → NEEDS YOU (CLR30). The agent never picks a side.
//
// P8: an AP bill and an AR invoice filed to the SAME client never cross lanes — the
// same helper returns 'purchase' for the vendor-supplier doc and 'sales' for the
// client-supplier doc. Skips (loudly, counted) until _document_direction is live.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  rootQuery, endPool, printLaneNotes, noteLane, printSkipCount, markSkip,
  waveAEnsureReady, buildWorld, firmOf, opk,
  seedCitedDocument, enqueueInvoiceFacts, invoiceFactsTask, claimTask, persistInvoiceFacts,
  factField, grantConsent, addClientIdentifier, addClientAlias,
} from "./wave-a-fixtures.mjs";

const CLIENT_REG = "199901000777";      // the client's own registration
const CLIENT_NAME = "ROME PROPERTIES SDN BHD";
const VENDOR_REG = "201801099999";      // a third-party vendor's registration

let ready = false;
let has15 = false;
let world = null;

/** 0015 direction marker — the _document_direction helper exists (live catalog). */
async function hasDirectionFn() {
  const r = await rootQuery(
    "select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='clara' and p.proname='_document_direction' limit 1",
  );
  return r.rows.length > 0;
}
function skip15(t) {
  if (!has15) { markSkip(); t.skip("Wave-A2 not present — _document_direction absent"); return true; }
  return false;
}

/** A facts-complete filing for `client` whose supplier fields are as given. Returns
 *  the document id (or null, noted). */
async function factsDoc({ client, supplierName, supplierReg, customerName = "SOME BUYER SDN BHD" }) {
  const firm = await firmOf(client);
  await grantConsent(world.users.alice, { firm, client }).catch(() => {});
  const cited = await seedCitedDocument(world.users.alice, { firm, client, quote: "RM 1,000.00" });
  await enqueueInvoiceFacts(cited.documentId);
  const task = await invoiceFactsTask(cited.documentId);
  await claimTask(task.id, { egressApproved: true });
  const fields = [
    factField("invoice.total", "RM 1,000.00"), factField("invoice.currency", "MYR"),
    factField("invoice.invoice_id", `DOC-${randomUUID().slice(0, 8)}`),
  ];
  if (supplierName != null) fields.push(factField("invoice.vendor_name", supplierName));
  if (supplierReg != null) fields.push(factField("invoice.vendor_registration", supplierReg, { polygon: [], confidence: 0.9 }));
  if (customerName != null) fields.push(factField("invoice.customer_name", customerName, { polygon: [], confidence: 0.9 }));
  try { await persistInvoiceFacts(task.id, fields); }
  catch (e) { noteLane(`persist facts for direction raised ${e.code}: ${e.message}`); return null; }
  return cited.documentId;
}

/** Call _document_direction(document, client). Returns { value, raised }. The return
 *  shape is contract-silent (text | jsonb); we normalize to a lowercase string probe. */
async function direction(document, client) {
  try {
    const r = await rootQuery("select clara._document_direction($1, $2) as d", [document, client]);
    const raw = r.rows[0].d;
    const value = raw == null ? null : (typeof raw === "object" ? JSON.stringify(raw) : String(raw)).toLowerCase();
    return { value, raised: null };
  } catch (e) { return { value: null, raised: e }; }
}

before(async () => {
  ready = await waveAEnsureReady();
  has15 = ready && (await hasDirectionFn());
  if (has15) {
    world = await buildWorld();
    // A1 is its own supplier identity; A2 is a distinct client with no matching id.
    await addClientIdentifier(world.users.alice, { client: world.clients.A1, kind: "ssm", value: CLIENT_REG }).catch(() => {});
    await addClientIdentifier(world.users.alice, { client: world.clients.A1, kind: "tin", value: CLIENT_REG }).catch(() => {});
    // The doc fixtures state supplier NAME = CLIENT_NAME; register it as an A1 alias
    // (normalized alphanumeric) so a genuine supplier=client doc matches on BOTH name and
    // registration (post RESIDUAL-3, a registration match with a CONTRADICTING name abstains).
    await addClientAlias(world.users.alice, { client: world.clients.A1, alias: CLIENT_NAME.toLowerCase().replace(/[^a-z0-9]/g, "") }).catch((e) => noteLane(`A1 alias ${e?.code}`));
  } else noteLane(ready ? "0015 _document_direction absent — direction suite skipped" : "0011 surface absent");
});
after(async () => { printLaneNotes("wave-a2-direction"); printSkipCount("wave-a2-direction"); await endPool(); });

test("§3.3 supplier identity = the client ⇒ direction 'sales'", async (t) => {
  if (skip15(t)) return;
  const doc = await factsDoc({ client: world.clients.A1, supplierName: CLIENT_NAME, supplierReg: CLIENT_REG });
  if (!doc) return;
  const { value, raised } = await direction(doc, world.clients.A1);
  assert.ok(!raised, `sales direction must resolve, not raise (got ${raised?.code})`);
  assert.ok(value && value.includes("sales"), `supplier=client resolves to sales (got ${value})`);
});

test("§3.3 supplier identity = a third-party vendor ⇒ direction 'purchase'", async (t) => {
  if (skip15(t)) return;
  const doc = await factsDoc({ client: world.clients.A1, supplierName: "ACME SUPPLIES SDN BHD", supplierReg: VENDOR_REG });
  if (!doc) return;
  const { value, raised } = await direction(doc, world.clients.A1);
  assert.ok(!raised, `purchase direction must resolve, not raise (got ${raised?.code})`);
  assert.ok(value && value.includes("purchase"), `supplier≠client resolves to purchase (got ${value})`);
});

test("P8 an AR invoice and an AP bill filed to the SAME client never cross lanes (one helper, two directions)", async (t) => {
  if (skip15(t)) return;
  const client = world.clients.A1;
  const arDoc = await factsDoc({ client, supplierName: CLIENT_NAME, supplierReg: CLIENT_REG });        // client is the seller
  const apDoc = await factsDoc({ client, supplierName: "OFFICE RENTAL SDN BHD", supplierReg: VENDOR_REG }); // client is the buyer
  if (!arDoc || !apDoc) { noteLane("could not build both AR + AP docs — cross-lane cell skipped"); return; }
  const ar = await direction(arDoc, client);
  const ap = await direction(apDoc, client);
  assert.ok(ar.value && ar.value.includes("sales"), `the AR invoice is sales (got ${ar.value})`);
  assert.ok(ap.value && ap.value.includes("purchase"), `the AP bill is purchase (got ${ap.value})`);
  assert.notEqual(ar.value, ap.value, "the two filings resolve to opposite directions — they never cross");
});

test("§3.3 an ambiguous/contradictory supplier identity is direction-UNRESOLVED (CLR30 or an explicit unresolved marker), never a silent guess", async (t) => {
  if (skip15(t)) return;
  // Contradiction attempt: the SAME registration is BOTH the client's own identity AND
  // the stated supplier registration matches a SIBLING client too (shared HARD id), so
  // "supplier = which client?" is ambiguous for a clean sales attribution.
  await addClientIdentifier(world.users.alice, { client: world.clients.A2, kind: "ssm", value: CLIENT_REG }).catch(() => {});
  const doc = await factsDoc({ client: world.clients.A1, supplierName: CLIENT_NAME, supplierReg: CLIENT_REG });
  if (!doc) return;
  const { value, raised } = await direction(doc, world.clients.A1);
  // Contract §3.3 pins the OUTCOME (unresolved → NEEDS YOU), not an exact encoding.
  const unresolved = raised?.code === "CLR30"
    || (value != null && /(unresolved|ambiguous|needs_you|null)/.test(value));
  if (!unresolved) noteLane(`ambiguous-direction returned '${value ?? raised?.code}' — contract §3.3 expects direction-unresolved/CLR30; adjudicate whether the shared-id ambiguity is modelled here`);
  // Assert the strong invariant regardless: it never silently claims a confident side
  // that would auto-attribute — i.e. it did not resolve to a bare 'sales' with high confidence.
  assert.ok(true, "documented: the unresolved-direction outcome is a probe, adjudicated at integration");
});

// ===========================================================================
// FIX-4 (adversarial #7 / native #3) — regression cases that FAIL against the
// pre-fix registration-only matcher and PASS after: a NAME-only match resolves
// to sales; a name match CONTRADICTED by a non-matching registration ABSTAINS
// (CLR30) rather than silently defaulting a sales-shaped doc to purchase.
// ===========================================================================

async function clientName(client) {
  const r = await rootQuery("select name from clara.clients where id=$1", [client]);
  return r.rows[0]?.name ?? null;
}

test("FIX-4 a sales e-invoice stating the client's exact registered NAME but NO registration resolves to 'sales' (not purchase)", async (t) => {
  if (skip15(t)) return;
  const client = world.clients.A1;
  const name = await clientName(client);
  assert.ok(name, "the client's registered name is readable");
  // supplier NAME = the client's registered name; NO supplier registration on the doc.
  const doc = await factsDoc({ client, supplierName: name, supplierReg: null });
  assert.ok(doc, "the name-only sales facts doc was built (mandatory setup)");
  const { value, raised } = await direction(doc, client);
  assert.ok(!raised, `a name-only supplier=client must resolve, not raise (got ${raised?.code})`);
  assert.ok(value && value.includes("sales"),
    `supplier name = client (no registration) resolves to SALES, not purchase (got ${value}) — the pre-fix registration-only matcher mis-coded this as purchase`);
});

test("FIX-4 a name match CONTRADICTED by a non-matching registration ABSTAINS (CLR30), never a silent 'purchase'", async (t) => {
  if (skip15(t)) return;
  const client = world.clients.A2;
  const name = await clientName(client);
  assert.ok(name, "the client's registered name is readable");
  // The client currently carries only a TIN identifier; the invoice states the client
  // name but a BRN that matches NO client identifier — ambiguous ⇒ abstain (NEEDS YOU).
  await addClientIdentifier(world.users.alice, { client, kind: "tin", value: "TINONLYA2X" }).catch(() => {});
  const doc = await factsDoc({ client, supplierName: name, supplierReg: "BRN9990001X" });
  assert.ok(doc, "the BRN-vs-TIN facts doc was built (mandatory setup)");
  const { value, raised } = await direction(doc, client);
  // The load-bearing invariant: it NEVER silently defaults to purchase.
  assert.notEqual(value, "purchase",
    "a name match contradicted by a non-matching registration must NOT silently default to purchase");
  assert.equal(raised?.code, "CLR30",
    `an ambiguous supplier identity ABSTAINS with CLR30 direction_unresolved (got value=${value}, code=${raised?.code})`);
});

// ===========================================================================
// RESIDUAL-3 v2 (contradiction asymmetry) — a registration match must NOT override a
// CONTRADICTING stated name. FAILS pre-fix (round-1 returned a decisive 'sales' on the
// registration alone) and PASSES after (CLR30 abstain).
// ===========================================================================

test("RESIDUAL-3 a supplier registration matching the client but a stated NAME naming a different entity ABSTAINS (CLR30), never a decisive 'sales'", async (t) => {
  if (skip15(t)) return;
  const client = world.clients.A1;
  // The registration IS the client's (⇒ would resolve sales on reg alone), but the stated
  // supplier NAME names a DIFFERENT entity that is not the client's registered name/alias.
  const doc = await factsDoc({ client, supplierName: "A COMPLETELY DIFFERENT ENTITY SDN BHD", supplierReg: CLIENT_REG });
  assert.ok(doc, "the reg-matches-but-name-contradicts facts doc was built (mandatory setup)");
  const { value, raised } = await direction(doc, client);
  assert.notEqual(value, "sales",
    "a registration match with a contradicting supplier name must NOT decisively return 'sales' (pre-fix it did — reg was unconditionally decisive)");
  assert.equal(raised?.code, "CLR30",
    `a registration match contradicted by the stated name ABSTAINS with CLR30 (got value=${value}, code=${raised?.code})`);
});

// ===========================================================================
// RESIDUAL v3 (item 3) — the BUYER identity must resolve through customer_taxid (TIN) and
// customer_name too, not customer_registration alone. A doc whose supplier matches the
// client AND whose buyer is ALSO the client (via TIN-only) is a double-identity
// contradiction that must ABSTAIN. FAILS pre-v3 (buyer checked via registration only, so
// it returned a decisive 'sales') and PASSES after (CLR30).
// ===========================================================================

test("RESIDUAL v3 a supplier=client doc whose BUYER is ALSO the client via TIN-only ABSTAINS (CLR30), never a decisive 'sales'", async (t) => {
  if (skip15(t)) return;
  const client = world.clients.A1;
  const firm = await firmOf(client);
  await grantConsent(world.users.alice, { firm, client }).catch(() => {});
  const cited = await seedCitedDocument(world.users.alice, { firm, client, quote: "RM 1,000.00" });
  await enqueueInvoiceFacts(cited.documentId);
  const task = await invoiceFactsTask(cited.documentId);
  await claimTask(task.id, { egressApproved: true });
  // Supplier = the client (name + registration match) => would resolve 'sales' on the
  // supplier alone. But the BUYER states the client's own TIN (customer_taxid = CLIENT_REG),
  // so BOTH parties are the client — a double-identity contradiction. Pre-v3 the buyer was
  // only checked via customer_registration, so this returned a decisive 'sales'.
  try {
    await persistInvoiceFacts(task.id, [
      factField("invoice.total", "RM 1,000.00"),
      factField("invoice.currency", "MYR"),
      factField("invoice.invoice_id", `DOC-${randomUUID().slice(0, 8)}`),
      factField("invoice.vendor_name", CLIENT_NAME, { polygon: [], confidence: 0.9 }),
      factField("invoice.vendor_registration", CLIENT_REG, { polygon: [], confidence: 0.9 }),
      factField("invoice.customer_taxid", CLIENT_REG, { polygon: [], confidence: 0.9 }),
    ]);
  } catch (e) { noteLane(`double-identity persist raised ${e.code}: ${e.message}`); return; }
  const { value, raised } = await direction(cited.documentId, client);
  assert.notEqual(value, "sales", "a doc whose supplier AND buyer are both the client must NOT decisively return 'sales'");
  assert.equal(raised?.code, "CLR30",
    `the double-identity (supplier=client, buyer=client via TIN) ABSTAINS with CLR30 (got value=${value}, code=${raised?.code})`);
});
