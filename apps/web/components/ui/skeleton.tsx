// PROVENANCE — vendored, not hand-written. Pulled in as a registry dependency of
// `sidebar` (`pnpm dlx shadcn@4.19.0 add sidebar breadcrumb collapsible`, style
// `base-nova`, zero new npm dependencies).
//
// HAND EDITS: NONE. The census, so the absence is a measurement and not an
// oversight: zero strings to i18n, zero `dark:` variants, zero duration
// literals, zero movement utilities. `animate-pulse` is an OPACITY animation and
// stays unconditional by the token contract's own rule ("reduced motion removes
// position, scale, stagger and parallax; opacity remains"), which is also why
// tests/reduced-motion-contract.test.ts's MOVEMENT list does not contain it.

import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  )
}

export { Skeleton }
