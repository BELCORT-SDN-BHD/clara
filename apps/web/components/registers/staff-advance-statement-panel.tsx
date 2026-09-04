"use client";

// The per-account-code statement (staff_advance_statement) — selection-driven,
// so it keeps its own small read + explicit reload() on account-code change
// (components/registers/aging-register.tsx's AR/AP-toggle precedent), rather
// than living inside the workbench's combined hydrated part.
//
// F1 FIX (independent review, fix-required, 2026-08-28): the selection used
// to be seeded ONCE from `accountCodes[0]` at mount and never looked again —
// probed and confirmed: when the FIRST enrolment lands while this panel is
// already mounted (`accountCodes`: [] -> [code]), the selection stayed "",
// zero door calls were ever made, and the panel rendered "No movement
// recorded" as though a real, empty read had happened (review law 2: a
// derived/absent state is not evidence). Fixed by re-syncing the selection
// whenever the live `accountCodes` list no longer contains it — covers both
// the empty-to-populated case and a stale selection dropping out — and by
// rendering an honest "select an account" prompt for the in-between render
// where nothing is selected yet, never DataState's empty-read branch.
//
// S4 FIX (independent review): `kind`/`application_kind` are raw enum tokens
// off the wire (disbursement/application/void; payroll_deduction/bank_return/
// claim/correction) — rendered through a CHECKED membership lookup with an
// honest unknown fallback, the same idiom as components/firm/needs-you-row.tsx
// (row_kind), components/registers/chart-of-accounts-register.tsx
// (account_type), fixed-assets/adjustments' own status maps — never a raw
// token, never a silent cast.

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { getStaffAdvanceStatement, type StaffAdvanceStatementRow } from "@/lib/registers/staff-advances-doors";
import { fmtCents } from "@/lib/registers/money";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { DataTableCard } from "@/components/common/data-table-card";
import { NativeSelect } from "@/components/common/native-select";
import { TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DataState } from "@/components/firm/data-state";

const MOVEMENT_KINDS = ["disbursement", "application", "void"] as const;
function isKnownMovementKind(k: string): k is (typeof MOVEMENT_KINDS)[number] {
  return (MOVEMENT_KINDS as readonly string[]).includes(k);
}

const APPLICATION_KINDS = ["payroll_deduction", "bank_return", "claim", "correction"] as const;
function isKnownApplicationKind(k: string): k is (typeof APPLICATION_KINDS)[number] {
  return (APPLICATION_KINDS as readonly string[]).includes(k);
}

function movementLabel(t: ReturnType<typeof useTranslations>, r: StaffAdvanceStatementRow): string {
  const kindLabel = isKnownMovementKind(r.kind) ? t(`movementKinds.${r.kind}`) : t("movementKinds.unknown", { kind: r.kind });
  if (!r.application_kind) return kindLabel;
  const appLabel = isKnownApplicationKind(r.application_kind)
    ? t(`applicationKinds.${r.application_kind}`)
    : t("applicationKinds.unknown", { kind: r.application_kind });
  return `${kindLabel} (${appLabel})`;
}

export function StaffAdvanceStatementPanel({
  clientId,
  accountCodes,
  refreshToken = 0,
}: {
  clientId: string;
  accountCodes: string[];
  /** The register's own epoch, bumped on every SETTLED write above this panel (sweep
   *  addendum item 3). Booking an application, completing particulars, enrolling or
   *  retiring an account all move `get_staff_advance_statement`'s answer, and none of
   *  them changes `accountCode` — the only thing this panel's reload effect watched.
   *  So the statement a human read after booking was the one from before it. */
  refreshToken?: number;
}) {
  const t = useTranslations("StaffAdvances.statement");
  const tc = useTranslations("Common");
  const [accountCode, setAccountCode] = useState(accountCodes[0] ?? "");

  // F1: re-sync whenever the live list no longer contains the current
  // selection (empty-to-populated at mount, or a selection that dropped
  // out) — never seeded once and left stale.
  useEffect(() => {
    if (accountCode && accountCodes.includes(accountCode)) return;
    setAccountCode(accountCodes[0] ?? "");
  }, [accountCodes, accountCode]);

  const { data, loading, error, reload } = useAsyncRead(() =>
    accountCode
      ? getStaffAdvanceStatement(clientId, accountCode, null, null, { session: sessionTokenAccessor })
      : Promise.resolve(null),
  );

  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    void reload();
    // `refreshToken` is a REAL dependency, not a convenience: without it the effect
    // only re-fires when the SELECTED ACCOUNT changes, which a write never does.
  }, [accountCode, refreshToken, reload]);

  if (accountCodes.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("noAccounts")}</p>;
  }
  if (!accountCode) {
    // F1: the one render between accountCodes populating and the sync effect
    // above committing a selection — never claim "no movement" for a door
    // call that has not been made.
    return <p className="text-sm text-muted-foreground">{t("selectPrompt")}</p>;
  }

  const rows = data?.rows ?? [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <NativeSelect aria-label={t("accountLabel")} value={accountCode} onChange={(e) => setAccountCode(e.target.value)}>
          {accountCodes.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </NativeSelect>
      </div>
      <DataState loading={loading} error={error} isEmpty={rows.length === 0} emptyMessage={t("empty")}>
        <DataTableCard>
          <TableHeader>
            <TableRow>
              <TableHead>{t("date")}</TableHead>
              <TableHead>{t("kind")}</TableHead>
              <TableHead className="text-right">{t("amount")}</TableHead>
              <TableHead className="text-right">{t("running")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={i}>
                <TableCell>{r.date}</TableCell>
                <TableCell className="text-muted-foreground">{movementLabel(t, r)}</TableCell>
                <TableCell className="text-right">{fmtCents(r.amount_cents, tc("centsUnsafe"))}</TableCell>
                <TableCell className="text-right">{fmtCents(r.running_cents, tc("centsUnsafe"))}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          {data ? (
            <TableFooter>
              <TableRow>
                <TableCell colSpan={2}>{t("openingLabel")}</TableCell>
                <TableCell colSpan={2} className="text-right">{fmtCents(data.opening_cents, tc("centsUnsafe"))}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell colSpan={2}>{t("closingLabel")}</TableCell>
                <TableCell colSpan={2} className="text-right font-medium">{fmtCents(data.closing_cents, tc("centsUnsafe"))}</TableCell>
              </TableRow>
            </TableFooter>
          ) : null}
        </DataTableCard>
      </DataState>
    </div>
  );
}
