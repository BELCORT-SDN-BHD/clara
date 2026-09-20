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
// THE CAPACITY COPY SAYS 00:00, NEVER "MIDNIGHT" AND NEVER "TOMORROW". The daily window is
// `date_trunc('day', now() at time zone 'Asia/Kuala_Lumpur')` (0252, #964 — moved off 0007:1644's
// UTC day, whose boundary was 08:00 Asia/Kuala_Lumpur), so the reset is MYT MIDNIGHT. The string
// is the DOOR's own `resets_at_local`, so it cannot drift from the wall it describes.
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
import { BATCH_FACETS, isBatchFacet, type BatchFacet } from "@/lib/documents/batch-url-state";
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
      {/* FIX ROUND 1, ADV-636-03 (MEASURED): the resumed fan-out MUST re-issue with the STORED
          actor, because clara._work_door_ctx hashes {work, author} and any other identity is
          CLR10 op_key_conflict. When that person's membership goes away, every child refuses
          CLR04 on every sweep, for ever, and the parent sits in `cancelling`. The door NAMES that
          (`cancel_blocked`) and the card says it, instead of showing "stopping" with no end and no
          explanation. An unknown word from a newer database renders the same generic sentence
          rather than nothing. */}
      {ready.cancelBlocked !== null ? (
        <StateBanner tone="warning" title={t("cancelBlocked.title")}>{t("cancelBlocked.body")}</StateBanner>
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

      {/* THE CAPACITY SENTENCE. TWO strings, not one, and no local constant behind either.
          `capacity.reset` names the DOOR's own reset moment and renders only when the door
          supplied one — there is no `?? "00:00"` fallback, because a literal here is a second
          copy of a wall the database owns and the next window move would have to come back for it
          (L05-SPEC-04). `capacity.body` carries the part that is true whatever the moment is, and
          it deliberately promises NO automatic resume: a quota-refused file holds no reservation
          and no capability, nothing in the belt re-drives a `failed` intake, so the firm's real
          remedy is to upload it again (ADV-W2L05-03). */}
      {(ready.waitingBasis.byDependency.awaiting_capacity ?? 0) > 0
        || (ready.waitingBasis.byCapacityFailure ?? 0) > 0 ? (
          <StateBanner tone="info" title={t("capacity.title")}>
            {ready.capacity.resetsAtLocal && ready.capacity.timezone
              ? `${t("capacity.reset", { at: ready.capacity.resetsAtLocal, zone: ready.capacity.timezone })} `
              : ""}
            {t("capacity.body")}
          </StateBanner>
        ) : null}

      {/* THE NAMED RESIDUAL, ON THE SURFACE RATHER THAN ONLY IN A REPORT. Since #965 a file the
          ceiling refuses at CREATION keeps its record (committed at failed/limit) and the runtime
          attaches it as an `awaiting_capacity` wait, so it DOES appear on this card — the card
          used to say the opposite. What it still has to say is that nothing was stored for it and
          nothing will re-read it, and where the database's own message and remedy are. */}
      <p className="text-muted-foreground text-xs">{t("residual.preIntakeRefusal")}</p>

      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup
          aria-label={t("facetFilterLabel")}
          value={[facet]}
          onValueChange={(next) => {
            // A CHECKED read, never a cast: a value this build does not know leaves the filter
            // where it is rather than writing a facet the card cannot render.
            const chosen = next[0];
            if (typeof chosen === "string" && isBatchFacet(chosen)) onFacetChange(chosen);
          }}
        >
          {BATCH_FACETS.map((value) => (
            <ToggleGroupItem key={value} value={value} aria-label={t(`facet.${value === "all" ? "all" : value}`)}>
              {t(`facet.${value === "all" ? "all" : value}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Button type="button" size="sm" variant="outline" onClick={onRefresh}>{t("refresh")}</Button>
        {/* FIX ROUND 1 (STANDARDS `firm-leaf-cancel-unreachable`): there used to be a `readOnly`
            prop, and the ONLY thing in the whole component it gated was this button — so the firm
            leaf, documented as "read-only apart from Cancel", was the one surface where Cancel
            could not be reached and `unassigned-sources.tsx`'s `onCancelled` handler was dead
            code. The prop is gone rather than re-pointed: the rows carry navigation, not acts, so
            there was nothing else for it to withhold. The two mounts differ by `clientId` alone —
            the firm leaf passes null, so a row with no Work of its own says "No address yet"
            instead of linking into a client's workspace. A TERMINAL batch still offers no Stop,
            on either mount: an affordance that could only refuse. */}
        {!terminal ? (
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
          liveChildren={Math.max((ready.facets.admitted.count ?? 0) - (ready.facets.settled.count ?? 0), 0)}
          pendingMembers={ready.pendingMembers ?? 0}
          onOpenChange={setCancelOpen}
          returnFocusTo={cancelTriggerRef}
          onCancelled={() => { onCancelled?.(); onRefresh(); }}
        />
      ) : null}
    </section>
  );
}
