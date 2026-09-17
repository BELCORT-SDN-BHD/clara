-- 0208_document_fact_validations_rls_row_proof — #780: 0191's OWN TAIL STOPS PINNING
-- clara.document_fact_validations' FIRM BOUNDARY BY COUNTING POLICIES AND STARTS PROVING IT BY
-- READING ROWS ACROSS TWO FIRMS, ON BOTH LANES.
-- =====================================================================================
-- Spec of record: issue #780 (Agent Brief, 2026-09-14), out of the #624 closure review's S2 —
-- "no cell reads `document_fact_validations` cross-firm; S2 rests on a policy count".
-- Parent file: 0191_document_capability_registry.sql, which is NOT edited here. Its sha-pinned
-- `persist_document_extraction` splice and its own count-of-policies assertion both stay
-- byte-for-byte as they are; this file ADDS the row proof ALONGSIDE that count, never instead.
--
-- WHAT WAS MEASURED, AND WHY A COUNT IS NOT A PROOF.
--
--   0191's "RLS AND GRANTS" sweep asserts firm-scoping for `clara.document_fact_validations` by
--   selecting `count(*)` from `pg_policies` for that table and comparing it to THREE, raising
--   CLR10 on mismatch. A predicate silently rewritten to `true`, or one lane's policy quietly
--   widened to the OTHER lane's accessor, leaves the count at three: the tail stays green while
--   every firm's validation rows become readable across the tenant boundary. A validation row
--   names an ARITHMETIC OUTCOME over another firm's documents, so leaking one leaks both the
--   existence of that firm's document and a judgement about its figures.
--
--   The row-based proof does exist — `packages/db/tests/document-fact-validation-belt.test.mjs`,
--   the cell titled "a validation row is read FIRM-SCOPED on both lanes — a firm-B human and a
--   firm-B agent each see none of firm A's". But it lives in a SEPARATE FILE from the migration
--   whose policies it protects, and the guarantee then depends on that file staying in sync with
--   the migration body. This tail is the same proof, in the file that owns the policies.
--   (The ticket calls it "cell 6"; the test file's own header assigns cell 6 to the statement
--   half and says "Cell 8 is the firm boundary on both read lanes". It is mirrored BY ITS TITLE.)
--
-- THE SHAPE IS THE BELT CELL'S, STEP FOR STEP, AND THE ORDER IS LOAD-BEARING.
--
--   1. Seed a validation row belonging to firm A through the path an in-repo writer takes — a
--      document, a `done` `invoice_facts` extraction and its identity regions, all in one
--      transaction, which is what `persist_document_extraction` / `persist_invoice_facts` /
--      `persist_witness_facts` produce and what the belt fixture reproduces. The row itself is
--      written by 0191's OWN deferred recorder (`t_document_extractions_fact_validate` ->
--      `clara._tf_document_fact_validate`), not by this file typing an INSERT: a hand-written row
--      would prove the policies against a shape no writer produces. The recorder is
--      DEFERRABLE INITIALLY DEFERRED and this tail cannot commit, so its event is forced with
--      `SET CONSTRAINTS ... IMMEDIATE` for that one constraint and handed back to DEFERRED after.
--   2. Create a second, independent firm B. Each firm needs a user holding a LIVE ACTIVE
--      membership (the human accessor `clara.jwt_firm()` resolves the JWT subject through
--      `clara.firm_memberships`) and a LIVE MINTED wake credential (the agent accessor
--      `clara.wake_firm()` resolves the `clara.wake_secret` GUC through the credential table).
--      Distinct users per firm, because `uq_membership_active_user` admits ONE active membership
--      per user, total.
--   3. POSITIVE CONTROL FIRST. Firm A's own human session and firm A's own agent session must
--      EACH read the row. A zero on its own is not evidence — an empty table, a missing grant, or
--      a wake credential that resolves to nothing all produce zero, and the cross-firm zeros
--      below would then prove nothing.
--   4. THE BOUNDARY, ONE LANE AT A TIME: a firm-B human session reads zero, a firm-B agent
--      session reads zero, each failure naming the lane AND the policy it implicates.
--   5. NEITHER LANE FALLS BACK TO THE OTHER'S ACCESSOR: firm A's wake secret set INSIDE a firm-B
--      human session still reads zero. `clara.actor_firm_id()` is `coalesce(wake_firm(),
--      jwt_firm())` and 0002's own comment forbids it as an authorization basis; this assertion
--      exists so it cannot be silently reintroduced under either policy.
--
-- TWO WAYS OF BEING GREEN WHILE PROVING NOTHING ARE THEMSELVES DEFECTS HERE, and both are
-- refused rather than tolerated: SKIPPING the probe when the migration role cannot assume a lane
-- role or mint a credential (it raises CLR10 and aborts — it never skips silently), and asserting
-- only the cross-firm zeros without the positive control (step 3 runs first, and raises CLR10).
--
-- LANE ASSUMPTION, PROBED RATHER THAN ASSUMED. The in-repo precedent inside a migration is a
-- transaction-local `set_config('role', …)` restored to `'none'`; no migration currently uses
-- `SET LOCAL ROLE` for the application roles, and MEMBERSHIP in those roles is a property of the
-- TARGET CLUSTER rather than of this file. §B therefore probes BOTH routes before taking either,
-- takes whichever exists, and raises CLR10 when neither does.
--
-- NOTHING IS LEFT BEHIND, AND THE SESSION IS HANDED BACK AS IT WAS. The fixtures are rolled back
-- through the estate's in-migration sentinel idiom (0016 D-P1's shape: a sentinel errcode raised
-- inside a sub-block and caught there), which also discards every transaction-local GUC and the
-- SET CONSTRAINTS change the probe made; the role is additionally restored explicitly on the
-- success path, because the runner's execution wrapper aborts a migration that exits with a
-- different `session_user` / `current_user` than it entered with.
--
-- WHAT THIS FILE DOES NOT DO: it does not edit 0191, does not remove or weaken 0191's
-- count-of-policies assertion (that check still catches an accidentally dropped or added policy,
-- which a row read cannot), does not change the three policy definitions or the grants around
-- them, does not extend row-based proof to `clara.document_capabilities` (a global vocabulary
-- with no tenant column and a `true` read predicate — there is no firm boundary there to read
-- across), and does not reshape the belt test file, which stays as it is and is the reference.
-- =====================================================================================

set local statement_timeout = '5min';   -- runner rule: statement_timeout is the first executable statement

-- =====================================================================================
-- §A  PRESTATE. The objects the proof reads, and the policies it is a proof ABOUT.
-- =====================================================================================
do $w780_pre$
declare v_n int;
begin
  if to_regclass('clara.document_fact_validations') is null then
    raise exception '#780 prestate: clara.document_fact_validations is absent -- 0191 must apply first'
      using errcode = 'CLR10';
  end if;
  -- THE THREE POLICIES BY NAME, not by count. 0191's tail keeps the count; this file is about
  -- the two predicates the count cannot see, so it names them.
  if not exists (select 1 from pg_policies where schemaname = 'clara'
                  and tablename = 'document_fact_validations' and policyname = 'p_document_fact_validations_human')
     or not exists (select 1 from pg_policies where schemaname = 'clara'
                  and tablename = 'document_fact_validations' and policyname = 'p_document_fact_validations_agent')
     or not exists (select 1 from pg_policies where schemaname = 'clara'
                  and tablename = 'document_fact_validations' and policyname = 'p_document_fact_validations_owner') then
    raise exception '#780 prestate: clara.document_fact_validations does not carry the owner + per-lane policy trio this proof is about'
      using errcode = 'CLR10';
  end if;

  select count(*)::int into v_n from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'clara' and c.relname = 'document_fact_validations'
     and c.relrowsecurity and c.relforcerowsecurity;
  if v_n <> 1 then
    raise exception '#780 prestate: forced RLS is not on clara.document_fact_validations -- the boundary this file proves would not exist'
      using errcode = 'CLR10';
  end if;

  -- The two accessors the two policies are written against, and the credential door the agent
  -- lane needs. An absent one would make a zero read meaningless.
  if to_regprocedure('clara.jwt_firm()') is null or to_regprocedure('clara.wake_firm()') is null then
    raise exception '#780 prestate: clara.jwt_firm / clara.wake_firm are not both present'
      using errcode = 'CLR10';
  end if;
  if to_regprocedure('clara.mint_wake_credential(text,uuid,uuid,interval,uuid)') is null then
    raise exception '#780 prestate: clara.mint_wake_credential is absent at its pinned signature -- the agent lane cannot be probed without a live credential'
      using errcode = 'CLR10';
  end if;

  -- 0191's OWN recorder, which is what writes the row this proof reads. A hand-written row would
  -- prove the policies against a shape no in-repo writer produces.
  if not exists (select 1 from pg_trigger t
                  where t.tgrelid = 'clara.document_extractions'::regclass
                    and t.tgname = 't_document_extractions_fact_validate') then
    raise exception '#780 prestate: 0191''s deferred recorder t_document_extractions_fact_validate is absent'
      using errcode = 'CLR10';
  end if;
end
$w780_pre$;

-- =====================================================================================
-- §B  THE ROW PROOF.
-- =====================================================================================
do $w780_proof$
declare
  v_route      text;
  v_firm_a     uuid; v_firm_b uuid;
  v_user_a     uuid; v_user_b uuid;
  v_doc        uuid; v_ext uuid;
  v_secret_a   text; v_secret_b text;
  v_n          int;
  v_seed       text := '#780-row-proof-' || gen_random_uuid()::text;
begin
  -- ---------------------------------------------------------------------------------
  -- (0) WHICH LANE-ASSUMPTION ROUTE EXISTS ON THIS CLUSTER. Probed, not assumed; and a
  -- cluster where NEITHER works aborts the migration rather than skipping the proof.
  -- ---------------------------------------------------------------------------------
  begin
    perform set_config('role', 'clara_authenticated', true);
    if current_user = 'clara_authenticated' then v_route := 'set_config'; end if;
    perform set_config('role', 'none', true);
  exception when others then
    v_route := null;
    perform set_config('role', 'none', true);
  end;
  if v_route is null then
    begin
      execute 'set local role clara_authenticated';
      if current_user = 'clara_authenticated' then v_route := 'set_local_role'; end if;
      execute 'set local role none';
    exception when others then
      v_route := null;
      execute 'set local role none';
    end;
  end if;
  if v_route is null then
    raise exception '#780 row proof: the migration role can assume NEITHER clara_authenticated via set_config(''role'',…) NOR via SET LOCAL ROLE on this cluster -- the firm boundary cannot be read on either lane, and this tail refuses to pass without having read rows'
      using errcode = 'CLR10';
  end if;

  begin
    -- -------------------------------------------------------------------------------
    -- (1) FIRM A's VALIDATION ROW, written by 0191's own recorder.
    -- -------------------------------------------------------------------------------
    insert into clara.firms(name) values (v_seed || ' firm A') returning id into v_firm_a;
    insert into clara.firms(name) values (v_seed || ' firm B') returning id into v_firm_b;
    insert into clara.users(id, display_name) values (gen_random_uuid(), v_seed || ' user A')
      returning id into v_user_a;
    insert into clara.users(id, display_name) values (gen_random_uuid(), v_seed || ' user B')
      returning id into v_user_b;
    insert into clara.firm_memberships(firm_id, user_id, role, status)
      values (v_firm_a, v_user_a, 'owner', 'active'), (v_firm_b, v_user_b, 'owner', 'active');

    insert into clara.documents(firm_id, sha256, original_filename, mime_type, status, extraction_status)
      values (v_firm_a, encode(sha256(convert_to(v_seed, 'UTF8')), 'hex'), '780-row-proof.pdf',
              'application/pdf', 'ingested', 'done')
      returning id into v_doc;
    insert into clara.document_extractions(firm_id, document_id, engine_id, engine_kind,
        version_n, status, page_count, envelope)
      values (v_firm_a, v_doc, 'clara-0208:row-proof', 'invoice_facts', 1, 'done', 1, '{}'::jsonb)
      returning id into v_ext;
    -- The six-term identity, closing exactly: 94.30 + 3.77 + 5.66 + 0.02 = 103.75.
    insert into clara.document_regions(firm_id, extraction_id, locator_kind, locator, field_path,
        text_content, monetary_raw, monetary_cents)
    values
      (v_firm_a, v_ext, 'page_polygon', '{"page":1,"polygon":[0,0,1,1]}'::jsonb, 'invoice.total',           '103.75', '103.75', 10375),
      (v_firm_a, v_ext, 'page_polygon', '{"page":1,"polygon":[0,0,1,1]}'::jsonb, 'invoice.total_excl_tax',  '94.30',  '94.30',   9430),
      (v_firm_a, v_ext, 'page_polygon', '{"page":1,"polygon":[0,0,1,1]}'::jsonb, 'invoice.tax_total',       '5.66',   '5.66',     566),
      (v_firm_a, v_ext, 'page_polygon', '{"page":1,"polygon":[0,0,1,1]}'::jsonb, 'invoice.service_charge',  '3.77',   '3.77',     377),
      (v_firm_a, v_ext, 'page_polygon', '{"page":1,"polygon":[0,0,1,1]}'::jsonb, 'invoice.rounding',        '0.02',   '0.02',       2);

    -- 0191's recorder is DEFERRABLE INITIALLY DEFERRED and a migration never commits, so its
    -- event is forced here for THAT ONE constraint (never `ALL`, which would also re-time every
    -- other deferred constraint in the runner's transaction) and handed back immediately.
    set constraints clara.t_document_extractions_fact_validate immediate;
    set constraints clara.t_document_extractions_fact_validate deferred;

    select count(*)::int into v_n from clara.document_fact_validations where extraction_id = v_ext;
    if v_n <> 1 then
      raise exception '#780 row proof: the fixture produced % validation rows for firm A, not exactly one -- there is nothing to scope and the zeros below would prove nothing', v_n
        using errcode = 'CLR10';
    end if;

    select secret into v_secret_a
      from clara.mint_wake_credential('interactive', v_firm_a, null, '15 minutes'::interval, null);
    select secret into v_secret_b
      from clara.mint_wake_credential('interactive', v_firm_b, null, '15 minutes'::interval, null);
    if v_secret_a is null or v_secret_b is null then
      raise exception '#780 row proof: a wake credential could not be minted -- the agent lane cannot be read, and this tail refuses to pass without reading it'
        using errcode = 'CLR10';
    end if;

    -- -------------------------------------------------------------------------------
    -- (2) POSITIVE CONTROLS FIRST — the row is genuinely reachable from its OWN firm, on
    -- each lane. Without these two, every zero below is indistinguishable from a broken
    -- grant, an empty table or a credential that resolves to nothing.
    -- -------------------------------------------------------------------------------
    perform set_config('request.jwt.claims',
      jsonb_build_object('sub', v_user_a, 'role', 'authenticated')::text, true);
    if v_route = 'set_config' then perform set_config('role', 'clara_authenticated', true);
    else execute 'set local role clara_authenticated'; end if;
    select count(*)::int into v_n from clara.document_fact_validations where extraction_id = v_ext;
    if v_route = 'set_config' then perform set_config('role', 'none', true);
    else execute 'set local role none'; end if;
    if v_n <> 1 then
      raise exception '#780 row proof: firm A''s own HUMAN session read % of firm A''s validation rows, not 1 -- p_document_fact_validations_human (jwt_firm()) or the clara_authenticated SELECT grant is broken, and the cross-firm zeros below would prove nothing', v_n
        using errcode = 'CLR10';
    end if;

    perform set_config('request.jwt.claims', '', true);
    perform set_config('clara.wake_secret', v_secret_a, true);
    if v_route = 'set_config' then perform set_config('role', 'clara_agent_ro', true);
    else execute 'set local role clara_agent_ro'; end if;
    select count(*)::int into v_n from clara.document_fact_validations where extraction_id = v_ext;
    if v_route = 'set_config' then perform set_config('role', 'none', true);
    else execute 'set local role none'; end if;
    if v_n <> 1 then
      raise exception '#780 row proof: firm A''s own AGENT session read % of firm A''s validation rows, not 1 -- p_document_fact_validations_agent (wake_firm()), the clara_agent_ro SELECT grant, or the minted credential is broken, and the cross-firm zeros below would prove nothing', v_n
        using errcode = 'CLR10';
    end if;

    -- -------------------------------------------------------------------------------
    -- (3) THE BOUNDARY, ONE LANE AT A TIME.
    -- -------------------------------------------------------------------------------
    perform set_config('clara.wake_secret', '', true);
    perform set_config('request.jwt.claims',
      jsonb_build_object('sub', v_user_b, 'role', 'authenticated')::text, true);
    if v_route = 'set_config' then perform set_config('role', 'clara_authenticated', true);
    else execute 'set local role clara_authenticated'; end if;
    select count(*)::int into v_n from clara.document_fact_validations where extraction_id = v_ext;
    if v_route = 'set_config' then perform set_config('role', 'none', true);
    else execute 'set local role none'; end if;
    if v_n <> 0 then
      raise exception '#780 row proof: a firm-B HUMAN session read % of firm A''s validation rows -- p_document_fact_validations_human is not firm-scoped by clara.jwt_firm(); a validation row names an arithmetic judgement about another firm''s document', v_n
        using errcode = 'CLR10';
    end if;

    -- (3b) AND NEITHER LANE FALLS BACK TO THE OTHER'S ACCESSOR. Firm A's own wake secret,
    -- handed to firm B's HUMAN session, must still read zero: `clara.actor_firm_id()` =
    -- coalesce(wake_firm(), jwt_firm()) is forbidden as an authorization basis (0002), and
    -- this is the assertion that keeps it from being silently reintroduced.
    perform set_config('clara.wake_secret', v_secret_a, true);
    if v_route = 'set_config' then perform set_config('role', 'clara_authenticated', true);
    else execute 'set local role clara_authenticated'; end if;
    select count(*)::int into v_n from clara.document_fact_validations where extraction_id = v_ext;
    if v_route = 'set_config' then perform set_config('role', 'none', true);
    else execute 'set local role none'; end if;
    if v_n <> 0 then
      raise exception '#780 row proof: a firm-A WAKE SECRET set inside a firm-B HUMAN session exposed % of firm A''s validation rows -- p_document_fact_validations_human is reading something other than clara.jwt_firm() (an actor_firm_id()-shaped coalesce is back)', v_n
        using errcode = 'CLR10';
    end if;
    perform set_config('request.jwt.claims', '', true);

    perform set_config('clara.wake_secret', v_secret_b, true);
    if v_route = 'set_config' then perform set_config('role', 'clara_agent_ro', true);
    else execute 'set local role clara_agent_ro'; end if;
    select count(*)::int into v_n from clara.document_fact_validations where extraction_id = v_ext;
    if v_route = 'set_config' then perform set_config('role', 'none', true);
    else execute 'set local role none'; end if;
    if v_n <> 0 then
      raise exception '#780 row proof: a firm-B AGENT session read % of firm A''s validation rows -- p_document_fact_validations_agent is not firm-scoped by clara.wake_firm()', v_n
        using errcode = 'CLR10';
    end if;
    perform set_config('clara.wake_secret', '', true);

    raise exception '#780 row proof rollback' using errcode = 'ZA208';
  exception when sqlstate 'ZA208' then
    null;
  end;

  -- -------------------------------------------------------------------------------
  -- (4) THE SESSION IS HANDED BACK AS IT WAS, and NOTHING IS LEFT BEHIND. The sentinel
  -- rollback above already discarded the fixtures and every transaction-local GUC the
  -- probe set; these are the explicit re-reads, because the runner's execution wrapper
  -- aborts a migration that exits with a different session authorization or role, and
  -- "no probe row remains" is an acceptance criterion rather than an inference.
  -- -------------------------------------------------------------------------------
  if v_route = 'set_config' then perform set_config('role', 'none', true);
  else execute 'set local role none'; end if;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('clara.wake_secret', '', true);
  if current_user <> session_user then
    raise exception '#780 row proof: the probe exited as % rather than the runner''s own % -- the migration would leak a session role', current_user, session_user
      using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from clara.firms where name like '#780-row-proof-%';
  if v_n <> 0 then
    raise exception '#780 row proof: % probe firm(s) survived the rollback', v_n using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from clara.document_fact_validations v
    join clara.document_extractions e on e.id = v.extraction_id
   where e.engine_id = 'clara-0208:row-proof';
  if v_n <> 0 then
    raise exception '#780 row proof: % probe validation row(s) survived the rollback', v_n using errcode = 'CLR10';
  end if;

  raise notice '#780 tail: OK -- clara.document_fact_validations'' firm boundary is now proven by READING ROWS in the migration that owns the policies, not only by counting them. Via the % lane-assumption route: a firm-A validation row was seeded through 0191''s OWN deferred recorder (a done invoice_facts extraction plus its five identity regions, with t_document_extractions_fact_validate forced IMMEDIATE for that one constraint and handed straight back to DEFERRED); firm A''s own HUMAN session and firm A''s own AGENT session EACH read exactly that one row (the positive controls, taken BEFORE any zero); a firm-B HUMAN session read ZERO and a firm-B AGENT session read ZERO, each failure naming its lane and its policy; and firm A''s wake secret set inside a firm-B HUMAN session still read ZERO, so neither lane falls back to the other''s accessor and an actor_firm_id()-shaped coalesce cannot return unnoticed. A cluster on which the migration role could assume neither lane role, or could not mint a wake credential, raises CLR10 and aborts rather than skipping. Every fixture was rolled back through the sentinel idiom (ZA208) and re-read as absent, and the session exits at the role it entered with. 0191''s own count-of-policies assertion (expected three for this table) is untouched and still catches a dropped or added policy, which a row read cannot; 0191_document_capability_registry.sql is not edited by this file, and packages/db/tests/document-fact-validation-belt.test.mjs is unchanged and remains the reference shape.', v_route;
end
$w780_proof$;
