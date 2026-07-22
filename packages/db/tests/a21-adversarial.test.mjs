// Wave-A2.1 rig — the ADVERSARIAL battery (codex round-1 memo, findings 1-12;
// orchestrator ratifications of 2026-07-22). One cell per finding: behavioral
// fail-pre/pass-post where the fix is behavioral, structural asserts where the
// fix is a CHECK/grant. Serial discipline: --test-concurrency=1.
//
//   ADV-1  a structured rule can NEVER post an OCR document (evidence_class_mismatch)
//   ADV-2  customers/control accounts breed NO vendor_account rules
//   ADV-3  a done classifier row is not polarity evidence — the WINNING verdict
//          must positively say invoice at >=0.8 (or human) and match the kind
//   ADV-4  the stated buyer must resolve to the SIGNED customer (buyer_mismatch)
//   ADV-5  the OCR sighting floor is re-derived at signing AND posting
//   ADV-6  the pinned bounds are structural (proposal + CHECK + signing)
//   ADV-7  statutory crossings evaluate only COMPLETED months; the running
//          month is a separate PROVISIONAL signal
//   ADV-8  an ended-month attested_above future method creates liability + the
//          deadline at the earlier of the two methods
//   ADV-9  a historical/open-watch group never disappears from evaluation
//   ADV-10 watch-lowering (incl. group reassignment + not_liable) is admin+
//          with evidence
//   ADV-11 closing_transfer is human-lane only (the wake draft refuses)
//   ADV-12 add_client_alias stores the resolver's exact strip-normalization

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  rootQuery, endPool, printLaneNotes, noteLane, printSkipCount,
  buildWorld, firmOf, opk,
  a21EnsureReady, skip16, metaProbe0016, THRESHOLD_CENTS, INC, INC_I,
  proposeAutopostRule, signAutopostRule, ruleRowById, postViaRule, lastSkipReason, entryStatusOf,
  upsertPayableAccount, upsertAccountClassed, seedCitedDocument, freshResolution, grantConsent, seedStatedInvoiceFacts,
  draftEntryV3, approveEntry, reverseEntry, ev, FIELD, counterpartyRows, codingRuleRows,
  enqueueInvoiceFacts, invoiceFactsTask, claimTask, persistInvoiceFacts, factField, factsRegion,
  mintInteractive, wakeDraftEntry, addClientIdentifier, addClientAlias, classifyDocument, rm, reasonOf,
  freshWatchClient, approvedTurnoverEntry, evaluateSstWatch, openWatchRow, watchEventRows,
  setTurnoverClassification, resolveWatch, fnSource, reviseEntry, setDocumentKind, docKind,
  AP, EXP,
} from "./a21-helpers.mjs";

const REC = "300-A00";
const REV = "500-R01";
const CLIENT_REG = "199901000999";
const CLIENT_NAME = "ADVROME PROPERTIES SDN BHD";
const CUSTOMER = "ADV DARE CUSTOMER SDN BHD";

let has16 = false;
let world = null;
const ocrWorlds = new Map(); // client -> { cp, rule }

function skipHere(t) { return skip16(t, has16, "0016 not applied — adversarial battery dormant"); }

async function approvedSales(sub, { client, cp = null, newName = null, date = "2026-06-10", cents = 90000, statedId = true }) {
  const firm = await firmOf(client);
  const cited = await seedCitedDocument(sub, { firm, client, quote: rm(cents) });
  if (statedId) await seedStatedInvoiceFacts(cited, { firm }); // ADV-R2 R1#5: floor evidence needs a STATED invoice id
  const d = await draftEntryV3(sub, {
    client, resolution: await freshResolution(sub, client, { subjectKind: "document", subjectId: cited.documentId }),
    document: cited.documentId, sha256: cited.sha256,
    lines: [
      { account_code: REC, debit_cents: cents, credit_cents: 0, description: "sales-ar" },
      { account_code: REV, debit_cents: 0, credit_cents: cents, description: "sales-rev" },
    ],
    vendor: cp ? { existing_id: cp, kind: "customer" } : { new: { name: newName }, kind: "customer" },
    evidence: [ev(cited.regionId, cited.quote, FIELD.total)],
    postingDate: date, opKey: opk("advs"),
  });
  await approveEntry(sub, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("advsa") });
  return { entryId: d.entry_id, documentId: cited.documentId };
}

async function clientSetup(client) {
  const sub = world.users.alice;
  await addClientIdentifier(sub, { client, kind: "ssm", value: CLIENT_REG }).catch(() => {});
  await addClientIdentifier(sub, { client, kind: "tin", value: CLIENT_REG }).catch(() => {});
  await addClientAlias(sub, { client, alias: CLIENT_NAME.toLowerCase().replace(/[^a-z0-9]/g, "") }).catch(() => {});
  await upsertPayableAccount(sub, { client, code: AP, name: "Trade Creditors", opKey: opk("ap") }).catch(() => {});
  await upsertAccountClassed(sub, { client, code: EXP, name: "Prof Fees", type: "expense", opKey: opk("exp") }).catch(() => {});
  await upsertAccountClassed(sub, { client, code: REC, name: "Trade Debtors", type: "asset", accountClass: "receivable", opKey: opk("rec") }).catch(() => {});
  await upsertAccountClassed(sub, { client, code: REV, name: "Service Revenue", type: "income", opKey: opk("rev") }).catch(() => {});
  await grantConsent(sub, { firm: await firmOf(client), client }).catch(() => {});
}

/** A resolved customer + a LIVE ocr_sales rule (7 qualifying sightings). */
async function ocrWorld(client) {
  if (ocrWorlds.has(client)) return ocrWorlds.get(client);
  const sub = world.users.alice;
  await clientSetup(client);
  await approvedSales(sub, { client, newName: `${CUSTOMER} ${randomUUID().slice(0, 4)}`.trim(), date: "2026-06-18" });
  const cp = (await counterpartyRows(client)).find((c) => (c.name_normalized ?? "").startsWith("advdarecustomer"))?.id;
  assert.ok(cp, "adversarial ocr-world customer exists (mandatory setup)");
  const name = (await counterpartyRows(client)).find((c) => c.id === cp).name;
  const sightings = [];
  for (const date of ["2026-01-08", "2026-02-08", "2026-03-08", "2026-04-08", "2026-05-08", "2026-06-08"]) {
    sightings.push(await approvedSales(sub, { client, cp, date }));
  }
  const prop = await proposeAutopostRule(sub, { client, cp, accountCode: REV, direction: "sales", evidenceClass: "ocr_sales", cap: 200000, windowMax: 3 });
  assert.ok(!prop.error, `ocr rule admitted (mandatory setup — got ${prop.error?.code}/${prop.error ? reasonOf(prop.error) : ""})`);
  await signAutopostRule(sub, { rule: prop.id });
  assert.equal((await ruleRowById(prop.id))?.status, "live", "ocr rule live (mandatory setup)");
  const built = { cp, name, rule: prop.id, sightings };
  ocrWorlds.set(client, built);
  return built;
}

/** A facts-complete OCR sales doc (invoice_facts lane). `classify` null keeps
 *  the verdict absent; `confidence` drives the ADV-3 quality gate;
 *  `customerName` drives the ADV-4 congruence control. */
async function ocrSalesDoc(client, { cents = 90000, classify = "invoice", confidence = 0.97, customerName, stampKind = "invoice" } = {}) {
  const sub = world.users.alice;
  const firm = await firmOf(client);
  const cited = await seedCitedDocument(sub, { firm, client, quote: rm(cents) });
  if (stampKind) await rootQuery("update clara.documents set document_kind=$2 where id=$1", [cited.documentId, stampKind]);
  await enqueueInvoiceFacts(cited.documentId);
  const task = await invoiceFactsTask(cited.documentId);
  await claimTask(task.id, { egressApproved: true });
  await persistInvoiceFacts(task.id, [
    factField("invoice.total", rm(cents)),
    factField("invoice.currency", "MYR"),
    factField("invoice.vendor_name", CLIENT_NAME),
    factField("invoice.customer_name", customerName),
    factField("invoice.invoice_id", `ADV-${randomUUID().slice(0, 8)}`),
    factField("invoice.invoice_date", "2026-06-15", { polygon: [], confidence: 0.9 }),
    factField("invoice.vendor_registration", CLIENT_REG, { polygon: [], confidence: 0.9 }),
    factField("invoice.total_excl_tax", rm(cents), { polygon: [], confidence: 0.9 }),
    factField("invoice.tax_total", "RM 0.00", { polygon: [], confidence: 0.9 }),
    factField("invoice.amount_due", rm(cents), { polygon: [], confidence: 0.9 }),
  ]);
  if (classify) await classifyDocument({ document: cited.documentId, kind: classify, confidence });
  return cited;
}

async function ocrSalesDraft(client, cited, { cp, cents = 90000 }) {
  const firm = await firmOf(client);
  const cred = await mintInteractive(firm);
  const region = await factsRegion(cited.documentId, "invoice.total");
  return wakeDraftEntry(cred, {
    client,
    resolution: await freshResolution(world.users.alice, client, { subjectKind: "document", subjectId: cited.documentId }),
    lines: [
      { account_code: REC, debit_cents: cents, credit_cents: 0, description: "sales-ar" },
      { account_code: REV, debit_cents: 0, credit_cents: cents, description: "sales-rev" },
    ],
    document: cited.documentId, sha256: cited.sha256,
    vendor: { existing_id: cp, kind: "customer" },
    evidence: [ev(region?.id ?? cited.regionId, region?.text_content ?? cited.quote, FIELD.total)],
    codingKind: "sales_invoice", opKey: `sales:${cited.filingId}:${cited.documentId}`,
  });
}

before(async () => {
  const ready = await a21EnsureReady();
  has16 = ready.base && ready.has16;
  if (has16) world = await buildWorld();
  else noteLane("0016 absent — adversarial battery dormant");
});
after(async () => { printLaneNotes("a21-adversarial"); printSkipCount("a21-adversarial"); await endPool(); });

test("META a21-adversarial: migration 0016 present + the round-1 fix markers exist", async (t) => {
  if (!(await metaProbe0016(t, has16, { label: "adversarial round 1", fns: ["_ocr_sales_floor"] }))) return;
  const con = (await rootQuery("select pg_get_constraintdef(oid) as d from pg_constraint where conname='ck_coding_rules_autopost_bounds'")).rows[0];
  assert.ok(con, "ck_coding_rules_autopost_bounds exists (ADV-6 structural)");
  const cols = (await rootQuery(
    "select column_name from information_schema.columns where table_schema='clara' and table_name='compliance_watches' and column_name like 'provisional%' order by 1",
  )).rows.map((r) => r.column_name);
  assert.deepEqual(cols, ["provisional_crossed", "provisional_included_cents", "provisional_month"], "the ADV-7 provisional figures exist on the watch");
});

test("ADV-1: a STRUCTURED sales rule can never post an OCR document — evidence_class_mismatch, envelope never bypassed", async (t) => {
  if (skipHere(t)) return;
  const client = world.clients.A1;
  const sub = world.users.alice;
  await clientSetup(client);
  // A customer with 3 credit sightings and a LIVE structured rule.
  await approvedSales(sub, { client, newName: `STRUCTCO ${randomUUID().slice(0, 6)}`, date: "2026-04-01" });
  const cp = (await counterpartyRows(client)).find((c) => (c.name_normalized ?? "").startsWith("structco"))?.id;
  assert.ok(cp, "structured-cell customer exists (mandatory setup)");
  await approvedSales(sub, { client, cp, date: "2026-05-01" });
  await approvedSales(sub, { client, cp, date: "2026-06-01" });
  const prop = await proposeAutopostRule(sub, { client, cp, accountCode: REV, direction: "sales", evidenceClass: "structured", cap: 200000 });
  assert.ok(!prop.error, `structured rule admitted (mandatory setup — got ${prop.error?.code})`);
  await signAutopostRule(sub, { rule: prop.id });
  assert.equal((await ruleRowById(prop.id))?.status, "live", "structured rule live (mandatory setup)");
  // An OCR (invoice_facts-lane) doc — classifier-verified, fully corroborated —
  // must STILL not ride the structured rule around the envelope.
  const cited = await ocrSalesDoc(client, { customerName: (await counterpartyRows(client)).find((c) => c.id === cp).name });
  const draft = await ocrSalesDraft(client, cited, { cp });
  assert.ok(draft?.entry_id, "the bypass-cell draft exists (mandatory setup)");
  await postViaRule(draft.entry_id).catch((e) => noteLane(`adv-1 post raised ${e.code}`));
  assert.notEqual(await entryStatusOf(draft.entry_id), "approved", "an OCR document NEVER posts through a structured rule");
  assert.equal(await lastSkipReason(draft.entry_id), "evidence_class_mismatch",
    "the skip is NAMED evidence_class_mismatch (the document's ACTUAL extraction lane is the law, not the rule label)");
});

test("ADV-2: a customer's approvals breed NO vendor_account rule and open NO vendor question (pool gated to vendors + non-control accounts)", async (t) => {
  if (skipHere(t)) return;
  const client = world.clients.B1;
  const sub = world.users.dave;
  await upsertAccountClassed(sub, { client, code: REC, name: "Trade Debtors", type: "asset", accountClass: "receivable", opKey: opk("rec") }).catch(() => {});
  await upsertAccountClassed(sub, { client, code: REV, name: "Service Revenue", type: "income", opKey: opk("rev") }).catch(() => {});
  const name = `ADVCUST ${randomUUID().slice(0, 6)}`;
  await approvedSales(sub, { client, newName: name, date: "2026-04-02" });
  const cp = (await counterpartyRows(client)).find((c) => (c.name_normalized ?? "").startsWith("advcust"))?.id;
  assert.ok(cp, "customer exists (mandatory setup)");
  await approvedSales(sub, { client, cp, date: "2026-05-02" });
  await approvedSales(sub, { client, cp, date: "2026-06-02" });
  const bred = (await codingRuleRows(client)).filter((r) => r.counterparty_id === cp && r.rule_type === "vendor_account");
  assert.equal(bred.length, 0, "three approvals for a CUSTOMER breed no vendor_account rule at all");
  const q = await rootQuery(
    "select count(*)::int as n from clara.open_questions where counterparty_id=$1 and origin='rule_proposal'",
    [cp],
  );
  assert.equal(q.rows[0].n, 0, "no auto-spawned vendor question binds the customer");
  // World invariant: nothing anywhere binds a proposed/live vendor_account rule
  // to a customer or a control-class account (the ADV-2 repair's steady state).
  const bad = await rootQuery(
    `select count(*)::int as n from clara.coding_rules cr
       join clara.counterparties cp2 on cp2.id=cr.counterparty_id
       left join clara.coa_accounts a on a.client_id=cr.client_id and a.account_code=cr.account_code
      where cr.rule_type='vendor_account' and cr.status in ('proposed','live')
        and (cp2.kind<>'vendor' or coalesce(a.account_class,'') in ('payable','receivable'))`,
  );
  assert.equal(bad.rows[0].n, 0, "no proposed/live vendor_account rule binds a customer or a control-class account (repair steady state)");
});

test("ADV-3: a LOW-CONFIDENCE classifier verdict is not polarity evidence — the stamped kind alone never admits the OCR post", async (t) => {
  if (skipHere(t)) return;
  const client = world.clients.A1;
  const { cp, name } = await ocrWorld(client);
  // kind stamped 'invoice' at seed; the ONLY verdict row is low-confidence.
  const cited = await ocrSalesDoc(client, { classify: "invoice", confidence: 0.75, customerName: name });
  assert.equal(
    (await rootQuery("select document_kind from clara.documents where id=$1", [cited.documentId])).rows[0].document_kind,
    "invoice", "the stamped kind survives the low-confidence verdict (mandatory setup — the exploit precondition)");
  const draft = await ocrSalesDraft(client, cited, { cp });
  await postViaRule(draft.entry_id).catch((e) => noteLane(`adv-3 post raised ${e.code}`));
  assert.notEqual(await entryStatusOf(draft.entry_id), "approved", "a low-confidence verdict NEVER admits the post");
  assert.equal(await lastSkipReason(draft.entry_id), "polarity_unverified",
    "the skip is polarity_unverified (the winning verdict must positively say invoice at >=0.8 or be human)");
  // PASS-POST: a high-confidence verdict on the same doc admits the same draft.
  // The low-confidence verdict opened the ADR-023 review question (correct,
  // blocking) — the fixture dismisses it below the writer layer so the
  // pass-post half can run (the question lane has its own battery).
  await classifyDocument({ document: cited.documentId, kind: "invoice", confidence: 0.96 });
  await rootQuery(
    "update clara.open_questions set status='dismissed', resolved_by=$2, resolved_at=now(), resolution_text='adv-3 fixture: re-verified at high confidence' where document_id=$1 and origin='classification' and status='open'",
    [cited.documentId, world.users.alice],
  );
  await postViaRule(draft.entry_id);
  assert.equal(await entryStatusOf(draft.entry_id), "approved", "the high-confidence verdict admits the identical control set");
});

test("ADV-4: the stated buyer must resolve to the SIGNED customer — Buyer B / a ghost buyer on Customer A's rule skips buyer_mismatch", async (t) => {
  if (skipHere(t)) return;
  const client = world.clients.A1;
  const sub = world.users.alice;
  const { cp } = await ocrWorld(client);
  // An EXISTING other customer B.
  const bName = `OTHERBUYER ${randomUUID().slice(0, 6)} SDN BHD`;
  await approvedSales(sub, { client, newName: bName, date: "2026-06-12" });
  const citedB = await ocrSalesDoc(client, { customerName: bName });
  const draftB = await ocrSalesDraft(client, citedB, { cp });
  await postViaRule(draftB.entry_id).catch((e) => noteLane(`adv-4 B post raised ${e.code}`));
  assert.notEqual(await entryStatusOf(draftB.entry_id), "approved", "an invoice naming Buyer B never posts through Customer A's authority");
  assert.equal(await lastSkipReason(draftB.entry_id), "buyer_mismatch", "the skip is NAMED buyer_mismatch (existing other customer)");
  // A GHOST buyer (resolves to nobody — birth is never allowed in this lane).
  const citedG = await ocrSalesDoc(client, { customerName: `GHOST ${randomUUID().slice(0, 6)} SDN BHD` });
  const draftG = await ocrSalesDraft(client, citedG, { cp });
  await postViaRule(draftG.entry_id).catch((e) => noteLane(`adv-4 ghost post raised ${e.code}`));
  assert.notEqual(await entryStatusOf(draftG.entry_id), "approved", "a ghost buyer never posts");
  assert.equal(await lastSkipReason(draftG.entry_id), "buyer_mismatch", "the skip is NAMED buyer_mismatch (unresolvable buyer)");
});

test("ADV-5: the OCR sighting floor is RE-DERIVED — reversing the evidence refuses the signature and strips the live authority", async (t) => {
  if (skipHere(t)) return;
  const client = world.clients.A2;
  const sub = world.users.alice;
  const { cp, name, rule, sightings } = await ocrWorld(client);
  // A second proposal admitted while the floor holds (7 qualifying).
  const prop2 = await proposeAutopostRule(sub, { client, cp, accountCode: REV, direction: "sales", evidenceClass: "ocr_sales", cap: 150000 });
  assert.ok(!prop2.error, `the second proposal is admitted while the floor holds (got ${prop2.error?.code})`);
  // Reverse two sighting entries -> 5 qualifying.
  await reverseEntry(world.users.bob, { entry: sightings[0].entryId, reason: "adv-5 reversal", opKey: opk("rv1") });
  await reverseEntry(world.users.bob, { entry: sightings[1].entryId, reason: "adv-5 reversal", opKey: opk("rv2") });
  // SIGNING refuses: the floor no longer holds.
  let signErr = null;
  try { await signAutopostRule(sub, { rule: prop2.id }); } catch (e) { signErr = e; }
  assert.ok(signErr, "signing a proposal whose evidence was reversed is REFUSED");
  assert.equal(signErr.code, "CLR27", `the sign refusal is CLR27 (got ${signErr.code})`);
  assert.equal(reasonOf(signErr), "insufficient_evidence", "the refusal names the lost floor");
  // POSTING skips: the LIVE rule's floor is re-derived under the client lock.
  const cited = await ocrSalesDoc(client, { customerName: name });
  const draft = await ocrSalesDraft(client, cited, { cp });
  await postViaRule(draft.entry_id).catch((e) => noteLane(`adv-5 post raised ${e.code}`));
  assert.notEqual(await entryStatusOf(draft.entry_id), "approved", "a live rule whose evidence was reversed posts NOTHING");
  assert.equal(await lastSkipReason(draft.entry_id), "floor_lost", "the skip is NAMED floor_lost");
  void rule;
});

test("ADV-6: the pinned bounds are STRUCTURAL — a widened proposal refuses, a raw out-of-bounds row violates the CHECK", async (t) => {
  if (skipHere(t)) return;
  const client = world.clients.A1;
  const sub = world.users.alice;
  const { cp } = await ocrWorld(client);
  const audits0 = (await rootQuery("select count(*)::int as n from clara.audit_log where fn='propose_autopost_rule_refused'")).rows[0].n;
  const wide = await proposeAutopostRule(sub, { client, cp, accountCode: REV, direction: "sales", evidenceClass: "ocr_sales", windowMax: 1000 });
  assert.ok(wide.error, "window_max_posts=1000 is REFUSED at proposal");
  assert.equal(reasonOf(wide.error), "bounds_exceeded", `the refusal names the bounds (got ${reasonOf(wide.error)})`);
  const far = await proposeAutopostRule(sub, { client, cp, accountCode: REV, direction: "sales", evidenceClass: "ocr_sales", expiresAt: "2099-01-01" });
  assert.ok(far.error, "a 2099 expiry is REFUSED at proposal");
  assert.equal(reasonOf(far.error), "bounds_exceeded", "the expiry refusal names the bounds");
  // ADV-R2#4: each refusal left a DURABLE append-only audit trace (the typed
  // refusal RETURNS instead of raising, so the trace survives).
  const audits1 = (await rootQuery("select count(*)::int as n from clara.audit_log where fn='propose_autopost_rule_refused'")).rows[0].n;
  assert.ok(audits1 >= audits0 + 2, `both bounds refusals wrote audit rows (${audits0} -> ${audits1})`);
  const firm = await firmOf(client);
  await assert.rejects(
    () => rootQuery(
      `insert into clara.coding_rules(firm_id,client_id,rule_type,counterparty_id,account_code,status,pinned,origin,content_hash,created_by,
          amount_cap_cents,frequency_window,window_max_posts,expires_at,direction,evidence_class)
       values($1,$2,'autopost',$3,$4,'proposed',false,'authored',encode(sha256(convert_to($5,'UTF8')),'hex'),$6,
          100000,'monthly',1000,now()+interval '12 months','sales','structured')`,
      [firm, client, cp, REV, `adv6-${randomUUID()}`, world.users.alice],
    ),
    (e) => e.code === "23514",
    "a raw out-of-bounds autopost row violates ck_coding_rules_autopost_bounds (23514)",
  );
});

test("ADV-7: a CURRENT-month crossing is PROVISIONAL only; a completed-month crossing is statutory with the s.13 deadline", async (t) => {
  if (skipHere(t)) return;
  const { users } = world;
  const client = await freshWatchClient(users.alice, { name: `adv7_${randomUUID().slice(0, 6)}` });
  // Over the threshold ENTIRELY inside the month in progress.
  await approvedTurnoverEntry({ maker: users.alice, checker: users.bob, client, cents: THRESHOLD_CENTS + 1, date: "2026-07-15" });
  await evaluateSstWatch(client);
  let w = await openWatchRow(client, "G");
  assert.ok(w, "the watch exists on activity");
  assert.ok(!["crossed", "overdue"].includes(w.state), `current-month movement NEVER crosses statutorily (got ${w.state})`);
  assert.equal(w.earliest_crossing_month, null, "no statutory crossing month from month-to-date activity");
  assert.equal(w.application_due, null, "no statutory deadline starts before the month ends");
  assert.equal(w.provisional_crossed, true, "the provisional signal IS raised (visibility without a statutory claim)");
  assert.equal(Number(w.provisional_included_cents), THRESHOLD_CENTS + 1, "the provisional figure is exact to the sen");
  // The same amount in a COMPLETED month crosses with the statutory countdown.
  await approvedTurnoverEntry({ maker: users.alice, checker: users.bob, client, cents: THRESHOLD_CENTS + 1, date: "2026-06-15" });
  await evaluateSstWatch(client);
  w = await openWatchRow(client, "G");
  assert.equal(w.state, "crossed", "a completed-month crossing IS statutory");
  assert.equal(w.earliest_crossing_month, "2026-06-01", "the crossing month is the completed month");
  assert.equal(w.application_due, "2026-07-31", "application due the last day of the following month (s.13(1))");
});

test("ADV-8: an ended-month attested_above future method creates liability + the deadline (earlier-of-the-two-methods)", async (t) => {
  if (skipHere(t)) return;
  const { users } = world;
  const client = await freshWatchClient(users.alice, { name: `adv8_${randomUUID().slice(0, 6)}` });
  await approvedTurnoverEntry({ maker: users.alice, checker: users.bob, client, cents: 100_00, date: "2026-06-05" });
  // A signed above-threshold 12-month attestation, as-of LAST month (its month
  // has ended). The audited writer stamps as_of=current_date, so the ended-month
  // record rides a root insert (append-only admits inserts; interface note).
  const firm = await firmOf(client);
  await rootQuery(
    `insert into clara.sst_future_attestations (firm_id, client_id, service_group, expected_cents, horizon_start, evidence_note, reviewer, as_of, expires_at)
     values ($1, $2, 'G', $3, '2026-07-01', 'adv-8 signed 12-month mandate above threshold', 'adv reviewer', '2026-06-20', '2027-06-20')`,
    [firm, client, THRESHOLD_CENTS + 10_000_00],
  );
  await evaluateSstWatch(client);
  const w = await openWatchRow(client, "G");
  assert.equal(w.future_method_status, "attested_above", "the future method reads attested_above");
  assert.equal(w.state, "crossed", "an ended-month attested_above IS liability — never a mere label");
  assert.equal(w.earliest_crossing_month, "2026-06-01", "the crossing month is the attestation's (ended) month");
  assert.equal(w.application_due, "2026-07-31", "the same statutory deadline engine drives the future method");
  const kinds = (await watchEventRows(w.id)).map((e) => e.event_kind);
  assert.ok(kinds.includes("created") || kinds.includes("tier_change"), `the transition trail exists (got ${kinds.join(",")})`);
});

test("ADV-9: a crossed group never disappears — reclassifying the account keeps the open watch evaluated", async (t) => {
  if (skipHere(t)) return;
  const { users } = world;
  const client = await freshWatchClient(users.alice, { name: `adv9_${randomUUID().slice(0, 6)}`, groups: { [INC]: "G", [INC_I]: "I" } });
  await approvedTurnoverEntry({ maker: users.alice, checker: users.bob, client, cents: THRESHOLD_CENTS + 1, date: "2026-06-10", account: INC_I });
  await evaluateSstWatch(client);
  let w = await openWatchRow(client, "I");
  assert.equal(w?.state, "crossed", "group I crossed (mandatory setup)");
  const evalAt0 = w.evaluated_at;
  // Admin reclassifies the I account to EXCLUDED, effective AFTER the crossing
  // month (admin+ with evidence — the ADV-10 floor).
  await setTurnoverClassification(users.alice, {
    client, accountCode: INC_I, classification: "excluded", serviceGroup: "I",
    reason: "adv-9 reclassification", evidence: "adv-9 evidence", effectiveFrom: "2026-07-01",
  });
  await evaluateSstWatch(client);
  w = await openWatchRow(client, "I");
  assert.ok(w, "the I watch is STILL an open episode — it never vanishes from evaluation");
  assert.ok(new Date(w.evaluated_at) > new Date(evalAt0), "the I watch keeps receiving evaluations after the group's classification vanished from today's rows");
  assert.equal(w.state, "crossed", "the historical (pre-reclassification) crossing stands");
});

test("ADV-10: watch-lowering is admin+ WITH evidence — group reassignment and not_liable_documented included", async (t) => {
  if (skipHere(t)) return;
  const { users } = world;
  const client = await freshWatchClient(users.alice, { name: `adv10_${randomUUID().slice(0, 6)}` });
  await approvedTurnoverEntry({ maker: users.alice, checker: users.bob, client, cents: THRESHOLD_CENTS + 1, date: "2026-06-11" });
  await evaluateSstWatch(client);
  const w = await openWatchRow(client, "G");
  assert.equal(w?.state, "crossed", "crossed watch (mandatory setup)");
  // (a) a BOOKKEEPER may not reassign the service group (turnover splitting).
  let err = null;
  try {
    await setTurnoverClassification(users.bob, { client, accountCode: INC, classification: "included", serviceGroup: "I", effectiveFrom: "2026-07-10" });
  } catch (e) { err = e; }
  assert.ok(err, "a bookkeeper's service-group reassignment is refused");
  assert.equal(err.code, "CLR04", `the refusal is the admin floor (got ${err.code})`);
  // (b) a BOOKKEEPER may not resolve not_liable_documented.
  err = null;
  try {
    await resolveWatch(users.bob, { watch: w.id, conclusion: "not_liable_documented", evidence: "bookkeeper says so" });
  } catch (e) { err = e; }
  assert.ok(err, "a bookkeeper's not_liable_documented resolution is refused");
  assert.equal(err.code, "CLR04", `the refusal is the admin floor (got ${err.code})`);
  // (c) an ADMIN lowering WITHOUT evidence is refused.
  err = null;
  try {
    await setTurnoverClassification(users.alice, { client, accountCode: INC, classification: "excluded", evidence: "", effectiveFrom: "2026-07-11" });
  } catch (e) { err = e; }
  assert.ok(err, "an evidence-less lowering is refused even for admin");
  assert.equal(err.code, "CLR10", `the refusal demands evidence (got ${err.code})`);
  // (d) the ADMIN path with evidence works (the floor blocks roles, not the firm).
  await setTurnoverClassification(users.alice, {
    client, accountCode: INC, classification: "included", serviceGroup: "I",
    evidence: "adv-10 admin group review", effectiveFrom: "2026-07-12",
  });
});

test("ADV-11: closing_transfer is a HUMAN-lane marker — the wake/agent draft refuses it", async (t) => {
  if (skipHere(t)) return;
  const { users } = world;
  const client = await freshWatchClient(users.alice, { name: `adv11_${randomUUID().slice(0, 6)}` });
  const firm = await firmOf(client);
  const cred = await mintInteractive(firm);
  let err = null;
  try {
    await wakeDraftEntry(cred, {
      client,
      resolution: await freshResolution(users.alice, client),
      lines: [
        { account_code: "1000", debit_cents: 10000, credit_cents: 0, description: "dr" },
        { account_code: INC, debit_cents: 0, credit_cents: 10000, description: "cr" },
      ],
      flags: { is_year_end: true, closing_transfer: true },
      memo: "adv-11 wake closing transfer", opKey: opk("adv11"),
    });
  } catch (e) { err = e; }
  assert.ok(err, "a wake draft carrying closing_transfer=true is REFUSED");
  assert.equal(err.code, "CLR03", `the refusal is the agent-authority family (got ${err.code})`);
  // The human lane still sets it (P7 — the marker exists for humans).
  const d = await draftEntryV3(users.alice, {
    client, resolution: await freshResolution(users.alice, client),
    lines: [
      { account_code: "1000", debit_cents: 10000, credit_cents: 0, description: "dr" },
      { account_code: INC, debit_cents: 0, credit_cents: 10000, description: "cr" },
    ],
    flags: { is_year_end: true, closing_transfer: true }, memo: "adv-11 human closing transfer", opKey: opk("adv11h"),
  });
  const row = (await rootQuery("select closing_transfer from clara.journal_entries where id=$1", [d.entry_id])).rows[0];
  assert.equal(row.closing_transfer, true, "the HUMAN draft lane stamps the marker");
});

test("R3-1 (R1#1): a document with BOTH done facts lanes is ambiguous evidence — the post skips evidence_lane_ambiguous", async (t) => {
  if (skipHere(t)) return;
  const client = world.clients.A1;
  const { cp, name } = await ocrWorld(client);
  const cited = await ocrSalesDoc(client, { customerName: name });
  const draft = await ocrSalesDraft(client, cited, { cp });
  assert.ok(draft?.entry_id, "the dual-lane cell draft exists (mandatory setup)");
  // Seed a SECOND done facts lane (a historical local/XML parse beside the OCR
  // lane) — raw, below the writer layer.
  const firm = await firmOf(client);
  const ext2 = randomUUID();
  await rootQuery(
    `insert into clara.document_processing_tasks(firm_id,document_id,engine_id,engine_config,version_n,lane,status,workflow_run_id,started_at,finished_at)
     values($1,$2,'clara-myinvois:v1','{}'::jsonb,1,'local_facts','done','rig-dual-lane',now(),now())`,
    [firm, cited.documentId],
  );
  await rootQuery(
    `insert into clara.document_extractions(id,firm_id,document_id,engine_id,engine_kind,version_n,status,page_count)
     values($1,$2,$3,'clara-myinvois:v1','invoice_facts',1,'done',1)`,
    [ext2, firm, cited.documentId],
  );
  await postViaRule(draft.entry_id).catch((e) => noteLane(`r3-1 post raised ${e.code}`));
  assert.notEqual(await entryStatusOf(draft.entry_id), "approved", "a dual-lane document NEVER posts (no coin-flip between extractions)");
  assert.equal(await lastSkipReason(draft.entry_id), "evidence_lane_ambiguous", "the skip is NAMED evidence_lane_ambiguous");
});

test("R3-2 (R1#2): the AUTHORED vendor-rule path refuses customers and control accounts; the insert trigger is structural; the signer is type-bound", async (t) => {
  if (skipHere(t)) return;
  const { users, clients } = world;
  const client = clients.A1;
  const { cp } = await ocrWorld(client); // an existing CUSTOMER
  const { proposeCodingRule, signCodingRule } = await import("./a21-helpers.mjs");
  // (a) propose: a customer counterparty refuses by NAME.
  let err = null;
  try { await proposeCodingRule(users.alice, { client, counterparty: cp, accountCode: EXP }); } catch (e) { err = e; }
  assert.ok(err, "propose_coding_rule(customer) is REFUSED");
  assert.equal(reasonOf(err), "vendor_required", `the refusal names the vendor floor (got ${reasonOf(err)})`);
  // (b) propose: a control-class target refuses by NAME (vendor + REC).
  const vName = `R32VEND ${randomUUID().slice(0, 6)}`;
  const firm = await firmOf(client);
  const vId = (await rootQuery(
    `insert into clara.counterparties(firm_id,client_id,kind,name,name_normalized,created_by)
     values($1,$2,'vendor',$3,$4,$5) returning id`,
    [firm, client, vName, vName.toLowerCase().replace(/[^a-z0-9]/g, ""), users.alice],
  )).rows[0].id;
  err = null;
  try { await proposeCodingRule(users.alice, { client, counterparty: vId, accountCode: REC }); } catch (e) { err = e; }
  assert.ok(err, "propose_coding_rule(vendor, receivable-control) is REFUSED");
  assert.equal(reasonOf(err), "control_account", `the refusal names the control floor (got ${reasonOf(err)})`);
  // (c) the STRUCTURAL floor: a raw insert of the same shape violates the trigger.
  await assert.rejects(
    () => rootQuery(
      `insert into clara.coding_rules(firm_id,client_id,rule_type,counterparty_id,account_code,status,pinned,origin,content_hash,created_by)
       values($1,$2,'vendor_account',$3,$4,'proposed',false,'authored',encode(sha256(convert_to($5,'UTF8')),'hex'),$6)`,
      [firm, client, cp, EXP, `r32-${randomUUID()}`, users.alice],
    ),
    (e) => e.code === "CLR27",
    "a raw customer-bound vendor_account insert is blocked by the BEFORE INSERT trigger",
  );
  // (d) the generic bookkeeper signer never flips an AUTOPOST rule live.
  const { cp: cp2 } = await ocrWorld(client);
  const prop = await proposeAutopostRule(users.alice, { client, cp: cp2, accountCode: REV, direction: "sales", evidenceClass: "ocr_sales" });
  assert.ok(!prop.error, `an autopost proposal for the signer cell (got ${prop.error?.code})`);
  err = null;
  try { await signCodingRule(users.bob, { rule: prop.id }); } catch (e) { err = e; }
  assert.ok(err, "sign_coding_rule refuses a non-vendor_account rule");
  assert.equal(reasonOf(err), "wrong_rule_type", `the signer is TYPE-BOUND (got ${reasonOf(err)}) — an autopost authority needs the admin signer`);
});

test("R3-3 (R1#8): liability is STICKY — attestation expiry/replacement re-arms freshness but never erases a crossed month", async (t) => {
  if (skipHere(t)) return;
  const { users } = world;
  const client = await freshWatchClient(users.alice, { name: `r33_${randomUUID().slice(0, 6)}` });
  await approvedTurnoverEntry({ maker: users.alice, checker: users.bob, client, cents: 100_00, date: "2026-06-05" });
  const firm = await firmOf(client);
  await rootQuery(
    `insert into clara.sst_future_attestations (firm_id, client_id, service_group, expected_cents, horizon_start, evidence_note, reviewer, as_of, expires_at)
     values ($1, $2, 'G', $3, '2026-07-01', 'r3-3 above-threshold mandate', 'r3 reviewer', '2026-06-20', '2027-06-20')`,
    [firm, client, THRESHOLD_CENTS + 10_000_00],
  );
  await evaluateSstWatch(client);
  let w = await openWatchRow(client, "G");
  assert.equal(w?.state, "crossed", "the ended-month attested_above crossing (mandatory setup)");
  const dueBefore = w.application_due;
  // REPLACEMENT: a newer below-threshold attestation must NOT erase liability.
  await rootQuery(
    `insert into clara.sst_future_attestations (firm_id, client_id, service_group, expected_cents, horizon_start, evidence_note, reviewer, as_of, expires_at)
     values ($1, $2, 'G', 100, '2026-08-01', 'r3-3 later below-threshold view', 'r3 reviewer', current_date, '2027-07-01')`,
    [firm, client],
  );
  await evaluateSstWatch(client);
  w = await openWatchRow(client, "G");
  assert.equal(w.state, "crossed", "a below-threshold REPLACEMENT never rewrites crossed back to monitored");
  assert.equal(w.earliest_crossing_month, "2026-06-01", "the crossed month survives the replacement");
  assert.equal(w.application_due, dueBefore, "the statutory deadline survives the replacement");
  // EXPIRY: expire every attestation — liability still survives; freshness re-arms.
  await ackWatchSafe(users.alice, w.id);
  await rootQuery(
    "set session_replication_role = replica; update clara.sst_future_attestations set expires_at='2026-07-01' where client_id='" + client + "'; reset session_replication_role",
  );
  await evaluateSstWatch(client);
  w = await openWatchRow(client, "G");
  assert.equal(w.state, "crossed", "attestation EXPIRY never erases the crossed liability");
  assert.equal(w.earliest_crossing_month, "2026-06-01", "the crossed month survives expiry");
  assert.equal(w.future_method_status, "expired", "the future-method FRESHNESS flag flips to expired");
  assert.equal(w.acknowledged_at, null, "the expiry re-armed the acknowledged watch (freshness, not liability)");
});

test("R3-5 (R2#5 strict): the OCR floor demands six STATED invoice numbers — a number-less doc is not floor evidence", async (t) => {
  if (skipHere(t)) return;
  const { clients } = world;
  const client = clients.B1;
  const sub = world.users.dave;
  const name = `R35CO ${randomUUID().slice(0, 6)}`;
  // Birth + 5 sightings: SIX docs, but ONE (the birth) carries NO stated id.
  await approvedSales(sub, { client, newName: name, date: "2026-01-03", statedId: false });
  const cp = (await counterpartyRows(client)).find((c) => (c.name_normalized ?? "").startsWith("r35co"))?.id;
  assert.ok(cp, "customer exists (mandatory setup)");
  const docs = [];
  for (const date of ["2026-02-03", "2026-03-03", "2026-04-03", "2026-05-03", "2026-06-03"]) {
    docs.push(await approvedSales(sub, { client, cp, date }));
  }
  const five = await proposeAutopostRule(sub, { client, cp, accountCode: REV, direction: "sales", evidenceClass: "ocr_sales" });
  assert.ok(five.error, "six docs with only FIVE stated invoice numbers REFUSE (no document-UUID fallback)");
  assert.equal(reasonOf(five.error), "insufficient_evidence", `the refusal is the floor (got ${reasonOf(five.error)})`);
  // Stating the sixth number (a later extraction on the birth doc's sibling) admits.
  await approvedSales(sub, { client, cp, date: "2026-06-20" });
  const six = await proposeAutopostRule(sub, { client, cp, accountCode: REV, direction: "sales", evidenceClass: "ocr_sales" });
  assert.ok(!six.error, `with SIX stated numbers the proposal is admitted (got ${six.error?.code}/${six.error ? reasonOf(six.error) : ""})`);
  void docs;
});

test("R3-10 (R2#5 tz): statutory month figures are session-timezone independent (Asia/Kuala_Lumpur law)", async (t) => {
  if (skipHere(t)) return;
  const { users } = world;
  const client = await freshWatchClient(users.alice, { name: `r310_${randomUUID().slice(0, 6)}` });
  await approvedTurnoverEntry({ maker: users.alice, checker: users.bob, client, cents: 500_00, date: "2026-06-06" });
  // The evaluator's date derivation is pinned to MYT in EXECUTABLE source —
  // ADV-R3#7: comments are stripped first, so a prose mention can never
  // satisfy the assertion; and no session-tz date primitive may remain.
  const stripSql = (s) => s.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const src = stripSql(await fnSource("evaluate_sst_watch"));
  assert.ok(src.includes("Asia/Kuala_Lumpur"), "the evaluator derives its dates from Asia/Kuala_Lumpur (executable code, not a comment)");
  assert.ok(!/current_date/.test(src), "no session-timezone current_date survives in the evaluator's executable code");
  const sweepSrc = stripSql(await fnSource("evaluate_sst_watches_all"));
  assert.ok(!/current_date/.test(sweepSrc), "the sweep's schedule_note rides the MYT date, never session current_date");
  // …and behaviorally: two sessions at the tz extremes (their current_dates
  // ALWAYS differ) must produce IDENTICAL statutory windows. NOTE: decisive
  // whenever the extreme dates straddle a month boundary; mid-month both agree
  // by arithmetic — the cell is a boundary tripwire, the source pin is the law.
  const runIn = async (tz) => {
    const r = await rootQuery(
      `begin; set local time zone '${tz}'; select clara.evaluate_sst_watch('${client}'::uuid, 'r310:${tz}:${Date.now()}') as r; commit`,
    );
    const rows = Array.isArray(r) ? r : [r];
    void rows;
    const w = await openWatchRow(client, "G");
    return { window_end: w.window_end, provisional_month: w.provisional_month };
  };
  const west = await runIn("Etc/GMT+12");
  const east = await runIn("Etc/GMT-14");
  assert.deepEqual(west, east, "the statutory window is identical under UTC-12 and UTC+14 sessions (Malaysian legal dates)");
});

async function ackWatchSafe(sub, watch) {
  const { ackWatch } = await import("./a21-helpers.mjs");
  await ackWatch(sub, { watch, rationale: "r3 ack" });
}

test("ADV-12: add_client_alias stores the resolver's exact strip-normalization and refuses an empty-normalizing alias", async (t) => {
  if (skipHere(t)) return;
  const { users, clients } = world;
  const display = `ADV ALIAS ${randomUUID().slice(0, 6).toUpperCase()} SDN. BHD.`;
  const canonical = display.toLowerCase().replace(/[^a-z0-9]/g, "");
  await addClientAlias(users.alice, { client: clients.A1, alias: display });
  const stored = await rootQuery(
    "select alias_normalized from clara.client_aliases where client_id=$1 and alias_normalized=$2 and retired_at is null",
    [clients.A1, canonical],
  );
  assert.equal(stored.rows.length, 1, "the DISPLAY form is stored strip-normalized (the direction resolver's exact form)");
  const bad = await rootQuery(
    "select count(*)::int as n from clara.client_aliases where client_id=$1 and alias_normalized ~ '[^a-z0-9]'",
    [clients.A1],
  );
  assert.equal(bad.rows[0].n, 0, "no live alias for the client escapes the canonical alphabet");
  await assert.rejects(
    () => addClientAlias(users.alice, { client: clients.A1, alias: "!!! *** !!!" }),
    (e) => e.code === "CLR10",
    "an alias that normalizes to empty is refused (CLR10)",
  );
});

test("R4-1 (R3#1): the post path binds ONE extraction end-to-end — pinned variants exist and the core reads the executor's pin", async (t) => {
  if (skipHere(t)) return;
  const stripSql = (s) => s.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  for (const [fn, args] of [
    ["_document_direction_at", "uuid,uuid,uuid"],
    ["_assert_supplier_bill_shape_at", "uuid,uuid"],
    ["_assert_sales_invoice_shape_at", "uuid,uuid"],
    ["_invoice_fact_state_at", "uuid,uuid"],
  ]) {
    const r = await rootQuery(
      "select count(*)::int as n from pg_proc p join pg_namespace n2 on n2.oid=p.pronamespace where n2.nspname='clara' and p.proname=$1",
      [fn],
    );
    assert.equal(r.rows[0].n, 1, `clara.${fn}(${args}) exists exactly once (the one-overload law holds)`);
  }
  const core = stripSql(await fnSource("_approve_entry_core"));
  assert.ok(core.includes("bound_extraction"), "the approve core reads the executor's bound extraction from the ctx");
  assert.ok(core.includes("_assert_supplier_bill_shape_at") && core.includes("_assert_sales_invoice_shape_at"),
    "both shape floors receive the pin");
  const exec = stripSql(await fnSource("execute_rule_post"));
  assert.ok(exec.includes("_document_direction_at"), "direction reads the bound extraction");
  assert.ok(exec.includes("'bound_extraction',v_fx"), "the executor threads v_fx into the approve core");
});

test("R4-2 (R3#2): a crossing AFTER a not_liable resolution REOPENS a new episode — the old resolution never suppresses later liability", async (t) => {
  if (skipHere(t)) return;
  const { users } = world;
  const client = await freshWatchClient(users.alice, { name: `r42_${randomUUID().slice(0, 6)}` });
  await approvedTurnoverEntry({ maker: users.alice, checker: users.bob, client, cents: THRESHOLD_CENTS + 1, date: "2026-04-10" });
  await evaluateSstWatch(client);
  let w = await openWatchRow(client, "G");
  assert.ok(["crossed", "overdue"].includes(w?.state), `the April crossing (mandatory setup; overdue past 2026-05-31 — got ${w?.state})`);
  await resolveWatch(users.alice, { watch: w.id, conclusion: "not_liable_documented", evidence: "r4-2 documented analysis" });
  await evaluateSstWatch(client);
  assert.equal(await openWatchRow(client, "G"), null, "resolved THIS month: no completed month lies after the resolution — the episode stays closed");
  // Backdate the resolution to April month-end (root fixture write): May's and
  // June's month-end rolling tests now lie STRICTLY AFTER it.
  await rootQuery(
    "update clara.compliance_watches set resolved_at='2026-04-30T12:00:00+08' where client_id=$1 and state='resolved'",
    [client],
  );
  await evaluateSstWatch(client);
  w = await openWatchRow(client, "G");
  assert.ok(w, "a post-resolution crossing REOPENS a new open episode");
  assert.equal(w.earliest_crossing_month, "2026-05-01", "the new episode seeds from the first post-resolution crossing month (May), never the adjudicated April");
  assert.equal(w.application_due, "2026-06-30", "the statutory deadline follows the reopened crossing");
  assert.equal(w.state, "overdue", "past the reopened deadline the ladder reads overdue (today > 2026-06-30)");
});

test("R4-5 (R3#5): a reused op_key with widened bounds is a request-hash MISMATCH — never a replay around the bounds check", async (t) => {
  if (skipHere(t)) return;
  const client = world.clients.A1;
  const sub = world.users.alice;
  const { cp } = await ocrWorld(client);
  const key = `r45:${randomUUID()}`;
  const ok = await proposeAutopostRule(sub, { client, cp, accountCode: REV, direction: "sales", evidenceClass: "ocr_sales", cap: 150000, windowMax: 3, opKey: key });
  assert.ok(!ok.error, `the in-bounds proposal is admitted (got ${ok.error?.code}/${ok.error ? reasonOf(ok.error) : ""})`);
  const replay = await proposeAutopostRule(sub, { client, cp, accountCode: REV, direction: "sales", evidenceClass: "ocr_sales", cap: 150000, windowMax: 1000, opKey: key });
  assert.ok(replay.error, "the SAME op_key with widened bounds never replays the earlier success");
  assert.equal(replay.error.code, "CLR10", `the refusal is the op-idiom hash mismatch (got ${replay.error.code})`);
  const widened = await rootQuery(
    "select count(*)::int as n from clara.coding_rules where client_id=$1 and rule_type='autopost' and window_max_posts>3",
    [client],
  );
  assert.equal(widened.rows[0].n, 0, "no widened rule row exists anywhere for the client");
});

test("R5-1 (R4 must-1): a FACTS-ABSENT document skips facts_missing BEFORE direction — the post never proceeds unpinned", async (t) => {
  if (skipHere(t)) return;
  const client = world.clients.A1;
  const sub = world.users.alice;
  const { cp } = await ocrWorld(client);
  const firm = await firmOf(client);
  // A cited doc with ZERO done facts lanes (layout OCR only — no invoice_facts).
  const cited = await seedCitedDocument(sub, { firm, client, quote: rm(90000) });
  const draft = await ocrSalesDraft(client, cited, { cp });
  assert.ok(draft?.entry_id, "the facts-less draft exists (mandatory setup)");
  await postViaRule(draft.entry_id).catch((e) => noteLane(`r5-1 post raised ${e.code}`));
  assert.notEqual(await entryStatusOf(draft.entry_id), "approved", "a facts-absent draft NEVER posts");
  assert.equal(await lastSkipReason(draft.entry_id), "facts_missing", "the skip is NAMED facts_missing (before direction — never an unpinned pass-through)");
  // The core's rule-driven pin requirement is structural.
  const stripSql = (s) => s.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(stripSql(await fnSource("_approve_entry_core")).includes("unpinned_rule_post"),
    "a rule-driven core approval structurally requires a non-null bound extraction");
});

test("R5-3 (R4 must-3): the proposal hash is STABLE for omitted expiry (retry replays) and supersession is real genealogy", async (t) => {
  if (skipHere(t)) return;
  const client = world.clients.A1;
  const sub = world.users.alice;
  const { cp, rule } = await ocrWorld(client);
  // (a) omitted-expiry retry: the identical request on the SAME op_key REPLAYS
  // the receipt (pre-fix the moving now()+12mo default hash-mismatched CLR10).
  const key = `r53:${randomUUID()}`;
  const first = await proposeAutopostRule(sub, { client, cp, accountCode: REV, direction: "sales", evidenceClass: "ocr_sales", cap: 120000, opKey: key });
  assert.ok(!first.error, `the omitted-expiry proposal is admitted (got ${first.error?.code})`);
  const retry = await proposeAutopostRule(sub, { client, cp, accountCode: REV, direction: "sales", evidenceClass: "ocr_sales", cap: 120000, opKey: key });
  assert.ok(!retry.error, `the identical omitted-expiry RETRY replays instead of hash-mismatching (got ${retry.error?.code}/${retry.error ? reasonOf(retry.error) : ""})`);
  assert.equal(retry.id, first.id, "the replay returns the SAME rule (op idempotency restored for default expiry)");
  // (b) supersession genealogy: a valid target writes through; garbage refuses by name.
  const sup = await proposeAutopostRule(sub, { client, cp, accountCode: REV, direction: "sales", evidenceClass: "ocr_sales", cap: 110000, supersedes: rule });
  assert.ok(!sup.error, `a proposal superseding the live rule is admitted (got ${sup.error?.code})`);
  assert.equal((await ruleRowById(sup.id))?.supersedes_rule_id, rule, "supersedes_rule_id is WRITTEN THROUGH (the 0015-pinned genealogy is real)");
  const bad = await proposeAutopostRule(sub, { client, cp, accountCode: REV, direction: "sales", evidenceClass: "ocr_sales", cap: 110000, supersedes: randomUUID() });
  assert.ok(bad.error, "a supersession naming no retire-able own rule is refused");
  assert.equal(reasonOf(bad.error), "bad_supersession", `the refusal is NAMED (got ${reasonOf(bad.error)})`);
});

test("R5-5 (R4 must-5): compliance-writer op hashes cover the persisted evidence — changed evidence never silently replays", async (t) => {
  if (skipHere(t)) return;
  const { users } = world;
  const client = await freshWatchClient(users.alice, { name: `r55_${randomUUID().slice(0, 6)}` });
  const key = `r55:${randomUUID()}`;
  await setTurnoverClassification(users.alice, { client, accountCode: INC, classification: "included", serviceGroup: "G", evidence: "evidence A", effectiveFrom: "2026-07-01", opKey: key });
  let err = null;
  try {
    await setTurnoverClassification(users.alice, { client, accountCode: INC, classification: "included", serviceGroup: "G", evidence: "evidence B (changed)", effectiveFrom: "2026-07-01", opKey: key });
  } catch (e) { err = e; }
  assert.ok(err, "the SAME op_key with CHANGED evidence never replays the old write");
  assert.equal(err.code, "CLR10", `the refusal is the op-idiom hash mismatch (got ${err.code})`);
});

test("R5-6 (R4 must-6): a HUMAN kind verdict is never overwritten by the classifier; task settling is engine-bound", async (t) => {
  if (skipHere(t)) return;
  const client = world.clients.A1;
  const sub = world.users.alice;
  const firm = await firmOf(client);
  // (a) human precedence.
  const cited = await seedCitedDocument(sub, { firm, client, quote: "RM 5,000.00" });
  await classifyDocument({ document: cited.documentId, kind: "invoice", confidence: 0.97 });
  await setDocumentKind(world.users.bob, { document: cited.documentId, kind: "payment_voucher", reason: "r5-6 human correction" });
  await classifyDocument({ document: cited.documentId, kind: "invoice", confidence: 0.99 });
  assert.equal(await docKind(cited.documentId), "payment_voucher", "the classifier NEVER overwrites an explicit human correction");
  const verdicts = (await rootQuery(
    "select count(*)::int as n from clara.document_extractions where document_id=$1 and engine_kind='doc_classify' and status='done'",
    [cited.documentId])).rows[0].n;
  assert.ok(verdicts >= 3, `the classifier's verdict ROW still persists under human precedence (got ${verdicts})`);
  // (b) engine binding: a verdict under a foreign engine settles NO running task.
  const cited2 = await seedCitedDocument(sub, { firm, client, quote: "RM 5,000.00" });
  await enqueueInvoiceFacts(cited2.documentId); // NULL kind -> classify task
  const task = (await rootQuery(
    "select to_jsonb(t) as row from clara.document_processing_tasks t where t.document_id=$1 and t.lane='classify' order by t.created_at desc limit 1",
    [cited2.documentId])).rows[0].row;
  assert.ok(task, "the classify task exists (mandatory setup)");
  await claimTask(task.id, { egressApproved: true });
  await classifyDocument({ document: cited2.documentId, kind: "invoice", confidence: 0.95, engineId: "clara-classify-other:v9" });
  assert.equal((await rootQuery("select status from clara.document_processing_tasks where id=$1", [task.id])).rows[0].status,
    "running", "a foreign-engine verdict settles NOTHING (the claimed snapshot binds)");
  await classifyDocument({ document: cited2.documentId, kind: "invoice", confidence: 0.95, engineId: task.engine_id });
  assert.equal((await rootQuery("select status from clara.document_processing_tasks where id=$1", [task.id])).rows[0].status,
    "done", "the matching-engine verdict settles the claimed task");
});

test("R5-7 (R4 must-7 / pin P7): closing_transfer is settable through the human REVISE wrapper — draft-only, allow-listed, recorded", async (t) => {
  if (skipHere(t)) return;
  const { users } = world;
  const client = await freshWatchClient(users.alice, { name: `r57_${randomUUID().slice(0, 6)}` });
  const { draftEntryV3: mkDraft, freshResolution: mkRes } = await import("./a21-helpers.mjs");
  const d = await mkDraft(users.alice, {
    client, resolution: await mkRes(users.alice, client),
    lines: [
      { account_code: "1000", debit_cents: 40000, credit_cents: 0, description: "dr" },
      { account_code: INC, debit_cents: 0, credit_cents: 40000, description: "cr" },
    ],
    flags: { is_year_end: true }, memo: "r5-7 year-end draft", opKey: opk("r57"),
  });
  assert.equal((await rootQuery("select closing_transfer from clara.journal_entries where id=$1", [d.entry_id])).rows[0].closing_transfer,
    false, "the draft starts unmarked (mandatory setup)");
  const out = await reviseEntry(users.alice, {
    entry: d.entry_id,
    lines: {
      lines: [
        { account_code: "1000", debit_cents: 40000, credit_cents: 0, description: "dr" },
        { account_code: INC, debit_cents: 0, credit_cents: 40000, description: "cr" },
      ],
      flags: { closing_transfer: true },
    },
    expectedRevision: d.revision_token, opKey: opk("r57b"),
  });
  assert.ok(out?.revision_token, "the wrapper revise succeeds (same-arity JSON input)");
  const row = (await rootQuery("select closing_transfer, status from clara.journal_entries where id=$1", [d.entry_id])).rows[0];
  assert.equal(row.closing_transfer, true, "the human REVISE path sets the marker (pin P7)");
  assert.equal(row.status, "draft", "still a draft (the marker is draft-only)");
  const rev = (await rootQuery(
    "select header->>'closing_transfer' as ct from clara.journal_entry_revisions where entry_id=$1 order by revision_no desc limit 1",
    [d.entry_id])).rows[0];
  assert.equal(rev.ct, "true", "the revision record captures the marker");
  // An unknown wrapper flag refuses by name.
  await assert.rejects(
    () => reviseEntry(users.alice, {
      entry: d.entry_id,
      lines: { lines: [
        { account_code: "1000", debit_cents: 40000, credit_cents: 0, description: "dr" },
        { account_code: INC, debit_cents: 0, credit_cents: 40000, description: "cr" },
      ], flags: { closing_transfer: false, is_opening_balance: true } },
      expectedRevision: out.revision_token, opKey: opk("r57c"),
    }),
    (e) => e.code === "CLR10",
    "an off-allowset wrapper flag is refused (closing_transfer only)",
  );
});

test("R6-1 (R5 final): the human attestation engine ID is RESERVED — a classifier can never mint human precedence", async (t) => {
  if (skipHere(t)) return;
  const client = world.clients.A1;
  const sub = world.users.alice;
  const firm = await firmOf(client);
  const cited = await seedCitedDocument(sub, { firm, client, quote: "RM 5,000.00" });
  // (1) the runtime lane calling with the reserved ID refuses by NAME.
  await assert.rejects(
    () => classifyDocument({ document: cited.documentId, kind: "invoice", confidence: 0.99, engineId: "clara-classify-human:v1" }),
    (e) => e.code === "CLR10" && reasonOf(e) === "reserved_engine",
    "classify_document REFUSES the reserved human engine id (named reserved_engine)",
  );
  assert.equal(await docKind(cited.documentId), null, "the spoof attempt wrote no kind");
  // (2) no phantom precedence: a normal classifier verdict still sets the kind.
  await classifyDocument({ document: cited.documentId, kind: "invoice", confidence: 0.95 });
  assert.equal(await docKind(cited.documentId), "invoice", "with NO real human row the classifier still governs the kind");
  // (3) a REAL set_document_kind row (the source='human' marker) still takes
  // precedence, and the later classifier still persists its own verdict row.
  await setDocumentKind(world.users.bob, { document: cited.documentId, kind: "receipt", reason: "r6-1 human correction" });
  const rows0 = (await rootQuery(
    "select count(*)::int as n from clara.document_extractions where document_id=$1 and engine_kind='doc_classify' and status='done'",
    [cited.documentId])).rows[0].n;
  await classifyDocument({ document: cited.documentId, kind: "invoice", confidence: 0.99 });
  assert.equal(await docKind(cited.documentId), "receipt", "the real human verdict (source marker) still wins over a later classifier");
  const rows1 = (await rootQuery(
    "select count(*)::int as n from clara.document_extractions where document_id=$1 and engine_kind='doc_classify' and status='done'",
    [cited.documentId])).rows[0].n;
  assert.equal(rows1, rows0 + 1, "the deferring classifier still persists its own verdict row");
});
