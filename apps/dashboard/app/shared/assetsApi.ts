// Wave D-a wire client for /assets (design v2.1 §6; 0041-interface-contract.md
// §2/§3). HUMAN lane only (PostgREST as clara_authenticated) — no figure is
// computed here, the DB owns every cents value (AGENTS.md law); this module
// calls the named RPCs and maps their rows defensively via assetsModel.ts's
// mappers (the agingApi.ts split precedent).
//
// SHAPE HONESTY NOTE (mirrors agingApi.ts's own header): migration 0041 is
// still-to-merge as this file is written. Every RPC name + arg name below is
// copied LITERALLY from 0041-interface-contract.md §2/§3 (the orchestrator-
// pinned verb signatures, binding on every D-a build lane). Every ACTION verb
// mints a FRESH client op_key per call (the /bank action idiom, reconApi.ts's
// `opKey()` — the DB is idempotent on firm,fn,op_key; never reuse one across
// retries or mint one at module load).
//
// The dashboard DEPLOYS BEFORE 0041 exists in prod (design §8): every call
// here degrades gracefully through the ordinary PgrestError surface — a
// missing-function 404/undefined-function error renders as an honest empty/
// error state via useCard's err/clr, never a crash.

import { rpc } from "./wire";
import {
  toListFixedAssetsRead, toGetFixedAssetRead, toListDepreciationRunsRead, toGetDepreciationRunRead,
  toDepreciationAuthorityRead, toFaRegisterTieRead, toSplitMonthAdvisory,
  type ListFixedAssetsRead, type GetFixedAssetRead, type ListDepreciationRunsRead, type GetDepreciationRunRead,
  type DepreciationAuthorityRead, type FaRegisterTieRead, type FixedAssetParticulars, type DepreciationCadence,
  type SplitMonthAdvisory,
} from "../assets/assetsModel";

const opKey = () => crypto.randomUUID();

// ---------------------------------------------------------------------------
// Reads (pin sheet §3 — each returns ONE jsonb object, never an array).
// ---------------------------------------------------------------------------

export async function listFixedAssets(token: string, clientId: string): Promise<ListFixedAssetsRead> {
  const out = await rpc("list_fixed_assets", { p_client: clientId }, token);
  return toListFixedAssetsRead(out);
}

export async function getFixedAsset(token: string, assetId: string): Promise<GetFixedAssetRead> {
  const out = await rpc("get_fixed_asset", { p_asset: assetId }, token);
  return toGetFixedAssetRead(out);
}

export async function listDepreciationRuns(token: string, clientId: string): Promise<ListDepreciationRunsRead> {
  const out = await rpc("list_depreciation_runs", { p_client: clientId }, token);
  return toListDepreciationRunsRead(out);
}

/** get_depreciation_run(run) — orchestrator-pinned addition (pin sheet §3 ★):
 *  the SweepReceiptPart/BankReconReceiptPart by-id-getter precedent. */
export async function getDepreciationRun(token: string, runId: string): Promise<GetDepreciationRunRead> {
  const out = await rpc("get_depreciation_run", { p_run: runId }, token);
  return toGetDepreciationRunRead(out);
}

export async function getDepreciationAuthority(token: string, clientId: string): Promise<DepreciationAuthorityRead> {
  const out = await rpc("get_depreciation_authority", { p_client: clientId }, token);
  return toDepreciationAuthorityRead(out);
}

export async function faRegisterTie(token: string, clientId: string, asOf: string): Promise<FaRegisterTieRead> {
  const out = await rpc("fa_register_tie", { p_client: clientId, p_as_of: asOf }, token);
  return toFaRegisterTieRead(out);
}

// ---------------------------------------------------------------------------
// Actions (pin sheet §2 — every verb takes p_op_key LAST; a fresh op_key per
// call, per house action precedent). No local role gating anywhere below —
// the DB's role/CLR refusal is the enforcement (the exceptBankLine precedent:
// "this UI does not gate on a local role guess").
// ---------------------------------------------------------------------------

export async function upsertFaAccountProfile(
  token: string,
  args: { clientId: string; assetAccount: string; accumAccount: string | null; depreciationExpenseAccount: string | null },
): Promise<void> {
  await rpc(
    "upsert_fa_account_profile",
    {
      p_client: args.clientId, p_asset_account: args.assetAccount,
      p_accum_account: args.accumAccount, p_depr_expense_account: args.depreciationExpenseAccount,
      p_op_key: opKey(),
    },
    token,
  );
}

/** ★ orchestrator-pinned addition (the §1.2 "retired row" door made explicit). */
export async function retireFaAccountProfile(token: string, clientId: string, assetAccount: string): Promise<void> {
  await rpc("retire_fa_account_profile", { p_client: clientId, p_asset_account: assetAccount, p_op_key: opKey() }, token);
}

export async function completeFixedAssetParticulars(
  token: string, clientId: string, assetId: string, particulars: FixedAssetParticulars,
): Promise<void> {
  await rpc(
    "complete_fixed_asset_particulars",
    { p_client: clientId, p_asset: assetId, p_particulars: particulars, p_op_key: opKey() },
    token,
  );
}

/** revise_fixed_asset_particulars — the MPERS-17.19 prospective door (design
 *  §2.3): refuses `fa_revise_effective_conflict` if p_effective_from ≤ a live
 *  charge's period_end.
 *
 *  [round-5 fix] RETURNS THE RECEIPT, which this used to discard as `void`.
 *  0042 S5.5 puts the WDB-G14 mid-month changeover advisory IN the receipt
 *  precisely so "the professional who performed a mid-month revision is told
 *  about the changeover month AT THE MOMENT OF THE ACT rather than only on a
 *  later read" (the section's own words). A `Promise<void>` wrapper threw that
 *  away, so the DB emitted the escalation on both channels the design names and
 *  ZERO surfaces rendered either — the condition the owner attached to the
 *  month-grain ruling was not met anywhere. */
export type ReviseFixedAssetParticularsReceipt = {
  asset_id: string | null;
  successor_asset_id: string | null;
  effective_from: string | null;
  client_id: string | null;
  split_month_advisory: SplitMonthAdvisory[];
};

export async function reviseFixedAssetParticulars(
  token: string, clientId: string, assetId: string, particulars: FixedAssetParticulars, effectiveFrom: string,
): Promise<ReviseFixedAssetParticularsReceipt> {
  const out = await rpc(
    "revise_fixed_asset_particulars",
    { p_client: clientId, p_asset: assetId, p_particulars: particulars, p_effective_from: effectiveFrom, p_op_key: opKey() },
    token,
  );
  const o = (out ?? {}) as Record<string, unknown>;
  const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
  return {
    asset_id: str(o.asset_id),
    successor_asset_id: str(o.successor_asset_id),
    effective_from: str(o.effective_from),
    client_id: str(o.client_id),
    split_month_advisory: (Array.isArray(o.split_month_advisory) ? o.split_month_advisory : []).map(toSplitMonthAdvisory),
  };
}

export async function proposeDepreciationAuthority(
  token: string, clientId: string, cadence: DepreciationCadence,
): Promise<void> {
  await rpc("propose_depreciation_authority", { p_client: clientId, p_cadence: cadence, p_op_key: opKey() }, token);
}

/** sign_depreciation_authority — admin+ (WD-R9); no local role gating here,
 *  the DB's role floor is the enforcement. */
export async function signDepreciationAuthority(token: string, clientId: string, authorityId: string): Promise<void> {
  await rpc("sign_depreciation_authority", { p_client: clientId, p_authority: authorityId, p_op_key: opKey() }, token);
}

export async function retireDepreciationAuthority(
  token: string, clientId: string, authorityId: string, reason: string,
): Promise<void> {
  await rpc(
    "retire_depreciation_authority",
    { p_client: clientId, p_authority: authorityId, p_reason: reason, p_op_key: opKey() },
    token,
  );
}

/** run_depreciation_manual — the human path (`_human_ctx(bookkeeper)` + firm
 *  check, design §3.4); mode is DERIVED in-verb, never a caller argument.
 *  Returns the run-or-noop receipt jsonb (pin sheet §5) verbatim; callers that
 *  need the typed shape re-fetch via list/getDepreciationRun. */
export async function runDepreciationManual(
  token: string, clientId: string, periodStart: string, periodEnd: string,
): Promise<unknown> {
  return rpc(
    "run_depreciation_manual",
    { p_client: clientId, p_period_start: periodStart, p_period_end: periodEnd, p_op_key: opKey() },
    token,
  );
}

export async function disposeFixedAsset(
  token: string,
  args: {
    clientId: string; assetId: string; disposalDate: string; proceedsCents: number;
    proceedsAccount: string | null; gainAccount: string; lossAccount: string; memo: string | null;
    costPortionCents?: number | null;
  },
): Promise<void> {
  await rpc(
    "dispose_fixed_asset",
    {
      p_client: args.clientId, p_asset: args.assetId, p_disposal_date: args.disposalDate,
      p_proceeds_cents: args.proceedsCents, p_proceeds_account: args.proceedsAccount,
      p_gain_account: args.gainAccount, p_loss_account: args.lossAccount, p_memo: args.memo,
      p_op_key: opKey(), p_cost_portion_cents: args.costPortionCents ?? null,
    },
    token,
  );
}

export async function setClientFyEnd(token: string, clientId: string, month: number, day: number): Promise<void> {
  await rpc("set_client_fy_end", { p_client: clientId, p_month: month, p_day: day, p_op_key: opKey() }, token);
}
