// The /bank agency lane — DOORS (governed writes): the agency-hold toggle
// and the identifier-promotion confirm door. See doors.ts's header for the
// door-vs-read-RPC distinction and the refusal-verbatim contract.
//
// EXACT signatures (migration 0121/0129):
//   set_bank_agency_hold(p_client, p_on, p_reason, p_op_key), bookkeeper
//     floor. Refuses reason_required.
//   confirm_bank_identifier_promotion(p_proposal, p_op_key), bookkeeper
//     floor. HUMAN-only, SS3 (migration 0129) — confirms a promoted payer
//     BANK ACCOUNT only. Typed refusals, rendered verbatim (never re-worded,
//     never guessed at locally):
//       - identifier_kind_out_of_scope — the proposal names an identifier
//         kind other than bank_account (this door confirms bank accounts
//         only).
//       - promotion_target_ambiguous — more than one candidate payer client
//         matches; the door cannot pick one on the human's behalf.
//       - promotion_target_unavailable — no matching client identity was
//         found; the proposal is left OPEN, never silently dropped.

import { callDoor, type CallDoorOptions } from "../doors";

const opKey = () => crypto.randomUUID();

/** The RPC's own receipt is `{client_id, on}` — NOT the bank_agency_holds
 *  row shape (no `reason`/`set_by`/`set_at`, and the flag key is `on`, not
 *  `on_hold`) — returned as an opaque report, never mapped through
 *  toBankAgencyHold. Hydrate-never-trust: the caller re-reads
 *  getBankAgencyHold afterward for the real row. */
export async function setBankAgencyHold(
  clientId: string, on: boolean, reason: string, opts: CallDoorOptions = {},
): Promise<Record<string, unknown>> {
  const out = await callDoor(
    "set_bank_agency_hold",
    { p_client: clientId, p_on: on, p_reason: reason, p_op_key: opKey() },
    opts,
  );
  return (out ?? {}) as Record<string, unknown>;
}

export async function confirmBankIdentifierPromotion(
  proposalId: string, opts: CallDoorOptions = {},
): Promise<void> {
  await callDoor("confirm_bank_identifier_promotion", { p_proposal: proposalId, p_op_key: opKey() }, opts);
}
