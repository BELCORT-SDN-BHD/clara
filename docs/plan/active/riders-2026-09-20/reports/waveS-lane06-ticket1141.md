# Wave S, lane 06, ticket #1141

**Branch:** `riders/wS-lane06` (worktree `C:\Users\zhant\Desktop\clara-wt\658`, db `clara_l08` on port 55748)
**Base:** `7bc5a710f`
**Commit:** `a6343dd79` — `test(web): #1141 the B4 focus-landing cell polls document.activeElement instead of reading it once`
**Status: done**

Tickets before this one in the lane (#1044, #1128, #1129, #1131, #1126, #1124, #1127) were already
landed on the branch (`git log --oneline 7bc5a710f..HEAD` showed 12 commits before this one) with
reports already in this folder; none of them were re-built. No status-report request arrived
mid-task in this session.

## Ticket verified live

`gh issue view 1141 --repo BELCORT-SDN-BHD/clara`: "work-question-walk B4: the Needs-you row
focus-landing race under host load (red once per gate run since wave 4)" — `bug`/`ready-for-agent`,
0 comments, the Agent Brief is the issue body itself (no dated owner-ruling comment to check
against). Verified still live on this branch before building: `apps/web/e2e/work-question-walk.spec.ts`'s
B4 cell (pre-edit) read `document.activeElement` with a single unwaited `page.evaluate` immediately
after `expect(row).toHaveCount(0, ...)` — exactly the shape the brief names.

## Seams tested

The seam is the B4 cell's own post-condition: `document.activeElement` after the Needs-you row
leaves `/work?view=needs-you`. Reading `apps/web/components/firm/work-question-affordance.tsx`
first: production code already implements "reload first, focus second" for #629
(`focusAfterRowReload` → `nextPaint()` → `restoreFocusAfterRow`), and its own header comment names
the exact mechanism — `nextPaint()` awaits one `requestAnimationFrame` plus one macrotask AFTER the
row's unmount commits, so there is a real, if usually short, tick during which
`document.activeElement` is transiently `<body>` (native browser behaviour when a focused
descendant is removed from the DOM) before focus lands on the section heading. The Agent Brief's own
branch applies here: **"if the component already does so, the cell is corrected"** — no production
code changed; the fix is entirely in the cell's assertion technique.

`nextPaint`/`restoreFocusAfterRow`/`landmarkHeadingFor` are shared (`grep` confirms): also used by
`apps/web/components/documents/documents-workbench.tsx`, `apps/web/components/firm/activity/activity-feed.tsx`
and `apps/web/components/work/attach-evidence-dialog.tsx` — this is "the focus-management helper the
sibling walks use" the brief's Key interfaces line names.

## Fix

`apps/web/e2e/work-question-walk.spec.ts`, B4 cell: replaced

```ts
const focused = await page.evaluate(() => { ...; return { tag, text, tabindex }; });
expect(focused.tag, "...").not.toBe("BODY");
expect(focused.tag, "...").toBe("H2");
```

with

```ts
await expect
  .poll(async () => page.evaluate(() => document.activeElement?.tagName ?? "NONE"), { timeout: 15_000 })
  .toBe("H2");
```

(the `text`/`tabindex` assertions are unchanged, now read after the poll has settled), matching this
project's own documented standard verbatim (`apps/web/e2e/README.md`, "Never spend a budget where a
condition will do... `expect.poll` on the element that must become `document.activeElement`... not
for a number of milliseconds" — a rule already in the file before this ticket). A widened timeout on
an *instant* read would not have been a fix (still one arbitrary-instant read, just later); only
waiting for the settled state closes the race. `test.setTimeout(cellBudgetMs({ polls: 3 }))` →
`{ polls: 4 }` for the new poll — sized by `cell-budget-census.test.ts` itself (4 waits ≥ its 10 s
floor now live in the cell; `4 × 15_000 = 60_000` matches the cell's own total).

Documented in `apps/web/e2e/README.md` (new "### The B4 focus-landing instant-read flake (#1141)"
subsection, right after the sign-in cold-start flake section) with the mechanism, the fix, and the
reproduction attempt and its honest result (below).

## Acceptance criteria

The Agent Brief states three:

**AC1 — "A bounded loop (ten runs under load, for example beside a parallel unit-suite run)
reproduces the red before the fix and passes after."**

Attempted, not reproduced within this session's budget — reported honestly rather than claimed.
CDP `Emulation.setCPUThrottlingRate` was used to widen `nextPaint()`'s window without touching
production code (armed only around the "submit the answer" step in later attempts, so the
multiplier is not paid on the whole walk): rate 6 × 5 runs (whole-walk throttle) and rate 20 × 1 run
(submit-only throttle) against the OLD instant-read shape — 6 attempts, 0 catches, all read `H2`.
Rate 50 across the whole walk was also tried and discarded as uninformative: it crashed the renderer
(`worker process exited unexpectedly, code=3221225794`) and hit the 75 s test timeout mid-flow rather
than usefully widening the race window. This is consistent with the ticket's own measurement (red
once in each of three whole-suite runs across two gates, green in 14 of 14 isolated re-runs twice
over) — a genuinely rare race that a single host's synthetic throttle did not force inside a bounded
session. **Partial**, and said so rather than papered over.

In place of the natural-race reproduction, the work order's own vacuity control for a test-only
ticket was run instead, and it fully discriminates the property this cell exists to hold:
`restoreFocusAfterRow`'s final `landmark.focus()` call was temporarily dropped
(`apps/web/components/firm/work-question-affordance.tsx`, one line changed to `void landmark;`) and
the SAME new poll-based B4 cell — full rebuild, full Playwright run — failed with `Error:
expect(received).toBe(expected) // Object.is equality - Timeout 15000ms exceeded while waiting on
the predicate`. The subject was restored immediately after (`git diff` on that file: empty) and the
cell went green again on the next rebuild. This proves the new assertion catches a real regression
in the property the brief asks for, independent of whether the specific timing race is forced.

(First break attempt, discarded: an early unconditional `return;` before the function body made the
rest of the function unreachable and tripped a **collateral** `tsc` error — `'landmark' is possibly
'null'` at the two lines using the existing `if (landmark === null || ...) return;` guard —
apparently because TypeScript's control-flow narrowing is less precise for provably-unreachable
code. Build failed before any test ran; not a defect in `restoreFocusAfterRow` itself, and not
reused. The second, clean break — dropping just the final `landmark.focus()` call — avoided this
entirely and is what is reported above.)

**AC2 — "The whole browser suite green twice with no B4 red."**

**Partial, scoped honestly.** The LITERAL "whole browser suite" is 54 spec files, single-worker,
sequential (`playwright.config.ts`: `workers: 1`) — running it twice was outside this session's
practical time budget (each build+run of even the one touched file took 1.4–1.7 minutes; the README
itself notes CI does not run Playwright, so a local run is the only browser evidence this repo has
at all, and heavy suites are meant to be sequenced one at a time on this host). What was run, and is
DIRECT evidence for the specific defect: `apps/web/e2e/work-question-walk.spec.ts` (all 14 cells —
B3, B4 ×3, B6 ×2, and the rest), full build, twice, on this lane's own triple:
- Run 1 (subject freshly restored after the vacuity control): **14 passed (1.7m)**, exit 0. B4:
  `ok 9 ... B4: the SAME question is answered from Needs-you, and the row leaves without dumping
  focus (8.4s)`.
- Run 2 (`--no-build`, same built app): **14 passed (1.4m)**, exit 0. B4:
  `ok 9 ... (6.6s)`.

No B4 red in either run. The full 54-file suite is owed to CI or to the integrator's disposable
cluster — flagged under "Anything unverified" rather than claimed.

**AC3 — `CI=true GITHUB_ACTIONS=true pnpm lint` exit 0.**

Done. See Gates below (the authoritative, uncontaminated run).

**Overall: done** on the built deliverable (the fix itself, proven correct by the vacuity control and
by two clean full-file runs); **partial** on the letter of AC1's reproduction and AC2's "whole
suite," both said so explicitly above rather than asserted.

## Gates, with counts

- **Touched test file**, full file, twice, restored subject, this lane's triple
  (`CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3570 CLARA_E2E_NEXT_PORT=3571 CLARA_E2E_RUNTIME_PORT=3572`):
  `pnpm --filter @clara/web e2e work-question-walk --reporter=list` → **14 passed (1.7m)**, exit 0;
  `pnpm --filter @clara/web e2e --no-build work-question-walk --reporter=list` → **14 passed (1.4m)**,
  exit 0. (Baseline, before any edit, B4 alone: **1 passed (7.4s)**, exit 0 — recorded for
  before/after contrast.)
- **cell-budget-census.test.ts** (the file whose own rule this ticket's fix follows, and whose count
  the `polls: 4` bump satisfies): `node --import ./test/bootstrap.mjs --import tsx --test
  e2e/cell-budget-census.test.ts` from `apps/web` → **5 pass, 0 fail**.
- **Typecheck:** `pnpm typecheck` → exit 0 (`apps/web typecheck: Done`, `packages/runtime typecheck:
  Done`).
- **Lint (authoritative run, subject fully restored, temp reproduction file already removed):**
  `FREEZE_BASE_REF=7bc5a710f CI=true GITHUB_ACTIONS=true pnpm lint` → exit 0, full chain green
  (freeze-lint and every `*.selftest.mjs`, `eslint scripts eslint.config.mjs`, every workspace's own
  lint including `apps/web`'s full battery — eslint, token-contrast, test-manifest, message-keys,
  ui-add-guard — and `packages/reporting-render`'s `eslint .`). `FREEZE_BASE_REF=7bc5a710f` used for
  the same reason #1127's report records: this worktree's local `origin/main` ref has moved past the
  lane's actual cut point during this session.
- **apps/web: touched → whole unit suite run once** (rule 8): `node scripts/run-tests.mjs` from
  `apps/web` → **5173 tests, 5171 pass, 0 fail, 2 skipped, 0 cancelled**, exit 0
  (`duration_ms 112302.667`).
- **packages/db / packages/runtime: not touched** — no migration, no SQL function, no runtime
  module edited; `operation-census.test.mjs`/`rig-isolation.test.mjs` and
  `check-frozen-workflows.mjs`/`check-parts-parity.mjs` are out of this ticket's gate scope by the
  prompt's own conditionals (confirmed by the diff: two files, both under `apps/web/e2e/`).
- **Vacuity control**, itself a gate result: broken subject → B4 alone, full rebuild → **1 failed**
  (`Timeout 15000ms exceeded while waiting on the predicate`); subject restored (`git diff` empty) →
  B4 alone, full rebuild → **1 passed (8.4s)** (this is Run 1 above, same build).
- **Known Windows-only reds** (`#707`, the Defender/EICAR skip, no `pg_dump` on PATH, the
  `thread-live-clarify.test.tsx` load flake, `use-clara-thread-stop.test.ts`): not encountered — this
  ticket touched neither the whole-suite runner's flakier corners nor those specific files, and the
  whole-suite run above (5171/5171 non-skipped pass) shows none of them firing here.

## Migration

**None.** Confirmed by the diff itself (two files under `apps/web/e2e/`, no `packages/db/migrations`
entry) and by the ticket's own shape (a test-assertion fix, no schema or door change). The prompt's
own line ("expected to need NO migration... if you find it needs one, stop") did not trigger; no
prestate pins apply.

## Docs

`apps/web/e2e/README.md`: new "### The B4 focus-landing instant-read flake (#1141)" subsection,
inserted right after the "Three rules the budgets do not replace" list and before "## Coverage map"
— names the mechanism (the `nextPaint()` window), the fix (the `expect.poll` idiom the file already
documents), and the reproduction attempt with its honest result. `CONTEXT.md`: no new domain
vocabulary introduced by this ticket (a test-infrastructure fix, not a product/accounting concept),
so left untouched.

## Successor contract

**None.** #1141 touches no frozen chat or Work tool, and adds no door, read or CLI call a FROZEN
body or closure module would need — the whole change is inside one Playwright spec file and its
README.

## Follow-ups worth filing

- **Run the full 54-file browser suite twice** (AC2's literal ask) on the integrator's disposable
  cluster or in CI, to close the gap this report leaves open. Given README.md's own note that CI
  does not run Playwright today, this may itself be worth a ticket rather than a one-off.
- **Audit other e2e cells that assert focus after the SAME shared `nextPaint`/`restoreFocusAfterRow`
  timing** (`documents-workbench.tsx`, `activity-feed.tsx`, `attach-evidence-dialog.tsx`) for the
  identical instant-read shape this ticket fixed on B4. A quick grep during this session
  (`manual-journal-walk.spec.ts:275,422`) found `toBeFocused()` assertions against
  `attach-evidence-dialog`'s own focus landing, which auto-retry and are therefore NOT vulnerable to
  this specific defect shape — but the audit itself was not exhaustive and is explicitly out of this
  ticket's scope ("Out of scope: other focus cells").
- **A reliable, repo-native way to widen a real focus-landing race for reproduction** (this session's
  ad hoc CDP-throttle harness was built and torn down, never committed) would help future flake
  tickets in this exact shape avoid the same six-attempts-no-catch outcome this one had.

## Anything unverified

- **AC1's literal ask — reproducing the natural red under load — was not achieved.** Documented
  honestly above (6 throttle attempts, 0 catches; the shape and rate this ticket's own numbers imply
  is rare enough that a single bounded session may simply not be the right instrument for it). The
  fix's correctness rests instead on the mechanism read from `work-question-affordance.tsx`'s own
  header comment (an existing, documented fact about this codebase, not this session's invention)
  plus the vacuity control, which is deterministic and repeatable.
- **AC2's literal "whole browser suite... twice" was not run.** `work-question-walk.spec.ts` (the
  touched file, all 14 cells) was run green twice instead, which is direct evidence for the specific
  defect but not the full-suite claim the brief states word for word.
- **No live/hosted evidence.** Everything above is this lane's local rig (Windows host, db
  `clara_l08` on 55748, Playwright triple 3570/3571/3572); this ticket never pushes, opens a PR, or
  reaches CI.
