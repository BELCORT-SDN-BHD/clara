// Needs-you — clara.list_review_queue (packages/db/migrations/0011_daily_loop.sql:
// 3748-3880), the ONE paginated multi-source queue the DB actually ships (drafts,
// uncoded filings, open questions, coding tasks — unioned and sectioned INSIDE the
// RPC). This module never re-derives that union; it reads the envelope verbatim and
// exposes the two write doors the SAME queue's open_question rows can act on.
//
// p_scope (0011:3754-3765): `{}` for the firm-wide, cross-client read this page wants,
// or `{ client_id: "<uuid>" }` to scope to one client (own-firm only; the RPC itself
// refuses any other). p_cursor (0011:3769-3780) is `null` on the first page, or the
// PRIOR envelope's own `next_cursor` verbatim thereafter — an opaque 5-tuple this
// module never inspects. `counts`/`sweep`/`rows[].row_kind`/`rows[].section` are
// rendered VERBATIM by the caller (components/firm/NeedsYouInbox.tsx) — this module
// adds no relabeling, no re-bucketing.
//
// read RPC — transport via callDoor; not a governed act: no confirmation UI, no
// re-read-after semantics (the team convention, this build's coordinator ruling).
//
// The two ACT doors below ARE governed writes (clara.resolve_open_question /
// clara.dismiss_open_question, 0011:2007-2076, bookkeeper+) — real door semantics
// apply: DoorRefusal surfaces verbatim, never retried, and the caller re-reads the
// queue afterward (lib/parts/hooks.ts's useHydratedPart().act() does this
// automatically for any component built on it).

import { callDoor } from "../doors";
import type { SessionTokenAccessor } from "@/lib/session";

export type ReviewQueueRowKind = "draft" | "uncoded_filing" | "open_question" | "coding_task" | string;
export type ReviewQueueSection = "needs_you" | "needs_review" | string;

export type ReviewQueueRow = {
  row_kind: ReviewQueueRowKind;
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
};

export type ReviewQueueCounts = {
  ready: number;
  needs_review: number;
  needs_you: number;
  open_drafts: number;
  open_questions: number;
  open_tasks: number;
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
 *  governed write (0011:2007-2042). A fresh op_key per call (crypto.randomUUID()) —
 *  never reused across a retry, per doors.ts's "never retry a refusal" law. */
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
 *  governed write (0011:2044-2076). */
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
