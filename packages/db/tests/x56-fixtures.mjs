// 0056 (Wave E lane beta, the close model) rig -- fixture helpers (NOT a test file:
// the name does not end in `.test.mjs`, so `node --test` ignores it). Reuses the x55/
// wb-fixtures idioms (world-building, JWT contexts, role helpers) per the work order.
// Contract-blind: every claim in the test files is proved against the LIVE CATALOG,
// never this file's understanding of 0056_wave_e_close_model.sql.

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  rootQuery, humanQuery, getPool, opk,
  createClient, upsertAccountClassed, draftEntryV3, approveEntry, freshResolution, counterpartyRows,
} from "./wave-a-fixtures.mjs";

// ---------------------------------------------------------------------------
// Readiness -- LIVE CATALOG only, never the migration file.
// ---------------------------------------------------------------------------

export async function has0056() {
  const t = await rootQuery(
    "select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='clara' and c.relname='fiscal_years'",
  );
  if (t.rows.length === 0) return false;
  const g = await rootQuery(
    "select 1 from pg_proc p where p.pronamespace='clara'::regnamespace and p.proname='finalize_close'",
  );
  return g.rows.length > 0;
}

/** B3 (ADR-068 ruling 1) frontier probe: has the ends_on-dated reopen reversal landed?
 *  Read from clara.schema_migrations by the file STEM, never by a number -- migration
 *  numbers are claimed at merge, so a number gate would break the moment the pair is
 *  renumbered. The regex form (not LIKE) keeps the underscores literal. Part 1 is what
 *  carries the body, so part 1's row is the gate; `$` anchors it away from part 2's stem. */
/** Q-D6's close-seal wall (`migrations/UNNUMBERED_qd6_close_seal_wall.sql`) — the FIFTEENTH
 *  gate-catalog row, drawer 1. Read from the LIVE CATALOG, never a filename and never a
 *  schema_migrations row, so a renumber cannot move it.
 *
 *  WHY EVERY CATALOG-ROSTER ASSERTION IN THIS SUITE BRANCHES ON IT (裁-108): the migration
 *  ships UNNUMBERED, and `scripts/migrate.mjs`'s file filter (`/^\d+.*\.sql$/`, migrate.mjs:59)
 *  skips anything that does not start with four digits — silently. So on CI, and on any rig
 *  migrated before the number is claimed at merge prep, the catalog is FOURTEEN rows; after
 *  the claim it is fifteen. A bare count would be red on one side or the other. The roster is
 *  still asserted EXACTLY on both branches — this witness chooses which roster, never whether
 *  one is checked. */
export const QD6_GATE_KEY = "deferred_opening_resolved";
export async function hasQd6Wall() {
  const r = await rootQuery(
    "select exists(select 1 from clara.close_gate_checks where check_key=$1) as present", [QD6_GATE_KEY]);
  return r.rows[0].present;
}

export async function hasB3() {
  const r = await rootQuery(
    "select count(*)::int as n from clara.schema_migrations where version ~ 'b3_reopen_ends_on$'",
  );
  return r.rows[0].n === 1;
}

/** The reopen verb's LIVE signature. B3 appends p_attestation (defaulted) and drops the 4-arg
 *  form, so anything probing by regprocedure has to ask rather than hard-code. */
export async function reopenSig() {
  return (await hasB3())
    ? "clara.reopen_fiscal_year(uuid,text,jsonb,text,text)"
    : "clara.reopen_fiscal_year(uuid,text,jsonb,text)";
}

/** F-A4 PR-1b (close-key-1 Window B) frontier probe: has the entrance-seam body-move landed?
 *  Read from a body only that window creates, never a migration number or filename (numbers
 *  are claimed at merge; a renumber must never move what this probe answers). */
export async function hasFA4PR1B() {
  const r = await rootQuery(
    "select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='clara' and p.proname='_begin_close_core'",
  );
  return r.rows.length > 0;
}

/** attest_close_exception's LIVE signature. F-A4 PR-1b appends p_from_proposal (defaulted) and
 *  DROPs the 5-arg overload rather than leaving it to coexist (a bare CREATE OR REPLACE with an
 *  added argument creates a second overload, not a replacement -- 42725 ambiguous-call otherwise)
 *  -- so anything probing by regprocedure has to ask rather than hard-code. */
export async function attestCloseSig() {
  return (await hasFA4PR1B())
    ? "clara.attest_close_exception(uuid,text,text,text,text,uuid)"
    : "clara.attest_close_exception(uuid,text,text,text,text)";
}

export async function caught(fn) {
  try { await fn(); return null; } catch (e) { return e; }
}

// ---------------------------------------------------------------------------
// Suite-scoped COA ("-C56").
// ---------------------------------------------------------------------------

export const AR1 = "374-C56"; // receivable control
export const AP1 = "474-C56"; // payable control
export const RE1 = "390-C56"; // retained earnings (special_acc_type)
export const REVN = "684-C56"; // revenue (income)
export const EXPN = "574-C56"; // expense
export const BANK1 = "170-C56"; // plain asset (no account_class) -- P&L legs route through
                                 // THIS, never AR1/AP1, so the control accounts stay at their
                                 // untouched GL=0 / subledger=0 tie without needing a
                                 // counterparty-bound item to keep them there.

/** A close-capable client: AR/AP controls (needed so the drawer-1 AR/AP ties resolve
 *  to exactly one account instead of 'unknown'), one retained-earnings marker, a
 *  revenue/expense pair, and a plain bank leg. trade_nature is recorded 'services' so
 *  the goods-trading gate (closing_stock_present) reads PASS, not UNKNOWN -- 0056's own
 *  engine only skips that check when the fact says exactly 'services' (S6.3), so a bare
 *  client without it would sit UNKNOWN and refuse close. */
export async function setupCloseCoa(sub, client) {
  await upsertAccountClassed(sub, { client, code: AR1, name: "Trade Debtors (x56)", type: "asset", accountClass: "receivable", opKey: opk("x56-ar") });
  await upsertAccountClassed(sub, { client, code: AP1, name: "Trade Creditors (x56)", type: "liability", accountClass: "payable", opKey: opk("x56-ap") });
  await upsertAccountClassed(sub, { client, code: RE1, name: "Retained Earnings (x56)", type: "equity", special: "retained_earnings", opKey: opk("x56-re") });
  await upsertAccountClassed(sub, { client, code: REVN, name: "Revenue (x56)", type: "income", opKey: opk("x56-rev") });
  await upsertAccountClassed(sub, { client, code: EXPN, name: "Expense (x56)", type: "expense", opKey: opk("x56-exp") });
  await upsertAccountClassed(sub, { client, code: BANK1, name: "Bank (x56)", type: "asset", opKey: opk("x56-bank") });
  await recordClientFact(sub, { client, factKey: "trade_nature", factValue: "services", basis: "x56 rig: a service business by fixture design", basisKind: "owner_instruction" });
  // F-A3/PR-1b's drawer-2 arm 4 (TA-P14, 2026-08-22 ratified): a client's banking posture is
  // DECLARED, never inferred from absence (law 68) -- BANK1 above is a plain asset leg, never
  // registered through add_bank_account, so this fixture's clients carry ZERO clara.bank_accounts
  // rows. Without this declaration the drawer-2 gate reads the zero-registry case `not_evaluable`
  // and the close gate fails `no_registered_account` -- exactly the wall arm 4 exists to raise.
  await recordClientFact(sub, { client, factKey: "banking_arrangement", factValue: "no_accounts", basis: "x56 rig: a genuinely bank-less client by fixture design", basisKind: "owner_instruction" });
}

export async function recordClientFact(sub, { client, factKey, factValue, basis, basisKind, sourceDocument = null, opKey = null }) {
  const r = await humanQuery(
    sub,
    `select clara.record_client_fact(p_client => $1, p_fact_key => $2, p_fact_value => $3::jsonb,
       p_basis => $4, p_basis_kind => $5, p_source_document_id => $6, p_op_key => $7) as r`,
    [client, factKey, JSON.stringify(factValue), basis, basisKind, sourceDocument, opKey ?? opk("x56-fact")],
  );
  return r.rows[0].r;
}

export async function freshActiveClient(sub, tag) {
  return createClient(sub, { name: `x56_${tag}_${randomUUID().slice(0, 8)}`, opKey: opk(`x56-cli-${tag}`) });
}

const manualRes = (sub, client) => freshResolution(sub, client, { subjectKind: "manual", subjectId: null });

/** A balanced, approved entry (Dr debit/Cr credit) at postingDate -- the plainest
 *  building block for P&L movement, AR/AP breaks, and drafts-in-period fixtures. */
export async function plainEntry(sub, { client, debit, credit, cents, postingDate, memo = "x56 entry" }) {
  const d = await draftEntryV3(sub, {
    client, resolution: manualRes(sub, client), memo, postingDate,
    lines: [
      { account_code: debit, debit_cents: cents, credit_cents: 0, description: "dr" },
      { account_code: credit, debit_cents: 0, credit_cents: cents, description: "cr" },
    ],
    opKey: opk("x56-entry"),
  });
  await approveEntry(sub, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("x56-entrya") });
  return d.entry_id;
}

// ---------------------------------------------------------------------------
// Close-verb wrappers.
// ---------------------------------------------------------------------------

export async function proposeFY(sub, { client, startsOn }) {
  const r = await humanQuery(sub, "select clara.propose_fiscal_year(p_client => $1, p_starts_on => $2::date) as r", [client, startsOn]);
  return r.rows[0].r;
}

export async function openFY(sub, { client, label, startsOn, endsOn, lengthReason = null, opKey = null }) {
  const r = await humanQuery(
    sub,
    "select clara.open_fiscal_year(p_client => $1, p_label => $2, p_starts_on => $3::date, p_ends_on => $4::date, p_length_reason => $5, p_op_key => $6) as r",
    [client, label, startsOn, endsOn, lengthReason, opKey ?? opk("x56-openfy")],
  );
  return r.rows[0].r;
}

/** open_fiscal_year at the client's default (12/31) cadence, one full calendar year. */
export async function openDefaultFY(sub, { client, startsOn, tag = "FY" }) {
  const proposal = await proposeFY(sub, { client, startsOn });
  return openFY(sub, { client, label: `${tag} ${startsOn}`, startsOn, endsOn: proposal.ends_on });
}

export async function beginClose(sub, { fy, opKey = null }) {
  const r = await humanQuery(sub, "select clara.begin_close(p_fy => $1, p_op_key => $2) as r", [fy, opKey ?? opk("x56-begin")]);
  return r.rows[0].r;
}

// itemKey: required on an ITEMIZED gate (unapproved_drafts_in_period -> entry_id,
// uncoded_documents -> filing_id, depreciation_through_fy_end -> asset_id,
// open_bank_recon_items -> exception_id or bank_account_id||':'||month), null for a
// scalar gate (Codex R1 MAJOR 1 -- attest_close_exception's own item domain).
export async function attestClose(sub, { closeRun, checkKey, reason, itemKey = null, opKey = null }) {
  const r = await humanQuery(
    sub,
    "select clara.attest_close_exception(p_close_run => $1, p_check_key => $2, p_reason => $3, p_op_key => $4, p_item_key => $5) as r",
    [closeRun, checkKey, reason, opKey ?? opk("x56-attest"), itemKey],
  );
  return r.rows[0].r;
}

export async function finalizeClose(sub, { fy, selfAttestation = null, opKey = null }) {
  const r = await humanQuery(sub, "select clara.finalize_close(p_fy => $1, p_self_attestation => $2, p_op_key => $3) as r", [fy, selfAttestation, opKey ?? opk("x56-finalize")]);
  return r.rows[0].r;
}

export async function abandonClose(sub, { closeRun, reason, opKey = null }) {
  const r = await humanQuery(sub, "select clara.abandon_close(p_close_run => $1, p_reason => $2, p_op_key => $3) as r", [closeRun, reason, opKey ?? opk("x56-abandon")]);
  return r.rows[0].r;
}

/** FRONTIER-AWARE. B3 (ADR-068 ruling 1) appends p_attestation, so the wrapper calls the
 *  5-arg form once B3 has landed and the 4-arg form before it -- one call site for both. */
export async function reopenFY(sub, { fy, reason, correctionTarget, opKey = null, attestation = null }) {
  const b3 = await hasB3();
  const r = await humanQuery(
    sub,
    b3
      ? "select clara.reopen_fiscal_year(p_fy => $1, p_reason => $2, p_correction_target => $3::jsonb, p_op_key => $4, p_attestation => $5) as r"
      : "select clara.reopen_fiscal_year(p_fy => $1, p_reason => $2, p_correction_target => $3::jsonb, p_op_key => $4) as r",
    b3
      ? [fy, reason, JSON.stringify(correctionTarget), opKey ?? opk("x56-reopen"), attestation]
      : [fy, reason, JSON.stringify(correctionTarget), opKey ?? opk("x56-reopen")],
  );
  return r.rows[0].r;
}

/** POST-B3 A REOPEN IS A DISTINCT-CHECKER ACT: the reversal of a year-end close is high-stakes,
 *  so the human who SIGNED the close may not be the one who reverses it while the firm has >=2
 *  eligible checkers (clara._approve_entry_core's own CLR05 rule, extended to this act). The
 *  factory default grants the reopen capability to owners only, so the lawful shape is to grant
 *  it to a second eligible human and reopen as them. Returns the actor to reopen as -- and is a
 *  NO-OP on a pre-B3 frontier, where the closer may still reopen their own close. */
export async function reopenerFor(owner, { closer, alternate, reason = "x56 rig: the reopen is a distinct-checker act" }) {
  if (!(await hasB3()) || alternate == null || alternate === closer) return closer;
  // IDEMPOTENT: uq_capability_active is a partial unique index over live grants, so a second
  // grant to the same human raises. Cells share a world, so this helper is called many times.
  const live = await rootQuery(
    `select 1 from clara.firm_capability_grants g
      where g.user_id=$1 and g.capability='reopen' and g.revoked_at is null`, [alternate]);
  if (live.rows.length === 0) await grantCapability(owner, { user: alternate, capability: "reopen", reason });
  return alternate;
}

export async function verifyClose(sub, { receipt }) {
  const r = await humanQuery(sub, "select clara.verify_close(p_receipt => $1) as r", [receipt]);
  return r.rows[0].r;
}

export async function getCloseReadiness(sub, { client, fy }) {
  const r = await humanQuery(sub, "select clara.get_close_readiness(p_client => $1, p_fy => $2) as r", [client, fy]);
  return r.rows[0].r;
}

export async function listFiscalYears(sub, { client }) {
  const r = await humanQuery(sub, "select clara.list_fiscal_years(p_client => $1) as r", [client]);
  return r.rows[0].r;
}

export async function grantCapability(sub, { user, capability, reason, opKey = null }) {
  const r = await humanQuery(sub, "select clara.grant_firm_capability(p_user => $1, p_capability => $2, p_reason => $3, p_op_key => $4) as r", [user, capability, reason, opKey ?? opk("x56-grant")]);
  return r.rows[0].r;
}

export async function revokeCapability(sub, { user, capability, reason, opKey = null }) {
  const r = await humanQuery(sub, "select clara.revoke_firm_capability(p_user => $1, p_capability => $2, p_reason => $3, p_op_key => $4) as r", [user, capability, reason, opKey ?? opk("x56-revoke")]);
  return r.rows[0].r;
}

/** A "clean, closeable" FY: a client with a resolvable AR + AP control (both tie at
 *  zero -- no AR/AP activity), 'services' trade_nature, and one small approved P&L
 *  movement inside the FY (so finalize_close mints a real closing entry, not the
 *  empty-year no-entry path). No bank accounts, no fixed assets -- both drawer-1/2/3
 *  bank and FA gates read vacuously TRUE with none enrolled (measured against the live
 *  bodies, not assumed). Returns { client, fy, revenueEntry, expenseEntry }. */
/** setupSub (admin+) opens the client/FY; prepSub (defaults to setupSub, but a caller
 *  closing with a DIFFERENT actor should pass a bookkeeper here) posts the P&L entries
 *  -- so finalize_close's segregation check (closer != last preparer, matrix A12) is
 *  satisfiable by closing with an actor distinct from prepSub. */
export async function cleanCloseableFY(setupSub, { tag, prepSub = setupSub, startsOn = "2027-01-01", revCents = 500000, expCents = 200000 } = {}) {
  const client = await freshActiveClient(setupSub, tag);
  await setupCloseCoa(setupSub, client);
  const proposal = await proposeFY(setupSub, { client, startsOn });
  const opened = await openFY(setupSub, { client, label: `${tag} FY1`, startsOn, endsOn: proposal.ends_on });
  const midYear = addDaysStr(startsOn, 90);
  // Both legs route through BANK1, never AR1/AP1: the control accounts stay UNTOUCHED
  // (GL movement 0), which ties trivially against an empty subledger (0) -- no
  // counterparty binding, no open item, no risk of the subledger belt minting one.
  const revenueEntry = revCents > 0 ? await plainEntry(prepSub, { client, debit: BANK1, credit: REVN, cents: revCents, postingDate: midYear, memo: "x56 revenue" }) : null;
  const expenseEntry = expCents > 0 ? await plainEntry(prepSub, { client, debit: EXPN, credit: BANK1, cents: expCents, postingDate: midYear, memo: "x56 expense" }) : null;
  return { client, fy: opened.fiscal_year_id, startsOn, endsOn: proposal.ends_on, revenueEntry, expenseEntry };
}

/** Birth a counterparty via draft+approve of a tiny non-control entry (the x37/x55
 *  idiom: counterparties are born at APPROVE).
 *
 *  `postingDate` is OPTIONAL and, left unset, falls through to draftEntryV3's own
 *  default ("2026-03-15") — unchanged for every caller that does not care where the
 *  birth entry lands. A caller building a metric snapshot scoped to a ROLLING window
 *  (e.g. `pastMonthStart(n)` off `clara._book_today()`) MUST pass an explicit date
 *  outside that window: the fixed "2026-03-15" default is a wall-clock-collidable
 *  literal that a rolling `pastMonthStart(n)` call sweeps into its own period for
 *  exactly one real-world month (whenever "now" - n months == March 2026) — the same
 *  date-rollover fixture class as the x42 watermark fix in this same PR. */
export async function birthCounterparty(sub, { client, name, kind = "customer", postingDate = undefined }) {
  const proposal = { new: { name } };
  if (kind === "customer") proposal.kind = "customer";
  const d = await draftEntryV3(sub, {
    client, resolution: manualRes(sub, client), memo: `x56 birth ${name}`,
    lines: [
      { account_code: EXPN, debit_cents: 100, credit_cents: 0, description: "birth-dr" },
      { account_code: REVN, debit_cents: 0, credit_cents: 100, description: "birth-cr" },
    ],
    ...(postingDate !== undefined ? { postingDate } : {}),
    vendor: proposal, opKey: opk("x56-birth"),
  });
  await approveEntry(sub, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("x56-birtha") });
  const want = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const cp = (await counterpartyRows(client)).find((c) => (c.name_normalized ?? "") === want);
  assert.ok(cp?.id, `the ${kind} counterparty ${name} was born (mandatory setup)`);
  return cp.id;
}

/** FORCES a drawer-1 control-tie MISMATCH for A2/A24: an open_items row for `domain`
 *  naming a REAL counterparty, but pointing at an entry (`groundEntry`) that never
 *  touched the control account at all -- so the subledger side (aging) carries
 *  `cents` while the GL side stays at whatever it already was (0, in the clean
 *  fixture). NOT reachable through any audited verb: the subledger belt trigger
 *  (_tf_subledger_item_belt) requires the item's amount to match what
 *  _subledger_classify_entry derives from the ENTRY'S OWN lines -- exactly the
 *  congruence that makes a real mismatch nearly impossible to produce lawfully, which
 *  is the whole point of the drawer-1 identity. The belt is silenced (SET LOCAL
 *  session_replication_role='replica', session-scoped, never ALTER TABLE DISABLE
 *  TRIGGER -- see the function body's own comment for the mechanism and why) for the
 *  ONE INSERT that seeds the phantom row (never for anything finalize_close itself
 *  does), inside one transaction. This is a FIXTURE SHORTCUT to reach a prestate, not
 *  a claim about how the mismatch would arise in production. */
export async function forceControlMismatch(sub, { client, domain, groundEntry, counterparty, cents }) {
  const c = await getPool().connect();
  try {
    await c.query("begin");
    // SET LOCAL, never ALTER TABLE ... DISABLE TRIGGER (the A19d dig, 2026-08-11): a
    // DISABLE/ENABLE TRIGGER pair is catalog DDL -- database-GLOBAL between its own
    // disable-commit and re-enable-commit (an AccessExclusive lock, visible to every
    // session, not just this one) -- and under concurrent multi-file test runs that
    // window let an INNOCENT BYSTANDER write that should have refused silently
    // succeed instead (proven: trigger-body instrumentation showed zero log rows on
    // a write that unambiguously happened, root-caused via a 1/80 repro on a harness
    // with no connection to the test that first surfaced it). SET LOCAL
    // session_replication_role is transaction-scoped AND session-local: no catalog
    // change, no lock, no cross-session window, and it sidesteps the 55006 pending-
    // trigger-events restriction entirely (nothing to re-enable, so no straddling
    // transaction is needed either). CAVEAT, measured not assumed: replica mode
    // disables EVERY user trigger and FK check for this session's writes, not just
    // t_open_items_belt -- t_open_items_validate (counterparty-kind-vs-domain) also
    // goes quiet here, but every existing caller already passes a correctly-kinded
    // counterparty, so it would have passed anyway; re-check this if a future caller
    // deliberately wants THAT validation to still fire. SECOND caveat, also measured:
    // setting this GUC takes superuser -- it must run BEFORE `set role clara_fn_owner`
    // (which is not superuser), or Postgres refuses 42501 "permission denied to set
    // parameter" (measured directly, not assumed from the docs).
    await c.query("set local session_replication_role = 'replica'");
    await c.query("set role clara_fn_owner");
    const firm = (await c.query("select firm_id from clara.clients where id=$1", [client])).rows[0].firm_id;
    await c.query(
      `insert into clara.open_items(firm_id, client_id, domain, counterparty_id, entry_id,
         item_kind, item_date, amount_cents, created_by)
       select $1, $2, $3, $4, je.id, 'adjustment', je.posting_date, $5, je.maker_actor
         from clara.journal_entries je where je.id = $6`,
      [firm, client, domain, counterparty, cents, groundEntry],
    );
    await c.query("commit");
  } finally {
    await c.query("rollback").catch(() => {});
    await c.query("reset role").catch(() => {});
    await c.query("reset all").catch(() => {});
    c.release();
  }
}

/** FORGES a genuine divergence between FY(n)'s pinned closing_position and a later
 *  recompute, for A19g's divergence-refusal arm: a balanced, already-approved entry
 *  is inserted directly (root, role clara_fn_owner) dated INSIDE an ALREADY-CLOSED
 *  FY, moving a balance-sheet account by `cents` AFTER the pin was taken. NOT
 *  reachable through any audited verb -- t_period_wall (journal_entries) and
 *  t_period_wall_lines (journal_lines) both refuse this write from every real
 *  writer, which is the whole point of the identity the pin protects. Both
 *  triggers are silenced (SET LOCAL session_replication_role='replica',
 *  session-scoped, never ALTER TABLE DISABLE TRIGGER -- see the function body's own
 *  comment for the mechanism and why) for the ONE insert sequence, inside one
 *  transaction. A FIXTURE SHORTCUT to reach a prestate, not a claim about how
 *  this would arise in production. */
export async function forgeClosedPeriodMovement(sub, { client, postingDate, debit, credit, cents, memo = "x56 forged closed-period movement" }) {
  const c = await getPool().connect();
  let entryId = null;
  try {
    await c.query("begin");
    // SET LOCAL, never ALTER TABLE ... DISABLE TRIGGER -- see forceControlMismatch's
    // own comment (this file) for the mechanism and the A19d dig's finding: a
    // DISABLE/ENABLE pair is database-global catalog DDL between its two commits, a
    // real cross-session guard-off window under concurrent runs; SET LOCAL
    // session_replication_role is transaction-scoped and session-local, no window,
    // no straddling second transaction, no 55006. CAVEAT, measured not assumed:
    // replica mode disables every user trigger on journal_entries/journal_lines for
    // this session, not just the two period-wall ones -- in particular
    // _tf_stamp_from_client and _tf_stamp_line_from_entry (which normally fill
    // firm_id from client_id, and client_id+firm_id from the parent entry) go quiet
    // too, so this forge now supplies firm_id/client_id explicitly, matching exactly
    // what those triggers would have stamped. Every OTHER disabled trigger (balance,
    // provenance, the shape/belt checks) would have passed this specific write
    // unchanged even when active -- it is balanced, manual-origin, and touches no
    // adv/fa/bank/subledger domain -- so silencing them changes nothing observable.
    // SECOND caveat, also measured: setting this GUC takes superuser -- it must run
    // BEFORE `set role clara_fn_owner` (not superuser), or Postgres refuses 42501
    // "permission denied to set parameter" (measured directly, not assumed).
    await c.query("set local session_replication_role = 'replica'");
    await c.query("set role clara_fn_owner");
    const firm = (await c.query("select firm_id from clara.clients where id=$1", [client])).rows[0].firm_id;
    // Born DRAFT with its lines (a fresh line insert on a draft entry is ordinary and
    // does not trip the SEPARATE "lines of an approved entry are immutable" guard),
    // THEN flipped to approved by its own UPDATE -- the same two-step shape every real
    // writer uses, matching what t_period_wall itself is disabled to admit.
    const entryRow = await c.query(
      `insert into clara.journal_entries(firm_id, client_id, status, posting_date, memo, origin,
           maker_actor, last_human_editor)
         values ($1, $2, 'draft', $3, $4, 'manual', $5, $5)
         returning id`,
      [firm, client, postingDate, memo, sub],
    );
    entryId = entryRow.rows[0].id;
    await c.query(
      `insert into clara.journal_lines(entry_id, line_no, client_id, firm_id, account_code, debit_cents, credit_cents, description)
         values ($1, 1, $5, $6, $2, $3, 0, 'forged dr'), ($1, 2, $5, $6, $4, 0, $3, 'forged cr')`,
      [entryId, debit, cents, credit, client, firm],
    );
    await c.query(
      `update clara.journal_entries set status='approved', approved_at=now(), checker_actor=$2 where id=$1`,
      [entryId, sub],
    );
    await c.query("commit");
  } finally {
    await c.query("rollback").catch(() => {});
    await c.query("reset role").catch(() => {});
    await c.query("reset all").catch(() => {});
    c.release();
  }
  return entryId;
}

export function addDaysStr(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function bookToday() {
  const r = await rootQuery("select clara._book_today()::text as d");
  return r.rows[0].d;
}
