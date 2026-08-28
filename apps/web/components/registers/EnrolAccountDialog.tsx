"use client";

// enrol_staff_advance_account's door dialog — admin+ (WDB-G6: enrolment
// decides what an account MEANS for every future entry). The account-code
// picker is narrowed to active, asset-typed, non-control accounts — the ONE
// admission gate (`clara._adv_enrolment_admission`'s typing arm) this UI can
// mirror honestly from a real read without inventing anything; the other
// three gates (bank binding / shared reservation / clean balance) are
// DB-only and their refusal, if any, renders verbatim in the caller's own
// banner — this dialog does not pre-guess them.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/common/native-select";
import { StaffAdvanceDoorDialog } from "./StaffAdvanceDoorDialog";
import type { AccountRow } from "@/lib/registers/accounts";

export function EnrolAccountDialog({
  accounts,
  busy,
  onSubmit,
}: {
  accounts: AccountRow[];
  busy: boolean;
  onSubmit: (accountCode: string, personLabel: string, confirmDedicated: boolean, attestation: string) => Promise<void>;
}) {
  const t = useTranslations("StaffAdvances.enrolAccount");
  const candidates = accounts.filter((a) => a.is_active && a.account_type === "asset" && a.account_class === null);
  const [accountCode, setAccountCode] = useState("");
  const [personLabel, setPersonLabel] = useState("");
  const [attestation, setAttestation] = useState("");
  const [confirmDedicated, setConfirmDedicated] = useState(false);
  const canSubmit = accountCode.trim().length > 0 && personLabel.trim().length > 0 && attestation.trim().length > 0 && confirmDedicated;

  return (
    <StaffAdvanceDoorDialog
      triggerLabel={t("trigger")}
      title={t("title")}
      description={t("description")}
      confirmLabel={t("confirm")}
      busy={busy}
      confirmDisabled={!canSubmit}
      onConfirm={() => onSubmit(accountCode, personLabel, confirmDedicated, attestation)}
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sa-enrol-account">{t("accountLabel")}</Label>
          <NativeSelect id="sa-enrol-account" value={accountCode} onChange={(e) => setAccountCode(e.target.value)}>
            <option value="">{t("selectAccount")}</option>
            {candidates.map((a) => (
              <option key={a.account_code} value={a.account_code}>
                {a.account_code} — {a.name}
              </option>
            ))}
          </NativeSelect>
          {candidates.length === 0 ? <p className="text-xs text-muted-foreground">{t("noCandidateAccounts")}</p> : null}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sa-enrol-person">{t("personLabel")}</Label>
          <Input id="sa-enrol-person" value={personLabel} onChange={(e) => setPersonLabel(e.target.value)} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sa-enrol-attestation">{t("attestationLabel")}</Label>
          <Textarea id="sa-enrol-attestation" value={attestation} onChange={(e) => setAttestation(e.target.value)} rows={3} required />
          <p className="text-xs text-muted-foreground">{t("attestationHint")}</p>
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={confirmDedicated}
            onChange={(e) => setConfirmDedicated(e.target.checked)}
          />
          <span>{t("confirmDedicatedLabel")}</span>
        </label>
      </div>
    </StaffAdvanceDoorDialog>
  );
}
