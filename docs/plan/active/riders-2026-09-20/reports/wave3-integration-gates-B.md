# Riders wave 3 — integration gates, worker B (web unit + browser suites)

**Worktree** `C:\Users\zhant\Desktop\clara-wt\int2` · **branch** `integration/riders-w3`
**Head at start** `ba54ad2bdc7f858ddd2df3cc4e0009077dfd27f8` (eleven wave-3 lanes merged onto main
`d96a33f31`)
**Head at finish** `26ada61319f02f4c01d3e1ad121eeaa2164c1f41` — my own commit is `eff9a80a4`; the three
commits after it (`6dc0fd18b`, `06060f362`, `26ada6131`) are worker A's own concurrent `packages/db`
/ `packages/runtime` work, confirmed disjoint from `apps/web` (`git diff --name-only
eff9a80a4..HEAD` touches only `packages/db/tests/*` and `packages/runtime/tests/*`).
**Host** Windows 11, Node v22.23.2. Worker A ran `pnpm install --frozen-lockfile` first, then the
database and runtime suites, in this same worktree throughout; I touched only files under
`apps/web`, never `git add -A`, and never ran `pnpm install` myself.

Playwright triple used for every browser-suite command below:
`CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3620 CLARA_E2E_NEXT_PORT=3621 CLARA_E2E_RUNTIME_PORT=3622`.

**Net result.** One `fix(integration)` commit, `eff9a80a4` — a shared e2e-mock gap lane 02's #1007
left behind, invisible until this gate's own zero-rejected-reads census caught it. Everything else
this session found was already-known, already-documented pre-existing behaviour (the #736
load-sensitive race) or was outright green (the two wave-3 fixes this task named: work-cancel-walk
B7 #1024 and document-correction-walk's axe contrast cell #1017, both pass in every run). Second
full browser-suite run: **fully green, 0 failures.** Typecheck and lint both clean. Working tree
clean under `apps/web`.

---

## Step 1 — the whole `apps/web` unit suite

Command (from `apps/web`): `node scripts/run-tests.mjs`.

| run | when | duration | result |
|---|---|---|---|
| before the fix | 2026-09-23T13:47:42Z → 13:49:53Z | 130.9 s | exit 0 — **4986 tests, 4984 pass, 0 fail, 2 skip** |
| after the fix (repeat, per instruction) | 2026-09-23T14:22:29Z → 14:24:54Z | 144.0 s | exit 0 — **4986 tests, 4984 pass, 0 fail, 2 skip** (identical counts — the fix touches only an e2e mock file, no app source) |

Both runs fully green, no flake. This matches pass-2b's own final-head figure in
`wave3-merge.md` (4,986 tests, 4,984 pass, 0 fail, 2 skipped) exactly.

---

## Step 2 — the whole browser suite, twice

### Run 1 (with build) — `pnpm --filter @clara/web e2e`

**2026-09-23T13:50:08Z → 14:14:51Z, wall 24m43s** (Playwright's own report: `573 passed (23.7m)`).
Build succeeded first attempt, no `0xc0000142` panic.

| total | passed | failed | flaky | skipped |
|---|---|---|---|---|
| 582 | 573 | 2 | 0 (config fixes `retries: 0`, so Playwright has no native flaky concept) | 7 |

Two failures, both investigated below (Step 3): `journal-work-walk.spec.ts:978` (#727) and
`responsive-shell-walk.spec.ts:708` (#736). **Neither is a cell-level timeout** — the class #864
exists to remove:

- `#727`'s failure is `expect(rejected).toEqual([])` — a content assertion on a collected array of
  404 messages. No `TimeoutError`, no wait involved.
- `#736`'s failure is `expect(await exited).toBe(true)` — a boolean-equality assertion on a sampled
  CSS exit-state boolean. `wave3-lane09-fix.md` already established, in this same wave, that this
  assertion "carries no timeout at all" — it is a state-transition race, not a stalled wait.

**The two wave-3 fixes this task named both pass in this run:**
- `work-cancel-walk.spec.ts:358` "B7: a REFUSED stop says the reply is still running…" (#1024, lane
  11) — PASS, along with the other two B7 cells (lines 314, 392).
- `document-correction-walk.spec.ts:394` "#646 … axe: each of the three routed views has no WCAG
  A/AA violations" (#1017, lane 09) — PASS.

`work-question-walk.spec.ts` (the file named for load flakes in the wave-2 gate record) — all cells
passed clean this run, including its last cell at line 459.

### Run 2 (`--no-build`, after the fix below) — `pnpm --filter @clara/web e2e -- --no-build`

**2026-09-23T14:27:14Z → 14:57:12Z, wall 29m58s** (Playwright's own report: `575 passed (29.9m)`).
Slower than run 1 despite skipping the build — expected host contention from the sibling database/
runtime suites worker A was running concurrently in the same worktree, exactly the condition
`e2e/README.md`'s "one worker, one host" section and #864's own README paragraph describe as costing
more wall-clock than a quiet-host measurement.

| total | passed | failed | flaky | skipped |
|---|---|---|---|---|
| 582 | 575 | **0** | 0 | 7 |

**Fully green — zero cell-level timeouts, zero failures of any kind.** Both wave-3 fixes pass again
(B7 #1024, axe #1017), and `journal-work-walk.spec.ts:978` (#727) now passes (the fix holds).
`responsive-shell-walk.spec.ts:708` (#736) did not reproduce this run — consistent with its
documented load-sensitive, non-deterministic nature (below).

### #864 classification, across both runs

Across two full runs (582 tests each, 1164 test-executions total), exactly 2 reds, both in run 1,
**both self-classified as NOT a cell-level timeout**: one a content/data race (#727, fixed below;
the mock now answers deterministically, so it will not recur), one a documented pre-existing
state-transition race with no timeout involved (#736, classification (b), not fixed). This is
consistent with #864's own claim that reds observed under a loaded host fall outside cell-budget's
subject — no cell in either run exceeded its declared/granted budget and then timed out.

Note for the record: this task's step 2 asked for the suite run **twice**, not #864's own
three-consecutive criterion; `wave3-lane09-fix.md`'s SPEC-864-C already supplies a third
independent green-suite measurement (561/1/7, the 1 being this same #736 cell) from earlier in this
wave, so across the three most recent full-suite runs on record (that one plus my two), the only
repeating red is #736, always green in isolation, never a timeout.

---

## Step 3 — every red, classified

### RED 1 — `journal-work-walk.spec.ts:978`, "#727: the Work detail route hydrates with no React fault in the console"

**Observed:** run 1 above (13:50:08Z build run), once — `expect(rejected).toEqual([])` received two
`404 /e2e-supabase/rest/v1/rpc/get_trade_invoice_duplicate_ack` entries.

**Re-run alone, twice** (both required by this task's instruction):
1. A **deterministic pre-fix reproduction**, done to confirm root cause rather than assume it:
   temporarily reverted `apps/web/e2e/journal-work-mock.mjs` to its pre-fix content (`git show
   eff9a80a4^:apps/web/e2e/journal-work-mock.mjs`) and ran `pnpm --filter @clara/web e2e --
   --no-build journal-work-walk` alone (2026-09-23T15:02:28Z→15:05:47Z). **Same failure,
   byte-identical** — the same two `404 …get_trade_invoice_duplicate_ack` messages, same assertion,
   same line. (A second, unrelated cell — `journal-work-walk.spec.ts:296`, "B3 recovery" — also
   failed in this isolated, filtered run; it is **not** a red from any official run: it passed clean
   in both full-suite runs, at line 22706 in run 1's log and line 22562 in run 2's, so it is noise
   from running a narrow spec filter in isolation and out of scope for this gate. Not investigated
   further.) File restored to its fixed content immediately after (`git diff HEAD --
   journal-work-mock.mjs` empty, confirmed).
2. **Post-fix**, the spec was run twice more and passed both times (23/23): once with a fresh build
   (2026-09-23T14:18:06Z→14:20:16Z) and once `--no-build` (2026-09-23T14:20:21Z→14:21:59Z).

**Root cause, verified by reading the source, not assumed:**
- `components/work/work-detail.tsx:305-317` calls `getTradeInvoiceDuplicateAck` (declared in
  `lib/work/trade-invoice-reads.ts`, wired to `clara.get_trade_invoice_duplicate_ack`, migration
  0275, lane 02's #1007) **unconditionally**, in the same mount effect as the older
  `getTradeInvoice` call, for every addressable Work — trade invoice or not. Its own docstring
  confirms this is deliberate: "A FAILED read is indistinguishable from 'nobody was warned' on
  purpose… nothing here is blocked by it."
- `grep -rn "get_trade_invoice_duplicate_ack" apps/web/e2e/*.mjs` (before the fix) returned **zero**
  hits — no mock file, including lane 02's own `trade-invoice-mock.mjs`, ever taught this verb — so
  every call fell through to `serve-built.mjs:1009`'s default `sendJson(response, 404, { code:
  "unmatched_e2e_route", … })`.
- `journal-work-walk.spec.ts`'s `#727` cell (lines 978-1041) is the one cell in the whole 51-spec
  suite that asserts a route-scoped **zero-rejected-reads** census on the Work detail route, so it
  is the only place in the suite this gap could surface. Lane 02's own `trade-invoice-walk.spec.ts`
  never asserts this, which is why the gap shipped past lane 02's own gate and its two review/
  recheck rounds (`wave3-lane02-recheck.json`).
- `journal-work-mock.mjs`'s own header comment (the "WAVE 2026-09-18, INTEGRATION" block, lines
  1897-1906) documents this **exact shape happening three times already** for this same #727 census
  (`#655`/`get_trade_invoice`, `#636`/`intake_batch_members`, `#658`/`work_knowledge_drift`) — a new
  unconditional Work-detail mount read landing with no mock arm, caught only by this walk's strict
  census.

**Classification: (c)/(d) — an integration gap in shared e2e-mock coverage, caused by lane 02's
#1007 (migration 0275) not teaching any mock the new unconditional read it added to a shared
component.** Not a Windows-only issue, not a timing flake (deterministic both directions), and it
maps exactly onto this task's (c) category ("shared mocks… a component two lanes edited" — here, a
component owned by one lane but read by every other lane's Work-detail visits).

**Fix**, minimal, following the file's own established remedy for this exact shape: added a fourth
dispatch arm to `apps/web/e2e/journal-work-mock.mjs`, immediately after the existing
`get_trade_invoice` arm, gated on this lane's own two Work ids (`JOURNAL_WORK.seededWorkId`,
`JOURNAL_WORK.parkedCardWorkId`) exactly like its three siblings, answering `null` — the door's own
honest, ordinary answer ("nobody was warned about a duplicate"), per
`lib/work/trade-invoice-reads.ts`'s own docstring ("NULL is a real answer and by far the ordinary
one").

Commit **`eff9a80a4`** — `fix(integration): #727's zero-rejected-reads census vs #1007's fourth
unconditional Work-detail read` — `apps/web/e2e/journal-work-mock.mjs`, +18 lines, one file.

**Verification after the fix:**
- `node --import ./test/bootstrap.mjs --import tsx --test e2e/e2e-fixture-ownership.test.ts` — 44/44
  pass (the new verb is a sole claimant across all lane mocks, so no `SHARED_RPC_VERBS` entry is
  needed; `RPC_VERB_OPENER`'s `path === "/rest/v1/rpc/([a-z0-9_]+)"` spelling matches the new arm).
- `journal-work-walk.spec.ts` alone, twice (build then `--no-build`) — 23/23 pass both times.
- Whole `apps/web` unit suite, re-run once more — unchanged, 4986/4984/0/2 (Step 1's second row).
- Whole browser suite, run 2 above — this cell green.

### RED 2 — `responsive-shell-walk.spec.ts:708`, "#736: crossing from wide into narrow closes the rail by itself, through its own exit"

**Observed:** run 1 above, once — `expect(await exited, "the rail was removed without ever entering
its closing state").toBe(true)` received `false`. Did **not** reproduce in run 2.

**Re-run alone, twice** (`pnpm --filter @clara/web e2e -- --no-build responsive-shell-walk`):
- Attempt 1 — 2026-09-23T14:24:59Z→14:25:58Z (57.6 s) — **25/25 pass**, this cell clean.
- Attempt 2 — 2026-09-23T14:26:03Z→14:27:06Z (1.0 m) — **25/25 pass**, this cell clean again.

**Ownership/root-cause check, against this wave's own record rather than assumed:** this exact
cell, exact failure text, is already documented **twice before this gate run, inside this same
wave**:
- `wave3-lane09-ticket864.md`'s own "run 2" measurement.
- `wave3-lane09-fix.md`'s `SPEC-864-C` (2026-09-23): full-suite run on lane 09's own triple,
  `561 passed, 1 failed, 7 skipped, 15.9 m` — the one failure is this same cell — followed by an
  isolated re-run, `25/25 passed (40.0 s)`. That report's own words: *"a state-transition race with
  no timeout involved, in a file THIS ROUND never touched… the SAME cell
  `reports/wave3-lane09-ticket864.md` already recorded failing in its own run 2 — a documented,
  pre-existing flake class, not a new one."* It further classifies it explicitly: *"It is worth a
  ticket of its own… it is not a cell budget, and no budget would fix it"* (the assertion carries no
  timeout).
- No wave-3 lane's diff touches this cell: `responsive-shell-walk.spec.ts`'s only two wave-3
  touchers per `wave3-merge.md`'s shared-file table are lane 06 and lane 09/11's neighbouring specs
  (not this file for lane 11), and `wave3-lane09-fix.md` independently confirmed `git diff
  2a6bae6f7..HEAD --name-only | grep responsive` was empty for its own fix round.

**Classification: (b) — known, pre-existing, load-sensitive timing flake, not owned by any wave-3
lane.** No fix applied: the failing assertion has no timeout to size a budget against (it samples a
transient CSS class mid-viewport-change), and the documented remedy — watch for either the exit
state or the element's removal, rather than the exact intermediate frame — is its own small ticket,
already named as a follow-up in `wave3-lane09-fix.md`, and out of this gate's minimal-fix mandate
for a (b)-classified red. No test was weakened or deleted.

---

## Step 4 — typecheck, lint, clean tree

| check | when | duration | result |
|---|---|---|---|
| `pnpm --filter @clara/web typecheck` | 2026-09-23T14:57:31Z → 14:57:52Z | 21 s | exit 0, `tsc --noEmit`, no diagnostics |
| `CI=true GITHUB_ACTIONS=true pnpm lint` (root) | 2026-09-23T14:57:56Z → 15:00:55Z | 2 m 59 s | exit 0 — eslint, token-contrast census, test-manifest + selftest, message-keys + selftest, ui-add-guard selftest all PASS |
| `git status` under `apps/web` | after Step 4 | — | clean, no output |

The only untracked entries in the worktree at report time are worker A's own scratch files
(`packages/db/tests/zz-w3gate-{populate,retire,roster,template}.tmp.mjs`) — not under `apps/web`,
not touched by me, left exactly as found per this task's scope.

---

## Commits

| sha | message | files |
|---|---|---|
| `eff9a80a4` | `fix(integration): #727's zero-rejected-reads census vs #1007's fourth unconditional Work-detail read` | `apps/web/e2e/journal-work-mock.mjs` (+18) |

Three commits landed after mine before this report was written, all worker A's own, all outside
`apps/web` (confirmed by `git diff --name-only eff9a80a4..HEAD`):

| sha | message | files touched |
|---|---|---|
| `ecfec7967` | `fix(integration): #899 vs #435 — the client_identifiers writer census re-measured for the birth core` | `packages/db/tests/opening-source-reread.test.mjs` |
| `6dc0fd18b` | `fix(integration): #986 vs #899 — the reread battery's fixture names leave one name family` | `packages/db/tests/x42-s5-helpers.mjs` |
| `06060f362` | `fix(integration): #932/#975 vs #182 — lane 04's three new doors join arm (D)'s clock roster` | (packages/db) |
| `26ada6131` | `fix(integration): #899 vs the wave-B interview DB battery — one name family per firm` | `packages/runtime/tests/wave-b-interview-plan-db.test.mjs` |

**Final head: `26ada61319f02f4c01d3e1ad121eeaa2164c1f41`.**

---

## Anything unverified

- **`responsive-shell-walk.spec.ts:708` (#736) remains open, on purpose.** This gate's mandate is to
  fix (c)/(d) reds minimally, not to chase a documented (b) flake; it is filed in
  `wave3-lane09-fix.md`'s own follow-up list as deserving a small ticket of its own (watch for the
  exit state OR the removal, not the exact intermediate frame). Whether it would ever reproduce on a
  quiet, single-suite host is unverified — every observation of it across this wave, including mine,
  ran under multi-lane host contention.
- **Only two full browser-suite runs were performed**, per this task's explicit step 2 instruction
  ("TWICE"), not #864's own three-consecutive-green criterion. I did not run a third full suite
  myself; the classification above instead cites `wave3-lane09-fix.md`'s own independent third
  measurement (SPEC-864-C) as corroborating evidence that #736 is the only repeating red across the
  three most recent full-suite runs on record, and that it is never a cell-level timeout.
- **The "B3 recovery" cell** (`journal-work-walk.spec.ts:296`) that failed once during my isolated,
  filtered, pre-fix reproduction run is unverified as anything beyond isolation noise: it passed
  clean in both official full-suite runs and was not investigated further, since it is not a red
  from any run this task's steps required.
