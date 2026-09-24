# Wave 4, lane 03 — ticket #938: "a bill posts inside an accrued period, and Clara notices"

Branch `riders/w4-lane03`, worktree `C:\Users\zhant\Desktop\clara-wt\642`, base `cd2925391`.
Commits (in order):

- `346a6354c` — `feat(db): #938 a bill posted inside an accrued period, and clara notices`
- `0e689107c` — `feat(web): #938 render "a bill arrived for an accrued period" and its two remedies`
- `b511b116a` — `test(e2e): #938 browser walk for the item and "reverse now", plus docs`

Status: **done**. All three ACs implemented and driven through real doors; the accrual walk
covers the item and one remedy (AC4).

## The seams tested at

- `clara.list_review_queue(p_scope, p_cursor, p_limit)` — the read, new arm `row_kind=
  'accrual_bill_conflict'`.
- `clara.skip_plan_occurrence(p_plan, p_after_due, p_reason, p_op_key)` — the new remedy door.
- `clara.request_plan_catch_up(p_plan, p_from, p_to, p_op_key)` — the existing door "reverse now"
  rides, unchanged.
- `clara._plan_admissible_event(p_plan)` — read-only, used to prove the skip marker actually
  blocks the automatic scan.
- Web: `apps/web/lib/accruals/api.ts`'s `reverseAccrualNow`/`skipNextAccrualOccurrence`/
  `accrualReversalDate`; `apps/web/lib/firm/needs-you.ts`'s `REVIEW_QUEUE_ROW_KINDS`; the
  `AccrualBillConflictAffordance` (Needs-you inbox) and `AccrualBillConflicts` (Accruals page)
  components, both driven through `useReviewQueue`'s `act()`-and-reload cycle.
- Browser: the Accruals page (`/clients/:id/accruals`), through a real Next build and a real
  Playwright browser (`accrual-walk.spec.ts`), fixtures in `accrual-mock.mjs`.

## Acceptance criteria

### AC1 — the read

> A read (new door, or an arm on the existing accrual attention read) lists, per client,
> document-sourced journal entries posted to an accrual plan's expense account whose posting date
> (or the document's service period when one is recorded) falls inside an occurrence that has
> posted and is not yet reversed; RLS and role floor match the accrual reads.

No "accrual attention read" existed on this base (measured: `to_regprocedure` finds no
`list_accrual_attention` or similar). Built as a new arm on `clara.list_review_queue`
(row_kind `accrual_bill_conflict`), spliced the same additive way #974 (0260) added the eleventh
kind — evidence: migration 0302 §A, the splice do-block's own prestate/postcheck marker counts.

- **Evidence (DB, real doors):** `packages/db/tests/accrual-bill-conflict.test.mjs`
  `p938.read.same_period` (bill inside the accrual's own period → exactly one row, `id`=plan id,
  `period`=flagged due date, `entry_id`=the bill), `p938.read.next_period` (bill in the following
  period → zero rows), `p938.read.different_account` (bill on an unrelated account → zero rows).
  All pass: `node --test --test-concurrency=1 <full gate chain> tests/accrual-bill-conflict.test.mjs`
  → 9/9.
- **Evidence (migration's own probe):** §D's forced-rollback behavioural probe drives the real
  `clara.admit_journal_work` door for the accrual's Work and asserts the row's shape end to end —
  `applied 0302_accrual_bill_conflict` in the `pnpm db:migrate` output on `clara_l03`.
- **RLS/role floor:** unchanged — the arm inherits `list_review_queue`'s own
  `_human_ctx(role_rank('viewer'))` floor and firm predicate; no new grant. Evidence:
  `p938.role_floor` (a caller with no part in the accrual, at the existing viewer floor, sees the
  row) — 1/1 pass.
- **Document-sourced / same period, not yet reversed:** `origin='document'` (0009's own predicate),
  the accrual's own `expense_account_code` (joined by plan_id+revision), period boundary via the
  SAME expression `clara._plan_covered_through` already uses (never `_plan_reversal_date`, which
  answers a different question — see the migration header's SECOND MEASUREMENT). "Not yet
  reversed" is an occurrence-row existence check, not a date comparison (THIRD MEASUREMENT) —
  `p938.read.reverse_clears` proves a refused-vs-admitted reversal distinction is honoured.

### AC2 — the surfaces and the two remedies

> The Accruals page and Needs you render the item with the accrual, the bill and the period named,
> and offer "skip this period's next occurrence" and "reverse now"; each acts through a plan-lane
> door with a receipt (add a skip-one-occurrence door if none exists, with prestate pins), never
> through an in-place edit.

- **Both surfaces:** `apps/web/components/firm/accrual-bill-conflict-affordance.tsx` (Needs-you
  inbox inline affordance, registered in `NEEDS_YOU_AFFORDANCES`) and
  `apps/web/components/accruals/accrual-bill-conflicts.tsx` (client-scoped Accruals-page section,
  wired into `AccrualsList`) — one shared implementation
  (`reverseAccrualNow`/`skipNextAccrualOccurrence` in `lib/accruals/api.ts`), two render sites.
  Both name the accrual (`question_text`), the bill (`entry_id` → "View the bill" link) and the
  period (`period`, ISO due date).
- **"Reverse now" needs no new door** (AC2's own wording: "add a skip-one-occurrence door IF NONE
  EXISTS" names exactly one). It calls `clara.request_plan_catch_up` (0193, UNCHANGED — pinned and
  re-hashed in 0302's own tail) with a window from the flagged due date through
  `accrualReversalDate` (a client-side mirror of `clara._plan_reversal_date`, `api.ts`).
- **"Skip this period's next occurrence"** is `clara.skip_plan_occurrence` — the one new door,
  bookkeeper+, `clara_authenticated` only. It never recuts the frozen admission core
  (`clara._plan_admit_occurrence`/`_plan_admissible_event`, both pinned in the migration's
  prestate and re-hashed in its tail): it writes an `accounting_plan_occurrences` marker row
  (`leg='primary'`, `work_id` NULL, `outcome.state='skipped'`) for the target date, which
  `_plan_admissible_event`'s own primary-candidate arm already treats as "already handled" (its
  `not exists (… due_date = v_dp)` predicate), so the automatic scan never re-offers it. A later
  deliberate `request_plan_catch_up` naming that exact date can still override the skip — the
  admission core's own convergence law, not a bypass this door builds.
- **A receipt, never an in-place edit:** both doors are governed writes
  (`clara._reserve_op`/`clara._finish_op`, real `clara.op_receipts` rows); `skip_plan_occurrence`
  INSERTs a new occurrence row, never UPDATEs the flagged (already posted) one.
- **Evidence:**
  - `p938.read.reverse_clears` — "reverse now"'s window admits the reversal (`admitted>=1`) and the
    row clears on the next read, with no cleanup step. Pass.
  - `p938.reverse_now.refuses_when_not_due` — while genuinely not due, the SAME door answers
    `CLR10 catch_up_in_future` and the row is untouched (not silently cleared). Pass.
  - `p938.skip.blocks_scan` — the marker is written (`work_id` null, `outcome.state='skipped'`), a
    real `wake_due_plan_occurrences` scan leaves it untouched, and a deliberate catch-up naming the
    exact date overrides it (`admitted:1`, the occurrence now names a real Work). Pass.
  - `p938.skip.refusals` — `invalid_op_key`, `invalid_request` (empty reason),
    `accrual_occurrence_not_found` (a date the schedule never reached), `period_already_admitted`
    (skipping the same date twice). All typed, all pass.
  - `p938.skip.idempotent` — a replayed `op_key` answers identically rather than writing a second
    marker. Pass.
  - Web unit: `apps/web/lib/accruals/api.test.ts` — `reverseAccrualNow` POSTs
    `request_plan_catch_up` with `p_from`=due date, `p_to`=the mirrored reversal date;
    `skipNextAccrualOccurrence` POSTs `skip_plan_occurrence` with `p_plan`/`p_after_due`/`p_reason`;
    `accrualReversalDate` correct across month/year rollover and a short February. 5/5 pass, and
    the vacuity control (a deliberately wrong `month-1`) was driven red for the right reason (4/5
    failing) then restored byte-for-byte and re-confirmed green.
  - Browser: `accrual-walk.spec.ts`'s new cell (below, AC4) drives "reverse now" end to end through
    a real Next build.
  - **Prestate pins** for `clara.skip_plan_occurrence`'s nine depended-on bodies (all measured LIVE
    on `clara_l03` moments before the file was written, never transcribed): `_plan_door_ctx`
    `97bd6c12…89b`, `_plan_due_index_on_or_before` `edd611e5…92d`, `_plan_due_nth`
    `f2248522…20e`, `_plan_occurrence_period_key` `6d9f60d3…63f`, `_human_ctx`
    `d1a8a194…46a`, `_reserve_op` `8816acb4…4b4`, `_finish_op` `c2beaa13…13e`, `_hash`
    `42148​3aa…547`, `role_rank` `5ced25ae…76f`. Two non-regression pins:
    `_plan_admit_occurrence` `a3474419…c46` (DRIFTED from the sha transcribed in 0223's own
    comments — re-measured live rather than copied, per house rule) and `_plan_admissible_event`
    `3b569e33…4b3`. `clara.list_review_queue`'s own splice target pre-image:
    `f4a34c72…69f`.

### AC3 — cells

> Cells: same-period bill surfaces the item; next-period bill does not; each remedy leaves exactly
> one live expense for the period afterwards; from-scratch apply.

- Same-period surfaces / next-period does not: `p938.read.same_period` / `p938.read.next_period` —
  covered above, both pass.
- **"Each remedy leaves exactly one live expense for the period afterwards"**: for "reverse now"
  this is `p938.read.reverse_clears` plus the accounting fact the reversal posts (accrual +
  reversal net to zero on the accrual's own expense line, leaving the bill as the one live
  expense) — the NETTING itself is 0193's own, pinned, unrecut law (`_plan_occurrence_basis`
  swaps every line's side for a reversal), not something this ticket re-derives; I did not write a
  dedicated cell that sums `journal_lines` after the reversal to assert the arithmetic net,
  because that would be re-testing 0193's own basis law rather than #938's. **Unverified, named
  rather than glossed over.** For "skip", the claim is about the NEXT period (once skipped, that
  period's own real bill — if it arrives — is the sole expense, because the accrual never
  competes with it): `p938.skip.blocks_scan` proves the accrual side (no Work, no entry admitted
  for the skipped date) but I did not additionally post a bill for that hypothetical next period
  and assert the ledger nets to one line, for the same reason (it would be testing the
  document-drafting pipeline's own arithmetic, not this ticket's). See "Unverified" below.
- **From-scratch apply:** the migration was applied cleanly to `clara_l03` (`pnpm db:migrate` →
  `applied 0302_accrual_bill_conflict · backend pid 741004 · migrate: 1 new migration(s) applied ·
  290 total`) on top of the lane's existing from-scratch chain (0001→0295, applied before this
  ticket by the wave-4 chart pre-step). I did not run a SECOND from-scratch chain on this cluster
  (forbidden by RIG.md); the integrator's own disposable-cluster from-scratch proof is the
  authority for that claim across the whole wave.

### AC4 — the accrual walk

> The accrual walk covers the item and one remedy.

`apps/web/e2e/accrual-walk.spec.ts`'s new cell `accrual.walk.billConflict` — signs in to
`/clients/:id/accruals`, asserts the conflict item is visible with the accrued-period sentence,
the period ("Accrued period: 2026-07-31"), the amount ("Accrual amount: 1,200.00") and a "View the
bill" link; axe-scans the page (WCAG 2a/2aa/2.1a/2.1aa, zero violations); clicks "Reverse now";
asserts the item is GONE because the destination re-read's `list_review_queue` answer no longer
carries it (accrual-mock.mjs's own `state.reversed` flag — never an optimistic client-side
remove); asserts the configured-accruals table below it is untouched. One remedy only, by design
— the DB battery owns the full remedy/refusal matrix (including `skip_plan_occurrence`'s own
cells), and this walk owns what the browser does with a real write's answer. 19/19 pass on this
lane's own Playwright triple (`https://127.0.0.1:3520` / `3521` / `3522`).

## Migration

`packages/db/migrations/0302_accrual_bill_conflict.sql`. Applied to `clara_l03` (see AC3 above).

- **Prestate pins**: listed under AC2 above (nine depended-on bodies for the new door, two
  non-regression pins, the splice target's own pre-image). `clara._plan_admit_occurrence` had
  DRIFTED from the sha 0223's own comments transcribe (measured live: `a34744199379ebf9…c46` vs.
  the older `5dc6614a8ac9b014…975`) — re-measured on this rig rather than copied, per the house
  "pin what is live" rule; the migration file records both the drift and the re-measurement.
- **Tail assertions**: §C re-hashes all eleven depended-on/non-regression bodies, re-verifies
  `clara.skip_plan_occurrence`'s posture (SECURITY DEFINER, `clara_fn_owner`, pinned
  `search_path`, granted to `clara_authenticated` alone — no PUBLIC, no `clara_runtime`, no agent
  read lane, no wake role) and its body's independent tokens (every named refusal, the `'skipped'`
  outcome state, and an explicit assertion it never calls `_plan_admit_occurrence`).
- **Preintegration gate module**: `packages/db/tests/accrual-bill-conflict-preintegration-gate.mjs`
  (stem `accrual_bill_conflict$`), mirrors the 0260 template exactly.
- **rig-meta cohort**: `ACCRUAL_BILL_CONFLICT_0302_COHORT`/`_HUMAN_FNS` (one name,
  `skip_plan_occurrence`), spread into `ALLOWED[clara_authenticated]` and its own bimodal
  `cohortFailures()` call — the read itself mints no new granted name (0260's own precedent), so
  it needed no cohort of its own.
- **Gate-chain entry**: `packages/db/package.json`'s test script, appended last (after
  `wave4-chart-rows-preintegration-gate.mjs`), matching migration order.
- **Redo-safety**: not exercised this ticket (no edit-and-redo cycle was needed — the file applied
  cleanly on the first attempt after fixture corrections). The splice's one catalog-changing
  statement is `create or replace function`; the door's create/grant/revoke are idempotent, so a
  `CLARA_MIGRATION_REDO` re-run would be safe by construction, but this was not driven.

## Docs

- `packages/db/README.md` — new `## 0302` section (full rationale: the splice shape, why `id` is
  the plan's id, why the period boundary is `_plan_covered_through`'s expression and not
  `_plan_reversal_date`, why "reverse now" needed no new door, how `skip_plan_occurrence` binds
  without recutting the admission core, the migration triad, redo-safety).
- `CONTEXT.md` — one line added to the existing "Settlement candidate row" entry, naming
  `accrual_bill_conflict` a mechanical neighbour (derived, stores nothing, self-clearing) that is
  NOT a member of the settlement-candidate family itself (no candidate offering, no settlement) —
  matching the ticket's own 2026-09-19 ruling comment and an earlier wave's independent gap
  analysis (`docs/plan/active/refresh-wave-2026-09-18/gap-657.md:205`) that reached the same
  reading.
- `apps/web/lib/firm/needs-you.ts` — the `REVIEW_QUEUE_ROW_KINDS` array's own grounding comment,
  extended (never reformatted), matching the file's own "one lane, one row" convention.

## Successor contract

None owed. `#938` extends neither `start_accrual_work` nor any frozen chat/Work tool — it is a
pure read splice on an already-granted function plus one new human-only door. No `chatTurn_v22` /
`claraWork_v6` stanza is needed from this ticket.

## Follow-ups worth filing

- **AC3's "one live expense" arithmetic** is asserted structurally (the accrual/reversal/skip
  mechanics that PRODUCE the netting) but not by summing `journal_lines` after each remedy and
  comparing to the bill's own amount. A dedicated cell doing that sum would be worth adding,
  scoped to whichever lane owns general ledger-netting assertions, so it is not duplicated per
  ticket.
- **The document-service-period fallback route** (AC1's "or the document's service period when one
  is recorded") is implemented (migration 0302's `bill_rows` CTE, the `document_service_periods`
  OR-branch) but has no dedicated cell — every DB battery cell drives the `posting_date` route.
  Worth a follow-up cell once a lane already has a `record_document_service_period` fixture handy
  (this lane's own `accrual-adjustments-fixtures.mjs` has one, `filedDocumentWithTerm`, but wiring
  it into a NEW bill-conflict scenario was judged out of proportion for this ticket's remaining
  budget).
- **A "skip" reason UX nuance**: the two remedy components (`AccrualBillConflictAffordance` and
  `AccrualBillConflicts`' own item renderer) duplicate the same two-mode (idle / entering-a-reason)
  local state machine rather than sharing one hook. Left as two small, independently-reviewable
  components rather than introducing a shared hook for a ~40-line pattern; worth revisiting if a
  THIRD surface ever needs the same two remedies.
- **`ACC.billEntryId`/`ACC.billDocumentId` in `accrual-mock.mjs`** mint a document/entry pair that
  is never separately validated by a dedicated fixture-shape test (unlike `POSTED`/`UNPOSTED`,
  which several existing cells cross-check). The one e2e cell that reads them
  (`accrual.walk.billConflict`) is the only proof they resolve to sane wire values.

## Anything unverified

- The GL-netting arithmetic claim in AC3 (see follow-ups above) — the MECHANISM is proven, the
  literal "sum of `journal_lines` for the period equals the bill's own amount" was not computed by
  a dedicated cell.
- `CLARA_MIGRATION_REDO` was not exercised for 0302 (no edit-and-redo cycle was needed this
  ticket); its idempotency is by construction (`create or replace function`, idempotent
  grant/revoke), not driven.
- The document-service-period OR-branch (see follow-ups) has no dedicated cell, only the migration
  probe's implicit non-use of it.
- I did not run the FULL `packages/db` test suite (hundreds of files, no ticket instruction to do
  so beyond the touched files' own full gate chain plus `operation-census`/`rig-isolation`, which
  I did run). A wave-level from-scratch/whole-suite proof is the integrator's, per RIG.md.
