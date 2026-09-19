Landed on `impl/659-firm-home` (worktree `clara-wt/659`), HEAD `cc19cf18`, merged to `main` at **`ede1df83`** (PR #954, "Wave 2026-09-18"). Migration **`0231_firm_portfolio_pack.sql`** (`get_firm_portfolio_pack`, `get_compliance_watch_disposition`). One fix round (15 applied, 2 deliberately left, 1 ratification requested — resolved below); recheck-1 verdict `accept`. **All evidence below is LOCAL; hosted evidence pending — this ticket stays open until the hosted release.**

**AC / historical rows**

| # | Criterion | State | Evidence |
|---|---|---|---|
| AC1 | Canonical counts/coverage/freshness; no cross-client money | done | `p659.portfolio.distinct/.no_sum/.attention_failed/.partial_receipt/.onboarding_disclosed`; money absent, proven 3 ways (0231 `prosrc` probe, `p659.portfolio.no_money`, `firm-portfolio.test.tsx`) |
| AC2 | Links + preserved return state | partial (named residual) | `compliance_watch→/tax`, `portfolio-url-state.ts` done (`p659.home.drilldown`, Back+focus return); **`work_question` link withdrawn** — row publishes `task_id`, not `work_id` (`p659.links.work_question_row_cannot_address_its_work`); ratified not-this-wave, §6.2.0 R-E |
| AC3 | Six faces (zero/empty/partial/stale/error/caught-up) | done | `firm-home-states.test.tsx` 10 cells (7 distinct strings); `p659.home.states` |
| AC4 | Zero-client creation | done | `p659.home.zero_client_create` + bookkeeper twin |
| AC5 | Mixed fixtures/access-change/missed-event/exact-count/responsive | done | `use-firm-portfolio.test.ts` 10 cells; `p659.home.portfolio`/`.drilldown`/`.responsive` |
| AC6 | Compliance acts preserved + attributable receipt | done (acts verify-only) | `compliance-watch-affordance.test.tsx` 3/3; `compliance-watch-disposition.test.mjs` 6/6; `compliance-watch-receipt.test.tsx` 7/7 — actor resolved to a name via `firm_members_visible`, not a raw uuid (fix A7) |
| AC7 | States/zoom/focus/SR/keyboard/URL/drafts | partial (named residual) | Built; **invalid/saving and cancelled/recovery have no referent on a link-only surface** (reported, not invented, D18.d); focus return was unmet (assertion couldn't fail) until fix A3 built `portfolio-focus-return.ts`, 4 unit cells + browser leg |
| AC8 | Real least-privileged roles + Workflow durability | done (no Workflow invoked) | `humanQuery` personas; `p659.portfolio.machine_lanes`/`.floor_viewer`/`.catalog`; journey invokes no Workflow by design (no route/enqueue/World) |
| UI-04 | shadcn composition | done | `Table`/`DataTableCard`, `Pagination`, `Empty`, `Skeleton`; chip corrected to `PartBadge` (sibling reuse, not a second Badge) |
| UI-05 | Responsive/`@container` | verify-only | `@container`/`@3xl:` kept; `token-contrast` 19/19 |
| UI-12 | A11y/focus/reduced-motion | verify-only | `focus-ring-contract` 7/7, `reduced-motion-contract` 4/4 |
| UI-35 | Redesign contract | done | The portfolio layer + disposition door + receipt |
| F-06 | No cosmetic token split | verify-only | No new token minted |
| C88.10 | Compliance receipt trace | done | `get_compliance_watch_disposition` + `compliance-watch-receipt.test.tsx` |

**Rulings.** D18 (§0) — ruling behind this ticket's shape: no DB-wall change; `coverage_reason` discloses the two population reads; new narrow door `get_compliance_watch_disposition` (C88.10); `AddClientControl` extracted to a shared module; compliance rows link-only; `recent_success` kept with an honest window caveat. §6.1 (#657 row) also binds #659: `home-board-mock.mjs`'s `EMPTY_RPCS` arm/dispatch position may not move. §6.2.0 R-E — the `work_question` deep link is not built this wave (no `work_id` on the queue row; recutting `list_review_queue` is forbidden); residual named, follow-up filed. §6.2.1 (#659 row) ratifies all three: no `work_id` this wave, `list_firm_timeline` left unconsumed, 0231 prose not edited post-application.

**Integration and successor cut.** No successor contract for #659 — WAVE-DIGEST §4 names it explicitly ("the three compliance doors refuse an agent identity by construction… not a deferred tool"); neither `chatTurn_v21` nor `claraWork_v5` touches this ticket. At integration, unioning #659's and #660's bimodal guards in `rig-meta.mjs` swallowed #659's closing brace (a `SyntaxError`) — repaired before commit. `home-board-mock.mjs`/`home-board-walk.spec.ts` and the `e2e-fixture-ownership.test.ts` mock row were grafted, not restructured: #659's portfolio arm stays closed and above `EMPTY_RPCS`. `firm-portfolio-pack` (17/0/0) and `compliance-watch-disposition` (6/0/0) reconfirmed at the integration head. `get_firm_portfolio_pack` was registered **CLASS 2** in the S5.25 money-date census (a `computed_at` sample plus a 7-day MYT window — display, not a money date); §6.4's repoint touched only #660's two functions, not this one.

**Residuals (to be filed).** "Publish `work_id` on `list_review_queue`'s `work_question_rows`" · "Deduplicate Firm Home's two client-register renderings" · "Mount `get_compliance_watch_disposition` on `/settings/compliance`" · "Delete the unconsumed `lib/firm/timeline.ts`/`clara.list_firm_timeline`" · "Non-deterministic `use-clara-thread-stop.test.ts` flake (#630's lane)". Already tracked, untouched: #903, #861.

**Blueprint drift (#683).** `docs/PRD.md:27` (mis-cited `:31` in the brief) — the per-client firm-altitude aggregate now exists. `docs/ARCHITECTURE.md:134-135` — querying permitted clients is true; **organising batch work at firm altitude still does not exist** (board renders no such affordance).

**Verify locally**
```sh
node --test --test-concurrency=1 <41 gate flags> packages/db/tests/firm-portfolio-pack.test.mjs packages/db/tests/compliance-watch-disposition.test.mjs   # 23/23
node scripts/run-tests.mjs   # apps/web: 4204 tests, 4202 pass (the one use-clara-thread-stop.test.ts flake is #630's, non-deterministic)
pnpm --filter @clara/web e2e home-board   # 15/15
pnpm typecheck && pnpm lint   # both green
```
