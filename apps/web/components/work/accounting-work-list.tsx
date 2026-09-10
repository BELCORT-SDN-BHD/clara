"use client";

// THIS CLIENT'S DURABLE WORK, newest first — the list half of journey B3.
//
// WHY IT SITS ABOVE THE REVIEW QUEUE RATHER THAN INSIDE IT. They answer two
// different questions and merging them would lose both. The review queue is
// "what is waiting on a PERSON" (drafts to approve, questions to answer); this
// is "what has been ASKED OF the agent, and how did it end". A refused Work is
// not waiting on anyone until a human decides to retry it, and a completed one
// is waiting on nobody at all — yet both must stay findable, because they are
// the record of an operation against this client's books.
//
// EVERY ROW IS A LINK TO ITS OWN ADDRESS, never an inline expander: the detail
// is a durable destination (§3's "Accepted long operation"), and a row that
// opened in place would give a human nothing to bookmark, share or come back to.
//
// NO FIGURE IS RENDERED HERE. Not the basis total, not a line count — a list of
// operations is not a ledger, and a total computed over a basis in a list row is
// a number this UI derived, sitting where a reader would take it for a posted
// amount. The detail page renders the money, once, with its own labels.

import { useTranslations } from "next-intl";
import Link from "next/link";

import { WorkStatusBadge } from "@/components/work/work-detail";
import { SectionHeader } from "@/components/common/section-header";
import { EmptyState, LoadingState, StateBanner } from "@/components/common/state";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { businessDateTime } from "@/lib/business-date";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { workDetailHref } from "@/lib/navigation/tree";
import { listAccountingWork, type BoundedWork } from "@/lib/work/reads";

export function AccountingWorkList({
  clientId,
  load,
}: {
  clientId: string;
  /** Injected by the cells; production reads through RLS. */
  load?: () => Promise<BoundedWork>;
}) {
  const t = useTranslations("WorkDetail");
  const read = useAsyncRead<BoundedWork>(() => (load ? load() : listAccountingWork(clientId)));

  return (
    <section className="flex flex-col gap-2">
      <SectionHeader level={2}>{t("listHeading")}</SectionHeader>
      {read.error !== null ? (
        <StateBanner
          tone="error"
          action={
            <Button type="button" variant="outline" size="sm" onClick={() => void read.reload()}>
              {t("retryRead")}
            </Button>
          }
        >
          {t("listReadFailed")}
        </StateBanner>
      ) : read.data === null ? (
        <LoadingState>{t("listLoading")}</LoadingState>
      ) : read.data.rows.length === 0 ? (
        // A VALID ZERO, distinguished from a failed read above and from "not
        // read yet" beside it — the three-way split §3's Empty rule asks for.
        <EmptyState>{t("listEmpty")}</EmptyState>
      ) : (
        <>
          <Table aria-label={t("listHeading")}>
            <TableHeader>
              <TableRow>
                <TableHead>{t("purpose")}</TableHead>
                <TableHead>{t("statusColumn")}</TableHead>
                <TableHead>{t("submittedAt")}</TableHead>
                <TableHead>
                  <span className="sr-only">{t("rowActions")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {read.data.rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.purpose}</TableCell>
                  <TableCell>
                    <WorkStatusBadge status={row.status} />
                  </TableCell>
                  <TableCell>{row.created_at === null ? "—" : businessDateTime(row.created_at)}</TableCell>
                  <TableCell>
                    <Link
                      href={workDetailHref(clientId, row.id)}
                      className="text-sm font-medium text-primary underline underline-offset-2"
                    >
                      {t("openWork")}
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {/* A TRUNCATED LIST SAYS SO. `listAccountingWork` asks for one row more
              than it shows and treats a full answer as PROOF the list is
              incomplete — never a guess, and never a silent short list. */}
          {read.data.truncated ? <p className="text-xs text-muted-foreground">{t("listTruncated")}</p> : null}
        </>
      )}
    </section>
  );
}
