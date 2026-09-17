-- 0204_record_journal_entry_core_reversal_liveness — #787 (residual of #640; journeys B3, B6):
-- A PLAN-DRIVEN REVERSAL MAY NOT POST ONCE THE ACCRUAL IT NAMES HAS STOPPED BEING LIVE.
-- =====================================================================================
-- Spec of record: issue #787. Domain words: CONTEXT.md — "Accounting plan", "Occurrence",
-- "Reversal leg". Builds on 0178/0184 (the accounting-work lane and its posting core),
-- 0193 (the plan lane, its occurrences and `clara._plan_primary_entry`), 0194 (the third recut)
-- and 0195 (the FOURTH recut and the header convention this file follows).
--
-- WHAT THIS FILE ADDS, IN ONE SENTENCE. The FIFTH full copy of `clara._record_journal_entry_core`,
-- whose ONE addition re-asks 0193's own liveness question at the WRITE: a Work initiated by a
-- plan occurrence with `leg = 'reversal'` posts only while the entry that occurrence was admitted
-- to undo is STILL LIVE — otherwise it refuses, typed, and posts nothing.
--
-- =====================================================================================
-- THE DEFECT, MEASURED RATHER THAN FEARED.
--
-- #640's bounded closure re-check recorded this as an accepted RESIDUAL:
--
--   "Accrual posted → scan admits the reversal naming `551f7cfe…` → human
--    `clara.reverse_entry(accrual)` → nothing revokes it (work still `queued`, later scan changes
--    nothing) → posting the reversal SUCCEEDS (`c586fe2a…`). Ledger consequence: the accrual is
--    reversed twice — 6100 nets a 99000 credit and 1150 a 99000 debit that stand for nothing."
--   (docs/plan/active/refresh-wave-2026-09-14/reports/640-review-recheck.md)
--
-- 0193's own header names the window and says why that file could not close it: "closing it needs
-- a wall inside `clara._record_journal_entry_core`, a body 0193 may not recut (0194 and 0195 pin
-- it by sha256)". Both prerequisite migrations are now on main, so the pin chain moves
-- DELIBERATELY here: SECTION 0 pins the sha256 of the LIVE FOURTH recut (0195's own body) and
-- aborts with a typed exception on drift, and SECTION 1 carries that body forward WHOLE.
--
-- THE SAME DEFECT WAS REPRODUCED ON THE RIG BEFORE THIS FILE EXISTED:
-- `packages/db/tests/accounting-plan-occurrences.test.mjs` cell `p640.occ.reversal_post_liveness`
-- failed with "expected SQLSTATE CLR10 but the call SUCCEEDED (no error)".
--
-- =====================================================================================
-- THE FOUR PROPERTIES THE WALL HAS, AND WHERE EACH ONE IS SPELLED.
--
--   1. THE SAME LIVENESS PREDICATE THE ADMISSION WALL USES — `clara._plan_primary_entry`
--      (0193), approved AND not itself reversed, CALLED rather than re-spelled. A post-time check
--      on `reversed_by` alone would be weaker than the wall it re-asserts.
--   2. A REPLAY IS NOT A NEW POST. The arm sits under the same
--      `clara._work_committed_receipt(p_work) is null` condition every other refusal arm in this
--      body carries, so a run that committed and died still gets its STORED result back.
--   3. A TYPED REASON THAT LANDS TERMINAL WITH NO RUNTIME CUTOVER — CLR10
--      `reversal_before_primary`. The deployed repair router classifies an unrecognised CLR10
--      reason `refusal` (terminal, human-recoverable) and an unrecognised CLR13 reason
--      `state_changed` (another model turn against a wall it can never pass). NO frozen closure
--      is edited: `packages/runtime/tests/work-errors-plan-reversal.test.mjs` drives v1, v2 and
--      v3 with this file's exact error object and asserts both directions.
--   4. VOCABULARY CONSISTENT WITH THE ADMISSION SIDE. `reason = 'reversal_before_primary'` with
--      `primary_state = 'entry_not_live'` are 0193's own words for this exact fact.
--
-- WHAT THIS FILE DOES NOT DO, STATED. It does not revoke or cancel the already-admitted reversal
-- Work (the Work is not un-admitted; the phantom POST is what closes), it does not touch
-- `clara.reverse_entry` or any correction lane, it adds no column, constraint, FK or basis key,
-- and it closes no other occurrence leg and no other posting door.
--
-- =====================================================================================
-- A NOTE FOR THE NEXT RECUT, in 0194's and 0195's own words: the addition below is an INSERTION
-- POINT opened and closed by a `#787` comment, so a SIXTH copy can be derived by re-applying it
-- to a newer base rather than by reading two bodies side by side. The 0195 `#631` insertion, the
-- 0194 `#643` insertions and every 0178/0182/0184/0630/0634 arm are carried through VERBATIM;
-- the function keeps its identity exactly — same name, same arity, same owner (`clara_fn_owner`),
-- same `security definer` with the pinned `search_path = clara, pg_temp`, and the same privilege
-- posture (revoked from `public`, reachable only through the definer doors above it).
-- =====================================================================================

set local statement_timeout = '10min'; -- one CoR'd body, plus a prestate and a tail census.

-- =====================================================================================
-- SECTION 0 — PRESTATE. The body this file recuts is PINNED by prosrc sha256, read live off a
-- from-scratch 0001→0198 chain. A recut derived from a body that has since drifted would delete
-- an arm nobody re-derived.
-- =====================================================================================
do $w787_pre$
declare v_sha text; v_n int; v_acl text;
begin
  if not exists (select 1 from clara.schema_migrations
                  where version = '0195_work_egress_purpose_and_execution_trace') then
    raise exception '#787 prestate: 0195_work_egress_purpose_and_execution_trace is not applied -- frontier mismatch'
      using errcode='CLR10';
  end if;
  if not exists (select 1 from clara.schema_migrations where version = '0193_accounting_plans') then
    raise exception '#787 prestate: 0193_accounting_plans is not applied -- there is no plan lane to wall'
      using errcode='CLR10';
  end if;

  -- THE LIVENESS PREDICATE THIS FILE CALLS, and the relation it reads. Both are 0193's; neither
  -- is re-spelled here, so both must exist at the shape this recut expects.
  if to_regprocedure('clara._plan_primary_entry(uuid,date)') is null then
    raise exception '#787 prestate: clara._plan_primary_entry(uuid,date) does not resolve -- the wall would have to re-spell the liveness law'
      using errcode='CLR10';
  end if;
  if to_regclass('clara.accounting_plan_occurrences') is null then
    raise exception '#787 prestate: clara.accounting_plan_occurrences is absent' using errcode='CLR10';
  end if;
  select count(*)::int into v_n from information_schema.columns
   where table_schema='clara' and table_name='accounting_plan_occurrences'
     and column_name in ('leg','work_id','reverses_entry_id','period_key','plan_id','due_date');
  if v_n <> 6 then
    raise exception '#787 prestate: the occurrence columns this wall reads are not all present (% of 6)', v_n
      using errcode='CLR10';
  end if;
  -- ONE WORK IS INITIATED BY AT MOST ONE OCCURRENCE, and one (plan, leg, period) is one row.
  -- Both uniques are what make the two reads below single-valued rather than a `limit 1` guess.
  if not exists (select 1 from pg_constraint
                  where conrelid='clara.accounting_plan_occurrences'::regclass
                    and conname='uq_plan_occurrences_work' and contype='u') then
    raise exception '#787 prestate: unique (work_id) is absent -- "which occurrence initiated this Work" would not be single-valued'
      using errcode='CLR10';
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid='clara.accounting_plan_occurrences'::regclass
                    and conname='uq_plan_occurrences_period' and contype='u') then
    raise exception '#787 prestate: unique (plan_id, leg, period_key) is absent -- the accrual behind a reversal would not be single-valued'
      using errcode='CLR10';
  end if;

  -- THE BODY THIS FILE RECUTS, at its live 0195 text. THE PIN MOVES DELIBERATELY: 0195 pinned
  -- 0194's body, and this file pins 0195's OWN.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara._record_journal_entry_core(uuid,uuid,text,uuid,uuid,text,jsonb,text,text,text)'::regprocedure;
  if v_sha is distinct from 'f9c4f5258fdd45c115871c67bfb3af9b91a587ff9f723d340b583e052defa4fb' then
    raise exception '#787 prestate: clara._record_journal_entry_core has DRIFTED from the pinned 0195 body (sha %) -- re-derive the fifth recut against the live body before applying',
      coalesce(v_sha,'<absent>') using errcode='CLR10';
  end if;

  -- AND ITS IDENTITY, which SECTION 1 must leave exactly where it found it.
  select p.proowner::regrole::text into v_acl from pg_proc p
   where p.oid='clara._record_journal_entry_core(uuid,uuid,text,uuid,uuid,text,jsonb,text,text,text)'::regprocedure;
  if v_acl <> 'clara_fn_owner' then
    raise exception '#787 prestate: the posting core is owned by % rather than clara_fn_owner', v_acl
      using errcode='CLR10';
  end if;
  raise notice '#787 prestate: OK -- the fourth recut is at its pinned body and the plan lane is present.';
end
$w787_pre$;

-- =====================================================================================
-- SECTION 1 — clara._record_journal_entry_core, RECUT (the FIFTH full copy). Full 0195 body; the
-- ONE addition is marked `#787` and every pre-existing arm is carried through verbatim.
--
-- WHERE THE NEW ARM SITS: immediately after 0195's `#631` egress gate and BEFORE
-- `clara._reserve_op`, guarded by the same `clara._work_committed_receipt(p_work) is null`
-- condition 0184's cancel arms and 0195's gate carry. The placement is measured rather than
-- chosen: above it, every earlier arm keeps its own diagnosis (`work_cancelled`,
-- `client_inactive`, `obo_not_active`, `egress_not_authorized`); below it, the reservation would
-- have spent the logical identity a refusal must leave free.
-- =====================================================================================
set role clara_fn_owner;

create or replace function clara._record_journal_entry_core(p_firm uuid, p_obo uuid, p_wake_kind text,
    p_client uuid, p_work uuid, p_logical_op_id text, p_basis jsonb, p_bundle_digest text,
    p_run_id text, p_rationale text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  w record; v_role text; v_member_status text; v_client_status text;
  v_canon jsonb; v_digest text; v_payload bytea; v_prior_hash bytea; v_dedupe jsonb;
  v_bad_code text; v_bad_idx int; v_lines jsonb;
  v_entry uuid; v_token uuid; v_receipt uuid; v_task uuid; v_result jsonb;
  v_source_document uuid; v_posted_entry uuid; v_effects jsonb;   -- #634
  v_task_status text;                                             -- #630
  v_adj_canon jsonb; v_flags jsonb; v_adjustment uuid; v_corrects uuid;   -- #643
  v_rev_occ uuid; v_rev_plan uuid; v_rev_period date; v_rev_entry uuid;   -- #787
  v_rev_primary_due date;                                                 -- #787
begin
  -- 1 · THE WORK, inside this firm AND this client. A Work that is not this credential's is
  -- not-found, never a different error: the credential must not become an existence oracle.
  --
  -- #630 · AND IT IS LOCKED. `for update` here IS the ordering boundary between admitting this
  -- operation and cancelling the Work that authorised it (see 0184's header). A cancel that
  -- arrives from here on waits until this transaction commits or rolls back, and then reads the
  -- truth rather than racing it.
  --
  -- #643 · THE PURPOSE FILTER WIDENS. It was `= 'journal_entry'`; the three values are the
  -- column's own CHECK, restated so a purpose this core cannot post is a not-found rather than a
  -- surprise further down.
  select * into w from clara.accounting_work aw
   where aw.id = p_work and aw.firm_id = p_firm and aw.client_id = p_client
     and aw.purpose in ('journal_entry','periodic_stock_adjustment','payroll_obligation')
   for update;
  if not found then
    raise exception 'accounting work not found for this client' using errcode='CLR11',
      detail='{"reason":"work_not_found"}';
  end if;

  -- 1b · #630 · THE OTHER SIDE OF THE BOUNDARY. The lock above is only half the contract: holding
  -- it proves nobody is cancelling RIGHT NOW, and these arms ask whether somebody already did.
  -- They sit BEFORE clara._reserve_op deliberately, so a refused operation leaves the logical
  -- identity unspent and a later Retry (or a takeover) can still use it.
  --
  -- A REPLAY IS NOT AN ADMISSION, AND THIS GUARD IS WHY THE WHOLE BLOCK IS CONDITIONAL. Measured on
  -- the rig (tests/work-cancel-e2e.mjs leg 4, first cut): a run that COMMITTED and then died before
  -- checkpointing re-executes its step on respawn, reaches this core again, and found the Work
  -- `completed` -- which an unconditional `work_settled` arm refused, breaking the one idempotency
  -- guarantee 0178 was built for. The effect is already on the books; returning it changes nothing
  -- and admits nothing, so a Work that HOLDS a committed receipt falls straight through to the
  -- reservation below, which answers with the stored result and `replayed:true`.
  --
  -- CLR13 is the estate's "the state is not the one this act needs" -- the same code
  -- clara.retry_accounting_work raises for `not_retryable` and 0182 raises for `source_conflict`.
  if clara._work_committed_receipt(p_work) is null then
    if w.status in ('stopping','cancelled') then
      raise exception 'this accounting work was cancelled; no operation is admitted'
        using errcode='CLR13',
          detail=jsonb_build_object('reason','work_cancelled', 'status', w.status,
            'cancelled_by', (select t.cancelled_by from clara.agent_tasks t where t.id = w.current_task_id),
            'cancelled_at', (select t.cancelled_at from clara.agent_tasks t where t.id = w.current_task_id))::text;
    end if;
    if w.status in ('completed','refused','failed','expired') then
      raise exception 'this accounting work already settled; no operation is admitted'
        using errcode='CLR13',
          detail=jsonb_build_object('reason','work_settled', 'status', w.status)::text;
    end if;
    -- …and the RUN's own abort request, which reaches the Work through the status mirror but may be
    -- read here first by a transaction that started before the mirror's update became visible.
    select t.status into v_task_status from clara.agent_tasks t where t.id = w.current_task_id;
    if v_task_status = 'cancel_requested' then
      raise exception 'this accounting work was cancelled; no operation is admitted'
        using errcode='CLR13',
          detail=jsonb_build_object('reason','work_cancelled', 'status', w.status,
            'task_status', v_task_status,
            'cancelled_by', (select t.cancelled_by from clara.agent_tasks t where t.id = w.current_task_id),
            'cancelled_at', (select t.cancelled_at from clara.agent_tasks t where t.id = w.current_task_id))::text;
    end if;
  end if;

  if w.logical_op_id is distinct from p_logical_op_id then
    raise exception 'this operation identity does not belong to that accounting work'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','logical_op_mismatch',
          'expected', w.logical_op_id, 'logical_op_id', p_logical_op_id)::text;
  end if;

  -- 2 · THE HUMAN'S LIVE AUTHORITY, reread AT COMMIT and never taken from the admission
  -- snapshot. (clara.wake_context()'s own liveness predicate already refuses a credential whose
  -- on_behalf_of stopped being an active bookkeeper+, so in the deployed lane that door answers
  -- first; these two arms are the belt behind it, and they are what makes this core safe for any
  -- future caller whose credential resolution is looser.)
  --
  -- #630 · AND THE READ IS SERIALISED WITH REVOCATION, not merely fresh. `for share` on the
  -- membership row is the second half of the boundary 0184 is about: without it a revocation
  -- can commit in the window between this SELECT and the INSERT below, and the entry posts under an
  -- authority that no longer existed when the books moved -- which is exactly what C79.2
  -- ("revocation wins before a later commit") forbids. The estate's revocation writers all UPDATE
  -- this row (`clara.remove_member` / `clara.set_member_role`, 0157:331/405), and an UPDATE
  -- conflicts with FOR SHARE, so the two orders are now decided rather than raced: a revocation
  -- that arrives first makes this read see it, and one that arrives second waits for this
  -- transaction and then applies to a world where the entry is already posted (and cannot erase
  -- it -- spec §5).
  -- …AND THE FIRM ROW IS TAKEN FIRST, because the revocation writers take it first. MEASURED on
  -- the rig (work-cancel.test.mjs wc.34, first cut): `clara.set_member_role` (0157) opens with
  -- `perform 1 from clara.firms where id = c.firm for update` and only then UPDATEs the
  -- membership, while this core took the membership FOR SHARE and reached `clara.firms` LATER —
  -- through the FK key-share every `operation_receipts`/`journal_entries` insert takes. Two
  -- transactions, two orders, one cycle: PostgreSQL broke it with 40P01, and a serialization
  -- failure on a posting is precisely the answer #630 exists to make impossible. `for key share`
  -- is the weakest lock that queues behind the revocation's `for update` (and it is the same mode
  -- the FK checks below need, so it is taken once rather than twice); two postings never block
  -- each other on it.
  perform 1 from clara.firms f where f.id = p_firm for key share;
  select m.role, m.status into v_role, v_member_status from clara.firm_memberships m
   where m.user_id = p_obo and m.firm_id = p_firm
   order by (m.status = 'active') desc, m.created_at desc limit 1
   for share;
  if v_role is null or v_member_status <> 'active' then
    raise exception 'the initiating member is no longer active in this firm' using errcode='CLR04',
      detail='{"reason":"obo_not_active"}';
  end if;
  if clara.role_rank(v_role) < clara.role_rank('bookkeeper') then
    raise exception 'the initiating member no longer holds the bookkeeper floor'
      using errcode='CLR04', detail='{"reason":"insufficient_role"}';
  end if;
  -- 2b · THE HUMAN IS THE WORK'S OWN RESPONSIBLE HUMAN, not merely SOME live bookkeeper of the
  -- firm. Reviewed finding (#623): the two arms above ask whether `p_obo` still holds authority,
  -- and the wrapper asks whether the credential is pinned to this client -- neither asks whether
  -- this is the human who ASKED for the entry. So an `interactive_client` credential minted OBO any
  -- other active bookkeeper of the firm could commit this Work, and the receipt's `on_behalf_of` --
  -- the estate's record of WHOSE AUTHORITY was rechecked -- would attribute the posting to a human
  -- who never authorised it. This is an authority check, not an input check: CLR04.
  --
  -- #630 · AND `initiator` NOW MEANS "the human this Work is executed as" (0184 §A), so after a
  -- takeover this arm binds the COLLEAGUE and refuses the person who admitted it -- which is exactly
  -- right, because they are the one who lost authority. The reason token is deliberately unchanged:
  -- `obo_not_initiator` is in the DEPLOY-LOCKED claraWork.v1.errors.ts roster and renaming it would
  -- make a run classify its own refusal as an unmapped fault.
  if p_obo is distinct from w.initiator then
    raise exception 'this operation is bound to the human who admitted it; the credential names another'
      using errcode='CLR04', detail='{"reason":"obo_not_initiator"}';
  end if;

  -- 3 · THE CLIENT, now.
  select c.status into v_client_status from clara.clients c
   where c.id = p_client and c.firm_id = p_firm;
  if v_client_status is distinct from 'active' then
    raise exception 'client is not active -- no posting' using errcode='CLR10',
      detail='{"reason":"client_inactive"}';
  end if;

  -- ---- #631 INSERTION · MODEL EGRESS AUTHORISATION, VERIFIED AGAIN AT THE WRITE -------------
  -- AC2's second half, and it is a SEPARATE question from the role, the client and the period
  -- arms around it: those ask whether this HUMAN may post, and this asks whether the MODEL that
  -- produced the posting was authorised to see the client's books at all. The run consumed an
  -- authorization immediately before it called the model (`claraWork_v3`); this is the
  -- independent re-read of that fact at the moment the books actually move.
  --
  -- WHERE IT SITS, AND WHY EXACTLY HERE. AFTER the cancel arms, the identity arm, the human's
  -- live authority and the client's status, so every one of those keeps its own diagnosis: a
  -- cancelled Work still answers `work_cancelled`, an archived client still answers
  -- `client_inactive`, and a lost membership still answers `obo_not_active` (measured on the rig
  -- -- an earlier cut placed this arm at 1b and stole `client_inactive` from
  -- work-journal-post.test.mjs's own cell). BEFORE `clara._reserve_op`, so a refusal leaves the
  -- logical identity UNSPENT and a human's Retry can still use it.
  --
  -- SKIPPED FOR A COMMITTED REPLAY, for the reason 0184's cancel arms are conditional: a run that
  -- COMMITTED and then died before checkpointing re-executes its step and must get its ORIGINAL
  -- receipt back. An unconditional gate would refuse that replay the moment the authorization had
  -- been invalidated in between, turning a committed effect into an unreadable one.
  --
  -- BOUND TO THIS RUN, not merely to this client. `clara._work_egress_event_seq(work, run)` is
  -- re-derived here from two values this core already holds, so a sibling run's spent
  -- authorization does not satisfy this one and a forged event seq would have to agree with a
  -- hash the database computes twice.
  --
  -- CONSUMED AND NOT INVALIDATED. A PREPARED authorization is a plan, not a dispatch; an
  -- invalidated one is a withdrawal that landed in the window. Neither is authority.
  --
  -- AND THE AUTHORITY BEHIND IT MUST STILL BE LIVE AT THIS INSTANT. The two joins below are the
  -- retroactive half of a withdrawal, and they are this file's answer to "is a revoke retroactive
  -- to an already-consumed dispatch?" — YES (see the header's own statement of the rule). The
  -- first cut checked only the authorization row, and 0020's
  -- `ck_egress_dispatch_authorizations_one_terminal` forbids a CONSUMED row from also being
  -- INVALIDATED, so an owner's withdrawal could not reach it and consume -> revoke -> post
  -- succeeded (measured by the review). Reading the consent and the activation HERE costs two
  -- index lookups in the posting path and makes "authority must be live when the books move"
  -- true without recutting a relation four other purposes share.
  --
  -- AND A RUN CLAIMED UNDER A PRE-v3 BUNDLE IS GRANDFATHERED PAST ALL OF IT. THE RULING, and it
  -- is stated verbatim in this file's header with the measurement and the two options it beat:
  --
  --   A Work whose run was claimed under a PRE-v3 bundle (`accounting_work.bundle->>'id'` is
  --   `clara-work/v1` or `clara-work/v2` — the FROZEN manifest `clara.claim_work_run` stamped on
  --   the Work row at claim) is GRANDFATHERED: this core does not require a consumed
  --   `accounting_work` authorization for it. The wall applies in full from the v3 bundle id on.
  --
  -- WHY A RUN CAN NEED IT. `clara.prepare_work_egress_dispatch` / `clara.consume_egress_dispatch`
  -- are called from ONE non-test site in the repository — `claraWork.v3.impl.ts:280,291` — and
  -- v1 and v2 are FROZEN bodies that can never gain the call. Without this conjunct every Work
  -- already parked on `claraWork_v1`/`claraWork_v2` when 0195 applies is unpostable forever: it
  -- resumes into its own body inside the new image and dies HERE, at the write, after the model
  -- call it was refused authority for has already happened. #637's two-build drill measured
  -- exactly that at v2->v3 (task `failed`/`internal`, zero receipts, zero trace rows).
  --
  -- THE ID IS THE WORK ROW'S OWN, NEVER A PARAMETER. `w.bundle` was written by
  -- `clara.claim_work_run` (0178) from the body's own frozen manifest at claim time and
  -- `clara.accounting_work` is immutable by trigger thereafter, so a run cannot nominate itself
  -- into the grandfathered set: the posting caller supplies `p_bundle_digest`, and this arm does
  -- not read it.
  --
  -- FAIL-CLOSED, AND THE SET IS CLOSED AT TWO. `coalesce(...,'')` makes a Work with NO bundle
  -- stamp (never claimed) WALLED rather than exempt, an unknown id is walled, and the v3 id and
  -- every successor are walled. The tail census re-reads this body and refuses a THIRD
  -- `clara-work/vN` literal ANYWHERE in it -- which is why this comment names v3 by version
  -- rather than by id.
  if clara._work_committed_receipt(p_work) is null
     and coalesce(w.bundle->>'id','') <> all (array['clara-work/v1','clara-work/v2'])
     and not exists (
    select 1 from clara.egress_dispatch_authorizations ea
      join clara.client_egress_purpose_consents cc
        on cc.id = ea.consent_id and cc.firm_id = ea.firm_id and cc.client_id = ea.client_id
          and cc.purpose = ea.purpose
      join clara.client_egress_purpose_activations ca
        on ca.id = ea.activation_id and ca.firm_id = ea.firm_id and ca.client_id = ea.client_id
          and ca.purpose = ea.purpose
     where ea.firm_id = p_firm and ea.client_id = p_client
       and ea.purpose = 'accounting_work'
       and ea.event_type = 'work.segment'
       and ea.event_seq = clara._work_egress_event_seq(p_work, p_run_id)
       and ea.consumed_at is not null and ea.invalidated_at is null
       and cc.revoked_at is null and ca.deactivated_at is null) then
    raise exception 'this run holds no consumed model-egress authorisation for this client'
      using errcode='CLR13', detail='{"reason":"egress_not_authorized"}';
  end if;
  -- ---- #631 INSERTION ends -----------------------------------------------------------------

  -- ---- #787 INSERTION · A PLAN'S REVERSAL MAY NOT POST ONCE ITS ACCRUAL STOPPED BEING LIVE ---
  -- THE RESIDUAL #640 MEASURED, ACCEPTED AND FILED, CLOSED HERE. 0193's admission wall reads the
  -- accrual's liveness ONCE, when the reversal occurrence is admitted, and NOTHING read it again
  -- before the books moved. So: the accrual posts; the scan admits its reversal and writes that
  -- entry id onto `accounting_plan_occurrences.reverses_entry_id`; a human calls
  -- `clara.reverse_entry` on the accrual (a legitimate correction); nothing revokes the
  -- already-admitted reversal Work -- and its post SUCCEEDED, putting a SECOND reversal of one
  -- accrual on the books. Measured by the #640 re-check
  -- (docs/plan/active/refresh-wave-2026-09-14/reports/640-review-recheck.md) and reproduced RED
  -- by `p640.occ.reversal_post_liveness` before this file existed.
  --
  -- THE PREDICATE IS 0193'S OWN, CALLED RATHER THAN RE-SPELLED. `clara._plan_primary_entry` is
  -- what the scan and the catch-up door ask, and it answers with the accrual's entry only while
  -- that entry is APPROVED and NOT ITSELF REVERSED. A post-time check on `reversed_by` alone
  -- would be a WEAKER wall than the one this arm exists to re-assert, and two spellings of one
  -- law drift. The occurrence is single-valued for a Work (`uq_plan_occurrences_work`), its
  -- period key is its ACCRUAL's (0193's header), and `unique (plan_id, leg, period_key)` makes
  -- the accrual occurrence behind it exactly one row -- so the primary due date is READ FROM
  -- STORAGE rather than re-derived from schedule arithmetic a later revision may legitimately
  -- move.
  --
  -- IT FAILS CLOSED. A reversal occurrence whose accrual occurrence is no longer there at all is
  -- refused by the same arm: the ground the admission stood on is gone, and posting into that is
  -- exactly the phantom this closes.
  --
  -- NON-REVERSAL POSTINGS ARE UNTOUCHED. The whole arm is inside "this Work was initiated by a
  -- plan occurrence whose leg is `reversal`"; a Work no occurrence names reads one indexed row
  -- and falls straight through.
  --
  -- SKIPPED FOR A COMMITTED REPLAY, exactly as 0184's cancel arms and 0195's egress gate are: a
  -- run that COMMITTED and then died before checkpointing re-executes its step, reaches this core
  -- again, and must be answered with its STORED result rather than refused. An unconditional wall
  -- here would turn a committed effect into an unreadable one the moment a human reversed the
  -- accrual afterwards -- breaking the one idempotency guarantee 0178 was built for.
  --
  -- WHERE IT SITS: after 0195's egress gate and BEFORE `clara._reserve_op`, so every arm above
  -- keeps its own diagnosis and a refusal leaves the logical identity UNSPENT -- a human's Retry,
  -- or a re-admission behind a live accrual, can still use it.
  --
  -- THE TYPING IS CLR10, AND IT IS NOT FREE (#787's own "out of scope": no frozen closure may be
  -- edited to classify this). The deployed repair router is keyed on `(errcode, detail.reason)`:
  -- an unrecognised CLR13 reason falls to `state_changed`, which hands the model another turn and
  -- burns the run's replan budget against a wall it can never pass (`budget_exhausted -> failed`),
  -- while an unrecognised CLR10 reason falls to `refusal` -- TERMINAL for the loop, settling the
  -- Work `refused` with the database's own typed reason and leaving a human a readable Retry.
  -- Read back from the router itself by
  -- `packages/runtime/tests/work-errors-plan-reversal.test.mjs`.
  --
  -- AND THE WORDS ARE THE ADMISSION SIDE'S. The plan lane already names this exact fact when it
  -- refuses at admission: reason `reversal_before_primary`, `primary_state` `entry_not_live`
  -- (0193's own `clara._plan_admit_occurrence`). One fact, one name.
  if clara._work_committed_receipt(p_work) is null then
    select o.id, o.plan_id, o.period_key, o.reverses_entry_id
      into v_rev_occ, v_rev_plan, v_rev_period, v_rev_entry
      from clara.accounting_plan_occurrences o
     where o.work_id = p_work and o.leg = 'reversal';
    if v_rev_occ is not null then
      select o2.due_date into v_rev_primary_due
        from clara.accounting_plan_occurrences o2
       where o2.plan_id = v_rev_plan and o2.leg = 'primary' and o2.period_key = v_rev_period;
      if v_rev_primary_due is null
         or clara._plan_primary_entry(v_rev_plan, v_rev_primary_due) is distinct from v_rev_entry then
        raise exception 'the accrual this plan reversal was admitted to undo is no longer a live entry'
          using errcode='CLR10',
            detail=jsonb_build_object('reason','reversal_before_primary',
              'primary_state','entry_not_live', 'entry_id', v_rev_entry,
              'occurrence_id', v_rev_occ)::text;
      end if;
    end if;
  end if;
  -- ---- #787 INSERTION ends ------------------------------------------------------------------

  -- 4 · THE BASIS'S SHAPE, then its CANONICAL FORM — and everything below reads the canonical
  -- form, never the raw echo. THE POSTED ENTRY MUST BE THE THING THE DIGEST DESCRIBES: the
  -- runtime echoes the basis back out of its own object graph, so the text that arrives can
  -- differ in key order, in padding around an account code, in the case of the currency. The
  -- digest already forgives exactly those differences, so if the WRITE read the raw echo instead,
  -- a padded account code would satisfy the digest and then land in clara.journal_lines with its
  -- padding — a stored line disagreeing with the identity that authorised it.
  perform clara._assert_journal_basis(p_basis);
  v_canon := clara._journal_basis_canonical(p_basis);

  -- ---- #643 INSERTION 1 · THE TYPED PARTICULARS' SHAPE, from the WORK ROW ----------------
  -- Read from `w.adjustment_basis`, never from an argument: the particulars are frozen at
  -- admission and the run has no way to name them. Asserted again here rather than trusted
  -- because this core is the last door before the books move, and 0178 §D's rule — admission and
  -- commit share one definition of well-formed — applies to the particulars exactly as it does to
  -- the basis. BEFORE `clara._reserve_op`, so a malformed set leaves the identity unspent.
  perform clara._assert_adjustment_basis(w.purpose, w.adjustment_basis);
  v_adj_canon := clara._adjustment_basis_canonical(w.purpose, w.adjustment_basis);
  -- ---- #643 INSERTION 1 ends -------------------------------------------------------------

  -- 5 · IDEMPOTENCY, TYPED -- AND IT COMES BEFORE THE ADMITTED-BASIS COMPARISON.
  -- Order is behaviour here, not taste. With the comparison first, a SECOND call under an
  -- identity that already committed would answer `basis_mismatch` -- true, but the wrong
  -- diagnosis: the operative fact is that this identity ALREADY RECORDED a different payload,
  -- which is a conflict the runtime settles the Work `refused` on, not an input error it may
  -- hand back to the model. Reserving first makes the two distinguishable and BOTH reachable.
  --
  -- #643 · THE PAYLOAD GAINS THE PARTICULARS, AND ONLY FOR THE NEW PURPOSES. A journal entry's
  -- payload bytes are the 0178 shape verbatim, so every reservation and every `clara.op_receipts`
  -- row already in the estate still hashes to what it hashed to. A periodic adjustment's payload
  -- describes the WHOLE operation, because its identity is the lines AND the particulars.
  if w.adjustment_basis is null then
    v_payload := clara._hash(jsonb_build_object('client', p_client, 'basis', v_canon));
  else
    v_payload := clara._hash(jsonb_build_object('client', p_client, 'basis', v_canon,
      'adjustment', v_adj_canon));
  end if;
  select r.request_hash into v_prior_hash from clara.op_receipts r
   where r.firm_id = p_firm and r.fn = 'record_journal_entry' and r.op_key = p_logical_op_id;
  if found and v_prior_hash is distinct from v_payload then
    raise exception 'this operation identity already recorded a different journal basis'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','operation_payload_conflict',
          'logical_op_id', p_logical_op_id)::text;
  end if;
  begin
    v_dedupe := clara._reserve_op(p_firm, 'record_journal_entry', p_logical_op_id, v_payload);
  exception when sqlstate 'CLR10' then
    raise exception 'this operation identity already recorded a different journal basis'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','operation_payload_conflict',
          'logical_op_id', p_logical_op_id)::text;
  end;
  if v_dedupe is not null then
    if v_dedupe ? 'pending' then
      raise exception 'this operation identity is held by an in-flight sibling'
        using errcode='CLR13', detail='{"reason":"operation_in_flight"}';
    end if;
    return v_dedupe || '{"replayed":true}'::jsonb;
  end if;

  -- 5b · THE BASIS IS THE ADMITTED BASIS. A run may echo the basis back, never author a new
  -- one: the digest is recomputed here from the ECHO and compared with the one admission stored.
  v_digest := encode(clara._hash(v_canon), 'hex');   -- identical to clara._journal_basis_digest
  if v_digest is distinct from w.basis_digest then
    raise exception 'the posted basis is not the admitted basis for this work'
      using errcode='CLR10', detail='{"reason":"basis_mismatch"}';
  end if;

  -- ---- #643 INSERTION 2 · THE LINES SAY WHAT THE PARTICULARS SAY --------------------------
  -- C-29's rung, and the reason a periodic adjustment cannot be an anonymous balancing journal.
  -- Immediately after the echo wall above, so a drifted echo is still diagnosed `basis_mismatch`
  -- (see this section's header).
  perform clara._assert_adjustment_relationships(p_client, w.purpose, w.adjustment_basis,
    v_canon -> 'lines', false);
  -- ---- #643 INSERTION 2 ends -------------------------------------------------------------

  -- 6 · THE CHART, AT COMMIT. Absent and INACTIVE answer the same way on purpose: neither is a
  -- postable account, and telling them apart would say whether a code the caller guessed once
  -- existed.
  select l.code, l.idx into v_bad_code, v_bad_idx from (
    select x.elem->>'account_code' as code, x.idx::int as idx
      from jsonb_array_elements(v_canon->'lines') with ordinality as x(elem, idx)) l
   where not exists (select 1 from clara.coa_accounts a
                      where a.client_id = p_client and a.account_code = l.code and a.is_active)
   order by l.idx limit 1;
  if v_bad_code is not null then
    raise exception 'line % codes to an account this client does not have active: %', v_bad_idx, v_bad_code
      using errcode='CLR10', detail=jsonb_build_object('reason','unknown_account',
        'field', 'lines[' || v_bad_idx || '].account_code', 'account_code', v_bad_code)::text;
  end if;

  -- 7 · THE CONTROL-LEG RULE. B14's ground, restated by value because the rung is an inline query
  -- inside clara._agent_post_entry_core with no extractable predicate: an open item is a claim
  -- about who owes what, a documentless generic basis is the weakest anchor in the estate, and a
  -- weak anchor may not corroborate a subledger consequence.
  --
  -- #643 · UNCHANGED, AND IT STILL BITES THE NEW PURPOSES. The CHECK on
  -- `clara.coa_accounts.account_class` admits only 'payable'/'receivable'/null (0015:199-200), so
  -- an inventory account, a statutory payable and a staff-advance account are NOT control legs by
  -- this rule and pass through — which is correct: a periodic adjustment carries typed
  -- particulars and a named producer, so it is not the weak anchor this arm exists to refuse. An
  -- adjustment that DID name a trade-payable leg is refused here exactly as a journal entry is.
  select a.account_code into v_bad_code from clara.coa_accounts a
   where a.client_id = p_client and a.account_class in ('payable','receivable')
     and a.account_code in (select x.elem->>'account_code'
                              from jsonb_array_elements(v_canon->'lines') as x(elem))
   order by a.account_code limit 1;
  if v_bad_code is not null then
    raise exception 'a generic journal entry may not carry the control-account leg %', v_bad_code
      using errcode='CLR10', detail=jsonb_build_object('reason','generic_control_leg',
        'account_code', v_bad_code)::text;
  end if;

  -- 7b · #634 · THE EVIDENCE, AT COMMIT. Admission checked the document; seconds or minutes pass
  -- before a run reaches this line, and in that window the filing can be retired, the document
  -- can be re-filed to another client, or a SECOND Work can post against it. The commit therefore
  -- re-reads it from the WORK'S OWN admitted refs (never from the echo) and refuses by name.
  --
  -- IT SITS AFTER THE RESERVATION ON PURPOSE. A replay of an identity that already committed
  -- returns its stored receipt at step 5 and never reaches here.
  v_source_document := clara._journal_source_document(w.source_refs);
  if v_source_document is not null then
    if not clara._journal_document_filed(p_firm, p_client, v_source_document) then
      raise exception 'the document this work cites is no longer an active verified filing of this client'
        using errcode='CLR13', detail=jsonb_build_object('reason','source_conflict',
          'document_id', v_source_document, 'constraint','not_filed')::text;
    end if;
    v_posted_entry := clara._document_posting_entry(p_client, v_source_document);
    if v_posted_entry is not null then
      raise exception 'that document already backs a posted journal entry'
        using errcode='CLR13', detail=jsonb_build_object('reason','source_conflict',
          'document_id', v_source_document, 'entry_id', v_posted_entry,
          'constraint','already_posted', 'conflict', true)::text;
    end if;
  end if;

  -- ---- #643 INSERTION 3 · THE PARTICULARS' WORLD, RE-READ AT COMMIT -----------------------
  -- The same shape 7b has, for the same reason: an account retired, a staff-advance enrolment
  -- withdrawn, a fiscal year sealed or the correction target corrected by somebody else between
  -- admission and this line are all facts about the world, and the run must not post through
  -- them. AFTER the reservation, so a replay of a committed identity never re-runs it.
  perform clara._assert_adjustment_relationships(p_client, w.purpose, w.adjustment_basis,
    v_canon -> 'lines', true);
  -- ---- #643 INSERTION 3 ends -------------------------------------------------------------

  -- 8 · THE RUN THIS RECEIPT BELONGS TO. `clara._wake_task_id()` is the credential-bound answer
  -- and is preferred wherever it exists; the `interactive_client` mint (0133) binds NO task, so
  -- the fallback is the Work's OWN current run. Both are SERVER-DERIVED: this core never accepts
  -- a caller-supplied task id.
  v_task := coalesce(clara._wake_task_id(), w.current_task_id);
  if v_task is null then
    raise exception 'this operation has no run to attribute its receipt to' using errcode='CLR03',
      detail='{"reason":"wake_task_unbound"}';
  end if;

  -- 9 · THE EFFECT. DRAFT THEN APPROVE, deliberately: `t_je_agent_post_receipt` is an AFTER
  -- UPDATE trigger, so a single approved INSERT would slip past the one wall that makes the
  -- receipt structural. #634: the entry's own `document_id` stays NULL even when this Work cites
  -- a document.
  --
  -- ---- #643 INSERTION 4 · THE MARKER, ON THE DRAFT INSERT ---------------------------------
  -- `flags` is written HERE and nowhere else, because `clara._tf_entry_immutable`'s
  -- approved→approved allowset is {reversed_by, reversal_reason, updated_at}: a flag added after
  -- approval would be refused, and the draft→approved UPDATE below may not carry it either. The
  -- key is the ONE the close gate has always read (`closing_stock`), and its payload is the
  -- adjustment's own period so a reader of the entry can see what the marker claims without
  -- joining anything. A payroll obligation carries `payroll_obligation` on the same footing: no
  -- gate reads it today, and an entry that moved a statutory liability should say so on its face.
  v_flags := case
    when w.purpose = 'periodic_stock_adjustment' then jsonb_build_object('closing_stock',
      jsonb_build_object('period_start', w.adjustment_basis->>'period_start',
        'period_end', w.adjustment_basis->>'period_end',
        'method', w.adjustment_basis->>'method'))
    when w.purpose = 'payroll_obligation' then jsonb_build_object('payroll_obligation',
      jsonb_build_object('period_start', w.adjustment_basis->>'period_start',
        'period_end', w.adjustment_basis->>'period_end',
        'obligation_kind', w.adjustment_basis->>'obligation_kind'))
    else '{}'::jsonb end;
  -- ---- #643 INSERTION 4 ends -------------------------------------------------------------
  v_lines := clara._validate_entry_lines(p_client, v_canon->'lines');
  insert into clara.journal_entries(client_id, status, posting_date, memo, origin, maker_actor,
      flags)
    values (p_client, 'draft', (v_canon->>'posting_date')::date, v_canon->>'memo',
      'agent', clara.agent_user_id(), v_flags)
    returning id into v_entry;
  insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents, credit_cents,
      description)
    select v_entry, x.idx, x.elem->>'account_code',
      (x.elem->>'debit_cents')::bigint, (x.elem->>'credit_cents')::bigint,
      x.elem->>'description'
    from jsonb_array_elements(v_lines) with ordinality as x(elem, idx);
  perform clara._assert_balanced(v_entry);
  update clara.journal_entries
     set status = 'approved', checker_actor = clara.agent_user_id(), approved_at = now(),
         updated_at = now()
   where id = v_entry;
  select je.revision_token into v_token from clara.journal_entries je where je.id = v_entry;

  -- #634 · the receipt NAMES ITS EVIDENCE. `entry_id` is still the effect the outcome-shape
  -- CHECK and the widened post-receipt wall read; `document_id` is added only when there is one.
  v_effects := jsonb_build_object('entry_id', v_entry, 'revision_token', v_token);
  if v_source_document is not null then
    v_effects := v_effects || jsonb_build_object('document_id', v_source_document);
  end if;
  -- #643 · …AND ITS ADJUSTMENT. The id is MINTED HERE rather than taken from the insert below,
  -- for the same reason `admit_journal_work` mints the Work id itself: `clara.operation_receipts`
  -- is append-only, the adjustment row's FK points AT the receipt, and a receipt whose `effects`
  -- named nothing until a follow-up UPDATE would be a receipt that could never name it at all.
  if w.adjustment_basis is not null then
    v_adjustment := gen_random_uuid();
    v_effects := v_effects || jsonb_build_object('adjustment_id', v_adjustment);
  end if;
  insert into clara.operation_receipts(firm_id, client_id, work_id, purpose, logical_op_id,
      payload_digest, acting_actor, on_behalf_of, via_wake_kind, bundle_digest, run_id, task_id,
      outcome, effects)
    -- #643 · the receipt's purpose IS the Work's purpose. It was the literal 'journal_entry'.
    values (p_firm, p_client, p_work, w.purpose, p_logical_op_id, encode(v_payload,'hex'),
      clara.agent_user_id(), p_obo, p_wake_kind, p_bundle_digest, p_run_id, v_task,
      'committed', v_effects)
    returning id into v_receipt;

  -- #634 · THE EVIDENCE LINK, born inside the posting transaction and naming its receipt. The
  -- SAME relation and the SAME shape the late door writes. THE INDEX'S OWN REFUSAL WEARS THE SAME
  -- NAME: a CONCURRENT sibling can post between 7b's read and this write, and then
  -- `uq_entry_evidence_links_document` is what stops the second row. Uncaught, that escaped as a
  -- raw 23505 with no `detail.reason`. A violation it cannot explain is RE-RAISED verbatim.
  if v_source_document is not null then
    begin
      insert into clara.entry_evidence_links(firm_id, client_id, entry_id, document_id, work_id,
          receipt_id, logical_op_id, attached_via, attached_by)
        values (p_firm, p_client, v_entry, v_source_document, p_work, v_receipt, p_logical_op_id,
          'work_commit', p_obo);
    exception when unique_violation then
      v_posted_entry := clara._document_posting_entry(p_client, v_source_document);
      if v_posted_entry is null then raise; end if;
      raise exception 'that document already backs a posted journal entry'
        using errcode='CLR13', detail=jsonb_build_object('reason','source_conflict',
          'document_id', v_source_document, 'entry_id', v_posted_entry,
          'constraint','already_posted', 'conflict', true)::text;
    end;
  end if;

  -- ---- #643 INSERTION 5 · THE DURABLE ADJUSTMENT ROW --------------------------------------
  -- Written INSIDE the posting transaction, beside the entry and the receipt it names, so the
  -- three are one fact or none. The particulars are stored CANONICAL — the Work row keeps the raw
  -- submission — so a reader never has to decide whether a padded code and a trimmed one are the
  -- same claim.
  if w.adjustment_basis is not null then
    v_corrects := nullif(btrim(coalesce(w.adjustment_basis->>'corrects_adjustment_id','')),'')::uuid;
    insert into clara.periodic_adjustments(id, firm_id, client_id, work_id, logical_op_id, purpose,
        period_start, period_end, basis, amount_cents, currency, entry_id, receipt_id,
        source_document_id, corrects_adjustment_id, recorded_by, on_behalf_of)
      values (v_adjustment, p_firm, p_client, p_work, p_logical_op_id, w.purpose,
        (w.adjustment_basis->>'period_start')::date, (w.adjustment_basis->>'period_end')::date,
        v_adj_canon, clara._adjustment_amount_cents(w.purpose, w.adjustment_basis),
        upper(btrim(w.adjustment_basis->>'currency')), v_entry, v_receipt,
        v_source_document, v_corrects, clara.agent_user_id(), p_obo);
    -- THE BACK-POINTER, stamped by the CORRECTING row in the same transaction — the one update
    -- `t_periodic_adjustments_append_only` admits. `uq_periodic_adjustments_corrects` is the
    -- structural half: two Works correcting one adjustment cannot both land, and the second one
    -- raises a unique violation rather than silently overwriting the first chain.
    if v_corrects is not null then
      update clara.periodic_adjustments set corrected_by_adjustment_id = v_adjustment
       where id = v_corrects and client_id = p_client;
    end if;
  end if;
  -- ---- #643 INSERTION 5 ends -------------------------------------------------------------

  -- #643 · THE ANSWER SHAPE IS ONE SHAPE PER LANE, and the key is emitted only when there IS an
  -- adjustment (adversarial migration-safety review, S2). Carried unconditionally, a fresh
  -- `journal_entry` commit answered `"adjustment_id": null` while a REPLAYED pre-0194 one — whose
  -- payload `clara._finish_op` stored before this migration existed — carried no such key at all:
  -- two shapes for one lane, distinguishable only by whether the caller happened to replay. The
  -- `||` fold is the same one `v_effects` above already uses for `document_id`, so the receipt,
  -- the Work's result and the returned answer now agree on one rule: name the effect you had.
  update clara.accounting_work
     set result = jsonb_build_object('entry_id', v_entry, 'receipt_id', v_receipt,
                                     'posted_at', now(), 'document_id', v_source_document)
                  || case when v_adjustment is null then '{}'::jsonb
                          else jsonb_build_object('adjustment_id', v_adjustment) end
   where id = p_work;

  perform clara._audit(p_firm, clara.agent_user_id(), p_obo, p_wake_kind,
    'record_journal_entry', v_entry,
    jsonb_build_object('work', p_work, 'logical_op_id', p_logical_op_id, 'run_id', p_run_id,
      'receipt', v_receipt, 'bundle_digest', p_bundle_digest, 'rationale', p_rationale,
      'document_id', v_source_document, 'purpose', w.purpose, 'adjustment_id', v_adjustment));

  -- …AND THE RETURNED ANSWER FOLLOWS THE SAME RULE as the Work's `result` above (S2).
  v_result := jsonb_build_object('posted', true, 'entry_id', v_entry, 'revision_token', v_token,
    'receipt_id', v_receipt, 'logical_op_id', p_logical_op_id, 'work_id', p_work,
    'document_id', v_source_document, 'replayed', false)
    || case when v_adjustment is null then '{}'::jsonb
            else jsonb_build_object('adjustment_id', v_adjustment) end;
  return clara._finish_op(p_firm, 'record_journal_entry', p_logical_op_id, v_result);
end $$;
revoke all on function clara._record_journal_entry_core(uuid,uuid,text,uuid,uuid,text,jsonb,text,text,text) from public;

reset role;

-- =====================================================================================
-- SECTION 2 — TAIL CENSUS. Every claim this file's header makes, re-read from the CATALOG rather
-- than from the text above. A recut is exactly the kind of change whose damage is invisible in a
-- diff, so the committed body is what gets asserted.
-- =====================================================================================
do $w787_tail$
declare v_src text; v_arm text; v_n int; v_role text; v_ids text[];
begin
  select p.prosrc into v_src from pg_proc p
   where p.oid='clara._record_journal_entry_core(uuid,uuid,text,uuid,uuid,text,jsonb,text,text,text)'::regprocedure;
  if v_src is null then
    raise exception '#787 tail: clara._record_journal_entry_core does not resolve at its pinned signature'
      using errcode='CLR10';
  end if;

  -- (T.1) THE RECUT KEPT EVERY ARM IT INHERITED. 0195's own list, plus the two facts that file's
  -- tail asserted about its gate, plus 0194's typed-particulars family.
  foreach v_role in array array['egress_not_authorized','work_cancelled','work_settled',
                                'obo_not_initiator','basis_mismatch','generic_control_leg',
                                'source_conflict','periodic_adjustments','adjustment_basis',
                                'operation_payload_conflict','unknown_account','client_inactive',
                                'logical_op_mismatch','obo_not_active','insufficient_role',
                                'work_not_found','wake_task_unbound'] loop
    if position(v_role in v_src) = 0 then
      raise exception '#787 tail: the recut core LOST the arm named %', v_role using errcode='CLR10';
    end if;
  end loop;
  if position('_work_egress_event_seq' in v_src) = 0 then
    raise exception '#787 tail: the recut core does not RE-DERIVE the run binding' using errcode='CLR10';
  end if;
  if position('cc.revoked_at is null and ca.deactivated_at is null' in v_src) = 0 then
    raise exception '#787 tail: the egress gate no longer re-reads the consent/activation'
      using errcode='CLR10';
  end if;
  if position('w.bundle->>''id''' in v_src) = 0 then
    raise exception '#787 tail: the recut core does not read the Work''s FROZEN bundle id -- a run claimed under a pre-v3 bundle would be walled out of its own books'
      using errcode='CLR10';
  end if;
  -- …AND THE GRANDFATHERED SET IS STILL EXACTLY THE TWO IDS THE TWO FROZEN MANIFESTS DECLARE.
  -- 0195's own census law, restated here because a fifth copy is exactly where a third id could
  -- be smuggled in: a set that grows by accident is a wall that opens by accident.
  select array_agg(distinct t.m[1] order by t.m[1]) into v_ids
    from regexp_matches(v_src, '(clara-work/v[0-9]+)', 'g') as t(m);
  if v_ids is distinct from array['clara-work/v1','clara-work/v2'] then
    raise exception '#787 tail: the grandfathered bundle-id set in the recut core is % -- it must be EXACTLY {clara-work/v1, clara-work/v2}',
      coalesce(v_ids::text,'<none>') using errcode='CLR10';
  end if;

  -- (T.2) THE NEW ARM IS IN THE COMMITTED BODY, AS ONE OPENED-AND-CLOSED INSERTION POINT.
  select count(*)::int into v_n from regexp_matches(v_src, '#787 INSERTION', 'g');
  if v_n <> 2 then
    raise exception '#787 tail: the insertion point is not opened and closed exactly once (% marker(s))', v_n
      using errcode='CLR10';
  end if;
  v_arm := substring(v_src from '#787 INSERTION · .*?#787 INSERTION ends');
  if v_arm is null then
    raise exception '#787 tail: the #787 arm is not delimited by its own opening and closing comment'
      using errcode='CLR10';
  end if;

  -- (T.3) IT ASKS 0193'S OWN PREDICATE, and reads the occurrence that initiated this Work.
  if position('clara._plan_primary_entry(' in v_arm) = 0 then
    raise exception '#787 tail: the arm does not CALL clara._plan_primary_entry -- a second spelling of the liveness law is exactly what this file must not ship'
      using errcode='CLR10';
  end if;
  if position('accounting_plan_occurrences' in v_arm) = 0
     or position('o.leg = ''reversal''' in v_arm) = 0
     or position('reverses_entry_id' in v_arm) = 0 then
    raise exception '#787 tail: the arm does not read the reversal occurrence and the entry it names'
      using errcode='CLR10';
  end if;

  -- (T.4) IT IS CONDITIONAL ON "NO COMMITTED RECEIPT FOR THIS WORK". An unconditional wall would
  -- refuse a committed replay and turn a posted effect into an unreadable one.
  if position('clara._work_committed_receipt(p_work) is null' in v_arm) = 0 then
    raise exception '#787 tail: the arm is not guarded by the committed-replay condition every other refusal arm in this body carries'
      using errcode='CLR10';
  end if;

  -- (T.5) THE TYPING IS CLR10 WITH THE ADMISSION SIDE'S OWN WORDS, and it is NOT a CLR13. An
  -- unrecognised CLR13 reason falls to the deployed router's `state_changed` default, which
  -- re-plans the run against a wall it can never pass; an unrecognised CLR10 reason falls to
  -- `refusal`, which is terminal and human-recoverable. The code is the whole difference.
  if position('errcode=''CLR10''' in v_arm) = 0 then
    raise exception '#787 tail: the arm does not raise CLR10 -- the refusal would not land TERMINAL under the deployed repair router'
      using errcode='CLR10';
  end if;
  if position('errcode=''CLR13''' in v_arm) <> 0 then
    raise exception '#787 tail: the arm RAISES a CLR13 -- an unrecognised CLR13 reason is classified state_changed and burns the run''s replan budget against a wall it can never pass'
      using errcode='CLR10';
  end if;
  if position('''reversal_before_primary''' in v_arm) = 0
     or position('''entry_not_live''' in v_arm) = 0 then
    raise exception '#787 tail: the arm does not carry the admission side''s vocabulary (reversal_before_primary / entry_not_live)'
      using errcode='CLR10';
  end if;

  -- (T.6) THE FUNCTION'S IDENTITY IS UNMOVED: owner, security definer, pinned search_path, and
  -- the privilege posture (revoked from public; no application role holds EXECUTE on the core or
  -- on the predicate it now calls — both are reachable only through the definer doors).
  select count(*)::int into v_n from pg_proc p
   where p.oid='clara._record_journal_entry_core(uuid,uuid,text,uuid,uuid,text,jsonb,text,text,text)'::regprocedure
     and p.prosecdef and p.proowner::regrole::text = 'clara_fn_owner'
     and p.proconfig @> array['search_path=clara, pg_temp'];
  if v_n <> 1 then
    raise exception '#787 tail: the recut core is not the same owner/security-definer/pinned-search_path function it replaced'
      using errcode='CLR10';
  end if;
  if has_function_privilege('public',
       'clara._record_journal_entry_core(uuid,uuid,text,uuid,uuid,text,jsonb,text,text,text)','EXECUTE') then
    raise exception '#787 tail: PUBLIC can execute the posting core' using errcode='CLR10';
  end if;
  foreach v_role in array array['clara_authenticated','clara_runtime','clara_agent_ro',
                                'clara_wake_interactive','clara_wake_proactive'] loop
    if has_function_privilege(v_role,
         'clara._record_journal_entry_core(uuid,uuid,text,uuid,uuid,text,jsonb,text,text,text)','EXECUTE')
       or has_function_privilege(v_role,'clara._plan_primary_entry(uuid,date)','EXECUTE') then
      raise exception '#787 tail: % can reach the posting core or its liveness predicate directly', v_role
        using errcode='CLR10';
    end if;
  end loop;

  -- (T.7) NOTHING ELSE MOVED. 0193's admission wall is the other half of this law and this file
  -- has no standing to recut it.
  select p.prosrc into v_src from pg_proc p
   where p.oid='clara._plan_admit_occurrence(uuid,date,text,text,boolean)'::regprocedure;
  if position('reversal_before_primary' in v_src) = 0 or position('entry_not_live' in v_src) = 0 then
    raise exception '#787 tail: the ADMISSION wall no longer carries the vocabulary this file reuses'
      using errcode='CLR10';
  end if;

  raise notice '#787 tail: OK -- the FIFTH recut of clara._record_journal_entry_core keeps every inherited arm, the run binding, the consent/activation re-read and the grandfathered set {clara-work/v1, clara-work/v2}; its ONE addition is a single opened-and-closed #787 insertion point that reads the reversal occurrence this Work was initiated by, CALLS clara._plan_primary_entry rather than re-spelling the liveness law, is conditional on the Work holding no committed receipt, and refuses CLR10 reversal_before_primary / entry_not_live -- terminal under the deployed repair router with no frozen closure edited; the function keeps its owner, security definer, pinned search_path and privilege posture, and 0193''s admission wall is byte-unmoved.';
end
$w787_tail$;
