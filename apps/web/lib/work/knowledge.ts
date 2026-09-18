// #658 — HAS THIS WORK'S BASIS MOVED SINCE IT READ? (0230_knowledge_retrieval.sql.)
//
// IT IS AN RPC for the reason `lib/work/diagnostics.ts` gives about its own read: the authority
// story has to be whole in ONE place. `clara.work_knowledge_drift(p_work)` is viewer-floored,
// takes its firm from the session and computes the comparison server-side; a PostgREST filter
// chain would put the floor, the watermark expression and the relevance judgement in the browser,
// where none of the three is enforceable — and `clara.work_knowledge_reads` grants no SELECT to
// any application role in the first place.
//
// A DENIED READ IS A FACE, NOT A FAILURE, and the same typed-outcome shape `readWorkTrace` uses:
// a caller below the floor, or a Work in another firm, is "you may not see this", never a page
// that falls over.
//
// THE THREE VALUES OF `relevant`, AND WHY NONE OF THEM MAY BE COERCED HERE:
//   true   — a key this Work RECORDED reading has moved. Re-ask.
//   false  — the basis moved, but not in anything this Work read.
//   null   — no read-set was recorded (the version came from an execution trace), so WHICH keys
//            it read is unknown. Rendering that as `false` would be exactly the null-as-empty
//            defect #658 exists to kill: the absence of a record read as evidence of absence.

import { callDoor, DoorRefusal } from "@/lib/doors";
import { isUuidShape } from "@/lib/client-id";
import type { SessionTokenAccessor } from "@/lib/session";
import type { KnowledgeReadStatus } from "@/lib/registers/knowledge";

type Opts = { session?: SessionTokenAccessor; signal?: AbortSignal };

/** What the Work's LAST recorded attempt actually read — METADATA only (key NAMES, tier counts,
 *  the face word and its reason). `null` when the observed version came from an execution trace,
 *  because a trace records no read-set. */
export type WorkKnowledgeReadSummary = {
  status: KnowledgeReadStatus;
  reason: string | null;
  purpose: string;
  tiers: Record<string, number>;
  records_shown: number;
  truncated: boolean;
  run_id: string;
  seq: number;
  read_at: string;
  keys: string[];
};

export type WorkKnowledgeDrift = {
  /** TEXT, never coerced: a bigint watermark through `Number()` is a lossy claim. */
  observed_version: string | null;
  current_version: string | null;
  /** `read` when a read-set row was recorded; `trace` when only a v4-shaped execution trace
   *  carried the version; `null` when neither exists. */
  observed_from: "read" | "trace" | null;
  drifted: boolean | null;
  moved_keys: string[];
  read_keys: string[] | null;
  relevant: boolean | null;
  as_of: string | null;
  read: WorkKnowledgeReadSummary | null;
  work_id: string;
  client_id: string | null;
};

export type WorkKnowledgeDriftRead =
  | { kind: "ok"; drift: WorkKnowledgeDrift }
  | { kind: "denied" }
  | { kind: "unreadable"; message: string };

/** clara.work_knowledge_drift(p_work uuid) — viewer+, firm from the session. */
export async function readWorkKnowledgeDrift(workId: string, opts: Opts = {}): Promise<WorkKnowledgeDriftRead> {
  // A malformed id never reaches PostgREST — on a `uuid` argument it is HTTP 400 `22P02`, which
  // throws, and a throw on a route reaches the error boundary instead of the scoped state this
  // section owns (the guard `lib/work/diagnostics.ts` states for the same defect).
  if (!isUuidShape(workId)) return { kind: "unreadable", message: "work id is not a uuid" };
  try {
    const out = await callDoor<unknown>("work_knowledge_drift", { p_work: workId }, opts);
    if (out === null || typeof out !== "object" || Array.isArray(out)) {
      return { kind: "unreadable", message: "work_knowledge_drift did not answer with an envelope" };
    }
    return { kind: "ok", drift: out as WorkKnowledgeDrift };
  } catch (err) {
    if (err instanceof DoorRefusal) {
      // CLR04 is the viewer floor; CLR11 is "not in your firm", which the door answers the same
      // way for an absent Work — deliberately, so the read is not an existence oracle.
      if (err.code === "CLR04" || err.code === "CLR11") return { kind: "denied" };
      return { kind: "unreadable", message: err.message };
    }
    return { kind: "unreadable", message: err instanceof Error ? err.message : String(err) };
  }
}

/** Is the banner owed, and in WHICH of its two wordings? Exported so the Work block and the
 *  question form cannot disagree about when a person is told their basis moved.
 *
 *  `unrecorded` is NOT a softer `relevant` — it is the honest answer when the estate cannot say
 *  which records the Work read. The wording says exactly that, and never a confident "unrelated". */
export type DriftBannerKind = "none" | "relevant" | "unrecorded";

export function driftBannerKind(read: WorkKnowledgeDriftRead | null | undefined): DriftBannerKind {
  if (!read || read.kind !== "ok") return "none";
  const d = read.drift;
  if (d.drifted !== true) return "none";
  if (d.relevant === true) return "relevant";
  if (d.relevant === null || d.relevant === undefined) return "unrecorded";
  return "none";
}

/** The keys a `relevant` banner names — the intersection the door already computed, not a second
 *  copy of the rule. Empty for the `unrecorded` wording, which names no key BECAUSE it cannot. */
export function driftBannerKeys(read: WorkKnowledgeDriftRead | null | undefined): string[] {
  if (!read || read.kind !== "ok") return [];
  const d = read.drift;
  if (d.relevant !== true || !Array.isArray(d.read_keys)) return [];
  const readKeys = new Set(d.read_keys);
  return d.moved_keys.filter((k) => readKeys.has(k));
}
