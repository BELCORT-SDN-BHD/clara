"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { useFirmScope } from "@/components/firm-scope-provider";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { resolveActive, visibleSettingsSections } from "@/lib/navigation/tree";

/**
 * The secondary nav across the settings sections, rendered by every
 * `/settings/*` page under its own `PageHeader`.
 *
 * WHY LINKS AND NOT `SectionTabs`. Each section is a distinct URL with its own
 * server-rendered page, so selecting one is a real navigation, not a panel swap.
 * The WAI-ARIA tabs pattern describes a widget that switches panels IN PLACE
 * (roving tabindex, one tab stop for the whole set, `aria-selected`), and
 * claiming it here would tell a screen reader these are panel switches and then
 * navigate the page out from under it — the same reasoning
 * `components/common/section-tabs.tsx` records for the other direction.
 *
 * WHY IT IS NOT IN THE SIDEBAR. The sidebar's Settings entry is one destination;
 * its six sections are the contents of that destination, and putting them in the
 * left column too would give the shell a nine-item firm group whose bottom half
 * is only reachable-from-anywhere in theory. ⌘K indexes every section by name
 * for the case where you already know which one you want.
 *
 * RANK-SHAPED from the same registry the hub and the palette read, so a section
 * this caller cannot open is ABSENT here as well.
 */
export function SettingsNav() {
  const t = useTranslations("Settings");
  const tShell = useTranslations("AppShell");
  const pathname = usePathname() ?? "/settings";
  const sections = visibleSettingsSections(useFirmScope());
  const current = resolveActive(pathname).settingsSection;

  if (sections.length === 0) return null;

  return (
    <nav aria-label={t("navLabel")}>
      <ul className="flex flex-wrap gap-1">
        {sections.map((section) => {
          const active = current === section.id;
          return (
            <li key={section.id}>
              <Link
                href={section.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                  active && "bg-muted text-foreground",
                )}
              >
                {t(section.labelKey)}
                {section.legacy ? (
                  <Badge variant="outline">{tShell("legacyBadge")}</Badge>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
