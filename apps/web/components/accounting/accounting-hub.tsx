"use client";

import { useTranslations } from "next-intl";

import { HubCards } from "@/components/common/hub-cards";
import { useFirmScope } from "@/components/firm-scope-provider";
import { Badge } from "@/components/ui/badge";
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
    <HubCards
      label={t("sectionsLabel")}
      items={items.map((item) => ({
        key: item.id,
        href: accountingHref(clientId, item),
        title: tShell(item.labelKey),
        badge: item.beta ? <Badge variant="outline">{tShell("betaBadge")}</Badge> : undefined,
        description: t(`purposes.${item.id}`),
      }))}
    />
  );
}
