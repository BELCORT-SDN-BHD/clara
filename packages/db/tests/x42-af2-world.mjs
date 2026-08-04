// Wave D-b (0042) rig — the AF-2 / producer FIXTURE WORLD + root readbacks (NOT
// a test file: the name does not end in `.test.mjs`, so `node --test` ignores
// it). Re-exports `x42-af2-helpers.mjs` so a test file imports ONE module (the
// x41-fa-fixtures / x41-fa-world precedent; the split exists because the repo's
// 500-line-per-file gate is enforced).
//
// CONTRACT-BLIND — see the helper core's header for the full IA register. Every
// fixture object is built THROUGH the audited verbs (the x37 dog-fooding law); a
// raw INSERT appears ONLY where no audited verb can reach the shape under test,
// and each such site carries a comment saying why.

import assert from "node:assert/strict";
import {
  rootQuery, humanQuery, opk, idOf, ROLES, firmOf, getPool, HIGH_STAKES_CENTS,
  createClient, upsertAccountClassed, grantConsent,
  draftEntryV3, approveEntry, reverseEntry,
} from "./a21-helpers.mjs";
import * as wb from "./wave-b/wb-fixtures.mjs";
import {
  BANKCOA, AR1, AP1, EXPN, REVN, CHARGEX, ADJX, ADVCODE, CODEACC,
  X38_EXPN, X38_REVN,
  addBankAccount, enterStatement, exceptLine, resolveAndBookBankLine,
  proposeRule, signRule,
  matchRow, matchIdOf, birthCounterparty, manualRes, openItemsOf, uniq,
  getBankReconciliation,
} from "./x42-af2-helpers.mjs";

export * from "./x42-af2-helpers.mjs";
// The rig primitives every x42 cell reaches for, forwarded so a test file keeps
// ONE import (approveEntry drives the checker half of every high-stakes flip).
export { wb, firmOf, approveEntry, draftEntryV3, reverseEntry, rootQuery };

// ---------------------------------------------------------------------------
// Root readbacks (superuser bypasses RLS — fixtures and assertions only, never
// the lane under test).
// ---------------------------------------------------------------------------

const rowsOf = async (sql, params) => (await rootQuery(sql, params)).rows.map((x) => x.row);

export const exceptionRow = async (id) =>
  (await rootQuery("select to_jsonb(x) as row from clara.bank_line_exceptions x where x.id=$1", [id])).rows[0]?.row ?? null;
export const exceptionRowsOfLine = (line) =>
  rowsOf("select to_jsonb(x) as row from clara.bank_line_exceptions x where x.line_id=$1 order by x.created_at, x.id", [line]);
export const entryRowOf = async (entry) =>
  (await rootQuery("select to_jsonb(e) as row from clara.journal_entries e where e.id=$1", [entry])).rows[0]?.row ?? null;
export const entryLinesOf = (entry) =>
  rowsOf("select to_jsonb(l) as row from clara.journal_lines l where l.entry_id=$1 order by l.line_no", [entry]);
export const ruleRow = async (id) =>
  (await rootQuery("select to_jsonb(r) as row from clara.bank_rules r where r.id=$1", [id])).rows[0]?.row ?? null;
export const statementRow = async (id) =>
  (await rootQuery("select to_jsonb(s) as row from clara.bank_statements s where s.id=$1", [id])).rows[0]?.row ?? null;

/** Every entry of a client carrying one of the three D-b proposal flags keys
 *  (ABI §B), oldest first. */
export const entriesWithFlag = (client, key) =>
  rowsOf(
    `select to_jsonb(e) as row from clara.journal_entries e
      where e.client_id=$1 and e.flags ? $2 order by e.created_at, e.id`,
    [client, key],
  );

export const entryCountOf = async (client) =>
  Number((await rootQuery("select count(*)::int as n from clara.journal_entries where client_id=$1", [client])).rows[0].n);

export const groupsOfLine = (line) =>
  rowsOf(
    `select to_jsonb(m) as row from clara.bank_matches m
      join clara.bank_match_line_members lm on lm.match_id = m.id
     where lm.line_id=$1 order by m.created_at, m.id`,
    [line],
  );

export const eventsOf = async (client, type) =>
  (await rootQuery(
    "select seq, event_type, payload from clara.domain_events where client_id=$1 and event_type=$2 order by seq",
    [client, type],
  )).rows;

export const eventTypeRegistered = async (name) =>
  (await rootQuery("select 1 from clara.event_types where name=$1", [name])).rowCount > 0;

/** Tolerant search over clara.audit_log — the design names the row's CONTENT
 *  (the erased owner act) but not its exact columns, so this mirrors the house
 *  `to_jsonb(a)::text` idiom for a contract-silent shape. Ordered by the
 *  identity PK, deliberately: clara.audit_log's timestamp column is `at`, not
 *  `created_at`, and a probe has no business assuming EITHER name — `id` is a
 *  bigint identity column and orders the log exactly as time does. */
export const auditRowsMentioning = async (needle) => {
  const r = await rootQuery("select to_jsonb(a) as row from clara.audit_log a order by a.id desc limit 2000");
  return r.rows.map((x) => x.row).filter((row) => JSON.stringify(row).includes(needle));
};

export const advanceRowsOf = (client) =>
  rowsOf("select to_jsonb(a) as row from clara.staff_advances a where a.client_id=$1 order by a.created_at, a.id", [client]);
export const advanceApplicationRowsOf = (client) =>
  rowsOf(
    "select to_jsonb(a) as row from clara.staff_advance_applications a where a.client_id=$1 order by a.created_at, a.id",
    [client],
  );

/** The vendor-binding sighting counter the 0040 S5 carve-out withholds. */
export const ruleSightingCount = async (client) =>
  Number((await rootQuery("select count(*)::int as n from clara.rule_sightings where client_id=$1", [client])).rows[0].n);
export const codingRuleCount = async (client) =>
  Number((await rootQuery("select count(*)::int as n from clara.coding_rules where client_id=$1", [client])).rows[0].n);

export const fnExists = async (name) =>
  (await rootQuery(
    "select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='clara' and p.proname=$1 limit 1",
    [name])).rowCount > 0;
export const columnExists = async (table, column) =>
  (await rootQuery(
    "select 1 from information_schema.columns where table_schema='clara' and table_name=$1 and column_name=$2",
    [table, column])).rowCount > 0;
export const indexDefs = async (table) =>
  (await rootQuery("select indexname, indexdef from pg_indexes where schemaname='clara' and tablename=$1", [table])).rows;

// ---------------------------------------------------------------------------
// The world. Firm A carries alice (OWNER — the AF-2 floor), bob + grace
// (bookkeepers — the flip and the producer floor), hana (ADMIN — the advance
// enrolment floor) and carol (viewer), so every floor cell has a real persona
// AND eligible_checker_count(firm A) >= 2 (the high-stakes distinct-checker arm
// genuinely binds). Cached per process.
// ---------------------------------------------------------------------------

let _world = null;
export async function af2World() {
  if (!_world) _world = await wb.buildWaveBWorld();
  return _world;
}

const CHART = [
  [BANKCOA, "Maybank current (x42)", "asset", null],
  [AR1, "Trade Debtors (x42)", "asset", "receivable"],
  [AP1, "Trade Creditors (x42)", "liability", "payable"],
  [EXPN, "Prof Fees (x42)", "expense", null],
  [REVN, "Revenue (x42)", "income", null],
  [CHARGEX, "Bank Charges (x42)", "expense", null],
  [ADJX, "Sundry Adjustments (x42)", "expense", null],
  [ADVCODE, "Staff Advances (x42)", "asset", null],
  [CODEACC, "Utilities (x42)", "expense", null],
  // The x38 fixture toolkit codes its own birth legs to THESE two constants, so
  // reusing that toolkit means adopting its chart too (the x40 assembly lesson:
  // every counterparty birth died at CLR10 without them).
  [X38_EXPN, "Ordinary expense (x38 toolkit)", "expense", null],
  [X38_REVN, "Revenue (x38 toolkit)", "income", null],
];

/** A fresh firm-A client carrying the x42 chart + consent. */
export async function freshAf2Client(label) {
  const w = await af2World();
  const sub = w.users.alice;
  const client = await createClient(sub, { name: `x42_${label}_${uniq()}`, opKey: opk("x42cli") });
  for (const [code, name, type, klass] of CHART) {
    await upsertAccountClassed(sub, { client, code, name, type, accountClass: klass, opKey: opk("x42coa") });
  }
  await grantConsent(sub, { firm: w.firms.A, client }).catch(() => {});
  return client;
}

let _acctSeq = 0;
const _bankCoaNth = new Map();
/** A fresh, fully isolated bank account. Every C-c identity term is
 *  ACCOUNT-scoped and all-time, so each cell gets its own.
 *
 *  ONE ACTIVE BANK ACCOUNT PER CHART ACCOUNT (0037's `add_bank_account`
 *  partial-unique law: `where client_id=… and coa_account_code=… and active`
 *  → 'this chart account is already bound to another active bank account').
 *  A fresh ACCOUNT NUMBER is therefore not enough — the SECOND bank account a
 *  cell opens on one client needs its own asset code too, or the fixture dies
 *  at CLR10 before the cell under test ever runs. The FIRST account of a client
 *  keeps BANKCOA, because every hand-draft in this suite books its bank leg on
 *  that code; the spares (171..179-B42, minted on demand) carry the decoy and
 *  control lines, which are never booked. */
export async function freshBankAccount(sub, client) {
  _acctSeq += 1;
  const nth = _bankCoaNth.get(client) ?? 0;
  _bankCoaNth.set(client, nth + 1);
  let coa = BANKCOA;
  if (nth > 0) {
    assert.ok(nth <= 9, `x42 fixture: at most 9 spare bank COAs per client (asked for #${nth})`);
    coa = `${170 + nth}-B42`;
    await upsertAccountClassed(sub, {
      client, code: coa, name: `Maybank current ${nth + 1} (x42)`, type: "asset",
      accountClass: null, opKey: opk("x42coa"),
    });
  }
  const added = await addBankAccount(sub, {
    client, bankCode: "MBB", coaAccountCode: coa, accountNumber: `1042${_acctSeq}${uniq()}`,
  });
  return idOf(added, "bank_account_id", "id");
}

let _periodSeq = 0;
/** A statement period nobody else in this file uses: one calendar month, stepped
 *  TWO months per allocation so continuity's both-edge law stays out of scope. */
export function nextPeriod() {
  const d = new Date(Date.UTC(2035, _periodSeq * 2, 1));
  _periodSeq += 1;
  const start = d.toISOString().slice(0, 10);
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  return { start, end, mid: `${start.slice(0, 8)}15` };
}

/** A fresh account + a LIVE one-line statement on it, in its own period.
 *  `amountCents` is SIGNED: + = money into the bank, − = money out. */
export async function bankLine(sub, { client, amountCents, description = "x42 unexplained line" }) {
  const bankAccount = await freshBankAccount(sub, client);
  const p = nextPeriod();
  const stmt = await enterStatement(sub, {
    client, bankAccount, periodStart: p.start, periodEnd: p.end, opening: 0, keepPeriod: true,
    specs: [{ amountCents, entryDate: p.mid, description }],
  });
  return { bankAccount, period: p, statement: stmt.statementId, line: stmt.lines[0], lines: stmt.lines };
}

/** An open bank-line exception on `line`, returning its id (owner floor). */
export async function openException(sub, { client, line, kind = "bank_error", reason = "x42 unexplained line" }) {
  const receipt = await exceptLine(sub, { client, line, kind, reason });
  const id = idOf(receipt, "exception_id", "id");
  assert.ok(id, `except_bank_line names the exception (got ${JSON.stringify(receipt)})`);
  return id;
}

/** A counterparty-stamped control item (an AR invoice or an AP bill) with an
 *  EXPLICIT posting date — the settlement leg's allocation target. The x38
 *  counterpartyStampedItem twin, rebuilt here so the posting date is this lane's
 *  to choose (bank periods live in their own decade). */
export async function stampedItem(sub, {
  client, domain, cp, cpKind, cents, control, postingDate, checker = null, attestation = null,
}) {
  const proposal = { existing_id: cp };
  if (cpKind !== "vendor") proposal.kind = cpKind;
  const [debit, credit] = domain === "ar" ? [control, REVN] : [EXPN, control];
  const d = await draftEntryV3(sub, {
    client, resolution: await manualRes(sub, client), memo: `x42 ${domain} item`, postingDate,
    lines: [
      { account_code: debit, debit_cents: cents, credit_cents: 0, description: "dr" },
      { account_code: credit, debit_cents: 0, credit_cents: cents, description: "cr" },
    ],
    vendor: proposal, opKey: opk("x42cpitem"),
  });
  const args = { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("x42cpitema") };
  if (attestation != null) args.attestation = attestation;
  await approveEntry(checker ?? sub, args);
  const items = await openItemsOf(d.entry_id);
  assert.equal(items.length, 1, `a ${domain} control entry mints exactly ONE open item`);
  return { entry: d.entry_id, item: items[0].id };
}

/** A plain approved 2-leg entry with an explicit posting date. */
export async function plainAt(sub, { client, debit, credit, cents, postingDate, memo = "x42 entry", checker = null }) {
  const d = await draftEntryV3(sub, {
    client, resolution: await manualRes(sub, client), memo, postingDate,
    lines: [
      { account_code: debit, debit_cents: cents, credit_cents: 0, description: "dr" },
      { account_code: credit, debit_cents: 0, credit_cents: cents, description: "cr" },
    ],
    opKey: opk("x42gen"),
  });
  await approveEntry(checker ?? sub, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("x42gena") });
  return d.entry_id;
}

/** THE PARK, end to end — the fixture six cells share (design §4, WDB-G9): a
 *  high-stakes inbound line under an open exception, an invoice of exactly that
 *  amount for one customer, and the owner's declared resolution riding the
 *  WCA-R7 pending group. Returns everything the downstream cells need to drive
 *  the cancel, the flip and the reopen. */
export async function parkHighStakes({ client, owner, checker, note, amountCents = null, description = "x42 large deposit" }) {
  const cents = amountCents ?? HIGH_STAKES_CENTS;
  const cp = await birthCounterparty(owner, { client, name: `X42 PARK ${uniq()}`, kind: "customer" });
  const bl = await bankLine(owner, { client, amountCents: cents, description });
  const inv = await stampedItem(owner, {
    client, domain: "ar", cp, cpKind: "customer", cents, control: AR1,
    postingDate: bl.period.mid, checker,
  });
  const exception = await openException(owner, { client, line: bl.line.id, reason: `${description}: unidentified` });
  const receipt = await resolveAndBookBankLine(owner, {
    client, exception, disposition: "matched_booking", note,
    allocations: [{ item_id: inv.item, amount_cents: cents }],
    opKey: opk("x42-parkfx"),
  });
  const match = matchIdOf(receipt);
  assert.equal((await matchRow(match)).status, "pending",
    "parkHighStakes mandatory setup: at or above the threshold the group is the pending reservation");
  return { ...bl, cp, item: inv.item, exception, receipt, match, cents, note };
}

/** THE PRODUCER'S WORLD (design §5). A live statement whose lines all carry one
 *  recurring narration, and a SIGNED kind='coding' rule bred from them. The
 *  0040 breeding floor is three distinct sightings, so the statement carries
 *  four lines: one per cell that needs its own untouched line.
 *  `amountCents` is NEGATIVE (money out) to match the rule's 'debit' direction. */
export async function signedCodingRule({
  client, owner, proposer, lineCount = 4, amountCents = -42_000,
  tokens = ["tnb", "electricity"], narration = "TNB ELECTRICITY BILL",
  accountCode = CODEACC, counterparty = null,
}) {
  const bankAccount = await freshBankAccount(owner, client);
  const p = nextPeriod();
  const stmt = await enterStatement(owner, {
    client, bankAccount, periodStart: p.start, periodEnd: p.end, opening: 0, keepPeriod: true,
    specs: Array.from({ length: lineCount }, (_, i) => ({
      amountCents, entryDate: p.mid, description: `${narration} ${i + 1}`,
    })),
  });
  const pattern = { tokens, direction: amountCents < 0 ? "debit" : "credit" };
  const proposal = { account_code: accountCode, narration_template: narration };
  if (counterparty) proposal.counterparty_id = counterparty;
  const proposed = await proposeRule(proposer, { client, kind: "coding", pattern, proposal });
  const rule = idOf(proposed, "rule_id", "id");
  assert.ok(rule, `propose_bank_rule names the rule (got ${JSON.stringify(proposed)})`);
  await signRule(owner, { rule });
  assert.equal((await ruleRow(rule)).status, "signed", "mandatory setup: the coding rule is SIGNED");
  return { rule, pattern, proposal, bankAccount, period: p, statement: stmt.statementId, lines: stmt.lines, amountCents };
}

// ---------------------------------------------------------------------------
// Shared cell assertions (used by every x42 AF-2 test file).
// ---------------------------------------------------------------------------

/** The envelope law (ABI §A): the settle core's own envelope PLUS the two AF-2
 *  keys. `branch` and `resolution_exception_id` are this composite's own; the
 *  callee's keys are asserted for PRESENCE only, since their values are the
 *  callee's live law and not this design's to pin. */
export function assertEnvelope(receipt, { exception, branch }, label) {
  assert.ok(receipt && typeof receipt === "object",
    `${label}: the composite returns a jsonb envelope (got ${JSON.stringify(receipt)})`);
  assert.equal(receipt.resolution_exception_id, exception,
    `${label}: the envelope names the exception it resolved (ABI §A)`);
  assert.equal(receipt.branch, branch, `${label}: the envelope names its branch`);
  for (const k of ["match_id", "status", "entry_id"]) {
    assert.ok(k in receipt,
      `${label}: the envelope carries the settle core's '${k}' (got keys ${Object.keys(receipt).join(",")})`);
  }
  return receipt;
}

/** After a refusal that must precede EVERY state change: the exception is still
 *  open, the line still carries no group, and no entry was minted. */
export async function assertUntouched(client, { exception, line, entryCountBefore }, label) {
  const ex = await exceptionRow(exception);
  assert.equal(ex?.status, "open", `${label}: the exception is untouched (still open)`);
  assert.equal((await lineGroupStatusOf(line)).length, 0, `${label}: the line carries no pending/live group`);
  assert.equal(await entryCountOf(client), entryCountBefore, `${label}: no entry was minted`);
}

/** The pending/live memberships of a line (the 0038 readback, re-exported under
 *  a local name so this module can call it without shadowing the re-export). */
async function lineGroupStatusOf(line) {
  const r = await rootQuery(
    "select group_status from clara.bank_match_line_members where line_id=$1 and group_status in ('pending','live')",
    [line],
  );
  return r.rows.map((x) => x.group_status);
}

// ---------------------------------------------------------------------------
// Parked-declaration readbacks + the exceptions-surface probe (IA-3 / IA-6).
// ---------------------------------------------------------------------------

/** The declaration the park writes beside the group (ABI §D's bank_matches
 *  ALTER): { status, pendingResolution, resolutionExceptionId, row }. */
export async function parkedDeclarationOf(match) {
  const row = await matchRow(match);
  assert.ok(row, `bank match ${match} exists`);
  return {
    status: row.status,
    pendingResolution: row.pending_resolution ?? null,
    resolutionExceptionId: row.resolution_exception_id ?? null,
    row,
  };
}

/** Assert a parked declaration carries EXACTLY the five design §4 keys. */
export function assertDeclarationShape(decl, { exception, disposition, note, declaredBy }, label) {
  assert.ok(decl.pendingResolution, `${label}: the park writes pending_resolution beside the group`);
  const keys = Object.keys(decl.pendingResolution).sort();
  assert.deepEqual(
    keys, ["declared_at", "declared_by", "disposition", "exception_id", "note"],
    `${label}: pending_resolution = {exception_id, disposition, note, declared_by, declared_at} (got ${keys.join(",")})`,
  );
  assert.equal(decl.pendingResolution.exception_id, exception, `${label}: the declaration names its exception`);
  assert.equal(decl.pendingResolution.disposition, disposition, `${label}: the declaration carries the booking disposition`);
  assert.equal(decl.pendingResolution.note, note, `${label}: the declaration carries the owner's note verbatim`);
  assert.equal(decl.pendingResolution.declared_by, declaredBy, `${label}: the declaration carries the DECLARANT`);
  assert.ok(decl.pendingResolution.declared_at, `${label}: the declaration is timestamped`);
  assert.equal(decl.resolutionExceptionId, exception,
    `${label}: resolution_exception_id is stamped BESIDE the declaration, in the creating transaction`);
}

/** IA-3: find the parked exception's row in whichever LIVE read RPC renders it,
 *  and return { source, row } ({ source: null } when no surface carries it). */
export async function parkedBadgeFor(sub, { client, statement, exception }) {
  if (await fnExists("list_bank_line_exceptions")) {
    const r = await humanQuery(sub, "select clara.list_bank_line_exceptions(p_client => $1) as r", [client]);
    const payload = r.rows[0].r;
    const rows = Array.isArray(payload) ? payload : (payload?.rows ?? payload?.exceptions ?? []);
    const hit = rows.find((x) => x.exception_id === exception || x.id === exception);
    if (hit) return { source: "list_bank_line_exceptions", row: hit };
  }
  const recon = await getBankReconciliation(sub, { statement });
  const rows = recon?.snapshot?.exceptions ?? [];
  const hit = rows.find((x) => x.exception_id === exception);
  return hit ? { source: "get_bank_reconciliation.snapshot.exceptions", row: hit } : { source: null, row: null };
}

/** Does a rendered exception row BADGE the parked resolution? The design says
 *  "the exceptions table badges 'resolution parked'" but names no key, so any of
 *  a parked/parking flag, a pending_resolution echo, or a badge string counts —
 *  and the key that actually carried it is returned for the lane report. */
export function parkedBadgeKey(row) {
  if (!row) return null;
  for (const [k, v] of Object.entries(row)) {
    if (/park/i.test(k) && v != null && v !== false) return k;
    if (/^pending_resolution/.test(k) && v != null) return k;
    if (typeof v === "string" && /resolution parked/i.test(v)) return k;
    if (v && typeof v === "object" && /resolution parked/i.test(JSON.stringify(v))) return k;
  }
  return null;
}

// ---------------------------------------------------------------------------
// A one-session transaction driver: two laws are only reachable INSIDE one
// transaction — the same-transaction resolve-then-book the 0040 deferred belt
// demands, and the forged-newer-exception reopen block (except_bank_line carries
// an EAGER `line_already_matched` guard, so the natural ordering cannot build
// that state). `rootPrelude` runs on the SAME connection as the superuser BEFORE
// the session drops to the human role; it is used ONLY where no audited verb can
// reach the shape under test, and each call site says why (the x37/x40 forge
// precedent).
// ---------------------------------------------------------------------------

export async function inOneHumanTxn(sub, fn, { rootPrelude = null } = {}) {
  const c = await getPool().connect();
  try {
    await c.query("begin");
    if (rootPrelude) await rootPrelude((sql, params) => c.query(sql, params));
    await c.query(`set local role ${ROLES.authenticated}`);
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub, role: "authenticated" })]);
    const out = await fn((sql, params) => c.query(sql, params));
    await c.query("commit");
    return out;
  } catch (err) {
    await c.query("rollback").catch(() => {});
    throw err;
  } finally {
    await c.query("rollback").catch(() => {});
    await c.query("reset role").catch(() => {});
    await c.query("reset all").catch(() => {});
    c.release();
  }
}
