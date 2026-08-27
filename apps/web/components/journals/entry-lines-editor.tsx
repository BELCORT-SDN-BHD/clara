"use client";

// A controlled editor for a journal entry's line array — shared by the compose
// dialog (a brand-new entry) and the drafts panel's revise form (an existing
// entry's lines). Emits `EntryLineInput[]` (lib/journals/types.ts) — the exact
// shape `draft_entry`/`revise_entry` accept as `p_lines`. This component does
// NOT validate balance or account existence itself — the DB is the authority
// (CLR07/CLR10 on a real submit); it only shows the client-side PRESENTATION
// sum (lib/journals/balance.ts's `sumLines`) so a preparer can see it before
// submitting.

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Money } from "@/components/journals/money";
import { useAmountInput } from "@/components/journals/use-amount-input";
import { sumLines } from "@/lib/journals/balance";
import type { CoaAccountRow, EntryLineInput } from "@/lib/journals/types";

/** FIX-3 (independent review) — see use-amount-input.ts's header for the bug
 *  and the fix; this is only the thin DOM-event wrapper around it. */
function AmountInput({
  cents,
  onChange,
  ariaLabel,
}: {
  cents: number;
  onChange: (cents: number) => void;
  ariaLabel: string;
}) {
  const { raw, handleChange } = useAmountInput(cents, onChange);
  return (
    <Input
      aria-label={ariaLabel}
      type="number"
      step="0.01"
      min="0"
      className="text-right"
      value={raw}
      onChange={(e) => handleChange(e.target.value)}
    />
  );
}

export function EntryLinesEditor({
  lines,
  onChange,
  accounts,
}: {
  lines: EntryLineInput[];
  onChange: (lines: EntryLineInput[]) => void;
  accounts: CoaAccountRow[];
}) {
  const t = useTranslations("JournalsWorkbench.linesEditor");
  const activeAccounts = accounts.filter((a) => a.is_active);

  function updateLine(index: number, patch: Partial<EntryLineInput>) {
    onChange(lines.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }
  function removeLine(index: number) {
    onChange(lines.filter((_, i) => i !== index));
  }
  function addLine() {
    onChange([...lines, { account_code: activeAccounts[0]?.account_code ?? "", debit_cents: 0, credit_cents: 0, description: "" }]);
  }

  // N8 (independent review): ONE balance computation (lib/journals/balance.ts's
  // `sumLines`), not a third hand-rolled reduce living beside DraftDetail's and
  // PostedPanel's own — `.balanced` is a real consumer here, not a dead field.
  const balance = sumLines(lines);

  return (
    <div className="flex flex-col gap-2">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="text-xs text-muted-foreground">
            <th className="pb-1 pr-2 font-medium">{t("account")}</th>
            <th className="pb-1 pr-2 font-medium">{t("description")}</th>
            <th className="pb-1 pr-2 text-right font-medium">{t("debit")}</th>
            <th className="pb-1 pr-2 text-right font-medium">{t("credit")}</th>
            <th className="pb-1" />
          </tr>
        </thead>
        <tbody>
          {lines.map((line, i) => (
            <tr key={i}>
              <td className="pr-2 pb-1">
                <select
                  aria-label={t("account")}
                  value={line.account_code}
                  onChange={(e) => updateLine(i, { account_code: e.target.value })}
                  className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm"
                >
                  <option value="">{t("selectAccount")}</option>
                  {activeAccounts.map((a) => (
                    <option key={a.account_code} value={a.account_code}>
                      {a.account_code} — {a.name}
                    </option>
                  ))}
                </select>
              </td>
              <td className="pr-2 pb-1">
                <Input
                  aria-label={t("description")}
                  value={line.description ?? ""}
                  onChange={(e) => updateLine(i, { description: e.target.value })}
                />
              </td>
              <td className="pr-2 pb-1">
                <AmountInput
                  ariaLabel={t("debit")}
                  cents={line.debit_cents}
                  onChange={(debit_cents) => updateLine(i, { debit_cents, credit_cents: 0 })}
                />
              </td>
              <td className="pr-2 pb-1">
                <AmountInput
                  ariaLabel={t("credit")}
                  cents={line.credit_cents}
                  onChange={(credit_cents) => updateLine(i, { credit_cents, debit_cents: 0 })}
                />
              </td>
              <td className="pb-1">
                <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeLine(i)} aria-label={t("removeLine")}>
                  ×
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="text-sm font-medium">
            <td colSpan={2} className="pt-1 text-right text-muted-foreground">
              {t("presentationSumLabel")}
            </td>
            <td className={`pt-1 text-right ${balance.balanced ? "" : "text-warning"}`}>
              <Money cents={balance.debitCents} />
            </td>
            <td className={`pt-1 text-right ${balance.balanced ? "" : "text-warning"}`}>
              <Money cents={balance.creditCents} />
            </td>
            <td />
          </tr>
          {!balance.balanced && (
            <tr>
              <td colSpan={5} className="pt-1 text-right text-xs text-warning">
                {t("notBalanced")}
              </td>
            </tr>
          )}
        </tfoot>
      </table>
      <Button type="button" variant="outline" size="sm" onClick={addLine}>
        {t("addLine")}
      </Button>
    </div>
  );
}
