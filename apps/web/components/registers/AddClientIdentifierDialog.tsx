"use client";

// clara.add_client_identifier's door dialog — H-20's missing face (#647), bookkeeper+.
//
// H-20 said the door "has no face": the only way a human could state a client identifier was to
// RATIFY an agent proposal (identifier-promotion-row.tsx). This is the other half — stating one
// outright — and it lives in the Identity section of the client's Knowledge page rather than as
// a bare button somewhere, because C-41's ruling is "one section, not one control per database
// function".
//
// THE ONE FIELD ERROR HERE IS A REQUIRED-FIELD ERROR, NOT A COPY OF A DATABASE PREDICATE. The
// door's own refusals — CLR11 for a client outside the firm, CLR10 `already_recorded` for a
// (client, kind, value) `uq_client_identifiers_client_kind_value` already holds — render
// VERBATIM in the caller's persistent banner and inside this dialog through `refusal`. What is
// checked here is only that the human typed a VALUE, and the TYPED TEXT SURVIVES that failure
// (appendix C's field rule: preserve user input).
//
// NORMALISATION IS THE DATABASE'S. `add_client_identifier` stores
// `lower(regexp_replace(value,'\s+','','g'))` (0155:446); this dialog sends what was typed and
// never pre-normalises, so the value a human sees refused is the value they entered.
//
// THE KIND IS A CLOSED CHOICE, BECAUSE THE COLUMN IS. `clara.client_identifiers.kind` carries a
// three-value CHECK (`tin`, `ssm`, `bank_account`; 0007:227) and `clara.add_client_identifier`
// (0155:426-459) maps only `unique_violation` to a typed refusal -- so ANY other kind leaves the
// database as a bare 23514 which `toDialogRefusal` classifies `clr: null` and paints as a raw
// Postgres sentence. A free-text box over a closed vocabulary offers the human an option that can
// only be refused (and the old hint steered at `sst`, which the CHECK does not admit), so this is
// the NativeSelect idiom AddCounterpartyAliasDialog already uses for `origin`. Cell of record:
// client-identity-section.test.tsx, "H-20: the Kind control is the DATABASE's own closed
// vocabulary".

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/common/native-select";
import { ArApCounterpartyDoorDialog } from "./ArApCounterpartyDoorDialog";
import type { DialogRefusal } from "@/components/common/dialog-refusal";

/** The exact vocabulary `clara.client_identifiers.kind`'s CHECK admits, in the order a Malaysian
 *  bookkeeper meets them. Widening it means widening that CHECK in a migration first. */
const IDENTIFIER_KINDS = ["ssm", "tin", "bank_account"] as const;
type IdentifierKind = (typeof IDENTIFIER_KINDS)[number];

export function AddClientIdentifierDialog({
  busy,
  refusal,
  onSubmit,
}: {
  busy: boolean;
  refusal?: DialogRefusal;
  onSubmit: (kind: string, value: string) => Promise<boolean>;
}) {
  const t = useTranslations("ArApCounterparty.clientIdentifiers");
  const [kind, setKind] = useState<IdentifierKind>(IDENTIFIER_KINDS[0]);
  const [value, setValue] = useState("");
  const [valueError, setValueError] = useState<string | null>(null);

  async function run(): Promise<boolean> {
    const v = value.trim();
    // THE KIND NO LONGER NEEDS A REQUIRED-FIELD ERROR: a closed select always carries one of the
    // three values the CHECK admits. The VALUE still does, and the typed text SURVIVES that
    // failure (appendix C's field rule: preserve user input).
    setValueError(v === "" ? t("valueRequired") : null);
    if (v === "") return false;
    const ok = await onSubmit(kind, v);
    if (ok) { setKind(IDENTIFIER_KINDS[0]); setValue(""); }
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
          <NativeSelect
            id="client-identifier-kind"
            value={kind}
            aria-describedby="client-identifier-kind-hint"
            onChange={(e) => setKind(e.target.value as IdentifierKind)}
          >
            <option value="ssm">{t("kindSsm")}</option>
            <option value="tin">{t("kindTin")}</option>
            <option value="bank_account">{t("kindBankAccount")}</option>
          </NativeSelect>
          <p id="client-identifier-kind-hint" className="text-xs text-muted-foreground">{t("kindHint")}</p>
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
