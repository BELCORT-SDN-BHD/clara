# Wave 2026-09-15 re-base — the browser merge, origin/main, the renumber, the re-pins, the chain

Branch `integration/wave-2026-09-15` @ **`d378c18b`**, worktree `C:\Users\zhant\Desktop\clara-wt\int`,
clean. **153 commits ahead of `origin/main` (`7e40e3be`), 361 files changed, +84,415 / −622.**
Nothing pushed, no PR, no ticket worktree touched, no migration that is on `origin/main` edited,
`docs/PRD.md` and `docs/ARCHITECTURE.md` untouched (`git diff --name-only origin/main -- docs/` is
empty). Every number below is **LOCAL**; **hosted evidence: none, anywhere in this wave.**

Rigs: reference chain **`rigmain`** `127.0.0.1:55620` / `clara_main` (origin/main 0001→0213, 208
rows, built by the orchestrator) — read only, never written. From-scratch chain **`rigint3`**
`127.0.0.1:55621` / `clara_int3`, created for this run on a cluster that had never seen a clara
migration (measured **0** `clara%` roles before the chain, PG 17). `CLARA_RIG_ALLOW_RESET` and
`CLARA_RIG_ALLOW_ROLE_SWEEP` were never set; no second from-scratch chain was applied to either
cluster.

**Why this leg exists.** While the wave ran, `origin/main` moved from `4464e471` to `7e40e3be`
(PR #838, the riders batch): 15 migrations **0199–0213**, `chatTurn_v1` retired, a rewritten
`frozen-workflows.json` with a new top-level `retired` section, a retirement path and a
`--print-closure` report in the freeze tool, a shared e2e `signIn` helper (#804) and a re-typed
fixture register (#816). 26 files this wave also changed; the wave's own eleven migrations collided
by number, and their prestate/tail pins had been measured on the old base. This is
`successors-review.json`'s **F8**, closed.

---

## 1 · The two merges

| # | merge | tip | conflicts |
|---|---|---|---|
| 1 | `38869f0f` — `integration/wave-2026-09-15-browser` | `5a93b33b` | **none** |
| 2 | `f91d2c7e` — `origin/main` | `7e40e3be` | **9 files** |

`git merge` both times, never rebase, so every reviewed SHA on every branch stays reachable.

The browser branch carried three `apps/web/e2e`-only commits: the #652/#653 client-id re-mint plus
the client-id census that will catch the next collision (`23135011`), the firm-navigation register
cell asserting the fixture instead of a literal (`a5d04ee6`), and shell-migration routing its own
`/work` durable read (`5a93b33b`). It merged clean.

---

## 2 · The nine conflicts, and what each resolution kept

The rule applied throughout: **main's shared infrastructure is the base, the wave's additions are
grafted on.** Where both sides had merely *added* at the same spot, the result is a union in
migration order (main's ≤0213 first, the wave's after).

**`packages/db/package.json`** — the preintegration-gate `--import` chain. Rebuilt from the base's
28, then main's one addition (`document-regions-unique`), then the wave's eleven in **NEW migration
order**. **40 gates**, ending `… firm-document-limits · document-regions-unique · client-work-pack
(0214) · counterparty-identity (0215) · fixed-asset-acquisition (0216) · document-source-revision
(0217) · firm-setup (0218) · client-onboarding-identity (0219) · knowledge-firm-defaults (0220) ·
staff-expense-claim (0221) · accrual-adjustments (0222) · prepayment-0223 · preview-invite (0224)`.
The JSON was rewritten by a parser, not by hand, and the diff against the base is **the test line
alone** (`2 insertions, 2 deletions`).

**`packages/db/tests/rig-meta.mjs`** — four conflicts, every one a pure addition on both sides.
Main's `#776` (0206 operator applicant-name), `#779` (0207, a stated NO-COHORT), `#797` (0212, a
stated NO-COHORT) and `#812` (0211 egress recovery) blocks first, then the wave's eleven cohorts.
The module imports cleanly, **85 exports**, all eleven wave cohorts present, main's
`WORK_RESTATE_0200_*` and `OPERATOR_APPLICANT_NAME_0206_*` identifiers untouched by the renumber.

**`packages/runtime/tests/fs7-v17-chatturn.test.mjs`** — the two sides changed the SAME cell for two
different reasons: main lowered the ceiling and raised the floor (`v1` retired, #810), the wave made
the ceiling derive from `registry.workflowPins.chatTurn` so a cut is tested rather than missed. The
resolution keeps **both**: the floor is `n = 2` with main's #810 paragraph, the ceiling is the
derived one with the wave's.

**`packages/runtime/README.md`** — a section union. #633's `###` stays under `## Evaluation`; main's
new `##` follows it, so the heading tree still nests. Main's section is titled "Requirements carried
by the next frozen version (`claraWork_v4`)" and closes "Until `claraWork_v4` ships, the honest
sentence …" — **`claraWork_v4` is now cut and took NEITHER of the two #811 work-trace bounds.** Both
sentences say so, and the heading now names "the next frozen `claraWork` version (was
`claraWork_v4`; it took neither)". Leaving it would have been a false claim in the file that records
the promise.

**`apps/web/e2e/firm-navigation-walk.spec.ts`** — two conflicts. (1) Imports: main's shared `signIn`
from `./helpers` (#804) wins over the wave's local copy — main's is a strict superset (viewport-aware
landmark wait, `POST_LOGIN_NAV_TIMEOUT_MS`) — and the wave's fixture-derived register machinery
(`SPREAD_FIXTURES`, `sharedRegisterNames`, reading `serve-built.mjs`'s own `clients` array) is
grafted beside it. (2) The population assertion: **ONE fixture-derived assertion**, the wave's. Main
re-typed the literal from four to seven (#816); the derivation supersedes it and the docblock now
records that, because a second literal beside a derivation goes stale again on the next lane that
appends.

**`apps/web/e2e/shell-migration-walk.spec.ts`** — the one conflict where both sides had **repaired
the same pre-existing red two different ways**. Main accepted the shared server's state and asserted
#641's own row renders on plain `/work`; the browser branch routed `list_accounting_work` empty and
asserted the first-use Empty. The auto-merge produced the incoherent pair — the route AND main's row
assertion — so it had to be chosen. **Kept the branch's**, for evidence rather than taste: it was
measured **31/31 on this tree** (main's was measured on main), and it depends on no other lane's
fixture roster, which is exactly the coupling the browser worker's own commit message criticised.
Main's row coverage is not lost — `work-list-walk.spec.ts`'s first cell asserts those rows on that
very address.

**`apps/web/messages/en.json`** — union of the wave's `Accruals`/`Prepayments` and main's
`WorkRestate`, verified with a **strict duplicate-key parser** (not `JSON.parse`, which hides one).
**72 top-level keys, no duplicate at any depth.**

**`apps/web/tests/firm-scope-db-pins.corpus.ts`** — both 0201 entries kept. Main's
`0201_document_regions_unique_field_path.sql` (#778) stays exactly as main wrote it; the wave's entry
is re-keyed to `0216_fixed_asset_acquisition.sql` at the renumber and its `sha256` recomputed over
the final file content (`7b477abd…` → `b0e7bb8b…`) — that hash is over CONTENT, never the name, and
the content changed when the header was renumbered. Key order is still file-sorted, which the census
requires. **22/22.**

**`apps/web/components/work/work-detail.tsx`** — an import union (#639's `WorkAssetRow` beside
#787's `fieldForAdjustmentLineOrdinal`).

**`frozen-workflows.json` was NOT hand-merged.** Main's file was taken **verbatim**
(`git checkout origin/main --`), the code merge was finished, then
`node scripts/check-frozen-workflows.mjs --update` was run locally (never under `CI=true`) so the
wave's additions are regenerated by the tool on top of main's `retired` section. Result: **296
entries = main's 278 + 18 additions**, `retired` **byte-identical** to main's (compared as parsed
JSON), **0 changed, 0 removed**. `--compare-base origin/main`: *278 existing entries retain the same
hash and deployed flag; 18 additions; 3 recorded retirements.*

### 2.1 · One semantic merge defect, fixed rather than left to a gate

Main's **#809** deleted `listAuthorityCandidates` and re-pointed the plan authority picker at
`clara.list_accounting_work` (migration 0203 gave that projection the `intent_key` the label falls
back to). The wave's accrual and prepayment forms still imported the deleted reader — **six typecheck
errors**, on a text merge that had no conflict. Both forms now call `listPlanAuthorityWork` and label
from the door's **flat** `memo`. The consequence reaches the fixtures too, and each was repaired at
the thing that moved:

* `apps/web/e2e/accrual-mock.mjs` and `prepayments-mock.mjs` gained a pure
  `list_accounting_work` answerer for their own client (`accrualWorkListPage`,
  `prepaymentWorkListPage`), spliced into `serve-built.mjs`'s single reader for that verb beside
  `answerWorkListPage` and `journalWorkListPage`, by the same `null means not mine` contract. Both
  walks SELECT a real instruction in that picker (`accrual-walk.spec.ts:81`,
  `prepayments-walk.spec.ts:128`), so without this the picker would have been empty. The lanes keep
  their `/rest/v1/accounting_work` handler for the DETAIL read (`getAccountingWork`), which has no
  door, and both comments say which read is which now.
* `e2e-fixture-ownership.test.ts`'s prepayments paragraph names the door instead of the deleted
  reader.

### 2.2 · Main's own forward-ratchet canary, re-measured

Main's **#815** per-entry closure attribution selftest reds by design when a successor is cut. All
four rosters were re-measured with `computeFrozenClosures` on the merged tree, not inferred:
`lib/knowledge.mjs` 4 → **12** entries (chatTurn_v20's four, claraWork_v4's two, clientOnboarding_v5's
two), `lib/periodic-adjustment-basis.ts` 5 → **9**, `lib/capability-registry.mjs` and
`lib/work-trace.mjs` 2 → **4** each. The capability-registry row carries the note that
`lib/capability-registry.mjs:30` still says it is reached from the frozen `claraWork_v3` body —
`claraWork_v4` reaches it too, and that file is deploy-locked, so the roster is where the true
attribution now lives.

---

## 3 · The renumber: 0199–0209 → 0214–0224

`git mv` throughout, so each file's history follows it.

| old | new | ticket |
|---|---|---|
| `0199_client_work_pack` | **`0214_client_work_pack`** | #650 |
| `0200_counterparty_identity_provenance` | **`0215_counterparty_identity_provenance`** | #647 |
| `0201_fixed_asset_acquisition` | **`0216_fixed_asset_acquisition`** | #639 |
| `0202_document_source_revision` | **`0217_document_source_revision`** | #646 |
| `0203_firm_setup` | **`0218_firm_setup`** | #648 |
| `0204_client_onboarding_facts` | **`0219_client_onboarding_facts`** | #649 |
| `0205_firm_knowledge_defaults` | **`0220_firm_knowledge_defaults`** | #654 |
| `0206_staff_expense_claims` | **`0221_staff_expense_claims`** | #638 |
| `0207_accrual_adjustments` | **`0222_accrual_adjustments`** | #652 |
| `0208_prepayment_amortisation` | **`0223_prepayment_amortisation`** | #653 |
| `0209_preview_invite` | **`0224_preview_invite`** | #625 |

**The hard part was telling the two 0201s apart, and it was done by measurement, not by eye.**
Full stems were replaced across every tracked file first (37 files). For the BARE numbers — where
`0201` could mean the wave's fixed-asset file or main's `0201_document_regions_unique_field_path` —
every candidate was found as an **ADDED LINE** in `git diff origin/main` and rewritten **at its exact
line number**, verified against the file before the pass (0 mismatches). Main's own citations of its
own 0199–0213 are unchanged lines and were never touched. **507 lines in 146 files.** The three lines
deliberately left alone are the ones written during this merge that cite main's 0203 (#809's
`intent_key` widen): `accrual-mock.mjs:116`, `prepayments-mock.mjs:313`, `serve-built.mjs:634`.

`git grep` for each of the eleven old stems after the pass: **zero hits outside git history and the
reports folder** (which is the orchestrator's and was not edited).

### Reference classes updated

1. **Migration headers** and their deploy-order sentences (all eleven).
2. **Prestate / tail NOTICE strings** inside the migrations (`#638 prestate: …`, `#646 tail: …`, the
   `0221 recuts nothing shared` sentences, the `0216 re-pinned the …` roster messages).
3. **Preintegration-gate module name** — `prepayment-0208-preintegration-gate.mjs` → `…-0223-…`
   (`git mv`), and the `packages/db/package.json` chain that imports it.
4. **`rig-meta.mjs` cohort identifiers** and their `cohortFailures(…)` labels:
   `CLIENT_WORK_PACK_0199_*` → `_0214_*`, `COUNTERPARTY_IDENTITY_0200_*` → `_0215_*`,
   `FA_ACQUISITION_0201_*` → `_0216_*`, `DOCUMENT_SOURCE_REVISION_0202_*` → `_0217_*`,
   `FIRM_SETUP_0203_*` → `_0218_*`, `CLIENT_ONBOARDING_FACTS_0204_*` → `_0219_*`,
   `KNOWLEDGE_FIRM_0205_*` → `_0220_*`, `STAFF_EXPENSE_CLAIMS_0206_*` → `_0221_*`,
   `ACCRUAL_ADJUSTMENTS_0207_*` → `_0222_*`, `PREPAYMENT_0208_*` → `_0223_*`,
   `PREVIEW_INVITE_0209_*` → `_0224_*`. **119 identifier occurrences.**
5. **`x42-s5-helpers.mjs`** S5.25 clock-census cohorts and `KL_ROSTER_*` rosters.
6. **Frontier-gate env vars**: `CLARA_ALLOW_MISSING_FIRM_SETUP_0218`,
   `CLARA_ALLOW_MISSING_KNOWLEDGE_FIRM_0220`, `CLARA_ALLOW_MISSING_PREPAYMENT_0223`; and the fixture
   helper `fileDocumentPre0205` → `fileDocumentPre0220`.
7. **Tests' frontier-gate messages and cell names** across the eleven batteries and their fixtures.
8. **READMEs**: `packages/db/README.md`, `packages/db/tests/README.md`, `packages/runtime/README.md`,
   `apps/web/README.md`. `CONTEXT.md` names no migration number and needed none.
9. **`.github/actions/db-live-gates/action.yml`** — eight skip-reason and window sentences. YAML
   parses; no dangling `\` continuation.
10. **The three frozen body headers and `registry.ts`'s deploy-order notes** —
    `chatTurn.v20.ts` now reads *MIGRATIONS 0221 AND 0222 MUST BE LIVE …*, `claraWork.v4.ts`
    *0192 … AND 0216 …*; `chatturn-v18.test.mjs` asserts those exact sentences and moved with them.
11. **Carrier footers** in `lib/accrual-basis.ts`, `lib/staff-expense-claim-basis.ts`,
    `lib/fixed-asset-acquisition.ts`, `lib/prepayment-schedule-basis.ts`,
    `lib/counterparty-identity.ts`, and `src/workRoutes.ts`'s four `migration 0221` references.
12. **`firm-scope-db-pins.corpus.ts`** — re-keyed and re-hashed (§2).

Thirteen frozen bodies carry a migration number in their header, so their hashes moved; all
thirteen are this wave's OWN new entries (none deploy-locked) and were re-baselined with
`--update`. The manifest is still 296 = 278 + 18, `retired` byte-identical, additions only.

---

## 4 · Re-measuring every pin against origin/main's own chain

**63 hex64 literals, 42 distinct**, extracted from the eleven migrations and matched against the
live `sha256(prosrc)` of **every** clara function on `clara_main` (1,241 functions) — so the
function each pin names is derived from the data, not from the sentence beside it.

**38 of the 42 are byte-identical to what the wave measured. FOUR moved**, every one because a
riders migration recut the body. Each is re-issued at the body the chain now holds, with the riders
migration named on the line; none weakened, none dropped, and no body the wave itself recuts was
touched.

| migration (§) | function | old sha | new sha | moved by |
|---|---|---|---|---|
| `0217_document_source_revision` §prestate (#646) | `clara.persist_document_extraction(uuid,text,integer,jsonb,jsonb,text,text,text)` | `0230031fe7d3f183…fea35905` | `b94260ab1999db37…725f74d7a8` | `0201_document_regions_unique_field_path` (#778) |
| `0221_staff_expense_claims` §0 **and** §H (#638) | `clara._record_journal_entry_core(uuid,uuid,text,uuid,uuid,text,jsonb,text,text,text)` | `f9c4f5258fdd45c1…2defa4fb` | `bc24524656e1a478…05860838b3` | `0204_record_journal_entry_core_reversal_liveness` (#787) |
| `0221_staff_expense_claims` §0 **and** §H (#638) | `clara._assert_adjustment_basis(text,jsonb)` | `9acbeb45dde502b3…7b0a0e82` | `69377e43cb924ad7…fb31e2c263` | `0212_payroll_settled_cents` (#797) |
| `0221_staff_expense_claims` §0 **and** §H (#638) | `clara._assert_adjustment_relationships(uuid,text,jsonb,jsonb,boolean)` | `c55219e03219bb3f…1a552854` | `ca1510cf9d82a1ed…7e4e687c02` | `0212_payroll_settled_cents` (#797) |

The attribution is independently confirmed by main itself: `0204` pins `f9c4f5258fdd…` and `0212`
pins `9acbeb45dde5…` / `c55219e03219…` as their own **pre-images**, and `0201` pins `0230031fe7d3…`
as its. Each pin site carries a dated sentence saying what was re-measured and why; 0217's tail
compares against the value its prestate STASHED, so the prestate literal is the only place the
number lives, and the two NOTICE sentences that credited 0191 for that body now credit #778's 0201.

A **fifth** copy of the 0217 pin lives in the test suite as a deliberate second reading of the same
fact — `p646.neighbours` in `rig-docs-source-revision.test.mjs` — and was re-issued to the same
measured value, with its title corrected from "0197's and 0191's own literals" to "the bodies
0217's prestate pinned", which is what it actually tests.

### What did NOT move, measured rather than assumed

* **The `_subledger_on_approve` caller census** — the hazard `DECISIONS` §3.3 (2) and
  `WAVE-DIGEST` §5 both name. On the 0213 chain it is still **exactly the six** names 0221 §0 and §H
  expect (`_approve_entry_core`, `_approve_opening_entry`, `approve_wrong_client_correction`,
  `finalize_close`, `reopen_fiscal_year`, `reverse_entry`). **No roster string re-issued.**
* 0221's other three (`_admit_accounting_work_core`, `book_staff_advance_application`,
  `_adv_on_approve`); 0216's `_fa_asset_json` and `get_fixed_asset`; 0219's five client doors;
  0224's six membership doors; 0215's five counterparty doors; 0214's `_work_run_attempts`; the
  whole 0222/0223 plan family (`create_accounting_plan`, `_assert_plan_schedule`,
  `_plan_occurrence_basis`, `_plan_admit_occurrence`, `_plan_admissible_event`,
  `_plan_primary_entry`, `preview_accounting_plan`, `revise_accounting_plan`,
  `_agent_prepayment_schedule_core`, `prepayment_schedule_v1`).
* `clara.list_accounting_work` and `clara.get_accounting_work_row` ARE recut by main's 0203, but
  0214 asserts only their PRESENCE and `prosecdef` — nothing is owed. 0222 deliberately pins none of
  the `_adjustment_*` family and says why in its own header, so #797's recut costs it nothing.

---

## 5 · The from-scratch chain

`rigint3` `127.0.0.1:55621` / `clara_int3`, a cluster that had never run a clara migration
(0 `clara%` roles measured before the chain, so 0154's cluster-global census is honest).

```
pnpm db:migrate  → 219 new migration(s) applied · 219 total · 0001 … 0224_preview_invite, exit 0, ~110 s
pnpm db:seed     → 2 seed file(s) applied, exit 0            (clara.firms = 2, the CI-shaped baseline)
pnpm db:migrate  → 0 new migration(s) applied · 219 total, exit 0
```

**219 = 193 (at `4464e471`) + 15 (main's riders batch) + 11 (this wave).** Every migration's own
prestate pins and tail assertions ran and passed inside the chain, including all four re-issued
pins. Verified afterwards on the database: `select count(*), max(version) from
clara.schema_migrations` = **219 / `0224_preview_invite`**.

0221's own tail printed, verbatim:

> `#638 tail OK (1/7): both purpose CHECK texts are byte-identical to 0194 and the six
> non-regression bodies are unchanged -- 0221 recuts nothing shared`
> `#638 tail OK (2/7): the subledger-hook caller census is byte-identical to the six measured
> before this migration ran -- 0221 adds no caller`

No refusal, so no pin was missed and no second cluster was needed.

---

## 6 · Gates, from the worktree root

| gate | exit | evidence |
|---|---|---|
| `pnpm typecheck` | **0** | `packages/runtime: Done`, `apps/web: Done` |
| `pnpm lint` | **0** | freeze-lint + its three selftests + 13 sibling checkers + eslint + every workspace's own lint |
| `node scripts/check-frozen-workflows.mjs` | **0** | **296 frozen files** verified append-only vs `origin/main`; **53** `"use workflow"` modules all frozen+registered; **3 retired entries** recorded |
| `… --compare-base origin/main` | **0** | 278 existing entries same hash and flag; **18 additions**; 3 recorded retirements |
| `node packages/runtime/scripts/check-parts-parity.mjs` | **0** | reader ⊇ emittable; emittable = 6 kinds, allowlist = 3; `work_accepted` gains chatTurn.v20's three sites, `work_result` gains `claraWork.v4.impl.ts:553`; **no new kind** |
| `pnpm --filter @clara/runtime build` | **0** | nitro build complete |
| `node scripts/check-workflow-bundle.mjs` | **0** | 12 pinned classes, no superseded pin survives, **53** superseded bodies still ship (was 54 — `chatTurn_v1` retired), chatTurn pinned at **v20**, 40 checks |
| `node scripts/check-worker-paths.mjs` | **0** | spawn sites through `resolveLibWorker`, built bundle verified against the deployed layout |
| `pnpm build` | **0** | Next build Done, all routes including `/settings/knowledge`, `/settings/setup` |

`pnpm build`'s web half needs a local `apps/web/.env.local` (`.gitignore`d; `check-public-key.mjs`
refuses to build without a publishable anon key). It was already present in this worktree from the
merge leg — same note the merge report §4 records.

---

## 7 · Test counts (all LOCAL, on `clara_int3`)

### 7.1 · db — the exact **40** preintegration gates from `packages/db/package.json`, no reset flags

47 files: the wave's twelve batteries, #633's five, **all 29 db test files main changed between
`4464e471` and `7e40e3be`**, plus `operation-census` and `rig-isolation`.

**979 tests · 977 pass · 0 fail · 2 skip.**

The two skips are by design and neither is used as evidence: `rig-isolation` **T19** (poison-role
reset; destructive, `CLARA_RIG_ALLOW_RESET` deliberately never set) and one `wake_file_document`
Tier-B3 arm the migration's own comment proves unreachable today.

The wave's own twelve, re-run individually at the tip — **205 cells, all green, identical to the
merge report's own numbers**, so the renumber and the re-pins cost nothing:

| battery | cells | | battery | cells |
|---|---|---|---|---|
| `client-work-pack` (#650) | 13 | | `knowledge-firm-defaults` (#654) | 21 |
| `counterparty-identity` (#647) | 19 | | `staff-expense-claim` (#638) | 24 |
| `fixed-asset-acquisition` (#639) | 21 | | `accrual-adjustments` (#652) | 21 |
| `rig-docs-source-revision` (#646) | 16 | | `prepayment-schedule` (#653) | 18 |
| `firm-setup` (#648) | 17 | | `prepayment-occurrences` (#653) | 10 |
| `client-onboarding-identity` (#649) | 13 | | `preview-invite` (#625) | 12 |

### 7.2 · web — the whole `apps/web` unit suite

`node scripts/run-tests.mjs`: **4136 tests · 4134 pass · 0 fail · 2 skip.** The two skips are the
env-gated `live-provider-auth` cells.

Census suites re-run individually at the tip:

`sql-oracle` **25/25** · `parity-holes` **7/7** · `firm-scope-surfaces` **35/35** ·
`firm-scope-fourth-entrance` **21/21** · `firm-scope-db-pins` **22/22** · `require-firm-scope`
**58/58** · `e2e-fixture-ownership` **18/18** (16 before the browser branch's client-id census) ·
`tree.test.ts`'s `resolveActive` reachability wall **27/27**.

### 7.3 · runtime — the ten files the re-base could reach

`chatturn-v18`, `chat-turn-v20-tools`, `clara-work-v4`, `client-onboarding-v5`, `accrual-basis-unit`,
`staff-expense-claim-unit`, `fixed-asset-acquisition-unit`, `prepayment-schedule-basis-unit`,
`counterparty-identity-unit`, `p6-1-parts-parity`: **149 tests, 149 pass** (148/1 before the fix in
§8). The full runtime suite was not re-run here — see §9.

---

## 8 · Every red, and what it actually was

Five reds. Four were repaired at the thing that moved; the fifth is a named flake.

**1 · `p646.neighbours` (`rig-docs-source-revision.test.mjs`) — REAL, repaired.** It carried the same
`persist_document_extraction` literal 0217's prestate carries, deliberately, as a second independent
reading. It moved for the same reason and is re-issued to the same measured value. **16/16.**

**2–4 · Three `prepayments-keyboard` cells and the `accrual-form` fixture — REAL, repaired.** Main's
#809 moved the plan authority picker off `/rest/v1/accounting_work` and onto
`clara.list_accounting_work`; the fixtures still answered the table, so the authority `<select>` was
absent from the DOM and three cells reported a missing control, a missing tab stop and an
unchoosable instruction — the fixture's fault, not the form's. `prepayments-keyboard.test.tsx`'s
`AUTHORITIES` is now the door's PAGE (`{rows, next_cursor, truncated}`) with a `WorkListRow`-shaped
row and both routers answer `/rpc/list_accounting_work`; `prepayments-a11y` and
`prepayments-render-states` answer the door with an EMPTY page instead of 404-ing an unmocked read;
`accrual-form.test.tsx` (which injects through `loadAuthorities` and so never 404'd) carried
`basis.memo` from the deleted reader while the door projects a **flat** `memo` — it would have
exercised the `intent_key` fallback while claiming to show a memo. **21/21** across the three
prepayments files, **18/18** with accrual-form.

**5 · `v20.identity` (`chat-turn-v20-tools.test.mjs`) — REAL, repaired.** It walked
`chatTurn_v1..v19` asserting policy (c). #810 retired `chatTurn_v1`, so the cell asked for a function
that is deliberately gone. The floor moves to v2 and the retirement is now **asserted**
(`registry.chatTurn_v1 === undefined`) above the loop, so a body silently returning to the registry
fails this cell too — the same treatment the merge gave `fs7-v17-chatturn` and main gave
`f-a2-pr2-post` and `p6-1-chatturn-v16`.

**NOT a regression, not repaired, named:** `documents-workbench-refresh.test.tsx`'s
*"[633] an UNSETTLED receipt keeps a bounded watch and says so; the poll's budget is finite"* failed
once in the first whole-suite run with *"the poll must issue SOME read while a row is still moving"*.
It is a poll-budget **timing** assertion: **9/9 in isolation, three times**, on this tree, and green
in the second whole-suite run. `WAVE-DIGEST` §5's host-contention class.

No census was widened silently. The two censuses that DID move are main's own forward ratchets
(#815's closure attribution, §2.2) and they were re-measured from the live import graph, not
retyped.

---

## 9 · Open items, and what was NOT done here

**Carried in from the cut's review (`successors-review.json`), untouched by this leg — these are the
cut's, not the re-base's:**

1. **F1, the blocker.** #639's dependent particulars question asks `useful_life_months` / `rate_bps`
   as `kind:"text"` (the door accepts only a JSON string) while `faParticularsAnswerSchema` types
   them `z.number()`. Still true on this tree. Fixable before `--lock-deployed`, which has correctly
   not run.
2. **F2.** `interview-kill-resume-e2e.mjs` pins the literal segment count 15; `clientOnboarding_v5`
   answers 16. A registered `db-live-gates` step; not re-run here.
3. **F3–F7, F9–F11** — the eighteen empty manifest `note`s, the `basis_line` vs `fixed_asset`
   source-ref rename, `knownFactsFromPack`'s unguaranteed precedence, `ask_knowledge_conflict`'s
   un-deduplicated option list, `clientOnboarding_v5`'s two dropped stanza halves, the always-false
   `replayed` fields, the empty `logical_op_id` rendering, the module-level `node:` import.

**Found by this leg, worth an issue:**

4. **`claraWork_v4` shipped without either #811 work-trace bound.** Main's README section said both
   would ship "with `claraWork_v4`"; the cut only feeds `knowledge_version` into the existing
   `observed` object. The section now says so and carries the requirements to the next frozen
   `claraWork` version. Whether migration 0210's door bound (`abs(v) < 1e12 and scale(v) <= 6`) and
   the `run` grammar should be mirrored at the writer is still the open question #811 asked.
5. **`plans-render-states.test.tsx` (main's own) still answers `/rest/v1/accounting_work`** for a
   picker that reads the door since #809, so its authority read 404s into the error state. It passes
   because it asserts nothing about the picker. Main's file, main's call — not touched here.
6. **Two components answer `clara.set_document_kind`** with different rosters, and **#633's
   `documents-intake-mock.mjs` carries a dead `caller_context` handler** — both carried forward from
   the merge report §7 unchanged.

**Not done, by scope:**

7. **No browser walk and no World e2e leg was run at this re-base.** Playwright and the
   `db-live-gates` battery remain CI's / the orchestrator's. That matters more than usual this time:
   the accrual and prepayment walks now depend on the two new `list_accounting_work` answerers
   (§2.1), which are proven by construction and by the unit suites but have not been driven through
   a real browser here.
8. **The full runtime unit suite was not re-run** (the successor cut's own baseline is 2618 / 2610 /
   7, the seven being four `pg_dump ENOENT` host reds, #693's EICAR, and two shared-database
   contamination cells). Ten targeted files were run instead (§7.3).
9. **Rig cleanup** (`WAVE-DIGEST` §5's census; `rig654r` stale; `rig647z` and every `rig<n>r` to drop)
   is still untouched. This leg ADDS `rigint3` (55621, carrying the merged 219-migration chain and a
   2-firm seed) to that census; `rigmain` (55620) is the orchestrator's and was only read.

**Unverified:** everything hosted. No hosted run exists for any part of this wave and none was
attempted here.
