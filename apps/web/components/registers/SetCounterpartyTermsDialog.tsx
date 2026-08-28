"use client";

// set_counterparty_terms's door dialog — bookkeeper+. Refuses CLR10
// terms_out_of_range (days must be 1-365) — this dialog gates the SAME
// static bound client-side (a range the DB's own DDL CHECK also enforces,
// lib/registers/counterparty-doors.ts's header) purely to shape the input,
// never to hide the door: an out-of-range typed value disables Confirm, but
// the trigger itself is never gated (house lesson 8).

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArApCounterpartyDoorDialog } from "./ArApCounterpartyDoorDialog";

/** The raw typed string holds state; parsed only at the submit boundary —
 *  never re-derived from a parsed number each render (house lesson 7,
 *  restated for a plain integer field rather than a money one). `null` for
 *  anything that is not a whole number 1-365. */
export function parseTermsDays(input: string): number | null {
  const trimmed = input.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number.parseInt(trimmed, 10);
  if (!Number.isSafeInteger(n) || n < 1 || n > 365) return null;
  return n;
}

export function SetCounterpartyTermsDialog({
  counterpartyName,
  currentDays,
  busy,
  onSubmit,
}: {
  counterpartyName: string;
  currentDays: number | null;
  busy: boolean;
  onSubmit: (days: number) => Promise<void>;
}) {
  const t = useTranslations("ArApCounterparty.setTerms");
  const [raw, setRaw] = useState(currentDays != null ? String(currentDays) : "");
  const parsed = parseTermsDays(raw);

  return (
    <ArApCounterpartyDoorDialog
      triggerLabel={t("trigger")}
      title={t("title", { name: counterpartyName })}
      confirmLabel={t("confirm")}
      busy={busy}
      confirmDisabled={parsed === null}
      onConfirm={() => onSubmit(parsed as number)}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cp-terms-days">{t("daysLabel")}</Label>
        <Input id="cp-terms-days" inputMode="numeric" value={raw} onChange={(e) => setRaw(e.target.value)} />
        <p className="text-xs text-muted-foreground">{t("daysHint")}</p>
      </div>
    </ArApCounterpartyDoorDialog>
  );
}
