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
//   - `loader` no longer needs a stable identity to avoid a storm — the P3
//     follow-up below defends it exactly like `session` now does. It SHOULD
//     still be a `useCallback`-stable closure over the part's primitive ids
//     where that is free (the cardHooks.ts `load` discipline): a stable
//     identity is ordinary React perf hygiene, not a correctness requirement
//     here any more.
//   - review note N6: dropping the `[loader]` dependency also dropped the
//     dashboard precedent's re-hydrate-ON-LOADER-CHANGE trigger. A NEW
//     loader identity alone never re-triggers hydration any more — only a
//     null<->present `session` transition does (see `hasSession` below). A
//     card whose captured ids CHANGE (e.g. the user picks a different
//     document) must be React-`key`ed by those ids (unmount/remount), or
//     call `reload()` itself on the change — it must not rely on merely
//     passing a differently-scoped `loader` to this hook.
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
//   - One-liner worth stating explicitly (round-2): `hasSession` below is a
//     null<->present TRANSITION detector, not a general "session changed"
//     detector. Reconfiguring the blessed singleton's underlying token source
//     while it stays present (a same-truthiness swap) does NOT by itself
//     re-trigger a mount reload here — see ../session-accessor.ts's own header
//     for why that is unreachable under the intended one-singleton usage, not an
//     oversight.
//
// P3 FOLLOW-UP (loader-stability hardening — the recorded next storm class):
// an UNSTABLE `loader` identity (a fresh inline closure built every render —
// e.g. `useHydratedPart(session, () => getDraftReview(id))` written directly
// in a card's JSX) could storm this hook exactly the way an unstable
// `session` object once did (the 4GB-heap OOM measurement, above):
// `reloadImpl` closed over `loader` BY IDENTITY (`useCallback(..., [loader])`),
// so a churning loader changed `reloadImpl`'s own identity every render, which
// re-fired the mount effect (keyed on `[reloadImpl, hasSession]`) right along
// with it. The hook now reads the latest loader via a ref (`loaderRef`, the
// same pattern as `sessionRef`) — `reloadImpl` depends on NEITHER `loader` nor
// `session` by identity any more, only on a stable empty dependency list, so
// its own identity never changes and the mount effect fires exactly once per
// null<->present session transition, no matter how many fresh loader (or
// session) closures a parent re-render hands in. `loaderRef.current` is
// written on every render (same discipline as `sessionRef`), so a MANUAL
// `reload()` call still always invokes whichever loader body is CURRENT at
// call time — no stale closure, even though the effect that fires the very
// first reload was registered once, on mount, over whichever loader existed
// then.

import { useCallback, useEffect, useRef, useState } from "react";
import { RefusalError, WireError } from "../wire";
import type { SessionTokenAccessor } from "@/lib/session";

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

  // P3 follow-up: the SAME ref discipline as sessionRef, for the same reason —
  // see the header's "P3 FOLLOW-UP" paragraph. Written on every render, so a
  // manual reload() always calls whichever loader body is CURRENT.
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  // The internal variant, carrying the private `preserveErrorOnSuccess` opt-in
  // (finding 1's sticky-refusal mechanism). Round-2 finding: the PUBLIC `reload`
  // exposed on the returned state must not leak this parameter — a consumer must
  // not even be ABLE to pass it, accidentally or otherwise. `reload` below is a
  // separate, genuinely param-less closure over this one; only `act` (internally)
  // ever calls `reloadImpl` with the opt-in directly.
  const reloadImpl = useCallback(
    async (opts?: { preserveErrorOnSuccess?: boolean }) => {
      const sess = sessionRef.current;
      if (!sess) return;
      setLoading(true);
      try {
        const result = await loaderRef.current(sess);
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
    // Deliberately empty (P3 follow-up): `sess` and the loader are both read via
    // refs, never closed over by identity, so `reloadImpl` itself never changes
    // identity across renders — no `[loader]` (or `[session]`) dependency left to
    // churn and re-fire the mount effect below.
    [],
  );

  // `hasSession` (not `session`'s object identity, and `reloadImpl` is now
  // permanently stable regardless of `loader`'s identity too) is the DELIBERATE
  // dependency here — see the sessionRef/loaderRef comments above. This project's
  // eslint config does not register `react-hooks/exhaustive-deps`, so no
  // suppression comment is needed; if that rule is ever added, this effect's deps
  // are intentionally narrower than a naive "close over everything reloadImpl
  // reads" would suggest.
  useEffect(() => {
    void reloadImpl();
  }, [reloadImpl, hasSession]);

  /** The PUBLIC reload — genuinely `() => Promise<void>`, no hidden opts channel
   *  (round-2 finding). Always clears any standing err/clr on success, exactly
   *  like the internal variant's default. */
  const reload = useCallback(() => reloadImpl(), [reloadImpl]);

  const act = useCallback(
    async (fn: () => Promise<void>, onOk?: () => void) => {
      setBusy(true);
      setErr(null);
      setClr(null);
      try {
        await fn();
        onOk?.();
        await reloadImpl(); // re-derive — never trust the write's own view of the result.
      } catch (e) {
        applyFailure(e, setErr, setClr);
        // Sticky refusal (finding 1): re-derive `data` for real, but PRESERVE the
        // err/clr this catch just set — a follow-up reload succeeding (the row
        // still reads fine) must not silently erase the write's own refusal. Only
        // the reload's OWN failure (still unconditional, inside its catch above)
        // or the next act() call retires it.
        await reloadImpl({ preserveErrorOnSuccess: true }).catch(() => {});
      } finally {
        setBusy(false);
      }
    },
    [reloadImpl],
  );

  return { data, loading, busy, err, clr, reload, act };
}
