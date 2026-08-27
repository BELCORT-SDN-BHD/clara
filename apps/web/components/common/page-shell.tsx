import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The ONE page frame and the ONE page-title treatment.
 *
 * Five lanes built the P3 workbench independently and each grew its own
 * copy of `<main className="flex flex-col gap-N p-8">` + `<h1 className=
 * "text-xl font-semibold text-foreground">`, with N drifting across 2/4/6
 * and the title sometimes wrapped in a bare `<div>` beside an action button.
 * This file is that pattern, once. Every route-level surface uses it, so a
 * page's outer rhythm is a property of the product, not of whichever lane
 * happened to write the page.
 *
 * The rhythm is a three-step scale off Tailwind's spacing (the token
 * contract's own --space-* mirror): `gap-6` between a page's major sections,
 * `gap-4` inside a section, `gap-2`/`gap-1` between a label and the thing it
 * labels. Nothing here holds a hook, so a Server Component page and a
 * Client Component workbench can both render it.
 */
export function PageShell({ children, className }: { children: ReactNode; className?: string }) {
  return <main className={cn("flex flex-col gap-6 p-8", className)}>{children}</main>;
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: ReactNode;
  /** The one-or-two-sentence orientation line some surfaces carry. */
  description?: ReactNode;
  /** The surface's own primary control, if it has exactly one (e.g. Journals'
   *  "New journal entry"). Kept in the header rather than floating above the
   *  content so every page puts its main act in the same place. */
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-2">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="text-xl font-semibold text-foreground">{title}</h1>
        {description ? <p className="max-w-prose text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}
