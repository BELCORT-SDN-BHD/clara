// Wave-A2.1 rig — the OCR sales-autopost ENVELOPE at the executor (pin doc P2(e);
// contract §3.3 controls 2/3/4/5/8/9 + §3.2 CN). CONTRACT-BLIND: pins only —
// never 0016 source. Every control is RE-DERIVED at post time (control 8); a
// missing control is a NAMED visible skip (fail-pre), and the fully-satisfied
// draft posts (pass-post):
//
//   polarity_unverified — no classifier/human kind verdict ('invoice') on the doc.
//   direction_unproven  — supplier evidence is name-only (no TIN/BRN match).
//   anchor_missing      — the corroboration set is short (explicit tax absent —
//                         zero allowed, MISSING not).
//   customer_unresolved — the stated customer resolves to no existing counterparty.
//   cn_not_autopostable — a sales_credit_note draft, categorically (named skip).
//   ≥3 polarity/direction skips in 30 days on ONE rule → status
//   'suspended_pending_resignature' + a notification (control 9).
//
// Serial discipline: --test-concurrency=1.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  rootQuery, endPool, printLaneNotes, noteLane, printSkipCount,
  buildWorld, firmOf, opk,
  a21EnsureReady, skip16, metaProbe0016,
  OCR_SKIP, SUSPENDED_STATUS,
  proposeAutopostRule, signAutopostRule, ruleRowById, postViaRule, lastSkipReason, entryStatusOf,
  classifyDocument, notificationsMatching,
  upsertAccountClassed, seedCitedDocument, freshResolution, grantConsent,
  draftEntryV3, approveEntry, ev, FIELD, counterpartyRows, sightingRows,
  enqueueInvoiceFacts, invoiceFactsTask, claimTask, persistInvoiceFacts, factField, factsRegion,
  mintInteractive, wakeDraftEntry, addClientIdentifier, addClientAlias, rm,
} from "./a21-helpers.mjs";

const REC = "300-A00";
const REV = "500-R01";
const CLIENT_REG = "199901000777";
const CLIENT_NAME = "RIGROME PROPERTIES SDN BHD";
const CUSTOMER = "DARE TO DREAM RIG SDN BHD";

let has16 = false;
let world = null;
const worlds = new Map(); // client → { cp, rule } (memoized expensive builds)

function skipHere(t) { return skip16(t, has16, "0016 not applied — OCR-envelope battery dormant"); }

async function approvedSales(sub, { client, cp = null, newName = null, date = "2026-06-10", cents = 90000, doc = null }) {
  const firm = await firmOf(client);
  const cited = doc ?? await seedCitedDocument(sub, { firm, client, quote: rm(cents) });
  const d = await draftEntryV3(sub, {
    client, resolution: await freshResolution(sub, client, { subjectKind: "document", subjectId: cited.documentId }),
    document: cited.documentId, sha256: cited.sha256,
    lines: [
      { account_code: REC, debit_cents: cents, credit_cents: 0, description: "sales-ar" },
      { account_code: REV, debit_cents: 0, credit_cents: cents, description: "sales-rev" },
    ],
    vendor: cp ? { existing_id: cp } : { new: { name: newName }, kind: "customer" },
    evidence: [ev(cited.regionId, cited.quote, FIELD.total)],
    postingDate: date, opKey: opk("os"),
  });
  await approveEntry(sub, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("osa") });
  return d.entry_id;
}

/** Build (once per client) a resolved customer + a LIVE ocr_sales rule on REV. */
async function ocrWorld(client) {
  if (worlds.has(client)) return worlds.get(client);
  const sub = world.users.alice;
  await addClientIdentifier(sub, { client, kind: "ssm", value: CLIENT_REG }).catch(() => {});
  await addClientIdentifier(sub, { client, kind: "tin", value: CLIENT_REG }).catch(() => {});
  await addClientAlias(sub, { client, alias: CLIENT_NAME }).catch((e) => noteLane(`client alias ${e.code}`));
  await upsertAccountClassed(sub, { client, code: REC, name: "Trade Debtors", type: "asset", accountClass: "receivable", opKey: opk("rec") }).catch(() => {});
  await upsertAccountClassed(sub, { client, code: REV, name: "Service Revenue", type: "income", opKey: opk("rev") }).catch(() => {});
  await grantConsent(sub, { firm: await firmOf(client), client }).catch(() => {});
  // Customer birth + 6 more human-approved credit sightings spanning ≥60 days.
  await approvedSales(sub, { client, newName: CUSTOMER, date: "2026-06-18" });
  const norm = CUSTOMER.toLowerCase().replace(/[^a-z0-9]/g, "");
  const cp = (await counterpartyRows(client)).find((c) => (c.name_normalized ?? "") === norm)?.id ?? null;
  assert.ok(cp, "the OCR-world customer counterparty exists (mandatory setup)");
  for (const date of ["2026-01-08", "2026-02-08", "2026-03-08", "2026-04-08", "2026-05-08", "2026-06-08"]) {
    await approvedSales(sub, { client, cp, date });
  }
  const prop = await proposeAutopostRule(sub, { client, cp, accountCode: REV, direction: "sales", evidenceClass: "ocr_sales", cap: 200000, windowMax: 3 });
  assert.ok(!prop.error, `the ocr_sales rule proposal is admitted (mandatory setup — got ${prop.error?.code}: ${prop.error?.message})`);
  await signAutopostRule(sub, { rule: prop.id });
  const row = await ruleRowById(prop.id);
  assert.equal(row?.status, "live", "the ocr_sales rule is LIVE (mandatory setup)");
  const built = { cp, rule: prop.id };
  worlds.set(client, built);
  return built;
}

/** A facts-complete OCR sales document. `omit` drops named anchor/direction facts;
 *  `classify` (default 'invoice') sets the polarity verdict; null leaves kind NULL. */
async function ocrSalesDoc(client, { cents = 90000, classify = "invoice", omit = [], customerName = CUSTOMER, typeCode = "01" } = {}) {
  const sub = world.users.alice;
  const firm = await firmOf(client);
  const cited = await seedCitedDocument(sub, { firm, client, quote: rm(cents) });
  await enqueueInvoiceFacts(cited.documentId);
  const task = await invoiceFactsTask(cited.documentId);
  await claimTask(task.id, { egressApproved: true });
  const fields = [
    factField("invoice.total", rm(cents)),
    factField("invoice.currency", "MYR"),
    factField("invoice.vendor_name", CLIENT_NAME),
    factField("invoice.customer_name", customerName),
    factField("invoice.invoice_id", `SI-${randomUUID().slice(0, 8)}`),
    factField("invoice.invoice_date", "2026-06-15", { polygon: [], confidence: 0.9 }),
    factField("invoice.type_code", typeCode, { polygon: [], confidence: 0.9 }),
  ];
  if (!omit.includes("vendor_registration")) fields.push(factField("invoice.vendor_registration", CLIENT_REG, { polygon: [], confidence: 0.9 }));
  if (!omit.includes("net")) fields.push(factField("invoice.total_excl_tax", rm(cents), { polygon: [], confidence: 0.9 }));
  if (!omit.includes("tax")) fields.push(factField("invoice.tax_total", "RM 0.00", { polygon: [], confidence: 0.9 })); // explicit ZERO (allowed); omitted = anchor_missing
  if (!omit.includes("amount_due")) fields.push(factField("invoice.amount_due", rm(cents), { polygon: [], confidence: 0.9 })); // the second independent anchor
  await persistInvoiceFacts(task.id, fields);
  if (classify) await classifyDocument({ document: cited.documentId, kind: classify, confidence: 0.97 });
  return cited;
}

/** A wake sales draft (coding_kind carried) for the OCR-world customer, citing the
 *  doc's MACHINE total region. Returns {entry_id, revision_token} or throws. */
async function ocrSalesDraft(client, cited, { cp, cents = 90000, codingKind = "sales_invoice", lines = null } = {}) {
  const firm = await firmOf(client);
  const cred = await mintInteractive(firm);
  const region = await factsRegion(cited.documentId, "invoice.total");
  return wakeDraftEntry(cred, {
    client,
    resolution: await freshResolution(world.users.alice, client, { subjectKind: "document", subjectId: cited.documentId }),
    lines: lines ?? [
      { account_code: REC, debit_cents: cents, credit_cents: 0, description: "sales-ar" },
      { account_code: REV, debit_cents: 0, credit_cents: cents, description: "sales-rev" },
    ],
    document: cited.documentId, sha256: cited.sha256,
    vendor: { existing_id: cp },
    evidence: [ev(region?.id ?? cited.regionId, region?.text_content ?? cited.quote, FIELD.total)],
    codingKind, opKey: `sales:${cited.filingId}:${cited.documentId}`,
  });
}

before(async () => {
  const ready = await a21EnsureReady();
  has16 = ready.base && ready.has16;
  if (has16) world = await buildWorld();
  else noteLane("0016 absent — a21-ocr-envelope suite dormant");
});
after(async () => { printLaneNotes("a21-ocr-envelope"); printSkipCount("a21-ocr-envelope"); await endPool(); });

test("META a21-ocr-envelope: migration 0016 present + the executor/evidence-class markers exist", async (t) => {
  await metaProbe0016(t, has16, {
    label: "OCR envelope",
    fns: ["execute_rule_post"],
    columns: [["coding_rules", "evidence_class"], ["rule_sightings", "side"]],
  });
});

test("§3.3(2) polarity_unverified FAIL-PRE: an unclassified doc skips; PASS-POST: the classifier verdict admits the SAME control set and it POSTS (no sighting, checked_via_rule stamped)", async (t) => {
  if (skipHere(t)) return;
  const client = world.clients.A1;
  const { cp, rule } = await ocrWorld(client);
  const cited = await ocrSalesDoc(client, { classify: null }); // kind NULL — everything else complete
  const draft = await ocrSalesDraft(client, cited, { cp });
  assert.ok(draft?.entry_id, "the polarity-cell draft exists (mandatory setup)");
  await postViaRule(draft.entry_id).catch((e) => noteLane(`polarity post raised ${e.code} (expected a quiet skip)`));
  assert.notEqual(await entryStatusOf(draft.entry_id), "approved", "an OCR sales draft with NO kind verdict is NEVER auto-posted");
  assert.equal(await lastSkipReason(draft.entry_id), OCR_SKIP.polarity, "the skip is NAMED polarity_unverified (caller-selected coding_kind is never polarity evidence)");
  // PASS-POST: the classifier verifies 'invoice' — the executor re-derives at post
  // time (control 8) and the same draft now posts.
  await classifyDocument({ document: cited.documentId, kind: "invoice", confidence: 0.97 });
  const sightBefore = (await sightingRows(client)).length;
  await postViaRule(draft.entry_id);
  assert.equal(await entryStatusOf(draft.entry_id), "approved", "with polarity verified the fully-corroborated OCR sales draft POSTS");
  const row = (await rootQuery("select checked_via_rule_id from clara.journal_entries where id=$1", [draft.entry_id])).rows[0];
  assert.equal(row.checked_via_rule_id, rule, "the posted entry stamps the ocr_sales rule as its checker authority");
  assert.equal((await sightingRows(client)).length, sightBefore, "a rule-posted sales approval writes NO sighting (H2 — rules never breed rules, credit side included)");
});

test("§3.3(3) direction_unproven: name-only supplier evidence (no TIN/BRN) skips — name-only direction stays human", async (t) => {
  if (skipHere(t)) return;
  const client = world.clients.A1;
  const { cp } = await ocrWorld(client);
  const cited = await ocrSalesDoc(client, { omit: ["vendor_registration"] });
  const draft = await ocrSalesDraft(client, cited, { cp });
  assert.ok(draft?.entry_id, "the direction-cell draft exists (mandatory setup)");
  await postViaRule(draft.entry_id).catch((e) => noteLane(`direction post raised ${e.code}`));
  assert.notEqual(await entryStatusOf(draft.entry_id), "approved", "an OCR sales draft with name-only supplier evidence is NEVER auto-posted");
  assert.equal(await lastSkipReason(draft.entry_id), OCR_SKIP.direction, "the skip is NAMED direction_unproven (hard direction evidence = supplier TIN/BRN + name/alias match)");
});

test("§3.3(4) anchor_missing: an ABSENT explicit tax fact skips (zero is allowed, missing is not)", async (t) => {
  if (skipHere(t)) return;
  const client = world.clients.A1;
  const { cp } = await ocrWorld(client);
  const cited = await ocrSalesDoc(client, { omit: ["tax"] });
  const draft = await ocrSalesDraft(client, cited, { cp });
  assert.ok(draft?.entry_id, "the anchor-cell draft exists (mandatory setup)");
  await postViaRule(draft.entry_id).catch((e) => noteLane(`anchor post raised ${e.code}`));
  assert.notEqual(await entryStatusOf(draft.entry_id), "approved", "an OCR sales draft missing an explicit tax fact is NEVER auto-posted");
  assert.equal(await lastSkipReason(draft.entry_id), OCR_SKIP.anchor, "the skip is NAMED anchor_missing (the corroboration set demands explicit net + explicit tax + a second anchor)");
});

test("§3.3(5) customer_unresolved: a stated customer that resolves to NO existing counterparty skips — no birth in this lane, ever", async (t) => {
  if (skipHere(t)) return;
  const client = world.clients.A1;
  const { cp } = await ocrWorld(client);
  const cited = await ocrSalesDoc(client, { customerName: `GHOST CUSTOMER ${randomUUID().slice(0, 6)} SDN BHD` });
  let draft = null;
  let draftErr = null;
  try { draft = await ocrSalesDraft(client, cited, { cp }); } catch (e) { draftErr = e; }
  if (draftErr) {
    // The unknown-customer mismatch may already refuse at the DRAFT lane — that is
    // defense-in-depth upstream of the pinned executor skip; recorded, not failed.
    noteLane(`unknown-customer draft refused at the draft lane (${draftErr.code}) — executor cell unreachable; adjudicate the enforcement layer`);
    assert.ok(draftErr.code, "the unresolved customer is refused SOMEWHERE structural");
    return;
  }
  await postViaRule(draft.entry_id).catch((e) => noteLane(`customer post raised ${e.code}`));
  assert.notEqual(await entryStatusOf(draft.entry_id), "approved", "an OCR sales draft whose customer resolves to nobody is NEVER auto-posted");
  assert.equal(await lastSkipReason(draft.entry_id), OCR_SKIP.customer, "the skip is NAMED customer_unresolved (existing resolved customer only)");
});

test("§3.2 cn_not_autopostable: a sales_credit_note draft is categorically skipped by NAME (the incidental control-shape skip is replaced)", async (t) => {
  if (skipHere(t)) return;
  const client = world.clients.A1;
  const { cp } = await ocrWorld(client);
  const cited = await ocrSalesDoc(client, { classify: "credit_note", typeCode: "02" });
  let draft = null;
  try {
    draft = await ocrSalesDraft(client, cited, {
      cp, codingKind: "sales_credit_note",
      lines: [
        { account_code: REC, debit_cents: 0, credit_cents: 90000, description: "cn-ar" },
        { account_code: REV, debit_cents: 90000, credit_cents: 0, description: "cn-rev" },
      ],
    });
  } catch (e) {
    noteLane(`CN draft refused at the draft lane (${e.code}) — cn cell unreachable at the executor; adjudicate`);
    assert.ok(e.code, "the CN is refused somewhere structural");
    return;
  }
  assert.ok(draft?.entry_id, "the CN draft exists (mandatory setup)");
  await postViaRule(draft.entry_id).catch((e) => noteLane(`cn post raised ${e.code}`));
  assert.notEqual(await entryStatusOf(draft.entry_id), "approved", "a sales credit note is NEVER auto-posted (WA21 non-goal, explicit)");
  assert.equal(await lastSkipReason(draft.entry_id), OCR_SKIP.cn, "the skip is NAMED cn_not_autopostable");
});

test("§3.3(9) repeated polarity skips (≥3 in 30 days) SUSPEND the rule pending re-signature + notify", async (t) => {
  if (skipHere(t)) return;
  const client = world.clients.A2; // its own world — the suspension poisons the rule
  const { cp, rule } = await ocrWorld(client);
  for (let i = 0; i < 3; i++) {
    const cited = await ocrSalesDoc(client, { classify: null }); // polarity gap each time
    const draft = await ocrSalesDraft(client, cited, { cp });
    assert.ok(draft?.entry_id, `suspension draft ${i + 1} exists (mandatory setup)`);
    await postViaRule(draft.entry_id).catch(() => {});
    assert.equal(await lastSkipReason(draft.entry_id), OCR_SKIP.polarity, `suspension skip ${i + 1} is polarity_unverified`);
  }
  const row = await ruleRowById(rule);
  assert.equal(row?.status, SUSPENDED_STATUS, `three polarity skips inside 30 days flip the rule to ${SUSPENDED_STATUS} (got ${row?.status})`);
  const notes = await notificationsMatching(rule);
  assert.ok(notes.length >= 1, "the suspension raises a notification referencing the rule");
  // A suspended rule must not post even a fully-corroborated draft.
  const cited = await ocrSalesDoc(client);
  const clean = await ocrSalesDraft(client, cited, { cp });
  await postViaRule(clean.entry_id).catch(() => {});
  assert.notEqual(await entryStatusOf(clean.entry_id), "approved", "a suspended rule posts NOTHING until re-signed");
});
