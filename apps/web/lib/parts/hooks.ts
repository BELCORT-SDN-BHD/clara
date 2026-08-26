"use client";

// The generic hydrate-never-trust hook, ported mechanism-for-mechanism from
// apps/dashboard/app/shared/cards/cardHooks.ts's `useCard`: every identifier-only
// part re-derives authoritative state from a pinned DB read function on mount, and
// again after EVERY mutation — NO OPTIMISTIC UI, ever (contract §3.2).
//
// P3 wires this to the specific read functions per part type (get_draft_review,
// get_doc_entry_diff, get_sweep_run, get_open_question, …) as the rich card UIs
// land; this module ships only the mechanism, ids-only in.
//
// CONSUMER CONTRACT (fix-round, independent review finding 2 — read before calling
// this from a card):
//   - `loader` MUST be a useCallback-stable closure over the part's primitive ids
//     (the cardHooks.ts `load` discipline, unchanged).
//   - `session` SHOULD be a referentially STABLE SessionTokenAccessor. Import the
//     blessed singleton `sessionTokenAccessor` from ../session-accessor.ts — never
//     construct a fresh accessor object literal inline at a call site
//     (`{ getAccessToken: () => getSessionToken() }`), which is the exact anti-
//     pattern that drove a 4GB heap OOM in this fix round's own measurement.
//   - The hook now DEFENDS against a non-stable `session` too (it reads the latest
//     accessor via a ref rather than depending on its object identity — see
//     `sessionRef` below), so an unstable accessor degrades to "no storm, but no
//     free perf win" rather than an infinite loop. That defense is a backstop, not
//     a license: still pass the stable singleton.

import { useCallback, useEffect, useRef, useState } from "react";
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
   *  mutation attempt (success AND failure — the DB may have partially applied).
   *  A plain call (no args) always clears any standing err/clr on success — use
   *  this for a manual "refresh" affordance. */
  reload: () => Promise<void>;
  /** Run a governed write, then ALWAYS reload — never assume the write's own
   *  response is the new truth. A refusal `act()` surfaces is STICKY across the
   *  follow-up reload it triggers (fix-round finding 1): it is retired only by the
   *  NEXT `act()` call, or by that follow-up reload itself failing (whose own
   *  failure then becomes the shown error) — never silently by a read that merely
   *  happens to succeed. The write failing is real news even when the row still
   *  reads fine. */
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

  // Fix-round finding 2: read the LATEST accessor via a ref, written on every
  // render (a plain assignment during render — React allows mutating your own
  // ref this way; no effect needed). `reload`/the mount effect below depend on
  // `hasSession` (a primitive boolean), never on `session`'s object identity —
  // so a caller that (against the header's advice) passes a fresh accessor
  // object every render can no longer drive an infinite reload loop: the effect
  // only re-fires on a genuine null<->present transition, and every reload
  // still calls through to whichever accessor is CURRENT at call time.
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const hasSession = session != null;

  const reload = useCallback(
    async (opts?: { preserveErrorOnSuccess?: boolean }) => {
      const sess = sessionRef.current;
      if (!sess) return;
      setLoading(true);
      try {
        const result = await loader(sess);
        setData(result);
        // Sticky refusal (finding 1): a plain reload (no opts, e.g. mount or a
        // manual refresh) still clears err/clr on success as always. Only the
        // internal post-failed-act reload below asks to preserve them.
        if (!opts?.preserveErrorOnSuccess) {
          setErr(null);
          setClr(null);
        }
      } catch (e) {
        applyFailure(e, setErr, setClr);
      } finally {
        setLoading(false);
      }
    },
    [loader],
  );

  // `hasSession` (not `session`'s object identity) is the DELIBERATE dependency
  // here — see the sessionRef comment above. This project's eslint config does not
  // register `react-hooks/exhaustive-deps`, so no suppression comment is needed;
  // if that rule is ever added, this effect's deps are intentionally narrower than
  // a naive "close over everything reload reads" would suggest.
  useEffect(() => {
    void reload();
  }, [reload, hasSession]);

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
        // Sticky refusal (finding 1): re-derive `data` for real, but PRESERVE the
        // err/clr this catch just set — a follow-up reload succeeding (the row
        // still reads fine) must not silently erase the write's own refusal. Only
        // the reload's OWN failure (still unconditional, inside its catch above)
        // or the next act() call retires it.
        await reload({ preserveErrorOnSuccess: true }).catch(() => {});
      } finally {
        setBusy(false);
      }
    },
    [reload],
  );

  return { data, loading, busy, err, clr, reload, act };
}
