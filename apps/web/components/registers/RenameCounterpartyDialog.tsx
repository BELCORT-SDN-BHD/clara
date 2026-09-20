"use client";

// rename_counterparty's door dialog — bookkeeper+. The former name is
// preserved automatically as a retired alias by the DB body itself (this
// module does not offer that as a choice); a rename has no "un-rename"
// door, but it is not the merge ceremony either — it changes no
// relationships, no open items move, so it stays a light one-field dialog
// (Mobbin grounding T8 takeaway 3).
//
// #890: BROUGHT ONTO THE SHARED DRAFT RULE the other three counterparty door dialogs already
// carry (AddCounterpartyAliasDialog's own header names it): a refusal SURVIVES with the typed
// name intact and rendered beside it, and — because this field is the party's CURRENT value,
// never a new fact, exactly SetCounterpartyIdentifiersDialog's case — it RE-SEEDS from the live
// `currentName` on every open, not only at mount. Before this fix the single
// `useState(currentName)` seeded the field once and never again: an abandoned draft (typed, then
// Cancelled or Escaped) was silently re-offered on the next visit, and this dialog carried no
// `refusal` prop at all, so a refused rename closed over the human's typed correction with
// nothing shown for why.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArApCounterpartyDoorDialog } from "./ArApCounterpartyDoorDialog";
import type { DialogRefusal } from "@/components/common/dialog-refusal";

export function RenameCounterpartyDialog({
  currentName,
  busy,
  refusal,
  onSubmit,
}: {
  currentName: string;
  busy: boolean;
  refusal?: DialogRefusal;
  onSubmit: (newName: string) => Promise<boolean>;
}) {
  const t = useTranslations("ArApCounterparty.rename");
  const [newName, setNewName] = useState(currentName);
  const canSubmit = newName.trim().length > 0 && newName.trim() !== currentName.trim();

  return (
    <ArApCounterpartyDoorDialog
      triggerLabel={t("trigger")}
      triggerSize="xs"
      title={t("title", { name: currentName })}
      confirmLabel={t("confirm")}
      busy={busy}
      confirmDisabled={!canSubmit}
      refusal={refusal}
      onConfirm={() => onSubmit(newName)}
      // #890: re-seed from the CURRENT name every time this dialog opens — see
      // SetCounterpartyIdentifiersDialog's own `onOpened` for the same rule on a current-value
      // field: an abandoned draft must not be silently re-offered, and a name corrected a moment
      // ago must show as corrected without waiting for a reload.
      onOpened={() => setNewName(currentName)}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cp-rename-name">{t("nameLabel")}</Label>
        <Input id="cp-rename-name" value={newName} onChange={(e) => setNewName(e.target.value)} required />
      </div>
    </ArApCounterpartyDoorDialog>
  );
}
