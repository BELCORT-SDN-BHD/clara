"use client";

// The shared card lifecycle (DIRECTION §1 / contract §9): identifier-only parts
// hydrate authoritative state on mount and re-derive after EVERY action — no
// optimistic UI (the JeReviewCard / answer_interruption precedent). A governed
// refusal is classified from the PostgREST CLR envelope (exact reason token). The
// `loader` MUST be a `useCallback`-stable closure over the part's primitive ids (the
// JeReviewCard `load` discipline) or reload will loop.

import { useCallback, useEffect, useState } from "react";
import type { PgrestError } from "../wire";

export type Clr = { code: string; reason: string | null } | null;

export type CardState<T> = {
  data: T | null;
  loading: boolean;
  busy: boolean;
  err: string | null;
  clr: Clr;
  reload: () => Promise<void>;
  act: (fn: () => Promise<void>, onOk?: () => void) => Promise<void>;
};

export function useCard<T>(token: string | null, loader: (token: string) => Promise<T>): CardState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [clr, setClr] = useState<Clr>(null);

  const reload = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      setData(await loader(token));
      setErr(null);
    } catch (e) {
      const pe = e as PgrestError;
      setErr(pe.message ?? String(e));
      if (pe.clr) setClr({ code: pe.clr, reason: pe.reason ?? null });
    } finally {
      setLoading(false);
    }
  }, [token, loader]);

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
        await reload();
      } catch (e) {
        const pe = e as PgrestError;
        setErr(pe.message ?? String(e));
        if (pe.clr) setClr({ code: pe.clr, reason: pe.reason ?? null });
        await reload().catch(() => {});
      } finally {
        setBusy(false);
      }
    },
    [reload],
  );

  return { data, loading, busy, err, clr, reload, act };
}
