// Pure helpers for the autopost-rule management surface (contract §6 / §7). No DB, no
// React — unit-testable. The UI computes NO financial number here: bound amounts come
// from the DB (fmtCents at the render layer); these helpers only classify lifecycle
// urgency by DATE (a renew-or-retire nudge is a date comparison, WA2-R10) and shape
// human copy. The hard expiry itself is a DB bound — this is only the visible nudge.

import type { AutopostRule } from "../shared/reviewCardTypes";

export type RuleUrgency = "proposed" | "live" | "expiring" | "expired" | "terminal";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Days from `now` until `expiresAt` (negative once past). `null` when unparseable. */
export function daysUntil(expiresAt: string | null, now: Date): number | null {
  if (!expiresAt) return null;
  const t = Date.parse(expiresAt);
  if (Number.isNaN(t)) return null;
  return Math.ceil((t - now.getTime()) / DAY_MS);
}

/** True when a LIVE rule is within `withinDays` of its hard expiry (or already past) —
 *  the ¾-term renew-or-retire nudge surface (WA2-R10 default nudge at 9 months). */
export function isExpiringSoon(rule: AutopostRule, now: Date, withinDays = 30): boolean {
  if (rule.status !== "live") return false;
  const d = daysUntil(rule.expires_at, now);
  return d !== null && d <= withinDays;
}

/** Lifecycle band for a rule (shape + label, never hue-only — DIRECTION §3). */
export function ruleUrgency(rule: AutopostRule, now: Date): RuleUrgency {
  if (rule.status === "proposed") return "proposed";
  if (rule.status === "live") {
    const d = daysUntil(rule.expires_at, now);
    if (d !== null && d < 0) return "expired";
    if (d !== null && d <= 30) return "expiring";
    return "live";
  }
  return "terminal"; // retired | declined | expired-terminal
}

/** A human summary of the count bound, e.g. `≤3 posts / monthly`. Pure string. */
export function windowLabel(rule: AutopostRule): string {
  const n = rule.window_max_posts;
  const w = rule.frequency_window;
  if (n === null && !w) return "no window bound";
  return `≤${n ?? "?"} posts${w ? ` / ${w}` : ""}`;
}

/** How many posts remain in the current window — read STRAIGHT from the DB
 *  (`list_autopost_rules` emits `posts_remaining`). The UI does not recompute it: the DB
 *  owns every number, counts included, so the window arithmetic stays in one place and
 *  can't drift from the DB's own definition. `null` when the DB did not supply it. */
export function postsRemaining(rule: AutopostRule): number | null {
  return rule.posts_remaining;
}

/** Whether a rule can be signed live (proposed only — admin+ enforced in the DB). */
export function canSign(rule: AutopostRule): boolean {
  return rule.status === "proposed";
}

/** Whether a rule can be retired (proposed or live — terminal rows are inert). */
export function canRetire(rule: AutopostRule): boolean {
  return rule.status === "proposed" || rule.status === "live";
}

// ---------------------------------------------------------------------------
// §7-A(b) — the signing-time evidence preview (skeleton §2b; contract §3
// PR-DASHBOARD). `clara.preview_ocr_sales_evidence(p_rule)` — a SECURITY
// DEFINER read, viewer-floored and firm-scoped like `list_autopost_rules`
// (migration 0046 §SECTION 6). Pure mapper + labels only, no network — the
// RPC call itself lives in `../shared/reviewApi.ts` (`previewOcrSalesEvidence`),
// the same split `adjustmentApi.ts`/`adjustmentModel.ts` already uses.
//
// ADVISORY, NEVER AUTHORITY: `sign_autopost_rule` and `execute_rule_post` each
// re-derive the live floor themselves at their own moment; this verb calls the
// SAME centralised floor (`clara._ocr_sales_floor`, caller four of four) and is
// a snapshot with a timestamp on it. The render must say so.
//
// THREE render states, never collapsed into one silence:
//   ready           — applicable:true — the four counts + thresholds + the
//                      tax-silent gap, integers only (never `fmtCents` — these
//                      are document counts, not money, skeleton §2b).
//   not-applicable  — applicable:false — a DB-RETURNED verdict (wrong rule
//                      class / evidence class / inaccessible rule) — a quiet
//                      single line, never an error.
//   unavailable     — the RPC THREW, or the envelope came back shaped like
//                      NEITHER branch this mapper recognises (the verb not yet
//                      deployed, a network failure) — fail quiet, never block
//                      the panel (the dashboard may deploy ahead of 0046, the
//                      assetsApi.ts posture).
// ---------------------------------------------------------------------------

function s(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

/** [Codex HIGH, 2026-08-07] Every count `clara.preview_ocr_sales_evidence` emits is a
 *  real Postgres integer (`count(...)::int`, a literal 6/60, `_ocr_sales_floor`'s own
 *  `int` columns — 0046 §SECTION 6) — never a string, a fraction, or an out-of-range
 *  value. A string/fraction/NaN/Infinity/negative arriving here is a CONTRACT
 *  VIOLATION, not an input to coerce: `numOrNull(v) ?? 0` (the shape this replaces)
 *  would have the UI INVENT a zero and print "floor not yet met" against a figure
 *  nobody measured — exactly what "the DB owns every number" forbids. `null` here
 *  means "reject", and every call site below folds a `null` into the WHOLE preview
 *  failing to `null` (the same unavailable state an RPC throw produces). */
function strictNonNegInt(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && Number.isInteger(v) && v >= 0 ? v : null;
}

export type SalesEvidencePreviewRequired = {
  qualifying: number; distinct_invoices: number; corroborated: number; span_days: number;
};

export type SalesEvidencePreviewApplicable = {
  applicable: true;
  rule_id: string;
  client_id: string | null;
  counterparty_id: string | null;
  account_code: string | null;
  rule_status: string | null;
  qualifying: number;
  distinct_invoices: number;
  corroborated: number;
  /** null when the population is empty — the floor's own `v_span` is unaggregated then. */
  span_days: number | null;
  /** Distinct documents among the QUALIFYING population that fail corroboration —
   *  computed ONCE in the DB from `_ocr_sales_floor_pop`, the SAME population the
   *  floor itself aggregates (0046 §SECTION 6). Never re-derived here. */
  tax_silent_documents: number;
  required: SalesEvidencePreviewRequired;
  floor_met: boolean;
  evaluated_at: string | null;
  /** The envelope's OWN `advisory` flag (0046 §SECTION 6 emits `'advisory',true` on
   *  every branch). The panel's "Advisory — the sign act re-checks the live floor"
   *  banner is conditioned on THIS field, not hardcoded prose — so the claim has a
   *  data provenance and a future envelope that drops or flips the flag changes
   *  what renders, rather than the UI asserting something the DB no longer says. */
  advisory: boolean;
};

export type SalesEvidencePreviewNotApplicable = {
  applicable: false;
  rule_id: string;
  /** 'rule_not_accessible' | 'not_sales' | 'not_ocr_sales' — the pinned vocabulary
   *  (0046 §SECTION 6); an unnamed token still renders via its own text. */
  reason: string;
  /** Present only on `not_ocr_sales`; null on the other two reasons. */
  evidence_class: string | null;
  evaluated_at: string | null;
};

export type SalesEvidencePreview = SalesEvidencePreviewApplicable | SalesEvidencePreviewNotApplicable;

/** [Codex HIGH, 2026-08-07] `required`'s four fields come from the ENVELOPE — never
 *  a hardcoded 6/6/6/60 fallback. The migration's literal 6/6/6/60 is the CURRENT
 *  contract value, not a client-side assumption this mapper is entitled to
 *  substitute when the envelope is silent or malformed; a missing `required`
 *  object, a missing sub-field, or a sub-field that fails the strict integer test
 *  is a shape defect and fails the WHOLE mapping (returns `null`), exactly like
 *  every other strict field below. */
function toSalesEvidencePreviewRequired(raw: unknown): SalesEvidencePreviewRequired | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const qualifying = strictNonNegInt(o.qualifying);
  if (qualifying === null) return null;
  const distinctInvoices = strictNonNegInt(o.distinct_invoices);
  if (distinctInvoices === null) return null;
  const corroborated = strictNonNegInt(o.corroborated);
  if (corroborated === null) return null;
  const spanDays = strictNonNegInt(o.span_days);
  if (spanDays === null) return null;
  return { qualifying, distinct_invoices: distinctInvoices, corroborated, span_days: spanDays };
}

/** `clara.preview_ocr_sales_evidence`'s jsonb, mapped STRICTLY. Returns `null` on
 *  ANY shape violation, in either branch — a wrong-shaped `rule_id`/`applicable`
 *  discriminant (0046 §SECTION 6 carries both on every branch), or — on the
 *  applicable branch specifically — a count, a `required` threshold, `floor_met`,
 *  `advisory`, or `evaluated_at` that fails its strict test. `null` folds into the
 *  SAME "preview unavailable" state an RPC throw produces (the `adjustmentModel`
 *  shape-law extended here): a wrong shape reads as unknown, never as a confident
 *  verdict, and NEVER as a coerced number the UI would print as if the DB said it.
 *
 *  [Codex HIGH, 2026-08-07] This replaces an earlier build that defaulted absent/
 *  malformed counts to `0` and absent `required` to the CURRENT literal 6/6/6/60 —
 *  both are the exact failure this file's own house law forbids: "the DB owns
 *  every number; the agent/UI never computes or invents one." A missing count is
 *  not "zero of them"; it is an envelope this build cannot honestly read. */
export function toSalesEvidencePreview(raw: unknown): SalesEvidencePreview | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const ruleId = s(o.rule_id);
  if (ruleId === null || typeof o.applicable !== "boolean") return null;

  if (!o.applicable) {
    return {
      applicable: false,
      rule_id: ruleId,
      reason: s(o.reason) ?? "unknown",
      evidence_class: s(o.evidence_class),
      evaluated_at: s(o.evaluated_at),
    };
  }

  const qualifying = strictNonNegInt(o.qualifying);
  if (qualifying === null) return null;
  const distinctInvoices = strictNonNegInt(o.distinct_invoices);
  if (distinctInvoices === null) return null;
  const corroborated = strictNonNegInt(o.corroborated);
  if (corroborated === null) return null;
  const taxSilentDocuments = strictNonNegInt(o.tax_silent_documents);
  if (taxSilentDocuments === null) return null;
  // span_days is the ONLY nullable count (an empty population leaves the floor's
  // own span unaggregated) — accept an EXPLICIT null, but hold any non-null value
  // to the SAME strict integer test, and treat a MISSING key as a violation too:
  // the envelope always emits this key (0046 §SECTION 6's jsonb_build_object
  // includes it even when the underlying SQL value is NULL), so `undefined` here
  // means the shape drifted, not that the population happens to be empty.
  const spanDaysRaw = o.span_days;
  const spanDays = spanDaysRaw === null ? null : strictNonNegInt(spanDaysRaw);
  if (spanDaysRaw !== null && spanDays === null) return null;
  const required = toSalesEvidencePreviewRequired(o.required);
  if (required === null) return null;
  const floorMet = o.floor_met;
  if (typeof floorMet !== "boolean") return null;
  const advisory = o.advisory;
  if (typeof advisory !== "boolean") return null;
  const evaluatedAt = s(o.evaluated_at);
  if (evaluatedAt === null) return null;

  return {
    applicable: true,
    rule_id: ruleId,
    client_id: s(o.client_id),
    counterparty_id: s(o.counterparty_id),
    account_code: s(o.account_code),
    rule_status: s(o.rule_status),
    qualifying,
    distinct_invoices: distinctInvoices,
    corroborated,
    span_days: spanDays,
    tax_silent_documents: taxSilentDocuments,
    required,
    floor_met: floorMet,
    evaluated_at: evaluatedAt,
    advisory,
  };
}

/** Not-applicable reasons, glossed for the quiet single-line state (skeleton §2b:
 *  "Returns not-applicable for non-sales / non-`ocr_sales` / inaccessible rules").
 *  An unnamed reason still renders, by its own token — the house law every other
 *  gloss in this directory follows (`blockedReasonLabel`, `proposeRefusalLabel`). */
export function salesEvidenceNotApplicableLabel(p: SalesEvidencePreviewNotApplicable): string {
  if (p.reason === "not_sales") return "not a sales-direction rule — no evidence preview.";
  if (p.reason === "not_ocr_sales") {
    return `structured (non-OCR) sales rule — the evidence floor does not apply${p.evidence_class ? ` (evidence class: ${p.evidence_class})` : ""}.`;
  }
  if (p.reason === "rule_not_accessible") return "evidence preview unavailable for this rule.";
  return `evidence preview: ${p.reason}.`;
}

/** The tax-silent gap, IN THE DB'S OWN NUMBER: `tax_silent_documents` is the
 *  qualifying population minus the ones that corroborate, computed ONCE in the
 *  DB from the SAME rows the floor itself aggregates (0046 §SECTION 6 — "one
 *  predicate, one place, two consumers"). This label never re-subtracts
 *  `qualifying - corroborated` on its own: the two counts can be measured
 *  against different populations by design (§SECTION 6's Codex correction), so
 *  a client-side subtraction could silently drift from the DB's own gap. `null`
 *  when there is nothing to call out. */
export function taxSilentGapLabel(p: SalesEvidencePreviewApplicable): string | null {
  const n = p.tax_silent_documents;
  if (n <= 0) return null;
  return `${n} qualifying document${n === 1 ? "" : "s"} cannot corroborate — tax-silent document${n === 1 ? "" : "s"}.`;
}

/** The panel's own fetch state for the preview — pure shape, no network. `loading`
 *  is the pre-first-paint state (renders nothing, so the panel never flashes a
 *  wrong verdict before the read resolves); `unavailable` covers BOTH an RPC throw
 *  and a shape `toSalesEvidencePreview` did not recognise (the same fold — see
 *  that mapper's header); `ready` carries whichever of the verb's two branches
 *  came back, applicable or not. */
export type SalesEvidencePreviewFetch =
  | { kind: "loading" }
  | { kind: "unavailable"; error: string | null }
  | { kind: "ready"; preview: SalesEvidencePreview };
