"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
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
  /** Preserve the shipped empty-at-zero presentation for journal-style
   *  fields. Set false where zero and null are distinct DB-owned states. */
  zeroIsBlank?: boolean;
  /** Sizes the component's wrapper when it participates in flex/grid rows. */
  containerClassName?: string;
};

function formattedInputValue(cents: number | null, zeroIsBlank: boolean): string {
  if (cents === null || (zeroIsBlank && cents === 0)) return "";
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
  zeroIsBlank = true,
  containerClassName,
  className,
  id,
  placeholder,
  "aria-describedby": describedBy,
  "aria-invalid": invalid,
  ...inputProps
}: MoneyInputProps) {
  const t = useTranslations("MoneyInput");
  const generatedId = React.useId().replace(/[^A-Za-z0-9_-]/g, "");
  const refusalId = `${id ?? `money-input-${generatedId}`}-refusal`;
  const [raw, setRaw] = React.useState(() => formattedInputValue(cents, zeroIsBlank));
  const [refusal, setRefusal] = React.useState<MoneyInputRefusal | null>(null);
  const lastEmitted = React.useRef<number | null>(cents);

  React.useEffect(() => {
    if (cents !== lastEmitted.current) {
      setRaw(formattedInputValue(cents, zeroIsBlank));
      setRefusal(null);
      lastEmitted.current = cents;
    }
  }, [cents, zeroIsBlank]);

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
    if (result.ok) {
      // A stored zero may intentionally mount blank, but once the human types
      // zero, blur must not erase what they just entered.
      setRaw(result.cents === null ? "" : formatCents(result.cents));
    }
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
    <div className={cn("grid gap-1", containerClassName)}>
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
        <p id={refusalId} aria-live="polite" className="text-xs text-error">
          {refusalCopy}
        </p>
      ) : null}
    </div>
  );
}
