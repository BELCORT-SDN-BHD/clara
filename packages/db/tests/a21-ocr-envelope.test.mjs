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
  upsertAccountClassed, seedCitedDocument, freshResolution, grantConsent, seedStatedInvoiceFacts,
  draftEntryV3, approveEntry, ev, FIELD, counterpartyRows, sightingRows,
  enqueueInvoiceFacts, invoiceFactsTask, claimTask, persistInvoiceFacts, factField, factsRegion,
  mintInteractive, wakeDraftEntry, addClientIdentifier, addClientAlias, rm, fnSource,
} from "./a21-helpers.mjs";
// 0022 / X4: whether the OCR-sales anchor lane is held shut by the extraction-slice dark
// guard, read off the LIVE catalog. See the note at the two PASS-POST halves below.
import { ocrAnchorDarkGuard, agreedEnvelope } from "./x1-helpers.mjs";

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
  if (!doc) await seedStatedInvoiceFacts(cited, { firm }); // ADV-R2 R1#5: floor evidence needs a STATED invoice id
  const d = await draftEntryV3(sub, {
    client, resolution: await freshResolution(sub, client, { subjectKind: "document", subjectId: cited.documentId }),
    document: cited.documentId, sha256: cited.sha256,
    lines: [
      { account_code: REC, debit_cents: cents, credit_cents: 0, description: "sales-ar" },
      { account_code: REV, debit_cents: 0, credit_cents: cents, description: "sales-rev" },
    ],
    // INTEGRATION (CLASS T): the existing_id lane defaults kind='vendor' (0015
    // as-built) — an existing customer must state kind or the lookup refuses CLR23.
    vendor: cp ? { existing_id: cp, kind: "customer" } : { new: { name: newName }, kind: "customer" },
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
  // INTEGRATION (CLASS T): add_client_alias takes p_alias_NORMALIZED — the caller
  // supplies the canonical strip-normalized form ([^a-zA-Z0-9] removed, lowered);
  // the direction resolver compares against exactly that form. Passing the display
  // string stored an alias that could never match (and with the registration
  // matching but the name "contradicting", _document_direction abstained CLR30).
  // Flag for the adversarial pass: the writer accepts an un-stripped string silently.
  await addClientAlias(sub, { client, alias: CLIENT_NAME.toLowerCase().replace(/[^a-z0-9]/g, "") }).catch((e) => noteLane(`client alias ${e.code}`));
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

/** A classify task already exists the moment seedCitedDocument's underlying
 *  file_document call runs (kind is null then — file_document itself auto-enqueues via
 *  _enqueue_invoice_facts_core, 0009). 0024 round 3 (P1) closed the no-task ceremony for
 *  any document with classify-task history, so every classifyDocument call below must bind
 *  to a genuine task+run — claim whichever classify task the doc already carries. */
async function claimedClassifyTask(documentId) {
  const r = await rootQuery(
    "select id, status from clara.document_processing_tasks where document_id=$1 and lane='classify' order by created_at desc limit 1",
    [documentId],
  );
  const row = r.rows[0];
  assert.ok(row, `mandatory setup: a classify task exists for ${documentId} (file_document's own auto-enqueue)`);
  if (row.status === "running") return { id: row.id, runId: (await rootQuery("select workflow_run_id from clara.document_processing_tasks where id=$1", [row.id])).rows[0].workflow_run_id };
  const claimed = await claimTask(row.id, { egressApproved: false });
  return { id: row.id, runId: claimed.workflow_run_id };
}

/** A facts-complete OCR sales document. `omit` drops named anchor/direction facts;
 *  `classify` (default 'invoice') sets the polarity verdict; null leaves kind NULL. */
async function ocrSalesDoc(client, { cents = 90000, classify = "invoice", omit = [], customerName = CUSTOMER, typeCode = "01" } = {}) {
  const sub = world.users.alice;
  const firm = await firmOf(client);
  const cited = await seedCitedDocument(sub, { firm, client, quote: rm(cents) });
  // INTEGRATION (CLASS T): under the 0016 P3 gate a NULL-kind pdf enqueues
  // `classify` FIRST — the fixture models the source-stamped corpus (kind set at
  // seed, NOT a classifier verdict: no doc_classify row exists, so the §3.3(2)
  // polarity control still starts unverified). The classify-first loop itself is
  // proven in a21-classifier-gate.
  await rootQuery("update clara.documents set document_kind='invoice' where id=$1", [cited.documentId]);
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
  // 0023 (X5): a corroborated OCR document must carry the reader/typed AGREEMENT the
  // mapper records — regions alone are one reader's assertion.
  await persistInvoiceFacts(task.id, fields, { envelope: agreedEnvelope() });
  if (classify) {
    const cls = await claimedClassifyTask(cited.documentId);
    await classifyDocument({ document: cited.documentId, kind: classify, confidence: 0.97, task: cls.id, run: cls.runId });
  }
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
    vendor: { existing_id: cp, kind: "customer" }, // kind stated — see approvedSales
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
  // time (control 8) and the same draft now posts. 0024 round 3 (P1): the doc already
  // carries classify-task history (file_document's own auto-enqueue) — bind to it.
  const cls = await claimedClassifyTask(cited.documentId);
  await classifyDocument({ document: cited.documentId, kind: "invoice", confidence: 0.97, task: cls.id, run: cls.runId });
  const sightBefore = (await sightingRows(client)).length;
  await postViaRule(draft.entry_id).catch((e) => noteLane(`polarity pass-post raised ${e.code}`));
  // 0022 / X4 — the PASS-POST half is now conditional on the extraction-slice DARK GUARD,
  // and deliberately NOT rewritten to a weaker claim. Migration 0022 holds the OCR-sales
  // anchor block shut unconditionally until X5 ships corroboration-by-agreement, because
  // X2's net/tax fields would otherwise switch that barrier off as a side effect (contract
  // §2 X4 / gate XG5; the FATAL 2 of gate-p-build-refused-2026-07-27.md). The predicate is
  // read from the live catalog, so when X5 deletes the disjunct this cell goes back to
  // asserting the post with no edit — the 0016 claim is preserved, not retired.
  if (await ocrAnchorDarkGuard()) {
    assert.notEqual(await entryStatusOf(draft.entry_id), "approved",
      "…and at 0022+ the SAME fully-corroborated draft is held by the X4 dark guard instead");
    assert.equal(await lastSkipReason(draft.entry_id), OCR_SKIP.anchor,
      "…skipping anchor_missing, which is the live outcome for all 29 existing extractions");
    return;
  }
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
  // WHICH WALL CATCHES THIS MOVED AT 0023, and the reason is worth stating rather than
  // hiding behind an `or`. Before X5 the OCR branch corroborated on vendor confidence alone,
  // so a tax-less document reached the anchor block and was refused THERE by its
  // `v_tax is null` disjunct. X5 makes corroboration itself require an explicit tax, so the
  // executor now refuses one gate EARLIER, at `not_corroborated`, and the anchor block is
  // never reached for this shape. The document is refused either way — which is the claim
  // that matters — but the anchor disjunct is now defence in depth behind corroboration
  // rather than the first wall. Asserted exactly, so a future change that lets this shape
  // through either gate fails loudly.
  assert.equal(
    await lastSkipReason(draft.entry_id),
    (await ocrAnchorDarkGuard()) ? OCR_SKIP.anchor : OCR_SKIP.notCorroborated,
    "a document that states no tax is refused — at the anchor block while the dark disjunct stood, at corroboration once X5 required an explicit tax",
  );
});

test("§3.3(5) customer_unresolved: a customer that no longer resolves skips — no birth in this lane, ever", async (t) => {
  if (skipHere(t)) return;
  // INTEGRATION (CLASS T, ratified impl reading): control (d) = the RULE's
  // counterparty must remain an EXISTING RESOLVED CUSTOMER, re-derived at post
  // time — the pins never demand a doc-stated-buyer↔counterparty congruence
  // check (the original cell's reading; flagged for the adversarial pass as an
  // observation: a ghost buyer name on the doc does not by itself block the
  // post). The cell now retires the customer and proves the post is refused by
  // a NAMED structural counterparty skip, then restores the world.
  const client = world.clients.A1;
  const { cp } = await ocrWorld(client);
  const cited = await ocrSalesDoc(client, {});
  const draft = await ocrSalesDraft(client, cited, { cp });
  assert.ok(draft?.entry_id, "the customer-cell draft exists (mandatory setup)");
  // The counterparty state machine is MERGE-ONLY (ck_counterparties_merge_retirement:
  // retired ⇔ merged) — the legal "customer no longer resolves as itself" condition
  // is a merge. The forward merge is trigger-admitted; the restore is a raw fixture
  // write below the trigger layer (replica role), guaranteed in finally.
  const firm = await firmOf(client);
  const target = (await rootQuery(
    `insert into clara.counterparties (firm_id, client_id, kind, name, name_normalized, created_by)
     values ($1, $2, 'customer', 'MERGE TARGET RIG SDN BHD', 'mergetargetrigsdnbhd', $3)
     returning id`,
    [firm, client, world.users.alice],
  )).rows[0].id;
  await rootQuery("update clara.counterparties set merged_into=$1, retired_at=now() where id=$2", [target, cp]);
  try {
    await postViaRule(draft.entry_id).catch((e) => noteLane(`customer post raised ${e.code}`));
    assert.notEqual(await entryStatusOf(draft.entry_id), "approved", "an OCR sales draft whose customer no longer resolves as itself is NEVER auto-posted");
    const reason = await lastSkipReason(draft.entry_id);
    assert.ok([OCR_SKIP.customer, "counterparty_ambiguous", "counterparty_unresolved", "no_live_rule"].includes(reason),
      `the refusal is a NAMED structural counterparty/rule skip (got ${reason}) — no birth, no silent post to a moved identity`);
  } finally {
    await rootQuery(
      `set session_replication_role = replica; update clara.counterparties set merged_into=null, retired_at=null where id='${cp}'; reset session_replication_role`,
    );
  }
  // The in-transaction (d) backstop itself is structural: the executor re-derives
  // the existing-resolved-customer condition and names the skip.
  const src = await fnSource("execute_rule_post");
  assert.ok(src.includes(OCR_SKIP.customer), "execute_rule_post carries the customer_unresolved re-derivation (control d, post-time)");
  assert.ok(/kind\s*=\s*'customer'/.test(src), "the (d) re-check demands kind='customer' (an existing resolved CUSTOMER, never a vendor)");
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
