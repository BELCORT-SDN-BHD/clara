"use client";

// add_counterparty_alias's door dialog — bookkeeper+. Mobbin grounding T8
// takeaway 3: alias/rename are NOT the merge ceremony — lighter, reversible
// acts (an alias can be retired) get lighter treatment, a plain Dialog with
// one Input, never the two-step preview-then-confirm shape.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/common/native-select";
import { ArApCounterpartyDoorDialog } from "./ArApCounterpartyDoorDialog";
import type { CounterpartyAliasOrigin } from "@/lib/registers/counterparty-doors";

export function AddCounterpartyAliasDialog({
  counterpartyName,
  busy,
  onSubmit,
}: {
  counterpartyName: string;
  busy: boolean;
  onSubmit: (alias: string, origin: CounterpartyAliasOrigin) => Promise<void>;
}) {
  const t = useTranslations("ArApCounterparty.addAlias");
  const [alias, setAlias] = useState("");
  const [origin, setOrigin] = useState<CounterpartyAliasOrigin>("trade_name");
  const canSubmit = alias.trim().length > 0;

  return (
    <ArApCounterpartyDoorDialog
      triggerLabel={t("trigger")}
      triggerSize="xs"
      title={t("title", { name: counterpartyName })}
      confirmLabel={t("confirm")}
      busy={busy}
      confirmDisabled={!canSubmit}
      onConfirm={() => onSubmit(alias, origin)}
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cp-alias-name">{t("aliasLabel")}</Label>
          <Input id="cp-alias-name" value={alias} onChange={(e) => setAlias(e.target.value)} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cp-alias-origin">{t("originLabel")}</Label>
          <NativeSelect id="cp-alias-origin" value={origin} onChange={(e) => setOrigin(e.target.value as CounterpartyAliasOrigin)}>
            <option value="trade_name">{t("originTradeName")}</option>
            <option value="former_name">{t("originFormerName")}</option>
            <option value="human">{t("originHuman")}</option>
          </NativeSelect>
        </div>
      </div>
    </ArApCounterpartyDoorDialog>
  );
}
