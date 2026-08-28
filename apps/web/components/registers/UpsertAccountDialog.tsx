"use client";

// upsert_account's door dialog — create a new chart-of-accounts row, or edit
// an existing one (same door, an UPSERT by construction). See
// lib/registers/accounts.ts's header: there is no deactivate path — the live
// body always sets is_active=true, so this dialog does not offer one.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/common/native-select";
import { AdjustmentDoorDialog } from "./AdjustmentDoorDialog";
import type { AccountRow, UpsertAccountInput } from "@/lib/registers/accounts";

const TYPES: UpsertAccountInput["type"][] = ["asset", "liability", "equity", "income", "expense"];
const CLASSES: NonNullable<UpsertAccountInput["accountClass"]>[] = ["payable", "receivable"];
const SPECIALS: NonNullable<UpsertAccountInput["specialAccType"]>[] = [
  "rounding",
  "sst_output",
  "sst_purchase_cost",
  "opening_balance_equity",
  "retained_earnings",
];

export function UpsertAccountDialog({
  existing,
  busy,
  onSubmit,
}: {
  /** Absent for "add a new account"; present to pre-fill an edit of this row. */
  existing?: AccountRow;
  busy: boolean;
  onSubmit: (input: Omit<UpsertAccountInput, "clientId">) => Promise<void>;
}) {
  const t = useTranslations("AdjustmentsAccounts.upsertAccount");
  const [code, setCode] = useState(existing?.account_code ?? "");
  const [name, setName] = useState(existing?.name ?? "");
  const [type, setType] = useState<UpsertAccountInput["type"]>((existing?.account_type as UpsertAccountInput["type"]) ?? "asset");
  const [accountClass, setAccountClass] = useState<string>(existing?.account_class ?? "");
  const [specialAccType, setSpecialAccType] = useState<string>(existing?.special_acc_type ?? "");
  const canSubmit = code.trim().length > 0 && name.trim().length > 0;

  return (
    <AdjustmentDoorDialog
      triggerLabel={existing ? t("editTrigger") : t("addTrigger")}
      triggerSize={existing ? "xs" : "sm"}
      title={existing ? t("editTitle", { code: existing.account_code }) : t("addTitle")}
      description={t("description")}
      confirmLabel={existing ? t("editTrigger") : t("addTrigger")}
      busy={busy}
      confirmDisabled={!canSubmit}
      onConfirm={() =>
        onSubmit({
          code: code.trim(),
          name: name.trim(),
          type,
          accountClass: (accountClass || null) as UpsertAccountInput["accountClass"],
          specialAccType: (specialAccType || null) as UpsertAccountInput["specialAccType"],
        })
      }
    >
      <div className="flex flex-col gap-3">
        {/* F5 (independent review, nit): upsert_account's own ON CONFLICT
         *  unconditionally sets is_active=true (lib/registers/accounts.ts's
         *  header) — editing a currently-inactive row REACTIVATES it. Said
         *  plainly, not left to be discovered from the confirm's own effect. */}
        {existing && !existing.is_active ? <p className="text-xs text-warning">{t("reactivateHint")}</p> : null}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="acct-code">{t("codeLabel")}</Label>
          <Input id="acct-code" value={code} onChange={(e) => setCode(e.target.value)} disabled={!!existing} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="acct-name">{t("nameLabel")}</Label>
          <Input id="acct-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="acct-type">{t("typeLabel")}</Label>
          <NativeSelect id="acct-type" value={type} onChange={(e) => setType(e.target.value as UpsertAccountInput["type"])}>
            {TYPES.map((ty) => (
              <option key={ty} value={ty}>
                {t(`types.${ty}`)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="acct-class">{t("classLabel")}</Label>
          <NativeSelect id="acct-class" value={accountClass} onChange={(e) => setAccountClass(e.target.value)}>
            <option value="">{t("classNone")}</option>
            {CLASSES.map((c) => (
              <option key={c} value={c}>
                {t(`classes.${c}`)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="acct-special">{t("specialLabel")}</Label>
          <NativeSelect id="acct-special" value={specialAccType} onChange={(e) => setSpecialAccType(e.target.value)}>
            <option value="">{t("specialNone")}</option>
            {SPECIALS.map((s) => (
              <option key={s} value={s}>
                {t(`specials.${s}`)}
              </option>
            ))}
          </NativeSelect>
          <p className="text-xs text-warning">{t("specialHint")}</p>
        </div>
      </div>
    </AdjustmentDoorDialog>
  );
}
