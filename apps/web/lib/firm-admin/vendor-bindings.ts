// T10 (port-wave plan §4 T10, §5's vendor-bindings row): the propose/sign/
// revoke ceremony over `clara.vendor_identity_bindings`, plus its two reads.
//
// GROUNDING (rig census, 2026-08-28 — instance-unique throwaway Postgres 17
// migrated to the live frontier `0140`; every signature read from
// `pg_get_functiondef` on that rig): all five doors originate at
// `0028_vendor_identity_binding.sql` and are LIVE-UNTOUCHED there — later
// files (0029/0030/0042/0044/0046) recut OTHER bodies that CALL into this
// machinery (`_coding_lane_core`, `_draft_entry_core`, …), never these five
// themselves (confirmed: `pg_get_functiondef` on the rig matches 0028's own
// text byte-for-byte for every one of the five).
//
//   - clara.propose_vendor_identity_binding(p_proposal jsonb, p_op_key text)
//     — bookkeeper+. `p_proposal` MUST be a JSON object with EXACTLY the two
//     keys `client_id`/`counterparty_id` — a third key, or either missing,
//     refuses `binding_proposal_malformed` (CLR36) before anything else runs
//     (0028:721-729). This module's own `proposeVendorIdentityBinding` builds
//     that literal shape and no other.
//   - clara.sign_vendor_identity_binding(p_binding uuid, p_op_key text) —
//     ADMIN+ (0028:809, `role_rank('admin')`) AND, as of the pre-beta
//     hardening batch (裁-18a, mohe-grill-rulings, 2026-08-28), a PERSON
//     gate too: the live body now reads `created_by` and refuses when the
//     signer is the same person who proposed the binding, unconditionally —
//     no relaxation for a single-admin firm. The refusal is typed CLR04 with
//     DETAIL reason "signer_is_proposer" and names both lawful ways out in
//     the OWNER'S OWN RULED WORDS (let Clara propose it, or add a second
//     admin — independent review, 2026-08-29). The UI never pre-hides the
//     Sign trigger on a client-side
//     role OR identity guess (team-lead security note): every viewer sees
//     it; a caller who clicks it gets the DB's own refusal, verbatim —
//     whether that is the rank floor or the signer≠proposer wall.
//   - clara.revoke_vendor_identity_binding(p_binding uuid, p_reason text,
//     p_op_key text) — bookkeeper+. `p_reason` is required
//     (`nullif(btrim(p_reason),'')` — 0028:910-911).
//   - clara.list_vendor_bindings(p_client uuid) — bookkeeper+ read, returns
//     `SETOF` rows (0028:960-1014).
//   - clara.get_vendor_binding(p_binding uuid) — bookkeeper+ read, returns one
//     jsonb envelope (0028:1016-1056). **NAMED SCOPE NOTE (rung 0):** the
//     port-wave plan (§4 T10) names this door `get_vendor_bindings` (plural);
//     the LIVE function is `get_vendor_binding`, singular — no plural
//     overload exists on the rig. This module calls the singular, live name.
//
// All five are EXECUTE-granted to `clara_authenticated` (rig census) — human
// lane only; none of the five appear on `clara_agent_ro`'s or
// `clara_runtime`'s reachable-function list.
//
// SCOPE NOTE: every one of these five doors is CLIENT-scoped
// (`vendor_identity_bindings.client_id`) — there is no firm-wide vendor-
// bindings read. The panel this module backs therefore carries its own
// client picker (reusing `lib/firm/reads.ts`'s `loadClientRegister`,
// unchanged) rather than assuming a cross-client listing the DB does not
// offer.

import { getRows } from "../read";
import { callDoor } from "../doors";
import type { SessionTokenAccessor } from "@/lib/session";

/** `clara.counterparties`'s own kind='vendor', not-merged, not-retired rows
 *  for one client (rig census: `clara_authenticated` holds a direct SELECT
 *  grant on this table, RLS-scoped to the caller's own firm) — a minimal
 *  picker read for the propose-binding dialog. This is not the counterparty
 *  hygiene panel (alias/rename/merge, T8's own train, port-wave plan §4 T8) —
 *  a plain filtered SELECT, the same shape every domain's own satellite read
 *  already takes independently (e.g. lib/registers/aging.ts). */
export type VendorCounterpartyRow = {
  id: string;
  name: string;
  registration_normalized: string | null;
};

export function loadVendorCounterparties(session: SessionTokenAccessor, clientId: string): Promise<VendorCounterpartyRow[]> {
  return getRows<VendorCounterpartyRow>("counterparties", {
    select: "id,name,registration_normalized",
    filters: { client_id: `eq.${clientId}`, kind: "eq.vendor", merged_into: "is.null", retired_at: "is.null" },
    order: "name.asc",
    session,
  });
}

export type VendorBindingStatus = "proposed" | "live" | "revoked" | "declined" | "expired" | string;

/** `clara.list_vendor_bindings(p_client)`'s SETOF row (0028:960-975), column
 *  order verbatim. */
export type VendorBindingRow = {
  binding_id: string;
  counterparty_id: string;
  counterparty_name: string;
  status: VendorBindingStatus;
  f1_vendor_name_norm: string;
  f2_invoice_prefix: string;
  registration_at_signing: string;
  signed_by: string | null;
  signed_at: string | null;
  expires_at: string;
  evidence_count: number;
  resolution_count: number;
  divergence_documents: number;
};

/** clara.list_vendor_bindings — bookkeeper+ read, client-scoped. Refuses
 *  CLR11 ("client not in your firm") for a client outside the caller's own
 *  firm. */
export function listVendorBindings(session: SessionTokenAccessor, clientId: string): Promise<VendorBindingRow[]> {
  return callDoor<VendorBindingRow[]>("list_vendor_bindings", { p_client: clientId }, { session });
}

/** `vendor_identity_bindings`'s own row shape (0028:53-82), as `get_vendor_binding`
 *  projects it via `to_jsonb(b)` — every column present, verbatim. */
export type VendorBindingFull = {
  id: string;
  firm_id: string;
  client_id: string;
  counterparty_id: string;
  status: VendorBindingStatus;
  f1_vendor_name_norm: string;
  f2_invoice_prefix: string;
  registration_at_signing: string;
  content_hash: string;
  created_by: string;
  created_at: string;
  signed_by: string | null;
  signed_at: string | null;
  revoked_by: string | null;
  revoked_at: string | null;
  revoke_reason: string | null;
  expires_at: string;
};

export type VendorBindingEvidenceItem = {
  entry_id: string;
  document_id: string;
  facts_extraction_id: string;
  ocr_extraction_id: string;
  posting_date: string;
};

export type VendorBindingResolutionItem = {
  resolution_id: string;
  document_id: string;
  entry_id: string;
  phase: "draft" | "revision" | "post" | string;
  outcome: "bound" | "divergence" | "refused" | string;
  facts_extraction_id: string;
  ocr_extraction_id: string;
  compared_to_resolution_id: string | null;
  refusal_reason: string | null;
  divergence: unknown;
  created_at: string;
};

export type VendorBindingDetail = {
  binding: VendorBindingFull;
  counterparty: { counterparty_id: string; counterparty_name: string } | null;
  evidence: VendorBindingEvidenceItem[];
  resolutions: VendorBindingResolutionItem[];
};

/** clara.get_vendor_binding — bookkeeper+ read. Refuses CLR11 ("binding not
 *  in your firm") for a binding outside the caller's own firm or a
 *  non-existent id. */
export function getVendorBinding(session: SessionTokenAccessor, bindingId: string): Promise<VendorBindingDetail> {
  return callDoor<VendorBindingDetail>("get_vendor_binding", { p_binding: bindingId }, { session });
}

/** clara.propose_vendor_identity_binding — the payload is EXACTLY
 *  `{client_id, counterparty_id}` (0028:721-729's closed-key check); never
 *  add a third key here even for a caller that has more context. */
export function proposeVendorIdentityBinding(
  session: SessionTokenAccessor,
  clientId: string,
  counterpartyId: string,
): Promise<unknown> {
  return callDoor(
    "propose_vendor_identity_binding",
    { p_proposal: { client_id: clientId, counterparty_id: counterpartyId }, p_op_key: crypto.randomUUID() },
    { session },
  );
}

/** clara.sign_vendor_identity_binding — admin+. */
export function signVendorIdentityBinding(session: SessionTokenAccessor, bindingId: string): Promise<unknown> {
  return callDoor("sign_vendor_identity_binding", { p_binding: bindingId, p_op_key: crypto.randomUUID() }, { session });
}

/** clara.revoke_vendor_identity_binding — bookkeeper+; `reason` required. */
export function revokeVendorIdentityBinding(session: SessionTokenAccessor, bindingId: string, reason: string): Promise<unknown> {
  return callDoor(
    "revoke_vendor_identity_binding",
    { p_binding: bindingId, p_reason: reason, p_op_key: crypto.randomUUID() },
    { session },
  );
}
