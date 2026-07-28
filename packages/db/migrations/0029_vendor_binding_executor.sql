-- 0029_vendor_binding_executor.sql -- Slot C vendor-binding post control (task #36).
--
-- This migration deliberately recuts exactly two functions:
--   * clara._approve_entry_core: receipt_preheld only; no signature change.
--   * clara.execute_rule_post: position-0 receipts, total-order locks, and the
--     marker-keyed post-time binding re-resolution before approval.
--
-- 0028 is immutable as-built ground truth. No Slot A/B object is changed here.

do $preflight$
begin
  if not exists (
    select 1 from clara.schema_migrations
    where version='0028_vendor_identity_binding'
  ) then
    raise exception '0029 requires 0028_vendor_identity_binding'
      using errcode='CLR10';
  end if;
end
$preflight$;

set role clara_fn_owner;

CREATE OR REPLACE FUNCTION clara._approve_entry_core(p_ctx jsonb, p_entry uuid, p_expected_revision uuid, p_attestation text, p_op_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'clara', 'pg_temp'
AS $function$
declare
  c record; e record; v_dedupe jsonb; v_attest text; v_filing uuid;
  v_fingerprint jsonb; v_counterparty uuid; v_created boolean:=false;
  v_name text; v_reg text; v_tin text; v_name_n text; v_reg_n text;
  v_state jsonb; v_invoice_id text; v_question record; v_map record;
  v_rule uuid; v_question_id uuid; v_seen int;
  v_checked_via_rule uuid; v_kind text; v_bound uuid;
begin
  select (p_ctx->>'actor')::uuid as actor, (p_ctx->>'firm')::uuid as firm into c;
  v_checked_via_rule:=nullif(p_ctx->>'checked_via_rule_id','')::uuid;
  -- ADV-R3#1: the executor threads its ONE bound extraction through the ctx —
  -- every current-document fact consumer in this approval then reads that same
  -- extraction. A human approve (no ctx pin) keeps the live self-selection.
  v_bound:=nullif(p_ctx->>'bound_extraction','')::uuid;
  -- ADV-R4#1: a RULE-DRIVEN approval may never run unpinned — the executor
  -- always binds (zero lanes skip 'facts_missing' upstream), so a null pin
  -- here is an internal-contract violation, not a lane.
  if v_checked_via_rule is not null and v_bound is null then
    raise exception 'a rule-driven approval requires a bound extraction'
      using errcode='CLR10',detail='{"reason":"unpinned_rule_post"}';
  end if;
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  -- [R1-F1] K-family-only lifecycle boundary; preflight precedes every lock.
  if exists(select 1 from clara.journal_entries
      where id=p_entry and firm_id=c.firm and is_opening_balance) then
    raise exception 'opening entries are mutable only through the K-family'
      using errcode='CLR31',
        detail='{"reason":"opening_entry_k_family_only"}';
  end if;
  if not coalesce((p_ctx->>'receipt_preheld')::boolean,false) then
    v_dedupe:=clara._reserve_op(c.firm,'approve_entry',p_op_key,
      clara._hash(jsonb_build_object('e',p_entry,'rev',p_expected_revision,
        'att',p_attestation)));
    if v_dedupe is not null then return v_dedupe; end if;
  end if;

  select * into e from clara.journal_entries where id=p_entry;
  if not found or e.firm_id<>c.firm then
    raise exception 'entry not in your firm' using errcode='CLR11';
  end if;
  -- CLR26 document-scope serialization (see the as-built filing-lock header): the
  -- filing FOR SHARE vs the question writer's FOR UPDATE serialize on the filing row.
  if e.document_id is not null then
    v_filing:=clara._active_document_filing(e.document_id,e.source_doc_sha256,e.client_id,true);
    if v_filing<>e.filing_id then
      raise exception 'entry is not bound to the active filing' using errcode='CLR02';
    end if;
  end if;

  select * into e from clara.journal_entries where id=p_entry for update;
  if e.status<>'draft' then
    -- The detail reason lets execute_rule_post distinguish THIS benign status race
    -- (a human approved/withdrew concurrently) from every other CLR10 it must NOT mask
    -- (FIX-6 / adversarial #12). Human callers ignore the additive detail unchanged.
    raise exception 'entry is not a draft' using errcode='CLR10',detail='{"reason":"not_a_draft"}';
  end if;
  if e.revision_token is distinct from p_expected_revision then
    raise exception 'stale revision token' using errcode='CLR06';
  end if;

  if e.reversal_of is not null then
    perform 1 from clara.journal_entries where id=e.reversal_of for update;
    if exists(select 1 from clara.journal_entries
              where id=e.reversal_of and reversed_by is not null) then
      raise exception 'the original was already reversed' using errcode='CLR10';
    end if;
    if exists(select 1 from clara.journal_entries r
              where r.reversal_of=e.reversal_of and r.status='approved'
                and r.id<>p_entry) then
      raise exception 'the original was already reversed by an approved reversal'
        using errcode='CLR10';
    end if;
  end if;

  -- S7: the birth kind follows the stored proposal's TOP-LEVEL kind (the same value
  -- draft/revise/_resolve_counterparty used), falling back to the coding_kind default
  -- (customer for a sales filing). Keeps birth consistent with the resolution scope.
  v_kind:=coalesce(nullif(btrim(e.proposed_counterparty->>'kind'),''),
    case when e.coding_kind in ('sales_invoice','sales_credit_note')
         then 'customer' else 'vendor' end);
  if e.proposed_counterparty is not null then
    v_fingerprint:=clara._resolve_counterparty(e.client_id,e.proposed_counterparty);
    if v_fingerprint is distinct from e.match_fingerprint then
      raise exception 'counterparty match landscape changed; revise the draft'
        using errcode='CLR23';
    end if;
    if v_fingerprint->>'decision'='birth' then
      v_name:=btrim(e.proposed_counterparty->'new'->>'name');
      v_reg:=nullif(btrim(e.proposed_counterparty->'new'->>'registration_no'),'');
      v_tin:=nullif(btrim(e.proposed_counterparty->'new'->>'tin'),'');
      v_name_n:=lower(regexp_replace(v_name,'[^a-zA-Z0-9]','','g'));
      v_reg_n:=case when v_reg is null then null else
        lower(regexp_replace(v_reg,'[^a-zA-Z0-9]','','g')) end;
      begin
        insert into clara.counterparties(firm_id,client_id,kind,name,name_normalized,
            registration_no,registration_normalized,tin,created_by)
          values(c.firm,e.client_id,v_kind,v_name,v_name_n,v_reg,v_reg_n,v_tin,c.actor)
          returning id into v_counterparty;
        v_created:=true;
      exception when unique_violation then
        v_fingerprint:=clara._resolve_counterparty(e.client_id,e.proposed_counterparty);
        if v_fingerprint is distinct from e.match_fingerprint then
          raise exception 'counterparty birth raced with a changed match landscape'
            using errcode='CLR23';
        end if;
        raise exception 'counterparty identity could not be resolved after birth race'
          using errcode='CLR23';
      end;
    else
      v_counterparty:=clara._canonical_counterparty(
        e.client_id,(v_fingerprint->>'counterparty_id')::uuid);
    end if;
    -- S7: stamp the control counterparty on payable OR receivable lines.
    update clara.journal_lines l set counterparty_id=v_counterparty
    from clara.coa_accounts a
    where l.entry_id=p_entry and a.client_id=l.client_id
      and a.account_code=l.account_code and a.account_class in ('payable','receivable');
  else
    select clara._canonical_counterparty(e.client_id,min(l.counterparty_id::text)::uuid)
      into v_counterparty
      from clara.journal_lines l join clara.coa_accounts a
        on a.client_id=l.client_id and a.account_code=l.account_code
      where l.entry_id=p_entry and a.account_class in ('payable','receivable')
        and l.counterparty_id is not null;
  end if;

  if v_counterparty is not null then
    perform pg_advisory_xact_lock(203005003,
      hashtext(e.client_id::text||':'||v_counterparty::text));
  end if;
  perform pg_advisory_xact_lock(203005004,hashtext(e.client_id::text));
  select * into v_question from clara._open_question_blocks(
    e.client_id,e.filing_id,v_counterparty) limit 1;
  if found then
    raise exception 'an open question blocks this entry'
      using errcode='CLR26',detail=jsonb_build_object('question_id',v_question.question_id,
        'scope',v_question.scope_kind)::text;
  end if;

  if e.document_id is not null then
    v_state:=case when v_bound is null then clara._invoice_fact_state(e.document_id)
      else clara._invoice_fact_state_at(e.document_id,v_bound) end;
    if coalesce((v_state->>'explicit_non_myr')::boolean,false) then
      raise exception 'newer facts identify an unsupported currency' using errcode='CLR25';
    end if;
    if e.coding_kind='supplier_bill'
       and coalesce((v_state->>'corroborated')::boolean,false) then
      if not clara._corroboration_bound(p_entry,(v_state->>'total_cents')::bigint) then
        raise exception 'newer machine facts contradict the draft evidence'
          using errcode='CLR25';
      end if;
      if (e.flags ? 'amount_exception') and not (e.flags ? 'amount_override') then
        raise exception 'proposed total conflicts with the machine-corroborated total'
          using errcode='CLR21',detail='{"reason":"amount_conflict"}';
      end if;
    end if;
    if e.coding_kind='supplier_bill' and e.reversal_of is null
       and v_counterparty is not null then
      v_invoice_id:=nullif(v_state->>'invoice_id','');
      if v_invoice_id is not null and not (e.flags ? 'duplicate_override') then
        perform pg_advisory_xact_lock(203005005,
          hashtext(e.client_id::text||':'||v_counterparty::text||':'||v_invoice_id));
        if exists (
          select 1 from clara.journal_entries e2
          where e2.client_id=e.client_id and e2.coding_kind='supplier_bill'
            and e2.status='approved' and e2.reversed_by is null and e2.id<>p_entry
            and e2.document_id is not null
            and exists (select 1 from clara.journal_lines l2
              where l2.entry_id=e2.id
                and clara._canonical_counterparty(e.client_id,l2.counterparty_id)
                    =v_counterparty)
            and (clara._invoice_fact_state(e2.document_id)->>'invoice_id')=v_invoice_id
        ) then
          raise exception 'an approved bill already exists for this vendor and invoice number'
            using errcode='CLR21',detail='{"reason":"duplicate_bill"}';
        end if;
      end if;
    end if;
    -- S7: sales duplicate = the SAME hard approve-time refusal (customer + invoice
    -- number; fallback customer + date + total). Override-flagged like duplicate_bill.
    if e.coding_kind in ('sales_invoice','sales_credit_note') and e.reversal_of is null
       and v_counterparty is not null and not (e.flags ? 'duplicate_override') then
      v_invoice_id:=nullif(v_state->>'invoice_id','');
      perform pg_advisory_xact_lock(203005005,
        hashtext(e.client_id::text||':'||v_counterparty::text||':'||coalesce(v_invoice_id,'')));
      if exists (
        select 1 from clara.journal_entries e2
        where e2.client_id=e.client_id and e2.coding_kind in ('sales_invoice','sales_credit_note')
          and e2.status='approved' and e2.reversed_by is null and e2.id<>p_entry
          and e2.document_id is not null
          and exists (select 1 from clara.journal_lines l2 where l2.entry_id=e2.id
            and clara._canonical_counterparty(e.client_id,l2.counterparty_id)=v_counterparty)
          and (
            (v_invoice_id is not null
              and (clara._invoice_fact_state(e2.document_id)->>'invoice_id')=v_invoice_id)
            or (v_invoice_id is null
              and (clara._invoice_fact_state(e2.document_id)->>'invoice_date')
                    =nullif(v_state->>'invoice_date','')
              and (clara._invoice_fact_state(e2.document_id)->>'total_cents')::bigint
                    =nullif(v_state->>'total_cents','')::bigint))
      ) then
        raise exception 'an approved sales invoice already exists for this customer'
          using errcode='CLR21',detail='{"reason":"duplicate_sales"}';
      end if;
    end if;
  end if;
  perform clara._assert_supplier_bill_shape_at(p_entry,v_bound);
  perform clara._assert_sales_invoice_shape_at(p_entry,v_bound);

  if clara.is_high_stakes(p_entry) then
    if e.last_human_editor is null then
      if p_attestation is null or btrim(p_attestation)='' then
        raise exception 'agent-made high-stakes approval requires an attestation'
          using errcode='CLR05',detail='{"reason":"attestation_required"}';
      end if;
      v_attest:=p_attestation;
    elsif e.last_human_editor=c.actor then
      if clara.eligible_checker_count(c.firm)>=2 then
        raise exception 'high-stakes entry needs a distinct checker'
          using errcode='CLR05',detail='{"reason":"distinct_checker"}';
      elsif p_attestation is null or btrim(p_attestation)='' then
        raise exception 'solo high-stakes approval requires an attestation'
          using errcode='CLR05',detail='{"reason":"self_attestation"}';
      else
        v_attest:=p_attestation;
      end if;
    end if;
  end if;

  update clara.journal_entries set status='approved',checker_actor=c.actor,
    approved_at=now(),self_approval_attestation=v_attest,
    proposed_counterparty=null,match_fingerprint=null,
    checked_via_rule_id=v_checked_via_rule,updated_at=now()
    where id=p_entry;
  if e.reversal_of is not null then
    update clara.journal_entries set reversed_by=p_entry,
      reversal_reason=coalesce(e.reversal_reason,'reversal'),updated_at=now()
      where id=e.reversal_of and reversed_by is null;
  end if;

  -- H2 CARVE-OUT: sightings + auto-proposal are HUMAN-only. A rule-posted approval
  -- (checked_via_rule_id set) writes NO sighting and triggers NO proposal — else
  -- rules would breed rules from their own output (WA2-R9). The v_seen pool also
  -- filters to human-checked entries (checked_via_rule_id is null).
  -- 0016 P2 (§3.1): sightings are SIDE-aware. The 0015 debit pool states
  -- side='debit' explicitly; income-class CREDIT legs additionally record
  -- side='credit' sightings — the evidence pool for the sales-direction
  -- autopost floors. The 3-sighting vendor_account auto-proposal stays
  -- side='debit'-scoped (pin P2). The H2 carve-out + reversal guard above are
  -- verbatim.
  if v_counterparty is not null and e.reversal_of is null and v_checked_via_rule is null then
    insert into clara.rule_sightings(firm_id,client_id,counterparty_id,account_code,entry_id,side)
      select distinct c.firm,e.client_id,v_counterparty,l.account_code,p_entry,'debit'
      from clara.journal_lines l join clara.coa_accounts a
        on a.client_id=l.client_id and a.account_code=l.account_code
      where l.entry_id=p_entry and l.debit_cents>0 and a.is_active
      on conflict on constraint uq_rule_sightings_mapping do nothing;
    insert into clara.rule_sightings(firm_id,client_id,counterparty_id,account_code,entry_id,side)
      select distinct c.firm,e.client_id,v_counterparty,l.account_code,p_entry,'credit'
      from clara.journal_lines l join clara.coa_accounts a
        on a.client_id=l.client_id and a.account_code=l.account_code
      where l.entry_id=p_entry and l.credit_cents>0 and a.is_active
        and a.account_type='income'
      on conflict on constraint uq_rule_sightings_mapping do nothing;

    -- ADV-2: the vendor_account auto-proposal breeds ONLY for canonical
    -- VENDOR-kind counterparties onto NON-CONTROL accounts — a customer's AR
    -- control debit sighting must never spawn a vendor_account rule (nor a
    -- blocking vendor question) binding a customer to the receivable control.
    for v_map in select distinct s.account_code from clara.rule_sightings s
        join clara.coa_accounts am on am.client_id=s.client_id and am.account_code=s.account_code
        where s.entry_id=p_entry and s.counterparty_id=v_counterparty and s.side='debit'
          and coalesce(am.account_class,'') not in ('payable','receivable')
          and exists(select 1 from clara.counterparties cpv
            where cpv.id=v_counterparty and cpv.kind='vendor'
              and cpv.merged_into is null and cpv.retired_at is null)
    loop
      select count(distinct s.entry_id)::int into v_seen
      from clara.rule_sightings s join clara.journal_entries j on j.id=s.entry_id
      where s.client_id=e.client_id and s.account_code=v_map.account_code and s.side='debit'
        and clara._canonical_counterparty(e.client_id,s.counterparty_id)=v_counterparty
        and j.status='approved' and j.reversed_by is null and j.checked_via_rule_id is null;
      if v_seen=3 and not exists(select 1 from clara.coding_rules r
          where r.client_id=e.client_id and r.counterparty_id=v_counterparty
            and r.rule_type='vendor_account' and r.status in ('proposed','live')) then
        insert into clara.coding_rules(firm_id,client_id,rule_type,counterparty_id,
            account_code,status,pinned,origin,content_hash,created_by)
          values(c.firm,e.client_id,'vendor_account',v_counterparty,v_map.account_code,
            'proposed',false,'proposed',encode(clara._hash(jsonb_build_object(
              'type','vendor_account','client',e.client_id,'counterparty',v_counterparty,
              'account_code',v_map.account_code)),'hex'),c.actor)
          returning id into v_rule;
        insert into clara.open_questions(firm_id,client_id,scope_kind,scope_id,
            counterparty_id,origin,question_text,status,opener_kind,opened_by,spawned_rule_id)
          values(c.firm,e.client_id,'vendor',v_counterparty,v_counterparty,
            'rule_proposal','Use account '||v_map.account_code||' for this vendor?',
            'open','human',c.actor,v_rule) returning id into v_question_id;
        perform clara._append_event(c.firm,'kb_rule.proposed',e.client_id,c.actor,null,null,
          null,null,null,jsonb_build_object('rule_id',v_rule,'question_id',v_question_id,
            'counterparty_id',v_counterparty,'account_code',v_map.account_code));
      end if;
    end loop;
  end if;

  perform clara._audit(c.firm,c.actor,null,null,'approve_entry',p_entry,
    jsonb_build_object('filing',e.filing_id,'counterparty',v_counterparty,'op_key',p_op_key,
      'checked_via_rule_id',v_checked_via_rule));
  if v_created then
    perform clara._append_event(c.firm,'counterparty.created',e.client_id,c.actor,null,null,
      null,null,null,jsonb_build_object('counterparty_id',v_counterparty));
  end if;
  perform clara._append_event(c.firm,'entry.approved',e.client_id,c.actor,null,null,
    p_entry,e.document_id,null,'{}'::jsonb);
  if e.reversal_of is not null then
    perform clara._append_event(c.firm,'entry.reversed',e.client_id,c.actor,null,null,
      e.reversal_of,null,null,'{}'::jsonb);
  end if;
  return clara._finish_op(c.firm,'approve_entry',p_op_key,
    jsonb_build_object('entry_id',p_entry,'status','approved'));
end $function$
;

CREATE OR REPLACE FUNCTION clara.execute_rule_post(p_entry uuid, p_op_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'clara', 'pg_temp'
AS $function$
declare
  e record; r record; v_direction text; v_kind text; v_fp jsonb;
  v_counterparty uuid; v_total bigint; v_window_start timestamptz; v_count int;
  v_result jsonb; v_run uuid; v_ctrl_total int; v_ctrl_ok int; v_detail text;
  v_state jsonb; v_gross bigint; v_tax bigint; v_ctrl_amount bigint;
  v_signed_ok int; v_signed_wrong int; v_sst_legs int; v_sst_amt bigint;
  v_round_legs int; v_round_imb bigint; v_outside_legs int;
  v_net bigint; v_round bigint; v_inv_id text; v_inv_date text;
  v_kind_doc text; v_fx uuid; v_sup_reg text; v_sup_name text;
  v_cust_reg text; v_cust_taxid text; v_cust_name text; v_client_name text;
  v_hard_ok boolean; v_name_ok boolean; v_buyer_hit boolean;
  v_due_c int; v_due_amt bigint; v_skips int; v_suspended boolean:=false;
  v_doc_lane text; v_doc_class text; v_verdict jsonb; v_lane_n int;
  v_cust_name_raw text; v_cust_reg_raw text; v_buyer_fp jsonb; v_buyer_id uuid;
  v_fseen int; v_fdocs int; v_fspan int;
  v_sc bigint; v_disc bigint; v_dlv bigint; v_sc_c int; v_disc_c int; v_dlv_c int;
  -- 0023 (X5, K-round): the reader receipt, and the per-field agreement it records.
  v_env jsonb; v_net_agreed boolean; v_tax_agreed boolean;
  -- 0029 (Slot C): position-0 receipts and prefix-consistent lock locators.
  v_locator record; v_dedupe jsonb; v_reserved_revision uuid;
  v_filing uuid; v_approve_op_key text; v_locked_rule_ids uuid[];
  -- 0029 (Slot C): post-time binding pins and typed resolution outcome.
  b record; cpb record; v_facts_envelope jsonb; v_vi jsonb;
  v_facts_extraction uuid; v_ocr_extraction uuid;
  v_draft_resolution uuid; v_draft_binding uuid;
  v_draft_facts uuid; v_draft_ocr uuid;
  v_resolution_facts uuid; v_resolution_ocr uuid;
  v_vendor_name text; v_vendor_registration text;
  v_invoice_id_norm text; v_f1_current text;
  v_page_fp jsonb; v_page_counterparty uuid; v_page_candidate uuid;
  v_binding_reason text; v_binding_outcome text;
  v_binding_matches int; v_matching_binding uuid; v_matching_f2 text;
  v_f1_ok boolean; v_f2_ok boolean; v_matching_f2_ok boolean; v_f3_ok boolean;
  v_binding_live boolean; v_page_same boolean:=false;
  v_page_birth boolean:=false; v_page_ambiguous boolean:=false;
  v_a1_clean boolean:=false;
  v_receipt_ambiguous boolean:=false;
  v_receipt_uncorroborated boolean:=false;
begin
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;

  -- Position 0. The function has no firm parameter, so this first read is a
  -- locator only. No decision is made from it: every eligibility check below
  -- runs after the authoritative FOR UPDATE refresh, and a revision race is a
  -- typed stale_revision skip.
  select firm_id,client_id,document_id,source_doc_sha256,filing_id,revision_token
    into v_locator
  from clara.journal_entries
  where id=p_entry;
  if not found then raise exception 'entry not found' using errcode='CLR11'; end if;
  v_reserved_revision:=v_locator.revision_token;
  v_approve_op_key:=p_op_key;

  v_dedupe:=clara._reserve_op(v_locator.firm_id,'execute_rule_post',p_op_key,
    clara._hash(jsonb_build_object('e',p_entry)));
  if v_dedupe is not null then return v_dedupe; end if;
  v_dedupe:=clara._reserve_op(v_locator.firm_id,'approve_entry',v_approve_op_key,
    clara._hash(jsonb_build_object('e',p_entry,'rev',v_reserved_revision,
      'att',null)));
  if v_dedupe is not null then return v_dedupe; end if;

  -- Total-order law: coding_rules -> document_filings -> journal_entries.
  -- Lock the client's live autopost set exactly once and retain the ids from
  -- that snapshot. PostgreSQL does not allow FOR UPDATE on an aggregate query,
  -- so the deterministic locking SELECT lives in a derived table and the outer
  -- aggregate only captures its already-locked rows.
  select coalesce(
      array_agg(locked.id order by locked.id),'{}'::uuid[]
    ) into v_locked_rule_ids
  from (
    select cr.id
    from clara.coding_rules cr
    where cr.client_id=v_locator.client_id
      and cr.rule_type='autopost' and cr.status='live'
    order by cr.id
    for update
  ) locked;

  -- Identical helper/row/mode to _approve_entry_core: FOR SHARE OF f.
  if v_locator.document_id is not null then
    v_filing:=clara._active_document_filing(
      v_locator.document_id,v_locator.source_doc_sha256,
      v_locator.client_id,true);
    if v_filing<>v_locator.filing_id then
      raise exception 'entry is not bound to the active filing'
        using errcode='CLR02';
    end if;
  end if;

  select * into e
  from clara.journal_entries
  where id=p_entry
  for update;
  if not found or e.firm_id<>v_locator.firm_id then
    raise exception 'entry not found' using errcode='CLR11';
  end if;
  if e.revision_token is distinct from v_reserved_revision then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,null,'stale_revision');
    return jsonb_build_object('entry_id',p_entry,'status','skipped',
      'reason','stale_revision');
  end if;

  if e.status<>'draft' then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,null,'not_a_draft');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','not_a_draft');
  end if;
  if e.coding_kind is null then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,null,'ineligible_no_coding_kind');
    return jsonb_build_object('entry_id',p_entry,'status','skipped',
      'reason','ineligible_no_coding_kind');
  end if;
  if e.document_id is null then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,null,'ineligible_no_document');
    return jsonb_build_object('entry_id',p_entry,'status','skipped',
      'reason','ineligible_no_document');
  end if;
  if e.proposed_counterparty is null then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,null,'ineligible_no_counterparty');
    return jsonb_build_object('entry_id',p_entry,'status','skipped',
      'reason','ineligible_no_counterparty');
  end if;

  -- ADV-R2 (R1#1): ONE BOUND EXTRACTION per document per post, resolved BEFORE
  -- the direction step (direction itself consumes the doc's facts). A document
  -- with done facts in BOTH lanes (a historical OCR pass beside a later XML
  -- parse) is inherently ambiguous evidence — a named visible skip, never a
  -- coin-flip between potentially disagreeing extractions. With exactly one
  -- done lane the extraction is bound ONCE (v_fx) and every consumer — the
  -- direction, the class check, the fact state, and every envelope field —
  -- reads that SAME single-lane extraction.
  select count(distinct t.lane)::int into v_lane_n
    from clara.document_processing_tasks t
    join clara.document_extractions x on x.document_id=t.document_id
      and x.engine_id=t.engine_id and x.version_n=t.version_n
      and x.engine_kind='invoice_facts' and x.status='done'
    where t.document_id=e.document_id
      and t.lane in ('invoice_facts','local_facts') and t.status='done';
  if v_lane_n>1 then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,null,'evidence_lane_ambiguous');
    return jsonb_build_object('entry_id',p_entry,'status','skipped',
      'reason','evidence_lane_ambiguous');
  end if;
  select t.lane,x.id into v_doc_lane,v_fx
    from clara.document_processing_tasks t
    join clara.document_extractions x on x.document_id=t.document_id
      and x.engine_id=t.engine_id and x.version_n=t.version_n
      and x.engine_kind='invoice_facts' and x.status='done'
    where t.document_id=e.document_id
      and t.lane in ('invoice_facts','local_facts') and t.status='done'
    order by t.version_n desc,t.id desc limit 1;
  -- ADV-R4#1: ZERO done lanes = facts-absent — a named skip BEFORE direction.
  -- The post path NEVER proceeds unpinned: a later/concurrent extraction commit
  -- could otherwise be picked up mid-post by the live selectors.
  if v_fx is null then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,null,'facts_missing');
    return jsonb_build_object('entry_id',p_entry,'status','skipped',
      'reason','facts_missing');
  end if;

  -- direction (client-aware, pinned to the ONE bound extraction — ADV-R3#1) —
  -- an unresolved direction is a skip, never a raise.
  begin
    v_direction:=clara._document_direction_at(e.document_id,e.client_id,v_fx);
  exception when sqlstate 'CLR30' then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,null,'direction_unresolved');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','direction_unresolved');
  end;
  v_kind:=case when v_direction='sales' then 'customer' else 'vendor' end;

  -- resolve the draft's counterparty (kind-scoped by direction) to match the rule.
  begin
    v_fp:=clara._resolve_counterparty(e.client_id,
      e.proposed_counterparty || jsonb_build_object('kind',v_kind));
  exception when sqlstate 'CLR23' then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,null,'counterparty_ambiguous');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','counterparty_ambiguous');
  end;
  if v_fp is null or v_fp->>'decision'='birth' then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,null,'counterparty_unresolved');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','counterparty_unresolved');
  end if;
  v_counterparty:=clara._canonical_counterparty(e.client_id,(v_fp->>'counterparty_id')::uuid);

  -- Exact lookup is intentionally PLAIN: only rows captured and locked by the
  -- single acquisition above are eligible in this pass. A proposed row that
  -- became live after that snapshot is a no_live_rule retry, never a new lock
  -- acquired after filing/entry.
  select * into r from clara.coding_rules
    where id=any(v_locked_rule_ids)
      and client_id=e.client_id and counterparty_id=v_counterparty
      and direction=v_direction and rule_type='autopost' and status='live';
  if not found then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,null,'no_live_rule');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','no_live_rule');
  end if;

  -- RE-DERIVE every gate against live rows -----------------------------------
  if clara.is_high_stakes(p_entry) then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,r.id,'high_stakes');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','high_stakes');
  end if;
  -- 0016 P2(e)/P6: CN autopost is IMPOSSIBLE — a sales_credit_note draft skips
  -- by NAME (the 0015 control-shape refusal was incidental; this is the law).
  if v_direction='sales' and e.coding_kind='sales_credit_note' then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,r.id,'cn_not_autopostable');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','cn_not_autopostable');
  end if;
  -- 0016 P4 (WA21-R1): the sst_purchase_cost visibility leg is NOT sanctioned
  -- for autopost — human lanes only. A purchase draft carrying one skips by
  -- NAME before the generic account enumeration.
  if v_direction='purchase' and exists(select 1 from clara.journal_lines l
      join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
      where l.entry_id=p_entry and coalesce(a.special_acc_type,'')='sst_purchase_cost') then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,r.id,'purchase_sst_not_autopostable');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','purchase_sst_not_autopostable');
  end if;
  -- FIX-1+7 (adversarial laundering — COUNT+IDENTITY enumeration, REPLACING the v2
  -- Σ|dr−cr| tolerance). N tiny decoy legs could inflate a sum tolerance (each extra leg
  -- lifts the old greatest(5,n_legs) bound), and the old sst_output exemption was an
  -- untied free bucket. Instead the entry's legs must form EXACTLY the sanctioned set,
  -- verified by leg COUNT + account IDENTITY — there is NO aggregate tolerance to inflate.
  -- The post is REJECTED (control_shape / account_mismatch skip) if ANY of these fails:
  --   (a) EXACTLY ONE direction-correct control leg (purchase => one payable CREDIT;
  --       sales => one receivable DEBIT), whose amount = the stated gross when the facts
  --       state one (a control<>gross entry never auto-posts — the DB owns the number);
  --   (b) >= 1 leg to the rule's signed account on the direction-correct side, and ZERO
  --       signed-account legs on the wrong side;
  --   (c) sst_output is a SALES-side (output-tax) role ONLY (FIX-2 v4). On a SALES post it
  --       is a sanctioned role bounded to AT MOST ONE leg tied to the stated tax fact
  --       (invoice.tax_total). On a PURCHASE post it is NOT sanctioned at all — a purchase
  --       sst_output leg is an OUTSIDE leg (Malaysian purchase SST is expensed INTO cost,
  --       expense=gross; a separate sst leg is the item-7 laundering vector) → refuse (e).
  --   (d) AT MOST ONE rounding leg (special_acc_type='rounding'), |dr−cr| <= 5 sen;
  --   (e) ZERO legs to ANY OTHER account (every leg is one of the sanctioned roles above —
  --       a decoy leg to an unaccounted account, at ANY count or size, refuses — closes item
  --       1; on a purchase an sst_output leg lands here too — closes item 2). 0016: an
  --       sst_purchase_cost leg is never sanctioned either — the named skip above fires
  --       first on a purchase; on a sales draft it lands here as an outside leg.
  -- (v_fx/v_doc_lane were bound ONCE at the top of the fn — ADV-R2 R1#1.)
  v_state := case when v_fx is null then '{}'::jsonb
    else clara._invoice_fact_state_at(e.document_id,v_fx) end;
  v_gross := nullif(v_state->>'total_cents','')::bigint;
  v_tax   := nullif(v_state->>'tax_total_cents','')::bigint;

  -- (a) the single direction-correct control leg + its amount.
  select
    count(*) filter (where a.account_class in ('payable','receivable')),
    count(*) filter (where (v_direction='purchase' and a.account_class='payable'    and l.credit_cents>0)
                        or (v_direction='sales'    and a.account_class='receivable' and l.debit_cents>0)),
    coalesce(sum(case when v_direction='purchase' and a.account_class='payable'    then l.credit_cents
                      when v_direction='sales'    and a.account_class='receivable' then l.debit_cents
                      else 0 end),0)
    into v_ctrl_total, v_ctrl_ok, v_ctrl_amount
    from clara.journal_lines l
    join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
    where l.entry_id=p_entry;
  if v_ctrl_total<>1 or v_ctrl_ok<>1
     or (v_gross is not null and v_ctrl_amount<>v_gross) then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,r.id,'control_shape');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','control_shape');
  end if;

  -- (b) signed-account legs by side; (c) sst_output legs + tied magnitude; (d) rounding
  -- legs + imbalance; (e) legs to an account OUTSIDE the four sanctioned roles. Every leg
  -- is classified by its account (join to coa_accounts) — count+identity, never a Σ bound.
  select
    count(*) filter (where l.account_code=r.account_code
      and ((v_direction='purchase' and l.debit_cents>0) or (v_direction='sales' and l.credit_cents>0))),
    count(*) filter (where l.account_code=r.account_code
      and ((v_direction='purchase' and l.credit_cents>0) or (v_direction='sales' and l.debit_cents>0))),
    count(*) filter (where coalesce(a.special_acc_type,'')='sst_output'),
    coalesce(sum(l.debit_cents+l.credit_cents) filter (where coalesce(a.special_acc_type,'')='sst_output'),0),
    count(*) filter (where coalesce(a.special_acc_type,'')='rounding'),
    coalesce(sum(abs(l.debit_cents-l.credit_cents)) filter (where coalesce(a.special_acc_type,'')='rounding'),0),
    count(*) filter (where coalesce(a.account_class,'') not in ('payable','receivable')
      and l.account_code<>r.account_code
      and coalesce(a.special_acc_type,'')<>'rounding'
      and not (v_direction='sales' and coalesce(a.special_acc_type,'')='sst_output'))
    into v_signed_ok, v_signed_wrong, v_sst_legs, v_sst_amt, v_round_legs, v_round_imb, v_outside_legs
    from clara.journal_lines l
    join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
    where l.entry_id=p_entry;
  if v_signed_ok<1 or v_signed_wrong>0
     or v_outside_legs>0
     or v_sst_legs>1 or (v_sst_legs=1 and (v_tax is null or v_sst_amt<>v_tax))
     or v_round_legs>1 or v_round_imb>5 then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,r.id,'account_mismatch');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','account_mismatch');
  end if;
  select coalesce(sum(debit_cents),0) into v_total from clara.journal_lines where entry_id=p_entry;
  if v_total>r.amount_cap_cents then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,r.id,'over_cap');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','over_cap');
  end if;
  v_window_start:=case when r.frequency_window='monthly'
    then (date_trunc('month',now() at time zone 'utc') at time zone 'utc')
    else now()-interval '30 days' end;
  select count(*)::int into v_count from clara.rule_post_runs
    where rule_id=r.id and posted_at>=v_window_start;
  if v_count>=r.window_max_posts then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,r.id,'window_exhausted');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','window_exhausted');
  end if;
  if r.expires_at<=now() then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,r.id,'expired');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','expired');
  end if;
  if e.revision_token is null then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,r.id,'no_revision');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','no_revision');
  end if;

  -- FIX v5 (item 5 — CORROBORATION-REQUIRED to auto-post): the confidence ladder auto-posts
  -- ONLY DB-VERIFIED entries. Every rule gate above re-derives cap/window/shape, but the
  -- control-leg tie (a) only anchors to gross when gross is non-NULL. A NON-corroborated
  -- document — a blank / malformed / unreadable total, or ANY state short of Tier-A — leaves
  -- v_gross NULL, so the tie stays inert and an interactive wake draft (the runtime submits
  -- EVERY coded entry.drafted to this executor — rule-post.mjs, not only autodraft) could cite
  -- a non-total region, carry an ARBITRARY under-cap balanced amount, and be auto-posted with
  -- no verified anchor ("the DB owns every number"). Require the document fact-state's
  -- `corroborated` signal to be true before driving the post; otherwise SKIP `not_corroborated`
  -- and leave the entry in the human queue. This is the executor's ADMISSION gate, not a persist
  -- refusal: `invoice.total` still persists blank/non-corroborated at the write boundary
  -- (fail-closed, unchanged). A corroborated bill (gross verified ⇒ the (a) tie already fired)
  -- is unaffected — the positive path still auto-posts. Placed LAST so every specific rule-gate
  -- skip (control_shape / account_mismatch / over_cap / window_exhausted / expired / no_revision)
  -- still fires first for a shaped-but-non-corroborated draft; a CLEAN-shaped non-corroborated
  -- draft (the residual-5 laundering path) lands here.
  if not coalesce((v_state->>'corroborated')::boolean,false) then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,r.id,'not_corroborated');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','not_corroborated');
  end if;

  -- ADV-1: the DOCUMENT's ACTUAL evidence class, derived from its latest done
  -- facts task lane (the local no-egress MyInvois parse = 'structured'; the
  -- Azure OCR lane = 'ocr_sales') — NEVER from the rule label alone. A signed
  -- class that does not match the document's real extraction source is a named
  -- visible skip: an OCR document can never ride a 'structured' rule around
  -- the envelope, and an XML document never consumes an OCR authority.
  if v_direction='sales' then
    -- ADV-R2 (R1#1): the class derives from the ONE BOUND lane resolved above
    -- (v_doc_lane rides the same single resolution as v_fx and v_state).
    v_doc_class:=case v_doc_lane when 'local_facts' then 'structured'
                                 when 'invoice_facts' then 'ocr_sales' end;
    if v_doc_class is null or v_doc_class is distinct from r.evidence_class then
      insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
        values(e.firm_id,e.client_id,p_entry,r.id,'evidence_class_mismatch');
      return jsonb_build_object('entry_id',p_entry,'status','skipped',
        'reason','evidence_class_mismatch','document_class',v_doc_class,
        'rule_class',r.evidence_class);
    end if;
  end if;

  -- 0016 §3.3: the OCR compensating-control envelope, RE-DERIVED at post time
  -- (control 8 — no trust in signing-time state).
  if v_direction='sales' and r.evidence_class='ocr_sales' then
    -- (a) positive polarity evidence (ADV-3: a done classifier row is not by
    -- itself positive evidence — the WINNING verdict must POSITIVELY say
    -- 'invoice'): the human correction outranks classifier verdicts; among
    -- classifier rows the newest version wins; the verdict must be
    -- high-confidence (>=0.8, never low_confidence) or human, and must agree
    -- with the CURRENT document_kind.
    select d2.document_kind into v_kind_doc from clara.documents d2 where d2.id=e.document_id;
    select x.envelope into v_verdict from clara.document_extractions x
      where x.document_id=e.document_id and x.engine_kind='doc_classify'
        and x.status='done'
      order by case when x.envelope->>'source'='human' then 0 else 1 end,
        x.version_n desc limit 1;
    if v_kind_doc is distinct from 'invoice'
       or v_verdict is null
       or (v_verdict->>'verdict_kind') is distinct from 'invoice'
       or coalesce((v_verdict->>'low_confidence')::boolean,false)
       or not ((v_verdict->>'source')='human'
               or coalesce((v_verdict->>'confidence')::numeric,0)>=0.8) then
      insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
        values(e.firm_id,e.client_id,p_entry,r.id,'polarity_unverified');
      select count(*)::int into v_skips from clara.rule_post_skips
        where rule_id=r.id and reason in ('polarity_unverified','direction_unproven')
          and created_at>=now()-interval '30 days';
      if v_skips>=3 then
        update clara.coding_rules set status='suspended_pending_resignature' where id=r.id;
        v_suspended:=true;
        begin
          perform clara._record_notification_core(r.signed_by,e.firm_id,null,null,
            r.client_id,'autopost_rule_suspended',
            jsonb_build_object('rule_id',r.id,'counterparty_id',r.counterparty_id,
              'message','An OCR-sales auto-post rule was suspended after repeated polarity/direction skips. Review the drafts and sign a successor to re-enable.'),
            'autopost-suspend:'||r.id::text);
        exception when others then null;
        end;
      end if;
      return jsonb_build_object('entry_id',p_entry,'status','skipped',
        'reason','polarity_unverified','rule_suspended',v_suspended);
    end if;
    -- (b) hard direction evidence — every field reads the ONE BOUND extraction
    -- (v_fx, resolved once above; ADV-R2 R1#1).
    select lower(regexp_replace(nullif(btrim(min(dr.text_content)),''),'[^a-zA-Z0-9]','','g'))
      into v_sup_reg from clara.document_regions dr
      where dr.extraction_id=v_fx and dr.field_path='invoice.vendor_registration';
    select lower(regexp_replace(nullif(btrim(min(dr.text_content)),''),'[^a-zA-Z0-9]','','g'))
      into v_sup_name from clara.document_regions dr
      where dr.extraction_id=v_fx and dr.field_path='invoice.vendor_name';
    select lower(regexp_replace(nullif(btrim(min(dr.text_content)),''),'[^a-zA-Z0-9]','','g'))
      into v_cust_reg from clara.document_regions dr
      where dr.extraction_id=v_fx and dr.field_path='invoice.customer_registration';
    select lower(regexp_replace(nullif(btrim(min(dr.text_content)),''),'[^a-zA-Z0-9]','','g'))
      into v_cust_taxid from clara.document_regions dr
      where dr.extraction_id=v_fx and dr.field_path='invoice.customer_taxid';
    select lower(regexp_replace(nullif(btrim(min(dr.text_content)),''),'[^a-zA-Z0-9]','','g'))
      into v_cust_name from clara.document_regions dr
      where dr.extraction_id=v_fx and dr.field_path='invoice.customer_name';
    select lower(regexp_replace(name,'[^a-zA-Z0-9]','','g')) into v_client_name
      from clara.clients where id=e.client_id;
    v_hard_ok:=v_sup_reg is not null and exists(select 1 from clara.client_identifiers ci
      where ci.client_id=e.client_id and ci.kind in ('tin','ssm')
        and ci.value_normalized=v_sup_reg);
    v_name_ok:=v_sup_name is not null and (v_sup_name=v_client_name
      or exists(select 1 from clara.client_aliases al where al.client_id=e.client_id
          and al.retired_at is null and al.alias_normalized=v_sup_name));
    v_buyer_hit:=
      (v_cust_reg is not null and exists(select 1 from clara.client_identifiers ci
        where ci.client_id=e.client_id and ci.kind in ('tin','ssm')
          and ci.value_normalized=v_cust_reg))
      or (v_cust_taxid is not null and exists(select 1 from clara.client_identifiers ci
        where ci.client_id=e.client_id and ci.kind in ('tin','ssm')
          and ci.value_normalized=v_cust_taxid))
      or (v_cust_name is not null and (v_cust_name=v_client_name
        or exists(select 1 from clara.client_aliases al where al.client_id=e.client_id
            and al.retired_at is null and al.alias_normalized=v_cust_name)));
    if not (v_hard_ok and v_name_ok) or v_buyer_hit then
      insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
        values(e.firm_id,e.client_id,p_entry,r.id,'direction_unproven');
      select count(*)::int into v_skips from clara.rule_post_skips
        where rule_id=r.id and reason in ('polarity_unverified','direction_unproven')
          and created_at>=now()-interval '30 days';
      if v_skips>=3 then
        update clara.coding_rules set status='suspended_pending_resignature' where id=r.id;
        v_suspended:=true;
        begin
          perform clara._record_notification_core(r.signed_by,e.firm_id,null,null,
            r.client_id,'autopost_rule_suspended',
            jsonb_build_object('rule_id',r.id,'counterparty_id',r.counterparty_id,
              'message','An OCR-sales auto-post rule was suspended after repeated polarity/direction skips. Review the drafts and sign a successor to re-enable.'),
            'autopost-suspend:'||r.id::text);
        exception when others then null;
        end;
      end if;
      return jsonb_build_object('entry_id',p_entry,'status','skipped',
        'reason','direction_unproven','rule_suspended',v_suspended);
    end if;
    -- (b2) ADV-4: stated-buyer <-> signed-counterparty CONGRUENCE. Control (b)
    -- proves only that the buyer is NOT the client; the invoice's stated buyer
    -- must ALSO resolve (kind-scoped, no birth ever) to the SAME canonical
    -- customer the signed rule names — an invoice billing Buyer B can never be
    -- posted through Customer A's authority. Absence, ambiguity, birth, or a
    -- registration contradiction is a named visible skip.
    select nullif(btrim(min(dr.text_content)),'') into v_cust_name_raw
      from clara.document_regions dr
      where dr.extraction_id=v_fx and dr.field_path='invoice.customer_name';
    select nullif(btrim(min(dr.text_content)),'') into v_cust_reg_raw
      from clara.document_regions dr
      where dr.extraction_id=v_fx and dr.field_path='invoice.customer_registration';
    v_buyer_id:=null;
    if v_cust_name_raw is not null then
      begin
        v_buyer_fp:=clara._resolve_counterparty(e.client_id,jsonb_strip_nulls(
          jsonb_build_object('kind','customer','new',jsonb_build_object(
            'name',v_cust_name_raw,'registration_no',v_cust_reg_raw))));
        if v_buyer_fp is not null and v_buyer_fp->>'decision'<>'birth'
           and (v_buyer_fp->>'counterparty_id') is not null then
          v_buyer_id:=clara._canonical_counterparty(e.client_id,
            (v_buyer_fp->>'counterparty_id')::uuid);
        end if;
      exception when sqlstate 'CLR23' or sqlstate 'CLR21' then
        v_buyer_id:=null; -- ambiguity/contradiction => mismatch below
      end;
    end if;
    if v_buyer_id is null
       or v_buyer_id is distinct from clara._canonical_counterparty(e.client_id,r.counterparty_id) then
      insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
        values(e.firm_id,e.client_id,p_entry,r.id,'buyer_mismatch');
      return jsonb_build_object('entry_id',p_entry,'status','skipped',
        'reason','buyer_mismatch');
    end if;
    -- (c) full multi-anchor corroboration.
    v_net:=nullif(v_state->>'total_excl_tax_cents','')::bigint;
    v_round:=nullif(v_state->>'rounding_cents','')::bigint;
    v_inv_id:=nullif(v_state->>'invoice_id','');
    v_inv_date:=nullif(v_state->>'invoice_date','');
    select count(*)::int,min(dr.monetary_cents) into v_due_c,v_due_amt
      from clara.document_regions dr
      where dr.extraction_id=v_fx and dr.field_path='invoice.amount_due';
    -- 0022 (X3): the stated components of the corrected identity, read off the SAME bound
    -- extraction as every other anchor field.
    select count(*)::int,min(dr.monetary_cents) into v_sc_c,v_sc
      from clara.document_regions dr
      where dr.extraction_id=v_fx and dr.field_path='invoice.service_charge';
    select count(*)::int,min(dr.monetary_cents) into v_disc_c,v_disc
      from clara.document_regions dr
      where dr.extraction_id=v_fx and dr.field_path='invoice.discount';
    select count(*)::int,min(dr.monetary_cents) into v_dlv_c,v_dlv
      from clara.document_regions dr
      where dr.extraction_id=v_fx and dr.field_path='invoice.delivery';
    -- 0023 (X5): THE DARK DISJUNCT IS GONE. It was an unconditional leading term that held
    -- this whole block true, keeping the OCR-sales anchor lane structurally shut while X2
    -- taught the mapper to emit net and tax. Deleting it is the deliberate act 0022's §D
    -- reserved for this migration and no other. NOTE THE WORDING: the marker string 0022 used
    -- must not appear anywhere in this body — nor the disjunct's own text — because the test
    -- harness detects the guard by grepping prosrc for the marker, and 0022's tail matches the
    -- disjunct over comment-stripped source. A comment SAYING the guard is gone would report
    -- it ARMED while the lane ran open, which is the worst of both. Every condition below is
    -- byte-identical to 0022's,
    -- and the two controls the block SHADOWED while it was armed — `customer_unresolved` at
    -- (d) and `floor_lost` at (e2) — become reachable again for the first time.
    if v_gross is null or v_inv_id is null or v_inv_date is null
       or v_net is null or v_tax is null
       or (v_sc_c>0 and v_sc is null) or (v_disc_c>0 and v_disc is null)
       or (v_dlv_c>0 and v_dlv is null)
       -- The sign belt, mirroring the shape floor (adversarial round 1 — FATAL): a
       -- NEGATIVE discount turns the identity's subtraction into an addition and forges
       -- a larger gross that ties. The write boundary refuses one; this makes the anchor
       -- lane refuse one too, so removing the dark guard at X5 cannot open on a forged
       -- identity even if a component arrived by some other path.
       or coalesce(v_sc,0)<0 or coalesce(v_disc,0)<0 or coalesce(v_dlv,0)<0
       or (v_net+coalesce(v_sc,0)+coalesce(v_dlv,0)+v_tax+coalesce(v_round,0)
           -coalesce(v_disc,0))<>v_gross
       or v_due_c<>1 or v_due_amt is null or v_due_amt<>v_gross then
      insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
        values(e.firm_id,e.client_id,p_entry,r.id,'anchor_missing');
      return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','anchor_missing');
    end if;
    -- (d) an EXISTING resolved customer, re-derived live (no birth ever).
    if not exists(select 1 from clara.counterparties cp where cp.id=r.counterparty_id
        and cp.client_id=e.client_id and cp.kind='customer'
        and cp.merged_into is null and cp.retired_at is null) then
      insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
        values(e.firm_id,e.client_id,p_entry,r.id,'customer_unresolved');
      return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','customer_unresolved');
    end if;
    -- (e2) ADV-5: the sighting FLOOR re-derived atomically at post time, under
    -- the client serialization lock (the same advisory lock the approve core
    -- takes — reentrant in this transaction, so a concurrent reversal cannot
    -- slip between the floor check and the post). Evidence reversed since
    -- signing strips the live authority: a named visible skip.
    perform pg_advisory_xact_lock(203005004,hashtext(e.client_id::text));
    select f.qualifying,f.distinct_invoices,f.span_days into v_fseen,v_fdocs,v_fspan
      from clara._ocr_sales_floor(e.client_id,
        clara._canonical_counterparty(e.client_id,r.counterparty_id),r.account_code) f;
    if coalesce(v_fseen,0)<6 or coalesce(v_fdocs,0)<6 or v_fspan is null or v_fspan<60 then
      insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
        values(e.firm_id,e.client_id,p_entry,r.id,'floor_lost');
      return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','floor_lost');
    end if;
  end if;

  -- 0029 Slot C. The control is keyed on the durable entry marker. Unbound
  -- drafts never enter this block and take no vendor_identity_bindings lock.
  if e.vendor_binding_id is not null then
    select * into b
    from clara.vendor_identity_bindings
    where id=e.vendor_binding_id
    for update;
    if not found then
      raise exception 'binding marker has no authority row'
        using errcode='CLR36',
          detail='{"reason":"binding_changed"}';
    end if;

    select * into cpb
    from clara.counterparties
    where id=b.counterparty_id
      and firm_id=b.firm_id
      and client_id=b.client_id;

    -- Pin current latest-done facts and OCR in one statement snapshot. Calling
    -- the as-built _binding_f3_holds helper in this same statement makes its own
    -- latest-OCR selection coincide with v_ocr_extraction.
    select fx.id,fx.envelope,ox.id,
      vn.vendor_name,vr.vendor_registration,
      clara._binding_normalize(ii.invoice_id),
      clara._binding_f3_holds(
        e.document_id,cpb.registration_normalized,cpb.name_normalized),
      bm.match_count,bm.binding_id,bm.f2_invoice_prefix
      into v_facts_extraction,v_facts_envelope,v_ocr_extraction,
        v_vendor_name,v_vendor_registration,v_invoice_id_norm,v_f3_ok,
        v_binding_matches,v_matching_binding,v_matching_f2
    from (
      select x.id,x.envelope
      from clara.document_extractions x
      where x.document_id=e.document_id
        and x.engine_kind='invoice_facts' and x.status='done'
      order by x.version_n desc,x.id desc
      limit 1
    ) fx
    left join lateral (
      select x.id
      from clara.document_extractions x
      where x.document_id=e.document_id
        and x.engine_kind='ocr' and x.status='done'
      order by x.version_n desc,x.id desc
      limit 1
    ) ox on true
    left join lateral (
      select nullif(btrim(min(dr.text_content)),'') as vendor_name
      from clara.document_regions dr
      where dr.extraction_id=fx.id
        and dr.field_path='invoice.vendor_name'
    ) vn on true
    left join lateral (
      select nullif(btrim(min(dr.text_content)),'') as vendor_registration
      from clara.document_regions dr
      where dr.extraction_id=fx.id
        and dr.field_path='invoice.vendor_registration'
    ) vr on true
    left join lateral (
      select nullif(btrim(min(dr.text_content)),'') as invoice_id
      from clara.document_regions dr
      where dr.extraction_id=fx.id
        and dr.field_path='invoice.invoice_id'
    ) ii on true
    left join lateral (
      select count(*)::int as match_count,
        (array_agg(b2.id order by b2.id))[1] as binding_id,
        (array_agg(b2.f2_invoice_prefix order by b2.id))[1]
          as f2_invoice_prefix
      from clara.vendor_identity_bindings b2
      join clara.counterparties cp2
        on cp2.id=b2.counterparty_id
       and cp2.firm_id=b2.firm_id
       and cp2.client_id=b2.client_id
      where b2.client_id=e.client_id
        and b2.status='live' and b2.expires_at>now()
        and b2.f1_vendor_name_norm=
          clara._binding_normalize(vn.vendor_name)
        and cp2.merged_into is null and cp2.retired_at is null
        and cp2.registration_normalized is not distinct from
          b2.registration_at_signing
        and clara._binding_f3_holds(
          e.document_id,cp2.registration_normalized,cp2.name_normalized)
    ) bm on true;

    select vr.id,vr.binding_id,vr.facts_extraction_id,vr.ocr_extraction_id
      into v_draft_resolution,v_draft_binding,v_draft_facts,v_draft_ocr
    from clara.vendor_binding_resolutions vr
    where vr.entry_id=e.id and vr.phase='draft'
    order by vr.created_at desc,vr.id desc
    limit 1;

    v_resolution_facts:=coalesce(v_facts_extraction,v_draft_facts);
    v_resolution_ocr:=coalesce(v_ocr_extraction,v_draft_ocr);
    v_f1_current:=clara._binding_normalize(v_vendor_name);
    v_f1_ok:=v_f1_current is not distinct from b.f1_vendor_name_norm;
    v_f2_ok:=v_invoice_id_norm is not null
      and starts_with(v_invoice_id_norm,b.f2_invoice_prefix);
    v_matching_f2_ok:=coalesce(v_binding_matches,0)=1
      and v_invoice_id_norm is not null
      and starts_with(v_invoice_id_norm,v_matching_f2);
    v_binding_live:=b.status='live' and b.expires_at>now();

    -- Re-run the receipt half of A.1. The allowlist is identical to 0028's.
    -- For outcome='absent', the four always-present producer counters have
    -- exact values: absent=1 and matched/typed_collapsed/emitted=0.
    v_vi:=v_facts_envelope->'vendor_identity';
    if jsonb_typeof(v_vi) is distinct from 'object'
       or jsonb_typeof(v_vi->'candidates') is distinct from 'array' then
      v_binding_reason:='binding_receipt_unrecognized';
    elsif exists (
      select 1 from jsonb_object_keys(v_vi) k
      where k not in (
        'matched','absent','ambiguous','rejected_gate','below_band',
        'height_missing','unit_unresolved','no_geometry','label_continuation',
        'no_vendor_anchor','vendor_anchor_far','closer_to_customer',
        'typed_collapsed','typed_disagreement','typed_vs_ambiguous','emitted',
        'candidates','outcome','value_raw','occurrences','distinct_keys'
      )
    ) then
      v_binding_reason:='binding_receipt_unrecognized';
    elsif v_vi->>'outcome' not in (
      'absent','ambiguous','matched','typed_disagreement'
    ) then
      v_binding_reason:='binding_receipt_unrecognized';
    else
      if v_vi->>'outcome'='absent' then
        if v_vi->'absent' is distinct from '1'::jsonb
           or v_vi->'matched' is distinct from '0'::jsonb
           or v_vi->'typed_collapsed' is distinct from '0'::jsonb
           or v_vi->'emitted' is distinct from '0'::jsonb
           or v_vi ?| array[
             'value_raw','occurrences','distinct_keys'
           ] then
          v_binding_reason:='binding_receipt_unrecognized';
        elsif jsonb_array_length(v_vi->'candidates')<>0
           or exists (
             select 1
             from unnest(array[
               'ambiguous','typed_disagreement','typed_vs_ambiguous'
             ]) k
             where v_vi ? k and v_vi->k is distinct from '0'::jsonb
           ) then
          v_receipt_ambiguous:=true;
        elsif exists (
          select 1
          from unnest(array[
            'below_band','height_missing','unit_unresolved','no_geometry',
            'rejected_gate','label_continuation','no_vendor_anchor',
            'vendor_anchor_far','closer_to_customer'
          ]) k
          where v_vi ? k and v_vi->k is distinct from '0'::jsonb
        ) then
          v_receipt_uncorroborated:=true;
        elsif v_vendor_registration is null then
          v_a1_clean:=true;
        end if;
      elsif v_vi->>'outcome' in ('ambiguous','typed_disagreement') then
        v_receipt_ambiguous:=true;
      end if;
    end if;

    -- A.1 condition 5 and A.5 step 5 share one page-resolution attempt.
    -- Crucially, an extracted registration is supplied to the ordinary resolver:
    -- the previous name-only call could never exercise the equality-success path
    -- for a registered vendor. A clean absent receipt admits birth or a
    -- registration_conflict candidate equal to the binding; every other A.1
    -- failure may proceed only on a genuine ordinary resolution to that same
    -- counterparty.
    if v_binding_reason is null and v_vendor_name is not null then
      begin
        v_page_fp:=clara._resolve_counterparty(e.client_id,
          jsonb_strip_nulls(jsonb_build_object(
            'kind','vendor',
            'new',jsonb_build_object(
              'name',v_vendor_name,
              'registration_no',v_vendor_registration))));
      exception
        when sqlstate 'CLR21' then
          v_page_ambiguous:=true;
          v_page_fp:=null;
        when sqlstate 'CLR23' then
          declare
            v_detail_j jsonb;
          begin
            get stacked diagnostics v_detail=pg_exception_detail;
            begin
              v_detail_j:=nullif(v_detail,'')::jsonb;
            exception when others then
              v_detail_j:=null;
            end;
            if coalesce(v_detail_j->>'reason','')='registration_conflict' then
              begin
                v_page_candidate:=nullif(
                  v_detail_j->>'candidate_id','')::uuid;
              exception when others then
                v_page_candidate:=null;
              end;
            end if;
            if v_page_candidate is null then
              v_page_ambiguous:=true;
            end if;
            v_page_fp:=null;
          end;
      end;
    end if;
    if v_page_fp is not null and v_page_fp->>'decision'='birth' then
      v_page_birth:=true;
    elsif v_page_fp is not null
       and v_page_fp->>'decision'<>'birth' then
      begin
        v_page_counterparty:=clara._canonical_counterparty(
          e.client_id,(v_page_fp->>'counterparty_id')::uuid);
      exception when sqlstate 'CLR23' then
        v_page_counterparty:=null;
        v_page_ambiguous:=true;
      end;
      v_page_same:=v_page_counterparty is not null
        and v_page_counterparty is not distinct from b.counterparty_id;
    end if;

    if v_binding_reason is null then
      if v_receipt_ambiguous then
        v_binding_reason:='binding_ambiguous';
      elsif v_a1_clean then
        if v_page_birth
           or v_page_candidate is not distinct from b.counterparty_id
           or v_page_same then
          null;
        elsif v_page_candidate is not null
           or v_page_counterparty is not null then
          v_binding_reason:='binding_page_resolves_other';
        elsif v_page_ambiguous then
          v_binding_reason:='binding_ambiguous';
        else
          v_binding_reason:='binding_changed';
        end if;
      elsif v_page_same then
        null;
      elsif v_page_counterparty is not null then
        v_binding_reason:='binding_page_resolves_other';
      elsif v_page_ambiguous or v_page_candidate is not null then
        v_binding_reason:='binding_ambiguous';
      elsif v_receipt_uncorroborated then
        v_binding_reason:='binding_uncorroborated';
      else
        v_binding_reason:='binding_changed';
      end if;
    end if;

    if b.status='revoked' then
      v_binding_reason:='binding_revoked';
    elsif b.status='expired' or b.expires_at<=now() then
      v_binding_reason:='binding_expired';
    elsif not v_binding_live and v_binding_reason is null then
      v_binding_reason:='binding_changed';
    elsif (cpb.id is null or cpb.merged_into is not null
        or cpb.retired_at is not null
        or cpb.registration_normalized is distinct from
          b.registration_at_signing)
        and v_binding_reason is null then
      v_binding_reason:='binding_identity_drifted';
    elsif (v_draft_resolution is null
        or v_draft_binding is distinct from e.vendor_binding_id)
        and v_binding_reason is null then
      v_binding_reason:='binding_changed';
    elsif v_facts_extraction is null and v_binding_reason is null then
      v_binding_reason:='binding_changed';
    elsif v_ocr_extraction is null and v_binding_reason is null then
      v_binding_reason:='binding_no_corroboration_source';
    elsif coalesce(v_binding_matches,0)>1
        and v_binding_reason is null then
      v_binding_reason:='binding_ambiguous';
    elsif coalesce(v_binding_matches,0)=1
        and not coalesce(v_matching_f2_ok,false)
        and v_binding_reason is null then
      v_binding_reason:='binding_features_changed';
    elsif (not coalesce(v_f1_ok,false) or not coalesce(v_f2_ok,false))
        and v_binding_reason is null then
      v_binding_reason:='binding_features_changed';
    elsif not coalesce(v_f3_ok,false) and v_binding_reason is null then
      v_binding_reason:='binding_uncorroborated';
    elsif v_counterparty is distinct from b.counterparty_id
        and v_binding_reason is null then
      v_binding_reason:='binding_changed';
    elsif (coalesce(v_binding_matches,0)<>1
        or v_matching_binding is distinct from e.vendor_binding_id)
        and v_binding_reason is null then
      v_binding_reason:='binding_changed';
    end if;

    v_binding_outcome:=case when v_binding_reason is null
      then 'bound' else 'refused' end;
    insert into clara.vendor_binding_resolutions(
      binding_id,firm_id,client_id,document_id,entry_id,phase,
      facts_extraction_id,ocr_extraction_id,compared_to_resolution_id,
      entry_revision_token,raw_proposal,outcome,refusal_reason
    ) values (
      e.vendor_binding_id,e.firm_id,e.client_id,e.document_id,e.id,'post',
      v_resolution_facts,v_resolution_ocr,v_draft_resolution,
      e.revision_token,'{}'::jsonb,v_binding_outcome,v_binding_reason
    );

    if v_binding_reason is not null then
      insert into clara.rule_post_skips(
        firm_id,client_id,entry_id,rule_id,reason
      ) values (
        e.firm_id,e.client_id,p_entry,r.id,v_binding_reason
      );
      return jsonb_build_object(
        'entry_id',p_entry,'status','skipped','reason',v_binding_reason);
    end if;
  end if;

  -- Drive the SAME approve core with the rule identity. ONLY the benign races become
  -- skips (review M2): CLR06 (stale revision) and the CLR10 that is specifically the
  -- not-a-draft status race (a human approved/withdrew concurrently — detail reason
  -- 'not_a_draft'). FIX-6 (adversarial #12): any OTHER CLR10 — e.g. a shape-floor
  -- CLR10 like sst_account_missing — PROPAGATES honestly, never masked as not_a_draft.
  begin
    v_result:=clara._approve_entry_core(
      jsonb_build_object('actor',r.signed_by,'firm',e.firm_id,'checked_via_rule_id',r.id,
        'bound_extraction',v_fx)
        || jsonb_build_object('receipt_preheld',true),
      p_entry,e.revision_token,null,v_approve_op_key);
  exception
    when sqlstate 'CLR10' then
      get stacked diagnostics v_detail = pg_exception_detail;
      if coalesce(v_detail,'') not like '%not_a_draft%' then
        raise;   -- propagate every non-race CLR10 (e.g. sst_account_missing)
      end if;
      insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
        values(e.firm_id,e.client_id,p_entry,r.id,'not_a_draft');
      return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','not_a_draft');
    when sqlstate 'CLR21' then
      -- RESIDUAL-2: the supplier-bill shape floor refuses a non-01 supplier document
      -- (type_polarity_mismatch) inside the approve core. The executor degrades that to a
      -- QUIET skip (=> NEEDS YOU), never an error loop; any OTHER CLR21 propagates honestly.
      get stacked diagnostics v_detail = pg_exception_detail;
      if coalesce(v_detail,'') not like '%type_polarity_mismatch%' then
        raise;
      end if;
      insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
        values(e.firm_id,e.client_id,p_entry,r.id,'type_polarity_mismatch');
      return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','type_polarity_mismatch');
    when sqlstate 'CLR06' then
      insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
        values(e.firm_id,e.client_id,p_entry,r.id,'stale_revision');
      return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','stale_revision');
  end;

  -- Receipt (rule snapshot at post time, for the audit join) + the typed event.
  insert into clara.rule_post_runs(firm_id,client_id,rule_id,entry_id,posted_at,snapshot)
    values(e.firm_id,e.client_id,r.id,p_entry,now(),
      jsonb_build_object('rule_id',r.id,'account_code',r.account_code,'direction',r.direction,
        'amount_cap_cents',r.amount_cap_cents,'frequency_window',r.frequency_window,
        'window_max_posts',r.window_max_posts,'signed_by',r.signed_by,
        'content_hash',r.content_hash,'posted_total_cents',v_total,
        'evidence_class',r.evidence_class))
    returning id into v_run;
  perform clara._append_event(e.firm_id,'entry.rule_posted',e.client_id,r.signed_by,null,null,
    p_entry,e.document_id,null,jsonb_build_object('rule_id',r.id,'run_id',v_run,
      'counterparty_id',v_counterparty,'account_code',r.account_code));
  v_result:=jsonb_build_object(
    'entry_id',p_entry,'status','posted','rule_id',r.id,'run_id',v_run);
  return clara._finish_op(
    e.firm_id,'execute_rule_post',p_op_key,v_result);
end $function$
;

reset role;

do $tail$
declare
  v_src text; v_norm text; v_exact_slice text;
  v_pos_exec int; v_pos_approve int;
  v_pos_rule int; v_pos_rule_exact int;
  v_pos_filing int; v_pos_entry int; v_pos_binding int;
  v_pos_gate int; v_pos_gate_use int; v_pos_approve_call int;
begin
  select pg_get_functiondef(
    'clara.execute_rule_post(uuid,text)'::regprocedure
  ) into v_src;
  v_norm:=lower(regexp_replace(
    regexp_replace(
      regexp_replace(v_src,'/\*[\s\S]*?\*/','','g'),
      '--[^\n]*','','g'),
    '\s+',' ','g'));

  v_pos_gate:=position(
    'v_binding_live:=b.status=''live'' and b.expires_at>now();'
    in v_norm);
  v_pos_gate_use:=position('not v_binding_live' in v_norm);
  v_pos_approve_call:=position(
    'v_result:=clara._approve_entry_core(' in v_norm);
  if v_pos_gate=0 or v_pos_gate_use=0 or v_pos_approve_call=0
     or v_pos_gate>=v_pos_gate_use
     or v_pos_gate_use>=v_pos_approve_call then
    raise exception
      '0029 tail: binding liveness assignment/use/approve order invalid (gate=%, use=%, approve=%)',
      v_pos_gate,v_pos_gate_use,v_pos_approve_call
      using errcode='CLR10';
  end if;

  v_pos_exec:=position(
    '_reserve_op(v_locator.firm_id,''execute_rule_post''' in v_norm);
  v_pos_approve:=position(
    '_reserve_op(v_locator.firm_id,''approve_entry''' in v_norm);
  v_pos_rule:=position('from clara.coding_rules cr' in v_norm);
  v_pos_rule_exact:=position(
    'select * into r from clara.coding_rules where id=any(v_locked_rule_ids)'
    in v_norm);
  v_pos_filing:=position('v_filing:=clara._active_document_filing' in v_norm);
  v_pos_entry:=position(
    'from clara.journal_entries where id=p_entry for update' in v_norm);
  v_pos_binding:=position(
    'from clara.vendor_identity_bindings where id=e.vendor_binding_id for update'
    in v_norm);
  if v_pos_exec=0 or v_pos_approve=0 or v_pos_rule=0
     or v_pos_rule_exact=0
     or v_pos_filing=0 or v_pos_entry=0 or v_pos_binding=0
     or v_pos_exec>=v_pos_rule or v_pos_approve>=v_pos_rule
     or v_pos_rule>=v_pos_filing or v_pos_filing>=v_pos_entry
     or v_pos_entry>=v_pos_rule_exact
     or v_pos_rule_exact>=v_pos_binding then
    raise exception
      '0029 tail: receipt/rule-lock/filing/entry/rule-read/binding order invalid (exec=%, approve=%, rule_lock=%, filing=%, entry=%, rule_read=%, binding=%)',
      v_pos_exec,v_pos_approve,v_pos_rule,v_pos_filing,v_pos_entry,
      v_pos_rule_exact,v_pos_binding
      using errcode='CLR10';
  end if;
  v_exact_slice:=substring(
    v_norm from v_pos_rule_exact
    for position('if not found then' in substring(v_norm from v_pos_rule_exact))
  );
  if position('for update' in v_exact_slice)<>0 then
    raise exception
      '0029 tail: exact coding_rules lookup reacquires FOR UPDATE'
      using errcode='CLR10';
  end if;

  select pg_get_functiondef(
    'clara._approve_entry_core(jsonb,uuid,uuid,text,text)'::regprocedure
  ) into v_src;
  v_norm:=lower(regexp_replace(
    regexp_replace(
      regexp_replace(v_src,'/\*[\s\S]*?\*/','','g'),
      '--[^\n]*','','g'),
    '\s+',' ','g'));
  if position(
    'if not coalesce((p_ctx->>''receipt_preheld'')::boolean,false) then'
    in v_norm
  )=0 then
    raise exception '0029 tail: receipt_preheld branch is absent'
      using errcode='CLR10';
  end if;

  raise notice
    '0029: Slot C installed; both receipts precede rule/filing/entry/binding locks and binding-backed posts re-resolve before approval';
end
$tail$;
