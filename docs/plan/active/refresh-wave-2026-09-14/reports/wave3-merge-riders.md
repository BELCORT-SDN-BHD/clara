# Wave-3 ← riders batch (`origin/main` c90ab2ba)

Merge **`41e10ec0`** on `integration/wave-3` (worktree `clara-wt\integration3`), plus one fix commit
**`2a82d4cc`**. Clean, nothing pushed, no other worktree touched.

## Conflicts (4) — file → what was kept

- **`e2e/e2e-fixture-ownership.test.ts`** — both sides had independently declared the SAME share
  (`get_work_plan_origin: [journal-work-mock, plans-mock]`). One entry, BOTH comments: ours' #640×#631
  provenance, theirs' #727 detail (which fixture Work ids each lane gates on).
- **`e2e/journal-work-walk.spec.ts`** — ours' `openDiagnostics` helper (5 call sites, #631's Activity
  tab) AND theirs' #760 move of the settle instrument to `./helpers` (`settleForScan`).
- **`ARCHITECTURE.md` §11 Agent row** — sentence-level union: theirs' three sentences (reporting-render
  on Node 22.23.2, its deploy-time gate, #693's EICAR skip) replacing the Node-20 one, plus ours' ten
  (`claraWork_v3`, capability registry, `chatTurn_v19`, the 281 / 264+17 / 51 counts). Checked
  mechanically: every line either side added since 03018948 survives verbatim.
- **`PROGRESS.md`** — both Completed entries (riders first, then wave 2). Current State stays ours, now
  at **c90ab2ba**, naming the riders batch (PR #817 + docs #819); its stale "local `main` equals
  `origin/main`" corrected — local `main` is `fcb47492`, docs-only ahead.

Everything else auto-merged. **One silent break**, caught by `tsc` (TS2304): #631's B3 walk cell called
the local `settle` that #760 renamed and moved → `2a82d4cc` points it at `settleForScan`.

## `scripts/ops/dsn-pipe.mjs` (theirs verbatim; wave 3 never touched it)

Only the entry-point guard changed — flags, CA handling, behaviour untouched. The old guard compared
`resolve(process.argv[1])` (lexical) with `fileURLToPath(import.meta.url)` (a realpath, since Node's ESM
loader resolves symlinks first). On macOS `os.tmpdir()` sits under `/var` → `/private/var`, so a copy
staged in a temp dir compared UNEQUAL: `main()` never ran, the process exited 0 having done nothing, and
the selftest's "a missing CA FAILS CLOSED" cell read that 0 as a FAIL — root `pnpm lint` red on every
Mac, green on Linux CI (#756). It is now an exported `isEntryPoint(argv1, moduleUrl)` realpathing both
sides (new `realpathSync` import), falling back to the lexical form if a side cannot be realpathed.
Runbook invocations are unaffected.

## Counts (all LOCAL)

`pnpm typecheck` **0** · `pnpm lint` **exit 0**, incl. the riders' `check-dead-citations` (**clean**) and
leak-scan. After `@clara/runtime build`: freeze-lint **OK (281 files, 51 modules)** · `--compare-base
origin/main` **OK (264 unchanged, 17 additions)** · parts-parity **OK** · workflow-bundle **OK (chatTurn
v19, 51 superseded bodies, 40 checks)**.

**runtime units, rigw3b: 122 / 0 / 0** — ready 24, rollback-preflight 31, registry-view 7, work-bundle
16, chatturn-v18 16, v19-tools 17, v19-knowledge-context 11.

**World legs, rigw3b:** work-egress **PASS (3)** · version-cutover **ALL PASS** (derives `chatTurn_v19`
AND runs #708's scoped verdicts) · chat-turn-v19 **PASS (4)** · work-question **PASS (7) on the re-run**;
run 1 timed out in leg 3 at 64 000 ms — the riders' #745 budget (`leaseWaits×(2 s+2 s)+60 s`) is tighter
than the 90 s constant it replaced. Named as host load, not weakened.

**db, rig187 / `clara_187`, verbatim 27 gate flags:** rig-runtime-visibility **8/8** · x42b2 ×9
**17/0/1** · `wave-b/wb-0020-*` ×11 **131/0/4** · operation-census **10/10** · work-egress-authority
**31/31** · checkout-gate-c3 **69/69**. Also all **27 riders-touched db test files** re-run on the 0195
chain: **458/0/4** and **193/0/4** — no pinned count or roster of theirs collided with 0195, so no census
widening was needed.

**web:** whole unit suite **3719 / 3717 pass / 0 fail / 2 skip** (196 s; the 2 are env-gated
`live-provider-auth`). Walks on 3250/3251/3252: `journal-work` **20/20**, `chat-parity` **7/7**.

## Unverified

Everything hosted. The two-build v2→v3 drill was **not re-run** (outside this task's list): the blocker
in `wave3-integration.md` / ARCHITECTURE §10 is unchanged and still unruled. CI's db-estate and browser
suites. The riders' macOS numbers were not re-measured; their dsn-pipe selftests ran here only through
the root lint ladder, on Windows.
