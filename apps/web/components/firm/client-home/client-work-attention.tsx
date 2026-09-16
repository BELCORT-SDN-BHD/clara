"use client";

// SECTION C0 — THE WORK ATTENTION BAND. Three tiles, in the order a person actually triages:
// what is waiting on a HUMAN, what is running RIGHT NOW, and what finished in the last seven
// Malaysian calendar days. Each number is a link into the Work list already narrowed to exactly
// that population, and each tile carries up to five of its own rows as direct links.
//
// TWO READS, THREE TILES, AND THAT IS THE DESIGN RATHER THAN AN ACCIDENT.
//
// The "waiting on a person" number is NOT this section's to compute. It ships already, through
// `clara.list_review_queue`'s `counts.work_questions` (#629), at VIEWER floor, on this very page —
// the chips in section C render it. `clara.get_client_work_pack` floors at BOOKKEEPER, so folding
// that number in would have taken a shipped surface away from viewers AND put two aggregations of
// one relation under nearly one noun on one page: the exact defect 裁-190 removed from
// `client-needs-you.tsx` ("Two renderings of one queue, one of them inert"). So this band RESTATES
// the shipped number, names where it comes from, and computes nothing of its own for that tile.
//
// The practical consequence is visible and deliberate: a VIEWER sees one populated tile beside two
// tiles that say, in words, that Work records need a bookkeeper role. That is the honest face of
// a page whose two halves have different floors (#625 moves a caller across that line mid-session),
// and it is better than three dead tiles or one silently missing number.
//
// EVERY TILE HAS FIVE WAYS TO HAVE NO NUMBER AND THEY ARE FIVE DIFFERENT SENTENCES:
//   loading    the first read has not landed. A skeleton, never a zero.
//   empty      the door answered 0. "Nothing is running for this client right now."
//   partial    the door answered, and SAID which part of the answer it is not making.
//   unknown    this build could not read the facet. "Could not be read" — never a 0, because
//              "nothing is running" and "I could not find out" are different next actions.
//   denied     the caller may not read it. A permission, not a failure.
//
// FACETS OVERLAP AND ARE NEVER SUMMED. One Work can be running now AND have posted yesterday, and
// a Work parked on a question is in the review queue's number and in neither of the other two.
// The band says so in words, the way `client-docs-backlog.tsx:13-18` does for its own four counts,
// and there is no total anywhere — the door publishes none and this file computes none.
//
// THE BAND IS THE ONLY TRANSLUCENT THING HERE. It extends the idiom `components/ui/sheet.tsx:85`
// already ships (`supports-backdrop-filter:backdrop-blur-xs`) and mints no `glass` token: the
// visual direction it would have come from lives in a working copy nobody in this repo has read,
// so a token would be invented rather than selected. Financial values stay on solid backgrounds.

import Link from "next/link";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/parts/PartBadge";
import { SectionHeader } from "@/components/common/section-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { businessDate, businessDateTime } from "@/lib/business-date";
import type { ReviewQueueState } from "@/lib/firm/use-review-queue";
import { workDetailHref } from "@/lib/navigation/tree";
import {
  workAttentionHref,
  type ClientWorkPack,
  type WorkAttentionFacet,
  type WorkAttentionFacetKind,
  type WorkAttentionRow,
  type WorkAttentionStatus,
} from "@/lib/work/client-work-pack";
import { purposeLabel } from "@/lib/work/purpose-label";
import { useClientWorkPack } from "@/lib/work/use-client-work-pack";
import { ErrorMessage } from "../data-state";

/** The tone each state word wears. The WORD is the state (C08.6); the tone only agrees with it. */
const STATE_TONE: Record<WorkAttentionStatus, "neutral" | "info" | "warning" | "error"> = {
  ok: "neutral",
  partial: "warning",
  unknown: "warning",
  denied: "info",
};

type TileProps = {
  kind: WorkAttentionFacetKind;
  clientId: string;
  pack: ClientWorkPack;
  facet: WorkAttentionFacet;
  loading: boolean;
  /** The failure to attach to THIS tile, or null. */
  error: unknown;
  onRetry: (() => void) | null;
  /** The pack came back as a governed refusal, which is this board's only evidence that the
   *  caller is below the Work floor. The needs-you tile is read at VIEWER floor and still has a
   *  number in that case; the list its number links to is not. */
  packDenied: boolean;
};

function WorkAttentionTile({
  kind, clientId, pack, facet, loading, error, onRetry, packDenied,
}: TileProps) {
  const t = useTranslations("ClientWorkAttention");
  const tm = useTranslations("ManualJournal");
  const headingId = `client-home-attention-${kind}`;

  const countPhrase = (n: number): string => {
    if (kind === "needs_you") return t("countNeedsYou", { n });
    if (kind === "active") return t("countActive", { n });
    return t("countRecentSuccess", { n, days: pack.window?.days ?? 7 });
  };

  const body = (): React.ReactNode => {
    if (loading) return <Skeleton className="h-5 w-40" aria-hidden="true" />;
    if (facet.status === "denied") {
      return (
        <p className="text-sm text-muted-foreground">
          {t("deniedBody")} {t("deniedWhy")}
        </p>
      );
    }
    if (facet.status === "unknown" || facet.count === null) {
      return (
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm text-muted-foreground">{t("unknownBody")}</p>
          {error ? <ErrorMessage error={error} /> : null}
          {onRetry ? (
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>{t("retry")}</Button>
          ) : null}
        </div>
      );
    }
    if (facet.count === 0) {
      return <p className="text-sm text-muted-foreground">{t(`empty.${kind}`)}</p>;
    }
    return (
      <div className="flex flex-col gap-2">
        <Link
          href={workAttentionHref(kind, clientId, pack)}
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          {countPhrase(facet.count)}
        </Link>
        {facet.coverage === "partial" ? (
          <p className="text-xs text-warning">
            {facet.coverageReason === "retry_label_preview_only"
              ? t("partialRetryPreview", { shown: facet.rows.length, total: facet.count })
              : facet.coverageReason === "completions_without_receipt"
                ? t("partialUndated", { n: facet.uncountedCompletions ?? 0 })
                : t("partialGeneric")}
          </p>
        ) : null}
        {kind === "active" ? (
          <p className="text-xs text-muted-foreground">{t("retryNotFilterable")}</p>
        ) : null}
        {/* THE DRILLDOWN IS THE SAME WEEK OVER A DIFFERENT SUBJECT, and saying so is the same
            obligation the line above discharges for "retrying". This tile counts a COMMITTED
            RECEIPT inside the seven Malaysian dates — the estate's only durable completion
            instant — while `clara.list_accounting_work` fences `accounting_work.created_at`,
            when the Work was STARTED (0189:427-428). That door has no receipt-dated axis, so the
            link carries the closest filter it can express and the sentence carries the rest. The
            divergence is measured, not assumed: `p650.pack.recent_success_drilldown` builds both
            classes on the rig (a Work admitted weeks ago and posted this week; a Work started and
            completed this week with no receipt, which the door already names through
            `uncounted_completions`). */}
        {kind === "recent_success" ? (
          <p className="text-xs text-muted-foreground">{t("recentSuccessListBasis")}</p>
        ) : null}
        {/* AND THE ONE LINK A DENIED CALLER IS STILL OFFERED. This number is viewer-floored; the
            list it opens is bookkeeper-floored (0189:344-347). A refused pack IS the evidence
            that this caller is below that floor, so the destination is named rather than
            silently offered — and kept, because a role can change and a hidden door explains
            nothing. */}
        {kind === "needs_you" && packDenied ? (
          <p className="text-xs text-muted-foreground">{t("needsYouListFloor")}</p>
        ) : null}
        {facet.rows.length > 0 ? (
          <ul className="flex flex-col gap-1 text-sm">
            {facet.rows.map((row) => (
              <li key={row.work_id} className="flex min-w-0 flex-wrap items-baseline gap-2">
                <Link
                  href={workDetailHref(clientId, row.work_id)}
                  className="min-w-0 truncate text-primary underline-offset-4 hover:underline"
                >
                  {rowLabel(row, tm)}
                </Link>
                {row.retrying ? (
                  <Badge tone="warning">
                    {t("retrying")}
                    {row.attempts !== null ? ` · ${t("attempt", { n: row.attempts })}` : ""}
                  </Badge>
                ) : null}
                {row.committed_at !== null ? (
                  <span className="text-xs text-muted-foreground">
                    {t("postedOn", { date: businessDate(new Date(row.committed_at)) })}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        {kind === "needs_you" ? (
          <p className="text-xs text-muted-foreground">{t("needsYouSourceNote")}</p>
        ) : null}
      </div>
    );
  };

  return (
    <Card aria-labelledby={headingId} className="min-w-0 gap-3 py-4">
      <CardHeader className="gap-1 px-4">
        <CardTitle className="flex flex-wrap items-center gap-2 text-sm font-semibold">
          <span id={headingId}>{t(`tile.${kind}`)}</span>
          {/* THE STATE IS A WORD. A colour alone would be unreadable in greyscale and silent to a
              screen reader — C08.6's own rule, applied to the one place on this page where a
              "no number" state is otherwise indistinguishable from a quiet day. */}
          {loading ? null : (
            <Badge tone={STATE_TONE[facet.status]}>{t(`state.${facet.status}`)}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4">{body()}</CardContent>
    </Card>
  );
}

/** A preview row's own label: the memo when the admitted basis carried one, otherwise the purpose
 *  through #638's shared map, otherwise the Work's short id. Never a blank link. */
function rowLabel(row: WorkAttentionRow, tm: (key: string) => string): string {
  const purpose = purposeLabel(row.purpose, tm, "links.purpose");
  if (row.memo !== null && row.memo !== "") {
    return purpose === "" ? row.memo : `${row.memo} · ${purpose}`;
  }
  return purpose === "" ? row.work_id.slice(0, 8) : purpose;
}

/** The needs-you facet, composed from the SHIPPED review-queue envelope rather than read again.
 *  Its states are the queue's, not the pack's: a queue that failed leaves this tile unknown while
 *  the other two may be perfectly readable, which is the same per-section independence the rest
 *  of this board already has. */
function needsYouFacet(queue: ReviewQueueState): WorkAttentionFacet {
  // `?? 0` HERE AND ONLY HERE, and it is #629's own rule rather than a `?? 0` this file invented:
  // `needs-you-counts.tsx:30` reads the same key the same way, because a database at a pre-0180
  // frontier sends no `work_questions` at all and a chip reading `undefined` would be a lie about
  // a population that cannot exist there yet. The tile must agree with the chip beside it — two
  // spellings of one number on one page is the defect this whole band is shaped around. An
  // envelope that never LANDED is a different thing, and stays unknown.
  const n = queue.counts === null ? null : (queue.counts.work_questions ?? 0);
  if (typeof n !== "number" || !Number.isInteger(n) || n < 0) {
    return {
      status: "unknown", count: null, coverage: null, coverageReason: null,
      uncountedCompletions: null, rows: [],
    };
  }
  return {
    status: "ok", count: n, coverage: "ok", coverageReason: null,
    uncountedCompletions: null, rows: [],
  };
}

export function ClientWorkAttention({
  clientId,
  queue,
  load,
  now,
}: {
  clientId: string;
  /** The page's own review-queue read. Passed down rather than read again: the number this tile
   *  restates is already on this page, and a second RPC for it would be a second population to
   *  disagree with. */
  queue: ReviewQueueState;
  /** Injected by the cells so a test drives the loader directly; production reads the door. */
  load?: (clientId: string) => Promise<ClientWorkPack>;
  /** Injected by the cells for the staleness clock. */
  now?: () => number;
}) {
  const t = useTranslations("ClientWorkAttention");
  const state = useClientWorkPack({ clientId, load, now });
  const { pack } = state;

  const packError = state.denied ?? state.staleError;
  const tileError = (kind: WorkAttentionFacetKind): unknown =>
    (kind === "needs_you" ? (queue.counts === null ? queue.error : null) : packError);

  return (
    <section aria-labelledby="client-home-work-attention" className="flex flex-col gap-3">
      <SectionHeader level={2}>
        <span id="client-home-work-attention">{t("heading")}</span>
      </SectionHeader>

      <div className="@container">
        {/* The ONE translucent surface on this board — the existing sheet idiom, not a new token.
            `@2xl:` deliberately, so the page's own `@3xl:grid-cols-` two-column template stays the
            first (and only) element that selector describes. */}
        <div
          className="grid grid-cols-1 gap-3 rounded-lg border border-border/60 bg-muted/40 p-3 @2xl:grid-cols-3 supports-backdrop-filter:backdrop-blur-xs"
          data-clara-attention-band=""
        >
          <WorkAttentionTile
            kind="needs_you"
            clientId={clientId}
            pack={pack}
            facet={needsYouFacet(queue)}
            loading={queue.loading && queue.counts === null}
            error={tileError("needs_you")}
            onRetry={queue.counts === null ? () => queue.reload() : null}
            packDenied={state.denied !== null}
          />
          <WorkAttentionTile
            kind="active"
            clientId={clientId}
            pack={pack}
            facet={pack.active}
            loading={state.loading}
            error={tileError("active")}
            onRetry={state.denied ? null : () => state.reload()}
            packDenied={state.denied !== null}
          />
          <WorkAttentionTile
            kind="recent_success"
            clientId={clientId}
            pack={pack}
            facet={pack.recentSuccess}
            loading={state.loading}
            error={tileError("recent_success")}
            onRetry={state.denied ? null : () => state.reload()}
            packDenied={state.denied !== null}
          />
        </div>
      </div>

      {/* THE OVERLAP, IN WORDS RATHER THAN IN ARITHMETIC — `client-docs-backlog.tsx:13-18`'s own
          shape. Subtracting one facet from another would be this build computing a figure the
          database never stated. */}
      <p className="text-xs text-muted-foreground">{t("overlapNote")}</p>

      {/* FRESHNESS, AND ONLY WHAT IS TRUE. `computed_at` is the instant of the read, not a
          position in the database: no Work admission, claim, settle, completion, question or
          answer emits a domain event anywhere in this estate, so there is no watermark to show
          and none is invented. */}
      <p className="text-xs text-muted-foreground">
        {state.readAt !== null && pack.computedAt !== null
          ? t("readAt", { time: businessDateTime(pack.computedAt) })
          : t("readNotYet")}
        {state.delayed && state.readAt !== null ? ` · ${t("delayedSince")}` : ""}
        {state.refreshing ? ` · ${t("refreshing")}` : ""}
      </p>
    </section>
  );
}
