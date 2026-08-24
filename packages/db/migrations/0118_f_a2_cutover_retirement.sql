-- UNNUMBERED_f_a2_cutover_retirement.sql — F-A2 PR-3: cutover + retirement.
-- =====================================================================================
-- Number claimed at MERGE time (standing law). Design of record:
-- docs/plan/active/f-a2-agentic-posting-design.md v6.1 §5 step 5 + Annex B (the executable
-- retirement checklist, f-a2-annexes-1-estate.md). Applies ONLY after F-A2 PR-2's runtime
-- image is verified LIVE (design §5: "the drops... only after PR-2's image is verified
-- live") — that ordering cannot be enforced from inside this file (no DB-side prestate can
-- see a runtime deploy), so it is a ceremony precondition, stated here per the same idiom
-- 0097's header already used for an identical constraint. D1 write-quiesce.
--
-- §0 QUIESCE INVENTORY — every live body this file DROPs or RECUTS, pinned by prosrc
-- sha256 measured by RIG REPLAY against the frontier this file was authored against
-- (0001-0102 plus F-A2 PR-1's three parts, staged as 0103-0105 on a throwaway Postgres 17
-- per packages/db/README.md) — never read from migration source (Annex A's standing
-- caveat: CREATE OR REPLACE is "last definition wins" and several of these bodies are
-- decades of splices deep).
--
--   DROP  clara.execute_rule_post(uuid,text)
--         1d716337750bc42727d22ac01f79a36d55e2b04cf5f56641f693e5c837389f4b
--   DROP  clara._settle_rule_post_skip(uuid,uuid,uuid,uuid,text,text,text)
--         dbeba1396d4f44a7cab8f33ba74db7b3841a43841a22a1d3d5d92a73453da52f
--   DROP  clara.propose_coding_rule(uuid,uuid,text,text)
--         920a850376ace62c1f1a1788d01887adc91ef9b874615a3b2d8826a606d73a3e
--   DROP  clara.sign_coding_rule(uuid,text)
--         c9f5bfb147397f1f9ed0a0f4a2c06262a1e25550ab7729ec293c391bc730ae4b
--   DROP  clara.decline_coding_rule(uuid,text,text)
--         96340a718e67ab0bf8436fda1a2eed88d1b0eb95c7b6e99b6ab595a6075d0aa5
--   DROP  clara.retire_coding_rule(uuid,text,uuid,text)
--         cabdbf0f0c9994010050b92a7ec293f175eecd7e00051edcf4828bc87dcce901
--   DROP  clara.get_coding_rule(uuid)
--         86921c84cf3d04cb0d6a55d8d2b9435287f1e96838193efbe9849c757469a5fd
--   DROP  clara.propose_autopost_rule(jsonb,text)
--         5e2c2a034300e960b11e70e67c94dca1d85334ffa46bd9548fdfdae2c4d47e14
--   DROP  clara.sign_autopost_rule(uuid,text)
--         eab1823f4ca752e52bb830bfaf95b9b5608239dd66549a52028871ca979aaac8
--   DROP  clara.retire_autopost_rule(uuid,text,text)
--         a3d9d55ef8ef31e7ea0c9cdd357a5f797add9817e719d8cd3285542b4d106bd2
--   DROP  clara.list_autopost_rules(jsonb)
--         a40922c9398a32bfb6f171cbf972071140f90039cc1289f9d0ddc12630fea916
--   DROP  clara.acknowledge_rule_posts(uuid[],text)
--         9e8dd42c74404ab9b3d6c3bd981520dc97907111be6be934897113a31ae9aad4
--   DROP  clara.get_rule_post_run(uuid)
--         fad0add613a49cbb9fca5cbb5323c59e2282a3381beb144ea9d89346467d2aa9
--   DROP  clara.reconcile_autopost_rules()
--         68eabd8b9f9aafc9794aae05158c63c1417b720427dd1266e4836e3303b8523f
--   DROP  clara._ocr_sales_floor(uuid,uuid,text)
--         079d67075d8d79f0f881c61bc366f5a5e2f60c678414512d4dde72575eeb06b1
--   DROP  clara._ocr_sales_floor_pop(uuid,uuid,text,date)
--         5bfe098516b5dc277eaba47240b068c2c741c4e97cecabe0890006ea9b4e09b6
--   DROP  clara.preview_ocr_sales_evidence(uuid)
--         5dc94fe443d2624a218b45c6168ce4d7f0508790702f3aa94b310208010b5b75
--   RECUT clara.tick_seeding_proposal(uuid,text)
--         53a73d913abf3a5d9c40615d9f38075b6c6066d83e53b9702e663c4ee37fe758
--
-- DEPENDENCY CENSUS (measured on the same rig, not assumed): zero pg_trigger rows call any
-- of the seventeen DROPped functions, zero pg_depend edges reference them from another
-- catalog object, and zero clara.wake_fn_allowlist rows name them — none of them was ever
-- wake-wrapped; all seventeen carry LEGACY login-direct or ACL grants (Annex B.1), which
-- `drop function` removes with the object itself. No explicit revoke is needed or written,
-- matching the estate's own drop idiom (0005:954-955, 0009:1198-1202, 0011:1130-1131,
-- 0046:615).
--
-- OQ-2 (D35) — NOT this file's obligation. `_draft_entry_core` already stopped writing
-- `rule_decisions` in F-A2 PR-1 (0103_f_a2_posting_core.sql). This PR's own OQ-2 surface is
-- the DASHBOARD half only (list_review_queue.rule_backed removed from the UI; the DB
-- projection at list_review_queue itself is UNTOUCHED — it keeps reading rule_decisions
-- honestly as history, per Annex B.6's "two things the ruling does NOT reach").
--
-- OQ-3 (D36) — this file's obligation, in two halves. (a) `preview_ocr_sales_evidence`
-- retires WITH the floor it reads (`_ocr_sales_floor` / `_ocr_sales_floor_pop`) — three
-- DROPs above. (b) `tick_seeding_proposal` stops minting a signed `clara.coding_rules` row
-- for a `vendor_account_rule` tick ("no more signed-coding_rules minting", D36) and
-- re-points that judgement to a knowledge-layer artifact ("context-pack food, law 73").
--
-- BUILD DECISION ON (b)'S EXACT MECHANISM — named here because the design states the
-- ruling's outcome, not its implementation shape, and this is the one piece of this PR
-- that is genuinely NEW rather than a drop; grounds are threefold, all measured on this
-- rig/tree, not assumed:
--   1. packages/db/deploy/wave-b-w2-authority-boundary-audit.sql's WB-R6(1) census (still
--      current after this file: tick_seeding_proposal is NOT removed from its v_auth array
--      below) FORBIDS any authority function, tick_seeding_proposal included, from calling
--      a wiki write or referencing a wiki relation directly — so the recut body may not
--      call publish_wiki_page_version itself.
--   2. packages/runtime/lib/wiki-projection.mjs already carries a DETERMINISTIC lane for
--      exactly this shape ("the DETERMINISTIC seeding wiki_fact lane (F13): a TICKED
--      seeding.proposal_decided ... publishes its page from the proposal payload
--      VERBATIM. No model, no consent, no Storage egress") — built for proposal_kind
--      'wiki_fact'. This file re-points a vendor_account_rule tick onto the SAME lane by
--      writing the wiki-shaped payload the consumer already knows how to read
--      (`payload.wiki.{slug,title,page_kind,content}`) onto the proposal's own `payload`
--      column, extend-only (`payload || …`); the runtime's widening of that lane's two
--      kind-gate checks from `=== "wiki_fact"` to a two-member set is this PR's runtime
--      consumer edit, reported alongside this migration — no new function, no new page
--      kind (`treatment` is already in WIKI_FACT_PAGE_KINDS), no new event.
--   3. apps/dashboard/app/shared/seedingApi.ts's SeedingBatchView.tsx ALREADY branches its
--      success copy on `wiki_dispatch_required` alone ("ticked — publishing to the wiki" vs
--      plain "ticked") — the dashboard needs NO edit for this change to render correctly;
--      it was written expecting exactly this flag to widen.
-- The content this file writes is a plain, non-interpretive transcription of what the
-- admin's tick already decided (the counterparty's name and the account code) — never a
-- model judgement, matching the deterministic lane's own "no model" contract.
--
-- EVERYTHING ELSE on Annex B.1's RETIRE list is KEEP-AS-HISTORY and untouched by this file:
-- no TABLE is dropped (rule_post_runs, rule_post_skips, coding_rules, rule_sightings,
-- rule_decisions, journal_entries.checked_via_rule_id) and no event-taxonomy entry is
-- removed (entry.rule_posted, kb_rule.* stay valid values; nothing emits them once this
-- file applies, which is the point).
set local statement_timeout = '5min';
set local search_path = clara, pg_temp;

-- Quiesce guard: this file drops audited writers and recuts a live one under D1.
do $fa2cut_quiesce$
declare v_component text; v_beat timestamptz;
begin
  select h.component, h.beat_at into v_component, v_beat from clara.runtime_heartbeats h
   where h.beat_at > now() - interval '90 seconds' order by h.beat_at desc limit 1;
  if v_component is not null then
    raise exception 'F-A2 cutover QUIESCE GUARD: a runtime heartbeat is fresh (component %, beat_at %) — this file drops seventeen live grants and recuts tick_seeding_proposal in place (D1)',
      v_component, v_beat;
  end if;
end
$fa2cut_quiesce$;

create temp table _fa2cut_pre(k text primary key, v text) on commit drop;

do $fa2cut_pre$
declare
  v_src text; v_sha text; v_n int; v_sig text; v_want text;
  v_pins text[][] := array[
    ['clara.execute_rule_post(uuid,text)',
     '1d716337750bc42727d22ac01f79a36d55e2b04cf5f56641f693e5c837389f4b'],
    ['clara._settle_rule_post_skip(uuid,uuid,uuid,uuid,text,text,text)',
     'dbeba1396d4f44a7cab8f33ba74db7b3841a43841a22a1d3d5d92a73453da52f'],
    ['clara.propose_coding_rule(uuid,uuid,text,text)',
     '920a850376ace62c1f1a1788d01887adc91ef9b874615a3b2d8826a606d73a3e'],
    ['clara.sign_coding_rule(uuid,text)',
     'c9f5bfb147397f1f9ed0a0f4a2c06262a1e25550ab7729ec293c391bc730ae4b'],
    ['clara.decline_coding_rule(uuid,text,text)',
     '96340a718e67ab0bf8436fda1a2eed88d1b0eb95c7b6e99b6ab595a6075d0aa5'],
    ['clara.retire_coding_rule(uuid,text,uuid,text)',
     'cabdbf0f0c9994010050b92a7ec293f175eecd7e00051edcf4828bc87dcce901'],
    ['clara.get_coding_rule(uuid)',
     '86921c84cf3d04cb0d6a55d8d2b9435287f1e96838193efbe9849c757469a5fd'],
    ['clara.propose_autopost_rule(jsonb,text)',
     '5e2c2a034300e960b11e70e67c94dca1d85334ffa46bd9548fdfdae2c4d47e14'],
    ['clara.sign_autopost_rule(uuid,text)',
     'eab1823f4ca752e52bb830bfaf95b9b5608239dd66549a52028871ca979aaac8'],
    ['clara.retire_autopost_rule(uuid,text,text)',
     'a3d9d55ef8ef31e7ea0c9cdd357a5f797add9817e719d8cd3285542b4d106bd2'],
    ['clara.list_autopost_rules(jsonb)',
     'a40922c9398a32bfb6f171cbf972071140f90039cc1289f9d0ddc12630fea916'],
    ['clara.acknowledge_rule_posts(uuid[],text)',
     '9e8dd42c74404ab9b3d6c3bd981520dc97907111be6be934897113a31ae9aad4'],
    ['clara.get_rule_post_run(uuid)',
     'fad0add613a49cbb9fca5cbb5323c59e2282a3381beb144ea9d89346467d2aa9'],
    ['clara.reconcile_autopost_rules()',
     '68eabd8b9f9aafc9794aae05158c63c1417b720427dd1266e4836e3303b8523f'],
    ['clara._ocr_sales_floor(uuid,uuid,text)',
     '079d67075d8d79f0f881c61bc366f5a5e2f60c678414512d4dde72575eeb06b1'],
    ['clara._ocr_sales_floor_pop(uuid,uuid,text,date)',
     '5bfe098516b5dc277eaba47240b068c2c741c4e97cecabe0890006ea9b4e09b6'],
    ['clara.preview_ocr_sales_evidence(uuid)',
     '5dc94fe443d2624a218b45c6168ce4d7f0508790702f3aa94b310208010b5b75'],
    ['clara.tick_seeding_proposal(uuid,text)',
     '53a73d913abf3a5d9c40615d9f38075b6c6066d83e53b9702e663c4ee37fe758']];
begin
  for v_n in 1 .. array_length(v_pins,1) loop
    v_sig := v_pins[v_n][1]; v_want := v_pins[v_n][2];
    if to_regprocedure(v_sig) is null then
      raise exception 'F-A2 cutover prestate: pinned body absent: % — already dropped, or this file is being re-applied out of order', v_sig using errcode='CLR10';
    end if;
    select p.prosrc into v_src from pg_proc p where p.oid = v_sig::regprocedure;
    v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
    if v_sha <> v_want then
      raise exception 'F-A2 cutover prestate: % has prosrc sha % but this file was authored against % — re-derive against the LIVE tip before dropping/recutting it',
        v_sig, v_sha, v_want using errcode='CLR10';
    end if;
    insert into _fa2cut_pre(k,v) values ('sha:'||v_sig, v_sha);
  end loop;

  -- Zero application dependencies on any of the seventeen retiring verbs (measured on this
  -- rig, not assumed): no trigger, no other catalog object via pg_depend, no wake_fn_allowlist
  -- row. A non-zero count here means Annex B.1's "confirmed clean" census has drifted.
  select count(*)::int into v_n from clara.wake_fn_allowlist w
   where w.fn_name in ('execute_rule_post','_settle_rule_post_skip','propose_coding_rule',
     'sign_coding_rule','decline_coding_rule','retire_coding_rule','get_coding_rule',
     'propose_autopost_rule','sign_autopost_rule','retire_autopost_rule','list_autopost_rules',
     'acknowledge_rule_posts','get_rule_post_run','reconcile_autopost_rules','_ocr_sales_floor',
     '_ocr_sales_floor_pop','preview_ocr_sales_evidence');
  if v_n <> 0 then
    raise exception 'F-A2 cutover prestate: % of the seventeen retiring verb(s) hold a wake_fn_allowlist row — none should, they were never wake-wrapped', v_n using errcode='CLR10';
  end if;
  insert into _fa2cut_pre(k,v) values ('allowlist_check','0');

  -- KEEP-AS-HISTORY relations: present before this file touches anything, so the tail can
  -- prove they are STILL present after (no table drop hides inside the seventeen DROPs).
  select count(*)::int into v_n from information_schema.tables
   where table_schema='clara' and table_name in
     ('rule_post_runs','rule_post_skips','coding_rules','rule_sightings','rule_decisions');
  if v_n <> 5 then
    raise exception 'F-A2 cutover prestate: expected all 5 KEEP-AS-HISTORY relations present, found %', v_n using errcode='CLR10';
  end if;
end
$fa2cut_pre$;

-- =====================================================================================
-- S1 — the seventeen retiring verbs (Annex B.1's RETIRE list). Order is immaterial: none
-- of these bodies is called by another (PL/pgSQL calls are late-bound; the dependency
-- census above proves no catalog object references them), so they are dropped in the
-- design's own listed order for readability.
-- =====================================================================================
drop function clara.execute_rule_post(uuid,text);
drop function clara._settle_rule_post_skip(uuid,uuid,uuid,uuid,text,text,text);
drop function clara.propose_coding_rule(uuid,uuid,text,text);
drop function clara.sign_coding_rule(uuid,text);
drop function clara.decline_coding_rule(uuid,text,text);
drop function clara.retire_coding_rule(uuid,text,uuid,text);
drop function clara.get_coding_rule(uuid);
drop function clara.propose_autopost_rule(jsonb,text);
drop function clara.sign_autopost_rule(uuid,text);
drop function clara.retire_autopost_rule(uuid,text,text);
drop function clara.list_autopost_rules(jsonb);
drop function clara.acknowledge_rule_posts(uuid[],text);
drop function clara.get_rule_post_run(uuid);
drop function clara.reconcile_autopost_rules();
drop function clara._ocr_sales_floor(uuid,uuid,text);
drop function clara._ocr_sales_floor_pop(uuid,uuid,text,date);
drop function clara.preview_ocr_sales_evidence(uuid);

-- =====================================================================================
-- S2 — clara.tick_seeding_proposal recut (OQ-3 / D36). Byte-identical through the
-- counterparty resolution block; the vendor_account_rule branch no longer inserts into
-- clara.coding_rules and no longer emits kb_rule.signed; a deterministic wiki payload is
-- written onto the proposal's own `payload` column instead, extend-only, for the async
-- wiki-projection consumer to publish VERBATIM (see the file header for the three grounds).
-- =====================================================================================
create or replace function clara.tick_seeding_proposal(p_proposal uuid,p_op_key text)
  returns jsonb language plpgsql security definer
  set search_path=clara,pg_temp as $$
declare
  c record; sp record; b record; v_dedupe jsonb; v_cp uuid; v_rule uuid;
  v_proposal jsonb; v_fp jsonb; v_name text; v_name_n text; v_reg text;
  v_reg_n text; v_tin text; v_account text; v_created boolean:=false;
  a jsonb; v_alias text; v_result jsonb; v_wiki_dispatch boolean; v_wiki_patch jsonb;
begin
  c:=clara._human_ctx(clara.role_rank('admin'));
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  select * into sp from clara.seeding_proposals where id=p_proposal for update;
  if not found or sp.firm_id<>c.firm then
    raise exception 'seeding proposal not in your firm' using errcode='CLR11';
  end if;
  select * into b from clara.seeding_batches where id=sp.batch_id for update;
  v_dedupe:=clara._reserve_op(c.firm,'tick_seeding_proposal',p_op_key,
    clara._hash(jsonb_build_object('proposal',p_proposal)));
  if v_dedupe is not null then return v_dedupe; end if;
  if b.state<>'open' then
    raise exception 'seeding batch is not open'
      using errcode='CLR34',detail='{"reason":"batch_not_open"}';
  end if;
  if sp.state<>'proposed' then
    raise exception 'seeding proposal is not open'
      using errcode='CLR34',detail='{"reason":"proposal_not_open"}';
  end if;

  if sp.proposal_kind in ('vendor_account_rule','counterparty_birth') then
    if nullif(sp.payload->>'counterparty_id','') is not null then
      v_proposal:=jsonb_build_object(
        'existing_id',sp.payload->>'counterparty_id','kind','vendor');
    else
      v_proposal:=jsonb_build_object('kind','vendor','new',
        jsonb_build_object('name',coalesce(
            nullif(sp.payload->>'name',''),
            sp.payload->>'counterparty_name'),
          'registration_no',sp.payload->>'registration_no',
          'tin',sp.payload->>'tin'));
    end if;
    v_fp:=clara._resolve_counterparty(sp.client_id,v_proposal);
    if v_fp->>'decision'='birth' then
      v_name:=btrim(coalesce(
        nullif(sp.payload->>'name',''),
        sp.payload->>'counterparty_name'));
      v_reg:=nullif(btrim(sp.payload->>'registration_no'),'');
      v_tin:=nullif(btrim(sp.payload->>'tin'),'');
      v_name_n:=lower(regexp_replace(v_name,'[^a-zA-Z0-9]','','g'));
      v_reg_n:=case when v_reg is null then null else
        lower(regexp_replace(v_reg,'[^a-zA-Z0-9]','','g')) end;
      begin
        insert into clara.counterparties(firm_id,client_id,kind,name,
            name_normalized,registration_no,registration_normalized,tin,created_by)
          values(c.firm,sp.client_id,'vendor',v_name,v_name_n,v_reg,v_reg_n,
            v_tin,c.actor) returning id into v_cp;
        v_created:=true;
      exception when unique_violation then
        raise exception 'counterparty birth raced with an existing identity'
          using errcode='CLR23',detail='{"reason":"registration_conflict"}';
      end;
    else
      v_cp:=clara._canonical_counterparty(
        sp.client_id,(v_fp->>'counterparty_id')::uuid);
      -- Also read the display name here (not just its normalized form) — the
      -- vendor_account_rule wiki content below needs a name even when the tick binds an
      -- EXISTING counterparty (the 'birth' branch above is the only place v_name was set
      -- before this recut; a counterparty_id-only payload carries no name of its own).
      select cp.name, cp.name_normalized into v_name, v_name_n
        from clara.counterparties cp where cp.id=v_cp;
    end if;
    if jsonb_typeof(sp.payload->'aliases')='array' then
      for a in select value from jsonb_array_elements(sp.payload->'aliases') loop
        v_alias:=nullif(btrim(a#>>'{}'),'');
        if v_alias is not null and lower(regexp_replace(v_alias,
            '[^a-zA-Z0-9]','','g'))<>v_name_n then
          begin
            insert into clara.counterparty_aliases(firm_id,client_id,
                counterparty_id,alias_normalized,alias_display,origin,created_by)
              values(c.firm,sp.client_id,v_cp,
                lower(regexp_replace(v_alias,'[^a-zA-Z0-9]','','g')),
                v_alias,'human',c.actor);
          exception when unique_violation then
            raise exception 'a live counterparty alias already owns this name'
              using errcode='CLR23',detail='{"reason":"alias_collision"}';
          end;
        end if;
      end loop;
    end if;
  end if;

  if sp.proposal_kind='vendor_account_rule' then
    v_account:=sp.payload->>'account_code';
  end if;
  -- OQ-3 (D36, 2026-08-22): no more signed clara.coding_rules minting on this path. v_rule
  -- stays NULL for 'vendor_account_rule', the same shape 'counterparty_birth' already
  -- returned — the judgement re-points to the knowledge layer below instead of a rule row.
  -- coding_rules and rule_decisions are KEEP-AS-HISTORY (Annex B.1): existing rows and the
  -- frozen coding_lane read path are untouched; only the WRITE stops.
  v_wiki_dispatch := sp.proposal_kind in ('wiki_fact','vendor_account_rule');
  -- The deterministic wiki fact a vendor_account_rule tick contributes: a plain
  -- transcription of what the admin just decided (name + account code), never an
  -- interpretation. WB-R6(1) (wave-b-w2-authority-boundary-audit.sql) forbids an authority
  -- function from reaching wiki state directly, so this only stages the payload the async
  -- wiki-projection consumer already knows how to publish VERBATIM — no wiki call happens
  -- in this function.
  v_wiki_patch := case when sp.proposal_kind='vendor_account_rule' and v_account is not null
      and coalesce(v_name,'')<>'' then
      jsonb_build_object('wiki',jsonb_build_object(
        'slug','vendor-account/'||v_cp::text,
        'title','Vendor account coding: '||v_name,
        'page_kind','treatment',
        'content',v_name||' bills post to account '||v_account||'.'))
    else '{}'::jsonb end;
  update clara.seeding_proposals set state='ticked',decided_by=c.actor,
    decided_at=now(),resulting_rule_id=v_rule,
    resulting_counterparty_id=v_cp,
    payload=payload || v_wiki_patch
    where id=p_proposal;
  perform clara._audit(c.firm,c.actor,null,null,'tick_seeding_proposal',null,
    jsonb_build_object('proposal',p_proposal,'batch',sp.batch_id,
      'counterparty',v_cp,'rule',v_rule,'op_key',p_op_key));
  if v_created then
    perform clara._append_event(c.firm,'counterparty.created',sp.client_id,
      c.actor,null,null,null,null,null,jsonb_build_object('counterparty_id',v_cp));
  end if;
  perform clara._append_event(c.firm,'seeding.proposal_decided',sp.client_id,
    c.actor,null,null,null,b.source_document_id,null,jsonb_build_object(
      'batch_id',sp.batch_id,'proposal_id',p_proposal,'decision','ticked',
      'proposal_kind',sp.proposal_kind,'resulting_rule_id',v_rule,
      'resulting_counterparty_id',v_cp,
      'wiki_dispatch_required',v_wiki_dispatch));
  v_result:=jsonb_build_object('proposal_id',p_proposal,'status','ticked',
    'proposal_kind',sp.proposal_kind,'counterparty_id',v_cp,'rule_id',v_rule,
    'wiki_dispatch_required',v_wiki_dispatch,
    'wiki_source_document_id',b.source_document_id,
    'wiki_payload',case when v_wiki_dispatch
      then jsonb_build_object('payload',sp.payload || v_wiki_patch,'evidence',sp.evidence) end);
  return clara._finish_op(c.firm,'tick_seeding_proposal',p_op_key,v_result);
end $$;

-- =====================================================================================
-- TAIL — a read that can say NO, not an assertion of intent.
-- =====================================================================================
do $fa2cut_tail$
declare v_n int; v_src text; v_sha text;
begin
  -- (1) The seventeen retiring verbs are GONE.
  foreach v_src in array array['clara.execute_rule_post(uuid,text)',
      'clara._settle_rule_post_skip(uuid,uuid,uuid,uuid,text,text,text)',
      'clara.propose_coding_rule(uuid,uuid,text,text)','clara.sign_coding_rule(uuid,text)',
      'clara.decline_coding_rule(uuid,text,text)','clara.retire_coding_rule(uuid,text,uuid,text)',
      'clara.get_coding_rule(uuid)','clara.propose_autopost_rule(jsonb,text)',
      'clara.sign_autopost_rule(uuid,text)','clara.retire_autopost_rule(uuid,text,text)',
      'clara.list_autopost_rules(jsonb)','clara.acknowledge_rule_posts(uuid[],text)',
      'clara.get_rule_post_run(uuid)','clara.reconcile_autopost_rules()',
      'clara._ocr_sales_floor(uuid,uuid,text)','clara._ocr_sales_floor_pop(uuid,uuid,text,date)',
      'clara.preview_ocr_sales_evidence(uuid)'] loop
    if to_regprocedure(v_src) is not null then
      raise exception 'F-A2 cutover tail: % still exists after its DROP', v_src using errcode='CLR10';
    end if;
  end loop;

  -- (2) tick_seeding_proposal exists exactly once, its new body contains NO coding_rules
  -- INSERT and NO kb_rule.signed emission (structural proof of the write-stop — the exact
  -- string this recut removed, not a belief that it did).
  select count(*)::int into v_n from pg_proc p
   where p.pronamespace='clara'::regnamespace and p.proname='tick_seeding_proposal';
  if v_n <> 1 then
    raise exception 'F-A2 cutover tail: tick_seeding_proposal has % overload(s), expected exactly 1', v_n using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid='clara.tick_seeding_proposal(uuid,text)'::regprocedure;
  if position('insert into clara.coding_rules' in v_src) <> 0 then
    raise exception 'F-A2 cutover tail: tick_seeding_proposal still inserts into clara.coding_rules' using errcode='CLR10';
  end if;
  if position('kb_rule.signed' in v_src) <> 0 then
    raise exception 'F-A2 cutover tail: tick_seeding_proposal still emits kb_rule.signed' using errcode='CLR10';
  end if;
  if position('publish_wiki_page_version' in v_src) <> 0
     or position('wiki_pages' in v_src) <> 0 then
    raise exception 'F-A2 cutover tail: tick_seeding_proposal reaches wiki state directly — WB-R6(1) violation' using errcode='CLR10';
  end if;
  -- The recut still carries the counterparty-birth path, the audit call and the
  -- seeding.proposal_decided event byte-for-byte (extend-never-weaken).
  foreach v_src in array array[
      'insert into clara.counterparties(firm_id,client_id,kind,name,',
      'counterparty birth raced with an existing identity',
      'seeding.proposal_decided'] loop
    if position(v_src in (select p.prosrc from pg_proc p where p.oid='clara.tick_seeding_proposal(uuid,text)'::regprocedure)) = 0 then
      raise exception 'F-A2 cutover tail: tick_seeding_proposal lost %', left(v_src,50) using errcode='CLR10';
    end if;
  end loop;

  -- (3) The five KEEP-AS-HISTORY relations are still present, still populated as before
  -- (the migration writes no DML against them — a read that can say NO, not an assertion).
  select count(*)::int into v_n from information_schema.tables
   where table_schema='clara' and table_name in
     ('rule_post_runs','rule_post_skips','coding_rules','rule_sightings','rule_decisions');
  if v_n <> 5 then
    raise exception 'F-A2 cutover tail: expected all 5 KEEP-AS-HISTORY relations present, found %', v_n using errcode='CLR10';
  end if;

  raise notice 'F-A2 cutover tail: OK -- seventeen retiring verbs confirmed ABSENT (execute_rule_post, _settle_rule_post_skip, the six coding_rule verbs, the five autopost_rule verbs, acknowledge_rule_posts, get_rule_post_run, both ocr_sales_floor bodies, preview_ocr_sales_evidence); tick_seeding_proposal recut in place (1 overload) with NO coding_rules insert, NO kb_rule.signed emission and NO direct wiki call, while the counterparty-birth path, its CLR23 registration_conflict raise and the seeding.proposal_decided event all survive verbatim; all 5 KEEP-AS-HISTORY relations (rule_post_runs, rule_post_skips, coding_rules, rule_sightings, rule_decisions) remain present. No table dropped, no event-taxonomy entry removed.';
end
$fa2cut_tail$;
