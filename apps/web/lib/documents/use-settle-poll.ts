"use client";

// #633 — SETTLE WITHOUT A RELOAD, BOUNDED HARD.
//
// #606's own follow-up obligation is that an upload's status settles without the
// person reloading the page. The estate has no push channel for this, so it is a
// poll — and an unbounded poll is the exact failure the wave's own risk list names:
// every open tab becomes a hot read loop under the caller's own JWT.
//
// FIVE BOUNDS, all of them load-bearing:
//   1. RUNS ONLY WHILE SOMETHING CAN STILL CHANGE. `enabled` is the caller's
//      "any non-terminal row" predicate; a settled list polls zero times.
//   2. BACKOFF. Each tick waits longer than the last, up to `maxDelayMs` — a batch
//      that takes a minute costs a handful of reads, not sixty.
//   3. A HARD TICK CEILING. `maxTicks` ends the poll even if rows never settle, and
//      `exhausted` says so, so the surface can offer a manual Refresh instead of
//      spinning forever.
//   4. PAUSED WHEN HIDDEN. A backgrounded tab reads nothing; the first visible tick
//      resumes at the base delay, because the world may have moved on.
//   5. CLEARED ON IDENTITY CHANGE. `resetKey` (the client id, and the session's own
//      presence) restarts the bound from zero and drops the in-flight timer — a
//      scope or permission change must never inherit the previous scope's budget.
//
// THE MEASUREMENT BEHIND THIS SHAPE. The 0183 plan-cache pathology (a pooled
// PostgREST connection degrading 145 ms -> 2.0-2.8 s from the sixth call) was probed
// on the #633 rig against THIS read shape — 14 sequential reads of
// `document_intakes_visible` through one `clara_authenticated` session reusing its
// connection — and did not reproduce: 1.3 ms on the first call, 0.5 ms flat from the
// fourth, named-prepared and ad-hoc alike. So the poll ships. A direct view read
// cannot pin `plan_cache_mode` the way a SECURITY DEFINER door can, which is exactly
// why it is bounded this hard rather than trusted.

import { useCallback, useEffect, useRef, useState } from "react";

export type SettlePollOptions = {
  /** Poll only while this is true — the caller's "something can still change". */
  enabled: boolean;
  /** One read. Errors are the caller's to render; this hook only stops asking. */
  onTick: () => void | Promise<void>;
  /** Restarts the budget when it changes (client id, session presence, …). */
  resetKey?: string;
  maxTicks?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
};

export type SettlePollState = {
  /** Reads issued since the last reset. */
  ticks: number;
  /** True once the tick ceiling was hit with rows still unsettled. */
  exhausted: boolean;
};

const DEFAULT_MAX_TICKS = 12;
const DEFAULT_BASE_MS = 1500;
const DEFAULT_MAX_MS = 15000;

function documentHidden(): boolean {
  const d = (globalThis as { document?: { visibilityState?: string } }).document;
  return d?.visibilityState === "hidden";
}

export function useSettlePoll({
  enabled, onTick, resetKey = "", maxTicks = DEFAULT_MAX_TICKS,
  baseDelayMs = DEFAULT_BASE_MS, maxDelayMs = DEFAULT_MAX_MS,
}: SettlePollOptions): SettlePollState {
  const [ticks, setTicks] = useState(0);
  const [exhausted, setExhausted] = useState(false);
  const tickRef = useRef(onTick);
  tickRef.current = onTick;

  // Reset on identity change — a new client's budget is its own.
  useEffect(() => { setTicks(0); setExhausted(false); }, [resetKey]);

  const schedule = useCallback((n: number) => Math.min(maxDelayMs, baseDelayMs * 2 ** n), [baseDelayMs, maxDelayMs]);

  useEffect(() => {
    if (!enabled) return;
    if (ticks >= maxTicks) { setExhausted(true); return; }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const run = () => {
      if (cancelled) return;
      if (documentHidden()) {
        // Paused, not stopped: re-check on the BASE delay and spend no tick on it.
        timer = setTimeout(run, baseDelayMs);
        return;
      }
      void (async () => {
        try { await tickRef.current(); } finally {
          if (!cancelled) setTicks((n) => n + 1);
        }
      })();
    };

    timer = setTimeout(run, schedule(ticks));
    return () => { cancelled = true; if (timer !== null) clearTimeout(timer); };
  }, [enabled, ticks, maxTicks, baseDelayMs, schedule, resetKey]);

  return { ticks, exhausted };
}
