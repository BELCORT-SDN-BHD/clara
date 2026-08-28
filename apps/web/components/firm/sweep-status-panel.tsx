"use client";

// The sweep-runs panel — T7 (port-wave plan §4/§5). Renders `sweep` from the
// SAME `clara.list_review_queue` envelope needs-you-inbox.tsx already reads
// (lib/firm/use-review-queue.ts's `sweep` field — measured UNUSED anywhere
// in apps/web before this train) — zero extra network calls.
//
// RUNG-0 SCOPE NOTE, CORRECTED (recorded, not a silent gap): there is no
// BROWSABLE LIST of sweep runs anywhere — the queue envelope carries only
// `open_run` (a boolean) plus two timestamps, `list_sweep_runs` does not
// exist, and neither `sweep_runs` nor `sweep_run_items` carries a human
// SELECT policy (owner-only; measured 2026-08-28). But a run id DOES reach
// the human, honestly, through a channel this panel does not cover: Clara
// posts a `sweep_receipt` part (`lib/parts/types.ts`'s `SweepReceiptPart`,
// already live in the 18-member catalog) into the thread carrying its own
// `run_id` when a sweep finalizes — `get_sweep_run`/`acknowledge_sweep_run`
// are real, callable doors FOR THAT id. That part renders today as a
// generic id-only summary card (components/parts/PartRenderer.tsx's
// `SUMMARY_TYPES` bucket, alongside eight OTHER identifier-only part types
// nobody has hydrated yet) — upgrading it into a rich card that calls
// get_sweep_run and offers acknowledge is a standing P3-era gap at the
// PARTS-CATALOG layer, not named anywhere in this wave's own scope (§5's
// table), so it is reported here rather than built quietly. This queue-
// altitude panel renders the ONE thing it genuinely has (the envelope's own
// state) and names the honest reason the acknowledge control cannot live
// here.

import { useTranslations } from "next-intl";
import { SectionHeader } from "@/components/common/section-header";
import { StateBanner } from "@/components/common/state";
import { NotBuiltNote } from "@/components/common/not-built-note";
import { businessDateTime } from "@/lib/business-date";
import type { ReviewQueueSweep } from "@/lib/firm/needs-you";

export function SweepStatusPanel({ sweep }: { sweep: ReviewQueueSweep | null }) {
  const t = useTranslations("CodingQuestionsSignals.sweep");

  if (!sweep) return null;

  return (
    <div className="flex flex-col gap-2">
      {/* F11, independent review: this panel had no heading of its own — it
          read as an unexplained banner floating above the queue. */}
      <SectionHeader level={2}>{t("heading")}</SectionHeader>
      <StateBanner tone={sweep.open_run ? "info" : "neutral"}>
        {sweep.open_run ? t("openRun") : t("noOpenRun")}
      </StateBanner>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <dt>{t("lastFinalizedLabel")}</dt>
        <dd>{sweep.last_finalized_at ? businessDateTime(sweep.last_finalized_at) : t("never")}</dd>
        <dt>{t("lastAckLabel")}</dt>
        <dd>{sweep.last_ack_at ? businessDateTime(sweep.last_ack_at) : t("never")}</dd>
      </dl>
      <NotBuiltNote>{t("acknowledgeGap")}</NotBuiltNote>
    </div>
  );
}
