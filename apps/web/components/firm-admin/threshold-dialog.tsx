"use client";

// The threshold-change confirm dialog — split out of settings-panel.tsx (the
// house file-size discipline components/registers/fa-authority-ceremony.tsx's
// own header names). Owner-only floor is the DB's own wall
// (`clara.set_firm_high_stakes_threshold`, 0022 §B): this dialog is rendered
// for EVERY viewer regardless of role — apps/web/AGENTS.md's "no client-side
// role pre-emption beyond honest affordance" — and a below-owner caller who
// confirms gets the DB's own CLR04 "insufficient role" refusal, verbatim, in
// the panel's error banner (rendered outside this dialog, same as every
// other firm-admin ceremony in this codebase).

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FirmAdminDoorDialog } from "./FirmAdminDoorDialog";
import { parseThresholdAmountToCents } from "@/lib/firm-admin/settings";
import { fmtCents } from "@/lib/firm-admin/money";

export function ThresholdChangeDialog({
  currentCents,
  busy,
  act,
  onSubmit,
}: {
  currentCents: number;
  busy: boolean;
  act: (fn: () => Promise<void>) => Promise<void>;
  onSubmit: (cents: number) => Promise<void>;
}) {
  const t = useTranslations("FirmAdminCompliance.settings");
  const tCommon = useTranslations("Common");
  const [raw, setRaw] = useState("");
  const parsed = parseThresholdAmountToCents(raw);

  return (
    <FirmAdminDoorDialog
      triggerLabel={t("changeTrigger")}
      title={t("changeTitle")}
      description={t("changeDescription")}
      confirmLabel={t("changeTrigger")}
      busy={busy}
      confirmDisabled={parsed === null}
      onConfirm={() => act(async () => { if (parsed !== null) await onSubmit(parsed); })}
    >
      <div className="flex flex-col gap-2">
        <p className="text-xs text-muted-foreground">
          {t("currentValueLabel")}: <span className="font-medium text-foreground">{fmtCents(currentCents, tCommon("centsUnsafe"))}</span>
        </p>
        <div className="grid gap-1.5">
          <Label htmlFor="fs-threshold-amount">{t("newValueLabel")}</Label>
          <Input
            id="fs-threshold-amount"
            inputMode="decimal"
            placeholder={t("amountPlaceholder")}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
          />
        </div>
      </div>
    </FirmAdminDoorDialog>
  );
}
