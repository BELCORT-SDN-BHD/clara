"use client";

// The composer's LINE table — the two-dimensional half of the form, split out of
// journal-composer.tsx so each stays independently reviewable and neither
// crosses the module budget.
//
// IT IS A SIBLING OF `components/journals/entry-lines-editor.tsx`, NOT A
// REPLACEMENT, and the difference is what each one submits. That editor feeds
// the manual `draft_entry`/`revise_entry` ceremony (#634 owns its rebuild); this
// one feeds a durable WORK admission, whose validation must name a FIELD so the
// form can focus it. The shared pieces are actually shared — `MoneyInput` owns
// exact-cent entry, `NativeSelect` owns the account picker, `Money` owns
// currency rendering, and none of them is re-implemented here.
//
// WHY NOT REUSE THAT COMPONENT WHOLE. It takes `EntryLineInput[]` and reports
// nothing but the new array: it has no notion of a per-field error, no ids to
// focus, and its footer renders a warning row rather than a labelled difference.
// Widening it to carry both surfaces' error models would put this journey's
// rules inside a component another ticket is about to rebuild. Two editors, one
// vocabulary of parts.
//
// THE TABLE HAS ITS OWN LABELLED HORIZONTAL VIEWPORT, which is the `<Table>`
// primitive's own behaviour once it is given an `aria-label` (components/ui/
// table.tsx's provenance note): the region becomes a named, keyboard-reachable
// scroller. That is what keeps a four-column money grid usable at 320 CSS px
// without the PAGE scrolling sideways.

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NativeSelect } from "@/components/common/native-select";
import { MoneyInput } from "@/components/common/money-input";
import { Money } from "@/components/journals/money";
import { totalsOf, type JournalDraftLine, type JournalFieldId, type JournalIssue } from "@/lib/work/journal-basis";
import type { CoaAccountRow } from "@/lib/journals/types";

/** The DOM id of one control — used for `aria-describedby`, and as the label a
 *  test reads back off a focused node. */
export function fieldElementId(field: JournalFieldId): string {
  return `journal-basis-${field.replace(/\./g, "-")}`;
}

/**
 * How a field tells the form where it is.
 *
 * THE FORM HOLDS REFS, NOT IDS, and the reason is not React taste: a
 * `document.getElementById` focus routine is coupled to a global that a
 * component does not own, cannot be exercised without a document that
 * implements it, and silently focuses NOTHING when an id is mistyped. A ref
 * callback is the element itself — so "focus the first invalid control" is a
 * direct call on a node the form is holding, and a field that stops registering
 * reds a cell instead of quietly losing its focus target.
 */
export type RegisterField = (field: JournalFieldId, node: FieldNode | null) => void;

/** The narrow slice of an element this form needs: enough to move focus, and
 *  nothing else. Declared rather than `HTMLElement` so the same contract holds
 *  in a harness whose DOM is a stub. */
export type FieldNode = { focus: () => void };

function issueFor(issues: readonly JournalIssue[], field: JournalFieldId): JournalIssue | undefined {
  return issues.find((issue) => issue.field === field);
}

/** One control's error, rendered BESIDE the control (§3, "Field validation":
 *  "Field error sits by its control") and wired to it by `aria-describedby`, so
 *  a screen reader reads the rule with the field rather than in a list at the
 *  end of the form. */
function FieldError({
  id,
  children,
  focusable,
  register,
}: {
  id: string;
  children: string | null;
  /** Only the focusable, whole-table error registers itself — every other error
   *  belongs to a control that is already registered. */
  register?: (node: FieldNode | null) => void;
  /** Set on the ONE error that has no control of its own — the whole-table rule
   *  ("at least two lines", "not balanced"). `firstInvalidField` can name it, so
   *  it has to be able to RECEIVE focus; a `<p>` with no tabindex silently
   *  ignores `.focus()`, which would leave a failed submit with focus nowhere. */
  focusable?: true;
}) {
  return (
    <p
      id={id}
      ref={register === undefined ? undefined : (node) => register(node)}
      tabIndex={focusable ? -1 : undefined}
      className="text-xs text-error"
      role={children === null ? undefined : "alert"}
    >
      {children ?? ""}
    </p>
  );
}

export function JournalBasisFields({
  lines,
  onChange,
  accounts,
  issues,
  disabled,
  registerField,
}: {
  lines: JournalDraftLine[];
  onChange: (lines: JournalDraftLine[]) => void;
  /** The client's chart, already filtered to what a new line may post to. */
  accounts: readonly CoaAccountRow[];
  /** Only shown once a submit has been attempted — the composer holds that
   *  decision, so this component renders whatever list it is handed. */
  issues: readonly JournalIssue[];
  disabled: boolean;
  registerField: RegisterField;
}) {
  const t = useTranslations("JournalComposer");
  const activeAccounts = accounts.filter((a) => a.is_active);
  const totals = totalsOf(lines);

  const update = (index: number, patch: Partial<JournalDraftLine>) => {
    onChange(lines.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  };
  const remove = (index: number) => onChange(lines.filter((_, i) => i !== index));
  const add = () =>
    onChange([...lines, { account_code: "", debit_cents: 0, credit_cents: 0, description: "" }]);

  const message = (field: JournalFieldId): string | null => {
    const issue = issueFor(issues, field);
    return issue === undefined ? null : t(`issues.${issue.code}`);
  };

  return (
    <div className="flex flex-col gap-2">
      <Table aria-label={t("linesTableLabel")}>
        <TableHeader>
          <TableRow>
            <TableHead>{t("account")}</TableHead>
            <TableHead>{t("lineDescription")}</TableHead>
            <TableHead className="text-right">{t("debit")}</TableHead>
            <TableHead className="text-right">{t("credit")}</TableHead>
            <TableHead>
              <span className="sr-only">{t("rowActions")}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((line, i) => {
            const accountField: JournalFieldId = `line.${i}.account`;
            const debitField: JournalFieldId = `line.${i}.debit`;
            const creditField: JournalFieldId = `line.${i}.credit`;
            const accountMessage = message(accountField);
            const debitMessage = message(debitField);
            const creditMessage = message(creditField);
            return (
              <TableRow key={i}>
                <TableCell>
                  <NativeSelect
                    id={fieldElementId(accountField)}
                    ref={(node) => registerField(accountField, node)}
                    aria-label={t("accountForLine", { line: i + 1 })}
                    aria-invalid={accountMessage === null ? undefined : true}
                    aria-describedby={`${fieldElementId(accountField)}-error`}
                    value={line.account_code}
                    disabled={disabled}
                    onChange={(e) => update(i, { account_code: e.target.value })}
                    className="w-full"
                  >
                    <option value="">{t("selectAccount")}</option>
                    {activeAccounts.map((a) => (
                      <option key={a.account_code} value={a.account_code}>
                        {a.account_code} — {a.name}
                      </option>
                    ))}
                  </NativeSelect>
                  <FieldError id={`${fieldElementId(accountField)}-error`}>{accountMessage}</FieldError>
                </TableCell>
                <TableCell>
                  <Input
                    aria-label={t("descriptionForLine", { line: i + 1 })}
                    value={line.description ?? ""}
                    disabled={disabled}
                    onChange={(e) => update(i, { description: e.target.value })}
                  />
                </TableCell>
                <TableCell>
                  {/* ONE SIDE PER LINE, enforced at the KEYSTROKE and not only at
                      submit: typing a debit zeroes the credit, exactly as
                      entry-lines-editor.tsx already does. The submit-time rule
                      still exists (a restored draft can carry both), but a
                      preparer should never have to be told about a rule the form
                      could simply keep. */}
                  <MoneyInput
                    id={fieldElementId(debitField)}
                    ref={(node) => registerField(debitField, node)}
                    aria-label={t("debitForLine", { line: i + 1 })}
                    aria-invalid={debitMessage === null ? undefined : true}
                    aria-describedby={`${fieldElementId(debitField)}-error`}
                    cents={line.debit_cents}
                    mode="unsigned"
                    disabled={disabled}
                    className="text-right"
                    onValueChange={(change) => {
                      if (change.ok) update(i, { debit_cents: change.cents ?? 0, credit_cents: 0 });
                    }}
                  />
                  <FieldError id={`${fieldElementId(debitField)}-error`}>{debitMessage}</FieldError>
                </TableCell>
                <TableCell>
                  <MoneyInput
                    id={fieldElementId(creditField)}
                    ref={(node) => registerField(creditField, node)}
                    aria-label={t("creditForLine", { line: i + 1 })}
                    aria-invalid={creditMessage === null ? undefined : true}
                    aria-describedby={`${fieldElementId(creditField)}-error`}
                    cents={line.credit_cents}
                    mode="unsigned"
                    disabled={disabled}
                    className="text-right"
                    onValueChange={(change) => {
                      if (change.ok) update(i, { credit_cents: change.cents ?? 0, debit_cents: 0 });
                    }}
                  />
                  <FieldError id={`${fieldElementId(creditField)}-error`}>{creditMessage}</FieldError>
                </TableCell>
                <TableCell>
                  {/* The last two lines cannot be removed: a journal entry needs
                      two sides, and a control that can only ever produce an
                      error is not an affordance (裁-187). */}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={disabled || lines.length <= 2}
                    onClick={() => remove(i)}
                    aria-label={t("removeLine", { line: i + 1 })}
                  >
                    ×
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={2} className="text-right text-muted-foreground">
              {t("presentationSumLabel")}
            </TableCell>
            <TableCell className="text-right">
              <Money cents={totals.debitCents} />
            </TableCell>
            <TableCell className="text-right">
              <Money cents={totals.creditCents} />
            </TableCell>
            <TableCell />
          </TableRow>
          {/* THE DIFFERENCE IS ALWAYS RENDERED, in exact cents, rather than only
              when it is non-zero. A preparer checking a balanced entry wants to
              SEE the zero; showing the row only on failure makes its absence
              ambiguous between "balanced" and "not computed yet". */}
          <TableRow>
            <TableCell colSpan={2} className="text-right text-muted-foreground">
              {t("differenceLabel")}
            </TableCell>
            <TableCell colSpan={2} className={totals.balanced ? "text-right" : "text-right text-warning"}>
              <Money cents={totals.differenceCents} />
            </TableCell>
            <TableCell />
          </TableRow>
        </TableFooter>
      </Table>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={add}>
          {t("addLine")}
        </Button>
        <FieldError
          id={fieldElementId("lines")}
          focusable
          register={(node) => registerField("lines", node)}
        >
          {message("lines")}
        </FieldError>
      </div>
    </div>
  );
}
