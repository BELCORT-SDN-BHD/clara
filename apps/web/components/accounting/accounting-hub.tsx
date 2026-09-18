"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { HubCards } from "@/components/common/hub-cards";
import { useFirmScope } from "@/components/firm-scope-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  accountingHref,
  canOpenClientLeaf,
  journalComposerHref,
  tradeInvoiceHref,
  visibleAccountingItems,
  type NavigationScope,
} from "@/lib/navigation/tree";

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
  // THE HUB'S ONE PRIMARY ACT (#623). Everything else on this page is
  // navigation — a card that takes you somewhere to look. Recording a journal
  // entry is the thing a bookkeeper comes to Accounting to DO, so it is a
  // Button, above the cards, and it is shaped by the same one predicate every
  // row goes through. A viewer does not see it: the write door behind it
  // (`clara.admit_journal_work`, bookkeeper+) can only ever refuse them, which
  // is 裁-187's rule, and typing the address still reaches the composer's own
  // denied state rather than a blank.
  const canCompose = canOpenClientLeaf(scope, "journalComposer");
  // #655 — THE HUB'S SECOND PRIMARY ACT. Recording what a client invoiced, or was billed, is
  // the other thing a bookkeeper comes to Accounting to DO, and it is a different operation
  // through a different door rather than a mode of the journal composer. Shaped by the SAME one
  // predicate, for the same reason: the write door behind it (`clara.admit_trade_invoice_work`,
  // bookkeeper+) can only ever refuse a viewer, and typing the address still reaches the form's
  // own denied state rather than a blank.
  const canRecordInvoice = canOpenClientLeaf(scope, "tradeInvoice");

  if (items.length === 0 && !canCompose && !canRecordInvoice) {
    return <p className="text-sm text-muted-foreground">{t("noSections")}</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      {canCompose || canRecordInvoice ? (
        <div className="flex flex-wrap gap-3">
          {canCompose ? (
            <Button render={<Link href={journalComposerHref(clientId)} />}>
              {tShell("clientLeaf.journalComposer")}
            </Button>
          ) : null}
          {canRecordInvoice ? (
            <Button variant="outline" render={<Link href={tradeInvoiceHref(clientId)} />}>
              {tShell("clientLeaf.tradeInvoice")}
            </Button>
          ) : null}
        </div>
      ) : null}
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noSections")}</p>
      ) : (
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
      )}
    </div>
  );
}
