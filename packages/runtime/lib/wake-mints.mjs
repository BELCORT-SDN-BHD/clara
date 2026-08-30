// The CLOCKED lanes' credential mints — Gate G1's two follow-up workflow bodies (bankAgent_v1,
// closePrep_v1) and nothing else.
//
// WHY ITS OWN MODULE RATHER THAN TWO MORE EXPORTS IN pools.mjs. pools.mjs is already 554 lines,
// past the repo's own 500-line module ceiling (the same budget that split reconciler-sst /
// -lint / -fa / -adjustments / -render out of reconciler.mjs, leader.mjs:25-29). Adding here
// keeps that file from growing further; everything below still reaches the SAME `withRuntime`
// pool pools.mjs owns, imported, never re-created.
//
// THE SECRET LAW, restated because this file exists only to hand out secrets. A plaintext wake
// credential is minted, used and DISCARDED inside ONE step execution attempt. It must never
// cross a WDK step boundary — not as a step input, not as a step return, not as workflow state
// — because step IO is durably persisted to Postgres and into every backup
// (docs/plan/completed/slice4-durable-runtime-contract.md:270 states this as a LAW, and
// wake-engine.mjs's own module header, MUST F, is why the engine hands the dispatched workflow
// only `(workflowExport, taskId)` and never a credential).

import { withRuntime, READ_CREDENTIAL_TTL } from "./pools.mjs";

/**
 * Mint the CLOCKED BANK lane's own credential kind (`bank_agent`).
 *
 * A DISTINCT export rather than a `wakeKind` parameter on pools.mjs's `mintWakeCredential`,
 * deliberately: the bank arm of the DB gate (0133:745-752, F-A3 Annex D) requires a
 * firm-congruent ACTIVE client AND FORBIDS `on_behalf_of` — on the clocked lane there is no
 * directing human, so that NULL is STRUCTURAL, never inferred (law 68). A shared entry point
 * taking both would turn a structural fact into a caller's choice, which is exactly the shape
 * law 68 exists to refuse.
 *
 * NO TASK BINDING, and that is measured, not assumed: grep across
 * packages/db/migrations/0121_f_a3_pr1b_agent_limb.sql finds zero references to
 * `clara._wake_task_id()` or `wake_credentials.agent_task_id` in any of the thirteen
 * `bank_agent` wrapper bodies. The task-bound sibling below is close_prep's alone.
 *
 * @param {string} firmId
 * @param {string} clientId  mandatory — a firm-congruent ACTIVE client (CLR10 otherwise)
 * @param {string} [ttl]
 * @returns {Promise<{credentialId: string, secret: string}>}
 */
export function mintBankAgentCredential(firmId, clientId, ttl = READ_CREDENTIAL_TTL) {
  return withRuntime(async (c) => {
    const r = await c.query(
      "select credential_id, secret from clara.mint_wake_credential($1, $2, null, $3::interval, $4)",
      ["bank_agent", firmId, ttl, clientId],
    );
    return { credentialId: r.rows[0].credential_id, secret: r.rows[0].secret };
  });
}

/**
 * Mint a TASK-BOUND wake credential through `clara.mint_wake_credential_for_task` — the ONLY
 * minter in the estate that records `wake_credentials.agent_task_id` (0138:812-857, F-A4's own
 * F14/D-13 binding).
 *
 * THIS IS NOT INTERCHANGEABLE WITH THE PLAIN MINT, and the failure mode is silent-looking:
 * every one of 0138's twelve `close_prep` wrappers reads `clara._wake_task_id()` off the same
 * session secret `wake_context()` reads, and turns a NULL into CLR03 `wake_task_unbound` — "no
 * binding, no act" (0138:802-806). A `close_prep` credential minted through
 * `mint_wake_credential`'s door is therefore refused by EVERY verb it could possibly call, even
 * though the mint itself succeeds (0133:753-761 admits the kind).
 *
 * The DB sibling admits `close_prep` and NOTHING ELSE (0138:819-822 — "this sibling is not a
 * second door onto the legacy kinds"), so `wakeKind` is passed through rather than hardcoded
 * only to keep the refusal the DB's to make, never this module's to guess.
 *
 * @param {string} wakeKind      'close_prep' — the only kind the DB sibling admits
 * @param {string} firmId
 * @param {string} clientId      mandatory — a firm-congruent ACTIVE client
 * @param {string} agentTaskId   mandatory, congruence-checked on (firm, client, kind) by the DB
 * @param {string} [ttl]
 * @returns {Promise<{credentialId: string, secret: string}>}
 */
export function mintWakeCredentialForTask(wakeKind, firmId, clientId, agentTaskId, ttl = READ_CREDENTIAL_TTL) {
  return withRuntime(async (c) => {
    const r = await c.query(
      "select credential_id, secret from clara.mint_wake_credential_for_task($1, $2, $3, $4, $5::interval)",
      [wakeKind, firmId, clientId, agentTaskId, ttl],
    );
    return { credentialId: r.rows[0].credential_id, secret: r.rows[0].secret };
  });
}
