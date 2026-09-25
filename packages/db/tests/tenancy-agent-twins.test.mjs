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
import { reactivateMember, setClientStatus } from "./accounting-plans-fixtures.mjs";

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
  const { doc } = await tenancyFor(ALICE());
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
  const treatmentOf = (r) => Object.fromEntries(
    Object.entries(r.treatment).filter(([k]) => k !== "framework_record_id"));
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

  // 8 — THE CLIENT'S OWN STATUS. The human lane's plan step is clara.create_accounting_plan,
  //     which refuses a client that is not active; the OBO lane's plan step is this file's own
  //     clara._tenancy_plan_core. `clients_status_check_0017` admits active | archived |
  //     onboarding, and the door's token for either non-active value is `client_inactive`, so BOTH
  //     are driven — `onboarding` is the live case, because that is the state a tenancy is filed
  //     in during setup. LAST in this cell's scene order, on a DEDICATED tenancy, because it
  //     disables the client for everything else.
  //     (prepayment-schedule-obo.test.mjs:372-377 drives the same pair on 0307's twin.)
  const dormant = await tenancyFor(ALICE(), { framework: "MPERS" });
  await recordProposed(ALICE(), dormant.client, dormant.doc.documentId);
  for (const status of ["archived", "onboarding"]) {
    await setClientStatus(dormant.client, status);
    const inactive = await bothRefuse(`client_inactive (${status})`,
      { client: dormant.client, document: dormant.doc.documentId }, {},
      { code: "CLR10", reason: "client_inactive" });
    assert.match(inactive.message, /client is not active -- no new accounting plan/,
      `client_inactive (${status}): the sentence is not clara.create_accounting_plan's own`);
  }
  await setClientStatus(dormant.client, "active");

  // 9 — A CLIENT OUTSIDE THE FIRM, driven on the OBO lane alone because the human lane's caller
  //     cannot even reach it: the two answers are compared in p1137.obo.authority below.
  const theirs = await freshClient(DAVE());
  const foreign = await caught(() => confirmFor({
    client: theirs, author: BOB(), document: running.doc.documentId, opKey: opk1137("par-x") }));
  assert.equal(foreign.code, "CLR11");
  assert.equal(foreign.message, "client is not in your firm");
});

// #1137 [fix round, ADV-L08-02] THE STANDING GUARD OVER THE PLAN STEP. ADV-L08-01 was a rule the
// human lane's plan step carried and the OBO lane's copy did not, and the report that shipped it
// said the refusals matched. A comment cannot stop that happening again; a cell can. Until
// clara._obo_plan_core absorbs `recurring_journal` and this body becomes a two-line caller of it
// (README section 0353, follow-up 1, sequenced after #1051 and #1080), the two bodies are compared
// HERE, every run, in the ONE direction that failed: a refusal the HUMAN plan step raises must
// either be raised by the OBO plan step too, or be on a named roster that says why it cannot be
// reached.
const PLAN_DOOR =
  "clara.create_accounting_plan(uuid,text,text,text,jsonb,text,text,integer,text,date,date,jsonb,text,text)";
const OBO_PLAN_STEP =
  "clara._tenancy_plan_core(uuid,uuid,uuid,text,text,jsonb,text,text,integer,text,date,date,jsonb)";

/** Why a refusal clara.create_accounting_plan raises is NOT in the OBO lane's plan step. Every
 *  entry is a wall taken ABOVE this step on BOTH lanes, or an argument this step does not take.
 *  A stale entry -- a token the human door no longer raises -- is a red here too, so the roster
 *  cannot quietly outlive its reason. */
const PLAN_STEP_NOT_REACHED = {
  client_not_found:
    "clara._confirm_tenancy_rent_plan_core walls the client to the caller's firm above BOTH lanes "
    + "(CLR11 'client is not in your firm'), so neither plan step can be entered with a client "
    + "outside it -- driven in p1137.obo.refusals_match case 9 and p1137.obo.authority",
  invalid_op_key:
    "this step takes no op key of its own: the confirmation's own key covers the whole act and is "
    + "checked FIRST on both entrances -- driven in p1137.obo.authority case 1",
  operation_in_flight:
    "clara.create_accounting_plan's own reservation under `<key>:plan`; the OBO step takes no "
    + "reservation at all, and the outer clara._reserve_op on the confirmation's key sits above "
    + "both lanes -- driven in p1137.obo.one_op_key_namespace",
  plan_kind_unsupported:
    "the kind is the literal 'recurring_journal' in this step, never an argument",
};

const REASON_TOKENS = /(?:"reason"\s*:\s*"([a-z_]+)")|(?:'reason'\s*,\s*'([a-z_]+)')/g;
const reasonsOf = (src) => {
  const out = new Set();
  for (const m of src.matchAll(REASON_TOKENS)) out.add(m[1] ?? m[2]);
  return out;
};
const bodyOf = async (sig) => {
  const r = await rootQuery("select p.prosrc from pg_proc p where p.oid = to_regprocedure($1)", [sig]);
  assert.ok(r.rows[0]?.prosrc, `${sig} is absent`);
  return r.rows[0].prosrc;
};

test("p1137.obo.plan_step_parity -- every refusal the HUMAN plan step raises is either raised by "
  + "the OBO plan step or named as unreachable; and the client-status wall sits at that door's own "
  + "position, not above the walls that precede it", async (t) => {
  if (unready(t)) return;

  // 1 -- THE CENSUS. Structural by necessity: the point is to catch a wall added to
  //      clara.create_accounting_plan by a LATER lane, which no behavioural cell written today can
  //      drive. (WORK-ORDER rule 4: a catalog census is this repo's own documented shape for that.)
  const human = reasonsOf(await bodyOf(PLAN_DOOR));
  const obo = reasonsOf(await bodyOf(OBO_PLAN_STEP));
  assert.ok(human.size > 0, "clara.create_accounting_plan raises no typed refusal at all");
  const unguarded = [...human].filter((r) => !obo.has(r) && !(r in PLAN_STEP_NOT_REACHED)).sort();
  assert.deepEqual(unguarded, [],
    `clara.create_accounting_plan refuses ${unguarded.join(", ")} and the OBO lane's plan step does `
    + "not -- either copy the wall into clara._tenancy_plan_core or add it to PLAN_STEP_NOT_REACHED "
    + "with the reason it cannot be reached (ADV-L08-01 was exactly this, for client_inactive)");
  const stale = Object.keys(PLAN_STEP_NOT_REACHED).filter((r) => !human.has(r)).sort();
  assert.deepEqual(stale, [],
    `PLAN_STEP_NOT_REACHED still excuses ${stale.join(", ")}, which clara.create_accounting_plan no `
    + "longer raises -- the roster has outlived its reason");
  assert.ok(obo.has("client_inactive"),
    "the OBO lane's plan step has lost the client-status wall ADV-L08-01 put there");

  // 2 -- ...AND THE SHARED AUTHORITY RESOLUTION, whose refusal token is a VARIABLE and so invisible
  //      to the census above: both bodies must still resolve the cited instruction through #977's
  //      ONE definition rather than merely checking its shape.
  for (const sig of [PLAN_DOOR, OBO_PLAN_STEP]) {
    assert.match(await bodyOf(sig), /clara\._authority_ref_refusal\(/,
      `${sig} no longer resolves its authority through clara._authority_ref_refusal (#977, 0250)`);
  }

  // 3 -- THE POSITION, driven rather than read. The wall belongs where
  //      clara.create_accounting_plan has it -- inside the plan step -- and NOT at the OBO
  //      entrance: a tenancy with nothing recorded is answered by the DRAFT wall on the human lane,
  //      so the twin must answer that too rather than reporting the client's status first.
  const bare = await tenancyFor(ALICE(), { framework: "MPERS" });   // no terms recorded at all
  await setClientStatus(bare.client, "archived");
  const hBare = await caught(() => confirmPlan(BOB(), { client: bare.client, document: bare.doc.documentId }));
  const oBare = await caught(() => confirmFor({ client: bare.client, author: BOB(), document: bare.doc.documentId }));
  assert.ok(hBare && oBare, "one of the two entrances admitted an archived client with no terms");
  assert.equal(detailOf(hBare).reason, "terms_incomplete",
    "the human door no longer answers the draft wall first -- this cell's premise moved");
  assert.equal(oBare.code, hBare.code);
  assert.equal(oBare.message, hBare.message);
  assert.deepEqual(detailOf(oBare), detailOf(hBare),
    "the OBO twin reports the client's status where the human door reports the missing terms");

  // 4 -- ...AND THE REPLAY. The status wall sits BELOW clara._reserve_op on both lanes, so a
  //      confirmation a person already made replays to its stored receipt even after the client has
  //      been archived. An entrance-level copy of the wall would refuse the replay instead.
  for (const [label, confirm] of [
    ["human", (scene, opKey) => confirmPlan(BOB(), { client: scene.client, document: scene.doc.documentId, opKey })],
    ["obo", (scene, opKey) => confirmFor({ client: scene.client, author: BOB(), document: scene.doc.documentId, opKey })],
  ]) {
    const scene = await tenancyFor(ALICE(), { framework: "MPERS" });
    await recordProposed(ALICE(), scene.client, scene.doc.documentId);
    const key = opk1137(`replay-${label}`);
    const first = await confirm(scene, key);
    await setClientStatus(scene.client, "archived");
    const again = await confirm(scene, key);
    assert.deepEqual(again, first,
      `${label}: replaying a confirmation the person already made stopped returning its receipt `
      + "once the client was archived");
  }
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

// ===========================================================================================
// S7 — THE ON-BEHALF-OF ESCALATION CONFIRMATION, and the ONE body both lanes now revise through.
// ===========================================================================================

const REVISION_FOR_SPECS = [
  { name: "p_client", cast: "uuid" }, { name: "p_author", cast: "uuid" },
  { name: "p_document", cast: "uuid" }, { name: "p_judgement", cast: "text" },
  { name: "p_op_key", cast: "text" },
];

const confirmRevisionFor = async ({ client, author, document, judgement = null, opKey = null }) =>
  (await roleQuery(ROLES.runtime, namedCall("confirm_tenancy_rent_plan_revision_for", REVISION_FOR_SPECS),
    [client, author, document, judgement, opKey ?? opk1137("obo-revise")])).rows[0].result;

const confirmRevision = async (sub, { client, document, judgement = null, opKey = null }) =>
  (await humanQuery(sub, namedCall("confirm_tenancy_rent_plan_revision", [
    { name: "p_client" }, { name: "p_document" }, { name: "p_judgement" }, { name: "p_op_key" }]),
    [client, document, judgement, opKey ?? opk1137("revise")])).rows[0].result;

const liveRevision = async (planId) =>
  (await rootQuery(
    `select r.revision, r.basis, r.effective_from::text as effective_from,
            r.effective_to::text as effective_to, r.created_by
       from clara.accounting_plan_revisions r
      where r.plan_id=$1 and r.superseded_at is null`, [planId])).rows[0];

const inDays = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

/** A confirmed level-rent plan with the escalation recorded AFTERWARDS off the side letter, which
 *  is the real sequence: the tenancy is read and the plan started, and the rent review is found in
 *  a clause a person reads for themselves. */
async function escalatingTenancy(sub, { effectiveFrom = null } = {}) {
  const { client, doc } = await tenancyFor(sub, { framework: "MPERS" });
  await recordProposed(sub, client, doc.documentId);
  const receipt = await confirmPlan(BOB(), { client, document: doc.documentId });
  await recordTerms(sub, {
    client, document: doc.documentId,
    terms: [{
      term_key: "escalation",
      escalation: {
        effective_from: effectiveFrom ?? inDays(30),
        new_amount_cents: ESCALATED_CENTS, printed_raw: "3,960.00",
      },
      basis_kind: "person_stated",
      basis: "clause 4(b) of the side letter raises the rent in the second year",
    }],
  });
  return { client, doc, planId: receipt.plan_id };
}

const JUDGEMENT = "The increases follow the landlord's stated index and are within expected general "
  + "inflation for the term, so the straight-line expense is not materially different from the "
  + "month's cash rent; charged as incurred under MPERS Section 20.";

test("p1137.revision.obo — the chat lane confirms the escalation's revision on a named bookkeeper's behalf, and the plan moves under THEIR name", async (t) => {
  if (unready(t)) return;
  const { client, doc, planId } = await escalatingTenancy(ALICE());
  const before = await liveRevision(planId);
  assert.equal(Number(before.revision), 1, "mandatory setup: the plan is on its first revision");

  const receipt = await confirmRevisionFor({
    client, author: BOB(), document: doc.documentId, judgement: JUDGEMENT });

  assert.ok(receipt.confirmation_id, `the OBO twin returned a receipt: ${JSON.stringify(receipt)}`);
  assert.equal(receipt.plan_id, planId, "…for the plan the tenancy already runs");
  assert.equal(Number(receipt.revision), 2, "…and it is the plan's SECOND revision");
  assert.equal(Number(receipt.from_cents), RENT_CENTS);
  assert.equal(Number(receipt.to_cents), ESCALATED_CENTS);
  assert.equal(receipt.professional_judgement, JUDGEMENT,
    "the accountant's own written treatment is passed through unchanged");

  // THE ACT IS RECORDED AS THE NAMED PERSON'S, on both rows it touches.
  const cf = await confirmationRow(receipt.confirmation_id);
  assert.equal(cf.confirmed_by, BOB(), "the revision confirmation names the bookkeeper");
  assert.equal(cf.kind, "rent_plan_revision");
  assert.equal(Number(cf.monthly_rent_cents), ESCALATED_CENTS);
  assert.equal(cf.professional_judgement, JUDGEMENT);

  const after = await liveRevision(planId);
  assert.equal(Number(after.revision), 2);
  assert.equal(after.created_by, BOB(), "the plan revision is created by the named bookkeeper");
  assert.equal(after.effective_from, receipt.effective_from, "…from the escalation's own date");
  const credit = (after.basis.lines ?? []).find((l) => l.account_code === PAYABLE_ACCOUNT);
  assert.equal(Number(credit.credit_cents), ESCALATED_CENTS,
    "the plan now charges the escalated rent, not the old one");

  const audit = (await auditRows(FIRM_A(), "confirm_tenancy_rent_plan_revision"))[0];
  assert.equal(audit.actor, BOB());
  assert.equal(audit.args.via, "confirm_tenancy_rent_plan_revision_for");
});

test("p1137.revision.judgement_required — a stepped rent ALWAYS asks, and the refusal is the branch's own question on BOTH entrances", async (t) => {
  if (unready(t)) return;
  const { client, doc, planId } = await escalatingTenancy(ALICE());

  const h = await caught(() => confirmRevision(BOB(), { client, document: doc.documentId }));
  const o = await caught(() => confirmRevisionFor({ client, author: BOB(), document: doc.documentId }));
  assert.ok(h, "the human door did NOT ask for a judgement");
  assert.ok(o, "the OBO twin did NOT ask for a judgement");
  assert.equal(o.code, h.code);
  assert.equal(o.message, h.message, "the two entrances ask different questions");
  assert.deepEqual(detailOf(o), detailOf(h));
  assert.equal(detailOf(h).reason, "professional_judgement_required");
  assert.equal(detailOf(h).treatment_reason, "escalation_stated");
  assert.match(h.message, /straight-line|escalation/i,
    "the refusal states what the standard asks, in the branch's own words");

  // AND NOTHING MOVED: the model does not supply the judgement, it asks the accountant for one.
  assert.equal(Number((await liveRevision(planId)).revision), 1, "a refusal revised the plan");
});

test("p1137.revision.refusals_match — no escalation, not due yet and already revised answer identically on both entrances", async (t) => {
  if (unready(t)) return;

  async function bothRefuse(label, { client, document }, expect) {
    const h = await caught(() => confirmRevision(BOB(), { client, document, judgement: JUDGEMENT }));
    const o = await caught(() => confirmRevisionFor({ client, author: BOB(), document, judgement: JUDGEMENT }));
    assert.ok(h, `${label}: the human door did NOT refuse`);
    assert.ok(o, `${label}: the OBO twin did NOT refuse`);
    assert.equal(o.code, h.code, `${label}: sqlstate differs`);
    assert.equal(o.message, h.message, `${label}: the sentence differs`);
    assert.deepEqual(detailOf(o), detailOf(h), `${label}: the typed detail differs`);
    assert.equal(detailOf(h).reason, expect, `${label}: expected reason ${expect}`);
    return h;
  }

  // 1 — A RUNNING PLAN WITH NO ESCALATION RECORDED.
  const plain = await tenancyFor(ALICE(), { framework: "MPERS" });
  await recordProposed(ALICE(), plain.client, plain.doc.documentId);
  await confirmPlan(BOB(), { client: plain.client, document: plain.doc.documentId });
  await bothRefuse("no_escalation_recorded",
    { client: plain.client, document: plain.doc.documentId }, "no_escalation_recorded");

  // 2 — AN ESCALATION FURTHER OUT THAN THE SIXTY-DAY LEAD: real, recorded, and not yet the
  //     person's business.
  const far = await escalatingTenancy(ALICE(), { effectiveFrom: inDays(120) });
  const notDue = await bothRefuse("not_due_yet",
    { client: far.client, document: far.doc.documentId }, "not_due_yet");
  assert.equal(detailOf(notDue).plan_id, far.planId);

  // 3 — ALREADY REVISED: the plan already charges the escalated rent.
  const done = await escalatingTenancy(ALICE());
  await confirmRevisionFor({
    client: done.client, author: BOB(), document: done.doc.documentId, judgement: JUDGEMENT });
  await bothRefuse("already_revised",
    { client: done.client, document: done.doc.documentId }, "already_revised");

  // 4 — THE AUTHORITY LADDER IS THE CONFIRMATION TWIN'S, and it is the same body's.
  const live = await escalatingTenancy(ALICE());
  const nullAuthor = await caught(() => confirmRevisionFor({
    client: live.client, author: null, document: live.doc.documentId, judgement: JUDGEMENT }));
  assert.equal(detailOf(nullAuthor).reason, "invalid_author");
  const viewer = await caught(() => confirmRevisionFor({
    client: live.client, author: CAROL(), document: live.doc.documentId, judgement: JUDGEMENT }));
  assert.equal(viewer.code, "CLR04");
  assert.equal(detailOf(viewer).reason, "insufficient_role");
  const noKey = await caught(() => confirmRevisionFor({
    client: live.client, author: BOB(), document: live.doc.documentId, judgement: JUDGEMENT, opKey: " " }));
  assert.equal(detailOf(noKey).reason, "invalid_op_key");
  assert.equal(Number((await liveRevision(live.planId)).revision), 1, "a refusal revised the plan");
});

// #1137 [fix round, ADV-L08-01, second half] THE REVISION LANE'S CLIENT STATUS -- the half of that
// finding's required fix this lane REFUSES, and refuses with a measurement rather than an argument.
//
// The finding asked for the client-status wall on clara.confirm_tenancy_rent_plan_revision_for too,
// "for symmetry with the precedent". It would be a DEFECT here. The precedent (0307) needs the wall
// in its twin because clara._prepayment_schedule_core is SHARED by both entrances and cannot carry
// it. This lane's revision step is shared too -- clara._revise_accounting_plan_core, ONE body, no
// lane branch at all -- and clara.revise_accounting_plan (0193) carries NO client-status wall, so
// the human entrance admits a non-active client today. A wall on the OBO entrance alone would
// CREATE the divergence this finding exists to close, in the opposite direction.
//
// Whether the plan lane SHOULD refuse a revision for an archived client is 0193's question and a
// person's judgement, not a twin's to answer on its own: it is carried as a follow-up. What this
// cell pins is the property the twin owes -- the two entrances answer the SAME thing, whatever
// 0193 decides that is.
test("p1137.revision.client_status_parity -- a non-active client is answered IDENTICALLY by both "
  + "revision entrances, because they revise through ONE body; the wall the plan door does not "
  + "have is not invented on the machine lane", async (t) => {
  if (unready(t)) return;

  // TWO IDENTICAL SCENES, because whichever entrance runs first would consume the escalation.
  const scenes = [await escalatingTenancy(ALICE()), await escalatingTenancy(ALICE())];
  for (const sc of scenes) await setClientStatus(sc.client, "archived");

  const call = [
    () => confirmRevision(BOB(), { client: scenes[0].client, document: scenes[0].doc.documentId, judgement: JUDGEMENT }),
    () => confirmRevisionFor({ client: scenes[1].client, author: BOB(), document: scenes[1].doc.documentId, judgement: JUDGEMENT }),
  ];
  const err = [await caught(call[0]), await caught(call[1])];

  assert.equal(err[0] === null, err[1] === null,
    err[0] === null
      ? "the human door admitted an archived client and the OBO twin refused it -- the twin has a "
        + "wall clara.revise_accounting_plan does not have"
      : "the human door refused an archived client and the OBO twin admitted it -- the divergence "
        + "ADV-L08-01 found on the FIRST confirmation, now on the revision");

  if (err[0]) {
    assert.equal(err[1].code, err[0].code, "sqlstate differs on a non-active client");
    assert.equal(err[1].message, err[0].message, "the sentence differs on a non-active client");
    assert.deepEqual(detailOf(err[1]), detailOf(err[0]), "the typed detail differs");
  }

  // …AND THE PLANS MOVED THE SAME WAY, or did not move at all, on both scenes.
  const moved = await Promise.all(scenes.map(async (sc) => Number((await liveRevision(sc.planId)).revision)));
  assert.equal(moved[1], moved[0],
    `the archived client's plan is at revision ${moved[0]} through the human door and ${moved[1]} `
    + "through the OBO twin");

  // THE PREMISE THIS CELL RESTS ON, pinned so it cannot rot silently: the two entrances share ONE
  // revision body, and that body is the thing that would have to grow the wall.
  const core = (await rootQuery(
    "select p.prosrc from pg_proc p where p.oid = to_regprocedure($1)",
    ["clara._confirm_tenancy_rent_plan_revision_core(uuid,uuid,text,uuid,uuid,text,text)"])).rows[0].prosrc;
  assert.match(core, /clara\._revise_accounting_plan_core\(/,
    "the revision core no longer calls the shared revision body");
  assert.doesNotMatch(core, /p_lane\s*=\s*'obo'/,
    "the revision core has grown a lane branch -- the two entrances no longer revise through ONE body");
});

test("p1137.revise.human_door_unchanged — clara.revise_accounting_plan still checks its op key FIRST and still walls a plan to the caller's firm, through clara._plan_door_ctx", async (t) => {
  if (unready(t)) return;
  const mine = await escalatingTenancy(ALICE());
  const args = [
    { name: "p_plan", cast: "uuid" }, { name: "p_frequency", cast: "text" },
    { name: "p_day_rule", cast: "text" }, { name: "p_day_of_month", cast: "integer" },
    { name: "p_timezone", cast: "text" }, { name: "p_effective_from", cast: "date" },
    { name: "p_effective_to", cast: "date" }, { name: "p_basis", cast: "jsonb" },
    { name: "p_reversal_day_rule", cast: "text" }, { name: "p_op_key", cast: "text" },
  ];
  const revise = (sub, plan, opKey) => humanQuery(sub, namedCall("revise_accounting_plan", args),
    [plan, "monthly", "day_of_month", 5, "Asia/Kuala_Lumpur", TERM_START, TERM_END, null, null, opKey]);

  // 1 — THE OP KEY IS STILL FIRST: a blank key answers CLR10 even for a caller who could not have
  //     reached the plan anyway, which is 0193's own order and the reason it is in the delegate.
  const blank = await caught(() => revise(BOB(), mine.planId, "   "));
  assert.equal(blank.code, "CLR10");
  assert.equal(detailOf(blank).reason, "invalid_op_key");

  // 2 — A PLAN OUTSIDE THE CALLER'S FIRM answers clara._plan_door_ctx's OWN refusal, and an
  //     invented id answers the same, so the split opened no existence oracle.
  const foreign = await caught(() => revise(DAVE(), mine.planId, opk1137("rev-foreign")));
  const invented = await caught(() => revise(DAVE(), "00000000-0000-4000-8000-0000000011f1", opk1137("rev-none")));
  assert.equal(foreign.code, "CLR11");
  assert.equal(detailOf(foreign).reason, "plan_not_found");
  assert.equal(foreign.message, invented.message,
    "another firm's real plan and an invented id must be indistinguishable");
  assert.equal(Number((await liveRevision(mine.planId)).revision), 1, "a refusal revised the plan");
});

// ===========================================================================================
// S9 — THE GRANTS THIS TICKET BOUGHT, AND NOTHING ELSE. Driven role by role, never read off the
// catalog: an ACL a test only READS is an ACL nobody has proved.
// ===========================================================================================

const READ_DOORS = () => [
  { name: "wake_get_contract_terms", specs: DOC_SPECS },
  { name: "wake_get_tenancy_rent_plan_draft", specs: DOC_SPECS },
  { name: "wake_propose_contract_terms", specs: DOC_SPECS },
  { name: "wake_get_tenancy_escalation_revision", specs: DOC_SPECS },
  { name: "wake_get_rent_settlement_candidates", specs: CLIENT_SPECS },
  { name: "wake_get_tenancy_deposit_coding", specs: CLIENT_SPECS },
];

const HUMAN_DOORS = () => [
  { name: "get_contract_terms", specs: DOC_SPECS },
  { name: "get_tenancy_rent_plan_draft", specs: DOC_SPECS },
  { name: "propose_contract_terms", specs: DOC_SPECS },
  { name: "get_tenancy_escalation_revision", specs: DOC_SPECS },
  { name: "get_rent_settlement_candidates", specs: CLIENT_SPECS },
  { name: "get_tenancy_deposit_coding", specs: CLIENT_SPECS },
];

const NOWHERE = "00000000-0000-4000-8000-0000000011fa";

test("p1137.acl.eight_doors_two_roles — clara_agent_ro holds the six reads and clara_runtime the two acts; every other role is refused 42501 on every one of them, and the ten cores are reachable by nobody", async (t) => {
  if (unready(t)) return;
  const { client, doc } = await tenancyFor(ALICE(), { framework: "MPERS" });
  await recordProposed(ALICE(), client, doc.documentId);
  const { secret } = await chatCredential();

  // DRIVEN, not read off the catalog: the role that is supposed to hold them does.
  for (const d of READ_DOORS()) {
    const arg = d.specs === DOC_SPECS ? doc.documentId : client;
    assert.ok(await wakeRead(d.name, secret, arg, d.specs) !== undefined,
      `clara_agent_ro cannot call ${d.name}`);
  }
  // …and so does the act lane, on a real clara_runtime connection with no JWT at all.
  const ok = await confirmFor({ client, author: BOB(), document: doc.documentId });
  assert.ok(ok.confirmation_id, "clara_runtime cannot call the OBO confirmation");

  // THE SIX READS: every OTHER role, 42501.
  for (const d of READ_DOORS()) {
    const arg = d.specs === DOC_SPECS ? doc.documentId : client;
    for (const role of [ROLES.runtime, ROLES.authenticated, ROLES.wakeInteractive]) {
      await assertRaises(PG.insufficientPrivilege,
        () => roleQuery(role, namedCall(d.name, d.specs), [arg]), `${role} on ${d.name}`);
    }
  }

  // THE TWO ACTS: every OTHER role, 42501 — and clara_agent_ro above all, because a read role that
  // could confirm a rent plan would be the agent deciding what it is allowed to do.
  const acts = [
    [namedCall("confirm_tenancy_rent_plan_for", CONFIRM_FOR_SPECS),
     [client, BOB(), doc.documentId, null, null, null, "p1137-never"]],
    [namedCall("confirm_tenancy_rent_plan_revision_for", REVISION_FOR_SPECS),
     [client, BOB(), doc.documentId, null, "p1137-never"]],
  ];
  for (const [sql, vals] of acts) {
    for (const role of [ROLES.agentRo, ROLES.authenticated, ROLES.wakeInteractive]) {
      await assertRaises(PG.insufficientPrivilege, () => roleQuery(role, sql, vals), `${role} on an OBO act`);
    }
  }

  // THE TEN CORES: nobody, including the two roles that hold the doors in front of them.
  const cores = [
    ["select clara._get_contract_terms_core($1::uuid,$2::uuid)", [FIRM_A(), doc.documentId]],
    ["select clara._get_tenancy_rent_plan_draft_core($1::uuid,$2::uuid)", [FIRM_A(), doc.documentId]],
    ["select clara._propose_contract_terms_core($1::uuid,$2::uuid)", [FIRM_A(), doc.documentId]],
    ["select clara._get_tenancy_escalation_revision_core($1::uuid,$2::uuid)", [FIRM_A(), doc.documentId]],
    ["select clara._get_rent_settlement_candidates_core($1::uuid,$2::uuid)", [FIRM_A(), client]],
    ["select clara._get_tenancy_deposit_coding_core($1::uuid,$2::uuid)", [FIRM_A(), client]],
    ["select clara._confirm_tenancy_rent_plan_core($1::uuid,$2::uuid,'obo',$3::uuid,$4::uuid,null,null,null,'p1137-never')",
     [FIRM_A(), BOB(), client, doc.documentId]],
    ["select clara._confirm_tenancy_rent_plan_revision_core($1::uuid,$2::uuid,'obo',$3::uuid,$4::uuid,null,'p1137-never')",
     [FIRM_A(), BOB(), client, doc.documentId]],
    ["select clara._revise_accounting_plan_core($1::uuid,$2::uuid,$3::uuid,'monthly','day_of_month',5,'Asia/Kuala_Lumpur',$4::date,$5::date,null,null,'p1137-never')",
     [FIRM_A(), BOB(), NOWHERE, TERM_START, TERM_END]],
    ["select clara._tenancy_plan_core($1::uuid,$2::uuid,$3::uuid,'x','explicit_instruction','{}'::jsonb,'monthly','day_of_month',5,'Asia/Kuala_Lumpur',$4::date,$5::date,null)",
     [FIRM_A(), client, BOB(), TERM_START, TERM_END]],
  ];
  for (const [sql, vals] of cores) {
    for (const role of [ROLES.runtime, ROLES.agentRo, ROLES.authenticated, ROLES.wakeInteractive]) {
      await assertRaises(PG.insufficientPrivilege, () => roleQuery(role, sql, vals),
        `${role} on an ungranted core`);
    }
  }

  // THE ELEVEN HUMAN DOORS are still closed to the machine lane: the model lane gained NEW NAMES
  // beside them, never a widened grant on one of them.
  for (const d of HUMAN_DOORS()) {
    const arg = d.specs === DOC_SPECS ? doc.documentId : client;
    for (const role of [ROLES.agentRo, ROLES.runtime, ROLES.wakeInteractive]) {
      await assertRaises(PG.insufficientPrivilege,
        () => roleQuery(role, namedCall(d.name, d.specs), [arg]), `${role} on the HUMAN door ${d.name}`);
    }
  }
  const humanActs = [
    [namedCall("confirm_tenancy_rent_plan", [
      { name: "p_client", cast: "uuid" }, { name: "p_document", cast: "uuid" },
      { name: "p_rent_account", cast: "text" }, { name: "p_payable_account", cast: "text" },
      { name: "p_judgement", cast: "text" }, { name: "p_op_key", cast: "text" }]),
     [client, doc.documentId, null, null, null, "p1137-never"]],
    [namedCall("confirm_tenancy_rent_plan_revision", [
      { name: "p_client", cast: "uuid" }, { name: "p_document", cast: "uuid" },
      { name: "p_judgement", cast: "text" }, { name: "p_op_key", cast: "text" }]),
     [client, doc.documentId, null, "p1137-never"]],
    // …AND THE TWO ACTS THIS TICKET DELIBERATELY DID NOT OPEN. A settlement with two candidate
    // lines of the same amount is adjudicated where a person can see both; recording a term is
    // the person's own reading of the page.
    [namedCall("settle_rent_payable", [
      { name: "p_client", cast: "uuid" }, { name: "p_entry", cast: "uuid" },
      { name: "p_line", cast: "uuid" }, { name: "p_op_key", cast: "text" }]),
     [client, NOWHERE, NOWHERE, "p1137-never"]],
    [namedCall("record_contract_terms", [
      { name: "p_client", cast: "uuid" }, { name: "p_document", cast: "uuid" },
      { name: "p_terms", cast: "jsonb" }, { name: "p_op_key", cast: "text" }]),
     [client, doc.documentId, "[]", "p1137-never"]],
    [namedCall("revise_accounting_plan", [
      { name: "p_plan", cast: "uuid" }, { name: "p_frequency", cast: "text" },
      { name: "p_day_rule", cast: "text" }, { name: "p_day_of_month", cast: "integer" },
      { name: "p_timezone", cast: "text" }, { name: "p_effective_from", cast: "date" },
      { name: "p_effective_to", cast: "date" }, { name: "p_basis", cast: "jsonb" },
      { name: "p_reversal_day_rule", cast: "text" }, { name: "p_op_key", cast: "text" }]),
     [NOWHERE, "monthly", "day_of_month", 5, "Asia/Kuala_Lumpur", TERM_START, TERM_END, null, null, "p1137-never"]],
  ];
  for (const [sql, vals] of humanActs) {
    for (const role of [ROLES.agentRo, ROLES.runtime, ROLES.wakeInteractive]) {
      await assertRaises(PG.insufficientPrivilege, () => roleQuery(role, sql, vals),
        `${role} on a HUMAN act this ticket did not open`);
    }
  }

  // AND THE ALLOWLIST IS SIX ROWS OF ONE KIND, with NOTHING for an act: the OBO twins are runtime
  // doors, not wake doors, and a wake credential can never reach them.
  const rows = await rootQuery(
    `select wake_kind, function_name from clara.wake_fn_allowlist
      where function_name like 'wake_get_tenancy%' or function_name like 'wake_get_contract%'
         or function_name like 'wake_propose_contract%' or function_name like 'wake_get_rent%'
         or function_name like 'confirm_tenancy%'
      order by function_name`);
  assert.equal(rows.rows.length, 6, `six allowlist rows and no more: ${JSON.stringify(rows.rows)}`);
  assert.ok(rows.rows.every((r) => r.wake_kind === "interactive"),
    "a kind other than `interactive` may call the new reads");
});

test("p1137.reads.read_only — all six model-lane reads answer inside a READ ONLY transaction, which is the only kind the chat lane's read pool opens, and none of them writes a row", async (t) => {
  if (unready(t)) return;
  const { client, doc } = await tenancyFor(ALICE(), { framework: "MPERS" });
  await recordProposed(ALICE(), client, doc.documentId);
  await confirmPlan(BOB(), { client, document: doc.documentId });
  await freshBank(ALICE(), client);
  const { secret } = await chatCredential();

  const before = (await rootQuery(
    "select (select count(*) from clara.domain_events) as ev, (select count(*) from clara.op_receipts) as ops, (select count(*) from clara.audit_log) as aud")
  ).rows[0];

  const answers = await asWake(ROLES.agentRo, secret, async (c) => {
    await c.query("select set_config('transaction_read_only', 'on', true)");
    // The control: this transaction really IS read-only, proven by a write that 25006s in it. It
    // runs inside a savepoint, because a refused statement aborts the transaction it was refused
    // in and the doors still have to be called in the SAME one.
    await c.query("savepoint p1137_ro");
    let refused = null;
    try { await c.query("create temporary table _p1137_ro_probe(x int)"); }
    catch (e) { refused = e.code; }
    await c.query("rollback to savepoint p1137_ro");
    assert.equal(refused, PG.readOnly, "the read-only probe did not make the transaction read-only");
    const out = {};
    for (const d of READ_DOORS()) {
      const arg = d.specs === DOC_SPECS ? doc.documentId : client;
      out[d.name] = (await c.query(namedCall(d.name, d.specs), [arg])).rows[0].result;
    }
    return out;
  });
  assert.equal(answers.wake_get_contract_terms.terms.length, 4, "the terms door answered read-only");
  assert.equal(answers.wake_get_tenancy_rent_plan_draft.confirmed, true, "the draft door answered read-only");
  assert.equal(answers.wake_propose_contract_terms.proposed.length, 4, "the proposal door answered read-only");
  assert.equal(answers.wake_get_tenancy_escalation_revision.pending, false, "the escalation door answered read-only");
  assert.ok(Array.isArray(answers.wake_get_rent_settlement_candidates), "the rent door answered read-only");
  assert.equal(answers.wake_get_tenancy_deposit_coding.length, 1, "the deposit door answered read-only");

  // NO ACT, stated as a measurement: these are readings, so none of the estate's three act ledgers
  // moves. #949's contract says the two read tools mint no work_accepted and ask no work_question;
  // this is the database half of that promise.
  const after = (await rootQuery(
    "select (select count(*) from clara.domain_events) as ev, (select count(*) from clara.op_receipts) as ops, (select count(*) from clara.audit_log) as aud")
  ).rows[0];
  assert.equal(after.ev, before.ev, "a model-lane read emitted a domain event");
  assert.equal(after.ops, before.ops, "a model-lane read wrote an operation receipt");
  assert.equal(after.aud, before.aud, "a model-lane read wrote an audit row");
});

test("p1137.reads.model_lane_floor — the model lane is never wider than the human door: a below-bookkeeper credential cannot be minted at all, and a standing one goes inert the moment the person's membership does", async (t) => {
  if (unready(t)) return;
  const { client, doc } = await tenancyFor(ALICE(), { framework: "MPERS" });
  await recordProposed(ALICE(), client, doc.documentId);

  // 1 — CAROL is a VIEWER of firm A, and the four document reads are viewer-floored in the HUMAN
  //     lane: she reads them herself. She cannot be the person a chat credential acts for, because
  //     clara.mint_wake_credential refuses a below-bookkeeper on_behalf_of outright. So on those
  //     four doors the model lane is STRICTLY NARROWER than the human door — which is the claim
  //     0353's header makes, driven here rather than argued.
  assert.ok(await humanRead("get_contract_terms", CAROL(), doc.documentId),
    "mandatory setup: the viewer reads the human door");
  const refused = await caught(() => chatCredential(FIRM_A(), CAROL()));
  assert.ok(refused, "a credential was minted on behalf of a viewer");
  assert.equal(refused.code, "CLR10");
  assert.equal(detailOf(refused).reason, "authority_lost");

  // 2 — AND A STANDING CREDENTIAL IS RE-VALIDATED ON EVERY USE. Bob's credential works; his
  //     membership is then withdrawn through the estate's own door; the SAME secret goes inert
  //     mid-conversation rather than outliving his authority.
  const { secret } = await chatCredential();
  assert.ok(await wakeRead("wake_get_contract_terms", secret, doc.documentId),
    "mandatory setup: the bookkeeper's own credential reads");
  await deactivateMember(ALICE(), { firm: FIRM_A(), user: BOB() });
  try {
    await assertRaises("CLR03", () => wakeRead("wake_get_contract_terms", secret, doc.documentId),
      "a credential whose person has left the firm");
    await assertRaises("CLR03", () => wakeRead("wake_get_rent_settlement_candidates", secret, client, CLIENT_SPECS),
      "…on the client-scoped reads too");
  } finally {
    await reactivateMember({ firm: FIRM_A(), user: BOB() });
  }
  // The positive control is a FRESH credential, not the old secret: clara.remove_member revokes a
  // departing person's outstanding credentials outright, which is a second wall and not this cell's
  // subject. What this proves is that nothing but the person's standing was ever being measured.
  const back = await chatCredential();
  assert.ok(await wakeRead("wake_get_contract_terms", back.secret, doc.documentId),
    "…and the lane reads again once the membership is back");
});
