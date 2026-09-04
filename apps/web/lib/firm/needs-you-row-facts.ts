// WHAT / WHY / NEXT / WHEN — the four questions every Needs-you row must answer
// (E-3 / CB-AE2E-026; the owner's "agent task 没有更多交互 and 细节").
//
// EVERY ANSWER BELOW IS A COLUMN clara.list_review_queue ALREADY SHIPS. Nothing
// here is a new read, a new number, or a sentence the DB did not support — this
// module only decides WHICH of the row's own flags is the honest reason, and
// hands the caller a message KEY for it. `lib/firm/needs-you.ts` stays the one
// module that grounds the row shape against the live body; this one grounds the
// MEANING of four columns that were read and never rendered.
//
// THE LIVE BODY, COLUMN BY COLUMN (0016_a21_compliance_watch.sql:4592-4665 plus
// the 0017/0041/0043/0146 splices — the same chain needs-you.ts's header traces):
//
//   `lane`   — 'ready' | 'needs_review' | 'needs_you' for draft and
//              uncoded_filing rows (`clara._coding_lane_core`, lib/coding/
//              types.ts's `CodingLane`); the LITERAL 'needs_you' for
//              open_question (0016:4632); and NULL for coding_task (0016:4644),
//              compliance_watch (0016:4657), lint_finding (0017:604),
//              fixed_asset_incomplete (0041), staff_advance_incomplete (0043)
//              and seeding_proposal (0146:263). A NULL lane is not "unknown" —
//              it is the DB saying this kind is not lane-classified at all, so
//              the reason falls back to the row's own `section`.
//   `auto`   — TRUE on exactly one kind: an open_question whose `opener_kind`
//              is 'wake' (0016:4633), i.e. Clara raised it unattended. FALSE by
//              construction everywhere else.
//   `rule_backed` — draft: a `rule_decisions` row matched the account
//              (0016:4596-4597); uncoded_filing: the lane's own reasons array
//              contains 'rule_backed' (0016:4617); open_question:
//              `spawned_rule_id is not null` (0016:4633). FALSE elsewhere.
//   `tier`   — TWO VOCABULARIES ON ONE COLUMN, which is why the label below is
//              keyed by (row_kind, value) and never by value alone:
//              compliance_watch carries `compliance_watches.state`
//              ('monitored'|'early_warning'|'crossed'|'overdue' — 'resolved' is
//              filtered out by the CTE's own WHERE, 0016:306 for the CHECK),
//              and lint_finding carries `lint_findings.severity`
//              ('info'|'warn'|'critical', 0017:1327). NULL on every other kind.
//   `high_stakes` — draft: `clara.is_high_stakes(entry)`; uncoded_filing: the
//              lane reason 'high_stakes'. FALSE elsewhere. **裁-187 NOTE:** the
//              maker-checker wall this flag used to gate is ABOLISHED, so the
//              copy keyed off it names the DB's own flag and must NEVER claim a
//              second approver is required. The column is still DB-owned and
//              still worth showing; the consequence it used to have is gone.
//   `aged_since` — the row's own start-of-waiting instant, per kind: a draft's
//              `created_at`, a filing's `filed_at`, a question's `opened_at`, a
//              task's/watch's `created_at`, a finding's `opened_at`, a seeding
//              batch's OLDEST open proposal (0146:264). Read and rendered
//              NOWHERE before this train.
//   `period` — THREE MEANINGS, ONE WORD, which is the defect: a draft's
//              `posting_date` (0016:4602), a filing's invoice date out of
//              `_invoice_fact_state` (0016:4620), a watch's `window_end`
//              (0016:4658). NULL on every other kind.
//
// THERE IS NO DEADLINE COLUMN ON THIS QUEUE. `aged_since` says when waiting
// STARTED; nothing says when anything is DUE. The copy therefore says "waiting
// since" and "waiting N days", never "due" — the statutory-deadline feed that
// would own a due date is itself not built (NeedsYou.statutoryDeadlinesNotBuilt).

import type { ReviewQueueRow } from "./needs-you";

/** The lane values that carry a reason of their own. A lane outside this set
 *  falls through to the section-derived reason rather than reaching `t()` with
 *  a key path (the `isKnownReviewQueueRowKind` discipline). */
export const REVIEW_QUEUE_LANES = ["ready", "needs_review", "needs_you"] as const;
export type ReviewQueueLane = (typeof REVIEW_QUEUE_LANES)[number];

export function isKnownReviewQueueLane(lane: string): lane is ReviewQueueLane {
  return (REVIEW_QUEUE_LANES as readonly string[]).includes(lane);
}

/** The five WHY sentences, in precedence order. Exactly one is chosen per row,
 *  and each one is true of every row that selects it. */
export const REVIEW_QUEUE_WHY_KEYS = [
  "laneNeedsYou",
  "laneNeedsReview",
  "laneReady",
  "sectionNeedsYou",
  "sectionNeedsReview",
] as const;
export type ReviewQueueWhyKey = (typeof REVIEW_QUEUE_WHY_KEYS)[number];

/**
 * The ONE derived reason. The lane is preferred when the DB classified this row
 * into one, because that IS the classification that put it here; a NULL lane
 * (the six kinds the queue never lane-classifies) falls back to the row's own
 * `section`, which the live body derives per kind and is therefore still the
 * DB's own judgement rather than this module's.
 */
export function reviewQueueWhyKey(row: Pick<ReviewQueueRow, "lane" | "section">): ReviewQueueWhyKey {
  const lane = row.lane;
  if (lane !== null && isKnownReviewQueueLane(lane)) {
    if (lane === "needs_you") return "laneNeedsYou";
    if (lane === "needs_review") return "laneNeedsReview";
    return "laneReady";
  }
  return row.section === "needs_you" ? "sectionNeedsYou" : "sectionNeedsReview";
}

/**
 * The two boolean flags that answer WHY THIS IS IN FRONT OF ME and were read
 * but never rendered. A chip appears only when its column is TRUE — never a
 * "not rule-backed" chip, which would be this module asserting an absence
 * (review law 2).
 *
 * `high_stakes` is deliberately NOT here. It answers a different question (how
 * much does this one matter), it is already rendered as its own badge on the
 * row, and duplicating it into the reason chips would say the same thing twice.
 */
export const REVIEW_QUEUE_WHY_CHIPS = ["auto", "ruleBacked"] as const;
export type ReviewQueueWhyChip = (typeof REVIEW_QUEUE_WHY_CHIPS)[number];

export function reviewQueueWhyChips(
  row: Pick<ReviewQueueRow, "auto" | "rule_backed">,
): ReviewQueueWhyChip[] {
  const chips: ReviewQueueWhyChip[] = [];
  if (row.auto === true) chips.push("auto");
  if (row.rule_backed === true) chips.push("ruleBacked");
  return chips;
}

/** The two `tier` vocabularies, each under the row_kind that owns it. A value
 *  outside its kind's list — or a tier on a kind with no vocabulary at all —
 *  renders RAW, honestly, never a key path and never another kind's label. */
export const REVIEW_QUEUE_TIER_VOCABULARY = {
  compliance_watch: ["monitored", "early_warning", "crossed", "overdue"],
  lint_finding: ["info", "warn", "critical"],
} as const satisfies Record<string, readonly string[]>;

export type ReviewQueueTierScope = keyof typeof REVIEW_QUEUE_TIER_VOCABULARY;

/** The CLOSED set of `<row_kind>.<tier>` pairs, derived from the vocabulary
 *  above rather than retyped — so the caller's `t(\`tier.${key}\`)` is a
 *  statically-valid next-intl key by construction and a cast is never needed
 *  (FIX-1's discipline, applied to the second two-level lookup on this row). */
export type ReviewQueueTierKey = {
  [K in ReviewQueueTierScope]: `${K}.${(typeof REVIEW_QUEUE_TIER_VOCABULARY)[K][number]}`;
}[ReviewQueueTierScope];

/** `{ key }` when the (kind, tier) pair is in the vocabulary above, `{ raw }`
 *  when the row carries a tier this build does not know — rendered honestly as
 *  its own text, never a key path and never another kind's label — and `null`
 *  when the row has no tier at all. */
export function reviewQueueTier(
  row: Pick<ReviewQueueRow, "row_kind" | "tier">,
): { key: ReviewQueueTierKey } | { raw: string } | null {
  const tier = row.tier;
  if (tier === null || tier === "") return null;
  const kind = row.row_kind;
  if (kind === "compliance_watch" || kind === "lint_finding") {
    const vocabulary: readonly string[] = REVIEW_QUEUE_TIER_VOCABULARY[kind];
    if (vocabulary.includes(tier)) return { key: `${kind}.${tier}` as ReviewQueueTierKey };
  }
  return { raw: tier };
}

/** The three kinds whose `period` means something specific, each with its own
 *  label — the fix for "one word, three meanings". A period on any other kind
 *  renders under the generic label rather than borrowing one of these three. */
export const REVIEW_QUEUE_PERIOD_KINDS = ["draft", "uncoded_filing", "compliance_watch"] as const;
export type ReviewQueuePeriodKind = (typeof REVIEW_QUEUE_PERIOD_KINDS)[number];

export function reviewQueuePeriodKind(rowKind: string): ReviewQueuePeriodKind | null {
  return (REVIEW_QUEUE_PERIOD_KINDS as readonly string[]).includes(rowKind)
    ? (rowKind as ReviewQueuePeriodKind)
    : null;
}

/**
 * Whole days between `aged_since` and now, floored, never negative.
 *
 * `null` for a missing or unparseable instant — the caller renders nothing
 * rather than "waiting 0 days", which would be a claim the row did not make. A
 * clock skew that puts `aged_since` in the future clamps to 0 rather than
 * rendering a negative age.
 */
export function waitingDays(agedSince: string | null, now: Date = new Date()): number | null {
  if (agedSince === null || agedSince === "") return null;
  const started = new Date(agedSince).getTime();
  if (!Number.isFinite(started)) return null;
  const elapsed = now.getTime() - started;
  if (!Number.isFinite(elapsed)) return null;
  return Math.max(0, Math.floor(elapsed / 86_400_000));
}
