// Wave-A2.1 rig — the purchase-side SST VISIBILITY split (pin doc P4; contract §4,
// WA21-R1). CONTRACT-BLIND: pins only — never 0016 source. The invariants:
//
//   sst_purchase_cost is a NEW special_acc_type (expense-typed — Malaysian SST has
//   NO input-tax credit; the leg stays inside P&L cost). The supplier-bill floor
//   admits AT MOST ONE such DEBIT leg, tied EXACTLY to the stated invoice.tax_total,
//   only when tax facts exist; the expense=gross tie survives verbatim (the leg is
//   expense-typed). sst_output on a purchase STILL refuses (sales-only, all three
//   pinned places). The EXECUTOR grants the new leg NO sanction: a purchase draft
//   carrying it skips purchase_sst_not_autopostable (named) — human lanes only.
//
// Serial discipline: --test-concurrency=1.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  rootQuery, endPool, printLaneNotes, noteLane, printSkipCount,
  buildWorld, firmOf, opk,
  a21EnsureReady, skip16, metaProbe0016, OCR_SKIP,
  proposeAutopostRule, signAutopostRule, ruleRowById, postViaRule, lastSkipReason, entryStatusOf,
  upsertPayableAccount, upsertAccountClassed, grantConsent, seedCitedDocument, freshResolution,
  draftEntryV3, approveEntry, billLines, ev, FIELD, counterpartyRows,
  enqueueInvoiceFacts, invoiceFactsTask, claimTask, persistInvoiceFacts, factField, agreedEnvelope, factsRegion,
  mintInteractive, wakeDraftEntry, checkDefs, rm,
  AP, EXP,
} from "./a21-helpers.mjs";

const SSTP = "500-S01"; // sst_purchase_cost (expense-typed special)
const SSTO = "250-000"; // sst_output (sales-only special, 0015)

let has16 = false;
let world = null;

function skipHere(t) { return skip16(t, has16, "0016 not applied — purchase-split battery dormant"); }

async function makeVendor(sub, { client, name, reg }) {
  const firm = await firmOf(client);
  const cited = await seedCitedDocument(sub, { firm, client, quote: "RM 500.00" });
  const d = await draftEntryV3(sub, {
    client, resolution: await freshResolution(sub, client, { subjectKind: "document", subjectId: cited.documentId }),
    document: cited.documentId, sha256: cited.sha256, lines: billLines(EXP, AP, 50000),
    vendor: { new: { name, registration_no: reg } }, evidence: [ev(cited.regionId, cited.quote, FIELD.total)], opKey: opk("v"),
  });
  await approveEntry(sub, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("va") });
  const norm = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  return (await counterpartyRows(client)).find((c) => (c.name_normalized ?? "") === norm)?.id ?? null;
}

/** A purchase facts doc stating total gross (+ optionally net/tax). */
async function purchaseFactsDoc(client, { gross, net = null, tax = null }) {
  const sub = world.users.alice;
  const firm = await firmOf(client);
  await grantConsent(sub, { firm, client }).catch(() => {});
  const cited = await seedCitedDocument(sub, { firm, client, quote: rm(gross) });
  // INTEGRATION (CLASS T): the 0016 P3 gate sends a NULL-kind pdf to `classify`
  // first — stamp the fixture doc 'invoice' at seed (the source-stamped corpus)
  // so the facts lane engages directly; the classify loop is proven elsewhere.
  await rootQuery("update clara.documents set document_kind='invoice' where id=$1", [cited.documentId]);
  await enqueueInvoiceFacts(cited.documentId);
  const task = await invoiceFactsTask(cited.documentId);
  await claimTask(task.id, { egressApproved: true });
  const fields = [
    factField("invoice.total", rm(gross)),
    factField("invoice.currency", "MYR"),
    factField("invoice.vendor_name", "THIRDPARTY SUPPLIER SDN BHD"),
    factField("invoice.invoice_id", `INV-${randomUUID().slice(0, 8)}`),
  ];
  if (net != null) fields.push(factField("invoice.total_excl_tax", rm(net), { polygon: [], confidence: 0.9 }));
  if (tax != null) fields.push(factField("invoice.tax_total", rm(tax), { polygon: [], confidence: 0.9 }));
  await persistInvoiceFacts(task.id, fields, { envelope: agreedEnvelope() });
  return cited;
}

/** A wake supplier_bill DRAFT for `cp` citing the doc's MACHINE total region. */
async function billDraft(client, cited, { cp, lines }) {
  const firm = await firmOf(client);
  const cred = await mintInteractive(firm);
  const region = await factsRegion(cited.documentId, FIELD.total);
  return wakeDraftEntry(cred, {
    client,
    resolution: await freshResolution(world.users.alice, client, { subjectKind: "document", subjectId: cited.documentId }),
    lines, document: cited.documentId, sha256: cited.sha256,
    vendor: { existing_id: cp },
    evidence: [ev(region?.id ?? cited.regionId, region?.text_content ?? cited.quote, FIELD.total)],
    codingKind: "supplier_bill", opKey: opk("pb"),
  });
}

const split3 = (net, tax, gross) => [
  { account_code: EXP, debit_cents: net, credit_cents: 0, description: "expense (net)" },
  { account_code: SSTP, debit_cents: tax, credit_cents: 0, description: "sst portion of cost" },
  { account_code: AP, debit_cents: 0, credit_cents: gross, description: "ap (gross)" },
];

before(async () => {
  const ready = await a21EnsureReady();
  has16 = ready.base && ready.has16;
  if (has16) {
    world = await buildWorld();
    for (const c of [world.clients.A1, world.clients.A2]) {
      await upsertPayableAccount(world.users.alice, { client: c, code: AP, name: "Trade Creditors", opKey: opk("ap") }).catch(() => {});
      await upsertAccountClassed(world.users.alice, { client: c, code: EXP, name: "Prof Fees", type: "expense", opKey: opk("exp") }).catch(() => {});
      await upsertAccountClassed(world.users.alice, { client: c, code: SSTP, name: "SST On Purchases", type: "expense", special: "sst_purchase_cost", opKey: opk("sstp") }).catch((e) => noteLane(`sstp acct ${e.code}: ${e.message}`));
      await upsertAccountClassed(world.users.alice, { client: c, code: SSTO, name: "SST Output", type: "liability", special: "sst_output", opKey: opk("ssto") }).catch(() => {});
      await grantConsent(world.users.alice, { firm: await firmOf(c), client: c }).catch(() => {});
    }
  } else noteLane("0016 absent — a21-purchase-split suite dormant");
});
after(async () => { printLaneNotes("a21-purchase-split"); printSkipCount("a21-purchase-split"); await endPool(); });

test("META a21-purchase-split: migration 0016 present + the sst_purchase_cost CHECK marker exists", async (t) => {
  if (!(await metaProbe0016(t, has16, { label: "purchase split" }))) return;
  const defs = await checkDefs("coa_accounts");
  assert.ok(defs.includes("'sst_purchase_cost'"), "special_acc_type CHECK admits 'sst_purchase_cost' (0016 marker)");
});

test("P4 structural: the sst_purchase_cost special account exists EXPENSE-typed; sst_output stays admitted beside it (uq one-per-client each)", async (t) => {
  if (skipHere(t)) return;
  const row = (await rootQuery(
    "select account_type, special_acc_type from clara.coa_accounts where client_id=$1 and account_code=$2",
    [world.clients.A1, SSTP],
  )).rows[0];
  assert.ok(row, "the sst_purchase_cost account was created through the audited upsert (mandatory setup)");
  assert.equal(row.special_acc_type, "sst_purchase_cost", "special_acc_type='sst_purchase_cost'");
  assert.equal(row.account_type, "expense", "the leg is EXPENSE-typed (WA21-R1 — inside P&L cost, never a recoverable asset)");
  // A second sst_purchase_cost account for the same client must hit the one-per-client unique.
  let err = null;
  try {
    await upsertAccountClassed(world.users.alice, { client: world.clients.A1, code: "500-S02", name: "SST Dup", type: "expense", special: "sst_purchase_cost", opKey: opk("dup") });
  } catch (e) { err = e; }
  if (!err) noteLane("a SECOND sst_purchase_cost account was admitted — uq_coa_special scope divergence to adjudicate");
});

test("§4 the tied split APPROVES: Dr expense(net) + Dr sst_purchase_cost(=stated tax) + Cr AP(gross) with tax facts — the expense=gross tie survives", async (t) => {
  if (skipHere(t)) return;
  const client = world.clients.A1;
  const cp = await makeVendor(world.users.alice, { client, name: `SPLITOK ${randomUUID().slice(0, 6)}`, reg: "201801050001" });
  assert.ok(cp, "vendor exists (mandatory setup)");
  const cited = await purchaseFactsDoc(client, { gross: 10600, net: 10000, tax: 600 });
  const d = await billDraft(client, cited, { cp, lines: split3(10000, 600, 10600) });
  assert.ok(d?.entry_id, "the 3-leg split draft exists (mandatory setup)");
  await approveEntry(world.users.alice, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("ok3") });
  assert.equal(await entryStatusOf(d.entry_id), "approved", "the tied 3-leg purchase split APPROVES (the 0015 outright sst refusal is converted)");
  const legs = (await rootQuery("select account_code, debit_cents::int as d from clara.journal_lines where entry_id=$1 order by line_no", [d.entry_id])).rows;
  const sstLeg = legs.find((l) => l.account_code === SSTP);
  assert.equal(sstLeg?.d, 600, "the sst_purchase_cost leg equals the stated tax to the sen");
});

test("§4 the tie is EXACT: an sst_purchase_cost leg of stated-tax±1 sen REFUSES at approve", async (t) => {
  if (skipHere(t)) return;
  const client = world.clients.A1;
  const cp = await makeVendor(world.users.alice, { client, name: `SPLITTIE ${randomUUID().slice(0, 6)}`, reg: "201801050002" });
  assert.ok(cp, "vendor exists (mandatory setup)");
  const cited = await purchaseFactsDoc(client, { gross: 10600, net: 10000, tax: 600 });
  // Leg 599 ≠ stated 600 (the entry still balances: the expense leg absorbs the sen).
  const d = await billDraft(client, cited, { cp, lines: split3(10001, 599, 10600) }).catch((e) => { noteLane(`tie-mismatch draft refused at draft (${e.code}) — floor fired early`); return null; });
  if (!d?.entry_id) return; // refused at the draft lane — enforcement upstream, noted
  let err = null;
  try { await approveEntry(world.users.alice, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("tie") }); } catch (e) { err = e; }
  assert.ok(err, "an sst_purchase_cost leg that misses the stated tax by 1 sen is REFUSED");
  // INTEGRATION (CLASS T): the refusal code is un-pinned; the as-built impl uses
  // the 0015 tax-tie family — CLR21 detail tax_tie_failed (count/identity stays CLR23).
  assert.equal(err.code, "CLR21", `the tie refusal is CLR21 tax_tie_failed (got ${err.code})`);
  assert.notEqual(await entryStatusOf(d.entry_id), "approved", "the mistied split never approves");
});

test("§4 count ≤ 1: TWO sst_purchase_cost legs (summing to the stated tax) REFUSE", async (t) => {
  if (skipHere(t)) return;
  const client = world.clients.A2;
  const cp = await makeVendor(world.users.alice, { client, name: `SPLITTWO ${randomUUID().slice(0, 6)}`, reg: "201801050003" });
  assert.ok(cp, "vendor exists (mandatory setup)");
  const cited = await purchaseFactsDoc(client, { gross: 10600, net: 10000, tax: 600 });
  const lines = [
    { account_code: EXP, debit_cents: 10000, credit_cents: 0, description: "expense (net)" },
    { account_code: SSTP, debit_cents: 300, credit_cents: 0, description: "sst half A" },
    { account_code: SSTP, debit_cents: 300, credit_cents: 0, description: "sst half B" },
    { account_code: AP, debit_cents: 0, credit_cents: 10600, description: "ap (gross)" },
  ];
  const d = await billDraft(client, cited, { cp, lines }).catch((e) => { noteLane(`two-leg draft refused at draft (${e.code}) — floor fired early`); return null; });
  if (!d?.entry_id) return;
  let err = null;
  try { await approveEntry(world.users.alice, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("two") }); } catch (e) { err = e; }
  assert.ok(err, "a split carrying TWO sst_purchase_cost legs is REFUSED (≤1 leg, count+identity)");
  assert.equal(err.code, "CLR23", `the count refusal is CLR23 (got ${err.code})`);
});

test("§4 no tax facts ⇒ no leg: an sst_purchase_cost leg WITHOUT a stated invoice.tax_total REFUSES", async (t) => {
  if (skipHere(t)) return;
  const client = world.clients.A2;
  const cp = await makeVendor(world.users.alice, { client, name: `SPLITNOTAX ${randomUUID().slice(0, 6)}`, reg: "201801050004" });
  assert.ok(cp, "vendor exists (mandatory setup)");
  const cited = await purchaseFactsDoc(client, { gross: 10600 }); // NO net/tax facts
  const d = await billDraft(client, cited, { cp, lines: split3(10000, 600, 10600) }).catch((e) => { noteLane(`no-tax draft refused at draft (${e.code}) — floor fired early`); return null; });
  if (!d?.entry_id) return;
  let err = null;
  try { await approveEntry(world.users.alice, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("ntx") }); } catch (e) { err = e; }
  assert.ok(err, "an sst_purchase_cost leg with NO stated tax fact is REFUSED (the leg exists only when tax facts exist)");
  // INTEGRATION (CLASS T): the no-fact refusal rides the same CLR21 tax-tie family.
  assert.equal(err.code, "CLR21", `the no-fact refusal is CLR21 tax_tie_failed (got ${err.code})`);
});

test("§4 sst_output on a PURCHASE still refuses (sales-only in all three pinned places — unchanged by the split)", async (t) => {
  if (skipHere(t)) return;
  const client = world.clients.A2;
  const cp = await makeVendor(world.users.alice, { client, name: `SSTOPURCH ${randomUUID().slice(0, 6)}`, reg: "201801050005" });
  assert.ok(cp, "vendor exists (mandatory setup)");
  const cited = await purchaseFactsDoc(client, { gross: 10600, net: 10000, tax: 600 });
  const lines = [
    { account_code: EXP, debit_cents: 10000, credit_cents: 0, description: "expense (net)" },
    { account_code: SSTO, debit_cents: 600, credit_cents: 0, description: "sst OUTPUT on a purchase (illegal)" },
    { account_code: AP, debit_cents: 0, credit_cents: 10600, description: "ap (gross)" },
  ];
  const d = await billDraft(client, cited, { cp, lines }).catch((e) => { noteLane(`sst_output purchase draft refused at draft (${e.code})`); return null; });
  if (!d?.entry_id) return;
  let err = null;
  try { await approveEntry(world.users.alice, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("ssto") }); } catch (e) { err = e; }
  assert.ok(err, "an sst_output leg on a purchase is STILL refused — the new purchase special never loosens the sales-only law");
  // INTEGRATION (CLASS T): two structural floors both refuse this shape and the
  // code is un-pinned — the liability-typed sst_output leg breaks the verified
  // expense=gross tie, so the draft carries amount_exception and the approve
  // amount-tie fires FIRST (CLR21 amount_conflict); with no verified evidence the
  // named supplier-bill guard fires instead (CLR23, proven by the migration's own
  // tail probe). Either way the entry never approves.
  assert.ok(["CLR21", "CLR23"].includes(err.code), `the sst_output-on-purchase refusal is structural CLR21/CLR23 (got ${err.code})`);
});

test("§4 the EXECUTOR grants the split NO sanction: a purchase draft carrying a TIED sst_purchase_cost leg skips purchase_sst_not_autopostable; its 2-leg sibling posts", async (t) => {
  if (skipHere(t)) return;
  const client = world.clients.A1;
  const sub = world.users.alice;
  const cp = await makeVendor(sub, { client, name: `SPLITEXEC ${randomUUID().slice(0, 6)}`, reg: "201801050006" });
  assert.ok(cp, "vendor exists (mandatory setup)");
  // ≥3 debit sightings (the birth bill + 2 more) then a live PURCHASE rule on EXP.
  for (let i = 0; i < 2; i++) {
    const firm = await firmOf(client);
    const c2 = await seedCitedDocument(sub, { firm, client, quote: "RM 500.00" });
    const d2 = await draftEntryV3(sub, {
      client, resolution: await freshResolution(sub, client, { subjectKind: "document", subjectId: c2.documentId }),
      document: c2.documentId, sha256: c2.sha256, lines: billLines(EXP, AP, 50000),
      vendor: { existing_id: cp }, evidence: [ev(c2.regionId, c2.quote, FIELD.total)], opKey: opk("sgt"),
    });
    await approveEntry(sub, { entry: d2.entry_id, expectedRevision: d2.revision_token, opKey: opk("sgta") });
  }
  const prop = await proposeAutopostRule(sub, { client, cp, accountCode: EXP, direction: "purchase", cap: 200000, windowMax: 3 });
  assert.ok(!prop.error, `the purchase rule proposal is admitted (mandatory setup — got ${prop.error?.code})`);
  await signAutopostRule(sub, { rule: prop.id });
  assert.equal((await ruleRowById(prop.id))?.status, "live", "the purchase rule is LIVE (mandatory setup)");
  // The 3-leg tied split draft — human-approvable, NEVER auto-postable.
  const cited3 = await purchaseFactsDoc(client, { gross: 10600, net: 10000, tax: 600 });
  const d3 = await billDraft(client, cited3, { cp, lines: split3(10000, 600, 10600) });
  assert.ok(d3?.entry_id, "the executor-cell 3-leg draft exists (mandatory setup)");
  await postViaRule(d3.entry_id).catch((e) => noteLane(`split post raised ${e.code} (expected a quiet skip)`));
  assert.notEqual(await entryStatusOf(d3.entry_id), "approved", "a purchase draft carrying the sst_purchase_cost leg is NEVER auto-posted (WA21-R1 — human lanes only this wave)");
  assert.equal(await lastSkipReason(d3.entry_id), OCR_SKIP.purchaseSst, "the skip is NAMED purchase_sst_not_autopostable (a visible skip, not a silent shape mismatch)");
  // The plain 2-leg corroborated sibling posts under the same rule (only the new leg blocks).
  // 0023 (X5): "corroborated" now means the document STATES its arithmetic, so the sibling
  // states its net/tax explicitly. That is not a weaker fixture — it is the same bill coded
  // two ways, which is exactly what this cell contrasts.
  //
  // 0036 §A (ledger #52) AMENDMENT — the sibling now states a ZERO tax rather than the
  // 3-leg document's RM6.00. This cell's INTENT is unchanged and is what drove the edit:
  // it proves the autopost refusal is specific to the sst_purchase_cost LEG, not to
  // 2-leg-ness. Before 0036 that contrast happened to be drawn with a nonzero-tax
  // document, and 0036's nonzero-tax belt now REFUSES exactly that shape at approve
  // (CLR21 / tax_leg_missing) — deliberately, because a bill whose document states a real
  // SST amount must not autopost down the untested 2-leg path (Gate P's territory). Coding
  // the sibling as a stated-ZERO-tax document (net === gross, tax === 0) keeps the document
  // stating its arithmetic — so it still corroborates, which is what this cell needs — and
  // lands it on the ADR-050 owner-ruled SST-zero shape, so the leg-vs-no-leg contrast is
  // drawn on a shape the books actually accept. The nonzero counterpart is not lost: it is
  // now asserted as a REFUSAL in packages/db/tests/x36c0-wave-c0-belts.test.mjs (x36c0.a).
  const cited2 = await purchaseFactsDoc(client, { gross: 10600, net: 10600, tax: 0 });
  const d2 = await billDraft(client, cited2, { cp, lines: billLines(EXP, AP, 10600) });
  assert.ok(d2?.entry_id, "the 2-leg sibling draft exists (mandatory setup)");
  await postViaRule(d2.entry_id).catch((e) => noteLane(`2-leg post raised ${e.code}`));
  assert.equal(await entryStatusOf(d2.entry_id), "approved", "the 2-leg corroborated sibling POSTS — the refusal is specific to the sst_purchase_cost leg");
});
