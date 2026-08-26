"use client";

// Manual JE compose (SCOPE d) — the real two-call ceremony
// (record_client_resolution -> draft_entry), see lib/journals/api.ts's
// `composeManualEntry` header for the grounding. Rendered ONLY because that
// real verb pair exists; if it did not, this dialog would not exist and the
// affordance would say so instead (mission's honest-not-built rule).

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EntryLinesEditor } from "@/components/journals/entry-lines-editor";
import type { CoaAccountRow, EntryLineInput } from "@/lib/journals/types";
import type { PartClr } from "@/lib/parts/hooks";

export function ComposeDialog({
  open,
  onOpenChange,
  accounts,
  busy,
  err,
  clr,
  onSubmit,
}: {
  /** CONTROLLED from the parent — the parent closes this on a successful
   *  compose via `act()`'s own `onOk` callback (fires before hydrate-never-
   *  trust's follow-up reload, not after some guessed timing); a failed
   *  submit leaves `open` untouched so the refusal renders in place. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: CoaAccountRow[];
  busy: boolean;
  err: string | null;
  clr: PartClr;
  onSubmit: (input: { postingDate: string; memo: string; lines: EntryLineInput[] }) => void;
}) {
  const t = useTranslations("JournalsWorkbench.compose");
  const [postingDate, setPostingDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [memo, setMemo] = useState("");
  const [lines, setLines] = useState<EntryLineInput[]>([
    { account_code: "", debit_cents: 0, credit_cents: 0, description: "" },
    { account_code: "", debit_cents: 0, credit_cents: 0, description: "" },
  ]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit({ postingDate, memo, lines });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={<Button size="sm" />}>{t("trigger")}</DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="je-posting-date">{t("postingDate")}</Label>
              <Input
                id="je-posting-date"
                type="date"
                value={postingDate}
                onChange={(e) => setPostingDate(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="je-memo">{t("memo")}</Label>
            <Textarea id="je-memo" value={memo} onChange={(e) => setMemo(e.target.value)} required rows={2} />
          </div>
          <EntryLinesEditor lines={lines} onChange={setLines} accounts={accounts} />
          {clr && (
            <p role="alert" className="text-sm text-destructive">
              {clr.code}: {err}
            </p>
          )}
          {!clr && err && (
            <p role="alert" className="text-sm text-destructive">
              {err}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy ? t("submitting") : t("submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
