"use client";

// The two money grids on the Work detail — the BASIS a human (or Clara) asked
// for, and the LINES that were actually posted. Split out of work-detail.tsx so
// each stays independently reviewable; neither holds a read or a decision.
//
// THEY ARE TWO TABLES AND NOT ONE, and that is the honest shape rather than a
// duplication. The basis is the REQUEST: it exists from the moment the Work is
// admitted, it never changes (0178 makes `basis` immutable after insert), and it
// is what a reviewer checks a refusal against. The posted lines are the EFFECT:
// they exist only after a commit, they carry the ledger's own line numbers, and
// they can differ from the basis in exactly one legitimate way — they do not
// exist at all. Merging them into one table would have to pick a moment to
// "become" the other, and every such moment is a lie about one of the two.
//
// NOTHING HERE SUMS ANYTHING THE DATABASE OWNS. The basis footer is a
// PRESENTATION sum over the request, labelled as such, exactly as the composer's
// is. The posted lines carry NO total at all: the entry's authoritative figures
// live on the journals workbench, which reads them, and a total computed here
// would be a figure this UI derived about a posted entry (hard constraint 2).
//
// EVERY TABLE IS NAMED, so the `<Table>` primitive gives it a keyboard-reachable
// labelled scroll region (components/ui/table.tsx's provenance note) — which is
// what keeps a four-column grid readable at 320 CSS px without the page itself
// scrolling sideways.

import { useTranslations } from "next-intl";

import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FormattedDate } from "@/components/journals/formatted-date";
import { Money } from "@/components/journals/money";
import { totalsOf } from "@/lib/work/journal-basis";
import { basisLineIsExact, type WorkBasis } from "@/lib/work/types";
import type { JournalLineRow } from "@/lib/journals/types";

/** `code — Name`, or the bare code when the chart has no row for it. A retired
 *  or unknown code is still what the database holds on the line; inventing a
 *  name for it would be worse than showing none. */
function accountLabel(code: string, names: ReadonlyMap<string, string>): string {
  const name = names.get(code);
  return name === undefined ? code : `${code} — ${name}`;
}

export function WorkBasisTable({
  basis,
  names,
}: {
  basis: WorkBasis;
  names: ReadonlyMap<string, string>;
}) {
  const t = useTranslations("WorkDetail");
  const totals = totalsOf(
    basis.lines.map((line) => ({
      account_code: line.account_code,
      debit_cents: line.debit_cents,
      credit_cents: line.credit_cents,
    })),
  );

  return (
    <>
      {/* THE POSTING DATE AND THE MEMO ARE PART OF THE BASIS, not chrome. The
          date is LABELLED as the posting date so it is never read as the
          submitted-at instant beside it (§3's dates rule: "label posting/as-of/
          due dates distinctly"), and it renders through `FormattedDate`, which
          pins the calendar day in UTC — a `date` column has no instant, and a
          naive local format shows the previous day to anyone west of UTC. */}
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">{t("postingDate")}</dt>
        <dd className="text-foreground">
          <FormattedDate value={basis.posting_date} />
        </dd>
        <dt className="text-muted-foreground">{t("memo")}</dt>
        <dd className="wrap-anywhere text-foreground">{basis.memo}</dd>
        <dt className="text-muted-foreground">{t("currency")}</dt>
        <dd className="text-foreground">{basis.currency}</dd>
      </dl>
      <Table aria-label={t("basisTableLabel")}>
      <TableHeader>
        <TableRow>
          <TableHead>{t("account")}</TableHead>
          <TableHead>{t("lineDescription")}</TableHead>
          <TableHead className="text-right">{t("debit")}</TableHead>
          <TableHead className="text-right">{t("credit")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {basis.lines.map((line, i) => {
          // A jsonb line is not type-checked at the wire. A line whose cents are
          // not exact integers is rendered as UNREADABLE rather than formatted
          // into a plausible-looking amount — a wrong number on a ledger screen
          // is worse than a visible gap.
          const exact = basisLineIsExact(line);
          return (
            <TableRow key={i}>
              <TableCell>{accountLabel(line.account_code, names)}</TableCell>
              <TableCell>{line.description ?? ""}</TableCell>
              <TableCell className="text-right">
                {exact ? <Money cents={line.debit_cents} /> : <span className="text-warning">{t("amountUnreadable")}</span>}
              </TableCell>
              <TableCell className="text-right">
                {exact ? <Money cents={line.credit_cents} /> : <span className="text-warning">{t("amountUnreadable")}</span>}
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
        </TableRow>
      </TableFooter>
      </Table>
    </>
  );
}

export function PostedLinesTable({
  lines,
  names,
}: {
  lines: readonly JournalLineRow[];
  names: ReadonlyMap<string, string>;
}) {
  const t = useTranslations("WorkDetail");
  return (
    <Table aria-label={t("postedTableLabel")}>
      <TableHeader>
        <TableRow>
          <TableHead>{t("lineNo")}</TableHead>
          <TableHead>{t("account")}</TableHead>
          <TableHead>{t("lineDescription")}</TableHead>
          <TableHead className="text-right">{t("debit")}</TableHead>
          <TableHead className="text-right">{t("credit")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {lines.map((line) => (
          <TableRow key={line.id}>
            <TableCell>{line.line_no}</TableCell>
            <TableCell>{accountLabel(line.account_code, names)}</TableCell>
            <TableCell>{line.description ?? ""}</TableCell>
            <TableCell className="text-right">
              <Money cents={line.debit_cents} />
            </TableCell>
            <TableCell className="text-right">
              <Money cents={line.credit_cents} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
