# Wave 2 · lane 04 · fix round (fixed assets: #972, #973, #976, #977, #979)

**Branch** `riders/w2-lane04` · **worktree** `C:\Users\zhant\Desktop\clara-wt\651` ·
**base** `23cfad947b5598214168ba9c43d391b4e16aa745` ·
**new head** `43e48653b4c2c5eea562c9a92e88b4a2b1dbb43d` ·
**database** `clara_l04` (127.0.0.1:55744), chain 0001..0234 + 0247..0251, **234 ledger rows before
and after**, `node scripts/migrate.mjs` at HEAD reports `0 new migration(s) applied · 234 total`.

## Commits added by this round (7)

| sha | what |
|---|---|
| `807131eb5` | #979 — recut `p651.authority.retire_unsigned` to the new read contract (landed before this session; **verified** here) |
| `7bc467657` | #972 — the birth's watermark is the TIE's test negated, and reads no clock |
| `5e05718f0` | #976 — the change-class refusal goes back in front of `_reserve_op`, still owned once |
| `beed4a725` | #972 — pin the SECOND birth site instead of leaving the divergence unrecorded |
| `16f390ab0` | #972 — x41.s4's AC5 green, re-taken on a recipe anyone can repeat |
| `34fcd85db` | #979 — AC4 gets its browser walk |
| `62348e333` | #973/#977 — two notes taken (what the instruction rule really proves; who owns the tenant check) |
| `43e48653b` | #976 — the gate header names both routines |

Fourteen earlier commits (the five tickets themselves) are unchanged.

---

## Findings, one by one

### SPEC-L04-1 / ADV-L04-1 — blocker · #979 reddens `p651.authority.retire_unsigned` — **FIXED (before this session), VERIFIED**

Both reviews were taken at `e81ad46b1`. Commit `807131eb5` (18:17, after both) recut the cell to the
three-state contract: the retired-only client now returns THAT authority with its reason, author and
window floor, and "the lane reopens" is proved by propose/sign succeeding rather than by
`authority === null`. Re-run at HEAD on the full 55-import gate chain:
`tests/depreciation-history.test.mjs` → **19 tests, 19 pass, 0 fail, 0 skip**.

### SPEC-L04-2 / S1 / ADV-L04-2 — major+blocker · `now()` in the birth trigger reddens two x42 cells — **FIXED**

Both reviews offered two routes. The one taken removes the clock read entirely rather than widening
the census to admit it, so **no structural census was edited to make this file pass**.

0247's predicate is now `coalesce(new.approved_at, new.created_at) >= fp.enrolled_at` — the exact
NEGATION of `clara.fa_register_tie`'s own pre-enrolment test
(`coalesce(j.approved_at, j.created_at) < v_enrolled`, once per column, 0041:4367/:4376). The tie is
the instrument `x41.s4` reads and the one that reported the defect, so it is the one the birth must
agree with; the belt is a third instrument with its own reason for a transaction-constant instant
(it closes the interval at `retired_at`).

- prestate (5) now pins the TIE's phrasing (exactly twice) instead of the belt's;
- prestate (6) pins that an approved entry can never carry a NULL `approved_at`
  (`clara._tf_entry_immutable` refuses the draft→approved transition without one; its
  approved→approved allow-list is exactly `{reversed_by, reversal_reason, updated_at}`) and that
  `journal_entries.created_at` is NOT NULL;
- tail **T.8** re-proves off the catalog that the recut body reads NO bare clock token, using arm
  (D)'s OWN regex, so the migration proves the property it must not break instead of leaving it to a
  battery that runs later; **T.9** re-reads the tie.

`FA_ACQUISITION_0216_CLOCK_NAMES` and both x42 files are **still byte-identical to the base**.

| | before | after |
|---|---|---|
| `fa-birth-watermark` + `x42b2-r7-s5-clock` + `x42b2-s5c-clock` | 8 tests, 5 pass, **3 fail** (`p972.law`, `x42.r7.s5c.5`, `x42.s5c.6`) | **8 pass, 0 fail** |

### ADV-L04-5 — minor · the fallback re-admits the entry on the reversal re-fire — **FIXED, and driven**

This is the same edit. `now()` on the re-fire is the REVERSING transaction's instant, always at or
after enrolment, so the fallback would re-admit exactly the entry the file excludes. `created_at` is
the ENTRY's own instant and is conservative. The assumption under it is **driven, not asserted**:
new cell `p972.source` nulls `approved_at` on an approved entry through a labelled root UPDATE and
gets CLR08 from `_tf_entry_immutable`'s own allow-list, re-reads the draft→approved arm off the
catalog, and re-measures `created_at`'s NOT NULL. `p972.law` now imports `S5_25_BARE_TOKEN_RE` from
`x42-s5-helpers.mjs` rather than restating the detector.

### SPEC-L04-3 / ADV-L04-4 — major · the fold moved the change-class refusal past `_reserve_op` — **FIXED**

The first cut's argument (0004's "a RAISE aborts the txn incl. the receipt") is true and is not the
point: the refusal a caller SEES is a contract, and two of them had changed. **Both were reproduced
at the door seam before the fix**, by the new cell `p976.wall.before_reserve`:

- a change-class payload carrying an already-spent `op_key` answered **CLR10 "op_key reused with
  different args"** (measured verbatim in the red run) instead of CLR37
  `fa_change_class_on_completion`;
- a change-class payload naming an asset outside the client answered **CLR11 `asset_not_found`**.

0249 now mints **two** ungranted internals — still exactly one place per check, which is AC1/AC2:

| routine | volatility | where it runs |
|---|---|---|
| `clara._fa_assert_completion_not_a_change(uuid,jsonb)` | `immutable` | both doors, right after the op-key check, **before `clara._reserve_op`** — 0227's own anchor |
| `clara._fa_assert_particulars_completable(uuid,clara.fixed_assets,jsonb)` | `stable` | both doors, after the `select … for update` |

0227's deleted sentence is restored in the guard's body comment and extended to say why the
client/asset walls come after it too. Tail **T.2c/T.2d/T.2e** prove the arrangement off the catalog
by call offset in both bodies; **T.1** covers both routines' shape and ACL; **T.4b** expects the
change-class fragment in the guard. `rig-meta.mjs`'s 0249 cohort carries both names (0249 mints them
in the same statement pair, so they are wholly present or wholly absent together).

`tests/fa-particulars-completion-fold.test.mjs`: **before** 4 tests, 2 pass, 2 fail
(`p976.callers.recut`, `p976.wall.before_reserve`) → **after 4 pass, 0 fail**. `p976.core.shape` was
widened to cover both routines.

### ADV-L04-3 — major · 0249 cannot re-apply under its own redo mode — **FIXED, and it bit for real**

Not reproduced in a rolled-back probe but **through `scripts/migrate.mjs` itself** while re-landing
the chain in this round: the prestate took the redo branch and the next statement raised
`42723 function "_fa_assert_particulars_completable" already exists with same argument types`.
§A0/§A are now `create or replace function`. The redo path the work order asks for has been
exercised end to end and recorded in the commit.

**A second, related defect found and fixed while doing it.** 0247's redo detector keyed on the exact
marker string. A fix round edits the predicate's own words, so a rig carrying an EARLIER cut of the
same file reads as 0216-fresh and the sha pin refuses — which is exactly what
`CLARA_MIGRATION_REDO=0247_fa_birth_watermark` did on the first attempt here. The detector is now
the looser, cut-independent `>= fp.enrolled_at`, and the tail's T.1 is what proves the redo landed
THIS cut's predicate.

### ADV-L04-6 — minor · `_fa_on_approve` arm 4 still births with no watermark — **PINNED, deliberately not aligned**

Aligning arm 4 is not proportionate: its live body is 0041 file text that later migrations splice at
runtime, and #973 already lost two invisible splices on one hand-recut **in this lane**. The
reviewer's second option is taken. New cell `p972.sites` pins three things off the catalog:

1. the DIVERGENCE is real — arm 4 carries its watermark-free join exactly once and no copy of the
   trigger's watermark (an absence nothing checks is not an absence);
2. arm 4's guard still reads `not e.is_opening_balance and e.reversal_of is null and not (e.flags ?
   'fa_disposal')`, which excludes the reversal MIRROR — **and the mirror is the only entry arm 4
   ever sees during a reversal, because `clara.reverse_entry` hands its hook `v_mirror`, never the
   original.** That is the precise difference from the trigger, which the house reversal law
   re-fires on the ORIGINAL;
3. `clara._fa_on_approve`'s caller set is exactly `{_subledger_on_approve}` — every approve writer
   reaches arm 4 through that one function, in the same statement run that flips the entry to
   approved.

The outer rung (`_subledger_on_approve`'s own caller set) is `x41.a3`'s frontier-gated census and is
**deliberately not restated** — a first cut of this cell duplicated it with a hardcoded six-name list
where x41.a3 computes 4/5/6 from the applied frontier; that was measured and removed.

**Vacuity control, run twice** (before and after that simplification): a throwaway
`clara._p972_vacuity_probe(uuid)` calling `clara._fa_on_approve` was created on the lane rig, the
cell went RED on the caller-set assertion (5 tests, 4 pass, 1 fail), the probe was dropped, its
absence re-measured at 0 `pg_proc` rows, and the file re-run 5/5.

### SPEC-L04-4 / ADV-L04-10 — minor · #972's AC5 green was unreproducible — **RE-TAKEN, with the recipe**

The recipe now lives in `packages/db/tests/README.md`, not just the result:

1. `create database clara_l04_s4fix template clara_l04` — a template copy, **not** a second
   from-scratch chain, so 0154's cluster-wide role census is untouched;
2. on the clone only: `alter table clara.fixed_assets disable trigger
   t_fixed_assets_immutable_0017`, delete the `x41_b3%` register rows, `enable trigger`, and re-read
   `pg_trigger.tgenabled` to prove it is back on (`O`);
3. run `x41-round35-tie.test.mjs` + `x41-wave-d-a-fa.test.mjs` on the full gate chain, then drop the
   clone.

**Measured: 2 rows deleted → 16 tests, 16 pass, 0 fail, 0 skip — `x41.s4` GREEN**, with `ALLOWED_RED`
untouched at its single `/^x41_r3_/` entry (`x41-round35-tie.test.mjs` is byte-identical to the
base). Clone dropped.

The attribution is checkable on the lane rig with no surgery at all: **14 `x41_b3_…` clients exist
there and only TWO carry a register row**, both created before 0247 first applied (04:36:37 and
04:37:42 vs 04:53:08 on 2026-09-20). The clone run made a fifteenth and birthed nothing.

`x41.s4` therefore **remains RED on the lane rig itself** — that is the pre-0247 residue #972 puts
out of scope by name, and `clara.fixed_assets` forbids DELETE (CLR13).

### SPEC-L04-5 — minor · #979 AC4 had no browser evidence — **FIXED**

`depreciation-mock.mjs` gains a THIRD client whose only authority has been withdrawn (a separate
client, not a toggle — one server serves every cell). The fixture is **transcribed from
`clara.get_depreciation_authority`'s own live body**: base object exactly `{id, status, cadence,
proposed_by, signed_by, retired_by, created_at}` plus 0251's three appended keys, and therefore **no
`authority_ref` and no `authority_kind`**, because the door returns neither.

The new walk cell asserts the ABSENCE first (the "none proposed" sentence must be gone — every other
assertion would also pass on a surface rendering both), then the reason, the retiring author's chip,
the past-tense window on the same testid a live window uses, the absent instruction reference, the
action row's swap from Retire to Propose (matched as **"Retire authority"** in full, because the
account-profiles panel on the same page carries its own "Retire" trigger), and an axe scan.

**Vacuity control, run:** the mock's retired arm was set to `authority: null` — the pre-0251 contract
exactly — and the walk went **4 passed / 1 FAILED** on the new cell; the mock was restored
byte-for-byte and the walk re-run 5/5.

### ADV-L04-7 — note · the instruction rule never asks whether the author is a person — **CONTEXT.md corrected**

The SQL is deliberately **not** changed: narrowing what a governed door accepts is a behaviour change
that wants the owner's ruling, not a fix round's judgement. CONTEXT.md's "Authorising instruction"
now says what is actually proved — the AUTHOR THE INGRESS RECORDED, not the keystroke — and names
the limit (the rule does not separately ask whether that member is a person rather than an agent
account). Re-measured today on `clara_l04`: **0 agent users hold an active firm membership**.

### ADV-L04-9 — note · the extracted leg-pairing core has no tenant predicate — **WRITTEN DOWN**

Faithful to the two inline copies it replaces, but the fold promoted a query that only ever ran
inside tenant-checked doors into a standalone SECURITY DEFINER body. The contract is now in the body,
in the function's COMMENT and in `packages/db/README.md`'s grants row: **the caller owns the tenant
check**; the function is UNGRANTED (0248 tail T.1b pins that); if a later ticket grants or widens it,
the firm/client predicate has to arrive WITH the grant. The comment lines are stripped by the same
normalization the fragment census uses, so `LEG_AGGREGATION_FRAGMENT` still resolves to exactly this
one function. 0248 re-applied with the #957 redo path.

### Notes left as notes

- **SPEC-L04-6 / ADV-L04-8** — the LIVE arm of `depreciation-mock.mjs` returns `authority_ref` and
  `authority_from`, which the real read has never returned, and `depreciation-walk.spec.ts:67`
  asserts through that. Pre-existing (#651's), not introduced or widened here; the new retired arm is
  faithful, and the mock now says so in a comment. **Worth a ticket** (below).
- **SPEC-L04-7** — #977's new refusal token has no lane-side mapping because nothing raises it today;
  the successor-contract rows in `wave2-lane04-ticket977.md` carry forward.
- **S2** — the CI-flagged lint variant's one failure is the pre-existing
  `check-frozen-workflows.selftest.mjs` residue, independently confirmed on lanes 01 and 04. `scripts/`
  is byte-identical to the base on this branch.
- **S3** — the repeated single-name cohort shape in `rig-meta.mjs` is the file's own established
  idiom; unchanged.

---

## Gates at HEAD

All db runs are from `packages/db` with the exact 55-import `--import ./tests/*-preintegration-gate.mjs`
chain from `package.json`'s `"test"` script, `--test-concurrency=1`, against `clara_l04`.

| gate | result |
|---|---|
| `fa-birth-watermark` + `fa-depreciation-leg-fold` + `fa-particulars-completion-fold` + `authority-ref-human-instruction` + `fa-authority-retired-read` + `depreciation-history` + `x42b2-r7-s5-clock` + `x42b2-s5c-clock` + `x41-wave-d-a-fa` + `fixed-asset-acquisition` | **83 tests, 83 pass, 0 fail, 0 skip** |
| `operation-census` + `rig-isolation` + `x41-round35-tie` | 36 tests, 34 pass, **1 fail**, 1 skip — the fail is `x41.s4` on the lane rig's pre-0247 residue (green on the cleaned clone, above); the skip is `rig-isolation` T19's documented reset gate |
| `fa-particulars-completion-fold` + `fa-birth-watermark` (final confirmation) | 9 tests, 9 pass |
| `packages/runtime`: `reconcile-fa.test.mjs` + `reconcile-fa-unit.test.mjs` (PG env) | 19 tests, 19 pass, 0 fail |
| `node scripts/check-frozen-workflows.mjs` | OK — 312 frozen files, 55 `"use workflow"` modules, 3 retired entries; **no manifest diff** |
| `node packages/runtime/scripts/check-parts-parity.mjs` | OK — reader ⊇ emittable |
| `apps/web` e2e `depreciation-walk` on 3530/3531/3532 | **5 passed (14.9s)**; re-run after restoring the mock → **5 passed (14.8s)** |
| `apps/web` `e2e/e2e-fixture-ownership.test.ts` | 44 tests, 44 pass |
| `apps/web` `tests/firm-scope-db-pins.test.ts` + `tests/sql-oracle.test.ts` | 47 tests, 47 pass (no 0247–0251 entry in the db-pins corpus — checked) |
| whole `apps/web` unit suite (`node scripts/run-tests.mjs`) | 4752 tests, 4730 pass, **20 fail**, 2 skip — see below |
| `pnpm typecheck` | **FAILS**, with exactly two errors, both inherited — see below |
| `pnpm lint` | exit 0 |
| `CI=true GITHUB_ACTIONS=true pnpm lint` | **exit 1** on one case, inherited — see below |
| `node scripts/migrate.mjs` at HEAD | `0 new migration(s) applied · 234 total`, no drift |

### The three inherited reds, measured

All three are one defect and it is not this lane's.
`components/documents/document-kind-dialog.tsx:95` references `DOCUMENT_KINDS`, which lane 08's
wave-1 #878 change renamed to `CLASSIFIABLE_DOCUMENT_KINDS` without updating that one call site.
`git diff 23cfad94..HEAD -- apps/web/components/documents/` is **EMPTY** on this branch.

- `pnpm typecheck`: exactly `TS2552 Cannot find name 'DOCUMENT_KINDS'` and `TS7006` at that line, and
  nothing else — the new `depreciation-walk.spec.ts` adds no error.
- whole web suite: all **20** failures are that `ReferenceError`, in five files
  (`document-detail-live-refresh` 8, `documents-url-state` 6, `document-kind-labels` 3,
  `documents-workbench-refresh` 2, `document-kind-dialog` 1) — independently matching lane 01's count.
- Lane 06 fixed it at `544e9daa2` on `riders/w2-lane06`. That one-line change was applied to the
  working tree **only** to take the `depreciation-walk` measurement above and then REVERTED; the file
  is byte-identical to the base again. Not duplicated, so the integrator gets one merge instead of
  two copies — the same call lane 01 recorded.

The `CI=true` lint red is a separate inherited one: `scripts/check-frozen-workflows.selftest.mjs`'s
`--ruling` case. `scripts/` is byte-identical to the base on this branch.

## Migration handling

Every edited migration was re-applied through the supported **#957 redo** path. `CLARA_MIGRATION_REDO`
admits only the **highest applied** version, so the frontier was lowered first by deleting the
unmerged ledger rows above the target — the route lanes 01, 05 and 08 recorded this wave — then the
ordinary apply re-landed the rest. Three cycles: 0247 (rows 0248–0251 removed), 0249 (0250–0251),
0248 (0249–0251). **234 ledger rows before and after each.** New checksums: 0247
`8ed23bc0…`, 0248 `75b7fb9d…`, 0249 `288716dd…`.

## Follow-ups worth filing

1. **The depreciation e2e mock returns fields the door never returns.** `depreciation-mock.mjs`'s
   LIVE authority carries `authority_ref` and `authority_from`; `clara.get_depreciation_authority`
   returns neither on that arm, and `depreciation-walk.spec.ts:67` asserts `fa-authority-window`
   against `DEP.authorityFrom` on a live authority. Either the read surfaces both on the live arm too,
   or the mock stops returning them. Pre-existing (#651's); the retired arm added here is faithful.
2. **No supported remedy for a register row born by the pre-0247 body.** `clara.fixed_assets` forbids
   DELETE (CLR13) and opening supersede does not reach these rows, so any long-lived rig that ran the
   defect carries an unexplained `x41.s4` difference forever. The clone recipe is a rig workaround,
   not a product answer.
3. **`clara._fa_on_approve` arm 4's watermark-free join.** Pinned, not aligned (`p972.sites`). If a
   later ticket ever gives `_fa_on_approve` a caller outside the approve ladder, arm 4 needs 0247's
   predicate too.
4. **The instruction rule's person/agent gap** (ADV-L04-7). CONTEXT.md now states the limit; whether
   `clara._authority_ref_refusal` should also require `not u.is_agent` is an owner's ruling.
5. **Two inherited reds the wave is carrying**: the `DOCUMENT_KINDS` defect (fixed on
   `riders/w2-lane06` at `544e9daa2`, must land) and `check-frozen-workflows.selftest.mjs`'s CI-only
   `--ruling` case (confirmed on lanes 01 and 04, owned by nobody).

## Unverified

- **Hosted evidence: none.** Everything above is local.
- **`x41.s4` on a from-scratch chain.** Re-taken on a template clone of the lane rig with the
  pre-0247 residue removed, not on a 0001→0251 from-scratch build; that leg is the integrator's, on a
  disposable cluster.
- **The `CI=true` lint red and the 20 web unit reds were not re-measured after being fixed**, because
  this lane does not carry lane 06's fix and must not duplicate it.
