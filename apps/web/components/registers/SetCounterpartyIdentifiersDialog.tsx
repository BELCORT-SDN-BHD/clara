"use client";

// clara.set_counterparty_identifiers' door dialog — H-09's missing face (#647), ADMIN floor.
//
// A BOUNDED CORRECTION, which is what appendix D reserves Dialog (23) for: one focused decision
// that completes without losing page context, with a Title, initial focus, Escape/cancel
// semantics and focus restoration — all of which ArApCounterpartyDoorDialog already owns.
//
// BOTH VALUES TRAVEL TOGETHER, and the copy says so. The door REPLACES the pair (0174:833-835:
// `set registration_no=…, registration_normalized=…, tin=…`), so a form that submitted only the
// edited field would silently clear the other one. The fields are therefore seeded from the
// CURRENT values and both are always sent.
//
// NO CLIENT-SIDE RE-CHECK OF A DATABASE PREDICATE (review law 3). A registration that normalises
// away entirely, a collision with another live party's registration, an unregistered-name
// collision and a retired target are all the door's refusals and render VERBATIM in the caller's
// persistent banner — and, because the banner sits behind the modal backdrop, inside this dialog
// too through `refusal`. The one thing checked here is that SOMETHING was edited, which is not a
// DB rule but a "this button would do nothing" guard.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArApCounterpartyDoorDialog } from "./ArApCounterpartyDoorDialog";
import type { DialogRefusal } from "@/components/common/dialog-refusal";

export function SetCounterpartyIdentifiersDialog({
  counterpartyName,
  currentRegistrationNo,
  currentTin,
  busy,
  refusal,
  onSubmit,
}: {
  counterpartyName: string;
  currentRegistrationNo: string | null;
  currentTin: string | null;
  busy: boolean;
  refusal?: DialogRefusal;
  /** Exactly one governed call; resolves `true` only when the door accepted. */
  onSubmit: (registrationNo: string | null, tin: string | null) => Promise<boolean>;
}) {
  const t = useTranslations("ArApCounterparty.setIdentifiers");
  const [registration, setRegistration] = useState(currentRegistrationNo ?? "");
  const [tin, setTin] = useState(currentTin ?? "");

  const nextReg = registration.trim() === "" ? null : registration.trim();
  const nextTin = tin.trim() === "" ? null : tin.trim();
  const changed = nextReg !== (currentRegistrationNo ?? null) || nextTin !== (currentTin ?? null);

  return (
    <ArApCounterpartyDoorDialog
      triggerLabel={t("trigger")}
      triggerSize="sm"
      title={t("title", { name: counterpartyName })}
      description={t("description")}
      confirmLabel={t("confirm")}
      busy={busy}
      confirmDisabled={!changed}
      refusal={refusal}
      onConfirm={() => onSubmit(nextReg, nextTin)}
      // A CANCELLED CORRECTION LEAVES NO DRAFT BEHIND, and that is a safety rule here rather than
      // a style choice: the door REPLACES the pair, so a TIN abandoned by Escape and silently
      // re-offered on the next visit would be submitted beside a registration the human did mean
      // to change. Re-seeding on open also means a value corrected a moment ago shows as
      // corrected, without waiting for a reload.
      onOpened={() => {
        setRegistration(currentRegistrationNo ?? "");
        setTin(currentTin ?? "");
      }}
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cp-identifiers-registration">{t("registrationLabel")}</Label>
          <Input
            id="cp-identifiers-registration"
            value={registration}
            onChange={(e) => setRegistration(e.target.value)}
            aria-describedby="cp-identifiers-registration-hint"
          />
          <p id="cp-identifiers-registration-hint" className="text-xs text-muted-foreground">
            {t("registrationHint")}
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cp-identifiers-tin">{t("tinLabel")}</Label>
          <Input
            id="cp-identifiers-tin"
            value={tin}
            onChange={(e) => setTin(e.target.value)}
            aria-describedby="cp-identifiers-tin-hint"
          />
          <p id="cp-identifiers-tin-hint" className="text-xs text-muted-foreground">
            {t("tinHint")}
          </p>
        </div>
        {changed ? null : (
          <p className="text-xs text-muted-foreground">{t("unchanged")}</p>
        )}
      </div>
    </ArApCounterpartyDoorDialog>
  );
}
