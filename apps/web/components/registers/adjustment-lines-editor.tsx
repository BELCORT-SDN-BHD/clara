"use client";

// A controlled editor for propose_adjustment_template's `p_lines` array — the
// same house line shape every manual entry uses (>=2 lines, each exactly one
// positive debit XOR credit, balanced to the sen). This component does NOT
// validate balance itself — the DB is the authority (a real CLR10 renders
// verbatim in the dialog's caller); it only shows the client-side
// PRESENTATION sum so a preparer can see it before submitting (hard
// constraint 2: never a computed figure the UI trusts as authoritative).
//
// Own copy of the pattern components/registers/staff-advance-lines-editor.tsx
// already proved, kept domain-local per the house door-dialog convention
// (apps/web/components/reports/DoorDialog.tsx:7 — this train's file set stays
// disjoint from staff advances').

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NativeSelect } from "@/components/common/native-select";
import { MoneyInput } from "@/components/common/money-input";
import { fmtCents } from "@/lib/registers/money";
import type { AccountRow } from "@/lib/registers/accounts";
import type { AdjustmentTemplateLineInput } from "@/lib/registers/adjustments";

export function sumAdjustmentLines(lines: AdjustmentTemplateLineInput[]): { debitCents: number; creditCents: number; balanced: boolean } {
  let debitCents = 0;
  let creditCents = 0;
  for (const line of lines) {
    debitCents += line.debit_cents;
    creditCents += line.credit_cents;
  }
  return { debitCents, creditCents, balanced: debitCents === creditCents };
}

export function AdjustmentLinesEditor({
  lines,
  onChange,
  accounts,
}: {
  lines: AdjustmentTemplateLineInput[];
  onChange: (lines: AdjustmentTemplateLineInput[]) => void;
  accounts: AccountRow[];
}) {
  const t = useTranslations("AdjustmentsAccounts.linesEditor");
  const tc = useTranslations("Common");
  const activeAccounts = accounts.filter((a) => a.is_active);

  function updateLine(index: number, patch: Partial<AdjustmentTemplateLineInput>) {
    onChange(lines.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }
  function removeLine(index: number) {
    onChange(lines.filter((_, i) => i !== index));
  }
  function addLine() {
    onChange([...lines, { account_code: activeAccounts[0]?.account_code ?? "", debit_cents: 0, credit_cents: 0 }]);
  }

  const balance = sumAdjustmentLines(lines);

  return (
    <div className="flex flex-col gap-2">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8">{t("lineNo")}</TableHead>
            <TableHead>{t("account")}</TableHead>
            <TableHead className="text-right">{t("debit")}</TableHead>
            <TableHead className="text-right">{t("credit")}</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((line, i) => (
            <TableRow key={i}>
              <TableCell className="text-muted-foreground">{i + 1}</TableCell>
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
              {fmtCents(balance.debitCents, tc("centsUnsafe"))}
            </TableCell>
            <TableCell className={balance.balanced ? "text-right" : "text-right text-warning"}>
              {fmtCents(balance.creditCents, tc("centsUnsafe"))}
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
