"use client";

// The hydrate-never-trust mechanism for the P3 firm/registers surfaces — the same
// contract as lib/parts/hooks.ts's `useHydratedPart` (mount-load, reload-after-every-
// write, sticky-refusal-across-the-follow-up-reload), reimplemented narrowly rather
// than reused because these loaders never take a nullable session: every call site
// here passes the blessed `sessionTokenAccessor` singleton straight into `getRows`/
// `callDoor`, which themselves classify "not authenticated" as a typed `kind:
// "no_session"` error — there is no separate "session not yet resolved" state to
// gate on. Reusing useHydratedPart's session-presence branch for an accessor that is
// NEVER null would be a second, unexercised code path; this hook keeps only the part
// this surface actually needs.
//
// UNLIKE useHydratedPart, this hook keeps the RAW thrown error (a ReadError/DoorError/
// DoorRefusal instance, not just its message) — components/firm's DataState renders
// distinct no_session/forbidden/not_found copy from `.kind`, which a message-only
// state would lose (AGENTS.md's "spelling is not identity": never re-derive a kind
// from message text).
//
// CONSUMER CONTRACT (ported from lib/parts/hooks.ts's own header — the same shape of
// warning applies here, adapted to this hook's narrower surface):
//   - `loader` does NOT need a stable identity to avoid a storm: it is read via
//     `loaderRef`, updated on every render, so a fresh inline closure every render
//     never itself re-triggers anything. It SHOULD still be a reasonably cheap
//     closure — ordinary React hygiene, not a correctness requirement here.
//   - A NEW loader identity ALONE never re-triggers a reload — the mount effect
//     fires exactly once, on mount, for the lifetime of the component instance. A
//     component whose captured ids CHANGE (e.g. AgingRegister's AR/AP toggle, or a
//     different clientId) must either React-`key` itself by those ids (unmount/
//     remount) or call `reload()` explicitly on the change (see
//     components/registers/aging-register.tsx for the live precedent) — it must
//     NOT rely on merely passing a differently-scoped `loader` to this hook.
//   - Independent review finding PC2 (2026-08-27): a monotonic reload-EPOCH (below)
//     makes two overlapping reload()/act() calls safe BY CONSTRUCTION — only the
//     LAST-STARTED call's result is ever committed, regardless of which one's
//     network request resolves first. A consumer must not, and does not need to,
//     build its own "ignore a stale response" logic on top of this hook.

import { useCallback, useEffect, useRef, useState } from "react";

export type AsyncReadState<T> = {
  data: T | null;
  loading: boolean;
  busy: boolean;
  error: unknown;
  /** Re-derive from the DB. Clears any standing error on success. */
  reload: () => Promise<void>;
  /** Run a governed write, then ALWAYS reload — never assume the write's own
   *  response is the new truth. A failure here is STICKY across the follow-up
   *  reload it triggers: only the next `act()` call, or that reload's OWN
   *  failure, retires it. Resolves `true` on success, `false` on a caught
   *  failure — NEVER rejects — so a caller (e.g. a form that must decide whether
   *  to clear its own input) can branch on the outcome without racing this
   *  hook's own state updates. */
  act: (fn: () => Promise<void>) => Promise<boolean>;
};

export function useAsyncRead<T>(loader: () => Promise<T>): AsyncReadState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  // THE RELOAD EPOCH (independent review finding PC2, fix-required): every call to
  // reloadImpl claims the NEXT epoch number before awaiting anything. A call only
  // commits its result (setData/setError/setLoading) if its OWN claimed epoch is
  // still the CURRENT one when its await resolves — a newer call having started
  // in the meantime bumps the current epoch, which silently retires every older
  // in-flight call's result regardless of resolution ORDER. Measured without this
  // guard: two overlapping reloads (e.g. AgingRegister's AR toggled to AP, then
  // immediately back to AR) could commit the FIRST call's response if it happened
  // to resolve after the second — the classic "the older, slower response wins"
  // race, rendering stale/wrong data on screen with no visible error.
  const epochRef = useRef(0);

  const reloadImpl = useCallback(async (opts?: { preserveErrorOnSuccess?: boolean }) => {
    const myEpoch = ++epochRef.current;
    setLoading(true);
    try {
      const result = await loaderRef.current();
      if (epochRef.current !== myEpoch) return; // superseded — a newer call already claimed the epoch
      setData(result);
      // Sticky refusal: a plain reload (mount, manual refresh) always clears the
      // error on success. Only the internal post-failed-act reload below asks to
      // preserve it — a follow-up read succeeding must not silently erase the
      // write's own refusal.
      if (!opts?.preserveErrorOnSuccess) setError(null);
    } catch (e) {
      if (epochRef.current !== myEpoch) return; // superseded
      // ALWAYS set on the reload's own failure, regardless of opts — that failure
      // is real news and outranks whatever act() may have set before calling this.
      setError(e);
    } finally {
      if (epochRef.current === myEpoch) setLoading(false);
    }
  }, []);

  // Deliberately empty deps: reloadImpl never changes identity (loaderRef pattern,
  // matching lib/parts/hooks.ts's own reasoning) — this fires exactly once on
  // mount, no matter how many fresh loader closures a parent re-render hands in.
  // This project's eslint config does not register react-hooks/exhaustive-deps
  // (hooks.ts's own header notes the same), so no suppression comment is needed.
  useEffect(() => {
    void reloadImpl();
  }, []);

  const reload = useCallback(() => reloadImpl(), [reloadImpl]);

  const act = useCallback(
    async (fn: () => Promise<void>): Promise<boolean> => {
      setBusy(true);
      setError(null);
      try {
        await fn();
        await reloadImpl();
        return true;
      } catch (e) {
        setError(e);
        // Sticky refusal: the follow-up reload still re-derives `data` for real,
        // but must not silently erase the write's own failure on a lucky read —
        // unless the reload ITSELF fails, whose own failure then wins (above).
        await reloadImpl({ preserveErrorOnSuccess: true }).catch(() => {});
        return false;
      } finally {
        setBusy(false);
      }
    },
    [reloadImpl],
  );

  return { data, loading, busy, error, reload, act };
}
