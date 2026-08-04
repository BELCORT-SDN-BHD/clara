// Wave D-a — /assets' pure model (design v2.1 §6; 0041-interface-contract.md
// §3/§5/§7). PURE: zero network, zero React (the agingModel.ts precedent).
// Every cents figure here is a DB-owned value from list_fixed_assets/
// get_fixed_asset/list_depreciation_runs/get_depreciation_run/get_depreciation_
// authority/fa_register_tie — this module maps, labels, and derives DISPLAY-ONLY
// predicates. It NEVER computes a financial figure: schedule/charges/accumulated/
// nbv are all DB-projected (design §1.1/§1.3), never re-derived client-side.
//
// SHAPE HONESTY NOTE (mirrors agingModel.ts's own header): migration 0041 is
// still-to-merge as this file is written. Every envelope key below is copied
// LITERALLY from 0041-interface-contract.md §3 (the orchestrator-pinned read
// shapes, binding on every D-a build lane) — a future drift from the shipped
// migration is itself a pin violation to report, not silently patch around.
//
// [round-5 fix] THE ASSUMPTION THAT WAS NEVER LANDED. This file used to carry
// `disposal_draft_entry_id` as a NAMED ASSUMPTION — a key no function in the
// schema emitted — and AssetDetailPane gated a 72-line panel on it, so the panel
// could never render while its ELSE arm offered a dispose form whose only possible
// outcome on that row was a CLR39 refusal. 0042 S5.4 now projects the freeze from
// `_fa_disposal_draft_outstanding` (the guard's OWN function) plus the draft id,
// so the key is measured, not assumed. `dbSeamCensus.test.ts` diffs every mapper
// below against the SHIPPED catalog so no successor can re-introduce the shape.

function s(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}
function numOrNull(v: unknown): number | null {
  return typeof v === "number" ? v : null;
}
function bool(v: unknown): boolean {
  return v === true;
}
function rec(v: unknown): Record<string, unknown> {
  return (v ?? {}) as Record<string, unknown>;
}
function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function strArr(v: unknown): string[] {
  return arr(v).filter((x): x is string => typeof x === "string");
}

// ---------------------------------------------------------------------------
// list_fixed_assets(client) / get_fixed_asset(asset) — pin sheet §3. ASSET is
// the one row shape shared by both envelopes.
// ---------------------------------------------------------------------------

export type DepreciationMethod = "straight_line" | "reducing_balance" | "none";
export type FixedAssetStatus = "pending" | "active" | "superseded" | "disposed" | "unwound" | string;

export type AssetRow = {
  id: string;
  description: string | null;
  status: FixedAssetStatus;
  particulars_complete: boolean;
  acquired_date: string | null;
  effective_from: string | null;
  superseded_at: string | null;
  cost_cents: number | null;
  residual_cents: number | null;
  /** The §1.3 as-of read at CURRENT date (the envelope's own `as_of` echoes it). */
  accumulated_cents: number | null;
  nbv_cents: number | null;
  method: DepreciationMethod | null;
  rate_bps: number | null;
  useful_life_months: number | null;
  start_date: string | null;
  asset_account: string | null;
  accum_account: string | null;
  expense_account: string | null;
  ca_class: string | null;
  is_commercial_vehicle: boolean;
  is_new: boolean;
  superseded_by_asset_id: string | null;
  disposed_at: string | null;
  disposal_entry_id: string | null;
  uncharged_due_count: number | null;
  /** WD-R6: WHICH months this row owes, not only how many. `_fa_asset_json`
   *  projects both from one arithmetic pass precisely so a professional can see
   *  the months on the register row itself (0041's fold F3). */
  uncharged_due: string[];
  /** Wave D-b (design §6.1, WDB-G10): the second-disposal FREEZE, as the DB
   *  itself judges it — `_fa_asset_json` asks the guard's own
   *  `_fa_disposal_draft_outstanding`, so this verdict and the CLR39 refusal
   *  `dispose_fixed_asset` would raise cannot disagree. TRUE ⇒ a dispose is
   *  refused on this row until the outstanding draft is approved or withdrawn. */
  disposal_draft_outstanding: boolean;
  /** The outstanding draft's entry id when the DB can name it (it is allowed to
   *  be null while the verdict is true). Drives the inline withdraw affordance
   *  ONLY — the panel itself is keyed on the verdict, never on this. */
  disposal_draft_entry_id: string | null;
  /** WDB-G14 (design §6.4): the mid-month changeover advisory, DERIVED per read
   *  and never stored. Non-empty ⇒ a revision took effect after day 1, so the
   *  whole changeover month stayed with the predecessor. The 2026-08-02 owner
   *  ruling pinned the month-grain arithmetic ON CONDITION that this is
   *  reviewer-visible; an advisory no surface renders is not visible. */
  split_month_advisory: SplitMonthAdvisory[];
  split_month_advisory_count: number | null;
};

/** One mid-month changeover (WDB-G14). Every field is a DB-owned calendar fact or
 *  a DB-read chargeable-month boundary — nothing here is computed client-side. */
export type SplitMonthAdvisory = {
  asset_id: string | null; predecessor_asset_id: string | null; effective_from: string | null;
  changeover_month_start: string | null; changeover_month_end: string | null;
  month_charged_to: string | null; predecessor_last_chargeable_month: string | null;
  successor_first_chargeable_month: string | null; note: string | null;
};

export function toSplitMonthAdvisory(raw: unknown): SplitMonthAdvisory {
  const o = rec(raw);
  return {
    asset_id: s(o.asset_id), predecessor_asset_id: s(o.predecessor_asset_id),
    effective_from: s(o.effective_from),
    changeover_month_start: s(o.changeover_month_start),
    changeover_month_end: s(o.changeover_month_end),
    month_charged_to: s(o.month_charged_to),
    predecessor_last_chargeable_month: s(o.predecessor_last_chargeable_month),
    successor_first_chargeable_month: s(o.successor_first_chargeable_month),
    note: s(o.note),
  };
}

export function toAssetRow(raw: unknown): AssetRow {
  const o = rec(raw);
  return {
    id: s(o.id) ?? "",
    description: s(o.description),
    status: s(o.status) ?? "active",
    particulars_complete: bool(o.particulars_complete),
    acquired_date: s(o.acquired_date),
    effective_from: s(o.effective_from),
    superseded_at: s(o.superseded_at),
    cost_cents: numOrNull(o.cost_cents),
    residual_cents: numOrNull(o.residual_cents),
    accumulated_cents: numOrNull(o.accumulated_cents),
    nbv_cents: numOrNull(o.nbv_cents),
    method: (s(o.method) as DepreciationMethod | null) ?? null,
    rate_bps: numOrNull(o.rate_bps),
    useful_life_months: numOrNull(o.useful_life_months),
    start_date: s(o.start_date),
    asset_account: s(o.asset_account),
    accum_account: s(o.accum_account),
    expense_account: s(o.expense_account),
    ca_class: s(o.ca_class),
    is_commercial_vehicle: bool(o.is_commercial_vehicle),
    is_new: bool(o.is_new),
    superseded_by_asset_id: s(o.superseded_by_asset_id),
    disposed_at: s(o.disposed_at),
    disposal_entry_id: s(o.disposal_entry_id),
    uncharged_due_count: numOrNull(o.uncharged_due_count),
    uncharged_due: strArr(o.uncharged_due),
    disposal_draft_outstanding: bool(o.disposal_draft_outstanding),
    disposal_draft_entry_id: s(o.disposal_draft_entry_id),
    split_month_advisory: arr(o.split_month_advisory).map(toSplitMonthAdvisory),
    split_month_advisory_count: numOrNull(o.split_month_advisory_count),
  };
}

function toAssetRowOrNull(raw: unknown): AssetRow | null {
  return raw && typeof raw === "object" ? toAssetRow(raw) : null;
}

export type ListFixedAssetsRead = {
  client_id: string | null;
  as_of: string | null;
  assets: AssetRow[];
  incomplete_count: number | null;
  /** A SHAPE signal (was `assets[]` present?), independent of whether it is
   *  empty — the aging `available` idiom (agingModel.ts header). */
  available: boolean;
};

export function toListFixedAssetsRead(raw: unknown): ListFixedAssetsRead {
  const o = rec(raw);
  const available = typeof raw === "object" && raw !== null && Array.isArray(o.assets);
  return {
    client_id: s(o.client_id),
    as_of: s(o.as_of),
    assets: available ? (o.assets as unknown[]).map(toAssetRow) : [],
    incomplete_count: numOrNull(o.incomplete_count),
    available,
  };
}

// ---------------------------------------------------------------------------
// get_fixed_asset(asset) — row + upward lineage + charge history + the
// DB-projected schedule (pin sheet §3; design §6). `schedule` is NEVER
// computed client-side — it is the DB's own per-period projection.
// ---------------------------------------------------------------------------

export type ChargeRow = {
  id: string;
  period_start: string | null;
  period_end: string | null;
  amount_cents: number | null;
  effective_date: string | null;
  entry_id: string | null;
  run_id: string | null;
  unwind_of: string | null;
};

export function toChargeRow(raw: unknown): ChargeRow {
  const o = rec(raw);
  return {
    id: s(o.id) ?? "",
    period_start: s(o.period_start),
    period_end: s(o.period_end),
    amount_cents: numOrNull(o.amount_cents),
    effective_date: s(o.effective_date),
    entry_id: s(o.entry_id),
    run_id: s(o.run_id),
    unwind_of: s(o.unwind_of),
  };
}

export type ScheduleRow = { period_start: string | null; period_end: string | null; projected_cents: number | null };

export function toScheduleRow(raw: unknown): ScheduleRow {
  const o = rec(raw);
  return { period_start: s(o.period_start), period_end: s(o.period_end), projected_cents: numOrNull(o.projected_cents) };
}

export type GetFixedAssetRead = {
  asset: AssetRow | null;
  lineage: AssetRow[];
  charges: ChargeRow[];
  schedule: ScheduleRow[];
  uncharged_due: string[];
  available: boolean;
};

export function toGetFixedAssetRead(raw: unknown): GetFixedAssetRead {
  const o = rec(raw);
  const available = typeof raw === "object" && raw !== null && "asset" in o;
  return {
    asset: available ? toAssetRowOrNull(o.asset) : null,
    lineage: arr(o.lineage).map(toAssetRow),
    charges: arr(o.charges).map(toChargeRow),
    schedule: arr(o.schedule).map(toScheduleRow),
    uncharged_due: strArr(o.uncharged_due),
    available,
  };
}

// ---------------------------------------------------------------------------
// list_depreciation_runs(client) / get_depreciation_run(run) — pin sheet §3.
// RUN is the receipt shape shared by both envelopes (§1.5: minted at approve,
// never editable; a correction reverses + re-runs).
// ---------------------------------------------------------------------------

export type DepreciationRunSkipped = { asset_id: string; reason: string };

function toDepreciationRunSkipped(raw: unknown): DepreciationRunSkipped {
  const o = rec(raw);
  return { asset_id: s(o.asset_id) ?? "", reason: s(o.reason) ?? "" };
}

export type DepreciationRunRow = {
  id: string;
  authority_id: string | null;
  period_start: string | null;
  period_end: string | null;
  mode: "post" | "draft" | string;
  entries: number | null;
  charged_cents: number | null;
  skipped: DepreciationRunSkipped[];
  entry_id: string | null;
  created_at: string | null;
};

export function toDepreciationRunRow(raw: unknown): DepreciationRunRow {
  const o = rec(raw);
  return {
    id: s(o.id) ?? "",
    authority_id: s(o.authority_id),
    period_start: s(o.period_start),
    period_end: s(o.period_end),
    mode: s(o.mode) ?? "draft",
    entries: numOrNull(o.entries),
    charged_cents: numOrNull(o.charged_cents),
    skipped: arr(o.skipped).map(toDepreciationRunSkipped),
    entry_id: s(o.entry_id),
    created_at: s(o.created_at),
  };
}

function toDepreciationRunRowOrNull(raw: unknown): DepreciationRunRow | null {
  return raw && typeof raw === "object" ? toDepreciationRunRow(raw) : null;
}

export type ListDepreciationRunsRead = { runs: DepreciationRunRow[]; available: boolean };

export function toListDepreciationRunsRead(raw: unknown): ListDepreciationRunsRead {
  const o = rec(raw);
  const available = typeof raw === "object" && raw !== null && Array.isArray(o.runs);
  return { runs: available ? (o.runs as unknown[]).map(toDepreciationRunRow) : [], available };
}

export type GetDepreciationRunRead = { run: DepreciationRunRow | null; available: boolean };

export function toGetDepreciationRunRead(raw: unknown): GetDepreciationRunRead {
  const o = rec(raw);
  const available = typeof raw === "object" && raw !== null && "run" in o;
  return { run: available ? toDepreciationRunRowOrNull(o.run) : null, available };
}

// ---------------------------------------------------------------------------
// get_depreciation_authority(client) — pin sheet §3. `fallback:true` ⇔ the
// Dec-31 default is being surfaced (design §1.6) because the client carries
// no fy_end_month/fy_end_day yet.
// ---------------------------------------------------------------------------

export type DepreciationAuthorityStatus = "proposed" | "live" | "retired" | string;
export type DepreciationCadence = "monthly" | "annual" | string;

export type DepreciationAuthorityRow = {
  id: string;
  status: DepreciationAuthorityStatus;
  cadence: DepreciationCadence;
  proposed_by: string | null;
  signed_by: string | null;
  retired_by: string | null;
  created_at: string | null;
};

function toDepreciationAuthorityRow(raw: unknown): DepreciationAuthorityRow {
  const o = rec(raw);
  return {
    id: s(o.id) ?? "",
    status: s(o.status) ?? "proposed",
    cadence: s(o.cadence) ?? "monthly",
    proposed_by: s(o.proposed_by),
    signed_by: s(o.signed_by),
    retired_by: s(o.retired_by),
    created_at: s(o.created_at),
  };
}

export type FyEnd = { month: number | null; day: number | null; fallback: boolean };

export type DepreciationAuthorityRead = {
  authority: DepreciationAuthorityRow | null;
  ramp_earned: boolean;
  fy_end: FyEnd;
  high_stakes_threshold_cents: number | null;
  available: boolean;
};

export function toDepreciationAuthorityRead(raw: unknown): DepreciationAuthorityRead {
  const o = rec(raw);
  const fy = rec(o.fy_end);
  const available = typeof raw === "object" && raw !== null && typeof o.fy_end === "object" && o.fy_end !== null;
  return {
    authority: o.authority && typeof o.authority === "object" ? toDepreciationAuthorityRow(o.authority) : null,
    ramp_earned: bool(o.ramp_earned),
    fy_end: { month: numOrNull(fy.month), day: numOrNull(fy.day), fallback: bool(fy.fallback) },
    high_stakes_threshold_cents: numOrNull(o.high_stakes_threshold_cents),
    available,
  };
}

/** A short "DD/MM" FY-end label; names the Dec-31 fallback explicitly (design
 *  §1.6 — the fallback must be SURFACED, never silently assumed). */
export function fyEndLabel(fy: Pick<FyEnd, "month" | "day" | "fallback">): string {
  if (fy.month == null || fy.day == null) return "unset";
  const label = `${String(fy.day).padStart(2, "0")}/${String(fy.month).padStart(2, "0")}`;
  return fy.fallback ? `${label} (Dec-31 default — not yet set for this client)` : label;
}

// ---------------------------------------------------------------------------
// fa_register_tie(client, as_of) — pin sheet §3. Effective-dated register↔GL
// assertion (design §6); visibility only, never blocking.
// ---------------------------------------------------------------------------

export type FaTieAccountRow = {
  asset_account: string | null;
  accum_account: string | null;
  register_cost_cents: number | null;
  gl_cost_cents: number | null;
  cost_diff_cents: number | null;
  register_accum_cents: number | null;
  gl_accum_cents: number | null;
  accum_diff_cents: number | null;
};

function toFaTieAccountRow(raw: unknown): FaTieAccountRow {
  const o = rec(raw);
  return {
    asset_account: s(o.asset_account),
    accum_account: s(o.accum_account),
    register_cost_cents: numOrNull(o.register_cost_cents),
    gl_cost_cents: numOrNull(o.gl_cost_cents),
    cost_diff_cents: numOrNull(o.cost_diff_cents),
    register_accum_cents: numOrNull(o.register_accum_cents),
    gl_accum_cents: numOrNull(o.gl_accum_cents),
    accum_diff_cents: numOrNull(o.accum_diff_cents),
  };
}

export type FaRegisterTieRead = {
  as_of: string | null;
  tie: boolean;
  accounts: FaTieAccountRow[];
  incomplete_count: number | null;
  available: boolean;
};

export function toFaRegisterTieRead(raw: unknown): FaRegisterTieRead {
  const o = rec(raw);
  const available = typeof raw === "object" && raw !== null && Array.isArray(o.accounts);
  return {
    as_of: s(o.as_of),
    tie: bool(o.tie),
    accounts: available ? (o.accounts as unknown[]).map(toFaTieAccountRow) : [],
    incomplete_count: numOrNull(o.incomplete_count),
    available,
  };
}

// ---------------------------------------------------------------------------
// The complete/revise particulars payload (0041-interface-contract.md §2:
// complete_fixed_asset_particulars / revise_fixed_asset_particulars). Unknown
// keys refuse at the DB (`fa_particulars_invalid`) — this type names exactly
// the keys the pin sheet lists, nothing more.
// ---------------------------------------------------------------------------

export type FixedAssetParticulars = {
  method: DepreciationMethod;
  useful_life_months?: number | null;
  rate_bps?: number | null;
  residual_cents?: number | null;
  start_date: string;
  description?: string | null;
  ca_class?: string | null;
  is_commercial_vehicle?: boolean | null;
  is_new?: boolean | null;
};

// ---------------------------------------------------------------------------
// Display-only predicates — the DB owns the underlying facts; these are pure
// boolean derivations over already-DB-owned fields, never a new figure.
// ---------------------------------------------------------------------------

/** A row worth chasing on the register/queue: particulars still pending on a
 *  live (not disposed/superseded/unwound) row. */
export function assetIsIncomplete(row: Pick<AssetRow, "particulars_complete" | "status">): boolean {
  return !row.particulars_complete && (row.status === "pending" || row.status === "active");
}

/** WD-R6: the per-asset uncharged-due advisory — derived from the DB's own
 *  count, never a receipt lookup (design §3.1/§1.5). */
export function assetHasUnchargedDue(row: Pick<AssetRow, "uncharged_due_count">): boolean {
  return (row.uncharged_due_count ?? 0) > 0;
}

/** The dispose action is only offered on a live, complete, UNFROZEN asset.
 *
 *  [round-5 fix] this predicate used to read `active && particulars_complete` —
 *  NARROWER than the DB's own gate, which since WDB-G10 also refuses while a
 *  disposal draft is outstanding. A UI predicate that is narrower than the verb it
 *  fronts offers acts that can only be refused. The freeze term is the DB's own
 *  verdict (`_fa_asset_json` asks the guard's function), never a re-derivation. */
export function assetIsDisposable(
  row: Pick<AssetRow, "status" | "particulars_complete" | "disposal_draft_outstanding">,
): boolean {
  return row.status === "active" && row.particulars_complete && !row.disposal_draft_outstanding;
}

/** WDB-G14: does this row carry a mid-month changeover a reviewer must see? */
export function assetHasSplitMonthAdvisory(
  row: Pick<AssetRow, "split_month_advisory" | "split_month_advisory_count">,
): boolean {
  return (row.split_month_advisory_count ?? row.split_month_advisory.length) > 0;
}

// ---------------------------------------------------------------------------
// Screen state (the agingScreenState/bankScreenState precedent, reimplemented
// locally — each feature's model stays free of a cross-lane import).
// ---------------------------------------------------------------------------

export type ScreenState = "loading" | "error" | "empty" | "partial" | "unavailable" | "ideal";

/** `available` is a SHAPE signal, not a data signal (the [D1 fix] aging law):
 *  false means the envelope did not carry the collection key this reader
 *  expects, and MUST read as `unavailable`, never `empty`. */
export function assetsScreenState(env: { loading: boolean; error: boolean; totalRows: number; available?: boolean }): ScreenState {
  if (env.error && env.totalRows === 0) return "error";
  if (env.loading && env.totalRows === 0) return "loading";
  if (env.available === false) return "unavailable";
  if (env.totalRows === 0) return "empty";
  return "ideal";
}
