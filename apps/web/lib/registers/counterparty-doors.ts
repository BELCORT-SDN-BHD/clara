// T8 governed writes — callDoor, refusal verbatim, never retried (doors.ts's header).
// Every signature grounded the same way as ./counterparty.ts's header describes;
// return shapes below transcribe each function's own `clara._finish_op(...,
// jsonb_build_object(...))` tail exactly, not a guess.
//
// clara.create_counterparty(p_client, p_kind, p_name, p_registration_no, p_tin,
//   p_op_key) — packages/db/migrations/0021_counterparty_human_lane.sql:42. bookkeeper+.
//   CREATE-OR-GET: `created: false` on the recovered-existing-row branch is NOT a
//   failure (that file's own header). Refuses CLR10 "counterparty collides with a
//   retired or merged party for this client and kind" only when the create-or-get
//   recovery itself finds no live row at the slot.
// clara.set_counterparty_terms(p_counterparty, p_days, p_op_key) — 0040:3864.
//   bookkeeper+. Refuses CLR10 terms_out_of_range (days must be 1-365), CLR08 on a
//   merged/retired target.
// clara.add_counterparty_alias(p_client, p_counterparty, p_alias, p_origin, p_op_key,
//   p_basis, p_source_document, p_source_extraction, p_source_region, p_source_field_path)
//   — 0011_daily_loop.sql:1706, RECUT 0215 §7.1 (#647): the five leading parameters and their
//   NAMES are unchanged, five DEFAULTED provenance parameters are added, and there is still
//   exactly ONE body of this name (0215's tail asserts it). bookkeeper+. `p_origin` is one of
//   'former_name' | 'trade_name' | 'human' | 'extracted'; 'agent_proposed' is refused here
//   (CLR10) because D11 gives Clara no identity write verb in this build. `recorded_via` is
//   stamped 'human_ui' by the door from its OWN lane and is never sent from here. Refuses
//   CLR23 target_retired / alias_collision / source_not_this_client, and CLR10
//   source_incomplete (an 'extracted' alias owes both a document and an extraction) /
//   source_not_extracted (only an extracted alias may carry an extraction, region or field pin).
// clara.retire_counterparty_alias(p_client, p_alias, p_op_key) — 0011:1750.
//   bookkeeper+. Wired since #647: clara.counterparty_aliases_visible and
//   clara.get_counterparty_identity both project the alias id a retirement needs.
// clara.set_counterparty_identifiers(p_client, p_counterparty, p_registration_no, p_tin,
//   p_op_key) — 0174:785, RECUT 0215 §7.3 (#647) at the SAME signature and the same
//   _finish_op envelope; each real change now also appends one identity revision. ADMIN floor,
//   not bookkeeper. Refuses CLR11 not found · CLR23 target_retired / registration_collision /
//   unregistered_name_collision · CLR10 registration_unusable (a registration that normalises
//   to nothing).
// clara.rename_counterparty(p_client, p_counterparty, p_new_name, p_op_key) —
//   0011:1774. bookkeeper+. Refuses CLR23 target_retired / alias_collision (the new
//   name collides with an existing identity or alias).
// clara.merge_counterparties(p_client, p_survivor, p_merged, p_reason, p_op_key) —
//   0011:1820, RECUT 0015:2242 (adds an autopost-rule retire/reissue side effect on
//   merge — same arity, same grant, PRESERVE regions intact per that file's own
//   comment). bookkeeper+. Refuses CLR10 "a counterparty cannot merge into itself"
//   (self-merge) · CLR11 not found · CLR23 cross_client / target_retired /
//   cross_kind_merge / registration_conflict / open_draft_blocks. Destructive and
//   irreversible from the UI's point of view — there is no un-merge door.
// clara.apply_open_items(p_client, p_applications, p_reason, p_op_key) — 0037:3225.
//   bookkeeper+. `p_applications` is a JSON array of
//   {source_item_id, target_item_id, amount_cents} — source carries the NEGATIVE
//   (credit) outstanding, target the POSITIVE (claim) outstanding, both move toward
//   zero by `amount_cents`. Refuses CLR10 applications_malformed /
//   application_self_reference / application_target_not_open /
//   allocation_exceeds_outstanding / cross_domain_application (CLR10) /
//   cross_counterparty_application (CLR10) / unwind_lineage_mismatch /
//   allocation_target_reversed.
// clara.unallocate_group(p_client, p_group, p_reason, p_op_key) — 0037:3141.
//   bookkeeper+. Whole-group, never row-by-row (that file's own header: "undoing
//   half of it would leave a state no human ever intended"). Refuses CLR11 group not
//   found · CLR10 not_unallocatable (an unallocation cannot itself be unallocated) /
//   already_unallocated.

import { callDoor } from "../doors";
import type { SessionTokenAccessor } from "@/lib/session";
import type { CounterpartyKind } from "./counterparty";

const opKey = (): string => crypto.randomUUID();
type Opts = { session?: SessionTokenAccessor; signal?: AbortSignal };

export type CreateCounterpartyResult = { counterparty_id: string; created: boolean };

export function createCounterparty(
  clientId: string,
  kind: CounterpartyKind,
  name: string,
  registrationNo: string | null,
  tin: string | null,
  opts: Opts = {},
): Promise<CreateCounterpartyResult> {
  return callDoor<CreateCounterpartyResult>(
    "create_counterparty",
    {
      p_client: clientId, p_kind: kind, p_name: name,
      p_registration_no: registrationNo, p_tin: tin, p_op_key: opKey(),
    },
    opts,
  );
}

export type SetCounterpartyTermsResult = { counterparty_id: string; payment_terms_days: number };

export function setCounterpartyTerms(
  counterpartyId: string,
  days: number,
  opts: Opts = {},
): Promise<SetCounterpartyTermsResult> {
  return callDoor<SetCounterpartyTermsResult>(
    "set_counterparty_terms",
    { p_counterparty: counterpartyId, p_days: days, p_op_key: opKey() },
    opts,
  );
}

/** The four origins the HUMAN door admits. `agent_proposed` exists in the database's CHECK and
 *  is deliberately absent here: no human may label their own statement as the agent's. */
export type CounterpartyAliasOrigin = "former_name" | "trade_name" | "human" | "extracted";
export type AddCounterpartyAliasResult = { alias_id: string; counterparty_id: string };

/** The provenance an alias may carry (#647 AC1). All optional: a human who simply knows the
 *  trade name states it and pins nothing, and that absence is RECORDED (`recorded_via` is still
 *  stamped 'human_ui' by the door) rather than invented. A source document must be FILED TO THIS
 *  CLIENT — the door refuses CLR23 `source_not_this_client` otherwise, because the database's
 *  own foreign keys are firm-congruent only and #646 moves filings between clients. */
export type CounterpartyAliasProvenance = {
  /** The human's own words. Sent as typed; the door trims and stores null for blank. */
  basis?: string | null;
  sourceDocumentId?: string | null;
  sourceExtractionId?: string | null;
  sourceRegionId?: string | null;
  sourceFieldPath?: string | null;
};

export function addCounterpartyAlias(
  clientId: string,
  counterpartyId: string,
  alias: string,
  origin: CounterpartyAliasOrigin,
  provenance: CounterpartyAliasProvenance = {},
  opts: Opts = {},
): Promise<AddCounterpartyAliasResult> {
  return callDoor<AddCounterpartyAliasResult>(
    "add_counterparty_alias",
    {
      p_client: clientId, p_counterparty: counterpartyId, p_alias: alias, p_origin: origin,
      p_op_key: opKey(),
      p_basis: provenance.basis ?? null,
      p_source_document: provenance.sourceDocumentId ?? null,
      p_source_extraction: provenance.sourceExtractionId ?? null,
      p_source_region: provenance.sourceRegionId ?? null,
      p_source_field_path: provenance.sourceFieldPath ?? null,
    },
    opts,
  );
}

export type SetCounterpartyIdentifiersResult = {
  counterparty_id: string;
  registration_no: string | null;
  registration_normalized: string | null;
  tin: string | null;
};

/** clara.set_counterparty_identifiers — H-09's missing face, ADMIN floor. Both values are
 *  REPLACED, not merged: sending null for one CLEARS it, which is why the surface must show the
 *  current pair and submit both. Every real change appends one identity revision, so a
 *  correction is recoverable instead of being overwritten in place (#647 AC5). */
export function setCounterpartyIdentifiers(
  clientId: string,
  counterpartyId: string,
  registrationNo: string | null,
  tin: string | null,
  opts: Opts = {},
): Promise<SetCounterpartyIdentifiersResult> {
  return callDoor<SetCounterpartyIdentifiersResult>(
    "set_counterparty_identifiers",
    {
      p_client: clientId, p_counterparty: counterpartyId,
      p_registration_no: registrationNo, p_tin: tin, p_op_key: opKey(),
    },
    opts,
  );
}

export type RetireCounterpartyAliasResult = { alias_id: string; status: "retired" | string };

export function retireCounterpartyAlias(
  clientId: string,
  aliasId: string,
  opts: Opts = {},
): Promise<RetireCounterpartyAliasResult> {
  return callDoor<RetireCounterpartyAliasResult>(
    "retire_counterparty_alias",
    { p_client: clientId, p_alias: aliasId, p_op_key: opKey() },
    opts,
  );
}

export type RenameCounterpartyResult = { counterparty_id: string; name: string };

export function renameCounterparty(
  clientId: string,
  counterpartyId: string,
  newName: string,
  opts: Opts = {},
): Promise<RenameCounterpartyResult> {
  return callDoor<RenameCounterpartyResult>(
    "rename_counterparty",
    { p_client: clientId, p_counterparty: counterpartyId, p_new_name: newName, p_op_key: opKey() },
    opts,
  );
}

export type MergeCounterpartiesResult = {
  survivor_id: string;
  merged_id: string;
  reissued_rule_id: string | null;
  reissued_autopost_rule_id: string | null;
};

/** THE ONE governed call the merge dialog's confirm may perform — never composed
 *  with any other door (team-lead's brief, §5's note on `merge_counterparties`: "the
 *  UI computes nothing about what the merge will do"). Irreversible: there is no
 *  un-merge door, only the alias `merge_counterparties` itself records on the
 *  survivor naming the merged party's former name. */
export function mergeCounterparties(
  clientId: string,
  survivorId: string,
  mergedId: string,
  reason: string,
  opts: Opts = {},
): Promise<MergeCounterpartiesResult> {
  return callDoor<MergeCounterpartiesResult>(
    "merge_counterparties",
    { p_client: clientId, p_survivor: survivorId, p_merged: mergedId, p_reason: reason, p_op_key: opKey() },
    opts,
  );
}

export type OpenItemApplicationInput = {
  sourceItemId: string;
  targetItemId: string;
  amountCents: number;
};

export type ApplyOpenItemsResult = { group_id: string; domain: string; applied_cents: number };

/** clara.apply_open_items — pair mechanics between two EXISTING open items, no GL
 *  movement (0037's own header: "the canonical case is applying a credit note to an
 *  invoice"). `applications` must be non-empty; each element's `sourceItemId` must
 *  carry a negative (credit) outstanding and `targetItemId` a positive (claim) one —
 *  this module performs no client-side re-check of that (review law 3 / the DB's own
 *  monopoly); a real CLR10 renders verbatim. */
export function applyOpenItems(
  clientId: string,
  applications: OpenItemApplicationInput[],
  reason: string,
  opts: Opts = {},
): Promise<ApplyOpenItemsResult> {
  return callDoor<ApplyOpenItemsResult>(
    "apply_open_items",
    {
      p_client: clientId,
      p_applications: applications.map((a) => ({
        source_item_id: a.sourceItemId, target_item_id: a.targetItemId, amount_cents: a.amountCents,
      })),
      p_reason: reason,
      p_op_key: opKey(),
    },
    opts,
  );
}

export type UnallocateGroupResult = { group_id: string; reversed_group: string; allocations: number };

/** clara.unallocate_group — the EXACT negation of one WHOLE application_group, never
 *  row-by-row (0037's own header). */
export function unallocateGroup(
  clientId: string,
  applicationGroupId: string,
  reason: string,
  opts: Opts = {},
): Promise<UnallocateGroupResult> {
  return callDoor<UnallocateGroupResult>(
    "unallocate_group",
    { p_client: clientId, p_group: applicationGroupId, p_reason: reason, p_op_key: opKey() },
    opts,
  );
}
