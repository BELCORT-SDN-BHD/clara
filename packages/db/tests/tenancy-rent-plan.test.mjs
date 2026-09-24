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
async function readTenancy(sub, client, { answers = {} } = {}) {
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
      JSON.stringify({ input_pin: sha, prompt_hash: "p949-vision", envelope: envelope({ channel: "vision", answers }) }),
      1,
    ])
  ).rows[0].receipt;
  assert.equal(receipt.status, "done", `mandatory setup: the tenancy read settled (got ${JSON.stringify(receipt)})`);
  return { ...doc, firm, client, ocrExtractionId: ocr, textExtractionId: receipt.text_extraction_id };
}

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
