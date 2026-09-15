"use client";

// clara.add_client_identifier's door dialog — H-20's missing face (#647), bookkeeper+.
//
// H-20 said the door "has no face": the only way a human could state a client identifier was to
// RATIFY an agent proposal (identifier-promotion-row.tsx). This is the other half — stating one
// outright — and it lives in the Identity section of the client's Knowledge page rather than as
// a bare button somewhere, because C-41's ruling is "one section, not one control per database
// function".
//
// THE TWO FIELD ERRORS HERE ARE REQUIRED-FIELD ERRORS, NOT COPIES OF A DATABASE PREDICATE. The
// door's own refusals — CLR11 for a client outside the firm, CLR10 `already_recorded` for a
// (client, kind, value) `uq_client_identifiers_client_kind_value` already holds — render
// VERBATIM in the caller's persistent banner and inside this dialog through `refusal`. What is
// checked here is only that the human typed something into each box, and the TYPED TEXT SURVIVES
// that failure (appendix C's field rule: preserve user input).
//
// NORMALISATION IS THE DATABASE'S. `add_client_identifier` stores
// `lower(regexp_replace(value,'\s+','','g'))` (0155:446); this dialog sends what was typed and
// never pre-normalises, so the value a human sees refused is the value they entered.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArApCounterpartyDoorDialog } from "./ArApCounterpartyDoorDialog";
import type { DialogRefusal } from "@/components/common/dialog-refusal";

export function AddClientIdentifierDialog({
  busy,
  refusal,
  onSubmit,
}: {
  busy: boolean;
  refusal?: DialogRefusal;
  onSubmit: (kind: string, value: string) => Promise<boolean>;
}) {
  const t = useTranslations("ClientIdentifiers");
  const [kind, setKind] = useState("");
  const [value, setValue] = useState("");
  const [kindError, setKindError] = useState<string | null>(null);
  const [valueError, setValueError] = useState<string | null>(null);

  async function run(): Promise<boolean> {
    const k = kind.trim();
    const v = value.trim();
    // Both errors are computed BEFORE anything is sent, and neither clears the other's input:
    // a human who filled one box keeps it.
    setKindError(k === "" ? t("kindRequired") : null);
    setValueError(v === "" ? t("valueRequired") : null);
    if (k === "" || v === "") return false;
    const ok = await onSubmit(k, v);
    if (ok) { setKind(""); setValue(""); }
    return ok;
  }

  return (
    <ArApCounterpartyDoorDialog
      triggerLabel={t("addTrigger")}
      triggerSize="sm"
      title={t("addTitle")}
      description={t("addDescription")}
      confirmLabel={t("addConfirm")}
      busy={busy}
      refusal={refusal}
      onConfirm={run}
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="client-identifier-kind">{t("kindLabel")}</Label>
          <Input
            id="client-identifier-kind"
            value={kind}
            aria-invalid={kindError !== null}
            aria-describedby="client-identifier-kind-hint"
            onChange={(e) => { setKind(e.target.value); setKindError(null); }}
          />
          <p id="client-identifier-kind-hint" className="text-xs text-muted-foreground">{t("kindHint")}</p>
          {kindError ? <p className="text-xs text-error">{kindError}</p> : null}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="client-identifier-value">{t("valueLabel")}</Label>
          <Input
            id="client-identifier-value"
            value={value}
            aria-invalid={valueError !== null}
            aria-describedby="client-identifier-value-hint"
            onChange={(e) => { setValue(e.target.value); setValueError(null); }}
          />
          <p id="client-identifier-value-hint" className="text-xs text-muted-foreground">{t("valueHint")}</p>
          {valueError ? <p className="text-xs text-error">{valueError}</p> : null}
        </div>
      </div>
    </ArApCounterpartyDoorDialog>
  );
}
