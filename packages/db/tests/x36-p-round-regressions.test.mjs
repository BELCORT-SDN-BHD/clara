// Task #36 consolidated P-round regressions.
//
// New coverage only: existing x36-vendor-binding-*.test.mjs files deliberately
// remain untouched for their separately-owned signature/fixture rewrite.
//
//   P-B/C/E1: a production-shaped absent receipt admits; two F1+F3 bindings
//     with different F2 prefixes remain ambiguous, and _coding_lane_core
//     surfaces binding_ambiguous as a hard reason.
//   P-B/E2: the same collision at post time skips binding_ambiguous even though
//     the current invoice happens to match one candidate's F2.
//   P-E3: a real matched receipt plus vendor registration resolves to the
//     binding's own counterparty and posts through A.5 step 5.
//   P-D: force proposed->live between the executor's bulk rule lock and exact
//     lookup; the new rule is excluded for this pass and no deadlock occurs.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  AP, EXP, FIELD, agreedEnvelope, buildWorld, claimTask,
  enqueueInvoiceFacts, endPool, factField, factsRegion, freshResolution,
  grantConsent, invoiceFactsTask, persistInvoiceFacts, rootQuery,
  seedCitedDocument, statedIdentityFields, upsertAccountClassed,
  upsertPayableAccount, withActor, withSessionAuth,
} from "./wave-a-fixtures.mjs";
import {
  has29, propose, seedApprovedEntry, seedBareDocument, seedF123Evidence,
  seedPayableAccount, seedVendorCounterparty, sign,
} from "./x36-vendor-binding-helpers.mjs";
import { getPool } from "./rig-docs-fixtures.mjs";
import { waitBlockedBy } from "./rig-docs-race.mjs";

let ready = false;
let w = null;

const fullAbsentReceipt = () => ({
  matched: 0,
  absent: 1,
  ambiguous: 0,
  rejected_gate: 0,
  below_band: 0,
  height_missing: 0,
  unit_unresolved: 0,
  no_geometry: 0,
  label_continuation: 0,
  no_vendor_anchor: 0,
  vendor_anchor_far: 0,
  closer_to_customer: 0,
  typed_collapsed: 0,
  typed_disagreement: 0,
  typed_vs_ambiguous: 0,
  emitted: 0,
  candidates: [],
  outcome: "absent",
});

const fullMatchedReceipt = (registration) => ({
  matched: 1,
  absent: 0,
  ambiguous: 0,
  rejected_gate: 0,
  below_band: 0,
  height_missing: 0,
  unit_unresolved: 0,
  no_geometry: 0,
  label_continuation: 0,
  no_vendor_anchor: 0,
  vendor_anchor_far: 0,
  closer_to_customer: 0,
  typed_collapsed: 1,
  typed_disagreement: 0,
  typed_vs_ambiguous: 0,
  emitted: 0,
  candidates: [{
    label: "company no",
    outcome: "accepted",
    page: 1,
    key: registration.toLowerCase().replace(/[^a-z0-9]/g, ""),
  }],
  outcome: "matched",
  value_raw: registration,
  occurrences: 1,
});

function hash64() {
  return randomUUID().replaceAll("-", "").padEnd(64, "0").slice(0, 64);
}

async function currentActor() {
  return (await rootQuery(
    `select user_id
       from clara.firm_memberships
      where firm_id=$1 and status='active'
      order by created_at,user_id
      limit 1`,
    [w.firms.A],
  )).rows[0].user_id;
}

async function seedFullF123Evidence(document, identity, invoiceId, receipt) {
  const facts = randomUUID();
  await rootQuery(
    `insert into clara.document_extractions(
       id,firm_id,document_id,engine_id,engine_kind,version_n,status,
       page_count,envelope
     ) values (
       $1,$2,$3,'p-round-facts:v1','invoice_facts',1,'done',1,$4::jsonb
     )`,
    [
      facts, w.firms.A, document,
      JSON.stringify({ vendor_identity: receipt }),
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
    [w.firms.A, facts, identity.name, invoiceId],
  );
  const ocr = randomUUID();
  await rootQuery(
    `insert into clara.document_extractions(
       id,firm_id,document_id,engine_id,engine_kind,version_n,status,
       page_count,envelope
     ) values (
       $1,$2,$3,'p-round-ocr:v1','ocr',1,'done',1,
       '{"pages":[{"page_number":1,"height":11}]}'::jsonb
     )`,
    [ocr, w.firms.A, document],
  );
  await rootQuery(
    `insert into clara.document_regions(
       firm_id,extraction_id,locator_kind,locator,field_path,
       text_content,engine_confidence
     ) values (
       $1,$2,'page_polygon',$3::jsonb,'pages.1.lines.0',$4,1.0
     )`,
    [
      w.firms.A,
      ocr,
      JSON.stringify({
        page_number: 1,
        polygon: [1, 0.5, 2, 0.5, 2, 0.9, 1, 0.9],
      }),
      `${identity.name} (${identity.reg})`,
    ],
  );
}

async function addTopBandOcrLines(document, texts) {
  const ocr = (await rootQuery(
    `select id
       from clara.document_extractions
      where document_id=$1 and engine_kind='ocr' and status='done'
      order by version_n desc,id desc
      limit 1`,
    [document],
  )).rows[0].id;
  for (const [index, text] of texts.entries()) {
    await rootQuery(
      `insert into clara.document_regions(
         firm_id,extraction_id,locator_kind,locator,field_path,
         text_content,engine_confidence
       ) values (
         $1,$2,'page_polygon',$3::jsonb,$4,$5,1.0
       )`,
      [
        w.firms.A,
        ocr,
        JSON.stringify({
          page_number: 1,
          polygon: [1, 0.55 + index * 0.05, 2, 0.55 + index * 0.05,
            2, 0.9 + index * 0.05, 1, 0.9 + index * 0.05],
        }),
        `pages.1.lines.${index + 10}`,
        text,
      ],
    );
  }
}

async function fileBareDocument(document) {
  const actor = await currentActor();
  const resolution = (await rootQuery(
    `insert into clara.client_resolutions(
       firm_id,client_id,subject_kind,subject_id,confidence,method,evidence,resolved_by
     ) values ($1,$2,'document',$3,1.0,'human','{}'::jsonb,$4)
     returning id`,
    [w.firms.A, w.clients.A1, document, actor],
  )).rows[0].id;
  return (await rootQuery(
    `insert into clara.document_filings(
       firm_id,document_id,client_id,filed_by,basis,resolution_id
     ) values ($1,$2,$3,$4,'seed-0007',$5)
     returning id`,
    [w.firms.A, document, w.clients.A1, actor, resolution],
  )).rows[0].id;
}

async function bindLive(cp, pageVendor, invoiceIds) {
  const dates = ["2025-08-25", "2025-08-29", "2025-10-13"];
  for (const [index, postingDate] of dates.entries()) {
    const doc = await seedBareDocument(
      w.firms.A,
      `p-window-${cp.id}-${index}`,
    );
    await seedF123Evidence(
      w.firms.A,
      doc.id,
      { name: pageVendor, reg: cp.reg },
      invoiceIds[index],
    );
    await seedApprovedEntry(
      w.firms.A,
      w.clients.A1,
      cp.id,
      doc,
      { postingDate },
    );
  }
  const proposed = await propose(w.users.bob, {
    client: w.clients.A1,
    counterparty: cp.id,
  });
  return sign(w.users.alice, { binding: proposed.binding_id });
}

async function seedRule(cp, status = "live") {
  const actor = await currentActor();
  return (await rootQuery(
    `insert into clara.coding_rules(
       firm_id,client_id,rule_type,counterparty_id,account_code,status,
       pinned,origin,content_hash,created_by,signed_by,signed_at,
       amount_cap_cents,frequency_window,window_max_posts,expires_at,direction
     ) values (
       $1,$2,'autopost',$3,$4,$5::text,false,'authored',$6,$7::uuid,
       case when $5::text='live' then $7::uuid else null::uuid end,
       case when $5::text='live' then now() else null::timestamptz end,
       200000,'monthly',3,now()+interval '6 months','purchase'
     ) returning id`,
    [w.firms.A, w.clients.A1, cp.id, EXP, status, hash64(), actor],
  )).rows[0].id;
}

async function addLatestOcr(document, texts) {
  const current = (await rootQuery(
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
       $1,$2,$3,'p-round-ocr:v1','ocr',$4,'done',1,
       '{"pages":[{"page_number":1,"height":11}]}'::jsonb
     )`,
    [extraction, w.firms.A, document, current + 1],
  );
  for (const [index, text] of texts.entries()) {
    await rootQuery(
      `insert into clara.document_regions(
         firm_id,extraction_id,locator_kind,locator,field_path,
         text_content,engine_confidence
       ) values (
         $1,$2,'page_polygon',$3::jsonb,$4,$5,1.0
       )`,
      [
        w.firms.A,
        extraction,
        JSON.stringify({
          page_number: 1,
          polygon: [1, 0.5 + index * 0.05, 2, 0.5 + index * 0.05,
            2, 0.9 + index * 0.05, 1, 0.9 + index * 0.05],
        }),
        `pages.1.lines.${index + 1}`,
        text,
      ],
    );
  }
}

async function seedPostDraft({
  cp,
  binding = null,
  pageVendor,
  invoiceId,
  receipt,
  registration = null,
  ocrTexts = [],
  tag,
}) {
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
  const fields = [
    factField(FIELD.total, "RM 500.00"),
    factField(FIELD.currency, "MYR"),
    factField(FIELD.vendorName, pageVendor),
    factField(FIELD.invoiceId, invoiceId),
    ...statedIdentityFields(amount),
  ];
  if (registration !== null) {
    fields.push(factField("invoice.vendor_registration", registration));
  }
  await persistInvoiceFacts(task.id, fields, {
    envelope: agreedEnvelope({
      extra: { vendor_identity: receipt },
    }),
  });
  await addLatestOcr(cited.documentId, ocrTexts);

  const total = await factsRegion(cited.documentId, FIELD.total);
  const resolution = await freshResolution(
    w.users.alice,
    w.clients.A1,
    { subjectKind: "document", subjectId: cited.documentId },
  );
  const actor = await currentActor();
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
         $1,$2,'draft','2026-03-15',$3,'agent',$4,$5,$6,$7,$8,
         jsonb_build_object('existing_id',$9::uuid,'kind','vendor'),
         $10::jsonb,'supplier_bill',$11
       ) returning id,revision_token`,
      [
        w.firms.A, w.clients.A1, `P-round ${tag}`, cited.documentId,
        cited.sha256, resolution, actor, cited.filingId, cp.id,
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
      [entry.id, w.firms.A, w.clients.A1, cited.documentId, total.id],
    );
    if (binding !== null) {
      await client.query(
        `insert into clara.vendor_binding_resolutions(
           binding_id,firm_id,client_id,document_id,entry_id,phase,
           facts_extraction_id,ocr_extraction_id,entry_revision_token,
           raw_proposal,outcome
         ) values (
           $1,$2,$3,$4,$5,'draft',
           (select id from clara.document_extractions
            where document_id=$4 and engine_kind='invoice_facts'
              and status='done'
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
    }
    return {
      entryId: entry.id,
      revisionToken: entry.revision_token,
    };
  });
  return { ...draft, cited };
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

before(async () => {
  ready = await has29();
  if (!ready) return;
  w = await buildWorld();
  await seedPayableAccount(w.firms.A, w.clients.A1);
  await upsertPayableAccount(w.users.alice, {
    client: w.clients.A1,
    code: AP,
    name: "Trade Creditors",
  });
  await upsertAccountClassed(w.users.alice, {
    client: w.clients.A1,
    code: EXP,
    name: "Professional Fees",
    type: "expense",
  });
});

after(async () => {
  await endPool();
});

function requireReady(t) {
  if (ready) return false;
  t.skip("0029_vendor_binding_executor is not applied");
  return true;
}

test("P-B/C/E1 full absent receipt admits; F1 collision ignores F2 and surfaces hard binding_ambiguous", async (t) => {
  if (requireReady(t)) return;
  const pageVendor = `SHARED P ROUND ${randomUUID().slice(0, 6)}`;
  const cpA = await seedVendorCounterparty(
    w.firms.A,
    w.clients.A1,
    "PFA",
  );
  const bindingA = await bindLive(cpA, pageVendor, [
    "PALPHA-001", "PALPHA-002", "PALPHA-003",
  ]);

  const positive = await seedBareDocument(w.firms.A, "p-full-receipt");
  await seedFullF123Evidence(
    positive.id,
    { name: pageVendor, reg: cpA.reg },
    `${bindingA.f2_invoice_prefix}99`,
    fullAbsentReceipt(),
  );
  const admitted = (await rootQuery(
    "select clara._resolve_vendor_binding($1,$2,$3) as r",
    [w.clients.A1, positive.id, null],
  )).rows[0].r;
  assert.equal(admitted.outcome, "bound");
  assert.equal(admitted.counterparty_id, cpA.id);

  const f2Mismatch = await seedBareDocument(w.firms.A, "p-f2-mismatch");
  await seedFullF123Evidence(
    f2Mismatch.id,
    { name: pageVendor, reg: cpA.reg },
    `UNRELATED-${randomUUID().slice(0, 8)}`,
    fullAbsentReceipt(),
  );
  const refused = (await rootQuery(
    "select clara._resolve_vendor_binding($1,$2,$3) as r",
    [w.clients.A1, f2Mismatch.id, null],
  )).rows[0].r;
  assert.equal(refused.outcome, "ambiguous");
  assert.equal(refused.counterparty_id, undefined,
    "a unique F1+F3 candidate that fails F2 never resolves a counterparty");

  const cpB = await seedVendorCounterparty(
    w.firms.A,
    w.clients.A1,
    "PFB",
  );
  const bindingB = await bindLive(cpB, pageVendor, [
    "PBETA-001", "PBETA-002", "PBETA-003",
  ]);
  assert.notEqual(bindingA.f2_invoice_prefix, bindingB.f2_invoice_prefix);

  const collision = await seedBareDocument(w.firms.A, "p-f2-collision");
  await seedFullF123Evidence(
    collision.id,
    { name: pageVendor, reg: cpA.reg },
    `${bindingA.f2_invoice_prefix}88`,
    fullAbsentReceipt(),
  );
  await addTopBandOcrLines(collision.id, [cpB.reg]);
  const result = (await rootQuery(
    "select clara._resolve_vendor_binding($1,$2,$3) as r",
    [w.clients.A1, collision.id, null],
  )).rows[0].r;
  assert.equal(result.outcome, "ambiguous",
    "the candidate whose F2 happens to match must not hide the other F1+F3 hit");

  const filing = await fileBareDocument(collision.id);
  const lane = (await rootQuery(
    "select * from clara._coding_lane_core($1,$2)",
    [w.clients.A1, filing],
  )).rows[0];
  assert.ok(lane.reasons.includes("binding_ambiguous"));
  assert.equal(lane.lane, "needs_you",
    "binding ambiguity is a named hard blocker at the real Slot-A caller");

});

test("P-B post-time F1 collision with different F2 prefixes skips binding_ambiguous", async (t) => {
  if (requireReady(t)) return;
  const pageVendor = `POST SHARED ${randomUUID().slice(0, 6)}`;
  const cpA = await seedVendorCounterparty(w.firms.A, w.clients.A1, "POSTA");
  const cpB = await seedVendorCounterparty(w.firms.A, w.clients.A1, "POSTB");
  const bindingA = await bindLive(cpA, pageVendor, [
    "POSTALPHA-001", "POSTALPHA-002", "POSTALPHA-003",
  ]);
  const bindingB = await bindLive(cpB, pageVendor, [
    "POSTBETA-001", "POSTBETA-002", "POSTBETA-003",
  ]);
  assert.notEqual(bindingA.f2_invoice_prefix, bindingB.f2_invoice_prefix);
  await seedRule(cpA);
  const draft = await seedPostDraft({
    cp: cpA,
    binding: bindingA.binding_id,
    pageVendor,
    invoiceId: `${bindingA.f2_invoice_prefix}77`,
    receipt: fullAbsentReceipt(),
    ocrTexts: [cpA.reg, cpB.reg],
    tag: "f2-ambiguity",
  });
  const result = await post(draft.entryId);
  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "binding_ambiguous");
  const status = (await rootQuery(
    "select status from clara.journal_entries where id=$1",
    [draft.entryId],
  )).rows[0].status;
  assert.equal(status, "draft");
});

test("P-E A.5 step-5 registered-page equality reaches a genuine post", async (t) => {
  if (requireReady(t)) return;
  const cp = await seedVendorCounterparty(w.firms.A, w.clients.A1, "STEP5");
  const binding = await bindLive(cp, cp.name, [
    "STEPFIVE-001", "STEPFIVE-002", "STEPFIVE-003",
  ]);
  await seedRule(cp);
  const draft = await seedPostDraft({
    cp,
    binding: binding.binding_id,
    pageVendor: cp.name,
    invoiceId: `${binding.f2_invoice_prefix}44`,
    receipt: fullMatchedReceipt(cp.reg),
    registration: cp.reg,
    ocrTexts: [`${cp.name} ${cp.reg}`],
    tag: "step5-equality",
  });
  const result = await post(draft.entryId);
  assert.equal(result.status, "posted");
  assert.equal(
    (await rootQuery(
      "select status from clara.journal_entries where id=$1",
      [draft.entryId],
    )).rows[0].status,
    "approved",
  );
  const resolution = (await rootQuery(
    `select outcome,refusal_reason
       from clara.vendor_binding_resolutions
      where entry_id=$1 and phase='post'
      order by created_at desc,id desc
      limit 1`,
    [draft.entryId],
  )).rows[0];
  assert.equal(resolution.outcome, "bound");
  assert.equal(resolution.refusal_reason, null);
});

test("P-D proposed->live between bulk rule lock and exact lookup cannot deadlock or join the pass", async (t) => {
  if (requireReady(t)) return;
  const cp = await seedVendorCounterparty(w.firms.A, w.clients.A1, "PHANTOM");
  const rule = await seedRule(cp, "proposed");
  const draft = await seedPostDraft({
    cp,
    pageVendor: cp.name,
    invoiceId: `PHANTOM-${randomUUID().slice(0, 8)}`,
    receipt: fullAbsentReceipt(),
    ocrTexts: [cp.reg],
    tag: "rule-phantom",
  });

  // House holdThenContend schedule, expanded by one in-holder UPDATE: A holds
  // the filing, B runs the executor through its bulk rule lock and blocks on
  // that filing, then A transitions the previously-proposed row live.
  const a = await getPool().connect();
  const b = await getPool().connect();
  let result = null;
  try {
    const pidA = (await a.query("select pg_backend_pid() as pid")).rows[0].pid;
    const pidB = (await b.query("select pg_backend_pid() as pid")).rows[0].pid;
    await a.query("begin");
    await a.query(
      "select 1 from clara.document_filings where id=$1 for update",
      [draft.cited.filingId],
    );
    await b.query("set session authorization clara_runtime_login");
    await b.query("begin");
    const pending = b.query(
      "select clara.execute_rule_post($1,$2) as result",
      [draft.entryId, `rulepost:${draft.entryId}:phantom`],
    ).then((r) => {
      result = r.rows[0].result;
    });
    assert.equal(await waitBlockedBy(pidB, pidA), true,
      "executor must have completed the bulk rule snapshot and block on filing");
    await a.query(
      `update clara.coding_rules
          set status='live',signed_by=$2,signed_at=now()
        where id=$1`,
      [rule, await currentActor()],
    );
    await a.query("commit");
    await pending;
    await b.query("commit");
  } finally {
    await a.query("rollback").catch(() => {});
    await b.query("rollback").catch(() => {});
    await b.query("reset session authorization").catch(() => {});
    a.release();
    b.release();
  }
  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "no_live_rule",
    "a rule that became live after the locked-id snapshot waits for the next pass");
  assert.equal(
    (await rootQuery(
      "select status from clara.coding_rules where id=$1",
      [rule],
    )).rows[0].status,
    "live",
  );
});
