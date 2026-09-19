"use client";

// #636 — the batch card's own hydration, so BOTH Documents surfaces mount it with one line each
// and neither owns a copy of the read, the URL rules or the poll bounds.
//
// IT POLLS THROUGH `useSettlePoll` WITH ITS OWN `resetKey` (C77.1's rule): no new poll primitive
// appears in this diff, the bounds stay the shipped ones, and the exhausted state is surfaced so
// the card can offer a manual Refresh instead of spinning. #904 is a LIVE defect on this same
// workbench and is NOT inherited and NOT silently fixed here — the batch card refreshes itself and
// says nothing about the receipts indicator.
//
// THE FIVE ANSWER STATES ARE TOLD APART BY WHAT THE READ ANSWERED, never by a caught error mapped
// to an empty pack: a CLR04 is `denied` (rows cleared, no affordance that could only refuse), any
// other failure on the FIRST read is `failed` (Alert + Retry, never an Empty), a malformed
// `?batch=` is `notFound`, and everything else is `ready`.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { isDoorRefusal } from "@/lib/doors";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import type { SessionTokenAccessor } from "@/lib/session";
import { useSettlePoll } from "./use-settle-poll";
import {
  applyBatchFacetParam, applyBatchParam, batchUrl, parseBatchFacetParam, parseBatchParam,
  type BatchFacet, type BatchUrlSelection,
} from "./batch-url-state";
import {
  isBatchSettled, loadIntakeBatch, type IntakeBatchPack,
} from "./intake-batch";
import type { IntakeBatchCardState } from "@/components/documents/intake-batch-card";

export type UseIntakeBatch = {
  selection: BatchUrlSelection;
  state: IntakeBatchCardState | null;
  facet: BatchFacet;
  setFacet: (next: BatchFacet) => void;
  refresh: () => void;
  open: (batchId: string) => void;
  close: () => void;
  pollExhausted: boolean;
};

export function useIntakeBatch({
  session = sessionTokenAccessor,
  load = loadIntakeBatch,
  settlePoll: settlePollOptions,
}: {
  session?: SessionTokenAccessor;
  load?: typeof loadIntakeBatch;
  settlePoll?: { maxTicks?: number; baseDelayMs?: number; maxDelayMs?: number };
} = {}): UseIntakeBatch {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const selection = useMemo(() => parseBatchParam(searchParams), [searchParams]);
  const facet = useMemo(() => parseBatchFacetParam(searchParams), [searchParams]);
  const batchId = selection.kind === "batch" ? selection.id : null;

  const [state, setState] = useState<IntakeBatchCardState | null>(null);
  const [epoch, setEpoch] = useState(0);
  const packRef = useRef<IntakeBatchPack | null>(null);

  useEffect(() => {
    if (batchId === null) { setState(null); packRef.current = null; return; }
    let cancelled = false;
    // A RE-READ keeps the rows on screen: only the FIRST read of this batch shows the skeleton,
    // because replacing a populated table with a skeleton on every tick is a flicker, not a state.
    if (packRef.current === null) setState({ kind: "loading" });
    void (async () => {
      try {
        const pack = await load(batchId, { session });
        if (cancelled) return;
        packRef.current = pack;
        setState({ kind: "ready", pack });
      } catch (err) {
        if (cancelled) return;
        // CLR04 is a PERMISSION, not a failure — and the two are different sentences.
        if (isDoorRefusal(err) && err.code === "CLR04") { packRef.current = null; setState({ kind: "denied" }); return; }
        if (packRef.current !== null) return; // a failed RE-read keeps the last honest answer
        setState({ kind: "failed", message: err instanceof Error ? err.message : null });
      }
    })();
    return () => { cancelled = true; };
  }, [batchId, epoch, load, session]);

  const refresh = useCallback(() => setEpoch((n) => n + 1), []);

  const pack = state?.kind === "ready" ? state.pack : null;
  const settlePoll = useSettlePoll({
    enabled: pack !== null && !isBatchSettled(pack),
    onTick: refresh,
    // The BATCH id is the scope; opening another batch must drop the previous one's budget rather
    // than inherit it.
    resetKey: batchId ?? "",
    ...settlePollOptions,
  });

  const setFacet = useCallback((next: BatchFacet) => {
    router.replace(batchUrl(pathname, applyBatchFacetParam(searchParams, next)), { scroll: false });
  }, [pathname, router, searchParams]);

  const open = useCallback((id: string) => {
    // A PUSH, so Back closes the batch rather than leaving the tab (url-state.ts's own idiom).
    router.push(batchUrl(pathname, applyBatchParam(searchParams, id)), { scroll: false });
  }, [pathname, router, searchParams]);

  const close = useCallback(() => {
    router.replace(batchUrl(pathname, applyBatchParam(searchParams, null)), { scroll: false });
  }, [pathname, router, searchParams]);

  return { selection, state, facet, setFacet, refresh, open, close, pollExhausted: settlePoll.exhausted };
}
