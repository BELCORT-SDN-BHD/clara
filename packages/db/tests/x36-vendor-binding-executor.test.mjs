// Migration 0029 — vendor-binding Slot C executor control (task #36).
//
// This focused rig proves the three load-bearing outcomes against real database
// bodies: a binding-backed draft posts and records phase=post/bound; current F1
// drift writes phase=post/refused + binding_features_changed and does not call
// the approve transition; revocation under the binding row lock writes
// phase=post/refused + binding_revoked and leaves the draft untouched.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  AP, EXP, FIELD, agreedEnvelope, buildWorld, claimTask,
  endPool, factField, factsRegion, freshResolution,
  grantConsent, humanQuery, invoiceFactsTask, mintLegacyInvoiceFactsTask, namedCall, opk,
  persistInvoiceFacts, rootQuery, seedCitedDocument, statedIdentityFields,
  upsertAccountClassed, upsertPayableAccount, withActor, withSessionAuth,
} from "./wave-a-fixtures.mjs";
import {
  FULL_ABSENT_RECEIPT, has29, seedApprovedEntry, seedBareDocument, seedF123Evidence,
  seedPayableAccount, seedVendorCounterparty,
} from "./x36-vendor-binding-helpers.mjs";

let ready = false;
let w = null;
let cp = null;
let binding = null;
let pageVendor = null;
let invoicePrefix = null;

async function propose(sub, client, counterparty) {
  const sql = namedCall("propose_vendor_identity_binding", [
    { name: "p_proposal", cast: "jsonb" },
    { name: "p_op_key" },
  ]);
  const r = await humanQuery(sub, sql, [
    JSON.stringify({ client_id: client, counterparty_id: counterparty }),
    opk("x29-propose"),
  ]);
  return r.rows[0].result;
}

async function sign(sub, bindingId) {
  const sql = namedCall("sign_vendor_identity_binding", [
    { name: "p_binding" },
    { name: "p_op_key" },
  ]);
  const r = await humanQuery(sub, sql, [bindingId, opk("x29-sign")]);
  return r.rows[0].result;
}

async function revoke(sub, bindingId) {
  const sql = namedCall("revoke_vendor_identity_binding", [
    { name: "p_binding" },
    { name: "p_reason" },
    { name: "p_op_key" },
  ]);
  const r = await humanQuery(sub, sql, [
    bindingId, "0029 revocation-race rig", opk("x29-revoke"),
  ]);
  return r.rows[0].result;
}

async function post(entry, opKey = null) {
  return withSessionAuth("clara_runtime_login", async (client) => {
    const r = await client.query(
      "select clara.execute_rule_post($1,$2) as result",
      [entry, opKey ?? `rulepost:${entry}:${randomUUID().slice(0, 8)}`],
    );
    return r.rows[0].result;
  });
}

async function seedBindingWindow() {
  const firm = w.firms.A;
  const client = w.clients.A1;
  cp = await seedVendorCounterparty(firm, client, "X29");
  pageVendor = `AAA BILLING DESK ${randomUUID().slice(0, 8)}`;
  const base = `EZBIND${randomUUID().slice(0, 6)}-`;
  const dates = ["2025-08-25", "2025-08-29", "2025-10-13"];
  for (const [i, postingDate] of dates.entries()) {
    const doc = await seedBareDocument(firm, `x29-window-${i}`);
    await seedF123Evidence(firm, doc.id, cp, `${base}${i}`);
    const facts = (await rootQuery(
      `select id from clara.document_extractions
       where document_id=$1 and engine_kind='invoice_facts'
       order by version_n desc,id desc limit 1`,
      [doc.id],
    )).rows[0].id;
    // The as-built derivation selects min(vendor_name). "AAA..." is therefore
    // the stable typed F1 while F3 continues to bind identity through cp.reg.
    await rootQuery(
      `insert into clara.document_regions(
         firm_id,extraction_id,locator_kind,locator,field_path,
         text_content,engine_confidence
       ) values (
         $1,$2,'page_polygon','{"page":1,"polygon":[0,0,1,1]}'::jsonb,
         'invoice.vendor_name',$3,1.0
       )`,
      [firm, facts, pageVendor],
    );
    await seedApprovedEntry(firm, client, cp.id, doc, { postingDate });
  }
  const proposed = await propose(w.users.bob, client, cp.id);
  const signed = await sign(w.users.alice, proposed.binding_id);
  binding = signed.binding_id;
  invoicePrefix = signed.f2_invoice_prefix;
  assert.equal(signed.status, "live");
}

async function seedAutopostRule() {
  const actor = (await rootQuery(
    `select user_id from clara.firm_memberships
     where firm_id=$1 and status='active' order by created_at limit 1`,
    [w.firms.A],
  )).rows[0].user_id;
  const r = await rootQuery(
    `insert into clara.coding_rules(
       firm_id,client_id,rule_type,counterparty_id,account_code,status,
       pinned,origin,content_hash,created_by,signed_by,signed_at,
       amount_cap_cents,frequency_window,window_max_posts,expires_at,direction
     ) values (
       $1,$2,'autopost',$3,$4,'live',false,'authored',$5,$6,$6,now(),
       200000,'monthly',3,now()+interval '6 months','purchase'
     ) returning id`,
    [
      w.firms.A, w.clients.A1, cp.id, EXP,
      randomUUID().replaceAll("-", "").padEnd(64, "0").slice(0, 64),
      actor,
    ],
  );
  return r.rows[0].id;
}

async function seedBoundDraft(tag) {
  const amount = 50000;
  const cited = await seedCitedDocument(w.users.alice, {
    firm: w.firms.A,
    client: w.clients.A1,
    quote: "RM 500.00",
    kind: "invoice",
  });
  await grantConsent(w.users.alice, {
    firm: w.firms.A, client: w.clients.A1,
  }).catch(() => {});
  // F-A1 PR-3 CUTOVER: the router's invoice-kind arm now mints llm_witness, never
  // invoice_facts (no dual-run, D9) -- this fixture only needs a task ON the
  // invoice_facts lane to exercise ITS downstream machinery, so it mints directly.
  await mintLegacyInvoiceFactsTask(cited.documentId);
  const task = await invoiceFactsTask(cited.documentId);
  await claimTask(task.id, { egressApproved: true });
  const invoiceId = `${invoicePrefix}${tag}`;
  await persistInvoiceFacts(task.id, [
    factField(FIELD.total, "RM 500.00"),
    factField(FIELD.currency, "MYR"),
    factField(FIELD.vendorName, pageVendor),
    factField(FIELD.invoiceId, invoiceId),
    ...statedIdentityFields(amount),
  ], {
    envelope: agreedEnvelope({
      extra: {
        // Real X6 receipt shape (P-round Finding C) -- a partial synthetic shape was
        // itself the production defect the fix closed; use the real vocabulary here.
        vendor_identity: FULL_ABSENT_RECEIPT,
      },
    }),
  });

  // Add a later immutable OCR extraction with the exact page envelope and
  // page_number locator _binding_f3_holds consumes.
  const ocrVersion = (await rootQuery(
    `select max(version_n)::int as version_n
     from clara.document_extractions
     where document_id=$1 and engine_kind='ocr'`,
    [cited.documentId],
  )).rows[0].version_n;
  const ocrExtraction = randomUUID();
  await rootQuery(
    `insert into clara.document_extractions(
       id,firm_id,document_id,engine_id,engine_kind,version_n,status,
       page_count,envelope
     ) values (
       $1,$2,$3,'x29-ocr:v1','ocr',$4,'done',1,
       '{"pages":[{"page_number":1,"height":11}]}'::jsonb
     )`,
    [
      ocrExtraction, w.firms.A, cited.documentId,
      (ocrVersion ?? 0) + 1,
    ],
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
      ocrExtraction,
      JSON.stringify({
        page_number: 1,
        polygon: [1, 0.5, 2, 0.5, 2, 0.9, 1, 0.9],
      }),
      `${cp.name} (${cp.reg})`,
    ],
  );

  const total = await factsRegion(cited.documentId, FIELD.total);
  const resolutionId = await freshResolution(w.users.alice, w.clients.A1, {
    subjectKind: "document", subjectId: cited.documentId,
  });
  const actor = (await rootQuery(
    `select user_id from clara.firm_memberships
     where firm_id=$1 and status='active' order by created_at limit 1`,
    [w.firms.A],
  )).rows[0].user_id;
  const fingerprint = (await rootQuery(
    `select clara._resolve_counterparty(
       $1,jsonb_build_object('existing_id',$2::uuid,'kind','vendor')
     ) as fp`,
    [w.clients.A1, cp.id],
  )).rows[0].fp;

  // KNOWN GAP (O-round finding 7, not yet closed): this fixture stages the
  // already-stamped Slot-B postcondition directly rather than driving a real
  // draft through _draft_entry_core, so this file proves Slot C in isolation but
  // never exercises Slot A/B's OWN admission path end-to-end (that coverage lives
  // in x36-vendor-binding-resolver.test.mjs at the _resolve_vendor_binding layer,
  // and in the P-round regression suite at the _coding_lane_core/_draft_entry_core
  // caller layer for the NEW two-level fix specifically -- but no single test
  // drives propose->sign->real-wake-draft->Slot-C-post end to end). The min(uuid)
  // bug this comment used to cite is fixed (task #36 follow-up); the isolation
  // choice itself remains deliberate, scoping this file to Slot C alone.
  const draft = await withActor({ transaction: true }, async (client) => {
    const inserted = await client.query(
      `insert into clara.journal_entries(
         firm_id,client_id,status,posting_date,memo,origin,document_id,
         source_doc_sha256,resolution_id,maker_actor,filing_id,
         proposed_counterparty,match_fingerprint,coding_kind,vendor_binding_id
       ) values (
         $1,$2,'draft','2026-03-15','0029 Slot C rig','agent',$3,
         $4,$5,$6,$7,jsonb_build_object('existing_id',$8::uuid,'kind','vendor'),
         $9::jsonb,'supplier_bill',$10
       ) returning id,revision_token`,
      [
        w.firms.A, w.clients.A1, cited.documentId, cited.sha256,
        resolutionId, actor, cited.filingId, cp.id,
        JSON.stringify(fingerprint), binding,
      ],
    );
    const entry = inserted.rows[0];
    await client.query(
      `insert into clara.journal_lines(
         entry_id,line_no,account_code,debit_cents,credit_cents,
         description,counterparty_id
       ) values
         ($1,1,$2,$4,0,'expense',$5),
         ($1,2,$3,0,$4,'payable',$5)`,
      [entry.id, EXP, AP, amount, cp.id],
    );
    await client.query(
      `insert into clara.entry_evidence(
         entry_id,firm_id,client_id,document_id,extraction_id,region_id,
         field_path,quote,fact_hash,provenance_tier
       )
       select $1,$2,$3,$4,dr.extraction_id,dr.id,dr.field_path,
         dr.text_content,
         clara._fact_hash(
           dr.extraction_id,dr.id,dr.field_path,
           dr.text_content,dr.monetary_cents
         ),
         'verified'
       from clara.document_regions dr
       where dr.id=$5`,
      [
        entry.id, w.firms.A, w.clients.A1, cited.documentId,
        total.id,
      ],
    );
    await client.query(
      `insert into clara.vendor_binding_resolutions(
         binding_id,firm_id,client_id,document_id,entry_id,phase,
         facts_extraction_id,ocr_extraction_id,entry_revision_token,
         raw_proposal,outcome
       ) values (
         $1,$2,$3,$4,$5,'draft',
         (select id from clara.document_extractions
          where document_id=$4 and engine_kind='invoice_facts' and status='done'
          order by version_n desc,id desc limit 1),
         (select id from clara.document_extractions
          where document_id=$4 and engine_kind='ocr' and status='done'
          order by version_n desc,id desc limit 1),
         $6,'{}'::jsonb,'bound'
       )`,
      [
        binding, w.firms.A, w.clients.A1, cited.documentId,
        entry.id, entry.revision_token,
      ],
    );
    return { entry_id: entry.id, revision_token: entry.revision_token };
  });
  return { ...draft, cited, invoiceId };
}

async function resolution(entry) {
  const r = await rootQuery(
    `select phase,outcome,refusal_reason,compared_to_resolution_id
     from clara.vendor_binding_resolutions
     where entry_id=$1 and phase='post'
     order by created_at desc,id desc limit 1`,
    [entry],
  );
  return r.rows[0] ?? null;
}

before(async () => {
  ready = await has29();
  if (!ready) return;
  w = await buildWorld();
  await seedPayableAccount(w.firms.A, w.clients.A1);
  await upsertPayableAccount(w.users.alice, {
    client: w.clients.A1, code: AP, name: "Trade Creditors",
    opKey: opk("x29-ap"),
  });
  await upsertAccountClassed(w.users.alice, {
    client: w.clients.A1, code: EXP, name: "Professional Fees",
    type: "expense", opKey: opk("x29-exp"),
  });
  await seedBindingWindow();
  await seedAutopostRule();
});

after(async () => { await endPool(); });

function requireReady(t) {
  if (ready) return false;
  t.skip("0029_vendor_binding_executor is not applied");
  return true;
}

test("x36e.1 binding-backed post writes phase=post/bound before approval", async (t) => {
  if (requireReady(t)) return;
  const draft = await seedBoundDraft("900");
  const result = await post(draft.entry_id);
  assert.equal(result.status, "posted");
  const row = (await rootQuery(
    "select status from clara.journal_entries where id=$1",
    [draft.entry_id],
  )).rows[0];
  assert.equal(row.status, "approved");
  const postResolution = await resolution(draft.entry_id);
  assert.equal(postResolution.phase, "post");
  assert.equal(postResolution.outcome, "bound");
  assert.equal(postResolution.refusal_reason, null);
  assert.ok(postResolution.compared_to_resolution_id,
    "post resolution points to the draft resolution");
});

test("x36e.2 current F1 drift writes refused resolution and never approves", async (t) => {
  if (requireReady(t)) return;
  const draft = await seedBoundDraft("901");
  const current = (await rootQuery(
    `select max(version_n)::int as version_n
     from clara.document_extractions
     where document_id=$1 and engine_kind='invoice_facts'`,
    [draft.cited.documentId],
  )).rows[0].version_n;
  const extraction = randomUUID();
  await rootQuery(
    `insert into clara.document_extractions(
       id,firm_id,document_id,engine_id,engine_kind,version_n,status,page_count,
       envelope
     ) values (
       $1,$2,$3,'x29-drift:v1','invoice_facts',$4,'done',1,$5::jsonb
     )`,
    [
      extraction, w.firms.A, draft.cited.documentId, current + 1,
      JSON.stringify({
        // Real X6 receipt shape (P-round Finding C) -- a partial synthetic shape was
        // itself the production defect the fix closed; use the real vocabulary here.
        vendor_identity: FULL_ABSENT_RECEIPT,
      }),
    ],
  );
  await rootQuery(
    `insert into clara.document_regions(
       firm_id,extraction_id,locator_kind,locator,field_path,
       text_content,engine_confidence
     ) values
       ($1,$2,'page_polygon','{"page":1,"polygon":[0,0,1,1]}'::jsonb,
        'invoice.vendor_name','DRIFTED BILLING DESK',1.0),
       ($1,$2,'page_polygon','{"page":1,"polygon":[0,0,1,1]}'::jsonb,
        'invoice.invoice_id',$3,1.0)`,
    [w.firms.A, extraction, draft.invoiceId],
  );
  const result = await post(draft.entry_id);
  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "binding_features_changed");
  assert.equal((await resolution(draft.entry_id)).outcome, "refused");
  assert.equal(
    (await resolution(draft.entry_id)).refusal_reason,
    "binding_features_changed",
  );
  const status = (await rootQuery(
    "select status from clara.journal_entries where id=$1",
    [draft.entry_id],
  )).rows[0].status;
  assert.equal(status, "draft");
});

test("x36e.3 revoked binding writes refused resolution and leaves draft untouched", async (t) => {
  if (requireReady(t)) return;
  const draft = await seedBoundDraft("902");
  const revoked = await revoke(w.users.bob, binding);
  assert.equal(revoked.status, "revoked");
  const result = await post(draft.entry_id);
  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "binding_revoked");
  assert.equal((await resolution(draft.entry_id)).outcome, "refused");
  assert.equal((await resolution(draft.entry_id)).refusal_reason, "binding_revoked");
  const status = (await rootQuery(
    "select status from clara.journal_entries where id=$1",
    [draft.entry_id],
  )).rows[0].status;
  assert.equal(status, "draft");
});
