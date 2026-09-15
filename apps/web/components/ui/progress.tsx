"use client"

// ADDED DELIBERATELY BY #633, and it is the app's FIRST progress primitive: before
// this the upload queue rendered a phase word and nothing else, so AC8's "Progress
// uses real bytes or counts" had nowhere to land.
//
// IT WRAPS `@base-ui/react/progress` RATHER THAN HAND-ROLLING A DIV. `Progress.Root`
// is what carries `role="progressbar"` with `aria-valuemin`/`aria-valuemax`/
// `aria-valuenow` and keeps the visible text in sync with `aria-valuetext`
// (node_modules/@base-ui/react/progress/root/ProgressRoot.js:65-76, checked against
// the Base UI docs for 1.7.0 rather than assumed) — the same reason every other
// primitive in this folder wraps Base UI instead of re-deriving its accessibility.
//
// THE ONE RULE THIS COMPONENT ENFORCES: `value={null}` is INDETERMINATE, and an
// indeterminate bar never wears a number. Base UI drops `aria-valuenow` for a null
// value by itself; the visual half is handled here by rendering no fill at all
// rather than a guessed one. A caller that has no measurement passes `null` and gets
// an honest bar — it must never pass a fabricated percentage to make one look busy.

import { Progress as ProgressPrimitive } from "@base-ui/react/progress"
import { cn } from "@/lib/utils"

export function Progress({
  value,
  max = 100,
  label,
  className,
  ...props
}: Omit<ProgressPrimitive.Root.Props, "value" | "max"> & {
  /** The MEASURED value, or `null` when nothing has been measured yet. */
  value: number | null
  max?: number
  /** The accessible name. A progress bar with no name is announced as an unnamed
   *  meter, which on a table of many rows says nothing about WHICH file it is. */
  label: string
}) {
  const indeterminate = value === null
  const pct = indeterminate || max <= 0 ? 0 : Math.min(100, Math.max(0, (value / max) * 100))

  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={value}
      max={max}
      aria-label={label}
      className={cn("flex w-full min-w-16 flex-col gap-1", className)}
      {...props}
    >
      <ProgressPrimitive.Track
        data-slot="progress-track"
        className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted"
      >
        <ProgressPrimitive.Indicator
          data-slot="progress-indicator"
          // No transition on an indeterminate bar: there is nothing to animate
          // toward, and a moving bar with no value is the exact "looks busy,
          // means nothing" affordance this primitive exists to refuse.
          className={cn("h-full rounded-full bg-primary", !indeterminate && "transition-[width] duration-200 motion-reduce:transition-none")}
          style={{ width: indeterminate ? "0%" : `${pct}%` }}
        />
      </ProgressPrimitive.Track>
    </ProgressPrimitive.Root>
  )
}
