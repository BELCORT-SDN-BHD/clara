-- 0031_autopost_lane_unify.sql — the last two autopost walls: admission's stale-cache
-- divergence (ledger #39) + the near_duplicate discriminator (ledger #40). Owner ruling,
-- live founding runway: the vendor binding is LIVE and WORKS (Slot A resolves the real
-- evidence correctly — proven independently against the live database), but two more
-- walls stop the first production autopost.
--
-- §A (#39) — THE ACTUAL MECHANISM, CORRECTED FROM THE INITIAL DIAGNOSIS. The initial
-- report described "admit_autodraft_task delegates to a lane computation that is NOT
-- clara._coding_lane_core." Direct inspection of the live catalog disproves that: BOTH
-- clara.admit_autodraft_task (via clara._coding_lane_core(f.client_id,p_filing) at its
-- own call site) AND clara.coding_lane (the read verb, "return query select * from
-- clara._coding_lane_core(p_client,p_filing)") already call the identical function —
-- there was never a second, forked lane computation. The REAL mechanism, reproduced
-- directly against a scratch database: admit_autodraft_task reserves its op-key
-- (clara._reserve_op, keyed purely on (filing,origin) — deterministic, no state hash)
-- BEFORE calling clara._coding_lane_core, and a NOT-READY outcome settles that same
-- op-key via clara._finish_op — permanently caching the FIRST-EVER admission decision
-- for that (filing,origin) pair. A vendor binding going live, consent being granted, a
-- blocking draft being withdrawn, or any other later lane-state change is then invisible
-- forever: every subsequent request_autodraft call for that filing replays the cached
-- refusal, while clara.coding_lane (which touches no cache at all) correctly reports the
-- new state immediately — exactly the "coding_lane says ready, request_autodraft says
-- refused, on the SAME filing, reproducibly" symptom, proven with a planted stale
-- receipt: request_autodraft replayed it verbatim while a fresh clara.coding_lane call
-- on the SAME filing, at the SAME instant, reported the correct answer.
--
-- THE FIX. Reorder clara.admit_autodraft_task so the clara._coding_lane_core check runs
-- BEFORE op-key reservation (kept after the filing lock and the lock-protected registry
-- re-check, which must stay early for their own concurrency-safety reasons — see the CoR
-- comment inline). A NOT-READY outcome now returns directly, WITHOUT ever touching
-- clara.op_receipts — no reservation, no settlement, nothing cached, so it is re-derived
-- fresh on every call. Only a genuine 'admitted' outcome (which creates a real
-- clara.agent_tasks row) reaches the op-key reservation, preserving the idempotency that
-- actually matters: a retried admission after a real task exists must not create a
-- second one. Verified empirically: a not-ready lane now creates zero op_receipts rows;
-- once the underlying state genuinely changes, the next call correctly re-derives and
-- admits; a repeat call after a real admission still idempotently replays the same
-- task_id. Admission and the read verb now agree BY CONSTRUCTION on every call, because
-- the refusal path can no longer be intercepted by a stale cache — never by parallel
-- maintenance of two computations, because there was only ever one.
--
-- O-ROUND CONFIRMATION (two further findings, both fixed here, not deferred):
-- (1) THE PRE-EXISTING POISON. The reorder alone stops any NEW refusal from being
-- cached, but does nothing about a lane_changed/refused_budget receipt that was
-- ALREADY settled under the pre-0031 code — clara._reserve_op replays ANY settled
-- receipt for a given op-key regardless of which migration wrote it, so a filing
-- refused before this deploy would stay stuck exactly as before even after the fix
-- ships. §C below is a one-time, idempotent DELETE clearing every such receipt.
-- (2) THE BUDGET-REFUSAL BRANCHES CARRIED THE IDENTICAL DEFECT. clara.firm_usage_daily
-- resets per usage_date and clara.sweep_runs' open count changes as runs close — a
-- refused_budget outcome is exactly as state-dependent and transient as a lane_changed
-- one, but the original reorder only moved the LANE check ahead of reservation,
-- leaving both budget-refusal branches still settling the same state-free
-- (filing,origin) op-key via clara._finish_op. Neither branch mutates
-- firm_usage_daily/sweep_runs on the refusal path (only the success path does), so
-- re-deriving them fresh has no double-charge side effect. Fix: op-key reservation
-- now happens once, immediately before the ONE mutation that actually needs
-- idempotent replay protection — task creation itself — after BOTH the lane check
-- and the budget/concurrency checks.
--
-- §B (#40, RULED) — the near_duplicate amount limb (same counterparty + same total_cents
-- among approved unreversed document-bound entries) permanently blocked the autopost use
-- case itself: a flat recurring fee (the same vendor billing the same amount every
-- period) is exactly a legitimate repeat charge, not a duplicate upload. Fix: the amount
-- limb does NOT fire when both documents' extracted invoice_id values are PRESENT and
-- DISTINCT and the document sha256s differ — a different bill number on a different
-- physical document is "the same fee again," not "the same bill twice." Same-or-ABSENT
-- invoice_id on either side keeps the limb firing exactly as before (fail-conservative:
-- no id means no discrimination is possible, so the flag stays up). The sha256 comparison
-- guards a re-extraction of the SAME physical document with a drifted invoice_id read —
-- still the same bill regardless of what two OCR passes captured. The invoice_date limb
-- is entirely untouched. This makes the control MORE precise, not weaker: every genuine
-- duplicate (same id, absent id on either side, or the same document re-read) still
-- flags exactly as it always has; only the one false-positive shape this ruling names is
-- narrowed.
--
-- CoR DISCIPLINE. Both bodies below were pulled via pg_get_functiondef against the live
-- 30-migration database (0001-0030, 0028/0029/0030 merged and deployed as runtime v35 /
-- PR #136, PR #137), not hand-copied from any migration file's static text.
--
-- D1 WRITE-QUIESCE. clara.admit_autodraft_task and clara._coding_lane_core are BOTH live
-- writer/resolver paths — admission creates real clara.agent_tasks rows, and the lane
-- core is consumed by every coding-eligibility decision in the system (the read verb, the
-- Slot A/B binding admission path, and now admission itself). Per the repo-mandated D1
-- write-quiesce (packages/db/README.md:95-113), 0031's deploy requires its own quiesced
-- window — independent of any prior migration's window, because this recut is
-- deliberate and touches the live posting/admission path directly.
--
-- CELLS (packages/db/tests/x31-autopost-lane-unify.test.mjs): (a) a real EZSEC-shaped
-- live evidence window (vendor bound, near_duplicate absent) reaches clara.coding_lane
-- 'ready' and clara.request_autodraft 'admitted' end-to-end — 0031 does not itself
-- create the eventual draft (that is Slot A/B's job, proven in 0028/0029/0030's own
-- batteries); this cell's scope is admission reaching the queued task, not the draft
-- that a later runtime pass produces from it; (b) a genuinely duplicate upload (same
-- invoice_id, or same sha256) still flags near_duplicate; (c) same amount + ABSENT
-- invoice_id, on either side, still flags; (d) same amount + same invoice_id, different
-- docs, still flags; (e) admission (request_autodraft) and the read verb (coding_lane)
-- agree on multiple shapes — proven by direct comparison on the SAME filing at the SAME
-- instant, across a not-ready shape, a shape that becomes ready after a state change
-- (with the op_receipts row count asserted at zero across the refusal AND directly
-- confirmed settled after the real admission), and a ready shape re-checked after a
-- genuine admission.

set role clara_fn_owner;

-- =====================================================================
-- §A — clara.admit_autodraft_task (0011, never recut until now): the lane check moves
-- before op-key reservation; a NOT-READY outcome is never cached.
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

  -- The op-key is reserved here, immediately before the one mutation (task
  -- creation) that genuinely needs idempotent replay protection on retry.
  v_op_key:='autodraft:'||p_filing||':'||p_origin;
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
    jsonb_build_object('outcome','admitted','task_id',v_task,
      'reserved_tokens',p_reserve_tokens));
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
end $function$;

-- =====================================================================
-- §B — clara._coding_lane_core (0011/0013/0015/0028): the near_duplicate amount limb
-- gains the invoice_id + sha256 discriminator. The invoice_date limb is untouched.
-- =====================================================================
CREATE OR REPLACE FUNCTION clara._coding_lane_core(p_client uuid, p_filing uuid)
 RETURNS TABLE(lane text, reasons text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'clara', 'pg_temp'
AS $function$
declare
  f record; v_state jsonb; v_reasons text[]:='{}'::text[]; v_vendor text;
  v_vendor_reg text;
  v_fp jsonb; v_counterparty uuid; v_hard boolean:=false; v_total bigint;
  v_invoice_date text; v_rule boolean:=false; v_invoice_id text;
  v_direction text; v_kind text;
begin
  select df.*,d.sha256 into f from clara.document_filings df
    join clara.documents d on d.id=df.document_id
    where df.id=p_filing and df.client_id=p_client and df.retired_at is null;
  if not found then
    return query select 'needs_you'::text,array['no_active_filing']::text[];
    return;
  end if;
  if exists(select 1 from clara.journal_entries e where e.filing_id=f.id
      and e.status='draft') then
    v_reasons:=array_append(v_reasons,'open_draft');
  end if;
  if exists(select 1 from clara.journal_entries e where e.filing_id=f.id
      and e.status='approved' and e.reversed_by is null) then
    v_reasons:=array_append(v_reasons,'already_coded');
  end if;
  v_state:=clara._invoice_fact_state(f.document_id);
  if v_state='{}'::jsonb then
    v_reasons:=array_append(v_reasons,'facts_pending');
  else
    if coalesce(v_state->>'corroboration_ineligible','')='multi_document' then
      v_reasons:=array_append(v_reasons,'multi_doc'); v_hard:=true;
    end if;
    if coalesce((v_state->>'explicit_non_myr')::boolean,false) then
      v_reasons:=array_append(v_reasons,'non_myr'); v_hard:=true;
    end if;
    if not coalesce((v_state->>'corroborated')::boolean,false) then
      v_reasons:=array_append(v_reasons,'tier_a_fails');
    end if;
  end if;
  -- S7: direction is client-relative; a contradiction is a hard NEEDS YOU (CLR30).
  begin
    v_direction:=clara._document_direction(f.document_id,p_client);
  exception when sqlstate 'CLR30' then
    v_reasons:=array_append(v_reasons,'direction_unresolved'); v_hard:=true; v_direction:='purchase';
  end;
  v_kind:=case when v_direction='sales' then 'customer' else 'vendor' end;
  if v_direction='sales' then
    select nullif(btrim(min(r.text_content)),'') into v_vendor
      from clara.document_regions r where r.extraction_id=(
        select e.id from clara.document_extractions e
        where e.document_id=f.document_id and e.engine_kind='invoice_facts' and e.status='done'
        order by e.version_n desc,e.id desc limit 1)
        and r.field_path='invoice.customer_name';
    select nullif(btrim(min(r.text_content)),'') into v_vendor_reg
      from clara.document_regions r where r.extraction_id=(
        select e.id from clara.document_extractions e
        where e.document_id=f.document_id and e.engine_kind='invoice_facts' and e.status='done'
        order by e.version_n desc,e.id desc limit 1)
        and r.field_path='invoice.customer_registration';
  else
    select nullif(btrim(min(r.text_content)),'') into v_vendor
      from clara.document_regions r where r.extraction_id=(
        select e.id from clara.document_extractions e
        where e.document_id=f.document_id and e.engine_kind='invoice_facts' and e.status='done'
        order by e.version_n desc,e.id desc limit 1)
        and r.field_path='invoice.vendor_name';
    select nullif(btrim(min(r.text_content)),'') into v_vendor_reg
      from clara.document_regions r where r.extraction_id=(
        select e.id from clara.document_extractions e
        where e.document_id=f.document_id and e.engine_kind='invoice_facts' and e.status='done'
        order by e.version_n desc,e.id desc limit 1)
        and r.field_path='invoice.vendor_registration';
  end if;
  if v_vendor is null then
    v_reasons:=array_append(v_reasons,'vendor_unresolved');
  else
    declare
      v_page_candidate uuid;
      v_binding_result jsonb;
      v_resolution_refused boolean:=false;
    begin
      v_fp:=null;
      begin
        v_fp:=clara._resolve_counterparty(p_client,
          jsonb_build_object('kind',v_kind,'new',case when v_vendor_reg is not null
            then jsonb_build_object('name',v_vendor,'registration_no',v_vendor_reg)
            else jsonb_build_object('name',v_vendor) end));
      exception when sqlstate 'CLR23' then
        declare
          v_detail text;
          v_detail_j jsonb;
        begin
          get stacked diagnostics v_detail=pg_exception_detail;
          begin
            v_detail_j:=nullif(v_detail,'')::jsonb;
          exception when others then
            v_detail_j:=null;
          end;
          if coalesce(v_detail_j->>'reason','')<>'registration_conflict' then
            v_reasons:=array_append(v_reasons,'vendor_ambiguous');
            v_hard:=true;
            v_resolution_refused:=true;
          else
            begin
              v_page_candidate:=nullif(
                v_detail_j->>'candidate_id','')::uuid;
            exception when others then
              v_page_candidate:=null;
            end;
            if v_page_candidate is null then
              v_reasons:=array_append(v_reasons,'vendor_ambiguous');
              v_hard:=true;
              v_resolution_refused:=true;
            end if;
          end if;
        end;
      end;

      if v_resolution_refused then
        null;
      elsif v_fp is not null and v_fp->>'decision'<>'birth' then
        v_counterparty:=(v_fp->>'counterparty_id')::uuid;
      else
        v_binding_result:=clara._resolve_vendor_binding(
          p_client,f.document_id,v_page_candidate);
        if v_binding_result->>'outcome'='bound' then
          v_counterparty:=(v_binding_result->>'counterparty_id')::uuid;
          v_reasons:=array_append(v_reasons,'vendor_bound');
        elsif v_page_candidate is not null then
          -- Reached via registration_conflict (a name-only match against an
          -- ALREADY-REGISTERED vendor), but the binding did not confirm it --
          -- fall back to the SAME pre-existing safe default a name-only match
          -- against a registered vendor has always produced, whether Slot A
          -- said 'unresolved' (no live binding at all) or 'ambiguous' (an F1
          -- collision or F2 mismatch on one candidate): the underlying page
          -- fact (a known name, unconfirmed legal entity) is identical either
          -- way, and a vendor with no binding must see byte-identical
          -- behavior to before this migration (wave-a1-vendor-registration's
          -- own regression coverage pins this).
          v_reasons:=array_append(v_reasons,'vendor_ambiguous');
          v_hard:=true;
        elsif v_binding_result->>'outcome'='ambiguous' then
          -- Reached via genuine birth (a name matching no registered
          -- counterparty at all) but multiple live bindings independently
          -- match it -- a situation with no pre-existing reason to preserve,
          -- since it could not occur before this migration.
          v_reasons:=array_append(v_reasons,'binding_ambiguous');
          v_hard:=true;
        else
          v_reasons:=array_append(v_reasons,'vendor_unresolved');
        end if;
      end if;
    end;
  end if;
  if exists(select 1 from clara._open_question_blocks(p_client,f.id,v_counterparty)) then
    v_reasons:=array_append(v_reasons,'open_question'); v_hard:=true;
  end if;
  if not exists(select 1 from clara.client_egress_consents c
      where c.client_id=p_client and c.revoked_at is null) then
    v_reasons:=array_append(v_reasons,'no_consent');
  end if;
  if exists(select 1 from clara.autodraft_attempts a
      where a.filing_id=f.id and a.state='parked') then
    v_reasons:=array_append(v_reasons,'parked');
  end if;
  if v_counterparty is not null and exists(select 1 from clara.coding_rules r
      where r.client_id=p_client and r.counterparty_id=v_counterparty
        and r.rule_type='vendor_account' and r.status='live') then
    v_reasons:=array_append(v_reasons,'rule_backed'); v_rule:=true;
  end if;
  begin v_total:=(v_state->>'total_cents')::bigint; exception when others then v_total:=null; end;
  if v_total is not null and v_total>=(select high_stakes_amount_cents
      from clara.firms where id=f.firm_id) then
    v_reasons:=array_append(v_reasons,'high_stakes');
  end if;
  v_invoice_date:=nullif(v_state->>'invoice_date','');
  -- 0031 §B (ledger #40, owner ruling): the near_duplicate amount limb's own
  -- discriminator input -- the CURRENT document's own extracted invoice_id.
  v_invoice_id:=nullif(v_state->>'invoice_id','');
  -- 0031 §B (ledger #40, owner ruling): the amount limb alone does NOT fire when
  -- both documents' extracted invoice_id values are PRESENT and DISTINCT and the
  -- document sha256s differ -- a different bill number on a different physical
  -- document is "the same fee again" (a legitimate recurring flat-fee charge),
  -- not "the same bill twice". Same-or-ABSENT invoice_id on either side keeps
  -- the limb firing exactly as before (fail-conservative: no id on either side
  -- means no discrimination is possible, so the flag stays up). The sha256
  -- comparison guards the case where the SAME physical document was re-extracted
  -- with a drifted invoice_id read -- that is still the same bill, never a
  -- legitimately different one, regardless of what the two OCR passes captured.
  -- The invoice_date limb is entirely untouched -- this makes the control MORE
  -- precise, not weaker: it only narrows the amount limb's false-positive rate
  -- for the exact autopost use case (a flat recurring fee) it previously blocked
  -- outright, while every genuine duplicate (same id, absent id, or same
  -- document re-read) still flags exactly as it always has.
  if v_counterparty is not null and exists(
      select 1 from clara.journal_entries e
      join clara.documents ed on ed.id=e.document_id
      where e.client_id=p_client and e.status='approved' and e.reversed_by is null
        and e.document_id is not null and exists(select 1 from clara.journal_lines l
          where l.entry_id=e.id and clara._canonical_counterparty(
            p_client,l.counterparty_id)=v_counterparty)
        and ((v_invoice_date is not null and
              clara._invoice_fact_state(e.document_id)->>'invoice_date'=v_invoice_date)
          or (v_total is not null and
              (clara._invoice_fact_state(e.document_id)->>'total_cents')::bigint=v_total
              and not (
                v_invoice_id is not null
                and nullif(clara._invoice_fact_state(e.document_id)->>'invoice_id','') is not null
                and nullif(clara._invoice_fact_state(e.document_id)->>'invoice_id','')<>v_invoice_id
                and ed.sha256<>f.sha256
              )))
    ) then
    v_reasons:=array_append(v_reasons,'near_duplicate');
  end if;
  if v_hard then lane:='needs_you';
  elsif coalesce(array_length(array_remove(array_remove(v_reasons,'rule_backed'),'vendor_bound'),1),0)=0 then lane:='ready';
  else lane:='needs_review'; end if;
  reasons:=v_reasons;
  return next;
end $function$;

reset role;

-- =====================================================================
-- §C (0031 O-round confirmation finding 1) -- clear PRE-EXISTING poisoned receipts.
-- The reorder above stops any NEW refusal from being cached, but does nothing for a
-- lane_changed/refused_budget receipt that was ALREADY settled under the pre-0031 code
-- for a filing that has since become ready (or whose budget has since reset/cleared) --
-- that filing would remain permanently stuck exactly as before, since _reserve_op
-- replays ANY settled receipt regardless of which migration wrote it. This is a
-- one-time, idempotent cleanup: delete every admit_autodraft_task receipt whose
-- SETTLED result was a refusal (never an 'admitted' one -- those still gate real
-- agent_tasks rows and must not be disturbed). A no-op on a fresh database; on a live
-- upgrade it re-arms every filing an old refusal was silently blocking, matching
-- exactly what the FIXED code would have done had it always been in effect.
-- =====================================================================
set role clara_fn_owner;
do $cleanup$
declare v_cleared int;
begin
  delete from clara.op_receipts
    where fn='admit_autodraft_task'
      and result is not null
      and result->>'outcome' in ('lane_changed','refused_budget');
  get diagnostics v_cleared = row_count;
  raise notice '0031 §C: cleared % pre-existing poisoned admit_autodraft_task receipt(s)',v_cleared;
end
$cleanup$;
reset role;

-- =====================================================================
-- TAIL — in-transaction self-verification. Every raise is a real assertion failure, not
-- a soft warning; a clean run ends with one notice and nothing else.
-- =====================================================================
do $tail$
declare
  v_prior_count int;
  v_admit_src text; v_lane_src text;
  v_pos_lock int; v_pos_recheck int; v_pos_lane int; v_pos_opkey int;
begin
  -- (1) mandatory prior-migration check — 0030 must already be applied.
  select count(*) into v_prior_count from clara.schema_migrations
    where version = '0030_vendor_binding_f1_lcp';
  if v_prior_count <> 1 then
    raise exception '0031 tail: migration 0030_vendor_binding_f1_lcp is not recorded as applied — apply in order';
  end if;

  -- (2) §A: the filing lock and the lock-protected registry re-check remain BEFORE the
  -- lane check, which itself remains BEFORE op-key reservation. This is the exact order
  -- that keeps concurrency safety (lock, then re-check the registry a waiter could have
  -- raced past) while ensuring a refusal is never cached (lane check strictly before
  -- clara._reserve_op).
  select pg_get_functiondef('clara.admit_autodraft_task(uuid,text,uuid,text,bigint)'::regprocedure)
    into v_admit_src;
  v_pos_lock:=position(
    'for update;' in v_admit_src);
  v_pos_recheck:=position(
    'waiter that lost the filing lock rechecks the registry' in v_admit_src);
  v_pos_lane:=position(
    'select * into v_lane from clara._coding_lane_core(f.client_id,p_filing);' in v_admit_src);
  -- O-round confirmation finding 4: anchor on the ACTUAL clara._reserve_op(...) CALL,
  -- not merely the v_op_key:= assignment that precedes it — a mutation that hoisted the
  -- real reservation call earlier while leaving the assignment text in place would
  -- otherwise still pass this probe.
  v_pos_opkey:=position(
    'clara._reserve_op(f.firm_id,''admit_autodraft_task'',v_op_key,' in v_admit_src);
  if v_pos_lock=0 or v_pos_recheck=0 or v_pos_lane=0 or v_pos_opkey=0
     or v_pos_lock>=v_pos_recheck or v_pos_recheck>=v_pos_lane
     or v_pos_lane>=v_pos_opkey then
    raise exception
      '0031 tail: admit_autodraft_task lock/recheck/lane/op-key order is wrong (lock=%, recheck=%, lane=%, opkey=%)',
      v_pos_lock,v_pos_recheck,v_pos_lane,v_pos_opkey;
  end if;
  -- The budget/concurrency-cap refusal branches (O-round confirmation finding 2) must
  -- ALSO precede the real reservation call and return their outcome directly, never via
  -- _finish_op — the slice check just below already covers this: it now spans from the
  -- lane check through the real clara._reserve_op(...) call (per the anchor fix above),
  -- which includes both budget branches in between.
  -- The not-ready branch must return directly (no _finish_op call in its body slice) —
  -- the old cached-refusal shape (a _finish_op call between the lane check and the
  -- op-key assignment) must be verifiably absent.
  if substring(v_admit_src from v_pos_lane for v_pos_opkey-v_pos_lane) like '%_finish_op%' then
    raise exception '0031 tail: the not-ready lane branch still settles an op-key receipt — the stale-cache defect is not fixed';
  end if;

  -- (3) §B: the near_duplicate amount limb's invoice_id + sha256 discriminator is
  -- present, and the invoice_date limb's own predicate is untouched.
  select pg_get_functiondef('clara._coding_lane_core(uuid,uuid)'::regprocedure)
    into v_lane_src;
  if v_lane_src not like '%v_invoice_id:=nullif(v_state->>''invoice_id'','''')%'
     or v_lane_src not like '%and not (%'
     or v_lane_src not like '%and ed.sha256<>f.sha256%'
     or v_lane_src not like '%v_invoice_date is not null and%'
     or v_lane_src not like
       '%clara._invoice_fact_state(e.document_id)->>''invoice_date''=v_invoice_date%' then
    raise exception '0031 tail: near_duplicate does not carry the invoice_id/sha256 discriminator, or the invoice_date limb drifted';
  end if;

  raise notice '0031 tail: admission (admit_autodraft_task) now agrees with the read verb (coding_lane) by construction — a not-ready lane is never cached; near_duplicate''s amount limb is discriminated by invoice_id+sha256, invoice_date untouched';
end
$tail$;
