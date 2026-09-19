// #660 — fixtures for the CLIENT FINANCIAL PACK battery (0232_client_financial_pack.sql).
//
// NOT a test file (the name does not end in `.test.mjs`, so `node --test` ignores it).
//
// EVERYTHING THAT CAN GO THROUGH A REAL DOOR DOES. Clients, chart accounts, drafts, approvals and
// reversals are driven by the audited human verbs under least-privileged personas; the three
// #660 doors are always called by NAMED arguments, so a divergence in a parameter name is a real
// finding rather than a silent positional mismatch.
//
// AND EVERY SHORTCUT IS LABELLED. Four conditions this battery must build have NO writer in the
// estate at all, and each one is created by explicitly named root DML rather than pretended away:
//
//   · `coa_accounts.is_bank_account` — minted ONLY by `add_bank_account` /
//     `remap_bank_account_coa` (the two-writer census is stated as a measurement at 0121:4721-4722),
//     both of which want a whole bank-account registration this battery is not about.
//   · `coa_accounts.is_active = false` — there is no retire door (the same gap
//     `work-journal-fixtures.mjs:196-201` states for its own retired account).
//   · `journal_entries.close_receipt_id` — born ONLY inside `finalize_close` (0056:3010-3024),
//     which needs a whole fiscal-year close. The unmarked-history detector must be tested against
//     the exact shape a PRE-0120 close left behind (`close_receipt_id` set, `closing_transfer`
//     still false, 0120:518-521) — a shape no live writer can produce any more, which is precisely
//     why it has to be built by hand.
//   · a `bank_statements` row with a DIFFERENT closing balance — the statement lane's own writers
//     want an ingest pipeline; this battery only needs the row to exist so it can prove the pack
//     ignores it.
//
// The approved-entry shortcut runs under `session_replication_role = replica` inside a root
// transaction, because `clara.journal_entries` is append-only by trigger (`t_je_immutable`) and
// the two facts above are unreachable through any lane that respects it.

import { randomUUID } from "node:crypto";
import {
  ROLES, asRoot, rootQuery, humanQuery, roleQuery, namedCall, opk, sha,
  upsertAccount, createClient, freshResolution, getPool,
} from "./rig-fixtures.mjs";
import { draftEntryV3, approveEntry } from "./s6-helpers.mjs";

/** The chart this battery plants on every client it makes. Codes are arbitrary and carry NO
 *  meaning: nothing in 0232 reads a code or a name, which is the point (0121:4749). */
export const CHART = {
  bank: "1010",
  bank2: "1020",
  petty: "1090",
  ar: "1100",
  sales: "4000",
  rent: "5000",
  retained: "3000",
};

/** A client of `sub`'s firm carrying this battery's chart, with the two bank-registry markers
 *  planted. Returns `{ client, accounts }` where `accounts` maps code -> account_id. */
export async function financialClient(sub, tag = "p660") {
  const client = await createClient(sub, {
    name: `p660_${tag}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    opKey: opk("p660-cli"),
  });
  await upsertAccount(sub, { client, code: CHART.bank, name: "Maybank Current", type: "asset", opKey: opk("p660-coa") });
  await upsertAccount(sub, { client, code: CHART.bank2, name: "CIMB Savings", type: "asset", opKey: opk("p660-coa") });
  await upsertAccount(sub, { client, code: CHART.petty, name: "Petty Cash Tin", type: "asset", opKey: opk("p660-coa") });
  await upsertAccount(sub, { client, code: CHART.ar, name: "Trade Debtors", type: "asset", opKey: opk("p660-coa") });
  await upsertAccount(sub, { client, code: CHART.sales, name: "Sales", type: "income", opKey: opk("p660-coa") });
  await upsertAccount(sub, { client, code: CHART.rent, name: "Office Rent", type: "expense", opKey: opk("p660-coa") });
  await upsertAccount(sub, { client, code: CHART.retained, name: "Retained Earnings", type: "equity", opKey: opk("p660-coa") });
  // LABELLED FIXTURE DML (1): the bank-registry marker. See this module's header.
  await rootQuery(
    "update clara.coa_accounts set is_bank_account = true where client_id = $1 and account_code = any($2)",
    [client, [CHART.bank, CHART.bank2]]);
  return { client, accounts: await accountIds(client) };
}

/** code -> account_id for a client, read as root (a lookup, never an assertion). */
export async function accountIds(client) {
  const r = await rootQuery(
    "select account_code, account_id from clara.coa_accounts where client_id = $1", [client]);
  return Object.fromEntries(r.rows.map((x) => [x.account_code, x.account_id]));
}

/** LABELLED FIXTURE DML (2b): make a client's opening position a GENUINE deferred carry-down by
 *  withdrawing the `first_year_zero_opening` answer the rig's legacy-activation bridge plants
 *  beside it (`rig-fixtures.mjs:88-96`). There is no door that un-answers a committed plan item,
 *  and the estate's own precedence (`components/registers/opening-position-gate.tsx:85, :95-97` —
 *  the first-year-zero face returns BEFORE the deferred branch is ever reached) means a plan
 *  carrying BOTH rows has a KNOWN opening. This is therefore the only way to build the shape where
 *  the opening is genuinely absent, which is the shape `opening_carry_down_deferred` is about. */
export async function makeCarryDownOnly(client) {
  await asRoot(async (c) => {
    await c.query("begin");
    try {
      await c.query("set local session_replication_role = replica");
      await c.query(
        // `ck_onboarding_plan_items_answer` couples the state to the answer, so both move together
        // — an un-answered item that kept its answer would be a shape the schema forbids and the
        // fixture would be building a condition that cannot exist.
        "update clara.onboarding_plan_items set state = 'pending', answer = null, answered_by = null, "
        + "answered_at = null where item_key = 'first_year_zero_opening' "
        + "and plan_id in (select id from clara.onboarding_plans where client_id = $1)", [client]);
      await c.query("commit");
    } catch (e) { await c.query("rollback"); throw e; }
  });
}

/**
 * LABELLED FIXTURE DML (2c): link a REOPEN MIRROR to the close entry it reverses.
 *
 * `clara.reopen_fiscal_year` is the only writer that mints this pair, and it wants a whole
 * finalised fiscal year to reopen. The entry immutability trigger admits only a COMPLETE
 * reversal-linkage pair (CLR08 on a half-written one), so both sides move in one transaction under
 * `session_replication_role = replica` — `clara.journal_entries` is append-only.
 *
 * The SHAPE is 0120:797-814's: the mirror swaps debit and credit, points `reversal_of` at the
 * close, and carries the original's `closing_transfer` THROUGH rather than asserting a fresh true.
 */
export async function linkReversal(originalId, mirrorId) {
  await asRoot(async (c) => {
    await c.query("begin");
    try {
      await c.query("set local session_replication_role = replica");
      await c.query("update clara.journal_entries set reversal_of = $1 where id = $2",
        [originalId, mirrorId]);
      await c.query("update clara.journal_entries set reversed_by = $1 where id = $2",
        [mirrorId, originalId]);
      await c.query("commit");
    } catch (e) { await c.query("rollback"); throw e; }
  });
}

/** LABELLED FIXTURE DML (2): retire an account. There is no retire door. */
export async function deactivate(client, code) {
  await rootQuery(
    "update clara.coa_accounts set is_active = false where client_id = $1 and account_code = $2",
    [client, code]);
}

/**
 * Post an APPROVED entry through the real draft + approve doors.
 * `flags` reaches `draft_entry`'s own `p_flags` (`is_year_end` / `closing_transfer` are settable
 * there and nowhere else once an entry is approved — 0016:45-49).
 * `lines` is `[{ code, debit?, credit? }]` in exact minor units.
 */
export async function postEntry(maker, checker, { client, date, memo = "p660", lines, flags = null }) {
  const resolution = await freshResolution(maker, client);
  const draft = await draftEntryV3(maker, {
    client,
    resolution,
    postingDate: date,
    memo,
    lines: lines.map((l) => ({
      account_code: l.code,
      debit_cents: l.debit ?? 0,
      credit_cents: l.credit ?? 0,
    })),
    flags,
    opKey: opk("p660-draft"),
  });
  await approveEntry(checker, {
    entry: draft.entry_id,
    expectedRevision: draft.revision_token,
    opKey: opk("p660-appr"),
  });
  return draft.entry_id;
}

/**
 * LABELLED FIXTURE DML (3): stamp an approved entry with a `close_receipt_id` while leaving
 * `closing_transfer` false — the exact shape a PRE-0120 close left behind (0120:518-521), which
 * no live writer can produce any more. Mints the `close_receipts` row it points at, and runs
 * under `session_replication_role = replica` because `clara.journal_entries` is append-only.
 * Returns the receipt id.
 */
export async function stampPreFixCloseReceipt(entryId, { client, firm, actor }) {
  const receipt = randomUUID();
  await asRoot(async (c) => {
    await c.query("begin");
    try {
      await c.query("set local session_replication_role = replica");
      // Every column is stated by name rather than derived from the catalog: a receipt row
      // assembled by guessing from column names is a fixture that can silently mean something
      // else after a schema change. These values exist only so the deferred FK on
      // journal_entries.close_receipt_id resolves; nothing in 0232 reads any of them.
      await c.query(
        `insert into clara.close_receipts(
           id, firm_id, client_id, fiscal_year_id, close_run_id, kind, closed_by, pl_net_cents,
           retained_earnings_account, closing_tb_digest, gate_digest, books_watermark,
           dataset_sha256, snapshot)
         values ($1,$2,$3,$4,$5,'close',$6,0,'3000',$7,$8,'0:0:',$9,'{}'::jsonb)`,
        [receipt, firm, client, randomUUID(), randomUUID(), actor,
          sha("p660-tb"), sha("p660-gate"), sha("p660-dataset")]);
      await c.query("update clara.journal_entries set close_receipt_id = $1 where id = $2",
        [receipt, entryId]);
      await c.query("commit");
    } catch (e) {
      await c.query("rollback");
      throw e;
    }
  });
  return receipt;
}

/** LABELLED FIXTURE DML (4): a bank statement carrying a DIFFERENT closing balance, so
 *  `p660.pack.statement_balance_never_cash` has something real to be indifferent to. Returns
 *  `true` when the row could be planted, `false` when the statement lane's shape has moved (the
 *  cell then asserts the weaker but still honest "the pack does not read it"). */
export async function plantBankStatement({ client, firm, closingCents }) {
  try {
    await rootQuery(
      `insert into clara.bank_statements(
         firm_id, client_id, bank_account_id, document_id, source_doc_sha256, filing_id,
         facts_hash, period_start, period_end, statement_date, opening_cents, closing_cents,
         line_count, status, ingest_mode)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [firm, client, randomUUID(), randomUUID(), sha("p660-stmt"), randomUUID(),
        sha("p660-facts"), "2026-01-01", "2026-01-31", "2026-01-31", 0, closingCents,
        1, "active", "manual"]);
    return true;
  } catch {
    return false;
  }
}

// ===========================================================================================
// The three doors. NAMED arguments only.
// ===========================================================================================

export async function pack(sub, client, { asOf = null, month = null } = {}) {
  const r = await humanQuery(sub, namedCall("get_client_financial_pack", [
    { name: "p_client", cast: "uuid" },
    { name: "p_as_of", cast: "date" },
    { name: "p_month", cast: "date" },
  ]), [client, asOf, month]);
  return r.rows[0].result;
}

export async function propose(sub, client) {
  const r = await humanQuery(sub,
    namedCall("propose_client_cash_accounts", [{ name: "p_client", cast: "uuid" }]), [client]);
  return r.rows[0].result;
}

export async function publish(sub, client, members, { effectiveFrom = null, opKey = null } = {}) {
  const r = await humanQuery(sub, namedCall("publish_client_cash_account_set", [
    { name: "p_client", cast: "uuid" },
    { name: "p_members", cast: "jsonb" },
    { name: "p_effective_from", cast: "date" },
    { name: "p_op_key", cast: "text" },
  ]), [client, JSON.stringify(members), effectiveFrom, opKey ?? opk("p660-pub")]);
  return r.rows[0].result;
}

/** `[{account_id, member_reason}]` from a code list. */
export const members = (accounts, ...specs) =>
  specs.map(([code, reason]) => ({ account_id: accounts[code], member_reason: reason }));

/** The `detail.reason` a #660 refusal carries, or null. Every refusal in 0232 names one. */
export function reasonOf(err) {
  try {
    return JSON.parse(err.detail ?? "{}").reason ?? null;
  } catch {
    return null;
  }
}

/** The member sum of `clara.trial_balance_as_of` at one as-of — the ORACLE
 *  `p660.pack.matches_trial_balance` compares the pack's single-pass cash arm against. Read as
 *  the human persona, through the granted door, never as root. */
export async function trialBalanceCash(sub, client, asOf, codes) {
  const r = await humanQuery(sub,
    `select coalesce(sum(t.debit_cents - t.credit_cents), 0)::bigint as v
       from clara.trial_balance_as_of($1::uuid, $2::date) t
      where t.account_code = any($3::text[])`,
    [client, asOf, codes]);
  return BigInt(r.rows[0].v);
}

// ============================================================================================
// TWO REAL SESSIONS, AND THE INTERLEAVE PROVED RATHER THAN SLEPT THROUGH.
//
// `publish_client_cash_account_set` takes the current published version `for update`, so the
// only honest way to test what the LOSER of a concurrent publish is told is two dedicated
// backends with two open transactions. Copied locally from `binding-proposal-pr-1-helpers.mjs:
// 22-67` / `checkout-convergence-fixtures.mjs:364-384` rather than cross-imported, exactly as
// those two copied it from `legal-acceptance.test.mjs` — the house idiom for this helper is a
// local copy per lane, so a lane's probe never moves when another lane edits its own.
// ============================================================================================

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Poll (bounded) until backend `pid` is observably WAITING on a lock held by `blockerPid`, and
 *  return the `wait_event` that proves WHICH lock it waits on. Never a sleep: a sleep proves
 *  nothing about whether the block actually happened. */
export async function waitBlockedByOrThrow(pid, blockerPid, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await rootQuery(
      `select wait_event_type as wet, wait_event as we, pg_blocking_pids(pid) as blockers
         from pg_stat_activity where pid = $1`, [pid]);
    const row = r.rows[0];
    if (row && row.wet === "Lock" && (row.blockers || []).map(Number).includes(Number(blockerPid))) {
      return row.we;
    }
    await sleep(25);
  }
  throw new Error(
    `waitBlockedByOrThrow: backend ${pid} never observably blocked on ${blockerPid} within ${timeoutMs}ms`);
}

/** Two dedicated pooled clients, released cleanly whatever happens. `rollback` -> `reset role`
 *  -> `reset all` on each, in that order: RESET ALL does NOT reset the role, and a SET ROLEd
 *  connection returned to the pool poisons the next rootQuery. */
export async function twoSessions(fn) {
  const c1 = await getPool().connect();
  const c2 = await getPool().connect();
  try {
    return await fn(c1, c2);
  } finally {
    for (const c of [c1, c2]) {
      try { await c.query("rollback"); } catch { /* not in a txn */ }
      try { await c.query("reset role"); } catch { /* already reset */ }
      try { await c.query("reset all"); } catch { /* already reset */ }
      c.release();
    }
  }
}

/** Put a pooled client into a human (`clara_authenticated` + jwt) session and return its backend
 *  pid. `false` on set_config so the claim survives the explicit BEGIN the race needs. */
export async function asHumanSession(client, sub) {
  await client.query(`set role ${ROLES.authenticated}`);
  await client.query("select set_config('request.jwt.claims', $1, false)",
    [JSON.stringify({ sub, role: "authenticated" })]);
  return Number((await client.query("select pg_backend_pid() as pid")).rows[0].pid);
}

/** The publish door, called by NAMED arguments on a caller-supplied session (the two-session
 *  race needs the call to run on a backend whose transaction the test controls; `publish()`
 *  above borrows an anonymous pooled client and commits it). */
export function publishOn(client, { client: clientId, members: memberList, effectiveFrom = null, opKey = null }) {
  return client.query(namedCall("publish_client_cash_account_set", [
    { name: "p_client", cast: "uuid" },
    { name: "p_members", cast: "jsonb" },
    { name: "p_effective_from", cast: "date" },
    { name: "p_op_key", cast: "text" },
  ]), [clientId, JSON.stringify(memberList), effectiveFrom, opKey ?? opk("p660-pub")]);
}

export { ROLES, rootQuery, humanQuery, roleQuery, opk, upsertAccount, getPool };
