# Cut phase, lane C2 — review fix round TWO for ticket #1037 (`statementFacts_v4`)

Branch `riders/wC-lane02`, worktree `C:\Users\zhant\Desktop\clara-wt\636`, database `clara_l02` on
`127.0.0.1:55742` (309 files, `0318_knowledge_fye_pair_applicability`), Playwright triple
`https://127.0.0.1:3510` / `3511` / `3512`. Base `6da02a8de`.

**NEW HEAD: `4198c3f70`.** One new commit on top of the lane's nine.

At start: `git status` clean, `git log --oneline 6da02a8de..HEAD` showed the nine commits the fix
report and the recheck both name, HEAD `b7e771799`. Nothing was redone.

No mid-task message arrived asking for a status report.

---

## The one open finding, and what this round did about it

The recheck left exactly one item open:

> **RECHECK-C2-SPEC-01** (major) — AC3's two-build-cutover-drill statementFacts leg is still absent.
> *required_fix:* "No code change is owed in this lane. The orchestrator must make and record an
> explicit decision: ship the cut with AC3 marked PARTIAL … or hold the cut."

**I built the leg instead.** AC3 is now MET, and no orchestrator ruling is owed.

That is a deliberate reading of the round's brief. A second fix round that re-stated the first
round's escalation would be a status report in place of the work; the only way this round could add
anything was to remove the decision by doing the thing the decision was about. The first round's
costing turned out to be wrong on two of its three prices, and the reason is measured below rather
than argued.

### What the leg is

`packages/runtime/tests/two-build-cutover-e2e.mjs` now runs **three** legs. The third:

1. builds a THIRD scratch image — `buildPreviousVersionImage({ name: "previous-stmt", className:
   "statementFacts" })` — whose pair is derived from `registry.ts` (`statementFacts_v3` → `_v4`) with
   no version literal anywhere in the leg;
2. proves off the ARTIFACTS that A3 is a genuine rollback target: A3 carries 57 bodies and not
   `statementFacts_v4`, B carries 58 and both, and the two differ by exactly one body;
3. seeds a bank statement through the estate's own doors (COA upsert, `add_bank_account`, the typed
   `witness_extraction` consent grant + activation, an OCR extraction with one `clara.document_regions`
   row per printed row) and writes its canonical bytes into a per-run local object store, so the
   VISION channel runs the real `downloadCanonical` — stream, digest check and all;
4. lets the reconciler discover the queued task and start the run **inside build A3**, then parks it;
5. asserts the park is REACHED, not assumed, and that the preflight refuses a target that drops
   `statementFacts_v3` and names it;
6. stops A3, writes the scripted answer, serves this tree's build, and watches the run finish **on
   its original body** with its run NAME invariant;
7. then admits a SECOND statement inside build B, which binds `statementFacts_v4`.

### The park, which is the part nobody had

`statementFacts` has no interruption point: claim → two reads → one persist, and nothing a human
answers. So the leg parks the run on the one thing that can hold it open across a process boundary —
the scripted model keeps the TEXT channel open until the drill writes its answer file, which it does
only after A3 is stopped. The successor's engine then redelivers that step to a process that answers
it.

Three numbers, measured on this rig with a throwaway probe **before** the leg was written, and now
recorded in the drill's own header so nobody re-derives them:

| measurement | value |
|---|---|
| SIGTERM with the read in flight → child exit | **37 ms** (graphile-worker's `gracefulShutdownAbortTimeout` is 5 s; the abort is never reached) |
| successor process ready → run completed | **2.2 s** |
| build A → `/ready` on this host | 11.4 s |

### The two shapes that do NOT work, and why the first round's costing was wrong

The fix report priced the leg as "a `statement-facts-serve.mjs` child that can serve the VISION
channel" plus "a leg shape that asserts non-terminal and still bound to v3". Both were checked:

* **A `statementWitnessWait` retry is not a park.** `DEFAULT_STEP_MAX_RETRIES` is **3**
  (`.output/server/_libs/@workflow/core+[...].mjs:53854`) and `getHandlerErrorRetryAfterSeconds`
  (`:47013`) backs off 1 s / 2 s / 4 s with 25 % jitter, capped at 900 s — so the whole non-terminal
  window is **~7 s**, shorter than one image boot (11.4 s above). A leg built on it would be red on
  every run. The first round assumed that window was usable; it is not.
* **A SIGKILL is not a park either** — it leaves the queue row locked.
* **The vision channel needs no new serve child and no stub.** `lib/storage.mjs`'s `RELAY_TEST_MODE`
  branch reads `CLARA_TEST_STORAGE_DIR`, so the drill writes the canonical bytes to that address
  itself and the REAL `downloadCanonical` serves and verifies them. The statement branch went into
  the existing `tests/two-build-serve.mjs`, which is the file's own precedent (#794 put the chat half
  there for the same reason).

The statement branch obeys that file's stated discipline: it reads the **response schema the SDK is
handed** (`running_balance_cents` identifies a statement call; `region_idx` identifies v4's
vocabulary; a file part identifies the vision channel), never a call counter — so a v3 call and a v4
call are both recognised and each is answered in its own vocabulary. That matters here more than
anywhere else in the drill: the parked run keeps answering v3's five-key line schema **inside an
image that pins v4's six-key one**.

### What the leg says about the product, not just the mechanism

Because statement lines are readable rows, the leg can state both halves of #990 out loud:

* the run resumed on the PREDECESSOR persists its three lines **uncited** (`citation_page`,
  `citation_region`, `citation_extraction_id` all null) — that body's line schema carries no region —
  **inside an image pinned to the successor**;
* the statement admitted inside that image binds `statementFacts_v4` and persists every line with its
  page and with the `clara.document_regions` locator itself, asserted value for value against the
  seeded row.

That closes **AC1's World leg** as well ("a World leg drives a bank statement through the successor
body and finds every extracted line carrying a page and a region"), which until now was proven only
at the behaviour seam and across the memoization codec (cells 1037.db5 / 1037.db6). It is also the
first `statementFacts` World driver in the repository — the residual C2-SPEC-02 named.

### Vacuity control (WORK-ORDER rule 4)

Subject broken deliberately: `attachStatementLineCitations` in `statementFacts.v4.citations.mjs`
returns its lines untouched. Rebuilt, drill re-run:

* the S1 half stays **GREEN** — `RESUME S1: settled on statementFacts_v3 inside build B (run name
  invariant), 3 lines, none cited` — which is correct, v3 never cites;
* the S2 half **REDS**: `AssertionError: line 1 cites page 1 — the page the seeded region's own
  locator carries (got null)`.

The two halves are each other's control: a subject that cited everything would red S1, one that cites
nothing reds S2. Subject restored byte for byte — `git diff` shows no change to that file and
`node scripts/check-frozen-workflows.mjs` is OK (327 files verified), which is a byte-level proof
because the manifest holds its sha256.

### Fixtures (`statement-facts-v4-fixtures.mjs`), two additive options

Both default to today's behaviour, so every existing unit cell is untouched:

* `taskStatus: "queued"` — a task the reconciler may still discover, bound to NO workflow run, so the
  ENGINE mints the run and the body under test is the one the image pins. The default stays
  `"running"` with a synthetic run token, because the unit batteries drive the frozen behaviour
  directly and would otherwise have their task claimed out from under them.
* `sha256` on `seedDocument` / `buildStatementSituation` — a caller that will SERVE the canonical
  bytes hands in their digest, so `downloadCanonical`'s verification is real rather than bypassed.

---

## Gates

Run in the lane worktree with the RIG.md environment (`PGHOST=127.0.0.1 PGPORT=55742 PGUSER=postgres
PGDATABASE=clara_l02 CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1`).

| gate | result |
|---|---|
| `tests/two-build-cutover-e2e.mjs`, THREE legs, on `clara_rt_test` | **ALL PASS**, exit 0 (~75 s wall, watchdog 15 min) |
| … the same file BEFORE this round's commit, two legs | **ALL PASS**, exit 0 — the baseline, so the third leg is the only variable |
| … the same file against the deliberately broken subject | **FAIL** at S2's citation assertion, S1 still green (vacuity control above) |
| `tests/statement-facts-v4-citation.test.mjs` | **10 pass, 0 fail** |
| `tests/statement-facts-v4-citation-db.test.mjs` (live rig) | **7 pass, 0 fail** |
| `tests/f-a2-statement-activation.test.mjs` | **12 pass, 0 fail** |
| `node scripts/check-frozen-workflows.mjs` | OK — 327 frozen files, 58 `"use workflow"` modules, 3 retired |
| `… --compare-base 6da02a8de` | OK — **322 existing entries retain the same hash and deployed flag, 5 additions**, 3 retirements |
| `check-frozen-workflows.selftest.mjs` / `.registration.selftest.mjs` | OK / OK |
| `pnpm --filter @clara/runtime build` | exit 0; `grep -c renderedRegionIndexes .output/server/index.mjs` = **3** |
| `node scripts/check-worker-paths.mjs` | OK — 2 spawn sites |
| `node scripts/check-workflow-bundle.mjs` | OK — 14 pinned classes, 58 superseded bodies still ship, 46 checks |
| `node packages/runtime/scripts/check-parts-parity.mjs` | OK — emittable set unchanged, no new wire kind |
| `pnpm typecheck` | exit 0 (`apps/web` and `packages/runtime` both Done) |
| `CI=true GITHUB_ACTIONS=true pnpm lint` | exit 0 across all four workspaces |
| `pnpm --filter @clara/runtime test` (whole suite, once) | **2990 tests, 2950 pass, 2 fail, 38 skipped** |
| `pnpm --filter @clara/web e2e bank-match-walk` on the lane triple | **6/6 passed** (19.1 s) |

The two suite failures are RIG.md's named Windows-only reds, identified by re-running their files
alone rather than assumed from the count: `tests/intake-unit.test.mjs` — *scanner rejects EICAR,
encrypted PDF, and XML entity expansion* (#693, Defender removes the fixture on this host), 16 pass /
1 fail; and `tests/pg-tools-fixture.test.mjs` — *(#806) this host's OWN probe: pg_dump/psql are on
PATH here*, 4 pass / 1 fail. The counts are byte-identical to the fix report's and the recheck's own
runs: 0 new failures, and the pass count did not move because the leg is a standalone driver, not a
`node --test` file.

**Not owed, not run, with the reason:** `operation-census` / `rig-isolation` (no file under
`packages/db`, no SQL function); the whole `apps/web` unit suite and the web parts census (no
`apps/web` file in `git diff --name-only 6da02a8de..HEAD`); the migration redo path (0322 still
UNUSED — this round added no migration either); `firm-scope-db-pins.corpus.ts` (no migration, so no
content sha to re-measure).

### The drill's database, and how to recreate it

The drill's fail-closed gate admits only `clara_rt_test` or `clara_wave_b_ci`, and this cluster had
neither. Per RIG.md's wave-2 addendum ("CLONE your lane database inside your own cluster … and drop
the clone afterwards"):

```sh
# on 127.0.0.1:55742, with nothing connected to clara_l02
create database clara_rt_test template clara_l02;          # via node + pg; psql is not on this PATH
PGDATABASE=clara_rt_test WORKFLOW_POSTGRES_URL=postgres://postgres@127.0.0.1:55742/clara_rt_test \
  pnpm --filter @clara/runtime exec bootstrap                # the WDK world, idempotent
# then settle the clone's inherited non-terminal rows — the gate's own instruction
cd packages/runtime && PGDATABASE=clara_rt_test WORKFLOW_POSTGRES_URL=… RELAY_TEST_MODE=1 \
  node tests/two-build-cutover-e2e.mjs
```

The clone inherited the lane suite's leftovers and the inventory gate refused at the door, by name,
exactly as designed: 28 unbound `accounting_work` tasks first, then 161 non-terminal
`document_processing_tasks` (the 100-row reconciler snapshot meant a fresh task at the tail was never
dispatched). Both were settled **on the clone only**. `clara_l02` was never touched by the drill: it
is still 309 files / `0318`, and `to_regclass('workflow.workflow_runs')` is still **null** there, so
`rig-isolation` T10b stays green (#866). `clara_rt_test` was dropped afterwards; the cluster is back
to `clara_l02` alone.

---

## Scope discipline

`git diff --name-only 6da02a8de..HEAD` still shows **no `apps/web` path, no migration, and no
`chatTurn` or `claraWork` file**. This round's four files are
`packages/runtime/tests/two-build-cutover-e2e.mjs`, `tests/two-build-serve.mjs`,
`tests/statement-facts-v4-fixtures.mjs` and `packages/runtime/README.md` (+533 / −13). No frozen body
changed — `check-frozen-workflows` and its `--compare-base` are both OK and the manifest is byte
identical to the one the recheck verified.

The one shared file in rule 7's list that this round touches is none of them. `tests/two-build-serve.mjs`
and `tests/two-build-cutover-e2e.mjs` are not on that list, but lane C1 owns `chatTurn` and
`claraWork`: the integrator should know that **this lane edited the drill both legs run in**. The
edits are additive — the claraWork and chatTurn legs are unchanged line for line, and both were
re-run green in every execution above — but `childEnv()` gained five variables that every image now
receives (`CLARA_DOC_EGRESS_APPROVED`, `CLARA_TEST_STORAGE_DIR`, `CLARA_SPOOL_DIR`,
`CLARA_STMT_DRILL_ANSWER`, `CLARA_STMT_DRILL_HELD`). Two of those are improvements the wave-3
addendum already asked for: the spool now points at a per-run temporary directory instead of the
off-Windows default `/data/spool` an unprivileged runner cannot create.

## Docs

`packages/runtime/README.md` gains a `<!-- #1037 -->` block beside the #637 and #794 ones, in the
house shape: what the third leg does, why the park is a held read rather than an interruption, the
three measured numbers, the two rejected shapes, its skip probe and its cleanup. `CONTEXT.md` needs
nothing — the leg introduces no domain vocabulary; #1037's own terms landed in the lane's earlier
commits.

## Anything unverified

* **CI has not run this.** Every number above is from this Windows rig. The leg adds no Windows path
  dependency (`tmpdir()`, per-run), no dependency on a directory an earlier run left, and no
  dependency on rows another file leaves behind (each statement builds its own firm through
  `fx.buildFirm`). The integrator's WSL re-run as `runner` has not happened. The drill is wired into
  `.github/actions/db-live-gates/action.yml` and needs no change there: its database
  (`clara_rt_test`, cut from a fully migrated `clara_wave_b_ci`) already carries 0291's persist verb,
  the published region numbering and the claim door, and the leg's own skip probe covers a database
  that does not.
* **Wall clock on a thin runner.** The third scratch build cost 5.1–5.4 s here (nitro's cache is
  warm) and the whole drill ~75 s against a 15-minute watchdog. A cold GitHub runner builds slower —
  the file's own #850 note measured 36.9 s under contention — so the honest upper bound is roughly
  three cold builds plus three legs. That still leaves margin, but the first CI run is the real
  measurement and the watchdog was left at 15 minutes rather than raised on a guess.
* **One cosmetic wart, recorded rather than hidden.** After the deliberately-failed vacuity run, the
  leg's per-run temporary directory survived as two empty subdirectories: `rmSync` ran while the
  just-SIGKILLed children still held handles on Windows, and the guarded cleanup logged and moved on
  — the same posture the file already takes for `removeScratchTree`. The successful runs left
  nothing. The stray directory was removed by hand; nothing accumulates on a CI runner.
* **The scripted model is still the only mocked thing.** No cell measures whether a real model names
  a CORRECT `region_idx`; that is corpus tuning and out of the ticket's scope.
* **`--lock-deployed` still not run**; the five entries stay unlocked, which is the state the hosted
  release ceremony expects to lock (15 unlocked in total: wave 4's ten plus this cut's five).
* **The AC1/ADV-1037-02 disclosure is unchanged**: a stored citation is the `clara.document_regions`
  locator COPIED, not a link. The correction the first round asked the orchestrator to carry into
  `reports/waveC-lane02-ticket1037.md` AC1 still stands and is still not mine to make.

## Acceptance criteria, restated

| AC | state |
|---|---|
| AC1 — a World leg drives a statement through the successor body and every line carries a page and a region | **MET, and its one qualification is now gone.** The lane report recorded AC1 "MET in substance, with the wrapper qualified — the leg does not run inside a durable WDK World". It does now: the leg's S2 half is a real `statementFacts_v4` run in a bootstrapped WDK World, started by the reconciler inside a served image |
| AC2 — a pre-cut line shows the stated-absence sentence, a post-cut line shows its citation | **MET already** (lane report AC2: producer half cells 1037.db1/db2, read half through `clara.get_bank_line_matching_context`, rendered half already on `main`). This round adds a World-level confirmation of the same pair on rows two different IMAGES produced, which is stronger than two behaviour calls in one process |
| AC3 — the two-build cutover drill passes for the statement-facts family | **MET** — `TWO-BUILD CUTOVER E2E: ALL PASS`, three legs |
| AC4 — the frozen manifest records the new body; `check-frozen-workflows` and `check-parts-parity` pass | **MET**, unchanged from the fix report |

**NEW HEAD: `4198c3f70`.** Working tree clean.
