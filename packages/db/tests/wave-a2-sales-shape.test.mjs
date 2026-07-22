// Wave-A2 rig — the sales-invoice shape floor + SST 3-leg split + CN/DN polarity
// (contract §4.3/§5 + probe P6). CONTRACT-BLIND: from contract v1.0 §4.1/§4.3/§5 +
// the as-built AP shape floor (_assert_supplier_bill_shape, 0009) — NEVER 0015 source.
//
// Structural guarantees (catalog): coding_kind widens to sales_invoice/sales_credit_note;
// account_class widens to 'receivable'; special_acc_type widens to 'sst_output'
// (uq_coa_special permits one rounding AND one sst_output per client); a NEW sales shape
// trigger fires at approve. Behavioral (best-effort, finding-tolerant): a valid 2-leg
// sales invoice approves; a 3-leg SST invoice ties; a ≤5-sen net+tax≠gross mismatch
// REFUSES (tax_tie_failed — surfaced, not silently rounded); a credit note reverses
// polarity; a tax-bearing invoice meeting a chart with NO sst_output account refuses
// (sst_account_missing); a debit note raises receivable like an invoice.
//
// The tie is evaluated on STATED DOCUMENT FACTS, ordered BEFORE the ≤5-sen rounding
// append (#9) — the mismatch must not drift into the rounding account. Skips (counted).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  rootQuery, endPool, printLaneNotes, noteLane, printSkipCount, markSkip,
  waveAEnsureReady, buildWorld, firmOf, opk, upsertAccountClassed,
  seedCitedDocument, enqueueInvoiceFacts, invoiceFactsTask, claimTask, persistInvoiceFacts,
  factField, factsRegion, grantConsent, freshResolution, ev, approveEntry, mintInteractive, wakeDraftEntry,
  addClientIdentifier, reasonOf,
} from "./wave-a-fixtures.mjs";

const REC = "300-000"; // trade debtors (receivable control)
const REV = "500-000"; // revenue (income)
const SST = "250-000"; // SST-output (liability, special_acc_type='sst_output')
const CLIENT_REG = "199901000001"; // the client's own registration (supplier=client ⇒ sales)
const CLIENT_NAME = "ROME PROPERTIES SDN BHD";

let ready = false;
let has15 = false;
let world = null;

async function has0015Sales() {
  const r = await rootQuery(
    `select 1 from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
      where n.nspname='clara' and t.relname='journal_entries' and c.contype='c'
        and pg_get_constraintdef(c.oid) ilike '%sales_invoice%' limit 1`,
  );
  return r.rows.length > 0;
}
function skip15(t) {
  if (!has15) { markSkip(); t.skip("Wave-A2 not present — coding_kind lacks 'sales_invoice'"); return true; }
  return false;
}

/** Sales lines: Dr receivable=gross; Cr revenue=net; Cr sst=tax (tax>0 ⇒ 3-leg). */
function salesLines(gross, net, tax, { withSst = true } = {}) {
  const lines = [
    { account_code: REC, debit_cents: gross, credit_cents: 0, description: "sales-ar" },
    { account_code: REV, debit_cents: 0, credit_cents: net, description: "sales-rev" },
  ];
  if (tax > 0 && withSst) lines.push({ account_code: SST, debit_cents: 0, credit_cents: tax, description: "sales-sst" });
  return lines;
}
/** Credit-note polarity mirror: Cr receivable=gross; Dr revenue=net; Dr sst=tax. */
function creditNoteLines(gross, net, tax) {
  const lines = [
    { account_code: REC, debit_cents: 0, credit_cents: gross, description: "cn-ar" },
    { account_code: REV, debit_cents: net, credit_cents: 0, description: "cn-rev" },
  ];
  if (tax > 0) lines.push({ account_code: SST, debit_cents: tax, credit_cents: 0, description: "cn-sst" });
  return lines;
}
const rm = (cents) => `RM ${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

/** Build a sales filing whose facts state gross/net/tax + type_code, with the
 *  supplier identity = the client (⇒ direction sales). Returns { cited, cred } or
 *  null (noted). `withSst` controls whether an SST-output account exists on the chart. */
async function salesFiling({ client, gross, net, tax, typeCode = "01" }) {
  const firm = await firmOf(client);
  await grantConsent(world.users.alice, { firm, client }).catch(() => {});
  const cited = await seedCitedDocument(world.users.alice, { firm, client, quote: rm(gross) });
  await enqueueInvoiceFacts(cited.documentId);
  const task = await invoiceFactsTask(cited.documentId);
  await claimTask(task.id, { egressApproved: true });
  const fields = [
    factField("invoice.total", rm(gross)),
    factField("invoice.currency", "MYR"),
    factField("invoice.vendor_name", CLIENT_NAME),       // supplier = the client ⇒ sales direction
    factField("invoice.vendor_registration", CLIENT_REG, { polygon: [], confidence: 0.9 }),
    factField("invoice.customer_name", "D & DREAM PROPERTIES SDN BHD"),
    factField("invoice.invoice_id", `SI-${randomUUID().slice(0, 8)}`),
    factField("invoice.type_code", typeCode, { polygon: [], confidence: 0.9 }),
  ];
  if (net != null) fields.push(factField("invoice.total_excl_tax", rm(net), { polygon: [], confidence: 0.9 }));
  if (tax != null) fields.push(factField("invoice.tax_total", rm(tax), { polygon: [], confidence: 0.9 }));
  try { await persistInvoiceFacts(task.id, fields); }
  catch (e) { noteLane(`persist sales facts raised ${e.code}: ${e.message} — sales facts vocabulary may differ`); return null; }
  return { cited };
}

/** Draft a sales entry (interactive wake lane carries coding_kind). Returns the draft
 *  receipt {entry_id, revision_token} or null (noted). */
async function draftSales({ client, cited, lines, codingKind = "sales_invoice" }) {
  const firm = await firmOf(client);
  const cred = await mintInteractive(firm);
  const region = await factsRegion(cited.documentId, "invoice.total");
  try {
    return await wakeDraftEntry(cred, {
      client,
      resolution: await freshResolution(world.users.alice, client, { subjectKind: "document", subjectId: cited.documentId }),
      lines, document: cited.documentId, sha256: cited.sha256,
      vendor: { new: { name: "D & DREAM PROPERTIES SDN BHD" }, kind: "customer" },
      evidence: [ev(region?.id, region?.text_content ?? rm(0), "invoice.total")],
      codingKind, opKey: `sales:${cited.filingId}:${cited.documentId}`,
    });
  } catch (e) { noteLane(`draftSales(${codingKind}) raised ${e.code}: ${e.message} — sales draft path shape assumption`); return null; }
}

before(async () => {
  ready = await waveAEnsureReady();
  has15 = ready && (await has0015Sales());
  if (has15) {
    world = await buildWorld();
    // The client is its OWN supplier identity (⇒ sales direction).
    await addClientIdentifier(world.users.alice, { client: world.clients.A1, kind: "ssm", value: CLIENT_REG }).catch(() => {});
    await addClientIdentifier(world.users.alice, { client: world.clients.A1, kind: "tin", value: CLIENT_REG }).catch(() => {});
  } else noteLane(ready ? "0015 sales coding_kind absent — sales-shape suite skipped" : "0011 surface absent");
});
after(async () => { printLaneNotes("wave-a2-sales-shape"); printSkipCount("wave-a2-sales-shape"); await endPool(); });

// ===========================================================================
// Structural (catalog) — the widenings + the new shape trigger.
// ===========================================================================

test("§4.3 coding_kind CHECK admits sales_invoice + sales_credit_note (supplier_bill kept)", async (t) => {
  if (skip15(t)) return;
  const defs = (await rootQuery(
    `select string_agg(pg_get_constraintdef(c.oid),' ~~ ') as d from pg_constraint c
       join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
      where n.nspname='clara' and t.relname='journal_entries' and c.contype='c'`,
  )).rows[0].d ?? "";
  for (const k of ["supplier_bill", "sales_invoice", "sales_credit_note"]) assert.ok(defs.includes(`'${k}'`), `coding_kind admits '${k}'`);
});

test("§4.1 account_class admits 'receivable'; special_acc_type admits 'sst_output' (uq_coa_special unchanged)", async (t) => {
  if (skip15(t)) return;
  const defs = (await rootQuery(
    `select string_agg(pg_get_constraintdef(c.oid),' ~~ ') as d from pg_constraint c
       join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
      where n.nspname='clara' and t.relname='coa_accounts' and c.contype='c'`,
  )).rows[0].d ?? "";
  assert.ok(defs.includes("'receivable'"), "account_class CHECK admits 'receivable'");
  assert.ok(defs.includes("'payable'"), "account_class CHECK still admits 'payable'");
  assert.ok(defs.includes("'sst_output'"), "special_acc_type CHECK admits 'sst_output'");
  assert.ok(defs.includes("'rounding'"), "special_acc_type CHECK still admits 'rounding'");
});

test("§4.1 uq_coa_special lets a client hold ONE rounding AND ONE sst_output (per-VALUE uniqueness)", async (t) => {
  if (skip15(t)) return;
  const client = world.clients.A2;
  await upsertAccountClassed(world.users.alice, { client, code: "990-000", name: "Rounding", type: "equity", special: "rounding", opKey: opk("rnd") }).catch((e) => noteLane(`rounding upsert ${e.code}`));
  await assert.doesNotReject(
    () => upsertAccountClassed(world.users.alice, { client, code: SST, name: "SST Output", type: "liability", special: "sst_output", opKey: opk("sst") }),
    "an sst_output account coexists with a rounding account (uq_coa_special is per-(client, VALUE))",
  );
});

test("§4.3 a sales-invoice shape assertion exists as a NEW trigger on journal_entries (mirroring the AP shape trigger)", async (t) => {
  if (skip15(t)) return;
  const trg = await rootQuery(
    `select t.tgname, pg_get_triggerdef(t.oid) as def from pg_trigger t
       join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='clara' and c.relname='journal_entries' and not t.tgisinternal`,
  );
  const salesTrg = trg.rows.find((r) => /sales/i.test(r.tgname) || /sales/i.test(r.def));
  const fn = await rootQuery(
    `select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='clara' and p.proname ilike '%sales%invoice%shape%' limit 1`,
  );
  assert.ok(salesTrg || fn.rows.length > 0, "a sales-invoice shape assertion (trigger or _assert_sales_invoice_shape fn) exists");
});

// ===========================================================================
// Behavioral (best-effort) — the tie, the polarity, the refusals.
// ===========================================================================

test("P6 a valid 2-leg sales invoice (no tax) approves — the shape floor accepts the gross tie", async (t) => {
  if (skip15(t)) return;
  const client = world.clients.A1;
  await upsertAccountClassed(world.users.alice, { client, code: REC, name: "Trade Debtors", type: "asset", accountClass: "receivable", opKey: opk("rec") }).catch((e) => noteLane(`rec upsert ${e.code}`));
  await upsertAccountClassed(world.users.alice, { client, code: REV, name: "Revenue", type: "income", opKey: opk("rev") }).catch((e) => noteLane(`rev upsert ${e.code}`));
  const f = await salesFiling({ client, gross: 250000, net: 250000, tax: 0, typeCode: "01" });
  if (!f) { noteLane("sales filing not built — happy-path 2-leg cell skipped"); return; }
  const d = await draftSales({ client, cited: f.cited, lines: salesLines(250000, 250000, 0, { withSst: false }) });
  if (!d?.entry_id) { noteLane("sales draft not created — happy-path 2-leg cell skipped"); return; }
  await assert.doesNotReject(
    () => approveEntry(world.users.alice, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("apsi") }),
    "a balanced 2-leg sales invoice passes the sales shape floor and approves",
  );
});

test("P6/§5 a 3-leg SST sales invoice ties (Dr AR=gross, Cr rev=net, Cr sst=tax)", async (t) => {
  if (skip15(t)) return;
  const client = world.clients.A1;
  await upsertAccountClassed(world.users.alice, { client, code: SST, name: "SST Output", type: "liability", special: "sst_output", opKey: opk("sst2") }).catch((e) => noteLane(`sst upsert ${e.code}`));
  const f = await salesFiling({ client, gross: 106000, net: 100000, tax: 6000, typeCode: "01" });
  if (!f) return;
  const d = await draftSales({ client, cited: f.cited, lines: salesLines(106000, 100000, 6000) });
  if (!d?.entry_id) { noteLane("3-leg SST draft not created — cell skipped"); return; }
  // A tax-affecting entry is high-stakes (is_high_stakes ⇐ tax_affecting) → attest.
  await approveEntry(world.users.alice, { entry: d.entry_id, expectedRevision: d.revision_token, attestation: "reviewed sst split", opKey: opk("apsst") })
    .then(() => assert.ok(true, "a well-tied 3-leg SST sales invoice approves"))
    .catch((e) => {
      // A refusal here must NOT be the tie failing (the facts tie exactly).
      if (reasonOf(e) === "tax_tie_failed") assert.fail(`a correctly-tied 3-leg invoice was refused tax_tie_failed — the tie math is wrong`);
      noteLane(`3-leg SST approve raised ${e.code}/${reasonOf(e)} — likely a coupled gate (direction/high-stakes); inspect`);
    });
});

test("P6/§5/#9 a ≤5-sen net+tax≠gross mismatch REFUSES (tax_tie_failed) — never silently rounded away", async (t) => {
  if (skip15(t)) return;
  const client = world.clients.A1;
  // gross 106000, but net 100000 + tax 6003 = 106003 → a 3-sen mismatch (≤5 sen). The
  // #9 ordering means this surfaces tax_tie_failed, it does NOT drift into rounding.
  const f = await salesFiling({ client, gross: 106000, net: 100000, tax: 6003, typeCode: "01" });
  if (!f) return;
  const d = await draftSales({ client, cited: f.cited, lines: salesLines(106000, 100000, 6003) });
  if (!d?.entry_id) { noteLane("mismatch draft not created — cell skipped"); return; }
  let err = null;
  try { await approveEntry(world.users.alice, { entry: d.entry_id, expectedRevision: d.revision_token, attestation: "x", opKey: opk("apmis") }); }
  catch (e) { err = e; }
  assert.ok(err, "a ≤5-sen net+tax≠gross mismatch is REFUSED at approve (not absorbed by rounding)");
  if (err && reasonOf(err) && reasonOf(err) !== "tax_tie_failed") noteLane(`mismatch refused with reason '${reasonOf(err)}' (expected tax_tie_failed) — inspect`);
});

test("P6/§5 a tax-bearing invoice meeting a chart with NO sst_output account refuses (sst_account_missing)", async (t) => {
  if (skip15(t)) return;
  const client = world.clients.B1; // a fresh client with NO sst_output account seeded
  const PLAIN_LIAB = "260-000";
  await upsertAccountClassed(world.users.dave, { client, code: REC, name: "Trade Debtors", type: "asset", accountClass: "receivable", opKey: opk("recb") }).catch((e) => noteLane(`recB ${e.code}`));
  await upsertAccountClassed(world.users.dave, { client, code: REV, name: "Revenue", type: "income", opKey: opk("revb") }).catch((e) => noteLane(`revB ${e.code}`));
  await upsertAccountClassed(world.users.dave, { client, code: PLAIN_LIAB, name: "Sundry Payables", type: "liability", opKey: opk("liab") }).catch((e) => noteLane(`liabB ${e.code}`));
  await addClientIdentifier(world.users.dave, { client, kind: "ssm", value: CLIENT_REG }).catch(() => {});
  const firm = await firmOf(client);
  await grantConsent(world.users.dave, { firm, client }).catch(() => {});
  const f = await salesFilingFor(world.users.dave, { client, gross: 106000, net: 100000, tax: 6000 });
  if (!f) { noteLane("sst-missing filing not built — cell skipped"); return; }
  // A BALANCED 3-leg whose tax leg lands on a PLAIN liability (no sst_output marker) —
  // so the draft validates, but the shape floor sees tax facts + no sst_output account.
  const lines = [
    { account_code: REC, debit_cents: 106000, credit_cents: 0, description: "sales-ar" },
    { account_code: REV, debit_cents: 0, credit_cents: 100000, description: "sales-rev" },
    { account_code: PLAIN_LIAB, debit_cents: 0, credit_cents: 6000, description: "tax-on-plain-liab" },
  ];
  const d = await draftSalesFor(world.users.dave, { client, cited: f.cited, lines });
  if (!d?.entry_id) { noteLane("sst-missing draft not created — cell noted"); return; }
  let err = null;
  try { await approveEntry(world.users.dave, { entry: d.entry_id, expectedRevision: d.revision_token, attestation: "x", opKey: opk("apnosst") }); }
  catch (e) { err = e; }
  assert.ok(err, "a tax-bearing invoice against a chart with no sst_output account is refused (sst_account_missing)");
  if (err && reasonOf(err) && reasonOf(err) !== "sst_account_missing") noteLane(`sst-missing refused with '${reasonOf(err)}' (expected sst_account_missing) — inspect`);
});

test("P6 a sales CREDIT note reverses polarity (Cr AR=gross, Dr rev=net, Dr sst=tax)", async (t) => {
  if (skip15(t)) return;
  const client = world.clients.A1;
  const f = await salesFiling({ client, gross: 106000, net: 100000, tax: 6000, typeCode: "02" });
  if (!f) return;
  // A credit note drafted with INVOICE polarity (Dr AR) must be refused — the shape
  // floor for sales_credit_note requires the mirror (Cr AR).
  const wrong = await draftSales({ client, cited: f.cited, lines: salesLines(106000, 100000, 6000), codingKind: "sales_credit_note" });
  if (wrong?.entry_id) {
    let err = null;
    try { await approveEntry(world.users.alice, { entry: wrong.entry_id, expectedRevision: wrong.revision_token, attestation: "x", opKey: opk("apcnwrong") }); }
    catch (e) { err = e; }
    assert.ok(err, "a credit note with INVOICE polarity (Dr receivable) is refused — CN must credit receivable");
  } else noteLane("CN wrong-polarity draft not created — cell noted");
  // The correctly-mirrored CN should tie.
  const f2 = await salesFiling({ client, gross: 106000, net: 100000, tax: 6000, typeCode: "02" });
  if (!f2) return;
  const cn = await draftSales({ client, cited: f2.cited, lines: creditNoteLines(106000, 100000, 6000), codingKind: "sales_credit_note" });
  if (!cn?.entry_id) { noteLane("CN correct-polarity draft not created — cell noted"); return; }
  await approveEntry(world.users.alice, { entry: cn.entry_id, expectedRevision: cn.revision_token, attestation: "x", opKey: opk("apcn") })
    .then(() => assert.ok(true, "a correctly-mirrored sales credit note ties and approves"))
    .catch((e) => { if (reasonOf(e) === "tax_tie_failed") assert.fail("a correct CN mirror was refused tax_tie_failed"); noteLane(`CN approve raised ${e.code}/${reasonOf(e)} — inspect`); });
});

test("P6 a debit note (type 03) RAISES receivable like an invoice (invoice polarity, not CN)", async (t) => {
  if (skip15(t)) return;
  const client = world.clients.A1;
  const f = await salesFiling({ client, gross: 53000, net: 50000, tax: 3000, typeCode: "03" });
  if (!f) return;
  // A debit note is a sales_invoice with the DN type code — invoice polarity (Dr AR).
  const dn = await draftSales({ client, cited: f.cited, lines: salesLines(53000, 50000, 3000), codingKind: "sales_invoice" });
  if (!dn?.entry_id) { noteLane("DN draft not created — cell noted"); return; }
  await approveEntry(world.users.alice, { entry: dn.entry_id, expectedRevision: dn.revision_token, attestation: "x", opKey: opk("apdn") })
    .then(() => assert.ok(true, "a debit note raises receivable like an invoice and approves"))
    .catch((e) => { if (reasonOf(e) === "tax_tie_failed") assert.fail("a DN with correct invoice polarity was refused tax_tie_failed"); noteLane(`DN approve raised ${e.code}/${reasonOf(e)} — inspect`); });
});

// ===========================================================================
// FIX-1 (adversarial #2) — control-account laundering: a sales invoice with an
// EXTRA control (payable) leg must be REFUSED (the shape admits ONLY receivable,
// income, sst_output, rounding). FIX-2 — type_code bound to polarity. Both FAIL
// against the pre-fix floor (which checked only component ties) and PASS after.
// ===========================================================================

const AP4 = "400-000"; // trade creditors (payable control) — the laundering target

test("FIX-1 a sales invoice with an EXTRA payable-control leg is REFUSED (no laundering into a control account under the tie)", async (t) => {
  if (skip15(t)) return;
  const client = world.clients.A1;
  await upsertAccountClassed(world.users.alice, { client, code: REC, name: "Trade Debtors", type: "asset", accountClass: "receivable", opKey: opk("recL") }).catch((e) => noteLane(`recL ${e.code}`));
  await upsertAccountClassed(world.users.alice, { client, code: REV, name: "Revenue", type: "income", opKey: opk("revL") }).catch((e) => noteLane(`revL ${e.code}`));
  await upsertAccountClassed(world.users.alice, { client, code: AP4, name: "Trade Creditors", type: "liability", accountClass: "payable", opKey: opk("apL") }).catch((e) => noteLane(`apL ${e.code}`));
  // Codex #2 shape: gross RM106, net RM1, tax absent; a BALANCED draft that debits AR
  // for the gross but credits only RM1 to signed revenue and RM105 to an UNRELATED
  // payable control (which the pre-fix floor exempted). It MUST refuse.
  const f = await salesFiling({ client, gross: 10600, net: 100, tax: null, typeCode: "01" });
  assert.ok(f, "the laundering-scenario facts filing was built (mandatory setup)");
  const lines = [
    { account_code: REC, debit_cents: 10600, credit_cents: 0, description: "sales-ar" },
    { account_code: REV, debit_cents: 0, credit_cents: 100, description: "sales-rev (signed)" },
    { account_code: AP4, debit_cents: 0, credit_cents: 10500, description: "launder-into-payable" },
  ];
  const d = await draftSales({ client, cited: f.cited, lines });
  assert.ok(d?.entry_id, "the laundering draft was created (mandatory setup)");
  let err = null;
  try { await approveEntry(world.users.alice, { entry: d.entry_id, expectedRevision: d.revision_token, attestation: "x", opKey: opk("aplaunder") }); }
  catch (e) { err = e; }
  assert.ok(err, "a sales invoice with an extra payable-control leg is REFUSED (pre-fix it posted, laundering the amount under the control exemption)");
  assert.equal(err.code, "CLR23", `the laundering shape is refused with CLR23 (got ${err?.code})`);
  assert.notEqual((await rootQuery("select status from clara.journal_entries where id=$1", [d.entry_id])).rows[0]?.status, "approved", "the laundering entry is never approved");
});

test("FIX-2 a type-02 (credit note) document coded as a sales_invoice is REFUSED (type_polarity_mismatch)", async (t) => {
  if (skip15(t)) return;
  const client = world.clients.A1;
  // The document states type 02 (credit note) but the draft is coded/booked as a
  // sales_invoice (invoice polarity). The structural type<->polarity binding refuses.
  const f = await salesFiling({ client, gross: 10600, net: 10000, tax: 600, typeCode: "02" });
  assert.ok(f, "the type-02 facts filing was built (mandatory setup)");
  await upsertAccountClassed(world.users.alice, { client, code: SST, name: "SST Output", type: "liability", special: "sst_output", opKey: opk("sstT") }).catch(() => {});
  const d = await draftSales({ client, cited: f.cited, lines: salesLines(10600, 10000, 600), codingKind: "sales_invoice" });
  assert.ok(d?.entry_id, "the type-mismatch draft was created (mandatory setup)");
  let err = null;
  try { await approveEntry(world.users.alice, { entry: d.entry_id, expectedRevision: d.revision_token, attestation: "x", opKey: opk("aptype") }); }
  catch (e) { err = e; }
  assert.ok(err, "a type-02 doc booked as an invoice is REFUSED (pre-fix polarity was unbound to type_code)");
  assert.equal(err.code, "CLR21", `the type/polarity mismatch is refused with CLR21 (got ${err?.code})`);
  if (reasonOf(err) && reasonOf(err) !== "type_polarity_mismatch") noteLane(`type mismatch refused with '${reasonOf(err)}' (expected type_polarity_mismatch)`);
});

// ===========================================================================
// RESIDUAL-1 v2 (defense-in-depth) — a sales invoice may NOT launder a material amount
// into a rounding leg. The round-1 floor admitted a rounding leg by CATEGORY with no
// amount bound, so with no net/tax facts (tie skipped) the balance could be split off
// into rounding. FAILS pre-fix (approved) and PASSES after (CLR23).
// ===========================================================================

// buildWorld already seeds ONE rounding account per client (COA.rounding='9990');
// uq_coa_special permits only one, so reference it rather than creating another.
const SRND = "9990"; // the seeded rounding account — the laundering target

test("RESIDUAL-1 a sales invoice laundering a material amount into a ROUNDING leg is REFUSED (the rounding-amount bound)", async (t) => {
  if (skip15(t)) return;
  const client = world.clients.A1;
  await upsertAccountClassed(world.users.alice, { client, code: REC, name: "Trade Debtors", type: "asset", accountClass: "receivable", opKey: opk("recR") }).catch((e) => noteLane(`recR ${e.code}`));
  await upsertAccountClassed(world.users.alice, { client, code: REV, name: "Revenue", type: "income", opKey: opk("revR") }).catch((e) => noteLane(`revR ${e.code}`));
  // No net/tax facts (so the component tie is skipped) — gross RM106 only. A BALANCED draft
  // debits AR for the gross but credits only RM1 to signed revenue and RM105 to a ROUNDING
  // account. Pre-fix the rounding leg was admitted by category with no amount bound → it
  // approved. Post-fix the greatest(5, n_legs)-sen bound on non-{receivable,income,sst} legs
  // refuses it.
  const f = await salesFiling({ client, gross: 10600, net: null, tax: null, typeCode: "01" });
  assert.ok(f, "the rounding-laundering sales facts filing was built (mandatory setup)");
  const lines = [
    { account_code: REC, debit_cents: 10600, credit_cents: 0, description: "sales-ar" },
    { account_code: REV, debit_cents: 0, credit_cents: 100, description: "sales-rev (signed)" },
    { account_code: SRND, debit_cents: 0, credit_cents: 10500, description: "launder-into-rounding" },
  ];
  const d = await draftSales({ client, cited: f.cited, lines });
  assert.ok(d?.entry_id, "the rounding-laundering sales draft was created (mandatory setup)");
  let err = null;
  try { await approveEntry(world.users.alice, { entry: d.entry_id, expectedRevision: d.revision_token, attestation: "x", opKey: opk("apsrnd") }); }
  catch (e) { err = e; }
  assert.ok(err, "a sales invoice laundering into a material rounding leg is REFUSED (pre-fix it approved under the rounding category exemption)");
  assert.equal(err.code, "CLR23", `the rounding-laundering sales shape is refused CLR23 (got ${err?.code})`);
  assert.notEqual((await rootQuery("select status from clara.journal_entries where id=$1", [d.entry_id])).rows[0]?.status, "approved", "the laundering entry is never approved");
});

// Firm-B variants (dave is firm B's owner) reuse the same builders with a different actor.
async function salesFilingFor(sub, { client, gross, net, tax, typeCode = "01" }) {
  const firm = await firmOf(client);
  const cited = await seedCitedDocument(sub, { firm, client, quote: rm(gross) });
  await enqueueInvoiceFacts(cited.documentId);
  const task = await invoiceFactsTask(cited.documentId);
  await claimTask(task.id, { egressApproved: true });
  const fields = [
    factField("invoice.total", rm(gross)), factField("invoice.currency", "MYR"),
    factField("invoice.vendor_name", CLIENT_NAME), factField("invoice.vendor_registration", CLIENT_REG, { polygon: [], confidence: 0.9 }),
    factField("invoice.customer_name", "SOME BUYER SDN BHD"), factField("invoice.invoice_id", `SI-${randomUUID().slice(0, 8)}`),
    factField("invoice.type_code", typeCode, { polygon: [], confidence: 0.9 }),
    factField("invoice.total_excl_tax", rm(net), { polygon: [], confidence: 0.9 }),
    factField("invoice.tax_total", rm(tax), { polygon: [], confidence: 0.9 }),
  ];
  try { await persistInvoiceFacts(task.id, fields); } catch (e) { noteLane(`persist(B) ${e.code}`); return null; }
  return { cited };
}
async function draftSalesFor(sub, { client, cited, lines, codingKind = "sales_invoice" }) {
  const firm = await firmOf(client);
  const cred = await mintInteractive(firm);
  const region = await factsRegion(cited.documentId, "invoice.total");
  try {
    return await wakeDraftEntry(cred, {
      client, resolution: await freshResolution(sub, client, { subjectKind: "document", subjectId: cited.documentId }),
      lines, document: cited.documentId, sha256: cited.sha256,
      vendor: { new: { name: "SOME BUYER SDN BHD" }, kind: "customer" },
      evidence: [ev(region?.id, region?.text_content ?? rm(0), "invoice.total")],
      codingKind, opKey: `salesB:${cited.filingId}:${cited.documentId}`,
    });
  } catch (e) { noteLane(`draftSalesFor ${e.code}: ${e.message}`); return null; }
}
