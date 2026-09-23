# Wave 3, Lane 09, Ticket #989 — final report

**Ticket:** Install Combobox/Popover without clobbering the owner-ruled Button
**Branch:** `riders/w3-lane09` · **Worktree:** `C:\Users\zhant\Desktop\clara-wt\659` · **Base:** `ffe63a0dd084e99b84c1368119845be273c421ce`
**Commits (this ticket's three, on top of #970's four already-landed commits):**

```
afa6df2c8 fix(web): #989 fix the bare cn import the CLI's file-write step never rewrites
3034622c1 feat(web): #989 install around a protected file instead of aborting the payload
ec4263f69 feat(web): #989 checkGuard names installable files alongside blocked ones
```

No migration: `git diff ffe63a0dd084e99b84c1368119845be273c421ce..HEAD --stat -- packages/db/migrations`
is empty. This ticket was expected to need none, and did not.

## RESUME note

An earlier implementer of this ticket was killed mid-work by a usage limit. `git log
ffe63a0dd084e99b84c1368119845be273c421ce..HEAD` at session start showed only #970's four commits —
no #989 commits had landed. The worktree held one uncommitted change: `apps/web/package.json` (+`"cn":
"^0.3.0"`) and a matching `pnpm-lock.yaml` diff — the residue of a real `ui:add` run whose own `pnpm
remove cn` cleanup step had failed (a transient Windows nested-pnpm spawn error, reproduced and
explained below). No migration file existed (none was expected). The uncommitted `cn` entry was
resolved as part of this session's own live rehearsal (`pnpm remove cn` succeeded cleanly there),
leaving `package.json`/`pnpm-lock.yaml` byte-identical to `HEAD` before any of this ticket's own
commits — confirmed via `git status --porcelain` / `git diff --stat`. No other uncommitted work
existed to judge or continue.

## The contract used

`gh api repos/BELCORT-SDN-BHD/clara/issues/989` (the `gh issue view --comments` CLI produced no
output in this environment for an unrelated reason — the REST API call was used instead and returned
the issue cleanly): **0 comments** — the issue body is the only Agent Brief, dated 2026-09-19, and
carries no 2026-09-20 owner ruling comment to supersede it. It was verified live on this branch
(the guard's current all-or-nothing behaviour and the Popover CLI failure it describes were both
reproduced before writing any code — see "Live rehearsal" below).

## Seams tested at (written before building, per the work order's rule 4)

1. **`checkGuard`** (`scripts/ui-add.mjs`) — the guard's whole protected-vs-installable decision, as
   one pure function. Driven directly against fixture payloads (both the existing `BUTTON_CONTAINING_
   PAYLOAD` and a new, live-measured `COMBOBOX_PAYLOAD`).
2. **`main()`** (`scripts/ui-add.mjs`) — the whole guarded CLI flow, driven through its existing
   dependency-injection seam (`resolveFiles`/`spawnAdd`/`backupProtectedFiles`/`restoreProtectedFiles`/
   `rewriteLocalImports`/`stripLocalDependencies`), exactly the seam #969's own tests already used.
3. **`snapshotFile`/`restoreFileSnapshot`** (new, exported) — the byte-identity primitive, driven
   directly against a throwaway temp file, never a real repo file.
4. **`rewriteLocalDependencyImport`** (new, exported) — a pure string substitution, driven directly
   against literal source strings.
5. **The real, pinned `shadcn` CLI (4.19.0)**, live, not a network call inside the selftest — the
   house convention `check-ui-add-guard.selftest.mjs`'s own header already states ("a network call
   has no place in a gate every PR runs"). Recorded below as the "Live rehearsal."

## Acceptance criteria, each with its evidence

- **[x] Installing a component whose closure names exactly one protected file installs every other
  file and reports which one it skipped and why.**
  `checkGuard` now returns `installable` alongside `blocked`; `allowed` is false only when NOTHING
  non-protected remains to install (commit `ec4263f69`). `main()` acts on this: for Combobox's real,
  live closure (`button.tsx` protected; `input.tsx`/`textarea.tsx`/`input-group.tsx`/`combobox.tsx`
  not), the CLI is invoked (never the whole-payload abort) and the report says `SKIPPED 1 protected
  file — restored to its pre-install content, never silently overwritten: components/ui/button.tsx.
  Everything else in the payload installs normally.` (commit `3034622c1`). LIVE: `node scripts/ui-add.mjs
  combobox` (real, no override) — exit 0, `components/ui/combobox.tsx` created, `input.tsx`/
  `textarea.tsx`/`input-group.tsx` updated, `button.tsx` untouched. Unit evidence: `check-ui-add-guard.
  selftest.mjs`, "partial install, protected file(s) skipped (#989)" section, all 5 cases green.
- **[x] The protected file's content is byte-identical before and after; it is never silently
  overwritten and no interactive confirmation is needed in a non-interactive run.**
  The CLI is forced to `-o/--overwrite` ONLY for this partial-install case (never duplicated if the
  caller already passed it), so a non-interactive run (stdin closed) never hits the CLI's own
  per-file prompt — MEASURED (2026-09-23) that with stdin closed the prompt defaults to "N" and
  would otherwise silently skip EVERY already-existing file, protected or not. `button.tsx` is
  snapshotted before that call and restored after, so the guard's OWN restore — never the CLI's
  behaviour — is what proves byte-identity. LIVE: `sha256sum components/ui/button.tsx` before
  (`1be7d29c0c3…`) and after the real `combobox` install (`1be7d29c0c3…`) — IDENTICAL; `git status`
  after the run does not list `button.tsx` at all. Unit evidence: `snapshotFile`/`restoreFileSnapshot`
  round-tripped against a throwaway temp file (2 cases), plus the `main()` partial-install case
  asserting the backup/restore calls and their argument identity.
- **[x] The existing override path still lets a reviewed, explicit run overwrite a named protected
  file, exactly as before.**
  `partialSkip` (the new branch) is gated `blocked.length > 0 && !override`, so an override run takes
  none of the new code paths: no forced `--overwrite`, no backup, no restore — `argv` is forwarded
  verbatim exactly as before #989 (commit `3034622c1`). LIVE: `CLARA_UI_ADD_OVERWRITE=1 pnpm ui:add
  combobox --dry-run` shows `OVERRIDE USED … proceeding despite 1 protected file(s)` and the CLI's
  own preview listing `button.tsx` as `overwrite`, identical to pre-#989 behaviour. A REAL override
  install was attempted live and the pinned CLI itself crashed with a host-memory OOM before writing
  anything (`git status` afterward was clean — nothing was touched); this is the same host-contention
  class covered under "Unverified" below, not a defect in the override path, which the `git status`
  and three dedicated unit cases (`[AC3]` in the selftest) already prove does not touch
  `backupProtectedFiles`/`restoreProtectedFiles`/`rewriteLocalImports` and does not force
  `--overwrite`.
- **[x] Installing Combobox succeeds and leaves the protected Button file untouched.**
  LIVE, 2026-09-23: `node scripts/ui-add.mjs combobox` (real, no override) — exit 0. Created
  `components/ui/combobox.tsx`; updated `input.tsx`/`textarea.tsx`/`input-group.tsx`; `button.tsx`
  hash unchanged (above) and absent from `git status`. `combobox.tsx`'s own `cn` import already reads
  `from "@/lib/utils"` (see the next criterion — the rewrite ran on it too, since it also resolves the
  `cn` local stand-in). All four non-protected files were reverted (`git checkout --`/`rm`) after
  recording this evidence, since building anything that CONSUMES Combobox is explicitly out of this
  ticket's scope (Agent Brief).
- **[x] Installing Popover succeeds and produces the vendored Popover files.**
  LIVE, 2026-09-23: `node scripts/ui-add.mjs popover` (real) — exit 0, `components/ui/popover.tsx`
  created. **This criterion was NOT actually satisfiable by "the file exists" alone** — see the finding
  below. With the #989 import-rewrite fix, `popover.tsx`'s `import { cn } from "cn"` (the CLI's own,
  unrewritten output) becomes `import { cn } from "@/lib/utils"`, which resolves correctly once
  `stripLocalDependencies` removes the real `cn` npm package (confirmed live: `node -e "require.resolve('cn')"`
  throws `MODULE_NOT_FOUND` after the run, and `popover.tsx` no longer references it). `git status`
  after the run showed only the new file — `package.json`/`pnpm-lock.yaml` carried no `cn` residue.
  The file was reverted (`rm`) after recording this evidence, matching the README's own established
  convention for `avatar.tsx` (#969's own rehearsal).
  **A genuine, previously undiagnosed defect, found and fixed as part of this criterion:** #969's own
  header and `components/ui/README.md` both claimed "the CLI's file-WRITE step correctly rewrites [a
  bare `cn` import] to this project's own `@/lib/utils` alias." MEASURED FALSE (both `popover.tsx` and
  a live `avatar.tsx` rehearsal land on disk still importing `from "cn"`). Since `tsconfig.json`
  includes every `**/*.tsx` whether referenced or not, an unrewritten import means `pnpm typecheck`
  would fail on ANY vendored file using this placeholder — this is precisely why Popover's install did
  not actually "succeed" in any sense that survives the next gate before this fix. `attachment.tsx`/
  `message-scroller.tsx` (#970) needed the identical substitution done BY HAND for exactly this reason.
  `rewriteLocalDependencyImport` (pure) + `defaultRewriteLocalImports` (real-fs) now do it
  automatically, gated identically to the `cn` dependency strip (commit `afa6df2c8`).
- **[x] The guard's self-test gains a case for the partial-install-with-skip outcome, alongside the
  all-or-nothing-abort and full-override cases it already covers.**
  All 6 PRE-EXISTING `main()` cases (whole-payload abort ×3, override ×1, no-false-positive ×1,
  byte-identity-across-a-refusal ×1) pass UNCHANGED — `BUTTON_CONTAINING_PAYLOAD` happens to name
  `button.tsx` AND `pagination.tsx`, both on the allowlist, so it is genuinely the all-protected case
  and needed no change. 5 NEW cases cover the partial-install outcome (forced `--overwrite`,
  backup/restore, dry-run reporting, override-unaffected, no-duplicate-flag); 2 more cover
  `snapshotFile`/`restoreFileSnapshot`; 8 more cover the `cn` import rewrite. **46 `testCase(` call
  sites, 45 real cases (the 46th match is the harness's own `async function testCase` definition), all
  green** (see Gates).

## Live rehearsal (real, not selftest fixtures — recorded here per house convention, never run in CI)

1. `sha256sum components/ui/button.tsx` → `1be7d29c0c3d8f7d52f9878dc1a6afdf39ad4eb60bef7537fa6ee8c20e03ddf0`
2. `node scripts/ui-add.mjs combobox --dry-run` (no override) →
   `[ui-add] a REAL run would install 4 file(s) and SKIP 1 protected file (owner-ruled fixes recorded
   in-file, left byte-identical): components/ui/button.tsx.` — the CLI's own preview still lists the
   full 5-file/2-dep closure (`button.tsx`/`input.tsx`/`textarea.tsx`/`input-group.tsx` overwrite,
   `combobox.tsx` new, `cn`+`@base-ui/react` deps).
3. `node scripts/ui-add.mjs combobox` (real, no override) → exit 0. `✔ Created 1 file:
   components\ui\combobox.tsx`; `ℹ Updated 4 files: button.tsx, input.tsx, textarea.tsx,
   input-group.tsx`; `[ui-add] SKIPPED 1 protected file — restored to its pre-install content…`;
   `[ui-add] dropped 1 bogus local dependency stand-in(s)… cn`.
4. `sha256sum components/ui/button.tsx` → **same hash as step 1**. `git status --porcelain` did not
   list `button.tsx`. `combobox.tsx`'s `cn` import read `from "@/lib/utils"`.
   `input.tsx`/`textarea.tsx`/`input-group.tsx` diffed non-trivially (63 insertions/55 deletions
   combined — the routine `/50`→`/70` ring-alpha re-cut these files need on every fresh vendor
   install, per `components/ui/README.md`'s own existing "Not every hand edit earns a place on the
   list" note; re-applying that hygiene is out of this ticket's scope since shipping Combobox is).
   All four reverted (`git checkout --`/`rm`).
5. `node scripts/ui-add.mjs popover` (real) → exit 0. `✔ Created 1 file: components\ui\popover.tsx`;
   `[ui-add] dropped 1 bogus local dependency stand-in(s)… cn`. `popover.tsx`'s `cn` import read
   `from "@/lib/utils"`. `git status --porcelain` listed only the new file. Reverted (`rm`) after.
6. An attempted live rehearsal of the OVERRIDE path on Combobox
   (`CLARA_UI_ADD_OVERWRITE=1 node scripts/ui-add.mjs combobox --overwrite`) crashed the pinned CLI
   itself with `FATAL ERROR: Zone Allocation failed - process out of memory` before any file was
   written (`git status --porcelain` immediately after was clean, `button.tsx`'s hash unchanged) — a
   host-memory event, not a guard defect; see "Anything unverified."

**A second finding, environmental, not code:** `pnpm ui:add <name>` (the package-script wrapper,
which itself runs under `pnpm`) intermittently failed its own `pnpm remove cn` cleanup step with `The
system cannot find the path specified.` — a nested-pnpm-under-pnpm spawn glitch on this Windows host.
Invoking `node scripts/ui-add.mjs <name>` directly (bypassing the `pnpm ui:add` wrapper layer)
reproduced cleanly every time in this session, including the exact backup/restore/rewrite/strip flow
above. This is almost certainly what left the RESUME implementer's `cn` residue uncommitted — not a
defect in the guard's own logic, which never differs between the two invocation paths. Not fixed here
(out of this ticket's scope, and the workaround — call the script directly — is already this repo's
own documented pattern in several places); worth a follow-up if it recurs.

## Gates, with counts

- **`scripts/check-ui-add-guard.selftest.mjs`** (the one test file this ticket touched — a
  `check-*.selftest.mjs` gate wired into `pnpm lint`, not `test/manifest.txt`, per house convention):
  run standalone (`node scripts/check-ui-add-guard.selftest.mjs`) — **45/45 cases pass**, confirmed
  twice, identically, after each of the three commits.
- **`pnpm typecheck`** (root): clean — `apps/web` and `packages/runtime` both `Done`, exit 0.
- **`CI=true GITHUB_ACTIONS=true pnpm lint`** (root, the wave-3 addendum's own required form): **exit
  0 on retry** after one host-contention OOM (`packages/runtime`'s `eslint` crashed with `Fatal
  process out of memory` on the first attempt — MEASURED unrelated to this ticket: `packages/runtime`
  has no file this ticket touches, and current free physical memory was ~14 GB when retried,
  consistent with a transient spike rather than sustained exhaustion). The retry ran the WHOLE chain
  clean: `check-frozen-workflows`/`-evaluators`/`-leaks`/`-dead-citations`/`-document-region-field-
  paths`/`-wiki-dynamic-sql` + their selftests, `dsn-pipe`/`world-gate`/`dispatch-model-guard`
  selftests, `eslint scripts`, then `pnpm -r lint` across `apps/web` (including `check-token-contrast`,
  `check-test-manifest`, `check-message-keys`, and `check-ui-add-guard.selftest` — all green),
  `packages/db`, `packages/runtime`, and `packages/reporting-render` — no error anywhere in the log
  (`grep -inE "ERR_PNPM|ELIFECYCLE|error|Fatal|FAIL "` on the full transcript: zero matches).
- **`apps/web` WHOLE unit suite** (`node scripts/run-tests.mjs`, since `apps/web` was touched): first
  attempt showed **136 file-level failures**, every one MEASURED as a host-crash exit code (`134`
  SIGABRT/OOM ×26, `2147483651`/`0x80000003` ×42, `3221225477`/`0xC0000005` ACCESS_VIOLATION ×1,
  `3221225725`/`0xC00000FD` STACK_OVERFLOW ×3, `3221225773`/`0xC000012D` COMMITMENT_LIMIT ×4,
  `3221225794`/`0xC0000142` DLL_INIT_FAILED — RIG.md's OWN documented host-contention code — ×1,
  `3221226505`/`0xC0000409` ×15, and the 18 remaining "exit 1" cases each carrying the identical
  `Fatal process out of memory` banner in their own captured stderr) — no assertion failure, no
  `ERR_TEST_FAILURE` content mismatch, anywhere. **Retried once** (RIG.md's own "retry once" posture
  for `0xC0000142`-class host contention): **4848 tests, 4846 pass, 0 fail, 2 skip, 155.2s** — an
  EXACT match to #970's own last-known-good figure on this same lane
  (`reports/wave3-lane09-ticket970.md`: "4848 tests, 4846 pass, 0 fail, 2 skip"). This confirms zero
  regression from this ticket's own change (which touches no file any of the 136 first-attempt
  failures named — `components/registers/*`, `components/parts/*`, etc. — import or exercise).
- **No browser walk applies**: no `apps/web/e2e/*.spec.ts` file was touched.
- **No `packages/db/tests` or SQL function was touched**: `operation-census.test.mjs`/
  `rig-isolation.test.mjs` do not apply; no migration exists to gate.
- **No `packages/runtime`/frozen-workflow file was touched**: `check-frozen-workflows.mjs` (part of
  the root lint chain above) reports clean; no manifest diff.

## Docs updated

`apps/web/components/ui/README.md` (all three commits): a new "If SOME of the payload is protected…"
paragraph under "The install guard" describing the partial-install shape; the `cn`-import section
retitled and rewritten to state the MEASURED behaviour (the CLI does NOT rewrite the import) instead
of the disproven #969 claim, and to describe the new automatic fix; the "Proof" section's live-
rehearsal description extended to name the Combobox/Popover runs recorded above. `scripts/ui-add.mjs`'s
own module-header comments (the `#969` block and the `LOCAL_DEPENDENCY_NAMES` doc comment) are
corrected the same way, in place, rather than left contradicting the code beside them. `CONTEXT.md` was
not touched — nothing here is new ACCOUNTING/PRODUCT domain vocabulary (this is build-tooling
vocabulary internal to `scripts/ui-add.mjs`), matching #970's own precedent on this file.

## Successor contract

None. This ticket touches no frozen chat/Work-tool surface — `scripts/ui-add.mjs` is a local,
dev-time CLI wrapper around the `shadcn` binary, never a door, a part kind, or a prompt stanza.
Nothing here needs a `chatTurn_v22`/`claraWork_v6` entry.

## Follow-ups worth filing

1. **#667 is unblocked for Combobox's own install path**, but #667 itself still needs to actually
   land Combobox (this ticket deliberately reverted every vendored file after proving the install
   works, per its own "Out of scope: Building any feature that consumes Combobox or Popover"). Whoever
   picks up #667 should expect to redo the `/50`→`/70` ring-alpha hygiene on `input.tsx`/`textarea.tsx`/
   `input-group.tsx` by hand, the same routine `components/ui/README.md` already documents for every
   other already-vendored file.
2. **The `pnpm ui:add` wrapper's own nested-pnpm `cn`-strip flake** (see "Live rehearsal," second
   finding) — intermittent, reproducible workaround exists (call `node scripts/ui-add.mjs` directly),
   never observed to affect the guard's OWN decision logic, but worth a dedicated ticket if it recurs
   for a future install, since it is what stranded the RESUME implementer's uncommitted change this
   session opened with.
3. **Popover was never root-caused as "exits 1 in the CLI itself"** the way the original #657 report
   measured it (AC13's own words). This session's live `popover --dry-run`/`popover` runs both
   succeeded at the CLI level, on the SAME pinned 4.19.0 — the actual, reproducible defect this session
   found and fixed was the unrewritten `cn` import, not a CLI exit. Whether #657's own measurement was
   a different, transient host/network condition or has since been fixed upstream in the registry's own
   hosted content is unresolved and not reproducible now; not investigated further since the ticket's
   own AC ("Installing Popover succeeds and produces the vendored Popover files") is satisfied either
   way.

## Anything unverified

- **The override path's REAL, live, non-dry behaviour on a partial payload** (as opposed to
  `--dry-run`, which WAS run live) — the one live attempt crashed the pinned CLI itself on a host
  OOM before writing anything (see "Live rehearsal," step 6). The override path is otherwise proven:
  unchanged by inspection (gated `!override`, never reached), by the existing pre-#989 override unit
  case (unchanged, still green), and by three NEW dedicated `[AC3]` unit cases asserting no forced
  flag/backup/restore. Not re-attempted a third time in this session to avoid adding further load to
  a shared, already-contended host mid-wave.
- **Whether `packages/runtime lint`'s OOM and the whole-unit-suite's 136-failure OOM wave were caused
  by THIS lane's own concurrent activity or by another lane on the shared host** — not distinguished;
  both are consistent with RIG.md's own documented host-contention class, and both cleared on a single
  retry with no code change.
- **Hosted/production behaviour** — everything above is local (this lane's rig; no DB migration or
  runtime change exists for this ticket to begin with, so no hosted verification applies).
