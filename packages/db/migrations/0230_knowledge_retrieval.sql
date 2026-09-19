-- 0230_knowledge_retrieval — #658 (refresh wave 2026-09-18; journeys B6 → B3 → C13): WHAT A RUN
-- READS BEFORE IT ACTS, WHICH VERSIONS IT READ, AND WHAT IT SAYS WHEN THE READ DID NOT SUCCEED.
-- =====================================================================================
-- Spec of record: issue #658 AC1–AC7. Domain words: CONTEXT.md — "Knowledge pack",
-- "Knowledge read status", "Knowledge read-set".
--
-- WHAT THIS FILE ADDS, IN ONE SENTENCE. SEVEN granted functions, ONE ungranted core and ONE
-- FORCE-RLS append-only relation, so that (a) a run can retrieve a client's knowledge CORE-FIRST
-- and BOUNDED instead of taking the whole recency dump, (b) what it actually read is RECORDED on
-- the attempt, and (c) both a human and the run can ask afterwards whether the basis has MOVED —
-- and, on C13's record detail, which Work read a record and at which version.
--
-- WHAT IT RECUTS: NOTHING. `clara.get_knowledge_pack` and `clara.get_context_pack` are not
-- touched, not repointed and not spliced — §0 pins EIGHT bodies by pre-image sha256 MEASURED on a
-- migrated rig (never transcribed from file text: `get_context_pack` is eleven generations deep
-- and `answer_work_question` is a five-migration splice, so a pin read from a creating file would
-- simply be wrong) and §Z re-reads all eight from the catalog after this file has run.
--
-- WHAT IT DOES NOT ADD, STATED SO A LATER READER DOES NOT GO LOOKING. #658 CAPTURES nothing,
-- CORRECTS nothing, PROMOTES nothing, accrues NO experience and writes NO wiki/OKF page — that is
-- #663's engine, and this file is only the DETECTOR. It registers NO domain event: an event with
-- no consumer is a shape #663 has to design, and 0220 §0 took the same posture. It mints NO
-- knowledge key and NO per-key side table (`clara.knowledge_keys` is append-only on UPDATE *and*
-- DELETE — 0192:185-189 — so a per-key property is a side table in 0220:368's shape, with owner
-- ratification first, and #658 was ruled to build none). It widens NO `accounting_work.purpose`
-- IN-list. It adds no part kind, no needs-you row kind and no route. #664 fans the per-client
-- retrieval out; #665 measures accuracy and pins thresholds; #673 owns freeform SQL and
-- `freeform_read` is NOT widened here; #913 owns `scope_default`'s drop, so this file reads
-- `clara.knowledge_keys` by `kind` and `authority_bearing` and NEVER by `scope_default`; #912
-- records role-at-the-time, this file records VERSIONS, not roles.
--
-- =====================================================================================
-- WHY `retrieve_knowledge` IS A NEW NAME BESIDE `get_knowledge_pack`, NOT A SPLICE INTO IT.
--
-- 0192:1458-1462 wrote the reason down when it minted the pack: "A NEW function, deliberately
-- (see the header): #658's progressive retrieval can supersede it without touching a spliced
-- body." This file is that ticket, and it keeps the bargain. `get_knowledge_pack` has live
-- callers in a FROZEN runtime closure (`lib/knowledge.mjs`, reached from `chatTurn_v19`/`v20`);
-- a splice would change what every shipped chat turn reads, at once, with no way to stage it. A
-- new name lets `claraWork_v5` and `chatTurn_v21` adopt the bounded read one body at a time while
-- the shipped bodies keep reading exactly what they read yesterday. 0220 §2 made the same call
-- for the same reason and said so in the same voice.
--
-- =====================================================================================
-- #783 STANDS, AND THIS FILE PROVES IT RATHER THAN PROMISING IT.
--
-- The owner's 2026-09-15 ruling lives at `.out-of-scope/human-read-of-knowledge-pack.md` — "The
-- register is the human surface; the pack is the model's" — and ARCHITECTURE:297-299 carries it.
-- `clara.retrieve_knowledge` is PACK-SHAPED, so the ruling binds it: it is granted to
-- `clara_runtime` and to NOBODY else, and §Z asserts the ABSENCE positively, naming #783 in the
-- failure message (0057's dark-grant rule, restated at 0192:1742-1745). The same holds for the
-- two runtime inspection twins. "One register, one pack, one answer" is then proven by a
-- BEHAVIOURAL parity cell across two personas (`p658.retrieve.shadow_parity`), never by a shared
-- grant. Re-opening #783 is an owner question, not a grant smuggled inside a slice.
--
-- THE SEVENTH DOOR DOES NOT BREACH THAT, AND HERE IS WHY IN ITS OWN VOICE.
-- `clara.list_work_knowledge_reads_for_record` IS granted to `clara_authenticated` because what it
-- returns is READ METADATA — which Work, at which `knowledge_version` and `as_of`, under which
-- `purpose`, with which face word, over which key NAMES — and NEVER a record's value, its
-- `applies_when`, its source bytes or any assembled pack content. DECISIONS.md:83 mandates exactly
-- this door for exactly this reason: "AC5's 'historical basis' half needs it and the relation has
-- no app-role SELECT". A `grant select` on `clara.work_knowledge_reads` is NOT an alternative to
-- it and §Z refuses one.
--
-- =====================================================================================
-- WHY `clara.work_knowledge_reads` CARRIES NO FOREIGN KEY TO `clara.accounting_work`.
--
-- Quoted from the measurement 0195 made, so a later "hardening" pass cannot add it back on the
-- grounds that nobody wrote the reason down (0195:254-268): "a foreign key takes `FOR KEY SHARE`
-- on the referenced row, `clara._record_journal_entry_core` holds `FOR UPDATE` on exactly that row
-- for the length of the posting transaction, and the two conflict — the review measured a trace
-- insert BLOCKED for 4001 ms behind a posting lock and then cancelled, which `traceSafely`
-- swallows, so the estate would lose diagnostic rows silently and precisely when a posting is
-- slow." A knowledge-read row is written on exactly that path, by a caller that swallows failures
-- for exactly the same reason, so it takes exactly the same decision. The binding the FK stands
-- for is not lost: `clara.record_work_knowledge_read` is a DEFINER verb that DERIVES work, firm
-- and client from the POSITIVE `agent_tasks → accounting_work` join 0195:1525-1529 uses verbatim,
-- and never from a parameter. The residual FKs are the ones 0195 kept and explained:
-- `(client_id, firm_id) → clara.clients(id, firm_id)` and `task_id → clara.agent_tasks(id)`.
--
-- LOCK ORDER (ARCHITECTURE §6, 0184): `accounting_plans → accounting_work → agent_tasks →
-- agent_interruptions`. Nothing in this file takes `for update`, `for share` or `for key share`
-- anywhere, and §Z asserts that from the catalogued source, so it cannot join that cycle from
-- either end.
--
-- =====================================================================================
-- THE FOUR FACE WORDS, AND THE ONE WORD THAT MAY NEVER REACH A HUMAN SURFACE.
--
-- `clara.work_knowledge_reads.status` admits EXACTLY `ok` / `partial` / `unknown` / `denied` —
-- the estate's live coverage vocabulary (`apps/web/components/clara/client-work-attention.tsx`
-- :65-71, "The WORD is the state; the tone only agrees with it"). The runtime envelope keeps its
-- own FROZEN words `ok`/`unavailable` (`packages/runtime/lib/knowledge.mjs:139`, `:156`); the
-- CHECK here REFUSES `unavailable` so that the runtime word can never leak into the register
-- through a column, and the mapping between the two vocabularies is exported ONCE, in
-- `packages/runtime/lib/knowledge-retrieval.mjs` as `faceStatusOf`.
--
-- =====================================================================================
-- PURPOSE IS RECORDED AND JOINS THE DRIFT JUDGEMENT. IT FILTERS NOTHING.
--
-- Said in this file's own voice, the way 0192:1452-1454 says it of the pack: `p_purpose` is
-- REQUIRED, RECORDED and ECHOED; it does not select which records come back, and two calls
-- differing only in their purpose return the SAME record set. That is a NON-GOAL held open on
-- purpose, not an oversight — a surface that implied a relevance model this estate does not have
-- would be the product lying — and `p658.retrieve.purpose_is_recorded_not_filtered` asserts it so
-- that the ticket which one day builds the filter has a red cell to flip rather than a silent
-- behaviour change to explain.
-- =====================================================================================

-- =====================================================================================
-- §0 — PRESTATE. Fail-closed, read from the CATALOG, measured on a migrated rig.
-- =====================================================================================
do $p658_pre$
declare v_sha text; v_n int;
begin
  -- (1) The substrate this file reads must exist and must be 0192's/0220's.
  if to_regclass('clara.knowledge_records') is null
     or to_regclass('clara.knowledge_keys') is null
     or to_regclass('clara.client_fact_keys') is null then
    raise exception '#658 prestate: the knowledge substrate is absent -- 0192 (and 0055) must apply first'
      using errcode='CLR10';
  end if;
  if to_regclass('clara.work_execution_traces') is null then
    raise exception '#658 prestate: clara.work_execution_traces is absent -- 0195 must apply first; the drift core falls back to its observed_revisions'
      using errcode='CLR10';
  end if;
  if to_regprocedure('clara._knowledge_row_json(clara.knowledge_records)') is null
     or to_regprocedure('clara._knowledge_legacy_rows(uuid,uuid)') is null then
    raise exception '#658 prestate: the shared knowledge row shapers are absent -- this file CALLS them and re-invents neither'
      using errcode='CLR10';
  end if;

  -- (2) EVERY NAME THIS FILE INSTALLS MUST BE WHOLLY ABSENT. A half-applied cohort is the failure
  --     mode rig-meta's "wholly present or wholly absent" rule exists to catch.
  select count(*)::int into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara'
     and p.proname in ('retrieve_knowledge','read_knowledge_record_for','read_knowledge_history_for',
                       'record_work_knowledge_read','work_knowledge_drift','work_knowledge_drift_for',
                       'list_work_knowledge_reads_for_record','_work_knowledge_drift_core');
  if v_n <> 0 then
    raise exception '#658 prestate: % of this file''s eight function names already exist', v_n
      using errcode='CLR10';
  end if;
  if to_regclass('clara.work_knowledge_reads') is not null then
    raise exception '#658 prestate: clara.work_knowledge_reads already exists' using errcode='CLR10';
  end if;

  -- (3) #783's BASE STATE, MEASURED BEFORE THIS FILE ADDS ANYTHING. §Z's negative assertion is
  --     only evidence if the ground it stands on was measured rather than read: 0192:1438-1441
  --     says the human arm of the pack holds no grant "today", and this is the measurement of
  --     "today" on the database this file is about to change.
  select count(*)::int into v_n from (
    select unnest(array['clara_authenticated','clara_agent_ro','clara_wake_interactive',
                        'clara_wake_proactive','clara_wake_bank','clara_wake_filing']) as r) g
   where has_function_privilege(g.r, 'clara.get_knowledge_pack(uuid,text,uuid)', 'EXECUTE');
  if v_n <> 0 then
    raise exception '#658 prestate: % non-runtime role(s) already hold EXECUTE on clara.get_knowledge_pack -- #783 has been re-litigated elsewhere; stop and read .out-of-scope/human-read-of-knowledge-pack.md', v_n
      using errcode='CLR10';
  end if;

  -- (4) THE EIGHT NON-REGRESSION PINS. This file recuts NOTHING, so these are not
  --     derive-from-this-text pins: they are the statement "0230 found these bodies exactly
  --     here". Every number below was MEASURED on the migrated rig by reading pg_proc.prosrc
  --     (0195:396-409's idiom) and NEVER transcribed from a creating migration --
  --     clara.get_context_pack is eleven generations deep (live at 0209:139) and
  --     clara.answer_work_question is a five-file splice (live at 0200:406, not 0180:761), so a
  --     pin read from file text would simply not match and this file would refuse to apply.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara.get_knowledge_pack(uuid,text,uuid)'::regprocedure;
  if v_sha <> '2deb725f00229f60a2fbbcc158fe656c5635cd220ec11727c182c39dc6c693fb' then
    raise exception '#658 prestate: clara.get_knowledge_pack has DRIFTED from its measured 0192 body (sha %) -- 0230 recuts it in NEITHER direction, so a drift here means another file moved it', v_sha
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara.list_client_knowledge(uuid)'::regprocedure;
  if v_sha <> '32999fef181b09989994d40a9c12956f6107798b55eae0b45fce2806d2e7b691' then
    raise exception '#658 prestate: clara.list_client_knowledge has DRIFTED from its measured 0192 body (sha %)', v_sha
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara._knowledge_legacy_rows(uuid,uuid)'::regprocedure;
  if v_sha <> '65f4f0f3db1ab64cfa2e4ef55cc850fa9f2176009ac5271c57030e18706ff35a' then
    raise exception '#658 prestate: clara._knowledge_legacy_rows has DRIFTED from the expression 0209 PINNED (sha %) -- 0209 becomes unreplayable and both shipped reads disagree about the five carried keys', v_sha
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara._knowledge_capture_core(uuid,text,uuid,text,jsonb,jsonb,date,date,text,text,jsonb,uuid,text,text,text,text)'::regprocedure;
  if v_sha <> '2c8526b82d54ac0aa49c77c3be277be5ecd9cad73df0fec63908d67a0681b01b' then
    raise exception '#658 prestate: clara._knowledge_capture_core has DRIFTED (sha %) -- #658 writes NO knowledge and must find the capture core exactly as it left it', v_sha
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara._knowledge_floor(text,text)'::regprocedure;
  if v_sha <> '5e4d80691226a6b0bc80dc45c50a6089db5f3a3f7e905f782a0c99c6db8820ca' then
    raise exception '#658 prestate: clara._knowledge_floor has DRIFTED (sha %)', v_sha using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara.capture_knowledge(text,jsonb,text,text,text,uuid,text,jsonb,date,date,jsonb)'::regprocedure;
  if v_sha <> 'b9f1cf6b4aa54c9b26dfad6d8a256d5812f3660bf5b65a39e399bbca9be1009e' then
    raise exception '#658 prestate: clara.capture_knowledge has DRIFTED (sha %)', v_sha using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara.get_context_pack(uuid,text)'::regprocedure;
  if v_sha <> '1a0312c9b80555a6e3cf41347b65ac52fa4e45d6a714e23d65ad6646336de81b' then
    raise exception '#658 prestate: clara.get_context_pack is not at its live 0209 body (sha %) -- 0230 does not touch ONE BYTE of the fixed preload and cannot be applied over a schema where somebody else has', v_sha
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara.answer_work_question(uuid,integer,jsonb,text)'::regprocedure;
  if v_sha <> '15a82c080d102e61ebdead2280577072a87c21720375174e83c86a7198fb07a7' then
    raise exception '#658 prestate: clara.answer_work_question is not at its live 0200 body (sha %) -- #885''s "your basis moved" is deliberately NOT spliced into this five-migration door', v_sha
      using errcode='CLR10';
  end if;

  -- (5) THE CORE TIER MUST BE SMALL AND ENUMERABLE. A required-read terminal over an unbounded
  --     core stops legitimate accounting, so the size is MEASURED here rather than assumed. The
  --     number is not pinned (a later ticket may seed a key); a core larger than the whole catalog
  --     is the shape that must never be reached.
  select count(*)::int into v_n from (
    select knowledge_key from clara.knowledge_keys where kind = 'policy' or authority_bearing
    union
    select fact_key from clara.client_fact_keys) c;
  if v_n > 40 then
    raise exception '#658 prestate: the CORE tier enumerates % keys -- a required-read terminal over a core this size stops legitimate accounting; re-open the tier definition before applying', v_n
      using errcode='CLR10';
  end if;

  raise notice '#658 prestate: clean -- none of the eight function names and no work_knowledge_reads relation exists; no non-runtime role holds EXECUTE on get_knowledge_pack (#783 base state); the eight non-regression bodies are at their measured pre-0230 sha256; the CORE tier enumerates % key(s).', v_n;
end $p658_pre$;

-- Everything §A-§H creates is created AS clara_fn_owner (0195:1264's idiom), so the relation and
-- every function belong to the role whose policy is the only one a FORCE-RLS relation carries.
-- Creating the table as the migration's login role would leave it owned by a superuser, and the
-- owner policy below would then govern nobody.
set role clara_fn_owner;

-- =====================================================================================
-- §A — clara.retrieve_knowledge. THE BOUNDED, CORE-FIRST, PERIOD-AWARE RUNTIME READ.
--
-- THE LANE PICKER IS clara.get_knowledge_pack's, COPIED AND NOT RE-INVENTED (0192:1474-1500),
-- because two pack-shaped reads that decide tenancy differently are two tenancy decisions. Its
-- own note explains why clara.jwt_sub() is asked first and why `current_setting('role')` and
-- `session_user` are both consulted: "no claim" can never be read as "therefore the runtime".
--
-- THREE TIERS, LABELLED ON EVERY RECORD AND SUMMARISED IN THE ENVELOPE.
--   `core`      — every live in-scope row whose key is `authority_bearing`, whose `kind` is
--                 'policy', or which is one of the FIVE legacy-carried keys. UNBOUNDED and never
--                 truncated. If the core cannot be read the whole answer is unavailable, and the
--                 caller (claraWork_v5) settles the run rather than reasoning without it.
--
-- AND THE DOOR IS ATOMIC, WHICH IS HOW D16's TERMINAL ACTUALLY FIRES. The three tiers are decided
-- by ONE CTE chain in ONE statement, this body catches nothing, and the envelope carries no
-- per-tier readability flag: the door either answers with every tier or RAISES. So "the core could
-- not be read" and "the read failed" are the same event today, and both reach claraWork_v5 as an
-- unavailable answer that stops the run — D16 is satisfied by construction, not by a flag. A
-- caller must NOT be written as though a core-only failure were a distinguishable outcome; if a
-- later revision wants to distinguish one, it adds the field here, in the durable place, and
-- p658.retrieve.envelope_is_atomic is the cell it has to change to do it.
--   `requested` — rows whose key the caller named in `p_keys`. An unknown key is CLR10
--                 `knowledge_key_unknown`, NEVER a silent empty: a run that asked for a key that
--                 does not exist has a bug, and answering `[]` hides it.
--   `remainder` — everything else, ordered (knowledge_key, recorded_at desc), capped at `p_limit`
--                 (bounded 1..200; outside → CLR10 `knowledge_limit_out_of_range`).
--
-- PERIOD. `p_as_of` defaults to the SERVER's Asia/Kuala_Lumpur calendar date (0220:816's idiom;
-- WORK-ORDER rule 8's calendar law), never a caller's clock. A row outside
-- [effective_from, effective_to] at `p_as_of` is MARKED `in_effect:false` and RETURNED, never
-- dropped — silently dropping a rule is how a run comes to reason without a fact that applies,
-- and the run needs to be able to say "this rule exists but not for the period I am working".
--
-- THE FIRM/CLIENT MERGE IS THE SHIPPED ONE, COPIED: the same per-applicability `not exists`
-- shadow both shipped reads use (0192:1355-1363, :1508-1519), and the legacy union through
-- clara._knowledge_legacy_rows -- CALLED, never changed (0209 pins that expression by sha).
-- =====================================================================================
create function clara.retrieve_knowledge(
    p_client uuid, p_purpose text, p_as_of date default null, p_keys text[] default null,
    p_limit int default 40, p_firm uuid default null) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp
  set plan_cache_mode = force_custom_plan as $read$
declare
  c record; v_firm uuid; v_actor uuid; v_as_of date; v_version bigint; v_key text;
  v_records jsonb; v_legacy jsonb;
  v_n_core int; v_n_req int; v_n_rem int; v_rem_total int; v_keys text[];
begin
  if nullif(btrim(coalesce(p_purpose, '')), '') is null then
    raise exception 'knowledge is retrieved for a stated purpose' using errcode = 'CLR10',
      detail = '{"reason":"knowledge_purpose_required"}';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 200 then
    raise exception 'the remainder tier is bounded between 1 and 200 records' using errcode = 'CLR10',
      detail = '{"reason":"knowledge_limit_out_of_range"}';
  end if;
  -- THE LANE IS PICKED FROM THE CALLER, exactly as clara.get_knowledge_pack picks it and for the
  -- same measured reason (0192:1474-1485): clara.jwt_sub() answers NULL for absent, unparseable
  -- and non-uuid claims (0002:339-352). The HUMAN arm exists so that a later grant would be a
  -- grant and not a second tenancy decision; §H grants this door to clara_runtime ONLY (#783).
  v_actor := clara.jwt_sub();
  if v_actor is not null then
    c := clara._human_ctx(clara.role_rank('viewer'));
    if p_firm is not null and p_firm <> c.firm then
      raise exception 'client not found' using errcode = 'CLR11';
    end if;
    v_firm := c.firm;
  elsif coalesce(current_setting('role', true), 'none') = 'clara_runtime'
        or session_user in ('clara_runtime', 'clara_runtime_login') then
    if p_firm is null then
      raise exception 'the runtime knowledge read names the firm it is reading'
        using errcode = 'CLR10', detail = '{"reason":"pack_firm_required"}';
    end if;
    v_firm := p_firm;
  else
    raise exception 'retrieving knowledge needs an identified human or the runtime'
      using errcode = 'CLR03', detail = '{"reason":"no_pack_context"}';
  end if;
  -- ONE refusal for absent and foreign alike: the client is looked up INSIDE the bound firm.
  if not exists (select 1 from clara.clients cl where cl.id = p_client and cl.firm_id = v_firm) then
    raise exception 'client not found' using errcode = 'CLR11';
  end if;
  -- AN UNKNOWN REQUESTED KEY IS A REFUSAL, NEVER A SILENT EMPTY.
  if p_keys is not null then
    if cardinality(p_keys) > 200 then
      raise exception 'at most 200 keys may be named in one retrieval' using errcode = 'CLR10',
        detail = '{"reason":"knowledge_limit_out_of_range"}';
    end if;
    foreach v_key in array p_keys loop
      if not exists (select 1 from clara.knowledge_keys k where k.knowledge_key = v_key)
         and not exists (select 1 from clara.client_fact_keys f where f.fact_key = v_key) then
        raise exception 'unknown knowledge key %', v_key using errcode = 'CLR10',
          detail = '{"reason":"knowledge_key_unknown"}';
      end if;
    end loop;
  end if;

  -- A PERIOD IS A FINITE DATE. `infinity` and `-infinity` are real date values, and an unbounded
  -- p_as_of was echoed by this door, marked every windowed row `in_effect:false` against, and then
  -- stamped permanently by the sole writer on a relation the estate can never delete. NO decade
  -- wall is taken: a firm may legitimately work a very old period, and refusing that would be a
  -- rule nobody asked for.
  if p_as_of is not null and not isfinite(p_as_of) then
    raise exception 'knowledge is retrieved for a finite period' using errcode = 'CLR10',
      detail = '{"reason":"knowledge_as_of_not_finite"}';
  end if;
  v_as_of := coalesce(p_as_of, (now() at time zone 'Asia/Kuala_Lumpur')::date);
  -- THE SAME WATERMARK EXPRESSION BOTH SHIPPED READS USE (0192:1333-1335, :1503-1506): over EVERY
  -- revision in scope, not over the emitted rows, so a withdrawal cannot move it backwards.
  select coalesce(max(r.knowledge_version), 0) into v_version
    from clara.knowledge_records r
   where r.firm_id = v_firm and (r.scope_kind = 'firm' or r.client_id = p_client);

  -- ONE PASS, three tiers decided by PRECEDENCE (core > requested > remainder) so a record
  -- appears exactly once and its tier is the strongest claim that is true of it. Only the
  -- REMAINDER is windowed: `rn <= p_limit` inside `kept`, with the untruncated `tier_total`
  -- carried alongside so `hidden_count` is the exact number withheld and never an estimate.
  with scope as (
    select clara._knowledge_row_json(r)
             || jsonb_build_object(
                  'key_description', kk.description, 'value_shape', kk.value_shape,
                  'authority_bearing', coalesce(kk.authority_bearing, false),
                  -- MARKED, NEVER DROPPED. A rule outside its window at p_as_of still reaches the
                  -- run, flagged, because silently dropping it is how a run reasons without a fact
                  -- that applies -- or, worse, applies one that has expired.
                  'in_effect', (r.effective_from is null or r.effective_from <= v_as_of)
                               and (r.effective_to is null or r.effective_to >= v_as_of)) as j,
           r.knowledge_key as knowledge_key, r.recorded_at as recorded_at,
           case
             when coalesce(kk.authority_bearing, false) or kk.kind = 'policy'
               or exists (select 1 from clara.client_fact_keys f where f.fact_key = r.knowledge_key)
               then 'core'
             when p_keys is not null and r.knowledge_key = any (p_keys) then 'requested'
             else 'remainder'
           end as tier
      from clara.knowledge_records r
      left join clara.knowledge_keys kk on kk.knowledge_key = r.knowledge_key
     where r.firm_id = v_firm and r.state = 'live' and r.superseded_at is null
       and ((r.scope_kind = 'client' and r.client_id = p_client)
         or (r.scope_kind = 'firm'
             -- Per-applicability, copied from the two shipped reads: a run that lost an
             -- unconditional firm default to a narrow client exception would reason without a fact
             -- that applies (0192:1355-1363, :1508-1519).
             and not exists (select 1 from clara.knowledge_records o
                              where o.firm_id = v_firm and o.scope_kind = 'client'
                                and o.client_id = p_client and o.state = 'live'
                                and o.knowledge_key = r.knowledge_key
                                and o.applies_when_digest = r.applies_when_digest)))
  ), ranked as (
    select s.*,
           row_number() over (partition by s.tier order by s.knowledge_key, s.recorded_at desc) as rn,
           count(*) over (partition by s.tier) as tier_total
      from scope s
  ), kept as (
    select * from ranked where tier <> 'remainder' or rn <= p_limit
  )
  select coalesce(jsonb_agg(k.j || jsonb_build_object('tier', k.tier)
                   order by case k.tier when 'core' then 0 when 'requested' then 1 else 2 end,
                            k.knowledge_key, k.recorded_at desc), '[]'::jsonb),
         count(*) filter (where k.tier = 'core')::int,
         count(*) filter (where k.tier = 'requested')::int,
         count(*) filter (where k.tier = 'remainder')::int,
         coalesce(max(k.tier_total) filter (where k.tier = 'remainder'), 0)::int
    into v_records, v_n_core, v_n_req, v_n_rem, v_rem_total
    from kept k;

  -- THE LEGACY UNION, through the ONE pinned expression both shipped reads call (0209 pins it by
  -- sha). Every carried key is a CORE key by construction (the five live in
  -- clara.client_fact_keys), the rows are NEVER shadowed by a knowledge record, and they carry no
  -- effective window, so `in_effect` is true for every period. They lead the array because the
  -- array is tier-ordered and they are core.
  select coalesce(jsonb_agg(e || jsonb_build_object('tier','core','in_effect',true)
                   order by e ->> 'knowledge_key'), '[]'::jsonb)
    into v_legacy
    from jsonb_array_elements(clara._knowledge_legacy_rows(v_firm, p_client)) e;
  v_records := v_legacy || v_records;
  v_n_core := v_n_core + jsonb_array_length(v_legacy);

  select coalesce(array_agg(distinct e ->> 'knowledge_key' order by e ->> 'knowledge_key'),
                  array[]::text[])
    into v_keys
    from jsonb_array_elements(v_records) e;

  return jsonb_build_object(
    'status', 'ok', 'client_id', p_client, 'firm_id', v_firm,
    -- RECORDED AND ECHOED, NOT A FILTER. See this file's header: two calls differing only here
    -- return the same record set, and p658.retrieve.purpose_is_recorded_not_filtered holds it.
    'purpose', p_purpose,
    'as_of', v_as_of,
    'knowledge_version', coalesce(v_version, 0)::text,
    'tiers', jsonb_build_object('core', v_n_core, 'requested', v_n_req, 'remainder', v_n_rem),
    'keys', to_jsonb(v_keys),
    'truncated', v_rem_total > v_n_rem,
    'hidden_count', v_rem_total - v_n_rem,
    'records', v_records);
end $read$;
alter function clara.retrieve_knowledge(uuid,text,date,text[],int,uuid) owner to clara_fn_owner;
revoke all on function clara.retrieve_knowledge(uuid,text,date,text[],int,uuid) from public;
comment on function clara.retrieve_knowledge(uuid,text,date,text[],int,uuid) is
  '#658: the bounded, CORE-FIRST, period-aware knowledge read a run takes before it acts. Three '
  'tiers (core unbounded, requested unbounded, remainder capped at p_limit 1..200), every record '
  'marked in_effect at p_as_of and never dropped for being out of effect, the shipped '
  'per-applicability firm/client shadow and the pinned legacy union. p_purpose is RECORDED and '
  'ECHOED and filters NOTHING. clara_runtime ONLY -- #783: the register is the human surface, the '
  'pack is the model''s (.out-of-scope/human-read-of-knowledge-pack.md).';

-- =====================================================================================
-- §B — THE TWO RUNTIME INSPECTION TWINS. Actor-explicit `_for` shapes, clara_runtime only.
--
-- They answer "what IS this record" and "how did it GET here" for a record the run has already
-- seen a key for, and they return the source PINS and the source document's METADATA — id,
-- filename, kind, bytes_verified_at, legal_hold — and NEVER the document's bytes. A record
-- outside the named firm/client answers CLR11, identically to one that does not exist: there is
-- no existence oracle here either.
-- =====================================================================================
create function clara.read_knowledge_record_for(p_firm uuid, p_client uuid, p_record uuid)
  returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp
  set plan_cache_mode = force_custom_plan as $read$
declare r clara.knowledge_records; k record; d record;
begin
  if p_firm is null or p_client is null or p_record is null then
    raise exception 'the runtime record read names firm, client and record' using errcode = 'CLR10',
      detail = '{"reason":"pack_firm_required"}';
  end if;
  select * into r from clara.knowledge_records x
   where x.record_id = p_record and x.firm_id = p_firm and x.superseded_at is null
     and (x.scope_kind = 'firm' or x.client_id = p_client);
  if not found then
    raise exception 'knowledge record not found' using errcode = 'CLR11',
      detail = '{"reason":"record_not_in_scope"}';
  end if;
  select * into k from clara.knowledge_keys where knowledge_key = r.knowledge_key;
  select d2.id, d2.original_filename, d2.document_kind, d2.bytes_verified_at, d2.legal_hold
    into d from clara.documents d2 where d2.id = r.source_document_id and d2.firm_id = p_firm;
  return jsonb_build_object(
    'status', 'ok', 'record_id', r.record_id, 'client_id', r.client_id, 'firm_id', r.firm_id,
    'record', clara._knowledge_row_json(r),
    'key', jsonb_build_object('knowledge_key', k.knowledge_key, 'kind', k.kind,
      'value_shape', k.value_shape, 'validated_against', k.validated_against,
      'description', k.description, 'authority_bearing', k.authority_bearing),
    -- THE PINS AND THE DOCUMENT'S METADATA. There is no bytes key here and there never will be:
    -- the byte door is 0190's and it is not reachable from a knowledge read.
    'source', jsonb_build_object('document_id', r.source_document_id,
      'extraction_id', r.source_extraction_id, 'region_id', r.source_region_id,
      'field_path', r.source_field_path, 'work_id', r.source_work_id),
    'source_document', case when d.id is null then null else jsonb_build_object(
      'id', d.id, 'filename', d.original_filename, 'kind', d.document_kind,
      'bytes_verified_at', d.bytes_verified_at, 'legal_hold', d.legal_hold) end);
end $read$;
alter function clara.read_knowledge_record_for(uuid,uuid,uuid) owner to clara_fn_owner;
revoke all on function clara.read_knowledge_record_for(uuid,uuid,uuid) from public;
comment on function clara.read_knowledge_record_for(uuid,uuid,uuid) is
  '#658: the RUN''s inspection of one knowledge record -- its current revision, its source pins '
  'and the source document''s METADATA (never its bytes). Actor-explicit (p_firm, p_client, '
  'p_record, in that order), clara_runtime ONLY, CLR11 with no existence oracle outside scope.';

create function clara.read_knowledge_history_for(p_firm uuid, p_client uuid, p_record uuid)
  returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp
  set plan_cache_mode = force_custom_plan as $read$
declare v jsonb; v_key text;
begin
  if p_firm is null or p_client is null or p_record is null then
    raise exception 'the runtime history read names firm, client and record' using errcode = 'CLR10',
      detail = '{"reason":"pack_firm_required"}';
  end if;
  select x.knowledge_key into v_key from clara.knowledge_records x
   where x.record_id = p_record and x.firm_id = p_firm
     and (x.scope_kind = 'firm' or x.client_id = p_client)
   limit 1;
  if v_key is null then
    raise exception 'knowledge record not found' using errcode = 'CLR11',
      detail = '{"reason":"record_not_in_scope"}';
  end if;
  select coalesce(jsonb_agg(clara._knowledge_row_json(r) order by r.revision_n), '[]'::jsonb)
    into v
    from clara.knowledge_records r
   where r.record_id = p_record and r.firm_id = p_firm;
  return jsonb_build_object('status', 'ok', 'record_id', p_record, 'knowledge_key', v_key,
    'revisions', v);
end $read$;
alter function clara.read_knowledge_history_for(uuid,uuid,uuid) owner to clara_fn_owner;
revoke all on function clara.read_knowledge_history_for(uuid,uuid,uuid) from public;
comment on function clara.read_knowledge_history_for(uuid,uuid,uuid) is
  '#658: the RUN''s half of AC5''s historical basis -- every revision of one knowledge record, '
  'oldest first. Actor-explicit (p_firm, p_client, p_record), clara_runtime ONLY, CLR11 with no '
  'existence oracle outside scope.';

-- =====================================================================================
-- §C — clara.work_knowledge_reads. THE READ-SET, RECORDED ON THE ATTEMPT.
--
-- FORCE RLS, owner policy only, append-only, and NO PRIVILEGE OF ANY KIND FOR ANY APPLICATION
-- ROLE — SELECT included. That is the same posture clara.work_execution_traces takes and for the
-- same measured reason (0195:1352-1362): PostgREST serves the `clara` schema, so a SELECT grant
-- would put every row in front of any role holding it, below every door's floor. The human path
-- in is the SEVENTH door in §F, which is SECURITY DEFINER; the relation gains nothing.
--
-- NO FOREIGN KEY TO clara.accounting_work -- see this file's DEADLOCK DISCIPLINE header, which
-- quotes 0195's measurement. The binding is the positive task→work join in the ONE writer.
-- =====================================================================================
create table clara.work_knowledge_reads (
  id                 uuid        primary key default gen_random_uuid(),
  firm_id            uuid        not null references clara.firms(id),
  client_id          uuid        not null,
  work_id            uuid        not null,
  task_id            uuid        not null references clara.agent_tasks(id),
  run_id             text        not null check (btrim(run_id) <> '' and length(run_id) <= 128),
  seq                int         not null check (seq >= 1),
  read_at            timestamptz not null default now(),
  -- RECORDED AND ECHOED. The purpose joins the drift judgement (a reader can see that a run read
  -- for `accounting_work` and a chat turn read for `chat_turn`); it filtered nothing on the way in.
  purpose            text        not null check (btrim(purpose) <> '' and length(purpose) <= 64),
  as_of              date        not null,
  -- TEXT, for 0192's reason: a bigint through a JSON number is a lossy claim.
  knowledge_version  text        not null check (knowledge_version ~ '^[0-9]{1,19}$'),
  -- THE KEY SET ACTUALLY RETURNED. Bounded in cardinality by the relation; the per-element
  -- grammar is checked by the sole writer, which is the only thing that can insert here.
  keys               text[]      not null default '{}'::text[] check (cardinality(keys) <= 400),
  -- THREE COUNTS, AND THE COLUMN SAYS SO. `keys` is walled by a grammar and a cardinality for the
  -- reason §D states -- "the read-set must not become a payload slot by the back door, which is
  -- the whole point of the closed vocabulary 0195 put on observed_revisions" -- and a jsonb that
  -- only had to be an OBJECT was that back door: this relation is APPEND-ONLY (no row here can
  -- ever be deleted) and both drift doors hand `tiers` back verbatim to the human lane and the
  -- runtime lane alike. The vocabulary is closed and every value is a non-negative integer.
  tiers              jsonb       not null default '{}'::jsonb
    check (jsonb_typeof(tiers) = 'object'
       and tiers - array['core','requested','remainder']::text[] = '{}'::jsonb
       and (not (tiers ? 'core')
            or (jsonb_typeof(tiers -> 'core') = 'number' and tiers ->> 'core' ~ '^[0-9]{1,9}$'))
       and (not (tiers ? 'requested')
            or (jsonb_typeof(tiers -> 'requested') = 'number' and tiers ->> 'requested' ~ '^[0-9]{1,9}$'))
       and (not (tiers ? 'remainder')
            or (jsonb_typeof(tiers -> 'remainder') = 'number' and tiers ->> 'remainder' ~ '^[0-9]{1,9}$'))),
  -- THE DIGEST OF THE FACTS THIS ROW RECORDS. Not a hash for storage's sake: the relation is
  -- append-only and keyed by (work, run, seq), so a REPLAY that carries different facts can neither
  -- overwrite the row nor be told apart from an identical one -- and "first attempt ok, WDK
  -- re-execution denied because a record was withdrawn mid-flight" is exactly the replay that
  -- differs. The writer returns it, and whether it matched, so silence is not the answer.
  payload_digest     text        not null check (payload_digest ~ '^[0-9a-f]{64}$'),
  records_shown      int         not null check (records_shown >= 0),
  truncated          boolean     not null,
  -- THE FOUR FACE WORDS, AND `unavailable` IS REFUSED BY NAME. The runtime envelope keeps its own
  -- frozen vocabulary (lib/knowledge.mjs:139, :156); the mapping between the two is exported once
  -- as faceStatusOf. No column and no face in this estate ever says `unavailable`.
  status             text        not null check (status in ('ok','partial','unknown','denied')),
  reason             text        check (reason is null or (btrim(reason) <> '' and length(reason) <= 200)),
  created_at         timestamptz not null default now(),
  constraint fk_work_knowledge_reads_client foreign key (client_id, firm_id)
    references clara.clients(id, firm_id),
  -- ONE row per (work, run, seq) — the structural half of "a replayed step does not double-record".
  constraint uq_work_knowledge_reads_run_seq unique (work_id, run_id, seq)
);
comment on table clara.work_knowledge_reads is
  '#658: one durable row per knowledge READ an accounting-work run made -- which keys, which '
  'tiers, at which knowledge_version and as_of, and what the read PRODUCED in the estate''s four '
  'face words (ok|partial|unknown|denied; `unavailable` is refused by CHECK). Written ONLY by '
  'clara.record_work_knowledge_read; read by clara.work_knowledge_drift / _for and by '
  'clara.list_work_knowledge_reads_for_record. NO foreign key to clara.accounting_work (0195''s '
  'measured lock finding) and NO privilege for any application role, SELECT included.';

create index ix_work_knowledge_reads_work on clara.work_knowledge_reads(work_id, read_at desc);
create index ix_work_knowledge_reads_firm on clara.work_knowledge_reads(firm_id, read_at desc);
create index ix_work_knowledge_reads_keys on clara.work_knowledge_reads using gin (keys);

alter table clara.work_knowledge_reads enable row level security;
alter table clara.work_knowledge_reads force row level security;
create policy p_work_knowledge_reads_owner on clara.work_knowledge_reads
  for all to clara_fn_owner using (true) with check (true);

create function clara._tf_work_knowledge_read_append_only() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  raise exception 'a knowledge read-set row is append-only'
    using errcode = 'CLR08',
      detail = '{"reason":"work_knowledge_read_immutable","column":"*"}';
end $$;
revoke all on function clara._tf_work_knowledge_read_append_only() from public;
create trigger t_work_knowledge_reads_append_only
  before update or delete on clara.work_knowledge_reads
  for each row execute function clara._tf_work_knowledge_read_append_only();
create trigger t_work_knowledge_reads_no_truncate before truncate on clara.work_knowledge_reads
  for each statement execute function clara._tf_no_truncate();

-- =====================================================================================
-- §D — clara.record_work_knowledge_read. THE ONE WRITER, clara_runtime only.
--
-- IT DERIVES work, firm and client FROM THE TASK, never from a parameter, using the POSITIVE join
-- 0195:1525-1529 uses verbatim. A task of another kind, or one whose Work it cannot reach, is a
-- not-found and never a differently-shaped answer — which is the binding the absent FK would have
-- carried, enforced by the only writer instead of by a lock the posting path fights.
--
-- REPLAY-IDEMPOTENT BY (work, run, seq): a WDK re-execution of the read step re-records the same
-- row and gets the ORIGINAL id back rather than a second row or a unique violation.
-- =====================================================================================
create function clara.record_work_knowledge_read(
    p_task uuid, p_run text, p_seq int, p_purpose text, p_as_of date,
    p_knowledge_version text, p_keys text[], p_tiers jsonb, p_records_shown int,
    p_truncated boolean, p_status text, p_reason text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  w record; v_id uuid; v_keys text[]; v_key text; v_tiers jsonb; v_as_of date;
  v_reason text; v_digest text; v_stored text; v_replayed boolean := false;
begin
  if p_task is null or p_run is null or btrim(p_run) = '' then
    raise exception 'a knowledge read names a task and a run' using errcode = 'CLR10',
      detail = '{"reason":"invalid_knowledge_read","field":"p_run","constraint":"required"}';
  end if;
  if p_seq is null or p_seq < 1 then
    raise exception 'a knowledge read step number starts at 1' using errcode = 'CLR10',
      detail = '{"reason":"invalid_knowledge_read","field":"p_seq","constraint":"positive"}';
  end if;
  if nullif(btrim(coalesce(p_purpose, '')), '') is null then
    raise exception 'a knowledge read is recorded for a stated purpose' using errcode = 'CLR10',
      detail = '{"reason":"knowledge_purpose_required"}';
  end if;
  -- THE FOUR FACE WORDS, DIAGNOSED HERE AND WALLED BY THE CHECK. `unavailable` is the runtime's
  -- own word and is named in the refusal so a caller that sent it learns the mapping exists.
  if p_status is null or p_status not in ('ok','partial','unknown','denied') then
    raise exception 'a knowledge read status is one of ok, partial, unknown, denied (never "unavailable" -- map it with faceStatusOf)'
      using errcode = 'CLR10',
        detail = jsonb_build_object('reason','invalid_knowledge_read','field','p_status',
          'constraint','vocabulary','status',p_status)::text;
  end if;
  if p_knowledge_version is null or p_knowledge_version !~ '^[0-9]{1,19}$' then
    raise exception 'a knowledge version is the watermark as a decimal string' using errcode = 'CLR10',
      detail = '{"reason":"invalid_knowledge_read","field":"p_knowledge_version","constraint":"digits"}';
  end if;
  v_keys := coalesce(p_keys, array[]::text[]);
  if cardinality(v_keys) > 400 then
    raise exception 'a read-set names at most 400 keys' using errcode = 'CLR10',
      detail = '{"reason":"invalid_knowledge_read","field":"p_keys","constraint":"cardinality"}';
  end if;
  -- THE PER-ELEMENT GRAMMAR. A key is a catalog token, never free text: the read-set must not
  -- become a payload slot by the back door, which is the whole point of the closed vocabulary
  -- 0195 put on observed_revisions.
  --
  -- AND THIS GRAMMAR IS STRICTER THAN THE CATALOG'S OWN, WHICH A LATER MIGRATION MUST KNOW.
  -- clara.knowledge_keys.knowledge_key and clara.client_fact_keys.fact_key carry only
  -- CHECK (btrim(...) <> ''), so a future migration COULD mint `Sst_Regime`, `sst-regime` or a
  -- 64-character key — and every read touching a client that holds it would then be retrievable
  -- and UNRECORDABLE: clara.retrieve_knowledge returns it, this writer refuses it CLR10
  -- `grammar_key`. All 13 live knowledge_keys and all 5 client_fact_keys conform today (measured),
  -- so nothing is broken; this is the wall, written down where the next key-minting migration will
  -- look. Widening it is a decision, not a bug fix.
  foreach v_key in array v_keys loop
    if v_key is null or v_key !~ '^[a-z][a-z0-9_]{0,62}$' then
      raise exception 'a read-set key is a lowercase catalog token' using errcode = 'CLR10',
        detail = '{"reason":"invalid_knowledge_read","field":"p_keys","constraint":"grammar_key"}';
    end if;
  end loop;
  v_tiers := coalesce(p_tiers, '{}'::jsonb);
  if jsonb_typeof(v_tiers) <> 'object' then
    raise exception 'the tier summary is an object of counts' using errcode = 'CLR10',
      detail = '{"reason":"invalid_knowledge_read","field":"p_tiers","constraint":"object"}';
  end if;
  -- THE TIER SUMMARY IS VALIDATED THE WAY `p_keys` IS, and for the same stated reason: an
  -- unvalidated jsonb on an append-only relation that both drift doors hand back verbatim is a
  -- payload slot by the back door. Closed vocabulary, non-negative integers, nothing else.
  if exists (select 1 from jsonb_object_keys(v_tiers) k(k)
              where k.k not in ('core','requested','remainder')) then
    raise exception 'a tier summary names only core, requested and remainder' using errcode = 'CLR10',
      detail = '{"reason":"invalid_knowledge_read","field":"p_tiers","constraint":"tiers_shape"}';
  end if;
  if exists (select 1 from jsonb_each(v_tiers) e
              where jsonb_typeof(e.value) <> 'number' or (e.value #>> '{}') !~ '^[0-9]{1,9}$') then
    raise exception 'a tier count is a non-negative integer' using errcode = 'CLR10',
      detail = '{"reason":"invalid_knowledge_read","field":"p_tiers","constraint":"tiers_shape"}';
  end if;
  -- THE PERIOD IS A DATE, AND A DATE IS FINITE. `infinity` is a real date value this column would
  -- have accepted and this relation could never have deleted; the read door takes the same wall.
  if p_as_of is not null and not isfinite(p_as_of) then
    raise exception 'a knowledge read names a finite period' using errcode = 'CLR10',
      detail = '{"reason":"invalid_knowledge_read","field":"p_as_of","constraint":"finite"}';
  end if;
  v_as_of := coalesce(p_as_of, (now() at time zone 'Asia/Kuala_Lumpur')::date);
  v_reason := nullif(btrim(coalesce(p_reason, '')), '');

  -- 0195:1525-1529's POSITIVE JOIN, VERBATIM. Nothing here is taken from a parameter.
  select aw.id as work_id, aw.firm_id, aw.client_id into w
    from clara.agent_tasks t
    join clara.accounting_work aw on aw.id = t.work_id and aw.firm_id = t.firm_id
   where t.id = p_task and t.kind = 'accounting_work';
  if not found then
    raise exception 'accounting work not found for this task' using errcode = 'CLR11',
      detail = '{"reason":"work_not_found"}';
  end if;

  -- THE FACTS THIS ROW RECORDS, HASHED ONCE. jsonb normalises key order, so the digest is a
  -- function of the facts and not of how a caller spelled them.
  v_digest := encode(sha256(convert_to(jsonb_build_object(
      'purpose', btrim(p_purpose), 'as_of', v_as_of, 'knowledge_version', p_knowledge_version,
      'keys', to_jsonb(v_keys), 'tiers', v_tiers,
      'records_shown', coalesce(p_records_shown, 0), 'truncated', coalesce(p_truncated, false),
      'status', p_status, 'reason', v_reason)::text, 'utf8')), 'hex');

  insert into clara.work_knowledge_reads(firm_id, client_id, work_id, task_id, run_id, seq,
      purpose, as_of, knowledge_version, keys, tiers, payload_digest, records_shown, truncated,
      status, reason)
    values (w.firm_id, w.client_id, w.work_id, p_task, btrim(p_run), p_seq,
      btrim(p_purpose), v_as_of,
      p_knowledge_version, v_keys, v_tiers, v_digest, coalesce(p_records_shown, 0),
      coalesce(p_truncated, false), p_status, v_reason)
    on conflict (work_id, run_id, seq) do nothing
    returning id into v_id;
  -- A REPLAY IS NAMED, AND SO IS A REPLAY THAT DISAGREES. The row cannot be updated (append-only),
  -- and this verb must never FAIL a run for a diagnostic write, so the receipt carries the
  -- difference instead of swallowing it: `replayed` says a row was already there, `payload_match`
  -- says whether the facts were the same ones, and `stored_digest` names what is actually on file.
  -- clara._reserve_op raises CLR10 on the same mismatch because an op-key governs a WRITE; this
  -- governs a RECORD OF A READ, so it reports rather than refuses.
  if v_id is null then
    v_replayed := true;
    select r.id, r.payload_digest into v_id, v_stored from clara.work_knowledge_reads r
     where r.work_id = w.work_id and r.run_id = btrim(p_run) and r.seq = p_seq;
  end if;
  return jsonb_build_object('status', 'ok', 'read_id', v_id, 'work_id', w.work_id,
    'client_id', w.client_id, 'firm_id', w.firm_id,
    'replayed', v_replayed, 'payload_digest', v_digest,
    'stored_digest', coalesce(v_stored, v_digest),
    'payload_match', coalesce(v_stored, v_digest) = v_digest);
end $$;
alter function clara.record_work_knowledge_read(uuid,text,int,text,date,text,text[],jsonb,int,boolean,text,text)
  owner to clara_fn_owner;
revoke all on function clara.record_work_knowledge_read(uuid,text,int,text,date,text,text[],jsonb,int,boolean,text,text)
  from public;
comment on function clara.record_work_knowledge_read(uuid,text,int,text,date,text,text[],jsonb,int,boolean,text,text) is
  '#658: record ONE knowledge read of one accounting-work run. Derives work/firm/client from the '
  'positive agent_tasks -> accounting_work join (never from a parameter), refuses a status outside '
  'the four face words, a tier summary outside {core,requested,remainder} of non-negative integers '
  'and a non-finite as_of, and is replay-idempotent by (work, run, seq). A replay is NAMED: the '
  'receipt carries replayed / payload_digest / stored_digest / payload_match, so a re-execution '
  'that carried DIFFERENT facts is not answered with a silent ok. clara_runtime ONLY.';

-- =====================================================================================
-- §E — DRIFT: TWO DOORS OVER ONE UNGRANTED CORE.
--
-- The house rule (0192/0216/0220): a HUMAN door is clara_authenticated + a _human_ctx floor and
-- takes its firm from the session; an AGENT door is clara_runtime + an actor-explicit `_for` twin
-- that NAMES the firm. Both delegate to one ungranted core so the two lanes can never answer
-- differently about the same Work.
--
-- THE ENVELOPE ALSO CARRIES WHAT THE LAST ATTEMPT READ (`read`), because B3's Work detail asks
-- "what did this run read" and "has it moved since" as one question, and an eighth door would be a
-- second read of one relation for one panel. It is READ METADATA ONLY -- key NAMES, tier counts,
-- the face word and its reason -- exactly the #783 line the seventh door draws. `read` is null on
-- the trace arm, because a trace records no read-set.
--
-- `relevant` IS NULL, NEVER FALSE, WHEN THE OBSERVED VERSION CAME FROM A TRACE. A v4-shaped run
-- wrote `observed_revisions.knowledge_version` (claraWork.v4.impl.ts:593) but recorded NO
-- read-set, so which keys it read is unknown. Answering `false` there -- "nothing relevant moved"
-- -- would be exactly the null-as-empty defect this ticket exists to kill: the absence of a
-- record read as evidence of absence.
-- =====================================================================================
create function clara._work_knowledge_drift_core(p_firm uuid, p_work uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp
  set plan_cache_mode = force_custom_plan as $core$
declare
  w record; rd record; v_current bigint; v_observed bigint; v_from text;
  v_read_keys text[]; v_moved text[]; v_as_of date; v_relevant boolean; v_read jsonb;
begin
  select aw.id, aw.firm_id, aw.client_id into w
    from clara.accounting_work aw where aw.id = p_work and aw.firm_id = p_firm;
  if not found then
    raise exception 'accounting work not found in your firm' using errcode = 'CLR11',
      detail = '{"reason":"work_not_found"}';
  end if;
  -- THE SAME WATERMARK EXPRESSION THE TWO SHIPPED READS USE (0192:1333-1335).
  select coalesce(max(r.knowledge_version), 0) into v_current
    from clara.knowledge_records r
   where r.firm_id = w.firm_id and (r.scope_kind = 'firm' or r.client_id = w.client_id);

  -- THE RECORDED READ-SET FIRST: it is the only source that knows WHICH keys were read.
  select k.knowledge_version, k.keys, k.as_of, k.status, k.reason, k.purpose, k.tiers,
         k.records_shown, k.truncated, k.run_id, k.seq, k.read_at
    into rd
    from clara.work_knowledge_reads k
   where k.work_id = w.id
   order by k.read_at desc, k.seq desc
   limit 1;
  if found then
    v_observed := rd.knowledge_version::bigint;
    v_read_keys := rd.keys;
    v_as_of := rd.as_of;
    v_from := 'read';
    -- WHAT THE ATTEMPT ACTUALLY READ, carried on this same envelope rather than behind an eighth
    -- door. B3's Work detail asks "what did this run read, and did it succeed?" in the same breath
    -- as "has it moved since?", and a second door would be a second read of one relation for one
    -- panel. It is READ METADATA only -- key NAMES, tier counts, the face word and its reason --
    -- exactly what the seventh door returns and for the same #783 reason: no value, no
    -- applies_when, no pack content.
    v_read := jsonb_build_object(
      'status', rd.status, 'reason', rd.reason, 'purpose', rd.purpose,
      'tiers', rd.tiers, 'records_shown', rd.records_shown, 'truncated', rd.truncated,
      'run_id', rd.run_id, 'seq', rd.seq, 'read_at', rd.read_at, 'keys', to_jsonb(rd.keys));
  else
    -- FALLBACK: the v4-shaped execution trace. It carries the version and NOTHING about the keys
    -- (claraWork.v4.impl.ts:593 writes knowledge_version and leaves basis_digest null), which is
    -- exactly why `relevant` below is null rather than false on this arm.
    select (t.observed_revisions ->> 'knowledge_version')::bigint into v_observed
      from clara.work_execution_traces t
     where t.work_id = w.id and t.observed_revisions ? 'knowledge_version'
       and (t.observed_revisions ->> 'knowledge_version') ~ '^[0-9]{1,19}$'
     order by t.started_at desc, t.seq desc
     limit 1;
    if v_observed is not null then v_from := 'trace'; end if;
  end if;

  if v_observed is null then
    return jsonb_build_object('observed_version', null, 'current_version', coalesce(v_current,0)::text,
      'observed_from', null, 'drifted', null, 'moved_keys', '[]'::jsonb,
      'read_keys', null, 'relevant', null, 'as_of', null, 'read', null,
      'work_id', w.id, 'client_id', w.client_id);
  end if;

  -- WHAT MOVED, IN THIS CLIENT'S OWN SCOPE -- AND THE SAME PER-APPLICABILITY SHADOW THE READ USED.
  -- A firm default that is SHADOWED for this client is a record the run PROVABLY did not read
  -- (clara.retrieve_knowledge hid it behind the client's own exception, :361, copied from
  -- 0192:1355-1363), so intersecting it with the read-set on the key NAME would report `relevant`
  -- for a basis that did not move -- and the Work detail would tell a person "a record this Work
  -- read has changed" about a record it never read, on the one surface this ticket exists to make
  -- honest. The seventh door already draws exactly this line (:861, :881); so does the read; so
  -- does this.
  --
  -- NO `state`/`superseded_at` FILTER, DELIBERATELY, and it is the opposite of an oversight: a
  -- WITHDRAWN record is a revision at a HIGHER version, and "the exception you were relying on was
  -- withdrawn" is the single most relevant thing that can happen to a run's basis. Measured on the
  -- rig: withdraw_knowledge leaves superseded_at null and drift reports {drifted, relevant, moved}.
  -- Filtering to `state='live'` here would silence exactly that case.
  --
  -- THE WATERMARK ABOVE IS NOT SHADOWED, also deliberately: it is the shipped expression
  -- (0192:1333-1335) that clara.retrieve_knowledge itself records, and comparing a shadowed
  -- watermark against an unshadowed observation would be comparing two different numbers. So
  -- `drifted` still says "something in your scope moved" and `relevant` says "and it was yours".
  select coalesce(array_agg(distinct r.knowledge_key order by r.knowledge_key), array[]::text[])
    into v_moved
    from clara.knowledge_records r
   where r.firm_id = w.firm_id
     and r.knowledge_version > v_observed
     and (r.client_id = w.client_id
       or (r.scope_kind = 'firm'
           and not exists (select 1 from clara.knowledge_records o
                            where o.firm_id = w.firm_id and o.scope_kind = 'client'
                              and o.client_id = w.client_id and o.state = 'live'
                              and o.knowledge_key = r.knowledge_key
                              and o.applies_when_digest = r.applies_when_digest)));

  if v_from = 'trace' then
    v_relevant := null;
  else
    v_relevant := exists (select 1 from unnest(v_moved) m where m = any (coalesce(v_read_keys, array[]::text[])));
  end if;

  return jsonb_build_object(
    'observed_version', v_observed::text, 'current_version', coalesce(v_current,0)::text,
    'observed_from', v_from, 'drifted', coalesce(v_current,0) > v_observed,
    'moved_keys', to_jsonb(v_moved),
    'read_keys', case when v_from = 'trace' then null else to_jsonb(coalesce(v_read_keys, array[]::text[])) end,
    'relevant', v_relevant, 'as_of', v_as_of, 'read', v_read,
    'work_id', w.id, 'client_id', w.client_id);
end $core$;
alter function clara._work_knowledge_drift_core(uuid,uuid) owner to clara_fn_owner;
revoke all on function clara._work_knowledge_drift_core(uuid,uuid) from public;

create function clara.work_knowledge_drift(p_work uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp
  set plan_cache_mode = force_custom_plan as $read$
declare c record;
begin
  c := clara._human_ctx(clara.role_rank('viewer'));
  return clara._work_knowledge_drift_core(c.firm, p_work);
end $read$;
alter function clara.work_knowledge_drift(uuid) owner to clara_fn_owner;
revoke all on function clara.work_knowledge_drift(uuid) from public;
comment on function clara.work_knowledge_drift(uuid) is
  '#658: has this Work''s knowledge basis moved since it read? Viewer floor, firm from the '
  'session. relevant = a key this Work READ has moved; it is NULL (never false) when the observed '
  'version came from an execution trace, because no read-set was recorded.';

create function clara.work_knowledge_drift_for(p_firm uuid, p_work uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp
  set plan_cache_mode = force_custom_plan as $read$
begin
  if p_firm is null then
    raise exception 'the runtime drift read names the firm it is reading' using errcode = 'CLR10',
      detail = '{"reason":"pack_firm_required"}';
  end if;
  return clara._work_knowledge_drift_core(p_firm, p_work);
end $read$;
alter function clara.work_knowledge_drift_for(uuid,uuid) owner to clara_fn_owner;
revoke all on function clara.work_knowledge_drift_for(uuid,uuid) from public;
comment on function clara.work_knowledge_drift_for(uuid,uuid) is
  '#658: the runtime twin of clara.work_knowledge_drift -- firm explicit, CLR11 with no existence '
  'oracle for another firm''s Work. clara_runtime ONLY.';

-- =====================================================================================
-- §F — THE SEVENTH DOOR. clara.list_work_knowledge_reads_for_record.
--
-- MANDATED BY DECISIONS.md:83 and built here because C13's record detail has NO OTHER WAY IN:
-- clara.work_knowledge_reads is FORCE-RLS with no app-role SELECT, so a SECURITY DEFINER door is
-- the only human path to it and a `grant select` is not an alternative (§Z refuses one).
--
-- IT RETURNS READ METADATA AND NEVER A VALUE. No record value, no applies_when, no source bytes,
-- no assembled pack content -- which is why granting it to clara_authenticated does not breach
-- #783. Cell p658.record_reads.no_values is the wall against "just add the value, the human is
-- already allowed".
--
-- THE SCOPE COMES FROM THE RECORD, NEVER FROM A PARAMETER. p_record is resolved inside the
-- session firm and its firm, client, scope_kind, key and applicability digest are taken from
-- there. A record in another firm and a record that does not exist answer IDENTICALLY (CLR11).
--
-- THE JOIN AXIS IS THE KEY, BECAUSE THE RELATION STORES KEY NAMES AND A WATERMARK, NOT RECORD
-- IDS. So this door answers "this Work read this KEY at this version", which for a stable
-- record_id is the honest form of "read this record" -- and it never claims a revision a read row
-- cannot prove. For a scope_kind='firm' record the client band is EVERY client in the firm EXCEPT
-- those whose own live record shadows that key at that applicability, using the per-applicability
-- `not exists` shadow copied from the shipped reads (0192:1355-1363, :1508-1519). Without that
-- exclusion the list would silently claim that a client reading its OWN exception was reading the
-- firm default (DECISIONS §6.1's #658 ruling; cell p658.record_reads.firm_scope_shadow).
--
-- THE KEY PREDICATE IS WRITTEN AS CONTAINMENT (`k.keys @> array[rec.knowledge_key]`), NOT AS
-- `rec.knowledge_key = any (k.keys)`, and the difference is not cosmetic: the two are identical in
-- meaning for a scalar on a non-null array, but only the containment form can be matched to the
-- GIN index this file creates on `keys`. Measured on the rig with the scalar form: `Index Scan
-- using ix_work_knowledge_reads_firm … Filter: (… = ANY (keys))` and `idx_scan = 0` on the GIN
-- index after a whole battery — i.e. the index was pure write amplification on an append-only
-- relation, and this door filtered every read row the firm had ever made. p658.record_reads.bounded
-- asserts BOTH the written form and the plan, so a later rewrite cannot silently re-orphan it.
--
-- BOUNDED AT 100, newest first, with truncated + hidden_count in the envelope (the 0214 posture).
-- The C13 register at Web 1 is unbounded and this list is not: an unbounded list on a detail page
-- is how a record page quietly becomes a Work directory.
-- =====================================================================================
create function clara.list_work_knowledge_reads_for_record(p_record uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp
  set plan_cache_mode = force_custom_plan as $read$
declare c record; rec record; v_rows jsonb; v_total int; v_shown int;
begin
  c := clara._human_ctx(clara.role_rank('viewer'));
  select r.firm_id, r.client_id, r.scope_kind, r.knowledge_key, r.applies_when_digest
    into rec
    from clara.knowledge_records r
   where r.record_id = p_record and r.firm_id = c.firm and r.superseded_at is null;
  if not found then
    raise exception 'knowledge record not found in your firm' using errcode = 'CLR11';
  end if;

  select count(*)::int into v_total
    from clara.work_knowledge_reads k
   where k.firm_id = c.firm
     and k.keys @> array[rec.knowledge_key]
     and (case when rec.scope_kind = 'client' then k.client_id = rec.client_id
               else not exists (select 1 from clara.knowledge_records o
                                 where o.firm_id = c.firm and o.scope_kind = 'client'
                                   and o.client_id = k.client_id and o.state = 'live'
                                   and o.knowledge_key = rec.knowledge_key
                                   and o.applies_when_digest = rec.applies_when_digest)
          end);

  select coalesce(jsonb_agg(j order by read_at desc, seq desc), '[]'::jsonb), count(*)::int
    into v_rows, v_shown
    from (
      select jsonb_build_object(
               'work_id', k.work_id, 'client_id', k.client_id, 'run_id', k.run_id,
               'seq', k.seq, 'read_at', k.read_at, 'purpose', k.purpose, 'as_of', k.as_of,
               'knowledge_version', k.knowledge_version, 'status', k.status,
               'reason', k.reason) as j,
             k.read_at as read_at, k.seq as seq
        from clara.work_knowledge_reads k
       where k.firm_id = c.firm
         and k.keys @> array[rec.knowledge_key]
         and (case when rec.scope_kind = 'client' then k.client_id = rec.client_id
                   else not exists (select 1 from clara.knowledge_records o
                                     where o.firm_id = c.firm and o.scope_kind = 'client'
                                       and o.client_id = k.client_id and o.state = 'live'
                                       and o.knowledge_key = rec.knowledge_key
                                       and o.applies_when_digest = rec.applies_when_digest)
              end)
       order by k.read_at desc, k.seq desc
       limit 100) t;

  return jsonb_build_object(
    'status', 'ok', 'record_id', p_record, 'knowledge_key', rec.knowledge_key,
    'scope_kind', rec.scope_kind, 'client_id', rec.client_id,
    'reads', v_rows, 'truncated', v_total > v_shown, 'hidden_count', v_total - v_shown,
    'computed_at', now());
end $read$;
alter function clara.list_work_knowledge_reads_for_record(uuid) owner to clara_fn_owner;
revoke all on function clara.list_work_knowledge_reads_for_record(uuid) from public;
comment on function clara.list_work_knowledge_reads_for_record(uuid) is
  '#658 (DECISIONS.md:83): which Work has recorded a read of this knowledge record -- work id, '
  'client, run/seq, read_at, purpose, as_of, knowledge_version and the face word. READ METADATA '
  'ONLY: no record value, no applies_when, no source bytes, no pack content, so granting it to '
  'clara_authenticated does not breach #783. Viewer floor, firm from the session, record-scoped '
  'and firm-bounded; a firm-scope record excludes clients whose own live record shadows the key. '
  'Newest first, capped at 100 with truncated + hidden_count.';

-- =====================================================================================
-- §H — GRANTS. Seven granted names, and the tail asserts every ABSENCE too.
-- =====================================================================================
grant execute on function clara.retrieve_knowledge(uuid,text,date,text[],int,uuid) to clara_runtime;
grant execute on function clara.read_knowledge_record_for(uuid,uuid,uuid) to clara_runtime;
grant execute on function clara.read_knowledge_history_for(uuid,uuid,uuid) to clara_runtime;
grant execute on function clara.record_work_knowledge_read(uuid,text,int,text,date,text,text[],jsonb,int,boolean,text,text) to clara_runtime;
grant execute on function clara.work_knowledge_drift_for(uuid,uuid) to clara_runtime;
grant execute on function clara.work_knowledge_drift(uuid) to clara_authenticated;
grant execute on function clara.list_work_knowledge_reads_for_record(uuid) to clara_authenticated;

reset role;

-- =====================================================================================
-- §Z — TAIL. Fail-closed, re-read from the catalog, never asserted from this file's own text.
-- =====================================================================================
do $p658_tail$
declare
  v_n int; v_sha text; v_name text; v_acl text;
  c_new constant text[] := array[
    'clara.retrieve_knowledge(uuid,text,date,text[],int,uuid)',
    'clara.read_knowledge_record_for(uuid,uuid,uuid)',
    'clara.read_knowledge_history_for(uuid,uuid,uuid)',
    'clara.record_work_knowledge_read(uuid,text,int,text,date,text,text[],jsonb,int,boolean,text,text)',
    'clara.work_knowledge_drift(uuid)',
    'clara.work_knowledge_drift_for(uuid,uuid)',
    'clara.list_work_knowledge_reads_for_record(uuid)',
    'clara._work_knowledge_drift_core(uuid,uuid)'];
  c_pins constant text[][] := array[
    array['clara.get_knowledge_pack(uuid,text,uuid)','2deb725f00229f60a2fbbcc158fe656c5635cd220ec11727c182c39dc6c693fb'],
    array['clara.list_client_knowledge(uuid)','32999fef181b09989994d40a9c12956f6107798b55eae0b45fce2806d2e7b691'],
    array['clara._knowledge_legacy_rows(uuid,uuid)','65f4f0f3db1ab64cfa2e4ef55cc850fa9f2176009ac5271c57030e18706ff35a'],
    array['clara._knowledge_capture_core(uuid,text,uuid,text,jsonb,jsonb,date,date,text,text,jsonb,uuid,text,text,text,text)','2c8526b82d54ac0aa49c77c3be277be5ecd9cad73df0fec63908d67a0681b01b'],
    array['clara._knowledge_floor(text,text)','5e4d80691226a6b0bc80dc45c50a6089db5f3a3f7e905f782a0c99c6db8820ca'],
    array['clara.capture_knowledge(text,jsonb,text,text,text,uuid,text,jsonb,date,date,jsonb)','b9f1cf6b4aa54c9b26dfad6d8a256d5812f3660bf5b65a39e399bbca9be1009e'],
    array['clara.get_context_pack(uuid,text)','1a0312c9b80555a6e3cf41347b65ac52fa4e45d6a714e23d65ad6646336de81b'],
    array['clara.answer_work_question(uuid,integer,jsonb,text)','15a82c080d102e61ebdead2280577072a87c21720375174e83c86a7198fb07a7']];
begin
  -- (1) OWNER, DEFINER, PINNED search_path, and EXACTLY ONE pg_proc row per new name
  --     (0103:1055-1070's census, applied to this file's own eight).
  foreach v_name in array c_new loop
    if to_regprocedure(v_name) is null then
      raise exception '#658 tail: % is absent', v_name using errcode='CLR10';
    end if;
    select count(*)::int into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'clara'
       and p.proname = split_part(split_part(v_name, '(', 1), '.', 2);
    if v_n <> 1 then
      raise exception '#658 tail: clara.% resolves to % pg_proc row(s) -- an accidental overload is how a caller silently reaches a different body',
        split_part(split_part(v_name, '(', 1), '.', 2), v_n using errcode='CLR10';
    end if;
    select count(*)::int into v_n from pg_proc p join pg_roles r on r.oid = p.proowner
     where p.oid = v_name::regprocedure
       and r.rolname = 'clara_fn_owner' and p.prosecdef
       and p.proconfig @> array['search_path=clara, pg_temp'];
    if v_n <> 1 then
      raise exception '#658 tail: % is not a clara_fn_owner-owned SECURITY DEFINER with a pinned search_path', v_name
        using errcode='CLR10';
    end if;
    if has_function_privilege('public', v_name::regprocedure::oid, 'EXECUTE') then
      raise exception '#658 tail: PUBLIC holds EXECUTE on %', v_name using errcode='CLR10';
    end if;
  end loop;

  -- (2) #783, ASSERTED POSITIVELY. No human role, no agent read role and no wake lane holds
  --     EXECUTE on the three pack-shaped runtime reads. The ruling is at
  --     .out-of-scope/human-read-of-knowledge-pack.md ("The register is the human surface; the
  --     pack is the model's"), ARCHITECTURE:297-299 carries it, and this is its wall.
  select count(*)::int into v_n from (
    select unnest(array['clara_authenticated','clara_agent_ro','clara_agent_read_login',
                        'clara_wake_interactive','clara_wake_proactive','clara_wake_bank',
                        'clara_wake_filing','clara_freeform_ro']) as r) g
   cross join unnest(array['clara.retrieve_knowledge(uuid,text,date,text[],int,uuid)',
                           'clara.read_knowledge_record_for(uuid,uuid,uuid)',
                           'clara.read_knowledge_history_for(uuid,uuid,uuid)']) f(sig)
   where has_function_privilege(g.r, f.sig::regprocedure::oid, 'EXECUTE');
  if v_n <> 0 then
    raise exception '#658 tail: % non-runtime grant(s) on the pack-shaped reads -- #783 stands (.out-of-scope/human-read-of-knowledge-pack.md): the register is the human surface, the pack is the model''s', v_n
      using errcode='CLR10';
  end if;
  foreach v_name in array array['clara.retrieve_knowledge(uuid,text,date,text[],int,uuid)',
                                'clara.read_knowledge_record_for(uuid,uuid,uuid)',
                                'clara.read_knowledge_history_for(uuid,uuid,uuid)',
                                'clara.record_work_knowledge_read(uuid,text,int,text,date,text,text[],jsonb,int,boolean,text,text)',
                                'clara.work_knowledge_drift_for(uuid,uuid)'] loop
    if not has_function_privilege('clara_runtime', v_name::regprocedure::oid, 'EXECUTE') then
      raise exception '#658 tail: clara_runtime does NOT hold EXECUTE on % -- the runtime lane is half-granted', v_name
        using errcode='CLR10';
    end if;
  end loop;

  -- (3) THE SEVENTH DOOR'S MIRROR, POSITIVELY. EXECUTE on
  --     clara.list_work_knowledge_reads_for_record is held by clara_authenticated and by NOBODY
  --     else -- not clara_runtime (the run already knows what it read), not clara_agent_ro,
  --     neither wake lane. DECISIONS.md:83 mandates the door; nothing in it licenses more.
  if not has_function_privilege('clara_authenticated',
        'clara.list_work_knowledge_reads_for_record(uuid)'::regprocedure::oid, 'EXECUTE') then
    raise exception '#658 tail: clara_authenticated does NOT hold EXECUTE on clara.list_work_knowledge_reads_for_record -- DECISIONS.md:83 mandates exactly this door for C13''s record detail'
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from (
    select unnest(array['clara_runtime','clara_agent_ro','clara_agent_read_login',
                        'clara_wake_interactive','clara_wake_proactive','clara_wake_bank',
                        'clara_wake_filing','clara_freeform_ro']) as r) g
   where has_function_privilege(g.r,
     'clara.list_work_knowledge_reads_for_record(uuid)'::regprocedure::oid, 'EXECUTE');
  if v_n <> 0 then
    raise exception '#658 tail: % role(s) beyond clara_authenticated hold EXECUTE on clara.list_work_knowledge_reads_for_record -- DECISIONS.md:83 mandates a HUMAN door, and the run already knows what it read', v_n
      using errcode='CLR10';
  end if;
  -- ...and the human door pair for drift: clara_authenticated only.
  select count(*)::int into v_n from (
    select unnest(array['clara_agent_ro','clara_wake_interactive','clara_wake_proactive',
                        'clara_wake_bank','clara_wake_filing','clara_freeform_ro']) as r) g
   where has_function_privilege(g.r, 'clara.work_knowledge_drift(uuid)'::regprocedure::oid, 'EXECUTE');
  if v_n <> 0 then
    raise exception '#658 tail: % role(s) beyond clara_authenticated hold EXECUTE on clara.work_knowledge_drift', v_n
      using errcode='CLR10';
  end if;
  -- ...and the CORE is granted to NOBODY.
  select count(*)::int into v_n from (
    select unnest(array['clara_authenticated','clara_runtime','clara_agent_ro',
                        'clara_wake_interactive','clara_wake_proactive','clara_wake_bank',
                        'clara_wake_filing','clara_freeform_ro']) as r) g
   where has_function_privilege(g.r, 'clara._work_knowledge_drift_core(uuid,uuid)'::regprocedure::oid, 'EXECUTE');
  if v_n <> 0 then
    raise exception '#658 tail: % application role(s) reach the ungranted drift core directly', v_n
      using errcode='CLR10';
  end if;

  -- (4) THE RELATION: FORCE RLS, owner policy only, NO application-role privilege (SELECT
  --     included, EVEN AFTER the seventh door is granted -- the door is SECURITY DEFINER and the
  --     RELATION gains nothing, which is the whole reason DECISIONS.md:83 mandates a door rather
  --     than a grant), append-only, no-truncate, and EMPTY.
  select count(*)::int into v_n from pg_class
   where oid = 'clara.work_knowledge_reads'::regclass and relrowsecurity and relforcerowsecurity;
  if v_n <> 1 then
    raise exception '#658 tail: clara.work_knowledge_reads does not FORCE row level security' using errcode='CLR10';
  end if;
  if exists (select 1 from pg_policy where polrelid = 'clara.work_knowledge_reads'::regclass
               and polname <> 'p_work_knowledge_reads_owner') then
    raise exception '#658 tail: clara.work_knowledge_reads carries a policy other than the owner policy -- a FORCE-RLS relation with no app-role policy is what makes an accidental grant fail CLOSED'
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from (
    select unnest(array['clara_authenticated','clara_runtime','clara_agent_ro',
                        'clara_wake_interactive','clara_wake_proactive','clara_wake_bank',
                        'clara_wake_filing','clara_freeform_ro']) as r) g
   where has_table_privilege(g.r, 'clara.work_knowledge_reads', 'SELECT')
      or has_table_privilege(g.r, 'clara.work_knowledge_reads', 'INSERT')
      or has_table_privilege(g.r, 'clara.work_knowledge_reads', 'UPDATE')
      or has_table_privilege(g.r, 'clara.work_knowledge_reads', 'DELETE');
  if v_n <> 0 then
    raise exception '#658 tail: % application role(s) hold a privilege on clara.work_knowledge_reads -- DECISIONS.md:83 mandates a DOOR precisely because a grant select is not an alternative', v_n
      using errcode='CLR10';
  end if;
  foreach v_name in array array['t_work_knowledge_reads_append_only','t_work_knowledge_reads_no_truncate'] loop
    if not exists (select 1 from pg_trigger
                    where tgrelid = 'clara.work_knowledge_reads'::regclass
                      and not tgisinternal and tgname = v_name) then
      raise exception '#658 tail: trigger % is absent from clara.work_knowledge_reads', v_name using errcode='CLR10';
    end if;
  end loop;
  select count(*)::int into v_n from clara.work_knowledge_reads;
  if v_n <> 0 then
    raise exception '#658 tail: clara.work_knowledge_reads is not empty (% row(s)) -- this file seeds nothing', v_n
      using errcode='CLR10';
  end if;

  -- (5) NO FOREIGN KEY TO clara.accounting_work. 0195's measurement, quoted so a later
  --     "hardening" pass cannot add it back: an FK takes FOR KEY SHARE on the Work row, the
  --     posting core holds FOR UPDATE on exactly that row, and a measured insert blocked 4001 ms
  --     behind a posting lock and was then silently cancelled.
  if exists (select 1 from pg_constraint
              where conrelid = 'clara.work_knowledge_reads'::regclass and contype = 'f'
                and confrelid = 'clara.accounting_work'::regclass) then
    raise exception '#658 tail: clara.work_knowledge_reads has a foreign key to clara.accounting_work -- it would take FOR KEY SHARE behind every posting lock (0195:254-268 measured 4001 ms and a silent cancel); the positive task->work join in the sole writer is the binding'
      using errcode='CLR10';
  end if;

  -- (6) THE STATUS VOCABULARY, BY VALUE. Exactly the four face words are admitted and
  --     `unavailable` -- the runtime's own word -- is REFUSED, so it can never reach a register
  --     through a column.
  begin
    insert into clara.work_knowledge_reads(firm_id, client_id, work_id, task_id, run_id, seq,
        purpose, as_of, knowledge_version, payload_digest, records_shown, truncated, status)
      values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
        'wrun_p658tailprobe', 1, 'probe', current_date, '0', repeat('0', 64), 0, false, 'unavailable');
    raise exception '#658 tail: clara.work_knowledge_reads admitted status "unavailable" -- the runtime word must never reach a register column'
      using errcode='CLR10';
  exception
    when check_violation then null;
    when foreign_key_violation then
      raise exception '#658 tail: the status CHECK did not fire before the foreign keys -- re-order the probe'
        using errcode='CLR10';
  end;
  select count(*)::int into v_n from pg_constraint
   where conrelid = 'clara.work_knowledge_reads'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) like '%ok%partial%unknown%denied%';
  if v_n <> 1 then
    raise exception '#658 tail: the four-word status CHECK is absent from clara.work_knowledge_reads' using errcode='CLR10';
  end if;

  -- (6b) THE TIER VOCABULARY, BY VALUE, in the same rolled-back-probe shape. `keys` has a grammar
  --      and a cardinality; `tiers` must not be the slot that grammar was denied. A key outside
  --      {core, requested, remainder} and a value that is not a non-negative integer are both
  --      refused by the COLUMN, not only by the writer that is supposed to be the only inserter.
  foreach v_name in array array['{"smuggled":"payload"}','{"core":"IGNORE ALL PREVIOUS INSTRUCTIONS"}',
                                '{"core":-1}','{"core":1.5}','{"core":null}'] loop
    begin
      insert into clara.work_knowledge_reads(firm_id, client_id, work_id, task_id, run_id, seq,
          purpose, as_of, knowledge_version, tiers, payload_digest, records_shown, truncated, status)
        values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
          'wrun_p658tailtiers', 1, 'probe', current_date, '0', v_name::jsonb, repeat('0', 64),
          0, false, 'ok');
      raise exception '#658 tail: clara.work_knowledge_reads admitted tiers % -- an append-only relation whose jsonb only has to be an OBJECT is a payload slot by the back door (the rule §D states about observed_revisions)', v_name
        using errcode='CLR10';
    exception
      when check_violation then null;
      when foreign_key_violation then
        raise exception '#658 tail: the tiers CHECK did not fire before the foreign keys -- re-order the probe'
          using errcode='CLR10';
    end;
  end loop;
  select count(*)::int into v_n from pg_constraint
   where conrelid = 'clara.work_knowledge_reads'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) like '%tiers%core%requested%remainder%';
  if v_n <> 1 then
    raise exception '#658 tail: the closed tier-vocabulary CHECK is absent from clara.work_knowledge_reads' using errcode='CLR10';
  end if;

  -- (7) THIS FILE RECUTS NOTHING, AND THE EIGHT BODIES PROVE IT -- re-read from the catalog after
  --     everything above has run, byte-identical to the measured pre-image.
  for v_n in 1 .. array_length(c_pins, 1) loop
    select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
     where p.oid = c_pins[v_n][1]::regprocedure;
    if v_sha is distinct from c_pins[v_n][2] then
      raise exception '#658 tail: % is NOT byte-identical to its pre-0230 body (sha %) -- 0230 recuts nothing and this is how that claim is measured rather than promised',
        c_pins[v_n][1], v_sha using errcode='CLR10';
    end if;
  end loop;
  -- 0109:361's assertion, re-run here: clara.get_context_pack has EXACTLY ONE overload.
  select count(*)::int into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara' and p.proname = 'get_context_pack';
  if v_n <> 1 then
    raise exception '#658 tail: clara.get_context_pack resolves to % rows -- 0109:361''s exactly-one-overload assertion is red', v_n
      using errcode='CLR10';
  end if;

  -- (8) NO ROW LOCK ANYWHERE IN THIS FILE'S BODIES. Read from the catalogued source, so the
  --     claim survives a later edit to this text.
  select count(*)::int into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara'
     and p.proname in ('retrieve_knowledge','read_knowledge_record_for','read_knowledge_history_for',
                       'record_work_knowledge_read','work_knowledge_drift','work_knowledge_drift_for',
                       'list_work_knowledge_reads_for_record','_work_knowledge_drift_core')
     and (p.prosrc ~* 'for\s+update' or p.prosrc ~* 'for\s+share' or p.prosrc ~* 'for\s+key\s+share');
  if v_n <> 0 then
    raise exception '#658 tail: % of this file''s bodies takes a row lock -- the lock order accounting_plans -> accounting_work -> agent_tasks -> agent_interruptions is a cycle this file must not join', v_n
      using errcode='CLR10';
  end if;

  raise notice '#658 tail: OK -- SEVEN granted functions (retrieve_knowledge / read_knowledge_record_for / read_knowledge_history_for / record_work_knowledge_read / work_knowledge_drift_for to clara_runtime; work_knowledge_drift and list_work_knowledge_reads_for_record to clara_authenticated), ONE ungranted core (_work_knowledge_drift_core) and ONE relation (work_knowledge_reads), every function a clara_fn_owner-owned SECURITY DEFINER with search_path=clara, pg_temp, exactly ONE pg_proc row each and PUBLIC revoked. #783 asserted POSITIVELY: no human role, no agent read role and no wake lane holds EXECUTE on the three pack-shaped reads (.out-of-scope/human-read-of-knowledge-pack.md). The SEVENTH door''s mirror asserted positively too: clara_authenticated holds EXECUTE on list_work_knowledge_reads_for_record and NOBODY else does (DECISIONS.md:83). clara.work_knowledge_reads FORCES RLS with the owner policy alone, carries ZERO privilege for every application role INCLUDING SELECT even after that grant, is append-only and no-truncate, is EMPTY, has NO foreign key to clara.accounting_work (0195:254-268''s measured 4001 ms lock-wait), and its status CHECK admits exactly ok/partial/unknown/denied and REFUSED "unavailable" in a rolled-back probe. The EIGHT non-regression bodies are byte-identical to their measured pre-image sha256 -- get_context_pack and get_knowledge_pack included, so "0230 recuts nothing" is a measurement -- get_context_pack still has exactly one overload (0109:361), and no body in this file takes a row lock of any kind.';
end $p658_tail$;
