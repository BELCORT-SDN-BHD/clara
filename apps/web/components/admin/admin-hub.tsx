"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { NotBuiltNote } from "@/components/common/not-built-note";
import { useFirmScope } from "@/components/firm-scope-provider";
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
