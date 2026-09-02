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
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NativeSelect } from "@/components/common/native-select";
import { MoneyInput } from "@/components/common/money-input";
import { Money } from "@/components/journals/money";
import { sumLines } from "@/lib/journals/balance";
import type { CoaAccountRow, EntryLineInput } from "@/lib/journals/types";

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
      {/* P3 polish: the shared Table primitive here too, so the editor and the
          read-only view of the SAME lines (drafts-queue-panel.tsx, shown when
          not editing) no longer swap between two densities as you toggle
          Revise. The `<select>` picked up the shared <NativeSelect>, which is
          what finally gives it the same focus ring as the Input beside it. */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("account")}</TableHead>
            <TableHead>{t("description")}</TableHead>
            <TableHead className="text-right">{t("debit")}</TableHead>
            <TableHead className="text-right">{t("credit")}</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((line, i) => (
            <TableRow key={i}>
              <TableCell>
                <NativeSelect
                  aria-label={t("account")}
                  value={line.account_code}
                  onChange={(e) => updateLine(i, { account_code: e.target.value })}
                  className="w-full"
                >
                  <option value="">{t("selectAccount")}</option>
                  {activeAccounts.map((a) => (
                    <option key={a.account_code} value={a.account_code}>
                      {a.account_code} — {a.name}
                    </option>
                  ))}
                </NativeSelect>
              </TableCell>
              <TableCell>
                <Input
                  aria-label={t("description")}
                  value={line.description ?? ""}
                  onChange={(e) => updateLine(i, { description: e.target.value })}
                />
              </TableCell>
              <TableCell>
                <MoneyInput
                  aria-label={t("debit")}
                  cents={line.debit_cents}
                  mode="unsigned"
                  className="text-right"
                  onValueChange={(change) => {
                    if (change.ok) updateLine(i, { debit_cents: change.cents ?? 0, credit_cents: 0 });
                  }}
                />
              </TableCell>
              <TableCell>
                <MoneyInput
                  aria-label={t("credit")}
                  cents={line.credit_cents}
                  mode="unsigned"
                  className="text-right"
                  onValueChange={(change) => {
                    if (change.ok) updateLine(i, { credit_cents: change.cents ?? 0, debit_cents: 0 });
                  }}
                />
              </TableCell>
              <TableCell>
                <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeLine(i)} aria-label={t("removeLine")}>
                  ×
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={2} className="text-right text-muted-foreground">
              {t("presentationSumLabel")}
            </TableCell>
            <TableCell className={balance.balanced ? "text-right" : "text-right text-warning"}>
              <Money cents={balance.debitCents} />
            </TableCell>
            <TableCell className={balance.balanced ? "text-right" : "text-right text-warning"}>
              <Money cents={balance.creditCents} />
            </TableCell>
            <TableCell />
          </TableRow>
          {!balance.balanced && (
            <TableRow>
              <TableCell colSpan={5} className="text-right text-xs text-warning">
                {t("notBalanced")}
              </TableCell>
            </TableRow>
          )}
        </TableFooter>
      </Table>
      <Button type="button" variant="outline" size="sm" onClick={addLine}>
        {t("addLine")}
      </Button>
    </div>
  );
}
