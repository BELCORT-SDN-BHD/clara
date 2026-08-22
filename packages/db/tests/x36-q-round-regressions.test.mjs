// Task #36 Q-round merge blockers.
//
// Q1-a: propose/sign a live binding, drive the real wake_draft_entry surface
// with the model's bare {new:{name}} proposal, verify the unstaged draft
// provenance/control leg, then post it through a genuinely proposed+signed
// autopost rule and verify the post-phase resolution.
// Q1-b: the same real wake surface with an explicit, conflicting existing_id
// raises CLR23 vendor_binding_conflict and leaves no partial draft.
// Q2-1/Q2-2: every executor skip is replayable from its settled receipt and
// leaves no never-used approve_entry reservation behind.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  AP,
  EXP,
  FIELD,
  agreedEnvelope,
  approveEntry,
  billLines,
  buildWorld,
  claimTask,
  draftEntryV3,
  endPool,
  ev,
  factField,
  factsRegion,
  freshResolution,
  grantConsent,
  humanQuery,
  invoiceFactsTask,
  mintAutodraftCred,
  mintLegacyInvoiceFactsTask,
  opk,
  persistInvoiceFacts,
  resolveOpenQuestion,
  restateSightings,
  rootQuery,
  seedCitedDocument,
  statedIdentityFields,
  upsertAccountClassed,
  upsertPayableAccount,
  wakeDraftEntry,
  withSessionAuth,
} from "./wave-a-fixtures.mjs";
import {
  FULL_ABSENT_RECEIPT,
  has29,
  seedApprovedEntry,
  seedBareDocument,
  seedLiveBinding,
  seedPayableAccount,
  seedVendorCounterparty,
} from "./x36-vendor-binding-helpers.mjs";

let ready = false;
let w = null;
let bound = null;
let conflictingCounterparty = null;
let liveRule = null;

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
       $1,$2,$3,'q-round-ocr:v1','ocr',$4,'done',1,
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
          polygon: [
            1, 0.5 + index * 0.05,
            2, 0.5 + index * 0.05,
            2, 0.9 + index * 0.05,
            1, 0.9 + index * 0.05,
          ],
        }),
        `pages.1.lines.${index + 1}`,
        text,
      ],
    );
  }
}

async function seedCurrentDocument({
  vendorName,
  invoiceId,
  ocrText,
  tag,
}) {
  const amount = 50000;
  const cited = await seedCitedDocument(w.users.alice, {
    firm: w.firms.A,
    client: w.clients.A1,
    quote: "RM 500.00",
    kind: "invoice",
  });
  // F-A1 PR-3 CUTOVER: the router's invoice-kind arm now mints llm_witness, never
  // invoice_facts (no dual-run, D9) -- this fixture only needs a task ON the
  // invoice_facts lane to exercise ITS downstream machinery, so it mints directly.
  await mintLegacyInvoiceFactsTask(cited.documentId);
  const task = await invoiceFactsTask(cited.documentId);
  await claimTask(task.id, { egressApproved: true });
  await persistInvoiceFacts(task.id, [
    factField(FIELD.total, "RM 500.00"),
    factField(FIELD.currency, "MYR"),
    factField(FIELD.vendorName, vendorName),
    factField(FIELD.invoiceId, invoiceId),
    ...statedIdentityFields(amount),
  ], {
    envelope: agreedEnvelope({
      extra: { vendor_identity: FULL_ABSENT_RECEIPT },
    }),
  });
  await addLatestOcr(cited.documentId, [ocrText]);
  const total = await factsRegion(cited.documentId, FIELD.total);
  const resolution = await freshResolution(
    w.users.alice,
    w.clients.A1,
    { subjectKind: "document", subjectId: cited.documentId },
  );
  return {
    ...cited,
    amount,
    total,
    resolution,
    tag,
  };
}

async function wakeBill(document, vendor, tag) {
  const credential = await mintAutodraftCred(
    w.firms.A,
    w.clients.A1,
  );
  return wakeDraftEntry(credential, {
    client: w.clients.A1,
    resolution: document.resolution,
    postingDate: "2026-03-15",
    memo: `Q-round ${tag}`,
    lines: billLines(EXP, AP, document.amount),
    document: document.documentId,
    sha256: document.sha256,
    vendor,
    evidence: [
      ev(
        document.total.id,
        document.total.text_content,
        FIELD.total,
      ),
    ],
    codingKind: "supplier_bill",
    opKey: opk(`q-wake-${tag}`),
  });
}

async function post(entry, opKey) {
  return withSessionAuth("clara_runtime_login", async (client) => {
    const r = await client.query(
      "select clara.execute_rule_post($1,$2) as result",
      [entry, opKey],
    );
    return r.rows[0].result;
  });
}

async function seedAutopostAuthority(counterparty) {
  for (let i = 0; i < 3; i += 1) {
    const cited = await seedCitedDocument(w.users.alice, {
      firm: w.firms.A,
      client: w.clients.A1,
      quote: "RM 500.00",
      kind: "invoice",
    });
    const draft = await draftEntryV3(w.users.alice, {
      client: w.clients.A1,
      resolution: freshResolution(
        w.users.alice,
        w.clients.A1,
        { subjectKind: "document", subjectId: cited.documentId },
      ),
      document: cited.documentId,
      sha256: cited.sha256,
      lines: billLines(EXP, AP, 50000),
      vendor: { existing_id: counterparty },
      evidence: [ev(cited.regionId, cited.quote, FIELD.total)],
      opKey: opk(`q-sighting-${i}`),
    });
    await approveEntry(w.users.alice, {
      entry: draft.entry_id,
      expectedRevision: draft.revision_token,
      opKey: opk(`q-sighting-approve-${i}`),
    });
    // F-A2 PR-1 (D39): the eighth _approve_entry_core body no longer breeds, so the pool this
    // fixture needs is RESTATED from the approved entry rather than accrued as a side effect.
    // Every cell in this file claims something about the EXECUTOR, never about breeding — the
    // breeding claim moved to C.8's inverted twins. Without the restatement
    // propose_autopost_rule refuses CLR27 and all eight cells here pass VACUOUSLY.
    await restateSightings(draft.entry_id, { counterparty });
  }

  // The third human sighting proposes a vendor_account question. Resolve that
  // governed question so it cannot block the later rule-driven approval.
  const questions = (await rootQuery(
    `select id
       from clara.open_questions
      where client_id=$1 and counterparty_id=$2 and status='open'
      order by id`,
    [w.clients.A1, counterparty],
  )).rows;
  for (const question of questions) {
    await resolveOpenQuestion(w.users.alice, {
      question: question.id,
      resolution: "Q-round fixture confirms the historical account mapping",
      opKey: opk("q-resolve-rule-question"),
    });
  }

  const proposal = {
    client_id: w.clients.A1,
    counterparty_id: counterparty,
    account_code: EXP,
    amount_cap: "1000.00",
    frequency_window: "monthly",
    window_max_posts: 3,
    direction: "purchase",
  };
  const proposed = (await humanQuery(
    w.users.bob,
    "select clara.propose_autopost_rule($1::jsonb,$2) as result",
    [JSON.stringify(proposal), opk("q-propose-autopost")],
  )).rows[0].result;
  assert.equal(proposed.status, "proposed");
  const signed = (await humanQuery(
    w.users.alice,
    "select clara.sign_autopost_rule($1,$2) as result",
    [proposed.rule_id, opk("q-sign-autopost")],
  )).rows[0].result;
  assert.equal(signed.status, "live");
  return signed.rule_id;
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
  await grantConsent(w.users.alice, {
    firm: w.firms.A,
    client: w.clients.A1,
  }).catch(() => {});
  bound = await seedLiveBinding(w, "QROUND");
  conflictingCounterparty = await seedVendorCounterparty(
    w.firms.A,
    w.clients.A1,
    "QCONFLICT",
  );
  liveRule = await seedAutopostAuthority(bound.cp.id);
});

after(async () => {
  await endPool();
});

function requireReady() {
  assert.equal(
    ready,
    true,
    "0029_vendor_binding_executor must be applied for Q-round blockers",
  );
  assert.ok(w);
}

test("Q-round readiness", () => {
  requireReady();
  assert.ok(bound.binding.binding_id);
  assert.ok(liveRule);
});

test("Q1-a real bare-name wake draft binds, stamps the control leg, and posts end-to-end", async () => {
  requireReady();
  const current = await seedCurrentDocument({
    vendorName: bound.cp.name,
    invoiceId: `${bound.binding.f2_invoice_prefix}-Q1A`,
    ocrText: `${bound.cp.name} (${bound.cp.reg})`,
    tag: "positive",
  });
  const rawProposal = { new: { name: bound.cp.name } };
  const draft = await wakeBill(current, rawProposal, "positive");

  assert.equal(draft.status, "draft");
  assert.equal(draft.vendor_binding_id, bound.binding.binding_id);
  assert.equal(draft.binding_override, true);

  const entry = (await rootQuery(
    `select vendor_binding_id,proposed_counterparty,match_fingerprint,status
       from clara.journal_entries
      where id=$1`,
    [draft.entry_id],
  )).rows[0];
  assert.equal(entry.status, "draft");
  assert.equal(entry.vendor_binding_id, bound.binding.binding_id);
  assert.deepEqual(entry.proposed_counterparty, {
    existing_id: bound.cp.id,
    kind: "vendor",
  });
  assert.equal(entry.match_fingerprint.counterparty_id, bound.cp.id);

  const control = (await rootQuery(
    `select l.counterparty_id
       from clara.journal_lines l
       join clara.coa_accounts a
         on a.client_id=l.client_id and a.account_code=l.account_code
      where l.entry_id=$1 and a.account_class='payable'`,
    [draft.entry_id],
  )).rows[0];
  assert.equal(
    control.counterparty_id,
    bound.cp.id,
    "the binding-selected counterparty is present on the draft control leg",
  );

  const draftResolution = (await rootQuery(
    `select id,binding_id,outcome,raw_proposal
       from clara.vendor_binding_resolutions
      where entry_id=$1 and phase='draft'
      order by created_at,id`,
    [draft.entry_id],
  )).rows;
  assert.equal(draftResolution.length, 1);
  assert.equal(draftResolution[0].binding_id, bound.binding.binding_id);
  assert.equal(draftResolution[0].outcome, "bound");
  assert.deepEqual(draftResolution[0].raw_proposal, rawProposal);

  const result = await post(
    draft.entry_id,
    `q-rulepost:${draft.entry_id}:positive`,
  );
  assert.equal(result.status, "posted");
  assert.equal(result.rule_id, liveRule);
  assert.equal(
    (await rootQuery(
      "select status from clara.journal_entries where id=$1",
      [draft.entry_id],
    )).rows[0].status,
    "approved",
  );
  const postResolution = (await rootQuery(
    `select outcome,refusal_reason,compared_to_resolution_id
       from clara.vendor_binding_resolutions
      where entry_id=$1 and phase='post'
      order by created_at,id`,
    [draft.entry_id],
  )).rows;
  assert.equal(postResolution.length, 1);
  assert.equal(postResolution[0].outcome, "bound");
  assert.equal(postResolution[0].refusal_reason, null);
  assert.equal(
    postResolution[0].compared_to_resolution_id,
    draftResolution[0].id,
  );
});

test("Q1-b explicit existing_id conflicting with the live binding raises CLR23 and creates no draft", async () => {
  requireReady();
  const current = await seedCurrentDocument({
    vendorName: bound.cp.name,
    invoiceId: `${bound.binding.f2_invoice_prefix}-Q1B`,
    ocrText: `${bound.cp.name} (${bound.cp.reg})`,
    tag: "conflict",
  });
  await assert.rejects(
    () => wakeBill(
      current,
      { existing_id: conflictingCounterparty.id },
      "conflict",
    ),
    (err) => {
      assert.equal(err.code, "CLR23");
      assert.equal(JSON.parse(err.detail).reason, "vendor_binding_conflict");
      return true;
    },
  );
  assert.equal(
    (await rootQuery(
      "select count(*)::int as n from clara.journal_entries where document_id=$1",
      [current.documentId],
    )).rows[0].n,
    0,
  );
  assert.equal(
    (await rootQuery(
      `select count(*)::int as n
         from clara.vendor_binding_resolutions
        where document_id=$1`,
      [current.documentId],
    )).rows[0].n,
    0,
    "the refusing transaction leaves no partial binding stamp or resolution",
  );
});

test("Q1 invariant: the human lane never enters Slot B even on binding-matching evidence", async () => {
  requireReady();
  const current = await seedCurrentDocument({
    vendorName: bound.cp.name,
    invoiceId: `${bound.binding.f2_invoice_prefix}-HUMAN`,
    ocrText: `${bound.cp.name} (${bound.cp.reg})`,
    tag: "human-invariant",
  });
  const draft = await draftEntryV3(w.users.alice, {
    client: w.clients.A1,
    resolution: current.resolution,
    document: current.documentId,
    sha256: current.sha256,
    lines: billLines(EXP, AP, current.amount),
    vendor: { existing_id: bound.cp.id },
    evidence: [
      ev(current.total.id, current.total.text_content, FIELD.total),
    ],
    opKey: opk("q-human-invariant"),
  });
  assert.equal(draft.vendor_binding_id, undefined);
  assert.equal(draft.binding_override, undefined);
  const row = (await rootQuery(
    "select vendor_binding_id from clara.journal_entries where id=$1",
    [draft.entry_id],
  )).rows[0];
  assert.equal(row.vendor_binding_id, null);
  assert.equal(
    (await rootQuery(
      `select count(*)::int as n
         from clara.vendor_binding_resolutions
        where entry_id=$1`,
      [draft.entry_id],
    )).rows[0].n,
    0,
  );
});

test("Q1 invariant: an unbound wake draft retains the pre-0028 proposal/fingerprint/result shape", async () => {
  requireReady();
  const unboundName = `Q UNBOUND ${randomUUID().slice(0, 8)}`;
  const unboundReg = `QREG${randomUUID().replaceAll("-", "").slice(0, 10)}`;
  const current = await seedCurrentDocument({
    vendorName: unboundName,
    invoiceId: `Q-UNBOUND-${randomUUID().slice(0, 8)}`,
    ocrText: `${unboundName} (${unboundReg})`,
    tag: "unbound-invariant",
  });
  const proposal = { new: { name: unboundName } };
  const draft = await wakeBill(current, proposal, "unbound-invariant");
  assert.equal(draft.vendor_binding_id, undefined);
  assert.equal(draft.binding_override, undefined);
  const entry = (await rootQuery(
    `select vendor_binding_id,proposed_counterparty,match_fingerprint
       from clara.journal_entries
      where id=$1`,
    [draft.entry_id],
  )).rows[0];
  assert.equal(entry.vendor_binding_id, null);
  assert.deepEqual(entry.proposed_counterparty, proposal);
  assert.equal(entry.match_fingerprint.decision, "birth");
  assert.equal(
    (await rootQuery(
      `select count(*)::int as n
         from clara.vendor_binding_resolutions
        where entry_id=$1`,
      [draft.entry_id],
    )).rows[0].n,
    0,
  );
});

test("Q2-1 skip then identical replay returns the settled typed result, never pending", async () => {
  requireReady();
  const document = await seedBareDocument(w.firms.A, "q-skip-replay");
  const entry = await seedApprovedEntry(
    w.firms.A,
    w.clients.A1,
    bound.cp.id,
    document,
    { postingDate: "2026-03-15" },
  );
  const opKey = `q-skip-replay:${entry}`;
  const first = await post(entry, opKey);
  const second = await post(entry, opKey);
  assert.deepEqual(first, {
    entry_id: entry,
    reason: "not_a_draft",
    status: "skipped",
  });
  assert.deepEqual(second, first);
  assert.equal(second.pending, undefined);
  const receipt = (await rootQuery(
    `select result
       from clara.op_receipts
      where firm_id=$1 and fn='execute_rule_post' and op_key=$2`,
    [w.firms.A, opKey],
  )).rows[0];
  assert.deepEqual(receipt.result, first);
});

test("Q2-2 a typed skip deletes the derived, never-used approve_entry reservation", async () => {
  requireReady();
  const document = await seedBareDocument(w.firms.A, "q-skip-orphan");
  const entry = await seedApprovedEntry(
    w.firms.A,
    w.clients.A1,
    bound.cp.id,
    document,
    { postingDate: "2026-03-15" },
  );
  const opKey = `q-skip-orphan:${entry}`;
  const result = await post(entry, opKey);
  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "not_a_draft");
  assert.equal(
    (await rootQuery(
      `select count(*)::int as n
         from clara.op_receipts
        where firm_id=$1 and fn='approve_entry' and op_key=$2`,
      [w.firms.A, opKey],
    )).rows[0].n,
    0,
  );
});

test("R1 a pre-existing approve_entry receipt at the SAME predictable key settles the executor's own receipt, never leaving it orphaned", async () => {
  requireReady();
  // _reserve_op refuses a key reused with a DIFFERENT request hash (CLR10) --
  // so the shortcut this finding is about can only fire for the SAME entry at
  // the SAME revision the executor's own locator read observes (a human
  // racing in with the exact predictable rulepost:<entry>:<seq> key for the
  // SAME entry the executor is about to process, both computing the identical
  // hash). Reproducing the live race deterministically without a two-session
  // harness: pre-seed the approve_entry receipt, SETTLED, using the EXACT
  // hash formula execute_rule_post's own second _reserve_op call will compute
  // for this entry+revision+null-attestation -- this is what a genuinely-won
  // race leaves behind, without depending on timing.
  const document = await seedBareDocument(w.firms.A, "r1-collision");
  const entry = await seedApprovedEntry(
    w.firms.A, w.clients.A1, bound.cp.id, document,
    { postingDate: "2026-03-15" },
  );
  const revisionToken = (await rootQuery(
    "select revision_token from clara.journal_entries where id=$1",
    [entry],
  )).rows[0].revision_token;
  const predictableKey = `rulepost:${entry}:1`;
  const racedResult = { entry_id: entry, status: "approved", note: "raced human approval" };
  await rootQuery(
    `insert into clara.op_receipts(firm_id,fn,op_key,request_hash,result)
     values($1,'approve_entry',$2,
       clara._hash(jsonb_build_object('e',$3::uuid,'rev',$4::uuid,'att',null)),
       $5::jsonb)`,
    [w.firms.A, predictableKey, entry, revisionToken, JSON.stringify(racedResult)],
  );

  const first = await post(entry, predictableKey);
  assert.deepEqual(first, racedResult,
    "the shortcut returns the pre-existing approve_entry receipt's own result");

  const executorReceipt = (await rootQuery(
    `select result
       from clara.op_receipts
      where firm_id=$1 and fn='execute_rule_post' and op_key=$2`,
    [w.firms.A, predictableKey],
  )).rows[0];
  assert.ok(executorReceipt, "the executor's own receipt row exists");
  assert.deepEqual(executorReceipt.result, racedResult,
    "the executor's own receipt is SETTLED, not left at result=NULL");

  // Replay: a SECOND execute_rule_post call with the identical key must
  // return the recorded result directly -- never {pending:true}.
  const second = await post(entry, predictableKey);
  assert.deepEqual(second, racedResult);
  assert.equal(second.pending, undefined);
});
