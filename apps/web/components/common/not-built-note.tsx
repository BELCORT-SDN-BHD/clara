import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The ONE shape for "this is honestly not built yet" — the ⌘K "Do" precedent
 * (`components/command/command-palette.tsx`) made into a block-level note.
 *
 * A dashed border is the whole signal: it is the only dashed edge in the
 * product, so a reader learns once that dashed means "named, not delivered",
 * and never has to read the copy to know which kind of box they are looking
 * at. Four lanes had grown their own version of it (bank's `NotBuilt`,
 * close's proposal panel, the Needs-you gaps note, and the two reports
 * notices) at two different paddings and two different text sizes.
 *
 * The inline variant — a disabled control naming its own shape with a badge
 * beside it — stays in `components/documents/not-built-badge.tsx`; it is a
 * genuinely different shape, not a drifted copy of this one.
 */
export function NotBuiltNote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        // `bg-muted/50` behind the dashed edge: measured in the harness, a
        // dashed `--line` hairline on white is nearly invisible at 1440px, so
        // the note's ONE signal was not reaching the eye at all. The fill is
        // the same one the inline not-built badge already used, which is why
        // the two now read as the same family.
        // `wrap-anywhere`, not `break-words`: these notes name a DB verb
        // signature verbatim, and a 55-character unbreakable identifier pushed
        // the whole page 18px past a 390px viewport (measured in the harness,
        // twice — `break-words` did NOT fix it, because `overflow-wrap:
        // break-word` leaves a flex item's min-content size at the unbreakable
        // word's own width; only `anywhere` shrinks it).
        "flex w-full max-w-prose flex-col items-start gap-1.5 rounded-lg border border-dashed border-border bg-muted/50 p-3 text-sm wrap-anywhere text-muted-foreground",
        className,
      )}
    >
      {children}
    </div>
  );
}
