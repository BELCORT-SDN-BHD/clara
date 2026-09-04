"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * PROVENANCE — a DELIBERATE deviation from the shadcn CLI output, recorded here because the
 * next `shadcn add table` would otherwise quietly undo it.
 *
 * The CLI ships this container as a bare `<div className="relative w-full overflow-x-auto">`.
 * A scroll container with no `tabIndex` is unreachable by keyboard whenever nothing inside it
 * is focusable — which is EVERY read-only table in this product: the registers, the bank
 * tables, the close plan's rows, the firm activity list. A table with a control in a row
 * happens to pass, because the control itself gives the region a tab stop, which is exactly
 * why the class went unnoticed until L13's axe run on the built app caught it as
 * `scrollable-region-focusable` (SERIOUS).
 *
 * TWO CHANGES, and the second is what makes the first bearable:
 *
 *   1. `tabIndex={0}` — the region is now reachable, so a keyboard user can scroll a wide
 *      table sideways at all.
 *   2. `role="region"` + a NAME. A focusable stop with no accessible name announces as an
 *      anonymous group, and this product renders roughly twenty of them; nineteen identical
 *      "data table" announcements would be noise rather than orientation. The name comes from
 *      whatever the caller already passes — `aria-label` or `aria-labelledby` — and it lands
 *      on BOTH the region and the `<table>`, which is the pattern the scrollable-region
 *      guidance describes: the region is named after the table it scrolls.
 *
 * WHEN NO NAME IS GIVEN the region takes `tabIndex` but NOT `role="region"`. That is
 * deliberate: an unnamed `region` is worse than no region — it adds a landmark a screen-reader
 * user must step through and learns nothing from — while the tab stop still fixes the
 * keyboard-scroll defect. `components/common/data-table-card.tsx` is the read-only wrapper and
 * threads its own `label` through, so every table presented that way is named; a cell in
 * `table-scroll-region.test.tsx` reds on a read-only container that is focusable but anonymous.
 */
function Table({ className, ...props }: React.ComponentProps<"table">) {
  const label = props["aria-label"]
  const labelledBy = props["aria-labelledby"]
  const named = label !== undefined || labelledBy !== undefined
  return (
    <div
      data-slot="table-container"
      className="relative w-full overflow-x-auto"
      tabIndex={0}
      role={named ? "region" : undefined}
      aria-label={label}
      aria-labelledby={labelledBy}
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
