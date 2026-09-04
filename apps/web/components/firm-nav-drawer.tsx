"use client";

import * as React from "react";
import { MenuIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { FirmNav } from "@/components/firm-nav";
import { LogoutButton } from "@/components/logout-button";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

/**
 * CB-AE2E-019, SEAM 1 OF 3 — the firm rail below `lg`.
 *
 * THE DEFECT THIS EXISTS FOR. `app/(firm)/layout.tsx` was a plain flex row of
 * three siblings with no width breakpoint anywhere: a `w-56 shrink-0` sidebar
 * (224px), a `min-w-0 flex-1` workbench, and a `w-80 shrink-0` Clara rail
 * (320px) that opens by default. 544px of chrome before `PageShell`'s own 64px
 * of padding, all of it unconditional — so at a 1280px window at 200% zoom (640
 * CSS px, the exact case WCAG 2.2 SC 1.4.10 Reflow names) the workbench rendered
 * about 32px wide. This is the sidebar's half of the fix: above `lg` the
 * `<aside>` in the layout is unchanged, and below `lg` it is hidden and its
 * CONTENT — the same `<FirmNav />`, the same `<LogoutButton />` — is rendered
 * here inside a sheet instead. One nav registry, one set of rank floors, two
 * chromes.
 *
 * WHY A PRIMITIVE AND NOT A HAND-ROLLED PANEL. A modal side panel owes four
 * behaviours that are easy to claim and tedious to get right: a focus trap while
 * open, Escape to dismiss, an outside press to dismiss, and focus RETURNED to the
 * control that opened it. `components/ui/sheet.tsx` (Base UI's Dialog) brings all
 * four. The one this file still owns explicitly is the fourth, via `finalFocus` —
 * the same shape `components/command/command-k-provider.tsx:142` uses for ⌘K, so
 * the two modal surfaces in this product return focus by one mechanism rather
 * than two.
 *
 * WHY THE ROUTE-CHANGE EFFECT IS NOT OPTIONAL. Every control inside this drawer
 * is a navigation. Without the effect the drawer survives the navigation it just
 * performed and sits over the page the user asked for — the failure mode is
 * "I tapped Clients and nothing happened", because the destination is behind the
 * panel. `usePathname()` changing IS the navigation completing, so that is what
 * closes it.
 *
 * THE TOGGLE'S ACCESSIBLE NAME IS ITS VISIBLE TEXT. `aria-label` is deliberately
 * absent: the button reads "Menu" on screen, and an `aria-label` that did not
 * contain that string would break WCAG 2.1 SC 2.5.3 (Label in Name) for anyone
 * driving it by voice. `aria-expanded` + `aria-controls` carry the state and the
 * relationship instead, which is what the disclosure pattern actually asks for.
 */
export function FirmNavDrawer() {
  const t = useTranslations("FirmNav");
  const tBrand = useTranslations("Brand");
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const panelId = React.useId();
  const pathname = usePathname();

  // Close on a completed navigation. `pathname` is the dependency, not a click
  // handler on each link: a link is not the only way out of here (a middle-click
  // restore, a `router.push` from a child, the browser's own back button all
  // change the path without any handler in this file firing).
  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button
        ref={triggerRef}
        // `data-firm-drawer-toggle` exists for the browser leg, and the reason is
        // worth recording: once the sheet is open, Base UI marks the rest of the
        // document `aria-hidden`, so a ROLE query for this button stops resolving
        // — correctly, since the button is genuinely not in the accessibility
        // tree while a modal is up. A test that asserts `aria-expanded="true"`
        // while the panel is open therefore cannot reach it by role and needs a
        // structural hook. That is the attribute's whole job; nothing in the
        // product reads it.
        data-firm-drawer-toggle
        type="button"
        variant="ghost"
        size="sm"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(true)}
      >
        <MenuIcon />
        {t("drawerTrigger")}
      </Button>
      <SheetContent
        id={panelId}
        side="left"
        // The rail's own width above `lg`, so the drawer is the same nav at the
        // same measure rather than a second layout of it — capped at 85vw so it
        // never becomes the whole viewport on the narrowest phone.
        className="w-56 max-w-[85vw] gap-4 bg-sidebar p-4"
        finalFocus={triggerRef}
      >
        <SheetHeader className="p-0">
          <SheetTitle className="px-2.5 text-sm font-semibold text-sidebar-foreground">
            {tBrand("productName")}
          </SheetTitle>
          <SheetDescription className="sr-only">{t("ariaLabel")}</SheetDescription>
        </SheetHeader>
        <FirmNav />
        <div className="mt-auto">
          <LogoutButton />
        </div>
      </SheetContent>
    </Sheet>
  );
}
