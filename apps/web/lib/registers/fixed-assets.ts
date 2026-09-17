// Fixed asset register — clara.list_fixed_assets(p_client) (packages/db/migrations/
// 0041_wave_d_a_fa_register.sql:4110-4128), viewer+, granted at 0041:4405-4424.
// Envelope: { client_id, as_of, assets: [...], incomplete_count }. Every asset row is
// `clara._fa_asset_json` — cost/accumulated/NBV are DB-projected as-of TODAY (hard
// constraint 2: never recomputed here).
//
// T3 (port wave, verb census at the live 0140 catalog — the "chase
// the LIVE body" rule): the write surface this file was missing. Every door below is
// bookkeeper+ (`clara._human_ctx(clara.role_rank('bookkeeper'))`), takes a required
// `p_op_key` (CLR10 if blank), and returns the same `clara._finish_op` envelope shape
// the dedupe/reserve-op mechanism gives every governed write in this estate — this
// module reports it VERBATIM, never re-shapes it (hydrate-never-trust: the caller
// re-reads the register/asset afterward via useHydratedPart().act()).
//
// clara.get_fixed_asset(p_asset) — viewer+, the fuller per-asset read (lineage,
// depreciation charges, the projected schedule, disposal-draft freeze) this register
// list intentionally trims. clara.fa_register_tie(p_client, p_as_of) — viewer+, the
// register<->GL tie-out READ: the UI renders `tie`/`accounts[]` as a state banner,
// never re-derives the boolean (constraint 2).

import { callDoor } from "../doors";
import type { SessionTokenAccessor } from "@/lib/session";

export type FixedAssetRow = {
  id: string;
  description: string | null;
  status: "pending" | "active" | "superseded" | "disposed" | "unwound" | string;
  particulars_complete: boolean;
  acquired_date: string | null;
  effective_from: string | null;
  cost_cents: number | null;
  residual_cents: number | null;
  accumulated_cents: number | null;
  nbv_cents: number | null;
  method: "straight_line" | "reducing_balance" | "none" | null;
  rate_bps: number | null;
  useful_life_months: number | null;
  start_date: string | null;
  asset_account: string | null;
  accum_account: string | null;
  expense_account: string | null;
  ca_class: string | null;
  is_commercial_vehicle: boolean | null;
  is_new: boolean | null;
  superseded_by_asset_id: string | null;
  disposed_at: string | null;
  disposal_entry_id: string | null;
  uncharged_due_count: number | null;
  split_month_advisory_count: number | null;
  /** WDB-G10's UI face (`_fa_asset_json`'s own comment): true while an un-dead
   *  disposal draft is outstanding — the dispose door's own CLR39
   *  `disposal_draft_outstanding` refusal, PROJECTED so the register can say
   *  where to go before the human ever opens the dialog. Never hidden behind
   *  a client-side guess on its own — the door is still the wall. */
  disposal_draft_outstanding: boolean;
  disposal_draft_entry_id: string | null;
  /** #639 (migration 0216) — the acquisition, projected on EVERY row shape so the register can
   *  link a row to its journal entry and its source document without a second read per row.
   *  `acquisition_document_id` is `coalesce(f.acquisition_document_id, e.document_id)` over the
   *  acquisition ENTRY: a row birthed by `clara._fa_on_approve` arm 4 carries no birth-time copy
   *  (0017's post-approval immutability wall makes it unwritable), and the entry is the authority.
   *  All three are null on a supersede/revision successor, which has no acquisition of its own. */
  acquisition_entry_id: string | null;
  acquisition_line_id: string | null;
  acquisition_document_id: string | null;
};

export type FixedAssetRegisterEnvelope = {
  client_id: string;
  as_of: string;
  assets: FixedAssetRow[];
  incomplete_count: number;
};

/** read RPC — transport via callDoor; not a governed act. */
export function loadFixedAssets(session: SessionTokenAccessor, clientId: string): Promise<FixedAssetRegisterEnvelope> {
  return callDoor<FixedAssetRegisterEnvelope>("list_fixed_assets", { p_client: clientId }, { session });
}

/** The exact particulars key set `clara._fa_validate_particulars` accepts — an
 *  unknown key refuses CLR37 `axis:"unknown_key"` at the door, so this type is
 *  deliberately closed, not a bag of extra convenience fields. `method: "none"`
 *  carries no life/rate; `straight_line` needs a life and no rate;
 *  `reducing_balance` needs both a life AND a 1..10000 bps rate. */
export type FaParticularsInput = {
  method: "straight_line" | "reducing_balance" | "none";
  useful_life_months?: number | null;
  rate_bps?: number | null;
  residual_cents?: number | null;
  start_date: string;
  description?: string | null;
  ca_class?: string | null;
  is_commercial_vehicle?: boolean | null;
  is_new?: boolean | null;
};

export type FaDepreciationCharge = {
  id: string;
  period_start: string;
  period_end: string;
  amount_cents: number;
  effective_date: string;
  entry_id: string | null;
  run_id: string | null;
  unwind_of: string | null;
};

export type FaProjectedPeriod = {
  period_start: string;
  period_end: string;
  projected_cents: number;
};

/** #639 — THE ACQUISITION AS ITS OWN FACT (`clara._fa_acquisition_json`, migration 0216).
 *
 *  `work_id` and `receipt_id` are DERIVED BY JOIN from the acquisition entry, never stored: the
 *  operation receipt is inserted AFTER the approve and the Work `result` is built inside the
 *  posting core, so an approve-time write of either would have stamped NULL forever
 *  (0195:2123-2127 records the estate's own ruling on exactly that). `currency` is always `MYR` —
 *  admission refuses anything else (0178:734-736) and multi-currency is the accepted PRD:127
 *  deferral, said out loud rather than left as a silent absence. */
export type FaAcquisition = {
  entry_id: string | null;
  line_id: string | null;
  document_id: string | null;
  document_filename: string | null;
  document_mime: string | null;
  document_sha256: string | null;
  document_kind: string | null;
  posting_date: string | null;
  approved_at: string | null;
  entry_status: string | null;
  entry_origin: string | null;
  memo: string | null;
  reversal_of: string | null;
  reversed_by: string | null;
  acquired_date: string | null;
  cost_cents: number | null;
  currency: "MYR";
  asset_account: string | null;
  work_id: string | null;
  receipt_id: string | null;
  receipt_logical_op_id: string | null;
  receipt_created_at: string | null;
  on_behalf_of: string | null;
  work_status: string | null;
  work_purpose: string | null;
  /** `acquisition_entry` for a real acquisition; `supersede_successor` for a split/revision row,
   *  which has no acquisition entry of its own by design (0041 SS1.1). */
  derived_from: "acquisition_entry" | "supersede_successor" | (string & {});
};

/** #639 — the depreciation configuration, SEPARATE from the acquisition. "Policy and schedule
 *  clearly separate" (AC8) is structural in the read, not a layout choice this surface could
 *  quietly undo. `non_depreciable` is the enrolment fact the form needs BEFORE it offers a method
 *  rather than after the door refuses one. */
export type FaParticularsBlock = {
  complete: boolean;
  method: "straight_line" | "reducing_balance" | "none" | null;
  useful_life_months: number | null;
  rate_bps: number | null;
  residual_cents: number | null;
  start_date: string | null;
  description: string | null;
  ca_class: string | null;
  is_commercial_vehicle: boolean | null;
  is_new: boolean | null;
  non_depreciable: boolean;
};

/** #639 — the correction chain, MADE VISIBLE rather than re-linked.
 *
 *  Reversing an acquisition unwinds its register row and re-booking births a NEW one keyed to the
 *  new cost line; no column links the two and 0216 adds none, because a stored link would be a
 *  claim about intent that only a human holds. Every related row therefore says HOW it was
 *  derived, and the surface renders that word. `chain_open` is true when this row's acquisition
 *  was reversed and nothing re-booked has been derived — an empty list would otherwise read as
 *  "nothing happened". */
export type FaRelatedAsset = {
  asset_id: string;
  description: string | null;
  status: string;
  cost_cents: number | null;
  acquired_date: string | null;
  acquisition_entry_id: string | null;
  particulars_complete: boolean;
  /** `co_acquired` is ORDERLESS on purpose: two cost lines on ONE invoice birth two register rows
   *  by design (0041 §9.4), and neither supersedes the other. Round-1 review measured the first
   *  cut calling each sibling the other's `successor`. */
  relation: "predecessor" | "successor" | "co_acquired" | (string & {});
  link: "supersede" | "co_acquired_on_same_document" | "source_document"
    | "reversed_acquisition_on_same_enrolment" | (string & {});
};

export type FaHistory = {
  status: string;
  acquisition_entry_id: string | null;
  acquisition_reversed_by: string | null;
  acquisition_reversed_at: string | null;
  acquisition_reverses: string | null;
  supersedes_asset_id: string | null;
  superseded_by_asset_id: string | null;
  superseded_at: string | null;
  disposed_at: string | null;
  disposal_entry_id: string | null;
  related: FaRelatedAsset[];
  chain_open: boolean;
};

export type FixedAssetDetail = {
  asset: FixedAssetRow;
  /** Walked upward via `supersedes_asset_id` — every predecessor this asset's
   *  lineage carries, oldest last, each `_fa_asset_json`-shaped. */
  lineage: FixedAssetRow[];
  charges: FaDepreciationCharge[];
  /** DB-projected from the SAME arithmetic that posts (design SS6) — never
   *  recomputed here. Empty unless the asset is active, particulars-complete
   *  and depreciable. */
  schedule: FaProjectedPeriod[];
  uncharged_due: unknown[];
  /** #639 (0216). Present on every database at or past that migration; a chain pinned below it
   *  answers `undefined`, which is why the detail surface renders each block behind its own
   *  presence check rather than assuming three keys that did not always exist. */
  acquisition?: FaAcquisition | null;
  particulars?: FaParticularsBlock | null;
  history?: FaHistory | null;
};

/** clara.get_fixed_asset(p_asset) — viewer+. CLR11 if the asset is not in your
 *  firm. */
export function getFixedAsset(session: SessionTokenAccessor, assetId: string): Promise<FixedAssetDetail> {
  return callDoor<FixedAssetDetail>("get_fixed_asset", { p_asset: assetId }, { session });
}

export type FaTieAccountRow = {
  asset_account: string;
  accum_account: string | null;
  register_cost_cents: number;
  gl_cost_cents: number;
  cost_diff_cents: number;
  register_accum_cents: number;
  gl_accum_cents: number;
  accum_diff_cents: number;
  gl_pre_enrolment_cost_cents: number;
  gl_pre_enrolment_accum_cents: number;
  gl_foreign_register_cost_cents: number;
  gl_foreign_register_accum_cents: number;
  pending_draft_rows: number;
  cost_reported_here: boolean;
  before_baseline: boolean;
};

export type FaRegisterTie = {
  client_id: string;
  as_of: string;
  /** THE STATE BANNER FIGURE (constraint 2 / port-wave plan §5): rendered
   *  verbatim, never re-derived from `accounts[]` client-side — a per-row
   *  `cost_diff_cents`/`accum_diff_cents` sum here would silently drift from
   *  what the DB actually compared the moment `cost_reported_here` excludes a
   *  row from one side of the walk. */
  tie: boolean;
  accounts: FaTieAccountRow[];
  incomplete_count: number;
  pending_draft_count: number;
};

/** clara.fa_register_tie(p_client, p_as_of) — viewer+. CLR11 if the client is
 *  not in your firm, CLR10 if `p_as_of` is null. */
export function faRegisterTie(session: SessionTokenAccessor, clientId: string, asOf: string): Promise<FaRegisterTie> {
  return callDoor<FaRegisterTie>("fa_register_tie", { p_client: clientId, p_as_of: asOf }, { session });
}

/** clara.complete_fixed_asset_particulars(p_client, p_asset, p_particulars,
 *  p_op_key) — bookkeeper+. COMPLETE-ONCE: refuses CLR37
 *  `fa_particulars_already_complete` on a row that already has its method
 *  set — revise_fixed_asset_particulars is the prospective-change door for
 *  that case, never a second call here. */
export function completeFixedAssetParticulars(
  session: SessionTokenAccessor,
  args: { clientId: string; assetId: string; particulars: FaParticularsInput },
): Promise<unknown> {
  return callDoor(
    "complete_fixed_asset_particulars",
    { p_client: args.clientId, p_asset: args.assetId, p_particulars: args.particulars, p_op_key: crypto.randomUUID() },
    { session },
  );
}

/** clara.revise_fixed_asset_particulars(p_client, p_asset, p_particulars,
 *  p_effective_from, p_op_key) — bookkeeper+. PROSPECTIVE ONLY: mints a
 *  successor row effective from `effectiveFrom`, supersedes the current row.
 *  Refuses CLR37 if `effectiveFrom` falls on or before a period already
 *  charged, before the carried baseline, or before the row's own effective
 *  date. */
export function reviseFixedAssetParticulars(
  session: SessionTokenAccessor,
  args: { clientId: string; assetId: string; particulars: FaParticularsInput; effectiveFrom: string },
): Promise<unknown> {
  return callDoor(
    "revise_fixed_asset_particulars",
    {
      p_client: args.clientId,
      p_asset: args.assetId,
      p_particulars: args.particulars,
      p_effective_from: args.effectiveFrom,
      p_op_key: crypto.randomUUID(),
    },
    { session },
  );
}

/** clara.dispose_fixed_asset(p_client, p_asset, p_disposal_date,
 *  p_proceeds_cents, p_proceeds_account, p_gain_account, p_loss_account,
 *  p_memo, p_op_key, p_cost_portion_cents) — bookkeeper+. `proceedsCents` is
 *  the caller's OWN cents from components/common/MoneyInput and the shared
 *  lib/bank/money.ts parser (never a float multiply); `costPortionCents` is
 *  optional and, when present, must sit strictly between 0 and the asset's
 *  cost (a PARTIAL disposal — the door itself validates and splits the
 *  lineage). One un-dead disposal draft per asset — a second call while one
 *  is outstanding refuses CLR39 `disposal_draft_outstanding`, named on the
 *  register row itself (`disposal_draft_outstanding`/`disposal_draft_entry_id`
 *  above) before the human ever opens this dialog. */
export function disposeFixedAsset(
  session: SessionTokenAccessor,
  args: {
    clientId: string;
    assetId: string;
    disposalDate: string;
    proceedsCents: number;
    proceedsAccount: string | null;
    gainAccount: string;
    lossAccount: string;
    memo: string | null;
    costPortionCents?: number | null;
  },
): Promise<unknown> {
  return callDoor(
    "dispose_fixed_asset",
    {
      p_client: args.clientId,
      p_asset: args.assetId,
      p_disposal_date: args.disposalDate,
      p_proceeds_cents: args.proceedsCents,
      p_proceeds_account: args.proceedsAccount,
      p_gain_account: args.gainAccount,
      p_loss_account: args.lossAccount,
      p_memo: args.memo,
      p_op_key: crypto.randomUUID(),
      p_cost_portion_cents: args.costPortionCents ?? null,
    },
    { session },
  );
}
