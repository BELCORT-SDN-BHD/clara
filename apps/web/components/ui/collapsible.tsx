"use client"

// PROVENANCE — vendored, not hand-written. Same add as components/ui/sidebar.tsx
// (`pnpm dlx shadcn@4.19.0 add sidebar breadcrumb collapsible`, style
// `base-nova`, `@base-ui/react` 1.7.0, zero new npm dependencies).
//
// HAND EDITS: NONE, and the census is the record of why. The emitted file is
// three one-line passthroughs onto `@base-ui/react`'s Collapsible with no class
// string of its own at all, so there is nothing to i18n (zero strings), nothing
// to move onto the motion tokens (zero durations), nothing to put behind
// `motion-safe:` (zero movement utilities) and no `dark:` variant to strip. Only
// this header was added. Recorded as a measurement rather than left looking like
// a file nobody swept.
//
// WHY IT IS HERE: the Accounting group in components/app-shell/app-sidebar.tsx.
// The disclosure contract a collapsible group owes — `aria-expanded` on the
// trigger, `aria-controls` pointing at the panel, the panel actually removed
// from the accessibility tree when closed — comes from Base UI rather than being
// hand-rolled for the fourth time in this repo.

import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible"

function Collapsible({ ...props }: CollapsiblePrimitive.Root.Props) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />
}

function CollapsibleTrigger({ ...props }: CollapsiblePrimitive.Trigger.Props) {
  return (
    <CollapsiblePrimitive.Trigger data-slot="collapsible-trigger" {...props} />
  )
}

function CollapsibleContent({ ...props }: CollapsiblePrimitive.Panel.Props) {
  return (
    <CollapsiblePrimitive.Panel data-slot="collapsible-content" {...props} />
  )
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent }
