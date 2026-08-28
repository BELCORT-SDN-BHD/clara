"use client";

// The coding-lane surface's own "uncoded filings" list — T7 (port-wave plan
// §4/§5, §13 Mobbin grounding). Grouped by the filing's OWN live-computed
// lane (ready/needs_review/needs_you) via SectionTabs — Mobbin T7 takeaway 1:
// "the grouped-column idea transfers, the drag mechanic does not" (a lane
// move is `open_coding_task`, never a client-side reassignment). One row per
// filing, a real `<table>`, per-row inline actions — never a bulk bar
// (takeaway 2).

import { useState } from "react";
import { useTranslations } from "next-intl";
import { SectionTabs } from "@/components/common/section-tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/parts/PartBadge";
import { EmptyState } from "@/components/common/state";
import { CodingActionRefusal } from "./coding-action-refusal";
import { isActingRowPresent } from "@/lib/firm/needs-you-gaps";
import { businessDate } from "@/lib/business-date";
import { CODING_LANE_REASON_CODES, type CodingLane } from "@/lib/coding/types";
import type { UncodedFilingEntry } from "@/lib/coding/loaders";
import { UncodedFilingActions } from "./uncoded-filing-actions";
import type { PartClr } from "@/lib/parts/hooks";

const LANES: CodingLane[] = ["needs_you", "needs_review", "ready"];

function reasonLabel(t: (key: string, params?: Record<string, string>) => string, code: string): string {
  return (CODING_LANE_REASON_CODES as readonly string[]).includes(code)
    ? t(`reasons.${code}`)
    : t("reasons.unknown", { code });
}

export function UncodedFilingsList({
  entries, busy, error, clr, act,
}: {
  entries: UncodedFilingEntry[];
  busy: boolean;
  /** The section's own last-act error — attached ONLY to the row that caused
   *  it (`actingId` below), the same per-row attribution needs-you-inbox.tsx
   *  uses (N13/R1): a shared error rendered on every row would misattribute
   *  one filing's refusal to every other filing shown in the same lane. */
  error: string | null;
  clr: PartClr;
  act: (fn: () => Promise<void>) => Promise<unknown>;
}) {
  const t = useTranslations("CodingQuestionsSignals.uncodedFiling");
  const [lane, setLane] = useState<CodingLane>("needs_you");
  const [actingId, setActingId] = useState<string | null>(null);

  const shown = entries.filter((e) => e.lane === lane);
  // F2, independent review: the commonest refusal on a settle-style door is
  // "someone else already acted on it", which makes the row VANISH from the
  // very re-read `act()` triggers — the per-row attachment below then goes
  // dark for exactly that case. `isActingRowPresent` (the R1 fix, reused
  // verbatim from lib/firm/needs-you-gaps.ts rather than a second copy)
  // decides whether a persistent SECTION-level banner is owed instead.
  const rowVanished = actingId !== null && Boolean(error) && !isActingRowPresent(entries.map((e) => ({ id: e.filing_id })), actingId);

  return (
    <div className="flex flex-col gap-2">
      {rowVanished ? <CodingActionRefusal err={error} clr={clr} /> : null}
      <SectionTabs
        label={t("lanesLabel")}
        value={lane}
        onSelect={setLane}
        items={LANES.map((l) => ({ value: l, label: `${t(`lanes.${l}`)} (${entries.filter((e) => e.lane === l).length})` }))}
      />
      {shown.length === 0 ? (
        <EmptyState>{t("laneEmpty")}</EmptyState>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("columnDocument")}</TableHead>
              <TableHead>{t("columnFiled")}</TableHead>
              <TableHead>{t("columnReasons")}</TableHead>
              <TableHead>{t("columnActions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((entry) => (
              <TableRow key={entry.filing_id}>
                <TableCell className="whitespace-normal">{entry.original_filename ?? entry.document_kind ?? entry.document_id}</TableCell>
                {/* F4, independent review: `businessDate` (Asia/Kuala_Lumpur),
                    never a raw UTC slice — see lib/business-date.ts's own
                    header on the "two days" hazard this fixes. */}
                <TableCell>{businessDate(new Date(entry.filed_at))}</TableCell>
                <TableCell className="whitespace-normal">
                  <div className="flex flex-wrap gap-1">
                    {entry.reasons.length === 0 ? (
                      <span className="text-xs text-muted-foreground">{t("noReasons")}</span>
                    ) : (
                      entry.reasons.map((r) => (
                        <Badge key={r} tone={r === "high_stakes" || r === "vendor_ambiguous" ? "warning" : "neutral"}>
                          {reasonLabel(t, r)}
                        </Badge>
                      ))
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-2">
                    {actingId === entry.filing_id && !rowVanished ? <CodingActionRefusal err={error} clr={clr} /> : null}
                    <UncodedFilingActions
                      clientId={entry.client_id}
                      documentId={entry.document_id}
                      filingId={entry.filing_id}
                      busy={busy}
                      act={(fn) => { setActingId(entry.filing_id); return act(fn); }}
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
