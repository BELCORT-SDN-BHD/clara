# wave 1 · lane 06 · fix round 1

Branch `riders/w1-lane06`, worktree `C:\Users\zhant\Desktop\clara-wt\656`, db `clara_l06`
(127.0.0.1:55746). Playwright triple unused this round (no `apps/web` change).

```
de3b251a fix(runtime): #967 + #850 fix round 1 — a real drained failure, a masked error,
          two mislabels                                                          <- NEW HEAD
b89671ce docs(db): #963 fix round 1 — restore the migration-number qualifier, note
          0214's earlier wording
7f956c6b docs(db): #963 name the cross-migration body-pin convention 0233 relies on
c00fc8d4 fix(runtime): #967 drain each intake CI leg's queue before it exits
ebbaa2ee perf(runtime): #850 overlap the two-build drill's two scratch builds
```

`git status` clean at hand-off; `git log --oneline origin/main..HEAD` read first, per rule 1 — the
three landed commits (`ebbaa2ee`, `c00fc8d4`, `7f956c6b`) were not redone. Findings resolved come
from `docs/plan/active/riders-2026-09-20/reports/wave1-lane06-review-spec.json`. No push, no PR, no
GitHub write, no other worktree touched, no main checkout write (other than this report), no
subagent spawned, no process killed. Files changed this round: `packages/db/README.md`,
`packages/runtime/README.md`, `packages/runtime/tests/queue-drain.mjs`,
`packages/runtime/tests/queue-drain.test.mjs`, `packages/runtime/tests/two-build-cutover-e2e.mjs`,
`.github/actions/db-live-gates/action.yml` (the shared file rule 7 names — both this lane's own
hunks, `#967`'s near the top and `#850`'s at the drill step, kept at their existing positions).

---

## L06-963-A · major · #963 — the general rule dropped the migration-number qualifier, contradicted by 0234

**FIXED.**

**Reproduced first.** The ticket's own Context states the hazard precisely: the obligation binds a
later migration that recuts a pinned function "at a number BELOW" the pinning migration's. The
landed `packages/db/README.md` text dropped that qualifier in both the general rule (lines ~102-106
pre-fix) and the 0233-specific paragraph (~1392-1394 pre-fix), reading as if EVERY later recut owes
a re-measure. `packages/db/migrations/0234_legal_enforcement_mode.sql:478` recuts
`clara._accounting_work_egress_live(uuid,uuid)` — one of 0233's three pinned bodies — at a HIGHER
number, and does NOT re-measure 0233's pin (0233 is applied and unedited, as the work order's rule 5
requires); instead it pins its own pre-image of the same function ("THE SIX PINS",
0234:191-211) and asserts the recut applied (0234:940-943). As written, the doc told the next author
to do the one thing the house forbids, and the counter-example is the migration documented in the
very next section of the same README.

**The fix.** Restored the qualifier in both paragraphs ("a later migration whose OWN NUMBER is
BELOW the pinning migration's"), explained why the qualifier matters (migration numbers are
assigned per lane in advance and land out of chronological order), stated what a HIGHER-numbered
recut actually does (pins its own pre-image, leaves the earlier pin historical), and named 0234 as
the worked example in both places.

**Evidence:** `packages/db/README.md` lines 95-149 and 1406-1417 (see `git show b89671ce`);
`packages/db/migrations/0234_legal_enforcement_mode.sql:191-211,478,940-943` read directly to
confirm the mechanism.

## L06-963-C · minor · #963 — the quoted DRIFTED wording is not what 0214 actually raises

**FIXED.**

**Reproduced first.** `sed -n '218,224p' packages/db/migrations/0214_client_work_pack.sql` shows the
literal raise: `has DRIFTED from the pinned 0189 body` — not `has DRIFTED from its pinned body`, the
string the README quotes as "what an author actually sees," two sentences before citing 0214 as an
instance of the same convention. `grep -rln 'DRIFTED from its pinned body'
packages/db/migrations/` returns 0221/0224/0229/0231/0232/0233/0234 only.

**The fix.** Added the half-sentence the finding asked for: the wording settled into the quoted form
from 0221 onward, and 0214 (the first instance) reads the older form — both now stated in the same
paragraph, both grep-able from the README.

**Evidence:** `packages/db/README.md` lines 124-129 (see `git show b89671ce`);
`packages/db/migrations/0214_client_work_pack.sql:221` read directly.

## L06-967-B · major · #967 — waitForQueueDrain treated a FAILED run as drained

**FIXED, test-first.**

**Reproduced first.** `TERMINAL_RUN_STATUSES = ['completed','failed','cancelled']`
(`packages/runtime/lib/rollback-preflight.mjs:85`), so `censusNonTerminalRuns` excludes `failed` —
by design, for a rollback preflight. `waitForQueueDrain` reused that same census, so a run an
earlier leg left QUEUED, then driven to a genuine `failed` by THIS leg's own still-running engine,
simply disappears from the count and reads as "drained." The lane's own prior evidence
(`wave1-lane06-final.md`) is an instance of exactly this: leg 2's `FatalError`'d `storage_error` run
"drained" in 2008ms/10 polls, reported as proof of liveness rather than named as the failure AC3
exists to catch.

**Test-first.** Added two cells to `packages/runtime/tests/queue-drain.test.mjs` before touching the
implementation: (1) a run counted non-terminal on poll 1, then reported `failed` on poll 2 — must
throw naming it; (2) a run already `failed` on poll 1 (modelling the real shape found on this rig's
own `clara_intake_ci`: 106 pre-existing `failed` `documentIngest_v2` runs, each leg's own
already-resolved scope, all timestamped inside one prior local run) — must NOT throw. Ran RED first
(`Missing expected rejection` on cell 1); implemented `censusFailedRuns` plus a per-call baseline in
`waitForQueueDrain` (first poll snapshots currently-failed ids; a later poll throws only on an id NOT
in that baseline); ran GREEN. A blanket "any failed row present" rule — the more obvious fix — was
tried mentally against the same real data and rejected: it would have turned the gate red on nearly
every ordinary local run, which is AC2's "no assertion weakened" in reverse.

**Vacuity.** Mutated the throw condition to `false && newlyFailed.length > 0`: exactly cell 4
(the new "throws on newly-failed" cell) went red, all five others stayed green. Reverted
byte-for-byte (`diff` empty); re-ran: 6/6 green.

**Evidence:** `node --test tests/queue-drain.test.mjs` → 6/6 pass (`packages/runtime`, no
database — the file's own in-memory fake rig). Real-DB sanity: `select id, name from
workflow.workflow_runs where status = 'failed'` run directly against `clara_intake_ci`
(127.0.0.1:55746) confirmed the exact table/column shape and returned the 106-row baseline used to
design cell 2.

## L06-967-A · major, PARTIAL · #967 — no measurement existed; a clean one could not be produced on this rig

**PARTIAL — real progress, remainder deferred to CI. Documented rather than glossed over.**

**What I attempted.** The review's own suggested technique — reconstruct the pre-dd3f8f1d leg files
with `git show dd3f8f1d:... > ...`, run the three-leg chain with and without the fix on a fresh
`clara_intake_ci`, pipe leg 3 through `wc -l` — requires a genuinely FRESH ephemeral database for
each condition, exactly as CI creates one per job. I tried to create one:

```
create database clara_l06_pre967; PGDATABASE=clara_l06_pre967 pnpm db:migrate
```

**This failed and was rolled back**, and it is a real incident I am reporting rather than hiding:
migration 0154 asserts a CLUSTER-WIDE `clara` role count ("the clara role count moved from 14 to
18 -- this file mints no role and owes no roles-bootstrap twin"). Postgres roles are cluster-global,
not per-database, so a second from-scratch migration chain on the SAME cluster this lane's `clara_l06`
already migrated collides with that invariant — exactly the hazard `RIG.md` names ("never run a
second from-scratch chain on your cluster"). I dropped both throwaway databases
(`clara_l06_pre967`, `clara_l06_post967`) immediately. **Residual effect I could not undo**: the
migration attempt left 4 extra roles on this lane's OWN cluster before rolling back (`pg_roles` now
shows 18 `clara%` roles instead of 14). I did not use `CLARA_RIG_ALLOW_ROLE_SWEEP` (forbidden) to
clean this up. `clara_l06` itself is unaffected (verified: `select count(*) from clara.clients` on
`clara_l06` still returns 3, and none of the gates I ran — typecheck, lint, check-frozen-workflows,
check-parts-parity, `queue-drain.test.mjs` — touch `pg_roles`). Flagging this for the orchestrator;
I do not believe it affects any other lane (each lane has its own cluster per `RIG.md`).

**What I measured instead**, on this rig's own already-used `clara_intake_ci` (still on
127.0.0.1:55746 from the review's own prior runs), with `git show dd3f8f1d:...` copies of the two
leg files (no drain) run in the real chain order:

| leg | file | lines | result |
|---|---|---|---|
| 1 | pre-dd3f8f1d `intake-e2e.mjs` | 238 | PASS |
| 2 | pre-dd3f8f1d `intake-admission-e2e.mjs` | 1,109 | PASS |
| 3 | HEAD `intake-batch-e2e.mjs` (unchanged either way) | **11,309** | PASS, 5m33s |

Real, but nowhere near the ~1.27M-line shape — this rig's world was only moderately loaded, not
loaded the way whatever produced the original measurement was. The MECHANISM did reproduce
qualitatively: leg 2's own log filled with the same leftover-task reconciliation line (`[reconcile]
ingest task ... has no transport metadata in its sidecar — NOT dispatched`), once per stale row,
that #967 names as the dominant noise source.

**No clean POST-967 number on the same world.** Running `intake-e2e.mjs` (HEAD, WITH the drain)
next, on the world the pre-967 chain had just loaded, FAILED: `waitForQueueDrain: TIMED OUT after
30000ms` against ~165 permanently-undispatchable `ocr`-lane `document_processing_tasks` (0051 §2's
own transport-less guard, `reconciler-documents.mjs:396-413` — these can never dispatch without a
re-upload). This is a real, reproducible behavior, but it is an artifact of MY test ordering, not of
the fix: `intake-batch-e2e.mjs` (leg 3) had already run and left its own designed residue (README:
"an unassigned failed upload" is explicitly its own out-of-scope leftover, since nothing runs after
it), and I then ran leg 1 a SECOND time against that residue — an ordering no real CI job produces
(leg 1 always runs first, on a database nothing has touched yet). I did not attempt a `TRUNCATE` of
the queue tables to force a third clean run: `clara.agent_tasks` / `clara.document_processing_tasks`
carry FKs from `clara.operation_receipts`, `clara.accounting_work`, `clara.llm_usage_events` and
seven other tables, so a safe reset would need `CASCADE` with a blast radius well past this lane's
own queue-noise question, or a narrower hand-picked `DELETE` I did not have a verified-safe query
for within this round's time budget — I judged the risk of a second incident higher than the value
of a third number.

**What only CI can prove** (documented in both the action.yml comment and here, not left implicit):
the true controlled pair — a genuinely fresh ephemeral `clara_intake_ci`, the real leg order, once
per condition (with vs without the fix, necessarily from two separate job runs since one job never
runs a leg twice) — and the CI step's own wall clock AC1 also asks for. Recommended in the action.yml
comment: update it with that run's numbers once they exist.

**Evidence:** local run logs preserved this session at
`C:\Users\zhant\AppData\Local\Temp\claude\pre967-leg{1,2,3}.log` and
`...\post967-leg1.log` (not committed — scratch); `packages/runtime/tests/zz-pre967-*.mjs` were
deleted after use (`git status` confirms they are not tracked or left behind).

## L06-967-C · minor · #967 — the release risk was not named

**FIXED.**

Added one paragraph each to `.github/actions/db-live-gates/action.yml`'s comment and
`packages/runtime/README.md`'s `#967` block: the drain converts today's noisy-but-passing run into
a RED one on exactly the input the ticket was filed about (a capped `classify` task or a
transport-less `ocr` task that can never drain), intended, and the first CI run may expose it for
the first time. Cross-referenced the local reproduction from L06-967-A as a live instance of this
exact risk.

**Evidence:** `.github/actions/db-live-gates/action.yml` (top-of-file `#967` comment block);
`packages/runtime/README.md` lines ~1020-1030 (`git show de3b251a`).

## L06-850-A · major · #850 — the action.yml comment mislabeled a Windows-host figure as a CI figure

**FIXED.**

**Reproduced first.** The updated comment read "...is over an order of magnitude faster than the
78.0s CI measurement below", while the very next paragraph (same comment block) calls the same
78.0s/124s pair "Windows-host measurements, re-measured at the #637 fix-round closure review." Two
labels for one number, in the same block, contradicting each other — and the "order of magnitude"
argument rests on the wrong one.

**The fix.** Rewrote the paragraph: the 78.0s/124s pair is a Windows-host measurement, not a CI one;
no CI scratch-build cost has ever been recorded; neither the absolute seconds nor a ratio against
this rig's 5-6s can be reasoned about yet, because the comparison this rig CAN make (5-6s vs 78s) is
between two Windows hosts, not this rig vs CI.

**Evidence:** `.github/actions/db-live-gates/action.yml` lines ~411-421 (`git show de3b251a`).

## L06-850-B · major · #850 — the background build was never awaited before scratch cleanup, and could mask the real error

**FIXED, reproduced both ways.**

**Reproduced first, deterministically.** Injected `if (process.env.CLARA_L06_850B_INJECT === "1")
throw new Error("INJECTED-TEST-FAILURE-L06-850-B")` immediately inside the drill's main `try` block
(before the file's own `await chatBuildPromise`), then ran the ORIGINAL code (no await, no
try/catch around `removeScratchTree()`) three times:

```
[tb-e2e] removeScratchTree() failed... (this line did NOT exist pre-fix — see below)
TWO-BUILD CUTOVER E2E: FAIL
 Error: EBUSY: resource busy or locked, rmdir '...\.scratch\two-build\previous-chat'
    ... at removeScratchTree (scratch-image.mjs:177:3)
    at main (two-build-cutover-e2e.mjs:1228:7)
```

3/3 runs: `EBUSY`, thrown from the `finally`, REPLACING the injected error — `grep -c
"INJECTED-TEST-FAILURE" <log>` returned **0** in all three logs. The exact mechanism the finding
named, reproduced on demand rather than argued.

**The fix.** `if (chatBuildPromise) await chatBuildPromise.catch(() => {});` immediately before
`removeScratchTree()`, and `removeScratchTree()` itself wrapped in its own try/catch that logs and
continues rather than throwing from the `finally`.

**Re-ran with the same injection, WITH the fix**: the real error surfaced cleanly (`Error:
INJECTED-TEST-FAILURE-L06-850-B` at `main (...:629:58)`), the "previous-chat" build's own "built in
4.8s" log line appeared before the FAIL line (proving the await actually waited), and the scratch
tree was removed without error (`ls .scratch/two-build/` → `No such file or directory`, i.e. clean
removal, not a crash).

**Happy path unaffected.** Two full runs with no injection, `node tests/two-build-cutover-e2e.mjs`
against `clara_rt_test` (127.0.0.1:55746, `RELAY_TEST_MODE=1`): PASS, 43.3s and 45.6s (both legs,
same assertions).

**Evidence:** logs preserved this session at `...\Temp\claude\850b-original.log` (3 runs, mask
reproduced), `850b-with-fix.log` (fix confirmed), not committed (the injection line itself was never
committed — restored from a pre-injection backup and `node --check` + a clean run confirmed no
injection code remains: `git diff packages/runtime/tests/two-build-cutover-e2e.mjs` shows only the
intended 18-line change).

## L06-850-C · major · #850 — the contention risk was argued from a 24-core host, unstated

**FIXED (documented; no code guard — reasoned below).**

Added the reviewer's own measurement (idle 5.1s vs 36.9s / 7x under one concurrent `pnpm typecheck`,
and a `pollTask` timeout inside the claraWork leg under that load) to both the action.yml comment
and `packages/runtime/README.md`'s `#850` block, with an explicit instruction to read the first CI
run for both the step's wall clock and any new `pollTask` timeout. Did not add the suggested
`os.availableParallelism()` guard: GitHub-hosted runners are 2-4 cores, exactly the low-parallelism
case such a guard would treat as "not enough headroom," which would disable the overlap on the
platform #850 targets. Left as an explicit orchestrator decision, as the finding itself framed it
("a cheap guard IF the orchestrator wants one").

**Evidence:** `.github/actions/db-live-gates/action.yml` lines ~399-411; `packages/runtime/README.md`
`#850` block (`git show de3b251a`); the underlying measurement is the reviewer's own
(`wave1-lane06-review-spec.json`, finding `L06-850-C`), cited rather than re-derived.

## L06-STD-A · minor · #850 — wide hunk in a shared file

**No fix required — the review's own verdict.** `required_fix: "None required. Flagged so the
orchestrator integrates this file deliberately."` This round's OWN action.yml edits (L06-967-A/C,
L06-850-A/C documentation) add further hunks to the same file, all at the SAME two existing
positions (the `#967` block near the top, the `#850` block at the drill step) — no new position
introduced, consistent with the shared-file discipline the finding asked for.

---

## Gates re-run, with counts

- `pnpm typecheck` (worktree root): `packages/runtime` Done, `apps/web` Done. Exit 0.
- `pnpm lint` (worktree root): exit 0, including `apps/web`'s own self-test batteries (all PASS)
  and `packages/reporting-render`'s eslint.
- `node scripts/check-frozen-workflows.mjs`: OK, 312 frozen files verified, 55 modules
  frozen+registered, 3 retired, no manifest diff.
- `node packages/runtime/scripts/check-parts-parity.mjs`: OK, reader ⊇ emittable holds.
- `node --test tests/queue-drain.test.mjs` (packages/runtime): 6/6 pass (3 pre-existing + 3 new).
- `node tests/two-build-cutover-e2e.mjs` (packages/runtime, against `clara_rt_test`): 2 clean runs,
  PASS, 43.3s / 45.6s — plus 4 additional runs under a deliberate fault injection while diagnosing
  L06-850-B (3 pre-fix reproducing the mask, 1 post-fix confirming the surface-cleanly behavior),
  injection code fully removed afterward (`git diff` shows only the intended change).
- Did not re-run `apps/web`'s whole unit suite or any `e2e` spec (no `apps/web` file touched).
- Did not re-run `operation-census.test.mjs` / `rig-isolation.test.mjs` (no `packages/db/tests` file
  touched — only `packages/db/README.md`, a doc).

## Docs updated

`packages/db/README.md` (§963), `packages/runtime/README.md` (§967, §850),
`.github/actions/db-live-gates/action.yml` (both comment blocks) — all in the same commits as the
code/doc change they describe.

## Successor contracts

None. No frozen closure, no PRD/ARCHITECTURE edit, no migration.

## Follow-ups worth filing

1. **The stray cluster roles from the L06-967-A incident** (18 `clara%` roles on lane 06's own
   cluster, port 55746, vs the expected 14) — I did not attempt a fix (`CLARA_RIG_ALLOW_ROLE_SWEEP`
   is forbidden). Worth an orchestrator decision on whether this cluster needs a clean rebuild
   before it is reused, or whether it is disposable per the beta-phase ruling.
2. **AC1's real number is still unmeasured** (L06-967-A). The first CI run of the Slice-5 step is
   the only safe source of it on this repo's current tooling; a future ticket could add a
   `--drop-if-exists` fresh-world helper scoped to `clara_intake_ci` alone (never touching roles or
   other databases) so a local lane can reproduce this AC without the cluster-wide role hazard.
3. **`waitForQueueDrain`'s failed-run baseline is per-call, not per-CI-job.** If a genuinely new
   `failed` run appears BEFORE a leg's own assertions finish (rather than during the drain wait
   itself), today's baseline (taken at the drain call) will not catch it, because it is already
   `failed` by the time the baseline snapshot is taken. Each leg's own assertions already require
   their own admitted work to reach a non-`failed` terminal status first, so this is believed to be
   theoretical for the two current callers — named here rather than silently assumed.

## Unverified

- The CI step's own wall clock for the two-build drill (AC1 of #850) and for the three intake legs
  (AC1 of #967) — this lane's rig has no CI runner access, stated plainly in both action.yml
  comments; only the next CI run proves them.
- Whether the stray 4 cluster roles (follow-up 1) affect any OTHER gate on this rig beyond the ones
  re-run above — not exhaustively checked.
