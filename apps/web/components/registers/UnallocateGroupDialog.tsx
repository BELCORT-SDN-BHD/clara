"use client";

// unallocate_group's door dialog — bookkeeper+. Whole-group, never
// row-by-row (0037's own header). `group` names its own candidate rows —
// each shown with its OWN DB-returned amount_cents, never a summed total
// (hard constraint 2: this dialog computes nothing, it only lists what was
// read).

import { useState } from "react";
import { useTranslations } from "next-intl";
import { fmtCents, shortId } from "@/lib/registers/money";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArApCounterpartyDoorDialog } from "./ArApCounterpartyDoorDialog";
import type { ApplicationGroup } from "@/lib/registers/counterparty";

export function UnallocateGroupDialog({
  group,
  busy,
  onSubmit,
}: {
  group: ApplicationGroup;
  busy: boolean;
  onSubmit: (applicationGroupId: string, reason: string) => Promise<void>;
}) {
  const t = useTranslations("ArApCounterparty.unallocateGroup");
  const tc = useTranslations("Common");
  const [reason, setReason] = useState("");
  const canSubmit = reason.trim().length > 0;

  return (
    <ArApCounterpartyDoorDialog
      triggerLabel={t("trigger")}
      triggerSize="xs"
      title={t("title")}
      description={t("description")}
      confirmLabel={t("confirm")}
      confirmVariant="destructive"
      busy={busy}
      confirmDisabled={!canSubmit}
      onConfirm={() => onSubmit(group.application_group, reason)}
    >
      <div className="flex flex-col gap-3">
        <ul className="flex flex-col gap-1 rounded-md border p-2 text-xs text-muted-foreground">
          {group.rows.map((r) => (
            <li key={r.id} className="flex justify-between gap-2">
              <span>
                {r.operation_kind} · {shortId(r.item_id)} · {r.created_at}
              </span>
              <span>{fmtCents(r.amount_cents, tc("centsUnsafe"))}</span>
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cp-unallocate-reason">{t("reasonLabel")}</Label>
          <Textarea id="cp-unallocate-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} required />
        </div>
      </div>
    </ArApCounterpartyDoorDialog>
  );
}
