# wave 1 · lane 02 — /code-review fix round

**Branch** `riders/w1-lane02` · **worktree** `C:\Users\zhant\Desktop\clara-wt\636` · **tickets** #851, #858
**Reviewed head** `71722f5b` · **new head** `PENDING`
**Fixed point** `origin/main e7f0a10a` (merge-base `dd3f8f1d`)

Five findings arrived from `/code-review` (two JSON reports beside this file): three on the SPEC
lens (one major, two minor) and two on the STANDARDS lens (both major). Four are fixed with a
RED-first slice each; one (#858 AC3) is answered with evidence rather than code. Two `note`-level
findings are answered in place: one by correcting this lane's own final report, one by arguing the
shape stays.

## New commits, one slice each

| commit | ticket | finding | what it does |
|---|---|---|---|
| `69eb6e58` | #851 | STANDARDS S1 (major) | `playwright.config.ts` pins `testMatch: /.*\.spec\.ts$/`; new `e2e/spec-discovery.test.ts` holds it |
| `4d3e8dfc` | #851 | STANDARDS S2 (major) | the census reads an indirected `Password` locator, as its button half already did |
| `451c3be6` | #851 | SPEC S1 (major) | the two halves must land within 10 lines; `entry-faces-walk.spec.ts`'s false-positive exception deleted |
| `feb99839` | #851 | SPEC S3 (minor) | the anti-vacuity floor is derived from the real count (48, not 42) |

Diff against the reviewed head: `apps/web/e2e/README.md`, `apps/web/e2e/sign-in-census.test.ts`,
`apps/web/e2e/spec-discovery.test.ts` (new), `apps/web/playwright.config.ts`,
`apps/web/test/manifest.txt` — 196 insertions, 20 deletions. No `.spec.ts` browser walk was
touched; no migration; no frozen closure; `packages/db` and `packages/runtime` untouched.

---

## STANDARDS S1 (major, #851) — the node:test files were live Playwright specs · FIXED

**Reproduced first, and the review's consequence turned out to be worse than stated.**

`pnpm --filter @clara/web exec playwright test --list` (the filterless shape of the documented bare
`pnpm --filter @clara/web e2e`) printed raw TAP interleaved with Playwright's listing: `TAP version
13`, `ok 1 …` through `ok 35 - #851 · THE VACUITY CONTROL…` — all four `e2e/*.test.ts` files
executing inside the Playwright process because its stock `testMatch`
(`**/*.@(spec|test).?(c|m)[jt]s?(x)`) takes both suffixes and the config never narrowed it.

I then broke one census assertion on purpose (`files.length >= 9999`) and re-ran. The same run
printed `not ok 32 - #851 · no spec file reimplements the login form` — **and exited 0**. So the
review's mechanism is real but its stated consequence ("silently corrupts a green run's exit code")
is not what happens: Playwright calls `process.exit()` itself, which discards `node:test`'s pending
exit code. The failure was not mis-attributed — it was reported to **nobody**. Same result for a
`--grep` run that loads every file and runs no browser test (`EXIT=0`). Recorded as a correction to
the finding, not as a reason to leave it.

**Fix.** `apps/web/playwright.config.ts` now pins `testMatch: /.*\.spec\.ts$/`.

**RED first.** `e2e/spec-discovery.test.ts` cell 1 failed against the unmodified config on
`assert.ok(testMatch instanceof RegExp)` — "playwright.config.ts must narrow testMatch: its stock
default also matches this directory's node:test files" (2 cells, 0 pass / 2 fail). Green after the
config hunk: 2/2. Cell 2 is the vacuity control — Playwright's own default, re-typed from its
source as the oracle, is shown taking `sign-in-census.test.ts`, which the narrowed pattern drops.

**Proof on the real path.** After the fix the same `--list` run prints **zero** TAP lines and the
same `Total: 556 tests in 48 files` — the leak is closed and nothing was lost. It also closes the
leak for the two pre-existing files (`e2e-fixture-ownership.test.ts`, `mock-dispatch.test.ts`).

Docs: `apps/web/e2e/README.md` gains a "Two runners share this directory" paragraph.
Shared file: `apps/web/test/manifest.txt` gains one line at the sorted position
(`e2e/spec-discovery.test.ts`), `check-test-manifest.mjs` clean (482 files).

---

## STANDARDS S2 (major, #851) — the password half had no indirection reading · FIXED

`SIGN_IN_SUBMIT` was deliberately loose (it matches a *reference* to the submit button, because
`const button = page.getByRole(...); await button.click();` is a shape a real offender takes).
`PASSWORD_FILL` required `.fill(` to chain directly onto `getByLabel("Password")`. So:

```ts
const password = page.getByLabel("Password");
await password.fill("Clara-e2e-password-1!");
const submit = page.getByRole("button", { name: "Sign in" });
await submit.click();
```

drove the login form with the exact fixture password and the exact submit, in the *same* indirected
style the file's header argues for, and `reimplementsLoginForm` returned false.

**RED first.** The new vacuity case `an indirected Password locator is the same form` failed
against the unmodified detector (4 cells, 3 pass / 1 fail). Green after splitting the password half
into the locator fragment, the direct `.fill(` chain, and a BINDING arm that follows
`const|let|var <name> = … getByLabel(Password…)` to a later `<name>.fill(`: 4/4.

---

## SPEC S1 (major, #851) — the `entry-faces-walk.spec.ts` exception was a false positive · FIXED

**Confirmed independently.** At `dd3f8f1d` the old file-scoped detector matched 16 spec files.
Measuring the line gap between each file's Password fill and its "Sign in" submit:

| file | password-fill line | sign-in-submit line | gap |
|---|---|---|---|
| the fourteen folded walks + `reports-download-walk` | — | — | **1**, every one |
| `entry-faces-walk.spec.ts` | 87, 240 (both `/signup`, submitted with "Create account") | 125 (focus-only locator, never clicked) | **38** |

So that file never drove the login form; its `FORM_EXCEPTIONS` reason ("the login face is the
subject under test") described something it does not do, a genuine local sign-in added to it would
never have been seen, and the census's own control ("the signup form is a different form and is not
this gate's business") said the opposite of what the real file was tripping it on.

**Fix.** The two halves now carry line numbers and must land within `SAME_SIGN_IN_LINES` (10) of
each other — measured: every real offender put them 1 apart, the false positive 38.

**RED first.** The new vacuity case `a signup fill and a focus-only login button 30 lines apart are
two forms, not one sign-in` failed against the file-scoped detector (3 pass / 1 fail). After the
window the case passed **and cell 3 immediately went red**: `entry-faces-walk.spec.ts no longer
drives the login form — delete its FORM_EXCEPTIONS entry`. That is the list doing its job. Entry
deleted, README row deleted, 4/4. A companion case pins the window is not too tight: a real form
whose two acts are separated by the four-line wait paragraph every retired copy carried is still
caught.

**Re-confirmed against the cut point** with the NEW detector over all 48 spec files at `dd3f8f1d`:
**15 matches** — the fourteen genuine local sign-ins the fold retired, plus
`reports-download-walk.spec.ts`. `entry-faces-walk.spec.ts` is no longer among them and no real
offender was lost. At HEAD: **1 match**, the one honest exception. `FORM_EXCEPTIONS` is now exactly
the one file #804 itself named out of scope.

---

## SPEC S3 (minor, #851) — the stated spec-file count was wrong · FIXED

`ls -1 apps/web/e2e/*.spec.ts | wc -l` = **48** at HEAD, and `git ls-tree -r --name-only dd3f8f1d`
filtered to `.spec.ts` = **48** at the cut point. "42" was never the number, and a floor two below a
wrong count was eight files of slack. Floor raised `>= 40` → `>= 46`; both comments corrected to 48.

**Shown live, not asserted:** at `>= 49` the cell reds with `the census must actually see the suite
(found 48 spec files)` — the count reporting itself. Restored to 46, 4/4.

The same wrong figure in this lane's final report is corrected there: `35 of the 46 spec files that
run AxeBuilder.analyze()` do so without `settleForScan` (48 spec files in the suite). Counted this
session: 48 total, 46 run `AxeBuilder`, 11 of those use `settleForScan`, so 35 do not — the "35"
was right, only its denominator was wrong.

---

## SPEC S2 (minor, #858) — AC3 asks for three consecutive FULL-SUITE runs

BROWSER_EVIDENCE_PLACEHOLDER

---

## SPEC S4 (note, #851) — the record of what was surrendered was incomplete · FIXED IN THE REPORT

Verified at `dd3f8f1d` rather than taken on trust:

| retired local sign-in | its post-login wait | after the fold |
|---|---|---|
| `counterparty-identity-walk.spec.ts` | `{ timeout: 60_000 }` | `CELL_BUDGET.signIn`, 20 s |
| `staff-expense-claim-walk.spec.ts` | `CELL_BUDGET.base`, 30 s | 20 s |
| `trade-invoice-walk.spec.ts` | `CELL_BUDGET.base`, 30 s | 20 s |
| `knowledge-firm-walk.spec.ts` | none — Playwright's 5 s default | 20 s (strictly improved) |

`wave1-lane02-final.md` now says so, in the "one measurement deliberately given up" paragraph and in
follow-up 2, so the owner sees the full 60 s → 20 s span the shared helper has to absorb.

---

## STANDARDS S3 (note, #858) — the one-element array stays, and why

`const resized: OverlayWidths[] = []` with `expect(resized).toHaveLength(1)` asserts strictly more
than the suggested `let captured: OverlayWidths | null` with `expect(captured).not.toBeNull()`
would: it pins that the poll resolved on **exactly one** captured snapshot. A nullable variable
would silently accept a predicate that observed twice and hand the assertions the *last*
observation rather than the one the poll resolved on — which is the same class of check-then-act
slip #858 exists to remove. The review labels it optional and the shape carries its own argument in
a comment beside it. Left as is, deliberately.

---

## Sensitivity — every cell of #851 broken once, and restored byte for byte

The reviews raised no horizontal-slicing finding (STANDARDS: "the three commits are genuine
vertical slices … no horizontal red-battery commit"), but both majors were `test-quality`, so every
cell of this ticket was put to the same test: break the subject, watch the cell fail, restore.

| cell | break applied to the subject | result |
|---|---|---|
| `run-args` 1 (bare run builds) | `let build = false` in `run-args.mjs` | red 1, 2, 5 |
| `run-args` 2 (named spec forwards the historical list) | the `--` strip commented out | red 2, 3, 4 |
| `run-args` 3 + 4 (`--no-build` consumed) | `if (false)` on the flag arm | red 3, 4 |
| `run-args` 5 (look-alike is not the flag) | `arg.startsWith("--no-build")` | red 5 |
| `census` 1 (no spec reimplements the form) | a probe spec with a re-typed login form | red, naming `zz-census-probe.spec.ts` |
| `census` 2 (a declaration is a declared wrapper) | the same probe's `signInToProbe` | red, naming it in the declaring map |
| `census` 3 (the lists are live) | already red in the S1 slice, on the real `entry-faces` entry | red |
| `census` 4 (vacuity control) | already red twice, once per detector slice | red |
| `spec-discovery` 1 + 2 | the unmodified `playwright.config.ts` | red 1 and 2 |

`git status` clean after every restore; the three files re-run together afterwards: **11 tests, 11
pass, 0 fail**. `census` cell 2(b) (a wrapper must import the shared helper) has no file-level break
that does not edit a live walk mid-run; it is exercised at unit level by cell 4's three
`importsSharedSignIn` assertions (alias form true, other module false, no-sign-in import false).

---

## Gates

| gate | result |
|---|---|
| `e2e/spec-discovery.test.ts` (new) | **2 pass / 0 fail** |
| `e2e/sign-in-census.test.ts` | **4 pass / 0 fail** |
| `e2e/run-args.test.ts` (untouched, re-run) | **5 pass / 0 fail** |
| `apps/web` whole unit suite (`node scripts/run-tests.mjs`) | **4644 tests, 4642 pass, 0 fail, 2 skipped** |
| `apps/web/scripts/check-test-manifest.mjs` | 482 files, present once, in order |
| `pnpm typecheck` (root) | **exit 0** |
| `pnpm lint` (root) | **exit 0** |
| `playwright test --list` (filterless) | **zero TAP lines**, `Total: 556 tests in 48 files` |
| browser suite | BROWSER_GATE_PLACEHOLDER |

No Windows-only red from RIG.md appeared: the `thread-live-clarify.test.tsx` load flake did not
reproduce in the whole-suite run, and nothing in this lane touches `packages/db` or
`packages/runtime`.

## Docs updated in the same commits

- `apps/web/e2e/README.md` — the two-runner paragraph (S1), and the census section rewritten for the
  proximity rule, the indirected locator and the one-entry `FORM_EXCEPTIONS` table (S1/S2 spec).
- `apps/web/playwright.config.ts` — the `testMatch` hunk carries its own reason.
- `CONTEXT.md` untouched: no new domain vocabulary (`SAME_SIGN_IN_LINES` is a harness constant, not
  an accounting term).

## Successor contracts

None. Nothing in this round needed a change a frozen chat or Work tool would carry.

## Follow-ups worth filing

1. **`apps/web/e2e/README.md`'s coverage map says "the checked-in suite currently contains 25
   specs"** — it is 48, and the table below that sentence lists far more than 25 rows. Pre-existing
   on `main`, not introduced by this lane, and out of scope for #851; worth one line in whoever
   next edits that file.
2. **The other two `e2e/*.test.ts` files were leaking too.** `e2e-fixture-ownership.test.ts` and
   `mock-dispatch.test.ts` have been running inside every filterless Playwright invocation since
   they were written. The config fix closes it for them as well, but nobody was watching that
   channel; a lane that adds a `node:test` file to a Playwright `testDir` in another package should
   check for the same shape.
3. Follow-ups 1–3 in `wave1-lane02-final.md` still stand (the `settleForScan` drift, the
   `CELL_BUDGET.signIn` question — now with the 60 s figure — and `--no-build` in the wave recipe).

## Unverified

- No hosted evidence, none claimed.
- The 2026-09-15 idle-Mac measurements in #858's ticket are that report's, not re-measured here.
- `reports-download-walk.spec.ts` is still exercised only by its live-stack runner; its
  `FORM_EXCEPTIONS` entry is verified by the census reading the file, not by running that lane.
