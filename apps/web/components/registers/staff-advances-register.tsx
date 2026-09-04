"use client";

// Staff advances — T5 (port-wave plan §4/§5). Extends the P3-era read-only
// ledger with the full write surface: book application, complete particulars,
// enrol/retire account, plus the statement and summary reads. hydrate-never-
// trust throughout (lib/parts/hooks.ts's useHydratedPart): every door call
// re-derives the whole bundle, success or refusal, and a refusal renders
// VERBATIM in this banner — never inside whichever dialog raised it.
//
// Hard constraint 13 (BEE CREATIVE SOLUTION's sole proprietor is EQUITY, not
// an employee): this surface only ever lists ENROLLED staff-advance accounts
// (a supervisory admin+ act, WDB-G6, requiring a written attestation of
// whether the balance is related-party) — it never infers "staff" from a
// coa_accounts row's name or type, so a proprietor's equity account cannot
// silently appear here as though it were a staff advance.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { businessToday } from "@/lib/business-date";
import { useHydratedPart } from "@/lib/parts/hooks";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { loadStaffAdvancesWorkbench } from "@/lib/registers/staff-advances-workbench";
import {
  bookStaffAdvanceApplication,
  completeStaffAdvanceParticulars,
  enrolStaffAdvanceAccount,
  retireStaffAdvanceAccount,
  type BookStaffAdvanceApplicationResult,
} from "@/lib/registers/staff-advances-doors";
import { fmtCents, shortId } from "@/lib/registers/money";
import { SectionHeader } from "@/components/common/section-header";
import { DataTableCard } from "@/components/common/data-table-card";
import { EmptyState, LoadingState, StateBanner } from "@/components/common/state";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BookApplicationDialog } from "./BookApplicationDialog";
import { CompleteParticularsDialog } from "./CompleteParticularsDialog";
import { EnrolAccountDialog } from "./EnrolAccountDialog";
import { RetireAccountDialog } from "./RetireAccountDialog";
import { StaffAdvanceStatementPanel } from "./staff-advance-statement-panel";

export function StaffAdvancesRegister({ clientId }: { clientId: string }) {
  const t = useTranslations("StaffAdvances");
  const tReg = useTranslations("ClientRegisters.staffAdvances");
  const tc = useTranslations("Common");
  const asOf = businessToday();
  const { data, busy, err, clr, act: rawAct } = useHydratedPart(sessionTokenAccessor, (s) =>
    loadStaffAdvancesWorkbench(s, clientId, asOf),
  );

  // SIBLING-STALENESS (sweep addendum item 3). StaffAdvanceStatementPanel below owns
  // its own read and re-reads only when the SELECTED ACCOUNT changes — which no write
  // here does. One epoch, bumped on every settled act, is what tells it.
  const [refreshToken, setRefreshToken] = useState(0);
  // `onOk` is FORWARDED, not dropped: the book dialog threads its own receipt through
  // that channel (see its call site's F2 note), and it must keep firing only on this
  // call's success. The epoch bump is separate and fires on SETTLE.
  const act = async (fn: () => Promise<void>, onOk?: () => void): Promise<boolean> => {
    const ok = await rawAct(fn, onOk);
    setRefreshToken((n) => n + 1);
    return ok;
  };
  // F2 (independent review, fix-required): book_staff_advance_application's
  // own receipt names a real branch — a high-stakes entry lands `status:
  // 'drafted'` (a distinct checker approves it elsewhere, T6's door) rather
  // than `'posted'`. `act()` itself only reports success/failure, never the
  // write's own return value (hydrate-never-trust) — this state is fed by
  // `onOk`, so the honest status is what actually SHOWS, not merely what this
  // module's own header claims. A later `'posted'` receipt clears it.
  const [draftedApplication, setDraftedApplication] = useState<BookStaffAdvanceApplicationResult | null>(null);

  if (!data) {
    return err ? <StateBanner tone="error">{err}</StateBanner> : <LoadingState>{t("loading")}</LoadingState>;
  }

  const accountCodes = Array.from(new Set(data.accounts.map((a) => a.account_code))).sort();
  const outstandingAdvances = data.summary.advances.filter((a) => a.outstanding_cents > 0 && !a.voided);
  const activeAccounts = data.accounts.filter((a) => a.active);
  const retiredAccounts = data.accounts.filter((a) => !a.active);

  return (
    <div className="flex flex-col gap-6">
      {err && (
        <StateBanner tone="error" code={clr ? `${clr.code}${clr.reason ? ` · ${clr.reason}` : ""}` : undefined}>
          {err}
        </StateBanner>
      )}

      <section className="flex flex-col gap-2">
        <SectionHeader
          level={2}
          action={
            <BookApplicationDialog
              accounts={data.coaAccounts}
              outstandingAdvances={outstandingAdvances}
              busy={busy}
              onSubmit={(input) => {
                // F2: capture the real receipt in this call's own closure —
                // `act()` never exposes a write's return value itself
                // (hydrate-never-trust) — and thread it via `onOk`, which
                // fires ONLY on this specific call's success.
                let receipt: BookStaffAdvanceApplicationResult | null = null;
                return act(
                  () =>
                    bookStaffAdvanceApplication(clientId, input, { session: sessionTokenAccessor }).then((r) => {
                      receipt = r;
                    }),
                  () => setDraftedApplication(receipt?.status === "drafted" ? receipt : null),
                );
              }}
            />
          }
        >
          {t("ledgerHeading")}
        </SectionHeader>
        <StateBanner tone={data.tie.tie ? "neutral" : "warning"}>
          {data.tie.tie ? t("tieOk") : t("tieMismatch")}
        </StateBanner>
        {draftedApplication && (
          <StateBanner tone="info">
            {t("applicationDrafted", { entry: shortId(draftedApplication.entry_id) })}
          </StateBanner>
        )}
        {data.advances.length === 0 ? (
          <EmptyState>{tReg("empty")}</EmptyState>
        ) : (
          <DataTableCard>
            <TableHeader>
              <TableRow>
                <TableHead>{tReg("issued")}</TableHead>
                <TableHead>{tReg("amount")}</TableHead>
                <TableHead>{tReg("purpose")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.advances.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>{a.issue_date}</TableCell>
                  <TableCell>
                    {fmtCents(a.amount_cents, tc("centsUnsafe"))}
                    {a.voided_by_entry_id ? ` (${tReg("voided")})` : ""}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{a.purpose ?? "—"}</TableCell>
                  <TableCell>
                    {!a.purpose && !a.voided_by_entry_id ? (
                      <CompleteParticularsDialog
                        busy={busy}
                        onSubmit={(purpose, reference) =>
                          act(() => completeStaffAdvanceParticulars(clientId, a.id, purpose, reference, { session: sessionTokenAccessor }).then(() => undefined))
                        }
                      />
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </DataTableCard>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <SectionHeader
          level={2}
          action={<EnrolAccountDialog accounts={data.coaAccounts} busy={busy} onSubmit={(code, label, confirm, attest) => act(() => enrolStaffAdvanceAccount(clientId, code, label, confirm, attest, { session: sessionTokenAccessor }).then(() => undefined))} />}
        >
          {t("enrolmentsHeading")}
        </SectionHeader>
        {data.accounts.length === 0 ? (
          <EmptyState>{t("noEnrolments")}</EmptyState>
        ) : (
          <DataTableCard>
            <TableHeader>
              <TableRow>
                <TableHead>{t("accountCode")}</TableHead>
                <TableHead>{t("personLabel")}</TableHead>
                <TableHead>{t("status")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...activeAccounts, ...retiredAccounts].map((en) => (
                <TableRow key={en.id}>
                  <TableCell className="font-mono">{en.account_code}</TableCell>
                  <TableCell>{en.person_label}</TableCell>
                  <TableCell className="text-muted-foreground">{en.active ? t("statusActive") : t("statusRetired")}</TableCell>
                  <TableCell>
                    {en.active ? (
                      <RetireAccountDialog
                        accountCode={en.account_code}
                        busy={busy}
                        onSubmit={(reason) => act(() => retireStaffAdvanceAccount(clientId, en.id, reason, { session: sessionTokenAccessor }).then(() => undefined))}
                      />
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </DataTableCard>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <SectionHeader level={2}>{t("summaryHeading")}</SectionHeader>
        <p className="text-sm text-muted-foreground">
          {t("summaryOutstanding", { amount: fmtCents(data.summary.outstanding_cents, tc("centsUnsafe")) })}
          {data.summary.incomplete_count > 0 ? ` · ${t("summaryIncomplete", { count: data.summary.incomplete_count })}` : ""}
        </p>
        {data.summary.policy_notes.length > 0 ? (
          <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
            {data.summary.policy_notes.map((n) => (
              <li key={n.fact}>{n.note}</li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="flex flex-col gap-2">
        <SectionHeader level={2}>{t("statementHeading")}</SectionHeader>
        <StaffAdvanceStatementPanel clientId={clientId} accountCodes={accountCodes} refreshToken={refreshToken} />
      </section>
    </div>
  );
}
