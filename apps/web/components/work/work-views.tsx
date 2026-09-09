import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { cn } from "@/lib/utils";
import { WORK_NEEDS_YOU_HREF, WORK_NEEDS_YOU_VIEW } from "@/lib/navigation/tree";

/**
 * The saved-view strip on /work.
 *
 * LINKS, NOT TABS, and the distinction is the one `components/common/section-tabs.tsx`
 * already draws in the other direction. Each view is a distinct URL that
 * server-renders a different set of sections, so selecting one is a real
 * navigation. The WAI-ARIA tabs pattern describes a widget that swaps panels IN
 * PLACE — roving tabindex, one tab stop for the whole set, `aria-selected` — and
 * claiming it here would tell a screen reader these are panel switches and then
 * navigate the page out from under it. `aria-current="page"` carries the
 * selection instead, which is what a set of links owes.
 *
 * A SERVER COMPONENT with no hook: the active view is decided by the page's own
 * `searchParams` read, so there is nothing to resolve on the client and no
 * reason to ship this as one.
 */
export async function WorkViews({ activeView }: { activeView: string | null }) {
  const t = await getTranslations("Work");

  const views = [
    { id: null, href: "/work", label: t("viewAll") },
    { id: WORK_NEEDS_YOU_VIEW, href: WORK_NEEDS_YOU_HREF, label: t("viewNeedsYou") },
  ];

  return (
    <nav aria-label={t("viewsLabel")}>
      <ul className="flex flex-wrap gap-1">
        {views.map((view) => {
          const active = view.id === activeView;
          return (
            <li key={view.href}>
              <Link
                href={view.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "block rounded-lg px-2.5 py-1.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                  active && "bg-muted text-foreground",
                )}
              >
                {view.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
