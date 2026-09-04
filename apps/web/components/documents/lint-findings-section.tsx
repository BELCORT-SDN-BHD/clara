"use client";

// The coding-lane surface's own "open lint findings" list — T7. Same per-row
// error attribution as uncoded-filings-list.tsx's own header (N13/R1), and
// the same section-level row-vanish banner (F2, independent review).
//
// R1, independent review: same fix as coding-tasks-section.tsx's own header
// — the banner is now computed and rendered unconditionally at the top of
// ONE returned tree, never behind an early empty-state return.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/parts/PartBadge";
import { EmptyState } from "@/components/common/state";
import { CodingActionRefusal } from "./coding-action-refusal";
import { isActingRowPresent } from "@/lib/firm/needs-you-gaps";
import { businessDate } from "@/lib/business-date";
import { LINT_FINDING_KINDS, type LintFindingRow } from "@/lib/coding/types";
import { LintFindingActions } from "./lint-finding-actions";
import type { PartClr } from "@/lib/parts/hooks";

function kindLabel(t: (key: string) => string, kind: string): string {
  return (LINT_FINDING_KINDS as readonly string[]).includes(kind) ? t(`kinds.${kind}`) : kind;
}

export function LintFindingsSection({
  findings, busy, error, clr, act,
}: {
  findings: LintFindingRow[];
  busy: boolean;
  error: string | null;
  clr: PartClr;
  act: (fn: () => Promise<void>) => Promise<boolean>;
}) {
  const t = useTranslations("CodingQuestionsSignals.lintFinding");
  const [actingId, setActingId] = useState<string | null>(null);

  const rowVanished = actingId !== null && Boolean(error) && !isActingRowPresent(findings, actingId);

  return (
    <div className="flex flex-col gap-2">
      {rowVanished ? <CodingActionRefusal err={error} clr={clr} /> : null}
      {findings.length === 0 ? (
        <EmptyState>{t("empty")}</EmptyState>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("columnKind")}</TableHead>
              <TableHead>{t("columnSeverity")}</TableHead>
              <TableHead>{t("columnOpened")}</TableHead>
              <TableHead>{t("columnActions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {findings.map((finding) => (
              <TableRow key={finding.id}>
                <TableCell className="whitespace-normal">{kindLabel(t, finding.finding_kind)}</TableCell>
                <TableCell>
                  <Badge tone={finding.severity === "critical" ? "error" : finding.severity === "warn" ? "warning" : "neutral"}>
                    {t(`severities.${finding.severity}`)}
                  </Badge>
                </TableCell>
                {/* F4, independent review: `businessDate`, never a raw UTC slice. */}
                <TableCell>{businessDate(new Date(finding.opened_at))}</TableCell>
                <TableCell>
                  <div className="flex flex-col gap-2">
                    {actingId === finding.id && !rowVanished ? <CodingActionRefusal err={error} clr={clr} /> : null}
                    <LintFindingActions
                      findingId={finding.id}
                      busy={busy}
                      act={(fn) => { setActingId(finding.id); return act(fn); }}
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
