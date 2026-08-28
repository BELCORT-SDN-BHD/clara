// Opening balances & carry-down — T2 (port wave, verb census at the live 0142
// catalog — apps/web/AGENTS.md's "chase the LIVE body" rule). Shared types
// only; see ./opening.ts (reads) and ./opening-doors.ts (governed writes) for
// the module boundary this domain follows (the same reads/doors split
// ./counterparty.ts + ./counterparty-doors.ts already established).
//
// hard constraint 2: every cents figure named below is a DB-owned figure —
// this file defines shape, never arithmetic.

export type OpeningSeedState = "open" | "finalized" | "cancelled" | string;

export type OpeningSeedRow = {
  id: string;
  firm_id: string;
  client_id: string;
  plan_id: string;
  as_of: string;
  state: OpeningSeedState;
  tie_document_id: string | null;
  tie_document_sha256: string | null;
  created_by: string;
  created_at: string;
  batch_n: number;
  finalized_at: string | null;
  finalized_by: string | null;
  tie_asserted_at: string | null;
  through_event_seq: number | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
};

export type OpeningItemKind =
  | "gl_balance"
  | "ar_open_item"
  | "ap_open_item"
  | "bank_uncleared"
  | "fixed_asset"
  | "equity_net"
  | "obe_plug"
  | string;

export type OpeningItemState = "active" | "superseded" | string;

export type OpeningItemRow = {
  id: string;
  firm_id: string;
  client_id: string;
  seed_id: string;
  item_kind: OpeningItemKind;
  item_key: string;
  entry_id: string;
  counterparty_id: string | null;
  fixed_asset_id: string | null;
  item_ref: string | null;
  item_date: string | null;
  amount_cents: number | null;
  sst_portion_cents: number | null;
  sst_rate_bp: number | null;
  sst_basis: string | null;
  state: OpeningItemState;
  superseded_by_item: string | null;
  supersedes_item_id: string | null;
  created_by: string;
  created_at: string;
};

export type OpeningTbTargetRow = {
  id: string;
  firm_id: string;
  client_id: string;
  seed_id: string;
  line_key: string;
  account_code: string | null;
  source_label: string | null;
  debit_cents: number;
  credit_cents: number;
  provenance_kind: string;
  document_id: string | null;
  source_sha256: string | null;
  extraction_ref: unknown;
  entered_by: string | null;
  created_at: string;
};

export type OpeningEntryRevisionRow = {
  id: string;
  revision_token: string;
  status: string;
  is_opening_balance: boolean;
  reversal_of: string | null;
};

/** One row of `clara._opening_seed_deltas(p_seed, true)`, `to_jsonb`'d verbatim
 *  by `get_opening_dryrun` — every cents figure here IS the DB's own
 *  comparison (constraint 2). */
export type OpeningDryrunDelta = {
  account_code: string;
  target_debit: number;
  target_credit: number;
  actual_debit: number;
  actual_credit: number;
  delta_debit: number;
  delta_credit: number;
};

export type OpeningUnmappedLabel = { line_key: string; source_label: string | null };
export type OpeningMissingMustAsk = { item_key: string; question: string };

export type OpeningDryrun = {
  seed_id: string;
  client_id: string;
  as_of: string;
  state: OpeningSeedState;
  /** THE tie-out figure (mobbin takeaway 1/2): the opening-balance-equity
   *  account's own net after every drafted item posts. Zero is the quiet
   *  "ties" state; nonzero carries the DB's own signed cents — never
   *  re-derived from `deltas[]` client-side. */
  obe_net_cents: number;
  deltas: OpeningDryrunDelta[];
  unmapped_labels: OpeningUnmappedLabel[];
  missing_must_asks: OpeningMissingMustAsk[];
};

/** The shape `clara._draft_opening_item_core` validates for a non-fixed-asset
 *  kind's `p_item` (draft_opening_item's own grounding, ./opening-doors.ts). */
export type OpeningItemInput = {
  item_kind: Exclude<OpeningItemKind, "fixed_asset">;
  item_key: string;
  /** Required for ar_open_item/ap_open_item (>0) and equity_net/obe_plug
   *  (nonzero, signed); left `null` for gl_balance/bank_uncleared — the door
   *  computes it server-side from `p_lines` (`v_amount := v_dr - v_cr`). */
  amount_cents: number | null;
  counterparty_id: string | null;
  item_ref: string | null;
  item_date: string | null;
};

export type OpeningLineInput = {
  account_code: string;
  debit_cents: number;
  credit_cents: number;
  description?: string | null;
};

/** The opening fixed-asset baseline envelope — `clara._draft_opening_item_core`'s
 *  `v_kind='fixed_asset'` branch is the exact validation the door runs; every
 *  field here is required by that branch unless noted. */
export type OpeningFixedAssetInput = {
  item_key: string;
  description: string;
  acquired_date: string;
  cost_cents: number;
  accumulated_depreciation_cents: number | null;
  residual_cents: number | null;
  useful_life_months: number | null;
  depreciation_method: "straight_line" | "reducing_balance" | "none";
  depreciation_rate_bps: number | null;
  depreciation_start_date: string;
  asset_account_code: string;
  accum_depr_account_code: string | null;
  depr_expense_account_code: string | null;
};
