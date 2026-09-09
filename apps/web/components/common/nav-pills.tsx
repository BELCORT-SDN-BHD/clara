import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type NavPillItem = {
  readonly key: string;
  readonly href: string;
  readonly label: ReactNode;
  readonly current: boolean;
  readonly badge?: ReactNode;
};

/**
 * The pill-link nav shared by the /work saved-view strip
 * (`components/work/work-views.tsx`) and the /settings section nav
 * (`components/settings/settings-nav.tsx`) — extracted (#614 code review) once
 * the two had drifted to the same `nav`/`ul`/`Link` markup and the same class
 * strings, one call site typing `current` as `id === activeView` and the other
 * as `resolveActive(pathname).settingsSection === section.id`.
 *
 * WHY LINKS AND NOT `SectionTabs`. Every item is a distinct URL that
 * server-renders a different page or section, so selecting one is a real
 * navigation. The WAI-ARIA tabs pattern describes a widget that swaps panels IN
 * PLACE — roving tabindex, one tab stop for the whole set, `aria-selected` — and
 * claiming it here would tell a screen reader these are panel switches and then
 * navigate the page out from under it. `aria-current="page"` carries the
 * selection instead, which is what a set of links owes.
 *
 * NO HOOKS, on purpose: the work strip is a Server Component (its active view
 * comes from the page's own `searchParams` read) and the settings nav is a
 * Client Component (its active section comes from `usePathname()`). Both
 * resolve `current` themselves before calling this, so the shared piece never
 * has to pick a side of the server/client boundary.
 */
export function NavPills({ label, items }: { label: string; items: readonly NavPillItem[] }) {
  return (
    <nav aria-label={label}>
      <ul className="flex flex-wrap gap-1">
        {items.map((item) => (
          <li key={item.key}>
            <Link
              href={item.href}
              aria-current={item.current ? "page" : undefined}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                item.current && "bg-muted text-foreground",
              )}
            >
              {item.label}
              {item.badge}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
