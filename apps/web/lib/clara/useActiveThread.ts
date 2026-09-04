"use client";

// Resolves the thread `ClaraRail` should show, for a given altitude — firm-wide
// (`clientId` omitted) or a specific client workspace (`clientId` set). Not needed by
// the full-screen escalation pages: those already have a concrete `threadId` from the
// URL (Q2: "URL-addressable").
//
// CREATION IS NO LONGER A MOUNT SIDE EFFECT (裁-117, this train). This hook used to
// end its resolve with `await createSession(...)` whenever the altitude had no own
// session yet — so merely NAVIGATING to a client workspace minted a
// `clara.chat_sessions` row. That row can never be removed: `_tf_chat_session_update`
// (0006_runtime_core.sql:374-386) raises CLR08 'chat sessions are not deleted' on
// DELETE and refuses every UPDATE touching a column other than `visibility`, and the
// table has no `archived_at` at all. One permanent, unreachable row per (user, client
// visited) is the cost, and nothing in the product could ever show or retire them.
//
// So creation is an ACT now — `createThread`, wired to the rail's own "New thread"
// control — and an altitude with no thread resolves honestly to `threadId: null` with
// `resolving: false`, which `ClaraThreadView` renders as an empty state that offers
// the act. What it must NOT render is the loading arm: "resolving forever" is the
// same never-settling shape 裁-132 and the P6-5 stranded-rail fix both exist to
// remove, which is why `resolving` is a returned field rather than something the view
// infers from `threadId === null`.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { createSession, listSessionsForCaller, type SessionRow } from "./api";
import { claraThreadStore } from "./threadStore";
import type { SessionTokenAccessor } from "@/lib/session";

const FIRM_ALTITUDE = "firm";

/** Every session the caller AUTHORED at this altitude, in the order the wire
 *  delivered them (`GET /api/chat/sessions` orders `created_at desc`,
 *  packages/runtime/src/chatRoutes.ts:168) — newest first.
 *
 *  THE FILTER IS THE SWITCHER'S VISIBILITY LAW, and it is deliberately the same
 *  one `selectOwnSession` has always applied. The wire also carries firm-SHARED
 *  sessions authored by COLLEAGUES (chatRoutes.ts:167 selects
 *  `visibility = 'firm' or created_by = $2`), and those are excluded here: a
 *  colleague's shared thread is readable, but making it this rail's ACTIVE thread
 *  would put the human's next turn into someone else's conversation. 裁-117 rules
 *  a small own-threads list for beta; a firm-threads browser is its own design. */
export function ownSessionsForAltitude<T extends { created_by: string; client_id: string | null }>(
  sessions: readonly T[],
  callerSubject: string,
  clientId?: string,
): T[] {
  return sessions.filter((session) =>
    session.created_by === callerSubject &&
    (clientId ? session.client_id === clientId : session.client_id === null),
  );
}

/** Unchanged behaviour, now expressed through the list above: the FIRST own session
 *  at this altitude, i.e. the newest. Kept exported — it is the pre-menu contract
 *  and its own cells still pin it. */
export function selectOwnSession(
  sessions: readonly SessionRow[],
  callerSubject: string,
  clientId?: string,
): SessionRow | undefined {
  return ownSessionsForAltitude(sessions, callerSubject, clientId)[0];
}

/** The one resolution rule, as a pure function so both polarities can be driven
 *  without mounting anything.
 *
 *  AN EXPLICIT SELECTION WINS, BUT ONLY IF IT IS STILL THE CALLER'S OWN THREAD AT
 *  THIS ALTITUDE. The selection lives in a module-level store keyed by altitude and
 *  outlives any single list read, so a stale id — a thread that has since become
 *  invisible, or an altitude key colliding with an id from another firm's session —
 *  must never be handed to the view merely because it was once chosen. Membership in
 *  the freshly-read own-list is the evidence; absence falls back to the newest, which
 *  is exactly the pre-menu behaviour. */
export function resolveOwnThread(
  ownSessions: readonly { id: string }[],
  selectedId: string | null,
): string | null {
  if (selectedId && ownSessions.some((s) => s.id === selectedId)) return selectedId;
  return ownSessions[0]?.id ?? null;
}

/** A session row as this hook hands it on.
 *
 *  `created_at` IS NULLABLE HERE AND NOT ON THE WIRE, and that difference is the whole
 *  point. `SessionRow.created_at` is `timestamptz not null` — every row the DB returns
 *  has one. A row this hook is holding because a create SUCCEEDED but the confirming
 *  read did not come back has no such value, and there is nothing honest to put in its
 *  place: `Date.now()` is this browser's clock, not the ledger's, and the menu renders
 *  it to the human as "Started …". So the field is null and the menu says "New
 *  conversation" instead. This hook never invents a time. */
export type ThreadRow = Omit<SessionRow, "created_at"> & {
  created_at: string | null;
  /** Set only on the row above. It carries the REASON (this row has not been confirmed
   *  by a read) while `created_at === null` carries the FACT the menu renders from — the
   *  label keys on the fact alone, so the two can never disagree on screen. */
  provisional?: true;
};

/**
 * WHETHER A CREATE COULD LAND SOMEWHERE THE HUMAN WILL SEE IT.
 *
 * Pure, exported and driven by its own cells, because it is the whole of a refusal branch
 * (review law 1) and because the conjunction below is easy to get wrong in exactly one
 * direction — too permissive.
 *
 * BOTH HALVES, and the second is the one review found missing. `!resolving` alone leaves
 * a FAILED read open: that settles with `resolving: false` AND `callerSubject: null`, the
 * rail shows its error banner, and the thread menu — which is not part of that ladder —
 * would still offer New. A create from there succeeds at the runtime and is then listed
 * by nothing, because `ownSessionsForAltitude` has no caller projection to match on, and
 * the row can never be archived or deleted (`_tf_chat_session_update` raises CLR08 on a
 * DELETE). That is the un-removable-row class 裁-117 exists to abolish.
 *
 * THE TWO HALVES OVERLAP TODAY and the redundancy is deliberate. `useActiveThreadId`'s
 * resolve effect clears `callerSubject` in the same commit that sets `resolving`, so no
 * state can currently distinguish them — a mutant dropping `!resolving` changes no cell,
 * which is reported rather than smoothed over. The conjunction stays because that
 * implication is a property of that ONE effect, not of this gate: keeping a previous
 * read's projection across a re-resolve (a reasonable thing to want, to stop the menu
 * flickering on an altitude switch) would make the projection half go true mid-read and
 * re-open the hole. `./thread-resolution.test.ts` pins the coupling separately.
 */
export function canCreateThreadIn(state: {
  forThisAltitude: boolean;
  resolving: boolean;
  callerSubject: string | null;
}): boolean {
  return state.forThisAltitude && !state.resolving && state.callerSubject !== null;
}

type ResolvedThread = {
  altitude: string;
  sessions: ThreadRow[];
  callerSubject: string | null;
  resolving: boolean;
  error: string | null;
};

export type ActiveThread = {
  threadId: string | null;
  error: string | null;
  /** TRUE only while the session read is actually in flight. `false` with a null
   *  `threadId` is the honest "this altitude has no conversation yet" state, and it
   *  is a different thing from "still loading" — the view renders an offer, not a
   *  spinner. */
  resolving: boolean;
  /** The caller's own threads at this altitude, newest first — the switcher's list. */
  threads: readonly ThreadRow[];
  /** The explicit act that mints a thread. Resolves to the new id, or null when the
   *  create failed (the error is surfaced through `error`). */
  createThread: () => Promise<string | null>;
  creating: boolean;
  /** Whether a create could land somewhere the human will see it — `canCreateThreadIn`
   *  above holds the reasoning and its own cells. */
  canCreate: boolean;
  /** Point this altitude at one of `threads`. A no-op for an id this altitude does
   *  not own — the switcher can only offer what it listed, and a caller that got the
   *  id from somewhere else must not be able to steer the rail with it. */
  selectThread: (threadId: string) => void;
};

export function visibleThreadForAltitude(
  resolved: { altitude: string; threadId: string | null; error: string | null },
  altitude: string,
): { threadId: string | null; error: string | null } {
  return resolved.altitude === altitude
    ? { threadId: resolved.threadId, error: resolved.error }
    : { threadId: null, error: null };
}

export function useActiveThreadId(auth: SessionTokenAccessor, clientId?: string): ActiveThread {
  const altitude = clientId ?? FIRM_ALTITUDE;
  const [resolved, setResolved] = useState<ResolvedThread>({
    altitude, sessions: [], callerSubject: null, resolving: true, error: null,
  });
  const [creating, setCreating] = useState(false);
  const active = useRef<{ altitude: string } | null>(null);

  const selectedId = useSyncExternalStore(
    claraThreadStore.subscribe,
    () => claraThreadStore.getSelectedThreadForAltitude(altitude),
    () => claraThreadStore.getSelectedThreadForAltitude(altitude),
  );

  useEffect(() => {
    let cancelled = false;

    // P6-5 — THE OUTGOING THREAD'S STORE ENTRY IS NOT DELETED ANY MORE.
    //
    // This used to call `claraThreadStore.reset(active.current.threadId)` on an altitude
    // change. What that deleted was the outgoing thread's `activeTaskId`, its stream status
    // and its provisional buffer — i.e. a turn that was still RUNNING. Navigating away from
    // client A mid-turn and back therefore returned to an empty thread with no task to
    // re-attach to, which is the "a keyed boundary tears down a live SSE attachment"
    // failure the structural boundary had to answer rather than inherit.
    //
    // It was never the wall it looked like, either. What keeps client A's transcript off
    // client B's screen is the altitude comparison below (a resolution for another altitude
    // renders as `threadId: null`, and `ClaraThreadView` reads nothing from the store
    // without a thread id) plus `RailMount`'s structural key, which remounts this whole
    // subtree on every switch. The store is keyed by THREAD ID and a different client
    // resolves a different thread, so a surviving entry is unreachable from the wrong
    // altitude by construction — see components/clara/rail-mount.tsx's own note.
    //
    // `active.current` is still cleared, so the ref never claims an altitude this hook has
    // stopped resolving.
    if (active.current !== null && active.current.altitude !== altitude) {
      active.current = null;
    }
    setResolved({ altitude, sessions: [], callerSubject: null, resolving: true, error: null });

    async function resolve() {
      try {
        const { sessions, callerSubject } = await listSessionsForCaller(auth);
        if (cancelled) return;
        active.current = { altitude };
        setResolved({ altitude, sessions, callerSubject, resolving: false, error: null });
      } catch (err) {
        if (!cancelled) {
          setResolved({ altitude, sessions: [], callerSubject: null, resolving: false, error: (err as Error).message });
        }
      }
    }

    void resolve();
    return () => {
      cancelled = true;
    };
  }, [altitude, auth, clientId]);

  // A resolution belonging to a DIFFERENT altitude renders as nothing at all. The id
  // and the error still pass through `visibleThreadForAltitude` — the same wall this
  // hook has always closed a mid-navigation resolution with, and the one its own cell
  // drives — and the list and the resolving flag are fenced by the same comparison so
  // no half of the envelope can outlive the altitude it was read for.
  const forThisAltitude = resolved.altitude === altitude;
  const threads = forThisAltitude && resolved.callerSubject
    ? ownSessionsForAltitude(resolved.sessions, resolved.callerSubject, clientId)
    : [];
  const visible = visibleThreadForAltitude(
    { altitude: resolved.altitude, threadId: resolveOwnThread(threads, selectedId), error: resolved.error },
    altitude,
  );

  const selectThread = useCallback(
    (next: string) => {
      if (!threads.some((s) => s.id === next)) return;
      claraThreadStore.selectThreadForAltitude(altitude, next);
    },
    [altitude, threads],
  );

  // THE CREATE IS CONFIRMED BY A READ, not by a row this hook composed. Two defects the
  // first cut of this function carried, both found in review, both closed here:
  //
  //   (1) IT FABRICATED A TIMESTAMP. The optimistic row carried
  //       `created_at: new Date().toISOString()` — this browser's clock — and the menu
  //       renders that field to the human as "Started …". A time the ledger never
  //       recorded, presented as the conversation's own. Re-reading the list is what
  //       supplies the DB's own `created_at`; when the re-read does not come back, the
  //       fallback row carries `created_at: null` and the menu says so instead.
  //
  //   (2) IT COULD SELECT A THREAD IT HAD JUST DROPPED. The optimistic append bailed out
  //       when `prev.callerSubject` was null (a create racing the first list read), but
  //       the `selectThreadForAltitude` call below it ran anyway — so the selection
  //       pointed at a row that was not in the list, `resolveOwnThread` fell back to the
  //       previous thread, and the session that had just been minted was invisible AND
  //       un-archivable. Exactly the defect this train exists to abolish. The re-read
  //       carries its own `callerSubject`, so that state is unreachable on this path; the
  //       fallback below still refuses to select what it cannot list.
  const createThread = useCallback(async () => {
    setCreating(true);
    try {
      const id = await createSession(auth, clientId ? { clientId } : {});
      try {
        // The authoritative shape: the runtime's own row, with the runtime's own
        // `created_at` and the caller projection bound to the same token that read it.
        const { sessions, callerSubject } = await listSessionsForCaller(auth);
        setResolved((prev) => (prev.altitude === altitude
          ? { ...prev, sessions, callerSubject, error: null }
          : prev));
        claraThreadStore.selectThreadForAltitude(altitude, id);
        return id;
      } catch (readErr) {
        // THE SESSION EXISTS — the create returned an id — so losing it here would be
        // worse than showing it provisionally. It goes on the list with NO time and a
        // `provisional` marker, and the next successful read replaces it wholesale.
        let listed = false;
        setResolved((prev) => {
          if (prev.altitude !== altitude || prev.callerSubject === null) return prev;
          listed = true;
          const row: ThreadRow = {
            id,
            title: null,
            client_id: clientId ?? null,
            visibility: "private",
            created_by: prev.callerSubject,
            created_at: null,
            provisional: true,
          };
          return { ...prev, sessions: [row, ...prev.sessions], error: null };
        });
        // SELECT ONLY WHAT IS LISTED. `resolveOwnThread` honours a selection only for an
        // id in this altitude's own list, so selecting an unlisted row is not merely
        // useless — it is the silent-orphan state above. With no caller projection to
        // list it under, the honest outcome is the read's own error.
        if (listed) {
          claraThreadStore.selectThreadForAltitude(altitude, id);
          return id;
        }
        setResolved((prev) => (prev.altitude === altitude
          ? { ...prev, error: (readErr as Error).message }
          : prev));
        return null;
      }
    } catch (err) {
      setResolved((prev) => (prev.altitude === altitude ? { ...prev, error: (err as Error).message } : prev));
      return null;
    } finally {
      setCreating(false);
    }
  }, [altitude, auth, clientId]);

  const canCreate = canCreateThreadIn({
    forThisAltitude,
    resolving: resolved.resolving,
    callerSubject: resolved.callerSubject,
  });

  return {
    threadId: visible.threadId,
    error: visible.error,
    canCreate,
    // A resolution for ANOTHER altitude reads as "still resolving", never as "there is
    // no thread here": the read for THIS altitude is genuinely still in flight, and the
    // empty-state offer must not flash over a rail mid-navigation.
    resolving: forThisAltitude ? resolved.resolving : true,
    threads,
    createThread,
    creating,
    selectThread,
  };
}
