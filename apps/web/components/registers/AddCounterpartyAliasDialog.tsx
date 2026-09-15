"use client";

// add_counterparty_alias's door dialog — bookkeeper+. Mobbin grounding T8
// takeaway 3: alias/rename are NOT the merge ceremony — lighter, reversible
// acts (an alias can be retired) get lighter treatment, a plain Dialog with
// one Input, never the two-step preview-then-confirm shape.

// #647: the dialog now also carries the alias's BASIS — the human's own words for why this name
// belongs to this party. Optional, because a bookkeeper who simply knows the trade name should
// not be forced to invent a sentence; where one IS given it is stored on the alias row
// (`recorded_basis`) and becomes the basis of the identity revision the write appends, so it is a
// real durable fact rather than a form field that evaporates. Textarea rather than Input for
// appendix D's own reason (59): explanation and correction reasons are free-form.
//
// `extracted` joins the origin list because 0200 widened the CHECK, but it is deliberately NOT
// offered here: an extracted alias OWES a document and an extraction pin (CLR10
// `source_incomplete`), and this dialog has no document picker — offering an option that can only
// refuse is exactly 裁-187's rule. The extraction lane reaches it through the successor contract.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/common/native-select";
import { ArApCounterpartyDoorDialog } from "./ArApCounterpartyDoorDialog";
import type { CounterpartyAliasOrigin } from "@/lib/registers/counterparty-doors";
import type { DialogRefusal } from "@/components/common/dialog-refusal";

export function AddCounterpartyAliasDialog({
  counterpartyName,
  busy,
  refusal,
  onSubmit,
}: {
  counterpartyName: string;
  busy: boolean;
  refusal?: DialogRefusal;
  onSubmit: (alias: string, origin: CounterpartyAliasOrigin, basis: string | null) => Promise<boolean>;
}) {
  const t = useTranslations("ArApCounterparty.addAlias");
  const [alias, setAlias] = useState("");
  const [origin, setOrigin] = useState<CounterpartyAliasOrigin>("trade_name");
  const [basis, setBasis] = useState("");
  const canSubmit = alias.trim().length > 0;

  return (
    <ArApCounterpartyDoorDialog
      triggerLabel={t("trigger")}
      triggerSize="xs"
      title={t("title", { name: counterpartyName })}
      confirmLabel={t("confirm")}
      busy={busy}
      confirmDisabled={!canSubmit}
      refusal={refusal}
      onConfirm={() => onSubmit(alias, origin, basis.trim() === "" ? null : basis.trim())}
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
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cp-alias-basis">{t("basisLabel")}</Label>
          <Textarea
            id="cp-alias-basis"
            value={basis}
            aria-describedby="cp-alias-basis-hint"
            onChange={(e) => setBasis(e.target.value)}
          />
          <p id="cp-alias-basis-hint" className="text-xs text-muted-foreground">{t("basisHint")}</p>
        </div>
      </div>
    </ArApCounterpartyDoorDialog>
  );
}
