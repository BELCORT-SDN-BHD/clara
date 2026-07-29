-- 0030_vendor_binding_f1_lcp.sql — F1 becomes the windowed longest-common-prefix,
-- mirroring F2's own derivation discipline. Owner ruling, live founding blocker (task #36
-- runway): the live founding of the first vendor identity binding hit propose refusing
-- features_unstable, and the measured cause is that invoice.vendor_name is NOT
-- byte-stable across the EZSEC family — the real evidence window's three fragments read
-- "ez\n易计\nezAccount\nCOUNT" / "ez\n易计\nezAccount" /
-- "ez\n易计\nezAccount\nCOUNT YOUR VICTORY" — suffix-truncation variance of the logo
-- tagline, scan-dependent and inherent to this letterhead. More approvals will never
-- converge to full byte equality, so the design's F1 byte-identical claim (v4.1 design
-- Part 1 §3.2, "identical across every bill checked") was measured on a subset and does
-- not hold in general.
--
-- THE FIX. F1 adopts F2's own LCP discipline exactly:
--   (1) PROPOSE (_derive_vendor_binding_proposal, 0028): stored F1 = the longest common
--       prefix of the window's three _binding_normalize'd vendor_name fragments (the same
--       clara._binding_common_prefix helper F2 already uses), with a floor tuned to
--       refuse a degenerate LCP: >=8 normalized characters AND at least one token that is
--       not itself short/structural filler — either because it carries a character
--       outside the printable ASCII range (script diversity, e.g. a CJK logo fragment, is
--       itself a strong distinguishing signal) or because it is a longer ASCII word absent
--       from a small denylist of universal corporate-form/connector tokens. The refusal
--       stays features_unstable — unchanged vocabulary, changed derivation.
--   (2) MATCHING (_resolve_vendor_binding Slot A, and 0029's post-time F1 re-check in
--       execute_rule_post): the document's own normalized vendor_name fragment must START
--       WITH the stored F1 — mirroring F2's starts_with(invoice_id_norm, f2_prefix) check
--       byte-for-byte in style. Two sites in execute_rule_post carry this: the "does
--       another live binding also match this document" lateral, and the bound entry's own
--       post-time v_f1_ok re-check.
--   (3) F1 remains a STABILITY feature, never an identity proof — F3 alone carries that
--       (design §3.2, unchanged). Nothing else moves: F2, F3, dwell, the condition-5
--       admission, and the post-time control shape are all untouched.
--
-- CoR DISCIPLINE. Every body below was pulled via pg_get_functiondef against the live
-- 29-migration database (0001-0029, deployed to production as runtime v35 / PR #136),
-- not hand-copied from either migration file's static text. Three functions carry the F1
-- site(s): clara._derive_vendor_binding_proposal (0028, the shared propose/sign
-- derivation), clara._resolve_vendor_binding (0028, Slot A), and clara.execute_rule_post
-- (0029, Slot C post-time control — two independent F1 sites inside one function body).
-- One new immutable helper is added: clara._binding_f1_floor_holds.
--
-- D1 WRITE-QUIESCE. This migration replaces three writer/resolver function bodies that
-- sit on the live posting path (_derive_vendor_binding_proposal backs propose/sign;
-- _resolve_vendor_binding backs Slot A of _coding_lane_core and _draft_entry_core;
-- execute_rule_post IS Slot C, the executor). Per the repo-mandated D1 write-quiesce
-- (packages/db/README.md:95-113) and the precedent set by 0028/0029's own two quiesced
-- deploy windows (design Part 2 §D), 0030's deploy requires its OWN write-quiesce window —
-- a third quiesce, not folded into either prior one, because the recut is deliberate and
-- independent of both.
--
-- CELLS (packages/db/tests/x30-f1-lcp.test.mjs): (a) the REAL three-fragment window
-- (the exact live EZSEC strings above) derives the LCP and propose SUCCEEDS; (b) a
-- document whose fragment does not start with the stored F1 refuses at Slot A
-- (unresolved) and at post-time (binding_features_changed); (c) the floor refuses a
-- degenerate window whose fragments share only "in"; (d) the original full-equality
-- window (three identical strings) still works, since LCP(a,a,a) = a.

set role clara_fn_owner;

-- =====================================================================
-- §A — the new floor helper. Immutable, matching _binding_common_prefix's and
-- _binding_normalize's own style; owner-only, matching their ACL treatment (0028's
-- explicit revoke on private helpers is a REAL restriction — functions default to
-- PUBLIC EXECUTE unlike tables, so this is not the redundant-revoke DR hazard a table
-- ACL section would be).
-- =====================================================================
create function clara._binding_f1_floor_holds(p_lcp text) returns boolean
language sql immutable
as $$
  select length(coalesce(p_lcp,'')) >= 8
    and exists (
      select 1
      from regexp_split_to_table(btrim(coalesce(p_lcp,'')), '\s+') tok
      where tok <> ''
        and (
          tok ~ '[^\x00-\x7F]'
          or (length(tok) >= 4 and lower(tok) not in (
            'sdn','bhd','pte','ltd','inc','llc','corp','plc',
            'the','and','of','for','group','trading','holdings',
            'enterprise','enterprises','company','resources','services'
          ))
        )
    );
$$;

revoke all on function clara._binding_f1_floor_holds(text) from public;

-- =====================================================================
-- §B — clara._derive_vendor_binding_proposal (0028): F1 = the window LCP, floored.
-- =====================================================================
CREATE OR REPLACE FUNCTION clara._derive_vendor_binding_proposal(p_firm uuid, p_client uuid, p_counterparty uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'clara', 'pg_temp'
AS $function$
declare
  v_cp uuid; cp record; v_n int; v_dates int; v_span int;
  v_evidence jsonb; v_final_evidence jsonb; v_item jsonb;
  v_f1 text; v_f2 text; v_alpha_count int; v_leading text;
  v_height numeric; v_hash text;
begin
  if not exists (
    select 1 from clara.clients
    where id=p_client and firm_id=p_firm
  ) then
    raise exception 'binding_client_unavailable' using errcode='CLR36';
  end if;

  begin
    v_cp:=clara._canonical_counterparty(p_client,p_counterparty);
  exception when sqlstate 'CLR23' then
    v_cp:=null;
  end;
  if v_cp is null or v_cp is distinct from p_counterparty then
    raise exception 'binding_counterparty_inactive' using errcode='CLR36';
  end if;
  select * into cp
  from clara.counterparties
  where id=v_cp and firm_id=p_firm and client_id=p_client
    and kind='vendor' and merged_into is null and retired_at is null;
  if not found then
    raise exception 'binding_counterparty_inactive' using errcode='CLR36';
  end if;
  if nullif(btrim(cp.registration_normalized),'') is null then
    raise exception 'binding_unattributable' using errcode='CLR36';
  end if;

  with window_entries as materialized (
    select j.id,j.document_id,j.posting_date,j.approved_at
    from clara.journal_entries j
    where j.client_id=p_client
      and j.status='approved'
      and j.reversed_by is null
      and j.checked_via_rule_id is null
      and j.document_id is not null
      and exists (
        select 1 from clara.journal_lines l
        where l.entry_id=j.id
          and clara._canonical_counterparty(
            p_client,l.counterparty_id)=v_cp
      )
    order by j.approved_at desc,j.id desc
    limit 3
  ), derived as (
    select w.*,
      fx.id as facts_extraction_id,
      fx.extracted_at as facts_extracted_at,
      ox.id as ocr_extraction_id,
      ox.extracted_at as ocr_extracted_at,
      clara._binding_normalize(vn.vendor_name) as f1_vendor_name_norm,
      clara._binding_normalize(ii.invoice_id) as invoice_id_norm
    from window_entries w
    left join lateral (
      select x.id,x.extracted_at
      from clara.document_extractions x
      where x.document_id=w.document_id
        and x.engine_kind='invoice_facts' and x.status='done'
      order by x.version_n desc,x.id desc limit 1
    ) fx on true
    left join lateral (
      select x.id,x.extracted_at
      from clara.document_extractions x
      where x.document_id=w.document_id
        and x.engine_kind='ocr' and x.status='done'
      order by x.version_n desc,x.id desc limit 1
    ) ox on true
    left join lateral (
      select nullif(btrim(min(r.text_content)),'') as vendor_name
      from clara.document_regions r
      where r.extraction_id=fx.id
        and r.field_path='invoice.vendor_name'
    ) vn on true
    left join lateral (
      select nullif(btrim(min(r.text_content)),'') as invoice_id
      from clara.document_regions r
      where r.extraction_id=fx.id
        and r.field_path='invoice.invoice_id'
    ) ii on true
  )
  select count(*)::int,count(distinct posting_date)::int,
    (max(posting_date)-min(posting_date))::int,
    coalesce(jsonb_agg(jsonb_build_object(
      'entry_id',id,
      'document_id',document_id,
      'facts_extraction_id',facts_extraction_id,
      'ocr_extraction_id',ocr_extraction_id,
      'posting_date',posting_date,
      'approved_at',approved_at,
      'facts_restated',facts_extracted_at>approved_at,
      'ocr_restated',ocr_extracted_at>approved_at,
      'f1_vendor_name_norm',f1_vendor_name_norm,
      'invoice_id_norm',invoice_id_norm
    ) order by approved_at desc,id desc),'[]'::jsonb)
    into v_n,v_dates,v_span,v_evidence
  from derived;

  if v_n<3 then
    raise exception 'insufficient_evidence' using errcode='CLR36';
  end if;
  if v_dates<>3 or v_span is null or v_span<14 then
    raise exception 'window_too_recent' using errcode='CLR36';
  end if;

  for v_item in select value from jsonb_array_elements(v_evidence) loop
    if nullif(v_item->>'facts_extraction_id','') is null then
      raise exception 'binding_unattributable' using errcode='CLR36';
    end if;
    if nullif(v_item->>'ocr_extraction_id','') is null then
      raise exception 'binding_no_corroboration_source' using errcode='CLR36';
    end if;
    if coalesce((v_item->>'facts_restated')::boolean,false)
       or coalesce((v_item->>'ocr_restated')::boolean,false) then
      raise exception 'evidence_restated' using errcode='CLR36';
    end if;
    if nullif(v_item->>'f1_vendor_name_norm','') is null then
      raise exception 'binding_unattributable' using errcode='CLR36';
    end if;
  end loop;

  -- 0030: F1 adopts F2's own LCP discipline (owner ruling, live founding
  -- blocker) -- byte-equality across the window was measured to fail on real
  -- EZSEC-family letterhead (suffix-truncation variance inherent to a
  -- scan-dependent OCR read, more approvals never converge to full equality),
  -- so the longest common prefix is exactly the right invariant, mirroring F2
  -- exactly. The floor refuses a degenerate LCP; the same features_unstable
  -- refusal fires when it fails.
  v_f1:=clara._binding_common_prefix(
    v_evidence->0->>'f1_vendor_name_norm',
    v_evidence->1->>'f1_vendor_name_norm',
    v_evidence->2->>'f1_vendor_name_norm');
  if not clara._binding_f1_floor_holds(v_f1) then
    raise exception 'features_unstable' using errcode='CLR36';
  end if;

  v_f2:=clara._binding_common_prefix(
    v_evidence->0->>'invoice_id_norm',
    v_evidence->1->>'invoice_id_norm',
    v_evidence->2->>'invoice_id_norm');
  v_alpha_count:=length(regexp_replace(v_f2,'[^A-Za-z]','','g'));
  v_leading:=lower(coalesce(substring(v_f2 from '^[A-Za-z]+'),''));
  if length(v_f2)<6 or v_alpha_count<3
     or v_leading in (
       'inv','invoice','bill','tax','doc','no','rcpt','receipt',
       'cn','dn','so','po','binv'
     ) then
    raise exception 'prefix_too_weak' using errcode='CLR36';
  end if;

  for v_item in select value from jsonb_array_elements(v_evidence) loop
    if not clara._binding_f3_holds(
      (v_item->>'document_id')::uuid,
      cp.registration_normalized,
      cp.name_normalized
    ) then
      select case when p.page_height ~
        '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)([eE][+-]?[0-9]+)?$'
        then p.page_height::numeric end
        into v_height
      from clara.document_extractions x
      cross join lateral (
        select q->>'height' as page_height
        from jsonb_array_elements(
          case when jsonb_typeof(x.envelope->'pages')='array'
            then x.envelope->'pages' else '[]'::jsonb end
        ) q
        where case
          when (q->>'page_number') ~ '^[0-9]+$'
            then (q->>'page_number')::int=1
          else false
        end
        limit 1
      ) p
      where x.id=(v_item->>'ocr_extraction_id')::uuid;
      if v_height is null or v_height<=0 then
        raise exception 'binding_unattributable' using errcode='CLR36';
      end if;
      raise exception 'binding_uncorroborated' using errcode='CLR36';
    end if;
  end loop;

  if exists (
    select 1 from clara.vendor_identity_bindings b
    where b.client_id=p_client
      and b.counterparty_id=v_cp
      and b.status='live'
      and b.expires_at>now()
  ) then
    raise exception 'binding_conflict' using errcode='CLR36';
  end if;

  select jsonb_agg(
      value - 'approved_at' - 'facts_restated' - 'ocr_restated'
            - 'f1_vendor_name_norm' - 'invoice_id_norm'
      order by ordinality
    )
    into v_final_evidence
  from jsonb_array_elements(v_evidence) with ordinality;

  v_hash:=encode(sha256(convert_to(jsonb_build_object(
    'f1_vendor_name_norm',v_f1,
    'f2_invoice_prefix',v_f2,
    'registration_at_signing',cp.registration_normalized,
    'evidence',v_final_evidence
  )::text,'UTF8')),'hex');

  return jsonb_build_object(
    'client_id',p_client,
    'counterparty_id',v_cp,
    'f1_vendor_name_norm',v_f1,
    'f2_invoice_prefix',v_f2,
    'registration_at_signing',cp.registration_normalized,
    'content_hash',v_hash,
    'evidence',v_final_evidence
  );
end
$function$;

-- =====================================================================
-- §C — clara._resolve_vendor_binding (0028, Slot A): F1 match becomes starts_with.
-- =====================================================================
CREATE OR REPLACE FUNCTION clara._resolve_vendor_binding(p_client uuid, p_document uuid, p_page_candidate uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'clara', 'pg_temp'
AS $function$
declare
  v_ext record; v_vi jsonb; v_vendor text; v_norm_name text;
  v_matches int; v_counterparty uuid; v_binding uuid;
  v_invoice_id text; v_invoice_id_norm text; v_f2_prefix text;
begin
  select e.* into v_ext
  from clara.document_extractions e
  where e.document_id=p_document
    and e.engine_kind='invoice_facts'
    and e.status='done'
  order by e.version_n desc,e.id desc
  limit 1;
  if not found then
    return jsonb_build_object('outcome','unresolved');
  end if;

  v_vi:=v_ext.envelope->'vendor_identity';
  if jsonb_typeof(v_vi) is distinct from 'object'
     or v_vi->>'outcome' is distinct from 'absent'
     or jsonb_typeof(v_vi->'candidates') is distinct from 'array'
     or jsonb_array_length(v_vi->'candidates')<>0 then
    return jsonb_build_object('outcome','unresolved');
  end if;

  if exists (
    select 1 from jsonb_object_keys(v_vi) k
    where k not in (
      'matched','absent','ambiguous','rejected_gate','below_band',
      'height_missing','unit_unresolved','no_geometry','label_continuation',
      'no_vendor_anchor','vendor_anchor_far','closer_to_customer',
      'typed_collapsed','typed_disagreement','typed_vs_ambiguous','emitted',
      'candidates','outcome','value_raw','occurrences','distinct_keys'
    )
  ) then
    return jsonb_build_object('outcome','unresolved');
  end if;

  -- The current X6 producer always emits these four counters. On the only path
  -- that sets outcome='absent', it increments absent exactly once before return;
  -- no accepted row exists, so matched/typed_collapsed/emitted remain zero.
  if v_vi->'absent' is distinct from '1'::jsonb
     or v_vi->'matched' is distinct from '0'::jsonb
     or v_vi->'typed_collapsed' is distinct from '0'::jsonb
     or v_vi->'emitted' is distinct from '0'::jsonb
     or v_vi ?| array['value_raw','occurrences','distinct_keys']
     or exists (
    select 1
    from unnest(array[
      'below_band','height_missing','unit_unresolved','no_geometry',
      'rejected_gate','label_continuation','no_vendor_anchor',
      'vendor_anchor_far','closer_to_customer','ambiguous',
      'typed_disagreement','typed_vs_ambiguous'
    ]) k
    where v_vi ? k and v_vi->k is distinct from '0'::jsonb
  ) then
    return jsonb_build_object('outcome','unresolved');
  end if;

  if exists (
    select 1 from clara.document_regions r
    where r.extraction_id=v_ext.id
      and r.field_path='invoice.vendor_registration'
  ) then
    return jsonb_build_object('outcome','unresolved');
  end if;

  select nullif(btrim(min(r.text_content)),'') into v_vendor
  from clara.document_regions r
  where r.extraction_id=v_ext.id
    and r.field_path='invoice.vendor_name';
  if v_vendor is null then
    return jsonb_build_object('outcome','unresolved');
  end if;

  v_norm_name:=clara._binding_normalize(v_vendor);
  select nullif(btrim(min(r.text_content)),'') into v_invoice_id
  from clara.document_regions r
  where r.extraction_id=v_ext.id
    and r.field_path='invoice.invoice_id';
  v_invoice_id_norm:=clara._binding_normalize(v_invoice_id);

  -- F2 is not a selection key. First count the complete F1+F3 candidate set
  -- (including the optional page-candidate equality wall); only a unique
  -- candidate may be checked for F2 consistency afterward.
  select count(*)::int,
         (array_agg(b.counterparty_id order by b.id))[1],
         (array_agg(b.id order by b.id))[1],
         (array_agg(b.f2_invoice_prefix order by b.id))[1]
    into v_matches,v_counterparty,v_binding,v_f2_prefix
  from clara.vendor_identity_bindings b
  join clara.counterparties cp
    on cp.id=b.counterparty_id
   and cp.firm_id=b.firm_id
   and cp.client_id=b.client_id
  where b.client_id=p_client
    and b.status='live'
    and b.expires_at>now()
    -- 0030: F1 is now the window's LCP; the document's own normalized
    -- fragment must START WITH the stored F1 (mirrors F2's starts_with).
    and starts_with(v_norm_name,b.f1_vendor_name_norm)
    and cp.merged_into is null
    and cp.retired_at is null
    and cp.registration_normalized is not distinct from b.registration_at_signing
    and clara._binding_f3_holds(
      p_document,cp.registration_normalized,cp.name_normalized)
    and (p_page_candidate is null or b.counterparty_id=p_page_candidate);

  if v_matches=0 then
    return jsonb_build_object('outcome','unresolved');
  end if;
  if v_matches>1 then
    return jsonb_build_object('outcome','ambiguous');
  end if;
  if v_invoice_id_norm is null
     or not starts_with(v_invoice_id_norm,v_f2_prefix) then
    return jsonb_build_object('outcome','ambiguous');
  end if;
  return jsonb_build_object(
    'outcome','bound',
    'counterparty_id',v_counterparty,
    'binding_id',v_binding);
end
$function$;

-- =====================================================================
-- §D — clara.execute_rule_post (0029, Slot C): both post-time F1 sites become
-- starts_with, mirroring the existing v_f2_ok / v_matching_f2_ok style exactly.
-- =====================================================================
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
  if v_dedupe is not null then
    -- The approve_entry receipt already exists (e.g. a human raced in and used
    -- the same predictable rulepost:<entry>:<seq> key, or a prior attempt at
    -- this exact executor op_key already reserved it). The executor's OWN
    -- receipt, just reserved above with a null v_dedupe, must not be left
    -- orphaned at result=NULL -- settle it with the same outcome so a replay of
    -- THIS execute_rule_post call returns the recorded result, never pending.
    return clara._finish_op(
      v_locator.firm_id,'execute_rule_post',p_op_key,v_dedupe);
  end if;

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
    return clara._settle_rule_post_skip(
      e.firm_id,e.client_id,p_entry,null,'stale_revision',
      p_op_key,v_approve_op_key);
  end if;

  if e.status<>'draft' then
    return clara._settle_rule_post_skip(
      e.firm_id,e.client_id,p_entry,null,'not_a_draft',
      p_op_key,v_approve_op_key);
  end if;
  if e.coding_kind is null then
    return clara._settle_rule_post_skip(
      e.firm_id,e.client_id,p_entry,null,'ineligible_no_coding_kind',
      p_op_key,v_approve_op_key);
  end if;
  if e.document_id is null then
    return clara._settle_rule_post_skip(
      e.firm_id,e.client_id,p_entry,null,'ineligible_no_document',
      p_op_key,v_approve_op_key);
  end if;
  if e.proposed_counterparty is null then
    return clara._settle_rule_post_skip(
      e.firm_id,e.client_id,p_entry,null,'ineligible_no_counterparty',
      p_op_key,v_approve_op_key);
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
    return clara._settle_rule_post_skip(
      e.firm_id,e.client_id,p_entry,null,'evidence_lane_ambiguous',
      p_op_key,v_approve_op_key);
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
    return clara._settle_rule_post_skip(
      e.firm_id,e.client_id,p_entry,null,'facts_missing',
      p_op_key,v_approve_op_key);
  end if;

  -- direction (client-aware, pinned to the ONE bound extraction — ADV-R3#1) —
  -- an unresolved direction is a skip, never a raise.
  begin
    v_direction:=clara._document_direction_at(e.document_id,e.client_id,v_fx);
  exception when sqlstate 'CLR30' then
    return clara._settle_rule_post_skip(
      e.firm_id,e.client_id,p_entry,null,'direction_unresolved',
      p_op_key,v_approve_op_key);
  end;
  v_kind:=case when v_direction='sales' then 'customer' else 'vendor' end;

  -- resolve the draft's counterparty (kind-scoped by direction) to match the rule.
  begin
    v_fp:=clara._resolve_counterparty(e.client_id,
      e.proposed_counterparty || jsonb_build_object('kind',v_kind));
  exception when sqlstate 'CLR23' then
    return clara._settle_rule_post_skip(
      e.firm_id,e.client_id,p_entry,null,'counterparty_ambiguous',
      p_op_key,v_approve_op_key);
  end;
  if v_fp is null or v_fp->>'decision'='birth' then
    return clara._settle_rule_post_skip(
      e.firm_id,e.client_id,p_entry,null,'counterparty_unresolved',
      p_op_key,v_approve_op_key);
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
    return clara._settle_rule_post_skip(
      e.firm_id,e.client_id,p_entry,null,'no_live_rule',
      p_op_key,v_approve_op_key);
  end if;

  -- RE-DERIVE every gate against live rows -----------------------------------
  if clara.is_high_stakes(p_entry) then
    return clara._settle_rule_post_skip(
      e.firm_id,e.client_id,p_entry,r.id,'high_stakes',
      p_op_key,v_approve_op_key);
  end if;
  -- 0016 P2(e)/P6: CN autopost is IMPOSSIBLE — a sales_credit_note draft skips
  -- by NAME (the 0015 control-shape refusal was incidental; this is the law).
  if v_direction='sales' and e.coding_kind='sales_credit_note' then
    return clara._settle_rule_post_skip(
      e.firm_id,e.client_id,p_entry,r.id,'cn_not_autopostable',
      p_op_key,v_approve_op_key);
  end if;
  -- 0016 P4 (WA21-R1): the sst_purchase_cost visibility leg is NOT sanctioned
  -- for autopost — human lanes only. A purchase draft carrying one skips by
  -- NAME before the generic account enumeration.
  if v_direction='purchase' and exists(select 1 from clara.journal_lines l
      join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
      where l.entry_id=p_entry and coalesce(a.special_acc_type,'')='sst_purchase_cost') then
    return clara._settle_rule_post_skip(
      e.firm_id,e.client_id,p_entry,r.id,
      'purchase_sst_not_autopostable',p_op_key,v_approve_op_key);
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
    return clara._settle_rule_post_skip(
      e.firm_id,e.client_id,p_entry,r.id,'control_shape',
      p_op_key,v_approve_op_key);
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
    return clara._settle_rule_post_skip(
      e.firm_id,e.client_id,p_entry,r.id,'account_mismatch',
      p_op_key,v_approve_op_key);
  end if;
  select coalesce(sum(debit_cents),0) into v_total from clara.journal_lines where entry_id=p_entry;
  if v_total>r.amount_cap_cents then
    return clara._settle_rule_post_skip(
      e.firm_id,e.client_id,p_entry,r.id,'over_cap',
      p_op_key,v_approve_op_key);
  end if;
  v_window_start:=case when r.frequency_window='monthly'
    then (date_trunc('month',now() at time zone 'utc') at time zone 'utc')
    else now()-interval '30 days' end;
  select count(*)::int into v_count from clara.rule_post_runs
    where rule_id=r.id and posted_at>=v_window_start;
  if v_count>=r.window_max_posts then
    return clara._settle_rule_post_skip(
      e.firm_id,e.client_id,p_entry,r.id,'window_exhausted',
      p_op_key,v_approve_op_key);
  end if;
  if r.expires_at<=now() then
    return clara._settle_rule_post_skip(
      e.firm_id,e.client_id,p_entry,r.id,'expired',
      p_op_key,v_approve_op_key);
  end if;
  if e.revision_token is null then
    return clara._settle_rule_post_skip(
      e.firm_id,e.client_id,p_entry,r.id,'no_revision',
      p_op_key,v_approve_op_key);
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
    return clara._settle_rule_post_skip(
      e.firm_id,e.client_id,p_entry,r.id,'not_corroborated',
      p_op_key,v_approve_op_key);
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
      return clara._settle_rule_post_skip(
        e.firm_id,e.client_id,p_entry,r.id,'evidence_class_mismatch',
        p_op_key,v_approve_op_key);
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
      select count(*)::int+1 into v_skips from clara.rule_post_skips
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
      return clara._settle_rule_post_skip(
        e.firm_id,e.client_id,p_entry,r.id,'polarity_unverified',
        p_op_key,v_approve_op_key);
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
      select count(*)::int+1 into v_skips from clara.rule_post_skips
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
      return clara._settle_rule_post_skip(
        e.firm_id,e.client_id,p_entry,r.id,'direction_unproven',
        p_op_key,v_approve_op_key);
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
      return clara._settle_rule_post_skip(
        e.firm_id,e.client_id,p_entry,r.id,'buyer_mismatch',
        p_op_key,v_approve_op_key);
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
      return clara._settle_rule_post_skip(
        e.firm_id,e.client_id,p_entry,r.id,'anchor_missing',
        p_op_key,v_approve_op_key);
    end if;
    -- (d) an EXISTING resolved customer, re-derived live (no birth ever).
    if not exists(select 1 from clara.counterparties cp where cp.id=r.counterparty_id
        and cp.client_id=e.client_id and cp.kind='customer'
        and cp.merged_into is null and cp.retired_at is null) then
      return clara._settle_rule_post_skip(
        e.firm_id,e.client_id,p_entry,r.id,'customer_unresolved',
        p_op_key,v_approve_op_key);
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
      return clara._settle_rule_post_skip(
        e.firm_id,e.client_id,p_entry,r.id,'floor_lost',
        p_op_key,v_approve_op_key);
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
        -- 0030: F1 is now the window's LCP; the OTHER binding's stored F1
        -- must be a prefix of the document's own normalized fragment.
        and starts_with(clara._binding_normalize(vn.vendor_name),
          b2.f1_vendor_name_norm)
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
    -- 0030: F1 is now the window's LCP; re-check as a prefix relation,
    -- mirroring v_f2_ok's exact NULL-safe starts_with style below.
    v_f1_ok:=v_f1_current is not null
      and starts_with(v_f1_current,b.f1_vendor_name_norm);
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
      return clara._settle_rule_post_skip(
        e.firm_id,e.client_id,p_entry,r.id,v_binding_reason,
        p_op_key,v_approve_op_key);
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
      return clara._settle_rule_post_skip(
        e.firm_id,e.client_id,p_entry,r.id,'not_a_draft',
        p_op_key,v_approve_op_key);
    when sqlstate 'CLR21' then
      -- RESIDUAL-2: the supplier-bill shape floor refuses a non-01 supplier document
      -- (type_polarity_mismatch) inside the approve core. The executor degrades that to a
      -- QUIET skip (=> NEEDS YOU), never an error loop; any OTHER CLR21 propagates honestly.
      get stacked diagnostics v_detail = pg_exception_detail;
      if coalesce(v_detail,'') not like '%type_polarity_mismatch%' then
        raise;
      end if;
      return clara._settle_rule_post_skip(
        e.firm_id,e.client_id,p_entry,r.id,'type_polarity_mismatch',
        p_op_key,v_approve_op_key);
    when sqlstate 'CLR06' then
      return clara._settle_rule_post_skip(
        e.firm_id,e.client_id,p_entry,r.id,'stale_revision',
        p_op_key,v_approve_op_key);
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
end $function$;

reset role;

-- =====================================================================
-- TAIL — in-transaction self-verification. Every raise is a real assertion failure, not
-- a soft warning; a clean run ends with one notice and nothing else.
--
-- SPLIT INTO TWO `do` BLOCKS (matching 0027's own precedent, same hazard): the repo's
-- wiki-authority lint (scripts/check-wiki-dynamic-sql.mjs) treats any `do $tag$...$tag$`
-- block containing BOTH a pg_get_functiondef call and the bare WORD "execute" as a
-- change-of-record patch. This tail's ACL probe compares
-- `aclexplode(...).privilege_type = 'EXECUTE'` — the Postgres privilege-type STRING,
-- unrelated to plpgsql's dynamic-SQL EXECUTE statement — but the lint's `\bexecute\b`
-- check does not distinguish a quoted literal from the keyword. Keeping the ACL probe in
-- its own block, with zero pg_get_functiondef calls in scope, satisfies the lint without
-- changing what either block asserts.
-- =====================================================================
do $tail$
declare
  v_prior_count int;
  v_src_a text; v_src_b text; v_src_c text;
begin
  -- (1) mandatory prior-migration check — 0029 must already be applied.
  select count(*) into v_prior_count from clara.schema_migrations
    where version = '0029_vendor_binding_executor';
  if v_prior_count <> 1 then
    raise exception '0030 tail: migration 0029 is not recorded as applied — apply in order';
  end if;

  -- (2) the new helper exists and is IMMUTABLE (its ACL is checked in the second block).
  if not exists (
    select 1 from pg_proc p
    where p.proname = '_binding_f1_floor_holds'
      and p.pronamespace = 'clara'::regnamespace
      and p.provolatile = 'i'
  ) then
    raise exception '0030 tail: clara._binding_f1_floor_holds must exist and be IMMUTABLE';
  end if;

  -- (3) the floor's own shape, exercised in-transaction (belt-and-suspenders on top of
  -- the rig cells — this runs unconditionally on every apply, including CI/prod).
  if clara._binding_f1_floor_holds('in') then
    raise exception '0030 tail: the floor must refuse a 2-char degenerate LCP ("in")';
  end if;
  if clara._binding_f1_floor_holds(null) then
    raise exception '0030 tail: the floor must refuse a NULL LCP';
  end if;
  if not clara._binding_f1_floor_holds('ez 易计 ezaccount') then
    raise exception '0030 tail: the floor must ADMIT a real multi-script LCP at/above 8 chars with a genuine token';
  end if;
  if clara._binding_f1_floor_holds('sdn bhd') then
    raise exception '0030 tail: the floor must refuse an LCP made entirely of corporate-form filler tokens';
  end if;

  -- (4) the three edited functions all carry the 0030 F1 patch marker (a cheap CoR
  -- sanity check — the real proof is the rig cells, this just guards against a
  -- mis-assembled body shipping silently).
  select pg_get_functiondef('clara._derive_vendor_binding_proposal(uuid,uuid,uuid)'::regprocedure)
    into v_src_a;
  select pg_get_functiondef('clara._resolve_vendor_binding(uuid,uuid,uuid)'::regprocedure)
    into v_src_b;
  select pg_get_functiondef('clara.execute_rule_post(uuid,text)'::regprocedure)
    into v_src_c;
  if v_src_a not like '%_binding_f1_floor_holds%'
     or v_src_a like '%count(distinct value->>''f1_vendor_name_norm'')%' then
    raise exception '0030 tail: _derive_vendor_binding_proposal does not carry the LCP+floor patch';
  end if;
  if v_src_b not like '%starts_with(v_norm_name,b.f1_vendor_name_norm)%' then
    raise exception '0030 tail: _resolve_vendor_binding does not carry the starts_with patch';
  end if;
  if v_src_c not like '%starts_with(v_f1_current,b.f1_vendor_name_norm)%'
     or v_src_c not like '%starts_with(clara._binding_normalize(vn.vendor_name),%' then
    raise exception '0030 tail: execute_rule_post does not carry both F1 starts_with patches';
  end if;

  raise notice '0030 tail 1/2: prior-migration, helper existence/immutability, floor behavior, and CoR patch markers all verified';
end
$tail$;

-- Second block (see the note above the first `do $tail$`): the ACL probe alone, with no
-- pg_get_functiondef call in scope.
do $tail2$
begin
  if exists (
    select 1 from pg_proc p
    where p.proname = '_binding_f1_floor_holds'
      and p.pronamespace = 'clara'::regnamespace
      and (p.proacl is null or exists (
        select 1 from lateral aclexplode(p.proacl) a
          where a.privilege_type = 'EXECUTE'
            and (a.grantee = 0 or pg_get_userbyid(a.grantee) <> 'clara_fn_owner')))
  ) then
    raise exception '0030 tail: clara._binding_f1_floor_holds must be owner-only (no PUBLIC/other-role EXECUTE)';
  end if;

  raise notice '0030: F1 is now the windowed LCP (floored >=8 chars + >=1 non-filler token) in propose/sign, Slot A matching is starts_with, and both of execute_rule_post''s post-time F1 sites are starts_with — F1 remains a stability feature, F3 alone carries identity';
end
$tail2$;
