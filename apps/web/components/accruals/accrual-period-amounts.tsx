"use client";

// #937 — THE PER-PERIOD AMOUNTS BLOCK.
//
// An accountant whose July rent is 3,000 and whose August rent is 3,500 states each period's own
// figure here. One implementation, two surfaces: the CREATE form (#652) and the CORRECTION form
// (#936) render the same block, because "what does each period accrue" is one question and a
// second copy of it is one more place for the two to disagree about what a valid set is.
//
// THE DUE DATE IS CHOSEN, NEVER TYPED. The dates come from the schedule itself
// (`accrualScheduleDues`, the mirror of `clara._plan_due_nth`'s own walk), so the door's
// `accrual_period_amount_not_scheduled` refusal is unreachable from this surface — a form does not
// offer a control whose only outcome is a refusal (裁-187). A row whose date is no longer produced
// (a restored draft under a schedule the preparer has since changed) keeps its value in the select
// so the figure is not silently dropped; the validator names it.
//
// THE RUNNING TOTAL IS BESIDE THE CONTROLS. The exact-sum rule is the door's
// (`accrual_period_amounts_unbalanced`), and a preparer typing six periods cannot hold the
// arithmetic in their head: the block shows what has been stated against what the accrual totals,
// and says which way it is out.
//
// NARROW WIDTH AND KEYBOARD. Every row is `flex flex-wrap`, so at phone width the date, the amount
// and the remove button stack instead of scrolling sideways; every control is a real `<select>`,
// `<input>` or `<button>` in the reading order, each with its own `<label>`; and "Add a period"
// appends the next due date the set does not yet cover, so the common path is one keystroke per
// period rather than a date hunt.

import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/common/native-select";
import { MoneyInput } from "@/components/common/money-input";
import { formatMyr } from "@/lib/bank/money";
import type { FieldNode } from "@/components/accounting/journal-basis-fields";
import type { AccrualPeriodAmountDraft } from "@/lib/work/accrual-draft";

type Translate = (key: string, values?: Record<string, string | number>) => string;

export function AccrualPeriodAmountsBlock({
  t,
  id,
  rows,
  dues,
  totalCents,
  disabled = false,
  error,
  onChange,
  registerField,
}: {
  t: Translate;
  /** The element id the block's label, its error and a focus call all name. */
  id: string;
  rows: readonly AccrualPeriodAmountDraft[];
  /** Every due date this schedule produces inside the authority window, oldest first. */
  dues: readonly string[];
  /** The accrual's own `amount_cents` — the TOTAL under this rule. */
  totalCents: number;
  disabled?: boolean;
  error: string | null;
  onChange: (rows: AccrualPeriodAmountDraft[]) => void;
  registerField: (node: FieldNode | null) => void;
}) {
  const stated = rows.reduce((a, r) => a + (Number.isSafeInteger(r.amountCents) ? r.amountCents : 0), 0);
  const taken = useMemo(() => new Set(rows.map((r) => r.dueDate)), [rows]);
  const nextFree = dues.find((d) => !taken.has(d)) ?? "";

  const setRow = (index: number, next: Partial<AccrualPeriodAmountDraft>) => {
    onChange(rows.map((r, i) => (i === index ? { ...r, ...next } : r)));
  };

  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-sm font-medium" id={`${id}-label`}>{t("periodAmountsHeading")}</h4>
      <p className="max-w-prose text-xs text-muted-foreground">{t("periodAmountsHint")}</p>

      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("periodAmountsEmpty")}</p>
      ) : null}

      <ul className="flex flex-col gap-2" aria-labelledby={`${id}-label`}>
        {rows.map((row, index) => (
          <li key={`${row.dueDate}-${index}`} className="flex flex-wrap items-end gap-2">
            <div className="flex min-w-40 flex-1 flex-col gap-1">
              <label className="text-xs font-medium" htmlFor={`${id}-due-${index}`}>
                {t("periodAmountDue")}
              </label>
              <NativeSelect
                id={`${id}-due-${index}`}
                value={row.dueDate}
                disabled={disabled}
                onChange={(e) => setRow(index, { dueDate: e.target.value })}
              >
                <option value="">{t("periodAmountChooseDue")}</option>
                {/* THE ROW'S OWN VALUE STAYS SELECTABLE even when the schedule no longer produces
                    it, so a restored draft does not silently lose a figure a person typed. */}
                {(dues.includes(row.dueDate) || row.dueDate === ""
                  ? dues
                  : [row.dueDate, ...dues]
                ).map((due) => (
                  <option key={due} value={due} disabled={due !== row.dueDate && taken.has(due)}>
                    {due}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="flex min-w-40 flex-1 flex-col gap-1">
              <label className="text-xs font-medium" htmlFor={`${id}-amount-${index}`}>
                {t("periodAmountAmount")}
              </label>
              <MoneyInput
                id={`${id}-amount-${index}`}
                ref={index === 0 ? ((node) => registerField(node)) : undefined}
                cents={row.amountCents}
                mode="unsigned"
                disabled={disabled}
                aria-invalid={error === null ? undefined : true}
                aria-describedby={`${id}-error`}
                onValueChange={(change) => {
                  if (change.ok) setRow(index, { amountCents: change.cents ?? 0 });
                }}
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => onChange(rows.filter((_r, i) => i !== index))}
            >
              {t("periodAmountRemove", { due: row.dueDate === "" ? "—" : row.dueDate })}
            </Button>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || dues.length === 0 || nextFree === ""}
          onClick={() => onChange([...rows, { dueDate: nextFree, amountCents: 0 }])}
        >
          {t("periodAmountAdd")}
        </Button>
        {/* THE RUNNING TOTAL, AND WHICH WAY IT IS OUT. The door's exact-sum rule is the authority;
            this is the arithmetic beside the controls so a preparer is not asked to do it. */}
        <p className="text-xs text-muted-foreground">
          {stated === totalCents
            ? t("periodAmountsBalanced", { stated: formatMyr(stated) })
            : t("periodAmountsRunning", {
              stated: formatMyr(stated),
              total: formatMyr(totalCents),
              difference: formatMyr(Math.abs(stated - totalCents)),
              direction: stated > totalCents ? t("periodAmountsOver") : t("periodAmountsUnder"),
            })}
        </p>
      </div>

      <p id={`${id}-error`} className="text-xs text-error" role={error === null ? undefined : "alert"}>
        {error ?? ""}
      </p>
    </div>
  );
}
