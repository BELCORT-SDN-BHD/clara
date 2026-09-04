"use client";

// retire_staff_advance_account's door dialog — admin+ (WDB-G6), rendered per
// ACTIVE enrolment row. The DB refuses CLR10 "advance_outstanding_on_retire"
// while any advance on the account still carries an outstanding balance —
// this dialog does not pre-check that; the refusal, if any, renders verbatim
// in the caller's own persistent banner, never inside this dialog.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Textarea } from "@/components/ui/textarea";
import { StaffAdvanceDoorDialog } from "./StaffAdvanceDoorDialog";

export function RetireAccountDialog({
  accountCode,
  busy,
  onSubmit,
}: {
  accountCode: string;
  busy: boolean;
  onSubmit: (reason: string) => Promise<boolean>;
}) {
  const t = useTranslations("StaffAdvances.retireAccount");
  const [reason, setReason] = useState("");

  return (
    <StaffAdvanceDoorDialog
      triggerLabel={t("trigger")}
      triggerVariant="destructive"
      triggerSize="xs"
      title={t("title", { account: accountCode })}
      description={t("description")}
      confirmLabel={t("confirm")}
      busy={busy}
      confirmDisabled={reason.trim().length === 0}
      onConfirm={() => onSubmit(reason)}
    >
      <Textarea aria-label={t("reasonLabel")} placeholder={t("reasonPlaceholder")} value={reason} onChange={(e) => setReason(e.target.value)} />
    </StaffAdvanceDoorDialog>
  );
}
