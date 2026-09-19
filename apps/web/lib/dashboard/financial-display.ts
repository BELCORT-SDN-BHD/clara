"use client";

// #660 — the small, pure display decisions the four money faces share, kept in ONE place so four
// faces of one envelope cannot describe the same condition four ways.
//
// NO CENTS ARITHMETIC HERE EITHER. This module turns a machine token into a message KEY and a
// tone; it never computes, rounds or clamps a number. The amounts come from the door and are
// rendered by `fmtCents` (lib/registers/money.ts), which owns the unsafe-integer marker.

import { useEffect, useState } from "react";

import type { FigureStatus } from "./financial-pack";

/** The tone each state word wears. The WORD is the state
 *  (`components/firm/client-home/client-work-attention.tsx:65-71`); the tone only agrees with it.
 *  The same four words and the same four tones the Work band beside it already uses. */
export const FIGURE_TONE: Record<FigureStatus, "neutral" | "info" | "warning" | "error"> = {
  ok: "neutral",
  partial: "warning",
  unknown: "warning",
  denied: "info",
};

/**
 * The door's coverage reasons, as a CLOSED lookup onto message keys.
 *
 * A raw machine token must never reach a screen — `closing_transfer_unmarked_history` is a
 * sentence about this client's books that a reader has to be able to act on, not a debugging
 * string. An unrecognised token falls back to a generic line rather than being printed: a new
 * reason arriving from a newer door is a reason this build has not been taught to explain, and
 * printing it raw would look like a defect rather than read like one.
 */
export const COVERAGE_REASON_KEYS = {
  cash_set_unpublished: "reason.cashSetUnpublished",
  cash_set_version_changed_in_series: "reason.cashSetVersionChanged",
  cash_set_published_after_books_start: "reason.cashSetPublishedAfterBooks",
  pre_coverage: "reason.preCoverage",
  opening_carry_down_deferred: "reason.openingCarryDownDeferred",
  closing_transfer_unmarked_history: "reason.closingTransferUnmarked",
  no_posted_entries: "reason.noPostedEntries",
  client_not_visible: "reason.clientNotVisible",
} as const;

export function coverageReasonKey(reason: string | null): string | null {
  if (reason === null) return null;
  return (COVERAGE_REASON_KEYS as Record<string, string>)[reason] ?? "reason.generic";
}

/**
 * `prefers-reduced-motion`, as a live subscription rather than a one-shot read.
 *
 * The chart is the only animated thing this band ships, and the setting can change mid-session on
 * every platform that offers it. Defaults to REDUCED (`true`) before the first effect runs, so the
 * server render and the first client frame are the still one: an animation that starts and then
 * gets switched off is worse than one that never started.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    }
    return undefined;
  }, []);
  return reduced;
}
