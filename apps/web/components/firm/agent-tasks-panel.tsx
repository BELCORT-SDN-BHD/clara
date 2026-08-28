"use client";

// The cancel_agent_task panel — T7 (port-wave plan §4/§5: "cancel_agent_task
// belongs on the activity/receipts feed... it is a control over a running
// agent task, and the receipts feed is where a human sees one"). Reads
// `clara.agent_tasks_visible` (the LIVE task queue) — a DIFFERENT relation
// from FirmActivityFeed's own `agent_receipts_visible` (an audit trail of
// what already happened); this panel is what is RUNNING right now, that one
// is what already finished. Same per-row error attribution as
// documents/uncoded-filings-list.tsx's own header (N13/R1).

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useHydratedPart } from "@/lib/parts/hooks";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { listCancellableAgentTasks } from "@/lib/coding/reads";
import { cancelAgentTask } from "@/lib/coding/doors";
import { SectionHeader } from "@/components/common/section-header";
import { DataState, ErrorMessage } from "./data-state";
import { Badge } from "@/components/parts/PartBadge";
import { CodingDoorDialog } from "@/components/documents/CodingDoorDialog";

export function AgentTasksPanel() {
  const t = useTranslations("CodingQuestionsSignals.agentTasks");
  const { data, loading, busy, err, act } = useHydratedPart(
    sessionTokenAccessor,
    () => listCancellableAgentTasks({ session: sessionTokenAccessor }),
  );
  const [actingId, setActingId] = useState<string | null>(null);
  const rows = data ?? [];

  return (
    <div className="flex flex-col gap-2">
      <SectionHeader level={2}>{t("heading")}</SectionHeader>
      <p className="max-w-prose text-xs text-muted-foreground">{t("note")}</p>
      <DataState loading={loading && !data} error={data ? null : err} isEmpty={rows.length === 0} emptyMessage={t("empty")}>
        <ul className="flex flex-col gap-2">
          {rows.map((task) => (
            <li key={task.id} className="enter-content flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="neutral">{t(`kinds.${task.kind}`)}</Badge>
                <Badge tone="info">{t(`statuses.${task.status}`)}</Badge>
                <span className="text-xs text-muted-foreground">{task.created_at.slice(0, 16).replace("T", " ")}</span>
              </div>
              {actingId === task.id && err ? <ErrorMessage error={err} /> : null}
              <CodingDoorDialog
                triggerLabel={t("cancelTrigger")}
                triggerVariant="destructive"
                title={t("cancelTitle")}
                description={t("cancelDescription")}
                confirmLabel={t("cancelConfirm")}
                busy={busy}
                onConfirm={() => {
                  setActingId(task.id);
                  return act(async () => { await cancelAgentTask(task.id, { session: sessionTokenAccessor }); });
                }}
              />
            </li>
          ))}
        </ul>
      </DataState>
    </div>
  );
}
