"use client";

import { useTranslations } from "next-intl";

import { AppBreadcrumb } from "@/components/app-shell/app-breadcrumb";
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";

/**
 * THE SHELL'S TOP BAR: the sidebar toggle, and the breadcrumb. Nothing else.
 *
 * WHAT IS DELIBERATELY NOT HERE. The old narrow-arm header carried the product
 * name because the sidebar that normally carries it was `display: none` below
 * `lg`. It does not need to any more: the sidebar's own header carries the
 * product name and the scope switcher, and the sheet arm renders that same
 * header. A second wordmark in the top bar would be the third place the product
 * names itself on one screen.
 *
 * IT SITS OUTSIDE `#main-content`, as its sibling — the invariant
 * `components/common/skip-link.tsx` exists for. Put the toggle inside the skip
 * link's own target and the bypass lands ABOVE it, so the very next Tab walks
 * straight back into navigation: a bypass that bypasses nothing.
 *
 * THE TOGGLE'S DISCLOSURE STATE, and the half of it that is honestly missing.
 * `aria-expanded` is set here because the vendored `SidebarTrigger` does not set
 * it and a disclosure owes it. `aria-controls` is NOT set, and that is a
 * decision rather than an omission: the thing this button opens is TWO different
 * elements — a fixed column at `md` and above, a portalled sheet below it — so
 * there is no one stable id to point at, and an `aria-controls` naming an
 * element that is not in the document is worse than none. The state is the part
 * that carries meaning; the relationship is conveyed by the panel appearing
 * adjacent to the button in both arms.
 *
 * `data-firm-drawer-toggle` is kept from the old drawer for the browser leg, and
 * the reason is unchanged: once the sheet is open, Base UI marks the rest of the
 * document `aria-hidden`, so a ROLE query for this button stops resolving —
 * correctly, since it is genuinely out of the accessibility tree while a modal
 * is up. A test that asserts the expanded state while the panel is open
 * therefore needs a structural hook. Nothing in the product reads it.
 */
export function ShellHeader() {
  const t = useTranslations("AppShell");
  const { isMobile, open, openMobile } = useSidebar();
  const expanded = isMobile ? openMobile : open;

  return (
    <header className="flex items-center gap-2 border-b border-border bg-shell px-4 py-2">
      <SidebarTrigger
        data-firm-drawer-toggle
        aria-expanded={expanded}
        label={t("toggleNavigation")}
      />
      <AppBreadcrumb />
    </header>
  );
}
