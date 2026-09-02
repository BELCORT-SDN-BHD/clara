"use client";

// The write-off sub-form (split out of exceptions-section.tsx, file-size
// discipline): resolve_and_book_bank_line's HAND-DRAFT leg only, disposition
// fixed to written_off_adjustment (a manual dr/cr entry — e.g. debit a
// write-off expense account, credit the bank's own COA account). The
// settlement/open-item leg (matched_booking) is the named gap, see
// exceptions-section.tsx's own NotBuilt note.
//
// N8 fix (independent review): this form used to run its own bespoke
// try/catch/busy/err — a SECOND, drifting write mechanism beside every
// other door call in this build, which all go through lib/parts/hooks.ts's
// useHydratedPart (mount/act/sticky-refusal, hooks.ts's own CONSUMER
// CONTRACT). Now on the SAME seam: `action`'s loader is a genuine no-op (a
// write-off form reads nothing of its own), used only for its act()/busy/
// err/clr — the SAME mechanism every read+write part in this build shares,
// never a parallel one. `err`/`clr` render through <ActionRefusal>, which
// shows the CLR code beside the message (a plain string never could).

import { useState } from "react";
import { useTranslations } from "next-intl";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { useHydratedPart } from "@/lib/parts/hooks";
import { resolveAndBookBankLine } from "@/lib/bank/exception-doors";
import { MoneyInput } from "@/components/common/money-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StateBanner } from "@/components/common/state";
import { ActionRefusal } from "./action-refusal";

type DraftLine = {
  accountCode: string;
  debitCents: number | null;
  debitValid: boolean;
  creditCents: number | null;
  creditValid: boolean;
};

const EMPTY_DRAFT_LINE: DraftLine = {
  accountCode: "",
  debitCents: null,
  debitValid: true,
  creditCents: null,
  creditValid: true,
};

export function WriteOffForm({ clientId, exceptionId, onDone }: { clientId: string; exceptionId: string; onDone: () => void }) {
  const t = useTranslations("ClientBank.exceptions");
  const tc = useTranslations("ClientBank.common");
  const [postingDate, setPostingDate] = useState("");
  const [memo, setMemo] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([
    { ...EMPTY_DRAFT_LINE },
    { ...EMPTY_DRAFT_LINE },
  ]);
  const [formError, setFormError] = useState<string | null>(null);

  // A pure no-op loader — this form has nothing of its own to read; it
  // exists on this hook only for act()/busy/err/clr (see header).
  const action = useHydratedPart<null>(sessionTokenAccessor, () => Promise.resolve(null));

  function updateLine(i: number, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  async function submit() {
    setFormError(null);
    const draftLines: { account_code: string; debit_cents: number; credit_cents: number }[] = [];
    for (const l of lines) {
      if (!l.accountCode) continue;
      if (!l.debitValid || !l.creditValid) {
        setFormError(t("writeOffInvalidAmount"));
        return;
      }
      draftLines.push({
        account_code: l.accountCode,
        debit_cents: l.debitCents ?? 0,
        credit_cents: l.creditCents ?? 0,
      });
    }
    if (draftLines.length < 2 || !postingDate || !memo.trim() || !note.trim()) {
      setFormError(t("writeOffIncomplete"));
      return;
    }
    await action.act(async () => {
      await resolveAndBookBankLine(
        { clientId, exceptionId, disposition: "written_off_adjustment", note, draft: { posting_date: postingDate, memo, lines: draftLines } },
        { session: sessionTokenAccessor },
      );
    }, onDone);
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/50 p-3">
      <div className="grid gap-2 sm:grid-cols-2">
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
          <div key={i} className="grid gap-2 sm:grid-cols-3">
            <Input id={`wo-account-${exceptionId}-${i + 1}`} aria-label={t("accountCodeLabel", { n: i + 1 })} placeholder={t("accountCodeLabel", { n: i + 1 })} value={l.accountCode} onChange={(e) => updateLine(i, { accountCode: e.target.value })} />
            <MoneyInput
              id={`wo-debit-${exceptionId}-${i + 1}`}
              mode="signed"
              aria-label={t("debitLabel", { n: i + 1 })}
              placeholder={t("debitLabel", { n: i + 1 })}
              cents={l.debitCents}
              onValueChange={(change) => updateLine(i, {
                debitValid: change.ok,
                ...(change.ok ? { debitCents: change.cents } : {}),
              })}
            />
            <MoneyInput
              id={`wo-credit-${exceptionId}-${i + 1}`}
              mode="signed"
              aria-label={t("creditLabel", { n: i + 1 })}
              placeholder={t("creditLabel", { n: i + 1 })}
              cents={l.creditCents}
              onValueChange={(change) => updateLine(i, {
                creditValid: change.ok,
                ...(change.ok ? { creditCents: change.cents } : {}),
              })}
            />
          </div>
        ))}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`wo-note-${exceptionId}`}>{t("noteLabel")}</Label>
        <Textarea id={`wo-note-${exceptionId}`} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      {formError && <StateBanner tone="error" className="text-xs">{formError}</StateBanner>}
      <ActionRefusal err={action.err} clr={action.clr} />
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={action.busy} onClick={() => void submit()}>{action.busy ? t("writeOffBusy") : t("writeOffSubmit")}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>{tc("cancel")}</Button>
      </div>
    </div>
  );
}
