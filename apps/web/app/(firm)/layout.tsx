import { Suspense, type ReactNode } from "react";
import { cookies } from "next/headers";

import { AppSidebar } from "@/components/app-shell/app-sidebar";
import { ShellHeader } from "@/components/app-shell/shell-header";
import { CommandKProvider } from "@/components/command";
import { FirmScopeProvider } from "@/components/firm-scope-provider";
import { RailMount } from "@/components/clara/rail-mount";
import { SkipLink } from "@/components/common/skip-link";
import { SidebarInset, SidebarProvider, SIDEBAR_COOKIE_NAME } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { requireFirmScope } from "@/lib/require-firm-scope";

/**
 * The firm-altitude shell — every route in this app lives under this route
 * group (Next.js route groups add no URL segment). `proxy.ts` is the ONLY
 * auth gate (redirects an unauthenticated request to /login before this
 * layout ever renders); this layout does not re-check auth — one authority,
 * one place.
 *
 * P4-2, ENTRANCE 1 OF THE SCOPE SPINE. Auth and SCOPE are two different
 * questions, and the sentence above answers only the first: `proxy.ts` proves
 * there is a session, not that the session holds an active firm membership.
 * `requireFirmScope()` (lib/require-firm-scope.ts) is the second authority, in
 * ONE place, called from here and from the two SIBLING surfaces a check here
 * cannot reach — `app/(full)/layout.tsx` and `app/api/runtime/[...path]/
 * route.ts`. It redirects to the holding route on an empty read AND on a
 * failed one; nothing below renders on a denial, because `redirect()` throws.
 *
 * #614 — ONE NAVIGATION SURFACE, TWO LEVELS INSIDE IT. This layout used to hold
 * a bespoke `<aside>` for the firm rail plus a sheet that rendered the same nav
 * a second time, and the client level nested a THIRD chrome (a nine-tab
 * horizontal strip) underneath. It is now the vendored Sidebar over the one
 * registry (`lib/navigation/tree.ts`): inside a client the sidebar opens with
 * that client's own group above the firm's, and the client layout adds no
 * chrome of its own at all.
 *
 * THE BREAKPOINT ARITHMETIC, since it moved. `components/ui/sidebar.tsx` docks
 * at `md` (768px) and becomes a sheet below it; the Clara rail docks at `lg`
 * (1024px) and is an overlay below it. Between 768 and 1023 the sidebar is
 * therefore visible while the rail costs the workbench ZERO width — which is
 * exactly why CB-AE2E-019's `lg`-only arm can relax here without reopening its
 * finding. The three widths that matter:
 *   1024+  1024 - 224 (sidebar) - 320 (docked rail) - 64 (PageShell lg padding) = 416px
 *    768   768 - 224 - 0 (rail overlaid) - 32 (PageShell narrow padding)        = 512px
 *    320   320 - 0 (sidebar is a sheet) - 0 - 32                                = 288px
 * The first two clear the 320px floor the audit set for accounting work; the
 * third is the whole viewport minus padding, which is all any layout can offer.
 * No arm makes the document scroll sideways.
 *
 * P2 FOLD SEAM H: mounts the two app-wide shell affordances here, ONCE —
 * `<CommandKProvider>` (⌘K, per its own header's integration note) and
 * `<RailMount>` (the docked Clara rail). The Clara full-screen escalation
 * routes live in the sibling `app/(full)/` group, which this layout never
 * wraps — that structure, not a runtime check, is what keeps the rail off
 * the escalated thread (Q2; P2 fold round 3).
 */
export default async function FirmLayout({
  children,
}: {
  children: ReactNode;
}) {
  // BEFORE the first await that produces markup, and with NO argument — the
  // spine's own suite asserts every entrance calls it bare, so an entrance
  // cannot quietly be handed a permissive reader. P4-6 consumes the returned
  // row through one request-scoped provider; no child re-reads the session or
  // caller_context merely to shape an affordance.
  const scope = await requireFirmScope();

  // The sidebar's own persistence, read on the SERVER so a collapsed sidebar
  // does not paint open and then snap shut on hydration. Absent cookie means
  // open, which is the right default for a first visit.
  const sidebarOpen = (await cookies()).get(SIDEBAR_COOKIE_NAME)?.value !== "false";

  return (
    <CommandKProvider>
      {/* #614: the WHOLE caller_context row, not a two-field narrowing of it.
          The shell has to render the firm's name and the caller's role, and the
          layout is already holding the row that carries both — see
          components/firm-scope-provider.tsx for why widening the provider is
          the cheaper of the two answers. */}
      <FirmScopeProvider scope={scope}>
        {/* The vendored Sidebar's collapsed-state tooltips need a provider, and
            it belongs HERE rather than in `app/layout.tsx`: the (entry) and
            (full) groups render no sidebar, and a provider at the root would
            put a tooltip context around the sign-in card for nothing. */}
        <TooltipProvider>
          {/*
          CB-AE2E-019 — `overflow-x-clip` on the shell row, and the browser leg is
          what found it. The rail's enter and exit both TRANSLATE the panel by its
          own width (`dock-panel`, app/globals.css). In the docked arm that panel
          is an in-flow flex child, so a translated box sticks out past the row's
          right edge and the DOCUMENT gains that many pixels of horizontal scroll
          for the length of the animation — measured at 640 CSS px as
          `documentElement.scrollWidth` 712 against a `clientWidth` of 640, which
          is a WCAG 2.2 SC 1.4.10 failure that appears and disappears in 200ms.

          `clip`, NOT `hidden`, and the difference is load-bearing: `overflow-x:
          hidden` forces the other axis to compute as `auto`, which would make this
          row a scroll container and break the rail's own `sticky top-0`.
          `overflow-x: clip` pairs legally with `overflow-y: visible`, creates no
          scroll container, and is the one value that exists for exactly this job.
          It also does not clip the sidebar: `overflow` never clips a
          `position: fixed` descendant whose containing block is the viewport, and
          this row establishes no such containing block (no transform, no filter,
          no `contain`).

          `relative` is the SkipLink's `focus:absolute` anchor, unchanged.
          */}
          <SidebarProvider
            defaultOpen={sidebarOpen}
            className="relative overflow-x-clip bg-background"
          >
            {/* DS-02 (P6-3): the bypass-blocks affordance. FIRST in DOM order, so
                it is the first thing Tab reaches on every firm route. See
                components/common/skip-link.tsx for why it is mounted here and
                deliberately not in the (entry) or (full) groups. */}
            <SkipLink />
            {/* The two `<Suspense>` boundaries are a BUILD-TIME contract, not a
                loading state. `useSearchParams()` (the sidebar needs `?tab=` to
                know which register view is current, the breadcrumb to name it)
                requires a Suspense boundary above it or Next refuses to
                statically render the page. Every route in this group is dynamic
                already — this layout reads cookies twice over — so neither
                fallback is ever shown; the boundary exists so a future change
                that makes a page static fails loudly instead of at build. */}
            <Suspense fallback={null}>
              <AppSidebar />
            </Suspense>
            <SidebarInset className="min-w-0">
              <Suspense fallback={null}>
                <ShellHeader />
              </Suspense>
              {/* `id`/`tabIndex` are the SkipLink's anchor — the column exists for
                  every route in this group by construction, which the page-level
                  `<main>` does not. See skip-link.tsx's header.
                  `outline-none` here is deliberate and is the W3C WAI skip-link
                  tutorial's own pattern: a `tabindex="-1"` container is a scroll
                  and announce target, not a control in the tab order, and ringing
                  a full-viewport column on every skip would be louder than the
                  journey it serves. Chrome does not match `:focus-visible` on
                  programmatic focus of a div either, so nothing paints regardless.
                  What confirms the jump to a sighted keyboard user is the scroll
                  plus the next Tab landing past the nav — which the browser leg
                  asserts (review N-6, recorded rather than changed). */}
              <div
                data-firm-workbench
                id="main-content"
                tabIndex={-1}
                className="min-w-0 flex-1 bg-background outline-none"
              >
                {children}
              </div>
            </SidebarInset>
            <RailMount />
          </SidebarProvider>
        </TooltipProvider>
      </FirmScopeProvider>
    </CommandKProvider>
  );
}
