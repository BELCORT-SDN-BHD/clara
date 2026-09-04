"use client";

// "Clara is working" — the live agent-task queue, as a Cursor-style list of THINGS rather than
// a spinner: how many tasks are live, and the three most recent with their kind, status and age.
//
// IT READS `clara.agent_tasks_visible`, NOT `agent_receipts_visible`. The two are routinely
// confused and they are opposites: receipts are an AUDIT TRAIL of what already happened, tasks
// are the live queue of what is happening now (lib/coding/reads.ts's own note). Home wants the
// second. `listCancellableAgentTasks` already floors the read to the five NON-TERMINAL statuses
// (lib/coding/types.ts's `AGENT_TASK_LIVE_STATUSES`), so nothing finished appears here.
//
// NO CANCEL CONTROL, DELIBERATELY. `/activity` owns `cancel_agent_task` and its confirmation
// (components/firm/agent-tasks-panel.tsx). A second cancel button on Home would be the same
// governed verb behind two doors — the tile links to the surface that owns it instead. This is
// the Xero reading of "the linked count list, yes; the inline act, no".
//
// THE COUNT IS THE LIST'S OWN LENGTH, AND THAT IS SOUND HERE. Unlike the needs-you queue, this
// read is UNPAGINATED — `getRows` with no `limit` returns every live task the RLS session can
// see — so `rows.length` IS the population, not a page of it. Stated rather than assumed,
// because the sibling section on this very page must never do the same thing.

import Link from "next/link";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/parts/PartBadge";
import { SectionHeader } from "@/components/common/section-header";
import { businessDateTime } from "@/lib/business-date";
import { listCancellableAgentTasks } from "@/lib/coding/reads";
import type { AgentTaskKind, AgentTaskStatus } from "@/lib/coding/types";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { DataState } from "../data-state";

/** The closed worlds the message catalog holds labels for. A value outside them renders as its
 *  own raw text — the discipline agent-tasks-panel.tsx already uses, never a next-intl key path
 *  and never a cast that hides the gap from tsc. */
const KNOWN_KINDS: readonly AgentTaskKind[] = ["chat_turn", "wake", "autodraft", "close_prep"];
const KNOWN_STATUSES: readonly AgentTaskStatus[] = [
  "queued", "held", "running", "awaiting_input", "cancel_requested", "completed", "failed", "cancelled", "expired",
];

/** How many rows the tile shows. The COUNT above it is always the full population — this caps
 *  only what is printed, and the footer link goes to the surface that lists them all. */
const PREVIEW_ROWS = 3;

export function ClaraWorkingTile() {
  const t = useTranslations("FirmHome");
  const ta = useTranslations("CodingQuestionsSignals.agentTasks");
  const tasks = useAsyncRead(() => listCancellableAgentTasks({ session: sessionTokenAccessor }));

  const rows = tasks.data ?? [];
  // The read orders `created_at.asc` (oldest first), so the MOST RECENT rows are its tail.
  const preview = rows.slice(-PREVIEW_ROWS).reverse();
  const kindLabel = (kind: string) => ((KNOWN_KINDS as readonly string[]).includes(kind) ? ta(`kinds.${kind}`) : kind);
  const statusLabel = (status: string) =>
    (KNOWN_STATUSES as readonly string[]).includes(status) ? ta(`statuses.${status}`) : status;

  return (
    <section aria-labelledby="firm-home-clara-working" className="flex flex-col gap-2">
      <SectionHeader level={2}>
        <span id="firm-home-clara-working">{t("claraWorkingHeading")}</span>
      </SectionHeader>
      <DataState
        loading={tasks.loading}
        error={tasks.error}
        isEmpty={rows.length === 0}
        emptyMessage={t("claraWorkingEmpty")}
      >
        <div className="enter-content flex flex-col gap-2">
          <Badge tone="info">{t("claraWorkingCount", { count: rows.length })}</Badge>
          <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
            {preview.map((task) => (
              <li key={task.id}>
                <span className="text-card-foreground">{kindLabel(task.kind)}</span>
                {" · "}
                {statusLabel(task.status)}
                {" · "}
                {businessDateTime(task.created_at)}
              </li>
            ))}
          </ul>
          <Link href="/activity" className="text-xs text-primary underline-offset-4 hover:underline">
            {t("seeAgentActivity")}
          </Link>
        </div>
      </DataState>
    </section>
  );
}
