"use client";

// The sweep-runs panel — T7 (port-wave plan §4/§5). Renders `sweep` from the
// SAME `clara.list_review_queue` envelope needs-you-inbox.tsx already reads
// (lib/firm/use-review-queue.ts's `sweep` field — measured UNUSED anywhere
// in apps/web before this train) — zero extra network calls.
//
// RUNG-0 SCOPE NOTE, TRUED (owner-ruled, 裁-20 —
// docs/plan/active/mohe-grill-rulings-2026-08-28.md:268-272): there is no
// BROWSABLE LIST of sweep runs anywhere — the queue envelope carries only
// `open_run` (a boolean) plus two timestamps, `list_sweep_runs` does not
// exist, and neither `sweep_runs` nor `sweep_run_items` carries a human
// SELECT policy (owner-only; measured 2026-08-28). A run id DOES reach the
// human, honestly, through a channel this panel does not cover: Clara posts
// a `sweep_receipt` part (`lib/parts/types.ts`'s `SweepReceiptPart`, already
// live in the 18-member catalog) into the thread carrying its own `run_id`
// when a sweep finalizes — `get_sweep_run`/`acknowledge_sweep_run` are real,
// callable doors FOR THAT id. That part renders today as a generic id-only
// summary card (components/parts/PartRenderer.tsx's `SUMMARY_TYPES` bucket,
// alongside eight OTHER identifier-only part types nobody has hydrated yet).
// Flagged here at rung 0 rather than built quietly; the owner has since
// RULED it (裁-20, confirming the conductor's own call): `SweepReceiptPart`
// upgrades to a rich card calling `get_sweep_run`/offering
// `acknowledge_sweep_run` INSIDE the P6 four-part wire bump (`chatTurn_v16` —
// TRUED 2026-08-30, was v15; v15 shipped 2026-08-29 for the unrelated F-A6
// PR-2, alongside the other unhydrated part types) — no separate train owns it.
// This queue-altitude panel renders the ONE thing it genuinely has (the
// envelope's own state) and names that ruled, tracked home rather than a
// vague gap.

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
