# #638 — fix round 1

**Branch** `impl/638-staff-claim` · worktree `C:\Users\zhant\Desktop\clara-wt\638` · from `ce11cc88` →
**`a26e4dd0`** (2 commits). Rig PG 17.11 at 127.0.0.1:55503, db `clara_638`. All evidence LOCAL,
re-measured 2026-09-17. Hosted evidence pending.

```
a26e4dd0 fix(db): #638 0206 — the sealed year refuses at admission, the correction race refuses by name
ef9cc6d2 test(db): #638 red cells for the three settlements, the sealed year, the correction race and the evidence unwind
```

`git diff ce11cc88..HEAD --stat` → **4 files, +354/−17**, all in `packages/db`
(`migrations/0206_staff_expense_claims.sql`, `tests/staff-expense-claim.test.mjs`,
`tests/staff-expense-claim-fixtures.mjs`, `tests/README.md`). Nothing in `apps/web`, nothing in
`packages/runtime`. STANDARDS lens raised no findings; nothing there needed answering.

## Finding → what I did → evidence

| # | Sev | What I did | RED (seen first) | GREEN |
|---|---|---|---|---|
| **F1** + **SEC-1** `already_settled` unproven; report's AC2 pointer false | blocker / should | Added **`p638.claim.settled`**: admits an `already_settled` claim through the real door under `clara_runtime`, posts it with `wake_record_journal_entry` under a real `interactive_client` credential, then reads the committed rows — 2 expense debits + ONE credit on the STATED asset leg (1150), `payable_account_code`/`advance_account_code`/`advance_id` all NULL, ONE entry, ONE committed receipt, ONE claim row, ledger `[admitted, posted]`, **zero** `staff_advance_applications` rows, and `settlement='already_settled'` visible to a VIEWER through `list_staff_expense_claims`. Added two refusal arms to `p638.refusals` asserting `constraint:'asset'` + `field:'claim.payment_account_code'` for a liability (2010) and a control (2000) payment leg. Corrected `638-final.md`'s AC2 row (it cited "World leg 1", which is `settlement:"reimbursement"`). | Mutated `clara._claim_journal_basis` on the rig so `already_settled` credits `2010` — the exact regression the gap hid → cell red: `the posted basis is not the admitted basis for this work` | 24/24 after rollback + re-apply |
| **F2** sealed year admitted durably, refused only at posting | should | New arm **(o)** in `_assert_claim_basis`'s world half: a `posting_date` inside a `closing`/`closed` fiscal year raises **CLR19 `write_into_closed_period`** with `field:'claim.posting_date'` + `fiscal_year_id` + `fy_status` — the same shape `_assert_adjustment_relationships` raises (0194:975-983), with the wall's own "sealed year wins" ordering. Flipped the cell to `refusesSec(...)` at ADMISSION (all four halves: no entry, no receipt, **no claim row**, no enrolment), asserted the refusal's `field`/`fy_status`, asserted `t_period_wall` still stands on `clara.journal_entries`, and asserted a claim outside the sealed year still posts. | `refusals.closedPeriod: expected SQLSTATE CLR19 but the call SUCCEEDED (no error)` | pass |
| **F3** concurrent corrections escape as raw 23505 → HTTP 500 | should | Door step **6a**: the world half is asked AGAIN under the client rung (`pg_advisory_xact_lock(203005004, hashtext(client))`); step 5 stays as the cheap pre-lock refusal. `_assert_claim_basis` is STABLE and takes its snapshot at that statement, so the loser sees the winner's committed `corrected_by_claim_id`. New cell **`p638.correction.race`** barriers the rung from a third session (`withClientRungHeld` + `awaitRungWaiters`, read from `pg_locks`, no sleep), fires two corrections of one reversed claim, and asserts the loser is `CLR10` / `correction_target_already_corrected` / `field:'claim.corrects_claim_id'` — plus that the data was never in danger (2 claim rows, chain names the winner once). | `'23505' !== 'CLR10'` — `duplicate key value violates unique constraint "uq_staff_expense_claims_corrects"` | pass |
| **F4** AC4's document half asserted nowhere | should | New cell **`p638.correction.evidence`**: a filed receipt rides admission → commit → ONE `entry_evidence_links` row (`attached_via='work_commit'`, `released_at` null); a SECOND claim citing it while the entry stands is refused **CLR13 `source_already_posted`**; `reverse_entry` makes `t_entry_evidence_release` stamp `released_at`; the correcting claim cites the SAME receipt, posts, and holds the only live link. Fixtures re-export #634's `evidenceDocument`/`docRef`/`linksForEntry` by name. | `alter table clara.journal_entries disable trigger t_entry_evidence_release` → cell red at `t_entry_evidence_release freed the document on reversal` (expected true, actual undefined) | pass (trigger re-enabled, `tgenabled='O'`) |
| **F5** §E header re-pins the census at "four" | note | Fixed BOTH stale comments (§E header and the third measurement in the file header) to name the MEASURED SIX §0 and §H T.2 actually assert. Comment only. | — | tail OK (2/7) |
| **F6** merge-order hazard on 0206's roster string | note | Not a branch change. Recorded as follow-up **0** in `638-final.md`, addressed to the orchestrator: apply the merged 0001→0209 chain from scratch once before release; re-measure and re-issue the roster string if §0 refuses — never weaken it. Independently re-verified twice on a from-scratch 0001→0198 chain with the EDITED 0206. | — | prestate clean, tail OK (1/7)…(7/7) |
| **F7** fresh cluster left running | note | Used it. `rig638r` on **55603** / `clara_638r` is still online, now at 194 migrations carrying the **edited** 0206 (rolled back and re-applied there too). The orchestrator may reap it. | — | 24/24 on that chain |

## Migration rollback and true-prestate re-apply (required, recorded)

0206 is purely additive, so rollback = drop the 3 triggers on pre-existing tables, the 2 relations and
the 18 functions, then delete the `clara.schema_migrations` receipt (script kept in the scratchpad, not
committed). **0206's own §0 prestate is the verifier.** Done on **three** databases; each re-apply printed:

```
#638 prestate: clean -- no claim surface exists, both purpose CHECKs carry their 0194 three values,
the six non-regression bodies are at their pinned texts, the subledger-hook census is the measured
six, and 0042 tail 20(a)/(b) stand.
#638 tail OK (1/7) … (7/7)
migrate: 1 new migration(s) applied · 194 total
```

- `127.0.0.1:55503/clara_638` — the lane rig. 194 → 193 → 194.
- `127.0.0.1:55503/clara_rt_test` — the World-e2e database (its old 0206 checksum would otherwise have
  tripped the runner's drift guard). 194 → 193 → 194.
- `127.0.0.1:55603/clara_638r` — the reviewer's FROM-SCRATCH 0001→0198 chain. 194 → 193 → 194.

## Counts

| Command | Result |
|---|---|
| `node --test --test-concurrency=1 tests/staff-expense-claim.test.mjs` (55503/clara_638) | **24 pass / 0 fail / 0 skip** (was 21) |
| same battery, 55603/**clara_638r** (from-scratch chain) | **24 pass / 0 fail / 0 skip** |
| `operation-census` + `rig-isolation` + `periodic-adjustment` + `work-journal-post`, one run, no reset flags | **82 tests, 81 pass, 0 fail, 1 skip** (T19 destructive, by design), 74.5 s |
| `packages/runtime/tests/staff-expense-claim-unit.test.mjs` | **14 pass / 0 fail** |
| `packages/runtime/tests/staff-expense-claim-e2e.mjs` (real Postgres World, 55503/clara_rt_test) | **PASS 1..7, `STAFF EXPENSE CLAIM E2E: PASS`, exit 0 — first attempt** |
| `node scripts/check-frozen-workflows.mjs` | OK — 281 frozen files, 51 `"use workflow"` modules |
| `node packages/runtime/scripts/check-parts-parity.mjs` | OK — reader ⊇ emittable |
| `pnpm typecheck` / `pnpm lint` (worktree root) | **exit 0 / exit 0** |
| `apps/web/lib/work/staff-expense-claim{,-draft}.test.ts` | **21 pass / 0 fail** |

`638-final.md` updated in place: the commit block (13 commits + a fix-round paragraph), AC2, AC4, AC8,
the tests table (21 → 24 cells), the re-run counts, the typecheck/lint line, the successor contract's
refusal map (CLR19 at admission; `already_corrected` as the concurrent-correction answer), follow-up 0,
and a fix-round entry under "Unverified".

## What I deliberately left

- **No `already_settled` leg in the runtime World e2e** (SEC-1 marked it optional) and **no Playwright
  cell**. The arm's lane is the database door, and it is now proven end to end there under the real
  least-privileged roles; a World leg would re-prove Workflow, not the settlement. Named under
  "Unverified" in `638-final.md`.
- **No `exception when unique_violation` belt around step 8's insert.** With the re-ask under the rung it
  is unreachable — every correction of one claim serialises on that rung — and a dead guard is exactly
  what a later reader would trust wrongly. If the orchestrator wants belt-and-braces anyway, say so.
- **`workRoutes.ts`'s header note untouched.** Its "#643 … CLR19 maps for the first time here" sentence is
  about `workErrorStatus` gaining CLR19, which is still true; nothing there went stale.
- **The whole `apps/web` suite, the Playwright walk and the nitro build were not re-measured**, because
  the round touched no file outside `packages/db`. Their counts in `638-final.md` stand as the cut's.
- **F6 is the orchestrator's**, not a branch change — recorded as follow-up 0 with the integration recipe.
- **F7's cluster is left running** at 55603 with the edited 0206 applied; I created no new cluster.

Nothing in this round contradicted `brief-638.md` or `DECISIONS.md`: F2's admission arm is the brief's own
"refuse BEFORE admission for anything the basis needs" applied to a fact only the world knows, F3 is a
typed-refusal restatement of the house rule the posting core already states, and §1.3's "#638 recuts
nothing shared" is re-proved by §H's unchanged tail on all three databases.
