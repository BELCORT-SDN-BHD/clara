# The cut phase, `chatTurn_v22` / `claraWork_v6`, and `statementFacts_v4`

Planned 2026-09-25 against `main` at `6da02a8de` (PR #1053, riders wave 4 integrated). Migration
frontier `0318_knowledge_fye_pair_applicability`, 309 files. Runtime pins today:
`chatTurn → chatTurn_v21`, `claraWork → claraWork_v5`, `statementFacts → statementFacts_v3`
(`packages/runtime/workflows/registry.ts:220`, `:346`, `:364`). Frozen manifest: 322 entries, 312
deploy-locked, 10 unlocked (the `payrollFacts.v1.*` and `agreementFacts.v1.*` files wave 4 added),
3 retired.

This document is the cut's work order. Nothing is invented here that is not already written on a
ticket or in a wave report; where a contract cannot be cut as written, the reason is a measurement
and the entry says so.

---

## 1 · The contract roster, final

Twenty tickets contributed; thirty contract entries. Every entry names its source report and
section, the tool or question it changes, the door it calls with its argument order, its refusal
mapping, its part kind, its prompt stanza, and whether the door exists on `main`.

### 1.1 · Door reachability, the measurement that sorts the roster

A chat or Work tool runs on one of two pooled credentials
(`packages/runtime/lib/pools.mjs:95-101`): an act runs `set role clara_runtime`
(`withRuntime`), a read runs `set role clara_agent_ro` (`readScoped`). Neither carries JWT claims,
so `clara._human_ctx` raises `CLR04` on every one of them (measured and stated in
`reports/wave3-lane02-ticket1007.md`, contract item 1). **A door granted to `clara_authenticated`
alone is unreachable from this cut, and a tool over it could only ever return a grant refusal.**
That is the estate's own rule, written twice already:

> "every prepayment read is granted to `clara_authenticated` alone, so a machine-lane read tool
> 'could only return a grant refusal, and that is not a capability'."
> — `reports/wave4-lane04-ticket939.md`, Successor contract item 2, quoting `claraWork.v5.prompt.ts:31-35`

Grants measured on `main`, door by door:

| door | created by | granted to | verdict |
|---|---|---|---|
| `clara.admit_trade_invoice_work` / `probe_trade_invoice_duplicates_for` / `record_trade_invoice_duplicate_ack` | 0275 | `clara_runtime` | reachable |
| `clara.refresh_opening_targets_from_reread` | 0286 | `clara_runtime` | reachable |
| `clara.record_opening_targets_parsed(uuid,jsonb,uuid,text)` | 0017 (grant block `0017_wave_b.sql:5131-5135`) | `clara_runtime` | reachable |
| `clara.admit_staff_expense_claim_work` | 0301 | `clara_runtime` | reachable |
| `clara.create_accrual_adjustment_for` | 0222 | `clara_runtime` | reachable |
| `clara.create_prepayment_schedule_for` | 0307 | `clara_runtime` | reachable |
| `clara.read_prepayment_source_for` / `read_revenue_recognition_source_for` | 0317 | `clara_runtime` | reachable |
| `clara.create_revenue_recognition_schedule_for` | 0308 | `clara_runtime` | reachable |
| `clara.open_work_question` | 0184 | `clara_runtime` | reachable |
| `clara.get_document_extract` | 0090, grant asserted at `0054:467` | `clara_authenticated` **and `clara_agent_ro`** | reachable |
| `clara.fixed_assets` under `p_fixed_assets_agent` | existing relation |  `clara_agent_ro` via `readScoped` | reachable |
| `clara.list_review_queue(jsonb,jsonb,int)` | 0016 | `clara_authenticated` only; 0020's grant discipline says not to open | **NOT reachable** |
| `clara.get_payroll_settlement_candidates` / `settle_payroll_net_pay` | 0298 | `clara_authenticated` only | **NOT reachable** |
| the ten tenancy doors (`get_contract_terms`, `get_tenancy_rent_plan_draft`, `propose_contract_terms`, `confirm_tenancy_rent_plan`, `confirm_tenancy_rent_plan_revision`, `get_tenancy_escalation_revision`, `get_rent_settlement_candidates`, `get_tenancy_deposit_coding`, `settle_rent_payable`, …) | 0300 | `clara_authenticated` only; cohort `TENANCY_RENT_0300_HUMAN_FNS`, ten names, zero machine-lane grants | **NOT reachable** |
| `clara.get_client_financial_pack` | 0232 | `clara_authenticated` only; 0232's tail asserts `clara_runtime`, `clara_agent_ro` and every `clara_wake_*` role hold **nothing** | **NOT reachable; #1000's own migration opens it** |
| `clara.replace_prepayment_schedule` / `replace_revenue_recognition_schedule` | 0317 | `clara_authenticated` only; the tail asserts the absence of an OBO twin by `pg_proc` count | **NOT reachable, deliberately** |
| `clara.enrol_prepayment_account` | 0315 | `clara_authenticated` only; §TAIL asserts no wake wrapper by `pg_proc` count | **NOT reachable, deliberately; the answer runs in the human lane** |

### 1.2 · Class A, cut as written, pure runtime edits (11 entries)

Every door already exists on `main` and already carries the grant the tool needs. No migration.

**A1 · #982: `start_trade_invoice_work`, the TIN tier**
Source: `reports/wave3-lane02-ticket982.md` § "Successor contract — `start_trade_invoice_work`",
plus `reports/wave3-lane02-fix.md` § "Successor contract — the amendments the wave-4 cut must carry"
items 1, 2 and 4.
Changes: `tradeInvoicePartySchema.tin`'s `.describe()` only, verbatim as the report writes it.
Door: `clara.admit_trade_invoice_work(p_client, p_author, p_intent_key, p_kind, p_particulars,
p_basis, p_basis_origin, p_source_refs, p_model)`: argument order unchanged, `tradeInvoiceFromInput`
unchanged.
Refusals: `TRADE_INVOICE_REFUSALS` gains `party_identifier_conflict` (18 → 19); the eighteen
existing sentences stay byte-identical, `party_ambiguous` in particular is NOT reworded. The
sentence must match `apps/web/messages/en.json`'s `TradeInvoice.refusals.party_identifier_conflict`
byte for byte. Typed detail: `{reason, registration_no, tin, expected_counterparty_kind,
candidates[]}`, each candidate `{counterparty_id, name, registration_no, tin, matched_on}` with
`matched_on ∈ {"registration","tin"}`.
Part kind: none new (`work_accepted`, purpose `journal_entry`, already in
`WORK_ACCEPTED_PURPOSES_V19`).
Prompt stanza: two edits to the trade-invoice stanza, the TIN resolves a party at the registration
number's own tier, and the refusal-map sentence's token count.
`claraWork` unchanged.

**A2 · #1007: `start_trade_invoice_work`, the duplicate probe and acknowledgement**
Source: `reports/wave3-lane02-ticket1007.md` § "Successor contract — the chat half", as amended by
`reports/wave3-lane02-fix.md` items 1-4.
Probe, before the admission:
`clara.probe_trade_invoice_duplicates_for($1 clientId::uuid, $2 ctx.createdBy::uuid, $3 input.kind::text,
$4 tradeInvoiceFromInput(input)::jsonb)`. It writes nothing and refuses no duplicate.
Acknowledgement, before the admission, under the SAME intent key:
`clara.record_trade_invoice_duplicate_ack($1 clientId, $2 ctx.createdBy, $3 intentKey, $4 kind,
$5 particulars::jsonb, $6 shown invoice ids::jsonb)`.
Mid-turn question: `match_count > 0` asks stop-or-record-anyway with the matches rendered; it never
refuses. This is the shape `claraWork_v4` has and `chatTurn_v21` does not.
Refusals: two new CLR10 tokens, `nothing_acknowledged` and `unknown_acknowledged_invoice`, both
rendering the same sentence. The fix round adds two more the ack door can raise, both already in
the map: `invalid_total`, `invalid_due_date`.
Part kind: none new. Prompt stanza: the "ask before you record a look-alike" paragraph, verbatim.
`claraWork_v6` needs nothing from this entry, a straight re-cut.

**A3 · #986: `refresh_opening_source`, a SECOND tool beside #985's read**
Source: `reports/wave3-lane06-ticket986.md` § "Successor contract".
Zod: `z.object({ client_id: z.string().uuid(), seed_id: z.string().uuid() }).strict()`. No document
id, no extraction id, no amount.
Door: never the SQL door directly, the route core
`refreshOpeningTargets(client, { seedId, firmId, reassert })` from
`packages/runtime/lib/opening-parse.mjs:462`, which mints
`openingRefreshOpKey(seedId, documentId, extractionId)` and calls
`clara.refresh_opening_targets_from_reread(p_seed, p_lines, p_document, p_extraction, p_op_key)` in
that order.
Refusals: the eight-row table in the report, verbatim, never replaced by a generic message, 202
`{status:'refreshed', lines, retired}` (report BOTH numbers); 409 CLR31 `no_reread_to_refresh` /
`stale_extraction_version` / `refresh_extraction_mixed`; 409 `registry_not_open`; 409
CLR31/CLR02/CLR28 tie and consent; 422 unparseable with counts and failing region ids; 404 masked.
Part kind: none new. Prompt stanza: the one sentence directing the model to the refresh tool rather
than retrying the read.

**A4 · #985: `read_opening_source` (a cut ticket, and a roster entry)**
Source: `gh issue view 985`, Agent Brief; sequencing note re-measured against #986.
**The door is NOT owed.** `parseOpeningTargets(client, { seedId, firmId, reassert })` lives at
`packages/runtime/lib/opening-parse.mjs:414` and calls
`clara.record_opening_targets_parsed($1, $2::jsonb, $3, $4)`, which is granted to `clara_runtime` in
the 0017 grant block (`0017_wave_b.sql:5131-5135`), the same credential `src/openingRoutes.ts`
already uses through `withRuntime`. So #985 is a pure runtime edit; its reserved migration `0319` is
expected to go unused.
Zod: `{ client_id, seed_id }` only, `.strict()`; an amount, an account code or a document id must be
rejected by validation, not ignored.
Refusals: verbatim from the core. The "read again since last parse" mapping is UNCHANGED
(`409 {status:'conflict', reason:'source_reread_since_parse'}`), but the guidance beside it must now
name `refresh_opening_source` instead of describing a dead end (#986's re-measurement, satisfied).
Part kind: the existing typed receipt, no new wire kind.
Prompt stanza: Clara may report only a figure this read returned, never one she inferred.
**Pairing obligation:** #985 and #986 are cut TOGETHER as a matched pair.

**A5 · #931: `start_staff_expense_claim_work`, the allocation list**
Source: `reports/wave4-lane02-ticket931.md` § "Successor contract".
Zod: only `advanceApplicationClaimInputSchema` moves; `reimbursementClaimInputSchema`,
`alreadySettledClaimInputSchema`, `sharedShape`, `claimantInputSchema` and `claimItemInputSchema`
are carried byte for byte. New `claimAllocationInputSchema` (`advance_id`, `amount_cents`,
`account_code?`), new `advance_allocations` array and `allocations_confirmed` flag. The flag is
TOOL-LOCAL and never goes on the wire.
`claimFromInput`: the `advance_application` arm as the report writes it, including
`out.advance_id = input.advance_id ?? input.advance_allocations[0].advance_id`.
Door: UNCHANGED,
`clara.admit_staff_expense_claim_work($1 clientId, $2 ctx.createdBy, $3 stableOpKey, $4 claim::jsonb,
$5 'clara_interpreted', $6 sourceRefs::jsonb, $7 modelId)`. `stableOpKey` now hashes the allocation
list, which is correct: a different split is a different claim.
Refusals: three NEW local ones in `localClaimRefusal` mirroring 0301's payload half:
`advance_allocation_mismatch` (constraint `exact_sum`), `advance_allocation_mismatch` (constraint
`distinct`), `advance_split_unconfirmed` (constraint `confirmation`, carrying
`details.proposed_allocations`). The mapping FROM the database is unchanged.
New helper: `proposeAllocationsByDate(candidates, totalCents)`: oldest `issue_date` first, ties by
`advance_id`, each taking `min(outstanding, remaining)`, naming everything outstanding when the
advances cannot cover it. Candidates from `clara.staff_advance_summary(p_client, null)` narrowed to
`outstanding_cents > 0 && !voided` and to the claimant's enrolment.
Part kind: UNCHANGED (`work_accepted`, `journal_entry`). No parts-parity entry.
Prompt stanza: the "ONE CLAIM MAY COME OFF SEVERAL ADVANCES" paragraph inserted after "SAY HOW IT IS
SETTLED, …".
Also owed: the World e2e leg the report's item 10 names.

**A6 · #937: `start_accrual_work`, per-period amounts**
Source: `reports/wave4-lane03-ticket937.md` § "Successor contract … (AC4)"; unchanged by
`reports/wave4-lane03-fix.md`.
Carrier: `packages/runtime/lib/accrual-basis.ts` **is frozen** (`frozen-workflows.json:39`), so the
cut mints its successor (`accrual-basis.v2.ts` or the cut's own name) and leaves the frozen file.
Zod delta: `ACCRUAL_METHODS` becomes `["stated_amount","stated_period_amount"]`; a new optional
`period_amounts` array of `{due_date, amount_cents}`, `.min(1)`, `.strict()` per element.
Door: `clara.create_accrual_adjustment_for(p_client, p_author, p_purpose, p_authority_ref, p_accrual,
p_frequency, p_day_rule, p_day_of_month, p_timezone, p_effective_from, p_effective_to, p_op_key)`,
arity unchanged, only `p_accrual`'s shape widens with `method.rule` and `period_amounts`.
Refusals: eight new `detail.reason` tokens, every one CLR10 on
`detail.field = "accrual.period_amounts"` (the element-shape one indexed). The first four are raised
LOCALLY before any round trip. `accrual_period_amount_missing` is THE ASK, AC4's "the tool asks
when a period is missing", and its detail hands the tool the exact dates.
Part kind: none. Prompt stanza: the "amount varies by period" paragraph.
Also owed: the World e2e leg on `packages/runtime/tests/accrual-e2e.mjs`.

**A7 · #942: `start_accrual_work`, the revenue side**
Source: `reports/wave4-lane03-ticket942.md` § "Successor contract … (AC5)".
Zod delta: `side: z.enum(["expense","revenue"]).default("expense")`, plus side-aware `.describe()`
on `expense_account_code` and `liability_account_code` (the names are the database's own wire keys
and cannot move without a migration).
Door: the same twelve-argument `create_accrual_adjustment_for`; `p_accrual` gains `side`.
`clara.correct_accrual_adjustment(p_accrual_id, p_accrual, p_op_key)` REFUSES any side but the one
the accrual already carries.
Refusals: one new token `accrual_side_unsupported` (raised locally), plus `accrual_side_immutable`
and two changed-shape `accrual_account_relationship` constraints (`income_account`,
`non_control_asset`). `expense_account` and `non_control_liability` are unchanged and render
byte-identically.
Part kind: none. Prompt stanza: the "an accrual runs one of two ways" paragraph.
Also owed: the revenue-side World e2e leg.

**A8 · #915: `start_prepayment_schedule_work` (chat) + `read_prepayment_source` (Work) + the
enrolment question**
Source: `reports/wave4-lane04-ticket915.md` § "Successor contracts", items 1, 2 and 3.
Carrier: `packages/runtime/lib/prepayment-schedule-basis.ts` is NOT in the frozen manifest today, so
it is editable now and becomes hash-locked the moment `chatTurn.v22.*` imports it. Check it with
`--print-closure` before writing the import (see §2.7).
Chat tool: `START_PREPAYMENT_SCHEDULE_WORK_TOOL`, input
`{source_entry_id, expense_account_code, expense_account_basis, purpose}` `.strict()`, UNCHANGED: no amount, no term, no dates, no cadence, no authority id.
Door (THE ONE CHANGE the module's footer needs): the footer names the HUMAN door, which the runtime
pool cannot execute. Call the twin by name:
`clara.create_prepayment_schedule_for(p_client, p_author, p_source_entry, p_expense_account,
p_expense_basis, p_purpose, p_authority_ref, p_op_key)`. `p_author` is the HUMAN the turn acts for
(`ctx.actorUserId`), never the agent user id and never `ctx.taskId`. `p_authority_ref` stays
`{kind:"chat_task", id: ctx.taskId}`. Op key `stableOpKey(ctx.taskId, TOOL, input)`, shared with the
human door.
Part kind: `prepayment_schedule_configured` via `prepaymentSchedulePart(answer)`.
`check-parts-parity.mjs` must see it emittable at this cut.
Refusals: `prepaymentRefusalMessage(reason, detail)` plus three tokens it does not yet carry:
`prepaid_account_not_enrolled` (an `axis` on `prepayment_source_unfit`), `authority_lost` /
`insufficient_role` (CLR04), `invalid_author` (CLR10, never shown).
Work read: `read_prepayment_source`, input `{source_entry_id}` `.strict()`, door
`clara.read_prepayment_source_for(p_firm, p_client, p_source_entry)` with `ctx.firmId`,
`ctx.clientId`, `input.source_entry_id` in that order. Refusals CLR11
`prepayment_source_not_found` (also the answer for another firm's entry) and CLR10
`prepayment_read_scope_required` (never shown). There is no bytes key and there never will be.
Prompt stanza: the replacement for `claraWork.v1.prompt.ts`'s "There is no source document" clause.
The question: #653's, unchanged, `clara.open_work_question` with
`p_fields = [period_start(date,req), period_end(date,req), basis(text,req,max 4000)]` and
`p_context = {document_id, source_entry_id, prepaid_account_code, total_cents}`. The ANSWER applies
through the HUMAN door, never the run.
Enrolment question: opened when the door answers `prepayment_source_unfit` /
`axis = prepaid_account_not_enrolled`; two text fields (`account_code`, `reason`); the accepted
answer runs `clara.enrol_prepayment_account(p_client, p_account, 'prepayment', p_reason, p_op_key)`
AS THE ANSWERING PERSON in the human lane; the run then re-drives the schedule door under a NEW op
key. Never a runtime grant on the enrol door, never a model-proposed account, never a model-written
reason.
Also owed: a real World e2e leg (the `chat-turn-v20-e2e.mjs` shape), since #915's own rig could not
bootstrap a World.

**A9 · #941: `start_revenue_recognition_work` (chat) + `read_revenue_recognition_source` (Work) +
the enrol question**
Source: `reports/wave4-lane04-ticket941.md` § "Successor contract", items 1-4.
Chat tool: input `{source_entry_id, revenue_account_code(1..32), revenue_account_basis(1..4000),
purpose(1..200)}` `.strict()`. No amount, no dates, no cadence, no pattern in the input, and that is the whole point.
Door: `clara.create_revenue_recognition_schedule_for(p_client, p_author, p_source_entry,
p_revenue_account, p_revenue_basis, p_purpose, p_authority_ref, p_op_key)`, named arguments in that
order. `p_pattern` is NOT sent. Op key `stableOpKey(ctx.taskId, TOOL, input)`; the two entrances
share one op-key namespace.
Part kind: `revenue_recognition_configured` (schedule id, plan id, term, deferred and revenue codes,
total cents, period count, the twelve period lines, `configuration_only: true`, `overlap_warning`).
Refusals: `recognitionRefusalMessage(reason, detail)` over the fourteen tokens
`apps/web/lib/deferred-revenue/schedule.ts` already spells, so the two surfaces cannot drift. No new
error CLASS, so `claraWork.v1.errors.ts` needs no change.
Work read: `clara.read_revenue_recognition_source_for(p_firm, p_client, p_source_entry)`,
`clara_runtime` only. No document bytes, ever.
Enrol question: `clara.open_work_question` with the prompt "This advance sits in {account}. Enrol
that account as a deferred-revenue account for this client?", two text fields, `p_context` and
`p_asked_against {basis_version}`. The accepted answer runs
`clara.enrol_prepayment_account(p_client, p_account, 'deferred_revenue', p_reason, p_op_key)` AS THE
ANSWERING PERSON. An EXPIRED question settles the Work `refused` carrying
`deferred_revenue_source_unfit`. No new Needs-you row kind.
The term question is #939's, reused, answered through `clara.record_prepayment_stated_term` in the
human lane.
Prompt stanza: the "customer has paid ahead" paragraph.

**A10 · #933: the dependent-particulars proposal, `claraWork_v6`**
Source: `reports/wave4-lane05-ticket933.md` § "Successor contract — `claraWork_v6`", **with §2 and
§3 SUPERSEDED by `reports/wave4-lane05-fix.md` § "The successor contract, CORRECTED"**. §1, §4, §5,
§6, §7 and §8 of the ticket report stand unchanged.
Imports: `deriveFaParticularsProposal`, `proposalSourceRef`, `faParticularsProposalSchema` and the
three types from the non-frozen `../lib/fa-particulars-proposal.js`. The moment v6 imports it,
IMPORT-ESCAPE hash-locks that module with the closure.
Zod input: **none, and that is the point.** The proposal is a workflow-BODY act, not a model act, so
v6's tool roster is unchanged from v5. The one zod object is
`faParticularsProposalSchema`, and the CORRECTED shape is the one to take: `description` loses its `max` (the door
has none) and the date regex is the module's own `CALENDAR_DAY` constant.
New step: `loadFaProposalInputsStepV6(work, pending)` under v4's own `readScoped` credential
(`clara_agent_ro` under `p_fixed_assets_agent (firm_id = clara.wake_firm())`), client-pinned, which
NEVER throws. **Use the CORRECTED SQL**: `fa.acquired_date::text` is load-bearing. Without the cast
node-postgres returns a JS Date at local midnight whose UTC spelling under Asia/Kuala_Lumpur is the
previous calendar day, and the derivation refuses a `Date` by name. Query (b) does NOT select
`residual_cents`.
The question: `particularsQuestionV6(pending, proposal)` replaces `particularsQuestionV4(pending)`;
ONLY `sourceRef` changes, to `proposalSourceRef(assetId, proposal)`. `clara.open_work_question(p_task,
p_hook_token, p_question, p_fields, p_reason, p_source_ref)`: argument order unchanged from v2/v4.
The apply side (`clara.complete_fixed_asset_particulars_for`) is untouched.
Refusals: nothing new refuses. A failed read or a failed `safeParse` yields `proposal = null` and
the question opens exactly as v5's does.
Part kind: unchanged (`work_question`). Prompt stanza: unchanged.
The web needs nothing further: `apps/web/lib/registers/fa-particulars-proposal.ts` already reads
`v: 1` and this shape on all three entrances.

**A11 · #945: `read_payroll_fact_state`**
Source: `reports/wave4-lane01-ticket945.md` § "Successor contract".
Zod: `{client_id, document_id}` `.strict()`.
Door: `clara.get_document_extract(p_document, p_max_chars)`, granted to `clara_agent_ro`
(`0054:467` asserts the grant), so this tool IS reachable. Find the `payroll_text_facts` extraction,
parse `payroll_state` out of its envelope, filter regions on `field_path` prefix `payroll.`. The
report's "first-class read" alternative (`clara.get_payroll_fact_state`) is a new migration's
business and is NOT taken here.
Refusals: CLR03 → `not_permitted`; CLR11 → `document_not_found`; no `payroll_text_facts` row →
`payroll_not_read`, naming the task's own status from `clara.get_document_state`. A non-empty
`payroll_state.disagreed` is NOT a refusal.
Part kind: `freeform_result`, already declared and emittable (`chatTurn.v16.prompt.ts:187`), so no
parts-parity entry.
Prompt stanza: "READING BACK A PAYROLL SUMMARY", verbatim. Its load-bearing clause: a figure the page
does not print is NOT zero.

### 1.3 · Class B, owed a database door that a cut ticket owns (2 entries)

**B1 · #1000: `read_client_financial_pack`** (migration `0320`)
Source: `gh issue view 1000`, Agent Brief.
The read exists as `clara.get_client_financial_pack(p_client, p_as_of, p_month)` (migration 0232),
but it is SECURITY INVOKER granted to `clara_authenticated` alone, and **0232's own tail asserts
literally that `clara_runtime`, `clara_agent_ro` and every `clara_wake_*` role hold nothing on it**
(`0232:1803-1804`, `:1967`). The ticket's Key-interfaces line names the remedy: "a door closed to
the agent role is reached the house way, with a wake wrapper, its grant and its allowlist row in a
new migration at the next free migration number, carrying the human door's role floor and firm scope
rather than widening either." The precedent shape is `clara.wake_create_account_set`
(0115:79-97, EXECUTE to `clara_wake_interactive`, allowlisted at 0116:124), which 0232's own header
cites at `:58-59` as the pattern it deliberately did not take then.
Tool: takes a client, an as-of date, and either month-to-date or one named month; returns the read's
own envelope, computing no figure of its own.
Refusals: the read's own. CLR04 for unauthenticated / non-member / role-insufficient, CLR10 for a
malformed month or as-of. Two states stay DATA, not errors: a client with no published cash set
returns `status = unknown`, value NULL, reason `cash_set_unpublished`, never `0`; an unreadable
client and an invented uuid answer identically.
Part kind: no new wire kind (the envelope rides a reading part).
Prompt stanza: Clara reports the pack's own figures and never re-derives one, and never says a
missing cash set is zero.
**Watch:** the new migration must keep the 0232 posture intact for every door it does not open, and
whatever census asserts 0232's ACL must be re-measured on the lane database, not transcribed.

**B2 · #1030: re-derive and re-admit Work after a source correction** (migration `0321`)
Source: `gh issue view 1030`, Agent Brief; the contract itself is
`reports/wave2-lane09-fix.md` § "3a · The successor contract for re-derivation", with §3b, §3c and
§3e as the scope boundary.
WHO: the Work runtime, which is the only lane that can interpret a document. Deriving the basis in SQL is
not constructible (`journalBasisSchema` has no back-link from a line to a document field path), and
admitting a successor parked on a question is not constructible either (`clara.open_work_question`
needs a `running` task; a freshly admitted Work's task is `queued`). Both are measurements, not
arguments.
WHAT: on a source correction, for each retired Work, enqueue a RE-READ of the corrected document,
same client, same `purpose`, same `source_refs`, initiated by the correcting actor.
FROM WHAT: the corrected facts, the live `clara.document_regions` of the document's newest `done`
extraction, **never the retired Work's own `basis`**.
THROUGH WHICH DOOR: admission through `clara.admit_journal_work` as usual, then
`clara.open_work_question` from its own run, naming BOTH figures (what the retired Work was admitted
on, and what the document now says). Nothing may post until that question is answered.
THE LINK: the cancellation's op key `source_corrected:<revision id>:<retired work id>`, durable on
`clara.op_receipts`. The retired Work's `superseded_by` was deliberately left NULL by #885 so this
successor can claim it honestly; **claiming it is a write that needs the migration.**
Two disclosure gaps ride along: the cosmetically-equivalent-edit rule (decide, pin by a cell, state
it in the correcting door's own documentation; if the decision is "fold it into the no-op guard",
that is a second body recut in the same migration; if it is "kept on purpose", it is documentation
only), and the web module's typed-refusal enumeration, which omits `value_unchanged`.
Non-negotiables that must still hold after the change: no successor can carry or post the
pre-correction figure; a Work holding a committed receipt is still untouched and its old question
still refuses; a same-value edit still refuses before anything is written.
Part kind: the existing `work_question`; Needs-you shows the successor's confirmation question,
which is the first moment "the replacement is ready" becomes literally true.

### 1.4 · Class C, a contract whose door no cut ticket owns (7 entries), DEFER

These four tickets each wrote a full, well-formed contract whose doors are `clara_authenticated`
only. Cutting them as written would ship tools that can only answer a grant refusal. None of #985,
#1000, #1030 or #1037 owns a migration that could open them, and no ticket asks for one.

**Recommendation: record each on its ticket and file one follow-up per lane; do NOT cut them.**
This follows the estate's own precedent three times over, #939 item 2, #940 item 3 and #960, each
of which declined a tool for exactly this reason. If the orchestrator instead wants them, each needs
its own ticket, its own migration and an owner ruling, because two of them (#947, #949) are acts a
person takes and their reports rule the lane human-only on purpose.

| entry | source | tool | blocked on |
|---|---|---|---|
| C1 · #946 | `reports/wave4-lane01-ticket946.md` § "Successor contract" | `read_payroll_posting_state` | `clara.list_review_queue` is `clara_authenticated` only (0020's grant discipline). The report names the remedy itself: mint `clara.get_payroll_posting_state(p_document)`: "a NEW migration's business, not a successor contract's". |
| C2 · #947 | `reports/wave4-lane01-ticket947.md` § "Successor contract" | `read_payroll_settlement_state` | `clara.get_payroll_settlement_candidates` is `clara_authenticated` only (0298). The report already refuses to propose an accept-via-chat tool. |
| C3 · #948 | `reports/wave4-lane01-ticket948.md` § "Successor contracts" item 1 | `read_agreement_terms` | half-reachable: `clara.get_document_extract` is agent-granted, but the POSTING verdict is read through `clara.list_review_queue` (and `clara._agreement_posting_verdict` is ungranted and must NOT be called from a tool). |
| C4-C7 · #949 | `reports/wave4-lane01-ticket949.md` § "Successor contract", items 1-4 | `read_tenancy_terms`, `confirm_tenancy_rent_plan`, `confirm_tenancy_rent_plan_revision`, `read_rent_settlement_candidates` | all ten 0300 doors are `clara_authenticated` only, and the report's own item 5 rules it: "this lane is a person's lane end to end, by design, and the rig-meta cohort says so (`TENANCY_RENT_0300_HUMAN_FNS`, ten names, zero machine-lane grants)… the confirmation is the human's act and there is deliberately no machine path to it." Items 1-4 and item 5 of that report contradict each other; item 5 is the measured one. |

**Amendment that rides with C2 and C4-C7 when they are ever built**
(`reports/wave4-lane01-fix.md` § "8 · Successor contracts"): `clara.settle_payroll_net_pay` and
`clara.settle_rent_payable` now return `status ∈ {'settled','awaiting_checker'}`, and on
`awaiting_checker` return `match_id: null`, `reason: 'high_stakes_needs_checker'` and
`eligible_checker_count`. **A caller that reads success from the absence of an error will tell a
person a settlement landed when it is a draft waiting for a second pair of eyes.** Also additive:
`get_rent_settlement_candidates` gains `candidate_window_days`; `get_tenancy_deposit_coding` gains
`deposits_account_balance_cents`, `coded_basis` and `deposits_sharing_account`, with `coded_cents`
narrowed to this deposit's own share.

### 1.5 · Class D, prompt stanzas and prohibitions, no tool (2 entries)

Both are recorded so the cut does not "complete" them by accident. They are the report authors' own
words, and each is a ruling the cut must obey rather than a capability it may add.

**D1 · #939: the fixed two-date question, and the write tool that must not exist**
Source: `reports/wave4-lane04-ticket939.md` § "Successor contract" items 1-3.
`clara.record_prepayment_stated_term` holds no agent grant and no wake wrapper (owner default 6,
2026-09-18), and 0305's §TAIL enforces that by `pg_proc` count. **A migration minting that grant must
not be written**: a service period a model supplied is a model-generated value entering a durable
artifact. No tool, no zod input, no door call, no part kind. Prompt stanza: the "Clara may ask
exactly two questions" paragraph. Refusal mapping for any surface that renders the door's answers,
six tokens listed in the report.
Also in that report, item 4, for A9's use: `clara.prepayment_schedule_v2(p_total_cents,
p_account_code, p_release_side, p_term_start, p_term_end)` is ungranted and reached from a definer
body; it is registered and frozen, so a changed formula is a `_v3` and never an edit.

**D2 · #940: the enrolment prohibition**
Source: `reports/wave4-lane04-ticket940.md` § "Successor contract" items 1-4.
`clara.enrol_prepayment_account` holds no agent grant and no wake wrapper, asserted by `pg_proc`
count in §TAIL. Enrolling an account is a judgement about a client's chart with unbounded blast
radius, and the reason it requires is a professional's statement. No tool, no zod input, no door
call, no part kind. Prompt stanza: the "Clara says so, says which account, and points at the
client's Registers page" paragraph: she never enrols and never proposes which account should be
enrolled. Refusal mapping: `prepayment_account_enrolment_invalid` by axis, plus
`prepayment_source_unfit` / `axis = prepaid_account_not_enrolled` with the panel named.
Item 1 also gives A8 the exact raise text for the roster check
(`clara._prepayment_account_enrolled(p_client, p_account_code, p_purpose)`, ungranted, reached from a
definer body).

### 1.6 · Class E, excluded by ruling (1 entry)

**E1 · #960, `set_firm_processing_caps`: EXCLUDE.**
Source: `reports/wave2-lane10-ticket960.md` § "Successor contract".
The orchestrator's ruling, 2026-09-25: **no ticket asks for this tool.** The report says so itself,
"Nothing here needs it *today*… Recorded for the wave-4 cut, should the owner want Clara to be able
to change a firm's caps conversationally." The scan-note precondition ("ask the owner once at the
cut") is answered by that ruling: it is not a default inclusion and it is not included. The contract
text stays where it is, complete and unbuilt, for whoever wants it later. **This is a note in this
plan, not a contract in the cut.**

### 1.7 · Class F, a different frozen family (1 entry)

**F1 · #990 / #1037, `statementFacts_v4`**, lane C2. See §3.2. Explicitly NOT absorbed into
`chatTurn_v22` / `claraWork_v6`, as the scan's precondition 6 requires.

### 1.8 · Class G, notes the cut must not mistake for contracts (2 entries)

**G1 · `reports/wave4-lane04-fix-3.md` § 7.2, the correction lane has no chat half.**
"Nothing frozen needs to change for this round, and nothing was changed." A conversational
correction would need an OBO twin in #915's shape
(`clara.replace_prepayment_schedule_for(p_client, p_author, p_schedule, p_reason, p_authority_ref,
p_op_key)`, `clara_runtime` only) **which does not exist today and is deliberately absent**, because
re-deriving a client's books is a judgement with a named person behind it. 0317's tail asserts the
absence by `pg_proc` count. The model must never supply the corrected TERM.
**The cut adds nothing here.** §7.1 (the web correction control) is a web ticket, not a cut item.

**G2 · `reports/wave4-lane03-fix.md` follow-up 2**: the rename `expense_account_code` /
`liability_account_code` → `pl_account_code` / `bs_account_code` was proposed "at the `chatTurn_v22`
cut". **It cannot be taken here**: those names are the database's own wire keys on `p_accrual` and
moving them needs a migration nobody reserved. A7 keeps the names and carries the side-aware
descriptions instead, which is what #942's own contract already writes.

### 1.9 · Roster summary

| class | entries | disposition |
|---|---|---|
| A, pure runtime edits, door exists and is granted | 11 | CUT in lane C1 |
| B, owed a door the cut ticket itself writes | 2 | CUT in lane C1, with migrations 0320 and 0321 |
| C, owed a door no cut ticket owns | 7 | DEFER; one follow-up per lane |
| D, prompt stanza / prohibition, no tool | 2 | CARRIED into the prompt bodies, no tool |
| E, excluded by ruling | 1 | note only |
| F, a different frozen family | 1 | CUT in lane C2 |
| G, notes, not contracts | 2 | no action |
| **total** | **30** | |

Contributing tickets: #915 #931 #933 #937 #939 #940 #941 #942 #945 #946 #947 #948 #949 #960 #982
#985 #986 #990 #1000 #1007 #1030 #1037 plus the three fix reports (`wave3-lane02-fix`,
`wave4-lane01-fix`, `wave4-lane04-fix-3`) and the corrected `wave4-lane05-fix`.

### 1.10 · Conflicts, and the order to apply them

Four contracts pair up on two tools, and two reports supersede two others. Apply in this order.

| tool / body | contracts | order and why |
|---|---|---|
| `start_trade_invoice_work` | A1 (#982) then A2 (#1007) | #982 adds the TIN tier and the 19th refusal token; #1007's probe then raises those same party refusals (`wave3-lane02-fix` amendment 2 says the probe can carry `matched_on = 'tin'`, which presumes #982 landed). **The token count is the trap:** #982 says "eighteen → nineteen", #1007 says "eighteen → twenty", each counting from the same base. Applied together the map holds **twenty-one** tokens, and #982's prompt-stanza sentence must read twenty-one, not nineteen. Do not collapse `party_identifier_conflict` into `party_ambiguous`. |
| `start_accrual_work` | A6 (#937) then A7 (#942) | `reports/wave4-lane03-fix.md`: "The cut must consume **both together**: #937's `period_amounts` key and #942's `side` key land on the same `p_accrual` jsonb." Build order follows the lane's own 938 → 937 → 942. The successor carrier module is minted ONCE and both deltas land in it. |
| `prepayment-schedule-basis` family | A8 (#915) then A9 (#941) | #941 copies #915's twin-door shape and its enrolment-question shape. Both are bound by D1 (the model never supplies a term) and D2 (the model never enrols an account); #940 item 1 supplies A8's exact raise text. |
| `read_opening_source` / `refresh_opening_source` | A4 (#985) and A3 (#986) **together** | the scan's precondition 4: a matched pair, and #985's "read again since last parse" mapping is re-measured against #986's shipped shape before the cut closes. Measured now: UNCHANGED; only the guidance beside it moves. |
| `claraWork_v6` particulars proposal | A10 | `reports/wave4-lane05-fix.md` § "The successor contract, CORRECTED" **supersedes §2 and §3** of `reports/wave4-lane05-ticket933.md`. Taking the ticket report's §2/§3 verbatim would ship the previous-calendar-day defect. |
| `#949` items 1-4 vs item 5 | C4-C7 | the report's own item 5 (measured, with a rig-meta cohort behind it) overrides items 1-4 (written under WAVE-4 LANE RULE (d) before the grant posture was measured). |

---

## 2 · The cut mechanics, as a checklist

Every command below assumes `export PATH="/c/Users/zhant/AppData/Local/pnpm:$PATH"` first.

### 2.1 · New files, per class

The convention, deduced from the v20 → v21 and v4 → v5 diffs: copy whole ONLY the files whose text
changes; re-export every unchanged predecessor symbol rather than duplicating it, so the closure
hash-locks the old text once. Each new body file carries `// @frozen` on line 1, that marker, not
the manifest, is what declares a file frozen; the closure is then WALKED from it
(`scripts/freeze-lint-closure.mjs:115-138`), following relative specifiers only.

**`chatTurn.v22.*`**: `chatTurn.v22.ts` (carries `"use workflow";` inside `chatTurn_v22`),
`.impl.ts`, `.prompt.ts`, `.tools.ts`, `.usage.ts`. Two hard names the bundle gate derives and
asserts (`scripts/check-workflow-bundle.mjs:143-164`):
- `chatTurn.v22.impl.ts` MUST export a step named exactly **`runModelSegmentStepV22`**;
- `chatTurn.v22.usage.ts` MUST stamp exactly **`chatturn-v22`**.
`buildToolsV22` extends `buildToolsV21`'s map rather than re-listing it, as v21 did over v20.
A `chatTurn.v22.parts.ts` is minted ONLY if a new wire kind is added, see §2.5.

**`claraWork.v6.*`**: `claraWork.v6.ts`, `.impl.ts`, `.prompt.ts`, `.tools.ts`, `.bundle.ts`,
`.errors.ts`. `.bundle.ts` must export `CLARA_WORK_BUNDLE_V6_BANNER` (bundle id `clara-work/v6`,
tool-roster id `clara-work-tools/v6`) and must hash `tools: {id, names, schemas, dependencies}` the
way v5's does, with `z.toJSONSchema`'s `target: "draft-07"` and `io: "input"` PINNED rather than
defaulted.

**`statementFacts.v4.*`** (lane C2), `statementFacts.v4.ts`, `.impl.ts`, `.behavior.mjs`,
`.prompts.mjs`, plus any genuinely new module. Do NOT copy `.dispatch.mjs` (import v2's relatively)
and do NOT copy `.services.mjs` (it is injected at boot, deliberately outside the freeze).

### 2.2 · The five registry edits per class

`packages/runtime/workflows/registry.ts:1030-1034` states the law itself: "A successor version
therefore needs exactly FIVE edits in this file and no edit anywhere else, and
`registry-view.test.mjs` reds on each one left out."

| class | 1 · import | 2 · dispatch | 3 · re-export | 4 · `workflowBodies` | 5 · `workflowPins` |
|---|---|---|---|---|---|
| `chatTurn` | after `:32` | `:220` → `chatTurn_v22` | after `:955` | after `:1056` | `:1101` → `"chatTurn_v22"` |
| `claraWork` | after `:37` | `:346` → `claraWork_v6` | after `:972` | after `:1061` | `:1102` → `"claraWork_v6"` |
| `statementFacts` | after `:43` | `:364` → `statementFacts_v4` | after `:812` | after `:1067` | `:1105` → `"statementFacts_v4"` |

Formatting is load-bearing, not cosmetic. `packages/runtime/tests/scratch-image.mjs:80-99`
(`rewriteRegistryToPrevious`) regex-asserts five EXACT textual shapes and throws if a substitution
does not apply, the dispatch line two-space indented with a trailing comma, the import line, the
bare `export { … };` line, the `workflowBodies` entry two-space indented with a trailing comma, and
the `workflowPins` entry. Deviate and the two-build drill breaks. Additionally
`scripts/freeze-lint-checks.mjs` refuses aliased re-exports, `export … from`, namespace or default
imports, and any import-side alias; each entry must read literally
`import { chatTurn_v22 } from "./chatTurn.v22.js";` … `export { chatTurn_v22 };`.

**Every superseded body stays imported, exported and rostered.** Policy (c),
`docs/ARCHITECTURE.md:428-429`. Removing one strands parked runs and refuses World startup
database-wide.

### 2.3 · The boot pins, and the one that was missed last time

`packages/runtime/plugins/startWorld.ts`:
- `:80-92` `emitProvenanceLine()`: the boot line that prints `pins chatTurn=… claraWork=…`; it
  reads `workflowPins`, so the repoint carries it.
- `:122` `strandedBodyCensusOnWorld(workflowBodies)`: the census that refuses to start the world.
- `:286-319`: the five `console.log(CLARA_WORK_BUNDLE_V<N>_BANNER)` lines. **`claraWork_v6` needs a
  SIXTH import and a SIXTH line, in the SAME commit as the registry repoint.** This is the last
  cut's one real defect: v5 shipped without its banner, the engine booted clean (`/health` 200,
  `/ready` 200, `stranded bodies n=0`) and **seven work-lane e2e legs failed** with the misattributed
  message "serve child did not become ready", because `tests/pinned-work-bundle.mjs`'s `waitBooted`
  blocks on that exact banner and its throw is swallowed by the caller's retry loop. Fixed in
  `5f2dfded6`; both call sites now carry the comment that says so.
- `packages/runtime/src/buildInfoRoutes.ts:35, :71-72`: serves `bodies` and `pins` on
  `/api/build-info`; the same commit fixed it for v5.

### 2.4 · The manifest

```sh
node scripts/check-frozen-workflows.mjs --print-closure packages/runtime/workflows/chatTurn.v22.ts
node scripts/check-frozen-workflows.mjs --print-closure packages/runtime/lib/<module>.mjs   # inverse
node scripts/check-frozen-workflows.mjs --update            # LOCAL ONLY; refuses under CI
node scripts/check-frozen-workflows.mjs --compare-base origin/main   # additions-only proof
node scripts/check-frozen-workflows.mjs                     # the verify gate
```

`--update` rehashes the closure union, preserves `deployed: true` and never grants it. The append-only
check (`:473-507`) then refuses `REHASHED-VS-BASE` on any deploy-locked path, which is why new files
are a free append and old ones are immovable.

**`--lock-deployed` is NOT a cut gate.** `packages/runtime/README.md:1037-1039`: run it "and commit
the manifest **after** the image is live, locking before deploy would freeze a body that no parked
run can yet exist for." It belongs to the hosted release ceremony (runbook step 11a), where the
operator first confirms the unlocked set is exactly this cut's additions, because the command locks
every unlocked entry globally. Note that the manifest today already carries **10 unlocked entries
from wave 4** (`payrollFacts.v1.*`, `agreementFacts.v1.*`); the release that locks this cut will lock
those too, and that is correct, they will be live by then.

**Note:** `node scripts/check-frozen-workflows.mjs` currently fails locally in this checkout with
`ERR_MODULE_NOT_FOUND: typescript` (the root `node_modules/typescript` is missing;
`scripts/freeze-lint-checks.mjs:14` imports it). Fix that in the lane worktree before relying on the
local gate, unverified whether the lane worktrees have it.

### 2.5 · The bundle gate and parts parity

```sh
pnpm build                                        # required first; a missing bundle is a FAILURE, not a skip
node scripts/check-workflow-bundle.mjs
node packages/runtime/scripts/check-parts-parity.mjs
```

The bundle gate derives every expectation from `registry.ts`: no version literal, and checks four
groups: the pin literal and the WDK directive per pinned class; no superseded pin surviving; a
directive per exported body (**resumability**); and chatTurn's step name, engine stamp and (for
N ≥ 16) the `type: "freeform_result"` emitter. No gate edit is needed for v22 provided §2.1's two
hard names are honoured.

Parts parity: **A8's `prepayment_schedule_configured` and A9's `revenue_recognition_configured` are
the only two roster entries that touch the wire vocabulary.** Read their reports precisely, #915
says `check-parts-parity.mjs` "must see it emittable at that cut". If either is a genuinely NEW
discriminant, the cut owes a `chatTurn.v22.parts.ts` declaring ONLY the new kind (re-exporting
predecessors by reference, the v2 and v19 pattern), an entry in `check-parts-parity.mjs`'s
`DEFAULT_DECLARERS` (`:33-54`), and the full seven-step web census in §2.6. If both kinds already
exist in `apps/web/lib/parts/types.ts`, neither step applies.

**The exemption ledger always needs rows**, kinds or no kinds.
`packages/runtime/scripts/parts-parity-exemptions.mjs` takes
`[path, enclosing export, property signature, statement sha256, AST locator]` and "requires exactly
one live match per tuple; zero is stale and two is ambiguous":
- `chatTurn.v22.ts` → **3** rows (`tool-call`, `tool-result`, `json`), mirroring v21's at `:423-425`;
- `claraWork.v6.ts` → **2** rows (`tool-result`, `json`), mirroring v5's at `:464-465`;
- the statementFacts v4 modules → as many as their spread sites carry (v3 needed 4, at `:349-354`).
Recompute every sha; do not copy. A sha moves when a COMMENT inside the statement changes, and these
statements carry the version number in a comment.

### 2.6 · The web parts census

`apps/web` names **zero** current pins, so a repoint alone touches nothing there. The census is owed
only if a wire kind is added:

1. `apps/web/lib/parts/types.ts`: the new `…Part` type, the `ClaraPart` union at `:432`, and the
   arithmetic comment at `:428-431`.
2. `apps/web/lib/parts/catalog.ts`: the render-branch or status-resolver registration.
3. `apps/web/components/parts/PartRenderer.tsx`: the branch.
4. a card component plus its harness test (the `V1xCards` pattern).
5. `apps/web/lib/parts/catalog.test.tsx:108`: **bump the count** (today 29 render branches + 2
   status resolvers = 31) **and add a by-name cell**. That file says of itself: "This test is the one
   cell in the suite that has to be EDITED by such a change rather than added to."
6. `apps/web/test/manifest.txt`: any new test file, verbatim, in alphabetical order.
7. the runtime side's new `.parts.ts` and its `DEFAULT_DECLARERS` entry.

Two forward references already exist and should be checked against what v6 actually ships:
`apps/web/components/work/work-question-form.tsx:170` and `:928` are written against
`claraWork_v6`'s proposal block (A10 delivers exactly that shape), and
`apps/web/components/work/work-question-proposal.test.tsx:19`, `:357` describe the `no_proposal`
branch as "every question opened before `claraWork_v6`". Optional polish:
`apps/web/lib/clara/toolLabel.ts`'s `CHAT_TOOL_TOKENS`: an unknown token is explicitly NOT a defect
there, so adding v22's tools is a nicety, not a gate.

### 2.7 · The lib modules that join a closure

The moment a frozen file relatively imports a non-frozen `lib/` module, that module is hash-locked
and may never be edited in place again, a hardening goes through the NEXT version closure
(`packages/runtime/README.md:749-752`, the owner ruling of 2026-09-15).

Already frozen and therefore SUCCEEDED, not edited: `lib/accrual-basis.ts`,
`lib/staff-expense-claim-basis.ts`, `lib/trade-invoice-basis.ts`.
**Not yet frozen and about to be locked by this cut:** `lib/prepayment-schedule-basis.ts` (A8),
`lib/fa-particulars-proposal.ts` (A10, whose own report says so), `lib/opening-parse.mjs` (A3/A4,
verified absent from `frozen-workflows.json` today; note it is also imported by
`src/openingRoutes.ts`, `lib/opening-tb-cells.mjs`, `lib/opening-tb-produce.mjs` and `lib/egress.mjs`,
so locking it freezes the opening lane's core for every caller).

Run `--print-closure` on each before writing the import, and record the decision in the cut report.
IMPORT-ESCAPE: a frozen file may reach first-party code ONLY through a relative specifier, never
`~`, `#`, `@/` or a workspace package name, or the checker refuses with `IMPORT-ESCAPE`.

### 2.8 · Docs in the same commits

- `packages/runtime/README.md`: a new `### The … pins the wave 2026-09-25 cut moved` section above
  line 22, copying the 22-60 template (per-body bullet stating exactly what each carries, whether a
  wire kind or `WORK_ACCEPTED_PURPOSES` moved, and the deploy-order sentence); keep the two existing
  sections, they are the version ledger in prose. Extend the "NEW modules, now frozen, that the
  cut imports" ledger (`:1348-1407`) with §2.7's three modules. Refresh "Requirements carried by the
  next frozen `claraWork` version" (`:1408`). The `#656` section (`:1546-1619`) records
  `read_opening_source` as owed and not yet taken, this cut takes it, so that section moves from
  owed to delivered.
- `CONTEXT.md` for any new vocabulary, house "term / _Avoid_" shape.
- `docs/ARCHITECTURE.md:171`, `:183`, `:207`, `:445` carry pins that were already wrong before this
  cut ("chatTurn → chatTurn_v19, claraWork → claraWork_v3"; the last cut left them and they were
  never synced, recorded in `docs/PROGRESS.md` Known Issues). Per `AGENTS.md` rule 4 a blueprint
  edit belongs to a wayfinder session, not a ticket; **record the drift in the cut report and hand
  it to the orchestrator** rather than editing it inside a lane.

### 2.9 · The release runbook's obligations for a version cut

Deploy order, unchanged across every wave
(`RELEASE-W4-RUNBOOK.md:295-298`; `RELEASE-RUNBOOK-0225-0233.md:228`):

> **ORDER: database first, then the runtime image by digest, then the web promotion. The machine is
> STOPPED before the migrate and started again only on the NEW image.**

For this cut that order is not merely a preference. `packages/runtime/README.md:53-55` records the
asymmetry the last cut measured: on the chat lane a missing function is a typed refusal and the turn
survives; **on the Work lane it is TERMINAL.** So if #1000's or #1030's migration is what a v22/v6
body calls, the migration cannot trail the image, and the runbook must say so in the body's own
stanza, as v5's did ("Deploy 0230 first, without it EVERY Work stops, which is the correct failure
for a deploy-order mistake").

The image is released **by `sha256:` digest, never by tag**. The web version is uploaded and NOT
promoted until the runtime is verified.

**Rollback preflight (step 9, READ ONLY, do not roll back)**,
`node packages/runtime/scripts/rollback-preflight.mjs --target-bundle <previous image's extracted
index.mjs>`, or `--target-build-info -` piped from the previous image's `/api/build-info`, through
the LIVE machine's DSN, with the bundle extracted from a SECOND probe on the old image, never from
the live machine. Three gates, and the runbook must say which is demonstrated: (a) `FRONTIER_RULES`'
body rules; (b) `FRONTIER_RULES`' door-contract rules; (c) the stranded-body census. Exit 0 =
ALLOWED, 1 = REFUSED, 2 = could not answer, and 2 is never read as either of the others.

**The obligation this cut adds.** A wave that only ADDS bodies keeps the rollback direction trivially
clean. A wave that REPOINTS a pin makes the previous image a stranding target the moment the first
non-terminal run of a new body exists. The v21/v5 runbook wrote it plainly
(`RELEASE-RUNBOOK-0225-0233.md:500-504`):

> "`refresh-a296765c` does not carry `chatTurn_v21` or `claraWork_v5`. It is a legal rollback target
> **only until the first non-terminal run of either exists** — so gate (b)'s clean result is a
> snapshot, not a standing guarantee, and it degrades within minutes of the image serving."

So step 9 runs **immediately after step 7, before real traffic can create a run on a new body**, and
is recorded explicitly as a snapshot with its timestamp.

Extraction hazard, named twice already: the sftp extraction stalled at 32 KB twice at the wave-2
window; stream the bundle over `ssh console` and verify it by `sha256sum` against the machine's own.

**The stranded-body rule, stated for the runbook.** A run parked on `chatTurn_v21` or `claraWork_v5`
keeps its body: the new image carries v21 and v5 too, and every version before them. Policy (c),
`docs/ARCHITECTURE.md:428-429`: "带在途 run 的导出不可改名或删除." The boot census enforces it before
`getWorld().start()` and the refusal is database-WIDE, not process- or lane-scoped
(`packages/runtime/README.md:569-614`). An engine that boots against a non-terminal run whose body it
does not export re-enqueues it, the replay raises `ReplayDivergenceError`, and the crash-only
supervisor exits 1. Under Fly that is a restart loop, not a park
(`README.md:930-935`). `CLARA_ALLOW_STRANDED_BODIES=1` overrides visibly and is not used at a
release.

---

## 3 · The lanes

### 3.1 · Lane C1, `chatTurn_v22` + `claraWork_v6`

| field | value |
|---|---|
| branch | `riders/cut-lane01`: **ONE branch**, cut from `main` at `6da02a8de` |
| worktree | `C:\Users\zhant\Desktop\clara-wt\635` |
| database | `clara_l01` on `127.0.0.1:55741`, re-migrated from scratch to **309 files / `0318`** |
| Playwright triple | `https://127.0.0.1:3500` / `3501` / `3502` |
| reserved migrations | `0319` (#985), `0320` (#1000), `0321` (#1030) |
| adversarial lens | YES, on the whole lane |

**Why one branch.** Every ticket in this lane writes into the SAME new version files. A per-ticket
branch would mean three implementers each copying v21/v5 from scratch and three three-way merges of
a 26 KB tools file. The `/implement-spec` rule that each ticket gets a FRESH implementer context is
kept, three fresh implementers in sequence on one branch, each reading
`git log 6da02a8de..HEAD` and the earlier tickets' reports first, exactly as a wave-2-and-later lane
works. What changes is only that they share the branch rather than each holding one.

**Step order.**

| step | who | what |
|---|---|---|
| 0 | orchestrator | re-migrate `clara_l01` to 0318, confirm the frozen-manifest lock is clean on `main`, confirm the roster in §1 against the merged reports one last time |
| 1 | FRESH implementer | **#985**: `read_opening_source`. Cuts `chatTurn.v22.*` (the whole file set, §2.1) plus the five registry edits, and lands the tool. Its reserved `0319` is expected UNUSED (§1.2 A4); if it is genuinely needed the implementer says why. |
| 2 | FRESH implementer | **#1000**: `read_client_financial_pack`. Writes migration `0320` (the wake wrapper, its grant, its allowlist row) and the tool. |
| 3 | FRESH implementer | **#1030**: the re-derivation caller. Writes migration `0321`, the `claraWork.v6.*` file set if step 1 or 2 has not already minted it, and the five claraWork registry edits. |
| 4 | two-axis `/code-review` | Spec and Standards in parallel, reported side by side, Standards carrying the Fowler smell baseline, over the WHOLE lane diff `6da02a8de..HEAD`. Plus the adversarial lens on the whole lane. Then a fix round and a recheck. |
| 5 | FRESH implementer, the successor-contract worker | applies the ENTIRE Class A + Class D roster (§1.2, §1.5) onto `chatTurn.v22.*` and `claraWork.v6.*` in the conflict order of §1.10, mints every walk §4.5 names, and writes the cut report. |
| 6 | two-axis `/code-review` + adversarial | over step 5's diff. Fix round, recheck. |

**Which contracts need a database door from the cut tickets, and which are pure runtime edits.**
Pure runtime, no migration: A1 #982, A2 #1007, A3 #986, A4 #985, A5 #931, A6 #937, A7 #942,
A8 #915, A9 #941, A10 #933, A11 #945, D1 #939, D2 #940. Thirteen entries, every door measured
present and granted in §1.1.
Needs a door from its own cut ticket: B1 #1000 (`0320`), B2 #1030 (`0321`).
Needs a door NOBODY owns, therefore deferred: C1-C7.

**Rig caution.** `clara_l01`'s cluster has already run one from-scratch chain, and migration 0154
pins a cluster-wide role count. A second from-scratch chain on a reused cluster needs the #867 recipe
(`packages/db/README.md`, "From-scratch reapply on a reused cluster"), or a fresh cluster. The
orchestrator does the re-migrate in step 0 and records which route it took. Lanes never run the
from-scratch proof themselves; the integrator runs it on a disposable cluster.

### 3.2 · Lane C2, `statementFacts_v4`

| field | value |
|---|---|
| branch | `riders/cut-lane02` |
| worktree | `C:\Users\zhant\Desktop\clara-wt\636` |
| database | `clara_l02` on `127.0.0.1:55742`, re-migrated to 309 files / `0318` |
| Playwright triple | `https://127.0.0.1:3510` / `3511` / `3512` |
| reserved migration | `0322`, **expected UNUSED** |
| adversarial lens | no |

Ticket: **#1037**, the producer half of #990. Contract:
`reports/wave3-lane08-ticket990.md` § "Successor contract".

**No new door and no migration.** `clara.persist_statement_facts_v2(p_task uuid, p_payload jsonb)`,
argument order unchanged, already accepts the citation, and 0291 already carries the column, the
CHECK and the persist core's guard. That is why `0322` is reserved and expected unused. What widens
is what `statementFacts_v4`'s own builder puts into `p_payload.readers.reader1.lines[i]`: two
optional keys, `page: z.number().int().min(1).optional()` and `region: z.record(z.unknown()).optional()`,
**both present or both absent**.

Refusal mapping is inherited for free: a malformed per-line shape raises CLR10 `{"reason":"chain_broken"}`;
a citation on a lane with no second reader raises CLR10 `{"reason":"internal"}`. Both are already
proven by cells 990.c and 990.d. Part kind: none, this is a jsonb payload field on an existing
SECURITY DEFINER call.

The actual work is the prompt stanza and the response mapper.
`statementFacts.v2.dispatch.mjs`'s `readStatementWitnessCitationRegions(client, ocrExtractionId)`
(lines ~166-192) already returns every region in reading order as `{idx, page, text_content}`,
numbered by `clara.witness_citation_regions`'s own ordinal. `statementFacts.v4.prompts.mjs` adds ONE
instruction to the vision-channel prompt: for each statement line reported, name the `idx` of the
region it was read from. `statementFacts.v4.behavior.mjs`'s response mapper resolves that `idx` back
to `{page, region}` through the SAME join the dispatch already performs, and attaches it to the
matching `reader1.lines[i]` before the payload reaches the persist door.

**Three costs the ticket's acceptance criteria imply and that are worth pricing before the lane
starts.**
1. AC3 asks the two-build cutover drill to pass for the statement-facts family. `deriveVersionPair`
   in `packages/runtime/tests/scratch-image.mjs:52-68` has legs for `claraWork` and `chatTurn` only;
   a `statementFacts` leg is NEW work in that file and in the drill.
2. `packages/runtime/tests/f-a2-statement-header-v3.test.mjs:11-12` carries a drift guard that parses
   the `clara.bank_institutions` seed out of migration 0038 and asserts 0038 is still the only file
   seeding it, "a later additive migration must red this cell and force a v4". A
   `f-a2-statement-header-v4.test.mjs` sibling is owed.
3. The engine-literal pairing (`STATEMENT_WITNESS_ENGINE_SNAPSHOT` against the router's DB literal,
   `registry.ts:616-619`, `statementFacts.v2.ts:47`) is a hand-checked invariant with no automatic
   gate. Re-check it by hand at the v4 cut and say so in the report.

**C2 is independent of C1** and can run in parallel. The two lanes touch `registry.ts` in different
places; the merger applies C1 first, then C2, and re-reads the two hunks against each other (wave-4
rule 3).

---

## 4 · Gates

Every gate below runs in the lane worktree with the RIG.md environment. Counts are reported, not
claimed.

### 4.1 · Per lane, before the lane reports

```sh
# typecheck and lint, as the runner sees them
pnpm typecheck
CI=true GITHUB_ACTIONS=true pnpm lint

# build, then the two post-build gates IN THIS ORDER
pnpm build
node scripts/check-worker-paths.mjs
node scripts/check-workflow-bundle.mjs
node packages/runtime/scripts/check-parts-parity.mjs

# the freeze chain
node scripts/check-frozen-workflows.mjs
node scripts/check-frozen-workflows.mjs --compare-base origin/main     # additions-only proof
node scripts/check-frozen-workflows.selftest.mjs
node scripts/check-frozen-workflows.registration.selftest.mjs

# THE WHOLE runtime suite, once, at the end
pnpm --filter @clara/runtime test
```

The whole suite is not optional and a targeted run does not substitute for it. The last cut's own
record: "The suite is what caught three of this cut's four own misses, `p6-1-parts-parity`'s literal
census, the two pin cells that asserted the superseded pin as a string literal, and `l9-build-info`'s
`bundles: [...]` census. The World battery caught the fourth and worst, the missing banner. A grep is
not a census, and a targeted run is not the suite."

Named Windows-only reds that are reported as such and never "fixed": `intake-unit` (#693 EICAR),
`pg-tools-fixture` (#806, no `pg_dump` on PATH), `rollback-preflight` `637.pf: B3` (shared-database
contamination), `wake-engine` M1 and `relay-runner` (green alone), plus RIG.md's standing list.

### 4.2 · The version gates

```sh
node --test packages/runtime/tests/registry-view.test.mjs
node --test packages/runtime/tests/p6-1-parts-parity.test.mjs
node --test packages/runtime/tests/p6-1-chatturn-v16.test.mjs          # invokes the bundle gate
node --test packages/runtime/tests/local-db-gate-drivers-census.test.mjs
node --test packages/runtime/tests/built-bundle-gate.test.mjs
node --test packages/runtime/tests/rollback-preflight.test.mjs
node --test packages/runtime/tests/runtime-contracts.test.mjs
```

`registry-view.test.mjs` is the drift guard: its cell at `:92-100` reds if `export { chatTurn_v22 }`
lands without the `workflowBodies` entry, and `:102-118` asserts every pin value is in
`workflowBodies` AND that `registryModule[id] === workflows[className]`.

`local-db-gate-drivers-census.test.mjs`'s `DRIVERS` roster (`:34-58`) **reds on a new `*-e2e.mjs`
file's first day** unless it is added there or to `NON_GATE_E2ES` with a reason. The cut adds
`chat-turn-v22-e2e.mjs`, so that roster is an edit, not an oversight.

### 4.3 · The version-cutover e2e

```sh
# cwd = packages/runtime, against a migrated + seeded + World-bootstrapped database
PGHOST=127.0.0.1 PGPORT=<lane port> PGUSER=postgres PGDATABASE=clara_rt_test \
WORKFLOW_POSTGRES_URL=postgres://postgres@127.0.0.1:<lane port>/clara_rt_test \
  node tests/version-cutover-e2e.mjs
```

It stages a parked run on the retained `chatTurn_v7` fixture and cuts a second turn over to whatever
`registry.ts` currently pins, proving the parked run resumes on its ORIGINAL body. It derives the
newest export rather than hardcoding it, and asserts only that the derived newest entry EXISTS and
is hash-locked, its `deployed` flag is ceremony-dependent. **So this file needs no edit for v22.**
It tolerates a rig with earlier suites' leftovers but must not share a host with a concurrently
running suite.

### 4.4 · The two-build cutover drill, on a fresh cluster

```sh
# cwd = packages/runtime; PGDATABASE must be clara_rt_test or clara_wave_b_ci; the gate THROWS otherwise
PGHOST=127.0.0.1 PGPORT=<port> PGUSER=postgres PGDATABASE=clara_rt_test \
WORKFLOW_POSTGRES_URL=postgres://postgres@127.0.0.1:<port>/clara_rt_test \
RELAY_TEST_MODE=1 node tests/two-build-cutover-e2e.mjs
```

It needs a **pristine** database and refuses to start (exit 1, named reason) if the database already
carries live accounting-Work state. CI's own route, which the cut copies: migrate and seed
`clara_wave_b_ci`, bootstrap the World on it, then
`create database clara_rt_test template clara_wave_b_ci`: a template copy rather than a second
migrate, because 0154 pins a cluster-global role count. The reason it cannot share a database is
measured: run 34793833626, where a parked `claraWork_v2` run left by a Wave-B e2e refused the drill
outright.

After the cut it exercises **two** legs, `claraWork` v5 → v6 and `chatTurn` v21 → v22, both derived
from `registry.ts`, and both depend on §2.2's exact textual shapes. A `statementFacts` leg is new
work (§3.2 cost 1).

### 4.5 · The walks, one chat and one Work per successor body

```sh
# chat, cwd = packages/runtime
PGHOST=127.0.0.1 PGPORT=<port> PGUSER=postgres PGDATABASE=clara_wave_b_ci RELAY_TEST_MODE=1 \
WORKFLOW_POSTGRES_URL=postgres://postgres@127.0.0.1:<port>/clara_wave_b_ci \
  node tests/chat-turn-v22-e2e.mjs
```

`chat-turn-v22-e2e.mjs` plus its own `chat-turn-v22-serve.mjs` child bootstrap, a separate file per
version, on purpose. Register the e2e in `.github/actions/db-live-gates/action.yml` and in the
`DRIVERS` roster (§4.2).

Three legs the roster explicitly buys and that the walks must carry:
- #931 item 10, one chat turn naming two advances → one Work → one posted entry with one credit leg
  per advance account → two `clara.staff_advance_applications` rows. Every db-side assertion already
  exists in `packages/db/tests/staff-expense-claim-allocations.test.mjs` and can be lifted.
- #937 and #942, on `packages/runtime/tests/accrual-e2e.mjs` (which already admits a `clara_l<NN>`
  database name): a two-period `stated_period_amount` accrual whose two entries carry the two
  different stated amounts, and a revenue accrual whose entry carries Dr the asset / Cr the income
  account.
- #915, a real World leg driving `start_prepayment_schedule_work` end to end, which #915's own lane
  could not run.

**Two traps the last cut's own legs fell into, both to be designed out rather than discovered:**
1. *Testing something false.* v21's replay leg drove a SECOND chat turn with the same payload and
   expected one Work, but the intent key is `stableOpKey(ctx.taskId, TOOL, input)` and a second turn
   carries a different task id, so the door correctly admits a second Work. "Without the control the
   count would have passed for the wrong reason."
2. *Speaking for another run.* These legs share throwaway databases carrying every earlier run's
   Works; a fresh engine's reconciler dispatches one, which reaches the same script, reads the same
   env-supplied record id against ANOTHER firm and is correctly refused. The leg then reports the
   stranger's refusal as its own tool failing, intermittently, "which is the worst way to be wrong."
3. And the one the harness hid: v21's ADV-S-1, three tools were unreachable because the knowledge
   block named no `record_id`, and the World leg supplied the id out of band, so "a tool whose only
   identifier is absent from the prompt still 'worked' because the harness knew the id." **Every new
   tool's identifier must reach the model through the prompt, and the leg must not supply it out of
   band.**

Work walk: the `claraWork_v6` half through the Work lane, covering A10's park-with-proposal and
confirm path and A8/A9's term and enrolment questions.

### 4.6 · The browser suite

If any web file moves (the parts census, the `catalog.test.tsx` count, a message key):
`node scripts/run-tests.mjs` from `apps/web`: the WHOLE unit suite once, plus each browser walk
touched through `pnpm --filter @clara/web e2e <spec>` on the lane's own Playwright triple. Never a
bare `npx playwright test`; it serves a stale build (#865). If no wire kind is added, the web side is
untouched and this gate is a no-op that is still run and reported as such.

### 4.7 · The db suite for the new doors

From `packages/db`, for the two new migrations only:
`node --test --test-concurrency=1 $GATES tests/<file>.test.mjs` where `$GATES` is the exact list of
`--import ./tests/*-preintegration-gate.mjs` flags in `packages/db/package.json`'s `test` script,
plus `operation-census.test.mjs` and `rig-isolation.test.mjs` (never with the reset flags).
Each migration carries the house shape: header, prestate with `sha256(prosrc)` pins **MEASURED on the
lane database now** (naming the rig they were measured on, wave-4 rule 2), the change, tail
assertions, a preintegration gate module with a stable stem, a rig-meta cohort, and the gate-chain
entry in migration order. The FIRST-APPLY branch is proven separately inside a rolled-back
transaction (wave-3 addendum), and any redo is recorded.

### 4.8 · The lane's recheck scope

Wave-4 rule 7: **a lane's recheck scope includes the web pins corpus whenever a migration file
changed, even a comment**. Rewriting a comment above a migration moves the file's content hash, and
lane 01 of wave 4 found that only at the integration gate. Both C1 migrations are in scope.

---

## 5 · Risks, and what the last cut's record says went wrong

**R1 · Seven of the thirty roster entries name a door the chat lane cannot reach.** This is the
largest risk in the plan and it is a design question, not a bug: #946, #947, #948 and #949's four
tools were written as full contracts against `clara_authenticated`-only doors. Cutting them as
written ships tools that can only answer a grant refusal; the estate has already declined a tool for
exactly that reason three times (#939, #940, #960). §1.4 recommends DEFER with one follow-up per
lane. If the orchestrator wants them, the cost is one migration per lane, an owner ruling for the two
that are acts a person takes, and a re-read of #949's own item 5, which rules the tenancy lane human
by design.

**R2 · The missing banner.** The single real defect of the v21/v5 cut. `claraWork_v6` needs a sixth
`CLARA_WORK_BUNDLE_V6_BANNER` line and import in `plugins/startWorld.ts` **in the same commit as the
registry repoint**, and the matching identity in `src/buildInfoRoutes.ts`. Without it the engine
boots clean on every visible signal and the whole work-lane e2e battery fails with a message about
HTTP readiness that is simply false. Both call sites now carry a comment saying so, written by the
cut that paid for it.

**R3 · The literal censuses that grow at every cut, and the pins asserted as string literals.**
`p6-1-parts-parity.test.mjs` pins kind + file, so it grows at every cut and only the whole-suite run
catches it. The v21/v5 cut also found two pre-existing cells asserting the superseded pin as a bare
string literal, and the version-cutover file's own header records the same class biting CI silently:
"this test used to HARDCODE the concrete 'newest' literal (v8), which went stale the moment a later
PR repointed chatTurn to v9 and broke CI silently-until-red." Grep for `chatTurn_v21`,
`claraWork_v5` and `statementFacts_v3` across `packages/runtime` before reporting, **216
occurrences across 45 files today**, and decide file by file whether each is a retained-body
reference that must stay or a "newest" pin that must move. `apps/web` names zero current pins.

**R4 · A lib module joins a closure and is frozen forever.**
`lib/prepayment-schedule-basis.ts`, `lib/fa-particulars-proposal.ts` and `lib/opening-parse.mjs` are
all editable today and all become immutable the moment v22/v6 imports them. `opening-parse.mjs` is
the sharpest case: four other non-frozen modules import it, so freezing it freezes the opening lane's
core for every caller. Run `--print-closure` on each before writing the import and record the
decision.

**R5 · The bundle digest is blind to zod refinements.** ADV-S-4 from the last cut's adversarial
review: a `claraWork_v6` that relaxes `workQuestionFieldSchema`'s `.superRefine` rule "ships under an
unchanged digest with an unchanged name". v5's digest hashes `tools: {id, names, schemas,
dependencies}` with `z.toJSONSchema`, which does not see a refinement. Any refinement change in v6
must be stated in the cut report by hand, because no gate will state it.

**R6 · The rollback target degrades within minutes.** Gate (b) of the rollback preflight is a
snapshot, not a guarantee: the previous image does not carry v22 or v6, so it is a legal target only
until the first non-terminal run of either exists. Run step 9 immediately after step 7 and record
the timestamp.

**R7 · Two migrations in one lane, and the overflow rule.** Wave-4 rule 1: the orchestrator assigns
overflow migration numbers on request and a fix worker never picks one. Two fix rounds in wave 4 each
took "the next free number" and both landed on `0317`. If a C1 fix round needs another migration, it
asks; the overflow block for the cut phase starts at `0323`.

**R8 · Blueprint drift, already two cuts old.** `docs/ARCHITECTURE.md:171`, `:183`, `:207` and `:445`
carry pins that have been wrong since the 2026-09-15 cut and were not synced by the 2026-09-18 one.
Per `AGENTS.md` rule 4 the fix belongs to a wayfinder session; this cut records it rather than
editing a blueprint inside a lane, and the orchestrator carries it.

**R9 · Two lanes touch `registry.ts`.** C1 edits the chatTurn and claraWork lines, C2 the
statementFacts line. Wave-4 rule 3: the later file recuts from the earlier file's post-image and no
cell on either branch alone catches a mistake; the merger reads the two hunks against each other.

---

## 6 · Preconditions, restated as a checklist the cut confirms before step 1

1. The merged wave-4 head is on `main`: **confirmed**, `6da02a8de`, PR #1053.
2. `node scripts/check-frozen-workflows.mjs` clean on that head, **to be run in the lane worktree**;
   see §2.4's local `typescript` note.
3. The roster re-read against the merged reports, **done, §1**, and it changed: four tickets' worth
   of contracts moved to DEFER on a grant measurement, and #985's door turned out to already exist.
4. #985 and #986 cut as a matched pair, with #985's re-measurement recorded, **measured, §1.2 A4**:
   the mapping is unchanged; only the guidance beside it moves.
5. #960 asked and answered, **EXCLUDE**, §1.6.
6. #990 not absorbed here, **confirmed**, it is lane C2's own family cut, §3.2.
7. ONE assignee, ONE ceremony: the cut is built and reported as a single unit per lane, not per
   contributing ticket.
