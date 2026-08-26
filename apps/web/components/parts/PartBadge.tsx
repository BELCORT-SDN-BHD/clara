import type { ReactNode } from "react";

import { cn } from "../../lib/utils";

// The parts-lane chip badge (tone → Clara token classes). Lived at ui/badge.tsx on
// the p2-parts branch; moved here at the P2 fold because ui/badge.tsx is now the
// canonical shadcn cva Badge (variant-based API) brought in by p2-cmdk — the two
// APIs are incompatible and this one is purpose-built for part chips (the clarify
// visibility label, the tool_call chip, the refusal code chip in PartRenderer.tsx).
// Exports keep their original names so PartRenderer's reviewed body changes by one
// import path only.

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
