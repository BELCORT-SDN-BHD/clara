"use client";

// 裁-132 — the elapsed-time indicator while a turn runs.
//
// WHAT IT IS ALLOWED TO SAY. Two facts, both read: that a turn is in flight, and how long
// it has been since the RUNTIME recorded its start (`clara.agent_tasks_visible.created_at`,
// carried on the store as `turnStartedAt`; lib/clara/turnRun.ts is where it comes from).
// It never estimates a remaining time, never shows a progress bar over an unknown total,
// and never renders anything at all when the start is unknown — an indicator that says
// "0:00" because it has no anchor is a fabricated measurement, which is precisely the class
// of thing this product refuses.
//
// THE SETTLED-ONLY THREAD STAYS. This adds no provisional assistant text: the transcript is
// still the DB's own rows plus the one parked-clarify fold, and nothing here writes into
// either. It is a status line beside the existing "Clara is responding…" spelling, not a
// second, softer version of the transcript.
//
// NO LIVE REGION, DELIBERATELY. The scrolling log this mounts inside is already
// `role="log" aria-live="polite"` (ClaraThreadView), and a per-second announcement inside
// it would be both a nested live region (the a11y defect P6-3 owns) and an unreadable
// screen-reader stream. The already-announced status sentence carries the fact that Clara
// is working; this line carries the number for people watching it. `aria-hidden` is NOT
// used — the text stays in the accessible tree and is reachable on demand; it simply does
// not interrupt.
//
// MOTION: none. The value changes once a second, which is the animation; a pulsing dot on
// top of it would be decoration over a real signal, and it would need its own
// reduced-motion arm to say nothing extra.

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { elapsedSeconds, formatElapsed } from "@/lib/clara/turnRun";

/** One second — the tick, matching the granularity the label renders. Exported so a cell
 *  reads the same number the component uses rather than restating it. */
export const TURN_PROGRESS_TICK_MS = 1_000;

export function TurnProgress({
  startedAt,
  parked,
  now = () => Date.now(),
}: {
  /** `clara.agent_tasks_visible.created_at` for the live task, or null when unread. */
  startedAt: string | null;
  /** The DB's own `awaiting_input` — Clara is parked on a question, not computing. The two
   *  are different facts to a professional deciding whether to wait or to act, so they get
   *  different sentences rather than one "working…" covering both. */
  parked: boolean;
  /** Injected so the cell drives the clock instead of sleeping. */
  now?: () => number;
}) {
  const t = useTranslations("Clara.thread.turnProgress");
  const [nowMs, setNowMs] = useState(now);

  // THE CLOCK IS READ THROUGH A REF, AND THAT IS #727's WHOLE FIX.
  //
  // `now` is a DEFAULT PARAMETER, so its initializer (`() => Date.now()`) runs on every
  // call: a fresh function identity per render. It used to be a dependency of the effect
  // below, whose body calls `setNowMs(now())` — render -> effect -> setState -> render,
  // forever, bailing out only while two consecutive reads landed in the same millisecond.
  // A cheap render does; a rail rendering a long transcript with a clarify card and two
  // Work cards in it does not. Measured on the code this replaced: SIX timers armed just
  // to mount this component, and 439 armed across 200 live stream deltas
  // (thread-live-stream-stability.test.tsx).
  //
  // WHY THAT ENDED THE TURN. Every one of those commits leaves work pending, which is what
  // React counts toward its nested-update ceiling; past the ceiling the next scheduled
  // update THROWS (#185, "Maximum update depth exceeded"). During a stream that update is
  // scheduled by `claraThreadStore.emit()` inside `applyStreamEvent` — i.e. inside
  // `runClaraTaskStream`'s uncaught `onEvent(evt)` (lib/clara/stream.ts) — so React's error
  // came back out as the STREAM's rejection and `useClaraThread` painted it as
  // "Could not send that message: stream error: …". The live clarify went with the view.
  //
  // The ref is this repo's own answer to exactly this hazard: lib/parts/hooks.ts carries
  // `sessionRef`/`loaderRef` for the same reason (its header records the 4GB-heap
  // measurement that drove them). The effect now depends on `startedAt` alone — one turn,
  // one timer — while every tick still calls whichever clock is CURRENT, so the injected
  // seam keeps working and a caller that hands in a fresh closure per render costs nothing.
  const nowRef = useRef(now);
  nowRef.current = now;

  useEffect(() => {
    if (startedAt === null) return;
    setNowMs(nowRef.current());
    const timer = setInterval(() => setNowMs(nowRef.current()), TURN_PROGRESS_TICK_MS);
    return () => clearInterval(timer);
  }, [startedAt]);

  const seconds = elapsedSeconds(startedAt, nowMs);
  // Absence is not evidence: no readable start means no claim about duration.
  if (seconds === null) return null;

  const elapsed = formatElapsed(seconds);
  return (
    <p className="text-xs text-muted-foreground italic">
      <time dateTime={startedAt ?? undefined}>
        {parked ? t("parked", { elapsed }) : t("running", { elapsed })}
      </time>
    </p>
  );
}
