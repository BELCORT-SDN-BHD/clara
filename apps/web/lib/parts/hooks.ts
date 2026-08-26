"use client";

// The generic hydrate-never-trust hook, ported mechanism-for-mechanism from
// apps/dashboard/app/shared/cards/cardHooks.ts's `useCard`: every identifier-only
// part re-derives authoritative state from a pinned DB read function on mount, and
// again after EVERY mutation — NO OPTIMISTIC UI, ever (contract §3.2). Same
// reload()/act() shape as the dashboard precedent, same "the loader MUST be a
// useCallback-stable closure over the part's primitive ids, or reload will loop"
// discipline — that responsibility sits with the CONSUMER (the specific card),
// exactly as it does for the dashboard's `load` functions.
//
// P3 wires this to the specific read functions per part type (get_draft_review,
// get_doc_entry_diff, get_sweep_run, get_open_question, …) as the rich card UIs
// land; this module ships only the mechanism, ids-only in.

import { useCallback, useEffect, useState } from "react";
import { RefusalError, WireError } from "../wire";
import type { SessionTokenAccessor } from "../session-contract";

export type PartClr = { code: string; reason: string | null } | null;

export type PartHydrationState<T> = {
  data: T | null;
  loading: boolean;
  busy: boolean;
  err: string | null;
  clr: PartClr;
  /** Re-derive from the DB. Called once on mount, and again by `act` after every
   *  mutation attempt (success AND failure — the DB may have partially applied). */
  reload: () => Promise<void>;
  /** Run a governed write, then ALWAYS reload — never assume the write's own
   *  response is the new truth. */
  act: (fn: () => Promise<void>, onOk?: () => void) => Promise<void>;
};

function applyFailure(e: unknown, setErr: (s: string | null) => void, setClr: (c: PartClr) => void): void {
  if (e instanceof RefusalError) {
    // The deliberate no-hydrate exception (contract §3.2): a governed refusal
    // carries its own message verbatim — never re-derived, never re-worded.
    setErr(e.message);
    setClr({ code: e.code, reason: e.reason });
  } else if (e instanceof WireError) {
    setErr(e.message);
    setClr(null);
  } else {
    setErr(e instanceof Error ? e.message : String(e));
    setClr(null);
  }
}

/** `session` is `null` while the caller has not yet resolved a session (e.g. still
 *  reading cookies) — reload silently no-ops in that state, exactly as the
 *  dashboard's `useCard` no-ops on `token === null`. */
export function useHydratedPart<T>(
  session: SessionTokenAccessor | null,
  loader: (session: SessionTokenAccessor) => Promise<T>,
): PartHydrationState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [clr, setClr] = useState<PartClr>(null);

  const reload = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      setData(await loader(session));
      setErr(null);
      setClr(null);
    } catch (e) {
      applyFailure(e, setErr, setClr);
    } finally {
      setLoading(false);
    }
  }, [session, loader]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const act = useCallback(
    async (fn: () => Promise<void>, onOk?: () => void) => {
      setBusy(true);
      setErr(null);
      setClr(null);
      try {
        await fn();
        onOk?.();
        await reload(); // re-derive — never trust the write's own view of the result.
      } catch (e) {
        applyFailure(e, setErr, setClr);
        await reload().catch(() => {}); // still re-derive: the DB may have partially applied.
      } finally {
        setBusy(false);
      }
    },
    [reload],
  );

  return { data, loading, busy, err, clr, reload, act };
}
