# #638 — staff expense claims, employee payables and advance settlement · final report

**Branch** `impl/638-staff-claim` · **worktree** `C:\Users\zhant\Desktop\clara-wt\638` · rig PG 17.11 at
127.0.0.1:55503, db `clara_638` (193 → **194** migrations, 0206 applied). Playwright triple 3250/3251/3252.
**All evidence is LOCAL, re-measured in this session (2026-09-16/17). Hosted evidence pending.**

## What the cut left, and what I did with it

The killed attempt left nine commits, a report carrying four placeholders (WALK_RESULT ×2, SUITE_RESULT,
TYPECHECK, LINT), and ONE uncommitted edit to `apps/web/e2e/staff-expense-claim-walk.spec.ts`. `git stash
list` empty. I judged that diff against the code and **kept both substantive halves, discarded nothing**:
`AccountPicker` (`staff-expense-claim-form.tsx:797-824`) really does render a free-text `<Input>` until the
chart is read, and `selectOption` against an `<input>` is a stackless Playwright throw, so `chartReady()` is
waiting for a real state; and `#journal-basis-lines` is the table-level `FieldError`
(`journal-basis-fields.tsx:314`), never a container of inputs, so the old `locator('#journal-basis-lines
input')` matched NOTHING and its "preview is not editable" claim proved nothing — `getByLabel("Debit,
line 1")` reads the disabled control's own accessible name (`:232` + `en.json debitForLine`). The third
half — a 30 s sign-in deadline — I replaced, because it was LONGER than the cell's own 30 s budget and
could never fire (`d4f7204c`, then `13cd9959`/`ea91c1d4`).

Running the gates the cut never reached found **four more defects, all mine**: the manifest lines were out
of alphabetical order (`pnpm lint` would have red — `268e069f`); the STALE-key walk cell re-keyed zero
drafts and passed straight through the state it exists to prove (`2804239a`); and the whole suite red on
three cells — the reverse-nav gate on `/accounting/claims/new` and two #624 AC4 cells that counted
`get_work_claim_origin` as a Sources-tab door (`ce11cc88`).

```
a26e4dd0 fix(db) 0206 round-1  ef9cc6d2 test(db) round-1 red cells                   ← FIX ROUND 1
ce11cc88 fix(web) census reds  ea91c1d4 test(web) sign-in budget   2804239a test(web) stale-key cell
13cd9959 test(web) cell budget 268e069f fix(web) manifest order    d4f7204c test(web) chart + preview
cce99a7d fix(web) index-access 3be0d7d4 feat(web) leaf + register  1ef342f8 feat(runtime) route + module
acef7116 feat(db) 0206         3bc75148 test(db) red battery                            (13 commits)
```

**Fix round 1 (2026-09-17)** closed one blocker and three shoulds, all in `packages/db`
(`git diff ce11cc88..HEAD --stat` → 4 files, +354/−17; no `apps/web`, no `packages/runtime`):
`already_settled` now has a cell that posts it through the real door (the blocker was a FALSE
evidence pointer, not broken code); a claim dated into a sealed fiscal year is refused CLR19 at
ADMISSION instead of stranding a register row; the loser of two concurrent corrections is a typed
`correction_target_already_corrected` instead of a raw 23505; and AC4's document half is asserted.
The migration was rolled back and re-applied from a TRUE prestate on all three databases. Full
account: `reports/638-fixround-1.md`.

## Acceptance criteria

| AC | Result | Evidence |
|---|---|---|
| **AC1** claimant, source, incurred + posting dates, itemised expense, exact amount/currency, supplied tax; invent nothing | **done** | `clara._assert_claim_basis` (0206 §B) refuses by name: `claimant_missing`, `incurred_date_missing`, `incurred_after_posting`, `item_account_not_expense`, `items_do_not_sum`, `claim_all_zero`. Tax opaque (`items[].supplied_tax`). Cells `p638.claim.posts`, `p638.refusals` (3 cells, 11 arms). |
| **AC2** claim + balanced journal + payable/advance linkage atomically; three settlements distinguished | **done** | Claim row written INSIDE the admission transaction. All three settlements post through the real door and are read back from the committed rows: `p638.claim.posts` (reimbursement), `p638.advance.happy` (`kind='claim'` allocation, outstanding moves by exactly the claim on the effective date), **`p638.claim.settled`** (`already_settled`: two expense debits against the STATED asset payment leg, no payable, no advance, no allocation minted) plus two refusal arms in `p638.refusals` pinning `constraint:'asset'` on `claim.payment_account_code`. `p638.walls`: `open_items` gained nothing. |
| **AC3** minimum versioned question while independent items continue; no redundant approval | **done** | Refused BEFORE admission for everything the basis needs (#721). `p638.items.continue` ×2, `p638.no_second_approval`, World PASS 6. |
| **AC4** replay yields one receipt; correction unwinds the linked allocation | **done** | `p638.replay`, `p638.correction` (the allocation half), **`p638.correction.evidence`** (the DOCUMENT half brief §4 seam 11 named: held while the entry stands — a second claim citing the receipt meets CLR13 `source_already_posted` — released by `t_entry_evidence_release` on reversal, re-cited by the correcting claim), **`p638.correction.race`** (two concurrent corrections of one claim: one lands, the loser is a typed `correction_target_already_corrected`); World PASS 2/4 (SIGKILL between commit and checkpoint on the advance arm → one entry, one receipt, one claim, one allocation). |
| **AC5** C1/C3/C6 show claimant, source, journal, payable/advance and receipt | **done** | `/clients/:id/accounting/claims` + `clara.get_staff_expense_claim`; Work detail labels a claim from `clara.get_work_claim_origin` (`p638.origin`). Walk cell 9. |
| **AC6** C3/C6 itemised costs, payable/advance, settlement lineage, explicit missing facts, exact receipt | **done** | Register discloses items, waiting items BY NAME, receipt, logical identity, advance link, two-way correction chain (walk cell 9). Date half verify-only (C08.9). |
| **AC7** the real journey's states, 320 px, 200 % zoom, keyboard, SR names, reduced motion, stable URL/Back, drafts | **done, with a named run-level residual** | `staff-expense-claim-walk.spec.ts` (13 cells) + its mock. Final full run: **12 passed / 1 failed (7.5 m)**; the one red was the `beforeEach` `/login` navigation stalling past 50 s with no request reaching the fixture, and it **passed solo: 1 passed, exit 0 (1.2 m)**. Every one of the 13 cells is green in this session; see "unverified". |
| **AC8** production-facing read/command under real least-privileged roles; real World for Workflow | **done (local)** | `staff-expense-claim.test.mjs` **24 pass / 0 fail / 0 skip** through `humanQuery` personas (21 at the cut, +3 in fix round 1); `staff-expense-claim-e2e.mjs` **PASS, 7 legs, exit 0** on the real Postgres World, re-run first-attempt against the re-applied 0206, wired at `.github/actions/db-live-gates/action.yml:173`+. Hosted evidence pending. |

## Historical rows

**C08.9 — verify-only, reviewed no-gap, nothing changed.** The caller states the advance date by contract
(`0043:2513`); a null refuses with `axis:posting_date` (`:2528-2533`); `business-date.ts:16-34` renders MYT.
`p638.advance.happy` pins the effective date as the entry's posting date and that outstanding moves that day
and not the day before. Date ownership NOT moved into the DB.
**C55.23 — done.** Deterministic dated facts post in one transaction with no second human
(`p638.no_second_approval`); a fact the source lacks is refused by name before admission. Never revived as a
fix-queue trigger.

## Tests and exact commands (measured by me, this session)

| File | Proves | Result |
|---|---|---|
| `packages/db/tests/staff-expense-claim.test.mjs` (+ `-fixtures.mjs`) | the whole DB slice, **24 cells**, least-privileged personas | **24 pass / 0 fail** |
| `packages/db/tests/staff-expense-claim-preintegration-gate.mjs` | the 29th gate in `packages/db/package.json` | wired (29 gate flags counted) |
| `packages/runtime/tests/staff-expense-claim-unit.test.mjs` | the route's `toDbClaim`, the module, their parity, and NO `WORK_ACCEPTED_PURPOSES` widening | **14 pass / 0 fail** |
| `packages/runtime/tests/staff-expense-claim-e2e.mjs` | real World: admit→run→commit, replay, intent-payload, revoked-authority replay, per-item continuation, optional attachment, SIGKILL on the advance arm | **PASS (7 legs), exit 0** |
| `apps/web/lib/work/staff-expense-claim.test.ts`, `…-draft.test.ts`, `components/accounting/staff-expense-claim-form.test.tsx` | form rules, wire shape, field mapper, four purpose surfaces, draft scope, mounted-form behaviour | green inside the whole-suite run |
| `apps/web/e2e/staff-expense-claim-walk.spec.ts` (+ mock) | the browser journey | **12/13 in-run, 13/13 across runs** |

`packages/db` (PG env + the 29 `--import …-preintegration-gate.mjs` flags copied verbatim from
`package.json`): staff-expense-claim → **24/24**; `operation-census` + `rig-isolation` (**no** reset flags) →
**31 tests, 30 pass, 0 fail, 1 skip** (T19 destructive, by design), 374.6 s — **T10b passed**.
**Fix round 1 re-runs (2026-09-17, rig 55503/clara_638 on the re-applied 0206):**
`staff-expense-claim.test.mjs` → **24 pass / 0 fail / 0 skip**; `operation-census` + `rig-isolation`
+ `periodic-adjustment` + `work-journal-post` in one run → **82 tests, 81 pass, 0 fail, 1 skip**
(T19), 74.5 s. The same battery on the reviewer's FROM-SCRATCH chain (0001→0198 + the edited 0206,
55603/clara_638r) → **24 pass / 0 fail**.
`packages/runtime`: unit → 14/14; `node packages/runtime/scripts/check-parts-parity.mjs` → **OK, exit 0**;
`node scripts/check-frozen-workflows.mjs` → **OK, exit 0** (281 frozen files; 51 `"use workflow"` modules all
frozen+registered — the new module is imported by no frozen body). `pnpm --filter @clara/runtime build`
(nitro) → **exit 0** before the World leg.
**Whole `apps/web` suite** (`node scripts/run-tests.mjs`, final code): **3749 tests, 135 suites, 3747 pass,
0 fail, 2 skipped, 743 s, exit 0.** The 2 skips are `tests/live-provider-auth.test.ts`, env-gated on
`CLARA_LIVE_SUPABASE_AUTH_URL` (pre-existing). **The `thread-live-clarify.test.tsx` load flake did not
occur in either whole-suite run.** The run before `ce11cc88` was 3744 pass / **3 fail**, all three mine, all
three now closed by a cell that would go red.
`pnpm typecheck` (worktree root): **exit 0**. `pnpm lint` (worktree root): **exit 0**. Both re-run
after fix round 1: **exit 0 / exit 0**. `check-frozen-workflows.mjs` → OK (281 frozen files, 51
`"use workflow"` modules); `check-parts-parity.mjs` → OK. The whole `apps/web` suite and the
Playwright walk were **not** re-run in fix round 1 and their counts above stand unchanged, because
the round touched no file outside `packages/db` (`git diff ce11cc88..HEAD --stat`).

**Re-measured independently on the rig (not transcribed):** both purpose CHECKs are still the 0194
three-valued form; all six pinned `sha256(prosrc)` bodies match the pins in 0206 §0 and §H byte for byte;
`t_je_adv_claim_application_birth` is `deferrable initially deferred` on `clara.journal_entries` and sorts
before `t_je_adv_movement_belt`; `t_operation_receipts_staff_expense_claim_posted` exists.

## Docs updated

`packages/db/tests/README.md` (new "Batteries with their own frontier gate") · `packages/runtime/README.md`
(§ Standalone e2es) · `apps/web/README.md` (Client row) · `CONTEXT.md` (four terms beside **Periodic
adjustment**). `docs/PRD.md` and `docs/ARCHITECTURE.md` untouched.

## Blueprint drift

1. **`clara.is_high_stakes` is not amount-only** (`0004:72-78`: opening balance, year end, `tax_affecting`).
   The Work lane never calls it (`p638.no_second_approval`), so PRD:114 holds on this lane;
   `book_staff_advance_application`'s drafted branch (`0043:2666`) still carries the older forced checker.
2. **The `_subledger_on_approve` caller census is SIX, not four.** MEASURED by me on the rig:
   `_approve_entry_core`, `_approve_opening_entry`, `approve_wrong_client_correction`, `finalize_close`
   (0056), `reopen_fiscal_year` (0085), `reverse_entry`. 0206 pins the measured six identically before and
   after and adds none. The brief and `gap-638.md` say "four" — that reads 0037's text, not the live catalog.

## Successor contract — `start_staff_expense_claim_work` (for `chatTurn_v20`)

Everything but the frozen tool body ships in `packages/runtime/lib/staff-expense-claim-basis.ts`
(non-frozen **only until the successor imports it**; its header says so, and the wiring is spelled out at
its foot).

- **Tool name** `START_STAFF_EXPENSE_CLAIM_WORK_TOOL = "start_staff_expense_claim_work"`.
- **Input** `startStaffExpenseClaimWorkInputSchema` — `.strict()` discriminated union on `settlement`.
  Shared: `claimant` (`.strict()`: `enrolment_id?` uuid, `account_code?`, `person_label?`, `attestation?`,
  `confirm_dedicated?`, `identifier?`), `source_kind` (`document|instruction`), `instruction` (1–4000),
  `incurred_date`, `posting_date` (ISO), `items[]` (≥1, `.strict()`: `description` 1–2000,
  `expense_account_code?`, `amount_cents?` int>0, `supplied_tax?`, `incurred_date?`, `pending_fact?`),
  `corrects_claim_id?`. Arms: `reimbursement` + `payable_account_code`; `advance_application` +
  `advance_account_code` + `advance_id`; `already_settled` + `payment_account_code`.
- **In `execute`**: the v18 client pin → `const local = localClaimRefusal(input); if (local) return local;`
  → `stableOpKey(ctx.taskId, START_STAFF_EXPENSE_CLAIM_WORK_TOOL, input)`.
- **Door call, exact order (SEVEN args — there is NO `p_basis`; the door derives the journal):**
  `select clara.admit_staff_expense_claim_work($1 ctx.clientId, $2 ctx.createdBy, $3 intentKey,
  $4::jsonb claimFromInput(input), $5 'clara_interpreted', $6::jsonb [{kind:'chat_task',task_id,session_id}],
  $7 modelId)`.
- **Answer** `{work_id, task_id, logical_op_id, status, replayed, claim_id}` → a `WorkAcceptedPart`.
- **Refusal → message**: hand the database's typed `(code, detail.reason)` back unchanged.
  `claimant_missing` → ask who claimed (and, if new, name / attestation / dedication);
  `claimant_not_enrolled` → that enrolment is not live here; `incurred_date_missing` /
  `incurred_after_posting` → ask for the date, never invent one; `item_account_not_expense` → which expense
  account; `items_do_not_sum` / `claim_all_zero` → check the figures; `payable_account_is_control` → an
  employee is not a counterparty; `advance_not_enrolled` / `advance_allocation_mismatch` → name a live
  advance; `correction_target_{not_found,live,already_corrected}` → reverse before correcting (and
  `already_corrected` is now also what the LOSER of two concurrent corrections is told — it was a
  raw 23505 before fix round 1); CLR19 `write_into_closed_period` → the period is sealed, now
  raised by the door at ADMISSION on `field: claim.posting_date` as well as by
  `clara._tf_period_wall` at commit (`workErrorStatus` already maps CLR19 → 400,
  `workRoutes.ts:627`). `invalid_claim` folds to its `constraint`.
- **Part kind** `work_accepted`, unchanged. **NO `WORK_ACCEPTED_PURPOSES` WIDENING IS REQUIRED** — a claim
  Work's purpose IS `journal_entry`, which `chatTurn.v19.parts.ts:91` already names; asserted in
  `staff-expense-claim-unit.test.mjs`, and `check-parts-parity.mjs` reports `work_accepted` emittable only
  from v18/v19.

## Assumptions (WORK-ORDER rule 6)

1. `_assert_claim_basis(p_client uuid, p_claim jsonb, p_check_world boolean default true)`, not the brief's
   `(p_claim)`: the same bullet requires live-enrolment and active-expense-account checks, which the payload
   cannot answer. The name is the brief's; the payload/world split is 0182's and 0194's idiom.
2. **One advance per claim** (`advance_id` singular, as §A lists it). "No silent FIFO" holds: the claim NAMES
   its advance. Multi-advance is a follow-up.
3. **Per-item continuation is an explicit `pending_fact`**, never an inferred absence.
4. **The claim-origin read is on the Work DETAIL, not the LIST** — the list would need one read per row.
5. CONTEXT.md carries **four** terms, not three: the brief's "named limit" for the claimant handle is its own
   entry rather than a clause, because it is the sentence a reader needs most.
6. The World e2e ran against `clara_rt_test` on my own cluster (194 migrations, 0206 applied), which the cut
   attempt had already created; I created no database and ran no second from-scratch migration chain.

## Follow-ups worth filing

0. **FOR THE ORCHESTRATOR, AT INTEGRATION (not a branch change).** 0206's §0 refuses to apply unless the
   `_subledger_on_approve` caller roster matches a byte-exact SIX-name string, and the census regex scans
   EVERY `clara` body — so a sibling in 0199–0205 that merely NAMES the hook inside any function's source
   would fail 0206's prestate at integration rather than at review. Apply the merged chain 0001→0209 from
   scratch once before release; if 0206's prestate refuses, re-measure and re-issue 0206's roster string
   rather than weakening the assertion. Verified twice in fix round 1 on a from-scratch 0001→0198 chain
   (55603/clara_638r): prestate clean, tail OK (1/7)…(7/7).
1. **Re-pin the `_subledger_on_approve` caller census at its live cardinality** (six, not `0037:3840-3845`'s
   four). Every later migration re-asserting "the pinned four" asserts a stale number; one migration should
   re-derive and re-state it once.
2. **A Playwright walk that opens `?tab=staffAdvances`** — zero browser coverage today; #638's brief split it
   out deliberately.
3. **Label a claim on the Work LIST, not only the detail** — a `claim_id`/`claimant_label` projection on
   `clara.list_accounting_work`, or a batched origin read. Today the list says "Journal entry" for a claim.
4. **Multi-advance allocation inside one claim.**
5. **The wave host's `/login` stall.** Six times across four walk runs, `page.goto('/login?next=…')` never
   completed within the cell budget and no request reached the fixture, while neighbouring cells took 6–20 s.
   Worth one owner across lanes: it costs every walk in the wave a red per run.

## Unverified

- **Everything hosted.** No hosted run exists for this surface. Hosted evidence pending.
- The `/login` stall's CAUSE. I measured what it is not — TIME_WAIT was 149 against a 16384-port dynamic
  range, so it is not ephemeral-port exhaustion — and did not identify what it is. Labelled contention
  because it vanishes on re-run, never "fixed".
- The World e2e passed on the **third** attempt. Attempt 1 red at leg 4 with pg `Connection terminated due to
  connection timeout`; attempt 2 red with `serve child did not become ready` inside 45 s while the engine
  logged `Re-enqueued 1 active run(s)` left by attempt 1. Both are rig/host symptoms, not product results;
  `workflow.workflow_runs` on `clara_rt_test` was 53/53 `completed` before the passing run.
- **rig-isolation before/after the World bootstrap, same cluster:** before 21 tests / 20 pass / 1 skip; after
  21 tests / 20 pass / 0 fail / 1 skip — **identical, T10b green both times**, because the world schema lives
  in `clara_rt_test` and T10b's question is per-database.
- `#707` (x56-rest-c grep) and `#693` (EICAR/Defender) were not run and not touched.
- The claim lane racing a REAL concurrent `book_staff_advance_application` against the birth trigger is proven
  only through two concurrent claim postings (`p638.advance.race`), not against the direct door.
- **Fix round 1.** The `already_settled` arm still has no leg in the runtime World e2e and no Playwright
  cell; it is proven end to end through the real database door only (`p638.claim.settled`). A fiscal year
  that seals BETWEEN admission and posting still leaves an admitted-never-posted claim — that residual is
  the estate's and is deliberate (the claim WAS admitted into an open year); the register shows it honestly
  as `entry_id` null with ledger `['admitted']`. Nothing outside `packages/db` changed, so the whole
  `apps/web` suite, the Playwright walk and the nitro build were not re-measured.
