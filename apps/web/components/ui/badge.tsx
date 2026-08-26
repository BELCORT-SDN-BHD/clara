import type { ReactNode } from "react";

import { cn } from "../../lib/utils";

// Minimal shadcn-styled badge (mirrors components/ui/button.tsx's token/cn
// conventions — no cva here, the surface is too small to earn it). Used by
// components/parts/PartRenderer.tsx for the clarify visibility label, the tool_call
// chip, and the refusal code chip.

const TONES = {
  neutral: "border-border bg-muted text-muted-foreground",
  info: "border-transparent bg-info-muted text-info",
  error: "border-transparent bg-error-muted text-error",
} as const;

export type BadgeTone = keyof typeof TONES;

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      data-slot="badge"
      className={cn(
        "inline-flex w-fit shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
