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
/**
 * CB-AE2E-019 — the padding is now an arm, `p-4 lg:p-8`.
 *
 * `p-8` was unconditional, and it is 64px of HORIZONTAL padding on a frame that
 * every route-level surface in the product renders inside. On a 320 CSS px
 * viewport that is a fifth of the screen spent before the first character; the
 * audit named this the one place where fixing only the three chrome columns
 * would still leave the shell failing WCAG 2.2 SC 1.4.10 Reflow. The vertical
 * rhythm (`gap-6` between major sections) is untouched — it is the page's
 * internal rhythm, not its inset, and compressing it would make a narrow page
 * denser rather than wider.
 */
export function PageShell({ children, className }: { children: ReactNode; className?: string }) {
  return <main className={cn("flex flex-col gap-6 p-4 lg:p-8", className)}>{children}</main>;
}

export function PageHeader({
  title,
  description,
  action,
  headingId,
}: {
  title: ReactNode;
  /** The one-or-two-sentence orientation line some surfaces carry. */
  description?: ReactNode;
  /** The surface's own primary control, if it has exactly one (e.g. Journals'
   *  "New journal entry"). Kept in the header rather than floating above the
   *  content so every page puts its main act in the same place. */
  action?: ReactNode;
  /**
   * An id on the `<h1>`, for the ONE surface that has to move focus to it: the
   * Work detail, which §4 requires to "focus its heading when reached by
   * navigation". The heading also takes `tabIndex={-1}` when an id is given,
   * because an `<h1>` is not focusable otherwise and `.focus()` on it would
   * silently do nothing.
   *
   * A PROP, NOT A `focusOnMount` BEHAVIOUR, and the difference matters: this
   * module is imported by server components and has no `"use client"`, so it
   * cannot hold an effect. The client surface that needs the focus owns the
   * decision — which is also the right place for it, since §4's other half
   * ("merely opening a background update does not steal focus") is a judgement
   * about that surface's own lifecycle, not about page headers in general.
   */
  headingId?: string;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-2">
      <div className="flex min-w-0 flex-col gap-1">
        <h1
          id={headingId}
          tabIndex={headingId === undefined ? undefined : -1}
          className="text-xl font-semibold text-foreground"
        >
          {title}
        </h1>
        {description ? <p className="max-w-prose text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}
