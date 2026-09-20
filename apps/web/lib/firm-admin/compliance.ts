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

import { listReviewQueue, type ReviewQueueScope, type ReviewQueueRow } from "../firm/needs-you";
import { callDoor, isDoorRefusal } from "../doors";
import { getWatchDisposition, lastDispositionAct, type WatchDisposition } from "../firm/compliance-disposition";
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

/**
 * The `compliance` envelope object's VALIDATION, as a pure function over an already-read
 * envelope.
 *
 * EXTRACTED, NOT COPIED (the client Tax tab, 裁-190 / CB-AE2E-032). A second caller now needs
 * this same object for ONE client, alongside that client's `compliance_watch` ROW — which
 * carries the `watch_id` the three governed acts address and which the `compliance.clients`
 * aggregate does not carry. Reading `list_review_queue` twice for two halves of one envelope
 * would be a second RPC for data the first call already returned; re-typing the validator in
 * the second caller would be two shapes free to drift from one wire contract. So the read stays
 * one call at each site and the CHECK lives here, once.
 *
 * A malformed or absent `compliance` object THROWS rather than yielding an empty register —
 * review law 2: absence is not evidence of "no watches", and a shape drift on the wire must
 * fail loud rather than paint a false all-clear on a tax surface.
 */
export function parseComplianceEnvelope(envelope: { compliance?: unknown }): ComplianceRegister {
  const c = envelope.compliance as { stale_evaluator?: unknown; clients?: unknown } | undefined;
  if (!c || typeof c !== "object" || typeof c.stale_evaluator !== "boolean" || !Array.isArray(c.clients)) {
    throw new Error("list_review_queue: malformed or absent `compliance` envelope object");
  }
  const clients = c.clients.filter(isComplianceClientWatch);
  if (clients.length !== c.clients.length) {
    throw new Error("list_review_queue: a compliance.clients row did not match the expected shape");
  }
  return { staleEvaluator: c.stale_evaluator, clients };
}

/** Reads `list_review_queue`'s `compliance` envelope object only — `p_limit:
 *  1` because this module never consumes the paginated `rows[]`, and the live
 *  body computes `counts`/`compliance`/`lint` over the full population
 *  independent of `p_limit` (0016_a21_compliance_watch.sql:4558-4729's
 *  `counts`/`sweep` CTEs read `all_rows`, never `page`). */
export async function loadComplianceRegister(
  session: SessionTokenAccessor,
  scope: ReviewQueueScope = {},
): Promise<ComplianceRegister> {
  return parseComplianceEnvelope(await listReviewQueue(session, scope, null, 1));
}

// #996 — mounting the disposition read on /settings/compliance too. `compliance.clients` (above)
// deliberately carries no watch id; the id lives on `list_review_queue`'s own
// `row_kind==='compliance_watch'` rows (0016:4650-4662, `cw.id` projected twice over, as `id` AND
// `watch_id`), which the SAME door already returns. `complianceWatchIdsFromRows` is the pure
// extraction of that id; `loadComplianceWatchIdsForClient` reads it scoped to one client;
// `loadComplianceWatchDispositions` folds both together with `get_compliance_watch_disposition`
// (lib/firm/compliance-disposition.ts, C88.10) into one lookup the register panel keys by
// `${client_id}:${service_group}` — the same pair `compliance.clients` rows carry. No new door, no
// second query implementation, no recut of the `compliance` envelope above.

/** Pure extraction — every `row_kind==='compliance_watch'` row's `watch_id`, in the order
 *  `list_review_queue` returned them. Every other row_kind is ignored; a row of that kind with a
 *  null `watch_id` (never observed live, but the wire type allows it) is dropped rather than
 *  passed on as a caller-facing `null`. */
export function complianceWatchIdsFromRows(rows: ReviewQueueRow[]): string[] {
  return rows
    .filter((r): r is ReviewQueueRow & { watch_id: string } => r.row_kind === "compliance_watch" && r.watch_id !== null)
    .map((r) => r.watch_id);
}

/** One client's own open compliance_watch ids, `p_scope`-bound to that client — bounded to THAT
 *  client's own queue depth, never the whole firm's: an unscoped page could push a compliance row
 *  past any fixed `p_limit` on a busy firm, since `compliance_rows` shares its `section_rank` with
 *  several other row kinds (0016:4652). `p_limit:500` is the RPC's own clamp ceiling
 *  (0016:4577's `least(greatest(...),500)`), not a number this module invented. */
export async function loadComplianceWatchIdsForClient(session: SessionTokenAccessor, clientId: string): Promise<string[]> {
  const envelope = await listReviewQueue(session, { client_id: clientId }, null, 500);
  return complianceWatchIdsFromRows(envelope.rows);
}

export type ComplianceWatchDispositions = {
  /** Keyed by `${client_id}:${service_group}` — the pair `compliance.clients` rows carry. Present
   *  only for a watch that resolved to a REAL recorded act (`lastDispositionAct` non-null): a watch
   *  with nothing recorded yet and a watch whose id could not be resolved at all are
   *  indistinguishable to this map's caller, and both leave the row unchanged (#996 AC2). */
  byKey: Map<string, WatchDisposition>;
  /** True the instant ANY disposition read refused CLR04 (insufficient role) — the bookkeeper
   *  floor `get_compliance_watch_disposition` enforces while this settings section itself is
   *  viewer-floored (#996's brief). One firm-wide sentence covers every row identically: a
   *  viewer's role does not change from one watch to the next. */
  flooredBelowBookkeeper: boolean;
};

/**
 * #996 — resolves every register row's disposition through the SAME two doors the other two
 * C88.10 mount points already call. A watch id this module could not resolve, and a disposition
 * read that fails for any reason OTHER than the bookkeeper floor, both leave that row absent from
 * `byKey` (hydrate-never-trust: a read that did not answer is not evidence there is nothing to
 * show, so this adds nothing rather than guessing). A CLR04 refusal is the floor itself, so it is
 * named once rather than swallowed per watch.
 */
export async function loadComplianceWatchDispositions(
  session: SessionTokenAccessor,
  clients: ComplianceClientWatch[],
): Promise<ComplianceWatchDispositions> {
  const byKey = new Map<string, WatchDisposition>();
  let flooredBelowBookkeeper = false;
  const clientIds = Array.from(new Set(clients.map((c) => c.client_id)));
  for (const clientId of clientIds) {
    let watchIds: string[];
    try {
      watchIds = await loadComplianceWatchIdsForClient(session, clientId);
    } catch {
      continue; // this client's rows stay unchanged — a failed scoped read is not evidence of absence
    }
    for (const watchId of watchIds) {
      try {
        const disposition = await getWatchDisposition(watchId, { session });
        if (
          disposition &&
          disposition.clientId !== null &&
          disposition.serviceGroup !== null &&
          lastDispositionAct(disposition) !== null
        ) {
          byKey.set(`${disposition.clientId}:${disposition.serviceGroup}`, disposition);
        }
      } catch (e) {
        if (isDoorRefusal(e) && e.code === "CLR04") flooredBelowBookkeeper = true;
        // any other failure: this watch's id could not be resolved to a disposition — its row
        // renders unchanged, exactly like a watch id the queue never returned at all.
      }
    }
  }
  return { byKey, flooredBelowBookkeeper };
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
