"use client"

// PROVENANCE — vendored, not hand-written.
//
//   cd apps/web && pnpm dlx shadcn@4.19.0 add sidebar breadcrumb collapsible
//
// style `base-nova`, `@base-ui/react` 1.7.0. The CLI offered to overwrite the
// existing `button.tsx`, `input.tsx`, `separator.tsx` and `sheet.tsx` (this
// file's registry dependencies); ALL FOUR WERE DECLINED, so the house versions
// are untouched. The CLI also added `cn` as an npm dependency; it was removed
// again and the imports normalised to `@/lib/utils`, which is where every other
// primitive in this directory reads it from. `git diff package.json
// pnpm-lock.yaml` is empty after the add, which is the check the house vendoring
// discipline actually asks for (components/ui/sheet.tsx's own header).
//
// HAND EDITS, all of them, in the same commit as the add:
//
//  1. i18n (every string routes through next-intl). The
//     vendored file shipped four hardcoded English strings — "Toggle Sidebar"
//     twice on `SidebarTrigger`/`SidebarRail`, plus the mobile sheet's screen-
//     reader-only "Sidebar" / "Displays the mobile sidebar." Each now reads the
//     `AppShell` namespace, and each takes an optional prop so a caller with a
//     more specific name (the shell header's own toggle) can say so without a
//     second translation catalogue.
//  2. THE WIDTH: `SIDEBAR_WIDTH` 16rem -> 14rem, and this is the one edit with
//     arithmetic behind it. 14rem is 224px, the exact width the pre-#614 firm
//     rail carried, and CB-AE2E-019 is why that number and not the vendored 256:
//     at `lg` the shell is sidebar + workbench + the 320px Clara rail + 64px of
//     PageShell padding. 1024 - 224 - 320 - 64 = 416px of workbench; at the
//     vendored 256 it would be 384. Both clear 320, but 224 keeps the docked
//     three-column arm at the measure the audit settled on rather than quietly
//     re-litigating it. `SIDEBAR_WIDTH_MOBILE` (18rem) is untouched: the sheet
//     is the only thing on screen, so it is not competing for width.
//  3. MOTION. Three literal `duration-200`s replaced with `motion-panel`, the
//     token utility (`--motion-duration-panel`, token contract §7's "Dialog,
//     sheet, Clara dock reflow" tier — a sidebar that slides a panel in and out
//     is exactly that tier). No ad-hoc durations (motion law). The
//     transitions that MOVE — the gap's width, the container's
//     left/right/width, the group label's margin — are now `motion-safe:`, so
//     under `prefers-reduced-motion: reduce` the sidebar changes state instantly
//     instead of travelling. CORRECTED after the browser leg measured the
//     gap's width and the container's left still animating under
//     `prefers-reduced-motion: reduce` (#614): a `motion-safe:`-only property
//     list leaves `transition-property` at the browser default `all`, and
//     `motion-panel` still supplies the duration — so the moving transitions
//     now declare their property list unconditionally and add
//     `motion-reduce:transition-none`, which is what actually removes the
//     movement. The group label's OPACITY transition is left
//     unconditional, which is the contract's own rule: "reduced motion removes
//     position, scale, stagger and parallax; opacity and explicit state copy
//     remain". The same defect was present on two more elements that move
//     rather than fade — `SidebarMenuButton`'s variant base (a bare
//     `transition-[width,height,padding]`) and `SidebarRail` (a bare
//     `transition-all ease-linear`, whose only actual motion is the resize
//     handle's translate) — both now name their moving property, carry
//     `motion-fast` for the duration, and add `motion-reduce:transition-none`.
//  4. `dark:` census: ZERO occurrences in the emitted file (light-theme-only,
//     owner ruling Q4) — nothing to strip. Recorded as a measurement.
//  5. `SidebarInset` renders a `<div>`, NOT a `<main>`. Every route-level
//     surface in this app already renders `components/common/page-shell.tsx`'s
//     `<main>`; the vendored inset would have wrapped it in a SECOND main
//     landmark on every page, which is both invalid and exactly the kind of
//     duplicate landmark test/a11yRules.ts exists to keep out. The inset is
//     chrome — a column, not the document's main content — so a div is the
//     honest element and the page keeps sole ownership of the landmark.
//  6. `SidebarGroupLabel`'s colour: `text-sidebar-foreground/70` ->
//     `text-sidebar-foreground`. The composited 70% pair is not one
//     scripts/check-token-contrast.mjs measures, and in this shell the group
//     label is not decoration — it is the FIRM NAME and the CLIENT NAME, the two
//     strings that answer "whose books am I in". A scope label at 70% opacity is
//     the wrong trade at any contrast ratio.
//  7. The `sidebar_state` cookie gains an explicit `SameSite=Lax`. Browsers
//     default to Lax already; writing it down means the default is a decision
//     rather than an inheritance. The cookie itself is kept — it is what makes a
//     collapsed sidebar survive a reload, and `app/(firm)/layout.tsx` reads it
//     server-side so there is no open-then-collapse flash.
//  8. The ⌘/Ctrl+B shortcut is KEPT. Checked for collisions against the app's
//     own bindings: ⌘K is the command palette (components/command/
//     command-k-provider.tsx) and Escape is the Clara rail's dismiss
//     (components/clara/rail-chrome.tsx). Nothing binds B.
//  9. `SidebarMenuSkeleton` is DELETED (#743), and so is its `Skeleton` import
//     and its line in the export block. Upstream seeds the placeholder bar's
//     width with a pseudo-random draw inside a lazy `useState` initialiser, so
//     the server and the client choose different widths and the first
//     server-rendered use is a hydration mismatch by construction — the very
//     fault class #732 was opened for. Nothing in this app consumed it (only the
//     definition and the export line existed), so deleting is cheaper and
//     honester than deriving a width from `useId` for a component with no
//     caller. A vendor sync WILL reinstate it: drop it again, or key the width
//     off an index prop / `useId` if something has grown a use for it by then.
// 10. `SIDEBAR_COOKIE_NAME` / `SIDEBAR_COOKIE_MAX_AGE` are DECLARED ELSEWHERE
//     (#733) — `lib/navigation/sidebar-cookie.ts`, a plain module with no
//     `"use client"` — and imported back here, which is why the two `const`s
//     below are gone and an import stands in their place. A Server Component may
//     import a CLIENT COMPONENT from a `"use client"` module and render it, but
//     a plain-value export from such a module carries no client-reference
//     machinery, so `app/(firm)/layout.tsx`'s server-side import of the cookie
//     name resolved to `undefined` and `cookies().get(undefined)` never found
//     the real `sidebar_state` cookie. The re-export below keeps every existing
//     client importer (`components/settings/account-settings.tsx`) unchanged.
// 11. `Sidebar` RENDERS BOTH ARMS (#732). The vendored component early-returns
//     the mobile `<Sheet>` instead of the docked column; it now renders the
//     docked column at every width (it already carries `hidden md:block`) and
//     ADDS the sheet when `isMobile`. The measurement and the whole chain are in
//     the note on the component itself; the one-line reason is that the layout's
//     `<Suspense>` boundaries hydrate after the root has run its effects, so a
//     component that swaps its entire host output on a post-mount viewport read
//     is a hydration mismatch waiting for a narrow viewport. Pair with
//     `hooks/use-mobile.ts`, whose flip is now a `startTransition`.

import * as React from "react"
import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"
import { useTranslations } from "next-intl"

import { cn } from "@/lib/utils"
import { useIsMobile } from "@/hooks/use-mobile"
import { SIDEBAR_COOKIE_MAX_AGE, SIDEBAR_COOKIE_NAME } from "@/lib/navigation/sidebar-cookie"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { PanelLeftIcon } from "lucide-react"

/** 224px — see hand edit 2 for the arithmetic this number comes from. */
const SIDEBAR_WIDTH = "14rem"
const SIDEBAR_WIDTH_MOBILE = "18rem"
const SIDEBAR_WIDTH_ICON = "3rem"
const SIDEBAR_KEYBOARD_SHORTCUT = "b"

// RE-EXPORTED, NOT RE-DECLARED (#733, hand edit 10). Both cookie constants live
// in `lib/navigation/sidebar-cookie.ts` — a plain module — because the Server
// layout has to import the NAME and a plain value cannot cross a `"use client"`
// boundary. They are re-exported here so #626's personal-settings "sidebar
// starts" preference, which writes THIS SAME cookie (same name, same max-age) on
// save, keeps importing both from the component module it already reads and
// cannot drift onto a second spelling.
export { SIDEBAR_WIDTH }

type SidebarContextProps = {
  state: "expanded" | "collapsed"
  open: boolean
  setOpen: (open: boolean) => void
  openMobile: boolean
  setOpenMobile: (open: boolean) => void
  isMobile: boolean
  toggleSidebar: () => void
}

const SidebarContext = React.createContext<SidebarContextProps | null>(null)

function useSidebar() {
  const context = React.useContext(SidebarContext)
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.")
  }

  return context
}

/**
 * HAND EDIT (#614): the same context, or `null` outside a provider. For chrome
 * that is mounted BESIDE the sidebar in production (the Clara rail, a sibling
 * under the provider) but rendered bare in unit cells: it must know when the
 * mobile Sheet is up — the rail goes `inert` behind that modal, measured in the
 * browser leg where Base UI's hide-others left the rail live — without
 * demanding a provider it does not otherwise need.
 */
function useSidebarOptional() {
  return React.useContext(SidebarContext)
}

function SidebarProvider({
  defaultOpen = true,
  open: openProp,
  onOpenChange: setOpenProp,
  className,
  style,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const isMobile = useIsMobile()
  const [openMobile, setOpenMobile] = React.useState(false)

  // This is the internal state of the sidebar.
  // We use openProp and setOpenProp for control from outside the component.
  const [_open, _setOpen] = React.useState(defaultOpen)
  const open = openProp ?? _open
  const setOpen = React.useCallback(
    (value: boolean | ((value: boolean) => boolean)) => {
      const openState = typeof value === "function" ? value(open) : value
      if (setOpenProp) {
        setOpenProp(openState)
      } else {
        _setOpen(openState)
      }

      // This sets the cookie to keep the sidebar state.
      document.cookie = `${SIDEBAR_COOKIE_NAME}=${openState}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}; SameSite=Lax`
    },
    [setOpenProp, open]
  )

  // Helper to toggle the sidebar.
  const toggleSidebar = React.useCallback(() => {
    return isMobile ? setOpenMobile((open) => !open) : setOpen((open) => !open)
  }, [isMobile, setOpen, setOpenMobile])

  // Adds a keyboard shortcut to toggle the sidebar.
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === SIDEBAR_KEYBOARD_SHORTCUT &&
        (event.metaKey || event.ctrlKey)
      ) {
        event.preventDefault()
        toggleSidebar()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [toggleSidebar])

  // We add a state so that we can do data-state="expanded" or "collapsed".
  // This makes it easier to style the sidebar with Tailwind classes.
  const state = open ? "expanded" : "collapsed"

  const contextValue = React.useMemo<SidebarContextProps>(
    () => ({
      state,
      open,
      setOpen,
      isMobile,
      openMobile,
      setOpenMobile,
      toggleSidebar,
    }),
    [state, open, setOpen, isMobile, openMobile, setOpenMobile, toggleSidebar]
  )

  return (
    <SidebarContext.Provider value={contextValue}>
      <div
        data-slot="sidebar-wrapper"
        style={
          {
            "--sidebar-width": SIDEBAR_WIDTH,
            "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
            ...style,
          } as React.CSSProperties
        }
        className={cn(
          "group/sidebar-wrapper flex min-h-svh w-full has-data-[variant=inset]:bg-sidebar",
          className
        )}
        {...props}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  )
}

function Sidebar({
  side = "left",
  variant = "sidebar",
  collapsible = "offcanvas",
  className,
  children,
  dir,
  ...props
}: React.ComponentProps<"div"> & {
  side?: "left" | "right"
  variant?: "sidebar" | "floating" | "inset"
  collapsible?: "offcanvas" | "icon" | "none"
}) {
  const t = useTranslations("AppShell")
  const { isMobile, state, openMobile, setOpenMobile } = useSidebar()

  if (collapsible === "none") {
    return (
      <div
        data-slot="sidebar"
        className={cn(
          "flex h-full w-(--sidebar-width) flex-col bg-sidebar text-sidebar-foreground",
          className
        )}
        {...props}
      >
        {children}
      </div>
    )
  }

  // #732 — BOTH ARMS RENDER, AND CSS DECIDES WHICH ONE IS SEEN. The vendored
  // shape was `if (isMobile) return <Sheet…>` — ONE arm or the OTHER — and that
  // early return is the hydration fault #732 was opened for.
  //
  // MEASURED (2026-09-14, `next build` + `next start`, Chromium via the e2e
  // harness): loading a firm route at 375 CSS px logged TWO
  // `Minified React error #418` and none at 1280. A `MutationObserver` armed at
  // `DOMContentLoaded` showed React removing the server's
  // `<div data-slot="sidebar">` TOGETHER WITH the `<!--$-->` / `<!--/$-->`
  // comments that fence a Suspense boundary. The chain: `app/(firm)/layout.tsx`
  // wraps `<AppSidebar />` and `<ShellHeader />` in `<Suspense>` (a build-time
  // contract for `useSearchParams()`, per its own note), React hydrates those
  // boundaries as their own units AFTER the root around them has committed and
  // run its effects, and `useIsMobile`'s post-mount flip to `true` reaches them
  // in between. With the early return, the tree this component then produced was
  // the SHEET — which renders nothing while closed — against server HTML that
  // holds a whole docked sidebar. Nothing to match, so React regenerated it.
  //
  // WHY THIS SHAPE FIXES IT BY CONSTRUCTION rather than by timing. The docked
  // markup below is now rendered at EVERY width; it already carries
  // `hidden md:block`, so below `md` it is `display: none` — out of layout, out
  // of the accessibility tree, not focusable, exactly as before. Whatever moment
  // a boundary hydrates, and whatever `isMobile` says at that moment, the host
  // elements this component produces are the same ones the server sent. The
  // sheet is now an ADDITION for the narrow arm, not a replacement, and Base UI
  // renders nothing for it while it is closed — so the DOM is unchanged until
  // the human opens the drawer.
  //
  // `useIsMobile`'s own `startTransition` (hooks/use-mobile.ts) stays, and the
  // two fixes are not redundant: the transition stops the flip from being an
  // URGENT update mid-hydration (measured: two #418 down to one), and this shape
  // removes the remaining one by making the two arms agree on their host output.
  //
  // `{...props}` STAYS ON THE DOCKED CONTAINER ONLY. The vendored mobile arm
  // spread it onto `<Sheet>` (a Base UI Dialog root, not a DOM node); with both
  // arms live that would spread the same DOM props twice. The app's single call
  // site (`components/app-shell/app-sidebar.tsx:192`) passes only `collapsible`,
  // so nothing is lost, and the docked container is where the vendored desktop
  // arm already put them.
  const mobileSheet =
    isMobile ? (
      <Sheet open={openMobile} onOpenChange={setOpenMobile}>
        <SheetContent
          dir={dir}
          data-sidebar="sidebar"
          // NOT `data-slot="sidebar"` here (the CLI emits it): SheetContent
          // spreads props after its own `data-slot="sheet-content"`, so the
          // override would erase the sheet's marker — measured in the browser
          // leg (#614), where every `[data-slot=sheet-content]` selector missed
          // the open panel. `data-sidebar`/`data-mobile` carry the sidebar's
          // identity; the slot stays the sheet's.
          data-mobile="true"
          // THE WIDTH, SPELLED TO WIN. `SheetContent`'s own arms are
          // `data-[side=left]:w-3/4` and `data-[side=left]:sm:max-w-sm` at
          // (0,2,0), so a bare `w-(--sidebar-width)` (0,1,0) never bound and
          // the sheet computed to 384px at 640 CSS px — the exact failure the
          // retired firm-nav-drawer documented. Matching the vendored variant
          // makes tailwind-merge DROP the primitive's class before it is
          // emitted, so there is no specificity contest left to lose. The
          // 85vw cap keeps the panel off the whole viewport on a 320px phone
          // (#614, browser leg).
          className="w-(--sidebar-width) max-w-[85vw] data-[side=left]:w-(--sidebar-width) data-[side=right]:w-(--sidebar-width) data-[side=left]:sm:max-w-[85vw] data-[side=right]:sm:max-w-[85vw] bg-sidebar p-0 text-sidebar-foreground [&>button]:hidden"
          style={
            {
              "--sidebar-width": SIDEBAR_WIDTH_MOBILE,
            } as React.CSSProperties
          }
          side={side}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>{t("sidebarTitle")}</SheetTitle>
            <SheetDescription>{t("sidebarDescription")}</SheetDescription>
          </SheetHeader>
          <div className="flex h-full w-full flex-col">{children}</div>
        </SheetContent>
      </Sheet>
    ) : null

  return (
    <>
      {mobileSheet}
    <div
      className="group peer hidden text-sidebar-foreground md:block"
      data-state={state}
      data-collapsible={state === "collapsed" ? collapsible : ""}
      data-variant={variant}
      data-side={side}
      data-slot="sidebar"
    >
      {/* This is what handles the sidebar gap on desktop */}
      <div
        data-slot="sidebar-gap"
        className={cn(
          "motion-panel relative w-(--sidebar-width) bg-transparent ease-linear transition-[width] motion-reduce:transition-none",
          "group-data-[collapsible=offcanvas]:w-0",
          "group-data-[side=right]:rotate-180",
          variant === "floating" || variant === "inset"
            ? "group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4)))]"
            : "group-data-[collapsible=icon]:w-(--sidebar-width-icon)"
        )}
      />
      <div
        data-slot="sidebar-container"
        data-side={side}
        className={cn(
          "motion-panel fixed inset-y-0 z-10 hidden h-svh w-(--sidebar-width) ease-linear transition-[left,right,width] motion-reduce:transition-none data-[side=left]:left-0 data-[side=left]:group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)] data-[side=right]:right-0 data-[side=right]:group-data-[collapsible=offcanvas]:right-[calc(var(--sidebar-width)*-1)] md:flex",
          // Adjust the padding for floating and inset variants.
          variant === "floating" || variant === "inset"
            ? "p-2 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4))+2px)]"
            : "group-data-[collapsible=icon]:w-(--sidebar-width-icon) group-data-[side=left]:border-r group-data-[side=right]:border-l",
          className
        )}
        {...props}
      >
        <div
          data-sidebar="sidebar"
          data-slot="sidebar-inner"
          className="flex size-full flex-col bg-sidebar group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:shadow-sm group-data-[variant=floating]:ring-1 group-data-[variant=floating]:ring-sidebar-border"
        >
          {children}
        </div>
      </div>
    </div>
    </>
  )
}

function SidebarTrigger({
  className,
  onClick,
  label,
  ...props
}: React.ComponentProps<typeof Button> & {
  /** Overrides the default accessible name. The shell header passes its own. */
  label?: string
}) {
  const t = useTranslations("AppShell")
  const { toggleSidebar } = useSidebar()

  return (
    <Button
      data-sidebar="trigger"
      data-slot="sidebar-trigger"
      variant="ghost"
      size="icon-sm"
      className={cn(className)}
      onClick={(event) => {
        onClick?.(event)
        toggleSidebar()
      }}
      {...props}
    >
      <PanelLeftIcon />
      <span className="sr-only">{label ?? t("toggleNavigation")}</span>
    </Button>
  )
}

function SidebarRail({
  className,
  label,
  ...props
}: React.ComponentProps<"button"> & { label?: string }) {
  const t = useTranslations("AppShell")
  const { toggleSidebar } = useSidebar()
  const name = label ?? t("toggleNavigation")

  return (
    <button
      data-sidebar="rail"
      data-slot="sidebar-rail"
      aria-label={name}
      tabIndex={-1}
      onClick={toggleSidebar}
      title={name}
      className={cn(
        "absolute inset-y-0 z-20 hidden w-4 motion-fast transition-transform motion-reduce:transition-none ease-linear group-data-[side=left]:-right-4 group-data-[side=right]:left-0 after:absolute after:inset-y-0 after:start-1/2 after:w-[2px] hover:after:bg-sidebar-border sm:flex ltr:-translate-x-1/2 rtl:-translate-x-1/2",
        "in-data-[side=left]:cursor-w-resize in-data-[side=right]:cursor-e-resize",
        "[[data-side=left][data-state=collapsed]_&]:cursor-e-resize [[data-side=right][data-state=collapsed]_&]:cursor-w-resize",
        "group-data-[collapsible=offcanvas]:translate-x-0 group-data-[collapsible=offcanvas]:after:left-full hover:group-data-[collapsible=offcanvas]:bg-sidebar",
        "[[data-side=left][data-collapsible=offcanvas]_&]:-right-2",
        "[[data-side=right][data-collapsible=offcanvas]_&]:-left-2",
        className
      )}
      {...props}
    />
  )
}

/** A `<div>`, not a `<main>` — see hand edit 5. The page's own `PageShell`
 *  renders the one `<main>` landmark this document has. */
function SidebarInset({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-inset"
      className={cn(
        "relative flex w-full flex-1 flex-col bg-background md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]:shadow-sm md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-2",
        className
      )}
      {...props}
    />
  )
}

function SidebarInput({
  className,
  ...props
}: React.ComponentProps<typeof Input>) {
  return (
    <Input
      data-slot="sidebar-input"
      data-sidebar="input"
      className={cn("h-8 w-full bg-background shadow-none", className)}
      {...props}
    />
  )
}

function SidebarHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-header"
      data-sidebar="header"
      className={cn("flex flex-col gap-2 p-2", className)}
      {...props}
    />
  )
}

function SidebarFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-footer"
      data-sidebar="footer"
      className={cn("flex flex-col gap-2 p-2", className)}
      {...props}
    />
  )
}

function SidebarSeparator({
  className,
  ...props
}: React.ComponentProps<typeof Separator>) {
  return (
    <Separator
      data-slot="sidebar-separator"
      data-sidebar="separator"
      className={cn("mx-2 w-auto bg-sidebar-border", className)}
      {...props}
    />
  )
}

function SidebarContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-content"
      data-sidebar="content"
      className={cn(
        "no-scrollbar flex min-h-0 flex-1 flex-col gap-0 overflow-auto group-data-[collapsible=icon]:overflow-hidden",
        className
      )}
      {...props}
    />
  )
}

function SidebarGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-group"
      data-sidebar="group"
      className={cn("relative flex w-full min-w-0 flex-col p-2", className)}
      {...props}
    />
  )
}

function SidebarGroupLabel({
  className,
  render,
  ...props
}: useRender.ComponentProps<"div"> & React.ComponentProps<"div">) {
  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(
      {
        className: cn(
          "motion-panel flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium text-sidebar-foreground ring-sidebar-ring outline-hidden ease-linear transition-opacity motion-safe:transition-[margin,opacity] group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0 focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
          className
        ),
      },
      props
    ),
    render,
    state: {
      slot: "sidebar-group-label",
      sidebar: "group-label",
    },
  })
}

function SidebarGroupAction({
  className,
  render,
  ...props
}: useRender.ComponentProps<"button"> & React.ComponentProps<"button">) {
  return useRender({
    defaultTagName: "button",
    props: mergeProps<"button">(
      {
        className: cn(
          "absolute top-3.5 right-3 flex aspect-square w-5 items-center justify-center rounded-md p-0 text-sidebar-foreground ring-sidebar-ring outline-hidden transition-transform group-data-[collapsible=icon]:hidden after:absolute after:-inset-2 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 md:after:hidden [&>svg]:size-4 [&>svg]:shrink-0",
          className
        ),
      },
      props
    ),
    render,
    state: {
      slot: "sidebar-group-action",
      sidebar: "group-action",
    },
  })
}

function SidebarGroupContent({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-group-content"
      data-sidebar="group-content"
      className={cn("w-full text-sm", className)}
      {...props}
    />
  )
}

function SidebarMenu({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="sidebar-menu"
      data-sidebar="menu"
      className={cn("flex w-full min-w-0 flex-col gap-0", className)}
      {...props}
    />
  )
}

function SidebarMenuItem({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="sidebar-menu-item"
      data-sidebar="menu-item"
      className={cn("group/menu-item relative", className)}
      {...props}
    />
  )
}

const sidebarMenuButtonVariants = cva(
  "peer/menu-button group/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm ring-sidebar-ring outline-hidden motion-fast transition-[width,height,padding] motion-reduce:transition-none group-has-data-[sidebar=menu-action]/menu-item:pr-8 group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-open:hover:bg-sidebar-accent data-open:hover:text-sidebar-accent-foreground data-active:bg-sidebar-accent data-active:font-medium data-active:text-sidebar-accent-foreground [&_svg]:size-4 [&_svg]:shrink-0 [&>span:last-child]:truncate",
  {
    variants: {
      variant: {
        default: "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        outline:
          "bg-background shadow-[0_0_0_1px_var(--sidebar-border)] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:shadow-[0_0_0_1px_var(--sidebar-accent)]",
      },
      size: {
        default: "h-8 text-sm",
        sm: "h-7 text-xs",
        lg: "h-12 text-sm group-data-[collapsible=icon]:p-0!",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function SidebarMenuButton({
  render,
  isActive = false,
  variant = "default",
  size = "default",
  tooltip,
  className,
  ...props
}: useRender.ComponentProps<"button"> &
  React.ComponentProps<"button"> & {
    isActive?: boolean
    tooltip?: string | React.ComponentProps<typeof TooltipContent>
  } & VariantProps<typeof sidebarMenuButtonVariants>) {
  const { isMobile, state } = useSidebar()
  const comp = useRender({
    defaultTagName: "button",
    props: mergeProps<"button">(
      {
        className: cn(sidebarMenuButtonVariants({ variant, size }), className),
      },
      props
    ),
    render: !tooltip ? render : <TooltipTrigger render={render} />,
    state: {
      slot: "sidebar-menu-button",
      sidebar: "menu-button",
      size,
      active: isActive,
    },
  })

  if (!tooltip) {
    return comp
  }

  if (typeof tooltip === "string") {
    tooltip = {
      children: tooltip,
    }
  }

  return (
    <Tooltip>
      {comp}
      <TooltipContent
        side="right"
        align="center"
        hidden={state !== "collapsed" || isMobile}
        {...tooltip}
      />
    </Tooltip>
  )
}

function SidebarMenuAction({
  className,
  render,
  showOnHover = false,
  ...props
}: useRender.ComponentProps<"button"> &
  React.ComponentProps<"button"> & {
    showOnHover?: boolean
  }) {
  return useRender({
    defaultTagName: "button",
    props: mergeProps<"button">(
      {
        className: cn(
          "absolute top-1.5 right-1 flex aspect-square w-5 items-center justify-center rounded-md p-0 text-sidebar-foreground ring-sidebar-ring outline-hidden transition-transform group-data-[collapsible=icon]:hidden peer-hover/menu-button:text-sidebar-accent-foreground peer-data-[size=default]/menu-button:top-1.5 peer-data-[size=lg]/menu-button:top-2.5 peer-data-[size=sm]/menu-button:top-1 after:absolute after:-inset-2 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 md:after:hidden [&>svg]:size-4 [&>svg]:shrink-0",
          showOnHover &&
            "group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 peer-data-active/menu-button:text-sidebar-accent-foreground aria-expanded:opacity-100 md:opacity-0",
          className
        ),
      },
      props
    ),
    render,
    state: {
      slot: "sidebar-menu-action",
      sidebar: "menu-action",
    },
  })
}

function SidebarMenuBadge({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-menu-badge"
      data-sidebar="menu-badge"
      className={cn(
        "pointer-events-none absolute right-1 flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-xs font-medium text-sidebar-foreground tabular-nums select-none group-data-[collapsible=icon]:hidden peer-hover/menu-button:text-sidebar-accent-foreground peer-data-[size=default]/menu-button:top-1.5 peer-data-[size=lg]/menu-button:top-2.5 peer-data-[size=sm]/menu-button:top-1 peer-data-active/menu-button:text-sidebar-accent-foreground",
        className
      )}
      {...props}
    />
  )
}

// #743 — HAND EDIT 9, A DELETION: the vendored `SidebarMenuSkeleton` USED TO SIT
// HERE and does not any more. See this file's header, item 9, for why; the short
// version is that its bar width came from a pseudo-random number drawn in a lazy
// `useState` initialiser, which is a hydration mismatch by construction, and
// nothing in this app ever rendered it. Its `Skeleton` import went with it.

function SidebarMenuSub({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="sidebar-menu-sub"
      data-sidebar="menu-sub"
      className={cn(
        "mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l border-sidebar-border px-2.5 py-0.5 group-data-[collapsible=icon]:hidden",
        className
      )}
      {...props}
    />
  )
}

function SidebarMenuSubItem({
  className,
  ...props
}: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="sidebar-menu-sub-item"
      data-sidebar="menu-sub-item"
      className={cn("group/menu-sub-item relative", className)}
      {...props}
    />
  )
}

function SidebarMenuSubButton({
  render,
  size = "md",
  isActive = false,
  className,
  ...props
}: useRender.ComponentProps<"a"> &
  React.ComponentProps<"a"> & {
    size?: "sm" | "md"
    isActive?: boolean
  }) {
  return useRender({
    defaultTagName: "a",
    props: mergeProps<"a">(
      {
        className: cn(
          "flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground ring-sidebar-ring outline-hidden group-data-[collapsible=icon]:hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[size=md]:text-sm data-[size=sm]:text-xs data-active:bg-sidebar-accent data-active:text-sidebar-accent-foreground [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-sidebar-accent-foreground",
          className
        ),
      },
      props
    ),
    render,
    state: {
      slot: "sidebar-menu-sub-button",
      sidebar: "menu-sub-button",
      size,
      active: isActive,
    },
  })
}

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
  useSidebarOptional,
}
