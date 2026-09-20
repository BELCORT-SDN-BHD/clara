# Wave 2 riders — integration gate worker B

Worktree: `C:\Users\zhant\Desktop\clara-wt\int2`, branch `integration/riders-w2`.
Start head: `0968b5287e82657dbb818dce1437d24c43038a17` (nine wave-2 lane branches — 01 to 08 and 10 —
merged onto the integrated wave-1 head, plus seven `fix(integration)` commits by gate worker A on the
database side; lane 09 not merged this session). Every Bash command prefixed with
`export PATH="/c/Users/zhant/AppData/Local/pnpm:$PATH"` and run from the worktree (or `apps/web`
inside it), Node v22.23.2 confirmed.

Scope: the whole `apps/web` unit suite once, the whole browser suite once with the dedicated triple
`CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3620 CLARA_E2E_NEXT_PORT=3621 CLARA_E2E_RUNTIME_PORT=3622`,
then `pnpm --filter @clara/web typecheck` and `CI=true GITHUB_ACTIONS=true pnpm lint`.

**Final head: unchanged, `0968b5287e82657dbb818dce1437d24c43038a17`.** No commit was made — both reds
found (one per suite) were investigated, re-run alone twice each, and classified **(b)**: neither is
an integration collision nor a wave-2 lane defect, and both fall inside this task's explicit
"known, do not fix" set. No test was weakened or deleted. Working tree clean apart from
git-ignored build/test artefacts (`apps/web/.next/`, `apps/web/.wrangler/`, `apps/web/e2e/.artifacts/`,
`apps/web/e2e/.runtime/`).

| gate | result |
|---|---|
| `apps/web` whole unit suite (`node scripts/run-tests.mjs`) | 4819 tests / 4816 pass / **1 fail** / 2 skip, 75s — the 1 fail is a pre-existing timing flake (b), re-run clean 2/2 alone |
| `apps/web` browser suite (`pnpm --filter @clara/web e2e`, full triple) | 568 tests / 560 pass / **1 fail** / 7 skip, 14m47s wall — the 1 fail is the named pre-existing red #1017 (b), reproduced 2/2 alone |
| `pnpm --filter @clara/web typecheck` | PASS, exit 0, 19s |
| `CI=true GITHUB_ACTIONS=true pnpm lint` | PASS, exit 0, 41s (whole repo: apps/web + packages/reporting-render, etc.) |
| `git status` | clean except git-ignored build/e2e artefacts |

---

## Step 1 — the whole `apps/web` unit suite

Command (from `apps/web`, matching `package.json`'s `"test"` script and the README):
`node scripts/run-tests.mjs`.

**Run 1** — 2026-09-20T13:02:07Z → 13:03:22Z, **75s**, exit 1 (RED).
`tests 4819, suites 138, pass 4816, fail 1, skipped 2`.

One failure: `components/documents/documents-workbench-refresh.test.tsx` —
**"[633]: an UNSETTLED receipt keeps a bounded watch and says so; the poll's budget is finite"**.

```
error: 'the poll must issue SOME read while a row is still moving'
expected: true, actual: false
```

**What the cell waits on.** The cell mounts `DocumentsWorkbench` with a receipt stuck at
`status: "verifying"` (never settles) and the default `FAST_POLL` timing
(`{ baseDelayMs: 0, maxDelayMs: 0 }`), then calls `await h.settle()` — a real
`act(async () => { await new Promise((r) => setTimeout(r, 0)); })` — **40 times**, and asserts the
poll (`lib/documents/use-settle-poll.ts`'s `useSettlePoll`) issued at least one extra
`document_intakes_visible` read in that window. The poll itself schedules its own tick via a real
`setTimeout(run, schedule(ticks))` (also 0ms under `FAST_POLL`). Both the test's 40 macrotask ticks
and the poll's own tick are real timers racing each other in the same event loop; under whatever load
this Node process was carrying by test #652 of a 4819-test run, zero of the 40 ticks landed after the
poll's own timer fired.

**Re-run alone** (`node --import ./test/bootstrap.mjs --import tsx --test
components/documents/documents-workbench-refresh.test.tsx`):
attempt 1 — 13:03:38Z→13:03:45Z, **9/9 pass** (6.7s); attempt 2 — 13:03:50Z→13:03:56Z, **9/9 pass**
(6.5s). Both clean, including this exact cell.

**Ownership check (wave-2-change-reverted, done by inspection since a revert-and-rerun is not
cheap mid-suite).** `git log` on the three files this cell exercises:

- `components/documents/documents-workbench-refresh.test.tsx` and the `use-settle-poll.ts` mechanism
  and its test both date from `#633` on `integration/wave-2026-09-15` — a wave that predates wave 1,
  let alone wave 2.
- `components/documents/documents-workbench.tsx` (the component under test) has exactly two wave-2
  touches, both from lane 01's `#904` (`ed85beea1`, `981d160a0`): a one-line
  `settlePoll={settlePollOptions}` prop-forward into the *unrelated* `DocumentDetail` panel, and a
  type-only `Pick<SettlePollOptions, …>` refactor of the prop's declared shape. Neither line changes
  the receipts-poll code path (`document_intakes_visible`, `loadIntakeReceipts`/`refreshIntakeReceipts`)
  this cell reads. `git show ed85beea1 -- .../documents-workbench.tsx` and
  `git show 981d160a0 -- .../documents-workbench.tsx` (both quoted in full during triage) confirm this.
- `#904`'s own second commit message independently documents this exact failure *class* — "a fixed
  settle-count loop was flaky under the full documents/ directory run (163 tests sharing one process's
  timer queue)" — and fixes it in a **sibling** file
  (`document-detail-live-refresh.test.tsx`, switched to a deadline-based `settleUntil` helper) without
  touching this file's still-fixed-count idiom.

**Classification: (b) pre-existing timing flake, not owned by any wave-2 lane.** The poll mechanism,
the test file, and its fixed-tick-count design all predate wave 2; wave 2's only touches to the
component under test are inert for this code path; and the codebase's own commit history already
names this exact design pattern ("fixed settle-count loop … flaky under full-suite … timer queue") as
a known hazard, fixed elsewhere but not here. No fix applied — this is a pre-existing test-design
smell, not an integration collision or a lane defect, and out of this gate's minimal-fix mandate. No
test was weakened or deleted. Since no fix was applied, the unit suite was not re-run a second time
(the instruction to re-run the whole suite applies only after a fix).

## Step 2 — the whole browser suite, once

Command: `CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3620 CLARA_E2E_NEXT_PORT=3621
CLARA_E2E_RUNTIME_PORT=3622 pnpm --filter @clara/web e2e`, from the worktree root, no spec filter.

**Run** — 2026-09-20T13:06:17Z → 13:21:04Z, **14m47s** wall, `pnpm` exit 1 (one Playwright failure).
Build (`next build`) succeeded on the first attempt — no `0xc0000142`/`0xC0000409` panic, no retry
needed. Playwright reported **568 tests, 1 worker, 1 failed, 7 skipped, 560 passed (14.3m)**.

One failure: `e2e/document-correction-walk.spec.ts:386` — **"#646 — the shape of the faces > axe:
each of the three routed views has no WCAG A/AA violations"**.

```
color-contrast, 2 nodes — the currently-selected document row
<tr class="… hover:bg-muted/50 … cursor-pointer bg-muted" role="button" aria-current="true">
measured 4.36 (bgColor #f5f6f4, fgColor #6c7575) vs the 4.5:1 AA threshold
```

This is **exactly** the pre-existing red named in this task's brief and in wave 1's own gate report
(`wave1-integration-gates-B.md`) as **#1017** — same file, same line, same cell, same row identity,
same background/foreground token pair, same failing rule (`color-contrast`).

**Re-run alone twice** (`pnpm --filter @clara/web e2e -- --no-build document-correction-walk` — a
repeat measurement of unchanged code, per `e2e/README.md`'s `--no-build` guidance):

- Attempt 1 — 13:21:47Z→13:22:24Z (37s), **same cell failed again**: `1 failed, 14 passed (36.1s)`,
  contrast now measured **4.49** (bgColor `#f5f6f4`, fgColor `#6a7373`).
- Attempt 2 — 13:22:42Z→13:23:21Z (39s), **same cell failed again**: `1 failed, 14 passed (37.0s)`,
  contrast **4.49** again, same colors.

Unlike wave 1's occurrence (which passed clean both times in isolation and only reproduced under a
concurrent-suite host load), this run reproduced **deterministically in isolation, twice**, at a
contrast value (4.49) different from — but just as marginal against the 4.5:1 threshold as — the
full-suite run's 4.36. This is the signature of sub-pixel/anti-aliasing rendering variance on a
borderline token pair, not a step-function code regression: the ratio sits within 0.01–0.14 of passing
in every observed measurement, on the same two hex colors, on the same element.

**Ownership check.** None of the three places that could explain this row's rendering were touched by
any wave-2 lane:

- `components/documents/filed-document-list.tsx` (renders the row:
  `cn("cursor-pointer", selectedId === document.id && "bg-muted")`) — last touched by `ce81df2a6`
  (rider #719), pre-wave-2.
- `app/globals.css` (defines the `--muted`/`--muted-foreground` tokens) — last touched by `3d7287700`
  (#626), pre-wave-2.
- `e2e/document-correction-walk.spec.ts` itself — last touched by `c5560a5b7` (#851), pre-wave-2.

The cell also has no `settleForScan()` call before its `new AxeBuilder({ page }).analyze()` —
`e2e/README.md`'s named house guard against exactly this class of transient-paint-state contamination
before a scan — matching wave 1's own root-cause note for the same ticket.

**Classification: (b) known pre-existing red, ticket #1017**, explicitly named in this task's brief as
one to recognize and not "fix." No fix applied (this task's ticket is not #1017), and per instruction
a pre-existing/known red does not get a three-run confirmation the way a first-time integration
collision would — two isolated re-runs both reproduced the same named defect, which is sufficient
evidence it is that ticket and not something new. No test was weakened or deleted.

No other cell went red in this run (`documents-viewer-walk.spec.ts`, `work-cancel-walk.spec.ts`, and
`work-question-walk.spec.ts` — the other tickets named in this task's known-reds list — all passed
clean this run; their known flake modes were not observed here).

## Step 3 — no (c)/(d) reds found

Both reds (one per suite) were classified **(b)** on inspection and re-run evidence above. No
integration collision (shared mock, `serve-built.mjs`, fixture-ownership census, `messages/en.json`,
`test/manifest.txt`, or a shared component two lanes both edited) and no in-lane wave-2 defect were
found in either suite. Nothing was fixed, so no commit was made and the head did not move.

## Step 4 — typecheck, lint, and clean-tree confirmation

`pnpm --filter @clara/web typecheck` — 2026-09-20T13:24:10Z → 13:24:29Z, **19s**, exit 0
(`tsc --noEmit`, no diagnostics).

`CI=true GITHUB_ACTIONS=true pnpm lint` (root) — 13:24:34Z → 13:25:15Z, **41s**, exit 0. Covers
`apps/web`'s own lint chain (token-contrast census — all pairs meet WCAG 2.1 AA including the marginal
`input-on-*` pairs at 3.24–3.5:1 against the 3:1 UI floor, `check-test-manifest` — 501 files, exactly
once, alphabetical, `check-message-keys` — 4362 keys all resolve, `check-ui-add-guard` selftests) and
`packages/reporting-render`'s `eslint .` (silent = clean), through to the end of the chain with no
error.

`git status --porcelain=v1 --ignored -uall` — clean of any tracked/untracked-real-file changes;
remaining entries are all git-ignored: `apps/web/.next/**` (build output), `apps/web/.wrangler/**`,
`apps/web/e2e/.artifacts/**` (this run's trace/error-context for the #1017 failure),
`apps/web/e2e/.runtime/**` (per-run TLS cert/key), and `node_modules/**`.

## Net result

- **No commit.** Final head is the same as the start head: `0968b5287e82657dbb818dce1437d24c43038a17`.
- Unit suite: 4819 tests, 1 pre-existing timing flake (classification b), no fix — re-run clean 2/2
  in isolation.
- Browser suite: 568 tests, 1 known pre-existing red (#1017, classification b), no fix — reproduced
  2/2 in isolation at a different but equally marginal contrast value, confirming it is the same
  rendering-boundary defect rather than a new regression.
- No integration defect (c) and no wave-2 lane defect (d) found in `apps/web` this session.
- Typecheck and lint both green (`CI=true GITHUB_ACTIONS=true pnpm lint` as the runner sees it).
- Working tree clean apart from git-ignored build/test artefacts.
- **Unverified / left for a human:** whether `document-correction-walk.spec.ts:386` (#1017) would
  measure exactly 4.5+ on a machine with different font-rendering/GPU state — I did not attempt to
  change fonts or rendering settings, since ticket #1017 already owns this defect and this task's
  brief explicitly names it as one not to fix here. Also unverified: whether
  `documents-workbench-refresh.test.tsx`'s fixed-tick-count cell would benefit from the same
  `settleUntil` deadline idiom `#904`'s fix round already applied to its sibling
  `document-detail-live-refresh.test.tsx` — flagged as a candidate follow-up, not applied (behavior-
  adjacent test change, outside this gate's minimal-fix mandate for a (b)-classified red).

Final worktree head (before lane 09): `0968b5287e82657dbb818dce1437d24c43038a17`. Working tree clean
(only git-ignored build/e2e artefacts present).

---

## With lane 09

Coordinator instruction: lane 09 landed (`merge: riders wave 2 lane 09`, tickets #839, #880, #885,
#905 — the Work list, the Work question card/panel, the Clara rail's restate control, the revision
dialog's refusals, the home board's recent-success drilldown; also edited the shared
`test/hookHarness.ts`), on top of a `main`-merge and a docs commit. The merger hand-resolved one
two-intent collision in `apps/web/components/work/accounting-work-list.tsx` (lane 09's claim-label
paragraph plus lane 01's `opening_balance` purpose label). Re-ran: the whole unit suite, plus the
browser walks lane 09 touched or whose surfaces it changed.

**New head at start of this pass: `d3aaecdb86b6756162fb02971b536a8864030c2a`.**
**Final head: unchanged by me — `e0cc00aa2b709418d83207a2a9dcd3fc7306e4a2`**, which is gate worker
A's own concurrent `fix(integration): #659's no-recut census follows #905's signature swap`
(`packages/db` only, confirmed via `git show --stat`/`--name-only`: zero `apps/web` files touched).
I made **no commits** this pass — both reds found were pre-existing/known, not integration collisions
or lane-09 defects.

### Collision resolution check — `accounting-work-list.tsx`

Read `KNOWN_PURPOSE_LABELS` (line 135): `{journal_entry, periodic_stock_adjustment,
payroll_obligation, opening_balance}` — lane 01's `opening_balance` (#984) sits alongside lane 09's
other three, and `workRowKindLabel` (line 170) checks `workRowClaimLabel` (lane 09's #880 claim
label) FIRST, falling through to `KNOWN_PURPOSE_LABELS` only when there is no claim — the two
lanes' intents compose rather than collide. `messages/en.json` has both `claimLabel` (line 2224) and
all four `purposeLabels.*` keys including `opening_balance: "Opening balances"` (line 2274).
`components/work/accounting-work-list.test.tsx` covers `workRowKindLabel` for a claim row, a plain
row with a known purpose, an unknown purpose (verbatim fallback), a null-claimant claim, and a
malformed wire answer that omits `claim_id` entirely (the L09-ADV-07 regression guard) — this file's
own slice of the whole-suite run below is green. The merge resolution reads correct; no fix needed.

### Step 1 (repeat) — the whole `apps/web` unit suite, lane 09 included

Command: `node scripts/run-tests.mjs` from `apps/web`.

**Run** — 2026-09-20T14:21:39Z → 14:22:53Z, **74s**, exit 0 (**GREEN**).
`tests 4846, suites 138, pass 4844, fail 0, skipped 2`.

All green, including `accounting-work-list.test.tsx` and every other lane-09-touched unit file
(`document-facts-table.test.tsx`, `document-revision-dialog.test.tsx`, `client-work-attention.test.tsx`,
`work-cards.test.tsx`, `use-work-list.ts`'s callers, `work-question-form.test.tsx`,
`work-question-panel.test.tsx`, `work-restate.test.tsx`, `client-work-pack.test.ts`,
`work-list-url-state.test.ts`, `work-list.test.ts`). Notably, this run did **not** reproduce the
earlier (pre-lane-09) `documents-workbench-refresh.test.tsx` timing flake — consistent with that
cell's own classification above (a real-timer race, not deterministic).

### Step 2 — the targeted browser walks

Scope, as instructed: `work-question-walk`, `home-board-walk` (also the one `.spec.ts` lane 09
itself edited — `git diff --name-only 0968b5287...HEAD -- apps/web/e2e` showed only
`home-board-walk.spec.ts`), the Work list walk (`work-list-walk.spec.ts`, found via
`grep -rl "AccountingWorkList\|workRowKindLabel\|workRowClaimLabel" e2e/*.spec.ts` — no e2e spec
imports the component directly, so identified from `e2e/README.md`'s own coverage map: "#641's B3
durable Work list on BOTH `/work` and `/clients/:id/work`"), `work-cancel-walk` (known B7 red
#1024), `document-correction-walk` (known axe red #1017). No other e2e file was added or edited by
lane 09.

Command: `CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3620 CLARA_E2E_NEXT_PORT=3621
CLARA_E2E_RUNTIME_PORT=3622 pnpm --filter @clara/web e2e -- work-question-walk home-board-walk
work-list-walk work-cancel-walk document-correction-walk`, from the worktree root (one build, five
specs together).

**Run** — 2026-09-20T14:23:06Z → 14:27:15Z, **4m9s**, exit 1. **85 tests, 1 worker, 2 failed, 83
passed (3.8m Playwright-reported).** `work-question-walk`, `home-board-walk`, and `work-list-walk`
all passed **clean, zero reds**, including every cell touching the merged
`accounting-work-list.tsx`/`use-work-list.ts`/`work-list.ts`/`work-list-url-state.ts` surface.

**Red 1 — `work-cancel-walk.spec.ts:352`, "B7: a REFUSED stop says the reply is still running…"**
Identical signature to the task brief's named #1024: `locator('[data-clara-rail]').getByRole('button',
{ name: 'Stop reply' })` not visible within the default 5000ms timeout, same line 382. Re-run alone
twice (`--no-build work-cancel-walk`): attempt 1 — 14:31:47Z→14:32:52Z, **1 failed / 9 passed**
(1.1m), same failure; attempt 2 — 14:32:59Z→14:34:05Z, **1 failed / 9 passed** (1.1m), same failure.
Ownership check: `git diff --name-only 0968b5287..HEAD -- apps/web | grep -iE "clara|stream|stop|rail"`
returns nothing — lane 09 touched none of the Clara rail/stream/stop-reply files (`ClaraThreadView.tsx`,
`lib/clara/stream.ts`, `lib/clara/useClaraThread.ts`). **Classification: (b), the same known
pre-existing #1024 race, unrelated to lane 09.** No fix applied.

**Red 2 — `document-correction-walk.spec.ts:386`, the axe contrast cell (same cell as #1017
above).** In this 5-spec combined run it failed on the **"facts" tab with 4 nodes** rather than the
usual 2: the familiar #1017 pair (the selected filed-document row, `bgColor #f5f6f4`/`fgColor
#6c7575`, 4.36) **plus two new nodes** from `document-facts-table.tsx`'s raw-field-path sub-label
(`<span class="block text-xs font-normal text-muted-foreground">`, showing `invoice.total` and
`invoice.vendor_name`), `bgColor #ffffff`/`fgColor #727a7a`, **4.39** vs the 4.5:1 floor — same
"marginal muted-foreground text-xs" family of token as #1017, one hair under threshold.

Investigated whether this is a new lane-09 defect: `git diff 0968b5287..HEAD -- .../document-facts-
table.tsx` shows lane 09's #885 changes are a new `SourceRevisionWorkEffect` banner, a `useState`,
and a wrapping `<div>` around the existing `<DataTableCard>` — **the raw-path span itself (line 193,
`region.field_path !== null && region.field_path !== label`) and its className are untouched**, and
`factLabel()`'s known-field mapping (line 58-70, `invoice.total`/`invoice.vendor_name` both mapped
since before this wave) is also untouched. Re-ran the spec alone twice to test determinism:
attempt 1 — 14:29:50Z→14:30:26Z, **15/15 pass, fully clean** (34.4s); attempt 2 —
14:30:32Z→14:31:11Z, **1 failed / 14 passed** (37.8s), back to the classic **2-node** shape on the
**"accounting" tab** (`4.36`, the row only — no facts-table nodes this time).

Three different outcomes across three observations (0 nodes, 2 nodes/accounting, 4 nodes/facts) on
byte-identical code is the signature of a timing-sensitive scan racing un-settled paint state — the
cell has no `settleForScan()` call before its `AxeBuilder().analyze()`, exactly as diagnosed for
#1017 in wave 1's own report. **Classification: (b), the same #1017 family of pre-existing,
load-sensitive axe red — not a lane-09 regression** (the code lane 09 changed is provably inert for
the specific span that intermittently adds two extra nodes). Lane 09's structural change (one extra
stateful component + wrapper div) plausibly shifts render/settle timing enough to change *which*
un-settled elements a given run's scan happens to catch, but it does not own the underlying
marginal-contrast token or the missing test guard, and per this task's explicit instruction #1017 is
not to be fixed here. No fix applied. Worth flagging to #1017's owner: this run is the first evidence
that the same missing-`settleForScan` defect can expose MORE than the row alone under the right
timing, which may be useful context for that ticket's eventual fix, but is not new work for this
gate.

### Step 3 — no (c)/(d) reds found with lane 09 either

Both reds are pre-existing and unrelated to lane 09 (confirmed by diff inspection in both cases). No
integration collision and no lane-09 defect found. Nothing fixed, nothing committed by me.

### Step 4 (repeat) — typecheck, lint, clean tree

`pnpm --filter @clara/web typecheck` — 2026-09-20T14:34:20Z → 14:34:24Z, **~4s**, exit 0, no
diagnostics.

`CI=true GITHUB_ACTIONS=true pnpm lint` (root) — 14:34:28Z → 14:35:10Z, **42s**, exit 0, clean
(same chain as before: apps/web's token-contrast/test-manifest/message-keys/ui-add-guard selftests
all PASS, `packages/reporting-render`'s `eslint .` silent).

`git status --porcelain=v1 -uall` — clean, no output, both immediately after lane 09 landed and
again after gate worker A's concurrent `packages/db`-only commit moved the shared worktree's HEAD to
`e0cc00aa2b709418d83207a2a9dcd3fc7306e4a2` mid-gate (confirmed that commit touches zero `apps/web`
files, so none of the results above are stale).

### Net result — with lane 09

- **No commit by me.** Head moved only because of gate worker A's own concurrent, `apps/web`-disjoint
  `packages/db` fix; my own apps/web-scoped results are unaffected by it.
- Unit suite: 4846 tests, **0 failures** — fully green, including the resolved
  `accounting-work-list.tsx` collision and every lane-09-touched file.
- Targeted browser walks: 85 tests, 2 reds, both re-run alone twice and both classified **(b)**
  pre-existing/known (`work-cancel-walk` #1024, `document-correction-walk` #1017's own token
  family) — neither owned by lane 09, confirmed by diff inspection in both cases.
- `work-question-walk`, `home-board-walk`, and `work-list-walk` — the three walks most directly
  covering lane 09's own surfaces — all passed clean.
- Typecheck and lint both green as the runner sees them.
- Working tree clean apart from git-ignored artefacts, both before and after gate worker A's
  concurrent commit.
- **Unverified / left for a human:** whether `document-correction-walk.spec.ts:386` reliably shows
  0, 2, or 4 nodes on a quiet host with no other suite running (I observed all three shapes across
  four total runs this session and the prior one); and whether lane 09's new
  `SourceRevisionWorkEffect` render measurably changes this cell's timing margin versus before lane
  09 (plausible from the render-shape diff, not instrumented/measured directly).

Final worktree head (as left by gate worker A's concurrent, apps/web-disjoint commit):
`e0cc00aa2b709418d83207a2a9dcd3fc7306e4a2`. Working tree clean (only git-ignored build/e2e artefacts
present).
