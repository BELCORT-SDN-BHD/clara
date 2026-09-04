"use client";

// apply_open_items's door dialog — bookkeeper+. Pair mechanics between two
// EXISTING open items, no GL movement (0037's own header, restated in
// lib/registers/counterparty-doors.ts). Candidates come from the caller's
// OWN just-read aging row (`AgingItem[]`) — never a second read this dialog
// invents — so "which items are currently outstanding" stays exactly what
// the aging table on screen already shows. This dialog does not pre-check
// that source carries a credit and target a claim; the DB's own CLR10
// (application_target_not_open / allocation_exceeds_outstanding) renders
// verbatim in the caller's banner if the pairing or amount is wrong.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { fmtCents } from "@/lib/registers/money";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MoneyInput } from "@/components/common/money-input";
import { NativeSelect } from "@/components/common/native-select";
import { ArApCounterpartyDoorDialog } from "./ArApCounterpartyDoorDialog";
import type { AgingItem } from "@/lib/registers/aging";

export function ApplyOpenItemsDialog({
  items,
  busy,
  onSubmit,
}: {
  /** The counterparty's currently-outstanding items (the caller's own
   *  just-read aging row). */
  items: AgingItem[];
  busy: boolean;
  onSubmit: (sourceItemId: string, targetItemId: string, amountCents: number, reason: string) => Promise<boolean>;
}) {
  const t = useTranslations("ArApCounterparty.applyOpenItems");
  const tc = useTranslations("Common");
  const [sourceItemId, setSourceItemId] = useState("");
  const [targetItemId, setTargetItemId] = useState("");
  const [amountCents, setAmountCents] = useState<number | null>(null);
  const [amountValid, setAmountValid] = useState(true);
  const [reason, setReason] = useState("");
  const canSubmit =
    sourceItemId.length > 0 &&
    targetItemId.length > 0 &&
    sourceItemId !== targetItemId &&
    amountValid &&
    amountCents !== null &&
    amountCents > 0 &&
    reason.trim().length > 0;

  const itemLabel = (i: AgingItem) => `${i.item_kind ?? "—"} · ${i.item_date ?? "—"} · ${fmtCents(i.outstanding_cents, tc("centsUnsafe"))}`;

  return (
    <ArApCounterpartyDoorDialog
      triggerLabel={t("trigger")}
      triggerSize="xs"
      title={t("title")}
      description={t("description")}
      confirmLabel={t("confirm")}
      busy={busy}
      confirmDisabled={!canSubmit}
      // N4 (independent review): a typed guard, not a cast — `canSubmit`
      // already gates whether this can fire, but TS cannot see that from
      // here; this narrows `amountCents` to `number` for real instead of
      // asserting it.
      onConfirm={() => (amountCents === null ? Promise.resolve(false) : onSubmit(sourceItemId, targetItemId, amountCents, reason))}
    >
      {items.length < 2 ? (
        <p className="text-sm text-muted-foreground">{t("noCandidateItems")}</p>
      ) : (
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cp-apply-source">{t("sourceLabel")}</Label>
          <NativeSelect id="cp-apply-source" value={sourceItemId} onChange={(e) => setSourceItemId(e.target.value)}>
            <option value="">{t("selectItem")}</option>
            {items.map((i) => (
              <option key={i.item_id} value={i.item_id}>
                {itemLabel(i)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cp-apply-target">{t("targetLabel")}</Label>
          <NativeSelect id="cp-apply-target" value={targetItemId} onChange={(e) => setTargetItemId(e.target.value)}>
            <option value="">{t("selectItem")}</option>
            {items.map((i) => (
              <option key={i.item_id} value={i.item_id}>
                {itemLabel(i)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cp-apply-amount">{t("amountLabel")}</Label>
          <MoneyInput
            id="cp-apply-amount"
            mode="signed"
            cents={amountCents}
            onValueChange={(change) => {
              setAmountValid(change.ok);
              if (change.ok) setAmountCents(change.cents);
            }}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cp-apply-reason">{t("reasonLabel")}</Label>
          <Textarea id="cp-apply-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} required />
        </div>
      </div>
      )}
    </ArApCounterpartyDoorDialog>
  );
}
