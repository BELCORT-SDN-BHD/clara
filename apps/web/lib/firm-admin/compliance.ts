// T10 (port-wave plan §4 T10, §5's compliance row): the three compliance-watch
// governed writes, plus the compliance register's own read.
//
// GROUNDING (rig census, 2026-08-28 — an instance-unique throwaway Postgres 17
// migrated to the live frontier, `0140`; every signature below read from
// `pg_get_functiondef` on that rig, never from migration text alone):
//   - clara.ack_compliance_watch(p_watch uuid, p_rationale text, p_op_key text)
//     (0016_a21_compliance_watch.sql:1047, LIVE-UNTOUCHED by any later splice)
//     — bookkeeper+. Refuses CLR03 for an agent identity, CLR10 for a missing
//     rationale or an already-`resolved` watch.
//   - clara.snooze_compliance_watch(p_watch uuid, p_until timestamptz,
//     p_rationale text, p_op_key text) (0016:1101, LIVE-UNTOUCHED) —
//     bookkeeper+. The DB itself refuses (CLR10) a non-future `p_until` or one
//     more than 60 days out; this module does not pre-validate that bound.
//   - clara.resolve_compliance_watch(p_watch uuid, p_conclusion text,
//     p_evidence text, p_op_key text) (0016:1151, LIVE-UNTOUCHED) —
//     bookkeeper+ for `p_conclusion='registration_recorded'`;
//     `'not_liable_documented'` additionally requires admin (CLR04 below that
//     rank). The caller never hides that option on a client-side role guess —
//     the DB's rank check is the wall (team-lead security note).
// All three are EXECUTE-granted to `clara_authenticated` (rig census) — human
// lane, never wake/agent (each body's own `wk.credential_id is not null …`
// guard refuses an agent identity with CLR03 before anything else runs).
//
// THE REGISTER READ HAS NO DEDICATED RPC. `clara.compliance_watches` carries
// NO `clara_authenticated` table grant at all (rig census: only
// `clara_fn_owner` and the unrelated `clara_freeform_ro` hold any privilege on
// it) — so the only human-reachable read of compliance-watch state is
// `clara.list_review_queue`'s own top-level `compliance` object
// (`0016_a21_compliance_watch.sql:4558-4729`'s `jsonb_build_object('compliance',
// …)` block, LIVE-UNTOUCHED by 0017/0041/0043's splices, which touch other row
// kinds only). `lib/firm/needs-you.ts`'s `ReviewQueueEnvelope.compliance` types
// this `unknown` on purpose — its own header calls it "a named, scoped gap…
// NOT rendered by this build". This module closes that gap for ITS OWN READ
// ONLY: `needs-you.ts` itself is left byte-untouched (T7 also extends that
// file's row-kind world this same wave; T10 stays out of it entirely).
//
// The register aggregate (`compliance.clients`) and the paginated needs-you
// rows (`row_kind='compliance_watch'`) both filter `state<>'resolved'`, but
// only the ROW filter additionally requires `watch_kind='sst_registration'`
// — today a no-op (`compliance_watches_watch_kind_check` pins the column to
// that ONE literal, rig census), but this module does not assume the two
// populations stay identical if that CHECK is ever widened.

import { listReviewQueue, type ReviewQueueScope } from "../firm/needs-you";
import { callDoor } from "../doors";
import type { SessionTokenAccessor } from "@/lib/session";

export type ComplianceWatchState = "monitored" | "early_warning" | "crossed" | "overdue" | "resolved" | string;

/** One (client_id, service_group) row of `list_review_queue`'s top-level
 *  `compliance.clients` array — every field copied verbatim, in the live
 *  body's own key order. */
export type ComplianceClientWatch = {
  client_id: string;
  service_group: string;
  state: ComplianceWatchState;
  confirmed_included_cents: number | null;
  unknown_or_mixed_cents: number | null;
  screening_proxy_cents: number | null;
  earliest_crossing_month: string | null;
  application_due: string | null;
  future_method_status: string | null;
};

export type ComplianceRegister = {
  /** True when no `compliance_eval_runs` row has completed in the last 48h —
   *  rendered as an honest staleness banner, never silently dropped. */
  staleEvaluator: boolean;
  clients: ComplianceClientWatch[];
};

function isComplianceClientWatch(v: unknown): v is ComplianceClientWatch {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return typeof r.client_id === "string" && typeof r.service_group === "string" && typeof r.state === "string";
}

/** Reads `list_review_queue`'s `compliance` envelope object only — `p_limit:
 *  1` because this module never consumes the paginated `rows[]`, and the live
 *  body computes `counts`/`compliance`/`lint` over the full population
 *  independent of `p_limit` (0016_a21_compliance_watch.sql:4558-4729's
 *  `counts`/`sweep` CTEs read `all_rows`, never `page`). A malformed or
 *  absent `compliance` object THROWS rather than rendering an empty register
 *  — review law 2: absence is not evidence of "no watches", and a shape
 *  drift on the wire must fail loud, not paint a false all-clear. */
export async function loadComplianceRegister(
  session: SessionTokenAccessor,
  scope: ReviewQueueScope = {},
): Promise<ComplianceRegister> {
  const env = await listReviewQueue(session, scope, null, 1);
  const c = env.compliance as { stale_evaluator?: unknown; clients?: unknown } | undefined;
  if (!c || typeof c !== "object" || typeof c.stale_evaluator !== "boolean" || !Array.isArray(c.clients)) {
    throw new Error("list_review_queue: malformed or absent `compliance` envelope object");
  }
  const clients = c.clients.filter(isComplianceClientWatch);
  if (clients.length !== c.clients.length) {
    throw new Error("list_review_queue: a compliance.clients row did not match the expected shape");
  }
  return { staleEvaluator: c.stale_evaluator, clients };
}

/** clara.ack_compliance_watch — a fresh op_key per call (never reused across a
 *  retry, doors.ts's law). */
export function ackComplianceWatch(session: SessionTokenAccessor, watchId: string, rationale: string): Promise<unknown> {
  return callDoor("ack_compliance_watch", { p_watch: watchId, p_rationale: rationale, p_op_key: crypto.randomUUID() }, { session });
}

/** clara.snooze_compliance_watch. `until` is an ISO timestamp string. */
export function snoozeComplianceWatch(
  session: SessionTokenAccessor,
  watchId: string,
  until: string,
  rationale: string,
): Promise<unknown> {
  return callDoor(
    "snooze_compliance_watch",
    { p_watch: watchId, p_until: until, p_rationale: rationale, p_op_key: crypto.randomUUID() },
    { session },
  );
}

export type ComplianceWatchConclusion = "registration_recorded" | "not_liable_documented";

/** clara.resolve_compliance_watch. */
export function resolveComplianceWatch(
  session: SessionTokenAccessor,
  watchId: string,
  conclusion: ComplianceWatchConclusion,
  evidence: string,
): Promise<unknown> {
  return callDoor(
    "resolve_compliance_watch",
    { p_watch: watchId, p_conclusion: conclusion, p_evidence: evidence, p_op_key: crypto.randomUUID() },
    { session },
  );
}
