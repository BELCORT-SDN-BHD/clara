"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const CLIENT_TABS = [
  { segment: "", messageKey: "home" },
  { segment: "journals", messageKey: "journals" },
  { segment: "documents", messageKey: "documents" },
  { segment: "bank", messageKey: "bank" },
  { segment: "close", messageKey: "close" },
  { segment: "tax", messageKey: "tax" },
  { segment: "reports", messageKey: "reports" },
  { segment: "registers", messageKey: "registers" },
  { segment: "knowledge", messageKey: "knowledge" },
] as const;

/**
 * Client-workspace tab nav (owner ruling Q3 — ONE workspace, accounting
 * objects as tabs, not separate per-surface routes). URL-as-truth: every
 * tab is `/clients/:clientId/:tab`, addressable and bookmarkable on its own.
 *
 * CB-AE2E-019, SEAM 2 OF 3 — WHAT CHANGED AND WHY IT IS NOT A `Tabs`.
 *
 * These nine controls are `<Link>`s inside a `<nav>` landmark: selecting one is
 * a real navigation to a real URL, not a panel swap. That is why this file does
 * NOT adopt `components/ui/tabs.tsx` even though it is named "tab nav" — the
 * WAI-ARIA tabs pattern (roving tabindex, one tab stop for the whole set,
 * `aria-selected`) describes a widget that switches panels IN PLACE, and
 * claiming it here would tell a screen reader these are panel switches and then
 * navigate the page out from under it. `SectionTabs` is the in-page switcher and
 * DID move onto the primitive; this stays a list of links with `aria-current`.
 *
 * THE DEFECT. The strip was `flex flex-wrap` over nine tabs inside a header that
 * is already `px-8 py-3`. It never clipped — it WRAPPED, to three or four rows
 * at 640 CSS px (a 1280px window at 200% zoom), eating the vertical space the
 * workbench needed and pushing the client's own identity off the first screen.
 *
 * THE FIX. Below `lg` the strip is ONE row that scrolls horizontally; at `lg`
 * and above it is the wrapping strip it has always been. Three details make the
 * scroll arm honest rather than a place for tabs to hide:
 *
 *   - `shrink-0` + `whitespace-nowrap` on every item, so a tab is a whole tab or
 *     it is off-screen — never a squashed unreadable one.
 *   - EVERY tab stays a real tab stop, so the whole set is reachable by keyboard
 *     with no horizontal scroll gesture at all; the browser scrolls a focused
 *     link into view on its own. A horizontal scroll container that could only
 *     be driven by a trackpad swipe would be a keyboard trap in the other
 *     direction.
 *   - The ACTIVE tab is scrolled into view on mount and on every path change
 *     (`scrollIntoView`, `block: "nearest"` so it never scrolls the page
 *     vertically). Without it, arriving on `/knowledge` — the ninth tab — shows a
 *     strip that appears to start at "Home" with no indication of where you are.
 *     `inline: "nearest"` moves the minimum distance rather than centring, so a
 *     tab already visible does not jump.
 */
export function ClientWorkspaceNav({ clientId }: { clientId: string }) {
  const t = useTranslations("ClientWorkspaceNav");
  const pathname = usePathname();
  const base = `/clients/${clientId}`;
  const activeRef = React.useRef<HTMLAnchorElement | null>(null);

  React.useEffect(() => {
    // `scrollIntoView` on a node the browser has already laid out. Guarded
    // because the ref is null on the render where no tab matches the path (a
    // sub-route this list does not name), and because jsdom-less node cells
    // render this component without the method.
    activeRef.current?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [pathname]);

  return (
    <nav aria-label={t("ariaLabel")}>
      <ul className="flex gap-1 overflow-x-auto lg:flex-wrap lg:overflow-x-visible">
        {CLIENT_TABS.map((tab) => {
          const href = tab.segment ? `${base}/${tab.segment}` : base;
          const isActive = pathname === href;

          return (
            <li key={tab.segment || "home"} className="shrink-0">
              <Link
                ref={isActive ? activeRef : undefined}
                href={href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "block rounded-lg px-2.5 py-1.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                  isActive && "bg-muted text-foreground",
                )}
              >
                {t(tab.messageKey)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
