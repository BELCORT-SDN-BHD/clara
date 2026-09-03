// FS-4 C-5 — THE COHORT GATE, AND WHY IT IS NOT `.catch(() => false)`.
//
// Every db-backed file in this cohort skips cleanly when 0160/0161 are not applied, so the
// pre-integration run says "absent" instead of calling a missing cohort green. The obvious
// spelling of that is `probe().then(ok).catch(() => false)` — and it is FAIL-OPEN in the one
// case that matters most.
//
// MEASURED, THE HARD WAY, 2026-09-02. This lane's rig container died mid-session (WSL
// idle-termination, exit 255). The next focused run reported **44 tests, 21 pass, 0 fail, 23
// skipped** and EXIT 0. Twenty-three cells covering a money surface and a rate wall reported
// success-shaped nothing, because a `connect ECONNREFUSED` is caught by the same `catch` that
// means "the migration is not applied yet". A green run that proves nothing is worse than a red
// one: the red gets fixed.
//
// SO THE TWO CASES ARE SEPARATED. A probe that ANSWERS and says the cohort is absent is a skip.
// A probe that cannot answer at all — the connection refused, the database gone, the role
// missing — THROWS, and the file fails loudly at import. Absence is not evidence; a probe that
// never ran is not an absence.

import { rootQuery } from "./relay-fixtures.mjs";

/** SQLSTATEs and Node error codes that mean "the database did not answer", never "the cohort is
 *  not applied". A connection-class failure has no SQLSTATE at all, which is exactly why this
 *  cannot branch on SQLSTATE alone. */
const UNREACHABLE = new Set(["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "ECONNRESET", "EHOSTUNREACH", "57P03", "3D000", "28P01"]);

function isUnreachable(err) {
  const code = err?.code ?? err?.errno;
  if (typeof code === "string" && UNREACHABLE.has(code)) return true;
  // A pool that never connected surfaces as a plain Error with the address in the message.
  return /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|Connection terminated|server closed the connection/i.test(String(err?.message ?? ""));
}

/**
 * Probe for a cohort and return the `skip` value node:test wants: `false` to run, or a REASON
 * STRING to skip.
 *
 * @param {string} label what is being probed, for both the skip reason and the throw
 * @param {string} sql a query returning one row with a boolean `ok`
 * @param {unknown[]} [params]
 * @returns {Promise<false|string>}
 */
export async function cohortGate(label, sql, params = []) {
  let rows;
  try {
    rows = await rootQuery(sql, params);
  } catch (err) {
    if (isUnreachable(err)) {
      throw new Error(
        `c5 cohort gate: the database did not answer while probing ${label} (${err?.message ?? err}). ` +
          `This is NOT a reason to skip — a run that reports 0 failures because the rig is down proves nothing. ` +
          `Start the rig and re-run.`,
      );
    }
    throw err;
  }
  return rows.rows[0]?.ok === true ? false : `${label} is not applied on this database`;
}
