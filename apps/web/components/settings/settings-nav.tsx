"use client";

import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";

import { NavPills } from "@/components/common/nav-pills";
import { useFirmScope } from "@/components/firm-scope-provider";
import { Badge } from "@/components/ui/badge";
import { resolveActive, visibleSettingsSections } from "@/lib/navigation/tree";

/**
 * The secondary nav across the settings sections, rendered by every
 * `/settings/*` page under its own `PageHeader`.
 *
 * WHY IT IS NOT IN THE SIDEBAR. The sidebar's Settings entry is one destination;
 * its six sections are the contents of that destination, and putting them in the
 * left column too would give the shell a nine-item firm group whose bottom half
 * is only reachable-from-anywhere in theory. ⌘K indexes every section by name
 * for the case where you already know which one you want.
 *
 * RANK-SHAPED from the same registry the hub and the palette read, so a section
 * this caller cannot open is ABSENT here as well.
 *
 * The pill markup itself lives in `components/common/nav-pills.tsx`, shared
 * with `components/work/work-views.tsx` — see that file for why the shared
 * piece is links, not tabs.
 */
export function SettingsNav() {
  const t = useTranslations("Settings");
  const tShell = useTranslations("AppShell");
  const pathname = usePathname() ?? "/settings";
  const sections = visibleSettingsSections(useFirmScope());
  const current = resolveActive(pathname).settingsSection;

  if (sections.length === 0) return null;

  return (
    <NavPills
      label={t("navLabel")}
      items={sections.map((section) => ({
        key: section.id,
        href: section.href,
        current: current === section.id,
        label: t(section.labelKey),
        badge: section.legacy ? <Badge variant="outline">{tShell("legacyBadge")}</Badge> : undefined,
      }))}
    />
  );
}
