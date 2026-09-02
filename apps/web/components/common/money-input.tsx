"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import { Input } from "@/components/ui/input";
import {
  formatCents,
  parseMoneyInput,
  type MoneyInputRefusal,
  type MoneyParseResult,
} from "@/lib/bank/money";

export type MoneyInputMode = "signed" | "unsigned";
export type MoneyInputChange = MoneyParseResult;

type InputProps = React.ComponentProps<typeof Input>;

export type MoneyInputProps = Omit<
  InputProps,
  "defaultValue" | "inputMode" | "onBlur" | "onChange" | "type" | "value"
> & {
  cents: number | null;
  mode: MoneyInputMode;
  onValueChange: (change: MoneyInputChange) => void;
};

function formattedInputValue(cents: number | null, mode: MoneyInputMode): string {
  if (cents === null || (mode === "unsigned" && cents === 0)) return "";
  return formatCents(cents);
}

/** Clara's one cents-entry module. It owns raw keystroke fidelity, exact
 * string parsing, signed/unsigned policy, formatted resync, and the visible
 * validation state so callers only choose the accounting mode and consume a
 * typed accepted/refused result. */
export function MoneyInput({
  cents,
  mode,
  onValueChange,
  className,
  id,
  placeholder,
  "aria-describedby": describedBy,
  "aria-invalid": invalid,
  ...inputProps
}: MoneyInputProps) {
  const t = useTranslations("MoneyInput");
  const generatedId = React.useId().replaceAll(":", "");
  const refusalId = `${id ?? `money-input-${generatedId}`}-refusal`;
  const [raw, setRaw] = React.useState(() => formattedInputValue(cents, mode));
  const [refusal, setRefusal] = React.useState<MoneyInputRefusal | null>(null);
  const lastEmitted = React.useRef<number | null>(cents);

  React.useEffect(() => {
    if (cents !== lastEmitted.current) {
      setRaw(formattedInputValue(cents, mode));
      setRefusal(null);
      lastEmitted.current = cents;
    }
  }, [cents, mode]);

  function handleChange(value: string) {
    setRaw(value);
    const result = parseMoneyInput(value, { signed: mode === "signed" });
    if (result.ok) {
      setRefusal(null);
      lastEmitted.current = result.cents;
    } else {
      setRefusal(result.refusal);
    }
    onValueChange(result);
  }

  function handleBlur() {
    const result = parseMoneyInput(raw, { signed: mode === "signed" });
    if (result.ok) setRaw(formattedInputValue(result.cents, mode));
  }

  const refusalCopy = refusal === null
    ? null
    : {
        invalid_format: t("refusals.invalidFormat"),
        negative_not_allowed: t("refusals.negativeNotAllowed"),
        out_of_range: t("refusals.outOfRange"),
      }[refusal.code];
  const ariaDescribedBy = [describedBy, refusalCopy ? refusalId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className="grid gap-1">
      <Input
        {...inputProps}
        id={id}
        className={className}
        type="text"
        inputMode="decimal"
        placeholder={placeholder ?? t("placeholder")}
        value={raw}
        aria-invalid={refusalCopy ? true : invalid}
        aria-describedby={ariaDescribedBy}
        onChange={(event) => handleChange(event.target.value)}
        onBlur={handleBlur}
      />
      {refusalCopy ? (
        <p id={refusalId} role="alert" className="text-xs text-destructive">
          {refusalCopy}
        </p>
      ) : null}
    </div>
  );
}
