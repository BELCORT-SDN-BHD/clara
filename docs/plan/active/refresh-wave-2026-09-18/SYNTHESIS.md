# Wave synthesis — refresh-wave-2026-09-18

Ten tickets, ten worktrees, ten PG17 clusters, merged later into one integration branch. This file is
the constraint set the orchestrator needs **before** writing the ten briefs. It is a synthesis of the
ten reconciled gap maps (`gap-<n>.md` beside this file), with every cross-ticket claim re-verified
against source at `abcc5030` in this pass.

Ground rules that shaped every decision: `WORK-ORDER.md` rule 8 (no worker cuts a `_vN` successor;
use ONLY the migration number the brief assigns; re-pin by pre-image `sha256(prosrc)` measured on a
rig), AGENTS.md steps 4–5 (blueprints are not edited by implementation), the 2026-09-15 `DECISIONS.md`
§0–§3 (binding unless overturned here), and the estate's own append-only laws.

**The headline, stated first because it inverts the last wave's shape:** *no two tickets in this wave
recut the same governed function.* The 2026-09-15 wave had a three-ticket serialised spine
(#638 → #652 → #653) forced by a shared prestate. This wave has none. Every recut lands in a disjoint
family — the posting core (#655), the bank family (#657), the fixed-asset family (#651), one usage
rollup (#635), one facts router (#656, conditional). **All ten branches can be authored in parallel.**

---

## 0 · What was re-verified for this synthesis

Every row below was opened or executed in THIS pass, not carried from a map.

| Claim | Verified at |
|---|---|
| Frozen manifest is at the repo root, **296 entries**, **every one `deployed:true`**, **zero `apps/**` keys, zero `.sql` keys** | `frozen-workflows.json` (parsed with node) |
| The manifest's runtime-lib members are **exactly nine**: `accrual-basis.ts`, `capability-registry.mjs`, `fixed-asset-acquisition.ts`, `knowledge-conflicts.mjs`, `knowledge.mjs`, `malaysian-registration.mjs`, `periodic-adjustment-basis.ts`, `staff-expense-claim-basis.ts`, `work-trace.mjs` — all `deployed:true` | manifest parse |
| **`lib/knowledge-conflicts.mjs` IS frozen and `deployed:true`** — the orchestrator's note that it is non-frozen is **refuted**; gap-658's correction stands and binds #658's whole frozen-body verdict | manifest parse |
| `chatTurn.v20.*` (5 files), `claraWork.v4.*` (6), `documentIngest.*` (6), `invoiceFacts.v1.*` (3), `autoDraft.v10.*` (6), `closePrep.v1.*` (7), `bankAgent.v1.*` (9), `chatTurn.v14.*` (10), `packages/reporting-render/lib/*` (7) — **all `deployed:true`**, i.e. hash-immutable | manifest parse |
| The substring `services.mjs` **never occurs** in the manifest — the five `*.services.mjs` reverse importers of `lib/intake.mjs` sit outside the closure today (gap-636's measurement confirmed) | manifest parse |
| `retired` holds exactly three keys: `chatTurn.impl.ts`, `chatTurn.prompt.ts`, `chatTurn.v1.ts` | manifest parse |
| **Pins at base**: `chatTurn: chatTurn_v20` (`registry.ts:173`, `:990`), `claraWork: claraWork_v4` (`:270`, `:991`), `documentIngest: documentIngest_v2` (`:271`, `:992`), `firmInterview: firmInterview_v3` (`:321`, `:997`), `clientOnboarding: clientOnboarding_v5` (`:350`, `:998`) | `packages/runtime/workflows/registry.ts` |
| **Frontier is 0224**: 219 files under `packages/db/migrations/`; newest `0224_preview_invite.sql` | file listing |
| Gate chain holds **exactly 40** `--import ./tests/*-preintegration-gate.mjs` flags; first `delta-`, last `preview-invite-`; the chain is in **migration order**, not alphabetical (its tail reads 0214 → 0215 → 0217 → 0218 → 0219 → 0220 → 0221 → 0222 → 0223 → 0224) | `packages/db/package.json` (parsed) |
| **The purpose IN-list, all three sites**: the column CHECK admitting `journal_entry`, `periodic_stock_adjustment`, `payroll_obligation` at `0194:230`; the receipts CHECK immediately below at `0194:232-233`; the posting core's Work lookup carrying the same three at `0195:1711`; the **census pin** that raises CLR10 if the core's filter is not the widened closed set at `0194:2180` | `sed` over all three files |
| **CORRECTION to gap-655**: the live posting core's purpose filter is at **`0204:180`**, not `0204:189-191`. The body opens with `create or replace function clara._record_journal_entry_core` at `0204:152`; the file is 892 lines | `0204_record_journal_entry_core_reversal_liveness.sql` |
| **The control-leg rule** (`generic_control_leg`, CLR10) is at `0204:550-570`, with its "#643 · UNCHANGED, AND IT STILL BITES THE NEW PURPOSES" note in the same block; the **seventeen-token tail roster** including `generic_control_leg` is at `0204:776-782` | `sed` |
| **`_subledger_on_approve`'s caller census is re-pinned at SIX** by name — `_approve_entry_core`, `_approve_opening_entry`, `approve_wrong_client_correction`, `finalize_close`, `reopen_fiscal_year`, `reverse_entry` — behind a fail-closed whole-catalog `prosrc` scan | `0216_fixed_asset_acquisition.sql:939-946` |
| `clara.get_llm_usage_summary(uuid,date,uuid)` is created at `0110:706`; its **only** wall is the CLR11 `client_not_in_firm` firm check at `0110:714-717`; **it has ZERO callers across `apps/web` and `packages/runtime`** (grep returns 0) | source + grep |
| `clara.open_work_question(uuid,text,jsonb,jsonb,text,jsonb)` is granted to **`clara_runtime` only** | `0180_work_questions.sql:686` |
| `clara._metric_selector_account_ids(uuid,jsonb)` is created at `0058:344` as `stable security definer` | `0058_wave_e_delta_metrics.sql` |
| `clara._work_run_attempts(uuid[])` is created at `0189:251`; `0189:187` censuses it beside `list_accounting_work` / `get_accounting_work_row` | `0189_work_list_reads.sql` |
| `clara.list_accounting_work`'s live body opens at `0203:214`; `clara.get_client_work_pack` at `0214:234` | `sed` |
| The **active-client wall** inside `list_review_queue` is real and is implemented as **string splices** re-asserted by `position(...)` probes (`active_entry_client.status='active'`, `active_envelope_client.status='active'`) | `0017_wave_b.sql:523-591` |
| **`compliance_watches` / `compliance_watch_events` carry no application-role grant anywhere in the estate** — a grep for `grant select on clara.compliance_watch` over all 219 migrations returns **nothing** | grep |
| `apps/web/components/ui/` holds **32 entries**; **no `chart.tsx`, no `combobox.tsx`, no `popover.tsx`**; `apps/web/package.json` has **no `recharts`** | `ls` + grep |
| Shared-file sizes (the merge surface): `serve-built.mjs` 1117, `e2e-fixture-ownership.test.ts` 1445, `tree.ts` 1075, `en.json` 6246, `manifest.txt` 449, `rig-meta.mjs` 3165, `action.yml` 435, `CONTEXT.md` 545 lines; **25** `*-mock.mjs` files under `apps/web/e2e/` | `wc -l`, `ls` |
| The fixture-ownership census carries **four** structures: `LANE_MOCKS` (`:53`), `LANE_DECLARATIONS` (`:216`), `SHARED_RPC_VERBS` (`:1106`), `CORE_RELATION_HANDOVERS` (`:1311`) | `apps/web/e2e/e2e-fixture-ownership.test.ts` |
| `rig-meta.mjs` cohort constants **carry the migration number** (`CLIENT_WORK_PACK_0214_COHORT` `:2167` … `PREVIEW_INVITE_0224_COHORT` `:2311`), while gate-module **stems are mostly stable and unnumbered** (`client-work-pack-preintegration-gate.mjs`), with a numbered minority (`knowledge-0192-`, `prepayment-0223-`) | `rig-meta.mjs`, `package.json` |
| Per-lane web owners exist and are single-owner files: `client-workspace-overview.tsx` 203 lines, `work-detail.tsx` 1332, `ClaraThreadView.tsx` 658, `matching-section.tsx` 244, `documents-workbench.tsx` 386, `accounting-hub.tsx` 88, `settings-panel.tsx` 90, `fa-depreciation-runs-panel.tsx` 121, `PartRenderer.tsx` 329, `lib/parts/types.ts` 463, `lib/parts/catalog.ts` 447, `lib/firm/needs-you.ts` 303 | `wc -l` |
| Firm Home lives at `apps/web/components/firm/firm-home/` (`firm-home-board.tsx`, `needs-you-scoreboard.tsx`, `oldest-waiting-list.tsx`) — **not** at `components/firm/firm-home-board.tsx` as gap-659's citations spell it | `find` |
| `clara.admit_staff_expense_claim_work` is created at `0221:1222` — the admission precedent #655 copies step for step | `0221_staff_expense_claims.sql` |
| `list_bank_match_candidates` is created at `0038:8010` and its body is **duplicated verbatim** inside `_agent_get_bank_pack_core` at `0121:5735` (the file says so in its own comment) | `grep -n` |
| **Playwright port triples are ALREADY assigned** in `RIG.md`'s rig table — 635→3300/3301/3302, 636→3310, 642→3320, 651→3330, 655→3340, 656→3350, 657→3360, 658→3370, 659→3380, 660→3390. Five maps record this as "assigned by SYNTHESIS"; **it is already done** and each brief cites `RIG.md` | `RIG.md` |

### 0.1 · Functions TWO OR MORE maps propose to recut or to call in a new way

| Function | Who recuts | Who newly CALLS | Collision? |
|---|---|---|---|
| `clara._record_journal_entry_core` (live `0204:152`) | **#655 only** (sixth full copy) | — | **No collision.** #651, #656, #657, #660 each state in writing that they do not reach it; #636's children ride the unchanged core. |
| `clara._work_run_attempts(uuid[])` (`0189:251`) | nobody | **#636** (batch preview labels) and **#659** (portfolio preview labels) | **Two new callers, no recut.** Both are bound by the door's own ">101 ids" refusal; both must label a PREVIEW, never a population. A shared consumer, not a shared edit. |
| `clara.list_accounting_work` / `get_accounting_work_row` (`0203:214` / `:456`) | **nobody — three maps independently rule hands-off** (#636 Q4, #657, #659); open **#905** owns the receipt-dated window | #659 reads it firm-wide | **Declare the Work-list projection FROZEN for this wave** (§2, numbering discipline). |
| `clara.list_review_queue` (seven splices over one whole replacement) | nobody (#659 refuses by name) | #659 reads its envelope | No collision; the refusal *is* the finding. |
| `clara.get_client_work_pack` (`0214:234`) | nobody | #659 copies its SHAPE; #660 must NOT fold money into it | No collision. Two packs, two watermarks (`612-body.md:245`). |
| `clara.trial_balance_as_of(uuid,date)` (`0017:3572`) | nobody (#660 pins it byte-identical in its own tail) | **#660** — the first product caller in the estate | No collision. #656's opening lane depends on its semantics and must be told #660 is now a caller. |
| `clara._subledger_on_approve` (`0037:1050`) | nobody becomes a seventh caller | — | #655 **re-derives and re-asserts** the six-name census (`0216:939-946`) and the `open_items` writer census (which becomes TWO). Nobody else touches either. |
| FA family: `_fa_run_period_core`, `_fa_oldest_unmet_period`, `_fa_validate_particulars`, `revise_fixed_asset_particulars`, `sign_depreciation_authority` | **#651 only** | — | No collision. Open **#932** wants a column on the same `fixed_assets` row but is not in this wave. |
| Bank family: `list_bank_match_candidates`, `_agent_get_bank_pack_core`, `_match_bank_line_core`, `_agent_verify_inputs_digest` | **#657 only** | — | No collision **inside the wave**. #657's `_agent_verify_inputs_digest` DROP+CREATE re-patches **thirteen** `_agent_*_core` bodies spanning #667/#671/#675's domains (none in this wave) — every one gets a new `prosrc` sha. |
| `clara.get_llm_usage_summary` (`0110:706`) | **#635 only** (body-only, floor first) | — | Zero callers today, so the blast radius is the batteries only. |
| `clara._enqueue_invoice_facts_core` + three lane/engine CHECKs | **#656 only, and only under its routed option** | — | Conditional on #656 Q1. The recommended in-line option recuts nothing. |
| `clara.begin_chat_turn` (`0006:923`, recut once by `0105`) | **nobody** — #642 explicitly leaves it alone | #642 surfaces `replayed` one route line up | No collision. `0105:141`'s quiesce guard is the stated reason. |

### 0.2 · Tables TWO OR MORE maps propose to WRITE

**None.** Every new relation belongs to exactly one ticket. Three adjacencies are worth naming anyway.

| Object | Writer(s) | Note |
|---|---|---|
| `clara.open_items` | `_subledger_on_approve` (existing) + **#655's new birth trigger** | The writer census moves from ONE to TWO. #655's tail re-derives it; **no other lane may add a third.** #657 allocates against open items and writes none. |
| `clara.journal_entries` deferred constraint triggers | 0216's FA birth trigger (existing) + **#655's open-item birth trigger** | Two deferred after-triggers on one table. PostgreSQL fires a row's deferred queue **alphabetically by trigger name** on PG 17.11 (0216's own measurement). #655 must **measure** the ordering on its rig, not assume it, and name its trigger so it precedes anything reading open items at commit. |
| `clara.fixed_assets` columns | **#651** (`change_class`, `change_reason`) | Open **#932** wants a policy-version stamp on the same row and recuts 0216's birth trigger. Not in this wave; if it lands concurrently the two are one migration or strict number order with a re-pin. |

### 0.3 · Shared web files TWO OR MORE maps edit

The full matrix is §3. The universal set (all ten, one-line registrations only) is
`messages/en.json`, `test/manifest.txt`, `e2e/serve-built.mjs`, `e2e/e2e-fixture-ownership.test.ts`,
`packages/db/tests/rig-meta.mjs`, `packages/db/package.json` (gate chain),
`.github/actions/db-live-gates/action.yml`, `CONTEXT.md`, plus `lib/navigation/tree.ts` for the four
lanes that add or re-label a leaf.

### 0.4 · The purpose IN-list — which maps touch it

**None widens it, and that is now a checked fact rather than ten separate promises.** Measured:
`0194:230` (column CHECK), `0194:232-233` (receipts CHECK), `0195:1711` (the core's Work lookup, live
at `0204:180`), `0194:2180` (the census pin that raises CLR10 if the core's filter drifts).

* **#655** is the only ticket that recuts the body containing the filter. Its sixth copy must carry
  `aw.purpose in ('journal_entry','periodic_stock_adjustment','payroll_obligation')` **verbatim**, or
  `0194:2180`'s `position(...)` probe fails on the from-scratch chain; and all seventeen tokens at
  `0204:776-782` must survive. A trade invoice is a `journal_entry`-purpose Work.
* **#636** rides `journal_entry` children. **#651** never reaches the Work lane at all (depreciation
  posts through `journal_entries` directly). **#657** states it in Q1's cost section. **#660** states
  it in its frozen-body verdict. **#658**, **#659**, **#635**, **#656**, **#642** touch neither.
* `WORK_ACCEPTED_PURPOSES_V19` (`chatTurn.v19.parts.ts:91`) stays at three; no ticket widens it.

---

## 1 · Frozen-body plan

### 1.1 The answer

**Exactly ONE successor is required by an unambiguous acceptance criterion: `claraWork_v5`, claimed by
#658.** A second, `chatTurn_v21`, is *wanted* by four in-wave tickets and *required* by none of them —
its only hard claimant, **#915**, is blocked on a migration outside this wave. Everything else in the
wave ships with no frozen byte moved, because the freeze lint scans only `packages/`, and every
migration and every `apps/web` file is outside it by construction (verified: 0 `.sql` keys, 0 `apps/`
keys among the 296 entries).

### 1.2 Who needs what — the claimant table, measured from the maps themselves

| Cut | REQUIRED by | Would RIDE it | Explicitly does NOT need it |
|---|---|---|---|
| **`claraWork_v5`** | **#658** (AC1 tool-based inspection, AC2 replan, AC3 required-read terminal on B3) | #847, #882(a), #915, #931, #933 — five open follow-ups, **none of whose stanzas is written this wave** | #635, #636, #642, #651, #655, #656, #657, #659, #660 |
| **`chatTurn_v21`** | **#915 only, and it is out of wave** (its own migration must land first) | **#655** (B6 `start_trade_invoice_work`), **#651** (`run_depreciation_period_for_client`), **#656** (conditional on its Q4, `read_opening_source`), **#658** (the `knowledge_unavailable` card + a bounded context step), **#636** (`open_intake_batch`, contract only), **#657** (only if Q6 is ruled the expensive way) | **#642 — measured, not preferred** (`gap-642` frozen-body verdict: the chunks are already on the wire; the fix is a web fold plus one route line), #635, #659, #660 |
| `documentIngest_v3` | **nobody** | — | #636 (the batch id must not enter step IO), #656 (services are injected, never imported by the frozen body) |
| `bankAgent_v2` | **nobody** | — | #657 (the pack and the act result pass through the frozen v14 bodies verbatim) |
| `clientOnboarding_v6` / `firmInterview_v4` | **nobody** | — | all ten |

### 1.3 The exact contracts each map wrote

**`claraWork_v5` — #658's stanza (the only one written this wave).**

* **New step** `loadWorkKnowledgeStepV5(clientId, firmId, asOf, purpose)` → calls
  `clara.retrieve_knowledge(p_client, p_purpose, p_as_of, p_keys, p_limit, p_firm)` through a NEW
  non-frozen module `packages/runtime/lib/knowledge-retrieval.mjs`, then
  `clara.record_work_knowledge_read(p_task, p_run, p_seq, …)` with the key set actually returned.
  Runtime answer `{status:'ok'|'partial'|'unavailable', reason, knowledge_version, as_of, keys[],
  records_shown, truncated, text}`.
* **New tool** `read_knowledge_source` — `.strict()` zod
  `{ record_id: uuid, reason: string().min(1).max(500) }`; door
  `clara.read_knowledge_record_for(p_firm, p_client, p_record)` in that argument order; refusals
  CLR11 → `record_not_in_scope`, CLR03 → `no_pack_context`, else the transport class. **No part kind.**
* **New tool** `read_knowledge_history` — same shape, door `clara.read_knowledge_history_for(p_firm,
  p_client, p_record)`.
* **New terminal** `knowledge_read_failed` — settles `failed`/`internal`, `recoverable:true`, nothing
  posted; fires **only** when the CORE tier could not be read (#658 Q1).
* **Replan trigger** — after a resume, read `clara.work_knowledge_drift_for(p_firm, p_work)`;
  `relevant:true` spends one existing `budget.replans`. **Budgets do not move.**
* **New capability ids** `accounting_work.retrieve_knowledge` and
  `accounting_work.inspect_knowledge_source` in a NEW sibling `lib/capability-registry-v2.mjs` at
  `clara-capability-registry/v2` — never an edit to the frozen v1.

**`chatTurn_v21` — five stanzas already written, NOT to be cut by any branch.**

| Ticket | Tool | Zod input (`.strict()`) | Door + argument order | Refusal map (abridged) | Part kind |
|---|---|---|---|---|---|
| **#655** | `start_trade_invoice_work` | discriminated union on `kind: 'sales_invoice'\|'supplier_bill'`; `counterparty`, `document_date`, `due_date` (nullable), `due_date_source`, `reference`, `currency: 'MYR'`, `total_cents`, `tax_facts` (opaque), `lines[]`, `document_id` (nullable), `basis_origin`. Lives in NEW `lib/trade-invoice-basis.ts` | `clara.admit_trade_invoice_work($1 client, $2 author, $3 intent_key, $4 kind, $5 particulars, $6 basis, $7 basis_origin, $8 source_refs, $9 model)` — granted `clara_runtime` only | `party_ambiguous` (candidates verbatim) · `party_unresolved` · `credit_shape_not_admitted` · `unbalanced_basis` · `control_leg_missing` · `wrong_control_domain` · `invalid_due_date` · `source_already_posted` · `client_inactive` · `insufficient_role` · `invalid_intent_key` · `intent_payload_conflict` · `period_locked` | existing `work_accepted`; **no `WORK_ACCEPTED_PURPOSES` widening** |
| **#651** | `run_depreciation_period_for_client` | `{ client_id: uuid, through?: /^\d{4}-\d{2}-\d{2}$/ }` — **no period start/end; the period is the database's** (`0041:3457-3470`) | `clara.run_depreciation_period_for($1 p_client, $2 p_through, $3 p_op_key, $4 p_obo)` — NEW verb name, `clara_runtime` only (`rig-meta.mjs:691-693` reds if `run_depreciation_manual` ever reaches a machine role) | CLR38 `authority_not_live` · `period_draft_outstanding` · `period_earlier_unmet` · `period_request_invalid`/`not_ended` · CLR19 `write_into_closed_period` · CLR04 `obo_not_active`/`insufficient_role` | reuse the `work_accepted`-adjacent receipt shape; no new purpose |
| **#656** (conditional on its Q4) | `read_opening_source` | `{ client_id: uuid, seed_id: uuid }` — **no amounts, no account codes, no document id from the model** | the existing route core `parseOpeningTargets(client, {seedId, firmId, reassert})` on a `clara_runtime` connection — **must NOT call `record_opening_targets_parsed` directly** | 404 `not_found` · 409 `registry_not_open` · 409 `refused` + the CLR31 reason verbatim · 422 with counts and failing region ids **verbatim** | reuse the existing typed receipt part; no new wire kind |
| **#658** (the B6 half) | — (a sibling context step, not a tool) | `loadContextPackStepV21(clientId, firmId, createdBy, asOf)` returning `{status, reason, text}` that never collapses to null | a new bounded door beside `get_context_pack`; v10's step stays byte-untouched | the five frozen `knowledge.mjs` reasons mapped onto the four face words | **new kind `knowledge_unavailable`** |
| **#636** | `open_intake_batch` | `{ label: string().min(1).max(120), origin: enum(['chat']), session_id: uuid }` | `clara.open_intake_batch(p_actor, p_origin, p_label, p_session, p_op_key)` | CLR04 `insufficient_role` · CLR18 `daily_limit` (operator remedy verbatim) · CLR10 `invalid_label` | **new kind `intake_batch_accepted`** carrying `{batch_id, label, admitted, waiting}` and nothing derived |
| **#660** (deferred, not owed this wave) | `read_client_financial_pack` | `{ client_id: uuid, as_of: date\|null, period: 'mtd'\|'month', month: string\|null }` | `clara.get_client_financial_pack(p_client, p_as_of, p_month)` | CLR04 · CLR11 · CLR10 `cash_set_unpublished` | reuse an existing typed read part; mint no kind |

**Consequence if `chatTurn_v21` is NOT cut:** five acceptance halves close as *"contract delivered,
entrance pending"*, and one honesty defect stays live — `loadContextStepV10`'s
`catch { contextPack = null }` (`chatTurn.v10.impl.ts:136`), reached by import from v11…v20, keeps
making "the read failed" and "this client has no context" the same value in the lane a person actually
talks to. #658 names that as the price of its own recommendation. **This is the wave's single biggest
product call (§5, Theme A).**

### 1.4 What ships WITHOUT any cut, per ticket

| Ticket | Ships without a cut | Waits for a cut |
|---|---|---|
| #635 | **everything** — all seven ACs, two new doors, the base-door recut, the legal accept action, the usage card and its CSV | nothing |
| #636 | the parent relation, the join, the derived read, the fan-out cancel, the durable Batch card, the World e2e | the chat entrance only (contract) |
| #642 | **everything** — scope band, content-addressed intent key + one route line, live tool fold, scroll/jump-to-latest, `revoked` | nothing (its AC2 component question is Q1, not a cut) |
| #651 | classification, locked-period wall, authority instruction + window, preview read, detail-page tabs, the whole UX pass | the Clara entrance only (contract) |
| #655 | the DB door, the birth instrument, the reads, the whole direct-UI C3+C6 journey, the document-cited path | the B6 chat sentence only |
| #656 | the producer wiring, the registry correction, the document-tied web entrance, the parse action, provenance/totals, every test | a Clara entrance (its Q4 recommends none) |
| #657 | **everything in the recommended slice** — candidate enrichment, stable op key, no-new-cash outcome, exception face, URL-as-truth | only if Q6 is ruled the expensive way |
| #658 | the migration (all five doors + the read relation), the C13 freshness/in-effect faces, the Work-detail `observed_revisions` block, **a real drift banner that closes #885's human-visible half** | the bounded read being *used* by a run, the inspection tools, the required-read terminal, the replan, and `relevant` |
| #659 | **everything** | nothing |
| #660 | **everything** | nothing |

### 1.5 Freeze-lint verification of the plan

| Rule | Effect |
|---|---|
| scan = all tracked source under `packages/`; `.sql` and `apps/**` outside | every branch's migration and web door is invisible to the lint — **ten branches run in parallel with zero freeze risk** |
| manifest append-only vs `origin/main` | a successor **adds** keys; it never changes one. The integration cut passes. |
| registry monotonicity (keep or increase) | `claraWork_v4 → v5` is an increase. **Every prior version stays exported** and in `workflowBodies` / `WORKFLOW_BODY_IDS`, or the stranded-body gate refuses database-wide at World startup |
| enqueue-site provenance | no new `start()` under `packages/` in any slice |
| no manifest key under a test path | every new module lives under `lib/`, never `tests/` |
| **IMPORT-ESCAPE** — the closure captures any first-party module a frozen body imports | **the sequencing constraint.** See 1.6. |
| `--update` refused under CI | the integration worker re-baselines locally, then the ceremony runs `--lock-deployed` and commits |
| parts parity | a new `chatTurn.v21.parts.ts` (if cut) joins `check-parts-parity.mjs`'s closure list, and `registry.ts:165`'s reader-parity hold means `apps/web` ships the reader half in the same cut |

### 1.6 Modules that WOULD freeze on import by the successor

Verified: **none of these is in the 296-entry closure today**, so each is editable right up to the cut
and hash-locked forever after.

| Module | Owner | Freezes when |
|---|---|---|
| `packages/runtime/lib/knowledge-retrieval.mjs` | #658 | `claraWork_v5` imports it |
| `packages/runtime/lib/capability-registry-v2.mjs` | #658 | `claraWork_v5` imports it |
| `packages/runtime/lib/trade-invoice-basis.ts` | #655 | `chatTurn_v21` imports it |
| `packages/runtime/lib/depreciation-run.ts` | #651 | `chatTurn_v21` imports it |
| `packages/runtime/lib/opening-tb-produce.mjs` | #656 | only if a Clara opening tool is ever cut |
| `packages/runtime/lib/intake-batches.mjs` | #636 | not by any successor — but **`lib/intake.mjs` is one manifest line from freezing** via five `*.services.mjs` reverse importers (`invoiceFacts.v1.services.mjs:9`, `statementFacts.v1.services.mjs:19`, `statementFacts.v2.services.mjs:31`, `witnessFacts.v1.services.mjs:27`, `witnessFacts.v2.services.mjs:38`). This is why #636's logic goes in a separate module and `intakeRoutes.ts`, not `intake.mjs`, owns the attach call |

**Therefore the cut must happen AFTER the branches merge and AFTER the wave's review round has settled
every schema.** The `periodic-adjustment-basis.ts` precedent is in the manifest today with that note;
the trap has sprung once already.

### 1.7 The three follow-ups told to share the next cut — facts only

These were told (by their own bodies and by `gap-651`/`gap-658`) to ride the next `claraWork` cut.
**No stanza for any of them is written this wave.** If the orchestrator chooses to ride them on
#658's `claraWork_v5`, this is what each would need:

| Follow-up | What it needs on the cut | Where the requirement is recorded | Blocker |
|---|---|---|---|
| **#847** — `claraWork_v4` work-trace writer bounds | `traceRevisionOf` / `traceRunOf` writer-side bounds in a **v5 sibling module**, never an edit to the frozen `lib/work-trace.mjs`. The blueprint made this binding on v4 and **v4 shipped without it** | `0210_work_trace_shape_bounds.sql:32-41`; `docs/ARCHITECTURE.md:373-386`; `work-trace.mjs:293-303` | none — it is a sibling-module change that only needs a successor to exist |
| **#882(a)** — CLR40 classification | a new arm in `claraWork`'s error map so a CLR40 movement-belt refusal (unregistered movement / cost adjustment / K `gl_balance`) classifies rather than falling to the transport class | `claraWork.v1.errors.ts`; `gap-651` Overlaps row for #882 | none technical; it is adjacent to the FA belt, **not** to the CLR38 depreciation family |
| **#915** — `create_prepayment_schedule_for` + chat tool | (i) an OBO `_for` door granted to `clara_runtime` — **its own migration, which has not landed**; (ii) a `chatTurn_v21` tool importing the carrier module `lib/prepayment-schedule-basis.ts`. It rides `claraWork_v5` only for the Work-lane half | #915's body; `chatTurn.v20.tools.ts:24-25` names the omission and the reason (the door is `clara_authenticated`-only and the chat lane runs as `clara_runtime`) | **its migration is out of this wave.** It is the ONLY hard claimant of `chatTurn_v21` and it cannot ride one cut this wave |
| *(also named by #933)* | #931, #933 ride the same `claraWork_v5` | #933's body: "the cut #847, #882 (a), #915 and #931 also ride" | all OPEN, none written |

**Orchestrator note, stated as a fact and not a decision:** minting `claraWork_v5` means the
integrator reconciles up to **six** stanzas, of which only #658's exists. That reconciliation is
integration work with its own budget; it is not #658's scope.

---

## 2 · Migration allocation

Frontier is **0224**. Append-only; applied bytes immutable; every recut of a governed function pins
the pre-image `sha256(prosrc)` **measured on the rig** in its own prestate (`0194:171-196` is the
house idiom; `0216:205-219` is the FA one).

### 2.1 The rule that forces serialisation — and why it does not bite this wave

Two branches recutting the same governed function both derive from the **same** live body. Whichever
lands second has a prestate pinning a sha the first has already replaced, so it **refuses to apply**.
That is loud, not silent, but it means the second file's prestate text cannot be written until the
first file's output text is fixed.

**Measured this pass: no two files in this wave recut the same function** (§0.1). There is therefore
**no serialised spine and no authoring order is forced.** Two adjacencies still need the orchestrator's
eye and are called out loudly below rather than hidden in a table:

> **LOUD #1 — `clara.journal_entries` gains a SECOND deferred constraint trigger.** #655's open-item
> birth trigger fires on the same approved rows as 0216's fixed-asset birth trigger. PostgreSQL fires a
> row's deferred after-trigger queue **alphabetically by trigger name** on PG 17.11 (0216's own
> measurement, copied not assumed). #655 must measure the ordering on its rig and name its trigger so
> it precedes anything reading open items at commit. #651's depreciation runs produce approved entries
> that traverse both triggers; #655's returns cleanly when no `trade_invoices` row names the work.
> **This is an ordering fact to measure, not a prestate collision.**
>
> **LOUD #2 — #657's `_agent_verify_inputs_digest` DROP+CREATE re-patches thirteen bodies.** The roster
> is literal at `0129:1064-1084` and spans **#667's, #671's and #675's domains** — none of which is in
> this wave — plus ungoverned account-CRUD and staff-advance cores. **Every one of those thirteen
> bodies gets a new `prosrc` sha.** Any future bank-family gap map or migration that pins one of them
> must measure against **#657's post-image**, not against 0129's. If #657's Q2(b) is deferred, this
> risk and the thirteen-site patch leave the slice together.

### 2.2 Per-ticket allocation

| Ticket | Migration | Objects it CREATES | Governed functions it RECUTS (creation + splice history) | Functions it merely CALLS in a new way | Widens `purpose` / recuts admission or posting core? |
|---|---|---|---|---|---|
| **#635** | **yes** | 2 SECURITY DEFINER reads: `get_firm_legal_standing()`, `get_firm_commercial_state()`, plus `get_firm_ai_usage(date)`. **No table, no column, no trigger, no CHECK, no policy** | `get_llm_usage_summary(uuid,date,uuid)` — created `0110:706`, **no later splice** (grep over all 219 returns 0110 alone). Body-only `create or replace`, signature/return/ACL unchanged, admin floor inserted first | `accept_legal_document` (`0185:684`) and `get_current_legal_documents` (`0185:634`) from a firm surface for the first time; `firm_registration_payments` read firm-scoped for the first time (widens the C-3 money-store roster, `c3.53`) | **no / no** |
| **#636** | **yes** | `intake_batches`, `intake_batch_members`, `intake_batch_member_events` (append-only ledger); doors `open_intake_batch`, `attach_intake_to_batch`, `set_intake_batch_member_dependency`, `cancel_intake_batch`; read `get_intake_batch` | **none** | `cancel_accounting_work` (`0199:201`) as a **server-side fan-out, one op key per child**; `_work_run_attempts` for preview labels only | **no / no** |
| **#642** | **NO MIGRATION** — say so out loud in the brief and in §7; nine siblings carry one and a reader who assumes symmetry will look for it | — | none | — | **no / no** |
| **#651** | **yes** | columns `fixed_assets.change_class`, `.change_reason` + `ck_fixed_assets_change_class`; columns `fa_depreciation_authorities.authority_kind`, `.authority_ref`, `.authority_from`; `_fa_assert_period_open(uuid,date)` (ungranted); `preview_depreciation_run(uuid)` (viewer); `run_depreciation_period_for(uuid,date,text,uuid)` (`clara_runtime`, NEW verb name) | `_fa_validate_particulars(jsonb)` (`0041:2970`, no splice found, **IMMUTABLE + ungranted**); `revise_fixed_asset_particulars(uuid,uuid,jsonb,date,text)` (`0041:3112`, no splice — **keep the 5-arg arity**); `_fa_run_period_core(...)` (`0041:3422`, no splice — **THREE callers**: `run_depreciation_period` `0041:3580`, `run_depreciation_manual` `0041:3598`, `_agent_depreciation_catchup_core` `0138:2398`); `_fa_oldest_unmet_period(uuid)` (`0041:1904`); `sign_depreciation_authority` (`0041:3316`) | reads `clara.fiscal_years` from the FA lane for the first time | **no / no** — depreciation never reaches the Work lane |
| **#655** | **yes — the recut-heaviest file in the wave** | `trade_invoices` + append-only status ledger; `admit_trade_invoice_work(...)` (`clara_runtime` only, **no `_for` twin, no `clara_authenticated` door**); `_assert_trade_invoice_basis(...)`; a **deferred constraint trigger** on `journal_entries` birthing the open item; read `get_trade_invoice(uuid)` | **`_record_journal_entry_core` — the SIXTH full copy.** Born `0178:1223` → `0182:763` → `0184:860` → `0194:1364` → `0195:1685` → live `0204:152`. ~610 lines carried verbatim; ONE new conditional in §7's control-leg rule (`0204:550-570`) plus a post-insert party stamp | **becomes the SECOND writer of `open_items`**; re-derives and re-pins both the `open_items` writer census (`0037:3826-3836`) and the six-name subledger caller census (`0216:939-946`) | **no purpose widening** (a trade invoice is a `journal_entry` Work) / **YES — it recuts the posting core.** `_admit_accounting_work_core` is **NOT** recut |
| **#656** | **yes (both options)** | *(in-line, recommended)* nothing but the capability-registry correction. *(routed)* one lane value, one engine-kind value, three CHECK re-adds, one router arm | *(in-line)* **none**. *(routed)* `_enqueue_invoice_facts_core` splice + `ck_processing_task_lane_*`, `ck_processing_task_lane_engine_*`, `ck_document_extractions_engine_kind_*` — **names carry migration numbers; read `pg_constraint`, never transcribe** | UPDATEs two `document_capabilities` rows to `registry_version = 2` (**UPDATE that raises, never DELETE-then-INSERT** — #846) | **no / no** |
| **#657** | **yes** | read `get_bank_line_matching_context(uuid)` (the granted wrapper over the ungranted `_wdb_line_booking_block`, `0044:2459`) | `list_bank_match_candidates(uuid,uuid)` (`0038:8010`, no splice) **and its verbatim duplicate inside** `_agent_get_bank_pack_core` (`0121:5735-5771`) — **both must move in one file**; `_match_bank_line_core` (extracted by `0119`, **recut whole at `0121:1863`** — the live body is 0121's, not 0038's); `_agent_verify_inputs_digest` (2-arg `0121:5026` → **DROP+CREATE 3-arg `0129:1023-1059`**), re-patching thirteen call sites | none new | **no / no** |
| **#658** | **yes** | `retrieve_knowledge(...)` (`clara_runtime` ONLY — #783's ruling binds); `read_knowledge_record_for`, `read_knowledge_history_for` (`clara_runtime`); relation `work_knowledge_reads` (FORCE RLS, append-only, **NO FK to `accounting_work`**) + writer `record_work_knowledge_read`; `work_knowledge_drift(uuid)` (`clara_authenticated`) and `work_knowledge_drift_for(uuid,uuid)` (`clara_runtime`) | **none** — and the tail proves it by asserting eight named bodies byte-identical to their pre-image sha | reads `work_execution_traces.observed_revisions` as a drift fallback — the watermark **deployed v4 already writes** (`claraWork.v4.impl.ts:593`) | **no / no** |
| **#659** | **yes** | `get_firm_portfolio_pack(int,text,int)` (SECURITY INVOKER, bookkeeper floor inline, `clara_authenticated` only). **Q3-conditional**: `get_compliance_watch_disposition(uuid)` (SECURITY DEFINER — both relations are owner-policy-only) | **none**, and it refuses `list_review_queue` by name (seven splices over one replacement) | reads `list_review_queue`'s envelope and `_work_run_attempts`' preview | **no / no** |
| **#660** | **yes** | `cash_account_set_versions`, `cash_account_set_members`, integrity trigger `_tf_cash_account_set_integrity`; doors `publish_client_cash_account_set` (admin), `propose_client_cash_accounts` (viewer read), `get_client_financial_pack` (viewer read) | **none** — and its tail asserts five read-only dependencies byte-identical: `trial_balance_as_of`, `_metric_selector_account_ids`, `create_account_set_v1`, `finalize_close`, `reopen_fiscal_year` | **first product caller of `trial_balance_as_of`** in the estate (up to seven evaluations per call — measure the plan) | **no / no** |

### 2.3 Proposed order — 0225 … 0233

Recut-heavy first, as instructed; additive tail parallel-mergeable. **Every number is releasable as a
gap if its ticket is descoped — never renumber.**

| № | Ticket | Why here |
|---|---|---|
| **0225** | **#655** | **SPINE HEAD by weight, not by dependency.** The wave's only posting-core recut, ~610 lines carried verbatim with seventeen pinned tokens, the only new `journal_entries` trigger and the only move of two catalog censuses. Landing it first means the from-scratch chain exercises the riskiest artefact before nine files stack on it. **Caveat the orchestrator must weigh: #655 is also the ticket most likely to be blocked by an owner ruling (Q5, "do we recut the core at all"). If the owner is expected to be slow, release 0225 and move #655 to the tail — the prior wave's §2.2 reasoning — because nothing downstream depends on its output.** |
| **0226** | **#657** | Second recut-heavy: four bodies, one of them a DROP+CREATE that re-patches thirteen `_agent_*_core` bodies across three out-of-wave domains. Early placement fixes that post-image for every later bank-family reader. |
| **0227** | **#651** | Third recut-heavy: five FA bodies, two columns on `fixed_assets`, three on `fa_depreciation_authorities`, and a recut whose blast radius includes a **parked** agent lane nobody in this wave reviews. |
| **0228** | **#635** | One body-only recut at an unchanged signature; everything else additive. Low contention. |
| **0229** | **#656** | Either a pure capability-registry UPDATE (in-line, recommended) or a facts-router splice plus three migration-numbered CHECK re-adds (routed). Both are self-contained. |
| **0230** | **#658** | Fully additive: five functions plus one relation, with a tail that **proves** it recut nothing. First of the additive block. |
| **0231** | **#660** | Fully additive: two relations, one trigger, three functions. Pins five read-only dependencies byte-identical — safe at any position because no earlier file in the wave touches them. |
| **0232** | **#659** | Fully additive: one read, plus one conditional read. |
| **0233** | **#636** | Fully additive: two relations, an append-only ledger child, four doors, one derived read. |
| — | **#642** | **No migration.** If the orchestrator wants a cohort row anyway, the honest content is a `rig-meta` note that this lane adds none. |

**Parallel-merge property:** 0230–0233 touch no object any other file in the wave creates or recuts,
so they can be authored, reviewed and merged in any relative order. 0225–0229 touch disjoint families,
so they too can be authored in parallel; only their **numbers** are ordered.

### 2.4 Numbering discipline

The numbers above are **the brief's to assign**, never the worker's (`WORK-ORDER.md` rule 8). Four
rules bind every file:

1. **A released number is a gap, never a renumber.** If a conditional file is ruled out (#656's routed
   half, #659's Q3 door), release its number. A gap costs nothing; a renumber invalidates every
   prestate written against it — and this wave has a written precedent for the opposite mistake
   (2026-09-15 §3.4 renumbered 0199–0209 → 0214–0224 mid-flight and had to re-measure every sha).
2. **Gate modules take a STABLE STEM; cohorts take the NUMBER.** Measured: the 40-entry chain runs in
   **migration order, not alphabetical**, and its stems are overwhelmingly unnumbered
   (`client-work-pack-preintegration-gate.mjs`, `firm-setup-preintegration-gate.mjs`) with a numbered
   minority (`knowledge-0192-`, `prepayment-0223-`). **Use the stable stem** — it survives a
   renumbering — and put the migration number on the `rig-meta.mjs` cohort constant, which is how
   every 0214–0224 cohort already spells it (`CLIENT_WORK_PACK_0214_COHORT` … `PREVIEW_INVITE_0224_COHORT`).
   Each new gate line goes into `packages/db/package.json` at its **migration-order position**, after
   `preview-invite-preintegration-gate.mjs`.
3. **Every recut pins by MEASURED pre-image sha, never transcribed text.** Six live bodies in this
   wave's blast radius are demonstrably splices: `_record_journal_entry_core` (five prior copies),
   `_match_bank_line_core` (extracted then recut whole at `0121:1863`), `_agent_verify_inputs_digest`
   (dropped and re-created), `set_client_fy_end` (0042 §S5.12 + 0045 §S5.12-b2), `_fa_asset_json`
   (0042 ×2 + 0216), `get_context_pack` (eleven generations). A pin written from a file read will not
   match and the migration refuses to apply.
4. **A new parameterisation is a NEW VERB, never a defaulted argument.** `0103:1055-1070` raises CLR10
   if any installed name carries more than one `pg_proc` row, and three separate migrations assert
   `match_bank_line`'s arity set (`0119:210-218`, `0040:6778-6781`, `0129:1197-1199`), while
   `0051:1031-1038` asserts exactly one `finalize_document_intake` overload before it splices and
   `0109:361` asserts exactly one `get_context_pack`. `0018:188` is the scar: adding `p_resolution`
   to `seed_fixed_asset` needed a DROP + CREATE and the 4-arg grant died with it.

---

## 3 · Shared surfaces

### 3.1 The matrix — shared file × ticket

`R` = one-line registration only · `E` = substantive edit · `O` = proposed owner · `—` = no contact.

| File | 635 | 636 | 642 | 651 | 655 | 656 | 657 | 658 | 659 | 660 | Owner recommendation |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `apps/web/messages/en.json` | **E** (replaces `Settings.unbuiltNote`) | R | R | R | R | R | R | R | R | R | **No owner needed**, but #635's is a *replacement*, not an addition — the collision-prone shape. **#635 lands it in one early commit and says so.** |
| `apps/web/test/manifest.txt` | R | R | R | R | R | R | R | R | R | R | none — alphabetical by plain string compare; an unregistered file silently never runs |
| `apps/web/e2e/serve-built.mjs` | R | R | R | R | R | R | R | R | R | R | none — ONE server for every walk; generic defaults only, no lane logic |
| `apps/web/e2e/e2e-fixture-ownership.test.ts` | R | R | — | R | R | R | R | R | R | R | none — but see §3.3; four structures, additions at the sorted position |
| `packages/db/tests/rig-meta.mjs` | R (comment only) | R | — | R | R | R | R | R | R | R | none — the `];` repair is the known merge hazard |
| `packages/db/package.json` gate chain | R | R | — | R | R | R | R | R | R | R | none — **migration order, not alphabetical** |
| `.github/actions/db-live-gates/action.yml` | R | R | — | R | R | R | R | R | R | R | none — per-line `\` continuations; each ticket's stated step order |
| `CONTEXT.md` | R (3 terms) | R (3) | R (3) | R (3) | R (3) | R (4) | R (5) | R (4) | R (4) | R (5) | **#658 and #656 must ratify the provenance/freshness vocabulary together before either writes UI copy** (#656 Q5). See §4. |
| `apps/web/lib/navigation/tree.ts` | E (`sections.firm.purpose` string) | E (new leaf) | — | — | E (new accounting leaf) | — | E (`/bank` sub-nav URL state) | — | — | — | **No single owner; four disjoint edits.** #921 (open) also edits the `vendorBindings` row — keep every edit one line. |
| `apps/web/components/work/work-detail.tsx` (1332 lines) | — | **E** (one row: "part of batch X") | — | — | **E** (the AC5 link block) | — | — | **E** (a Knowledge block in the Sources tab + drift banner) | — | — | **CONTESTED — three lanes.** **Recommendation: #658 owns the Sources tab's new content** (it is the only lane restructuring that tab); #636 and #655 each add **one row** to an existing block and neither restructures. Sequence #658 first if all three are in flight. |
| `apps/web/lib/parts/types.ts` + `catalog.ts` + `PartRenderer.tsx` | — | (only with a cut) | — | — | — | — | — | (only with a cut) | — | — | **NOBODY registers a part kind this wave** if `chatTurn_v21` is not cut — measured: #642 adds none (`gap-642`), #658 defers its `knowledge_unavailable`, #636's `intake_batch_accepted` is contract-only. **State this so no lane touches the parity pair.** |
| `apps/web/components/firm/client-workspace-overview.tsx` (203) | — | link only | — | — | — | link only | — | — | — | **O** | **#660 owns it** (inherits from closed #650). #636 and #656 confine themselves to one link each. **No other lane edits it — verify at brief time.** |
| `apps/web/components/firm/firm-home/*` | — | — | — | — | — | — | — | — | **O** | — | **#659 owns firm Home.** #635 declares the door a firm-home tile would read but **builds no tile**. |
| `apps/web/lib/firm/needs-you.ts` (303) | — | — | — | (would like a row) | — | — | **E?** (Q1's derived row) | — | **E** (link repoints) | — | **CONTESTED in principle, resolved by rule.** The 2026-09-15 rule 1.6 (no new row kind) still binds. **#657's Q1 candidate row and #651's depreciation-draft row both need a kind that does not exist.** Recommendation: **no new kind this wave**; #657 takes its Q1 recommendation (a derived, self-clearing row under an *existing* arm) or records a named residual, and #651 records a residual. #659 owns the two link repoints. |
| `apps/web/lib/documents/useUploadQueue.ts` | — | **E** (optional `batch_id` on the transport) | **O** (chat options, `origin:"chat"`, `sessionId`) | — | — | — | — | — | — | — | **CONTESTED.** **Recommendation: #642 owns the hook's signature; #636 adds the transport field only.** Sequence #642 first, or agree the signature up front. Neither touches `ComposerAttachmentControl`'s `IN_FLIGHT` state strings (`chat-parity-walk.spec.ts:209` pins the terminal word). |
| `apps/web/components/documents/*` (workbench, upload-panel, intake-receipts) | — | **O** | — | — | — | — | — | — | — | — | **#636 owns the documents workbench surfaces.** Open **#904** (a live defect on the same indicator) stays #904's. |
| `apps/web/components/bank/*` (`matching-section`, `bank-workbench`) | — | — | — | — | — | — | **O** | — | — | — | **#657 owns every bank surface.** #660 may add **one sentence** ("book cash ≠ statement balance") to `client-bank-summary.tsx` and restructures nothing. |
| `apps/web/components/registers/*` (FA panels, detail) | — | — | — | **O** | — | — | — | — | — | — | **#651 owns.** #656 owns `?tab=opening` inside the same workbench; the two tabs are disjoint. |
| `apps/web/components/accounting/accounting-hub.tsx` (88) | — | — | — | — | **O** | — | — | — | — | — | **#655 owns** (adds one primary act). |
| `apps/web/components/firm-admin/settings-panel.tsx` (90) | **O** | — | — | — | — | — | — | — | — | — | **#635 owns**; must keep the two pinned legacy cards (`firm-admin-pages-a11y.test.tsx:259-263`). |
| `apps/web/components/clara/ClaraThreadView.tsx` (658) | — | — | **O** | — | — | — | — | — | — | — | **#642 owns.** Open **#645** and **#839** rewrite the same file later — sequence #642 → #645. |
| `apps/web/components/registers/knowledge*` + `/settings/knowledge` | — | — | — | — | — | — | — | **O** | — | — | **#658 owns the C13 presentation changes.** #635 links and renders nothing. |
| `apps/web/lib/journals/api.ts` (`ENTRY_SELECT`) | — | — | — | — | **E** (back-link from the JE detail) | **E** (add `is_opening_balance` + a badge) | — | — | — | **E** (drilldown to `?entry=`) | **CONTESTED — three lanes.** **Recommendation: #655 owns the journals workbench for this wave** (it is the lane adding a new posting path); #656 contributes **exactly one field + one badge, coordinated with #655 or deferred as a named residual** (its own map already offers that fallback); #660 only *links* to the existing `?entry=` address and edits nothing. |
| `apps/web/e2e/home-board-walk.spec.ts` + `home-board-mock.mjs` | — | — | — | — | — | — | — | — | **E** (firm-board legs) | **E** (client-home money legs) | **CONTESTED.** Both maps are told "extend, do not mint a parallel pair". **Recommendation: both extend; #659 appends firm-board cells, #660 appends client-home cells; neither restructures the dispatch; the existing `get_client_work_pack` `debt` declaration (`e2e-fixture-ownership.test.ts:361`, #902) stays untouched.** Sequence #659's structural edits before #660's if both land in one window. |
| `apps/web/lib/work/use-client-work-pack.ts` / `WORK_STALE_AFTER_MS` | — | — | — | — | — | — | — | — | **import** | **import** | **No edit by anyone.** Both lanes import the 60 s constant by reference (the C77.12 one-owner rule); a source-reading cell keeps it a reference. |
| `apps/web/lib/firm/use-review-queue.ts` | — | — | — | — | — | — | — | — | **E** (focus/visibility re-read) | — | **#659 owns** — but the hook is shared by four surfaces and open **#903** has queued polish on the same file. #659 closes #903's items deliberately or states it did not. |
| `apps/web/lib/registers/client-register-list.tsx` / `AddClientControl` | — | — | — | — | — | — | — | — | **E?** (Q5 extraction) | — | **#659 decides (its Q5).** If extracted, the `#649` header comments move with the code — they are #649's AC1 evidence. **Never a second creation control** (#899). |
| `apps/web/package.json` (runtime deps) | — | — | **E?** (Q1: `@shadcn/react`) | — | — | — | **E?** (Q3: `combobox`/`popover` via `ui:add`) | — | — | **E** (Q6: `recharts` via `ui:add chart`) | **Up to THREE lanes add a production dependency.** **Recommendation: the lockfile is regenerated ONCE, by the integration worker, never per branch.** #642's `@shadcn/react` is the heaviest and is a Q1 owner call; #660's `recharts` and #657's `combobox`+`popover` both go through `apps/web/scripts/ui-add.mjs`'s guard after `--dry-run`. |

### 3.2 Database shared surfaces

| Surface | Tickets | Proposal |
|---|---|---|
| `clara.list_accounting_work` / `get_accounting_work_row` | #636, #657, #659 (+#905 open) | **FROZEN for this wave.** All three maps independently refuse it; #905 owns the receipt-dated widening. Any new fact goes in a sibling read. |
| `clara.list_review_queue` | #659 | **Frozen.** Seven splices over one whole replacement, four of them other lanes' tickets, each re-deriving prior markers. A new fact is a new door. |
| `clara._work_run_attempts` 101-id ceiling | #636, #659 | **Shared consumer.** Both label a **preview**, never a population; both must say so on the surface, as `0214:63-73` already does. |
| `clara.open_items` writer set | #655 | Moves ONE → TWO. #655 re-derives and re-pins; **no third writer this wave.** |
| `clara._subledger_on_approve` caller set (six, `0216:939-946`) | #655 (re-pins), #651 (adjacent) | **Nobody becomes a seventh caller.** #655's tail re-derives; #651's FA belt uses the existing `_approve_entry_core` path. |
| `clara.trial_balance_as_of` | #660 (new caller), #656 (semantics dependency) | **Call it, never change it.** `0057:1876-1904` carries two live assertions that fail the migration if it stops filtering to exactly `{approved}`. |
| `clara.get_knowledge_pack` / `list_client_knowledge` / `_knowledge_legacy_rows` | #658 | **None recut.** `_knowledge_legacy_rows` is pinned by pre-image sha in a live prestate (`0209:62-72`) — any change makes 0209 unreplayable. |
| `clara.document_capabilities` rows | #656 (+#782 open) | **#656 touches only `prior_gl` / `opening_balance_doc`; #782 touches only the invoice `limits`.** Ratify one `registry_version` bump between them, or sequence. **UPDATE that raises, never DELETE-then-INSERT** (#846). |
| `clara.compliance_watches` / `compliance_watch_events` | #659 (Q3) | **Verified ungranted to every application role.** A new SECURITY DEFINER read is the only way to surface a disposition; it grants nothing on either table. |
| `clara.knowledge_keys` | #658 | **Append-only on UPDATE *and* DELETE** (`0192:185-189`) — a new column can never be populated for the 13 seeded rows. Any per-key property is a side table in `0220:368`'s shape, with owner ratification first. |

### 3.3 RPC verbs whose e2e mocks two lanes would both answer

**Every one of these must be declared SHARED in `SHARED_RPC_VERBS` (`e2e-fixture-ownership.test.ts:1106`)
or the census reds.**

| Verb | Lanes that answer it | Existing answerer |
|---|---|---|
| `list_accounting_work`, `get_accounting_work_row`, `cancel_accounting_work` | #636's `intake-batch-mock.mjs`, #659's home-board legs | `work-list-mock.mjs` |
| `get_client_work_pack` | #659 and #660 both extend `home-board-mock.mjs` | `home-board-mock.mjs:135` (declared **`debt`**, #902 — leave the declaration untouched) |
| `list_review_queue` | #659 | shared with #635/#636 surfaces |
| `get_fixed_asset`, `get_depreciation_authority`, `list_depreciation_runs` | #651's `depreciation-mock.mjs` | `fixed-asset-mock.mjs:58-63` |
| `accept_legal_document`, `get_current_legal_documents` | #635's `firm-commercial-mock.mjs` | `fs4-checkout-mock.mjs` |
| `list_client_knowledge` | #658's `work-knowledge-mock.mjs` | `knowledge-mock.mjs` |
| `get_work_execution_trace` | #658 | likely a Work lane — **declare shared** |
| `document_intakes_visible`, `document_processing_tasks_visible` | #636 | `documents-intake-mock.mjs` |
| `caller_context` and the three member reads | every lane | **answered in `serve-built.mjs`'s CORE dispatcher** — `CORE_RELATION_HANDOVERS` (`:1311`) is the census that catches a lane taking one over |

**Exclusive to their lane (no sharing):** `get_firm_legal_standing`, `get_firm_commercial_state`,
`get_firm_ai_usage` (#635); `get_intake_batch`, `open_intake_batch`, `attach_intake_to_batch`,
`cancel_intake_batch` (#636); `preview_depreciation_run`, `run_depreciation_manual` (#651);
`admit_trade_invoice_work`, `get_trade_invoice` (#655); the five opening verbs + `POST
/api/opening/parse-targets` (#656); `get_bank_line_matching_context`, `match_bank_line`,
`unmatch_bank_match`, `list_unmatched_lines`, `list_bank_match_candidates` (#657);
`work_knowledge_drift` (#658); `get_firm_portfolio_pack`, `get_compliance_watch_disposition` (#659);
`get_client_financial_pack`, `propose_client_cash_accounts`, `publish_client_cash_account_set` (#660).
**`retrieve_knowledge` is NOT a mock verb** — no web read calls it (#658).

---

## 4 · Overlap boundaries

One table, deduplicated across the ten maps. **Disagreements are flagged in bold.**

| Pair | What is shared | Boundary each map proposed | Verdict |
|---|---|---|---|
| **#655 ↔ #669** (open) — AR/AP outstanding tiles | #655 births `invoice`/`bill` open items; #669 owns the aging/overdue display | #655: "adds no aging UI beyond ONE link from an invoice/bill Work to its open item; #669 owns the display" | **agree** — #669 is not in this wave |
| **#660 ↔ #669** (open) — the financial envelope | #669's AC3 says verbatim "use the same explicit financial selector/as-of/coverage and database snapshot/watermark contract as cash/profit" | #660: "**#660 is the definition owner; #669 is the consumer**"; #660 exports the envelope as a named module and puts no AR/AP in its door | **agree** |
| **#655 ↔ #660 ↔ #669** — *who owns the AR/AP outstanding tiles?* | three-way, and the orchestrator's brief named it | #655 births the items and renders **no** aging surface. #660 renders **cash and profit only** and forbids itself any AR/AP key. #669 (not in this wave) renders the tiles. | **AGREE — and there is no in-wave contest.** The apparent three-way is resolved because **#660's door carries no AR/AP field at all** and **#655 ships no aging UI.** Record this so a reviewer does not re-open it: *the AR/AP tiles are #669's, in a later wave, consuming #660's envelope shape and #655's items.* |
| **#657 ↔ #947 / #949 / #938** (all open) — *the settlement/candidate shape* | #949's AC3 says verbatim "whichever lands first defines the shape and the others reuse it rather than inventing a second", and enrols #938 by name | #657: "**my match is a SIBLING of that shape, not an instance of it**" — #947/#949 start from an **open liability** and their accept **posts a new journal** (`settle_from_bank_line`-shaped); #657 starts from a **statement line whose booking already exists** and its accept **posts nothing**. #657 **consumes** the derived self-clearing Needs-you row mechanics and the candidate-offering presentation contract; it **defines** neither | **DISAGREEMENT WITH A SIBLING TICKET, and #657 refuted it with evidence.** #949's sentence claims a family #938's own ACs do not support (#938 is a read over document-sourced entries inside a posted accrual occurrence, with two remedies and **no bank line, no candidate offering, no settlement**). **Orchestrator must rule:** is #657 bound by #949's precedence sentence? #657's recommendation is *no* — it consumes the roster, not the shape, and **builds no stored Work object** (its Q1). None of #938/#947/#949 is in this wave, so the ruling is cheap now and expensive later. |
| **#651 ↔ #932 / #933** (open) — depreciation policy source | #932 owns where particulars COME FROM (a versioned per-account policy stamped at birth by a recut of 0216's trigger); #933 owns Clara proposing particulars in the question | #651: "**policy SOURCE is #932; the run ENGINE, the schedule and the charge history are #651**"; #651 mints no account-level policy relation and never touches `upsert_fa_account_profile` or the birth trigger | **agree.** One real hazard: `change_class` (#651) and #932's policy-version stamp are **two new columns on the same `clara.fixed_assets` row**, and #932 recuts the 0216 birth trigger. Neither is in this wave — but if #932 lands concurrently, **one migration or strict number order with a re-pin, never two concurrent recuts of one body.** |
| **#658 ↔ #663** (open, blocked by #658) — re-evaluation | `PRD:123` defers automatic re-evaluation to **#658 AND #663** by name | #658: "**#658 reads and records; #663 writes and repairs**". #658 delivers the DETECTOR (the recorded read-set, the drift comparison, the human-visible marker); #663 delivers the ENGINE (deduplicated events, affected-concept update, index/wiki/OKF rebuild, experience accrual, the withdrawal cascade). **#658 builds no event, no consumer, no experience record and no wiki/OKF write** | **agree** — put the sentence in #658's brief verbatim |
| **#636 ↔ #664** (open) — the grouping object | **the wave's single most dangerous open overlap.** #664's AC1 is "persist one firm intake/request or **grouping identity** and idempotent client-attributed Works"; its AC4 is "**group cancellation** uses the same per-operation ordering and retains committed results" — the same object and the same cancel semantics, reached from chat | #636: "**#636 owns the grouping relation and its four doors; #664 becomes a second PRODUCER** that opens a batch with `origin='chat'`." Mitigation baked in: firm-scoped relation, **nullable child client** from day one, `origin` CHECK that already admits `'chat'` | **agree, conditionally.** #664 is not in this wave and has no gap map, so the boundary is #636's **proposal, not an agreement**. If they are built separately without it, the estate gets two batch tables and two cancel ceremonies. **Recommendation: write the three mitigations into #636's brief as binding.** |
| **#636 ↔ #641 / #650** (closed) — Work surfaces | the orchestrator's brief named "#636 vs Work surfaces" | #636: counts children **per parent batch**; #650 (closed) counts facets **per client**; #641 (closed) owns `/work` + `AccountingWorkList` + URL state. #636 adds **no** new needs-you row kind and **no** Work-list projection change | **agree — no live contest.** Both #641 and #650 are merged; #636 inherits their shapes and refuses their bodies. |
| **#642 ↔ #636 / #655 / #651 / #657 / #658** — `work-detail.tsx` and `PartRenderer` owners | the orchestrator's brief named it | #642: "**#636 owns the batch card's content; #642 owns where any card sits and how it is announced**"; #642 registers **no** part kind; `types.ts`/`catalog.ts` are additive-registration-only, one ticket per kind | **agree, and simpler than expected: with `chatTurn_v21` uncut, NOBODY registers a part kind this wave.** `work-detail.tsx` is the real contest (three lanes) and is resolved in §3.1 — **#658 owns the Sources tab; #636 and #655 add one row each.** |
| **#642 ↔ #645** (open, blocked by #642) — the stream reducer | both rewrite `ClaraThreadView.tsx` and `stream.ts` | #642: "**#642 owns the transcript surface and the stream reducer; #645 owns conversation lifecycle**". Explicitly **not** closed for #645: #642 builds nothing keyed on message segment/attempt identity, so #645 still owes its own AC4 mechanism | **agree.** #642 lands first (it is #645's blocker). |
| **#658 ↔ #642** — successor collision | the draft feared one | #658 (after re-deriving): "**no successor collision exists**" — #642's own map measures that it needs no `chatTurn_v21` | **agree; the earlier fear was refuted with evidence** (`gap-642` frozen-body verdict) |
| **#659 ↔ #660** — money at firm altitude | #659's AC1 and the dashboard ruling both forbid a cross-client monetary total | #659 renders **no money and installs no chart**; #660 owns every cents value | **agree** — #659 owes a `p659.portfolio.no_money` `prosrc` assertion, not a comment |
| **#659 ↔ #635** — `/settings/*` vs `/` | firm-altitude surfaces | #659 owns `/` and the portfolio read; #635 owns `/settings/*`. The `/settings/compliance` register is **#635's real estate**; #659 only links to it, and the C88.10 receipt (if delivered) is a **shared read both surfaces call** | **agree — but the shared read needs a name agreed before either writes it.** #659's Q3. |
| **#655 ↔ #656** — the posting core | #655 asked "check #656 first" | #656 measured and stated: "**the buildable slice recuts NO existing governed function**" | **AGREE, and the feared collision does not exist.** Verified in this pass. Record it so #655's brief does not budget a serialisation. |
| **#655 ↔ #657** | #655 births the open item; #657 allocates against it | #657: "#655 **births**; #657 **allocates**. #657 ships no settlement door, no allocation UI and no `settlement_allocation` flag" | **agree** |
| **#655 ↔ #636** | the producer of a child Work | #636: "**#636 owns the parent and the join; #655 owns document→Work admission.** #636 must NOT mint a child Work" | **agree** |
| **#656 ↔ #661** (open, blocked by #655) | opening AR/AP alignment | #656 delivers the **targets** side; #661 keeps every `opening_items` kind; #655 must not touch the opening ladder | **agree** |
| **#657 ↔ #671 / #675** (open) | the exception lane and reconciliation | #657 delivers only the *matching-side* face (the line stays pending, the governing exception is named, `remedy_calls` render as links); **#671 owns resolve-then-match; #675 owns certification** | **agree** |
| **#658 ↔ #659 / #660** — the freshness word set | three lanes need "coverage / freshness / unknown ≠ zero" | **The word set is already chosen by the code**: `ok` / `partial` / `unknown` / `denied` (`client-work-attention.tsx:65-71`, "The WORD is the state; the tone only agrees with it"). #658 keeps the frozen runtime envelope's `ok`/`unavailable` and exports **one** mapping (`faceStatusOf`); **no face and no DB column ever says `unavailable`** | **agree, and it is now a constraint, not a convention.** #658's `work_knowledge_reads.status` CHECK admits exactly the four and **refuses `unavailable`**; a cell proves it. **No lane builds a shared freshness LIBRARY this wave.** |
| **#656 ↔ #658** — provenance vocabulary | both must say "where did this fact come from" in one set of words | #656 Q5: "**ratify the four terms with the orchestrator before either ticket writes UI copy**"; whoever merges first writes them into `CONTEXT.md` | **agree — orchestrator must ratify the terms up front** (§5, Theme E) |
| **#651 ↔ #678** (open, blocked by #651) | the locked-period law for the whole FA lane | #651: "**#651 settles the locked-period law and #678 inherits it**" — write it as a shared helper `_fa_assert_period_open(p_client, p_date)` the disposal door can call unchanged | **agree** |
| **#660 ↔ #672** (open) — sealed report vs live pack | whether the two figures must reconcile | #660: "**they may legitimately diverge**" (a sealed artifact is minted at one watermark and never recomputed; this read recomputes every 30 s). #660 owns *not hiding the gap*; #672 owns the reconciliation rule | **agree, but explicitly UNVERIFIED** — no source rule requiring agreement was found. #660's position is argued, not asserted as house law. |
| **#657 ↔ #667 / #666 / #665** (open, all blocked by #657) | the matching chassis, the "no second cash effect" proof, the thirteen-rung retirement | #657 owns the shared chassis (line table, candidate surface, stable op key, residual display, refusal rendering) and publishes the no-new-cash **proof shape** as a reusable cell helper; it revives **no** scoring lane | **agree** |
| **#635 ↔ #655** — the word "invoice" | #635 is the FIRM's subscription invoice; #655 is a CLIENT's accounting document | #635: a **vocabulary boundary stated in `CONTEXT.md`** — unqualified "Invoice" = a client's accounting document; the firm's own billing document is "subscription invoice" and does not exist | **agree** |
| **#635 ↔ #636** — `firm_document_limits` | #636's CLR18 capacity refusals; `0196:42-43` names **#635** as the owner of the first per-firm override surface | #636 builds **no** limits editor and surfaces the refusal honestly; **#635 owns any editor** — and #635's own Q6 recommends not building one this wave either | **agree; both decline, and the residual is named twice.** |

---

## 5 · Consolidated questions

**59 questions were raised across the ten maps; 56 remain after dedup** (the "how many frozen
successors does this wave cut" question appears in four maps — #636 Q5, #651 Q5, #656 Q4, #658 Q4 —
and collapses to one wave-level ruling). Grouped by theme. **P** = product call, owner-overridable.
**T** = technical call the orchestrator can rule. Nothing below is decided here.

### Theme A — the frozen successors (1 question, the wave's biggest)

| # | Question (大白话 where the map gave one) | Recommendation | Cost of the alternative | Kind |
|---|---|---|---|---|
| **A1** | **这一波铸一个冻结后继还是两个？** `claraWork_v4` 和 `chatTurn_v20` 都已部署冻结；B3 那一半必须要 v5，B6 那一半要 v21。 | **Only `claraWork_v5`.** `chatTurn_v21`'s single hard claimant (#915) is blocked on a migration outside this wave; the four in-wave riders are contract-only or conditional; **#642 measured that it does not need one.** | **Not cutting v21 leaves B6's honesty defect live** — `catch { contextPack = null }` (`chatTurn.v10.impl.ts:136`) keeps making "the read failed" and "no context" one value in the lane a person actually talks to (user story 94, unclosed). Cutting it means a full freeze ceremony for **five stanzas**, of which #655's, #651's, #656's, #658's and #636's would all ride one cut. | **P** |

### Theme B — the accounting spine (6)

| # | Question | Recommendation | Cost of the alternative | Kind |
|---|---|---|---|---|
| **B1** (#655 Q5) | **这一波到底切不切那个过账核心？** 发票按定义要打在应收/应付控制科目上，而核心在 `0204:550-570` 明文拒绝。2026-09-15 §1.3 明令禁止重切。 | **切，但只开一条窄口子** — 仅当这件 Work 在 `clara.trade_invoices` 里有一行时才放行控制科目;其余逐字保留;尾部十七个 token 重新点名断言。 | 另起一个平行过账门 = 把重放、取消、外发授权、回执、证据链五套保证复制到第二个 ~600 行函数里。两份实现迟早漂移，而它们守的是同一条「一笔经济事实只落一次」的底线。 | **P** (it overturns a standing DECISIONS rule) |
| **B2** (#655 Q2) | 交易对方认不准时，当场拒绝并给候选，还是先建 Work 再停下来问？ | **在准入那一刻定对方** — `party_ambiguous` 拒绝并原样带出候选名单。`ask_question` 留给真正跑起来才发现的事。 | 让对方成为「运行中发现的事实」必须切 `claraWork_v5`（新 bundle 摘要、新 pin、新 prompt、新 apply step），而那是本波唯一一次 claraWork 切版预算，#933 已在排队。 | **T** |
| **B3** (#655 Q3) | 贷项（credit note）算不算这张票？ | **不做**;只做销售发票和供应商账单，对贷项形状**按名字拒绝**（`credit_shape_not_admitted`），拒绝文案指向 #666/#662。 | 加贷项就要同时处理「贷项冲抵哪一张发票」，会和 #662 在 `open_item_allocations` 上撞车。 | **P** |
| **B4** (#655 Q4) | 「到期日」谁说了算？ | **单据上说的优先，对方账期兜底，都没有就诚实记「无到期日」**，并把来源（`stated`/`counterparty_terms`/`absent`）存成 durable 字段。 | 继续只用对方账期 = 丢掉印在单据上的事实，AC1/AC6 的 due-date basis 只能记 `descoped`;只信单据 = 所有没印到期日的账单一律无到期日，账龄结构比今天更差。 | **P** |
| **B5** (#655 Q1) | 上传的发票这一波要不要也变成一件 Work？ | **不动上传车道**;交付一条「等价性证明」测试（老车道与新车道对同一经济事实产生相同控制科目变动、相同未结项种类、相同正负号和到期日）。上传改挂归 **#665**。 | 现在就改 = 同时（a）退役十三道 gate 而无回归样本，（b）在一波内改动两条已部署冻结工作流的触达面，（c）把 #665 全部范围吞进来。 | **P** |
| **B6** (#656 Q3) | 期初批准要不要自己的期间/锁定守卫？ | **先在 rig 上量一格，再决定** — 如果 `_period_wall` 已经挡住，就只补一条测试和一句文案;没挡住才动 `approve_opening_seed`（一次受多重 splice 的受钉函数重切，会把工作量推向 XL）。 | 现在就写那段迁移 = 在没有测量的前提下重切一个五处 splice 的门。 | **T (measure first)** |

### Theme C — the retrieval / knowledge lane (9)

| # | Question | Recommendation | Cost of the alternative | Kind |
|---|---|---|---|---|
| **C1** (#658 Q1) | **知识读不到，这笔活要不要停下来？** 今天照旧入账，是故意的（`knowledge-conflicts.mjs:93-98`）。 | **分层**:「核心」层（政策类、带权限含义的、五个遗留 key）读不到就停，settle 成可恢复失败，一分钱不入账;「其余」层降级成 `partial` 照旧跑。 | 全部不拦 = AC3 不成立，一条被撤回的客户例外可以静悄悄地不出现;全部都拦 = 一次网络抖动让一笔完全有依据的账入不进去。 | **P** |
| **C2** (#658 Q2) | 「你依据的东西变了」这道墙放在门里还是脸上？ | **放在脸上，再加一次 runtime 复查，不动 `answer_work_question`。** | 加进那扇门 = 重切一个被 0180/0184/0198/0200/0216 五个迁移碰过的门，且让「知识变了」和「问题版本变了」共用一个拒绝码 —— 人分不清是手慢还是依据变了。 | **T** |
| **C3** (#658 Q3) | 对话那条固定预载 `get_context_pack` 动不动？ | **一个字节都不动**;旁边新开一扇有界的门，留给将来的 v21。 | 全仓被切得最多的读函数（十一代、六个手术标记被后面三个迁移断言、两条尾部断言）。重切它 = 把本票放到 autoDraft、wake 和整条对话闭包的关键路径上。 | **T** |
| **C4** (#658 Q5) | 新的能力 id 怎么进那张服务器清单？ | 新开兄弟文件 `capability-registry-v2.mjs`（`layout-sandbox.mjs` 的先例）。 | 不开 = 两条新读的 trace 行带一个 v1 不认识的 id，`capability()` 返回 null，轨迹说「有人读了什么，但这台机器不知道那是什么」。 | **T** |
| **C5** (#658 Q6) | #658 到底写不写知识？ | **明确写成非目标** —— 不 capture、不 correct、不 promote、不积累经验、不写 wiki/OKF。 | 不写这一行 = 悄悄交付被推迟的范围，#663 会发现地基已被浇了一半。 | **T** (confirmation) |
| **C6** (#658 Q7) | **那扇「装配好的知识」新门，要不要也开给人？** | **照老板 2026-09-15 的 #783 裁定办，不开**;在尾部加一条正向断言（任何人类角色都不持有 EXECUTE，错误信息点名 #783）。C13 要的「哪一版、在不在期间内」用登记簿**今天已经返回的字段**就够。 | 要开，就是请老板**明确重开 #783** —— 不能由本票顺手夹带，夹带过去下一次就没人知道那条裁定还算不算数。 | **P** (re-opens a closed owner ruling) |
| **C7** (#658 Q8) | 「按用途读」这四个字，这一票到底做不做？ | **不做过滤，但让用途第一次真正有用** —— 写进 `work_knowledge_reads.purpose` 并参与漂移判断;深挖靠 `p_keys` 和两个新读工具。 | 现在做 = 开一张 `knowledge_key_purposes` 边表并请老板先批种子词表，而换来的分辨力今天是零（全估算只有两个知识包用途、13 个 key），**猜错了是永久的**（`knowledge_keys` append-only on UPDATE **和** DELETE）。 | **P** |
| **C8** (#657 Q1) | **模糊候选留下的那条「待办」，是一条算出来的行，还是一个存下来的对象？** | **#657 消费那个形状，不定义它** —— 一条算出来的、不存东西的、自己会消失的 Needs-you 行。**非目标**:不新增 purpose、不新建表、不发 v21。 | 存一个 Work 对象 = 要么新增 purpose（封闭 IN-list，动它要 recut posting core），要么新建一张表和它的全部竞态;L 跳 XL，且和 #947/#949 撞形状。 | **P** |
| **C9** (#657 Q6) | **票面第二条路径 B3（Work 列表/详情）这一票到底建不建？** | **不建那条写入路径，记成具名残留**,并给出两条正当出路。B3 的**页面已经建好了**（`work-detail.tsx:567-647`）;缺的是入口 —— `open_work_question` 只给 `clara_runtime`，且必须挂在一个**正在跑的**会计 Work 上。 | 真要满足字面 = 一个存储的 Work + 一个问题对象 + 一个能开它的入口。最省的是「Clara 在对话里开一个 work_question」，那就发 `chatTurn_v21`（B3 白送，工作量 XL）。**值得单独开一张票。** | **P** |

### Theme D — the money / dashboard lane (8)

| # | Question | Recommendation | Cost of the alternative | Kind |
|---|---|---|---|---|
| **D1** (#660 Q1) | **「哪些科目算现金」由谁来定？** 科目表上没有「现金类」;唯一结构化标记 `is_bank_account` 只在登记银行账户时盖上，零用现金永远盖不到;家法明写「永远不准用科目名字或编号去猜」（`0121:4749`）。 | 新建一张属于这张票的「现金科目集合」表和一扇 admin 发布门，形状照抄 0058 但**成员不筛 `is_active`**，每个成员写明「为什么算现金」。零用现金**必须由人加**。发布前首页显示「集合尚未确认」，**不显示 0**。 | 重切 `_metric_selector_account_ids` 放开 `is_active` = 改变全估算里**每一个**科目集合的成员语义，而 0058 的冻结校验只对着存好的 sha 重算、不重跑解析器 —— **这种漂移静默不报**;而且 `create_account_set_v1` 被 `0113:46` 用体 sha 钉过并派生出 agent 孪生体。 | **P** |
| **D2** (#660 Q7) | 「现金科目集合」这扇写入门要不要给 Clara 一个代理孪生体？ | **这一波不给** —— 但理由落在本票地基上，不借 D11:那条先例属于报表 delta 车道（`0059:251` 用断言隔开）;零用现金没有任何结构化依据可推。 | 现在就给 = 多交一个 `_for` 孪生体 + 唤醒包装 + 白名单 + receipt，并且要回答「Clara 凭什么判断某个停用科目算不算现金」—— 正是 D1 判定必须由人回答的事。 | **P** |
| **D3** (#660 Q2) | 期间选择器现在做，还是等壳层？ | 这一波只做**客户首页自己的**期间选择（最近 13 个月 + 本月至今），写进 `?period=`。 | 不做 = AC3「历史整月」和 AC4「历史月对比」两条**无法演示**;做全局壳层 = 和 #659/#642 抢同一块导航区域。 | **T** |
| **D4** (#660 Q3) | 钱的读取，viewer 能不能看？ | **viewer 门槛**,并用一条 cell 钉住「这扇门不返回任何 viewer 本来就 SELECT 不到的东西」（`0003:519-523` 把表级 SELECT 授给整个 `clara_authenticated`，RLS 只按事务所过滤）。 | 设成 bookkeeper = 首页出现「你看得见账簿却看不见汇总」的自相矛盾;比原始权限更严的门不增加安全。 | **T** |
| **D5** (#660 Q4) | **0120 以前关的年度，利润算错了，怎么办？** | **不修数据，但如实说** —— coverage 标 `partial`，原因 `closing_transfer_unmarked_history`，界面写「这个期间包含一次未标注的年结结转，利润可能偏差」;另开 issue 并**先在 hosted 上数出真实受影响行数**。 | 在本票改历史数据 = 在没数过范围的情况下动已过账的账本;直接按 `is_year_end` 单条件排除 = 把人工标记的年终**更正**也排掉，正是 `0016:45-49` 点名要避免的错误。 | **P** |
| **D6** (#660 Q5) | 「点数字追到账簿」落在哪？ | 读取门同时返回**按科目的构成行**,渲染成 Chart 必需的「可读表格降级」，每行链到**已经存在**的 `/journals?tab=posted&entry=<id>`;完整总账钻取记为残留等 #670。 | 现在造一个总账页面 = 把 #670 的核心切片拉进来，并在同一批读取门上相撞。 | **T** |
| **D7** (#660 Q6) | 为了画那两条线，值不值得给前端加 Recharts？ | **装**,通过 `ui:add chart` 走守卫脚本;图表只在客户端渲染，尊重 reduced-motion，**降级表永远渲染**;报告里记录打包体积增量。 | 不装 = AC5 的 "Use shadcn Chart" 直接不成立;自己手写 SVG = 仓库里养第二套图表实现，加上已冻结的 PDF 那套就是三套。 | **P** |
| **D8** (#659 Q2) | 组合表里要不要有「最近完成」这一列？ | **要，并照抄 #650 的诚实做法** —— 列出来，点击前先说清楚「按 Work 开始时间筛，不是按过账时间」的分歧，不碰 `list_accounting_work`。 | 现在就给它加 `p_receipt_since`/`p_receipt_until` = 把 #905 吃进本票，并且是这一波唯一一次共享函数重切。便宜出路:这一列干脆不做。 | **T** |

### Theme E — vocabulary, coverage and disclosure (6)

| # | Question | Recommendation | Cost of the alternative | Kind |
|---|---|---|---|---|
| **E1** (#659 Q1) | **入门中的客户，首页的「需要你」到底算不算他们？** 今天首页两个数字按两套人口在说话，页面一个字都没解释。 | **不改数据库，改口径说明** —— 新读门按「caller 能看见的每一个客户」统计 Work，信封写明 review-queue 排除了哪些状态，行上标 `coverage_reason='onboarding_client_excluded_from_queue'`。 | 拆掉 0017 那道墙 = 重切全所被切过七次的函数体，每次 splice 都会重新校验前面所有 marker —— 为了一个显示口径，把四条并行车道的标记全拖进这张票。 | **P** |
| **E2** (#659 Q3) | 「我已确认这条 SST 提醒」按下去之后，要不要看得见是谁、什么时候确认的？ | **做一扇新的窄读门** `get_compliance_watch_disposition(p_watch)`（SECURITY DEFINER，bookkeeper 起跳，**不给那两张表任何新授权**）;同时把「version」明确记为**这张表上没有的概念**,用 `state_before → state_after` 代替。 | 不做 = C88.10 只能记成 `descoped (authority)`;把 `acknowledged_at` 塞进 `list_review_queue` 的信封 = 为一个显示字段重切被切过七次的函数体。 | **P** |
| **E3** (#659 Q4) | 首页的「最近活动」换不换成带归属的那条 feed？ | **换**（`list_activity`，两扇门都是 bookkeeper 起跳，换过去不动权限），actor 用 `MemberName` + `isAgentActor`,并具名残留 **#861**,**不碰那道 kind 阶梯**。 | 不换 = AC2 的「attributable」只能补印 `actor`,首页和 `/activity` 从此对「最近发生了什么」有两套口径和两套链接能力。 | **T** |
| **E4** (#659 Q5) | 零客户时的「新增客户」，是搬一个控件还是放一条链接？ | **把 `AddClientControl` 抽成自己的模块，两页共用一个** —— 正是 #899 想要的形状。 | 只放链接 = 成本最低、零风险，但 AC4 只能算「能走到能创建的地方」。**绝不新做第二个控件。** | **T** |
| **E5** (#659 Q6) | 首页的注意力行要不要变成可以直接确认/推迟/结案？ | **维持 link-only**（裁-190 decision 3 已裁），把「preserved」理解为「这三扇门在事务所高度依然可达且未退化」。 | 加内联动作 = 推翻一条已裁的设计决定，并把同一扇治理门变成两个调用点。 | **P** |
| **E6** (#656 Q5) | 谁的词描述 provenance，住在哪？ | **在 `CONTEXT.md` 里一次定下四个词，#656 和 #658 共用，谁先合并谁写。** | 各写各的 = 两个页面对同一件事用两种说法，而 `CONTEXT.md` 是共享文件，最后还是要合一次。 | **T (ratify up front)** |

### Theme F — the opening / intake lanes (8)

| # | Question | Recommendation | Cost of the alternative | Kind |
|---|---|---|---|---|
| **F1** (#656 Q1) | **读试算表的程序接在哪:OCR 那一刻，还是一条新的分类后车道？** | **接在 OCR 那一刻（in-line）** —— 读器**必须**先正面认出一张平衡的试算表才返回东西，看到 `Code :` 区块头立刻返回 null;一条 `opening_tb.line` 证据行在没有期初登记簿绑定这份文件之前什么也不做。 | 走路由 = 三个带迁移号的 CHECK 名字必须现场从 `pg_constraint` 读出、一次事实路由器切正文（sha 钉 + 完整 ACL 尾断言）、一条新工作车道的领取/重试/终态 —— **把 L 变成 XL**,换来的只是「少跑几次纯计算」。 | **T** |
| **F2** (#656 Q2) | 一张期初文件有一行读不出来:整张拒绝（今天的法），还是收下能读的、其余留成子项？ | **保留整张拒绝，把 AC4 读成「拒绝必须点名」而不是「部分收下」。** | 允许部分收下 = 允许一张对不平的期初进入登记簿，而 `_assert_opening_tie` 反正会在批准时拒绝它 —— 「部分收下」买到的不是进度，是**一个假的进度条**。 | **P** |
| **F3** (#656 Q4) | Clara 这一波有没有期初入口？ | **只做直接界面，Clara 入口另开一张票** —— 期初是整套账里最不该让模型碰数字的地方;工具就算做也只能是「请读一下已经绑好的那份文件」。 | 不做 = C-39 只能记成 `partial` 并点名后续票。 | **P** |
| **F4** (#636 Q1) | **一批一百份，今天的额度正好卡在墙上。** 默认 100 份/1000 页，两个判断都是 `>` 才拒，所以 100 份 ≤1MB 的 PDF 刚好齐平;混进一份 2MB 的就被 CLR18 顶回去。 | **把「被额度挡住」做成批次的第一等状态**（`awaiting_capacity`），不改任何默认值;验收批次大小由 **C83.X2 的重新普查**决定，**按文件类型分开算**。 | 偷偷调高默认额度 = 在没人看的地方改了每一家事务所的容量策略，而且这张票不是容量策略的主人（`0196:42-43` 写明属于 #635）。 | **P** |
| **F5** (#636 Q1b) | **这道额度的「一天」是 UTC 的一天，不是 MYT 的一天** —— 额度在会计师的**上午八点**清零。 | (a) 写成具名残留并在界面上**照实说**「额度在每天早上 8:00 重置」;(b) 新增 cell `p636.batch.capacity_window_utc` 钉住当前行为;(c) 把「窗口改用 MYT」作为**新票**交给 #635。 | 在本票顺手把 `'utc'` 改成 `'Asia/Kuala_Lumpur'` = 让**每一家事务所**的额度窗口瞬间平移 8 小时，切换当天出现「用量算两次」或「额度凭空多出来」的窗口，而这张票既没有它的电池也没有运维沟通。 | **P** |
| **F6** (#636 Q2) | 「一个孩子」是一份上传、一份文件，还是一件 Work？ | **孩子 = 成员行**,按顺序最多背三个身份（上传永远有、文件保管后有、Work 受理后有）。 | 坚持「孩子就是 Work」= 未认领的那份**无法出现在批次里**,而那正是 C1 journey 明文要求可见的一类。 | **T** |
| **F7** (#636 Q3) | #636 要不要自己把文件变成 Work？ | **只做分组，不做生产者。** | 要 #636 保证「每份文件都有一件 Work」= 它必须自己造一个受理生产者，会和 #655/#666 在同一扇门上相撞，且批次里未认领的几份过不了「客户必须活跃」那一关。 | **T** |
| **F8** (#636 Q4) | 批次要不要出现在 Work 列表上（重切 `list_accounting_work`）？ | **这一波不动 Work 列表**;批次只活在 Documents 那一侧，Work 详情页加一行反向链接。 | 加 `p_batch` 参数会产生**重载** —— 这条门在 rig-meta cohort 和 `comment on function` 里都是按精确签名登记的;再叠上 #905 就是两张票同波重切一个被钉住的函数体。 | **T** |

### Theme G — the chat surface (4)

| # | Question | Recommendation | Cost of the alternative | Kind |
|---|---|---|---|---|
| **G1** (#642 Q1) | **那套原生聊天组件（Message / Scroller / Bubble / Attachment / Marker / Avatar），这一波装不装？** 六个一个都没装，装它们要多拉 `@shadcn/react`,还要把全产品被论证得最细的无障碍区域整个重写。 | **先证明行为，再迁移外观** —— 这一波交滚动锚定、跳到最新、断线、重复送出、实时工具状态，全部用自己的代码;组件迁移拆成一张跟 #645 共享的后续票。**这正是 appendix D 自己写的顺序。** | 同一波里既装六个组件、又拉一个新依赖、又重写活区 = 出事时分不清是新组件的锅还是新滚动逻辑的锅;而且 #645 紧接着要再改一次同一个文件。**这条决定 #642 是 XL 还是 L。** | **P** |
| **G2** (#642 Q2) | 「同一条指令」的身份怎么算、活多久？ | 钥匙**由内容算出来**（会话 + 层级 + 这句话 + 排好序的附件 id 哈希）;**不需要熬过刷新**。 | 要熬过刷新就得落库 = 一条迁移 + 一次 `begin_chat_turn` 重切，而那把函数被 `0105` 用 prosrc sha 钉死并带一道「运行时心跳新鲜就拒绝应用」的静默门，本波要专门安排停机窗口。**为一个契约上本就不承诺的场景，不值。** | **T** |
| **G3** (#642 Q3) | 工具状态给人看几档，用什么词？ | 交**四档**（准备中/进行中/完成/失败）+ 已落库 `refusal` 解析出的「已拒绝」;把 `queued` 记成**指名的残留**。词走 next-intl，工具原始名只作兜底（UI-32）。 | 真要一个 `queued` = 让 workflow 发一个新事件 = 一次 `chatTurn_v21` 切版，把本票从「零迁移零切版」变成占用本波唯一的切版名额。 | **P** |
| **G4** (#642 Q4) | 「来源链接」挂在哪？ | **链接由结果卡出，方块不出。** | 要在方块上挂链接，`tool_result` 这个 part 就得加字段 —— 那是落在冻结 `chatTurn.v10.prompt.ts` 里的 wire 形状，同样要一次切版。 | **T** |

### Theme H — the commercial / settings lane (6)

| # | Question | Recommendation | Cost of the alternative | Kind |
|---|---|---|---|---|
| **H1** (#635 Q4) | **C-01 / C-56:这一波要不要出现任何一个价钱？** 库里唯一一行套餐是 `Clara Beta / 0 分 / MYR / amounts_ruled = false` —— 数据库自己标明「价格未经裁定」。 | **一个价都不出现。** 界面写「Beta — 尚未定价」,把 `amounts_ruled` 做成渲染条件,业主哪天裁了价**不改一行代码**就会显示。 | 显示 `RM 0.00` 会让人以为永久免费;显示任何别的数字就是实现层替业主定价,正是 C-01/C-56 禁止的事。 | **P** |
| **H2** (#635 Q2) | AI 用量的「钱」用什么单位显示，月份按哪个时区切？ | token 数和调用次数永远显示;美元金额显示但明确标注「供应商计价（USD），非贵所账簿金额」,**绝不换算**;月份**按门返回的 UTC 窗口如实标注起止日期**。 | 换算成马币 = 在专业人士屏幕上发明一个汇率（法 18 / P-FX 明确不做）;只显示 token = 业主问「这个月烧了多少钱」时产品答不出来，而数据库其实答得出。 | **P** |
| **H3** (#635 Q1) | 事务所设置页要不要显示 Stripe 的客户号/订阅号？ | **不显示**;只显示「有/没有付款记录」「有/没有订阅」加日期。 | 显示了就必须回答「点它能干嘛」,否则是一个假控件;而真正能干的事（portal）需要一条新的 Stripe 集成。 | **T** |
| **H4** (#635 Q3) | 「接受新版法律条款」这个控件，用什么机制只给 owner 看？ | **由数据库自己回答** —— door 1 返回 `can_accept_for_firm` 布尔（用 `0195:905` 同一段成员谓词）,界面按布尔显示或隐藏。**不往 `capabilities.ts` 里加行。** | 为了塞进 `capabilities.ts` 而改那张表的类型 = 为一张票动一个被普查遍历的共享结构,而它今天只装得下一种谓词形状;收益只是「看起来统一」。（两种形状都已实测被现有普查拒绝。） | **T** |
| **H5** (#635 Q5) | 事务所身份资料（注册名、SSM、地址）要不要搬进这一页？ | **不搬，只放一条链接**（D10 仍然有效）。 | 搬过来会造出第二份事实副本，而 Wayfinder §5 原话就是「政策和计划分别深链接，避免副本」。 | **P** |
| **H6** (#635 Q6) | `firm_document_limits` 今天 viewer 就能读，要不要在这一波也加墙？ | **这一波不动它，但在面板注释里写明这是 affordance 而不是墙**,并单开一张票。 | 现在就改 = 本票多一次关系级改动 + 重新证明所有既有读方;不改 = AC4 在处理容量这一格上仍然只是 affordance，必须如实写进报告。 | **T** |

### Theme I — the depreciation lane (6)

| # | Question | Recommendation | Cost of the alternative | Kind |
|---|---|---|---|---|
| **I1** (#651 Q1) | **折旧到底要不要搬进「计划」那套机制？** AC5 写「register its occurrence adapter with the shared scheduler」,但 `CONTEXT.md:37` 白纸黑字写着「折旧和关账排程**不是**计划种类，按名拒绝」,数据库确实按名拒绝（`0223:590-594`）。 | **不搬。** 保留 0041 的授权和 `reconciler-fa.mjs`,改为把授权补齐成计划法律真正要求的两件东西:**指向一条可解析的指令**（`authority_ref`）和**一个起始窗口**（`authority_from`）。这样 AC5 真的成立，而 `CONTEXT.md` 一个字都不用改。 | 要重切 `accounting_plans.kind` 的 CHECK、`create_accounting_plan`、`_assert_plan_schedule`、`_plan_occurrence_basis`、`_plan_admit_occurrence`、`preview_accounting_plan` —— 正是 #653 上个月刚切过的那一整家;要改 `CONTEXT.md` 的 Accounting plan 条目（**推翻一条已写死的词汇**）;而且在 `reconciler-fa.mjs` 退役之前，**同一件事会有两个调度器同时在跑**。 | **P** |
| **I2** (#651 Q2) | 签了授权，要不要自动把过去补提出来？ | 给授权加 `authority_from`（默认签署当月一号，之后冻结）,皮带只往前跑;更早的期间只能走**显式补提**。 | 什么都不改 = 第一次签名就静默补提两年折旧（皮带每客户每轮最多连跑 24 期），而 C9 的配方明文写着 "A future schedule does not authorise historical catch-up"。 | **P** |
| **I3** (#651 Q3) | 「改折旧」分几种，这一波做几种？ | **记录三种分类，只实现「估计」一种**;`policy` 和 `error` 按名拒绝，并在拒绝里点名将来负责的票（#676）。 | 现在就做追溯重述 = 碰已关账期间和 key-3 重开路径，那是 #679/#680 的地盘。 | **P** |
| **I4** (#651 Q4) | 期间已关账，折旧要拒绝，还是按「已接受的处理方式」落到别处？ | **在跑的那扇门上拒绝**（新 CLR38 axis `period_closed`,refusal 里点名财年和重开路径）,一张草稿都不起;并**明确写下「挪期本波不做」**。 | 真做「挪期」要 owner 亲裁 + 回执新字段 + 报表口径确认，是一张独立的票。**今天的行为更糟**:跑会先起草成功，批准那一刻才被 CLR19 打回，而那张死草稿会**卡住这个客户之后所有期间的折旧**,要人手工撤 —— 而且**没有任何测试跑过这条路**。 | **P** |
| **I5** (#651 Q5) | Clara 这一侧怎么进来？ | **不开 `close_prep`**（registered-and-disabled，且 `0223:110-112` 裁过要开属于 `closePrep_v2`）;改为交付一扇**新名字**的 OBO 门 + 一份 `chatTurn_v21` 工具合同。**名字必须是新的**:`rig-meta.mjs:691-693` 是一条会执行的普查。 | 开 `close_prep` = 在一张折旧票里顺手上线一整条 agent 关账车道。 | **P** |
| **I6** (#651 Q6) | 预览用新读门，还是直接把内部函数授权出去？ | 新建 viewer 层 `preview_depreciation_run(p_client)` 包装门，**只授权包装门**。 | 授权 `_fa_compute_charges` 会让主普查变红，而且把「算一遍」和「按什么期间算」分了家，调用方就能自己指定期间 —— 恰恰是 `_fa_run_period_core:3457-3470` 花力气堵住的事。 | **T** |

### Theme J — the bank lane (4)

| # | Question | Recommendation | Cost of the alternative | Kind |
|---|---|---|---|---|
| **J1** (#657 Q2) | 操作钥匙（op_key）这一轮修到哪一层？今天有四套写法;网页端每点一次就现场生一把新钥匙，所以「响应丢了、再点一次」拿到的是「这行已被匹配」的拒绝，而不是原来那张收据。 | **只修两件，不做全库统一**:(a) 银行人工车道改成「一个决定一把钥匙」（`useDecisionKey` 的形状,**由意图元组哈希导出**,不是可变 ref）;(b) 把 `0129:1040` 的字符串切割换成**结构化绑定**。 | 全库统一四套写法要碰十几个模块和三条 runtime 车道，每一条都有自己的「新钥匙还是旧钥匙」语义（`members/doors.ts:58-66` 写明它**故意**每次新钥匙）。那是一张自己的票。 | **T** |
| **J2** (#657 Q3) | AC7 说的「confidence / basis」,是确定性的依据还是一个打分引擎？ | **显示确定性的依据，不显示分数** —— `{金额是否完全相等, 日期差几天, 对手方按 id 还是按名字对上, class_hint}`,外加 Clara 那套八项横杆的结果原样显示。**不引入任何 0–1 的置信度数字。** | 真造打分引擎 = 重开 `0129` 整条退役掉的银行规则机器，而 #665 的 AC3 正好在要求「退役冗余 classifier/gate」—— 两张票会互相拆台。 | **P** |
| **J3** (#657 Q4) | 候选那条读，人和 Clara 是改一份还是改两份？ | **同一个迁移里一起改，并在 tail 里加一条断言**,比对两处候选投影必须逐字段相同。**不在这一轮抽成共享 core**（要动 `_human_ctx` 的分层，是 0119 那种规模的手术）。 | 只改一份 = Clara 的匹配依据比人少一截，而且**没有任何东西会报错** —— 正是 `0040 FIX WAVE A5` 记录过的那一类漂移。 | **T** |
| **J4** (#657 Q5) | `/bank` 的六个子页改成 URL 可寻址，这张票做还是另开？ | **在这张票里一次把六个都改掉**,因为 AC14 是硬要求，而半改比不改更糟。这是一处共享编辑，要在 SYNTHESIS 里排序。 | 另开一张票 = #657 的 AC14 只能记成具名残留，而这条 AC 是每张票都带的那条验收线。 | **T** |

### Theme K — verification and evidence (4)

| # | Question | Recommendation | Cost of the alternative | Kind |
|---|---|---|---|---|
| **K1** (#642 AC-level) | 没有迁移的那张票（#642）怎么记？ | **在票的证据里和 SYNTHESIS 里明说**:门的幂等臂本来就存在，缺陷在数据库之上。 | 九张姐妹票都带一条迁移，一个假设对称的读者会去找一条不存在的迁移。 | **T** |
| **K2** (#651 / #659 / #636) | 三张地图的 design/safety 轴**从未被审过**（两个 lens 返回了字节相同的 CITATION 载荷）。 | **在写 brief 之前补一次 design pass**,至少覆盖 #651 的分类设计与 `authority_from` 回填、#659 的两人口问题与 `AddClientControl` 抽取、#636 的两表形状与 fan-out cancel。 | 「没有设计反对意见」不等于「没有缺陷」,只等于**没有审查者**。 | **T** |
| **K3** (#660 / #655) | 两条 trigger 的触发顺序、一次读七次 `trial_balance_as_of` 的查询计划，都是**推理，不是测量**。 | **在写 brief 之前在 rig 上各量一次。** | 把一条基于假设的触发顺序或一条没量过计划的重读写进 brief，等于把测量成本推给实现者，而他会在已经写完迁移之后才发现。 | **T** |
| **K4** (#656 / #657 / #651 / #655) | 六个 live body 是 splice，文件文本不是在世正文。 | 每一条 pin 都从**迁移过的 rig** 上 `pg_get_functiondef` / `sha256(prosrc)` 取，**绝不从文件转抄**。 | 从源码读出来的 pin 不会匹配，迁移当场拒绝应用 —— 上一波已经付过这个学费。 | **T** |

---

## 6 · Blueprint drift

Union of every drift item the ten maps recorded, deduplicated, with the exact line. **Recorded for the
#683 blueprint sync; never edited by implementation** (AGENTS.md step 4; owner ruling 2026-09-15).

| Pointer | Claim as written | Measured state | Raised by |
|---|---|---|---|
| `docs/ARCHITECTURE.md:182` | `workflowBodies` holds 51 ids | 53 | #642 |
| `docs/ARCHITECTURE.md:183`, `:293` | pins are `chatTurn → chatTurn_v19`, `claraWork → claraWork_v3` | registry pins **v20 / v4** (`registry.ts:173`, `:270`); `clientOnboarding → v5` is omitted entirely | #642, #651, #656, #658 |
| `docs/ARCHITECTURE.md §4` version-pin sentence | names only `chatTurn` / `claraWork` | already incomplete — `clientOnboarding` repointed to v5 last wave | #651 |
| `docs/ARCHITECTURE.md:232-235` **[已实现]** | "确认一张发票需要相应总账与 open item … 完整影响是事务边界" | **the Accounting Work lane cannot confirm an invoice at all**: the posting core refuses a control leg (`0204:550-570`) and reaches no subledger hook (`0216:30-38`). The atomicity described exists only on the legacy coding lane | #655 |
| `docs/ARCHITECTURE.md:207-211` **[已实现，hosted evidence pending]** | `opening-tb-cells.mjs` is the 真实 producer of `opening_tb.line` | the module exists and produces that shape, but **no production code calls it** — an honest reader takes §5.A to mean the path is live | #656 |
| `docs/ARCHITECTURE.md:287` + §7 metric-pack row | "报表 metric pack 与 chart／表格读同一定义" is the accepted target | the cash/profit half is discharged by #660; the AR/AP half is #669's | #660 |
| `docs/ARCHITECTURE.md:297-299` | the knowledge pack is runtime-only, humans read the raw register (#783/#785) | **the slice now complies.** The remaining drift is the opposite one: the sentence names only `get_knowledge_pack`, while the ruling's reasoning governs **every assembled pack-shaped read**. Widen from the function to the SHAPE | #658 |
| `docs/ARCHITECTURE.md:305-317` (`<!-- #764 -->`) | closes `[已实现，hosted evidence pending]` at `:316` | accurate; the phrase 本地已验证 appears at `:63`, `:388`, `:416`, `:535`, never inside this block | #642 |
| `docs/ARCHITECTURE.md:372` | "轨迹没有导出路由（by absence）" | true **of `clara.work_execution_traces` only**; a reader could take it for an estate-wide rule, which #635's usage CSV makes worth disambiguating | #635 |
| `docs/ARCHITECTURE.md:373-386` | the `work-trace.mjs` writer-side hardening is **binding on `claraWork_v4`** | **v4 shipped without it** (#847 open) | #658 |
| `docs/ARCHITECTURE.md:435-445` | a bundle digest covering each tool's JSON schema and declared dependencies is **binding on `claraWork_v4`** | `claraWork.v4.bundle.ts:53` still hashes `tools:{id, names}` only | #658 |
| `docs/ARCHITECTURE.md:524` §7 | "统一能力目录覆盖全部 lane … documents／bank／close 三条 lane 尚未纳入" | stays true after #657 — it does not enrol bank in the registry | #657 |
| `docs/ARCHITECTURE.md:529` | invoice line items are `planned` in the capability registry | unchanged by #655; "lines" (the journal basis) must never be read as "invoice line items" (#782) | #655 |
| `docs/ARCHITECTURE.md:530` §7 | 批次 Work（95/5）的完整 UI 已接受但未实现 | **goes stale on #636's merge** | #636 |
| `docs/ARCHITECTURE.md:535` §7 | 期初余额车道的凭据绑定方向仍剩一个方向未收口 | contradicted by §5.A's `<!-- #821 -->` block at `:276-283` (#821 CLOSED, `0213` closes that direction) — **on #656's own cross-reference, which a doc-sync ticket must confirm with the owner.** Separately, the row's right cell is wrapped in `<!-- #764 -->` and its body talks about the chat lane's `HookNotFound` semantics: **one row, two unrelated subjects, one ticket tag** | #656 |
| `docs/ARCHITECTURE.md` has **no §10** | `0195:21` and `0186:7` both cite "ARCHITECTURE §10" | the content lives in §5.E (`:358-372`) | #635 |
| `docs/ARCHITECTURE.md` §7 | the accepted-but-unimplemented table carries **no commercial row** | a reader of §7 alone cannot learn that billing is unbuilt | #635 |
| `docs/ARCHITECTURE.md §5 D` | the plan lane's law: explicit resolvable instruction, no back-fill, no global agentic switch | **the depreciation lane meets neither of the first two** while being the estate's strongest unattended poster. The blueprint never says depreciation is exempt; it simply does not mention it | #651 |
| `docs/ARCHITECTURE.md:134-135` | 「Firm workspace 可查询获准客户并组织批量工作」 | querying is true; **organising batch work at firm altitude does not exist** — no firm surface starts a batch | #659 |
| `docs/PRD.md:31` + §4 「工作追踪」 | the firm owner sees 待决/处理中/完成 in one portfolio view | **no per-client Work aggregate exists at firm altitude**; the PRD does not list it under 已接受、留待以后 either, so it currently reads as delivered | #659 |
| `docs/PRD.md:59` | Client Home financial summary = four summaries, three charts | #660 delivers two summaries and two charts — half-true after this ticket | #660 |
| `docs/PRD.md:65`, `:79` | 上传/对话/直接说明皆可;一件工作等于它相关的全部会计结果 | the first is true only for uploads; the second only off the Work lane | #655 |
| `docs/PRD.md:108` | 客户建立与期初导入 listed under 当前版本已交付 | the **导入** half is not reachable from a browser (`opening-seed-lifecycle.tsx:62` hardcodes `tieDocumentId: null`; no caller of the parse route) | #656 |
| `docs/PRD.md:109` | 固定资产与调整 / 银行对账 listed under 当前版本已交付 | #651 and #657 both **refine delivered scope** — the classification, the locked-period law and the match evidence are gaps inside something the blueprint calls delivered | #651, #657 |
| `docs/PRD.md:120` | 跨整批的聚合进度尚未交付（#636） | **goes stale on #636's merge** | #636 |
| `docs/PRD.md:121` | 对话车道断线后的完整恢复 listed under 已接受、留待以后, citing the now-closed #764 | #642's AC5 builds exactly that | #642 |
| `docs/PRD.md:123` | automatic re-evaluation deferred to **#658 and #663** | #658 builds the **detector**, not the engine — `PRD:123` will be **half** satisfied and needs a Wayfinder pass | #658 |
| `docs/PRD.md:126` | 商业运营（订阅、席位、容量、共享 AI 用量及账单）已接受，交付时点未定 | stays true — but the 共享 AI 用量 clause now has a real surface, and the orchestrator should decide whether the blueprint should say so | #635 |
| `docs/ARCHITECTURE.md` §7 SST row | 税务期间与 watch 的基础结构存在，beta Tax 未激活 | **not drift** — cited because it is the sentence that makes #659's AC6 "distinguish from inactive beta Tax" checkable | #659 |

---

## 7 · Risks and rig

### 7.1 Merge collisions, ranked

1. **`apps/web/package.json` + the lockfile — up to THREE lanes add a production dependency.** #660's
   `recharts` (via `ui:add chart`), #657's `combobox`+`popover` (via `ui:add`), #642's `@shadcn/react`
   (Q1, and the heaviest — a second component runtime beside `@base-ui/react` in a
   Cloudflare-Workers-built bundle). **The lockfile is regenerated ONCE, by the integration worker.**
   #660 additionally owes a measured bundle-size delta.
2. **`apps/web/components/work/work-detail.tsx` — three lanes** (#636 one row, #655 one link block,
   #658 a Sources-tab block plus a drift banner). Resolved in §3.1 by owner + sequence; unresolved it
   is a three-way conflict in a 1332-line file.
3. **`apps/web/e2e/home-board-walk.spec.ts` + `home-board-mock.mjs` — two lanes told to extend one
   pair** (#659, #660). Append handlers; never restructure the dispatch; leave #902's `debt`
   declaration alone.
4. **`apps/web/lib/journals/api.ts` `ENTRY_SELECT` — three lanes** (#655 owner, #656 one field + one
   badge, #660 link-only).
5. **`apps/web/messages/en.json` — #635 REPLACES `Settings.unbuiltNote`** while nine lanes add keys.
   A replacement is the collision-prone shape; land it early, in one commit, and say so.
6. **`apps/web/lib/documents/useUploadQueue.ts` — #642 owns the signature, #636 adds a transport
   field.** Sequence #642 first or agree the signature up front.
7. **`packages/db/tests/rig-meta.mjs` — nine lanes add a cohort.** The `];` repair is the known hazard.
8. **`packages/db/package.json` gate chain — nine lanes.** Migration order, **not** alphabetical.
9. **`.github/actions/db-live-gates/action.yml` — nine lanes**, per-line `\` continuations, each
   ticket's own stated step order.
10. **`apps/web/e2e/e2e-fixture-ownership.test.ts` — nine lanes across four structures**, and **nine
    shared verbs** (§3.3) that must be declared shared or the census reds against a sibling mock.
11. **`CONTEXT.md` — ten lanes, ~37 new terms.** #656 and #658 must ratify the provenance/freshness
    four-term set **before** either writes UI copy.
12. **`apps/web/lib/navigation/tree.ts` — four lanes plus open #921** (the `vendorBindings` row).
    Every edit one line at the sorted position.

### 7.2 Census suites that will red — union across the wave

* **`apps/web`**: `tests/sql-oracle.test.ts` (every new SQL function enters its corpus — nine lanes),
  `tests/parity-holes.test.ts`, `tests/firm-scope-surfaces.test.ts`,
  `tests/firm-scope-fourth-entrance.test.ts` (any new file under `app/**`, any changed href — put
  components under `components/firm/`, the `(firm)/documents` precedent),
  `e2e/e2e-fixture-ownership.test.ts` (every new mock verb), `lib/navigation/tree.test.ts` (any href
  change), `lib/firm/capabilities.test.ts:134-166` (**#635 only** — a new floor row's cited line must
  sit inside a surviving body containing `clara._human_ctx(clara.role_rank('admin'))` verbatim),
  `components/firm-admin/firm-admin-pages-a11y.test.tsx:97` (**#635 only** — asserts the exact
  `Settings.unbuiltNote` sentence; replacing the copy reds it, update in the same commit with the
  reason), `tests/focus-ring-contract.test.ts` (any new `ring-ring/50` carrier — #642's named trap),
  `check-token-contrast` (a new chip tone or ground is a new PAIR_SPEC — #642).
* **`packages/db`**: `operation-census.test.mjs` and `rig-isolation.test.mjs` (**nine lanes** — any
  slice adding SQL functions must run both, without the reset flags), `checkout-gate-c3.test.mjs`'s
  `c3.53` money-store roster (**#635** — `get_firm_commercial_state` reads
  `firm_registration_payments` and therefore joins that roster; widen it in the same branch with the
  reason beside the name, exactly as `0164:39-47` did), `f-a9-usage-reshape.test.mjs` (**#635** — the
  ACL cell `:671-679` and eight owner-persona behaviour cells should stay green; **run it first
  anyway — if a cell reds, the recut is wrong, not the cell**), `f-a9-pr-1b.test.mjs:215` (a
  whole-catalog `prosrc` scan for three dropped `firm_limits` columns — #635's recut body must name
  none), `x37-wave-c-a-subledger.test.mjs`'s `x37.aa` writer assertions (**#655** — re-read before
  landing), `fixed-asset-acquisition.test.mjs:242` `p639.census.approve_paths` (**#655** — its
  `!sub.includes("_record_journal_entry_core")` assertion stays true, but a reader will expect the new
  writer named somewhere), `0044:2916-2930`'s creation-key census and `0044:2955-2965`'s
  `_wdb_born_in_booking_act` call-count (**#657** — a new read that echoes
  `settlement_entry_id`/`charge_entry_id`/`adjustment_entry_ids` must be adjudicated, not merely
  compiled), `0040:7425-7428`'s `completing_recon` single-writer assertion (**#657**),
  `0040:6808-6842`'s per-arity lock-order `prosrc` scans plus `x38.aa` (**#657**),
  `0103:1055-1070`'s single-`pg_proc`-row census (**every lane** — new verb names, never defaulted
  parameters), `0042:5385` / `0044:6353-6356`'s name/verb rosters (**#656** — any new granted door
  name), `packages/db/deploy/0191-field-path-census.sql` and
  `document-regions-unique-field-path.test.mjs` (**#656**), `kp.01`'s ten-entry `deepEqual`
  (**nobody** — no lane mints a knowledge key this wave; keep it that way).
* **Runtime / freeze**: `node scripts/check-frozen-workflows.mjs` and
  `node packages/runtime/scripts/check-parts-parity.mjs` — expected **no-ops** for #635, #659, #660,
  #657; **run them anyway and report the counts**, because a green there is the evidence for each
  "no successor" verdict. #636 must run `check-frozen-workflows.mjs` on its rig **before** relying on
  "`lib/intake.mjs` is editable" — its closure measurement came from a scratchpad resolver, not from
  the harness.

### 7.3 The XL tickets, and why

| Ticket | Effort | Why |
|---|---|---|
| **#655** | **XL** | (1) a **sixth full recut of a ~610-line governed posting core** with seventeen pinned refusal tokens and a measured pre-image sha — the wave's heaviest single artefact; (2) a **new lane-agnostic birth instrument** whose firing-order premise must be measured on a rig, plus two stale catalog censuses to re-derive; (3) a new typed business object with an append-only ledger, three-plus doors and their floors, in the three-file battery shape with its own gate and cohort; (4) a complete new C3 surface with twelve required states, a Playwright walk and mock, plus a `chatTurn_v21` contract. |
| **#658** | **XL** | Five new SECURITY DEFINER doors, a FORCE-RLS append-only relation with a derive-not-declare writer, a negative-grant assertion and a no-recut census; **the wave's one frozen successor** plus a capability-registry sibling and a written-but-uncut v21 contract; two runtime modules; three web surfaces with the full state ladder; a new battery, a new World e2e, a new walk and mock. It **inherits two obligations the blueprint made binding on v4** (#847, `ARCHITECTURE:443`) and unblocks four tickets (#663, #664, #665, #673). |
| **#660** | **XL** | Six independent unbuilt things, one of them a product decision: a governed versioned cash-account-set model plus its authoring door (the existing one **provably cannot express the membership**, `0058:344`, and is a recorded retirement candidate); a new versioned read with a six-field envelope, two six-point series and three comparison edge rules; a **period selector that does not exist anywhere in the repo**; a **new npm dependency** on a Workers-built app with a mandatory table fallback; drilldowns with **no existing destination**; golden fixtures across seven accounting boundaries. |
| **#651** | **XL** | A classification (recut validator + recut revision door + two columns + a CHECK), a locked-period assertion spliced into two shared FA oracles **whose recut moves a third, parked, agent caller**, three new authority columns with a resolution rule, one granted read, one OBO machine door with its own cohort and gate — plus two substantial web surfaces with the full responsive/a11y pass, a 13-cell battery, a new walk with its own mock, and a `chatTurn_v21` contract. |
| **#636** | **XL** (clean L fallback) | A two-table relation family with an append-only ledger child, four idempotent doors, one derived read in the 0214 envelope shape, RLS and a tail census; **plus** a fan-out cancellation correct against all five arms of an already-reviewed cancel door; **plus** a non-frozen runtime module, two routes and a reconciler arm; **plus** a new web surface with the full eight-state taxonomy; **plus** a battery, a **new real-World CI leg**, a cross-firm poison leg, a walk and mock; **plus** two historical rows owing new cells and one owing a **discovery** that sets the battery's own numbers. **L fallback: ship the parent, the join, the read and the card; split the cancellation fan-out into a ticket shared with #664.** |
| **#642** | **XL if G1 rules the native component family IN; L if not** | XL = six `ui:add` installs, a new production dependency, and a full rewrite of the product's **most carefully argued accessibility region** (one `role="log"`, five mutually exclusive `role="status"` siblings, an executable zero-nested-live-regions invariant with its own vacuity control) — **on top of** the intent key, the live tool fold, the scope band, the `revoked` arm and four new browser legs. **L = prove the behaviour first, migrate the appearance later**, which is appendix D's own stated order. |
| **#657** | **L** (XL on three conditions) | L because: one additive migration, **no frozen ceremony and no runtime module**. XL if **C8** rules for a stored bank Work object, or **C9** rules B3's write path in scope (a `chatTurn_v21` carrying `open_bank_line_question`), or **J2** reads "basis" as a scoring lane. |
| **#656** | **L** (XL under the routed option, **F1**) | L because the DB lane and the producer are both already built and tested. XL adds three CHECK widenings whose names must be read from `pg_constraint`, a facts-router splice with a `prosrc` pin and a full ACL tail, and a new worker lane with claim/retry/terminal semantics. |
| **#635** | **L** | Two new governed doors **plus one governed recut with a rig-measured pre-image sha**, a full eight-state matrix across five cards, a browser walk with a publish-a-new-version leg and a mid-session-demotion leg, a ~24-cell battery, and three shared-file censuses that red on sight. Not XL: no relation created, altered or dropped; no successor; no runtime change; no Workflow leg. |
| **#659** | **L** (XL if **E2** and **E3** both land) | One additive SECURITY INVOKER read (no recut, no pin, no overload, no table, no trigger) plus a page rewrite carrying URL state, a paged per-client table, six distinct states, a refresh machine ported by reference, two link repoints and a zero-client creation entrance. XL = the compliance-disposition door **and** the `list_activity` swap in the same slice. |

### 7.4 What the orchestrator must MEASURE on a rig before writing a brief

Everything below is reasoned from source text in the maps and is **unverified by execution**. Each one
changes what the brief says, not merely what the report claims.

1. **Every `prosrc` pin, without exception.** Six live bodies in this wave's blast radius are
   demonstrably splices: `_record_journal_entry_core` (five prior copies), `_match_bank_line_core`
   (`0121:1863`), `_agent_verify_inputs_digest` (dropped and re-created at `0129:1038`),
   `set_client_fy_end` (0042 §S5.12 + 0045 §S5.12-b2), `_fa_asset_json` (0042 ×2 + 0216),
   `get_context_pack` (eleven generations). **#655, #657, #651 and #656 all owe measured pins.**
2. **#655 — the deferred-trigger firing order on `clara.journal_entries`.** Alphabetical-by-name on
   PG 17.11 is 0216's measurement; #655 must reproduce it with its own trigger name in place.
3. **#655 — the birth trigger's receipt join.** That
   `o.effects->>'entry_id' = new.id::text` is satisfiable at the moment the deferred queue runs
   follows from the transaction boundary (`0204:652` approve → `0204:671` receipt → commit) but was
   **not proven**. The named fallback is `accounting_work.result->>'entry_id'` (`0204:735`).
4. **#651 — whether `_fa_validate_particulars`' closed key set can be widened without redding a
   frozen-closure test.** Its key set is mirrored in the **frozen** `lib/fixed-asset-acquisition.ts:54-57`
   and asserted by `p639.particulars.axes` / `p639.question.dependent`. If it reds, the classification
   must move to a separate argument of a NEW verb — **measure before writing the migration.**
5. **#651 — whether a closed-period depreciation draft really blocks the client's queue.** Read off
   `0041:1916-1922` + `0056:664-698`; **not reproduced**, and the x41 FA world builds **no**
   `clara.fiscal_years` row at all, so no existing cell can reach it. This is the single most
   important thing to prove red-first.
6. **#656 — the three CHECK constraint names** (`ck_processing_task_lane_*`,
   `ck_processing_task_lane_engine_*`, `ck_document_extractions_engine_kind_*`). They carry migration
   numbers; a migration that drops a transcribed name fails on apply. Read `pg_constraint`.
7. **#656 — the authoritative-extraction race.** `_tf_set_authoritative_extraction_0017` is
   **kind-blind**; whether a re-classification can take the pointer back from a producer run is
   unverified. If it can, `p656.tie.stale_extraction` reds and **F1's answer flips.**
8. **#656 — whether `_period_wall` already refuses an opening draft whose `as_of` is in a locked
   period.** **B6 exists because of it.** Do not write that migration section before the measurement.
9. **#660 — `trial_balance_as_of`'s query plan.** Up to **seven** evaluations per pack call on a
   SECURITY INVOKER read over `journal_entries × journal_lines × coa_accounts`, polled every 30 s.
   The seven-call design may be wrong for that reason alone; consider one pass over the lines.
10. **#660 — Recharts' bundle cost under `@opennextjs/cloudflare`** and how close the Worker size
    ceiling is.
11. **#660 — how many approved close entries carry `closing_transfer=false`** (D5's scope) and
    **whether any client in any environment has a published `account_set` today** (D1's scope). Both
    are hosted counts.
12. **#636 — the capacity arithmetic.** "100 ≤1MB PDFs sit flush on both ceilings" and "the ceiling
    resets at 08:00 MYT" both follow from function text; **nothing was executed.** Re-derive on a
    migrated rig **before** either is written into a test or into UI copy. C83.X2's inventory
    re-derivation is **prerequisite work, not documentation work.**
13. **#636 — the frozen closure.** Its 296-file measurement came from a scratchpad resolver, not from
    `scripts/check-frozen-workflows.mjs`. **Re-run the harness on the rig before relying on
    "`lib/intake.mjs` is editable".**
14. **#642 — capture a real chunk trace before writing the live tool fold.** That the AI SDK
    `fullStream` emits `tool-input-start` / `tool-call` / `tool-result` / `tool-error` for this model
    and provider is from the SDK's documented vocabulary, **not measured**. What *is* measured is that
    every part is forwarded unfiltered. **Capture the trace; do not write the fold from the docs.**
15. **#642 / #657 — whether the shadcn primitives resolve for this project's `base-nova` style.**
    `components.json:24` has `"registries": {}`, appendix D records a CLI failure on that exact
    configuration, and the `shadcn` MCP server **failed to connect this session**. This is a
    prerequisite for G1 and J-adjacent work, not a detail.
16. **#635 — out-of-repo consumers of `get_llm_usage_summary`.** The zero-caller grep covers this
    repository only. If a hosted tool or ops script calls it as a below-admin identity, the recut
    refuses it. Ask the owner; it cannot be measured from here.
17. **#651 — `authority_from`'s backfill effect.** Stamping `date_trunc('month', signed_at)` onto live
    rows silently stops back-fill for clients mid-catch-up. Beta data is test data (memory 2026-09),
    but **the hosted count must be read before the migration and reported — not assumed zero.**
18. **#658 — the core tier's real size on a live client.** The five legacy-carried keys' hosted values
    are unknown; a required-read terminal over a core that is larger than expected can stop legitimate
    accounting.

### 7.5 Standing risks the whole wave inherits

1. **Three maps have had ONE lens of review, not two.** #651, #659 and #636 each received two
   refutation payloads that were **byte-identical and both labelled `CITATION`**. Their
   **design/safety axis is unreviewed**: nothing has attacked #651's classification placement or the
   `authority_from` backfill, #659's two-populations problem or the `AddClientControl` extraction, or
   #636's two-table shape and fan-out cancel. **Absence of a design objection there is absence of a
   reviewer, not absence of a defect.** See K2.
2. **The `claraWork_v5` cut carries up to SIX tickets' contracts and only one is written.** Minting it
   twice repeats the freeze ceremony and opens a window in which two lanes disagree; minting it once
   means the integrator reconciles five stanzas that do not exist. **Budget it as integration work.**
3. **The stranded-body gate refuses World startup database-wide** on any non-terminal run parked on a
   body the image no longer exports. Keep v1…v4 and v1…v20 exported and in `workflowBodies` /
   `WORKFLOW_BODY_IDS`; run the two-build cutover legs before the ceremony.
4. **IMPORT-ESCAPE locks every basis module the moment the successor imports it** (§1.6). Cut after
   the review round settles the schemas, or six modules freeze with whatever shape they happened to
   have. This has sprung once already.
5. **`lib/intake.mjs` is one manifest line from freezing** via five `*.services.mjs` reverse importers.
   If any wave ever marks one `deployed:true`, #636's runtime glue becomes frozen retroactively.
6. **Two lanes could accidentally consolidate money.** #659's portfolio table is the easiest place in
   the product to `reduce` over rows into a false cross-client total; #660's pack is the only place a
   statement balance could be substituted for book cash. Both mitigate with a **`prosrc` tail
   assertion plus a cell**, never a comment.
7. **No hosted evidence exists for anything in this wave.** Every report writes "hosted evidence
   pending"; no worker claims otherwise.
8. **A skipped frontier-gated battery is not evidence.** New batteries call through `humanQuery`
   personas (least-privileged roles), never `rootQuery` for the assertion under test.
9. **Known Windows-only reds that must NOT be "fixed"**: #707 (x56-rest-c shells out to grep), #693
   (EICAR fixture quarantined by Defender), no `pg_dump` on PATH (four runtime files),
   `thread-live-clarify.test.tsx`'s whole-suite load flake, `rig-isolation.test.mjs` T10b after a
   Workflow World bootstrap (#866). `next build` may panic `0xc0000142` under ten-lane contention —
   retry once (#869).
10. **Rig facts**: ten dedicated PG17 clusters on ports 55701–55710, all at 219/`0224_preview_invite`,
    PG 17.11, 18 `clara%` roles each. **Never run two from-scratch chains on one cluster** (0154 pins
    the cluster-wide role count). Never set `CLARA_RIG_ALLOW_RESET=1` or
    `CLARA_RIG_ALLOW_ROLE_SWEEP=1`. Playwright triples are already allocated in `RIG.md`. Free disk
    on C: after all ten rigs is **67 GB**; Windows free RAM during ten parallel installs is ~8 GB of
    32 — **the orchestrator caps concurrent browser stages.**
