# Brief: #652 — evidenced accrual and reversal adjustments

## Orchestrator decisions (binding)

- **Migration number: `0207` only** (`0207_accrual_adjustments.sql`). One file. 0199–0206 and 0208–0209 belong to
  other in-flight tickets and will be absent on your rig — expected; never depend on them, never renumber.
- **D12 — ride `kind='reversing_journal'`.** NO new `accounting_work.purpose`, NO recut of
  `clara._record_journal_entry_core`, NO widening of `accounting_plans.kind`, NO recut of the `_adjustment_*`
  validator family or either purpose CHECK. `reversing_journal` already *is* the accrual→reversal schedule
  (`0193:1529` auto flag, mirrored basis `0193:1037-1064`, `reverses_entry_id` `0193:652`, FK+CHECK `0193:679-685`,
  picker `0193:914`, orphan wall `0193:1326-1360`). An accrual occurrence stays `purpose='journal_entry'` with
  `adjustment_basis` NULL, exactly as `_plan_admit_occurrence` admits it today (`0193:1367-1369`).
  **This overrides gap-652's §A/§B/§D/§F entirely (orchestrator ruling)** — the gap map's fifth copy of the posting
  core, its purpose widening and its four 0193 recuts are all out.
- **Ownership of the shared spine.** #638 (0206) owns the purpose CHECKs, `_admit_accounting_work_core`,
  `ck_accounting_work_adjustment_basis`, the `0195:2165` insert arm and the `_adjustment_*` generalisation.
  #653 (0208) is the **sole** widener of `accounting_plans.kind` and the sole recutter of the 0193 plan family.
  **You recut nothing.** Do not touch `purpose-label.ts`, `accounting-work-list.tsx`, `work-list-filters.tsx` or the
  Work-purpose label maps in `en.json` (#638 owns all four), `client-workspace-overview.tsx` (#650),
  `lib/firm/capabilities.ts` (#625), `packages/runtime/src/workRoutes.ts` (#633/#638), or
  `apps/web/messages/en.json:4832` — that `kindNote` sentence is TRUE as written; ADD, never rewrite.
- **The runtime door resolves its actor from an ARGUMENT, never from a JWT.** `create_accounting_plan` takes its
  actor from `_human_ctx(role_rank('bookkeeper'))` (`0193:1454`) → `jwt_sub()` (`0004:299-308`), and a
  `clara_runtime` connection carries no human JWT. So `create_accrual_adjustment_for` **may not nest
  `create_accounting_plan`** — it takes the inline plan+revision path with an explicit `p_author`, the estate's own
  OBO idiom (`admit_journal_work` `0178:832`, `_admit_accounting_work_core` `0194:1062`,
  `admit_periodic_adjustment_work` `0194:1298-1314`, all actor-explicit). Nesting stays legal for the
  JWT-authenticated `create_accrual_adjustment` only. See §3 and seam 14.
- **Pins are MEASURED on your migrated rig, never transcribed.** Because #638's 0206 lands before your 0207,
  **do NOT pin** `_record_journal_entry_core`, `_admit_accounting_work_core`, `_assert_adjustment_basis`,
  `_adjustment_basis_canonical`, `_adjustment_amount_cents`, `_assert_adjustment_relationships`, or either purpose
  CHECK text — 0206 replaces them and your file would refuse to apply. **Do pin, as NON-REGRESSION pins** (the
  `0195:402-409` idiom), the six plan-lane bodies you depend on and must not change:
  `clara._plan_admit_occurrence(uuid,date,text,text,boolean)`, `clara.create_accounting_plan(...)` (14 args),
  `clara._assert_plan_schedule(...)`, `clara._plan_occurrence_basis(jsonb,date,text,uuid)`,
  `clara._plan_admissible_event(uuid)`, `clara._plan_primary_entry(uuid,date)`. Measure each with
  `select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') from pg_proc p where p.oid='…'::regprocedure` on
  `clara_652` after `pnpm db:migrate`.
- **Q3 ruled: admit, do not post.** Configuration writes plan + revision + accrual record + current-period
  occurrence + admitted Work in ONE commit; the run writes entry + receipt in a second commit. Both boundaries are
  stated out loud in the UI ("configuration receipt ≠ executed occurrence").
- **Q5 ruled: `method` is a stated jsonb selection-rule enum**, not a `clara.evaluator_versions` closure. Say in the
  migration header why the evaluator freeze (`0140:962-1201`, registry `0059:248`) does not apply: the method
  *selects* among amounts a human stated; it computes none.
- **Q4 ruled: refuse before admission at the form.** Missing term/date/account is a CLR10 refusal, never an admitted
  Work hoping for an answer (`chatTurn.v19.tools.ts:37-41`). The PARK arm (a Work admitted from a document or
  instruction whose term is genuinely absent) is a **claraWork_v4 successor contract only** — not built here.
  Model-extracted service periods never enter the durable record (`0140` table comment, CONFIRMED AS LAW).
- **Successor contract obligations (WORK-ORDER rule 8 — you cut no `_vN`).** Write one stanza in your final report
  for `chatTurn_v20`'s `start_accrual_work` (tool name, `.strict()` zod schema, door call + argument order,
  refusal→message map, part kind) and one for the claraWork_v4 park. **State explicitly that
  `WORK_ACCEPTED_PURPOSES` needs NO widening** (`chatTurn.v19.parts.ts:91`, pinned by
  `p6-1-parts-parity.test.mjs:548`) because an accrual occurrence is a `journal_entry` Work. Ship
  `packages/runtime/lib/accrual-basis.ts` as a NEW non-frozen sibling of the frozen
  `packages/runtime/lib/periodic-adjustment-basis.ts` — never an edit of it, and no frozen file may import it.
- **Route: `/clients/[clientId]/accruals`** (list, detail, `/new` form) — a top-level client segment beside `plans`
  (`tree.ts:339`), **not** under `accounting/` (orchestrator ruling; overrides gap-652's `/accounting/accruals`).
- **No new `workRoutes.ts` route** (orchestrator refinement): configuration is a plan-lane human door reached the
  way `apps/web/lib/plans/api.ts:1` reaches its eleven — one less contended shared file.
- **Route/state discipline:** `StateBanner` (`components/common/state.tsx`) for every business refusal — Alert is
  #646's documents surface only. Dialog only for a bounded confirmation; the multi-section form is a full detail
  destination (appendix C §4).
- **Rig row:** worktree `C:\Users\zhant\Desktop\clara-wt\652`, branch `impl/652-accrual-adjustments`,
  PG `127.0.0.1:55510`, database `clara_652`. **Playwright port triple:**
  `CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3320 CLARA_E2E_NEXT_PORT=3321 CLARA_E2E_RUNTIME_PORT=3322`.

## 1. Current state

**db (frontier 0198).** `0193_accounting_plans.sql` delivers the whole accrual→reversal *schedule*: three FORCE-RLS
relations with **zero** app-role grants (`0193:408`, `:523`, `:633`), eleven human doors on `clara_authenticated`,
one runtime scan `wake_due_plan_occurrences` (`0193:2161`). `create_accounting_plan` (`0193:1438`) resolves its
actor through `_human_ctx` (`0193:1454`), validates schedule + basis, reserves on
`(firm,'create_accounting_plan',op_key)` (`0004:46`), inserts plan `:1539` + revision `:1543`, returns a preview and
an advisory overlap warning; it refuses the excluded adapters by name (`0193:1466-1472`) and refuses
`authority_rule` (`:1474-1476`), resolving `authority_ref` against a real `accounting_work`/`agent_tasks` row
(`:1510-1512`). `_plan_admissible_event` (`0193:1077`) picks the current primary/reversal candidate against
`clara._book_today()`. `_plan_admit_occurrence` (`0193:1191`) is **actor-explicit** — no `_human_ctx` and no
`jwt_sub()` in its body; it reads the authoriser off the plan row, inserts the occurrence, applies the orphan wall
with a typed `primary_state` (`0193:1326-1360`) and admits through `clara.admit_journal_work` (`0193:1367-1369`) in
one transaction. **A human door already calls it:** `request_plan_catch_up` (`0193:1878`) at the bookkeeper floor,
inside `_reserve_op`/`_finish_op`, with an authority floor (`:1906-1911`) and a no-future wall (`:1915-1919`). Basis
validation is `_assert_journal_basis` (`0178:693`): `balanced` (`0178:780-783`) and `nonzero_total`
(`0178:785-787`). Execution receipts are `operation_receipts` with `uq_operation_receipts_committed` (`0178:448`);
configuration receipts are `op_receipts` (`0004:46`). The typed-particulars relation idiom to copy is
`clara.periodic_adjustments` (`0194:333-345`, tenant-carrying composite FKs `0194:365-372`, RLS/policies/grants
`0194:398-405`). The revision composite an accrual must point at is
`uq_plan_revisions_id_plan_revision unique (plan_id, revision, firm_id, client_id)` (`0193:551`), which
`fk_plan_occurrences_revision` (`0193:671`) already references. Service-period prior art:
`clara.document_service_periods` (`0140:452`, one live period per document `:529`, bookkeeper-floored read
`:619-627`), human-only door `record_document_service_period` (`0140:944`), four typed term refusals
(`0140:848,:852,:884,:899`).

**runtime.** `packages/runtime/lib/plan-occurrences.mjs` is kind-agnostic (feature-detect `:76-81`, call `:123`) —
**no change needed**. `packages/runtime/tests/plan-occurrence-e2e.mjs` is the real-Postgres-World pattern, wired at
`.github/actions/db-live-gates/action.yml:251`. Registry heads `claraWork_v3` / `chatTurn_v19`
(`packages/runtime/workflows/registry.ts:900-901`); manifest has 281 entries, no `apps/**`, no `.sql`, no
`workRoutes.ts`, no `plan-occurrences.mjs` — **`touches_frozen_closure: false`** for this slice.

**web.** `/clients/[clientId]/plans` (+`/new`, `/[planId]`, `/[planId]/revise`) with
`components/plans/{plan-form,plan-detail,plans-list,plan-lifecycle-dialogs,plan-statement}.tsx`;
`lib/plans/api.ts:1` ("every reach is an RPC" — the grants force it), `PlanKind` union at `:42`. The authority
picker is a resolved `accounting_work` select, never free text (`plan-form.tsx:12-18`, `:294-319`). Accepted
compositions to reuse: `components/accounting/journal-basis-fields.tsx`, `evidence-chooser.tsx`,
`components/common/money-input.tsx`, `native-select.tsx`, `data-table-card.tsx`, `state.tsx` (`StateBanner`);
draft idiom `lib/work/periodic-adjustment-draft.ts`. **No accrual component, route or mock exists anywhere.**

**tests.** `packages/db/tests/accounting-plans.test.mjs` / `accounting-plan-occurrences.test.mjs` (`p640.*`, real
least-privileged roles); `apps/web/e2e/plans-walk.spec.ts` has **nine cells and no create cell**;
**no test anywhere asserts `nonzero_total`.**

## 2. Gaps / rows

| Row | Disposition |
|---|---|
| **AC1** amount basis / accounts+purpose / effective+service period / method / authority / instruction; silent term and zero-value refused | **to build** — the typed particulars and the term law are the missing middle layer. Cells 1–3. |
| **AC2** persist originating adjustment + current-period journal + reversal relationship atomically; register occurrences on the shared plan contract; configuration receipt ≠ executed occurrence | **partial→build**: the reversal relationship is *delivered* (`0193:652`, `:679-685`, `:1326-1360`) — **verify-only**; the originating accrual record and the one-commit configuration are **to build**. Cells 4–7. |
| **AC3** commit journal + adjustment/plan/occurrence atomically; distinguish accepted configuration from posted occurrence | **to build** as two commits with both boundaries named (orchestrator Q3 ruling). Cells 4, 5, 12. |
| **AC4** missing term parks the dependent Work; locked-period catch-up needs accepted scope; a future instruction does not authorise history | **partial-with-named-residual**: refuse-before-admission and the catch-up/authority walls are built and proven (cells 1, 6, 8); the **park arm is a claraWork_v4 successor contract, not built** — say so by name. "Accepted *treatment*" (beyond scope) stays out: `request_plan_catch_up` takes a window only (`0193:1878`); record it as a residual. |
| **AC5** boundary with the periodic-stock/payroll ticket | **verify + one small build** — #643's half is delivered (`0194:228-234`, `:573`, `:1298`), verify-only; yours is minting no purpose **and building the persistent accrual/reversal-vs-#643 boundary sentence, which exists nowhere today** (`AccrualBoundaryStatement` on list/detail/form, the `PlanBoundaryStatement` precedent; cells 16 and 18). Do not report it as covered by an existing surface. |
| **AC6** the real journey, all states, 320px/200%/keyboard/SR/reduced-motion/URL/drafts | **to build** (cells 16–18). |
| **AC7** production-facing reads/commands under real least-privileged roles; real Workflow/Postgres World; label local vs hosted | **to build locally**; hosted evidence is **not yours to claim** — write "hosted evidence pending". |
| **C08.1** locate the adjustment route, inspect/select with authority + period feedback | **to build** — the accrual list/detail is the missing template surface. |
| **C08.2** zero-value proposal not meaningful; name the validation owner | **to build the test** — owner is `_assert_journal_basis` (`0178:693`); `nonzero_total` has **no test today**. Cell 3. |
| **C55.13** re-read evidence, ask bounded, never fabricate a term or balancing entry | **partial-with-named-residual**: the term law and its refusal ship here (cell 2); the *bounded question* half is the park contract. |
| **C83.7** duplicate | **discharged via C55.13** — say so in the report. |
| **C88.13** synthetic first, then separately authorised real-environment evidence | **partial with the hosted leg owed** — build the World e2e, file the hosted leg as a follow-up issue. |

## 3. Slice (one branch)

**Migration `0207_accrual_adjustments.sql`.** §0 prestate: assert 0140/0178/0193/0194 applied, assert
`clara.accrual_adjustments` absent, and pin the six plan-lane bodies named above as NON-REGRESSION pins (measured,
not transcribed). §A relation `clara.accrual_adjustments` on `0194:333-345`'s idiom — `id, firm_id, client_id,
plan_id, revision, purpose, expense_account_code, liability_account_code, amount_cents, currency ('MYR'),
effective_from, effective_to, service_period_start, service_period_end, term_source ('human_stated' only),
document_service_period_id, method jsonb (closed selection-rule enum), authority_kind, authority_ref,
source_document_id, instruction, corrects_/corrected_by_ one-way chain, recorded_by, created_at`. **Tenant-carrying
composite FKs, not bare ones** — that idiom is the whole point of `0194:365-372`. In particular name
`constraint fk_accrual_adjustments_plan_revision foreign key (plan_id, revision, firm_id, client_id) references
clara.accounting_plan_revisions(plan_id, revision, firm_id, client_id)` — the composite `uq_plan_revisions_id_plan_revision`
(`0193:551`) that `fk_plan_occurrences_revision` (`0193:671`) already points at; `(plan_id, revision)` is this
relation's primary join key and FORCE RLS does not stop a definer INSERT writing another client's plan id under
this firm. `source_document_id` is the deliberate firm-wide `(source_document_id, firm_id)` FK —
`clara.documents` has no client column (`0194:394-397`). Unique `(plan_id, revision)`; FORCE RLS + owner policy +
append-only/no-truncate trigger; **zero grants to any app role** (the `0193:408` shape — the web reads through the
doors, like `lib/plans/api.ts:1`); the tail ACL assertion proves it.

§B doors, all SECURITY DEFINER `set search_path = clara, pg_temp`, typed CLR refusals carrying
`detail.reason`/`field`/`constraint`:

`create_accrual_adjustment(...)` (`clara_authenticated`, bookkeeper floor via `_human_ctx`,
`_reserve_op`/`_finish_op` on its own key) — validate particulars, then **preferred mechanism:** call
`clara.create_accounting_plan(...)` with a derived key (`p_op_key || ':plan'`), then
`clara._plan_admissible_event(plan)` and, when it names a `primary` leg, `clara._plan_admit_occurrence(plan, due,
'primary', clara._plan_run_model())`, then insert the accrual row — all one transaction. **Proof required to keep
it:** a cell showing two `op_receipts` rows under distinct `fn` values and a replay of the outer key returning the
stored result with no second plan (`_reserve_op` keys on `(firm, fn, op_key)`, `0004:46-52`). **Fallback if nested
reservation proves unusable:** inline plan+revision with `create_accounting_plan`'s exact sequence
(`_assert_plan_schedule` → `_assert_journal_basis` → `_journal_basis_digest` → `v_auto`), proven equivalent by a
cell that `deepEqual`s a plan made each way minus ids/timestamps. **Either way `create_accounting_plan` is not
recut.**

`create_accrual_adjustment_for(...)` — the same validation and particulars OBO the initiator with live
membership/role/client rechecks, granted to `clara_runtime` ONLY (the `0194:1298-1314` shape), so `chatTurn_v20`
needs no migration. **Its plan-creation step is the INLINE path, unconditionally, never the nested
`create_accounting_plan` call** — that call would raise CLR04 `no authenticated actor` on every runtime connection
(`0193:1454` → `0004:299-308`), and seam 11 would not see it because it only asserts the grant. So extract ONE
`clara._accrual_plan_core(p_author uuid, …)` writing plan + revision with `authorised_by := p_author` and never
calling `_human_ctx` (the `0194:1062` / `0119` extraction idiom), and have the `_for` door call it, then
`_plan_admissible_event` / `_plan_admit_occurrence` (both already actor-explicit — they read the authoriser off the
plan row). If the human door takes its fallback, both doors share that one core.

Reads `list_accrual_adjustments(p_client, p_from, p_to)` and `get_accrual_adjustment(p_id)` at the viewer floor,
deriving lineage by join: plan+revision → occurrence → work → `operation_receipts` (committed only) → entry, and
the reversal via `reverses_entry_id`. **Service period:** preferred — when the basis cites a filed document
carrying a live `clara.document_service_periods` row (`0140:452`, `:529`), store its id and refuse a disagreeing
term; fallback — carry the dates alone and name the unbound link a residual. Proof to pick: a cell reading that row
under the bookkeeper persona (`0140:619-627`). §C tail: catalog re-read, ACL per grantee, **zero `create or
replace` and zero foreign `alter table`** (the `0193:2396-2412` §J shape) plus a re-hash of the six pinned bodies.
Preintegration gate module `packages/db/tests/accrual-adjustments-preintegration-gate.mjs`; `rig-meta.mjs`
`ACCRUAL_ADJUSTMENTS_0207_COHORT` on the `rig-meta.mjs:1830-1875` shape; one `--import` in
`packages/db/package.json:18`. Lock order unchanged.

**Runtime.** NEW non-frozen `packages/runtime/lib/accrual-basis.ts` (zod schema + `accrualFromInput` /
`basisFromAccrual` / `localAccrualRefusal`, unit-tested, header stating it is non-frozen only until the successor
imports it). NEW `packages/runtime/tests/accrual-e2e.mjs` on the `plan-occurrence-e2e.mjs` pattern, skip-clean when
0207 is absent, registered as one block in `.github/actions/db-live-gates/action.yml` after the plan leg (`:251`).
No change to `plan-occurrences.mjs`; no `workRoutes.ts` route.

**Web.** `app/(firm)/clients/[clientId]/accruals/{page.tsx,new/page.tsx,[accrualId]/page.tsx}`;
`components/accruals/{accrual-form,accrual-detail,accruals-list,accrual-boundary-statement}.tsx`;
`lib/accruals/api.ts` + `lib/work/accrual-draft.ts` (intent key minted once per decision, sessionStorage keyed
user+firm+client, lost-response arm re-POSTing the same key exactly once, `fieldForAccrualPath`). Compositions:
FieldGroup/Field layout, `Input`/`Label`/`Textarea`/`Button`, `NativeSelect` for method and the resolved authority
picker, `MoneyInput` + `parseAmountToCents`, `JournalBasisFields` for the derived disabled line preview,
`EvidenceChooser`, `DataTableCard` + `Table` for history, `Dialog` only for a bounded confirmation, `StateBanner`
for every refusal (persistent, never a toast). States, each with its own cell: loading (Skeleton of the known
layout), empty (first use vs filtered no-results vs valid no-data), no-results, partial/stale (labelled prior data
+ watermark), invalid/saving, denied (viewer sees the DENIED face, not a blank), failed, cancelled/recovery (lost
response → re-read before any resubmit). 320 CSS px, 200% zoom, keyboard-only reachability, focus return from the
Dialog, screen-reader names, reduced motion, stable URL + Back, preserved draft across reload and validation
failure. **Both boundary sentences render persistently on list, detail and form** (the `PlanBoundaryStatement`
precedent, `role="status"`): configuration ≠ posting, and accrual/reversal vs the #643 periodic-stock/payroll
shapes — these are NEW strings in your own `en.json` namespace and they are AC5's build half.

**Docs.** `packages/db/README.md` (migration chain + operation-contract census), `packages/db/tests/README.md`
(§Running), `packages/runtime/README.md` (§Standalone e2es), `apps/web/README.md` route table.
`CONTEXT.md` in the house "term / _Avoid_" shape: **Accrual adjustment**, **Accrual reversal**, **Service period**
(pointing at `0140:452` and its human-stated law), **Calculation method**. **Never `docs/PRD.md` or
`docs/ARCHITECTURE.md`** — report contradictions under "blueprint drift".

## 4. TDD seams (red first)

DB battery `packages/db/tests/accrual-adjustments.test.mjs` + fixtures, frontier-gated, **every assertion through
`humanQuery` personas at the least privilege that should succeed — never `rootQuery`**:
1. `p652.basis.required` — each of amount / expense+liability account / purpose / effective period / authority /
   instruction omitted in turn ⇒ CLR10 with the named field; zero rows in all five relations.
2. `p652.basis.silent_term` — absent service period, and a period whose `term_source` is not `human_stated` ⇒ CLR10
   `silent_term`. Closes C55.13/C83.7's "do not fabricate a term".
3. `p652.basis.zero` — a balanced all-zero basis ⇒ `nonzero_total` (`0178:785-787`, first test in the estate) AND a
   stated accrual amount of zero ⇒ a TERM refusal, not merely an unbalanced one. Closes C08.2.
4. `p652.config.atomic` — one call leaves exactly one plan, one revision, one accrual row, one occurrence, one
   `accounting_work`; a forced failure after the plan insert leaves none of the five.
5. `p652.config.vs.occurrence` — the answer carries the `op_receipts` result and `posted:false`; zero committed
   `operation_receipts` (`0178:448`) until the run posts.
6. `p652.authority.future` — `effective_from` in the future ⇒ plan created, **zero** occurrences, preview only.
7. `p652.reversal.binds` — before the accrual posts, the reversal is refused `reversal_before_primary` with
   `primary_state` (`0193:1326-1360`); after it posts, the scan admits it and `reverses_entry_id` equals the
   accrual's entry.
8. `p652.catchup.locked` — a window before `effective_from` ⇒ CLR10 `catch_up_before_authority`; a locked period's
   occurrence settles refused (CLR19) and is not re-admitted by the scan.
9. `p652.role.floor` — viewer ⇒ CLR04 on create, reads fine; cross-firm id and invented uuid both ⇒ the same
   not-found.
10. `p652.lineage.join` — `get_accrual_adjustment` returns occurrence → work → committed receipt → entry and the
    reversal, with exact cents and ISO dates. Plus: an accrual row whose `(plan_id, revision)` names another
    client's revision under the same firm is refused by `fk_accrual_adjustments_plan_revision`, not by RLS.
11. `p652.acl.grants` — RLS+FORCE on, no app-role DML, `clara_runtime` holds only the `_for` overload.
12. `p652.plan.occurrence.typed` — a scan-admitted occurrence resolves to its accrual particulars by
    plan+revision join; this is the cell that proves the entrance-independence gap-652 flagged.
13. `p652.plan.nested_op` — the nested-reservation proof (or the equivalence proof, if the fallback is taken).
14. `p652.obo.for_door` — **invoke `create_accrual_adjustment_for` on a real `clara_runtime` connection** (the
    `admit_periodic_adjustment_work` persona) with an explicit author, and assert a real plan + revision +
    accrual row + occurrence + Work result — not merely that the grant exists. Then the negative twin: the same
    call by a persona whose membership was deactivated ⇒ CLR04 `authority_lost`, nothing written. This is the cell
    that would go red if the `_for` door nested `create_accounting_plan` (CLR04 `no authenticated actor`).
15. Runtime `packages/runtime/tests/accrual-e2e.mjs` — configure through the door with no engine; start the engine;
    `CLARA_WORK_TEST_FAULT=exit_after_commit` between commit and checkpoint; respawn ⇒ exactly one entry, one
    committed receipt, one occurrence; then the reversal leg naming the accrual's entry; then a cancel and a retry
    (C88.13's trigger / one effect / retry / cancellation). Plus `accrual-basis.ts` unit cells.
16. Web `components/accruals/accrual-form.test.tsx` — every state above; server field errors map to focusable
    controls; refusals render as `StateBanner`, never a toast; both boundary sentences present and persistent.
17. `lib/work/accrual-draft.test.ts` — one intent key per decision, replay on the same key, scope change never
    transfers a draft.
18. `apps/web/e2e/accrual-walk.spec.ts` + `e2e/accrual-mock.mjs` — **with a CREATE cell** (the hole in
    `plans-walk.spec.ts`), 320px, 200% zoom, keyboard/focus return, SR names, reduced motion, stable URL/Back,
    preserved draft across reload, and the two boundary sentences visible on list and detail.

## 5. Risks

1. **Pinning a #638-owned body.** 0206 lands first; a prestate pin on the posting core or the `_adjustment_*`
   family makes 0207 refuse to apply. Pin only the six named bodies.
2. **The OBO door is the wave's cross-ticket trap.** A `_for` door written by copy-pasting the human door's body
   ships green through every grant assertion and dies the first time `chatTurn_v20` calls it. Cell 14 is the guard;
   write it red before either door exists.
3. **Nested `_reserve_op`.** Unproven in the estate; cell 13 decides preferred vs fallback before the human door is
   written.
4. **Three scheduled-adjustment carriers.** `create_accounting_plan` only *warns* on overlap
   (`_plan_overlap_warning`, `0193:1155`), `reconciler-adjustments.mjs` still runs the legacy 0045 belt, and
   `0140:660` extended it. Render the warning persistently; do not add a refusal.
5. **#640 SHOULD-1 is open** — a frequency change can double-cover a period across alignments
   (`reports/640-review-closure.md` §B). An accrual inherits it; note it, do not fix it.
6. **Shared-file merge risk.** Your one-line registrations, each at the sorted position, logic in your own modules:
   `tree.ts` — one `ACCOUNTING_ITEMS` row `accruals` (after `plans`, `tree.ts:339`) + one `CLIENT_LEAVES` row
   `accrualNew` at the bookkeeper floor (`tree.ts:373-386`); `messages/en.json` — one new namespace only;
   `apps/web/test/manifest.txt` — one line per new test file; `e2e/serve-built.mjs` — one import + one dispatch
   (`:59`/`:92` precedent); `e2e/e2e-fixture-ownership.test.ts` — the mock name (`:66`), its record (`:340`), and
   any RPC verb another mock also answers declared shared (`:993` shape — `get_work_plan_origin` and
   `list_accounting_plan_occurrences` are live candidates); `packages/db/tests/rig-meta.mjs` — one cohort block;
   `packages/db/package.json:18` — one `--import`; `.github/actions/db-live-gates/action.yml` — one block after
   `:251`; `CONTEXT.md` — four terms.
7. **Census reds you did not cause.** A new `app/**` file, a new href, a new SQL function and a new mock verb red
   `parity-holes.test.ts`, `firm-scope-surfaces.test.ts`, `sql-oracle.test.ts`, `e2e-fixture-ownership.test.ts`.
   Pages under `app/(firm)/…` inherit the layout entrance (`require-firm-scope.ts:257`); register in the three
   tables only if a wall demands it, and say which.
8. **Known Windows reds you must not "fix"**: #707, #693, and the `thread-live-clarify.test.tsx` load flake —
   re-run it in isolation and report both.
9. **Vague successor contract.** If `start_accrual_work` is written loosely, "the user can express an accrual in
   conversation" will be claimed on a tool that does not exist. Write it exactly; claim nothing.

## 6. Effort and rig

**Effort: L** (the trimmed slice — no purpose, no core recut, no kind widening; every remaining piece has a
delivered shape to copy from #640/`0193` and #643/`0194`).

**Rig:** worktree `C:\Users\zhant\Desktop\clara-wt\652`, branch `impl/652-accrual-adjustments`, PG
`127.0.0.1:55510` / `clara_652`, Playwright triple **3320 / 3321 / 3322**. Node 22 via the RIG.md PATH line.

**Before the final report, run and report counts:** the DB battery with the exact 28 `--import` gates from
`packages/db/package.json:18`; `packages/db/tests/operation-census.test.mjs` and `rig-isolation.test.mjs` (never
with the reset flags); `packages/runtime/tests/accrual-e2e.mjs` on the real World; the whole `apps/web` unit suite
once (`node scripts/run-tests.mjs`, ~5 min); `pnpm --filter @clara/web e2e accrual-walk` on your port triple;
`pnpm typecheck` and `pnpm lint` from the worktree root. Parts-parity and the frozen check are **not** applicable
by construction (you touch no `packages/**` file any frozen body imports) — run
`node scripts/check-frozen-workflows.mjs` once anyway and report it, because `accrual-basis.ts` is a new
`packages/runtime/lib/` file and that is exactly the import-escape trap.

**Sibling deliveries to copy, by path:** `packages/db/migrations/0193_accounting_plans.sql` (doors, orphan wall,
tail §J), `0194_periodic_adjustments.sql` (typed relation, composite FKs, grants, the OBO admission sibling and its
extracted actor-explicit core), `0195_work_egress_purpose_and_execution_trace.sql:390-409` (prestate pin idiom),
`packages/runtime/tests/plan-occurrence-e2e.mjs`, `apps/web/lib/plans/api.ts`,
`apps/web/components/accounting/periodic-adjustment-form.tsx`, `apps/web/e2e/periodic-adjustment-walk.spec.ts`,
`docs/plan/active/refresh-wave-2026-09-14/brief-640.md`, `brief-643.md`, and
`docs/plan/active/refresh-wave-2026-09-14/reports/640-review-closure.md` (what a reviewer demanded last time:
behavioural cells, not `prosrc` assertions; a measured race; a named residual instead of a quiet test edit).

## Verifier findings not applied

None — all three verifier findings (the `_for`/`_human_ctx` blocker, the composite plan-revision FK, the AC5
relabel) are applied above; none contradicts `DECISIONS.md`.
