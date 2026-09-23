# Wave 3 · Lane 06 · Ticket #936 — a dedicated accrual-correction door

Branch: `riders/w3-lane06`. Base: `ffe63a0dd084e99b84c1368119845be273c421ce` (integrated wave-2 head).
Commits (this ticket, first in the lane — `git log ffe63a0dd08..HEAD`):

```
8c892526c feat(db): #936 a dedicated accrual-correction door
e1180d020 docs(context): #936 record the "Accrual correction" term
cd8ac1a24 feat(web): #936 the accrual correction form and detail lineage
```

Status: **done**.

## The ticket

Today the only way to change an accrual's amount is the generic plan revision door
(`clara.revise_accounting_plan`, 0193): it advances the plan to a new revision but
`clara.accrual_adjustments` (0222) — keyed on `(plan_id, revision)` — stays at the first
revision, because the accrual configuration door only ever writes the first one. A reader
joining plan → revision → accrual detail then sees the OLD amount beside the NEW one the ledger
will post from the next due date on. The Agent Brief names two shapes; lane 05 (#908) pins
`clara.revise_accounting_plan`'s body as unchanged, so this lane took the **dedicated door**
shape — a new function that nests the plan-revision door (calls it, never recuts it).

## Acceptance criteria, with evidence

**1. "The accrual lane gains a correction path... a dedicated accrual correction door writes the
successor row with `corrects_accrual_id` set (the columns and the unique index exist; no writer
does today); the migration header says which and why, with prestate pins on every recut body."**

- Done. `packages/db/migrations/0284_accrual_correction.sql` adds exactly one new function,
  `clara.correct_accrual_adjustment(uuid,jsonb,text)`, its grant, and nothing else — no table, no
  column, no trigger, no index (verified: 0222 already carries `corrects_accrual_id`,
  `corrected_by_accrual_id`, the append-only trigger's one-admitted-update arm and the partial
  unique index `uq_accrual_adjustments_corrects`).
- The header states the choice (dedicated door, not a recut of `revise_accounting_plan`) and why
  (lane 05/#908's pin), in the file's own prose.
- Prestate pins 12 bodies the door depends on, **measured on this lane's database** (this is the
  first ticket in lane 06, so nothing had been recut before it): `clara.revise_accounting_plan`,
  `clara._human_ctx`, `clara._reserve_op`, `clara._finish_op`, `clara._hash`, `clara._audit`,
  `clara.role_rank`, `clara._assert_accrual_particulars`, `clara._assert_accrual_term_window`,
  `clara._assert_accrual_world`, `clara._accrual_journal_basis`, `clara._accrual_canonical`. The
  tail re-hashes all 12 and fails if any moved while the file ran. Exact shas are in the migration
  file's own arrays (prestate and tail, kept identical).
- Migration applied clean: `pnpm run migrate` → `applied 0284_accrual_correction · 268 total ·
  target 127.0.0.1:55746/clara_l06`. From-scratch-adjacent proof: this ticket is first in the lane,
  so the chain 0001→0284 on `clara_l06` (267 files migrated fresh, this file the 268th) is itself a
  from-scratch-style apply of this file; a genuine from-scratch re-chain is the integrator's job
  per RIG.md.

**2. "A cell revises an accrual's amount and proves the plan revision and the accrual detail agree
afterwards, the correction pointer names the superseded row, and already-posted occurrences (and
their reversals) are unchanged."**

- Done. `packages/db/tests/accrual-correction.test.mjs`:
  - `p936.basic` (test 1, PASS) — corrects an accrual's amount; asserts the plan advanced to
    revision 2 superseding revision 1, `get_accrual_adjustment` on the NEW row shows
    `detail.plan.basis.lines[0].debit_cents === 999900` (the corrected amount, on the LIVE plan
    basis the ledger will post from — "the exact defect #936 closes"), `corrects_accrual_id` /
    `corrected_by_accrual_id` name each other in both directions on the raw relation, the OLD row's
    amount and revision are byte-for-byte unchanged, and the schedule/authority window survived
    untouched (frequency, day_rule, effective_from/to all equal on the new live revision).
  - `p936.posted.untouched` (test 2, PASS) — posts the current-period occurrence for real (through
    `postPlanWork`, a real committed entry), corrects the accrual, then asserts the occurrence row
    is **byte-for-byte** unmoved (`assert.deepEqual(after[0], beforeOcc)`) and the old accrual's own
    detail still names the same entry, admitted under revision 1.

**3. "The accrual form's edit path uses the correction, not the generic revision, and shows the
correction lineage on the accrual detail."**

- Done. `apps/web/components/accruals/accrual-correction-form.tsx` is a new route,
  `/clients/:clientId/accruals/:accrualId/correct`, that calls `correctAccrual` →
  `clara.correct_accrual_adjustment` — never `revise_accounting_plan`. Nothing in this ticket's web
  changes touches the generic plan-revision form or door.
- `accrual-detail.tsx` renders `corrects_accrual_id` / `corrected_by_accrual_id` as linked lineage
  facts (both directions) and offers "Correct this accrual" unless the row is already corrected.
- Proven at three seams: the pure validator (`lib/work/accrual-draft.test.ts`, 8 new cells, all
  PASS), the mounted form (`accrual-correction-form.test.tsx`, 12 cells, all PASS — seeding, focus,
  server refusals, lost-response replay, op-key renewal, derived-lines-disabled, navigation to the
  successor, overlap warning), and the real browser (`e2e/accrual-walk.spec.ts`, 4 new cells, all
  PASS — lineage renders on both sides of an already-corrected pair with real navigation between
  them, an already-corrected row's own `/correct` route shows the refusal face, the form seeds from
  the live accrual and a server refusal focuses the named control, and a full correction is a real
  transition: destination is the new accrual's own address, the original re-reads to show
  "Corrected by" and loses the "Correct this accrual" control, and the list shows both rows).

**4. "From-scratch apply; the accrual and plan batteries stay green."**

- `packages/db/tests/accrual-adjustments.test.mjs`: 21/21 PASS (unchanged battery, re-verified
  after 0284 applied).
- `packages/db/tests/accounting-plans.test.mjs`: 20/20 PASS.
- Migration applied clean on this lane's database (see AC1). A true from-scratch chain on a
  disposable cluster is the integrator's proof per RIG.md/WORK-ORDER's wave-3 addendum; this
  ticket's own from-scratch-adjacent evidence is the clean apply onto the 267-file chain above.

## Seams tested

- The door itself: `clara.correct_accrual_adjustment(uuid,jsonb,text)`, driven only through
  `humanQuery` (real `clara_authenticated` sessions), never a direct table write.
- The plan-revision join: `clara.get_accrual_adjustment` and the raw `accounting_plan_revisions`
  relation, read independently of the door's own answer.
- The web door wrapper: `correctAccrual` (`lib/accruals/api.ts`).
- The mounted form: `AccrualCorrectionFormView`, driven through the same DOM-event harness
  `accrual-form.test.tsx` uses.
- The browser: real navigation, a real destination re-read, real focus, through
  `e2e/accrual-walk.spec.ts` on this lane's Playwright triple (3550/3551/3552).

## Gates, with counts

- `packages/db/tests/accrual-correction.test.mjs` — **7/7 PASS**, full gate chain
  (`$GATES` = every `--import ./tests/*-preintegration-gate.mjs` in `packages/db/package.json`,
  now including this ticket's own `accrual-correction-preintegration-gate.mjs`, added last in
  migration order).
- `packages/db/tests/accrual-adjustments.test.mjs` — **21/21 PASS**, full gate chain.
- `packages/db/tests/accounting-plans.test.mjs` — **20/20 PASS**, full gate chain.
- `packages/db/tests/operation-census.test.mjs` — **10/10 PASS** (this ticket adds one SQL
  function; the census requires it be attributed in `rig-meta.mjs`'s `ALLOWED` — done via the new
  `ACCRUAL_CORRECTION_0284_HUMAN_FNS`/`_COHORT`, spread into `ALLOWED[clara_authenticated]` and its
  own bimodal `cohortFailures()` call).
- `packages/db/tests/rig-isolation.test.mjs` — **22/22 PASS, 1 skipped** (T19, destructive, skipped
  by design per RIG.md — never run with `CLARA_RIG_ALLOW_RESET`). T17 (the exact per-role grant
  matrix) passed, confirming the cohort registration is byte-correct.
- `pnpm typecheck` (repo root) — clean (`apps/web` and `packages/runtime` both "Done").
- `pnpm lint` under `CI=true GITHUB_ACTIONS=true` (repo root, matching the runner) — clean, exit 0.
  One fix round: `packages/db/tests/accrual-correction.test.mjs` had an unused `markSkip` import
  (removed); `accrual-correction-form.test.tsx` tripped the raw-colour-value selector on a test
  title containing `#936` (reworded to "ticket 936" — the selector cannot distinguish a ticket
  reference from a hex-ish literal, per its own documented behaviour, #994).
- `apps/web` whole unit suite (`node scripts/run-tests.mjs`) — **4862/4864 pass, 0 fail, 2 skipped**
  (pre-existing skips, unrelated to this ticket). One fix round: the new `/correct` route needed a
  `REGISTRY_BUILT` entry in `lib/command/routes.test.ts` (the reverse-discoverability gate), added.
- `apps/web` e2e, `accrual` spec, on this lane's own Playwright triple
  (`CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3550 CLARA_E2E_NEXT_PORT=3551
  CLARA_E2E_RUNTIME_PORT=3552`) — **18/18 PASS** (14 pre-existing + 4 new correction cells). One fix
  round: `toHaveCount(2, "message")` is not a valid Playwright call shape (that argument is an
  options object, not a message) — fixed by moving the explanation to a comment.

No Windows-only known reds were hit by this ticket's own cells.

## Migration

`packages/db/migrations/0284_accrual_correction.sql` — stem `accrual_correction$`.

- **Prestate pins** (measured on `clara_l06` before applying, all present and byte-identical, no
  drift found on first apply):

  | signature | sha256(prosrc) |
  |---|---|
  | `clara.revise_accounting_plan(uuid,text,text,int,text,date,date,jsonb,text,text)` | `87c9f1e9bcf493493dd805585ade921b679afda97a62daa18334ef61258f431f` |
  | `clara._human_ctx(integer)` | `d1a8a1940ffee67f0bbe1f44f4081c8a5b1fca1775832948c2c606ced2043a46` |
  | `clara._reserve_op(uuid,text,text,bytea)` | `8816acb44d8c14980d21d8cdf19dc249f876f4bb49b39ca99b1f6fb915fe64b4` |
  | `clara._finish_op(uuid,text,text,jsonb)` | `c2beaa13c9c24ccce516f19552328b7d50272e5caedc8a9913cfd67af743d13e` |
  | `clara._hash(jsonb)` | `421483aadaa5989455a40f9c429dac3885dcd4b99056f0f2b66038ad54152547` |
  | `clara._audit(uuid,uuid,uuid,text,text,uuid,jsonb)` | `000c730cd29d6544b014ecb0635fc30d9a238f23cdbd8d224ae8f4331086e2f1` |
  | `clara.role_rank(text)` | `5ced25aed03ff000519af583c5c5b89c4d59c4cb5f20e49f39877435e8c2576f` |
  | `clara._assert_accrual_particulars(jsonb)` | `71e7f7f078b840c217b7582b1b78728f8f79b5601d5d8f4f821feca9b15e624b` |
  | `clara._assert_accrual_term_window(jsonb,date,date)` | `e13e895f126e7cf34bea5bab2dbcb74733384ef0a427f58b84d6b5b07b771a09` |
  | `clara._assert_accrual_world(uuid,uuid,jsonb)` | `32b3da54707f011987c8206106342317766021387d03df15d58ebf14c1d35750` |
  | `clara._accrual_journal_basis(jsonb,text,date)` | `d1da9cc4fd61d376ce140441a8849d501aafee77a1c81587116901d5fe3c6403` |
  | `clara._accrual_canonical(jsonb)` | `8c9dc78817e6730b6283727f0271c229a5794643c2f90038622504621c2a237e` |

- No table, column, trigger or index is added, altered or dropped.
- Applied once, cleanly, in this session — no `CLARA_MIGRATION_REDO` was needed. The file is
  written redo-safe by construction (`create or replace function`, idempotent grant/revoke, a
  prestate that asserts nothing about the door's own absence) per the header, but this was never
  exercised because no edit-after-apply round was required.
- First-apply branch: this run WAS the first apply (no prior state to distinguish a redo branch
  from), so the "prove the first-apply branch inside a rolled-back transaction" wave-3 addendum
  note does not apply here — there is no bimodal/marker-tolerant pin in this file to hide a branch
  from a redo (it recuts nothing).

## Docs

- `packages/db/README.md`: new `## 0284 — a dedicated accrual-correction door (#936, riders wave 3,
  lane 06)` section (the house convention every recent migration section follows), covering the
  bug, the choice, what the file does/does not add, the race it closes itself, the migration triad,
  and the redo-safety claim.
- `CONTEXT.md`: new **Accrual correction** term/_Avoid_ entry, beside the existing Accrual
  adjustment/reversal entries.

## Successor contract

None. This ticket adds no frozen-chat or Work-tool-facing capability — `correct_accrual_adjustment`
is a `clara_authenticated`-only human door reached from the web form, with no OBO twin (no runtime
verb, no wake wrapper). A future `claraWork`/chat-driven accrual correction would need one; it is
not built here and is named as a follow-up below.

## Follow-ups worth filing

- **No OBO twin for the correction door.** `create_accrual_adjustment_for` exists for the create
  path (runtime/chat-driven configuration); `correct_accrual_adjustment` has no equivalent. If a
  future ticket wants an agent- or chat-driven correction, it needs its own `_for` door (actor
  argument, no JWT), on the same footing 0222 §D states for the create pair.
- **Memo recovery on load is a best-effort heuristic.** `clara.get_accrual_adjustment` has no
  top-level `memo` field (only the derived journal basis's `plan.basis.memo`, which defaults to the
  purpose when the accrual's own memo was blank). `draftFromAccrual` in
  `accrual-correction-form.tsx` seeds the correction form's memo as `""` when the basis memo equals
  the purpose, which is right in the common case but cannot distinguish "memo was blank" from "memo
  happened to equal the purpose verbatim." Not a correctness issue for the door (memo is optional
  and this is a UI pre-fill only), but worth a dedicated `memo` column or read if a future ticket
  needs exact recovery.
- **No runtime e2e leg.** `packages/runtime/tests/accrual-e2e.mjs` (mentioned in
  `accrual-adjustments.test.mjs`'s own header as owning the runtime-side proof of the accrual
  lane against a real Postgres) was not extended for the correction door — out of scope for this
  ticket's acceptance criteria, which name the DB test battery and the web form/detail, not a
  runtime-lane battery. Flagging in case a later ticket expects one.

## Anything unverified

- A true from-scratch migration chain (0001→0284) on a disposable cluster was not run by this
  ticket — RIG.md and the wave-3 addendum assign that proof to the integrator. This lane's database
  went from a from-scratch 0001→0272 chain (already in place before this ticket started) to
  0001→0284 via one additional clean apply, which is the evidence available at this altitude.
- The "first-apply branch, proven inside a rolled-back transaction" note in the wave-3 addendum
  applies to a migration with a bimodal/marker-tolerant pin; 0284 has no such pin (it recuts
  nothing), so nothing was deliberately exercised there — noted rather than silently skipped.
