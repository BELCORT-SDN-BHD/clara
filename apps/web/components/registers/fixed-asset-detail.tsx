"use client";

// #639 — C7's ASSET DETAIL, the surface that did not exist.
//
// `clara.get_fixed_asset` shipped with 0041 and had exactly three references in this app before
// this file: its own definition and two lines of its own transport test. The register tab showed a
// list and three dialogs; there was nowhere to read ONE asset's acquisition, its source, its
// depreciation configuration, its schedule or its correction history.
//
// FOUR TABS, AND THE SPLIT IS THE TICKET. "The acquisition is complete while the depreciation
// policy is still absent" is not a sentence this page says — it is the page's STRUCTURE. The
// Acquisition tab is whole the moment the entry posts; Particulars & policy is separately
// incomplete and separately actionable; Schedule is empty until the particulars are answered and
// says so; History carries the correction chain. Migration 0201's read returns the same three
// blocks separately, so the surface cannot quietly re-merge them.
//
// TABS RATHER THAN ROUTES, and appendix D says why (comment 5589272729, row 58): Tabs are for
// "alternate views inside one route when state can remain local/shareable", and "do not duplicate
// Sidebar routing as Tabs". These four are four readings of ONE object. The register LIST stays
// where it is (`registers?tab=fixedAssets`) — this page is the detail, not a second register.
//
// THE WRITE STAYS IN A DIALOG. The same appendix's overlay hierarchy keeps a bounded form in a
// Dialog and a durable record behind a route; `CompleteParticularsDialog` is reused verbatim from
// the register rather than re-implemented here, so the two entrances cannot drift and a draft
// typed in one is the same form as the other.
//
// EVERY FIGURE IS DB-PROJECTED. Cost, accumulated, NBV and the projected schedule all come from
// `clara.get_fixed_asset`; this component formats them with `fmtCents` and computes none of them.

import { useCallback, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { getFixedAsset, type FaRelatedAsset } from "@/lib/registers/fixed-assets";
import { loadChartOfAccounts } from "@/lib/registers/accounts";
import { fmtCents } from "@/lib/registers/money";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { SectionTabs } from "@/components/common/section-tabs";
import { DataState, ErrorMessage } from "@/components/firm/data-state";
import { DataTableCard } from "@/components/common/data-table-card";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { CompleteParticularsDialog, ReviseParticularsDialog } from "./fa-row-actions";
import { fixedAssetHref, journalEntryHref, workDetailHref } from "@/lib/navigation/tree";
import { applyDocumentParam, documentUrl } from "@/lib/documents/url-state";

type TabId = "acquisition" | "particulars" | "schedule" | "history";

/** One labelled fact. `mono` is for ids and account codes — a reader comparing an id with one on
 *  another screen is doing character-by-character work, and a proportional font makes that worse. */
function Fact({ label, children, mono = false }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={mono ? "font-mono text-sm break-all" : "text-sm"}>{children}</dd>
    </div>
  );
}

export function FixedAssetDetailView({ clientId, assetId }: { clientId: string; assetId: string }) {
  const t = useTranslations("FixedAssetDetail");
  const tReg = useTranslations("ClientRegisters.fixedAssets");
  const tc = useTranslations("Common");
  const [tab, setTab] = useState<TabId>("acquisition");
  const { data, loading, error, busy, act } = useAsyncRead(() => getFixedAsset(sessionTokenAccessor, assetId));
  const accountsRead = useAsyncRead(() => loadChartOfAccounts(sessionTokenAccessor, clientId));
  const hasData = data !== null;

  // A write here reloads THIS read, never assumes its own response (hydrate-never-trust, the
  // register's own discipline). `act` already does that; the wrapper exists so the signature
  // matches what `fa-row-actions` expects.
  const actAndReload = useCallback((fn: () => Promise<void>) => act(fn), [act]);

  const asset = data?.asset ?? null;
  const acquisition = data?.acquisition ?? null;
  const particulars = data?.particulars ?? null;
  const history = data?.history ?? null;
  const dash = "—";

  const statusLabels: Record<string, string> = {
    pending: tReg("statuses.pending"),
    active: tReg("statuses.active"),
    superseded: tReg("statuses.superseded"),
    disposed: tReg("statuses.disposed"),
    unwound: tReg("statuses.unwound"),
  };
  const methodLabels: Record<string, string> = {
    straight_line: tReg("methods.straight_line"),
    reducing_balance: tReg("methods.reducing_balance"),
    none: tReg("methods.none"),
  };
  const linkLabels: Record<string, string> = {
    supersede: t("history.links.supersede"),
    co_acquired_on_same_document: t("history.links.co_acquired_on_same_document"),
    source_document: t("history.links.source_document"),
    reversed_acquisition_on_same_enrolment: t("history.links.reversed_acquisition"),
  };
  // A WORD PER RELATION, never a two-way `predecessor ? : successor`. Round-1 review measured a
  // pair of rows born from ONE two-line invoice each rendering "Successor" for the other -- a
  // mutually contradictory accounting claim on the tab that exists to show corrections. 0201 now
  // gives co-acquired siblings their own orderless relation and this table renders it.
  const relationLabels: Record<string, string> = {
    predecessor: t("history.predecessor"),
    successor: t("history.successor"),
    co_acquired: t("history.coAcquired"),
  };

  const items: readonly { value: TabId; label: string }[] = [
    { value: "acquisition", label: t("tabs.acquisition") },
    { value: "particulars", label: t("tabs.particulars") },
    { value: "schedule", label: t("tabs.schedule") },
    { value: "history", label: t("tabs.history") },
  ];

  const relatedRow = (r: FaRelatedAsset) => (
    <TableRow key={`${r.asset_id}-${r.relation}-${r.link}`}>
      <TableCell>
        <Link href={fixedAssetHref(clientId, r.asset_id)} className="underline-offset-4 hover:underline">
          {r.description ?? r.asset_id.slice(0, 8)}
        </Link>
      </TableCell>
      <TableCell className="text-muted-foreground">{relationLabels[r.relation] ?? r.relation}</TableCell>
      <TableCell className="text-muted-foreground">{statusLabels[r.status] ?? r.status}</TableCell>
      <TableCell>{fmtCents(r.cost_cents, tc("centsUnsafe"))}</TableCell>
      <TableCell className="text-muted-foreground">{r.acquired_date ?? dash}</TableCell>
      {/* SAID, NOT IMPLIED. The database derived this relationship; it did not store it. A reader
          who cannot tell a structural lineage from a candidate match would read a guess as a fact. */}
      <TableCell className="text-muted-foreground">{linkLabels[r.link] ?? r.link}</TableCell>
    </TableRow>
  );

  return (
    <div className="flex flex-col gap-6">
      {/* A refusal or a stale-read error renders ABOVE data that already loaded once, never
          instead of it (the needs-you-inbox precedent this register already follows). */}
      {hasData && error ? <ErrorMessage error={error} /> : null}
      <DataState
        loading={!hasData && loading}
        error={hasData ? null : error}
        isEmpty={hasData && asset === null}
        emptyMessage={t("notFound")}
      >
        {asset ? (
          <>
            <Card>
              <CardContent className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex flex-col gap-1">
                  <h2 className="text-base font-medium">{asset.description ?? asset.id.slice(0, 8)}</h2>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{statusLabels[asset.status] ?? asset.status}</Badge>
                    {/* THE ONE BADGE THIS TICKET ADDS, and it is the whole product sentence: the
                        acquisition is done, and only the depreciation setup is waiting. */}
                    {!asset.particulars_complete && (asset.status === "pending" || asset.status === "active") ? (
                      <Badge variant="outline">{t("pendingParticulars")}</Badge>
                    ) : null}
                  </div>
                </div>
                <dl className="flex flex-wrap gap-x-8 gap-y-3">
                  <Fact label={tReg("cost")}>{fmtCents(asset.cost_cents, tc("centsUnsafe"))}</Fact>
                  <Fact label={tReg("accumulated")}>{fmtCents(asset.accumulated_cents, tc("centsUnsafe"))}</Fact>
                  <Fact label={tReg("nbv")}>{fmtCents(asset.nbv_cents, tc("centsUnsafe"))}</Fact>
                </dl>
              </CardContent>
            </Card>

            <SectionTabs label={t("tabsLabel")} items={items} value={tab} onSelect={setTab} />

            {tab === "acquisition" ? (
              <Card>
                <CardContent className="flex flex-col gap-4">
                  {acquisition ? (
                    <>
                      <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                        <Fact label={t("acquisition.acquiredDate")}>{acquisition.acquired_date ?? dash}</Fact>
                        <Fact label={t("acquisition.cost")}>
                          {fmtCents(acquisition.cost_cents, tc("centsUnsafe"))} {acquisition.currency}
                        </Fact>
                        <Fact label={t("acquisition.assetAccount")} mono>{acquisition.asset_account ?? dash}</Fact>
                        <Fact label={t("acquisition.postingDate")}>{acquisition.posting_date ?? dash}</Fact>
                        <Fact label={t("acquisition.origin")}>{acquisition.entry_origin ?? dash}</Fact>
                        <Fact label={t("acquisition.memo")}>{acquisition.memo ?? dash}</Fact>
                      </dl>
                      <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
                        <Fact label={t("acquisition.journalEntry")}>
                          {acquisition.entry_id ? (
                            <Link
                              href={journalEntryHref(clientId, acquisition.entry_id)}
                              className="font-mono break-all underline-offset-4 hover:underline"
                            >
                              {acquisition.entry_id}
                            </Link>
                          ) : (
                            dash
                          )}
                        </Fact>
                        <Fact label={t("acquisition.work")}>
                          {acquisition.work_id ? (
                            <Link
                              href={workDetailHref(clientId, acquisition.work_id)}
                              className="font-mono break-all underline-offset-4 hover:underline"
                            >
                              {acquisition.work_id}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">{t("acquisition.noWork")}</span>
                          )}
                        </Fact>
                        <Fact label={t("acquisition.sourceDocument")}>
                          {acquisition.document_id ? (
                            // THE SPECIFIC FILED DOCUMENT, not the Documents tab. `?document=<id>`
                            // is the workbench's own URL state (`lib/documents/url-state.ts`,
                            // read by `DocumentsWorkbench` through `parseDocumentParam`) — the
                            // same shape Activity's `?event=` and Registers' `?tab=` already use.
                            // The id is on hand here, so landing the reader on a list and asking
                            // them to find it again would be a link that knows more than it says.
                            <Link
                              href={documentUrl(
                                `/clients/${clientId}/documents`,
                                applyDocumentParam(new URLSearchParams(), acquisition.document_id),
                              )}
                              className="underline-offset-4 hover:underline"
                            >
                              {acquisition.document_filename ?? acquisition.document_id}
                            </Link>
                          ) : (
                            // AN HONEST ABSENCE, not a blank. A composer or Work-lane acquisition
                            // has no source document, and 0195 refuses a fabricated one.
                            <span className="text-muted-foreground">{t("acquisition.noDocument")}</span>
                          )}
                        </Fact>
                        <Fact label={t("acquisition.receipt")} mono>{acquisition.receipt_id ?? dash}</Fact>
                      </dl>
                      {/* THE BOUNDARY, STATED ON THE SURFACE rather than left to a refusal: a
                          generic Work basis may not carry a payable leg (0178:1355-1367), so a
                          credit-financed acquisition reaches this register only through the
                          document-coding lane. */}
                      <p className="text-xs text-muted-foreground">{t("acquisition.creditBoundary")}</p>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t("acquisition.unavailable")}</p>
                  )}
                </CardContent>
              </Card>
            ) : null}

            {tab === "particulars" ? (
              <Card>
                <CardContent className="flex flex-col gap-4">
                  {particulars && !particulars.complete ? (
                    <p className="text-sm text-warning">{t("particulars.waiting")}</p>
                  ) : null}
                  <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                    <Fact label={tReg("method")}>
                      {particulars?.method ? (methodLabels[particulars.method] ?? particulars.method) : dash}
                    </Fact>
                    <Fact label={t("particulars.usefulLife")}>{particulars?.useful_life_months ?? dash}</Fact>
                    <Fact label={t("particulars.rate")}>{particulars?.rate_bps ?? dash}</Fact>
                    <Fact label={t("particulars.residual")}>
                      {fmtCents(particulars?.residual_cents ?? null, tc("centsUnsafe"))}
                    </Fact>
                    <Fact label={t("particulars.startDate")}>{particulars?.start_date ?? dash}</Fact>
                    <Fact label={t("particulars.caClass")}>{particulars?.ca_class ?? dash}</Fact>
                  </dl>
                  {particulars?.non_depreciable ? (
                    <p className="text-xs text-muted-foreground">{t("particulars.nonDepreciable")}</p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    {asset.particulars_complete === false && (asset.status === "pending" || asset.status === "active") ? (
                      <CompleteParticularsDialog
                        clientId={clientId}
                        asset={asset}
                        accounts={accountsRead.data ?? []}
                        busy={busy}
                        act={actAndReload}
                        error={error}
                      />
                    ) : null}
                    {asset.particulars_complete && asset.status === "active" ? (
                      <ReviseParticularsDialog
                        clientId={clientId}
                        asset={asset}
                        accounts={accountsRead.data ?? []}
                        busy={busy}
                        act={actAndReload}
                        error={error}
                      />
                    ) : null}
                  </div>
                  {accountsRead.error ? <ErrorMessage error={accountsRead.error} /> : null}
                </CardContent>
              </Card>
            ) : null}

            {tab === "schedule" ? (
              <Card>
                <CardContent className="flex flex-col gap-3">
                  {(data?.schedule ?? []).length === 0 ? (
                    // EMPTY FOR A NAMED REASON. "No schedule" and "no schedule YET, because the
                    // particulars are still outstanding" are different facts, and only one of them
                    // tells the reader what to do next.
                    <p className="text-sm text-muted-foreground">
                      {particulars && !particulars.complete ? t("schedule.blockedByParticulars") : t("schedule.empty")}
                    </p>
                  ) : (
                    <DataTableCard>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("schedule.periodStart")}</TableHead>
                          <TableHead>{t("schedule.periodEnd")}</TableHead>
                          <TableHead>{t("schedule.projected")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(data?.schedule ?? []).map((row) => (
                          <TableRow key={`${row.period_start}-${row.period_end}`}>
                            <TableCell className="text-muted-foreground">{row.period_start}</TableCell>
                            <TableCell className="text-muted-foreground">{row.period_end}</TableCell>
                            <TableCell>{fmtCents(row.projected_cents, tc("centsUnsafe"))}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </DataTableCard>
                  )}
                </CardContent>
              </Card>
            ) : null}

            {tab === "history" ? (
              <Card>
                <CardContent className="flex flex-col gap-4">
                  <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
                    <Fact label={t("history.reversedBy")}>
                      {history?.acquisition_reversed_by ? (
                        <Link
                          href={journalEntryHref(clientId, history.acquisition_reversed_by)}
                          className="font-mono break-all underline-offset-4 hover:underline"
                        >
                          {history.acquisition_reversed_by}
                        </Link>
                      ) : (
                        dash
                      )}
                    </Fact>
                    <Fact label={t("history.disposedAt")}>{history?.disposed_at ?? dash}</Fact>
                  </dl>
                  {history?.chain_open ? <p className="text-sm text-warning">{t("history.chainOpen")}</p> : null}
                  {(history?.related ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t("history.empty")}</p>
                  ) : (
                    <>
                      <DataTableCard>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t("history.asset")}</TableHead>
                            <TableHead>{t("history.relation")}</TableHead>
                            <TableHead>{tReg("status")}</TableHead>
                            <TableHead>{tReg("cost")}</TableHead>
                            <TableHead>{tReg("acquired")}</TableHead>
                            <TableHead>{t("history.derivedFrom")}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>{(history?.related ?? []).map(relatedRow)}</TableBody>
                      </DataTableCard>
                      <p className="text-xs text-muted-foreground">{t("history.derivationNote")}</p>
                    </>
                  )}
                </CardContent>
              </Card>
            ) : null}
          </>
        ) : null}
      </DataState>
    </div>
  );
}
