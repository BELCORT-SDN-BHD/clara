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
