"use client";

// #626 (refresh spec #612, journey D1) — ONE reusable closed-enum field, used
// twice by interface-section.tsx (motion, sidebarDefault). FieldSet + legend is
// the house composition for a related set of Radio controls (component-contract
// research row 46 "Radio Group … with FieldSet/legend"; row 28 "Field … replaces
// ad hoc label/error layout") — never a bare `<div>` of labelled inputs.

import { useEffect, useId, useRef } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldDescription, FieldError, FieldLegend, FieldSet } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export type RadioFieldOption<T extends string> = {
  readonly value: T;
  readonly label: string;
  readonly description?: string;
};

export function PreferenceRadioField<T extends string>({
  name,
  legend,
  scopeLabel,
  description,
  options,
  value,
  dirty,
  disabled,
  invalid,
  errorMessage,
  focusRequestToken,
  onChange,
  onReset,
  unsavedLabel,
  resetLabel,
}: {
  name: string;
  legend: string;
  /** "Your setting" — every field this component renders is user-scoped
   *  (never a firm-wide value), and that has to be stated, not implied. */
  scopeLabel: string;
  description?: string;
  options: readonly RadioFieldOption<T>[];
  value: T | undefined;
  /** A per-field UNSAVED marker — true only when THIS field's draft differs
   *  from the authoritative stored value (lib/settings/preference-state.ts's
   *  `isFieldDirty`), never a whole-form flag. */
  dirty: boolean;
  disabled?: boolean;
  invalid?: boolean;
  errorMessage?: string;
  /** Bump this (any changing number) to move focus to this field's first
   *  radio — the first-invalid-focus contract on a refused save. A counter
   *  rather than a boolean so a SECOND refusal against the SAME field, with
   *  the SAME token value it would otherwise produce, still re-fires the
   *  effect. */
  focusRequestToken?: number;
  onChange: (value: T) => void;
  onReset: () => void;
  unsavedLabel: string;
  resetLabel: string;
}) {
  const legendId = useId();
  const containerRef = useRef<HTMLFieldSetElement>(null);

  useEffect(() => {
    if (!focusRequestToken) return;
    // First-invalid-focus means the option the person actually CHOSE (the one a refused save
    // was refusing), never merely the first radio in the list — a caller who picked the second
    // option must not watch focus jump to the first one instead.
    const container = containerRef.current;
    const checked = container?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]');
    (checked ?? container?.querySelector<HTMLElement>('[role="radio"]'))?.focus();
  }, [focusRequestToken]);

  return (
    <FieldSet ref={containerRef} data-invalid={invalid || undefined} aria-labelledby={legendId}>
      <div className="flex flex-wrap items-center gap-2">
        <FieldLegend id={legendId} variant="label" className="mb-0">
          {legend}
        </FieldLegend>
        {/* USER SCOPE, stated on every field, never left implicit — the
         *  acceptance line this badge exists for: a reader must never have
         *  to guess whether a control changes THEIR OWN experience or the
         *  firm's. Every field in this section is user-scoped by construction
         *  (clara.user_preferences is keyed by person, not by firm), so the
         *  badge is constant here rather than conditional. */}
        <Badge variant="outline" className="font-normal">
          {scopeLabel}
        </Badge>
      </div>
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      <RadioGroup
        value={value}
        onValueChange={(next) => onChange(next as T)}
        name={name}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid && errorMessage ? `${name}-error` : undefined}
      >
        {options.map((option) => {
          // The wrapping <label> keeps the whole row a click target, but a native label's
          // accessible-name computation folds in EVERY text node it wraps — left as-is, each
          // radio's announced name would be "Collapsed Start with icons only; expand it any
          // time." rather than "Collapsed", and an exact-name query (or a screen reader user
          // expecting a short choice) could never isolate the option label from its description.
          // Explicit aria-labelledby/aria-describedby override that fold, so the NAME stays just
          // the option label and the description stays a description, exactly the
          // money-input.tsx / password-policy.tsx convention this codebase already uses for
          // "one visible hint, bound by id, never folded into the name".
          const labelId = `${name}-${option.value}-label`;
          const descriptionId = option.description ? `${name}-${option.value}-description` : undefined;
          return (
            <label key={option.value} className="flex items-start gap-2 text-sm font-normal text-foreground">
              <RadioGroupItem
                value={option.value}
                className="mt-0.5"
                aria-labelledby={labelId}
                aria-describedby={descriptionId}
              />
              <span className="flex flex-col gap-0.5">
                <span id={labelId} className="font-medium">
                  {option.label}
                </span>
                {option.description ? (
                  <span id={descriptionId} className="text-xs text-muted-foreground">
                    {option.description}
                  </span>
                ) : null}
              </span>
            </label>
          );
        })}
      </RadioGroup>
      {dirty ? (
        <div className="flex items-center gap-2">
          <Badge variant="outline">{unsavedLabel}</Badge>
          <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={onReset}>
            {resetLabel}
          </Button>
        </div>
      ) : null}
      {invalid && errorMessage ? (
        <FieldError id={`${name}-error`}>{errorMessage}</FieldError>
      ) : null}
    </FieldSet>
  );
}
