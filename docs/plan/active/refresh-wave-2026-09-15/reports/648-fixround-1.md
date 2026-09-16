# #648 — fix round 1

**Branch** `impl/648-firm-setup` · reviewed head `6a3893e1` → **new head `dcc7c94a`** · worktree `C:\Users\zhant\Desktop\clara-wt\648` · rig PG `127.0.0.1:55507` / `clara_648` (194 migrations). All evidence **LOCAL**; **hosted evidence pending**.

```
dcc7c94a test(web): #648 round-1 should — the A5 walk's convergence cell gets the budget its own comment measures, and the lane models _reserve_op
446cf815 fix(web,db): #648 round-1 blockers — a settled fact keeps a correction path, and an op key names one attempt, not one intent
```
`git diff --stat 6a3893e1..HEAD` → 11 files, +662 / −67. Worktree clean; nothing pushed; **`packages/db/migrations/0203_firm_setup.sql` is byte-unchanged**, so no rollback/re-apply cycle was owed. No other worktree touched; no `git worktree` command run.

**Verdict counts:** **2 blockers** (both applied) · **2 shoulds** (both applied) · **7 notes** — 1 applied in full, 1 applied in half (the reachable half), 3 recorded as follow-ups with the reason, 1 confirmation recorded, 1 environment note answered.

## Finding → what I did → evidence

| Finding (lens · severity) | What I did | Evidence |
|---|---|---|
| **F1 nine of twelve facts are write-once, and a skip can never be answered** (ADVERSARIAL · **blocker**) | Applied the reviewer's fix, in all three branches. `isAnswerable()` / `correctsOnRegister()` (`lib/firm-setup/types.ts`) replace the `isPending` gate on the write control: a settled **plan-only** fact keeps a *Change this answer* button, a **deferred** one keeps *Answer this now*, and both re-open the same `FirmSetupItemForm` prefilled with what is on record (`answerDraftText`, which deliberately prefills **nothing** for a deferral — its stored value is the reason it was skipped). A fact carrying a **live** knowledge record gets a named line pointing at the facts panel instead, because the door refuses the second capture. **One change the reviewer did not name was required to make theirs reachable**: an accepted answer never closed its form, and the correction control lives in the branch an open form suppresses — `closeOpenForm()` now closes it and returns focus to that control. | **RED FIRST**: `fs.web.10` → `not ok … error: 'a recorded plan-only fact has NO correction path anywhere on this surface'` — the reviewer's exact reason. **GREEN** after. Door side pinned by a new DB cell, `p648.answer.correct`: defer→answer leaves `state='answered'` with the new value and **no** `deferred_reason` beside it; answer→answer re-attributes to the corrector; a **live** firm-defaultable key refuses the second answer `CLR10 knowledge_already_live` by name (which is what makes the "correct it on the register" sentence true). |
| **F2 the lost-response retry provably could not work** (ADVERSARIAL · **blocker**) | Applied the reviewer's fix. The checklist now records the exact triple it puts on the wire — op key + expected revision + answer — **before** the call, and a retry re-sends *that*, not the re-read token. A governed refusal closes the attempt (`doors.ts`: never retry a refusal); only a transport failure keeps it open. Applied to all four write paths (answer chain, defer, seed, commit), not just the answer. Also mapped `_reserve_op`'s bare `CLR10 "op_key reused with different args"` — the one refusal in this journey with no `detail.reason` — to its own **already recorded** face, so a write that *was* accepted stops rendering as "The database refused this value" beside a control whose value was fine. | **RED FIRST**: `fs.web.06`, re-pointed so the mock **rotates** the revision on the lost write (the old fixture froze it, which is why it passed) → `expected: '44444444-…' actual: '66666666-…'` — the retry carried the re-read revision. **GREEN** after: both writes carry the same `p_op_key` *and* the same `p_expected_revision`. `fs.web.12` was red on the missing face ("the already-recorded face never arrived") and is green now. Door side: `p648.opkey.attempt` shows the same key with a moved-on revision refused `op_key reused with different args` (detail `null`), and the **byte-identical** request replaying one receipt — `receipts = 1`. |
| **F3 an op key derived from the VALUE is stable across time, not across one attempt** (ADVERSARIAL · should) | Applied the reviewer's fix, in its stronger form: `firmSetupOpKey()` is now `crypto.randomUUID()` per call and the FNV derivation is **deleted** rather than kept as a tiebreaker — the per-attempt memory F2 already needs is the only thing that has to be stable. `defer` carried the same defect on its reason and is fixed by the same change. | **RED FIRST**, isolated from F1 by restoring only the value-derived mint on the fixed tree: `fs.web.11` → `expected: 3, actual: 2` — three attempts, two distinct op keys, because the revert reused the first one. **GREEN** after: 3 distinct keys, and each attempt carries the revision the plan is actually on (`[rev0, rotated-1, rotated-2]`). Also exercised in the browser: the walk now changes `legal_name` and changes it **back**. |
| **S1 the CAS-convergence assertion ran on the 5s default** (STANDARDS · should) | Applied the reviewer's fix in its stated form. A named `CONVERGED = { timeout: 30_000 }` — the same allowance `signInTo` in the same file has always taken — now covers the assertions that follow the second sign-in in `firmSetup.walk.stale`. **No CAS or door logic was touched.** | The cell's own comment already measured ~32s for that sequence and the describe already carried a 180s **test** budget; only the per-assertion budget was left at 5s. `p648.answer.stale` proves the mechanism 17/17 against real Postgres, and `fs.web.03` proves the surface's convergence deterministically. |
| **S2 the report never closed the loop on brief item 17 (#633 firm intake documents)** (STANDARDS · note) | Applied. `648-final.md` now carries an explicit paragraph: all twelve catalogue rows are typed `text`/`long_text`/`choice`/`month`/`labelled_object`, none takes file evidence, so there is nothing for #633's leaf to be the destination of — a named line would be a dead sentence, not an honest one. | Re-verified independently, not taken from the review: the reviewer's own grep over `components/firm-setup/`, `lib/firm-setup/`, `app/(firm)/settings/setup/` and `0203_firm_setup.sql` returns **nothing** (exit 1), and `app/(firm)/documents` does not exist on this branch. |
| **SPEC F1 / STANDARDS S1's second half — the walk was never confirmed end to end** (note ×2) | Nothing to fix in the app; ran it, and found **why** neither reviewer could finish it. See the Playwright section below. | See below. |
| **N1 the from-scratch cluster is left running** (ADVERSARIAL · note) | **Used it.** The whole battery was re-run on `127.0.0.1:55607` / `clara_648r` as well as on this lane's own rig. **Left running**, as N1 asks — the wave has not closed, and dropping it would destroy the orchestrator's from-scratch chain. | `firm-setup.test.mjs` **17/17** on 55507/`clara_648` and **17/17** on 55607/`clara_648r`. |
| **N2 a no-op reconciliation still rotates the CAS token** (ADVERSARIAL · note) | **Not applied** — it is a migration change, and 0203 is byte-unchanged this round on purpose. Recorded as a follow-up with what makes it unreachable today, and made *more* unreachable: the seed now carries a per-attempt op key, so a lost seed response replays instead of reconciling a second time. | The seed control renders only under `!committed && !env.seeded` (`firm-setup-checklist.tsx`), so once the plan is seeded there is no control left to press; `busy` disables it during the write. |
| **N3 `get_firm_setup` paints progress for a plan that does not exist** (ADVERSARIAL · note) | **Not applied** — migration change, same reason. Recorded as a follow-up. | Both consumers check `plan_id === null` before reading the counter (`firm-setup-checklist.tsx`, `firm-setup-tile.tsx`), which the reviewer verified and I did not re-derive. |
| **N4 a withdrawn firm default stays in `confirmed_facts`** (ADVERSARIAL · note) | **Applied in half — the reachable half.** The SQL intent statement is a migration change and is a follow-up. But the reviewer's second option ("let the item fall back to pending-for-recapture") lands here for free: `get_firm_setup` joins the item's record on `state = 'live'`, so a withdrawn record leaves `knowledge_record_id` null, and `isAnswerable()` therefore offers the answer form again instead of pointing at a panel that refuses to correct a withdrawn revision. The dead end is closed without touching 0203. | Proved by a control, not by assertion: with `isAnswerable`/`correctsOnRegister` keyed on `knowledge_key` alone (the literal form of the fix), `fs.web.10` → `not ok … 'a withdrawn firm default can be neither corrected on the register nor answered again'`. With the `knowledge_record_id` carve-out: green. |
| **N5 the `SCOPE_ENTRANCES` deviation is correct** (ADVERSARIAL · note) | **Confirmation recorded**, no change. `648-final.md` assumption 5 now says the deviation was independently verified in round 1 and that merge prep must not re-add the row. | The reviewer enumerated the table (four entries, every one a layout or an API route) and `firm-scope-surfaces.test.ts` is green both ways; re-run here as part of the census suites, 103/103. |

## Commands re-run after the fixes

| Command | Result |
|---|---|
| `pnpm typecheck` (worktree root) | **exit 0** (`apps/web`, `packages/runtime` both Done) |
| `pnpm lint` (worktree root) | **exit 0** (eslint across four projects + `check-token-contrast` + `check-test-manifest` + `check-message-keys` + the frozen/citation/dynamic-SQL gates) |
| `packages/db` · `firm-setup.test.mjs` with the 0203 preintegration gate, on **55507/`clara_648`** | **17 tests · 17 pass · 0 fail · 0 skipped** |
| the same file on the review's from-scratch **55607/`clara_648r`** | **17 tests · 17 pass · 0 fail · 0 skipped** |
| `operation-census.test.mjs` + `rig-isolation.test.mjs` (no reset flags) | **31 tests · 30 pass · 0 fail · 1 skip** (the destructive T19 cell) |
| `apps/web` · `firm-setup-checklist` + `firm-setup-a11y` + `firm-setup-keyboard` | **19 tests · 19 pass · 0 fail** (was 16; the checklist file went 9 → 12) |
| `apps/web` · the closed-world censuses `firm-scope-surfaces` + `firm-scope-fourth-entrance` + `parity-holes` + `sql-oracle` + `e2e-fixture-ownership` | **103 tests · 103 pass · 0 fail** |
| `node scripts/check-frozen-workflows.mjs` | **OK — 281 frozen files verified**, 51 `"use workflow"` modules all frozen+registered |
| `node packages/runtime/scripts/check-parts-parity.mjs` | **OK — reader ⊇ emittable** (runtime untouched; run because the brief asks for it) |
| Whole `apps/web` suite (`node scripts/run-tests.mjs`) | **3738 tests · 3735 pass · 1 fail · 2 skipped** (was 3735/3733/0/2 — the 3 extra cells are this round’s). The 1 fail is the known whole-suite load flake (work order §9) in a file this branch never touches: `components/work/work-detail.test.tsx` cell “641 switching a tab fires NO write…”, last edited by `3cd935bb` **on main** — **42/42 in isolation** immediately after. In the pre-fix run the same class landed on `thread-live-clarify.test.tsx` instead; it moves between runs, which is what makes it the flake and not a finding. |
| Playwright, ports 3290/3291/3292, through `pnpm --filter @clara/web e2e -- firm-setup-walk` | **5 passed (2.7m)**, exit 0 — see below for the two runs and why the first one was invalid |

## Playwright — and the reason neither reviewer could finish it

**`npx playwright test` does not build the app.** `playwright.config.ts`'s `webServer` is
`node e2e/serve-built.mjs`, which runs `next start` against whatever `.next/` already contains. Only
`node e2e/run.mjs` — reached as `pnpm --filter @clara/web e2e -- <spec>` — builds first, and its own
header says so ("the alternative, calling `playwright test` directly, is what makes every sign-in hit
the real Supabase"). Both round-1 reviewers ran `npx playwright test e2e/firm-setup-walk.spec.ts`, and
so did I on my first attempt.

The bundle they were all driving was **`.next/BUILD_ID` mtime `09-16 04:28:50`** — 19 minutes and one
commit older than the head under review (`6a3893e1`, `09-16 04:47`). For the review that is a narrow
gap (`6a3893e1` only adds two refusal faces the walk never reaches), but it is a real one, and it made
my own first run meaningless in a very loud way: cell 2 failed on
`getByTestId('firm-setup-change-legal_name-action')` **element(s) not found** — the correction control
I had just written was not in the bundle the browser was served.

| # | Command | Build served | Result |
|---|---|---|---|
| 1 | `npx playwright test e2e/firm-setup-walk.spec.ts` | **stale**, `BUILD_ID` 09-16 04:28:50 (pre-fix, and pre-`6a3893e1`) | 1 passed, **1 failed**, 3 did not run (6.1m). The failure is `firm-setup-change-legal_name-action` not found — a control that exists only in source at that moment. Not a finding; an invalid run. |
| 2 | `pnpm --filter @clara/web e2e -- firm-setup-walk` (builds, then runs) | **fresh**, `BUILD_ID` 09-17 02:11:58 = `dcc7c94a` | **5 passed (2.7m)**, exit 0 — `walk.start` 15.8s · `walk.answer` 18.2s · **`walk.stale` 20.5s** · `walk.responsive` 15.8s · `walk.finish` 32.7s. Four axe WCAG 2.1 A/AA scans inside. |

**This is the live confirmation SPEC F1 and STANDARDS S1 both asked for and neither could get**, on the
same host, with the twelve-lane contention still present (56–96 node processes during the run). Three
things follow:

- `firmSetup.walk.stale` — the cell STANDARDS S1 reported failing at a 5s assertion — **passed in
  20.5s**, inside the 30s budget S1 asked for and comfortably outside the 5s one it had. The reviewer's
  diagnosis was right and the fix is the right size.
- `firmSetup.walk.answer` now also proves the round-1 blockers in a real browser: the recorded fact is
  **not** re-asked but offers *Change this answer*, the form prefills from the record, the accepted
  answer closes the form and returns focus to that control, and the answer is then changed **back** to
  its first value through a fixture that enforces `_reserve_op`'s one-key-one-request rule.
- The stale-build trap is worth a wave-wide note. Any lane that gated a browser claim on
  `npx playwright test` was testing its last build, not its branch.

## What I deliberately left

1. **0203 is byte-unchanged.** N2, N3 and N4's SQL halves are all one-line improvements to a merged-shaped migration, none of them a correctness defect, each with a documented consumer that makes it unreachable today. Editing the file would have cost a rollback and re-apply from a true prestate on two rigs plus a full re-verification, in a wave where eleven sibling branches merge in number order — for three notes whose reviewer explicitly wrote "not a correctness problem either way" and "harmless today". They are recorded as follow-ups in `648-final.md` with what makes each unreachable, so the next change to open 0203's doors carries them.
2. **The correction path does not re-write the knowledge record from the checklist.** A settled captured fact is corrected through `clara.correct_knowledge` on the facts panel, which leaves the plan item's own `answer` showing the pre-correction value. That divergence is pre-existing (the read projects the item from `onboarding_plan_items` and the fact from `knowledge_records`) and closing it needs a door change, not a surface change. Not introduced by this round; not in the review's findings; recorded here so it is not discovered as a surprise.
3. **No attempt to make the whole walk deterministic under twelve-lane contention.** S1's budget is the reviewer's own stated fix. Chasing the rest would mean rewriting a suite whose README already says "run the browser suite alone".
