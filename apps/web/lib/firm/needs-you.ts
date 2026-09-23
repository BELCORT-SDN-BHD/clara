// Needs-you — clara.list_review_queue, the ONE paginated multi-source queue the DB
// actually ships. This module never re-derives that union; it reads the envelope
// verbatim and exposes the two write doors the SAME queue's open_question rows can
// act on.
//
// GROUNDING, TRUED (independent review, 2026-08-27 — the original citation named
// the SUPERSEDED body): the function's CURRENT live definition is
// packages/db/migrations/0011_daily_loop.sql:3748-3880 REPLACED WHOLE by
// 0016_a21_compliance_watch.sql:4558-4729 (adds row_kind='compliance_watch', the
// `compliance` envelope object, the `compliance_watches` count, `coding_kind`),
// then DYNAMICALLY SPLICED (via `replace()` on the live prosrc, never re-typed —
// the estate's own idiom for a patch that must prove it landed on top of the
// EXACT prior body) three more times:
//   - 0017_wave_b.sql:596-653 — adds row_kind='lint_finding', the `lint` envelope
//     object, the `lint_findings` count, `finding_id`; also joins every existing
//     source CTE to an `active_*_client` filter (status='active' only).
//   - 0041_wave_d_a_fa_register.sql:5370-5455 (S4.9) — adds
//     row_kind='fixed_asset_incomplete' (section always 'needs_review', lane
//     NULL — WD-R1: an under-particularised fixed asset is born honestly
//     incomplete and the queue is the only thing that ever asks for it), `asset_id`.
//   - 0043_wave_d_b1_staff_advances.sql:3553-3692 (S3.8) — copies 0041's shape
//     exactly for row_kind='staff_advance_incomplete', `advance_id`.
//   - 0146_ninth_rowkind_seeding_proposal.sql (裁-17,
//     docs/plan/active/mohe-grill-rulings-2026-08-28.md) — added row_kind='seeding_proposal',
//     BATCH-LEVEL, with three dedicated keys (client_name/batch_ids/open_proposal_count).
//     RETIRED by 0288 (see below): the kind is gone, the three columns are not.
//   - 0180_work_questions.sql (#629) — adds row_kind='work_question', the TENTH kind, section
//     `needs_you`/lane `needs_you`. Reuses the existing 30-key shape unchanged (`id`/
//     `question_id` carry the question, `task_id` the parked run); the counts envelope gains
//     ONE integer, `work_questions`.
//   - 0288_seeding_lane_retired.sql (ticket 1012, riders wave 3 lane 07, owner ruling
//     2026-09-20 on ticket 983) — REMOVES row_kind='seeding_proposal', the first row kind this
//     read has ever lost. The prior-GL seeding lane it chased accepts no new work
//     (clara.create_seeding_batch / tick_seeding_proposal / decline_seeding_proposal all answer
//     one typed refusal), so every such row pointed at a decision nobody can make, and the beta
//     rule is that nothing un-actionable is shown. A NAMED RESIDUAL the migration records: the
//     three keys that row alone ever populated (client_name / batch_ids / open_proposal_count)
//     STAY in the envelope and are now null on every row, because dropping them would mean
//     recutting all ten surviving CTEs for no behavioural gain. They are kept in
//     `ReviewQueueRow` below for the same reason — the shape is what the DB emits, not what a
//     live kind needs.
//   - 0260_depreciation_authority_pending_rowkind.sql (#974, riders wave 2 lane 07, owner
//     ruling 2026-09-20) — adds row_kind='depreciation_authority_pending', the ELEVENTH kind,
//     section `needs_you`/lane `needs_you`: a client's proposed, unsigned depreciation
//     authority (clara.fa_depreciation_authorities.status='proposed') blocks that client's
//     whole depreciation lane. `authority_id` mirrors the shared `id` column at json-build
//     time — the asset_id/advance_id idiom, not seeding_proposal's dedicated-column shape —
//     because a client carries AT MOST ONE proposed authority
//     (uq_fa_authorities_proposed), so no aggregation is needed. No new counts.* key.
//   - 0297_payroll_summary_posting.sql (#946, riders wave 4 lane 01) — adds
//     row_kind='payroll_posting_blocked', the ELEVENTH kind live after 0288 took one away:
//     ONE row per filed payroll summary that has been READ and whose run did NOT post, carrying
//     the database's own sentence naming the condition that failed (the two readings disagreed,
//     the page did not add up, the month could not be established, an account it needs is not in
//     the client's chart, the period is closed, or that month is already posted). Section
//     `needs_you`, lane `needs_you`. DERIVED from clara._payroll_posting_verdict: it stores
//     nothing and clears itself when the block clears — add the missing account, or post the
//     run, and it is gone on the next read — so there is no dismissal act and nothing to
//     reconcile. It reuses the EXISTING shape unchanged: `id`/`filing_id` carry the filing,
//     `document_id` the payslip, `entry_id` the entry a DUPLICATE refusal points at, `period`
//     the month, `question_text` the reason. No new counts.* key and NO new json key, so both
//     FULL_ROW_KEYS rosters named under pin (3) below stay byte-unchanged.
// The LIVE row_kind set is therefore ELEVEN values, not the four the 0011 body
// alone would suggest: draft, uncoded_filing, open_question, coding_task,
// compliance_watch, lint_finding, fixed_asset_incomplete, staff_advance_incomplete,
// work_question, depreciation_authority_pending, payroll_posting_blocked — see
// REVIEW_QUEUE_ROW_KINDS below, the single source components/firm/needs-you-row.tsx's label
// lookup is built from (never a hand-cast key path).
// `counts` carries NINE integers (depreciation_authority_pending adds none — its lane is
// `needs_you`, so ready/needs_review/needs_you folds it in without a dedicated tally; the
// retired seeding_proposal added none either, so its removal moves no tally; #946's
// payroll_posting_blocked adds none for the same reason as depreciation_authority_pending). The envelope ALSO
// carries top-level `compliance`/`lint` detail objects (per-client SST/lint figures,
// BYTE-UNCHANGED by 裁-17) that THIS BUILD DOES NOT RENDER — a named, scoped gap (not
// silently dropped from the type: see `ReviewQueueEnvelope`'s own comment), not a claim
// that no such data exists.
//
// EXTENSION POINT, CORRECTED (#974). The note this section used to carry — "a TENTH row_kind
// — 裁-18b, the agent vendor-binding proposal door — is deliberately deferred until this PR
// merges" — was already overtaken by events before #974 touched this file: #629 shipped the
// tenth kind (work_question, 0180) without going anywhere near 裁-18b's door, and #974's own
// owner ruling (2026-09-20, gh#974) now VOIDS 裁-18b's reservation outright rather than merely
// deferring past it — refresh spec decision O37 retires mandatory vendor/customer binding, so
// the door the slot was held for is not being built. A future TWELFTH kind starts from a
// clean slate, not from a reservation this file still owed anyone. What DOES survive: every
// closed-world pin of the row_kind set still lives in exactly ONE obvious place each, so the
// next addition is still a mechanical repeat, never a hunt —
//   (1) this file's REVIEW_QUEUE_ROW_KINDS array (below) + ReviewQueueRow type,
//   (2) the migration's own marker roster (prestate AND postcheck, in its splice DO block),
//   (3) packages/db/tests/ninth-rowkind-seeding-proposal.test.mjs's AND
//       packages/db/tests/work-question-reads.test.mjs's own FULL_ROW_KEYS arrays (#629
//       restated pin (3) as a second file-local copy rather than importing the first; #974
//       keeps both in sync). THE TWO COPIES STAY TWO — the earlier version of this note asked a
//       future addition to "collapse them to one shared const", and #974's code review picked
//       that up as Duplicated Code. It is withdrawn, because the collapse would cost more than
//       it saves and the hazard it guards against does not exist: each roster is compared with
//       assert.deepEqual against the keys of a LIVE list_review_queue row, so a twelfth kind that
//       updates only one copy REDS the other (measured, #974 fix round: authority_id removed from
//       work-question-reads.test.mjs alone -> "row_kind='work_question' carries a DIFFERENT key
//       set than the pinned shape", 18 pass / 1 fail). Two independent restatements of a pinned
//       shape are the /tdd rule's "expected values from an independent source of truth"; one
//       shared const would let a single wrong edit move both censuses together in silence.
//   (4) components/firm/needs-you-affordances.tsx's NEEDS_YOU_AFFORDANCES registry +
//       needs-you-affordances.test.ts's by-name resolution cases,
//   (5) messages/en.json's `NeedsYou.rowKind.*` label map.
// 0288 (ticket 1012) walked the SAME five places in reverse to REMOVE a kind, which is the
// first time that has happened: the array below, the migration's marker roster, both
// FULL_ROW_KEYS rosters (unchanged — the key set did not move, only the kind), the affordance
// registry (its entry and the whole seeding-proposal-affordance.tsx module are deleted) and the
// label map.
//
// FIVE PINS, NOT SEVEN, SINCE P6-X. Two more lived in the legacy dashboard —
// its `queueKindCatalog.ts` catalog + DB-free literal array, and its
// `dbSeamCensus.bindings.ts` `list_review_queue` unconsumed-keys ledger line —
// and both were DELETED with that tree at the P6-X source delete. Do not hunt
// for them; they are gone, not moved.
//
// WHAT WENT WITH THEM, SO THE NEXT READER DOES NOT ASSUME IT IS STILL COVERED:
// the dashboard's rig-gated cell read `pg_get_functiondef` on the DEPLOYED
// `list_review_queue`, parsed its `row_kind` literals, and failed closed if any
// projection site was not a parsed literal. That was the only JOIN between the
// DB's emitted set and this file's hand-written array. Nothing asserts that
// join today: pin (1) here and pin (3)'s FULL_ROW_KEYS are two hand rosters
// that happen to agree, and a kind added through a CAST or computed expression
// would satisfy both while rendering here with no label and no affordance.
// Re-homing that probe is the open item — see the P6-X PR body's disposition
// of `queueKindCatalog.test.tsx` (class ②) and `dbSeamCensus.test.ts` (class ④).
//
// p_scope: `{}` for the firm-wide, cross-client read this page wants, or
// `{ client_id: "<uuid>" }` to scope to one client (own-firm only; the RPC itself
// refuses any other). p_cursor is `null` on the first page, or the PRIOR
// envelope's own `next_cursor` verbatim thereafter — an opaque 5-tuple this module
// never inspects. `counts`/`sweep`/`rows[].row_kind`/`rows[].section` are rendered
// VERBATIM by the caller — this module adds no relabeling, no re-bucketing.
//
// read RPC — transport via callDoor; not a governed act: no confirmation UI, no
// re-read-after semantics (the team convention, this build's coordinator ruling).
//
// The two ACT doors below ARE governed writes (clara.resolve_open_question /
// clara.dismiss_open_question, 0011_daily_loop.sql:2007-2076, bookkeeper+ — this
// pair was NOT touched by any of the splices above) — real door semantics apply:
// DoorRefusal surfaces verbatim, never retried, and the caller re-reads the queue
// afterward (lib/firm/use-async-read.ts's act(), the same contract as
// lib/parts/hooks.ts's useHydratedPart().act()).

import { callDoor } from "../doors";
import type { SessionTokenAccessor } from "@/lib/session";

/** The full LIVE row_kind taxonomy (grounding note above) — the closed world
 *  components/firm/needs-you-row.tsx's label lookup is checked against. Extend
 *  this array (never a standalone string literal) the day a new kind ships
 *  — the slot #974 once reserved for 裁-18b's agent vendor-binding proposal
 *  door is VOID (see this file's own "EXTENSION POINT, CORRECTED" note above),
 *  so a future addition starts fresh rather than resuming that reservation. */
export const REVIEW_QUEUE_ROW_KINDS = [
  "draft",
  "uncoded_filing",
  "open_question",
  "coding_task",
  "compliance_watch",
  "lint_finding",
  "fixed_asset_incomplete",
  "staff_advance_incomplete",
  // #629 (0180_work_questions.sql): ONE row per PENDING question a running
  // accounting Work is parked on. Section `needs_you`, lane `needs_you` — a
  // person must act before the Work can move, exactly like an open_question.
  // The row reuses the EXISTING 30-key shape (`id`/`question_id` carry the
  // question, `task_id` the parked run, `question_text` the question itself);
  // the version, the typed fields and the reason come from
  // `clara.get_work_question`, which is the ONE record every surface renders.
  "work_question",
  // #974 (0260_depreciation_authority_pending_rowkind.sql, riders wave 2 lane 07, owner
  // ruling 2026-09-20): ONE row for a client's proposed, unsigned depreciation authority
  // (clara.fa_depreciation_authorities.status='proposed') — the whole client's depreciation
  // lane is blocked until an admin signs or withdraws it. Section `needs_you`, lane
  // `needs_you`, exactly like open_question/work_question. `id`/`authority_id` both carry the
  // authority's own id (the asset_id/advance_id idiom, not seeding_proposal's aggregation —
  // a client carries at most one proposed authority at a time).
  "depreciation_authority_pending",
  // #946 (0297_payroll_summary_posting.sql, riders wave 4 lane 01): the TWELFTH kind. ONE row
  // per filed payroll summary that has been READ and whose run did not post — the two readings
  // disagreed, the page did not add up, its month could not be established, an account it needs
  // is not in this client's chart, the period is closed, or that month is already posted.
  // Section `needs_you`, lane `needs_you`, like open_question/work_question. The row is DERIVED
  // from clara._payroll_posting_verdict and stores nothing: it clears itself when the block
  // clears, so there is no dismissal act and nothing to reconcile. It reuses the existing shape
  // unchanged — `id`/`filing_id` carry the filing, `document_id` the payslip, `entry_id` the
  // entry a DUPLICATE refusal points at, `period` the month, `question_text` the database's own
  // sentence naming the condition that failed. No counts.* key is minted (its `needs_you` lane
  // folds it into counts.needs_you already), and no new json key, so the two db-side
  // FULL_ROW_KEYS rosters are byte-unchanged.
  "payroll_posting_blocked",
] as const;

export type ReviewQueueRowKind = (typeof REVIEW_QUEUE_ROW_KINDS)[number];
export type ReviewQueueSection = "needs_you" | "needs_review" | string;

/** The ONE checked-membership test every row_kind label lookup in the UI must go
 *  through (components/firm/needs-you-row.tsx and client-workspace-overview.tsx)
 *  — a single shared predicate rather than two independently-typed copies that
 *  could silently drift apart (AGENTS.md's "spelling is not identity" /
 *  no-second-implementation reasoning). */
export function isKnownReviewQueueRowKind(kind: string): kind is ReviewQueueRowKind {
  return (REVIEW_QUEUE_ROW_KINDS as readonly string[]).includes(kind);
}

/** The stable identity clara.list_review_queue rows use across a re-read — the
 *  SAME derivation everywhere a row must be recognized as "the same row" (a
 *  React key, or R1's acted-on-row-still-present check below). `row_kind`+`id`
 *  is unique within one queue read: `id` is the source table's own primary key
 *  (entry_id/filing_id/question_id/task_id/watch_id/finding_id/asset_id/
 *  advance_id all alias to it per-kind — the row-json projection lives in the
 *  LIVE body, 0016_a21_compliance_watch.sql:4715-4723, plus the
 *  0017/0036/0041/0043 splices; 0011's body is superseded, only 4367 lines),
 *  never reused across row_kinds. */
export function reviewQueueRowKey(row: ReviewQueueRow): string {
  return `${row.row_kind}:${row.id}`;
}

/** R1 (independent review, fix-required, 2026-08-27 — round 2): true only when
 *  the row identified by `actingKey` is STILL PRESENT in `rows` after a
 *  re-read. The most common refusal on this queue — someone else already
 *  settled the question, CLR10 "question is not open" — makes the acted-on row
 *  VANISH from the very re-read `act()` triggers, so a per-row error
 *  attachment keyed purely on "does actingKey match a row I can still see"
 *  goes dark for exactly the case that most needs a visible refusal: the
 *  human's own resolution was NOT recorded, and nothing on screen said so. */
export function isActingRowAttached(rows: ReviewQueueRow[], actingKey: string | null): boolean {
  if (actingKey === null) return false;
  return rows.some((r) => reviewQueueRowKey(r) === actingKey);
}

/** The exact page-level-banner decision components/firm/needs-you-inbox.tsx
 *  makes, extracted as a pure predicate so it has a test that does not need a
 *  React render pass. `hasData` gates out the "nothing has ever loaded"
 *  state — that case is DataState's full-page error, never a banner over
 *  nothing. Otherwise the banner shows unless the error is already visibly
 *  attached to a still-present row. */
export function shouldShowQueueErrorBanner(
  hasData: boolean,
  error: unknown,
  rows: ReviewQueueRow[],
  actingKey: string | null,
): boolean {
  if (!hasData || !error) return false;
  return actingKey === null || !isActingRowAttached(rows, actingKey);
}

export type ReviewQueueRow = {
  row_kind: ReviewQueueRowKind | string;
  section: ReviewQueueSection;
  client_id: string | null;
  counterparty_id: string | null;
  filing_id: string | null;
  entry_id: string | null;
  question_id: string | null;
  task_id: string | null;
  document_id: string | null;
  lane: string | null;
  auto: boolean;
  rule_backed: boolean;
  high_stakes: boolean;
  aged_since: string | null;
  amount_cents: number | null;
  period: string | null;
  question_text: string | null;
  created_at: string;
  id: string;
  /** 0016+: entry-shaped rows only (draft today); null otherwise. */
  coding_kind: string | null;
  /** 0016+: compliance_watch rows only. */
  watch_id: string | null;
  /** 0016+: the watch's state (compliance_watch) or the finding's severity
   *  (0017+, lint_finding) — a shared "tier" projection, per the live body. */
  tier: string | null;
  /** 0017+: lint_finding rows only. */
  finding_id: string | null;
  /** 0041+: fixed_asset_incomplete rows only. */
  asset_id: string | null;
  /** 0043+: staff_advance_incomplete rows only. */
  advance_id: string | null;
  /** 裁-17 (0146) — DEAD SINCE 0288 (ticket 1012). These three were the retired
   *  `seeding_proposal` row's own columns; that row kind is gone, and the migration keeps the
   *  columns in the shared vector rather than recut all ten surviving CTEs, so the DB now emits
   *  them as null on EVERY row. They stay typed here because this type states what the envelope
   *  CONTAINS, not what is useful in it — dropping them would make the type disagree with the
   *  read. Nothing in the UI consumes them any more. */
  client_name: string | null;
  /** 裁-17 (0146) — DEAD SINCE 0288; see `client_name` above. */
  batch_ids: string[] | null;
  /** 裁-17 (0146) — DEAD SINCE 0288; see `client_name` above. */
  open_proposal_count: number | null;
  /** #974 (0260)+: depreciation_authority_pending rows only — mirrors the shared `id`
   *  column (the asset_id/advance_id idiom), because a client carries at most one
   *  proposed authority at a time and needs no aggregation. */
  authority_id: string | null;
};

export type ReviewQueueCounts = {
  ready: number;
  needs_review: number;
  needs_you: number;
  open_drafts: number;
  open_questions: number;
  open_tasks: number;
  /** 0016+ */
  compliance_watches: number;
  /** 0017+ */
  lint_findings: number;
  /** #629 (0180+) — OPTIONAL on this type ON PURPOSE. Every fixture in this app
   *  that constructs a counts object would otherwise stop compiling for a key
   *  the surface renders as `?? 0`, and a required key would be a claim that a
   *  pre-0180 database sends one. It does not. */
  work_questions?: number;
};

export type ReviewQueueSweep = {
  open_run: boolean;
  last_finalized_at: string | null;
  last_ack_at: string | null;
};

export type ReviewQueueCursor = { tuple: string[] };

export type ReviewQueueEnvelope = {
  counts: ReviewQueueCounts;
  sweep: ReviewQueueSweep;
  // CRS-07-03 (code-review fix round) — `watermark` is DELETED here, not restored as a named,
  // present-but-unread field the way `compliance`/`lint` below are. #903's brief forbids the
  // half-state ("no half-state where it is typed but dropped") and its out-of-scope line rules out
  // the other fork explicitly: "a new freshness indicator for the review queue" is exactly what
  // rendering `watermark` would be. `clara.list_review_queue` genuinely emits the field
  // (0011_daily_loop.sql:3861; 0036_wave_c0_deferred_belts.sql:1737-1744 pins it as a
  // must-not-be-lost output) and CONTEXT.md names the underlying concept ("Attention source
  // freshness" / "Source watermark") as real — but that is an argument for a FUTURE ticket to wire
  // a real consumer, not for this type to keep a field this build has never read and #903 asks to
  // resolve one way or the other. The `compliance`/`lint` precedent below predates #903 and was
  // never put to the owner as an answer to its AC2, so it does not carry this field along with it.
  // use-review-queue.test.ts's "903" cell greps both this type and the hook for zero remaining
  // reference.
  /** 0016+: per-client SST-registration figures + a staleness flag. Present on
   *  the wire; NOT rendered by this build (named gap, not a silent drop —
   *  components/firm's Needs-you inbox surfaces only `counts.compliance_watches`
   *  today). Typed loosely on purpose: this module makes no claim about a shape
   *  it does not consume. */
  compliance?: unknown;
  /** 0017+: same posture as `compliance` above, for the lint lane. */
  lint?: unknown;
  rows: ReviewQueueRow[];
  next_cursor: ReviewQueueCursor | null;
};

export type ReviewQueueScope = { client_id?: string };

/** read RPC — transport via callDoor; not a governed act: no confirmation UI, no
 *  re-read-after semantics. */
export function listReviewQueue(
  session: SessionTokenAccessor,
  scope: ReviewQueueScope = {},
  cursor: ReviewQueueCursor | null = null,
  limit = 50,
): Promise<ReviewQueueEnvelope> {
  return callDoor<ReviewQueueEnvelope>(
    "list_review_queue",
    { p_scope: scope, p_cursor: cursor, p_limit: limit },
    { session },
  );
}

/** clara.resolve_open_question(p_question, p_resolution, p_op_key) — bookkeeper+
 *  governed write (0011_daily_loop.sql:2007-2042, untouched by the splices above).
 *  A fresh op_key per call (crypto.randomUUID()) — never reused across a retry,
 *  per doors.ts's "never retry a refusal" law. */
export function resolveOpenQuestion(
  session: SessionTokenAccessor,
  questionId: string,
  resolution: string,
): Promise<unknown> {
  return callDoor(
    "resolve_open_question",
    { p_question: questionId, p_resolution: resolution, p_op_key: crypto.randomUUID() },
    { session },
  );
}

/** clara.dismiss_open_question(p_question, p_reason, p_op_key) — bookkeeper+
 *  governed write (0011_daily_loop.sql:2044-2076, untouched by the splices above). */
export function dismissOpenQuestion(
  session: SessionTokenAccessor,
  questionId: string,
  reason: string,
): Promise<unknown> {
  return callDoor(
    "dismiss_open_question",
    { p_question: questionId, p_reason: reason, p_op_key: crypto.randomUUID() },
    { session },
  );
}
