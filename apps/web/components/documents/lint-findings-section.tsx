"use client";

// The coding-lane surface's own "open lint findings" list — T7. Same per-row
// error attribution as uncoded-filings-list.tsx's own header (N13/R1).

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/parts/PartBadge";
import { EmptyState } from "@/components/common/state";
import { LINT_FINDING_KINDS, type LintFindingRow } from "@/lib/coding/types";
import { LintFindingActions } from "./lint-finding-actions";

function kindLabel(t: (key: string) => string, kind: string): string {
  return (LINT_FINDING_KINDS as readonly string[]).includes(kind) ? t(`kinds.${kind}`) : kind;
}

export function LintFindingsSection({
  findings, busy, error, act,
}: {
  findings: LintFindingRow[];
  busy: boolean;
  error: unknown;
  act: (fn: () => Promise<void>) => Promise<unknown>;
}) {
  const t = useTranslations("CodingQuestionsSignals.lintFinding");
  const [actingId, setActingId] = useState<string | null>(null);

  if (findings.length === 0) return <EmptyState>{t("empty")}</EmptyState>;

  return (
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
            <TableCell>{finding.opened_at.slice(0, 10)}</TableCell>
            <TableCell>
              <LintFindingActions
                findingId={finding.id}
                busy={busy}
                error={actingId === finding.id ? error : null}
                act={(fn) => { setActingId(finding.id); return act(fn); }}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
