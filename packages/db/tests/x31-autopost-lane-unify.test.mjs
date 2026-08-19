// Migration 0031 -- admission/lane agreement and the recurring-fee duplicate ruling.
//
//   x31.a  a real EZSEC-shaped live binding reaches READY and one-click admission.
//   x31.b  a genuine same-invoice-id duplicate still flags near_duplicate.
//   x31.c  an absent current invoice_id stays fail-conservative.
//   x31.d  different documents with the same invoice_id still flag.
//   x31.d2 different documents with distinct present invoice_ids suppress the amount limb.
//   x31.e  a refusal is not cached (op_receipts asserted at zero rows); resolving the
//          blocker admits fresh, the admitted receipt is directly asserted SETTLED
//          (not orphaned pending), then a third call replays idempotently.
//   x31.f  the SAME physical document (forced same sha256) re-extracted with a
//          drifted invoice_id still flags -- the sha256 guard, not just the id compare.
//   x31.g  an absent invoice_id on the CANDIDATE (prior) side still flags too, not
//          only an absent current-side one.
//   x31.h  a shared invoice_date still flags even when distinct invoice_ids would
//          suppress the amount limb -- the date limb is a fully independent OR-branch.
//
// Serial discipline: --test-concurrency=1 (shared rig convention).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  AP,
  EXP,
  FIELD,
  agreedEnvelope,
  buildWorld,
  claimTask,
  codingLane,
  endPool,
  factField,
  grantConsent,
  humanPersona,
  invoiceFactsTask,
  mintLegacyInvoiceFactsTask,
  opk,
  persistInvoiceFacts,
  primeReadyFiling,
  requestAutodraft,
  rootQuery,
  seedCitedDocument,
  statedIdentityFields,
  upsertAccountClassed,
  upsertPayableAccount,
  withActor,
} from "./wave-a-fixtures.mjs";
import {
  FULL_ABSENT_RECEIPT,
  propose,
  seedApprovedEntry,
  seedBareDocument,
  seedF123Evidence,
  seedPayableAccount,
  seedVendorCounterparty,
  sign,
} from "./x36-vendor-binding-helpers.mjs";

const AMOUNT = 100_000;
const EZSEC_FRAGMENTS = [
  "ez\n易计\nezAccount\nCOUNT",
  "ez\n易计\nezAccount",
  "ez\n易计\nezAccount\nCOUNT YOUR VICTORY",
];
const PASSING_DATES = ["2025-08-25", "2025-08-29", "2025-10-13"];

let w = null;

async function has30() {
  try {
    const r = await rootQuery(
      "select 1 from clara.schema_migrations where version='0030_vendor_binding_f1_lcp'",
    );
    return r.rows.length > 0;
  } catch {
    return false;
  }
}

async function has31() {
  try {
    const r = await rootQuery(
      "select 1 from clara.schema_migrations where version='0031_autopost_lane_unify'",
    );
    return r.rows.length > 0;
  } catch {
    return false;
  }
}

async function requireReady() {
  if (!await has30()) {
    throw new Error(
      "0030_vendor_binding_f1_lcp is not applied -- x31 requires the full vendor-binding prestate",
    );
  }
  if (!await has31()) {
    throw new Error(
      "0031_autopost_lane_unify is not applied -- this battery must fail against the pre-0031 behavior",
    );
  }
}

const money = (cents) =>
  `RM ${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

async function addLatestOcr(document, text) {
  const version = (await rootQuery(
    `select coalesce(max(version_n),0)::int as version_n
     from clara.document_extractions
     where document_id=$1 and engine_kind='ocr'`,
    [document],
  )).rows[0].version_n;
  const extraction = randomUUID();
  await rootQuery(
    `insert into clara.document_extractions(
       id,firm_id,document_id,engine_id,engine_kind,version_n,status,
       page_count,envelope
     ) values (
       $1,$2,$3,'x31-ocr:v1','ocr',$4,'done',1,
       '{"pages":[{"page_number":1,"height":11}]}'::jsonb
     )`,
    [extraction, w.firms.A, document, version + 1],
  );
  await rootQuery(
    `insert into clara.document_regions(
       firm_id,extraction_id,locator_kind,locator,field_path,
       text_content,engine_confidence
     ) values (
       $1,$2,'page_polygon',$3::jsonb,'pages.1.lines.1',$4,1.0
     )`,
    [
      w.firms.A,
      extraction,
      JSON.stringify({
        page_number: 1,
        polygon: [1, 0.5, 2, 0.5, 2, 0.9, 1, 0.9],
      }),
      text,
    ],
  );
}

const WITNESS_BELT = [
  "invoice.total", "invoice.total_excl_tax", "invoice.tax_total", "invoice.rounding",
  "invoice.service_charge", "invoice.discount", "invoice.delivery",
  "invoice.amount_due", "invoice.deposit", "invoice.currency", "invoice.type_code",
];
/** One channel's envelope. `stated` maps a belt field to its rendering; every belt member it
 *  omits is answered `not_printed`, which is an ANSWER and not silence (design §3.3 -- the
 *  roster is REQUIRED for all eleven on BOTH rows, or clara.evaluate_witness_fact_state_v1
 *  refuses the read outright). `refs` appends the OPTIONAL M3 reference answers, whose slot
 *  carries the NORMALIZED `value` the cross-regime duplicate walls compare on. */
function x31WitnessEnvelope(channel, stated, refs = {}) {
  const answers = {};
  for (const f of WITNESS_BELT) {
    answers[f] = Object.prototype.hasOwnProperty.call(stated, f)
      ? { state: "value", raw: stated[f] }
      : { state: "not_printed" };
  }
  return { witness: { channel, answers: { ...answers, ...refs } } };
}

/** Push a NEWER extraction onto an EXISTING (already-extracted) document, through the REAL
 *  clara.request_reextraction verb (M-8, cross-model review: restored -- the SAME shape a
 *  genuine re-read drives, not a hand-built bypass). F-A1 PR-3 CUTOVER: the invoice-shaped
 *  arm now mints llm_witness, never invoice_facts (no dual-run, D9), so this settles through
 *  clara.persist_witness_facts instead of persist_invoice_facts -- the SAME shape
 *  x1-supersede.test.mjs's settleReextraction already proves. The near_duplicate machinery
 *  this cell exists to test reads through clara._invoice_fact_state, PR-1's cross-regime
 *  dispatcher (0092/0093), which is regime-agnostic by design -- so landing on the witness
 *  lane rather than the legacy one changes nothing the assertions below actually check. */
async function addLatestFacts(documentId, { amount, invoiceId, vendorName, vendorRegistration }) {
  const { requestReextraction } = await import("./x1-helpers.mjs");
  const receipt = await requestReextraction(w.users.alice, { document: documentId, reason: "x31 drifted re-read" });
  const task = { id: receipt.task_id, version_n: receipt.version_n };
  await claimTask(task.id, { egressApproved: true });

  const firm = (await rootQuery("select firm_id from clara.documents where id=$1", [documentId])).rows[0].firm_id;
  const sha256 = (await rootQuery("select sha256 from clara.documents where id=$1", [documentId])).rows[0].sha256;
  const ocrExtraction = (await rootQuery(
    `select id from clara.document_extractions
      where document_id=$1 and engine_kind='ocr' and status='done' order by version_n desc limit 1`,
    [documentId])).rows[0].id;
  // document_regions is append-only (0007's _tf_append_only) -- a drifted re-read cites NEW
  // regions on the SAME pinned OCR extraction, never an UPDATE of the original quote.
  //
  // THE STATED BELT, and it is the witness-regime TWIN of what this fixture used to send
  // through the legacy lane: `statedIdentityFields(amount)` (net = total, tax = 0) under
  // `agreedEnvelope()`. Corroboration is not a property of the writer -- it is
  // clara.evaluate_witness_fact_state_v1's verdict (0092 §4), and it demands net AND tax
  // STATED and single, an EXPLICIT type_code '01', MYR confirmed INDEPENDENTLY on BOTH
  // channels, and the identity equation tying to the sen. An envelope that answers only
  // invoice.total (x1-supersede.test.mjs's shape, whose cells read total_cents and never the
  // verdict) can therefore never corroborate, and a fixture that shipped one here would leave
  // the two assertions below testing the fixture's own poverty rather than the drift.
  const money_ = money(amount);
  const zero = money(0);
  const stated = {
    "invoice.total": money_,
    "invoice.total_excl_tax": money_,
    "invoice.tax_total": zero,
    // Both TOKEN fields, whose citation is optional (review B1) -- answered, never cited.
    "invoice.currency": "MYR",
    "invoice.type_code": "01",
  };
  const newFields = [
    { field_path: "invoice.total", text_content: money_ },
    { field_path: "invoice.total_excl_tax", text_content: `SUBTOTAL ${money_}` },
    { field_path: "invoice.tax_total", text_content: `SST 0% ${zero}` },
    { field_path: "invoice.invoice_id", text_content: invoiceId },
    { field_path: "invoice.vendor_name", text_content: vendorName },
    // Without a registration region, the re-extraction resolves the vendor via a NAME-ONLY
    // lookup, which is `registered_name_ambiguous` (-> vendor_ambiguous, AB-16) against an
    // already-registered counterparty -- unrelated to what this cell is proving, so the
    // registration must be carried forward identically.
    ...(vendorRegistration !== undefined ? [{ field_path: "invoice.vendor_registration", text_content: vendorRegistration }] : []),
  ];
  const inserted = [];
  for (const f of newFields) {
    const r = await rootQuery(
      `insert into clara.document_regions(firm_id,extraction_id,locator_kind,locator,field_path,text_content,engine_confidence)
       values($1,$2,'page_polygon','{"page":1,"polygon":[0,0,1,1]}'::jsonb,$3,$4,1.0)
       returning id`,
      [firm, ocrExtraction, f.field_path, f.text_content]);
    inserted.push({ field_path: f.field_path, id: r.rows[0].id });
  }
  const idxRows = (await rootQuery(
    `select id, (row_number() over (order by id))::int as idx
       from clara.document_regions where extraction_id=$1`,
    [ocrExtraction])).rows;
  const idxById = new Map(idxRows.map((r) => [r.id, r.idx]));
  // A citation on one of the SEVEN OPTIONAL reference paths takes its rendering from the
  // CITATION ENTRY, not from the answers roster (0095 §10) -- an entry without `raw` writes no
  // region at all, so a reference path cited the belt way lands the state's invoice_id NULL and
  // this cell would then flag near_duplicate through the ABSENT-id limb (x31.c's path) while
  // claiming to prove the drifted-id one.
  const REFERENCE = new Set(["invoice.invoice_id", "invoice.vendor_name", "invoice.vendor_registration"]);
  const rawOf = new Map(newFields.map((f) => [f.field_path, f.text_content]));
  const citations = inserted.map((f) => ({
    field_path: f.field_path,
    region_idx: idxById.get(f.id),
    ...(REFERENCE.has(f.field_path) ? { raw: rawOf.get(f.field_path) } : {}),
  }));
  // M3's reference-value slot, on BOTH channels: the normalized value the duplicate walls
  // compare across regimes, beside the document's own rendering the citation carries.
  const refs = { "invoice.invoice_id": { state: "value", raw: invoiceId, value: invoiceId } };

  const text = {
    input_pin: ocrExtraction, prompt_hash: `text-${randomUUID()}`,
    envelope: x31WitnessEnvelope("text", stated, refs), citations,
  };
  const vision = {
    input_pin: sha256, prompt_hash: `vision-${randomUUID()}`,
    envelope: x31WitnessEnvelope("vision", stated, refs),
  };
  await rootQuery(
    "select clara.persist_witness_facts($1,$2::jsonb,$3::jsonb,$4) as s",
    [task.id, JSON.stringify(text), JSON.stringify(vision), 1]);

  const state = (await rootQuery(
    "select clara._invoice_fact_state($1) as state",
    [documentId],
  )).rows[0].state;
  assert.equal(state.corroborated, true, "the re-extraction fixture must also reach genuine Tier-A corroboration");
  assert.equal(state.invoice_id, invoiceId);
  return state;
}

async function seedFactFiling({
  cp,
  invoiceId,
  vendorName = cp.name,
  vendorRegistration = cp.reg,
  amount = AMOUNT,
  invoiceDate = null,
  bindingEvidence = false,
  ocrText = null,
}) {
  const cited = await seedCitedDocument(w.users.alice, {
    firm: w.firms.A,
    client: w.clients.A1,
    quote: money(amount),
    kind: "invoice",
  });
  // F-A1 PR-3 CUTOVER: the router's invoice-kind arm now mints llm_witness, never
  // invoice_facts (no dual-run, D9) -- this fixture only needs a task ON the
  // invoice_facts lane to exercise ITS downstream machinery, so it mints directly.
  await mintLegacyInvoiceFactsTask(cited.documentId);
  const task = await invoiceFactsTask(cited.documentId);
  await claimTask(task.id, { egressApproved: true });
  const fields = [
    factField(FIELD.total, money(amount)),
    factField(FIELD.currency, "MYR"),
    factField(FIELD.vendorName, vendorName),
    ...statedIdentityFields(amount),
  ];
  if (invoiceId !== null) {
    fields.push(factField(FIELD.invoiceId, invoiceId));
  }
  if (vendorRegistration !== null) {
    fields.push(factField("invoice.vendor_registration", vendorRegistration));
  }
  if (invoiceDate !== null) {
    fields.push(factField(FIELD.invoiceDate, invoiceDate));
  }
  await persistInvoiceFacts(task.id, fields, {
    envelope: agreedEnvelope({
      extra: bindingEvidence
        ? { vendor_identity: FULL_ABSENT_RECEIPT }
        : {},
    }),
  });
  if (ocrText !== null) {
    await addLatestOcr(cited.documentId, ocrText);
  }
  const state = (await rootQuery(
    "select clara._invoice_fact_state($1) as state",
    [cited.documentId],
  )).rows[0].state;
  assert.equal(state.corroborated, true, "fixture must reach genuine Tier-A corroboration");
  assert.equal(Number(state.total_cents), amount);
  return { ...cited, task, state };
}

async function seedApprovedFactEntry(cited, cp, {
  amount = AMOUNT,
  postingDate = "2026-01-15",
} = {}) {
  return withActor({ transaction: true }, async (client) => {
    const inserted = await client.query(
      `insert into clara.journal_entries(
         firm_id,client_id,status,posting_date,origin,document_id,filing_id,
         source_doc_sha256,maker_actor,coding_kind
       ) values (
         $1,$2,'draft',$3,'agent',$4,$5,$6,$7,'supplier_bill'
       ) returning id`,
      [
        w.firms.A,
        w.clients.A1,
        postingDate,
        cited.documentId,
        cited.filingId,
        cited.sha256,
        w.users.alice,
      ],
    );
    const entry = inserted.rows[0].id;
    await client.query(
      `insert into clara.journal_lines(
         entry_id,line_no,account_code,debit_cents,credit_cents,
         description,counterparty_id
       ) values
         ($1,1,$2,$4,0,'expense',$5),
         ($1,2,$3,0,$4,'payable',$5)`,
      [entry, EXP, AP, amount, cp.id],
    );
    await client.query(
      `update clara.journal_entries
       set status='approved',checker_actor=$2,approved_at=now()
       where id=$1`,
      [entry, w.users.bob],
    );
    // 0037 (Wave C-a): belt-1 is a DEFERRED constraint trigger -- at COMMIT every
    // approved entry's per-(domain,counterparty) control nets must equal its
    // open_items rows. This fixture raw-approves (no verb runs, so the subledger
    // hook never fires), and its payable credit leg would otherwise stand with no
    // item behind it. Write the congruent row the classifier would produce for a
    // supplier_bill (ap / 'bill' / +gross) in the SAME transaction. Guarded on the
    // table existing so the suite stays green at pre-0037 schemas.
    const hasSubledger = (await client.query("select to_regclass('clara.open_items') as rel")).rows[0].rel != null;
    if (hasSubledger) {
      await client.query(
        `insert into clara.open_items(firm_id,client_id,domain,counterparty_id,entry_id,item_kind,item_date,amount_cents,created_by)
         values($1,$2,'ap',$3,$4,'bill',$5::date,$6::bigint,$7)`,
        [w.firms.A, w.clients.A1, cp.id, entry, postingDate, amount, w.users.alice],
      );
    }
    return entry;
  });
}

async function seedApprovedPair(tag, {
  firstInvoiceId,
  secondInvoiceId,
  amount = AMOUNT,
}) {
  const cp = await seedVendorCounterparty(w.firms.A, w.clients.A1, tag);
  const first = await seedFactFiling({
    cp,
    invoiceId: firstInvoiceId,
    amount,
  });
  await seedApprovedFactEntry(first, cp, { amount });
  const second = await seedFactFiling({
    cp,
    invoiceId: secondInvoiceId,
    amount,
  });
  assert.notEqual(first.sha256, second.sha256, "the pair must use different physical documents");
  return { cp, first, second };
}

async function laneCore(filing) {
  const r = await rootQuery(
    "select lane,reasons from clara._coding_lane_core($1,$2)",
    [w.clients.A1, filing],
  );
  return r.rows[0];
}

async function liveTasks(filing) {
  const r = await rootQuery(
    `select count(*)::int as n
     from clara.autodraft_attempts aa
     join clara.agent_tasks t on t.id=aa.task_id
       where aa.filing_id=$1
         and t.kind='autodraft'
         and t.status not in ('completed','failed','cancelled','expired')`,
    [filing],
  );
  return r.rows[0].n;
}

before(async () => {
  await requireReady();
  w = await buildWorld();
  await seedPayableAccount(w.firms.A, w.clients.A1);
  await upsertPayableAccount(w.users.alice, {
    client: w.clients.A1,
    code: "400-000",
    name: "Trade Creditors",
    opKey: opk("x31-ap"),
  });
  await upsertAccountClassed(w.users.alice, {
    client: w.clients.A1,
    code: "500-A01",
    name: "Prof Fees",
    type: "expense",
    opKey: opk("x31-exp"),
  });
  await grantConsent(w.users.alice, {
    firm: w.firms.A,
    client: w.clients.A1,
  });
});

after(async () => { await endPool(); });

test("x31.a a real EZSEC-shaped live evidence window admits end-to-end", async () => {
  const cp = await seedVendorCounterparty(w.firms.A, w.clients.A1, "X31-EZSEC");
  const windowInvoice = `EZSEC31-${randomUUID().slice(0, 8)}`;
  for (const [i, postingDate] of PASSING_DATES.entries()) {
    const doc = await seedBareDocument(w.firms.A, `x31-ezsec-${i}`);
    await seedF123Evidence(
      w.firms.A,
      doc.id,
      cp,
      windowInvoice,
      EZSEC_FRAGMENTS[i],
    );
    await seedApprovedEntry(w.firms.A, w.clients.A1, cp.id, doc, {
      postingDate,
    });
  }
  const proposed = await propose(w.users.bob, {
    client: w.clients.A1,
    counterparty: cp.id,
  });
  const binding = await sign(w.users.alice, {
    binding: proposed.binding_id,
  });
  assert.equal(binding.status, "live");

  const target = await seedFactFiling({
    cp,
    invoiceId: `${binding.f2_invoice_prefix}-TARGET`,
    vendorName: "ez\n易计\nezAccount\nX31 GENUINE NEW SUFFIX",
    vendorRegistration: null,
    bindingEvidence: true,
    ocrText: `${cp.name} (${cp.reg})`,
  });
  const lane = await codingLane(humanPersona(w.users.alice), {
    client: w.clients.A1,
    filing: target.filingId,
  });
  assert.equal(lane.lane, "ready", `bound target must be ready: ${JSON.stringify(lane)}`);
  assert.ok(lane.reasons.includes("vendor_bound"), "the live binding supplies the vendor");
  assert.ok(!lane.reasons.includes("near_duplicate"), "the target is not a duplicate");

  const admitted = await requestAutodraft(w.users.bob, {
    filing: target.filingId,
  });
  assert.equal(admitted.outcome, "admitted", JSON.stringify(admitted));
  assert.ok(admitted.task_id);
  assert.equal(await liveTasks(target.filingId), 1);
});

test("x31.b a genuinely duplicate same-invoice-id upload still flags near_duplicate", async () => {
  const invoiceId = `X31-DUP-${randomUUID().slice(0, 8)}`;
  const { second } = await seedApprovedPair("X31-DUPLICATE", {
    firstInvoiceId: invoiceId,
    secondInvoiceId: invoiceId,
  });
  const lane = await laneCore(second.filingId);
  assert.ok(
    lane.reasons.includes("near_duplicate"),
    `same invoice_id + same amount must flag: ${JSON.stringify(lane)}`,
  );
});

test("x31.c same amount plus an ABSENT current invoice_id still flags near_duplicate", async () => {
  const { second } = await seedApprovedPair("X31-ABSENT-ID", {
    firstInvoiceId: `X31-PRESENT-${randomUUID().slice(0, 8)}`,
    secondInvoiceId: null,
  });
  const lane = await laneCore(second.filingId);
  assert.ok(
    lane.reasons.includes("near_duplicate"),
    `an absent current invoice_id must fail conservatively: ${JSON.stringify(lane)}`,
  );
});

test("x31.d same amount and same invoice_id on different documents still flags", async () => {
  const invoiceId = `X31-SAME-${randomUUID().slice(0, 8)}`;
  const { first, second } = await seedApprovedPair("X31-SAME-ID", {
    firstInvoiceId: invoiceId,
    secondInvoiceId: invoiceId,
  });
  assert.notEqual(first.sha256, second.sha256);
  assert.equal(first.state.invoice_id, second.state.invoice_id);
  const lane = await laneCore(second.filingId);
  assert.ok(
    lane.reasons.includes("near_duplicate"),
    `same present invoice_id must keep the amount limb armed: ${JSON.stringify(lane)}`,
  );
});

test("x31.d2 same amount with distinct present invoice_ids on different documents suppresses near_duplicate", async () => {
  const { first, second } = await seedApprovedPair("X31-RECURRING", {
    firstInvoiceId: `X31-JAN-${randomUUID().slice(0, 8)}`,
    secondInvoiceId: `X31-FEB-${randomUUID().slice(0, 8)}`,
  });
  assert.notEqual(first.sha256, second.sha256);
  assert.notEqual(first.state.invoice_id, second.state.invoice_id);
  const lane = await laneCore(second.filingId);
  assert.ok(
    !lane.reasons.includes("near_duplicate"),
    `distinct bill numbers on different documents must suppress the amount limb: ${JSON.stringify(lane)}`,
  );
  assert.equal(lane.lane, "ready", JSON.stringify(lane));
});

test("x31.e coding_lane and request_autodraft agree before and after a blocker changes", async () => {
  const primed = await primeReadyFiling(w.users.alice, {
    client: w.clients.A1,
    amount: 125_000,
    vendorName: `X31 LANE ${randomUUID().slice(0, 8)} SDN BHD`,
    registration: `2026${randomUUID().replaceAll("-", "").slice(0, 8)}`,
  });
  assert.ok(primed.counterpartyId, "primeReadyFiling must resolve an existing vendor");

  const draft = await withActor({ transaction: true }, async (client) => {
    const inserted = await client.query(
      `insert into clara.journal_entries(
         firm_id,client_id,status,posting_date,memo,origin,document_id,
         filing_id,source_doc_sha256,maker_actor
       ) values (
         $1,$2,'draft','2026-03-15','x31 open-draft blocker','agent',
         $3,$4,$5,$6
       ) returning id`,
      [
        w.firms.A,
        w.clients.A1,
        primed.documentId,
        primed.filingId,
        primed.sha256,
        w.users.alice,
      ],
    );
    const entry = inserted.rows[0].id;
    await client.query(
      `insert into clara.journal_lines(
         entry_id,line_no,account_code,debit_cents,credit_cents,
         description,counterparty_id
       ) values
         ($1,1,$2,125000,0,'blocker expense',$4),
         ($1,2,$3,0,125000,'blocker payable',$4)`,
      [entry, EXP, AP, primed.counterpartyId],
    );
    return entry;
  });

  const blockedLane = await codingLane(humanPersona(w.users.bob), {
    client: w.clients.A1,
    filing: primed.filingId,
  });
  const refused = await requestAutodraft(w.users.bob, {
    filing: primed.filingId,
  });
  assert.notEqual(blockedLane.lane, "ready");
  assert.ok(blockedLane.reasons.includes("open_draft"));
  assert.equal(refused.outcome, "lane_changed");
  assert.equal(refused.lane, blockedLane.lane);
  assert.deepEqual(refused.reasons, blockedLane.reasons);

  const receiptCount = (await rootQuery(
    `select count(*)::int as n
     from clara.op_receipts
     where fn='admit_autodraft_task'
       and op_key='autodraft:'||$1::text||':one_click'`,
    [primed.filingId],
  )).rows[0].n;
  assert.equal(receiptCount, 0, "a lane refusal must not reserve or settle an op receipt");

  await withActor({ transaction: true }, async (client) => {
    await client.query(
      `update clara.journal_entries
       set status='withdrawn',
           withdrawn_by=$2,
           withdrawn_at=now(),
           withdrawal_reason='x31 blocker resolved'
       where id=$1`,
      [draft, w.users.alice],
    );
  });

  const readyLane = await codingLane(humanPersona(w.users.bob), {
    client: w.clients.A1,
    filing: primed.filingId,
  });
  assert.equal(readyLane.lane, "ready", JSON.stringify(readyLane));
  const admitted = await requestAutodraft(w.users.bob, {
    filing: primed.filingId,
  });
  assert.equal(admitted.outcome, "admitted", JSON.stringify(admitted));
  assert.ok(admitted.task_id);

  // O-round confirmation finding 3: the refusal side already asserts op_receipts
  // stays at zero rows; the admitted side must be checked just as directly -- a
  // regression that returned the right JSON shape without actually calling
  // _finish_op would leave this receipt permanently PENDING (result IS NULL),
  // an orphaned-receipt defect this repo has hit and fixed before.
  const admittedReceipt = await rootQuery(
    `select result from clara.op_receipts
     where fn='admit_autodraft_task'
       and op_key='autodraft:'||$1::text||':one_click'`,
    [primed.filingId],
  );
  assert.equal(admittedReceipt.rows.length, 1, "the admitted call must settle exactly one receipt");
  assert.ok(admittedReceipt.rows[0].result !== null, "the admitted receipt must be SETTLED, not left pending");
  assert.equal(admittedReceipt.rows[0].result.outcome, "admitted");
  assert.equal(admittedReceipt.rows[0].result.task_id, admitted.task_id);

  const replayLane = await codingLane(humanPersona(w.users.bob), {
    client: w.clients.A1,
    filing: primed.filingId,
  });
  assert.equal(replayLane.lane, "ready", JSON.stringify(replayLane));
  const replay = await requestAutodraft(w.users.bob, {
    filing: primed.filingId,
  });
  assert.equal(replay.outcome, "noop_existing", JSON.stringify(replay));
  assert.equal(replay.task_id, admitted.task_id);
  assert.equal(await liveTasks(primed.filingId), 1);
});

// O-round confirmation finding 5: three coverage gaps, all closed here rather than
// deferred -- the reviewer confirmed the invoice_date limb's OR structure is untouched
// by SOURCE reading alone; these cells prove it BEHAVIORALLY too.

test("x31.f the SAME physical document, re-extracted with a drifted invoice_id under a second filing, still flags near_duplicate", async () => {
  const cp = await seedVendorCounterparty(w.firms.A, w.clients.A1, "X31-SAMESHA");
  const first = await seedFactFiling({
    cp,
    invoiceId: `X31-SHA-FIRST-${randomUUID().slice(0, 8)}`,
  });
  await seedApprovedFactEntry(first, cp, {});

  // A genuine re-extraction of the SAME bytes, not a different bill. Document
  // identity (sha256) is immutable (CLR08), and clara.documents enforces
  // UNIQUE(firm_id, sha256) -- two DIFFERENT documents can never share one hash
  // within a firm, so "two candidates sharing sha256" can only be the SAME document
  // row. A document may carry only one ACTIVE filing at a time
  // (uq_document_filing_active is a partial index WHERE retired_at IS NULL), so the
  // realistic construction is: retire the first filing (the document has already
  // been approved through it), then re-file the SAME document -- a real shape (a
  // document re-associated after its original filing closes out) -- and give the
  // new filing a NEWER invoice_facts extraction carrying a DIFFERENT invoice_id,
  // exactly as a drifted OCR re-read would.
  const maker = (await rootQuery(
    "select user_id from clara.firm_memberships where firm_id=$1 and status='active' limit 1",
    [w.firms.A],
  )).rows[0].user_id;
  await rootQuery(
    `update clara.document_filings
     set retired_at=now(), retired_by=$2, retirement_reason='x31 re-file for a same-document drift cell'
     where id=$1`,
    [first.filingId, maker],
  );
  const resolution = (await rootQuery(
    `insert into clara.client_resolutions(firm_id,client_id,subject_kind,subject_id,confidence,method,evidence,resolved_by)
     values($1,$2,'document',$3,1.0,'human','{}'::jsonb,$4) returning id`,
    [w.firms.A, w.clients.A1, first.documentId, maker],
  )).rows[0].id;
  const secondFiling = (await rootQuery(
    `insert into clara.document_filings(firm_id,document_id,client_id,filed_by,basis,resolution_id)
     values($1,$2,$3,$4,'seed-0007',$5) returning id`,
    [w.firms.A, first.documentId, w.clients.A1, maker, resolution],
  )).rows[0].id;
  const driftedInvoiceId = `X31-SHA-SECOND-${randomUUID().slice(0, 8)}`;
  await addLatestFacts(first.documentId, {
    amount: AMOUNT,
    invoiceId: driftedInvoiceId,
    vendorName: cp.name,
    vendorRegistration: cp.reg,
  });
  assert.notEqual(first.state.invoice_id, driftedInvoiceId);

  const lane = await laneCore(secondFiling);
  assert.ok(
    lane.reasons.includes("near_duplicate"),
    `the same physical document must still flag despite a drifted invoice_id read: ${JSON.stringify(lane)}`,
  );
});

test("x31.g an absent invoice_id on the CANDIDATE (prior) side still flags near_duplicate", async () => {
  const { second } = await seedApprovedPair("X31-CAND-ABSENT", {
    firstInvoiceId: null,
    secondInvoiceId: `X31-PRESENT-${randomUUID().slice(0, 8)}`,
  });
  const lane = await laneCore(second.filingId);
  assert.ok(
    lane.reasons.includes("near_duplicate"),
    `an absent CANDIDATE-side invoice_id must fail conservatively too, not only an absent current-side one: ${JSON.stringify(lane)}`,
  );
});

test("x31.h a shared invoice_date still flags near_duplicate even when distinct invoice_ids would suppress the amount limb", async () => {
  const sharedDate = "2026-02-14";
  const cp = await seedVendorCounterparty(w.firms.A, w.clients.A1, "X31-DATE-OVERRIDE");
  const first = await seedFactFiling({
    cp,
    invoiceId: `X31-DATE-FIRST-${randomUUID().slice(0, 8)}`,
    invoiceDate: sharedDate,
  });
  await seedApprovedFactEntry(first, cp, {});
  const second = await seedFactFiling({
    cp,
    invoiceId: `X31-DATE-SECOND-${randomUUID().slice(0, 8)}`,
    invoiceDate: sharedDate,
  });
  assert.notEqual(first.state.invoice_id, second.state.invoice_id);
  const lane = await laneCore(second.filingId);
  assert.ok(
    lane.reasons.includes("near_duplicate"),
    `the invoice_date limb is a completely independent OR-branch and must still flag: ${JSON.stringify(lane)}`,
  );
});
