// #659 / C88.10 — the wire contract for `clara.get_compliance_watch_disposition`
// (packages/db/migrations/0231_firm_portfolio_pack.sql): the acknowledgement echo a compliance
// watch has never had a browser-reachable reader for.
//
// WHAT WAS MISSING, AND WHY IT WAS A DOOR RATHER THAN WIRING. The three acts have shipped since
// 0016 — `ack_compliance_watch`, `snooze_compliance_watch`, `resolve_compliance_watch` — and every
// one of them stamps an actor, an instant, a rationale and an append-only event row. None of that
// was READABLE: `clara.compliance_watches` and `clara.compliance_watch_events` both FORCE RLS with
// a single `clara_fn_owner` policy and carry no application-role grant, and
// `clara.list_review_queue`'s `compliance` envelope carries nine figure/date keys and not one
// disposition key. So the surface could perform an acknowledgement and then had nothing to show
// for it after a reload.
//
// "VERSION" HAS NO REFERENT IN THIS SCHEMA, and this module does not invent one. The acceptance
// criterion asks for actor / time / version; `clara.compliance_watches` has no version column and
// `clara.audit_log.args` records only `{watch, rationale, op_key}`. What the database actually
// holds is each event's `state_before -> state_after` on the append-only trail, so that is what
// comes back and what the receipt renders. The migration's tail asserts the absent word is absent
// from the door's body too.
//
// HYDRATE-NEVER-TRUST. Every field the door can leave null is typed nullable and every arm
// degrades to an honest absence. A malformed envelope is a disposition this build could not read —
// never an empty one, because "nobody has acknowledged this" and "I could not find out" are
// different sentences on a compliance record.

import { callDoor } from "@/lib/doors";
import type { SessionTokenAccessor } from "@/lib/session";

/** One row of the append-only trail. `state_before`/`state_after` are what this table carries
 *  where the acceptance criterion asks for a revision number. */
export type WatchDispositionEvent = {
  eventKind: string | null;
  stateBefore: string | null;
  stateAfter: string | null;
  actor: string | null;
  rationale: string | null;
  createdAt: string | null;
};

export type WatchDisposition = {
  watchId: string | null;
  clientId: string | null;
  serviceGroup: string | null;
  watchKind: string | null;
  state: string | null;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
  snoozedUntil: string | null;
  resolvedConclusion: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  resolvedEvidence: string | null;
  updatedAt: string | null;
  events: WatchDispositionEvent[];
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function hydrateEvent(raw: unknown): WatchDispositionEvent | null {
  if (!isObject(raw)) return null;
  return {
    eventKind: str(raw.event_kind),
    stateBefore: str(raw.state_before),
    stateAfter: str(raw.state_after),
    actor: str(raw.actor),
    rationale: str(raw.rationale),
    createdAt: str(raw.created_at),
  };
}

export function hydrateWatchDisposition(raw: unknown): WatchDisposition | null {
  if (!isObject(raw)) return null;
  const id = str(raw.watch_id);
  if (id === null) return null; // a disposition that names no watch is not a disposition
  return {
    watchId: id,
    clientId: str(raw.client_id),
    serviceGroup: str(raw.service_group),
    watchKind: str(raw.watch_kind),
    state: str(raw.state),
    acknowledgedBy: str(raw.acknowledged_by),
    acknowledgedAt: str(raw.acknowledged_at),
    snoozedUntil: str(raw.snoozed_until),
    resolvedConclusion: str(raw.resolved_conclusion),
    resolvedBy: str(raw.resolved_by),
    resolvedAt: str(raw.resolved_at),
    resolvedEvidence: str(raw.resolved_evidence),
    updatedAt: str(raw.updated_at),
    events: Array.isArray(raw.events)
      ? raw.events.map(hydrateEvent).filter((e): e is WatchDispositionEvent => e !== null)
      : [],
  };
}

/** The disposition of one watch. A governed refusal travels as a `DoorRefusal` — CLR04 below the
 *  bookkeeper floor, CLR11 `watch not found` for a watch that names nothing OR belongs to another
 *  firm (the two are indistinguishable by the door's own design, so this module does not try to
 *  tell them apart either). */
export async function getWatchDisposition(
  watchId: string,
  opts: { session?: SessionTokenAccessor; signal?: AbortSignal } = {},
): Promise<WatchDisposition | null> {
  const raw = await callDoor<unknown>(
    "get_compliance_watch_disposition",
    { p_watch: watchId },
    { session: opts.session, signal: opts.signal },
  );
  return hydrateWatchDisposition(raw);
}

/** The LAST disposition act on the trail — an acknowledgement, a snooze or a resolution — or null
 *  when nothing has been done to this watch yet. `evaluation`/`created`/`tier_change` rows are the
 *  EVALUATOR's, not a person's, and a receipt that named one of those as "who did this" would be
 *  attributing a machine sweep to a professional. */
const DISPOSITION_EVENT_KINDS = ["acknowledged", "snoozed", "re_armed", "resolved"] as const;

export function lastDispositionAct(d: WatchDisposition | null): WatchDispositionEvent | null {
  if (d === null) return null;
  const acts = d.events.filter(
    (e) => e.eventKind !== null && (DISPOSITION_EVENT_KINDS as readonly string[]).includes(e.eventKind),
  );
  return acts.length > 0 ? (acts[acts.length - 1] ?? null) : null;
}
