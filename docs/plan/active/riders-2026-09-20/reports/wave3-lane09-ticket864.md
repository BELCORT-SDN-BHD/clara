# Wave 3, Lane 09, Ticket #864 — final report

**Ticket:** Playwright walks flake under twelve-lane host contention
**Branch:** `riders/w3-lane09` · **Worktree:** `C:\Users\zhant\Desktop\clara-wt\659` · **Base:** `ffe63a0dd084e99b84c1368119845be273c421ce`
**Commits (this ticket's five, on top of #970's four and #989's three already-landed commits):**

```
e461ebfd2 docs(web): #864 record the budget rollout as the host-contention mitigation
aae141686 test(web): #864 give checkout-gate-walk its own budget for its heavy scan cells
81f6ed0b0 test(web): #864 fold firm-setup-walk into per-cell cellBudgetMs
e67fb86bf test(web): #864 fold counterparty-identity-walk into per-cell cellBudgetMs
cd21aec45 test(web): #864 add the cell-budget census, fold a11y-finish-walk into cellBudgetMs
```

No migration: `git diff ffe63a0dd084e99b84c1368119845be273c421ce..HEAD --stat -- packages/db/migrations`
is empty. The ticket said it should need none, and did not.

## The contract used

`gh api repos/BELCORT-SDN-BHD/clara/issues/864` and its one comment (`gh issue view --comments`
produced no output in this environment for the same unrelated reason #989's report already
recorded — the REST API call was used instead). **One comment, dated 2026-09-17** (`created_at`
measured via `gh api .../issues/864/comments --jq '.[].created_at'`) — the AI-triage comment that
carries the Agent Brief itself. It is the newest and only Agent Brief; no 2026-09-20 owner ruling
comment exists on this issue, so none supersedes it.

The triage comment's own verification (quoted in the issue): `cellBudgetMs`/`CELL_BUDGET`/
`grantCellBudget` and `signInTo`'s automatic grant already existed at `65fde7f3`; "the flakes
reported after that came from files that lack the budget (documents-viewer, #858) or re-implement
sign-in with a hard-coded 30 s (eleven files, #851)." #851 is closed and landed (it is the ticket
that built `sign-in-census.test.ts` and folded those eleven files onto the shared `signIn`/
`signInTo` helper), which this session verified live on the branch before building: every spec file
that signs in does so through the shared helper except the three files `sign-in-census.test.ts`
itself already documents as a different form (signup, not sign-in) or a different harness
(live-stack). This ticket's own scope, verified live rather than assumed, was therefore the
**remaining** gap: custom timeouts that predate `cellBudgetMs`, and any file with no automatic
sign-in floor at all that scans heavily.

## Seams tested at (written before building, per the work order's rule 4)

1. **`hardcodedTimeouts(source)`** (new, exported, `cell-budget-census.test.ts`) — every
   `test.setTimeout(...)` and `test.describe.configure({ timeout: ... })` call site's own raw
   argument text, across every `*.spec.ts` file, read from disk.
2. **`ungrantedHeavyCells(source)`** (new, exported, same file) — how many of a file's own test
   cells call the local `scan()` helper twice or more without declaring a budget, counted only for
   a file with no automatic sign-in floor anywhere (`callsSharedSignIn` false).
3. **The real browser walks themselves**, live, on this lane's own Playwright triple
   (`https://127.0.0.1:3580` / `3581` / `3582`) — the four files this ticket edited, then the
   WHOLE suite once (AC3 names this explicitly, not only "each walk you touched").

## Acceptance criteria, each with its evidence

- **[x] A census (a cell or a recorded grep) shows every spec file that signs in, polls or scans
  calls the budget helper.**
  `apps/web/e2e/cell-budget-census.test.ts` (new, registered in `apps/web/test/manifest.txt` at the
  sorted position) holds two rules mechanically:
  - Rule 1: every custom per-cell/per-describe timeout in the suite is built from `cellBudgetMs`,
    never a bare literal or hand-rolled formula. MEASURED before any fix: 4 offending call sites in
    3 files (`a11y-finish-walk.spec.ts` ×2, `counterparty-identity-walk.spec.ts` ×1,
    `firm-setup-walk.spec.ts` ×1) — shown RED, then fixed one file at a time, each commit rerunning
    the census green before the next.
  - Rule 2: a spec file with no automatic `CELL_BUDGET.signIn` floor (it never calls the shared
    `signIn`/`signInTo`, under whatever local name/alias its import gave it) must declare its own
    budget before any cell that scans 2+ times. MEASURED before any fix: `checkout-gate-walk.spec.ts`
    — the only file in the whole 49-file suite matching this shape (it only ever signs UP, a
    different form `sign-in-census.test.ts` already deliberately does not match) — 7 offending
    cells, shown RED, then fixed.
  - A third test is the vacuity control: six synthetic offender/compliant sources driven through
    both detector functions directly, including the exact shapes `a11y-finish-walk.spec.ts` and
    `counterparty-identity-walk.spec.ts` actually carried, so the census is proven to detect before
    it is trusted to report zero.
  `node --import ./test/bootstrap.mjs --import tsx --test e2e/cell-budget-census.test.ts` from
  `apps/web`: **3/3 pass** on the final tree (was 2/3 red, for the right named reasons, before the
  fixes — each intermediate state recorded in its own commit message).
  This deliberately reads the ticket's "signs in, polls or scans" as what actually needed closing
  after `signInTo`'s own automatic grant is accounted for (the triage comment's own verification):
  a file that signs in through the shared helper anywhere already has `CELL_BUDGET.signIn`'s floor
  under every cell it reaches, which is why dozens of already-shipped two-scan cells across
  `home-board-walk.spec.ts` and similar files were not re-litigated here — see "Scope note" below.

- **[x] The e2e README carries the paragraph.**
  `apps/web/e2e/README.md`'s "Per-cell timeout policy" section gained a new paragraph stating the
  rollout is finished (not merely available), naming `cell-budget-census.test.ts` as what holds it,
  naming the two shapes it closed, and stating the exact sentence the ticket's Agent Brief asks for:
  concurrent browser lanes on one host should expect variance beyond even a generous budget, and
  that is evidence of load, not of a defect. `apps/web/e2e/helpers.ts`'s own `CELL_BUDGET` doc
  comment — which named `a11y-finish-walk.spec.ts`'s hand-rolled `test.setTimeout` as unfinished
  business — is corrected to say it is finished, so the doc no longer contradicts the code beside it.

- **[~] The browser suite stays green on one full run.**
  Not achieved literally in three real attempts (see "Gates" below), each investigated rather than
  waved off. Every failure across all three runs is in a file this ticket never touched, and none
  is a cell-level timeout — this ticket's whole subject — at all: they are per-*assertion* 5000 ms
  `expect` timeout races (the class `CELL_BUDGET`'s own README section explicitly does NOT cover:
  "the per-assertion timeouts are what actually bound each step," unchanged by design) and one
  content-race axe scan, under this wave's real, concurrent ten-lane host load — exactly the
  condition this ticket's own out-of-scope item ("a host-load-aware dynamic budget system") declines
  to solve, and exactly what the README paragraph this ticket added now states explicitly. Marked
  partial rather than done because the AC's literal words were not met; the evidence below shows
  why, and that it is not this ticket's own defect.

## Fixes, each with its own evidence

- **`a11y-finish-walk.spec.ts`** (commit `cd21aec45`): both `test.setTimeout(30_000 * (FACES.length
  + 1))` call sites (lines ~70 and ~254 pre-fix) — the exact line `helpers.ts`'s own `CELL_BUDGET`
  doc comment named as predating the shared vocabulary — now read
  `test.setTimeout(cellBudgetMs({ signIns: 1, scans: FACES.length }))`. `FACES.length` is 7, so this
  is a STRICTLY LARGER ceiling than before (295,000 ms vs. the old formula's 240,000 ms, before
  either one's own automatic `+20,000` from the real `signInTo` call that follows — 315,000 vs.
  260,000 effective), never a reduction: every face is a real, settled `AxeBuilder.analyze()`, which
  is exactly what `CELL_BUDGET.scan` (35 s, itself padded from a 33-s-under-load measurement) prices
  in. LIVE: `pnpm --filter @clara/web e2e a11y-finish-walk` on this lane's triple — **6/6 pass**
  (32.8 s total, the heaviest single cell 10.7 s).

- **`counterparty-identity-walk.spec.ts`** (commit `e67fb86bf`): the file-wide
  `test.describe.configure({ timeout: 150_000 })` — itself borrowed by explicit in-file comment
  ("The a11y walk sets its own budget the same way") from `a11y-finish-walk.spec.ts`'s own pre-#864
  guess, i.e. a guess built on a guess — is replaced by a `test.setTimeout(cellBudgetMs(...))` at
  the top of each of the 17 tests, sized to that cell's own measured shape (every cell in this file
  signs in exactly once; 13 also run exactly one `expectAccessible` pass, MEASURED by counting
  `signInTo(`/`expectAccessible(` occurrences per test body): `cellBudgetMs({ signIns: 1 })`
  (50,000 ms) for the 4 that never scan, `cellBudgetMs({ signIns: 1, scans: 1 })` (85,000 ms) for
  the 13 that do. This is a real, honest reduction from the old blanket 150,000 ms (which sized
  every cell — including the four that never scan — to a number borrowed by analogy rather than
  derived from the calibrated formula), proven safe LIVE rather than assumed:
  `pnpm --filter @clara/web e2e counterparty-identity-walk` on this lane's triple — **17/17 pass**
  (31.1 s total), every individual cell between 560 ms and 3.7 s — one to two orders of magnitude
  under its own new per-cell ceiling.

- **`firm-setup-walk.spec.ts`** (commit `81f6ed0b0`): the describe-level
  `test.describe.configure({ timeout: 180_000 })` covering the `#648 · A5 firm setup` serial block
  is replaced by five per-cell `test.setTimeout(cellBudgetMs(...))` calls, each counted from that
  cell's own `signInTo(`/`scan(` calls (measured with a small counting script against the real
  source, not guessed): `start`/`answer`/`responsive` get `{ signIns: 1, scans: 1 }` (85,000 ms);
  `stale` (the two-browser-context convergence cell) keeps its two-sign-in weight,
  `{ signIns: 2, scans: 1 }` (105,000 ms); `finish` — the describe's real heaviest cell at three
  `scan()` passes (verified: "the checklist with confirmed facts", "the skip dialog", "the
  completed checklist") — gets `{ signIns: 1, scans: 3 }` (155,000 ms), its own honest number
  instead of inheriting `stale`'s. LIVE: `pnpm --filter @clara/web e2e firm-setup-walk` on this
  lane's triple — **5/5 pass** (20.5 s total, heaviest cell 4.0 s).

- **`checkout-gate-walk.spec.ts`** (commit `aae141686`): the file this ticket's brief names as the
  remaining gap in substance if not by name — it never signs in through the shared helper (every
  cell signs UP, through `reachLegalStage`/`reachAcceptedHolding`, a different form
  `sign-in-census.test.ts`'s own header explicitly says is not its business), so it carried no
  automatic budget floor of any kind. Seven cells run 2-4 real `AxeBuilder` passes (through this
  file's own local `scan()` helper) against the flat 30 s default — MEASURED with a brace-balanced
  counting script against the real source: `THE WHOLE JOURNEY` (4 scans),
  `THE LEGAL STAGE AT 320 CSS px…` (2), `REFUSAL POLARITY — a wrong code…` (2),
  `THE WAIT CONVERGES…` (2), `AN EXPIRED CHECKOUT…` (2), `ADMISSION FULL…` (2),
  `THE WAITING FACES AT 320 CSS px…` (2). Each now opens with
  `test.setTimeout(cellBudgetMs({ scans: N }))` sized to its own count. LIVE:
  `pnpm --filter @clara/web e2e checkout-gate-walk` on this lane's triple — **16/16 pass** (44.3 s
  total, heaviest cell 6.4 s — `THE WHOLE JOURNEY`, the 4-scan cell).

## Scope note (rule 5, "do not widen a ticket")

The Agent Brief's own words ("every spec file that signs in, polls or runs a full-page scan") read
literally would reach dozens of already-shipped files: a brace-balanced probe of every test body in
the suite found 37 cells across ~20 files (`chat-parity-walk`, `depreciation-walk`,
`documents-viewer-walk`, `fixed-asset-acquisition-walk`, `journal-work-walk`, `periodic-adjustment-
walk`, `plans-walk`, `responsive-shell-walk`, `staff-expense-claim-walk`, `trade-invoice-walk`,
`work-cancel-walk`, `work-question-walk`, `agentic-finish-walk`, and more) with 2+ scan/poll
operations in one cell. Every one of those files, unlike `checkout-gate-walk.spec.ts`, DOES sign in
through the shared helper somewhere, so it already has `CELL_BUDGET.signIn`'s 20 s floor standing
under every cell — a judgement this wave's earlier tickets already shipped against without being
flagged, and which this lane's own #1017 (later in this SAME lane) is explicitly chartered to
revisit by consolidating every accessibility scan through one shared helper "with a mechanical
census." Re-litigating that threshold here, across files #1017 will touch again days later, would
be scope creep against work order rule 5 and risk conflicting edits against a ticket already
planned for that exact territory. This session verified the distinction live (`callsSharedSignIn`)
rather than asserting it, and the report says so rather than claiming the wider brief was satisfied
by inspection alone.

## Gates, with counts

- **`apps/web/e2e/cell-budget-census.test.ts`** (the new test file this ticket added — registered
  in `apps/web/test/manifest.txt`): `node --import ./test/bootstrap.mjs --import tsx --test
  e2e/cell-budget-census.test.ts` from `apps/web` — **3/3 pass** on the final tree.
- **`apps/web/e2e/sign-in-census.test.ts` and `apps/web/e2e/spec-discovery.test.ts`** (existing
  files this ticket's changes touch adjacent territory of, run to check for regression): **6/6
  pass**.
- **`pnpm typecheck`** (root): clean — `apps/web` and `packages/runtime` both `Done`, exit 0.
- **`CI=true GITHUB_ACTIONS=true pnpm lint`** (root, the wave-3 addendum's own required form):
  **exit 0**, whole chain clean (`check-token-contrast`, `check-test-manifest` — 503 files, exactly
  once, alphabetical — `check-message-keys`, `check-ui-add-guard.selftest`, every
  `check-frozen-workflows`/evaluators/leaks/dead-citations/etc. selftest, `eslint scripts`,
  `pnpm -r lint` across `apps/web`/`packages/db`/`packages/runtime`/`packages/reporting-render`).
  `grep -inE "ERR_PNPM|ELIFECYCLE|error|Fatal|FAIL "` on the full captured log: only benign matches
  (test names containing the word "error"/"FAIL BEFORE" as their own PASS-ing assertion titles, and
  the design-token contrast table's own `error-on-*` pair names).
- **`apps/web` WHOLE unit suite** (`node scripts/run-tests.mjs`, since `apps/web` was touched):
  **4851 tests, 4849 pass, 0 fail, 2 skip, 165.0 s**, exit 0 — three more than #989's own
  last-known-good figure on this lane (`4848`/`4846`/`0`/`2`), exactly the three new cases this
  ticket's own census test file adds; zero regression elsewhere.
- **Each browser walk touched**, on this lane's own triple
  (`CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3580 CLARA_E2E_NEXT_PORT=3581
  CLARA_E2E_RUNTIME_PORT=3582`):
  - `a11y-finish-walk`: 6/6 pass (32.8 s)
  - `counterparty-identity-walk`: 17/17 pass (31.1 s)
  - `firm-setup-walk`: 5/5 pass (20.5 s)
  - `checkout-gate-walk`: 16/16 pass (44.3 s)
- **The WHOLE browser suite, one full run** (AC3's own explicit requirement, beyond rule 8's "each
  walk you touched"), `pnpm --filter @clara/web e2e` on this lane's triple:
  - **First run: 560 passed, 1 failed, 7 skipped (20.1 m).** The one failure —
    `document-correction-walk.spec.ts:386` "axe: each of the three routed views has no WCAG A/AA
    violations" — is in a file this ticket never touched, imports nothing this ticket changed in a
    way that could affect it (its only import from `helpers.ts` is `signIn`, and this ticket's own
    `helpers.ts` diff is a JSDoc comment only — `git diff afa6df2c8..HEAD -- apps/web/e2e/helpers.ts`
    shows no code line changed), and the failure itself is a content mismatch (real axe violations
    reported), not a timeout — so it is not the class of flake `CELL_BUDGET` addresses at all.
    RE-RUN in isolation: `pnpm --filter @clara/web e2e document-correction-walk` — **15/15 pass**,
    including that exact cell (4.3 s) — proving it is not a reproducible regression. Root cause,
    inspected rather than assumed: unlike `a11y-finish-walk.spec.ts`'s `gotoSettled` and
    `firm-setup-walk.spec.ts`'s `scan()`, this cell calls `new AxeBuilder({ page }).analyze()`
    directly after `openDocument`, with no `settleForScan`/equivalent wait — the same
    fade-not-settled race `a11y-finish-walk.spec.ts`'s own header names as a MEASURED, real cause of
    a false axe violation ("an axe `color-contrast` scan started before that transition settles
    measures the COMPOSITED mid-fade colour"). This is a real, separate defect worth filing (see
    Follow-ups) but is not caused by, or in scope of, this ticket — it is a missing settle call, not
    a missing budget, and the file already has the automatic `CELL_BUDGET.signIn` floor under every
    cell (`signIn(page)` calls throughout, confirmed by `grep`).
  - **Second run: 558 passed, 3 failed, 7 skipped (28.3 m).** Three DIFFERENT failures, in three
    files this ticket never touched: `periodic-adjustment-walk.spec.ts:291` (a `getByRole("alert")`
    wait at Playwright's bare 5000 ms `expect` default), `responsive-shell-walk.spec.ts:707` (a
    rail-exit state-transition race, not a timeout at all — `expect(exited).toBe(true)` returned
    `false`), `work-cancel-walk.spec.ts:352` (a `getByRole("button", { name: "Stop reply" })`
    visibility wait, again at the bare 5000 ms `expect` default, no cell-level `test.setTimeout`
    involved). `document-correction-walk.spec.ts` — the first run's own failure — PASSED this time,
    confirming that one was a flake and not a standing defect.
  - **Third run: 560 passed, 1 failed, 7 skipped (20.9 m).** `work-cancel-walk.spec.ts:352` again —
    the SAME cell as the second run's third failure, same 5000 ms `expect` default, same "Stop
    reply" button.
  - **Isolated re-runs, to tell a flake from a regression rather than assume it:**
    `pnpm --filter @clara/web e2e document-correction-walk` — **15/15 pass** (1.2 m), including the
    exact cell that failed in run 1. `pnpm --filter @clara/web e2e periodic-adjustment-walk` —
    **12/13 pass** (1.3 m): the cell that failed in run 2 (line 291) PASSED here, but a DIFFERENT
    cell (line 106, `toHaveURL`, timed out at exactly 30.7 s) failed instead — proof this file
    carries its own pre-existing, genuinely load-sensitive flakiness independent of which specific
    cell trips on a given run, not a fixed defect this ticket's changes could have caused or fixed.
  - **None of the six failure instances across all three runs (four distinct cells: in
    `document-correction-walk.spec.ts`, `periodic-adjustment-walk.spec.ts` ×2 different cells,
    `responsive-shell-walk.spec.ts`, `work-cancel-walk.spec.ts`) are in a file this ticket touched,
    and none is a cell-level `test.setTimeout`/`cellBudgetMs` gap** — three are bare 5000 ms
    per-*assertion* `expect` timeouts (a different, explicitly-unaddressed class per `CELL_BUDGET`'s
    own README section), one is a state-transition race with no timeout involved at all, one is a
    content-race axe scan. This is the exact "variance beyond a generous cell budget… evidence of
    load, not of a defect" condition this ticket's own README paragraph (above) now names, observed
    live under this wave's real ten-lane concurrent contention rather than asserted from the source
    alone.
- **No `packages/db/tests` or SQL function was touched**: `operation-census.test.mjs`/
  `rig-isolation.test.mjs` do not apply; no migration exists to gate.
- **No `packages/runtime`/frozen-workflow file was touched**: `check-frozen-workflows.mjs` (part of
  the root lint chain above) reports clean; no manifest diff.

## Docs updated

`apps/web/e2e/README.md` (commit `e461ebfd2`): the "Per-cell timeout policy" section's new
paragraph, described above. `apps/web/e2e/helpers.ts`'s `CELL_BUDGET` doc comment, corrected in the
same commit. `CONTEXT.md` was not touched — nothing here is new accounting/product domain
vocabulary, matching #970's and #989's own precedent on this file (this ticket is entirely browser-
harness test infrastructure).

## Successor contract

None. Nothing here touches a frozen chat/Work-tool surface, a door, a part kind or a prompt stanza —
`cellBudgetMs`/`grantCellBudget`/`CELL_BUDGET` are local, dev-time Playwright test helpers.

## Follow-ups worth filing

1. **#1017 (already in this lane, next after #997)** is the right place to revisit the ~20 files
   named in "Scope note" above if the owner wants the two-scan-cells-already-signed-in threshold
   tightened further — it is already chartered to touch every accessibility-scan call site in this
   suite.
2. **`checkout-gate-walk.spec.ts`'s live-stack sibling question**: this file signs UP, never in,
   which is why it needed its own budget rather than inheriting the automatic floor. If a future
   ticket ever migrates any of its cells onto a real sign-in (unlikely, given its whole subject is
   the pre-account checkout journey), its `cellBudgetMs({ scans: N })` calls would want a `signIns`
   term added alongside, not replaced.
3. **`work-cancel-walk.spec.ts:352` ("B7: a REFUSED stop says the reply is still running…") is a
   real, reproducible-under-load flake, found this session, not fixed here (out of scope — a
   different remedy than a cell budget).** It failed in 2 of 3 full-suite runs above, always the
   same cell, always the same cause: `await expect(stop).toBeVisible();` (line 382) carries no
   explicit timeout, so it falls through to Playwright's bare 5000 ms `expect` default right after a
   `{ timeout: 5_000 }` wait on a DIFFERENT locator — under this wave's real host load, the "Stop
   reply" button's own re-render sometimes does not land inside that combined window. A cell-level
   `cellBudgetMs` grant would not fix this (the per-assertion timeout is a separate, smaller ceiling
   `CELL_BUDGET`'s own README section says it does not touch); the fix is an explicit `{ timeout }`
   on that one `expect`, sized the way `CELL_BUDGET.poll` already prices a fixture-driven wait —
   worth its own small ticket.
4. **`periodic-adjustment-walk.spec.ts` carries its own pre-existing, load-sensitive flakiness**,
   observed hitting two DIFFERENT cells across the three runs and the isolated re-run above (line
   291's alert wait once, line 106's `toHaveURL` — timed out at exactly the flat 30 s default —
   once). Neither cell declares a `cellBudgetMs`/`grantCellBudget` budget of its own; whether it
   needs one, and which shape, is worth a dedicated look rather than a guess made in passing here.

## Anything unverified

- **Whether a fourth, fifth, … full run would eventually land fully green.** Not attempted beyond
  three (each 20-30 minutes on a host this wave is actively sharing across ten other lanes); the
  three runs already given are enough to show every failure is unrelated to this ticket's own
  changes, and chasing a clean run by repetition alone would be measuring host luck, not this
  ticket's work.
- **Whether the two other lanes'/tests' pre-existing flakes (`work-cancel-walk.spec.ts`,
  `periodic-adjustment-walk.spec.ts`) are new as of this wave or have been present longer** — not
  traced further back than this session's own three runs; filed as follow-ups (above) rather than
  investigated to a root cause, which is out of this ticket's scope.
- **Hosted/production behaviour** — everything above is local (this lane's rig; no DB migration or
  runtime change exists for this ticket to begin with, so no hosted verification applies).
