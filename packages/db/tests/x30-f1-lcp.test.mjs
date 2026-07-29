// Migration 0030 — F1 longest-common-prefix derivation and matching.
//
//   x30.1 the real EZSEC three-fragment window proposes the exact normalized
//     LCP and signs live.
//   x30.2a a future document outside that prefix is unresolved at Slot A.
//   x30.2b a post-time current fragment outside that prefix is refused without
//     approving the draft.
//   x30.3 a degenerate "in" LCP refuses with features_unstable / CLR36.
//   x30.4 the original three-identical-fragment window still derives the full
//     normalized vendor name (LCP(a,a,a) = a).
//
// Serial discipline: --test-concurrency=1 (shared rig convention).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  AP, EXP, FIELD, agreedEnvelope, buildWorld, claimTask,
  enqueueInvoiceFacts, endPool, factField, factsRegion, freshResolution,
  grantConsent, invoiceFactsTask, opk, persistInvoiceFacts, rootQuery,
  seedCitedDocument, statedIdentityFields, upsertAccountClassed,
  upsertPayableAccount, withActor, withSessionAuth,
} from "./wave-a-fixtures.mjs";
import {
  FULL_ABSENT_RECEIPT, has28, has29, propose, seedApprovedEntry,
  seedBareDocument, seedF123Evidence, seedPassingWindow,
  seedPayableAccount, seedVendorCounterparty, sign,
} from "./x36-vendor-binding-helpers.mjs";

const EZSEC_FRAGMENTS = [
  "ez\n易计\nezAccount\nCOUNT",
  "ez\n易计\nezAccount",
  "ez\n易计\nezAccount\nCOUNT YOUR VICTORY",
];
const EZSEC_LCP = "ez 易计 ezaccount";
const PASSING_DATES = ["2025-08-25", "2025-08-29", "2025-10-13"];

let ready = false;
let w = null;
let ezCp = null;
let ezBinding = null;

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

async function post(entry, opKey = null) {
  return withSessionAuth("clara_runtime_login", async (client) => {
    const r = await client.query(
      "select clara.execute_rule_post($1,$2) as result",
      [entry, opKey ?? `rulepost:${entry}:${randomUUID().slice(0, 8)}`],
    );
    return r.rows[0].result;
  });
}

async function seedWindow(tag, vendorNameTexts) {
  const cp = await seedVendorCounterparty(w.firms.A, w.clients.A1, tag);
  const invoiceId = `EZSEC30-${randomUUID().slice(0, 8)}`;
  for (const [i, postingDate] of PASSING_DATES.entries()) {
    const doc = await seedBareDocument(w.firms.A, `${tag}-${i}-${postingDate}`);
    await seedF123Evidence(
      w.firms.A,
      doc.id,
      cp,
      invoiceId,
      vendorNameTexts[i],
    );
    await seedApprovedEntry(w.firms.A, w.clients.A1, cp.id, doc, {
      postingDate,
    });
  }
  return { cp, invoiceId };
}

async function resolve(client, document, pageCandidate = null) {
  const r = await rootQuery(
    "select clara._resolve_vendor_binding($1,$2,$3) as r",
    [client, document, pageCandidate],
  );
  return r.rows[0].r;
}

async function seedAutopostRule(cp) {
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
      w.firms.A,
      w.clients.A1,
      cp.id,
      EXP,
      randomUUID().replaceAll("-", "").padEnd(64, "0").slice(0, 64),
      actor,
    ],
  );
  return r.rows[0].id;
}

async function seedBoundDraft(cp, binding, vendorNameText, tag) {
  const amount = 50000;
  const cited = await seedCitedDocument(w.users.alice, {
    firm: w.firms.A,
    client: w.clients.A1,
    quote: "RM 500.00",
    kind: "invoice",
  });
  await grantConsent(w.users.alice, {
    firm: w.firms.A,
    client: w.clients.A1,
  }).catch(() => {});
  await enqueueInvoiceFacts(cited.documentId);
  const task = await invoiceFactsTask(cited.documentId);
  await claimTask(task.id, { egressApproved: true });
  const invoiceId = `${binding.f2_invoice_prefix}-${tag}`;
  await persistInvoiceFacts(task.id, [
    factField(FIELD.total, "RM 500.00"),
    factField(FIELD.currency, "MYR"),
    factField(FIELD.vendorName, vendorNameText),
    factField(FIELD.invoiceId, invoiceId),
    ...statedIdentityFields(amount),
  ], {
    envelope: agreedEnvelope({
      extra: { vendor_identity: FULL_ABSENT_RECEIPT },
    }),
  });

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
       $1,$2,$3,'x30-ocr:v1','ocr',$4,'done',1,
       '{"pages":[{"page_number":1,"height":11}]}'::jsonb
     )`,
    [
      ocrExtraction,
      w.firms.A,
      cited.documentId,
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
    subjectKind: "document",
    subjectId: cited.documentId,
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

  const draft = await withActor({ transaction: true }, async (client) => {
    const inserted = await client.query(
      `insert into clara.journal_entries(
         firm_id,client_id,status,posting_date,memo,origin,document_id,
         source_doc_sha256,resolution_id,maker_actor,filing_id,
         proposed_counterparty,match_fingerprint,coding_kind,vendor_binding_id
       ) values (
         $1,$2,'draft','2026-03-15','0030 F1 LCP rig','agent',$3,
         $4,$5,$6,$7,jsonb_build_object('existing_id',$8::uuid,'kind','vendor'),
         $9::jsonb,'supplier_bill',$10
       ) returning id,revision_token`,
      [
        w.firms.A,
        w.clients.A1,
        cited.documentId,
        cited.sha256,
        resolutionId,
        actor,
        cited.filingId,
        cp.id,
        JSON.stringify(fingerprint),
        binding.binding_id,
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
        entry.id,
        w.firms.A,
        w.clients.A1,
        cited.documentId,
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
        binding.binding_id,
        w.firms.A,
        w.clients.A1,
        cited.documentId,
        entry.id,
        entry.revision_token,
      ],
    );
    return { entry_id: entry.id, revision_token: entry.revision_token };
  });
  return { ...draft, cited, invoiceId };
}

async function restateVendorName(draft, vendorNameText) {
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
       $1,$2,$3,'x30-drift:v1','invoice_facts',$4,'done',1,$5::jsonb
     )`,
    [
      extraction,
      w.firms.A,
      draft.cited.documentId,
      current + 1,
      JSON.stringify({ vendor_identity: FULL_ABSENT_RECEIPT }),
    ],
  );
  await rootQuery(
    `insert into clara.document_regions(
       firm_id,extraction_id,locator_kind,locator,field_path,
       text_content,engine_confidence
     ) values
       ($1,$2,'page_polygon','{"page":1,"polygon":[0,0,1,1]}'::jsonb,
        'invoice.vendor_name',$3,1.0),
       ($1,$2,'page_polygon','{"page":1,"polygon":[0,0,1,1]}'::jsonb,
        'invoice.invoice_id',$4,1.0)`,
    [
      w.firms.A,
      extraction,
      vendorNameText,
      draft.invoiceId,
    ],
  );
}

async function postResolution(entry) {
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
  ready = await has28() && await has29() && await has30();
  if (!ready) return;
  w = await buildWorld();
  await seedPayableAccount(w.firms.A, w.clients.A1);
  await upsertPayableAccount(w.users.alice, {
    client: w.clients.A1,
    code: AP,
    name: "Trade Creditors",
    opKey: opk("x30-ap"),
  });
  await upsertAccountClassed(w.users.alice, {
    client: w.clients.A1,
    code: EXP,
    name: "Professional Fees",
    type: "expense",
    opKey: opk("x30-exp"),
  });
});

after(async () => { await endPool(); });

function requireReady(t) {
  if (ready) return false;
  t.skip("0030_vendor_binding_f1_lcp (or its 0028/0029 chain) is not applied");
  return true;
}

test("x30.1 real EZSEC window derives the exact LCP, proposes, and signs live", async (t) => {
  if (requireReady(t)) return;
  const seeded = await seedWindow("X30-EZSEC", EZSEC_FRAGMENTS);
  const proposed = await propose(w.users.bob, {
    client: w.clients.A1,
    counterparty: seeded.cp.id,
  });
  assert.equal(proposed.f1_vendor_name_norm, EZSEC_LCP);
  const signed = await sign(w.users.alice, {
    binding: proposed.binding_id,
  });
  assert.equal(signed.status, "live");
  assert.equal(signed.f1_vendor_name_norm, EZSEC_LCP);
  ezCp = seeded.cp;
  ezBinding = signed;
});

test("x30.2a a non-prefix current fragment is unresolved at Slot A", async (t) => {
  if (requireReady(t)) return;
  assert.ok(ezCp && ezBinding, "x30.1 must establish the live EZSEC binding");
  const doc = await seedBareDocument(w.firms.A, "x30-slot-a-non-prefix");
  await seedF123Evidence(
    w.firms.A,
    doc.id,
    ezCp,
    `${ezBinding.f2_invoice_prefix}-SLOTA`,
    "WHOLLY DIFFERENT BILLING DESK",
  );
  const result = await resolve(w.clients.A1, doc.id, ezCp.id);
  assert.equal(
    result.outcome,
    "unresolved",
    `a document outside stored F1 must not resolve: ${JSON.stringify(result)}`,
  );
});

test("x30.2b a non-prefix post-time fragment refuses and never approves", async (t) => {
  if (requireReady(t)) return;
  assert.ok(ezCp && ezBinding, "x30.1 must establish the live EZSEC binding");
  await seedAutopostRule(ezCp);
  const draft = await seedBoundDraft(
    ezCp,
    ezBinding,
    "ez\n易计\nezAccount\nCURRENT",
    "POST",
  );
  await restateVendorName(draft, "DRIFTED BILLING DESK");
  const result = await post(draft.entry_id);
  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "binding_features_changed");
  const resolution = await postResolution(draft.entry_id);
  assert.equal(resolution.phase, "post");
  assert.equal(resolution.outcome, "refused");
  assert.equal(resolution.refusal_reason, "binding_features_changed");
  const entryStatus = (await rootQuery(
    "select status from clara.journal_entries where id=$1",
    [draft.entry_id],
  )).rows[0].status;
  assert.equal(entryStatus, "draft");
});

test("x30.3 the degenerate exact LCP 'in' refuses features_unstable / CLR36", async (t) => {
  if (requireReady(t)) return;
  const { cp } = await seedWindow("X30-FLOOR", [
    "India Trading Co",
    "Inline Systems Sdn Bhd",
    "Ingot Resources",
  ]);
  let error = null;
  try {
    await propose(w.users.bob, {
      client: w.clients.A1,
      counterparty: cp.id,
    });
  } catch (e) {
    error = e;
  }
  assert.ok(error, "degenerate LCP proposal must raise");
  assert.equal(error.code, "CLR36");
  assert.match(error.message, /features_unstable/);
});

test("x30.4 identical fragments retain the full normalized F1", async (t) => {
  if (requireReady(t)) return;
  const cp = await seedPassingWindow(w, "X30-EQUAL");
  const expected = (await rootQuery(
    "select clara._binding_normalize($1) as norm",
    [cp.name],
  )).rows[0].norm;
  const proposed = await propose(w.users.bob, {
    client: w.clients.A1,
    counterparty: cp.id,
  });
  assert.equal(proposed.f1_vendor_name_norm, expected);
});
