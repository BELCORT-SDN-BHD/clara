"use client";

// The cross-client Needs-you inbox (owner ruling Q3) — clara.list_review_queue at
// firm altitude (p_scope: {}, this build's coordinator ruling: "the ONE existing
// paginated multi-source queue... never a hand-built union"). Hydrate-never-trust:
// every resolve/dismiss re-reads the queue afterward.
//
// FIX-5 (independent review, fix-required, 2026-08-27): rides lib/firm/
// use-review-queue.ts — a single unpaginated page left the counts chips showing
// TRUE firm-wide totals over a list silently cut to 50 rows. `Load more` now
// wires the RPC's own `next_cursor` verbatim; `hasMore` is derived honestly from
// page size (see that module's header for why, not `next_cursor` presence).
//
// N13 (independent review, 2026-08-27): a resolve/dismiss REFUSAL is attached to
// the SPECIFIC row that was acted on (`actingKey`) — a page-level banner would
// misattribute it to whichever row a human happens to be looking at. Three
// mutually-exclusive error placements share the ONE `error` state
// useReviewQueue exposes:
//   - no data has EVER loaded (`!hasData`): the full DataState error page — there
//     is nothing else to show.
//   - the last action was a specific ROW's resolve/dismiss (`actingKey` set): the
//     error renders ONLY inside that row.
//   - the last action was `loadMore` (or nothing row-specific — `actingKey`
//     cleared before every loadMore call): a banner above the still-real list.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useReviewQueue } from "@/lib/firm/use-review-queue";
import { resolveOpenQuestion, dismissOpenQuestion } from "@/lib/firm/needs-you";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { DataState, ErrorMessage } from "./data-state";
import { NeedsYouCounts } from "./needs-you-counts";
import { NeedsYouRow } from "./needs-you-row";
import { NeedsYouGaps } from "./needs-you-gaps";

export function NeedsYouInbox() {
  const t = useTranslations("NeedsYou");
  const { rows, counts, loading, loadingMore, busy, error, hasMore, act, loadMore } = useReviewQueue({});
  const [actingKey, setActingKey] = useState<string | null>(null);

  const hasData = counts !== null;

  const handleResolve = async (questionId: string, resolution: string, rowKey: string): Promise<boolean> => {
    setActingKey(rowKey);
    return act(() => resolveOpenQuestion(sessionTokenAccessor, questionId, resolution).then(() => undefined));
  };
  const handleDismiss = async (questionId: string, reason: string, rowKey: string): Promise<boolean> => {
    setActingKey(rowKey);
    return act(() => dismissOpenQuestion(sessionTokenAccessor, questionId, reason).then(() => undefined));
  };
  const handleLoadMore = () => {
    setActingKey(null); // any resulting error is now general, not row-attributed
    void loadMore();
  };

  return (
    <div className="flex flex-col gap-4">
      {counts ? <NeedsYouCounts counts={counts} /> : null}
      {hasData && error && actingKey === null ? <ErrorMessage error={error} /> : null}
      <DataState
        loading={loading}
        error={hasData ? null : error}
        isEmpty={rows.length === 0}
        emptyMessage={t("emptyMessage")}
      >
        <ul className="flex flex-col gap-2">
          {rows.map((row) => {
            const rowKey = `${row.row_kind}:${row.id}`;
            return (
              <NeedsYouRow
                key={rowKey}
                row={row}
                busy={busy}
                error={actingKey === rowKey ? error : null}
                onResolve={(questionId, resolution) => handleResolve(questionId, resolution, rowKey)}
                onDismiss={(questionId, reason) => handleDismiss(questionId, reason, rowKey)}
              />
            );
          })}
        </ul>
        {hasMore ? (
          <button
            type="button"
            className="mt-2 self-start rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground"
            onClick={handleLoadMore}
            disabled={loadingMore}
          >
            {loadingMore ? t("loadingMore") : t("loadMore")}
          </button>
        ) : null}
      </DataState>
      <NeedsYouGaps />
    </div>
  );
}
