-- =====================================================================================
-- DB-A / 7 of 7 -- THE OPENING-APPROVAL SERIALIZABLE proconfig PIN LEAVES CEREMONY-LAND
-- (CB-AE2E-004, DB half).
--
-- THE DEFECT. clara.approve_opening_seed and clara.approve_opening_correction each raise
-- CLR31 with detail {"reason":"not_serializable"} unless
-- current_setting('transaction_isolation') = 'serializable' (0017:3834-3836 and
-- 0017:4172-4174). PostgREST honours a function's proconfig default_transaction_isolation
-- when it opens the RPC transaction, and the pin that supplies it lives at
-- packages/db/deploy/wave-b-0017-ceremony.sql:14-17 -- whose own header says it is "NOT a
-- migration -- applied manually in the ceremony window". It is NOT in the migrate path:
-- scripts/migrate.mjs references no deploy/ file, and the only two deploy/*.sql any CI action
-- applies are roles-bootstrap.sql and storage-provision.sql.
--
-- SO WITHOUT THE CEREMONY, EVERY OPENING-SEED AND OPENING-CORRECTION APPROVAL REFUSES CLR31
-- IN THE BROWSER while the rig stays green -- and three separate instruments all miss it:
--   (1) THE RIG IS STRUCTURALLY BLIND. packages/db/tests/wave-b/wb-fixtures.mjs:252-256's
--       asHumanTxn issues `begin isolation level serializable` at the SESSION level, so the
--       in-body assert is satisfied without the proconfig ever being consulted. The rig would
--       pass identically on a database where the pin was never applied.
--   (2) DR-VERIFY IS RELATIVE, NOT ABSOLUTE. The proconfig rides the source-vs-target
--       function-definition diff, so if the LIVE SOURCE also lacks the pin, source and target
--       agree and the check reads PASS.
--   (3) /ready DOES NOT PROBE IT. A repo-wide grep for default_transaction_isolation returns
--       zero hits under packages/runtime/src, apps/, scripts/ or .github/.
-- The only absolute assertion of the pin lives INSIDE the ceremony file itself, which exists
-- only when the ceremony runs -- exactly the condition it is supposed to verify.
--
-- WHY THIS BELONGS IN A MIGRATION. `alter function ... set default_transaction_isolation` is
-- idempotent DDL on a body the chain already owns. It changes the function's ATTRIBUTES, not
-- its body, so no in-flight call runs a stale definition and no D1 write-quiesce window is
-- owed. packages/db/README.md's "Transaction-isolation pins" section governs the MIGRATION
-- runner's own BEGIN and its MIGRATION_ISOLATION_PINS list -- it says nothing that requires a
-- function-level proconfig to stay a ceremony, so promoting it is lawful. Checked before
-- writing this file rather than assumed.
--
-- IT IS OWNER-VISIBLE BEHAVIOUR, AND IT IS THE BEHAVIOUR THE BODIES ALREADY DEMAND. These two
-- RPCs will now open serializable transactions wherever the ceremony has not already made
-- them do so. That is a real change to their concurrency posture -- a serialization failure
-- (40001) becomes possible where a lost update was possible before -- and it is the posture
-- the in-body asserts have required since 0017. The alternative is a door that refuses in
-- production and passes on the rig.
--
-- THE STANDING INSTRUMENT IS THE OTHER HALF and it does not live here: an ABSOLUTE,
-- target-only cell in packages/db/scripts/dr-verify-checks.mjs that FAILS (never SKIPs) when
-- either regprocedure lacks the pin. A migration proves the pin on databases that take this
-- chain; the dr-verify cell proves it on a restored target that may not have.
-- =====================================================================================

-- Precautionary, not load-bearing: two ALTER FUNCTION statements, no data movement. Each
-- takes a brief ACCESS EXCLUSIVE lock on the function's catalog row.
set local statement_timeout = '5min';
set local lock_timeout = '5s';

-- =====================================================================================
-- PRESTATE
-- =====================================================================================
do $dba7_pre$
declare v_sig text; v_n int := 0; v_pinned int := 0; v_src text;
begin
  foreach v_sig in array array['clara.approve_opening_seed(uuid,uuid,text,jsonb,text,text)',
                               'clara.approve_opening_correction(uuid,jsonb,text,text)'] loop
    if to_regprocedure(v_sig) is null then
      raise exception 'dba7 prestate: % does not resolve -- the pin below would name a body that is not there', v_sig
        using errcode = 'CLR10';
    end if;
    v_n := v_n + 1;
    -- THE ASSERT THAT MAKES THE PIN NECESSARY, witnessed in the live body. If a future
    -- frontier removed the in-body serializable check, this whole file would be pinning an
    -- isolation level nothing requires -- a real behavioural change for no reason.
    select p.prosrc into v_src from pg_proc p where p.oid = v_sig::regprocedure;
    if position('not_serializable' in v_src) = 0 then
      raise exception 'dba7 prestate: % does not carry the not_serializable assert -- the reason for this pin is gone', v_sig
        using errcode = 'CLR10';
    end if;
    if exists (select 1 from pg_proc p where p.oid = v_sig::regprocedure
                and p.proconfig::text like '%default_transaction_isolation=serializable%') then
      v_pinned := v_pinned + 1;
    end if;
  end loop;
  if v_n <> 2 then
    raise exception 'dba7 prestate: expected 2 opening-approval bodies, resolved %', v_n using errcode = 'CLR10';
  end if;
  -- BOTH STATES ARE LAWFUL HERE, and the notice says which one this database was in. A
  -- database where the ceremony HAS run reaches this file already pinned; the ALTERs below
  -- are then genuine no-ops rather than a re-application, which is exactly why this file can
  -- ride the ordinary chain onto live.
  raise notice 'dba7 prestate: both opening-approval bodies resolve and both still carry the in-body not_serializable assert; % of 2 already carry the proconfig pin (0 = the ceremony never ran here, 2 = it did).', v_pinned;
end $dba7_pre$;

-- =====================================================================================
-- S1 -- THE PIN. Lifted verbatim from packages/db/deploy/wave-b-0017-ceremony.sql:14-17.
--
-- ALTER FUNCTION ... SET is idempotent by construction: setting a GUC to the value it
-- already holds rewrites the same proconfig entry. No `if not exists` guard is needed and
-- none is written, because a guard here would be decoration pretending to be safety.
-- =====================================================================================
alter function clara.approve_opening_seed(uuid, uuid, text, jsonb, text, text)
  set default_transaction_isolation = 'serializable';
alter function clara.approve_opening_correction(uuid, jsonb, text, text)
  set default_transaction_isolation = 'serializable';

-- =====================================================================================
-- TAIL CENSUS -- the ceremony file's own absolute assertion (:20-29), lifted into the chain.
-- =====================================================================================
do $dba7_tail$
declare v int := 0; v_owner int; v_acl int;
begin
  select count(*) into v from pg_proc
   where oid in ('clara.approve_opening_seed(uuid,uuid,text,jsonb,text,text)'::regprocedure,
                 'clara.approve_opening_correction(uuid,jsonb,text,text)'::regprocedure)
     and proconfig::text like '%default_transaction_isolation=serializable%';
  if v <> 2 then
    raise exception 'dba7 tail: serializable proconfig present on % of 2 opening-approval bodies', v
      using errcode = 'CLR10';
  end if;
  -- THE SEARCH_PATH PIN MUST HAVE SURVIVED. ALTER FUNCTION ... SET adds one GUC; it must not
  -- have displaced the search_path pin these definer bodies depend on, which is the kind of
  -- thing nobody notices until a body resolves a name it should not have.
  select count(*) into v from pg_proc
   where oid in ('clara.approve_opening_seed(uuid,uuid,text,jsonb,text,text)'::regprocedure,
                 'clara.approve_opening_correction(uuid,jsonb,text,text)'::regprocedure)
     and array_to_string(proconfig, ',') like '%search_path%';
  if v <> 2 then
    raise exception 'dba7 tail: the search_path pin survived on only % of 2 bodies', v using errcode = 'CLR10';
  end if;
  -- OWNER AND ACL: an ALTER that changed either would be a different door.
  select count(*) into v_owner from pg_proc
   where oid in ('clara.approve_opening_seed(uuid,uuid,text,jsonb,text,text)'::regprocedure,
                 'clara.approve_opening_correction(uuid,jsonb,text,text)'::regprocedure)
     and proowner = 'clara_fn_owner'::regrole;
  select count(*) into v_acl from pg_proc p
   where p.oid in ('clara.approve_opening_seed(uuid,uuid,text,jsonb,text,text)'::regprocedure,
                   'clara.approve_opening_correction(uuid,jsonb,text,text)'::regprocedure)
     and pg_catalog.has_function_privilege('clara_authenticated', p.oid, 'execute');
  if v_owner <> 2 or v_acl <> 2 then
    raise exception 'dba7 tail: owner census % of 2, clara_authenticated EXECUTE census % of 2', v_owner, v_acl
      using errcode = 'CLR10';
  end if;
  raise notice 'dba7 tail: OK -- BOTH opening-approval regprocedures now carry default_transaction_isolation=serializable in proconfig, read back from pg_proc by exact signature (never by name), with the search_path pin intact on both, clara_fn_owner still the owner of both and clara_authenticated still holding EXECUTE on both. The pin is no longer a hand-run ceremony step: packages/db/deploy/wave-b-0017-ceremony.sql Part A is now redundant on any database that takes this chain, and remains correct on one that does not. Part B (the Storage wiki RLS policy pair, storage schema) and Part C (the wiki_projection checkpoint seed) are NOT promoted by this file and remain ceremony work. The standing detector for a RESTORED target that never took this chain is the absolute dr-verify cell shipped alongside this migration. No table in workflow/graphile_worker/spike touched. D1: ATTRIBUTE-only DDL -- the bodies are unchanged, so no in-flight call can run a stale definition and no write-quiesce window is owed.';
end $dba7_tail$;
