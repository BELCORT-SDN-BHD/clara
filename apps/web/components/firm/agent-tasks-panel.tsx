"use client";

// The cancel_agent_task panel — T7 (port-wave plan §4/§5: "cancel_agent_task
// belongs on the activity/receipts feed... it is a control over a running
// agent task, and the receipts feed is where a human sees one"). Reads
// `clara.agent_tasks_visible` (the LIVE task queue) — a DIFFERENT relation
// from FirmActivityFeed's own `agent_receipts_visible` (an audit trail of
// what already happened); this panel is what is RUNNING right now, that one
// is what already finished. Same per-row error attribution as
// documents/uncoded-filings-list.tsx's own header (N13/R1), and the same
// section-level row-vanish banner (F2, independent review).
//
// F1, independent review: `DataState`'s own error branch renders via the
// typed-exception `ErrorMessage`, which never matches a plain
// `useHydratedPart` `err` STRING — this panel branches loading/error/data
// explicitly, the same shape coding-lane-panel.tsx's own fix uses, so the
// real error renders via `ActionRefusal` (CLR code + tone ladder intact).
//
// F6, independent review: the read includes `cancel_requested`
// (lib/coding/reads.ts's `AGENT_TASK_LIVE_STATUSES`) — a running task's
// cancel is only a REQUEST, so the row must stay visible, labeled
// accordingly, with no cancel control (AGENT_TASK_CANCELLABLE_STATUSES is
// the closed set that actually gates the control).

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useHydratedPart } from "@/lib/parts/hooks";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { listCancellableAgentTasks } from "@/lib/coding/reads";
import { cancelAgentTask } from "@/lib/coding/doors";
import { AGENT_TASK_CANCELLABLE_STATUSES, type AgentTaskKind, type AgentTaskStatus } from "@/lib/coding/types";
import { isActingRowPresent } from "@/lib/firm/needs-you-gaps";
import { businessDateTime } from "@/lib/business-date";
import { SectionHeader } from "@/components/common/section-header";
import { EmptyState, LoadingState } from "@/components/common/state";
import { ActionRefusal } from "@/components/bank/action-refusal";
import { Badge } from "@/components/parts/PartBadge";
import { CodingDoorDialog } from "@/components/documents/CodingDoorDialog";

const KNOWN_KINDS: readonly AgentTaskKind[] = ["chat_turn", "wake", "autodraft", "close_prep"];
const KNOWN_STATUSES: readonly AgentTaskStatus[] = [
  "queued", "held", "running", "awaiting_input", "cancel_requested", "completed", "failed", "cancelled", "expired",
];

export function AgentTasksPanel() {
  const t = useTranslations("CodingQuestionsSignals.agentTasks");
  const { data, loading, busy, err, clr, act } = useHydratedPart(
    sessionTokenAccessor,
    () => listCancellableAgentTasks({ session: sessionTokenAccessor }),
  );
  const [actingId, setActingId] = useState<string | null>(null);
  const rows = data ?? [];

  // F13, independent review: a checked lookup, not a raw `t()` cast — the
  // same discipline uncoded-filings-list.tsx's `reasonLabel` already uses.
  // Falls back to the raw value, honest, never a next-intl key path.
  const kindLabel = (kind: string) => (KNOWN_KINDS as readonly string[]).includes(kind) ? t(`kinds.${kind}`) : kind;
  const statusLabel = (status: string) => (KNOWN_STATUSES as readonly string[]).includes(status) ? t(`statuses.${status}`) : status;

  // F2: the SAME section-level row-vanish banner as the coding-lane sections.
  const rowVanished = actingId !== null && Boolean(err) && !isActingRowPresent(rows, actingId);

  return (
    <div className="flex flex-col gap-2">
      <SectionHeader level={2}>{t("heading")}</SectionHeader>
      <p className="max-w-prose text-xs text-muted-foreground">{t("note")}</p>
      {loading && !data ? (
        <LoadingState>{t("loading")}</LoadingState>
      ) : !data && err ? (
        <ActionRefusal err={err} clr={clr} />
      ) : rows.length === 0 ? (
        <EmptyState>{t("empty")}</EmptyState>
      ) : (
        <>
          {rowVanished ? <ActionRefusal err={err} clr={clr} /> : null}
          <ul className="flex flex-col gap-2">
            {rows.map((task) => (
              <li key={task.id} className="enter-content flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="neutral">{kindLabel(task.kind)}</Badge>
                  <Badge tone="info">{statusLabel(task.status)}</Badge>
                  {/* F4, independent review: `businessDateTime`, never a raw
                      UTC slice. */}
                  <span className="text-xs text-muted-foreground">{businessDateTime(task.created_at)}</span>
                </div>
                {actingId === task.id && !rowVanished && err ? <ActionRefusal err={err} clr={clr} /> : null}
                {AGENT_TASK_CANCELLABLE_STATUSES.has(task.status) ? (
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
                ) : (
                  <p className="text-xs text-muted-foreground">{t("cancelRequestedNote")}</p>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
