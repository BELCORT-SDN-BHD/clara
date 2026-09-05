"use client";

// The coding-lane surface's own "open coding tasks" list — T7. Same per-row
// error attribution as uncoded-filings-list.tsx's own header (N13/R1), and
// the same section-level row-vanish banner (F2, independent review).
//
// R1, independent review: the banner used to be computed AFTER an early
// `if (tasks.length === 0) return <EmptyState>` — when the acted-on row was
// the ONLY row (the common case), that return fired before the banner logic
// ever ran, so the refusal was unreachable. The banner now renders
// unconditionally at the top of ONE returned tree, with the empty state and
// the table as siblings inside it — uncoded-filings-list.tsx's own shape,
// which never had this bug.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/common/state";
import { CodingActionRefusal } from "./coding-action-refusal";
import { isActingRowPresent } from "@/lib/firm/needs-you-gaps";
import { businessDate } from "@/lib/business-date";
import type { CodingTaskRow } from "@/lib/coding/types";
import { CodingTaskActions } from "./coding-task-actions";
import type { PartClr } from "@/lib/parts/hooks";

export function CodingTasksSection({
  tasks, busy, error, clr, act,
}: {
  tasks: CodingTaskRow[];
  busy: boolean;
  error: string | null;
  clr: PartClr;
  act: (fn: () => Promise<void>) => Promise<boolean>;
}) {
  const t = useTranslations("CodingQuestionsSignals.codingTask");
  const [actingId, setActingId] = useState<string | null>(null);

  const rowVanished = actingId !== null && Boolean(error) && !isActingRowPresent(tasks, actingId);

  return (
    <div className="flex flex-col gap-2">
      {rowVanished ? <CodingActionRefusal err={error} clr={clr} /> : null}
      {tasks.length === 0 ? (
        <EmptyState>{t("empty")}</EmptyState>
      ) : (
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
                {/* F4, independent review: `businessDate`, never a raw UTC slice. */}
                <TableCell>{businessDate(new Date(task.created_at))}</TableCell>
                <TableCell>{t(`origin.${task.origin}`)}</TableCell>
                <TableCell>
                  <div className="flex flex-col gap-2">
                    {actingId === task.id && !rowVanished ? <CodingActionRefusal err={error} clr={clr} /> : null}
                    <CodingTaskActions
                      taskId={task.id}
                      filingId={task.filing_id}
                      busy={busy}
                      act={(fn) => { setActingId(task.id); return act(fn); }}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
