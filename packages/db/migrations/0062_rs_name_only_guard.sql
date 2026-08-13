-- 0062_rs_name_only_guard.sql -- THE NAME-ONLY CUSTOMER GUARD.
-- MIGRATION NUMBER claimed at MERGE (standing law, .claude/rules/db-migrations.md). Authored
-- against repo frontier 0057. Renumber mechanically if the merge order moves; nothing in this
-- file depends on its own number.
--
-- WHAT IT DISCHARGES. AGENTS.md hard constraint 12 -- "ROME SECRETARY's customers are NAME-ONLY
-- -- never enrich them with a registration number or a TIN" -- names a DB-side guard as a
-- REGISTERED CANDIDATE and says, in its own parenthesis, that until it lands the rule "rests on
-- you". This file lands it.
--
-- WHY THE RULE EXISTS, from the measured record and not from folklore. ADR-064 (2) closed §7-A
-- Half 1 on ROME SECRETARY's real books: 22 real sales invoices, "10 customers born NAME-ONLY,
-- correct names, per the F3 ruling -- zero buyer registrations exist anywhere in the 22
-- (document_regions read directly)". No RS invoice prints a buyer registration, so every RS
-- customer is name-only BY EVIDENCE. wave-e-acceptance-matrix.md:275-277 (E-R9 row 5) states the
-- cost of breaking it: enrich one customer and `_resolve_counterparty` "would then refuse every
-- later invoice at CLR23 registration_conflict, unattended and silently" -- a trap that pays out
-- months later, on an unattended lane, on a real firm's books.
--
-- IDENTITY IS NEVER SPELLING (standing law 27.3). No executable SQL below matches a counterparty
-- or a client by NAME. The runtime identity of a protected client is a RECORDED FACT
-- (clara.client_facts.customer_identity_policy = 'name_only'); the one place a specific client
-- appears is S3's arming statement, which pins ROME SECRETARY by uuid
-- e054b797-2641-413c-809f-f27603bbe9c7 (provenance: wave-7a-acceptance-h1.md:16 "Client ROME
-- SECRETARY SDN BHD e054b797-2641-413c-809f-f27603bbe9c7", corroborated at :740, by ADR-064
-- (2)'s `e054b797`, and by wave-e-lane-alpha-acceptance.md:34's msic fact for the same client).
-- The string "ROME SECRETARY" appears in this file ONLY in comments.
--
-- SCOPE (full negative list printed at apply time by S4.7; each limb is commented at the line
-- that implements it): guarded = CUSTOMER-kind counterparties of a FLAGGED client. Vendors,
-- unflagged clients and identifier-CLEARING are all deliberately untouched.
--
-- THE POLICY IS LIFTABLE, BUT ONLY BY AN OWNER (finding B5, owner-adjudicated). A wall that can
-- never be lowered is worked around -- retire the party, recreate it enriched -- so lifting stays
-- possible; but an admin+ lift was graded a BLOCKER bypass of constraint 12, because the floor
-- that ARMS the policy could silently un-arm it. ARMING and RE-ARMING stay admin+; moving AWAY
-- from a live 'name_only' additionally requires an OWNER. That floor ships as the COMPANION FILE
-- 0063_rs_name_only_lift_floor.sql, which MUST be numbered immediately after this one --
-- read its header for why it is a separate file and what the ordering obligation is.
--
-- WHERE THE FLAG LIVES, AND WHY NOT A COLUMN. clara.client_facts, keyed
-- 'customer_identity_policy'. 0055:334-337 already ruled this exact question for this exact kind
-- of datum -- "A FACTS TABLE, NOT COLUMNS ON clara.clients: a column carries the value but not
-- the who/basis/when ADR-062 requires verbatim... The catalog keeps the door generic;
-- clara.clients stays a registry." A policy statement about a client is the paradigm case: WHO
-- said so, on WHAT basis, WHEN, and a supersession trail -- none of which a boolean carries.
-- Registering the key with an `enum:` label means the EXISTING door validates the new value with
-- no change to its body.
--
-- THE ENRICHMENT VECTOR IS INSERT, AND THE UPDATE ARM IS A BELT -- MEASURED, NOT ASSUMED.
-- clara._tf_counterparty_update_0011 (0011:940-960, whitelist widened once by 0040 S4.10) admits
-- exactly (name, name_normalized, payment_terms_days, updated_at) on a non-merge update, so TODAY
-- no UPDATE can move registration_no, registration_normalized or tin on any row, for any client.
-- Every reachable enrichment is an INSERT -- clara.create_counterparty (0021:103) is the human
-- door taking p_registration_no and p_tin. This file guards UPDATE anyway: that whitelist has
-- widened once and can widen again, and a guard that holds only while a neighbouring guard holds
-- is not a wall, it is a coincidence.
--
-- TRIGGER FIRING ORDER IS LOAD-BEARING AND ASSERTED (S4.2, from pg_trigger). PostgreSQL fires
-- BEFORE-row triggers in name order, and `t_counterparties_name_only_guard` sorts before
-- `t_counterparties_update_0011`, so on the UPDATE path this guard's specific refusal is what the
-- caller sees rather than the generic 'illegal counterparty mutation'.
--
-- REFUSAL CODES: no new CLR code is claimed (the 0057 posture). The counterparty wall reuses
-- CLR10 (bad-request) with detail.reason = 'customer_identity_name_only'; S2b's lift floor reuses
-- CLR04 (role floor -- the code _human_ctx itself raises) with detail.reason =
-- 'customer_identity_lift_requires_owner'. Both tokens are asserted by the battery, not matched
-- loosely.
--
-- CELLS: packages/db/tests/name-only-guard.test.mjs, gated by
-- packages/db/tests/rs-guard-preintegration-gate.mjs (finding B7): a FOCUSED run with
-- CLARA_ALLOW_MISSING_RS_GUARD unset FAILS when these objects are absent, so a missing or
-- misnumbered migration can never read green. CONTRACT-BLIND on this file: the cells probe the
-- LIVE catalog and build their OWN flagged client.
--
-- LOCKS / DEPLOY: creating triggers takes a brief ACCESS EXCLUSIVE lock on clara.counterparties
-- and clara.client_facts, so the ceremony wants a lock_timeout for the DDL (0057's note). No
-- function body is replaced anywhere in this file -- no D1 write-quiesce exposure.
set local statement_timeout = '2min';  -- PRECAUTIONARY, not load-bearing: every statement is
-- catalog DDL or a single-row read/write and nothing scans a large table. It exists so a
-- pathological lock wait fails loudly inside the runner's transaction, not at ceremony time.

-- =====================================================================================
-- S0 -- PRESTATE. Every claim this file makes about what it edits, measured against the LIVE
-- catalog before anything is created. A false premise aborts here.
-- =====================================================================================
do $s0$
declare v_n int; v_src text;
begin
  -- (0.1) The guarded table and EVERY column the guard reads, by name, from the live catalog. A
  -- guard written against a since-dropped column is the 0055 S4 lesson ("file text is not the
  -- live schema") -- that door's first cut read a column 0007 had dropped.
  select count(*) into v_n from pg_attribute a
   where a.attrelid = 'clara.counterparties'::regclass and not a.attisdropped
     and a.attname in ('id','firm_id','client_id','kind','name','name_normalized',
                       'registration_no','registration_normalized','tin','created_by');
  if v_n <> 10 then
    raise exception 'name-only guard prestate: clara.counterparties carries % of the 10 columns the guard reads -- refusing to install a guard against a schema that is not there', v_n
      using errcode = 'CLR10';
  end if;

  -- (0.2) 'customer' is an ADMITTED kind. If the kind check no longer admits it, every
  -- predicate below is vacuous by construction and the file would install decoration.
  select count(*) into v_n from pg_constraint con
   where con.conrelid = 'clara.counterparties'::regclass and con.contype = 'c'
     and pg_get_constraintdef(con.oid) like '%kind%'
     and pg_get_constraintdef(con.oid) like '%customer%';
  if v_n < 1 then
    raise exception 'name-only guard prestate: no CHECK on clara.counterparties admits kind=customer -- the guard would be vacuous'
      using errcode = 'CLR10';
  end if;

  -- (0.3) The flag's home exists with the columns the guard reads.
  select count(*) into v_n from pg_attribute a
   where a.attrelid = 'clara.client_facts'::regclass and not a.attisdropped
     and a.attname in ('client_id','fact_key','fact_value','superseded_at');
  if v_n <> 4 then
    raise exception 'name-only guard prestate: clara.client_facts carries % of the 4 columns the guard reads', v_n
      using errcode = 'CLR10';
  end if;

  -- (0.4) The AUDITED DOOR exists AND still carries its `enum:` branch -- the whole reason the key
  -- registers without touching the door's body. Without it the door's fail-closed ELSE refuses the
  -- new key as unimplemented. Proven from the live body.
  select coalesce(nullif(p.prosrc, ''), pg_get_functiondef(p.oid)) into v_src
    from pg_proc p where p.pronamespace = 'clara'::regnamespace and p.proname = 'record_client_fact';
  if v_src is null then
    raise exception 'name-only guard prestate: clara.record_client_fact is absent -- 0055 has not been applied'
      using errcode = 'CLR10';
  end if;
  if position('enum:' in v_src) = 0 or position('allowed_values ?' in v_src) = 0 then
    raise exception 'name-only guard prestate: clara.record_client_fact no longer carries its enum-catalog validation branch -- an enum-labelled key would be refused as unimplemented'
      using errcode = 'CLR10';
  end if;

  -- (0.5) Nothing here is being overwritten. The key is new; the trigger name is free.
  select count(*) into v_n from clara.client_fact_keys where fact_key = 'customer_identity_policy';
  if v_n <> 0 then
    raise exception 'name-only guard prestate: fact key customer_identity_policy already exists -- this file is not a re-run and must not shadow an existing key'
      using errcode = 'CLR10';
  end if;
  select count(*) into v_n from pg_trigger
   where tgrelid = 'clara.counterparties'::regclass and not tgisinternal
     and tgname = 't_counterparties_name_only_guard';
  if v_n <> 0 then
    raise exception 'name-only guard prestate: t_counterparties_name_only_guard already exists on clara.counterparties'
      using errcode = 'CLR10';
  end if;

  -- (0.6) The neighbour whose ordering this file reasons about is still there. If 0011's trigger
  -- was renamed or dropped, the header's firing-order claim quietly stopped being true.
  select count(*) into v_n from pg_trigger
   where tgrelid = 'clara.counterparties'::regclass and not tgisinternal
     and tgname = 't_counterparties_update_0011';
  if v_n <> 1 then
    raise exception 'name-only guard prestate: t_counterparties_update_0011 is not on clara.counterparties (% found) -- this file''s firing-order reasoning was written against it', v_n
      using errcode = 'CLR10';
  end if;

  raise notice 'name-only guard S0 prestate OK: counterparties (10/10 guarded columns, kind admits customer) + client_facts (4/4) + record_client_fact (enum branch present) + both names free + the 0011 neighbour present.';
end $s0$;

-- =====================================================================================
-- S1/S2 RUN AS clara_fn_owner -- the house's tables, trigger functions and doors are OWNED by it
-- (0055 S3's note; forced RLS binds the OWNER). clara.counterparties is owned by clara_fn_owner
-- (0009:749 wraps its creation) and only its owner may put a trigger on it.
-- =====================================================================================
set role clara_fn_owner;

-- S1 -- THE VOCABULARY. client_fact_keys is CODE-POPULATED by 0055's own rule: "a fact key is
-- product vocabulary... never live edits." The `enum:` label routes the door to its catalog branch.
insert into clara.client_fact_keys (fact_key, validated_against, allowed_values, description)
values (
  'customer_identity_policy', 'enum:CUSTOMER_IDENTITY_POLICY_V1',
  '["name_only","unrestricted"]'::jsonb,
  'Whether this client''s CUSTOMER counterparties may carry hard identifiers. '
  || '''name_only'' arms clara._tf_counterparty_name_only_guard: a customer of this client may '
  || 'not be given a registration number or a TIN (clearing one stays allowed, and VENDORS are '
  || 'out of scope entirely). ''unrestricted'' is the absence of the policy, stated explicitly '
  || 'so lifting it is a recorded act with a basis rather than a deletion. Absent = '
  || 'unrestricted. Discharges AGENTS.md hard constraint 12; the rule''s own evidence is '
  || 'ADR-064 (2) (zero buyer registrations in the pinned client''s 22-invoice corpus) and its '
  || 'cost is wave-e-acceptance-matrix.md E-R9 row 5 (CLR23 registration_conflict on every '
  || 'later invoice, unattended and silently).');

-- =====================================================================================
-- S2 -- THE GUARD. One BEFORE-row trigger on one table.
-- ON COST: the coarse filter lives in the BODY, not in a trigger WHEN clause, deliberately -- a
-- WHEN clause would skip the call for the common case but state the predicate in two places, and
-- two copies of a security predicate drift. counterparties is written once per party per client
-- (it is not journal_lines), so the saving is noise and the drift risk is not.
-- =====================================================================================
create function clara._tf_counterparty_name_only_guard() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $guard$
declare v_introduced boolean;
begin
  -- (1) VENDORS ARE OUT OF SCOPE, and so is any row carrying no identifier at all. Both tests
  -- read NEW only, so they are valid on INSERT and UPDATE alike.
  if new.kind is distinct from 'customer' then return new; end if;
  if new.registration_no is null and new.registration_normalized is null and new.tin is null then
    return new;
  end if;

  -- (2) ON UPDATE, ONLY AN INTRODUCTION IS AN ENRICHMENT. A rename, a terms change and a merge all
  -- leave identifiers untouched and must pass -- refusing them would strand ordinary maintenance
  -- on the very rows this guard protects. NULL -> value and value -> different value are refused;
  -- value -> NULL (clearing) is not. The last limb is the edge case the first three miss: a row
  -- FLIPPED into kind='customer' while already carrying identifiers introduces nothing by column
  -- and everything by meaning. (0011 refuses a kind change today; this makes us independent.)
  if tg_op = 'UPDATE' then
    v_introduced :=
         (new.registration_no is not null
            and new.registration_no is distinct from old.registration_no)
      or (new.registration_normalized is not null
            and new.registration_normalized is distinct from old.registration_normalized)
      or (new.tin is not null and new.tin is distinct from old.tin)
      or (new.kind is distinct from old.kind);
    if not v_introduced then return new; end if;
  end if;

  -- (3) THE POLICY, READ LIVE. Identity is the recorded fact, never a name. The lookup rides
  -- uq_client_fact_live (client_id, fact_key) WHERE superseded_at is null -- one index probe, only
  -- on the rare path where an identifier is actually being written. NEW.client_id is deliberately
  -- the client read: the question is where the row is LANDING.
  if exists (
    select 1 from clara.client_facts cf
     where cf.client_id = new.client_id
       and cf.fact_key = 'customer_identity_policy'
       and cf.superseded_at is null
       and cf.fact_value = '"name_only"'::jsonb
  ) then
    -- The reason token rides BOTH the detail (the house idiom, 0055's _tf_client_facts_
    -- supersede_only shape) and the tail of the message. Deliberate belt: a log pipeline that
    -- keeps only SQLERRM would otherwise drop the one string this refusal is grepped by.
    raise exception 'this client''s customers are NAME-ONLY: a customer counterparty may not be given a registration number or a TIN (clearing one is allowed, and vendors are unaffected). Lift the policy first through clara.record_client_fact(customer_identity_policy => unrestricted), with its basis. (refusal: customer_identity_name_only)'
      using errcode = 'CLR10',
            detail = jsonb_build_object(
              'reason', 'customer_identity_name_only',
              'client', new.client_id, 'counterparty', new.id, 'op', tg_op)::text;
  end if;

  return new;
end $guard$;
revoke all on function clara._tf_counterparty_name_only_guard() from public;

comment on function clara._tf_counterparty_name_only_guard() is
  'AGENTS.md hard constraint 12, structurally. Refuses giving a registration number or a TIN to a '
  'CUSTOMER-kind counterparty of a client whose live client_facts.customer_identity_policy is '
  '''name_only''. Identity is the recorded fact, never a name (standing law 27.3). Vendors, '
  'unflagged clients, unchanged identifiers and CLEARING all pass. Token: customer_identity_name_only.';

-- Named so it sorts BEFORE t_counterparties_update_0011 (S4.2 asserts that from the catalog).
create trigger t_counterparties_name_only_guard
  before insert or update on clara.counterparties
  for each row execute function clara._tf_counterparty_name_only_guard();

reset role;

-- =====================================================================================
-- S3 -- ARMING ROME SECRETARY. The ONE client-specific statement in this file, and the only
-- place a particular client appears at all.
--
-- THE ONE ASYMMETRY, AND IT IS THE WHOLE OF FINDING B6. ABSENT pinned client -> loud skip: that
-- is every CI throwaway, there is no operator and nothing to arm, and the MECHANISM above is
-- installed unconditionally and identically either way. PRESENT pinned client that cannot be
-- armed -> ABORT: that happens only on the live target, where an operator IS present and a
-- rollback is cheap, and where committing would record this migration as applied FOREVER
-- (applied files are immutable) with ROME SECRETARY still enrichable. The earlier cut warned and
-- committed, which is the silent-permanent-gap shape this whole file exists to prevent.
--
-- THE WRITE GOES THROUGH THE AUDITED DOOR, not into the table. clara.record_client_fact is "THE
-- ONE AUDITED DOOR" (0055 S4) and it stamps who/basis/when, the audit row and the
-- client.fact_recorded event. The impersonation shape -- resolve a real admin+ member of the
-- owning firm, set request.jwt.claims, SET ROLE, call, restore -- is
-- packages/db/deploy/client-identifiers-0049-seed.sql:140-180 verbatim in intent. Both routes to
-- the door (EXECUTE grant, or SET ROLE membership) are probed because which one exists is a
-- property of the target cluster. The role is restored with set_config('role','none') before the
-- block ends because the runner's wrapper ABORTS if current_user differs at exit ("migration
-- leaked runner-owned session authorization or role", scripts/migration-atomicity.mjs:333).
-- =====================================================================================
do $s3$
declare
  -- ROME SECRETARY SDN BHD (BELCORT); provenance in the header. A uuid, never a name.
  v_client  uuid := 'e054b797-2641-413c-809f-f27603bbe9c7';
  v_firm    uuid;
  v_name    text;
  v_actor   uuid;
  v_live    int;
  v_dirty   int;
  v_receipt jsonb;
  v_may_call boolean;  -- the migration role already holds EXECUTE on the door
  v_may_role boolean;  -- ...or can SET ROLE to the role that does
begin
  select c.firm_id, c.name into v_firm, v_name from clara.clients c where c.id = v_client;
  if v_firm is null then
    raise notice 'name-only guard S3: the pinned client is ABSENT on % -- no client armed, SKIPPED. This is the EXPECTED outcome on a throwaway/CI database; the guard mechanism itself is installed and is proven by packages/db/tests/name-only-guard.test.mjs, which builds its own flagged client.', current_database();
    return;
  end if;

  -- WHAT THE ARMED CLIENT ACTUALLY LOOKS LIKE, printed rather than assumed. The name is READ OUT
  -- of the row, never matched against -- this is how an operator verifies the pin still points
  -- where this file thinks it does.
  raise notice 'name-only guard S3: pinned client % resolves to firm % / name %', v_client, v_firm, v_name;

  -- PRE-EXISTING VIOLATIONS stay a WARNING (B6 explicitly preserved this): the guard is
  -- forward-looking by construction -- an unchanged identifier always passes -- so aborting here
  -- would ship ZERO protection over a state that already needs it. Unlike the unarmable case
  -- below, the client still ends up ARMED, so the guarantee is not silently forfeited.
  select count(*) into v_dirty from clara.counterparties cp
   where cp.client_id = v_client and cp.kind = 'customer'
     and (cp.registration_no is not null or cp.registration_normalized is not null
          or cp.tin is not null);
  if v_dirty <> 0 then
    raise warning 'name-only guard S3: % CUSTOMER counterpart(ies) of the pinned client ALREADY carry a registration number or a TIN. The guard blocks further enrichment but does not undo these; clear them (value -> NULL is permitted) and re-read.', v_dirty;
  else
    raise notice 'name-only guard S3: 0 customers of the pinned client carry a registration or a TIN -- the premise holds as recorded.';
  end if;

  -- A LIVE POLICY HERE IS AN IMPOSSIBLE STATE, so it aborts rather than skipping. S0.5 already
  -- proved the fact KEY did not exist when this transaction began, and client_facts.fact_key is
  -- FK-bound to that catalog -- so no row for this key can predate S1. Reaching this branch means
  -- a premise was bypassed, and the earlier "notice and return" shape would have committed the
  -- migration with the client's policy in an unexamined state (finding B6's exact class).
  select count(*) into v_live from clara.client_facts cf
   where cf.client_id = v_client and cf.fact_key = 'customer_identity_policy'
     and cf.superseded_at is null;
  if v_live <> 0 then
    raise exception 'name-only guard S3: the pinned client already carries a LIVE customer_identity_policy fact, which S0.5 proved impossible -- refusing to commit over an unexamined policy state'
      using errcode = 'CLR10';
  end if;

  -- THE ACTOR. record_client_fact's floor is admin+ (0055 S4), and a client-policy statement is
  -- the firm's to make, so the highest-ranked active member is asked for; ordering by rank then
  -- user_id makes that deterministic rather than whatever the heap returns first.
  select fm.user_id into v_actor
    from clara.firm_memberships fm
   where fm.firm_id = v_firm and fm.status = 'active'
     and coalesce(clara.role_rank(fm.role), -1) >= clara.role_rank('admin')
   order by clara.role_rank(fm.role) desc, fm.user_id
   limit 1;
  -- B6 POLARITY: PRESENT-BUT-UNARMABLE ABORTS, it does not commit. An absent client is a skip
  -- (CI throwaway, no operator, nothing to arm). A PRESENT client we cannot arm is the opposite
  -- case in every respect: it happens only on the live target, where an operator IS present and a
  -- rollback is cheap and recoverable -- whereas committing would record this migration as
  -- applied FOREVER (applied files are immutable) with the client still enrichable. A loud abort
  -- costs one ceremony retry; a quiet commit costs the guarantee.
  if v_actor is null then
    raise exception 'name-only guard S3: the pinned client EXISTS but its firm has no active admin+ member to attribute the policy to -- aborting rather than committing this migration with the client unarmed. Remedy: give the firm an active admin+ member, then re-run.'
      using errcode = 'CLR10';
  end if;

  v_may_call := has_function_privilege(  -- both routes to the door, probed before either is taken
    'clara.record_client_fact(uuid,text,jsonb,text,text,uuid,text)', 'execute');
  v_may_role := pg_has_role('clara_authenticated', 'usage');
  if not v_may_call and not v_may_role then
    -- Same B6 polarity, same reason: no route to the door on a PRESENT client aborts. (RAISE takes
    -- only `%`, never format()'s %L/%I -- a %L would print the uuid followed by a stray "L".)
    raise exception 'name-only guard S3: this migration role can neither EXECUTE clara.record_client_fact nor SET ROLE to clara_authenticated, and the pinned client EXISTS -- aborting rather than committing with it unarmed. Remedy: re-run as a role holding either, or arm by hand as an admin+ member: select clara.record_client_fact(p_client => ''%'', p_fact_key => ''customer_identity_policy'', p_fact_value => ''"name_only"''::jsonb, p_basis => <why>, p_basis_kind => ''owner_instruction'', p_source_document_id => null, p_op_key => ''rs-name-only-guard-arm-v1'');', v_client
      using errcode = 'CLR10';
  end if;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_actor)::text, true);
  if not v_may_call then perform set_config('role', 'clara_authenticated', true); end if;
  select clara.record_client_fact(
      p_client => v_client, p_fact_key => 'customer_identity_policy',
      p_fact_value => '"name_only"'::jsonb,
      p_basis =>
        'AGENTS.md hard constraint 12 -- this client''s customers are NAME-ONLY -- promoted from '
        || 'agent discipline to a DB-side structural guard on the owner''s authorization, by the '
        || 'migration that installs the guard. Evidence for the rule: ADR-064 (2) records that '
        || 'ZERO buyer registrations exist anywhere in this client''s 22-invoice Half-1 corpus '
        || '(document_regions read directly), so every one of its customers is name-only by '
        || 'evidence rather than by preference. Cost of breaking it: wave-e-acceptance-matrix.md '
        || 'E-R9 row 5 -- _resolve_counterparty would refuse every later invoice at CLR23 '
        || 'registration_conflict, unattended and silently. Lift only with a recorded basis.',
      p_basis_kind => 'owner_instruction', p_source_document_id => null,
      p_op_key => 'rs-name-only-guard-arm-v1')
    into v_receipt;
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
  raise notice 'name-only guard S3: ARMED through clara.record_client_fact by actor % -- receipt %', v_actor, v_receipt;
end $s3$;

-- =====================================================================================
-- S4 -- TAIL CENSUS: the live catalog re-read, plus a BEHAVIOURAL self-proof. A tail that only
-- says "OK" has proven nothing (.claude/rules/db-migrations.md).
-- =====================================================================================
do $s4$
declare
  v_n int; v_before int; v_probe text := 'not-run'; v_detail text; v_order text;
  v_pc uuid; v_pf uuid; v_keys jsonb;
begin
  -- (4.1) The trigger exists with the exact timing, events and level claimed. tgtype bits:
  -- 1 = ROW, 2 = BEFORE, 4 = INSERT, 16 = UPDATE. Read from the catalog, not from this file.
  select count(*) into v_n from pg_trigger t
   where t.tgrelid = 'clara.counterparties'::regclass and not t.tgisinternal
     and t.tgname = 't_counterparties_name_only_guard'
     and (t.tgtype & 1) = 1 and (t.tgtype & 2) = 2
     and (t.tgtype & 4) = 4 and (t.tgtype & 16) = 16
     and t.tgenabled = 'O';
  if v_n <> 1 then
    raise exception 'name-only guard S4.1: the trigger is not an ENABLED BEFORE INSERT OR UPDATE FOR EACH ROW trigger on clara.counterparties (% match)', v_n
      using errcode = 'CLR10';
  end if;

  -- (4.2) FIRING ORDER, read out of the CATALOG rather than asserted between two literals -- two
  -- string constants compared here could not fail whatever the catalog said, and an assertion
  -- that cannot fail is decoration that reads like evidence (0057 S11.9's lesson). PostgreSQL
  -- fires BEFORE-row triggers in name order, so this roster IS the firing order.
  select string_agg(t.tgname, ' -> ' order by t.tgname) into v_order
    from pg_trigger t
   where t.tgrelid = 'clara.counterparties'::regclass and not t.tgisinternal
     and (t.tgtype & 2) = 2 and (t.tgtype & 16) = 16;
  v_before := position('t_counterparties_update_0011' in coalesce(v_order, ''));
  if v_before = 0
     or position('t_counterparties_name_only_guard' in coalesce(v_order, '')) > v_before then
    raise exception 'name-only guard S4.2: on the BEFORE-UPDATE roster (%) the guard does not precede t_counterparties_update_0011 -- 0011''s generic refusal would mask this one on UPDATE', coalesce(v_order, '<empty>')
      using errcode = 'CLR10';
  end if;
  raise notice 'name-only guard S4.2: BEFORE-UPDATE firing order on clara.counterparties is now: %', v_order;

  -- (4.3) SECURITY DEFINER + pinned search_path + owned by clara_fn_owner -- which is what lets it
  -- read client_facts under forced RLS via the owner policy instead of seeing nothing and failing
  -- OPEN. The proconfig probe is a LIKE over unnest, not equality against a guessed rendering
  -- (0047:129 records this file family guessing that rendering and being wrong).
  select count(*) into v_n from pg_proc p
   where p.pronamespace = 'clara'::regnamespace
     and p.proname = '_tf_counterparty_name_only_guard'
     and p.prosecdef
     and exists (select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) cfg
                  where cfg like 'search_path=%clara%')
     and p.proowner = 'clara_fn_owner'::regrole;
  if v_n <> 1 then
    raise exception 'name-only guard S4.3: the trigger function is not a clara_fn_owner-owned SECURITY DEFINER with a pinned search_path'
      using errcode = 'CLR10';
  end if;

  -- (4.4) The vocabulary landed with EXACTLY the two values, in the catalog's own words.
  select k.allowed_values into v_keys from clara.client_fact_keys k
   where k.fact_key = 'customer_identity_policy' and k.validated_against = 'enum:CUSTOMER_IDENTITY_POLICY_V1';
  if v_keys is null or not (v_keys ? 'name_only') or not (v_keys ? 'unrestricted')
     or jsonb_array_length(v_keys) <> 2 then
    raise exception 'name-only guard S4.4: customer_identity_policy did not land with exactly [name_only, unrestricted] (found %)', coalesce(v_keys::text, '<absent>')
      using errcode = 'CLR10';
  end if;

  -- (4.5) THE BEHAVIOURAL SELF-PROOF. Every assertion above reads the catalog; none proves the
  -- trigger REFUSES anything. This does: against whatever client is actually flagged on THIS
  -- database, attempt the exact write the guard exists to stop, inside an exception block whose
  -- implicit savepoint discards it. A refusal rolls back; a SUCCESS is escalated to a hard abort
  -- that takes the probe row with it. "Refused by something else" is NOT a pass either -- absence
  -- of the guard's own token is not evidence it fired (a unique index or an RLS denial look
  -- identical here) -- so the block runs as clara_fn_owner, where RLS cannot be the refuser.
  select cf.client_id, c.firm_id into v_pc, v_pf
    from clara.client_facts cf join clara.clients c on c.id = cf.client_id
   where cf.fact_key = 'customer_identity_policy' and cf.superseded_at is null
     and cf.fact_value = '"name_only"'::jsonb
   order by cf.client_id limit 1;
  if v_pc is null then
    raise notice 'name-only guard S4.5: NO client on this database carries a live name_only policy, so the behavioural self-proof is NOT AVAILABLE here -- expected on a throwaway/CI database, where packages/db/tests/name-only-guard.test.mjs builds its own flagged client and proves the refusal against the rig. Stated, not skipped silently.';
  else
    -- set_config, not a bare SET LOCAL ROLE (the documented PL/pgSQL form). The switch sits
    -- OUTSIDE the sub-block on purpose: a GUC set inside is reverted by the sub-block's rollback
    -- on the refusal path but stands on the success path -- two exits. Set once, restore once.
    perform set_config('role', 'clara_fn_owner', true);
    begin
      insert into clara.counterparties(firm_id, client_id, kind, name, name_normalized,
          registration_no, registration_normalized, created_by)
        values (v_pf, v_pc, 'customer', 'NAME ONLY GUARD PROBE', 'nameonlyguardprobe',
                'PROBE0000000000', 'probe0000000000', clara.agent_user_id());
      v_probe := 'NOT REFUSED';
    exception when others then
      -- PG_EXCEPTION_DETAIL is only reachable through GET STACKED DIAGNOSTICS; the reason token
      -- lives there, so reading SQLERRM alone would have made the assertion below unfalsifiable
      -- in the wrong direction (it would abort on a refusal the guard DID raise).
      get stacked diagnostics v_detail = pg_exception_detail;
      v_probe := sqlstate || ' | ' || sqlerrm || ' | detail=' || coalesce(nullif(v_detail, ''), '<none>');
    end;
    perform set_config('role', 'none', true);
    if v_probe = 'NOT REFUSED' then
      raise exception 'name-only guard S4.5: the guard did NOT refuse a registration-bearing CUSTOMER insert for flagged client % -- refusing to leave behind a guard that does not guard', v_pc
        using errcode = 'CLR10';
    end if;
    if position('customer_identity_name_only' in v_probe) = 0 then
      raise exception 'name-only guard S4.5: the probe was refused, but NOT by this guard (%) -- something else stopped it and that is not evidence the guard works', v_probe
        using errcode = 'CLR10';
    end if;
    raise notice 'name-only guard S4.5 BEHAVIOURAL SELF-PROOF: a registration-bearing CUSTOMER insert for flagged client % was REFUSED by this guard, in this transaction, and rolled back -- %', v_pc, v_probe;
  end if;

  -- (4.6) HOW MANY CLIENTS ARE ARMED, right now, on this database.
  select count(*) into v_n from clara.client_facts cf
   where cf.fact_key = 'customer_identity_policy' and cf.superseded_at is null
     and cf.fact_value = '"name_only"'::jsonb;
  raise notice 'name-only guard S4.6: % client(s) carry a live name_only customer identity policy on %.', v_n, current_database();

  -- (4.7) STATED OUT OF SCOPE, so nobody rediscovers it later as a hole.
  raise notice 'name-only guard S4.7 OUT OF SCOPE, STATED: (a) VENDOR-kind counterparties are never guarded -- the one registered counterparty of the pinned client is a vendor and the AP identity-binding lane (0028-0030) depends on vendor registrations. (b) clara.counterparty_aliases is untouched: an alias is a NAME, and this guard is about hard identifiers. (c) clara.client_identifiers is untouched: those are the CLIENT''s own identifiers, which the direction matcher needs and which nothing here restricts. (d) Rows that were already enriched before this file landed are NOT undone -- S3 counts them and warns; clearing an identifier stays permitted, which is the remedy. (e) The policy is liftable through the audited door BY DESIGN; a wall that cannot be lowered gets routed around by retire-and-recreate, which is strictly worse than a recorded lift.';

  raise notice 'name-only guard OK: client_fact_keys.customer_identity_policy (enum, 2 values) + clara._tf_counterparty_name_only_guard (SECURITY DEFINER, fn_owner, pinned search_path) + t_counterparties_name_only_guard (BEFORE INSERT OR UPDATE FOR EACH ROW, sorts ahead of the 0011 trigger) -- AGENTS.md hard constraint 12 is now structural. Vendors, unflagged clients and identifier-clearing are unaffected.';
end $s4$;
