# Wave 2026-09-15 — integration fix round 1 on the re-based branch

Branch `integration/wave-2026-09-15` @ **`4db773c4`**, worktree `C:\Users\zhant\Desktop\clara-wt\int`,
clean. **One commit, twelve files, +333 / −40** (one new file, `packages/runtime/tests/pinned-work-bundle.mjs`).
The branch is now **156 commits ahead of `origin/main` (`7e40e3be`), 370 files changed, +85,311 / −650**.

**Nothing pushed, no PR, no ticket worktree touched. No migration edited** (`git diff --name-only 9ec330da..HEAD`
names zero files under `migrations/`), **no frozen file edited**, `docs/PRD.md` and `docs/ARCHITECTURE.md`
untouched (`git diff --name-only origin/main -- docs/` is empty). **Everything below is LOCAL. Hosted
evidence: none, anywhere in this wave.**

**Headline.** Eight reds, four causes. Six were one cause — the successor cut moved the `claraWork`
pin and six standalone World scripts were still pinned to the pre-cut bundle by a LITERAL; they are
now anchored on the registry's own pin through one self-checking helper, and two more scripts the
same grep found went with them. One was behavioural and is the cut's too: `claraWork_v4` parks an
acquisition on #639's dependent particulars question, and the pre-cut e2e waited for a terminal
status the run can no longer reach until a person answers — that leg now answers it, which makes it
the **first live execution of #639's `claraWork_v4` half anywhere**. Four browser cells were a
latent #804 migration miss from before this leg's window. One was a pre-existing test's blind spot
that this wave's rig recipe exposes. One was the host, and says so only because it was re-run alone.

---

## 1 · Verdict table

| # | Leg | Red | Verdict | Where it was fixed |
|---|---|---|---|---|
| 1 | runtime | `work-journal-e2e` :411 digest mismatch (v3 digest vs v4) | **REAL — merge artefact of the cut** | `tests/pinned-work-bundle.mjs` + the file's banner/id reads |
| 2 | runtime | `work-question-e2e` "the Work records the v2 digest" | **REAL — same class** | same |
| 3 | runtime | `periodic-adjustment-e2e` :399 `clara-work/v3` | **REAL — same class** | same |
| 4 | runtime | `staff-expense-claim-e2e` :451 `clara-work/v3` | **REAL — same class** | same |
| 5 | runtime | `work-egress-e2e` "A: served by the v3 bundle" | **REAL — same class** | same |
| 6 | runtime | `chat-turn-v19-e2e` :422 "that bundle is now v3" | **REAL — same class** | same |
| 7 | runtime | `fixed-asset-acquisition-e2e` pollWork timeout, posted + `awaiting_input` | **REAL — behavioural, the cut's designed shape** | the file's three poll sites + a new leg 2b |
| 8 | runtime | `interview-e2e` `driveClientToComplete` no terminal within 90 s | **ENVIRONMENT — host contention** | not fixed; re-measured isolated, ALL PASS |
| 9–12 | browser | `home-board-walk.spec.ts` four `home.facets.*` cells | **REAL — latent since `f6aaac73` (#804), pre-dates this window** | four `await seed(page);` lines |
| 13 | db-estate | `rig-reset-guard.test.mjs` cell 1 | **PRE-EXISTING (#773) blind spot, exposed by the wave's rig recipe** | the test's own ENV buffer |

Two files were re-anchored that were **not** on the failure list, named here rather than folded in:
`work-cancel-e2e.mjs` (green, but its "the world-start banner names the serving bundle digest"
assertion was passing against **v3's** banner — a true-looking witness to a body no run was served
by) and `chat-turn-v20-e2e.mjs` (correct today, stale at the next cut). Nine scripts now read the
bundle from one place.

---

## 2 · The six stale-pin scripts, and why the grep missed them

`12cdc528` repointed `workflows.claraWork` v3 → v4. Its fix round re-anchored **eleven**
`node --test`-collected cells on `registry.workflowPins`, found by a whole-suite grep. These six are
**standalone scripts**: they are wired one line at a time in `.github/actions/db-live-gates/action.yml`
(lines 141, 153, 168, 196, 214, 231, 248, 265, 290) and `packages/runtime/package.json`'s `test`
script only collects `tests/**/*.test.mjs`, so the grep never reached them.

The failure mode is worse than a stale constant. `plugins/startWorld.ts:274-292` logs **one banner
per RETAINED body** — v1, v2, v3 and v4 all print — so each script's

```js
const m = /\[clara-runtime\] bundle clara-work\/v3 digest=([0-9a-f]{64})/.exec(line);
```

kept matching after the pin moved and captured **v3's** digest. Nothing said the assertion had
changed subject; `work-journal-e2e` then compared a v4 Work row against a v3 banner, and
`work-cancel-e2e`, which only asserts the banner is truthy, went on passing while measuring the
wrong body.

**The anchor is one file, and it checks itself.** `packages/runtime/tests/pinned-work-bundle.mjs`:

* `pinnedClaraWorkBody()` reads `claraWork: "claraWork_vN",` out of `workflows/registry.ts` **as
  text** — these parents run as plain `node tests/<file>.mjs` with no tsx loader registered (the
  TypeScript is loaded inside the child they spawn), which is the same reason
  `chatturn-v18.test.mjs` reads `REGISTRY_SRC` for the pin LINE. The trailing comma is the boundary,
  not `\b`: `claraWork_v1` is a prefix of `claraWork_v10`.
* `pinnedClaraWorkBundleId()` does **not** guess `clara-work/vN` from the pin's name. It derives the
  candidate and then requires `workflows/claraWork.vN.bundle.ts` to declare `id: "clara-work/vN",`
  itself, throwing by name if the two ever stop agreeing.
* `pinnedClaraWorkBannerRe()` escapes the literal prefix **by rule** and proves the regex against a
  sample banner before returning it.

That last point was paid for in this session. The first attempt hand-escaped the prefix in a shell
heredoc, one backslash was eaten, `\[clara-runtime\]` became the **character class**
`[clara-runtime]`, the capture never landed — and because `waitReady()` calls `waitBooted()` inside
its own `try { … } catch { /* booting */ }`, every one of the nine legs failed with
`serve child did not become ready (/health + /ready 200)`: a sentence about the server for a fault
in that one line. A manual `/ready` probe returned `200` with every check `ok` in ~28 s, which is
what separated the two. The self-check now refuses to hand out a regex that cannot match its own
banner shape, and the reason is written above the function.

**What each file now reads.** The banner regex and every `work.bundle.id` / `bundle_id` literal come
from the helper. Four scripts that had no id assertion at all (`work-journal`, `chat-turn-v19`,
`chat-turn-v20`, `work-cancel`) gained one — that missing assertion is exactly what let this class
through, since a digest comparison alone cannot say *which body* the digest belongs to. Three
sentences that named a version ("…served by the UNCHANGED frozen bundle: nothing about this lane
needed a new workflow version") were re-worded to the claim that is still true after the cut: the
lane minted **no bundle of its own**.

---

## 3 · `fixed-asset-acquisition-e2e` — the acquisition parks, and now the leg answers it

**Not a defect. The pre-cut test measured v3's control flow.** `claraWork.v4.ts:188-266` is explicit
about the one place it departs from v3: after a commit whose entry birthed a register row with no
method and no in-service date, it emits `awaiting_input`, opens ONE question, parks on the hook, and
settles `completed` only once that question is answered, expires, or is cancelled (and settles
`completed` with a named remainder if the open itself refuses — the successor review's F6). So
"the acquisition committed" and "the Work is terminal" are no longer the same instant.

This file's own second claim has always been **"THE ACQUISITION IS COMPLETE WHILE THE PARTICULARS
WAIT"** (header, item 2) and its fifth exists because "a parked question may be answered hours
later" (item 5). The park is the state those sentences describe; only the poll predicate disagreed.

**What changed.** Three poll sites (leg 1+2, leg 5's second acquisition, leg 4's crash-resume) now
wait for the **commit** — `COMMITTED = terminal || (awaiting_input && result.entry_id && result.receipt_id)` —
and read every acquisition fact at the park, where it is true and stable. A run that opens no
question (every ordinary journal Work) still lands straight on a terminal status, which `COMMITTED`
admits unchanged.

**And a new leg 2b answers the question.** It polls `clara.agent_interruptions` for the pending row,
asserts `source_ref` is `{kind:"fixed_asset", asset_id}` (F4's ruling, read off the database rather
than off the module), asserts the six declared field keys in the order the answering surface
renders, answers through `clara.answer_work_question` as the owner, and then reads what the run
wrote.

That leg is worth more than the red it closes:

* **It is the first live execution of #639's `claraWork_v4` half anywhere.** `WAVE-DIGEST` §5 records
  it as "a contract only — no run has ever opened the dependent particulars question".
* **It is the first end-to-end drive of the successor review's F1 bridge.** `useful_life_months` is
  declared `kind:"text"`, so it is answered as the STRING `"60"` — the only spelling
  `clara._assert_work_answer` accepts — and the leg then reads `60` out of
  `clara.fixed_assets.useful_life_months`. `fromDoorAnswer` is the only thing that can have done
  that conversion.
* It asserts what the door promises and nothing more: `countEntries === 1` and `countReceipts === 1`
  **after** the answer. Answering a particulars question writes a register fact, never a second
  journal.
* Leg 4 now drives the crash window *through* the park: crash after commit → respawn → the
  re-executed step replays the commit and parks → answer → settle, with `result.replayed === true`
  and the SAME asset id.

**Nothing in `lib/fixed-asset-acquisition.ts`, `claraWork.v4.*` or any migration was touched.**

---

## 4 · The four browser cells — `#804`'s helper migration, not this wave

Root-caused by `git show f6aaac73 -- apps/web/e2e/home-board-walk.spec.ts`, and re-verified here.
`f6aaac73` ("#804 — readiness gate + one shared signIn helper") deleted this file's **local**
`signInTo`, whose first line was `await seed(page);`, and imported the shared helper, which knows
nothing about this file's fixtures. The commit added exactly **five** `+ await seed(page);` lines —
one per call site that existed then. #650's four `home.facets.*` cells (`a948fb8b`) were written
against the local helper and never got one, so they ran against `home-board-mock.mjs`'s
`EMPTY_WORK_PACK` with no `list_review_queue` overlay: `get_client_work_pack` answered zero and the
needs-you tile had no rows, which is why every count the four cells look for was absent.

**Latent since before this leg's window** — `f6aaac73` pre-dates both `d378c18b` (the re-base) and
`9ec330da` (the fix round) — and **reproducible in isolation** (`e2e-run/SUMMARY-iso.tsv`:
`home-board-walk 1  5 passed  4 failed`), so it is not a contention flake and not a merge
regression. Four lines, with the reason written once above the first of them. **No app code.**

---

## 5 · `rig-reset-guard.test.mjs` — a pre-existing probe the wave's rig recipe walks into

**#773's cell 1 is not wrong about the guard; it could not reach it.** The cell manages an env
buffer (`ENV_KEYS`), deletes `DATABASE_URL` and `POSTGRES_URL`, poisons `PGDATABASE` to `clara_631`,
and then asserts that the SHARED gate `assertDestructiveAllowed()` authorises that target — the hole
#773 exists to read directly.

`lib/pg.mjs`'s `urlVar()` (lines 40-42) resolves `env.DATABASE_URL || env.WORKFLOW_POSTGRES_URL`.
`WORKFLOW_POSTGRES_URL` is not in that buffer, and **every World-bearing rig recipe in this repo now
exports it** (it is in the work order's env list for all three verification legs). So a URL target
survived the deletes, `assertNoTargetSplit` fired first on `PGDATABASE=clara_631 != url db clara_db`,
and the probe reported the wrong guard.

Measured on `rigestatedb` 127.0.0.1:55625 / `clara_db` (0224):

| run | result |
|---|---|
| with `WORKFLOW_POSTGRES_URL` set, before the fix | **4 pass / 1 fail** |
| without it, before the fix (control) | 5 pass / 0 fail |
| with `WORKFLOW_POSTGRES_URL` set, after the fix | **5 pass / 0 fail** |
| without it, after the fix (control) | 5 pass / 0 fail |

**Fixed in the test, and only in the test**: `WORKFLOW_POSTGRES_URL` joins `ENV_KEYS` (so cell 5's
restore check covers it too) and the cell's own deletes. `lib/guard.mjs` and `lib/pg.mjs` are
untouched — cell 4 pins that, and it still passes. The precedent is in the same directory:
`target-resolution.test.mjs`, which exercises the same resolver, already carries
`WORKFLOW_POSTGRES_URL` in its `KEYS` list (line 32). A census of the other `packages/db` tests that
buffer URL vars (`f-a2-generic`, `pipeline`, `migrate-harness`) found none with the same shape.

This is a **pre-existing #773 file**, not a wave file (`git diff --stat origin/main -- packages/db/tests/rig-reset-guard.test.mjs`
is empty). It is fixed rather than named because the fault is the test's own hermeticity against an
environment this wave's verification family now always has, not one of the named
name-but-do-not-fix classes.

---

## 6 · `interview-e2e` — the host, and it took an isolated run to say so

Re-run **alone** on an otherwise idle host, same cluster and database (`rigrt` 55623 /
`clara_wave_b_ci`, 0224): **`INTERVIEW E2E: ALL PASS`, exit 0**, including
`PASS (positive): full 16-segment drive → interview_complete, 17 items, no dupes, revision advanced`
and `PASS (p649.interview.sst_park_closed)`.

The same process logged `[world-postgres] Re-enqueued 14 active run(s) on startup` — the in-process
engine was executing fourteen inherited runs' steps beside the interview and still made the 90 s
budget with the host otherwise quiet. The two earlier reds were taken during the whole-suite sweep.
DECISIONS §3.3(6) is the rule applied: a red that does not reproduce in isolation is the host.

**Not fixed, and the 90 s budget is deliberately NOT widened** — raising it would convert a
contention signal into silence. Named as a residual in §8.

---

## 7 · Every command, with its result

All on the re-based tip, worktree `clara-wt\int`, Node 22.

### 7.1 · World legs — `rigrt` 127.0.0.1:55623 / `clara_wave_b_ci` (0224, 219 migrations)

`PGHOST=127.0.0.1 PGPORT=55623 PGUSER=postgres PGDATABASE=clara_wave_b_ci WORKFLOW_POSTGRES_URL=postgres://postgres@127.0.0.1:55623/clara_wave_b_ci RELAY_TEST_MODE=1 node tests/<file>.mjs`

| script | exit | result |
|---|---|---|
| `fixed-asset-acquisition-e2e.mjs` | 0 | **PASS** — legs 1+2, **2b (new)**, 3, 5, 4 |
| `work-journal-e2e.mjs` | 0 | PASS |
| `work-question-e2e.mjs` | 0 | ALL LEGS PASSED |
| `periodic-adjustment-e2e.mjs` | 0 | PASS |
| `staff-expense-claim-e2e.mjs` | 0 | PASS |
| `work-egress-e2e.mjs` | 0 | PASS (3 legs) |
| `chat-turn-v19-e2e.mjs` | 0 | PASS (4 legs) |
| `work-cancel-e2e.mjs` | 0 | PASS |
| `chat-turn-v20-e2e.mjs` | 0 | PASS (4 legs) |
| `interview-e2e.mjs` (isolated) | 0 | ALL PASS |

The banner the legs read, for the record:
`[clara-runtime] bundle clara-work/v4 digest=81e1ffcd55269b061a75057aaaf53b17d41740c4a46e07bc4cea4775a9c5245a`
— the v3 line (`345f2a38…`) still prints beside it, which is the whole reason a version literal was
unsafe.

### 7.2 · db estate — `rigestatedb` 127.0.0.1:55625 / `clara_db` (0224)

`node --test tests/rig-reset-guard.test.mjs`, four runs, table in §5. **5/5 both with and without
`WORKFLOW_POSTGRES_URL`.**

### 7.3 · Browser — int worktree triple `3350/3351/3352`

`pnpm --filter @clara/web e2e home-board-walk` → **exit 0, 9 passed (42.9s)**. Before: exit 1,
5 passed / 4 failed, reproducible in isolation.

### 7.4 · Static gates

| gate | exit |
|---|---|
| `packages/runtime` `pnpm lint` | 0 |
| `packages/db` `pnpm lint` | 0 |
| `apps/web` `pnpm lint` | 0 |
| `apps/web` `pnpm typecheck` | 0 |
| `apps/web` `node --test e2e/e2e-fixture-ownership.test.ts` | 0 — **18/18** |
| `node --check` on all ten touched/added `.mjs` scripts | 0 |

No new census row was added and none was widened. `pinned-work-bundle.mjs` is not collected by
`node --test` (`tests/**/*.test.mjs`), is imported by no frozen body (so it joins no
`frozen-workflows.json` closure), and is outside `l9-pool-contract-lane-probe.test.mjs`'s source
census, which skips `tests/` by name.

---

## 8 · What was NOT done, and why

1. **`interview-e2e`'s 90 s budget stays 90 s.** Widening it would hide the contention it just
   measured. Residual: the whole-suite runtime sweep on this host cannot currently give a clean
   verdict on this file — it needs its own isolated slot, which is what this round did.
2. **`test-storage/` and `e2e-run/` left untracked.** Both are run artefacts in the worktree, not
   the branch's.
3. **`provider-eval/work-journal-eval.mjs`** still imports `CLARA_WORK_BUNDLE_V3` by name. It is a
   provider eval, not a registered gate (it appears in no `db-live-gates` step), and #631's own
   provider eval is already recorded void until #836. Named, not touched.
4. **`work-bundle.test.mjs`'s `PINNED_DIGEST_V3`, `rollback-preflight.test.mjs`'s frontier rows and
   `built-bundle-gate.test.mjs`'s synthetic fixture** still name v3 deliberately — they are about
   the v3 bundle and the 0195 frontier, not about the pin. Correct as they stand.
5. **No issue filed.** Two are worth the orchestrator's decision (§9); this worker filed neither.

---

## 9 · For the orchestrator

| # | Item | Suggested handling |
|---|---|---|
| 1 | `rig-reset-guard.test.mjs` is a **pre-existing #773 file** now carrying a wave commit. | Either keep it here (it is two lines and it unblocks the estate leg) or cherry-pick it to its own PR. It touches nothing else. |
| 2 | The class this round closed will recur at the NEXT `claraWork` cut unless the freeze checklist names the standalone scripts. | Worth one line in the successor-cut procedure: "re-anchor, do not re-grep — `tests/pinned-work-bundle.mjs` is the only place a `claraWork` version may be spelled in `tests/`." |
| 3 | `#639`'s `claraWork_v4` half is **no longer a contract only**. | `WAVE-DIGEST` §5 and `639-final.md`'s "no run has ever opened the dependent particulars question" are now out of date; `fixed-asset-acquisition-e2e.mjs` leg 2b is the evidence. |
| 4 | `waitReady()`'s `catch { /* booting */ }` swallows `waitBooted()`'s own error in **nine** standalone scripts and reports it as "the serve child did not become ready". | Follow-up issue: move the `waitBooted` call outside the try, or re-throw. It cost a full batch here and would cost the same again. |
| 5 | #804's shared-`signInTo` migration added the seed at the five call sites that existed **then**. | Follow-up issue on #804/#650: a census cell that a spec importing `signInTo` from `./helpers` and defining a local `seed()` calls it before every sign-in. Four cells sat red for that reason alone. |

---

## 10 · Unverified

* **Hosted: nothing.** No hosted read or write was made by this round.
* CI's own behaviour on these nine steps is inferred from the local runs and the `action.yml` rows,
  not measured on CI.
* The `interview-e2e` verdict is "did not reproduce in isolation", which is evidence that the earlier
  reds were the host — **not** proof that the commit path cannot stall under a different load.
* `fixed-asset-acquisition-e2e` leg 2b answers the question with `method: "straight_line"` on a
  depreciable enrolment. The `none` / non-depreciable arm and the `reducing_balance` arm are covered
  by the DB battery and the unit cells, not by this live leg.
