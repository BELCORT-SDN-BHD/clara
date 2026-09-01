"use client";

// The threshold-change confirm dialog — split out of settings-panel.tsx (the
// house file-size discipline components/registers/fa-authority-ceremony.tsx's
// own header names). Owner-only floor is the DB's own wall
// (`clara.set_firm_high_stakes_threshold`, 0022 §B): this dialog's TRIGGER is
// rendered for EVERY viewer regardless of role and regardless of whether the
// firm-settings read has loaded — vendor-binding-ceremony.tsx:16-21's own
// standing convention ("no client-side proposer≠signer gate — the DB's own
// wall is the wall … The Sign trigger is NEVER pre-hidden on a client-side
// role OR identity guess; every viewer sees it, and a caller who clicks it
// gets the DB's own CLR04 refusal, verbatim"), applied here to the OWNER
// floor instead of the signer≠proposer wall. A below-owner caller who
// confirms gets that CLR04 refusal, verbatim, in the panel's error banner.
//
// M2 (independent review, PR #489, fix-required): the SAME F3(b) fix
// vendor-binding-ceremony.tsx's own `ProposeBindingDialog` already carries
// (its header: "the Propose trigger vanished whenever the counterparties
// read failed — indistinguishable from 'not allowed to propose' … now
// ALWAYS rendered; the caller passes the FULL … state, so a failed read
// shows its own verbatim error + a retry INSIDE the dialog body"). Before
// this fix, `settings-panel.tsx` only mounted this dialog once `firm` had
// loaded — a `clara.firms` read failure made the ENTIRE control disappear,
// which reads exactly like "you are not allowed to change this" even though
// the DB never said so. This component now takes the FULL
// `PartHydrationState<FirmSettingsRow[]>` and renders its own error+retry
// (or loading) INSIDE the dialog body when the read has not yet succeeded.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingState, StateBanner } from "@/components/common/state";
import { FirmAdminDoorDialog } from "./FirmAdminDoorDialog";
import { parseThresholdAmountToCents, type FirmSettingsRow } from "@/lib/firm-admin/settings";
import { fmtCents } from "@/lib/firm-admin/money";
import type { PartHydrationState } from "@/lib/parts/hooks";

export function ThresholdChangeDialog({
  settingsState,
  onSubmit,
}: {
  settingsState: PartHydrationState<FirmSettingsRow[]>;
  onSubmit: (cents: number) => Promise<void>;
}) {
  const t = useTranslations("FirmAdminCompliance.settings");
  const tCommon = useTranslations("Common");
  const [raw, setRaw] = useState("");
  const firm = settingsState.data?.[0] ?? null;
  const parsed = parseThresholdAmountToCents(raw);

  return (
    <FirmAdminDoorDialog
      // N3 (independent review, PR #489): reset the typed amount on every OPEN
      // transition — the SnapshotRegistryPanel.tsx:118,128 precedent (MintDialog
      // re-mints its op_key the same way, via this identical additive
      // onOpenChange callback, never a locally-owned `open` state). It must be
      // OPEN, not close: FirmAdminDoorDialog's Confirm closes via a plain
      // `setOpen(false)`, a controlled-prop change Base UI never routes through
      // onOpenChange (DialogStore.js:48 invokes it only from real interaction
      // handlers), so a close-gated reset would silently skip the confirm path.
      // A stale amount left over from a cancelled OR CONFIRMED edit is one stray
      // click away from a spurious re-affirmation of a number the caller never
      // reviewed this time.
      onOpenChange={(isOpen) => { if (isOpen) setRaw(""); }}
      triggerLabel={t("changeTrigger")}
      title={t("changeTitle")}
      description={t("changeDescription")}
      confirmLabel={t("changeTrigger")}
      busy={settingsState.busy}
      confirmDisabled={parsed === null}
      onConfirm={() => settingsState.act(async () => { if (parsed !== null) await onSubmit(parsed); })}
    >
      {!firm ? (
        settingsState.err ? (
          <div className="flex flex-col gap-2">
            <StateBanner
              tone="error"
              className="text-xs"
              code={settingsState.clr ? `${settingsState.clr.code}${settingsState.clr.reason ? ` · ${settingsState.clr.reason}` : ""}` : undefined}
            >
              {settingsState.err}
            </StateBanner>
            <Button type="button" size="sm" variant="outline" onClick={() => void settingsState.reload()}>
              {tCommon("retry")}
            </Button>
          </div>
        ) : (
          <LoadingState className="text-xs">{t("loading")}</LoadingState>
        )
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">
            {t("currentValueLabel")}: <span className="font-medium text-foreground">{fmtCents(firm.high_stakes_amount_cents, tCommon("centsUnsafe"))}</span>
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
      )}
    </FirmAdminDoorDialog>
  );
}
