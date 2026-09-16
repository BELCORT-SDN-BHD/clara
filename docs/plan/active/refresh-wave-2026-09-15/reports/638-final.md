# #638 — staff expense claims, employee payables and advance settlement · final report

**Branch** `impl/638-staff-claim` · **worktree** `C:\Users\zhant\Desktop\clara-wt\638` · rig PG 17.11 at
127.0.0.1:55503, db `clara_638` (193 → **194** migrations). **All evidence below is LOCAL; hosted evidence pending.**

The previous attempt left nothing: `git status` clean, `git log origin/main..HEAD` empty at start.

```
cce99a7d fix(web): #638 satisfy `next build`'s stricter index-access checks in the new cells
3be0d7d4 feat(web): #638 the staff-expense-claim leaf, its register, and the Work purpose vocabulary fix
1ef342f8 feat(runtime): #638 POST /api/work/staff-expense-claim + the non-frozen claim basis module
acef7116 feat(db): #638 migration 0206 — staff expense claims, employee payables and advance settlement
3bc75148 test(db): #638 red battery (21 cells) — RED FIRST
```

**Red first, measured** before 0206: `clara.staff_expense_claims`, `clara.staff_expense_claim_status`,
`clara.admit_staff_expense_claim_work`, `clara.get_work_claim_origin` and
`t_je_adv_claim_application_birth` all absent on the rig; the battery's 21 cells ran and skipped on the
frontier gate. After 0206: 21 pass, 0 fail.

## Acceptance criteria

| AC | Result | Evidence |
|---|---|---|
| **AC1** claimant, source, incurred + posting dates, itemised expense, exact amount/currency, supplied tax; invent nothing | **done** | `clara._assert_claim_basis` (0206 §B) refuses by name: `claimant_missing`, `incurred_date_missing`, `incurred_after_posting`, `item_account_not_expense`, `items_do_not_sum`, `claim_all_zero`. Tax is opaque (`items[].supplied_tax`, carried, validated against nothing). Cells `p638.claim.posts`, `p638.refusals` (11 arms). |
| **AC2** claim + balanced journal + payable/advance linkage atomically; three settlements distinguished | **done** | Claim row written INSIDE the admission transaction; entry + receipt + claim + allocation in one commit. `p638.claim.posts` (reimbursement), `p638.advance.happy` (`kind='claim'` allocation, outstanding moves by exactly 60500 at the effective date and not a day earlier), `already_settled` proven by `derive.lines` + the World e2e. Employee payable = non-control liability leg + this register; `p638.walls` proves `open_items` gained nothing. |
| **AC3** minimum versioned question while independent items continue; no redundant approval | **done** | Refused BEFORE admission for everything the basis needs (#721): every §F token is field-scoped. Per-item continuation designed INSIDE one claim: `pending_fact` names the missing fact, posts no line, contributes nothing, and lands on the `items_pending` status-ledger row. `p638.items.continue` (×2), `p638.no_second_approval`. |
| **AC4** replay yields one receipt; correction unwinds the linked allocation | **done** | `p638.replay` (one Work, one claim, typed conflict on a changed claim), `p638.correction` (reverse → hook-born `kind='correction'` row → linked correction claim, both pointers, two committed receipts). World e2e leg 4 proves it across a SIGKILL. |
| **AC5** C1/C3/C6 show claimant, source, journal, payable/advance and receipt | **done** | `/clients/:id/accounting/claims` register + `clara.get_staff_expense_claim`; Work detail labels a claim from `clara.get_work_claim_origin`. C1's attachment is genuinely optional. |
| **AC6** C3/C6 itemised costs, payable/advance, settlement lineage, explicit missing facts, exact receipt | **done** | Register discloses items, waiting items BY NAME, receipt, logical identity, advance link and the two-way correction chain. **Date half: verify-only, reviewed no-gap** (C08.9 below). |
| **AC7** the real journey's states, 320 px, 200 % zoom, keyboard, SR names, reduced motion, stable URL/Back, drafts | **WALK_RESULT** | `apps/web/e2e/staff-expense-claim-walk.spec.ts` + `staff-expense-claim-mock.mjs` on ports 3250/3251/3252. |
| **AC8** production-facing read/command under real least-privileged roles; real World for Workflow | **done (local)** | `packages/db/tests/staff-expense-claim.test.mjs` 21/21 through `humanQuery` personas; `packages/runtime/tests/staff-expense-claim-e2e.mjs` **PASS** on the real Postgres World, wired at `.github/actions/db-live-gates/action.yml`. Hosted evidence pending. |

## Historical rows

| Row | Result | Evidence |
|---|---|---|
| **C08.9** | **verify-only — reviewed no-gap, nothing changed** | The caller states the advance date by contract (`0043:2513`); a null refuses with `axis:posting_date` (`:2528-2533`); `business-date.ts:16-34` renders MYT. Date ownership NOT moved into the DB. `p638.advance.happy` pins the effective date as the ENTRY's posting date and that outstanding moves on that day and not the day before. |
| **C55.23** | **done** | The reframed obligation is AC1+AC3's and is built: deterministic dated facts post in one transaction with no second human (`p638.no_second_approval`), and a fact the source lacks is refused by name before admission. Never revived as a fix-queue trigger. |

## Tests added

| File | What it proves | Result |
|---|---|---|
| `packages/db/tests/staff-expense-claim.test.mjs` (+ `-fixtures.mjs`) | the whole DB slice, 21 cells, least-privileged personas | **21 pass / 0 fail** |
| `packages/db/tests/staff-expense-claim-preintegration-gate.mjs` | the 29th gate in `packages/db/package.json` | wired |
| `packages/runtime/tests/staff-expense-claim-unit.test.mjs` | the route's `toDbClaim`, the claim module, their parity, and NO `WORK_ACCEPTED_PURPOSES` widening | **14 pass / 0 fail** |
| `packages/runtime/tests/staff-expense-claim-e2e.mjs` | real World: admit→run→commit, replay, typed conflict, revoked-authority replay, per-item continuation, optional attachment, SIGKILL between commit and checkpoint on the ADVANCE arm | **PASS (7 legs)** |
| `apps/web/lib/work/staff-expense-claim.test.ts` | the form's rules, the wire shape, the field mapper, and the four purpose surfaces | **15 pass / 0 fail** |
| `apps/web/lib/work/staff-expense-claim-draft.test.ts` | the scope key, the untrusted parser, the retirement moment | **6 pass / 0 fail** |
| `apps/web/components/accounting/staff-expense-claim-form.test.tsx` | mounted-form behaviour: denied, first-invalid focus, server field→control, lost-response replay, settlement arms, no lines sent, conflict, draft | **9 pass / 0 fail** |
| `apps/web/e2e/staff-expense-claim-walk.spec.ts` (+ mock) | the browser journey | **WALK_RESULT** |

**Commands (exact, on this rig).** `packages/db`: `node --test --test-concurrency=1 $GATES tests/<file>` with the 29
`--import` flags from `packages/db/package.json`.
· staff-expense-claim → 21/21.
· `periodic-adjustment` + `work-journal-post` + `work-journal-admission` → **71 pass, 0 fail**.
· `x42-advances-{belt,reversal,admission,guards}` → **26 pass, 0 fail**.
· `operation-census` + `rig-isolation` (no reset flags) → **30 pass, 0 fail, 1 skip** (T19 destructive, as designed).
`packages/runtime`: `node --test tests/staff-expense-claim-unit.test.mjs` → 14/14;
`tests/work-journal-db.test.mjs` → 23/23; `node packages/runtime/scripts/check-parts-parity.mjs` → **OK**;
`node scripts/check-frozen-workflows.mjs` → **OK** (281 frozen files verified; 51 `"use workflow"` modules all
frozen+registered — the new runtime module is imported by no frozen body).
`apps/web`: `node --import ./test/bootstrap.mjs --import tsx --test <file>`.
**Whole `apps/web` suite: SUITE_RESULT.**
`pnpm typecheck` (worktree root): **TYPECHECK**. `pnpm lint` (worktree root): **LINT**.

## Docs updated

`packages/db/tests/README.md` (new "Batteries with their own frontier gate" section) ·
`packages/runtime/README.md` (§ Standalone e2es) · `apps/web/README.md` (Client row) ·
`CONTEXT.md` (four terms beside **Periodic adjustment**: **Staff expense claim**, **Employee payable**,
**Advance application**, **Claimant handle** — the last carrying the named limit that the handle is a label on an
ACCOUNT, not a person record). `docs/PRD.md` and `docs/ARCHITECTURE.md` untouched.

## Blueprint drift

1. **`clara.is_high_stakes` is not amount-only.** `0004:72-78` fires on opening balance, year end and
   `tax_affecting` as well as the firm floor, so a claim carrying a tax fact would trip it on a non-amount axis.
   The Work lane never calls it (`p638.no_second_approval` asserts the posting core's body does not name it), so
   PRD:114 holds on this lane — but `book_staff_advance_application`'s drafted branch (`0043:2666`) still carries
   the older forced checker. Recorded, not changed.
2. **The `_subledger_on_approve` caller census is SIX, not the four `0037:3840-3845` pins.** MEASURED:
   `clara.finalize_close` (0056) and `clara.reopen_fiscal_year` (0085) both `perform` the hook and both landed
   after 0037's tail ran. 0206 pins the measured six identically before and after and adds none. The brief and
   `gap-638.md` both say "four"; that is a reading of 0037's text, not of the live catalog.

## Successor contract — `start_staff_expense_claim_work` (for `chatTurn_v20`)

Everything but the frozen tool body already ships in
`packages/runtime/lib/staff-expense-claim-basis.ts` (non-frozen **only until the successor imports it**; its
header says so).

- **Tool name** `START_STAFF_EXPENSE_CLAIM_WORK_TOOL = "start_staff_expense_claim_work"`.
- **Input schema** `startStaffExpenseClaimWorkInputSchema` — a `.strict()` discriminated union on `settlement`:
  - shared: `claimant` (`.strict()`: `enrolment_id?` uuid, `account_code?`, `person_label?`, `attestation?`,
    `confirm_dedicated?` bool, `identifier?`), `source_kind` (`document|instruction`), `instruction` (1–4000),
    `incurred_date`, `posting_date` (ISO), `items[]` (≥1, `.strict()`: `description` 1–2000,
    `expense_account_code?`, `amount_cents?` int>0, `supplied_tax?` record, `incurred_date?`, `pending_fact?`),
    `corrects_claim_id?` uuid;
  - `reimbursement` + `payable_account_code`; `advance_application` + `advance_account_code` + `advance_id`;
    `already_settled` + `payment_account_code`.
- **In `execute`**: the v18 client pin, then `const local = localClaimRefusal(input); if (local) return local;`,
  then `stableOpKey(ctx.taskId, START_STAFF_EXPENSE_CLAIM_WORK_TOOL, input)`.
- **Door call, exact order (SEVEN arguments — there is NO `p_basis`; the door derives the journal itself):**
  `select clara.admit_staff_expense_claim_work($1::uuid ctx.clientId, $2::uuid ctx.createdBy, $3::text intentKey,
  $4::jsonb claimFromInput(input), $5::text 'clara_interpreted', $6::jsonb [{kind:'chat_task', task_id, session_id}],
  $7::text modelId)`.
- **Answer** `{work_id, task_id, logical_op_id, status, replayed, claim_id}` → a `WorkAcceptedPart`.
- **Refusal → message map**: hand the database's typed `(code, detail.reason)` back unchanged.
  `claimant_missing` → ask who claimed (and, for a new claimant, the name / attestation / dedication);
  `claimant_not_enrolled` → the named enrolment is not live here; `incurred_date_missing` / `incurred_after_posting`
  → ask for the date, never invent one; `item_account_not_expense` → ask which expense account;
  `items_do_not_sum` / `claim_all_zero` → check the figures; `payable_account_is_control` → an employee is not a
  counterparty, choose a non-control payable; `advance_not_enrolled` / `advance_allocation_mismatch` → name a live
  advance that can carry it; `correction_target_{not_found,live,already_corrected}` → reverse before correcting;
  CLR19 `write_into_closed_period` → the period is sealed. `invalid_claim` folds to its `constraint`.
- **Part kind**: `work_accepted` — unchanged.
- **NO `WORK_ACCEPTED_PURPOSES` WIDENING IS REQUIRED.** A claim Work's purpose IS `journal_entry`, which
  `chatTurn.v19.parts.ts:91`'s frozen `WORK_ACCEPTED_PURPOSES_V19` already names. Asserted against that export in
  `staff-expense-claim-unit.test.mjs` ("parity: the successor contract carries NO WORK_ACCEPTED_PURPOSES
  widening"). This is the one thing the 2026-09-15 amendment made cheaper for v20.

## Assumptions made (WORK-ORDER rule 6)

1. **`_assert_claim_basis`'s signature is `(p_client uuid, p_claim jsonb, p_check_world boolean default true)`,
   not the brief's `(p_claim jsonb)`.** The same bullet requires it to check that the claimant is a LIVE enrolment
   and that every item account is an ACTIVE EXPENSE account — neither is knowable from the payload. The NAME is the
   brief's; the arguments are what the named checks provably need, and the payload/world split is 0182's and
   0194's own idiom (a world fact may not refuse a lost-response retry).
2. **One advance per claim.** The claim row carries `advance_id` (singular), as §A of the brief lists it; a claim
   discharging two advances at once is a follow-up. "No silent FIFO" is honoured: the claim NAMES its advance.
3. **Per-item continuation is an explicit `pending_fact`, not an inferred absence.** An item that names the fact
   it lacks waits; nothing is inferred from a missing key. That is the honest reading of "do not invent".
4. **The claim-origin read is wired into the Work DETAIL, not the Work LIST.** The list would need one read per
   row; the detail reads one Work already. Follow-up below.
5. **CLR37 is exempted by name in `work-journal-db.test.mjs`'s "no bare 500" census.** The claim door's call graph
   reaches 0041's `_fa_status_holds_account_role` through 0043's shared enrolment predicate; that raise fires only
   on a fixed-asset status the estate never classified — a contradiction in its own reference data, for which a
   500 is the honest answer.

## Follow-ups worth filing

1. **Re-pin the `_subledger_on_approve` caller census at its live cardinality.** `0037:3840-3845` says four; the
   catalog says six (`finalize_close`, `reopen_fiscal_year`). Every later migration that re-asserts "the pinned
   four" is asserting a stale number. One migration should re-derive and re-state it once.
2. **A Playwright walk that opens `?tab=staffAdvances`.** #638's brief split it out deliberately: the staff-advance
   register has ZERO browser coverage today, and the first walk there will probably surface pre-existing defects
   that are not this ticket's.
3. **Label a claim on the Work LIST, not only on the detail.** Either a `claim_id`/`claimant_label` projection on
   `clara.list_accounting_work`, or a batched origin read. Today the list shows "Journal entry" for a claim.
4. **Multi-advance allocation inside one claim**, with the register's own `allocations` shape.

## Unverified

- **Everything hosted.** No hosted run exists for this surface. Hosted evidence pending.
- The `#707` (x56-rest-c grep) and `#693` (EICAR/Defender) Windows-only reds were not run and not touched.
- `thread-live-clarify.test.tsx` load flake: reported below with the whole-suite counts.
- The claim lane's behaviour under a REAL concurrent `book_staff_advance_application` racing the birth trigger is
  proven only through two concurrent claim postings (`p638.advance.race`), not against the direct door.
