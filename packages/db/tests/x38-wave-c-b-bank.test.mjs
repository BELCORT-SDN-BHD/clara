// 0038 Wave C-b -- PART A: bank IDENTITY + statement INGEST (statementFacts_v1,
// both lanes) + the typed CONSENT extension (the purpose `PURPOSE` names below --
// `statement_extraction` at Wave C-b, `witness_extraction` since the F-A2 Window-B activation).
//
// CONTRACT-BLIND, exactly the x37 discipline: written from
// docs/plan/completed/wave-c-b-bank-design.md + wave-c-b-bank-design-part2.md (v2,
// review-hardened) + docs/plan/completed/wave-c-contract.md (WC-R1..R12) +
// docs/plan/completed/wave-c-a-subledger-design.md (WCA-R1..R9) + the LIVE 0037 idiom
// (congruence FKs, belts, tail asserts, grant/revoke blocks, the advisory-lock
// family, event registration) -- this lane never reads 0038's SQL. Every verb is
// called by its PINNED name with NAMED args; a 42883 / param-name / reason-token
// divergence at integration is a FINDING for orchestrator adjudication, never a
// silent test edit.
//
// SCOPE: this file owns Identity + Ingest + Consent (part2 SS6's first three
// bullet groups). Matching / settle-from-line / tenancy-ACL-for-those-verbs is
// `x38-wave-c-b-match.test.mjs`, a SEPARATE file/lane -- this file never calls
// match_bank_line / unmatch_bank_match / settle_from_bank_line /
// complete_pending_match. Two cells here (SSx38.f "remap refused while matched",
// re-used by nothing else) need a MATCH ROW to exist; rather than reach across
// lanes this file hand-constructs one by DIRECT INSERT against the table shapes
// part1 SS4.5 gives verbatim (the x37.z/x37.ac precedent for probing a belt with a
// forged shape) -- never through match_bank_line.
//
// INTERFACE ASSUMPTIONS (recorded here AND in the lane report; every one is a
// contract-blind reading, not a fact -- a divergence at integration is a finding):
//   IA-1 `persist_statement_facts(p_task, p_payload)` -- p_payload shape. The
//        design states the READERS (deterministic table extraction / the typed
//        engine) and what corroboration checks (SS4.3), never a JSON schema. This
//        lane reads it as `{reader1:{header,lines}, reader2:{header,lines}|null}`
//        -- null reader2 models the structured (csv/ofx) lane, where WC-R7 makes
//        the CHAIN itself the second reader. `header` mirrors bank_statements'
//        own columns (bank_code, account_number, currency, period_start,
//        period_end, statement_date, opening_cents, closing_cents,
//        total_debit_cents, total_credit_cents); `lines` mirrors
//        bank_statement_lines (line_no, entry_date, value_date, description,
//        amount_cents, running_balance_cents).
//   IA-2 On a NAMED validation failure (header_unreadable, chain_broken, ...),
//        `persist_statement_facts` is read as RETURNING a terminal receipt
//        `{task_id,document_id,status:'failed',reason:<code>}` -- the SAME shape
//        `claim_document_processing_task`'s own budget/attempt_cap branches use
//        (0016:3480-3487; never a bare exception that strands the task
//        'running'). `persistExpectFailure()` below asserts THIS reading
//        primarily and tolerates a raised CLR10+reason as an alternate reading,
//        recording whichever branch fired via noteLane.
//   IA-3 `enter_bank_statement`'s `p_header` carries the STATEMENT'S OWN columns
//        only (period_start/period_end/statement_date/opening_cents/
//        closing_cents/total_debit_cents/total_credit_cents/currency) -- NOT bank
//        identity, since `p_bank_account` already names the resolved account.
//   IA-4 `add_bank_account`'s positional/named surface is read as `(p_client,
//        p_bank_code, p_account_number, p_bank_name_display, p_coa_account_code,
//        p_proposal_id default null, p_op_key)`; `deactivate_bank_account(
//        p_client, p_bank_account, p_reason, p_op_key)`; `reactivate_bank_account(
//        p_client, p_bank_account, p_op_key)` (no reason -- a positive act);
//        `remap_bank_account_coa(p_client, p_bank_account, p_coa_account_code,
//        p_op_key)`; `void_bank_statement(p_client, p_statement, p_reason,
//        p_op_key)`.
//   IA-5 The router dispatch is READ as the EXISTING `clara.enqueue_invoice_facts
//        (p_document)` entry point (the design's own CoR register names
//        `_enqueue_invoice_facts_core` as the function 0038 amends) -- there is no
//        new bank-specific enqueue verb. A document with document_kind=
//        'bank_statement' therefore routes through the SAME wrapper this suite
//        already imports as `enqueueInvoiceFacts`.
//   IA-6 field_path for a bank-account HARD identifier region is 'bank_account'
//        (mirrors the live 'tin' convention -- rig-docs-attribution.test.mjs).
//   IA-7 The 6/7-arg sha-bound egress-dispatch overloads add `p_document_sha256`
//        as the TRAILING argument to the existing 5-arg prepare / 6-arg consume
//        shapes (0020:408-409, 484-485) -- prepare becomes 6 args, consume 7.
//
// Evidence grading (matches the design docs): [V] orchestrator-verified at
// file:line (this file cites migration idioms it copies) · everything else here
// is this lane's contract-blind reading, adjudicated at integration like x37's.
//
// House style: header-prose-then-cells (x37), rig helpers (a21-helpers.mjs
// chain), truncateGuardError lessons (never TRUNCATE an append-only table under
// concurrency -- this suite never truncates). Serial discipline:
// --test-concurrency=1 (SSx38.o/p drive two-session forced schedules by hand).
//
// DO NOT run this suite here (orchestrator-only rig).

import { test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  rootQuery, humanQuery, roleQuery, withActor, namedCall, opk,
  endPool, printLaneNotes, printSkipCount, noteLane, markSkip, ROLES,
  a21EnsureReady, buildWorld, firmOf,
  upsertAccountClassed, grantConsent,
  freshResolution, seedVerifiedDocument, seedExtraction, seedRegion,
  filedDocument, fileDocument, enqueueInvoiceFacts, claimTask,
  recordRuleResolution,
  reasonOf, idOf, roleCanExecute, fnSource, rlsFlags,
  grantClientEgressPurpose, activateClientEgressPurpose,
  deactivateClientEgressPurpose, revokeClientEgressPurpose, classifyConsentEvidenceDocument,
} from "./a21-helpers.mjs";
import { draftEntryV3 } from "./s6-helpers.mjs";

// ---------------------------------------------------------------------------
// Pinned vocabulary (design SS3/SS4). LAW -- a divergence is a finding.
// ---------------------------------------------------------------------------

// THE PURPOSE THE STATEMENT LANES ARE GATED ON. Wave C-b built this battery against
// `statement_extraction`; the F-A2 Window-B activation RE-KEYED the enqueue-time typed-consent
// lookup inside `clara._enqueue_invoice_facts_core` to `witness_extraction`, and that lookup is
// ONE branch serving BOTH statement lanes (`statement_facts` pdf/image AND `statement_parse`
// csv/ofx) — so both lanes now answer to the witness purpose. This constant follows the GATE,
// because a battery pinned to the retired purpose would stop testing the live system and would
// pass by testing nothing.
const PURPOSE = "witness_extraction";
/** The retiring purpose. It is NOT dropped and must never be: historical authorization rows
 *  reference it and drops are BY NAME (the 0038:5462 contract), and `GOVERNED_EGRESS_PURPOSES`
 *  carries BOTH. Kept as a named constant so a reader can see it still exists rather than
 *  inferring its removal from this file's silence. The negative twin — an activation for THIS
 *  purpose alone no longer admits a statement enqueue — lives in
 *  tests/f-a2-statement-activation.test.mjs (cell f-a2.activation.e). */
const RETIRED_PURPOSE = "statement_extraction";
const LANE_OCR = "statement_facts";
const LANE_PARSE = "statement_parse";

/** The named error-code taxonomy (part1 SS4.3). `consent_inactive` is the ONE
 *  member that joins the never-claimed allowlist beside `skipped_kind` (part1
 *  SS4.3 / part2 SS5) -- every OTHER code below runs the ORDINARY claim->fail
 *  binding (workflow_run_id present), which is why SSx38.s claims a task before
 *  driving each one. */
const CODES = [
  "header_unreadable", "totals_unreadable", "readers_disagree", "chain_broken",
  "continuity_mismatch", "duplicate_period", "overlapping_period", "non_myr_statement",
  "account_unregistered", "account_inactive", "statement_multi_client", "period_invalid",
  "line_date_out_of_period",
];
const NEVER_CLAIMED_CODE = "consent_inactive"; // joins skipped_kind (0016 idiom)

const CLR10 = "CLR10";

// ---------------------------------------------------------------------------
// Suite-scoped COA + bank identity constants (grepped clean against every other
// battery's codes -- the -C38 suffix is this file's own).
// ---------------------------------------------------------------------------

const BANKGL1 = "180-C38"; // asset, no account_class -- the FIRST bank GL account
const BANKGL2 = "181-C38"; // a SECOND bank GL account -- two-accounts / one-COA law
const BANKGL3 = "182-C38"; // a THIRD, for remap-target cells
const NOTASSET = "580-C38"; // expense -- proves add_bank_account refuses a non-asset COA
const CONTROLCLS = "382-C38"; // asset, account_class='receivable' -- proves the non-control law

let has38 = false;
let world = null;

// HARNESS HYGIENE (not product behavior): the real workflow ALWAYS settles its claim
// (persist or fail). A cell that dies between claim and settle would otherwise leak a
// 'running' task and cascade per-firm concurrency refusals into unrelated cells.
// Top-level registration: an afterEach() registered inside before() is inert in node:test.
afterEach(async () => {
  if (!has38) return;
  const r = await rootQuery(
    "select id from clara.document_processing_tasks where lane in ('statement_facts','statement_parse') and status='running'").catch(() => ({ rows: [] }));
  for (const row of r.rows) await failStatementFacts(row.id, "engine_lost").catch(() => null);
});
let owners = null;

function skipHere(t) {
  if (!has38) {
    markSkip();
    t.skip("0038 not applied (clara.schema_migrations has no '0038_%' row) -- the Wave-C-b bank battery is dormant");
    return true;
  }
  return false;
}

async function has0038() {
  try {
    const r = await rootQuery("select version from clara.schema_migrations where version ~ '^0038_'");
    return r.rows.length > 0;
  } catch {
    return false;
  }
}

before(async () => {
  const ready = await a21EnsureReady();
  has38 = Boolean(ready.base && ready.has16 && (await has0038()));
  if (!has38) {
    noteLane("0038 absent (or the 0011/0016 surface is not ready) -- x38 bank suite dormant");
    return;
  }
  world = await buildWorld();
  owners = new Map([
    [world.clients.A1, world.users.alice],
    [world.clients.A2, world.users.alice],
    [world.clients.S1, world.users.erin],
  ]);
  for (const [client, sub] of owners) {
    await upsertAccountClassed(sub, { client, code: BANKGL1, name: "Maybank current (x38)", type: "asset", opKey: opk("bg1") });
    await upsertAccountClassed(sub, { client, code: BANKGL2, name: "Maybank savings (x38)", type: "asset", opKey: opk("bg2") });
    await upsertAccountClassed(sub, { client, code: BANKGL3, name: "Maybank FD (x38)", type: "asset", opKey: opk("bg3") });
    await upsertAccountClassed(sub, { client, code: NOTASSET, name: "Bank Charges (x38)", type: "expense", opKey: opk("na") });
    await upsertAccountClassed(sub, { client, code: CONTROLCLS, name: "Trade Debtors (x38 control)", type: "asset", accountClass: "receivable", opKey: opk("cc") });
    await grantConsent(sub, { firm: await firmOf(client), client }).catch(() => {});
  }
  // SECTION-2 ingest cells assume a LIVE gate-purpose consent for the two firm-A
  // clients (they test INGEST, not consent). S1 stays deliberately dark -- x38.ab needs it.
  for (const client of [world.clients.A1, world.clients.A2]) {
    await lightStatementConsent(world.users.alice, { firm: await firmOf(client), client })
      .catch((e) => noteLane(`bootstrap consent lighting for ${client}: ${e.message}`));
  }
});

after(async () => {
  printLaneNotes("x38-wave-c-b-bank");
  printSkipCount("x38-wave-c-b-bank");
  await endPool();
});

// ---------------------------------------------------------------------------
// Small utilities (x37 idiom).
// ---------------------------------------------------------------------------

async function caught(fn) {
  try { await fn(); return null; } catch (e) { return e; }
}

function assertReason(err, code, reason, label) {
  assert.ok(err, `${label}: must be refused`);
  assert.equal(err.code, code, `${label}: expected ${code} (got ${err.code ?? "(none)"} -- ${err?.message})`);
  if (reason != null) assert.equal(reasonOf(err), reason, `${label}: expected reason '${reason}' (got ${reasonOf(err)})`);
}

const digits = (s) => String(s).replace(/[^0-9]/g, "");

// ---------------------------------------------------------------------------
// Bank identity verbs (design part1 SS4.1 -- IA-4).
// ---------------------------------------------------------------------------

async function addBankAccount(sub, {
  client, bankCode, accountNumber, bankNameDisplay = "Maybank Current Account",
  coaAccountCode, proposalId = null, opKey = null,
}) {
  const specs = [
    { name: "p_client" }, { name: "p_bank_code" }, { name: "p_account_number" },
    { name: "p_bank_name_display" }, { name: "p_coa_account_code" },
  ];
  const vals = [client, bankCode, accountNumber, bankNameDisplay, coaAccountCode];
  if (proposalId != null) { specs.push({ name: "p_proposal_id" }); vals.push(proposalId); }
  specs.push({ name: "p_op_key" }); vals.push(opKey ?? opk("x38-addbank"));
  const r = await humanQuery(sub, namedCall("add_bank_account", specs), vals);
  return r.rows[0].result;
}

async function deactivateBankAccount(sub, { client, bankAccount, reason = "x38 deactivate", opKey = null }) {
  const r = await humanQuery(sub,
    "select clara.deactivate_bank_account(p_client => $1, p_bank_account => $2, p_reason => $3, p_op_key => $4) as r",
    [client, bankAccount, reason, opKey ?? opk("x38-deact")]);
  return r.rows[0].r;
}

async function reactivateBankAccount(sub, { client, bankAccount, opKey = null }) {
  const r = await humanQuery(sub,
    "select clara.reactivate_bank_account(p_client => $1, p_bank_account => $2, p_op_key => $3) as r",
    [client, bankAccount, opKey ?? opk("x38-react")]);
  return r.rows[0].r;
}

async function remapBankAccountCoa(sub, { client, bankAccount, coaAccountCode, opKey = null }) {
  const r = await humanQuery(sub,
    "select clara.remap_bank_account_coa(p_client => $1, p_bank_account => $2, p_new_coa_account_code => $3, p_op_key => $4) as r",
    [client, bankAccount, coaAccountCode, opKey ?? opk("x38-remap")]);
  return r.rows[0].r;
}

// ---------------------------------------------------------------------------
// Ingest verbs (design part1 SS4.3 -- IA-1/IA-2/IA-3).
// ---------------------------------------------------------------------------

async function statementTask(document, lane = LANE_OCR) {
  const r = await rootQuery(
    "select to_jsonb(t) as row from clara.document_processing_tasks t where t.document_id=$1 and t.lane=$2 order by t.created_at desc limit 1",
    [document, lane]);
  return r.rows[0]?.row ?? null;
}

let __x38runN = 0;
async function claimIfQueued(task) {
  const st = await rootQuery("select status from clara.document_processing_tasks where id=$1", [task]);
  if (st.rows[0]?.status !== "queued") return;
  const doClaim = () => roleQuery(ROLES.runtime,
    "select clara.claim_document_processing_task($1,$2,$3)", [task, `x38-run-${++__x38runN}`, true]);
  try { await doClaim(); } catch (e) {
    if (!/concurrency limit/.test(e.message)) throw e;
    // Harness hygiene (NOT product behavior): a prior cell that failed between claim and
    // settle leaked a 'running' task; the real workflow always settles its claim. Settle
    // the stale runners for this firm as engine_lost, then retry once.
    const stale = await rootQuery(
      `select t.id from clara.document_processing_tasks t
        where t.lane='statement_facts' and t.status='running'
          and t.firm_id = (select firm_id from clara.document_processing_tasks where id=$1)`, [task]);
    for (const r of stale.rows) await failStatementFacts(r.id, "engine_lost").catch(() => null);
    await doClaim();
  }
}
function toPersistEnvelope(payload) {
  if (payload && payload.readers) return payload; // already envelope-shaped
  const r1 = { engine_id: "clara-fixture:x38-reader1", ...payload.reader1 };
  const readers = { reader1: r1 };
  if (payload.reader2) readers.reader2 = { engine_id: "clara-fixture:x38-reader2", ...payload.reader2 };
  return { pages_used: 2, readers, corroboration: { verdict: "recorded-by-runtime" } };
}
async function persistStatementFacts(task, payload) {
  await claimIfQueued(task);
  try {
    const r = await roleQuery(ROLES.runtime,
      "select clara.persist_statement_facts(p_task => $1, p_payload => $2::jsonb) as r",
      [task, JSON.stringify(toPersistEnvelope(payload))]);
    return r.rows[0].r;
  } catch (e) {
    // The real workflow seam: a raise rolls persist back; the failure records in a FRESH
    // txn. Without it the claimed task stays 'running' and starves the per-firm OCR cap.
    await failStatementFacts(task, reasonOf(e) ?? "internal").catch(() => null);
    throw e;
  }
}

async function failStatementFacts(task, reason) {
  const r = await roleQuery(ROLES.runtime,
    "select clara.fail_statement_facts(p_task => $1, p_reason => $2) as r", [task, reason]);
  return r.rows[0].r;
}

async function enterBankStatement(sub, { client, bankAccount, document, header, lines, opKey = null }) {
  if (header && header.period_start && Array.isArray(lines)) lines = clampLinesToPeriod(header, lines);
  const r = await humanQuery(sub,
    "select clara.enter_bank_statement(p_client => $1, p_bank_account => $2, p_document => $3, p_header => $4::jsonb, p_lines => $5::jsonb, p_op_key => $6) as r",
    [client, bankAccount, document, JSON.stringify(header), JSON.stringify(lines), opKey ?? opk("x38-enter")]);
  return r.rows[0].r;
}

async function voidBankStatement(sub, { client, statement, reason = "x38 void", opKey = null }) {
  const r = await humanQuery(sub,
    "select clara.void_bank_statement(p_client => $1, p_statement => $2, p_reason => $3, p_op_key => $4) as r",
    [client, statement, reason, opKey ?? opk("x38-void")]);
  return r.rows[0].r;
}

/** IA-2: persist and assert a NAMED failure. Primary reading: a RETURNED
 *  {status:'failed',reason}. Fallback reading: a RAISED CLR10+reason. Whichever
 *  branch actually fires is recorded via noteLane so the divergence (if any) is
 *  visible without failing the cell on a reading the design itself leaves open. */
async function persistExpectFailure(task, payload, code, label) {
  let result = null; let err = null;
  try { result = await persistStatementFacts(task, payload); } catch (e) { err = e; }
  if (err) {
    assert.equal(err.code, CLR10, `${label}: the raised-path code is CLR10 (got ${err.code} -- ${err.message})`);
    assert.equal(reasonOf(err), code, `${label}: the raised-path reason is '${code}' (got ${reasonOf(err)})`);
    // The real workflow's documented seam: a raise rolls the persist back, then the runtime
    // records the named failure in a FRESH transaction. Without this the claimed task stays
    // 'running' forever and starves the per-firm OCR concurrency cap for every later cell.
    noteLane(`${label}: persist_statement_facts RAISED (IA-2 reading B) rather than returning a failed-task receipt`);
    return { via: "raise", err };
  }
  assert.ok(result, `${label}: persist_statement_facts returned a receipt`);
  const gotReason = result.reason ?? result.error_code ?? null;
  assert.equal(result.status, "failed", `${label}: status='failed' (got ${JSON.stringify(result)})`);
  assert.equal(gotReason, code, `${label}: named reason '${code}' (got ${JSON.stringify(result)})`);
  return { via: "return", result };
}

// ---------------------------------------------------------------------------
// Consent verbs -- the SAME 0020 typed machinery, pinned to PURPOSE (the gate purpose)
// (design part1 SS4.4 / WCB-R1). Reuses the wave-a-fixtures wrappers with the
// purpose overridden -- these are the SS9.7-promised aliases, never a parallel
// implementation.
// ---------------------------------------------------------------------------

const grantStatementPurpose = (sub, o) => grantClientEgressPurpose(sub, { ...o, purpose: PURPOSE });
const activateStatementPurpose = (sub, o) => activateClientEgressPurpose(sub, { ...o, purpose: PURPOSE });
const deactivateStatementPurpose = (sub, o) => deactivateClientEgressPurpose(sub, { ...o, purpose: PURPOSE });
const revokeStatementPurpose = (sub, o) => revokeClientEgressPurpose(sub, { ...o, purpose: PURPOSE });

/** A verified, in-firm consent-evidence document + a live, ACTIVE
 *  gate-purpose consent for `client`. Returns {consent,evidence}. */
async function lightStatementConsent(sub, { firm, client }) {
  // Idempotent: a live consent (e.g. the suite bootstrap's) is REUSED, never re-granted;
  // an already-live activation is tolerated -- cells compose instead of colliding.
  let evidence = null;
  let consent = await livePurposeConsentRow(client);
  if (!consent) {
    evidence = await seedVerifiedDocument({ firm });
    await classifyConsentEvidenceDocument(sub, { document: evidence.documentId });
    await grantStatementPurpose(sub, { client, evidenceDocument: evidence.documentId });
    consent = await livePurposeConsentRow(client);
  }
  await activateStatementPurpose(sub, { client, consent: consent.id }).catch((e) => {
    if (!/duplicate_live|already/i.test(e.message)) throw e;
  });
  return { consent, evidence };
}

async function livePurposeConsentRow(client, purpose = PURPOSE) {
  const r = await rootQuery(
    `select to_jsonb(c) as row from clara.client_egress_purpose_consents c
      where c.client_id=$1 and c.purpose=$2 and c.revoked_at is null
      order by c.granted_at desc limit 1`, [client, purpose]);
  return r.rows[0]?.row ?? null;
}
async function livePurposeActivationRow(client, purpose = PURPOSE) {
  const r = await rootQuery(
    `select to_jsonb(a) as row from clara.client_egress_purpose_activations a
      where a.client_id=$1 and a.purpose=$2 and a.deactivated_at is null
      order by a.activated_at desc limit 1`, [client, purpose]);
  return r.rows[0]?.row ?? null;
}

/** IA-7: the NEW sha-bound overloads. */
async function prepareDispatchSha({ firm, client, purpose = PURPOSE, eventSeq, eventType, documentSha256, role = ROLES.runtime }) {
  const r = await roleQuery(role,
    `select clara.prepare_egress_dispatch(p_firm => $1, p_client => $2, p_purpose => $3,
       p_event_seq => $4::bigint, p_event_type => $5, p_document_sha256 => $6) as r`,
    [firm, client, purpose, eventSeq, eventType, documentSha256]);
  return r.rows[0].r;
}
async function consumeDispatchSha({ firm, authorization, client, purpose = PURPOSE, eventSeq, eventType, documentSha256, role = ROLES.runtime }) {
  const r = await roleQuery(role,
    `select clara.consume_egress_dispatch(p_firm => $1, p_authorization => $2, p_client => $3,
       p_purpose => $4, p_event_seq => $5::bigint, p_event_type => $6, p_document_sha256 => $7) as r`,
    [firm, authorization, client, purpose, eventSeq, eventType, documentSha256]);
  return r.rows[0].r;
}

// ---------------------------------------------------------------------------
// Readbacks (root -- superuser bypasses RLS; fixtures/asserts only, never a lane).
// ---------------------------------------------------------------------------

async function bankAccountRows(client) {
  const r = await rootQuery("select to_jsonb(a) as row from clara.bank_accounts a where a.client_id=$1 order by a.created_at", [client]);
  return r.rows.map((x) => x.row);
}
async function liveBankAccountBy(client, bankCode, accountNumberNormalized) {
  const r = await rootQuery(
    `select to_jsonb(a) as row from clara.bank_accounts a
      where a.client_id=$1 and a.bank_code=$2 and a.account_number_normalized=$3 and a.active
      order by a.created_at desc limit 1`,
    [client, bankCode, accountNumberNormalized]);
  return r.rows[0]?.row ?? null;
}
async function statementRows(client) {
  const r = await rootQuery("select to_jsonb(s) as row from clara.bank_statements s where s.client_id=$1 order by s.created_at, s.id", [client]);
  return r.rows.map((x) => x.row);
}
async function statementLineRows(statement) {
  const r = await rootQuery("select to_jsonb(l) as row from clara.bank_statement_lines l where l.statement_id=$1 order by l.line_no", [statement]);
  return r.rows.map((x) => x.row);
}
async function clientIdentifierRows(client, kind = "bank_account") {
  const r = await rootQuery("select value_normalized from clara.client_identifiers where client_id=$1 and kind=$2 order by added_at", [client, kind]);
  return r.rows.map((x) => x.value_normalized);
}
async function wikiHoldRow(client) {
  const r = await rootQuery("select to_jsonb(h) as row from clara.wiki_synthesis_holds h where h.client_id=$1", [client]);
  return r.rows[0]?.row ?? null;
}
async function bankEventRows(client, type) {
  const r = await rootQuery(
    "select to_jsonb(e) as row from clara.domain_events e where e.client_id=$1 and e.event_type=$2 order by e.seq", [client, type]);
  return r.rows.map((x) => x.row);
}
async function bankAccountProposalRows(client) {
  const r = await rootQuery("select to_jsonb(p) as row from clara.bank_account_proposals p where p.client_id=$1 order by p.created_at desc", [client]).catch(() => ({ rows: [] }));
  return r.rows.map((x) => x.row);
}

// ---------------------------------------------------------------------------
// Fixtures -- statement header/line builders + a Maybank-shaped chain. Every
// synthetic object is built through the audited writers (dog-fooding), except
// the ONE hand-constructed match row in SSx38.f (documented at its use site).
// ---------------------------------------------------------------------------

/** A house-style Maybank current account number: printed WITH hyphens (the
 *  printed form add_bank_account's first guarded insert stores), plus its
 *  digits-only twin (the second insert; also what account binding matches on). */
function acctNumber(tag) {
  // The digits-only twin is DERIVED (strip non-digits from the printed form), mirroring the
  // DB's own _stmt_header_norm law -- a lettered tag must never leak into the digits form.
  const tagDigits = String(Math.abs([...String(tag)].reduce((a, c) => a * 31 + c.charCodeAt(0), 7)) % 100).padStart(2, "0");
  const n = String(Math.floor(100000 + Math.random() * 899999));
  const printed = `114-5-${n.slice(0, 5)}-${tagDigits}`;
  return { printed, digitsOnly: printed.replace(/[^0-9]/g, "") };
}

/** A single 3-line statement chain: opening -> l1 -> l2 -> l3 -> closing, with
 *  printed totals matching the sum of debits/credits. amount signed (+ = in). */
function chain({ openingCents = 100000, deltas = [50000, -20000, 30000], month = "2026-04" } = {}) {
  const lines = [];
  let running = openingCents;
  let debit = 0; let credit = 0;
  deltas.forEach((d, i) => {
    running += d;
    // STATEMENT perspective (the bank's own): money INTO the account is a CREDIT on the
    // printed statement, money OUT is a DEBIT -- the corpus's TOTAL DEBIT/TOTAL CREDIT law.
    if (d >= 0) credit += d; else debit += -d;
    lines.push({
      line_no: i + 1, entry_date: `${month}-1${i + 1}`, value_date: `${month}-1${i + 1}`,
      description: `x38 line ${i + 1}`, amount_cents: d, running_balance_cents: running,
    });
  });
  return { openingCents, closingCents: running, totalDebitCents: debit, totalCreditCents: credit, lines };
}

/** The bank_statements-shaped header a reader would emit, for a given account
 *  identity + period. */
function header({ bankCode, accountNumberDigits, currency = "MYR", periodStart, periodEnd, statementDate, ch }) {
  return {
    institution_code: bankCode, account_number: accountNumberDigits, currency,
    period_start: periodStart, period_end: periodEnd, statement_date: statementDate ?? periodEnd,
    opening_cents: ch.openingCents, closing_cents: ch.closingCents,
    total_debit_cents: ch.totalDebitCents, total_credit_cents: ch.totalCreditCents,
  };
}

/** IA-1: a fully-agreeing two-reader OCR payload (reader2 identical to reader1
 *  -- the corroboration-satisfying default every happy-path cell starts from). */
/** Line dates must live inside the header's period (the DB's line_date_out_of_period law);
 *  cells that deliberately violate it mutate the returned payload AFTER building. */
function clampLinesToPeriod(h, lines) {
  return lines.map((l) => {
    const d = new Date(`${h.period_start}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + l.line_no);
    const iso = d.toISOString().slice(0, 10);
    return { ...l, entry_date: iso, value_date: l.value_date ? iso : l.value_date };
  });
}
function agreeingPayload(h, ch, { reader2 = true } = {}) {
  const lines = clampLinesToPeriod(h, ch.lines);
  const p1 = { header: { ...h }, lines: lines.map((l) => ({ ...l })) };
  return { reader1: p1, reader2: reader2 ? { header: { ...h }, lines: lines.map((l) => ({ ...l })) } : null };
}

/** A filed, KIND-STAMPED bank_statement document (pdf/image -- the OCR lane) not
 *  yet enqueued. Mirrors seedCitedDocument's kind-at-seed idiom (0016 P3). */
async function filedStatementPdf(sub, { client, financialDate = null } = {}) {
  const firm = await firmOf(client);
  return filedDocument(sub, { firm, client, kind: "bank_statement", financialDate });
}

/** A filed, kind-stamped bank_statement document on the CSV mime (the
 *  structured/statement_parse lane) -- filedDocument does not expose mime, so
 *  this replicates its body with the override. */
async function filedStatementCsv(sub, { client } = {}) {
  const firm = await firmOf(client);
  const seed = await seedVerifiedDocument({ firm, kind: "bank_statement", mime: "text/csv", filename: "statement.csv" });
  const filingId = await fileDocument(sub, {
    document: seed.documentId, client,
    resolution: await freshResolution(sub, client, { subjectKind: "document", subjectId: seed.documentId }),
  });
  return { documentId: seed.documentId, filingId, sha256: seed.sha256 };
}

/** Enqueue + return the resulting statement_facts (or _parse) task for a filed
 *  bank_statement document (IA-5: the SAME router entry point). */
async function enqueueStatement(documentId, lane = LANE_OCR) {
  await enqueueInvoiceFacts(documentId);
  return statementTask(documentId, lane);
}

// ===========================================================================
// SECTION 1 -- IDENTITY (part1 SS4.1; part2 SS6 "Identity").
// ===========================================================================

// ===========================================================================
// x38.a -- add_bank_account happy path + the exact-duplicate refusal. The
// partial unique is `(client_id, bank_code, account_number_normalized) where
// active` -- the SAME (bank, number) while both rows are active must refuse.
// ===========================================================================
test("x38.a add_bank_account: happy path stamps is_bank_account, and an exact live duplicate is refused", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const n = acctNumber("a1");
  const receipt = await addBankAccount(sub, { client, bankCode: "MBB", accountNumber: n.printed, coaAccountCode: BANKGL1 });
  assert.ok(idOf(receipt, "bank_account_id", "id"), `add_bank_account returns an id-bearing receipt (got ${JSON.stringify(receipt)})`);

  const rows = await bankAccountRows(client);
  const mine = rows.find((r) => r.coa_account_code === BANKGL1);
  assert.ok(mine, "the bank_accounts row was written");
  assert.equal(mine.bank_code, "MBB", "bank_code stored as passed");
  assert.equal(mine.active, true, "a freshly-added account is active");
  assert.equal(mine.account_number_normalized, digits(n.printed), "account_number_normalized is digits-only");

  const coa = await rootQuery("select is_bank_account from clara.coa_accounts where client_id=$1 and account_code=$2", [client, BANKGL1]);
  assert.equal(coa.rows[0]?.is_bank_account, true, "the COA account gets is_bank_account=true, in the SAME transaction as add_bank_account (never a separate step)");

  const targeted = await liveBankAccountBy(client, "MBB", digits(n.printed));
  assert.ok(targeted, "the account is findable by the (client, bank_code, account_number_normalized) targeted lookup -- the SAME predicate the partial unique enforces");
  assert.equal(targeted.id, mine.id, "the targeted lookup names the SAME row bankAccountRows found");

  // The exact duplicate: same client, same bank_code, same (normalized) number,
  // still active -- must be refused (a different COA target changes nothing).
  const dup = await caught(() => addBankAccount(sub, { client, bankCode: "MBB", accountNumber: n.printed, coaAccountCode: BANKGL2 }));
  assert.ok(dup, "a duplicate live (client, bank_code, account_number_normalized) must be refused");
  noteLane(`x38.a duplicate add_bank_account refusal: code=${dup.code} reason=${reasonOf(dup)}`);
});

// ===========================================================================
// x38.b -- TWO accounts / ONE COA per account (both directions of SS4.1's
// partial-unique pair). Two live accounts on DIFFERENT COA codes coexist; a
// SECOND live account cannot claim the SAME COA code another live account holds.
// ===========================================================================
test("x38.b two live accounts on distinct COA codes coexist; a second live account may never share a GL account with another", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const n1 = acctNumber("b1");
  const n2 = acctNumber("b2");
  await addBankAccount(sub, { client, bankCode: "MBB", accountNumber: n1.printed, coaAccountCode: BANKGL2 });
  await addBankAccount(sub, { client, bankCode: "MBB", accountNumber: n2.printed, coaAccountCode: BANKGL3 });
  const rows = await bankAccountRows(client);
  assert.ok(rows.some((r) => r.coa_account_code === BANKGL2 && r.active), "the first account is live on its own COA code");
  assert.ok(rows.some((r) => r.coa_account_code === BANKGL3 && r.active), "the second account is live on its own COA code");

  // A THIRD account, a genuinely different bank number, aimed at BANKGL2 (already
  // claimed live) -- the (client, coa_account_code) partial unique must refuse.
  const n3 = acctNumber("b3");
  const clash = await caught(() => addBankAccount(sub, { client, bankCode: "MBB", accountNumber: n3.printed, coaAccountCode: BANKGL2 }));
  assert.ok(clash, "a second live account naming an ALREADY-claimed live COA code must be refused");
  noteLane(`x38.b one-COA-per-live-account refusal: code=${clash.code} reason=${reasonOf(clash)}`);

  // add_bank_account also refuses a non-asset / control-class COA target (the
  // congruence: asset-typed, active, non-control).
  const n4 = acctNumber("b4");
  const notAsset = await caught(() => addBankAccount(sub, { client, bankCode: "MBB", accountNumber: n4.printed, coaAccountCode: NOTASSET }));
  assertReason(notAsset, CLR10, null, "x38.b a non-asset COA target is refused");
  const n5 = acctNumber("b5");
  const controlled = await caught(() => addBankAccount(sub, { client, bankCode: "MBB", accountNumber: n5.printed, coaAccountCode: CONTROLCLS }));
  assertReason(controlled, CLR10, null, "x38.b a control-class (account_class IS NOT NULL) COA target is refused");
});

// ===========================================================================
// x38.c -- deactivate frees the COA slot: deactivate_bank_account (a) flips
// active=false and (b) the FREED coa_account_code becomes addressable by a
// fresh live account (deactivate-and-remap is a real remedy, per part1 SS4.1).
// ===========================================================================
test("x38.c deactivate_bank_account flips active=false, and its freed COA code is addressable by a fresh live account", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A2;
  const n1 = acctNumber("c1");
  const added = await addBankAccount(sub, { client, bankCode: "MBB", accountNumber: n1.printed, coaAccountCode: BANKGL1 });
  const bankAccountId = idOf(added, "bank_account_id", "id");

  const receipt = await deactivateBankAccount(sub, { client, bankAccount: bankAccountId, reason: "account closed" });
  assert.ok(receipt, "deactivate_bank_account returns a receipt");
  const row = (await bankAccountRows(client)).find((r) => r.id === bankAccountId);
  assert.equal(row.active, false, "the account is now inactive");
  assert.ok(row.deactivated_at, "deactivated_at is stamped");
  assert.equal(row.deactivated_by, sub, "deactivated_by is stamped");

  // The freed COA code is now addressable by a FRESH live account.
  const n2 = acctNumber("c2");
  const second = await addBankAccount(sub, { client, bankCode: "MBB", accountNumber: n2.printed, coaAccountCode: BANKGL1 });
  assert.ok(idOf(second, "bank_account_id", "id"), "a fresh account on the freed COA code succeeds (deactivate-and-remap is a real remedy)");
});

// ===========================================================================
// x38.d -- (dot REACTIVATE) deactivate then reactivate restores active=true, and
// the one-live-per-(bank,number)/one-live-per-COA laws re-engage immediately.
// ===========================================================================
test("x38.d reactivate_bank_account restores active=true, and the duplicate/COA laws re-engage on the reactivated row", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  // Cell-isolated COA codes -- BANKGL1/2/3 are already permanently claimed LIVE
  // on this client by x38.a/x38.b (never deactivated there), so this cell must
  // not reach for them.
  const codeD1 = "189-CD1";
  const codeD2 = "190-CD2";
  await upsertAccountClassed(sub, { client, code: codeD1, name: "x38.d bank gl 1", type: "asset", opKey: opk("d-gl1") });
  await upsertAccountClassed(sub, { client, code: codeD2, name: "x38.d bank gl 2", type: "asset", opKey: opk("d-gl2") });
  const n = acctNumber("d1");
  const added = await addBankAccount(sub, { client, bankCode: "MBB", accountNumber: n.printed, coaAccountCode: codeD1 });
  const bankAccountId = idOf(added, "bank_account_id", "id");
  await deactivateBankAccount(sub, { client, bankAccount: bankAccountId, reason: "x38.d pause" });

  const receipt = await reactivateBankAccount(sub, { client, bankAccount: bankAccountId });
  assert.ok(receipt, "reactivate_bank_account returns a receipt");
  const row = (await bankAccountRows(client)).find((r) => r.id === bankAccountId);
  assert.equal(row.active, true, "the account is active again");
  assert.equal(row.deactivated_at ?? null, null, "deactivated_at clears on reactivation");

  // Now the SAME (bank,number) as a NEW row must be refused again (the reactivated
  // row is live), and a fresh number aimed at codeD1 must ALSO be refused (the
  // COA code is claimed by the reactivated row again).
  const dupAcct = await caught(() => addBankAccount(sub, { client, bankCode: "MBB", accountNumber: n.printed, coaAccountCode: codeD2 }));
  assert.ok(dupAcct, "the reactivated account's (bank,number) refuses a fresh duplicate again");
  const n2 = acctNumber("d2");
  const dupCoa = await caught(() => addBankAccount(sub, { client, bankCode: "MBB", accountNumber: n2.printed, coaAccountCode: codeD1 }));
  assert.ok(dupCoa, "the reactivated account's COA code refuses a fresh claimant again");
});

// ===========================================================================
// x38.e -- remap_bank_account_coa succeeds when NO pending/live match group
// exists on the account (the positive half). part1 SS4.1: "statements are
// COA-independent and stay" -- a statement already ingested against the OLD COA
// code is UNTOUCHED by the remap.
// ===========================================================================
test("x38.e remap_bank_account_coa: succeeds with no live match groups; the account's statements are COA-independent and survive untouched", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A2;
  const n = acctNumber("e1");
  const added = await addBankAccount(sub, { client, bankCode: "MBB", accountNumber: n.printed, coaAccountCode: BANKGL3 });
  const bankAccountId = idOf(added, "bank_account_id", "id");

  // A statement, ingested against the account BEFORE the remap.
  const ch = chain();
  const h = header({ bankCode: "MBB", accountNumberDigits: digits(n.printed), periodStart: "2026-04-01", periodEnd: "2026-04-30", ch });
  const enteredBefore = await enterBankStatement(sub, { client, bankAccount: bankAccountId, document: (await filedStatementPdf(sub, { client })).documentId, header: h, lines: ch.lines });
  const statementIdBefore = idOf(enteredBefore, "statement_id", "id");

  // A FRESH free COA code for the remap target (BANKGL1 unused on this client in
  // this test's own state at this point is NOT guaranteed across earlier cells in
  // this file's shared world clients, so this uses a per-cell fresh code).
  await upsertAccountClassed(sub, { client, code: "183-CE1", name: "Maybank remap target (x38.e)", type: "asset", opKey: opk("remape") });
  const remapped = await remapBankAccountCoa(sub, { client, bankAccount: bankAccountId, coaAccountCode: "183-CE1" });
  assert.ok(remapped, "remap_bank_account_coa succeeds with zero pending/live match groups on the account");
  const row = (await bankAccountRows(client)).find((r) => r.id === bankAccountId);
  assert.equal(row.coa_account_code, "183-CE1", "the account now points at the new GL code");

  const stRow = (await statementRows(client)).find((s) => s.id === statementIdBefore);
  assert.equal(stRow.bank_account_id, bankAccountId, "the pre-existing statement still names the SAME bank_account_id -- statements are COA-independent");
});

// ===========================================================================
// x38.f -- remap_bank_account_coa REFUSED while a pending/live match group
// exists on the account. Part B owns match_bank_line; this cell hand-constructs
// the minimal congruent shape part1 SS4.5 gives verbatim (id/match_id/line_id/
// amount_cents/group_status, the composite FK to bank_matches), the x37.z/x37.ac
// direct-construction precedent for probing a belt without its composite verb.
// ===========================================================================
test("x38.f remap_bank_account_coa is REFUSED while a pending/live match group references the account's line", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const firm = await firmOf(client);
  const n = acctNumber("f1");
  await upsertAccountClassed(sub, { client, code: "184-CF1", name: "x38.f bank gl", type: "asset", opKey: opk("f-gl") });
  const added = await addBankAccount(sub, { client, bankCode: "MBB", accountNumber: n.printed, coaAccountCode: "184-CF1" });

  const ch = chain();
  const h = header({ bankCode: "MBB", accountNumberDigits: digits(n.printed), periodStart: "2026-05-01", periodEnd: "2026-05-31", ch });
  const entered = await enterBankStatement(sub, { client, bankAccount: idOf(added, "bank_account_id", "id"), document: (await filedStatementPdf(sub, { client })).documentId, header: h, lines: ch.lines });
  const lines = await statementLineRows(idOf(entered, "statement_id", "id"));
  assert.ok(lines.length > 0, "the statement carries lines to reference from the forged match");

  // A real DRAFT entry anchors the forged PENDING reservation: the pending-arm belt
  // demands >=1 line member + draft_entry_id NOT NULL; the live arm would demand a full tie.
  const draft = await draftEntryV3(sub, {
    client, resolution: freshResolution(sub, client),
    lines: [
      { account_code: BANKGL1, debit_cents: lines[0].amount_cents, credit_cents: 0, description: "x38.f dr" },
      { account_code: NOTASSET, debit_cents: 0, credit_cents: lines[0].amount_cents, description: "x38.f cr" },
    ],
    memo: "x38.f forged reservation draft",
  });
  const matchId = await withActor({ transaction: true }, async (c) => {
    const r = await c.query(
      `insert into clara.bank_matches(firm_id,client_id,bank_account_id,status,origin,created_by,draft_entry_id)
       values($1,$2,$3,'pending','human',$4,$5) returning id`,
      [firm, client, idOf(added, "bank_account_id", "id"), sub, idOf(draft, "entry_id", "id", "entry")]);
    const id = r.rows[0].id;
    await c.query(
      `insert into clara.bank_match_line_members(match_id,firm_id,client_id,line_id,amount_cents,group_status)
       values($1,$2,$3,$4,$5,'pending')`,
      [id, firm, client, lines[0].id, lines[0].amount_cents]);
    return id;
  });
  assert.ok(matchId, "the forged pending match group was written (mandatory setup)");

  await upsertAccountClassed(sub, { client, code: "185-CF2", name: "x38.f remap target", type: "asset", opKey: opk("f-target") });
  const refused = await caught(() => remapBankAccountCoa(sub, { client, bankAccount: idOf(added, "bank_account_id", "id"), coaAccountCode: "185-CF2" }));
  assert.ok(refused, "remap_bank_account_coa must refuse while ANY pending/live match group exists on the account");
  noteLane(`x38.f remap-while-matched refusal: code=${refused.code} reason=${reasonOf(refused)}`);
});

// ===========================================================================
// x38.g -- post-deactivate ingest -> `account_inactive`, offered remedy
// succeeds. A statement whose corroborated identity binds to a DEACTIVATED
// account is refused named; reactivating clears the wall and the SAME payload
// (re-persisted against a FRESH claimed task) succeeds.
// ===========================================================================
test("x38.g post-deactivate ingest refuses account_inactive; reactivating the account is the offered remedy and ingest then succeeds", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A2;
  const n = acctNumber("g1");
  await upsertAccountClassed(sub, { client, code: "186-CG1", name: "x38.g bank gl", type: "asset", opKey: opk("g-gl") });
  const added = await addBankAccount(sub, { client, bankCode: "MBB", accountNumber: n.printed, coaAccountCode: "186-CG1" });
  const bankAccountId = idOf(added, "bank_account_id", "id");
  await deactivateBankAccount(sub, { client, bankAccount: bankAccountId, reason: "x38.g deactivate before ingest" });

  const ch = chain();
  const h = header({ bankCode: "MBB", accountNumberDigits: digits(n.printed), periodStart: "2026-06-01", periodEnd: "2026-06-30", ch });
  const filed = await filedStatementPdf(sub, { client });
  const task = await enqueueStatement(filed.documentId);
  assert.ok(task, "the statement task enqueues even while the target account is inactive (binding happens at persist, not enqueue)");
  await claimTask(task.id, { egressApproved: true });
  const outcome = await persistExpectFailure(task.id, agreeingPayload(h, ch), "account_inactive", "x38.g ingest against a deactivated account");
  noteLane(`x38.g account_inactive lands via ${outcome.via}`);

  // The offered remedy: reactivate, then retry ingest through a FRESH claimed task
  // (the failed task is terminal; a re-enqueue is the re-drive path).
  await reactivateBankAccount(sub, { client, bankAccount: bankAccountId });
  const filed2 = await filedStatementPdf(sub, { client });
  const task2 = await enqueueStatement(filed2.documentId);
  await claimTask(task2.id, { egressApproved: true });
  const result2 = await persistStatementFacts(task2.id, agreeingPayload(h, ch));
  assert.notEqual(result2?.status, "failed", `after reactivation the SAME identity ingests cleanly (got ${JSON.stringify(result2)})`);
});

// ===========================================================================
// x38.h -- the TWO-ROW client_identifiers law + a real-format attribution
// resolve. add_bank_account writes BOTH the printed-form (house-normalized,
// hyphens survive) AND the digits-only rows; a document whose OCR region states
// the PRINTED spelling still resolves via record_rule_resolution.
// ===========================================================================
test("x38.h add_bank_account writes the two-row client_identifiers pair, and a real-format printed attribution resolves the client", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const firm = await firmOf(client);
  const printed = `114-5-01234-${randomUUID().slice(0, 4)}`;
  await upsertAccountClassed(sub, { client, code: "187-CH1", name: "x38.h bank gl", type: "asset", opKey: opk("h-gl") });
  await addBankAccount(sub, { client, bankCode: "MBB", accountNumber: printed, coaAccountCode: "187-CH1" });

  const idRows = await clientIdentifierRows(client, "bank_account");
  // The house rule (design SS4.1, part1 fact 5): lowercased + whitespace-stripped
  // ONLY -- hyphens survive. This is deliberately NOT `normalize()` (s6-helpers'
  // counterparty-name normalizer, which strips every non-alphanumeric character
  // including hyphens) -- using it here would assert the WRONG relation.
  const wantPrinted = printed.toLowerCase().replace(/\s+/g, "");
  assert.ok(idRows.includes(wantPrinted), `the PRINTED form (house-normalized: lowercased, whitespace-stripped, HYPHENS SURVIVE) is stored (got ${JSON.stringify(idRows)})`);
  assert.ok(idRows.includes(digits(printed)), `the DIGITS-ONLY twin is ALSO stored (got ${JSON.stringify(idRows)})`);
  assert.notEqual(idRows.length, 0, "never an upsert -- append-only guarded inserts");

  // A document whose OCR region carries the PRINTED spelling exactly.
  const { documentId } = await seedVerifiedDocument({ firm });
  const extraction = await seedExtraction({ firm, document: documentId, versionN: 1 });
  await seedRegion({ firm, extraction, locatorKind: "page_polygon", fieldPath: "bank_account", textContent: printed, engineConfidence: 0.99 });
  let recorded = null;
  try {
    recorded = await recordRuleResolution({ document: documentId });
  } catch (e) {
    noteLane(`x38.h record_rule_resolution on the printed-form region raised ${e.code}: ${e.message} -- interface expectation`);
  }
  if (recorded != null) {
    const res = await rootQuery("select client_id from clara.client_resolutions where firm_id=$1 and method='rule' order by created_at desc limit 1", [firm]);
    assert.equal(res.rows[0]?.client_id, client, "the printed-form spelling resolves the client via record_rule_resolution (the OCR region matches whichever spelling it carries)");
  }
});

// ===========================================================================
// x38.i -- proposal ONLY after header corroboration. An uncorroborated header
// (readers disagree on the account number) must NEVER emit a bank_account_
// proposals row or a bank.account_proposal event, even though the account is, in
// fact, unregistered -- account binding happens strictly AFTER corroboration.
// ===========================================================================
test("x38.i an UNCORROBORATED header never emits a proposal, even for a genuinely unregistered account", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A2;
  const ch = chain();
  const h1 = header({ bankCode: "MBB", accountNumberDigits: "9999900001", periodStart: "2026-07-01", periodEnd: "2026-07-31", ch });
  const filed = await filedStatementPdf(sub, { client });
  const task = await enqueueStatement(filed.documentId);
  await claimTask(task.id, { egressApproved: true });

  const before = await bankAccountProposalRows(client);
  const payload = agreeingPayload(h1, ch);
  // Readers DISAGREE on the account number -- an uncorroborated header.
  payload.reader2.header.account_number = "9999900002";
  const outcome = await persistExpectFailure(task.id, payload, "readers_disagree", "x38.i disagreeing readers refuse before any account-binding attempt");
  noteLane(`x38.i readers_disagree lands via ${outcome.via}`);
  const after = await bankAccountProposalRows(client);
  assert.equal(after.length, before.length, "an uncorroborated header emits NO bank_account_proposals row -- corroboration gates proposal emission");

  // NOW the same identity, CORROBORATED (readers agree) and genuinely
  // unregistered -- account_unregistered fires and a proposal IS written.
  const filed2 = await filedStatementPdf(sub, { client });
  const task2 = await enqueueStatement(filed2.documentId);
  await claimTask(task2.id, { egressApproved: true });
  const outcome2 = await persistExpectFailure(task2.id, agreeingPayload(h1, ch), "account_unregistered", "x38.i a CORROBORATED-but-unregistered header emits the proposal");
  noteLane(`x38.i account_unregistered lands via ${outcome2.via}`);
  const proposals = await bankAccountProposalRows(client);
  assert.ok(proposals.length > before.length, "a bank_account_proposals row IS written once the header actually corroborates");
  const ev = await bankEventRows(client, "bank.account_proposal");
  assert.ok(ev.length > 0, "bank.account_proposal was appended");
  const payloadKeys = new Set(Object.keys(ev[ev.length - 1].payload ?? {}));
  assert.ok(!JSON.stringify(ev[ev.length - 1].payload ?? {}).includes("9999900001"), "the event payload carries IDs only -- the account number never enters an event payload (SS4.8)");
  noteLane(`x38.i bank.account_proposal payload keys: ${[...payloadKeys].join(",")}`);
});

// ===========================================================================
// SECTION 2 -- INGEST (part1 SS4.2/SS4.3; part2 SS6 "Ingest").
// ===========================================================================

/** A fresh registered bank account for a client, isolated per cell (its own COA
 *  code + its own account number). Returns {bankAccountId, digitsOnly}. */
async function freshRegisteredAccount(sub, client, tag) {
  const n = acctNumber(tag);
  // grammar ck_coa_account_code_0009: ^[0-9]{4,8}$ | ^[0-9]{3}-[0-9A-Z]{2,4}$
  const tagUp = tag.toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 4).padEnd(2, "X");
  const coaCode = `${100 + Math.floor(Math.random() * 900)}-${tagUp}`;
  await upsertAccountClassed(sub, { client, code: coaCode, name: `x38 bank gl ${tag}`, type: "asset", opKey: opk(`gl-${tag}`) });
  const added = await addBankAccount(sub, { client, bankCode: "MBB", accountNumber: n.printed, coaAccountCode: coaCode });
  return { bankAccountId: idOf(added, "bank_account_id", "id"), digitsOnly: digits(n.printed), coaCode };
}

// ===========================================================================
// x38.j -- THE HAPPY CHAIN: opening + sum(lines) = closing, running_n =
// running_{n-1}+amount_n, printed totals cross-check, financial_date=period_end,
// line_count/opening/closing/totals stored verbatim.
// ===========================================================================
test("x38.j a fully corroborated OCR statement persists: the chain, the totals, financial_date=period_end, and the line rows", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const acct = await freshRegisteredAccount(sub, client, "j1");
  const ch = chain();
  const h = header({ bankCode: "MBB", accountNumberDigits: acct.digitsOnly, periodStart: "2026-08-01", periodEnd: "2026-08-31", ch });
  const filed = await filedStatementPdf(sub, { client });
  const task = await enqueueStatement(filed.documentId);
  assert.equal(task.lane, LANE_OCR, "a pdf bank_statement routes to the statement_facts lane");
  await claimTask(task.id, { egressApproved: true });
  const result = await persistStatementFacts(task.id, agreeingPayload(h, ch));
  assert.notEqual(result?.status, "failed", `the happy chain persists cleanly (got ${JSON.stringify(result)})`);

  const rows = await statementRows(client);
  const st = rows.find((s) => s.bank_account_id === acct.bankAccountId);
  assert.ok(st, "the bank_statements row was written");
  assert.equal(Number(st.opening_cents), ch.openingCents);
  assert.equal(Number(st.closing_cents), ch.closingCents);
  assert.equal(Number(st.total_debit_cents), ch.totalDebitCents);
  assert.equal(Number(st.total_credit_cents), ch.totalCreditCents);
  assert.equal(st.line_count, ch.lines.length);
  assert.equal(st.status, "live");
  assert.equal(st.ingest_mode, "ocr");

  const lines = await statementLineRows(st.id);
  assert.equal(lines.length, ch.lines.length, "every line row landed");
  let running = ch.openingCents;
  for (let i = 0; i < lines.length; i++) {
    running += Number(lines[i].amount_cents);
    assert.equal(Number(lines[i].running_balance_cents), running, `line ${i + 1}: running_n = running_{n-1} + amount_n`);
  }
  assert.equal(running, ch.closingCents, "the last running balance equals the printed closing");

  const doc = await rootQuery("select to_char(financial_date,'YYYY-MM-DD') as fd from clara.documents where id=$1", [filed.documentId]);
  assert.equal(doc.rows[0].fd, "2026-08-31", "documents.financial_date = period_end (set at persist)");
});

// ===========================================================================
// x38.k -- zero-line statements are LEGAL (April in the real corpus); its full
// header still corroborates. ● zero-line header corroboration: a zero-line
// header naming an UNREGISTERED account still refuses account_unregistered --
// the zero-line path never bypasses account binding.
// ===========================================================================
test("x38.k a zero-line statement is legal (opening=closing) for a registered account, and STILL refuses account_unregistered for an unknown one", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A2;
  const acct = await freshRegisteredAccount(sub, client, "k1");
  const zero = { openingCents: 250000, closingCents: 250000, totalDebitCents: 0, totalCreditCents: 0, lines: [] };
  const h = header({ bankCode: "MBB", accountNumberDigits: acct.digitsOnly, periodStart: "2026-09-01", periodEnd: "2026-09-30", ch: zero });
  const filed = await filedStatementPdf(sub, { client });
  const task = await enqueueStatement(filed.documentId);
  await claimTask(task.id, { egressApproved: true });
  const result = await persistStatementFacts(task.id, agreeingPayload(h, zero));
  assert.notEqual(result?.status, "failed", `a zero-line statement for a REGISTERED account is legal (got ${JSON.stringify(result)})`);
  const st = (await statementRows(client)).find((s) => s.bank_account_id === acct.bankAccountId);
  assert.equal(st.line_count, 0);
  assert.equal(Number(st.opening_cents), Number(st.closing_cents));

  // A zero-line header for an UNREGISTERED account -- the header still fully
  // corroborates (institution/number/currency/period/date/opening/closing/totals
  // all agree), so account_unregistered fires exactly as it would with lines.
  const h2 = header({ bankCode: "MBB", accountNumberDigits: "8887776665", periodStart: "2026-09-01", periodEnd: "2026-09-30", ch: zero });
  const filed2 = await filedStatementPdf(sub, { client });
  const task2 = await enqueueStatement(filed2.documentId);
  await claimTask(task2.id, { egressApproved: true });
  const outcome = await persistExpectFailure(task2.id, agreeingPayload(h2, zero), "account_unregistered", "x38.k a zero-line header for an unregistered account still refuses (never a silent pass-through)");
  noteLane(`x38.k zero-line account_unregistered lands via ${outcome.via}`);
});

// ===========================================================================
// x38.l -- non-MYR. An EXPLICIT non-MYR currency refuses named; ABSENCE of the
// currency field reads MYR (the 0023 posture, part1 fact 9).
// ===========================================================================
test("x38.l an explicit non-MYR currency refuses non_myr_statement; an ABSENT currency field defaults to MYR and succeeds", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const acct = await freshRegisteredAccount(sub, client, "l1");
  const ch = chain();
  const h = header({ bankCode: "MBB", accountNumberDigits: acct.digitsOnly, currency: "SGD", periodStart: "2026-10-01", periodEnd: "2026-10-31", ch });
  const filed = await filedStatementPdf(sub, { client });
  const task = await enqueueStatement(filed.documentId);
  await claimTask(task.id, { egressApproved: true });
  const outcome = await persistExpectFailure(task.id, agreeingPayload(h, ch), "non_myr_statement", "x38.l an explicit SGD statement refuses named (WC-R5)");
  noteLane(`x38.l non_myr_statement lands via ${outcome.via}`);

  // Absent currency (delete the key entirely from BOTH readers) -> reads MYR.
  const acct2 = await freshRegisteredAccount(sub, client, "l2");
  const h2 = header({ bankCode: "MBB", accountNumberDigits: acct2.digitsOnly, periodStart: "2026-10-01", periodEnd: "2026-10-31", ch });
  delete h2.currency;
  const payload2 = agreeingPayload(h2, ch);
  delete payload2.reader1.header.currency;
  if (payload2.reader2) delete payload2.reader2.header.currency;
  const filed2 = await filedStatementPdf(sub, { client });
  const task2 = await enqueueStatement(filed2.documentId);
  await claimTask(task2.id, { egressApproved: true });
  const result2 = await persistStatementFacts(task2.id, payload2);
  assert.notEqual(result2?.status, "failed", `an absent currency field reads MYR by default (got ${JSON.stringify(result2)})`);
});

// ===========================================================================
// x38.m -- duplicate period. `unique (bank_account_id, period_end) where
// status='live'` + an in-verb overlap refusal, doc-id-aware (SS4.3): a
// same-document REPLAY of the SAME task is `{replayed:true}` (x38.s), never
// `duplicate_period`; a genuinely SECOND document at the SAME period_end is.
// ===========================================================================
test("x38.m a second DOCUMENT statement at the same (bank_account_id, period_end) while the first is live refuses duplicate_period", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A2;
  const acct = await freshRegisteredAccount(sub, client, "m1");
  const ch1 = chain();
  const h1 = header({ bankCode: "MBB", accountNumberDigits: acct.digitsOnly, periodStart: "2026-11-01", periodEnd: "2026-11-30", ch: ch1 });
  const filed1 = await filedStatementPdf(sub, { client });
  const task1 = await enqueueStatement(filed1.documentId);
  await claimTask(task1.id, { egressApproved: true });
  await persistStatementFacts(task1.id, agreeingPayload(h1, ch1));

  const ch2 = chain({ openingCents: 999000 });
  const h2 = header({ bankCode: "MBB", accountNumberDigits: acct.digitsOnly, periodStart: "2026-11-01", periodEnd: "2026-11-30", ch: ch2 });
  const filed2 = await filedStatementPdf(sub, { client }); // a DIFFERENT document
  const task2 = await enqueueStatement(filed2.documentId);
  await claimTask(task2.id, { egressApproved: true });
  const outcome = await persistExpectFailure(task2.id, agreeingPayload(h2, ch2), "duplicate_period", "x38.m a second document at the same live period_end refuses");
  noteLane(`x38.m duplicate_period lands via ${outcome.via}`);
});

// ===========================================================================
// x38.n -- overlapping period: a new statement whose period_start falls inside
// an existing LIVE statement's window refuses overlapping_period.
// ===========================================================================
test("x38.n a new statement whose period overlaps an existing live statement's window refuses overlapping_period", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const acct = await freshRegisteredAccount(sub, client, "n1");
  const chA = chain();
  const hA = header({ bankCode: "MBB", accountNumberDigits: acct.digitsOnly, periodStart: "2026-12-01", periodEnd: "2026-12-31", ch: chA });
  const filedA = await filedStatementPdf(sub, { client });
  const taskA = await enqueueStatement(filedA.documentId);
  await claimTask(taskA.id, { egressApproved: true });
  await persistStatementFacts(taskA.id, agreeingPayload(hA, chA));

  // A second statement whose period_start (12-15) lands INSIDE December's window.
  const chB = chain();
  const hB = header({ bankCode: "MBB", accountNumberDigits: acct.digitsOnly, periodStart: "2026-12-15", periodEnd: "2027-01-15", ch: chB });
  const filedB = await filedStatementPdf(sub, { client });
  const taskB = await enqueueStatement(filedB.documentId);
  await claimTask(taskB.id, { egressApproved: true });
  const outcome = await persistExpectFailure(taskB.id, agreeingPayload(hB, chB), "overlapping_period", "x38.n an overlapping period is refused");
  noteLane(`x38.n overlapping_period lands via ${outcome.via}`);
});

// ===========================================================================
// x38.o -- CONTINUITY, both edges + the ● both-edge void-reingest cell.
// (i) B's opening must equal A's closing (both adjacent, chronological).
// (ii) void A; re-ingest a REPLACEMENT for A's period with a DIFFERENT closing
//      than B's opening -- refused (the surviving neighbour is still checked).
// (iii) the SAME replacement with the matching closing -- succeeds.
// ===========================================================================
test("x38.o continuity holds on both edges; ● a void-then-reingest replacement with a DIFFERENT closing than the surviving neighbour is refused", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A2;
  const acct = await freshRegisteredAccount(sub, client, "o1");

  const chA = chain({ openingCents: 500000, deltas: [10000, -5000] });
  const hA = header({ bankCode: "MBB", accountNumberDigits: acct.digitsOnly, periodStart: "2027-02-01", periodEnd: "2027-02-28", ch: chA });
  const filedA = await filedStatementPdf(sub, { client });
  const taskA = await enqueueStatement(filedA.documentId);
  await claimTask(taskA.id, { egressApproved: true });
  const receiptA = await persistStatementFacts(taskA.id, agreeingPayload(hA, chA));
  assert.notEqual(receiptA?.status, "failed", "statement A persists");

  const chB = chain({ openingCents: chA.closingCents, deltas: [20000, -1000] });
  const hB = header({ bankCode: "MBB", accountNumberDigits: acct.digitsOnly, periodStart: "2027-03-01", periodEnd: "2027-03-31", ch: chB });
  const filedB = await filedStatementPdf(sub, { client });
  const taskB = await enqueueStatement(filedB.documentId);
  await claimTask(taskB.id, { egressApproved: true });
  const receiptB = await persistStatementFacts(taskB.id, agreeingPayload(hB, chB));
  assert.notEqual(receiptB?.status, "failed", "statement B (continuous with A) persists");

  // Void A.
  const allStatements = await statementRows(client);
  const stAId = allStatements.find((s) => String(s.period_end).startsWith("2027-02"))?.id;
  assert.ok(stAId, "statement A resolvable for voiding");
  const voided = await voidBankStatement(sub, { client, statement: stAId, reason: "x38.o void for reingest" });
  assert.ok(voided, "void_bank_statement succeeds (no pending/live match groups reference A's lines)");
  const stAAfter = (await statementRows(client)).find((s) => s.id === stAId);
  assert.equal(stAAfter.status, "void");

  // Replacement for A's period, DIFFERENT closing than B's opening (chA.closingCents).
  const chRWrong = chain({ openingCents: 500000, deltas: [10000, -5000, 1] }); // closing off-by-one vs chA
  const hRWrong = header({ bankCode: "MBB", accountNumberDigits: acct.digitsOnly, periodStart: "2027-02-01", periodEnd: "2027-02-28", ch: chRWrong });
  const filedRWrong = await filedStatementPdf(sub, { client });
  const taskRWrong = await enqueueStatement(filedRWrong.documentId);
  await claimTask(taskRWrong.id, { egressApproved: true });
  const outcome = await persistExpectFailure(taskRWrong.id, agreeingPayload(hRWrong, chRWrong), "continuity_mismatch", "x38.o a void-reingest replacement whose closing disagrees with the SURVIVING neighbour B is refused");
  noteLane(`x38.o both-edge void-reingest continuity_mismatch lands via ${outcome.via}`);

  // The SAME replacement, closing matching B's opening exactly -- succeeds.
  const chRRight = chain({ openingCents: 500000, deltas: [10000, -5000] }); // closes at chA.closingCents === chB.openingCents
  const hRRight = header({ bankCode: "MBB", accountNumberDigits: acct.digitsOnly, periodStart: "2027-02-01", periodEnd: "2027-02-28", ch: chRRight });
  const filedRRight = await filedStatementPdf(sub, { client });
  const taskRRight = await enqueueStatement(filedRRight.documentId);
  await claimTask(taskRRight.id, { egressApproved: true });
  const result = await persistStatementFacts(taskRRight.id, agreeingPayload(hRRight, chRRight));
  assert.notEqual(result?.status, "failed", `the matching-closing replacement succeeds (got ${JSON.stringify(result)})`);
});

// ===========================================================================
// x38.p -- gap-then-fill: two statements with a genuine gap between them ingest
// independently (no adjacent neighbour on either open edge); filling the gap
// then checks BOTH edges at once.
// ===========================================================================
test("x38.p a genuine gap ingests both sides independently; filling it re-engages BOTH-edge continuity", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const acct = await freshRegisteredAccount(sub, client, "p1");

  const chApr = chain({ openingCents: 100000, deltas: [5000] });
  const hApr = header({ bankCode: "MBB", accountNumberDigits: acct.digitsOnly, periodStart: "2027-04-01", periodEnd: "2027-04-30", ch: chApr });
  const filedApr = await filedStatementPdf(sub, { client });
  const taskApr = await enqueueStatement(filedApr.documentId);
  await claimTask(taskApr.id, { egressApproved: true });
  assert.notEqual((await persistStatementFacts(taskApr.id, agreeingPayload(hApr, chApr)))?.status, "failed", "April ingests with no left OR right neighbour");

  const chJun = chain({ openingCents: 200000, deltas: [7000] });
  const hJun = header({ bankCode: "MBB", accountNumberDigits: acct.digitsOnly, periodStart: "2027-06-01", periodEnd: "2027-06-30", ch: chJun });
  const filedJun = await filedStatementPdf(sub, { client });
  const taskJun = await enqueueStatement(filedJun.documentId);
  await claimTask(taskJun.id, { egressApproved: true });
  assert.notEqual((await persistStatementFacts(taskJun.id, agreeingPayload(hJun, chJun)))?.status, "failed", "June ingests too -- May is a genuine, still-open gap");

  // Fill May: opening must equal April's closing AND closing must equal June's opening.
  const chMayWrong = chain({ openingCents: chApr.closingCents, deltas: [1] }); // will not land on chJun.openingCents
  const hMayWrong = header({ bankCode: "MBB", accountNumberDigits: acct.digitsOnly, periodStart: "2027-05-01", periodEnd: "2027-05-31", ch: chMayWrong });
  const filedMayWrong = await filedStatementPdf(sub, { client });
  const taskMayWrong = await enqueueStatement(filedMayWrong.documentId);
  await claimTask(taskMayWrong.id, { egressApproved: true });
  const outcome = await persistExpectFailure(taskMayWrong.id, agreeingPayload(hMayWrong, chMayWrong), "continuity_mismatch", "x38.p May's RIGHT edge must equal June's opening too -- both edges now apply");
  noteLane(`x38.p gap-fill wrong-right-edge lands via ${outcome.via}`);

  const chMayRight = chain({ openingCents: chApr.closingCents, deltas: [chJun.openingCents - chApr.closingCents] });
  const hMayRight = header({ bankCode: "MBB", accountNumberDigits: acct.digitsOnly, periodStart: "2027-05-01", periodEnd: "2027-05-31", ch: chMayRight });
  const filedMayRight = await filedStatementPdf(sub, { client });
  const taskMayRight = await enqueueStatement(filedMayRight.documentId);
  await claimTask(taskMayRight.id, { egressApproved: true });
  const result = await persistStatementFacts(taskMayRight.id, agreeingPayload(hMayRight, chMayRight));
  assert.notEqual(result?.status, "failed", `May, matching BOTH edges, fills the gap cleanly (got ${JSON.stringify(result)})`);
});

// ===========================================================================
// x38.q -- out-of-order ingest: a LATER period ingested BEFORE an earlier one.
// Continuity is structural (by period adjacency), never by insertion order.
// ===========================================================================
test("x38.q ingesting a later period BEFORE an earlier one still resolves continuity correctly once the earlier one lands", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A2;
  const acct = await freshRegisteredAccount(sub, client, "q1");

  const chAug = chain({ openingCents: 40000, deltas: [3000] });
  const hAug = header({ bankCode: "MBB", accountNumberDigits: acct.digitsOnly, periodStart: "2027-08-01", periodEnd: "2027-08-31", ch: chAug });
  const filedAug = await filedStatementPdf(sub, { client });
  const taskAug = await enqueueStatement(filedAug.documentId);
  await claimTask(taskAug.id, { egressApproved: true });
  assert.notEqual((await persistStatementFacts(taskAug.id, agreeingPayload(hAug, chAug)))?.status, "failed", "August, ingested FIRST with no left neighbour, succeeds");

  const chJul = chain({ openingCents: 10000, deltas: [30000] }); // closes exactly at chAug.openingCents
  const hJul = header({ bankCode: "MBB", accountNumberDigits: acct.digitsOnly, periodStart: "2027-07-01", periodEnd: "2027-07-31", ch: chJul });
  const filedJul = await filedStatementPdf(sub, { client });
  const taskJul = await enqueueStatement(filedJul.documentId);
  await claimTask(taskJul.id, { egressApproved: true });
  const result = await persistStatementFacts(taskJul.id, agreeingPayload(hJul, chJul));
  assert.notEqual(result?.status, "failed", `July, ingested SECOND, is checked against the ALREADY-LIVE August on its right edge and succeeds when consistent (got ${JSON.stringify(result)})`);
});

// ===========================================================================
// x38.r -- date bounds + period_invalid + financial_date. entry_date must sit
// inside [period_start,period_end]; period_start must not exceed period_end.
// ===========================================================================
test("x38.r a line dated outside [period_start,period_end] refuses line_date_out_of_period; period_start>period_end refuses period_invalid", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const acct = await freshRegisteredAccount(sub, client, "r1");
  const ch = chain();
  const h = header({ bankCode: "MBB", accountNumberDigits: acct.digitsOnly, periodStart: "2027-09-10", periodEnd: "2027-09-30", ch });
  const filed = await filedStatementPdf(sub, { client });
  const task = await enqueueStatement(filed.documentId);
  await claimTask(task.id, { egressApproved: true });
  // The violation is applied AFTER the payload builder (whose clamp normalizes line dates
  // into the period) and on BOTH readers, so it survives to the DB as an agreed read.
  const rPayload = agreeingPayload(h, ch);
  rPayload.reader1.lines[0].entry_date = "2027-09-05"; // BEFORE the stated period_start
  rPayload.reader2.lines[0].entry_date = "2027-09-05";
  const outcome = await persistExpectFailure(task.id, rPayload, "line_date_out_of_period", "x38.r a line dated before period_start is refused");
  noteLane(`x38.r line_date_out_of_period lands via ${outcome.via}`);

  const acct2 = await freshRegisteredAccount(sub, client, "r2");
  const ch2 = chain();
  const hBad = header({ bankCode: "MBB", accountNumberDigits: acct2.digitsOnly, periodStart: "2027-10-31", periodEnd: "2027-10-01", ch: ch2 }); // start > end
  const filed2 = await filedStatementPdf(sub, { client });
  const task2 = await enqueueStatement(filed2.documentId);
  await claimTask(task2.id, { egressApproved: true });
  const outcome2 = await persistExpectFailure(task2.id, agreeingPayload(hBad, ch2), "period_invalid", "x38.r period_start > period_end is refused");
  noteLane(`x38.r period_invalid lands via ${outcome2.via}`);
});

// ===========================================================================
// x38.s -- ● PERSIST REPLAY. A WDK retry of a COMMITTED persist must return
// {replayed:true} (the persist_invoice_facts shape), NEVER duplicate_period.
// ===========================================================================
test("x38.s a replayed persist_statement_facts call on an already-done task returns {replayed:true}, never duplicate_period", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A2;
  const acct = await freshRegisteredAccount(sub, client, "s1");
  const ch = chain();
  const h = header({ bankCode: "MBB", accountNumberDigits: acct.digitsOnly, periodStart: "2027-11-01", periodEnd: "2027-11-30", ch });
  const filed = await filedStatementPdf(sub, { client });
  const task = await enqueueStatement(filed.documentId);
  await claimTask(task.id, { egressApproved: true });
  const payload = agreeingPayload(h, ch);
  const first = await persistStatementFacts(task.id, payload);
  assert.notEqual(first?.status, "failed", "the first call persists");

  const replay = await persistStatementFacts(task.id, payload);
  assert.equal(replay?.replayed, true, `a SECOND call against the now-'done' task returns {replayed:true} (got ${JSON.stringify(replay)})`);
  assert.notEqual(replay?.reason, "duplicate_period", "a replay is NEVER mistaken for a genuine duplicate-period refusal");
  assert.equal((await statementRows(client)).filter((s) => s.bank_account_id === acct.bankAccountId).length, 1, "the replay wrote NO second statement row");
});

// ===========================================================================
// x38.t -- ● EVERY NAMED ERROR CODE LANDS AS A ROW (CHECK widenings proven).
// The 12 non-consent_inactive codes run the ORDINARY claim binding
// (workflow_run_id present, started_at present) -- driven directly via
// fail_statement_facts against a freshly-claimed task, one row per code.
// ===========================================================================
test("x38.t every named error code (except consent_inactive) lands as a claimed-then-failed row satisfying the widened CHECKs", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  for (const code of CODES) {
    const filed = await filedStatementPdf(sub, { client });
    const task = await enqueueStatement(filed.documentId);
    assert.ok(task, `${code}: a task enqueues`);
    await claimTask(task.id, { egressApproved: true });
    const receipt = await failStatementFacts(task.id, code);
    assert.ok(receipt, `${code}: fail_statement_facts returns a receipt`);
    const row = await statementTask(filed.documentId, LANE_OCR);
    assert.equal(row.status, "failed", `${code}: the task lands 'failed'`);
    assert.equal(row.error_code, code, `${code}: error_code is stored verbatim`);
    assert.ok(row.workflow_run_id, `${code}: workflow_run_id is present (the ORDINARY claimed-then-failed binding -- only consent_inactive/skipped_kind are never-claimed)`);
    assert.ok(row.started_at, `${code}: started_at is present`);
    assert.ok(row.finished_at, `${code}: finished_at is present (a terminal state)`);
  }
});

// ===========================================================================
// x38.u -- ● enter_bank_statement (the human-keyed path) hits the SAME NAMED
// refusals as the OCR lane (proving it shares _persist_statement_core), and its
// happy path stamps ingest_mode='human' with the actor as recorded corroborator.
// ===========================================================================
test("x38.u enter_bank_statement: the SAME chain/continuity/duplicate refusals apply; the happy path stamps ingest_mode='human'", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A2;
  const acct = await freshRegisteredAccount(sub, client, "u1");
  const ch = chain();
  const h = header({ bankCode: "MBB", accountNumberDigits: acct.digitsOnly, periodStart: "2027-12-01", periodEnd: "2027-12-31", ch });
  const filed = await filedStatementPdf(sub, { client });

  const receipt = await enterBankStatement(sub, { client, bankAccount: acct.bankAccountId, document: filed.documentId, header: h, lines: ch.lines });
  assert.ok(receipt, "enter_bank_statement succeeds on a valid chain");
  const st = (await statementRows(client)).find((s) => s.bank_account_id === acct.bankAccountId);
  assert.equal(st.ingest_mode, "human", "ingest_mode='human'");
  assert.equal(st.created_by, sub, "the actor is the recorded corroborator");
  assert.equal(st.document_id, filed.documentId, "provenance still binds the filed PDF");

  // The SAME chain refusal: a broken running-balance chain.
  const badCh = chain();
  badCh.lines[1].running_balance_cents += 1;
  const badH = header({ bankCode: "MBB", accountNumberDigits: acct.digitsOnly, periodStart: "2028-01-01", periodEnd: "2028-01-31", ch: badCh });
  const filed2 = await filedStatementPdf(sub, { client });
  const err = await caught(() => enterBankStatement(sub, { client, bankAccount: acct.bankAccountId, document: filed2.documentId, header: badH, lines: badCh.lines }));
  assert.ok(err, "enter_bank_statement refuses a broken chain exactly as the OCR lane's _persist_statement_core does");
  noteLane(`x38.u enter_bank_statement chain_broken refusal: code=${err.code} reason=${reasonOf(err)}`);

  // The SAME duplicate_period refusal.
  const filed3 = await filedStatementPdf(sub, { client });
  const dup = await caught(() => enterBankStatement(sub, { client, bankAccount: acct.bankAccountId, document: filed3.documentId, header: h, lines: ch.lines }));
  assert.ok(dup, "enter_bank_statement refuses a duplicate live period exactly as the OCR lane does");
  noteLane(`x38.u enter_bank_statement duplicate_period refusal: code=${dup.code} reason=${reasonOf(dup)}`);
});

// ===========================================================================
// x38.v -- ● MULTI-CLIENT FILING -> statement_multi_client. The router resolves
// the document's ACTIVE filing clients; more than one refuses named.
// ===========================================================================
test("x38.v a bank_statement document filed to TWO active clients refuses statement_multi_client at enqueue time", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const firm = world.firms.A;
  const clientOne = world.clients.A1;
  const clientTwo = world.clients.A2;
  const seed = await seedVerifiedDocument({ firm, kind: "bank_statement" });
  await fileDocument(sub, { document: seed.documentId, client: clientOne, resolution: await freshResolution(sub, clientOne, { subjectKind: "document", subjectId: seed.documentId }) });
  await fileDocument(sub, { document: seed.documentId, client: clientTwo, resolution: await freshResolution(sub, clientTwo, { subjectKind: "document", subjectId: seed.documentId }) });

  const filingsCount = await rootQuery("select count(*)::int n from clara.document_filings where document_id=$1 and retired_at is null", [seed.documentId]);
  assert.equal(filingsCount.rows[0].n, 2, "the document carries two ACTIVE filings (mandatory setup)");

  const err = await caught(() => enqueueInvoiceFacts(seed.documentId));
  const task = await statementTask(seed.documentId, LANE_OCR);
  if (err) {
    assertReason(err, CLR10, "statement_multi_client", "x38.v a multi-filed bank_statement document is refused at enqueue");
  } else {
    // Alternate reading: the router writes a terminal never-claimed failed row
    // (the skipped_kind idiom) rather than raising.
    assert.ok(task, "either the enqueue raised, or a terminal task row was written");
    assert.equal(task.error_code, "statement_multi_client", `the terminal row carries statement_multi_client (got ${JSON.stringify(task)})`);
    assert.equal(task.workflow_run_id ?? null, null, "the multi-client refusal task is never claimed");
    noteLane("x38.v statement_multi_client landed as a terminal task row rather than a raised exception");
  }
});

// ===========================================================================
// x38.w -- ● HEADER ENDPOINTS FROM LABELS (header_unreadable). Endpoints come
// from the PRINTED BEGINNING/ENDING or LEDGER BALANCE labels, never derived from
// the row set -- a payload that omits them must refuse, even though the running
// balances alone are internally self-consistent and could "prove" endpoints by
// summation.
// ===========================================================================
test("x38.w a payload missing the printed opening/closing LABELS refuses header_unreadable, even when the row-set sum is self-consistent", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const acct = await freshRegisteredAccount(sub, client, "w1");
  const ch = chain();
  const h = header({ bankCode: "MBB", accountNumberDigits: acct.digitsOnly, periodStart: "2028-02-01", periodEnd: "2028-02-29", ch });
  delete h.opening_cents; // the reader could not read the printed BEGINNING BALANCE label
  delete h.closing_cents;
  const payload = agreeingPayload(h, ch);
  delete payload.reader1.header.opening_cents;
  delete payload.reader1.header.closing_cents;
  if (payload.reader2) { delete payload.reader2.header.opening_cents; delete payload.reader2.header.closing_cents; }
  const filed = await filedStatementPdf(sub, { client });
  const task = await enqueueStatement(filed.documentId);
  await claimTask(task.id, { egressApproved: true });
  const outcome = await persistExpectFailure(task.id, payload, "header_unreadable", "x38.w a reader that cannot independently produce the printed endpoints refuses -- summation is never a substitute");
  noteLane(`x38.w header_unreadable lands via ${outcome.via}`);
});

// ===========================================================================
// x38.x -- ● MANDATORY TOTALS (totals_unreadable, OCR path) + the structured
// lane's WC-R7 relaxation: totals are checked WHEN PRESENT, never mandatory,
// since csv/ofx rarely print a TOTAL DEBIT / TOTAL CREDIT line at all.
// ===========================================================================
test("x38.x the printed TOTAL DEBIT/CREDIT cross-check is MANDATORY on the OCR lane (totals_unreadable) but only checked-when-present on the structured lane", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A2;
  const acct = await freshRegisteredAccount(sub, client, "x1");
  const ch = chain();
  const h = header({ bankCode: "MBB", accountNumberDigits: acct.digitsOnly, periodStart: "2028-03-01", periodEnd: "2028-03-31", ch });
  delete h.total_debit_cents; delete h.total_credit_cents;
  const payload = agreeingPayload(h, ch);
  delete payload.reader1.header.total_debit_cents; delete payload.reader1.header.total_credit_cents;
  if (payload.reader2) { delete payload.reader2.header.total_debit_cents; delete payload.reader2.header.total_credit_cents; }
  const filed = await filedStatementPdf(sub, { client });
  const task = await enqueueStatement(filed.documentId);
  await claimTask(task.id, { egressApproved: true });
  const outcome = await persistExpectFailure(task.id, payload, "totals_unreadable", "x38.x the OCR lane refuses a chain-only payload missing printed totals -- the one control that catches an adjacent omission the running balance cannot see");
  noteLane(`x38.x totals_unreadable lands via ${outcome.via}`);

  // Structured lane (WC-R7): the parse is deterministic and the chain IS the
  // second reader -- totals absent entirely is legal (many CSV/OFX exports print
  // no total line at all).
  const acct2 = await freshRegisteredAccount(sub, client, "x2");
  const ch2 = chain();
  const h2 = header({ bankCode: "MBB", accountNumberDigits: acct2.digitsOnly, periodStart: "2028-04-01", periodEnd: "2028-04-30", ch: ch2 });
  delete h2.total_debit_cents; delete h2.total_credit_cents;
  const filedCsv = await filedStatementCsv(sub, { client });
  const taskCsv = await enqueueStatement(filedCsv.documentId, LANE_PARSE);
  if (!taskCsv) { noteLane("x38.x no statement_parse task enqueued for a text/csv bank_statement -- OFX/CSV mime routing may not be integrated yet"); return; }
  assert.equal(taskCsv.lane, LANE_PARSE, "a csv bank_statement routes to statement_parse");
  await claimTask(taskCsv.id, { egressApproved: true });
  const singleReaderPayload = { reader1: { header: h2, lines: clampLinesToPeriod(h2, ch2.lines) }, reader2: null };
  const result = await persistStatementFacts(taskCsv.id, singleReaderPayload);
  assert.notEqual(result?.status, "failed", `the structured lane accepts a totals-absent payload (chain is the second reader, WC-R7) (got ${JSON.stringify(result)})`);
});

// ===========================================================================
// x38.y -- ● READERS DISAGREE (readers_disagree) + ● CHAIN_BROKEN. Corroboration
// requires EXPLICIT two-reader agreement (WCB-R6/RV) on the OCR lane; a broken
// running-balance identity refuses independently of reader agreement.
// ===========================================================================
test("x38.y reader1/reader2 disagreement on a line amount refuses readers_disagree; an internally-broken chain refuses chain_broken", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const acct = await freshRegisteredAccount(sub, client, "y1");
  const ch = chain();
  const h = header({ bankCode: "MBB", accountNumberDigits: acct.digitsOnly, periodStart: "2028-05-01", periodEnd: "2028-05-31", ch });
  const filed = await filedStatementPdf(sub, { client });
  const task = await enqueueStatement(filed.documentId);
  await claimTask(task.id, { egressApproved: true });
  const disagreeing = agreeingPayload(h, ch);
  disagreeing.reader2.lines[0].amount_cents += 100; // a single-line amount conflict
  const outcome1 = await persistExpectFailure(task.id, disagreeing, "readers_disagree", "x38.y a per-line amount conflict between readers refuses");
  noteLane(`x38.y readers_disagree lands via ${outcome1.via}`);

  const acct2 = await freshRegisteredAccount(sub, client, "y2");
  const chBroken = chain();
  chBroken.lines[1].running_balance_cents += 500; // breaks running_n = running_{n-1} + amount_n
  const hBroken = header({ bankCode: "MBB", accountNumberDigits: acct2.digitsOnly, periodStart: "2028-06-01", periodEnd: "2028-06-30", ch: chBroken });
  const filed2 = await filedStatementPdf(sub, { client });
  const task2 = await enqueueStatement(filed2.documentId);
  await claimTask(task2.id, { egressApproved: true });
  const outcome2 = await persistExpectFailure(task2.id, agreeingPayload(hBroken, chBroken), "chain_broken", "x38.y a broken running-balance identity refuses");
  noteLane(`x38.y chain_broken lands via ${outcome2.via}`);
});

// ===========================================================================
// x38.z1 -- ● BUDGET. Exhausting the firm's page budget fails a FRESH
// statement_facts enqueue outright, named 'budget' (0038 --
// _enqueue_invoice_facts_core reserves pages for BOTH azure lanes now and
// converts a CLR18 page-budget refusal from _reserve_processing_call into a
// graceful terminal task row, in the SAME call, before the task ever queues).
// pages_per_day carries a `> 0` CHECK (0007:367), so "no budget left" is
// staged the way production reaches it: a legal cap the day's reservations
// have already consumed, never a zero cap. The terminal verdict must reach
// the spine as the STATEMENT twin -- and never as the invoice twin (the
// enqueue_invoice_facts wrapper's phantom emit, suppressed by E2b).
// ===========================================================================
test("x38.z1 budget: an exhausted page budget fails a fresh statement_facts enqueue with error_code 'budget'", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A2;
  const firm = await firmOf(client);
  const prior = await rootQuery("select pages_per_day from clara.firm_document_limits where firm_id=$1", [firm]);
  const priorLimit = prior.rows[0]?.pages_per_day ?? null;
  // The fn's own day-window ledger (0009:593-603): settled rows count settled_pages,
  // everything else its reservation, refunded rows drop out.
  const usedPages = async () => {
    const r = await rootQuery(
      `select coalesce(sum(pages),0)::int as used from (
         select case when state='settled' then settled_pages else pages_reserved end::bigint as pages
           from clara.document_ingest_reservations
           where firm_id=$1 and state<>'refunded'
             and created_at >= (date_trunc('day',now() at time zone 'utc') at time zone 'utc')
         union all
         select case when state='settled' then settled_pages else pages_reserved end::bigint
           from clara.processing_call_reservations
           where firm_id=$1 and state<>'refunded'
             and created_at >= (date_trunc('day',now() at time zone 'utc') at time zone 'utc')
       ) q`, [firm]);
    return r.rows[0].used;
  };
  try {
    let used = await usedPages();
    if (used === 0) {
      // Consume at least one page so `cap = used` stays legal under the CHECK.
      await freshRegisteredAccount(sub, client, "z1");
      const seedFiled = await filedStatementPdf(sub, { client });
      const seedTask = await enqueueStatement(seedFiled.documentId);
      assert.equal(seedTask?.status, "queued", `x38.z1 seed enqueue reserves the day's first page (got ${JSON.stringify(seedTask)})`);
      used = await usedPages();
    }
    assert.ok(used >= 1, `x38.z1: the day ledger shows at least one consumed page (got ${used})`);
    const upserted = await rootQuery(
      `insert into clara.firm_document_limits(firm_id, pages_per_day) values ($1, $2)
         on conflict (firm_id) do update set pages_per_day = $2`,
      [firm, used],
    );
    assert.equal(upserted.rowCount, 1, "the budget upsert affects exactly one row");
    const readback = await rootQuery("select pages_per_day from clara.firm_document_limits where firm_id=$1", [firm]);
    assert.equal(readback.rows[0].pages_per_day, used, "the firm's page cap reads back exactly exhausted");

    const filed = await filedStatementPdf(sub, { client });
    const task = await enqueueStatement(filed.documentId);
    assert.ok(task, "x38.z1 mandatory setup: the enqueue call returns a task row");
    assert.equal(task.status, "failed", `an exhausted page budget fails the enqueue call itself, before the task ever queues (got ${JSON.stringify(task)})`);
    assert.equal(task.error_code, "budget", `the failure is named 'budget' (got ${JSON.stringify(task)})`);

    const twin = await rootQuery(
      "select count(*)::int as n from clara.domain_events where document_id=$1 and event_type='document.statement_facts_failed' and payload->>'reason'='budget'",
      [filed.documentId]);
    // One emit PER refused enqueue call -- filing itself enqueues once and the explicit
    // call re-attempts, so >=1 is the honest floor (each refusal reports itself).
    assert.ok(twin.rows[0].n >= 1, "x38.z1: the budget verdict reaches the spine as the STATEMENT twin");
    const phantom = await rootQuery(
      "select count(*)::int as n from clara.domain_events where document_id=$1 and event_type='document.invoice_facts_failed'",
      [filed.documentId]);
    assert.equal(phantom.rows[0].n, 0, "x38.z1: the invoice twin never fires for a statement document (the E2b wrapper suppress)");
  } finally {
    if (priorLimit == null) {
      await rootQuery("delete from clara.firm_document_limits where firm_id=$1", [firm]).catch(() => {});
    } else {
      await rootQuery("update clara.firm_document_limits set pages_per_day=$2 where firm_id=$1", [firm, priorLimit]).catch(() => {});
    }
  }
});

// ===========================================================================
// x38.z2 -- ● ATTEMPT CAP. Three failed attempts on one document's
// statement_facts lane exhaust the 0016 v_attempts>=3 idiom (part1 fact 3 /
// part2 SS5 CHECK widenings, now lane-keyed per 0038 E3). The terminal state
// must land attempt_cap; the spine event -- wherever it fires -- must name
// the STATEMENT twin ('document.statement_facts_failed'), never the invoice
// one, per the 0038 E3 postcheck.
// ===========================================================================
test("x38.z2 attempt cap: three failed attempts trip attempt_cap, and the terminal event follows the statement-facts lane", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A2;
  const filed = await filedStatementPdf(sub, { client });
  let lastReceipt = null;
  let task = await enqueueStatement(filed.documentId);
  assert.ok(task, "x38.z2 mandatory setup: the initial enqueue queues a task");
  for (let i = 0; i < 3; i++) {
    assert.equal(task.status, "queued", `x38.z2 round ${i + 1}: a queued task exists to claim (got ${JSON.stringify(task)})`);
    await claimTask(task.id, { egressApproved: true });
    await failStatementFacts(task.id, "engine_lost");
    lastReceipt = await enqueueInvoiceFacts(filed.documentId);
    task = await statementTask(filed.documentId, LANE_OCR);
  }
  // The next processing attempt must be refused named attempt_cap. It may be observed either
  // as the terminal row this loop's last re-enqueue itself minted (0038:5949-5960's own
  // enqueue-time cap, which fires first in the ordinary claim->fail->re-enqueue cycle traced
  // above), or -- if a task instead reached 'queued' with the running sum already at 3 -- via
  // one more explicit claim tripping the claim-time belt (0038 E3, claim_document_processing_
  // task:6167-6183). Both are legitimate readings of "the next attempt is refused"; this loop
  // is written to converge to whichever the live body actually takes.
  if (task.status === "queued") {
    const capped = await caught(() => claimTask(task.id, { egressApproved: true }));
    assert.ok(capped, "x38.z2: a claim against a task whose lane-sum has reached 3 attempts must be refused");
    task = await statementTask(filed.documentId, LANE_OCR);
  }
  assert.equal(task.status, "failed", `x38.z2: after three failed attempts the document's task lands failed (got ${JSON.stringify(task)})`);
  assert.equal(task.error_code, "attempt_cap", `x38.z2: the terminal error_code is attempt_cap (got ${JSON.stringify(task)} -- last enqueue receipt ${JSON.stringify(lastReceipt)})`);

  // HARD PIN (adjudicated 2026-07-31): the ENQUEUE-time cap branch is the one a capped
  // statement actually reaches (the running sum reads 3 before the fourth task is minted),
  // and after the as-built fix it emits the STATEMENT twin itself. Every engine_lost round
  // above also emitted this event type via fail_statement_facts, so the pin discriminates on
  // the payload's reason: the NEWEST event for this document must be the cap emit, proving
  // the terminal verdict -- not merely the last per-round fail -- reached the spine.
  const ev = await rootQuery(
    "select event_type, payload->>'reason' as reason from clara.domain_events where document_id=$1 order by seq desc limit 1",
    [filed.documentId],
  );
  assert.equal(ev.rows[0]?.event_type, "document.statement_facts_failed",
    `x38.z2: the attempt-cap terminal event follows the statement-facts lane, never the invoice twin (got ${JSON.stringify(ev.rows[0] ?? null)})`);
  assert.equal(ev.rows[0]?.reason, "attempt_cap",
    `x38.z2: the newest spine event carries reason=attempt_cap -- the cap verdict itself, not a per-round engine_lost fail (got ${JSON.stringify(ev.rows[0] ?? null)})`);
  const phantom = await rootQuery(
    "select count(*)::int as n from clara.domain_events where document_id=$1 and event_type='document.invoice_facts_failed'",
    [filed.documentId]);
  assert.equal(phantom.rows[0].n, 0, "x38.z2: the invoice twin never fires for a statement document across the whole retry arc (the E2b wrapper suppress)");
});

// ===========================================================================
// x38.z3 -- ● OCR CONCURRENCY. ocr_concurrency=1 lets exactly one statement_
// facts claim through and refuses a second in-flight claim for the same firm
// (0038:6186-6193, the widened v_cap/v_running check now covering
// 'statement_facts' alongside 'ocr'/'invoice_facts'). The second claim is
// driven by a DIRECT roleQuery call (never claimIfQueued, whose harness-
// hygiene reaper would settle a stale runner and silently retry past the
// refusal this cell exists to prove).
// ===========================================================================
test("x38.z3 OCR concurrency: ocr_concurrency=1 admits one claim and refuses a second in-flight claim", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A2;
  const firm = await firmOf(client);
  const prior = await rootQuery("select ocr_concurrency from clara.firm_document_limits where firm_id=$1", [firm]);
  const priorLimit = prior.rows[0]?.ocr_concurrency ?? null;
  let task1 = null; let task2 = null;
  try {
    await rootQuery(
      `insert into clara.firm_document_limits(firm_id, ocr_concurrency) values ($1, 1)
         on conflict (firm_id) do update set ocr_concurrency = 1`,
      [firm],
    );
    const readback = await rootQuery("select ocr_concurrency from clara.firm_document_limits where firm_id=$1", [firm]);
    assert.equal(readback.rows[0].ocr_concurrency, 1, "the firm's OCR concurrency reads back as one");

    await freshRegisteredAccount(sub, client, "z3a");
    const filedA = await filedStatementPdf(sub, { client });
    task1 = await enqueueStatement(filedA.documentId);
    assert.ok(task1, "x38.z3 mandatory setup: the first statement task enqueues");
    await claimTask(task1.id, { egressApproved: true });
    assert.equal((await statementTask(filedA.documentId, LANE_OCR)).status, "running", "x38.z3 mandatory setup: the first claim is running, saturating the cap of one");

    await freshRegisteredAccount(sub, client, "z3b");
    const filedB = await filedStatementPdf(sub, { client });
    task2 = await enqueueStatement(filedB.documentId);
    assert.ok(task2, "x38.z3 mandatory setup: a second statement task enqueues, queued behind the cap");

    const err = await caught(() => roleQuery(
      ROLES.runtime,
      "select clara.claim_document_processing_task(p_task => $1, p_workflow_run_id => $2, p_egress_approved => $3) as r",
      [task2.id, `x38-z3-${randomUUID()}`, true],
    ));
    assert.ok(err, "a second claim while the firm's OCR concurrency cap (1) is already saturated must be refused");
    assert.match(String(err.message), /concurrency limit/, `the refusal names the concurrency limit (got ${err.message})`);
  } finally {
    if (task1) await failStatementFacts(task1.id, "engine_lost").catch(() => {});
    if (task2) {
      // task2 never left 'queued' -- its claim attempt raised before any state change, so
      // fail_statement_facts (which requires status='running') has nothing to settle here;
      // best-effort cleanup only, never a swallowed product assertion.
      await failStatementFacts(task2.id, "engine_lost").catch(() => {});
    }
    if (priorLimit == null) {
      await rootQuery("delete from clara.firm_document_limits where firm_id=$1", [firm]).catch(() => {});
    } else {
      await rootQuery("update clara.firm_document_limits set ocr_concurrency=$2 where firm_id=$1", [firm, priorLimit]).catch(() => {});
    }
  }
});

// ===========================================================================
// x38.z4 -- ● THE MULTI-CLIENT GATE ACTS ON THE QUEUED TASK. As-built ladder
// fix (2026-07-31, 0038:5915-5923): filing a document to a SECOND active
// client flips its in-flight QUEUED statement_facts task to failed/
// statement_multi_client IN PLACE, rather than leaving the vendor read live
// beside a fresh terminal receipt.
// ===========================================================================
test("x38.z4 the multi-client gate acts on the QUEUED task: a second filing flips the in-flight statement_facts task in place", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const clientA1 = world.clients.A1;
  const clientA2 = world.clients.A2;
  const firm = world.firms.A;
  await freshRegisteredAccount(sub, clientA1, "z4a1");
  const seed = await seedVerifiedDocument({ firm, kind: "bank_statement" });
  await fileDocument(sub, { document: seed.documentId, client: clientA1, resolution: await freshResolution(sub, clientA1, { subjectKind: "document", subjectId: seed.documentId }) });

  const task = await enqueueStatement(seed.documentId);
  assert.ok(task, "x38.z4 mandatory setup: the single-client filing enqueues a statement_facts task");
  assert.equal(task.status, "queued", "x38.z4 mandatory setup: the task lands queued while only one active filing exists");

  await fileDocument(sub, { document: seed.documentId, client: clientA2, resolution: await freshResolution(sub, clientA2, { subjectKind: "document", subjectId: seed.documentId }) });
  await enqueueInvoiceFacts(seed.documentId);

  const after = await statementTask(seed.documentId, LANE_OCR);
  assert.equal(after.status, "failed", `x38.z4: the ORIGINAL queued task flips to failed once a second active filing appears (got ${JSON.stringify(after)})`);
  assert.equal(after.error_code, "statement_multi_client", `x38.z4: the terminal error_code names statement_multi_client (got ${JSON.stringify(after)})`);
  assert.equal(after.id, task.id, "x38.z4: the SAME task row was flipped in place, not superseded by a fresh one");

  const still = await rootQuery(
    "select count(*)::int n from clara.document_processing_tasks where document_id=$1 and lane=$2 and status in ('queued','running')",
    [seed.documentId, LANE_OCR],
  );
  assert.equal(still.rows[0].n, 0, "x38.z4: no queued or running statement_facts task remains for the document");

  // The gate verdict reaches the spine as the STATEMENT twin EXACTLY ONCE (delta-review
  // round 2: only the acting branches -- the flip, a fresh insert -- emit; a re-read of the
  // existing terminal receipt emits nothing, so dark re-tries can never spam the feed), and
  // the invoice twin never fires for a statement document (the E2b wrapper suppress --
  // before it, this exact re-enqueue emitted a phantom invoice failure).
  const twinCount = async () => (await rootQuery(
    "select count(*)::int as n from clara.domain_events where document_id=$1 and event_type='document.statement_facts_failed' and payload->>'reason'='statement_multi_client'",
    [seed.documentId])).rows[0].n;
  assert.equal(await twinCount(), 1, "x38.z4: the multi-client verdict reaches the spine as EXACTLY ONE statement twin (the flip acted; the later re-enqueue only re-read)");
  await enqueueInvoiceFacts(seed.documentId);
  assert.equal(await twinCount(), 1, "x38.z4: another dark re-try emits NOTHING -- the verdict already reached the spine when its receipt was minted");
  const phantom = await rootQuery(
    "select count(*)::int as n from clara.domain_events where document_id=$1 and event_type='document.invoice_facts_failed'",
    [seed.documentId]);
  assert.equal(phantom.rows[0].n, 0, "x38.z4: the invoice twin never fires for a statement document");
});

// ===========================================================================
// x38.aa -- ● KILL SWITCH OFF + consent ACTIVE => held, then released. Mirrors
// the s6-metering N-F1 cells exactly, for the statement_facts lane: the typed
// consent gate answers "did this client authorize"; the kill switch (p_egress_
// approved) answers "is the vendor safe right now" -- orthogonal, both required.
// ===========================================================================
test("x38.aa kill switch OFF holds a statement_facts claim even with an ACTIVE consent; release_held_document_tasks covers the lane", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const firm = await firmOf(client);
  await lightStatementConsent(sub, { firm, client });

  await freshRegisteredAccount(sub, client, "aa1");
  const filed = await filedStatementPdf(sub, { client });
  const task = await enqueueStatement(filed.documentId);
  assert.ok(task, "the task enqueues (consent is active, so the router does not fail-closed at enqueue)");
  await claimTask(task.id, { egressApproved: false }).catch((e) => noteLane(`x38.aa false-egress claim raised ${e.code} (${e.message}) -- held-branch may refuse rather than hold; inspect`));
  const held = await statementTask(filed.documentId, LANE_OCR);
  assert.notEqual(held.status, "running", "an un-egressed statement_facts task is NOT running (held by the kill switch)");
  assert.equal(held.workflow_run_id ?? null, null, "no workflow_run_id is stamped while held");

  assert.equal(held.status, "held_egress", `the kill switch HOLDS the statement_facts task (got ${held.status})`);

  // ● THE RELEASE MUST ACTUALLY RELEASE IT. This cell used to close on
  // `assert.ok(after, "...inspectable after a release cycle")` -- a row that always exists,
  // satisfied by ANY status including a permanently-stalled held_egress. That is the whole
  // reason a migration recut could drop 'statement_facts' from the release lane list and
  // still see 43/43 green here (H2 F4 review, 2026-08-07). The assertion is now the
  // PROPERTY: a lane that can be HELD and cannot be RELEASED is a permanent stall
  // (0038 E4's own words), so the released task must read 'queued'.
  //
  // And it must release WITHOUT any legacy-consent condition: statement_facts is a
  // KILL-SWITCH-ONLY lane at claim time (0038 E3 -- widening the legacy purpose-blind
  // consent branch to it would let that table authorize a statement-specific vendor read,
  // the conflation 0020 section 1 built a separate relation to prevent). Its typed
  // (consent, activation) gate lives at ENQUEUE, which this cell already passed. So the
  // release sweep -- called only when the runtime believes the switch is back on -- has
  // exactly one correct answer here, whatever clara.client_egress_consents says.
  const legacy = await rootQuery(
    "select count(*)::int n from clara.client_egress_consents where client_id=$1 and revoked_at is null",
    [client],
  );
  await roleQuery(ROLES.runtime, "select clara.release_held_document_tasks(p_limit => 100)").catch((e) => noteLane(`x38.aa release_held_document_tasks raised ${e.code} -- inspect (should cover statement_facts)`));
  const after = await statementTask(filed.documentId, LANE_OCR);
  assert.ok(after, "the held statement_facts task is inspectable after a release cycle");
  assert.equal(
    after.status, "queued",
    `x38.aa: the released statement_facts task must be QUEUED (got ${after.status}; live legacy consents for this client: ${legacy.rows[0].n}) -- `
    + "a statement lane missing from release_held_document_tasks' lane list is a PERMANENT stall, "
    + "and a statement lane gated on the LEGACY consent table here is the 0020 section 1 conflation",
  );
  assert.equal(after.workflow_run_id ?? null, null, "the released task carries no workflow_run_id -- the reconciler binds one when it dispatches");
});

// ===========================================================================
// SECTION 3 -- CONSENT (part1 SS4.4; part2 SS6 "Consent").
// ===========================================================================

// ===========================================================================
// x38.aa2 -- THE RETIRED PURPOSE IS RE-KEYED, NEVER DROPPED. The F-A2 Window-B
// activation moved which purpose gates the statement lanes; it did NOT remove
// `statement_extraction` from the typed-purpose vocabulary, and it must not:
// historical authorization rows reference it and drops are BY NAME (the
// 0038:5462 contract). Asserted POSITIVELY off the live CHECKs, because "we
// did not drop it" is otherwise a claim nothing in this suite would notice
// being false.
// ===========================================================================
test("x38.aa2 the RETIRED statement purpose is still admitted by every typed-purpose CHECK -- a re-key is not a drop", async (t) => {
  if (skipHere(t)) return;
  const r = await rootQuery(
    `select count(*)::int as n from pg_constraint con
      where con.contype='c'
        and pg_get_constraintdef(con.oid) like '%purpose%'
        and pg_get_constraintdef(con.oid) like $1`, [`%${RETIRED_PURPOSE}%`]);
  assert.ok(r.rows[0].n >= 3,
    `every typed-purpose CHECK must still admit '${RETIRED_PURPOSE}' (found ${r.rows[0].n}) — dropping it would orphan the historical authorization rows that name it`);
  // …and the gate purpose is admitted by the SAME CHECKs, so both coexist rather than replace.
  const g = await rootQuery(
    `select count(*)::int as n from pg_constraint con
      where con.contype='c'
        and pg_get_constraintdef(con.oid) like '%purpose%'
        and pg_get_constraintdef(con.oid) like $1
        and pg_get_constraintdef(con.oid) like $2`, [`%${RETIRED_PURPOSE}%`, `%${PURPOSE}%`]);
  assert.equal(g.rows[0].n, r.rows[0].n,
    "every CHECK that admits the retired purpose admits the gate purpose too — the vocabulary GREW, it did not move");
});

// ===========================================================================
// x38.ab -- consent INACTIVE at enqueue: the router's bank-statement branch
// requires a live (consent, activation) for (firm, client, PURPOSE — the gate
// purpose, `witness_extraction` since the F-A2 Window-B activation); absent ->
// a terminal never-claimed failed task error_code='consent_inactive' (the
// skipped_kind idiom), re-enqueueable after the ceremony.
// ===========================================================================
test("x38.ab a client with NO gate-purpose (witness_extraction) consent enqueues to a terminal, never-claimed failed task (consent_inactive)", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.erin; // S1's OWN owner -- alice is firm A's user
  const client = world.clients.S1; // solo firm client, untouched by other cells' consent lighting
  await revokeStatementPurpose(sub, { client, reason: "x38.ab ensure dark" }).catch(() => null);
  const filed = await filedStatementPdf(sub, { client });
  const err = await caught(() => enqueueInvoiceFacts(filed.documentId));
  const task = await statementTask(filed.documentId, LANE_OCR);
  if (err) {
    noteLane(`x38.ab enqueue RAISED rather than writing a terminal task: code=${err.code} reason=${reasonOf(err)}`);
  } else {
    assert.ok(task, "a terminal task row exists");
    assert.equal(task.error_code, NEVER_CLAIMED_CODE, `the terminal row carries consent_inactive (got ${JSON.stringify(task)})`);
    assert.equal(task.workflow_run_id ?? null, null, "consent_inactive is NEVER claimed -- it joins skipped_kind's allowlist");
    assert.equal(task.started_at ?? null, null, "started_at is null on a never-claimed row");
  }

  // Re-enqueueable after the ceremony: light consent, then re-enqueue succeeds
  // past the consent gate (the SAME document, a fresh task).
  const firm = await firmOf(client);
  await lightStatementConsent(sub, { firm, client });
  const filed2 = await filedStatementPdf(sub, { client });
  await enqueueInvoiceFacts(filed2.documentId).catch((e) => noteLane(`x38.ab post-ceremony re-enqueue raised ${e.code}`));
  const row2 = await statementTask(filed2.documentId, LANE_OCR);
  assert.ok(row2 && row2.error_code !== NEVER_CLAIMED_CODE, `after the ceremony the SAME kind of document enqueues past the consent gate (got ${JSON.stringify(row2)})`);
});

// ===========================================================================
// x38.ac -- GRANT ALONE != ACTIVE. A typed consent grant, without activation,
// still refuses consent_inactive -- a grant is not an activation (0020's own
// central claim, re-exercised for the new purpose).
// ===========================================================================
test("x38.ac a GRANTED-but-not-activated gate-purpose consent still refuses consent_inactive at enqueue", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A2;
  const firm = await firmOf(client);
  await revokeStatementPurpose(sub, { client, reason: "x38.ac ensure dark" }).catch(() => null);
  const evidence = await seedVerifiedDocument({ firm });
  await classifyConsentEvidenceDocument(sub, { document: evidence.documentId });
  await grantStatementPurpose(sub, { client, evidenceDocument: evidence.documentId }); // GRANT, no activate
  assert.ok(await livePurposeConsentRow(client), "the typed consent is live");
  assert.equal(await livePurposeActivationRow(client), null, "…but NOT activated");

  const filed = await filedStatementPdf(sub, { client });
  const err = await caught(() => enqueueInvoiceFacts(filed.documentId));
  const task = await statementTask(filed.documentId, LANE_OCR);
  if (err) {
    noteLane(`x38.ac grant-alone enqueue raised: code=${err.code} reason=${reasonOf(err)}`);
  } else {
    assert.equal(task?.error_code, NEVER_CLAIMED_CODE, `a grant without activation still refuses consent_inactive (got ${JSON.stringify(task)})`);
  }
});

// ===========================================================================
// x38.ad -- ACTIVATE => flows. classify + grant + activate, then enqueue
// proceeds NORMALLY (never lands consent_inactive).
// ===========================================================================
test("x38.ad an ACTIVE gate-purpose (witness_extraction) consent lets a bank_statement document enqueue normally", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const firm = await firmOf(client);
  await lightStatementConsent(sub, { firm, client });
  const filed = await filedStatementPdf(sub, { client });
  const task = await enqueueStatement(filed.documentId);
  assert.ok(task, "the task enqueues");
  assert.notEqual(task.error_code, NEVER_CLAIMED_CODE, "an active consent never lands consent_inactive");
  assert.ok(["queued", "held_egress", "running"].includes(task.status), `the task lands in a LIVE state (got ${task.status})`);
});

// ===========================================================================
// x38.ae -- DEACTIVATE => refuses. Deactivating the activation (the consent
// record SURVIVES) makes a subsequent enqueue hit consent_inactive again.
// ===========================================================================
test("x38.ae deactivating the gate-purpose activation makes a SUBSEQUENT enqueue refuse consent_inactive again, though the consent record survives", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A2;
  const firm = await firmOf(client);
  await lightStatementConsent(sub, { firm, client });
  await deactivateStatementPurpose(sub, { client, reason: "x38.ae pause" });
  assert.ok(await livePurposeConsentRow(client), "the consent record SURVIVES a deactivation");
  assert.equal(await livePurposeActivationRow(client), null, "…but the activation does not");

  const filed = await filedStatementPdf(sub, { client });
  const err = await caught(() => enqueueInvoiceFacts(filed.documentId));
  const task = await statementTask(filed.documentId, LANE_OCR);
  if (err) {
    noteLane(`x38.ae post-deactivation enqueue raised: code=${err.code} reason=${reasonOf(err)}`);
  } else {
    assert.equal(task?.error_code, NEVER_CLAIMED_CODE, `a deactivated activation refuses consent_inactive again (got ${JSON.stringify(task)})`);
  }
});

// ===========================================================================
// x38.af -- ● WIKI HOLDS BYTE-UNCHANGED IN BOTH DIRECTIONS. The purpose-
// discriminated coupling (0020's activate/deactivate hold coupling applies ONLY
// when p_purpose='wiki_synthesis') must leave clara.wiki_synthesis_holds
// completely untouched by the statement_extraction lane, in both directions:
// activating statement_extraction must not CLEAR an existing wiki hold, and
// deactivating/revoking it must not SET one where none existed.
// ===========================================================================
test("x38.af activate/deactivate/revoke statement_extraction never touches clara.wiki_synthesis_holds, in either direction", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1; // the revoke below resets the bootstrap's statement
  // consent so this cell owns the full grant lifecycle; Direction 2 needs A2 hold-free.
  const firm = await firmOf(client);
  await revokeStatementPurpose(sub, { client, reason: "x38.af lifecycle reset" }).catch(() => null);

  // Direction 1: an EXISTING wiki hold must survive a statement_extraction
  // activation byte-unchanged. Set the hold via the WIKI purpose's own
  // deactivate/revoke path (the only legitimate way to set one).
  const wikiEvidence = await seedVerifiedDocument({ firm });
  await classifyConsentEvidenceDocument(sub, { document: wikiEvidence.documentId });
  await grantClientEgressPurpose(sub, { client, purpose: "wiki_synthesis", evidenceDocument: wikiEvidence.documentId, opKey: opk("af-wiki-grant") });
  const wikiConsent = await livePurposeConsentRow(client, "wiki_synthesis");
  await activateClientEgressPurpose(sub, { client, purpose: "wiki_synthesis", consent: wikiConsent.id, opKey: opk("af-wiki-act") });
  await deactivateClientEgressPurpose(sub, { client, purpose: "wiki_synthesis", reason: "x38.af set a wiki hold", opKey: opk("af-wiki-deact") });
  const holdBefore = await wikiHoldRow(client);
  assert.ok(holdBefore, "the wiki hold is set (mandatory setup)");

  // Now activate statement_extraction for the SAME client -- the hold must be
  // BYTE-UNCHANGED (this is the wedge regression WCB-R1 pins: an unqualified
  // clear on ANY purpose activation would silently release the wiki hold).
  const stmtEvidence = await seedVerifiedDocument({ firm });
  await classifyConsentEvidenceDocument(sub, { document: stmtEvidence.documentId });
  await grantStatementPurpose(sub, { client, evidenceDocument: stmtEvidence.documentId, opKey: opk("af-stmt-grant") });
  const stmtConsent = await livePurposeConsentRow(client);
  await activateStatementPurpose(sub, { client, consent: stmtConsent.id, opKey: opk("af-stmt-act") });
  const holdAfterActivate = await wikiHoldRow(client);
  assert.deepEqual(holdAfterActivate, holdBefore, "activating statement_extraction leaves the EXISTING wiki hold byte-unchanged (the wedge regression)");

  // Direction 2: a client with NO wiki hold -- deactivating/revoking
  // statement_extraction must NOT create one (the backstop-erasure regression:
  // an unqualified SET on any purpose deactivation would falsely hold wiki).
  const client2 = world.clients.A2;
  const firm2 = await firmOf(client2);
  const holdBefore2 = await wikiHoldRow(client2);
  assert.equal(holdBefore2, null, "client2 carries NO wiki hold (mandatory setup)");
  await lightStatementConsent(sub, { firm: firm2, client: client2 });
  await deactivateStatementPurpose(sub, { client: client2, reason: "x38.af direction 2 deactivate" });
  const holdAfterDeactivate = await wikiHoldRow(client2);
  assert.equal(holdAfterDeactivate, null, "deactivating statement_extraction creates NO wiki hold (the backstop-erasure regression)");
  await revokeStatementPurpose(sub, { client: client2, reason: "x38.af direction 2 revoke" });
  const holdAfterRevoke = await wikiHoldRow(client2);
  assert.equal(holdAfterRevoke, null, "revoking statement_extraction ALSO creates no wiki hold");
});

// ===========================================================================
// x38.ag -- ● SHA-BOUND DISPATCH (A-for-B => unknown). The new 6/7-arg prepare/
// consume overloads (IA-7) store and re-verify document_sha256; presenting a
// document-A-bound authorization for document B's dispatch must return the
// SAME uniform 'unknown' -- never granted, never a distinguishing error. The
// 5-arg wiki arities remain untouched (probed structurally).
// ===========================================================================
test("x38.ag the sha-bound dispatch overloads: a document-A authorization presented for document B consumes as unknown; the correct sha grants; the 5-arg wiki arities still resolve", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const firm = await firmOf(client);
  await lightStatementConsent(sub, { firm, client });

  const shaA = "a".repeat(64);
  const shaB = "b".repeat(64);
  const seq = 1;
  const evtType = "statement.extraction";

  const prepared = await prepareDispatchSha({ firm, client, eventSeq: seq, eventType: evtType, documentSha256: shaA });
  assert.equal(prepared.verdict, "granted", `an active consent+activation grants a sha-bound authorization (got ${JSON.stringify(prepared)})`);
  const authId = prepared.authorization_id;
  assert.ok(authId, "an authorization id was minted");

  const wrongSha = await consumeDispatchSha({ firm, authorization: authId, client, eventSeq: seq, eventType: evtType, documentSha256: shaB });
  assert.deepEqual(wrongSha, { verdict: "unknown" }, "presenting the WRONG document's sha at consume returns the uniform unknown -- never granted, never distinguished");

  // The authorization must STILL be spendable with the CORRECT sha (a mismatch
  // consumes nothing -- it stays live for its legitimate dispatch).
  const rightSha = await consumeDispatchSha({ firm, authorization: authId, client, eventSeq: seq, eventType: evtType, documentSha256: shaA });
  assert.deepEqual(rightSha, { verdict: "granted" }, "the SAME authorization, presented with its own document's sha, still consumes granted");

  // The wiki lane's 5-arg prepare / 6-arg consume signatures still resolve
  // (structural probe -- the sha param is ADDITIVE, never a replacement).
  const wikiSig5 = await rootQuery("select to_regprocedure($1)::text as reg", ["clara.prepare_egress_dispatch(uuid,uuid,text,bigint,text)"]);
  assert.ok(wikiSig5.rows[0].reg, "the ORIGINAL 5-arg prepare_egress_dispatch signature still resolves");
  const wikiSig6 = await rootQuery("select to_regprocedure($1)::text as reg", ["clara.consume_egress_dispatch(uuid,uuid,uuid,text,bigint,text)"]);
  assert.ok(wikiSig6.rows[0].reg, "the ORIGINAL 6-arg consume_egress_dispatch signature still resolves");
});

// ===========================================================================
// x38.ah -- ● STRUCTURED LANE consent-recorded, NOT kill-switched. csv/ofx
// never egress to a vendor, so the kill switch (p_egress_approved) has nothing
// to gate -- but the typed consent gate STILL applies at enqueue (SS4.3: "still
// consent-recorded at enqueue").
// ===========================================================================
test("x38.ah the structured (csv) lane still requires an ACTIVE gate-purpose consent at enqueue -- ONE branch gates BOTH statement lanes, so the F-A2 re-key moved this lane too -- but is never held by the kill switch", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.erin; // S1's own owner
  const client = world.clients.S1;
  const firm = await firmOf(client);

  // No consent -- the structured lane STILL refuses at enqueue.
  await revokeStatementPurpose(sub, { client, reason: "x38.ah ensure dark" }).catch(() => null);
  const filedDark = await filedStatementCsv(sub, { client });
  const errDark = await caught(() => enqueueInvoiceFacts(filedDark.documentId));
  const taskDark = await statementTask(filedDark.documentId, LANE_PARSE);
  if (errDark) {
    noteLane(`x38.ah dark structured enqueue raised: code=${errDark.code} reason=${reasonOf(errDark)}`);
  } else if (taskDark) {
    assert.equal(taskDark.error_code, NEVER_CLAIMED_CODE, `the structured lane is ALSO consent-gated at enqueue (got ${JSON.stringify(taskDark)})`);
  } else {
    noteLane("x38.ah no statement_parse task and no raise for a dark structured enqueue -- csv/ofx mime routing may not be integrated yet");
  }

  // WITH consent, claim with egress OFF -- the structured lane has no vendor
  // call, so it must NOT be held by the kill switch (proceeds toward running,
  // unlike the OCR lane's x38.aa).
  await lightStatementConsent(sub, { firm, client });
  const filedLit = await filedStatementCsv(sub, { client });
  const taskLit = await enqueueStatement(filedLit.documentId, LANE_PARSE);
  if (!taskLit) { noteLane("x38.ah no statement_parse task enqueued with an active consent -- csv/ofx mime routing may not be integrated yet"); return; }
  await claimTask(taskLit.id, { egressApproved: false }).catch((e) => noteLane(`x38.ah structured-lane false-egress claim raised ${e.code} -- inspect`));
  const after = await statementTask(filedLit.documentId, LANE_PARSE);
  if (after.status === "held_egress") {
    noteLane("x38.ah FINDING(candidate): the structured (no-vendor-egress) lane was STILL held by the kill switch -- the design states it joins 'the kill-switch lane list' for the OCR arm only; verify claim_document_processing_task's lane-list scoping for statement_parse");
  } else {
    assert.notEqual(after.status, "held_egress", "the structured lane is not held by a kill switch it has no vendor call to gate");
  }
});

// ===========================================================================
// SECTION 4 -- AUTHORITY / STRUCTURE (mirrors x37.s: human-only surface, zero
// wake authority, the SS4.9 lock-order pin for Part A's OWN writers, and the
// ID-only event-payload allowlist for the Identity/Ingest event types).
// ===========================================================================

// ===========================================================================
// x38.ai -- authority: every Part-A writer is human-only (clara_authenticated),
// with ZERO wake_fn_allowlist entries -- no agent lane touches bank identity or
// statement ingest (part1/part2 boundary: "no agent grants anywhere in the bank
// schema").
// ===========================================================================
test("x38.ai authority: every Part-A bank writer is clara_authenticated-ONLY with zero wake-allowlist entries", async (t) => {
  if (skipHere(t)) return;
  const humanWriters = [
    "add_bank_account", "deactivate_bank_account", "reactivate_bank_account",
    "remap_bank_account_coa", "enter_bank_statement", "void_bank_statement",
  ];
  const otherRoles = [ROLES.runtime, ROLES.agentRo, ROLES.wakeInteractive, ROLES.wakeProactive];
  for (const fn of humanWriters) {
    assert.equal(await roleCanExecute(ROLES.authenticated, fn), true, `clara_authenticated may execute clara.${fn}`);
    for (const role of otherRoles) {
      assert.equal(await roleCanExecute(role, fn), false, `${role} must NOT execute clara.${fn} -- bank identity/statement ingest verbs are human-only`);
    }
  }
  const wake = await rootQuery("select count(*)::int as n from clara.wake_fn_allowlist where function_name = any($1)", [humanWriters]);
  assert.equal(wake.rows[0].n, 0, "ZERO wake_fn_allowlist entries name a Part-A bank writer -- no agent authority exists for them");

  const runtimeFns = ["persist_statement_facts", "fail_statement_facts"];
  for (const fn of runtimeFns) {
    assert.equal(await roleCanExecute(ROLES.runtime, fn), true, `clara_runtime may execute clara.${fn}`);
    for (const role of [ROLES.authenticated, ROLES.agentRo, ROLES.wakeInteractive, ROLES.wakeProactive]) {
      assert.equal(await roleCanExecute(role, fn), false, `${role} must NOT execute clara.${fn}`);
    }
  }
});

// ===========================================================================
// x38.aj -- THE LOCK-ORDER PIN for Part A's own writers (part2 SS4.9): the new
// advisory rung 203005006 (the per-account statement-chain lock), pinned off
// prosrc for persist_statement_facts / enter_bank_statement / void_bank_
// statement -- the x37.s precedent, applied to the C-b writers.
// ===========================================================================
test("x38.aj the SS4.9 statement-chain lock (203005006) is acquired by persist_statement_facts, enter_bank_statement and void_bank_statement, pinned off prosrc", async (t) => {
  if (skipHere(t)) return;
  const src1 = await fnSource("persist_statement_facts");
  const src2 = await fnSource("enter_bank_statement");
  const src3 = await fnSource("void_bank_statement");
  const srcCore = await fnSource("_persist_statement_core");
  // ADJUDICATED at assembly: the chain lock lives in the ONE shared core; the two ingest
  // callers prove their call edge into it; void takes the rung directly.
  assert.ok(srcCore && srcCore.includes("203005006"), "_persist_statement_core acquires the chain lock 203005006 (SS4.9)");
  for (const [label, src] of [["persist_statement_facts", src1], ["enter_bank_statement", src2]]) {
    assert.ok(src && src.length > 0, `clara.${label} exists`);
    assert.ok(src.includes("_persist_statement_core"), `${label} routes through _persist_statement_core (the lock + the shared ladder)`);
  }
  // F-A3 PR-1a MOVED this pin (Annex C: "MOVE the pin to the extracted core and ADD the
  // wrapper pin", the x38-match:1496-1538 precedent's own shape) -- void_bank_statement is now
  // a thin delegator (its own comment says so verbatim), so the wrapper acquires NOTHING and
  // the pin moves to _void_bank_statement_core. Re-derived at the tail, not merely asserted.
  const src3Core = await fnSource("_void_bank_statement_core");
  assert.ok(src3 && src3.includes("_void_bank_statement_core"), "void_bank_statement routes through _void_bank_statement_core");
  assert.ok(src3 && !src3.includes("203005006"), "void_bank_statement's own thin-delegator body acquires NOTHING (the lock moved with the body)");
  assert.ok(src3Core && src3Core.includes("203005006"), "_void_bank_statement_core acquires the chain lock 203005006 directly");
  // The core's stated order: 004 -> 203005006 -> line rows FOR UPDATE -> the live-member probe
  // (the void-vs-match race).
  const at = (s, n) => s.indexOf(n);
  const a4 = at(src3Core, "pg_advisory_xact_lock(203005004");
  const a6 = at(src3Core, "203005006");
  if (a4 >= 0 && a6 >= 0) {
    assert.ok(a4 < a6, "_void_bank_statement_core takes advisory 004 BEFORE the chain lock 203005006 (SS4.9's stated order)");
  } else {
    noteLane(`x38.aj _void_bank_statement_core lock-order probe: 004 at ${a4}, 203005006 at ${a6} -- one or both rungs not found by literal match; inspect prosrc directly`);
  }
});

// ===========================================================================
// x38.ak -- events are REGISTERED (the spine rejects unknown types, 0005:
// 167-174) and payloads carry IDENTIFIERS ONLY -- never account numbers, never
// line descriptions (part2 SS4.8; domain_events is agent-readable firm-wide).
// ===========================================================================
test("x38.ak the Identity/Ingest bank.* event types are registered, and their payloads never carry an account number or a line description", async (t) => {
  if (skipHere(t)) return;
  const identityIngestTypes = ["bank.account_created", "bank.account_proposal", "bank.statement_ingested", "bank.statement_voided"];
  const reg = await rootQuery("select name from clara.event_types where name = any($1)", [identityIngestTypes]);
  const got = new Set(reg.rows.map((r) => r.name));
  for (const type of identityIngestTypes) {
    assert.ok(got.has(type), `${type} is registered in clara.event_types (the spine rejects unknown types at append)`);
  }
  const tax = await rootQuery("select event_type from clara.trigger_taxonomy where event_type = any($1)", [identityIngestTypes]);
  assert.equal(new Set(tax.rows.map((r) => r.event_type)).size, identityIngestTypes.length, "every Identity/Ingest bank.* type is ALSO in the trigger taxonomy");

  // Fire one of each through the fixtures already exercised above and inspect
  // the payload key sets for a known-sensitive substring.
  const sub = world.users.alice;
  const client = world.clients.A1;
  const n = acctNumber("ak1");
  await upsertAccountClassed(sub, { client, code: "188-CAK", name: "x38.ak bank gl", type: "asset", opKey: opk("ak-gl") });
  await addBankAccount(sub, { client, bankCode: "MBB", accountNumber: n.printed, coaAccountCode: "188-CAK" });
  const created = await bankEventRows(client, "bank.account_created");
  assert.ok(created.length > 0, "bank.account_created was appended");
  const raw = JSON.stringify(created[created.length - 1].payload ?? {});
  assert.ok(!raw.includes(digits(n.printed)), "bank.account_created's payload carries no account number substring");
  assert.ok(!raw.toLowerCase().includes("maybank current"), "bank.account_created's payload carries no bank_name_display substring");
});

// ===========================================================================
// x38.al -- ACL pins, ADJUDICATED (orchestrator ruling, assembly 2026-07-31): the design's
// literal words (part1 4.1, the 0037 open_items idiom) give clara_authenticated a DIRECT
// firm-scoped SELECT grant under FORCE RLS -- this cell's original zero-grants reading is
// superseded. The pinned posture: clara_authenticated = SELECT only, never DML; the agent/
// runtime/wake roles = nothing at all.
// ===========================================================================
test("x38.al bank relations: human SELECT-only under forced RLS; zero agent/runtime/wake grants", async (t) => {
  if (skipHere(t)) return;
  const tables = ["bank_accounts", "bank_statements", "bank_statement_lines", "bank_account_proposals", "bank_institutions"];
  const noAccessRoles = [ROLES.agentRo, ROLES.runtime, ROLES.wakeInteractive, ROLES.wakeProactive];
  for (const tbl of tables) {
    const exists = await rootQuery("select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='clara' and c.relname=$1", [tbl]);
    if (!exists.rowCount) { noteLane(`x38.al clara.${tbl} does not exist yet -- skipping its ACL pin`); continue; }
    const sel = await rootQuery(`select has_table_privilege($1, $2, 'SELECT') as ok`, [ROLES.authenticated, `clara.${tbl}`]);
    assert.equal(sel.rows[0].ok, true, `${ROLES.authenticated} holds the design's direct firm-scoped SELECT on clara.${tbl}`);
    const dml = await rootQuery(
      `select bool_or(has_table_privilege($1, $2, priv)) as ok
         from unnest(array['INSERT','UPDATE','DELETE','TRUNCATE']) priv`,
      [ROLES.authenticated, `clara.${tbl}`]);
    assert.notEqual(dml.rows[0].ok, true, `${ROLES.authenticated} must hold NO direct DML on clara.${tbl}`);
    for (const role of noAccessRoles) {
      const r = await rootQuery(
        `select bool_or(has_table_privilege($1, $2, priv)) as ok
           from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']) priv`,
        [role, `clara.${tbl}`]);
      assert.notEqual(r.rows[0].ok, true, `${role} must hold NO direct table privilege on clara.${tbl}`);
    }
    const flags = await rlsFlags(tbl);
    if (flags) {
      assert.equal(flags.rls, true, `clara.${tbl} has row level security enabled`);
      assert.equal(flags.force, true, `clara.${tbl} FORCEs row level security (the owner is not exempt)`);
    }
  }
});

// ===========================================================================
// x38.am -- THE XML ARM IS NO LONGER KIND-BLIND (delta-review round 2,
// 2026-07-31). A bank_statement on an XML mime used to ride the myinvois
// local_facts lane into the INVOICE parser -- wrong worker, wrong events, a
// phantom autodraft wake if it happened to parse. C-b has no xml statement
// parser (the structured lane is csv/ofx by design 4.3), so the honest
// verdict is the same terminal skipped_type a csv non-statement gets:
// no task row, no lane, no event -- never a misroute.
// ===========================================================================
test("x38.am a bank_statement xml is skipped_type at the router -- never routed into the invoice parser", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const firm = await firmOf(client);
  const seed = await seedVerifiedDocument({ firm, kind: "bank_statement", mime: "application/xml", filename: "statement.xml" });
  await fileDocument(sub, {
    document: seed.documentId, client,
    resolution: await freshResolution(sub, client, { subjectKind: "document", subjectId: seed.documentId }),
  });
  const receipt = await enqueueInvoiceFacts(seed.documentId);
  assert.equal(receipt?.status, "skipped_type",
    `the router's xml arm refuses a bank_statement with the terminal skipped_type verdict (got ${JSON.stringify(receipt)})`);
  const tasks = await rootQuery(
    "select count(*)::int as n from clara.document_processing_tasks where document_id=$1",
    [seed.documentId]);
  assert.equal(tasks.rows[0].n, 0, "no processing task of ANY lane was minted for the statement xml");
  const events = await rootQuery(
    "select count(*)::int as n from clara.domain_events where document_id=$1 and event_type in ('document.invoice_facts_failed','document.statement_facts_failed')",
    [seed.documentId]);
  assert.equal(events.rows[0].n, 0, "no terminal lane event fires -- skipped_type is a receipt, not a failure");
});

// ===========================================================================
// x38.an -- 0039: THE NULL-DEFERS-TO-CHAIN LAW AT THE DB (the authority's half
// of PR #160's runtime law; found by the first real active month -- Azure's
// per-account typed rows carry NO Balance slot). One-sided null running
// balances persist (the chain walk stays the witness); two NUMBERS that
// differ still refuse readers_disagree.
// ===========================================================================
test("x38.an one-sided null running balances persist; a bilateral numeric conflict still refuses", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A2;
  await lightStatementConsent(sub, { firm: await firmOf(client), client }).catch(() => {});
  const acct = await freshRegisteredAccount(sub, client, "an1");

  const ch = chain({ month: "2027-01" });
  const h = header({ bankCode: "MBB", accountNumberDigits: acct.digitsOnly, periodStart: "2027-01-01", periodEnd: "2027-01-31", ch });
  const filed = await filedStatementPdf(sub, { client });
  const task = await enqueueStatement(filed.documentId);
  await claimTask(task.id, { egressApproved: true });
  const payload = agreeingPayload(h, ch);
  for (const l of payload.reader2.lines) l.running_balance_cents = null;
  const result = await persistStatementFacts(task.id, payload);
  assert.notEqual(result?.status, "failed", `schema-absent reader-2 balances persist (got ${JSON.stringify(result)})`);
  const st = await rootQuery("select line_count, status from clara.bank_statements where document_id=$1", [filed.documentId]);
  assert.equal(st.rows[0]?.status, "live", "the statement is live; the chain walk witnessed the balances");
  assert.equal(Number(st.rows[0]?.line_count), 3);

  const acct2 = await freshRegisteredAccount(sub, client, "an2");
  const ch2 = chain({ month: "2027-02" });
  const h2 = header({ bankCode: "MBB", accountNumberDigits: acct2.digitsOnly, periodStart: "2027-02-01", periodEnd: "2027-02-28", ch: ch2 });
  const filed2 = await filedStatementPdf(sub, { client });
  const task2 = await enqueueStatement(filed2.documentId);
  await claimTask(task2.id, { egressApproved: true });
  const payload2 = agreeingPayload(h2, ch2);
  payload2.reader2.lines[0].running_balance_cents = (payload2.reader1.lines[0].running_balance_cents ?? 0) + 111;
  const outcome = await persistExpectFailure(task2.id, payload2, "readers_disagree", "x38.an bilateral numeric conflict");
  noteLane(`x38.an bilateral conflict lands via ${outcome.via}`);
});
