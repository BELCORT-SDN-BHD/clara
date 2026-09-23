# Wave 3 · Lane 10 · Ticket #1015 — DONE

Branch: `riders/w3-lane10` (worktree `C:\Users\zhant\Desktop\clara-wt\660`). Base:
`ffe63a0dd084e99b84c1368119845be273c421ce`. First ticket in the lane —
`git log ffe63a0dd084e99b84c1368119845be273c421ce..HEAD` was empty at start.

## Commits (4, all named `#1015`)

```
4f1ac9723 docs(runtime): #1015 document censusUnboundTasks's document-lane scoping rule
7c4172440 test(runtime): #1015 prove the two-sources cell against a contaminated database
a6ac22323 fix(runtime): #1015 distinguish an explicit documentTaskIds ask from an absent one
304621a82 fix(runtime): #1015 scope censusUnboundTasks's document lane to callers who ask for it
```

`git diff --stat ffe63a0dd08..HEAD`: `packages/runtime/lib/rollback-preflight.mjs` (+23/-2),
`packages/runtime/tests/rollback-preflight.test.mjs` (+96/-2), `packages/runtime/README.md` (+13).
Working tree clean. No migration applied or written — confirmed not needed (see "Migration" below).

## Ticket

#1015 "Rollback preflight's document-processing census runs unscoped when a caller scopes by task
ids alone" (bug, ready-for-agent). No comments; the issue body's own "Agent Brief" is the only, and
therefore newest, contract. No owner ruling comment dated 2026-09-20 exists on this issue — verified
via `gh issue view 1015 --json comments` (empty array).

**The seam the brief names** (its own "Key interfaces"): the rollback preflight's task-census
function, `censusUnboundTasks` (`packages/runtime/lib/rollback-preflight.mjs`, exported and
re-exported to `tests/queue-drain.mjs` and `tests/rollback-preflight.test.mjs`). All new cells drive
it directly, through its own public signature — never through a private helper or a side channel —
matching how the pre-existing cell that discovered the gap already called it
(`censusUnboundTasks(query, { taskIds: [taskId] })`). `preflight()` — the door that wraps it — is
untouched; its own two call sites are read, not edited, to evidence AC4.

**Verified still live on this branch**: `git log ffe63a0dd08..HEAD --
packages/runtime/lib/rollback-preflight.mjs packages/runtime/tests/rollback-preflight.test.mjs` was
empty before my commits — no wave-3 lane before mine touches this file (there is none; #1015 is the
first ticket in this lane) — and the defect (`documentTaskIds ?? null` in the document-processing
query, absent whenever a caller passes `taskIds`/`workIds` alone) was present verbatim at the base
commit, confirmed by reading the file and reproduced live (see AC1 below).

## Migration

**None needed, none written** — matches the ticket's own prestate ("This ticket is expected to need
NO migration"). The fix is a pure application-layer scoping change inside one exported function; no
schema, grant, or SQL function changed.

## Acceptance criteria

- [x] **AC1 — a task-id/work-id scope excludes unrelated document-processing tasks.**
  Test: `637.pf: #1015 — a census scoped by task ids ignores unrelated document-processing tasks in
  other lanes and firms` (`rollback-preflight.test.mjs`). Seeds 3 unrelated, live
  `document_processing_tasks` rows across 3 different firms and 3 different lanes
  (`plantNoiseDocumentTasks`), plus one real `accounting_work` task via `admitUnboundWork`, then
  asserts `censusUnboundTasks(query, { taskIds: [receipt.task_id] })` returns exactly 1 row (the
  caller's own task) and that the same holds for a `workIds`-shaped scope. **Result: PASS** (both
  assertions, `node --test`, TAP `ok`).
  **Vacuity control** (bug-fix ticket, per work-order rule 4): reverted
  `lib/rollback-preflight.mjs` to the pre-fix content at base commit `ffe63a0dd08`
  (`git checkout ffe63a0dd08 -- packages/runtime/lib/rollback-preflight.mjs`), re-ran — **RED for
  the right reason**: `4 !== 1`, the extra 3 rows named exactly as the noise fixture's ids and
  lanes. Restored the fix byte for byte (`git checkout HEAD --
  packages/runtime/lib/rollback-preflight.mjs`; `git diff --stat HEAD --
  packages/runtime/lib/rollback-preflight.mjs` empty afterward).

- [x] **AC2 — an explicit ask for the full, unscoped document picture still receives it.**
  Test: `637.pf: #1015 — an explicit ask for the FULL document picture (documentTaskIds: null) is
  honoured even alongside a task-id scope` (`rollback-preflight.test.mjs`). Seeds 2 unrelated
  document rows, then calls `censusUnboundTasks(query, { taskIds: [randomUUID()], documentTaskIds:
  null })` and asserts both noise rows are present (the `documentTaskIds` key being *named* — even
  `null` — is the ask), and separately that a fully open call (`censusUnboundTasks(query, {})`)
  still sees them too. **Result: PASS.**
  This is also the shape `preflight()`'s GLOBAL census (`censusUnboundTasks(query, {})`, unedited
  call site) and `tests/queue-drain.mjs`'s `waitForQueueDrain` (`censusUnboundTasks(query)`, no
  scope at all) already rely on — regression-checked, see "Other gates" below.

- [x] **AC3 — the cell that discovered the gap passes against a contaminated database.**
  The existing cell `637.pf: B3 — two sources sharing one task_kind count the task ONCE, and the
  ENABLED one decides its class` now seeds 4 unrelated queued `document_processing_tasks` rows
  (same `plantNoiseDocumentTasks` fixture) before exercising the original reproduction, so the pass
  is a proof rather than a coincidence of the shared database's contents (the originally reported
  failure — wave-1: 20 unrelated rows on `clara_wave_b_ci`; wave-2 re-run: 19, then 18, on
  `clara_rt` — was itself contamination-dependent and this cell alone never seeded any). **Result:
  PASS** (`ONE row for ONE task...`, no assertion weakened — every original assertion in the cell is
  unchanged). Vacuity control run together with AC1's (same revert/restore cycle): against the
  pre-fix source this cell reds `5 !== 1`, for the same reason.

- [x] **AC4 — no other rollback-preflight behaviour changes.**
  Full file, `node --test tests/rollback-preflight.test.mjs`: **33 / 33 pass, 0 fail, 0 skip**
  (World bootstrapped, see "How this was run" — every cell in the file executed, none skipped).
  Every pre-existing cell is byte-identical except the one edited for AC3 (noise seeding + one
  updated assertion message; no assertion removed or weakened) — confirmed by
  `git diff ffe63a0dd08..HEAD -- packages/runtime/tests/rollback-preflight.test.mjs`. Agent-task
  scoping cells (`an UNBOUND accounting_work task refuses on its own`, `a queued CHAT_TURN task with
  no run strands...`), workflow-class resolution cells (the wake/`close_prep` DB-driven class cells,
  the frontier-rule cells), and the run-census scope-narrowing cells (`N8`, `#708`) all still pass
  unmodified. `preflight()` itself (`lib/rollback-preflight.mjs:542-627`) has **zero** lines changed
  — only `censusUnboundTasks` (lines 376-430) and its JSDoc were touched, confirmed by
  `git diff ffe63a0dd08..HEAD -- packages/runtime/lib/rollback-preflight.mjs`. Regression check on
  the fix's other real caller: `tests/queue-drain.test.mjs` — **6 / 6 pass**, unaffected (it calls
  `censusUnboundTasks(query)` with no scope at all, which is the unaffected/open-call path).

**Out of scope** (per the ticket's own "Out of scope" section, neither touched nor attempted): the
four `packages/db` test failures the earlier integration gate classified as pre-existing database
contamination; any change to how or when a rollback preflight is invoked.

## What the fix actually is

`censusUnboundTasks`'s `document_processing_tasks` query filtered on `scope.documentTaskIds ?? null`
— `null` (no filter, i.e. every row) whenever the key was absent, which every real caller's
`taskIds`/`workIds`-shaped scope left it. `clara.document_processing_tasks` carries no
`work_id`/`task_id` column, so there is no correspondence a `taskIds`/`workIds` scope could ever
derive for that table — the honest answer for "no document scope was named, and one was scoped
elsewhere" is **none**, not **everything**.

```js
const agentScoped = scope.workIds != null || scope.taskIds != null;
const docScopeGiven = Object.prototype.hasOwnProperty.call(scope, "documentTaskIds");
const documentTaskIds = docScopeGiven ? (scope.documentTaskIds ?? null) : (agentScoped ? [] : null);
```

Presence of the `documentTaskIds` key (not its value) is the signal, per the brief's own "Key
interfaces": absent + agent-shaped scope → `[]` (narrows to nothing, matching AC1); present (even
`null`) → honoured exactly as given, defaulting to unscoped (matching AC2); scope entirely empty
(`{}` / no scope, `agentScoped` false) → unscoped either way, unaffected (the shape
`preflight()`'s GLOBAL census and `tests/queue-drain.mjs` already use).

`preflight()`'s own scoped call (lines 590-594) already passed `documentTaskIds: scope.documentTaskIds
?? []` explicitly at every call — always naming the key — so it was never exposed to this defect and
required no change; this is why AC4 holds trivially for it.

## How this was run — World-bootstrap-dependent, on a disposable clone

`preflightReady()` (the file's own `SKIP` gate) requires `workflow.workflow_runs` to exist, so every
DB-dependent cell in this file — including the pre-existing one this ticket must prove — needs a
bootstrapped WDK World. Per `RIG.md`'s own guidance ("Bootstrapping a World on your database makes
`rig-isolation.test.mjs` T10b red afterwards... clone a sibling database first if you need both"), I
never bootstrapped the World on `clara_l10` itself:

1. Cloned `clara_l10` → `clara_l10_w1015` (`CREATE DATABASE ... TEMPLATE clara_l10`).
2. Bootstrapped the World on the clone only: `WORKFLOW_POSTGRES_URL=postgres://postgres@127.0.0.1:
   55750/clara_l10_w1015 node_modules/.bin/bootstrap` (from `packages/runtime`) — succeeded.
3. Ran every test cell (baseline, each TDD red/green cycle, the final 33/33 run, the vacuity
   revert/restore, `queue-drain.test.mjs`) against the clone.
4. **Dropped the clone** afterward (`DROP DATABASE clara_l10_w1015`).
5. **Confirmed `clara_l10` itself is untouched**: `select to_regclass('workflow.workflow_runs'),
   count(*) from clara.agent_tasks, count(*) from clara.document_processing_tasks` on `clara_l10` →
   `{w: null, a: '0', d: '0'}` — no World, zero rows in either census table, exactly the lane's
   starting prestate. The next ticket in this lane inherits a clean database.

## Gates, with counts

| gate | command | result |
|---|---|---|
| touched test file (full run) | `node --test tests/rollback-preflight.test.mjs` (against the World-bootstrapped clone) | **33 / 33 pass, 0 fail, 0 skip** |
| regression on the other real caller | `node --test tests/queue-drain.test.mjs` | **6 / 6 pass** |
| vacuity (pre-fix source) | same file, `lib/rollback-preflight.mjs` reverted to base | 2 cells red for the reported reason (`4 !== 1`, `5 !== 1`), fix restored byte-for-byte afterward |
| frozen workflows | `node scripts/check-frozen-workflows.mjs --compare-base ffe63a0dd084e99b84c1368119845be273c421ce` | **OK — 312 existing entries retain hash/deployed flag; 0 additions; 3 recorded retirements** |
| parts parity | `node packages/runtime/scripts/check-parts-parity.mjs` | **OK** — reader ⊇ emittable |
| typecheck (`packages/runtime`, the touched workspace) | `pnpm typecheck` | **`packages/runtime typecheck: Done`** (pass) |
| typecheck (`apps/web`, untouched) | (same command) | **fails** — `.next/types/validator.ts(7,34): Cannot find module 'next/server.js'`, pre-existing environment/build-cache state, not caused by this ticket (I never touched `apps/web`; the only workspace this ticket's diff reaches, `packages/runtime`, typechecks clean) |
| lint, as the runner sees it | `CI=true GITHUB_ACTIONS=true pnpm lint` | **exit 0** (all workspaces, including `apps/web` and `packages/db`) |

No `packages/db/tests` files were touched (no migration), so `operation-census.test.mjs` and
`rig-isolation.test.mjs` do not apply to this ticket (rule 8's own condition — "if you added SQL
functions" — was not met).

**Minor anomaly observed, not this ticket's:** one `pnpm lint` line for `@clara/reporting-render`
printed a `C:\Users\zhant\Desktop\clara-wt\642\...` path (lane 03's worktree) instead of this one's.
Verified `packages/reporting-render` inside `clara-wt\660` is a real, independent directory (not a
symlink; `fs.realpathSync` resolves inside `clara-wt\660`) and lint still exited 0 — read as a
`pnpm -r` reporter/cache cosmetic, not an actual cross-worktree file operation. No worktree other
than `clara-wt\660` was written to.

## Docs

`packages/runtime/README.md` — added a paragraph under "### The rollback preflight is a command..."
(the section documenting the two censuses and their scoping) explaining the document lane's own
scoping rule, the earlier defect's shape, and how a caller asks for the full picture. `CONTEXT.md` —
not touched: this ticket introduces no new product/accounting vocabulary, only an internal
scoping-contract fix inside one runtime module.

## Successor contract

None. No frozen chat/Work-tool surface (`chatTurn_v*`, `claraWork_v*`, or their closures) is
implicated by this ticket — `censusUnboundTasks` and `preflight()` are plain, unfrozen `lib/`
modules read by a CLI script and two test files, not by any workflow body.

## Follow-ups worth filing

- None identified beyond the ticket's own stated out-of-scope items. The fix is narrowly the one
  function the brief named; `preflight()`'s own call sites already handled this correctly and needed
  no change.

## Unverified

- Whether CI's `db-live-gates` job (which bootstraps its own World on a shared database) will see
  this same file differently — not run there; only proven on a disposable local clone as described
  above. The fix touches no environment-dependent logic (no `CI`/`GITHUB_ACTIONS` branching, no
  filesystem/spool path), so no difference is expected, but this is not directly evidenced from this
  lane.
- Whether any caller outside `packages/runtime` (none found — `censusUnboundTasks` is exported only
  from `lib/rollback-preflight.mjs` and imported only by this package's own tests and CLI script,
  confirmed by a repo-wide `censusUnboundTasks(` search) exists in a part of the tree this search
  could miss (e.g. a dynamically constructed import) — treated as absent because nothing checkable
  says otherwise.
