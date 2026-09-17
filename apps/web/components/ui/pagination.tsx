import * as React from "react"
import { cn } from "@/lib/utils"

import { Button, buttonVariants } from "@/components/ui/button"
import { ChevronLeftIcon, ChevronRightIcon, MoreHorizontalIcon } from "lucide-react"

function Pagination({ className, ...props }: React.ComponentProps<"nav">) {
  return (
    <nav
      role="navigation"
      aria-label="pagination"
      data-slot="pagination"
      className={cn("mx-auto flex w-full justify-center", className)}
      {...props}
    />
  )
}

function PaginationContent({
  className,
  ...props
}: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="pagination-content"
      className={cn("flex items-center gap-0.5", className)}
      {...props}
    />
  )
}

function PaginationItem({ ...props }: React.ComponentProps<"li">) {
  return <li data-slot="pagination-item" {...props} />
}

type PaginationLinkOwnProps = {
  isActive?: boolean
} & Pick<React.ComponentProps<typeof Button>, "size">

type PaginationLinkProps =
  | (PaginationLinkOwnProps & React.ComponentProps<"a">)
  | (PaginationLinkOwnProps & { href?: undefined } & React.ComponentProps<"button">)

// PaginationLink BRANCHES ON `href` rather than routing every render through Base UI's `Button`
// (#771). With an `href` it renders a plain `<a href>`: no `role`, no `type`, no Base UI keyboard
// layer — Enter activates it the way a browser activates a link, and Space no longer does, which
// is correct native link semantics, not a regression to "fix". `buttonVariants` (exported
// alongside `Button`) keeps the styling byte-identical without going through `useButton`, whose
// `nativeButton={false}` path used to stamp `role="button"` onto the anchor (a name/role mismatch:
// assistive tech announced a real, middle-click-able, open-in-new-tab-able link as a button).
// Without an `href` it renders a genuine `<button>` — native button semantics, Enter and Space
// both activate, no anchor, no added role.
function PaginationLink({
  className,
  isActive,
  size = "icon",
  ...props
}: PaginationLinkProps) {
  const sharedProps = {
    "aria-current": isActive ? ("page" as const) : undefined,
    "data-slot": "pagination-link",
    "data-active": isActive,
    className: cn(buttonVariants({ variant: isActive ? "outline" : "ghost", size, className })),
  }

  if (props.href !== undefined) {
    return <a {...sharedProps} {...(props as React.ComponentProps<"a">)} />
  }

  return (
    <button
      type="button"
      {...sharedProps}
      {...(props as React.ComponentProps<"button">)}
    />
  )
}

function PaginationPrevious({
  className,
  text = "Previous",
  ...props
}: React.ComponentProps<typeof PaginationLink> & { text?: string }) {
  return (
    <PaginationLink
      aria-label="Go to previous page"
      size="default"
      className={cn("pl-1.5!", className)}
      {...props}
    >
      <ChevronLeftIcon data-icon="inline-start" />
      <span className="hidden sm:block">{text}</span>
    </PaginationLink>
  )
}

function PaginationNext({
  className,
  text = "Next",
  ...props
}: React.ComponentProps<typeof PaginationLink> & { text?: string }) {
  return (
    <PaginationLink
      aria-label="Go to next page"
      size="default"
      className={cn("pr-1.5!", className)}
      {...props}
    >
      <span className="hidden sm:block">{text}</span>
      <ChevronRightIcon data-icon="inline-end" />
    </PaginationLink>
  )
}

function PaginationEllipsis({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      aria-hidden
      data-slot="pagination-ellipsis"
      className={cn(
        "flex size-8 items-center justify-center [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <MoreHorizontalIcon
      />
      <span className="sr-only">More pages</span>
    </span>
  )
}

export {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
}
