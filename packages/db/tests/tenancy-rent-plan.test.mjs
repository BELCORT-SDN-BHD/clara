// Battery for migration 0300_tenancy_terms_rent_plan.sql — #949: A TENANCY AGREEMENT'S
// CONTRACT-TERMS RECORD, AND THE RECURRING RENT PLAN A PERSON CONFIRMS.
//
// Spec of record: issue #949's Agent Brief (the body) TOGETHER WITH the owner's ruling comment
// dated 2026-09-20 (work order rule 2: the newest brief plus any owner ruling of that date win).
// The ruling adds the MPERS Section 20 / MFRS 16 lessee branch and asks for "a cell per branch
// (MPERS level rent drafts; MFRS over 12 months asks; MFRS 12 months or less drafts; stated
// escalation asks, under both frameworks)". Parent #926 (owner ruling 2026-09-18, question 7).
// Blocked by #948 (0299, same lane, already applied): it creates the agreement questionnaire and
// the `contract` namespace this file reads from.
//
// THE SHAPE THIS FILE REUSES, NEVER RE-INVENTS (WAVE-4 LANE RULE (c)): CONTEXT.md's "Settlement
// candidate row" — #657's pending bank line, second instance #947's unsettled payroll net pay,
// third instance THIS file's open rent payable. Derived from live state, storing nothing,
// clearing itself the moment the facts stop producing it, offering candidates and never choosing.
//
// THE SEAMS, named up front (WORK-ORDER rule 4). No cell sits anywhere else.
//   S1. THE CONTRACT-TERMS RECORD (AC1) — clara.record_contract_terms(uuid,uuid,jsonb,text) and
//       clara.get_contract_terms(uuid) over the new append-only clara.contract_terms relation.
//   S2. WHAT CLARA CAN ALREADY READ (AC1) — clara.propose_contract_terms(uuid): the terms #948's
//       own banked regions establish, each carrying the region it was read from, and the terms
//       the frozen questionnaire has no question for, said out loud.
//   S3. THE STANDARD BRANCH (the owner's ruling) — clara._tenancy_lease_treatment(uuid,uuid).
//   S4. THE DRAFT (AC2, AC3) — clara.get_tenancy_rent_plan_draft(uuid). Inert: it posts nothing.
//   S5. THE CONFIRMATION (AC2, AC3) — clara.confirm_tenancy_rent_plan(uuid,uuid,text,text,text,text).
//   S6. THE SETTLEMENT (AC4) — clara._rent_payable_unsettled(uuid),
//       clara.get_rent_settlement_candidates(uuid), clara.settle_rent_payable(uuid,uuid,uuid,text).
//   S7. THE DEPOSIT (AC5) — clara.get_tenancy_deposit_coding(uuid).
//   S8. THE ESCALATION (AC6) — clara.get_tenancy_escalation_revision(uuid) and
//       clara.confirm_tenancy_rent_plan_revision(uuid,uuid,text).
//   S9. NEEDS YOU (AC4, AC6) — clara.list_review_queue(jsonb,jsonb,integer).
//   S10. THE PREPAYMENT LANE IS UNTOUCHED (AC7) — clara.create_prepayment_schedule's own
//        person-stated service period.
//
// Serial discipline: --test-concurrency=1 (shared rig convention).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, humanQuery, namedCall, human,
  ensureReady, endPool, buildWorld, upsertAccount, draftEntry, approveEntry, createClient,
  freshResolution,
} from "./rig-fixtures.mjs";
import { firmOf, filedDocument, seedExtraction, seedRegion, enqueueInvoiceFacts, claimTask } from "./a21-helpers.mjs";
import { consentEvidenceDoc, grantPurpose, activatePurpose } from "./wave-b/wb-0020-helpers.mjs";
import { addBankAccount, enterStatement } from "./x38-match-fixtures.mjs";
import { listReviewQueue } from "./wave-a-reads.mjs";
import { fiscalYear } from "./depreciation-history-fixtures.mjs";

let ready = false;
let world = null;

before(async () => {
  ready = await ensureReady();
  if (!ready) return;
  const applied = (
    await rootQuery("select count(*)::int as n from clara.schema_migrations where version like '0300@_%' escape '@'")
  ).rows[0].n;
  if (applied === 0) {
    if (process.env.CLARA_ALLOW_MISSING_TENANCY_RENT_PLAN !== "1") {
      throw new Error(
        "tenancy-rent-plan premise missing (migration 0300 is not applied) -- this is a FOCUSED " +
          "run and must fail loudly, not skip. Preload " +
          "./tests/tenancy-rent-plan-preintegration-gate.mjs for an estate sweep against a chain " +
          "that predates 0300.",
      );
    }
    ready = false;
    return;
  }
  world = await buildWorld();
  // This battery mints a contract_facts task per tenancy (~15 across the file) inside ONE firm.
  // 0296's per-lane concurrency wall defaults to 2 RUNNING at once (CLR18); raised for the
  // fixture firm alone, the same way a firm's own admin would raise it in the product (#947's
  // own precedent, payroll-settlement.test.mjs).
  const firm = await firmOf(world.clients.A1);
  await rootQuery(
    `insert into clara.firm_document_limits(firm_id, llm_witness_concurrency)
       values ($1, 50)
     on conflict (firm_id) do update set llm_witness_concurrency = 50`,
    [firm],
  );
});

after(async () => {
  await endPool();
});

function unready(t) {
  if (!ready) {
    t.skip("rig not ready: ensureReady() found no draft_entry, or 0300 is not applied");
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// THE WORKED EXAMPLE, computed BY HAND here and never by re-running what the database runs
// (WORK-ORDER rule 4). A two-year shoplot tenancy:
//
//   monthly rent   RM 3,600.00  =   360_000 cents
//   deposit        RM 7,200.00  =   720_000 cents   (two months' rent: 2 x 3,600.00)
//   signed         2026-01-05
//   term           24 months, so the last day is 2026-01-05 + 24 months - 1 day = 2028-01-04
//   escalation     RM 3,960.00 from 2027-01-05      (3,600.00 + 10%, stated in a side letter and
//                                                    recorded by a person: the FROZEN #948
//                                                    questionnaire has no question for it)
// ---------------------------------------------------------------------------

const RENT_CENTS = 360_000;
const DEPOSIT_CENTS = 720_000;
const TERM_START = "2026-01-05";
const TERM_END = "2028-01-04";
const ESCALATED_CENTS = 396_000;
const ESCALATION_FROM = "2027-01-05";

const value = (raw) => ({ state: "value", raw });
const notPrinted = () => ({ state: "not_printed" });

const RUN_FIELDS = [
  "contract.agreement.kind", "contract.agreement.financier", "contract.agreement.agreement_date",
  "contract.agreement.asset_description", "contract.agreement.cash_price",
  "contract.agreement.deposit", "contract.agreement.amount_financed",
  "contract.agreement.total_charges", "contract.agreement.total_payable",
  "contract.agreement.term_months", "contract.agreement.instalment_amount",
];

const TENANCY = {
  "contract.agreement.kind": value("Tenancy Agreement"),
  "contract.agreement.financier": value("Sri Damansara Properties Sdn Bhd"),
  "contract.agreement.agreement_date": value(TERM_START),
  "contract.agreement.asset_description": value("Ground-floor shoplot, No 12 Jalan PJU 1/45, Petaling Jaya"),
  "contract.agreement.cash_price": notPrinted(),
  "contract.agreement.deposit": value("7,200.00"),
  "contract.agreement.amount_financed": notPrinted(),
  "contract.agreement.total_charges": notPrinted(),
  "contract.agreement.total_payable": notPrinted(),
  "contract.agreement.term_months": value("24"),
  "contract.agreement.instalment_amount": value("3,600.00"),
};

/** The client's own chart for this lane. 2050 Rent Payable, 6100 Rental of Premises and
 *  1120 Deposits Paid are consumed BY CODE AND NAME from the CURRENT published platform
 *  template (WAVE-4 LANE RULE (a)); this file inserts no chart row anywhere. */
const RENT_ACCOUNT = "6100";
const PAYABLE_ACCOUNT = "2050";
const DEPOSITS_PAID = "1120";
const BANKCOA = "1010";

const TENANCY_CHART = [
  { code: RENT_ACCOUNT, name: "Rental of Premises", type: "expense" },
  { code: PAYABLE_ACCOUNT, name: "Rent Payable", type: "liability" },
  { code: DEPOSITS_PAID, name: "Deposits Paid", type: "asset" },
];

let opSeq = 0;
const opk949 = (tag) => `p949-${tag}-${Date.now()}-${++opSeq}`;

let clientSeq = 0;
async function freshClient(sub) {
  clientSeq += 1;
  return createClient(sub, { name: `p949-cli-${clientSeq}-${Date.now()}`, opKey: opk949(`client${clientSeq}`) });
}

async function seedTenancyChart(sub, client) {
  for (const a of TENANCY_CHART) {
    await upsertAccount(sub, { client, code: a.code, name: a.name, type: a.type, opKey: opk949("coa") });
  }
  await upsertAccount(sub, { client, code: BANKCOA, name: "Maybank current (p949)", type: "asset", opKey: opk949("bankcoa") });
}

async function hasWitnessConsent(client) {
  const r = await rootQuery(
    `select exists(select 1 from clara.client_egress_purpose_activations a
        join clara.client_egress_purpose_consents c
          on c.id=a.consent_id and c.firm_id=a.firm_id and c.client_id=a.client_id and c.purpose=a.purpose
       where a.client_id=$1 and a.purpose='witness_extraction'
         and a.deactivated_at is null and c.revoked_at is null) as live`,
    [client],
  );
  return r.rows[0].live === true;
}

function envelope({ channel = "text", answers = {} } = {}) {
  const a = {};
  for (const f of RUN_FIELDS) a[f] = f in answers ? answers[f] : TENANCY[f];
  return { contract: { channel, answers: a, rows: [] } };
}

/** Files a tenancy agreement and drives it through #948's OWN lane — the router, the claim and
 *  the persist door — so every term this file reads is a term the landed lane banked, with the
 *  regions it banked them at. Nothing here is hand-inserted. */
async function readTenancy(sub, client, { answers = {}, visionAnswers = null } = {}) {
  const firm = await firmOf(client);
  if (!(await hasWitnessConsent(client))) {
    const evidence = await consentEvidenceDoc(sub, { firm });
    const grant = await grantPurpose(sub, { client, purpose: "witness_extraction", evidenceDocument: evidence.documentId });
    await activatePurpose(sub, { client, purpose: "witness_extraction", consent: grant.consent_id });
  }
  const doc = await filedDocument(sub, { firm, client, kind: "agreement_contract" });
  const ocr = await seedExtraction({ firm, document: doc.documentId, engineKind: "ocr", status: "done" });
  await seedRegion({ firm, extraction: ocr, fieldPath: "contract.agreement.instalment_amount", textContent: "3,600.00" });

  await enqueueInvoiceFacts(doc.documentId);
  const task = (
    await rootQuery(
      `select id from clara.document_processing_tasks
        where document_id=$1 and lane='contract_facts' and status='queued'
        order by version_n desc limit 1`,
      [doc.documentId],
    )
  ).rows[0];
  assert.ok(task, "mandatory setup: the router queued a contract_facts task");
  const claimed = await claimTask(task.id, { egressApproved: true });
  assert.equal(claimed.status, "running", `mandatory setup: the task is claimable (got ${JSON.stringify(claimed)})`);
  const sha = (await rootQuery("select sha256 from clara.documents where id=$1", [doc.documentId])).rows[0].sha256;
  const receipt = (
    await rootQuery("select clara.persist_agreement_facts($1,$2::jsonb,$3::jsonb,$4) as receipt", [
      task.id,
      JSON.stringify({
        input_pin: ocr, prompt_hash: "p949-text", envelope: envelope({ channel: "text", answers }),
        citations: [{ field_path: "contract.agreement.instalment_amount", region_idx: 1 }],
      }),
      JSON.stringify({ input_pin: sha, prompt_hash: "p949-vision",
        envelope: envelope({ channel: "vision", answers: visionAnswers ?? answers }) }),
      1,
    ])
  ).rows[0].receipt;
  assert.equal(receipt.status, "done", `mandatory setup: the tenancy read settled (got ${JSON.stringify(receipt)})`);
  return { ...doc, firm, client, ocrExtractionId: ocr, textExtractionId: receipt.text_extraction_id };
}

/** The same tenancy, read DIFFERENTLY by the two channels on one question: the text channel
 *  sees RM 3,600.00 of rent and the vision channel sees RM 3,500.00. #948's evaluator settles
 *  that as `channels_disagree` and this lane must never propose a term in that state. */
const readTenancyContested = (sub, client) =>
  readTenancy(sub, client, {
    visionAnswers: { "contract.agreement.instalment_amount": value("3,500.00") },
  });

const regionIdFor = async (documentId, fieldPath) =>
  (
    await rootQuery(
      `select r.id from clara.document_regions r
         join clara.document_extractions e on e.id = r.extraction_id
        where e.document_id=$1 and e.engine_kind='agreement_text_facts' and r.field_path=$2
        order by e.version_n desc limit 1`,
      [documentId, fieldPath],
    )
  ).rows[0]?.id ?? null;

async function freshBank(sub, client) {
  const acct = await addBankAccount(sub, { client, coaAccountCode: BANKCOA, accountNumber: `9490${Date.now()}` });
  return acct.bank_account_id ?? acct.id;
}

async function caught(fn) {
  try {
    await fn();
    return null;
  } catch (e) {
    return e;
  }
}

const detailOf = (e) => {
  try {
    return JSON.parse(e.detail ?? "{}");
  } catch {
    return {};
  }
};

// ---------------------------------------------------------------------------
// S1 — the contract-terms record (AC1)
// ---------------------------------------------------------------------------

const recordTerms = async (sub, { client, document, terms, opKey }) => {
  const r = await humanQuery(
    sub,
    namedCall("record_contract_terms", [{ name: "p_client" }, { name: "p_document" }, { name: "p_terms" }, { name: "p_op_key" }]),
    [client, document, JSON.stringify(terms), opKey ?? opk949("terms")],
  );
  return r.rows[0].result;
};

const getTerms = async (sub, document) => {
  const r = await humanQuery(sub, namedCall("get_contract_terms", [{ name: "p_document" }]), [document]);
  return r.rows[0].result;
};

test("S1 · a term is recorded against the agreement it was read from, carrying the region that prints it", async (t) => {
  if (unready(t)) return;
  const sub = world.users.alice;
  const client = await freshClient(sub);
  await seedTenancyChart(sub, client);
  const doc = await readTenancy(sub, client);
  const rentRegion = await regionIdFor(doc.documentId, "contract.agreement.instalment_amount");
  assert.ok(rentRegion, "mandatory setup: #948's lane banked a region for the monthly rent");

  const receipt = await recordTerms(sub, {
    client,
    document: doc.documentId,
    terms: [
      {
        term_key: "monthly_rent",
        amount_cents: RENT_CENTS,
        printed_raw: "3,600.00",
        basis_kind: "document_region",
        source_region_ids: [rentRegion],
        basis: "the rent the tenancy prints, read by the contract lane",
      },
    ],
  });
  assert.equal(receipt.recorded, 1, `one term recorded: ${JSON.stringify(receipt)}`);
  assert.equal(receipt.superseded, 0, "nothing was superseded — this is the first reading");

  const live = await getTerms(sub, doc.documentId);
  assert.equal(live.terms.length, 1);
  const rent = live.terms[0];
  assert.equal(rent.term_key, "monthly_rent");
  assert.equal(Number(rent.amount_cents), RENT_CENTS);
  assert.equal(rent.basis_kind, "document_region");
  assert.deepEqual(rent.source_region_ids, [rentRegion], "the region is the record's own, not a re-derivation");
  assert.equal(rent.superseded_at, null, "a live term carries no supersession");
  assert.equal(live.document_id, doc.documentId);
});

test("S1 · a correction opens a successor and never edits: the old row stays, pointing at the new one", async (t) => {
  if (unready(t)) return;
  const sub = world.users.alice;
  const client = await freshClient(sub);
  await seedTenancyChart(sub, client);
  const doc = await readTenancy(sub, client);
  const rentRegion = await regionIdFor(doc.documentId, "contract.agreement.instalment_amount");

  const first = await recordTerms(sub, {
    client, document: doc.documentId,
    terms: [{ term_key: "monthly_rent", amount_cents: RENT_CENTS, printed_raw: "3,600.00",
      basis_kind: "document_region", source_region_ids: [rentRegion], basis: "as read" }],
  });
  const originalId = first.terms[0].id;

  const second = await recordTerms(sub, {
    client, document: doc.documentId,
    terms: [{ term_key: "monthly_rent", amount_cents: 380_000, printed_raw: "3,800.00",
      basis_kind: "person_stated", basis: "the side letter raises it; the page Clara read is the old one",
      supersede_reason: "corrected against the side letter" }],
  });
  assert.equal(second.superseded, 1, "the live row was superseded, not overwritten");

  const rows = (
    await rootQuery(
      `select id, amount_cents, basis_kind, superseded_by, supersede_reason,
              (superseded_at is null) as live
         from clara.contract_terms where document_id=$1 and term_key='monthly_rent'
        order by recorded_at`,
      [doc.documentId],
    )
  ).rows;
  assert.equal(rows.length, 2, "both readings survive — append-only");
  const [older, newer] = rows;
  assert.equal(older.id, originalId, "the FIRST row is still the first row");
  assert.equal(Number(older.amount_cents), RENT_CENTS, "…and its figure was never edited");
  assert.equal(older.live, false);
  assert.equal(older.superseded_by, newer.id, "it points at its successor");
  assert.equal(older.supersede_reason, "corrected against the side letter");
  assert.equal(newer.live, true);
  assert.equal(Number(newer.amount_cents), 380_000);

  const live = await getTerms(sub, doc.documentId);
  assert.equal(live.terms.length, 1, "the live read shows ONE monthly rent");
  assert.equal(Number(live.terms[0].amount_cents), 380_000);
  assert.equal(live.history.length, 1, "…and the superseded reading is still readable beside it");
});

test("S1 · the record is append-only at the TABLE, not merely at the door: an edit and a delete are both refused", async (t) => {
  if (unready(t)) return;
  const sub = world.users.alice;
  const client = await freshClient(sub);
  await seedTenancyChart(sub, client);
  const doc = await readTenancy(sub, client);
  const rentRegion = await regionIdFor(doc.documentId, "contract.agreement.instalment_amount");
  const receipt = await recordTerms(sub, {
    client, document: doc.documentId,
    terms: [{ term_key: "monthly_rent", amount_cents: RENT_CENTS, printed_raw: "3,600.00",
      basis_kind: "document_region", source_region_ids: [rentRegion], basis: "as read" }],
  });
  const id = receipt.terms[0].id;

  const edit = await caught(() =>
    rootQuery("update clara.contract_terms set amount_cents = 1 where id = $1", [id]));
  assert.ok(edit, "an UPDATE of the figure is refused");
  assert.equal(edit.code, "CLR08", `…with the estate's own immutability class: ${edit.message}`);

  const del = await caught(() => rootQuery("delete from clara.contract_terms where id = $1", [id]));
  assert.ok(del, "a DELETE is refused");
  assert.equal(del.code, "CLR08");

  const still = (await rootQuery("select amount_cents from clara.contract_terms where id=$1", [id])).rows[0];
  assert.equal(Number(still.amount_cents), RENT_CENTS, "the row is byte-unmoved after both refusals");
});

test("S1 · a term may only cite a region of ITS OWN agreement, and only a key the vocabulary admits", async (t) => {
  if (unready(t)) return;
  const sub = world.users.alice;
  const client = await freshClient(sub);
  await seedTenancyChart(sub, client);
  const mine = await readTenancy(sub, client);
  const theirs = await readTenancy(sub, client);
  const foreignRegion = await regionIdFor(theirs.documentId, "contract.agreement.instalment_amount");

  const wrongRegion = await caught(() =>
    recordTerms(sub, {
      client, document: mine.documentId,
      terms: [{ term_key: "monthly_rent", amount_cents: RENT_CENTS, basis_kind: "document_region",
        source_region_ids: [foreignRegion], basis: "another agreement's region" }],
    }));
  assert.ok(wrongRegion, "a region belonging to a DIFFERENT agreement is refused");
  assert.equal(detailOf(wrongRegion).reason, "contract_term_region_foreign");

  const wrongKey = await caught(() =>
    recordTerms(sub, {
      client, document: mine.documentId,
      terms: [{ term_key: "service_charge", amount_cents: 1000, basis_kind: "person_stated", basis: "x" }],
    }));
  assert.ok(wrongKey, "a term key outside the closed vocabulary is refused");
  assert.equal(detailOf(wrongKey).reason, "contract_term_key_unknown");

  const noBasis = await caught(() =>
    recordTerms(sub, {
      client, document: mine.documentId,
      terms: [{ term_key: "monthly_rent", amount_cents: RENT_CENTS, basis_kind: "person_stated", basis: "  " }],
    }));
  assert.ok(noBasis, "a term with no basis at all is refused — every reading says where it came from");
  assert.equal(detailOf(noBasis).reason, "contract_term_basis_missing");

  const claimedRegion = await caught(() =>
    recordTerms(sub, {
      client, document: mine.documentId,
      terms: [{ term_key: "monthly_rent", amount_cents: RENT_CENTS, basis_kind: "document_region", basis: "no region given" }],
    }));
  assert.ok(claimedRegion, "a document_region basis with NO region is refused — the basis is a claim, not a label");
  assert.equal(detailOf(claimedRegion).reason, "contract_term_region_missing");
});

test("S1 · the record is scoped like the documents estate: another firm's human sees nothing", async (t) => {
  if (unready(t)) return;
  const sub = world.users.alice;
  const client = await freshClient(sub);
  await seedTenancyChart(sub, client);
  const doc = await readTenancy(sub, client);
  const rentRegion = await regionIdFor(doc.documentId, "contract.agreement.instalment_amount");
  await recordTerms(sub, {
    client, document: doc.documentId,
    terms: [{ term_key: "monthly_rent", amount_cents: RENT_CENTS, basis_kind: "document_region",
      source_region_ids: [rentRegion], basis: "as read" }],
  });

  // dave belongs to a DIFFERENT firm (rig-fixtures.mjs's own world).
  const foreign = await caught(() => getTerms(world.users.dave, doc.documentId));
  assert.ok(foreign, "the read refuses a document outside the reader's firm");
  assert.equal(foreign.code, "CLR11", `…as a scope refusal, never an empty answer: ${foreign.message}`);

  const rows = await humanQuery(
    world.users.dave,
    "select count(*)::int as n from clara.contract_terms where document_id = $1",
    [doc.documentId],
  );
  assert.equal(rows.rows[0].n, 0, "…and the ROW ITSELF is invisible under RLS, not merely behind the door");
});

// ---------------------------------------------------------------------------
// S2 — what Clara can already read (AC1's other half)
// ---------------------------------------------------------------------------

const proposeTerms = async (sub, document) => {
  const r = await humanQuery(sub, namedCall("propose_contract_terms", [{ name: "p_document" }]), [document]);
  return r.rows[0].result;
};

const byKey = (list, key) => list.find((x) => x.term_key === key) ?? null;

test("S2 · a read tenancy proposes the rent, the deposit and the term, each carrying the region it came from", async (t) => {
  if (unready(t)) return;
  const sub = world.users.alice;
  const client = await freshClient(sub);
  await seedTenancyChart(sub, client);
  const doc = await readTenancy(sub, client);

  const proposal = await proposeTerms(sub, doc.documentId);
  assert.equal(proposal.agreement_class, "tenancy", "the proposal says what page it read");

  const rent = byKey(proposal.proposed, "monthly_rent");
  assert.ok(rent, "the monthly rent is proposed");
  assert.equal(Number(rent.amount_cents), RENT_CENTS);
  assert.equal(rent.printed_raw, "3,600.00", "…with the rendering the page actually carries");
  assert.equal(rent.basis_kind, "document_region", "…as a READING, not a derivation");
  assert.deepEqual(
    rent.source_region_ids,
    [await regionIdFor(doc.documentId, "contract.agreement.instalment_amount")],
    "…and the region is #948's own banked region for that question",
  );

  const deposit = byKey(proposal.proposed, "deposit");
  assert.ok(deposit, "the deposit is proposed");
  assert.equal(Number(deposit.amount_cents), DEPOSIT_CENTS);
  assert.equal(deposit.basis_kind, "document_region");

  const start = byKey(proposal.proposed, "term_start");
  assert.equal(start.term_date, TERM_START, "the first day comes off the signing date the page printed");
  assert.equal(start.basis_kind, "derived_from_regions", "…and says so: a derivation is never dressed as a reading");
  assert.deepEqual(start.source_region_ids, [await regionIdFor(doc.documentId, "contract.agreement.agreement_date")]);

  const end = byKey(proposal.proposed, "term_end");
  assert.equal(end.term_date, TERM_END, "24 months from 2026-01-05, the last day inclusive, is 2028-01-04");
  assert.equal(end.basis_kind, "derived_from_regions");
  assert.equal(end.source_region_ids.length, 2, "…derived from BOTH regions it needed, and naming them");

  const escalation = byKey(proposal.not_read, "escalation");
  assert.ok(escalation, "the escalation is NOT proposed, and the proposal says so out loud");
  assert.equal(escalation.reason, "no_question_in_the_questionnaire");
  assert.equal(byKey(proposal.proposed, "escalation"), null, "…and it is nowhere in the proposed set");
});

test("S2 · a term the two readings disagree about is not proposed, and the proposal names the state it is in", async (t) => {
  if (unready(t)) return;
  const sub = world.users.alice;
  const client = await freshClient(sub);
  await seedTenancyChart(sub, client);
  // The vision channel reads the rent as 3,500.00; the text channel reads 3,600.00.
  const doc = await readTenancyContested(sub, client);

  const proposal = await proposeTerms(sub, doc.documentId);
  assert.equal(byKey(proposal.proposed, "monthly_rent"), null, "a contested rent is never proposed");
  const missing = byKey(proposal.not_read, "monthly_rent");
  assert.ok(missing, "…it is reported as not read");
  assert.equal(missing.reason, "channels_disagree", "…carrying the evaluator's OWN state, not a word this file invents");
  assert.ok(byKey(proposal.proposed, "deposit"), "the terms that DID agree are still proposed");
});

test("S2 · a financing agreement is not a tenancy, and this lane proposes nothing for it", async (t) => {
  if (unready(t)) return;
  const sub = world.users.alice;
  const client = await freshClient(sub);
  await seedTenancyChart(sub, client);
  const doc = await readTenancy(sub, client, {
    answers: { "contract.agreement.kind": value("Hire Purchase Agreement") },
  });

  const proposal = await proposeTerms(sub, doc.documentId);
  assert.equal(proposal.agreement_class, "hire_purchase");
  assert.deepEqual(proposal.proposed, [], "a hire purchase proposes no tenancy term at all");
  assert.equal(proposal.reason, "not_a_tenancy", "…and says why, by name");
});

// ---------------------------------------------------------------------------
// S3 — the standard branch the owner ruled on 2026-09-20 (MPERS Section 20 / MFRS 16).
//
// A cell per branch, exactly as the ruling asks: MPERS level rent DRAFTS; MFRS over 12 months
// ASKS; MFRS 12 months or less DRAFTS; a stated escalation ASKS under BOTH frameworks.
// ---------------------------------------------------------------------------

/** The client's reporting framework, recorded through the estate's OWN knowledge door — never
 *  hand-inserted. `reporting_framework` is an authority-bearing POLICY key, so only an asserted
 *  source may fill it; `user_statement` is the asserted source a person's own statement takes. */
async function setFramework(sub, client, code, { scope = "client" } = {}) {
  await humanQuery(
    sub,
    `select clara.capture_knowledge(p_knowledge_key => 'reporting_framework',
        p_value => $1::jsonb, p_basis => $2, p_op_key => $3,
        p_scope_kind => $4, p_client => $5, p_source_kind => 'user_statement')`,
    [
      JSON.stringify({ framework_code: code, framework_label: `${code} (p949 fixture)` }),
      "the engagement letter records the framework these accounts are prepared on",
      opk949("framework"),
      scope,
      scope === "client" ? client : null,
    ],
  );
}

/** Records the four terms Clara proposed, verbatim, as a person confirming what she read. */
async function recordProposed(sub, client, document, extra = []) {
  const proposal = await proposeTerms(sub, document);
  const terms = proposal.proposed.map((p) => ({ ...p }));
  return recordTerms(sub, { client, document, terms: [...terms, ...extra] });
}

const treatmentOf = async (client, document) =>
  (
    await rootQuery("select clara._tenancy_lease_treatment($1::uuid,$2::uuid) as t", [client, document])
  ).rows[0].t;

/** The escalation a person records off the side letter: RM 3,960.00 from 2027-01-05. */
const ESCALATION_TERM = {
  term_key: "escalation",
  escalation: { effective_from: ESCALATION_FROM, new_amount_cents: ESCALATED_CENTS, printed_raw: "3,960.00" },
  basis_kind: "person_stated",
  basis: "clause 4(b) of the side letter raises the rent in the second year",
};

async function tenancyFor(sub, { months = "24", framework = null } = {}) {
  const client = await freshClient(sub);
  await seedTenancyChart(sub, client);
  if (framework) await setFramework(sub, client, framework);
  const doc = await readTenancy(sub, client, {
    answers: months === "24" ? {} : { "contract.agreement.term_months": value(months) },
  });
  return { client, doc };
}

test("S3 · MPERS with level rent DRAFTS, and the basis names MPERS Section 20", async (t) => {
  if (unready(t)) return;
  const sub = world.users.alice;
  const { client, doc } = await tenancyFor(sub, { framework: "MPERS" });
  await recordProposed(sub, client, doc.documentId);

  const tr = await treatmentOf(client, doc.documentId);
  assert.equal(tr.drafts, true, `MPERS + level rent is the ordinary case: ${JSON.stringify(tr)}`);
  assert.equal(tr.framework_code, "MPERS");
  assert.equal(tr.reason, null);
  assert.equal(tr.standard, "MPERS Section 20");
  assert.match(tr.basis, /straight-line/i, "the written basis says what the standard asks for");
  assert.match(tr.basis, /MPERS Section 20/);
  assert.match(tr.basis, /MFRS 16/, "…and names the other framework too, so a reader sees which one was applied and why");
  assert.equal(Number(tr.monthly_rent_cents), RENT_CENTS);
  assert.equal(tr.term_months, 24);
});

test("S3 · MFRS over 12 months ASKS: a right-of-use asset and a lease liability are not a rent expense", async (t) => {
  if (unready(t)) return;
  const sub = world.users.alice;
  const { client, doc } = await tenancyFor(sub, { framework: "MFRS" });
  await recordProposed(sub, client, doc.documentId);

  const tr = await treatmentOf(client, doc.documentId);
  assert.equal(tr.drafts, false, "Clara never auto-posts a treatment that may not comply");
  assert.equal(tr.reason, "mfrs_lease_over_twelve_months");
  assert.equal(tr.standard, "MFRS 16");
  assert.match(tr.question, /right-of-use asset/i, "the question states what the standard asks");
  assert.match(tr.question, /lease liability/i);
  assert.equal(tr.term_months, 24, "…and it states the term it read, so the accountant can decide");
  assert.equal(Number(tr.monthly_rent_cents), RENT_CENTS, "…and the rent it read");
});

test("S3 · MFRS with a term of 12 months or less DRAFTS: the short-term lease exemption", async (t) => {
  if (unready(t)) return;
  const sub = world.users.alice;
  const { client, doc } = await tenancyFor(sub, { framework: "MFRS", months: "12" });
  await recordProposed(sub, client, doc.documentId);

  const tr = await treatmentOf(client, doc.documentId);
  assert.equal(tr.drafts, true, `a 12-month lease is short-term: ${JSON.stringify(tr)}`);
  assert.equal(tr.standard, "MFRS 16");
  assert.equal(tr.term_months, 12);
  assert.equal(tr.reason, null);
  assert.match(tr.basis, /short-term/i);
});

test("S3 · a stated escalation ASKS under BOTH frameworks — straight-line is not the month's cash rent", async (t) => {
  if (unready(t)) return;
  const sub = world.users.alice;

  for (const framework of ["MPERS", "MFRS"]) {
    const { client, doc } = await tenancyFor(sub, { framework, months: framework === "MFRS" ? "12" : "24" });
    await recordProposed(sub, client, doc.documentId, [ESCALATION_TERM]);

    const tr = await treatmentOf(client, doc.documentId);
    assert.equal(tr.drafts, false, `${framework}: a stated escalation stops the draft`);
    assert.equal(tr.reason, "escalation_stated");
    assert.equal(Number(tr.escalation.new_amount_cents), ESCALATED_CENTS,
      "…and the escalation it read travels with the question");
    assert.match(tr.question, /escalation/i);
    assert.match(tr.question, /averaged|straight-line/i, "…naming the treatment the standard asks for");
  }
});

test("S3 · a client whose framework nobody recorded ASKS rather than assuming one", async (t) => {
  if (unready(t)) return;
  const sub = world.users.alice;
  const { client, doc } = await tenancyFor(sub);
  await recordProposed(sub, client, doc.documentId);

  const tr = await treatmentOf(client, doc.documentId);
  assert.equal(tr.drafts, false);
  assert.equal(tr.reason, "framework_not_established");
  assert.equal(tr.framework_code, null);
  assert.equal(tr.framework_in_force, "none");
  assert.match(tr.question, /framework/i);
});

test("S3 · a client exception shadows the firm default, and a framework outside MPERS/MFRS asks", async (t) => {
  if (unready(t)) return;
  const sub = world.users.alice;

  // The FIRM default is MFRS; THIS client is an MPERS private entity.
  const { client, doc } = await tenancyFor(sub);
  await setFramework(sub, client, "MFRS", { scope: "firm" });
  await setFramework(sub, client, "MPERS");
  await recordProposed(sub, client, doc.documentId);

  const tr = await treatmentOf(client, doc.documentId);
  assert.equal(tr.framework_code, "MPERS", "the client's own exception wins over the firm default");
  assert.equal(tr.framework_in_force, "client_exception");
  assert.equal(tr.drafts, true);

  // A framework the branch cannot decide from is a question, not a guess.
  const other = await tenancyFor(sub, { framework: "SPECIAL_PURPOSE_TAX_MANAGEMENT" });
  await recordProposed(sub, other.client, other.doc.documentId);
  const tr2 = await treatmentOf(other.client, other.doc.documentId);
  assert.equal(tr2.drafts, false);
  assert.equal(tr2.reason, "framework_not_decisive");
  assert.equal(tr2.framework_code, "SPECIAL_PURPOSE_TAX_MANAGEMENT");
});

test("S3 · a tenancy whose terms were never recorded drafts nothing, and says which term is missing", async (t) => {
  if (unready(t)) return;
  const sub = world.users.alice;
  const { client, doc } = await tenancyFor(sub, { framework: "MPERS" });

  const tr = await treatmentOf(client, doc.documentId);
  assert.equal(tr.drafts, false);
  assert.equal(tr.reason, "terms_incomplete");
  assert.deepEqual(tr.missing_terms.sort(), ["monthly_rent", "term_end", "term_start"]);
});

// ---------------------------------------------------------------------------
// S4 — the draft (AC2's first half, AC3's first half). Inert by construction.
// ---------------------------------------------------------------------------

const draftOf = async (sub, document) => {
  const r = await humanQuery(sub, namedCall("get_tenancy_rent_plan_draft", [{ name: "p_document" }]), [document]);
  return r.rows[0].result;
};

const countsFor = async (client) =>
  (
    await rootQuery(
      `select (select count(*)::int from clara.journal_entries where client_id=$1) as entries,
              (select count(*)::int from clara.accounting_plans where client_id=$1) as plans,
              (select count(*)::int from clara.accounting_plan_occurrences where client_id=$1) as occurrences`,
      [client],
    )
  ).rows[0];

const legOf = (basis, code) => (basis?.lines ?? []).find((l) => l.account_code === code) ?? null;

test("S4 · the draft debits rent expense and credits the rent payable, monthly over the agreement's own term", async (t) => {
  if (unready(t)) return;
  const sub = world.users.alice;
  const { client, doc } = await tenancyFor(sub, { framework: "MPERS" });
  await recordProposed(sub, client, doc.documentId);

  const draft = await draftOf(sub, doc.documentId);
  assert.equal(draft.treatment.drafts, true, `the branch admits this one: ${JSON.stringify(draft.treatment.reason)}`);
  assert.deepEqual(draft.refusals, [], "no chart account is missing");
  assert.equal(draft.confirmed, false, "a draft is not a plan");
  assert.equal(draft.plan_id, null);

  const p = draft.plan;
  assert.equal(p.kind, "recurring_journal");
  assert.equal(p.frequency, "monthly");
  assert.equal(p.day_rule, "day_of_month");
  assert.equal(p.day_of_month, 5, "the 5th, because the term starts on the 5th");
  assert.equal(p.timezone, "Asia/Kuala_Lumpur");
  assert.equal(p.effective_from, TERM_START);
  assert.equal(p.effective_to, TERM_END, "the plan stops on the tenancy's own last day");
  assert.equal(p.occurrences, 24, "24 months of rent, one per month of the term");

  const debit = legOf(p.basis, RENT_ACCOUNT);
  const credit = legOf(p.basis, PAYABLE_ACCOUNT);
  assert.ok(debit && credit, `two legs, by code: ${JSON.stringify(p.basis.lines)}`);
  assert.equal(Number(debit.debit_cents), RENT_CENTS, "the rent the tenancy prints, to the cent");
  assert.equal(Number(credit.credit_cents), RENT_CENTS);
  assert.equal(Number(debit.credit_cents), 0);
  assert.equal(Number(credit.debit_cents), 0);
  assert.equal(p.rent_account_name, "Rental of Premises", "each leg names the account it resolved to");
  assert.equal(p.payable_account_name, "Rent Payable");
  assert.equal(p.basis.currency, "MYR");
});

test("S4 · the draft is INERT: reading it twice leaves no entry, no plan and no occurrence", async (t) => {
  if (unready(t)) return;
  const sub = world.users.alice;
  const { client, doc } = await tenancyFor(sub, { framework: "MPERS" });
  await recordProposed(sub, client, doc.documentId);

  const before = await countsFor(client);
  await draftOf(sub, doc.documentId);
  await draftOf(sub, doc.documentId);
  const after = await countsFor(client);

  assert.deepEqual(after, before, "an unconfirmed draft posts NOTHING — it is a read, not an act");
  assert.equal(after.entries, 0, "…and there was nothing to post in the first place");
  assert.equal(after.plans, 0);
});

test("S4 · the draft never credits a bank account, and says which account is the money's own", async (t) => {
  if (unready(t)) return;
  const sub = world.users.alice;
  const { client, doc } = await tenancyFor(sub, { framework: "MPERS" });
  await recordProposed(sub, client, doc.documentId);
  await freshBank(sub, client);

  const draft = await draftOf(sub, doc.documentId);
  const bankCodes = (
    await rootQuery(
      `select a.account_code from clara.coa_accounts a
        where a.client_id=$1 and (a.is_bank_account or a.account_code in
          (select ba.coa_account_code from clara.bank_accounts ba where ba.client_id=$1 and ba.active))`,
      [client],
    )
  ).rows.map((r) => r.account_code);
  assert.ok(bankCodes.includes(BANKCOA), "mandatory setup: the client has a registered bank account on this code");

  for (const line of draft.plan.basis.lines) {
    assert.equal(
      bankCodes.includes(line.account_code) && Number(line.credit_cents) > 0,
      false,
      `no leg of the drafted basis credits a bank account: ${JSON.stringify(line)}`,
    );
  }
  assert.equal(legOf(draft.plan.basis, BANKCOA), null, "the bank is nowhere in the drafted basis at all");
});

test("S4 · a chart account this client does not hold is a NAMED refusal carrying the code, never a silent substitution", async (t) => {
  if (unready(t)) return;
  const sub = world.users.alice;
  const client = await freshClient(sub);
  // Deliberately seed only the rent expense; 2050 Rent Payable is absent from this client's chart.
  await upsertAccount(sub, { client, code: RENT_ACCOUNT, name: "Rental of Premises", type: "expense", opKey: opk949("coa") });
  await setFramework(sub, client, "MPERS");
  const doc = await readTenancy(sub, client);
  await recordProposed(sub, client, doc.documentId);

  const draft = await draftOf(sub, doc.documentId);
  assert.equal(draft.plan, null, "no basis is drafted when an account it needs is missing");
  const refusal = draft.refusals.find((r) => r.reason === "account_not_in_chart");
  assert.ok(refusal, `a named refusal: ${JSON.stringify(draft.refusals)}`);
  assert.equal(refusal.detail.account_code, PAYABLE_ACCOUNT, "…carrying the code the client does not hold");
});

test("S4 · a draft whose treatment ASKS carries the question and drafts no basis", async (t) => {
  if (unready(t)) return;
  const sub = world.users.alice;
  const { client, doc } = await tenancyFor(sub, { framework: "MFRS" });
  await recordProposed(sub, client, doc.documentId);

  const draft = await draftOf(sub, doc.documentId);
  assert.equal(draft.treatment.drafts, false);
  assert.equal(draft.treatment.reason, "mfrs_lease_over_twelve_months");
  assert.equal(draft.plan, null, "Clara drafts nothing when the standard may not admit the treatment");
  assert.match(draft.treatment.question, /right-of-use asset/i, "…and the question is what a person reads instead");
  assert.equal(Number(draft.treatment.monthly_rent_cents), RENT_CENTS, "…beside the rent she DID read");
});

// ---------------------------------------------------------------------------
// S5 — the confirmation (AC2's second half, AC3's refusal)
// ---------------------------------------------------------------------------

const confirmPlan = async (sub, { client, document, rentAccount = null, payableAccount = null, judgement = null, opKey = null }) => {
  const r = await humanQuery(
    sub,
    namedCall("confirm_tenancy_rent_plan", [
      { name: "p_client" }, { name: "p_document" }, { name: "p_rent_account" },
      { name: "p_payable_account" }, { name: "p_judgement" }, { name: "p_op_key" },
    ]),
    [client, document, rentAccount, payableAccount, judgement, opKey ?? opk949("confirm")],
  );
  return r.rows[0].result;
};

const planRow = async (planId) =>
  (
    await rootQuery(
      `select p.status, p.kind, p.purpose, p.authority_kind, p.authority_ref, p.authorised_by,
              p.authority_from::text as authority_from,
              r.frequency, r.day_rule, r.day_of_month, r.timezone,
              r.effective_from::text as effective_from, r.effective_to::text as effective_to, r.basis
         from clara.accounting_plans p
         join clara.accounting_plan_revisions r on r.plan_id = p.id and r.revision = p.current_revision
        where p.id = $1`,
      [planId],
    )
  ).rows[0];

test("S5 · confirming records the person's own act and starts the plan under it, with the agreement as its source document", async (t) => {
  if (unready(t)) return;
  const sub = world.users.alice;
  const { client, doc } = await tenancyFor(sub, { framework: "MPERS" });
  await recordProposed(sub, client, doc.documentId);

  const before = await countsFor(client);
  assert.equal(before.plans, 0, "mandatory setup: the draft started nothing");

  const receipt = await confirmPlan(sub, { client, document: doc.documentId });
  assert.ok(receipt.plan_id, `a plan is created: ${JSON.stringify(receipt)}`);
  assert.ok(receipt.confirmation_id);

  const plan = await planRow(receipt.plan_id);
  assert.equal(plan.status, "active", "the plan runs from the moment a person said so");
  assert.equal(plan.kind, "recurring_journal");
  assert.equal(plan.authority_kind, "explicit_instruction");
  assert.equal(plan.authority_ref.kind, "contract_confirmation", "the authority is the confirming act itself");
  assert.equal(plan.authority_ref.id, receipt.confirmation_id);
  assert.equal(plan.frequency, "monthly");
  assert.equal(plan.day_of_month, 5);
  assert.equal(plan.effective_from, TERM_START);
  assert.equal(plan.effective_to, TERM_END);

  const cf = (
    await rootQuery(
      `select document_id, kind, monthly_rent_cents, rent_account_code, payable_account_code,
              term_start::text as term_start, term_end::text as term_end, treatment,
              professional_judgement, confirmed_by
         from clara.contract_plan_confirmations where id=$1`,
      [receipt.confirmation_id],
    )
  ).rows[0];
  assert.equal(cf.document_id, doc.documentId, "the agreement is recorded as the act's source document");
  assert.equal(cf.kind, "rent_plan");
  assert.equal(Number(cf.monthly_rent_cents), RENT_CENTS);
  assert.equal(cf.rent_account_code, RENT_ACCOUNT);
  assert.equal(cf.payable_account_code, PAYABLE_ACCOUNT);
  assert.equal(cf.term_start, TERM_START);
  assert.equal(cf.term_end, TERM_END);
  assert.equal(cf.treatment.standard, "MPERS Section 20", "…and the treatment it was confirmed under, frozen");
  assert.equal(cf.professional_judgement, null, "…with no judgement owed, because the branch drafted");

  const after = await countsFor(client);
  assert.equal(after.plans, 1);
  assert.equal(after.entries, 0, "confirming starts a schedule; it posts no entry of its own");

  const draft = await draftOf(sub, doc.documentId);
  assert.equal(draft.confirmed, true, "the draft read now says a person has confirmed one");
  assert.equal(draft.plan_id, receipt.plan_id);
  assert.equal(draft.inert, false);
});

test("S5 · the confirmed plan's own basis credits the rent payable, and a bank account is refused BY NAME", async (t) => {
  if (unready(t)) return;
  const sub = world.users.alice;
  const { client, doc } = await tenancyFor(sub, { framework: "MPERS" });
  await recordProposed(sub, client, doc.documentId);
  await freshBank(sub, client);

  const receipt = await confirmPlan(sub, { client, document: doc.documentId });
  const plan = await planRow(receipt.plan_id);
  const credit = plan.basis.lines.find((l) => Number(l.credit_cents) > 0);
  assert.equal(credit.account_code, PAYABLE_ACCOUNT, "the plan's own credit is the payable, in the STORED revision");
  assert.equal(Number(credit.credit_cents), RENT_CENTS);

  // A FRESH tenancy for the refusal: the door refuses a second confirmation of the SAME tenancy
  // before it ever looks at the accounts, so re-using this one would prove the wrong wall.
  const other = await tenancyFor(sub, { framework: "MPERS" });
  await recordProposed(sub, other.client, other.doc.documentId);
  await freshBank(sub, other.client);
  const bankCredit = await caught(() =>
    confirmPlan(sub, { client: other.client, document: other.doc.documentId, payableAccount: BANKCOA }));
  assert.ok(bankCredit, "naming a bank account as the plan's credit is refused");
  assert.equal(bankCredit.code, "CLR10");
  assert.equal(detailOf(bankCredit).reason, "plan_credits_bank_account");
  assert.equal(detailOf(bankCredit).account_code, BANKCOA, "…carrying the account it refused");
  assert.match(bankCredit.message, /double/i, "…and saying WHY: the statement line that pays it would be counted twice");
  assert.equal((await countsFor(other.client)).plans, 0, "…and nothing was started");

  // The DRAFT reports the same wall, so a person sees it before they click rather than after.
  const refusedDraft = await rootQuery(
    "select clara._tenancy_rent_plan_draft($1::uuid,$2::uuid,null,$3) as d",
    [other.client, other.doc.documentId, BANKCOA],
  );
  assert.equal(
    refusedDraft.rows[0].d.refusals.some((r) => r.reason === "plan_credits_bank_account"),
    true,
    "the draft names the wall too",
  );
});

test("S5 · a treatment that ASKS is admitted only against a written professional judgement", async (t) => {
  if (unready(t)) return;
  const sub = world.users.alice;
  const { client, doc } = await tenancyFor(sub, { framework: "MFRS" });
  await recordProposed(sub, client, doc.documentId);

  const bare = await caught(() => confirmPlan(sub, { client, document: doc.documentId }));
  assert.ok(bare, "a plan the standard may not admit is not confirmed on a click alone");
  assert.equal(bare.code, "CLR10");
  assert.equal(detailOf(bare).reason, "professional_judgement_required");
  assert.equal(detailOf(bare).treatment_reason, "mfrs_lease_over_twelve_months");
  assert.match(bare.message, /right-of-use asset/i, "…and the refusal states what the standard asks");
  assert.equal((await countsFor(client)).plans, 0, "…and nothing was started");

  const judged = await confirmPlan(sub, {
    client, document: doc.documentId,
    judgement: "The premises are leased month to month in substance; the 24-month term is a "
      + "renewal option the client is not reasonably certain to exercise, so MFRS 16's short-term "
      + "exemption is applied. Reviewed with the engagement partner on 2026-01-08.",
  });
  assert.ok(judged.plan_id, "a person MAY confirm it, having written down the treatment they took");

  const cf = (
    await rootQuery("select professional_judgement, treatment from clara.contract_plan_confirmations where id=$1",
      [judged.confirmation_id])
  ).rows[0];
  assert.match(cf.professional_judgement, /short-term/i, "the judgement is recorded verbatim");
  assert.equal(cf.treatment.drafts, false, "…beside the branch that asked, so a reviewer sees both");
  assert.equal(cf.treatment.standard, "MFRS 16");

  const plan = await planRow(judged.plan_id);
  assert.match(plan.purpose, /judgement/i, "…and the plan itself says on its face that a judgement carries it");
});

test("S5 · a replayed op_key returns the same receipt and starts no second plan", async (t) => {
  if (unready(t)) return;
  const sub = world.users.alice;
  const { client, doc } = await tenancyFor(sub, { framework: "MPERS" });
  await recordProposed(sub, client, doc.documentId);

  const key = opk949("replay");
  const first = await confirmPlan(sub, { client, document: doc.documentId, opKey: key });
  const second = await confirmPlan(sub, { client, document: doc.documentId, opKey: key });
  assert.deepEqual(second, first, "the same key answers with the same receipt, byte for byte");
  assert.equal((await countsFor(client)).plans, 1, "…and exactly one plan exists");

  const already = await caught(() => confirmPlan(sub, { client, document: doc.documentId }));
  assert.ok(already, "a SECOND confirmation of the same tenancy, under a new key, is refused");
  assert.equal(detailOf(already).reason, "rent_plan_already_confirmed");
  assert.equal(detailOf(already).plan_id, first.plan_id, "…pointing at the plan that already runs");
});

test("S5 · the plan lane resolves a contract_confirmation, and refuses one that names no row of this client", async (t) => {
  if (unready(t)) return;
  const sub = world.users.alice;
  const { client, doc } = await tenancyFor(sub, { framework: "MPERS" });
  await recordProposed(sub, client, doc.documentId);
  const receipt = await confirmPlan(sub, { client, document: doc.documentId });

  // The widened arm resolves for real: create_accounting_plan itself accepts the confirmation.
  const direct = await humanQuery(
    sub,
    `select clara.create_accounting_plan(p_client => $1, p_kind => 'recurring_journal',
        p_purpose => 'p949 direct', p_authority_kind => 'explicit_instruction',
        p_authority_ref => $2::jsonb, p_frequency => 'monthly', p_day_rule => 'day_of_month',
        p_day_of_month => 5, p_timezone => 'Asia/Kuala_Lumpur', p_effective_from => $3,
        p_effective_to => $4, p_basis => $5::jsonb, p_reversal_day_rule => null,
        p_op_key => $6) as result`,
    [
      client,
      JSON.stringify({ kind: "contract_confirmation", id: receipt.confirmation_id }),
      TERM_START, TERM_END,
      JSON.stringify({
        posting_date: TERM_START, memo: "p949 direct", currency: "MYR",
        lines: [
          { account_code: RENT_ACCOUNT, debit_cents: RENT_CENTS, credit_cents: 0 },
          { account_code: PAYABLE_ACCOUNT, debit_cents: 0, credit_cents: RENT_CENTS },
        ],
      }),
      opk949("direct"),
    ],
  );
  assert.ok(direct.rows[0].result.plan_id, "the plan lane's own door takes a contract_confirmation");

  // A confirmation of ANOTHER client is unresolved, not merely unauthorised.
  const other = await tenancyFor(sub, { framework: "MPERS" });
  await recordProposed(sub, other.client, other.doc.documentId);
  const otherReceipt = await confirmPlan(sub, { client: other.client, document: other.doc.documentId });

  const foreign = await caught(() =>
    humanQuery(
      sub,
      `select clara.create_accounting_plan(p_client => $1, p_kind => 'recurring_journal',
          p_purpose => 'p949 foreign', p_authority_kind => 'explicit_instruction',
          p_authority_ref => $2::jsonb, p_frequency => 'monthly', p_day_rule => 'day_of_month',
          p_day_of_month => 5, p_timezone => 'Asia/Kuala_Lumpur', p_effective_from => $3,
          p_effective_to => $4, p_basis => $5::jsonb, p_reversal_day_rule => null,
          p_op_key => $6) as result`,
      [
        client,
        JSON.stringify({ kind: "contract_confirmation", id: otherReceipt.confirmation_id }),
        TERM_START, TERM_END,
        JSON.stringify({
          posting_date: TERM_START, memo: "p949 foreign", currency: "MYR",
          lines: [
            { account_code: RENT_ACCOUNT, debit_cents: RENT_CENTS, credit_cents: 0 },
            { account_code: PAYABLE_ACCOUNT, debit_cents: 0, credit_cents: RENT_CENTS },
          ],
        }),
        opk949("foreign"),
      ],
    ));
  assert.ok(foreign, "a confirmation belonging to another client does not authorise this one's plan");
  assert.equal(detailOf(foreign).reason, "authority_ref_unresolved");

  // And #977's own two arms still answer exactly as they did.
  const unknownKind = await caught(() =>
    rootQuery("select clara._authority_ref_refusal('accounting_work', gen_random_uuid(), gen_random_uuid(), gen_random_uuid())"));
  assert.equal(unknownKind, null, "the accounting_work arm still answers rather than raising");
  const stillUnknown = await caught(() =>
    rootQuery("select clara._authority_ref_refusal('not_a_kind', gen_random_uuid(), gen_random_uuid(), gen_random_uuid())"));
  assert.ok(stillUnknown, "an unknown kind still RAISES, so the next lane that widens finds that line");
});

// ---------------------------------------------------------------------------
// S6 — the open rent payable and the bank line that settles it (AC4, AC3's second half).
//
// The Settlement candidate row, third instance (CONTEXT.md; #657's pending bank line first,
// #947's unsettled payroll net pay second). The read is a pure LEDGER fact over the plan's own
// payable account, so it clears itself by ANY route and no cell below drives a dismissal,
// because there is none to drive.
//
// HOW A MONTH OF RENT GETS ONTO THE LEDGER IN THESE CELLS. A confirmed plan posts its months
// through the plan lane's own Work machinery (0193: a due event admits an accounting_work, which
// a runtime run posts), and no database cell can turn that handle. What this file drives instead
// is the LEDGER CLAIM these cells are actually about: a month of rent booked Dr rent expense /
// Cr rent payable, through the ordinary journal doors, exactly as a plan occurrence leaves it.
// The plan lane's own posting path is 0193's to prove and its battery proves it.
// ---------------------------------------------------------------------------

async function postRentMonth(sub, client, { postingDate, cents = RENT_CENTS, memo = "monthly rent" } = {}) {
  const drafted = await draftEntry(human(sub), {
    client,
    resolution: await freshResolution(sub, client),
    postingDate,
    memo,
    lines: [
      { account_code: RENT_ACCOUNT, debit_cents: cents, credit_cents: 0, description: memo },
      { account_code: PAYABLE_ACCOUNT, debit_cents: 0, credit_cents: cents, description: memo },
    ],
    opKey: opk949("rent-draft"),
  });
  const token = (await rootQuery("select revision_token from clara.journal_entries where id=$1", [drafted.entry_id])).rows[0].revision_token;
  await approveEntry(world.users.bob, { entry: drafted.entry_id, expectedRevision: token, opKey: opk949("rent-approve") });
  return drafted.entry_id;
}

/** The OPEN months, which is what "unsettled" means at every seam that consumes this read: the
 *  internal itself reports every month of rent with its remaining balance, and a month whose
 *  balance is zero is a month that is paid. */
const unsettledRows = async (client) =>
  (
    await rootQuery(
      `select entry_id, plan_id, document_id, filing_id, posting_date::text as posting_date,
              period_month::text as period_month, payable_account_code, rent_cents, unsettled_cents
         from clara._rent_payable_unsettled($1::uuid)
        where unsettled_cents > 0 order by posting_date, entry_id`,
      [client],
    )
  ).rows;

const rentCandidates = async (sub, client) => {
  const r = await humanQuery(sub, namedCall("get_rent_settlement_candidates", [{ name: "p_client" }]), [client]);
  return r.rows[0].result;
};

const settleRent = async (sub, { client, entry, line, opKey = null }) => {
  const r = await humanQuery(
    sub,
    namedCall("settle_rent_payable", [{ name: "p_client" }, { name: "p_entry" }, { name: "p_line" }, { name: "p_op_key" }]),
    [client, entry, line, opKey ?? opk949("settle")],
  );
  return r.rows[0].result;
};

/** A confirmed tenancy with a registered bank account, ready to post and settle rent against. */
async function runningTenancy(sub) {
  const { client, doc } = await tenancyFor(sub, { framework: "MPERS" });
  await recordProposed(sub, client, doc.documentId);
  const receipt = await confirmPlan(sub, { client, document: doc.documentId });
  const bank = await freshBank(sub, client);
  return { client, doc, bank, planId: receipt.plan_id, confirmationId: receipt.confirmation_id };
}

/** ONE live statement for this tenancy's bank account, carrying exactly the lines the cell asks
 *  for. `keepPeriod: true` because these cells are ABOUT dates: the rent month is posted on the
 *  5th of February and the settlement window is ten days either side, so the entry dates the
 *  cell states must be the entry dates the estate stores. One statement per cell keeps the
 *  statement lane's adjacent-month continuity binding out of a cell that is not about it. */
async function bankStatement(sub, { client, bank, specs, periodStart = "2026-02-01", periodEnd = "2026-02-28" }) {
  const st = await enterStatement(sub, {
    client, bankAccount: bank, keepPeriod: true,
    periodStart, periodEnd, opening: 5000000,
    specs, opKey: opk949("stmt"),
  });
  return st.lines;
}

const rentLine = (entryDate, cents = RENT_CENTS, description = "RENTAL PAYMENT SRI DAMANSARA") =>
  ({ entryDate, description, amountCents: -cents });

test("S6 · a posted month of rent is fully unsettled until something pays it, and the read is a pure ledger fact", async (t) => {
  if (unready(t)) return;
  const sub = world.users.alice;
  const { client } = await runningTenancy(sub);

  assert.deepEqual(await unsettledRows(client), [], "a plan with no posted month owes nothing yet");

  const entry = await postRentMonth(sub, client, { postingDate: "2026-02-05" });
  const rows = await unsettledRows(client);
  assert.equal(rows.length, 1, `one open month: ${JSON.stringify(rows)}`);
  assert.equal(rows[0].entry_id, entry);
  assert.equal(Number(rows[0].rent_cents), RENT_CENTS);
  assert.equal(Number(rows[0].unsettled_cents), RENT_CENTS);
  assert.equal(rows[0].period_month, "2026-02-01");
  assert.equal(rows[0].payable_account_code, PAYABLE_ACCOUNT);
  assert.ok(rows[0].document_id, "the row points back at the tenancy it belongs to");
});

test("S6 · a hand-booked debit reduces the OLDEST open month first, to the cent", async (t) => {
  if (unready(t)) return;
  const sub = world.users.alice;
  const { client } = await runningTenancy(sub);
  await postRentMonth(sub, client, { postingDate: "2026-02-05", memo: "rent february" });
  await postRentMonth(sub, client, { postingDate: "2026-03-05", memo: "rent march" });

  // Half a month's rent paid by hand, against no particular month.
  const drafted = await draftEntry(human(sub), {
    client, resolution: await freshResolution(sub, client), postingDate: "2026-03-20",
    memo: "part payment of rent",
    lines: [
      { account_code: PAYABLE_ACCOUNT, debit_cents: RENT_CENTS / 2, credit_cents: 0, description: "part" },
      { account_code: BANKCOA, debit_cents: 0, credit_cents: RENT_CENTS / 2, description: "bank" },
    ],
    opKey: opk949("part-draft"),
  });
  const token = (await rootQuery("select revision_token from clara.journal_entries where id=$1", [drafted.entry_id])).rows[0].revision_token;
  await approveEntry(world.users.bob, { entry: drafted.entry_id, expectedRevision: token, opKey: opk949("part-approve") });

  const rows = await unsettledRows(client);
  assert.equal(rows.length, 2);
  assert.equal(Number(rows[0].unsettled_cents), RENT_CENTS / 2, "February is charged first — oldest open item");
  assert.equal(Number(rows[1].unsettled_cents), RENT_CENTS, "March is untouched until February is covered");
});

test("S6 · the candidate read offers an exact bank line inside the window, and never a wrong amount or a far date", async (t) => {
  if (unready(t)) return;
  const sub = world.users.alice;
  const { client, bank } = await runningTenancy(sub);
  const entry = await postRentMonth(sub, client, { postingDate: "2026-02-05" });
  const paid = await bankStatement(sub, { client, bank, specs: [rentLine("2026-02-07")] });

  const offered = await rentCandidates(sub, client);
  assert.equal(offered.length, 1, `one open month: ${JSON.stringify(offered)}`);
  assert.equal(offered[0].entry_id, entry);
  assert.equal(Number(offered[0].unsettled_cents), RENT_CENTS);
  assert.equal(offered[0].candidates.length, 1, "exactly the line that could be it");
  assert.equal(offered[0].candidates[0].line_id, paid[0].id);
  assert.equal(Number(offered[0].candidates[0].amount_cents), -RENT_CENTS, "money LEAVING the bank, to the cent");
  assert.ok(Math.abs(Number(offered[0].candidates[0].date_delta_days)) <= 10);

  // A line of the wrong amount is not a candidate.
  const other = await runningTenancy(sub);
  await postRentMonth(sub, other.client, { postingDate: "2026-02-05" });
  await bankStatement(sub, { client: other.client, bank: other.bank, specs: [rentLine("2026-02-07", RENT_CENTS + 1)] });
  const none = await rentCandidates(sub, other.client);
  assert.deepEqual(none[0].candidates, [], "one cent out is not a match, and nothing is offered instead");
});

test("S6 · accepting the candidate books Dr rent payable / Cr bank and binds the line through the EXISTING bank-side door", async (t) => {
  if (unready(t)) return;
  const sub = world.users.alice;
  const { client, bank } = await runningTenancy(sub);
  const entry = await postRentMonth(sub, client, { postingDate: "2026-02-05" });
  const paid = await bankStatement(sub, { client, bank, specs: [rentLine("2026-02-07")] });

  const receipt = await settleRent(sub, { client, entry, line: paid[0].id });
  assert.ok(receipt.entry_id, `a settlement entry: ${JSON.stringify(receipt)}`);
  assert.ok(receipt.match_id, "…bound to the line through a real bank match");

  const lines = (
    await rootQuery(
      "select account_code, debit_cents, credit_cents from clara.journal_lines where entry_id=$1 order by line_no",
      [receipt.entry_id],
    )
  ).rows;
  assert.equal(lines.length, 2);
  assert.equal(lines[0].account_code, PAYABLE_ACCOUNT);
  assert.equal(Number(lines[0].debit_cents), RENT_CENTS, "the payable is cleared");
  assert.equal(lines[1].account_code, BANKCOA);
  assert.equal(Number(lines[1].credit_cents), RENT_CENTS, "…and the money leaves the bank, once");

  const je = (
    await rootQuery("select status, maker_actor, checker_actor, flags from clara.journal_entries where id=$1", [receipt.entry_id])
  ).rows[0];
  assert.equal(je.status, "approved");
  assert.equal(je.maker_actor, je.checker_actor, "one human's own accept act");
  assert.ok(je.flags.rent_settlement, "the settlement says what it is");

  const rc = (
    await rootQuery(
      "select via_wake_kind, approval_arm, gate_verdicts, model_snapshot from clara.entry_post_receipts where entry_id=$1",
      [receipt.entry_id],
    )
  ).rows[0];
  assert.equal(rc.via_wake_kind, "interactive");
  assert.equal(rc.approval_arm, "rent_settlement_interactive");
  assert.equal(rc.gate_verdicts.rent_entry_id, entry);

  // The match is the REUSED core's own rows, not a second mechanism.
  const match = (
    await rootQuery("select status from clara.bank_matches where id=$1", [receipt.match_id])
  ).rows[0];
  assert.equal(match.status, "live");
  const lineMembers = (
    await rootQuery("select line_id, amount_cents from clara.bank_match_line_members where match_id=$1", [receipt.match_id])
  ).rows;
  assert.equal(lineMembers.length, 1);
  assert.equal(lineMembers[0].line_id, paid[0].id);
  const entryMembers = (
    await rootQuery("select entry_id, matched_cents from clara.bank_match_entry_members where match_id=$1", [receipt.match_id])
  ).rows;
  assert.equal(entryMembers.length, 1);
  assert.equal(entryMembers[0].entry_id, receipt.entry_id, "the SETTLEMENT entry rides the match, never the rent entry");

  assert.deepEqual(await unsettledRows(client), [], "and the open month is gone");
});

test("S6 · a month's rent plus its later bank payment leave exactly ONE rent expense and ONE bank movement (AC3)", async (t) => {
  if (unready(t)) return;
  const sub = world.users.alice;
  const { client, bank } = await runningTenancy(sub);
  const entry = await postRentMonth(sub, client, { postingDate: "2026-02-05" });
  const paid = await bankStatement(sub, { client, bank, specs: [rentLine("2026-02-07")] });
  await settleRent(sub, { client, entry, line: paid[0].id });

  const totals = (
    await rootQuery(
      `select
         (select coalesce(sum(jl.debit_cents),0) from clara.journal_lines jl
            join clara.journal_entries je on je.id=jl.entry_id
           where je.client_id=$1 and je.status='approved' and je.reversed_by is null
             and jl.account_code=$2) as rent_expense_cents,
         (select count(*)::int from clara.journal_lines jl
            join clara.journal_entries je on je.id=jl.entry_id
           where je.client_id=$1 and je.status='approved' and je.reversed_by is null
             and jl.account_code=$2 and jl.debit_cents>0) as rent_expense_legs,
         (select coalesce(sum(jl.credit_cents),0) from clara.journal_lines jl
            join clara.journal_entries je on je.id=jl.entry_id
           where je.client_id=$1 and je.status='approved' and je.reversed_by is null
             and jl.account_code=$3) as bank_out_cents,
         (select count(*)::int from clara.journal_lines jl
            join clara.journal_entries je on je.id=jl.entry_id
           where je.client_id=$1 and je.status='approved' and je.reversed_by is null
             and jl.account_code=$3) as bank_legs,
         (select coalesce(sum(jl.credit_cents),0) - coalesce(sum(jl.debit_cents),0)
            from clara.journal_lines jl
            join clara.journal_entries je on je.id=jl.entry_id
           where je.client_id=$1 and je.status='approved' and je.reversed_by is null
             and jl.account_code=$4) as payable_balance_cents`,
      [client, RENT_ACCOUNT, BANKCOA, PAYABLE_ACCOUNT],
    )
  ).rows[0];

  assert.equal(Number(totals.rent_expense_cents), RENT_CENTS, "the expense is recognised ONCE");
  assert.equal(totals.rent_expense_legs, 1, "…on exactly one leg");
  assert.equal(Number(totals.bank_out_cents), RENT_CENTS, "the money leaves ONCE");
  assert.equal(totals.bank_legs, 1, "…on exactly one leg");
  assert.equal(Number(totals.payable_balance_cents), 0, "and the payable is square");
});

test("S6 · the row clears itself by a hand-booked route too, and no dismissal record is written by any route", async (t) => {
  if (unready(t)) return;
  const sub = world.users.alice;
  const { client } = await runningTenancy(sub);
  const entry = await postRentMonth(sub, client, { postingDate: "2026-02-05" });
  assert.equal((await unsettledRows(client)).length, 1);

  const before = (
    await rootQuery(
      `select (select count(*)::int from clara.journal_entries where client_id=$1) as entries,
              (select count(*)::int from clara.bank_matches where client_id=$1) as matches`,
      [client],
    )
  ).rows[0];

  // Route (b): a person books the payment by hand, with no door of this lane involved at all.
  const drafted = await draftEntry(human(sub), {
    client, resolution: await freshResolution(sub, client), postingDate: "2026-02-09",
    memo: "rent paid by cheque",
    lines: [
      { account_code: PAYABLE_ACCOUNT, debit_cents: RENT_CENTS, credit_cents: 0, description: "cheque 004512" },
      { account_code: BANKCOA, debit_cents: 0, credit_cents: RENT_CENTS, description: "cheque 004512" },
    ],
    opKey: opk949("hand-draft"),
  });
  const token = (await rootQuery("select revision_token from clara.journal_entries where id=$1", [drafted.entry_id])).rows[0].revision_token;
  await approveEntry(world.users.bob, { entry: drafted.entry_id, expectedRevision: token, opKey: opk949("hand-approve") });

  assert.deepEqual(await unsettledRows(client), [], "the row is already gone — nobody dismissed anything");
  assert.equal(entry !== null, true);

  const after = (
    await rootQuery(
      `select (select count(*)::int from clara.journal_entries where client_id=$1) as entries,
              (select count(*)::int from clara.bank_matches where client_id=$1) as matches`,
      [client],
    )
  ).rows[0];
  assert.equal(after.entries, before.entries + 1, "exactly one new entry: the person's own");
  assert.equal(after.matches, before.matches, "and no match, no marker, no dismissal row anywhere");
});

test("S6 · two bank lines matching one month are BOTH offered, and neither is chosen", async (t) => {
  if (unready(t)) return;
  const sub = world.users.alice;
  const { client, bank } = await runningTenancy(sub);
  await postRentMonth(sub, client, { postingDate: "2026-02-05" });
  // TWO lines of the SAME amount, both inside the window -- the case a person must adjudicate.
  const paid = await bankStatement(sub, {
    client, bank,
    specs: [rentLine("2026-02-07"), rentLine("2026-02-10", RENT_CENTS, "RENTAL PAYMENT DUPLICATE")],
  });

  const offered = await rentCandidates(sub, client);
  assert.equal(offered.length, 1);
  assert.equal(offered[0].candidates.length, 2, `both are offered: ${JSON.stringify(offered[0].candidates)}`);
  assert.equal(Number((await unsettledRows(client))[0].unsettled_cents), RENT_CENTS, "…and nothing was settled");
  const riding = (
    await rootQuery(
      "select count(*)::int as n from clara.bank_match_line_members where line_id = any($1::uuid[])",
      [offered[0].candidates.map((x) => x.line_id)],
    )
  ).rows[0].n;
  assert.equal(riding, 0, "neither line rides a match: choosing is the human's act");
  assert.equal(paid.length, 2);
});

test("S6 · the accept door refuses a wrong amount and a month that is already settled, each by name", async (t) => {
  if (unready(t)) return;
  const sub = world.users.alice;
  const { client, bank } = await runningTenancy(sub);
  const entry = await postRentMonth(sub, client, { postingDate: "2026-02-05" });
  const [wrong, right, again] = await bankStatement(sub, {
    client, bank,
    specs: [
      rentLine("2026-02-07", RENT_CENTS - 100, "RENTAL SHORT"),
      rentLine("2026-02-08"),
      rentLine("2026-02-09", RENT_CENTS, "RENTAL AGAIN"),
    ],
  });

  const mismatch = await caught(() => settleRent(sub, { client, entry, line: wrong.id }));
  assert.ok(mismatch, "a line that does not pay the month is refused");
  assert.equal(detailOf(mismatch).reason, "amount_mismatch");

  await settleRent(sub, { client, entry, line: right.id });

  const already = await caught(() => settleRent(sub, { client, entry, line: again.id }));
  assert.ok(already, "a month that is already covered refuses a second settlement");
  assert.equal(detailOf(already).reason, "already_settled");

  const notRent = await caught(() =>
    settleRent(sub, { client, entry: right.id, line: again.id }));
  assert.ok(notRent, "an entry that is not an open rent month is refused too");
  assert.equal(detailOf(notRent).reason, "not_an_open_rent_month");
});

// ---------------------------------------------------------------------------
// S7 — the deposit (AC5). Recorded as a term, never drafted; offered a coding when the money
//      actually moves.
// ---------------------------------------------------------------------------

const depositCoding = async (sub, client) => {
  const r = await humanQuery(sub, namedCall("get_tenancy_deposit_coding", [{ name: "p_client" }]), [client]);
  return r.rows[0].result;
};

test("S7 · no entry is born from the agreement alone: reading a tenancy and recording its terms posts nothing", async (t) => {
  if (unready(t)) return;
  const sub = world.users.alice;
  const { client, doc } = await tenancyFor(sub, { framework: "MPERS" });
  await recordProposed(sub, client, doc.documentId);

  const terms = await getTerms(sub, doc.documentId);
  assert.equal(Number(byKey(terms.terms, "deposit").amount_cents), DEPOSIT_CENTS,
    "the deposit is RECORDED — signing states a term");

  const counts = await countsFor(client);
  assert.equal(counts.entries, 0, "…and NOTHING is posted: signing does not say the money moved");
  assert.equal(counts.plans, 0);

  // Confirming the rent plan does not change that either: a rent plan is a rent plan.
  await confirmPlan(sub, { client, document: doc.documentId });
  assert.equal((await countsFor(client)).entries, 0, "confirming the rent plan books no deposit either");

  const draft = await draftOf(sub, doc.documentId);
  for (const line of draft.plan.basis.lines) {
    assert.notEqual(Number(line.debit_cents), DEPOSIT_CENTS, "no leg of the rent plan is the deposit");
    assert.notEqual(line.account_code, DEPOSITS_PAID, "…and the deposits-paid account is nowhere in it");
  }
});

test("S7 · a bank line matching the recorded deposit offers Deposits Paid as the coding, and posts nothing", async (t) => {
  if (unready(t)) return;
  const sub = world.users.alice;
  const { client, doc } = await tenancyFor(sub, { framework: "MPERS" });
  await recordProposed(sub, client, doc.documentId);
  const bank = await freshBank(sub, client);

  assert.deepEqual(
    (await depositCoding(sub, client))[0].candidates,
    [],
    "with no bank line there is nothing to offer, and nothing is guessed",
  );

  const lines = await bankStatement(sub, {
    client, bank, periodStart: "2026-01-01", periodEnd: "2026-01-31",
    specs: [
      { entryDate: "2026-01-08", description: "TENANCY DEPOSIT SRI DAMANSARA", amountCents: -DEPOSIT_CENTS },
      { entryDate: "2026-01-09", description: "unrelated payment", amountCents: -(DEPOSIT_CENTS + 500) },
    ],
  });

  const offers = await depositCoding(sub, client);
  assert.equal(offers.length, 1, `one recorded deposit: ${JSON.stringify(offers)}`);
  const offer = offers[0];
  assert.equal(offer.document_id, doc.documentId);
  assert.equal(Number(offer.deposit_cents), DEPOSIT_CENTS);
  assert.equal(offer.printed_raw, "7,200.00", "the rendering the tenancy prints travels with it");
  assert.equal(offer.proposed_account_code, DEPOSITS_PAID);
  assert.equal(offer.proposed_account_name, "Deposits Paid", "…consumed by code AND name from this client's chart");
  assert.equal(offer.proposed_account_in_chart, true);
  assert.equal(offer.already_coded, false);
  assert.equal(offer.candidates.length, 1, "only the line that is exactly the deposit");
  assert.equal(offer.candidates[0].line_id, lines[0].id);
  assert.equal(Number(offer.candidates[0].amount_cents), -DEPOSIT_CENTS);

  assert.equal((await countsFor(client)).entries, 0, "an OFFER posts nothing: coding it is the person's act");
});

test("S7 · the offer clears itself once the deposit is coded, and says so", async (t) => {
  if (unready(t)) return;
  const sub = world.users.alice;
  const { client, doc } = await tenancyFor(sub, { framework: "MPERS" });
  await recordProposed(sub, client, doc.documentId);
  const bank = await freshBank(sub, client);
  await bankStatement(sub, {
    client, bank, periodStart: "2026-01-01", periodEnd: "2026-01-31",
    specs: [{ entryDate: "2026-01-08", description: "TENANCY DEPOSIT", amountCents: -DEPOSIT_CENTS }],
  });
  assert.equal((await depositCoding(sub, client))[0].already_coded, false);

  // The person codes it the ordinary way: Dr 1120 Deposits Paid / Cr bank.
  const drafted = await draftEntry(human(sub), {
    client, resolution: await freshResolution(sub, client), postingDate: "2026-01-08",
    memo: "tenancy deposit",
    lines: [
      { account_code: DEPOSITS_PAID, debit_cents: DEPOSIT_CENTS, credit_cents: 0, description: "deposit" },
      { account_code: BANKCOA, debit_cents: 0, credit_cents: DEPOSIT_CENTS, description: "bank" },
    ],
    opKey: opk949("dep-draft"),
  });
  const token = (await rootQuery("select revision_token from clara.journal_entries where id=$1", [drafted.entry_id])).rows[0].revision_token;
  await approveEntry(world.users.bob, { entry: drafted.entry_id, expectedRevision: token, opKey: opk949("dep-approve") });

  const after = await depositCoding(sub, client);
  assert.equal(after[0].already_coded, true, "the offer answers from the ledger, so it clears itself");
  assert.deepEqual(after[0].candidates, [], "…and offers nothing further");
});

test("S7 · a client whose chart has no deposits-paid account is told so, never offered a code they do not hold", async (t) => {
  if (unready(t)) return;
  const sub = world.users.alice;
  const client = await freshClient(sub);
  for (const a of TENANCY_CHART.filter((x) => x.code !== DEPOSITS_PAID)) {
    await upsertAccount(sub, { client, code: a.code, name: a.name, type: a.type, opKey: opk949("coa") });
  }
  await upsertAccount(sub, { client, code: BANKCOA, name: "Maybank current (p949)", type: "asset", opKey: opk949("bankcoa") });
  await setFramework(sub, client, "MPERS");
  const doc = await readTenancy(sub, client);
  await recordProposed(sub, client, doc.documentId);

  const offer = (await depositCoding(sub, client))[0];
  assert.equal(offer.proposed_account_code, DEPOSITS_PAID, "the account it WOULD propose is still named");
  assert.equal(offer.proposed_account_in_chart, false, "…and the offer says this client does not hold it");
  assert.equal(offer.proposed_account_name, null);
});

// ---------------------------------------------------------------------------
// S8 — the escalation (AC6). Recorded, surfaced before its date, revised only by a person.
// ---------------------------------------------------------------------------

const escalationOffer = async (sub, document) => {
  const r = await humanQuery(sub, namedCall("get_tenancy_escalation_revision", [{ name: "p_document" }]), [document]);
  return r.rows[0].result;
};

const confirmRevision = async (sub, { client, document, judgement = null, opKey = null }) => {
  const r = await humanQuery(
    sub,
    namedCall("confirm_tenancy_rent_plan_revision", [
      { name: "p_client" }, { name: "p_document" }, { name: "p_judgement" }, { name: "p_op_key" },
    ]),
    [client, document, judgement, opKey ?? opk949("revise")],
  );
  return r.rows[0].result;
};

const liveRevision = async (planId) =>
  (
    await rootQuery(
      `select r.revision, r.basis, r.effective_from::text as effective_from,
              r.effective_to::text as effective_to
         from clara.accounting_plan_revisions r
        where r.plan_id=$1 and r.superseded_at is null`,
      [planId],
    )
  ).rows[0];

/** A confirmed level-rent plan, with the escalation recorded AFTERWARDS off the side letter —
 *  which is the real sequence: the tenancy is read and the plan started, and the rent review is
 *  found in a clause a person reads for themselves. */
async function escalatingTenancy(sub, { effectiveFrom = ESCALATION_FROM } = {}) {
  const { client, doc } = await tenancyFor(sub, { framework: "MPERS" });
  await recordProposed(sub, client, doc.documentId);
  const receipt = await confirmPlan(sub, { client, document: doc.documentId });
  await recordTerms(sub, {
    client, document: doc.documentId,
    terms: [{
      ...ESCALATION_TERM,
      escalation: { effective_from: effectiveFrom, new_amount_cents: ESCALATED_CENTS, printed_raw: "3,960.00" },
    }],
  });
  return { client, doc, planId: receipt.plan_id };
}

test("S8 · a stated escalation surfaces before its date, offering the revision and changing nothing", async (t) => {
  if (unready(t)) return;
  const sub = world.users.alice;
  // Effective 30 days from today, so "before its effective date" is the case under test.
  const soon = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  const { doc, planId } = await escalatingTenancy(sub, { effectiveFrom: soon });

  const offer = await escalationOffer(sub, doc.documentId);
  assert.equal(offer.pending, true, `the escalation is pending: ${JSON.stringify(offer)}`);
  assert.equal(offer.plan_id, planId);
  assert.equal(Number(offer.current_cents), RENT_CENTS);
  assert.equal(Number(offer.new_cents), ESCALATED_CENTS);
  assert.equal(offer.effective_from, soon);
  assert.ok(offer.days_until > 0, "…and it is offered BEFORE the date it takes effect");

  const proposed = offer.proposed_revision;
  assert.equal(proposed.effective_from, soon, "the revision starts on the escalation's own date");
  const credit = proposed.basis.lines.find((l) => Number(l.credit_cents) > 0);
  assert.equal(credit.account_code, PAYABLE_ACCOUNT, "…and still credits the payable, never the bank");
  assert.equal(Number(credit.credit_cents), ESCALATED_CENTS);

  const live = await liveRevision(planId);
  assert.equal(live.revision, 1, "NOTHING has changed: the plan is still on its first revision");
  assert.equal(
    Number(live.basis.lines.find((l) => Number(l.credit_cents) > 0).credit_cents),
    RENT_CENTS,
    "…and still charges the ORIGINAL rent. No amount changes by itself.",
  );
});

test("S8 · confirming the revision moves the plan, and only then", async (t) => {
  if (unready(t)) return;
  const sub = world.users.alice;
  const soon = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  const { client, doc, planId } = await escalatingTenancy(sub, { effectiveFrom: soon });

  // The escalation makes the lessee branch ASK (straight-line is not the month's cash rent), so
  // the revision is admitted only against a written judgement — the same wall as the first
  // confirmation, for the same reason.
  const bare = await caught(() => confirmRevision(sub, { client, document: doc.documentId }));
  assert.ok(bare, "a stepped rent is not revised on a click alone");
  assert.equal(detailOf(bare).reason, "professional_judgement_required");
  assert.equal(detailOf(bare).treatment_reason, "escalation_stated");
  assert.equal((await liveRevision(planId)).revision, 1, "…and the plan did not move");

  const done = await confirmRevision(sub, {
    client, document: doc.documentId,
    judgement: "The increase follows the CPI clause and is expected to track general inflation, "
      + "so the cash rent is charged as incurred rather than averaged (MPERS 20.15(b)).",
  });
  assert.equal(done.plan_id, planId);
  assert.equal(done.revision, 2);

  const live = await liveRevision(planId);
  assert.equal(live.revision, 2);
  assert.equal(live.effective_from, soon);
  assert.equal(
    Number(live.basis.lines.find((l) => Number(l.credit_cents) > 0).credit_cents),
    ESCALATED_CENTS,
    "the plan now charges the escalated rent, because a person said so",
  );

  const after = await escalationOffer(sub, doc.documentId);
  assert.equal(after.pending, false, "the row clears itself: the plan now carries the escalated amount");
  assert.equal(after.reason, "already_revised");

  const cf = (
    await rootQuery(
      `select kind, monthly_rent_cents, professional_judgement, treatment
         from clara.contract_plan_confirmations where id=$1`,
      [done.confirmation_id],
    )
  ).rows[0];
  assert.equal(cf.kind, "rent_plan_revision", "the revision is its own recorded act");
  assert.equal(Number(cf.monthly_rent_cents), ESCALATED_CENTS);
  assert.match(cf.professional_judgement, /CPI/);
  assert.equal(cf.treatment.reason, "escalation_stated");
});

test("S8 · an escalation whose date is far away does not nag, and a tenancy with none is silent", async (t) => {
  if (unready(t)) return;
  const sub = world.users.alice;
  const far = new Date(Date.now() + 400 * 86_400_000).toISOString().slice(0, 10);
  const distant = await escalatingTenancy(sub, { effectiveFrom: far });
  const offer = await escalationOffer(sub, distant.doc.documentId);
  assert.equal(offer.pending, false, "a rent review more than a year out is not this quarter's question");
  assert.equal(offer.reason, "not_due_yet");
  assert.ok(offer.days_until > 60);

  const { client, doc } = await tenancyFor(sub, { framework: "MPERS" });
  await recordProposed(sub, client, doc.documentId);
  await confirmPlan(sub, { client, document: doc.documentId });
  const none = await escalationOffer(sub, doc.documentId);
  assert.equal(none.pending, false);
  assert.equal(none.reason, "no_escalation_recorded");
});

test("S8 · a tenancy with no confirmed plan has nothing to revise, and says so", async (t) => {
  if (unready(t)) return;
  const sub = world.users.alice;
  const { client, doc } = await tenancyFor(sub, { framework: "MPERS" });
  await recordProposed(sub, client, doc.documentId, [ESCALATION_TERM]);

  const offer = await escalationOffer(sub, doc.documentId);
  assert.equal(offer.pending, false);
  assert.equal(offer.reason, "no_confirmed_plan");

  const nothing = await caught(() => confirmRevision(sub, { client, document: doc.documentId, judgement: "x" }));
  assert.ok(nothing, "and the revision door refuses rather than inventing a plan to revise");
  assert.equal(detailOf(nothing).reason, "no_confirmed_plan");
});

// ---------------------------------------------------------------------------
// S9 — Needs you (AC4's arm and AC6's arm)
// ---------------------------------------------------------------------------

async function queueRows(sub, client) {
  const env = await listReviewQueue(human(sub), { scope: { client_id: client }, limit: 200 });
  return env.rows;
}

const kindRows = (rows, kind) => rows.filter((r) => r.row_kind === kind);

test("S9 · an unpaid month of rent reaches Needs you, naming the month and the amount, and clears itself", async (t) => {
  if (unready(t)) return;
  const sub = world.users.alice;
  const { client, doc, bank } = await runningTenancy(sub);
  assert.deepEqual(kindRows(await queueRows(sub, client), "rent_payable_unsettled"), [],
    "a plan with no posted month owes nothing");

  const entry = await postRentMonth(sub, client, { postingDate: "2026-02-05" });
  const rows = kindRows(await queueRows(sub, client), "rent_payable_unsettled");
  assert.equal(rows.length, 1, `one row: ${JSON.stringify(rows)}`);
  const row = rows[0];
  assert.equal(row.section, "needs_you");
  assert.equal(row.lane, "needs_you");
  assert.equal(row.entry_id, entry, "the row names the rent entry itself");
  assert.equal(row.document_id, doc.documentId, "…and the tenancy it belongs to");
  assert.equal(Number(row.amount_cents), RENT_CENTS);
  assert.equal(row.period, "2026-02-01");
  assert.match(row.question_text, /rent is posted/i);
  assert.match(row.question_text, /February 2026/);
  assert.equal(row.auto, false);
  assert.equal(row.high_stakes, false);

  const paid = await bankStatement(sub, { client, bank, specs: [rentLine("2026-02-07")] });
  await settleRent(sub, { client, entry, line: paid[0].id });
  assert.deepEqual(kindRows(await queueRows(sub, client), "rent_payable_unsettled"), [],
    "settled, so the row is gone — nothing dismissed it");
});

test("S9 · a pending escalation reaches Needs you before its date, and clears when the revision is confirmed", async (t) => {
  if (unready(t)) return;
  const sub = world.users.alice;
  const soon = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  const { client, doc, planId } = await escalatingTenancy(sub, { effectiveFrom: soon });

  const rows = kindRows(await queueRows(sub, client), "rent_escalation_pending");
  assert.equal(rows.length, 1, `one row: ${JSON.stringify(rows)}`);
  const row = rows[0];
  assert.equal(row.section, "needs_you");
  assert.equal(row.lane, "needs_you");
  assert.equal(row.document_id, doc.documentId);
  assert.equal(Number(row.amount_cents), ESCALATED_CENTS, "the amount it would move to");
  assert.equal(row.period, soon);
  assert.match(row.question_text, /escalation|rises|review/i);

  await confirmRevision(sub, {
    client, document: doc.documentId,
    judgement: "The clause tracks CPI; charged as incurred (MPERS 20.15(b)).",
  });
  assert.deepEqual(kindRows(await queueRows(sub, client), "rent_escalation_pending"), [],
    "confirmed, so the row is gone");
  assert.equal((await liveRevision(planId)).revision, 2);
});

test("S9 · declining leaves both rows exactly as they were: there is no dismissal act to make", async (t) => {
  if (unready(t)) return;
  const sub = world.users.alice;
  const soon = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  const { client, doc } = await escalatingTenancy(sub, { effectiveFrom: soon });
  await postRentMonth(sub, client, { postingDate: "2026-02-05" });

  const first = (await queueRows(sub, client)).filter((r) =>
    r.row_kind === "rent_payable_unsettled" || r.row_kind === "rent_escalation_pending");
  const second = (await queueRows(sub, client)).filter((r) =>
    r.row_kind === "rent_payable_unsettled" || r.row_kind === "rent_escalation_pending");
  assert.equal(first.length, 2, `both rows: ${JSON.stringify(first.map((r) => r.row_kind))}`);
  assert.deepEqual(second, first, "two reads with no act in between are byte-identical");
  assert.ok(doc.documentId);
});

test("S9 · the queue still projects every kind it carried before this file, and the row shape did not move", async (t) => {
  if (unready(t)) return;
  const sub = world.users.alice;
  const { client } = await runningTenancy(sub);
  await postRentMonth(sub, client, { postingDate: "2026-02-05" });
  const rows = await queueRows(sub, client);
  const mine = kindRows(rows, "rent_payable_unsettled")[0];
  const uncoded = rows.find((r) => r.row_kind === "uncoded_filing");
  assert.ok(uncoded, "the filing rows #948's own tenancy leaves behind are still projected");
  assert.deepEqual(
    Object.keys(mine).sort(),
    Object.keys(uncoded).sort(),
    "the new kind reuses the EXISTING row shape unchanged — no key more, no key fewer",
  );
});

// ---------------------------------------------------------------------------
// S10 — the prepayment lane is UNTOUCHED (AC7).
//
// "A tenancy paid a year up front is not this lane's business: it is a prepayment and goes to the
// amortisation lane, where the service period stays person-stated and this ticket changes
// nothing about that." (the brief.) These cells prove the negative the way a negative has to be
// proven: by driving the OTHER lane's own door and seeing it still refuse.
// ---------------------------------------------------------------------------

const PREPAYMENTS = "1130";

const shaOf = async (documentId) =>
  (await rootQuery("select sha256 from clara.documents where id=$1", [documentId])).rows[0].sha256;

const prepaymentSchedule = async (client, entry) =>
  (
    await rootQuery("select clara.prepayment_schedule_v1($1::uuid,$2::uuid) as s", [client, entry])
  ).rows[0].s;

test("S10 · a tenancy prepaid a year up front does NOT amortise from the contract's printed term", async (t) => {
  if (unready(t)) return;
  const sub = world.users.alice;
  const { client, doc } = await tenancyFor(sub, { framework: "MPERS" });
  await recordProposed(sub, client, doc.documentId);
  await upsertAccount(sub, { client, code: PREPAYMENTS, name: "Prepayments", type: "asset", opKey: opk949("coa") });
  const firm = await firmOf(client);
  await fiscalYear(firm, client, { startsOn: "2026-01-01", endsOn: "2026-12-31", status: "open", owner: sub });

  // THE TERM IS RECORDED IN THIS LANE'S OWN RECORD: 2026-01-05 to 2028-01-04, read off the page.
  const terms = await getTerms(sub, doc.documentId);
  assert.equal(byKey(terms.terms, "term_start").term_date, TERM_START, "mandatory setup: the contract term is on file");
  assert.equal(byKey(terms.terms, "term_end").term_date, TERM_END);

  // A year of rent paid up front, booked against the agreement itself.
  const yearCents = RENT_CENTS * 12;
  const drafted = await draftEntry(human(sub), {
    client, resolution: await freshResolution(sub, client), postingDate: "2026-01-06",
    memo: "twelve months' rent paid in advance",
    document: doc.documentId, sha256: await shaOf(doc.documentId),
    lines: [
      { account_code: PREPAYMENTS, debit_cents: yearCents, credit_cents: 0, description: "rent in advance" },
      { account_code: BANKCOA, debit_cents: 0, credit_cents: yearCents, description: "bank" },
    ],
    opKey: opk949("prepay-draft"),
  });
  const token = (await rootQuery("select revision_token from clara.journal_entries where id=$1", [drafted.entry_id])).rows[0].revision_token;
  await approveEntry(world.users.bob, { entry: drafted.entry_id, expectedRevision: token, opKey: opk949("prepay-approve") });

  const schedule = await prepaymentSchedule(client, drafted.entry_id);
  assert.equal(
    schedule.refusal,
    "prepayment_term_underivable",
    `the amortisation lane still refuses: ${JSON.stringify(schedule)}`,
  );
  assert.equal(
    schedule.missing,
    "document_service_periods",
    "…naming the person-stated fact it is missing, NOT the contract term this lane recorded",
  );
  assert.equal(
    (await rootQuery(
      "select count(*)::int as n from clara.document_service_periods where document_id=$1",
      [doc.documentId],
    )).rows[0].n,
    0,
    "and no service period was born from the agreement's printed term",
  );
});

test("S10 · once a PERSON states the service period, the schedule derives — the rule is untouched, not bypassed", async (t) => {
  if (unready(t)) return;
  const sub = world.users.alice;
  const { client, doc } = await tenancyFor(sub, { framework: "MPERS" });
  await recordProposed(sub, client, doc.documentId);
  await upsertAccount(sub, { client, code: PREPAYMENTS, name: "Prepayments", type: "asset", opKey: opk949("coa") });
  const firm = await firmOf(client);
  await fiscalYear(firm, client, { startsOn: "2026-01-01", endsOn: "2026-12-31", status: "open", owner: sub });
  const yearCents = RENT_CENTS * 12;
  const drafted = await draftEntry(human(sub), {
    client, resolution: await freshResolution(sub, client), postingDate: "2026-01-06",
    memo: "twelve months' rent paid in advance",
    document: doc.documentId, sha256: await shaOf(doc.documentId),
    lines: [
      { account_code: PREPAYMENTS, debit_cents: yearCents, credit_cents: 0, description: "rent in advance" },
      { account_code: BANKCOA, debit_cents: 0, credit_cents: yearCents, description: "bank" },
    ],
    opKey: opk949("prepay2-draft"),
  });
  const token = (await rootQuery("select revision_token from clara.journal_entries where id=$1", [drafted.entry_id])).rows[0].revision_token;
  await approveEntry(world.users.bob, { entry: drafted.entry_id, expectedRevision: token, opKey: opk949("prepay2-approve") });

  // The estate's OWN door, unchanged by this ticket. The person states the twelve months they
  // actually paid for — which is NOT the tenancy's twenty-four-month term.
  await humanQuery(
    sub,
    namedCall("record_document_service_period", [
      { name: "p_document" }, { name: "p_period_start" }, { name: "p_period_end" },
      { name: "p_basis" }, { name: "p_op_key" },
    ]),
    // Twelve months, INSIDE the fiscal year the payment sits in — and twelve, not the
    // twenty-four the tenancy prints.
    [doc.documentId, "2026-01-01", "2026-12-31", "twelve months paid in advance under clause 3", opk949("sp")],
  );

  const schedule = await prepaymentSchedule(client, drafted.entry_id);
  assert.equal(schedule.refusal, undefined, `the schedule derives: ${JSON.stringify(schedule).slice(0, 300)}`);
  assert.equal(schedule.period_count, 12, "twelve months, from the person's own statement");
  assert.equal(schedule.period_lines.length, 12);
  assert.equal(schedule.period_lines[0].period_start, "2026-01-01");
  assert.equal(schedule.term_start, "2026-01-01", "the term is the PERSON'S, read off their own record");
  assert.equal(schedule.term_end, "2026-12-31");
  assert.notEqual(schedule.period_count, 24, "…never the twenty-four months the contract prints");
  assert.notEqual(schedule.term_end, TERM_END);
});

test("S10 · no body this migration mints ever writes clara.document_service_periods", async (t) => {
  if (unready(t)) return;
  const offenders = (
    await rootQuery(
      `select p.oid::regprocedure::text as sig
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'clara'
          and (p.proname like 'contract@_%' escape '@' or p.proname like '%tenancy%'
               or p.proname like '%rent_%' or p.proname like '%_contract_term%')
          and p.prosrc ilike '%document_service_periods%'
        order by 1`,
    )
  ).rows;
  assert.deepEqual(
    offenders,
    [],
    "this lane cannot weaken the person-stated service period, because no body of it names that table at all",
  );
});

// ---------------------------------------------------------------------------
// S10 — the fix round's own walls, each DRIVEN through the real doors.
// ---------------------------------------------------------------------------

test("S10 · reversing ONE month of rent leaves an earlier unpaid month exactly where it was (ADV-02)", async (t) => {
  if (unready(t)) return;
  const sub = world.users.alice;
  const { client } = await runningTenancy(sub);
  const feb = await postRentMonth(sub, client, { postingDate: "2026-02-05", memo: "February rent" });
  const mar = await postRentMonth(sub, client, { postingDate: "2026-03-05", memo: "March rent" });

  const before = await unsettledRows(client);
  assert.deepEqual(before.map((r) => [r.entry_id, Number(r.unsettled_cents)]),
    [[feb, RENT_CENTS], [mar, RENT_CENTS]], "both months are open before anything is reversed");

  // THE ACT: reverse MARCH through the estate's own door. The mirror carries Dr <payable>, and
  // a mirror is not a payment.
  const rev = (await humanQuery(
    sub,
    namedCall("reverse_entry", [{ name: "p_entry" }, { name: "p_reason" }, { name: "p_op_key" }]),
    [mar, "raised in error", opk949("rev")],
  )).rows[0].result;
  assert.equal(rev.status, "approved");

  const after = await unsettledRows(client);
  assert.deepEqual(after.map((r) => [r.entry_id, Number(r.unsettled_cents)]), [[feb, RENT_CENTS]],
    "FEBRUARY IS STILL UNPAID: the reversed month leaves the read, and its mirror pays nothing");
  const offered = await rentCandidates(sub, client);
  assert.equal(offered.filter((r) => r.entry_id === feb).length, 1, "…and February is still offered");
});

test("S10 · two live rent plans may not share one payable account, and each tenancy keeps its own months (ADV-03)", async (t) => {
  if (unready(t)) return;
  const sub = world.users.alice;
  const first = await runningTenancy(sub);
  const client = first.client;

  // A SECOND tenancy for the SAME client, read and recorded the ordinary way.
  const second = await readTenancy(sub, client, {});
  await recordProposed(sub, client, second.documentId);

  const refused = await caught(() => confirmPlan(sub, { client, document: second.documentId }));
  assert.ok(refused, "the default payable is already another tenancy's — the door must refuse");
  assert.equal(refused.code, "CLR10");
  const d = detailOf(refused);
  assert.equal(d.reason, "payable_account_in_use");
  assert.equal(d.payable_account_code, PAYABLE_ACCOUNT);
  assert.equal(d.document_id, first.doc.documentId, "…and it names the tenancy that already holds it");

  // THE REMEDY IS THE ACCOUNTANT'S OWN CHOICE: its own liability account.
  await upsertAccount(sub, { client, code: "2051", name: "Rent Payable — unit B", type: "liability", opKey: opk949("coa2") });
  const ok = await confirmPlan(sub, { client, document: second.documentId, payableAccount: "2051" });
  assert.ok(ok.plan_id, "a second tenancy on its OWN payable account is admitted");

  // …and the two plans' months never mix: one row per live plan, each on its own account.
  const a = await postRentMonth(sub, client, { postingDate: "2026-02-05", memo: "unit A February" });
  const drafted = await draftEntry(human(sub), {
    client, resolution: await freshResolution(sub, client), postingDate: "2026-02-05", memo: "unit B February",
    lines: [
      { account_code: RENT_ACCOUNT, debit_cents: RENT_CENTS, credit_cents: 0, description: "unit B" },
      { account_code: "2051", debit_cents: 0, credit_cents: RENT_CENTS, description: "unit B" },
    ],
    opKey: opk949("unitb-draft"),
  });
  const tok = (await rootQuery("select revision_token from clara.journal_entries where id=$1", [drafted.entry_id])).rows[0].revision_token;
  await approveEntry(world.users.bob, { entry: drafted.entry_id, expectedRevision: tok, opKey: opk949("unitb-approve") });

  const rows = await unsettledRows(client);
  assert.equal(rows.length, 2, `one open month per tenancy: ${JSON.stringify(rows)}`);
  const byEntry = Object.fromEntries(rows.map((r) => [r.entry_id, r]));
  assert.equal(byEntry[a].document_id, first.doc.documentId, "unit A's month is attributed to unit A's agreement");
  assert.equal(byEntry[a].payable_account_code, PAYABLE_ACCOUNT);
  assert.equal(byEntry[drafted.entry_id].document_id, second.documentId, "unit B's month is attributed to unit B's agreement");
  assert.equal(byEntry[drafted.entry_id].payable_account_code, "2051");
});

test("S10 · MPERS over TEN YEARS ASKS for the finance-vs-operating classification (ADV-05)", async (t) => {
  if (unready(t)) return;
  const sub = world.users.alice;

  // A THIRTY-YEAR ground lease, MPERS. The first cut drafted it silently as a rent expense.
  const long = await tenancyFor(sub, { months: "360", framework: "MPERS" });
  await recordProposed(sub, long.client, long.doc.documentId);
  const t360 = await treatmentOf(long.client, long.doc.documentId);
  assert.equal(t360.drafts, false, "a 30-year MPERS lease is not straight-lined without a person deciding");
  assert.equal(t360.reason, "mpers_lease_classification");
  assert.equal(t360.standard, "MPERS Section 20");
  assert.match(t360.question, /FINANCE lease/, "the question names the classification the standard makes the accountant establish");
  assert.match(t360.question, /ten years or more/, "…and says why it is being asked HERE and not on a two-year tenancy");
  assert.match(t360.question, /economic life/);
  assert.match(t360.basis, /CLASSIFIES a lease first/, "and the written basis says so too");

  // …and the confirm door then DEMANDS the written judgement rather than disabling the act
  // (standing owner ruling: a compliance gate prompts, it never disables).
  const refused = await caught(() => confirmPlan(sub, { client: long.client, document: long.doc.documentId }));
  assert.ok(refused);
  assert.equal(detailOf(refused).reason, "professional_judgement_required");
  const ok = await confirmPlan(sub, {
    client: long.client, document: long.doc.documentId,
    judgement: "Operating: the 30-year term is well short of the building's remaining economic life and the payments are far below its fair value.",
  });
  assert.ok(ok.plan_id, "with the judgement written down, the plan starts");

  // AN ORDINARY TENANCY is unchanged: below ten years the operating reading is not in doubt,
  // and asking for a written classification on every two-year shoplot would be noise, not care.
  const short = await tenancyFor(sub, { months: "24", framework: "MPERS" });
  await recordProposed(sub, short.client, short.doc.documentId);
  const t12 = await treatmentOf(short.client, short.doc.documentId);
  assert.equal(t12.drafts, true, "a two-year MPERS tenancy still drafts");
  assert.equal(t12.reason, null);
  assert.equal(t12.standard, "MPERS Section 20");
});

test("S10 · one coded deposit does not declare a second deposit coded (ADV-06)", async (t) => {
  if (unready(t)) return;
  const sub = world.users.alice;
  const first = await runningTenancy(sub);
  const client = first.client;

  // A SECOND tenancy, so the client carries TWO recorded deposits against one 1120 account.
  const second = await readTenancy(sub, client, {});
  await recordProposed(sub, client, second.documentId);

  const offers0 = await depositCoding(sub, client);
  assert.equal(offers0.length, 2, `two recorded deposits: ${JSON.stringify(offers0.map((o) => o.document_id))}`);
  assert.deepEqual(offers0.map((o) => o.already_coded), [false, false], "neither is coded yet");

  // Code ONE of them, by hand, the ordinary way.
  const drafted = await draftEntry(human(sub), {
    client, resolution: await freshResolution(sub, client), postingDate: "2026-01-06", memo: "deposit paid, unit A",
    lines: [
      { account_code: DEPOSITS_PAID, debit_cents: DEPOSIT_CENTS, credit_cents: 0, description: "deposit" },
      { account_code: BANKCOA, debit_cents: 0, credit_cents: DEPOSIT_CENTS, description: "bank" },
    ],
    opKey: opk949("dep-draft"),
  });
  const tok = (await rootQuery("select revision_token from clara.journal_entries where id=$1", [drafted.entry_id])).rows[0].revision_token;
  await approveEntry(world.users.bob, { entry: drafted.entry_id, expectedRevision: tok, opKey: opk949("dep-approve") });

  const offers1 = await depositCoding(sub, client);
  assert.equal(offers1.length, 2);
  assert.deepEqual(offers1.map((o) => o.already_coded), [true, false],
    "the OLDEST deposit takes the balance; the second is still owed its own entry and still offered");
  assert.equal(Number(offers1[0].coded_cents), DEPOSIT_CENTS);
  assert.equal(Number(offers1[1].coded_cents), 0);
  assert.equal(Number(offers1[1].deposits_account_balance_cents), DEPOSIT_CENTS,
    "…and the row says what the ACCOUNT holds as well as what this deposit was allocated");
  assert.equal(offers1[0].coded_basis, "account_balance_fifo");
  assert.equal(Number(offers1[0].deposits_sharing_account), 2);
});

test("S10 · a HIGH-STAKES rent settlement is left a draft for a distinct checker (ADV-04)", async (t) => {
  if (unready(t)) return;
  const sub = world.users.alice;
  const { client, bank } = await runningTenancy(sub);
  const entry = await postRentMonth(sub, client, { postingDate: "2026-02-05" });
  const lines = await bankStatement(sub, { client, bank, specs: [rentLine("2026-02-07")] });

  const firm = await firmOf(client);
  const restore = (await rootQuery("select high_stakes_amount_cents as v from clara.firms where id=$1", [firm])).rows[0].v;
  // RM1,000: an ordinary firm floor, and commercial rent clears it every month.
  await rootQuery("update clara.firms set high_stakes_amount_cents=100000 where id=$1", [firm]);
  try {
    const checkers = (await rootQuery("select clara.eligible_checker_count($1)::int as n", [firm])).rows[0].n;
    assert.ok(checkers >= 2, "the premise: a second pair of eyes is available in this firm");

    const out = await settleRent(sub, { client, entry, line: lines[0].id });
    assert.equal(out.status, "awaiting_checker", "the door does not self-approve a high-stakes entry");
    assert.equal(out.reason, "high_stakes_needs_checker");
    assert.equal(out.match_id, null);
    const e = (await rootQuery(
      "select status, checker_actor, self_approval_attestation from clara.journal_entries where id=$1",
      [out.entry_id])).rows[0];
    assert.equal(e.status, "draft");
    assert.equal(e.checker_actor, null);
    assert.equal(e.self_approval_attestation, null);

    const open = await unsettledRows(client);
    assert.equal(open.length, 1, "the month stays open by the LEDGER until a checker approves — nothing is dark");

    const tok = (await rootQuery("select revision_token from clara.journal_entries where id=$1", [out.entry_id])).rows[0].revision_token;
    await approveEntry(world.users.bob, { entry: out.entry_id, expectedRevision: tok, opKey: opk949("hs-check") });
    assert.deepEqual(await unsettledRows(client), [], "a distinct checker finishes it through the ordinary door");
  } finally {
    await rootQuery("update clara.firms set high_stakes_amount_cents=$2 where id=$1", [firm, restore]);
  }
});
