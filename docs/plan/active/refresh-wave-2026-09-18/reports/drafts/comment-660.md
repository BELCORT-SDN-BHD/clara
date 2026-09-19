Landed via PR #954 ("Wave 2026-09-18"), merged into `main` at `ede1df83` (2026-09-19T13:59Z).
#660's migration is `packages/db/migrations/0232_client_financial_pack.sql` — the governed
cash-account-set relations, three doors (`get_client_financial_pack`, `propose_client_cash_accounts`,
`publish_client_cash_account_set`), plus the client-home money band (Recharts, period selector,
drilldowns). Two fix rounds and two rechecks ran before merge; integration then re-pointed the
pack's money as-of from the session clock to the house book-day derivation (DECISIONS §6.4), one
more edit landing after the successor cut. **All evidence below is LOCAL; hosted evidence pending —
this ticket stays open until the hosted release.**

## AC / historical-obligation disposition

| Row | State | Evidence |
|---|---|---|
| AC1 envelope + governed cash set incl. inactive/petty cash | done | `p660.pack.envelope_complete`, `cash_set_inactive_member`, `cash_set_unpublished`, `publish_*` (5 cells) |
| AC2 cash cumulative, six points, pre-coverage, no statement balance | done | `cash_cumulative_no_fy_reset`, `matches_trial_balance`, `pre_coverage_point`, `statement_balance_never_cash` |
| AC3 MYT period, no future actuals, closing-transfer exclusion | done | `future_as_of_refused`, `closing_transfer_excluded`, `reopen_mirror_excluded`, `unmarked_history_partial`, `reversal_and_negative_not_clamped` |
| AC4 comparison rules | done — wrong for a complete historic month, fixed round 1 | `historic_comparison_full_prior_month` (red first), `mtd_comparison_capped` |
| AC5 six-month chart, table fallback, drilldown | done — drilldown was dead against the real door, fixed round 1 | `client-financial-charts.test.tsx` (10 cells, real payload), `composition_account_cap_disclosed` |
| AC6 refresh, states, golden fixtures | partial — residual: commit-event invalidation has no bus event (`lib/command/bus.ts:33,111`), disclosed on face | `use-financial-pack.test.ts` (9 cells), walk `p660.money.delayed` |
| AC7 states, 320px, 200%, keyboard, SR names | done | `client-home-money-a11y.test.tsx` (5), `client-home-money-keyboard.test.tsx` (4) |
| AC8 production-facing read, real roles, real migrations | done — db-only, 0232 writes no runtime module | `humanQuery` personas; `floor_viewer`, `cross_firm`, `no_agent_reach` |
| UI-23 (shared with #669) | verify-only + done for the money half; neither ticket alone | `client-work-attention.test.tsx` 15/15, `client-workspace-overview.test.tsx` 15/15 |

## Rulings that shaped it

- **D19 (§0):** governed, versioned cash-account-set (admin publish, incl. inactive/petty cash);
  pre-0120 unmarked closes disclosed, not repaired; Recharts via `ui:add chart` with table
  fallback; period selector in URL; viewer can read.
- **§6.2.1:** four ratifications shipped — token `cash_set_published_after_books_start`;
  `comparison.{available,reason}`; top-level `unmarked_closing_entries_series` +
  `series_coverage_reason`; the branch's own `cn`-dropping lockfile move.
- **§6.2.2 (fix round 2):** NF-1 — a raced publish's loser was refused misleading `CLR10
  first_version_after_books_start` instead of `CLR11 cash_set_version_raced`; fixed, proven with a
  two-session cell. NF-2 — softened an unreproducible "fully green" claim to name the pre-existing
  `use-clara-thread-stop.test.ts` flake.
- **§1 note:** DECISIONS' `cash_set_version_race` spelling is a transcription; shipped, ratified
  token stays `cash_set_version_raced`.
- **§6.4 row 1 (post-successor-cut):** the pack's two money-date reads derived as-of from the
  session clock directly; re-pointed through a new `clara.book_today()` delegate, proven on a
  fresh cluster. **Row 4:** the two-build cutover leg, blocked on a contaminated rig, re-run clean.

## What integration and the successor cut added

Merged as commit 9 of 10 (`419c9a1e`, migration 0232), 11 conflicts resolved (`rig-meta.mjs` brace
hazard, `home-board-mock.mjs`/`home-board-walk.spec.ts` grafts); battery measured **35/0/0** at the
merge. #660 cuts no `chatTurn_v21`/`claraWork_v5` tool — `read_client_financial_pack` stays a
follow-up contract, absent by name in `successors-final.md`. Fix round 2 (post-cut) added the
`book_today()` delegate, cell `p660.pack.as_of_is_book_day`, reclassified two S5.25 census rosters
(comment-only) — battery now **36/0/0**; the estate suite's five merge-time failures (none #660's)
are zero on re-run.

## Residuals — follow-ups to be filed (title only)

`ui:add` cannot invoke the shadcn CLI on Windows; discharge the pre-0120 `closing_transfer`
unmarked-history backfill; cut the deferred chat tool `read_client_financial_pack`; render
`cash.composition` (nothing consumes it yet); a cash-account-set membership editor beyond first
publish; decide whether `clara.create_account_set_v1` should retire; the midnight-MYT book-day skew
(named in 0232's header). Shared: `use-clara-thread-stop.test.ts` whole-suite flake; `migrate.mjs`
has no "redo" mode for an unmerged migration; two unruled cash expressions
(`list_bank_statements.tie.gl_balance_cents` vs. this ticket's book cash).

## Blueprint drift for #683's sync

- `docs/PRD.md:59` — "four summaries + three charts" is now **two and two**: cash + profit
  (income/expense as sub-figures), two charts; AR/AP is #669's.
- `docs/ARCHITECTURE.md:287` + §7's metric-pack row — cash/profit is discharged through
  `clara.get_client_financial_pack`, **not** the 0058 metric lane; AR/AP is #669's.

## Verify locally

```sh
pnpm typecheck && pnpm lint
pnpm --filter @clara/db test   # incl. client-financial-pack.test.mjs, 36/0/0
node --import ./test/bootstrap.mjs --import tsx --test tests/firm-scope-db-pins.test.ts   # cwd apps/web, 22/0/0
pnpm --filter @clara/web e2e home-board-walk   # 21/21
```
