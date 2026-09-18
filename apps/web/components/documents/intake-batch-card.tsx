"use client";

// #636 — THE DURABLE BATCH CARD. The parent summary over a batch of admitted sources, on both
// Documents surfaces.
//
// IT IS FED BY THE DATABASE, NOT BY THE QUEUE'S MEMORY. `intake-receipts.tsx:5-10` already states
// the rule this card inherits: every number and every row here is a DURABLE record read back
// through `clara.get_intake_batch`. `upload-panel.tsx` stays the LIVE transfer view, and the two
// are labelled as two different things — one is what this browser is doing right now, the other is
// what the firm's books know happened.
//
// NO `Progress` ELEMENT IN ANY STATE, AND NO PERCENTAGE-SHAPED STRING. The door supplies no
// denominator, by ruling and by its own tail assertion; appendix D item 44 permits `Progress` only
// for a KNOWN numerator/denominator and says "Indeterminate agent Work keeps its durable named
// state instead"; `work-detail.tsx:6-12` already forbids one for a single Work. So this card
// renders LABELLED FACET COUNTS with their coverage word. A bar appears on this surface only where
// it already legitimately does — `upload-panel.tsx:285-302`'s MEASURED byte transfer, a different
// component for a different question.
//
// THE FACETS OVERLAP AND ARE NEVER SUMMED. A member can be admitted AND waiting; the numbers
// legitimately exceed the member count (CONTEXT.md:136-138). The card shows them side by side and
// never writes "x of y".
//
// ONE ANNOUNCEMENT OWNER (`upload-panel.tsx:44-52`, `:185`): a single `sr-only role="status"
// aria-live="polite"` region speaks the batch's settlement once. The ROWS are not live regions — a
// hundred rows would otherwise speak a hundred times on every re-render.
//
// THE CAPACITY COPY SAYS 08:00, NEVER "MIDNIGHT" AND NEVER "TOMORROW". The daily window is
// `date_trunc('day', now() at time zone 'utc')` (0007:1644), whose boundary is 08:00
// Asia/Kuala_Lumpur — MEASURED on a migrated rig. The string is the DOOR's own `resets_at_local`,
// so it cannot drift from the wall it describes.
//
// AT 320px the Kind/State columns withdraw into the row's primary cell; the table primitive's own
// focusable `overflow-x-auto` region is what keeps the PAGE from scrolling horizontally.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTableCard } from "@/components/common/data-table-card";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, StateBanner } from "@/components/common/state";
import { businessDateTime } from "@/lib/business-date";
import { clientBase } from "@/lib/navigation/tree";
import {
  INTAKE_BATCH_FACET_KINDS, type IntakeBatchFacetKind, type IntakeBatchMemberRow,
  type IntakeBatchPack,
} from "@/lib/documents/intake-batch";
import { BATCH_FACETS, type BatchFacet } from "@/lib/documents/batch-url-state";
import { IntakeBatchCancelDialog } from "./intake-batch-cancel-dialog";

/** The read's ANSWER, as the card sees it — the five list states told apart by what the read
 *  actually answered, never by a caught error mapped to an empty pack
 *  (`accounting-work-list.tsx:27-47`'s taxonomy, copied rather than re-invented). */
export type IntakeBatchCardState =
  | { kind: "loading" }
  | { kind: "denied" }
  | { kind: "failed"; message: string | null }
  | { kind: "ready"; pack: IntakeBatchPack };

const FACET_TO_ROWS: Record<Exclude<BatchFacet, "all">, IntakeBatchFacetKind> = {
  waiting: "waiting",
  failed: "failed",
  unassigned: "unassigned",
  settled: "settled",
};

/** Every preview row the selected facet shows, de-duplicated by member — a member that is both
 *  admitted and waiting must appear ONCE in the "all" view, under both facet counts. */
function rowsFor(pack: IntakeBatchPack, facet: BatchFacet): { row: IntakeBatchMemberRow; facet: IntakeBatchFacetKind }[] {
  const kinds: IntakeBatchFacetKind[] = facet === "all"
    ? [...INTAKE_BATCH_FACET_KINDS]
    : [FACET_TO_ROWS[facet]];
  const seen = new Set<string>();
  const out: { row: IntakeBatchMemberRow; facet: IntakeBatchFacetKind }[] = [];
  for (const kind of kinds) {
    for (const row of pack.facets[kind].rows) {
      if (seen.has(row.memberId)) continue;
      seen.add(row.memberId);
      out.push({ row, facet: kind });
    }
  }
  return out;
}

/** The DURABLE state word a row shows. It is the child's OWN state, never the parent's — UI-30's
 *  whole complaint about the historical card was that it named nothing and offered only Cancel. */
function rowStateKey(row: IntakeBatchMemberRow, facet: IntakeBatchFacetKind): string {
  if (row.dependency) return `rowState.${row.dependency}`;
  if (facet === "settled") return "rowState.settled";
  if (facet === "failed") return row.taskErrorCode ? "rowState.extractionFailed" : "rowState.intakeFailed";
  if (facet === "unassigned") return "rowState.unassigned";
  if (row.hasOpenQuestion) return "rowState.awaiting_fact";
  if (row.workStatus) return `rowState.work.${row.workStatus}`;
  return "rowState.inCustody";
}

export function IntakeBatchCard({
  state,
  clientId,
  facet,
  onFacetChange,
  onRefresh,
  pollExhausted = false,
  readOnly = false,
  onCancelled,
}: {
  state: IntakeBatchCardState;
  /** The client whose Documents tab this is, or null on the firm leaf (read-only mount). */
  clientId: string | null;
  facet: BatchFacet;
  onFacetChange: (next: BatchFacet) => void;
  onRefresh: () => void;
  /** The bounded poll gave up with rows still unsettled — an honest end, and a manual Refresh. */
  pollExhausted?: boolean;
  /** The firm leaf mounts this read-only apart from Cancel. */
  readOnly?: boolean;
  onCancelled?: () => void;
}) {
  const t = useTranslations("IntakeBatch");
  const [announcement, setAnnouncement] = useState("");
  const spoken = useRef(new Set<string>());
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());
  const cancelTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);

  const pack = state.kind === "ready" ? state.pack : null;

  /** ONE ANNOUNCEMENT OWNER. The batch's own settlement is spoken ONCE per (batch, state). */
  useEffect(() => {
    if (pack === null) return;
    const stamp = `${pack.batch.id}:${pack.batch.state ?? "unknown"}`;
    if (spoken.current.has(stamp)) return;
    spoken.current.add(stamp);
    setAnnouncement(t("announce", {
      label: pack.batch.label ?? "",
      state: t(`state.${pack.batch.state ?? "open"}`),
    }));
  }, [pack, t]);

  const focusFirstRow = useCallback(() => {
    const first = rowRefs.current.values().next().value;
    first?.focus?.();
  }, []);

  const visible = useMemo(() => (pack === null ? [] : rowsFor(pack, facet)), [pack, facet]);

  // ---- loading: a shape-matched Skeleton plus one sr-only sentence, because a skeleton cannot
  // say what is loading.
  if (state.kind === "loading") {
    return (
      <section aria-labelledby="intake-batch-heading" className="space-y-3">
        <h2 id="intake-batch-heading" className="text-sm font-medium">{t("heading")}</h2>
        <p role="status" className="sr-only">{t("loading")}</p>
        <div className="space-y-2" aria-hidden="true">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-20 w-full" />
        </div>
      </section>
    );
  }

  // ---- denied: the rows are CLEARED, the access state is explained, and NO affordance is offered
  // that could only refuse (`accounting-work-list.tsx:33-35`).
  if (state.kind === "denied") {
    return (
      <section aria-labelledby="intake-batch-heading" className="space-y-3">
        <h2 id="intake-batch-heading" className="text-sm font-medium">{t("heading")}</h2>
        <StateBanner tone="warning" title={t("denied.title")}>{t("denied.body")}</StateBanner>
      </section>
    );
  }

  // ---- failed first read: an Alert plus Retry, NEVER an Empty. A read that did not answer proves
  // nothing about whether this batch has members.
  if (state.kind === "failed") {
    return (
      <section aria-labelledby="intake-batch-heading" className="space-y-3">
        <h2 id="intake-batch-heading" className="text-sm font-medium">{t("heading")}</h2>
        <StateBanner tone="error" title={t("failed.title")}>
          <p>{t("failed.body")}</p>
          {state.message ? <p className="mt-1 text-xs">{state.message}</p> : null}
          <Button type="button" size="sm" variant="outline" className="mt-2" onClick={onRefresh}>
            {t("retry")}
          </Button>
        </StateBanner>
      </section>
    );
  }

  const ready = state.pack;
  const stopping = ready.batch.state === "cancelling";
  const terminal = ready.batch.state === "cancelled";
  const memberless = INTAKE_BATCH_FACET_KINDS.every((k) => (ready.facets[k].count ?? 0) === 0)
    && INTAKE_BATCH_FACET_KINDS.every((k) => ready.facets[k].rows.length === 0);

  return (
    <section aria-labelledby="intake-batch-heading" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="intake-batch-heading" className="text-sm font-medium">
          {t("headingNamed", { label: ready.batch.label ?? t("untitled") })}
        </h2>
        <span className="text-muted-foreground text-xs">
          {t("computedAt", { at: ready.computedAt ? businessDateTime(new Date(ready.computedAt)) : "—" })}
        </span>
      </div>

      {/* ONE announcement owner for the whole card; rows are NOT live regions. */}
      <p role="status" aria-live="polite" aria-label={t("liveLabel")} className="sr-only">
        {announcement}
      </p>

      {/* CANCELLED / RECOVERY. `cancelling` shows 正在停止 and REVEALS the completed receipts;
          terminal cancellation is never shown early — the door only writes `cancelled` when
          nothing is live. */}
      {stopping ? (
        <StateBanner tone="warning" title={t("stopping.title")}>
          {t("stopping.body", { settled: ready.facets.settled.count ?? 0 })}
        </StateBanner>
      ) : null}
      {terminal ? (
        <StateBanner tone="info" title={t("cancelled.title")}>{t("cancelled.body")}</StateBanner>
      ) : null}

      {/* THE FACET COUNTS. Labelled, with their coverage word, and never summed. */}
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-5" data-testid="intake-batch-facets">
        {INTAKE_BATCH_FACET_KINDS.map((kind) => {
          const f = ready.facets[kind];
          return (
            <li key={kind} className="rounded-md border p-2">
              <span className="text-muted-foreground block text-xs">{t(`facet.${kind}`)}</span>
              <span className="text-base font-medium tabular-nums">
                {f.count === null ? t("unknownCount") : f.count}
              </span>
              {f.status !== "ok" ? (
                <span className="text-muted-foreground block text-xs">
                  {t(`coverage.${f.status}`)}
                  {f.coverageReason ? ` · ${t(`coverageReason.${f.coverageReason}`, { fallback: f.coverageReason })}` : ""}
                </span>
              ) : null}
              {kind === "settled" && (f.uncountedCompletions ?? 0) > 0 ? (
                <span className="text-muted-foreground block text-xs">
                  {t("uncountedCompletions", { n: f.uncountedCompletions ?? 0 })}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>

      {/* WHY THE WAITING NUMBER IS WHAT IT IS. The batch's waiting number legitimately differs from
          the review queue's (the queue never sees a declared dependency), so the card states the
          sources rather than leaving two numbers over one relation unexplained. */}
      <p className="text-muted-foreground text-xs">
        {t("waitingBasis", {
          question: ready.waitingBasis.byQuestion ?? 0,
          fact: ready.waitingBasis.byDependency.awaiting_fact ?? 0,
          attribution: ready.waitingBasis.byDependency.awaiting_attribution ?? 0,
          capacity: ready.waitingBasis.byDependency.awaiting_capacity ?? 0,
          unfiled: ready.waitingBasis.byUnfiled ?? 0,
        })}
      </p>

      {/* THE CAPACITY SENTENCE — the door's own reset moment, never "midnight" and never
          "tomorrow". */}
      {(ready.waitingBasis.byDependency.awaiting_capacity ?? 0) > 0
        || (ready.waitingBasis.byCapacityFailure ?? 0) > 0 ? (
          <StateBanner tone="info" title={t("capacity.title")}>
            {t("capacity.body", {
              at: ready.capacity.resetsAtLocal ?? "08:00",
              zone: ready.capacity.timezone ?? "Asia/Kuala_Lumpur",
            })}
          </StateBanner>
        ) : null}

      {/* THE NAMED RESIDUAL, ON THE SURFACE RATHER THAN ONLY IN A REPORT: a file refused by the
          daily ceiling BEFORE its intake exists never becomes a member, because a member's
          identity IS its intake. The upload list above already renders the database's own message
          and remedy for it. */}
      <p className="text-muted-foreground text-xs">{t("residual.preIntakeRefusal")}</p>

      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup
          type="single"
          value={facet}
          onValueChange={(next) => { if (next) onFacetChange(next as BatchFacet); }}
          aria-label={t("facetFilterLabel")}
        >
          {BATCH_FACETS.map((value) => (
            <ToggleGroupItem key={value} value={value} aria-label={t(`facet.${value === "all" ? "all" : value}`)}>
              {t(`facet.${value === "all" ? "all" : value}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Button type="button" size="sm" variant="outline" onClick={onRefresh}>{t("refresh")}</Button>
        {!readOnly && !terminal ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            ref={cancelTriggerRef}
            onClick={() => setCancelOpen(true)}
          >
            {t("cancel.trigger")}
          </Button>
        ) : null}
      </div>

      {pollExhausted ? (
        <StateBanner tone="info" title={t("pollExhausted.title")}>{t("pollExhausted.body")}</StateBanner>
      ) : null}

      {memberless ? (
        <EmptyState>{t("empty.firstUse")}</EmptyState>
      ) : visible.length === 0 ? (
        // NO RESULTS — the facet is PRESERVED and "Show all" is offered right here. It is NOT an
        // Empty: other facets do have rows.
        <div className="space-y-2">
          <EmptyState>{t("empty.noResults", { facet: t(`facet.${facet === "all" ? "all" : facet}`) })}</EmptyState>
          <Button type="button" size="sm" variant="outline" onClick={() => onFacetChange("all")}>
            {t("showAll")}
          </Button>
        </div>
      ) : (
        <DataTableCard>
          <TableHeader>
            <TableRow>
              <TableHead>{t("column.file")}</TableHead>
              <TableHead>{t("column.state")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("column.detail")}</TableHead>
              <TableHead>{t("column.open")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map(({ row, facet: rowFacet }) => (
              <TableRow
                key={row.memberId}
                tabIndex={-1}
                ref={(el) => {
                  if (el) rowRefs.current.set(row.memberId, el);
                  else rowRefs.current.delete(row.memberId);
                }}
              >
                <TableCell>
                  <span className="block">{row.filename ?? t("unnamedFile")}</span>
                  {/* 320px: the withdrawn columns are re-expressed here rather than clipped. */}
                  <span className="text-muted-foreground block text-xs md:hidden">
                    {row.dependencyReason ?? row.intakeFailureCode ?? row.taskErrorCode ?? row.intakeStatus ?? ""}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{t(rowStateKey(row, rowFacet))}</Badge>
                  {row.retrying ? <Badge variant="outline" className="ml-1">{t("rowState.retrying")}</Badge> : null}
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <span className="text-muted-foreground text-xs">
                    {row.dependencyReason ?? row.intakeFailureCode ?? row.taskErrorCode ?? row.intakeStatus ?? ""}
                  </span>
                </TableCell>
                <TableCell>
                  {/* UI-30/UI-31: every row offers ITS OWN address, at the child's own altitude —
                      the Work when one exists, the document otherwise. A read-only line in the
                      parent's table is what those two rows are about. */}
                  {row.workId && (row.clientId ?? clientId) ? (
                    <Link
                      href={`${clientBase(row.clientId ?? clientId ?? "")}/work/${row.workId}`}
                      className="underline"
                      onClick={focusFirstRow}
                    >
                      {t("openWork")}
                    </Link>
                  ) : row.documentId && clientId ? (
                    <Link
                      href={`${clientBase(clientId)}/documents?document=${row.documentId}`}
                      className="underline"
                      onClick={focusFirstRow}
                    >
                      {t("openDocument")}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground text-xs">{t("noAddressYet")}</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </DataTableCard>
      )}

      {cancelOpen ? (
        <IntakeBatchCancelDialog
          batchId={ready.batch.id}
          label={ready.batch.label ?? t("untitled")}
          liveChildren={(ready.facets.admitted.count ?? 0) - (ready.facets.settled.count ?? 0)}
          onOpenChange={setCancelOpen}
          returnFocusTo={cancelTriggerRef}
          onCancelled={() => { onCancelled?.(); onRefresh(); }}
        />
      ) : null}
    </section>
  );
}
