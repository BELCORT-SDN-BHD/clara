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
function numOrNull(v: unknown): number | null {
  return typeof v === "number" ? v : null;
}
function rec(v: unknown): Record<string, unknown> {
  return (v ?? {}) as Record<string, unknown>;
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

const DEFAULT_REQUIRED: SalesEvidencePreviewRequired = { qualifying: 6, distinct_invoices: 6, corroborated: 6, span_days: 60 };

function toSalesEvidencePreviewRequired(raw: unknown): SalesEvidencePreviewRequired {
  const o = rec(raw);
  return {
    qualifying: numOrNull(o.qualifying) ?? DEFAULT_REQUIRED.qualifying,
    distinct_invoices: numOrNull(o.distinct_invoices) ?? DEFAULT_REQUIRED.distinct_invoices,
    corroborated: numOrNull(o.corroborated) ?? DEFAULT_REQUIRED.corroborated,
    span_days: numOrNull(o.span_days) ?? DEFAULT_REQUIRED.span_days,
  };
}

/** `clara.preview_ocr_sales_evidence`'s jsonb, mapped defensively. Returns `null`
 *  when the envelope is shaped like NEITHER branch the verb is documented to
 *  return (every branch carries a string `rule_id` and a boolean `applicable` —
 *  0046 §SECTION 6) — the caller folds that into the same "preview unavailable"
 *  state an RPC throw produces, the `adjustmentModel` shape-law extended here: a
 *  wrong shape reads as unknown, never as a confident verdict either way. */
export function toSalesEvidencePreview(raw: unknown): SalesEvidencePreview | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const ruleId = s(o.rule_id);
  if (ruleId === null || typeof o.applicable !== "boolean") return null;
  if (o.applicable) {
    return {
      applicable: true,
      rule_id: ruleId,
      client_id: s(o.client_id),
      counterparty_id: s(o.counterparty_id),
      account_code: s(o.account_code),
      rule_status: s(o.rule_status),
      qualifying: numOrNull(o.qualifying) ?? 0,
      distinct_invoices: numOrNull(o.distinct_invoices) ?? 0,
      corroborated: numOrNull(o.corroborated) ?? 0,
      span_days: numOrNull(o.span_days),
      tax_silent_documents: numOrNull(o.tax_silent_documents) ?? 0,
      required: toSalesEvidencePreviewRequired(o.required),
      floor_met: o.floor_met === true,
      evaluated_at: s(o.evaluated_at),
    };
  }
  return {
    applicable: false,
    rule_id: ruleId,
    reason: s(o.reason) ?? "unknown",
    evidence_class: s(o.evidence_class),
    evaluated_at: s(o.evaluated_at),
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
