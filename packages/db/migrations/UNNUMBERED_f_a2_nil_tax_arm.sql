-- UNNUMBERED_f_a2_nil_tax_arm.sql — Wave-F Track A, F-A2 openers ① + ②, PART 1 of 2:
-- THE THREE LIVE-BODY RECUTS.
-- =====================================================================================
-- MIGRATION NUMBER IS CLAIMED AT MERGE TIME (hard constraint 10; .claude/rules/db-migrations.md);
-- nothing keys on it — the battery gates on the STABLE SUFFIX `_f_a2_nil_tax_arm`. SPLIT INTO
-- TWO FILES, applied in ALPHABETICAL order (this file, then
-- UNNUMBERED_f_a2_nil_tax_arm_part2.sql), each SELF-CONTAINED (own quiesce guard, own prestate,
-- own tail; no temp table crosses files, because a deploy-onto-existing run may apply only one).
-- Part 1 (this file) RECUTS three live bodies and CREATES nothing; part 2 CREATES one evaluator
-- and RECUTS exactly one body. The split is the 0092/0093 shape and it buys the same thing: each
-- file's tail census can make an ABSOLUTE claim (`changed = exactly these`, `created = none`)
-- rather than a compound one. BOTH FILES SIT PAST THE HARNESS'S 500-LINE ADVISORY, the same
-- call 0092 made at 644 lines and 0097 at 638, and for the same reason recorded there: a
-- migration's prestate, its splices and its tail census are ONE piece of evidence, and splitting
-- them across files to satisfy a line count would buy a smaller file at the cost of a claim no
-- single file could make.
--
-- DESIGN OF RECORD: the F-A2 opener ① spec (the three-locks nil-tax arm) §2 Lock 3, §2.5, §7.4
-- and §10; the opener ② spec §7f (the engine-literal bump). Owner ruling of record:
-- docs/plan/completed/f-a1-corpus-measurement.md:64-68.
--
-- WHAT THIS FILE DOES. Three recuts, no new callable surface:
--   §1  clara._witness_answers_ok — THE VOCABULARY WIDENING. The answer roster gains
--       `invoice.sst_registration` through a THIRD array: OPTIONAL-PRESENT like the two
--       reference answers (0095:200-206, :224-227) and NEVER belt-required. That choice is what
--       makes the deploy order safe in BOTH directions — see the ordering note below.
--   §2  clara._enqueue_invoice_facts_core — the witness engine literal moves
--       :v1 -> :v2 (opener ②: witnessFacts.v2 is a NEW frozen prompt closure and a new engine
--       identity, so the reads it produces are distinguishable from every v1-era read).
--   §3  clara.request_reextraction — the identical literal move, so a re-extraction and a first
--       extraction keep buying the identical product (0097's own D7 contract).
--
-- THE DEPLOY ORDER FOR §1 IS THE OPPOSITE OF THE PR-3 CUTOVER'S, AND IT IS BINDING:
-- DB MIGRATION FIRST, RUNTIME IMAGE SECOND. 0097:15-22 was explicitly runtime-image-first. Here
-- a witnessFacts.v2 image against a pre-widened validator raises CLR10 on EVERY persist
-- (0095:220-221, the unknown-answer-key refusal) and wedges the whole invoice lane. With the new
-- field optional-in-validator, the reverse order is harmless: a v1-era envelope carrying no such
-- key still persists cleanly, and the part-2 predicate simply finds no `not_printed` answer and
-- refuses its arm — which is the correct verdict for a read that never asked the question.
-- ROLLBACK IS FAIL-CLOSED FOR FREE: reverting the runtime image to witnessFacts.v1 while the DB
-- carries this widening leaves every new pair without the SST answer, so the arm never fires and
-- part 2's v2 degrades exactly to v1 behaviour.
--
-- THIS FILE IS THE FIRST OF TWO SEQUENCED RECUTS OF clara._enqueue_invoice_facts_core.
-- The follow-on statement-ACTIVATION migration (0098's own header names the collision it
-- deferred: "NOT IN THIS FILE ... the router arm re-aim and the statement typed-consent purpose
-- move to witness_extraction") recuts the SAME body AFTER this one, and must author its
-- prosrc-SHA prestate pin against THIS FILE'S OUTPUT body — never against the 0097 post-state.
-- §2's postcheck prints that output sha as a notice so the activation author reads it from an
-- as-run rather than deriving it.
--
-- SPLICE DISCIPLINE (0097:78-82's, verbatim in shape): read the LIVE body via
-- pg_get_functiondef, assert the target substring occurs EXACTLY ONCE, replace() only there,
-- execute the result. Nothing else in any of the three bodies is retyped, so every arm this file
-- does not name survives BY CONSTRUCTION.
--
-- D1 WRITE-QUIESCE OBLIGATION (packages/db/README.md "Deploy contract"). All three bodies are
-- LIVE: clara._witness_answers_ok is called by the writer on every witness persist
-- (0095:379-380), and the two others are the router and the human re-extraction door 0097 itself
-- called out (0097:72-76). PostgreSQL runs an in-flight PL/pgSQL call to completion on the body
-- it STARTED with, so a call spanning this migration silently runs the OLD body.
set local statement_timeout = '10min';
-- SEARCH PATH PINNED FOR THE WHOLE FILE, load-bearing rather than cosmetic (0092:21-26's
-- recorded reason): the tail compares a prestate function census against a post-DDL one, and a
-- clara COMPOSITE argument type renders qualified-or-bare depending on the session path — an
-- unpinned path made two untouched functions look like a deletion plus a creation. The census
-- keys on oid as well — belt and buckle.
set local search_path = clara, pg_temp;

-- §0 QUIESCE GUARD (0092:34-48 verbatim in argument and threshold). FAIL CLOSED on absence:
-- 0006 creates the table and always precedes this file, so absence is catalog drift, and drift
-- is exactly when a runtime is most likely alive and unobservable.
do $fa2_quiesce1$
declare v_component text; v_beat timestamptz;
begin
  if to_regclass('clara.runtime_heartbeats') is null then
    raise exception 'F-A2 QUIESCE GUARD: clara.runtime_heartbeats is ABSENT — the catalog has drifted from the migration chain (0006 creates it); refuse rather than guess whether a runtime is live'
      using errcode='CLR10';
  end if;
  select h.component, h.beat_at into v_component, v_beat from clara.runtime_heartbeats h
   where h.beat_at > now() - interval '90 seconds' order by h.beat_at desc limit 1;
  if v_component is not null then
    raise exception 'F-A2 QUIESCE GUARD: a runtime heartbeat is fresh (component %, beat_at %) — this file replaces clara._witness_answers_ok, clara._enqueue_invoice_facts_core AND clara.request_reextraction, all three live bodies, and an in-flight call finishes on the OLD body (D1); stop clara-runtime, wait for staleness (>90s), and re-apply',
      v_component, v_beat;
  end if;
end
$fa2_quiesce1$;

-- =====================================================================================
-- §0.1 PRESTATE — measure every claim this file makes about what it is editing.
-- =====================================================================================
create temp table _fa2p1_pre(k text primary key, v text);
create temp table _fa2p1_pre_fn(oid oid primary key, sha text);
do $fa2_pre1$
declare v_src text; v_sha text; v_n int; v_key text;
begin
  -- (0.1) THE THREE SIGNATURES EXIST, EXACTLY ONCE EACH. A recut that silently CREATEd a new
  -- overload instead of REPLACING the live one would leave the old body reachable (0054:132-146).
  begin
    perform 'clara._witness_answers_ok(jsonb,text)'::regprocedure;
    perform 'clara._enqueue_invoice_facts_core(uuid)'::regprocedure;
    perform 'clara.request_reextraction(uuid,text,text)'::regprocedure;
  exception when others then
    raise exception 'F-A2 part1 prestate: one of the three target signatures does not exist — apply 0095_f_a1_writer.sql and 0097_f_a1_cutover.sql FIRST' using errcode='CLR10';
  end;
  select count(*)::int into v_n from pg_proc p
   where p.pronamespace='clara'::regnamespace
     and p.proname in ('_witness_answers_ok','_enqueue_invoice_facts_core','request_reextraction');
  if v_n <> 3 then
    raise exception 'F-A2 part1 prestate: expected exactly 3 target functions, found % — an overload this file does not know about would keep the old shape reachable', v_n
      using errcode='CLR10';
  end if;

  -- (0.2) clara._witness_answers_ok IS THE 0095 SECTION-1 BODY, PINNED BY PROSRC SHA-256.
  -- A marker proves a phrase is present; a hash proves the body is the one this file was
  -- authored against. The sha below is the aggregate body a scratch replay of 0001..0098
  -- produces — the same body the live chain carries, since the ledger checksums pin identical
  -- files, and neither 0096 nor 0098 touches this helper (both only NAME it in prose). The
  -- anchor-uniqueness counts below remain the load-bearing guard; this sha is the tripwire.
  select p.prosrc into v_src from pg_proc p where p.oid='clara._witness_answers_ok(jsonb,text)'::regprocedure;
  v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
  if v_sha <> '8ab9db4ed6bb873612dd42769d7a2cf2f5530169fa7f45696f1a78120d99f3a8' then
    raise exception 'F-A2 part1 prestate: clara._witness_answers_ok prosrc sha256 mismatch (got %, expected 8ab9db4ed6bb873612dd42769d7a2cf2f5530169fa7f45696f1a78120d99f3a8) — this is not the 0095 section-1 body this file was authored against', v_sha
      using errcode='CLR10';
  end if;
  if position('invoice.sst_registration' in v_src) <> 0 then
    raise exception 'F-A2 part1 prestate: clara._witness_answers_ok ALREADY admits invoice.sst_registration — already applied' using errcode='CLR10';
  end if;
  v_n := (length(v_src) - length(replace(v_src, $a1$  v_ref text[] := array['invoice.invoice_id','invoice.invoice_date'];$a1$, '')))
         / length($a1$  v_ref text[] := array['invoice.invoice_id','invoice.invoice_date'];$a1$);
  if v_n <> 1 then
    raise exception 'F-A2 part1 prestate: the _witness_answers_ok reference-roster DECLARE anchor occurs % times (expected 1)', v_n using errcode='CLR10';
  end if;
  v_n := (length(v_src) - length(replace(v_src, $a2$  v_all := v_belt || v_ref;$a2$, '')))
         / length($a2$  v_all := v_belt || v_ref;$a2$);
  if v_n <> 1 then
    raise exception 'F-A2 part1 prestate: the _witness_answers_ok roster-union anchor occurs % times (expected 1)', v_n using errcode='CLR10';
  end if;
  -- The two properties §1 must NOT disturb, pinned as markers so the tail can re-assert them:
  -- the ELEVEN belt fields stay belt-REQUIRED, and the state vocabulary stays closed to two.
  foreach v_key in array array[
      $m1$      if v_f = any(v_belt) then return false; end if;   -- a belt answer is REQUIRED (B1)$m1$,
      $m2$    if v_state is null or v_state not in ('value','not_printed') then return false; end if;$m2$,
      $m3$    if length(v_a->>'raw') > 200 then return false; end if;$m3$] loop
    if position(v_key in v_src) = 0 then
      raise exception 'F-A2 part1 prestate: clara._witness_answers_ok is missing a load-bearing 0095 clause [%] — refusing to widen a body this file cannot account for', v_key
        using errcode='CLR10';
    end if;
  end loop;
  insert into _fa2p1_pre(k,v) values ('answers_ok_sha', v_sha);

  -- (0.3) clara._enqueue_invoice_facts_core IS THE 0097 SECTION-1 POST-STATE BODY.
  select p.prosrc into v_src from pg_proc p where p.oid='clara._enqueue_invoice_facts_core(uuid)'::regprocedure;
  v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
  if v_sha <> 'a8ea199b60f5de11cc4166fe1a1d263c2c330f636cc7cb27dcf8e255cb28cb69' then
    raise exception 'F-A2 part1 prestate: clara._enqueue_invoice_facts_core prosrc sha256 mismatch (got %, expected a8ea199b60f5de11cc4166fe1a1d263c2c330f636cc7cb27dcf8e255cb28cb69) — this is not the 0097 S1 post-state body this file was authored against', v_sha
      using errcode='CLR10';
  end if;
  if position('llm-openai:gpt-5.6-terra:v2' in v_src) <> 0 then
    raise exception 'F-A2 part1 prestate: clara._enqueue_invoice_facts_core ALREADY mints the :v2 engine literal — already applied' using errcode='CLR10';
  end if;
  v_n := (length(v_src) - length(replace(v_src, 'llm-openai:gpt-5.6-terra:v1', '')))
         / length('llm-openai:gpt-5.6-terra:v1');
  if v_n <> 1 then
    raise exception 'F-A2 part1 prestate: the :v1 engine literal occurs % times in clara._enqueue_invoice_facts_core (expected exactly 1) — a second occurrence would be spliced too, and one occurring zero times would splice nothing while this file reported success', v_n
      using errcode='CLR10';
  end if;

  -- (0.4) clara.request_reextraction IS THE 0097 SECTION-3 POST-STATE BODY.
  select p.prosrc into v_src from pg_proc p where p.oid='clara.request_reextraction(uuid,text,text)'::regprocedure;
  v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
  if v_sha <> '98315b5000ed2711f009b35aa73d4df17e1056aaab27f8fde3f1fe4a5da01f24' then
    raise exception 'F-A2 part1 prestate: clara.request_reextraction prosrc sha256 mismatch (got %, expected 98315b5000ed2711f009b35aa73d4df17e1056aaab27f8fde3f1fe4a5da01f24) — this is not the 0097 S3 post-state body this file was authored against', v_sha
      using errcode='CLR10';
  end if;
  if position('llm-openai:gpt-5.6-terra:v2' in v_src) <> 0 then
    raise exception 'F-A2 part1 prestate: clara.request_reextraction ALREADY mints the :v2 engine literal — already applied' using errcode='CLR10';
  end if;
  v_n := (length(v_src) - length(replace(v_src, 'llm-openai:gpt-5.6-terra:v1', '')))
         / length('llm-openai:gpt-5.6-terra:v1');
  if v_n <> 1 then
    raise exception 'F-A2 part1 prestate: the :v1 engine literal occurs % times in clara.request_reextraction (expected exactly 1)', v_n using errcode='CLR10';
  end if;

  -- (0.5) A whole-schema body snapshot, so the tail can NAME every body that moved rather than
  -- consult a list somebody maintained.
  insert into _fa2p1_pre_fn(oid, sha)
  select p.oid, encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')
    from pg_proc p where p.pronamespace='clara'::regnamespace and p.prosrc is not null;
  select count(*)::int into v_n from _fa2p1_pre_fn;
  raise notice 'F-A2 part1 prestate: clean — all three targets at their authored shas, every splice anchor unique, neither engine literal already bumped, % clara bodies snapshotted', v_n;
end
$fa2_pre1$;

set role clara_fn_owner;

-- =====================================================================================
-- §1 — clara._witness_answers_ok: THE ANSWER-VOCABULARY WIDENING.
-- =====================================================================================
-- WHY A THIRD ARRAY AND NOT A THIRTEENTH BELT MEMBER. Belt membership would make the field
-- belt-REQUIRED at 0095:225, which breaks the property this widening exists to preserve: a
-- v1-era envelope (no such key) must keep persisting cleanly, so that a runtime rollback
-- degrades to v1 behaviour instead of wedging the lane. WHY NOT A MEMBER OF v_ref EITHER: that
-- roster's extra rules are name-gated to invoice_id (the substring test the duplicate-bill wall
-- needs) and invoice_date (the ISO shape test), and neither is meaningful for a registration
-- number. The nil-tax arm's lock 3 reads this field's STATE only and never its rendering, so the
-- `value` slot deliberately carries no new rule — what it DOES inherit, because it is applied to
-- every answer before the roster branch, is the 200-character bound on `raw` (0095:234-238).
do $fa2_answers$
declare v_def text; v_next text;
begin
  select pg_get_functiondef('clara._witness_answers_ok(jsonb,text)'::regprocedure) into v_def;
  if v_def is null then
    raise exception 'F-A2 S1: clara._witness_answers_ok is GONE' using errcode='CLR10';
  end if;
  v_next := replace(v_def,
$old$  v_ref text[] := array['invoice.invoice_id','invoice.invoice_date'];$old$,
$new$  v_ref text[] := array['invoice.invoice_id','invoice.invoice_date'];
  -- F-A2 opener 1 (the three-locks nil-tax arm, lock 3): the THIRD vocabulary, admitted BESIDE
  -- the eleven belt fields and the two reference answers and nowhere else. OPTIONAL-PRESENT and
  -- NEVER belt-required -- that is what keeps a v1-era envelope persisting cleanly through this
  -- validator, which is the rollback-safe direction and the reason the DB half of this window
  -- deploys BEFORE the runtime image rather than after it. An unknown key is still a refusal:
  -- a vocabulary that admits anything admits a typo.
  v_sst text[] := array['invoice.sst_registration'];$new$);
  if v_next = v_def then
    raise exception 'F-A2 S1: the _witness_answers_ok reference-roster DECLARE splice matched nothing' using errcode='CLR10';
  end if;
  v_def := v_next;
  v_next := replace(v_def,
$old$  v_all := v_belt || v_ref;$old$,
$new$  v_all := v_belt || v_ref || v_sst;$new$);
  if v_next = v_def then
    raise exception 'F-A2 S1: the _witness_answers_ok roster-union splice matched nothing' using errcode='CLR10';
  end if;
  execute v_next;
end
$fa2_answers$;

reset role;

-- §1p — POSTCHECK. Structural AND behavioural: the widened validator is exercised through the
-- door production uses, because a marker proves a phrase is present and a call proves a verdict.
do $fa2_answers_post$
declare
  v_src text; v_n int; v_ans jsonb; v_env jsonb;
  -- The eleven belt answers, complete, in the shape the writer's contract demands.
  v_belt_ans jsonb := jsonb_build_object(
    'invoice.total',          jsonb_build_object('state','value','raw','RM 1,060.00'),
    'invoice.total_excl_tax', jsonb_build_object('state','not_printed'),
    'invoice.tax_total',      jsonb_build_object('state','not_printed'),
    'invoice.rounding',       jsonb_build_object('state','not_printed'),
    'invoice.service_charge', jsonb_build_object('state','not_printed'),
    'invoice.discount',       jsonb_build_object('state','not_printed'),
    'invoice.delivery',       jsonb_build_object('state','not_printed'),
    'invoice.amount_due',     jsonb_build_object('state','not_printed'),
    'invoice.deposit',        jsonb_build_object('state','not_printed'),
    'invoice.currency',       jsonb_build_object('state','value','raw','RM'),
    'invoice.type_code',      jsonb_build_object('state','value','raw','01'));
begin
  select p.prosrc into v_src from pg_proc p where p.oid='clara._witness_answers_ok(jsonb,text)'::regprocedure;
  if position($m$  v_sst text[] := array['invoice.sst_registration'];$m$ in v_src) = 0 then
    raise exception 'F-A2 S1 postcheck: the third vocabulary array did not install' using errcode='CLR10';
  end if;
  if position($m$  v_all := v_belt || v_ref || v_sst;$m$ in v_src) = 0 then
    raise exception 'F-A2 S1 postcheck: the roster union does not include the third vocabulary' using errcode='CLR10';
  end if;
  -- The eleven belt names and the two reference names must survive VERBATIM: this widening adds
  -- a name, it never re-scopes one. A field that slipped from belt to reference would go
  -- silently optional, which is the exact failure the required-answer rule (B1) exists to close.
  if position($m$  v_belt text[] := array['invoice.total','invoice.total_excl_tax','invoice.tax_total',$m$ in v_src) = 0
     or position($m$    'invoice.amount_due','invoice.deposit','invoice.currency','invoice.type_code'];$m$ in v_src) = 0
     or position($m$  v_ref text[] := array['invoice.invoice_id','invoice.invoice_date'];$m$ in v_src) = 0 then
    raise exception 'F-A2 S1 postcheck: the belt roster or the reference roster moved — this widening must ADD a name, never re-scope one' using errcode='CLR10';
  end if;
  if position($m$      if v_f = any(v_belt) then return false; end if;$m$ in v_src) = 0 then
    raise exception 'F-A2 S1 postcheck: the belt-required refusal was lost' using errcode='CLR10';
  end if;
  if position($m$    if v_state is null or v_state not in ('value','not_printed') then return false; end if;$m$ in v_src) = 0 then
    raise exception 'F-A2 S1 postcheck: the two-token state vocabulary was lost — a third state token is structurally refused and must stay so' using errcode='CLR10';
  end if;

  -- BEHAVIOURAL. Eight verdicts, each naming the property it proves.
  -- (a) A v1-ERA ENVELOPE STILL PERSISTS. The rollback-safety property, measured.
  v_env := jsonb_build_object('witness', jsonb_build_object('channel','text','answers', v_belt_ans));
  if not clara._witness_answers_ok(v_env,'text') then
    raise exception 'F-A2 S1 postcheck: a v1-era envelope (eleven belt answers, no sst_registration) is REFUSED — the widening broke rollback safety' using errcode='CLR10';
  end if;
  -- (b) THE NEW KEY IS ADMITTED, in both states.
  v_ans := v_belt_ans || jsonb_build_object('invoice.sst_registration', jsonb_build_object('state','not_printed'));
  v_env := jsonb_build_object('witness', jsonb_build_object('channel','text','answers', v_ans));
  if not clara._witness_answers_ok(v_env,'text') then
    raise exception 'F-A2 S1 postcheck: an envelope answering invoice.sst_registration not_printed is REFUSED — the widening did not take' using errcode='CLR10';
  end if;
  v_ans := v_belt_ans || jsonb_build_object('invoice.sst_registration',
    jsonb_build_object('state','value','raw','SST Reg. No.: W10-1808-32000123'));
  v_env := jsonb_build_object('witness', jsonb_build_object('channel','vision','answers', v_ans));
  if not clara._witness_answers_ok(v_env,'vision') then
    raise exception 'F-A2 S1 postcheck: an envelope answering invoice.sst_registration with a value is REFUSED' using errcode='CLR10';
  end if;
  -- (c) THE VOCABULARY IS STILL CLOSED. A near-miss spelling is a refusal, not a pass.
  v_ans := v_belt_ans || jsonb_build_object('invoice.sst_reg', jsonb_build_object('state','not_printed'));
  v_env := jsonb_build_object('witness', jsonb_build_object('channel','text','answers', v_ans));
  if clara._witness_answers_ok(v_env,'text') then
    raise exception 'F-A2 S1 postcheck: an UNKNOWN answer key was admitted — the vocabulary is no longer closed' using errcode='CLR10';
  end if;
  -- (d) THE NEW FIELD IS NOT BELT-REQUIRED, but a BELT field still is.
  v_ans := (v_belt_ans - 'invoice.deposit')
           || jsonb_build_object('invoice.sst_registration', jsonb_build_object('state','not_printed'));
  v_env := jsonb_build_object('witness', jsonb_build_object('channel','text','answers', v_ans));
  if clara._witness_answers_ok(v_env,'text') then
    raise exception 'F-A2 S1 postcheck: an envelope MISSING a belt answer was admitted — the required-answer rule (B1) regressed' using errcode='CLR10';
  end if;
  -- (e) THE STATE VOCABULARY STILL BINDS THE NEW FIELD.
  v_ans := v_belt_ans || jsonb_build_object('invoice.sst_registration', jsonb_build_object('state','unknown'));
  v_env := jsonb_build_object('witness', jsonb_build_object('channel','text','answers', v_ans));
  if clara._witness_answers_ok(v_env,'text') then
    raise exception 'F-A2 S1 postcheck: a THIRD state token was admitted on the new field' using errcode='CLR10';
  end if;
  -- (f) THE 200-CHARACTER BOUND STILL BINDS THE NEW FIELD.
  v_ans := v_belt_ans || jsonb_build_object('invoice.sst_registration',
    jsonb_build_object('state','value','raw', repeat('W', 201)));
  v_env := jsonb_build_object('witness', jsonb_build_object('channel','text','answers', v_ans));
  if clara._witness_answers_ok(v_env,'text') then
    raise exception 'F-A2 S1 postcheck: an over-long rendering was admitted on the new field — the M6 length bound does not reach it' using errcode='CLR10';
  end if;
  -- (g) A `value` answer with a BLANK rendering is still a refusal.
  v_ans := v_belt_ans || jsonb_build_object('invoice.sst_registration',
    jsonb_build_object('state','value','raw','   '));
  v_env := jsonb_build_object('witness', jsonb_build_object('channel','text','answers', v_ans));
  if clara._witness_answers_ok(v_env,'text') then
    raise exception 'F-A2 S1 postcheck: a value answer with a blank rendering was admitted on the new field' using errcode='CLR10';
  end if;
  -- (h) THE CHANNEL CHECK IS UNTOUCHED.
  v_ans := v_belt_ans || jsonb_build_object('invoice.sst_registration', jsonb_build_object('state','not_printed'));
  v_env := jsonb_build_object('witness', jsonb_build_object('channel','text','answers', v_ans));
  if clara._witness_answers_ok(v_env,'vision') then
    raise exception 'F-A2 S1 postcheck: a text envelope passed the vision channel check' using errcode='CLR10';
  end if;

  -- POSTURE (T18 hygiene), re-measured rather than assumed: CREATE OR REPLACE preserves it, and
  -- a splice is exactly where it could quietly move.
  if not exists (select 1 from pg_proc p where p.oid='clara._witness_answers_ok(jsonb,text)'::regprocedure
                   and p.prosecdef and p.proconfig @> array['search_path=clara, pg_temp']
                   and pg_get_userbyid(p.proowner) = 'clara_fn_owner') then
    raise exception 'F-A2 S1 postcheck: _witness_answers_ok is no longer a search_path-pinned SECURITY DEFINER owned by clara_fn_owner' using errcode='CLR10';
  end if;
  if exists (select 1 from pg_proc f
             cross join lateral aclexplode(coalesce(f.proacl, acldefault('f', f.proowner))) a
              where f.oid='clara._witness_answers_ok(jsonb,text)'::regprocedure
                and (a.grantee = 0 or pg_get_userbyid(a.grantee) <> 'clara_fn_owner')) then
    raise exception 'F-A2 S1 postcheck: _witness_answers_ok gained a grant (PUBLIC or otherwise)' using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_proc p
   where p.pronamespace='clara'::regnamespace and p.proname='_witness_answers_ok';
  if v_n <> 1 then
    raise exception 'F-A2 S1 postcheck: _witness_answers_ok resolves to % bodies — the splice created an overload instead of replacing', v_n using errcode='CLR10';
  end if;
  raise notice 'F-A2 S1: clara._witness_answers_ok widened — invoice.sst_registration joins the admitted vocabulary through a THIRD array (optional-present, never belt-required); proven behaviourally at apply: a v1-era envelope still persists, both states of the new field are admitted, an unknown key is still refused, a missing belt answer is still refused, and the state/length/blank/channel rules all still bind the new field; definer posture and ACL unmoved.';
end
$fa2_answers_post$;

-- =====================================================================================
-- §2 — clara._enqueue_invoice_facts_core: THE ENGINE LITERAL BUMP (opener ②).
-- =====================================================================================
-- WHY THE BUMP IS NOT COSMETIC. witnessFacts.v2 is a NEW frozen prompt closure (the type_code
-- re-question, the invoice.sst_registration answer, the coverage receipt), so the reads it
-- produces answer different questions from every v1-era read. The engine id is the provenance
-- carrier the 4-column unique key (document_id, engine_id, version_n, engine_kind) is built on,
-- and the corpus re-measurement needs v1-era and v2-era pairs to be distinguishable rows rather
-- than a single generation counter's neighbours.
-- THE ENGINE LITERAL CONTRACT (LOCKED, both builders' terms): 'llm-openai:gpt-5.6-terra:v2'
-- MUST string-equal WITNESS_ENGINE_SNAPSHOT.engineId in the witnessFacts.v2 services module
-- (built from WITNESS_MODEL_ID default 'gpt-5.6-terra' + WITNESS_ENGINE_VERSION 'v2', prefixed
-- 'llm-openai:'). The battery reads BOTH sides independently and compares; it never re-derives
-- one from the other.
-- THE ANCHOR IS THE WHOLE 0097 S1 EDIT-1 BLOCK, comment included, deliberately: the wb-0020
-- restore-pair battery (wall 12) reverses this body LAYER BY LAYER, outermost first, and a
-- layer whose reversal pair is a bare literal swap could not carry the comment change with it.
-- The battery gains an F-A2 layer that is the exact inverse of this splice.
set role clara_fn_owner;

do $fa2_router$
declare v_def text; v_next text; v_frm text; v_to text; v_cnt int;
begin
  select pg_get_functiondef('clara._enqueue_invoice_facts_core(uuid)'::regprocedure) into v_def;
  if v_def is null then
    raise exception 'F-A2 S2: clara._enqueue_invoice_facts_core is GONE' using errcode='CLR10';
  end if;
  v_frm := $f1$    elsif d.document_kind in ('invoice','credit_note','debit_note','receipt') then
      -- F-A1 PR-3 CUTOVER (design SS3.8/D9): the invoice path now mints llm_witness
      -- DIRECTLY -- NO DUAL-RUN. Exactly the SAME document-kind set the invoice_facts arm
      -- served (mirrored above, never widened here). v_engine MUST string-equal
      -- WITNESS_ENGINE_SNAPSHOT.engineId in witnessFacts.v1.services.mjs -- battery cell
      -- f-a1.cutover-engine-literal reads both sides and asserts equality.
      v_lane:='llm_witness'; v_engine:='llm-openai:gpt-5.6-terra:v1';$f1$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception 'F-A2 S2: the 0097 S1 edit-1 block appears % times (expected exactly 1) — the live body drifted from the 0097 S1 post-state shape', v_cnt
      using errcode='CLR10';
  end if;
  v_to := $t1$    elsif d.document_kind in ('invoice','credit_note','debit_note','receipt') then
      -- F-A1 PR-3 CUTOVER (design SS3.8/D9): the invoice path now mints llm_witness
      -- DIRECTLY -- NO DUAL-RUN. Exactly the SAME document-kind set the invoice_facts arm
      -- served (mirrored above, never widened here). F-A2 OPENER 2: the engine identity moves
      -- to :v2 because witnessFacts.v2 is a NEW frozen prompt closure and its reads answer
      -- different questions -- v_engine MUST string-equal WITNESS_ENGINE_SNAPSHOT.engineId in
      -- the witnessFacts.v2 services module -- battery cell f-a2.engine-literal reads both
      -- sides and asserts equality.
      v_lane:='llm_witness'; v_engine:='llm-openai:gpt-5.6-terra:v2';$t1$;
  v_def := replace(v_def, v_frm, v_to);
  execute v_def;
end
$fa2_router$;

reset role;

do $fa2_router_post$
declare v_src text; v_n int; v_sha text;
begin
  select p.prosrc into v_src from pg_proc p where p.oid='clara._enqueue_invoice_facts_core(uuid)'::regprocedure;
  if position($m$v_lane:='llm_witness'; v_engine:='llm-openai:gpt-5.6-terra:v2';$m$ in v_src) = 0 then
    raise exception 'F-A2 S2 postcheck: the invoice-kind arm does not mint llm_witness with the :v2 engine literal' using errcode='CLR10';
  end if;
  if position('llm-openai:gpt-5.6-terra:v1' in v_src) <> 0 then
    raise exception 'F-A2 S2 postcheck: the OLD :v1 engine literal is still present — the splice did not remove it' using errcode='CLR10';
  end if;
  -- EVERY 0097 PROPERTY THIS FILE DOES NOT NAME MUST SURVIVE VERBATIM. Re-asserted here rather
  -- than trusted to the splice, because "only the literal moved" is a claim and these are
  -- evidence: the four-kind condition set, the EITHER-REGIME short-circuit, the llm_witness
  -- engine_kind map, the typed-consent gate branch, both statement arms, and the page-budget
  -- reserving lane list that llm_witness must never join (meter-never-cap, D6).
  if position($m$d.document_kind in ('invoice','credit_note','debit_note','receipt')$m$ in v_src) = 0 then
    raise exception 'F-A2 S2 postcheck: the invoice-kind condition set moved' using errcode='CLR10';
  end if;
  if position($m$when v_lane='llm_witness'
                       then 'llm_text_facts'$m$ in v_src) = 0 then
    raise exception 'F-A2 S2 postcheck: the already_completed map no longer resolves llm_witness -> llm_text_facts' using errcode='CLR10';
  end if;
  if position($m$if v_task is null and v_lane='llm_witness' then$m$ in v_src) = 0 then
    raise exception 'F-A2 S2 postcheck: the M-4 EITHER-REGIME short-circuit was lost' using errcode='CLR10';
  end if;
  if position($m$elsif v_lane='llm_witness' then$m$ in v_src) = 0 then
    raise exception 'F-A2 S2 postcheck: the enqueue-time typed-consent gate branch was lost' using errcode='CLR10';
  end if;
  if position($m$v_lane:='statement_facts'; v_engine:='azure-di:prebuilt-bankStatement.us:2024-11-30';$m$ in v_src) = 0
     or position($m$v_lane:='statement_parse'; v_engine:='clara-statement-parse:v1';$m$ in v_src) = 0 then
    raise exception 'F-A2 S2 postcheck: a statement arm moved — both must stay byte-untouched' using errcode='CLR10';
  end if;
  if position($m$if v_lane in ('invoice_facts','statement_facts') then$m$ in v_src) = 0 then
    raise exception 'F-A2 S2 postcheck: the page-budget reserving lane list moved' using errcode='CLR10';
  end if;
  if position('llm_witness' in
      substring(v_src from position($m$if v_lane in ('invoice_facts','statement_facts') then$m$ in v_src)
                for 200)) <> 0 then
    raise exception 'F-A2 S2 postcheck: llm_witness leaked into the page-budget reserving list — meter-never-cap (D6) violated' using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_proc p, aclexplode(p.proacl) a
    where p.oid='clara._enqueue_invoice_facts_core(uuid)'::regprocedure and a.grantee<>'clara_fn_owner'::regrole;
  if v_n <> 0 then
    raise exception 'F-A2 S2 postcheck: _enqueue_invoice_facts_core gained a grant to a role other than clara_fn_owner' using errcode='CLR10';
  end if;
  if not exists (select 1 from pg_proc p where p.oid='clara._enqueue_invoice_facts_core(uuid)'::regprocedure
                   and p.prosecdef and p.proconfig @> array['search_path=clara, pg_temp']
                   and pg_get_userbyid(p.proowner) = 'clara_fn_owner') then
    raise exception 'F-A2 S2 postcheck: _enqueue_invoice_facts_core is no longer a search_path-pinned SECURITY DEFINER owned by clara_fn_owner' using errcode='CLR10';
  end if;
  v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
  -- THE HANDOFF THE NEXT RECUT NEEDS. The follow-on statement-ACTIVATION migration recuts this
  -- same body and pins its own prestate to the body it inherits — which is THIS one, not the
  -- 0097 post-state. Printed rather than derived, so the pin is copied from an as-run.
  raise notice 'F-A2 S2: clara._enqueue_invoice_facts_core recut — the invoice-kind arm now mints llm_witness with engine llm-openai:gpt-5.6-terra:v2; the four-kind condition set, the EITHER-REGIME already_completed short-circuit, the llm_text_facts engine_kind map, the typed-consent gate branch, both statement arms and the page-budget reserving list are all verified byte-unmoved; ACL/ownership unmoved. HANDOFF — this body''s prosrc sha256 is now % : the follow-on statement-activation recut of this SAME body must pin ITS prestate against this value, never against the 0097 post-state.', v_sha;
end
$fa2_router_post$;

-- =====================================================================================
-- §3 — clara.request_reextraction: THE SAME ENGINE LITERAL BUMP.
-- =====================================================================================
-- NOT wb-0020 pinned (only the two claim-body / enqueue-core functions carry that pin, wall 12),
-- but it carries the same D1 obligation and the same contract: a re-extraction and a first
-- extraction must buy the IDENTICAL product, so the two literals move together or not at all.
-- The tail asserts they are equal by reading BOTH catalog bodies, never by trusting this file.
set role clara_fn_owner;

do $fa2_reext$
declare v_def text; v_next text; v_frm text; v_to text; v_cnt int;
begin
  select pg_get_functiondef('clara.request_reextraction(uuid,text,text)'::regprocedure) into v_def;
  if v_def is null then
    raise exception 'F-A2 S3: clara.request_reextraction is GONE' using errcode='CLR10';
  end if;
  v_frm := $f2$    -- F-A1 PR-3 (design D7/D9): the invoice re-extraction path now mints
    -- llm_witness -- the SAME engine literal the cutover router mints (section 1 above;
    -- WITNESS_ENGINE_SNAPSHOT.engineId in witnessFacts.v1.services.mjs; battery cell
    -- f-a1.cutover-engine-literal asserts equality). The retiring Azure engine constant this
    -- line named (0026:1059 lineage) retires with it.
    v_lane := 'llm_witness'; v_engine := 'llm-openai:gpt-5.6-terra:v1';$f2$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception 'F-A2 S3: the 0097 S3 edit-1 block appears % times (expected exactly 1) — the live body drifted from the 0097 S3 post-state shape', v_cnt
      using errcode='CLR10';
  end if;
  v_to := $t2$    -- F-A1 PR-3 (design D7/D9): the invoice re-extraction path now mints
    -- llm_witness -- the SAME engine literal the cutover router mints (section 2 above).
    -- F-A2 OPENER 2: that literal moves to :v2 with the witnessFacts.v2 prompt closure --
    -- WITNESS_ENGINE_SNAPSHOT.engineId in the witnessFacts.v2 services module; battery cell
    -- f-a2.engine-literal asserts equality. The retiring Azure engine constant this
    -- line named (0026:1059 lineage) retired with the PR-3 cutover.
    v_lane := 'llm_witness'; v_engine := 'llm-openai:gpt-5.6-terra:v2';$t2$;
  v_def := replace(v_def, v_frm, v_to);
  execute v_def;
end
$fa2_reext$;

reset role;

do $fa2_reext_post$
declare v_src text; v_n int;
begin
  select p.prosrc into v_src from pg_proc p where p.oid='clara.request_reextraction(uuid,text,text)'::regprocedure;
  if position($m$v_lane := 'llm_witness'; v_engine := 'llm-openai:gpt-5.6-terra:v2';$m$ in v_src) = 0 then
    raise exception 'F-A2 S3 postcheck: the invoice-shaped re-extraction arm does not mint llm_witness with the :v2 engine literal' using errcode='CLR10';
  end if;
  if position('llm-openai:gpt-5.6-terra:v1' in v_src) <> 0 then
    raise exception 'F-A2 S3 postcheck: the OLD :v1 engine literal is still present — the splice did not remove it' using errcode='CLR10';
  end if;
  -- Every 0097 S3 property this file does not name, re-asserted.
  if position($m$e.engine_kind in ('invoice_facts', 'llm_text_facts')$m$ in v_src) = 0 then
    raise exception 'F-A2 S3 postcheck: the primary admission door no longer admits a done llm_text_facts row' using errcode='CLR10';
  end if;
  if position($m$e.engine_kind in ('invoice_facts', 'llm_text_facts')$m$ in v_src)
     >= position($m$elsif d.document_kind = 'receipt' then$m$ in v_src) then
    raise exception 'F-A2 S3 postcheck: the widened admission door is not BEFORE the receipt_backfill arm — branch order regressed' using errcode='CLR10';
  end if;
  if position($m$v_lane := 'local_facts'; v_engine := 'clara-myinvois:v1';$m$ in v_src) = 0 then
    raise exception 'F-A2 S3 postcheck: the xml/local_facts arm moved — it must stay byte-untouched' using errcode='CLR10';
  end if;
  if position($m$if not v_reused and v_lane = 'invoice_facts' then$m$ in v_src) = 0 then
    raise exception 'F-A2 S3 postcheck: the page-budget reservation clause moved or was widened to llm_witness' using errcode='CLR10';
  end if;
  if position($m$or (v_lane = 'llm_witness' and ptf.lane = 'invoice_facts')$m$ in v_src) = 0 then
    raise exception 'F-A2 S3 postcheck: M-6 regressed — filed_bootstrap''s lane guard no longer reads BOTH lanes' using errcode='CLR10';
  end if;
  if position($m$coalesce(d.document_kind, '') not in ('invoice', 'credit_note', 'debit_note', 'receipt')$m$ in v_src) = 0 then
    raise exception 'F-A2 S3 postcheck: the kind gate''s admitted set moved' using errcode='CLR10';
  end if;
  if position('v_admission := ''receipt_backfill'';' in v_src) = 0 or position('filed_bootstrap' in v_src) = 0 then
    raise exception 'F-A2 S3 postcheck: the receipt_backfill or filed_bootstrap door was lost' using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_proc p, aclexplode(p.proacl) a
    where p.oid='clara.request_reextraction(uuid,text,text)'::regprocedure
      and a.grantee <> 'clara_fn_owner'::regrole and a.grantee <> 'clara_authenticated'::regrole;
  if v_n <> 0 then
    raise exception 'F-A2 S3 postcheck: request_reextraction gained a grant to a role other than clara_fn_owner/clara_authenticated' using errcode='CLR10';
  end if;
  if not exists (select 1 from pg_proc p where p.oid='clara.request_reextraction(uuid,text,text)'::regprocedure
                   and p.prosecdef and p.proconfig @> array['search_path=clara, pg_temp']
                   and pg_get_userbyid(p.proowner) = 'clara_fn_owner') then
    raise exception 'F-A2 S3 postcheck: request_reextraction is no longer a search_path-pinned SECURITY DEFINER owned by clara_fn_owner' using errcode='CLR10';
  end if;
  raise notice 'F-A2 S3: clara.request_reextraction recut — the invoice-shaped arm mints llm_witness with engine llm-openai:gpt-5.6-terra:v2; the widened admission door, its branch order, the xml arm, the invoice_facts-only page-budget reservation clause, the M-6 either-regime bootstrap guard and both fallback doors are all verified byte-unmoved; ACL/ownership unmoved.';
end
$fa2_reext_post$;

-- =====================================================================================
-- §4 — TAIL CENSUS. The evidence a reviewer reads.
-- =====================================================================================
do $fa2_tail1$
declare v_changed text; v_new text; v_router text; v_reext text; v_n int;
begin
  -- (C1) EXACTLY THREE BODIES MOVED, AND THEY ARE THE THREE THIS FILE NAMES — derived from a
  -- whole-schema prosrc snapshot taken before any DDL, not from a list somebody maintained.
  select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text collate "C") into v_changed
    from pg_proc p join _fa2p1_pre_fn pre on pre.oid = p.oid
   where pre.sha <> encode(sha256(convert_to(p.prosrc,'UTF8')),'hex');
  if coalesce(v_changed,'') <> '_enqueue_invoice_facts_core(uuid), _witness_answers_ok(jsonb,text), request_reextraction(uuid,text,text)' then
    raise exception 'F-A2 part1 tail: the set of CHANGED clara bodies is [%] — expected exactly [_enqueue_invoice_facts_core(uuid), _witness_answers_ok(jsonb,text), request_reextraction(uuid,text,text)]', coalesce(v_changed,'(none)')
      using errcode='CLR10';
  end if;
  select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text collate "C") into v_new
    from pg_proc p where p.pronamespace='clara'::regnamespace and p.prosrc is not null
     and not exists (select 1 from _fa2p1_pre_fn pre where pre.oid = p.oid);
  if v_new is not null then
    raise exception 'F-A2 part1 tail: it created new functions [%] — part 1 must only RECUT', v_new using errcode='CLR10';
  end if;

  -- (C2) THE TWO ENGINE LITERALS AGREE, read INDEPENDENTLY from the two catalog bodies. A
  -- re-extraction and a first extraction must buy the identical product; comparing this file's
  -- own two string constants would prove only that this file is self-consistent.
  select substring(p.prosrc from 'llm-openai:gpt-5[.]6-terra:v[0-9]+') into v_router
    from pg_proc p where p.oid='clara._enqueue_invoice_facts_core(uuid)'::regprocedure;
  select substring(p.prosrc from 'llm-openai:gpt-5[.]6-terra:v[0-9]+') into v_reext
    from pg_proc p where p.oid='clara.request_reextraction(uuid,text,text)'::regprocedure;
  if v_router is null or v_reext is null or v_router <> v_reext then
    raise exception 'F-A2 part1 tail: the router mints engine [%] while request_reextraction mints [%] — the two doors must buy the identical product', coalesce(v_router,'(none)'), coalesce(v_reext,'(none)')
      using errcode='CLR10';
  end if;
  if v_router <> 'llm-openai:gpt-5.6-terra:v2' then
    raise exception 'F-A2 part1 tail: the witness engine literal is [%], expected llm-openai:gpt-5.6-terra:v2', v_router using errcode='CLR10';
  end if;

  -- (C3) NO WITNESS ROW YET CARRIES THE NEW ENGINE IDENTITY. Not a requirement — a fact,
  -- printed, so the ceremony's own output records the transition population's starting size.
  select count(*)::int into v_n from clara.document_extractions e
   where e.engine_id = 'llm-openai:gpt-5.6-terra:v2';
  raise notice 'F-A2 part1 tail: OK — exactly 3 bodies recut and 0 created; clara._witness_answers_ok admits invoice.sst_registration through a third optional-present array (behaviourally proven at apply, eight verdicts); both engine doors read INDEPENDENTLY from the catalog carry the identical literal llm-openai:gpt-5.6-terra:v2; % extraction row(s) already carry that engine identity. DEPLOY ORDER FOR THIS WINDOW IS DB-FIRST, RUNTIME-SECOND — the OPPOSITE of the PR-3 cutover''s rule — because a witnessFacts.v2 image against a pre-widened validator raises CLR10 on every persist. No table in workflow/graphile_worker/spike touched.', v_n;
end
$fa2_tail1$;
