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
   *  failure, retires it. */
  act: (fn: () => Promise<void>) => Promise<void>;
};

export function useAsyncRead<T>(loader: () => Promise<T>): AsyncReadState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const reloadImpl = useCallback(async (opts?: { preserveErrorOnSuccess?: boolean }) => {
    setLoading(true);
    try {
      const result = await loaderRef.current();
      setData(result);
      // Sticky refusal: a plain reload (mount, manual refresh) always clears the
      // error on success. Only the internal post-failed-act reload below asks to
      // preserve it — a follow-up read succeeding must not silently erase the
      // write's own refusal.
      if (!opts?.preserveErrorOnSuccess) setError(null);
    } catch (e) {
      // ALWAYS set on the reload's own failure, regardless of opts — that failure
      // is real news and outranks whatever act() may have set before calling this.
      setError(e);
    } finally {
      setLoading(false);
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
    async (fn: () => Promise<void>) => {
      setBusy(true);
      setError(null);
      try {
        await fn();
        await reloadImpl();
      } catch (e) {
        setError(e);
        // Sticky refusal: the follow-up reload still re-derives `data` for real,
        // but must not silently erase the write's own failure on a lucky read —
        // unless the reload ITSELF fails, whose own failure then wins (above).
        await reloadImpl({ preserveErrorOnSuccess: true }).catch(() => {});
      } finally {
        setBusy(false);
      }
    },
    [reloadImpl],
  );

  return { data, loading, busy, error, reload, act };
}
