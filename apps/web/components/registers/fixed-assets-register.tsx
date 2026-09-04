"use client";

// Fixed asset register (clara.list_fixed_assets) — cost/accumulated/NBV are all
// DB-projected as-of today; this component renders them verbatim. N10 (independent
// review, 2026-08-27): status/method are closed CHECK-constrained enums, translated
// via a checked lookup with an HONEST raw-value fallback (never a key path, never a
// silent cast) for any value outside the known set.
//
// T3 (port wave): extends the read-only table with the write surface — per-row
// Complete-particulars / Revise / Dispose door dialogs — plus the account-profiles
// panel, the register<->GL tie-out state banner, and the depreciation authority +
// runs panel below. ONE useAsyncRead drives the table (the registers domain's own
// hydrate-never-trust hook — matches this file's PRE-EXISTING read convention, so
// DataState keeps its no_session/forbidden/not_found classification); every row
// action reloads the WHOLE register, never assumes its own write's response. A
// later write's refusal renders as a banner ABOVE the still-good table (the
// needs-you-inbox.tsx precedent), never replacing data that already loaded once.

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { loadFixedAssets } from "@/lib/registers/fixed-assets";
import { loadChartOfAccounts } from "@/lib/registers/accounts";
import { fmtCents } from "@/lib/registers/money";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { DataTableCard } from "@/components/common/data-table-card";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DataState, ErrorMessage } from "@/components/firm/data-state";
import { LoadingState } from "@/components/common/state";
import { CompleteParticularsDialog, ReviseParticularsDialog, DisposeDialog } from "./fa-row-actions";
import { FaAccountProfilesPanel } from "./fa-account-profiles-panel";
import { FaRegisterTieBanner } from "./fa-register-tie-banner";
import { DepreciationAuthorityPanel } from "./depreciation-authority-panel";

export function FixedAssetsRegister({ clientId }: { clientId: string }) {
  const t = useTranslations("ClientRegisters.fixedAssets");
  const tFa = useTranslations("FixedAssetsDepreciation");
  const tc = useTranslations("Common");
  const { data, loading, error, busy, act, reload } = useAsyncRead(() => loadFixedAssets(sessionTokenAccessor, clientId));
  const accountsRead = useAsyncRead(() => loadChartOfAccounts(sessionTokenAccessor, clientId));
  const hasData = data !== null;

  // SIBLING-STALENESS (sweep addendum items 1 and 2). This register mounts three
  // panels that each own their own read — the account profiles, the register↔GL tie
  // banner, and the depreciation authority/runs pair — and a write in any one of them
  // can move what another shows. `refreshToken` is one epoch, bumped on every SETTLED
  // act, that the tie banner watches; the register's own table reloads through
  // `act()` already, and through `reload()` for the acts that happen elsewhere.
  const [refreshToken, setRefreshToken] = useState(0);
  const bumpRefresh = useCallback(() => setRefreshToken((n) => n + 1), []);

  /** The row actions' `act`, with the tie banner's epoch attached. Bumps on SETTLE,
   *  not on success: a refused dispose may still have left the DB somewhere the tie
   *  would report differently, and re-deriving is never the wrong answer. */
  const actAndRefresh = useCallback(
    async (fn: () => Promise<void>): Promise<boolean> => {
      const ok = await act(fn);
      bumpRefresh();
      return ok;
    },
    [act, bumpRefresh],
  );

  /** A depreciation run posts entries: the table's own cost/accumulated/NBV move too,
   *  and this component's `act()` never ran, so its own read must be told. */
  const afterDepreciationPosted = useCallback(() => {
    void reload();
    bumpRefresh();
  }, [reload, bumpRefresh]);
  const rows = data?.assets ?? [];
  const accounts = accountsRead.data ?? [];

  const statusLabels: Record<string, string> = {
    pending: t("statuses.pending"),
    active: t("statuses.active"),
    superseded: t("statuses.superseded"),
    disposed: t("statuses.disposed"),
    unwound: t("statuses.unwound"),
  };
  const methodLabels: Record<string, string> = {
    straight_line: t("methods.straight_line"),
    reducing_balance: t("methods.reducing_balance"),
    none: t("methods.none"),
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        {hasData && error ? <ErrorMessage error={error} /> : null}
        {/* (5) THE LOADING GATE UNMOUNTS THE PANEL THAT OWNS THE ACT. `DataState`
            returns its LoadingState INSTEAD of children whenever `loading` is true —
            and `act()` flips `loading` true on the reload it always fires, success or
            refusal. So every row-action attempt tore this table down and rebuilt it,
            taking the open dialog and everything typed into it. That is the same
            defect ClosePrepHoldPanel's FIX-1 fixed for one panel and never swept to
            its siblings, and it is what would have silently defeated CB-AE2E-004's
            "the dialog stays open" here. Once real data has loaded ONCE, a later
            `loading` is a refresh, not a reason to hide it — the same shape the
            `error` prop beside it already uses. */}
        <DataState loading={!hasData && loading} error={hasData ? null : error} isEmpty={rows.length === 0} emptyMessage={t("empty")}>
          <DataTableCard>
            <TableHeader>
              <TableRow>
                <TableHead>{t("asset")}</TableHead>
                <TableHead>{t("status")}</TableHead>
                <TableHead>{t("acquired")}</TableHead>
                <TableHead>{t("cost")}</TableHead>
                <TableHead>{t("accumulated")}</TableHead>
                <TableHead>{t("nbv")}</TableHead>
                <TableHead>{t("method")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>{a.description ?? a.id.slice(0, 8)}</TableCell>
                  <TableCell className="text-muted-foreground">{statusLabels[a.status] ?? a.status}</TableCell>
                  <TableCell className="text-muted-foreground">{a.acquired_date ?? "—"}</TableCell>
                  <TableCell>{fmtCents(a.cost_cents, tc("centsUnsafe"))}</TableCell>
                  <TableCell>{fmtCents(a.accumulated_cents, tc("centsUnsafe"))}</TableCell>
                  <TableCell className="font-medium">{fmtCents(a.nbv_cents, tc("centsUnsafe"))}</TableCell>
                  <TableCell className="text-muted-foreground">{a.method ? (methodLabels[a.method] ?? a.method) : "—"}</TableCell>
                  <TableCell>
                    <div className="flex flex-col items-end gap-1.5">
                      {/* F7 (independent review, fix-required, 2026-08-28):
                          the freeze note now renders on the ROW, before the
                          human ever opens Dispose — with a real link into the
                          Journals tab, the object that owns the draft's own
                          approve/withdraw verbs (no per-entry route exists in
                          this build, so the link goes to the tab, honestly —
                          never a fabricated deep link). */}
                      {a.disposal_draft_outstanding ? (
                        <p className="text-right text-xs text-warning">
                          {tFa("actions.disposalDraftOutstandingRow", { entryId: a.disposal_draft_entry_id?.slice(0, 8) ?? "—" })}{" "}
                          <Link href={`/clients/${clientId}/journals`} className="underline-offset-4 hover:underline">
                            {tFa("actions.disposalDraftOutstandingLink")}
                          </Link>
                        </p>
                      ) : null}
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {!a.particulars_complete && (a.status === "pending" || a.status === "active") ? (
                          <CompleteParticularsDialog clientId={clientId} asset={a} accounts={accounts} busy={busy} act={actAndRefresh} />
                        ) : null}
                        {a.particulars_complete && a.status === "active" ? (
                          <ReviseParticularsDialog clientId={clientId} asset={a} accounts={accounts} busy={busy} act={actAndRefresh} />
                        ) : null}
                        {a.status === "active" ? (
                          <DisposeDialog clientId={clientId} asset={a} accounts={accounts} busy={busy} act={actAndRefresh} />
                        ) : null}
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </DataTableCard>
        </DataState>
        {data && data.incomplete_count > 0 ? (
          <p className="text-xs text-warning">{t("incompleteNote", { count: data.incomplete_count })}</p>
        ) : null}
        {/* F5 (independent review, fix-required, 2026-08-28): the account
            pickers inside Dispose/enrol depend on this read; a failed or
            still-loading chart of accounts used to fail SILENTLY, leaving
            those dialogs permanently unconfirmable with no visible reason
            (the unopenable-door class — absence is not evidence). */}
        {accountsRead.error ? <ErrorMessage error={accountsRead.error} /> : null}
        {accountsRead.loading ? <LoadingState className="text-xs">{tFa("chartAccountsLoading")}</LoadingState> : null}
      </div>

      <FaAccountProfilesPanel clientId={clientId} accounts={accounts} onActed={bumpRefresh} />
      <FaRegisterTieBanner clientId={clientId} refreshToken={refreshToken} />
      <DepreciationAuthorityPanel clientId={clientId} onPosted={afterDepreciationPosted} />
    </div>
  );
}
