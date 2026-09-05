"use client";

// The adjustment-template governance ceremony — propose (new template) / sign
// (admin+, makes it live) / retire (admin+). Operates on the rows
// `loadAdjustmentTemplates` (a plain table read, Q3's own ruling — see
// lib/registers/adjustments.ts's header) already supplies: sign/retire only
// need a template's own `id`/`status`, which that row already carries, so
// this ceremony does not read `list_adjustment_templates` at all.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/common/native-select";
import { businessToday } from "@/lib/business-date";
import { AdjustmentDoorDialog } from "./AdjustmentDoorDialog";
import { AdjustmentLinesEditor, sumAdjustmentLines } from "./adjustment-lines-editor";
import type { AdjustmentTemplateLineInput, ProposeAdjustmentTemplateInput } from "@/lib/registers/adjustments";
import type { AccountRow } from "@/lib/registers/accounts";

/** The clientId comes from the caller's own closure (the workspace it is
 *  already scoped to) — this dialog only ever emits the fields a preparer
 *  actually fills in, the same split BookApplicationDialog.tsx uses. */
export type ProposeTemplateFields = Omit<ProposeAdjustmentTemplateInput, "clientId">;

export function ProposeTemplateDialog({
  accounts,
  busy,
  onSubmit,
}: {
  accounts: AccountRow[];
  busy: boolean;
  onSubmit: (input: ProposeTemplateFields) => Promise<boolean>;
}) {
  const t = useTranslations("AdjustmentsAccounts.proposeTemplate");
  const [name, setName] = useState("");
  const [cadence, setCadence] = useState<"monthly" | "annual">("monthly");
  const [startDate, setStartDate] = useState(businessToday);
  const [endDate, setEndDate] = useState("");
  const [autoReverse, setAutoReverse] = useState(false);
  const [memoTemplate, setMemoTemplate] = useState("");
  const [lines, setLines] = useState<AdjustmentTemplateLineInput[]>([
    { account_code: "", debit_cents: 0, credit_cents: 0 },
    { account_code: "", debit_cents: 0, credit_cents: 0 },
  ]);

  const balance = sumAdjustmentLines(lines);
  const canSubmit =
    name.trim().length > 0 &&
    memoTemplate.trim().length > 0 &&
    lines.length >= 2 &&
    lines.every((l) => l.account_code) &&
    balance.balanced &&
    balance.debitCents > 0;

  return (
    <AdjustmentDoorDialog
      triggerLabel={t("trigger")}
      title={t("title")}
      description={t("description")}
      confirmLabel={t("trigger")}
      busy={busy}
      confirmDisabled={!canSubmit}
      onConfirm={() =>
        onSubmit({
          name: name.trim(),
          cadence,
          startDate,
          endDate: endDate || null,
          autoReverse,
          lines,
          memoTemplate: memoTemplate.trim(),
        })
      }
    >
      <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto pr-1">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="adj-name">{t("nameLabel")}</Label>
          <Input id="adj-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="adj-cadence">{t("cadenceLabel")}</Label>
            <NativeSelect id="adj-cadence" value={cadence} onChange={(e) => setCadence(e.target.value as "monthly" | "annual")}>
              <option value="monthly">{t("cadence.monthly")}</option>
              <option value="annual">{t("cadence.annual")}</option>
            </NativeSelect>
          </div>
          <label className="flex items-end gap-2 pb-1.5 text-sm">
            <input type="checkbox" checked={autoReverse} onChange={(e) => setAutoReverse(e.target.checked)} />
            <span>{t("autoReverseLabel")}</span>
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="adj-start">{t("startDateLabel")}</Label>
            <Input id="adj-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="adj-end">{t("endDateLabel")}</Label>
            <Input id="adj-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="adj-memo">{t("memoLabel")}</Label>
          <Textarea id="adj-memo" value={memoTemplate} onChange={(e) => setMemoTemplate(e.target.value)} rows={2} required />
          <p className="text-xs text-muted-foreground">{t("memoHint")}</p>
        </div>
        <AdjustmentLinesEditor lines={lines} onChange={setLines} accounts={accounts} />
      </div>
    </AdjustmentDoorDialog>
  );
}

export function SignTemplateDialog({ templateName, busy, onSubmit }: { templateName: string; busy: boolean; onSubmit: () => Promise<boolean> }) {
  const t = useTranslations("AdjustmentsAccounts.signTemplate");
  return (
    <AdjustmentDoorDialog
      triggerLabel={t("trigger")}
      triggerSize="xs"
      title={t("title", { name: templateName })}
      description={t("description")}
      confirmLabel={t("trigger")}
      busy={busy}
      onConfirm={onSubmit}
    />
  );
}

export function RetireTemplateDialog({
  templateName,
  busy,
  onSubmit,
}: {
  templateName: string;
  busy: boolean;
  onSubmit: (reason: string) => Promise<boolean>;
}) {
  const t = useTranslations("AdjustmentsAccounts.retireTemplate");
  const [reason, setReason] = useState("");
  return (
    <AdjustmentDoorDialog
      triggerLabel={t("trigger")}
      triggerVariant="destructive"
      triggerSize="xs"
      title={t("title", { name: templateName })}
      description={t("description")}
      confirmLabel={t("trigger")}
      busy={busy}
      confirmDisabled={reason.trim().length === 0}
      onConfirm={() => onSubmit(reason.trim())}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="adj-retire-reason">{t("reasonLabel")}</Label>
        <Textarea id="adj-retire-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
    </AdjustmentDoorDialog>
  );
}
