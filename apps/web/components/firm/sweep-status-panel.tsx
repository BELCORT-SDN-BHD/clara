"use client";

// The sweep-runs panel — T7 (port-wave plan §4/§5). Renders `sweep` from the
// SAME `clara.list_review_queue` envelope needs-you-inbox.tsx already reads
// (lib/firm/use-review-queue.ts's `sweep` field — measured UNUSED anywhere
// in apps/web before this train) — zero extra network calls.
//
// RUNG-0 SCOPE NOTE — 裁-20 IS NOW DISCHARGED (P6-2, 2026-08-30). This block
// used to say the upgrade below was OWED; it has SHIPPED, and a comment that
// still claimed otherwise would be exactly the stale-not-built class the note
// was written to avoid.
//
// THE GRANT PICTURE HAS NOT CHANGED, and it is still the whole reason this
// panel hosts no acknowledge control of its own: there is no BROWSABLE LIST of
// sweep runs anywhere — the queue envelope carries only `open_run` (a boolean)
// plus two timestamps, `list_sweep_runs` does not exist, and neither
// `sweep_runs` nor `sweep_run_items` carries a human SELECT policy (owner-only;
// measured 2026-08-28). A run id reaches a human through exactly one channel:
// Clara posts a `sweep_receipt` part (`lib/parts/types.ts`'s
// `SweepReceiptPart`) into the thread carrying its own `run_id` when a sweep
// finalizes, and `get_sweep_run`/`acknowledge_sweep_run` are real, callable
// doors FOR THAT id.
//
// WHAT CHANGED: that part no longer renders as a generic id-only summary card
// (it left PartRenderer.tsx's `SUMMARY_TYPES` bucket, which is now nine members
// rather than ten). `components/parts/SweepReceiptCard.tsx` hydrates
// `get_sweep_run` on mount and offers the audited bookkeeper+
// `acknowledge_sweep_run` on a FINALIZED run — precisely what 裁-20
// (docs/plan/active/mohe-grill-rulings-2026-08-28.md:268-272) ruled should land
// inside the P6 wire bump, with no separate train. This queue-altitude panel
// still renders the ONE thing it genuinely has (the envelope's own state), and
// now points at a control that EXISTS.

import { useTranslations } from "next-intl";
import { SectionHeader } from "@/components/common/section-header";
import { StateBanner } from "@/components/common/state";
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
      {/* NOT a NotBuiltNote any more (P6-2): the acknowledge control EXISTS —
          it lives on Clara's own sweep-receipt card, which is the only surface
          that ever holds a run id. A NotBuiltNote here would now be a false
          claim, and the P6-X exit gate sweeps every note whose lane has
          merged. This is a plain pointer to where the control lives. */}
      <p className="text-xs text-muted-foreground">{t("acknowledgeHome")}</p>
    </div>
  );
}
