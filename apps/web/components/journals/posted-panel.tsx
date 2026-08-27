"use client";

// Posted entries (SCOPE c) — approved journal_entries + the reversal door. LAW 6
// (reverse-not-delete, lib/journals/api.ts's `reverseEntry` header): there is no
// delete affordance here at all, on purpose — a posted entry is corrected only
// by reversing it.
//
// N2 (independent review, "re-check the posted-panel gating against the LIVE
// refusal list"): checked — reverse_entry carries at least four MORE refusal
// paths than this panel's own affordance gate covers (a CLR31 opening-balance
// preflight, a CLR10 open-allocations wall, and staff-advance/adjustment-pair
// walls — full citations in api.ts's `reverseEntry` header). This panel does
// NOT replicate any of them: `!alreadyReversed && !isReversal` gates only the
// THREE conditions that make reversing an entry structurally impossible
// (already reversed, is itself a reversal, or not approved at all — the
// `posted` filter above). Every other refusal is real, expected, and now
// renders verbatim per-row (FIX-2) rather than being guessed at client-side.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState, StateBanner } from "@/components/common/state";
import { Money } from "@/components/journals/money";
import { FormattedDate } from "@/components/journals/formatted-date";
import { EntryStatusBadge } from "@/components/journals/entry-status-badge";
import { sumLines } from "@/lib/journals/balance";
import type { JournalEntryRow, JournalLineRow } from "@/lib/journals/types";
import type { PartClr } from "@/lib/parts/hooks";

export function PostedPanel({
  entries,
  lines,
  linesTruncated,
  busy,
  err,
  clr,
  actingId,
  onReverse,
}: {
  entries: JournalEntryRow[];
  lines: JournalLineRow[];
  /** FIX-1 (independent review): see lib/journals/types.ts's `JournalsData`
   *  header — `lines` may be an INCOMPLETE page of `journal_lines`, and its
   *  sort order (entry_id) has no relation to recency, so truncation can
   *  silently drop lines from ANY posted entry, not only the newest. */
  linesTruncated: boolean;
  busy: boolean;
  err: string | null;
  clr: PartClr;
  /** FIX-2 / N1: which entry's busy/err/clr this render belongs to. */
  actingId: string | null;
  onReverse: (entryId: string, reason: string, onOk: () => void) => void;
}) {
  const t = useTranslations("JournalsWorkbench.posted");
  const posted = entries.filter((e) => e.status === "approved");
  const [reversing, setReversing] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  if (posted.length === 0) {
    return <EmptyState>{t("empty")}</EmptyState>;
  }

  return (
    <div className="flex flex-col gap-2">
      {posted.map((entry) => {
        // FIX-1: a client-side sum, explicitly labeled as such (never rendered
        // as if it were the DB's own figure) — and withheld entirely, never
        // silently wrong, when the line read that feeds it may be incomplete.
        const total = sumLines(lines.filter((l) => l.entry_id === entry.id)).debitCents;
        const alreadyReversed = entry.reversed_by !== null;
        const isReversal = entry.origin === "reversal";
        const isActing = actingId === entry.id;
        return (
          <Card key={entry.id} className="enter-content">
            <CardContent className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <EntryStatusBadge status={entry.status} />
                    <span className="text-sm text-foreground">{entry.memo ?? t("noMemo")}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    <FormattedDate value={entry.posting_date} />
                  </span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-sm font-medium">{linesTruncated ? "—" : <Money cents={total} />}</span>
                  <span className="text-xs text-muted-foreground">
                    {linesTruncated ? t("presentationSumUnavailable") : t("presentationSumLabel")}
                  </span>
                </div>
              </div>
              {alreadyReversed && <p className="text-xs text-muted-foreground">{t("alreadyReversed")}</p>}
              {isReversal && <p className="text-xs text-muted-foreground">{t("isReversal")}</p>}
              {isActing && err && (
                <StateBanner tone="error" code={clr ? clr.code : undefined}>
                  {err}
                </StateBanner>
              )}
              {!alreadyReversed && !isReversal && (
                <div className="flex flex-wrap items-center gap-2">
                  {reversing === entry.id ? (
                    <>
                      <div className="flex flex-col gap-1">
                        <Label htmlFor={`reverse-reason-${entry.id}`} className="sr-only">
                          {t("reasonLabel")}
                        </Label>
                        <Input
                          id={`reverse-reason-${entry.id}`}
                          placeholder={t("reasonPlaceholder")}
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          className="w-64"
                        />
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        disabled={busy || !reason.trim()}
                        onClick={() =>
                          onReverse(entry.id, reason.trim(), () => {
                            // FIX-2 (independent review): close the reason box
                            // ONLY on success — the old code did this
                            // UNCONDITIONALLY, right before the door even
                            // answered, so a CLR10/CLR31/etc. refusal had
                            // nowhere left to render (the `reversing ===
                            // entry.id` guard that gated the error banner was
                            // already false by the time the refusal landed).
                            setReversing(null);
                            setReason("");
                          })
                        }
                      >
                        {t("confirmReverse")}
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => setReversing(null)}>
                        {t("cancel")}
                      </Button>
                    </>
                  ) : (
                    <Button type="button" size="sm" variant="outline" onClick={() => setReversing(entry.id)}>
                      {t("reverse")}
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
