"use client";

// Posted entries (SCOPE c) — approved journal_entries + the reversal door. LAW 6
// (reverse-not-delete, lib/journals/api.ts's `reverseEntry` header): there is no
// delete affordance here at all, on purpose — a posted entry is corrected only
// by reversing it.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCents, sumLines } from "@/lib/journals/balance";
import type { JournalEntryRow, JournalLineRow } from "@/lib/journals/types";
import type { PartClr } from "@/lib/parts/hooks";

export function PostedPanel({
  entries,
  lines,
  busy,
  err,
  clr,
  onReverse,
}: {
  entries: JournalEntryRow[];
  lines: JournalLineRow[];
  busy: boolean;
  err: string | null;
  clr: PartClr;
  onReverse: (entryId: string, reason: string) => void;
}) {
  const t = useTranslations("JournalsWorkbench.posted");
  const posted = entries.filter((e) => e.status === "approved");
  const [reversing, setReversing] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  if (posted.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("empty")}</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {posted.map((entry) => {
        const total = sumLines(lines.filter((l) => l.entry_id === entry.id)).debitCents;
        const alreadyReversed = entry.reversed_by !== null;
        const isReversal = entry.origin === "reversal";
        return (
          <Card key={entry.id}>
            <CardContent className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-col">
                  <span className="text-sm text-foreground">{entry.memo ?? t("noMemo")}</span>
                  <span className="text-xs text-muted-foreground">{entry.posting_date}</span>
                </div>
                <span className="text-sm font-medium">{formatCents(total)}</span>
              </div>
              {alreadyReversed && <p className="text-xs text-muted-foreground">{t("alreadyReversed")}</p>}
              {isReversal && <p className="text-xs text-muted-foreground">{t("isReversal")}</p>}
              {(clr || err) && reversing === entry.id && (
                <p role="alert" className="text-sm text-destructive">
                  {clr ? `${clr.code}: ${err}` : err}
                </p>
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
                        onClick={() => {
                          onReverse(entry.id, reason.trim());
                          setReversing(null);
                          setReason("");
                        }}
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
