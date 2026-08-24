-- UNNUMBERED_f_a2_posted_chain.sql — F-A2 PR-1, part 3 of 3: THE `posted` OUTCOME CHAIN.
-- =====================================================================================
-- Number claimed at MERGE time, immediately after part 2's. Design of record:
-- docs/plan/active/f-a2-agentic-posting-design.md v6 §3.8 + Annex F. It rides the SAME D1
-- window as parts 1 and 2 (Annex B.9's list) — the PR-0 width ruling gave it its own FILE, not
-- its own ceremony: a third window buys review isolation the file split already buys, at the
-- price of another stop/start night with its reconciler-herd and zombie-pooler hazards.
--
-- BEHAVIOURALLY INERT ON ARRIVAL, ON PURPOSE. Nothing in the estate emits the `posted` outcome
-- until PR-2's autoDraft_v9 does. Every widening below is strictly ADDITIVE: no existing outcome
-- changes bucket, no existing row moves, and every arm this file does not name keeps its exact
-- text. Do not read the absence of a producer as evidence this is dead code — it ships AHEAD of
-- its producer so the settle path can never land without its chain already in place, which is
-- the same discipline 0040:7109-7112 wrote down for its own inert splice.
--
-- WHY IT IS FIVE LAYERS AND NOT TWO (Annex F; GM-8 added the fifth at the gate). A fix at any
-- ONE layer alone either lies or raises:
--   1  sweep_run_items.outcome CHECK ....... a `posted` row violates it — loud, and the only
--                                            honest failure in the chain
--   2  settle_autodraft_task's own guard ... an IF/RAISE, not a CHECK: CLR10 unless widened,
--                                            and there are TWO overloads, each with its own copy
--   3  the v_item_outcome mapping .......... `else 'skipped_lane'` SILENTLY MIS-BUCKETS a post
--   4  reconcile_sweep_runs' finalize ...... counts drafted / skipped+noop / refused_*; a posted
--                                            row lands in NONE of the three and the run summary
--                                            under-totals against expected_count
--   5  ck_sweep_run_items_shape ............ forbids a non-'drafted' outcome from carrying an
--                                            entry_id, so widening only layer 1 and writing the
--                                            entry_id is a CONSTRAINT VIOLATION
-- plus six further sites, four of them found by the v2 re-derivation: the entry-exists
-- validation skips a posted settle entirely; `last_refusal` keeps a stale refusal; `entry_id`
-- lands NULL; and a posted row is stamped with a FABRICATED CLR29 refusal token — false data,
-- not merely missing. The sixth is `classifySettleReceipt`, which is inside the freeze and is
-- PR-2's.
--
-- ONE JUDGEMENT CALL THE DESIGN DID NOT FULLY DETERMINE, flagged for PR-1's review. Annex F says
-- the finalize "counts a posted row in none of its three counters" and C.9 asserts
-- drafted+skipped+refused+posted = expected. clara.sweep_runs has no fourth counter, so this
-- file ADDS `posted_count` rather than folding posts into `drafted_count`: folding would make a
-- posted row indistinguishable from a drafted one in the run summary, which is precisely the
-- silent mis-bucketing §3.8 exists to remove. The column is additive, defaulted and
-- NOT NULL — no existing row or reader moves.
--
-- WHY §6 DOES NOT READ THIS CHAIN FOR ITS POSTED COUNT. It reads clara.entry_post_receipts —
-- one row per posted entry, unique(entry_id), written inside the posting transaction — and
-- CROSS-CHECKS it against sweep_run_items.outcome='posted'. A DISAGREEMENT BETWEEN THE TWO IS
-- ITSELF A FINDING.
--
-- The timeout is precautionary; the two ALTER TABLEs take ACCESS EXCLUSIVE briefly on a small
-- relation and add no non-volatile default rewrite.
set local statement_timeout = '5min';
set local search_path = clara, pg_temp;

do $fa2p3_quiesce$
declare v_component text; v_beat timestamptz;
begin
  select h.component, h.beat_at into v_component, v_beat from clara.runtime_heartbeats h
   where h.beat_at > now() - interval '90 seconds' order by h.beat_at desc limit 1;
  if v_component is not null then
    raise exception 'F-A2 part3 QUIESCE GUARD: a runtime heartbeat is fresh (component %, beat_at %) — this file replaces BOTH settle_autodraft_task overloads and reconcile_sweep_runs, and swaps a CHECK pair on clara.sweep_run_items under ACCESS EXCLUSIVE (D1)',
      v_component, v_beat;
  end if;
end
$fa2p3_quiesce$;

create temp table _fa2p3_pre(k text primary key, v text) on commit drop;

do $fa2p3_pre$
declare
  v_src text; v_n int; v_key text; v_sig text; v_def text; v_sha text; v_want text;
  v_pins text[][] := array[
    ['clara.settle_autodraft_task(uuid,text,bigint,uuid,jsonb,text)',
     'b201adba6e8e9eee07e46a9630cd8e781ca0eba622e344b4c43727be63dd4e63'],
    ['clara.settle_autodraft_task(uuid,text,bigint,uuid,jsonb)',
     'f4ec692017bbc2a19c61f3cf82739c5c75a9fb3a9a10158b6c582d679cfa0fd4'],
    ['clara.reconcile_sweep_runs()',
     '98c68aeb70a8426ee98aef9d3fb0472ab9e49c681b1da654c9326e6c67849b36']];
begin
  -- Part 1 must be in place: the entry-exists validation's new disjunct reads the receipt table.
  if to_regclass('clara.entry_post_receipts') is null then
    raise exception 'F-A2 part3 prestate: clara.entry_post_receipts is absent — apply UNNUMBERED_f_a2_posting_core.sql first' using errcode='CLR10';
  end if;

  -- (0.1) THE THREE BODIES, PINNED BY PROSRC SHA-256 AT FRONTIER 0102. 0047 proves both settle
  -- overloads coexist; each carries its OWN copy of the guard, so each is spliced separately.
  for v_n in 1 .. array_length(v_pins,1) loop
    v_sig := v_pins[v_n][1]; v_want := v_pins[v_n][2];
    if to_regprocedure(v_sig) is null then
      raise exception 'F-A2 part3 prestate: pinned body absent: %', v_sig using errcode='CLR10';
    end if;
    select p.prosrc into v_src from pg_proc p where p.oid = v_sig::regprocedure;
    v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
    if v_sha <> v_want then
      raise exception 'F-A2 part3 prestate: % has prosrc sha % but this file was authored against % — re-derive the splice against the LIVE tip',
        v_sig, v_sha, v_want using errcode='CLR10';
    end if;
    insert into _fa2p3_pre(k,v) values ('sha:'||v_sig, v_sha);
    if position('$function$' in v_src) <> 0 then
      raise exception 'F-A2 part3 prestate: % contains the dollar-quote tag this file relies on', v_sig using errcode='CLR10';
    end if;
  end loop;
  select count(*)::int into v_n from pg_proc p
   where p.pronamespace='clara'::regnamespace and p.proname='settle_autodraft_task';
  if v_n <> 2 then
    raise exception 'F-A2 part3 prestate: settle_autodraft_task has % overloads, expected the 5- and 6-arity pair', v_n using errcode='CLR10';
  end if;

  -- (0.2) EVERY SPLICE ANCHOR, IN BOTH OVERLOADS, COUNTED.
  foreach v_sig in array array['clara.settle_autodraft_task(uuid,text,bigint,uuid,jsonb,text)',
      'clara.settle_autodraft_task(uuid,text,bigint,uuid,jsonb)'] loop
    select p.prosrc into v_src from pg_proc p where p.oid=v_sig::regprocedure;
    foreach v_key in array array[
        '     or p_outcome not in (''drafted'',''skipped_lane'',''noop_existing'',''failed'')',
        '  if p_outcome=''drafted'' and (p_entry is null or not exists(',
        '        and (e.status=''draft''
             or (e.status=''approved'' and e.checked_via_rule_id is not null)))) then',
        '      last_refusal=case when p_outcome=''drafted'' then null else p_refusal end where id=a.id;',
        '    v_item_outcome:=case p_outcome when ''drafted'' then ''drafted''
      when ''noop_existing'' then ''noop_existing'' else ''skipped_lane'' end;',
        '        case when v_item_outcome=''drafted'' then p_entry end,',
        '        case when v_item_outcome<>''drafted'' then coalesce(p_refusal,'] loop
      v_n := (length(v_src) - length(replace(v_src, v_key, ''))) / length(v_key);
      if v_n <> 1 then
        raise exception 'F-A2 part3 prestate: anchor occurs % times (expected 1) in %: %', v_n, v_sig, left(v_key,60) using errcode='CLR10';
      end if;
    end loop;
  end loop;
  select p.prosrc into v_src from pg_proc p where p.oid='clara.reconcile_sweep_runs()'::regprocedure;
  v_key := '        refused_count=(select count(*) from clara.sweep_run_items where run_id=sr.id
          and outcome in (''refused_budget'',''refused_attempts'')),';
  v_n := (length(v_src) - length(replace(v_src, v_key, ''))) / length(v_key);
  if v_n <> 1 then
    raise exception 'F-A2 part3 prestate: the finalize bucketing anchor occurs % times (expected 1) — P4''s single-occurrence claim does not hold', v_n using errcode='CLR10';
  end if;

  -- (0.3) THE TWO CONSTRAINTS, PINNED AS TEXT — layers 1 and 5.
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
   where c.conrelid='clara.sweep_run_items'::regclass and c.conname='sweep_run_items_outcome_check';
  if v_def is distinct from 'CHECK ((outcome = ANY (ARRAY[''drafted''::text, ''skipped_lane''::text, ''refused_budget''::text, ''refused_attempts''::text, ''noop_existing''::text])))' then
    raise exception 'F-A2 part3 prestate: the outcome CHECK is not Annex F layer 1''s five-value enumeration: %', v_def using errcode='CLR10';
  end if;
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
   where c.conrelid='clara.sweep_run_items'::regclass and c.conname='ck_sweep_run_items_shape';
  if v_def is distinct from 'CHECK ((((outcome = ''drafted''::text) AND (entry_id IS NOT NULL)) OR ((outcome <> ''drafted''::text) AND (entry_id IS NULL))))' then
    raise exception 'F-A2 part3 prestate: ck_sweep_run_items_shape is not GM-8''s layer: %', v_def using errcode='CLR10';
  end if;
  if exists(select 1 from information_schema.columns
      where table_schema='clara' and table_name='sweep_runs' and column_name='posted_count') then
    raise exception 'F-A2 part3 partial birth: sweep_runs.posted_count already exists' using errcode='CLR10';
  end if;
  -- Both swaps validate over existing rows only if no row already claims the new outcome.
  select count(*)::int into v_n from clara.sweep_run_items where outcome='posted';
  if v_n <> 0 then
    raise exception 'F-A2 part3 prestate: % sweep_run_items row(s) already carry outcome=posted', v_n using errcode='CLR10';
  end if;
  insert into _fa2p3_pre(k,v) values
    ('items', (select count(*)::text from clara.sweep_run_items)),
    ('runs',  (select count(*)::text from clara.sweep_runs));

  raise notice 'F-A2 part3 prestate: clean -- both settle overloads and reconcile_sweep_runs pinned by prosrc sha at frontier 0102, all seven anchors present exactly once in EACH overload, the finalize bucketing anchor is a single occurrence (P4), both sweep_run_items CHECKs are Annex F''s layers 1 and 5 verbatim, and % existing sweep_run_items row(s) over % run(s) carry no posted outcome.',
    (select v from _fa2p3_pre where k='items'), (select v from _fa2p3_pre where k='runs');
end
$fa2p3_pre$;

-- =====================================================================================
-- LAYERS 1 AND 5 — the CHECK pair on clara.sweep_run_items, ACCESS EXCLUSIVE, drop+add.
-- Both widen strictly: every value and every shape admitted today is still admitted.
-- =====================================================================================
alter table clara.sweep_run_items drop constraint sweep_run_items_outcome_check;
alter table clara.sweep_run_items add constraint sweep_run_items_outcome_check
  check (outcome in ('drafted','skipped_lane','refused_budget','refused_attempts','noop_existing','posted'));
alter table clara.sweep_run_items drop constraint ck_sweep_run_items_shape;
alter table clara.sweep_run_items add constraint ck_sweep_run_items_shape
  -- GM-8's layer. A POSTED item records its entry for the same reason a DRAFTED one does: the
  -- row is the sweep's account of what it produced, and a post produces an entry. Every other
  -- outcome still MUST carry no entry_id.
  check ((outcome in ('drafted','posted') and entry_id is not null)
      or (outcome not in ('drafted','posted') and entry_id is null));

-- LAYER 4's missing counter (the judgement call in this file's header).
alter table clara.sweep_runs add column posted_count integer not null default 0
  check (posted_count >= 0);
comment on column clara.sweep_runs.posted_count is
  'F-A2 (Annex F layer 4): posted items in this run. A fourth counter rather than a fold into drafted_count, because folding would make a posted row indistinguishable from a drafted one in the run summary — the silent mis-bucketing §3.8 exists to remove. drafted + skipped + refused + posted is the run''s account of expected_count.';

-- =====================================================================================
-- LAYERS 2 AND 3 + FOUR OF THE SIX SITES — both settle_autodraft_task overloads.
-- Spliced from the LIVE prosrc inside pg_get_functiondef's own text, so the 5-arity's two
-- parameter defaults survive by construction rather than by retyping.
-- =====================================================================================
-- BOTH TARGETS ARE READ THROUGH A LITERAL regprocedure, never a loop variable: the
-- binding-post-control gate treats an unparseable CoR target as unproven — "an unresolvable
-- target is not evidence that execute_rule_post is untouched" — and it is right to. The two
-- overloads therefore get their own reads, and the one shared transform runs twice over them.
do $fa2p3_settle$
declare v_sig text; v_src text; v_new text; v_def text;
  v6_src text; v6_def text; v5_src text; v5_def text; i int;
begin
  select p.prosrc, pg_get_functiondef(p.oid) into v6_src, v6_def from pg_proc p
   where p.oid='clara.settle_autodraft_task(uuid,text,bigint,uuid,jsonb,text)'::regprocedure;
  select p.prosrc, pg_get_functiondef(p.oid) into v5_src, v5_def from pg_proc p
   where p.oid='clara.settle_autodraft_task(uuid,text,bigint,uuid,jsonb)'::regprocedure;
  for i in 1 .. 2 loop
    v_sig := case when i=1 then 'clara.settle_autodraft_task(uuid,text,bigint,uuid,jsonb,text)'
                  else 'clara.settle_autodraft_task(uuid,text,bigint,uuid,jsonb)' end;
    v_src := case when i=1 then v6_src else v5_src end;
    v_def := case when i=1 then v6_def else v5_def end;
    v_new := v_src;

    -- LAYER 2: the guard. An IF/RAISE, not a CHECK, and each overload carries its own copy.
    v_new := replace(v_new,
      '     or p_outcome not in (''drafted'',''skipped_lane'',''noop_existing'',''failed'')',
      '     or p_outcome not in (''drafted'',''skipped_lane'',''noop_existing'',''failed'',''posted'')');

    -- SITE 0036:948 — the entry-exists validation. A posted settle used to skip it ENTIRELY.
    -- The 'drafted' arm's admitted set is byte-identical: the new disjunct is fenced on
    -- p_outcome='posted', so nothing a drafted settle could do changes. A posted entry is
    -- approved with NO rule id (the agent post passes none), which is exactly the shape the
    -- existing identity test refuses — so the receipt row is what proves the identity, and its
    -- absence falls through to ARM 3's honest terminal receipt rather than admitting on absence.
    v_new := replace(v_new,
      '  if p_outcome=''drafted'' and (p_entry is null or not exists(',
      '  if p_outcome in (''drafted'',''posted'') and (p_entry is null or not exists(');
    -- THE PARTITION, NOT AN APPENDED DISJUNCT (C4). The first cut widened the OUTER gate to
    -- `p_outcome in ('drafted','posted')` and APPENDED a receipt disjunct — but left
    -- `e.status='draft'` and the approved-with-rule-id arm UNCONDITIONAL inside the exists. So a
    -- Tier-B-REFUSED draft (status draft, no receipt) settled with p_outcome='posted' was
    -- ADMITTED, and then everything downstream believed it: `last_refusal` cleared, the item
    -- recorded `posted` with an entry_id, `posted_count` incremented, and the task landed
    -- 'completed' — after which `admit` answers `already_done` forever and the filing is
    -- silently abandoned with its draft still sitting there. A wrong number is not required for
    -- this to be the worst class of bug in the file: an ABANDONED filing is.
    --
    -- The anchor is therefore WIDENED to both live lines so the whole condition can be
    -- partitioned by outcome: `drafted` keeps its admitted set BYTE-IDENTICAL, and `posted`
    -- demands approved AND a receipt. Four closers in, five out.
    --
    -- POST-FIX, a posted settle naming a draft falls to ARM 3 and raises CLR11 'draft settlement
    -- entry not found' — parity with the drafted arm. It is NOT routed to skipped_lane: that
    -- would record false data about what happened, which is the same class of defect as the
    -- fabricated CLR29 two sites below.
    --
    -- INHERITED HAZARD, NOTED NOT FIXED: a raise leaves the task 'running' (the 0047 wedge).
    -- PR-2's producer must settle only AFTER the post commits.
    v_new := replace(v_new,
      '        and (e.status=''draft''
             or (e.status=''approved'' and e.checked_via_rule_id is not null)))) then',
      '        and ((p_outcome=''drafted''
              and (e.status=''draft''
                   or (e.status=''approved'' and e.checked_via_rule_id is not null)))
             or (p_outcome=''posted'' and e.status=''approved''
                 and exists(select 1 from clara.entry_post_receipts pr where pr.entry_id=e.id))))) then');

    -- SITE 0036:978 — a posted task must not keep a stale refusal.
    v_new := replace(v_new,
      '      last_refusal=case when p_outcome=''drafted'' then null else p_refusal end where id=a.id;',
      '      last_refusal=case when p_outcome in (''drafted'',''posted'') then null else p_refusal end where id=a.id;');

    -- LAYER 3 — the mapping that SILENTLY bucketed a post as skipped_lane.
    v_new := replace(v_new,
      '    v_item_outcome:=case p_outcome when ''drafted'' then ''drafted''
      when ''noop_existing'' then ''noop_existing'' else ''skipped_lane'' end;',
      '    v_item_outcome:=case p_outcome when ''drafted'' then ''drafted''
      when ''posted'' then ''posted''
      when ''noop_existing'' then ''noop_existing'' else ''skipped_lane'' end;');

    -- SITE 0036:986 — a posted row records its entry (GM-8's layer 5 admits it).
    v_new := replace(v_new,
      '        case when v_item_outcome=''drafted'' then p_entry end,',
      '        case when v_item_outcome in (''drafted'',''posted'') then p_entry end,');

    -- SITE 0036:987 — and it carries NO fabricated CLR29 refusal token. False data, not merely
    -- missing, is the reason this site is on the list at all.
    v_new := replace(v_new,
      '        case when v_item_outcome<>''drafted'' then coalesce(p_refusal,',
      '        case when v_item_outcome not in (''drafted'',''posted'') then coalesce(p_refusal,');

    if v_new = v_src then
      raise exception 'F-A2 part3: no splice landed on %', v_sig using errcode='CLR10';
    end if;
    set role clara_fn_owner;
    execute replace(v_def, v_src, v_new);
    reset role;
  end loop;
end
$fa2p3_settle$;

-- =====================================================================================
-- LAYER 4 — clara.reconcile_sweep_runs()'s finalize bucketing (0011:2754-2762, a SINGLE
-- occurrence, never CoR'd — P4). The three existing counters keep their exact membership.
-- =====================================================================================
do $fa2p3_reconcile$
declare v_src text; v_new text; v_def text;
begin
  select p.prosrc, pg_get_functiondef(p.oid) into v_src, v_def
    from pg_proc p where p.oid='clara.reconcile_sweep_runs()'::regprocedure;
  v_new := replace(v_src,
    '        refused_count=(select count(*) from clara.sweep_run_items where run_id=sr.id
          and outcome in (''refused_budget'',''refused_attempts'')),',
    '        refused_count=(select count(*) from clara.sweep_run_items where run_id=sr.id
          and outcome in (''refused_budget'',''refused_attempts'')),
        -- F-A2 (Annex F layer 4): a posted item was counted in NONE of the three above, so the
        -- run summary under-totalled against expected_count. It gets its own counter rather
        -- than joining drafted_count, because a post is not a draft.
        posted_count=(select count(*) from clara.sweep_run_items where run_id=sr.id
          and outcome=''posted''),');
  if v_new = v_src then
    raise exception 'F-A2 part3: the finalize bucketing did not splice' using errcode='CLR10';
  end if;
  set role clara_fn_owner;
  execute replace(v_def, v_src, v_new);
  reset role;
end
$fa2p3_reconcile$;

-- =====================================================================================
-- TAIL CENSUS.
-- =====================================================================================
do $fa2p3_tail$
declare v_def text; v_src text; v_sig text; v_n int; v_key text;
begin
  -- Layers 1 and 5.
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
   where c.conrelid='clara.sweep_run_items'::regclass and c.conname='sweep_run_items_outcome_check';
  foreach v_key in array array['drafted','skipped_lane','refused_budget','refused_attempts','noop_existing','posted'] loop
    if position(''''||v_key||'''' in v_def) = 0 then
      raise exception 'F-A2 part3 tail: the outcome CHECK lost %: %', v_key, v_def using errcode='CLR10';
    end if;
  end loop;
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
   where c.conrelid='clara.sweep_run_items'::regclass and c.conname='ck_sweep_run_items_shape';
  if position('''posted''' in v_def) = 0 or position('entry_id IS NOT NULL' in v_def) = 0
     or position('entry_id IS NULL' in v_def) = 0 then
    raise exception 'F-A2 part3 tail: the shape CHECK is not the widened pair: %', v_def using errcode='CLR10';
  end if;
  -- BOTH DIRECTIONS, PROVED BY CONSTRUCTION rather than asserted: a rolled-back probe writes a
  -- posted row WITH its entry_id and a posted row WITHOUT one, and the second must refuse. This
  -- is GM-8's must-fail half, run at apply time: a five-layer fix proven by a four-layer fixture
  -- is exactly the defect GM-8 names.
  begin
    insert into clara.sweep_run_items(run_id,filing_id,firm_id,client_id,document_id,outcome,
        entry_id,tokens_reserved,tokens_spent)
      values(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),
        gen_random_uuid(),'posted',null,0,0);
    raise exception 'F-A2 part3 tail: a posted row with NO entry_id was ADMITTED — the shape constraint is not doing its half' using errcode='CLR10';
  exception
    when check_violation then null;                 -- the shape constraint refused: correct
    when foreign_key_violation then                 -- an FK fired first, so the shape half is unproven
      raise exception 'F-A2 part3 tail: the posted/no-entry probe hit an FK before the shape CHECK; the must-fail half is unproven' using errcode='CLR10';
  end;

  -- Layer 4's counter.
  if not exists(select 1 from information_schema.columns
      where table_schema='clara' and table_name='sweep_runs' and column_name='posted_count') then
    raise exception 'F-A2 part3 tail: sweep_runs.posted_count was not added' using errcode='CLR10';
  end if;
  if exists(select 1 from clara.sweep_runs where posted_count is null or posted_count <> 0) then
    raise exception 'F-A2 part3 tail: an existing run gained a non-zero posted_count' using errcode='CLR10';
  end if;

  -- Layers 2 and 3 + the four sites, in BOTH overloads. These are SPLICE-LANDED reads: they say
  -- the text this file meant to write is present, which is what an anchor-driven splice can
  -- honestly assert. Behaviour is proven by C.9 on the rig.
  foreach v_sig in array array['clara.settle_autodraft_task(uuid,text,bigint,uuid,jsonb,text)',
      'clara.settle_autodraft_task(uuid,text,bigint,uuid,jsonb)'] loop
    select p.prosrc into v_src from pg_proc p where p.oid=v_sig::regprocedure;
    foreach v_key in array array[
        '''failed'',''posted'')',
        'if p_outcome in (''drafted'',''posted'') and (p_entry is null',
        'exists(select 1 from clara.entry_post_receipts pr where pr.entry_id=e.id)',
        -- C4: the draft arm is FENCED on p_outcome='drafted'. Read positively, because the
        -- defect was an appended disjunct beside an unconditional one — a check for the new
        -- disjunct alone passed happily while the hole stayed open.
        '(p_outcome=''drafted''
              and (e.status=''draft''',
        'last_refusal=case when p_outcome in (''drafted'',''posted'') then null',
        'when ''posted'' then ''posted''',
        'case when v_item_outcome in (''drafted'',''posted'') then p_entry end',
        'case when v_item_outcome not in (''drafted'',''posted'') then coalesce(p_refusal,'] loop
      if position(v_key in v_src) = 0 then
        raise exception 'F-A2 part3 tail: % is missing %', v_sig, left(v_key,50) using errcode='CLR10';
      end if;
    end loop;
    -- C4, AND WHAT IS *NOT* CHECKED HERE, stated because the first cut of this tail tried it and
    -- it was the "spelling is not identity" defect (review law 3). A tripwire on the SUBSTRING
    -- `and (e.status='draft'` cannot decide this question at all: after the partition that text
    -- legitimately appears INSIDE the `(p_outcome='drafted' and (…))` arm, so its presence
    -- proves nothing and its absence would prove nothing either. A substring of a validator is a
    -- projection of the validator, not the validator.
    --
    -- THE BEHAVIOURAL PROOF THEREFORE LIVES IN THE BATTERY (C.9's three must-fail cells), where a
    -- real prestate exists: an admitted task whose entry is left DRAFT with no receipt, settled
    -- 'posted', must be REFUSED; the same entry under 'drafted' must be admitted; and an
    -- APPROVED entry with a receipt must be admitted under 'posted'. Building that prestate here
    -- would mean writing a filing and a journal_entries row inside a ceremony migration, firing
    -- that table's own trigger set at apply time on a live database — a worse thing to ship than
    -- the check is worth. The reads in this loop are SPLICE-LANDED reads, and are described as
    -- such rather than as behavioural evidence.
    -- EXTEND-NEVER-WEAKEN, read off the body: every arm that is not about `posted` survives.
    foreach v_key in array array['task_superseded','registry_superseded','registry_released',
        'run_superseded','superseded_by_human','refused_attempts',
        'autodraft task is not running','draft settlement entry not found'] loop
      if position(v_key in v_src) = 0 then
        raise exception 'F-A2 part3 tail: % lost the arm %', v_sig, v_key using errcode='CLR10';
      end if;
    end loop;
    -- The fabricated-CLR29 default still exists for the outcomes that genuinely have no
    -- refusal token; only `posted` and `drafted` are exempt from it now.
    if position('''clr'',''CLR29'',''reason'',v_item_outcome' in v_src) = 0 then
      raise exception 'F-A2 part3 tail: % lost the CLR29 default for non-post outcomes', v_sig using errcode='CLR10';
    end if;
  end loop;

  -- Layer 4's body.
  select p.prosrc into v_src from pg_proc p where p.oid='clara.reconcile_sweep_runs()'::regprocedure;
  if position('posted_count=(select count(*) from clara.sweep_run_items where run_id=sr.id' in v_src) = 0 then
    raise exception 'F-A2 part3 tail: reconcile_sweep_runs does not count posted items' using errcode='CLR10';
  end if;
  foreach v_key in array array['drafted_count=(select count(*)','skipped_count=(select count(*)',
      'refused_count=(select count(*)','token_reserved=(select coalesce(sum(tokens_reserved),0)'] loop
    if position(v_key in v_src) = 0 then
      raise exception 'F-A2 part3 tail: reconcile_sweep_runs lost %', v_key using errcode='CLR10';
    end if;
  end loop;

  -- INERT ON ARRIVAL: no row moved.
  if (select count(*)::text from clara.sweep_run_items) is distinct from (select v from _fa2p3_pre where k='items')
     or (select count(*)::text from clara.sweep_runs) is distinct from (select v from _fa2p3_pre where k='runs') then
    raise exception 'F-A2 part3 tail: the sweep population moved during an inert migration' using errcode='CLR10';
  end if;
  select count(*)::int into v_n from clara.sweep_run_items where outcome='posted';
  if v_n <> 0 then
    raise exception 'F-A2 part3 tail: % posted item(s) exist, expected 0 until PR-2 emits the outcome', v_n using errcode='CLR10';
  end if;

  raise notice 'F-A2 part3 tail: OK -- all FIVE layers of Annex F moved together (the outcome CHECK admits posted; ck_sweep_run_items_shape admits its entry_id and STILL refuses a posted row without one, proven here by a rolled-back must-fail probe rather than asserted; both settle overloads accept the outcome, validate the entry through its post receipt, clear last_refusal, record entry_id and write NO fabricated CLR29; reconcile_sweep_runs counts posted items into a new fourth counter) plus the four re-derived sites. Every non-posted arm of both overloads survives verbatim. BEHAVIOURALLY INERT: % item(s) over % run(s) unchanged, 0 posted rows, and nothing emits the outcome until PR-2''s autoDraft_v9.',
    (select v from _fa2p3_pre where k='items'), (select v from _fa2p3_pre where k='runs');
end
$fa2p3_tail$;
