// THE THREAD'S OWN RUN, READ FROM THE DATABASE (P6-5 · 裁-132 + the parked-clarify
// rehydration). Two facts this module supplies and the browser cannot invent:
//
//   1. WHEN THE TURN STARTED — `clara.agent_tasks_visible.created_at`, so the elapsed-time
//      indicator counts from a timestamp the RUNTIME wrote, never from the moment this tab
//      happened to render. A tab opened mid-turn, or reloaded during one, reads the same
//      start the runtime recorded.
//   2. WHETHER THE TURN IS PARKED ON A QUESTION — `status = 'awaiting_input'` plus the
//      task's own exact-one pending `clara.agent_interruptions` row. A reload throws away
//      the SSE buffer the live clarify was folded out of (lib/clara/liveClarify.ts), so
//      without this read a page refresh during a parked question strands the human on a
//      thread that shows no question and no way to answer one.
//
// WHY `agent_tasks_visible` FOR THE THREAD, AND NOT THE FIRM-WIDE PENDING LIST. Both reads
// are reachable by `clara_authenticated`, and this is the read-path choice P6-5 owns:
//
//   * `clara.agent_interruptions` (the firm-wide `status=eq.pending` list,
//     lib/journals/governance-doors.ts's `listPendingInterruptions`) carries NO session_id
//     and NO client_id — its own header says so. Rehydrating the RAIL from it would put a
//     COLLEAGUE's parked question, from another thread and possibly another client, into
//     this user's conversation. That is the cross-thread adoption 裁-117(a) ruled against,
//     arriving through the read instead of through the thread resolver. The firm-wide list
//     already has its own home (the journals Clarifications tab) and keeps it.
//   * `clara.agent_tasks_visible` (0006_runtime_core.sql:684, `security_barrier` added by
//     0144:312) is firm-pinned by `jwt_firm()` in its own predicate, and REVEALS
//     `session_id` only where the joined chat session is firm-visible OR authored by the
//     caller (`s.visibility = 'firm' or s.created_by = clara.jwt_sub()`, :687-690). The
//     rail only ever resolves the caller's OWN session (lib/clara/useActiveThread.ts's
//     `selectOwnSession` matches on `created_by === callerSubject`), so the projection is
//     satisfied for exactly the threads this hook is asked about — the runtime authorises
//     this caller for this read, with nothing widened to make it work.
//
// So: thread -> its own non-terminal task -> that task's own pending interruption. Every
// hop is keyed on something the caller already holds, and no hop can reach another
// thread's question.
//
// THE POLL SHAPE MIRRORS THE DASHBOARD'S TASK LIST — a bounded, cancellable re-read rather
// than an event subscription, for the reason components/parts/ClarifyCard.tsx measured and
// wrote down: nothing writes to the run's writable between `openInterruptionStep` and the
// `await hook` park, and `streamRoute.ts` emits no event for an `awaiting_input` status, so
// there is no event to key on. The caller owns the cadence; this module is pure I/O.

import { getRows } from "@/lib/read";
import { getPendingInterruptionForTask } from "@/lib/journals/governance-doors";
import type { SessionTokenAccessor } from "@/lib/session";
import type { LiveClarifyPart } from "./liveClarify";

type Opts = { session?: SessionTokenAccessor; signal?: AbortSignal };

/** `clara.agent_tasks.status`'s five NON-TERMINAL values (0006's own CHECK; the same set
 *  lib/coding/types.ts pins as `AGENT_TASK_LIVE_STATUSES`). A task outside this set has
 *  finished — there is no turn in flight to time or to re-attach to. */
export const THREAD_RUN_LIVE_STATUSES = [
  "queued",
  "held",
  "running",
  "awaiting_input",
  "cancel_requested",
] as const;

export type ThreadRunStatus = (typeof THREAD_RUN_LIVE_STATUSES)[number];

export type ThreadRunRow = {
  id: string;
  status: string;
  created_at: string;
};

const RUN_SELECT = "id,status,created_at";

function isThreadRunRow(value: unknown): value is ThreadRunRow {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === "string" && v.id.length > 0
    && typeof v.status === "string" && v.status.length > 0
    && typeof v.created_at === "string" && v.created_at.length > 0;
}

/** EXACT-ONE, deliberately (the `limit=2` idiom lib/journals/governance-doors.ts's own
 *  addressing law states). A thread has at most one turn in flight — `postTurn` answers 409
 *  "this session already has a turn in progress" otherwise — so two live rows means the
 *  premise this read is built on does not hold, and the honest answer is `null` (no run
 *  claimed) rather than whichever row sorted first. */
export async function readThreadRun(threadId: string, opts: Opts = {}): Promise<ThreadRunRow | null> {
  if (!threadId) return null;
  const rows = await getRows<unknown>("agent_tasks_visible", {
    select: RUN_SELECT,
    filters: {
      session_id: `eq.${threadId}`,
      status: `in.(${THREAD_RUN_LIVE_STATUSES.join(",")})`,
    },
    limit: 2,
    ...opts,
  });
  if (rows.length !== 1) return null;
  const row = rows[0];
  return isThreadRunRow(row) ? row : null;
}

/** The same shape addressed by task id — what a turn this tab itself just posted needs, to
 *  learn the DB's own `created_at` for it rather than stamping a client clock. */
export async function readRunByTaskId(taskId: string, opts: Opts = {}): Promise<ThreadRunRow | null> {
  if (!taskId) return null;
  const rows = await getRows<unknown>("agent_tasks_visible", {
    select: RUN_SELECT,
    filters: { id: `eq.${taskId}` },
    limit: 2,
    ...opts,
  });
  if (rows.length !== 1) return null;
  const row = rows[0];
  return isThreadRunRow(row) ? row : null;
}

/** The interruption row's `question` jsonb IS a `clarify` part, minus its tool-call id:
 *  `chatTurn.v10.impl.ts:328`'s `openInterruptionStep` writes
 *  `{ type: "clarify", question, context, framing }` verbatim into
 *  `clara.open_interruption`'s third argument. This reads those four fields back — nothing
 *  is reconstructed, and a row whose `question` does not carry the text we actually SAW
 *  yields NO card (absence is not evidence), exactly as `foldLiveClarifyParts` does for a
 *  malformed chunk.
 *
 *  `tool_call_id` is the INTERRUPTION ROW'S OWN id, prefixed so it can never collide with a
 *  stream-supplied tool-call id. It is a real, DB-owned identifier for this parked
 *  question, not a fabricated one — and the card's own read still addresses the row through
 *  `getPendingInterruptionForTask(taskId)`, so nothing downstream trusts this value. */
export function clarifyPartFromInterruptionQuestion(
  interruptionId: string,
  question: unknown,
): LiveClarifyPart | null {
  if (typeof question !== "object" || question === null) return null;
  const q = question as Record<string, unknown>;
  if (q.type !== "clarify") return null;
  const text = typeof q.question === "string" ? q.question.trim() : "";
  if (!text) return null;
  const context = typeof q.context === "string" && q.context.trim() ? q.context : null;
  const framing = typeof q.framing === "string" ? q.framing : "";
  return { type: "clarify", tool_call_id: `interruption:${interruptionId}`, question: text, context, framing };
}

export type ThreadRunSnapshot = {
  run: ThreadRunRow | null;
  /** Non-null ONLY when the run is `awaiting_input` AND its exact-one pending interruption
   *  was actually read and carried a question. Every other path yields `null` — a parked
   *  status alone is not evidence that a question exists to answer. */
  parkedClarify: LiveClarifyPart | null;
};

/** One hop set: the thread's live run, plus its parked question when it has one. */
export async function readThreadRunSnapshot(threadId: string, opts: Opts = {}): Promise<ThreadRunSnapshot> {
  const run = await readThreadRun(threadId, opts);
  if (run === null || run.status !== "awaiting_input") return { run, parkedClarify: null };
  const row = await getPendingInterruptionForTask(run.id, opts);
  if (row === null) return { run, parkedClarify: null };
  return { run, parkedClarify: clarifyPartFromInterruptionQuestion(row.id, row.question) };
}

/**
 * Whole seconds between a DB-supplied start and a client `now`, or `null`.
 *
 * NULL IS THE HONEST ANSWER for an absent, unparseable or FUTURE start. The anchor is the
 * runtime's clock and the tick is the browser's; when the two disagree badly enough that
 * the turn appears to start after it is being rendered, this reports nothing rather than
 * clamping to "0s" — a fabricated zero would read as a fact about the run, and 裁-132 asks
 * for an honest instrument, not a reassuring one.
 */
export function elapsedSeconds(startedAt: string | null, nowMs: number): number | null {
  if (!startedAt) return null;
  const started = Date.parse(startedAt);
  if (!Number.isFinite(started)) return null;
  const delta = nowMs - started;
  if (delta < 0) return null;
  return Math.floor(delta / 1000);
}

/** `m:ss` for anything under an hour, `h:mm:ss` above it. Pure, so the cell reads the
 *  formatter rather than a rendered clock. */
export function formatElapsed(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  const two = (n: number) => String(n).padStart(2, "0");
  return hours > 0 ? `${hours}:${two(minutes)}:${two(secs)}` : `${minutes}:${two(secs)}`;
}
