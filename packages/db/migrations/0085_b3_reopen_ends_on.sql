-- 0085_b3_reopen_ends_on.sql -- B3 (ADR-068 ruling 1): reopen_fiscal_year mints a DEDICATED
-- reversal of the year-end closing entry, DATED the reopened year's ends_on, under the
-- target-bound close-write permit -- a formal prior-period adjustment placed in its own period.
--
-- MIGRATION NUMBER claimed at MERGE (standing law). Authored above the 0084 frontier;
-- renumber mechanically if the merge order moves -- the prestate pins the body it replaces by
-- prosrc sha256, so nothing here depends on the number. It is not OPTIONAL either:
-- packages/db/scripts/migrate.mjs skips any filename without four leading digits, so an
-- unnumbered file would silently never apply and every gate would pass on an unchanged DB.
--
-- TWO FILES, ONE CHANGE, ORDER OBLIGATORY. This file carries the prestate and the replaced
-- body; its sibling 0086_b3_reopen_ends_on_part2.sql carries EVERY post-check and census and
-- MUST FOLLOW -- it refuses to apply unless this one already did, by two independent reads
-- (part 1's ledger row, and the live body's own markers). NAMED RESIDUE: between the two
-- commits the replaced body is live and NOT yet verified from outside; what stands in that
-- window is the body's own per-act assertions (it re-reads its landed date, status and permit
-- consumption and raises) plus the prestate that refused to replace an unrecognised body. If
-- part 2 fails the run aborts with part 1 applied -- fix forward, never by hand-editing either.
--
-- WHAT WAS WRONG, MEASURED ON A FULLY MIGRATED RIG BEFORE ANY EDIT (transcript in the PR
-- record). 0056's reopen routes its unwind through clara.reverse_entry, and
-- clara.is_high_stakes returns TRUE for any is_year_end entry -- which the mirror INHERITS, so
-- reverse_entry's high-stakes arm left the mirror a DRAFT and never stamped the original's
-- reversed_by: mirror.status='draft' · posting_date=TODAY · original.reversed_by=null · the
-- permit at entries_used=0. The close was not unwound AT ALL, and a re-close then recomputed a
-- P&L the still-standing closing entry had already zeroed and minted nothing.
--
-- BUT THAT STALL WAS DOING REAL WORK, and B3 must not cash it in: a DRAFT mirror could only be
-- approved by a SECOND human through approve_entry, whose CLR05 wall refuses distinct_checker.
-- Approving in-body without that determination would turn a two-human act into a one-human
-- one, so the SEGREGATION block below carries the wall explicitly -- 0084's B4 pattern, in
-- clara._approve_entry_core's own vocabulary, measured against the CLOSER (see its comment).
--
-- THE RULING. ADR-068 (1): a year-end close pair is PERIOD MACHINERY, not a business
-- transaction, so placing its reversal in its own period falsifies nothing -- while
-- today-dating it pollutes the successor year's interim P&L with the whole reopened year. The
-- never-backdate law STANDS for transaction reversals: clara.reverse_entry is NOT TOUCHED here
-- (part 2 pins it unmoved) and no verb gains a caller-supplied posting DATE.
--
--   0056's order: status flip -> receipts -> reverse_entry (the permit a BELT nothing consumed,
--   because flipping first made the wall pass everything). THIS file's order: segregation ->
--   permit -> mirror (draft -> census-visible flip, CONSUMING the permit while the year is
--   still CLOSED) -> status flip -> the original's linkage stamp -> receipts. The permit is
--   LOAD-BEARING: one PRE-GENERATED entry id, one approved-class touch, consumed once. The
--   linkage stamp sits AFTER the flip deliberately -- giving the permit a second unit would
--   widen it from one named entry to two.
--
-- The four reversal walls reverse_entry carries are CALLED BY NAME rather than argued away, and
-- the subledger hook is CALLED with its no-op then ASSERTED. THE ACT'S OWN FACTS ARE UNMOVED:
-- created_at is now(), the actor is the reopening human, the receipts and audit rows carry the
-- true moment. Only posting_date -- the ACCOUNTING date -- is the year's end.
--
-- D1 WRITE-QUIESCE BINDS THIS DEPLOY: it replaces a deployed audited writer's body AND changes
-- its signature (p_attestation appended + defaulted, the 4-arg form dropped), so an in-flight
-- call spanning it would run the OLD route. Apply inside a write-quiesce window
-- (packages/db/README.md). No runtime or dashboard caller exists today.
--
-- CELLS: packages/db/tests/x85-b3-*.test.mjs (contract-blind: every claim is probed off the
-- LIVE catalog or a behavioural run, never off this file).
set local statement_timeout = '5min';

-- =====================================================================================
-- S0 -- PRESTATE. Everything this file's new order DEPENDS ON is measured here, before
-- anything changes. The dependency is NEW: 0056 could afford the wall being a belt; this
-- file writes into a still-closed year and cannot. No stash table -- every value compared
-- against is a LITERAL here or in part 2, which outlives the transaction a temp table dies in.
-- The callee roster 0056 checked is NOT re-checked: `check_function_bodies` resolves every
-- static call in the replacement at CREATE time, so the create below IS that check.
-- =====================================================================================
do $pre$
declare v_src text; v_wall text; v_imm text; v_n int; v_missing text;
begin
  -- (0.1) The change-of-record owners this file reads or replaces must be applied, in order.
  select coalesce(string_agg(s.n, ', '), '') into v_missing
    from unnest(array['0056_wave_e_close_model', '0057_wave_e_registry_snapshots']) s(n)
   where not exists (select 1 from clara.schema_migrations m where m.version = s.n);
  if v_missing <> '' then
    raise exception '0085 S0.1: not recorded as applied: % -- apply in order', v_missing
      using errcode = 'CLR10';
  end if;
  -- (0.3) THE BODY BEING REPLACED, PINNED EXACTLY (the 0084 precedent): prosrc is the body
  -- alone, no signature and no formatting drift, so a checksum is honest here.
  select prosrc into v_src from pg_proc
    where oid = 'clara.reopen_fiscal_year(uuid,text,jsonb,text)'::regprocedure;
  if encode(sha256(convert_to(v_src, 'UTF8')), 'hex')
     <> '3ecf3380877951b7c984cc1883814a3b44aa4926fe9c5859e4433fc8c1d95f6c' then
    raise exception '0085 S0.3: reopen_fiscal_year is not 0056''s reviewed body (prosrc sha256 %) -- refusing to replace an unrecognised body',
      encode(sha256(convert_to(v_src, 'UTF8')), 'hex') using errcode = 'CLR10';
  end if;
  -- POSITIVE reads of what is being replaced and of what must survive: the today-dated route
  -- is there to remove, and every 0056 refusal token this file carries forward is there.
  if position('clara.reverse_entry(' in v_src) = 0
     or position('reopen_ordering_violation' in v_src) = 0
     or position('reopen_target_missing' in v_src) = 0
     or position('capability_missing' in v_src) = 0
     or position('fiscal_year_not_in_firm' in v_src) = 0 then
    raise exception '0085 S0.3: the body does not route through reverse_entry, or is missing one of 0056''s refusal tokens'
      using errcode = 'CLR10';
  end if;
  if position('ends_on' in v_src) <> 0 then
    raise exception '0085 partial birth: the reopen body already dates something at ends_on'
      using errcode = 'CLR10';
  end if;
  -- (0.4) THE WALL MUST ACTUALLY ENFORCE. 0056 could treat the permit as a belt because it
  -- flipped the year open first; this file writes INTO a closed year and is admitted only by
  -- the permit. Both triggers, their bindings, and the wall's load-bearing clauses are read
  -- POSITIVELY -- an absent arm would make the new order a silent open door.
  select count(*) into v_n from pg_trigger g
    where not g.tgisinternal and g.tgenabled = 'O'
      and ((g.tgrelid = 'clara.journal_entries'::regclass and g.tgname = 't_period_wall'
            and g.tgfoid = 'clara._tf_period_wall()'::regprocedure)
        or (g.tgrelid = 'clara.journal_lines'::regclass and g.tgname = 't_period_wall_lines'
            and g.tgfoid = 'clara._tf_period_wall_lines()'::regprocedure));
  if v_n <> 2 then
    raise exception '0085 S0.4: the enabled period-wall pair on journal_entries + journal_lines reads % of 2', v_n
      using errcode = 'CLR10';
  end if;
  -- THE ARM PROBE READS THE REOPEN ARM, NOT WHICHEVER COMES FIRST. `position('reopen_reversal')`
  -- and `position('new.id = p.target_entry_id')` are BOTH satisfied by the close_entry arm --
  -- position() returns the FIRST occurrence -- so a recut that narrowed exactly the arm this
  -- file depends on would deploy green and fail at run time on a live reopen. The probe is the
  -- reopen arm's OWN predicate, whole and contiguous, over the whitespace-collapsed body.
  select regexp_replace(prosrc, '\s+', ' ', 'g') into v_wall from pg_proc
    where oid = 'clara._tf_period_wall()'::regprocedure;
  if position('p.purpose = ''reopen_reversal'' and (new.reversal_of = p.target_entry_id or new.id = p.target_entry_id)' in v_wall) = 0
     or position('entries_used < p.entries_expected' in v_wall) = 0
     or position('entries_used = entries_used + 1' in v_wall) = 0
     or position('write_into_closed_period' in v_wall) = 0 then
    raise exception '0085 S0.4: _tf_period_wall no longer carries the reopen_reversal arm''s own target predicate, the capacity test or the consumption -- the new order rests on all three'
      using errcode = 'CLR10';
  end if;
  -- The permit table still binds a target on every row and still admits the purpose.
  if not exists (select 1 from pg_constraint
                  where conrelid = 'clara.close_write_permits'::regclass
                    and conname = 'ck_cwp_target')
     or position('reopen_reversal' in pg_get_constraintdef((
          select oid from pg_constraint where conrelid = 'clara.close_write_permits'::regclass
            and conname like '%purpose%' limit 1))) = 0 then
    raise exception '0085 S0.4: close_write_permits lost ck_cwp_target (a permit naming no entry becomes mintable) or no longer admits the reopen_reversal purpose'
      using errcode = 'CLR10';
  end if;
  -- (0.5) THE TWO IMMUTABILITY ARMS the new body's two writes take, read positively.
  select prosrc into v_imm from pg_proc where oid = 'clara._tf_entry_immutable()'::regprocedure;
  if position('old.status = ''draft'' and new.status = ''approved''' in v_imm) = 0
     or position('old.status = ''approved'' and new.status = ''approved''' in v_imm) = 0
     or position('approved entries permit only a complete reversal-linkage pair' in v_imm) = 0 then
    raise exception '0085 S0.5: _tf_entry_immutable no longer carries the draft-to-approved arm or the reversal-linkage-pair arm -- the mirror flip and the original''s stamp both rest on them'
      using errcode = 'CLR10';
  end if;
  -- (0.6) THE SEGREGATION WALL THIS BODY EXTENDS must still be the one it was derived from:
  -- _approve_entry_core's high-stakes arms and the counter they use. The body re-implements
  -- them for an approval it performs in-body, so a recut that dropped or renamed one would
  -- leave this file enforcing a rule the estate no longer keeps.
  select prosrc into v_imm from pg_proc
    where oid = 'clara._approve_entry_core(jsonb,uuid,uuid,text,text)'::regprocedure;
  if position('distinct_checker' in v_imm) = 0
     or position('self_attestation' in v_imm) = 0
     or position('attestation_required' in v_imm) = 0
     or position('clara.eligible_checker_count(c.firm)>=2' in v_imm) = 0 then
    raise exception '0085 S0.6: _approve_entry_core no longer carries the CLR05 high-stakes arms this body extends -- re-derive the reopen segregation rule against the live wall'
      using errcode = 'CLR10';
  end if;
  -- Note: the 0057 staleness obligation, the grantee surface and reverse_entry's own pin are
  -- END-state claims, so part 2 makes them where they can actually be measured.
end $pre$;
set role clara_fn_owner;
-- =====================================================================================
-- S1 -- THE BODY. 0056's, carried across verbatim except for the SEGREGATION and EFFECTS
-- sections: every guard, both ordering checks, the acquisition order and the dedupe are
-- unchanged; the correction-target reader gains two explicit shape arms.
-- =====================================================================================
create or replace function clara.reopen_fiscal_year(
    p_fy uuid, p_reason text, p_correction_target jsonb, p_op_key text,
    p_attestation text default null) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  c record; v_fy record; v_dedupe jsonb; v_receipt record; v_entry uuid;
  v_new_receipt uuid; v_target_ok boolean := false; e uuid;
  v_mirror uuid; v_permit uuid; v_used int; v_n int; v_posted date; v_status text;
  v_eligible int; v_checked uuid; v_attest text; v_self boolean; v_mode text;
  v_reversal jsonb;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if not clara._has_capability(c.firm, c.actor, 'reopen') then
    raise exception 'reopening a closed year takes the reopen capability (key 3)'
      using errcode = 'CLR04', detail = '{"reason":"capability_missing","capability":"reopen"}';
  end if;
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 10 then
    raise exception 'a reopen requires a stated reason (at least 10 characters)'
      using errcode = 'CLR10', detail = '{"reason":"fact_basis_missing"}';
  end if;
  select * into v_fy from clara.fiscal_years fy where fy.id = p_fy;
  if v_fy.id is null or v_fy.firm_id <> c.firm then
    raise exception 'fiscal year is not in your firm'
      using errcode = 'CLR11', detail = '{"reason":"fiscal_year_not_in_firm"}';
  end if;
  -- A NAMED correction target resolving to REAL rows of THIS client (prose is not a
  -- target; matrix A5).
  if p_correction_target is null or jsonb_typeof(p_correction_target) <> 'object' then
    raise exception 'a reopen names its correction target (entry_ids / document_id / check_key)'
      using errcode = 'CLR10', detail = '{"reason":"reopen_target_missing"}';
  end if;
  if p_correction_target ? 'entry_ids' then
    -- SHAPE FIRST, as its own refusal arm: a json null or a scalar under this key raises
    -- 22023 out of jsonb_array_elements_text -- an unnamed error, not a refusal a caller can
    -- act on. Fail CLOSED with the target token instead.
    if jsonb_typeof(p_correction_target -> 'entry_ids') <> 'array' then
      raise exception 'entry_ids must be an array of entry ids'
        using errcode = 'CLR10', detail = '{"reason":"reopen_target_missing"}';
    end if;
    for e in select (x.v)::uuid from jsonb_array_elements_text(
        p_correction_target -> 'entry_ids') x(v) loop
      -- A NULL ELEMENT GETS ITS OWN ARM: `je.id = e` with a null e is NULL, never true, so
      -- the not-found branch would already refuse -- but it would report a row as missing
      -- when the caller in fact named nothing. Three-valued logic is safe only said aloud.
      if e is null then
        raise exception 'a correction target entry id is null'
          using errcode = 'CLR10', detail = '{"reason":"reopen_target_missing"}';
      end if;
      perform 1 from clara.journal_entries je
        where je.id = e and je.client_id = v_fy.client_id;
      if not found then
        raise exception 'correction target entry % is not in this client', e
          using errcode = 'CLR10', detail = '{"reason":"reopen_target_missing"}';
      end if;
      v_target_ok := true;
    end loop;
  end if;
  if p_correction_target ? 'document_id' then
    perform 1 from clara.document_filings f
      where f.document_id = (p_correction_target ->> 'document_id')::uuid
        and f.client_id = v_fy.client_id and f.retired_at is null;
    if not found then
      raise exception 'correction target document is not filed to this client'
        using errcode = 'CLR10', detail = '{"reason":"reopen_target_missing"}';
    end if;
    v_target_ok := true;
  end if;
  if p_correction_target ? 'check_key' then
    perform 1 from clara.close_gate_checks k
      where k.check_key = p_correction_target ->> 'check_key';
    if not found then
      raise exception 'correction target gate is unknown'
        using errcode = 'CLR10', detail = '{"reason":"reopen_target_missing"}';
    end if;
    v_target_ok := true;
  end if;
  if not v_target_ok then
    raise exception 'the correction target resolved to nothing auditable'
      using errcode = 'CLR10', detail = '{"reason":"reopen_target_missing"}';
  end if;
  -- THE ORDERING GUARD (GAP5-3 as a predicate; matrix A5): no later FY may be mid-close
  -- or closed.
  perform 1 from clara.fiscal_years later
    where later.client_id = v_fy.client_id and later.ordinal > v_fy.ordinal
      and later.status in ('closing', 'closed');
  if found then
    raise exception 'a later fiscal year is closing or closed; reopen years newest-first'
      using errcode = 'CLR41', detail = '{"reason":"reopen_ordering_violation"}';
  end if;
  v_dedupe := clara._reserve_op(c.firm, 'reopen_fiscal_year', p_op_key,
    clara._hash(jsonb_build_object('fy', p_fy, 'reason', p_reason,
      'target', p_correction_target)));
  if v_dedupe is not null then return v_dedupe; end if;

  -- ACQUISITION: the closing entry's ROW FIRST, then 004, then 007-EXCLUSIVE (the order
  -- every JE writer already walks; an FY with no closing entry locks no row and falls
  -- through to 004 -> 007, still a prefix).
  select cr.* into v_receipt from clara.close_receipts cr
    where cr.fiscal_year_id = p_fy and cr.kind = 'close' and cr.status = 'active';
  if v_receipt.id is null then
    raise exception 'no active close receipt exists for this fiscal year'
      using errcode = 'CLR10', detail = '{"reason":"reopen_target_missing"}';
  end if;
  v_entry := v_receipt.close_entry_id;
  if v_entry is not null then
    perform 1 from clara.journal_entries je where je.id = v_entry for update;
  end if;
  perform pg_advisory_xact_lock(203005004, hashtext(v_fy.client_id::text));
  perform pg_advisory_xact_lock(203005007, hashtext(v_fy.client_id::text));
  select * into v_fy from clara.fiscal_years fy where fy.id = p_fy;
  if v_fy.status <> 'closed' then
    raise exception 'fiscal year % is %; only a closed year reopens', v_fy.label, v_fy.status
      using errcode = 'CLR41', detail = '{"reason":"close_not_in_progress"}';
  end if;
  -- THE ORDERING GUARD, RE-RUN UNDER THE LOCK (R1.5 MAJOR): the pre-lock check above is
  -- the fast, friendly refusal; THIS one is authoritative. Between the early check and
  -- the 007 acquisition a concurrent finalize_close(FY n+1) can commit -- all four close
  -- verbs serialize on the same per-client pair, so only a re-check held UNDER that pair
  -- closes the window. Same discipline as the v_fy re-read directly above.
  perform 1 from clara.fiscal_years later
    where later.client_id = v_fy.client_id and later.ordinal > v_fy.ordinal
      and later.status in ('closing', 'closed');
  if found then
    raise exception 'a later fiscal year is closing or closed; reopen years newest-first'
      using errcode = 'CLR41', detail = '{"reason":"reopen_ordering_violation"}';
  end if;

  -- ===================================================================================
  -- SEGREGATION ON THE REVERSAL -- 0084's B4 pattern extended to this act, in
  -- clara._approve_entry_core's OWN vocabulary (CLR05 · distinct_checker · self_attestation ·
  -- attestation_required; no new refusal words minted). The mirror is HIGH-STAKES by
  -- construction and this body approves it in-body, so the wall binding every other
  -- high-stakes approval must bind here too. Pre-B3 it applied BY ACCIDENT -- the mirror was
  -- left a draft and a second human approved it through approve_entry -- and that accident
  -- was doing real work.
  --
  -- MEASURED AGAINST THE CLOSER, NOT THE REOPENER, and that choice is the design. The
  -- reopener necessarily AUTHORS the mirror, so measuring maker-vs-checker against themselves
  -- would refuse every reopen in every multi-checker firm and name no reachable remedy -- a
  -- rule with no lawful path is a broken verb, not a control. The human CHECKED is the one
  -- who signed the close being reversed; a different eligible human reopening it is two
  -- accountable humans, each under their own credential -- finalize_close's own shape. And
  -- NOBODY'S CONSENT IS ASSERTED BY ANYBODY ELSE: there is no p_checker naming an absent
  -- human, because a uuid typed by one human is not another's approval.
  -- ===================================================================================
  v_eligible := clara.eligible_checker_count(c.firm);
  select je.checker_actor into v_checked from clara.journal_entries je where je.id = v_entry;
  v_checked := coalesce(v_checked, v_receipt.closed_by);
  v_attest  := nullif(btrim(coalesce(p_attestation, '')), '');
  -- THE NULL ARM IS ITS OWN ARM. A close recording no accountable signer makes
  -- `v_checked = c.actor` evaluate to NULL, so no arm below would fire and the reversal would
  -- approve with neither a checker nor an attestation -- 0084's own first defect, where a
  -- branch meant to be permissive became no branch at all.
  if v_eligible = 0 then
    raise exception 'this firm has no eligible human checker; a signed close cannot be reversed'
      using errcode = 'CLR05', detail = '{"reason":"no_eligible_human"}';
  elsif v_checked is null and v_attest is null then
    raise exception 'the close being reopened records no accountable signer -- adopt its reversal with an explicit attestation'
      using errcode = 'CLR05', detail = '{"reason":"attestation_required"}';
  elsif v_eligible >= 2 and v_checked = c.actor then
    raise exception 'the reversal of a year-end close is high-stakes and needs a distinct checker: a close may not be reopened by the human who signed it -- a different eligible human holding the reopen capability must perform it'
      using errcode = 'CLR05', detail = '{"reason":"distinct_checker"}';
  elsif v_checked = c.actor and v_attest is null then
    raise exception 'the sole eligible human may reverse their own close only with an explicit attestation'
      using errcode = 'CLR05', detail = '{"reason":"self_attestation"}';
  end if;
  -- The DETERMINATION, recorded rather than inferred. An attestation is kept only where it was
  -- REQUIRED (0084's `case when v_attest_required` shape), so a volunteered string on a genuine
  -- two-person reopen never reads as a self-approval on the permanent record.
  v_self := v_checked is null or v_checked = c.actor;
  v_mode := case when v_self then 'solo_self_attested' else 'two_person' end;
  if not v_self then v_attest := null; end if;

  -- ===================================================================================
  -- EFFECTS (B3, ADR-068 ruling 1). The prior-period adjustment lands FIRST, while the year
  -- is still CLOSED, so the permit is what admits it. Then the status flip; then the
  -- original's linkage stamp; then the receipts. The four walls reverse_entry carries are
  -- CALLED BY NAME rather than argued away: a P&L-to-retained-earnings roll touches none of
  -- those domains, but that is a property of the chart, so it is proven per reopen.
  -- ===================================================================================
  if v_entry is not null then
    if clara._subledger_allocated_items_present(v_entry) then
      raise exception 'the closing entry carries allocated open items; unallocate before reopening'
        using errcode = 'CLR10', detail = '{"reason":"allocated_items_present"}';
    end if;
    if clara._bank_live_match_present(v_entry) then
      raise exception 'the closing entry is matched to a bank statement line; unmatch first'
        using errcode = 'CLR10', detail = '{"reason":"live_bank_match_present"}';
    end if;
    perform clara._fa_reversal_blocked(v_entry);
    perform clara._wdb_reversal_blocked(v_entry);
    -- THE PERMIT: pre-generate the mirror's id and BIND the permit to that one id, budget
    -- exactly ONE -- the census-visible flip is the single approved-class touch this act
    -- performs inside the closed year (the draft insert is not approved-class and the lines
    -- wall consults without consuming), so one is the honest number.
    v_mirror := gen_random_uuid();
    insert into clara.close_write_permits(firm_id, client_id, fiscal_year_id,
        close_run_id, purpose, target_entry_id, entries_expected)
      values (c.firm, v_fy.client_id, p_fy, v_receipt.close_run_id,
        'reopen_reversal', v_mirror, 1)
      returning id into v_permit;
    -- THE MIRROR, DATED ends_on. Per-line inverse at the finest grain the original carries
    -- (never a net aggregate: a summarised unwind that ties in total still leaves every account
    -- wrong). Born a DRAFT then flipped -- the only path the approve-writer census can see.
    insert into clara.journal_entries(id, client_id, status, posting_date, memo, origin,
        resolution_id, is_opening_balance, is_year_end, tax_affecting,
        maker_actor, last_human_editor, reversal_of, reversal_reason)
      select v_mirror, o.client_id, 'draft', v_fy.ends_on,
        'Prior-period adjustment: reversal of the year-end close for ' || v_fy.label,
        'reversal', o.resolution_id, o.is_opening_balance, o.is_year_end, o.tax_affecting,
        c.actor, c.actor, v_entry, p_reason
        from clara.journal_entries o where o.id = v_entry;
    insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents,
        credit_cents, description, counterparty_id)
      select v_mirror, l.line_no, l.account_code, l.credit_cents, l.debit_cents,
             l.description, l.counterparty_id
        from clara.journal_lines l where l.entry_id = v_entry order by l.line_no;
    perform clara._assert_balanced(v_mirror);
    -- THE CENSUS-VISIBLE FLIP (matrix A19e's shape): the statement that consumes the permit;
    -- an insert-approved would be invisible to 0045's approve-writer detector. The segregation
    -- determination above is what licenses it, and its attestation rides the row.
    update clara.journal_entries set status='approved', approved_at = now(),
        checker_actor = c.actor, self_approval_attestation = v_attest
      where id = v_mirror;
    perform clara._subledger_on_approve(v_mirror);
    select count(*) into v_n from clara.open_items oi where oi.entry_id = v_mirror;
    if v_n <> 0 then
      raise exception 'the reopen reversal minted % open item(s) -- unwinding a P&L roll must move no subledger', v_n
        using errcode = 'CLR41',
          detail = '{"reason":"drawer1_identity_failed","check_key":"pl_retained_earnings_roll"}';
    end if;
    -- WHAT ACTUALLY LANDED, re-read from the row rather than assumed from the statements
    -- above, and compared with IS DISTINCT FROM: a null on either side of a bare <> yields
    -- NULL, and a guard that evaluates to NULL is a wall drawn on paper.
    select je.posting_date, je.status into v_posted, v_status
      from clara.journal_entries je where je.id = v_mirror;
    if v_posted is distinct from v_fy.ends_on or v_status is distinct from 'approved' then
      raise exception 'the reopen reversal did not land approved at the year end (posting_date %, status %)', v_posted, v_status
        using errcode = 'CLR41', detail = '{"reason":"drawer1_identity_failed"}';
    end if;
    select p.entries_used into v_used from clara.close_write_permits p where p.id = v_permit;
    if v_used is distinct from 1 then
      raise exception 'the reopen reversal permit records % consumption(s), expected exactly one', v_used
        using errcode = 'CLR19', detail = '{"reason":"write_into_closed_period"}';
    end if;
  end if;
  -- The year leaves 'closed' only now: everything backdated is written, under a spent permit.
  update clara.fiscal_years set status = 'reopened' where id = p_fy;
  -- THE LINKAGE STAMP on the original: a touch of an already-approved row, so it takes the
  -- immutability arm admitting exactly the complete reversed_by/reversal_reason pair. AFTER the
  -- flip deliberately -- permit capacity for it would widen the permit from one entry to two.
  if v_entry is not null then
    update clara.journal_entries
       set reversed_by = v_mirror,
           reversal_reason = 'Reopen ' || v_fy.label || ': ' || p_reason,
           updated_at = now()
     where id = v_entry;
  end if;
  -- THE REVERSAL FACTS ARE BUILT ONCE, AND THE EMPTY ARM SAYS SO IN ITS OWN WORDS. A year with
  -- no closing entry mints no reversal, so a receipt claiming a prior-period-adjustment basis
  -- and an ends_on posting date would assert an act that never happened -- and close_receipts
  -- is what a reviewer reconstructs the year from, years later, with no other source. ONE
  -- object feeds the receipt, the audit row and the return payload, so they cannot drift.
  v_reversal := case when v_mirror is null then
      jsonb_build_object('reversal_entry_id', null, 'reversal_posting_date', null,
        'reversal_permit_id', null, 'reversal_basis', 'no_closing_entry_to_reverse')
    else
      jsonb_build_object('reversal_entry_id', v_mirror, 'reversal_posting_date', v_fy.ends_on,
        'reversal_permit_id', v_permit,
        'reversal_basis', 'prior_period_adjustment_at_fiscal_year_end') end;
  update clara.close_receipts set status = 'superseded' where id = v_receipt.id;
  insert into clara.close_receipts(firm_id, client_id, fiscal_year_id, close_run_id,
      prior_close_receipt_id, kind, closed_by, segregation_mode, last_preparer_actor,
      self_attestation, pl_net_cents, retained_earnings_account, closing_tb_digest,
      gate_digest, books_watermark, dataset_sha256, close_entry_id, snapshot)
    values (c.firm, v_fy.client_id, p_fy, v_receipt.close_run_id, v_receipt.id, 'reopen',
      -- THE DETERMINATION IS THE REOPEN'S OWN, not the superseded receipt's copied forward:
      -- these three columns now record who was checked, under which mode, and the attestation
      -- if one was required. 0056 copied the close's values and wrote a null attestation.
      c.actor, v_mode, v_checked, v_attest,
      v_receipt.pl_net_cents, v_receipt.retained_earnings_account,
      v_receipt.closing_tb_digest, v_receipt.gate_digest, v_receipt.books_watermark,
      v_receipt.dataset_sha256, v_entry,
      jsonb_build_object('reason', p_reason, 'correction_target', p_correction_target,
        'superseded_receipt_id', v_receipt.id, 'reopened_by', c.actor,
        'segregation', jsonb_build_object('mode', v_mode, 'checked_actor', v_checked,
          'eligible_checker_count', v_eligible, 'attested', v_attest is not null,
          'basis', case when v_checked is null then 'orphan_close'
                        else 'closing_entry_checker_or_receipt_signer' end))
      || v_reversal)
    returning id into v_new_receipt;
  perform clara._audit(c.firm, c.actor, null, null, 'reopen_fiscal_year', v_entry,
    jsonb_build_object('fiscal_year_id', p_fy, 'reopen_receipt_id', v_new_receipt,
      'superseded_receipt_id', v_receipt.id, 'segregation_mode', v_mode,
      'op_key', p_op_key) || v_reversal);
  if v_mirror is not null then
    -- The reversal gets its OWN receipt naming its OWN entry, reusing the permit's vocabulary.
    perform clara._audit(c.firm, c.actor, null, null, 'reopen_reversal', v_mirror,
      jsonb_build_object('fiscal_year_id', p_fy, 'reversed_entry_id', v_entry,
        'posting_date', v_fy.ends_on, 'permit_id', v_permit, 'op_key', p_op_key));
    perform clara._append_event(c.firm, 'entry.drafted', v_fy.client_id, c.actor,
      null, null, v_mirror, null, null, '{}'::jsonb);
    perform clara._append_event(c.firm, 'entry.approved', v_fy.client_id, c.actor,
      null, null, v_mirror, null, null, '{}'::jsonb);
    perform clara._append_event(c.firm, 'entry.reversed', v_fy.client_id, c.actor,
      null, null, v_entry, null, null, '{}'::jsonb);
  end if;
  perform clara._append_event(c.firm, 'fiscal_year.reopened', v_fy.client_id, c.actor,
    null, null, v_entry, null, null,
    jsonb_build_object('fiscal_year_id', p_fy, 'reopen_receipt_id', v_new_receipt));
  return clara._finish_op(c.firm, 'reopen_fiscal_year', p_op_key,
    jsonb_build_object('reopen_receipt_id', v_new_receipt, 'fiscal_year_id', p_fy,
      'reversed_entry_id', v_entry, 'segregation_mode', v_mode) || v_reversal);
end $$;

-- THE OLD 4-ARG SIGNATURE IS DROPPED, not left beside the new one. p_attestation is APPENDED
-- with a DEFAULT (the house shape: approve_entry, approve_pair_reversal, attest_close_exception
-- all extend this way), so every existing 4-arg call still resolves; leaving the old function
-- would make the call AMBIGUOUS and would leave a body that still approves a high-stakes
-- reversal with no segregation determination. The grant is re-issued: a new function has none.
drop function clara.reopen_fiscal_year(uuid, text, jsonb, text);
revoke all on function clara.reopen_fiscal_year(uuid, text, jsonb, text, text) from public;
grant execute on function clara.reopen_fiscal_year(uuid, text, jsonb, text, text)
  to clara_authenticated;

reset role;
