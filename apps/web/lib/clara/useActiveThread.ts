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
export function ownSessionsForAltitude(
  sessions: readonly SessionRow[],
  callerSubject: string,
  clientId?: string,
): SessionRow[] {
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
  ownSessions: readonly SessionRow[],
  selectedId: string | null,
): string | null {
  if (selectedId && ownSessions.some((s) => s.id === selectedId)) return selectedId;
  return ownSessions[0]?.id ?? null;
}

type ResolvedThread = {
  altitude: string;
  sessions: SessionRow[];
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
  threads: readonly SessionRow[];
  /** The explicit act that mints a thread. Resolves to the new id, or null when the
   *  create failed (the error is surfaced through `error`). */
  createThread: () => Promise<string | null>;
  creating: boolean;
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

  const createThread = useCallback(async () => {
    setCreating(true);
    try {
      const id = await createSession(auth, clientId ? { clientId } : {});
      // The new row is appended to THIS altitude's list and selected in one commit, so
      // the switcher can offer it immediately without waiting for a second list read —
      // and `resolveOwnThread`'s membership check (which the selection must pass) sees
      // it. The row's own fields come from the create call's inputs plus the id the
      // runtime returned; nothing about it is inferred.
      setResolved((prev) => {
        if (prev.altitude !== altitude || prev.callerSubject === null) return prev;
        const row: SessionRow = {
          id,
          title: null,
          client_id: clientId ?? null,
          visibility: "private",
          created_by: prev.callerSubject,
          created_at: new Date().toISOString(),
        };
        return { ...prev, sessions: [row, ...prev.sessions], error: null };
      });
      claraThreadStore.selectThreadForAltitude(altitude, id);
      return id;
    } catch (err) {
      setResolved((prev) => (prev.altitude === altitude ? { ...prev, error: (err as Error).message } : prev));
      return null;
    } finally {
      setCreating(false);
    }
  }, [altitude, auth, clientId]);

  return {
    threadId: visible.threadId,
    error: visible.error,
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
