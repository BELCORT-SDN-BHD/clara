# Wave 2 · Lane 01 · #984 — the opening lane becomes a Work

**Status: DONE.** Branch `riders/w2-lane01`, worktree `C:\Users\zhant\Desktop\clara-wt\635`, rig
`127.0.0.1:55741` / `clara_l01`. Base `23cfad947b5598214168ba9c43d391b4e16aa745`.

Tickets before mine on this branch, read first (`git log <base>..HEAD` and their reports): #1014
(0235, the document binding claim — it recut both opening doors' *callers* and pinned both doors'
`sha256(prosrc)` in its prestate and tail), #868 (0236), #906 (0237), #914 (0238). The lane
database was at **233 applied** when I started and is at **234** now.

```
6ecb4c244 test(web): #984 the four-surfaces purpose census re-derived to the four
486cb23e8 docs: #984 the 0239 section, the named-suite entry, rig-meta and the vocabulary
32af70fd8 fix(web): #984 an opening Work reads as Opening balances on all three surfaces
8216bb0ac test(db): #984 the vocabulary census, and p638's pin re-derived to the four
fe759e663 fix(db): #984 an approved opening correction carries its own Work
c9ba4318e fix(db): #984 an approved opening seed carries a Work and a receipt
edc497356 fix(db): #984 the vocabulary gate learns the opening purpose
```

**The ticket was still live on this branch**, measured before anything was built: on the untouched
branch, `select * from clara.accounting_work where client_id = <a freshly approved opening client>`
returned **zero rows**, as did `clara.operation_receipts`. Nothing in waves 1 or 2 had given opening
a Work. The **owner's ruling of 2026-09-20** on the issue is what I built to; it reverses the
ticket's own recommended Option B, and the Agent Brief under it is the contract.

---

## The seams I tested at (written down before the first test, work-order rule 4)

The brief's "Key interfaces" names these, and I added no seam it does not give me:

1. **`clara._assert_adjustment_basis(text, jsonb)`** — the typed-particulars gate that owns the
   `invalid_purpose` refusal. Called directly as root, because that IS its shape: it is an
   owner-only internal and every caller reaches it from inside a definer body.
2. **`clara.approve_opening_seed(uuid,uuid,text,jsonb,text,text)`** — the human door, driven as a
   real signed-in SERIALIZABLE session through the wave-B fixture (`approveOpeningSeed` /
   `asHumanTxn`), exactly as `wb-k-approval.test.mjs` drives it. Everything behavioural is asserted
   here: which rows appear, which do **not**, and what opening's own relations still say.
3. **`clara.approve_opening_correction(uuid,jsonb,text,text)`** — the second door, same footing,
   driven through a real supersede-then-approve flow.
4. **The purpose vocabulary itself** — both column CHECKs, the two shape CHECKs that read the
   purpose, and `clara._record_journal_entry_core`'s closed IN-list — as a **catalogue census**.
   A claim about "every place the estate closes this set" is structural by nature; work-order rule
   4's "where this repo's documented standard asks for a structural cell, that standard wins" is
   what it rests on, and `p638.core.no_regression` in `staff-expense-claim.test.mjs` is the
   precedent (it is also the cell AC6 asks to be re-derived).
5. **`purposeLabel` / `isKnownWorkPurpose`** (`apps/web/lib/work/purpose-label.ts`) as **rendered
   behaviour** on the three surfaces that show a word, plus the Work list's purpose filter.

Not a seam, and never asserted as one: the contents of `basis` / `effects` as a domain answer. They
are read only to prove the rows name the batch they came from.

---

## The vertical slices, each red for its own reason

| Slice | The cell | Red, and why | Green after |
|---|---|---|---|
| A | `obw984.basis.vocabulary` | `CLR10 "unknown accounting-work purpose opening_balance"` — the gate's own closed three-value list | 0239 §B, the one new arm |
| B | `obw984.seed.work` | `0 !== 1` accounting_work rows after a finalized approval | 0239 §C (the four CHECKs + the task nullability) + §D (`clara._admit_opening_work`) + §E (the seed door) |
| C | `obw984.correction.work` | `1 !== 2` works after a finalized correction | 0239 §E's second statement (the correction door) |
| D | `obw984.vocabulary.census` | vacuity control instead of a natural red — see below | — |
| E1 | `describeActivity: an opening-balance operation_receipt…` | `'opening_balance' !== 'Activity.workPurposes.opening_balance'` — the raw token | the `SUFFIX` entry + the message key |
| E2 | `p984.work_detail.opening_purpose` | `TypeError: Cannot read properties of undefined (reading 'map')` | the `Array.isArray(basis.lines)` guard + `basisNoLines` |
| E3 | `p984.work_list.opening_purpose` | the human label absent from row and filter trigger | `KNOWN_PURPOSE_LABELS` + `KNOWN_PURPOSES` |

No slice wrote a test it did not then make pass, and no battery of red cells was written ahead of
the implementation. Slice A's red was **measured twice**: once as the frontier premise (the file
throws when 0239 is not applied) and once behaviourally, by restoring the pre-0239
`clara._assert_adjustment_basis` body from `pg_get_functiondef` and running the cell against it
(`unknown accounting-work purpose opening_balance`), then restoring the recut body byte for byte
(`sha f096b370…` before and after).

**Slice D's vacuity control.** `alter table clara.operation_receipts drop constraint
ck_operation_receipts_task_by_purpose` → the census red on exactly that arm (`0239's purpose-keyed
task CHECK is absent`) → restored by the supported redo, which re-applied the same file **to the
same checksum** `dd9abf00…`. That control doubles as a live proof that the migration is redo-safe
over its own effects.

---

## Migration

**`packages/db/migrations/0239_opening_balance_work.sql`** (1228 lines), stable stem
`opening_balance_work$`. It is the only migration file I wrote, at the number reserved for me.

**§C — the vocabulary, widened in the four places the columns close it.** Both purpose CHECKs go
from three values to four (`opening_balance` appended, the three untouched);
`ck_accounting_work_adjustment_basis` becomes "`journal_entry` or `opening_balance` means no
particulars, anything else means some" (the periodic-adjustment and payroll arms byte-for-byte);
`ck_operation_receipts_outcome_shape` keeps the `entry_id` arm for the three model-served purposes
and names `seed_id` for an opening batch; and `clara.operation_receipts.task_id` loses its NOT NULL
behind a **new** purpose-keyed CHECK (`ck_operation_receipts_task_by_purpose`) that makes the
nullability exact — the three still **require** a task, opening **refuses** one. The invariant is
tightened, not loosened, and the `agent_tasks` FK stays bound.

Leaving `entry_id` out of an opening receipt's effects is load-bearing twice:
`clara._tf_assert_agent_post_receipt` counts receipts that name an entry and refuses any count but
one; `clara.list_activity` / `clara.get_activity_event` join their entry through that same text
expression with **left** joins that already tolerate its absence (measured by reading both bodies).

**§D — the sibling admission path.**
`clara._admit_opening_work(uuid,uuid,uuid,uuid,integer,jsonb,text,uuid,text)`, a `clara_fn_owner`
SECURITY DEFINER internal with `search_path` pinned and EXECUTE revoked from PUBLIC (final ACL
`clara_fn_owner=X/clara_fn_owner`). **Why a sibling rather than a guarded widening of
`clara._admit_accounting_work_core`** (the brief leaves the choice to the implementer "subject to
the criteria"): that core (a) holds its own closed three-value list, (b) demands a non-blank model
name, (c) inserts an `agent_tasks` row and points `current_task_id` at it, (d) asserts a JOURNAL
basis through `clara._assert_journal_basis`, and (e) asserts that basis's relationship to the
lines. Widening it would mean fabricating a model name and a synthetic basis, which AC3 forbids in
as many words. It is also **pinned by a live test** — `packages/db/tests/intake-batch.test.mjs:320`
pins its `sha256(prosrc)` — so recutting it was not available either.

**§E — the two human doors, recut.** One statement each, in the same position: after
`clara._assert_opening_tie` and before the `clara._audit` row, so the audit names the Work and the
receipt it minted. Both statements were **generated from the live bodies** rather than retyped, and
the wire answer (`clara._finish_op`'s `v_result`) is deliberately **unchanged** — no key added — so
every existing opening test's expectations still hold byte-for-byte. 0171's
`default_transaction_isolation = serializable` and the pinned `search_path` are restated, because
`create or replace function` drops every SET clause it does not repeat.

### Prestate pins, MEASURED on this rig before the file was written

Redo-tolerant per object (#1014's shape, one object at a time): each pin admits either its
pre-0239 value or 0239's own, and the notice says which one it found.

| object | pinned pre-0239 value | disposition |
|---|---|---|
| `accounting_work_purpose_check` | `CHECK ((purpose = ANY (ARRAY['journal_entry'::text, 'periodic_stock_adjustment'::text, 'payroll_obligation'::text])))` | widened |
| `operation_receipts_purpose_check` | the same text | widened |
| `ck_accounting_work_adjustment_basis` | `CHECK ((((purpose = 'journal_entry'::text) AND (adjustment_basis IS NULL)) OR ((purpose <> 'journal_entry'::text) AND (adjustment_basis IS NOT NULL) AND (jsonb_typeof(adjustment_basis) = 'object'::text))))` | widened |
| `ck_operation_receipts_outcome_shape` | `CHECK ((((outcome = 'committed'::text) AND (NULLIF(btrim(COALESCE((effects ->> 'entry_id'::text), ''::text)), ''::text) IS NOT NULL) AND (refusal IS NULL)) OR ((outcome = 'refused'::text) AND (refusal IS NOT NULL))))` | widened |
| `clara.operation_receipts.task_id` | `attnotnull = true` | made nullable behind a new CHECK |
| `clara._assert_adjustment_basis(text,jsonb)` | `69377e43cb924ad73ce87f6fd0fa26aa5c18597064b59bc88e8247fb31e2c263` | recut → `f096b37088f1c847abb94219b040874c002d0b68e4fe0c5dfe3c1eabfc447ca4` |
| `clara.approve_opening_seed(uuid,uuid,text,jsonb,text,text)` | `f18f4c95e8d79c842c707207cfe4a4cc26418c503c33a9c8cce8c85a20791132` | recut → `560ade44e36652da662646f5f3f16f59fd5288ab304227bc34f60b0ccdbcad65` |
| `clara.approve_opening_correction(uuid,jsonb,text,text)` | `4a1e7bc37827fc382ed91451d21274ace20e24575620df050cddb562ab05ffc4` | recut → `acfb90e57ef3f8bb2aad2a3d8bc7a3e1375468584fb2df2326eb2783f97c5e06` |
| `clara._admit_accounting_work_core(…)` | `10b89677d342a424d5959ded8ad2c8c974c4ff9bdc26f5c0dd6c773a15af2612` | **absolute**, left alone, re-read in the tail |
| `clara._record_journal_entry_core(…)` | `c4396f6cb28d6832ffe7efed98fb23af2ad776c25f57feda0fb6d14c0b7762bb` | **absolute**, left alone, re-read in the tail |
| `clara._approve_opening_entry(uuid,uuid,uuid,text,integer)` | `314aae614a21a9e28c55e6f9f7e57f53ef746b327d166bc541493df290bd2bd7` | **absolute**, left alone |

The two doors' pre-0239 shas are the ones 0228 and 0235 also pin — I re-measured them on this rig
rather than copying them, and they matched. The prestate also refuses if either door has lost
0171's SERIALIZABLE proconfig, and if `clara._admit_opening_work` already exists under a different
signature.

**Note for whoever runs a redo after mine:** 0235's tail asserts both opening doors at their
*pre-0239* shas, so `CLARA_MIGRATION_REDO=0235_opening_binding_claim` would now fail. It is no
longer the highest applied version, so the redo mode refuses it first for that reason anyway.

### Redo (recorded, per the prompt)

Applied once and redone **four** times, all with `CLARA_MIGRATION_REDO=0239_opening_balance_work`
+ `CLARA_ALLOW_DESTRUCTIVE=1` (`packages/db/README.md`, "Redo (#957)"):

1. first apply — `_assert_adjustment_basis` only; notice `…: first apply` on every pin; **234 total**;
2. redo for slice B — §C + §D + §E's seed door; notice showed `_assert_adjustment_basis: redo` and
   every other pin still `first apply`, which is exactly the per-object tolerance working;
3. redo for slice C — §E's correction door; checksum `dd9abf00945b8f5303e1baaea715f9cbee744505d637e592a9facd0d03061d09`;
4. redo to restore slice D's vacuity control — **same file, same checksum**, so the redo path itself
   is proven idempotent over 0239's own effects.

A final `node scripts/migrate.mjs` reports `0 new migration(s) applied · 234 total`, so the
committed file and the applied checksum agree.

### Gate ceremony

- **Preintegration gate module:** `packages/db/tests/opening-balance-work-preintegration-gate.mjs`
  (sets `CLARA_ALLOW_MISSING_OPENING_BALANCE_WORK=1`), registered in `packages/db/package.json`'s
  `test` script at the sorted position, **after** `correction-client-rung-order` (0238).
  `preintegration-gate-chain.test.mjs` 5/5.
- **Frontier gate:** the battery's own `before` throws unless that variable is preloaded, so a
  focused run against a pre-0239 chain FAILS loudly and counts zero skips (the #1008/#1014 shape).
- **rig-meta cohort: none is owed, and the file now says so by name.** 0239 mints exactly one
  catalog name, an INTERNAL granted to nobody, and no relation. An internal with an empty
  application-role audience is expected-false for every role in the live sweep rather than listed —
  the disposition 0234's `clara._legal_enforcement_mode`, 0186's `clara._admission_capacity_state`
  and 0188's `clara._operator_support_cases` already carry. `operation-census.test.mjs` 10/10 and
  `rig-isolation.test.mjs` 22/1-skip confirm it: nothing granted that no cohort claims.

---

## Acceptance criteria

**AC1 — a new migration widens both purpose CHECKs to one new opening value; the three existing
values are untouched and the prestate refuses a drifted CHECK.** **Done.** §C items 1–2 append
`'opening_balance'::text` to both. `obw984.vocabulary.census` re-reads both from the catalog,
compares to the exact four-value text AND asserts each of the three prior values by name (so a
widening that also dropped one goes red). The prestate refuses any text that is neither 0194's
three nor #984's four, quoting what it found. The tail additionally counts the values (`<> 4` is a
refusal).

**AC2 — approving an opening seed creates exactly one `accounting_work` row and one
`operation_receipts` row of the new purpose, and the existing dedicated receipt write is
unchanged.** **Done.** `obw984.seed.work` pins the prestate (zero works, zero receipts, zero tasks
for a freshly staged client), approves through the real door, then asserts **exactly one** Work
(purpose `opening_balance`, `status completed`, `basis_origin user_direct`, `adjustment_basis`
null, `current_task_id` null, `source_refs []`, initiator/initiated_by/initiator_role the approving
admin, `logical_op_id` exactly `work:<id>:opening_balance:1`, and `basis` naming the seed, batch,
entry count, tie document and which door) and **exactly one** receipt (`work_id`, `committed`,
`refusal` null, `task_id` null, `acting_actor = on_behalf_of =` the human,
`via_wake_kind 'opening_approval'`, `run_id` = the door's op key, `payload_digest` matching
`^[0-9a-f]{64}$`, `effects.seed_id` / `batch_n` / `entry_count`). Opening's own relation is re-read
afterwards: `clara.opening_seed_approvals` still holds one row per entry and the registry is still
`finalized`. **`obw984.correction.work` proves the same for the second door** and that the seed
batch's Work is byte-unchanged by the correction.

**AC3 — no `agent_tasks` row is created for an opening Work and no model name is recorded against
it.** **Done, three ways.** Behaviourally: `clara.agent_tasks` for the client is `[]` after both
doors, and `agent_tasks where work_id = <the Work>` is `[]` — that FK is the one a model run would
have to take. Structurally: the census re-reads `clara._admit_opening_work`'s body and refuses it if
it names `agent_tasks` or `model` (the migration's own tail asserts the same two). At constraint
level: `ck_operation_receipts_task_by_purpose` **refuses** a task on an opening receipt, so the row
could not be written with one even by a future caller.

**AC4 — `clara._assert_adjustment_basis` accepts the opening purpose with null particulars and
still refuses typed particulars on it.** **Done.** `obw984.basis.vocabulary`: the null call returns;
the typed call raises `CLR10` with `reason invalid_adjustment` / `constraint not_supported` (the
journal-entry arm's own spelling, because it is the same fault); `journal_entry` still behaves
exactly as before; `periodic_stock_adjustment` still *requires* its particulars with its own
`constraint: object`; and a fifth value still answers `invalid_purpose` — **widened, not opened**.
The gate is asked from `clara._admit_opening_work` itself, so the new arm is live rather than
decorative, and both the migration tail and the census assert that call site exists.

**AC5 — the posting core's purpose lookup is unchanged, proven by re-reading its body; an opening
Work never reaches it.** **Done.** `obw984.vocabulary.census` re-reads
`clara._record_journal_entry_core`'s `prosrc`: the literal
`'journal_entry','periodic_stock_adjustment','payroll_obligation'` is present and `opening_balance`
is absent. The migration's tail asserts both, plus the body's `sha256(prosrc)` unmoved
(`c4396f6c…`, re-measured after the final apply). *Never reaches it* has three independent
supports: the entries are already approved by `clara._approve_opening_entry` before the Work row is
written; the posting lane is reached through a **claimed run** and an opening Work has no
`agent_tasks` row to claim; and if it somehow arrived, the receipt the core writes carries a
non-null `task_id`, which `ck_operation_receipts_task_by_purpose` now refuses for this purpose.

**AC6 — the existing no-regression battery cell is re-derived to the new expectation deliberately,
not deleted or skipped.** **Done, and there were TWO such cells, not one.**
`p638.core.no_regression` in `packages/db/tests/staff-expense-claim.test.mjs` keeps its name and its
structure; its literal is now the four-value text, each prior value is re-asserted by name, the
posting core's three-value IN-list assertion is **untouched**, and a new assertion pins that the
core does not name the opening purpose. The battery header says why in full. The second cell,
`purpose.four` in `apps/web/lib/work/staff-expense-claim.test.ts` (DECISIONS §1.7's cross-surface
pin over `purpose-label.ts`, the Work list, the filter and `WorkList.purposeLabels`), was found by
the whole web unit suite and re-derived the same way. `p646.horn_a.no_work` in
`rig-docs-source-revision.test.mjs` needed no change — it compares the CHECK texts before and after
its own doors and forbids only a *correction* purpose — and it is green.

**AC7 — an opening Work renders with a human label on the Work list, Work detail and firm Activity
feed, and is selectable in the Work list's purpose filter.** **Done at the rendering seam; no
browser walk, because no walk can build on this branch (see Gates).** One map learns the value
(`lib/work/purpose-label.ts`'s `SUFFIX`), which is the module's whole reason to exist, and it
carries the Work detail, the journals row and the Activity feed's `isKnownWorkPurpose`. Four
message keys: `WorkList.purposeLabels.opening_balance` and `ManualJournal.links.purposeOpeningBalance`
("Opening balances"), `Activity.workPurposes.opening_balance` ("Approved an opening balance batch"),
and `Parts.workAccepted.purposeOpeningBalance` — that last one purely so `purposeLabel` can never
ask a namespace for a key it lacks; the **frozen chat part's own purpose list is untouched** (see
Successor contract). Cells: `p984.work_list.opening_purpose` renders a real opening row with
`?purpose=opening_balance` and asserts the label appears, the raw token does not, and the filter
trigger does **not** read "A kind not in this list" (which is what proves it is in `KNOWN_PURPOSES`,
i.e. offered in the Select); `p984.work_detail.opening_purpose` renders the detail page;
`describeActivity: an opening-balance operation_receipt…` covers both fields the feed can carry.

**AC8 — existing opening dry-run, coverage, provenance and tie-out tests stay green unchanged; new
tests cover the added rows.** **Done.** Not one existing assertion was edited to accommodate this
change (the two re-derived cells above are AC6's own request, not accommodation), and the doors'
wire answers are byte-unchanged. Counts under Gates: `wb-k-approval` 14/14, `wb-k-supersede-fa` +
`wb-r1` + `wb-0018-lane-guards` + `wb-x-crossfirm` 39/39, `wb-r3` + `wb-0018-binding-mint` +
`x41-round35-tie` + `x41-wave-d-a-fa` + `staff-expense-claim` + `chain-minted-roles-drift-guard`
69/69, `opening-balance-evidence-link` + `x42-s5-residuals` + my file + the gate chain 25/25.

---

## Gates, with counts

Every `packages/db` run is from `packages/db` with the **full** preintegration gate chain
(`node --test --test-concurrency=1 $GATES <files>`, `$GATES` regenerated from `package.json` after
my own gate module was registered). Neither reset flag (`CLARA_RIG_ALLOW_RESET`,
`CLARA_RIG_ALLOW_ROLE_SWEEP`) was ever set, and no second from-scratch chain was run.

| gate | result |
|---|---|
| `opening-balance-work.test.mjs` (added) + `preintegration-gate-chain` + `opening-balance-evidence-link` + `x42-s5-residuals` | **25 pass / 0 fail / 0 skip** |
| `wb-k-supersede-fa` + `wb-r1` + `wb-0018-lane-guards` + `wb-x-crossfirm` | **39 pass / 0 fail / 0 skip** |
| `intake-batch` + `activity-feed` + `work-journal-post` + `journal-work-evidence` + `periodic-adjustment` | **151 pass / 0 fail / 0 skip** |
| `wb-r3` + `wb-0018-binding-mint` + `x41-round35-tie` + `x41-wave-d-a-fa` + `staff-expense-claim` (touched) + `chain-minted-roles-drift-guard` | **69 pass / 0 fail / 0 skip** |
| `wave-b/wb-k-approval.test.mjs` | **14 pass / 0 fail / 0 skip** |
| `staff-expense-claim` + `rig-docs-source-revision` (both carry a purpose-CHECK pin) | **40 pass / 0 fail / 0 skip** |
| `operation-census.test.mjs` + `rig-isolation.test.mjs` + `rig-docs-isolation-grants.test.mjs` (I edited `rig-meta.mjs`) | **45 pass / 0 fail / 1 skip** — the documented `CLARA_RIG_ALLOW_RESET` skip (T19) |
| `pnpm lint` (root, full chain) | **exit 0** |
| `pnpm typecheck` (root) | **exit 2 — RED AT BASE, not this lane.** See below |
| `apps/web` WHOLE unit suite (`node scripts/run-tests.mjs`) | **4752 tests, 4731 pass, 20 fail, 2 skip** after my fix — all 20 inherited (below). On the run that found it: 4729/21, the extra one being `purpose.four`, which this ticket then re-derived (AC6) |
| browser walks on my triple (3500/3501/3502) | **BLOCKED, inherited** — see below |
| `packages/runtime` | **not touched.** `git diff --name-only <base>..HEAD` names no file under `packages/runtime`, so no runtime gate is owed. `pnpm lint` ran `check-frozen-workflows.mjs` anyway: no manifest diff |

### The inherited red, with its provenance

`apps/web/components/documents/document-kind-dialog.tsx:95` calls `DOCUMENT_KINDS.map(...)` while
line 35 imports only `CLASSIFIABLE_DOCUMENT_KINDS`. Proof it predates me, not an assertion:

- `git diff 23cfad94..HEAD -- apps/web/components/documents/document-kind-dialog.tsx` → **empty**;
- `git show 23cfad94:…/document-kind-dialog.tsx | grep -n DOCUMENT_KINDS` → line 95 already calls it
  at the base while line 35 imports only the classifiable list;
- the file's last commit is `4b1376f40 merge: riders wave 1 lane 08`.

Consequences I measured: `pnpm typecheck` exits 2 on exactly those two errors; **20 web unit tests**
die with `ReferenceError: DOCUMENT_KINDS is not defined` across five `components/documents/*` files;
and **`next build` type-checks before serving, so no Playwright walk can run on this branch at all**
— `CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3500 … pnpm --filter @clara/web e2e work-list-walk` fails
in `next build` on those same two errors before a single spec starts. I did **not** fix it: another
lane's file, outside this ticket (rule 5), and lanes 02 and others have already reported it with the
same finding and the same recommendation — fix it **once, centrally**. The walks I would otherwise
have run are `work-list-walk` (I touched `accounting-work-list.tsx` and `work-list-filters.tsx`) and
`journal-work-walk` (I touched `work-detail.tsx`).

---

## Docs, in the same commits

- **`packages/db/README.md`** — new section **"0239 — the opening lane becomes a Work (#984)"**:
  what was wrong and the #656/authority history, a table of the six places the vocabulary is closed
  and which two 0239 deliberately leaves alone, why the two receipt shape CHECKs had to move with
  it (with the `_tf_assert_agent_post_receipt` and activity-join reasons), what the sibling
  admission path is and is not, what an opening Work is (one per batch, completed at birth,
  `user_direct`, no run), why the basis carries no lines and no source ref, the cosmetic "on behalf
  of the same person" consequence, and what the prestate and tail assert.
- **`packages/db/tests/README.md`** — the named-suite-family entry for
  `opening-balance-work.test.mjs`: what it drives, why the counts are client-scoped and not vacuous,
  its gate, what a focused run must count, and the sibling pin in `staff-expense-claim.test.mjs`.
- **`packages/db/tests/rig-meta.mjs`** — a `#984 [0239]` block stating why **no** cohort is owed and
  naming the three precedents for that disposition.
- **`CONTEXT.md`** — one term at the sorted position beside the other opening vocabulary:
  **Opening Work**, in the house `term / _Avoid_` shape, separating it from opening basis, opening
  receipt and "work still to be done".
- **In-code**: the new migration's own header (the longest doc in this change), the recut `SUFFIX`
  map's comment, both Work-list constants' comments, the Work detail's basis guard comment, and the
  re-derived headers on both `p638.core.no_regression` and `purpose.four` saying *why* their
  literals moved.

---

## Successor contract

Nothing here required a frozen chat body or Work tool to change, and none was edited
(`check-frozen-workflows.mjs` shows no manifest diff). Three items are owed to callers outside this
change:

**1. `chatTurn_v22` — the work-accepted card's purpose list.** The frozen parts module admits only
the three model-served purposes. An opening Work is **never** minted by a chat turn (it is minted
inside `clara.approve_opening_seed` / `clara.approve_opening_correction`, both human doors), so
nothing is broken today and nothing is owed unless the product decides an opening batch should mint
that card. If it ever should, it rides the next shared cut:
- **part kind:** `work_accepted` (unchanged).
- **purpose value:** `"opening_balance"` — the fourth value of `clara.accounting_work.purpose`.
- **label:** `Parts.workAccepted.purposeOpeningBalance` = "Opening balances" **already exists** in
  `apps/web/messages/en.json`; I added it so `purposeLabel(part.purpose, t, "purpose")` in
  `components/parts/WorkCards.tsx` can never ask that namespace for a missing key. The frozen
  module's own list is untouched.
- **prompt stanza:** none. Opening is not an agent act.

**2. `claraWork_v6` — the Work tool.** No change is needed for this ticket: the tool admits and runs
model-served Work, and an opening Work is born `completed` with no run to serve. If a future cut
wants to *read* one, the shape is:
- **name:** none new. `clara.list_accounting_work` and `clara.get_accounting_work_row` already
  return it (their joins to `agent_tasks` / `_work_run_attempts` are all LEFT joins — measured).
- **zod input:** unchanged; `purpose` is a free string on the wire and no closed enum exists in
  `packages/runtime` for it (grepped).
- **door call, argument order:** unchanged.
- **refusal mapping:** unchanged. The one caller-visible new refusal is
  `clara._assert_adjustment_basis`'s opening arm — `CLR10`, detail
  `{"reason":"invalid_adjustment","field":"adjustment","constraint":"not_supported"}` — which is
  the journal-entry arm's existing mapping, so `packages/runtime`'s classifier already covers it.

**3. A read that resolves an opening Work to its seed.** There is no `opening_seed_registry.work_id`
column and I did not add one (out of scope: "reshaping opening's dedicated receipt relation"). The
link lives in `clara.accounting_work.basis->>'seed_id'` and in the receipt's
`effects->>'seed_id'`, and the audit row of both doors now carries `work` and `receipt`. A consumer
that wants the reverse direction (seed → Work) queries
`basis->>'seed_id' = <seed> and purpose = 'opening_balance'`, ordered by `basis->>'batch_n'`.

---

## Follow-ups worth filing (I filed none — no GitHub writes)

1. **The firm Activity row reads "*person* on behalf of *the same person*" for an opening
   receipt.** `clara.operation_receipts.on_behalf_of` is NOT NULL and the approver acted for
   themselves, so both columns hold the same user. `apps/web/components/firm/activity/activity-actor-line.tsx`
   renders the "on behalf of" clause whenever `on_behalf_of` is set. A one-line guard
   (`row.on_behalf_of && row.on_behalf_of !== row.actor`) would fix it and would change nothing
   else — today no other row type ever has the two equal. Deliberately not done: outside this
   ticket. Recorded in the migration header and `packages/db/README.md`.
2. **An opening Work's Basis section shows a sentence where a reader would want the batch facts.**
   The page now says "This work's basis carries no journal lines…" instead of throwing. Rendering
   the batch (seed vs correction, batch number, entry count, tie document) is a small, genuinely
   useful addition and needs its own copy decisions.
3. **`apps/web/components/documents/document-kind-dialog.tsx` does not compile** (the inherited
   red above). It blocks `pnpm typecheck`, 20 web unit tests and **every browser walk on every
   wave-2 branch**. Almost certainly a one-word fix, and it belongs to #1005's lane; lanes 02 and
   others have reported it too.
4. **`source_refs` on an opening Work is deliberately `[]` even on a tied seed.** The tie document
   is a fact on the basis. If the product later wants opening's tie to participate in the intake
   batch hand-off (`clara._tf_intake_batch_member_work_stamp`) or in evidence links, that is a
   decision with real consequences and deserves its own ticket rather than a quiet widening here.

---

## Unverified / deliberately left

- **The from-scratch chain was NOT run by me.** `RIG.md`'s addendum forbids a second from-scratch
  chain on a lane cluster and says the integrator runs that proof on a disposable cluster. What I
  *can* evidence: 0239 applied cleanly from the live 0238 frontier with its prestate notice, was
  re-applied three more times through the supported redo path, and a final `migrate.mjs` reports
  `0 new · 234 total`, so the committed file and the applied checksum agree.
- **No browser walk ran**, for the inherited reason above. AC7's evidence is rendered-DOM unit
  cells (the harness mounts the real components and reads `textContent`), not a walk.
- **The "opening Work never reaches the posting core" claim is proven three ways but never by
  driving the posting door with an opening Work id.** Reaching that door requires a claimed run,
  and an opening Work has no `agent_tasks` row to claim — which is itself one of the three
  supports. A cell that minted a task by hand to force the arrival would be testing a state the
  estate refuses, so I did not build one.
- **Load and growth are unexamined.** One Work and one receipt per approved batch, and a firm
  approves an opening once per client plus corrections. I measured no plan and no index need.
- **`packages/runtime` was not exercised** beyond `pnpm lint`'s frozen-workflow check: nothing in
  it changed, and the admission route that carries a closed purpose list
  (`workRoutes.ts:1187`) is the periodic-adjustment door, which opening never uses.
