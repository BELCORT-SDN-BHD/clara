# Wave 4 · lane 02 · ticket #931 — staff expense claim (2/2): discharge several advances through an explicit allocation list

**Status: DONE** for the five acceptance criteria that do not wait on the shared chat cut; **AC5 is
delivered as a successor contract** (the tool is frozen, and the wave's own rule routes it to the
`chatTurn_v22` / `claraWork_v6` ceremony at the end of wave 4). Branch `riders/w4-lane02`, worktree
`C:\Users\zhant\Desktop\clara-wt\636`, database `127.0.0.1:55742/clara_l02`. Base `cd2925391`.

```
84cf37952 feat(db): #931 a staff expense claim discharges several advances through a confirmed allocation list
ee159783f feat(db): #931 the per-allocation cap refusal names the advance, its outstanding and the shortfall
89bffb2a1 feat(db): #931 the derived journal carries ONE credit leg per advance account
a29f8be20 test(db): #931 the allocation list's own walls, and the single-advance shape held unchanged
c2b227187 feat(runtime): #931 the claim route carries the confirmed allocation list to the door
b3e6ff43d feat(web): #931 the advance chooser becomes the first line of a confirmed allocation list
```

Working tree clean at handoff. `git log --oneline cd2925391..HEAD` at start showed the four #930
commits and nothing else; they were read (and their report, `wave4-lane02-ticket930.md`) before any
change, and #930 applied no migration, so this database was at 0295 / 289 files when I started.

**The ticket is still live.** Measured on this branch before any change: the claim's advance arm
was still ONE advance end to end — `clara.staff_expense_claims.advance_id` is a single column,
`clara._assert_claim_basis`'s advance arm read one `claim.advance_id`, `clara._claim_journal_basis`
emitted ONE credit leg for the whole `amount_cents`, `clara._tf_adv_claim_application_birth`
registered ONE allocation, and `apps/web/lib/work/staff-expense-claim.ts` carried a single
`draft.advanceId`. The `#638` battery was green at 24/24 before I touched anything.

**The newest Agent Brief is the ticket body plus belcorttao's comment of 2026-09-19** (the only
comment). That comment corrects AC5 and "Blocked by" to name `chatTurn_v22` instead of the shipped
`chatTurn_v21`, and restates that the db, form and Work halves do not wait on the cut. Its
"Remaining scope" is a TICKET-TEXT edit (re-point two sentences); I may not write to GitHub, so it
is listed as a follow-up below. The parent #881 carries the owner ruling of 2026-09-18 that is the
design: *"an explicit allocation list with a one-click date-ordered suggestion; the stored record is
always the confirmed list, so WD-R10's 'no silent FIFO' stands."*

## The seams I tested at (written before the first test)

The brief names them; I added none of my own.

1. **`clara.admit_staff_expense_claim_work`** — the door, driven as `clara_runtime` with a real
   claim payload, then posted through the UNCHANGED `clara.wake_record_journal_entry` under a real
   `interactive_client` credential. Everything about the record, the journal, the register and the
   refusals is read from the COMMITTED ROWS afterwards, never from the verb's own answer.
2. **`clara.get_staff_expense_claim` / `clara.list_staff_expense_claims`** — the claim read, as a
   signed-in human (AC1's "the claim read returns the allocations as a list").
3. **`toDbClaim`** (`packages/runtime/src/workRoutes.ts`) — what the BROWSER's claim becomes, as a
   pure function, at the field paths migration 0301 raises.
4. **`validateClaimDraft` / `toClaimWire` / `suggestAllocationsByDate` / `claimAllocations`**
   (`apps/web/lib/work/staff-expense-claim.ts`) — the form's rules and its derivations, as pure
   functions.
5. **The MOUNTED form** — the rendered allocation editor, the "suggest by date" control, and the
   `submit` stub's own payload (AC4's "a cell proves the stored allocations are the confirmed list,
   not the suggestion").
6. **The browser walk** — `apps/web/e2e/staff-expense-claim-walk.spec.ts` against the real built
   app on this lane's Playwright triple.

Deliberately NOT a seam: `clara._adv_over_application`, `clara._tf_adv_movement_belt` and
`clara._record_journal_entry_core` are pinned, not tested — this ticket's claim about them is that
they are UNMOVED, which is a sha assertion, not a behaviour cell.

## Vertical slices, in order

| slice | the red I saw, for the right reason | the code that turned it green |
|---|---|---|
| A (`84cf37952`) | `p931.two` — the lane's frontier gate failed loudly (`the multi-advance allocation lane is absent`), then, with the table and normalisation in place, the cell is the minimal subject for "two advances, one account" | migration 0301: the child relation, `clara._claim_allocations`, the payload shape + exact sum, the world-half loop (enrolment, ownership, per-allocation cap), the door's allocation insert, the birth trigger's loop, both reads, and the backfill |
| B (`ee159783f`) | `p931.cap` and `p931.cap.single` — `detail.shortfall_cents` was `undefined` where the cells expect 10500 and 40500 (`expected: 10500`, `expected: 40500`) | the cap refusal carries `shortfall_cents` (= `-resulting_cents`, the cap's own arithmetic read from its own answer) and addresses `claim.advance_allocations[N].amount_cents` for a listed claim, `claim.amount_cents` for a single one |
| C (`89bffb2a1`) | `p931.accounts` — `post` threw **`the posted basis is not the admitted basis for this work`**: the admitted `basis_digest` still carried ONE credit leg of 60500 on the head account while the ruling's own derivation carries two | `clara._claim_journal_basis` groups the confirmed allocations by account code, in account-code order, one credit leg each |
| D (`a29f8be20`) | the four wall cells, proved load-bearing by a deliberate break (below) | no new code — the walls were written in slice A as one migration; the vacuity control is what makes them evidence |
| E (`c2b227187`) | `route.allocations` and `route.allocations.refusals` — both red, the route ignored `advanceAllocations` entirely | `toDbClaim` translates the list one line at a time at its own indexed paths |
| F+G (`b3e6ff43d`) | `claimAllocations` did not exist (`SyntaxError: … does not provide an export named 'claimAllocations'`), then `the arm offers a one-click date-ordered suggestion` (no `advance-suggest` control), then `the advance-application arm offers a CHOOSER …` broke as a direct consequence of the draft's shape change | `ClaimDraft.advanceAllocations`, `claimAllocations`, `allocationFieldId`, `suggestAllocationsByDate`, the validator and wire arms, the generalised shared editor, the form arm, the messages, the e2e leg |

### The vacuity control (work order rule 4)

Four of the nine db cells assert refusals whose code landed inside slice A's single migration file
rather than one cell at a time, so I proved they are load-bearing rather than asserting it. With
three edits — the duplicate probe disabled (`if false and v_advance = any(v_seen)`), the exact-sum
comparison disabled (`if false and v_alloc_total <> v_amount`), and the world-half loop truncated to
the head (`… with ordinality as x(elem, idx) limit 1 loop`) — re-applied with
`CLARA_MIGRATION_REDO`, the run was **5 pass / 4 fail**: exactly `p931.sum`, `p931.twice`,
`p931.cap` and `p931.claimant` went red and the other five stayed green. The subject was then
restored byte for byte (the migration re-applied to the SAME checksum `047c425b8089c973…`, and a
plain `pnpm db:migrate` afterwards reports no drift) and all nine are green again.

One consequence worth recording: the deliberately broken build ADMITTED two claims the real one
refuses, and tail T.3b then correctly refused the restoring redo (`2 claim(s) whose confirmed
allocations do not add up to the claim`). I removed exactly those two rows (and their status and
allocation rows) on this rig, with the append-only triggers disabled for the three statements, and
the redo then ran clean. Rows written by a knowingly broken subject, on a rig database, removed
under the tail's own detection — recorded here rather than left for an integrator to find.

## Acceptance criteria

| AC | verdict | evidence |
|---|---|---|
| **1.** The claim record gains an allocation set (advance id, amount); the single-advance shape stays valid for existing rows; the claim read returns the allocations as a list | **done** | `clara.staff_expense_claim_allocations` (0301 §A): `(claim_id, advance_id, amount_cents, ordinal)`, append-only, FORCE-RLS, no application-role DML, with THREE-COLUMN tenant FKs to the claim and to `clara.staff_advances` — 0221's own "every foreign key carries the tenant" rule, which is why this is a table and not a jsonb column. Tail T.1/T.1b/T.1c/T.1d re-read all of that out of the catalog. The claim row's own `advance_id`/`advance_account_code` are UNCHANGED and now carry the HEAD of the list (tail T.3c: no claim whose head allocation differs from its own `advance_id`). §G backfills every stored advance-application claim into its one-element list — five such rows existed on this rig, written by the #638 battery before 0301, so the data-dependent branch was ENTERED (tail T.3 + T.3b prove every advance-application claim now has a list that adds up to it). Reads: `p931.two` asserts `get_staff_expense_claim(...).advance_allocations` is `[[advA,40000],[advB,20500]]` in confirmed order and `list_staff_expense_claims(...)` shows two; `p931.single` asserts a single-advance claim reads back as `[[adv,60500]]`. |
| **2.** The validator loops the allocations: exact-sum, claimant ownership, per-allocation temporal cap, typed shortfall naming the advance; the no-advance and wrong-client refusals keep their existing reasons | **done** | `clara._assert_claim_basis` (0301 §C). **Exact sum** — `p931.sum` (PASS): 40000+20000 against a 60500 claim refuses CLR10 `advance_allocation_mismatch`, `constraint=exact_sum`, `field=claim.advance_allocations`, `allocated_cents=60000`, `amount_cents=60500`. **Distinctness** — `p931.twice` (PASS): `constraint=distinct` at `claim.advance_allocations[2].advance_id`. **Claimant ownership** — `p931.claimant` (PASS): an advance enrolled to "Hakim bin Omar" on 1191 is refused `constraint=not_this_claimant` naming that advance and the claimant enrolment; this is a NEW wall (0221 asked only which ACCOUNT the advance sat on). **Per-allocation cap** — `p931.cap` (PASS): the SECOND allocation outruns its own advance, and the refusal names `advance_id=advB`, `outstanding_cents=10000`, `boundary_date=2026-03-31`, `proposed_cents=20500`, `shortfall_cents=10500`, at `claim.advance_allocations[2].amount_cents`; both advances are still untouched afterwards. **The existing reasons are unmoved** — the head account's enrolment check and the "which advance?" refusal are asked FIRST and verbatim, so `p638.refusals`' `advance_not_enrolled` and `advance_allocation_mismatch` rows still pass unchanged (24/24 in the #638 battery), and `p931.cap.single` pins that a single-advance over-application still lands on `claim.amount_cents`. |
| **3.** The derived journal carries one credit leg per advance account; the post-approve registration trigger registers every allocation idempotently | **done** | `clara._claim_journal_basis` groups by account code (0301 §B). `p931.two` (PASS): two advances on ONE dedicated account → exactly ONE credit leg of 60500, and TWO `clara.staff_advance_applications` rows (40000 / 20500) both keyed to THAT line — lawful because `uq_staff_advance_applications_line_advance` is `(application_line_id, advance_id)`, and sufficient because the belt's per-line coverage sum is exact. `p931.accounts` (PASS): two advances on TWO enrolled accounts → TWO credit legs (1190: 40000, 1191: 20500), one allocation each, each keyed to the leg on ITS OWN account. Outstanding moved by each advance's own amount and not a day earlier (`p931.two`: A→0, B→9500 at the posting date). **Idempotence**: the trigger asks `exists(application_line_id, advance_id)` BEFORE the cap, per allocation, and inserts `on conflict (application_line_id, advance_id) do nothing`; the #638 battery's replay and crash-recovery cells (`p638.replay`, and the advance arm's own) stay green. The belt did not raise in either cell, which is the machine proof that coverage is exact. |
| **4.** The form's allocation editor reuses the register's existing allocation editor and chooser; "suggest by date" pre-fills oldest-first and the person confirms; a cell proves the stored allocations are the confirmed list, not the suggestion | **done** | The claim form now renders `components/registers/staff-advance-allocations-editor.tsx` — the register's own component, made reusable ADDITIVELY (`lineCount` optional, plus `newRow`, `optionLabel`, `rowProps`, `amountLabel`); `BookApplicationDialog`'s call gained only the explicit `newRow` the generic needs, and the register's own walks and a11y/keyboard cells are green. Candidates are still `getStaffAdvanceSummary` narrowed by #930's own predicate. **The proof AC4 asks for is two cells with the same fixture**: `ticket 931 the advance arm SUGGESTS a date-ordered split…` (PASS) clicks `advance-suggest` and submits, and the sent claim carries `[{JAN,40000},{FEB,8000}]` — oldest first, each taking what it still has, stopping at the 480.00 claim; `ticket 931 the person may EDIT the suggested split…` (PASS) clicks the SAME suggestion on the SAME three advances, overrides both amounts, and the sent claim carries `[{JAN,30000},{FEB,18000}]`. A third cell (`…a split that does not add up…`, PASS) proves an unbalanced split sends nothing and says why beside the list. End to end in a real browser: `t931 the advance arm suggests a date-ordered split, and sends the split the person confirmed` (PASS). |
| **5.** The chat tool contract widens to an allocation list in the next `chatTurn` successor; the tool proposes a split when unstated and parks a question for confirmation; a World e2e leg covers it | **successor contract** (see below) | `packages/runtime/lib/staff-expense-claim-basis.ts` is FROZEN (`frozen-workflows.json`, verified: `freeze-lint: OK — 312 frozen file(s)`), and the lane rule routes this to the one shared `chatTurn_v22` / `claraWork_v6` cut at the end of wave 4. Nothing in `packages/runtime/workflows/` or `packages/runtime/lib/` was edited. **The database door and the Work half ARE built now**: the door takes `claim.advance_allocations` today, and `toDbClaim` carries it from the browser. The contract below is complete enough to apply mechanically at the cut. |
| **6.** Cells: two advances discharged by one claim; per-advance cap refusal naming the second advance; single-advance claims unchanged; different-account allocations produce two credit legs; from-scratch apply; no posting-core recut | **done** | In order: `p931.two`; `p931.cap`; `p931.single` + `p931.cap.single` + tail T.4/T.4b/T.4c/T.4d/T.4e (a single-advance claim canonicalises WITHOUT the new key, still derives ONE credit leg of its whole amount, and still replays under its intent key — including when the same claim is spelled as a one-element list, which canonicalises to the same bytes); `p931.accounts`; the from-scratch apply is the FIRST-APPLY PRESTATE PROOF below (the integrator runs the true from-scratch chain); **no posting-core recut** is pinned twice — prestate and tail T.5 both re-derive `clara._record_journal_entry_core` at `c4396f6cb28d…`, and `p638.core.no_regression` in the #638 battery stays green. |

### Decisions the brief left to defaults, and what I did with them

The brief's own list, honoured as written: allocations must equal the claim total exactly (no
partial, no over-allocation — `p931.sum`); mixed settlement stays out of scope (an allocation list
on any other settlement is refused at the route AND at the door); over-application refuses the whole
claim rather than trimming (`p931.cap` — nothing durable is written); advances on different enrolled
accounts may be discharged together with one credit leg per account (`p931.accounts`); claims
already recorded keep their single-advance shape untouched (§G's backfill + tail T.3c).

### One decision the brief did NOT settle, and how I settled it

**"Every advance named must belong to this claimant"** has no unambiguous reading in an estate with
no staff master (0221's D4: the claimant IS an enrolment handle, `person_label` is "a LABEL ON THE
ACCOUNT, not a person record"), because the same brief also says advances on DIFFERENT enrolled
accounts may be discharged together — and one enrolment is one dedicated account. I implemented two
arms, strongest first: (a) the advance's own `enrolment_id` IS the claim's claimant enrolment — the
whole of the single-account case and every claim this estate has ever written; or (b) the advance's
enrolment is another LIVE enrolment OF THIS CLIENT whose `person_label` is byte-identical after
`btrim`. Arm (b) is what makes a claimant's second dedicated account reachable. It compares two
ADMIN-ATTESTED enrolment rows (each written through the admin-floored
`clara.enrol_staff_advance_account` with `confirm_dedicated` and an attestation), not a free-text
claimant string against a record; it is deliberately case-sensitive, so strictness there can only
REFUSE a lawful claim (which the preparer fixes by naming the other claimant) and never admit an
unlawful one. It is named in the migration header, in `packages/db/README.md` and here, and a staff
master is what replaces it. **Flag for review** if the owner wants the narrower rule (arm (a) only):
that is a two-line change and one cell, but it makes AC's "different enrolled accounts" unreachable.

## Migration

**`packages/db/migrations/0301_staff_expense_claim_allocations.sql`** — the number reserved for this
ticket. Applied with `pnpm db:migrate` (FIRST apply clean), then re-applied FOUR times with the
supported redo mode (`CLARA_MIGRATION_REDO=0301_staff_expense_claim_allocations`, with
`CLARA_ALLOW_DESTRUCTIVE=1` and `CLARA_RIG_DB=1`): once for slice B, once for slice C, once for the
deliberate break and once to restore it. Every redo was reported as such by the prestate's own REDO
branch. Final state: `pnpm db:migrate` reports `0 new migration(s) applied · 290 total`, i.e. the
applied checksum equals the committed file's.

**Redo safety**: `create table if not exists`, `create index if not exists`,
`create or replace function|trigger`, policies created only when absent, and a backfill that is
`on conflict … do nothing`.

### Prestate pins, MEASURED on `clara_l02` before this file was written

The EIGHT bodies this file recuts (skipped on the REDO branch, which is keyed on the marker
`#931 (0301` in `clara._assert_claim_basis`):

| signature | sha256(prosrc) |
|---|---|
| `clara._claim_settlement_account(jsonb)` | `3fbb1b8124dbac63e241beee6f78130196bde0a313adb0b7ad72eaecaa9ca37a` |
| `clara._claim_basis_canonical(jsonb)` | `6734eef84ced62e22475548b10a065255a75f622419eea895a46baec36a874f8` |
| `clara._claim_journal_basis(jsonb)` | `7378e1be94753bb10eed6c6a53a32c56191d0b0eb601b71f22615b877fa3a424` |
| `clara._assert_claim_basis(uuid,jsonb,boolean)` | `7d42194b01f00ff09b2ea36904972f4e6354bdf1f4dd7611d17e7c47933671a5` |
| `clara.admit_staff_expense_claim_work(uuid,uuid,text,jsonb,text,jsonb,text)` | `75b123e1787f5ce1dad8ffc2452cbdd3111f943341ddbe1af6e68ed1ce5988d9` |
| `clara._tf_adv_claim_application_birth()` | `57c6588bea5bf048c51028a463602cfc708c6f5bbceccb6e84e4ff67791bf59a` |
| `clara.get_staff_expense_claim(uuid)` | `5706139aa23fc04b22813f2fd4262dae493757887beef16bbc015590c01b4a18` |
| `clara.list_staff_expense_claims(uuid,date,date)` | `c32840670acc0c77ba96eeb4f8a0563f9537ab7de760067d1861b781f19742d0` |

The ELEVEN bodies it does NOT touch, pinned before AND re-derived after (tail T.5) — **the
integrator should read this list for a pin another lane recuts**:

| signature | sha256(prosrc) |
|---|---|
| `clara._record_journal_entry_core(uuid,uuid,text,uuid,uuid,text,jsonb,text,text,text)` | `c4396f6cb28d6832ffe7efed98fb23af2ad776c25f57feda0fb6d14c0b7762bb` |
| `clara._tf_adv_movement_belt()` | `a874760c248fb40208fda20e37bd94f3acf982f4ec8e1dcf64d0a4798884678e` |
| `clara._adv_over_application(uuid,bigint,date,bigint,date)` | `b4e9188bc59d0f151bf7ad9854356970662e02e4d9f2c94e7e9eaf54d8ad8769` |
| `clara._adv_enrolment_at(uuid,text,timestamptz)` | `54ae3c5dfec46e55c18eb9db72b94b2b4ab38f953fcf65481eb0e762ce93ebfe` |
| `clara._adv_outstanding(uuid,date)` | `06e9175d8b719d6cf4c66a01b7ddfaa9cd71676017ac59234461780fa9930445` |
| `clara._subledger_on_approve(uuid)` | `6e37c601ff716e0c73b3061bcb503cc01539f2f237841650657fa2d9600accfd` |
| `clara._adv_on_approve(uuid)` | `ddf4159f2e38b3f76005bfa5b70787b7b6aa591a410de95eb0e2717100813ac2` |
| `clara._claim_resolve_claimant(uuid,uuid,jsonb,text)` | `5ce41a7b5fb900e28111d82676d6b4f31d05e543c6bf19cc49fa1b6cd418404c` |
| `clara._claim_item_total(jsonb)` | `72db918d4d259a3effebd24f9593bd6e1038eb0797a1fb1bc4b0cc10b06cbb8c` |
| `clara._tf_staff_expense_claim_append_only()` | `49df1b131cd39b178adf30fbd934c8846245b87a9e69455788afbfd4f68beb13` |
| `clara.get_work_claim_origin(uuid)` | `d2b9f1d1a28136f59dff36870d2926d501e38c35c7726f190ea3bddea02e46f8` |

### The FIRST-APPLY branch, proved (wave-3 addendum)

The prestate is bimodal (a REDO branch on this file's own marker), so `CLARA_MIGRATION_REDO` can
only ever exercise one side. I proved the other inside ONE transaction that was rolled back: restore
the 0221 pre-images of all eight recut bodies by re-running **0221's own `create function`
statements** (extracted from the migration file, never re-typed, with `create` → `create or
replace`), then run 0301's prestate block VERBATIM (extracted from the migration file by its own
dollar-quote tag). Result:

```
#931 prestate: clean (FIRST apply) -- the eight recut bodies are at their measured 0221 post-images
and the eleven bodies this file does NOT touch, including the posting core, the belt and the shared
temporal cap, are unmoved.
FIRST-APPLY PRESTATE PROOF: PASS
```

The transaction was rolled back; the battery is green against the live database afterwards. The
integrator still runs the true from-scratch chain on a disposable cluster.

### The data-dependent branches, entered

- **The §G backfill** ran against FIVE real advance-application claims written by the #638 battery
  before 0301 (`select settlement, count(*) …` measured `advance_application|5`,
  `already_settled|1`, `reimbursement|15`). Tail T.3 / T.3b / T.3c are the assertions over those
  rows, and they are what caught the two bad claims the deliberately-broken build admitted.
- **The redo branch** was entered four times and reported itself each time.

## Gates, with counts

- **`packages/db`**, from `packages/db`, with the FULL gate chain (the exact `--import` list from
  `package.json`'s `test` script), `PGHOST=127.0.0.1 PGPORT=55742 PGUSER=postgres
  PGDATABASE=clara_l02 CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1`, never a reset flag:
  - `tests/staff-expense-claim-allocations.test.mjs` + `tests/staff-expense-claim.test.mjs` +
    `tests/operation-census.test.mjs` + `tests/rig-isolation.test.mjs` — **65 pass / 0 fail /
    1 skipped**. The one skip is `rig-isolation` T19 (poison-role), which is destructive and skips
    itself without `CLARA_RIG_ALLOW_RESET`; that flag was never set.
  - the new file ALONE, focused (no gate preload, so the frontier gate is loud rather than
    skipping): **9 pass / 0 fail / 0 skipped**.
  - regression over the advance register itself: `tests/x42-advances-belt.test.mjs` +
    `tests/x42b1-advances.test.mjs` + `tests/staff-expense-claim.test.mjs` — **46 pass / 0 fail**.
- **`pnpm typecheck`** (repo root) — **apps/web: Done, packages/runtime: Done.**
- **`CI=true GITHUB_ACTIONS=true pnpm lint`** (repo root, the runner's own env) — **exit 0**, whole
  repo. It caught one real thing first: the Q4 raw-colour selector cannot tell a ticket reference
  from a hex literal, so three test titles beginning `"#931 …"` were rejected; per the rule's own
  recommended fix they were reworded to `"ticket 931 …"`.
- **`node scripts/run-tests.mjs`** from `apps/web` (the WHOLE unit suite, once, after everything
  landed) — **4993 pass / 0 fail / 2 skipped**. The 2 skips are the pre-existing,
  environment-gated live-Supabase-auth cells in `lib/entry/live-provider.test.ts` (the same two
  #930 reported), unrelated and unchanged.
- **Browser walk**, this lane's triple
  (`CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3510 CLARA_E2E_NEXT_PORT=3511
  CLARA_E2E_RUNTIME_PORT=3512 pnpm --filter @clara/web e2e staff-expense-claim-walk`) —
  **14 passed (32.8 s)**, including the new `t931` leg and #930's own `t638` settlement-switch leg.
  It is the only walk this ticket touched.
- **`packages/runtime`**: `tests/staff-expense-claim-unit.test.mjs` +
  `tests/work-routes-unit.test.mjs` — **45 pass / 0 fail**;
  `node scripts/check-frozen-workflows.mjs` — **OK, 312 frozen file(s) verified, no manifest diff**;
  `node packages/runtime/scripts/check-parts-parity.mjs` — **OK**.
- Individual files, run repeatedly while working:
  `apps/web/lib/work/staff-expense-claim.test.ts` (18 pass),
  `apps/web/lib/work/staff-expense-claim-draft.test.ts` (7 pass),
  `apps/web/components/accounting/staff-expense-claim-form.test.tsx` (14 pass),
  `apps/web/components/registers/staff-advances-a11y.test.tsx` and
  `…-keyboard.test.tsx` (green, the shared editor's own regression).

**Not run, and why**: `packages/runtime/tests/staff-expense-claim-e2e.mjs` (the World spawner). It
bootstraps a Workflow World on the target database, which RIG.md records (#866) as leaving
`rig-isolation.test.mjs` T10b red afterwards, and this lane has already run `rig-isolation` green
above. The work order's own gate list for `packages/runtime` is "the unit files you touched plus
the freeze and parity checks", all of which are green. See "unverified" for the one join this
leaves.

## Docs, in the same commits

- `packages/db/README.md`: new section *"#931 — one staff expense claim discharges SEVERAL advances
  (0301)"* — why a child table and not a jsonb column, the per-line belt arithmetic that decides
  "one credit leg per advance account", the per-allocation cap and its refusal payload, the
  two-armed ownership reading and its NAMED limit, why the canonical form gains its key only at two
  or more members, and the redo-safety inventory.
- `apps/web/README.md`: new section *"#931 — one claim, several advances: the chooser becomes the
  first line of a confirmed list"* — the draft shape, the one reader, the field-id contract that
  keeps #930's control id, the suggestion's exact rule, what changed in the shared editor and why
  the register's own call is unaffected, the wire's two shapes, and the older-draft restore.
- `CONTEXT.md`: new term **Allocation list** (house "term / _Avoid_" shape), placed at the sorted
  position beside "Advance application" and "Claimant handle". The existing "Advance application"
  entry already says *"WHICH advance, for how much… The register never infers it"*, which this
  ticket widens from one to several without contradicting a word of it, so that entry was left
  alone.
- `packages/db/tests/rig-meta.mjs`: a NEW one-name cohort `SEC_ALLOCATIONS_0301_COHORT`
  (`_claim_allocations`) with its own `cohortFailures` call — its own cohort rather than an addition
  to 0221's, because `cohortFailures` fails a PARTIAL cohort by design and folding it in would make
  every database pinned between 0221 and 0301 report a half-applied #638. #931 adds no granted
  function and moves no grant, so nothing else in the grant matrix changes; the new relation needs
  no `GOVERNED_TABLES` entry because `governedRlsFailures` arm (b) already sweeps every unlisted
  `clara` base table for forced RLS.
- `packages/db/package.json`: the gate-chain entry
  (`--import ./tests/staff-expense-claim-allocations-preintegration-gate.mjs`) appended at the end,
  i.e. in migration order after 0295's.

## Successor contract — `chatTurn_v22` (and `claraWork_v6` if the bundle is re-cut)

Nothing below was applied: `packages/runtime/lib/staff-expense-claim-basis.ts` is frozen and
`chatTurn.v21.tools.ts` re-exports it. This is what the shared cut applies, mechanically.

**1 · Tool name.** UNCHANGED: `start_staff_expense_claim_work`
(`START_STAFF_EXPENSE_CLAIM_WORK_TOOL`). A widened argument is not a new act.

**2 · Zod input.** In the successor of `lib/staff-expense-claim-basis.ts`, only
`advanceApplicationClaimInputSchema` moves. `reimbursementClaimInputSchema`,
`alreadySettledClaimInputSchema`, `sharedShape`, `claimantInputSchema` and `claimItemInputSchema`
are carried byte for byte.

```ts
export const claimAllocationInputSchema = z
  .object({
    advance_id: z.string().uuid().describe(
      "WHICH advance this line discharges. There is no silent FIFO in this register.",
    ),
    amount_cents: z.number().int().positive().describe(
      "How many sen of the claim come off THIS advance. Integer cents: RM 128.50 is 12850.",
    ),
    account_code: accountCode.optional().describe(
      "Only when this advance sits on a DIFFERENT enrolled account from the claim's own "
      + "advance_account_code. Leave it out otherwise.",
    ),
  })
  .strict();

export const advanceApplicationClaimInputSchema = z
  .object({
    settlement: z.literal("advance_application"),
    ...sharedShape,
    advance_account_code: accountCode.describe(
      "The enrolled staff-advance account this claim discharges — the FIRST allocation's account.",
    ),
    advance_id: z.string().uuid().optional().describe(
      "WHICH advance it discharges, when there is exactly one. Give this OR advance_allocations.",
    ),
    advance_allocations: z.array(claimAllocationInputSchema).min(1).optional().describe(
      "The advances this ONE claim discharges and how many sen come off each, in the order the "
      + "human confirmed. They must add up to the claim exactly. Use it when the human names more "
      + "than one advance; for a single advance, advance_id alone is the same claim.",
    ),
    allocations_confirmed: z.boolean().optional().describe(
      "true only after the human has confirmed the split you read back to them. Never set it on "
      + "your own initiative.",
    ),
  })
  .strict();
```

**3 · `claimFromInput` (the `p_claim` argument).** The `advance_application` arm becomes:

```ts
if (input.settlement === "advance_application") {
  out.advance_account_code = input.advance_account_code.trim();
  if (input.advance_allocations !== undefined) {
    out.advance_allocations = input.advance_allocations.map((a) => {
      const one: Record<string, unknown> = { advance_id: a.advance_id, amount_cents: a.amount_cents };
      if (a.account_code !== undefined) one.account_code = a.account_code.trim();
      return one;
    });
    out.advance_id = input.advance_id ?? input.advance_allocations[0].advance_id;
  } else {
    out.advance_id = input.advance_id;       // 0221's shape, byte for byte
  }
}
```

`allocations_confirmed` is a TOOL-LOCAL flag and is NEVER put on the wire: the door judges the
list, not the conversation that produced it.

**4 · Door call — UNCHANGED, argument order included.** The widened claim rides the SAME statement
`chatTurn.v20.tools.ts` already issues, and there is no new door:

```
select clara.admit_staff_expense_claim_work($1::uuid, $2::uuid, $3::text, $4::jsonb,
                                            $5::text, $6::jsonb, $7::text) as r
-- $1 clientId  $2 ctx.createdBy  $3 stableOpKey(ctx.taskId, TOOL, input)
-- $4 JSON.stringify(claimFromInput(input))   $5 'clara_interpreted'
-- $6 JSON.stringify([{kind:'chat_task', task_id: ctx.taskId, session_id: sessionOfTask(...)}])
-- $7 modelId
```

`stableOpKey` now hashes the allocation list too, which is correct: a DIFFERENT split is a different
claim, and the door answers `intent_payload_conflict` for the same key with a changed split
(`p931.split.conflict`).

**5 · Local refusals — three NEW, in `localClaimRefusal`, mirrors of 0301's payload half.** Same
`ClaimRefusal` shape (`{ok:false, code:'CLR10', reason, fix, message, details}`), same field paths
the database raises, so the tool and the door never disagree:

| reason | field | when | `fix` |
|---|---|---|---|
| `advance_allocation_mismatch` (`constraint: exact_sum`) | `claim.advance_allocations` | the lines do not add up to `claimTotalCents(input)` | "The amounts on these advances must add up to the claim. Ask which line should change." |
| `advance_allocation_mismatch` (`constraint: distinct`) | `claim.advance_allocations[N].advance_id` | one advance named twice | "One line per advance. Add the two amounts together on a single line." |
| `advance_split_unconfirmed` (`constraint: confirmation`, `details.proposed_allocations`) | `claim.advance_allocations` | `advance_allocations` has two or more lines and `allocations_confirmed !== true` | "Read the split back to the human — which advance, how much off each — and set allocations_confirmed once they agree." |

The refusal mapping FROM the database is unchanged: `refusalFromError` → `authoringRefusal` already
carries CLR10 `advance_allocation_mismatch` with whatever `details` the door attached, which now
includes `shortfall_cents`, `outstanding_cents`, `boundary_date` and the `advance_id` — so the model
can say exactly how many sen to move, off which advance, without a second read.

**6 · Proposing the split when the message does not state it.** The tool needs the candidates, and
it must not invent them. The date-ordered proposal is `apps/web`'s own rule, restated in the
runtime's successor module (the two are a pair of mirrors the way `basisFromClaim` and
`clara._claim_journal_basis` already are):

```ts
export function proposeAllocationsByDate(
  candidates: ReadonlyArray<{ advance_id: string; issue_date: string; outstanding_cents: number }>,
  totalCents: number,
): Array<{ advance_id: string; amount_cents: number }>
```

— oldest `issue_date` first, ties broken by `advance_id`, each taking `min(outstanding, remaining)`,
stopping when the claim is settled, and naming everything outstanding (never inventing the
difference) when the advances cannot cover it. Candidates come from
`clara.staff_advance_summary(p_client, null)` narrowed to `outstanding_cents > 0 && !voided` and to
the claimant's own enrolment — the SAME read and the SAME predicate the form uses. When the human's
message settles "against the March and May advances" without amounts, the tool proposes, refuses
`advance_split_unconfirmed` carrying `details.proposed_allocations`, and the model reads it back.

**7 · Part kind — UNCHANGED.** `work_accepted` (`WorkAcceptedPartV19`), `purpose: "journal_entry"`,
read by `admittedWorkAcceptedV20`. #931 adds NO wire kind, so `check-parts-parity.mjs` needs nothing
(verified OK at this commit).

**8 · Prompt stanza.** `STAFF_EXPENSE_CLAIM_CHAT_GUIDANCE` is carried verbatim with ONE paragraph
inserted after "SAY HOW IT IS SETTLED, …":

```
ONE CLAIM MAY COME OFF SEVERAL ADVANCES. If the human names more than one — "settle it against the
March and May advances" — give advance_allocations: one line per advance, with how many sen come off
each, adding up to the claim exactly. If they name the advances but not the amounts, propose the
split OLDEST ADVANCE FIRST, each taking what it still has outstanding, read it back to them in
ringgit and sen, and only then set allocations_confirmed. Never decide a split on your own: the
register records the list that was CONFIRMED, and a silent first-in-first-out is exactly what this
register refuses. For a single advance, advance_id alone is the same claim.
```

**9 · What the cut must NOT do.** Do not widen the purpose vocabulary (a claim is still a
`journal_entry` Work). Do not send lines — the door derives them. Do not re-spell any field path:
`claim.advance_allocations[N].<key>` is 1-based on the wire, and both the route's `toWireField` and
`apps/web`'s `fieldForClaimPath` already map it (pinned in
`packages/runtime/tests/staff-expense-claim-unit.test.mjs`'s `route.field` and in
`apps/web/lib/work/staff-expense-claim.test.ts`'s `field.map`, including that
`claim.advance_allocations[1].advance_id` lands on the control `advanceId`).

**10 · The World e2e leg AC5 asks for.** It belongs to the cut, in the successor of
`packages/runtime/tests/chat-turn-v20-e2e.mjs`: one chat turn naming two advances → one Work → one
posted entry with one credit leg per advance account → two `clara.staff_advance_applications` rows.
Every db-side assertion it needs is already written in
`packages/db/tests/staff-expense-claim-allocations.test.mjs` and can be lifted.

## Follow-ups worth filing

1. **The ticket text itself.** belcorttao's 2026-09-19 comment asks that AC5 and "Blocked by"
   re-point `chatTurn_v21` → `chatTurn_v22` and drop the co-rider parenthetical. I cannot write to
   GitHub; the orchestrator owns it. #915, #933, #937, #941 and #942 carry the same stale reference.
2. **The form's chooser is scoped to ONE enrolled account.** `advanceCandidates` filters
   `account_code === draft.claimantAccountCode`, so a claimant who holds TWO dedicated accounts can
   split across both through the door and through chat, but not through the form. The brief's AC4
   does not ask for it and widening the filter would change which advances #930's own cells expect,
   so it is deliberately out of scope here — worth a ticket if a firm actually keeps two dedicated
   codes per person.
3. **A staff master would replace ownership arm (b).** The `person_label` comparison is the honest
   maximum in an estate with no person record (0221 D4); it is named as a limit in three places. A
   staff-master ticket should cite it.
4. **`clara.get_work_claim_origin` does not carry an allocation count.** The Work list still labels a
   claim by claimant and settlement, which is right, but "settles 2 advances" would be one more
   honest word on the card. Out of scope; one line in a later migration.

## Anything unverified

- **The join between `toDbClaim`'s output and the door's input is pinned from both sides, not
  driven end to end.** `route.allocations` asserts the route emits exactly
  `[{advance_id, amount_cents}, {advance_id, amount_cents, account_code}]`, and `p931.two` /
  `p931.accounts` admit exactly those literals through the real door; the HTTP hop between them was
  not exercised for the LIST shape, because the World spawner that would do it is the one the #866
  rig hazard rules out here (see "Not run"). The integrator's own runtime e2e closes it.
- **Hosted data.** §G's backfill was proved against the five advance-application claims this rig
  holds. Hosted has rows this rig does not; the tail assertions (T.3, T.3b, T.3c) run at apply time
  there too and will refuse rather than backfill something they cannot state exactly — which is the
  design, but it is a first-apply risk worth watching in the release run.
- **Concurrency across a multi-advance split.** `p638.advance.race` still covers two claims racing
  one advance (green), and the birth trigger takes its row locks in `advance_id` order precisely so
  two claims naming the same PAIR serialise rather than deadlock. I did not write a cell that drives
  two concurrent claims over a shared pair; the lock order is an argument, not a measurement.
- **`already_settled` and `reimbursement` carrying an allocation list** are refused at the route and
  at the door (`constraint: settlement`), and the route refusal has a cell; the door's arm is not
  separately celled — it is one branch above the code the nine cells do drive.
