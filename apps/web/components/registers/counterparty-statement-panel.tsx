"use client";

// The per-counterparty statement (customer_statement/supplier_statement) +
// the open-items allocation surface (apply_open_items / unallocate_group) —
// selection-driven from aging-register.tsx's own table, matching that
// file's own AR/AP-toggle precedent: a small self-contained read+write
// surface, re-mounted (via the caller's `key`) on every counterparty
// selection change rather than re-derived in place.
//
// F1 (independent review, fix-required): `p_from` is NEVER sent null — see
// counterparty.ts's own header on getCustomerStatement/getSupplierStatement
// for the proof that a null `from` makes `_statement_core` return zero rows
// and zero opening balance, not "since the beginning". `from` defaults to
// `defaultStatementFrom(to)` and is a real, editable control.
//
// F3 (independent review, fix-required): `_statement_core` canonicalises
// through `_canonical_counterparty` — a merged party's statement silently
// becomes its SURVIVOR's own statement. This panel trusts the statement
// PAYLOAD's own `counterparty_id`, never the id it asked for, for both the
// heading and an explicit redirect note when the two differ.

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { businessToday } from "@/lib/business-date";
import { useHydratedPart } from "@/lib/parts/hooks";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import {
  getCounterpartyStatement,
  loadCounterpartyById,
  loadCounterpartyOpenItems,
  loadOpenItemAllocationsForItems,
  unallocateCandidateGroups,
  defaultStatementFrom,
  type CounterpartyRow,
} from "@/lib/registers/counterparty";
import type { AgingDomain } from "@/lib/registers/aging";
import { applyOpenItems, unallocateGroup } from "@/lib/registers/counterparty-doors";
import { fmtCents } from "@/lib/registers/money";
import { SectionHeader } from "@/components/common/section-header";
import { DataTableCard } from "@/components/common/data-table-card";
import { EmptyState, LoadingState, StateBanner } from "@/components/common/state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApplyOpenItemsDialog } from "./ApplyOpenItemsDialog";
import { UnallocateGroupDialog } from "./UnallocateGroupDialog";
import type { AgingItem } from "@/lib/registers/aging";
import type { SessionTokenAccessor } from "@/lib/session";

async function loadPanelData(
  session: SessionTokenAccessor,
  clientId: string,
  domain: AgingDomain,
  counterpartyId: string,
  from: string,
  to: string,
) {
  const [statement, openItems] = await Promise.all([
    getCounterpartyStatement(domain, clientId, counterpartyId, from, to, { session }),
    loadCounterpartyOpenItems(session, clientId, domain, counterpartyId),
  ]);
  const allocations = await loadOpenItemAllocationsForItems(session, clientId, openItems.map((i) => i.id));
  // F3/S3 (independent review): the divergence itself — `redirected` — is
  // known the instant the statement comes back, BEFORE any name lookup is
  // attempted. `redirectedTo` (the SURVIVOR's row, for its name) is a
  // best-effort read on top of that already-known fact: if it 404s/403s/
  // errors, that failure degrades ONLY the displayed name, never the
  // divergence verdict itself — a name-lookup hiccup must never fall back to
  // rendering the MERGED party's name as though nothing happened (the S3
  // fail-open the previous round left: `redirectedTo` was the only signal,
  // so a failed lookup silently looked identical to "no redirect at all").
  const redirected = statement.counterparty_id !== counterpartyId;
  let redirectedTo: CounterpartyRow | null = null;
  if (redirected) {
    try {
      redirectedTo = await loadCounterpartyById(session, clientId, statement.counterparty_id);
    } catch {
      redirectedTo = null; // the lookup itself failed — `redirected` stays true regardless
    }
  }
  return { statement, allocations, redirected, redirectedTo };
}

export function CounterpartyStatementPanel({
  clientId,
  domain,
  counterpartyId,
  counterpartyName,
  agingItems,
  onActed,
}: {
  clientId: string;
  domain: AgingDomain;
  counterpartyId: string;
  counterpartyName: string;
  /** The currently-outstanding items for THIS counterparty, from the
   *  caller's own just-read aging row — Apply's candidate pool. */
  agingItems: AgingItem[];
  /** F7 (independent review, fix-required): called after every SUCCESSFUL
   *  apply_open_items/unallocate_group act. This panel's own reload already
   *  re-derives its own statement/allocations; the caller's aging table and
   *  its own Apply-dialog candidate pool (`agingItems`, above) live in the
   *  PARENT's state and would otherwise keep pre-act `outstanding_cents`
   *  until an unrelated re-render — "every caller re-reads after every act,
   *  no exceptions" extends to the sibling surface too. */
  onActed?: () => void;
}) {
  const t = useTranslations("ArApCounterparty.statement");
  const tc = useTranslations("Common");
  const to = businessToday();
  const [from, setFrom] = useState(() => defaultStatementFrom(to));
  const { data, busy, err, clr, act, reload } = useHydratedPart(sessionTokenAccessor, (s) =>
    loadPanelData(s, clientId, domain, counterpartyId, from, to),
  );

  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    void reload();
  }, [from, reload]);

  if (!data) {
    return err ? <StateBanner tone="error">{err}</StateBanner> : <LoadingState>{t("loading")}</LoadingState>;
  }

  const groups = unallocateCandidateGroups(data.allocations);
  // S3 (independent review, fix-required): the heading falls back to
  // counterpartyName ONLY when there is genuinely no redirect —
  // `data.redirected` is known independently of whether the name lookup
  // itself succeeded, so a failed/null lookup can never silently re-use the
  // MERGED party's name as if the statement were really its own.
  const heading = !data.redirected ? counterpartyName : data.redirectedTo ? data.redirectedTo.name : data.statement.counterparty_id;

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader level={2}>{t("heading", { name: heading, from, to })}</SectionHeader>
      {data.redirected && (
        <StateBanner tone="info">
          {data.redirectedTo
            ? t("redirectedNote", { merged: counterpartyName, survivor: data.redirectedTo.name })
            : t("redirectedNoteUnknownName", { merged: counterpartyName, survivorId: data.statement.counterparty_id })}
        </StateBanner>
      )}
      {err && (
        <StateBanner tone="error" code={clr ? `${clr.code}${clr.reason ? ` · ${clr.reason}` : ""}` : undefined}>
          {err}
        </StateBanner>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cp-statement-from">{t("fromLabel")}</Label>
          <Input id="cp-statement-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <p className="pb-1.5 text-xs text-muted-foreground">{t("toFixed", { date: to })}</p>
      </div>
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
          level={3}
          action={
            <ApplyOpenItemsDialog
              items={agingItems}
              busy={busy}
              onSubmit={(sourceItemId, targetItemId, amountCents, reason) =>
                act(
                  () =>
                    applyOpenItems(clientId, [{ sourceItemId, targetItemId, amountCents }], reason, { session: sessionTokenAccessor }).then(
                      () => undefined,
                    ),
                  onActed,
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
                    act(
                      () => unallocateGroup(clientId, applicationGroupId, reason, { session: sessionTokenAccessor }).then(() => undefined),
                      onActed,
                    )
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
