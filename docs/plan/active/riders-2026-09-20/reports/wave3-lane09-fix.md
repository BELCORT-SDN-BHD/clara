# Wave 3, Lane 09 — review fix round

**Branch:** `riders/w3-lane09` · **Worktree:** `C:\Users\zhant\Desktop\clara-wt\659`
**Base:** `ffe63a0dd084e99b84c1368119845be273c421ce` · **Reviewed head:** `2a6bae6f7`
**New head:** `bd6a8de4a`
**Tickets in the lane:** #970, #989, #864, #997, #1017 · **Lane database:** `clara_l09` (127.0.0.1:55749)
**No migration in this lane:** `git diff <base>..HEAD --stat -- packages/db` is empty, so the redo
path, the prestate re-measure and `apps/web/tests/firm-scope-db-pins.corpus.ts` do not apply.

## Commits added by this round

```
c90b8b4dc test(web): #864 fix round — the shared settle grants the scan budget for every file
fcbce6a53 test(web): #864 fix round — the scan rule is per cell, per file, and follows the call
bf89cbfd9 test(web): #864 fix round — the third verb: a cell states the waits that can eat its base
fcca6813b docs(web): #864 fix round — the README says what the census actually holds
1ab01e8cc test(web): #1017 fix round — the selected row's guard is a cell that can see the component
18828425f fix(web): #989 fix round — the protected file's restore runs on every exit path
307eadfff feat(web): #989 fix round — vendor the Popover files the acceptance criterion asks for
eccc02578 fix(web): #989 fix round — the vendored Popover gets the popup motion-safe re-cut
5e5577417 test(web): #1017 fix round — a cell boundary spends the settle that was left
68d773f23 refactor(web): #864 fix round — name the two budget shapes the census reads
3e6fb2152 docs(web): #1017 fix round — the settle census header matches the rule it now holds
bd6a8de4a test(web): #864 fix round — the scan count-control states the number it measured
```

## Findings, one by one

### SPEC-864-A — major — the rule-2 detector matched only the literal `scan(` · FIXED

**Reproduced first.** Driving the shipped `ungrantedHeavyCells` over the 50 spec files reported 0
offenders while `signup-confirm-pending.spec.ts` ran three cells with 2+ real axe passes through a
local helper named `expectAccessible(`, with no shared sign-in and no budget anywhere. Eleven
files in this suite name their scan wrapper `expectAccessible(` (nineteen name it `scan(`); the
detector could see none of the eleven.

**Fixed by replacing the token with the call graph.** `e2e/cell-budget-census.test.ts`'s rule now
resolves a cell's scans by FOLLOWING calls to the real scanner — `.analyze(` — through whatever the
file calls its own wrapper, transitively, once per call site; the same walk counts the settles and
sign-ins the cell reaches. Nothing in the rule mentions a helper name any more.

**And the false claim it produced is corrected.** `apps/web/e2e/README.md` (commit `fcca6813b`) no
longer says `checkout-gate-walk.spec.ts` "was the one file with that shape"; it states the four
rules the census really holds and records what the first cut missed and why. I did not edit
`reports/wave3-lane09-ticket864.md` — the work order lets me write only this report outside my
worktree — so, for the record: **that report's "the only file in the whole 49-file suite matching
this shape" sentence is false and is superseded by the README and by this report.**

**Evidence:** `apps/web $ node --import ./test/bootstrap.mjs --import tsx --test
e2e/cell-budget-census.test.ts` — 5/5 pass. The detector is proven against the real tree, not only
against fixtures: with one real `await settle(page)` removed from `staff-expense-claim-walk.spec.ts`'s
scan wrapper, the coverage cell names that file's four cells by line and title; subject restored
byte for byte (`git diff --stat` empty).

### SPEC-864-B — major — the census never looked at polls, and exempted every file that signs in · FIXED

The shipped rule opened with `if (callsSharedSignIn(source)) return 0;`, which exempted 45 of the 50
files by construction, and no rule mentioned polls. Both are gone. The census is now per CELL over
EVERY file, and it is the budget arithmetic itself:

> a cell's ceiling is the flat base, plus `CELL_BUDGET.signIn` for every shared sign-in it reaches,
> plus `CELL_BUDGET.scan` for every settled scan it reaches, plus what it declares. Its need is the
> same sum computed from the work it actually does.

Two changes make that true rather than merely stated:

1. **`settleForScan` grants `CELL_BUDGET.scan`** (`apps/web/e2e/helpers.ts`, commit `c90b8b4dc`), the
   way `signInTo` has always granted `CELL_BUDGET.signIn`. `settleForScan` is the one place every
   scan in this suite passes through — `settle-before-scan-census.test.ts` holds that — so the
   headroom now follows the calls a cell actually makes, including the ones inside a loop, which no
   count written at the top of a cell can track. That single line closes the 17 cells across 15
   files the review counted, and the three files STD-1 named, without a budget line in any of them.
   Three files had written this same grant into their own local scan wrapper by hand
   (`identity-finish`, `staff-expense-claim`, `trade-invoice`) and one cell had written it inline
   (`members-invite`); all four are reduced to what remains, since a copy would now double-count.
   `a11y-finish-walk.spec.ts`'s two `cellBudgetMs({ signIns: 1, scans: FACES.length })` lines are
   removed for the same reason — every term of them is now granted where the work happens.
2. **The poll rule exists** (commit `bf89cbfd9`). A poll is an explicit `{ timeout: N }` at or above
   10 s — a wait the author already sized because the thing waited for is a fixture-driven state
   change; an ordinary `expect()`'s own 5 s default is not a poll and is what the flat base is for.
   The rule fires where the arithmetic does: when a cell's own waits — its own plus those of every
   local helper it calls, once per call — can consume the WHOLE 30 s base, the base is not sized to
   that cell's work. **Red first: 71 cells across 20 files.** Each now opens with
   `test.setTimeout(cellBudgetMs({ polls: N }))` sized to its own measured total
   (`ceil(total / CELL_BUDGET.poll)`), at the TOP of the cell so the sign-in and scan grants stack
   on top instead of being discarded by the replace.

**A third cell was added because rules 2 and 3 stand on it:** "the shared helpers GRANT what they
cost" asserts `signInTo` and `settleForScan` each call `grantCellBudget` themselves. Without it this
census would go on reporting green about headroom that had silently stopped existing — which is
precisely the failure mode of the first cut. Proven red by removing `settleForScan`'s grant; helper
restored byte for byte.

### SPEC-864-C — minor — no full browser-suite run against the final tree · RUN, and settled

`CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3580 CLARA_E2E_NEXT_PORT=3581 CLARA_E2E_RUNTIME_PORT=3582
pnpm --filter @clara/web e2e` against this branch's final tree (built by the run itself):
**561 passed, 1 failed, 7 skipped, 15.9 m.** Every one of the 12 spec files the review listed as
never having been run since #1017's 37-file fold ran in it.

**Which commit that run measured, exactly:** it was started at `eccc02578` and the four commits
after it (`5e5577417`, `68d773f23`, `3e6fb2152`, `bd6a8de4a`) touch only `e2e/*.test.ts` census
files and this report — no `*.spec.ts`, no app source, nothing Playwright builds or runs
(`git diff eccc02578..bd6a8de4a --name-only` lists exactly `e2e/cell-budget-census.test.ts` and
`e2e/settle-before-scan-census.test.ts`). So the subject of the run is
byte-identical to the new head for everything the browser suite exercises.

The one failure is `responsive-shell-walk.spec.ts:708` — "#736: crossing from wide into narrow
closes the rail by itself, through its own exit", `expect(await exited).toBe(true)` returning
false. It is a state-transition race with no timeout involved, in a file THIS ROUND never touched
(`git diff 2a6bae6f7..HEAD --name-only | grep responsive` is empty), and it is the SAME cell
`reports/wave3-lane09-ticket864.md` already recorded failing in its own run 2 — a documented,
pre-existing flake class, not a new one. **Re-run in isolation on the same triple immediately
afterwards: `pnpm --filter @clara/web e2e responsive-shell-walk` — 25/25 passed (40.0 s), including
that exact cell.**

So AC3 is settled rather than left open: the suite runs green on this tree except for one known
load-sensitive race that passes on its own, under the ten-lane contention the ticket's own README
paragraph describes. It is worth a ticket of its own (the cell watches for a CSS exit state that a
viewport change can skip under load); it is not a cell budget, and no budget would fix it.

### STD-1 — major — three real files flake-exposed · FIXED, same mechanism

`money-input.spec.ts`, `interview-walk.spec.ts` and `signup-confirm-pending.spec.ts` each run a real
`AxeBuilder.analyze()` with no automatic sign-in floor and no budget. All three settle through
`settleForScan` (directly or through a local wrapper that delegates), so each of their scans now
carries `CELL_BUDGET.scan` — 35 s per scan, on top of the 30 s base. The standards reviewer's other
half ("drop the `>= 2` floor to `>= 1`") is in the census: the rule has no scan-count floor at all
any more, and its vacuity control drives the single-ungranted-scan case explicitly, because
`CELL_BUDGET`'s own measurement is that ONE scan takes 33 s against a flat 30 s default.
`interview-walk`'s `establishSession` — the second sign-in shape the old `callsSharedSignIn` did not
recognise — no longer matters to the arithmetic: it grants nothing, so the census prices it at
nothing, which is the conservative direction. That cell also picked up a poll budget
(`cellBudgetMs({ polls: 18 })`, its own helpers' waits total 270 s).

### SPEC-989-A — minor — no vendored Popover files on the branch · FIXED

`apps/web $ node scripts/ui-add.mjs popover` re-run live on this lane (2026-09-23): exit 0,
`components/ui/popover.tsx` created with its `cn` import already rewritten to `@/lib/utils` by
#989's own fix, `components/ui/button.tsx` sha256 unchanged
(`1be7d29c0c3d8f7d52f9878dc1a6afdf39ad4eb60bef7537fa6ee8c20e03ddf0` before and after),
`package.json` and `pnpm-lock.yaml` byte-identical afterwards (sha256 unchanged; `git status`
listed the new file and nothing else). **The file is kept**, which is what AC5 asks for.

**The whole-suite run then caught what a rehearsal never would have:**
`tests/reduced-motion-contract.test.ts` named `popover.tsx`'s `data-open:zoom-in-95` and
`data-closed:zoom-out-95` as movement running under `prefers-reduced-motion`. Upstream ships the
popup's six side slides and its open/close zoom unprefixed; `dialog.tsx`, `dropdown-menu.tsx`,
`select.tsx` and `tooltip.tsx` each already carry the `motion-safe:` re-cut for exactly this. Applied
the same way, with the reason in the file's own header (commit `eccc02578`). It is routine install
hygiene, not an owner ruling, so `popover.tsx` does NOT join `scripts/protected-components.json` —
the same reading `components/ui/README.md` already applies to the ring-alpha re-cut, whose own
eleven carriers are all off the list. The README's hygiene paragraph now names this re-cut too.

**Combobox stays a recorded rehearsal, deliberately.** Its closure also rewrites `input.tsx`,
`textarea.tsx` and `input-group.tsx`, which each carry the hand-applied `focus-visible:ring-ring/70`
re-cut; re-applying that hygiene belongs to the ticket that ships Combobox (#667), and vendoring an
unused Combobox to satisfy a criterion about the INSTALL's behaviour would trade a real regression
risk for a tick. AC4's words are about what the install does, not about a produced file, and the
guard's own selftest plus the recorded live run cover it.

### SPEC-989-B — minor — force-overwrite-then-restore, with the spawn outside any try/finally · FIXED

Two selftest cases first, both red against the shipped code: a `spawnAdd` that throws leaves
`restoreProtectedFiles` uncalled, and the `SKIPPED` line claims the file was "never silently
overwritten" when it was in fact overwritten and put back. Then the fix (`scripts/ui-add.mjs`):

- the spawn is wrapped so the restore runs in a `finally` on every exit path, and the failure is
  still raised to the caller;
- the run says, BEFORE anything is written, that the CLI is about to overwrite the protected file(s)
  and that this guard will restore them straight after;
- the `SKIPPED` line now reads "overwritten by the CLI and RESTORED byte for byte", not "never
  silently overwritten";
- the one window a `finally` cannot close — the process killed outright between the write and the
  restore — is named in both the CLI's output and `components/ui/README.md`, with its recovery:
  every protected file is tracked in git, so `git checkout -- <path>` restores it. I did not add an
  on-disk backup: it would duplicate what git already holds and add a stray-file failure mode.

`apps/web $ node scripts/check-ui-add-guard.selftest.mjs` — 47 cases, all pass (45 before).

### SPEC-1017-A — minor — the new pinned pair cannot see the component · FIXED, both halves

The finding is exactly right: `foreground-on-muted-selected-document-row` resolves `--foreground`
over `--muted` out of `app/globals.css` and never looks at a component, so reverting
`filed-document-list.tsx` to `text-muted-foreground` leaves it reporting 14.32:1 and green.

- **The citation now says what the pin does** (`scripts/check-token-contrast.mjs`): it records WHICH
  pair the row is supposed to render and proves that pair clears the floor with a real margin, and
  it names the cell that catches the regression.
- **That cell exists** (`components/documents/documents-a11y.test.tsx`): it renders the real
  `FiledDocumentList` with a row selected and asserts the row carries `bg-muted`, that no cell of it
  carries `text-muted-foreground`, and that its caption cells carry `text-foreground` — reading both
  token names back out of the pin itself (`spec.fg(identity)`), so renaming either half of the pin
  without moving the component fails here too. Its control renders the same list UNSELECTED and
  asserts `text-muted-foreground` is still there, so the first cell cannot pass because the class
  vanished.

Vacuity control on the real subject: with both conditional class expressions reverted to plain
`text-muted-foreground`, the cell reds; subject restored byte for byte.

## Also fixed, though not in the fix list (small and clearly better)

- **SPEC-1017-C (note)** — the settle census's markers were file-ordered with no cell boundary, so a
  settle at the end of one cell cleared an unsettled scan at the start of the next. The walk now
  resets at every `test(`/`test.only(` opener, and the vacuity control gains the cross-cell fixture
  in both directions. Latent when found (a boundary-aware re-run over the 50 real files reports the
  same zero offenders), which is the cheapest moment to close it. A transcription slip in my own
  first cut of that change dropped the wrapper-marker block; the census immediately named six real
  scans in `a11y-finish-walk` and `home-board-walk`, which is incidental proof that the
  `LOCAL_WRAPPERS` mechanism is load-bearing rather than decorative — those two files' scans are
  cleared by their registered wrappers and by nothing else. Restored in the same commit, before it
  was made; nothing inert was ever committed.
- **Shared reading extracted** to `apps/web/e2e/spec-census.ts`: spec listing, comment stripping,
  line numbers, function bodies, cell bodies and transitive call counting, used by both censuses.
  #1017's file could strip comments but had no cell boundary; #864's had a cell boundary and read
  comments as code — and the second of those is how a detector keyed on the literal `scan(` came to
  be trusted. One copy, one set of vacuity controls.

## Not fixed, with the reason

- **SPEC-989-C (note)** — the forced `--overwrite` also rewrites the OTHER already-vendored files in
  the closure (`input.tsx`, `textarea.tsx`, `input-group.tsx` for Combobox) and the report names only
  the protected skip. Naming them honestly means asking the filesystem which of the installable paths
  already exist, and `main()`'s existence check is not one of its injected seams — so the fix is a new
  seam plus its cases, which is more than "small". The hazard is partly netted already
  (`tests/focus-ring-contract.test.ts` reds on the specific `/70` → `/50` drift), and #667, the ticket
  that will actually run that install, is named in `components/ui/README.md` as owing the re-cut.
- **SPEC-970-A / SPEC-970-B / SPEC-997-A (notes)** — all three ask for a sentence in a ticket report
  or an acknowledgement on a GitHub issue. This lane may not write to GitHub, and the work order lets
  me write exactly one file outside my worktree (this one), so they are recorded here for the
  orchestrator: the button's `motion-fast` + explicit transition-property list was dropped with the
  #970 overwrite and no cell asserts it; `pnpm-lock.yaml` carries incidental `debug` peer-context
  churn from that install; and #997's AC2 was proven against a served build but with three governed
  doors implemented as in-process mock handlers, which the spec file's own header says and the ticket
  report's AC2 line does not.
- **SPEC-997-B (note)** — the new walk's mock keeps its disposition state in module scope and never
  resets it, so a second pass in one server process would red the first assertion. It is safe under
  today's config (`retries: 0`, `workers: 1`, `reuseExistingServer: false`, all verified) and the fix
  belongs with the mock's owner; not touched here because this round already moves 20 spec files and
  a fixture-reset route is a new door on a shared mock.
- **SPEC-1017-B (note)** — `document-facts-table.tsx`'s selected row carries the same 4.62:1 pair.
  Whether the ruling's margin requirement reaches every carrier or only the filed-document row is a
  product question for the owner, not a judgement to make inside a fix round; the cell added for
  SPEC-1017-A is written so the same guard can be pointed at a second component in one line.

## Gates

| Gate | Result |
|---|---|
| `apps/web` whole unit suite (`node scripts/run-tests.mjs`) | **4860 tests, 4858 pass, 0 fail, 2 skip**, exit 0 (94.2 s, re-run on the final tree) |
| `pnpm typecheck` (root) | exit 0 — `apps/web` and `packages/runtime` both Done |
| `CI=true GITHUB_ACTIONS=true pnpm lint` (root) | exit 0, whole chain |
| `apps/web $ node scripts/check-ui-add-guard.selftest.mjs` | 47 cases, all pass |
| `apps/web $ node scripts/check-token-contrast.mjs` | 57 pairs, all pass; the selected-row pair 14.32:1 |
| The eight cell files this round touched or leans on (`cell-budget`, `settle-before-scan`, `sign-in`, `spec-discovery`, `e2e-fixture-ownership`, `documents-a11y`, `token-contrast`, `reduced-motion-contract`) | 91 tests, 91 pass |
| WHOLE browser suite, one full run, lane triple 3580/3581/3582 | **561 passed, 1 failed, 7 skipped** (15.9 m) — the one failure classified above and green in isolation |
| `pnpm --filter @clara/web e2e responsive-shell-walk` (the classification re-run) | 25/25 passed (40.0 s) |

The unit-suite figure is three cells above the reviewed head's 4857 TESTS: two new cells in
`documents-a11y.test.tsx` and one new cell in `cell-budget-census.test.ts`, plus the two
`settle-before-scan-census.test.ts` fixtures, which live inside an existing cell. The first run of
that suite had exactly one failure — `reduced-motion-contract.test.ts` on the freshly vendored
`popover.tsx` — which is recorded above under SPEC-989-A and fixed rather than excused.

## Follow-ups worth filing

1. **`responsive-shell-walk.spec.ts:708` ("#736: crossing from wide into narrow closes the rail by
   itself, through its own exit") is a real, load-sensitive race**, observed once here and once in
   #864's own run 2, green in isolation both times. The cell samples a transient CSS exit state
   across a viewport change; under load the removal can beat the sample. A cell budget cannot fix
   it — the assertion carries no timeout at all — so it wants its own small ticket (watch for either
   the exit state OR the removal, rather than requiring the intermediate frame).
2. **A second carrier of the 4.62:1 selected-row pair** (`document-facts-table.tsx`, SPEC-1017-B)
   needs an owner decision before it is moved; see "Not fixed" above.
3. **`scripts/ui-add.mjs` still has no injected existence check** (SPEC-989-C), which is what a
   truthful "these already-vendored files will be rewritten too" line would need.

## Anything unverified

- **Hosted/production behaviour** — nothing here reaches it: no migration, no runtime change, no
  door. Everything above is this lane's rig.
- **The browser suite under a QUIET host** — this run shared the machine with the rest of the wave,
  which is the condition #864's own README paragraph describes; a green run here is stronger evidence
  than a green run alone would be, and a red one has to be read with that in mind.
