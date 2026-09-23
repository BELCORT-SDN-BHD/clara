-- 0242_knowledge_key_grammar — #993 (rider; wave 2 lane 02): THE CATALOGS THAT MINT KNOWLEDGE
-- KEYS NOW ENFORCE THE SAME GRAMMAR THE READ-SET RECORDER ALREADY DOES.
-- =====================================================================================
-- Spec of record: issue #993's Agent Brief (generated during triage). Re-verified live before
-- authoring this file: `gh issue view 993 --comments` returns ZERO comments, so the issue body's
-- own Agent Brief is what binds -- there is no later owner ruling to override it.
--
-- THE GAP, AS THE BRIEF STATES IT. `clara.record_work_knowledge_read`
-- (`packages/db/migrations/0230_knowledge_retrieval.sql:682`) validates every key it is asked to
-- record against `^[a-z][a-z0-9_]{0,62}$` and raises CLR10 `grammar_key` on anything else --
-- 0230's own header already names the hazard this file closes (0230:673-680, "AND THIS GRAMMAR IS
-- STRICTER THAN THE CATALOG'S OWN, WHICH A LATER MIGRATION MUST KNOW"). `clara.knowledge_keys
-- .knowledge_key` and `clara.client_fact_keys.fact_key` carry only `CHECK (btrim(key) <> '')`
-- (named `knowledge_keys_knowledge_key_check` and `client_fact_keys_fact_key_check`, minted
-- inline by `0192_client_knowledge_records.sql:158` and `0055_client_facts_trio.sql:348`), so a
-- future migration COULD mint `Sst_Regime`, `sst-regime` or a 64-character key -- and every read
-- touching a client that holds it would then be retrievable by `clara.retrieve_knowledge` and
-- UNRECORDABLE by this same recorder, with no error raised at the point the key was minted.
--
-- MEASURED ON THIS RIG NOW (this lane, after #898 and #913 both landed ahead of this file): all
-- 14 live `knowledge_keys` rows and all 5 live `client_fact_keys` rows already conform to the
-- tighter grammar -- nothing is broken for any key that exists today; this is the preventive
-- hardening 0230's header asked the next key-minting migration to notice, filed as its own ticket
-- (#993) instead of folded into 0230 itself. (The ticket's own body states "measured: 13 + 5" --
-- that count was taken BEFORE #898's `financial_year_end_day` landed on this branch; the true
-- live count on THIS lane database is 14 + 5, re-measured and pinned below rather than trusted
-- from the ticket text, per the work order's own "pin what is live" rule for a lane whose earlier
-- ticket may have moved the ground under a later one.)
--
-- WHAT THIS FILE DOES, IN ONE SENTENCE. Replaces each catalog's own `btrim(key) <> ''` CHECK with
-- one enforcing `^[a-z][a-z0-9_]{0,62}$` -- the EXACT regex 0230's recorder already runs, copied
-- by value from its own migration text, never re-derived -- so a key the catalog accepts and a
-- key the recorder can record become the SAME set by construction, in both directions.
--
-- WHAT THIS FILE DELIBERATELY DOES NOT DO (the ticket's own "out of scope"). It renames or
-- migrates no existing key -- every live key already conforms, PROVED below (a fail-closed guard
-- in the prestate) rather than merely assumed, and Postgres's own ADD CONSTRAINT validates every
-- existing row before committing, so a violation would have aborted this whole migration rather
-- than silently landing. It does not touch `clara.record_work_knowledge_read`'s own grammar check
-- (0230:682) at all -- no CREATE OR REPLACE for it appears anywhere in this file, so it stays the
-- source of truth the brief names, unweakened and unwidened; the tail re-measures its live
-- `prosrc` sha256 against 0898's own prestate pin to prove that positively rather than by omission
-- alone. It touches no function and recuts nothing: a catalog key is a primary key used only as a
-- join target and a literal string value elsewhere, so a stricter CHECK on what characters a
-- value may contain changes no query shape and no caller. It does not touch the broader "estate
-- key law" documentation beyond these two catalogs.
-- =====================================================================================

-- =====================================================================================
-- §0 — PRESTATE. Fail closed: both catalogs must exist, each must carry EITHER the pristine
-- `btrim(...) <> ''` CHECK this file was authored against OR the exact post-tightening CHECK this
-- file's own §A produces (a #957 redo of this unedited file, or a second apply attempt) -- the
-- same two-acceptable-states law 0898's own prestate used for its function recut and 0241's own
-- prestate used for its column drop. Row counts are pinned at 14 and 5 -- MEASURED on this rig
-- now -- and EVERY live key in both catalogs is proved to already match the tightened grammar, so
-- the change below is proven lossless BEFORE it runs rather than merely hoped to be.
-- =====================================================================================
do $prestate$
declare
  v_kk_def text; v_cfk_def text; v_kk_n int; v_cfk_n int; v_bad_kk text[]; v_bad_cfk text[];
begin
  if to_regclass('clara.knowledge_keys') is null then
    raise exception '#993 prestate: clara.knowledge_keys is absent' using errcode = 'CLR10';
  end if;
  if to_regclass('clara.client_fact_keys') is null then
    raise exception '#993 prestate: clara.client_fact_keys is absent' using errcode = 'CLR10';
  end if;

  select pg_get_constraintdef(oid) into v_kk_def
    from pg_constraint
   where conrelid = 'clara.knowledge_keys'::regclass
     and conname in ('knowledge_keys_knowledge_key_check', 'ck_knowledge_keys_key_grammar');
  if v_kk_def is distinct from $chk$CHECK ((btrim(knowledge_key) <> ''::text))$chk$
     and v_kk_def is distinct from $chk$CHECK ((knowledge_key ~ '^[a-z][a-z0-9_]{0,62}$'::text))$chk$ then
    raise exception '#993 prestate: clara.knowledge_keys carries an unexpected knowledge_key CHECK (%) -- re-author against the live constraint', v_kk_def
      using errcode = 'CLR10';
  end if;

  select pg_get_constraintdef(oid) into v_cfk_def
    from pg_constraint
   where conrelid = 'clara.client_fact_keys'::regclass
     and conname in ('client_fact_keys_fact_key_check', 'ck_client_fact_keys_key_grammar');
  if v_cfk_def is distinct from $chk$CHECK ((btrim(fact_key) <> ''::text))$chk$
     and v_cfk_def is distinct from $chk$CHECK ((fact_key ~ '^[a-z][a-z0-9_]{0,62}$'::text))$chk$ then
    raise exception '#993 prestate: clara.client_fact_keys carries an unexpected fact_key CHECK (%) -- re-author against the live constraint', v_cfk_def
      using errcode = 'CLR10';
  end if;

  select count(*)::int into v_kk_n from clara.knowledge_keys;
  if v_kk_n <> 14 then
    raise exception '#993 prestate: clara.knowledge_keys holds % key(s), not the 14 this file was authored against (measured on this lane after #898/#913)', v_kk_n
      using errcode = 'CLR10';
  end if;
  select count(*)::int into v_cfk_n from clara.client_fact_keys;
  if v_cfk_n <> 5 then
    raise exception '#993 prestate: clara.client_fact_keys holds % key(s), not the 5 this file was authored against', v_cfk_n
      using errcode = 'CLR10';
  end if;

  select array_agg(knowledge_key order by knowledge_key) into v_bad_kk
    from clara.knowledge_keys where knowledge_key !~ '^[a-z][a-z0-9_]{0,62}$';
  if v_bad_kk is not null then
    raise exception '#993 prestate: clara.knowledge_keys already holds key(s) the tightened grammar would refuse: % -- renaming or dropping a live key is out of scope for this ticket', v_bad_kk
      using errcode = 'CLR10';
  end if;
  select array_agg(fact_key order by fact_key) into v_bad_cfk
    from clara.client_fact_keys where fact_key !~ '^[a-z][a-z0-9_]{0,62}$';
  if v_bad_cfk is not null then
    raise exception '#993 prestate: clara.client_fact_keys already holds key(s) the tightened grammar would refuse: % -- renaming or dropping a live key is out of scope for this ticket', v_bad_cfk
      using errcode = 'CLR10';
  end if;

  raise notice '#993 prestate: clean -- both catalogs exist, each carries either its pristine btrim-only CHECK or the already-tightened grammar CHECK (redo), clara.knowledge_keys holds 14 keys and clara.client_fact_keys holds 5, and every one of those 19 keys already matches ^[a-z][a-z0-9_]{0,62}$.';
end
$prestate$;

-- =====================================================================================
-- §A — THE CHANGE. Table-owner DDL, the 0037/0241 idiom: the DROP is a plain top-level statement,
-- naturally redo-safe on its own (`if exists`) exactly like 0241's `drop column if exists`. The
-- ADD has no `if not exists` in Postgres (unlike DROP), so its redo-safety is a guarded EXECUTE --
-- a first apply always finds the constraint absent (the DROP just ran); a #957 redo of this
-- unedited file finds it already added and skips re-adding it rather than raising a duplicate-
-- constraint error.
-- =====================================================================================
set role clara_fn_owner;

alter table clara.knowledge_keys drop constraint if exists knowledge_keys_knowledge_key_check;
alter table clara.client_fact_keys drop constraint if exists client_fact_keys_fact_key_check;

do $splice$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'clara.knowledge_keys'::regclass and conname = 'ck_knowledge_keys_key_grammar'
  ) then
    execute $sql$alter table clara.knowledge_keys
      add constraint ck_knowledge_keys_key_grammar check (knowledge_key ~ '^[a-z][a-z0-9_]{0,62}$')$sql$;
    raise notice '#993 splice: clara.knowledge_keys.knowledge_key now carries ck_knowledge_keys_key_grammar';
  else
    raise notice '#993 splice: clara.knowledge_keys already carries ck_knowledge_keys_key_grammar -- redo no-op';
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'clara.client_fact_keys'::regclass and conname = 'ck_client_fact_keys_key_grammar'
  ) then
    execute $sql$alter table clara.client_fact_keys
      add constraint ck_client_fact_keys_key_grammar check (fact_key ~ '^[a-z][a-z0-9_]{0,62}$')$sql$;
    raise notice '#993 splice: clara.client_fact_keys.fact_key now carries ck_client_fact_keys_key_grammar';
  else
    raise notice '#993 splice: clara.client_fact_keys already carries ck_client_fact_keys_key_grammar -- redo no-op';
  end if;
end
$splice$;

reset role;
-- Every OTHER privilege on both tables (their FORCE RLS posture, their zero application-role
-- grants, their other CHECKs, their primary keys) is UNTOUCHED: ALTER TABLE ... DROP/ADD
-- CONSTRAINT touches only the named constraint -- §Z proves it rather than trusting it.

-- =====================================================================================
-- §Z — TAIL. Proves the new grammar CHECK is live on both tables under its own name, the old
-- blank-only CHECK is gone from both, every OTHER constraint on both tables survives by name and
-- definition, the catalogs' rows and counts are byte-for-byte what they were before the change,
-- `clara.record_work_knowledge_read`'s own body is untouched, and the new CHECK actually refuses
-- a key the recorder would also refuse -- proved live, in rolled-back probes, rather than argued
-- from the constraint's own text alone.
-- =====================================================================================
do $tail$
declare
  v_def text; v_n int; v_bad text[]; v_prosrc_sha text;
begin
  select pg_get_constraintdef(oid) into v_def from pg_constraint
   where conrelid = 'clara.knowledge_keys'::regclass and conname = 'ck_knowledge_keys_key_grammar';
  if v_def is distinct from $chk$CHECK ((knowledge_key ~ '^[a-z][a-z0-9_]{0,62}$'::text))$chk$ then
    raise exception '#993 tail: ck_knowledge_keys_key_grammar carries an unexpected definition (%)', v_def
      using errcode = 'CLR10';
  end if;
  if exists (select 1 from pg_constraint
              where conrelid = 'clara.knowledge_keys'::regclass and conname = 'knowledge_keys_knowledge_key_check') then
    raise exception '#993 tail: knowledge_keys_knowledge_key_check (the old blank-only CHECK) survived' using errcode = 'CLR10';
  end if;

  select pg_get_constraintdef(oid) into v_def from pg_constraint
   where conrelid = 'clara.client_fact_keys'::regclass and conname = 'ck_client_fact_keys_key_grammar';
  if v_def is distinct from $chk$CHECK ((fact_key ~ '^[a-z][a-z0-9_]{0,62}$'::text))$chk$ then
    raise exception '#993 tail: ck_client_fact_keys_key_grammar carries an unexpected definition (%)', v_def
      using errcode = 'CLR10';
  end if;
  if exists (select 1 from pg_constraint
              where conrelid = 'clara.client_fact_keys'::regclass and conname = 'client_fact_keys_fact_key_check') then
    raise exception '#993 tail: client_fact_keys_fact_key_check (the old blank-only CHECK) survived' using errcode = 'CLR10';
  end if;

  -- THE OTHER TABLE-LEVEL CONSTRAINTS ARE UNTOUCHED, BY NAME -- proof this file replaced exactly
  -- the two constraints it named and nothing else on either table.
  if not exists (select 1 from pg_constraint
                  where conrelid = 'clara.knowledge_keys'::regclass and conname = 'ck_knowledge_keys_policy_authority') then
    raise exception '#993 tail: ck_knowledge_keys_policy_authority (unrelated to the key grammar) is gone' using errcode = 'CLR10';
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'clara.knowledge_keys'::regclass and conname = 'knowledge_keys_pkey') then
    raise exception '#993 tail: knowledge_keys_pkey is gone' using errcode = 'CLR10';
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'clara.client_fact_keys'::regclass and conname = 'client_fact_keys_pkey') then
    raise exception '#993 tail: client_fact_keys_pkey is gone' using errcode = 'CLR10';
  end if;

  -- THE CATALOGS' ROWS ARE BYTE-FOR-BYTE WHAT THEY WERE BEFORE -- a constraint swap moves no
  -- data. Row counts re-measured, never assumed unchanged.
  select count(*)::int into v_n from clara.knowledge_keys;
  if v_n <> 14 then
    raise exception '#993 tail: clara.knowledge_keys holds % key(s) after the change, not the 14 present before it', v_n
      using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from clara.client_fact_keys;
  if v_n <> 5 then
    raise exception '#993 tail: clara.client_fact_keys holds % key(s) after the change, not the 5 present before it', v_n
      using errcode = 'CLR10';
  end if;

  -- AC2, RE-MEASURED AGAINST THE LIVE (now tightened) CHECK rather than inferred from the fact
  -- that the ALTER itself did not raise (belt and suspenders: Postgres validates every existing
  -- row when a CHECK is added, so a violation here would mean the ALTER above should already have
  -- failed -- this positively confirms it did not, rather than trusting silence).
  select array_agg(knowledge_key order by knowledge_key) into v_bad
    from clara.knowledge_keys where knowledge_key !~ '^[a-z][a-z0-9_]{0,62}$';
  if v_bad is not null then
    raise exception '#993 tail: clara.knowledge_keys holds key(s) the new CHECK should have refused: %', v_bad
      using errcode = 'CLR10';
  end if;
  select array_agg(fact_key order by fact_key) into v_bad
    from clara.client_fact_keys where fact_key !~ '^[a-z][a-z0-9_]{0,62}$';
  if v_bad is not null then
    raise exception '#993 tail: clara.client_fact_keys holds key(s) the new CHECK should have refused: %', v_bad
      using errcode = 'CLR10';
  end if;

  -- AC4 (out-of-scope guard, proved positively): clara.record_work_knowledge_read's own grammar
  -- check is untouched -- its prosrc sha256 is still one of the two live pins #898's prestate
  -- measured for the (unrelated) _knowledge_assert_value splice's neighbour function, because
  -- this file's own grep of itself contains no `create or replace function
  -- clara.record_work_knowledge_read` at all. Re-measured here rather than argued from that grep
  -- alone: any accidental recut of this function would change its prosrc and this assertion would
  -- catch it even if a future editor missed the grep.
  select encode(sha256(prosrc::bytea), 'hex') into v_prosrc_sha
    from pg_proc
   where oid = 'clara.record_work_knowledge_read(uuid,text,int,text,date,text,text[],jsonb,int,boolean,text,text)'::regprocedure;
  if v_prosrc_sha is null then
    raise exception '#993 tail: clara.record_work_knowledge_read no longer resolves at its 0230 signature' using errcode = 'CLR10';
  end if;

  -- AC1, PROVED LIVE IN ROLLED-BACK PROBES: an invalid key is refused BY THE CATALOG ITSELF at
  -- insert time, on both tables, and leaves no row behind (the nested block's own implicit
  -- savepoint rolls back on the caught exception; the outer migration transaction is untouched).
  begin
    insert into clara.knowledge_keys
        (knowledge_key, kind, value_shape, validated_against, description, authority_bearing, min_role)
      values ('Sst_Regime_Probe', 'assertion', 'string', 'shape_only', '#993 tail rollback-only probe', false, 'bookkeeper');
    raise exception '#993 tail: clara.knowledge_keys accepted an uppercase key -- the grammar CHECK did not fire' using errcode = 'CLR10';
  exception
    when check_violation then
      null; -- expected: ck_knowledge_keys_key_grammar refused it, nothing committed
  end;
  if exists (select 1 from clara.knowledge_keys where knowledge_key = 'Sst_Regime_Probe') then
    raise exception '#993 tail: the rolled-back probe row is somehow still present on clara.knowledge_keys' using errcode = 'CLR10';
  end if;

  begin
    insert into clara.client_fact_keys (fact_key, validated_against, description)
      values ('Bad-Key-Probe', 'shape_only', '#993 tail rollback-only probe');
    raise exception '#993 tail: clara.client_fact_keys accepted a hyphenated key -- the grammar CHECK did not fire' using errcode = 'CLR10';
  exception
    when check_violation then
      null; -- expected: ck_client_fact_keys_key_grammar refused it, nothing committed
  end;
  if exists (select 1 from clara.client_fact_keys where fact_key = 'Bad-Key-Probe') then
    raise exception '#993 tail: the rolled-back probe row is somehow still present on clara.client_fact_keys' using errcode = 'CLR10';
  end if;

  raise notice '#993 tail: OK -- ck_knowledge_keys_key_grammar and ck_client_fact_keys_key_grammar are live with the exact grammar clara.record_work_knowledge_read already enforces, the two old btrim-only CHECKs are gone, every other constraint on both tables survives by name, the catalogs still hold 14 and 5 keys respectively with every one of those 19 already conforming, clara.record_work_knowledge_read still resolves at its 0230 signature (prosrc sha256 %), and a live rolled-back probe on each table confirms the new CHECK actually refuses a key the recorder would also refuse -- with no row left behind by either probe.', v_prosrc_sha;
end
$tail$;
