"use client";

// A controlled editor for a journal entry's line array — shared by the compose
// dialog (a brand-new entry) and the drafts panel's revise form (an existing
// entry's lines). Emits `EntryLineInput[]` (lib/journals/types.ts) — the exact
// shape `draft_entry`/`revise_entry` accept as `p_lines`. This component does
// NOT validate balance or account existence itself — the DB is the authority
// (CLR07/CLR10 on a real submit); it only shows the client-side PRESENTATION
// sum (lib/journals/balance.ts) so a preparer can see it before submitting.

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CoaAccountRow, EntryLineInput } from "@/lib/journals/types";
import { formatCents } from "@/lib/journals/balance";

function centsFromInput(raw: string): number {
  const n = Math.round(Number(raw) * 100);
  return Number.isFinite(n) ? n : 0;
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

  const debitTotal = lines.reduce((sum, l) => sum + l.debit_cents, 0);
  const creditTotal = lines.reduce((sum, l) => sum + l.credit_cents, 0);

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
                <Input
                  aria-label={t("debit")}
                  type="number"
                  step="0.01"
                  min="0"
                  className="text-right"
                  value={line.debit_cents ? (line.debit_cents / 100).toFixed(2) : ""}
                  onChange={(e) => updateLine(i, { debit_cents: centsFromInput(e.target.value), credit_cents: 0 })}
                />
              </td>
              <td className="pr-2 pb-1">
                <Input
                  aria-label={t("credit")}
                  type="number"
                  step="0.01"
                  min="0"
                  className="text-right"
                  value={line.credit_cents ? (line.credit_cents / 100).toFixed(2) : ""}
                  onChange={(e) => updateLine(i, { credit_cents: centsFromInput(e.target.value), debit_cents: 0 })}
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
            <td className="pt-1 text-right">{formatCents(debitTotal)}</td>
            <td className="pt-1 text-right">{formatCents(creditTotal)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
      <Button type="button" variant="outline" size="sm" onClick={addLine}>
        {t("addLine")}
      </Button>
    </div>
  );
}
