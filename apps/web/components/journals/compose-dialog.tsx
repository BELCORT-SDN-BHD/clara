"use client";

// Manual JE compose (SCOPE d) — the real two-call ceremony
// (record_client_resolution -> draft_entry), see lib/journals/api.ts's
// `composeManualEntry` header for the grounding. Rendered ONLY because that
// real verb pair exists; if it did not, this dialog would not exist and the
// affordance would say so instead (mission's honest-not-built rule).

import { useEffect, useState, type FormEvent } from "react";
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
import { StateBanner } from "@/components/common/state";
import { EntryLinesEditor } from "@/components/journals/entry-lines-editor";
import { businessToday } from "@/lib/business-date";
import { COMPOSE_ACTING_ID } from "@/lib/journals/use-journals-workbench";
import type { CoaAccountRow, EntryLineInput } from "@/lib/journals/types";
import type { PartClr } from "@/lib/parts/hooks";

function emptyLines(): EntryLineInput[] {
  return [
    { account_code: "", debit_cents: 0, credit_cents: 0, description: "" },
    { account_code: "", debit_cents: 0, credit_cents: 0, description: "" },
  ];
}

export function ComposeDialog({
  open,
  onOpenChange,
  accounts,
  busy,
  err,
  clr,
  actingId,
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
  /** FIX-2 / N1: the workbench's busy/err/clr are ONE state shared across every
   *  action — this dialog only renders them when it is genuinely the acting
   *  party (`actingId === COMPOSE_ACTING_ID`), never a stale refusal left over
   *  from approving/revising/reversing some OTHER row. */
  actingId: string | null;
  onSubmit: (input: { postingDate: string; memo: string; lines: EntryLineInput[] }) => void;
}) {
  const t = useTranslations("JournalsWorkbench.compose");
  const [postingDate, setPostingDate] = useState(businessToday);
  const [memo, setMemo] = useState("");
  const [lines, setLines] = useState<EntryLineInput[]>(emptyLines);

  // FIX-4 (independent review): a lazy `useState` initializer runs ONCE, at
  // this component's first mount — since the dialog stays mounted (only its
  // `open` prop toggles), the posting-date default would otherwise be
  // computed once, ever, for the app's whole session, not "today" each time
  // the dialog opens. Recompute — and reset the whole form, N6's "reset on
  // success" — every time `open` transitions to `true`.
  useEffect(() => {
    if (!open) return;
    setPostingDate(businessToday());
    setMemo("");
    setLines(emptyLines());
  }, [open]);

  const isActing = actingId === COMPOSE_ACTING_ID;
  const visibleErr = isActing ? err : null;
  const visibleClr = isActing ? clr : null;

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
          {/* P3 polish: `gap-1.5` between a label and its field — the gap the
              Bank and Close forms already used, and now the one label-to-field
              gap in the product (this lane's own gap-1 and the auth cards'
              gap-2 were the two other spellings). */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
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
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="je-memo">{t("memo")}</Label>
            <Textarea id="je-memo" value={memo} onChange={(e) => setMemo(e.target.value)} required rows={2} />
          </div>
          <EntryLinesEditor lines={lines} onChange={setLines} accounts={accounts} />
          {visibleErr && (
            <StateBanner tone="error" code={visibleClr ? visibleClr.code : undefined}>
              {visibleErr}
            </StateBanner>
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
