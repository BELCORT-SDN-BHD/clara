"use client";

// rename_counterparty's door dialog — bookkeeper+. The former name is
// preserved automatically as a retired alias by the DB body itself (this
// module does not offer that as a choice); a rename has no "un-rename"
// door, but it is not the merge ceremony either — it changes no
// relationships, no open items move, so it stays a light one-field dialog
// (Mobbin grounding T8 takeaway 3).

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArApCounterpartyDoorDialog } from "./ArApCounterpartyDoorDialog";

export function RenameCounterpartyDialog({
  currentName,
  busy,
  onSubmit,
}: {
  currentName: string;
  busy: boolean;
  onSubmit: (newName: string) => Promise<void>;
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
      onConfirm={() => onSubmit(newName)}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cp-rename-name">{t("nameLabel")}</Label>
        <Input id="cp-rename-name" value={newName} onChange={(e) => setNewName(e.target.value)} required />
      </div>
    </ArApCounterpartyDoorDialog>
  );
}
