// #660 (journey B2) — the wire contract for `clara.get_client_financial_pack`
// (packages/db/migrations/0232_client_financial_pack.sql), and the ONE typed envelope every money
// figure on the client home passes through.
//
// THIS MODULE IS THE ENVELOPE #669 CONSUMES. The receivable/payable tiles are a later ticket over
// the SAME door and the SAME parser: this file exists so that ticket inherits the hydration rules
// rather than re-deriving them, and so a second figure group cannot arrive on the page with a
// different idea of what `unknown` means.
//
// =============================================================================================
// UNKNOWN IS NOT ZERO, AND IT IS THE WHOLE HYDRATION RULE.
//
// A figure this build could not read comes back `{status:'unknown', valueCents:null}` — because
// "this client's cash is zero" and "I could not find out what this client's cash is" are
// different sentences, and only one of them means a person can stop looking. A `?? 0` anywhere in
// this file would be the bug. The door itself already refuses to fabricate a zero (an unpublished
// cash set is `unknown` + null, never `RM 0.00`); this module's job is to not undo that on the way
// through.
//
// A NUMBER NEVER ARRIVES WITHOUT ITS PERIOD. A figure group missing ANY of its ten envelope fields
// is hydrated as `unknown`, not as a number with a hole in it. A cents value with no period is not
// a smaller truth than a cents value with one — it is an unanswerable claim, because the reader
// cannot tell what interval it is about.
//
// NO CENTS ARITHMETIC HAPPENS HERE, AND A CELL PROVES IT. Every delta, every percentage and every
// series point is computed in the door, once (0232), so the browser and the report cannot disagree
// about what "down 12%" means — and so #669's tiles get the same three comparison rules without
// writing them a second time. This module reads numbers; it never makes one.
//
// AND A CENTS VALUE IS NEVER PUT THROUGH `Number()` ON TRUST. PostgREST hands back JSON numbers,
// and a bigint beyond `Number.MAX_SAFE_INTEGER` would silently round. `isSafeCents`
// (lib/registers/money.ts, re-exported from lib/bank/money.ts) decides, and `fmtCents` renders the
// i18n'd marker instead of a wrong amount. The parser keeps whatever came back and lets the
// formatter be the one that refuses.

import { callDoor } from "@/lib/doors";
import type { SessionTokenAccessor } from "@/lib/session";

export type FinancialPackOptions = {
  session?: SessionTokenAccessor;
  signal?: AbortSignal;
};

/**
 * A figure's ANSWER STATE, as the reader sees it.
 *
 *   ok        the door answered and the population is fully covered.
 *   partial   the door answered and SAID which part of the answer it is not making.
 *   unknown   this build could not read the figure, or the door could not resolve it (no
 *             published cash set, a client this caller cannot see). Distinct from `ok` with 0.
 *   denied    the caller may not read it. Set by `use-financial-pack.ts`, never by the door —
 *             0232 raises CLR04 rather than describing itself as denied.
 *
 * The vocabulary is CLOSED at these four words, and `unavailable` is not one of them: the
 * client home already chose this vocabulary (`client-work-attention.tsx:65-71`, "The WORD is the
 * state; the tone only agrees with it") and a fifth word on one band would mean two bands on one
 * page describe the same condition differently.
 */
export type FigureStatus = "ok" | "partial" | "unknown" | "denied";

const DOOR_STATUSES: readonly string[] = ["ok", "partial", "unknown"];

/** The interval a figure is about. Every field is required; a period with a hole makes the
 *  figure `unknown`. */
export type FigurePeriod = {
  start: string;
  end: string;
  asOf: string;
  timezone: string;
};

/** The comparison the DOOR computed. `deltaPct` is null on a zero comparison amount — a
 *  percentage against zero is not a number, and the face renders "—" rather than 0 %. */
export type FigureComparison = {
  valueCents: number | null;
  deltaCents: number | null;
  /** Percent, already computed and rounded in the door. NEVER recomputed here. */
  deltaPct: number | null;
  /** False when the comparison PERIOD is one this client's books cannot answer for — a month-end
   *  before the coverage floor. The amounts are then null rather than 0: `points[]` already calls
   *  that date unknown, and a line beside the headline saying "against RM 0.00" would make one
   *  read say two different things about one date. An older body that says nothing is treated as
   *  available, because it answered. */
  available: boolean;
  /** The door's machine token for why the comparison is unavailable (`pre_coverage`), or null. */
  reason: string | null;
  /** True when the two amounts differ in sign and both are non-zero — a profit/loss transition,
   *  which a percentage alone cannot convey. */
  signChange: boolean;
  period: FigurePeriod | null;
};

/** One entry inside a composition row — the drilldown's own subject. `entryId` addresses the
 *  EXISTING journals page (`?tab=posted&entry=<id>`); this build adds no ledger surface. */
export type CompositionEntry = {
  entryId: string;
  postingDate: string | null;
  memo: string | null;
  amountCents: number | null;
};

/** One account under a figure — what the readable table beside the chart renders. */
export type CompositionRow = {
  accountId: string;
  accountCode: string;
  name: string | null;
  /** Cash rows carry WHY the account is cash; profit rows carry the account type. */
  memberReason: string | null;
  accountType: string | null;
  openingCents: number | null;
  movementCents: number | null;
  closingCents: number | null;
  entries: CompositionEntry[];
  entriesTotal: number | null;
  entriesTruncated: boolean;
};

/** The ten-field envelope every figure group owes, plus its comparison. */
export type FigureGroup = {
  valueCents: number | null;
  status: FigureStatus;
  unit: string | null;
  currency: string | null;
  period: FigurePeriod | null;
  computedAt: string | null;
  definitionVersion: string | null;
  /** A `pg_snapshot` in text form, taken in the door's own computing statement. The four groups
   *  of one read share one watermark, which is what makes "four faces of one envelope" checkable
   *  rather than asserted. */
  sourceWatermark: string | null;
  coverage: "ok" | "partial" | "unknown" | null;
  /** The door's machine token for WHY coverage is not `ok`, or why an `ok` read still has
   *  something to say (`no_posted_entries`). Rendered through a closed lookup, never printed raw. */
  coverageReason: string | null;
  comparison: FigureComparison | null;
  composition: CompositionRow[];
  /** How many accounts the composition WOULD have carried before the 50-row cap, or null when
   *  the body did not say. The account level owes its own `truncated` + `rows_total`, exactly as
   *  the entry level does: a table that lists 50 accounts and sums to less than the headline
   *  above it, with nothing saying it was cut, is a number a reader cannot reconcile. */
  compositionTotal: number | null;
  compositionTruncated: boolean;
};

/** One cash point of the six-point trend. `available:false` is a real answer — the point is
 *  before the client's coverage floor — and is NEVER rendered as 0. */
export type CashPoint = {
  asOf: string;
  valueCents: number | null;
  available: boolean;
  reason: string | null;
};

/** The cash-account-set version the whole six-point series was computed under. One version, all
 *  six points: a trend whose membership changes between points is not a trend. */
export type CashSetRef = {
  versionId: string;
  revision: number | null;
  effectiveFrom: string | null;
  memberCount: number | null;
  appliedToAllPoints: boolean;
};

/** One month of the income/expense series. `partial` marks the month the as-of falls inside. */
export type SeriesMonth = {
  month: string;
  incomeCents: number | null;
  expenseCents: number | null;
  profitCents: number | null;
  partial: boolean;
  asOf: string | null;
};

export type ClientFinancialPack = {
  computedAt: string | null;
  period: (FigurePeriod & { month: string | null; isMtd: boolean }) | null;
  /** The earliest date this client's books can answer for, or null when there are none at all. */
  coverageFloor: string | null;
  cash: FigureGroup;
  profit: FigureGroup;
  income: FigureGroup;
  expense: FigureGroup;
  cashPoints: CashPoint[];
  cashSet: CashSetRef | null;
  series: SeriesMonth[];
  /** How many approved entries in the period carry a close receipt but no `closing_transfer`
   *  marker — the pre-0120 history this read DISCLOSES and repairs nothing of. */
  unmarkedClosingEntries: number | null;
  /** The same count over the SIX MONTHS THE CHART DRAWS. The period-scoped count above cannot see
   *  an unmarked close three months back, and that close is counted into its own bar. */
  unmarkedClosingEntriesSeries: number | null;
  /** The door's machine token for what the SERIES cannot cover, or null. */
  seriesCoverageReason: string | null;
};

/** The one honest answer for a figure nothing could be read from. Frozen so a caller cannot
 *  mutate the shared shape into something that looks like data. */
export const UNKNOWN_FIGURE: FigureGroup = Object.freeze({
  valueCents: null,
  status: "unknown",
  unit: null,
  currency: null,
  period: null,
  computedAt: null,
  definitionVersion: null,
  sourceWatermark: null,
  coverage: null,
  coverageReason: null,
  comparison: null,
  composition: [],
  compositionTotal: null,
  compositionTruncated: false,
}) as FigureGroup;

/** The figure a caller may not read. Same shape, a different sentence. */
export const DENIED_FIGURE: FigureGroup = Object.freeze({
  ...UNKNOWN_FIGURE,
  status: "denied",
}) as FigureGroup;

export const EMPTY_FINANCIAL_PACK: ClientFinancialPack = Object.freeze({
  computedAt: null,
  period: null,
  coverageFloor: null,
  cash: UNKNOWN_FIGURE,
  profit: UNKNOWN_FIGURE,
  income: UNKNOWN_FIGURE,
  expense: UNKNOWN_FIGURE,
  cashPoints: [],
  cashSet: null,
  series: [],
  unmarkedClosingEntries: null,
  unmarkedClosingEntriesSeries: null,
  seriesCoverageReason: null,
}) as ClientFinancialPack;

export const DENIED_FINANCIAL_PACK: ClientFinancialPack = Object.freeze({
  ...EMPTY_FINANCIAL_PACK,
  cash: DENIED_FIGURE,
  profit: DENIED_FIGURE,
  income: DENIED_FIGURE,
  expense: DENIED_FIGURE,
}) as ClientFinancialPack;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | null {
  return typeof v === "string" && v !== "" ? v : null;
}

/** A cents value, kept EXACTLY as it arrived. Never `Number(v)` on a string and never `?? 0`:
 *  a value this parser cannot vouch for is null, and the formatter renders the marker. */
function cents(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function int(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) ? v : null;
}

function period(raw: unknown): FigurePeriod | null {
  if (!isRecord(raw)) return null;
  const start = str(raw.start);
  const end = str(raw.end);
  const asOf = str(raw.as_of);
  const timezone = str(raw.timezone);
  // ALL FOUR OR NONE. A period missing a fence cannot say what interval the number is about.
  if (start === null || end === null || asOf === null || timezone === null) return null;
  return { start, end, asOf, timezone };
}

function comparison(raw: unknown): FigureComparison | null {
  if (!isRecord(raw)) return null;
  return {
    valueCents: cents(raw.value_cents),
    deltaCents: cents(raw.delta_cents),
    // The door sends a numeric; a null here means "no percentage exists", which is exactly what
    // a zero comparison amount produces. It is NOT a missing field to fill in.
    deltaPct: typeof raw.delta_pct === "number" && Number.isFinite(raw.delta_pct)
      ? raw.delta_pct
      : typeof raw.delta_pct === "string" && raw.delta_pct !== "" && Number.isFinite(Number(raw.delta_pct))
        ? Number(raw.delta_pct)
        : null,
    signChange: raw.sign_change === true,
    // ABSENT MEANS AVAILABLE here, and that is the opposite of `points[]`'s rule on purpose: a
    // body that carried amounts and said nothing about availability ANSWERED the comparison. Only
    // an explicit `false` withholds it.
    available: raw.available !== false,
    reason: str(raw.reason),
    period: period(raw.period),
  };
}

function compositionRows(raw: unknown): CompositionRow[] {
  if (!Array.isArray(raw)) return [];
  const out: CompositionRow[] = [];
  for (const row of raw) {
    if (!isRecord(row)) continue;
    const accountId = str(row.account_id);
    const accountCode = str(row.account_code);
    if (accountId === null || accountCode === null) continue;
    const entries: CompositionEntry[] = [];
    if (Array.isArray(row.entries)) {
      for (const e of row.entries) {
        if (!isRecord(e)) continue;
        const entryId = str(e.entry_id);
        // AN ENTRY WITHOUT AN ID IS NOT A DRILLDOWN. It is dropped rather than rendered as a
        // dead row, because the whole point of the row is that it addresses one entry.
        if (entryId === null) continue;
        entries.push({
          entryId,
          postingDate: str(e.posting_date),
          memo: str(e.memo),
          amountCents: cents(e.amount_cents),
        });
      }
    }
    out.push({
      accountId,
      accountCode,
      name: str(row.name),
      memberReason: str(row.member_reason),
      accountType: str(row.account_type),
      openingCents: cents(row.opening_cents),
      movementCents: cents(row.movement_cents),
      closingCents: cents(row.closing_cents),
      entries,
      entriesTotal: int(row.entries_total),
      entriesTruncated: row.entries_truncated === true,
    });
  }
  return out;
}

/**
 * One figure group. A body that does not carry the whole envelope is `unknown` — never a number
 * standing on its own.
 */
export function hydrateFigure(raw: unknown): FigureGroup {
  if (!isRecord(raw)) return UNKNOWN_FIGURE;
  const status = typeof raw.status === "string" && DOOR_STATUSES.includes(raw.status)
    ? (raw.status as FigureStatus)
    : "unknown";
  const per = period(raw.period);
  const unit = str(raw.unit);
  const currency = str(raw.currency);
  const definitionVersion = str(raw.definition_version);
  const sourceWatermark = str(raw.source_watermark);
  const computedAt = str(raw.computed_at);
  const coverage = raw.coverage === "ok" || raw.coverage === "partial" || raw.coverage === "unknown"
    ? raw.coverage
    : null;
  const value = cents(raw.value_cents);
  const composition = compositionRows(raw.composition);
  const compositionTotal = int(raw.composition_total);
  const compositionTruncated = raw.composition_truncated === true;

  // THE ENVELOPE IS ALL OR NOTHING for a figure that claims to be answered. A `status:'ok'` body
  // with no period, no unit or no definition version is a number this build cannot describe, and
  // rendering it would put an undated amount on an accounting board.
  const complete = per !== null && unit !== null && currency !== null
    && definitionVersion !== null && sourceWatermark !== null && computedAt !== null
    && coverage !== null;
  if (!complete) {
    return { ...UNKNOWN_FIGURE, composition, compositionTotal, compositionTruncated };
  }
  return {
    valueCents: status === "unknown" ? null : value,
    status,
    unit,
    currency,
    period: per,
    computedAt,
    definitionVersion,
    sourceWatermark,
    coverage,
    coverageReason: str(raw.coverage_reason),
    comparison: comparison(raw.comparison),
    composition,
    compositionTotal,
    compositionTruncated,
  };
}

function cashPoints(raw: unknown): CashPoint[] {
  if (!Array.isArray(raw)) return [];
  const out: CashPoint[] = [];
  for (const p of raw) {
    if (!isRecord(p)) continue;
    const asOf = str(p.as_of);
    if (asOf === null) continue;
    out.push({
      asOf,
      valueCents: cents(p.value_cents),
      // ABSENT MEANS UNAVAILABLE, not available. A point whose availability this build could not
      // read is treated as not drawable rather than drawn at whatever `value_cents` happened to be.
      available: p.available === true,
      reason: str(p.reason),
    });
  }
  return out;
}

function seriesMonths(raw: unknown): SeriesMonth[] {
  if (!Array.isArray(raw)) return [];
  const out: SeriesMonth[] = [];
  for (const m of raw) {
    if (!isRecord(m)) continue;
    const month = str(m.month);
    if (month === null) continue;
    out.push({
      month,
      incomeCents: cents(m.income_cents),
      expenseCents: cents(m.expense_cents),
      profitCents: cents(m.profit_cents),
      partial: m.partial === true,
      asOf: str(m.as_of),
    });
  }
  return out;
}

function cashSet(raw: unknown): CashSetRef | null {
  if (!isRecord(raw)) return null;
  const versionId = str(raw.version_id);
  if (versionId === null) return null;
  return {
    versionId,
    revision: int(raw.revision),
    effectiveFrom: str(raw.effective_from),
    memberCount: int(raw.member_count),
    appliedToAllPoints: raw.applied_to_all_points === true,
  };
}

export function hydrateClientFinancialPack(raw: unknown): ClientFinancialPack {
  if (!isRecord(raw)) return EMPTY_FINANCIAL_PACK;
  const cash = hydrateFigure(raw.cash);
  const per = period(raw.period);
  return {
    computedAt: str(raw.computed_at),
    period: per === null
      ? null
      : { ...per, month: str(isRecord(raw.period) ? raw.period.month : null), isMtd: isRecord(raw.period) && raw.period.is_mtd === true },
    coverageFloor: str(raw.coverage_floor),
    cash,
    profit: hydrateFigure(raw.profit),
    income: hydrateFigure(raw.income),
    expense: hydrateFigure(raw.expense),
    cashPoints: cashPoints(isRecord(raw.cash) ? raw.cash.points : null),
    cashSet: cashSet(isRecord(raw.cash) ? raw.cash.set : null),
    series: seriesMonths(raw.series),
    unmarkedClosingEntries: int(raw.unmarked_closing_entries),
    unmarkedClosingEntriesSeries: int(raw.unmarked_closing_entries_series),
    seriesCoverageReason: str(raw.series_coverage_reason),
  };
}

/**
 * The door call. `month` is `YYYY-MM-01` (a whole natural month) or null for month-to-date; the
 * door refuses anything that is not a first day, and refuses a future as-of, rather than clamping
 * either — so a malformed address becomes a visible refusal instead of a quietly different number.
 */
export async function getClientFinancialPack(
  clientId: string,
  args: { month?: string | null; asOf?: string | null } = {},
  opts: FinancialPackOptions = {},
): Promise<ClientFinancialPack> {
  const raw = await callDoor<unknown>(
    "get_client_financial_pack",
    { p_client: clientId, p_as_of: args.asOf ?? null, p_month: args.month ?? null },
    { session: opts.session, signal: opts.signal },
  );
  return hydrateClientFinancialPack(raw);
}

// =============================================================================================
// THE CASH-SET DOORS. The proposal read and the publish act, typed here beside the pack they
// govern rather than in a second module, because "which accounts are cash" and "what is cash
// worth" are one contract read from two ends.
// =============================================================================================

export type CashCandidate = {
  accountId: string;
  accountCode: string;
  name: string | null;
  isActive: boolean;
  memberReason: string;
  balanceCents: number | null;
  alreadyMember: boolean;
};

export type CashProposal = {
  asOf: string | null;
  publishedVersionId: string | null;
  candidates: CashCandidate[];
  /** The member reasons the door will NEVER propose, stated on the wire so the face can say it
   *  rather than invent it: petty cash has no structural marker in the schema and a human
   *  declares it. */
  neverProposed: string[];
};

export function hydrateCashProposal(raw: unknown): CashProposal {
  if (!isRecord(raw)) return { asOf: null, publishedVersionId: null, candidates: [], neverProposed: [] };
  const candidates: CashCandidate[] = [];
  if (Array.isArray(raw.candidates)) {
    for (const c of raw.candidates) {
      if (!isRecord(c)) continue;
      const accountId = str(c.account_id);
      const accountCode = str(c.account_code);
      const memberReason = str(c.member_reason);
      if (accountId === null || accountCode === null || memberReason === null) continue;
      candidates.push({
        accountId,
        accountCode,
        name: str(c.name),
        isActive: c.is_active === true,
        memberReason,
        balanceCents: cents(c.balance_cents),
        alreadyMember: c.already_member === true,
      });
    }
  }
  return {
    asOf: str(raw.as_of),
    publishedVersionId: str(raw.published_version_id),
    candidates,
    neverProposed: Array.isArray(raw.never_proposed)
      ? raw.never_proposed.filter((x): x is string => typeof x === "string")
      : [],
  };
}

export async function proposeClientCashAccounts(
  clientId: string,
  opts: FinancialPackOptions = {},
): Promise<CashProposal> {
  const raw = await callDoor<unknown>(
    "propose_client_cash_accounts",
    { p_client: clientId },
    { session: opts.session, signal: opts.signal },
  );
  return hydrateCashProposal(raw);
}

export type CashSetMemberInput = {
  account_id: string;
  member_reason: "bank_registry" | "declared_cash" | "declared_petty_cash";
};

/** ONE array, and its ORDER IS THE ORDINAL — 0232's own argument shape. Two parallel arrays would
 *  make a length mismatch a runtime class of bug; one array makes it unrepresentable. */
export async function publishClientCashAccountSet(
  clientId: string,
  members: CashSetMemberInput[],
  args: { effectiveFrom?: string | null; opKey: string },
  opts: FinancialPackOptions = {},
): Promise<unknown> {
  return callDoor<unknown>(
    "publish_client_cash_account_set",
    {
      p_client: clientId,
      p_members: members,
      p_effective_from: args.effectiveFrom ?? null,
      p_op_key: args.opKey,
    },
    { session: opts.session, signal: opts.signal },
  );
}
