# Wave 2 · lane 01 · fix round over the three review reports

**Branch** `riders/w2-lane01` · **worktree** `C:\Users\zhant\Desktop\clara-wt\635` · **database**
`clara_l01` (127.0.0.1:55741) · **base** `23cfad947b5598214168ba9c43d391b4e16aa745`
**Head after this round: `37b02d76d`.**

Tickets: #1014, #868, #906, #914, #984 (journals and the opening lane). Reviews answered:
`wave2-lane01-codereview-spec.json` (11 findings), `wave2-lane01-codereview-standards.json` (2),
`wave2-lane01-review-adversarial.json` (10). One fix worker for all three axes.

**Resume note.** An earlier fix worker on this lane was killed by a usage limit. It left NO
uncommitted work (`git status` was clean but for an untracked `packages/db/.tmp-fix/` scratch
directory). Its two finished commits — `f2e212977` (L01W2-SPEC-09) and `05195d9dd` (ADV-L01-04) —
were judged on their merits, re-run here and kept; nothing was redone. Its scratch directory was
used (the ADV-L01-08 probe it had written was run) and then deleted: it had been failing
`packages/db lint` with `no-empty` on a file I added to it, and no scratch belongs in the tree.
Its `restore.mjs` records that it had already repaired a hand-mutation an earlier worker left on
`clara.list_accounting_work`; I re-verified the repair before starting — all four Work/Activity
read doors and `clara._work_run_attempts` are byte-identical to the migration bodies that last
cut them (0203, 0202, 0184, 0189).

## Commits of this round

| commit | subject |
|---|---|
| `f2e212977` | test(db): #984 AC7's three read doors, measured rather than argued *(predecessor)* |
| `05195d9dd` | fix(db): #984 the opening admission seam tests the activeness it refuses on *(predecessor)* |
| `d74d3d3b7` | fix(db): #1014 an id that names no document claims nothing either |
| `4ed1f1b8e` | docs(db): #914 the hoisted rung is also unconditional, and the ladder says so |
| `a5bea3787` | test(db): #984 a zero-entry opening batch is refused before any Work exists |
| `1cffdb933` | fix(web): #984 an opening receipt owns no run, and the row type says so |
| `5365aeba4` | fix(web): #984 each purpose is told only what is true of its own basis |
| `37b02d76d` | docs(db): #1014/#984 the two fix-round cells, in the suite's own register |

## Disposition of every finding

| id | sev | disposition |
|---|---|---|
| L01W2-SPEC-01 | major | **Gate run, and the failure placed.** `CI=true GITHUB_ACTIONS=true pnpm lint` reproduced exactly; the failing selftest case is inherited and is ALREADY FIXED upstream (see below). |
| L01W2-SPEC-02 | minor | No code change (agreed). Carried below as an **accepted deviation** from #1014's out-of-scope line, plus the follow-up to file. |
| L01W2-SPEC-03 | note | Recorded, no change. |
| L01W2-SPEC-04 | note | Recorded, and now stated in the file: the header says why a class-40 error on `clara.documents` itself stays raw. |
| L01W2-SPEC-05 | minor | Integrator's, unchanged: the from-scratch chain cannot run on a lane cluster. Carried below. |
| L01W2-SPEC-06 | minor | Recorded below in one place, by name: five constraints and one column's nullability. |
| L01W2-SPEC-07 | note | Recorded, no change; carried as a follow-up if `chatTurn_v22` never admits the purpose. |
| L01W2-SPEC-08 | note | Recorded, no change. |
| L01W2-SPEC-09 | minor | **Fixed** by `f2e212977` (predecessor): `obw984.read_doors` drives the three read doors for real. Re-run green here. |
| L01W2-SPEC-10 | note | Recorded as a follow-up (the Work-detail breadcrumb's static label, wrong for all four purposes). |
| L01W2-SPEC-11 | note | Recorded, no change; the reason it stays is below. |
| S1 | note | Stays, with the reason below (pre-existing, already guarded, shared-file churn mid-wave). |
| S2 | minor | Same as SPEC-01: the gate was run and recorded. |
| ADV-L01-01 | minor | **Closed by construction and re-measured:** the repro now returns `ok`/`ok` with zero claims. |
| ADV-L01-02 | minor | **Fixed** (`d74d3d3b7`), test-first: `obw.claim.unknown_document` was red, now green. |
| ADV-L01-03 | note | **Stated** in the migration header, the table comment and `packages/db/README.md`. |
| ADV-L01-04 | minor | **Fixed** by `05195d9dd` (predecessor): the probe filters `status='active'`. Re-run green. |
| ADV-L01-05 | minor | **Fixed** (`1cffdb933`), test-first through the type system. |
| ADV-L01-06 | note | **Fixed** (`5365aeba4`), test-first: `p984.work_detail.no_lines_copy` was red, now green. |
| ADV-L01-07 | note | **Stated** in 0238's AFTER ladder and in the README (`4ed1f1b8e`). |
| ADV-L01-08 | note | **Refuted by measurement and pinned** (`a5bea3787`): unreachable, and now a cell. |
| ADV-L01-09 | note | Rig state, carried to the integrator unchanged (nothing in this round ran x41). |
| ADV-L01-10 | note | Inherited; **lane 06 owns the fix this wave** (`544e9daa2` on `riders/w2-lane06`). Not duplicated here. |

## The blockers and minors, one by one

### L01W2-SPEC-01 / S2 — the CI-flagged lint gate (major)

Run in the lane worktree: `CI=true GITHUB_ACTIONS=true pnpm lint` → **exit 1**, on

```
FAIL  (L05-STD-02 fix round) `--ruling` followed by another flag ... — not swallowed as the literal ruling text
      freeze-lint: --retire is REFUSED under CI — a deliberate local ceremony act, same as --update and --lock-deployed.
freeze-lint selftest: FAIL — 1 case(s) failed.
```

Provenance, measured rather than assumed:

* `git diff 23cfad94..HEAD -- scripts/check-frozen-workflows.selftest.mjs scripts/check-frozen-workflows.mjs`
  is **empty** — this lane never touched either file.
* The fix already exists upstream: **`f6d828b2c` "fix(integration): #849 the missing-ruling
  selftest cell clears CI for its child, as its sibling does"**, on `integration/riders-w1`,
  committed 2026-09-20 15:47. It is NOT an ancestor of this lane's head, and this lane's base
  (`23cfad947`, 2026-09-20 12:28) is not an ancestor of it either — the two lines have not met yet.
  So the integrator does not need a new fix; it needs the wave-2 lanes to sit on top of that commit.
* The root chain aborts at step 1 of 20, so a bare `exit 1` says nothing about the rest. I ran
  **every other step of the CI-flagged root chain** individually with both variables set:
  `check-frozen-workflows.mjs` (no manifest diff), `check-frozen-workflows.registration.selftest`,
  `check-frozen-evaluators` + selftest, `check-leaks`, `check-dead-citations` + selftest,
  `check-document-region-field-paths` + selftest, `check-wiki-dynamic-sql` + selftest, the three
  `ops/dsn-pipe` selftests, `hooks/dispatch-model-guard.selftest`, `eslint-config.selftest`,
  `pnpm exec eslint scripts eslint.config.mjs`, `pnpm -r --if-present lint` and
  `packages/reporting-render lint` — **all green**. The only CI-only red on this branch is the
  inherited one above.

### ADV-L01-02 + ADV-L01-01 — 0197's tolerance, and the deadlock window inside it (`d74d3d3b7`)

Reproduced first. `obw.claim.unknown_document` (new, in `opening-balance-evidence-link.test.mjs`)
drove `clara._lock_document_binding` with an id naming no document and read the claim table:
**red, `1 !== 0`** — the helper wrote a token row for a key no document owns, although 0235's own
§B argued the omitted FK preserved 0197's "locks nothing and RAISES NOTHING".

Fix: the claim is gated on the `for update` having found the row.

```sql
  perform 1 from clara.documents d where d.id = p_document for update;
  if not found then
    return;
  end if;
```

The adversarial lens's ADV-L01-01 repro (two real sessions, two non-existent ids, claims taken in
opposite order) was re-run after the gate:

```
T1: ok
T2: ok
claims visible to a third session while both hold: 0
claims committed on two ids that name no document: 0
```

So the 40P01 window is **removed**, not re-spelled: the claim is now taken only after — and only
for — a document row that exists, so two sessions contending for one document meet on that row
first, in the order `clara.documents` already imposes, and cannot form a cycle on the claim's
primary key. `deadlock_detected` is deliberately still NOT caught, and the header now says why, on
the same footing as the existing paragraph about a serialization failure on `clara.documents`: a
class-40 error on the DOCUMENT ROW is a fact about the document, and re-spelling it as a binding
conflict would be a lie. That also discharges L01W2-SPEC-04's residue in the file itself.

0235's tail reads the gate off the LIVE body, positionally between the lock and the claim, so a
later recut that drops it cannot land silently.

**ADV-L01-03** (retention) is answered in the same file and in the README: the life of the
document, one row per document, upserted in place, written only for a document that exists, pruned
by nothing — the row count is bounded above by `clara.documents` and an upsert's dead tuples are
ordinary autovacuum work.

### ADV-L01-05 — `OperationReceiptRow.task_id` (`1cffdb933`)

Red first, through the type system: a new cell in `lib/work/reads.test.ts` builds the row an
opening receipt really is as an **annotated** `OperationReceiptRow` and drives
`listOperationReceipts` over it. Before the change:
`lib/work/reads.test.ts(161,25): error TS2322: Type 'null' is not assignable to type 'string'`.
After `task_id: string | null` (with the one-line reason on the field), `tsc --noEmit` is clean
apart from the inherited `document-kind-dialog.tsx` pair. Measured, not assumed: every `.task_id`
dereference on the web side belongs to a different row (`MessageRow`, `coding task`,
`interruption`, `agent_tasks`), so this was a silent type lie and not a latent crash.

### ADV-L01-06 — the lineless-basis sentence (`5365aeba4`)

Red first: `p984.work_detail.no_lines_copy` rendered a `journal_entry` Work with a lineless basis
and found "Its entries were approved and posted before the work itself was recorded" in the page.
`basisNoLines` is now the purpose-agnostic first sentence; `basisNoLinesOpening` carries the
opening one; the branch picks by `work.purpose`. Neither arm claims the basis was unreadable — it
read perfectly well. `p984.work_detail.opening_purpose` is unmoved and still green.

### ADV-L01-08 — the zero-entry batch (`a5bea3787`)

Measured, as the lens asked. Approving a seed with a tie document and nothing staged is refused
`CLR31 opening seed has no draft entries` and leaves no `clara.accounting_work` and no
`clara.operation_receipts` row. The guard is not the tie assertion: it is each door's own
"has no draft entries" arm (0017's, kept verbatim by 0239 at :730 for the seed and :889 for the
correction), which runs BEFORE the loop that builds the entry array. `obw984.zero_entry` pins that
ordering through the door; 0239 says it at the call site and the README says it too.

Vacuity control, honestly: `assertRaises` fails loudly if the call SUCCEEDS, and the refusal is
matched on its own message rather than only its SQLSTATE. I did NOT hand-break the live door as a
control — recutting a governed body by hand on the rig is the hazard a previous worker on this
lane had to clean up. The positive path (a staged seed minting exactly one Work and one receipt)
is sections 2 and 3 of the same file, green.

### ADV-L01-07 — 0238's ladder (`4ed1f1b8e`)

Comment text only. The AFTER ladder now says the rung is taken "ONCE, hoisted out of the loop AND
out of its `action = 'reverse'` branch: now taken by EVERY correction", and a new paragraph states
the behaviour change with the reason it adds no pair (every `rung → Y` the straight-line
acquisition creates already existed on the reverse arm; 0037 §H.3's order is intact). No statement,
refusal or acquisition moved.

## How the edited migrations were re-applied

`CLARA_MIGRATION_REDO` (#957) admits only the **highest applied** version, and this lane's frontier
is 0239 — so 0235 and 0238 could not be redone through it directly. The route used is the one lane
05 and lane 08 recorded this wave, and it is a hand step:

1. `delete from clara.schema_migrations where version in ('0236…','0237…','0238…','0239…')`
   (4 rows) — the frontier lowered to 0235.
2. `CLARA_MIGRATION_REDO=0235_opening_binding_claim node scripts/migrate.mjs` — the supported redo,
   now at the frontier. Prestate reported `state: redo (#1014's own body is already live)`, the
   tail passed with its extended notice, new checksum
   `c5ebd2e1dd12d278cd1b42f53c1e5931c88418267db6e2c7ef30b0093c80ece7`.
3. `node scripts/migrate.mjs` — the **ordinary apply path** re-landed 0236, 0237, 0238 (edited) and
   0239, each with its own redo-tolerant prestate notice and green tail.
4. Later, for the ADV-L01-08 comment: `CLARA_MIGRATION_REDO=0239_opening_balance_work` — the
   supported path, 0239 being the frontier again.
5. `node scripts/migrate.mjs` afterwards: `0 new migration(s) applied · 234 total`, no drift.
   Ledger rows: 234 before, 234 after.

**One thing had to change in 0235 for this to be possible at all**, and it is worth the
integrator's eye: 0235's prestate and tail pinned both opening doors by `sha256(prosrc)` at their
pre-0239 bodies — but 0239 (the same lane, four files later) recuts both doors to mint the Work, so
a redo of 0235 on any lane rig mid-wave refuses with
`#1014 prestate: clara.approve_opening_seed has DRIFTED`. Both pins are now **two-state**, in the
same shape §A item 1 already used for the body 0235 replaces: the pinned body, or — only on a redo,
and only when the live door calls `clara._admit_opening_work` — whatever is live. The second state
is recognised by that EFFECT and not by a ledger row, because a redo dance rewrites the ledger. The
sha §A accepted is handed to §D through a session setting, so the tail still proves the real claim
("this file moved neither door"), which is stronger than re-reading one literal twice. On a
from-scratch chain 0235 runs before 0239 and only the literal pins are reachable.

### Pins and checksums that moved

| thing | before | after |
|---|---|---|
| `0235_opening_binding_claim` ledger checksum | `012d744ad9ea7f1894967639e5799e9387f49a20cefb4b8a78618569a938b045` | `c5ebd2e1dd12d278cd1b42f53c1e5931c88418267db6e2c7ef30b0093c80ece7` |
| `0238_correction_client_rung_order` ledger checksum | `0c5e8f4729a75cc8a544f45b485dd56083257f5cd414583e3a82576b8eb1aa3d` | `8893cbebcd48f26e1d724fd8f24592a3c3e1c15a9ac25baee58ee5c784e112b9` |
| `0239_opening_balance_work` ledger checksum | `2d73574d0e3dcd90841175f90cc2ccea10a457bfa306a7f046115434120412bb` | `92b76e5d740f12f9544600474bcc9e76ec9d5bed5e3fce5842dfa1925bb27092` |
| `sha256(prosrc)` `clara._lock_document_binding(uuid)` | (0235's first cut) | `4811ee77a7b95a0a334d8baea91c3b4ffe07c1bf71f27ddae78e09fd044040e6` |
| `sha256(prosrc)` `clara.approve_opening_seed(…)` | `560ade44e36652da662646f5f3f16f59fd5288ab304227bc34f60b0ccdbcad65` | `6735ef453153450286fe7fd2c5a645c164c14b0fcc127c9f16954b16f63fbada` |

Unmoved and re-measured: `0236_subledger_hook_caller_roster`
(`f0b00c08a56af45029b68f36e10c91db1df05b78ddcde1d0a3a28d5bae3a7ed0`) and
`0237_journal_basis_zero_total_unreachable`
(`f323f14a7691739dc192f3faf967f411b9d99c7d710036ad7663c9e3e776042f`) — **byte-identical to the
ledger rows deleted in step 1**, which is the proof that nothing about them moved;
`clara.approve_opening_correction` `acfb90e57ef3f8bb2aad2a3d8bc7a3e1375468584fb2df2326eb2783f97c5e06`;
`clara._admit_opening_work` `dc53cda808b77f0f2f0795103fefb048d8cb6462f42ce78359f48cfecc46440c`;
0235's four untouched bodies (`_tf_source_binding_wall`, `_tf_evidence_link_binding_wall`,
`_document_posting_entry`, `_approve_opening_entry`) all still at their pinned shas.

**The web census owes nothing.** `apps/web/tests/firm-scope-db-pins.corpus.ts` keys reviewed
dynamic-SQL barriers by file CONTENT sha, and it carries **no entry for 0235–0239** (its last entry
is `0234_legal_enforcement_mode.sql`): none of this lane's migrations is a reviewed barrier, so no
sha needed re-measuring. `firm-scope-db-pins.test.ts` 22/22 green after the edits.

## Gates

| gate | result |
|---|---|
| `opening-balance-evidence-link.test.mjs` | 8 tests · 8 pass · 0 fail · 0 skip |
| `opening-balance-work.test.mjs` | 7 · 7 · 0 · 0 |
| `correction-client-rung-order.test.mjs` | 5 · 5 · 0 · 0 |
| `subledger-hook-caller-roster.test.mjs` | 5 · 5 · 0 · 0 |
| `journal-basis-zero-total-unreachable.test.mjs` | 4 · 4 · 0 · 0 |
| the five together (one run, `--test-concurrency=1`) | 29 · 29 · 0 · 0 |
| `operation-census.test.mjs` + `rig-isolation.test.mjs` | 33 · 32 · 0 fail · 1 skip (T10b-AC2's documented reset-gated arm) |
| `apps/web` `components/work/work-detail.test.tsx` | 52 · 52 · 0 · 0 |
| `apps/web` `lib/work/reads.test.ts` | 13 · 13 · 0 · 0 |
| `apps/web` `tests/firm-scope-db-pins.test.ts` | 22 · 22 · 0 · 0 |
| whole web unit suite (`node scripts/run-tests.mjs`) | 4754 tests · 4732 pass · **20 fail** · 2 skip — every failure inherited (below) |
| `pnpm typecheck` (root) | **FAIL**, with exactly the two inherited `document-kind-dialog.tsx` errors and nothing else |
| `pnpm lint` (root, full chain) | **exit 0** |
| `CI=true GITHUB_ACTIONS=true pnpm lint` | **exit 1** on the inherited freeze-lint selftest case; every other step of the chain green (run individually, listed above) |
| `node scripts/check-frozen-workflows.mjs` | pass — no manifest diff |
| browser walks (`work-list-walk`, `journal-work-walk`) | **not runnable**: `next build` type-checks (no `typescript.ignoreBuildErrors` in `apps/web/next.config.ts`) and dies on the inherited red |

**The 20 web reds are one inherited defect, not twenty.** Nineteen are
`ReferenceError: DOCUMENT_KINDS is not defined` thrown from
`components/documents/document-kind-dialog.tsx:95`, and the twentieth is that same dialog's own
assertion. They sit in five files, all under `components/documents/`:
`document-detail-live-refresh.test.tsx` (8), `documents-url-state.test.tsx` (6),
`document-kind-labels.test.tsx` (3), `documents-workbench-refresh.test.tsx` (2),
`document-kind-dialog.test.tsx` (1). `git diff 23cfad94..HEAD -- apps/web/components/documents/`
is **empty** on this branch. Lane 06 fixed it on `riders/w2-lane06` at `544e9daa2`; I deliberately
did not duplicate that fix, to leave the integrator one merge instead of a conflict. Worth saying
plainly: this red is bigger than the reports called it — it is not only a typecheck and e2e
blocker, it fails 20 unit cells on every wave-2 branch that does not carry lane 06's commit.

## What the integrator must carry

1. **Two inherited reds, both already fixed on branches that have not met this one.**
   `document-kind-dialog.tsx` → `544e9daa2` on `riders/w2-lane06`. The CI-only freeze-lint selftest
   → `f6d828b2c` on `integration/riders-w1`. Until both are in the line, `pnpm typecheck`,
   `CI=true … pnpm lint`, 20 web unit cells and every browser walk are red on this branch for
   reasons that have nothing to do with lane 01.
2. **The from-scratch chain (L01W2-SPEC-05).** `0001 → 0239` on a disposable cluster, recorded
   against #1014 AC5, #914 AC5, #868 AC3 and #906 AC4, all of which say "applies from scratch". It
   cannot run on a lane cluster (0154 pins the cluster-wide role count). What IS evidenced here:
   0235 applied cleanly from the live frontier three times in total, 0238 twice, 0239 five times,
   each with its prestate notice and green tail, and `migrate` reports `0 new · 234 total` with no
   drift. **The from-scratch run is now also the only place the ADV-L01-02 gate is exercised on a
   FIRST apply** — on this rig it was only ever exercised on a redo.
3. **An accepted deviation from #1014's out-of-scope line (L01W2-SPEC-02).** The claim serialises on
   the document, not on the conflict, so a SERIALIZABLE opening approval that blocked on any other
   transaction binding the same document is refused `CLR13 source_already_posted` — including one
   that left no live evidence link. One live shape is genuinely stricter than the sequential path:
   a plain coded approval carrying the tie document racing an opening approval, which 0213's
   opening arm lets both stand sequentially. It is deliberate, documented in the migration header,
   in `packages/db/README.md`'s 0235 section and in `wave2-lane01-ticket1014.md`, and the follow-up
   is named below. Narrowing it is not available inside this design (the losing session cannot read
   what the winner claimed — that is the snapshot limit the claim exists to work around).
4. **The governed widening touched more than "both purpose CHECKs" (L01W2-SPEC-06)**, by name:
   `accounting_work_purpose_check` (four values), `operation_receipts_purpose_check` (four values),
   `ck_accounting_work_adjustment_basis` (rewritten to a two-value no-particulars list),
   `ck_operation_receipts_outcome_shape` (rewritten: a committed opening receipt names `seed_id`,
   not `entry_id`), the NEW `ck_operation_receipts_task_by_purpose`, and
   `clara.operation_receipts.task_id`'s **NOT NULL dropped** behind it. Five constraints and one
   column's nullability, not two CHECKs. The task invariant is tightened rather than loosened (the
   three model-served purposes still REQUIRE a task; opening REFUSES one), and as of this round the
   web row type says so too.
5. **Two unasked-for-but-harmless changes**, recorded once (L01W2-SPEC-07, SPEC-08): the dead
   message key `Parts.workAccepted.purposeOpeningBalance` in a frozen surface's namespace, and both
   opening doors' audit payloads gaining `work`, `receipt` and `purpose` keys.
6. **Rig state (ADV-L01-09), unchanged by this round.** The adversarial reviewer's run of
   `x41-wave-d-a-fa.test.mjs` left `x41_b3_*` clients on `clara_l01`, and
   `x41-round35-tie.test.mjs`'s `x41.s4` is red on this database as a result. Nothing in this fix
   round ran either file; I did not reseed and did not hand-delete fixtures from a books-bearing
   schema. Whoever runs the lane-01 gates next should expect that red and check it against the
   reviewer's note before chasing it.

## Findings left as they are, and why

* **S1 — the four-value purpose list is typed out in three source files.** Pre-existing (the ticket
  only appended the fourth value to three lists that were already split three ways), already
  guarded against drift by an existing cross-surface census
  (`apps/web/lib/work/staff-expense-claim.test.ts`'s `purpose.four`, re-derived by this lane), and
  the extraction would touch three shared web files while nine other lanes are editing the same
  tree. A refactor, not a defect; filed below.
* **L01W2-SPEC-10 — the Work-detail breadcrumb says "Journal entry" for every purpose.** Static
  `labelKey` in `apps/web/lib/navigation/tree.ts` (a rule-7 shared file) whose own header already
  names the limit; it predates #984 and is wrong for the periodic-adjustment and payroll purposes
  too. One fix for all four, not a fourth patch; filed below.
* **L01W2-SPEC-11 — 0236's comment claims more for its second half than its guard delivers** (the
  six caller NAMES are measured, the arrival migrations are literals the tail only string-matches
  back out of the comment it wrote). The real control is independent and lives in the test file
  (`sr.2`, green here). Softening the sentence means editing 0236, which is three files below the
  frontier: the whole 0236–0239 ledger dance for one adverb, on a note whose own required fix is
  "None". Not worth the risk to a rig four other findings were verified on.
* **L01W2-SPEC-03 / SPEC-04 / SPEC-08 / ADV-L01-09 / ADV-L01-10** — recorded above; no change owed
  by this lane.

## Follow-ups worth filing

1. **A coded entry and an opening seed on one tie document** — the real workflow behind the
   over-refusal in point 3. Today the claim refuses the raced pair that 0213 would let stand
   sequentially; if that pairing is a real firm behaviour, it needs a door that states which
   binding wins rather than a serialization token that refuses both.
2. **One shared `WORK_PURPOSES` tuple** for the three web lists (S1).
3. **The Work-detail breadcrumb's static label** (SPEC-10) — one fix for all four purposes.
4. **`Parts.workAccepted.purposeOpeningBalance`** — remove it if `chatTurn_v22` never admits the
   opening purpose (SPEC-07).
5. **`redo` below the frontier** (#957 follow-up, lane 08 filed the same one) — a lane that stacks
   five migrations cannot use the supported path for any but the last, and this round had to delete
   four ledger rows by hand. A `redo` that accepts a SET of versions (re-applying everything above
   the target in order) would make this a supported operation.
6. **`x41.s4`'s allow-list is order-dependent** on its sibling file's fixtures coexisting in one
   database (ADV-L01-09's second half).

## Anything unverified

* The browser walks for #984 AC7 (`work-list-walk`, `journal-work-walk`) still have not run on this
  branch, for the inherited reason in point 1. The db-side bridge the spec review asked for DOES
  now exist (`obw984.read_doors`, `f2e212977`): the three read doors are driven as a signed-in
  bookkeeper against a real approved opening batch, so AC7 no longer rests on an argument about
  LEFT joins.
* The ADV-L01-02 gate has been exercised on this rig only through a redo of 0235; its first-apply
  path runs for the first time on the integrator's from-scratch chain (point 2).
* `x41.s4` on `clara_l01` (point 6 of the integrator list) was not re-measured in this round.
