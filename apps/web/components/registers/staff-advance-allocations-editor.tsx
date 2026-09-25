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
//
// #931 — A SECOND CALLER, AND WHAT IT MADE OPTIONAL. A staff expense claim
// settled by advance application now names SEVERAL advances too, and the
// ticket asks that its editor be THIS one rather than a second table that
// drifts. Everything a claim does not have is optional rather than faked:
// it composes no GL lines (its journal is DERIVED by
// `clara._claim_journal_basis`), so it passes no `lineCount` and writes no
// `line_no`; it is already scoped to ONE claimant, so it labels a candidate
// by the facts that tell two of THAT person's advances apart. The
// register's own call is unchanged in behaviour and in type.

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NativeSelect } from "@/components/common/native-select";
import { MoneyInput } from "@/components/common/money-input";
import { fmtCents } from "@/lib/registers/money";
import type { StaffAdvanceSummaryRow } from "@/lib/registers/staff-advances-doors";

/**
 * THE SHAPE EVERY CALLER'S ALLOCATION ROW SHARES: which advance, how many sen, and — only where
 * the caller is composing the GL legs itself — which line position carries the leg.
 *
 * `line_no` is OPTIONAL because #931's caller has no lines to name. The register's own row type
 * still requires one; the generic parameter below is what lets both keep their own shape instead
 * of one widening to the other.
 */
export type AdvanceAllocationRow = {
  line_no?: number;
  advance_id: string;
  amount_cents: number;
};

export function StaffAdvanceAllocationsEditor<T extends AdvanceAllocationRow>({
  allocations,
  onChange,
  candidates,
  lineCount,
  newRow,
  optionLabel,
  sourceEnrolment,
  rowProps,
  amountLabel,
}: {
  allocations: T[];
  onChange: (allocations: T[]) => void;
  /** Outstanding advances this application could settle — the caller's own
   *  staff_advance_summary read, already filtered to `outstanding_cents > 0`. */
  candidates: StaffAdvanceSummaryRow[];
  /** The lines editor's current line count — bounds the line_no picker so an
   *  allocation can never name a line that does not exist in this call. OMITTED by a caller whose
   *  journal is DERIVED rather than composed: then no line column is rendered and no `line_no` is
   *  written. */
  lineCount?: number;
  /** The row that "add" mints. The caller owns the shape, so neither caller's type has to widen to
   *  the other's. */
  newRow: () => T;
  /** How one candidate reads in the chooser. The register names the account and the person because
   *  it lists EVERY enrolment's advances; a caller already scoped to one claimant says so with the
   *  facts that actually tell two of that person's advances apart. */
  optionLabel?: (candidate: StaffAdvanceSummaryRow) => string;
  /**
   * #1052 — WHERE THIS ADVANCE CAME FROM, when that is not where the caller's subject sits.
   *
   * The owner's ruling of 2026-09-24 on #931 admits an advance held under ANOTHER live enrolment
   * of the same client whose person label is the claimant's, on the condition that "the allocation
   * editor shows, beside each such advance, the enrolment it came from, so the preparer's
   * confirmation is a confirmation of that specific account".
   *
   * The CALLER decides which candidates are "such an advance" and writes the sentence, because
   * only the caller knows what the subject is: a claim has a claimant enrolment, the register's
   * book-application dialog has none at all. This component only renders the answer — appended to
   * the chooser's option, so it is visible BEFORE the choice, and again as its own line beside the
   * confirmed row, so it is visible AFTER it. Returning `null` (or omitting the prop, which the
   * register's caller does) renders neither, byte for byte as before.
   */
  sourceEnrolment?: (candidate: StaffAdvanceSummaryRow) => string | null;
  /** Extra props for ONE row's own control (an id, a ref, an error wiring) — how a caller keeps an
   *  existing control id on the line that used to be its only one (#930 → #931) and addresses every
   *  later line by its own field path. */
  rowProps?: (index: number, key: "advance" | "amount") => Record<string, unknown>;
  /** The amount column's label, or `null` to hide the column entirely — a one-line list takes the
   *  whole amount by construction, so there is nothing to apportion and no figure to retype. */
  amountLabel?: string | null;
}) {
  const t = useTranslations("StaffAdvances.allocationsEditor");
  const tc = useTranslations("Common");

  const showLineNo = lineCount !== undefined;
  const showAmount = amountLabel !== null;
  const label = optionLabel
    ?? ((c: StaffAdvanceSummaryRow) => [
      c.account_code,
      c.person_label,
      `${fmtCents(c.outstanding_cents, tc("centsUnsafe"))} ${t("outstandingSuffix")}`,
    ].join(" — "));
  /** ONE READER for "where did this advance come from", so the chooser and the confirmed row can
   *  never say different things about the same candidate. */
  const sourceOf = (c: StaffAdvanceSummaryRow): string | null => sourceEnrolment?.(c) ?? null;
  const optionText = (c: StaffAdvanceSummaryRow): string => {
    const source = sourceOf(c);
    return source === null ? label(c) : [label(c), source].join(" — ");
  };

  function updateAllocation(index: number, patch: Partial<T>) {
    onChange(allocations.map((a, i) => (i === index ? { ...a, ...patch } : a)));
  }
  function removeAllocation(index: number) {
    onChange(allocations.filter((_, i) => i !== index));
  }
  function addAllocation() {
    onChange([...allocations, newRow()]);
  }

  return (
    <div className="flex flex-col gap-2">
      <Table>
        <TableHeader>
          <TableRow>
            {showLineNo ? <TableHead className="w-20">{t("lineNo")}</TableHead> : null}
            <TableHead>{t("advance")}</TableHead>
            {showAmount ? (
              <TableHead className="text-right">{amountLabel ?? t("amount")}</TableHead>
            ) : null}
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {allocations.map((a, i) => (
            <TableRow key={i}>
              {showLineNo ? (
                <TableCell>
                  <NativeSelect
                    aria-label={t("lineNo")}
                    value={String(a.line_no)}
                    onChange={(e) => updateAllocation(i, { line_no: Number(e.target.value) } as Partial<T>)}
                    className="w-full"
                  >
                    {Array.from({ length: lineCount ?? 0 }, (_, n) => n + 1).map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </NativeSelect>
                </TableCell>
              ) : null}
              <TableCell>
                <NativeSelect
                  aria-label={t("advance")}
                  {...(rowProps?.(i, "advance") ?? {})}
                  value={a.advance_id}
                  onChange={(e) => updateAllocation(i, { advance_id: e.target.value } as Partial<T>)}
                  className="w-full"
                >
                  <option value="">{t("selectAdvance")}</option>
                  {candidates.map((c) => (
                    <option key={c.advance_id} value={c.advance_id}>
                      {optionText(c)}
                    </option>
                  ))}
                </NativeSelect>
                {/* #1052 — AND BESIDE THE CONFIRMED ROW. A `<select>` shows the chosen option's
                    text, but the preparer confirms a LIST and reads it back as a list; the ruling
                    asks for the enrolment beside the advance, so it is a line of its own here and
                    not only a suffix inside the control. */}
                {(() => {
                  const chosen = candidates.find((c) => c.advance_id === a.advance_id);
                  const source = chosen === undefined ? null : sourceOf(chosen);
                  return source === null ? null : (
                    <p className="mt-1 text-xs text-muted-foreground"
                       data-testid="allocation-source-enrolment">
                      {source}
                    </p>
                  );
                })()}
              </TableCell>
              {showAmount ? (
                <TableCell>
                  <MoneyInput
                    aria-label={amountLabel ?? t("amount")}
                    {...(rowProps?.(i, "amount") ?? {})}
                    cents={a.amount_cents}
                    mode="unsigned"
                    onValueChange={(change) => {
                      if (change.ok) updateAllocation(i, { amount_cents: change.cents ?? 0 } as Partial<T>);
                    }}
                  />
                </TableCell>
              ) : null}
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
