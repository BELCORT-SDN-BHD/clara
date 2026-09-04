"use client";

// create_counterparty's door dialog — bookkeeper+. CREATE-OR-GET: a `created:
// false` receipt is not a failure (lib/registers/counterparty-doors.ts's own
// header) — the caller's onSubmit threads the real receipt through its own
// banner; this dialog does not interpret it.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/common/native-select";
import { ArApCounterpartyDoorDialog } from "./ArApCounterpartyDoorDialog";
import type { CounterpartyKind } from "@/lib/registers/counterparty";

export function CreateCounterpartyDialog({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (kind: CounterpartyKind, name: string, registrationNo: string | null, tin: string | null) => Promise<boolean>;
}) {
  const t = useTranslations("ArApCounterparty.create");
  const [kind, setKind] = useState<CounterpartyKind>("vendor");
  const [name, setName] = useState("");
  const [registrationNo, setRegistrationNo] = useState("");
  const [tin, setTin] = useState("");
  const canSubmit = name.trim().length > 0;

  return (
    <ArApCounterpartyDoorDialog
      triggerLabel={t("trigger")}
      title={t("title")}
      description={t("description")}
      confirmLabel={t("confirm")}
      busy={busy}
      confirmDisabled={!canSubmit}
      onConfirm={() => onSubmit(kind, name, registrationNo.trim() || null, tin.trim() || null)}
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cp-create-kind">{t("kindLabel")}</Label>
          <NativeSelect id="cp-create-kind" value={kind} onChange={(e) => setKind(e.target.value as CounterpartyKind)}>
            <option value="vendor">{t("kindVendor")}</option>
            <option value="customer">{t("kindCustomer")}</option>
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cp-create-name">{t("nameLabel")}</Label>
          <Input id="cp-create-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cp-create-reg">{t("registrationLabel")}</Label>
          <Input id="cp-create-reg" value={registrationNo} onChange={(e) => setRegistrationNo(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cp-create-tin">{t("tinLabel")}</Label>
          <Input id="cp-create-tin" value={tin} onChange={(e) => setTin(e.target.value)} />
        </div>
      </div>
    </ArApCounterpartyDoorDialog>
  );
}
