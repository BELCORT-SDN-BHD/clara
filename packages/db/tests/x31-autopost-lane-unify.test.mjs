// Migration 0031 -- admission/lane agreement and the recurring-fee duplicate ruling.
//
//   x31.a  a real EZSEC-shaped live binding reaches READY and one-click admission.
//   x31.b  a genuine same-invoice-id duplicate still flags near_duplicate.
//   x31.c  an absent current invoice_id stays fail-conservative.
//   x31.d  different documents with the same invoice_id still flag.
//   x31.d2 different documents with distinct present invoice_ids suppress the amount limb.
//   x31.e  a refusal is not cached; resolving the blocker admits, then replays idempotently.
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
