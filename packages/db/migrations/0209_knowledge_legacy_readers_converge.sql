-- 0209_knowledge_legacy_readers_converge — #784: THE LEGACY CLIENT-KNOWLEDGE FACTS ARE READ
-- THROUGH ONE EXPRESSION BY EVERY CONSUMER.
-- =====================================================================================
-- Spec of record: issue #784 — "Four legacy readers still read client_facts directly instead of
-- the unified knowledge pack". Domain words: CONTEXT.md — "Client Knowledge", "Client fact".
-- Builds on 0192 (#644 fix round 2), which put the legacy union in ONE place —
-- `clara._knowledge_legacy_rows(p_firm, p_client)` — and routed BOTH the human register
-- (`clara.list_client_knowledge`) and the runtime pack (`clara.get_knowledge_pack`) through it.
--
-- WHAT THIS FILE DOES, IN ONE SENTENCE. Three of the four surviving direct reads of
-- `clara.client_facts` are repointed at that same expression, so the estate's answer and the
-- register's answer to "what is this client's live legacy fact" are produced by ONE piece of SQL
-- instead of five hand-written copies; the fourth — the per-row counterparty write-path trigger —
-- is DELIBERATELY left on its direct index probe, for the measured reason §D records.
--
-- =====================================================================================
-- THE MEASUREMENT THAT SHAPES THIS FILE.
--
-- 0192 added a register BESIDE `clara.client_facts` and seeds ZERO knowledge records, so for all
-- five carried keys the legacy row is still the value the estate ACTS ON.
-- `clara._knowledge_legacy_rows` never consults `clara.knowledge_records` and stamps every
-- legacy row `authoritative: true`, so the no-shadow rule is preserved BY CONSTRUCTION: nothing
-- below can make a knowledge-record write change what any of the four sites observes. That is a
-- property of the expression, not of this file's care, and it is the reason the repoint is safe.
--
-- WHY THE REPOINT TARGET IS THE EXPRESSION AND NOT A DOOR. `clara.get_knowledge_pack` is
-- `clara_runtime`-only by grant and refuses CLR03 to any session that is neither an identified
-- human at the viewer floor nor the runtime role; `clara.list_client_knowledge` is
-- `clara_authenticated`-only and names no firm. `clara.get_context_pack` is granted to
-- `clara_authenticated` and `clara_agent_ro`, and the counterparty guard fires on ordinary
-- writes. Routing these sites through either door would change who can read what. All four sites
-- are `clara_fn_owner`-owned SECURITY DEFINER bodies, and `clara._knowledge_legacy_rows` is a
-- PUBLIC-revoked function of the SAME owner — so calling it from inside them needs no grant, and
-- this file adds none.
--
-- THE FIRM ARGUMENT IS THE CLIENT'S OWN, NEVER A SESSION FIRM. `clara._knowledge_legacy_rows`
-- filters `firm_id` as well as `client_id`; the three reads being replaced filtered on
-- `client_id` alone. Passing the CLIENT'S firm (looked up from `clara.clients`) is what makes
-- the two identical rather than merely similar — and it is exactly identical, not approximately:
-- `clara.client_facts` carries `fk_client_facts_client FOREIGN KEY (client_id, firm_id)
-- REFERENCES clara.clients(id, firm_id)`, so a fact's firm IS its client's firm by constraint.
-- Adding the filter can therefore remove no row. Passing a SESSION firm instead would have
-- changed the meaning (a cross-firm read would go silently empty rather than refusing), which is
-- why no site below does that.
--
-- =====================================================================================
-- WHAT IS NOT HERE. No dual-write back into `clara.client_facts`; no shadowing of a legacy fact
-- behind a knowledge record; no retirement of `clara.client_facts` or `clara.record_client_fact`
-- (which still resolves at its exact 0055 signature and stays the ONLY door a legacy fact changes
-- through); no change to which keys are legacy-carried; no grant or lane moved on
-- `clara.get_knowledge_pack`, `clara.list_client_knowledge` or `clara.get_context_pack`; and no
-- reader outside the four #784 names is touched. `p_purpose` still does not filter the pack.
-- =====================================================================================

do $w784_pre$
declare v_sha text; v_src text;
begin
  -- THE EXPRESSION THIS FILE REPOINTS ONTO. Absent = 0192 did not apply and every recut below
  -- would be a dangling call; DRIFTED = the union gained or lost a field since the three recuts
  -- were derived against it, and "one expression" would no longer mean what the tail asserts.
  if to_regprocedure('clara._knowledge_legacy_rows(uuid,uuid)') is null then
    raise exception '#784 prestate: clara._knowledge_legacy_rows is absent -- 0192 must apply first'
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara._knowledge_legacy_rows(uuid,uuid)'::regprocedure;
  if v_sha <> '65f4f0f3db1ab64cfa2e4ef55cc850fa9f2176009ac5271c57030e18706ff35a' then
    raise exception '#784 prestate: clara._knowledge_legacy_rows has DRIFTED from the pinned 0192 body (sha %) -- re-derive the three recuts against the live union before applying', v_sha
      using errcode='CLR10';
  end if;

  -- THE THREE BODIES THIS FILE RECUTS, PINNED. Each recut below is the pinned text with exactly
  -- one read swapped: a recut derived from a body that has since drifted would delete an arm
  -- nobody re-derived. The pins are the live 0055 / 0194 / 0121 texts as measured on a
  -- from-scratch 0001->0198 chain.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara.get_context_pack(uuid,text)'::regprocedure;
  if v_sha <> '614d2584a0e637e6e751b448399b9b784295ed6aa1d3f3725f503ef933daff5e' then
    raise exception '#784 prestate: clara.get_context_pack has DRIFTED from the pinned 0055 body (sha %)', v_sha
      using errcode='CLR10';
  end if;
  -- 0194 (#643) recut this gate, so 0194's text is the LIVE one and the one pinned here -- NOT
  -- 0056's. #784's disposition allowed the recut only if it needed no existing sha-pin to move:
  -- 0194's own pin is of the 0056 body it replaced and is already discharged, and no migration
  -- after 0194 pins this body, so a successor pins 0194's live text and recuts. Nothing moves.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara._close_gate_closing_stock(uuid,uuid)'::regprocedure;
  if v_sha <> 'f221da9f04dda021ee12fd6edc1474af57846e9d2fe51e9b0fba2932b6fbbba0' then
    raise exception '#784 prestate: clara._close_gate_closing_stock has DRIFTED from the pinned 0194 body (sha %)', v_sha
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara._bank_registry_ledger_state(uuid,date)'::regprocedure;
  if v_sha <> 'bf4329824caed3aa5ada0f02c17d6015db0dcd669ff4754fd5c6d22efee0e8af' then
    raise exception '#784 prestate: clara._bank_registry_ledger_state has DRIFTED from the pinned 0121 body (sha %)', v_sha
      using errcode='CLR10';
  end if;

  -- THE FOURTH SITE, PINNED BUT NOT RECUT. §D leaves the counterparty name-only guard on its
  -- direct `uq_client_fact_live` probe for a MEASURED reason, and a justification recorded in
  -- ARCHITECTURE against a body that has since changed would be a claim about a text nobody
  -- checked. Pinning it here is what makes "deliberately unchanged" auditable rather than
  -- indistinguishable from "forgotten".
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara._tf_counterparty_name_only_guard()'::regprocedure;
  if v_sha <> '8825097ed0f87371e433280b5bad1832134c24654d20260c21ca5e63c1e07586' then
    raise exception '#784 prestate: clara._tf_counterparty_name_only_guard has DRIFTED from the pinned 0062 body (sha %) -- re-measure before re-asserting the write-path justification', v_sha
      using errcode='CLR10';
  end if;

  -- The legacy table is byte-untouched by this file and must still be the one the facts live in.
  select p.prosrc into v_src from pg_proc p
   where p.oid='clara._knowledge_legacy_rows(uuid,uuid)'::regprocedure;
  if position('clara.client_facts' in v_src) = 0 then
    raise exception '#784 prestate: the union expression no longer reads clara.client_facts -- the repoint would change what every site observes'
      using errcode='CLR10';
  end if;
  if position('knowledge_records' in v_src) <> 0 then
    raise exception '#784 prestate: the union expression now consults clara.knowledge_records -- the no-shadow rule is no longer structural and the repoint would let a knowledge write move a legacy answer'
      using errcode='CLR10';
  end if;

  raise notice '#784 prestate: clean -- clara._knowledge_legacy_rows is at its pinned 0192 text, reads clara.client_facts, consults no knowledge record; the three bodies to recut are at their pinned 0055/0194/0121 texts and the fourth (the write-path guard, deliberately unchanged) at its pinned 0062 text.';
end
$w784_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §A  clara.get_context_pack — RECUT. The 0055 body verbatim, with the TWO `clara.client_facts`
-- literals in the 'client' object (entity_type, msic) replaced by the shared expression. The
-- committed-onboarding-answer FALLBACK behind each `coalesce` is untouched: the legacy fact
-- still wins when it exists, and the plan answer still answers when it does not.
--
-- `cl.firm_id` is the CLIENT'S own firm (the outer select is `from clara.clients cl where
-- cl.id=p_client and cl.firm_id=v_firm`, so the row is already the caller's-firm client), which
-- is what keeps the added firm filter a no-op on the rows and a real binding on the expression.
-- =====================================================================================
create or replace function clara.get_context_pack(p_client uuid, p_purpose text) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $w784_ctx$
declare w record; c record; v_firm uuid;
begin
  if p_client is null or p_purpose is null or btrim(p_purpose)='' then
    raise exception 'a client and context-pack purpose are required' using errcode='CLR10';
  end if;
  -- ADR-015: inside SECURITY DEFINER the caller's SET ROLE is invisible
  -- (current_role = the owner), so the wake-secret GUC's PRESENCE is the agent
  -- lane's structural marker. A human PostgREST caller CAN set clara.wake_secret,
  -- but that is not a bypass: a garbage/forged value makes wake_context() return
  -- no row → CLR03 refusal (never data); a valid secret is exactly an authorized
  -- agent credential. The security boundary is wake_context()'s hash+liveness
  -- check, NOT the GUC being unreachable. (Runtime pools SET LOCAL it per request.)
  if coalesce(current_setting('clara.wake_secret',true),'')<>'' then
    select * into w from clara.wake_context();
    if w.credential_id is null then
      raise exception 'no valid agent read context' using errcode='CLR03';
    end if;
    if w.wake_kind not in ('interactive','proactive') then
      perform clara.assert_wake_allowed(w.wake_kind,'get_context_pack');
    end if;
    if w.client_id is not null and p_client<>w.client_id then return null; end if;
    v_firm:=w.firm_id;
  else
    c:=clara._human_ctx(clara.role_rank('viewer')); v_firm:=c.firm;
  end if;
  return (
    select jsonb_build_object(
      'pack_schema_version',5,'purpose',p_purpose,'generated_at',now(),
      'books_version',(select coalesce(max(de.seq),0) from clara.domain_events de
        where de.firm_id=cl.firm_id),
      'period_snapshot_registry',clara._period_snapshot_registry_pack_v1(cl.id),
      'client',jsonb_build_object('id',cl.id,'name',cl.name,'status',cl.status,'entity_type',coalesce((select (kr->'value') #>> '{}' from jsonb_array_elements(clara._knowledge_legacy_rows(cl.firm_id, cl.id)) kr where kr->>'knowledge_key'='entity_type'),(select i.answer #>> '{}' from clara.onboarding_plans p2 join clara.onboarding_plan_items i on i.plan_id=p2.id where p2.client_id=cl.id and p2.scope_kind='client' and p2.state='committed' and i.item_key='entity_type' and i.state in ('answered','resolved') order by p2.committed_at desc, i.answered_at desc limit 1)),'msic',coalesce((select (kr->'value') #>> '{}' from jsonb_array_elements(clara._knowledge_legacy_rows(cl.firm_id, cl.id)) kr where kr->>'knowledge_key'='msic'),(select i.answer #>> '{}' from clara.onboarding_plans p2 join clara.onboarding_plan_items i on i.plan_id=p2.id where p2.client_id=cl.id and p2.scope_kind='client' and p2.state='committed' and i.item_key='msic' and i.state in ('answered','resolved') order by p2.committed_at desc, i.answered_at desc limit 1))),
      'firm',(select jsonb_build_object('id',f.id,'name',f.name,
        'high_stakes_amount_cents',f.high_stakes_amount_cents)
        from clara.firms f where f.id=cl.firm_id),
      'coa',(select coalesce(jsonb_agg(jsonb_build_object('account_code',a.account_code,
        'name',a.name,'account_type',a.account_type,'special_acc_type',a.special_acc_type,
        'is_active',a.is_active) order by a.account_code),'[]'::jsonb)
        from clara.coa_accounts a where a.client_id=cl.id),
      'trial_balance',(select coalesce(jsonb_agg(to_jsonb(tb) order by tb.account_code),
        '[]'::jsonb) from clara.trial_balance(cl.id) tb),
      'recent_entries',(select coalesce(jsonb_agg(jsonb_build_object('entry',to_jsonb(je),
        'lines',(select coalesce(jsonb_agg(to_jsonb(jl) order by jl.line_no),'[]'::jsonb)
          from clara.journal_lines jl where jl.entry_id=je.id))
          order by je.posting_date desc,je.created_at desc),'[]'::jsonb)
        from (select * from clara.journal_entries where client_id=cl.id
          and status<>'withdrawn' order by posting_date desc,created_at desc limit 50) je),
      'documents',(select coalesce(jsonb_agg(jsonb_build_object('id',d.id,
        'sha256',d.sha256,'original_filename',d.original_filename,'mime_type',d.mime_type,
        'byte_size',d.byte_size,'status',d.status,'bytes_verified_at',d.bytes_verified_at,
        'page_count',d.page_count,'extraction_status',d.extraction_status,
        'document_kind',d.document_kind,'financial_date',d.financial_date,
        'retention_state',d.retention_state,'retain_until',d.retain_until,
        'legal_hold',d.legal_hold,'created_at',d.created_at,'filing_id',df.id,
        'filed_at',df.filed_at,'filing_basis',df.basis) order by df.filed_at desc),'[]'::jsonb)
        from clara.document_filings df join clara.documents d on d.id=df.document_id
        where df.client_id=cl.id and df.retired_at is null),
      'resolutions',(select coalesce(jsonb_agg((to_jsonb(r)-'bound_scope_kind'-'bound_scope_id') order by r.created_at desc),
        '[]'::jsonb) from clara.client_resolutions r
        where r.client_id=cl.id and r.superseded_at is null),
      'approval_history',(select coalesce(jsonb_agg(jsonb_build_object('entry_id',je.id,
        'status',je.status,'approved_at',je.approved_at,'checker_actor',je.checker_actor,
        'maker_actor',je.maker_actor,'reversal_of',je.reversal_of,
        'reversed_by',je.reversed_by) order by je.approved_at desc),'[]'::jsonb)
        from (select * from clara.journal_entries where client_id=cl.id
          and approved_at is not null order by approved_at desc limit 25) je),
      'approved_coding_patterns',(
        -- F-A2 PR-1b (design v6 §3.6, annex D.4, register D16). RECOMPUTED ON READ, NEVER
        -- ACCRUED: derived from the BOOKS on every call, so it cannot become a second copy of
        -- the truth that drifts from them. The frozen corpus the retired rules machine accrued
        -- is KEPT AS DATA and is deliberately NOT read here -- reading both would mean learning
        -- twice from the same events. INFORMS, NEVER DECIDES (law 73): no gate, bound or floor
        -- may read this block, and `WB_AUTHORITY_FNS` is the mechanism that proves it.
        -- The counterparty is the ENTRY's, read off its payable-class line (0011:3057) by the
        -- 0011:3794 idiom and folded through the canonical resolver so a post-approval merge
        -- follows its survivor. Reversal entries are excluded: a reversal is not a coding
        -- decision, and its flipped legs would teach the reader the opposite of the firm's own.
        -- Capped at 200 rows under a TOTAL ordering, so the cap is deterministic.
        select coalesce(jsonb_agg(jsonb_build_object(
          'counterparty_id',t.counterparty_id,'coding_kind',t.coding_kind,
          'account_code',t.account_code,'side',t.side,'n',t.n,
          'first_seen',t.first_seen,'last_seen',t.last_seen)
          order by t.n desc,t.last_seen desc,t.counterparty_id,t.coding_kind,
            t.account_code,t.side),'[]'::jsonb)
        from (select g.counterparty_id,g.coding_kind,g.account_code,g.side,
                count(distinct g.entry_id)::int as n,
                min(g.approved_at) as first_seen,max(g.approved_at) as last_seen
              from (select pe.cp_id as counterparty_id,pe.coding_kind,pl.account_code,
                      case when pl.debit_cents>0 then 'debit' else 'credit' end as side,
                      pe.id as entry_id,pe.approved_at
                    from (select je.id,je.coding_kind,je.approved_at,
                            clara._canonical_counterparty(je.client_id,
                              (select l2.counterparty_id from clara.journal_lines l2
                                where l2.entry_id=je.id and l2.counterparty_id is not null
                                order by l2.line_no limit 1)) as cp_id
                          from clara.journal_entries je
                          where je.client_id=cl.id and je.status='approved'
                            and je.reversed_by is null and je.reversal_of is null
                            and je.approved_at is not null) pe
                    join clara.journal_lines pl on pl.entry_id=pe.id
                    where pe.cp_id is not null
                      and (pl.debit_cents>0 or pl.credit_cents>0)) g
              group by g.counterparty_id,g.coding_kind,g.account_code,g.side
              order by n desc,last_seen desc,g.counterparty_id,g.coding_kind,
                g.account_code,g.side
              limit 200) t),
      'sst_registration_watch',(select coalesce(jsonb_agg(jsonb_build_object(
        'watch_id',cw.id,'service_group',cw.service_group,'status',cw.state,
        'confirmed_included_cents',cw.confirmed_included_cents,
        'unknown_or_mixed_cents',cw.unknown_or_mixed_cents,
        'screening_proxy_cents',cw.screening_proxy_cents,
        'window_start',cw.window_start,'window_end',cw.window_end,
        'earliest_crossing_month',cw.earliest_crossing_month,
        'application_due',cw.application_due,
        'future_method_status',cw.future_method_status,
        'coverage_complete',cw.coverage_complete,
        'provisional_month',cw.provisional_month,
        'provisional_included_cents',cw.provisional_included_cents,
        'provisional_crossed',cw.provisional_crossed,
        'acknowledged_at',cw.acknowledged_at,'snoozed_until',cw.snoozed_until,
        'evaluated_at',cw.evaluated_at,
        'basis','db_computed_screening_estimate',
        'permitted_use','surface_and_request_professional_review_only')
        order by cw.service_group),'[]'::jsonb)
        from clara.compliance_watches cw
        where cw.client_id=cl.id and cw.state<>'resolved')
    ) || case when
      p_purpose='wiki_coding'
      and (coalesce(current_setting('clara.wake_secret',true),'')=''
        or current_setting('clara.pack_consumer',true)='v25')
    then jsonb_build_object('wiki',jsonb_build_object(
      'last_projected_seq',coalesce((select rc.last_seq
        from clara.relay_checkpoints rc
        where rc.firm_id=v_firm and rc.consumer='wiki_projection'),0),
      'held',exists(select 1 from clara.wiki_synthesis_holds wh
        where wh.client_id=cl.id),
      'budget',jsonb_build_object(
        'pages',(select wb.value_int from clara.wiki_budgets wb
          where wb.budget_key='pack_max_pages'),
        'bytes',(select wb.value_int from clara.wiki_budgets wb
          where wb.budget_key='pack_max_bytes')),
      'pages',(
        with cfg as (
          select
            max(value_int) filter(where budget_key='pack_max_pages') page_cap,
            max(value_int) filter(where budget_key='pack_max_bytes') byte_cap
          from clara.wiki_budgets
        ), candidates as (
          select wp.slug,wp.title,wp.page_kind,wv.id version_id,
            wv.version_n,wp.updated_at,wv.content,
            octet_length(convert_to(wv.content,'UTF8')) content_bytes,
            case wp.page_kind
              when 'profile' then 1 when 'period_context' then 2
              when 'treatment' then 3 when 'recurring_pattern' then 4
              when 'counterparty' then 5 else 6 end priority
          from clara.wiki_pages wp
          join clara.wiki_page_versions wv on wv.id=wp.current_version_id
          where wp.client_id=cl.id and wp.state='active'
        ), ranked as (
          select x.*,
            row_number() over(order by priority,updated_at desc,slug) ord,
            sum(content_bytes) over(order by priority,updated_at desc,slug
              rows between unbounded preceding and current row) running_bytes
          from candidates x
        )
        select coalesce(jsonb_agg(jsonb_build_object(
          'slug',r.slug,'title',r.title,'page_kind',r.page_kind,
          'version_n',r.version_n,'updated_at',r.updated_at,
          'citations',coalesce((select jsonb_agg(jsonb_build_object(
              'source_kind',wc.source_kind,'document_id',wc.document_id,
              'entry_id',wc.entry_id,'counterparty_id',wc.counterparty_id,
              'detail',wc.detail,'stale_at',wc.stale_at,
              'stale_reason',wc.stale_reason)
              order by wc.created_at,wc.id)
            from clara.wiki_page_citations wc
            where wc.version_id=r.version_id),'[]'::jsonb),
          'has_stale_sources',(exists(select 1 from clara.wiki_page_citations sc
              where sc.version_id=r.version_id and sc.stale_at is not null)
            or exists(select 1 from clara.wiki_page_refs sr
              where sr.ref_kind='document' and sr.stale_at is not null
                and sr.page_id=(select sv.page_id from clara.wiki_page_versions sv
                  where sv.id=r.version_id))),
          'content',r.content) order by r.ord),'[]'::jsonb)
        from ranked r cross join cfg
        where r.ord<=cfg.page_cap and r.running_bytes<=cfg.byte_cap
      ),
      'basis','clara_maintained_advisory_notes',
      'permitted_use','inform_never_decide'))
    else '{}'::jsonb end
    from clara.clients cl where cl.id=p_client and cl.firm_id=v_firm
  );
end $w784_ctx$;

-- =====================================================================================
-- §B  clara._close_gate_closing_stock — RECUT. 0194's body verbatim, with the `trade_nature`
-- read replaced. This gate is handed (client, fiscal_year) and never sees a session firm, so it
-- looks the client's own firm up. An unknown client leaves the firm null, the expression returns
-- '[]' and the gate answers `trade_nature_fact_absent` exactly as before — the same refusal,
-- reached the same way, with no new existence oracle.
--
-- The `measured_digest` an attestation binds to is an md5 of this gate's ANSWER, and the answer
-- is byte-identical for every world: same keys, same values, same order. No attestation moves.
-- =====================================================================================
create or replace function clara._close_gate_closing_stock(p_client uuid, p_fy uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $w784_gate$
declare
  v_fy record; v_nature text; v_present boolean; v_marker record; v_firm uuid;
begin
  select * into v_fy from clara.fiscal_years fy where fy.id = p_fy;
  -- #784 · ONE EXPRESSION. The firm is the CLIENT'S OWN, looked up here (this gate is handed a
  -- client and a fiscal year and never sees a session firm). An unknown client leaves v_firm
  -- null, clara._knowledge_legacy_rows returns '[]' and v_nature stays null -- the same
  -- 'trade_nature_fact_absent' answer 0056/0194 gave, reached the same way.
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  v_nature := (select (kr->'value') #>> '{}' from jsonb_array_elements(clara._knowledge_legacy_rows(v_firm, p_client)) kr where kr->>'knowledge_key'='trade_nature');
  if v_nature is null then
    return jsonb_build_object('state', 'unknown', 'reason', 'trade_nature_fact_absent');
  end if;
  if v_nature = 'services' then
    return jsonb_build_object('state', 'pass', 'reason', 'not_goods_trading',
      'trade_nature', v_nature);
  end if;
  -- THE v1 MARKER CONTRACT, stated: the WD-R11 closing-stock entry carries
  -- flags ? 'closing_stock' (the Section-B fixture and #643's producer verb both write it).
  -- A goods-trader with no such approved entry dated in the FY fails this gate.
  -- LIVE entries only (Codex R1 MAJOR 3): a reversed original keeps status='approved'
  -- with reversed_by set, and its mirror carries reversal_of -- neither is a standing
  -- closing-stock declaration.
  --
  -- #643 · ONE ROW RATHER THAN A BARE `exists`, so the answer can NAME what it found. The order
  -- is total and deterministic (posting_date, then id), because `measured_digest` is an md5 of
  -- this object and a non-deterministic pick would make an unchanged world look changed on every
  -- re-measure. The left join is what keeps a bare fixture marker passing: a marker with no
  -- `clara.periodic_adjustments` row still satisfies the gate and simply names nothing.
  select je.id as entry_id, je.posting_date, pa.id as adjustment_id, pa.work_id,
         pa.period_start, pa.period_end, pa.amount_cents
    into v_marker
    from clara.journal_entries je
    left join clara.periodic_adjustments pa
      on pa.entry_id = je.id and pa.purpose = 'periodic_stock_adjustment'
   where je.client_id = p_client and je.status = 'approved'
     and je.reversed_by is null and je.reversal_of is null
     and je.posting_date between v_fy.starts_on and v_fy.ends_on
     and je.flags ? 'closing_stock'
   order by je.posting_date, je.id
   limit 1;
  v_present := v_marker.entry_id is not null;
  return jsonb_build_object(
    'state', case when v_present then 'pass' else 'fail' end,
    'trade_nature', v_nature, 'closing_stock_entry_present', v_present,
    -- #643 · THE PRODUCER, NAMED. The missing-instrument confession 0056 carried here is GONE
    -- (its key is deliberately not spelled anywhere in this body, so the tail census can prove
    -- its absence by a textual probe rather than by trusting this comment): the instrument exists
    -- (clara.admit_periodic_adjustment_work -> clara._record_journal_entry_core ->
    -- clara.periodic_adjustments), so an attestation against this gate is once again a judgement
    -- about STOCK rather than an acceptance of a missing verb. A marker with no adjustment row
    -- (a pre-#643 entry, or a fixture) reports the entry and null for the rest.
    'closing_stock_entry_id', v_marker.entry_id,
    -- …AND WHEN. `je.posting_date` was selected into `v_marker` and never emitted (adversarial
    -- migration-safety review, N2). Emitted rather than dropped: it is the one fact about the
    -- marker a close reviewer reads without opening anything — WHICH day inside the year the
    -- stock was declared — it is already the first ORDER BY key, and it costs no extra read. A
    -- marker with no adjustment row (a pre-#643 entry, or a fixture) still has one.
    'closing_stock_posted_on', v_marker.posting_date,
    'closing_stock_adjustment_id', v_marker.adjustment_id,
    'closing_stock_work_id', v_marker.work_id,
    'closing_stock_period_start', v_marker.period_start,
    'closing_stock_period_end', v_marker.period_end,
    'closing_stock_amount_cents', v_marker.amount_cents,
    'fy_starts_on', v_fy.starts_on, 'fy_ends_on', v_fy.ends_on);
end $w784_gate$;

-- =====================================================================================
-- §C  clara._bank_registry_ledger_state — RECUT. 0121's body verbatim, with the
-- `banking_arrangement` read of the zero-registry arm replaced. This body ALREADY resolves the
-- client's own firm at its top (and answers `client_unknown` when it cannot), so the expression
-- gets that firm and the lookup is not repeated. Law 68 is untouched: the declared fact is still
-- READ, never inferred from the absence of registered accounts, and an absent declaration still
-- answers `bank_registry_undeclared` rather than `clear`.
-- =====================================================================================
create or replace function clara._bank_registry_ledger_state(p_client uuid, p_as_of date) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $w784_bank$
declare
  v_firm uuid;
  v_registry_n int;
  v_gap_accounts jsonb;
  v_declared text;
begin
  select firm_id into v_firm from clara.clients where id = p_client;
  if v_firm is null then
    return jsonb_build_object('state','not_evaluable','accounts','[]'::jsonb,
      'basis','bank_registry_ledger_v1','reason','client_unknown');
  end if;

  -- Arm (a): a flagged COA account with no ACTIVE binding row. Checked FIRST and
  -- unconditionally (independent of the registry's row count) — a client with SOME registered
  -- accounts but one deactivated/remapped-away flag is still a gap, regardless of arm (b).
  select coalesce(jsonb_agg(jsonb_build_object('account_code', a.account_code)
           order by a.account_code), '[]'::jsonb)
    into v_gap_accounts
    from clara.coa_accounts a
    where a.client_id = p_client and a.is_bank_account
      and not exists (select 1 from clara.bank_accounts ba
                       where ba.client_id = p_client and ba.coa_account_code = a.account_code
                         and ba.active);
  if jsonb_array_length(v_gap_accounts) > 0 then
    return jsonb_build_object('state','gap','accounts',v_gap_accounts,
      'basis','bank_registry_ledger_v1','reason','deactivated_or_remapped_account');
  end if;

  select count(*)::int into v_registry_n from clara.bank_accounts ba where ba.client_id = p_client;

  if v_registry_n = 0 then
    -- Arm (b): the zero-registry case. Read the DECLARED fact — never inferred from the
    -- absence of registered accounts (law 68: absence is not evidence).
    -- #784 · ONE EXPRESSION. v_firm is already the client's own firm (resolved at the top of
    -- this body, which answers 'client_unknown' when it cannot), so this read is the same row
    -- the register and the pack emit.
    v_declared := (select (kr->'value') #>> '{}' from jsonb_array_elements(clara._knowledge_legacy_rows(v_firm, p_client)) kr where kr->>'knowledge_key'='banking_arrangement');
    if v_declared = 'no_accounts' then
      return jsonb_build_object('state','clear','accounts','[]'::jsonb,
        'basis','bank_registry_ledger_v1','reason','declared_no_accounts');
    elsif v_declared = 'has_accounts' then
      return jsonb_build_object('state','gap','accounts','[]'::jsonb,
        'basis','bank_registry_ledger_v1','reason','bank_registry_contradicted');
    else
      return jsonb_build_object('state','not_evaluable','accounts','[]'::jsonb,
        'basis','bank_registry_ledger_v1','reason','bank_registry_undeclared');
    end if;
  end if;

  -- Arm (c) implicitly: at least one registered account, none deactivated-and-unbound. Clear.
  return jsonb_build_object('state','clear','accounts','[]'::jsonb,'basis','bank_registry_ledger_v1');
end $w784_bank$;

reset role;

-- =====================================================================================
-- §D  THE FOURTH SITE, AND WHY IT IS NOT RECUT.
--
-- `clara._tf_counterparty_name_only_guard()` is a per-row BEFORE trigger on counterparty writes.
-- Its `customer_identity_policy` read is an `exists` probe that rides `uq_client_fact_live`
-- (client_id, fact_key) WHERE superseded_at is null: one index probe, on the rare path where a
-- customer identifier is actually being written.
--
-- MEASURED, not assumed (EXPLAIN ANALYZE on a seeded client carrying all five live facts,
-- PostgreSQL 17.6, 2026-09-15): the direct probe is an Index Scan on `uq_client_fact_live`,
-- 0.011 ms execution. The same answer through `clara._knowledge_legacy_rows` is a Function Scan
-- over the jsonb aggregate — which builds EVERY live fact of the client into a jsonb object,
-- with a `clara.users` and a `clara.knowledge_keys` join per fact, then filters four of the
-- five rows away — at 2.027 ms. That is ~180x, two orders of magnitude apart, on the SMALLEST
-- possible client. #784's own acceptance names this exact trade ("a per-row write-path trigger
-- trading one index probe for a full per-client jsonb aggregate is an acceptable reason to keep
-- the direct read, provided ARCHITECTURE says so"), and the orchestrator's default for this site
-- was the same. ARCHITECTURE §5.A now says so.
--
-- THE CONVERGENCE CLAIM IS STILL TRUE FOR IT, and this file does not weaken it: the guard's
-- direct probe and the shared expression read the SAME rows of the SAME table under the SAME
-- live predicate, and the battery this file ships proves that equality for
-- `customer_identity_policy` against the register and the pack like the other four keys. What
-- the guard does not share is the EXPRESSION, and this block is the record of why.
-- =====================================================================================

-- =====================================================================================
-- §E  TAIL — the boundary re-measured. Owner, SECURITY DEFINER, pinned search_path and the exact
-- ACL for each of the four sites, plus a textual census of what each body now reads. The census
-- is the part that cannot be faked by a comment: it asks pg_proc, not this file.
-- =====================================================================================
do $w784_tail$
declare
  v_src text; v_n int; r record;
begin
  -- E.1 — the three recut bodies name the expression and no longer name the table.
  for r in select * from (values
      ('clara.get_context_pack(uuid,text)'),
      ('clara._close_gate_closing_stock(uuid,uuid)'),
      ('clara._bank_registry_ledger_state(uuid,date)')) as t(sig)
  loop
    select p.prosrc into v_src from pg_proc p where p.oid = r.sig::regprocedure;
    if position('clara.client_facts' in v_src) <> 0 then
      raise exception '#784 tail: % still reads clara.client_facts directly', r.sig using errcode='CLR10';
    end if;
    if position('clara._knowledge_legacy_rows' in v_src) = 0 then
      raise exception '#784 tail: % does not call clara._knowledge_legacy_rows', r.sig using errcode='CLR10';
    end if;
  end loop;

  -- E.2 — and the fourth still does, deliberately (§D). A silent later repoint of this body
  -- would leave ARCHITECTURE asserting a write-path cost nobody is paying any more.
  select p.prosrc into v_src from pg_proc p
   where p.oid='clara._tf_counterparty_name_only_guard()'::regprocedure;
  if position('clara.client_facts' in v_src) = 0 then
    raise exception '#784 tail: the name-only guard no longer reads clara.client_facts -- §D and ARCHITECTURE record a direct read that is gone'
      using errcode='CLR10';
  end if;
  if position('uq_client_fact_live' in v_src) = 0 then
    raise exception '#784 tail: the name-only guard no longer names uq_client_fact_live -- the index the justification is about'
      using errcode='CLR10';
  end if;

  -- E.3 — NO site passes a session firm. The three recuts derive the firm from clara.clients
  -- (two by an explicit lookup, get_context_pack from the client row it already selects), and a
  -- jwt/session firm reaching the expression would silently change what a cross-firm read means.
  for r in select * from (values
      ('clara._close_gate_closing_stock(uuid,uuid)'),
      ('clara._bank_registry_ledger_state(uuid,date)')) as t(sig)
  loop
    select p.prosrc into v_src from pg_proc p where p.oid = r.sig::regprocedure;
    if position('clara.clients' in v_src) = 0 then
      raise exception '#784 tail: % does not look its client''''s firm up from clara.clients', r.sig
        using errcode='CLR10';
    end if;
  end loop;
  select p.prosrc into v_src from pg_proc p
   where p.oid='clara.get_context_pack(uuid,text)'::regprocedure;
  if position('clara._knowledge_legacy_rows(cl.firm_id, cl.id)' in v_src) = 0 then
    raise exception '#784 tail: get_context_pack does not pass the client row''''s own firm to the expression'
      using errcode='CLR10';
  end if;

  -- E.4 — the boundary, per site: owner, SECURITY DEFINER, pinned search_path, exact ACL.
  -- The ACLs are the CARRIED ones (create or replace preserves them and this file grants
  -- nothing): three fn_owner-only internals, and get_context_pack on its 0055/0017 grants.
  for r in select * from (values
      ('clara.get_context_pack(uuid,text)',
       'clara_fn_owner=X/clara_fn_owner|clara_authenticated=X/clara_fn_owner|clara_agent_ro=X/clara_fn_owner'),
      ('clara._close_gate_closing_stock(uuid,uuid)', 'clara_fn_owner=X/clara_fn_owner'),
      ('clara._bank_registry_ledger_state(uuid,date)', 'clara_fn_owner=X/clara_fn_owner'),
      ('clara._tf_counterparty_name_only_guard()', 'clara_fn_owner=X/clara_fn_owner'),
      ('clara._knowledge_legacy_rows(uuid,uuid)', 'clara_fn_owner=X/clara_fn_owner')) as t(sig, acl)
  loop
    perform 1 from pg_proc p where p.oid = r.sig::regprocedure
      and pg_get_userbyid(p.proowner) = 'clara_fn_owner'
      and p.prosecdef
      and p.proconfig @> array['search_path=clara, pg_temp']
      and array_to_string(coalesce(p.proacl, '{}'::aclitem[]), '|') = r.acl;
    if not found then
      raise exception '#784 tail: % is not a clara_fn_owner-owned SECURITY DEFINER with search_path=clara, pg_temp and ACL %  (actual: owner=%, secdef=%, config=%, acl=%)',
        r.sig, r.acl,
        (select pg_get_userbyid(p.proowner) from pg_proc p where p.oid=r.sig::regprocedure),
        (select p.prosecdef from pg_proc p where p.oid=r.sig::regprocedure),
        (select array_to_string(p.proconfig,'|') from pg_proc p where p.oid=r.sig::regprocedure),
        (select array_to_string(coalesce(p.proacl,'{}'::aclitem[]),'|') from pg_proc p where p.oid=r.sig::regprocedure)
        using errcode='CLR10';
    end if;
  end loop;

  -- E.5 — the legacy door and its table are untouched. record_client_fact still resolves at its
  -- exact 0055 signature (the ONLY way a legacy fact changes), clara.client_facts still carries
  -- the live-row unique index the guard probes and the (client_id, firm_id) congruence FK the
  -- header's "adding the firm filter removes no row" argument rests on, and no site
  -- this file touches can see a knowledge record at all.
  if to_regprocedure('clara.record_client_fact(uuid,text,jsonb,text,text,uuid,text)') is null then
    raise exception '#784 tail: clara.record_client_fact no longer resolves at its 0055 signature'
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_constraint
   where conrelid='clara.client_facts'::regclass and conname='fk_client_facts_client';
  if v_n <> 1 then
    raise exception '#784 tail: clara.client_facts has lost fk_client_facts_client -- a fact''''s firm is no longer its client''''s firm by constraint'
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_class where relname='uq_client_fact_live'
    and relnamespace='clara'::regnamespace;
  if v_n <> 1 then
    raise exception '#784 tail: uq_client_fact_live is absent' using errcode='CLR10';
  end if;
  -- THE NO-SHADOW RULE, RE-ASSERTED STRUCTURALLY. Not "there are no knowledge records" -- by the
  -- time this file applies, a database may legitimately hold plenty -- but that NOTHING this file
  -- recut can see one. The union expression never consults clara.knowledge_records (checked in
  -- the prestate), and none of the three recut bodies reaches the register by any other route,
  -- so no knowledge-record write can move what any of them observes. That is a property of the
  -- TEXT, which is why it is probed here rather than argued in a comment.
  for r in select * from (values
      ('clara.get_context_pack(uuid,text)'),
      ('clara._close_gate_closing_stock(uuid,uuid)'),
      ('clara._bank_registry_ledger_state(uuid,date)'),
      ('clara._tf_counterparty_name_only_guard()')) as t(sig)
  loop
    select p.prosrc into v_src from pg_proc p where p.oid = r.sig::regprocedure;
    if position('knowledge_records' in v_src) <> 0 then
      raise exception '#784 tail: % now reads clara.knowledge_records -- a governed knowledge record could shadow the legacy fact this site enforces', r.sig
        using errcode='CLR10';
    end if;
  end loop;

  raise notice '#784 tail: OK -- clara.get_context_pack, clara._close_gate_closing_stock and clara._bank_registry_ledger_state each obtain their legacy Client Knowledge value through the ONE clara._knowledge_legacy_rows expression the register and the pack already use, each passing the CLIENT''S OWN firm derived from clara.clients and none a session firm, and none of the three names clara.client_facts any more; clara._tf_counterparty_name_only_guard DELIBERATELY keeps its direct uq_client_fact_live exists-probe (a per-row write-path trigger measured at 0.011 ms against 2.027 ms for the per-client jsonb aggregate) with the reason recorded in ARCHITECTURE §5.A and its body pinned above so the justification cannot outlive the text it is about; all five functions remain clara_fn_owner-owned SECURITY DEFINER with search_path=clara, pg_temp and their carried ACLs (this file grants and revokes nothing); clara.record_client_fact still resolves at its exact 0055 signature as the only door a legacy fact changes through, clara.client_facts keeps uq_client_fact_live and the (client_id, firm_id) congruence FK, and NONE of the four sites can see clara.knowledge_records at all -- the no-shadow rule is a property of the text, not of this file''s care, so no knowledge-record write can move what any of them observes.';
end
$w784_tail$;
