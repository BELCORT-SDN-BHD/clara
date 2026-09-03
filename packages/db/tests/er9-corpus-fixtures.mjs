// E-R9 SANDBOX ACCEPTANCE CORPUS — shared fixture helpers (NOT a test file: the name
// does not end in `.test.mjs`, so `node --test` ignores it).
//
// The battery this serves is the "Full synthetic battery" row of the E-R9 acceptance
// corpus map (docs/plan/active/wave-e-contract.md §E-R9), driven end-to-end as rig
// humans on a THROWAWAY rig at 0001→0086 before the first real close (BEE FY2025).
//
// THE FIXTURE YEAR IS BEE-SHAPED, DELIBERATELY: 2025-01-01 → 2025-12-31 on a client
// whose fy_end_month/day are UNSET (so fy_end_source lands on 'default_1231') and whose
// year nets to a LOSS (so the retained-earnings line is a DEBIT). Those are BEE CREATIVE
// SOLUTION's measured live shapes. A battery shaped like the real corpus proves the
// branch the real close will take, not a neighbouring one.
//
// CONTRACT-BLIND on 0056 / 0064 / 0085 / 0086: every claim in the test files is probed
// off the LIVE CATALOG or a behavioural run, never off the migration text.
//
// NEVER LIVE. These helpers drive writes; they run only against a disposable rig.

import { rootQuery, humanQuery } from "./wave-a-fixtures.mjs";

// --- the fixture year, BEE-shaped -------------------------------------------------
export const FY_START = "2025-01-01";
export const FY_END = "2025-12-31";
export const REV_CENTS = 80000;   // RM 800.00 income
export const EXP_CENTS = 200000;  // RM 2,000.00 expense
export const PL_NET = REV_CENTS - EXP_CENTS;   // -120000 cents: a LOSS, BEE's own direction

/** θ's dashboard read (0064). Wrapped here so every file calls it one way. */
export async function getClosePlan(sub, fy) {
  const r = await humanQuery(sub, "select clara.get_close_plan(p_fiscal_year_id => $1) as r", [fy]);
  return r.rows[0].r;
}

export async function entryRow(id) {
  return (await rootQuery("select * from clara.journal_entries where id=$1", [id])).rows[0] ?? null;
}

export async function lineRows(id) {
  return (await rootQuery(
    `select line_no, account_code, debit_cents, credit_cents, description
       from clara.journal_lines where entry_id=$1 order by line_no`, [id],
  )).rows;
}

export async function receiptRow(id) {
  return (await rootQuery("select * from clara.close_receipts where id=$1", [id])).rows[0] ?? null;
}

/** The LATEST result row per check on a run — the same "which row wins" rule
 *  finalize_close itself uses (seq desc), so the cells cannot disagree with the verb. */
export async function latestGates(run) {
  const r = await rootQuery(
    `select distinct on (check_key) check_key, drawer, state, measured, measured_digest
       from clara.close_gate_results where close_run_id=$1 order by check_key, seq desc`, [run],
  );
  return new Map(r.rows.map((x) => [x.check_key, x]));
}

/** A trial balance as a code -> (debit - credit) map, read independently of any receipt. */
export async function tbAt(client, asOf) {
  const r = await rootQuery(
    "select account_code, debit_cents, credit_cents from clara.trial_balance_as_of($1,$2::date)",
    [client, asOf],
  );
  const m = new Map();
  for (const x of r.rows) m.set(x.account_code, Number(x.debit_cents) - Number(x.credit_cents));
  return m;
}

export async function fyRow(id) {
  return (await rootQuery("select * from clara.fiscal_years where id=$1", [id])).rows[0] ?? null;
}

export async function fyStatus(id) {
  return (await fyRow(id))?.status ?? null;
}

export async function eligibleCheckers(firm) {
  return (await rootQuery("select clara.eligible_checker_count($1)::int as n", [firm])).rows[0].n;
}

export async function permitsFor(fy) {
  return (await rootQuery(
    "select * from clara.close_write_permits where fiscal_year_id=$1 order by created_at", [fy],
  )).rows;
}

export async function openItemCount(entry) {
  return (await rootQuery("select count(*)::int as n from clara.open_items where entry_id=$1", [entry])).rows[0].n;
}

export const detailOf = (err) => JSON.parse(err?.detail ?? "{}");
export const planCheck = (plan, key) => plan.checks.find((c) => c.check_key === key);

/** A calendar day as YYYY-MM-DD, read in the LOCAL zone.
 *
 *  NOT `toISOString().slice(0,10)`, and the difference is not cosmetic: node-postgres
 *  parses a Postgres DATE into a JS Date at LOCAL midnight, so under any zone east of
 *  UTC `toISOString()` shifts it back a day — 2025-12-31 reads as '2025-12-30'. This rig
 *  runs at Asia/Kuala_Lumpur (+8) while CI runs at UTC, so the naive form is green in CI
 *  and wrong on the machine the ceremony is actually driven from. Measured, not assumed:
 *  the first run of this battery failed exactly that way on two cells.
 *
 *  THIS TRICK IS `date`-ONLY — it does NOT extend to a `timestamptz`. The invariance is
 *  READ-SIDE ONLY: node-pg materializes a DATE at LOCAL midnight and isoDay() reads it
 *  back with the SAME local getters, so whichever OS timezone this test process happens
 *  to run under cancels out between those two steps (the write side plays no part — no
 *  JS Date is ever written into a `date` column in this corpus; every posting/fiscal-year
 *  date is a plain string, e.g. addDaysStr()'s return value or a literal, bound as
 *  `$n::date`). A `timestamptz` carries a real instant with no such read-side cancellation:
 *  piping one through isoDay() reads its calendar day in whatever OS timezone the TEST
 *  PROCESS happens to run under, which is Asia/Kuala_Lumpur on this rig's usual dev box
 *  and UTC on hosted CI — two different answers for the same instant whenever the two
 *  zones' calendar days actually disagree (16:00-24:00 UTC = 00:00-08:00 MYT the next
 *  day). Comparing a `timestamptz` column (created_at, approved_at, …) to
 *  clara._book_today() — `(statement_timestamp() at time zone 'Asia/Kuala_Lumpur')::date`
 *  — is done by casting `at time zone 'Asia/Kuala_Lumpur'` on the timestamptz INSIDE THE
 *  SAME SQL STATEMENT and comparing as text, never by routing it through a JS Date and
 *  this helper (measured, not assumed: this exact mistake reded hosted run 33655410932,
 *  fixed in #521 — see er9-reopen-recycle.test.mjs's R9.E2 cell for the corrected shape). */
export const isoDay = (d) => {
  if (d == null) return null;
  if (!(d instanceof Date)) return String(d).slice(0, 10);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
