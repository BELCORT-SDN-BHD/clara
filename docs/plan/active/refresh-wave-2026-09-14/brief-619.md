# Brief: #619 — parallel browser acceptance: mock dispatch and table coverage

## Orchestrator decisions (binding)
- AC1 reading accepted: deliver the DETECTOR (concurrency counter-example test) plus the two named fixes (F-05 in fs4-checkout-mock, #740 in journal-work-mock) plus the shared dispatch helper. Do NOT flip `workers` above 1 in this PR; do NOT rearchitect all ten lanes for isolation. Say so in the PR body.
- Table coverage pattern applied to exactly two tables: Journals (fill the three missing states) and the Clients register (add `DataTableCard label`, scoped `getByRole("table", { name })`, population/filter/empty/isolation).
- This PR also resolves open bugs #722 and #740 (reference them in the commit message: "Closes #722, Closes #740" is NOT allowed — main is protected and PR merge is manual; write "Resolves the defects filed as #722 and #740" and the orchestrator closes them).
- No CI wiring change (CB-AE2E-036 stays out of scope; state that).
- Other wave tickets will add NEW lane mocks (operator-support-mock.mjs, work-list-mock.mjs, plans-mock.mjs …) registered in serve-built.mjs. Keep your serve-built.mjs edits minimal and localised (the shared helper import, the typed unmatched fallback) so those PRs rebase cleanly.

## 1. Current state
Dispatch shape. `apps/web/e2e/serve-built.mjs` runs ONE Node HTTPS process for the whole suite (built by `run.mjs`, served per `playwright.config.ts`: `workers: 1`, `retries: 0`, `fullyParallel: false`, `reuseExistingServer: false`). All fixture state lives in one mutable `state` object (`serve-built.mjs:119-162`) plus per-lane module-level state. Ten lane mocks (`LANE_MOCKS` in `e2e-fixture-ownership.test.ts:51-62`) are chained as `if (await handleX(...)) return;` hooks inside `handleSupabase`/the runtime delegate chain, ordered by hand-written comments recording measured drain hazards (`serve-built.mjs:513-592`).

Parse-before-match is a present defect. `fs4-checkout-mock.mjs:242-243` pushes every `/rest/v1/rpc/*` verb into `state.doorCalls` before any `fn ===` branch runs (F-05), and it runs FIRST in the chain (`serve-built.mjs:339`). `checkout-gate-walk.spec.ts:561` (`expect(after.doorCalls).toEqual([])`) and `:311-314` depend on that array containing only genuinely-dispatched checkout verbs. `journal-work-mock.mjs`'s control leg (`/api/e2e-journal-work/control`, lines ~643-648) reads the body via `readJson` before checking `body?.client !== JOURNAL_WORK.clientId` (#740).

Body-drain hazard (#722): fixed in `bank-close-registers-mock.mjs:211-228` (guarded by `L7_RPC_VERBS`, pinned by `e2e-fixture-ownership.test.ts` N7) and in `journals-table-mock.mjs` / `journal-work-mock.mjs` (both reimplement a `request.__e2eParsedBody`-caching `readJson`, lines 159-169 and 527-535). `activity-mock.mjs`, `agentic-finish-mock.mjs`, `chat-parity-mock.mjs`, `documents-viewer-mock.mjs`, `tax-boundary-mock.mjs`, `serve-built.mjs` itself, and `fs4-checkout-mock.mjs` (via the un-cached `ctx.readJson` from `serve-built.mjs:278`) still define their own uncached `readJson`.

Unmatched-request behaviour is the shared `sendJson(response, 404, { message: "unhandled e2e Supabase route..." })` fallback at `serve-built.mjs:679`; no typed contract.

Per-worker isolation does not exist by design (README; `serve-built.mjs:198-201`). `home-board-mock.mjs` models per-test isolation via Playwright `page.route` overlays.

CI: no workflow references Playwright.

Table assertions today. `journals-table-walk.spec.ts` uses scoped `page.getByRole("table", { name: "Journal entries" })` (line 44, via `DataTableCard`'s optional `label` prop, `components/common/data-table-card.tsx:22-47`), population/ordering assertions (58-75), filter narrowing with counts (78-107); no pagination, empty-population, or stale/refused-envelope test. `agentic-finish-walk.spec.ts:326-345` asserts a heading and a button only (anti-pattern); `client-register-list.tsx:218` calls `<DataTableCard>` with no `label` (only journals passes one of ~20 call sites). A1 covered by checkout-gate-walk; C3 by journal-work-walk + manual-journal-walk; C12 (Reports) has no fixture-suite walk (note only).

## 2. Gaps / historical rows
AC1: F-05 and #740 sites; no unmatched typing; no isolation; no counter-example. AC2: journals lacks 3 of 6 states; client register lacks all 6 plus the label. AC3: already practiced (every mock header states the boundary) — verify-only. AC4: bound to the two tables touched.
Rows: UI-07 verify-only (journals) / to build (register); UI-11 to build (census in e2e-fixture-ownership); CB-AE2E-036 out of scope; C-27 satisfied (N4/N5 census) + RPC-verb census extension; C-60, C-66, C-67, C-68, C-74, C-76, C33.1, C51.5, C77.9, C83.1 out of scope (no e2e-mock evidence); C-72 satisfied (`serve-built.mjs:76,930` scoped cleanup); C-73 deferred to #706/#760 (do not fix here); F-05, Q-07 to build; C88.9 not claimed.

## 3. Slice (one PR)
1. New `apps/web/e2e/mock-dispatch.mjs` exporting `readCachedJson(request)` (the existing cached implementation, deduplicated) and `matchVerb(verbSet, verb)`. Migrate all lane mocks and serve-built.mjs onto it; remove per-file `readJson` copies and moot ordering comments.
2. F-05: `state.doorCalls.push(fn)` only on a matched branch (or split attempted/dispatched arrays if attempted visibility is wanted).
3. #740: control-leg discriminant on the query string (`?client=`), mirroring `chat-parity-mock.mjs:401-412`; update `JOURNAL_WORK.controlPath` + call sites.
4. Typed unmatched fallback at `serve-built.mjs:679`: `{ code: "unmatched_e2e_route", method, path }`.
5. Verb-ownership census in `e2e-fixture-ownership.test.ts`: two lanes claiming one RPC verb without an explicit "first wins" declaration fails (generalise N5).
6. Concurrency counter-example test (see seams).
7. Table coverage: journals' missing states (empty population, pagination if applicable, stale/refused `list_entry_links` envelope face); `client-register-list.tsx` gets a `DataTableCard label`; new walk (or extend firm-navigation-walk) with population/filter/empty/isolation via a scoped table selector.
8. Evidence labelling: keep the header discipline; state in PR body.

## 4. TDD seams (red first)
1. `e2e-fixture-ownership.test.ts` — checkout lane records only a DISPATCHED verb (unrecognised `fn` leaves `state.doorCalls` `[]`).
2. Same file — journal-work control leg declines a foreign client via the QUERY STRING before opening the stream (`asyncIteratorCalls === 0`, N7 shape).
3. New `apps/web/e2e/mock-dispatch.test.ts` (register in `apps/web/test/manifest.txt`) — `readCachedJson` parses once; second call returns the identical object.
4. `e2e-fixture-ownership.test.ts` — two synthetic lanes claiming `list_entry_links` without a winner fails the census.
5. `e2e-fixture-ownership.test.ts` — concurrency counter-example: two concurrent calls under two identities against the shared `state` show the attributable leak (worker B's email visible in A's read).
6. `firm-navigation-walk.spec.ts` (or new spec) — Clients register is a named scoped table: population matches fixture rows, an unrelated firm's client never appears, empty firm shows a labelled empty state.

## 5. Risks
Fixing F-05 may reveal a masked ordering bug in checkout-gate-walk assertions — re-run the whole browser suite after the fix, not just touched specs. #706/#760 flakes are pre-existing; do not fold in.

## 6. Effort: M. Rig: Playwright + Chromium (installed), OpenSSL; no PG, no Workflow.
