"use client";

// The cross-client Needs-you inbox (owner ruling Q3) — clara.list_review_queue at
// firm altitude (p_scope: {}, this build's coordinator ruling: "the ONE existing
// paginated multi-source queue... never a hand-built union"). Hydrate-never-trust:
// every resolve/dismiss re-reads the whole queue afterward (useAsyncRead's act()).

import { useTranslations } from "next-intl";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { listReviewQueue, resolveOpenQuestion, dismissOpenQuestion } from "@/lib/firm/needs-you";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { DataState, ErrorMessage } from "./data-state";
import { NeedsYouCounts } from "./needs-you-counts";
import { NeedsYouRow } from "./needs-you-row";
import { NeedsYouGaps } from "./needs-you-gaps";

export function NeedsYouInbox() {
  const t = useTranslations("NeedsYou");
  const { data, loading, busy, error, act } = useAsyncRead(() => listReviewQueue(sessionTokenAccessor, {}));

  const rows = data?.rows ?? [];
  // A later action's error is a BANNER over still-real data, never a replacement
  // for it (hydrate-never-trust) — DataState only owns the initial load's error.
  const hasData = data !== null;

  return (
    <div className="flex flex-col gap-4">
      {data ? <NeedsYouCounts counts={data.counts} /> : null}
      {hasData && error ? <ErrorMessage error={error} /> : null}
      <DataState
        loading={loading}
        error={hasData ? null : error}
        isEmpty={rows.length === 0}
        emptyMessage={t("emptyMessage")}
      >
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <NeedsYouRow
              key={`${row.row_kind}:${row.id}`}
              row={row}
              busy={busy}
              onResolve={(questionId, resolution) =>
                void act(() => resolveOpenQuestion(sessionTokenAccessor, questionId, resolution).then(() => undefined))
              }
              onDismiss={(questionId, reason) =>
                void act(() => dismissOpenQuestion(sessionTokenAccessor, questionId, reason).then(() => undefined))
              }
            />
          ))}
        </ul>
      </DataState>
      <NeedsYouGaps />
    </div>
  );
}
