"use client";

// The coding-lane surface's own "open coding tasks" list — T7. Same per-row
// error attribution as uncoded-filings-list.tsx's own header (N13/R1).

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/common/state";
import type { CodingTaskRow } from "@/lib/coding/types";
import { CodingTaskActions } from "./coding-task-actions";

export function CodingTasksSection({
  tasks, busy, error, act,
}: {
  tasks: CodingTaskRow[];
  busy: boolean;
  error: unknown;
  act: (fn: () => Promise<void>) => Promise<unknown>;
}) {
  const t = useTranslations("CodingQuestionsSignals.codingTask");
  const [actingId, setActingId] = useState<string | null>(null);

  if (tasks.length === 0) return <EmptyState>{t("empty")}</EmptyState>;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("columnOpened")}</TableHead>
          <TableHead>{t("columnOrigin")}</TableHead>
          <TableHead>{t("columnActions")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {tasks.map((task) => (
          <TableRow key={task.id}>
            <TableCell>{task.created_at.slice(0, 10)}</TableCell>
            <TableCell>{t(`origin.${task.origin}`)}</TableCell>
            <TableCell>
              <CodingTaskActions
                taskId={task.id}
                filingId={task.filing_id}
                busy={busy}
                error={actingId === task.id ? error : null}
                act={(fn) => { setActingId(task.id); return act(fn); }}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
