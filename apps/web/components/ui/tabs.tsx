"use client";

// PROVENANCE — vendored, not hand-written.
//
//   cd apps/web && node node_modules/shadcn/dist/index.js add tabs
//
// style `base-nova`, `@base-ui/react` 1.7.0 (`@base-ui/react/tabs`), ONE file,
// ZERO new npm dependencies (`git diff package.json pnpm-lock.yaml` empty after
// the add).
//
// WHY IT IS HERE. `components/common/section-tabs.tsx` declared
// `role="tablist"`/`role="tab"`/`aria-selected` by hand and its own header
// recorded the half it could not honour: "arrow-key roving focus is not
// implemented here". That is an ARIA pattern half-implemented — assistive tech
// is told this is a tablist and then gets tablist-incompatible keyboard
// behaviour (every tab an individual tab stop). Base UI's Tabs owns the roving
// tabindex, the arrow/Home/End key map and `aria-selected`, so vendoring it
// closes the gap with the primitive rather than with a fourth hand-rolled
// keyboard model. SectionTabs is now a THIN skin over this file and keeps its
// public API unchanged.
//
// HAND EDITS, all of them, in the same commit as the add:
//
//  1. `dark:` STRIPPED — 3 lines carried 7 occurrences (light-theme-only, owner
//     ruling Q4; the same edit dropdown-menu.tsx:12-18 documents). Measured
//     before and after: `grep -c 'dark:' components/ui/tabs.tsx` went 3 -> 0.
//  2. `text-foreground/60` -> `text-muted-foreground` on the inactive trigger.
//     The vendored default composited an ALPHA over the ink token, which is not
//     a semantic role and is what `scripts/check-token-contrast.mjs` exists to
//     catch; `--muted-foreground` is the role for "present but not the current
//     one", and it is literally what the stripped `dark:` variant told the dark
//     theme to use. One token, both themes, no composite.
//  3. THE FOCUS IDIOM, recut to the house's. The vendored ring is
//     `ring-ring/50` PLUS a 1px `outline-ring`; every Button, Input, Textarea,
//     Badge and the outgoing SectionTabs in this product focus with
//     `outline-none` + `focus-visible:border-ring` + a 3px `ring-ring/70` halo.
//     裁-1 recut that alpha to 70% precisely because the translucent ring
//     measured under WCAG 2.2 SC 1.4.11's 3:1 floor; shipping a /50 ring here
//     would reintroduce the value that ruling removed, on a control that is now
//     on four workbenches.

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

function Tabs({ className, orientation = "horizontal", ...props }: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn("group/tabs flex gap-2 data-horizontal:flex-col", className)}
      {...props}
    />
  );
}

const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center justify-center rounded-lg p-[3px] text-muted-foreground group-data-horizontal/tabs:h-8 group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col data-[variant=line]:rounded-none",
  {
    variants: {
      variant: {
        default: "bg-muted",
        line: "gap-1 bg-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function TabsList({
  className,
  variant = "default",
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  );
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-1.5 py-0.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-all group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start hover:text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/70 disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pr-1 has-data-[icon=inline-start]:pl-1 aria-disabled:pointer-events-none aria-disabled:opacity-50 group-data-[variant=default]/tabs-list:data-active:shadow-sm group-data-[variant=line]/tabs-list:data-active:shadow-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-active:bg-transparent",
        "data-active:bg-background data-active:text-foreground",
        "after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-horizontal/tabs:after:inset-x-0 group-data-horizontal/tabs:after:bottom-[-5px] group-data-horizontal/tabs:after:h-0.5 group-data-vertical/tabs:after:inset-y-0 group-data-vertical/tabs:after:-right-1 group-data-vertical/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-active:after:opacity-100",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn("flex-1 text-sm outline-none", className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants };
