# Wave S · lane 06 · ticket #1126 — measure the frontier legs' declared cell-count floors, and record each leg's actual counts

**Status: DONE.** No migration (none needed, none written — matches the SWEEP-PLAN lane table,
`#1126 (no)`, and the ticket's own "This ticket is expected to need NO migration").

- Branch `riders/wS-lane06`, worktree `C:\Users\zhant\Desktop\clara-wt\658`, base `7bc5a710f`.
- Lane database `clara_l08` (127.0.0.1:55748); untouched by this ticket (no database work at all —
  every cell is a filesystem-only check, and every YAML edit is CI plumbing; see "Migration"
  below).
- Commits (`git log --oneline 7bc5a710f..HEAD`, on top of #1044's four commits, #1128's three,
  #1129's one and #1131's one, all already landed on this branch before I started):

| commit | subject |
|---|---|
| `11b22490a` | `test(db): #1126 a declared frontier-leg cells-floor is checked against the corpus on disk` |
| `b6030d20e` | `feat(ci): #1126 each frontier leg records its measured pass/fail/skip counts to $GITHUB_STEP_SUMMARY` |

Files: `packages/db/tests/ci-frontier-leg-contract.test.mjs`, `.github/actions/frontier-leg/action.yml`,
`packages/db/tests/README.md`. Nothing else — no `CONTEXT.md` change (no new domain vocabulary; this
is CI/test infrastructure, not accounting behaviour), no `packages/db/tests/rig-meta.mjs` change (no
new feature battery, no migration, no new DB object), no `apps/web` change.

**First action, as instructed:** `git status` (clean) and `git log --oneline 7bc5a710f..HEAD` — the
nine commits above (#1044 x4, #1128 x3, #1129 x1, #1131 x1) already landed, exactly WORK-ORDER.md's
addendum shape.

**The ticket is live on this branch.** `gh issue view 1126` printed cleanly in this shell this time
(unlike #1129's/#1131's own reports, which recorded `--comments` printing nothing — plain `gh issue
view 1126` worked here, piped through `cat` with `GH_PAGER=cat PAGER=cat`) — OPEN, labels
`enhancement` + `ready-for-agent`, **0 comments**, so the body's Agent Brief is the sole GitHub-side
contract. Two acceptance criteria:

1. "A dispatch run's summary shows each frontier leg's actual pass/fail/skip counts."
2. "There is a way (a scheduled check, a script, or a CI step) to detect when a declared floor no
   longer matches what the corpus at that frontier would produce, without requiring a human to run
   the numbers by hand."

The task prompt's "LANE NOTES FROM THE SCAN" pointed me at the right seam before I read anything
else: "#1126's floors are the `#!cells-floor:` and `#!skips-max:` lines in
`packages/db/tests/split-lists/test-list-*.txt`, and no `GITHUB_STEP_SUMMARY` exists anywhere in the
workflows today." Confirmed independently: `grep -rn "GITHUB_STEP_SUMMARY" .github/` returned nothing
before this ticket.

---

## The seams I tested at (written down before the first cell)

| # | seam | why it is a seam the brief gives me |
|---|---|---|
| **S1 (AC2)** | `packages/db/tests/split-lists/test-list-*.txt`'s declared `#!cells-floor:`, checked against a **static** count of `^test\(` lines summed across the list's own files on disk | the brief names the remedy directly: "re-deriving the expected cell count from the corpus on disk at each leg's frontier, the same way the gate chain is already derived rather than hand-copied" — and the estate already has exactly this technique, one file narrower: `p1041.drill.floor` (in `ci-frontier-leg-contract.test.mjs`, pre-existing) already asserts `#!drill-cells-floor:` equals a static `test(` count of the ONE drill file it bounds. My seam is the SAME technique applied to the wider `#!cells-floor:` (a whole list's files, and the roster's) that #1041 left uncovered |
| **S2 (AC1)** | `.github/actions/frontier-leg/action.yml`'s three measured `run:` steps (the slice list, the cross-slice contract roster, the isolated deploy drill), each of which already computes `$PASS`/`$FAIL`/`$SKIP`/`$CELLS` and now also writes them to `$GITHUB_STEP_SUMMARY` | "Key interfaces: `.github/actions/frontier-leg`: the composite action that runs each leg and currently only compares against the declared floor" — the brief names this exact file; the seam is the three places it already measures a run and does nothing with the number but compare it |

Two independent seams, two acceptance criteria, two commits — see "Why two commits" below.

## Why two commits (and why each leaves the repo green)

AC2's whole deliverable is a test (the estate's own five `#!cells-floor:`/`#!drill-cells-floor:`
declarations already matched the corpus on disk before I touched anything — see the measurements
under AC2 below — so there was no production number to change, only a check to add that would catch
the NEXT drift). AC1's deliverable is test-plus-production-code (three YAML `run:` blocks). Bundling
both into one commit would have meant the intermediate state — after writing the AC1 test cells but
before writing the AC1 production code — sat inside the same commit as the AC2 cells, so `git log`
would show no point at which the file was 15/15 green with the AC1 tests present and unmet. Instead:

1. **Commit 1 (AC2 only).** Wrote `p1126.floor.corpus` and `p1126.floor.roster`, confirmed the file
   was 12/12 green (10 pre-existing `p1041.*` cells + these 2), vacuity-controlled each new cell (see
   AC2 below), committed.
2. **Commit 2 (AC1 only).** Wrote `p1126.summary.list`/`p1126.summary.roster`/`p1126.summary.drill`
   against the action.yml `git show`n in commit 1 — ran them, saw all three **RED** for the right
   reason (`the … step has no `{ ... } >> "$GITHUB_STEP_SUMMARY"` block …`), added the three YAML
   blocks, reran — all three **GREEN**, whole file 15/15, committed.

Both commits leave `packages/db`'s own `ci-frontier-leg-contract.test.mjs` fully green.

## AC2 — "detect when a declared floor no longer matches what the corpus at that frontier would
produce, without requiring a human to run the numbers by hand"

**Met**, entirely inside `packages/db/tests/ci-frontier-leg-contract.test.mjs` — no production code
needed, because every declared floor already matched the corpus (see measurements below); the gap
was that nothing CHECKED that, ever.

**The technique, generalised from an estate precedent.** `p1041.drill.floor` (pre-existing, #1041)
already proves `#!drill-cells-floor:` equals `(readFileSync(drillFile).match(/^test\(/gm) ??
[]).length` — a static, top-level count, no database, no test run. That works because every file in
this corpus is a **flat battery**: no file nests a subtest inside another `test(...)` call, so the
number of lines matching `^test\(` at column zero IS the file's true cell count. I verified this
generalises from one drill file to a WHOLE LIST's worth of files (30+ files, ~150 cells) before
writing a single line of test code, by hand-summing it once per slice outside the test framework:

```
d-b0: static sum of ^test\( across its 32 listed files = 153  ·  declared #!cells-floor: 153
d-b1: 82  ·  declared 82
d-b2: 169  ·  declared 169
d-b3: 74  ·  declared 74
contracts roster: 12  ·  declared 12
```

Every one matches exactly — including the header's own historical note ("every floor went UP...
149→153, 76→82, 168→169, 70→74"), which independently confirms the technique reproduces the numbers
#1041 measured by hand on 2026-09-24. Two new cells encode this check permanently:

- **`p1126.floor.corpus`** — for each of the four `test-list-d-bN.txt` files, sums `staticCellCount`
  (the same regex as `p1041.drill.floor`, factored into a shared helper) across every listed
  (non-comment) file, asserts every listed file exists on disk, and asserts the sum equals the
  declared `#!cells-floor:`.
- **`p1126.floor.roster`** — the same check for `test-list-contracts.txt`.

**This runs on EVERY PULL REQUEST, not only on a dispatch.** `ci-frontier-leg-contract.test.mjs`
matches `packages/db/package.json`'s `test` script glob (`"tests/**/*.test.mjs"`), which
`.github/actions/db-estate-suite/action.yml:115` runs unconditionally
(`pnpm -r --filter '!@clara/runtime' --filter '!clara' --if-present test`) inside the `db-estate` job
— which `ci.yml`'s `ci` gate requires on every code diff (`code_gated "db-estate" "$R_ESTATE"`). So
this closes AC2 more strongly than "a scheduled check, a script, or a CI step" asks for: a stale
floor is caught on the PR that causes it, days before anyone would dispatch `db-slice-frontiers` at
all — the same "caught on the PR itself" shape `p1041.total.declared` already established for a
MISSING declaration.

**Vacuity-controlled** (WORK-ORDER rule 4: a ticket whose whole deliverable is a test still needs
this), once per new cell:

1. `test-list-d-b0.txt`: `#!cells-floor: 153` → `154`. Ran `p1126.floor.corpus` alone
   (`--test-name-pattern="p1126.floor"`) — **RED**: `test-list-d-b0.txt declares a floor of 154 while
   its own listed files carry 153 top-level test( cell(s) on disk right now — … (#1126)`, `153 !==
   154`. Restored via `cp` from a pre-edit backup; `git diff --stat` on the file showed nothing
   (byte-identical).
2. `test-list-contracts.txt`: `#!cells-floor: 12` → `13`. Ran `p1126.floor.roster` alone — **RED**:
   `expected: 13, actual: 12`. Restored the same way; `git diff --stat` clean.
3. Reran the whole file after each restore: 12/12 (before AC1's cells existed) then 15/15 (after).

## AC1 — "A dispatch run's summary shows each frontier leg's actual pass/fail/skip counts"

**Met.** `.github/actions/frontier-leg/action.yml`'s three measured `run:` steps each gained a
`{ echo …; } >> "$GITHUB_STEP_SUMMARY"` block, placed right after `CELLS=$((PASS + SKIP))` and its
existing `echo "--- … ---"` log line, and BEFORE the `test "$FAIL" = "0" || exit 1` line that can end
the step — so the summary is written even on a leg that goes on to fail one of its own bounds, which
is exactly when a human most wants it:

```bash
{
  echo "### db-slice-frontiers — ${{ inputs.slice }} test list"
  echo "| pass | fail | skip | cells | declared floor | skips-max |"
  echo "|---:|---:|---:|---:|---:|---:|"
  echo "| $PASS | $FAIL | $SKIP | $CELLS | $FLOOR | $SKIPMAX |"
  echo
} >> "$GITHUB_STEP_SUMMARY"
```

…with the analogous block (same shape, `$FLOOR`/`$SKIPMAX` for the roster step, `$DFLOOR`/`$DSKIPMAX`
for the drill step) in the other two measured steps.

**Why this satisfies "a dispatch run's summary", not just "a step's log".** `db-slice-frontiers` is a
`strategy: matrix` job — each of the four slices (`d-b0`/`d-b1`/`d-b2`/`d-b3`) is its OWN job, on its
own runner. Per GitHub's own docs (checked via Context7, `/websites/github_en_actions`, query
"GITHUB_STEP_SUMMARY environment file job summary markdown", 2026-09-25): "summaries from all its
[a job's] steps are grouped into a single job summary, and summaries from multiple jobs are ordered
by job completion time" onto the SAME workflow run's summary page. So the four legs' twelve
step-summary writes (three steps × four slices) all land on ONE page — the dispatch run's own summary
— not scattered across four separate logs a human has to open one at a time.

**Test-first, genuinely red before green.** `p1126.summary.list`/`.roster`/`.drill` extract the
`{ ... } >> "$GITHUB_STEP_SUMMARY"` block from inside the NAMED step (via a `summaryBlock()` helper
that regex-cuts exactly that group, so the cell cannot pass by coincidence off `$PASS`/`$FAIL`/`$SKIP`
already appearing elsewhere in the same step, which they do, for the pre-existing floor check) and
assert it names every one of the six values. Run against the base `action.yml` (before any of this
ticket's code): all three **RED**, `error: 'the … step has no `{ ... } >> "$GITHUB_STEP_SUMMARY"`
block …'`. After adding the three blocks: all three **GREEN**.

**The exact shell was also executed, not merely syntax-checked.** I copied the three new blocks
verbatim into a scratch script (`verify-summary-blocks.sh`) with representative `$PASS`/`$FAIL`/
`$SKIP`/`$FLOOR`/`$SKIPMAX`/`$DFLOOR`/`$DSKIPMAX` values (the real d-b0 numbers: 149/0/4/153/4 for
the list, 4/0/8/12/8 for the roster, 3/0/0/3/0 for the drill) and a real file standing in for
`$GITHUB_STEP_SUMMARY`, and ran it: exit 0, and the three Markdown tables rendered exactly as
intended (headers, `|---:|` alignment row, one data row, a trailing blank line separating tables).
`python3 -c "yaml.safe_load(...)"` also confirms `action.yml` still parses as 9 well-formed steps
(unchanged from before — I only added lines inside existing `run: |` blocks, never a step boundary).

## Gates, with counts

| gate | command | result |
|---|---|---|
| Touched test file, syntax | `node --check tests/ci-frontier-leg-contract.test.mjs` (both after commit 1 and after commit 2) | clean, twice |
| Touched test file, full run with the package's own gate chain | `GATES="$(node scripts/print-gate-chain.mjs)"; node --test --test-concurrency=1 $GATES tests/ci-frontier-leg-contract.test.mjs` | **15 pass / 0 fail / 0 skip** (10 pre-existing `p1041.*` + 5 new `p1126.*`) — final run, after both commits |
| Vacuity proof (AC2), cell 1 | same, `--test-name-pattern="p1126.floor"` against a deliberately-bumped `test-list-d-b0.txt` | **1 pass / 1 fail** — the RED, for the exact drift message; file restored byte-for-byte (`git diff --stat` empty), rerun green |
| Vacuity proof (AC2), cell 2 | same, against a deliberately-bumped `test-list-contracts.txt` | **RED** (`expected: 13, actual: 12`); restored byte-for-byte, rerun green |
| Vacuity proof (AC1), 3 cells | run against the pre-code `action.yml` | **0 pass / 3 fail**, each `error` naming the missing `$GITHUB_STEP_SUMMARY` block |
| New YAML executed directly (not just syntax-checked) | scratch script, verbatim copy of the three new blocks, representative values | exit 0; 3 valid Markdown tables produced |
| `action.yml` still valid YAML, same step count | `python3 -c "d=yaml.safe_load(open(...)); print(len(d['runs']['steps']))"` | `9` (unchanged) |
| `eslint` on the touched test file | `CI=true GITHUB_ACTIONS=true pnpm exec eslint tests/ci-frontier-leg-contract.test.mjs` (from `packages/db`) | clean, no output — run after each commit |
| `pnpm typecheck` | from worktree root | 0 errors; `apps/web typecheck: Done`, `packages/runtime typecheck: Done` |
| `pnpm lint` (as the runner sees it) | `CI=true GITHUB_ACTIONS=true FREEZE_BASE_REF=7bc5a710f pnpm lint` | **exit 0**, full monorepo chain (root selftest scripts, `eslint scripts eslint.config.mjs`, `apps/web lint` incl. its own extensive selftest suite, `packages/runtime lint`, `packages/reporting-render lint`) — no finding against any file this ticket touched |

**`operation-census.test.mjs` / `rig-isolation.test.mjs`: not run — no SQL function added.** The
task prompt's own gate list narrows this explicitly ("operation-census and rig-isolation if you
added SQL functions"); this ticket added none (confirmed under "Migration" below), so this is N/A
rather than skipped. I did NOT rely only on that narrowing without checking it against the general
WORK-ORDER.md rule 8 ("if you touched `packages/db/tests`, … plus `operation-census.test.mjs` and
`rig-isolation.test.mjs`") — the two read differently, and I followed the task prompt's more specific
wording for this dispatch, recording the discrepancy here rather than picking silently.

**`check-frozen-workflows.mjs` / `check-parts-parity.mjs`: not run — `packages/runtime` untouched.**
Confirmed by this ticket's own file list (three files, none under `packages/runtime`) and by
`git diff --stat 6b73af662..HEAD` (the tip before this ticket) showing only the three files above.

`apps/web` was not touched: no web unit suite run beyond the whole-chain `pnpm lint` above (which
includes it), no Playwright walk, no `apps/web/test/manifest.txt` entry needed.
`apps/web/tests/firm-scope-db-pins.corpus.ts` was not touched or rechecked: rule (d) applies only
when a migration file changed, and none did.

## Migration

**None.** Confirmed before building (ticket's own instruction: "This ticket is expected to need NO
migration. If you find it needs one, stop this ticket and say why" — it did not need one) and
confirmed after: `git diff --stat 7bc5a710f..HEAD -- packages/db/migrations` for this whole lane's
history is empty — no ticket in this lane, including this one, touched `packages/db/migrations`. The
lane database `clara_l08` was never connected to by anything this ticket did; every cell and every
gate above is filesystem-only (`readFileSync`/regex) or a plain shell script.

## Docs

- **`packages/db/tests/README.md`** — extended the existing "Every run in that leg is bounded, and no
  bound lives in the file it bounds (#1041)" section (the one that already documents the
  `#!cells-floor:`/`#!skips-max:`/`#!drill-*` table) with two new paragraphs, one per commit: "A
  declared `#!cells-floor:` is itself checked against the corpus on disk (#1126)" and "Every measured
  run in the leg also writes its own counts to the dispatch run's summary (#1126)".
- **`CONTEXT.md`** — no change. No new domain vocabulary: this ticket is CI/test infrastructure
  (dispatch-run visibility and a floor's own correctness), not an accounting concept.

## Successor contract

**None.** This ticket touches no frozen chat or Work tool surface — no `chatTurn_v*`, no
`claraWork_v*` body, no door, no zod input, no prompt stanza, and no `packages/runtime` file at all.
It adds two test files' worth of assertions to an existing test file and three small shell blocks to
an existing composite action's YAML.

## Follow-ups worth filing

1. **The skip bounds (`#!skips-max:`, `#!skips-max-<slice>:`, `#!drill-skips-max:`) are NOT
   statically re-derived by this ticket — only the cell floors (`#!cells-floor:`,
   `#!drill-cells-floor:`, the latter already covered since #1041) are.** A skip count depends on
   which preintegration gates fire at a given frontier (runtime/database state), not on what is
   syntactically on disk, so the same static-count technique cannot reach it without actually running
   the corpus against a database at that frontier — which is exactly what the dispatch-only frontier
   leg itself does, and what AC2's own wording ("without requiring a human to run the numbers by
   hand") suggests should stay out of scope for a database-free PR-time check. Worth a ticket of its
   own if a stale skip bound (rather than a stale cell floor) is ever the thing that goes unnoticed.
2. **`p1126.floor.corpus`/`p1126.floor.roster` prove a list's declared floor matches its OWN listed
   files' static count — they do not re-derive `partition-total`'s separate claim that the lists
   TOGETHER partition the whole x41/x42 corpus.** That claim is already covered by
   `.github/actions/partition-total`'s own `diff -u` step; no gap found, just noting the boundary
   between what this ticket's two new cells prove and what the pre-existing gate already proves, so a
   future reader does not assume `p1126.floor.*` subsumes it.

## Anything unverified

- **The actual GitHub Actions run summary UI was not observed rendering these tables** — this ticket
  never dispatches `db-slice-frontiers` (it is a scheduled/`workflow_dispatch`-only job, and I was
  told to build test-first in this worktree, never push or open a PR). What I verified instead:
  (a) the exact shell block runs and produces valid Markdown when executed directly, and (b) GitHub's
  own docs (via Context7) state that per-job `$GITHUB_STEP_SUMMARY` writes are grouped onto one run's
  summary page in job-completion order. I did not independently confirm GitHub's Markdown renderer
  accepts the specific table syntax used (`|---:|` right-alignment row) beyond what the docs' own
  examples use (a plain bulleted list, a heading) — this is standard GFM table syntax and I have no
  reason to expect it renders differently, but it is one hop short of watching the real run page.
- **`gh issue view 1126` printing cleanly in this session, where `gh issue view 1131 --comments`
  printed nothing in #1131's own report's session** — both are the same `gh` binary in the same kind
  of shell; I did not chase why the behaviour differed between sessions (a TTY/pager quirk, per
  #1129's and #1131's own reports' characterisation), since it did not block this ticket either way.
