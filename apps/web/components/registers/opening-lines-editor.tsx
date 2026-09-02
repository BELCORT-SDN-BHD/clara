"use client";

// The controlled line-array editor for T2's gl_balance/bank_uncleared opening
// items — the door-computed shape (`v_amount := v_dr - v_cr` in
// `clara._draft_opening_item_core`), split out of opening-item-fields.tsx for
// file-size discipline. Own copy of the pattern
// components/registers/adjustment-lines-editor.tsx already proved, kept
// domain-local per the house door-dialog convention (one domain, one small
// copy, never a cross-train import).
//
// hard constraint 2: `netCarriedCents` is a PRESENTATION preview only — the
// door recomputes the authoritative net server-side from `p_lines`.

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NativeSelect } from "@/components/common/native-select";
import { MoneyInput } from "@/components/common/money-input";
import type { OpeningLineInput } from "@/lib/registers/opening-types";
import type { AccountRow } from "@/lib/registers/accounts";

export function sumOpeningLines(lines: OpeningLineInput[]): { debitCents: number; creditCents: number; netCarriedCents: number } {
  let debitCents = 0;
  let creditCents = 0;
  for (const l of lines) {
    debitCents += l.debit_cents;
    creditCents += l.credit_cents;
  }
  return { debitCents, creditCents, netCarriedCents: debitCents - creditCents };
}

export function OpeningLinesEditor({
  lines,
  onChange,
  accounts,
}: {
  lines: OpeningLineInput[];
  onChange: (lines: OpeningLineInput[]) => void;
  accounts: AccountRow[];
}) {
  const t = useTranslations("OpeningCarryDown.itemFields");

  function updateLine(i: number, patch: Partial<OpeningLineInput>) {
    onChange(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function removeLine(i: number) {
    onChange(lines.filter((_, idx) => idx !== i));
  }
  function addLine() {
    onChange([...lines, { account_code: accounts[0]?.account_code ?? "", debit_cents: 0, credit_cents: 0 }]);
  }

  return (
    <div className="flex flex-col gap-2">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("account")}</TableHead>
            <TableHead className="text-right">{t("debit")}</TableHead>
            <TableHead className="text-right">{t("credit")}</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((l, i) => (
            <TableRow key={i}>
              <TableCell>
                <NativeSelect aria-label={t("account")} value={l.account_code} onChange={(e) => updateLine(i, { account_code: e.target.value })} className="w-full">
                  <option value="">{t("selectAccount")}</option>
                  {accounts.map((a) => (
                    <option key={a.account_code} value={a.account_code}>{a.account_code} — {a.name}</option>
                  ))}
                </NativeSelect>
              </TableCell>
              <TableCell>
                <MoneyInput aria-label={t("debit")} cents={l.debit_cents} mode="unsigned" className="text-right" onValueChange={(change) => {
                  if (change.ok) updateLine(i, { debit_cents: change.cents ?? 0, credit_cents: 0 });
                }} />
              </TableCell>
              <TableCell>
                <MoneyInput aria-label={t("credit")} cents={l.credit_cents} mode="unsigned" className="text-right" onValueChange={(change) => {
                  if (change.ok) updateLine(i, { credit_cents: change.cents ?? 0, debit_cents: 0 });
                }} />
              </TableCell>
              <TableCell>
                <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeLine(i)} aria-label={t("removeLine")}>×</Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={4} className="text-right text-xs text-muted-foreground">{t("presentationOnly")}</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
      <Button type="button" variant="outline" size="sm" onClick={addLine}>{t("addLine")}</Button>
    </div>
  );
}
