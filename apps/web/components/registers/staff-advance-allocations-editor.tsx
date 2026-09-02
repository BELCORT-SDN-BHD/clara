"use client";

// A controlled editor for book_staff_advance_application's `p_allocations`
// array — a REGISTER-side annotation, independent of the GL lines above it
// (WD-R10: "an advance has no control account... the register sits beside
// the GL"). Each row names which 1-based LINE POSITION (from the lines
// editor above it) represents this application's leg, against which
// outstanding advance, for how many cents. `candidates` is the caller's own
// staff_advance_summary read, already narrowed to rows with
// `outstanding_cents > 0` and not voided — a DB-derived list, never a
// client-side guess at what is still owed.

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NativeSelect } from "@/components/common/native-select";
import { MoneyInput } from "@/components/common/money-input";
import { fmtCents } from "@/lib/registers/money";
import type { StaffAdvanceAllocationInput, StaffAdvanceSummaryRow } from "@/lib/registers/staff-advances-doors";

export function StaffAdvanceAllocationsEditor({
  allocations,
  onChange,
  candidates,
  lineCount,
}: {
  allocations: StaffAdvanceAllocationInput[];
  onChange: (allocations: StaffAdvanceAllocationInput[]) => void;
  /** Outstanding advances this application could settle — the caller's own
   *  staff_advance_summary read, already filtered to `outstanding_cents > 0`. */
  candidates: StaffAdvanceSummaryRow[];
  /** The lines editor's current line count — bounds the line_no picker so an
   *  allocation can never name a line that does not exist in this call. */
  lineCount: number;
}) {
  const t = useTranslations("StaffAdvances.allocationsEditor");
  const tc = useTranslations("Common");

  function updateAllocation(index: number, patch: Partial<StaffAdvanceAllocationInput>) {
    onChange(allocations.map((a, i) => (i === index ? { ...a, ...patch } : a)));
  }
  function removeAllocation(index: number) {
    onChange(allocations.filter((_, i) => i !== index));
  }
  function addAllocation() {
    onChange([...allocations, { line_no: 1, advance_id: candidates[0]?.advance_id ?? "", amount_cents: 0 }]);
  }

  return (
    <div className="flex flex-col gap-2">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-20">{t("lineNo")}</TableHead>
            <TableHead>{t("advance")}</TableHead>
            <TableHead className="text-right">{t("amount")}</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {allocations.map((a, i) => (
            <TableRow key={i}>
              <TableCell>
                <NativeSelect
                  aria-label={t("lineNo")}
                  value={String(a.line_no)}
                  onChange={(e) => updateAllocation(i, { line_no: Number(e.target.value) })}
                  className="w-full"
                >
                  {Array.from({ length: lineCount }, (_, n) => n + 1).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </NativeSelect>
              </TableCell>
              <TableCell>
                <NativeSelect
                  aria-label={t("advance")}
                  value={a.advance_id}
                  onChange={(e) => updateAllocation(i, { advance_id: e.target.value })}
                  className="w-full"
                >
                  <option value="">{t("selectAdvance")}</option>
                  {candidates.map((c) => (
                    <option key={c.advance_id} value={c.advance_id}>
                      {c.account_code} — {c.person_label} — {fmtCents(c.outstanding_cents, tc("centsUnsafe"))} {t("outstandingSuffix")}
                    </option>
                  ))}
                </NativeSelect>
              </TableCell>
              <TableCell>
                <MoneyInput
                  aria-label={t("amount")}
                  cents={a.amount_cents}
                  mode="unsigned"
                  onValueChange={(change) => {
                    if (change.ok) updateAllocation(i, { amount_cents: change.cents ?? 0 });
                  }}
                />
              </TableCell>
              <TableCell>
                <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeAllocation(i)} aria-label={t("removeAllocation")}>
                  ×
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Button type="button" variant="outline" size="sm" onClick={addAllocation} disabled={candidates.length === 0}>
        {t("addAllocation")}
      </Button>
      {candidates.length === 0 ? <p className="text-xs text-muted-foreground">{t("noOutstanding")}</p> : null}
    </div>
  );
}
