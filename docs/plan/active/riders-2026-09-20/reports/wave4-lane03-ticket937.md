# riders wave 4 · lane 03 · ticket #937 — Accruals: person-stated amount per period

**Branch** `riders/w4-lane03` · **base** `cd2925391` · **worktree** `C:\Users\zhant\Desktop\clara-wt\642`
· **database** `clara_l03` (127.0.0.1:55743) · **triple** 3520 / 3521 / 3522

**Status: DONE** for everything outside the frozen conversation half. AC4 (`start_accrual_work`) is a
successor contract below — `packages/runtime/lib/accrual-basis.ts` and `chatTurn.v21.tools.ts` are in
`frozen-workflows.json`, and the wave's one shared cut is `chatTurn_v22` at the end of wave 4.

## Commits (this ticket)

| commit | what |
|---|---|
| `f15baed9e` | `feat(db): #937 an accrual may carry a person-stated amount per period` — migration 0303, the battery, the gate module, the gate-chain entry, `packages/db/README.md`, `CONTEXT.md` |
| `f12ed79a6` | `feat(web): #937 the accrual form states an amount for each period` — the block, both forms, the draft rules, the messages, the cells (and 0303's census recut, see "unverified/notes") |
| `f138d6da6` | `docs: #937 the per-period accrual lane, in both module READMEs` |

Tickets before mine on this branch: #938 (`346a6354c`, `0e689107c`, `b511b116a`). Nothing of theirs
was redone.

## The seams I tested at

Written down before the first test, from #937's own acceptance criteria (no Agent Brief comment
exists on the ticket — `gh issue view 937 --comments` returns zero comments, so the BODY is the
contract):

1. `clara.create_accrual_adjustment` / `clara.create_accrual_adjustment_for` — the configuration door.
2. `clara.correct_accrual_adjustment` — the #936 correction door.
3. `clara.request_plan_catch_up` + `clara.wake_due_plan_occurrences` — how a due date is admitted,
   and therefore where the per-period line is resolved and where a missing one is refused.
4. `clara._plan_accrual_period_line(uuid,date)` — the new resolver, as a catalog object (volatility,
   definer, grants) and as an answer (a real NULL).
5. `clara.get_accrual_adjustment` — the detail read.
6. `clara.accrual_period_amounts` — the relation's own append-only law.
7. `AccrualFormView` / `AccrualCorrectionFormView` — rendered behaviour: the method control, the
   block, its add/remove, its inline refusals, the wire payload.
8. `validateAccrualDraft` / `validateAccrualCorrectionDraft` / `toAccrualParticulars` /
   `accrualScheduleDues` — the pure rules.

No cell tests an internal collaborator or a private function; every database subject is driven
through a door and every reader is corroboration only.

## Acceptance criteria, each with its evidence

### AC1 — a new per-period relation and a per-due-date resolver; `_plan_occurrence_basis` unchanged

**DONE.** `clara.accrual_period_amounts` (0303 §A): `(id, firm_id, client_id, accrual_id, due_date,
amount_cents, currency, recorded_by, created_at)`, unique on **(accrual_id, due_date)** — "keyed on
the accrual detail and the due date", the AC's own words — append-only by trigger (no admitted
UPDATE at all), RLS forced, `relacl` NULL. `clara._plan_accrual_period_line(p_plan, p_due)` (§C) is
`STABLE`, `SECURITY DEFINER`, `search_path` pinned, revoked from `public` and reachable by no
`clara\_%` role but `clara_fn_owner`.

- `p937.record` — a two-period accrual records exactly two rows, each carrying the amount stated for
  its own due date, filed to the accrual's own firm and client. `packages/db/tests/accrual-period-amounts.test.mjs`, PASS.
- `p937.resolver` — the resolver answers a real line for a stated period; **NULL** for a date nobody
  stated, for a `stated_amount` accrual, and for a uuid naming no plan (it does not raise). Its
  catalog row reads `{ vol: "s", definer: true, pub: false, human: false, runtime: false }`. PASS.
- `p937.append_only` — `update` and `delete` both raise `CLR08 / append_only`, as `postgres`, the
  superuser the rig connects as. PASS.
- `clara._plan_occurrence_basis` is **untouched**: pinned in 0303's prestate AND re-hashed in its
  tail at `cef3264e2a8956dc3d08259b6c1f6bf90bd5c155c7f473f88504f778f611829e`, with a separate tail
  assertion that it is still `provolatile = 'i'`.

### AC2 — `_plan_admit_occurrence` resolves the accrual line; methods and CHECK widen together

**DONE.** The admission core (§H) was recut **from its installed body**, never re-typed: the live
`pg_get_functiondef` was read, three edits applied by exact anchor (each verified to match once), and
the result embedded. The edits are all inside #653's own seam — the missing-line reason and message
become variables, an `elsif p.kind = 'reversing_journal'` arm is added beside the amortisation one,
and the shared refusal block names whichever lane refused.

- `p937.posts` — two periods post two DIFFERENT amounts (300,000 and 350,000) on the accrual's own
  two accounts, and each reversal undoes **its own period's** amount with the sides exchanged. The
  cell also asserts the two amounts really differ (so it cannot pass on a constant) and that neither
  entry carries the 650,000 total. PASS.
- `p937.missing` — the authority window is widened by `clara.revise_accounting_plan` (the existing
  plan-lane door), producing a due date the stated set does not cover. The catch-up admits nothing;
  the occurrence row carries `outcome.state='refused'`, `reason='accrual_period_amount_missing'`,
  `code='CLR10'`, `work_id` NULL, and no `clara.journal_entries` row exists for that date. PASS.
- The methods census: `clara._accrual_methods()` now returns
  `['stated_amount','stated_period_amount']` and `accrual_adjustments_method_check` was dropped and
  re-added with the same two. 0303's **tail** proves they agree by DRIVING the predicate — it creates
  a temporary table carrying the byte-identical literal CHECK, ties it to the real one by comparing
  their rendered `pg_get_expr(conbin, conrelid)` whitespace-normalised, then inserts one row per
  member of the function's own answer (all accepted) and one each for `source_document_amount`,
  `prior_period_amount`, `''`, `'anything'`, a method object with a second key, `[]` and a bare
  string (all must raise 23514). The tail notice is captured on every apply.
- `p937.methods` — through the door: the two withdrawn rules are still refused
  `accrual_method_unsupported` and the refusal's `supported` list reads exactly the two performed
  rules; `period_amounts` sent beside `stated_amount` is refused `accrual_period_amounts_unexpected`.
  PASS.

### AC3 — the form gains the block, the method control offers both rules, sum + remainder inline

**DONE.** `apps/web/components/accruals/accrual-period-amounts.tsx` — ONE block, rendered by the
create form (#652) and the correction form (#936).

- `937.form: the method is a REAL choice …` — the control is a `SELECT` whose options are exactly
  `["stated_amount","stated_period_amount"]`; the withdrawn rules appear nowhere. PASS.
- `937.form: the per-period block appears only under its own rule …` — absent under
  `stated_amount`; under the per-period rule the due-date `<select>` offers exactly the month-end
  dates the schedule reaches (`["", "2026-07-31", "2026-08-31"]`). PASS.
- `937.form: a row is added and removed …` — "Add a period" appends the next unstated due date;
  "Remove 2026-08-31" removes that row; the running total reads
  `Stated: RM 6,500.00. This matches the total.` and then
  `Stated: RM 3,000.00 of RM 6,500.00 — RM 3,500.00 short.` PASS.
- `937.form: a per-period set crosses the wire …` — an incomplete set sends NOTHING and renders
  *"A period the schedule reaches has no amount"*, focus landing on the block; a complete set sends
  `period_amounts: [{due_date, amount_cents} × 2]` beside `amount_cents: 650000`. PASS.
- `937.form: the per-period block passes the structural a11y scan …` — `test/a11yRules.ts` over the
  form with the block mounted, every rule clean except `heading-order` (an artefact of mounting the
  VIEW without its route's h1/h2, true of this form before this lane); plus every control asserted a
  real `SELECT`/`INPUT` with its own `<label for>`, and both actions real `<button>`s. PASS.
- The exact-sum and remainder rules inline: `937.periods: the exact-sum rule …` and
  `937.periods: the final-period remainder governs an EVEN split and nothing else` in
  `lib/work/accrual-draft.test.ts`. PASS.
- **Narrow width** is structural: each row is `flex flex-wrap items-end gap-2` with
  `min-w-40 flex-1` columns, so the date, the amount and the remove button stack at phone width.
  (Asserted as structure, not as a rendered viewport — no viewport harness exists in this suite.)
- The correction form: `937.correct: the block is SEEDED from what the door recorded …` and
  `937.correct: a restated set that no longer adds up …`. PASS.

### AC4 — `start_accrual_work` widens; the tool asks for a missing period; a World e2e leg

**NOT BUILT — successor contract below.** `packages/runtime/lib/accrual-basis.ts` is line 39 of
`frozen-workflows.json`, and the tool is registered by the frozen `chatTurn.v20/v21.tools.ts`. The
work order (addendum for wave 2 and later) says such a change is delivered as a successor contract
for the ONE shared `chatTurn_v22` cut at the end of wave 4. Every database door that cut will call
exists and is tested after this ticket. `node scripts/check-frozen-workflows.mjs` → OK, 312 files, no
manifest diff.

### AC5 — the cells

| claim | cell | result |
|---|---|---|
| two periods post two different amounts and two matching reversals | `p937.posts` | PASS |
| a missing period records the typed refusal and posts nothing | `p937.missing` | PASS |
| the exact-sum rule | `p937.walls` (db) + `937.periods: the exact-sum rule` (web) | PASS |
| the remainder rule | `p937.walls`, `p937.walls.uneven` (db) + `937.periods: the final-period remainder …` (web) | PASS |
| every existing `stated_amount` cell unchanged | `p937.stated_amount` + the whole `accrual-adjustments` battery 21/21 and `accrual-correction` 10/10 | PASS |
| from-scratch apply | **partly mine**: the FIRST-APPLY branch is proven below; the true from-scratch chain is the integrator's | see below |

Extra cells beyond AC5, each earning its place: `p937.record` (the relation), `p937.resolver` (NULL
is a real answer + the catalog shape), `p937.append_only`, `p937.correction` (the correction path
writes the successor's own rows and the next due date posts the corrected figure), `p937.op_key` (two
different sets under one key are a typed conflict, not a replay), `p937.read` (the detail read
answers with `period_amounts`), `p937.methods`, `p937.walls`, `p937.walls.uneven`.

## Migration

**`packages/db/migrations/0303_accrual_period_amounts.sql`** (1562 lines), applied to `clara_l03`
(`0303_accrual_period_amounts`, 291 applied migrations). Sections: prestate · §A relation + trigger +
RLS · §B methods + widened CHECK · §C resolver · §D the door's walls · §E canonical form · §F
configuration tail · §G correction door · §G2 detail read · §H admission core · §I tail.

**Bodies this file RECUTS** (prestate accepts the pre-image OR this file's own output; the tail then
asserts the output exactly):

| signature | pre-image | this file's output |
|---|---|---|
| `clara._accrual_methods()` | `51b59fae542b4f6214b8dca261265348b3c9973dc12f608c8b6442298cea917f` | `f3fdd04bac3bf925fe39dc5a552bfa97269136859ec83ee147d2e8d08ff0aef1` |
| `clara._accrual_canonical(jsonb)` | `8c9dc78817e6730b6283727f0271c229a5794643c2f90038622504621c2a237e` | `f7b2af98a7dcf0e3bb64434a12a6feb89431a551f37481bf9d888079a9c43a1b` |
| `clara._accrual_finish(uuid,uuid,uuid,text,jsonb,jsonb,text,jsonb,date,date,text)` | `dbcedcc778a04a237efe4c653f90605acc1121aa63117e23fb8fed1033f7e436` | `bbeb43099d0cee972a62b7a81c9eebe13620b94120c45ed05dc2c5e57287624b` |
| `clara.correct_accrual_adjustment(uuid,jsonb,text)` | `8cce0629770abe6ea6594c9792b57d16fb8ffd1d2568abb9bd8a85dacdac7ebb` | `9975f948944d2351c49eaa1c178f0dd9dc5572d446a7f9338ef9d5ede0b0fd79` |
| `clara._plan_admit_occurrence(uuid,date,text,text,boolean)` | `a34744199379ebf9fbdcbbd19cd68768ef228409533f19dfcf0daa0c3393ec46` | `6980feab1f7d7851ab07c76f7af6d0114423bd016f39d30d4c5a324d1a05337b` |
| `clara.get_accrual_adjustment(uuid)` | `98c967f6ae3e806e30c24e719d9a2eddc7f11ec1456b68b51ef402aee0d605c0` | `835c9dc7e419d480a0084ab84292f02e2bcb3fb99d3ef00dea85d50721641599` |

**New bodies** (no pin needed; their output shas, for a later lane that wants them):
`clara._plan_accrual_period_line(uuid,date)` `2fd492a29fd9c9fc5e3f85a5881f5c86704205acaf67a237a6a4900f578901d1`;
`clara._assert_accrual_period_amounts(jsonb,text,text,integer,date,date)`
`8fe150e87541bb218e80b91b0531b6606e6566b36027cf74a678a522d25be3f2`;
`clara._tf_accrual_period_amount_append_only()`.

**Bodies PINNED EXACT (unchanged), all measured live on `clara_l03` after this lane's #938 (0302).
The integrator should read this list for collisions with other lanes:**

| signature | sha256(prosrc) |
|---|---|
| `clara._plan_occurrence_basis(jsonb,date,text,uuid,jsonb)` | `cef3264e2a8956dc3d08259b6c1f6bf90bd5c155c7f473f88504f778f611829e` |
| `clara._plan_amortisation_period_line(uuid,date)` | `88d712d7f9b8e4edc8ece28936a75bfd30611476842dd6f7113d36735192578c` |
| `clara._accrual_journal_basis(jsonb,text,date)` | `d1da9cc4fd61d376ce140441a8849d501aafee77a1c81587116901d5fe3c6403` |
| `clara._assert_accrual_particulars(jsonb)` | `71e7f7f078b840c217b7582b1b78728f8f79b5601d5d8f4f821feca9b15e624b` |
| `clara._assert_accrual_term_window(jsonb,date,date)` | `e13e895f126e7cf34bea5bab2dbcb74733384ef0a427f58b84d6b5b07b771a09` |
| `clara._assert_accrual_world(uuid,uuid,jsonb)` | `32b3da54707f011987c8206106342317766021387d03df15d58ebf14c1d35750` |
| `clara._accrual_plan_core(uuid,uuid,uuid,text,text,jsonb,text,text,int,text,date,date,jsonb)` | `31adc6d4ae74d220b33fc950d164b0a256cafc914b2e1486400db20124939bc5` |
| `clara._plan_due_nth(date,text,text,int,int)` | `f224852215086025ee405e344e6ec549ec9399acd2ccf6ed11251e5e772cf20e` |
| `clara._plan_primary_for_reversal(date,text,text,int,date)` | `d0b2bb5b777d282b9811db452b4cef26e885d7bf916b592d7356f36be308a328` |
| `clara._plan_primary_entry(uuid,date)` | `e3106ae16a3f712c230bed6a1b2dcd8415ff17878436788a4a9b0edc48b4af46` |
| `clara._plan_window_ceiling(date,boolean)` | `dd7f4ceaf3cf2568d3a9d379e10d0b61af02d4b835da521ea4ff07e14165cf8c` |
| `clara._plan_occurrence_period_key(date,date,text,text,int,date,text)` | `6d9f60d345da4df4f4e237746b5e875d746a785892af24f4a316d0f8bbeac63f` |
| `clara._plan_admissible_event(uuid)` | `3b569e338f1c1ff563c61a2185db7198c565c804bf66c92fa941c06a4470f4b3` |
| `clara._plan_run_model()` | `c0bdc01a3f61a9ac384de879f124336d28c961468800eecb2dcdd696306913c3` |
| `clara.admit_journal_work(uuid,uuid,text,jsonb,text,jsonb,text)` | `011cfeedd4fe30ba37d34630fa43ad12ecd17a5e0f8e6abffe18f872e0697114` |
| `clara.revise_accounting_plan(uuid,text,text,int,text,date,date,jsonb,text,text)` | `8a6e69efac967592592bf3e8d08683145e5b43456a63fe673788337349382886` |
| `clara._human_ctx(integer)` | `d1a8a1940ffee67f0bbe1f44f4081c8a5b1fca1775832948c2c606ced2043a46` |
| `clara._reserve_op(uuid,text,text,bytea)` | `8816acb44d8c14980d21d8cdf19dc249f876f4bb49b39ca99b1f6fb915fe64b4` |
| `clara._finish_op(uuid,text,text,jsonb)` | `c2beaa13c9c24ccce516f19552328b7d50272e5caedc8a9913cfd67af743d13e` |
| `clara._hash(jsonb)` | `421483aadaa5989455a40f9c429dac3885dcd4b99056f0f2b66038ad54152547` |
| `clara._audit(uuid,uuid,uuid,text,text,uuid,jsonb)` | `000c730cd29d6544b014ecb0635fc30d9a238f23cdbd8d224ae8f4331086e2f1` |
| `clara.role_rank(text)` | `5ced25aed03ff000519af583c5c5b89c4d59c4cb5f20e49f39877435e8c2576f` |
| `clara._tf_accrual_adjustment_append_only()` | `e2d6fb3e2df66848053b6f5f442726e8984e1abd400c2fd23bd4a7cb90b1db4c` |
| `clara._tf_accrual_adjustment_term_congruent()` | `1e0483a6e9c19604305194b09b64a14c0bcfb6a1ca6133bcd3907efa7ea4411b` |

**Collision note for the integrator.** `clara._plan_admit_occurrence` and
`clara._plan_occurrence_basis` are the two bodies most likely to be pinned by another lane this
wave (#938/0302 pins the admission core as UNCHANGED, and 0302 sorts BEFORE 0303, so on an
integrated chain 0302's pin is satisfied at the moment it runs and 0303 then moves it). `0284`'s own
tail pins `clara._accrual_canonical` as unchanged and also sorts before 0303. A lane whose migration
number lands AFTER 0303 and pins any of the six recut bodies at its pre-image will need to be
re-measured.

**Migration triad.** `packages/db/tests/accrual-period-amounts-preintegration-gate.mjs` (stem
`accrual_period_amounts$`) and its `--import` token in `packages/db/package.json`, spliced last in
migration order, directly after `accrual-bill-conflict-preintegration-gate.mjs`. **No `rig-meta.mjs`
cohort**: this file mints no new GRANTED name (every function it adds is an ungranted internal),
which is the 0285/0295 shape rather than the 0284/0302 one, and the tail asserts that no `clara\_%`
role but `clara_fn_owner` can execute either new function.

**Redo, and what I did with it (#957).** The file was edited twice after its first apply and
re-applied with `CLARA_MIGRATION_REDO=0303_accrual_period_amounts` each time (three redos in all):
once to add `clara.get_accrual_adjustment`'s `period_amounts` key, once to replace the tail's
`execute format(...)` census, and once to prove the redo branch itself. Redo-safe by construction:
`create table if not exists`, `create or replace function`, `drop trigger if exists`,
`drop policy if exists`, `drop constraint if exists` before the widened CHECK, and
`create index if not exists`.

**Both prestate branches driven on `clara_l03`:**

- REDO: `#937 prestate: clean (REDO) — the six bodies this file recuts are each at exactly one of
  their two admitted values …` (the migrate run above).
- FIRST APPLY: the real first apply reported it, and — because the file has changed since — it was
  driven again for the CURRENT file inside a transaction that was rolled back: the six recut bodies
  were restored to their pre-images **and verified by sha against the pins in the table above**, the
  relation was dropped, the ledger row deleted, and the WHOLE file run. Output:
  `PRE-IMAGES RESTORED: all six bodies hash to the pins 0303 measured.` /
  `PRESTATE: #937 prestate: clean (FIRST APPLY) …` / `TAIL OK : yes`. The database was re-measured
  afterwards: `max(version)=0303_accrual_period_amounts`, 291 rows, all six bodies at this file's
  output shas.

**Data-dependent branches entered.** The tail's census inserts rows into its own temporary table
(both the accepted and the refused arms run on every apply). The prestate has no row-dependent
branch. `clara._accrual_finish`'s new insert has a `where … = 'stated_period_amount'` arm that is
false for every `stated_amount` accrual and true for a per-period one; both were driven on this rig
before the redo (`p937.record` and `p937.stated_amount`).

## Gates, with counts

| gate | result |
|---|---|
| `tests/accrual-period-amounts.test.mjs` (full gate chain, 108 `--import` gates) | **12 / 12**, 0 skipped |
| `tests/accrual-adjustments.test.mjs` (full gate chain) | **21 / 21**, 0 skipped |
| `tests/accrual-correction.test.mjs` (full gate chain) | **10 / 10**, 0 skipped |
| `tests/accrual-bill-conflict.test.mjs` (full gate chain) | **9 / 9**, 0 skipped |
| `tests/operation-census.test.mjs` (full gate chain, no reset flags) | **10 / 10** |
| `tests/rig-isolation.test.mjs` (full gate chain, no reset flags) | **22 / 23**, 1 expected destructive skip |
| neighbours (no gate chain): `prepayment-occurrences` 10/10, `prepayment-schedule` 18/18, `prepayment-term-liveness` 3/3, `accounting-plan-occurrences` 16/16, `accounting-plans` 20/20 | all PASS |
| `apps/web` whole unit suite (`node scripts/run-tests.mjs`) | **5007 pass / 5009, 0 fail, 2 skipped** (the known Defender/EICAR skips) |
| `pnpm --filter @clara/web e2e accrual-walk` on 3520/3521/3522 | **19 / 19** |
| `pnpm typecheck` | PASS (`apps/web`, `packages/runtime`) |
| `CI=true GITHUB_ACTIONS=true pnpm lint` | PASS (all four packages) |
| `node scripts/check-frozen-workflows.mjs` | OK — 312 frozen files, no manifest diff |

No Windows-only red was hit, and none was "fixed".

## Vacuity controls

Because a migration is one atomic artefact, the whole of 0303 had to exist before its first cell
could be green — the vertical slices were driven by REDO, and five of the eleven database cells were
green on their first run. Each subject is therefore proven non-vacuous by a deliberate mutation,
restored byte for byte afterwards (sha re-measured every time):

| mutation | cells that went red | restored |
|---|---|---|
| the accrual arm cut out of `clara._plan_admit_occurrence` | `p937.posts`, `p937.missing`, `p937.correction` (3 of 11) | `6980feab…` verified |
| `clara._assert_accrual_period_amounts` stubbed to `begin return; end` | `p937.walls`, `p937.methods` (2 of 11) | `8fe150e8…` verified |
| `clara._accrual_canonical` reverted to 0222's body | `p937.op_key` (1 of 11) — and the mutated body hashed to `8c9dc788…`, 0222's own pre-image, which is independent confirmation the mutation was an exact revert | `f7b2af98…` verified |
| `validateStatedPeriodAmounts` stubbed to `return []` | 5 of the 11 new web draft cells | rebuilt and re-verified (see "unverified/notes") |
| the per-period block never rendered | 4 of the 5 new form cells | sha1 verified |

## Docs

- `packages/db/README.md` — a new "0303" section: the seam it rides, why the relation is a relation
  and carries no `plan_id`, why the live detail is the highest revision, what a reversal resolves,
  the five door walls and the sixth (occurrence) one, why `_accrual_canonical` had to move, and why
  the census drives a temporary table rather than a dynamic `execute`.
- `apps/web/README.md` — a new "#937" section: why the method control became a choice, one block for
  two forms, the chosen-not-typed due date, the running total, the first-period preview, what the
  draft module mirrors, and what narrow-width/keyboard means structurally.
- `CONTEXT.md` — "**Calculation method**" rewritten (the set now holds the two rules a lane
  performs), and a new term "**Stated period amount**" in the house `term / _Avoid_` shape.

## Successor contract — `start_accrual_work` for the `chatTurn_v22` cut (AC4)

Everything below is for the wave's shared cut. **Nothing frozen was edited.**

**Name** `start_accrual_work` (unchanged). **Carrier**
`packages/runtime/lib/accrual-basis.ts` → its successor (`accrual-basis.v2.ts` or whatever the cut
names it); the frozen file stays.

**Zod input — the delta only.** Everything else in `startAccrualWorkInputSchema` is unchanged,
including `.strict()`:

```ts
method: z.enum(ACCRUAL_METHODS)          // ACCRUAL_METHODS becomes
                                         // ["stated_amount", "stated_period_amount"] as const
  .describe(
    "Which stated amount each period uses. `stated_amount`: the figure in `amount_cents`, accrued "
    + "in every period of the window. `stated_period_amount`: the accountant states a figure for "
    + "EACH period; `amount_cents` is then the TOTAL for the window and `period_amounts` carries "
    + "the periods. It computes nothing either way."),

period_amounts: z
  .array(z.object({
    due_date: isoDate.describe("A due date of this schedule inside the authority window."),
    amount_cents: z.number().int().positive(),
  }).strict())
  .min(1)
  .optional()
  .describe(
    "Required when `method` is `stated_period_amount`, and refused under any other rule. One entry "
    + "per due date the schedule reaches; they must sum EXACTLY to `amount_cents`. Ask the human "
    + "for any period you do not have — never invent one, never average, and never read one off a "
    + "document."),
```

**Door call, with argument order (unchanged arity; only `p_accrual`'s shape widens).**
`clara.create_accrual_adjustment_for` is the OBO door a `claraWork` run reaches:

```
clara.create_accrual_adjustment_for(
  p_client uuid, p_author uuid, p_purpose text, p_authority_ref jsonb, p_accrual jsonb,
  p_frequency text, p_day_rule text, p_day_of_month integer, p_timezone text,
  p_effective_from date, p_effective_to date, p_op_key text)
```

`p_accrual` gains ONE key, in the database's own spelling, and only under the per-period rule:

```jsonc
{ …the existing particulars…,
  "method": { "rule": "stated_period_amount" },
  "period_amounts": [ { "due_date": "2026-07-31", "amount_cents": 300000 },
                      { "due_date": "2026-08-31", "amount_cents": 350000 } ] }
```

The human door `clara.create_accrual_adjustment` takes the same shape without `p_author`.
`clara.correct_accrual_adjustment(p_accrual_id uuid, p_accrual jsonb, p_op_key text)` takes the same
`p_accrual`, and the schedule it validates against is the LIVE revision's own.

**Refusal mapping — eight new `detail.reason` tokens, every one `CLR10`, every one on
`detail.field = "accrual.period_amounts"` (the element-shape one is indexed, e.g.
`accrual.period_amounts[2].amount_cents`).** The successor's `localAccrualRefusal` should raise the
first four locally, before any round trip, exactly as it already does for the term and the amount:

| reason | what it means | the sentence the tool should say |
|---|---|---|
| `accrual_period_amounts_absent` | the per-period rule with no set | "Which amount does each period accrue? I have none." |
| `accrual_period_amount_invalid` | an element is not an object, its `due_date` is not a date, or its `amount_cents` is not a positive integer of minor units | "This period's figure is not an exact amount in cents." |
| `accrual_period_amount_duplicate` | two entries name one due date | "Two amounts are stated for <date>. Which one is right?" |
| `accrual_period_amounts_unbalanced` | the set does not sum to `amount_cents` (detail carries `total_cents`, `stated_cents`, `difference_cents`) | "The periods come to X; the accrual totals Y. Which should I change?" |
| `accrual_period_amount_not_scheduled` | a stated date is not a due date of this schedule (detail carries `due_date`) | "<date> is not a due date of this schedule." |
| `accrual_period_amount_missing` | a due date the schedule reaches is unstated (detail carries `due_date` = the FIRST one, and `missing` = all of them) | **THE ASK.** "What should <date> accrue?" — this is AC4's "the tool asks when a period is missing", and the detail hands the tool the exact dates to ask about. |
| `accrual_period_remainder_misplaced` | an even split whose odd cent is not in the final period (detail carries `remainder_cents`, `final_due_date`, `stated_on`) | "An even split leaves <n> cent(s); by convention they belong to <final date>." |
| `accrual_period_amounts_unexpected` | per-period amounts sent beside `stated_amount` | a bug in the tool, never a sentence to a person. |

**Part kind:** none. This rides the existing `start_accrual_work` result part unchanged; the
database answer gains no field (`clara.create_accrual_adjustment`'s envelope is unchanged).
`clara.get_accrual_adjustment` now answers with `period_amounts` (`[]` under `stated_amount`), which
is what a later read part would hydrate from.

**Prompt stanza (proposed wording for the cut):**

> When an accountant tells you the amount varies by period — "July three thousand, August three
> thousand five hundred" — record it with `method: "stated_period_amount"` and one
> `period_amounts` entry per due date, with `amount_cents` set to the TOTAL for the window. If you
> do not have a figure for a period the schedule reaches, ASK for it by date. Never average, never
> carry a previous period forward, and never read an amount off a document: the amounts are ones a
> person states. If an even split leaves a cent over, it belongs to the final period.

**World e2e leg (AC4's third clause), for the cut to add:** the runtime spawner
`packages/runtime/tests/accrual-e2e.mjs` already admits a `clara_l<NN>` database name. The leg is:
configure a two-period accrual through the tool under `stated_period_amount`, run both due dates,
and assert the two entries carry the two different stated amounts — the same claim
`p937.posts` makes at the database seam, through the conversation.

## Follow-ups worth filing

1. **The accrual DETAIL surface does not show the per-period amounts.** `clara.get_accrual_adjustment`
   now answers with them (this ticket), and `components/accruals/accrual-detail.tsx` still renders
   only `amount_cents`. A reader of a per-period accrual sees the window total and no schedule of
   figures. Small, self-contained, and squarely the next thing a bookkeeper will ask for.
2. **`clara.list_accrual_adjustments` does not carry the rule's meaning.** The register prints
   `amount_cents` under a "Amount" column for both rules, and under `stated_period_amount` that
   number is a TOTAL, not a per-period figure. The column should say which.
3. **The `stated_period_amount` meaning-shift of `amount_cents` is a default the owner may flip.**
   The ticket's own body directed it ("the stated amounts must sum exactly to the accrual's total"),
   and it is what makes the set checkable; an alternative design would drop `amount_cents` entirely
   under this rule. Worth a line in a grill.
4. **The final-period remainder rule is narrower than the ticket's sentence.** See "unverified"
   below.

## Unverified / judgement calls a reviewer should look at

1. **The remainder rule's scope is my reading, not the ticket's words.** #937 says "the stated
   amounts must sum exactly to the accrual's total, with any cent remainder placed in the final
   period (the prepayment lane's `final_period` rule)". Taken literally the two halves conflict: if
   every period is stated, there is no division and no remainder. I implemented the exact-sum rule as
   law, and the remainder convention as a wall over exactly the shape it can govern — a set that IS
   an equal split with one odd period must put the odd period LAST. A genuinely uneven set (July
   3,000, August 3,500) never enters that arm, which is the ticket's headline case. The ticket lists
   this among "decisions taken with defaults the owner may flip on review". `p937.walls.uneven` and
   `937.periods: the final-period remainder …` pin the boundary in both directions.
2. **Door-side completeness vs occurrence-side refusal.** The ticket says a missing period "records a
   typed refusal on that occurrence". I enforce completeness at the DOOR too, so the common case
   never reaches a silently-unposted period; the occurrence-side refusal then covers the one case the
   door cannot see — a due date that appears AFTER configuration because
   `clara.revise_accounting_plan` widened the window. Both are tested; neither is dead.
3. **The correction form widened beyond AC3's letter.** AC3 names "the accrual form". Leaving the
   correction form out would have meant a `stated_period_amount` accrual could not be corrected from
   the browser at all (its only amount-change path, per the ticket's own body), which reads as a dark
   feature under the standing "beta: nothing dark" ruling. That is why `clara.get_accrual_adjustment`
   is the sixth recut body. A reviewer who disagrees can cut §G2 and the correction form's block.
4. **Narrow width is asserted as structure, not as a rendered viewport.** There is no viewport
   harness in this suite; the claim rests on `flex flex-wrap` + `min-w-40 flex-1` rows and was not
   measured at a phone width in a browser.
5. **`heading-order` is excluded from the a11y assertion**, and only it. It fires because the cell
   mounts the VIEW without its route's own h1/h2, and it is true of this form with or without my
   block. Every other rule is asserted clean.
6. **I briefly destroyed my own uncommitted work and rebuilt it.** During the web vacuity control I
   restored a mutated file with `git checkout -- apps/web/lib/work/accrual-draft.ts`, which reverted
   it to HEAD — at that moment the DB-only commit — discarding all of this ticket's edits to that
   file. I rebuilt them from the same substitutions, and the evidence that the rebuild is complete is
   that `pnpm typecheck` and all 40 cells in `accrual-draft.test.ts` (plus the 18 form cells, the 14
   correction cells and the whole 5009-test suite) are green on the rebuilt file. The vacuity result
   itself (5 cells red under the stub) was recorded before the accident. Every later restore used a
   file copy with a sha1 check instead.
7. **The from-scratch chain is the integrator's.** I proved the FIRST-APPLY branch of the current
   file against restored, sha-verified pre-images inside a rolled-back transaction, and a REDO on the
   live database; I did not run a whole 0001→0303 chain (RIG.md forbids a second from-scratch chain
   on this cluster).
8. **`packages/runtime` is untouched**, so no runtime unit file, no `check-parts-parity.mjs` run and
   no WSL re-run under `runner` applies to this ticket.
