// Opening-item jsonb payload builders (LANE D3). PURE. These assemble the EXACT
// shapes the 0017 human-lane writers expect — draft_opening_item (K3/AMB-4/AMB-5),
// seed_fixed_asset (K8/FORK-7), and the keyed record_opening_target line — from raw
// form input. They validate shape only; the DB re-checks every rule (tie, control
// accounts, SST all-or-none, FA baseline) and its refusal is the authority. No figure
// is computed here — cents are parsed and passed through verbatim.

export type BuildResult<T> = { ok: true; payload: T } | { ok: false; error: string };

/** Parse a whole-cent value from a form string or number. Rejects non-integers and
 *  anything that would not survive JS Number precision (never a silently-wrong amount). */
export function parseCents(v: string | number): number | null {
  if (typeof v === "number") return Number.isInteger(v) && Number.isSafeInteger(v) ? v : null;
  const t = v.trim();
  if (!/^-?\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isSafeInteger(n) ? n : null;
}

function parseIntOptional(v: string | number | undefined): number | null {
  if (v === undefined) return 0;
  return parseCents(v);
}

// ---------------------------------------------------------------------------
// Keyed target line (record_opening_target, keyed lane only). A document-tied seed
// is refused on this path by the DB — document targets ride the parse route (§3.3).
// Exactly one of debit/credit must be positive.
// ---------------------------------------------------------------------------

export type KeyedTargetInput = {
  lineKey: string;
  accountCode?: string;
  sourceLabel?: string;
  side: "debit" | "credit";
  amountCents: string | number;
};

export function buildKeyedTargetLine(input: KeyedTargetInput): BuildResult<Record<string, unknown>> {
  const key = input.lineKey.trim();
  if (!key) return { ok: false, error: "A line key is required." };
  const cents = parseCents(input.amountCents);
  if (cents === null || cents <= 0) return { ok: false, error: "Enter a positive whole-cent amount." };
  const line: Record<string, unknown> = {
    line_key: key,
    debit_cents: input.side === "debit" ? cents : 0,
    credit_cents: input.side === "credit" ? cents : 0,
  };
  const acc = input.accountCode?.trim();
  if (acc) line.account_code = acc;
  const label = input.sourceLabel?.trim();
  if (label) line.source_label = label;
  return { ok: true, payload: line };
}

// ---------------------------------------------------------------------------
// draft_opening_item payloads. gl_balance & bank_uncleared pass p_lines; ar/ap/
// equity_net/obe_plug pass p_item.amount_cents with p_lines null (the DB derives
// every contra leg — OBE/RE are DB-resolved, never supplied by the UI).
// ---------------------------------------------------------------------------

export type ItemDraftPayload = { item: Record<string, unknown>; lines: unknown[] | null };

export type LegInput = {
  accountCode: string;
  side: "debit" | "credit";
  amountCents: string | number;
  description?: string;
};

function buildLegs(legs: LegInput[]): BuildResult<unknown[]> {
  if (legs.length === 0) return { ok: false, error: "At least one typed leg is required." };
  const out: unknown[] = [];
  for (const leg of legs) {
    const acc = leg.accountCode.trim();
    if (!acc) return { ok: false, error: "Every leg needs an account code." };
    const cents = parseCents(leg.amountCents);
    if (cents === null || cents <= 0) return { ok: false, error: "Every leg needs a positive whole-cent amount." };
    const row: Record<string, unknown> = {
      account_code: acc,
      debit_cents: leg.side === "debit" ? cents : 0,
      credit_cents: leg.side === "credit" ? cents : 0,
    };
    if (leg.description?.trim()) row.description = leg.description.trim();
    out.push(row);
  }
  return { ok: true, payload: out };
}

export type GlLikeInput = {
  kind: "gl_balance" | "bank_uncleared";
  itemKey: string;
  memo?: string;
  itemRef?: string; // required for bank_uncleared (WB-R12)
  itemDate?: string; // required for bank_uncleared (WB-R12)
  legs: LegInput[];
};

export function buildGlLikeItem(input: GlLikeInput): BuildResult<ItemDraftPayload> {
  const key = input.itemKey.trim();
  if (!key) return { ok: false, error: "An item key is required." };
  const legs = buildLegs(input.legs);
  if (!legs.ok) return legs;
  const item: Record<string, unknown> = { item_kind: input.kind, item_key: key };
  if (input.memo?.trim()) item.memo = input.memo.trim();
  if (input.kind === "bank_uncleared") {
    const ref = input.itemRef?.trim();
    const date = input.itemDate?.trim();
    if (!ref || !date) return { ok: false, error: "An uncleared bank item needs a reference and an instrument date." };
    item.item_ref = ref;
    item.item_date = date;
  }
  return { ok: true, payload: { item, lines: legs.payload } };
}

export type SubledgerInput = {
  kind: "ar_open_item" | "ap_open_item";
  itemKey: string;
  amountCents: string | number; // must be > 0
  counterpartyId: string;
  itemRef?: string;
  // SST facts are all-or-none (WB-R11) and only valid on ar/ap.
  sstPortionCents?: string | number;
  sstRateBp?: string | number;
  sstBasis?: string;
};

export function buildSubledgerItem(input: SubledgerInput): BuildResult<ItemDraftPayload> {
  const key = input.itemKey.trim();
  if (!key) return { ok: false, error: "An item key is required." };
  const cents = parseCents(input.amountCents);
  if (cents === null || cents <= 0) return { ok: false, error: "Enter a positive whole-cent amount." };
  const cp = input.counterpartyId.trim();
  if (!cp) return { ok: false, error: "A counterparty is required for an AR/AP open item." };
  const item: Record<string, unknown> = {
    item_kind: input.kind,
    item_key: key,
    amount_cents: cents,
    counterparty_id: cp,
  };
  if (input.itemRef?.trim()) item.item_ref = input.itemRef.trim();
  const anySst =
    (input.sstPortionCents !== undefined && String(input.sstPortionCents).trim() !== "") ||
    (input.sstRateBp !== undefined && String(input.sstRateBp).trim() !== "") ||
    (input.sstBasis !== undefined && input.sstBasis.trim() !== "");
  if (anySst) {
    const portion = parseCents(input.sstPortionCents ?? "");
    const rate = parseCents(input.sstRateBp ?? "");
    const basis = input.sstBasis?.trim();
    if (portion === null || portion < 0 || rate === null || rate <= 0 || !basis) {
      return { ok: false, error: "SST facts are all-or-none: portion (≥0), rate basis-points (>0), and basis text." };
    }
    item.sst_portion_cents = portion;
    item.sst_rate_bp = rate;
    item.sst_basis = basis;
  }
  return { ok: true, payload: { item, lines: null } };
}

export type SignedEquityInput = {
  kind: "equity_net" | "obe_plug";
  itemKey: string;
  amountCents: string | number; // signed, non-zero
};

export function buildSignedEquityItem(input: SignedEquityInput): BuildResult<ItemDraftPayload> {
  const key = input.itemKey.trim();
  if (!key) return { ok: false, error: "An item key is required." };
  const cents = parseCents(input.amountCents);
  if (cents === null || cents === 0) return { ok: false, error: "Enter a non-zero signed whole-cent amount." };
  return { ok: true, payload: { item: { item_kind: input.kind, item_key: key, amount_cents: cents }, lines: null } };
}

/** AMB-5 balance-sheet sign guidance (equity_net). Positive → the retained-earnings
 *  credit polarity (accumulated profit carried forward); negative → the debit polarity
 *  (accumulated loss). The DB posts the exact legs; this is operator guidance only. */
export function equityNetSignNote(amountCents: number | null): string {
  if (amountCents === null || amountCents === 0) return "";
  return amountCents > 0
    ? "positive → credit to retained earnings (accumulated profit carried forward)"
    : "negative → debit to retained earnings (accumulated loss carried forward)";
}

/** obe_plug sign guidance: the signed plug that must bring OBE to nil at K4/K5. */
export function obePlugSignNote(amountCents: number | null): string {
  if (amountCents === null || amountCents === 0) return "";
  return amountCents > 0
    ? "positive → credit to opening-balance-equity (natural equity polarity)"
    : "negative → debit to opening-balance-equity";
}

// ---------------------------------------------------------------------------
// seed_fixed_asset envelope (K8). FORK-7: a non-straight-line method is refused by
// the DB (CLR31 depreciation_method_unsupported) rendered VERBATIM — we default the
// method to straight_line and never pre-empt the refusal.
// ---------------------------------------------------------------------------

export type FixedAssetInput = {
  itemKey: string;
  description: string;
  acquiredDate: string;
  costCents: string | number;
  accumulatedDepreciationCents?: string | number;
  residualCents?: string | number;
  usefulLifeMonths: string | number;
  depreciationStartDate: string;
  assetAccountCode: string;
  accumDeprAccountCode: string;
  deprExpenseAccountCode: string;
  depreciationMethod?: string;
};

export function buildFixedAssetEnvelope(input: FixedAssetInput): BuildResult<Record<string, unknown>> {
  const key = input.itemKey.trim();
  if (!key) return { ok: false, error: "An item key is required." };
  const desc = input.description.trim();
  if (!desc) return { ok: false, error: "A description is required." };
  if (!input.acquiredDate.trim()) return { ok: false, error: "An acquired date is required." };
  if (!input.depreciationStartDate.trim()) return { ok: false, error: "A depreciation start date is required." };
  const cost = parseCents(input.costCents);
  if (cost === null || cost <= 0) return { ok: false, error: "Cost must be a positive whole-cent amount." };
  const accum = parseIntOptional(input.accumulatedDepreciationCents);
  if (accum === null || accum < 0) return { ok: false, error: "Accumulated depreciation must be zero or positive." };
  const residual = parseIntOptional(input.residualCents);
  if (residual === null || residual < 0) return { ok: false, error: "Residual must be zero or positive." };
  const life = parseCents(input.usefulLifeMonths);
  if (life === null || life <= 0) return { ok: false, error: "Useful life (months) must be positive." };
  const asset = input.assetAccountCode.trim();
  const accumAcc = input.accumDeprAccountCode.trim();
  const expense = input.deprExpenseAccountCode.trim();
  if (!asset || !accumAcc || !expense) {
    return { ok: false, error: "Asset, accumulated-depreciation, and expense account codes are all required." };
  }
  const envelope: Record<string, unknown> = {
    item_key: key,
    description: desc,
    acquired_date: input.acquiredDate.trim(),
    cost_cents: cost,
    accumulated_depreciation_cents: accum,
    residual_cents: residual,
    useful_life_months: life,
    depreciation_start_date: input.depreciationStartDate.trim(),
    asset_account_code: asset,
    accum_depr_account_code: accumAcc,
    depr_expense_account_code: expense,
    depreciation_method: input.depreciationMethod?.trim() || "straight_line",
  };
  return { ok: true, payload: envelope };
}
