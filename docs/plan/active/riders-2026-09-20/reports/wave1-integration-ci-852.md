# Wave-1 integration, PR #1025 db-estate red: #852's two chat-clarify-sweep-wiring cells

Worktree: `C:\Users\zhant\Desktop\clara-wt\int`, branch `integration/riders-w1`.
Fix commit: `13c64b03b1de74f29ba0ad5eb47f959c3e504283` (parent `f6d828b2c`, already pushed head of PR #1025 before this fix).

## The defect, restated with evidence

CI's `db-estate` job on the Linux runner reported the runtime suite at 2879 tests, 2850 pass,
**2 fail**, 27 skipped, both failures in
`packages/runtime/tests/chat-clarify-sweep-wiring.test.mjs`:

- line ~150: `"#852 receipt: the sweep's own result carries all FIVE chat-clarify counters"` —
  `assert.deepEqual(swept.beltErrors, [], ...)` got `['spool TTL sweep']`.
- line ~161: `"#852 receipt: a chat-clarify belt failure is NAMED in beltErrors and never throws
  out of the sweep"` — expected `['chat clarify reconcile']`, got
  `['chat clarify reconcile', 'spool TTL sweep']`.

Both cells were green on this Windows host.

## Root cause, with file/line evidence

Both cells call the real `runReconcilerSweep(client, deps)`
(`packages/runtime/lib/reconciler.mjs`), whose **last unconditional belt** is:

```
packages/runtime/lib/reconciler.mjs:765
  const spool = await belt("spool TTL sweep", () => sweepSpoolTtl(), { spoolRemoved: 0 });
```

`sweepSpoolTtl()` (`packages/runtime/lib/spool.mjs:450`) calls `ensureSpoolDir()`
(`spool.mjs:445`), which does:

```js
export async function ensureSpoolDir() {
  const { dir } = spoolConfig();
  await mkdir(dir, { recursive: true, mode: 0o700 });
  return dir;
}
```

`spoolConfig()` (`spool.mjs:23`) resolves the directory as:

```js
const defaultDir = process.platform === "win32" ? join(tmpdir(), "clara-spool") : "/data/spool";
return { dir: process.env.CLARA_SPOOL_DIR || defaultDir, ... };
```

Off Windows, with `CLARA_SPOOL_DIR` unset, the default is the absolute path `/data/spool`, so
`mkdir(..., { recursive: true })` must first create `/data` at filesystem root. On a runner
process that does not own `/`, that `mkdir` fails with `EACCES`, `sweepSpoolTtl()` rejects, the
`belt()` wrapper (working exactly as designed — this is the #852/Wave-E containment contract)
catches it and pushes `"spool TTL sweep"` into `beltErrors`. That is an environment accident, not
a chat-clarify defect, but it lands in the same `beltErrors` array the two cells assert on
exactly, so both go red.

On Windows, `spoolConfig()`'s default is `join(tmpdir(), "clara-spool")`, which always exists
(or is trivially creatable under the user's own temp directory), so the belt never throws here —
which is exactly why the cells were green on this host and red on the Linux runner.

## Reproduction

Reproduced for real, twice:

1. **Under WSL** (Node at `/opt/node/bin/node`, worktree visible at
   `/mnt/c/Users/zhant/Desktop/clara-wt/int`), as the `runner` user (uid 1000, matching GitHub
   Actions' own default account name):
   ```
   $ id
   uid=1000(runner) gid=1000(runner) groups=1000(runner),986(docker)
   $ mkdir /data
   mkdir: Permission denied
   ```
   Running the unmodified test file with `CLARA_SPOOL_DIR` unset:
   ```
   /opt/node/bin/node --test packages/runtime/tests/chat-clarify-sweep-wiring.test.mjs
   ```
   reproduced the **identical two reds**, byte-for-byte the same assertion diffs quoted in the
   defect report (`['spool TTL sweep']` vs `[]`, and `['chat clarify reconcile', 'spool TTL
   sweep']` vs `['chat clarify reconcile']`); the other 6 cells in the file stayed green.

2. **Direct call**, to nail the exact syscall: a one-line script importing `sweepSpoolTtl` and
   `spoolConfig` from `spool.mjs` and calling `sweepSpoolTtl()` under the same WSL user printed:
   ```
   resolved config: { dir: '/data/spool', quotaBytes: 536870912, ttlMs: 3600000 }
   THROWS: EACCES EACCES: permission denied, mkdir '/data'
   ```
   confirming the mechanism exactly as read from source, not just inferred.

(Repro scratch files were removed from the worktree before committing; only the test file itself
was left changed.)

## The house pattern (option a) — and why not option b

`packages/runtime/tests/reconcile-belt-isolation-unit.test.mjs`, whose assembly cells
`chat-clarify-sweep-wiring.test.mjs` explicitly sits beside (its own header says so), already
carries the fix for this exact class of problem, at line 42:

```js
process.env.CLARA_SPOOL_DIR = join(await mkdtemp(join(tmpdir(), "clara-belt-iso-")), "spool");
```

set once at module top level, right after its imports, before any `test()` registers. Every one
of its ~20 `runReconcilerSweep` calls therefore runs against a fresh, writable, per-run temp
directory and never touches `/data`. `chat-clarify-sweep-wiring.test.mjs` was simply missing this
line — it imports `runReconcilerSweep` and calls it in three cells (lines 165, 182, 203) with no
`CLARA_SPOOL_DIR` set anywhere in the file.

I checked whether this is instead a **product** defect (option b — a missing directory should be
an empty sweep, not a belt error). It is not that: the failure here is not "the directory is
absent so there is nothing to sweep" — `ensureSpoolDir()` already handles a missing leaf directory
by creating it. The failure is "the process lacks permission to create an *ancestor* directory
(`/data`) that only exists at all by convention in a real deployment's mounted volume." In a real
deployment, `/data` is expected to pre-exist with the right ownership; when it or `CLARA_SPOOL_DIR`
is genuinely wrong or unwritable in production, naming that in `beltErrors` is exactly the
behaviour #852 exists to guarantee ("a failure that is only logged is one grep away from
invisible"). Silently treating an unwritable spool root as "nothing to sweep" would hide a real
misconfiguration. So the fix is (a): make the test hermetic, not loosen or reinterpret the
production behaviour.

## The fix

`packages/runtime/tests/chat-clarify-sweep-wiring.test.mjs`: added `mkdtemp`/`tmpdir` imports and
one top-level line (mirroring `reconcile-belt-isolation-unit.test.mjs`'s pattern, with its own
temp-dir prefix `clara-clarify-sweep-` so parallel test-file runs never collide on the same
mkdtemp target):

```js
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
...
process.env.CLARA_SPOOL_DIR = join(await mkdtemp(join(tmpdir(), "clara-clarify-sweep-")), "spool");
```

with a comment explaining the mechanism and pointing at the sibling file as precedent. No
assertion was loosened and no cell was skipped or deleted — both cells' exact `beltErrors`
expectations (`[]` and `['chat clarify reconcile']`) are unchanged.

## Scope check — the rest of wave 1's new runtime tests

Identified the files each lane's merge net-changed under `packages/runtime/tests/`
(`git diff --name-only <merge>^1 <merge>`):

- Lane 09 (`cfa0476f9`): `chat-clarify-sweep-wiring.test.mjs`, `control-chat-clarify.test.mjs`,
  `intake-db.test.mjs`, `intake-sidecar-race.test.mjs`.
- Lane 10 (`be89d5f54`): `periodic-adjustment-e2e.mjs`, `staff-expense-claim-e2e.mjs`,
  `trade-invoice-e2e.mjs`, `work-journal-db.test.mjs`, `work-journal-e2e.mjs`,
  `work-journal-serve.mjs`, `work-routes-unit.test.mjs`.

Grepped every one of those files for `runReconcilerSweep`, `os.tmpdir`/`tmpdir(`,
`process.env.HOME`, `CLARA_SPOOL_DIR`, `spoolConfig`, `sweepSpoolTtl`, absolute Windows paths, and
`process.platform`:

- `intake-db.test.mjs` and `intake-sidecar-race.test.mjs` already redirect `CLARA_SPOOL_DIR` to a
  per-test root (`process.env.CLARA_TEST_TMP_ROOT || tmpdir()`), saved/restored around each test —
  already hermetic, no change needed.
- `control-chat-clarify.test.mjs` only mentions `runReconcilerSweep` in a comment; it does not call
  it.
- All seven lane-10 files: no matches at all for any of the above patterns.

`chat-clarify-sweep-wiring.test.mjs` was the only gap in wave 1's new runtime tests.

## Gates

All run from the worktree root with
`export PATH="/c/Users/zhant/AppData/Local/pnpm:$PATH"` (Node 22):

- **The file itself, Windows**: `node --test packages/runtime/tests/chat-clarify-sweep-wiring.test.mjs`
  → `# tests 8`, `# pass 8`, `# fail 0` (was 6 pass / 2 fail before the fix, matching the CI report
  exactly).
- **The file itself, WSL** (same non-root `/data`-less environment that reproduced the red):
  same result, `# tests 8`, `# pass 8`, `# fail 0`.
- **`node scripts/check-frozen-workflows.mjs`**: `freeze-lint: OK — 312 frozen file(s) verified
  against frozen-workflows.json (append-only vs origin/main); 55 "use workflow" module(s) all
  frozen+registered; 3 retired entr(ies) recorded.` No manifest diff.
- **`pnpm typecheck`**: `packages/runtime typecheck: Done`, `apps/web typecheck: Done`. Clean.
- **`CI=true GITHUB_ACTIONS=true pnpm lint`**: exit 0 across all workspaces (`apps/web`,
  `packages/runtime`, `packages/reporting-render`), including the apps/web self-test suites
  (`check-token-contrast`, `check-test-manifest`, `check-message-keys`, `check-ui-add-guard`) all
  green.

Only `packages/runtime/tests/chat-clarify-sweep-wiring.test.mjs` was touched; `git status
--short` in the worktree shows exactly that one file before commit, and nothing else after.

## Unverified

- The full `db-estate` CI job on the Linux runner was not re-run from this worktree (no GitHub
  access from this session — pushing/opening PRs is explicitly out of scope for this task). The
  WSL reproduction used the same non-root, `/data`-less constraint the runner has (confirmed by
  the WSL account itself being named `runner`, uid 1000, matching GitHub Actions' own default
  runner account), and reproduced the exact two assertion diffs quoted in the defect report, so
  confidence is high, but the actual CI job result after this commit is unverified until PR #1025
  re-runs it.
- Whether `/data/spool` is genuinely how the hosted production runtime is configured (i.e.,
  whether `CLARA_SPOOL_DIR` is always set there, or `/data` is a pre-existing mounted volume) was
  not independently re-verified against deployment config in this session; the reasoning above
  relies on `spool.mjs`'s own default and the general shape of a mounted-volume convention, not on
  reading the hosting manifest.
