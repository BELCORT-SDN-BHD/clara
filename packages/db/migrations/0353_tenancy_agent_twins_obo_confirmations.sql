-- 0353_tenancy_agent_twins_obo_confirmations — #1137 (riders sweep wave, lane L8): THE MODEL
-- LANE'S ENTRANCE TO THE TENANCY LANE — six agent-granted READ twins, and TWO on-behalf-of
-- CONFIRMATION twins that record the act as the named bookkeeper's own.
-- =====================================================================================
-- Spec of record: issue #1137's body (Agent Brief) TOGETHER WITH the owner-delegated ruling
-- comment of 2026-09-25 on that ticket, which is the ruling its own AC1 asked for:
--
--   "The confirmations half: yes, Clara may confirm a tenancy rent plan on a bookkeeper's behalf
--    from the conversation, as an OBO twin in #915's shape. The person still confirms and the act
--    is recorded as theirs."
--
-- plus the sweep wave's plan of record `docs/plan/active/riders-2026-09-20/SWEEP-PLAN.md` (lane L8)
-- and `docs/plan/active/riders-2026-09-20/CUT-PLAN.md` §1.4 entries C4-C7, which DEFERRED all four
-- tenancy chat tools for exactly the reason this file removes.
--
-- WHAT THIS FILE DOES, IN ONE SENTENCE. Nine bodies — the six tenancy READS of 0300, the two
-- tenancy CONFIRMATIONS of 0300 and `clara.revise_accounting_plan` of 0193 — each have their
-- computation moved, BYTE FOR BYTE, into one ungranted core that takes the caller's firm (and, for
-- the acts, the caller's identity) as arguments; every human door becomes that core's own thin
-- audited wrapper, keeping its signature, its envelope, its refusal codes and its ACL; and EIGHT
-- new audited doors — six `clara.wake_*` reads granted to `clara_agent_ro` with one
-- `clara.wake_fn_allowlist` row each, and two `clara.confirm_*_for` acts granted to
-- `clara_runtime` — are the chat lane's entrances onto the same bodies.
--
-- =====================================================================================
-- WHY THIS FILE EXISTS AT ALL. #949's successor contract
-- (`reports/wave4-lane01-ticket949.md` § "Successor contract") names four chat tools:
--
--   · `read_tenancy_terms` reads `clara.get_contract_terms` and `clara.get_tenancy_rent_plan_draft`,
--     and, where nobody has recorded the terms yet, `clara.propose_contract_terms` for what Clara
--     CAN read off #948's banked reading and what she cannot.
--   · `read_rent_settlement_candidates` reads `clara.get_rent_settlement_candidates` for the open
--     rent months with their candidate bank lines, and `clara.get_tenancy_deposit_coding` for the
--     recorded deposits and the 1120 Deposits Paid coding offer.
--   · `confirm_tenancy_rent_plan` and `confirm_tenancy_rent_plan_revision` are ACTS a person takes,
--     and the second one is read first through `clara.get_tenancy_escalation_revision`.
--
-- All ten 0300 doors are `clara_authenticated` only — cohort `TENANCY_RENT_0300_HUMAN_FNS`, ten
-- names, zero machine-lane grants — and a chat tool runs on a pooled credential that carries NO
-- `request.jwt.claims` at all (`packages/runtime/lib/pools.mjs`: the read pool logs in as
-- `clara_agent_read_login` and SET ROLEs to `clara_agent_ro`; the act lane runs as
-- `clara_runtime`). So cutting those tools as written would have shipped tools that can only
-- answer a grant refusal, which is why CUT-PLAN.md §1.4 deferred them and asked for an owner
-- ruling on the two confirmations. #1137 is the ticket that opens the doors; the ruling above is
-- the answer, and this file is its database half.
--
-- #949's own report item 5 said the opposite ("there is deliberately no machine path to it"). That
-- was a lane's reading of its own scope, not a ruling; the ruling of 2026-09-25 supersedes it, and
-- it changes nothing about WHO decides: the confirmation is still a named bookkeeper's act, the
-- refusals are still the human door's, and the person still says the word. What changes is where
-- they can say it.
--
-- =====================================================================================
-- WHY A SPLIT AND NOT A GRANT, A SECOND BODY OR AN IMPERSONATION. The estate settled this
-- question and this file follows the ruling rather than re-deciding it.
--
-- (1) GRANT THE HUMAN DOORS TO A MACHINE ROLE. Every one resolves its caller through
--     `clara._human_ctx`, which reads `clara.jwt_sub()` / `clara.jwt_firm()`; the chat lane
--     carries neither, so the grant would buy a door that answers CLR04 `no authenticated actor`
--     every time. Worse for the two CONFIRMATIONS: a grant on the human door would be an entrance
--     that names NOBODY, and an on-behalf-of act's whole point is the name.
--
-- (2) A WRAPPER THAT SETS `request.jwt.claims` FROM THE CREDENTIAL'S `on_behalf_of`. REFUSED, and
--     the estate refused it first, in words: "Setting request.jwt.claims from a production
--     function to borrow a human's identity is impersonation; in this repo that idiom appears ONLY
--     inside migration probes (0011:99, 0019:1778), never on a production path, and it is not
--     being introduced here." — `0082_wave_e_zeta_render_jobs_part4.sql:14-17`.
--
-- (3) A SECOND, MACHINE-SIDE COPY OF ANY OF THE NINE COMPUTATIONS. Refused by the same header's
--     next sentence — "DUPLICATION IS REFUSED -- a second copy of a gate is a second place to
--     forget it" — and by #660's own law, "One fact gets ONE definition" (`0154:2058`). It matters
--     most on the CONFIRMATIONS, whose acceptance criterion is literally that the twin's refusal
--     vocabulary matches the human door's for every shared rule (#915's own words, 0307:30-32).
--     Two copies would make that criterion a promise; one body makes it a fact.
--
-- So the shape is the estate's own, twice over: #1000's [0320] / #1136's [0352] for the READS (one
-- ungranted `_*_core(p_firm, …)`, one thin human wrapper, one audited wake wrapper, one allowlist
-- row per kind), and #915's [0307] for the ACTS (one ungranted core both entrances run, the human
-- wrapper keeping its JWT read, and an actor-explicit `_for` twin granted to `clara_runtime` that
-- re-checks the named author's membership LIVE).
--
-- =====================================================================================
-- THE ONE THING THAT MUST NOT CHANGE, AND HOW THIS FILE PROVES IT.
--
-- No core is hand-retyped, and none is built at run time either. Each core's body is the LIVE body
-- with a closed roster of anchored substitutions applied, WRITTEN OUT below as ordinary SQL — so a
-- reader and the migration lexer both see exactly what is installed, and no statement in this file
-- is assembled from a variable. What keeps that honest is a pin on BOTH sides of the apply: §0
-- applies the surgery to the LIVE pre-image and refuses unless the result hashes to the body
-- embedded below it, and §TAIL re-reads the COMMITTED core, pins the same value, and REVERSES the
-- surgery to assert it hashes back to the pre-image. "The answers did not change" is therefore a
-- checked fact about the live catalog rather than a claim about a copy-paste.
--
-- EIGHT of the nine share ONE anchor, which is why this file has one surgery and not nine:
--
--   A. the `c := clara._human_ctx(clara.role_rank('<floor>'));` line every 0300 door opens with,
--      replaced by a comment and `select p_firm as firm into c;` (the READS) or
--      `select p_firm as firm, p_actor as actor into c;` (the two CONFIRMATIONS). The replacement
--      ASSIGNS THE SAME RECORD VARIABLE the human door assigned, which is why there is no second
--      substitution: every `c.firm` and `c.actor` below resolves to an argument, and the rest of
--      each body is the human door's own text byte for byte.
--
-- and three bodies carry one further anchor each, each of which is a LANE question and nothing else:
--
--   B. `clara.confirm_tenancy_rent_plan`'s plan step — the human lane still calls
--      `clara.create_accounting_plan`; the OBO lane takes `clara._tenancy_plan_core`;
--   C. `clara.confirm_tenancy_rent_plan_revision`'s plan step — BOTH lanes now take
--      `clara._revise_accounting_plan_core`, so there is no branch at all;
--   D. `clara.revise_accounting_plan`'s own actor ladder — `clara._plan_door_ctx` moves up into the
--      human delegate and the core re-resolves the plan under the firm it was handed.
--
-- and both confirmations additionally stamp the LANE on their audit row (`via`), exactly as 0222,
-- 0307 and 0308 stamp theirs, so a reader can tell a confirmation taken in a conversation from one
-- taken on the Contract page without joining anything. That is the only observable change to the
-- human entrances in this whole file, and it is additive.
--
-- The behavioural halves are the existing batteries, which run UNCHANGED against the human doors:
-- `tenancy-rent-plan.test.mjs` (#949, forty-odd cells over all ten doors),
-- `accounting-plans.test.mjs` and `accrual-correction.test.mjs` (0193 / #936, the revision door).
-- `tenancy-agent-twins.test.mjs` is this file's own battery and proves the NEW lanes plus the one
-- property every split must never lose — that both entrances answer from the same body.
--
-- =====================================================================================
-- WHAT THIS FILE DELIBERATELY DOES NOT DO.
--   * It opens NO act the ruling did not name. `clara.settle_rent_payable` (accepting a candidate
--     bank line) and `clara.record_contract_terms` (recording what the page says) keep their
--     `clara_authenticated`-only ACL and gain no twin: the settlement is adjudicated where a person
--     can see every candidate side by side, and recording a term is the person's own reading. The
--     tail asserts both, role by role.
--   * It does not widen any human door's ACL by one role, and it mints no relation grant at all.
--     The whole delta on the machine side is EIGHT EXECUTEs on eight new names and SIX allowlist
--     rows for one wake kind.
--   * It does not change a signature, an envelope, a row key, a sort or a refusal code anywhere.
--     A document outside the caller's firm is still CLR11 `document % is not a live filing in your
--     firm`; a client outside it is still CLR11 `client not in your firm` on the settlement read
--     and `client is not in your firm` on the confirmations; the 35-day candidate window and the
--     `candidate_window_days` that travels with it are 0300's, untouched.
--   * It mints no table, no column, no chart row, no event type and no role.
--   * It does not touch `clara.create_accounting_plan`, `clara._obo_plan_core` or
--     `clara._accrual_plan_core`. See the note on §F.
--
-- THE FLOOR EACH LANE CARRIES, STATED SO NOBODY HAS TO DERIVE IT.
--   · human lane — VIEWER for the four document reads, BOOKKEEPER for the two client reads and
--     both confirmations, through `clara._human_ctx(clara.role_rank(...))`, the estate's one floor
--     body, raising the same three CLR04s it raised before this file;
--   · model READ lane — BOOKKEEPER+, and it is not this file's choice:
--     `clara.mint_wake_credential` refuses a below-bookkeeper `on_behalf_of` outright and
--     `clara.wake_context` re-validates that standing on EVERY use, so a demoted person's
--     outstanding credential goes inert mid-conversation. On the four viewer-floored reads the
--     model lane is therefore strictly NARROWER than the human door;
--   · OBO ACT lane — BOOKKEEPER+, re-checked LIVE against `clara.firm_memberships` inside each
--     `_for` twin, exactly as `clara.create_prepayment_schedule_for` does (0307 §D). A person who
--     has left the firm, or been demoted below bookkeeper, cannot have an act recorded as theirs.
--
-- REDO-SAFE BY CONSTRUCTION (#957, `packages/db/README.md`): every object here is a
-- `create or replace function`, the six rows it writes are `on conflict do nothing` against
-- `clara.wake_fn_allowlist`'s own primary key, and each split RECOVERS its pre-image before it
-- splices — from the human door on a fresh apply, and by REVERSING the committed core on a redo —
-- so the pin is asserted on both paths rather than only on the one `CLARA_MIGRATION_REDO` takes.
-- =====================================================================================

set local statement_timeout = '20min';  -- PRECAUTIONARY, not load-bearing: this file creates
                                        -- EIGHTEEN functions (plus fourteen surgery helpers it
                                        -- drops again in §Z), replaces NINE, and writes six rows.
                                        -- It runs no backfill and scans no table.

-- =====================================================================================
-- §-1 — THE SURGERY, SPELLED ONCE. §0 and §TAIL both need the SAME anchors, the SAME forward
-- derivation and the SAME reversal; writing them twice would be two places for them to drift, and
-- drift between the prestate's pin and the tail's reversal is precisely the failure a reversal
-- exists to catch. They live for the length of this file's own transaction and §Z drops them, so
-- nothing outside this migration can ever reach them. They INSTALL nothing: every core below is an
-- ordinary `create or replace function` statement with its body written out.
--
-- EIGHT of the nine bodies this file recuts share ONE anchor — the `clara._human_ctx` line every
-- 0300 door opens with — so the anchor and its replacement are written ONCE, parameterised by the
-- floor word, rather than eight times. The replacement ASSIGNS the same record variable the human
-- door assigned (`select p_firm as firm into c`), which is why no second substitution is needed:
-- every `c.firm` and `c.actor` below it resolves to the argument, and the rest of each body is the
-- human door's own text BYTE FOR BYTE.
-- =====================================================================================
create function clara.__t1137_floor_anchor(p_floor text) returns text
  language sql immutable set search_path = pg_catalog, pg_temp as $t1137_fa$
select replace($t1137_fa_t$  c := clara._human_ctx(clara.role_rank('@FLOOR@'));
$t1137_fa_t$, '@FLOOR@', p_floor)
$t1137_fa$;

create function clara.__t1137_read_replacement(p_floor text) returns text
  language sql immutable set search_path = pg_catalog, pg_temp as $t1137_rr$
select replace($t1137_rr_t$  -- #1137 [0353]: the @FLOOR@ floor and the caller's identity are resolved ABOVE this core --
  -- by the human door through clara._human_ctx, and by the model lane's wake door through
  -- clara.wake_context. The firm they resolved arrives as this function's FIRST argument and is
  -- the whole tenancy wall for both lanes; every line below is the human door's own, byte for byte.
  select p_firm as firm into c;
$t1137_rr_t$, '@FLOOR@', upper(p_floor))
$t1137_rr$;

create function clara.__t1137_act_replacement(p_floor text) returns text
  language sql immutable set search_path = pg_catalog, pg_temp as $t1137_ar$
select replace($t1137_ar_t$  -- #1137 [0353]: the @FLOOR@ floor and the caller's identity are resolved ABOVE this core --
  -- by the human door through clara._human_ctx, and by the OBO twin through a LIVE re-check of the
  -- named author's own membership of this firm. The firm and the actor they resolved arrive as
  -- this function's first two arguments; every line below is the human door's own, byte for byte.
  select p_firm as firm, p_actor as actor into c;
$t1137_ar_t$, '@FLOOR@', upper(p_floor))
$t1137_ar$;

-- THE PLAN STEP OF clara.confirm_tenancy_rent_plan, which is the ONE place the two lanes differ.
create function clara.__t1137_plan_anchor() returns text
  language sql immutable set search_path = pg_catalog, pg_temp as $t1137_pa$
select $t1137_pa_t$  v_created := clara.create_accounting_plan(
    p_client => p_client,
    p_kind => 'recurring_journal',
    p_purpose => v_purpose,
    p_authority_kind => 'explicit_instruction',
    p_authority_ref => jsonb_build_object('kind','contract_confirmation','id',v_confirmation),
    p_frequency => v_plan->>'frequency',
    p_day_rule => v_plan->>'day_rule',
    p_day_of_month => nullif(v_plan->>'day_of_month','')::int,
    p_timezone => v_plan->>'timezone',
    p_effective_from => (v_plan->>'effective_from')::date,
    p_effective_to => (v_plan->>'effective_to')::date,
    p_basis => v_plan->'basis',
    p_reversal_day_rule => null,
    p_op_key => p_op_key || ':plan');
$t1137_pa_t$::text
$t1137_pa$;

create function clara.__t1137_plan_replacement() returns text
  language sql immutable set search_path = pg_catalog, pg_temp as $t1137_pr$
select $t1137_pr_t$  -- #1137 [0353]: ONE plan step per lane, and this branch is the ONLY difference between them.
  -- The HUMAN lane still calls clara.create_accounting_plan (0193) -- the granted plan door, with
  -- its own op key, its own receipt and whatever wall the plan lane adds next; nothing about the
  -- human entrance changes. The OBO lane cannot call it: that door resolves its actor through
  -- clara._human_ctx -> clara.jwt_sub(), and a clara_runtime connection carries no
  -- request.jwt.claims at all, so nesting it would raise CLR04 `no authenticated actor` on every
  -- call. It takes clara._tenancy_plan_core instead, with the named author in an argument --
  -- #915's own answer to exactly this problem (0307 §A, clara._prepayment_plan_core).
  -- THE BRANCH TESTS FOR `obo` AND NOT FOR `human`, so an unknown lane takes the JWT path and
  -- fails CLOSED (CLR04 `no authenticated actor`) rather than writing a plan with no receipt.
  if p_lane = 'obo' then
    v_created := clara._tenancy_plan_core(
      p_firm => c.firm,
      p_client => p_client,
      p_author => c.actor,
      p_purpose => v_purpose,
      p_authority_kind => 'explicit_instruction',
      p_authority_ref => jsonb_build_object('kind','contract_confirmation','id',v_confirmation),
      p_frequency => v_plan->>'frequency',
      p_day_rule => v_plan->>'day_rule',
      p_day_of_month => nullif(v_plan->>'day_of_month','')::int,
      p_timezone => v_plan->>'timezone',
      p_effective_from => (v_plan->>'effective_from')::date,
      p_effective_to => (v_plan->>'effective_to')::date,
      p_basis => v_plan->'basis');
  else
    v_created := clara.create_accounting_plan(
      p_client => p_client,
      p_kind => 'recurring_journal',
      p_purpose => v_purpose,
      p_authority_kind => 'explicit_instruction',
      p_authority_ref => jsonb_build_object('kind','contract_confirmation','id',v_confirmation),
      p_frequency => v_plan->>'frequency',
      p_day_rule => v_plan->>'day_rule',
      p_day_of_month => nullif(v_plan->>'day_of_month','')::int,
      p_timezone => v_plan->>'timezone',
      p_effective_from => (v_plan->>'effective_from')::date,
      p_effective_to => (v_plan->>'effective_to')::date,
      p_basis => v_plan->'basis',
      p_reversal_day_rule => null,
      p_op_key => p_op_key || ':plan');
  end if;
$t1137_pr_t$::text
$t1137_pr$;

-- THE PLAN STEP OF clara.confirm_tenancy_rent_plan_revision, which is the SAME body for both
-- lanes once clara.revise_accounting_plan is itself a delegate over an actor-explicit core.
create function clara.__t1137_revise_anchor() returns text
  language sql immutable set search_path = pg_catalog, pg_temp as $t1137_va$
select $t1137_va_t$  v_result := clara.revise_accounting_plan(
    p_plan => v_plan.plan_id,
$t1137_va_t$::text
$t1137_va$;

create function clara.__t1137_revise_replacement() returns text
  language sql immutable set search_path = pg_catalog, pg_temp as $t1137_vr$
select $t1137_vr_t$  -- #1137 [0353]: the SAME body for both lanes, and no branch at all.
  -- clara.revise_accounting_plan (0193) is now a thin delegate over
  -- clara._revise_accounting_plan_core, which takes the caller's firm and actor as arguments
  -- instead of reading a JWT -- so the OBO lane revises through exactly the body the human lane
  -- revises through, and the human entrance is unchanged. Calling the core directly also skips one
  -- redundant clara._human_ctx read: the floor was already taken by whichever entrance resolved c.
  v_result := clara._revise_accounting_plan_core(
    p_firm => c.firm, p_actor => c.actor,
    p_plan => v_plan.plan_id,
$t1137_vr_t$::text
$t1137_vr$;

-- THE ACTOR LADDER OF clara.revise_accounting_plan itself.
create function clara.__t1137_ctx_anchor() returns text
  language sql immutable set search_path = pg_catalog, pg_temp as $t1137_ca$
select $t1137_ca_t$  select * into v_ctx from clara._plan_door_ctx(p_plan, clara.role_rank('bookkeeper')) c;
  v_actor := v_ctx.actor; v_firm := v_ctx.firm; p := v_ctx.pl;
$t1137_ca_t$::text
$t1137_ca$;

create function clara.__t1137_ctx_replacement() returns text
  language sql immutable set search_path = pg_catalog, pg_temp as $t1137_cr$
select $t1137_cr_t$  -- #1137 [0353]: the BOOKKEEPER floor and the caller's identity are resolved ABOVE this core --
  -- by clara.revise_accounting_plan (the human door, through clara._plan_door_ctx) and by the
  -- tenancy lane's OBO confirmation (through a LIVE re-check of the named author's membership).
  -- The plan is re-resolved here under the firm they resolved, so a plan outside the caller's firm
  -- answers clara._plan_door_ctx's OWN CLR11, word for word, on both lanes -- and no existence
  -- oracle opens, because the firm predicate is part of the lookup exactly as it is there.
  v_actor := p_actor; v_firm := p_firm;
  select * into p from clara.accounting_plans where id = p_plan and firm_id = p_firm;
  if p.id is null then
    raise exception 'accounting plan not found in your firm' using errcode='CLR11',
      detail='{"reason":"plan_not_found"}';
  end if;
$t1137_cr_t$::text
$t1137_cr$;

-- THE AUDIT ROW OF EACH CONFIRMATION, which gains the lane it was taken through.
create function clara.__t1137_audit_anchor(p_verb text) returns text
  language sql immutable set search_path = pg_catalog, pg_temp as $t1137_aa$
select replace($t1137_aa_t$  perform clara._audit(c.firm, c.actor, null, null, '@VERB@', null,
    jsonb_build_object('client', p_client, 'document', p_document,
$t1137_aa_t$, '@VERB@', p_verb)
$t1137_aa$;

create function clara.__t1137_audit_replacement(p_verb text) returns text
  language sql immutable set search_path = pg_catalog, pg_temp as $t1137_ap$
select replace($t1137_ap_t$  -- #1137 [0353]: the LANE travels on the audit row, exactly as 0222, 0307 and 0308 stamp `via`
  -- on theirs -- so a reader can tell a confirmation taken in a conversation from one taken on the
  -- Contract page without joining anything. The ACTOR is the named person either way: that is what
  -- an on-behalf-of act means, and clara.contract_plan_confirmations.confirmed_by says so too.
  perform clara._audit(c.firm, c.actor, null, null, '@VERB@', null,
    jsonb_build_object('via', case p_lane when 'obo' then '@VERB@_for' else '@VERB@' end,
      'client', p_client, 'document', p_document,
$t1137_ap_t$, '@VERB@', p_verb)
$t1137_ap$;

-- THE SURGERY ITSELF, forward and back. Every core below is installed as PLAIN SQL with its body
-- written out, so a reader and the migration lexer both see exactly what is installed and no
-- statement in this file is assembled from a variable. These functions are what makes that safe:
-- §0 applies them to the LIVE pre-image and pins the sha of the result, so an embedded body that
-- differs from the derivation by one byte aborts the migration before anything is installed, and
-- §TAIL re-reads the COMMITTED core and reverses the surgery back to the pinned pre-image.
create function clara.__t1137_forward(p_src text, p_mode text, p_floor text) returns text
  language sql immutable set search_path = pg_catalog, pg_temp as $t1137_fw$
select case p_mode
  when 'read' then replace(p_src, clara.__t1137_floor_anchor(p_floor), clara.__t1137_read_replacement(p_floor))
  when 'confirm' then
    replace(
      replace(
        replace(p_src, clara.__t1137_floor_anchor(p_floor), clara.__t1137_act_replacement(p_floor)),
        clara.__t1137_plan_anchor(), clara.__t1137_plan_replacement()),
      clara.__t1137_audit_anchor('confirm_tenancy_rent_plan'),
      clara.__t1137_audit_replacement('confirm_tenancy_rent_plan'))
  when 'revision' then
    replace(
      replace(
        replace(p_src, clara.__t1137_floor_anchor(p_floor), clara.__t1137_act_replacement(p_floor)),
        clara.__t1137_revise_anchor(), clara.__t1137_revise_replacement()),
      clara.__t1137_audit_anchor('confirm_tenancy_rent_plan_revision'),
      clara.__t1137_audit_replacement('confirm_tenancy_rent_plan_revision'))
  when 'revise' then replace(p_src, clara.__t1137_ctx_anchor(), clara.__t1137_ctx_replacement())
  end
$t1137_fw$;

create function clara.__t1137_reverse(p_src text, p_mode text, p_floor text) returns text
  language sql immutable set search_path = pg_catalog, pg_temp as $t1137_rv$
select case p_mode
  when 'read' then replace(p_src, clara.__t1137_read_replacement(p_floor), clara.__t1137_floor_anchor(p_floor))
  when 'confirm' then
    replace(
      replace(
        replace(p_src,
          clara.__t1137_audit_replacement('confirm_tenancy_rent_plan'),
          clara.__t1137_audit_anchor('confirm_tenancy_rent_plan')),
        clara.__t1137_plan_replacement(), clara.__t1137_plan_anchor()),
      clara.__t1137_act_replacement(p_floor), clara.__t1137_floor_anchor(p_floor))
  when 'revision' then
    replace(
      replace(
        replace(p_src,
          clara.__t1137_audit_replacement('confirm_tenancy_rent_plan_revision'),
          clara.__t1137_audit_anchor('confirm_tenancy_rent_plan_revision')),
        clara.__t1137_revise_replacement(), clara.__t1137_revise_anchor()),
      clara.__t1137_act_replacement(p_floor), clara.__t1137_floor_anchor(p_floor))
  when 'revise' then replace(p_src, clara.__t1137_ctx_replacement(), clara.__t1137_ctx_anchor())
  end
$t1137_rv$;

-- THE PRE-IMAGE, RECOVERED THE SAME WAY ON BOTH PATHS. On a FRESH apply the human door still
-- carries the body this file is about to move; on a REDO (#957) it carries this file's own thin
-- delegate, and the pre-image is the committed core with the surgery reversed. §0 and §TAIL both
-- call this, so the pin is asserted before AND after, on whichever path the run took.
create function clara.__t1137_preimage(p_core text, p_human text, p_mode text, p_floor text)
  returns text language plpgsql stable set search_path = pg_catalog, pg_temp as $t1137_pi$
declare v_src text;
begin
  if to_regprocedure(p_core) is null then
    select p.prosrc into v_src from pg_proc p where p.oid = p_human::regprocedure;
    return v_src;
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid = p_core::regprocedure;
  return clara.__t1137_reverse(v_src, p_mode, p_floor);
end
$t1137_pi$;

-- No PUBLIC grant even for the length of one transaction: the §0 and §TAIL blocks call these while
-- the session is clara_fn_owner, and nothing else ever should.
revoke all on function clara.__t1137_floor_anchor(text) from public;
revoke all on function clara.__t1137_read_replacement(text) from public;
revoke all on function clara.__t1137_act_replacement(text) from public;
revoke all on function clara.__t1137_plan_anchor() from public;
revoke all on function clara.__t1137_plan_replacement() from public;
revoke all on function clara.__t1137_revise_anchor() from public;
revoke all on function clara.__t1137_revise_replacement() from public;
revoke all on function clara.__t1137_ctx_anchor() from public;
revoke all on function clara.__t1137_ctx_replacement() from public;
revoke all on function clara.__t1137_audit_anchor(text) from public;
revoke all on function clara.__t1137_audit_replacement(text) from public;
revoke all on function clara.__t1137_forward(text,text,text) from public;
revoke all on function clara.__t1137_reverse(text,text,text) from public;
revoke all on function clara.__t1137_preimage(text,text,text,text) from public;
grant execute on function clara.__t1137_floor_anchor(text) to clara_fn_owner;
grant execute on function clara.__t1137_read_replacement(text) to clara_fn_owner;
grant execute on function clara.__t1137_act_replacement(text) to clara_fn_owner;
grant execute on function clara.__t1137_plan_anchor() to clara_fn_owner;
grant execute on function clara.__t1137_plan_replacement() to clara_fn_owner;
grant execute on function clara.__t1137_revise_anchor() to clara_fn_owner;
grant execute on function clara.__t1137_revise_replacement() to clara_fn_owner;
grant execute on function clara.__t1137_ctx_anchor() to clara_fn_owner;
grant execute on function clara.__t1137_ctx_replacement() to clara_fn_owner;
grant execute on function clara.__t1137_audit_anchor(text) to clara_fn_owner;
grant execute on function clara.__t1137_audit_replacement(text) to clara_fn_owner;
grant execute on function clara.__t1137_forward(text,text,text) to clara_fn_owner;
grant execute on function clara.__t1137_reverse(text,text,text) to clara_fn_owner;
grant execute on function clara.__t1137_preimage(text,text,text,text) to clara_fn_owner;

-- =====================================================================================
-- §0 — PRESTATE. Every claim this file makes about what it is editing, measured BEFORE it edits.
-- =====================================================================================
do $t1137_pre$
declare
  v_i int; v_src text; v_core text; v_sha text; v_sig text; v_modes text := '';
  -- THE NINE BODIES THIS FILE RECUTS, pinned by sha256(prosrc) MEASURED ON THIS RIG after 0352
  -- (rule: pin what is LIVE, never a literal copied from an older migration's text).
  --   1 core signature | 2 human signature | 3 mode | 4 floor | 5 pre-image sha | 6 derived sha
  v_jobs text[][] := array[
    ['clara._get_contract_terms_core(uuid,uuid)',
     'clara.get_contract_terms(uuid)', 'read', 'viewer',
     '2eb8402e9f343deb72f6d0a48aeeedf8f3f85dbe6458a01ba2b5150993d1e2c9',
     'af2a3178bf078bd08e4c1770ec7bbe59349655d003e36446d0c9a96b693b8d27'],
    ['clara._get_tenancy_rent_plan_draft_core(uuid,uuid)',
     'clara.get_tenancy_rent_plan_draft(uuid)', 'read', 'viewer',
     '65296ec0dc4e30c75ba441581312d59133e3325233d9fc87edd87592cd2354d0',
     'c930f0aa0fe8202631b1c3abc94f011ecd3d13994fab317a04603f58b2382635'],
    ['clara._propose_contract_terms_core(uuid,uuid)',
     'clara.propose_contract_terms(uuid)', 'read', 'viewer',
     'e630c5a4867d9ff1f1e124fc8ca6d45617f9632d6817e2347498331ff72eb297',
     '6d1cf1b746465866b66776e7fd5dde9f46fcb5cbcbaea53930441c1c619fad60'],
    ['clara._get_tenancy_escalation_revision_core(uuid,uuid)',
     'clara.get_tenancy_escalation_revision(uuid)', 'read', 'viewer',
     '75301d54afcd9f7bcf0451b016c065677b45d2207e9881386dbf3eba36ba63c5',
     '221d59382b2d1f00dc5303b02381c1af5de6ce2a065f0bfbfad57244f3e17648'],
    ['clara._get_rent_settlement_candidates_core(uuid,uuid)',
     'clara.get_rent_settlement_candidates(uuid)', 'read', 'bookkeeper',
     'c08efcd38f95a5b0360233f5dd0ad6528d58c6e062592d4c8e676fa83cfa7090',
     '3fe122690feec88235f26e1619c80ffe217b1958cfb918be6be63f15577e57dd'],
    ['clara._get_tenancy_deposit_coding_core(uuid,uuid)',
     'clara.get_tenancy_deposit_coding(uuid)', 'read', 'bookkeeper',
     '2ceefb9cac34c65edc965ce350443af1bd8fec18088558fe2f4cf73d5a509900',
     '3092d3d42a713bed5692ea41f8f32fa03ef4892c71241706eab2c2a92d8846b9'],
    ['clara._confirm_tenancy_rent_plan_core(uuid,uuid,text,uuid,uuid,text,text,text,text)',
     'clara.confirm_tenancy_rent_plan(uuid,uuid,text,text,text,text)', 'confirm', 'bookkeeper',
     '4561bcf6de011930f5c9b74fa90bca1bd24af105398f2fe584bf21c696ceb4ce',
     'e8a65796245bd331a72c7f92c6b882737f45e4f1be12c35739f5ea430265ef29'],
    ['clara._confirm_tenancy_rent_plan_revision_core(uuid,uuid,text,uuid,uuid,text,text)',
     'clara.confirm_tenancy_rent_plan_revision(uuid,uuid,text,text)', 'revision', 'bookkeeper',
     '5a69eed78db63e81f0c4915b784aa38be4991a7dbdaa1258324e413e02642530',
     '5fe080568b2cf3ae0e5258af244340789e376d2060e6695ff08fc99b8c15a2d4'],
    ['clara._revise_accounting_plan_core(uuid,uuid,uuid,text,text,integer,text,date,date,jsonb,text,text)',
     'clara.revise_accounting_plan(uuid,text,text,integer,text,date,date,jsonb,text,text)',
     'revise', 'bookkeeper',
     '8a6e69efac967592592bf3e8d08683145e5b43456a63fe673788337349382886',
     '0908c2b7c026fe39bd9b8f3ce7aa3e34b196cb8086300c8c9a665ee17a1f596c']
  ];
  -- …AND THE NEIGHBOURS THIS FILE RELIES ON AND MUST NOT MOVE. Every one is CALLED by a body this
  -- file installs or delegates to, so each is part of this file's contract even though it edits
  -- none of them. Pinned UNCONDITIONALLY — this file never touches them in either mode, so a
  -- changed sha is always a finding, and the list is what the integrator diffs against another
  -- lane's recuts.
  --
  -- DELIBERATELY ABSENT, and this is a ruling rather than an omission: `clara.create_accounting_plan`,
  -- `clara._obo_plan_core`, `clara._accrual_plan_core` and `clara._authority_ref_refusal` are lane
  -- L1's this wave (#1051 recuts the first two, #1080 recuts the third). Pinning a body another
  -- lane recuts in the same wave would refuse this migration at integration for a change that is
  -- not a defect. §F says what this file does instead.
  v_keep text[][] := array[
    ['clara._human_ctx(integer)',
     'd1a8a1940ffee67f0bbe1f44f4081c8a5b1fca1775832948c2c606ced2043a46'],
    ['clara.role_rank(text)',
     '5ced25aed03ff000519af583c5c5b89c4d59c4cb5f20e49f39877435e8c2576f'],
    ['clara.wake_context()',
     'fae8e7999b1763b96d451e12cba28ba15a27a2eb93601ccf9f178f4f361b540d'],
    ['clara.assert_wake_allowed(text,text)',
     '1c88b7e09e60e3384ee5a2cff36db7ba242f3397f0213b488388f7f827306e3b'],
    ['clara._plan_door_ctx(uuid,integer)',
     '97bd6c12ed368f7a2e5f2c96b548f7d77c6a49e603210203e282a011310e289b'],
    ['clara._tenancy_rent_plan(uuid)',
     'a9f66ff101e102e485878c097a3a3741ecd84d479ce183b006e94cb2a44afa09'],
    ['clara._tenancy_rent_plan_draft(uuid,uuid,text,text)',
     'e90c192ce7b8d22c353218aa0967b2e709aeb9c4c591ac8505d7386fcc89dc4c'],
    ['clara._tenancy_lease_treatment(uuid,uuid)',
     '1666cc76d4a17cb54acf672a3a792c15dbf48c823cc5ebff256845eac33182a6'],
    ['clara._tenancy_escalation_state(uuid)',
     'f389d329ce111afe0105657e06ade332c4c74cc62714c3dfc69188fcdb85f336'],
    ['clara._tenancy_term_regions(uuid)',
     '7945c7765018a2cf30b015b84436a0766db8b9ca5fe0804dd3332370381bac64'],
    ['clara._contract_terms_row_json(clara.contract_terms)',
     '6d38d52c210862af433baecae2da6cf4a9a58540ea94c80d87ef9e06b5349bbc'],
    ['clara._contract_term_rank(text)',
     '3113af0f1292a70d86a21a455dbde62fb9cc617ee867c9416cada2a38fff087a'],
    ['clara._agreement_signed_date(text)',
     '0e03f17abc8d13f5fa1e52b29bbd14de1f12605572a98520f5fca77df6e95322'],
    ['clara._rent_payable_unsettled(uuid)',
     '458964d8e6f28bf8df016f11d5f82305d2e5ba964dbe625cf39d2fa9fcd9b4c0'],
    ['clara._rent_settlement_bank_candidates(uuid,bigint,date,integer)',
     'ef61f841cd48f22b24a3e24b9fbe6c74365ab348d59df43a439ea94ef65977f3']
  ];
begin
  -- THE PREMISES, by name rather than by a cascade of `undefined function` errors later.
  if to_regclass('clara.contract_terms') is null
     or to_regclass('clara.contract_plan_confirmations') is null then
    raise exception '#1137 prestate: 0300 (the tenancy contract-terms and rent-plan lane) must apply first'
      using errcode='CLR10';
  end if;
  if to_regclass('clara.wake_fn_allowlist') is null then
    raise exception '#1137 prestate: clara.wake_fn_allowlist is absent -- the wake lane must exist first'
      using errcode='CLR10';
  end if;
  if to_regprocedure('clara.wake_context()') is null
     or to_regprocedure('clara.assert_wake_allowed(text,text)') is null then
    raise exception '#1137 prestate: the wake context/allowlist pair is absent' using errcode='CLR10';
  end if;
  if to_regprocedure('clara.create_accounting_plan(uuid,text,text,text,jsonb,text,text,integer,text,date,date,jsonb,text,text)') is null then
    raise exception '#1137 prestate: clara.create_accounting_plan is absent -- 0193 must apply first'
      using errcode='CLR10';
  end if;

  -- THE NINE RECUTS. For each: recover the pre-image (from the human door on a FRESH apply, by
  -- reversing the committed core on a REDO), pin it, derive the core, assert the surgery CHANGED
  -- something, assert the derivation equals the body embedded below, and assert it reverses.
  for v_i in 1 .. array_length(v_jobs, 1) loop
    v_sig := v_jobs[v_i][1];
    if to_regprocedure(v_jobs[v_i][2]) is null then
      raise exception '#1137 prestate: the human door % is absent', v_jobs[v_i][2] using errcode='CLR10';
    end if;
    v_modes := v_modes || case when to_regprocedure(v_sig) is null then 'FRESH ' else 'REDO ' end;
    v_src := clara.__t1137_preimage(v_sig, v_jobs[v_i][2], v_jobs[v_i][3], v_jobs[v_i][4]);
    v_sha := encode(sha256(convert_to(v_src, 'UTF8')), 'hex');
    if v_sha is distinct from v_jobs[v_i][5] then
      raise exception '#1137 prestate: % is at sha % but this file was written against % -- a body this file moves has changed underneath it',
        v_jobs[v_i][2], v_sha, v_jobs[v_i][5] using errcode='CLR10';
    end if;
    v_core := clara.__t1137_forward(v_src, v_jobs[v_i][3], v_jobs[v_i][4]);
    if v_core = v_src then
      raise exception '#1137 prestate: the surgery on % changed nothing -- an anchor did not match',
        v_jobs[v_i][2] using errcode='CLR10';
    end if;
    if encode(sha256(convert_to(v_core, 'UTF8')), 'hex') is distinct from v_jobs[v_i][6] then
      raise exception '#1137 prestate: the body this file embeds for % is not the derivation of the live body (derived %, embedded %)',
        v_sig, encode(sha256(convert_to(v_core, 'UTF8')), 'hex'), v_jobs[v_i][6] using errcode='CLR10';
    end if;
    if clara.__t1137_reverse(v_core, v_jobs[v_i][3], v_jobs[v_i][4]) is distinct from v_src then
      raise exception '#1137 prestate: the surgery on % does not reverse -- the tail could not prove the arithmetic unchanged',
        v_sig using errcode='CLR10';
    end if;
  end loop;

  -- THE NEIGHBOURS.
  for v_i in 1 .. array_length(v_keep, 1) loop
    if to_regprocedure(v_keep[v_i][1]) is null then
      raise exception '#1137 prestate: the neighbour % is absent', v_keep[v_i][1] using errcode='CLR10';
    end if;
    select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha
      from pg_proc p where p.oid = v_keep[v_i][1]::regprocedure;
    if v_sha is distinct from v_keep[v_i][2] then
      raise exception '#1137 prestate: the neighbour % is at sha %, expected % -- this file relies on its behaviour',
        v_keep[v_i][1], v_sha, v_keep[v_i][2] using errcode='CLR10';
    end if;
  end loop;

  -- THE NEW NAMES MUST NOT COLLIDE WITH SOMETHING ELSE'S.
  if to_regprocedure('clara._tenancy_plan_core(uuid,uuid,uuid,text,text,jsonb,text,text,integer,text,date,date,jsonb)') is not null
     and to_regprocedure('clara._confirm_tenancy_rent_plan_core(uuid,uuid,text,uuid,uuid,text,text,text,text)') is null then
    raise exception '#1137 prestate: clara._tenancy_plan_core exists without this file''s confirmation core -- a half-applied lane'
      using errcode='CLR10';
  end if;

  raise notice '#1137 prestate: OK -- nine bodies recovered, pinned, derived and reversed (modes: %); % neighbour(s) unmoved.',
    btrim(v_modes), array_length(v_keep, 1);
end
$t1137_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §A — THE SIX READ CORES. Each is its human door's OWN body with the caller's firm lifted into
-- the first argument, derived from the live pre-image and pinned on both sides of the apply (§0
-- and §TAIL). Nothing else moves: not a key, not an order-by, not a refusal code, not a window.
-- Each is granted to NOBODY and reached only from its two definer doors — the one-ungranted-core
-- law, 0004:6-12.
-- =====================================================================================
create or replace function clara._get_contract_terms_core(p_firm uuid, p_document uuid)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp
  as $t1137_terms_core$
declare c record; v_client uuid; v_state jsonb; v_live jsonb; v_hist jsonb;
begin
  -- #1137 [0353]: the VIEWER floor and the caller's identity are resolved ABOVE this core --
  -- by the human door through clara._human_ctx, and by the model lane's wake door through
  -- clara.wake_context. The firm they resolved arrives as this function's FIRST argument and is
  -- the whole tenancy wall for both lanes; every line below is the human door's own, byte for byte.
  select p_firm as firm into c;
  select f.client_id into v_client from clara.document_filings f
   where f.document_id = p_document and f.firm_id = c.firm and f.retired_at is null
   order by f.filed_at desc limit 1;
  if v_client is null then
    raise exception 'document % is not a live filing in your firm', p_document using errcode='CLR11';
  end if;

  select e.envelope->'contract_state' into v_state from clara.document_extractions e
   where e.document_id = p_document and e.engine_kind = 'agreement_text_facts' and e.status = 'done'
   order by e.version_n desc, e.extracted_at desc limit 1;

  select coalesce(jsonb_agg(clara._contract_terms_row_json(ct)
           order by clara._contract_term_rank(ct.term_key)), '[]'::jsonb)
    into v_live
    from clara.contract_terms ct
   where ct.document_id = p_document and ct.superseded_at is null;

  select coalesce(jsonb_agg(clara._contract_terms_row_json(ct)
           order by ct.superseded_at desc), '[]'::jsonb)
    into v_hist
    from clara.contract_terms ct
   where ct.document_id = p_document and ct.superseded_at is not null;

  return jsonb_build_object('document_id', p_document, 'client_id', v_client,
    'agreement_class', v_state->>'agreement_class',
    'terms', v_live, 'history', v_hist);
end $t1137_terms_core$;

create or replace function clara._get_tenancy_rent_plan_draft_core(p_firm uuid, p_document uuid)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp
  as $t1137_draft_core$
declare c record; v_client uuid; v_state jsonb; v_draft jsonb; v_plan record;
begin
  -- #1137 [0353]: the VIEWER floor and the caller's identity are resolved ABOVE this core --
  -- by the human door through clara._human_ctx, and by the model lane's wake door through
  -- clara.wake_context. The firm they resolved arrives as this function's FIRST argument and is
  -- the whole tenancy wall for both lanes; every line below is the human door's own, byte for byte.
  select p_firm as firm into c;
  select f.client_id into v_client from clara.document_filings f
   where f.document_id = p_document and f.firm_id = c.firm and f.retired_at is null
   order by f.filed_at desc limit 1;
  if v_client is null then
    raise exception 'document % is not a live filing in your firm', p_document using errcode='CLR11';
  end if;

  select e.envelope->'contract_state' into v_state from clara.document_extractions e
   where e.document_id = p_document and e.engine_kind = 'agreement_text_facts' and e.status = 'done'
   order by e.version_n desc, e.extracted_at desc limit 1;
  if (v_state->>'agreement_class') is distinct from 'tenancy' then
    return jsonb_build_object('document_id', p_document, 'client_id', v_client,
      'agreement_class', v_state->>'agreement_class',
      'treatment', null, 'plan', null,
      'refusals', jsonb_build_array(jsonb_build_object('reason','not_a_tenancy',
        'detail', jsonb_build_object('agreement_class', v_state->>'agreement_class'))),
      'confirmed', false, 'plan_id', null, 'inert', true);
  end if;

  v_draft := clara._tenancy_rent_plan_draft(v_client, p_document);
  select * into v_plan from clara._tenancy_rent_plan(p_document);

  -- CLARA DRAFTS NOTHING WHEN THE STANDARD MAY NOT ADMIT THE TREATMENT (the owner's ruling). The
  -- terms, the question and the standard still travel, because a person deciding needs to see
  -- what she read; the basis does not, because a basis on screen is an offer to post it.
  return jsonb_build_object('document_id', p_document, 'client_id', v_client,
    'agreement_class', 'tenancy',
    'treatment', v_draft->'treatment',
    'plan', case when (v_draft->'treatment'->>'drafts')::boolean is true
                 then v_draft->'plan' end,
    'refusals', v_draft->'refusals',
    'confirmed', v_plan.plan_id is not null,
    'plan_id', v_plan.plan_id, 'plan_status', v_plan.status,
    'inert', v_plan.plan_id is null);
end $t1137_draft_core$;

create or replace function clara._propose_contract_terms_core(p_firm uuid, p_document uuid)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp
  as $t1137_propose_core$
declare
  c record; v_client uuid; v_state jsonb; v_extraction uuid;
  v_class text; v_proposed jsonb := '[]'::jsonb; v_not_read jsonb := '[]'::jsonb;
  v_rent_region uuid; v_dep_region uuid; v_date_region uuid; v_term_region uuid;
  v_rent bigint; v_dep bigint; v_months int; v_start date;
  v_f jsonb; v_state_of text;
begin
  -- #1137 [0353]: the VIEWER floor and the caller's identity are resolved ABOVE this core --
  -- by the human door through clara._human_ctx, and by the model lane's wake door through
  -- clara.wake_context. The firm they resolved arrives as this function's FIRST argument and is
  -- the whole tenancy wall for both lanes; every line below is the human door's own, byte for byte.
  select p_firm as firm into c;
  select f.client_id into v_client from clara.document_filings f
   where f.document_id = p_document and f.firm_id = c.firm and f.retired_at is null
   order by f.filed_at desc limit 1;
  if v_client is null then
    raise exception 'document % is not a live filing in your firm', p_document using errcode='CLR11';
  end if;

  select e.id, e.envelope->'contract_state' into v_extraction, v_state
    from clara.document_extractions e
   where e.document_id = p_document and e.engine_kind = 'agreement_text_facts' and e.status = 'done'
   order by e.version_n desc, e.extracted_at desc limit 1;
  if v_state is null then
    return jsonb_build_object('document_id', p_document, 'client_id', v_client,
      'agreement_class', null, 'extraction_id', null,
      'proposed', '[]'::jsonb, 'not_read', '[]'::jsonb, 'reason', 'agreement_not_read');
  end if;

  v_class := v_state->>'agreement_class';
  if v_class is distinct from 'tenancy' then
    return jsonb_build_object('document_id', p_document, 'client_id', v_client,
      'agreement_class', v_class, 'extraction_id', v_extraction,
      'proposed', '[]'::jsonb, 'not_read', '[]'::jsonb, 'reason', 'not_a_tenancy');
  end if;

  select tr.region_id into v_rent_region from clara._tenancy_term_regions(p_document) tr
   where tr.field_path = 'contract.agreement.instalment_amount';
  select tr.region_id into v_dep_region from clara._tenancy_term_regions(p_document) tr
   where tr.field_path = 'contract.agreement.deposit';
  select tr.region_id into v_date_region from clara._tenancy_term_regions(p_document) tr
   where tr.field_path = 'contract.agreement.agreement_date';
  select tr.region_id into v_term_region from clara._tenancy_term_regions(p_document) tr
   where tr.field_path = 'contract.agreement.term_months';

  -- 1 - THE MONTHLY RENT. A figure the page printed and both channels read the same way.
  v_f := v_state->'facts'->'contract.agreement.instalment_amount';
  v_state_of := v_f->>'state';
  v_rent := nullif(v_f->>'printed_cents','')::bigint;
  if v_state_of = 'established' and v_rent is not null and v_rent > 0 and v_rent_region is not null then
    v_proposed := v_proposed || jsonb_build_array(jsonb_build_object(
      'term_key','monthly_rent','amount_cents',v_rent,'printed_raw',v_f->>'printed_raw',
      'basis_kind','document_region','source_region_ids',jsonb_build_array(v_rent_region),
      'basis','the monthly rent this tenancy prints, read by the contract lane'));
  else
    v_not_read := v_not_read || jsonb_build_array(jsonb_build_object(
      'term_key','monthly_rent','reason',coalesce(v_state_of,'agreement_not_read')));
  end if;

  -- 2 - THE DEPOSIT. Zero is admitted here and nowhere else in this lane: a tenancy that states
  --     "no deposit" has stated a term, and `not printed` is a different answer again.
  v_f := v_state->'facts'->'contract.agreement.deposit';
  v_state_of := v_f->>'state';
  v_dep := nullif(v_f->>'printed_cents','')::bigint;
  if v_state_of = 'established' and v_dep is not null and v_dep_region is not null then
    v_proposed := v_proposed || jsonb_build_array(jsonb_build_object(
      'term_key','deposit','amount_cents',v_dep,'printed_raw',v_f->>'printed_raw',
      'basis_kind','document_region','source_region_ids',jsonb_build_array(v_dep_region),
      'basis','the deposit this tenancy states; signing does not say the money moved'));
  else
    v_not_read := v_not_read || jsonb_build_array(jsonb_build_object(
      'term_key','deposit','reason',coalesce(v_state_of,'agreement_not_read')));
  end if;

  -- 3 - THE TERM'S FIRST DAY, derived from the signing date the page printed.
  v_f := v_state->'facts'->'contract.agreement.agreement_date';
  v_state_of := v_f->>'state';
  v_start := case when v_state_of = 'established'
                  then clara._agreement_signed_date(v_f->>'printed_raw') end;
  if v_start is not null and v_date_region is not null then
    v_proposed := v_proposed || jsonb_build_array(jsonb_build_object(
      'term_key','term_start','term_date',to_char(v_start,'YYYY-MM-DD'),
      'printed_raw',v_f->>'printed_raw',
      'basis_kind','derived_from_regions','source_region_ids',jsonb_build_array(v_date_region),
      'basis','the day the agreement was signed; correct it where the tenancy commences later'));
  else
    v_not_read := v_not_read || jsonb_build_array(jsonb_build_object(
      'term_key','term_start','reason',
      case when v_state_of = 'established' then 'signing_date_unreadable'
           else coalesce(v_state_of,'agreement_not_read') end));
  end if;

  -- 4 - THE TERM'S LAST DAY. Needs BOTH the first day and the printed term in months, and it is
  --     INCLUSIVE: 24 months from 5 January 2026 ends on 4 January 2028.
  v_f := v_state->'facts'->'contract.agreement.term_months';
  v_state_of := v_f->>'state';
  v_months := case when v_state_of = 'established' and btrim(coalesce(v_f->>'printed_raw','')) ~ '^[0-9]{1,3}$'
                   then btrim(v_f->>'printed_raw')::int end;
  if v_start is not null and v_months is not null and v_months > 0
     and v_date_region is not null and v_term_region is not null then
    v_proposed := v_proposed || jsonb_build_array(jsonb_build_object(
      'term_key','term_end',
      'term_date',to_char((v_start + make_interval(months => v_months) - interval '1 day')::date,'YYYY-MM-DD'),
      'printed_raw',v_f->>'printed_raw',
      'basis_kind','derived_from_regions',
      'source_region_ids',jsonb_build_array(v_date_region, v_term_region),
      'basis',format('%s months from the first day, the last day included', v_months)));
  else
    v_not_read := v_not_read || jsonb_build_array(jsonb_build_object(
      'term_key','term_end','reason',
      case when v_start is null then 'term_start_not_established'
           when v_state_of = 'established' then 'term_months_unreadable'
           else coalesce(v_state_of,'agreement_not_read') end));
  end if;

  -- 5 - THE ESCALATION -- never read by this family, and the proposal says so rather than
  --     staying silent. A FROZEN questionnaire has eleven questions and none of them is a rent
  --     review; a person records it with their own basis.
  v_not_read := v_not_read || jsonb_build_array(jsonb_build_object(
    'term_key','escalation','reason','no_question_in_the_questionnaire'));

  return jsonb_build_object('document_id', p_document, 'client_id', v_client,
    'agreement_class', v_class, 'extraction_id', v_extraction,
    'proposed', v_proposed, 'not_read', v_not_read, 'reason', null);
end $t1137_propose_core$;

create or replace function clara._get_tenancy_escalation_revision_core(p_firm uuid, p_document uuid)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp
  as $t1137_escal_core$
declare c record; v_client uuid;
begin
  -- #1137 [0353]: the VIEWER floor and the caller's identity are resolved ABOVE this core --
  -- by the human door through clara._human_ctx, and by the model lane's wake door through
  -- clara.wake_context. The firm they resolved arrives as this function's FIRST argument and is
  -- the whole tenancy wall for both lanes; every line below is the human door's own, byte for byte.
  select p_firm as firm into c;
  select f.client_id into v_client from clara.document_filings f
   where f.document_id = p_document and f.firm_id = c.firm and f.retired_at is null
   order by f.filed_at desc limit 1;
  if v_client is null then
    raise exception 'document % is not a live filing in your firm', p_document using errcode='CLR11';
  end if;
  return clara._tenancy_escalation_state(p_document);
end $t1137_escal_core$;

create or replace function clara._get_rent_settlement_candidates_core(p_firm uuid, p_client uuid)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp
  as $t1137_rentcand_core$
declare c record;
begin
  -- #1137 [0353]: the BOOKKEEPER floor and the caller's identity are resolved ABOVE this core --
  -- by the human door through clara._human_ctx, and by the model lane's wake door through
  -- clara.wake_context. The firm they resolved arrives as this function's FIRST argument and is
  -- the whole tenancy wall for both lanes; every line below is the human door's own, byte for byte.
  select p_firm as firm into c;
  if not exists (select 1 from clara.clients cl where cl.id = p_client and cl.firm_id = c.firm) then
    raise exception 'client not in your firm' using errcode='CLR11';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'entry_id', u.entry_id, 'plan_id', u.plan_id, 'document_id', u.document_id,
        'filing_id', u.filing_id, 'posting_date', u.posting_date,
        'period_month', u.period_month, 'payable_account_code', u.payable_account_code,
        'rent_cents', u.rent_cents, 'unsettled_cents', u.unsettled_cents,
        -- THIRTY-FIVE DAYS, AND THE ROW SAYS SO (fix round, finding ADV-11). Rent recognised on
        -- the 5th and paid on the 25th is an ordinary Malaysian tenancy and was 20 days outside
        -- the payroll lane's ten-day window -- so the read showed "the payment has not appeared"
        -- with an empty list for a line clara.settle_rent_payable would have taken (that door
        -- applies no date window at all). A month either side covers the ordinary case without
        -- starting to offer unrelated payments of a round number, and the window travels ON the
        -- row so a person is never told less than was searched.
        'candidate_window_days', 35,
        'candidates', clara._rent_settlement_bank_candidates(
          p_client, u.unsettled_cents, u.posting_date, 35))
      order by u.posting_date, u.entry_id)
    from clara._rent_payable_unsettled(p_client) u
    where u.unsettled_cents > 0
  ), '[]'::jsonb);
end $t1137_rentcand_core$;

create or replace function clara._get_tenancy_deposit_coding_core(p_firm uuid, p_client uuid)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp
  as $t1137_deposit_core$
declare c record;
begin
  -- #1137 [0353]: the BOOKKEEPER floor and the caller's identity are resolved ABOVE this core --
  -- by the human door through clara._human_ctx, and by the model lane's wake door through
  -- clara.wake_context. The firm they resolved arrives as this function's FIRST argument and is
  -- the whole tenancy wall for both lanes; every line below is the human door's own, byte for byte.
  select p_firm as firm into c;
  if not exists (select 1 from clara.clients cl where cl.id = p_client and cl.firm_id = c.firm) then
    raise exception 'client not in your firm' using errcode='CLR11';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'document_id', d.document_id,
        'deposit_cents', d.deposit_cents,
        'printed_raw', d.printed_raw,
        'recorded_at', d.recorded_at,
        'basis_kind', d.basis_kind,
        'source_region_ids', d.source_region_ids,
        'term_start', to_char(d.term_start,'YYYY-MM-DD'),
        'proposed_account_code', '1120',
        'proposed_account_name', d.account_name,
        'proposed_account_in_chart', d.account_name is not null,
        'already_coded', d.allocated_cents >= d.deposit_cents,
        'coded_cents', d.allocated_cents,
        -- THE OFFER SAYS WHAT IT ALLOCATED, AND FROM WHAT (fix round, finding ADV-06). 1120
        -- Deposits Paid carries no subledger, so the only ledger fact available is the ACCOUNT's
        -- balance. The first cut compared that whole balance against EACH deposit on its own, so
        -- one coded deposit -- or an unrelated utility deposit booked to 1120 -- declared every
        -- other deposit already coded and withdrew the offer silently (DRIVEN in the review).
        -- The balance is now allocated oldest-deposit-first across the client's own recorded
        -- deposits, and both figures travel on the row so nobody has to guess which is which.
        'deposits_account_balance_cents', d.account_balance_cents,
        'coded_basis', 'account_balance_fifo',
        'deposits_sharing_account', d.deposit_count,
        'candidates', case when d.allocated_cents >= d.deposit_cents then '[]'::jsonb
          else clara._rent_settlement_bank_candidates(
                 p_client, d.deposit_cents,
                 coalesce(d.term_start, d.recorded_at::date), 60) end)
      order by d.recorded_at)
    from (
      select ct.document_id, ct.amount_cents as deposit_cents, ct.printed_raw, ct.recorded_at,
             ct.basis_kind, to_jsonb(ct.source_region_ids) as source_region_ids,
             (select s.term_date from clara.contract_terms s
               where s.document_id = ct.document_id and s.term_key = 'term_start'
                 and s.superseded_at is null) as term_start,
             (select a.name from clara.coa_accounts a
               where a.client_id = p_client and a.account_code = '1120' and a.is_active) as account_name,
             b.account_balance_cents,
             count(*) over () as deposit_count,
             -- THIS deposit's own FIFO share of the account balance: whatever is left after every
             -- OLDER recorded deposit has taken its share first.
             greatest(0, least(ct.amount_cents,
               b.account_balance_cents
                 - (sum(ct.amount_cents) over (order by ct.recorded_at, ct.id
                      rows between unbounded preceding and current row) - ct.amount_cents)
             )) as allocated_cents
        from clara.contract_terms ct
        cross join lateral (
          select coalesce((select sum(jl.debit_cents) - coalesce(sum(jl.credit_cents),0)
                             from clara.journal_lines jl
                             join clara.journal_entries je on je.id = jl.entry_id
                            where jl.account_code = '1120' and je.client_id = p_client
                              and je.status = 'approved' and je.reversed_by is null
                              and je.reversal_of is null), 0) as account_balance_cents) b
       where ct.client_id = p_client and ct.term_key = 'deposit' and ct.superseded_at is null
         and ct.amount_cents > 0
    ) d
  ), '[]'::jsonb);
end $t1137_deposit_core$;

-- =====================================================================================
-- §B — THE SIX HUMAN READ DOORS, RECUT AS THIN DELEGATES. Same signature, same return type, same
-- ACL, same envelope, same refusals. What changes is that the body each carried is now its core's.
-- The floor is still `clara._human_ctx`, the estate's one floor body, raising the same three
-- CLR04s — VIEWER for the four document reads, BOOKKEEPER for the two client reads, exactly as
-- 0300 wrote them.
-- =====================================================================================
create or replace function clara.get_contract_terms(p_document uuid)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp
  as $t1137_terms_human$
declare h record;
begin
  select * into h from clara._human_ctx(clara.role_rank('viewer'));
  return clara._get_contract_terms_core(h.firm, p_document);
end $t1137_terms_human$;

create or replace function clara.get_tenancy_rent_plan_draft(p_document uuid)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp
  as $t1137_draft_human$
declare h record;
begin
  select * into h from clara._human_ctx(clara.role_rank('viewer'));
  return clara._get_tenancy_rent_plan_draft_core(h.firm, p_document);
end $t1137_draft_human$;

create or replace function clara.propose_contract_terms(p_document uuid)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp
  as $t1137_propose_human$
declare h record;
begin
  select * into h from clara._human_ctx(clara.role_rank('viewer'));
  return clara._propose_contract_terms_core(h.firm, p_document);
end $t1137_propose_human$;

create or replace function clara.get_tenancy_escalation_revision(p_document uuid)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp
  as $t1137_escal_human$
declare h record;
begin
  select * into h from clara._human_ctx(clara.role_rank('viewer'));
  return clara._get_tenancy_escalation_revision_core(h.firm, p_document);
end $t1137_escal_human$;

create or replace function clara.get_rent_settlement_candidates(p_client uuid)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp
  as $t1137_rentcand_human$
declare h record;
begin
  select * into h from clara._human_ctx(clara.role_rank('bookkeeper'));
  return clara._get_rent_settlement_candidates_core(h.firm, p_client);
end $t1137_rentcand_human$;

create or replace function clara.get_tenancy_deposit_coding(p_client uuid)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp
  as $t1137_deposit_human$
declare h record;
begin
  select * into h from clara._human_ctx(clara.role_rank('bookkeeper'));
  return clara._get_tenancy_deposit_coding_core(h.firm, p_client);
end $t1137_deposit_human$;

-- =====================================================================================
-- §C — THE SIX MODEL-LANE READ DOORS. The shape is `clara.wake_get_client_financial_pack`
-- (0320 §C) and `clara.wake_list_review_queue` (0352 §F): resolve the wake context, refuse without
-- a credential, ask the allowlist, require a NAMED person, wall the credential's client pin, then
-- delegate. They add no floor of their own: `clara.wake_context` only returns a row when the
-- credential's `on_behalf_of` is an ACTIVE BOOKKEEPER+ of the credential's firm.
--
-- THE CLIENT-PIN ARM DIFFERS BY SHAPE, and both arms fail CLOSED. The two CLIENT-scoped reads
-- compare the pin against the argument, exactly as the bank wrappers do. The four DOCUMENT-scoped
-- reads cannot: they take no client, and resolving the document's client in order to compare it
-- would be an existence surface of its own. They REFUSE a pinned credential outright instead —
-- dormant today (the one allowlisted kind, `interactive`, is client-less by construction), and a
-- refusal rather than a silent pass is what a later file that allowlists `interactive_client` will
-- find.
-- =====================================================================================
create or replace function clara.wake_get_contract_terms(p_document uuid)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp
  as $t1137_terms_wake$
declare w record;
begin
  select * into w from clara.wake_context();
  if w.credential_id is null then
    raise exception 'no valid wake credential' using errcode = 'CLR03';
  end if;
  perform clara.assert_wake_allowed(w.wake_kind, 'wake_get_contract_terms');
  if w.on_behalf_of is null then
    raise exception 'this read rides a named person''s authority and this credential names none'
      using errcode = 'CLR03', detail = '{"reason":"wake_authority_absent","class":"on_behalf_of"}';
  end if;
  if w.client_id is not null then
    raise exception 'this read is scoped to a document, not to the client this credential is pinned to'
      using errcode = 'CLR03', detail = '{"reason":"credential_client_pin"}';
  end if;
  return clara._get_contract_terms_core(w.firm_id, p_document);
end $t1137_terms_wake$;

create or replace function clara.wake_get_tenancy_rent_plan_draft(p_document uuid)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp
  as $t1137_draft_wake$
declare w record;
begin
  select * into w from clara.wake_context();
  if w.credential_id is null then
    raise exception 'no valid wake credential' using errcode = 'CLR03';
  end if;
  perform clara.assert_wake_allowed(w.wake_kind, 'wake_get_tenancy_rent_plan_draft');
  if w.on_behalf_of is null then
    raise exception 'this read rides a named person''s authority and this credential names none'
      using errcode = 'CLR03', detail = '{"reason":"wake_authority_absent","class":"on_behalf_of"}';
  end if;
  if w.client_id is not null then
    raise exception 'this read is scoped to a document, not to the client this credential is pinned to'
      using errcode = 'CLR03', detail = '{"reason":"credential_client_pin"}';
  end if;
  return clara._get_tenancy_rent_plan_draft_core(w.firm_id, p_document);
end $t1137_draft_wake$;

create or replace function clara.wake_propose_contract_terms(p_document uuid)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp
  as $t1137_propose_wake$
declare w record;
begin
  select * into w from clara.wake_context();
  if w.credential_id is null then
    raise exception 'no valid wake credential' using errcode = 'CLR03';
  end if;
  perform clara.assert_wake_allowed(w.wake_kind, 'wake_propose_contract_terms');
  if w.on_behalf_of is null then
    raise exception 'this read rides a named person''s authority and this credential names none'
      using errcode = 'CLR03', detail = '{"reason":"wake_authority_absent","class":"on_behalf_of"}';
  end if;
  if w.client_id is not null then
    raise exception 'this read is scoped to a document, not to the client this credential is pinned to'
      using errcode = 'CLR03', detail = '{"reason":"credential_client_pin"}';
  end if;
  return clara._propose_contract_terms_core(w.firm_id, p_document);
end $t1137_propose_wake$;

create or replace function clara.wake_get_tenancy_escalation_revision(p_document uuid)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp
  as $t1137_escal_wake$
declare w record;
begin
  select * into w from clara.wake_context();
  if w.credential_id is null then
    raise exception 'no valid wake credential' using errcode = 'CLR03';
  end if;
  perform clara.assert_wake_allowed(w.wake_kind, 'wake_get_tenancy_escalation_revision');
  if w.on_behalf_of is null then
    raise exception 'this read rides a named person''s authority and this credential names none'
      using errcode = 'CLR03', detail = '{"reason":"wake_authority_absent","class":"on_behalf_of"}';
  end if;
  if w.client_id is not null then
    raise exception 'this read is scoped to a document, not to the client this credential is pinned to'
      using errcode = 'CLR03', detail = '{"reason":"credential_client_pin"}';
  end if;
  return clara._get_tenancy_escalation_revision_core(w.firm_id, p_document);
end $t1137_escal_wake$;

create or replace function clara.wake_get_rent_settlement_candidates(p_client uuid)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp
  as $t1137_rentcand_wake$
declare w record;
begin
  select * into w from clara.wake_context();
  if w.credential_id is null then
    raise exception 'no valid wake credential' using errcode = 'CLR03';
  end if;
  perform clara.assert_wake_allowed(w.wake_kind, 'wake_get_rent_settlement_candidates');
  if w.on_behalf_of is null then
    raise exception 'this read rides a named person''s authority and this credential names none'
      using errcode = 'CLR03', detail = '{"reason":"wake_authority_absent","class":"on_behalf_of"}';
  end if;
  -- DORMANT TODAY: the one allowlisted kind is `interactive`, whose client_id is NULL by
  -- construction. Written anyway because the bank wrappers carry it for the pinned kinds
  -- (0121/0130) and a later file that allowlists `interactive_client` must not have to remember.
  if w.client_id is not null and p_client is distinct from w.client_id then
    raise exception 'that is not the client this credential is pinned to' using errcode = 'CLR11',
      detail = '{"reason":"credential_client_pin"}';
  end if;
  return clara._get_rent_settlement_candidates_core(w.firm_id, p_client);
end $t1137_rentcand_wake$;

create or replace function clara.wake_get_tenancy_deposit_coding(p_client uuid)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp
  as $t1137_deposit_wake$
declare w record;
begin
  select * into w from clara.wake_context();
  if w.credential_id is null then
    raise exception 'no valid wake credential' using errcode = 'CLR03';
  end if;
  perform clara.assert_wake_allowed(w.wake_kind, 'wake_get_tenancy_deposit_coding');
  if w.on_behalf_of is null then
    raise exception 'this read rides a named person''s authority and this credential names none'
      using errcode = 'CLR03', detail = '{"reason":"wake_authority_absent","class":"on_behalf_of"}';
  end if;
  if w.client_id is not null and p_client is distinct from w.client_id then
    raise exception 'that is not the client this credential is pinned to' using errcode = 'CLR11',
      detail = '{"reason":"credential_client_pin"}';
  end if;
  return clara._get_tenancy_deposit_coding_core(w.firm_id, p_client);
end $t1137_deposit_wake$;

-- =====================================================================================
-- §D — clara._revise_accounting_plan_core — 0193'S OWN REVISION BODY, WITH THE ACTOR AND THE FIRM
-- AS ARGUMENTS. Every lock, every alignment wall, every catch-up wall and every refusal is that
-- body's own, derived and pinned; the ONE anchored change is the actor ladder, which moves up into
-- the human delegate and is replaced by a firm-walled re-resolution of the plan.
--
-- WHY THIS FILE TOUCHES 0193 AT ALL. The tenancy escalation's confirmation ENDS in a plan
-- revision, and that door resolves its caller through `clara._plan_door_ctx` -> `clara._human_ctx`
-- -> `clara.jwt_sub()`. The OBO lane carries no JWT. The alternative was a machine-side copy of
-- 8.7 kB of concurrency-critical logic — two advisory rungs, a row lock, a re-read under it, the
-- alignment wall, the catch-up wall — and a second copy of THAT is a second place for a posting
-- race to be forgotten. One body, two entrances.
-- =====================================================================================
create or replace function clara._revise_accounting_plan_core(
    p_firm uuid, p_actor uuid, p_plan uuid, p_frequency text, p_day_rule text,
    p_day_of_month integer, p_timezone text, p_effective_from date, p_effective_to date,
    p_basis jsonb, p_reversal_day_rule text, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp
  as $t1137_revise_core$
declare
  v_actor uuid; v_firm uuid; v_ctx record; p clara.accounting_plans; cur record;
  v_dedupe jsonb; v_digest text; v_auto boolean; v_rev uuid; v_next int; v_result jsonb;
  v_covered date; v_first date; v_earliest date;
begin
  if p_op_key is null or p_op_key ~ '^\s*$' then
    raise exception 'revising an accounting plan requires its idempotency key' using errcode='CLR10',
      detail='{"reason":"invalid_op_key","constraint":"nonempty"}';
  end if;
  -- #1137 [0353]: the BOOKKEEPER floor and the caller's identity are resolved ABOVE this core --
  -- by clara.revise_accounting_plan (the human door, through clara._plan_door_ctx) and by the
  -- tenancy lane's OBO confirmation (through a LIVE re-check of the named author's membership).
  -- The plan is re-resolved here under the firm they resolved, so a plan outside the caller's firm
  -- answers clara._plan_door_ctx's OWN CLR11, word for word, on both lanes -- and no existence
  -- oracle opens, because the firm predicate is part of the lookup exactly as it is there.
  v_actor := p_actor; v_firm := p_firm;
  select * into p from clara.accounting_plans where id = p_plan and firm_id = p_firm;
  if p.id is null then
    raise exception 'accounting plan not found in your firm' using errcode='CLR11',
      detail='{"reason":"plan_not_found"}';
  end if;
  if p.status = 'ended' then
    raise exception 'an ended accounting plan cannot be revised' using errcode='CLR10',
      detail='{"reason":"plan_ended"}';
  end if;
  perform clara._assert_plan_schedule(p.kind, p_frequency, p_day_rule, p_day_of_month, p_timezone,
    p_effective_from, p_effective_to, p_reversal_day_rule);
  -- THE AUTHORITY FLOOR (review finding B3). A revision changes the SCHEDULE; it cannot move the
  -- day a human authorised this plan from. Without this, a plan created with today's authority
  -- could be revised to 2020 and then "catch up" a decade of back-dated Work — the catch-up wall
  -- reads the live revision, and the live revision was whatever the last caller said.
  if p_effective_from < p.authority_from then
    raise exception 'this plan was authorised from %; a revision cannot start earlier',
      to_char(p.authority_from,'YYYY-MM-DD')
      using errcode='CLR10',
        detail=jsonb_build_object('reason','effective_from_before_authority',
          'authority_from', to_char(p.authority_from,'YYYY-MM-DD'),
          'requested_from', to_char(p_effective_from,'YYYY-MM-DD'))::text;
  end if;
  perform clara._assert_journal_basis(p_basis);
  v_digest := clara._journal_basis_digest(p_basis);
  v_auto := (p.kind = 'reversing_journal');

  v_dedupe := clara._reserve_op(v_firm, 'revise_accounting_plan', p_op_key,
    clara._hash(jsonb_build_object('plan', p_plan, 'frequency', p_frequency, 'day_rule', p_day_rule,
      'day_of_month', p_day_of_month, 'timezone', p_timezone, 'effective_from', p_effective_from,
      'effective_to', p_effective_to, 'digest', v_digest)));
  if v_dedupe is not null then
    if v_dedupe ? 'pending' then
      raise exception 'this revision key is held by an in-flight sibling' using errcode='CLR13',
        detail='{"reason":"operation_in_flight"}';
    end if;
    return v_dedupe;
  end if;

  -- #929 (fix round, ADV-L05-04): THE CLIENT RUNG, 203005004 -- the same rung
  -- clara.retire_adjustment_template and fifty other client-scoped bodies already take. Without it
  -- two sessions creating overlapping plans for ONE client each read the other's row as
  -- uncommitted and BOTH answered null; under this rung the second one waits and then sees the
  -- first, so the advisory answers the same thing concurrently that it answers in sequence.
  -- PLACED by 0037 SECTION K's own order (op-receipt -> advisory rung) and above every
  -- clara.accounting_plans row lock in this body. Censused on the live catalog before it was
  -- added: of the fifty-one bodies that take 203005004, not one reads or locks
  -- clara.accounting_plans, so the only new pair is "rung -> plan row" and no body anywhere holds
  -- a plan row while waiting for this rung. Advisory xact locks are re-entrant, so the outer
  -- accrual and prepayment doors re-taking it through this one cost nothing.
  perform pg_advisory_xact_lock(203005004, hashtext(p.client_id::text));

  -- RUNG 1, so a revision and a scan cannot interleave: the scan reads the live revision under
  -- this same lock and therefore sees exactly one of the two states.
  perform 1 from clara.accounting_plans where id = p_plan for update;
  -- …AND THE STATUS IS RE-READ UNDER IT (review finding S4). The test above was made on an
  -- UNLOCKED read, so an `end_accounting_plan` committing in the window between the two could hand
  -- an ended plan a fresh live revision. pause/resume/end all re-read under this lock; so does this.
  select * into p from clara.accounting_plans where id = p_plan;
  if p.status = 'ended' then
    raise exception 'an ended accounting plan cannot be revised' using errcode='CLR10',
      detail='{"reason":"plan_ended"}';
  end if;
  select * into cur from clara.accounting_plan_revisions where plan_id = p_plan and superseded_at is null;
  if not found then
    raise exception 'this plan has no live revision to supersede' using errcode='CLR13',
      detail='{"reason":"no_live_revision"}';
  end if;
  -- THE ALIGNMENT WALL (review finding SHOULD-1). A frequency change RE-ALIGNS every period key,
  -- and `unique (plan_id, leg, period_key)` is exact per alignment and blind across alignments: a
  -- monthly September (`2026-09-01`) and a quarterly August-to-October (`2026-08-01`) are two
  -- different keys naming one September, so a plan that had already posted September posted it
  -- again on the very next scan. Measured in BOTH directions. Refused rather than clamped, and
  -- named: a revision whose new alignment's FIRST period would start on or before the end of the
  -- last period this plan has already run is asking for a second entry in a period that has one.
  --
  -- IT IS THE FREQUENCY CHANGE THAT IS WALLED, not every revision: with the frequency unchanged
  -- the alignment is unchanged, and review finding B1's `period_already_admitted` already binds a
  -- moved due DAY inside a period that has run.
  if p_frequency is distinct from cur.frequency then
    v_covered := clara._plan_covered_through(p_plan);
    if v_covered is not null then
      v_first := clara._plan_period_start(p.authority_from, p_frequency, p_effective_from);
      if v_first <= v_covered then
        -- THE DATE THE REFUSAL OFFERS IS ONE THIS SAME WALL WOULD ACCEPT, computed rather than
        -- guessed: `covered_through + 1` can still fall INSIDE a new-alignment period that began
        -- earlier (a quarterly period starting in July covers a September that a monthly schedule
        -- covered through August), and advertising a date that would be refused again is worse
        -- than advertising none.
        v_earliest := clara._plan_period_start(p.authority_from, p_frequency, v_covered + 1);
        if v_earliest <= v_covered then
          v_earliest := (v_earliest + (case p_frequency when 'monthly' then 1
                                                        when 'quarterly' then 3 else 12 end)
                         * interval '1 month')::date;
        end if;
        raise exception 'this plan has already run through %; a % schedule starting % would cover the period beginning % a second time',
          to_char(v_covered,'YYYY-MM-DD'), p_frequency, to_char(p_effective_from,'YYYY-MM-DD'),
          to_char(v_first,'YYYY-MM-DD')
          using errcode='CLR10',
            detail=jsonb_build_object('reason','period_already_covered',
              'covered_through', to_char(v_covered,'YYYY-MM-DD'),
              'period_start', to_char(v_first,'YYYY-MM-DD'),
              'frequency', p_frequency,
              'earliest_effective_from', to_char(v_earliest,'YYYY-MM-DD'))::text;
      end if;
    end if;
  end if;

  v_next := cur.revision + 1;
  update clara.accounting_plan_revisions set superseded_at = now(), superseded_by = v_actor
   where id = cur.id;
  insert into clara.accounting_plan_revisions(plan_id, firm_id, client_id, plan_kind, revision,
      frequency, day_rule, day_of_month, timezone, effective_from, effective_to, basis,
      basis_digest, auto_reverse, reversal_day_rule, created_by)
    values (p_plan, p.firm_id, p.client_id, p.kind, v_next, p_frequency, p_day_rule, p_day_of_month,
      p_timezone, p_effective_from, p_effective_to, p_basis, v_digest, v_auto,
      case when v_auto then coalesce(p_reversal_day_rule,'next_period_first_day') else null end,
      v_actor)
    returning id into v_rev;
  update clara.accounting_plans set current_revision = v_next where id = p_plan;

  perform clara._audit(v_firm, v_actor, null, null, 'revise_accounting_plan', null,
    jsonb_build_object('plan', p_plan, 'revision', v_next, 'superseded', cur.revision,
      'op_key', p_op_key));
  v_result := jsonb_build_object('plan_id', p_plan, 'revision_id', v_rev, 'revision', v_next,
    'superseded_revision', cur.revision, 'status', p.status,
    -- #929 (fix round, ADV-L05-03): self-exclusion by identity -- this plan's own id, not the
    -- basis value it happens to carry (which a sibling may carry byte-identically).
    'overlap_warning', clara._plan_overlap_warning(p.client_id, p_basis, p_plan));
  return clara._finish_op(v_firm, 'revise_accounting_plan', p_op_key, v_result);
end $t1137_revise_core$;

-- =====================================================================================
-- §E — clara.revise_accounting_plan — THE HUMAN DOOR, NOW A DELEGATE. Its signature, its ACL, its
-- floor, its refusals and its answer are unchanged, and the ORDER of its two own walls is 0193's:
-- the op key first (a call with no key cannot be made idempotent by anything that follows), then
-- the identity through `clara._plan_door_ctx`, which is still the body that takes the bookkeeper
-- floor and walls the plan to the caller's firm.
-- =====================================================================================
create or replace function clara.revise_accounting_plan(
    p_plan uuid, p_frequency text, p_day_rule text, p_day_of_month integer, p_timezone text,
    p_effective_from date, p_effective_to date, p_basis jsonb, p_reversal_day_rule text,
    p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp
  as $t1137_revise_human$
declare v_ctx record;
begin
  if p_op_key is null or p_op_key ~ '^\s*$' then
    raise exception 'revising an accounting plan requires its idempotency key' using errcode='CLR10',
      detail='{"reason":"invalid_op_key","constraint":"nonempty"}';
  end if;
  select * into v_ctx from clara._plan_door_ctx(p_plan, clara.role_rank('bookkeeper')) c;
  return clara._revise_accounting_plan_core(v_ctx.firm, v_ctx.actor, p_plan, p_frequency,
    p_day_rule, p_day_of_month, p_timezone, p_effective_from, p_effective_to, p_basis,
    p_reversal_day_rule, p_op_key);
end $t1137_revise_human$;

-- =====================================================================================
-- §F — clara._tenancy_plan_core — THE PLAN STEP THE OBO CONFIRMATION TAKES.
--
-- WHY IT EXISTS AT ALL. `clara.create_accounting_plan` (0193) resolves its actor through
-- `clara._human_ctx` -> `clara.jwt_sub()`, and a `clara_runtime` connection carries no
-- `request.jwt.claims`: nesting it from the OBO door would raise CLR04 `no authenticated actor` on
-- every call. `clara.create_accrual_adjustment_for` met this in 0222 and answered it with
-- `clara._accrual_plan_core`; `clara.create_prepayment_schedule_for` met it in 0307 and answered it
-- with `clara._prepayment_plan_core`, which 0308 generalised into `clara._obo_plan_core`.
--
-- WHY IT IS NOT A LINE IN `clara._obo_plan_core`, WHICH IS WHERE IT BELONGS. That body already
-- admits `contract_confirmation` authority and is parameterised by kind; widening its closed kind
-- set to `recurring_journal` would be the right change and it is TWO LINES. It is not made here
-- because lane L1 of THIS SAME WAVE recuts that body (#1051, pre `2049c1c4` -> post `149b4a3d`,
-- and #1080 after it), and the sweep's own grouping rule is that no database body is written in
-- one lane and written or pinned in another: a second recut of one body in one wave collides at
-- integration, and a prestate pinned to a sha another lane is about to change refuses this
-- migration for a change that is not a defect. So this file adds a body and files the follow-up
-- rather than reaching into another lane's. THE FOLLOW-UP IS NAMED IN `packages/db/README.md`:
-- once #1051 and #1080 have landed, `clara._obo_plan_core` should absorb `recurring_journal` and
-- this body should become a two-line caller of it.
--
-- WHAT IT IS NOT. It is not a second plan door. It is UNGRANTED (the one-ungranted-core law,
-- 0004:6-12), reachable only from a definer body, it takes NO op key of its own (the outer
-- confirmation's key already covers the whole act), and it admits ONE kind — `recurring_journal`,
-- as a literal, never an argument.
--
-- WHAT IT COPIES FROM 0193'S DOOR, and why each line is here rather than skipped:
--   · the authority SHAPE ladder (rule / kind / object / ref-kind / ref-id) — the OBO lane must
--     answer the same `authority_ref_invalid` constraints the human lane answers, or "the twin's
--     refusal vocabulary matches the human door's" is false at the first argument a chat tool gets
--     wrong;
--   · the RESOLUTION through `clara._authority_ref_refusal` — #977/0250's ONE definition of "a
--     person's instruction", so the OBO lane answers exactly what 0193's door answers;
--   · `clara._assert_plan_schedule` and `clara._assert_journal_basis` — so an OBO confirmation can
--     never write a plan the human lane would refuse;
--   · the CLIENT RUNG `pg_advisory_xact_lock(203005004, hashtext(client))` — #929's own rung.
--     Advisory xact locks are re-entrant, so the outer confirmation re-taking it costs nothing;
--   · the self-exclusion by IDENTITY in the overlap warning (#929 ADV-L05-03).
--
-- WHAT IT DOES NOT COPY: the op-key reservation and the `clara._finish_op` stamp, the `_human_ctx`
-- ladder, the client firm/status ladder (the confirmation core resolved all three above it), and
-- the `plan_kind_unsupported` wall (the kind is a literal here, not an argument).
-- =====================================================================================
create or replace function clara._tenancy_plan_core(
    p_firm uuid, p_client uuid, p_author uuid, p_purpose text, p_authority_kind text,
    p_authority_ref jsonb, p_frequency text, p_day_rule text, p_day_of_month integer,
    p_timezone text, p_effective_from date, p_effective_to date, p_basis jsonb)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp
  as $t1137_plan_core$
declare
  v_plan uuid; v_rev uuid; v_digest text; v_ref_kind text; v_ref_id uuid; v_reason text;
  v_warning jsonb; v_next jsonb;
begin
  -- THE AUTHORITY SHAPE, verbatim from clara.create_accounting_plan.
  if p_authority_kind = 'authority_rule' then
    raise exception 'an authority rule cannot yet authorise a plan; record the explicit instruction instead'
      using errcode='CLR10', detail='{"reason":"authority_rule_unsupported"}';
  end if;
  if p_authority_kind is distinct from 'explicit_instruction' then
    raise exception 'unknown plan authority kind %', coalesce(p_authority_kind,'(null)')
      using errcode='CLR10', detail='{"reason":"invalid_authority_kind"}';
  end if;
  if p_authority_ref is null or jsonb_typeof(p_authority_ref) <> 'object' then
    raise exception 'a plan authority names the instruction that carries it'
      using errcode='CLR10', detail='{"reason":"authority_ref_invalid","constraint":"object"}';
  end if;
  v_ref_kind := p_authority_ref ->> 'kind';
  if v_ref_kind is null or v_ref_kind not in ('accounting_work','chat_task','contract_confirmation') then
    raise exception 'a plan authority reference names an accounting_work, a chat_task or a contract_confirmation'
      using errcode='CLR10', detail='{"reason":"authority_ref_invalid","constraint":"kind"}';
  end if;
  begin
    v_ref_id := (p_authority_ref ->> 'id')::uuid;
  exception when others then
    v_ref_id := null;
  end;
  if v_ref_id is null then
    raise exception 'a plan authority reference names a row by id'
      using errcode='CLR10', detail='{"reason":"authority_ref_invalid","constraint":"id"}';
  end if;
  -- RESOLVED, not merely well-shaped (#977, 0250). The row this plan cites is the
  -- clara.contract_plan_confirmations row the confirmation inserted a moment ago, whose
  -- confirmed_by is NOT NULL and is the named bookkeeper -- a person's instruction, which an agent
  -- run cannot manufacture, because the only two writers of that table are the two confirmations
  -- and both of them name a live bookkeeper of this firm.
  v_reason := clara._authority_ref_refusal(v_ref_kind, v_ref_id, p_firm, p_client);
  if v_reason = 'authority_ref_not_human_instruction' then
    raise exception 'the instruction this plan cites is not a person''s instruction'
      using errcode='CLR10',
        detail=jsonb_build_object('reason',v_reason,'kind',v_ref_kind,'id',v_ref_id)::text;
  elsif v_reason is not null then
    raise exception 'the instruction this plan cites does not exist for this client'
      using errcode='CLR10',
        detail=jsonb_build_object('reason',v_reason,'kind',v_ref_kind,'id',v_ref_id)::text;
  end if;

  if p_purpose is null or btrim(p_purpose) = '' then
    raise exception 'an accounting plan needs a purpose' using errcode='CLR10',
      detail='{"reason":"invalid_purpose","constraint":"nonempty"}';
  end if;
  perform clara._assert_plan_schedule('recurring_journal', p_frequency, p_day_rule,
    p_day_of_month, p_timezone, p_effective_from, p_effective_to, null);
  perform clara._assert_journal_basis(p_basis);
  v_digest := clara._journal_basis_digest(p_basis);

  perform pg_advisory_xact_lock(203005004, hashtext(p_client::text));

  v_plan := gen_random_uuid();
  insert into clara.accounting_plans(id, firm_id, client_id, kind, status, purpose, authority_kind,
      authority_ref, authorised_by, authority_from, current_revision, created_by)
    values (v_plan, p_firm, p_client, 'recurring_journal', 'active', btrim(p_purpose),
      p_authority_kind, p_authority_ref, p_author, p_effective_from, 1, p_author);
  insert into clara.accounting_plan_revisions(plan_id, firm_id, client_id, plan_kind, revision,
      frequency, day_rule, day_of_month, timezone, effective_from, effective_to, basis,
      basis_digest, auto_reverse, reversal_day_rule, created_by)
    values (v_plan, p_firm, p_client, 'recurring_journal', 1, p_frequency, p_day_rule,
      p_day_of_month, p_timezone, p_effective_from, p_effective_to, p_basis, v_digest, false,
      null, p_author)
    returning id into v_rev;

  v_warning := clara._plan_overlap_warning(p_client, p_basis, v_plan);
  select jsonb_agg(jsonb_build_object('due_date', to_char(e.due_date,'YYYY-MM-DD'), 'leg', e.leg)
           order by e.due_date) into v_next
    from clara._plan_due_events(p_effective_from, p_frequency, p_day_rule, p_day_of_month, false,
           p_effective_from, coalesce(p_effective_to, (p_effective_from + 3650)), 3) e;

  -- THE AUDIT ROW IS 0193'S OWN VERB with this entrance's `via`, exactly as 0222's and 0308's
  -- cores stamp their own: the trail says a plan was created and by WHICH entrance, and a reader
  -- can tell an OBO confirmation from a human one without joining anything.
  perform clara._audit(p_firm, p_author, null, null, 'create_accounting_plan', null,
    jsonb_build_object('client', p_client, 'plan', v_plan, 'kind', 'recurring_journal',
      'revision', 1, 'authority', p_authority_ref, 'via', 'confirm_tenancy_rent_plan_for'));

  return jsonb_build_object('plan_id', v_plan, 'revision_id', v_rev, 'revision', 1,
    'status', 'active', 'kind', 'recurring_journal',
    'next_occurrences', coalesce(v_next,'[]'::jsonb), 'overlap_warning', v_warning);
end $t1137_plan_core$;

-- =====================================================================================
-- §G — THE TWO CONFIRMATION CORES. Each is its human door's OWN body with the firm, the actor and
-- the LANE lifted into arguments. Derived and pinned on both sides of the apply; ungranted.
-- =====================================================================================
create or replace function clara._confirm_tenancy_rent_plan_core(
    p_firm uuid, p_actor uuid, p_lane text, p_client uuid, p_document uuid,
    p_rent_account text, p_payable_account text, p_judgement text, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp
  as $t1137_confirm_core$
declare
  c record; v_dedupe jsonb; v_firm uuid; v_filing uuid; v_kind text;
  v_draft jsonb; v_tr jsonb; v_plan jsonb; v_refusal jsonb; v_existing record;
  v_judgement text; v_confirmation uuid; v_purpose text; v_created jsonb;
begin
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'confirming a rent plan requires its idempotency key' using errcode='CLR10',
      detail='{"reason":"invalid_op_key","constraint":"nonempty"}';
  end if;
  -- #1137 [0353]: the BOOKKEEPER floor and the caller's identity are resolved ABOVE this core --
  -- by the human door through clara._human_ctx, and by the OBO twin through a LIVE re-check of the
  -- named author's own membership of this firm. The firm and the actor they resolved arrive as
  -- this function's first two arguments; every line below is the human door's own, byte for byte.
  select p_firm as firm, p_actor as actor into c;
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  if v_firm is null or v_firm <> c.firm then
    raise exception 'client is not in your firm' using errcode='CLR11';
  end if;
  select f.id into v_filing from clara.document_filings f
   where f.document_id = p_document and f.client_id = p_client and f.firm_id = c.firm
     and f.retired_at is null
   order by f.filed_at desc limit 1;
  if v_filing is null then
    raise exception 'document % is not a live filing of this client', p_document using errcode='CLR11';
  end if;
  select d.document_kind into v_kind from clara.documents d where d.id = p_document;
  if v_kind is distinct from 'agreement_contract' then
    raise exception 'a rent plan is confirmed against an agreement contract, not a %', coalesce(v_kind,'(unclassified)')
      using errcode='CLR10',
        detail=jsonb_build_object('reason','confirm_wrong_kind','kind',v_kind)::text;
  end if;

  v_judgement := nullif(btrim(coalesce(p_judgement,'')),'');

  v_dedupe := clara._reserve_op(c.firm, 'confirm_tenancy_rent_plan', p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'document', p_document,
      'rent_account', p_rent_account, 'payable_account', p_payable_account,
      'judgement', v_judgement)));
  if v_dedupe is not null then return v_dedupe; end if;

  perform pg_advisory_xact_lock(203005004, hashtext(p_client::text));

  -- ALREADY RUNNING? Derived from the confirmation the live plan cites, never a marker.
  select * into v_existing from clara._tenancy_rent_plan(p_document);
  if v_existing.plan_id is not null then
    raise exception 'this tenancy already runs a rent plan; revise or end that plan rather than confirming a second'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','rent_plan_already_confirmed',
          'plan_id', v_existing.plan_id, 'plan_status', v_existing.status,
          'confirmation_id', v_existing.confirmation_id)::text;
  end if;

  -- ONE LIVE RENT PLAN PER PAYABLE ACCOUNT (fix round, finding ADV-03). The open-rent read is a
  -- FIFO over the payable ACCOUNT's own balance, because 2050 has no subledger -- so two live
  -- tenancies pointed at one account share a single payment pool and each other's months. The
  -- first cut refused only a second plan on the SAME DOCUMENT, which let exactly that in. The
  -- remedy is the accountant's own choice the owner's ruling already gives them: point the second
  -- tenancy at its own liability account. Named refusal, carrying the tenancy that holds it.
  select cf.document_id, cf.id as confirmation_id, p.id as plan_id into v_existing
    from clara.contract_plan_confirmations cf
    join clara.accounting_plans p
      on p.authority_ref->>'kind' = 'contract_confirmation'
     and nullif(p.authority_ref->>'id','')::uuid = cf.id
   where cf.client_id = p_client and cf.kind = 'rent_plan' and p.status <> 'ended'
     and cf.payable_account_code = coalesce(nullif(btrim(coalesce(p_payable_account,'')),''), '2050')
   order by cf.confirmed_at desc limit 1;
  if v_existing.plan_id is not null then
    raise exception 'account % already carries another tenancy''s live rent plan; a second plan on one payable account would share its payments month for month -- give this tenancy its own liability account', coalesce(nullif(btrim(coalesce(p_payable_account,'')),''), '2050')
      using errcode='CLR10',
        detail=jsonb_build_object('reason','payable_account_in_use',
          'payable_account_code', coalesce(nullif(btrim(coalesce(p_payable_account,'')),''), '2050'),
          'plan_id', v_existing.plan_id, 'document_id', v_existing.document_id,
          'confirmation_id', v_existing.confirmation_id)::text;
  end if;

  v_draft := clara._tenancy_rent_plan_draft(p_client, p_document, p_rent_account, p_payable_account);
  v_tr := v_draft->'treatment';

  select value into v_refusal from jsonb_array_elements(v_draft->'refusals')
   where value->>'reason' = 'plan_credits_bank_account' limit 1;
  if v_refusal is not null then
    raise exception 'a rent plan may not credit % -- it is one of this client''s own bank accounts, and a plan that pays itself out of the bank double-counts the statement line that pays it', v_refusal->'detail'->>'account_code'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','plan_credits_bank_account',
          'account_code', v_refusal->'detail'->>'account_code',
          'account_name', v_refusal->'detail'->>'account_name')::text;
  end if;
  select value into v_refusal from jsonb_array_elements(v_draft->'refusals')
   where value->>'reason' = 'account_not_in_chart' limit 1;
  if v_refusal is not null then
    raise exception 'account % is not in this client''s chart (or is inactive); add it before confirming the plan', v_refusal->'detail'->>'account_code'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','account_not_in_chart',
          'account_code', v_refusal->'detail'->>'account_code',
          'role', v_refusal->'detail'->>'role')::text;
  end if;

  v_plan := v_draft->'plan';
  if v_plan is null or jsonb_typeof(v_plan) <> 'object' then
    raise exception 'there is no rent plan to confirm: %', coalesce(v_tr->>'question','the tenancy''s terms are not complete')
      using errcode='CLR10',
        detail=jsonb_build_object('reason', coalesce(v_tr->>'reason','terms_incomplete'),
          'missing_terms', v_tr->'missing_terms')::text;
  end if;

  -- THE BRANCH ASKED -> A WRITTEN JUDGEMENT IS OWED (the owner's ruling, and "beta, nothing
  -- dark": a compliance gate PROMPTS, it never disables). The message is the branch's OWN
  -- question, so the sentence on screen and the decision the lane took come out of one body.
  if (v_tr->>'drafts')::boolean is not true and v_judgement is null then
    raise exception '%', v_tr->>'question'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','professional_judgement_required',
          'treatment_reason', v_tr->>'reason', 'standard', v_tr->>'standard')::text;
  end if;

  v_confirmation := gen_random_uuid();
  insert into clara.contract_plan_confirmations(id, firm_id, client_id, document_id, kind,
      monthly_rent_cents, rent_account_code, payable_account_code, term_start, term_end,
      treatment, professional_judgement, confirmed_by)
    values (v_confirmation, c.firm, p_client, p_document, 'rent_plan',
      (v_plan->>'monthly_rent_cents')::bigint,
      v_plan->>'rent_account_code', v_plan->>'payable_account_code',
      (v_plan->>'effective_from')::date, (v_plan->>'effective_to')::date,
      v_tr, v_judgement, c.actor);

  v_purpose := left((v_plan->>'purpose')
    || case when v_judgement is null then ''
            else format(' (confirmed on a professional judgement under %s)',
                        coalesce(v_tr->>'standard','the applicable framework')) end, 300);

  -- THE PLAN LANE'S OWN DOOR, called rather than re-implemented: every schedule check, every
  -- overlap advisory, every idempotency and locking rule 0193 carries applies to this plan
  -- unchanged. The authority it cites is the row inserted a moment ago.
  -- #1137 [0353]: ONE plan step per lane, and this branch is the ONLY difference between them.
  -- The HUMAN lane still calls clara.create_accounting_plan (0193) -- the granted plan door, with
  -- its own op key, its own receipt and whatever wall the plan lane adds next; nothing about the
  -- human entrance changes. The OBO lane cannot call it: that door resolves its actor through
  -- clara._human_ctx -> clara.jwt_sub(), and a clara_runtime connection carries no
  -- request.jwt.claims at all, so nesting it would raise CLR04 `no authenticated actor` on every
  -- call. It takes clara._tenancy_plan_core instead, with the named author in an argument --
  -- #915's own answer to exactly this problem (0307 §A, clara._prepayment_plan_core).
  -- THE BRANCH TESTS FOR `obo` AND NOT FOR `human`, so an unknown lane takes the JWT path and
  -- fails CLOSED (CLR04 `no authenticated actor`) rather than writing a plan with no receipt.
  if p_lane = 'obo' then
    v_created := clara._tenancy_plan_core(
      p_firm => c.firm,
      p_client => p_client,
      p_author => c.actor,
      p_purpose => v_purpose,
      p_authority_kind => 'explicit_instruction',
      p_authority_ref => jsonb_build_object('kind','contract_confirmation','id',v_confirmation),
      p_frequency => v_plan->>'frequency',
      p_day_rule => v_plan->>'day_rule',
      p_day_of_month => nullif(v_plan->>'day_of_month','')::int,
      p_timezone => v_plan->>'timezone',
      p_effective_from => (v_plan->>'effective_from')::date,
      p_effective_to => (v_plan->>'effective_to')::date,
      p_basis => v_plan->'basis');
  else
    v_created := clara.create_accounting_plan(
      p_client => p_client,
      p_kind => 'recurring_journal',
      p_purpose => v_purpose,
      p_authority_kind => 'explicit_instruction',
      p_authority_ref => jsonb_build_object('kind','contract_confirmation','id',v_confirmation),
      p_frequency => v_plan->>'frequency',
      p_day_rule => v_plan->>'day_rule',
      p_day_of_month => nullif(v_plan->>'day_of_month','')::int,
      p_timezone => v_plan->>'timezone',
      p_effective_from => (v_plan->>'effective_from')::date,
      p_effective_to => (v_plan->>'effective_to')::date,
      p_basis => v_plan->'basis',
      p_reversal_day_rule => null,
      p_op_key => p_op_key || ':plan');
  end if;

  -- #1137 [0353]: the LANE travels on the audit row, exactly as 0222, 0307 and 0308 stamp `via`
  -- on theirs -- so a reader can tell a confirmation taken in a conversation from one taken on the
  -- Contract page without joining anything. The ACTOR is the named person either way: that is what
  -- an on-behalf-of act means, and clara.contract_plan_confirmations.confirmed_by says so too.
  perform clara._audit(c.firm, c.actor, null, null, 'confirm_tenancy_rent_plan', null,
    jsonb_build_object('via', case p_lane when 'obo' then 'confirm_tenancy_rent_plan_for' else 'confirm_tenancy_rent_plan' end,
      'client', p_client, 'document', p_document,
      'confirmation', v_confirmation, 'plan', v_created->>'plan_id',
      'treatment_reason', v_tr->>'reason', 'standard', v_tr->>'standard',
      'judgement_given', v_judgement is not null));

  return clara._finish_op(c.firm, 'confirm_tenancy_rent_plan', p_op_key,
    jsonb_build_object('document_id', p_document, 'client_id', p_client,
      'confirmation_id', v_confirmation,
      'plan_id', v_created->>'plan_id', 'revision_id', v_created->>'revision_id',
      'status', v_created->>'status',
      'occurrences', v_plan->'occurrences',
      'next_occurrences', v_created->'next_occurrences',
      'overlap_warning', v_created->'overlap_warning',
      'treatment', v_tr, 'professional_judgement', v_judgement));
end $t1137_confirm_core$;

create or replace function clara._confirm_tenancy_rent_plan_revision_core(
    p_firm uuid, p_actor uuid, p_lane text, p_client uuid, p_document uuid,
    p_judgement text, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp
  as $t1137_revconfirm_core$
declare
  c record; v_dedupe jsonb; v_firm uuid; v_state jsonb; v_tr jsonb; v_rev jsonb;
  v_judgement text; v_confirmation uuid; v_plan record; v_result jsonb;
begin
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'revising a rent plan requires its idempotency key' using errcode='CLR10',
      detail='{"reason":"invalid_op_key","constraint":"nonempty"}';
  end if;
  -- #1137 [0353]: the BOOKKEEPER floor and the caller's identity are resolved ABOVE this core --
  -- by the human door through clara._human_ctx, and by the OBO twin through a LIVE re-check of the
  -- named author's own membership of this firm. The firm and the actor they resolved arrive as
  -- this function's first two arguments; every line below is the human door's own, byte for byte.
  select p_firm as firm, p_actor as actor into c;
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  if v_firm is null or v_firm <> c.firm then
    raise exception 'client is not in your firm' using errcode='CLR11';
  end if;
  if not exists (select 1 from clara.document_filings f
                  where f.document_id = p_document and f.client_id = p_client
                    and f.firm_id = c.firm and f.retired_at is null) then
    raise exception 'document % is not a live filing of this client', p_document using errcode='CLR11';
  end if;

  v_judgement := nullif(btrim(coalesce(p_judgement,'')),'');

  v_dedupe := clara._reserve_op(c.firm, 'confirm_tenancy_rent_plan_revision', p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'document', p_document,
      'judgement', v_judgement)));
  if v_dedupe is not null then return v_dedupe; end if;

  perform pg_advisory_xact_lock(203005004, hashtext(p_client::text));

  v_state := clara._tenancy_escalation_state(p_document);
  if (v_state->>'pending')::boolean is not true then
    raise exception 'there is no escalation to confirm on this tenancy (%)', coalesce(v_state->>'reason','none')
      using errcode='CLR10',
        detail=jsonb_build_object('reason', coalesce(v_state->>'reason','no_escalation_recorded'),
          'plan_id', v_state->>'plan_id')::text;
  end if;

  v_tr := clara._tenancy_lease_treatment(p_client, p_document);
  -- A STEPPED RENT ALWAYS ASKS, so this wall is reached on every ordinary escalation. It is the
  -- same wall the first confirmation carries and it quotes the same body's own question.
  if (v_tr->>'drafts')::boolean is not true and v_judgement is null then
    raise exception '%', v_tr->>'question'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','professional_judgement_required',
          'treatment_reason', v_tr->>'reason', 'standard', v_tr->>'standard')::text;
  end if;

  select * into v_plan from clara._tenancy_rent_plan(p_document);
  v_rev := v_state->'proposed_revision';

  v_confirmation := gen_random_uuid();
  insert into clara.contract_plan_confirmations(id, firm_id, client_id, document_id, kind,
      monthly_rent_cents, rent_account_code, payable_account_code, term_start, term_end,
      treatment, professional_judgement, confirmed_by)
    values (v_confirmation, c.firm, p_client, p_document, 'rent_plan_revision',
      (v_state->>'new_cents')::bigint,
      v_plan.rent_account_code, v_plan.payable_account_code,
      (v_rev->>'effective_from')::date, v_plan.term_end,
      v_tr, v_judgement, c.actor);

  -- THE PLAN LANE'S OWN DOOR, called rather than re-implemented.
  -- #1137 [0353]: the SAME body for both lanes, and no branch at all.
  -- clara.revise_accounting_plan (0193) is now a thin delegate over
  -- clara._revise_accounting_plan_core, which takes the caller's firm and actor as arguments
  -- instead of reading a JWT -- so the OBO lane revises through exactly the body the human lane
  -- revises through, and the human entrance is unchanged. Calling the core directly also skips one
  -- redundant clara._human_ctx read: the floor was already taken by whichever entrance resolved c.
  v_result := clara._revise_accounting_plan_core(
    p_firm => c.firm, p_actor => c.actor,
    p_plan => v_plan.plan_id,
    p_frequency => v_rev->>'frequency',
    p_day_rule => v_rev->>'day_rule',
    p_day_of_month => nullif(v_rev->>'day_of_month','')::int,
    p_timezone => v_rev->>'timezone',
    p_effective_from => (v_rev->>'effective_from')::date,
    p_effective_to => (v_rev->>'effective_to')::date,
    p_basis => v_rev->'basis',
    p_reversal_day_rule => null,
    p_op_key => p_op_key || ':revise');

  -- #1137 [0353]: the LANE travels on the audit row, exactly as 0222, 0307 and 0308 stamp `via`
  -- on theirs -- so a reader can tell a confirmation taken in a conversation from one taken on the
  -- Contract page without joining anything. The ACTOR is the named person either way: that is what
  -- an on-behalf-of act means, and clara.contract_plan_confirmations.confirmed_by says so too.
  perform clara._audit(c.firm, c.actor, null, null, 'confirm_tenancy_rent_plan_revision', null,
    jsonb_build_object('via', case p_lane when 'obo' then 'confirm_tenancy_rent_plan_revision_for' else 'confirm_tenancy_rent_plan_revision' end,
      'client', p_client, 'document', p_document,
      'confirmation', v_confirmation, 'plan', v_plan.plan_id,
      'revision', v_result->>'revision',
      'from_cents', v_state->>'current_cents', 'to_cents', v_state->>'new_cents',
      'judgement_given', v_judgement is not null));

  return clara._finish_op(c.firm, 'confirm_tenancy_rent_plan_revision', p_op_key,
    jsonb_build_object('document_id', p_document, 'client_id', p_client,
      'confirmation_id', v_confirmation,
      'plan_id', v_plan.plan_id, 'revision', (v_result->>'revision')::int,
      'revision_id', v_result->>'revision_id',
      'from_cents', (v_state->>'current_cents')::bigint,
      'to_cents', (v_state->>'new_cents')::bigint,
      'effective_from', v_rev->>'effective_from',
      'treatment', v_tr, 'professional_judgement', v_judgement));
end $t1137_revconfirm_core$;

-- =====================================================================================
-- §H — THE TWO HUMAN CONFIRMATION DOORS, RECUT AS THIN DELEGATES. Unchanged signature, unchanged
-- ACL, unchanged floor, unchanged refusals, unchanged answer. The ORDER of their own two walls is
-- 0300's, untouched: the op key first, then the identity. Everything after that is the core, and
-- the LANE is a literal, so the human entrance can never take the OBO plan step and skip the JWT
-- this wrapper just read.
-- =====================================================================================
create or replace function clara.confirm_tenancy_rent_plan(p_client uuid, p_document uuid,
    p_rent_account text, p_payable_account text, p_judgement text, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp
  as $t1137_confirm_human$
declare c record;
begin
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'confirming a rent plan requires its idempotency key' using errcode='CLR10',
      detail='{"reason":"invalid_op_key","constraint":"nonempty"}';
  end if;
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  return clara._confirm_tenancy_rent_plan_core(c.firm, c.actor, 'human', p_client, p_document,
    p_rent_account, p_payable_account, p_judgement, p_op_key);
end $t1137_confirm_human$;

create or replace function clara.confirm_tenancy_rent_plan_revision(p_client uuid, p_document uuid,
    p_judgement text, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp
  as $t1137_revconfirm_human$
declare c record;
begin
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'revising a rent plan requires its idempotency key' using errcode='CLR10',
      detail='{"reason":"invalid_op_key","constraint":"nonempty"}';
  end if;
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  return clara._confirm_tenancy_rent_plan_revision_core(c.firm, c.actor, 'human', p_client,
    p_document, p_judgement, p_op_key);
end $t1137_revconfirm_human$;

-- =====================================================================================
-- §I — THE TWO OBO TWINS. `clara_runtime` ONLY, and NEW NAMES rather than widened grants: an
-- on-behalf-of act names the human it acts for, and a runtime grant on a human door would be an
-- entrance that names nobody.
--
-- THEY ARE `clara.create_prepayment_schedule_for`'s SHAPE (0307 §D), line for line, and the four
-- walls below are that door's own, with THIS lane's sentences and tokens:
--
--   1. THE OP KEY, first and unconditional — the human door's own sentence, so a chat tool that
--      forgets a key hears exactly what the web surface hears.
--   2. A NULL AUTHOR IS ITS OWN REFUSAL, answered before the client is read, so it can leak
--      nothing: "no human was named" and "the human named is nobody here" are different mistakes
--      and only the first is the caller's own shape.
--   3. THE AUTHORITY, LIVE AT THE MOMENT THE ACT IS TAKEN. An author with NO membership in this
--      firm answers EXACTLY as an unknown client does, so the pair cannot enumerate another firm's
--      clients; a DEACTIVATED member of THIS firm gets `authority_lost`, because they already knew
--      the client exists; and below the bookkeeper rank it is `insufficient_role` — the same floor
--      `clara._human_ctx` applies at the human door, applied here to the NAMED HUMAN rather than
--      to the connection.
--   4. THE CLIENT, resolved to a firm, in the human door's own words and code.
--
-- WHAT THEY DO NOT DO: they take no actor from a JWT (there is none) and none from a session
-- setting (that would be an actor the caller could choose); they do not widen the op-key namespace
-- (the reservation is taken inside the shared core, under the human verb, over the CALLER'S OWN
-- ARGUMENTS and not over the author — so a chat confirmation and a human replay of the same
-- decision under the same key converge on ONE receipt and ONE plan); and they add no rule the
-- human door does not have, because every rule that is not about WHO is calling lives in the core.
-- =====================================================================================
create or replace function clara.confirm_tenancy_rent_plan_for(p_client uuid, p_author uuid,
    p_document uuid, p_rent_account text, p_payable_account text, p_judgement text, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp
  as $t1137_confirm_obo$
declare v_firm uuid; v_role text; v_member_status text;
begin
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'confirming a rent plan requires its idempotency key' using errcode='CLR10',
      detail='{"reason":"invalid_op_key","constraint":"nonempty"}';
  end if;
  if p_author is null then
    raise exception 'an on-behalf-of confirmation names the human it acts for' using errcode='CLR10',
      detail='{"reason":"invalid_author","field":"author","constraint":"present"}';
  end if;
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  if v_firm is null then
    raise exception 'client is not in your firm' using errcode='CLR11';
  end if;
  select m.role, m.status into v_role, v_member_status from clara.firm_memberships m
   where m.user_id = p_author and m.firm_id = v_firm
   order by (m.status = 'active') desc, m.created_at desc limit 1;
  if v_role is null then
    raise exception 'client is not in your firm' using errcode='CLR11';
  end if;
  if v_member_status <> 'active' then
    raise exception 'the human this confirmation acts for is no longer an active member of this firm'
      using errcode='CLR04', detail='{"reason":"authority_lost","field":"author"}';
  end if;
  if clara.role_rank(v_role) < clara.role_rank('bookkeeper') then
    raise exception 'confirming a rent plan requires a bookkeeper or above'
      using errcode='CLR04', detail='{"reason":"insufficient_role"}';
  end if;
  return clara._confirm_tenancy_rent_plan_core(v_firm, p_author, 'obo', p_client, p_document,
    p_rent_account, p_payable_account, p_judgement, p_op_key);
end $t1137_confirm_obo$;

create or replace function clara.confirm_tenancy_rent_plan_revision_for(p_client uuid,
    p_author uuid, p_document uuid, p_judgement text, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp
  as $t1137_revconfirm_obo$
declare v_firm uuid; v_role text; v_member_status text;
begin
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'revising a rent plan requires its idempotency key' using errcode='CLR10',
      detail='{"reason":"invalid_op_key","constraint":"nonempty"}';
  end if;
  if p_author is null then
    raise exception 'an on-behalf-of confirmation names the human it acts for' using errcode='CLR10',
      detail='{"reason":"invalid_author","field":"author","constraint":"present"}';
  end if;
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  if v_firm is null then
    raise exception 'client is not in your firm' using errcode='CLR11';
  end if;
  select m.role, m.status into v_role, v_member_status from clara.firm_memberships m
   where m.user_id = p_author and m.firm_id = v_firm
   order by (m.status = 'active') desc, m.created_at desc limit 1;
  if v_role is null then
    raise exception 'client is not in your firm' using errcode='CLR11';
  end if;
  if v_member_status <> 'active' then
    raise exception 'the human this confirmation acts for is no longer an active member of this firm'
      using errcode='CLR04', detail='{"reason":"authority_lost","field":"author"}';
  end if;
  if clara.role_rank(v_role) < clara.role_rank('bookkeeper') then
    raise exception 'confirming a rent plan revision requires a bookkeeper or above'
      using errcode='CLR04', detail='{"reason":"insufficient_role"}';
  end if;
  return clara._confirm_tenancy_rent_plan_revision_core(v_firm, p_author, 'obo', p_client,
    p_document, p_judgement, p_op_key);
end $t1137_revconfirm_obo$;

reset role;

-- =====================================================================================
-- §J — ACL + THE ALLOWLIST. The complete delta on the machine side: EIGHT executes on eight new
-- names, and SIX allowlist rows for ONE wake kind.
-- =====================================================================================
-- The ten cores: nobody. `create or replace` preserves an ACL, so these REVOKEs are what make a
-- redo over a hand-granted core close it again.
revoke all on function clara._get_contract_terms_core(uuid,uuid) from public;
revoke all on function clara._get_tenancy_rent_plan_draft_core(uuid,uuid) from public;
revoke all on function clara._propose_contract_terms_core(uuid,uuid) from public;
revoke all on function clara._get_tenancy_escalation_revision_core(uuid,uuid) from public;
revoke all on function clara._get_rent_settlement_candidates_core(uuid,uuid) from public;
revoke all on function clara._get_tenancy_deposit_coding_core(uuid,uuid) from public;
revoke all on function clara._confirm_tenancy_rent_plan_core(uuid,uuid,text,uuid,uuid,text,text,text,text) from public;
revoke all on function clara._confirm_tenancy_rent_plan_revision_core(uuid,uuid,text,uuid,uuid,text,text) from public;
revoke all on function clara._revise_accounting_plan_core(uuid,uuid,uuid,text,text,integer,text,date,date,jsonb,text,text) from public;
revoke all on function clara._tenancy_plan_core(uuid,uuid,uuid,text,text,jsonb,text,text,integer,text,date,date,jsonb) from public;

-- The human doors: restated rather than assumed. `create or replace` preserved the grants 0193 and
-- 0300 made, and restating them here means the tail's has_function_privilege read is proving a line
-- this file owns.
revoke all on function clara.get_contract_terms(uuid) from public;
grant execute on function clara.get_contract_terms(uuid) to clara_authenticated;
revoke all on function clara.get_tenancy_rent_plan_draft(uuid) from public;
grant execute on function clara.get_tenancy_rent_plan_draft(uuid) to clara_authenticated;
revoke all on function clara.propose_contract_terms(uuid) from public;
grant execute on function clara.propose_contract_terms(uuid) to clara_authenticated;
revoke all on function clara.get_tenancy_escalation_revision(uuid) from public;
grant execute on function clara.get_tenancy_escalation_revision(uuid) to clara_authenticated;
revoke all on function clara.get_rent_settlement_candidates(uuid) from public;
grant execute on function clara.get_rent_settlement_candidates(uuid) to clara_authenticated;
revoke all on function clara.get_tenancy_deposit_coding(uuid) from public;
grant execute on function clara.get_tenancy_deposit_coding(uuid) to clara_authenticated;
revoke all on function clara.confirm_tenancy_rent_plan(uuid,uuid,text,text,text,text) from public;
grant execute on function clara.confirm_tenancy_rent_plan(uuid,uuid,text,text,text,text) to clara_authenticated;
revoke all on function clara.confirm_tenancy_rent_plan_revision(uuid,uuid,text,text) from public;
grant execute on function clara.confirm_tenancy_rent_plan_revision(uuid,uuid,text,text) to clara_authenticated;
revoke all on function clara.revise_accounting_plan(uuid,text,text,integer,text,date,date,jsonb,text,text) from public;
grant execute on function clara.revise_accounting_plan(uuid,text,text,integer,text,date,date,jsonb,text,text) to clara_authenticated;

-- The model lane's READS: the READ role, and no other. NOT clara_runtime (the act lane has no
-- business reading a firm's agreements), NOT clara_wake_interactive (the write pool COMMITs; these
-- are reads and they run read-only), NOT clara_authenticated (a human has their own doors).
revoke all on function clara.wake_get_contract_terms(uuid) from public;
grant execute on function clara.wake_get_contract_terms(uuid) to clara_agent_ro;
revoke all on function clara.wake_get_tenancy_rent_plan_draft(uuid) from public;
grant execute on function clara.wake_get_tenancy_rent_plan_draft(uuid) to clara_agent_ro;
revoke all on function clara.wake_propose_contract_terms(uuid) from public;
grant execute on function clara.wake_propose_contract_terms(uuid) to clara_agent_ro;
revoke all on function clara.wake_get_tenancy_escalation_revision(uuid) from public;
grant execute on function clara.wake_get_tenancy_escalation_revision(uuid) to clara_agent_ro;
revoke all on function clara.wake_get_rent_settlement_candidates(uuid) from public;
grant execute on function clara.wake_get_rent_settlement_candidates(uuid) to clara_agent_ro;
revoke all on function clara.wake_get_tenancy_deposit_coding(uuid) from public;
grant execute on function clara.wake_get_tenancy_deposit_coding(uuid) to clara_agent_ro;

-- The OBO ACTS: the runtime role, and no other — the lane clara.create_prepayment_schedule_for and
-- clara.create_accrual_adjustment_for already sit in. NOT clara_agent_ro (a read role does not
-- act), NOT a wake role, NOT clara_authenticated (a person has the human door, which names them
-- through their own JWT rather than through an argument).
revoke all on function clara.confirm_tenancy_rent_plan_for(uuid,uuid,uuid,text,text,text,text) from public;
grant execute on function clara.confirm_tenancy_rent_plan_for(uuid,uuid,uuid,text,text,text,text) to clara_runtime;
revoke all on function clara.confirm_tenancy_rent_plan_revision_for(uuid,uuid,uuid,text,text) from public;
grant execute on function clara.confirm_tenancy_rent_plan_revision_for(uuid,uuid,uuid,text,text) to clara_runtime;

-- ONE KIND, SIX ROWS. `interactive` is what `readScoped` mints (plain, OBO the initiating human,
-- no client pin) in `packages/runtime/workflows/chatTurn.v13.infra.ts`. `interactive_client` is
-- deliberately NOT allowlisted: no read here needs a client pin, and an unpinned credential is the
-- narrower of the two, because the scope arrives as an argument the core walls against the firm.
insert into clara.wake_fn_allowlist(wake_kind, function_name)
  values ('interactive', 'wake_get_contract_terms'),
         ('interactive', 'wake_get_tenancy_rent_plan_draft'),
         ('interactive', 'wake_propose_contract_terms'),
         ('interactive', 'wake_get_tenancy_escalation_revision'),
         ('interactive', 'wake_get_rent_settlement_candidates'),
         ('interactive', 'wake_get_tenancy_deposit_coding')
  on conflict (wake_kind, function_name) do nothing;

-- =====================================================================================
-- §K — COMMENTS. Every new name says what it is, which entrance it serves and what it refuses.
-- =====================================================================================
comment on function clara._get_contract_terms_core(uuid,uuid) is
  '#949 AC1 [0300], recut by #1137 [0353]. The live contract terms of one agreement with the superseded readings beside them -- clara.get_contract_terms''s OWN body with the caller''s firm as an argument instead of a JWT read. ONE definition, two entrances: the human door (viewer floor, clara_authenticated) and the model lane''s door (clara.wake_get_contract_terms, clara_agent_ro, one interactive allowlist row). Granted to NOBODY.';
comment on function clara._get_tenancy_rent_plan_draft_core(uuid,uuid) is
  '#949 AC2 [0300], recut by #1137 [0353]. The rent plan this tenancy would run, with the lessee-treatment branch that decided whether Clara may draft it at all. clara.get_tenancy_rent_plan_draft''s OWN body with the firm as an argument. Granted to NOBODY; two entrances.';
comment on function clara._propose_contract_terms_core(uuid,uuid) is
  '#949 AC1 [0300], recut by #1137 [0353]. The tenancy terms #948''s banked reading already establishes, beside the terms this lane could not read and why. clara.propose_contract_terms''s OWN body with the firm as an argument. Granted to NOBODY; two entrances.';
comment on function clara._get_tenancy_escalation_revision_core(uuid,uuid) is
  '#949 AC6 [0300], recut by #1137 [0353]. The plan revision a recorded escalation is asking for, before its effective date. clara.get_tenancy_escalation_revision''s OWN body with the firm as an argument. Granted to NOBODY; two entrances.';
comment on function clara._get_rent_settlement_candidates_core(uuid,uuid) is
  '#949 AC4 [0300], recut by #1137 [0353]. Per client, each month of rent whose payable is still open, with its candidate bank lines searched 35 days either side and the window travelling on the row. clara.get_rent_settlement_candidates''s OWN body with the firm as an argument. Granted to NOBODY; two entrances.';
comment on function clara._get_tenancy_deposit_coding_core(uuid,uuid) is
  '#949 AC5 [0300], recut by #1137 [0353]. Per client, every recorded tenancy deposit with the bank lines that could be it and 1120 Deposits Paid as the proposed coding -- an OFFER, never a posting. clara.get_tenancy_deposit_coding''s OWN body with the firm as an argument. Granted to NOBODY; two entrances.';

comment on function clara.wake_get_contract_terms(uuid) is
  '#1137 [0353]. The MODEL LANE''s entrance to #949''s recorded terms: the same clara._get_contract_terms_core the viewer''s door calls, reached under a wake credential instead of a JWT. EXECUTE to clara_agent_ro alone and ONE clara.wake_fn_allowlist row, for the `interactive` kind. It reads and never acts. The floor is the credential''s own BOOKKEEPER+, re-validated by clara.wake_context on every use -- strictly narrower than the human door''s viewer floor. A CLIENT-PINNED credential is refused: this read is scoped to a document.';
comment on function clara.wake_get_tenancy_rent_plan_draft(uuid) is
  '#1137 [0353]. The MODEL LANE''s entrance to #949''s rent-plan draft, on clara.wake_get_contract_terms''s exact terms. Inert: it drafts nothing and posts nothing, and where the lessee branch ASKS it carries that question rather than a plan.';
comment on function clara.wake_propose_contract_terms(uuid) is
  '#1137 [0353]. The MODEL LANE''s entrance to #949''s proposal read, on clara.wake_get_contract_terms''s exact terms. It says what Clara CAN read off the banked reading and, just as importantly, what she cannot -- an escalation has no question in the frozen questionnaire at all.';
comment on function clara.wake_get_tenancy_escalation_revision(uuid) is
  '#1137 [0353]. The MODEL LANE''s entrance to #949''s escalation offer, on clara.wake_get_contract_terms''s exact terms. It is what a person must see BEFORE confirming a revision through clara.confirm_tenancy_rent_plan_revision_for; it changes nothing by itself.';
comment on function clara.wake_get_rent_settlement_candidates(uuid) is
  '#1137 [0353]. The MODEL LANE''s entrance to #949''s open rent months and their candidate bank lines. EXECUTE to clara_agent_ro alone, one `interactive` allowlist row. It OFFERS and never chooses, and it opens no accept: clara.settle_rent_payable is untouched and unreachable from here, because a person adjudicates two lines of the same amount where they can see both.';
comment on function clara.wake_get_tenancy_deposit_coding(uuid) is
  '#1137 [0353]. The MODEL LANE''s entrance to #949''s deposit coding offer, on clara.wake_get_rent_settlement_candidates''s exact terms. An OFFER, never a posting: this lane has no write door for a deposit at all, because signing states a term and does not say the money moved.';

comment on function clara._revise_accounting_plan_core(uuid,uuid,uuid,text,text,integer,text,date,date,jsonb,text,text) is
  '#929 [0193], recut by #1137 [0353]. clara.revise_accounting_plan''s OWN body with the caller''s firm and actor as arguments instead of a clara._plan_door_ctx read, so the tenancy lane''s on-behalf-of escalation confirmation revises through exactly the body the human door revises through -- every advisory rung, the row lock, the re-read under it, the alignment wall and the catch-up wall included. The plan is re-resolved here under the firm it was handed, so a plan outside the caller''s firm answers clara._plan_door_ctx''s own CLR11. Granted to NOBODY.';
comment on function clara.revise_accounting_plan(uuid,text,text,integer,text,date,date,jsonb,text,text) is
  '#929 [0193], recut by #1137 [0353] as a thin delegate over clara._revise_accounting_plan_core. Signature, ACL, floor, refusals and answer unchanged: the op key is still checked FIRST, and the bookkeeper floor and the plan''s firm wall are still clara._plan_door_ctx''s. clara_authenticated only.';
comment on function clara._tenancy_plan_core(uuid,uuid,uuid,text,text,jsonb,text,text,integer,text,date,date,jsonb) is
  '#1137 [0353]. The PLAN STEP clara.confirm_tenancy_rent_plan_for takes, because clara.create_accounting_plan resolves its actor from a JWT a clara_runtime connection does not have. It is clara._obo_plan_core''s body with the kind fixed to recurring_journal and the `via` fixed to this entrance; it BELONGS in clara._obo_plan_core as a widened kind set, and is separate only because lane L1 of the riders sweep wave recuts that body in the same wave (#1051, #1080) -- see packages/db/README.md 0353 for the follow-up that merges them. Granted to NOBODY; reached only from clara._confirm_tenancy_rent_plan_core''s obo arm. Takes no op key: the confirmation''s own key covers the whole act.';

comment on function clara._confirm_tenancy_rent_plan_core(uuid,uuid,text,uuid,uuid,text,text,text,text) is
  '#949 AC2/AC3 [0300], recut by #1137 [0353]. clara.confirm_tenancy_rent_plan''s OWN body with the firm, the actor and the LANE as arguments. ONE definition, two entrances: the human door (bookkeeper floor through clara._human_ctx, clara_authenticated) and clara.confirm_tenancy_rent_plan_for (clara_runtime, the named author re-checked LIVE). The lane decides ONE thing and nothing else: which plan door creates the schedule. Every refusal -- a bank credit by name, a payable account another tenancy''s live plan uses, a missing chart account, a missing professional judgement quoting the branch''s own question -- is identical on both. Granted to NOBODY.';
comment on function clara._confirm_tenancy_rent_plan_revision_core(uuid,uuid,text,uuid,uuid,text,text) is
  '#949 AC6 [0300], recut by #1137 [0353]. clara.confirm_tenancy_rent_plan_revision''s OWN body with the firm, the actor and the LANE as arguments. The lane changes NOTHING but the audit row''s `via`: both entrances revise through clara._revise_accounting_plan_core. Granted to NOBODY.';
comment on function clara.confirm_tenancy_rent_plan(uuid,uuid,text,text,text,text) is
  '#949 AC2/AC3 [0300], recut by #1137 [0353] as a thin delegate over clara._confirm_tenancy_rent_plan_core with lane=human. Signature, ACL, bookkeeper floor, refusals and receipt unchanged; the op key is still checked before the identity. clara_authenticated only -- clara_runtime reaches the act through clara.confirm_tenancy_rent_plan_for, which names the human it acts for.';
comment on function clara.confirm_tenancy_rent_plan_revision(uuid,uuid,text,text) is
  '#949 AC6 [0300], recut by #1137 [0353] as a thin delegate over clara._confirm_tenancy_rent_plan_revision_core with lane=human. Signature, ACL, floor, refusals and receipt unchanged. clara_authenticated only.';
comment on function clara.confirm_tenancy_rent_plan_for(uuid,uuid,uuid,text,text,text,text) is
  '#1137 [0353], under the owner-delegated ruling of 2026-09-25 on #1137. The ON-BEHALF-OF twin of #949''s rent-plan confirmation, in clara.create_prepayment_schedule_for''s shape (0307): clara_runtime only, the initiating human named in an ARGUMENT and re-checked LIVE against this firm''s memberships (no membership answers exactly as an unknown client does; a deactivated member gets authority_lost; below bookkeeper gets insufficient_role), then the SAME core the human door runs. The act is recorded as the named person''s: clara.contract_plan_confirmations.confirmed_by is them, the plan''s authorised_by is them, and the audit row carries via=confirm_tenancy_rent_plan_for so a reader can tell a conversation from the Contract page. The person still confirms; this is where they may say so.';
comment on function clara.confirm_tenancy_rent_plan_revision_for(uuid,uuid,uuid,text,text) is
  '#1137 [0353], under the same ruling. The ON-BEHALF-OF twin of #949''s escalation confirmation, on clara.confirm_tenancy_rent_plan_for''s exact terms. A stepped rent ALWAYS makes the lessee branch ask, so in practice a written professional judgement is required here and the refusal quotes the branch''s own question -- the model never supplies that judgement, it asks the accountant for it and passes it through unchanged.';

-- =====================================================================================
-- §TAIL — what must be true AFTER this file, measured rather than asserted by having applied.
-- A tail that only says OK has proven nothing.
-- =====================================================================================
do $t1137_tail$
declare
  v_i int; v_sig text; v_role text; v_sha text; v_src text; v_n int; v_env jsonb;
  v_jobs text[][] := array[
    ['clara._get_contract_terms_core(uuid,uuid)',
     'clara.get_contract_terms(uuid)', 'read', 'viewer',
     '2eb8402e9f343deb72f6d0a48aeeedf8f3f85dbe6458a01ba2b5150993d1e2c9',
     'af2a3178bf078bd08e4c1770ec7bbe59349655d003e36446d0c9a96b693b8d27'],
    ['clara._get_tenancy_rent_plan_draft_core(uuid,uuid)',
     'clara.get_tenancy_rent_plan_draft(uuid)', 'read', 'viewer',
     '65296ec0dc4e30c75ba441581312d59133e3325233d9fc87edd87592cd2354d0',
     'c930f0aa0fe8202631b1c3abc94f011ecd3d13994fab317a04603f58b2382635'],
    ['clara._propose_contract_terms_core(uuid,uuid)',
     'clara.propose_contract_terms(uuid)', 'read', 'viewer',
     'e630c5a4867d9ff1f1e124fc8ca6d45617f9632d6817e2347498331ff72eb297',
     '6d1cf1b746465866b66776e7fd5dde9f46fcb5cbcbaea53930441c1c619fad60'],
    ['clara._get_tenancy_escalation_revision_core(uuid,uuid)',
     'clara.get_tenancy_escalation_revision(uuid)', 'read', 'viewer',
     '75301d54afcd9f7bcf0451b016c065677b45d2207e9881386dbf3eba36ba63c5',
     '221d59382b2d1f00dc5303b02381c1af5de6ce2a065f0bfbfad57244f3e17648'],
    ['clara._get_rent_settlement_candidates_core(uuid,uuid)',
     'clara.get_rent_settlement_candidates(uuid)', 'read', 'bookkeeper',
     'c08efcd38f95a5b0360233f5dd0ad6528d58c6e062592d4c8e676fa83cfa7090',
     '3fe122690feec88235f26e1619c80ffe217b1958cfb918be6be63f15577e57dd'],
    ['clara._get_tenancy_deposit_coding_core(uuid,uuid)',
     'clara.get_tenancy_deposit_coding(uuid)', 'read', 'bookkeeper',
     '2ceefb9cac34c65edc965ce350443af1bd8fec18088558fe2f4cf73d5a509900',
     '3092d3d42a713bed5692ea41f8f32fa03ef4892c71241706eab2c2a92d8846b9'],
    ['clara._confirm_tenancy_rent_plan_core(uuid,uuid,text,uuid,uuid,text,text,text,text)',
     'clara.confirm_tenancy_rent_plan(uuid,uuid,text,text,text,text)', 'confirm', 'bookkeeper',
     '4561bcf6de011930f5c9b74fa90bca1bd24af105398f2fe584bf21c696ceb4ce',
     'e8a65796245bd331a72c7f92c6b882737f45e4f1be12c35739f5ea430265ef29'],
    ['clara._confirm_tenancy_rent_plan_revision_core(uuid,uuid,text,uuid,uuid,text,text)',
     'clara.confirm_tenancy_rent_plan_revision(uuid,uuid,text,text)', 'revision', 'bookkeeper',
     '5a69eed78db63e81f0c4915b784aa38be4991a7dbdaa1258324e413e02642530',
     '5fe080568b2cf3ae0e5258af244340789e376d2060e6695ff08fc99b8c15a2d4'],
    ['clara._revise_accounting_plan_core(uuid,uuid,uuid,text,text,integer,text,date,date,jsonb,text,text)',
     'clara.revise_accounting_plan(uuid,text,text,integer,text,date,date,jsonb,text,text)',
     'revise', 'bookkeeper',
     '8a6e69efac967592592bf3e8d08683145e5b43456a63fe673788337349382886',
     '0908c2b7c026fe39bd9b8f3ce7aa3e34b196cb8086300c8c9a665ee17a1f596c']
  ];
  v_cores text[] := array[
    'clara._get_contract_terms_core(uuid,uuid)',
    'clara._get_tenancy_rent_plan_draft_core(uuid,uuid)',
    'clara._propose_contract_terms_core(uuid,uuid)',
    'clara._get_tenancy_escalation_revision_core(uuid,uuid)',
    'clara._get_rent_settlement_candidates_core(uuid,uuid)',
    'clara._get_tenancy_deposit_coding_core(uuid,uuid)',
    'clara._confirm_tenancy_rent_plan_core(uuid,uuid,text,uuid,uuid,text,text,text,text)',
    'clara._confirm_tenancy_rent_plan_revision_core(uuid,uuid,text,uuid,uuid,text,text)',
    'clara._revise_accounting_plan_core(uuid,uuid,uuid,text,text,integer,text,date,date,jsonb,text,text)',
    'clara._tenancy_plan_core(uuid,uuid,uuid,text,text,jsonb,text,text,integer,text,date,date,jsonb)'
  ];
  v_humans text[] := array[
    'clara.get_contract_terms(uuid)',
    'clara.get_tenancy_rent_plan_draft(uuid)',
    'clara.propose_contract_terms(uuid)',
    'clara.get_tenancy_escalation_revision(uuid)',
    'clara.get_rent_settlement_candidates(uuid)',
    'clara.get_tenancy_deposit_coding(uuid)',
    'clara.confirm_tenancy_rent_plan(uuid,uuid,text,text,text,text)',
    'clara.confirm_tenancy_rent_plan_revision(uuid,uuid,text,text)',
    'clara.revise_accounting_plan(uuid,text,text,integer,text,date,date,jsonb,text,text)',
    'clara.settle_rent_payable(uuid,uuid,uuid,text)',
    'clara.record_contract_terms(uuid,uuid,jsonb,text)'
  ];
  v_wakes text[] := array[
    'clara.wake_get_contract_terms(uuid)',
    'clara.wake_get_tenancy_rent_plan_draft(uuid)',
    'clara.wake_propose_contract_terms(uuid)',
    'clara.wake_get_tenancy_escalation_revision(uuid)',
    'clara.wake_get_rent_settlement_candidates(uuid)',
    'clara.wake_get_tenancy_deposit_coding(uuid)'
  ];
  v_obo text[] := array[
    'clara.confirm_tenancy_rent_plan_for(uuid,uuid,uuid,text,text,text,text)',
    'clara.confirm_tenancy_rent_plan_revision_for(uuid,uuid,uuid,text,text)'
  ];
  v_machine text[] := array['clara_agent_ro','clara_runtime','clara_wake_interactive',
                            'clara_wake_proactive','clara_wake_bank','clara_wake_filing',
                            'clara_freeform_ro'];
  c_firm constant uuid := '00000000-0000-4000-8000-0000000011f7';
  c_doc  constant uuid := '00000000-0000-4000-8000-0000000011f8';
begin
  -- (0) WHAT WAS INSTALLED IS WHAT §0 DERIVED, and (1) IT REVERSES TO THE PINNED PRE-IMAGE.
  --     §0 pinned the sha of the surgery applied to the LIVE pre-image; this reads each COMMITTED
  --     body back, pins the same value, and then reverses the surgery and pins the pre-image. If a
  --     single byte of any of the nine computations moved, this raises.
  for v_i in 1 .. array_length(v_jobs, 1) loop
    v_sig := v_jobs[v_i][1];
    select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha
      from pg_proc p where p.oid = v_sig::regprocedure;
    if v_sha is distinct from v_jobs[v_i][6] then
      raise exception '#1137 tail: % was committed at sha % but §0 derived %', v_sig, v_sha, v_jobs[v_i][6]
        using errcode='CLR10';
    end if;
    v_src := clara.__t1137_preimage(v_sig, v_jobs[v_i][2], v_jobs[v_i][3], v_jobs[v_i][4]);
    v_sha := encode(sha256(convert_to(v_src, 'UTF8')), 'hex');
    if v_sha is distinct from v_jobs[v_i][5] then
      raise exception '#1137 tail: % does not reverse to %''s pinned body (sha %, expected %)',
        v_sig, v_jobs[v_i][2], v_sha, v_jobs[v_i][5] using errcode='CLR10';
    end if;
  end loop;

  -- (2) EVERY OBJECT THIS FILE INSTALLS OR ASSERTS: ONE OWNER, THE PINNED search_path, SECURITY
  --     DEFINER ON ALL. The count is REPORTED from the rosters rather than typed into the notice,
  --     so a roster that grows can never leave a stale number behind it.
  for v_sig in select unnest(v_cores || v_humans || v_wakes || v_obo) loop
    if to_regprocedure(v_sig) is null then
      raise exception '#1137 tail: % is absent', v_sig using errcode='CLR10';
    end if;
    perform 1 from pg_proc p
      where p.oid = v_sig::regprocedure
        and pg_get_userbyid(p.proowner) = 'clara_fn_owner'
        and p.prosecdef
        and p.proconfig @> array['search_path=clara, pg_temp'];
    if not found then
      raise exception '#1137 tail: % is not a clara_fn_owner-owned SECURITY DEFINER with the pinned search_path', v_sig
        using errcode='CLR10';
    end if;
  end loop;

  -- (3) THE TEN CORES ARE REACHABLE BY NOBODY. Not PUBLIC, not a human role, not a machine role.
  for v_sig in select unnest(v_cores) loop
    if has_function_privilege('public', v_sig, 'EXECUTE')
       or has_function_privilege('clara_authenticated', v_sig, 'EXECUTE') then
      raise exception '#1137 tail: % is reachable outside its own doors', v_sig using errcode='CLR10';
    end if;
    foreach v_role in array v_machine loop
      if has_function_privilege(v_role, v_sig, 'EXECUTE') then
        raise exception '#1137 tail: % is reachable from %', v_sig, v_role using errcode='CLR10';
      end if;
    end loop;
  end loop;

  -- (4) EVERY HUMAN DOOR KEPT ITS ACL AND GAINED NO MACHINE ROLE — including the two acts this
  --     ticket deliberately did NOT open: clara.settle_rent_payable (accepting a candidate is
  --     adjudicated where a person sees every candidate) and clara.record_contract_terms
  --     (recording what the page says is the person's own reading).
  for v_sig in select unnest(v_humans) loop
    if not has_function_privilege('clara_authenticated', v_sig, 'EXECUTE') then
      raise exception '#1137 tail: % lost its clara_authenticated grant', v_sig using errcode='CLR10';
    end if;
    if has_function_privilege('public', v_sig, 'EXECUTE') then
      raise exception '#1137 tail: % is granted to PUBLIC', v_sig using errcode='CLR10';
    end if;
    foreach v_role in array v_machine loop
      if has_function_privilege(v_role, v_sig, 'EXECUTE') then
        raise exception '#1137 tail: the HUMAN door % is now reachable from %', v_sig, v_role
          using errcode='CLR10';
      end if;
    end loop;
  end loop;

  -- (5) THE SIX NEW READS ARE clara_agent_ro's ALONE.
  for v_sig in select unnest(v_wakes) loop
    if not has_function_privilege('clara_agent_ro', v_sig, 'EXECUTE') then
      raise exception '#1137 tail: % is not reachable from clara_agent_ro', v_sig using errcode='CLR10';
    end if;
    if has_function_privilege('public', v_sig, 'EXECUTE')
       or has_function_privilege('clara_authenticated', v_sig, 'EXECUTE') then
      raise exception '#1137 tail: % is reachable from PUBLIC or from a human', v_sig using errcode='CLR10';
    end if;
    foreach v_role in array v_machine loop
      if v_role <> 'clara_agent_ro' and has_function_privilege(v_role, v_sig, 'EXECUTE') then
        raise exception '#1137 tail: % is reachable from %, which this file did not buy', v_sig, v_role
          using errcode='CLR10';
      end if;
    end loop;
  end loop;

  -- (6) THE TWO OBO ACTS ARE clara_runtime's ALONE — and in particular NOT the read role's. A read
  --     role that could confirm a rent plan would be the agent deciding what it is allowed to do.
  for v_sig in select unnest(v_obo) loop
    if not has_function_privilege('clara_runtime', v_sig, 'EXECUTE') then
      raise exception '#1137 tail: % is not reachable from clara_runtime', v_sig using errcode='CLR10';
    end if;
    if has_function_privilege('public', v_sig, 'EXECUTE')
       or has_function_privilege('clara_authenticated', v_sig, 'EXECUTE') then
      raise exception '#1137 tail: % is reachable from PUBLIC or from a human', v_sig using errcode='CLR10';
    end if;
    foreach v_role in array v_machine loop
      if v_role <> 'clara_runtime' and has_function_privilege(v_role, v_sig, 'EXECUTE') then
        raise exception '#1137 tail: % is reachable from %, which this file did not buy', v_sig, v_role
          using errcode='CLR10';
      end if;
    end loop;
  end loop;

  -- (7) SIX ALLOWLIST ROWS, ONE KIND EACH, AND NO ALLOWLIST ROW FOR AN ACT. The dormant client-pin
  --     arms in §C are dormant because of this.
  select count(*)::int into v_n from clara.wake_fn_allowlist
   where function_name = any (array['wake_get_contract_terms','wake_get_tenancy_rent_plan_draft',
     'wake_propose_contract_terms','wake_get_tenancy_escalation_revision',
     'wake_get_rent_settlement_candidates','wake_get_tenancy_deposit_coding']);
  if v_n <> 6 then
    raise exception '#1137 tail: the six new reads hold % allowlist row(s), expected 6', v_n using errcode='CLR10';
  end if;
  select count(*)::int into v_n from clara.wake_fn_allowlist
   where function_name = any (array['wake_get_contract_terms','wake_get_tenancy_rent_plan_draft',
     'wake_propose_contract_terms','wake_get_tenancy_escalation_revision',
     'wake_get_rent_settlement_candidates','wake_get_tenancy_deposit_coding'])
     and wake_kind = 'interactive';
  if v_n <> 6 then
    raise exception '#1137 tail: a kind other than `interactive` may call the new reads' using errcode='CLR10';
  end if;
  select count(*)::int into v_n from clara.wake_fn_allowlist
   where function_name in ('confirm_tenancy_rent_plan_for','confirm_tenancy_rent_plan_revision_for',
                           'wake_confirm_tenancy_rent_plan','wake_settle_rent_payable');
  if v_n <> 0 then
    raise exception '#1137 tail: an ACT reached the wake allowlist -- the OBO twins are runtime doors, not wake doors'
      using errcode='CLR10';
  end if;

  -- (8) THE TENANCY COHORT'S TEN HUMAN NAMES STILL HOLD NO MACHINE GRANT. rig-meta's
  --     TENANCY_RENT_0300_HUMAN_FNS says so and the census sweeps it; this is that claim measured
  --     here, the moment the machine lane was opened by NEW NAMES beside them.
  for v_sig in select unnest(array[
      'clara.record_contract_terms(uuid,uuid,jsonb,text)',
      'clara.get_contract_terms(uuid)',
      'clara.propose_contract_terms(uuid)',
      'clara.get_tenancy_rent_plan_draft(uuid)',
      'clara.confirm_tenancy_rent_plan(uuid,uuid,text,text,text,text)',
      'clara.get_rent_settlement_candidates(uuid)',
      'clara.settle_rent_payable(uuid,uuid,uuid,text)',
      'clara.get_tenancy_deposit_coding(uuid)',
      'clara.get_tenancy_escalation_revision(uuid)',
      'clara.confirm_tenancy_rent_plan_revision(uuid,uuid,text,text)']) loop
    foreach v_role in array v_machine loop
      if has_function_privilege(v_role, v_sig, 'EXECUTE') then
        raise exception '#1137 tail: the 0300 human door % is reachable from %', v_sig, v_role
          using errcode='CLR10';
      end if;
    end loop;
  end loop;

  -- (9) THE CORES RUN, AND THE ONE PREDICATE THIS FILE LIFTED IS THE WALL. Driven here rather than
  --     reasoned about: a firm that owns nothing sees its OWN refusal for a document it does not
  --     hold, and the two client-scoped cores raise 0300's own CLR11 for a client that firm does
  --     not own. This is the cheapest proof that the spliced bodies compile, execute AND still
  --     wall their tenant.
  begin
    select clara._get_contract_terms_core(c_firm, c_doc) into v_env;
    raise exception '#1137 tail: the terms core answered % for a document the named firm does not hold -- the firm predicate is not walling anything', v_env
      using errcode='CLR10';
  exception when sqlstate 'CLR11' then
    null;  -- 0300's own refusal, unchanged: `document % is not a live filing in your firm`.
  end;
  begin
    select clara._get_rent_settlement_candidates_core(c_firm, c_doc) into v_env;
    raise exception '#1137 tail: the rent settlement core answered % for a client the named firm does not own', v_env
      using errcode='CLR10';
  exception when sqlstate 'CLR11' then
    null;  -- `client not in your firm`.
  end;
  begin
    select clara._get_tenancy_deposit_coding_core(c_firm, c_doc) into v_env;
    raise exception '#1137 tail: the deposit coding core answered % for a client the named firm does not own', v_env
      using errcode='CLR10';
  exception when sqlstate 'CLR11' then
    null;
  end;
  begin
    select clara._propose_contract_terms_core(c_firm, c_doc) into v_env;
    raise exception '#1137 tail: the proposal core answered % for a document the named firm does not hold', v_env
      using errcode='CLR10';
  exception when sqlstate 'CLR11' then
    null;
  end;
  begin
    select clara._get_tenancy_rent_plan_draft_core(c_firm, c_doc) into v_env;
    raise exception '#1137 tail: the draft core answered % for a document the named firm does not hold', v_env
      using errcode='CLR10';
  exception when sqlstate 'CLR11' then
    null;
  end;
  begin
    select clara._get_tenancy_escalation_revision_core(c_firm, c_doc) into v_env;
    raise exception '#1137 tail: the escalation core answered % for a document the named firm does not hold', v_env
      using errcode='CLR10';
  exception when sqlstate 'CLR11' then
    null;
  end;

  raise notice '#1137 tail: OK -- nine bodies committed at the shas §0 derived and reversing to their pinned pre-images byte for byte; % object(s) owned by clara_fn_owner, SECURITY DEFINER, search_path pinned; % core(s) reachable by nobody; % human door(s) still clara_authenticated-only and closed to all seven machine roles (clara.settle_rent_payable and clara.record_contract_terms included); % new read(s) clara_agent_ro-only with one `interactive` allowlist row each; % OBO act(s) clara_runtime-only with no allowlist row at all; all six read cores driven and answering 0300''s own CLR11 for a tenant they do not hold.',
    array_length(v_cores, 1) + array_length(v_humans, 1) + array_length(v_wakes, 1) + array_length(v_obo, 1),
    array_length(v_cores, 1), array_length(v_humans, 1), array_length(v_wakes, 1), array_length(v_obo, 1);
end
$t1137_tail$;

-- =====================================================================================
-- §Z — THE SURGERY HELPERS, DROPPED. They exist only for the length of this file: §0 and §TAIL
-- both need the SAME anchors and the SAME reversal, and spelling them twice is two places for them
-- to drift. Created at the top of this file's own transaction and dropped here, so nothing outside
-- this migration can ever call them.
-- =====================================================================================
drop function clara.__t1137_preimage(text,text,text,text);
drop function clara.__t1137_forward(text,text,text);
drop function clara.__t1137_reverse(text,text,text);
drop function clara.__t1137_floor_anchor(text);
drop function clara.__t1137_read_replacement(text);
drop function clara.__t1137_act_replacement(text);
drop function clara.__t1137_plan_anchor();
drop function clara.__t1137_plan_replacement();
drop function clara.__t1137_revise_anchor();
drop function clara.__t1137_revise_replacement();
drop function clara.__t1137_ctx_anchor();
drop function clara.__t1137_ctx_replacement();
drop function clara.__t1137_audit_anchor(text);
drop function clara.__t1137_audit_replacement(text);
