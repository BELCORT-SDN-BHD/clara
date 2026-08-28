"use client";

// complete_staff_advance_particulars's door dialog — rendered per LEDGER ROW
// that has no purpose/reference yet (a set-once pair: the DB refuses CLR10
// "particulars_already_set" on a second attempt, so this trigger disappears
// once the row is complete rather than offering a door that will only ever
// refuse).

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StaffAdvanceDoorDialog } from "./StaffAdvanceDoorDialog";

export function CompleteParticularsDialog({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (purpose: string, reference: string) => Promise<void>;
}) {
  const t = useTranslations("StaffAdvances.completeParticulars");
  const [purpose, setPurpose] = useState("");
  const [reference, setReference] = useState("");
  const canSubmit = purpose.trim().length > 0 && reference.trim().length > 0;

  return (
    <StaffAdvanceDoorDialog
      triggerLabel={t("trigger")}
      triggerSize="xs"
      title={t("title")}
      description={t("description")}
      confirmLabel={t("confirm")}
      busy={busy}
      confirmDisabled={!canSubmit}
      onConfirm={() => onSubmit(purpose, reference)}
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sa-particulars-purpose">{t("purposeLabel")}</Label>
          <Input id="sa-particulars-purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sa-particulars-reference">{t("referenceLabel")}</Label>
          <Input id="sa-particulars-reference" value={reference} onChange={(e) => setReference(e.target.value)} required />
        </div>
      </div>
    </StaffAdvanceDoorDialog>
  );
}
