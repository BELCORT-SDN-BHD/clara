-- 0036_wave_c0_deferred_belts.sql — the Wave-C0 clearing batch: four DEFERRED ledger
-- items plus one owner-approved pack fix, all DB-side recuts, landed together before
-- Wave C's own schema work begins.
-- §A (#52) the nonzero-tax belt — SAFETY-CRITICAL, the reason this migration lands
-- first; §B (#51) settle_autodraft_task's losing-dispatch honesty; §C (#53) the shared
-- attempt budget made VISIBLE on the queue read; §D (#4) the sales mis-route gate on the
-- purchase-only unattended drafter; §E MSIC reaches the context pack (the interviewed
-- industry code was committed into onboarding_plan_items and then read by nothing).
--
-- =====================================================================================
-- §A (#52) — THE NONZERO-TAX BELT. What was actually wrong, verified by reading the code.
-- =====================================================================================
-- clara._assert_supplier_bill_shape_at (0016:3817-3952, never recut since — 0022 and 0023
-- both only ASSERT on its prosrc, and 0023's own header states "NO change to
-- _assert_supplier_bill_shape_at") wraps its ENTIRE purchase tax tie in
-- `if v_sstp_legs > 0 then ... end if` with NO else branch. The tie is therefore
-- LEG-DRIVEN: it fires only once an sst_purchase_cost leg is already present, and then
-- asks whether the document states a matching tax. The three corners it covers are
-- (leg, no fact) -> refuse, (leg, fact, mismatch) -> refuse, (leg, fact, exact) -> pass.
-- The FOURTH corner — the document STATES a nonzero tax and the entry carries NO
-- sst_purchase_cost leg at all — is simply not asked about, so a plain 2-leg
-- Dr expense(gross) / Cr payable(gross) bill on a document printing a real SST amount
-- passes the shape assert cleanly, and (because the sst_purchase_cost account is
-- expense-typed by CHECK, so expense total = gross either way) it also passes the
-- verified-total tie at the bottom of the same function untouched. Nothing else catches
-- it. Today this is safe ONLY because the one bound production vendor genuinely prints
-- "SST Amt @ 6%: 0.00" (ADR-050 / the autoDraft v5 SST-zero precedent) — an operating
-- accident, not a control.
--
-- WHAT THE BELT IS, AND WHAT IT IS NOT — stated honestly, because the arithmetic case
-- against it has to be answered rather than ignored. A 2-leg bill on a nonzero-tax
-- document is NOT arithmetically wrong: Malaysian purchase SST has no input-tax credit
-- (PRD invariant 12), so the tax IS in cost, and expense=gross holds whether or not the
-- tax portion is split out. The sst_purchase_cost leg is a VISIBILITY split (0016's own
-- WA21-R1 wording), not a different total. So the belt does not claim to catch a wrong
-- number; it claims that when the document states a tax figure, that figure must be
-- VISIBLE in the books rather than silently buried in an expense account — and, more
-- pointedly, that the ONE shape for which the owner has actually ruled the 2-leg form
-- correct is the SST-ZERO shape (ADR-050, from the client's own four previously-approved
-- EZSEC bills). No precedent exists for the nonzero case, so the nonzero case must reach
-- a human instead of taking an untested path unattended. Refusing is the conservative
-- posture and it is reversible by a human (draft the split); accepting is neither.
--
-- WHERE IT GOES, AND THE REVERSAL GATING (verified, not assumed — the work order required
-- this be checked rather than presumed). The supplier_bill-specific block in
-- _assert_supplier_bill_shape_at opens with `if e.coding_kind = 'supplier_bill' and
-- e.reversal_of is null then` (0016:3835) — every check inside it, including the existing
-- sstp tie, is already reversal-gated. ONLY the very first, unconditional check ("every
-- control-class line requires a counterparty") sits outside that gate. The belt is
-- attached as the `else` of the existing `if v_sstp_legs > 0` — i.e. INSIDE that block —
-- so it inherits the identical `e.reversal_of is null` gating by construction, and a
-- reversal mirror (which clara.reverse_entry copies journal_lines VERBATIM from an
-- original that may legitimately be 2-leg) can never be caught by it. This is the same
-- gating fact 0035's header established from the other direction.
--
-- THE THREE STATES OF "STATED TAX", kept precisely distinct (the work order's explicit
-- requirement). v_tax is read from the SAME source the existing branch uses and no other:
-- clara._invoice_fact_state(e.document_id) when p_extraction is null, else
-- clara._invoice_fact_state_at(e.document_id, p_extraction) — one figure, one source of
-- truth, so a pinned-extraction approval and the belt can never disagree about what the
-- document says. The three cases:
--   * NO DOCUMENT (e.document_id is null) -> v_tax is null -> NO raise. A document-less
--     manual bill states nothing.
--   * NO EXTRACTION, or an extraction that states no tax_total_cents at all -> the fact
--     state is '{}' or lacks the key -> ->>'tax_total_cents' is null -> nullif(...) is
--     null -> v_tax is null -> NO raise. ABSENCE IS NOT A NONZERO CLAIM. This is the
--     single most important negative: every OCR bill in the live corpus that never
--     produced invoice.tax_total keeps behaving exactly as it does today.
--   * STATES ZERO ("SST Amt @ 6%: 0.00") -> v_tax = 0 -> NO raise. The zero-stated
--     figure documents "no tax charged"; the 2-leg form is the owner-ruled correct shape
--     for it (ADR-050) and a zero-amount visibility leg would convey nothing.
--   * STATES NONZERO -> v_tax <> 0 -> RAISE. `<> 0` rather than `> 0` deliberately: a
--     negative stated tax is equally a nonzero claim the entry is ignoring, and there is
--     no reading under which silently accepting it is correct.
--
-- ERRCODE, BY PRECEDENT (the work order asked for the reasoning, not just the choice).
-- Within this very function CLR23 carries the leg-SHAPE refusals (no receivable leg, no
-- payable debit leg, a payable credit required, rounding materiality, no sst_output leg,
-- at most one sst_purchase_cost leg) while the two TAX refusals — the only two that
-- compare the entry against the document's stated tax figure — are both CLR21 with
-- detail reason tax_tie_failed. The belt is the exact fourth corner of that same 2x2 tie,
-- evaluated from the fact side instead of the leg side, so it belongs to the CLR21
-- tax-tie family, not to the CLR23 shape family. CLR21 it is.
--
-- REASON TOKEN — a NEW one, tax_leg_missing, not the existing tax_tie_failed. Checked the
-- consumer before choosing: packages/runtime/workflows/autoDraft.v5.errors.ts maps CLR21
-- detail reasons through `CLR21_REASON_MESSAGES[reason] ?? MESSAGES.CLR21`, and
-- tax_tie_failed is NOT a member of its Clr21Reason union — so the EXISTING tax-tie
-- refusals already fall back to the generic "This bill cannot be coded as proposed."
-- copy. A new token therefore costs exactly nothing relative to reusing the old one (both
-- fall back identically, both preserve the raw reason for diagnosis) while buying real
-- precision: the human remedy differs sharply between "the leg's amount is wrong" (fix
-- the amount) and "there is no leg" (add one — which, per the ADR-050 diagnosis, may
-- first require an sst_purchase_cost account on the client's chart at all). NO runtime
-- change is REQUIRED by this choice; adding tax_leg_missing to the union + message map is
-- an optional copy improvement for a future autoDraft/chatTurn version and is reported as
-- such, never smuggled in here (workflow bodies are frozen).
--
-- EXACTLY WHICH CURRENTLY-PASSING ENTRIES NOW REFUSE — the enumeration the work order
-- demanded, derived from the code because live cannot be queried from this lane:
--   (1) any supplier_bill draft, reversal_of null, whose bound document states a NONZERO
--       invoice.tax_total, which carries ZERO sst_purchase_cost legs, AND whose DEBIT SIDE
--       IS PURELY EXPENSE-TYPED (at least one expense-typed debit leg and NO non-expense
--       debit leg) — at clara.approve_entry, at
--       clara.execute_rule_post (which reaches this assert through
--       clara._approve_entry_core, 0029:241), and again at COMMIT through the deferred
--       constraint trigger t_je_supplier_bill_shape (0009:534-537), whose 1-arg delegate
--       pins p_extraction null.
--   (2) NOTHING ELSE. Zero-stated, absent-tax, document-less, non-supplier_bill, and
--       every reversal mirror are all untouched; every shape that already carries an
--       sstp leg keeps its existing three outcomes byte-for-byte; and any bill with a
--       NON-EXPENSE DEBIT LEG — a purely capitalised purchase, or a MIXED asset+expense
--       bill — is deliberately untouched. The belt's own comment carries the full
--       reasoning; in short, the only belt-satisfying shape is a debit to the
--       expense-typed sst_purchase_cost account tied to the FULL stated tax, so on a
--       mixed bill it would expense the capitalised portion's share of the tax and
--       understate the asset, and on an UNCORROBORATED document there is not even an
--       amount_override path — an unconditional belt would leave a correct mixed entry
--       with NO approvable shape at all, blocking a RIGHT entry rather than a wrong one.
--       Mixed and pure-asset bills are therefore GATE-P TERRITORY: the tax-allocation
--       model they need does not exist yet, and a belt must not claim a shape it cannot
--       offer a compliant remedy for. They are not silently green either — on a
--       CORROBORATED document the draft-time W1 comparator (0009:1355-1363) is
--       expense-centric, so an expense-sum that differs from the stated gross stamps
--       amount_exception and approve refuses CLR21/amount_conflict, and where evidence
--       lands verified the expense=gross tie below refuses CLR23.
--
-- THE ONE EXISTING TEST THIS INVALIDATES, named rather than quietly broken.
-- packages/db/tests/a21-purchase-split.test.mjs, the executor cell's final assertion
-- ("the plain 2-leg corroborated sibling POSTS"), builds purchaseFactsDoc({gross:10600,
-- net:10000, tax:600}) — a stated NONZERO tax — drafts it 2-leg via billLines(EXP,AP,
-- 10600), and asserts it reaches 'approved' through clara.execute_rule_post. Under the
-- belt that entry REFUSES, which is precisely the intent of #52 (a nonzero-tax bill must
-- not autopost down the untested 2-leg path). That cell's actual INTENT — proving the
-- autopost refusal is specific to the sst_purchase_cost LEG and not to 2-leg-ness — is
-- preserved by restating its sibling fixture as a stated-ZERO-tax document
-- ({gross:10600, net:10600, tax:0}), which keeps the document stating its arithmetic
-- (the 0023/X5 corroboration requirement the cell's own comment cites) while landing on
-- the owner-ruled SST-zero shape. That amendment is made in this delivery and called out
-- here; the nonzero counterpart is added as a new refusal cell in x36 rather than lost.
--
-- WHAT THE ORCHESTRATOR MUST VERIFY AGAINST LIVE BEFORE DEPLOY (this lane cannot query
-- it, and the belt changes refusal behaviour on a live posting path, so this is a
-- precondition, not a nicety):
--   (i)  no APPROVED, unreversed supplier_bill entry exists whose document states a
--        nonzero invoice.tax_total and which carries no sst_purchase_cost leg. Such a row
--        would not be retro-refused (approval is one-way and the deferred trigger only
--        fires on the draft->approved transition), but it WOULD mean the live corpus
--        already contains the shape this belt calls unacceptable, which is an owner
--        decision, not an engineering one. Expected result: zero rows, because
--        invoice.tax_total has had zero nonzero occurrences across the live corpus (the
--        step-zero capture records this).
--   (ii) no DRAFT supplier_bill currently sits in that shape awaiting approval — such a
--        draft would begin refusing at approve the moment this deploys, and its owner
--        should be told rather than surprised. Remedy is withdraw-and-redraft as the
--        3-leg split (0035 §B's remedy discipline).
--  (iii) clara.execute_rule_post already refuses a purchase draft that CARRIES an
--        sst_purchase_cost leg outright, by NAME, before any generic enumeration
--        ('purchase_sst_not_autopostable', 0016:2422-2431 — "human lanes only"). Combined
--        with the belt, the net effect is exact and deliberate: a nonzero-tax supplier
--        bill can no longer reach 'approved' through the RULE lane at all — with the leg
--        it is skipped by name, without the leg it is now refused by the belt. That is
--        Gate P's territory by design (Gate P waits on the first real SST-charging
--        supplier bill), and it is the single largest behavioural consequence of this
--        migration. It is not a side effect; it is the point.
--
-- THE SALES SIDE — INVESTIGATED, AND THERE IS NO EQUIVALENT GAP. Deliberately NOT widened
-- here, per the work order; reported instead. clara._assert_sales_invoice_shape_at (0022
-- :714 is the live recut) writes its tax tie the OTHER way round — FACT-driven, not
-- leg-driven: `if v_tax is not null and v_tax > 0 and v_sst <> v_tax then raise` where
-- v_sst is coalesce(sum(...),0) over sst_output legs. With a stated nonzero tax and NO
-- sst_output leg, v_sst is 0, 0 <> v_tax, and it already refuses. Two further sales-side
-- checks catch the same shape independently (the revenue-vs-consideration tie
-- `v_rev <> v_gross - v_tax - rounding`, and the sst_account_missing CLR10 guard demanding
-- an sst_output account on the chart whenever tax > 0). So the asymmetry IS the bug: the
-- sales floor was written fact-first and is leg-absence-safe; the purchase floor was
-- written leg-first and was not. §A makes the purchase floor fact-first for the nonzero
-- case, matching the sales floor's existing shape rather than inventing a new pattern.
--
-- =====================================================================================
-- §B (#51) — settle_autodraft_task AND THE LOSING DISPATCH. What is available, honestly.
-- =====================================================================================
-- THE RUN IDENTITY IS NOT PASSED IN, AND THAT IS A RUNTIME BLOCKER, REPORTED NOT INVENTED.
-- clara.settle_autodraft_task(p_task,p_outcome,p_tokens,p_entry,p_refusal) (0011:2642,
-- never recut until now) gates on t.status alone. The run identity that
-- clara.begin_autodraft_task binds IS durably recorded — agent_tasks.workflow_run_id —
-- but settle receives no run id to compare it against, and the caller is
-- packages/runtime/workflows/autoDraft.v5.impl.ts's settleAutoDraftStep, a "use step"
-- body in a `// @frozen` module that issues exactly
-- `select clara.settle_autodraft_task($1,$2,$3,$4,$5::jsonb)` with five arguments and no
-- run id. A true caller-run-identity check therefore requires BOTH a new 6-arity function
-- (a defaulted 6th parameter alongside the existing 5-arity one would additionally make
-- every existing 5-argument call ambiguous to the planner) AND a new autoDraft_vN whose
-- settle step passes getWorkflowMetadata()'s run id. Per the standing law that workflow
-- bodies are immutable once deployed, neither is done here. This is the migration's ONE
-- reported runtime dependency and the orchestrator owns the decision.
--
-- WHAT THIS MIGRATION DOES INSTEAD — the ownership signal the DB genuinely owns. The
-- per-filing registry clara.autodraft_attempts is UNIQUE on filing_id
-- (uq_autodraft_attempts_filing) and clara.admit_autodraft_task repoints its task_id on
-- every re-admission (`on conflict(filing_id) do update set task_id=excluded.task_id`),
-- which is exactly what 0034's supersede branch relies on. So "the registry no longer
-- points at THIS task", and "this task's own status has moved past running", are both
-- ownership facts the DB already holds. They are already CHECKED — and that is the
-- defect: each one currently RAISES.
--   * `select * into a from clara.autodraft_attempts where task_id=p_task for update;
--      if not found or a.state<>'active' then raise ... CLR11` — a losing/late dispatch
--      whose attempt the registry has moved on from, or which the reconciler has already
--      released to 'idle', gets an exception.
--   * `if t.status not in ('running','cancel_requested') then raise ... CLR13` — a task
--      that reached 'cancelled' (clara.cancel_agent_task, which has no autodraft
--      awareness) or 'expired' gets an exception.
-- The owner's framing is that a losing dispatch is NORMAL, not an error. An exception
-- here propagates out of a "use step", is retried by the durable substrate, throws again,
-- and ends the run FAILED — a run that did its work reported as a failure purely because
-- somebody else had already accounted for it. That is precisely the "cosmetically failed
-- run" symptom. §B converts exactly those three shapes into a NO-OP WITH AN HONEST
-- RECEIPT: nothing is settled, no token accounting moves, no attempt_count is touched, no
-- sweep_run_items row is written — and the receipt says so, in both the return value
-- (`settled:false` plus a named reason) and clara._audit. The genuine internal-contract
-- violations stay exceptions: a settle on a task still 'queued' (never begun) or 'held' /
-- 'awaiting_input' keeps its CLR13, and a task that is not an autodraft task at all keeps
-- its CLR11 — neither is a losing dispatch, both are real defects.
--
-- NO DOUBLE-REFUND, NO LEAK, verified against every writer that can repoint the registry:
-- clara.reconcile_sweep_runs sets reserved_tokens=0 when it releases an attempt, and
-- 0034's supersede branch reconciles any outstanding reservation DURABLY on the attempt
-- row before it can return early. So by the time a losing dispatch arrives, the
-- reservation it would otherwise have refunded is already closed out by whoever took
-- ownership — the no-op refunding nothing is correct, not a leak. This was the specific
-- risk of turning a raise into a return and it is the reason the no-op writes NO token
-- rows at all rather than a "harmless" zero adjustment.
--
-- ALSO IN §B: the attempt cap stops being a bare literal. `v_attempts>=2` becomes
-- `v_attempts>=clara._autodraft_attempt_cap()`, the same function §C's read uses, so the
-- number a human is shown and the number that actually parks a filing can never drift
-- apart. The cap VALUE is unchanged at 2 — owner-ruled: the sharing stays, only the
-- invisibility was the defect.
--
-- A DEEPER DEFECT FOUND IN THE SAME FAMILY, DELIBERATELY NOT FIXED HERE (out of the four
-- items' scope; the orchestrator decides). clara.reconcile_sweep_runs (0011:2709) does
-- `if v_count>0 then update clara.agent_tasks t set status='completed' from
-- clara.autodraft_attempts a where a.run_id=sr.id and a.task_id=t.id and t.status in
-- ('running','cancel_requested')` — with NO `exists(coding_attempts)` guard, even though
-- the attempts-release UPDATE immediately below it HAS exactly that guard. So the moment
-- ANY ONE filing in a run is recovered, EVERY other still-running task in that run is
-- force-completed, including tasks that never produced a draft. The live run then settles
-- into the `t.status in ('completed','failed') -> replayed` early return, its real outcome
-- discarded, while its attempt row keeps state='active' with a nonzero reservation and a
-- 'completed' task — which 0034's registry then reads as 'already_done' FOREVER, wedging
-- that filing. This is a stronger candidate for the literal phrase "the reconciler
-- double-dispatch" than anything in settle itself, and the fix is one predicate
-- (`and exists(select 1 from clara.coding_attempts ca where ca.task_id=t.id)`), but it
-- recuts a FIFTH function that this work order did not scope. Reported, not smuggled.
--
-- A NOTE ON WHAT §B DOES NOT CLAIM. Chasing the "flips a task another run already owns"
-- wording to ground: with 0034 in place I could not construct a reachable path where a
-- losing settle actually FLIPS the status of a task a DIFFERENT run owns. 0034 supersedes
-- only FAILED/CANCELLED/EXPIRED tasks, so whenever the registry has been repointed the
-- old task is already terminal and its late settle lands in a no-op branch rather than a
-- status write; and while a task is live, 0034's registry short-circuit returns
-- noop_existing instead of minting a rival. What IS reachable, and what §B fixes, is the
-- EXCEPTION. Saying so rather than claiming a bigger fix than was made.
--
-- =====================================================================================
-- §C (#53) — THE SHARED ATTEMPT BUDGET, MADE VISIBLE. Owner ruling: the cap of 2 STAYS.
-- =====================================================================================
-- "A park should never be a surprise attributable to an actor the user never saw act."
-- clara.autodraft_attempts holds ONE row per filing with attempt_count, state, and an
-- `origin` column constrained to ('sweep','one_click') that records only the MOST RECENT
-- claimant, and clara.settle_autodraft_task parks at attempt_count >= 2 regardless of who
-- spent them. So an unattended sweep can spend both attempts and a human's first
-- one-click is refused refused_attempts with nothing on any read surface having warned them.
--
-- WHICH READ SURFACE, AND WHY THAT ONE. The requirement is a surface a human consults
-- BEFORE triggering a retry, extended ADDITIVELY without breaking its shape — and the
-- repo law is that a recut preserves the exact signature. That rules out the obvious
-- candidates: clara.coding_lane / clara._coding_lane_core return TABLE(lane text, reasons
-- text[]), so adding a column is a drop-and-recreate plus a break of every lateral-join
-- consumer, and appending a token to `reasons` would break the reason vocabulary pinned
-- in apps/dashboard/app/shared/reviewCardTypes.ts. clara.list_uncoded_filings(uuid) does
-- return setof jsonb, but it is SECURITY INVOKER, and clara.autodraft_attempts has no RLS
-- policy and no SELECT grant to clara_authenticated or clara_agent_ro at all — reading it
-- from an invoker-mode function would need a brand-new table grant, exactly the surface
-- 0020's grant discipline says not to open. clara.list_review_queue(jsonb,jsonb,int) is
-- the right home on every axis: it is THE queue read (it already emits the
-- 'uncoded_filing' row_kind the queue UI renders), it RETURNS JSONB so new keys are purely
-- additive with no signature change, and it is SECURITY DEFINER so it can read the
-- registry with NO new table grant whatsoever.
--
-- WHAT IS EXPOSED, on every row that has a filing_id (both 'draft' and 'uncoded_filing'
-- rows), as one additive 'autodraft' key built by the new internal
-- clara._autodraft_attempt_budget: attempts_used, attempts_cap, attempts_remaining,
-- state, parked, last_origin, origin_attribution, last_run_id, last_refusal, updated_at,
-- plus §D's sweep_eligible / blocked_reason. Rows with no filing (open_question,
-- compliance_watch) carry a null, exactly as they carry null filing_id today.
--
-- THE STORAGE LIMIT, STATED IN THE DATA ITSELF RATHER THAN GLOSSED — and it is WORSE than
-- "two attempts, one column", which is what the first cut of this migration claimed. The
-- single `origin` column is repointed at ADMISSION (`on conflict(filing_id) do update set
-- ... origin=excluded.origin`, and 0034's supersede branch takes exactly that path) while
-- `attempt_count` only moves at SETTLE. The two are therefore NOT SYNCHRONIZED at any
-- count: sweep admits -> fails -> settle (attempt_count=1, origin='sweep'), then a human
-- clicks retry -> admission repoints origin='one_click' with attempt_count still 1. A
-- payload that called that attribution 'complete' would render "1 of 2 used, by you" for
-- an attempt THE SWEEP SPENT — the exact fabrication this key exists to prevent, in the
-- exact flow the feature exists for. So the payload states the real limit: `last_origin`
-- is THE MOST RECENT CLAIMANT (never "the spender"), and `origin_attribution` reads 'none'
-- only when attempts_used = 0 (nothing spent, nothing to attribute) and 'latest_only' for
-- every nonzero count. 'complete' is never emitted, because with this storage it is never
-- provable. A UI can render "1 of 2 used; most recently claimed by the sweep" honestly and
-- can never render a fabrication. THE MINIMAL STORAGE CHANGE that
-- would make full attribution possible, proposed and NOT taken here because it is a table
-- change this work order did not scope: an append-only child table
-- clara.autodraft_attempt_events(filing_id, attempt_n, origin, run_id, task_id,
-- settled_at, outcome) written from settle_autodraft_task's failure branch — after which
-- origin_attribution can always read 'complete'. The read shape above is deliberately
-- forward-compatible with that: only the attribution token's value changes.
--
-- =====================================================================================
-- §D (#4) — THE SALES MIS-ROUTE GATE. Latent today, no live victim, real defect.
-- =====================================================================================
-- clara.list_autodraft_candidates() (created 0011:2771, last patched 0017:136-150 with the
-- O8.2 active-client guard join — which is WHY §D patches it rather than rebuilding it)
-- filters on active client + active filing +
-- done invoice_facts task + no draft/live-approved entry + not parked, with NO DIRECTION
-- FILTER, while the unattended drafter's tool schema hardcodes coding_kind
-- "supplier_bill" (packages/runtime/workflows/autoDraft.v5.tools.ts:174). A SALES-direction
-- document that reaches ready is therefore handed to a purchase-only prompt. The
-- orchestrator probed live: 9 candidates, all direction='purchase' — the defect is real
-- and has no victim yet.
--
-- SILENTLY EXCLUDED, OR EXCLUDED VISIBLY? Visibly, on the surfaces that can actually
-- carry a receipt — because the enumerator itself structurally cannot. Both
-- clara.list_autodraft_candidates() and clara.list_document_autodraft_candidates(uuid)
-- are `language sql stable` and can write nothing, and their return type
-- TABLE(firm_id,filing_id) cannot gain a column without a signature change that would
-- break the runtime consumer (packages/runtime/lib/autodraft.mjs:57,253). So the
-- exclusion is made visible in the two places that CAN speak:
--   (1) clara.list_review_queue's new 'autodraft' block carries sweep_eligible=false and
--       blocked_reason='sales_direction' on that filing's row — the human reading the
--       queue sees exactly why the sweep will never take it, so it is not invisibly
--       stranded even though the enumeration skips it;
--   (2) clara.admit_autodraft_task refuses it by NAME, with a real receipt: outcome
--       'skipped_direction', reason 'sales_direction', and a run-bound sweep_run_items
--       row. That row's outcome column is a CHECK-constrained enum
--       ('drafted','skipped_lane','refused_budget','refused_attempts','noop_existing'),
--       so the receipt rides 'skipped_lane' with a DISTINCT refusal_token reason —
--       exactly how the lane_changed refusal already encodes itself — rather than
--       inventing a value the constraint would reject.
-- admit_autodraft_task is the load-bearing gate of the two: the primary per-document
-- dispatch path goes through clara.list_document_autodraft_candidates, which applies NO
-- filters at all by design (admission is the gate), so gating admission covers BOTH the
-- per-document path and the catch-up enumeration. That is also why
-- list_document_autodraft_candidates is deliberately left untouched.
--
-- WHY THE GATE GOES THROUGH A HELPER AND NOT A BARE _document_direction CALL — a hazard
-- worth naming because getting it wrong would have been worse than the bug.
-- clara._document_direction(document, client) can RAISE CLR30 on a direction
-- contradiction; clara._coding_lane_core traps exactly that and degrades. Calling it
-- unguarded from `language sql` clara.list_autodraft_candidates() would mean ONE
-- contradicting document anywhere in the estate erroring out the WHOLE candidate
-- enumeration — a firm-wide sweep wedge, strictly worse than the mis-route it fixes. The
-- new internal clara._autodraft_sales_direction traps sqlstate CLR30 (only CLR30, exactly
-- the precedent _coding_lane_core sets) and returns FALSE — i.e. "not provably sales", so
-- a contradicting filing is still enumerated and still reaches admission's existing lane
-- check, which already refuses it with a visible skipped_lane / direction_unresolved
-- receipt. The gate excludes ONLY documents that resolve cleanly to 'sales'. Narrowest
-- possible behaviour change, and no receipt that exists today disappears.
--
-- =====================================================================================
-- CoR DISCIPLINE — READ THIS BEFORE DEPLOY. An honest deviation from the house rule,
-- plus the DEFECT that deviation caused on first attempt and how it is now prevented.
-- =====================================================================================
-- Every prior migration in this family pulled the bodies it recuts via pg_get_functiondef
-- against the live, fully-migrated database. THIS LANE HAD NO LIVE DATABASE ACCESS (the
-- work order forbade any live database command), so a body it wants to recut must either be
-- reconstructed from the migration file that last defined it, or — where that file is NOT
-- the last definition — be PATCHED in place instead of rebuilt.
--
-- THE METHOD THAT FAILED, NAMED SO IT IS NOT REPEATED. The first cut of this migration
-- established "the last definition" by grepping for
-- `create (or replace )?function clara.<name>` across packages/db/migrations. THAT GREP IS
-- STRUCTURALLY BLIND to the change-of-record idiom this repo uses constantly:
-- 0017/0018/0019/0020/0024/0025/0026 all patch large bodies via
-- pg_get_functiondef -> replace -> execute, which contains no `create function` text at
-- all. Two of the five bodies here are patched exactly that way by 0017, and rebuilding
-- them from 0011/0016 silently REVERTED 0017 (the whole lint queue lane + seven
-- active-client guards + the ADR-031 rank on the queue read; the O8.2 active-client guard
-- on the sweep enumerator). Both are now installed as PATCHES with positive prestate
-- probes for 0017's own markers — see the §C and §D block headers for the full reversion
-- accounting. THE CORRECT METHOD, for any future lane without live access, is BOTH greps:
--   grep -nE 'create (or replace )?function clara\.<name>' packages/db/migrations/*.sql
--   grep -n 'pg_get_functiondef' packages/db/migrations/*.sql   # then read every hit whose
--                                                              # regprocedure names <name>
--
-- WHAT THIS FILE THEREFORE DOES, per body:
--   REBUILT from its genuine last definition (no dynamic patch anywhere in the tree —
--   verified by both greps above):
--     clara._assert_supplier_bill_shape_at(uuid,uuid) -> 0016:3817 (0022:1740 and 0023:1382
--       are prosrc ASSERTIONS only, not definitions)
--     clara.settle_autodraft_task(uuid,text,bigint,uuid,jsonb) -> 0011:2642 (never recut)
--     clara.admit_autodraft_task(uuid,text,uuid,text,bigint) -> 0034:134 (via 0031)
--   PATCHED IN PLACE because 0017 is the last definition, not the file that created them:
--     clara.list_review_queue(jsonb,jsonb,integer) -> created 0011:3748, recut 0016:4558,
--       PATCHED 0017:511-655  (§C installs its key into whatever body is live)
--     clara.list_autodraft_candidates() -> created 0011:2771, PATCHED 0017:136-150
--       (§D splices its predicate into whatever body is live)
-- THE ORCHESTRATOR MUST STILL DIFF THE THREE REBUILT BODIES AGAINST pg_get_functiondef ON
-- THE LIVE TARGET BEFORE APPLYING THIS FILE. A hand-applied hotfix or an out-of-band recut
-- that never landed in a migration file would be silently REVERTED by those three
-- CREATE OR REPLACEs. This is stated as a gate, not a caveat. The two PATCHED bodies need
-- no such diff: they are spliced into the live text and abort the deploy on anchor drift.
--
-- D1 WRITE-QUIESCE. This migration recuts the live approve path (through
-- _assert_supplier_bill_shape_at, reached by clara.approve_entry, clara.execute_rule_post
-- and the deferred commit trigger), the live admission path (admit_autodraft_task), the
-- live settlement path (settle_autodraft_task), and the live queue read. Per the
-- repo-mandated D1 discipline (packages/db/README.md:95-113) deploy through the quiesced
-- apply ceremony, not a bare migrate against a live target.
--
-- MIGRATION NUMBER. Named 0036 provisionally against a live frontier of 0035 (34
-- migrations). Numbers are claimed at MERGE time against the then-current frontier; the
-- CI frontier check enforces.
--
-- CELLS (packages/db/tests/x36c0-wave-c0-belts.test.mjs), plus one amendment to
-- packages/db/tests/a21-purchase-split.test.mjs named in §A above:
--   x36c0.a  stated-NONZERO tax + no sst_purchase_cost leg + a PURELY expense-typed debit
--            side -> REFUSED, CLR21 tax_leg_missing, at approve.
--   x36c0.a2 the CAPITALISED-purchase carve-out: a purely asset-debit bill on the same
--            nonzero-tax document is never claimed by the belt (never tax_leg_missing).
--            Rig-verified 2026-07-30: on a CORROBORATED document the draft-time W1
--            amount comparator (0009:1355-1363, already expense-centric) fires FIRST —
--            CLR21/amount_conflict; the verified-total tie (CLR23) and plain approval
--            are the other pre-0036 outcomes. The cell accepts and NAMES all three.
--   x36c0.a3 the MIXED asset+expense CARVE-OUT: the belt never CLAIMS a mixed bill
--            (never tax_leg_missing), because the only shape it would accept ties the
--            FULL stated tax into an expense account and so understates the capitalised
--            portion — Gate-P territory. Mixed is not silently green either: on the
--            CORROBORATED path the pre-existing W1 comparator owns it
--            (CLR21/amount_conflict, expense-sum 5600 <> gross 10600, rig-verified
--            2026-07-30) and the bill never reaches approved.
--   x36c0.b  stated-ZERO tax + no leg -> APPROVES (the ADR-050 owner-ruled shape).
--   x36c0.c  NO extraction / no stated tax + no leg -> APPROVES (absence is not a claim).
--   x36c0.d  the existing sstp-leg paths are unchanged: a correctly tied 3-leg approves;
--            a mistied leg still refuses CLR21; a leg with no stated fact still refuses.
--   x36c0.e  a REVERSAL mirror of a 2-leg bill on a nonzero-tax document still approves —
--            the reversal gating is intact.
--   x36c0.f  a settle from a non-owning / superseded dispatch is a NO-OP with an honest
--            receipt (settled:false + a named reason), the task and the attempt row
--            untouched; a settle on a still-'queued' task keeps its CLR13.
--   x36c0.g  the queue read exposes used/remaining/cap/last_origin/origin_attribution
--            correctly at 0, 1 and 2 attempts, and the cap it reports equals the cap that
--            actually parks. Also carries TWO guards that belong nowhere else: the
--            MISATTRIBUTION guard (sweep spends attempt 1, human re-admits -> the read must
--            still say 'latest_only', never credit the human with the sweep's attempt), and
--            the 0017 CHANGE-OF-RECORD SURVIVAL guard (the 'lint' envelope,
--            counts.lint_findings and the per-row finding_id key are still there — i.e. §C
--            patched the live body instead of rebuilding 0016's and deleting them).
--   x36c0.h  a sales-direction filing does not appear in list_autodraft_candidates() and
--            is refused by NAME at admission with a run-bound receipt; a purchase filing
--            still appears and still admits.
--   x36c0.i  §E: a committed client plan's answered msic surfaces as pack.client.msic in
--            the human lane; a sibling client with NO committed plan reads msic null; and
--            the 0017 wiki + 0016 sst_registration_watch markers survive the patch.

set role clara_fn_owner;

-- =====================================================================
-- §0 — SHARED INTERNALS. Three new definer-internal helpers, NONE granted to any role
-- (the "one ungranted _core + grant-scoped entry points" law): every caller below is
-- itself a SECURITY DEFINER function owned by clara_fn_owner, which holds EXECUTE on
-- these implicitly as owner. The tail asserts they stay ungranted.
-- =====================================================================

-- The shared per-filing autodraft attempt cap. ONE definition, consumed by both the
-- writer that parks (settle_autodraft_task) and the read that warns (§C) — so the number
-- a human is shown can never drift from the number that actually parks a filing. The
-- VALUE is owner-ruled and unchanged at 2; only its invisibility was the defect.
-- Deliberately NOT security definer and deliberately WITHOUT a `set search_path` pin, so
-- that neither omission reads as an oversight against the repo's definer-hygiene rule
-- (rig-meta's T18, which scopes itself to prosecdef functions): the body resolves no
-- identifier at all, so a search_path has nothing to act on — and adding a SET clause would
-- make the function non-inlinable, turning a free constant into a real call on a read that
-- evaluates it once per queue row.
create or replace function clara._autodraft_attempt_cap() returns int
  language sql immutable as $$ select 2 $$;
revoke all on function clara._autodraft_attempt_cap() from public;

-- TRUE only when the document resolves CLEANLY to the sales direction. A CLR30 direction
-- contradiction returns FALSE ("not provably sales") rather than propagating: an
-- unguarded raise out of `language sql` clara.list_autodraft_candidates() would error the
-- whole estate-wide enumeration on one bad document. Trapping ONLY CLR30 mirrors
-- clara._coding_lane_core's own handler exactly; any other error still propagates, and a
-- contradicting filing keeps reaching admission's lane check, which already refuses it
-- with a visible receipt.
create or replace function clara._autodraft_sales_direction(p_document uuid, p_client uuid)
  returns boolean
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare v_direction text;
begin
  if p_document is null or p_client is null then return false; end if;
  begin
    v_direction := clara._document_direction(p_document, p_client);
  exception when sqlstate 'CLR30' then
    return false;
  end;
  -- coalesce, NOT a bare `v_direction = 'sales'`: this function is consumed as
  -- `and not clara._autodraft_sales_direction(...)` in clara.list_autodraft_candidates()'s
  -- WHERE clause, where a NULL return makes `not NULL` -> NULL -> the row is silently
  -- DROPPED from the enumeration. A tri-valued answer here would therefore strand PURCHASE
  -- work invisibly — the exact failure this migration exists to prevent, reintroduced by the
  -- fix. Every live path in clara._document_direction returns 'purchase' or 'sales', so this
  -- is defence in depth rather than a known hole, and it fails in the safe direction: an
  -- unexpected null means "not provably sales", the filing stays enumerated, and admission's
  -- lane check still governs it.
  return coalesce(v_direction = 'sales', false);
end $$;
revoke all on function clara._autodraft_sales_direction(uuid,uuid) from public;

-- The §C/§D visibility payload for ONE filing: the shared attempt budget a human must see
-- before triggering a retry, plus §D's sweep-eligibility. Returns null for a null or
-- unknown filing (queue rows with no filing carry null, exactly as they carry a null
-- filing_id today). attempts_used/state/last_origin come from the registry row when one
-- exists; a filing that has never been attempted reports a full budget with a null origin
-- rather than an absent key, so a consumer never has to distinguish "no row" from "no
-- attempts".
--
-- origin_attribution IS 'none' AT ZERO ATTEMPTS AND 'latest_only' AT EVERY OTHER COUNT, and
-- 'complete' is deliberately NEVER emitted. The reason is a real desynchronisation, not
-- conservatism: clara.autodraft_attempts.origin is repointed at ADMISSION
-- (`on conflict(filing_id) do update set ... origin=excluded.origin`) while attempt_count
-- only moves at SETTLE. So after the sweep spends attempt 1 and a human then clicks retry,
-- the row reads attempt_count=1 with origin='one_click' — and a payload claiming that
-- attribution was 'complete' would render "1 of 2 used, by you" for an attempt the SWEEP
-- spent. That is exactly the fabrication this key exists to make impossible, in exactly the
-- flow the feature exists for. So last_origin is documented as THE MOST RECENT CLAIMANT
-- (never "the spender"), and any nonzero count reports 'latest_only'. The MINIMAL STORAGE
-- CHANGE that would make true attribution possible — and let this key read 'complete'
-- honestly — is the append-only child table proposed in the §C header; the read shape here
-- is forward-compatible with it (only the token's value changes).
-- COST, stated rather than discovered later: this adds ONE clara._document_direction
-- evaluation per RETURNED queue row (bounded by p_limit, itself clamped to <=500). That
-- read already evaluates clara._coding_lane_core once per draft and per filing row through
-- its existing lateral joins, and _coding_lane_core itself calls _document_direction — so
-- this roughly doubles one component of a cost the queue already pays, rather than
-- introducing a new class of work. If it ever measures badly, the narrow remedy is to drop
-- sweep_eligible/blocked_reason from this payload and let §D's exclusion be visible only
-- through admission's named refusal; the attempt-budget half costs one indexed lookup.
--
-- Typed scalars, NOT a `record`, deliberately: the registry row is OPTIONAL (a filing that
-- has never been attempted has none), and reading fields off a record variable whose
-- SELECT INTO matched nothing depends on subtle "is the rowtype assigned yet" semantics.
-- Scalars make the no-row case unambiguous — every field is simply null.
create or replace function clara._autodraft_attempt_budget(p_filing uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare
  v_document uuid; v_client uuid; v_cap int; v_used int; v_sales boolean;
  v_state text; v_origin text; v_run uuid; v_refusal jsonb; v_updated timestamptz;
begin
  if p_filing is null then return null; end if;
  select df.document_id, df.client_id into v_document, v_client
    from clara.document_filings df where df.id = p_filing;
  if not found then return null; end if;
  v_cap := clara._autodraft_attempt_cap();
  select aa.attempt_count, aa.state, aa.origin, aa.run_id, aa.last_refusal, aa.updated_at
    into v_used, v_state, v_origin, v_run, v_refusal, v_updated
    from clara.autodraft_attempts aa where aa.filing_id = p_filing;
  v_used := coalesce(v_used, 0);
  v_sales := clara._autodraft_sales_direction(v_document, v_client);
  return jsonb_build_object(
    'attempts_used', v_used,
    'attempts_cap', v_cap,
    'attempts_remaining', greatest(0, v_cap - v_used),
    'state', v_state,
    'parked', coalesce(v_state, '') = 'parked',
    -- THE MOST RECENT CLAIMANT, not "who spent an attempt": origin is repointed at
    -- admission while attempt_count moves at settle, so the two are not synchronized.
    'last_origin', v_origin,
    -- 'none' only when nothing has been spent (there is no attribution to make);
    -- 'latest_only' for every nonzero count, because a single origin column that a later
    -- admission can repoint cannot prove who spent ANY attempt. See this function's header.
    'origin_attribution', case when v_used = 0 then 'none' else 'latest_only' end,
    'last_run_id', v_run,
    'last_refusal', v_refusal,
    'updated_at', v_updated,
    'sweep_eligible', not v_sales,
    'blocked_reason', case when v_sales then 'sales_direction' else null end);
end $$;
revoke all on function clara._autodraft_attempt_budget(uuid) from public;

-- =====================================================================
-- §A (#52) — clara._assert_supplier_bill_shape_at CoR (same 2-arity, ACL preserved).
-- The 0016:3817 body verbatim EXCEPT the new `else` branch on the sst-leg conditional (the
-- nonzero-stated-tax belt) and the two declared ints its debit-side census counts into.
-- Nothing else in this function is touched. REBUILT rather than patched, and that is verified rather than
-- assumed: no migration in the tree patches this body dynamically (0017:5950, 0022:1740 and
-- 0023:1382 read its prosrc to ASSERT on it, and 0023's own header states "NO change to
-- _assert_supplier_bill_shape_at"), so 0016 genuinely is its last definition.
-- =====================================================================
create or replace function clara._assert_supplier_bill_shape_at(p_entry uuid, p_extraction uuid) returns void
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  e record; v_payable_credit bigint; v_expense_debit bigint;
  v_verified_total bigint; v_payable_debit bigint; v_recv_lines int;
  v_type text; v_round_imb bigint; v_leg_n int;
  v_sst_legs int;
  v_sstp_legs int; v_sstp_credit bigint; v_sstp_debit bigint; v_tax bigint;
  -- 0036 §A: the DEBIT-SIDE TYPE CENSUS. The belt below fires only when the debit side is
  -- PURELY expense-typed — at least one expense-typed debit leg AND no non-expense debit
  -- leg — because sst_purchase_cost is CHECK-pinned to account_type='expense'
  -- (ck_coa_sst_purchase_cost_expense, 0016:124-125) and must carry the FULL stated tax.
  -- See the belt's own comment for why a capitalised or MIXED debit side must NOT be
  -- refused (it would have no approvable shape at all).
  v_exp_debit_legs int; v_nonexp_debit_legs int;
begin
  select * into e from clara.journal_entries where id = p_entry;
  if not found then return; end if;
  if exists (
    select 1 from clara.journal_lines l
    join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
    where l.entry_id=p_entry and a.account_class in ('payable','receivable')
      and l.counterparty_id is null
  ) then
    raise exception 'every control-class line requires a counterparty' using errcode = 'CLR23';
  end if;
  if e.coding_kind = 'supplier_bill' and e.reversal_of is null then
    -- RESIDUAL-2 (supplier-bill polarity): a supplier document whose stated MyInvois type
    -- is anything other than 01 (invoice) cannot be coded as a plain bill — a type-02
    -- supplier credit note drafted Dr expense / Cr payable would wrongly INCREASE payable.
    -- Refuse (=> NEEDS YOU). OCR bills carry no type_code => the binding is inert (unchanged
    -- for the RPR OCR corpus). Mirrors the sales floor's type<->polarity binding.
    if e.document_id is not null then
      v_type := nullif((case when p_extraction is null
        then clara._invoice_fact_state(e.document_id)
        else clara._invoice_fact_state_at(e.document_id, p_extraction) end)->>'type_code','');
      if v_type is not null and v_type <> '01' then
        raise exception 'a supplier document of type % cannot be coded as a plain bill', v_type
          using errcode='CLR21',detail='{"reason":"type_polarity_mismatch"}';
      end if;
    end if;
    -- Defense-in-depth (adversarial #2, control-account laundering): a supplier bill
    -- admits NO receivable-class leg and NO payable leg on the DEBIT side (an
    -- opposite/unaccounted control leg through which an amount could be laundered
    -- under the control exemption). At least one payable CREDIT still ties to gross.
    select count(*) filter (where a.account_class='receivable'),
           coalesce(sum(l.credit_cents) filter (where a.account_class='payable'),0),
           coalesce(sum(l.debit_cents)  filter (where a.account_class='payable'),0)
      into v_recv_lines, v_payable_credit, v_payable_debit
      from clara.journal_lines l
      join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
      where l.entry_id=p_entry;
    if v_recv_lines > 0 then
      raise exception 'a supplier bill admits no receivable-class leg' using errcode = 'CLR23';
    end if;
    if v_payable_debit > 0 then
      raise exception 'a supplier bill admits no payable-class debit leg' using errcode = 'CLR23';
    end if;
    if v_payable_credit <= 0 then
      raise exception 'supplier bill requires a payable-class credit' using errcode = 'CLR23';
    end if;
    -- RESIDUAL-1 (defense-in-depth): a supplier bill's rounding account may carry only an
    -- IMMATERIAL amount. A caller-supplied 'rounding' leg of any size would otherwise
    -- launder the balance past the whole-entry constraint when the evidence is non-verified
    -- (the executor closes the autopost path; this closes the human/agent approve path).
    -- Aggregate |dr−cr| over rounding legs must be <= greatest(5, n_legs) sen. Taxonomy-
    -- consistent with the executor bound; leaves the open-ended expense/asset debit side
    -- untouched (asset-debit bills exist), so the AP exact-diff is preserved.
    select count(*)::int into v_leg_n from clara.journal_lines where entry_id=p_entry;
    select coalesce(sum(abs(l.debit_cents-l.credit_cents)),0) into v_round_imb
      from clara.journal_lines l
      join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
      where l.entry_id=p_entry and coalesce(a.special_acc_type,'')='rounding';
    if v_round_imb > greatest(5, v_leg_n) then
      raise exception 'a supplier bill admits no material amount in a rounding leg' using errcode = 'CLR23';
    end if;
    -- FIX-2 (v4, item 2 — sst_output is SALES-side ONLY): a supplier bill (purchase) admits
    -- NO sst_output leg. Malaysian purchase SST is expensed INTO cost (expense=gross); output
    -- tax (sst_output) is a SALES liability, never a purchase leg. This REVERTS the v2/v3
    -- purchase-side sst TIE (which admitted a tied sst leg): a separate sst leg on a purchase
    -- is the item-7 laundering vector, not a legit shape, so it is refused OUTRIGHT — whether
    -- or not it would tie to a stated tax fact. Azure/OCR AP bills carry no sst_output leg =>
    -- inert for the RPR/AP corpus (the exact-diff is preserved). The open-ended expense/asset
    -- debit side (multi-account human splits) stays untouched. Mirrors the executor's
    -- purchase outside-leg rejection (execute_rule_post).
    select count(*)::int into v_sst_legs
      from clara.journal_lines l
      join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
      where l.entry_id=p_entry and coalesce(a.special_acc_type,'')='sst_output';
    if v_sst_legs > 0 then
      raise exception 'a supplier bill admits no sst_output leg (purchase SST is expensed into cost)'
        using errcode = 'CLR23';
    end if;
    -- 0016 P4 (WA21-R1 — the purchase VISIBILITY split): AT MOST ONE
    -- sst_purchase_cost DEBIT leg, admitted ONLY when the document STATES a tax
    -- total, and tied EXACTLY (to the sen) to invoice.tax_total from
    -- _invoice_fact_state. The account is expense-typed (CHECK), so the
    -- expense=gross tie below counts it — expense total still equals gross.
    -- Count + tie + corroboration: never a free bucket.
    select count(*)::int,
           coalesce(sum(l.credit_cents),0),
           coalesce(sum(l.debit_cents),0)
      into v_sstp_legs, v_sstp_credit, v_sstp_debit
      from clara.journal_lines l
      join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
      where l.entry_id=p_entry and coalesce(a.special_acc_type,'')='sst_purchase_cost';
    if v_sstp_legs > 0 then
      if v_sstp_legs > 1 or v_sstp_credit > 0 then
        raise exception 'a supplier bill admits at most one sst_purchase_cost debit leg'
          using errcode='CLR23';
      end if;
      v_tax := case when e.document_id is null then null
        else nullif((case when p_extraction is null
          then clara._invoice_fact_state(e.document_id)
          else clara._invoice_fact_state_at(e.document_id, p_extraction) end)->>'tax_total_cents','')::bigint end;
      if v_tax is null then
        raise exception 'an sst_purchase_cost leg requires a stated document tax total'
          using errcode='CLR21',detail='{"reason":"tax_tie_failed"}';
      end if;
      if v_sstp_debit <> v_tax then
        raise exception 'sst_purchase_cost leg differs from the stated tax total'
          using errcode='CLR21',detail='{"reason":"tax_tie_failed"}';
      end if;
    else
      -- 0036 §A (ledger #52) — THE ELSE-SIDE BELT. The three branches above are
      -- LEG-DRIVEN: they only ever run once an sst_purchase_cost leg already exists,
      -- which left the fourth corner of the same tie unasked — the document STATES a
      -- nonzero tax and the entry carries NO such leg. That shape passed cleanly (and
      -- also passed the verified-total tie below, because the sst_purchase_cost account
      -- is expense-typed by CHECK so expense=gross holds either way), leaving the stated
      -- tax invisible in the books. It is refused here.
      --
      -- The figure is read from the SAME source the leg-present branch reads and no
      -- other — _invoice_fact_state, or _invoice_fact_state_at when the caller pinned an
      -- extraction — so a pinned approval and this belt can never disagree about what
      -- the document says. ABSENCE IS NOT A NONZERO CLAIM: v_tax is null for a
      -- document-less bill, for a filing with no extraction, and for an extraction that
      -- states no tax_total_cents at all, and null never raises. A STATED ZERO
      -- ("SST Amt @ 6%: 0.00") is v_tax=0 and also never raises — the 2-leg form is the
      -- owner-ruled correct shape for it (ADR-050, the client's own four approved EZSEC
      -- bills). Only a stated, nonzero figure with no leg to carry it — on a PURELY
      -- expense-typed debit side, see the carve-out below — raises; `<> 0` rather than
      -- `> 0` because a negative stated tax is equally a nonzero claim the entry is
      -- ignoring.
      --
      -- CLR21, not CLR23, BY PRECEDENT INSIDE THIS FUNCTION: CLR23 carries the leg-shape
      -- refusals, while the only two checks that compare the entry against the document's
      -- stated tax figure are both CLR21. This is the same tie those two enforce, read
      -- from the fact side instead of the leg side. The reason token is DISTINCT from
      -- their tax_tie_failed because the human remedy differs — not "fix the leg's
      -- amount" but "there is no leg", which per the ADR-050 diagnosis may first require
      -- an sst_purchase_cost account on the client's chart at all.
      --
      -- This branch inherits `e.reversal_of is null` from the enclosing conditional, so a
      -- reversal mirror of a legitimately 2-leg original is never caught by it.
      --
      -- THE CARVE-OUT: THE BELT FIRES ONLY ON A PURELY EXPENSE-TYPED DEBIT SIDE, and why
      -- an unconditional belt would be WRONG rather than merely strict. The only shape
      -- that satisfies this belt is a debit to the client's sst_purchase_cost account,
      -- which is CHECK-pinned to account_type='expense'
      -- (ck_coa_sst_purchase_cost_expense, 0016:124-125), is one-per-client, and — by the
      -- leg-present branch immediately above — must equal the FULL stated tax to the sen.
      -- That full-tie is what makes the belt unsatisfiable on any debit side that is not
      -- purely expense:
      --   * PURE ASSET (a capitalised purchase — 0016's own rounding-leg comment names the
      --     shape explicitly: "leaves the open-ended expense/asset debit side untouched
      --     (asset-debit bills exist)"): the stated tax is part of the asset's cost, so
      --     the only belt-satisfying shape would move it OUT of the asset into an expense
      --     account, understating the asset.
      --   * MIXED asset+expense (e.g. Dr equipment 10,600 / Dr service expense 5,300 /
      --     Cr payable 15,900 on a document stating 900 of tax): a PARTIAL
      --     sst_purchase_cost leg carrying only the expensed portion's 300 refuses on the
      --     full-tie above, and a leg carrying the whole 900 expense-types the asset's 600
      --     — understating the asset again. There is NO shape that both satisfies the belt
      --     and states the asset correctly, because the tax-ALLOCATION model that would be
      --     needed (how much of a stated tax belongs to capitalised vs expensed cost) does
      --     not exist in this schema at all.
      -- And there is no override to fall back on: `amount_override` relaxes only the
      -- verified-total tie below, and on an UNCORROBORATED document there is no W1
      -- exception to override in the first place. So an unconditional belt would leave a
      -- legitimate, currently-approvable entry with NO approvable shape whatsoever: it
      -- would not prevent a wrong number, it would prevent a RIGHT one — against this
      -- belt's own philosophy. A belt must not claim a shape it cannot offer a compliant
      -- remedy for.
      -- The belt therefore fires ONLY when the debit side is PURELY expense-typed: at
      -- least one expense-typed debit leg AND zero non-expense debit legs. That still
      -- covers every shape the belt exists for — the pure 2-leg Dr expense(gross) /
      -- Cr payable(gross) bill, which is the whole ADR-050/EZSEC production class and the
      -- ONLY shape autoDraft ever emits. Pure-asset and MIXED bills keep their pre-0036
      -- behaviour exactly and are named as GATE-P TERRITORY (Gate P waits on the first
      -- real SST-charging supplier bill, which is when the allocation model has to be
      -- designed with the owner).
      -- CARVED OUT IS NOT SILENTLY GREEN, and this is the part that makes the carve-out
      -- safe rather than merely convenient: on a CORROBORATED document the draft-time W1
      -- comparator (0009:1355-1363) is already EXPENSE-centric — it sums account_type=
      -- 'expense' debits only — so any bill whose expense debits differ from the stated
      -- gross (which is every mixed and every pure-asset bill) stamps amount_exception at
      -- draft and approve refuses CLR21/amount_conflict. Where evidence instead lands
      -- verified without corroboration, the expense=gross tie immediately below refuses
      -- CLR23. The carve-out can therefore never be used to slip a WRONG total past the
      -- floor; what it declines to do is force a CORRECT mixed entry into a shape that
      -- does not exist.
      -- ONE NAMED RESIDUAL, reported rather than hidden: the non-expense census counts
      -- every non-expense debit leg, including a `rounding` special account if a client's
      -- chart types theirs as something other than expense (the seeded one is
      -- 'expense' — seeds/0002_core_seed.sql:131 — so this is inert for every seeded
      -- client). Such a bill would be carved out on a 1-sen leg. It is left as-is
      -- deliberately: the census is a plain type test with no special-account exceptions,
      -- and the materiality cap above bounds the leg to sen. Named so a future reader can
      -- tighten it on purpose instead of discovering it.
      -- WHAT REMAINS AN OWNER QUESTION, reported not decided: whether a capitalised
      -- purchase's stated SST should be visible in the books at all (it would need a
      -- non-expense sst_purchase_cost variant, i.e. a CHECK + chart change), and how a
      -- mixed-basis bill should allocate it. Both are Gate-P territory.
      v_tax := case when e.document_id is null then null
        else nullif((case when p_extraction is null
          then clara._invoice_fact_state(e.document_id)
          else clara._invoice_fact_state_at(e.document_id, p_extraction) end)->>'tax_total_cents','')::bigint end;
      select (count(*) filter (where a.account_type='expense'))::int,
             (count(*) filter (where a.account_type<>'expense'))::int
        into v_exp_debit_legs, v_nonexp_debit_legs
      from clara.journal_lines l
      join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
      where l.entry_id=p_entry and l.debit_cents>0;
      if v_tax is not null and v_tax <> 0
         and v_exp_debit_legs > 0 and v_nonexp_debit_legs = 0 then
        raise exception 'a supplier bill whose document states a nonzero tax total requires one tied sst_purchase_cost debit leg'
          using errcode='CLR21',detail='{"reason":"tax_leg_missing"}';
      end if;
    end if;
    select coalesce(r.monetary_cents,clara._normalize_invoice_cents(ev.quote))
      into v_verified_total
    from clara.entry_evidence ev
    join clara.document_regions r on r.id=ev.region_id and r.extraction_id=ev.extraction_id
    where ev.entry_id=p_entry and ev.provenance_tier='verified'
      and ev.field_path='invoice.total'
    order by ev.id limit 1;
    if v_verified_total is not null and not (e.flags ? 'amount_override') then
      select coalesce(sum(l.debit_cents),0) into v_expense_debit
      from clara.journal_lines l
      join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
      where l.entry_id=p_entry and a.account_type='expense';
      if v_payable_credit <> v_verified_total or v_expense_debit <> v_verified_total then
        raise exception 'supplier-bill payable/expense total differs from supported gross'
          using errcode = 'CLR23';
      end if;
    end if;
  end if;
end $$;

-- =====================================================================
-- §B (#51) — clara.settle_autodraft_task CoR (same 5-arity, ACL preserved). The 0011
-- body verbatim EXCEPT: the three losing-dispatch shapes become honest no-op receipts
-- instead of exceptions, and the park threshold reads the shared cap function.
-- =====================================================================
create or replace function clara.settle_autodraft_task(p_task uuid,p_outcome text,p_tokens bigint,
    p_entry uuid default null,p_refusal jsonb default null) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare
  t record; a record; v_actual bigint; v_item_outcome text; v_attempts int;
  -- 0036 §B (review F3): whether the superseded no-op released a still-active reservation.
  v_released_reservation boolean;
begin
  if p_task is null or p_outcome is null
     or p_outcome not in ('drafted','skipped_lane','noop_existing','failed')
     or p_tokens is null or p_tokens<0 then
    raise exception 'autodraft settlement is malformed' using errcode='CLR10';
  end if;
  select * into t from clara.agent_tasks where id=p_task for update;
  if not found or t.kind<>'autodraft' then raise exception 'autodraft task not found' using errcode='CLR11'; end if;
  if t.status in ('completed','failed') then
    return jsonb_build_object('task_id',p_task,'status',t.status,'replayed',true);
  end if;
  -- 0036 §B (ledger #51) — LOSING-DISPATCH SHAPE 1: a task that reached a TERMINAL status
  -- other than the two the replay branch above already absorbs. 'cancelled' is genuinely
  -- reachable (clara.cancel_agent_task is generic across chat_turn/wake/autodraft and has
  -- no autodraft awareness at all — 0034's header traces this), and 'expired' is carried
  -- for the same forward-compatible reason 0034's terminal branch carries it. This task is
  -- no longer this dispatch's to settle; somebody else — a human cancelling, or 0034's
  -- supersede minting a fresh task — has already taken ownership. Raising CLR13 here
  -- propagates out of a frozen "use step", is retried by the durable substrate, throws
  -- again, and ends a run FAILED that actually did its work: the "cosmetically failed run"
  -- symptom. A losing dispatch is NORMAL, so this is a NO-OP WITH AN HONEST RECEIPT —
  -- settled:false plus a named reason, in both the return value and the audit trail.
  -- ONE thing IS written here, and the original "nothing is written" justification was
  -- INCOMPLETE (review F3): the no-other-writer argument held only when a later
  -- re-admission (0034 supersede) or a sweep recovery (reconcile_sweep_runs) eventually
  -- touched the attempt row. A ONE-CLICK task cancelled mid-run has neither — its attempt
  -- row would sit state='active' with reserved_tokens charged against the firm's daily
  -- budget FOREVER unless the human happened to retry. Pre-0036 the same leak existed but
  -- the CLR13 raise at least failed the run loudly; converting it to a quiet no-op without
  -- the release would have made a pre-existing leak invisible. So: if the per-filing
  -- registry row STILL points at THIS task and is still active — meaning no newer dispatch
  -- owns the filing and nobody else will ever release it — zero the reservation and return
  -- the row to 'idle'. attempt_count is deliberately UNTOUCHED (a cancelled task never
  -- settled, so no attempt was consumed; reconcile_sweep_runs' attempt_count=0 reset is a
  -- different case — recovered DRAFT evidence). If the registry moved (0034 repointed
  -- task_id on re-admission), we touch NOTHING: the newer dispatch's accounting stands.
  if t.status in ('cancelled','expired') then
    update clara.autodraft_attempts set reserved_tokens=0, state='idle'
      where task_id=p_task and state='active';
    v_released_reservation := found;
    perform clara._audit(t.firm_id,null,null,null,'settle_autodraft_task',p_entry,
      jsonb_build_object('task',p_task,'outcome',p_outcome,'settled',false,
        'reason','task_superseded','task_status',t.status,
        'released_reservation',v_released_reservation));
    return jsonb_build_object('task_id',p_task,'status',t.status,'settled',false,
      'outcome','not_settled','reason','task_superseded',
      'released_reservation',v_released_reservation);
  end if;
  -- UNCHANGED, and deliberately so: 'queued' (a settle for a task that was never begun),
  -- 'held' and 'awaiting_input' are NOT losing dispatches — they are internal-contract
  -- violations, and they keep their exception.
  if t.status not in ('running','cancel_requested') then
    raise exception 'autodraft task is not running' using errcode='CLR13';
  end if;
  select * into a from clara.autodraft_attempts where task_id=p_task for update;
  -- 0036 §B (ledger #51) — LOSING-DISPATCH SHAPES 2 AND 3, the ownership check the DB
  -- genuinely owns. clara.autodraft_attempts is UNIQUE on filing_id and
  -- clara.admit_autodraft_task repoints its task_id on every re-admission
  -- (`on conflict(filing_id) do update set task_id=excluded.task_id`), so "no registry row
  -- points at this task" means the per-filing registry has moved to a NEWER task (0034's
  -- supersede), and "the row is not active" means it was already released — by
  -- clara.reconcile_sweep_runs' recovery, or by a park. Either way another dispatch's
  -- accounting already stands, and this one must not overwrite it.
  --
  -- THE RUN IDENTITY ITSELF IS NOT CHECKED HERE, AND CANNOT BE: this function receives no
  -- run id to compare against agent_tasks.workflow_run_id (which clara.begin_autodraft_task
  -- does durably record), because its only caller is a "use step" in a `// @frozen`
  -- workflow module that passes exactly five arguments. Closing that gap needs a new
  -- 6-arity function AND a new autoDraft_vN — a runtime change this migration deliberately
  -- does not make and reports instead. What is implemented is the strongest ownership
  -- check available DB-side today, with the same honest-no-op discipline as shape 1.
  if not found then
    perform clara._audit(t.firm_id,null,null,null,'settle_autodraft_task',p_entry,
      jsonb_build_object('task',p_task,'outcome',p_outcome,'settled',false,
        'reason','registry_superseded'));
    return jsonb_build_object('task_id',p_task,'status',t.status,'settled',false,
      'outcome','not_settled','reason','registry_superseded');
  end if;
  if a.state<>'active' then
    perform clara._audit(a.firm_id,null,null,null,'settle_autodraft_task',p_entry,
      jsonb_build_object('task',p_task,'outcome',p_outcome,'settled',false,
        'reason','registry_released','registry_state',a.state,'filing',a.filing_id));
    return jsonb_build_object('task_id',p_task,'status',t.status,'settled',false,
      'outcome','not_settled','reason','registry_released','registry_state',a.state);
  end if;
  if p_outcome='drafted' and (p_entry is null or not exists(
      select 1 from clara.journal_entries e where e.id=p_entry and e.firm_id=a.firm_id
        and e.client_id=a.client_id and e.filing_id=a.filing_id and e.status='draft')) then
    raise exception 'draft settlement entry not found' using errcode='CLR11';
  end if;
  v_actual:=case when p_outcome='failed' then 0 else p_tokens end;
  perform pg_advisory_xact_lock(202991617,hashtext(a.firm_id::text));
  insert into clara.firm_usage_daily(firm_id,usage_date,tokens_used)
    values(a.firm_id,a.usage_date,0) on conflict(firm_id,usage_date) do nothing;
  update clara.firm_usage_daily set tokens_used=greatest(0,
      tokens_used+v_actual-a.reserved_tokens)
    where firm_id=a.firm_id and usage_date=a.usage_date;
  insert into clara.task_usage(task_id,firm_id,tokens)
    values(p_task,a.firm_id,v_actual) on conflict(task_id) do nothing;
  if p_outcome='failed' then
    update clara.agent_tasks set status='failed',error_code='internal' where id=p_task;
    v_attempts:=a.attempt_count+1;
    -- 0036 §B (ledger #53's other half): the cap stops being a bare literal. It is the
    -- SAME function clara._autodraft_attempt_budget reads for the queue warning, so the
    -- number a human is shown and the number that actually parks a filing can never
    -- drift. The VALUE is unchanged at 2 — owner-ruled; the sharing stays, only its
    -- invisibility was the defect.
    update clara.autodraft_attempts set attempt_count=v_attempts,
      state=case when v_attempts>=clara._autodraft_attempt_cap() then 'parked' else 'idle' end,
      reserved_tokens=0,last_refusal=coalesce(p_refusal,
        jsonb_build_object('clr','CLR29','reason','refused_attempts')) where id=a.id;
    v_item_outcome:='refused_attempts';
  else
    update clara.agent_tasks set status='completed' where id=p_task;
    update clara.autodraft_attempts set attempt_count=0,state='idle',reserved_tokens=0,
      last_refusal=case when p_outcome='drafted' then null else p_refusal end where id=a.id;
    v_item_outcome:=case p_outcome when 'drafted' then 'drafted'
      when 'noop_existing' then 'noop_existing' else 'skipped_lane' end;
  end if;
  if a.run_id is not null then
    insert into clara.sweep_run_items(run_id,filing_id,firm_id,client_id,document_id,
        outcome,entry_id,refusal_token,tokens_reserved,tokens_spent)
      values(a.run_id,a.filing_id,a.firm_id,a.client_id,a.document_id,v_item_outcome,
        case when v_item_outcome='drafted' then p_entry end,
        case when v_item_outcome<>'drafted' then coalesce(p_refusal,
          jsonb_build_object('clr','CLR29','reason',v_item_outcome)) end,
        a.reserved_tokens,v_actual) on conflict do nothing;
  end if;
  perform clara._audit(a.firm_id,null,null,null,'settle_autodraft_task',p_entry,
    jsonb_build_object('task',p_task,'outcome',p_outcome,'tokens',v_actual,
      'reserved',a.reserved_tokens,'run',a.run_id));
  return jsonb_build_object('task_id',p_task,'status',case when p_outcome='failed'
    then 'failed' else 'completed' end,'outcome',p_outcome,'entry_id',p_entry,
    'tokens_spent',v_actual,'tokens_refunded',greatest(a.reserved_tokens-v_actual,0));
end $$;

-- =====================================================================
-- §C (#53) — clara.list_review_queue gains ONE additive key, installed as a
-- CHANGE-OF-RECORD PATCH rather than as a rebuilt body. That is not a style choice; it is
-- the correction of a real defect this migration carried into review.
--
-- THE LIVE DEFINITION OF THIS FUNCTION IS NOT THE ONE IN 0016. Migration
-- 0017_wave_b.sql:511-655 rewrites it DYNAMICALLY (pg_get_functiondef -> thirteen
-- replaces -> execute) and is therefore its LAST definition. That patch installs: the
-- L5/O8.4 lint queue (a whole lint_rows CTE emitting row_kind='lint_finding',
-- counts.lint_findings, the top-level 'lint' envelope with stale_evaluator, and a per-row
-- finding_id), an O8.4 active-client guard join on ALL SEVEN enumerators (entry / filing /
-- question / task / watch / envelope / lint), and the ADR-031 (WA21-R14) realignment of
-- the draft rows' section_rank to their LANE. A hand-rebuilt 0016 body silently REVERTS
-- every one of those: the lint lane — the surface Gate L's contradiction detector reports
-- through — vanishes from the human queue, clients at status 'onboarding'/'archived' have
-- their drafts and uncoded filings reappear, and needs_you drafts sort back into the
-- rank-2 block across pages. A "create (or replace )?function" grep CANNOT SEE a dynamic
-- patch; only reading the patch does.
--
-- So the additive key is spliced into WHATEVER body is live, and the POSITIVE prestate
-- probes below abort the deploy if the markers of the last known patch are absent — the
-- gate a body-rebuild cannot have. The anchor is 0017's OWN replacement text
-- ('tier',p.tier,'finding_id',p.finding_id) which is a string CONSTANT in 0017's source
-- and therefore byte-known regardless of 0016's whitespace.
--
-- WHAT IS ADDED, on every row that has a filing_id (both 'draft' and 'uncoded_filing'
-- rows): one 'autodraft' key carrying clara._autodraft_attempt_budget(filing). No CTE, no
-- sort tuple, no cursor grammar, no count and no other key is touched. Rows with no filing
-- (open_question / compliance_watch) carry null, exactly as they carry a null filing_id
-- today. The dashboard's own reader (apps/dashboard/app/documents/api.ts) maps known keys
-- only, so an unknown key is inert for every current consumer.
-- =====================================================================
do $q36$
declare v_def text; v_next text;
begin
  select pg_get_functiondef('clara.list_review_queue(jsonb,jsonb,integer)'::regprocedure)
    into v_def;
  -- PRESTATE, AND POSITIVE: prove the live body is the POST-0017 one BEFORE touching it.
  -- A pre-0017 (or reverted) body must abort the deploy rather than be silently re-blessed
  -- as the new change-of-record.
  if position('lint_rows as (' in v_def)=0
     or position('''lint_finding''::text row_kind' in v_def)=0
     or position('''lint_findings'',counts.lint_findings' in v_def)=0
     or position('''finding_id'',p.finding_id)' in v_def)=0
     or position('active_lint_client.status=''active''' in v_def)=0
     or position('active_entry_client.status=''active''' in v_def)=0
     or position('active_filing_client.status=''active''' in v_def)=0
     or position('active_question_client.status=''active''' in v_def)=0
     or position('active_task_client.status=''active''' in v_def)=0
     or position('active_watch_client.status=''active''' in v_def)=0
     or position('active_envelope_client.status=''active''' in v_def)=0
     or position('case when ln.lane=''needs_you'' then 1 else 2 end section_rank,''draft''::text row_kind'
       in v_def)=0 then
    raise exception '0036 section C prestate: the live clara.list_review_queue body is missing a 0017 change-of-record marker (lint lane / seven active-client guards / ADR-031 draft rank) -- refusing to patch a body this migration cannot account for'
      using errcode='CLR10';
  end if;
  if position('''autodraft'',clara._autodraft_attempt_budget(' in v_def)<>0 then
    raise exception '0036 section C prestate: clara.list_review_queue already carries the autodraft budget key -- 0036 has already been applied to this database'
      using errcode='CLR10';
  end if;
  -- Review F4: the anchor must occur EXACTLY ONCE. replace() rewrites every occurrence,
  -- so a drifted body carrying two copies would get two spliced keys while the post-check
  -- below (a mere position() > 0) stayed green. $e36$'s fail-closed pattern, applied here.
  if (length(v_def)-length(replace(v_def,'''tier'',p.tier,''finding_id'',p.finding_id)','')))
     / length('''tier'',p.tier,''finding_id'',p.finding_id)') <> 1 then
    raise exception '0036 section C prestate: the list_review_queue row-payload anchor must appear exactly once in the live body'
      using errcode='CLR10';
  end if;
  v_next:=replace(v_def,
    '''tier'',p.tier,''finding_id'',p.finding_id)',
    '''tier'',p.tier,''finding_id'',p.finding_id,'
      || '''autodraft'',clara._autodraft_attempt_budget(p.filing_id))');
  if v_next=v_def
     or position('''autodraft'',clara._autodraft_attempt_budget(p.filing_id))' in v_next)=0 then
    raise exception '0036 section C: list_review_queue row-payload anchor drift -- the additive autodraft key was not installed'
      using errcode='CLR10';
  end if;
  execute v_next;
end
$q36$;

-- =====================================================================
-- §D (#4) — the sales mis-route gate, on both surfaces:
-- clara.list_autodraft_candidates() (PATCHED, see below) and clara.admit_autodraft_task (a
-- same-5-arity CoR, ACL preserved) which gains the NAMED, RECEIPTED refusal, placed with
-- the lane check so it is never op-key cached.
--
-- THE ENUMERATOR IS PATCHED, NOT REBUILT, FOR THE SAME REASON §C IS. 0011:2771 is not its
-- last definition: 0017_wave_b.sql:136-150 patches it dynamically with the O8.2
-- active-client guard join (join clara.clients oc on oc.id=f.client_id and
-- oc.status='active') under the header "these are the actual autodraft sweep discovery
-- surfaces. A coding lane is operational only when the filing's client is active."
-- Rebuilding 0011's body would have SILENTLY REVERTED that and re-armed the unattended
-- catch-up pass (packages/runtime/lib/autodraft.mjs:253) for onboarding/archived clients.
-- Nothing downstream re-imposes the guard — clara._coding_lane_core filters on
-- retired_at/client_id only and clara.admit_autodraft_task has no client-status check — so
-- the refusal would land at clara._assert_client_operational (CLR10) only AFTER a task was
-- minted, tokens reserved and a model run paid for, burning one of the two attempts, and
-- the filing would park on the next pass. So the direction predicate is spliced into
-- whatever body is live and an absent 0017 marker aborts the deploy.
--
-- THE DIRECTION GATE ITSELF. Every pre-existing predicate in this enumerator is about
-- READINESS; none was ever about DIRECTION, while the unattended drafter it feeds
-- hardcodes coding_kind "supplier_bill"
-- (packages/runtime/workflows/autoDraft.v5.tools.ts:174). A sales document reaching ready
-- was therefore handed to a purchase-only prompt. Latent today (the live probe found 9
-- candidates, all direction='purchase') and a real defect regardless.
--
-- The predicate goes through clara._autodraft_sales_direction, NEVER a bare
-- clara._document_direction, because that function RAISES CLR30 on a direction
-- contradiction and this is a `language sql` body with nowhere to catch it: ONE
-- contradicting document anywhere in the estate would error out this whole enumeration — a
-- firm-wide sweep wedge, strictly worse than the mis-route it fixes. The helper traps
-- CLR30 and answers "not provably sales", so a contradicting filing is still enumerated
-- and still reaches admission's existing lane check, which already refuses it with a
-- visible receipt. ONLY a clean 'sales' resolution is excluded, and the exclusion is not
-- silent: clara.list_review_queue's 'autodraft' block reports sweep_eligible=false /
-- blocked_reason='sales_direction' for exactly these filings, and
-- clara.admit_autodraft_task below refuses them by NAME with a real run-bound receipt.
-- =====================================================================
do $c36$
declare v_def text; v_next text;
begin
  select pg_get_functiondef('clara.list_autodraft_candidates()'::regprocedure) into v_def;
  if position('oc.status=''active''' in v_def)=0 then
    raise exception '0036 section D prestate: the live clara.list_autodraft_candidates body is missing 0017 O8.2 active-client guard join -- refusing to patch a body this migration cannot account for'
      using errcode='CLR10';
  end if;
  if position('clara._autodraft_sales_direction(' in v_def)<>0 then
    raise exception '0036 section D prestate: clara.list_autodraft_candidates already carries the direction predicate -- 0036 has already been applied to this database'
      using errcode='CLR10';
  end if;
  -- Review F4: the order-by anchor must occur EXACTLY ONCE (see section C's identical
  -- guard for the reasoning -- replace() rewrites every occurrence).
  if (length(v_def)-length(replace(v_def,chr(10) || '  order by f.firm_id,f.filed_at,f.id;','')))
     / length(chr(10) || '  order by f.firm_id,f.filed_at,f.id;') <> 1 then
    raise exception '0036 section D prestate: the list_autodraft_candidates order-by anchor must appear exactly once in the live body'
      using errcode='CLR10';
  end if;
  v_next:=replace(v_def,
    chr(10) || '  order by f.firm_id,f.filed_at,f.id;',
    chr(10) || '    and not clara._autodraft_sales_direction(f.document_id,f.client_id)'
      || chr(10) || '  order by f.firm_id,f.filed_at,f.id;');
  if v_next=v_def
     or position('and not clara._autodraft_sales_direction(f.document_id,f.client_id)' in v_next)=0 then
    raise exception '0036 section D: list_autodraft_candidates order-by anchor drift -- the direction predicate was not installed'
      using errcode='CLR10';
  end if;
  execute v_next;
end
$c36$;

-- =====================================================================
-- §D, second surface — clara.admit_autodraft_task CoR (same 5-arity, ACL preserved). The
-- 0034:134 body verbatim EXCEPT the named direction refusal; REBUILT rather than patched
-- because 0034 genuinely is its last definition (grepped both ways: no migration patches it
-- dynamically, and 0033:59 only CALLS it). This is the LOAD-BEARING half of §D — the
-- per-document dispatch path resolves filings through
-- clara.list_document_autodraft_candidates, which applies no filters by design.
-- =====================================================================
CREATE OR REPLACE FUNCTION clara.admit_autodraft_task(p_filing uuid, p_origin text, p_run_id uuid, p_model text, p_reserve_tokens bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'clara', 'pg_temp'
AS $function$
declare
  a record; f record; r record; v_dedupe jsonb; v_lane record; v_task uuid;
  v_op_key text; v_limit bigint; v_used bigint; v_share numeric; v_cap int;
  v_today date:=(now() at time zone 'UTC')::date; v_constraint text;
  v_is_retry boolean:=false;
begin
  if p_filing is null then raise exception 'filing is required' using errcode='CLR10'; end if;

  -- Registry short-circuit is deliberately BEFORE op receipt lookup/creation.
  select aa.*,t.status as task_status into a from clara.autodraft_attempts aa
    left join clara.agent_tasks t on t.id=aa.task_id where aa.filing_id=p_filing;
  if found and a.state='active' and a.task_status in
      ('queued','running','cancel_requested') then
    -- A run-bound noop MUST still write its item, or the run's expected_count is
    -- never reached and it stays open forever (accumulating against the
    -- concurrent-sweep cap — a firm-wide wedge). Mirrors the parked branch.
    if p_run_id is not null then
      insert into clara.sweep_run_items(run_id,filing_id,firm_id,client_id,document_id,
          outcome)
        values(p_run_id,a.filing_id,a.firm_id,a.client_id,a.document_id,'noop_existing')
        on conflict do nothing;
    end if;
    return jsonb_build_object('outcome','noop_existing','task_id',a.task_id);
  elsif found and a.state='parked' then
    if p_run_id is not null then
      insert into clara.sweep_run_items(run_id,filing_id,firm_id,client_id,document_id,
          outcome,refusal_token)
        values(p_run_id,a.filing_id,a.firm_id,a.client_id,a.document_id,
          'refused_attempts',jsonb_build_object('clr','CLR29','reason','refused_attempts'))
        on conflict do nothing;
    end if;
    return jsonb_build_object('outcome','refused_attempts','reason','refused_attempts');
  end if;

  if p_origin is null or p_origin not in ('sweep','one_click')
     or p_model is null or nullif(btrim(p_model),'') is null
     or p_reserve_tokens is null or p_reserve_tokens<1
     or (p_origin='sweep' and p_run_id is null)
     or (p_origin='one_click' and p_run_id is not null) then
    raise exception 'autodraft admission is malformed' using errcode='CLR10';
  end if;
  select df.* into f from clara.document_filings df where df.id=p_filing
    and df.retired_at is null for update;
  if not found then raise exception 'active filing not found' using errcode='CLR11'; end if;
  if p_run_id is not null and not exists(select 1 from clara.sweep_runs sr
      where sr.id=p_run_id and sr.firm_id=f.firm_id and sr.state='open') then
    raise exception 'open sweep run not found' using errcode='CLR11';
  end if;
  -- A waiter that lost the filing lock rechecks the registry before touching op receipts.
  -- 0034 (ledger #45/#43): this is now the ONLY authoritative registry decision -- the
  -- pre-lock fast-path above stays exactly as it was (an optimization that skips lock
  -- contention for the common live/parked cases; anything it does not recognize simply
  -- falls through to acquire the lock, same as before 0034). Reading a.task_status
  -- (agent_tasks.status via the LEFT JOIN) DIRECTLY, not a.state alone, matters: a task
  -- cancelled through the generic clara.cancel_agent_task verb (which has no autodraft
  -- awareness at all) leaves a.state='active' STALE forever -- the live-status branch
  -- below correctly excludes it anyway, because 'cancelled' is not in its status list,
  -- so it falls through to the new terminal branch regardless of what a.state says. The
  -- live-status list itself is UNCHANGED from 0031 (queued/running/cancel_requested) --
  -- clara._tf_agent_task_update's transition matrix for kind='autodraft' makes held and
  -- awaiting_input structurally unreachable for this task kind, so there is no adjacent
  -- gap to close there.
  select aa.*,t.status as task_status into a from clara.autodraft_attempts aa
    left join clara.agent_tasks t on t.id=aa.task_id where aa.filing_id=p_filing;
  if found and a.state='active' and a.task_status in
      ('queued','running','cancel_requested') then
    if p_run_id is not null then
      insert into clara.sweep_run_items(run_id,filing_id,firm_id,client_id,document_id,
          outcome)
        values(p_run_id,a.filing_id,a.firm_id,a.client_id,a.document_id,'noop_existing')
        on conflict do nothing;
    end if;
    return jsonb_build_object('outcome','noop_existing','task_id',a.task_id);
  elsif found and a.state='parked' then
    if p_run_id is not null then
      insert into clara.sweep_run_items(run_id,filing_id,firm_id,client_id,document_id,
          outcome,refusal_token)
        values(p_run_id,a.filing_id,a.firm_id,a.client_id,a.document_id,
          'refused_attempts',jsonb_build_object('clr','CLR29','reason','refused_attempts'))
        on conflict do nothing;
    end if;
    return jsonb_build_object('outcome','refused_attempts','reason','refused_attempts');
  elsif found and a.task_status='completed' then
    -- 0034: the work already exists -- an honest refusal, never a silent re-admit and
    -- never a replayed stale receipt that would misreport what happened (the #43 sin).
    if p_run_id is not null then
      insert into clara.sweep_run_items(run_id,filing_id,firm_id,client_id,document_id,
          outcome)
        values(p_run_id,a.filing_id,a.firm_id,a.client_id,a.document_id,'noop_existing')
        on conflict do nothing;
    end if;
    return jsonb_build_object('outcome','already_done','task_id',a.task_id);
  elsif found and a.task_status in ('failed','cancelled','expired') then
    -- 0034: SUPERSEDE. Before this migration, the registry check recognized only
    -- 'active'+live-status and 'parked' -- a task that failed once (settle_autodraft_task
    -- sets state='idle' after exactly one failure, only parking at two) matched NEITHER
    -- branch and fell all the way through to the op-key replay below, which found the
    -- OLD settled 'admitted' receipt and returned it verbatim: same task_id, same
    -- reserved_tokens, nothing actually dispatched, attempt_count frozen -- a report that
    -- lies about whether anything happened. Reconciled honestly rather than assumed: a
    -- task that failed through settle_autodraft_task's own failure branch already had
    -- its reservation refunded (reserved_tokens=0 on this row); a task cancelled through
    -- the generic cancel_agent_task verb was NEVER refunded (that verb has no autodraft
    -- awareness), so a.reserved_tokens can still be genuinely outstanding here -- refund
    -- whatever remains before minting the fresh reservation below, so a cancelled
    -- attempt can never leak firm_usage_daily budget forever. The stale settled receipt
    -- is cleared so the SAME deterministic op-key can be reserved again as a genuinely
    -- fresh admission; v_is_retry marks the eventual result 're_admitted', distinct from
    -- a replayed live 'admitted', so the caller is never told a retry replayed when a
    -- brand-new task was actually dispatched. No RETURN here -- control falls through to
    -- the lane check, the budget checks, and the existing task-mint pipeline below,
    -- unchanged, which is what actually dispatches the fresh attempt.
    --
    -- O-round confirmation finding (Codex, High/blocking): refunding firm_usage_daily
    -- alone is NOT idempotent, because autodraft_attempts.reserved_tokens itself was only
    -- ever cleared by the success-path UPSERT far below -- if THIS retry itself then hits
    -- the lane check or a budget refusal and returns early (a live possibility: the lane
    -- may have changed, or the firm's daily budget may be exhausted), the row still reads
    -- reserved_tokens=<the old amount>, so the NEXT call re-enters this same branch and
    -- refunds the identical amount a second time -- unboundedly, on every subsequent
    -- refused retry, silently corrupting the firm's shared daily counter (greatest(0,...)
    -- does not make this safe: it can erase OTHER tasks' legitimate same-day usage). The
    -- reconciliation must therefore be made DURABLE on the attempt row itself, right here,
    -- before any code path that could return early -- reserved_tokens=0 plus a non-active
    -- state (ck_autodraft_attempts_reservation requires state IN ('idle','parked') for a
    -- reserved_tokens=0 row). This UPDATE is unconditional (not gated behind reserved_
    -- tokens>0) so the already-refunded settle-failure path (state already 'idle',
    -- reserved_tokens already 0) sees an idempotent, harmless no-op write, while the
    -- never-refunded cancellation path gets its reservation genuinely closed out. Because
    -- this statement runs in the OUTER scope -- strictly before the one inner EXCEPTION-
    -- guarded sub-transaction this function has, which wraps only the mint pipeline
    -- further below -- it commits together with whichever return the function ultimately
    -- takes, and survives even if that inner block's handler later fires.
    v_is_retry:=true;
    v_op_key:='autodraft:'||p_filing||':'||p_origin;
    if a.reserved_tokens>0 then
      perform pg_advisory_xact_lock(202991617,hashtext(a.firm_id::text));
      insert into clara.firm_usage_daily(firm_id,usage_date,tokens_used)
        values(a.firm_id,a.usage_date,0) on conflict(firm_id,usage_date) do nothing;
      update clara.firm_usage_daily set tokens_used=greatest(0,tokens_used-a.reserved_tokens)
        where firm_id=a.firm_id and usage_date=a.usage_date;
    end if;
    update clara.autodraft_attempts set reserved_tokens=0,state='idle',updated_at=now()
      where filing_id=p_filing;
    delete from clara.op_receipts where firm_id=a.firm_id and fn='admit_autodraft_task'
      and op_key=v_op_key;
  end if;

  -- 0036 §D (ledger #4): THE SALES MIS-ROUTE GATE, and the LOAD-BEARING half of it. The
  -- primary dispatch path does NOT go through clara.list_autodraft_candidates() at all —
  -- packages/runtime/lib/autodraft.mjs:57 dispatches per document via
  -- clara.list_document_autodraft_candidates(uuid), which by design applies no filters
  -- whatsoever because ADMISSION is the gate. So gating here is what actually stops a
  -- sales document from reaching the purchase-only drafter, on both that path and the
  -- catch-up enumeration.
  --
  -- Placed WITH the lane check and strictly BEFORE op-key reservation, for exactly 0031's
  -- reason: a direction refusal creates no resource, so it must be re-derived fresh on
  -- every call and never frozen into an op-key receipt. Placed BEFORE the lane check
  -- rather than after so the refusal names the real cause ('sales_direction') instead of
  -- whatever generic lane reason a sales filing happens to produce.
  --
  -- THE RECEIPT IS REAL, and it respects the constraint rather than inventing a value:
  -- clara.sweep_run_items.outcome is a CHECK-constrained enum
  -- ('drafted','skipped_lane','refused_budget','refused_attempts','noop_existing'), so
  -- the row rides 'skipped_lane' with a DISTINCT refusal_token reason — precisely how the
  -- lane_changed refusal already encodes itself. A run-bound admission MUST write its
  -- item or the run's expected_count is never reached and it stays open forever
  -- (the firm-wide wedge the noop/parked branches above already guard against), so this
  -- branch writes one on the same terms.
  if clara._autodraft_sales_direction(f.document_id,f.client_id) then
    if p_run_id is not null then
      insert into clara.sweep_run_items(run_id,filing_id,firm_id,client_id,document_id,
          outcome,refusal_token)
        values(p_run_id,p_filing,f.firm_id,f.client_id,f.document_id,'skipped_lane',
          jsonb_build_object('clr','CLR29','reason','sales_direction','direction','sales'))
        on conflict do nothing;
    end if;
    return jsonb_build_object('outcome','skipped_direction','reason','sales_direction',
      'direction','sales');
  end if;

  -- 0031 §A (ledger #39, owner ruling): the lane check now runs BEFORE op-key
  -- reservation, and a NOT-READY outcome is never cached. Both admission and
  -- clara.coding_lane (the read verb) already called the identical
  -- clara._coding_lane_core -- there was never a second, forked lane
  -- computation -- but the OLD order reserved (and later settled) the SAME
  -- deterministic (filing,origin) op-key on every refusal, permanently freezing
  -- the first-ever outcome: a vendor binding going live, consent being granted,
  -- or any other later lane-state change was invisible forever, because every
  -- subsequent request_autodraft call for that filing replayed the cached
  -- refusal while clara.coding_lane (uncached) correctly reported the new
  -- state immediately -- reproduced directly (a planted stale receipt was
  -- replayed verbatim while a fresh clara.coding_lane call on the SAME filing,
  -- at the SAME instant, reported the correct answer). Only a genuine
  -- 'admitted' outcome creates a real resource (an agent_tasks row) that needs
  -- idempotent replay protection on retry; a refusal creates nothing, so it
  -- must be re-derived fresh on every call -- admission and the read verb now
  -- agree BY CONSTRUCTION, never by parallel maintenance or a stale cache.
  select * into v_lane from clara._coding_lane_core(f.client_id,p_filing);
  if v_lane.lane<>'ready' then
    if p_run_id is not null then
      insert into clara.sweep_run_items(run_id,filing_id,firm_id,client_id,document_id,
          outcome,refusal_token)
        values(p_run_id,p_filing,f.firm_id,f.client_id,f.document_id,'skipped_lane',
          jsonb_build_object('clr','CLR29','reason','lane_changed','lane',v_lane.lane,
            'reasons',v_lane.reasons)) on conflict do nothing;
    end if;
    return jsonb_build_object('outcome','lane_changed','lane',v_lane.lane,
      'reasons',v_lane.reasons);
  end if;

  -- 0031 O-round confirmation finding 2: the budget/concurrency-cap refusals below
  -- are EXACTLY the same class of transient, state-dependent fact as the lane check
  -- above (firm_usage_daily resets per usage_date; sweep_runs' open count changes
  -- as runs close) -- caching either of them under the same state-free (filing,
  -- origin) key would freeze a budget refusal past a daily reset or a cleared
  -- concurrency cap exactly as the lane bug did. Neither refusal branch below
  -- mutates firm_usage_daily/sweep_runs (only the eventual success path does), so
  -- re-deriving them fresh on every call has no double-charge side effect. Op-key
  -- reservation therefore moves to immediately before the one mutation that
  -- actually needs idempotent replay protection: task creation itself.
  perform pg_advisory_xact_lock(202991617,hashtext(f.firm_id::text));
  select coalesce(fl.daily_token_limit,1000000),fl.sweep_budget_share,
      fl.max_concurrent_sweeps into v_limit,v_share,v_cap
    from clara.firms z left join clara.firm_limits fl on fl.firm_id=z.id
    where z.id=f.firm_id;
  v_share:=coalesce(v_share,0.60); v_cap:=coalesce(v_cap,2);
  insert into clara.firm_usage_daily(firm_id,usage_date,tokens_used)
    values(f.firm_id,v_today,0) on conflict(firm_id,usage_date) do nothing;
  select tokens_used into v_used from clara.firm_usage_daily
    where firm_id=f.firm_id and usage_date=v_today for update;
  if p_origin='sweep' and (select count(*) from clara.sweep_runs
      where firm_id=f.firm_id and state='open')>=v_cap then
    if p_run_id is not null then
      insert into clara.sweep_run_items(run_id,filing_id,firm_id,client_id,document_id,
          outcome,refusal_token)
        values(p_run_id,p_filing,f.firm_id,f.client_id,f.document_id,'refused_budget',
          jsonb_build_object('clr','CLR29','reason','refused_budget','gate','concurrency'))
        on conflict do nothing;
    end if;
    return jsonb_build_object('outcome','refused_budget','reason','refused_budget');
  end if;
  if (p_origin='sweep' and v_used+p_reserve_tokens>(v_limit*v_share)::bigint)
     or (p_origin='one_click' and v_used+p_reserve_tokens>v_limit) then
    if p_run_id is not null then
      insert into clara.sweep_run_items(run_id,filing_id,firm_id,client_id,document_id,
          outcome,refusal_token)
        values(p_run_id,p_filing,f.firm_id,f.client_id,f.document_id,'refused_budget',
          jsonb_build_object('clr','CLR29','reason','refused_budget'))
        on conflict do nothing;
    end if;
    return jsonb_build_object('outcome','refused_budget','reason','refused_budget');
  end if;

  -- O-round confirmation finding #2 (Codex, second scoped pass, High/blocking): a
  -- plpgsql EXCEPTION clause implicitly opens a SAVEPOINT at the START of whatever
  -- block it is attached to -- when this exception clause lived on the function's
  -- OUTER (top-level) block, an unique_violation caught here would roll back to a
  -- savepoint established BEFORE the function body even began, undoing EVERY write
  -- made since, including the terminal branch's reconciliation UPDATE far above (the
  -- #1 fix). Any exception this handler catches -- for ANY reason, present or future
  -- -- would silently erase that reconciliation right before returning
  -- 'noop_existing', reopening the exact double-refund risk #1 closed: the NEXT call
  -- would find reserved_tokens still nonzero and re-refund. Nesting this
  -- EXCEPTION-guarded region in its OWN inner BEGIN...END, opened only HERE --
  -- immediately before the one mutation sequence it exists to protect -- means its
  -- implicit savepoint is established AFTER the terminal branch's reconciliation
  -- already ran in the OUTER, unguarded scope; a rollback-to-savepoint here can only
  -- ever undo what THIS inner block itself wrote, never anything from before it
  -- opened. No other exception handler exists anywhere else in this function.
  --
  -- Third O-round confirmation finding (Codex, third scoped pass, Medium): a build-
  -- time draft of THIS fix opened the inner block AFTER the op-key reservation call,
  -- leaving _reserve_op's own insert in the OUTER, unguarded scope -- if the inner
  -- block's handler ever fires, the mint writes roll back but the PENDING op receipt
  -- _reserve_op already inserted (result IS NULL) would survive, orphaned forever:
  -- every subsequent call would replay that pending receipt as {"pending":true}
  -- rather than ever retrying. The op-key is still reserved "immediately before the
  -- one mutation sequence that needs idempotent replay protection" -- that sequence
  -- now begins here, at the top of THIS block, not before it.
  begin
    if v_op_key is null then
      v_op_key:='autodraft:'||p_filing||':'||p_origin;
    end if;
    v_dedupe:=clara._reserve_op(f.firm_id,'admit_autodraft_task',v_op_key,
      clara._hash(jsonb_build_object('filing',p_filing,'origin',p_origin)));
    if v_dedupe is not null then return v_dedupe; end if;

    update clara.firm_usage_daily set tokens_used=tokens_used+p_reserve_tokens
      where firm_id=f.firm_id and usage_date=v_today;
    insert into clara.agent_tasks(firm_id,client_id,kind,status,model_snapshot)
      values(f.firm_id,f.client_id,'autodraft','queued',btrim(p_model)) returning id into v_task;
    insert into clara.autodraft_attempts(firm_id,client_id,document_id,filing_id,
        task_id,origin,run_id,state,reserved_tokens,usage_date,last_refusal)
      values(f.firm_id,f.client_id,f.document_id,p_filing,v_task,p_origin,p_run_id,
        'active',p_reserve_tokens,v_today,null)
      on conflict(filing_id) do update set task_id=excluded.task_id,origin=excluded.origin,
        run_id=excluded.run_id,state='active',reserved_tokens=excluded.reserved_tokens,
        usage_date=excluded.usage_date,last_refusal=null,updated_at=now();
    perform clara._audit(f.firm_id,null,null,null,'admit_autodraft_task',null,
      jsonb_build_object('task',v_task,'filing',p_filing,'origin',p_origin,
        'run',p_run_id,'reserved_tokens',p_reserve_tokens));
    return clara._finish_op(f.firm_id,'admit_autodraft_task',v_op_key,
      jsonb_build_object('outcome',case when v_is_retry then 're_admitted' else 'admitted' end,
        'task_id',v_task,'reserved_tokens',p_reserve_tokens));
  exception when unique_violation then
    get stacked diagnostics v_constraint=constraint_name;
    if v_constraint='uq_autodraft_attempts_filing' then
      select * into a from clara.autodraft_attempts where filing_id=p_filing;
      if p_run_id is not null then
        insert into clara.sweep_run_items(run_id,filing_id,firm_id,client_id,document_id,
            outcome)
          values(p_run_id,a.filing_id,a.firm_id,a.client_id,a.document_id,'noop_existing')
          on conflict do nothing;
      end if;
      return jsonb_build_object('outcome','noop_existing','task_id',a.task_id);
    end if;
    raise;
  end;
end $function$;

reset role;

-- =====================================================================
-- §E (owner-approved 2026-07-30) — MSIC reaches the context pack.
--
-- THE GAP: the client-onboarding interview asks for the client's 5-digit MSIC industry
-- code (packages/runtime/workflows/interview.v2.questions.ts:82, item_key 'msic') and the
-- answer is durably committed into clara.onboarding_plan_items on the committed client
-- plan — and then NOTHING reads it. Zero occurrences of 'msic' in migrations 0001..0035;
-- clara.get_context_pack surfaces client id/name/status only. So the one industry fact the
-- firm explicitly captured never reaches the model at judgement time, although industry
-- materially changes long-tail treatment (a restaurant's "entertainment" is not a
-- consultancy's — deductibility, SST, BIK all read differently by trade).
--
-- THE FIX, additive and honest: the pack's `client` object gains ONE key, 'msic', read
-- from the LATEST COMMITTED client-scoped plan's answered/resolved 'msic' item. No plan,
-- no item, or an unanswered item -> the key is null. Nothing else in the pack moves; no
-- grant changes; the pack stays SECURITY DEFINER exactly as it was (0016:4263 —
-- pg_get_functiondef preserves the property through the splice), which is precisely why
-- the msic subquery needs NO new table grant on onboarding_plans/onboarding_plan_items:
-- the definer-owned body reads them, and tenant scoping stays bound to the function's own
-- already-authorized client (p2.client_id = cl.id). (Review F7 corrected an INVOKER
-- misstatement here.)
--
-- PATCHED, NOT REBUILT — the same law as §C/§D and for a sharper reason: 0016:4262 is the
-- last CREATE of clara.get_context_pack, but 0017 (the wiki block), 0018 (the
-- resolution-exclusion surgery) and 0019 (the wiki boundary) each rewrote the live body
-- via pg_get_functiondef/replace. A rebuild from ANY file text would silently revert all
-- three. The splice below therefore patches whatever body is live, positively probes one
-- marker from each of those surgeries first, and aborts on any drift.
--
-- ANCHOR: the 0016 client-object literal, verified present EXACTLY ONCE on the live
-- production body (probe run 2026-07-30: position 1791 of 9062, occurrence count 1).
-- =====================================================================
do $e36$
declare v_def text; v_next text; v_anchor text;
begin
  select pg_get_functiondef('clara.get_context_pack(uuid,text)'::regprocedure)
    into v_def;
  -- PRESTATE, POSITIVE: one marker from each post-0016 surgery this patch must not lose.
  if position('sst_registration_watch' in v_def)=0 then
    raise exception '0036 section E prestate: get_context_pack is missing the 0016 sst_registration_watch block -- not the body this migration accounts for'
      using errcode='CLR10';
  end if;
  if position('''wiki''' in v_def)=0 then
    raise exception '0036 section E prestate: get_context_pack is missing the 0017 wiki block -- a rebuilt/reverted body must abort rather than be re-blessed'
      using errcode='CLR10';
  end if;
  -- 0018's resolution-exclusion surgery: the serialized resolutions must EXCLUDE the
  -- binding columns. A body reverted to post-0017 would carry the wiki block but not this
  -- exclusion -- and re-blessing it would leak bound_scope_kind/bound_scope_id back into
  -- the agent's context pack. (Review F2: the original probes covered 0016/0017 only.)
  if position('-''bound_scope_kind''-''bound_scope_id''' in v_def)=0 then
    raise exception '0036 section E prestate: get_context_pack is missing the 0018 resolution-exclusion surgery (the bound_scope_kind/bound_scope_id strip) -- a body reverted past 0018 must abort rather than be re-blessed'
      using errcode='CLR10';
  end if;
  -- 0019's wiki-boundary surgery: the citation stale annotations and the page-level
  -- has_stale_sources flag. Same reasoning.
  if position('''stale_at'',wc.stale_at' in v_def)=0
     or position('''has_stale_sources''' in v_def)=0 then
    raise exception '0036 section E prestate: get_context_pack is missing a 0019 wiki-boundary marker (citation stale_at / has_stale_sources) -- a body reverted past 0019 must abort rather than be re-blessed'
      using errcode='CLR10';
  end if;
  if position('''msic''' in v_def)<>0 then
    raise exception '0036 section E prestate: get_context_pack already carries the msic key -- 0036 has already been applied to this database'
      using errcode='CLR10';
  end if;
  v_anchor:='''client'',jsonb_build_object(''id'',cl.id,''name'',cl.name,''status'',cl.status)';
  if (length(v_def)-length(replace(v_def,v_anchor,'')))/length(v_anchor)<>1 then
    raise exception '0036 section E prestate: the client-object anchor must appear exactly once in the live get_context_pack body'
      using errcode='CLR10';
  end if;
  v_next:=replace(v_def, v_anchor,
    '''client'',jsonb_build_object(''id'',cl.id,''name'',cl.name,''status'',cl.status,'
    || '''msic'',(select i.answer #>> ''{}'''
    || ' from clara.onboarding_plans p2'
    || ' join clara.onboarding_plan_items i on i.plan_id=p2.id'
    || ' where p2.client_id=cl.id and p2.scope_kind=''client'' and p2.state=''committed'''
    || ' and i.item_key=''msic'' and i.state in (''answered'',''resolved'')'
    || ' order by p2.committed_at desc, i.answered_at desc limit 1))');
  if v_next=v_def or position('''msic''' in v_next)=0 then
    raise exception '0036 section E: get_context_pack client-object anchor drift -- the msic key was not installed'
      using errcode='CLR10';
  end if;
  execute v_next;
end
$e36$;

-- =====================================================================
-- ACLs. All five recuts are SAME-ARITY CREATE OR REPLACEs, so each keeps its as-built ACL
-- untouched (asserted in the tail). The three §0 helpers are definer-internal and granted
-- to NOBODY — 0011 already set `alter default privileges for role clara_fn_owner in schema
-- clara revoke execute on functions from public`, and each carries its own explicit
-- `revoke all ... from public` above as belt-and-braces (the clara._coding_lane_core
-- idiom). NO ROLE GAINS EXECUTE ANYWHERE IN THIS MIGRATION, and no table grant is added:
-- clara.autodraft_attempts stays unreadable to clara_authenticated / clara_agent_ro, which
-- is exactly why §C's visibility rides the SECURITY DEFINER queue read instead of the
-- SECURITY INVOKER clara.list_uncoded_filings. Both facts are tail-asserted.
-- =====================================================================

-- =====================================================================
-- TAIL, PART 1 of 2 — the SOURCE-SHAPE self-verification. Every raise is a real assertion
-- failure, not a soft warning.
--
-- WHY THIS IS SPLIT IN TWO, since the seam is not cosmetic: scripts/check-wiki-dynamic-sql
-- fail-closes on any `do` block that BOTH reads a function body via pg_get_functiondef AND
-- contains the bare token `execute`, because that is precisely the change-of-record-patch
-- signature (read a body, rewrite it, EXECUTE the rewrite) whose dynamically-constructed
-- relation name migration 0019's prosrc scan cannot see. This block genuinely reads bodies
-- but installs nothing; the ACL assertions genuinely need the word (has_function_privilege's
-- privilege argument is spelled 'execute') but read no body. Keeping them in one block would
-- trip the gate, and the two dishonest ways to silence it — splitting the keyword across
-- string literals, or widening the allowlist — are exactly what the gate exists to catch.
-- Separating the concerns satisfies it truthfully: part 1 has no `execute` token, part 2 has
-- no pg_get_functiondef. (The §C and §D blocks earlier in this file ARE genuine
-- change-of-record patches — read a body, rewrite it, EXECUTE the rewrite — and they pass
-- the same gate the way every prior CoR patch does: the gate reconstructs the text that ends
-- up in the persistent surface, and none of their replacement literals mentions wiki or
-- carries a dynamic statement of its own.)
-- =====================================================================
do $tail$
declare
  v_prior_count int;
  v_shape_src text; v_settle_src text; v_queue_src text; v_cand_src text; v_admit_src text;
  v_pack_src text;
  v_pos_gate int; v_pos_belt int; v_pos_sstp int; v_pos_verified int;
  v_pos_lock int; v_pos_dir int; v_pos_lane int; v_pos_reserve int;
  v_cap int; v_n int;
begin
  -- (1) mandatory prior-migration check. The DEEPEST true content dependency across the
  -- five recut bodies is 0034's recut of clara.admit_autodraft_task (0011 -> 0031 -> 0034);
  -- the other four last changed at 0011 or 0016, which the runner's ordering guarantees are
  -- already in place if 0034 is. Independent of the tooling's numeric frontier (0035), which
  -- touches none of these five functions.
  select count(*) into v_prior_count from clara.schema_migrations
    where version = '0034_autodraft_retry_door';
  if v_prior_count <> 1 then
    raise exception '0036 tail: migration 0034_autodraft_retry_door is not recorded as applied -- apply in order';
  end if;

  -- The 0035 normalizer, reused verbatim: strip block comments, then line comments, then
  -- collapse whitespace, then lowercase. Stripping comments FIRST is load-bearing here --
  -- this migration's own commentary quotes almost every token the probes below search for,
  -- so an un-normalized scan would pass on the comments alone.
  select pg_get_functiondef('clara._assert_supplier_bill_shape_at(uuid,uuid)'::regprocedure) into v_shape_src;
  select pg_get_functiondef('clara.settle_autodraft_task(uuid,text,bigint,uuid,jsonb)'::regprocedure) into v_settle_src;
  select pg_get_functiondef('clara.list_review_queue(jsonb,jsonb,int)'::regprocedure) into v_queue_src;
  select pg_get_functiondef('clara.list_autodraft_candidates()'::regprocedure) into v_cand_src;
  select pg_get_functiondef('clara.admit_autodraft_task(uuid,text,uuid,text,bigint)'::regprocedure) into v_admit_src;
  v_shape_src :=lower(regexp_replace(regexp_replace(regexp_replace(v_shape_src ,'/\*[\s\S]*?\*/','','g'),'--[^\n]*','','g'),'\s+',' ','g'));
  v_settle_src:=lower(regexp_replace(regexp_replace(regexp_replace(v_settle_src,'/\*[\s\S]*?\*/','','g'),'--[^\n]*','','g'),'\s+',' ','g'));
  v_queue_src :=lower(regexp_replace(regexp_replace(regexp_replace(v_queue_src ,'/\*[\s\S]*?\*/','','g'),'--[^\n]*','','g'),'\s+',' ','g'));
  v_cand_src  :=lower(regexp_replace(regexp_replace(regexp_replace(v_cand_src  ,'/\*[\s\S]*?\*/','','g'),'--[^\n]*','','g'),'\s+',' ','g'));
  v_admit_src :=lower(regexp_replace(regexp_replace(regexp_replace(v_admit_src ,'/\*[\s\S]*?\*/','','g'),'--[^\n]*','','g'),'\s+',' ','g'));

  -- (2) §A: the belt exists, EXACTLY ONCE, with CLR21 + tax_leg_missing attached.
  v_n:=(length(v_shape_src)-length(replace(v_shape_src,
      'requires one tied sst_purchase_cost debit leg','')))
    / length('requires one tied sst_purchase_cost debit leg');
  if v_n <> 1 then
    raise exception '0036 tail: the section A nonzero-tax belt must appear exactly once in _assert_supplier_bill_shape_at -- found %', v_n;
  end if;
  if position('using errcode=''clr21'',detail=''{"reason":"tax_leg_missing"}''' in v_shape_src)=0 then
    raise exception '0036 tail: the section A belt is not raised as CLR21 with detail reason tax_leg_missing';
  end if;
  -- THE FULL PREDICATE, as one anchored string: a stated nonzero tax AND a debit side that
  -- is PURELY expense-typed (at least one expense debit leg AND zero non-expense debit
  -- legs). The non-expense conjunct is the F1 correction and it is load-bearing, so this
  -- probe is written to FAIL on the pre-correction body (which tested only
  -- `v_exp_debit_legs > 0`): without it, a MIXED asset+expense bill on a nonzero-tax
  -- document has no approvable shape at all -- a partial sst_purchase_cost leg fails the
  -- full-tie above, a full one expense-types the capitalised portion, and an
  -- uncorroborated document offers no override -- so the belt would block a RIGHT entry.
  if position('if v_tax is not null and v_tax <> 0 and v_exp_debit_legs > 0 and v_nonexp_debit_legs = 0 then' in v_shape_src)=0 then
    raise exception '0036 tail: the section A belt does not test v_tax is not null AND v_tax <> 0 AND a PURELY expense-typed debit side (v_exp_debit_legs > 0 AND v_nonexp_debit_legs = 0) -- absence, a stated zero, a capitalised purchase or a MIXED asset+expense bill could now raise with no approvable shape available';
  end if;
  -- The census must be counted from account_type, on DEBIT legs only, and both directions
  -- must be counted from the SAME scan. A count over all legs would let a bill whose only
  -- expense-typed line is a CREDIT satisfy the positive half, and a non-expense count that
  -- ignored debit_cents>0 would carve out every bill with an income/liability CREDIT leg --
  -- i.e. every bill, since the payable credit is liability-class.
  if position('into v_exp_debit_legs, v_nonexp_debit_legs from clara.journal_lines l' in v_shape_src)=0
     or position('filter (where a.account_type=''expense''))::int' in v_shape_src)=0
     or position('filter (where a.account_type<>''expense''))::int' in v_shape_src)=0
     or position('where l.entry_id=p_entry and l.debit_cents>0;' in v_shape_src)=0 then
    raise exception '0036 tail: the section A debit-side census is not two account_type filters over one DEBIT-legs-only scan';
  end if;

  -- (3) §A POSITION, which is the whole safety argument: the belt is the ELSE of the
  -- sst-leg conditional, so it sits INSIDE `coding_kind=supplier_bill and reversal_of is
  -- null` (a reversal mirror can never reach it), AFTER the sstp leg COUNT that decides
  -- which branch runs (so it can never read a not-yet-computed count), and BEFORE the
  -- verified-total tie that closes the block.
  v_pos_gate    :=position('if e.coding_kind = ''supplier_bill'' and e.reversal_of is null then' in v_shape_src);
  v_pos_sstp    :=position('where l.entry_id=p_entry and coalesce(a.special_acc_type,'''')=''sst_purchase_cost''' in v_shape_src);
  v_pos_belt    :=position('else v_tax := case when e.document_id is null then null' in v_shape_src);
  v_pos_verified:=position('into v_verified_total from clara.entry_evidence ev' in v_shape_src);
  if v_pos_gate=0 or v_pos_sstp=0 or v_pos_belt=0 or v_pos_verified=0
     or not (v_pos_gate < v_pos_sstp and v_pos_sstp < v_pos_belt and v_pos_belt < v_pos_verified) then
    raise exception '0036 tail: the section A belt is not positioned inside the reversal-gated supplier_bill block, after the sstp leg count and before the verified-total tie (gate=%, sstp=%, belt=%, verified=%)',
      v_pos_gate, v_pos_sstp, v_pos_belt, v_pos_verified;
  end if;

  -- (4) §A REGRESSION: every pre-existing refusal in this function survives, so the
  -- leg-present behaviour is byte-stable and only the previously-unasked fourth corner
  -- changed.
  if position('a supplier bill admits at most one sst_purchase_cost debit leg' in v_shape_src)=0
     or position('an sst_purchase_cost leg requires a stated document tax total' in v_shape_src)=0
     or position('sst_purchase_cost leg differs from the stated tax total' in v_shape_src)=0
     or position('a supplier bill admits no sst_output leg' in v_shape_src)=0
     or position('every control-class line requires a counterparty' in v_shape_src)=0
     or position('supplier-bill payable/expense total differs from supported gross' in v_shape_src)=0 then
    raise exception '0036 tail: a pre-existing _assert_supplier_bill_shape_at refusal went missing -- section A must be additive only';
  end if;

  -- (5) §B: the three losing-dispatch shapes are honest NO-OPS, and the genuine
  -- internal-contract violation keeps its exception.
  if position('if t.status in (''cancelled'',''expired'') then' in v_settle_src)=0
     or position('''reason'',''task_superseded''' in v_settle_src)=0
     or position('''reason'',''registry_superseded''' in v_settle_src)=0
     or position('''reason'',''registry_released''' in v_settle_src)=0 then
    raise exception '0036 tail: settle_autodraft_task is missing one of the three section B honest-no-op branches';
  end if;
  if position('raise exception ''autodraft task is not running'' using errcode=''clr13''' in v_settle_src)=0 then
    raise exception '0036 tail: settle_autodraft_task lost the CLR13 refusal for a never-begun (queued/held/awaiting_input) task -- a real contract violation must stay an exception';
  end if;
  -- The old blanket registry raise must be GONE: both of its shapes are now no-ops.
  if position('raise exception ''autodraft registry not active''' in v_settle_src)<>0 then
    raise exception '0036 tail: settle_autodraft_task still raises on a superseded/released registry row -- the losing dispatch still ends a run as a failure';
  end if;

  -- (6) §B/§C: the attempt cap is ONE shared function, and the literal is gone from the
  -- writer that parks -- so the number a human is shown can never drift from the number
  -- that actually parks a filing.
  select clara._autodraft_attempt_cap() into v_cap;
  if v_cap <> 2 then
    raise exception '0036 tail: the shared autodraft attempt cap must still be 2 (owner ruling -- the sharing STAYS) -- found %', v_cap;
  end if;
  if position('clara._autodraft_attempt_cap()' in v_settle_src)=0 then
    raise exception '0036 tail: settle_autodraft_task does not read the shared attempt cap function';
  end if;
  if position('v_attempts>=2' in v_settle_src)<>0 then
    raise exception '0036 tail: settle_autodraft_task still carries the bare >=2 park literal -- the cap can drift from what the queue reports';
  end if;

  -- (7) §C: the queue read carries the additive attempt-budget key, and its pre-existing
  -- row keys / paging machinery are untouched.
  if position('''autodraft'',clara._autodraft_attempt_budget(p.filing_id)' in v_queue_src)=0 then
    raise exception '0036 tail: list_review_queue does not carry the additive section C autodraft attempt-budget key';
  end if;
  if position('''row_kind'',p.row_kind' in v_queue_src)=0
     or position('''filing_id'',p.filing_id' in v_queue_src)=0
     or position('''lane'',p.lane' in v_queue_src)=0
     or position('''tier'',p.tier' in v_queue_src)=0
     or position('''next_cursor''' in v_queue_src)=0
     or position('''watermark''' in v_queue_src)=0 then
    raise exception '0036 tail: list_review_queue lost a pre-existing row key or its paging machinery -- section C must be additive only';
  end if;
  -- POSITIVE PROBES FOR THE PRIOR CHANGE-OF-RECORD, which the "additive only" probes above
  -- structurally cannot supply: every one of them passes on a body rebuilt from 0016, i.e.
  -- on a body that has silently REVERTED 0017's dynamic patch. These name 0017's own
  -- installed markers, so a reversion fails the deploy instead of shipping green. (This is
  -- the gate the first cut of this migration lacked, and it is exactly how the defect got
  -- in: a `create ... function` grep cannot see a pg_get_functiondef patch.)
  if position('lint_rows as (' in v_queue_src)=0
     or position('''lint_finding''::text row_kind' in v_queue_src)=0
     or position('''lint_findings'',counts.lint_findings' in v_queue_src)=0
     or position('''finding_id'',p.finding_id' in v_queue_src)=0
     or position('active_lint_client.status=''active''' in v_queue_src)=0
     or position('active_entry_client.status=''active''' in v_queue_src)=0
     or position('active_filing_client.status=''active''' in v_queue_src)=0
     or position('active_question_client.status=''active''' in v_queue_src)=0
     or position('active_task_client.status=''active''' in v_queue_src)=0
     or position('active_watch_client.status=''active''' in v_queue_src)=0
     or position('active_envelope_client.status=''active''' in v_queue_src)=0
     or position('case when ln.lane=''needs_you'' then 1 else 2 end section_rank,''draft''::text row_kind'
       in v_queue_src)=0 then
    raise exception '0036 tail: list_review_queue lost a 0017 change-of-record marker (the lint lane, one of the seven active-client guards, or the ADR-031 draft rank) -- 0036 must PATCH the live body, never rebuild it from 0016';
  end if;
  -- The budget payload's own contract, probed on a real call rather than by reading source:
  -- a null filing yields null, which is what every queue row with no filing carries.
  if clara._autodraft_attempt_budget(null) is not null then
    raise exception '0036 tail: _autodraft_attempt_budget(null) must be null -- queue rows with no filing carry null';
  end if;

  -- (8) §D: the direction gate is on BOTH surfaces, and admission's 0031/0034 ordering
  -- invariants still hold with the gate inserted. The gate must sit AFTER the filing lock
  -- (it reads f) and STRICTLY BEFORE the real clara._reserve_op call, so a direction
  -- refusal is never frozen into an op-key receipt -- the exact property 0031 exists to
  -- protect, now extended to the new refusal.
  if position('and not clara._autodraft_sales_direction(f.document_id,f.client_id)' in v_cand_src)=0 then
    raise exception '0036 tail: list_autodraft_candidates does not carry the section D direction predicate';
  end if;
  -- The same positive prior-CoR probe as the queue read gets: 0017:136-150 installed the
  -- O8.2 active-client guard join dynamically, so a body rebuilt from 0011 would pass every
  -- "the predicate is present" check above while having re-armed the unattended catch-up
  -- sweep for onboarding/archived clients.
  if position('join clara.clients oc on oc.id=f.client_id and oc.status=''active''' in v_cand_src)=0 then
    raise exception '0036 tail: list_autodraft_candidates lost 0017 O8.2 active-client guard join -- the unattended sweep would enumerate onboarding/archived clients again';
  end if;
  if position('clara._document_direction(' in v_cand_src)<>0 then
    raise exception '0036 tail: list_autodraft_candidates calls _document_direction directly -- a CLR30 contradiction would error the whole enumeration; it must go through the trapping helper';
  end if;
  -- The gate helper must be TOTAL, never tri-valued: it is consumed as `and not <helper>` in
  -- a WHERE clause, where a NULL would make `not NULL` -> NULL and silently DROP a purchase
  -- filing from the enumeration. Probed on real calls (including the null-argument corners)
  -- rather than by reading the source, because "returns false, not null" is a value claim.
  if clara._autodraft_sales_direction(null,null) is not false
     or clara._autodraft_sales_direction(gen_random_uuid(),null) is not false
     or clara._autodraft_sales_direction(null,gen_random_uuid()) is not false
     or clara._autodraft_sales_direction(gen_random_uuid(),gen_random_uuid()) is not false then
    raise exception '0036 tail: _autodraft_sales_direction returned a non-FALSE answer for an unknown/null document -- a NULL here silently strands purchase work in the candidate WHERE clause';
  end if;
  v_pos_lock   :=position('select df.* into f from clara.document_filings df where df.id=p_filing and df.retired_at is null for update;' in v_admit_src);
  v_pos_dir    :=position('if clara._autodraft_sales_direction(f.document_id,f.client_id) then' in v_admit_src);
  v_pos_lane   :=position('select * into v_lane from clara._coding_lane_core(f.client_id,p_filing);' in v_admit_src);
  v_pos_reserve:=position('clara._reserve_op(f.firm_id,''admit_autodraft_task'',v_op_key,' in v_admit_src);
  if v_pos_lock=0 or v_pos_dir=0 or v_pos_lane=0 or v_pos_reserve=0
     or not (v_pos_lock < v_pos_dir and v_pos_dir < v_pos_lane and v_pos_lane < v_pos_reserve) then
    raise exception '0036 tail: admit_autodraft_task lock/direction/lane/op-key order is wrong (lock=%, direction=%, lane=%, reserve=%)',
      v_pos_lock, v_pos_dir, v_pos_lane, v_pos_reserve;
  end if;
  if substring(v_admit_src from v_pos_dir for v_pos_reserve-v_pos_dir) like '%_finish_op%' then
    raise exception '0036 tail: a refusal between the section D direction gate and op-key reservation settles a receipt -- the 0031 stale-cache property is broken';
  end if;
  if position('''reason'',''sales_direction''' in v_admit_src)=0
     or position('''outcome'',''skipped_direction''' in v_admit_src)=0 then
    raise exception '0036 tail: admit_autodraft_task section D refusal is not NAMED (skipped_direction / sales_direction) -- the exclusion would be invisible';
  end if;
  -- The run-bound receipt must ride an outcome the CHECK constraint actually admits, with
  -- the sales_direction token ADJACENT to it -- anchored as one string rather than as two
  -- independent probes, because the pre-existing lane_changed branch also writes a
  -- 'skipped_lane' row and a split probe would pass on that branch alone.
  if position(
      '''skipped_lane'', jsonb_build_object(''clr'',''clr29'',''reason'',''sales_direction'',''direction'',''sales'')'
      in v_admit_src)=0 then
    raise exception '0036 tail: the section D run-bound receipt does not write outcome skipped_lane (the only CHECK-admitted value for a skip) carrying the sales_direction refusal token';
  end if;

  -- (§E) THE PACK SURFACE (review F2: §E was absent from the tail). The installed body
  -- carries the 'msic' literal EXACTLY TWICE — once as the client-object KEY and once in
  -- the subquery's item_key='msic' predicate; both ride in on the single splice, so any
  -- other count means a doubled or partial install. (The first cut of this assertion
  -- expected ONE and correctly failed the deploy on the rig — the guard guarding itself.)
  -- Every post-0016 surgery must also have survived the splice: 0017's wiki block, 0018's
  -- bound_scope exclusion, 0019's stale annotations.
  select pg_get_functiondef('clara.get_context_pack(uuid,text)'::regprocedure)
    into v_pack_src;
  if (length(v_pack_src)-length(replace(v_pack_src,'''msic''','')))/length('''msic''') <> 2 then
    raise exception '0036 tail: get_context_pack must carry exactly TWO msic literals after section E (the client-object key and the item_key predicate)';
  end if;
  if (length(v_pack_src)-length(replace(v_pack_src,'''msic'',(select','')))/length('''msic'',(select') <> 1 then
    raise exception '0036 tail: the msic client-object KEY must appear exactly once in get_context_pack after section E';
  end if;
  if position('sst_registration_watch' in v_pack_src)=0
     or position('''wiki''' in v_pack_src)=0
     or position('-''bound_scope_kind''-''bound_scope_id''' in v_pack_src)=0
     or position('''stale_at'',wc.stale_at' in v_pack_src)=0
     or position('''has_stale_sources''' in v_pack_src)=0 then
    raise exception '0036 tail: a post-0016 get_context_pack surgery marker (0016 watch / 0017 wiki / 0018 bound_scope strip / 0019 stale annotations) did not survive the section E splice';
  end if;

  raise notice '0036 tail OK (1/6): prior-migration chain intact through 0034 recut of admit_autodraft_task';
  raise notice '0036 tail OK (2/6): section A -- the nonzero-tax belt is present exactly once, CLR21/tax_leg_missing, narrowed to a PURELY expense-typed debit side (mixed and capitalised bills carved out as Gate-P territory), positioned inside the reversal-gated block after the sstp count and before the verified-total tie; every pre-existing refusal survives';
  raise notice '0036 tail OK (3/6): section B -- the three losing-dispatch shapes are honest no-ops (the cancelled/expired no-op releases a still-owned active reservation), the never-begun CLR13 survives, and the park cap is now the ONE shared function (value 2, unchanged)';
  raise notice '0036 tail OK (4/6): section C -- the queue read carries the additive autodraft attempt-budget key with every pre-existing key, the paging machinery, AND every 0017 change-of-record marker (lint lane, seven active-client guards, ADR-031 draft rank) intact';
  raise notice '0036 tail OK (5/6): section D -- the direction gate is on both the enumerator (via the CLR30-trapping helper, with 0017 O8.2 active-client guard join preserved) and admission, ordered lock < direction < lane < op-key, with no receipt settled on the refusal path';
  raise notice '0036 tail OK (6/6): section E -- the pack carries the msic key exactly once and every post-0016 surgery marker (0017 wiki, 0018 bound_scope strip, 0019 stale annotations) survived the splice';
end
$tail$;

-- =====================================================================
-- TAIL, PART 2 of 2 — the ACL/GRANT assertions and the LIVE-CORPUS probes. Deliberately a
-- SEPARATE block that reads NO function body (see part 1's header for why the seam exists,
-- and why the two shortcuts that would have avoided it are not acceptable).
-- =====================================================================
do $acl$
declare
  v_fn text; v_role text;
  v_live_approved int; v_live_draft int;
begin
  -- (A) NO ROLE GAINS EXECUTE: the three §0 helpers are definer-internal only.
  foreach v_fn in array array[
      'clara._autodraft_attempt_cap()',
      'clara._autodraft_sales_direction(uuid,uuid)',
      'clara._autodraft_attempt_budget(uuid)'] loop
    foreach v_role in array array['clara_authenticated','clara_agent_ro','clara_runtime',
        'clara_wake_interactive'] loop
      -- v_role is cast explicitly: the catalog form takes `name` for the grantee, and
      -- leaning on a text->name implicit cast for a VARIABLE (rather than the literals
      -- every prior migration passes here) is exactly the kind of resolution detail that
      -- is cheaper to pin than to debug inside a quiesced deploy window.
      if pg_catalog.has_function_privilege(v_role::name, v_fn, 'execute') then
        raise exception '0036 acl: % is granted to % -- the new helpers are definer-internal only', v_fn, v_role;
      end if;
    end loop;
    -- PUBLIC is a pseudo-role, so has_function_privilege('public',...) would ERROR rather
    -- than answer -- a grant to PUBLIC has to be read off proacl directly, where the PUBLIC
    -- grantee renders with an EMPTY grantee name ('=X/owner').
    if exists(select 1 from pg_proc p, unnest(coalesce(p.proacl,'{}'::aclitem[])) acl
        where p.oid = v_fn::regprocedure and acl::text like '=%') then
      raise exception '0036 acl: % still carries a PUBLIC grant', v_fn;
    end if;
  end loop;

  -- (B) all five recut surfaces kept their as-built ACLs -- the three rebuilt bodies and
  -- the two PATCHED ones alike (a CREATE OR REPLACE preserves grants whether it is written
  -- statically or installed by a change-of-record patch's EXECUTE; this proves none was
  -- accidentally dropped and recreated).
  if not pg_catalog.has_function_privilege('clara_authenticated','clara.list_review_queue(jsonb,jsonb,int)','execute') then
    raise exception '0036 acl: list_review_queue lost its clara_authenticated grant';
  end if;
  if not pg_catalog.has_function_privilege('clara_runtime','clara.settle_autodraft_task(uuid,text,bigint,uuid,jsonb)','execute')
     or not pg_catalog.has_function_privilege('clara_runtime','clara.admit_autodraft_task(uuid,text,uuid,text,bigint)','execute')
     or not pg_catalog.has_function_privilege('clara_runtime','clara.list_autodraft_candidates()','execute') then
    raise exception '0036 acl: an autodraft runtime verb lost its clara_runtime grant';
  end if;

  -- (C) NO NEW TABLE GRANT: clara.autodraft_attempts stays invisible to the human and agent
  -- read roles, which is the reason section C rides the definer queue read at all.
  if pg_catalog.has_table_privilege('clara_authenticated','clara.autodraft_attempts','select')
     or pg_catalog.has_table_privilege('clara_agent_ro','clara.autodraft_attempts','select') then
    raise exception '0036 acl: clara.autodraft_attempts gained a SELECT grant -- section C was supposed to need none';
  end if;

  raise notice '0036 acl OK: no role gained access to the new helpers, all five recut surfaces (three rebuilt, two patched) kept their ACLs, and autodraft_attempts gained no table grant';

  -- =====================================================================
  -- LIVE-CORPUS PROBES — NOTICE ONLY, BY DESIGN. These answer, in the deploy log, the two
  -- preconditions the §A header hands to the orchestrator. A nonzero count is NOT a reason
  -- to abort installing the belt (an already-approved entry can never revisit this assert
  -- -- approval is one-way and the deferred trigger fires only on the draft->approved
  -- transition); it is a reason for the OWNER to be told that the live corpus already
  -- contains the shape the belt calls unacceptable. The cents read is wrapped in a CASE,
  -- not guarded by a sibling WHERE conjunct: PostgreSQL does not promise conjunct
  -- evaluation order (and a ::bigint cast is cheaper than a regex match, so the planner may
  -- well try the cast first), so a regex conjunct would provide NO ordering protection and a
  -- future producer writing a non-numeric tax fact could turn this diagnostic into a failed
  -- quiesced deploy. A CASE evaluates its condition before its branch, which is the property
  -- actually wanted. The predicate set also mirrors the belt EXACTLY — BOTH halves of the
  -- debit-side census included (at least one expense-typed debit leg, and NO non-expense
  -- debit leg) — so the count reported is the count that would now refuse: no more, no
  -- less. A probe that omitted the non-expense half would over-report by every mixed and
  -- every capitalised bill in the corpus, i.e. would warn the owner about shapes the belt
  -- deliberately carves out.
  -- =====================================================================
  select count(*)::int into v_live_approved
  from clara.journal_entries e
  where e.coding_kind='supplier_bill' and e.status='approved' and e.reversal_of is null
    and e.document_id is not null
    and (case when (clara._invoice_fact_state(e.document_id)->>'tax_total_cents') ~ '^-?[0-9]+$'
      then (clara._invoice_fact_state(e.document_id)->>'tax_total_cents')::bigint
      else 0 end) <> 0
    and not exists(select 1 from clara.journal_lines l
      join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
      where l.entry_id=e.id and coalesce(a.special_acc_type,'')='sst_purchase_cost')
    and exists(select 1 from clara.journal_lines l
      join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
      where l.entry_id=e.id and a.account_type='expense' and l.debit_cents>0)
    and not exists(select 1 from clara.journal_lines l
      join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
      where l.entry_id=e.id and a.account_type<>'expense' and l.debit_cents>0);
  select count(*)::int into v_live_draft
  from clara.journal_entries e
  where e.coding_kind='supplier_bill' and e.status='draft' and e.reversal_of is null
    and e.document_id is not null
    and (case when (clara._invoice_fact_state(e.document_id)->>'tax_total_cents') ~ '^-?[0-9]+$'
      then (clara._invoice_fact_state(e.document_id)->>'tax_total_cents')::bigint
      else 0 end) <> 0
    and not exists(select 1 from clara.journal_lines l
      join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
      where l.entry_id=e.id and coalesce(a.special_acc_type,'')='sst_purchase_cost')
    and exists(select 1 from clara.journal_lines l
      join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
      where l.entry_id=e.id and a.account_type='expense' and l.debit_cents>0)
    and not exists(select 1 from clara.journal_lines l
      join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
      where l.entry_id=e.id and a.account_type<>'expense' and l.debit_cents>0);
  if v_live_approved = 0 then
    raise notice '0036 probe (i): ZERO already-approved supplier bills sit in the shape section A now refuses -- the live corpus is clean, as expected (invoice.tax_total has had no nonzero occurrences)';
  else
    raise notice '0036 probe (i): WARNING -- % already-APPROVED supplier bill(s) state a nonzero tax with NO sst_purchase_cost leg. They are NOT retro-refused (approval is one-way), but the owner must be told the live corpus already contains the shape section A calls unacceptable', v_live_approved;
  end if;
  if v_live_draft = 0 then
    raise notice '0036 probe (ii): ZERO open drafts sit in the shape section A now refuses -- nobody gets surprised at their next approve';
  else
    raise notice '0036 probe (ii): WARNING -- % open DRAFT supplier bill(s) state a nonzero tax with NO sst_purchase_cost leg and will begin refusing CLR21/tax_leg_missing at approve from this deploy onward. The remedy is withdraw-and-redraft as the 3-leg split; tell the owner before they hit it', v_live_draft;
  end if;
end
$acl$;
