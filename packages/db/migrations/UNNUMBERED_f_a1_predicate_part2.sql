-- UNNUMBERED_f_a1_predicate_part2.sql — F-A1 PR-1, part 2 of 3: THE TWO DISPATCH RECUTS.
-- =====================================================================================
-- APPLY AFTER UNNUMBERED_f_a1_identity_helper.sql and UNNUMBERED_f_a1_predicate.sql. Numbers are
-- claimed at MERGE time (hard constraint 10). THIS is the file that moves the hot path: it ships
-- a change of record of the two LIVE judgement bodies every invoice document already reaches.
--
--   §A  clara._invoice_fact_state_at(uuid,uuid) — now DISPATCHES on the passed extraction's
--       engine_kind. Witness kinds resolve the pinned pair and delegate to the frozen v1
--       predicate; the structured `clara-%` branch and the legacy OCR branch are carried through
--       BYTE-UNTOUCHED.
--   §B  clara._invoice_fact_state(uuid) — the flat 1-arg resolver becomes the CROSS-REGIME
--       dispatcher. WITHIN a regime the live ordering key is preserved VERBATIM (the task
--       `version_n desc, id desc` of 0016:2270 for legacy); `extracted_at` decides ONLY between
--       the two regimes' per-regime winners; a clock tie prefers the witness pair (M6).
--
-- WHY THE DISPATCH LIVES INSIDE THE TWO BODIES (design §3.3, D3). ~30+ live call sites across
-- 0011/0013/0015/0016 reach corroboration ONLY through `_invoice_fact_state` — autopost, the
-- duplicate-bill and sales walls, lane routing, the tie-outs — and `_write_entry_evidence`
-- hardcodes it at 0009:429. Repointing 30 callers is 30 chances to miss one, and a missed one
-- fails SILENTLY: the live resolver returns `'{}'::jsonb` for a document it cannot resolve and
-- every consumer's corroboration check then passes permissively (law 27(2)). Repointing the TWO
-- bodies makes the witness regime reachable everywhere at once, and §C proves those two are the
-- only bodies this file changed. `_write_entry_evidence` inherits the fix through §B
-- automatically, which is what makes the verified tier reachable for witness-born documents.
--
-- THE SPLICE DISCIPLINE, and why it is not transcription. Neither recut retypes a live body.
-- Both read `pg_get_functiondef` off the LIVE catalog, assert each anchor occurs EXACTLY ONCE,
-- `replace()` only at those anchors and `execute` the result — the 0017:1553 change-of-record
-- idiom, verbatim in shape. Everything this file does not name is preserved BY CONSTRUCTION
-- rather than by a careful human copy, and §C re-reads the committed catalog to prove the
-- untouched regions survived byte-for-byte. Every ANCHOR is newline-free, so a CRLF checkout
-- cannot move it; the replacement text's own newlines are this file's and are irrelevant.
--
-- D1 WRITE-QUIESCE OBLIGATION (packages/db/README.md "Deploy contract"). PostgreSQL runs an
-- in-flight PL/pgSQL call to completion on the body it STARTED with, so a call spanning this
-- migration silently runs the OLD body. The guard below refuses to apply while a runtime
-- heartbeat is fresh, because a ceremony step that lives only in prose is one somebody skips.
set local statement_timeout = '5min';   -- precautionary; nothing here scans a large relation
-- SEARCH PATH PINNED FOR THE WHOLE FILE. Load-bearing, not cosmetic: §C compares a prestate
-- function census against a post-DDL one, and a clara COMPOSITE argument type renders
-- qualified-or-bare depending on the session path — an unpinned path made two untouched
-- functions look like a deletion plus a creation in part 1's rig run. The census keys on OID as
-- well (a CREATE OR REPLACE preserves it, a CREATE mints a fresh one) — belt and buckle.
set local search_path = clara, pg_temp;

do $fa1_quiesce2$
declare v_component text; v_beat timestamptz;
begin
  if to_regclass('clara.runtime_heartbeats') is null then
    raise exception 'F-A1 QUIESCE GUARD: clara.runtime_heartbeats is ABSENT — the catalog has drifted from the migration chain (0006 creates it); refuse rather than guess whether a runtime is live'
      using errcode='CLR10';
  end if;
  select h.component, h.beat_at into v_component, v_beat from clara.runtime_heartbeats h
   where h.beat_at > now() - interval '90 seconds' order by h.beat_at desc limit 1;
  if v_component is not null then
    raise exception 'F-A1 QUIESCE GUARD: a runtime heartbeat is fresh (component %, beat_at %) — this file replaces clara._invoice_fact_state AND clara._invoice_fact_state_at, both live hot-path bodies, and an in-flight call finishes on the OLD body (D1); stop clara-runtime, wait for staleness (>90s), and re-apply',
      v_component, v_beat;
  end if;
end
$fa1_quiesce2$;

-- §0 PRESTATE. The two bodies are pinned BY PROSRC SHA-256, not by a marker string: a marker
-- proves a phrase is present, a hash proves the body is the one this file was authored against.
create temp table _fa1p2_pre(k text primary key, v text);
create temp table _fa1p2_pre_fn(oid oid primary key, sha text);
do $fa1_pre2$
declare v_src text; v_n int; v_key text;
begin
  -- (0.1) THE PREDICATE AND ITS CLOSURE ARE ALREADY IN PLACE. Dispatching to a body that does
  -- not exist would leave every witness document raising 42883 at read time.
  if to_regprocedure('clara.evaluate_witness_fact_state_v1(uuid,uuid,uuid)') is null then
    raise exception 'F-A1 part2 prestate: clara.evaluate_witness_fact_state_v1 is absent — apply UNNUMBERED_f_a1_identity_helper.sql and UNNUMBERED_f_a1_predicate.sql FIRST'
      using errcode='CLR10';
  end if;
  perform clara.verify_evaluator_freeze();

  -- (0.2) THE EXACT SIGNATURES EXIST, EXACTLY ONCE EACH. A recut that silently CREATEd a new
  -- overload instead of REPLACING the live one would leave the old body reachable and every arm
  -- below would still pass on the new one (0054:132-146's lesson).
  begin
    perform 'clara._invoice_fact_state_at(uuid,uuid)'::regprocedure;
    perform 'clara._invoice_fact_state(uuid)'::regprocedure;
  exception when others then
    raise exception 'F-A1 part2 prestate: one of the two resolver signatures does not exist' using errcode='CLR10';
  end;
  select count(*)::int into v_n from pg_proc p
   where p.pronamespace='clara'::regnamespace and p.proname in ('_invoice_fact_state','_invoice_fact_state_at');
  if v_n <> 2 then
    raise exception 'F-A1 part2 prestate: expected exactly 2 resolver functions, found % — an overload this file does not know about would keep the old shape reachable', v_n
      using errcode='CLR10';
  end if;

  -- (0.3) THE 2-ARG BODY BEING RECUT IS 0023:109-367, NOT 0016:2127. These markers are 0023's
  -- OWN additions (agreement-by-outcome, the bounded rounding, the structured branch guard). A
  -- body missing any of them is the pre-0023 one, and recutting THAT would revert the posting
  -- authority change wholesale — the exact 0050:20-30 incident class.
  select p.prosrc into v_src from pg_proc p where p.oid='clara._invoice_fact_state_at(uuid,uuid)'::regprocedure;
  foreach v_key in array array[
      'v_net_agreed := coalesce((v_env->''totals_reader''->''fields''->''invoice.total_excl_tax''->>''outcome'') = ''typed_collapsed'', false);',
      'and v_net_agreed and v_tax_agreed',
      'and coalesce(abs(v_rounding), 0) <= 99',
      'if v_engine like ''clara-%'' then'] loop
    if position(v_key in v_src) = 0 then
      raise exception 'F-A1 part2 prestate: the 2-arg body being recut is NOT 0023:109-367 — it is missing %. Refusing to splice a body this file cannot account for.', v_key
        using errcode='CLR10';
    end if;
  end loop;
  -- (0.4) BOTH SPLICE ANCHORS OCCUR EXACTLY ONCE. `replace()` is global: an anchor occurring
  -- twice would be spliced twice, and one occurring zero times would splice nothing while the
  -- file reported success. Counted, never assumed.
  v_n := (length(v_src) - length(replace(v_src, 'v_env jsonb; v_net_agreed boolean; v_tax_agreed boolean;', '')))
         / length('v_env jsonb; v_net_agreed boolean; v_tax_agreed boolean;');
  if v_n <> 1 then
    raise exception 'F-A1 part2 prestate: the 2-arg DECLARE anchor occurs % times (expected 1)', v_n using errcode='CLR10';
  end if;
  v_n := (length(v_src) - length(replace(v_src, 'select e2.id, e2.version_n, nullif(btrim(e2.envelope->>''corroboration_ineligible''),''''), e2.engine_id,', '')))
         / length('select e2.id, e2.version_n, nullif(btrim(e2.envelope->>''corroboration_ineligible''),''''), e2.engine_id,');
  if v_n <> 1 then
    raise exception 'F-A1 part2 prestate: the 2-arg BEGIN anchor occurs % times (expected 1)', v_n using errcode='CLR10';
  end if;
  -- (0.5) NOT ALREADY APPLIED — a second apply fails loudly, never silently re-ships a body
  -- somebody else may have since changed.
  if position('evaluate_witness_fact_state_v1' in v_src) <> 0 then
    raise exception 'F-A1 part2 prestate: clara._invoice_fact_state_at ALREADY dispatches to the witness predicate — already applied' using errcode='CLR10';
  end if;
  insert into _fa1p2_pre(k,v) values
    ('at_sha', encode(sha256(convert_to(v_src,'UTF8')),'hex')),
    -- The whole tail from the first statement onward; §C proves it survives VERBATIM, which
    -- covers the structured branch, the OCR belt set, the envelope and every conditional append.
    ('at_tail', substr(v_src, position('select e2.id, e2.version_n,' in v_src)));

  -- (0.6) THE 1-ARG BODY BEING RECUT IS 0016:2259-2273 — the FLAT select-then-delegate.
  select p.prosrc into v_src from pg_proc p where p.oid='clara._invoice_fact_state(uuid)'::regprocedure;
  foreach v_key in array array[
      'declare v_ext uuid;',
      'and e.version_n = t.version_n and e.engine_kind = ''invoice_facts''',
      'where t.document_id = p_document and t.lane in (''invoice_facts'',''local_facts'') and t.status = ''done''',
      'order by t.version_n desc, t.id desc limit 1;',
      'if v_ext is null then return ''{}''::jsonb; end if;',
      'return clara._invoice_fact_state_at(p_document, v_ext);'] loop
    if position(v_key in v_src) = 0 then
      raise exception 'F-A1 part2 prestate: the 1-arg body being recut is NOT the 0016:2259-2273 flat resolver — it is missing %', v_key using errcode='CLR10';
    end if;
  end loop;
  v_n := (length(v_src) - length(replace(v_src, 'if v_ext is null then return ''{}''::jsonb; end if;', '')))
         / length('if v_ext is null then return ''{}''::jsonb; end if;');
  if v_n <> 1 then
    raise exception 'F-A1 part2 prestate: the 1-arg splice anchor occurs % times (expected 1)', v_n using errcode='CLR10';
  end if;
  if position('llm_witness' in v_src) <> 0 then
    raise exception 'F-A1 part2 prestate: clara._invoice_fact_state already knows the witness lane — already applied' using errcode='CLR10';
  end if;
  insert into _fa1p2_pre(k,v) values
    ('one_sha', encode(sha256(convert_to(v_src,'UTF8')),'hex')),
    -- The legacy generation select VERBATIM: §C proves the within-regime ordering key did not
    -- move (M6 — a multi-generation legacy document's resolution must not silently shift).
    ('one_legacy_select',
      substr(v_src, position('select e.id into v_ext' in v_src),
             (position('order by t.version_n desc, t.id desc limit 1;' in v_src)
              + length('order by t.version_n desc, t.id desc limit 1;'))
             - position('select e.id into v_ext' in v_src)));

  -- (0.7) THE CONSUMER THIS DISPATCH IS FOR still calls the 1-arg resolver, and still mints the
  -- verified tier on the THREE-term conjunction. If either had moved, "the verified tier
  -- inherits the fix automatically" would be a claim about a body that no longer exists.
  select p.prosrc into v_src from pg_proc p where p.oid='clara._write_entry_evidence(uuid,uuid,jsonb)'::regprocedure;
  if position('v_state := clara._invoice_fact_state(p_document);' in v_src) = 0
     or position('when coalesce((v_state->>''corroborated'')::boolean,false)' in v_src) = 0
     or position('and v_field = ''invoice.total''' in v_src) = 0 then
    raise exception 'F-A1 part2 prestate: clara._write_entry_evidence is no longer the 0009:429/462-466 shape — the verified tier would NOT inherit this dispatch (design §3.3(c))'
      using errcode='CLR10';
  end if;

  -- (0.8) A whole-schema body snapshot, so the tail can NAME every body that moved.
  insert into _fa1p2_pre_fn(oid, sha)
  select p.oid, encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')
    from pg_proc p where p.pronamespace='clara'::regnamespace and p.prosrc is not null;
  select count(*)::int into v_n from _fa1p2_pre_fn;
  raise notice 'F-A1 part2 prestate: clean — both bodies at their authored shas, all four splice anchors unique, the verified-tier consumer intact, % clara bodies snapshotted', v_n;
end
$fa1_pre2$;

-- §A — DISPATCH RECUT 1: clara._invoice_fact_state_at(uuid,uuid) -----------------------
do $fa1_cor_at$
declare v_def text; v_next text;
begin
  select pg_get_functiondef('clara._invoice_fact_state_at(uuid,uuid)'::regprocedure) into v_def;
  v_next := replace(v_def,
$old$v_env jsonb; v_net_agreed boolean; v_tax_agreed boolean;$old$,
$new$v_env jsonb; v_net_agreed boolean; v_tax_agreed boolean; v_wk text; v_weid text; v_wvn int; v_wtext uuid; v_wvision uuid;$new$);
  if v_next = v_def then
    raise exception 'F-A1: _invoice_fact_state_at DECLARE splice matched nothing' using errcode='CLR10';
  end if;
  v_def := v_next;
  v_next := replace(v_def,
$old$select e2.id, e2.version_n, nullif(btrim(e2.envelope->>'corroboration_ineligible'),''), e2.engine_id,$old$,
$new$-- [F-A1] WITNESS DISPATCH (design §3.3, D3). Read the passed extraction's KIND before the
  -- legacy `engine_kind = 'invoice_facts'` filter runs. A witness kind resolves the pinned pair
  -- and delegates to the frozen v1 predicate; every other kind falls through to the body below,
  -- byte-untouched. BOTH directions resolve, because a caller may legitimately have bound either
  -- half: the document-wide authoritative pointer can land on the vision row.
  select e3.engine_kind, e3.engine_id, e3.version_n into v_wk, v_weid, v_wvn
    from clara.document_extractions e3
   where e3.id = p_extraction and e3.document_id = p_document and e3.status = 'done';
  if v_wk in ('llm_text_facts','llm_vision_facts') then
    select e4.id into v_wtext from clara.document_extractions e4
     where e4.document_id = p_document and e4.engine_id = v_weid and e4.version_n = v_wvn
       and e4.engine_kind = 'llm_text_facts' and e4.status = 'done';
    select e4.id into v_wvision from clara.document_extractions e4
     where e4.document_id = p_document and e4.engine_id = v_weid and e4.version_n = v_wvn
       and e4.engine_kind = 'llm_vision_facts' and e4.status = 'done';
    -- The predicate is pinned to BOTH ids and owns every refusal — absent sibling, cross-
    -- generation pair, silent read. It never returns '{}'.
    return clara.evaluate_witness_fact_state_v1(p_document, v_wtext, v_wvision);
  end if;

  select e2.id, e2.version_n, nullif(btrim(e2.envelope->>'corroboration_ineligible'),''), e2.engine_id,$new$);
  if v_next = v_def then
    raise exception 'F-A1: _invoice_fact_state_at BEGIN splice matched nothing' using errcode='CLR10';
  end if;
  execute v_next;
end
$fa1_cor_at$;

-- §B — DISPATCH RECUT 2: clara._invoice_fact_state(uuid), THE CROSS-REGIME DISPATCHER ---
-- THE PRECEDENCE RULE, and why it is not `version_n` (design §3.3, M6). `version_n` is a
-- PER-LANE counter (0026:216-217 — every mint is lane-scoped), so a witness pair starts at 1 and
-- a version_n rule would let a stale legacy read outrank it forever. The cross-regime clock is
-- therefore `extracted_at`, the 0017 trigger's own ordering key. AND WITHIN A REGIME THE LIVE
-- ORDERING KEY IS PRESERVED VERBATIM: the legacy select is not touched at all — not its join,
-- not its lane filter, not its `order by t.version_n desc, t.id desc`. The splice INSERTS a
-- block after it and leaves the original fall-through intact, so on a document with no witness
-- pair the body executes one extra SELECT that returns nothing and then the original two lines.
-- A CLOCK TIE PREFERS THE WITNESS PAIR (`>=`), stated because a tie is not impossible: the
-- witness writer stamps clock_timestamp() and a legacy row can land in the same microsecond.
-- WHY THE WITNESS RESOLVER DOES NOT REQUIRE A COMPLETE PAIR: resolution answers "which
-- generation governs", the PREDICATE answers "does it corroborate". A half-persisted pair (which
-- the atomic writer makes impossible, but which a reader must not assume away) resolves as the
-- newest witness generation and then REFUSES — falling through to a stale legacy read instead
-- would let an older generation govern a document a newer read has already touched.
do $fa1_cor_1$
declare v_def text; v_next text;
begin
  select pg_get_functiondef('clara._invoice_fact_state(uuid)'::regprocedure) into v_def;
  v_next := replace(v_def,
$old$declare v_ext uuid;$old$,
$new$declare v_ext uuid; v_ext_at timestamptz; v_wit uuid; v_wit_at timestamptz;$new$);
  if v_next = v_def then
    raise exception 'F-A1: _invoice_fact_state DECLARE splice matched nothing' using errcode='CLR10';
  end if;
  v_def := v_next;
  v_next := replace(v_def,
$old$if v_ext is null then return '{}'::jsonb; end if;$old$,
$new$-- [F-A1] WITNESS REGIME. The same task-generation join shape as the legacy select above and
  -- the SAME within-regime ordering key, over the llm_witness lane and the TEXT row — the
  -- canonical, region-bearing half of the pair (design §3.1).
  select tx.id, tx.extracted_at into v_wit, v_wit_at
  from clara.document_processing_tasks t
  join clara.document_extractions tx
    on tx.document_id = t.document_id and tx.engine_id = t.engine_id
   and tx.version_n = t.version_n and tx.engine_kind = 'llm_text_facts'
   and tx.status = 'done'
  where t.document_id = p_document and t.lane = 'llm_witness' and t.status = 'done'
  order by t.version_n desc, t.id desc limit 1;
  if v_wit is not null then
    if v_ext is null then return clara._invoice_fact_state_at(p_document, v_wit); end if;
    select e.extracted_at into v_ext_at from clara.document_extractions e where e.id = v_ext;
    -- A NULL legacy clock cannot outrank a real one: fail toward the regime whose timestamp we
    -- actually read, rather than letting an unreadable comparison pick the older body.
    if v_ext_at is null or v_wit_at >= v_ext_at then
      return clara._invoice_fact_state_at(p_document, v_wit);
    end if;
  end if;

  if v_ext is null then return '{}'::jsonb; end if;$new$);
  if v_next = v_def then
    raise exception 'F-A1: _invoice_fact_state BEGIN splice matched nothing' using errcode='CLR10';
  end if;
  execute v_next;
end
$fa1_cor_1$;

-- §C — TAIL CENSUS. The evidence a reviewer reads. -------------------------------------
do $fa1_tail2$
declare v_src text; v_pre text; v_n int; v_changed text; v_new text; v_callers text; v_c int; v_sites int;
begin
  -- (C1) EXACTLY TWO BODIES MOVED, AND THEY ARE THE TWO THIS FILE NAMES — derived from a
  -- whole-schema prosrc snapshot, not from a list somebody maintained.
  select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text collate "C") into v_changed
    from pg_proc p join _fa1p2_pre_fn pre on pre.oid = p.oid
   where pre.sha <> encode(sha256(convert_to(p.prosrc,'UTF8')),'hex');
  if coalesce(v_changed,'') <> '_invoice_fact_state(uuid), _invoice_fact_state_at(uuid,uuid)' then
    raise exception 'F-A1 part2 tail: the set of CHANGED clara bodies is [%] — expected exactly [_invoice_fact_state(uuid), _invoice_fact_state_at(uuid,uuid)]', coalesce(v_changed,'(none)')
      using errcode='CLR10';
  end if;
  select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text collate "C") into v_new
    from pg_proc p where p.pronamespace='clara'::regnamespace and p.prosrc is not null
     and not exists (select 1 from _fa1p2_pre_fn pre where pre.oid = p.oid);
  if v_new is not null then
    raise exception 'F-A1 part2 tail: it created new functions [%] — part 2 must only RECUT', v_new using errcode='CLR10';
  end if;

  -- (C2) THE UNTOUCHED REGIONS SURVIVED BYTE-FOR-BYTE. Not "the branch is still mentioned": the
  -- ENTIRE pre-recut tail of the 2-arg body, from its first statement to its last, must appear
  -- VERBATIM inside the new body — which covers the structured `clara-%` branch, the OCR belt
  -- set, the envelope assembly and every conditional append at once.
  select p.prosrc into v_src from pg_proc p where p.oid='clara._invoice_fact_state_at(uuid,uuid)'::regprocedure;
  select v into v_pre from _fa1p2_pre where k='at_tail';
  if position(v_pre in v_src) = 0 then
    raise exception 'F-A1 part2 tail: the pre-recut tail of clara._invoice_fact_state_at is NOT present verbatim in the new body — the structured branch and/or the OCR belt set moved'
      using errcode='CLR10';
  end if;
  if position('evaluate_witness_fact_state_v1' in v_src) = 0 then
    raise exception 'F-A1 part2 tail: clara._invoice_fact_state_at does not dispatch to the predicate' using errcode='CLR10';
  end if;
  -- The confidence term is still structurally absent (ADR-047 Q1; 0023:1245-1266's postverify,
  -- re-asserted here because a splice is exactly where one could be smuggled back in). COMMENTS
  -- ARE STRIPPED FIRST, and that is the finding not the convenience: 0023:113-116 documents in
  -- prose that `v_conf` is GONE, so a naive prosrc match reports the ABSENCE PROOF as the
  -- violation. A guard that reads the commentary is reading a projection of the code, not the
  -- code (review law 3). The rig caught this; reading did not.
  if regexp_replace(v_src, '--[^' || chr(10) || ']*', '', 'g') ~* 'engine_confidence|\mv_conf\M' then
    raise exception 'F-A1 part2 tail: a confidence term reappeared in the EXECUTABLE text of clara._invoice_fact_state_at' using errcode='CLR10';
  end if;

  -- (C3) THE WITHIN-REGIME ORDERING KEY DID NOT MOVE (M6), and the legacy fall-through is intact.
  select p.prosrc into v_src from pg_proc p where p.oid='clara._invoice_fact_state(uuid)'::regprocedure;
  select v into v_pre from _fa1p2_pre where k='one_legacy_select';
  if position(v_pre in v_src) = 0 then
    raise exception 'F-A1 part2 tail: the LEGACY generation select in clara._invoice_fact_state is not present verbatim — the within-regime ordering key moved (M6)'
      using errcode='CLR10';
  end if;
  if position('if v_ext is null then return ''{}''::jsonb; end if;' in v_src) = 0
     or position('return clara._invoice_fact_state_at(p_document, v_ext);' in v_src) = 0 then
    raise exception 'F-A1 part2 tail: the legacy fall-through of clara._invoice_fact_state was not preserved' using errcode='CLR10';
  end if;
  -- The witness resolver uses the SAME ordering key it inherited; a divergence here is how a
  -- "preserved verbatim" claim quietly becomes true of one regime and false of the other.
  v_n := (length(v_src) - length(replace(v_src, 'order by t.version_n desc, t.id desc limit 1;', '')))
         / length('order by t.version_n desc, t.id desc limit 1;');
  if v_n <> 2 then
    raise exception 'F-A1 part2 tail: the task ordering key appears % times in clara._invoice_fact_state (expected 2 — one per regime)', v_n using errcode='CLR10';
  end if;

  -- (C4) THE CALLER CENSUS — the population the dispatch spares, read from the LIVE catalog and
  -- NAMED, because "~30 call sites" is a claim and a count is evidence. TWO NUMBERS, because they
  -- are different facts and the design's "~30+" is the second: BODIES that call the resolver, and
  -- CALL SITES (individual call expressions) inside them. COMMENTS ARE STRIPPED FIRST — a body
  -- that merely NAMES the resolver in prose is not a caller, and counting it would inflate the
  -- census with the very kind of match that made the confidence probe misfire above.
  select count(*)::int, string_agg(x.proname, ', ' order by x.proname collate "C"),
         sum(x.sites)::int
    into v_c, v_callers, v_sites
    from (select p.proname,
                 (length(s.src) - length(replace(s.src, 'clara._invoice_fact_state', '')))
                   / length('clara._invoice_fact_state') as sites
            from pg_proc p
            cross join lateral (select regexp_replace(p.prosrc, '--[^' || chr(10) || ']*', '', 'g') as src) s
           where p.pronamespace='clara'::regnamespace and p.prosrc is not null
             and p.proname not in ('_invoice_fact_state','_invoice_fact_state_at')
             and position('clara._invoice_fact_state' in s.src) > 0) x;
  raise notice 'F-A1 caller census: % clara bodies / % call sites reach the resolver and were NOT changed: %', v_c, v_sites, coalesce(v_callers,'(none)');
  if coalesce(v_c,0) < 5 or coalesce(v_sites,0) < v_c then
    raise exception 'F-A1 part2 tail: caller census reads % bodies / % sites — the instrument is not measuring what it claims', coalesce(v_c,0), coalesce(v_sites,0) using errcode='CLR10';
  end if;
  -- A population count cannot say the IMPORTANT ones are in it, so the two whose behaviour this
  -- dispatch exists for are named individually.
  foreach v_src in array array['_write_entry_evidence','execute_rule_post'] loop
    if not exists (select 1 from pg_proc p where p.pronamespace='clara'::regnamespace
                     and p.proname = v_src and p.prosrc like '%_invoice_fact_state%') then
      raise exception 'F-A1 part2 tail: clara.% no longer reaches the resolver — the verified tier / autopost lane would NOT inherit this dispatch', v_src using errcode='CLR10';
    end if;
  end loop;

  -- (C5) THE FREEZE STILL REPRODUCES after two CoRs in the same transaction. Neither recut body
  -- is a closure member, so this must stay green — and asserting it here is what makes that a
  -- measured fact rather than an assumption.
  perform clara.verify_evaluator_freeze();
  raise notice 'F-A1 part2 tail: OK — exactly 2 bodies recut and 0 created; the 0023 tail and the 0016 legacy select preserved verbatim; no confidence term; the ordering key appears once per regime; % caller bodies / % call sites spared; evaluator freeze green', v_c, v_sites;
end
$fa1_tail2$;
