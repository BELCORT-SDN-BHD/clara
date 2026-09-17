# #649 — fix round 2 (resumed) · finding → what I did → evidence

**Branch** `impl/649-client-onboarding` · **worktree** `C:\Users\zhant\Desktop\clara-wt\649` · rig PG **55508** / `clara_649` · Playwright **3300/3301/3302**. Head at start `c5eccfab`, head now **`22d283c3`** (11 commits ahead of `origin/main`).

## What the resume found

The cut round-2 worker had **already committed both fixes** and left nothing in flight: `git status` clean, no stash, no untracked files. `eddaaf91` (0204: rung-first + firm-scoped plan reads, two new cells, both READMEs) and `c5eccfab` (Confirm shut on an ANSWERED arity ≥ 2, one new cell) were whole. What was missing was the report and the re-verification. **I verified rather than re-did**, then added one cheap doc commit of my own.

The rig was left consistent with the branch: `clara_649` carries **194** migrations and all three 0204 function bodies are **byte-identical to the committed file** (`prosrc` compared verbatim against `0204_client_onboarding_facts.sql`: settle 7752 chars, identity 4350, `_plan_fye_month` 625 — all `true`). **No rollback/re-apply was needed this round because I did not change the migration.**

## Findings

| # | Finding | What I did | Verdict |
|---|---|---|---|
| **B1** (blocker) | settle met the client rung `203005004` only inside `set_client_fy_end`, i.e. after its plan row lock → 40P01 against `approve_opening_seed` | Verified the shipped order off the LIVE catalog, re-ran **the reviewer's own three probes**, re-ran the new cell, and **re-reproduced the red from scratch** on a clone carrying `13bd3e1e`'s body | **CLOSED** |
| **NEW-1** (blocker) | the pre-read choosing which client row to lock carried no firm predicate → a foreign plan took another tenant's row before CLR11, a wait an outsider can time | Read the corrected body and its comment, re-ran `crosstenant2.mjs`, re-ran the new cell, re-reproduced the red | **CLOSED** |
| **N2** (note) | `clara_wave_b_ci` (55608) and the lane's `clara_rt_test` clone carry a pre-fix settle body | Measured which body the lane clone actually has, proved no World leg can reach the door, documented it in the final report. 55608 is not my rig | **recorded, left** |
| round-2 minor note | `walled` / `acknowledgementOwed` do not cover an arity ≥ 2 the read ANSWERS | Verified `c5eccfab`'s cell and belt; added **one commit** labelling the belt in `apps/web/README.md`, where the three arities are described | **closed + doc** |
| **deviation** | review B1 prescribed `client row → rung → plan`; the worker shipped `rung → client row → plan` | Measured that the prescribed order is the shape that deadlocks against `set_client_fy_end` itself | **ratification requested** |
| **new observation** | `clara.approve_wrong_client_correction` takes a `clara.clients` row lock before the rung | Censused all 51 rung-bearing bodies, measured the exposure against the pre-existing door, filed as follow-up 7 | **recorded, not fixed** |

### B1 — closed, and closed on the reviewer's own instruments

The live catalog, with `--` comments stripped so only executable text is measured (`649fr2/livebody2.mjs`), gives the shipped order and every law it answers to:

| body | rung `203005004` | `clara.clients` | `onboarding_plans` |
|---|---|---|---|
| `settle_client_onboarding_facts` | **884** | 971 (`for update`) | 1084 (`for update`) |
| `set_client_fy_end` | 1127 | 2479 (`update`) | — |
| `approve_opening_seed` | 1345 | — | 1430 (`for update`) |
| `commit_client_onboarding` | — | 377 | 565 |
| `cancel_client_onboarding` | — | 346 | 413 |

`rung → client row → plan row` sits above every one of them. The reviewer's probes, re-run verbatim at this head:

- `649rc/advrung.mjs` — was `X result: 40P01`. Now **`X result: acquired`**, settle returns its receipt, `client row: {"fy_end_month":6,"fy_end_day":30}`.
- `649rc/advrung2.mjs` — the interleaving sweep was `settle=40P01` with `client={null,null}` at delay 150/300/600 ms. Now **all six delays** give `approve-side=acquired settle=ok client={"fy_end_month":6,"fy_end_day":30}`.

### NEW-1 — closed, and the oracle is gone rather than narrowed

`649rc/crosstenant2.mjs`, re-run verbatim:

| arm | before (recheck-1) | now |
|---|---|---|
| CONTROL, firm A's row free | CLR11 after **51 ms** | CLR11 after **4 ms** |
| TEST, firm A holds its own client row 2.5 s | CLR11 after **2453 ms** | CLR11 after **3 ms** |

The script's own verdict line now prints `=> refused immediately: no foreign row lock was attempted`. Both plan reads carry `firm_id = c.firm`, the now-unreachable `p.firm_id is distinct from c.firm` arm is gone (confirmed absent from `prosrc`), and the migration comment that previously asserted the opposite as fact was rewritten in the same commit.

### The red, re-reproduced from scratch

The cut worker's red is recorded in `eddaaf91`'s message but was not independently witnessed, so I rebuilt the prestate: a `template clara_649` clone with `13bd3e1e`'s settle body spliced back in **verbatim** (`649fr2/mkred.mjs` — confirmed `rungInBody=-1`, `planFirmScoped=false`), then ran the full battery against it:

```
# tests 13   # pass 11   # fail 2
not ok 11 - p649.settle.opening_rung_order          expected: '40P01', actual: '40P01' (notStrictEqual)
            "…and neither did the transaction holding the rung"
not ok 12 - p649.settle.foreign_plan_takes_no_lock  expected: '55P03', actual: '55P03' (notStrictEqual)
            "an outsider queued on the owning firm's locks before being refused (1003ms) — that wait IS the oracle"
```

Two failures, two SQLSTATEs, the two reviewer reasons. **Eleven cells passing on the old body** is the part worth keeping: each new cell targets exactly one defect and nothing else. Clone dropped afterwards (`649fr2/dropred.mjs`; cluster back to `clara_649, clara_rt_test`).

### The deviation from the review's prescribed fix — ratification requested

Review B1's remedy was literal: *"take the rung immediately after the client ROW lock and before the plan lock"*. That order is `client row → rung`, which is exactly the shape that inverts against **`set_client_fy_end`** — the door settle calls, which takes the rung and only then touches `clara.clients` (0042 §S5.12, "THE RUNG BEFORE THE GUARD READS"; live `prosrc` rung @1127 → update @2479). Measured (`649fr2/rungvsrow.mjs`), racing both doors against an adversary holding a `clara.clients` row and then taking the rung:

```
set_client_fy_end (PRE-EXISTING)   door=40P01  adversary=acquired
settle_...facts (#649, rung-first) door=40P01  adversary=acquired
```

So the prescribed order would have swapped one inversion for another **inside the door's own call stack**. The shipped order gives settle precisely `set_client_fy_end`'s lock signature plus commit/cancel's plan row. The diagnosis in B1 was right; only its one-line remedy was not. Recorded as Assumption **6** in `649-final.md` for the orchestrator to ratify.

### New observation, recorded not fixed

A census of all **51** live bodies mentioning `203005004` (`649fr2/rungcensus.mjs`) finds exactly **one** that takes a `clara.clients` row lock before the rung: `clara.approve_wrong_client_correction` (`clients … for update` @2940, rung on `o.client_id` @4505). Two other flags (`approve_pair_reversal`, `cancel_pair_reversal`) are regex false positives — their `clara.clients` touch is an unlocked `select cl.firm_id`, and the `for update` belongs to a later `adjustment_pair_reversals` statement (both inspected). The exposure is `set_client_fy_end`'s own and pre-dates this branch, as the measurement above shows. Fixing it means moving that door's rung in a migration #649 does not own — filed as **follow-up 7** in the final report, not touched here.

### Citations in the new comments — audited, all sound

`0037 SECTION K` (@2510) does state the ladder `firm (203005002) → client (203005004)` (@2531) "read as a PARTIAL order", and says at @2521-2523 that taking the rungs "BEFORE the … row locks is what makes the extension deadlock-free rather than merely documented", and at @2528 that xact locks are re-entrant. `0042 §S5.12`'s splice carries the phrase at @2002 and labels itself `0042 S5.12 prestate (b)` at @1992. `0017 §K5` — `approve_opening_seed` is created at 0017:3825 and its own body cites "K5 step order (battery DEF-1)" at @3937. **No stale citation to fix.**

## Counts

| Check | Result |
|---|---|
| DB battery, 29-gate chain, on `clara_649` | **13 tests, 13 pass, 0 fail, 0 skipped** (run twice this round: opening and closing) |
| Same battery on the `13bd3e1e` red prestate | **13 tests, 11 pass, 2 fail** — the two round-2 cells only |
| `operation-census` + `rig-isolation`, after the round-2 migration change | **31 tests, 30 pass, 0 fail, 1 skipped** (222.9 s) |
| Whole `apps/web` suite (`node scripts/run-tests.mjs`) | **3750 tests, 3748 pass, 0 fail, 2 skipped**, exit 0 (244.0 s) — up one from round 1's 3749, the round-2 cell |
| `add-client-candidates` + `add-client-control` + `onboarding-field-composition` | **22 tests, 22 pass, 0 fail** |
| Playwright `client-create-walk` (drives the changed control) | **4 passed (17.7 s)**, exit 0 |
| Playwright `agentic-finish-walk` (owns the H-51/CB-AE2E-024 arm) | **9 passed (31.3 s)**, exit 0 |
| `pnpm typecheck` / `pnpm lint` (worktree root) | **exit 0** / **exit 0** — re-run after my own commit, still **0** / **0** |
| `check-frozen-workflows.mjs` / `check-parts-parity.mjs` | **OK (281 frozen files)** / **OK** |
| Live 0204 bodies vs the committed file | all three **byte-identical**; `clara_649` at **194** migrations |

No failure named another lane's worktree and nothing needed an isolation re-run; nothing flaked.

## Commits added this round

- **`22d283c3`** `docs(web): #649 — the arity >= 2 belt is labelled where the three arities are described` — one sentence in `apps/web/README.md`, no code. `pnpm --filter @clara/web lint` exit 0. (`eddaaf91` and `c5eccfab` were already on the branch when I resumed.)

## `649-final.md` edits

1. Commit block: `22d283c3` added.
2. AC4: the foreign-lock defect corrected from "took another tenant's rung and row" to the **row** — at the round-1 body the rung was still reached only inside `set_client_fy_end`, so a foreign plan never got that far; the rung fix would have added it to that same foreign acquisition had the predicate not landed with it. Both probe timings added.
3. Tests: census/rig-isolation re-measured at the round-2 head; the whole-suite count `3749/3747` → **`3750/3748`**; both Playwright walks re-run at the round-2 head; typecheck/lint re-run; the from-scratch red reproduction added.
4. Runtime World legs: stated why they were not re-run (`packages/runtime` has **zero** references to `settle_client_onboarding_facts` or `set_client_fy_end`) and which body `clara_rt_test` actually carries.
5. New Assumption **6** (the deviation, with its measurement) and new follow-up **7** (`approve_wrong_client_correction`).

## What I deliberately left

- **`clara_wave_b_ci` on 55608 is not re-cloned.** N2 asks for it; that rig is not this lane's and the brief forbids touching another lane's ports. Orchestrator's call.
- **`clara_rt_test` on my own rig is left carrying the original `baaf48fe` body.** Re-cloning would destroy the database the round-1 World-leg evidence ran on and buys nothing: `packages/runtime` cannot reach the door. Documented instead, with the exact body identified.
- **`approve_wrong_client_correction`'s rung order is not moved.** It is another migration's door, pre-existing, and outside a branch whose ruling is "this branch recuts NOTHING" (brief; DECISIONS §1.3). Follow-up 7.
- **The two runtime World legs were not re-run** — evidence above that round 2 cannot have affected them.
- **Everything the final report already lists as residual** — UI-21's altitude leg, the ⌘K entrance, the direct birth door, `InterviewRunCard`, the hosted counts — is untouched by round 2 and stands as written.
