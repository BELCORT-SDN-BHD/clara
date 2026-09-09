"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { NotBuiltNote } from "@/components/common/not-built-note";
import { useFirmScope } from "@/components/firm-scope-provider";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { visibleSettingsSections, type NavigationScope } from "@/lib/navigation/tree";

/**
 * The settings hub — cards are navigation, not fake local tabs.
 *
 * #614 moved this from `components/admin/admin-hub.tsx` and took its two
 * rank-aware title components with it. `AdminPageTitle`/`AdminPageDescription`
 * existed because the sidebar entry read "Firm" below admin rank while the page
 * it led to was titled "Admin" (E-7 / CB-AE2E-014, 裁-187) — a lie the estate
 * papered over by rewriting the label per rank in two places. The destination is
 * now "Settings", which is honest at every rank, so the page title is a plain
 * server-rendered string again and there is no second rank-shaped catalogue to
 * keep in sync. See lib/firm/navigation.ts for the retirement.
 *
 * IT IS STILL A CLIENT COMPONENT, and for the original reason: it reads the
 * scope the layout already provided, so the page stays a Server Component and
 * calls `requireFirmScope()` exactly zero extra times —
 * `tests/firm-scope-fourth-entrance.test.ts` reds on a fourth spine entrance.
 */
export function SettingsHub() {
  return <SettingsHubView scope={useFirmScope()} />;
}

/** Exported for the structural/a11y harness; production gets scope from context. */
export function SettingsHubView({ scope }: { scope: NavigationScope }) {
  const t = useTranslations("Settings");
  const tShell = useTranslations("AppShell");
  const sections = visibleSettingsSections(scope);

  if (sections.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("noSections")}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <nav aria-label={t("sectionsLabel")}>
        <ul className="grid gap-4 md:grid-cols-2">
          {sections.map((section) => (
            <li key={section.id}>
              <Link
                href={section.href}
                className="group block h-full rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/70"
              >
                <Card className="h-full transition-colors group-hover:bg-accent/40">
                  <CardHeader>
                    <CardTitle className="flex flex-wrap items-center gap-2">
                      <h2>{t(section.labelKey)}</h2>
                      {/* A destination that exists because something depends on
                          it, not because the product wants it there. The panel
                          itself carries the explanation; this is the signal a
                          reader needs before clicking. */}
                      {section.legacy ? (
                        <Badge variant="outline">{tShell("legacyBadge")}</Badge>
                      ) : null}
                    </CardTitle>
                    <CardDescription>{t(section.purposeKey)}</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <NotBuiltNote>{t("unbuiltNote")}</NotBuiltNote>
    </div>
  );
}
