"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { NotBuiltNote } from "@/components/common/not-built-note";
import { useFirmScope } from "@/components/firm-scope-provider";
import { firmCapabilities } from "@/lib/firm/capabilities";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  visibleAdminNavigation,
  type NavigationScope,
} from "@/lib/firm/navigation";

/** The real admin hub. Cards are navigation, not fake local tabs. */
export function AdminHub() {
  return <AdminHubView scope={useFirmScope()} />;
}

/**
 * The page's own h1 and orientation line, rank-aware for the same reason
 * `lib/firm/navigation.ts`'s sidebar label is (E-7 / CB-AE2E-014, 裁-187): a
 * bookkeeper who follows a link that says "Firm" must not land on a page titled
 * "Admin". It is a CLIENT component so it can read the scope the layout already
 * provided; the page stays a Server Component and calls `requireFirmScope()`
 * exactly zero extra times, which matters — `tests/firm-scope-fourth-entrance.test.ts`
 * reds on a fourth spine entrance.
 */
export function AdminPageTitle() {
  const t = useTranslations("Admin");
  return <>{firmCapabilities(useFirmScope()).canManageMembers ? t("heading") : t("firmHeading")}</>;
}

export function AdminPageDescription() {
  const t = useTranslations("Admin");
  return <>{firmCapabilities(useFirmScope()).canManageMembers ? t("body") : t("firmBody")}</>;
}

/** Exported for the structural/a11y harness; production gets scope from context. */
export function AdminHubView({ scope }: { scope: NavigationScope }) {
  const t = useTranslations("Admin");
  const sections = visibleAdminNavigation(scope);

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
                    <CardTitle>
                      <h2>{t(section.hubTitleKey)}</h2>
                    </CardTitle>
                    <CardDescription>{t(section.hubPurposeKey)}</CardDescription>
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
