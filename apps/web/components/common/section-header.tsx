import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The ONE heading scale below the page title (`PageHeader`'s own h1,
 * `text-xl font-semibold`).
 *
 * The five P3 lanes shipped six different treatments for the same rung —
 * `text-sm font-medium`, `text-sm font-semibold`, `text-base font-medium`,
 * `text-lg font-medium`, `text-xs font-medium uppercase text-muted-foreground`
 * and a bare `<span>` — so two panels sitting side by side could disagree
 * about which was the more important. The levels here are the whole scale:
 *
 *   2  a major section of a page ("Statutory close reports", "Close gates")
 *   3  a sub-section inside one ("Agent receipts", "Runs")
 *   4  an eyebrow label over a dense block ("FILINGS", "EVIDENCE")
 *
 * Level 2 deliberately matches `CardTitle` (`text-base font-medium`) so a
 * bare `<section>` heading and a `<Card>` heading read as the same rung.
 */
export type SectionHeadingLevel = 2 | 3 | 4;

const LEVEL_CLASS: Record<SectionHeadingLevel, string> = {
  2: "text-base font-medium text-foreground",
  3: "text-sm font-medium text-foreground",
  4: "text-xs font-medium tracking-wide text-muted-foreground uppercase",
};

export function SectionHeader({
  level,
  children,
  action,
  className,
}: {
  level: SectionHeadingLevel;
  children: ReactNode;
  /** A control that belongs to this section (e.g. "Register recipient"). */
  action?: ReactNode;
  className?: string;
}) {
  // An explicit branch, never a `as "h2" | "h3" | "h4"` cast on a template
  // literal — this repo's own "spelling is not identity" discipline: the tag
  // is chosen, not asserted.
  const Tag: "h2" | "h3" | "h4" = level === 2 ? "h2" : level === 3 ? "h3" : "h4";
  const heading = <Tag className={cn(LEVEL_CLASS[level], className)}>{children}</Tag>;

  if (!action) return heading;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      {heading}
      {action}
    </div>
  );
}
