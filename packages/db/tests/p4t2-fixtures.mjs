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

/** Marks `firm` as the estate's operator (root; superuser bypasses RLS) -- uq_firms_one_operator
 *  (0133:274) allows at most one, ever, estate-wide.
 *
 *  UNSCOPED clear, deliberately -- g1-wake-engine.test.mjs is (measured: the only OTHER file in
 *  this suite that ever sets is_operator=true) and its own before() hook clears ONLY its own
 *  `g1op_%`-prefixed firm, with no after() cleanup at all -- so on a real full-suite run where
 *  g1 runs first (alphabetically), it leaves ITS firm holding the flag, which a prefix-scoped
 *  clear here would never touch, colliding on uq_firms_one_operator regardless of run order.
 *  g1's own comment names its narrow scope as protection for a SHARED/PERSISTENT rig ("never
 *  silently strip a genuinely-set BELCORT operator flag") -- this rig is a throwaway instance-
 *  unique one (constraint 14), so that concern does not apply here; clearing unconditionally is
 *  the only shape that coexists with whatever a prior file in the SAME run left behind. */
export async function markOperator(firm) {
  await rootQuery("update clara.firms set is_operator = false where is_operator");
  await rootQuery("update clara.firms set is_operator = true where id = $1", [firm]);
}

/** Clears is_operator estate-wide (root) -- call from an after() hook in any file that calls
 *  markOperator, so a LATER file in the same run inherits a clean slate rather than this
 *  tranche's own leftover flag (the gap this file's own header note found in g1-wake-engine). */
export async function clearOperator() {
  await rootQuery("update clara.firms set is_operator = false where is_operator");
}

/** Read a registration request row directly (root) for assertions the masked view would not
 *  carry, or to bypass the view's own predicate entirely. */
export async function rawRegistrationRequest(id) {
  const r = await rootQuery("select * from clara.firm_registration_requests where id = $1", [id]);
  return r.rows[0] ?? null;
}
