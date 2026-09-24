# riders wave 4 · lane 03 · ticket #942 — Accrued revenue: the accrual lane gains a revenue side

**Branch** `riders/w4-lane03` · **base** `cd2925391` · **worktree** `C:\Users\zhant\Desktop\clara-wt\642`
· **database** `clara_l03` (127.0.0.1:55743) · **triple** 3520 / 3521 / 3522

**Status: DONE** for everything outside the frozen conversation half and outside a locale this app
does not have. AC5 (`start_accrual_work`) is a successor contract below. AC2's "zh" half is not
buildable: this app ships `apps/web/messages/en.json` alone (measured — `find . -name "zh*.json"`
outside `node_modules` returns nothing, and `apps/web/i18n/request.ts:29` records that adding a
locale is a `routing.ts` + middleware change). Everything else is built and driven.

## Commits (this ticket)

| commit | what |
|---|---|
| `94c393cb0` | `feat(db): #942 the accrual lane gains a revenue side` — migration 0304, the battery, the gate module, the gate-chain entry, `packages/db/README.md`, `CONTEXT.md` |
| `cc92f2308` | `feat(web): #942 every accrual surface says which way it runs` — the side through api/draft/form/register/correction/detail/needs-you, the messages, the cells, the browser walk, `apps/web/README.md`, the dynamic-SQL corpus entry |

Tickets before mine on this branch: #938 (`346a6354c`, `0e689107c`, `b511b116a`) and #937
(`f15baed9e`, `f12ed79a6`, `f138d6da6`). Nothing of theirs was redone.

**Slicing note.** Five database slices were driven test-first with `CLARA_MIGRATION_REDO` between
them (side → reads; the basis flip; the correction wall; the per-period mirror; the queue splice),
each cell red for the right reason before its section existed, and five web slices after them. They
are committed as ONE `feat(db)` and ONE `feat(web)` commit because a migration is one artefact that
each redo rewrites — the lane's own #937/#938 precedent. The per-slice red/green is recorded under
each acceptance criterion below and re-proved by the vacuity controls.

## The seams I tested at

Written down before the first test, from #942's own acceptance criteria and its 2026-09-20 owner
ruling (the newest comment on the ticket; there is no Agent Brief comment):

1. `clara.create_accrual_adjustment(p_client, p_purpose, p_authority_ref, p_accrual, …, p_op_key)` —
   the configuration door, and `p_accrual.side` on its wire.
2. `clara.correct_accrual_adjustment(p_accrual_id, p_accrual, p_op_key)` — the #936 correction door.
3. `clara.get_accrual_adjustment(uuid)` and `clara.list_accrual_adjustments(uuid,date,date)` — the
   detail and the register.
4. `clara.list_review_queue(p_scope, p_cursor, p_limit)` — #938's `accrual_bill_conflict` arm.
5. `clara.request_plan_catch_up` + `clara.wake_due_plan_occurrences` → `clara.journal_lines` — what
   each side actually POSTS and reverses, read off the ledger.
6. `clara.apply_coa_template(p_client, p_template, p_families, p_op_key)` — the real door that puts
   `1180 Accrued Income` on a client's chart.
7. Web: `apps/web/lib/accruals/api.ts` (`derivedAccrualLines`, the types), `lib/work/accrual-draft.ts`
   (`toAccrualParticulars`, the parser), the `AccrualFormView`, `AccrualsList`,
   `AccrualCorrectionForm`, `AccrualDetail`, `AccrualBillConflicts`, `lib/firm/needs-you.ts`.
8. Browser: the Accruals page and its `/new` form, through a real Next build and a real Playwright
   browser (`apps/web/e2e/accrual-walk.spec.ts`).

No cell tests an internal collaborator or a private function; every database subject is driven
through a door and every reader is corroboration only.

## Acceptance criteria, each with its evidence

### AC1 — the detail gains a side; the pair is asserted BY the side, with the same typed refusals

**DONE.** `clara.accrual_adjustments.side text not null default 'expense'` +
`ck_accrual_adjustments_side` (0304 §A). `clara._accrual_sides()` holds the closed set and
`clara._accrual_side(jsonb)` answers what an absent key means, in one place, for the door, the
canonical form, the basis builder and every wall.

- `p942.side.configure` — a revenue accrual is configured through the human door; `get_accrual_-
  adjustment` and `list_accrual_adjustments` both answer `side='revenue'`; an accrual configured
  with NO side at all answers `expense`. PASS. (Red before §A–§G: the read carried no `side` key.)
- `p942.walls` — the pair by side, through the door, all six refusals typed:
  an expense account on the revenue side's P&L leg → `accrual_account_relationship` /
  `constraint: income_account` / `expected_account_type: income`; a liability on its balance-sheet
  leg → `asset_account`; **a control account on the asset side → `non_control_asset`** (AC6's own
  line) with `account_class: receivable`; the expense side unmoved → `non_control_liability` and
  `expense_account` for an income account on its P&L leg; an unknown side →
  `accrual_side_unsupported` on `accrual.side` with `supported: ["expense","revenue"]`, and a blank
  side likewise. PASS.
- **Existing rows are expense** — the tail asserts it against what the PRESTATE counted, and the
  FIRST-APPLY proof below drove it on a database carrying 391 accrual rows.
- **A tail census proving existing rows read unchanged**: the expense side's basis arm is the old
  body comment for comment (so every frozen revision basis is byte-identical), the whole
  `accrual-adjustments` battery (21/21), `accrual-correction` (10/10) and `accrual-period-amounts`
  (12/12) are green unchanged, and 0304's tail re-hashes all ten recut bodies.

### AC2 — the page, form and detail gain the side; Needs-you rows name it; en and zh

**DONE for en; zh is not buildable (see the status line).**

- **The form**: `942.form: the side is a REAL choice …` — the control is a `SELECT` whose options
  are exactly `["expense","revenue"]`; on the expense side the two pickers offer `["", "6100"]` and
  `["", "2020"]` and read "Expense account" / "Liability account"; choosing `revenue` re-labels them
  "Revenue account" / "Accrued income account" and re-fills them with `["", "4000"]` and
  `["", "1150", "1180"]`. PASS. `942.form: a revenue accrual crosses the wire with its side …` —
  the preview shows the accrued-income leg and the door receives `side: "revenue"` with the two
  codes. PASS. Choosing a side CLEARS both chosen account codes (they are of the wrong type for the
  new side).
- **The register**: `942.list.side` — each row names its side and prints its legs in POSTING order
  (`Dr 1180 / Cr 4000` for the revenue accrual, `Dr 6100 / Cr 2020` for the expense one). PASS.
  `942.list.filter` — the register narrows to one side through `#accruals-side-filter`. PASS.
- **The detail**: a `Which way it accrues` fact, and both legs labelled by the side
  (`accrual-detail.tsx`). Covered in the browser by the walk's register assertions and by
  `pnpm typecheck`; there is no unit harness for `AccrualDetail` in this suite (see "unverified").
- **The correction form**: `942.correct: … shows the side, labels both legs by it, and offers NO way
  to change it` — no `accrual-side` control exists on that form, the two pickers are filtered and
  re-labelled, and the side crosses the wire exactly as recorded. PASS.
- **Needs-you rows name the side**: the database's own sentence now reads "A document-sourced
  invoice or receipt posted inside the accrued period …" for a revenue accrual (`p942.conflict`
  asserts it, and asserts the expense side still starts with #938's exact words), and the row
  carries `accrual_side`. The Accruals-page item renders it as "Revenue accrual" / "Expense
  accrual".
- **en**: fifteen keys added to `Accruals` and one to the bill-conflict block, all in one hunk at
  the sorted position; `pnpm lint` runs `check-message-keys.mjs` and passes.

### AC3 — the "document arrived inside an accrued period" read gains a revenue arm

**DONE.** MEASURED FIRST: the arm 0302 added is already side-agnostic — it joins the accrual's own
profit-and-loss leg (`aa.expense_account_code`), which on a revenue accrual IS the income account —
so a receipt hitting it inside a posted, un-reversed period ALREADY surfaced. That is not an
argument, it is what the first run of `p942.conflict` showed: every assertion up to the side passed
against the unmodified body. What the arm could not do was say which side it was about.

- `p942.conflict` — a posted revenue accrual plus a real document-sourced, approved receipt
  (Dr bank / Cr the revenue account, filed → drafted → approved through the estate's own three
  doors) inside the accrued period surfaces exactly ONE `accrual_bill_conflict` row: `id` = the plan
  (so both remedies act on it), `entry_id` = the receipt, `period` = the flagged due date,
  `accrual_side` = `revenue`, and a sentence matching `/invoice or receipt/i`. The expense side,
  built beside it in the same cell, still matches `/^A document-sourced entry posted inside the
  accrued period /` and carries `accrual_side: "expense"`. PASS.
- **The same two remedies** are unchanged and untouched: `clara.request_plan_catch_up` ("reverse
  now") and `clara.skip_plan_occurrence` ("skip this period's next occurrence") both act on the
  plan id the row carries, and #938's own battery (9/9) still proves their matrix.

### AC4 — the correction path and the per-period amounts work on both sides

**DONE.**

- `p942.correct` — a revenue accrual is corrected (300,000 → 275,000); the successor row carries
  `side='revenue'`; the accrual posts Dr accrued income / Cr revenue for the figure it was admitted
  with, and the reversal credits the asset and debits the revenue account by one amount. Asking for
  the other side is refused `accrual_side_immutable` (CLR10), and so is a correction that states NO
  side, because silence means `expense`. PASS.
- `p942.periods` — a revenue accrual whose amount a person stated per period (#937) posts each
  period's own figure Dr accrued income / Cr revenue, the two figures differ (so the cell cannot
  pass on a constant), and the line that names the period sits on the profit-and-loss leg on this
  side as it does on the expense side. PASS.
- `p942.op_key` — one idempotency key cannot answer for two accruals that differ only in their
  side (`op_key_conflict`), and an identical re-send still replays. PASS.

### AC5 — the conversation half at the shared cut

**NOT BUILT — successor contract below.** `packages/runtime/lib/accrual-basis.ts` is in
`frozen-workflows.json` and `start_accrual_work` is registered by the frozen `chatTurn.v20/v21`
tool tables. The ticket's own 2026-09-20 housekeeping note re-points this to the ONE shared
`chatTurn_v22` / `claraWork_v6` cut at the end of wave 4; every database door that cut will call
exists and is tested after this ticket. `node scripts/check-frozen-workflows.mjs` → OK, 312 frozen
files, no manifest diff. The frozen tool's `.strict()` schema carries no `side`, so it keeps
configuring expense accruals exactly as it does today — the compatibility this file's default exists
for.

### AC6 — the cells

| claim | cell | result |
|---|---|---|
| a revenue accrual posts on the due date and reverses on the first of the next month | `p942.posts` | PASS |
| an invoice posted afterwards nets to ONE live revenue amount | `p942.posts` (the ledger is summed: accrual + reversal net to 0 on both legs, then the invoice's 510,000 is the only live revenue) | PASS |
| a control account on the asset side is refused | `p942.walls` (`non_control_asset`) | PASS |
| from-scratch apply | **partly mine**: the FIRST-APPLY branch of the current file is proven below; a true 0001→0304 chain is the integrator's | see "Migration" |
| the accrual battery stays green | `accrual-adjustments` 21/21, `accrual-correction` 10/10, `accrual-period-amounts` 12/12, `accrual-bill-conflict` 9/9, `wave4-chart-rows` 6/6 | PASS |

Extra cells earning their place: `p942.side.configure` (the reads and the default), `p942.conflict`
(AC3), `p942.correct` (AC4), `p942.periods` (AC4), `p942.op_key` (the canonical form), and
`p942.standard_chart` — a client born through `clara.create_client` + the onboarding commit and
given the CURRENT published platform template through `clara.apply_coa_template` accrues income into
`1180 Accrued Income`, Dr 1180 / Cr 4000, with 1180 asserted `asset`, non-control and active. That
cell is how this lane CONSUMES 0295's row instead of minting a look-alike (lane rule (a)); the other
cells use the ruling's own alternative, `1320 Unbilled Receivables (Work-in-Progress)`.

## Migration

**`packages/db/migrations/0304_accrual_revenue_side.sql`** (1405 lines), applied to `clara_l03`
(`0304_accrual_revenue_side`, 292 applied migrations). Sections: §0 prestate · §A the side (the
closed set, the resolver, the column, the CHECK, the column comment) · §B the account predicate ·
§C the particulars · §D the world half · §E the canonical form · §E2 the basis · §F the
configuration tail · §F2 the correction path · §G the two reads · §H the per-period line override ·
§I the `list_review_queue` splice · §Z tail.

**Bodies this file RECUTS** (prestate accepts the pre-image OR this file's own output, and refuses
anything else; the tail then asserts the output exactly). Every pre-image was MEASURED live on
`clara_l03` after #938 (0302) and #937 (0303), never transcribed:

| signature | pre-image | this file's output |
|---|---|---|
| `clara._assert_accrual_account(uuid,text,text,text,boolean)` | `0ace7c706d75b803d4a093ee060c9936e0b6ddac27ea00bb5a1a76f8e24d2f7d` | `5e80929f7f6bb7c7e77218b69be34d1cb986d3b07010a5047353e2d55359987f` |
| `clara._assert_accrual_particulars(jsonb)` | `71e7f7f078b840c217b7582b1b78728f8f79b5601d5d8f4f821feca9b15e624b` | `a5a8e80f0a9843568e9c34ac69afacaf5897a0ba432ae85a92494ebdef4ad1f4` |
| `clara._assert_accrual_world(uuid,uuid,jsonb)` | `32b3da54707f011987c8206106342317766021387d03df15d58ebf14c1d35750` | `7c26456962c4b7f145f626046db36aa90286a6d201161dbb5199fcc13b74f43f` |
| `clara._accrual_canonical(jsonb)` | `f7b2af98a7dcf0e3bb64434a12a6feb89431a551f37481bf9d888079a9c43a1b` | `53d65bd346da9dd65dd27becf91d8f2ea9fca1ccf3e0356a12a36fe69fa13dc3` |
| `clara._accrual_journal_basis(jsonb,text,date)` | `d1da9cc4fd61d376ce140441a8849d501aafee77a1c81587116901d5fe3c6403` | `5b77077993986a53422716f289a4abeac7a17d9ee0c23bcabb08c7f77cb581de` |
| `clara._accrual_finish(uuid,uuid,uuid,text,jsonb,jsonb,text,jsonb,date,date,text)` | `bbeb43099d0cee972a62b7a81c9eebe13620b94120c45ed05dc2c5e57287624b` | `0c73cc38b532e99fbba70ca56c98c4f97449d16c275ff2381f3d504b4aa89006` |
| `clara.correct_accrual_adjustment(uuid,jsonb,text)` | `9975f948944d2351c49eaa1c178f0dd9dc5572d446a7f9338ef9d5ede0b0fd79` | `6a59591a6211acdb6975c7dcfe1dc5c2b3334a8d68ad4281635e7d38ac19fdfa` |
| `clara.get_accrual_adjustment(uuid)` | `835c9dc7e419d480a0084ab84292f02e2bcb3fb99d3ef00dea85d50721641599` | `9bc5da4b59aeba5066436583267998cb3e52757b95022a452c187667f576d7d4` |
| `clara.list_accrual_adjustments(uuid,date,date)` | `2fae3273ba7bde1bdf9a06f0fa151092ba3f1715b3f059644522a87382bc9635` | `c4924f1dbbd6b3ae0dd073ceed5f9b19016cc842a796d4256bd5f909f58c22df` |
| `clara._plan_accrual_period_line(uuid,date)` | `2fd492a29fd9c9fc5e3f85a5881f5c86704205acaf67a237a6a4900f578901d1` | `9951a63f8eb0926b99917a3ef7dfedd32689af88ff25598b75075f174adf7941` |

**`clara.list_review_queue(jsonb,jsonb,integer)` is SPLICED, not embedded, and has no sha pin** —
deliberately. Three other lanes add row kinds to that body in this same wave, and a file that
embedded its own copy would silently drop whichever arm landed at a LOWER migration number on the
integrated chain. §I therefore reads the INSTALLED body, requires each of its two anchors to occur
EXACTLY once, skips itself when its own `accrual_side` marker is already present (the redo path),
and postchecks in BOTH branches: all eleven row-kind markers at their prestate counts, the two new
literals exactly once, and the shared column vector still at eleven.

**New bodies** (no pin needed; their output shas, for a later lane that wants them):
`clara._accrual_sides()` and `clara._accrual_side(jsonb)` — both ungranted internals, and the tail
asserts no `clara\_%` role but `clara_fn_owner` can execute either.

**Bodies PINNED EXACT (unchanged), all measured live on `clara_l03` after #937. The integrator
should read this list for collisions with other lanes:**

| signature | sha256(prosrc) |
|---|---|
| `clara._accrual_methods()` | `f3fdd04bac3bf925fe39dc5a552bfa97269136859ec83ee147d2e8d08ff0aef1` |
| `clara._accrual_date(jsonb,text,text)` | `a76f12dcb2ed689117bb2149c18fca97d58d7c7bd32a0428fa01e9f982344e8c` |
| `clara._assert_accrual_term_window(jsonb,date,date)` | `e13e895f126e7cf34bea5bab2dbcb74733384ef0a427f58b84d6b5b07b771a09` |
| `clara._assert_accrual_period_amounts(jsonb,text,text,integer,date,date)` | `8fe150e87541bb218e80b91b0531b6606e6566b36027cf74a678a522d25be3f2` |
| `clara._accrual_plan_core(uuid,uuid,uuid,text,text,jsonb,text,text,integer,text,date,date,jsonb)` | `31adc6d4ae74d220b33fc950d164b0a256cafc914b2e1486400db20124939bc5` |
| `clara.create_accrual_adjustment(uuid,text,jsonb,jsonb,text,text,integer,text,date,date,text)` | `09c682f52d6d9209425ff2923e37aba95ef4d483511ccee9d9829fd91985eed2` |
| `clara.create_accrual_adjustment_for(uuid,uuid,text,jsonb,jsonb,text,text,integer,text,date,date,text)` | `8b85fa602f21cef1c4831a8bffe8a13044cc66b5425bb2498a21231f77d91a03` |
| `clara._plan_admit_occurrence(uuid,date,text,text,boolean)` | `6980feab1f7d7851ab07c76f7af6d0114423bd016f39d30d4c5a324d1a05337b` |
| `clara._plan_occurrence_basis(jsonb,date,text,uuid,jsonb)` | `cef3264e2a8956dc3d08259b6c1f6bf90bd5c155c7f473f88504f778f611829e` |
| `clara._human_ctx(integer)` | `d1a8a1940ffee67f0bbe1f44f4081c8a5b1fca1775832948c2c606ced2043a46` |
| `clara._hash(jsonb)` | `421483aadaa5989455a40f9c429dac3885dcd4b99056f0f2b66038ad54152547` |
| `clara.role_rank(text)` | `5ced25aed03ff000519af583c5c5b89c4d59c4cb5f20e49f39877435e8c2576f` |

**Collision note for the integrator.** 0304 recuts SIX of the bodies 0303 also recut
(`_accrual_canonical`, `_accrual_finish`, `correct_accrual_adjustment`, `get_accrual_adjustment`,
`_plan_accrual_period_line`) plus four 0222 bodies. Its pre-image column above IS 0303's output
column, so on an integrated chain 0303 runs first and its output satisfies 0304's prestate exactly.
A lane whose migration number lands AFTER 0304 and pins any of these ten at 0303's (or 0222's)
value will need to re-measure. `clara.list_review_queue` is spliced rather than pinned, so it
composes with any other lane's arm in either order.

**Migration triad.** `packages/db/tests/accrual-revenue-side-preintegration-gate.mjs` (stem
`accrual_revenue_side$`) and its `--import` token in `packages/db/package.json`, spliced last in
migration order, directly after `accrual-period-amounts-preintegration-gate.mjs`. **No
`rig-meta.mjs` cohort**: this file mints no new GRANTED name (the 0285/0303 shape).

**The dynamic-SQL corpus.** `apps/web/tests/firm-scope-db-pins.corpus.ts` gained 0304's entry at the
sorted position, with the reason stated in full and the file's sha
`9fb4a552be19b1bd6263331ed924f1b28918f503773aa53172e43fad6822f735`. Without it the census threw
`unreviewed dynamic-SQL barrier at 0304_accrual_revenue_side.sql` — the same gate #938's and #937's
own entries answer.

**Redo, and what I did with it (#957).** Five redos, one per slice, plus two more during the vacuity
controls — each recorded `redone 0304_accrual_revenue_side · new checksum …`. Redo-safe by
construction: `add column if not exists`, `drop constraint if exists` before the CHECK,
`create or replace function` throughout, and a splice that recognises its own marker and skips.

**Both prestate branches driven on `clara_l03`:**

- REDO: every slice after the first (`#942 prestate: clean (REDO …)` / `(MIXED)` while the recut set
  was still growing — the file reports a mixed read rather than refusing it, and says why: a
  migration applies in ONE transaction, so the only way to see a mixture is a redo of an edited
  file on a development rig, and the branch that actually protects the estate is the one that stops
  dead when a body is at NEITHER admitted value. That branch fired for real twice during the vacuity
  controls and refused the redo.)
- FIRST APPLY of the CURRENT file: driven inside one transaction that was rolled back. All ten
  recut bodies were restored from 0222's and 0303's OWN statements and each verified by sha against
  the pin in the table above; `clara.list_review_queue` was un-spliced by reversing this file's two
  edits; the column, the CHECK and the two new functions were dropped; the ledger row was deleted;
  the WHOLE file ran. Output: ten `pre-image … OK` lines, `PRESTATE: #942 prestate: clean (FIRST
  APPLY) … 391 accrual row(s) already exist`, `TAIL OK : yes`, then `rollback` and a re-measure of
  two recut bodies at this file's own output. `FIRST-APPLY BRANCH PROVEN`.

**Data-dependent branches entered.** The prestate's own row count and the tail's FIRST-APPLY arm
were driven on a database carrying 249 accrual rows at first apply and 391 at the first-apply proof
(both non-zero, both non-trivial). The tail's CHECK census inserts both members and four
non-members on every apply. `clara._accrual_side` is driven in the tail with an absent key, a
stated side, a padded side and a blank.

## Vacuity controls

Five deliberate mutations on `clara_l03`, each restored and re-measured:

| mutation | cells that went red | restored |
|---|---|---|
| `clara._accrual_journal_basis`: the revenue arm made unreachable (`case when false`) | `p942.posts`, `p942.correct`, `p942.standard_chart` (3 of 8) | `5b77077993986a53…` verified |
| `clara._assert_accrual_world`: the P&L leg judged `'expense'` on both sides | all 8 | `7c26456962c4b7f1…` verified |
| `clara._plan_accrual_period_line`: the revenue arm made unreachable | `p942.periods` (1 of 8) | `9951a63f8eb0926b…` verified |
| `clara.list_review_queue`: the `accrual_side` key renamed | `p942.conflict` (1 of 8) | reversed, then redone |
| `clara._accrual_finish`: a constant `'expense'` written instead of the stated side | `p942.side.configure`, `p942.correct`, `p942.periods`, `p942.conflict` (4 of 8) | `0c73cc38b532e99f…` verified |

Web vacuity is structural: every web cell was RED before its implementation (the red output is
recorded per slice above), which is the same control by construction.

## Gates, with counts

| gate | result |
|---|---|
| `tests/accrual-revenue-side.test.mjs` (full gate chain, 219 `--import` gates) | **8 / 8**, 0 skipped |
| `tests/accrual-adjustments.test.mjs` (full gate chain) | **21 / 21**, 0 skipped |
| `tests/accrual-correction.test.mjs` (full gate chain) | **10 / 10**, 0 skipped |
| `tests/accrual-period-amounts.test.mjs` (full gate chain) | **12 / 12**, 0 skipped |
| `tests/accrual-bill-conflict.test.mjs` (full gate chain) | **9 / 9**, 0 skipped |
| `tests/wave4-chart-rows.test.mjs` (full gate chain) | **6 / 6**, 0 skipped |
| `tests/operation-census.test.mjs` (full gate chain, no reset flags) | **10 / 10** |
| `tests/rig-isolation.test.mjs` (full gate chain, no reset flags) | **22 / 23**, 1 expected destructive skip |
| `apps/web` whole unit suite (`node scripts/run-tests.mjs`) | **5017 pass / 5019, 0 fail, 2 skipped** (the known Defender/EICAR skips) |
| `pnpm --filter @clara/web e2e accrual-walk` on 3520/3521/3522 | **20 / 20** |
| `pnpm typecheck` | PASS (`apps/web`, `packages/runtime`) |
| `CI=true GITHUB_ACTIONS=true pnpm lint` | PASS (all four packages) |
| `node scripts/check-frozen-workflows.mjs` | OK — 312 frozen files, no manifest diff |

No Windows-only red was hit, and none was "fixed". `packages/runtime` is untouched, so no runtime
unit file, no `check-parts-parity.mjs` run and no WSL re-run under `runner` applies to this ticket.

## Docs

- `packages/db/README.md` — a new "0304" section: why the two column names stay (the frozen tool's
  wire), why an absent side is `expense` and why one body decides it, how the pair is judged by the
  side with the same typed refusals, why the expense arm of the basis is byte-unchanged, why the
  side joins the canonical form and the correction wall, why the queue is SPLICED rather than
  embedded in a wave where other lanes touch the same body, that no account is minted, and the two
  prestate branches.
- `apps/web/README.md` — a new "#942" section: the historical key names stated once, the side as the
  first question of the accounts section, why choosing it clears both codes, the read-only side on
  the correction form, the register's posting-order legs and its filter-as-a-view, the optional
  `accrual_side` on `ReviewQueueRow`, and the one-locale fact.
- `CONTEXT.md` — "**Accrual adjustment**" rewritten to carry the side and to speak of the
  profit-and-loss and balance-sheet legs, and a new term "**Accrual side**" in the house
  `term / _Avoid_` shape.

## Successor contract — `start_accrual_work` for the `chatTurn_v22` cut (AC5)

Everything below is for the wave's shared cut. **Nothing frozen was edited.**

**Name** `start_accrual_work` (unchanged). **Carrier** `packages/runtime/lib/accrual-basis.ts` → its
successor (`accrual-basis.v2.ts`, or whatever the cut names it); the frozen file stays.

**Zod input — the delta only.** Everything else in `startAccrualWorkInputSchema` is unchanged,
including `.strict()`:

```ts
side: z.enum(ACCRUAL_SIDES)              // ACCRUAL_SIDES = ["expense", "revenue"] as const
  .default("expense")
  .describe(
    "Which way this accrual runs. `expense`: a cost the period incurred that nobody has billed "
    + "yet — Dr `expense_account_code` / Cr `liability_account_code`. `revenue`: a service "
    + "delivered that nobody has invoiced yet — Dr `liability_account_code` (the accrued-income "
    + "ASSET) / Cr `expense_account_code` (the INCOME account). Omitting it means `expense`."),
```

**The two account fields keep their names and gain side-aware descriptions** (the names are the
database's own wire keys and cannot move without a migration — see the follow-up):

```ts
expense_account_code: accountCode.describe(
  "The profit-and-loss account: the EXPENSE account this accrual charges under "
  + "`side: \"expense\"`, or the INCOME account it earns under `side: \"revenue\"`."),
liability_account_code: accountCode.describe(
  "The balance-sheet account: the non-control LIABILITY this accrual accrues into under "
  + "`side: \"expense\"`, or the non-control ASSET (accrued income) it accrues into under "
  + "`side: \"revenue\"`. 1180 Accrued Income is the standard chart's own; the accountant may "
  + "name another suitable account the client already has."),
```

**Door call, with argument order (UNCHANGED arity; only `p_accrual`'s shape widens).**

```
clara.create_accrual_adjustment_for(
  p_client uuid, p_author uuid, p_purpose text, p_authority_ref jsonb, p_accrual jsonb,
  p_frequency text, p_day_rule text, p_day_of_month integer, p_timezone text,
  p_effective_from date, p_effective_to date, p_op_key text)
```

`p_accrual` gains ONE key, in the database's own spelling:

```jsonc
{ …the existing particulars…,
  "side": "revenue",
  "expense_account_code": "4000",     // the INCOME account under this side
  "liability_account_code": "1180" }  // the accrued-income ASSET under this side
```

The human door `clara.create_accrual_adjustment` takes the same shape without `p_author`.
`clara.correct_accrual_adjustment(p_accrual_id uuid, p_accrual jsonb, p_op_key text)` takes the same
`p_accrual` and REFUSES any side but the one the accrual already carries.

**Refusal mapping — one new `detail.reason` and three that change shape.** All CLR10.

| reason | field | what it means | the sentence the tool should say |
|---|---|---|---|
| `accrual_side_unsupported` | `accrual.side` | a side outside `detail.supported` | "An accrual accrues an expense or revenue; I cannot record a `<x>` one." (raise locally, before any round trip — `localAccrualRefusal`'s own shape) |
| `accrual_side_immutable` | `accrual.side` | a correction asking for the other side (`detail.side`, `detail.requested_side`) | "This is a `<side>` accrual. A correction restates it; to accrue the other way, let this authority end and configure a new accrual." |
| `accrual_account_relationship` (`constraint: income_account`) | `accrual.expense_account_code` | the P&L leg is not an income account under `side: revenue` | "`<code>` is not an income account. Which revenue account does this fee belong to?" |
| `accrual_account_relationship` (`constraint: non_control_asset`) | `accrual.liability_account_code` | the asset leg is a control account (`detail.account_class`) | "`<code>` is the `<class>` control account; an accrual carries no identified open item. 1180 Accrued Income is the usual one." |

`constraint: expense_account` and `non_control_liability` are unchanged on the expense side — the
`non_control_liability` token renders byte-identically to what it always did.

**Part kind:** none. This rides the existing `start_accrual_work` result part unchanged; the
database's create envelope gains no field. `clara.get_accrual_adjustment` and
`clara.list_accrual_adjustments` now answer with `side`, which is what a later read part would
hydrate from.

**Prompt stanza (proposed wording for the cut):**

> An accrual runs one of two ways and you must be sure which before you record one. A COST the
> period incurred that nobody has billed yet is `side: "expense"`. Work the firm has DELIVERED and
> not yet invoiced is `side: "revenue"`: the amount sits in an accrued-income asset until the
> invoice is issued, and it is reversed on the first day of the next month so the invoice and the
> estimate never both count. If the accountant has not said which, ASK — never infer it from the
> account they named. On the revenue side `expense_account_code` is the income account being earned
> and `liability_account_code` is the accrued-income asset (`1180 Accrued Income` on the standard
> chart, unless they name another). Neither leg may be a control account, and the side cannot be
> changed afterwards: a correction restates an accrual, it never turns one into the other.

**World e2e leg, for the cut to add:** the runtime spawner `packages/runtime/tests/accrual-e2e.mjs`
already admits a `clara_l<NN>` database name. The leg is: configure a revenue accrual through the
tool, run its due date, and assert the entry carries Dr the asset / Cr the income account — the same
claim `p942.posts` makes at the database seam, through the conversation.

## Follow-ups worth filing

1. **Rename the two account columns and wire keys, at the `chatTurn_v22` cut.**
   `expense_account_code` holding an income account is honest only because this file says so out
   loud in four places. Once the tool is re-cut, `pl_account_code` / `bs_account_code` (or
   `profit_loss_` / `balance_sheet_`) can move together across the column, the wire, the two reads
   and the web layer in one migration. This ticket deliberately did not, because a frozen hosted
   tool sends the old keys.
2. **A correction that lands BETWEEN a posted accrual and its reversal makes the two disagree.**
   MEASURED in this lane, on the revenue side but NOT caused by it: an accrual admitted at 300,000
   posts 300,000, a correction to 275,000 revises the plan, and the reversal admitted afterwards is
   built from the LIVE revision's basis and posts 275,000 — leaving 25,000 stranded on the
   balance-sheet leg for ever. It is identical on the expense side (0193's reversal basis + #936's
   correction door), it is nobody's acceptance criterion today, and `p942.correct` deliberately
   asserts the SIDE of every leg rather than blessing the amounts. Worth its own ticket on whichever
   lane owns 0193's reversal basis.
3. **The accrual DETAIL has no unit harness in this suite.** `accrual-detail.tsx` is covered by
   typecheck and by the browser walk's register assertions; its own facts (including the new side
   fact) have no node cell, unlike the form, the list and the correction form. #937's report already
   asked for a per-period detail surface; the two would share one new test file.
4. **A `zh` locale.** AC2 names it and this app has no `zh.json`. Adding one is a `routing.ts` +
   middleware change (`apps/web/i18n/request.ts`) plus a translation pass over 23+ namespaces —
   an i18n lane, not a line in an accrual ticket.
5. **The side filter is client-side.** `clara.list_accrual_adjustments` takes no side parameter, so
   a firm with hundreds of accruals filters what was already read. If that register ever paginates,
   the door should take the side.

## Anything unverified

1. **The `zh` half of AC2 is not built**, and the reason is measured rather than argued (no locale
   file exists). Stated as "partial" rather than glossed.
2. **The detail surface's side fact is not asserted by a node cell** (see follow-up 3). It is
   type-checked and it renders in the built app the walk drives, but no cell reads its text.
3. **The from-scratch chain is the integrator's.** I proved the FIRST-APPLY branch of the current
   file against restored, sha-verified pre-images inside a rolled-back transaction, and redos on the
   live database; I did not run a whole 0001→0304 chain (RIG.md forbids a second from-scratch chain
   on this cluster).
4. **`clara.list_review_queue` carries no sha pin in 0304** — by design (other lanes splice the same
   body this wave). Its protection is the two exact-once anchors, the redo marker guard and the
   eleven-marker postcheck, not a hash.
5. **The e2e walk asserts the register and the form on the revenue side**, not a full revenue
   configuration end to end through the browser: the mock's `create_accrual_adjustment` handler is
   #938/#652's own and was not widened to accept a revenue payload. The DB battery owns the write.
6. **A shared scratchpad hazard, recorded because it nearly cost an hour.** The session scratchpad
   (`…/2d0e3faa-…/scratchpad`) is shared by every lane worker in this session: a `q.mjs` helper I
   wrote there was overwritten mid-ticket by another lane's copy pointing at `clara_l05:55745`, and
   one exploratory dump of `clara.list_review_queue` came back from THAT database before I noticed.
   Nothing built on it (the splice anchors were re-derived from `clara_l03` afterwards, and every
   sha in this report was verified by the migration's own prestate against `clara_l03`), but the
   next worker should namespace its scratch files — mine now live in `scratchpad/p942-lane03/`.
