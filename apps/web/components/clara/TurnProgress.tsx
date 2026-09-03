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

import { useEffect, useState } from "react";
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

  useEffect(() => {
    if (startedAt === null) return;
    setNowMs(now());
    const timer = setInterval(() => setNowMs(now()), TURN_PROGRESS_TICK_MS);
    return () => clearInterval(timer);
  }, [startedAt, now]);

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
