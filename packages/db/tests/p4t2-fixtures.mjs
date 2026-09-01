// P4 tranche-2 (registration/operator/counterparty_aliases) rig fixtures -- NOT a test file
// (does not end in `.test.mjs`). Wraps the three new doors + the operator-seeding helper this
// tranche's battery needs, mirroring p4t1-fixtures.mjs's own conventions.

import { humanQuery, namedCall, rootQuery } from "./rig-helpers.mjs";

export async function requestFirmRegistration(sub, { firmName, note = null, opKey }) {
  const r = await humanQuery(
    sub,
    namedCall("request_firm_registration", [{ name: "p_firm_name" }, { name: "p_note" }, { name: "p_op_key" }]),
    [firmName, note, opKey],
  );
  return r.rows[0].result;
}

export async function approveFirmRegistration(sub, { request, opKey }) {
  const r = await humanQuery(
    sub,
    namedCall("approve_firm_registration", [{ name: "p_request" }, { name: "p_op_key" }]),
    [request, opKey],
  );
  return r.rows[0].result;
}

export async function rejectFirmRegistration(sub, { request, reason, opKey }) {
  const r = await humanQuery(
    sub,
    namedCall("reject_firm_registration", [{ name: "p_request" }, { name: "p_reason" }, { name: "p_op_key" }]),
    [request, reason, opKey],
  );
  return r.rows[0].result;
}

// Firms THIS module has itself marked operator, across every call in the current process --
// tracked so markOperator/clearOperator below can release exactly what they claimed and nothing
// else. Module-level and unexported: p4t2-approval.test.mjs and p4t2-reads.test.mjs each import
// these two functions but never touch the list directly.
const MARKED_OPERATOR_FIRMS = [];

/** Marks `firm` as the estate's operator (root; superuser bypasses RLS) -- uq_firms_one_operator
 *  (0133:274) allows at most one, ever, estate-wide.
 *
 *  SCOPED clear (opus review round on PR #501, finding F1 -- reworked from an earlier UNSCOPED
 *  `where is_operator` this file shipped with): the prior version cleared WHATEVER firm
 *  currently held the flag, reasoning that packages/db/tests/g1-wake-engine.test.mjs was the
 *  only other writer in "this suite" and left no after()-cleanup of its own to collide with --
 *  #501 closes exactly that gap (g1-wake-engine.test.mjs's after() now releases its own OP
 *  fixture), which makes the old justification's premise obsolete, but the deeper problem an
 *  unscoped clear here always had was PACKAGE-scoped thinking about an ESTATE-WIDE resource:
 *  CI's db-estate job runs `pnpm -r --if-present test`, so packages/db and packages/runtime run
 *  CONCURRENTLY against ONE shared postgres, and packages/runtime/tests/g1-wake-bodies.test.mjs's
 *  G1B-C1 cell ALSO temporarily claims this same singleton mid-critical-section -- an unscoped
 *  clear fired from this module while G1B-C1 holds it would strip G1B-C1's OWN flag between its
 *  claim and its very next (operator-gated) statement, which would then be refused, not read as
 *  the collision it actually is. Only firms THIS module has itself marked (MARKED_OPERATOR_FIRMS
 *  above) are ever cleared -- an outside holder, in this package or the other, is never touched,
 *  mirroring g1-wake-engine.test.mjs's own OP-scoped release and G1B-C1's own poll-and-wait. */
export async function markOperator(firm) {
  if (MARKED_OPERATOR_FIRMS.length) {
    await rootQuery("update clara.firms set is_operator = false where id = any($1) and is_operator", [MARKED_OPERATOR_FIRMS]);
  }
  await rootQuery("update clara.firms set is_operator = true where id = $1", [firm]);
  MARKED_OPERATOR_FIRMS.push(firm);
}

/** Releases every firm THIS module has marked (root) -- call from an after() hook in any file
 *  that calls markOperator, so a LATER file in the same run inherits a clean slate rather than
 *  this tranche's own leftover flag. Scoped to MARKED_OPERATOR_FIRMS (see markOperator's own
 *  header) -- never an unscoped `where is_operator`, for the same cross-package reason. */
export async function clearOperator() {
  if (MARKED_OPERATOR_FIRMS.length) {
    await rootQuery("update clara.firms set is_operator = false where id = any($1) and is_operator", [MARKED_OPERATOR_FIRMS]);
    MARKED_OPERATOR_FIRMS.length = 0;
  }
}

/** Read a registration request row directly (root) for assertions the masked view would not
 *  carry, or to bypass the view's own predicate entirely. */
export async function rawRegistrationRequest(id) {
  const r = await rootQuery("select * from clara.firm_registration_requests where id = $1", [id]);
  return r.rows[0] ?? null;
}
