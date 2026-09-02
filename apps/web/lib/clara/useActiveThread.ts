"use client";

// Resolves (or creates) the thread `ClaraRail` should show, for a given altitude —
// firm-wide (`clientId` omitted) or a specific client workspace (`clientId` set). Not
// needed by the full-screen escalation pages: those already have a concrete
// `threadId` from the URL (Q2: "URL-addressable").

import { useEffect, useRef, useState } from "react";

import { createSession, listSessionsForCaller, type SessionRow } from "./api";
import type { SessionTokenAccessor } from "@/lib/session";

const FIRM_ALTITUDE = "firm";

export function selectOwnSession(
  sessions: readonly SessionRow[],
  callerSubject: string,
  clientId?: string,
): SessionRow | undefined {
  return sessions.find((session) =>
    session.created_by === callerSubject &&
    (clientId ? session.client_id === clientId : session.client_id === null),
  );
}

type ResolvedThread = {
  altitude: string;
  threadId: string | null;
  error: string | null;
};

export function visibleThreadForAltitude(
  resolved: ResolvedThread,
  altitude: string,
): { threadId: string | null; error: string | null } {
  return resolved.altitude === altitude
    ? { threadId: resolved.threadId, error: resolved.error }
    : { threadId: null, error: null };
}

export function useActiveThreadId(
  auth: SessionTokenAccessor,
  clientId?: string,
): { threadId: string | null; error: string | null } {
  const altitude = clientId ?? FIRM_ALTITUDE;
  const [resolved, setResolved] = useState<ResolvedThread>({ altitude, threadId: null, error: null });
  const active = useRef<{ altitude: string; threadId: string } | null>(null);

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
    // client B's screen is `visibleThreadForAltitude` below (a resolution for another
    // altitude renders as `threadId: null`, and `ClaraThreadView` reads nothing from the
    // store without a thread id) plus `RailMount`'s structural key, which remounts this
    // whole subtree on every switch. The store is keyed by THREAD ID and a different client
    // resolves a different thread, so a surviving entry is unreachable from the wrong
    // altitude by construction — see components/clara/rail-mount.tsx's own note.
    //
    // `active.current` is still cleared, so the ref never claims an altitude this hook has
    // stopped resolving.
    if (active.current !== null && active.current.altitude !== altitude) {
      active.current = null;
    }
    setResolved({ altitude, threadId: null, error: null });

    async function resolve() {
      try {
        const { sessions, callerSubject } = await listSessionsForCaller(auth);
        const match = selectOwnSession(sessions, callerSubject, clientId);
        const id = match ? match.id : await createSession(auth, clientId ? { clientId } : {});
        if (!cancelled) {
          active.current = { altitude, threadId: id };
          setResolved({ altitude, threadId: id, error: null });
        }
      } catch (err) {
        if (!cancelled) setResolved({ altitude, threadId: null, error: (err as Error).message });
      }
    }

    void resolve();
    return () => {
      cancelled = true;
    };
  }, [altitude, auth, clientId]);

  return visibleThreadForAltitude(resolved, altitude);
}
