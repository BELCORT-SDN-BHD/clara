// Opening balances & carry-down — T2. The item-level governed writes
// (draft/target/keyed-resolution/supersede/seed_fixed_asset). Seed-lifecycle
// writes live in ./opening-doors.ts. Every call mints its own fresh op_key
// (crypto.randomUUID()), never reused across a retry.

import { callDoor } from "../doors";
import type { SessionTokenAccessor } from "@/lib/session";
import type { OpeningItemInput, OpeningLineInput, OpeningFixedAssetInput } from "./opening-types";

/** clara.draft_opening_item(p_client, p_seed, p_item, p_lines, p_resolution,
 *  p_document, p_sha256, p_op_key) — bookkeeper+. `resolution`/`document`/
 *  `sha256` come from the seed's own tie state (the caller reads
 *  `seed.tie_document_id`/`seed.tie_document_sha256` and a bound keyed
 *  resolution id, never invents either) — a tied seed's item MUST bind the
 *  exact tie document (CLR31 `tie_mismatch` otherwise); an untied seed's item
 *  must carry NO document at all. */
export function draftOpeningItem(
  session: SessionTokenAccessor,
  args: {
    client: string;
    seed: string;
    item: OpeningItemInput;
    lines: OpeningLineInput[] | null;
    resolution: string | null;
    document: string | null;
    sha256: string | null;
  },
): Promise<unknown> {
  return callDoor(
    "draft_opening_item",
    {
      p_client: args.client,
      p_seed: args.seed,
      p_item: args.item,
      p_lines: args.lines,
      p_resolution: args.resolution,
      p_document: args.document,
      p_sha256: args.sha256,
      p_op_key: crypto.randomUUID(),
    },
    { session },
  );
}

/** clara.record_opening_target(p_seed, p_line, p_op_key) — bookkeeper+.
 *  ONLY for an UNTIED (no `tie_document_id`) open seed — the live body
 *  refuses CLR31 `parsed_target_writer_required` on a tied registry. Exactly
 *  one of `debit_cents`/`credit_cents` must be positive (XOR, CLR10
 *  otherwise). */
export function recordOpeningTarget(
  session: SessionTokenAccessor,
  args: { seed: string; lineKey: string; accountCode: string; sourceLabel: string | null; debitCents: number; creditCents: number },
): Promise<unknown> {
  return callDoor(
    "record_opening_target",
    {
      p_seed: args.seed,
      p_line: {
        line_key: args.lineKey,
        account_code: args.accountCode,
        source_label: args.sourceLabel,
        debit_cents: args.debitCents,
        credit_cents: args.creditCents,
      },
      p_op_key: crypto.randomUUID(),
    },
    { session },
  );
}

/** clara.record_opening_keyed_resolution(p_client, p_seed, p_evidence,
 *  p_op_key) — bookkeeper+. THE HUMAN KEYED DOOR (fa7b-gate-record.md's own
 *  ratified clarification): always open, on an UNTIED seed only (CLR10
 *  `tie_document_present` on a tied one) — mints (or, on a second call,
 *  auto-supersedes and re-mints) the `client_resolutions` row every keyed
 *  opening item's provenance binds to. `note` is a free-text record for the
 *  file; the door merges it UNDER its own authoritative spine
 *  (`source`/`seed_id`) — a caller cannot spoof either. */
export function recordOpeningKeyedResolution(
  session: SessionTokenAccessor,
  args: { client: string; seed: string; note: string },
): Promise<unknown> {
  return callDoor(
    "record_opening_keyed_resolution",
    {
      p_client: args.client,
      p_seed: args.seed,
      p_evidence: args.note.trim() === "" ? null : { note: args.note.trim() },
      p_op_key: crypto.randomUUID(),
    },
    { session },
  );
}

/** clara.supersede_opening_item(p_item, p_replacement, p_op_key) —
 *  bookkeeper+. Only an ACTIVE item on a FINALIZED seed is correctable (CLR31
 *  `registry_not_open` otherwise) — reopens the seed's registry to `open` and
 *  drafts a reversal in the SAME call; `replacement` is optional for every
 *  kind EXCEPT `fixed_asset` (fix round, rev-t2, F7 — TRUED, was claimed
 *  backwards): the live body drafts the reversal, THEN, only on the `null`
 *  branch, raises CLR31 "a fixed-asset supersede requires a replacement
 *  baseline" for `oi.item_kind='fixed_asset'` — the raise aborts the WHOLE
 *  transaction (the reversal draft is rolled back with it), so
 *  `replacement: null` on a fixed-asset row is not a degraded path, it is a
 *  call that can never succeed. T2 does not build the live body's own nested
 *  `asset` replacement envelope, so this dialog does not offer a working
 *  supersede for a fixed-asset row at all — the caller (opening-supersede-
 *  dialog.tsx) disables Confirm with a visible reason on that kind, never
 *  hides the trigger. */
export function supersedeOpeningItem(
  session: SessionTokenAccessor,
  args: {
    item: string;
    replacement: { item: OpeningItemInput; lines: OpeningLineInput[] | null } | null;
  },
): Promise<unknown> {
  return callDoor(
    "supersede_opening_item",
    {
      p_item: args.item,
      p_replacement: args.replacement ? { item: args.replacement.item, lines: args.replacement.lines } : null,
      p_op_key: crypto.randomUUID(),
    },
    { session },
  );
}

/** clara.seed_fixed_asset(p_client, p_seed, p_asset, p_op_key, p_resolution)
 *  — bookkeeper+. THE OPENING ACT that seams into T3's fixed-asset register
 *  (lib/registers/fixed-assets.ts): the row this mints reads through
 *  `list_fixed_assets` at `status: "pending"` immediately, and flips to
 *  `"active"` the moment `approve_opening_seed` finalizes this batch. A
 *  non-null `resolution` CONFLICTS with a tied seed (CLR10
 *  `resolution_conflicts_with_tie`) — the dialog only offers the field when
 *  the seed is untied. */
export function seedFixedAsset(
  session: SessionTokenAccessor,
  args: { client: string; seed: string; asset: OpeningFixedAssetInput; resolution: string | null },
): Promise<unknown> {
  return callDoor(
    "seed_fixed_asset",
    {
      p_client: args.client,
      p_seed: args.seed,
      p_asset: { asset: args.asset },
      p_op_key: crypto.randomUUID(),
      p_resolution: args.resolution,
    },
    { session },
  );
}
