"use client"

// PROVENANCE — vendored, not hand-written. Same add as components/ui/sidebar.tsx
// (`pnpm dlx shadcn@4.19.0 add sidebar breadcrumb collapsible`, style
// `base-nova`, `@base-ui/react` 1.7.0, zero new npm dependencies).
//
// HAND EDITS:
//
//  1. `"use client"` + i18n. The vendored file had no directive and two
//     hardcoded English strings: `aria-label="breadcrumb"` on the landmark and a
//     screen-reader-only "More" inside the ellipsis. Both now read the `AppShell`
//     namespace, with a prop override for a caller that has a better name. The
//     directive is the cost of that, and it is a real cost worth stating: a
//     Server Component can no longer render `<Breadcrumb>` directly. It has
//     exactly one consumer (components/app-shell/app-breadcrumb.tsx), which is a
//     Client Component already because it reads `usePathname()`, so nothing is
//     lost today. The alternative — requiring every caller to pass both strings —
//     makes the accessible name of a landmark optional, and an optional
//     accessible name is one someone eventually omits.
//  2. `dark:` census: ZERO occurrences (light-theme-only, owner ruling Q4).
//  3. Motion census: the vendored file declares no transition or animation
//     utility at all, so there is nothing to move onto the motion tokens and
//     nothing to put behind `motion-safe:`. Recorded as a measurement rather
//     than left as an unexplained absence.
//
// A NOTE ON `BreadcrumbPage`, which is the primitive's one surprising choice and
// is KEPT: it renders a `<span role="link" aria-disabled="true"
// aria-current="page">` rather than plain text. That is the ARIA authoring
// practice for the current item in a breadcrumb — it stays in the link list a
// screen reader reads, marked as the one you are on and not activatable.

import * as React from "react"
import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { useTranslations } from "next-intl"

import { cn } from "@/lib/utils"
import { ChevronRightIcon, MoreHorizontalIcon } from "lucide-react"

function Breadcrumb({
  className,
  label,
  ...props
}: React.ComponentProps<"nav"> & { label?: string }) {
  const t = useTranslations("AppShell")
  return (
    <nav
      aria-label={label ?? t("breadcrumbLabel")}
      data-slot="breadcrumb"
      className={cn(className)}
      {...props}
    />
  )
}

function BreadcrumbList({ className, ...props }: React.ComponentProps<"ol">) {
  return (
    <ol
      data-slot="breadcrumb-list"
      className={cn(
        "flex flex-wrap items-center gap-1.5 text-sm wrap-break-word text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

function BreadcrumbItem({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="breadcrumb-item"
      className={cn("inline-flex items-center gap-1", className)}
      {...props}
    />
  )
}

function BreadcrumbLink({
  className,
  render,
  ...props
}: useRender.ComponentProps<"a">) {
  return useRender({
    defaultTagName: "a",
    props: mergeProps<"a">(
      {
        className: cn("transition-colors hover:text-foreground", className),
      },
      props
    ),
    render,
    state: {
      slot: "breadcrumb-link",
    },
  })
}

function BreadcrumbPage({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="breadcrumb-page"
      role="link"
      aria-disabled="true"
      aria-current="page"
      className={cn("font-normal text-foreground", className)}
      {...props}
    />
  )
}

function BreadcrumbSeparator({
  children,
  className,
  ...props
}: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="breadcrumb-separator"
      role="presentation"
      aria-hidden="true"
      className={cn("[&>svg]:size-3.5", className)}
      {...props}
    >
      {children ?? (
        <ChevronRightIcon />
      )}
    </li>
  )
}

function BreadcrumbEllipsis({
  className,
  label,
  ...props
}: React.ComponentProps<"span"> & { label?: string }) {
  const t = useTranslations("AppShell")
  return (
    <span
      data-slot="breadcrumb-ellipsis"
      role="presentation"
      aria-hidden="true"
      className={cn(
        "flex size-5 items-center justify-center [&>svg]:size-4",
        className
      )}
      {...props}
    >
      <MoreHorizontalIcon
      />
      <span className="sr-only">{label ?? t("moreCrumbs")}</span>
    </span>
  )
}

export {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
  BreadcrumbEllipsis,
}
