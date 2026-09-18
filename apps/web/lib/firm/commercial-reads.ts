// #635 (refresh spec; journey H) — the three reads behind `/settings/firm`:
// `clara.get_firm_legal_standing()`, `clara.get_firm_commercial_state()` and
// `clara.get_firm_ai_usage(p_period)` (migration 0233_firm_commercial_settings.sql).
//
// ALL THREE RIDE `callDoor` AND ARE LABELLED AS READS at their call sites — the convention
// `lib/registration/legal-reads.ts` and `lib/settings/preferences.ts` already state: a
// read-flavoured RPC uses the door transport but is not a governed act, and nothing here treats
// an answer as a receipt. The one governed act on this page is `accept_legal_document`, and it
// lives in `lib/registration/legal-doors.ts`, unchanged and unforked.
//
// POSITIVE-SHAPE DECODERS, AND AN UNREADABLE ROW IS DROPPED. Transport output is untrusted
// until every field's shape is positively checked (`isLegalDocumentRow`'s discipline, which this
// module copies deliberately rather than inventing a second one). A legal entry this build
// cannot read is DROPPED rather than half-rendered: a standing card that painted a partial row
// would be telling a firm something about its own agreements that it could not vouch for.
//
// WHAT THIS MODULE DELIBERATELY DOES NOT DO:
//  · it never re-derives `standing_live` from the rows. The DOOR computes it, from the same
//    literal predicate `clara._accounting_work_egress_live` uses (0195:890-906), and a second
//    derivation here would be free to disagree with the wall that actually governs model egress;
//  · it never converts a currency (`commercial-format.ts` says why);
//  · it carries no legal `body` and no digest. Those stay `lib/registration/legal-reads.ts`'s,
//    read from `clara.get_current_legal_documents()` at the moment the dialog opens, so the
//    bytes a person accepts are the bytes the acceptance door hashes.

import { callDoor, type CallDoorOptions } from "@/lib/doors";
import { LEGAL_KINDS, isLegalKind, type LegalKind } from "@/lib/registration/legal-reads";

/** The doors, by exact name. Constants so a cell asserts the SPELLING this module calls rather
 *  than re-typing it (review law 3). */
export const FIRM_LEGAL_STANDING_DOOR = "get_firm_legal_standing";
export const FIRM_COMMERCIAL_STATE_DOOR = "get_firm_commercial_state";
export const FIRM_AI_USAGE_DOOR = "get_firm_ai_usage";

// ───────────────────────────────────────────────────────────────────────────
// LEGAL STANDING
// ───────────────────────────────────────────────────────────────────────────

export type LegalStandingStatus = "published" | "draft" | "superseded";

export type LegalStandingDocument = {
  readonly kind: LegalKind;
  readonly version: number;
  readonly status: LegalStandingStatus;
  readonly title: string;
  readonly effectiveFrom: string | null;
  readonly publishedAt: string | null;
  /** THE FIRM's fact: an ACTIVE OWNER of this firm accepted THIS version. Never masked. */
  readonly firmAccepted: boolean;
  /** The attribution triple. All three are NULL below bookkeeper — the door masks them, this
   *  module does not, and a card must not infer "nobody accepted" from a masked NULL: that is
   *  what `firmAccepted` is for. */
  readonly acceptedAt: string | null;
  readonly acceptedBy: string | null;
  readonly acceptedByName: string | null;
  /** The CALLER's own acceptance of this exact version, at every rank. */
  readonly myAcceptedVersion: number | null;
  readonly myAcceptedAt: string | null;
};

export type FirmLegalStanding = {
  readonly documents: readonly LegalStandingDocument[];
  readonly standingLive: boolean;
  readonly canAcceptForFirm: boolean;
  readonly masked: boolean;
};

function isNullableString(v: unknown): v is string | null {
  return v === null || typeof v === "string";
}

function isNullableInteger(v: unknown): v is number | null {
  return v === null || (typeof v === "number" && Number.isInteger(v));
}

function toLegalStandingDocument(raw: unknown): LegalStandingDocument | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (!isLegalKind(r.kind)) return null;
  if (typeof r.version !== "number" || !Number.isInteger(r.version)) return null;
  if (r.status !== "published" && r.status !== "draft" && r.status !== "superseded") return null;
  if (typeof r.title !== "string" || r.title.length === 0) return null;
  if (typeof r.firm_accepted !== "boolean") return null;
  if (!isNullableString(r.effective_from)) return null;
  if (!isNullableString(r.published_at)) return null;
  if (!isNullableString(r.accepted_at)) return null;
  if (!isNullableString(r.accepted_by)) return null;
  if (!isNullableString(r.accepted_by_name)) return null;
  if (!isNullableInteger(r.my_accepted_version)) return null;
  if (!isNullableString(r.my_accepted_at)) return null;
  return {
    kind: r.kind,
    version: r.version,
    status: r.status,
    title: r.title,
    effectiveFrom: r.effective_from,
    publishedAt: r.published_at,
    firmAccepted: r.firm_accepted,
    acceptedAt: r.accepted_at,
    acceptedBy: r.accepted_by,
    acceptedByName: r.accepted_by_name,
    myAcceptedVersion: r.my_accepted_version,
    myAcceptedAt: r.my_accepted_at,
  };
}

/** THE THREE SCALARS ARE REQUIRED, and a payload missing one is a payload this build will not
 *  render. `standing_live` in particular: defaulting it to `false` would paint the alarming face
 *  on a read failure, and defaulting it to `true` would hide a real withdrawal. Neither is
 *  honest, so the whole read fails and the error banner says so. */
export function decodeFirmLegalStanding(raw: unknown): FirmLegalStanding | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.standing_live !== "boolean") return null;
  if (typeof r.can_accept_for_firm !== "boolean") return null;
  if (typeof r.masked !== "boolean") return null;
  const rows = Array.isArray(r.documents) ? r.documents : [];
  const documents = rows
    .map(toLegalStandingDocument)
    .filter((d): d is LegalStandingDocument => d !== null);
  return {
    documents: sortByKindOrder(documents),
    standingLive: r.standing_live,
    canAcceptForFirm: r.can_accept_for_firm,
    masked: r.masked,
  };
}

/** Terms first, then the DPA — `LEGAL_KINDS`' own order, which is the order the signup stage
 *  presents them in. One list, not two ideas of "which comes first". */
function sortByKindOrder(documents: LegalStandingDocument[]): LegalStandingDocument[] {
  return [...documents].sort((a, b) => LEGAL_KINDS.indexOf(a.kind) - LEGAL_KINDS.indexOf(b.kind));
}

export async function loadFirmLegalStanding(opts: CallDoorOptions = {}): Promise<FirmLegalStanding> {
  const raw = await callDoor<unknown>(FIRM_LEGAL_STANDING_DOOR, {}, opts);
  const decoded = decodeFirmLegalStanding(raw);
  if (decoded === null) throw new Error("get_firm_legal_standing returned a payload this build cannot read");
  return decoded;
}

// ───────────────────────────────────────────────────────────────────────────
// COMMERCIAL STATE
// ───────────────────────────────────────────────────────────────────────────

export type FirmCommercialState = {
  readonly firm: {
    readonly id: string;
    readonly name: string;
    readonly createdAt: string | null;
    readonly isOperator: boolean;
  };
  readonly plan: {
    readonly localKey: string;
    readonly name: string;
    readonly currency: string;
    readonly amountCents: number;
    /** THE RENDER CONDITION, not a hint. `false` means the database has not been told what this
     *  plan costs, so no figure may appear anywhere on the card (C-01 / C-56). A later owner
     *  ruling that sets an amount shows it with no code change. */
    readonly amountsRuled: boolean;
  };
  readonly payment: {
    readonly recorded: boolean;
    readonly recordedAt: string | null;
    readonly subscriptionPresent: boolean;
    readonly customerPresent: boolean;
  };
  readonly invoices: { readonly available: boolean; readonly reason: string | null };
  /** The firm's STORED processing caps. Every number is nullable: a firm with no
   *  `clara.firm_document_limits` row has no stored cap, and the enforcing doors apply their own
   *  built-in fallbacks (0090:422-436). Rendering the table's column defaults as though they
   *  were this firm's caps would be publishing a number nobody stored. */
  readonly capacity: {
    readonly docsPerDay: number | null;
    readonly pagesPerDay: number | null;
    readonly ocrConcurrency: number | null;
    readonly llmWitnessConcurrency: number | null;
    readonly source: string;
  };
};

function nullableInt(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) ? v : null;
}

export function decodeFirmCommercialState(raw: unknown): FirmCommercialState | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const firm = r.firm as Record<string, unknown> | undefined;
  const plan = r.plan as Record<string, unknown> | undefined;
  const payment = r.payment as Record<string, unknown> | undefined;
  const invoices = r.invoices as Record<string, unknown> | undefined;
  const capacity = r.capacity as Record<string, unknown> | undefined;
  if (!firm || !plan || !payment || !invoices || !capacity) return null;
  if (typeof firm.id !== "string" || firm.id.length === 0) return null;
  if (typeof firm.name !== "string" || firm.name.length === 0) return null;
  if (typeof plan.local_key !== "string" || typeof plan.name !== "string") return null;
  if (typeof plan.currency !== "string") return null;
  if (typeof plan.amounts_ruled !== "boolean") return null;
  if (typeof payment.recorded !== "boolean") return null;
  if (typeof invoices.available !== "boolean") return null;
  // `amount_cents` is a bigint on the wire and PostgREST may send it as a JSON number or as a
  // string; both are decoded, and anything else drops the whole payload rather than rendering a
  // NaN into a money position.
  const amountCents =
    typeof plan.amount_cents === "number" ? plan.amount_cents
    : typeof plan.amount_cents === "string" && /^-?\d+$/.test(plan.amount_cents) ? Number(plan.amount_cents)
    : null;
  if (amountCents === null || !Number.isSafeInteger(amountCents)) return null;
  return {
    firm: {
      id: firm.id,
      name: firm.name,
      createdAt: typeof firm.created_at === "string" ? firm.created_at : null,
      isOperator: firm.is_operator === true,
    },
    plan: {
      localKey: plan.local_key,
      name: plan.name,
      currency: plan.currency,
      amountCents,
      amountsRuled: plan.amounts_ruled,
    },
    payment: {
      recorded: payment.recorded,
      recordedAt: typeof payment.recorded_at === "string" ? payment.recorded_at : null,
      subscriptionPresent: payment.subscription_present === true,
      customerPresent: payment.customer_present === true,
    },
    invoices: {
      available: invoices.available,
      reason: typeof invoices.reason === "string" ? invoices.reason : null,
    },
    capacity: {
      docsPerDay: nullableInt(capacity.docs_per_day),
      pagesPerDay: nullableInt(capacity.pages_per_day),
      ocrConcurrency: nullableInt(capacity.ocr_concurrency),
      llmWitnessConcurrency: nullableInt(capacity.llm_witness_concurrency),
      source: typeof capacity.source === "string" ? capacity.source : "firm_document_limits",
    },
  };
}

export async function loadFirmCommercialState(opts: CallDoorOptions = {}): Promise<FirmCommercialState> {
  const raw = await callDoor<unknown>(FIRM_COMMERCIAL_STATE_DOOR, {}, opts);
  const decoded = decodeFirmCommercialState(raw);
  if (decoded === null) throw new Error("get_firm_commercial_state returned a payload this build cannot read");
  return decoded;
}

// ───────────────────────────────────────────────────────────────────────────
// MODEL USAGE
// ───────────────────────────────────────────────────────────────────────────

export type UsageScope = "firm" | "platform";

export type FirmUsageRow = {
  readonly scope: UsageScope;
  readonly callKind: string;
  readonly calls: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly pricedCalls: number;
  readonly unpricedCalls: number;
  readonly spendCents: number;
  /** The door's own literal, read from `llm_price_table`'s CHECK (0110:497). Carried per row
   *  rather than hoisted: a future widening of that CHECK must arrive here as data, not as a
   *  constant this module believes. */
  readonly priceCurrency: string;
};

/** Every count is a `bigint` on the wire, which PostgREST sends as a string. A row whose numbers
 *  this build cannot read is DROPPED — a usage table with one silently-zeroed row is worse than
 *  a table missing it, because the total would look complete. */
function bigintish(v: unknown): number | null {
  if (typeof v === "number" && Number.isSafeInteger(v)) return v;
  if (typeof v === "string" && /^-?\d+$/.test(v)) {
    const n = Number(v);
    return Number.isSafeInteger(n) ? n : null;
  }
  return null;
}

export function decodeFirmUsageRow(raw: unknown): FirmUsageRow | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (r.scope !== "firm" && r.scope !== "platform") return null;
  if (typeof r.call_kind !== "string" || r.call_kind.length === 0) return null;
  if (typeof r.price_currency !== "string" || r.price_currency.length === 0) return null;
  const calls = bigintish(r.calls);
  const inputTokens = bigintish(r.input_tokens);
  const outputTokens = bigintish(r.output_tokens);
  const pricedCalls = bigintish(r.priced_calls);
  const unpricedCalls = bigintish(r.unpriced_calls);
  const spendCents = bigintish(r.spend_cents);
  if (calls === null || inputTokens === null || outputTokens === null) return null;
  if (pricedCalls === null || unpricedCalls === null || spendCents === null) return null;
  return {
    scope: r.scope,
    callKind: r.call_kind,
    calls,
    inputTokens,
    outputTokens,
    pricedCalls,
    unpricedCalls,
    spendCents,
    priceCurrency: r.price_currency,
  };
}

export function decodeFirmUsageRows(raw: unknown): FirmUsageRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(decodeFirmUsageRow).filter((r): r is FirmUsageRow => r !== null);
}

/** `p_period` is a `date` the door bins to its own month; this module sends the first day of the
 *  requested month and never a "today". The door's window is UTC-derived (0110:711-712 + :750)
 *  and `usage-period.ts` is where that is said in the surface's words. */
export async function loadFirmAiUsage(period: string, opts: CallDoorOptions = {}): Promise<FirmUsageRow[]> {
  const raw = await callDoor<unknown>(FIRM_AI_USAGE_DOOR, { p_period: period }, opts);
  return decodeFirmUsageRows(raw);
}
