// Wave-C-b rig -- bank MATCHING + SETTLE-FROM-LINE shared fixture CORE (NOT a
// test file: the name does not end in `.test.mjs`, so `node --test` ignores
// it). Split out of x38-wave-c-b-match.test.mjs purely to keep each module
// under the repo's 500-line gate (the wave-a-helpers/wave-a-fixtures split
// precedent) -- every function here is STATELESS (no module-level `world` /
// `has38`, which stay in the test file's node:test lifecycle).
//
// CONTRACT-BLIND, same discipline as the test file that imports this: every
// verb is called by its PINNED name with NAMED args, straight from
// docs/plan/wave-c-b-bank-design.md (S4.1, S4.2, S4.3, S4.5, S4.6) +
// docs/plan/wave-c-b-bank-design-part2.md. A 42883 / param-name / reason-token
// divergence at integration is a FINDING for orchestrator adjudication, never
// a silent test edit. See the test file's header for the full list of names
// ASSUMED rather than pinned by the design text (add_bank_account's arg list,
// enter_bank_statement's two jsonb shapes, void_bank_statement's signature,
// the seeded bank_code, match_bank_line's p_lines/p_adjustments shapes).

import assert from "node:assert/strict";
import {
  rootQuery, humanQuery, namedCall, opk, idOf,
  freshResolution, draftEntryV3, approveEntry, counterpartyRows,
  seedCitedDocument, filedDocument, firmOf, ev, FIELD,
} from "./a21-helpers.mjs";

/** Per-session deadlock guard for every forced schedule (the s6-locks /
 *  x37.k precedent) -- a genuine deadlock surfaces as 40P01/57014 instead of
 *  hanging the run. */
export const GUARD = "set local statement_timeout = '5000ms'";

// ---------------------------------------------------------------------------
// Suite-scoped COA codes -- this file's OWN (grepped against x37's C37 codes
// and every other battery before choosing). Two bank accounts so the gross
// two-sided-entry shape (x38.h) and the cross-account congruence check
// (x38.c) have somewhere real to live.
// ---------------------------------------------------------------------------

export const BANKCOA1 = "170-C38"; // asset, non-control -- flagged is_bank_account by add_bank_account
export const BANKCOA2 = "171-C38"; // a SECOND bank account -- gross two-sided-entry + cross-account isolation
export const AR1 = "370-C38"; // receivable control
export const AP1 = "470-C38"; // payable control
export const EXPN = "570-C38"; // ordinary expense
export const REVN = "680-C38"; // revenue
export const LOANP = "471-C38"; // loan payable (liability, non-control) -- the drawdown's non-bank leg
export const CHARGEX = "571-C38"; // bank charge expense -- the receipt/payment-side charge slot
export const ADJX = "572-C38"; // an expense adjustment account -- match_bank_line's p_adjustments slot
export const ADJINC = "681-C38"; // an income adjustment account -- the AP-side mirror
export const BADADJ = "472-C38"; // a PAYABLE-class (control) account -- the adjustment_account_invalid red-team

export const CLR10 = "CLR10";
export const CLR11 = "CLR11";
export const CLR26 = "CLR26";

/** Structural readiness -- the migration number is claimed at MERGE time
 *  (contract law), so this gates on the CATALOG (table + fn), never a version
 *  string. Mirrors the s6Ready() / a21Has0016() precedent. */
export async function hasBankMatching() {
  const r = await rootQuery(
    `select
       (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
         where n.nspname='clara' and c.relname='bank_matches' limit 1) as tbl,
       (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
         where n.nspname='clara' and p.proname='match_bank_line' limit 1) as fn`,
  );
  return r.rows[0]?.tbl != null && r.rows[0]?.fn != null;
}

/** Run fn and return the raised error (or null) -- refusal cells all turn on
 *  "was this refused, and with exactly which code/reason". */
export async function caught(fn) {
  try {
    await fn();
    return null;
  } catch (e) {
    return e;
  }
}

// ---------------------------------------------------------------------------
// Verb wrappers -- NAMED args verbatim from the pinned interface (design S4.1,
// S4.3, S4.6). Optional trailing params are omitted unless the cell passes
// one, so a signature that defaults them differently still binds.
// ---------------------------------------------------------------------------

export async function addBankAccount(sub, { client, bankCode = "MBB", accountNumber, coaAccountCode, bankNameDisplay = null, proposalId = null, opKey = null }) {
  const specs = [{ name: "p_client" }, { name: "p_bank_code" }, { name: "p_account_number" }, { name: "p_coa_account_code" }];
  const vals = [client, bankCode, accountNumber, coaAccountCode];
  if (bankNameDisplay != null) { specs.push({ name: "p_bank_name_display" }); vals.push(bankNameDisplay); }
  if (proposalId != null) { specs.push({ name: "p_proposal_id" }); vals.push(proposalId); }
  specs.push({ name: "p_op_key" }); vals.push(opKey ?? opk("x38-bankacct"));
  const r = await humanQuery(sub, namedCall("add_bank_account", specs), vals);
  return r.rows[0].result;
}

export async function deactivateBankAccount(sub, { client, bankAccount, reason = "x38 deactivate", opKey = null }) {
  const r = await humanQuery(
    sub,
    namedCall("deactivate_bank_account", [{ name: "p_client" }, { name: "p_bank_account" }, { name: "p_reason" }, { name: "p_op_key" }]),
    [client, bankAccount, reason, opKey ?? opk("x38-deact")],
  );
  return r.rows[0].result;
}

/** Signed line specs (amount_cents: + into the account, - out) -> the full
 *  running-balance chain (design S3 "Statement identity") + printed totals.
 *  Every fixture in this file builds a chain that CLOSES on purpose -- these
 *  cells own matching, not the chain/corroboration battery (the sibling
 *  file's scope). */
export function chainLines(opening, specs) {
  let running = opening;
  let totalDebit = 0;
  let totalCredit = 0;
  const rows = specs.map((s, i) => {
    running += s.amountCents;
    if (s.amountCents >= 0) totalCredit += s.amountCents;
    else totalDebit += -s.amountCents;
    return {
      line_no: i + 1,
      entry_date: s.entryDate,
      value_date: s.valueDate ?? s.entryDate,
      description: s.description ?? `x38 line ${i + 1}`,
      amount_cents: s.amountCents,
      running_balance_cents: running,
    };
  });
  return { rows, closing: running, totalDebit, totalCredit };
}

let _statementSeq = 0;

/** enter_bank_statement(p_client, p_bank_account, p_document, p_header jsonb,
 *  p_lines jsonb, p_op_key) -- pinned verbatim by the design (S4.3). Builds a
 *  fresh filed+cited document as the statement's provenance binding (S4.2:
 *  "provenance still binds the filed PDF") and returns
 *  { receipt, statementId, lines } where `lines` are the REAL persisted rows
 *  (read back by id, since the composite mints their ids). */
/** Month allocator: every statement gets its OWN calendar month per account (the live
 *  partial unique admits one live statement per (account, period_end) and continuity binds
 *  ADJACENT months only, so distinct non-adjacent months keep cells independent). The
 *  caller's periodStart/periodEnd are IGNORED unless keepPeriod:true (the two
 *  period-semantics cells read the returned period instead of assuming June). */
const _monthByAccount = new Map();
function _nextPeriod(bankAccount) {
  const n = (_monthByAccount.get(bankAccount) ?? 0); _monthByAccount.set(bankAccount, n + 2);
  // step TWO months: never adjacent, so continuity's both-edge law stays out of scope here
  const d = new Date(Date.UTC(2026, 5 + n, 1)); // 2026-06 + n months
  const start = d.toISOString().slice(0, 10);
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  return { start, end };
}
export async function enterStatement(sub, {
  client, bankAccount, periodStart, periodEnd, statementDate = null,
  opening = 0, specs, opKey = null, keepPeriod = false,
}) {
  if (!keepPeriod) {
    const p = _nextPeriod(bankAccount);
    periodStart = p.start; periodEnd = p.end;
    // remap each spec's entry date into the allocated month, preserving day-of-month
    specs = specs.map((sp) => {
      const day = Math.min(28, Number(String(sp.entryDate ?? "2026-06-15").slice(8, 10)) || 15);
      const iso = `${periodStart.slice(0, 8)}${String(day).padStart(2, "0")}`;
      return { ...sp, entryDate: iso, valueDate: sp.valueDate ? iso : sp.valueDate };
    });
  }
  statementDate = statementDate ?? periodEnd;
  const firm = await firmOf(client);
  const doc = await filedDocument(sub, { firm, client, kind: "bank_statement" });
  const { rows, closing, totalDebit, totalCredit } = chainLines(opening, specs);
  // The DB verifies the named account AGAINST the header (institution + digits-only
  // number) -- keying April's statement into May's account is the mis-filing that
  // binding exists to stop -- so the header must carry the account's own identity.
  const acct = await rootQuery(
    "select bank_code, account_number from clara.bank_accounts where id=$1", [bankAccount]);
  const header = {
    institution_code: acct.rows[0].bank_code, account_number: acct.rows[0].account_number,
    period_start: periodStart, period_end: periodEnd, statement_date: statementDate,
    opening_cents: opening, closing_cents: closing,
    total_debit_cents: totalDebit, total_credit_cents: totalCredit,
  };
  _statementSeq += 1;
  const r = await humanQuery(
    sub,
    namedCall("enter_bank_statement", [
      { name: "p_client" }, { name: "p_bank_account" }, { name: "p_document" },
      { name: "p_header", cast: "jsonb" }, { name: "p_lines", cast: "jsonb" }, { name: "p_op_key" },
    ]),
    [client, bankAccount, doc.documentId, JSON.stringify(header), JSON.stringify(rows), opKey ?? opk(`x38-stmt${_statementSeq}`)],
  );
  const receipt = r.rows[0].result;
  const statementId = idOf(receipt, "statement_id", "id");
  const persisted = await rootQuery(
    "select id, line_no, amount_cents, entry_date, running_balance_cents from clara.bank_statement_lines where statement_id=$1 order by line_no",
    [statementId],
  );
  return { receipt, statementId, documentId: doc.documentId, lines: persisted.rows,
    periodStart, periodEnd };
}

export async function voidBankStatement(sub, { client, statement, reason = "x38 void", opKey = null }) {
  const r = await humanQuery(
    sub,
    namedCall("void_bank_statement", [{ name: "p_client" }, { name: "p_statement" }, { name: "p_reason" }, { name: "p_op_key" }]),
    [client, statement, reason, opKey ?? opk("x38-voidstmt")],
  );
  return r.rows[0].result;
}

export async function matchBankLine(sub, { client, lines, entries, adjustments = null, ackPeriodExceptions = false, opKey = null }) {
  const specs = [
    { name: "p_client" }, { name: "p_lines", cast: "jsonb" }, { name: "p_entries", cast: "jsonb" },
    { name: "p_adjustments", cast: "jsonb" }, { name: "p_ack_period_exceptions" }, { name: "p_op_key" },
  ];
  const vals = [
    client, JSON.stringify(lines), JSON.stringify(entries),
    adjustments == null ? null : JSON.stringify(adjustments), ackPeriodExceptions,
    opKey ?? opk("x38-match"),
  ];
  const r = await humanQuery(sub, namedCall("match_bank_line", specs), vals);
  return r.rows[0].result;
}

export async function unmatchBankMatch(sub, { client, match, reason = "x38 unmatch", opKey = null }) {
  const r = await humanQuery(
    sub,
    namedCall("unmatch_bank_match", [{ name: "p_client" }, { name: "p_match" }, { name: "p_reason" }, { name: "p_op_key" }]),
    [client, match, reason, opKey ?? opk("x38-unmatch")],
  );
  return r.rows[0].result;
}

export async function settleFromBankLine(sub, {
  client, line, counterparty, allocations = [], memo = "x38 settle",
  postingDate = null, chargeCents = 0, chargeAccount = null,
  adjustments = null, attestation = null, controlAccount = null, opKey = null,
}) {
  const specs = [
    { name: "p_client" }, { name: "p_line" }, { name: "p_counterparty" },
    { name: "p_allocations", cast: "jsonb" }, { name: "p_memo" },
  ];
  const vals = [client, line, counterparty, JSON.stringify(allocations), memo];
  if (postingDate != null) { specs.push({ name: "p_posting_date", cast: "date" }); vals.push(postingDate); }
  if (chargeCents) { specs.push({ name: "p_charge_cents", cast: "bigint" }); vals.push(chargeCents); }
  if (chargeAccount != null) { specs.push({ name: "p_charge_account" }); vals.push(chargeAccount); }
  if (adjustments != null) { specs.push({ name: "p_adjustments", cast: "jsonb" }); vals.push(JSON.stringify(adjustments)); }
  if (attestation != null) { specs.push({ name: "p_attestation" }); vals.push(attestation); }
  if (controlAccount != null) { specs.push({ name: "p_control_account" }); vals.push(controlAccount); }
  specs.push({ name: "p_op_key" }); vals.push(opKey ?? opk("x38-settle"));
  const r = await humanQuery(sub, namedCall("settle_from_bank_line", specs), vals);
  return r.rows[0].result;
}

export async function completePendingMatch(sub, { client, match, opKey = null }) {
  const r = await humanQuery(
    sub,
    namedCall("complete_pending_match", [{ name: "p_client" }, { name: "p_match" }, { name: "p_op_key" }]),
    [client, match, opKey ?? opk("x38-complete")],
  );
  return r.rows[0].result;
}

export const matchIdOf = (receipt) => idOf(receipt, "match_id", "id");

// ---------------------------------------------------------------------------
// Readbacks -- root (superuser bypasses RLS): fixtures + assertions only.
// ---------------------------------------------------------------------------

export async function matchRow(match) {
  const r = await rootQuery("select to_jsonb(m) as row from clara.bank_matches m where m.id=$1", [match]);
  return r.rows[0]?.row ?? null;
}
export async function lineMemberRows(match) {
  const r = await rootQuery("select to_jsonb(x) as row from clara.bank_match_line_members x where x.match_id=$1 order by x.line_id", [match]);
  return r.rows.map((x) => x.row);
}
export async function entryMemberRows(match) {
  const r = await rootQuery("select to_jsonb(x) as row from clara.bank_match_entry_members x where x.match_id=$1 order by x.entry_id, x.matched_cents", [match]);
  return r.rows.map((x) => x.row);
}
export async function lineGroupStatus(line) {
  const r = await rootQuery(
    "select group_status from clara.bank_match_line_members where line_id=$1 and group_status in ('pending','live')",
    [line],
  );
  return r.rows.map((x) => x.group_status);
}
export async function lineSumOf(lineIds) {
  if (!lineIds.length) return 0;
  const r = await rootQuery("select coalesce(sum(amount_cents),0)::bigint as n from clara.bank_statement_lines where id = any($1)", [lineIds]);
  return Number(r.rows[0].n);
}
/** THE MATCH IDENTITY (design S3): sum(member lines) = sum(member entries),
 *  re-derived from the tables, never trusted from a receipt. */
export async function assertGroupTies(match, label) {
  const lm = await lineMemberRows(match);
  const em = await entryMemberRows(match);
  const lineSum = await lineSumOf(lm.map((x) => x.line_id));
  const entrySum = em.reduce((s, x) => s + Number(x.matched_cents), 0);
  assert.equal(entrySum, lineSum, `${label}: THE MATCH IDENTITY -- sum(entries.matched_cents)=${entrySum} must equal sum(lines.amount_cents)=${lineSum}`);
}
/** Tolerant search over bank_match_audit -- the design names the row's
 *  CONTENT (member set + amounts + actor + reason) but not its exact columns
 *  beyond append-only + house types; this mirrors the notificationsMatching()
 *  tolerant idiom for a contract-silent shape. */
export async function auditRowsMentioning(needle) {
  const r = await rootQuery("select to_jsonb(x) as row from clara.bank_match_audit x order by x.created_at desc limit 1000");
  return r.rows.map((x) => x.row).filter((row) => JSON.stringify(row).includes(needle));
}
export async function bankEventTypes(client) {
  const r = await rootQuery("select distinct event_type from clara.domain_events where client_id=$1 and event_type like 'bank.%'", [client]);
  return r.rows.map((x) => x.event_type).sort();
}
export async function bankEventPayloads(client, sinceSeq = 0) {
  const r = await rootQuery("select seq, event_type, payload from clara.domain_events where client_id=$1 and event_type like 'bank.%' and seq > $2 order by seq", [client, sinceSeq]);
  return r.rows;
}
export async function maxBankSeq(client) {
  const r = await rootQuery("select coalesce(max(seq),0)::bigint as n from clara.domain_events where client_id=$1 and event_type like 'bank.%'", [client]);
  return Number(r.rows[0].n);
}
export async function openItemsOf(entry) {
  const r = await rootQuery("select to_jsonb(i) as row from clara.open_items i where i.entry_id=$1 order by i.domain, i.id", [entry]);
  return r.rows.map((x) => x.row);
}
export async function outstandingOf(item) {
  const r = await rootQuery(
    `select (i.amount_cents + coalesce(
        (select sum(a.amount_cents) from clara.open_item_allocations a where a.item_id=i.id),0))::bigint as n
       from clara.open_items i where i.id=$1`,
    [item],
  );
  return Number(r.rows[0].n);
}

// ---------------------------------------------------------------------------
// Fixtures -- every synthetic object built THROUGH audited writers.
// ---------------------------------------------------------------------------

export const manualRes = (sub, client) => freshResolution(sub, client, { subjectKind: "manual", subjectId: null });

/** Birth a counterparty of `kind` via draft+approve of a tiny non-control
 *  entry (counterparties are born at APPROVE). Mirrors the x37 idiom. */
export async function birthCounterparty(sub, { client, name, kind = "vendor" }) {
  const proposal = { new: { name } };
  if (kind === "customer") proposal.kind = "customer";
  const d = await draftEntryV3(sub, {
    client, resolution: await manualRes(sub, client), memo: `x38 birth ${name}`,
    lines: [
      { account_code: EXPN, debit_cents: 100, credit_cents: 0, description: "birth-dr" },
      { account_code: REVN, debit_cents: 0, credit_cents: 100, description: "birth-cr" },
    ],
    vendor: proposal, opKey: opk("x38-birth"),
  });
  await approveEntry(sub, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("x38-birtha") });
  const want = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const cp = (await counterpartyRows(client)).find((c) => (c.name_normalized ?? "") === want);
  assert.ok(cp?.id, `the ${kind} counterparty ${name} was born (mandatory setup)`);
  return cp.id;
}

/** A plain approved 2-leg entry: Dr `debit` / Cr `credit`, both = cents.
 *  `checker`/`attestation` clear the maker-checker floor at/above threshold. */
export async function plainEntry(sub, {
  client, debit, credit, cents, memo = "x38 generic", postingDate = "2026-06-15",
  checker = null, attestation = null,
}) {
  const d = await draftEntryV3(sub, {
    client, resolution: await manualRes(sub, client), memo, postingDate,
    lines: [
      { account_code: debit, debit_cents: cents, credit_cents: 0, description: "dr" },
      { account_code: credit, debit_cents: 0, credit_cents: cents, description: "cr" },
    ],
    opKey: opk("x38-gen"),
  });
  const args = { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("x38-gena") };
  if (attestation != null) args.attestation = attestation;
  await approveEntry(checker ?? sub, args);
  return d.entry_id;
}

/** A document-BOUND approved entry (for the wrong-client-correction fixture,
 *  x38.n's second verb). */
export async function docBoundEntry(sub, { client, debit, credit, cents, memo = "x38 doc entry" }) {
  const cited = await seedCitedDocument(sub, { firm: await firmOf(client), client });
  const d = await draftEntryV3(sub, {
    client, resolution: await freshResolution(sub, client, { subjectKind: "document", subjectId: cited.documentId }),
    document: cited.documentId, sha256: cited.sha256, memo,
    lines: [
      { account_code: debit, debit_cents: cents, credit_cents: 0, description: "dr" },
      { account_code: credit, debit_cents: 0, credit_cents: cents, description: "cr" },
    ],
    evidence: [ev(cited.regionId, cited.quote, FIELD.total)],
    opKey: opk("x38-docgen"),
  });
  await approveEntry(sub, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("x38-docgena") });
  return { entry: d.entry_id, documentId: cited.documentId };
}

// counterparty stamping on the control leg rides through _resolve_counterparty's
// existing_id lookup -- but plainEntry above never names a vendor proposal, so it
// births a FRESH generic-default counterparty each call. That is fine for x38's
// purposes: every settle_from_bank_line cell BINDS its own counterparty explicitly
// (p_counterparty), and this fixture exists only to give match_bank_line /
// settle_from_bank_line something real to allocate against, not to exercise C-a's
// counterparty law (x37's scope, not this file's).
export async function counterpartyStampedItem(sub, { client, domain, cp, cpKind, cents, control, checker = null, attestation = null }) {
  const proposal = { existing_id: cp };
  if (cpKind !== "vendor") proposal.kind = cpKind;
  const [debit, credit] = domain === "ar" ? [control, REVN] : [EXPN, control];
  const d = await draftEntryV3(sub, {
    client, resolution: await manualRes(sub, client), memo: `x38 ${domain} item`,
    lines: [
      { account_code: debit, debit_cents: cents, credit_cents: 0, description: "dr" },
      { account_code: credit, debit_cents: 0, credit_cents: cents, description: "cr" },
    ],
    vendor: proposal, opKey: opk("x38-cpitem"),
  });
  const args = { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("x38-cpitema") };
  if (attestation != null) args.attestation = attestation;
  await approveEntry(checker ?? sub, args);
  const items = await openItemsOf(d.entry_id);
  assert.equal(items.length, 1, `a ${domain} control entry mints exactly ONE item`);
  return { entry: d.entry_id, item: items[0].id };
}
