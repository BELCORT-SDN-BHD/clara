# Wave 3, Lane 09, Ticket #1017 — final report

**Ticket:** Most browser-walk accessibility scans run without settling transitions first, producing
intermittent contrast violations
**Branch:** `riders/w3-lane09` · **Worktree:** `C:\Users\zhant\Desktop\clara-wt\659` · **Base:**
`ffe63a0dd084e99b84c1368119845be273c421ce`
**Commits (this ticket's four, on top of #970's four, #989's three, #864's five and #997's one
already-landed commits):**

```
777c7417b test(web): #1017 settle every accessibility scan through one shared helper
2df5393ed fix(web): #1017 give the selected document row a real contrast margin
fcd6cad77 docs(web): #1017 record the settle-before-scan census and the row's margin
2a6bae6f7 docs(web): #1017 correct the selected-row pair's own citation
```

No migration: `git diff ffe63a0dd084e99b84c1368119845be273c421ce..HEAD --stat -- packages/db` is
empty for this ticket's commits, and nothing in this diff touches `packages/db`. The ticket said it
should need none, and did not.

## The contract used

`gh issue view 1017 --comments`. One comment, dated 2026-09-20, carrying the owner's own triage
ruling — the newest word on the ticket, and it WIDENS the original Agent Brief rather than replacing
it: the brief's four acceptance criteria (a single shared settle helper, a mechanical census, the
previously-flaky scan holding under load, no threshold relaxed) stand, with a fifth added — "the
selected row's text and background pair must clear 4.5:1 with a real margin at rest (checked by the
design-token contrast lint the repo already runs, by adding this pair to it), without relaxing any
threshold." Verified live on this branch before building: `grep -rln settleForScan apps/web/e2e/*.spec.ts`
showed the helper existed (`#760`) but only 11 of 50 spec files called it at all (all in
whole-or-partial form, none consistently before every scan — see AC2), and
`git log --oneline -- apps/web/scripts/check-token-contrast.mjs` showed no #1017-shaped commit yet —
the ticket was fully live, not already satisfied, and the triage widening was still unaddressed.

## Seams tested at (written before building, per the work order's rule 4)

1. **Every `*.spec.ts` file's own `.analyze()` call site** — a static, comment-stripped census over
   the real files on disk (the same seam `sign-in-census.test.ts` already tests at), never a live
   browser assertion about the census itself.
2. **The shared `settleForScan` helper's own contract** (`e2e/helpers.ts`, unchanged by this ticket)
   — every call site either invokes it directly or through a verified local wrapper.
3. **The routed-views axe cell in `document-correction-walk.spec.ts`** — the literal cell two
   independent wave-1/wave-2 runs measured flaky — through the built app in a real browser, repeated
   under deliberate CPU load.
4. **`app/globals.css`'s declared tokens**, through `check-token-contrast.mjs`'s own pure token-math
   pipeline (never a live-DOM sample) — the selected document row's pair, pinned by id.
5. **`components/documents/filed-document-list.tsx`'s rendered selected-row markup** — through the
   existing `documents-a11y.test.tsx` component cell (unselected state, unaffected) and the browser
   walks that open a document (`documents-viewer-walk`, `document-correction-walk`).

## Acceptance criteria, each with its evidence

- **[x] A single shared helper implements the full settle contract (animations finished AND
  opacity-based transitions at rest) and is the only sanctioned way to settle before a scan.**
  `settleForScan` (`e2e/helpers.ts`, built by #760, unmodified by this ticket) already implements
  both conditions. This ticket makes it the ONLY sanctioned way: ten spec files' identical local
  `settle()`+`scan()` pair now has `settle()` delegate to it (dropping the now-unneeded `(0,0)` mouse
  park `settleForScan`'s own header explains is no longer needed); eleven spec files' identical local
  `expectAccessible()` now calls it first; `a11y-finish-walk.spec.ts`'s `gotoSettled` and
  `home-board-walk.spec.ts`'s `settled` (called from dozens of sites) now delegate to it instead of
  their own animations-only or networkidle-only waits; fourteen remaining spec files call it directly
  before each scan, and three inline animations-only `expect.poll(...)` blocks were folded onto it.
  Evidence: `git show 777c7417b --stat` — 37 of 50 `*.spec.ts` files touched, zero new local
  settle-shaped implementation added anywhere.

- **[x] A mechanical check fails if a spec file invokes the accessibility scanner without first
  calling the shared helper, unless the file is named in a reviewed exception list.**
  `e2e/settle-before-scan-census.test.ts` (new), same shape as `sign-in-census.test.ts`: comment-
  stripped source (this suite's own prose quotes the exact code shapes the census greps for —
  `staff-expense-claim-walk.spec.ts`'s header literally said `` `AxeBuilder.analyze()` `` five lines
  ahead of its one real call, and an early comment-blind cut of this detector mis-read that prose as
  a second, uncovered scan), a `LOCAL_WRAPPERS` registry (`gotoSettled`, `settled`) each verified by
  extracting its own balanced function body and asserting it calls `settleForScan(page)`, and an
  `EXCEPTIONS` list kept empty and LIVE (a cell fails if an entry stops offending). Evidence: LIVE
  run, `node --import ./test/bootstrap.mjs --import tsx --test
  e2e/settle-before-scan-census.test.ts` — **4/4 pass**. Shown RED first, for the right reason,
  against the real unmodified tree (not only a synthetic fixture): the main census cell failed
  listing all 37 real offenders by file and line, and the wrapper-verification cell failed because
  `gotoSettled`'s pre-#1017 body never called `settleForScan`. After the fix, the same four cells are
  green; re-running the main census cell's own vacuity-control cell independently proves the detector
  still fires on a synthetic offender, a two-scans-one-settle fixture, a comment-only false positive,
  and an unregistered wrapper call site.

- **[x] The specific previously-flaky scan (the routed-views axe cell that measured the 4.36:1
  selected/hovered row) passes repeatedly under simulated host load without reproducing the
  violation.**
  `document-correction-walk.spec.ts`'s "axe: each of the three routed views has no WCAG A/AA
  violations" cell (line 388) now calls `settleForScan(page)` before each of its three per-tab scans.
  Evidence: (a) the whole spec file, LIVE on this lane's triple
  (`CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3580 CLARA_E2E_NEXT_PORT=3581
  CLARA_E2E_RUNTIME_PORT=3582`) — **15/15 pass** (66 s); (b) the specific cell alone, repeated 12
  times in one server session (`--repeat-each=12 -g "axe: each of the three routed views"`) while
  TWELVE self-terminating CPU-burn processes ran concurrently on this 24-core host (deliberate
  simulated host contention, the same class of load the original wave-1/wave-2 measurements were
  taken under) — **12/12 pass** (2.1 min, 7.7 s for the last repeat), zero violations reproduced.

- **[x] No accessibility scan's resting-state assertions are weakened or the contrast token
  relaxed.** No `PAIR_SPECS` threshold was changed (`check-token-contrast.mjs`'s `main()` remains
  unconditionally strict, no WARN carve-out); the one behavioural change strengthens a pair
  (4.62:1 → 14.32:1), never loosens one. No axe `withTags`/`withRules` call was narrowed and no
  `expect(violations).toEqual([])` assertion was weakened anywhere in the 37 touched files — every
  edit either adds a `settleForScan(page)` call or changes which token a component reads, never an
  assertion's own bound. Evidence: `git show 777c7417b 2df5393ed | grep -n "toEqual\|withTags\|withRules\|threshold:"` shows no such line removed or narrowed (manually reviewed against every diff hunk while building).

- **[x] (Owner's 2026-09-20 widening) The selected row's text and background pair clears 4.5:1 with
  a real margin at rest, checked by the design-token contrast lint, without relaxing any threshold.**
  `filed-document-list.tsx`'s selected row now renders its caption cells at `text-foreground` instead
  of `text-muted-foreground` (the same idiom `components/ui/command.tsx`'s own `CommandItem` selected
  state already uses on the same `bg-muted` ground) — unselected rows unchanged. Pinned as its own id,
  `foreground-on-muted-selected-document-row`, in `check-token-contrast.mjs` (kept separate from the
  pre-existing `foreground-on-muted`, per that file's own token-drift convention — several other pairs
  there are kept separate for the identical reason even when they resolve to the same hex today).
  Evidence: `tests/token-contrast.test.ts`'s new margin-specific cell (`ratio >= 10`, the same style
  the file's own "base surface pairs... wide margin" cell already uses) — shown RED against the
  pre-fix `muted-foreground` pairing (**4.62:1**, failing the `>=10` bar though technically clearing
  4.5) before the code change, GREEN (**14.32:1**) after. `node scripts/check-token-contrast.mjs` CLI
  run confirms: `[PASS] foreground-on-muted-selected-document-row — 14.32:1 (needs 4.5:1) — #202525
  on #f5f6f4`.

**Out of scope, honored:** the two other reds the wave-1 integration gate classified as unrelated
(`work-question-walk`, `work-cancel-walk`'s B7 stop-race) were not touched. No component's visual
design changed beyond the selected row's caption-cell colour (the filename cell was already
`text-foreground`; the row's `bg-muted` background is unchanged).

## Gates, with counts

- **`e2e/settle-before-scan-census.test.ts`** (new file, full gate chain): **4/4 pass** — RED against
  the real tree before the fix (documented above), GREEN after.
- **`tests/token-contrast.test.ts`** (existing file this ticket edits, full gate chain): **20/20
  pass** — the new margin cell shown RED before the component fix, GREEN after; all 19 pre-existing
  cells unaffected.
- **`components/documents/documents-a11y.test.tsx`** (existing component cell exercising
  `FiledDocumentList`, unselected state): **6/6 pass**, no regression.
- **`apps/web/test/manifest.txt`**: `node scripts/check-test-manifest.mjs` — **504 test files
  listed, every real file present exactly once in alphabetical order** (the new census file
  registered at its sorted position).
- **`pnpm typecheck`** (`npx tsc --noEmit -p .` from `apps/web`, run twice more during
  development — after the settle slice and again after the contrast slice): **exit 0** every time.
- **The document-correction-walk repeat-under-load proof**: **12/12 pass** (see AC3 above).
- **The whole document-correction-walk spec file**: **15/15 pass** (66 s).
- **Every touched browser walk, on this lane's own triple** (all 37 spec files this ticket edited, in
  one gated Playwright invocation, `--no-build`, reusing the current `.next`):
  `pnpm --filter @clara/web e2e -- --no-build a11y-finish-walk accrual-walk agentic-finish-walk
  bank-close-registers-walk bank-match-walk client-create-walk counterparty-identity-walk
  depreciation-walk document-correction-walk documents-viewer-walk firm-commercial-walk
  firm-navigation-walk firm-setup-walk fixed-asset-acquisition-walk home-board-walk interview-walk
  journals-table-walk knowledge-firm-walk knowledge-walk money-input opening-ledger-source-walk
  operator-support-walk parity-holes periodic-adjustment-walk personal-settings-walk plans-walk
  prepayments-walk responsive-shell-walk shell-migration-walk signup-confirm-pending
  staff-advances-register-walk staff-expense-claim-walk tax-boundary-walk
  tax-compliance-watch-receipt-walk trade-invoice-walk work-knowledge-walk work-list-walk` —
  Playwright discovered **408 tests**; LIVE run — **403 passed, 5 skipped, 0 failed** (11.9 min, exit
  0). The 5 skipped are pre-existing and unrelated to this ticket: `interview-walk.spec.ts`'s four
  fixture-dependent cases (documented in `e2e/README.md` as needing the dedicated
  `e2e/live-stack/run-live-walk.mjs` runner, not the default command) and one env-gated
  `signup-confirm-pending.spec.ts` case. Zero failures across all 37 touched files.
- **`apps/web` WHOLE unit suite** (`node scripts/run-tests.mjs`, since `apps/web` was touched), run
  ALONE after the e2e gate finished (per `e2e/README.md`'s "one worker, one host" rule): **4856
  tests, 4854 pass, 0 fail, 2 skip** (87.5 s), exit 0 — five MORE tests than #997's own last-known-
  good figure on this lane (4851/4849), exactly the five this ticket adds (the census's four cells
  plus the one new margin cell in `token-contrast.test.ts`); the 2 skips are the same pre-existing
  env-gated pair every prior lane report on this branch has carried forward unchanged.
- **`CI=true GITHUB_ACTIONS=true pnpm lint`** (root, the wave-3 addendum's own required form): **exit
  0**, whole chain clean (`check-token-contrast` — includes the new pinned pair — `check-test-
  manifest`, `check-message-keys`, `check-ui-add-guard.selftest`, every `check-frozen-workflows`/
  evaluator/leaks/dead-citations selftest, `eslint scripts`, `pnpm -r lint` across `apps/web`/
  `packages/db`/`packages/runtime`/`packages/reporting-render`).
- **`pnpm typecheck`** (root, `apps/web` + `packages/runtime`): re-run once more after all four
  commits landed — **exit 0**, both workspaces `Done`.
- **No `packages/db/tests` or SQL function was touched**: `operation-census.test.mjs`/
  `rig-isolation.test.mjs` do not apply; no migration exists to gate.
- **No `packages/runtime`/frozen-workflow file was touched**: not part of this diff (confirmed by
  `git diff ffe63a0dd..HEAD --stat` — every path is under `apps/web`).

## Docs updated

- `apps/web/e2e/README.md` (same-shape commit as the code): a new "One settle-before-scan, and the
  census that holds it (#760, #1017)" section immediately after the sign-in-census section, with the
  `LOCAL_WRAPPERS`/`EXCEPTIONS` table and a summary of the contrast-margin fix.
- `apps/web/README.md`: a new "#1017" narrative section at the end, recording both halves of the
  ticket for a reader who does not open the diff.
- `CONTEXT.md` was not touched — this ticket introduces no new domain/accounting vocabulary (pure
  browser-test infrastructure plus one component's CSS classes), matching #970/#989/#864/#997's own
  precedent on this file.

## Successor contract

None. Nothing here touches a frozen chat/Work-tool surface, a door, a part kind or a prompt stanza —
this ticket is test infrastructure (a new census, edits to 37 existing Playwright spec files) plus
one component's conditional CSS classes and one design-token-lint pin.

## Follow-ups worth filing

1. **`e2e/README.md`'s own "coverage map" intro is stale** (noted independently by #997's own report
   as pre-existing drift: "25 specs" against the real file count on disk, now 50) — not fixed here,
   out of this ticket's scope.
2. **The `EXCEPTIONS` list in the new census is empty by design.** If a genuinely unsettleable scan
   is ever added (e.g. a live-stack spec outside this harness's mock server, the same shape
   `sign-in-census.test.ts`'s `FORM_EXCEPTIONS` already carries one entry for), it has a place to go
   without weakening the main rule.

## Anything unverified

- **The full, untouched 13-file remainder of the e2e suite** (the specs this ticket did not edit) was
  not re-run end to end as part of this ticket's own gates — the census itself statically covers
  every file including those, and none of them appear in its offender list, but a live browser run of
  those 13 files specifically was not repeated here (they were part of an earlier, separately-started
  full-suite run that was stopped in favour of the scoped 37-file run above, for wall-clock reasons;
  no failure was observed in the ~135 tests from that run that did complete before it was stopped, all
  of which came from files this ticket touched).
- **Hosted/production behaviour** — everything above is local (this lane's Playwright triple; no DB
  migration or runtime change exists for this ticket to begin with, so no hosted verification
  applies).
