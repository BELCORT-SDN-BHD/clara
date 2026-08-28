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
//   - UNNUMBERED_ninth_rowkind_seeding_proposal.sql (裁-17,
//     docs/plan/active/mohe-grill-rulings-2026-08-28.md) — adds row_kind='seeding_proposal',
//     BATCH-LEVEL (one row per client with >=1 OPEN clara.seeding_proposals row, aggregated
//     across every open batch that client owns). Unlike asset_id/advance_id, its three new
//     keys (client_name/batch_ids/open_proposal_count) cannot be derived from the shared
//     `id` column at json-build time — this row's `id` IS the client_id, not one proposal's
//     id — so they ride their own dedicated columns instead, always present, null on every
//     OTHER row_kind (the finding_id posture, no `case when row_kind=` gate needed).
// The LIVE row_kind set is therefore NINE values, not the four the 0011 body
// alone would suggest: draft, uncoded_filing, open_question, coding_task,
// compliance_watch, lint_finding, fixed_asset_incomplete, staff_advance_incomplete,
// seeding_proposal — see REVIEW_QUEUE_ROW_KINDS below, the single source components/firm/
// needs-you-row.tsx's label lookup is built from (never a hand-cast key path).
// `counts` still carries EIGHT integers (seeding_proposal adds none — lane stays NULL,
// same posture as fixed_asset_incomplete/staff_advance_incomplete, so ready/needs_review/
// needs_you are untouched and no new `counts.*` integer was minted). The envelope ALSO
// carries top-level `compliance`/`lint` detail objects (per-client SST/lint figures,
// BYTE-UNCHANGED by 裁-17) that THIS BUILD DOES NOT RENDER — a named, scoped gap (not
// silently dropped from the type: see `ReviewQueueEnvelope`'s own comment), not a claim
// that no such data exists.
//
// EXTENSION POINT (a TENTH row_kind — 裁-18b, the agent vendor-binding proposal door — is
// deliberately deferred until this PR merges, so the two never CoR the reader in one
// window): every closed-world pin of the row_kind set lives in exactly ONE obvious place
// each, so the tenth is a mechanical repeat, never a hunt —
//   (1) this file's REVIEW_QUEUE_ROW_KINDS array (below) + ReviewQueueRow type,
//   (2) the migration's own marker roster (prestate AND postcheck, in its splice DO block),
//   (3) packages/db/tests/ninth-rowkind-seeding-proposal.test.mjs's FULL_ROW_KEYS array,
//   (4) components/firm/needs-you-affordances.tsx's NEEDS_YOU_AFFORDANCES registry +
//       needs-you-affordances.test.ts's by-name resolution cases,
//   (5) messages/en.json's `NeedsYou.rowKind.*` label map,
//   (6) apps/dashboard/app/shared/queueKindCatalog.ts's QUEUE_KIND_CATALOG +
//       queueKindCatalog.test.tsx's DB-free "known row_kind set" literal array,
//   (7) apps/dashboard/app/shared/dbSeamCensus.bindings.ts's `list_review_queue`
//       unconsumed-keys ledger line (its own [rig] test PRINTS the exact
//       replacement line on drift — never hand-derive it).
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
 *  this array (never a standalone string literal) the day a tenth kind ships
 *  (裁-18b's agent vendor-binding proposal door, deliberately deferred behind
 *  this one — see this file's own "EXTENSION POINT" note above). */
export const REVIEW_QUEUE_ROW_KINDS = [
  "draft",
  "uncoded_filing",
  "open_question",
  "coding_task",
  "compliance_watch",
  "lint_finding",
  "fixed_asset_incomplete",
  "staff_advance_incomplete",
  // 裁-17 (UNNUMBERED_ninth_rowkind_seeding_proposal.sql): batch-level, one row
  // per client with >=1 OPEN clara.seeding_proposals row.
  "seeding_proposal",
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
  /** 裁-17+: seeding_proposal rows only — the client's own name (batch-level,
   *  one row per client, so no single underlying entity carries it). */
  client_name: string | null;
  /** 裁-17+: seeding_proposal rows only — every OPEN batch's id for this client. */
  batch_ids: string[] | null;
  /** 裁-17+: seeding_proposal rows only — the count of OPEN proposals summed
   *  across every open batch. */
  open_proposal_count: number | null;
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
};

export type ReviewQueueSweep = {
  open_run: boolean;
  last_finalized_at: string | null;
  last_ack_at: string | null;
};

export type ReviewQueueCursor = { tuple: string[] };

export type ReviewQueueEnvelope = {
  watermark: string;
  counts: ReviewQueueCounts;
  sweep: ReviewQueueSweep;
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
