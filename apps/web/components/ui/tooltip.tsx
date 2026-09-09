"use client"

// PROVENANCE — vendored, not hand-written. Pulled in as a registry dependency of
// `sidebar` (`pnpm dlx shadcn@4.19.0 add sidebar breadcrumb collapsible`, style
// `base-nova`, `@base-ui/react` 1.7.0, zero new npm dependencies).
//
// HAND EDITS:
//
//  1. MOTION, and this one was a real defect rather than a tidy-up — the exact
//     class components/ui/dropdown-menu.tsx's DS-01 edit already closed for the
//     dropdown and components/ui/sheet.tsx's edit 5 closed for the sheet. The
//     vendored popup declared `data-open:zoom-in-95` / `data-closed:zoom-out-95`
//     and six directional slides with NO enclosing condition, so a user who had
//     asked the system for less motion got the full scale-and-travel.
//     `tests/reduced-motion-contract.test.ts` is the gate that names this class,
//     and it reds on exactly those two `data-open:`/`data-closed:` movement
//     utilities. All eight movement utilities are now `motion-safe:`; the
//     `fade-in-0`/`fade-out-0` pair stays unconditional, which is the contract's
//     own rule — reduced motion removes position, scale, stagger and parallax,
//     opacity remains.
//  2. `motion-standard` added. The vendored popup declared no duration at all
//     and inherited tw-animate-css's default; token contract §7 puts "Popover,
//     dropdown" on `--motion-duration-standard`, and a tooltip is that tier. No
//     component in this tree spells a duration itself (apps/web/AGENTS.md).
//  3. `dark:` census: ZERO occurrences (light-theme-only, owner ruling Q4).
//  4. i18n census: ZERO strings — a tooltip's content is always the caller's.
//
// `origin-(--transform-origin)` is untouched: a tooltip scales from its anchor,
// never from centre. The arrow's `translate-y-[calc(-50%-2px)]` and the
// `-translate-y-1/2` centring are STATIC transforms, not motion — they position
// the arrow and never animate, so demanding `motion-safe:` there would ask the
// page to lay itself out differently for a reduced-motion user.

import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip"
import { cn } from "@/lib/utils"

function TooltipProvider({
  delay = 0,
  ...props
}: TooltipPrimitive.Provider.Props) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delay={delay}
      {...props}
    />
  )
}

function Tooltip({ ...props }: TooltipPrimitive.Root.Props) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />
}

function TooltipTrigger({ ...props }: TooltipPrimitive.Trigger.Props) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

function TooltipContent({
  className,
  side = "top",
  sideOffset = 4,
  align = "center",
  alignOffset = 0,
  children,
  ...props
}: TooltipPrimitive.Popup.Props &
  Pick<
    TooltipPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  >) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className="isolate z-50"
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(
            "motion-standard z-50 inline-flex w-fit max-w-xs origin-(--transform-origin) items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs text-background has-data-[slot=kbd]:pr-1.5 motion-safe:data-[side=bottom]:slide-in-from-top-2 motion-safe:data-[side=inline-end]:slide-in-from-left-2 motion-safe:data-[side=inline-start]:slide-in-from-right-2 motion-safe:data-[side=left]:slide-in-from-right-2 motion-safe:data-[side=right]:slide-in-from-left-2 motion-safe:data-[side=top]:slide-in-from-bottom-2 **:data-[slot=kbd]:relative **:data-[slot=kbd]:isolate **:data-[slot=kbd]:z-50 **:data-[slot=kbd]:rounded-sm data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 motion-safe:data-[state=delayed-open]:zoom-in-95 data-open:animate-in data-open:fade-in-0 motion-safe:data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 motion-safe:data-closed:zoom-out-95",
            className
          )}
          {...props}
        >
          {children}
          <TooltipPrimitive.Arrow className="z-50 size-2.5 translate-y-[calc(-50%-2px)] rotate-45 rounded-[2px] bg-foreground fill-foreground data-[side=bottom]:top-1 data-[side=inline-end]:top-1/2! data-[side=inline-end]:-left-1 data-[side=inline-end]:-translate-y-1/2 data-[side=inline-start]:top-1/2! data-[side=inline-start]:-right-1 data-[side=inline-start]:-translate-y-1/2 data-[side=left]:top-1/2! data-[side=left]:-right-1 data-[side=left]:-translate-y-1/2 data-[side=right]:top-1/2! data-[side=right]:-left-1 data-[side=right]:-translate-y-1/2 data-[side=top]:-bottom-2.5" />
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
