# Wave 3, lane 08, ticket #1019 — the e2e README's coverage-map count, held by a cell

Branch `riders/w3-lane08`, worktree `C:\Users\zhant\Desktop\clara-wt\658`, base
`ffe63a0dd084e99b84c1368119845be273c421ce`. Commits for this ticket (in order; #857 and #990 are
this lane's prior tickets, landed and reported separately — `wave3-lane08-ticket857.md`,
`wave3-lane08-ticket990.md`):

- `53ad01884` `fix(web): #1019 pin the e2e README coverage-map spec count to a cell`

## Resume note: an earlier implementer of THIS ticket

An earlier implementer of #1019 hung after one edit, leaving `apps/web/e2e/spec-discovery.test.ts`
modified in the working tree: its `node:fs` import widened from `{ readdirSync }` to
`{ readdirSync, readFileSync }`, with nothing else changed (no new test cell, no README edit). I
read the diff before touching anything. Judged on its merits: `readFileSync` is exactly what the
brief's own reuse target needed — the new cell has to read `README.md` off disk — so the import
widening was kept rather than reverted, and the actual cell was built on top of it.

## Status: done (as amended by the fix round — see "Fix round — SPEC-L08-03" below)

The first delivery satisfied the ticket against DISK and then contradicted the coverage-map table
directly beneath the sentence. The fix round closes the other half of the same requirement; the
Docs and Gates sections below describe the first delivery, and the fix-round section amends them.

Verified still live before building: `gh issue view 1019 --repo BELCORT-SDN-BHD/clara --json
title,body,comments` — no comments beyond the triage-filed Agent Brief in the body, which is the
spec of record for the seams/AC list below. The drift it names was still present verbatim: the
README stated "25 specs" while the checked-in suite held 49 `*.spec.ts` files.

## The seam tested at

- **`apps/web/e2e/README.md`'s coverage-map sentence**, read off disk with `readFileSync` and its
  stated count extracted by regex — never re-typed by hand into the test as a second copy of "the
  answer."
- **The real `*.spec.ts` file count**, computed with the SAME `readdirSync(E2E_DIR).filter(...)`
  shape `spec-discovery.test.ts`'s existing cell already uses for its own `browserWalks` array
  (the "file-discovery logic" and "sign-in census" shape the brief pointed at —
  `sign-in-census.test.ts` reads its own file list the same way, one level up, for the same reason:
  a hand-kept number is the drift this whole file exists to catch).

## Acceptance criteria, with evidence

| # | Criterion | Evidence |
|---|---|---|
| AC1 | The README's stated spec count matches the real number of checked-in browser-walk spec files as of the fix | `apps/web/e2e/README.md` line 108 now reads "The checked-in suite currently contains 49 specs:"; `ls apps/web/e2e/*.spec.ts \| wc -l` = 49 (measured before and after the fix). The new cell (`#1019 · README's coverage-map count matches the real number of checked-in spec files`, `spec-discovery.test.ts`) asserts `statedCount === realCount` and passes: `ok 3` in a standalone run (`node --import ./test/bootstrap.mjs --import tsx --test e2e/spec-discovery.test.ts`, 3/3 pass). |
| AC2 | A test fails if the README's stated count and the real spec-file count diverge again (the brief's own either/or, resolved) | Built the "test fails on divergence" branch rather than dropping the exact number: the AC1 wording itself ("the stated count matches... as of the fix") presupposes a number stays in the README, and a hand-maintained number backed by a cell that pins it byte-exact is more durable than deleting the commitment — the ticket's own root cause was an unchecked number, not the presence of a number. RED-BEFORE: run against the stale README before the fix — `not ok 3`, `25 !== 49`. GREEN after the one-line README edit — `ok 3`. VACUITY CONTROL: mutated the README's stated count to a third, still-wrong value ("30"), re-ran — `not ok 3`, `30 !== 49` — then restored to "49" and re-ran green, proving the cell actually fires on drift rather than passing by construction. |
| AC3 | The coverage-map table's per-spec descriptions are otherwise unchanged | `git diff apps/web/e2e/README.md` touches exactly one line (the "25" → "49" substitution on line 108); the table rows below it are untouched — confirmed by the diff itself (`1 file changed, 1 insertion(+), 1 deletion(-)`, no other hunk). |

Out of scope, respected: no rewrite of the per-spec description text, no change to which files count
as specs vs. `node:test` cells (the existing `discovers`/`testMatch` cells in the same file, `#851`'s
own, are untouched and still pass).

## Docs

- `apps/web/e2e/README.md` — the one-line count fix itself (line 108); the fix round then reworded
  that sentence and added a `### Specs with no coverage-map row` section. No other doc needed updating:
  the module's own explanation of the two-runner split (`## Two runners share this directory`) already
  points at `spec-discovery.test.ts` as the file holding Playwright's `testMatch`, and the new cell
  lives in that same file, so no new cross-reference was required.

## Gates, with counts

- **Test file touched**: 1 — `apps/web/e2e/spec-discovery.test.ts` (2 pre-existing `#851` cells + 1
  new `#1019` cell = 3/3 pass, standalone run). AFTER the fix round: 2 `#1019` cells, 4/4 pass.
- **`pnpm --filter @clara/web typecheck`**: exit 0.
- **`CI=true GITHUB_ACTIONS=true pnpm lint`** (root, run once covering both #1019 and #1020 together
  — see `wave3-lane08-ticket1020.md` for the full transcript summary): exit 0.
- **The whole `apps/web` unit suite once** (`node scripts/run-tests.mjs`, run once covering both
  tickets — see `wave3-lane08-ticket1020.md`): 4856 tests, 4854 pass, 0 fail, 2 skipped (the known,
  pre-existing `CLARA_LIVE_SUPABASE_AUTH_URL`/`ANON_KEY` live-provider skip in
  `password-recovery-live.test.ts`, unrelated to this ticket).
- No e2e browser walk needed: this ticket touches only a `node:test` cell inside the e2e directory,
  not a `*.spec.ts` browser walk, so no `pnpm --filter @clara/web e2e` run is owed by rule 8.

## Fix round — SPEC-L08-03: the sentence agreed with disk and then contradicted the table

The first fix moved the contradiction rather than removing it. The README stated 49 specs directly
above a coverage-map table holding 26 rows, and the ticket forbids EXACTLY that: "a person reading
the README is never told a number that contradicts what they can count in the table below it or on
disk." Measured: `ls apps/web/e2e/*.spec.ts | wc -l` = 49, coverage-map rows = 26, so 23 checked-in
specs had no row at all.

Writing 23 descriptions is the ticket's OWN out of scope ("Rewriting or auditing the individual
per-spec description text in the coverage-map table"), so the fix takes the other branch the
ticket's either/or allows: the sentence no longer implies the table enumerates the suite, and the
remainder is NAMED rather than left for the next reader to discover.

- `apps/web/e2e/README.md` — the sentence now reads: "The checked-in suite currently contains 49
  specs. The table below describes 26 of them; the remaining 23 have no row yet and are named under
  Specs with no coverage-map row beneath it…", and a new `### Specs with no coverage-map row`
  section lists all 23 by file name (names only — no descriptions, so AC3 stays intact).
- `apps/web/e2e/spec-discovery.test.ts` — a SECOND cell, `#1019 · the README's table and its
  residual list partition the suite, and both counts are stated`, holds all three numbers together:
  stated total vs `readdirSync`, stated described-count vs the table's own rows, stated remainder vs
  the named list, and — the strongest arm — `[...described, ...residual].sort()` must EQUAL the
  directory listing, so a spec can be neither added nor removed without landing in exactly one of
  the two. The original AC1 cell's regex was widened from `specs:` to `specs[.:]` to accept the
  reworded sentence; it still pins the total against disk unchanged.
- VACUITY CONTROL, both arms, run and observed: changing "describes 26" to "describes 25" gave
  `not ok 4`; deleting one bullet (`- \`plans-walk.spec.ts\``) gave `not ok 4`. Restored byte for
  byte from a snapshot; `e2e/spec-discovery.test.ts` then 4/4 pass.

The 23 specs with no coverage-map row: `accrual-walk`, `bank-match-walk`, `client-create-walk`,
`counterparty-identity-walk`, `depreciation-walk`, `document-correction-walk`,
`documents-intake-walk`, `firm-commercial-walk`, `firm-setup-walk`, `fixed-asset-acquisition-walk`,
`intake-batch-walk`, `knowledge-firm-walk`, `knowledge-walk`, `members-invite-walk`,
`opening-ledger-source-walk`, `operator-support-walk`, `periodic-adjustment-walk`, `plans-walk`,
`prepayments-walk`, `staff-advances-register-walk`, `staff-expense-claim-walk`,
`trade-invoice-walk`, `work-knowledge-walk`.

## Follow-ups worth filing

- **Write coverage-map descriptions for the 23 specs named above.** Its own ticket: the work is
  reading 23 browser walks and describing each in one row, which is squarely what this ticket put
  out of scope. The residual is now visible in the README and held by a cell, so it cannot rot
  silently while that ticket waits.
- Otherwise none. The remaining out-of-scope item (spec-vs-cell classification) is untouched.

## Anything unverified

- Nothing. Both the red-before and the vacuity-control mutation were run and observed directly in
  this session (not simulated), and the README's final state was re-diffed against `HEAD` before
  commit to confirm the single-line change.
