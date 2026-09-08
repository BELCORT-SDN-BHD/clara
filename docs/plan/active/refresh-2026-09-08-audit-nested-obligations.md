# Historical nested obligations recovered for the refresh audit

Checked 2026-09-09 MYT. This is an **input register**, not a claim that any item is a current defect,
implemented, deployed, or still product-correct. Its purpose is to unfold the fifteen umbrella rows
requested by `refresh-2026-09-08-audit-register.md` so `/to-spec` can retain or dispose of each named
obligation deliberately.

## Authority and method

Current product authority comes from `docs/PRD.md`,
`docs/plan/active/refresh-2026-09-08-product-spec.md`, and the accepted scopes in issues 601, 602 and
603. In particular:

- Accounting Work is agentic by default within current authority; ordinary work does not regain an
  opt-in or second-person ceremony. Work, conversation and current client attribution have distinct
  lifecycles.
- A business operation owns its accounting object, journal effect, related subledger/allocation state,
  stable operation identity and receipt atomically. Current authority, period, amount and evidence
  invariants remain deterministic walls.
- Identity, aliases, client facts and learned context belong to one Client KB with provenance,
  correction/retraction and impact re-evaluation. A vendor-binding ritual is not a prerequisite for
  ordinary work.
- Statutory facts and rates are current-source inputs. Numbers or defaults in the deleted planning
  corpus are not revived here.

The original umbrella anchors are the current register rows C-08, C-13, C-33, C-34, C-48, C-51,
C-54, C-55, C-77, C-79, C-81, C-82, C-83, C-86 and C-88. Historical wording was read with
`git show fc39c361:<path>` from:

- `docs/plan/active/beta-handover-2026-09-04.md:227,232`
- `docs/plan/active/beta-handover-2026-09-04-part2.md:125-143,233-258`
- `docs/plan/active/beta-handover-2026-09-04-part3.md:24-98`
- `docs/plan/active/harness-audit-2026-08-23.md:58-109`
- the directly referenced owner-batch/design records where an umbrella did not name its leaves.

Codebase-memory reported the current planning paths as indexed but metadata-changed, so current files
were read directly. Historical files are evidence of a former obligation only; their instructions,
status labels, counts, live-estate measurements and recommendations have no present authority.

Disposition vocabulary: **preserve** means the requirement still matches current product direction;
**reframe** means retain the underlying risk while replacing the old workflow/ceremony;
**discovery** means current implementation status must be established before opening a fix;
**duplicate** points to another recovered leaf or current register row and must not create a second
spec item.

The final column also contains related obligations. **Only explicitly duplicate rows collapse
into one obligation**; grant/revoke, add/retire, domain-specific error paths and infrastructure
versus product acceptance stay separately testable even when they share an implementation.
Tax, foreign currency, statutory calendar and commercial rows follow the current PRD release
boundaries. Recovering an old OQ does not activate a future capability or reopen a settled scope.

## C-08 · 裁-176 ports/fixes

The handover calls this “ten”, but its sentence contains eleven independently verifiable leaves once
the adjustment surface and QueueRowView semantics are separated. The old count is not used as an
acceptance oracle.

| Leaf | Recoverable obligation and historical anchor | Current family / disposition | Next validation | Related / duplicate |
|---|---|---|---|---|
| C08.1 | Adjustment-template panel (`beta-handover...md:227`) | accounting UI · reframe | Locate the current adjustment route and prove a user can inspect/select an applicable template with current authority and period feedback. | C-39 adjustment-template surface |
| C08.2 | Adjustment model, including the all-zero “balanced” case (`:227`) | accounting correctness · preserve | Test that a zero-value proposal is not treated as meaningful merely because debits equal credits; identify the current validation owner. | Issue 602 invariant family |
| C08.3 | `CounterpartyPicker` port (`:227`) | Client KB / accounting UI · reframe | Find current identity selection/clarification surfaces; verify ambiguity stays pending and selection uses current KB identity, without mandatory binding. | C-41 / issue 603 |
| C08.4 | `OpeningCeremony` step 1 and mixed-batch rule (`:227`) | opening balances · reframe | Read the latest opening-balance operation and UI; test mixed supported/unsupported batch handling and provenance, not old migration `0018` wording. | C-30 |
| C08.5 | `QueueRowView` direction-aware noun (`:227`) | Work UI · preserve | Verify debit/credit or payable/receivable direction produces the correct domain noun in current work rows. | — |
| C08.6 | `QueueRowView` severity conveyed by colour **and shape** (`:227`) | accessibility · preserve | Inspect current component and run an accessible-state check that does not depend on colour alone. | C77.4 |
| C08.7 | `SeedingProposalRow` port (`:227`) | opening/COA UI · discovery | Locate its successor and prove proposal, evidence, refusal and applied receipt states; do not restore a deleted component by name. | C-30 / C-53 |
| C08.8 | `adjustmentApi` port (`:227`) | accounting operation · discovery | Trace current direct-UI and agent callers to the same versioned adjustment business operation and receipt. | Issue 602 |
| C08.9 | `advancesApi`; historic caller supplied `businessToday()` where DB was said to own date (`:227`) | staff advances · discovery | Inspect latest signature/body and caller. Test timezone/period behavior before deciding whether any supplied date is a defect. | — |
| C08.10 | `agingApi` envelope-shape guard (`:227`) | reports · preserve | Feed current success/refusal/stale envelopes through the aging caller and require typed failure rather than malformed rendering. | C-15 wire-boundary family |
| C08.11 | Rebuild `dbSeamCensus`, historically labelled infrastructure (`:227`) | quality · reframe | Define current callable/caller inventory and generate a deterministic census over the present public-operation boundary. | C-76 quality tooling |

## C-13 · archived backend queue

These are six resume-note identities, not six automatically valid fixes. Each must map to a current
successor before implementation.

| Leaf | Historical anchor | Current family / disposition | Next validation | Related / duplicate |
|---|---|---|---|---|
| C13.1 | #447, BS-2 kind wall (`beta-handover...md:232`) | documents · discovery | Read the archived resume note and latest document-kind admission/body; reproduce only the still-supported kind boundary. | — |
| C13.2 | #448, BS-3 unique violation (`:232`) | documents/DB · discovery | Recover the exact constraint and current error mapping; test one same-key replay and one distinct conflict. | C-19 error classification |
| C13.3 | #452, binding PR-3 (`:232`) | Client KB identity · reframe | Map its stable identity/provenance/correction requirements into the unified KB; discard any mandatory binding ceremony. | Issue 603 / C-41 |
| C13.4 | #456, G1 PR-2a DB (`:232`) | durable Work · reframe | Compare its DB admission, current-authority, cancellation, retention and receipt boundaries with the selected unified harness. | Issue 601 / C-05 |
| C13.5 | #449, G1 PR-2b runtime (`:232`) | durable Work · reframe | Verify current runner/version registry, old-run resume, scheduling source and retry/cancel ordering; do not reopen the archived runtime wholesale. | Issue 607 / C-05 |
| C13.6 | #460, `/ready` hard-storage gate (`:232`) | operations · discovery | Recover the resume note, then test current configured/unavailable/omitted storage behavior and write capability separately. | C-12, C83.25, C83.27 |

## C-33 · named DB residuals

| Leaf | Historical obligation (`beta-handover...part2.md:125-135`) | Current family / disposition | Next validation | Related / duplicate |
|---|---|---|---|---|
| C33.1 | π-E1 self-referential `betaLanded` check | migrations/quality · preserve | Locate the current gate and require proof from the expected `schema_migrations` stem rather than its own result. | — |
| C33.2 | Wiki-lint “unprovable kind” waiver is function-wide rather than per target | provenance/quality · preserve | Inspect current analyser and add a multi-target fixture where only one target is waived. | C-84 related analyser |
| C33.3 | Candidate-parameterized `evaluate_witness_identity` variant | documents/identity · reframe | Determine whether current extraction needs candidate-scoped evaluation; keep identity evidence in Client KB provenance. | Issue 603 |
| C33.4 | `document_regions.field_path` caller-supplied and not CHECKed | documents · preserve | Trace all current writers and define/test canonical field-path syntax at the owning write boundary. | — |
| C33.5 | Consolidate `wake_propose_bank_identifier_promotion` on `_identifier_promotion_core` | bank/KB · reframe | Compare latest bodies for invariant drift; prefer one identity-learning service and one receipt contract. | C55.24 / C83.2 |
| C33.6 | Shared marker-survival helper before another `_sandbox_client_set` recut | test infrastructure · preserve | Inventory marker consumers and prove an isolated helper retains intentional sandbox markers without widening production scope. | — |
| C33.7 | Per-subject-account digest binding across thirteen historical bank-agent cores | bank security · preserve | Re-census current bank operations and test subject/account/input digest at admission and commit; thirteen is historical only. | C-40 |
| C33.8 | Autonomous bank-agent `op_key`: `taskId` at colon field 2 or no colons | operation identity · reframe | Define one current stable operation-key schema and test parser-free round trip, retries and actor/work attribution. | C-62 / issue 602 |
| C33.9 | Unadjudicated `opening_items` aggregate of +7,850,406 cents with no `obe_plug`; sign unknown | opening balances · discovery | Recompute against current safe fixtures/data definitions, identify sign and source before any correction; never copy the amount as present fact. | C-30 |
| C33.10 | `_close_wake_ctx` CLR11 rung reachability was a hypothesis, not measured | close/runtime · discovery | Exercise each current authority rung against the latest context function and record reachable/refused branches. | C77.11 |

## C-34 · reconciler follow-ups

| Leaf | Historical obligation (`beta-handover...part2.md:139-143`) | Current family / disposition | Next validation | Related / duplicate |
|---|---|---|---|---|
| C34.1 | `expired` key collision clobbered `expireClarifies` count | runtime · preserve | Inspect current result aggregation and test simultaneous expiry categories with distinct counters. | — |
| C34.2 | Leader render-pair `try/catch` swallowed halt-class errors | runtime · preserve | Inject the current halt taxonomy and require process/work failure visibility rather than successful continuation. | C88.3; related presentation, not duplicate |
| C34.3 | Three bare `to_regprocedure` probes in wiki projection | KB/provenance · preserve | Re-census current probes and test missing/overloaded functions with typed startup or projection failure. | C33.2 / C-84 |

## C-48 · F-A4 and F-A7b unbuilt scope

The umbrella hid four separable Close runtime pieces plus the firm-side interview. Historical
human-gate defaults are replaced by current agentic Work; truthful actor attribution and current
authority still bind.

| Leaf | Historical anchor | Current family / disposition | Next validation | Related / duplicate |
|---|---|---|---|---|
| C48.1 | `close_prep_due` leader-belt producer (`close-key-1-design...`) | Close Work · reframe | Trace present close readiness and create one deterministic due-item contract with current period/client attribution. | C55.10 cadence |
| C48.2 | Versioned `closePrep.v1` durable workflow export | harness · reframe | Map Close to the chosen runner, old-body registry and restart/replay acceptance; never edit a frozen body. | Issue 607 / C13.5 |
| C48.3 | Task-bound close credential mint in the historical pool/runtime | authority · preserve | Verify authority is reacquired through commit and credential lifetime cannot exceed active Work. | C-23 |
| C48.4 | `withdraw_close_proposal_item` correction/retraction path | Close correction · reframe | Define correction impact, retained receipts and subsequent close-readiness recalculation under accepted Work semantics. | Issue 602 correction chain |
| C48.5 | F-A7b firm-side setup interview | onboarding/KB · reframe | Discover the current firm setup route, persisted answers, applicability and correction path; use shared Work questions. | C83.24 |

## C-51 · F6–F9 register

The historical single sentence expands to ten leaves when the two `0034` inherits and the parked
acceptance are named. Current replacements own the validation; old lane names do not.

| Leaf | Historical anchor | Current family / disposition | Next validation | Related / duplicate |
|---|---|---|---|---|
| C51.1 | F6 `failed_retry` positive path was never witnessed live | documents/runtime · discovery | Run a current isolated failure→retry→success case and assert one business receipt; local evidence is not hosted evidence. | — |
| C51.2 | `internal` lane had no self-service door | Work UI · reframe | Decide which current user goal exposes the operation and verify both direct UI and Clara use the same business operation. | — |
| C51.3 | Admission-time envelope label | runtime contract · preserve | Inspect the current envelope taxonomy and test that admission refusals retain actionable typed labels through UI/agent recovery. | C08.10 |
| C51.4 | OCR reclaim bound only at mint time | documents/authority · preserve | Test authority/ownership again through the reclaim commit, including revoke/concurrent claim. | Issue 601 current authority |
| C51.5 | F8 single-use door: a no-op retry could spend the only unattended retry | retry policy · reframe | Specify current retry budget from operation state and test refusal before consuming eligibility. | — |
| C51.6 | `0034` ordering inherit: settled receipt deleted before later lane checks could refuse | idempotency · preserve | Test a refused retry retains the original receipt and cannot mint a second economic operation. | Issue 602 |
| C51.7 | `0034` sales-backfill-slot inherit: refused/readmitted work could consume a scarce slot | capacity · preserve | Test slot reservation and release atomically with actual admission outcome. | — |
| C51.8 | Landscape-refresh autonomy class | Work · reframe | Apply accepted agentic default: retry model-fixable/stale context automatically; ask only for missing fact/decision, with current KB/authority re-read. | Issue 601 / 603 |
| C51.9 | F9 had no unpark path | durable Work · preserve | Park on a real current question, answer once, restart/replay, and prove transition to runnable or an actionable terminal refusal. | Issue 607 |
| C51.10 | F9 parked-residual acceptance | durable Work · preserve | Verify cancel/delete/version-cutover leave the minimum Work basis and never strand a nonterminal run without a legal next transition. | Issue 601 / C83.22 |

## C-54 · owner-batch leaves

These were old owner questions. Current accepted contracts answer parts of them, so they are
implementation validation rather than a request to repeat the old sitting.

| Leaf | Historical anchor | Current family / disposition | Next validation | Related / duplicate |
|---|---|---|---|---|
| C54.1 | Item 84: fresh-per-call versus deterministic actor-scoped operation keys (`mohe-owner-batch-2026-08-31.md:57-62`) | idempotency · **superseded framing** | Apply issue 602: same economic retry maps to one stable operation/receipt while actor and Work remain attributable; inventory current caller derivation. | C33.8 / C-62 |
| C54.2 | 91b: horizon for retiring the three-argument wake-settle compatibility door (`:125-128`) | runtime cutover · reframe | Inventory nonterminal old-body runs; prove separately built old version resumes under the new registry, stop old admissions and verify no remaining runs/callers/queued delivery require that door before retirement. Elapsed time alone is insufficient. | Issue 607 |
| C54.3 | 94: historical one-hour bank-agent cadence and disabled wake sources pending retention/runtime (`:140-144`) | schedules · reframe | Treat cadence as an authorised schedule product setting; first prove retention, bounded retries and exact due-key idempotency. Do not inherit “1h” as current. | C-05 |
| C54.4 | 96: supersession pointer in a frozen Slice-4 readiness contract (`:167-171`) | documentation/versioning · preserve | Preserve the frozen artifact; add/verify a current registry or reader-visible supersession pointer outside it and test present readiness behavior. | C-12 |
| C54.5 | 97: section-only MSIC families lacked a section→division predicate (`:159-166`) | COA/KB · discovery | Read current intake and template matching; require an explicit, sourced mapping or fail closed for non-applicable families. No historical edition/rate is implied. | C-53 |

## C-55 · gate-record OQ long tail

Rows below retain the specific question while translating old “owner gate” language into current
product contracts. Only a truly unresolved scope choice returns to an owner; unknown code/tests are
implementation discovery.

### F-T1 SST questions

| Leaf | Recovered question | Current family / disposition | Next validation | Related / duplicate |
|---|---|---|---|---|
| C55.1 | OQ1: what “DG variations” means (period length, invoice basis, Designated Areas, or all) | tax · discovery | Define the domain term from current official sources and representative documents before changing schemas or prompts. | — |
| C55.2 | OQ2: synthetic-only positive path versus a real SST client | tax QA · reframe | Build safe representative fixtures and separately record any authorised hosted/client evidence; never substitute one for the other. | — |
| C55.3 | OQ3: dual-registrant SST control split timing | tax/accounting · discovery | Establish current legal/accounting rule and test period/control split with sourced fixtures. | — |
| C55.4 | OQ5: missing service-performed date | tax/Work · reframe | Ask only when current evidence cannot determine the applicable service period; refuse posting if a required date remains unknown. | — |
| C55.5 | OQ6: credit-note allocation scope, historically “global vs taxable-only” | tax/subledger · preserve | Model the originating invoice and applicable tax treatment; test creation, allocation, reversal and correction without global assumptions. | — |
| C55.6 | OQ7: unread exemption source, infer versus hold | tax/KB · reframe | Re-read an authorised current source; if still missing, park a precise question rather than infer a statutory exemption. | Issue 603 provenance |
| C55.7 | OQ8: imported-services self-billed e-invoice path unscheduled | tax/documents · discovery | Confirm current legal/product scope, source, document object and journal/subledger boundary before scheduling work. | — |
| C55.8 | OQ9: threshold schema could not represent zero or grouped subjects | tax/data model · preserve | Inspect current schema and build boundary fixtures for zero, group and unknown; no historical threshold value is retained. | — |
| C55.9 | OQ10: ownership of annual law-current review | tax/operations · reframe | Define source-version, effective-date, review alert and activation evidence in the Client KB/reference pipeline. | C83.19 |

### F-A4 Close questions

| Leaf | Recovered question | Current family / disposition | Next validation | Related / duplicate |
|---|---|---|---|---|
| C55.10 | OQ1: cadence and first fire | Close schedules · reframe | Specify due conditions and user-authorised schedule; test first run, retry and no duplicate close work. | C48.1 |
| C55.11 | OQ2: `agent_prepared` versus `two_person` label priority | attribution · **superseded framing** | Use truthful actor/preparer/reviewer fields; do not recreate ordinary two-person approval. | Issue 602 |
| C55.12 | OQ3: undated document drawer, attestable versus absolute | Close readiness · preserve | Define which missing dates are material and how evidence/question/correction affects readiness. | — |
| C55.13 | OQ4: prepayment term when source is silent | accounting/Work · preserve | Re-read available evidence, then ask a bounded question; do not fabricate a term or balancing entry. | — |
| C55.14 | OQ5: recut `attest_close_exception` signature/authorship | authority · reframe | Map current close-exception operation to current actor/Work/client, permission and stable receipt. | C48.3 |
| C55.15 | OQ6: a belt period becomes due after lawful close | Close lifecycle · preserve | Test late due work against closed/frozen period semantics and produce a correction/reopen path instead of silent posting. | — |

### F-T3, F-A8, F-A7, F-A9 and remaining named questions

| Leaf | Recovered question | Current family / disposition | Next validation | Related / duplicate |
|---|---|---|---|---|
| C55.16 | F-T3 OQ2: no fixed-asset population for a positive capital-allowance case | tax/assets QA · preserve | Add a sourced synthetic asset population and verify asset, depreciation and tax outputs remain distinct. | C83.13 |
| C55.17 | F-T3 OQ3: partial official-source access | tax/KB · preserve | Test unavailable/stale/partial source states and block unsupported computation while retaining evidence. | C83.14 |
| C55.18 | F-T3 OQ9: tax-provision posting into Close | tax/Close · preserve | Define provision business object, JE, period, evidence and reversal; tax filing remains human-reviewed under PRD. | C83.20 |
| C55.19 | F-A8 OI1: owner of context landing for web-found identifiers | Client KB · **resolved direction** | Route sourced candidates through the single KB ingestion/provenance/correction service; test that knowledge never grants authority. | C83.21 / issue 603 |
| C55.20 | F-A7 gate §5 item 3: dual attribution for one document read under related-party sides | documents/security · reframe | Verify each client/side authorisation, provenance and reuse of extracted evidence without cross-tenant leakage or duplicate accounting. | C83.23 |
| C55.21 | F-A9 TA-P13 OQ2: monthly usage dashboard screen | commercial/reporting · discovery | Separate accepted accounting dashboard metrics from commercial AI/seat usage; identify authorised users, source and freshness. | C83.10 |
| C55.22 | F-A9 TA-P13 OQ4: cross-firm operator dashboard/new role | operator support · **superseded boundary** | Apply PRD: operator support is limited to registration/payment support and estate wake-source controls and does not open firms' books. Validate any current support surface against that boundary; do not design an unbounded cross-firm role. | C83.11 |
| C55.23 | Fix-queue trigger for auto-posting deterministic dated employee-claim accruals after real-close evidence | accounting · reframe | Under agentic default, test deterministic incurred/posting dates, period and liability facts; ask only when source facts remain missing. | — |
| C55.24 | Bank OQ8: identifier promotion target, old client-identifier versus counterparty-relation choice | Client KB · **superseded framing** | Store sourced identity facts/aliases in unified KB, retain ambiguity and correction, and avoid mandatory vendor binding. | C33.5 / C83.2 |
| C55.25 | Reporting OQ4: which books form acceptance evidence | reports QA · reframe | Use representative isolated fixtures; record authorised hosted evidence separately and never embed historical client IDs as authority. | — |
| C55.26 | Reporting P12: agent capability for `close_and_attest` | authority · preserve | Test actual current capability/role at admission and commit, including revoke; zero rows or absent callers do not prove denial. | C48.3 |
| C55.27 | Freeform OQ-A: scope of interactive-client mint restriction beyond `wake_open_question` | harness/authority · reframe | Apply current Work/client/actor admission to every question/tool path and test cross-client/expired-work refusal. | Issue 601/607 |

## C-77 · 09-01-pm standing follow-up ledger

The historical row says ten but names twelve separable obligations when the a11y pair and C-5 trio are
unfolded. Current validation must recensus affected sites; the old “756/88” and 900-second figures are
not requirements.

| Leaf | Historical obligation (`beta-handover...part3.md:24-37`) | Current family / disposition | Next validation | Related / duplicate |
|---|---|---|---|---|
| C77.1 | Fixed-iteration `settleUntil` sweep; hoist a progress-aware helper | quality · preserve | Recensus current poll helpers and test progress, deadline, error and cleanup rather than a fixed iteration count. | C-66 / C-73 |
| C77.2 | Freeze lint must refuse test-path registrations | frozen-version quality · preserve | Positive-control the current lint with a `tests/...` registration and a valid production registration. | — |
| C77.3 | `p4t2` actor-scoped audit count | authority QA · preserve | Recompute current actor-scoped coverage at the operation boundary and fail on missing attribution, not a historical total. | — |
| C77.4 | Bind accessibility shadows to their real pages | accessibility · preserve | Build page-level tests proving labels/errors/focus states are rendered by the production route. | C08.6 |
| C77.5 | Tree→registry command-palette cell | navigation · preserve | Compare visible route tree with command registry under actual role/client scope. | C-43 |
| C77.6 | `DoorDialog` identical close-polarity bypass | accounting UI · preserve | Test close/cancel actions with identical labels/visuals but opposite effects; require typed action identity and result. | — |
| C77.7 | Projector nested-PII strip | security · preserve | Add nested object/array fixtures and prove sensitive fields do not reach projection/log/UI. | — |
| C77.8 | Webhook rejected events must be loud instead of 200-and-drop | commercial/ops · preserve | Exercise signed rejected events and require durable refusal/alert plus safe HTTP behavior. | C-09 |
| C77.9 | `constraint_name` re-raise hazard if a second unique is added | DB errors · discovery | Inspect current constraints and error mapping; test two distinct unique violations before changing catch logic. | C-19 |
| C77.10 | `coa_chart_apply` checklist row | COA/ops · preserve | Link the current apply operation to an authorised-accountant precondition/receipt/rollback checklist; no operator access to client books. | C-53 |
| C77.11 | `_close_wake_ctx` CLR11 reachability | Close/authority · duplicate | Use the single current rung matrix specified at C33.10. | C33.10 |
| C77.12 | Historic `page.tsx` 900-second clamp versus the real window | UI/runtime · discovery | Locate current timer source and use one shared duration contract with boundary tests; do not preserve 900 seconds by default. | — |

## C-79 · no-home verbs

The historical row says eight, but names six still-open verbs and explicitly closes two others. Only
the six below remain inputs.

| Leaf | Historical verb (`beta-handover...part3.md:39-46`) | Current family / disposition | Next validation | Related / duplicate |
|---|---|---|---|---|
| C79.1 | `grant_firm_capability` | authority · preserve | Map a current access-administration goal to a least-privilege UI/Clara operation and append-only receipt; test grant through commit without exposing retired automation-enable ceremonies. | — |
| C79.2 | `revoke_firm_capability` | authority · preserve | Test revocation wins before any later operation commit and appears in history. | C79.1 |
| C79.3 | `set_turnover_classification` | accounting/tax · reframe | Place the sourced fact in the appropriate client/firm setting and re-evaluate affected work; no hidden statutory default. | Issue 603 |
| C79.4 | `add_client_alias` | Client KB · reframe | Use the unified KB alias lifecycle with provenance, ambiguity and scope. | C79.5 / issue 603 |
| C79.5 | `retire_client_alias` | Client KB correction · preserve | Verify retirement keeps history, invalidates retrieval, and triggers impact re-evaluation. | C79.4 |
| C79.6 | `record_client_fact` | Client KB · reframe | Admit typed user facts with source/trust level and correction/retraction; keep model inference distinct. | Issue 603 |

## C-81 · delta residuals

| Leaf | Historical obligation (`beta-handover...part3.md:51-57`) | Current family / disposition | Next validation | Related / duplicate |
|---|---|---|---|---|
| C81.1 | F10 `transaction_timeout` | reports/runtime · preserve | Test long report/close transactions at the actual pool/DB boundary and surface a retryable typed result without partial effect. | — |
| C81.2 | B4 dollar-quoted sandwich | SQL quality · preserve | Positive-control current SQL parser/lint with nested dollar quotes and comments around governed definitions. | C-84 |
| C81.3 | SQLSTATE 57014 `caller_reported` label | error taxonomy · preserve | Distinguish caller cancellation, server timeout and internal failure in receipt/UI/agent recovery. | C81.1 |
| C81.4 | RS guard lift window | reports/security · discovery | Recover the exact latest guard and test the temporary-lift interval with current authority; do not infer it from old SQL. | — |
| C81.5 | Supavisor headroom remeasurement | operations · discovery | Measure current configured pool/concurrency under representative report load; historic capacity numbers are discarded. | C88.9 if local stack used; related, not duplicate |

## C-82 · eta residuals

| Leaf | Historical obligation (`beta-handover...part3.md:58-64`) | Current family / disposition | Next validation | Related / duplicate |
|---|---|---|---|---|
| C82.1 | Estate-wide whitespace-blind blank operation-key idiom | operation identity · preserve | Census current public operations and reject empty/whitespace keys before receipt reservation. | C54.1 |
| C82.2 | Co-effective policy seed-test fixture (`clara.edge_policy_sets`) | policy QA · preserve | Build deterministic overlapping-effective-window fixtures and assert selected policy/version. | — |
| C82.3 | Window-blind wall-side policy resolution caused false refusal, not false preview | policy/accounting · preserve | Test before/inside/after effective windows and retain refusal classification; never loosen the preview/invariant wall generically. | C82.2 |
| C82.4 | `0084` tooling depended on `C:\\ct\\` | tooling portability · preserve | Run the current tool from a different verified scratch root and eliminate hard-coded local paths. | — |

## C-83 · harness-audit Part A obligations

The historical audit's prose says “~18 carry no row”, but Part A(ii) provides **14 numbered source
groups**, several containing multiple questions/follow-ups. Expanding every numbered group yields 29
identifiable leaves below. This is the reproducible inventory; neither 18 nor 29 is a claim that all
remain open today. Four nearby Part A items that were tracked outside the claimed sections are listed
afterward so the umbrella does not hide them again.

### Part A(ii): every numbered source group, unfolded

| Leaf | Recovered obligation (`harness-audit-2026-08-23.md:58-109`) | Current family / disposition | Next validation | Related / duplicate |
|---|---|---|---|---|
| C83.1 | A1.1: cross-item G1 wake-execution mechanism for F-A3/F-A4/F-A5 | unified harness · reframe | Specify one Work admission/execution/resume path with versioned bodies, current authority and stable receipts. | C13.4-.5 / issue 607 |
| C83.2 | A1.2: bank identifier-promotion target | Client KB · **superseded framing** | Use unified KB facts/aliases/provenance and validate ambiguity/correction; no separate binding registry ceremony. | C33.5 / C55.24 |
| C83.3 | A1.3: R-F1 drawer-1 P3/F-T4 ownership split versus absence | reports/ownership · discovery | Trace current data owner and reader for both drawers; prove each required datum is supplied or refused with an actionable gap. | — |
| C83.4 | A1.4 OQ1: Close cadence/first fire | Close schedules · duplicate | Use C55.10 acceptance. | C55.10 |
| C83.5 | A1.4 OQ2: `agent_prepared`/`two_person` label | attribution · duplicate/superseded | Use C55.11; no ordinary second-person gate. | C55.11 |
| C83.6 | A1.4 OQ3: undated-document drawer | Close readiness · duplicate | Use C55.12. | C55.12 |
| C83.7 | A1.4 OQ4: silent prepayment term | accounting facts · duplicate | Use C55.13. | C55.13 |
| C83.8 | A1.4 OQ5: `attest_close_exception` signature | authority · duplicate | Use C55.14. | C55.14 |
| C83.9 | A1.4 OQ6: due belt after lawful close | Close lifecycle · duplicate | Use C55.15. | C55.15 |
| C83.10 | A2.5: monthly usage dashboard screen | commercial/reporting · duplicate | Use C55.21; keep separate from accepted accounting dashboard metrics. | C55.21 |
| C83.11 | A2.6: cross-firm operator dashboard/new DB role | operator support · duplicate/superseded | Use C55.22 and PRD's explicit no-books-access boundary. | C55.22 |
| C83.12 | A2.7 F-T3 OQ1: tax acceptance oracle bar | tax QA · discovery | Define sourced expected outputs and tolerance for representative scenarios; do not rely on old counts. | — |
| C83.13 | A2.7 OQ2: fixed-asset population | tax/assets QA · duplicate | Use C55.16. | C55.16 |
| C83.14 | A2.7 OQ3: official-source access | tax/KB · duplicate | Use C55.17. | C55.17 |
| C83.15 | A2.7 OQ4: refusal versus a historical default-rate example | tax · reframe | Use the current official rate/source and effective date; refuse when unavailable. The historical numeric example is explicitly discarded. | — |
| C83.16 | A2.7 OQ5: computation pack versus form | tax product · discovery | Define the user deliverable and human filing-review boundary, then verify data lineage into that artifact. | — |
| C83.17 | A2.7 OQ6: Tier-1 / ALL-IN contract collision | tax/commercial · discovery | Resolve against current pricing/scope authority; keep tax correctness independent of plan label. | — |
| C83.18 | A2.7 OQ7: tax-agent signature | tax authority · reframe | Preserve preparer/reviewer/signature provenance required by current legal scope; do not infer a generic second-person gate. | — |
| C83.19 | A2.7 OQ8: annual law-current duty | tax/operations · duplicate | Use C55.9 current-source/version acceptance. | C55.9 |
| C83.20 | A2.7 OQ9: tax-provision posting | tax/Close · duplicate | Use C55.18. | C55.18 |
| C83.21 | A2.8: OI1 KB context landing for web-found identifiers | Client KB · duplicate/resolved direction | Use C55.19. | C55.19 |
| C83.22 | A2.9: OI2 clocked-wake execution; historical state only held→cancelled | unified harness · reframe | Prove due Work can run, park, resume, cancel and retain completed receipts under the selected runner. | C51.9-.10 / issue 607 |
| C83.23 | A2.10: dual-attribution contract | documents/security · duplicate | Use C55.20. | C55.20 |
| C83.24 | A3.11: F-A7b firm-side setup interview | onboarding/KB · duplicate | Use C48.5. | C48.5 |
| C83.25 | A3.12: external `/ready` uptime check | operations · preserve | Configure a real external checker and prove alert delivery/recovery against current readiness semantics; this requires hosted evidence. | C-16 / C-58 |
| C83.26 | A3.13: synthetic DR canary seed in CI | DR/quality · preserve | Seed a parked canary, restore/replay it, and fail rather than SKIP when the expected canary is absent. | C-47 |
| C83.27 | A3.14a: storage **write** probe on `/ready` | operations · preserve | Verify a scoped synthetic write/delete round trip and distinct configured/unavailable/omitted states. | C13.6 / C-12 |
| C83.28 | A3.14b: permanent CI battery over the storage-grant surface | storage security · preserve | Exercise current grants/policies with allowed and denied principals, including cleanup of owned fixtures. | C-57 |
| C83.29 | A3.14c: re-examine custom Postgres role in Storage JWT versus scoped S3 credentials | storage architecture · discovery | Trace current identity/credential path and choose the least-privilege supported mechanism using current vendor docs. | C-57 |

### Part A items tracked outside the old Backlog/Known-issues claim

| Leaf | Historical anchor (`harness-audit...md:111-126`) | Current family / disposition | Next validation | Related / duplicate |
|---|---|---|---|---|
| C83.X1 | FX-lite build timing | foreign currency · **future scope** | Retain only as a future-decision pointer. If later admitted to scope, define source, recognition, settlement and reporting requirements then; it creates no current build acceptance. | C-56 / PRD boundaries |
| C83.X2 | OD-3 acceptance-bar figures for slots other than BEE | documents QA · discovery | Rebuild current corpus/slot inventory and define representative acceptance from evidence; old figures are discarded. | C-56 |
| C83.X3 | End-to-end re-render DR drill unrun | reports/DR · duplicate | Use the current sealed-artifact restore/re-render acceptance. | C-47 |
| C83.X4 | Bank OQ5 historical 60-day stale-match waiver | bank · reframe | Define staleness from current reconciliation evidence and accepted automatic-action rules; no inherited 60-day threshold. | — |

## C-86 · dawn-review successors

| Leaf | Historical anchor (`beta-handover...part3.md:78-85`) | Current family / disposition | Next validation | Related / duplicate |
|---|---|---|---|---|
| C86.1 | 裁-19 PR-2 identity unmerge/correction door | Client KB correction · preserve | Verify an explicit append-only correction/unmerge chain, canonical reads, impact re-evaluation and authority. Historical estate count/performance is not current evidence. | Issue 603 |
| C86.2 | `_approve_entry_core` refusal still named a retired “budget” gate; drafting-trio exact-equality pin | accounting errors/quality · preserve | Read latest body and callers, correct only if stale prose remains, and pin equal behavior across current writer variants. | C-45 stale budget copy |
| C86.3 | PR #231 γ residual 4: a self-citation in the third amendment drifted from the referenced rows by about 25 lines | documentation · discovery | Read the current editable/frozen ownership of that citation and confirm whether content-based adjacent prose already resolves it; fix only an editable current source if still wrong. | — |
| C86.4 | PR #231 γ residual 5: S11.4c's absent-function branch used `btrim(v_def) = ''`, while a no-row `SELECT` leaves `v_def` NULL and the branch can fall through | quality/SQL · discovery | Inspect the current guard and positive-control both comment-only and absent-function cases; preserve frozen historical bodies and change only the present owning test/tool if the NULL gap remains. | — |

The deleted handover/progress files did not name these two nits, but the read-only PR #231 body does
under “Named residuals” 4–5. This recovers the input; it does not prove either issue survives in current
bytes, and neither blocks `/to-spec` while that implementation discovery remains open.

## C-88 · four carried sets

The historical row says “16 subitems”, but splitting the named dr-verify trio, C-a pair and Slice-4
bundle yields twenty independently validatable leaves. This list retains all phrases and makes no
claim that twenty remain open.

### Set A — small unrecorded follow-ups

| Leaf | Recovered obligation (`beta-handover...part3.md:88-94`) | Current family / disposition | Next validation | Related / duplicate |
|---|---|---|---|---|
| C88.1 | wb-o AMB-11 adjudication request | opening balances · discovery | Recover current opening-position ambiguity and accepted decision from present SOT/source before any implementation. | C-30 |
| C88.2 | Drop/read retirement of `firm_usage_daily` / `task_usage` | commercial/data lifecycle · discovery | Census current readers/writers/data retention and migrate consumers before a separately reviewed drop. | C55.21 related, not duplicate |
| C88.3 | Per-rung friendly-message table | UX/error taxonomy · preserve | Map current typed refusals to bounded actionable Chinese copy without hiding codes/receipts from diagnostics. | C34.2 halt behavior remains separate |
| C88.4 | DB status-predicated CAS settle | Work concurrency · preserve | Test settle/cancel/answer races with status/version predicates, one accepted transition and retained completed receipts. | Issue 601/607 |

### Set B — tooling follow-ups

| Leaf | Recovered obligation | Current family / disposition | Next validation | Related / duplicate |
|---|---|---|---|---|
| C88.5 | dr-verify UTC hashing | DR tooling · preserve | Run equivalent content under timezone changes and require stable hash semantics. | C-32 |
| C88.6 | dr-verify STRICT canary probe stale expectation | DR tooling · preserve | Re-derive the current canary contract and positive-control present/absent/wrong-version outcomes. | C83.26 |
| C88.7 | dr-verify AP-gate `ILIKE` example | DR/accounting QA · discovery | Inspect current query/fixtures and replace a pattern match with exact semantic evidence if still present. | — |
| C88.8 | Runtime boot line must name bundle version | runtime provenance · preserve | Emit and assert the exact serving bundle/workflow registry version at startup and in evidence logs. | C-70 / issue 607 |
| C88.9 | Local disposable Supabase stack | test infrastructure · reframe | Provide a bounded isolated stack/fixture lifecycle only if current auth/storage integration needs it; never point at production credentials. | C83.28-.29 |
| C88.10 | `ComplianceWatchCard` acknowledgement echo | compliance UI · preserve | Trace acknowledgement receipt to the card and reload state with actor/time/version. | — |
| C88.11 | Unreverted-admin-grant lint watch | security/quality · preserve | Positive-control a temporary admin grant and require lint/teardown to detect it after the fixture. | C-31 role census |

### Set C — Tier-A raise observability

| Leaf | Recovered obligation | Current family / disposition | Next validation | Related / duplicate |
|---|---|---|---|---|
| C88.12 | Tier-A raises had no durable receipt/audit row; historical review called this an observability candidate, not an authority-wall gap | observability · discovery | Decide the minimum durable diagnostic event, then test correlation/redaction/retention without changing admission authority. | — |

### Set D — Wave-D/C and Slice deferrals

| Leaf | Recovered obligation | Current family / disposition | Next validation | Related / duplicate |
|---|---|---|---|---|
| C88.13 | First real recurring template, event-triggered | schedules/accounting · reframe | Use a representative synthetic first; then require separately authorised real-environment evidence for trigger, one effect, retry and cancellation. | Issue 602 |
| C88.14 | C-a §5.3 pool segregation | subledger · preserve | Test client/account/domain isolation and balanced allocation effects across the current pool/batch operation. | — |
| C88.15 | C-a Section-I wedge remedy | subledger correctness · discovery | Recover the exact wedge from current source/tests and reproduce before designing a narrow fix. | — |
| C88.16 | C-c F3 documented-as-is | accounting/documentation · discovery | Identify the current mechanism and decide whether this remains an intentional limitation or needs product acceptance; historical “as-is” is not authority. | — |
| C88.17 | Slice-4 compliance export | compliance/reporting · preserve | Verify complete authorised export, provenance, version and redaction with a stable receipt. | — |
| C88.18 | Slice-4 trace-debug surface | operations/security · preserve | Expose correlated diagnostics to authorised users/operators with redaction and bounded retention. | C88.12 |
| C88.19 | Per-firm chat-visibility toggle/unshare | chat/authority · reframe | Align visibility with current conversation/Work separation; test revoke, reload and minimum retained Work basis. | Issue 601 |
| C88.20 | Job-level engine liveness | runtime/operations · preserve | Monitor nonterminal job progress/version and alert on stalled work independently of HTTP process readiness. | C83.25 |

## Counts, deduplication and remaining gaps

This recovery contains **157 primary named leaf rows** across the fifteen requested anchors, plus
**four adjacent C-83 tracked-outside leaves** (`C83.X1`–`C83.X4`), for **161 total**. The total
includes semantically duplicate rows so each original anchor remains traceable; it is not an estimate
of unique implementation tickets. The
explicit duplicate column prevents C-33/C-55/C-83 and C-48/C-83 overlaps from becoming parallel work.

Counts by anchor: C-08 11; C-13 6; C-33 10; C-34 3; C-48 5; C-51 10; C-54 5; C-55 27; C-77 12;
C-79 6; C-81 5; C-82 4; C-83 29 plus four tracked-outside; C-86 4; C-88 20. The sum of the primary
sets is 157, not 161; adding the four adjacent C-83 rows produces 161 total rows in this document.
Historical labels such as “ten”, “eight”, “~18” and “16” therefore remain source descriptions rather
than target counts.

Remaining unrecoverable or intentionally unverified inputs:

1. F-A7b's firm-side setup interview is named only at mechanism level in the allowed historical
   source. Current route/state/applicability discovery is its acceptance, not reconstruction of the
   deleted design.
2. C88.1 and C88.15 retain named adjudication/wedge anchors, but their current byte-level mechanism
   was outside this input-recovery pass. They require targeted current-source discovery.
3. All current implementation status, current test coverage, hosted state, legal/source freshness and
   production populations remain unverified unless a row says only what to verify. No historical
   “fixed”, “live”, timing, count or deployment assertion is carried forward.
