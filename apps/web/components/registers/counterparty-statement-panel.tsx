"use client";

// The per-counterparty statement (customer_statement/supplier_statement) +
// the open-items allocation surface (apply_open_items / unallocate_group) —
// selection-driven from aging-register.tsx's own table, matching that
// file's own AR/AP-toggle precedent: a small self-contained read+write
// surface, re-mounted (via the caller's `key`) on every counterparty
// selection change rather than re-derived in place.

import { useTranslations } from "next-intl";
import { businessToday } from "@/lib/business-date";
import { useHydratedPart } from "@/lib/parts/hooks";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import {
  getCounterpartyStatement,
  loadCounterpartyOpenItems,
  loadOpenItemAllocationsForItems,
  unallocateCandidateGroups,
  type AgingDomain,
} from "@/lib/registers/counterparty";
import { applyOpenItems, unallocateGroup } from "@/lib/registers/counterparty-doors";
import { fmtCents } from "@/lib/registers/money";
import { SectionHeader } from "@/components/common/section-header";
import { DataTableCard } from "@/components/common/data-table-card";
import { EmptyState, LoadingState, StateBanner } from "@/components/common/state";
import { TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApplyOpenItemsDialog } from "./ApplyOpenItemsDialog";
import { UnallocateGroupDialog } from "./UnallocateGroupDialog";
import type { AgingItem } from "@/lib/registers/aging";
import type { SessionTokenAccessor } from "@/lib/session";

async function loadPanelData(session: SessionTokenAccessor, clientId: string, domain: AgingDomain, counterpartyId: string, asOf: string) {
  const [statement, openItems] = await Promise.all([
    getCounterpartyStatement(domain, clientId, counterpartyId, null, asOf, { session }),
    loadCounterpartyOpenItems(session, clientId, domain, counterpartyId),
  ]);
  const allocations = await loadOpenItemAllocationsForItems(session, clientId, openItems.map((i) => i.id));
  return { statement, allocations };
}

export function CounterpartyStatementPanel({
  clientId,
  domain,
  counterpartyId,
  counterpartyName,
  agingItems,
}: {
  clientId: string;
  domain: AgingDomain;
  counterpartyId: string;
  counterpartyName: string;
  /** The currently-outstanding items for THIS counterparty, from the
   *  caller's own just-read aging row — Apply's candidate pool. */
  agingItems: AgingItem[];
}) {
  const t = useTranslations("ArApCounterparty.statement");
  const tc = useTranslations("Common");
  const asOf = businessToday();
  const { data, busy, err, clr, act } = useHydratedPart(sessionTokenAccessor, (s) => loadPanelData(s, clientId, domain, counterpartyId, asOf));

  if (!data) {
    return err ? <StateBanner tone="error">{err}</StateBanner> : <LoadingState>{t("loading")}</LoadingState>;
  }

  const groups = unallocateCandidateGroups(data.allocations);

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader level={3}>{t("heading", { name: counterpartyName })}</SectionHeader>
      {err && (
        <StateBanner tone="error" code={clr ? `${clr.code}${clr.reason ? ` · ${clr.reason}` : ""}` : undefined}>
          {err}
        </StateBanner>
      )}
      {data.statement.rows.length === 0 ? (
        <EmptyState>{t("empty")}</EmptyState>
      ) : (
        <DataTableCard>
          <TableHeader>
            <TableRow>
              <TableHead>{t("date")}</TableHead>
              <TableHead>{t("type")}</TableHead>
              <TableHead>{t("label")}</TableHead>
              <TableHead className="text-right">{t("delta")}</TableHead>
              <TableHead className="text-right">{t("running")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.statement.rows.map((r, i) => (
              <TableRow key={`${r.row_type}-${r.item_id ?? r.allocation_id ?? i}-${i}`}>
                <TableCell>{r.event_date}</TableCell>
                <TableCell className="text-muted-foreground">{r.row_type}</TableCell>
                <TableCell className="text-muted-foreground">{r.label ?? "—"}</TableCell>
                <TableCell className="text-right">{fmtCents(r.delta_cents, tc("centsUnsafe"))}</TableCell>
                <TableCell className="text-right">{fmtCents(r.running_balance_cents, tc("centsUnsafe"))}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={3}>{t("openingLabel")}</TableCell>
              <TableCell colSpan={2} className="text-right">{fmtCents(data.statement.opening_balance_cents, tc("centsUnsafe"))}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell colSpan={3}>{t("closingLabel")}</TableCell>
              <TableCell colSpan={2} className="text-right font-medium">{fmtCents(data.statement.closing_balance_cents, tc("centsUnsafe"))}</TableCell>
            </TableRow>
          </TableFooter>
        </DataTableCard>
      )}

      <div className="flex flex-col gap-2">
        <SectionHeader
          level={4}
          action={
            <ApplyOpenItemsDialog
              items={agingItems}
              busy={busy}
              onSubmit={(sourceItemId, targetItemId, amountCents, reason) =>
                act(() =>
                  applyOpenItems(clientId, [{ sourceItemId, targetItemId, amountCents }], reason, { session: sessionTokenAccessor }).then(
                    () => undefined,
                  ),
                )
              }
            />
          }
        >
          {t("applicationsHeading")}
        </SectionHeader>
        {groups.length === 0 ? (
          <EmptyState>{t("noApplications")}</EmptyState>
        ) : (
          <ul className="flex flex-col gap-2">
            {groups.map((g) => (
              <li key={g.application_group} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
                <span className="text-muted-foreground">
                  {t("applicationGroupLabel", { count: g.rows.length })}
                </span>
                <UnallocateGroupDialog
                  group={g}
                  busy={busy}
                  onSubmit={(applicationGroupId, reason) =>
                    act(() => unallocateGroup(clientId, applicationGroupId, reason, { session: sessionTokenAccessor }).then(() => undefined))
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
