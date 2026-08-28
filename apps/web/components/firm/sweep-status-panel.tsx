"use client";

// The sweep-runs panel — T7 (port-wave plan §4/§5). Renders `sweep` from the
// SAME `clara.list_review_queue` envelope needs-you-inbox.tsx already reads
// (lib/firm/use-review-queue.ts's `sweep` field — measured UNUSED anywhere
// in apps/web before this train) — zero extra network calls.
//
// RUNG-0 SCOPE NOTE (recorded, not a silent gap): `get_sweep_run`/
// `acknowledge_sweep_run` both take a run id, and NO door in the live
// catalog gives a human one — the envelope carries only `open_run` (a
// boolean) plus two timestamps, `list_sweep_runs` does not exist, and
// neither `sweep_runs` nor `sweep_run_items` carries a human SELECT policy
// (owner-only; measured 2026-08-28). The acknowledge affordance therefore
// renders as an honest NotBuiltNote naming the gap — the ⌘K "Do" precedent
// (apps/web/AGENTS.md: "a missing backend verb renders honestly... never a
// fake control") — rather than a control this UI cannot correctly wire.

import { useTranslations } from "next-intl";
import { StateBanner } from "@/components/common/state";
import { NotBuiltNote } from "@/components/common/not-built-note";
import { businessDateTime } from "@/lib/business-date";
import type { ReviewQueueSweep } from "@/lib/firm/needs-you";

export function SweepStatusPanel({ sweep }: { sweep: ReviewQueueSweep | null }) {
  const t = useTranslations("CodingQuestionsSignals.sweep");

  if (!sweep) return null;

  return (
    <div className="flex flex-col gap-2">
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
