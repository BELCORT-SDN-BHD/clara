# Wave 1 · Lane 09 — final report

**Branch** `riders/w1-lane09` in `C:\Users\zhant\Desktop\clara-wt\659`, cut from `origin/main`
`dd3f8f1d`. Database `clara_l09` @ 127.0.0.1:55749. Two commits, both runtime-only, no migration,
no frozen file, no push, no PR, no GitHub write.

```
52601ff4 feat(runtime): #852 fold the chat-clarify belt into the sweep receipt
887ae5ac fix(runtime): #966 the intake recovery belt can no longer fail a live intake
```

`node scripts/check-frozen-workflows.mjs --print-closure` first: 312 modules across 299 entries.
None of this lane's subjects (`reconciler*.mjs`, `control.mjs`, `leader.mjs`, `spool.mjs`,
`intake.mjs`) is in any closure — verified by grepping the closure listing. Working tree clean.

---

## #852 — Surface the chat-clarify counters in the reconciler sweep receipt — **DONE**

Still live on `main` before building: `leader.mjs:240` called `reconcileChatClarifies` in its own
try/catch; `runReconcilerSweep`'s return statement carried no `chatClarify*` key.

| Acceptance criterion | Evidence |
|---|---|
| `isHookNotFound` / `resumePayloadFor` live where `reconciler.mjs` can import them without a cycle | New leaf `packages/runtime/lib/hook-resume.mjs` (zero first-party imports). `chat-clarify-sweep-wiring.test.mjs` cells 1–2: the leaf's import list is `[]`, and the belt's whole closure contains neither `lib/reconciler.mjs` nor `lib/control.mjs`. Cell 3 pins the ONE pre-existing cycle (`reconciler ↔ reconciler-wake`) by name so cell 2 is not a weakened global-acyclicity check. |
| The sweep result carries the five counters | Cell `#852 receipt: … all FIVE chat-clarify counters` — `chatClarifyResumed/Expired/Landed/ProbeFailed/SettleFailed` all `0` on a clean sweep, `beltErrors: []`. |
| A belt failure appears in `beltErrors` and does not throw out of the sweep | Cell `#852 receipt: a chat-clarify belt failure is NAMED …` — `beltErrors: ["chat clarify reconcile"]`, the `[reconcile] <belt> error:` log idiom, `swept.chatClarifyResumed === undefined` (the estate's "a failed belt contributes no counters" law), and belts behind it still ran. |
| The belt still runs before the rest of the sweep's belts | Cell `#852 order: …` drives a whole sweep against a scripted client and asserts the belt's probe is the statement immediately after the heartbeat, and ahead of `clarify expiry` and `reconcileTasks`. |

`control.mjs` now imports the two symbols from the leaf and **re-exports them by name**, so
`tests/unit.test.mjs` and `tests/control-work-question.test.mjs` resolve unchanged. `leader.mjs`
drops the import and the call and reads the counters off `swept` with `?? 0` (a failed belt
contributes none, and `undefined > 0` would read as "nothing happened").

**Deliberately left:** the belt's own resume/probe/settle logic (out of scope). The belt sits
*after* the heartbeat, not before it — the heartbeat is not a belt but the sweep's one deliberate
fail-fast, and nothing that breaks that single-row upsert would spare a belt on the same connection.

`parts-parity` refused on the new `...chatClarify` spread. The exemption ledger's fingerprint is the
sha of the whole normalised return statement, so all sixteen sibling tuples were re-fingerprinted —
recomputed with the gate's own `describeParitySite`, not hand-written, and commented in the house
"#640/#636 re-fingerprinted" shape.

## #966 — Intake recovery belt's sidecar opens cause Windows EPERM intake failures — **DONE**

Still live on `main` before building: `intake.mjs:436` called `listIntakeMetas()` (open + parse
every sidecar), and the `age < 5000` guard sat *after* the parse, at line 450.

**Measured on this rig first, not assumed** (`tests/intake-sidecar-race.test.mjs` cells 1–2, and a
scratch probe): a held `open(path,'r')` makes a `rename()` over that path `EPERM` every time; a
`stat()` does not block it at all; a tight reader loop against 500 bare renames lost **414**.

| Acceptance criterion | Evidence |
|---|---|
| ≥500 write attempts racing concurrent sweeps, zero `EPERM`-class failures | `p966.race` — 500 `writeIntakeMeta` calls against a tight `listIntakeMetas` loop: **0 failures, 3–6k concurrent sweeps**, and the last write is the body on disk. The same cell measured **428 of 500 failed** before the fix. |
| A sidecar inside the recency window is not opened, proven by a counted test double | `p966.quiet` — the fresh entry's `read` count is **0**, the settled entry's is **1**. |
| The belt still resumes an intake left mid-flight by a crash, past the guard | `intake-db.test.mjs` → `p966 the belt still recovers a crashed mid-flight intake` (real DB, real bytes, real finalize): inside the window `{recovered:0,deferred:0,expired:0}`; with the sidecar aged, `recovered:1`, intake `finalized`, task `queued`, spool cleared. Unit half: `p966.resume`. |
| The belt still expires a past-15-minute capability and clears its spool | `p966.expire` (unit: one `clara.fail_document_intake` call with `[id,"expired"]`, sidecar and `.bin` both gone) and `intake-db.test.mjs`'s `reconciler expires abandoned sidecars …` (DB). |
| The existing intake and intake-batch suites stay green | `intake-unit`, `intake-db`, `intake-reconcile`, `intake-recovery-unit`, `intake-recovery-db`, `intake-batch-unit`, `intake-authz-fixes`: 54 + 12 = 66 cells, all pass except the known #693 EICAR red (below). |

**Both halves shipped.** `spool.mjs`'s `atomicJson` renames through `renameIntoPlace`, which retries
only `EPERM`/`EACCES`/`EBUSY` against a deadline (`CLARA_SPOOL_RENAME_RETRY_MS`, default 2000 ms)
and surfaces every other code immediately; a rename that still fails removes its temp file rather
than leaving spool residue. `listIntakeMetaEntries()` returns `{name, path, mtimeMs, read()}` and
opens nothing; `listIntakeMetas`/`listTaskMetas` keep their exact old contract (including the
`{corrupt, file}` marker — cell `p966.listing`), expressed over the lazy shape so the two cannot
drift. The belt skips on `mtimeMs` **before** the open, then opens at most the ten it can act on,
and the quiet skip runs **before** the ten-item budget (`p966.budget`, `p966.quiet … BUDGET`).

**Consequence, stated rather than discovered:** an intake whose capability already expired but whose
sidecar was written in the last five seconds is expired on the NEXT sweep. The two DB cells
therefore age their fixture's mtime (`utimes`) instead of sweeping against a file they wrote in the
same millisecond — an abandoned sidecar IS old, which is what their names already claimed. The
alternative (turning the quiet window off in the fixture) would have proven the belt works with its
guard disabled. Knob: `CLARA_INTAKE_SIDECAR_QUIET_MS`, default 5000 — the same five seconds as
before.

**Deliberately left:** no change to the sidecar format, no move of intake status out of the
filesystem, no document-processing concurrency limit, no CI queue-drain work (all named out of
scope). No new sweep counter was added — the "not opened" proof is the counted double the criterion
asks for, and a new key on `...intakeRecovery` would have widened the sweep receipt.

---

## Vacuity controls (rule 4)

| Cells | Broken subject | Result |
|---|---|---|
| #852, all 5 behaviour cells | the pre-implementation tree | **7 of 7 red**, each for its own reason |
| #852 graph cells 2–4 | `reconciler-chat-clarify.mjs`'s import pointed back at `./control.mjs` | **3 red**; subject restored and `sha256sum -c` verified byte-identical |
| #966, 6 of 10 cells | the pre-implementation tree | **red**: `p966.race` 428/500 EPERM; `p966.quiet`/`budget`/`resume` on the old post-parse guard; `p966.listing` on the missing entries API |
| `p966 … crashed mid-flight intake` (DB) | `CLARA_INTAKE_SIDECAR_QUIET_MS=0` | **red** (`recovered: 1` inside the window) — the guard is load-bearing, not decorative |

## Gates, with counts

| Gate | Result |
|---|---|
| `node --test tests/chat-clarify-sweep-wiring.test.mjs` | 8 tests, 8 pass |
| `node --test tests/intake-sidecar-race.test.mjs` | 10 tests, 10 pass |
| `node --test tests/control-chat-clarify.test.mjs tests/control-work-question.test.mjs` (lane DB) | 34 tests, 34 pass |
| `node --test tests/intake-db.test.mjs` (lane DB) | 12 tests, 12 pass |
| Every runtime test importing a changed module (33 files: `reconciler.mjs`, `leader.mjs`, `control.mjs`, `spool.mjs`, `intake.mjs`, `hook-resume.mjs`) | **392 tests, 387 pass, 1 fail, 4 skip** |
| `node scripts/check-frozen-workflows.mjs` | OK — 312 frozen files, no manifest diff |
| `node packages/runtime/scripts/check-parts-parity.mjs` | OK (after the re-fingerprint) |
| `pnpm typecheck` | exit 0 |
| `pnpm lint` | exit 0 |

`apps/web` and `packages/db` are untouched, so neither the whole web unit suite, nor a browser walk,
nor the db gate chain applies to this lane.

**The 1 fail is a known Windows-only red, not mine.** `intake-unit.test.mjs` →
`scanner rejects EICAR, encrypted PDF, and XML entity expansion`, failing with
`UNKNOWN: unknown error, open '…\eicar.bin'` — Defender removing the fixture between the test's own
plain `writeFile` and `scanFile`. This is #693, which RIG.md lists. Evidence it is not mine:
`git diff origin/main..HEAD -- packages/runtime/lib/scan.mjs packages/runtime/tests/intake-unit.test.mjs`
is empty, the fixture never goes through the spool, and it reds 3 of 3 runs in isolation.
**Worth noting for the orchestrator:** the file's own `eicarSkipForThisHost()` auto-skip probe did
NOT fire on this host this session, so the cell reds instead of skipping — while the EICAR-bearing
cell in `intake-db.test.mjs` passed in the same session.

**The 4 skips** are the documented "no `pg_dump` on PATH" Windows skips, all in
`leader-state.test.mjs` (`# SKIP pg_dump/psql not found on PATH`).

## Docs updated

- `packages/runtime/README.md` — new `## #852 — the chat-clarify belt inside the sweep receipt` and
  `## #966 — the intake recovery belt can no longer fail a live intake`, each in the same commit as
  its code.
- `CONTEXT.md` — **not touched, deliberately.** It carries product and accounting vocabulary; "sweep
  receipt", "belt" and "quiet window" are runtime mechanics and belong in the package README. No
  hunk on a shared file from this lane. The only other shared file I could have touched
  (`packages/db/package.json`, `apps/web/test/manifest.txt`, …) is untouched: runtime tests are
  glob-collected (`"test": "node --test … tests/**/*.test.mjs"`), so a new `*.test.mjs` needs no
  registration.

## Successor contracts

None. Neither ticket needed a chat-lane or Work-lane tool, a new `_vN` cut, or any change inside a
frozen closure.

## Follow-ups worth filing

1. **Break the `reconciler.mjs ↔ reconciler-wake.mjs` import cycle.** `reconciler-wake.mjs:27`
   imports `terminalFor` from `reconciler.mjs` while `reconciler.mjs:33` imports
   `reconcileWakeEngineTasks` from it. ESM resolves this rather than refusing it, so it is invisible
   until a TDZ bites. #852 moved its own two symbols into a leaf for exactly this reason;
   `terminalFor` is the same shape of shared pure helper and could take the same route.
   `chat-clarify-sweep-wiring.test.mjs`'s third cell pins the cycle by name today, and its own
   comment says to delete it and tighten cell 2 once the edge is gone.
2. **`eicarSkipForThisHost()` does not catch this host's Defender.** The probe passes while the
   in-test EICAR write is quarantined, so #693 reds instead of skipping — and inconsistently
   (`intake-db.test.mjs`'s EICAR cell passed in the same session). The probe should write and read
   back through the same path the cell does, or the skip reason should widen to the `UNKNOWN: …
   open` signature.
3. **`runReconcilerSweep`'s `intake artifact recovery` belt still falls back to zeroed counters**
   (`{recovered:0, deferred:0, expired:0}`) where every belt landed since states the opposite law —
   a failed belt contributes NO counters, and `beltErrors` names it instead. Pre-existing, outside
   both tickets, and a one-line change with one cell.

## Unverified

- **Hosted evidence: none.** Everything above is local, on `clara_l09` and this Windows host.
- The `p966.race` numbers (0 failures with the fix, 428/500 without) are a property of THIS host's
  contention. The cells assert the invariant, not the number; on POSIX the rename never contends and
  cell `p966.host` says so explicitly rather than passing quietly.
- The #636 production symptom (a 500 on the byte PUT at child 84 of 100 in
  `intake-batch-e2e.mjs`) is **not** re-measured here: that leg is standalone, needs a bootstrapped
  Workflow World, and bootstrapping one on this lane's database would red
  `rig-isolation.test.mjs` T10b (#866). The mechanism it attributed the failure to is closed and
  measured in a unit cell; the end-to-end re-measurement is the orchestrator's or a later lane's.
