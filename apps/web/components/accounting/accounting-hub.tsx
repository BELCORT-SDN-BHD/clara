"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { useFirmScope } from "@/components/firm-scope-provider";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { accountingHref, visibleAccountingItems, type NavigationScope } from "@/lib/navigation/tree";

/**
 * The Accounting index — one card per accounting surface, the same idiom as the
 * settings hub.
 *
 * WHY THE GROUP NEEDS A PAGE AT ALL. In the sidebar, Accounting is a collapsible
 * whose eight children are the destinations. A group label that is only a
 * disclosure is a dead end in two places a human actually lands: the breadcrumb
 * (`… › Rome Properties › Accounting › Journals` needs "Accounting" to lead
 * somewhere) and a collapsed sidebar. So the group's own index is a real
 * destination that lists what is under it, which also makes it the honest answer
 * to "what does this firm mean by Accounting".
 *
 * RANK-SHAPED THROUGH THE ONE PREDICATE, even though every accounting row is
 * viewer-floored today. The filter costs nothing and means a future floored
 * surface is shaped here without anyone remembering to come back.
 */
export function AccountingHub({ clientId }: { clientId: string }) {
  return <AccountingHubView clientId={clientId} scope={useFirmScope()} />;
}

/** Exported for the structural/a11y harness; production gets scope from context. */
export function AccountingHubView({
  clientId,
  scope,
}: {
  clientId: string;
  scope: NavigationScope;
}) {
  const t = useTranslations("ClientAccounting");
  const tShell = useTranslations("AppShell");
  const items = visibleAccountingItems(scope);

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("noSections")}</p>;
  }

  return (
    <nav aria-label={t("sectionsLabel")}>
      <ul className="grid gap-4 md:grid-cols-2">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={accountingHref(clientId, item)}
              className="group block h-full rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/70"
            >
              <Card className="h-full transition-colors group-hover:bg-accent/40">
                <CardHeader>
                  <CardTitle className="flex flex-wrap items-center gap-2">
                    <h2>{tShell(item.labelKey)}</h2>
                    {item.beta ? <Badge variant="outline">{tShell("betaBadge")}</Badge> : null}
                  </CardTitle>
                  <CardDescription>{t(`purposes.${item.id}`)}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
