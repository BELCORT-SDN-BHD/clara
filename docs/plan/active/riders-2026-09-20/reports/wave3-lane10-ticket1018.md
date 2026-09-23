# Wave 3 · Lane 10 · Ticket #1018 — DONE (resumed)

Branch: `riders/w3-lane10` (worktree `C:\Users\zhant\Desktop\clara-wt\660`). Base:
`ffe63a0dd084e99b84c1368119845be273c421ce`. `#1015` and `#1016` landed before this ticket started
(confirmed by `git log ffe63a0dd08..HEAD` at start: `304621a82`, `a6ac22323`, `7c4172440`,
`4f1ac9723` named `#1015`; `c248d2023` named `#1016`).

**Resume note.** An earlier implementer of THIS ticket was cut off mid-work by a usage limit. At
start: two commits already landed (`af1e1dd1d` — the shared module + its unit tests; `e9205e348` —
the first four drivers converted, plus the census test), and the working tree held uncommitted
changes to 8 more driver files. Seven of those eight (`opening-ledger-source-e2e.mjs`,
`plan-occurrence-e2e.mjs`, `prepayment-occurrence-e2e.mjs`, `trade-invoice-e2e.mjs`,
`two-build-cutover-e2e.mjs`, `work-cancel-e2e.mjs`, `work-question-e2e.mjs`) were fully converted
already; `accrual-e2e.mjs` had only the `import` line added — its body still hand-rolled the old
gate. Verified by reading `git status` and `git diff` before touching anything, then judged each
uncommitted change on its own merits (all correct, none redone) and finished the interrupted slice
first, per the resume instructions.

## Commits (6, all named `#1018`)

```
af1e1dd1d test(runtime): #1018 add the shared local-db-gate module and its unit tests            [landed before this session]
e9205e348 test(runtime): #1018 convert intake-*-e2e and work-knowledge-e2e to the shared gate     [landed before this session]
d1f83ba2e test(runtime): #1018 finish resumed group and convert 8 more e2e drivers to the shared gate
c32978792 test(runtime): #1018 convert the chat-turn-v19/v20/v21 e2e trio to the shared gate
e66704a13 test(runtime): #1018 convert five more e2e drivers to the shared gate
5634de6e4 test(runtime): #1018 convert the final three e2e drivers, completing the shared-gate roster
9c445683a fix(runtime): #1018 drop the unused host param off dsnAgreesWithEnv, document the shared gate
```

This session's own commits: the last five. `git diff --stat af1e1dd1d~1..HEAD`: 27 files changed,
640 insertions(+), 460 deletions(-) — the 23 driver files, `local-db-gate.mjs`,
`local-db-gate.test.mjs`, `local-db-gate-drivers-census.test.mjs`, and `packages/runtime/README.md`.
Working tree clean at the end (`git status --short` empty). No migration applied or written —
matches the ticket's own prestate ("This ticket is expected to need NO migration") and touches no
`packages/db` file at all.

## Ticket

#1018 "Consolidate the runtime World e2e drivers' local-database allowlists into one shared gate"
(enhancement, ready-for-agent). No comments (`gh issue view 1018 --repo BELCORT-SDN-BHD/clara --json
comments` → `[]`); the issue body's own "Agent Brief" is the only, and therefore newest, contract.
No owner ruling comment dated 2026-09-20 exists. Filed from wave-1 lane-10 follow-ups (recorded in
`reports/wave1-lane10-final.md` and `reports/wave1-lane10-codereview-fix.md`).

**The seams the brief names** ("Key interfaces"):
- "A shared local-database-gate module exporting the host check and the allowed-database-name check
  (and/or a single combined guard function) that every World e2e driver calls at startup" —
  `packages/runtime/tests/local-db-gate.mjs`: `isLoopbackHost`, `allowedDbPattern`,
  `dsnAgreesWithEnv`, `assertLocalDbGate`, `DB_NAME_SHAPE`.
- "Existing drivers' own inline checks are replaced by calls into this shared module; none may keep
  a parallel, independently-maintained copy" — every `packages/runtime/tests/*-e2e.mjs` driver that
  carried the pre-#1018 gate.
- AC3's own litmus test — "verified by a test that enumerates the driver files and confirms each
  imports the shared gate" — `packages/runtime/tests/local-db-gate-drivers-census.test.mjs`, a text-
  level census over each driver's own source (never re-derives or re-executes the gate itself).

**Verified still live on this branch** at session start: `git log ffe63a0dd08..HEAD` showed no
other lane/ticket touching `packages/runtime/tests/*-e2e.mjs` or `local-db-gate*`; the two landed
commits and the uncommitted diff were all still present and consistent with the ticket's own text.

## Migration

**None needed, none written** — matches the ticket's own prestate. Pure test-infrastructure
refactor inside `packages/runtime/tests`; no schema, grant, or SQL function touched.

## Scope: the 23-driver roster

Every standalone `*-e2e.mjs` file under `packages/runtime/tests` that spawns the shared World test
harness carried this exact loopback-host + allowed-database-name gate on 2026-09-20
(`git grep ALLOWED_DB packages/runtime/tests` before this ticket). `shutdown-e2e.mjs` and
`world-e2e.mjs` are standalone e2es too but never carried this gate at all (DB env presence only, no
allowed-name list) — out of this ticket's scope, not missed; the census test's own header comment
says so.

The 23: `intake-e2e`, `intake-admission-e2e`, `intake-batch-e2e`, `work-knowledge-e2e` (landed
before this session), `accrual-e2e`, `opening-ledger-source-e2e`, `plan-occurrence-e2e`,
`prepayment-occurrence-e2e`, `trade-invoice-e2e`, `two-build-cutover-e2e`, `work-cancel-e2e`,
`work-question-e2e`, `chat-turn-v19-e2e`, `chat-turn-v20-e2e`, `chat-turn-v21-e2e`,
`fixed-asset-acquisition-e2e`, `work-egress-e2e`, `periodic-adjustment-e2e`,
`staff-expense-claim-e2e`, `work-journal-e2e`, `interview-e2e`, `interview-kill-resume-e2e`,
`version-cutover-e2e`.

Composed shapes preserved exactly (verified per-file against each original `ALLOWED_DB` regex
before editing):
- `RT_TEST|INTAKE_CI` (`intake-e2e`); `+PER_TICKET` (`intake-admission-e2e`); `+PER_TICKET` with an
  outer `_world` suffix applied after whichever alternative matched (`intake-batch-e2e`).
- `RT_TEST|WAVE_B_CI|PER_TICKET` (`work-knowledge-e2e`, checkDsnParsed only — historically never
  checked `WORKFLOW_POSTGRES_URL` at all, preserved as-is, not widened).
- `RT_TEST|WAVE_B_CI|PER_TICKET_3_OR_4` (`accrual-e2e`, `opening-ledger-source-e2e`,
  `plan-occurrence-e2e`, `prepayment-occurrence-e2e`), `checkDsnParsed` only (their own historical
  single-check style — a presence check plus the parsed-DSN equality, no separate string regex).
- `RT_TEST|WAVE_B_CI|PER_TICKET(?:_world)?|PER_LANE` (`trade-invoice-e2e`, its own per-alternative
  suffix shape, distinct from `intake-batch-e2e`'s outer one), `checkDsnParsed` only.
- `RT_TEST|WAVE_B_CI` (`two-build-cutover-e2e`, `work-cancel-e2e`, `work-question-e2e`,
  `chat-turn-v19/20/21-e2e`, `fixed-asset-acquisition-e2e`, `work-egress-e2e`, `interview-e2e`,
  `interview-kill-resume-e2e`, `version-cutover-e2e`), `checkDsnParsed` for the first three,
  `checkDsnString` + `checkDsnParsed` (both, matching their own two-part original check) for the
  rest.
- `RT_TEST|WAVE_B_CI|PER_LANE` (`periodic-adjustment-e2e`, `staff-expense-claim-e2e`,
  `work-journal-e2e`), both DSN checks.

## Acceptance criteria

- [x] **AC1 — a shared gate module exists and exposes the loopback-host and allowed-database-name
  checks used by the World e2e drivers today.** `packages/runtime/tests/local-db-gate.mjs` (landed
  before this session, unit-tested by `local-db-gate.test.mjs`, 10 cases). Evidence:
  `node --test packages/runtime/tests/local-db-gate.test.mjs` → **10/10 pass**.
  *(Corrected in the fix round, review STD-1018-01: this line and the gates table below both
  said 14; the file declares exactly 10 top-level `test(` cases and the command as written
  prints `# tests 10 / # pass 10`. Every cell genuinely passes; only the arithmetic was wrong.)*

- [x] **AC2 — every standalone World e2e driver that previously defined its own inline gate now
  calls the shared module instead, with no driver defining a second, independent copy.** Evidence:
  `git grep -n "ALLOWED_DB\|LOCAL_HOSTS = new Set" -- "packages/runtime/tests/*-e2e.mjs"` → no
  matches (exit 1, nothing found) at the end of this session. Every one of the 23 driver files now
  imports `./local-db-gate.mjs` and calls `assertLocalDbGate(...)` — verified per-file with
  `node --check` (syntax) and by the census test below.

- [x] **AC3 — changing the shared module's allowed-database-name pattern once is sufficient for
  every driver to pick up the change, verified by a test that enumerates the driver files and
  confirms each imports the shared gate.** `packages/runtime/tests/local-db-gate-drivers-census.
  test.mjs`'s `DRIVERS` constant now lists all 23 files (grown from 4 at session start); its fourth
  test (`"every enumerated standalone World e2e driver imports the shared gate and drops its own
  copy"`) reads each file's own source text and checks (1) it imports `./local-db-gate.mjs`,
  (2) it declares no local `ALLOWED_DB`, (3) it declares no local `LOCAL_HOSTS`, (4) it actually
  calls `assertLocalDbGate(` (so the import cannot be dead). **Vacuity control, run by hand this
  session**: temporarily stripped the `local-db-gate.mjs` import line from the already-committed,
  already-converted `work-journal-e2e.mjs` (simulating an unconverted driver still listed in
  `DRIVERS`), re-ran the census test — **RED for the right reason**: `1 fail`, message
  `"work-journal-e2e.mjs: does not import ./local-db-gate.mjs"` (`ok 3`, `not ok 4`). Restored the
  file with `git checkout --`, confirmed `git status --short` clean (byte-for-byte), re-ran — **4/4
  green** again. This proves the AC3 litmus test actually catches a driver that stops calling the
  shared gate, not merely a test that always passes.

- [x] **AC4 — no driver's set of currently-allowed database names becomes more permissive as a side
  effect of this change; each driver admits exactly the names it admitted before, unless resolving
  an existing driver's own internal disagreement.** Verified per-file, before editing, by reading
  each original `ALLOWED_DB`/DSN-regex pair and composing the identical alternation body through
  `allowedDbPattern(...)` (see "Scope: the 23-driver roster" above for the shape-by-shape mapping).
  The one historical internal disagreement the ticket's own Context section refers to
  (`work-journal-e2e.mjs` "carries two that had already drifted apart", per
  `reports/wave1-lane10-final.md` item 2) was already resolved before this ticket, under #980 (both
  of that file's copies admit `l\d{2}` identically as of the base commit) — nothing left for #1018
  to reconcile there; the conversion simply preserves the now-already-agreeing shape. No driver's
  `dbRegex`/`dsnRegex` alternation body gained or lost an alternative compared to its pre-#1018
  original.

**Out of scope** (per the ticket's own "Out of scope" section, neither touched nor attempted):
actually running the seven drivers this rig cannot reach (they admit only `clara_rt_test` /
`clara_wave_b_ci` / `clara_intake_ci`, never this lane's `clara_l10`) — that is separate
verification work; widening or narrowing which database names are allowed beyond the one
already-resolved disagreement above.

## What the shared module looks like

```js
export function assertLocalDbGate({ label, pattern, checkDsnString = false, checkDsnParsed = false, env = process.env }) {
  const host = env.PGHOST;
  const database = env.PGDATABASE;
  if (!isLoopbackHost(host) || !pattern.dbRegex.test(database ?? "")) {
    throw new Error(`${label} is hard-gated to a loopback host + PGDATABASE matching ${pattern.describe()}`);
  }
  if (!checkDsnString && !checkDsnParsed) return;
  const dsn = env.WORKFLOW_POSTGRES_URL;
  if (checkDsnString && (!dsn || !pattern.dsnRegex.test(dsn))) { ... }
  if (checkDsnParsed) { ... dsnAgreesWithEnv(dsn, { port: env.PGPORT, database }) ... }
}
```

Each driver's own call, e.g. `work-journal-e2e.mjs`:

```js
assertLocalDbGate({
  label: "work-journal-e2e",
  pattern: allowedDbPattern(`${DB_NAME_SHAPE.RT_TEST}|${DB_NAME_SHAPE.WAVE_B_CI}|${DB_NAME_SHAPE.PER_LANE}`),
  checkDsnString: true,
  checkDsnParsed: true,
});
```

A future change to an admitted shape (e.g. a new naming convention for a later wave) is now a
one-line edit to the relevant `DB_NAME_SHAPE` constant or a driver's own composed body — picked up
by every driver that references it, with `local-db-gate-drivers-census.test.mjs` standing guard
against any driver ever again keeping a second, independently-maintained copy.

## The lint fix (found by this session's gate run, not by the ticket brief)

`pnpm lint` (packages/runtime, `eslint .`) failed on the pre-existing shared module:
`'host' is defined but never used no-unused-vars` at `local-db-gate.mjs:56`. `dsnAgreesWithEnv(dsn,
{ host, port, database })` destructured `host` but its body checks `isLoopbackHost(u.hostname)` —
membership in the loopback set, never equality against the passed `host` — which matches every
driver's ORIGINAL behavior verbatim (`LOCAL_HOSTS.has(u.hostname)`, not `u.hostname === PGHOST`, in
every pre-#1018 driver's own parsed-DSN block). Fix: dropped the unused `host` param from the
destructuring signature; no caller changed (`assertLocalDbGate` still passes `{ host, port,
database }`, and the extra key is simply ignored by destructuring). Re-verified:
`npx eslint packages/runtime/tests/local-db-gate.mjs` → clean; `local-db-gate.test.mjs` +
`local-db-gate-drivers-census.test.mjs` still **14/14 pass** after the fix (10 unit + 4 census;
corrected in the fix round, review STD-1018-01 — the report said 18).

## Gates, with counts

| gate | command | result |
|---|---|---|
| touched test files (unit + census) | `node --test tests/local-db-gate.test.mjs tests/local-db-gate-drivers-census.test.mjs` (from `packages/runtime`) | **14/14 pass, 0 fail** (10 unit + 4 census) — corrected in the fix round, review STD-1018-01; the report said 18/18 (14 unit + 4 census). The fix round then added 4 census cells, so the same command now prints 18/18 (10 unit + 8 census) — see `wave3-lane10-fix.md`. |
| vacuity control on the census's AC3 cell | manual: strip the shared-gate import from a committed driver, re-run, restore | **RED for the right reason** (`work-journal-e2e.mjs: does not import ./local-db-gate.mjs`), then **byte-for-byte restored**, then **green again** |
| syntax, all 23 converted drivers | `node --check tests/<file>.mjs` × 23 | **23/23 OK** |
| `check-frozen-workflows.mjs` | `node scripts/check-frozen-workflows.mjs` (worktree root) | **OK** — 312 frozen files verified, no manifest diff, 3 retired entries recorded |
| `check-parts-parity.mjs` | `node packages/runtime/scripts/check-parts-parity.mjs` | **OK** — reader ⊇ emittable, re-run after the lint fix, unchanged |
| typecheck | `pnpm typecheck` (worktree root) | **pass** — `packages/runtime typecheck: Done`, `apps/web typecheck: Done` (re-run after the lint fix) |
| lint | `pnpm lint` (worktree root) | **exit 0** — first run caught the `no-unused-vars` above; second run (post-fix) clean across `apps/web`, `packages/runtime`, `packages/db`, `packages/reporting-render` |
| lint, as the runner sees it | `CI=true GITHUB_ACTIONS=true pnpm lint` (worktree root) | **exit 0** |

`packages/db`/`apps/web` gates (rule 8's other conditional gates) do not apply beyond the `pnpm
lint`/`pnpm typecheck` runs above — this ticket touches only `packages/runtime/tests` and one
README; no `packages/db/tests` file, no SQL function, and no `apps/web` file changed, so the whole
web unit suite and any Playwright walk are out of scope.

**Not run** (explicitly out of scope, per the ticket's own text and RIG.md): the drivers themselves
against a real World/database. RIG.md: "Runtime e2e spawners: four admit a `clara_l<NN>` database
name (work-journal, trade-invoice, staff-expense-claim, periodic-adjustment); seven others admit
only `clara_rt_test` and `clara_wave_b_ci`" — none of the 23 files' actual e2e behavior was
exercised this session; only their gate-check source text and syntax were verified. This matches
the ticket's own "Out of scope: Actually running the drivers that were not exercised this wave."

## Docs

`packages/runtime/README.md`: added a new "#1018 — one shared local-database gate for every
standalone World e2e driver" section describing the module, the drift it replaces, and the census
test; edited the stale #980-era paragraph that named "one shared `tests/local-db-gate.mjs`" as a
"standing follow-up" to point at the new section instead of leaving an inaccurate claim in place.
`CONTEXT.md` not touched — this ticket introduces no new accounting/product vocabulary, only
internal test-infrastructure structure.

## Successor contract

None. No frozen chat/Work-tool surface (`chatTurn_v*`, `claraWork_v*`, or their closures) is
implicated — this ticket touches only `packages/runtime/tests` (test-only files, never imported by
any workflow body) and one README.

## Follow-ups worth filing

- None new. The one follow-up this ticket itself resolves (one shared local-database gate) is
  closed; AC2/AC3's own census cell is now the standing guard against future drift.

## Unverified

- Whether the seven drivers this rig cannot reach (`clara_rt_test`/`clara_wave_b_ci`/
  `clara_intake_ci`-only) behave identically end-to-end after conversion — not run, per the
  ticket's own "Out of scope" and RIG.md's per-lane database constraint. Their gate-check LOGIC is
  unit-proven (`local-db-gate.test.mjs`'s 14 cases exercise `assertLocalDbGate`,
  `allowedDbPattern` and `dsnAgreesWithEnv` directly, including the `outerOptionalSuffix` and
  both-DSN-checks shapes these drivers use) and their SOURCE is census-proven, but no actual
  `node tests/<file>.mjs` run against a live World was performed for any of the 23.
- Whether CI's own `db-live-gates` job sees this identically — not run there; the change touches no
  `CI`/`GITHUB_ACTIONS`-conditional logic in the drivers themselves (only the RIG.md-documented lint
  chain was re-run in CI mode, which is clean), so no difference is expected but this is not
  directly evidenced from this lane.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
