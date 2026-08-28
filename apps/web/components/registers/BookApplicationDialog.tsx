"use client";

// book_staff_advance_application's door dialog — a normal double-entry lines
// set (the same house line validator every manual entry uses) PLUS a
// separate register-side allocations set naming which line settles which
// outstanding advance, for how much. See lib/registers/staff-advances-doors.ts's
// header for the full grounding.
//
// Follows the CloseDoors.tsx precedent (not ComposeDialog's externally-
// controlled `open`): the dialog owns its own trigger and open state
// (StaffAdvanceDoorDialog), and `onSubmit` is a plain `(input) => Promise<void>`
// the caller wraps with its own hydrated-part `act()` — which never rejects
// (lib/parts/hooks.ts's own header), so the dialog closes unconditionally
// after every confirm attempt and a refusal renders in the caller's OWN
// persistent banner, outside this now-closed dialog — never inside it.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/common/native-select";
import { SectionHeader } from "@/components/common/section-header";
import { businessToday } from "@/lib/business-date";
import { fmtCents } from "@/lib/registers/money";
import { StaffAdvanceDoorDialog } from "./StaffAdvanceDoorDialog";
import { StaffAdvanceLinesEditor, sumStaffAdvanceLines } from "./staff-advance-lines-editor";
import { StaffAdvanceAllocationsEditor } from "./staff-advance-allocations-editor";
import type { AccountRow } from "@/lib/registers/accounts";
import type {
  BookStaffAdvanceApplicationInput,
  StaffAdvanceAllocationInput,
  StaffAdvanceApplicationKind,
  StaffAdvanceEntryLineInput,
  StaffAdvanceSummaryRow,
} from "@/lib/registers/staff-advances-doors";

const KINDS: StaffAdvanceApplicationKind[] = ["payroll_deduction", "bank_return", "claim"];

function emptyLines(): StaffAdvanceEntryLineInput[] {
  return [
    { account_code: "", debit_cents: 0, credit_cents: 0, description: "" },
    { account_code: "", debit_cents: 0, credit_cents: 0, description: "" },
  ];
}

export function BookApplicationDialog({
  accounts,
  outstandingAdvances,
  busy,
  onSubmit,
}: {
  accounts: AccountRow[];
  /** staff_advance_summary rows narrowed to `outstanding_cents > 0` — the
   *  allocations editor's own candidate list (a DB-derived figure, never a
   *  client-side guess at what is still owed). */
  outstandingAdvances: StaffAdvanceSummaryRow[];
  busy: boolean;
  onSubmit: (input: BookStaffAdvanceApplicationInput) => Promise<void>;
}) {
  const t = useTranslations("StaffAdvances.bookApplication");
  const tc = useTranslations("Common");
  const [postingDate, setPostingDate] = useState(businessToday);
  const [memo, setMemo] = useState("");
  const [reason, setReason] = useState("");
  const [kind, setKind] = useState<StaffAdvanceApplicationKind>("payroll_deduction");
  const [lines, setLines] = useState<StaffAdvanceEntryLineInput[]>(emptyLines);
  const [allocations, setAllocations] = useState<StaffAdvanceAllocationInput[]>([]);

  const balance = sumStaffAdvanceLines(lines);
  const allocatedCents = allocations.reduce((sum, a) => sum + a.amount_cents, 0);
  const canSubmit =
    lines.length >= 2 &&
    balance.balanced &&
    balance.debitCents > 0 &&
    allocations.length > 0 &&
    allocations.every((a) => a.advance_id && a.amount_cents > 0) &&
    reason.trim().length > 0;

  return (
    <StaffAdvanceDoorDialog
      triggerLabel={t("trigger")}
      title={t("title")}
      description={t("description")}
      confirmLabel={t("confirm")}
      busy={busy}
      confirmDisabled={!canSubmit}
      onConfirm={() => onSubmit({ postingDate, memo, lines, allocations, kind, reason })}
    >
      <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto pr-1">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sa-kind">{t("kind")}</Label>
            <NativeSelect id="sa-kind" value={kind} onChange={(e) => setKind(e.target.value as StaffAdvanceApplicationKind)}>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`kinds.${k}`)}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sa-posting-date">{t("postingDate")}</Label>
            <Input id="sa-posting-date" type="date" value={postingDate} onChange={(e) => setPostingDate(e.target.value)} required />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sa-memo">{t("memo")}</Label>
          <Textarea id="sa-memo" value={memo} onChange={(e) => setMemo(e.target.value)} rows={2} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sa-reason">{t("reason")}</Label>
          <Textarea id="sa-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} required />
        </div>
        <SectionHeader level={3}>{t("linesHeading")}</SectionHeader>
        <StaffAdvanceLinesEditor lines={lines} onChange={setLines} accounts={accounts} />
        <SectionHeader level={3}>{t("allocationsHeading")}</SectionHeader>
        <StaffAdvanceAllocationsEditor
          allocations={allocations}
          onChange={setAllocations}
          candidates={outstandingAdvances}
          lineCount={lines.length}
        />
        {/* S3 (independent review): a client-side PRESENTATION sum ONLY —
            routed through the shared fmtCents formatter (never a computed
            figure the UI trusts as authoritative, hard constraint 2), and
            labelled as such in the string itself. */}
        <p className="text-xs text-muted-foreground">
          {t("allocatedSummary", { amount: fmtCents(allocatedCents, tc("centsUnsafe")) })}
        </p>
      </div>
    </StaffAdvanceDoorDialog>
  );
}
