"use client";

// The `counts` envelope from clara.list_review_queue, rendered verbatim as summary
// chips (this build's coordinator ruling: "the counts envelope drives the summary
// chips"). Every number here is the DB's own count — nothing summed client-side.

import { useTranslations } from "next-intl";
import { Badge } from "@/components/parts/PartBadge";
import type { ReviewQueueCounts } from "@/lib/firm/needs-you";

export function NeedsYouCounts({ counts }: { counts: ReviewQueueCounts }) {
  const t = useTranslations("NeedsYou");
  const chips: [string, number][] = [
    [t("countsNeedsYou"), counts.needs_you],
    [t("countsNeedsReview"), counts.needs_review],
    [t("countsReady"), counts.ready],
    [t("countsOpenDrafts"), counts.open_drafts],
    [t("countsOpenQuestions"), counts.open_questions],
    [t("countsOpenTasks"), counts.open_tasks],
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {chips.map(([label, value]) => (
        <Badge key={label} tone="neutral">
          {label}: {value}
        </Badge>
      ))}
    </div>
  );
}
