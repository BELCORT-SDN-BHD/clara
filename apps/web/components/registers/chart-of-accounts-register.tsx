"use client";

// Chart of accounts (clara.coa_accounts) — FLAT, by account_type. No hierarchy
// column exists on this table (this build's coordinator ruling: "no invented tree").
// N10 (independent review, 2026-08-27): account_type is a closed CHECK-constrained
// enum, translated via a checked lookup with an HONEST raw-value fallback (never a
// key path, never a silent cast) for any value outside the known set.
//
// T4 (port wave): the write half — clara.upsert_account (lib/registers/accounts.ts's
// header has the full census grounding).
//
// F1 (independent review, fix-required, 2026-08-28): this used to ride useHydratedPart,
// whose err/clr are already-STRINGIFIED (applyFailure discards the thrown error's own
// `kind`) — so a genuine read failure (e.g. a 403) rendered the raw, untranslated
// PostgREST message, AND "No accounts in this client's chart of accounts yet." with Add
// Account live, SIMULTANEOUSLY (useHydratedPart starts `loading: false`, so there was no
// first-paint gate either). A bookkeeper who "added" an account that genuinely exists but
// the failed read never showed would silently OVERWRITE it — upsert_account's ON CONFLICT
// has no confirmation step, and the duplicate-lines guard only fires once a journal line
// already exists against the code. Reverted to useAsyncRead, which keeps the RAW thrown
// error for components/firm/data-state.tsx's ErrorMessage to classify by `kind` (the
// translated "Your account can't read this yet." wording, matching this file's own
// merge-base behaviour before T4 touched it) and starts `loading: true`. The write
// trigger/table render only once `data !== null` — the same early-return gate
// staff-advances-register.tsx:59 uses — so nothing offers "Add account" while the read's
// own outcome is still unknown or refused.

import { useTranslations } from "next-intl";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { loadChartOfAccounts, upsertAccount, type UpsertAccountInput } from "@/lib/registers/accounts";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { SectionHeader } from "@/components/common/section-header";
import { DataTableCard } from "@/components/common/data-table-card";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErrorMessage } from "@/components/firm/data-state";
import { LoadingState, EmptyState } from "@/components/common/state";
import { NotBuiltNote } from "@/components/common/not-built-note";
import { UpsertAccountDialog } from "./UpsertAccountDialog";

export function ChartOfAccountsRegister({ clientId }: { clientId: string }) {
  const t = useTranslations("ClientRegisters.accounts");
  const tc = useTranslations("Common");
  const { data, error, busy, act } = useAsyncRead(() => loadChartOfAccounts(sessionTokenAccessor, clientId));

  async function submitUpsert(input: Omit<UpsertAccountInput, "clientId">): Promise<void> {
    await act(() => upsertAccount(sessionTokenAccessor, { ...input, clientId }).then(() => undefined));
  }

  // Nothing renders — not the empty state, not the write trigger — until a
  // read has genuinely settled. `error` here is a real, first-load failure
  // (data has never existed); `data` is still null while loading.
  if (!data) {
    return error ? <ErrorMessage error={error} /> : <LoadingState>{tc("loading")}</LoadingState>;
  }

  const typeLabels: Record<string, string> = {
    asset: t("types.asset"),
    liability: t("types.liability"),
    equity: t("types.equity"),
    income: t("types.income"),
    expense: t("types.expense"),
  };

  return (
    <div className="flex flex-col gap-2">
      {/* A LATER failure (a write, or a reload after data already loaded)
          renders as a banner ABOVE the still-real data, never replacing it —
          components/firm/data-state.tsx's own header: "a component that
          already has real DATA on screen... can show the error as a BANNER
          above its still-real list, rather than DataState's own
          replace-the-content behaviour." This is why the first-load gate
          above and this inline banner are two separate call sites rather
          than one shared DataState wrapper. */}
      {error ? <ErrorMessage error={error} /> : null}
      <SectionHeader level={2} action={<UpsertAccountDialog busy={busy} onSubmit={submitUpsert} />}>
        {t("heading")}
      </SectionHeader>
      {data.length === 0 ? (
        <EmptyState>{t("empty")}</EmptyState>
      ) : (
        <DataTableCard>
          <TableHeader>
            <TableRow>
              <TableHead>{t("code")}</TableHead>
              <TableHead>{t("name")}</TableHead>
              <TableHead>{t("type")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((a) => (
              <TableRow key={a.account_code}>
                <TableCell className="font-mono">{a.account_code}</TableCell>
                <TableCell>
                  {a.name}
                  {!a.is_active ? ` (${t("inactive")})` : ""}
                </TableCell>
                <TableCell className="text-muted-foreground">{typeLabels[a.account_type] ?? a.account_type}</TableCell>
                <TableCell>
                  <UpsertAccountDialog existing={a} busy={busy} onSubmit={submitUpsert} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </DataTableCard>
      )}
      {/* GATE 1 disposition (P6-X exit gate, 2026-09-03): `clara.coa_template_drift`
          (packages/db/migrations/0156_coa_apply_template.sql:1130) is EXECUTE-granted to
          clara_authenticated and has zero occurrences anywhere in apps/web. Annex D names
          this exact file as its home: "a StateBanner, never a UI-computed count"
          (docs/plan/active/coa-template-annexes.md:169). Owed to the "COA PR-d" lane
          (PROGRESS.md's "Annex G's admin editor over 0150's nine COA doors" row, which also
          owes 0156's firm_coa_drift its /admin surface). This table renders the chart as
          recorded, with NO comparison against the client's adopted template — no
          never_adopted/off_template/missing/renamed/retyped classification is surfaced.
          Placed AFTER the live table (review N2, 2026-09-03): a not-built note must never
          outrank the user's actual work — the convention this file now follows matches
          components/firm/needs-you-gaps.tsx and firm-admin/settings-panel.tsx, which both
          put their notes below the real content. */}
      <NotBuiltNote className="text-xs">{t("driftNotBuilt")}</NotBuiltNote>
    </div>
  );
}
