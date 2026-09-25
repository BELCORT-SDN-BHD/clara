-- 0332_plan_reversal_posted_basis — #1074 (riders sweep wave, lane 01): A REVERSAL REVERSES WHAT
-- ITS OWN OCCURRENCE POSTED. `clara._plan_admit_occurrence` stops building an already-posted
-- occurrence's reversal from the plan's LIVE revision, and builds it from the lines the entry that
-- occurrence posted actually carries.
-- =====================================================================================
-- Spec of record: issue #1074's Agent Brief (the issue body; zero comments, re-verified live on
-- this branch before this file was written), inside the sweep wave's plan of record
-- `docs/plan/active/riders-2026-09-20/SWEEP-PLAN.md` ("Why each lane is grouped this way", L1:
-- "#1074 is a real accounting defect … `clara._plan_admit_occurrence` selects the plan's current
-- live revision, and at line 1882 passes `r.basis` into `clara._plan_occurrence_basis` … A
-- reversal therefore reverses whatever the plan states now, not what the occurrence posted … the
-- body is shared by every plan kind … so the blast radius is wider than the ticket's accrual
-- framing").
--
-- THE DEFECT, MEASURED ON THIS LANE DATABASE BEFORE A LINE OF THIS FILE WAS WRITTEN.
--   An expense accrual was configured at 300,000c, its current period's occurrence was admitted
--   and POSTED through the estate's own lane (Dr 6100 300,000 / Cr 2020 300,000). Then
--   `clara.correct_accrual_adjustment` restated it to 275,000c — which, by 0284's design, advances
--   the plan to a NEW live revision carrying a NEW basis. The reversal leg was then admitted
--   through `clara.request_plan_catch_up` and posted: it posted **Dr 2020 275,000 / Cr 6100
--   275,000**. The ledger was left carrying **25,000c on the accrued-liability account that
--   nothing ever posted and nothing will ever reverse**, because no entry of that amount exists.
--   `packages/db/tests/plan-reversal-posted-basis.test.mjs` is that measurement, kept as a cell.
--
-- WHY IT HAPPENS, IN ONE LINE OF THE PRE-IMAGE. `clara._plan_admit_occurrence` resolves the plan's
-- live revision into `r` (`superseded_at is null`) and then calls
-- `clara._plan_occurrence_basis(r.basis, p_due, p_leg, v_primary_entry, v_line)` for BOTH legs.
-- For a primary that is correct and is the whole point of a correction. For a reversal it is a
-- category error: a reversal exists to undo ONE entry that is already on the books, and what that
-- entry carries is a FACT, not a restatement.
--
-- THE FIX, AND WHY IT IS THIS SHAPE.
--   * #653 already built the seam. `clara._plan_occurrence_basis` takes an optional
--     `p_line_override` whose `lines` REPLACE the revision's before a reversal's sides are
--     exchanged, and it stays `language sql IMMUTABLE` precisely because the lines ARRIVE as an
--     argument (0223:420-463, pinned below and re-pinned at the tail, byte for byte). So this file
--     needs no new mechanism: it needs one more resolver and one more override.
--   * `clara._plan_posted_entry_lines(uuid)` (new, the ONE name this file mints) answers the lines
--     one journal entry actually carries, in its own `line_no` order, in exactly the shape the
--     other two per-period resolvers answer. STABLE, SECURITY DEFINER, ungranted — the same
--     posture `clara._plan_amortisation_period_line` and `clara._plan_accrual_period_line` carry,
--     and for the same reason: it reads a table, which is why the IMMUTABLE basis body cannot do
--     the lookup itself.
--   * `clara._plan_admit_occurrence` gains ONE block: when the leg is a reversal AND a posted
--     entry stands behind it, that entry's lines become the override. The block sits AFTER the
--     three per-kind arms and supersedes whichever one ran, because the ledger outranks every one
--     of them on the question "what did this occurrence post".
--
-- WHY IT IS THE LEDGER AND NOT THE REVISION THE OCCURRENCE NAMED.
-- `clara.accounting_plan_occurrences` records the `revision` a primary was admitted under, so
-- "read THAT revision's basis" was the other candidate. It is weaker in three ways that matter
-- here: it cannot answer for a `stated_period_amount` accrual (whose figure lives in
-- `clara.accrual_period_amounts`, keyed to the LIVE accrual detail, which a correction also
-- supersedes); it cannot answer for an amortisation or recognition schedule (whose figure lives in
-- the schedule's `period_lines`); and it answers what the plan SAID rather than what the books
-- RECEIVED. The entry's own lines answer all three with one mechanism, and the ticket's own
-- "desired behaviour" names it: "read the specific occurrence's own posted basis (which is
-- presumably retrievable from the occurrence or its journal entry)".
--
-- WHAT THIS CHANGES FOR A REVERSAL WITH NO CORRECTION BEHIND IT: NOTHING, and that is measured
-- rather than argued. `clara._record_journal_entry_core` writes `clara.journal_lines` from
-- `clara._validate_entry_lines`'s output with `with ordinality` (0225:1849-1854), and that
-- validator keeps exactly `account_code` / `debit_cents` / `credit_cents` / `description`, in the
-- basis's own order (0009:294-299). So for an uncorrected plan the override IS the revision's own
-- lines, and `clara._plan_occurrence_basis` produces the same bytes it produced before. The
-- estate's existing reversal cells (`p640.occ.reversal`, `p652.reversal.binds`, `p942.posts`, and
-- #937's per-period pair) are the evidence: each compares a reversal's basis or its posted lines
-- against the revision's, and each stays green.
--
-- THE ONE PLACE THE TWO CAN LEGITIMATELY DIFFER WITHOUT A CORRECTION is a 1..5c residual, which
-- `clara._validate_entry_lines` settles onto the client's rounding account as an EXTRA line. Before
-- this file a reversal dropped that line and the validator minted its own mirror of it at posting
-- time; after it, the reversal carries the mirror explicitly. The netted ledger is identical, and
-- carrying it explicitly is the better of the two (the reversal now names every line it undoes). No
-- accrual, prepayment or recognition basis can produce one — both legs of each carry the same
-- figure — so this is a statement about the shared body, not about any lane that ships today.
--
-- WHAT THIS FILE DELIBERATELY DOES NOT DO.
--   * it does not touch `clara._plan_occurrence_basis` (#640/#653) — pinned below and re-pinned at
--     the tail, byte for byte, and re-asserted IMMUTABLE. The whole design rests on that body
--     already being a generic "use these lines instead" seam.
--   * it does not touch `clara.correct_accrual_adjustment` or any other correction door. The
--     ticket's out-of-scope line is explicit ("any change to the correction door's own validation
--     rules"), and the correction door is pinned below and re-pinned at the tail.
--   * it does not touch occurrences that have NOT posted. The ticket's other out-of-scope line
--     ("those should keep reading the live revision") is structural here rather than promised: the
--     new block is gated on `v_primary_entry is not null`, which is 0193's own "money on the books"
--     test, and a primary leg never enters the block at all.
--   * it does not touch `clara.preview_accounting_plan`. A preview only ever projects events AFTER
--     the plan's LAST existing occurrence (`v_start := greatest(r.effective_from, v_after + 1)`),
--     so no previewed reversal can have a posted accrual behind it, and the preview already passes
--     `null` for the reversed entry. A projection of the past is a different feature.
--   * it mints no table, no CHECK, no chart row and no grant, and it moves no vocabulary: no
--     refusal reason, no SQLSTATE and no message anywhere in the estate changes. The recut body
--     keeps its signature, owner, SECURITY DEFINER flag, pinned `search_path` and owner-only ACL,
--     and the tail re-reads every one.
--
-- ONE CONSEQUENCE WORTH NAMING, because it is a behaviour change nobody asked for and it is the
-- right one. If a correction moved an accrual onto DIFFERENT accounts after a period posted, the
-- reversal now posts to the ORIGINAL two accounts (the ones carrying the balance) instead of the
-- new ones. If one of those accounts has since been deactivated, the reversal REFUSES at posting
-- time through `clara._validate_entry_lines`'s existing "line codes to a non-existent account"
-- floor, rather than posting to an account that carries nothing. That is the honest answer: a
-- balance cannot be cleared off an account the books will not accept a line on, and the remedy is
-- to reactivate it. No new refusal is minted here; the floor is 0009's and it is unchanged.
--
-- REDO-SAFE (#957). Every statement below is `create or replace function`, `revoke` or
-- `comment on`, each idempotent by construction. The prestate is BIMODAL on the one body this file
-- recuts: it admits either the measured pre-image (FIRST APPLY) or this file's own output (REDO)
-- and refuses anything else, printing which branch it took; the resolver this file mints is probed
-- for ABSENCE-or-own-output for the same reason. Because a bimodal pin hides its first-apply
-- branch from `CLARA_MIGRATION_REDO` (which can only ever take the "already live" branch), the
-- first-apply branch was proved by hand on the lane database before this file was committed:
-- inside one transaction that was rolled back, 0308's own `create or replace function` statement
-- was re-run to restore the pre-image, the resolver was dropped, this prestate block was run
-- verbatim, and it printed its FIRST APPLY notice and passed. The lane report records that run.
-- This file has NO data-dependent branch: every prestate and tail arm reads the catalog
-- (`pg_proc`, `pg_trigger`) only, so no arm needs rows to be entered.
-- =====================================================================================

do $p1074_pre$
declare
  v_admit text := 'clara._plan_admit_occurrence(uuid,date,text,text,boolean)';
  v_basis text := 'clara._plan_occurrence_basis(jsonb,date,text,uuid,jsonb)';
  v_entry text := 'clara._plan_primary_entry(uuid,date)';
  v_period text := 'clara._plan_accrual_period_line(uuid,date)';
  v_validate text := 'clara._validate_entry_lines(uuid,jsonb)';
  v_correct text := 'clara.correct_accrual_adjustment(uuid,jsonb,text)';
  v_new text := 'clara._plan_posted_entry_lines(uuid)';
  -- MEASURED ON THIS LANE DATABASE (clara_l04, 311 files, max 0331_accrual_plan_authority_wall)
  -- immediately before this file was written — never copied from an older migration's header.
  -- 0330 and 0331 are files of THIS lane and applied before this one; neither touches any body
  -- pinned here, and each pin below is what is LIVE after them.
  c_admit_pre constant text := '02ea6afe635dc9a8453d69918f5f48cb05f404f6e404973096db2ec92d0a655e';
  c_admit_post constant text := '5cc0fa562dec69faf702fee1a2847a6c0557471b28908836d1601bea5818baeb';
  c_basis constant text := 'cef3264e2a8956dc3d08259b6c1f6bf90bd5c155c7f473f88504f778f611829e';
  c_entry constant text := 'e3106ae16a3f712c230bed6a1b2dcd8415ff17878436788a4a9b0edc48b4af46';
  c_period constant text := '9951a63f8eb0926b99917a3ef7dfedd32689af88ff25598b75075f174adf7941';
  c_validate constant text := '37b03159a535770d6d7053aa826270703fcafa86f3864e9e344fe5bb886d3c71';
  c_correct constant text := '6a59591a6211acdb6975c7dcfe1dc5c2b3334a8d68ad4281635e7d38ac19fdfa';
  c_new_post constant text := 'e13df9d08204a3ebb6b7628af71b41e3f76781f062e07ec21183d7c671545fa5';
  v_sha text; v_branch text; v_new_branch text; v_n int; v_ok boolean; v_sig text;
begin
  -- THE SEAM THIS FILE USES. `clara._plan_occurrence_basis` is what exchanges a reversal's sides
  -- and what substitutes an override's lines, so the whole fix is that body's existing behaviour
  -- applied to a new override. Pinned UNCONDITIONALLY, and re-asserted IMMUTABLE: a body that had
  -- become STABLE or VOLATILE would mean #653's argument-passing design had been undone somewhere,
  -- and this file would be building on a seam that no longer exists.
  if to_regprocedure(v_basis) is null then
    raise exception '#1074 prestate: % is absent -- 0223 must apply first', v_basis using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
    from pg_proc p where p.oid = v_basis::regprocedure;
  if v_sha is distinct from c_basis then
    raise exception '#1074 prestate: % has DRIFTED from its #640/#653 image (got %) -- this file routes an occurrence''s posted lines through it and must not do so blind',
      v_basis, v_sha using errcode = 'CLR10';
  end if;
  select p.provolatile = 'i' into v_ok from pg_proc p where p.oid = v_basis::regprocedure;
  if v_ok is not true then
    raise exception '#1074 prestate: % is no longer IMMUTABLE -- the override arriving as an argument is the whole reason it can be',
      v_basis using errcode = 'CLR10';
  end if;

  -- THE THREE NEIGHBOUR BODIES THE NEW BLOCK LEANS ON, pinned by house practice so the integrator
  -- can see at once if another lane recuts one:
  --   * clara._plan_primary_entry answers WHICH entry a reversal undoes. It is the gate on the new
  --     block (`v_primary_entry is not null`) and it is where "money on the books, still live" is
  --     defined (0193:914-925, review round 2 BLOCKER-1).
  --   * clara._plan_accrual_period_line is the arm the override SUPERSEDES for a
  --     stated_period_amount reversal. Pinned so "superseded" is a claim about a known body.
  --   * clara._validate_entry_lines is the floor the NULL belt rests on: it refused every entry
  --     with fewer than two lines at posting time (0009:267-270).
  foreach v_sig in array array[v_entry, v_period, v_validate] loop
    if to_regprocedure(v_sig) is null then
      raise exception '#1074 prestate: % is absent', v_sig using errcode = 'CLR10';
    end if;
  end loop;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
    from pg_proc p where p.oid = v_entry::regprocedure;
  if v_sha is distinct from c_entry then
    raise exception '#1074 prestate: % has DRIFTED from its 0193 image (got %)', v_entry, v_sha using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
    from pg_proc p where p.oid = v_period::regprocedure;
  if v_sha is distinct from c_period then
    raise exception '#1074 prestate: % has DRIFTED from its #937/#942 image (got %)', v_period, v_sha using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
    from pg_proc p where p.oid = v_validate::regprocedure;
  if v_sha is distinct from c_validate then
    raise exception '#1074 prestate: % has DRIFTED from its 0009 image (got %) -- the NULL belt in the new block rests on its two-line floor',
      v_validate, v_sha using errcode = 'CLR10';
  end if;

  -- THE CORRECTION DOOR, PINNED BECAUSE THIS FILE MUST NOT TOUCH IT. The ticket's own out-of-scope
  -- line is "any change to the correction door's own validation rules", and the honest way to keep
  -- a promise about a body is to pin it at both ends rather than to write that it was left alone.
  if to_regprocedure(v_correct) is null then
    raise exception '#1074 prestate: % is absent -- 0284 must apply first', v_correct using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
    from pg_proc p where p.oid = v_correct::regprocedure;
  if v_sha is distinct from c_correct then
    raise exception '#1074 prestate: % has DRIFTED from its #936/#937/#942 image (got %)', v_correct, v_sha
      using errcode = 'CLR10';
  end if;

  -- THE BODY THIS FILE RECUTS, BIMODALLY.
  if to_regprocedure(v_admit) is null then
    raise exception '#1074 prestate: % is absent -- 0193 must apply first', v_admit using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
    from pg_proc p where p.oid = v_admit::regprocedure;
  v_branch := case v_sha when c_admit_pre then 'first' when c_admit_post then 'redo' else null end;
  if v_branch is null then
    raise exception '#1074 prestate: % is neither its measured pre-image (%) nor this file''s own output (%) -- got % -- so the insertion below would be written against a body nobody measured',
      v_admit, c_admit_pre, c_admit_post, v_sha using errcode = 'CLR10';
  end if;

  -- AND ITS GRANT POSTURE, PINNED SO THE TAIL CAN PROVE THE RECUT PRESERVED IT. It is an
  -- ungranted definer-internal core (0004:6-12's one-ungranted-core law); a `create or replace`
  -- preserves an ACL, and this asserts there was nothing to preserve but the owner's own.
  select count(*)::int into v_n from pg_proc p,
       unnest(coalesce(p.proacl, '{}'::aclitem[])) as a
   where p.oid = v_admit::regprocedure and a::text not like 'clara_fn_owner=%';
  if v_n <> 0 then
    raise exception '#1074 prestate: % carries % grant(s) beyond the owner''s own', v_admit, v_n
      using errcode = 'CLR10';
  end if;
  if has_function_privilege('public', v_admit::regprocedure, 'execute') then
    raise exception '#1074 prestate: PUBLIC can execute %', v_admit using errcode = 'CLR10';
  end if;

  -- THE ONE NAME THIS FILE MINTS -- absent on a first apply, and its own output on a redo.
  if to_regprocedure(v_new) is null then
    v_new_branch := 'absent';
  else
    select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
      from pg_proc p where p.oid = v_new::regprocedure;
    if v_sha is distinct from c_new_post then
      raise exception '#1074 prestate: % already exists and is NOT this file''s own output (got %) -- another lane has taken the name',
        v_new, v_sha using errcode = 'CLR10';
    end if;
    v_new_branch := 'own output';
  end if;

  -- THE BELT THAT MAKES THE NULL GUARD UNREACHABLE, so "unreachable" is a checkable claim rather
  -- than a comment. clara.journal_lines carries 0003's immutability trigger, which refuses every
  -- line write against an approved entry; the entry the new block reads is approved by
  -- construction (clara._plan_primary_entry requires it).
  if not exists (select 1 from pg_trigger t
                  where t.tgrelid = 'clara.journal_lines'::regclass
                    and t.tgname = 't_jl_immutable' and not t.tgisinternal) then
    raise exception '#1074 prestate: clara.journal_lines no longer carries 0003''s t_jl_immutable belt -- the NULL guard in the new block rests on a posted entry''s lines being frozen'
      using errcode = 'CLR10';
  end if;

  raise notice '#1074 prestate: % APPLY -- clara._plan_occurrence_basis is byte-identical to its #640/#653 image and still IMMUTABLE; clara._plan_primary_entry, clara._plan_accrual_period_line and clara._validate_entry_lines are byte-identical to theirs; clara.correct_accrual_adjustment is byte-identical to its #936/#937/#942 image; clara._plan_admit_occurrence is in the % state and is granted to nobody but its owner; clara._plan_posted_entry_lines is %; and clara.journal_lines still carries 0003''s immutability belt.',
    upper(v_branch), v_branch, v_new_branch;
end
$p1074_pre$;

-- =====================================================================================
-- §A  THE RESOLVER. The lines ONE journal entry actually carries, in the shape #653's override
--     seam takes: an object with a `lines` array, which `clara._plan_occurrence_basis` substitutes
--     for the revision's before a reversal's sides are exchanged.
--
--     IT IS STABLE, NOT IMMUTABLE, because it reads a table -- which is exactly why the basis body
--     cannot do this lookup itself and takes the answer as an argument (0223:387-388 says so of
--     its own sibling, in as many words).
--
--     `having count(*) >= 2` IS THE BELT, AND IT IS 0009'S OWN FLOOR.
--     `clara._validate_entry_lines` refuses an entry with fewer than two lines, so an approved
--     entry with one line or none is a state this estate cannot reach; answering NULL rather than
--     a half-entry means the caller keeps today's basis instead of posting a figure nobody
--     measured. `order by jl.line_no` is an INTEGER ordering, so no database collation can move
--     it (sweep rule (e)).
-- =====================================================================================
set role clara_fn_owner;

create or replace function clara._plan_posted_entry_lines(p_entry uuid) returns jsonb
  language sql stable security definer set search_path = clara, pg_temp as $p1074ple$
  select jsonb_build_object(
           'source', 'posted_entry',
           'entry_id', p_entry,
           'lines', jsonb_agg(jsonb_build_object(
                      'account_code', jl.account_code,
                      'debit_cents', jl.debit_cents,
                      'credit_cents', jl.credit_cents,
                      'description', jl.description)
                    order by jl.line_no))
    from clara.journal_lines jl
   where jl.entry_id = p_entry
  having count(*) >= 2;
$p1074ple$;
revoke all on function clara._plan_posted_entry_lines(uuid) from public;
comment on function clara._plan_posted_entry_lines(uuid) is
  '#1074 (0332): the lines ONE journal entry actually carries, in its own line_no order and in the '
  'shape clara._plan_occurrence_basis takes as its p_line_override. It is what a REVERSAL posts '
  'against: clara._plan_admit_occurrence hands it the entry clara._plan_primary_entry resolved, so '
  'a reversal undoes what its occurrence POSTED rather than what the plan''s live revision states '
  'now -- which is how a correction landing between a posting and its reversal used to strand the '
  'difference on the balance-sheet leg for ever. NULL when the entry carries fewer than two lines, '
  'which clara._validate_entry_lines (0009) made unreachable for an approved entry and '
  'clara._tf_lines_immutable (0003) has frozen ever since; the caller treats NULL as "keep the '
  'basis you already have" rather than posting a figure nobody measured. STABLE and ungranted, the '
  'same posture clara._plan_amortisation_period_line and clara._plan_accrual_period_line carry.';

-- =====================================================================================
-- §B  THE ADMISSION CORE, RECUT. 0308's body verbatim -- every rung, every wall, every comment,
--     the three per-kind arms, the orphan wall, the Work admission and the audit row -- with
--     exactly ONE block inserted before the shared basis call and ONE declaration added for the
--     variable that block alone uses. The tail proves that claim mechanically by reverse
--     substitution: removing the two additions must reproduce the pre-image byte for byte.
-- =====================================================================================
create or replace function clara._plan_admit_occurrence(
  p_plan uuid, p_due date, p_leg text, p_model text, p_allow_reattempt boolean default false)
returns jsonb language plpgsql security definer
set search_path = clara, pg_temp as $p1074adm$
declare
  p record; r record; o record; v_existing boolean := false;
  v_basis jsonb; v_intent text; v_answer jsonb; v_occ uuid;
  v_client_status text; v_detail text; v_reason text;
  v_code text; v_message text; v_outcome jsonb;
  v_period date; v_primary_due date; v_ceiling date; v_attempt int := 1;
  v_old_work uuid; v_old_status text; v_reattempt boolean := false;
  v_primary_entry uuid; v_primary_state text;
  v_line jsonb; v_line_missing boolean := false;  -- #653
  -- #937 - THE NAME OF THE REFUSAL A MISSING LINE RECORDS. Two lanes now resolve a per-due-date
  -- line (amortisation, 0223; accrual, 0303) and a missing one is a DIFFERENT fact in each, so
  -- the reason and its sentence travel in variables instead of being literals inside the one
  -- shared refusal block below.
  v_line_reason text; v_line_message text; v_accrual_rule text;
  -- #1074 - THE LINES THE OCCURRENCE A REVERSAL UNDOES ACTUALLY POSTED. Held in its own
  -- variable rather than assigned straight into v_line, so the override below reads as what it
  -- is: the LEDGER's answer, superseding whatever the three per-kind arms resolved from the plan.
  v_posted_basis jsonb;
begin
  -- RUNG 1.
  select * into p from clara.accounting_plans where id = p_plan for update;
  if not found then
    return jsonb_build_object('admitted', false, 'reason', 'plan_not_found');
  end if;
  if p.status <> 'active' then
    return jsonb_build_object('admitted', false, 'plan_id', p.id,
      'reason', case p.status when 'paused' then 'plan_paused' else 'plan_ended' end);
  end if;

  select c.status into v_client_status from clara.clients c
   where c.id = p.client_id and c.firm_id = p.firm_id;
  if v_client_status is distinct from 'active' then
    return jsonb_build_object('admitted', false, 'plan_id', p.id, 'reason', 'client_inactive');
  end if;

  select * into r from clara.accounting_plan_revisions
   where plan_id = p.id and superseded_at is null;
  if not found then
    return jsonb_build_object('admitted', false, 'plan_id', p.id, 'reason', 'no_live_revision');
  end if;
  -- The authority window, re-asserted at the moment of admission rather than trusted from the
  -- caller's arithmetic. A future schedule never authorises a historical run and an ended window
  -- never authorises a later one — EXCEPT that a reversing plan's ceiling reaches the reversal of
  -- its last accrual (review finding S6), because an authority that ends on the last accrual must
  -- still let that accrual be undone.
  v_ceiling := case when p_leg = 'reversal'
                    then clara._plan_window_ceiling(r.effective_to, r.auto_reverse)
                    else coalesce(r.effective_to, 'infinity'::date) end;
  if p_due < r.effective_from or p_due > v_ceiling then
    return jsonb_build_object('admitted', false, 'plan_id', p.id, 'reason', 'outside_authority_window',
      'effective_from', to_char(r.effective_from,'YYYY-MM-DD'),
      'effective_to', case when r.effective_to is null then null else to_char(r.effective_to,'YYYY-MM-DD') end,
      'leg_ceiling', case when v_ceiling = 'infinity'::date then null else to_char(v_ceiling,'YYYY-MM-DD') end);
  end if;
  -- THE DUE GATE, on the house legal date (see clara._plan_admissible_event above). A plan due
  -- TOMORROW in Kuala Lumpur is not admitted today, whatever zone the session opened in.
  if p_due > clara._book_today() then
    return jsonb_build_object('admitted', false, 'plan_id', p.id, 'reason', 'not_yet_due',
      'due_date', to_char(p_due,'YYYY-MM-DD'));
  end if;

  -- CONVERGENCE. The occurrence row is the identity of the due event; a second scan reads it
  -- instead of making a second one, and answers with the SAME work id.
  select * into o from clara.accounting_plan_occurrences
   where plan_id = p.id and due_date = p_due;
  -- FOUND is captured NOW rather than re-read below: plpgsql resets it on every SQL-bearing
  -- statement, and the second test is several statements away.
  v_existing := found;
  v_period := clara._plan_occurrence_period_key(p.authority_from, r.effective_from, r.frequency,
                r.day_rule, r.day_of_month, p_due, p_leg);

  if v_existing and o.work_id is not null then
    -- A RE-ATTEMPT IS THE ONE EXIT FROM CONVERGENCE (review finding S7), and only a human's
    -- catch-up may ask for it: a Work the human CANCELLED, or one that FAILED, posted nothing and
    -- leaves the period owed. A COMPLETED Work, or any Work carrying a committed receipt, converges
    -- as before — money is on the books.
    v_old_work := o.work_id;
    select w.status into v_old_status from clara.accounting_work w where w.id = v_old_work;
    v_reattempt := p_allow_reattempt
      and v_old_status in ('cancelled','failed')
      and not exists (select 1 from clara.operation_receipts rc
                       where rc.work_id = v_old_work and rc.outcome = 'committed');
    if not v_reattempt then
      return jsonb_build_object('admitted', false, 'converged', true, 'plan_id', p.id,
        'occurrence_id', o.id, 'work_id', o.work_id, 'due_date', to_char(o.due_date,'YYYY-MM-DD'),
        'leg', o.leg, 'revision', o.revision, 'intent_key', o.intent_key, 'outcome', o.outcome);
    end if;
    v_attempt := o.attempt + 1;
  end if;

  -- ONE PERIOD, ONE LEG, ONE OCCURRENCE (review finding B1). A revision that moves the due day
  -- names a NEW date for a period that already ran, and admitting it would post a second entry for
  -- one period. Refused BEFORE any row is written, because a second row for the same period is not
  -- a due event to record — it is the same event under a different spelling.
  if not v_existing and exists (
        select 1 from clara.accounting_plan_occurrences o2
         where o2.plan_id = p.id and o2.leg = p_leg and o2.period_key = v_period) then
    return jsonb_build_object('admitted', false, 'plan_id', p.id, 'reason', 'period_already_admitted',
      'code', 'CLR13', 'due_date', to_char(p_due,'YYYY-MM-DD'), 'leg', p_leg,
      'period_key', to_char(v_period,'YYYY-MM-DD'),
      'occurrence_id', (select o2.id from clara.accounting_plan_occurrences o2
                         where o2.plan_id = p.id and o2.leg = p_leg and o2.period_key = v_period
                         limit 1));
  end if;

  -- THE ENTRY A REVERSAL WOULD UNDO, measured HERE — under the plan row lock, in the same
  -- statement sequence that writes the occurrence — rather than inherited from the picker's
  -- unlocked choice (review round 2, BLOCKER-1).
  if p_leg = 'reversal' then
    v_primary_due := clara._plan_primary_for_reversal(r.effective_from, r.frequency, r.day_rule,
                       r.day_of_month, p_due);
    if v_primary_due is not null then
      v_primary_entry := clara._plan_primary_entry(p.id, v_primary_due);
    end if;
  end if;
  -- #653 - THE PER-PERIOD BASIS. An amortisation revision's stored basis carries ONE period's
  -- lines; every OTHER period posts its own amount, and the FINAL period posts the base plus
  -- the whole remainder. The resolved line is looked up HERE, in a VOLATILE body that may read
  -- a table, and handed to `clara._plan_occurrence_basis` as an ARGUMENT - which is exactly
  -- what lets that body stay IMMUTABLE. NULL is a real answer and is refused below BY NAME,
  -- never allowed to fall back to the revision's constant (which would post the first period's
  -- amount for every period of the term).
  --
  -- #941 - THE SAME ARM FOR THE REVENUE SIDE, with its own lookup and its own typed reason: an
  -- operator reading "this amortisation schedule has no period line" beside a deferred-revenue
  -- plan would be reading about the wrong half of the books.
  if p.kind = 'amortisation_schedule' then
    v_line := clara._plan_amortisation_period_line(p.id, p_due);
    v_line_missing := (v_line is null);
    v_line_reason := 'amortisation_period_line_missing';
    v_line_message := 'this amortisation schedule has no period line ending on this due date';
  elsif p.kind = 'reversing_journal' then
    -- #937 - THE SAME SEAM FOR AN ACCRUAL WHOSE AMOUNT A PERSON STATED PER PERIOD. The accrual
    -- detail is read the way the web layer's own `liveAccrualForPlan` reads it -- the HIGHEST
    -- revision on the plan, which is the live one (0284's correction lineage leaves both rows) --
    -- rather than `= r.revision`, because a lawful `clara.revise_accounting_plan` moves the plan
    -- to a revision the accrual detail does not name and the accrual is still the one running.
    -- A plain reversing journal nobody configured from an accrual answers NULL here and takes
    -- neither arm, so the constant basis keeps posting for it exactly as before.
    select (a.method ->> 'rule') into v_accrual_rule
      from clara.accrual_adjustments a
     where a.plan_id = p.id
     order by a.revision desc, a.created_at desc
     limit 1;
    -- THE REVERSAL LEG RESOLVES ITS OWN PRIMARY'S LINE, never its own date: a reversal exists to
    -- undo one period's accrual and must undo the amount that period actually posted. It is
    -- resolved only once a POSTED accrual stands behind it (`v_primary_entry`), so a reversal with
    -- nothing behind it falls through to the orphan wall below and is refused THERE, by its own
    -- honest name, instead of being told its period has no stated amount.
    if v_accrual_rule = 'stated_period_amount'
       and (p_leg = 'primary' or v_primary_entry is not null) then
      v_line := clara._plan_accrual_period_line(p.id,
                  case when p_leg = 'reversal' then v_primary_due else p_due end);
      v_line_missing := (v_line is null);
      v_line_reason := 'accrual_period_amount_missing';
      v_line_message := 'this accrual has no amount stated for this period';
    end if;
  elsif p.kind = 'revenue_recognition_schedule' then
    v_line := clara._plan_revenue_recognition_period_line(p.id, p_due);
    v_line_missing := (v_line is null);
    v_line_reason := 'revenue_recognition_period_line_missing';
    v_line_message := 'this recognition schedule has no period line ending on this due date';
  end if;
  -- #1074 - A REVERSAL REVERSES WHAT ITS OWN OCCURRENCE POSTED, never what the plan states now.
  -- The three arms above resolve a line from the plan's LIVE revision and from the LIVE accrual
  -- detail. That is right for a due event that has not run. It is WRONG for a reversal, whose
  -- whole job is to undo ONE entry already on the books: a correction landing between a posting
  -- and its reversal (clara.correct_accrual_adjustment, 0284/0303/0304, which advances the plan
  -- to a new revision carrying a new basis) made the reversal undo the CORRECTED figure and
  -- strand the difference on the balance-sheet leg for ever, because nothing ever posted or
  -- reversed that amount.
  --
  -- So when a POSTED entry stands behind this reversal, the lines that entry actually carries
  -- become the override, and clara._plan_occurrence_basis exchanges their sides exactly as it
  -- always has. That body is UNTOUCHED and still IMMUTABLE: the lines ARRIVE as an argument.
  -- The override supersedes whichever arm above ran -- every plan kind and every calculation
  -- rule alike -- because the ledger is the only honest answer to "what did this occurrence
  -- post". An occurrence that has NOT posted is untouched: nothing stands behind it, so it goes
  -- on reading the live revision, which is what a correction is FOR.
  --
  -- THE NULL GUARD IS A BELT, NOT A BRANCH ANY CALLER CAN REACH. v_primary_entry is the entry
  -- clara._plan_primary_entry just resolved under this plan's row lock -- approved, still live,
  -- carrying a committed receipt -- and clara._validate_entry_lines (0009) refused it at posting
  -- time unless it carried at least two lines, which clara._tf_lines_immutable (0003) has frozen
  -- ever since. A belt that ever fired would leave today's basis rather than post a figure
  -- nobody measured.
  if p_leg = 'reversal' and v_primary_entry is not null then
    v_posted_basis := clara._plan_posted_entry_lines(v_primary_entry);
    if v_posted_basis is not null then
      v_line := v_posted_basis;
      v_line_missing := false;
    end if;
  end if;
  v_basis := clara._plan_occurrence_basis(r.basis, p_due, p_leg, v_primary_entry, v_line);
  v_intent := 'plan:' || p.id::text || ':r' || r.revision::text || ':' || to_char(p_due,'YYYY-MM-DD')
              || case when v_attempt > 1 then ':a' || v_attempt::text else '' end;

  if v_existing then
    -- A previously REFUSED occurrence, or a cancelled/failed one being re-attempted. The identity
    -- stays; the revision, the key and the attempt move to what this admission actually runs under,
    -- which is the whole of review finding S5 — a row printing `r1` beside a Work admitted under
    -- `r2` was a record of something that did not happen.
    --
    -- A RE-ATTEMPT WRITES THEM WITH THE NEW WORK, IN ONE STATEMENT (below), because the row still
    -- names the cancelled Work at this point and the identity trigger admits those three columns
    -- moving only alongside a lawful `work_id` move.
    v_occ := o.id;
    if not v_reattempt then
      update clara.accounting_plan_occurrences
         set revision = r.revision, intent_key = v_intent, attempt = v_attempt
       where id = v_occ;
    end if;
  else
    insert into clara.accounting_plan_occurrences(firm_id, client_id, plan_id, revision, leg,
        due_date, period_key, attempt, intent_key, outcome)
      values (p.firm_id, p.client_id, p.id, r.revision, p_leg, p_due, v_period, v_attempt, v_intent,
        jsonb_build_object('state','pending','at', now()))
      returning id into v_occ;
  end if;

  -- #653 - THE MISSING PERIOD LINE. Recorded on the occurrence rather than raised, exactly as
  -- the orphan wall below is: the refusal is legible in the plan's own history, nothing is
  -- admitted, and the SAME row becomes admissible if a schedule later covers the date. A
  -- corrected term does NOT re-derive an existing schedule (0223 SB's own comment says why),
  -- so this is the typed way a due date outside the derived allocation answers.
  if v_line_missing then
    v_outcome := jsonb_build_object('state','refused','code','CLR10',
      'reason', v_line_reason,
      'message', v_line_message,
      'due_date', to_char(p_due,'YYYY-MM-DD'), 'at', now());
    update clara.accounting_plan_occurrences set outcome = v_outcome where id = v_occ;
    return jsonb_build_object('admitted', false, 'plan_id', p.id, 'occurrence_id', v_occ,
      'due_date', to_char(p_due,'YYYY-MM-DD'), 'leg', p_leg, 'revision', r.revision,
      'reason', v_line_reason, 'code', 'CLR10');
  end if;

  -- THE ORPHAN WALL (review finding B2, recut on BLOCKER-1's law). A reversal exists to undo its
  -- OWN period's accrual, so admitting one with no POSTED accrual behind it would put a
  -- swapped-sides entry in the ledger reversing nothing. `clara._plan_admissible_event` never
  -- surfaces such an event, and this is the same wall for the path a HUMAN can reach: a catch-up
  -- window naming only the reversal day. Recorded on the occurrence rather than raised, so it is
  -- legible in the history — and the SAME row becomes admissible once the accrual posts.
  --
  -- `primary_state` NAMES WHICH OF THE THREE WAYS the accrual fails to stand behind it, because
  -- "no occurrence at all", "admitted but nothing posted yet" and "posted and since reversed" are
  -- three different facts about the books and the operator's next move differs for each.
  if p_leg = 'reversal' and v_primary_entry is null then
    v_primary_state := case
      when v_primary_due is null then 'no_schedule'
      when not exists (select 1 from clara.accounting_plan_occurrences o2
                        where o2.plan_id = p.id and o2.due_date = v_primary_due
                          and o2.leg = 'primary' and o2.work_id is not null) then 'no_occurrence'
      when not exists (select 1 from clara.accounting_plan_occurrences o2
                        join clara.operation_receipts rc on rc.work_id = o2.work_id
                                                        and rc.outcome = 'committed'
                        where o2.plan_id = p.id and o2.due_date = v_primary_due
                          and o2.leg = 'primary') then 'not_posted'
      else 'entry_not_live' end;
    v_outcome := jsonb_build_object('state','refused','code','CLR13',
      'reason','reversal_before_primary',
      'message','this reversal has no posted accrual behind it to reverse',
      'primary_state', v_primary_state,
      'primary_due_date', case when v_primary_due is null then null
                               else to_char(v_primary_due,'YYYY-MM-DD') end,
      'at', now());
    update clara.accounting_plan_occurrences set outcome = v_outcome where id = v_occ;
    return jsonb_build_object('admitted', false, 'plan_id', p.id, 'occurrence_id', v_occ,
      'due_date', to_char(p_due,'YYYY-MM-DD'), 'leg', p_leg, 'revision', r.revision,
      'reason', 'reversal_before_primary', 'code', 'CLR13', 'primary_state', v_primary_state,
      'primary_due_date', case when v_primary_due is null then null
                               else to_char(v_primary_due,'YYYY-MM-DD') end);
  end if;

  begin
    -- RUNG 2. 0178's OWN door, with the plan's authorising human as the author: it rechecks
    -- membership, activity, role rank and client status, and it is idempotent on
    -- (firm, client, intent_key) — so a replay of this whole body returns the same Work.
    v_answer := clara.admit_journal_work(p.client_id, p.authorised_by, v_intent, v_basis,
                  'user_direct', '[]'::jsonb, p_model);
  exception when others then
    get stacked diagnostics v_code = returned_sqlstate, v_message = message_text,
                            v_detail = pg_exception_detail;
    begin
      v_reason := (v_detail::jsonb) ->> 'reason';
    exception when others then
      v_reason := null;
    end;
    v_outcome := jsonb_build_object('state','refused','code', v_code, 'reason',
                   coalesce(v_reason,'unclassified'), 'message', v_message, 'at', now());
    update clara.accounting_plan_occurrences set outcome = v_outcome where id = v_occ;
    return jsonb_build_object('admitted', false, 'plan_id', p.id, 'occurrence_id', v_occ,
      'due_date', to_char(p_due,'YYYY-MM-DD'), 'leg', p_leg, 'revision', r.revision,
      'reason', coalesce(v_reason,'unclassified'), 'code', v_code, 'message', v_message);
  end;

  v_outcome := jsonb_build_object('state','admitted',
                 'logical_op_id', v_answer->>'logical_op_id',
                 'replayed', coalesce((v_answer->>'replayed')::boolean, false), 'at', now());
  -- ONE STATEMENT: the Work, the entry it reverses, and the attempt appended to the occurrence's
  -- own append-only ledger (review finding SHOULD-2) — so the superseded attempt of an S7
  -- re-admission stays reachable from the plan instead of surviving only in clara.audit_log.
  update clara.accounting_plan_occurrences
     set work_id = (v_answer->>'work_id')::uuid, admitted_at = now(), outcome = v_outcome,
         revision = r.revision, intent_key = v_intent, attempt = v_attempt,
         reverses_entry_id = v_primary_entry,
         attempts = attempts || jsonb_build_array(jsonb_build_object(
           'attempt', v_attempt, 'work_id', v_answer->>'work_id', 'intent_key', v_intent,
           'revision', r.revision, 'admitted_at', now()))
   where id = v_occ;

  perform clara._audit(p.firm_id, p.authorised_by, null, null, 'plan_occurrence_admitted', null,
    jsonb_build_object('plan', p.id, 'occurrence', v_occ, 'work', v_answer->>'work_id',
      'due_date', to_char(p_due,'YYYY-MM-DD'), 'leg', p_leg, 'revision', r.revision,
      'intent_key', v_intent));

  return jsonb_build_object('admitted', true, 'plan_id', p.id, 'occurrence_id', v_occ,
    'work_id', v_answer->>'work_id', 'task_id', v_answer->>'task_id',
    'logical_op_id', v_answer->>'logical_op_id',
    'replayed', coalesce((v_answer->>'replayed')::boolean, false),
    'due_date', to_char(p_due,'YYYY-MM-DD'), 'leg', p_leg, 'revision', r.revision,
    'attempt', v_attempt, 'period_key', to_char(v_period,'YYYY-MM-DD'),
    'reverses_entry_id', v_primary_entry,
    'intent_key', v_intent);
end $p1074adm$;

revoke all on function clara._plan_admit_occurrence(uuid,date,text,text,boolean) from public;
comment on function clara._plan_admit_occurrence(uuid,date,text,text,boolean) is
  '#640 (0193): the ONE body that turns a plan''s due date into a clara.accounting_work, under the '
  'plan row lock, converging on the occurrence row that is the identity of the due event. '
  '#653/#937/#941 gave it three per-kind arms that resolve a period''s own line and record a typed '
  'refusal when none covers the date. #1074 (0332): for a REVERSAL leg with a POSTED entry behind '
  'it, the lines that entry actually carries become the basis override, so the reversal undoes what '
  'its occurrence POSTED rather than what the plan''s live revision states now. Until 0332 a '
  'correction landing between a posting and its reversal (clara.correct_accrual_adjustment) made '
  'the reversal reverse the CORRECTED figure and strand the difference on the balance-sheet leg for '
  'ever. An occurrence that has not posted is untouched and still reads the live revision, which is '
  'what a correction is for. Nothing else in this body moved; 0332''s tail proves that by removing '
  'the insertion and re-hashing to the pre-image.';

reset role;

-- =====================================================================================
-- TAIL. Re-reads the live catalog rather than trusting the statements above ran as written, and
-- proves the insertion is an INSERTION by reverse substitution. Nothing here writes a row.
-- =====================================================================================
do $p1074_tail$
declare
  v_admit text := 'clara._plan_admit_occurrence(uuid,date,text,text,boolean)';
  v_basis text := 'clara._plan_occurrence_basis(jsonb,date,text,uuid,jsonb)';
  v_entry text := 'clara._plan_primary_entry(uuid,date)';
  v_period text := 'clara._plan_accrual_period_line(uuid,date)';
  v_correct text := 'clara.correct_accrual_adjustment(uuid,jsonb,text)';
  v_new text := 'clara._plan_posted_entry_lines(uuid)';
  c_admit_pre constant text := '02ea6afe635dc9a8453d69918f5f48cb05f404f6e404973096db2ec92d0a655e';
  c_admit_post constant text := '5cc0fa562dec69faf702fee1a2847a6c0557471b28908836d1601bea5818baeb';
  c_basis constant text := 'cef3264e2a8956dc3d08259b6c1f6bf90bd5c155c7f473f88504f778f611829e';
  c_entry constant text := 'e3106ae16a3f712c230bed6a1b2dcd8415ff17878436788a4a9b0edc48b4af46';
  c_period constant text := '9951a63f8eb0926b99917a3ef7dfedd32689af88ff25598b75075f174adf7941';
  c_correct constant text := '6a59591a6211acdb6975c7dcfe1dc5c2b3334a8d68ad4281635e7d38ac19fdfa';
  c_new_post constant text := 'e13df9d08204a3ebb6b7628af71b41e3f76781f062e07ec21183d7c671545fa5';
  c_call constant text := 'clara._plan_posted_entry_lines(';
  -- The gate the ticket's out-of-scope line turns on: the override is entered only when a POSTED
  -- entry stands behind the reversal.
  c_gate constant text := 'if p_leg = ''reversal'' and v_primary_entry is not null then';
  v_sha text; v_src text; v_restored text; v_ok boolean; v_n int; v_names text;
begin
  -- T.1 — THE RECUT BODY: this file's own output, with its whole posture unmoved.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
    from pg_proc p where p.oid = v_admit::regprocedure;
  if v_sha is distinct from c_admit_post then
    raise exception '#1074 tail T.1: % is not this file''s measured output (got %, expected %)',
      v_admit, v_sha, c_admit_post using errcode = 'CLR10';
  end if;
  select p.prosecdef and p.provolatile = 'v' and p.proowner::regrole::text = 'clara_fn_owner'
         and 'search_path=clara, pg_temp' = any(p.proconfig)
    into v_ok from pg_proc p where p.oid = v_admit::regprocedure;
  if v_ok is not true then
    raise exception '#1074 tail T.1b: % lost its definer/volatile/owner/search_path shape', v_admit
      using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from pg_proc p,
       unnest(coalesce(p.proacl, '{}'::aclitem[])) as a
   where p.oid = v_admit::regprocedure and a::text not like 'clara_fn_owner=%';
  if v_n <> 0 then
    raise exception '#1074 tail T.1c: % gained % grant(s) across the recut -- it is a definer-internal core',
      v_admit, v_n using errcode = 'CLR10';
  end if;
  if has_function_privilege('public', v_admit::regprocedure, 'execute')
     or has_function_privilege('clara_authenticated', v_admit::regprocedure, 'execute')
     or has_function_privilege('clara_runtime', v_admit::regprocedure, 'execute')
     or has_function_privilege('clara_agent_ro', v_admit::regprocedure, 'execute') then
    raise exception '#1074 tail T.1d: % is reachable by an application role', v_admit using errcode = 'CLR10';
  end if;

  -- T.2 — THE ONE NAME THIS FILE MINTS, at this file's own output and with the posture its two
  --       siblings carry: STABLE (it reads a table), SECURITY DEFINER, owned by clara_fn_owner,
  --       `search_path` pinned, and reachable by NO application role.
  if to_regprocedure(v_new) is null then
    raise exception '#1074 tail T.2: % was not created', v_new using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
    from pg_proc p where p.oid = v_new::regprocedure;
  if v_sha is distinct from c_new_post then
    raise exception '#1074 tail T.2b: % is not this file''s measured output (got %)', v_new, v_sha
      using errcode = 'CLR10';
  end if;
  select p.prosecdef and p.provolatile = 's' and p.proowner::regrole::text = 'clara_fn_owner'
         and 'search_path=clara, pg_temp' = any(p.proconfig)
    into v_ok from pg_proc p where p.oid = v_new::regprocedure;
  if v_ok is not true then
    raise exception '#1074 tail T.2c: % is not the STABLE, SECURITY DEFINER, clara_fn_owner-owned, search_path-pinned resolver its two siblings are',
      v_new using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from pg_proc p,
       unnest(coalesce(p.proacl, '{}'::aclitem[])) as a
   where p.oid = v_new::regprocedure and a::text not like 'clara_fn_owner=%';
  if v_n <> 0 then
    raise exception '#1074 tail T.2d: % carries % grant(s) beyond the owner''s own -- it reads every client''s journal lines under a definer and must reach no application role',
      v_new, v_n using errcode = 'CLR10';
  end if;
  if has_function_privilege('public', v_new::regprocedure, 'execute')
     or has_function_privilege('clara_authenticated', v_new::regprocedure, 'execute')
     or has_function_privilege('clara_runtime', v_new::regprocedure, 'execute')
     or has_function_privilege('clara_agent_ro', v_new::regprocedure, 'execute') then
    raise exception '#1074 tail T.2e: % is reachable by an application role', v_new using errcode = 'CLR10';
  end if;

  -- T.3 — THE SEAM AND THE NEIGHBOURS, UNMOVED. A fix that moved the basis body would be a
  --       rewrite of how every occurrence posts, not an override handed to it.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
    from pg_proc p where p.oid = v_basis::regprocedure;
  if v_sha is distinct from c_basis then
    raise exception '#1074 tail T.3: % MOVED while this file applied (got %)', v_basis, v_sha using errcode = 'CLR10';
  end if;
  select p.provolatile = 'i' into v_ok from pg_proc p where p.oid = v_basis::regprocedure;
  if v_ok is not true then
    raise exception '#1074 tail T.3b: % is no longer IMMUTABLE', v_basis using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
    from pg_proc p where p.oid = v_entry::regprocedure;
  if v_sha is distinct from c_entry then
    raise exception '#1074 tail T.3c: % MOVED while this file applied (got %)', v_entry, v_sha using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
    from pg_proc p where p.oid = v_period::regprocedure;
  if v_sha is distinct from c_period then
    raise exception '#1074 tail T.3d: % MOVED while this file applied (got %)', v_period, v_sha using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
    from pg_proc p where p.oid = v_correct::regprocedure;
  if v_sha is distinct from c_correct then
    raise exception '#1074 tail T.3e: % MOVED while this file applied (got %) -- the ticket''s out-of-scope line is that the correction door does not change',
      v_correct, v_sha using errcode = 'CLR10';
  end if;

  -- T.4 — THE CENSUS. `order by p.proname` is the catalog's own C ordering (`proname` is `name`,
  --       which never takes a database collation), so comparing against a literal roster is
  --       collation-proof by construction (sweep rule (e)). The resolver is reached from exactly
  --       ONE body: a second caller would be a second place deciding what a reversal reverses.
  select string_agg(p.proname, ', ' order by p.proname) into v_names
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara' and position(c_call in p.prosrc) > 0;
  if v_names is distinct from '_plan_admit_occurrence' then
    raise exception '#1074 tail T.4: clara._plan_posted_entry_lines is called by {%} -- expected exactly clara._plan_admit_occurrence, the ONE body that turns a due date into a Work',
      v_names using errcode = 'CLR10';
  end if;

  -- T.4b — THE GATE, IN THE BODY'S OWN TEXT. The ticket's out-of-scope line ("a correction keeps
  --        reaching occurrences that have NOT posted") holds structurally: the override is entered
  --        only for a reversal leg that has a POSTED entry behind it.
  select p.prosrc into v_src from pg_proc p where p.oid = v_admit::regprocedure;
  if position(c_gate in v_src) = 0 then
    raise exception '#1074 tail T.4b: the admission core does not gate the posted-entry override on "%"', c_gate
      using errcode = 'CLR10';
  end if;

  -- T.4c — THE RESOLVER READS THE LEDGER AND NOTHING ELSE: no revision, no accrual detail, no
  --        schedule, no clock. A resolver that reached any of those would be re-deriving what the
  --        plan states, which is the very thing this file exists to stop a reversal doing.
  select p.prosrc into v_src from pg_proc p where p.oid = v_new::regprocedure;
  foreach v_names in array array['accounting_plan_revisions', 'accrual_adjustments',
      'accrual_period_amounts', 'prepayment_schedules', 'revenue_recognition_schedules', 'now('] loop
    if position(v_names in v_src) > 0 then
      raise exception '#1074 tail T.4c: clara._plan_posted_entry_lines reads "%" -- it must answer from clara.journal_lines alone', v_names
        using errcode = 'CLR10';
    end if;
  end loop;

  -- T.5 — THE INSERTION IS AN INSERTION, PROVED BY REVERSE SUBSTITUTION (0330's tail T.8, 0331's
  --       tail T.5). A post-image pin says the catalog holds what this file's text says; it does
  --       NOT say that text is the pre-image with one block added. So: read the INSTALLED body,
  --       REMOVE this file's two additions, and require what is left to hash to the pre-image the
  --       prestate pinned. Anything smuggled anywhere else in this pasted body reds this migration
  --       instead of shipping — which is the whole of "nothing else in the admission core moved".
  select p.prosrc into v_src from pg_proc p where p.oid = v_admit::regprocedure;
  v_restored := replace(replace(v_src, $p1074_nb$  -- #1074 - A REVERSAL REVERSES WHAT ITS OWN OCCURRENCE POSTED, never what the plan states now.
  -- The three arms above resolve a line from the plan's LIVE revision and from the LIVE accrual
  -- detail. That is right for a due event that has not run. It is WRONG for a reversal, whose
  -- whole job is to undo ONE entry already on the books: a correction landing between a posting
  -- and its reversal (clara.correct_accrual_adjustment, 0284/0303/0304, which advances the plan
  -- to a new revision carrying a new basis) made the reversal undo the CORRECTED figure and
  -- strand the difference on the balance-sheet leg for ever, because nothing ever posted or
  -- reversed that amount.
  --
  -- So when a POSTED entry stands behind this reversal, the lines that entry actually carries
  -- become the override, and clara._plan_occurrence_basis exchanges their sides exactly as it
  -- always has. That body is UNTOUCHED and still IMMUTABLE: the lines ARRIVE as an argument.
  -- The override supersedes whichever arm above ran -- every plan kind and every calculation
  -- rule alike -- because the ledger is the only honest answer to "what did this occurrence
  -- post". An occurrence that has NOT posted is untouched: nothing stands behind it, so it goes
  -- on reading the live revision, which is what a correction is FOR.
  --
  -- THE NULL GUARD IS A BELT, NOT A BRANCH ANY CALLER CAN REACH. v_primary_entry is the entry
  -- clara._plan_primary_entry just resolved under this plan's row lock -- approved, still live,
  -- carrying a committed receipt -- and clara._validate_entry_lines (0009) refused it at posting
  -- time unless it carried at least two lines, which clara._tf_lines_immutable (0003) has frozen
  -- ever since. A belt that ever fired would leave today's basis rather than post a figure
  -- nobody measured.
  if p_leg = 'reversal' and v_primary_entry is not null then
    v_posted_basis := clara._plan_posted_entry_lines(v_primary_entry);
    if v_posted_basis is not null then
      v_line := v_posted_basis;
      v_line_missing := false;
    end if;
  end if;
$p1074_nb$, ''),
                        $p1074_nd$  -- #1074 - THE LINES THE OCCURRENCE A REVERSAL UNDOES ACTUALLY POSTED. Held in its own
  -- variable rather than assigned straight into v_line, so the override below reads as what it
  -- is: the LEDGER's answer, superseding whatever the three per-kind arms resolved from the plan.
  v_posted_basis jsonb;
$p1074_nd$, '');
  if encode(sha256(convert_to(v_restored,'UTF8')),'hex') is distinct from c_admit_pre then
    raise exception '#1074 tail T.5: removing this file''s two additions from the installed clara._plan_admit_occurrence does NOT reproduce its pre-image % -- something outside the posted-entry override moved in this file''s pasted body',
      c_admit_pre using errcode = 'CLR10';
  end if;

  raise notice '#1074 tail: OK -- clara._plan_admit_occurrence is at this file''s measured output with its signature, owner, SECURITY DEFINER flag, pinned search_path and owner-only ACL unmoved and reachable by no application role; clara._plan_posted_entry_lines exists at this file''s output as a STABLE, SECURITY DEFINER, owner-only resolver that reads clara.journal_lines and nothing else, and is called by exactly clara._plan_admit_occurrence; the override is gated on a reversal leg with a POSTED entry behind it, so an occurrence that has not posted still reads the live revision; clara._plan_occurrence_basis is byte-identical and still IMMUTABLE, and clara._plan_primary_entry, clara._plan_accrual_period_line and clara.correct_accrual_adjustment are byte-identical to their pre-images; and removing this file''s two additions reproduces the admission core''s pre-image byte for byte, so nothing but the posted-entry override moved.';
end
$p1074_tail$;
