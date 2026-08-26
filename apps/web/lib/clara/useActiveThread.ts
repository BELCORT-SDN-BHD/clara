"use client";

// Resolves (or creates) the thread `ClaraRail` should show, for a given altitude —
// firm-wide (`clientId` omitted) or a specific client workspace (`clientId` set). Not
// needed by the full-screen escalation pages: those already have a concrete
// `threadId` from the URL (Q2: "URL-addressable").

import { useEffect, useState } from "react";

import { createSession, listSessions } from "./api";
import type { SessionTokenAccessor } from "./sessionContract";

export function useActiveThreadId(
  auth: SessionTokenAccessor,
  clientId?: string,
): { threadId: string | null; error: string | null } {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setThreadId(null);
    setError(null);

    async function resolve() {
      try {
        const sessions = await listSessions(auth);
        const match = sessions.find((s) => (clientId ? s.client_id === clientId : s.client_id === null));
        const id = match ? match.id : await createSession(auth, clientId ? { clientId } : {});
        if (!cancelled) setThreadId(id);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    }

    void resolve();
    return () => {
      cancelled = true;
    };
  }, [auth, clientId]);

  return { threadId, error };
}
