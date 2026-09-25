// #1137 [0353_tenancy_agent_twins_obo_confirmations.sql] — THE MODEL LANE'S ENTRANCE TO THE
// TENANCY LANE: six agent-granted READ twins, and TWO on-behalf-of CONFIRMATION twins.
//
// WHAT THIS FILE IS ABOUT. #949's successor contract (`reports/wave4-lane01-ticket949.md`) names
// four chat tools — `read_tenancy_terms`, `confirm_tenancy_rent_plan`,
// `confirm_tenancy_rent_plan_revision` and `read_rent_settlement_candidates` — whose doors are all
// `clara_authenticated` only. CUT-PLAN.md §1.4 (class C, entries C4–C7) DEFERRED all four for
// exactly that reason, and asked for an owner ruling on the two CONFIRMATIONS because they are
// acts a person takes. The ruling of 2026-09-25 on #1137 says YES: Clara may confirm a tenancy
// rent plan on a bookkeeper's behalf from the conversation, as an OBO twin in #915's shape — the
// person still confirms and the act is recorded as theirs.
//
// THE SEAMS, named up front (WORK-ORDER rule 4). No cell sits anywhere else.
//   S1. `clara.wake_get_contract_terms(p_document uuid)` — the model lane's door onto #949's
//       recorded-terms read (AC1). Viewer-floored in the human lane; bookkeeper+ here, because
//       that is the only standing `clara.mint_wake_credential` will mint.
//   S2. `clara.wake_get_tenancy_rent_plan_draft(p_document uuid)` — the treatment branch, the
//       drafted plan and whether a person has already confirmed one (AC2).
//   S3. `clara.wake_propose_contract_terms(p_document uuid)` — what Clara CAN read off #948's
//       banked reading, and what she cannot (AC1).
//   S4. `clara.wake_get_rent_settlement_candidates(p_client uuid)` and
//       `clara.wake_get_tenancy_deposit_coding(p_client uuid)` — the open rent months with their
//       candidate bank lines, and the recorded deposits with their 1120 coding offer (AC4, AC5).
//   S5. `clara.wake_get_tenancy_escalation_revision(p_document uuid)` — the revision a recorded
//       escalation asks for, which is what a person must see BEFORE confirming one (AC6).
//   S6. `clara.confirm_tenancy_rent_plan_for(p_client, p_author, p_document, p_rent_account,
//       p_payable_account, p_judgement, p_op_key)` — the OBO twin of #949's confirmation.
//   S7. `clara.confirm_tenancy_rent_plan_revision_for(p_client, p_author, p_document,
//       p_judgement, p_op_key)` — the OBO twin of the escalation's confirmation.
//   S8. The TEN human doors of 0300 and `clara.revise_accounting_plan` — same signature, same
//       ACL, same answers after the split. Their own batteries (tenancy-rent-plan.test.mjs,
//       accounting-plans.test.mjs, accrual-correction.test.mjs) are this change's real regression
//       proof and run unchanged.
//   S9. The ACL and the wake-kind allowlist — DRIVEN role by role, never read off the catalog.
//
// WHAT IT DELIBERATELY DOES NOT PROVE. The whole of #949's behaviour: that is
// tenancy-rent-plan.test.mjs's own cells. This file proves the NEW lanes and the ONE property
// every split must never lose — that both entrances answer from the same body.
//
// FRONTIER-GATED on the `tenancy_agent_twins_obo_confirmations$` stable stem, the
// agent-read-twins-payroll-agreement.test.mjs idiom: a package-wide sweep preloads this file's
// pre-integration gate module and skips LOUDLY on a chain below 0353; a FOCUSED run sets nothing
// and fails, because a skip is not evidence.
//
// Serial discipline: --test-concurrency=1 (shared rig convention).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, humanQuery, roleQuery, wakeQuery, asWake, namedCall, human,
  ensureReady, endPool, buildWorld, createClient, upsertAccount, draftEntry, approveEntry,
  freshResolution, mintWake, assertRaises, ROLES, PG,
} from "./rig-fixtures.mjs";
import { firmOf, filedDocument, seedExtraction, seedRegion, enqueueInvoiceFacts, claimTask } from "./a21-helpers.mjs";
import { consentEvidenceDoc, grantPurpose, activatePurpose } from "./wave-b/wb-0020-helpers.mjs";
import { addBankAccount, enterStatement } from "./x38-match-fixtures.mjs";
import { deactivateMember } from "./work-cancel-fixtures.mjs";
import { reactivateMember } from "./accounting-plans-fixtures.mjs";

const STEM = "tenancy_agent_twins_obo_confirmations$";

let ready = false;
let world = null;
let lane = null;

async function lanePresent() {
  if (lane !== null) return lane;
  const r = await rootQuery(
    "select count(*)::int as n from clara.schema_migrations where version ~ $1", [STEM]);
  lane = Number(r.rows[0].n) > 0;
  return lane;
}

before(async () => {
  ready = await ensureReady();
  if (!ready) return;
  if (!(await lanePresent())) {
    if (process.env.CLARA_ALLOW_MISSING_TENANCY_AGENT_TWINS !== "1") {
      throw new Error(
        `#1137: no migration matching /${STEM}/ is applied to this database and `
        + "CLARA_ALLOW_MISSING_TENANCY_AGENT_TWINS is unset — this is a FOCUSED run and must fail "
        + "loudly rather than skip. Apply 0353_tenancy_agent_twins_obo_confirmations.sql, or "
        + "preload ./tests/tenancy-agent-twins-preintegration-gate.mjs for an estate sweep against "
        + "a pre-0353 chain.");
    }
    ready = false;
    return;
  }
  world = await buildWorld();
  // This battery drives #948's real contract-facts lane, which mints one witness-pair task per
  // tenancy inside ONE firm. 0296's per-lane concurrency wall defaults to 2 RUNNING at once
  // (CLR18); raised for the fixture firms alone, exactly as tenancy-rent-plan.test.mjs does.
  for (const firm of [world.firms.A, world.firms.B]) {
    await rootQuery(
      `insert into clara.firm_document_limits(firm_id, llm_witness_concurrency)
         values ($1, 50)
       on conflict (firm_id) do update set llm_witness_concurrency = 50`,
      [firm],
    );
  }
});

after(async () => {
  await endPool();
});

function unready(t) {
  if (!ready) {
    t.skip(`#1137 lane absent or rig not ready (no ${STEM} migration applied)`);
    return true;
  }
  return false;
}

const ALICE = () => world.users.alice; // owner, firm A — the maker
const BOB = () => world.users.bob;     // bookkeeper, firm A — the OBO human the chat lane acts for
const CAROL = () => world.users.carol; // viewer, firm A — the reads' own human floor
const DAVE = () => world.users.dave;   // owner, firm B — the other firm entirely
const FIRM_A = () => world.firms.A;

// ---------------------------------------------------------------------------
// THE WORKED EXAMPLE — #949's OWN hand-worked tenancy, reused verbatim from
// tenancy-rent-plan.test.mjs as an independent source of truth (WORK-ORDER rule 4: never
// re-derived from what the code computes). A two-year shoplot tenancy:
//
//   monthly rent   RM 3,600.00  =   360_000 cents
//   deposit        RM 7,200.00  =   720_000 cents   (two months' rent)
//   signed         2026-01-05
//   term           24 months, so the last day is 2028-01-04 (inclusive)
//   escalation     RM 3,960.00 from 2027-01-05, recorded by a person off the side letter
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
const opk1137 = (tag) => `p1137-${tag}-${Date.now()}-${++opSeq}`;

let clientSeq = 0;
async function freshClient(sub) {
  clientSeq += 1;
  return createClient(sub, { name: `p1137-cli-${clientSeq}-${Date.now()}`, opKey: opk1137(`client${clientSeq}`) });
}

async function seedTenancyChart(sub, client) {
  for (const a of TENANCY_CHART) {
    await upsertAccount(sub, { client, code: a.code, name: a.name, type: a.type, opKey: opk1137("coa") });
  }
  await upsertAccount(sub, { client, code: BANKCOA, name: "Maybank current (p1137)", type: "asset", opKey: opk1137("bankcoa") });
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
        input_pin: ocr, prompt_hash: "p1137-text", envelope: envelope({ channel: "text", answers }),
        citations: [{ field_path: "contract.agreement.instalment_amount", region_idx: 1 }],
      }),
      JSON.stringify({ input_pin: sha, prompt_hash: "p1137-vision", envelope: envelope({ channel: "vision", answers }) }),
      1,
    ])
  ).rows[0].receipt;
  assert.equal(receipt.status, "done", `mandatory setup: the tenancy read settled (got ${JSON.stringify(receipt)})`);
  return { ...doc, firm, client };
}

/** The client's reporting framework, through the estate's OWN knowledge door. */
async function setFramework(sub, client, code) {
  await humanQuery(
    sub,
    `select clara.capture_knowledge(p_knowledge_key => 'reporting_framework',
        p_value => $1::jsonb, p_basis => $2, p_op_key => $3,
        p_scope_kind => 'client', p_client => $4, p_source_kind => 'user_statement')`,
    [
      JSON.stringify({ framework_code: code, framework_label: `${code} (p1137 fixture)` }),
      "the engagement letter records the framework these accounts are prepared on",
      opk1137("framework"),
      client,
    ],
  );
}

const DOC_SPECS = [{ name: "p_document", cast: "uuid" }];
const CLIENT_SPECS = [{ name: "p_client", cast: "uuid" }];

/** A human read, at the door's own floor. */
const humanRead = async (fn, sub, arg, specs = DOC_SPECS) =>
  (await humanQuery(sub, namedCall(fn, specs), [arg])).rows[0].result;

/** The model lane's read: an `interactive` wake credential minted ON BEHALF OF a live
 *  bookkeeper+, bound txn-locally, on the READ role the chat lane's `readScoped` runs as. */
const wakeRead = async (fn, secret, arg, specs = DOC_SPECS) =>
  (await wakeQuery(ROLES.agentRo, secret, namedCall(fn, specs), [arg])).rows[0].result;

async function chatCredential(firm = null, onBehalfOf = null) {
  return mintWake({ kind: "interactive", firm: firm ?? FIRM_A(), onBehalfOf: onBehalfOf ?? BOB() });
}

const recordTerms = async (sub, { client, document, terms, opKey }) =>
  (await humanQuery(
    sub,
    namedCall("record_contract_terms", [{ name: "p_client" }, { name: "p_document" }, { name: "p_terms" }, { name: "p_op_key" }]),
    [client, document, JSON.stringify(terms), opKey ?? opk1137("terms")],
  )).rows[0].result;

/** Records the four terms Clara proposed, verbatim, as a person confirming what she read. */
async function recordProposed(sub, client, document, extra = []) {
  const proposal = await humanRead("propose_contract_terms", sub, document);
  const terms = proposal.proposed.map((p) => ({ ...p }));
  return recordTerms(sub, { client, document, terms: [...terms, ...extra] });
}

/** A tenancy read through #948's lane, with its chart seeded and its framework recorded. */
async function tenancyFor(sub, { framework = "MPERS" } = {}) {
  const client = await freshClient(sub);
  await seedTenancyChart(sub, client);
  if (framework) await setFramework(sub, client, framework);
  const doc = await readTenancy(sub, client);
  return { client, doc };
}

// ===========================================================================================
// S1 — THE RECORDED TERMS REACH THE MODEL LANE AS THE SAME ANSWER, FROM THE SAME BODY.
// ===========================================================================================

test("p1137.terms.same_answer — the model lane's door answers, for one tenancy, EXACTLY the recorded-terms envelope the human door answers", async (t) => {
  if (unready(t)) return;
  const { client, doc } = await tenancyFor(ALICE());
  await recordProposed(ALICE(), client, doc.documentId);

  const humanAnswer = await humanRead("get_contract_terms", CAROL(), doc.documentId);
  assert.equal(humanAnswer.terms.length, 4,
    `mandatory setup: #948's lane banked four readable terms (got ${JSON.stringify(humanAnswer.terms.map((x) => x.term_key))})`);

  const { secret } = await chatCredential();
  const machineAnswer = await wakeRead("wake_get_contract_terms", secret, doc.documentId);

  // WHOLE ENVELOPE, not merely "both non-empty": this read stores nothing and samples nothing,
  // so there is no per-call key that may legitimately differ. If these two ever diverge, a
  // person and Clara are quoting different terms of one agreement.
  assert.deepEqual(machineAnswer, humanAnswer,
    "the model lane's recorded terms differ from the viewer's own");
  const rent = machineAnswer.terms.find((x) => x.term_key === "monthly_rent");
  assert.ok(rent, "the monthly rent reaches the model lane at all");
  assert.equal(Number(rent.amount_cents), RENT_CENTS);
  assert.equal(rent.basis_kind, "document_region");
  assert.equal(machineAnswer.agreement_class, "tenancy");
  assert.equal(machineAnswer.client_id, client);
});

test("p1137.terms.tenant_wall — through firm A's credential, firm B's REAL tenancy answers exactly what an invented id answers, and the human door answers the same way", async (t) => {
  if (unready(t)) return;
  const theirs = await tenancyFor(DAVE());
  const invented = "00000000-0000-4000-8000-0000000011c7";
  const { secret } = await chatCredential();

  const a = await assertRaises("CLR11", () => wakeRead("wake_get_contract_terms", secret, theirs.doc.documentId),
    "firm B's real tenancy through firm A's credential");
  const b = await assertRaises("CLR11", () => wakeRead("wake_get_contract_terms", secret, invented),
    "an invented document id");
  assert.equal(
    a.message.replace(theirs.doc.documentId, "<doc>"),
    b.message.replace(invented, "<doc>"),
    "another firm's real tenancy and an invented id must be indistinguishable to this lane");

  // …and the viewer's own door answers the same way, so the split moved no wall.
  await assertRaises("CLR11", () => humanRead("get_contract_terms", CAROL(), theirs.doc.documentId),
    "the human door on another firm's tenancy");

  // THE OTHER FIRM'S OWN PEOPLE still read it — the wall is the firm, not the document.
  const mine = await humanRead("get_contract_terms", DAVE(), theirs.doc.documentId);
  assert.equal(mine.client_id, theirs.client, "firm B's owner still reads firm B's tenancy");
});

// ===========================================================================================
// S2/S3 — THE DRAFT AND THE PROPOSAL REACH THE MODEL LANE AS THE SAME ANSWERS.
// ===========================================================================================

test("p1137.draft.same_answer — the rent-plan draft the model lane reads is the viewer's own, treatment branch and all, under BOTH frameworks", async (t) => {
  if (unready(t)) return;
  const { secret } = await chatCredential();

  // MPERS + level rent: the ordinary case, where the branch DRAFTS.
  const mpers = await tenancyFor(ALICE(), { framework: "MPERS" });
  await recordProposed(ALICE(), mpers.client, mpers.doc.documentId);
  const mpersHuman = await humanRead("get_tenancy_rent_plan_draft", CAROL(), mpers.doc.documentId);
  const mpersMachine = await wakeRead("wake_get_tenancy_rent_plan_draft", secret, mpers.doc.documentId);
  assert.deepEqual(mpersMachine, mpersHuman, "the model lane's draft differs from the viewer's own");
  assert.equal(mpersMachine.treatment.drafts, true, `MPERS level rent drafts: ${JSON.stringify(mpersMachine.treatment)}`);
  assert.equal(mpersMachine.treatment.standard, "MPERS Section 20");
  assert.equal(Number(mpersMachine.plan.monthly_rent_cents), RENT_CENTS);
  assert.equal(mpersMachine.confirmed, false, "nothing is confirmed by reading");

  // MFRS over twelve months: the branch ASKS, and the QUESTION is what must reach the model lane —
  // a plan does not, because a basis on screen is an offer to post it.
  const mfrs = await tenancyFor(ALICE(), { framework: "MFRS" });
  await recordProposed(ALICE(), mfrs.client, mfrs.doc.documentId);
  const mfrsHuman = await humanRead("get_tenancy_rent_plan_draft", CAROL(), mfrs.doc.documentId);
  const mfrsMachine = await wakeRead("wake_get_tenancy_rent_plan_draft", secret, mfrs.doc.documentId);
  assert.deepEqual(mfrsMachine, mfrsHuman, "the model lane's asking branch differs from the viewer's own");
  assert.equal(mfrsMachine.treatment.drafts, false, "MFRS over twelve months may not be drafted");
  assert.equal(mfrsMachine.treatment.reason, "mfrs_lease_over_twelve_months");
  assert.equal(mfrsMachine.plan, null, "…and no plan travels with a question");
  assert.match(mfrsMachine.treatment.question, /right-of-use asset/i,
    "the question the model must ask the accountant is the branch's own");
});

test("p1137.proposal.same_answer — what Clara CAN read off the banked tenancy, and what she cannot, reach the model lane unchanged", async (t) => {
  if (unready(t)) return;
  const { client, doc } = await tenancyFor(ALICE());
  const { secret } = await chatCredential();

  const humanAnswer = await humanRead("propose_contract_terms", CAROL(), doc.documentId);
  const machineAnswer = await wakeRead("wake_propose_contract_terms", secret, doc.documentId);
  assert.deepEqual(machineAnswer, humanAnswer, "the model lane's proposal differs from the viewer's own");

  const rent = machineAnswer.proposed.find((x) => x.term_key === "monthly_rent");
  assert.ok(rent, "the monthly rent is proposed");
  assert.equal(Number(rent.amount_cents), RENT_CENTS);
  assert.deepEqual(machineAnswer.proposed.map((x) => x.term_key).sort(),
    ["deposit", "monthly_rent", "term_end", "term_start"],
    "four terms are proposed and no more");
  // THE ONE THE MODEL MUST NOT GUESS AT: an escalation has no question in the frozen
  // questionnaire at all, and the proposal says so out loud rather than staying silent.
  const escalation = machineAnswer.not_read.find((x) => x.term_key === "escalation");
  assert.ok(escalation, "the escalation is named among what could NOT be read");
  assert.equal(escalation.reason, "no_question_in_the_questionnaire");
  assert.equal(machineAnswer.proposed.find((x) => x.term_key === "escalation"), undefined,
    "…and it is nowhere in the proposed set");
});

// ===========================================================================================
// S4 — THE OPEN RENT MONTHS AND THE DEPOSIT OFFER.
// ===========================================================================================

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
    opKey: opk1137("rent-draft"),
  });
  const token = (await rootQuery("select revision_token from clara.journal_entries where id=$1", [drafted.entry_id])).rows[0].revision_token;
  await approveEntry(BOB(), { entry: drafted.entry_id, expectedRevision: token, opKey: opk1137("rent-approve") });
  return drafted.entry_id;
}

const confirmPlan = async (sub, { client, document, rentAccount = null, payableAccount = null, judgement = null, opKey = null }) =>
  (await humanQuery(
    sub,
    namedCall("confirm_tenancy_rent_plan", [
      { name: "p_client" }, { name: "p_document" }, { name: "p_rent_account" },
      { name: "p_payable_account" }, { name: "p_judgement" }, { name: "p_op_key" },
    ]),
    [client, document, rentAccount, payableAccount, judgement, opKey ?? opk1137("confirm")],
  )).rows[0].result;

async function freshBank(sub, client) {
  const acct = await addBankAccount(sub, { client, coaAccountCode: BANKCOA, accountNumber: `9491${Date.now()}` });
  return acct.bank_account_id ?? acct.id;
}

/** A confirmed tenancy with a registered bank account, ready to post and settle rent against. */
async function runningTenancy(sub) {
  const { client, doc } = await tenancyFor(sub, { framework: "MPERS" });
  await recordProposed(sub, client, doc.documentId);
  const receipt = await confirmPlan(sub, { client, document: doc.documentId });
  const bank = await freshBank(sub, client);
  return { client, doc, bank, planId: receipt.plan_id, confirmationId: receipt.confirmation_id };
}

test("p1137.settlement.same_answer — the open rent months and every candidate bank line reach the model lane row for row, window and all", async (t) => {
  if (unready(t)) return;
  const { client, bank } = await runningTenancy(ALICE());
  await postRentMonth(ALICE(), client, { postingDate: "2026-02-05" });
  await enterStatement(ALICE(), {
    client, bankAccount: bank, keepPeriod: true,
    periodStart: "2026-02-01", periodEnd: "2026-02-28", opening: 5000000,
    specs: [{ entryDate: "2026-02-25", description: "RENTAL PAYMENT SRI DAMANSARA", amountCents: -RENT_CENTS }],
    opKey: opk1137("stmt"),
  });

  const humanAnswer = await humanRead("get_rent_settlement_candidates", BOB(), client, CLIENT_SPECS);
  const { secret } = await chatCredential();
  const machineAnswer = await wakeRead("wake_get_rent_settlement_candidates", secret, client, CLIENT_SPECS);

  assert.deepEqual(machineAnswer, humanAnswer, "the model lane's open rent months differ from the bookkeeper's own");
  assert.equal(machineAnswer.length, 1, `one open month: ${JSON.stringify(machineAnswer)}`);
  const month = machineAnswer[0];
  assert.equal(Number(month.unsettled_cents), RENT_CENTS);
  assert.equal(month.payable_account_code, PAYABLE_ACCOUNT);
  // THE WINDOW TRAVELS ON THE ROW (fix-round finding ADV-11): rent recognised on the 5th and paid
  // on the 25th is an ordinary Malaysian tenancy, and the model is never told less than was
  // searched.
  assert.equal(Number(month.candidate_window_days), 35);
  assert.equal(month.candidates.length, 1,
    `exactly one exact, in-window candidate reaches the model lane: ${JSON.stringify(month.candidates)}`);
  assert.equal(month.candidates[0].description, "RENTAL PAYMENT SRI DAMANSARA");
});

test("p1137.deposit.same_answer — the recorded deposit and its 1120 coding OFFER reach the model lane unchanged, with both figures on the row", async (t) => {
  if (unready(t)) return;
  const { client, doc } = await tenancyFor(ALICE());
  await recordProposed(ALICE(), client, doc.documentId);
  await freshBank(ALICE(), client);

  const humanAnswer = await humanRead("get_tenancy_deposit_coding", BOB(), client, CLIENT_SPECS);
  const { secret } = await chatCredential();
  const machineAnswer = await wakeRead("wake_get_tenancy_deposit_coding", secret, client, CLIENT_SPECS);

  assert.deepEqual(machineAnswer, humanAnswer, "the model lane's deposit offer differs from the bookkeeper's own");
  assert.equal(machineAnswer.length, 1, `one recorded deposit: ${JSON.stringify(machineAnswer)}`);
  const dep = machineAnswer[0];
  assert.equal(Number(dep.deposit_cents), DEPOSIT_CENTS);
  assert.equal(dep.proposed_account_code, "1120");
  assert.equal(dep.proposed_account_in_chart, true, "1120 Deposits Paid is in this client's chart");
  assert.equal(dep.already_coded, false, "signing does not say the money moved");
  // BOTH FIGURES TRAVEL (fix-round finding ADV-06): the account's own balance and THIS deposit's
  // FIFO share of it, so nobody -- person or model -- has to guess which is which.
  assert.equal(Number(dep.deposits_account_balance_cents), 0);
  assert.equal(dep.coded_basis, "account_balance_fifo");
  assert.equal(Number(dep.deposits_sharing_account), 1);
});

test("p1137.escalation.same_answer — the revision a recorded escalation asks for reaches the model lane before its date, and changes nothing", async (t) => {
  if (unready(t)) return;
  const { client, doc, planId } = await runningTenancy(ALICE());
  // Effective 30 days from today, so "before its effective date" is the case under test.
  const soon = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  await recordTerms(ALICE(), {
    client, document: doc.documentId,
    terms: [{
      term_key: "escalation",
      escalation: { effective_from: soon, new_amount_cents: ESCALATED_CENTS, printed_raw: "3,960.00" },
      basis_kind: "person_stated",
      basis: "clause 4(b) of the side letter raises the rent in the second year",
    }],
  });

  const humanAnswer = await humanRead("get_tenancy_escalation_revision", CAROL(), doc.documentId);
  const { secret } = await chatCredential();
  const machineAnswer = await wakeRead("wake_get_tenancy_escalation_revision", secret, doc.documentId);

  assert.deepEqual(machineAnswer, humanAnswer, "the model lane's escalation offer differs from the viewer's own");
  assert.equal(machineAnswer.pending, true, `the escalation is pending: ${JSON.stringify(machineAnswer)}`);
  assert.equal(Number(machineAnswer.current_cents), RENT_CENTS);
  assert.equal(Number(machineAnswer.new_cents), ESCALATED_CENTS);
  assert.equal(machineAnswer.proposed_revision.effective_from, soon);

  // READING IT CHANGED NOTHING: the plan still charges today's rent.
  const live = (await rootQuery(
    "select revision from clara.accounting_plan_revisions where plan_id=$1 and superseded_at is null",
    [planId])).rows[0];
  assert.equal(Number(live.revision), 1, "reading an escalation offer revised the plan");
});

test("p1137.reads.client_tenant_wall — the two client-scoped reads refuse another firm's REAL client exactly as they refuse an invented id, on both lanes", async (t) => {
  if (unready(t)) return;
  const theirs = await freshClient(DAVE());
  const invented = "00000000-0000-4000-8000-0000000011d7";
  const { secret } = await chatCredential();

  for (const fn of ["wake_get_rent_settlement_candidates", "wake_get_tenancy_deposit_coding"]) {
    const a = await assertRaises("CLR11", () => wakeRead(fn, secret, theirs, CLIENT_SPECS), `${fn}: firm B's real client`);
    const b = await assertRaises("CLR11", () => wakeRead(fn, secret, invented, CLIENT_SPECS), `${fn}: an invented id`);
    assert.equal(a.message, b.message, `${fn} must not be an existence oracle`);
    assert.equal(a.message, "client not in your firm", `${fn} must answer 0300's own sentence`);
  }
  for (const fn of ["get_rent_settlement_candidates", "get_tenancy_deposit_coding"]) {
    const h = await assertRaises("CLR11", () => humanRead(fn, BOB(), theirs, CLIENT_SPECS), `${fn}: the human door`);
    assert.equal(h.message, "client not in your firm", "…and the split moved no wall on the human door either");
  }
});

// ===========================================================================================
// S6 — THE ON-BEHALF-OF CONFIRMATION. Every cell here runs on a REAL `clara_runtime` connection,
// which is what `pools().withRuntime` gives a chat act tool, with NO request.jwt.claims at all.
// ===========================================================================================

const CONFIRM_FOR_SPECS = [
  { name: "p_client", cast: "uuid" }, { name: "p_author", cast: "uuid" },
  { name: "p_document", cast: "uuid" }, { name: "p_rent_account", cast: "text" },
  { name: "p_payable_account", cast: "text" }, { name: "p_judgement", cast: "text" },
  { name: "p_op_key", cast: "text" },
];

const confirmFor = async ({ client, author, document, rentAccount = null, payableAccount = null, judgement = null, opKey = null }) =>
  (await roleQuery(ROLES.runtime, namedCall("confirm_tenancy_rent_plan_for", CONFIRM_FOR_SPECS),
    [client, author, document, rentAccount, payableAccount, judgement, opKey ?? opk1137("obo-confirm")])
  ).rows[0].result;

async function caught(fn) {
  try { await fn(); return null; } catch (e) { return e; }
}
const detailOf = (e) => { try { return JSON.parse(e?.detail ?? "{}"); } catch { return {}; } };

const planRow = async (planId) =>
  (await rootQuery(
    `select p.status, p.kind, p.purpose, p.authority_kind, p.authority_ref, p.authorised_by,
            p.created_by, p.firm_id, p.client_id, p.authority_from::text as authority_from,
            r.frequency, r.day_rule, r.day_of_month, r.timezone, r.revision,
            r.effective_from::text as effective_from, r.effective_to::text as effective_to,
            r.basis, r.auto_reverse, r.reversal_day_rule, r.created_by as revision_created_by
       from clara.accounting_plans p
       join clara.accounting_plan_revisions r on r.plan_id = p.id and r.revision = p.current_revision
      where p.id = $1`, [planId])).rows[0];

const confirmationRow = async (id) =>
  (await rootQuery(
    `select firm_id, client_id, document_id, kind, monthly_rent_cents, rent_account_code,
            payable_account_code, term_start::text as term_start, term_end::text as term_end,
            professional_judgement, confirmed_by
       from clara.contract_plan_confirmations where id = $1`, [id])).rows[0];

const auditRows = async (firm, fn) =>
  (await rootQuery(
    "select actor, args from clara.audit_log where firm_id=$1 and fn=$2 order by at desc, id desc limit 5",
    [firm, fn])).rows;

const receiptsFor = async (firm, opKey) =>
  (await rootQuery("select fn, op_key from clara.op_receipts where firm_id=$1 and op_key like $2 order by fn",
    [firm, `${opKey}%`])).rows;

test("p1137.obo.confirms_as_the_named_bookkeeper — the chat lane confirms a rent plan on a named bookkeeper's behalf, and every record of the act names THEM", async (t) => {
  if (unready(t)) return;
  const { client, doc } = await tenancyFor(ALICE(), { framework: "MPERS" });
  await recordProposed(ALICE(), client, doc.documentId);

  const key = opk1137("obo-ok");
  const receipt = await confirmFor({ client, author: BOB(), document: doc.documentId, opKey: key });

  assert.ok(receipt.confirmation_id, `the OBO twin returned a receipt: ${JSON.stringify(receipt)}`);
  assert.ok(receipt.plan_id, "…with the plan it started");
  assert.equal(receipt.status, "active");
  assert.equal(receipt.document_id, doc.documentId);
  assert.equal(receipt.client_id, client);
  assert.equal(receipt.treatment.drafts, true, "the MPERS branch admitted the treatment");
  assert.equal(receipt.professional_judgement, null, "…so none was owed");
  // The occurrence COUNT the draft computed travels with the receipt: a 24-month tenancy posts
  // twenty-four months of rent, which is the worked example's own arithmetic and not the code's.
  assert.equal(Number(receipt.occurrences), 24,
    `the plan's occurrence count travels with the receipt: ${JSON.stringify(receipt.occurrences)}`);

  // THE ACT IS RECORDED AS THE NAMED PERSON'S — this is the whole of the owner's ruling.
  const cf = await confirmationRow(receipt.confirmation_id);
  assert.equal(cf.confirmed_by, BOB(), "the confirmation names the bookkeeper, not a machine");
  assert.equal(cf.firm_id, FIRM_A());
  assert.equal(cf.kind, "rent_plan");
  assert.equal(Number(cf.monthly_rent_cents), RENT_CENTS);
  assert.equal(cf.rent_account_code, RENT_ACCOUNT);
  assert.equal(cf.payable_account_code, PAYABLE_ACCOUNT);
  assert.equal(cf.term_start, TERM_START);
  assert.equal(cf.term_end, TERM_END);

  const plan = await planRow(receipt.plan_id);
  assert.equal(plan.authorised_by, BOB(), "the plan is authorised by the named bookkeeper");
  assert.equal(plan.created_by, BOB());
  assert.equal(plan.revision_created_by, BOB());
  assert.equal(plan.kind, "recurring_journal");
  assert.equal(plan.status, "active");
  assert.equal(plan.authority_kind, "explicit_instruction");
  assert.deepEqual(plan.authority_ref, { kind: "contract_confirmation", id: receipt.confirmation_id },
    "the plan cites the confirmation as its explicit instruction");
  assert.equal(plan.effective_from, TERM_START);
  assert.equal(plan.effective_to, TERM_END);
  assert.equal(plan.auto_reverse, false);
  assert.equal(plan.reversal_day_rule, null);

  // AND THE TRAIL SAYS WHICH ENTRANCE, so a firm can tell a conversation from the Contract page.
  const confirmAudit = (await auditRows(FIRM_A(), "confirm_tenancy_rent_plan"))[0];
  assert.equal(confirmAudit.actor, BOB(), "the audit actor is the named person");
  assert.equal(confirmAudit.args.via, "confirm_tenancy_rent_plan_for");
  const planAudit = (await auditRows(FIRM_A(), "create_accounting_plan"))[0];
  assert.equal(planAudit.actor, BOB());
  assert.equal(planAudit.args.via, "confirm_tenancy_rent_plan_for");
  assert.equal(planAudit.args.plan, receipt.plan_id);
});

test("p1137.obo.same_receipt_as_the_human_door — the two entrances produce the SAME receipt shape and the SAME plan on the same tenancy", async (t) => {
  if (unready(t)) return;
  const viaHuman = await tenancyFor(ALICE(), { framework: "MPERS" });
  await recordProposed(ALICE(), viaHuman.client, viaHuman.doc.documentId);
  const viaObo = await tenancyFor(ALICE(), { framework: "MPERS" });
  await recordProposed(ALICE(), viaObo.client, viaObo.doc.documentId);

  const h = await confirmPlan(BOB(), { client: viaHuman.client, document: viaHuman.doc.documentId });
  const o = await confirmFor({ client: viaObo.client, author: BOB(), document: viaObo.doc.documentId });

  assert.deepEqual(Object.keys(o).sort(), Object.keys(h).sort(),
    "the OBO receipt carries different keys from the human one");
  const hp = await planRow(h.plan_id);
  const op = await planRow(o.plan_id);
  for (const k of ["status", "kind", "authority_kind", "frequency", "day_rule", "day_of_month",
                   "timezone", "effective_from", "effective_to", "auto_reverse",
                   "reversal_day_rule", "revision"]) {
    assert.deepEqual(op[k], hp[k], `the two lanes' plans differ on ${k}`);
  }
  assert.deepEqual(op.basis, hp.basis, "the two lanes' plans post different journals");
  // `framework_record_id` names the knowledge row THIS client's framework was read from, so it
  // legitimately differs between two clients; everything else in the treatment must not.
  const treatmentOf = (r) => { const { framework_record_id: _drop, ...rest } = r.treatment; return rest; };
  assert.deepEqual(treatmentOf(o), treatmentOf(h), "the two lanes recorded different treatments");

  // THE ONE DIFFERENCE, and it is deliberate: the human lane's plan step is
  // clara.create_accounting_plan, which spends its own op key and leaves its own receipt; the OBO
  // lane's is clara._tenancy_plan_core, whose act is covered by the confirmation's own key.
  const hr = await receiptsFor(FIRM_A(), "");
  assert.ok(hr.some((r) => r.fn === "create_accounting_plan"),
    "the human lane left its plan-door receipt");
});

test("p1137.obo.refusals_match — every shared refusal answers the SAME sqlstate, the SAME sentence and the SAME typed detail on both entrances", async (t) => {
  if (unready(t)) return;

  async function bothRefuse(label, scene, over, expect) {
    const h = await caught(() => confirmPlan(BOB(), { ...scene, ...over, opKey: opk1137("par-h") }));
    const o = await caught(() => confirmFor({ ...scene, ...over, author: BOB(), opKey: opk1137("par-o") }));
    assert.ok(h, `${label}: the human door did NOT refuse`);
    assert.ok(o, `${label}: the OBO twin did NOT refuse`);
    assert.equal(o.code, h.code, `${label}: sqlstate differs (obo ${o.code} / human ${h.code})`);
    assert.equal(o.message, h.message, `${label}: the sentence differs`);
    assert.deepEqual(detailOf(o), detailOf(h), `${label}: the typed detail differs`);
    assert.equal(h.code, expect.code, `${label}: expected ${expect.code}`);
    assert.equal(detailOf(h).reason ?? null, expect.reason, `${label}: expected reason ${expect.reason}`);
    return h;
  }

  // 1 — A PLAN THAT CREDITS THE BANK double-counts the statement line that pays the rent.
  const bankScene = await tenancyFor(ALICE(), { framework: "MPERS" });
  await recordProposed(ALICE(), bankScene.client, bankScene.doc.documentId);
  await freshBank(ALICE(), bankScene.client);   // 1010 is now one of this client's OWN bank accounts
  const bank = await bothRefuse("plan_credits_bank_account",
    { client: bankScene.client, document: bankScene.doc.documentId },
    { payableAccount: BANKCOA }, { code: "CLR10", reason: "plan_credits_bank_account" });
  assert.equal(detailOf(bank).account_code, BANKCOA, "…and it names the account by code");

  // 2 — AN ACCOUNT THAT IS NOT IN THIS CLIENT'S CHART is the chart door's business, not this one's.
  const chart = await bothRefuse("account_not_in_chart",
    { client: bankScene.client, document: bankScene.doc.documentId },
    { rentAccount: "9993" }, { code: "CLR10", reason: "account_not_in_chart" });
  assert.equal(detailOf(chart).account_code, "9993");

  // 3 — THE BRANCH ASKED: MFRS over twelve months may not be confirmed on a model's own reading of
  //     the standard, and the MESSAGE is the branch's own question on both lanes.
  const mfrs = await tenancyFor(ALICE(), { framework: "MFRS" });
  await recordProposed(ALICE(), mfrs.client, mfrs.doc.documentId);
  const asked = await bothRefuse("professional_judgement_required",
    { client: mfrs.client, document: mfrs.doc.documentId }, {},
    { code: "CLR10", reason: "professional_judgement_required" });
  assert.match(asked.message, /right-of-use asset/i, "the refusal IS the branch's own question");
  assert.equal(detailOf(asked).standard, "MFRS 16");

  // 4 — NO TERMS RECORDED: there is no rent plan to confirm yet.
  const bare = await tenancyFor(ALICE(), { framework: "MPERS" });
  await bothRefuse("terms_incomplete", { client: bare.client, document: bare.doc.documentId }, {},
    { code: "CLR10", reason: "terms_incomplete" });

  // 5 — NOT AN AGREEMENT CONTRACT AT ALL.
  const other = await filedDocument(ALICE(), { firm: FIRM_A(), client: bare.client, kind: "bank_statement" });
  await bothRefuse("confirm_wrong_kind", { client: bare.client, document: other.documentId }, {},
    { code: "CLR10", reason: "confirm_wrong_kind" });

  // 6 — ALREADY RUNNING. The OBO lane must not start a second plan on a tenancy that has one, and
  //     it must say so in the human door's own words.
  const running = await tenancyFor(ALICE(), { framework: "MPERS" });
  await recordProposed(ALICE(), running.client, running.doc.documentId);
  const first = await confirmPlan(BOB(), { client: running.client, document: running.doc.documentId });
  const again = await bothRefuse("rent_plan_already_confirmed",
    { client: running.client, document: running.doc.documentId }, {},
    { code: "CLR10", reason: "rent_plan_already_confirmed" });
  assert.equal(detailOf(again).plan_id, first.plan_id);

  // 7 — ONE LIVE RENT PLAN PER PAYABLE ACCOUNT (fix-round finding ADV-03): a second tenancy of the
  //     same client pointed at 2050 would share its payments month for month.
  const second = await readTenancy(ALICE(), running.client);
  await recordProposed(ALICE(), running.client, second.documentId);
  const shared = await bothRefuse("payable_account_in_use",
    { client: running.client, document: second.documentId }, {},
    { code: "CLR10", reason: "payable_account_in_use" });
  assert.equal(detailOf(shared).payable_account_code, PAYABLE_ACCOUNT);

  // 8 — A CLIENT OUTSIDE THE FIRM, driven on the OBO lane alone because the human lane's caller
  //     cannot even reach it: the two answers are compared in p1137.obo.authority below.
  const theirs = await freshClient(DAVE());
  const foreign = await caught(() => confirmFor({
    client: theirs, author: BOB(), document: running.doc.documentId, opKey: opk1137("par-x") }));
  assert.equal(foreign.code, "CLR11");
  assert.equal(foreign.message, "client is not in your firm");
});

test("p1137.obo.authority — the named human's standing is re-checked LIVE, and a refusal leaks nothing and writes nothing", async (t) => {
  if (unready(t)) return;
  const { client, doc } = await tenancyFor(ALICE(), { framework: "MPERS" });
  await recordProposed(ALICE(), client, doc.documentId);
  const call = (over = {}) => confirmFor({
    client, author: BOB(), document: doc.documentId, opKey: opk1137("auth"), ...over });

  // 1 — THE OP KEY IS FIRST AND UNCONDITIONAL, before the author is even looked at.
  const noKey = await caught(() => call({ opKey: "   " }));
  assert.equal(noKey.code, "CLR10");
  assert.equal(detailOf(noKey).reason, "invalid_op_key");

  // 2 — A NULL AUTHOR is its own mistake, answered before the client is read, so it leaks nothing.
  const nullAuthor = await caught(() => call({ author: null }));
  assert.equal(nullAuthor.code, "CLR10");
  assert.equal(detailOf(nullAuthor).reason, "invalid_author");
  assert.equal(detailOf(nullAuthor).field, "author");

  // 3 — A NON-MEMBER AUTHOR AND AN UNKNOWN CLIENT ARE ONE ANSWER. Dave owns a firm of his own and
  //     has no membership here at all; the pair (this client, that human) must not be usable to
  //     learn that this client exists.
  const stranger = await caught(() => call({ author: DAVE() }));
  const unknownClient = await caught(() => call({ client: "00000000-0000-4000-8000-0000000011e7" }));
  assert.equal(stranger.code, "CLR11");
  assert.equal(unknownClient.code, "CLR11");
  assert.equal(stranger.message, unknownClient.message,
    "a non-member author and an unknown client must answer the SAME sentence");

  // 4 — BELOW THE BOOKKEEPER FLOOR: Carol is a viewer of this firm, and the floor applied to the
  //     NAMED HUMAN is the floor clara._human_ctx applies to a connection.
  const viewer = await caught(() => call({ author: CAROL() }));
  assert.equal(viewer.code, "CLR04");
  assert.equal(detailOf(viewer).reason, "insufficient_role");

  // 5 — AUTHORITY MUST BE LIVE AT THE MOMENT THE ACT IS TAKEN. Bob's membership is withdrawn
  //     through the estate's OWN door; a deactivated member of THIS firm gets the precise answer
  //     rather than the oracle-safe one, because they already knew the client exists.
  await deactivateMember(ALICE(), { firm: FIRM_A(), user: BOB() });
  try {
    const gone = await caught(() => call());
    assert.equal(gone.code, "CLR04");
    assert.equal(detailOf(gone).reason, "authority_lost");
    assert.equal(detailOf(gone).field, "author");
  } finally {
    await reactivateMember({ firm: FIRM_A(), user: BOB() });
  }

  // 6 — NOTHING WAS WRITTEN BY ANY OF THEM, and the positive control proves the scene was
  //     confirmable all along.
  const planned = await rootQuery(
    "select count(*)::int as n from clara.contract_plan_confirmations where document_id=$1", [doc.documentId]);
  assert.equal(planned.rows[0].n, 0, "a refusal recorded a confirmation");
  assert.deepEqual(await receiptsFor(FIRM_A(), opk1137("auth").slice(0, 12)), [],
    "…and not even a reservation survived");
  const ok = await call({ opKey: opk1137("auth-ok") });
  assert.ok(ok.confirmation_id, "the same confirmation succeeds once authority is live again");
});

test("p1137.obo.one_op_key_namespace — a chat confirmation replays to a byte-identical receipt, and a human replay of the same decision under the same key converges on ONE plan", async (t) => {
  if (unready(t)) return;
  const { client, doc } = await tenancyFor(ALICE(), { framework: "MPERS" });
  await recordProposed(ALICE(), client, doc.documentId);
  const key = opk1137("converge");

  const first = await confirmFor({ client, author: BOB(), document: doc.documentId, opKey: key });
  const replay = await confirmFor({ client, author: BOB(), document: doc.documentId, opKey: key });
  assert.deepEqual(replay, first, "a replayed op key returned a different receipt");

  // THE HUMAN REPLAY OF THE SAME DECISION, under the same key: the reservation is taken inside the
  // shared core over the CALLER'S OWN ARGUMENTS and not over the author, so the two entrances
  // converge on ONE receipt and ONE plan rather than starting a second one.
  const human = await confirmPlan(BOB(), { client, document: doc.documentId, opKey: key });
  assert.deepEqual(human, first, "a human replay under the same key started a second act");
  const plans = await rootQuery(
    `select count(*)::int as n from clara.accounting_plans p
      where p.client_id=$1 and p.authority_ref->>'kind'='contract_confirmation'`, [client]);
  assert.equal(plans.rows[0].n, 1, "two entrances under one key left two plans");
});
