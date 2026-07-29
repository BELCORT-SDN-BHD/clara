-- 0035_drafting_trio.sql -- the drafting-trio DB half (owner-approved closing batch):
-- SECTION A (#21) an advisory approve-time warning when a supplier_bill approves with
-- no counterparty bound, and SECTION B (#34) the CLR23 counterparty-landscape-changed
-- remedy text, which told every caller to "revise the draft" when no lane the system
-- ships can actually revise one (drafts are withdraw-and-redraft, not edit-in-place).
-- Both sections recut the SAME live function, clara._approve_entry_core -- one
-- migration, one CoR pull, two surgical edits.
--
-- SECTION A (#21). The approve path determines v_counterparty either by resolving
-- e.proposed_counterparty (present on every drafted-with-a-vendor entry) or, when
-- proposed_counterparty is null, by falling back to whatever counterparty_id already
-- sits on the entry's payable/receivable lines. When NEITHER path yields a
-- counterparty, the approval still proceeds (advisory-never-blocking is owner law) but
-- writes NO clara.rule_sightings row (the H2 gate at the bottom of this function is
-- keyed on v_counterparty is not null) -- so this vendor can never accumulate the
-- 3-sighting evidence a vendor_account rule needs, and this entry can never itself be
-- found by a future duplicate-bill or autopost check that keys off counterparty. The
-- fix: when coding_kind='supplier_bill' and v_counterparty ends up null, stamp a typed
-- warning onto BOTH the returned/persisted receipt (a 'warnings' array on the
-- _finish_op payload) and the audit record (_audit's own jsonb gets a 'warning' key) --
-- surgical, additive only, no lock or receipt-shape change to the op_key/_reserve_op/
-- _finish_op mechanics themselves.
--
-- HONEST PREMISE CHECK (0035 investigation, before writing a line of this fix, and a
-- correction the owner's own review caught -- see below). Built a throwaway
-- supplier_bill draft directly (bypassing every draft-time verb) with a payable line
-- whose counterparty_id was null, expecting to reach this new branch -- it did not.
-- clara._assert_supplier_bill_shape_at (called from THIS function, unconditionally,
-- for every coding_kind, not just supplier_bill) already refuses "every control-class
-- line requires a counterparty" before this function's own logic is even reached, and
-- an independent DEFERRED CONSTRAINT TRIGGER (t_je_supplier_bill_shape, AFTER UPDATE
-- ... WHEN new.status='approved') enforces the identical shape a second time at
-- commit, structurally unable to be bypassed by calling _approve_entry_core directly.
-- Separately, clara._resolve_counterparty's three live decision branches
-- (registration_match, alias_match, birth) ALL populate a counterparty_id -- there is
-- no live decision shape that leaves it unset. So for a NEW approval today, this
-- branch is EMPIRICALLY UNREACHABLE -- the 0029/0030 vendor-binding hardening closed
-- the door after the fact. No future reader should mistake it for a live first-line
-- control: the shape guard (reinforced by the deferred trigger) IS the control; this
-- advisory sits entirely behind it.
--
-- THE RE-ENTRY QUESTION (owner review, precision requirement -- and a genuine
-- correction from the O-round Codex confirmation pass below, not merely a restated
-- claim). An approved historical RPR-class row cannot itself pass through
-- _approve_entry_core again -- approval is a one-way transition. The only plausible
-- SANCTIONED re-entry candidate is REVERSAL: clara.reverse_entry mirrors the
-- original's journal_lines VERBATIM, including counterparty_id (0009/0005) -- but it
-- does NOT copy coding_kind onto the mirror row at all, so a reversal of a historical
-- supplier_bill is never itself coding_kind='supplier_bill', and neither of
-- reverse_entry's own paths (the non-high-stakes inline auto-approve via
-- clara._assert_supplier_bill_shape, a one-line wrapper around the identical
-- clara._assert_supplier_bill_shape_at check; or the high-stakes path that leaves the
-- reversal as a draft for later approval through THIS function) can reach Section A's
-- branch. So far, so unreachable -- but that is not the whole answer.
--
-- THE CORRECTION (O-round Codex confirmation, Medium finding, independently
-- reproduced against a live database before accepting it). clara.
-- _assert_supplier_bill_shape_at's supplier_bill-specific checks (no receivable-class
-- leg, no payable-class debit leg, a payable-class credit required, the rounding-leg
-- and sst-leg shape rules) are ALL gated `and e.reversal_of is null` -- ONLY the very
-- first, unconditional check ("every control-class line requires a counterparty")
-- applies regardless of reversal_of. A row built directly (bypassing every draft-time
-- verb, exactly the technique x35.b itself already uses to probe this boundary) with
-- coding_kind='supplier_bill', reversal_of set to any existing entry, and ZERO
-- payable/receivable-class lines at all satisfies that one unconditional check
-- VACUOUSLY (there is nothing to check), skips every other supplier_bill guard because
-- reversal_of is not null, and reaches clara._approve_entry_core's own v_counterparty
-- fallback resolution -- which finds no payable/receivable line to read a
-- counterparty_id from at all, leaving v_counterparty null. Section A's branch then
-- fires and its warning PERSISTS, in both the receipt and the audit row. Reproduced
-- directly against a fresh migrated database: the approval succeeds, and the returned/
-- persisted receipt carries {"warnings":[{"code":"no_counterparty_sighting",...}]}.
--
-- So the precise, honest statement replacing the first draft's overclaim ("no re-entry
-- path exists... pure regression guard"): Section A is unreachable through any
-- SANCTIONED draft-time verb followed by the normal approve flow, for coding_kind=
-- 'supplier_bill' -- but it IS reachable via direct row construction that exploits the
-- reversal_of gate on the supplier_bill-specific shape checks, the same class of
-- construction x35.b relies on to test the boundary at all. This makes Section A more
-- than defense-in-depth against a hypothetical future change -- it is a genuine,
-- narrow, PRESENT safety net: the only thing standing between this exact
-- reversal-shaped gap and a silent, unrecorded counterparty-less approval today. x35.c
-- below exercises this exact counterexample end-to-end (approval succeeds, receipt and
-- audit row both carry the warning, a same-op-key retry replays the identical
-- receipt) rather than merely asserting the branch is unreachable. Reported to the
-- owner as part of this delivery, not swept under the rug -- the owner's own review
-- caught the first draft's "lens onto historical rows" imprecision (those rows are
-- already approved and can never revisit this function), which is what prompted the
-- Codex pass that found the real reversal-shaped path in turn.
--
-- SECTION B (#34). clara._approve_entry_core's counterparty-fingerprint-changed refusal
-- read "counterparty match landscape changed; revise the draft" -- a remedy no lane
-- the system ships can actually follow (there is no in-place draft-revision verb; a
-- rejected draft's only path forward is withdraw-and-redraft). Exhaustively scanned
-- every live clara function via pg_get_functiondef for the literal phrase "revise the
-- draft" (a loop over pg_proc, not a static grep of migration files, which would also
-- have surfaced now-superseded historical text from clara.approve_entry and
-- clara._resolve_counterparty's own pre-0016 recuts) -- confirmed exactly ONE live
-- occurrence, in this function. Replaced the remedy clause only; errcode stays CLR23,
-- no detail key added or removed, no other branch touched (the two birth-race CLR23
-- refusals nearby carry their own, different wording and were never in scope).
--
-- CoR DISCIPLINE. The body below was pulled via pg_get_functiondef against the live,
-- fully-migrated 0001-0034 database (0034 merged as PR #139/#140), not hand-copied
-- from any migration file's static text -- the true prior content-dependency for THIS
-- function is 0029_vendor_binding_executor (its most recent recut), independent of the
-- tooling's own numeric frontier, which is 0034 (this file claims the next free
-- number at merge time, per the standing dispatch law).
--
-- D1 NOTE. This recuts the live approve path (clara._approve_entry_core) -- the same
-- write-quiesce discipline 0029/0030/0031 already required applies here too; deploy
-- through the repo's quiesced-apply ceremony, not a bare migrate against a live target.
--
-- CELLS (packages/db/tests/x35-drafting-trio.test.mjs), FOUR, matching the two
-- sections and the re-entry finding above: x35.a exercises Section B end-to-end via a
-- real vendor-birth-race scenario (the counterparty-landscape-changed refusal now
-- reads the new remedy text, exactly and only that text, errcode still CLR23);
-- x35.b names the boundary that DOES hold for the ordinary shape (a supplier_bill
-- draft with a payable line whose counterparty_id is null): Section A's own
-- conditional DOES execute (it is not "never reached"), but the LATER, unconditional
-- shape-guard check aborts the whole transaction before any return, so no
-- warning-bearing receipt or audit row is ever persisted for THIS shape -- the shape
-- guard is the control, Section A's advisory sits entirely behind it for any entry
-- that carries a control-class line at all; x35.c is the real end-to-end test of the
-- reversal-shaped counterexample the O-round Codex pass found: coding_kind=
-- 'supplier_bill', reversal_of set, zero control-class lines -- the approval succeeds,
-- the receipt and the audit row both carry the exact typed warning, and a same-op-key
-- retry replays the identical cached receipt (proving the op_key/_reserve_op/
-- _finish_op mechanics are undisturbed); x35.d proves a normal counterparty-bound
-- approve carries no 'warnings' key at all (not an empty array -- the key is absent)
-- and the audit row carries no 'warning' key either -- zero behavioral change for the
-- common case.

set role clara_fn_owner;

-- =====================================================================
-- clara._approve_entry_core (0009, recut through 0029 for vendor-binding, now by 0035
-- for the RPR-class no-sighting advisory + the CLR23 remedy-text fix).
-- =====================================================================
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
  v_checked_via_rule uuid; v_kind text; v_bound uuid; v_no_cp_warning jsonb;
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
      raise exception 'counterparty match landscape changed; withdraw the draft and re-draft; the new draft will resolve against the current counterparty landscape'
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

  -- 0035 SECTION A (#21, owner-approved): an ADVISORY approve-time warning when a
  -- supplier_bill approves with NO counterparty bound. Advisory-never-blocking (owner
  -- law) -- the approval proceeds unchanged; the receipt and the audit trail carry a
  -- typed warning so the RPR-class silent dead-end (an approval that builds no
  -- autopost history because no counterparty was ever bound, so no rule_sightings row
  -- can ever be written for it) can never rebuild itself invisibly again.
  if e.coding_kind='supplier_bill' and v_counterparty is null then
    v_no_cp_warning:=jsonb_build_object('code','no_counterparty_sighting',
      'message','no sighting recorded - this approval builds no autopost history');
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
      'checked_via_rule_id',v_checked_via_rule)
      || case when v_no_cp_warning is not null
           then jsonb_build_object('warning',v_no_cp_warning) else '{}'::jsonb end);
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
    jsonb_build_object('entry_id',p_entry,'status','approved')
      || case when v_no_cp_warning is not null
           then jsonb_build_object('warnings',jsonb_build_array(v_no_cp_warning))
           else '{}'::jsonb end);
end $function$;

reset role;

do $tail$
declare
  v_prior_count int; v_src text; v_old_count int; v_new_count int;
  v_pos_else_close int; v_pos_section_a int; v_pos_locks int;
  v_pos_return int; v_pos_return_case int; v_pos_audit int; v_pos_audit_case int;
  r record; v_scan_src text; v_leak_old_count int; v_leak_new_count int;
  v_target_oid oid;
begin
  v_target_oid:='clara._approve_entry_core(jsonb,uuid,uuid,text,text)'::regprocedure;
  -- (1) mandatory prior-migration check -- the true content dependency is 0029's
  -- recut of clara._approve_entry_core, independent of the tooling's own numeric
  -- frontier (see the CoR DISCIPLINE header note above).
  select count(*) into v_prior_count from clara.schema_migrations
    where version = '0029_vendor_binding_executor';
  if v_prior_count <> 1 then
    raise exception '0035 tail: migration 0029_vendor_binding_executor is not recorded as applied -- apply in order';
  end if;

  select pg_get_functiondef('clara._approve_entry_core(jsonb,uuid,uuid,text,text)'::regprocedure)
    into v_src;
  v_src:=lower(regexp_replace(
    regexp_replace(
      regexp_replace(v_src,'/\*[\s\S]*?\*/','','g'),
      '--[^\n]*','','g'),
    '\s+',' ','g'));

  -- (2) SECTION B: the old remedy phrase is fully retired from THIS function, and the
  -- new one appears exactly once, with errcode CLR23 still attached.
  v_old_count:=(length(v_src)-length(replace(v_src,'revise the draft','')))
    / length('revise the draft');
  if v_old_count <> 0 then
    raise exception '0035 tail: the old "revise the draft" remedy phrase is still present (% occurrences) -- section B did not land', v_old_count;
  end if;
  v_new_count:=(length(v_src)-length(replace(v_src,
      'withdraw the draft and re-draft; the new draft will resolve against the current counterparty landscape','')))
    / length('withdraw the draft and re-draft; the new draft will resolve against the current counterparty landscape');
  if v_new_count <> 1 then
    raise exception '0035 tail: the new CLR23 remedy phrase must appear exactly once -- found %', v_new_count;
  end if;
  if position('withdraw the draft and re-draft; the new draft will resolve against the current counterparty landscape'' using errcode=''clr23' in v_src) = 0 then
    raise exception '0035 tail: the new remedy phrase is not attached to errcode CLR23';
  end if;

  -- (3) SECTION A: the advisory-warning conditional exists, positioned strictly AFTER
  -- the v_counterparty fallback-resolution block closes and strictly BEFORE the
  -- advisory locks that follow it (the same relative position it was inserted at --
  -- proves the block was not accidentally moved ahead of v_counterparty's own
  -- determination, which would read a not-yet-final value).
  v_pos_else_close:=position(
    'from clara.journal_lines l join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code where l.entry_id=p_entry and a.account_class in (''payable'',''receivable'') and l.counterparty_id is not null; end if;'
    in v_src);
  v_pos_section_a:=position(
    'if e.coding_kind=''supplier_bill'' and v_counterparty is null then'
    in v_src);
  v_pos_locks:=position(
    'if v_counterparty is not null then perform pg_advisory_xact_lock(203005003,'
    in v_src);
  if v_pos_else_close=0 or v_pos_section_a=0 or v_pos_locks=0
     or not (v_pos_else_close < v_pos_section_a and v_pos_section_a < v_pos_locks) then
    raise exception '0035 tail: section A''s warning check is not positioned between the v_counterparty fallback resolution and the advisory locks (else_close=%, section_a=%, locks=%)',
      v_pos_else_close, v_pos_section_a, v_pos_locks;
  end if;

  -- (4) the final return carries the conditional warnings-array append, and the audit
  -- call carries the conditional warning-key append -- both additive, neither touches
  -- the op_key/_reserve_op/_finish_op mechanics.
  v_pos_return:=position(
    'return clara._finish_op(c.firm,''approve_entry'',p_op_key, jsonb_build_object(''entry_id'',p_entry,''status'',''approved'')'
    in v_src);
  v_pos_return_case:=position(
    'jsonb_build_object(''warnings'',jsonb_build_array(v_no_cp_warning))'
    in v_src);
  if v_pos_return=0 or v_pos_return_case=0 or v_pos_return_case < v_pos_return then
    raise exception '0035 tail: the final return does not carry the conditional warnings-array append';
  end if;
  v_pos_audit:=position(
    'perform clara._audit(c.firm,c.actor,null,null,''approve_entry'',p_entry, jsonb_build_object(''filing'''
    in v_src);
  v_pos_audit_case:=position(
    'jsonb_build_object(''warning'',v_no_cp_warning)'
    in v_src);
  if v_pos_audit=0 or v_pos_audit_case=0 or v_pos_audit_case < v_pos_audit
     or v_pos_audit_case > v_pos_return then
    raise exception '0035 tail: the audit call does not carry the conditional warning-key append in the right place';
  end if;

  raise notice '0035 tail OK (1/5): prior-migration chain intact through 0029''s recut of _approve_entry_core';
  raise notice '0035 tail OK (2/5): section B''s old remedy phrase is fully retired and the new phrase appears exactly once, still CLR23';
  raise notice '0035 tail OK (3/5): section A''s warning check sits strictly between v_counterparty''s fallback resolution and the advisory locks';
  raise notice '0035 tail OK (4/5): the final return and the audit call both carry the conditional warning append, additive only';

  -- (5) whole-schema scan: confirm NO other live clara function carries EITHER remedy
  -- phrase -- the old one (section B must be exhaustive, not merely local) AND the new
  -- one (proving _approve_entry_core is the ONLY carrier of the new text too, closing
  -- the O-round Codex finding that the first draft of this scan only ever checked the
  -- old phrase and so could not support its own "before or after" claim). Excludes by
  -- OID (the exact signature already resolved above), not by proname -- a same-named
  -- overload with a different signature would NOT be silently skipped the way a
  -- proname-based exclusion would. A functiondef error on any one proc is reported and
  -- skipped, never silently treated as a pass.
  v_leak_old_count:=0; v_leak_new_count:=0;
  for r in select p.oid, p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='clara' and p.oid <> v_target_oid order by p.proname loop
    begin
      v_scan_src := pg_get_functiondef(r.oid);
    exception when others then
      raise notice '0035 tail: SKIP % (functiondef error: %)', r.proname, sqlerrm;
      continue;
    end;
    if v_scan_src ilike '%revise the draft%' then
      v_leak_old_count:=v_leak_old_count+1;
      raise notice '0035 tail: LEAK (old phrase) -- % still carries the old remedy phrase', r.proname;
    end if;
    if v_scan_src ilike '%withdraw the draft and re-draft; the new draft will resolve against the current counterparty landscape%' then
      v_leak_new_count:=v_leak_new_count+1;
      raise notice '0035 tail: LEAK (new phrase) -- % unexpectedly also carries the new remedy phrase', r.proname;
    end if;
  end loop;
  if v_leak_old_count <> 0 then
    raise exception '0035 tail: % other live function(s) still carry the old remedy phrase -- section B is not exhaustive', v_leak_old_count;
  end if;
  if v_leak_new_count <> 0 then
    raise exception '0035 tail: % other live function(s) unexpectedly carry the new remedy phrase -- _approve_entry_core is not the sole carrier', v_leak_new_count;
  end if;
  raise notice '0035 tail OK (5/5): whole-schema scan confirms _approve_entry_core is the ONLY live function carrying EITHER the old or the new CLR23 remedy phrase';
end
$tail$;
