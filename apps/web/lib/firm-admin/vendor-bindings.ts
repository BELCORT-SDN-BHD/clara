// T10 (port-wave plan §4 T10, §5's vendor-bindings row): the revoke ceremony
// over `clara.vendor_identity_bindings`, plus its two reads.
//
// GROUNDING (rig census, 2026-08-28 — instance-unique throwaway Postgres 17
// migrated to the live frontier `0140`; every signature read from
// `pg_get_functiondef` on that rig): all three doors below originate at
// `0028_vendor_identity_binding.sql` and are LIVE-UNTOUCHED there — later
// files (0029/0030/0042/0044/0046) recut OTHER bodies that CALL into this
// machinery (`_coding_lane_core`, `_draft_entry_core`, …), never these
// themselves (confirmed: `pg_get_functiondef` on the rig matches 0028's own
// text byte-for-byte for every one of them).
//
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
// All three are EXECUTE-granted to `clara_authenticated` (rig census) — human
// lane only; none appear on `clara_agent_ro`'s or `clara_runtime`'s
// reachable-function list.
//
// #921 [0273] (2026-09-20/21) REMOVED `proposeVendorIdentityBinding` and
// `signVendorIdentityBinding` from this module, along with the counterparty
// picker read (`loadVendorCounterparties`/`VendorCounterpartyRow`) that
// existed only to feed the now-retired Propose dialog. Migration 0273
// revoked clara_authenticated's EXECUTE on `propose_vendor_identity_binding`
// and `sign_vendor_identity_binding` for EVERY rank — D6 keeps only
// "historical receipts and in-flight legacy visibility". Keeping a wrapper
// whose door no human can ever reach is not a lesser version of this module;
// it is a call site `operation-census.test.mjs`'s `called_ungranted` sweep
// correctly refuses (proven: removing this pair is what turns that gate
// green again). `revoke_vendor_identity_binding` is UNCHANGED — 0273 never
// touched it. Full history of the propose/sign wrappers: git blame on this
// file before #921.
//
// SCOPE NOTE: every one of these doors is CLIENT-scoped
// (`vendor_identity_bindings.client_id`) — there is no firm-wide vendor-
// bindings read. The panel this module backs therefore carries its own
// client picker (reusing `lib/firm/reads.ts`'s `loadClientRegister`,
// unchanged) rather than assuming a cross-client listing the DB does not
// offer.

import { callDoor } from "../doors";
import type { SessionTokenAccessor } from "@/lib/session";

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

/** clara.revoke_vendor_identity_binding — bookkeeper+; `reason` required. */
export function revokeVendorIdentityBinding(session: SessionTokenAccessor, bindingId: string, reason: string): Promise<unknown> {
  return callDoor(
    "revoke_vendor_identity_binding",
    { p_binding: bindingId, p_reason: reason, p_op_key: crypto.randomUUID() },
    { session },
  );
}
