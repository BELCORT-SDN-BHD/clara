"use client";

// The adjustment-template governance ceremony — retire (admin+) is the ONLY write left
// here. Operates on the rows `loadAdjustmentTemplates` (a plain table read, Q3's own
// ruling — see lib/registers/adjustments.ts's header) already supplies: retire only
// needs a template's own `id`/`status`, which that row already carries, so this ceremony
// does not read `list_adjustment_templates` at all.
//
// [#927, riders wave 3] `ProposeTemplateDialog` and `SignTemplateDialog` are RETIRED WITH
// THEIR DOORS (migration 0282: `propose_adjustment_template` / `sign_adjustment_template`
// now each answer one typed refusal, unconditionally) and removed from this file —
// `adjustments-register.tsx` renders a retirement notice pointing at Client → Plans in
// their place. `RetireTemplateDialog` stays: `retire_adjustment_template` is D6-untouched,
// so a firm can still stand down a stray live/proposed template from before the
// retirement.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AdjustmentDoorDialog } from "./AdjustmentDoorDialog";

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
