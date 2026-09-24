# Riders wave 4 — integration gates, worker B (web unit + browser suites)

**Worktree** `C:\Users\zhant\Desktop\clara-wt\int2` · **branch** `integration/riders-w4`
**Head at start of my work** `fb1dae78a3db2c29025fb82c4c79cde89197f354`
**Head at finish** `fa64ecf5d9f514a75c3778fc10967ee5304a1d6d` — the integrated head moved twice while
this gate ran, both times with `apps/web` untouched, confirmed both times by `git diff --stat`:
- `fb1dae78a..fdb9ba135` — one docs-only commit (`docs: riders wave 4 lane, merge, rig,
  release-prep reports, the release runbook and preflight, the plan rules`). `git diff --stat
  fb1dae78a..fdb9ba135 -- apps/web` is empty.
- `fdb9ba135..fa64ecf5d` — eleven commits, all `packages/db` tests, `packages/runtime` lib/tests and
  `roles-bootstrap.sql` (the CI and gate-A collision fixes). `git diff --stat fdb9ba135..fa64ecf5d --
  apps/web` and `-- pnpm-lock.yaml package.json` are both empty.

**Build provenance.** `apps/web` is byte-identical between `fb1dae78a` (run 1's build head) and
`fa64ecf5d` (run 2's head, this report's finish head) — `git diff --stat fb1dae78a..fa64ecf5d --
apps/web` is empty. Run 1 built fresh at `fb1dae78a`; run 2 reused that exact build with
`--no-build` at `fa64ecf5d`, which is sound because nothing the build reads (`apps/web`, the
lockfile, `package.json`) moved between the two heads.

Playwright triple used for every browser-suite command below:
`CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3600 CLARA_E2E_NEXT_PORT=3601 CLARA_E2E_RUNTIME_PORT=3602`.

**Net result.** Fully green across every gate that isn't the browser suite. The browser suite ran
twice, whole runs, and produced exactly one red each time — a **different** cell each run, neither
reproducing in two isolated re-runs immediately after, both classified (b): a pre-existing,
load-sensitive timing/focus race, not owned by any wave-4 lane, not a regression this wave
introduced. No cell failed in both runs. All eight of the wave's own named browser walks pass
100% in both runs, byte-identical counts.

---

## Step 1 — the whole `apps/web` unit suite (once)

Command (from `apps/web`): `node scripts/run-tests.mjs`.

| when | duration | result |
|---|---|---|
| 2026-09-24T07:10:38Z → 07:12:53Z | 135.1 s | exit 0 — **5173 tests, 5171 pass, 0 fail, 2 skip** |

Matches the merger's own measured figure on this head exactly (5,173 tests, 5,171 pass, 2 skipped,
0 fail).

---

## Step 4 — typecheck, lint

| check | when | result |
|---|---|---|
| `pnpm --filter @clara/web typecheck` | 2026-09-24T07:13:32Z | exit 0, `tsc --noEmit`, no diagnostics |
| `CI=true GITHUB_ACTIONS=true pnpm --filter @clara/web lint` | 2026-09-24T07:13:55Z → 07:14:20Z (25 s) | exit 0 — eslint, token-contrast census, test-manifest + selftest, message-keys + selftest, ui-add-guard selftest all PASS |

---

## Step 4b — the e2e censuses, the contrast census, and the web pins corpus cell

Run individually for exact counts, since Node's `--test` TAP output is not tagged by source file in
a whole-suite run. Run once after run 1 (on `fb1dae78a`/`fdb9ba135`) and once more after run 2 (on
`fa64ecf5d`), per the task's instruction; both measurements are byte-identical.

| file | after run 1 | after run 2 |
|---|---|---|
| `apps/web/e2e/cell-budget-census.test.ts` | 5/5 pass | 5/5 pass |
| `apps/web/e2e/e2e-fixture-ownership.test.ts` | 44/44 pass | 44/44 pass |
| `apps/web/e2e/settle-before-scan-census.test.ts` | 4/4 pass | 4/4 pass |
| `apps/web/e2e/sign-in-census.test.ts` | 4/4 pass | 4/4 pass |
| `apps/web/e2e/spec-discovery.test.ts` | 4/4 pass | 4/4 pass |
| `apps/web/tests/firm-scope-db-pins.test.ts` (the web pins corpus cell, backed by `firm-scope-db-pins.corpus.ts`) | 22/22 pass (3 suites) | 22/22 pass (3 suites) |
| `apps/web/tests/token-contrast.test.ts` (the contrast census; also re-asserted inside the lint chain above) | 20/20 pass (4 suites) | 20/20 pass (4 suites) |

---

## Step 2 — the whole browser suite, both runs

### Run 1 — `pnpm --filter @clara/web e2e` (with build, head `fb1dae78a`)

**2026-09-24T07:13:56Z → 07:39:17Z, wall 23.9m Playwright-reported.** Build succeeded first
attempt, no `0xc0000142` panic.

| total | passed | failed | skipped |
|---|---|---|---|
| 596 | 588 | 1 | 7 |

### Run 2 — `pnpm --filter @clara/web e2e -- --no-build` (head `fa64ecf5d`, same build as run 1)

**2026-09-24T09:44:03Z → 10:00:03Z, wall 16.1m Playwright-reported.** Faster than run 1, as
expected for a `--no-build` run.

| total | passed | failed | skipped |
|---|---|---|---|
| 596 | 588 | 1 | 7 |

### Side by side

| | run 1 | run 2 |
|---|---|---|
| total | 596 | 596 |
| passed | 588 | 588 |
| failed | 1 | 1 |
| skipped | 7 | 7 |
| the one red | `work-question-walk.spec.ts:285` (B4, focus race) | `entry-faces-walk.spec.ts:184` (#622, recovery-redirect race) |

**No cell failed in both runs.** Each run's own red passed clean in the OTHER run (`work-question-
walk.spec.ts:285` is `ok 591` in run 2; `entry-faces-walk.spec.ts:184` is present and un-omitted —
i.e. passing — among run 1's `ok` lines for that file, run 1 having zero reds in that file at all).

### The wave's own browser walks, from both whole runs

| walk (file) | ticket(s) | run 1 | run 2 |
|---|---|---|---|
| `prepayments-walk.spec.ts` | #939, #940, #941 | **8/8 pass** | **8/8 pass** |
| `deferred-revenue-walk.spec.ts` | lane 04 fix rounds | **3/3 pass** | **3/3 pass** |
| `payroll-settlement-walk.spec.ts` | #947 | **2/2 pass** | **2/2 pass** |
| `tenancy-rent-plan-walk.spec.ts` | #949 | **2/2 pass** | **2/2 pass** |
| `staff-expense-claim-walk.spec.ts` | #930, #931 | **14/14 pass** | **14/14 pass** |
| `members-invite-walk.spec.ts` (the invite-preview signed-out walk) | #871 | **7/7 pass** | **7/7 pass** |
| `firm-setup-walk.spec.ts` (the firm-setup walk) | #1032 | **5/5 pass** | **5/5 pass** |
| `knowledge-walk.spec.ts` (the knowledge walk — not itself touched this wave; #1031 is a pure-DB ticket with no browser leg, so this file's green run is a regression check, not new coverage) | #1031 (DB-only) | **27/27 pass** | **27/27 pass** |

Byte-identical counts across both runs, zero reds in any of the eight, in either run.

`knowledge-firm-walk.spec.ts` (14/14 both runs) and `work-knowledge-walk.spec.ts` (9/9 both runs)
also passed clean — neither is touched this wave, checked as neighbours of the "knowledge" name.

`accrual-walk.spec.ts` (touched this wave, #937/#938/#942, not separately named in the task but
included since it changed): **20/20 pass, both runs.**

---

## Step 3 — every red, classified

### RED (run 1 only) — `work-question-walk.spec.ts:285`, "B4: the SAME question is answered from Needs-you, and the row leaves without dumping focus"

**Observed once**, run 1 (2026-09-24T07:13:56Z build run):
```
Error: focus was dumped onto the document body when the row disappeared
expect(received).not.toBe(expected) // Object.is equality
Expected: not "BODY"
```

**Passed clean in run 2** (`ok 591`, 5.7s) — did not reproduce on the second whole run.

**Re-run alone, twice**, immediately after run 1
(`CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3600 CLARA_E2E_NEXT_PORT=3601
CLARA_E2E_RUNTIME_PORT=3602 pnpm --filter @clara/web e2e -- --no-build work-question-walk`):
- Attempt 1 — 2026-09-24T09:38:38Z → 09:40:29Z (1.8 m) — **14/14 pass**, this cell clean.
- Attempt 2 — 2026-09-24T09:40:35Z → 09:41:46Z (1.2 m) — **14/14 pass**, this cell clean again.

**Not a cell-level timeout.** `expect(focused.tag).not.toBe("BODY")` is a boolean/string-equality
assertion on a sampled DOM-focus target after a list row's removal animation — the same shape wave
3's gate B (`wave3-integration-gates-B.md`, RED 2) already classified for `responsive-shell-walk`'s
`#736`: a state-transition/focus-landing race sampled mid-removal, no `TimeoutError` anywhere in the
trace.

**Ownership check, against this wave's own diff rather than assumed:**
`work-question-walk.spec.ts` itself is untouched this wave (`git log
26ada6131..fa64ecf5d -- apps/web/e2e/work-question-walk.spec.ts` — empty). The form component it
drives, `work-question-form.tsx`, WAS touched (#933, +46/-1 lines) — but the diff is entirely about
seeding a saved/proposed answer draft and rendering one new, purely additive `<ProposalNote>` block
inside the question heading. It touches neither the Needs-you list, its row-removal transition, nor
any focus-management code — nothing in the diff is a plausible cause for a focus target landing on
`<body>` after a row leaves.

**Prior history for this exact file:** `wave2-integration-gates-B.md` and `wave2-lane09-fix.md`
already name `work-question-walk.spec.ts` among the walks "most directly" exposed to load-sensitive
flakes under host contention in this rig; `wave3-integration-gates-B.md` reported the file fully
clean across both of its runs. This is the file's first observed red across three prior waves of
gate runs, and it did not reproduce in run 2 or in two clean isolated re-runs.

**Classification: (b) — a load-sensitive, non-deterministic focus-landing race, not owned by any
wave-4 lane and not reproducible off the loaded host.** No fix applied — nothing in this wave's diff
touches the subject under test, and the failing assertion has no timeout to size a budget against.
Worth a small ticket of its own (assert the row's removal completed AND focus landed on the Needs-you
heading, rather than sampling focus at one moment), same remedy shape as wave 3's `#736` follow-up.

### RED (run 2 only) — `entry-faces-walk.spec.ts:184`, "recovery preserves the return target end to end: forgot password -> reset -> lands on next (#622)"

**Observed once**, run 2 (2026-09-24T09:44:03Z `--no-build` run):
```
Error: expect(page).toHaveURL(expected) failed
Expected pattern: /\/work\?view=needs-you$/
Received string:  "https://127.0.0.1:3600/auth/recover/password?next=%2Fwork%3Fview%3Dneeds-you"
Timeout: 5000ms
    201 |
    202 |   await page.getByRole("link", { name: "Continue to ClaraBook" }).click();
  > 203 |   await expect(page).toHaveURL(/\/work\?view=needs-you$/);
```
The click on "Continue to ClaraBook" had not yet completed its client-side redirect to the saved
`next=` target within the 5-second assertion window; the URL was still the intermediate reset-
password page.

**Passed clean in run 1** — present among run 1's `ok` lines for `entry-faces-walk.spec.ts` (the
file had zero reds in run 1), so this exact cell ran and passed in run 1.

**Re-run alone, twice**, immediately after run 2
(`CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3600 CLARA_E2E_NEXT_PORT=3601
CLARA_E2E_RUNTIME_PORT=3602 pnpm --filter @clara/web e2e -- --no-build entry-faces-walk`):
- Attempt 1 — 2026-09-24T16:51:39Z → 16:52:21Z (36.9 s) — **14/14 pass**, this cell clean, completing
  in 904ms (well under the 5000ms window that tripped under contention).
- Attempt 2 — 2026-09-24T16:52:27Z → 16:52:36Z (7.9 s) — **14/14 pass**, this cell clean again.

**Not a cell-level timeout in the budget sense** — the assertion carries an explicit 5000ms
Playwright default and the redirect it waits on is a real client-side navigation
(forgot-password → reset → "Continue to ClaraBook" → the saved `next=` target), so this is exactly
the class of read that gets slower, not wrong, under host contention: two other whole-suite
processes (the sibling gate worker's database/runtime work) were running concurrently on this same
host during run 2's window.

**Ownership check, against this wave's own diff rather than assumed:** `entry-faces-walk.spec.ts`
and `entry-faces-mock.mjs` are both untouched this wave (`git log 26ada6131..fa64ecf5d -- apps/web/
e2e/entry-faces-walk.spec.ts apps/web/e2e/entry-faces-mock.mjs` — empty), and no file under
`apps/web/app/auth/**` or `apps/web/components/auth/**` changed either (`git diff --stat
26ada6131..fa64ecf5d` — empty for both globs). Nothing in this wave's diff touches the recovery
flow, the redirect logic, or anything this cell exercises.

**Prior history:** no gate report from wave 1, 2 or 3 names `entry-faces-walk.spec.ts` or `#622` as
a red. This is the file's first observed failure across four waves of gate runs (including this
one), and it did not reproduce in run 1 or in two clean isolated re-runs.

**Classification: (b) — a load-sensitive timing race on a real client-side navigation, not owned by
any wave-4 lane and not reproducible off the loaded host.** No fix applied — nothing in this wave's
diff touches the subject under test. Unlike the B4 red above, this one's assertion DOES carry a
timeout (Playwright's default 5000ms `toHaveURL`), so it is a genuine candidate for a slightly wider
assertion timeout on this one navigation if it recurs — but a single observation under a
demonstrably loaded host, clean everywhere else including the very next run, does not meet this
gate's bar for a fix.

---

## Anything unverified

- Both reds are each observed exactly once, in different runs, and neither reproduced in its own
  two isolated re-runs. Whether either would ever reproduce on a quiet, single-suite host is
  unverified — every observation of both, across every wave, ran under multi-lane host contention
  (this session's own runs overlapped with a sibling gate worker's database/runtime suites in the
  same worktree, per the task's own note that another gate worker runs database work in parallel).
- No third whole-suite run was performed; the task asked for the suite run twice, and it was run
  exactly twice, both whole runs, not filtered.
