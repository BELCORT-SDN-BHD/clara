"use client";

// The register<->GL tie-out — clara.fa_register_tie(p_client, p_as_of). A
// STATE BANNER, not a UI-computed figure (AGENTS.md hard constraint 2, and
// the port-wave plan §4/T3's own line: "fa_register_tie renders as a state
// banner, never a UI-computed number"): `tie`/every `*_diff_cents` column is
// the DB's own comparison, rendered verbatim.

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { faRegisterTie } from "@/lib/registers/fixed-assets";
import { businessToday } from "@/lib/business-date";
import { fmtCents } from "@/lib/registers/money";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { SectionHeader } from "@/components/common/section-header";
import { DataTableCard } from "@/components/common/data-table-card";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StateBanner } from "@/components/common/state";
import { DataState } from "@/components/firm/data-state";

export function FaRegisterTieBanner({ clientId, refreshToken = 0 }: { clientId: string; refreshToken?: number }) {
  const t = useTranslations("FixedAssetsDepreciation.tie");
  const tc = useTranslations("Common");
  const asOf = businessToday();
  const { data, loading, error, reload } = useAsyncRead(() => faRegisterTie(sessionTokenAccessor, clientId, asOf));
  const notEvaluated = data !== null && data.accounts.length === 0;

  // SIBLING-STALENESS (sweep addendum item 2). `useAsyncRead`'s mount effect fires
  // exactly ONCE, and this banner destructured no `reload` at all — so the tie it
  // showed was whatever the DB said when the page first painted. Every write that can
  // move it happens in a SIBLING that owns its own hook: a row's
  // complete/revise/dispose, an account profile enrolled or retired, and above all a
  // depreciation run, which posts entries straight into the accumulated-depreciation
  // accounts this comparison walks. A human could enrol an account and watch a tie
  // that no longer described the books.
  //
  // `refreshToken` is the caller's own epoch, bumped on every SETTLED act (success or
  // refusal — the DB may have partially applied, and hydrate-never-trust means we
  // re-derive either way). The `> 0` guard keeps the mount read single: the token
  // starts at 0 and only a real act moves it. This is the `actEpoch` precedent from
  // opening-seed-workbench.tsx, as a prop rather than a remount key, so the banner
  // does not flash empty on every write.
  useEffect(() => {
    if (refreshToken > 0) void reload();
  }, [refreshToken, reload]);

  return (
    <div className="flex flex-col gap-2">
      <SectionHeader level={2}>{t("heading")}</SectionHeader>
      <p className="text-xs text-muted-foreground">{t("subheading")}</p>
      <DataState loading={loading} error={error} isEmpty={false} emptyMessage="">
        {data ? (
          <div className="flex flex-col gap-2">
            {/* CB-AE2E-029 — THREE-VALUED, off a fact the DB itself returned.
                `clara.fa_register_tie` declares `v_tie boolean := true` (0041:4260) and
                only ever sets it false INSIDE its walk, whose universe is
                `fa_account_profiles WHERE active UNION fixed_assets` for the client
                (0041:4276-4283). A client with no enrolled profile and no register row
                yields ZERO iterations, so the function returns `tie: true, accounts: []`
                — a positive assertion produced by an empty comparison, which this banner
                then painted as "The register ties to the GL."

                `accounts.length === 0` is the DB's own report that it compared nothing.
                The tie itself is still rendered verbatim, never re-derived from
                `accounts[]` (the type's own docstring forbids that, and
                `cost_reported_here` would make such a sum wrong). */}
            <StateBanner
              tone={notEvaluated ? "neutral" : data.tie ? "neutral" : "error"}
              title={t("asOf", { date: data.as_of })}
            >
              {notEvaluated ? t("notEvaluated") : data.tie ? t("tied") : t("broken")}
            </StateBanner>
            {data.incomplete_count > 0 ? <p className="text-xs text-warning">{t("incompleteNote", { count: data.incomplete_count })}</p> : null}
            {data.pending_draft_count > 0 ? <p className="text-xs text-muted-foreground">{t("pendingDraftNote", { count: data.pending_draft_count })}</p> : null}
            {/* The EmptyState that used to sit here said the same thing one line
                lower than the banner now does — dropped rather than duplicated. */}
            {notEvaluated ? null : (
              // F4 (independent review, fix-required, 2026-08-28): the prior
              // single generic Register/GL/Diff triple picked ONE side per
              // row keyed on `cost_reported_here` (which means "first row in
              // the walk for this asset account", not "which side broke") —
              // a row could show a 0.00 diff while the OTHER side it hid was
              // genuinely broken. Both DB-owned comparison pairs render on
              // every row now; cost is blanked (never zeroed) on a
              // non-first row of the same asset account, matching the DB's
              // own dedup convention (fa_register_tie's SQL comment: "cost
              // is reported on the account's first row only") so summing
              // this column across rows still reproduces the account's real
              // cost rather than a multiple of it.
              <DataTableCard>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("assetAccountCol")}</TableHead>
                    <TableHead>{t("accumAccountCol")}</TableHead>
                    <TableHead>{t("registerCostCol")}</TableHead>
                    <TableHead>{t("glCostCol")}</TableHead>
                    <TableHead>{t("costDiffCol")}</TableHead>
                    <TableHead>{t("registerAccumCol")}</TableHead>
                    <TableHead>{t("glAccumCol")}</TableHead>
                    <TableHead>{t("accumDiffCol")}</TableHead>
                    {/* CB-AE2E-029, second half: `fa_register_tie` mints these four
                        precisely so a BROKEN tie is actionable — they attribute the
                        difference to GL movement dated before the account was enrolled,
                        and to GL movement belonging to a register this walk does not
                        cover. The row carried them all along and rendered none. */}
                    <TableHead>{t("preEnrolmentCostCol")}</TableHead>
                    <TableHead>{t("preEnrolmentAccumCol")}</TableHead>
                    <TableHead>{t("foreignRegisterCostCol")}</TableHead>
                    <TableHead>{t("foreignRegisterAccumCol")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.accounts.map((row, i) => (
                    <TableRow key={`${row.asset_account}:${row.accum_account ?? ""}:${i}`}>
                      <TableCell>{row.asset_account}</TableCell>
                      <TableCell className="text-muted-foreground">{row.accum_account ?? "—"}</TableCell>
                      <TableCell>{row.cost_reported_here ? fmtCents(row.register_cost_cents, tc("centsUnsafe")) : "—"}</TableCell>
                      <TableCell>{row.cost_reported_here ? fmtCents(row.gl_cost_cents, tc("centsUnsafe")) : "—"}</TableCell>
                      <TableCell className={row.cost_reported_here && row.cost_diff_cents !== 0 ? "text-error" : ""}>
                        {row.cost_reported_here ? fmtCents(row.cost_diff_cents, tc("centsUnsafe")) : "—"}
                      </TableCell>
                      <TableCell>{fmtCents(row.register_accum_cents, tc("centsUnsafe"))}</TableCell>
                      <TableCell>{fmtCents(row.gl_accum_cents, tc("centsUnsafe"))}</TableCell>
                      <TableCell className={row.accum_diff_cents !== 0 ? "text-error" : ""}>
                        {fmtCents(row.accum_diff_cents, tc("centsUnsafe"))}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.cost_reported_here ? fmtCents(row.gl_pre_enrolment_cost_cents, tc("centsUnsafe")) : "\u2014"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{fmtCents(row.gl_pre_enrolment_accum_cents, tc("centsUnsafe"))}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.cost_reported_here ? fmtCents(row.gl_foreign_register_cost_cents, tc("centsUnsafe")) : "\u2014"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{fmtCents(row.gl_foreign_register_accum_cents, tc("centsUnsafe"))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </DataTableCard>
            )}
          </div>
        ) : null}
      </DataState>
    </div>
  );
}
