# #650 — 在 A 风格客户首页直接看见需要你、处理中和近期完成

**Branch** `impl/650-client-home-work` · **worktree** `C:\Users\zhant\Desktop\clara-wt\650` · rig PG `127.0.0.1:55509` / `clara_650` (194 migrations after 0199, PG 17.11) · Playwright **3310/3311/3312**. Every run below is **LOCAL**; **hosted evidence pending** (this slice has no hosted lane).

```
e9deacae fix(web,docs): round-2 review — the drilldown claim is qualified where it is not true
fed8b566 fix(web,db,docs): round-1 review — the recent-success drilldown says what it is dated by
a948fb8b test(web,docs): the browser walk for the attention band, and the sources of truth
8b248ebd feat(web): the client home's Work attention band, its read and its one href builder
cfa1c710 feat(db): 0199 — clara.get_client_work_pack, the client home's Work attention facets
```

`fed8b566` is **fix round 1** (the three review lenses on head `a948fb8b`) and `e9deacae` is
**fix round 2** (the recheck lens on `fed8b566`); their finding-by-finding records are
`reports/650-fixround-1.md` and `reports/650-fixround-2.md`. The counts and the AC3 row below are
the post-round-2 ones. `packages/db/migrations/0199_client_work_pack.sql` is byte-identical to
`a948fb8b` — neither fix round touched `packages/db/migrations/` or `packages/runtime/`, so no
rollback, re-apply or parts-parity work was owed.

## What the cut left, and what I did with it

`git status` clean, `git stash list` empty, three commits, `origin/main` still `4464e471`. **The killed worker left nothing uncommitted and nothing stashed, so nothing was kept-and-committed and nothing was discarded.** Re-reading the brief against the three commits found every promised artefact present, so this session is verification, the unresolved Playwright question, and two measurements the shipped source asserted but no artefact backed. **Zero new commits** — adding one would have been a claim, not a change.

## Per criterion / historical row

| Row | State | Evidence |
|---|---|---|
| **AC1** | done | needs-you restated from the shipped viewer-floored `counts.work_questions` (`client-work-attention.tsx` `needsYouFacet`); active = `status in ('queued','running')`, `count(distinct w.id)` → `p650.pack.active_distinct`; recent success = committed receipt in 7 MYT dates → `p650.pack.recent_window`, `.refused_receipt`; "technically retrying" = row label (`attempts>1`) → `p650.pack.over_101_active` + `client-work-attention.test.tsx` "RETRYING is a row label". A-composition = Cards in the existing `@container` grid + `supports-backdrop-filter:backdrop-blur-xs`; no `Item` install, no `glass` token. |
| **AC2** | done | Overlap in words (`overlapNote`), no total key → `p650.pack.no_sum` + "THERE IS NO TOTAL to hydrate". 95/5 batch: **stated, not built** — `accounting_work` has no parent/child columns, per-item progress is #636 (`ARCHITECTURE.md:360`). Period clause **closed by seam 11**, both halves: `p650.pack.no_period_axis` (db signature + tail postcheck) and two web cells + the board cell "a fiscal-year parameter in the page's address changes NOTHING". |
| **AC3** | done, the recent-success leg **partial by name** | One builder `workAttentionHref` read back through the list's own parser (3 cells); browser `home.facets.drilldown` — each count opens its own scoped URL, lands on the population the fixture says it should, Back restores the **home's** URL, focus returns to the control. Retry not expressible → disclosed (`retryNotFilterable`). **PARTIAL (round-1 review 650-B1):** the recent-success count is dated by the COMMITTED RECEIPT and the list it opens is dated by ADMISSION (`clara.list_accounting_work` fences `accounting_work.created_at`, 0189:427-428; that door has no receipt-dated axis and 0189 is not recut this wave, DECISIONS §1.3). The two populations are the same week over a different subject and diverge in exactly two ways, measured by `p650.pack.recent_success_drilldown`; the tile now discloses it in words (`recentSuccessListBasis`) the way it already does for retry — and, in the one defensive arm where the window cannot be read and the builder drops both dates, names the WIDER population the link then carries (`recentSuccessListUndated`, round-2 review 650-R2; `workAttentionWindowDates` is the one predicate the href, the instant rebuilder and the sentence all read). A receipt-dated list axis is filed as a follow-up. Readiness = label + "measured by #677" inside `ClientCloseSummary`, pinned by overview cell F. |
| **AC4** | done, one clause **partial by name** | `computed_at` + per-facet coverage replaces the watermark (ruling; the Work lane emits no `domain_events`). 30 s while-visible, focus/visibility re-read, `delayed` from the **imported** `WORK_STALE_AFTER_MS` → `use-client-work-pack.test.ts` cells 3/4/5/10 and `home.facets.delayed`. Clear-on-client/access-change → cells 8/9. **"Refresh after commits" is not an event subscription**: `lib/command/bus.ts` carries only the focus-rail and client-record families and the board writes nothing, so a commit elsewhere lands via the visible-return or the ≤30 s re-read. |
| **AC5** | done | `home.facets.responsive` (320 px, 200 % zoom as a halved viewport, reduced motion, axe on the **populated** band), `home.facets.states` (empty ≠ unknown ≠ denied, "Read at …", no "up to date" claim), `home.facets.delayed`, `home.facets.drilldown` (keyboard, focus return, stable URL/Back). **No preserved-drafts obligation** — the band has no input. |
| **AC6** | done at DB; Workflow half **not applicable** | 12 db cells under real least-privileged roles on the rig. The journey invokes no Workflow and ships **no** `packages/runtime` file, so there is no World e2e leg and no `db-live-gates/action.yml` row (authority: brief; gap map `touches_frozen_closure: false`). |
| **UI-23** (REDESIGN) | done | Four pinned preserve-clause cells green inside the whole suite; `home-board-walk` legs 1–5 (identity/queue/onboarding/container reflow/axe) unchanged and green. |
| Activity-kind misfiling (D13) | **named residual**, not fixed | Two doors share one ladder; four tickets touch it (DECISIONS D13). |
| `stopping` Work carries no tile (round-1 review 650-N2) | **named residual**, not fixed | The status roster has nine members (`accounting_work` CHECK, re-read on the rig); the pack's predicates are `('queued','running')` and the committed-receipt window, so a Work whose cancellation is in flight is in no facet. Matches the brief verbatim (brief-650 line 8, DECISIONS §2 #650), so widening `active` is a brief change — orchestrator's. |
| the needs-you chip's active-client guard (round-1 review 650-N3) | **named residual**, inherited | The live `clara.list_review_queue` body joins `clara.clients wqc … and wqc.status='active'` in its `work_question_rows` arm (read off `pg_proc` on the rig, line 215 of the live prosrc), while `clara.list_accounting_work` joins `clara.clients` with **no** status predicate (line 159). So on an `onboarding` or `archived` client the tile prints "No Work is waiting on a person…" while the list it links to still holds the rows. Inherited from #629's shipped chip; #650 adds a second place it is stated. Belongs to whoever owns the review-queue splice. |

## The open question at the cut: `responsive-shell-walk` 22/24

**Verdict: host contention, not a regression.** Four solo runs on my triple, same commit:

| run | result | wall-clock | failing test numbers |
|---|---|---|---|
| 1 | 15 passed / 9 failed | **37.9 m** | 1,3,5,9,10,13,14,19,21 |
| 2 | 20 passed / 4 failed | 8.7 m | 10,11,12,13 |
| 3 | **23 passed / 1 failed** | **4.3 m** | 1 |
| 4 | 18 passed / 6 failed | 29.9 m | 1,2,3,4,5,21 |

The failing set is disjoint run to run and **every one of the 24 tests passes in at least one run** (cross-tabulated from the four logs). Every failure is `signInTo`'s `page.goto`/`toHaveURL` timing out, a `waitForLoadState` timeout, a `Protocol error … session closed`, or a transition-frame sampler — **not one assertion about the attention band, the 320/640 reflow geometry, `target-size` or axe ever failed**, and the client-workspace reflow leg (the one that renders the band at 640 px) passed in runs 2 and 3. Measured host state during run 1: **93–100 % CPU on 24 logical cores, six other lanes live** (633/646/647/648/649/625 node processes). Nothing was "fixed".

## Two claims in shipped source, now measured

1. **No supporting index owed** (brief decision 2, preferred branch). `EXPLAIN (ANALYZE, BUFFERS)` as the **bookkeeper** role with RLS in force, after `ANALYZE`, on `clara_650` (1073 `accounting_work` rows, 102 active for the probed client; 63 `operation_receipts`): active → `Bitmap Index Scan on uq_accounting_work_intent (firm_id, client_id)`, exec 21.7 ms; recent-success → `Index Scan using ix_operation_receipts_client` with the half-open MYT range as the Index Cond, exec 0.36 ms (and `Bitmap Index Scan` on the same index for a client that has receipts, 0.41 ms). **No sequential scan on either facet, so no new index.** Correction to 0199's header: the planner used `uq_accounting_work_intent`, not `ix_accounting_work_client`, because RLS adds `firm_id = jwt_firm()` and makes it a two-column prefix. The receipts cohort is small (63 rows, ≤3 per client) — that leg is weaker evidence than the active one. **Fix round 1** re-measured both plans on the same rig (1,317 `accounting_work`, 81 `operation_receipts`; probed client 102 active): active → `Bitmap Index Scan on uq_accounting_work_intent`, 0.45 ms; recent success → `Index Scan using ix_operation_receipts_client` (0.05 ms) and `Bitmap Index Scan` on the same index for a client that has receipts (0.08 ms). The correction now lives on the branch, in `packages/db/README.md` (review finding 650-S2) rather than only in this report.
2. **SECURITY INVOKER proven relation by relation** (brief decision 3). `clara.accounting_work` and `clara.operation_receipts`: `relrowsecurity=t`, `relforcerowsecurity=t`, `clara_authenticated=r/clara_fn_owner` (SELECT only), policies `p_accounting_work_read` / `p_operation_receipts_read` `SELECT … qual (firm_id = clara.jwt_firm())`. `clara.agent_tasks`: **no** `clara_authenticated` grant (`clara_runtime=arw` only). The door: `prosecdef=f`, `provolatile=s`, `proconfig = search_path=clara, pg_temp | plan_cache_mode=force_custom_plan`, owner `clara_fn_owner`, `proacl = clara_fn_owner=X | clara_authenticated=X`, args exactly `p_client uuid, p_preview integer DEFAULT 5`.

## Tests and commands (all local, all on this rig/triple)

- **DB battery** `packages/db/tests/client-work-pack.test.mjs` with the exact **29** `--import …-preintegration-gate.mjs` flags from `packages/db/package.json`: **13 tests, 13 pass, 0 fail, 0 skipped**, exit 0 (fix round 1; **12** at the cut, 16.5 s). Cells: `active_distinct`, `recent_window`, `refused_receipt`, `completed_no_receipt`, **`recent_success_drilldown`** (added by fix round 1 for 650-B1), `over_101_active`, `no_sum`, `floor_viewer`, `cross_firm`, `distinct_defence`, `catalog`, `no_period_axis`, `runtime_lane`. A skip would not have been evidence; there were none.
- **`operation-census` + `rig-isolation`** (same 29 gates, **no** reset flags): **31 tests, 30 pass, 0 fail, 1 skipped**, 672 s, exit 0. The skip is `T19 poison-role` (destructive, by design). No World bootstrap ran, so there is no T10b rig-state caveat here.
- **Whole `apps/web` unit suite**, `node scripts/run-tests.mjs` from `apps/web`: **3762 tests, 135 suites, 3760 pass, 0 fail, 2 skipped**, 361 s, exit 0 (fix round 2; **3760/3758** after round 1 at 252 s; **3755/3753** at the cut — the two newest cells are round 2's windowless-arm pair). The 2 skips are the live-provider auth cells (`CLARA_LIVE_SUPABASE_AUTH_*` unset). The census suites (`sql-oracle`, `parity-holes`, `firm-scope-surfaces`, `firm-scope-fourth-entrance`, `e2e-fixture-ownership`) are green. **`thread-live-clarify.test.tsx` did not flake** in this run, so no isolation re-run was owed.
- **Playwright** `home-board-walk` on 3310/3311/3312: **9 passed, 0 failed**, exit 0 — the four new legs plus the five pinned pre-existing ones. 4.8 m at the cut; **37.1 s on fix round 1's first solo run** — with the drilldown leg now asserting the population it lands on rather than a mocked empty page (review finding 650-S1) — and **50.0 s / 9 passed on fix round 2's first solo run**, my three ports verified free beforehand. `responsive-shell-walk`: the four runs tabulated above.
- `pnpm typecheck` **exit 0**; `pnpm lint` **exit 0** (root gate chain + all four workspaces, including `check-test-manifest`, `check-message-keys` — **2,932** keys after fix round 2 (2,931 after round 1) — and `check-token-contrast`). `node scripts/check-frozen-workflows.mjs` → **OK, 281 frozen files, 51 `use workflow` modules**. `node packages/runtime/scripts/check-parts-parity.mjs` → **OK** (run although not applicable: `git diff --name-only origin/main..HEAD -- packages/runtime` is empty).
- Known Windows reds **#707** and **#693** were not touched and did not appear in any run above.

## Docs updated

`packages/db/README.md` (0199's no-consumer-first argument and the one prestate pin) · `packages/db/tests/README.md` ("Owner-level fixture DML, where it is unavoidable" + the battery and its gate) · `apps/web/README.md` (the `/clients/:clientId` row, whose drilldown claim round 2 qualified; the per-section-reads / two-reads-three-tiles / floor-asymmetry paragraph; what `computed_at` is; and the drilldown paragraph naming both narrowings the list's axes cannot express — retry, and the recent-success subject) · `CONTEXT.md` (**Work attention facet**, **Work pack**, both in the term / _Avoid_ shape). `docs/PRD.md` and `docs/ARCHITECTURE.md` untouched.

**Blueprint drift: none found.** The watermark → `computed_at` substitution is DECISIONS §2 #650, a ruling against the ticket's wording, not against a blueprint sentence.

## Successor contract

**None owed.** The journey is a read-only board: it admits no Work, calls no tool, writes no execution trace, and ships no `packages/runtime` file. Authority: `WORK-ORDER.md:8`, brief §3 ("no frozen successor, no chat tool"), gap map frozen verdict `touches_frozen_closure: false · successor_needed: none`. There is therefore also **no `db-live-gates/action.yml` row and no World e2e leg** — stated so a reviewer does not hunt a missing half.

## Assumptions

1. The "needs you" number now appears twice on this page — as the band's tile and as the existing chip below — from **one** read, with the tile naming its source (`needsYouSourceNote`). I read 裁-190 as "one read, one source", not "one rendering"; both renderings are live and cannot disagree. Flagging it because a reviewer could read the rule the other way.
2. The e2e `get_client_work_pack` handler in `home-board-mock.mjs` is deliberately **unscoped** and declared as **debt** (not "unscopeable") in `e2e-fixture-ownership.test.ts` — the request carries `p_client`, so the honest word is debt. It holds no fixture (both facets `count: 0`).
3. Migration 0199 was already applied on this rig at the cut; I did not roll it back or re-apply, and its `_work_run_attempts` sha pin still verifies (tail postcheck re-runs on apply; catalog re-read above).

## Follow-ups worth filing

1. **Scope the client-work-pack e2e mock by `p_client`.** `home-board-mock.mjs` answers `get_client_work_pack` for every client id so no walk that merely lands on `/clients/:id` grows two "could not be read" tiles. The verb carries a discriminant, so the debt row in the ownership census can be repaid by keying the handler on `p_client` and letting unknown ids fall through.
2. **`needs-you-counts.tsx:7-10` is stale.** Its comment says the envelope carries "EIGHT counts" while the file renders nine chips (`work_questions` was added by 0180). Comment-only, but it is the first thing a reader of that file is told.
3. **The client Documents workbench still stays `running` until reload.** #650's own ticket comment names it as the defect the tiles must not inherit; the band does not inherit it (30 s + visible-return re-reads), and the workbench is untouched. It needs its own ticket.
4. **`lib/firm/use-review-queue.ts:166` drops the review-queue envelope's `watermark`.** A dead signal either way for the Work lane; either surface it for the queue or delete it from `lib/firm/needs-you.ts:242`.
5. **`responsive-shell-walk` is not robust to a loaded host.** Its `signInTo` helper leans on a 5 s `toHaveURL` and the default 30 s test timeout; under twelve concurrent lanes it fails a different arbitrary subset each run (evidence above). Worth a `cellBudgetMs`-style budget or a CI-only serialisation rather than twelve workers discovering it independently.

## Unverified

- **Hosted evidence: none exists for this slice — hosted evidence pending.** Nothing here is claimed beyond this machine.
- `responsive-shell-walk` never reached **24/24 in a single run** on this host. What is proven is narrower and stated exactly: every test passes in at least one of four solo runs, and no failure in any run was an assertion the attention band could cause.
- The recent-success `EXPLAIN` is measured against 63 receipts, not a production-scale cohort; its "no sequential scan" result is structural (the index cond matched) rather than a load measurement.
- 0199's header sentence that both indexes "were measured on a rig cohort before this file was written" is backed by **my** measurement above, not by any artefact the cut worker left; the active-facet attribution in that sentence is corrected above.
