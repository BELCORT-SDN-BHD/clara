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
import { requestReextraction } from "./x1-helpers.mjs";
import {
  AP,
  EXP,
  FIELD,
  agreedEnvelope,
  buildWorld,
  claimTask,
  codingLane,
  endPool,
  enqueueInvoiceFacts,
  factField,
  grantConsent,
  humanPersona,
  invoiceFactsTask,
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

/** Push a NEWER invoice_facts extraction onto an EXISTING (already-extracted)
 *  document via the real re-extraction verb (request_reextraction -> claim ->
 *  persist) -- a bare second enqueue_invoice_facts is a no-op once a task already
 *  exists for (document, lane), so the purpose-built re-extraction path (ADR-047 Q2)
 *  is reused rather than hand-built, exactly as a genuine re-read would, so the new
 *  extraction satisfies clara._invoice_fact_state's own corroboration requirements
 *  identically to seedFactFiling's first pass. */
async function addLatestFacts(documentId, { amount, invoiceId, vendorName, vendorRegistration }) {
  await requestReextraction(w.users.alice, { document: documentId });
  const task = await invoiceFactsTask(documentId);
  await claimTask(task.id, { egressApproved: true });
  await persistInvoiceFacts(task.id, [
    factField(FIELD.total, money(amount)),
    factField(FIELD.currency, "MYR"),
    factField(FIELD.vendorName, vendorName),
    factField(FIELD.invoiceId, invoiceId),
    // Without a registration region, the re-extraction resolves the vendor via a
    // NAME-ONLY lookup, which is `registered_name_ambiguous` (-> vendor_ambiguous,
    // AB-16) against an already-registered counterparty -- unrelated to what this
    // cell is proving, so the registration must be carried forward identically.
    ...(vendorRegistration !== undefined
      ? [factField("invoice.vendor_registration", vendorRegistration)]
      : []),
    ...statedIdentityFields(amount),
  ], { envelope: agreedEnvelope() });
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
  await enqueueInvoiceFacts(cited.documentId);
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
