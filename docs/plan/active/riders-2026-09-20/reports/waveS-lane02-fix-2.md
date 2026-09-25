# Riders sweep wave — lane 02 (L2), fix round 2

- **Branch:** `riders/wS-lane02` · worktree `C:\Users\zhant\Desktop\clara-wt\655` · database `127.0.0.1:55745/clara_l05`
- **Base:** `7bc5a710f` (the integrated head of the wave before; `git merge-base origin/main HEAD` is the same commit)
- **Head at the start of this round:** `75086d413`, with an uncommitted §E redesign in the tree
- **HEAD returned by this round: `3c48235afaee388e1ee4ba501f7399943b33defb`** · 36 commits above the base · working tree CLEAN
- **Input:** `reports/waveS-lane02-recheck.json` — one finding open in this round's brief (`RECHECK-L02-01`, major), one also recorded there (`RECHECK-L02-02`, minor)

## What this round actually did

The two fixes landed as commits while this round was running (`e792dc3ce`, `3c48235af` — a concurrent
worker on the same branch, confirmed by the reflog and by the coordinator's own mid-round message).
**This round is therefore an independent verification of those two commits against the recheck's two
findings, not a second authorship of them.** Nothing below is taken from a commit message: every claim
is re-derived from the code, from the live rig, or from a command re-run in this round, and the two
central claims — the lint gate, and the parity of the new fallback with lane L1's real predicate — were
DRIVEN rather than read. **No file was edited and no commit was written by this round**; the head it
returns is the head those two commits left.

| commit | what it is |
|---|---|
| `e792dc3ce` | `fix(db): #1050 §E asks the catalog which wall to use, in plain SQL` — RECHECK-L02-01 |
| `3c48235af` | `fix(web): the panel cell names its ticket in words, not as a colour literal` — RECHECK-L02-02 |

---

## RECHECK-L02-01 (major) — the WB-R21 wiki-authority-boundary gate — FIXED, verified

**The finding.** The first cut of the ADV-L02-01/02 fix (commit `aaaa82e8c`) wrote §E as two
`create or replace function` statements chosen at apply time by a
`do $c0338_e$ … execute $c0338_e_pre$ … $c0338_e_post$ … end` block. That is dynamic
function-creating DDL, which `scripts/check-wiki-dynamic-sql.mjs` — the repo half of migration
0019 §9's wiki-authority defence, and the eleventh stage of `pnpm lint` — fails closed on without a
reviewed `DYNAMIC_SQL_ALLOWLIST` waiver. No waiver was added.

**Reproduced in isolation, without touching the tree.** `scanSources` in
`scripts/wiki-lint-checks.mjs` is a pure function, so both shapes of the file were lifted straight out
of git and fed to it:

```
OLD (aaaa82e8c, the do-block) -> 1 dynamic-SQL finding:
  0338_…sql:708  dynamic function-creating `do` block -> clara._obo_plan_core(text,uuid,…,jsonb)
  — the INSTALLED body runs a RECONSTRUCTIBLE dynamic statement (11 relations/calls) whose
    transitive reach cannot be PROVEN wiki-free … it needs a justified DYNAMIC_SQL_ALLOWLIST waiver
NEW (HEAD, plain SQL)         -> 0 dynamic-SQL findings
```

(Both runs also print twelve `(whitelist) … has NO definition in the migration tree` lines, an
artefact of scanning ONE file out of the tree — those wiki verbs are defined in other migrations.
They are absent from the whole-tree run, which is what the gate actually does.)

**The fix that landed is remedy (b), not remedy (a).** The recheck offered a waiver entry or a
redesign; the redesign was taken, and it is the better of the two — the gate's own first piece of
advice is "write the statement as plain SQL", and a waiver would have signed off a barrier the estate
then carries forever. §E is now ONE static `create or replace function`. Its authority wall answers
this file's own `standing_instruction` kind itself, `perform`s
`clara._assert_plan_authority(text,jsonb,uuid,uuid)` where lane L1's #1051 has landed, and carries
0308's own block where it has not — the choice made at RUN TIME by `to_regprocedure`, a catalog fact,
not at apply time by a DDL statement the file picks
(`packages/db/migrations/0338_prepayment_close_standing_instruction.sql:784`).

**Gate, re-run at HEAD:** `node scripts/check-wiki-dynamic-sql.mjs` → **exit 0** — "1536 clara function
definition(s) and 252 change-of-record patch(es) scanned, no dynamic wiki SQL outside the whitelist;
20 justified dynamic-SQL waiver(s)": the same **20** waivers the estate had before this lane, **none
added**. `node scripts/check-wiki-dynamic-sql.selftest.mjs` → exit 0.

### The redesign moves the risk, so the new risk was driven, not argued

A run-time branch means ONE body must be correct on BOTH chains. Two things were therefore measured
directly on `clara_l05`, each inside a transaction that was rolled back; the live catalog was re-read
afterwards and is byte-identical.

**1 · The fallback is not a weaker wall — eight axes, byte for byte.** Lane L1's REAL predicate was
lifted out of its own migration file (`git show
riders/wS-lane01:packages/db/migrations/0330_plan_authority_wall_predicate.sql`, §A — never retyped),
created inside a transaction, and the same eight authority axes were driven through
`clara._obo_plan_core` WITH and WITHOUT it, comparing SQLSTATE, message and `detail`:

| axis | code | detail |
|---|---|---|
| `authority_rule` | CLR10 | `{"reason":"authority_rule_unsupported"}` |
| unknown kind | CLR10 | `{"reason":"invalid_authority_kind"}` |
| ref null | CLR10 | `{"reason":"authority_ref_invalid","constraint":"object"}` |
| ref not an object | CLR10 | `{"reason":"authority_ref_invalid","constraint":"object"}` |
| ref kind absent | CLR10 | `{"reason":"authority_ref_invalid","constraint":"kind"}` |
| ref kind not admitted | CLR10 | `{"reason":"authority_ref_invalid","constraint":"kind"}` |
| ref id unparseable | CLR10 | `{"reason":"authority_ref_invalid","constraint":"id"}` |
| ref unresolved | CLR10 | `{"reason":"authority_ref_unresolved","kind":"chat_task","id":…}` |

**8 axes, 8 identical (code, message and detail byte for byte), 0 different**, and the predicate was
gone after the rollback. The one axis this could not reach without seeded rows —
`authority_ref_not_human_instruction` — is covered by the battery's own cells
(`p1050.authority.resolve`, `p915.obo.refusals_match`, `p941.obo.authority`), all green below; it is
named here rather than claimed.

**2 · The new cell is not vacuous.** `p1050.authority.wall_route` asserts that the twin DELEGATES once
the shared predicate exists. Against a deliberately broken subject — the live body with its
284-character delegation arm deleted, installed inside a rolled-back transaction — the probe answers
`authority_ref_unresolved` instead of the stand-in's `p1050_stand_in`, so **the cell's assertion FAILS
against the broken subject**: non-vacuous. Against the live body: `explicit_instruction` →
`p1050_stand_in` (delegated), `standing_instruction` → `authority_ref_invalid` (answered locally, never
reaches the shared wall), and with no predicate on the chain → `authority_ref_unresolved` (0308's own
block). The live `prosrc` sha was `1105f9f2…` before and after, and the stand-in predicate was gone.

### The migration ledger, after an edit to an unmerged migration

`0338` was edited after it had been applied, and `0361` had taken the frontier, so
`CLARA_MIGRATION_REDO=0338` is refused by design ("redoing anything below the frontier would silently
invalidate whatever was applied on top of it" — `packages/db/scripts/migrate.mjs:399`). The fix commit
records the route taken instead: both ledger rows deleted and a plain `pnpm --filter @clara/db migrate`
re-running the two files in order, both redo-safe by construction. **Verified here rather than taken on
trust:** the ledger reads **314 files**, max `0361_reservation_release_advice`; the stored checksum for
`0338` is `6974a683fe62e2ed8366d6689fca5752aa6097a0590c2e2c146e96c3434eee0a` and equals
`migrationChecksum()` of the file on disk NOW; and a fresh `pnpm --filter @clara/db migrate` reports
`0 new migration(s) applied · 314 total` with no drift abort. Flagged for the integrator as a
**deviation from the wave-2 addendum's "use the #957 redo mode" instruction** — a forced one, the
supported mode being unavailable at this frontier, and it leaves the same end state the redo mode would.

---

## RECHECK-L02-02 (minor) — `no-raw-color-values` on a ticket reference — FIXED, verified

`3c48235af` rewords the two literals in `apps/web/components/firm-admin/firm-settings-panel.test.tsx`
(the test title at :118 and the comment at :139) to say "ticket 1050" instead of `#1050` — the
false-positive class the rule's own message documents (#994). **The rule was not weakened**; the diff is
two strings, 1 file, +2/−2. Verified: `pnpm -r --if-present lint` (which runs `eslint .` for `apps/web`)
→ exit 0, and the four component test files re-run **27/27** green, so the rewording did not break the
cells that read those strings.

---

## L02-SPEC-06 — the coordinator's ruling, recorded

Posted on #1050 under the owner's delegation and recorded here as instructed: **(1) the withdrawal door
of 0338 §G STAYS; (2) the ADMIN floor on both standing-instruction doors is RIGHT** — firm-level
governance sits at admin, the same floor as `clara.record_client_fact`, and the named member's authority
lapses below bookkeeper per ADV-L02-03. **Ruled, as built — no code changed, and none was touched.**
Checked against the branch, so "as built" is a measured statement and not a repetition:

- `clara.withdraw_firm_standing_instruction` is §G of `0338_…sql:473`, listed in the file's own section
  map at :30 ("…and takes it back (same floor, same lane)").
- Both doors read `clara._human_ctx(clara.role_rank('admin'))` — the record door at :370, the withdrawal
  door at :503 — and the door comment at :468 states the admin floor and the `clara_authenticated`-only lane.
- The floor is DRIVEN, not asserted on sight: `p1050.withdraw.refusals` ends "…and both doors are
  ADMIN-floored: a bookkeeper of the firm is refused by rank at each of them" (green below), and
  `p1050.doors.shape` holds the grant shape of both.
- ADV-L02-03's rank floor is `0338_…sql:1069` — `clara.role_rank(v_dir_role) < clara.role_rank('bookkeeper')`,
  read from the admission wall rather than restated — driven by `p1050.wake.demoted` (green below).

---

## Gates, with counts (all re-run in this round, at `3c48235af`, on lane 02's own rig)

| gate | result |
|---|---|
| `tests/prepayment-close-standing-instruction.test.mjs` (full gate chain) | **18 / 18 pass**, 0 fail, 0 skipped (17 before; `p1050.authority.wall_route` is the new cell, and it RAN — not `# SKIP`) |
| lane battery: `prepayment-close-standing-instruction` + `prepayment-schedule-obo` + `revenue-recognition` + `refusal-errcode-partition` + `prepayment-wake-reroute` + `prepayment-account-roster` + `prepayment-account-reservation` + `revenue-recognition-plan-op-key` + `reservation-release-advice` | **73 / 73 pass**, 0 fail, 0 skipped, 110.8 s |
| `tests/operation-census.test.mjs` + `tests/rig-isolation.test.mjs` (work-order rule 8) | **32 pass, 0 fail, 1 skipped** — the skip is T19 poison-role, which needs `CLARA_RIG_ALLOW_RESET`, and RIG.md forbids setting it |
| `apps/web`: `firm-settings-panel` + `standing-instructions-card` + `firm-settings-a11y` + `prepayment-accounts-panel` | **27 / 27 pass** |
| `apps/web/tests/firm-scope-db-pins.test.ts` (sweep rule (d): a migration file changed) | **22 / 22 pass**, 3 suites — the corpus census is green with **no 0338 entry**, which is now the correct state: the dynamic barrier that would have needed one is gone. 0361's entry is unmoved and its content sha still matches. |
| `pnpm typecheck` | clean — `apps/web` Done, `packages/runtime` Done |
| `CI=true GITHUB_ACTIONS=true FREEZE_BASE_REF=7bc5a710f pnpm lint` | **exit 0**, the whole chain |
| `CI=true GITHUB_ACTIONS=true pnpm lint` (no base override) | fails at stage 1 ONLY — **38 frozen-workflow violations vs `origin/main`, pre-existing cut-phase drift, NOT this lane's**: `FREEZE_BASE_REF=7bc5a710f node scripts/check-frozen-workflows.mjs` → OK, 322 frozen files verified, and `git diff --name-only 7bc5a710f...HEAD -- packages/runtime` → **0 files** |
| the 17 lint-chain script stages after the frozen check, each run directly | all **exit 0**: `check-wiki-dynamic-sql` and its selftest, both frozen-workflow selftests, `check-frozen-evaluators` (+selftest), `check-leaks`, `check-dead-citations` (+selftest), `check-document-region-field-paths` (+selftest), the three `dsn-pipe` selftests, `world-gate`, `dispatch-model-guard` (43 cases), `eslint-config` |
| `eslint scripts eslint.config.mjs` · `pnpm -r --if-present lint` · `packages/reporting-render` lint | exit 0 · exit 0 · exit 0 |
| `pnpm --filter @clara/db migrate` | `0 new migration(s) applied · 314 total` — no checksum drift |

**Pins re-measured.** Nothing else in the estate pins the body this fix recut: a grep for the live
post-image sha (`1105f9f2…`) and for both pinned pre-images (`2049c1c4…`, `149b4a3d…`) across
`packages/db` and `apps/web` finds them **only** in 0338 §0's own pin array (`:82-91`) — and those are
PRE-images, unmoved by this fix. No web census is keyed on 0338's content sha; the only corpus entry
this lane owns is 0361's, and 0361 was not edited by either of this round's two commits.

## Follow-up worth filing (not fixed here, deliberately)

**0338 §0 still describes the ABANDONED apply-time design** — three spots, all comment or message text,
none load-bearing to the SQL:

- `:79-81` — "§E **writes whichever shape it finds** — decided by whether the shared predicate EXISTS…".
  §E now writes ONE body that ROUTES at run time; pinning both pre-images is still right and still needed.
- `:162` — "…or this file's own recut. **§E writes whichever of the two it finds**; anything else refuses by name."
- `:174` — the refusal an integrator actually sees if lane L1 moves its body again tells them to
  "**re-derive §E's POST-#1051 branch** against the new body and re-measure this pin". There is no
  POST-#1051 branch any more. The actionable half ("re-measure this pin") is still correct and the
  refusal still fires by name, so nothing is unsafe — but the runbook sentence inside it names a thing
  that no longer exists.

Left alone ON PURPOSE: any byte changed in 0338 moves its checksum, which at this frontier forces
another hand ledger repair (above) and a re-run of the whole battery — for three sentences of prose.
**The cheap moment to apply it is the next time 0338 is edited for any other reason, or at integration
if the chain is being re-applied anyway.** Suggested replacements, so it costs nobody a re-derivation:
`:79` → "§E writes ONE body that asks the catalog which wall to use — a fact about the catalog rather
than a marker inside a body — and both admissible pre-images are pinned here…"; `:162` → "…or this
file's own recut. §E overwrites it with one body correct on either chain; anything else refuses by
name."; `:174` → "…Lane L1 moved it again: re-derive §E's delegation arm against the new body and
re-measure this pin."

## Anything unverified

- **`authority_ref_not_human_instruction`** was not driven in this round's eight-axis parity probe (it
  needs a seeded chat_task row). It is covered by the battery's own green cells, and is named rather
  than claimed.
- **The from-scratch chain** (0001 → 0361 in order on a disposable cluster, with `_obo_plan_core`
  reaching §E as 0308's post-image and no #1051 anywhere) is the integrator's proof, not this rig's.
  This lane's database has never carried #1051, so the FALLBACK arm is what its 73 green cells exercise
  end to end, and the DELEGATION arm is what the stand-in and L1's real predicate cover inside
  rolled-back transactions.
- **The integrated chain** (L1's 0330 applied BEFORE 0338) has not been applied anywhere. 0338 §0 admits
  L1's post-image by a pin measured off L1's own migration file, and the parity probe above is the
  evidence that §E's one body behaves identically once it is there.
- Everything the recheck listed under `not_required_and_unchanged` (ADV-L02-07, -09, -11, L02-SPEC-03,
  -05, -07, -08) is unchanged and still correctly deferred. **L02-SPEC-06 is now ruled, as built.**

## Housekeeping

Never pushed, never opened a PR, never wrote to GitHub, never touched another worktree or the main
checkout except this one report file, never spawned a subagent, never killed a process. A coordinator
message arrived mid-round (the L02-SPEC-06 ruling) and is answered in its own section above. Working
tree clean at **`3c48235afaee388e1ee4ba501f7399943b33defb`**.
