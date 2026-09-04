"use client";

// The sweep-runs panel — T7 (port-wave plan §4/§5). Renders `sweep` from the
// SAME `clara.list_review_queue` envelope needs-you-inbox.tsx already reads
// (lib/firm/use-review-queue.ts's `sweep` field — measured UNUSED anywhere
// in apps/web before this train) — zero extra network calls.
//
// THE PANEL LEADS WITH A DEFINITION (E-3 / CB-AE2E-026 — the owner: "Sweep run
// 是什么?? Bad UIUX"). Nothing anywhere in messages/en.json said what a sweep IS;
// the panel explained at length why it holds no acknowledge control and never
// named the noun. The definition below is assembled from `clara.sweep_runs`'s
// own columns (0011_daily_loop.sql:674-693 — window_started_at/window_ended_at,
// expected_count, drafted_count, skipped_count, refused_count, state
// open|finalized), not from a description this build invented.
//
// TWO CLAIMS IN THIS FILE WERE FALSE AND ARE NOW CORRECTED (P2 ·
// face-vs-door-payload, the verified sweep of 2026-09-04). The prior header and
// the `acknowledgeHome` copy both told a human to open "Clara's own
// sweep-receipt message in a thread" and acknowledge the run there. **Nothing
// in the runtime or the database ever produces that message.** Censused
// 2026-09-04 across `packages/`: the token `sweep_receipt` appears in exactly
// two places — `packages/runtime/scripts/check-parts-parity.mjs:55` and its own
// test at `packages/runtime/tests/p6-1-parts-parity.test.mjs:37` — both inside
// `LEGACY_PART_KINDS`, which the gate consumes only as `knownPartKinds` (a
// don't-fail-on-this allowlist). No workflow DECLARES it:
// `packages/runtime/workflows/chatTurn.v16.parts.ts:160`'s
// `CHATTURN_V16_PART_KINDS` is `agent_receipt`/`firm_question`/`close_proposal`/
// `freeform_result`. No migration writes it. So the reader exists
// (`components/parts/SweepReceiptCard.tsx`, `lib/parts/types.ts:82`,
// `lib/parts/catalog.ts:108`) and its producer does not — a face with no door
// behind it. The two sibling false claims live at `lib/coding/doors.ts:62-72`
// and `lib/coding/types.ts:186-196`; both are outside this lane's file
// ownership and are named in the PR body rather than edited here.
//
// THE GRANT PICTURE, unchanged and still the reason this panel hosts no control
// of its own: there is no BROWSABLE LIST of sweep runs anywhere — the queue
// envelope carries only `open_run` (a boolean) plus two timestamps,
// `list_sweep_runs` does not exist, and neither `sweep_runs` nor
// `sweep_run_items` carries a human SELECT policy (owner-only; measured
// 2026-08-28). `get_sweep_run`/`acknowledge_sweep_run` are real, callable doors
// FOR A RUN ID — and no run id reaches a person at all. That is what the
// NotBuiltNote below now says, in place of a pointer to a surface nobody can
// reach.

import { useTranslations } from "next-intl";
import { SectionHeader } from "@/components/common/section-header";
import { NotBuiltNote } from "@/components/common/not-built-note";
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
      {/* THE DEFINITION, BEFORE THE STATE. A banner reading "A sweep run is
          currently open" answers a question nobody could ask yet. */}
      <p className="max-w-prose text-sm text-muted-foreground">{t("definition")}</p>
      <StateBanner tone={sweep.open_run ? "info" : "neutral"}>
        {sweep.open_run ? t("openRun") : t("noOpenRun")}
      </StateBanner>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <dt>{t("lastFinalizedLabel")}</dt>
        <dd>{sweep.last_finalized_at ? businessDateTime(sweep.last_finalized_at) : t("never")}</dd>
        <dt>{t("lastAckLabel")}</dt>
        <dd>{sweep.last_ack_at ? businessDateTime(sweep.last_ack_at) : t("never")}</dd>
      </dl>
      {/* A NotBuiltNote AGAIN, and this time the claim is measured rather than
          assumed. P6-2 replaced the original note with a pointer at
          `components/parts/SweepReceiptCard.tsx` on the belief that Clara posts
          a `sweep_receipt` part when a sweep finalizes. Nothing does — see this
          file's header for the census. The reader is built; the producer is
          not, so acknowledging is unreachable and the honest shape is the
          dashed note, naming what is missing. */}
      <NotBuiltNote className="text-xs">{t("acknowledgeNotBuilt")}</NotBuiltNote>
    </div>
  );
}
