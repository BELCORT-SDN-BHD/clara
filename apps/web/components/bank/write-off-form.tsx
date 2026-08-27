"use client";

// The write-off sub-form (split out of exceptions-section.tsx, file-size
// discipline): resolve_and_book_bank_line's HAND-DRAFT leg only, disposition
// fixed to written_off_adjustment (a manual dr/cr entry — e.g. debit a
// write-off expense account, credit the bank's own COA account). The
// settlement/open-item leg (matched_booking) is the named gap, see
// exceptions-section.tsx's own NotBuilt note.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { resolveAndBookBankLine } from "@/lib/bank/exception-doors";
import { parseAmountToCents } from "@/lib/bank/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type DraftLine = { accountCode: string; debit: string; credit: string };

export function WriteOffForm({ clientId, exceptionId, onDone }: { clientId: string; exceptionId: string; onDone: () => void }) {
  const t = useTranslations("ClientBank.exceptions");
  const tc = useTranslations("ClientBank.common");
  const [postingDate, setPostingDate] = useState("");
  const [memo, setMemo] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([
    { accountCode: "", debit: "", credit: "" },
    { accountCode: "", debit: "", credit: "" },
  ]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function updateLine(i: number, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  async function submit() {
    setErr(null);
    const draftLines = [];
    for (const l of lines) {
      if (!l.accountCode) continue;
      const debit = l.debit ? parseAmountToCents(l.debit) : 0;
      const credit = l.credit ? parseAmountToCents(l.credit) : 0;
      if (debit === null || credit === null) {
        setErr(t("writeOffInvalidAmount"));
        return;
      }
      draftLines.push({ account_code: l.accountCode, debit_cents: debit, credit_cents: credit });
    }
    if (draftLines.length < 2 || !postingDate || !memo.trim() || !note.trim()) {
      setErr(t("writeOffIncomplete"));
      return;
    }
    setBusy(true);
    try {
      await resolveAndBookBankLine(
        { clientId, exceptionId, disposition: "written_off_adjustment", note, draft: { posting_date: postingDate, memo, lines: draftLines } },
        { session: sessionTokenAccessor },
      );
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-2">
      <div className="grid grid-cols-2 gap-2">
        <div className="grid gap-1.5">
          <Label htmlFor={`wo-date-${exceptionId}`}>{t("postingDateLabel")}</Label>
          <Input id={`wo-date-${exceptionId}`} type="date" value={postingDate} onChange={(e) => setPostingDate(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`wo-memo-${exceptionId}`}>{t("memoLabel")}</Label>
          <Input id={`wo-memo-${exceptionId}`} value={memo} onChange={(e) => setMemo(e.target.value)} />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <Label>{t("draftLinesLabel")}</Label>
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-3 gap-2">
            <Input aria-label={t("accountCodeLabel", { n: i + 1 })} placeholder={t("accountCodeLabel", { n: i + 1 })} value={l.accountCode} onChange={(e) => updateLine(i, { accountCode: e.target.value })} />
            <Input aria-label={t("debitLabel", { n: i + 1 })} inputMode="decimal" placeholder={t("debitLabel", { n: i + 1 })} value={l.debit} onChange={(e) => updateLine(i, { debit: e.target.value })} />
            <Input aria-label={t("creditLabel", { n: i + 1 })} inputMode="decimal" placeholder={t("creditLabel", { n: i + 1 })} value={l.credit} onChange={(e) => updateLine(i, { credit: e.target.value })} />
          </div>
        ))}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`wo-note-${exceptionId}`}>{t("noteLabel")}</Label>
        <Textarea id={`wo-note-${exceptionId}`} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      {err && <p role="alert" className="text-xs text-destructive">{err}</p>}
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={busy} onClick={() => void submit()}>{busy ? t("writeOffBusy") : t("writeOffSubmit")}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>{tc("cancel")}</Button>
      </div>
    </div>
  );
}
