"use client";

// The run-state chip (settled dashboard plan §3.1 chip law). Shape (glyph) + label, never
// hue-only — the DIRECTION honest-state rule. `awaiting_you` carries the parked framing.

import type { InterviewChip } from "../shared/interviewApi";
import styles from "./onboarding.module.css";

const CHIP: Record<InterviewChip, { cls: string; glyph: string; label: string }> = {
  awaiting_you: { cls: styles.chipAwaiting ?? "", glyph: "◆", label: "Awaiting you" },
  working: { cls: styles.chipWorking ?? "", glyph: "◔", label: "Working" },
  complete: { cls: styles.chipComplete ?? "", glyph: "✓", label: "Complete" },
  cancelled: { cls: styles.chipCancelled ?? "", glyph: "✕", label: "Cancelled" },
  expired: { cls: styles.chipExpired ?? "", glyph: "⧗", label: "Expired" },
  ended: { cls: styles.chipEnded ?? "", glyph: "■", label: "Ended" },
  unknown: { cls: styles.chipUnknown ?? "", glyph: "?", label: "Unknown" },
};

export function StateChip({ chip }: { chip: InterviewChip }) {
  const c = CHIP[chip] ?? CHIP.unknown;
  return (
    <span className={`${styles.chip} ${c.cls}`} role="status" aria-label={`Interview state: ${c.label}`}>
      <span className={styles.chipGlyph} aria-hidden>{c.glyph}</span>
      {c.label}
    </span>
  );
}
