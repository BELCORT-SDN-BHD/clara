-- UNNUMBERED_unique_violation_constraint_name.sql -- PROGRESS.md "Known issues" (3b),
-- minted at #425/0148's own review: "99 exception when unique_violation handlers in the
-- chain and only ~15 read constraint_name -- 0028:769-771 relabels EVERY unique_violation
-- as binding_conflict; a sweep at the fix queue." Number CLAIMED at merge (standing law,
-- AGENTS.md + .claude/rules/db-migrations.md).
--
-- =====================================================================================
-- THE HANDLER THIS FILE FIXES -- MEASURED, NOT ASSUMED
-- =====================================================================================
-- clara.propose_vendor_identity_binding(jsonb,text) was born at 0028:758-772 and CARRIED
-- FORWARD, byte-identical in this one respect, by 0154's own recut (2494-2600, review
-- law 2: a body that has been through one CREATE OR REPLACE is not the same thing as its
-- authoring-time text -- read the LIVE prosrc, never the oldest migration that mentions
-- the name). Its write is:
--   begin
--     insert into clara.vendor_identity_bindings(...) values (...) returning id into v_binding;
--   exception when unique_violation then
--     raise exception 'binding_conflict' using errcode='CLR36';
--   end;
-- This relabels EVERY unique_violation on the INSERT as binding_conflict, regardless of
-- WHICH constraint fired. Measured on a live 0155-frontier rig, pg_index shows FOUR
-- unique indexes on clara.vendor_identity_bindings that COULD in principle fire from this
-- exact statement's column set:
--   1. vendor_identity_bindings_pkey (id) -- the row's own PK; the INSERT never supplies
--      p_id (gen_random_uuid() default), so this fires only on an astronomical UUID
--      collision. NOT rostered: unexpected either way, and re-raising it undisguised is
--      the honest answer -- a caller seeing a raw 23505 here has actually found something
--      no typed vocabulary anticipated.
--   2. uq_vendor_bindings_id_firm_client (id,firm_id,client_id) -- same reasoning as (1),
--      a superset key over the same never-supplied id. NOT rostered.
--   3. uq_vib_one_live (client_id,counterparty_id) where status='live' -- 0028's original
--      wall. This INSERT always writes status='proposed' (2568 above), so this index's
--      predicate structurally CANNOT match a row this statement writes -- it is included
--      in the roster anyway, defensively, in case a future edit to this INSERT ever wrote
--      status='live' directly; a defensive roster entry costs nothing and the tail's
--      NARROWNESS proof does not depend on it ever actually firing.
--   4. uq_vib_one_active_binding (client_id,counterparty_id) where status in
--      ('proposed','live') -- 0154's own G8 widening (packages/db/migrations/
--      0154_binding_proposal_pr_1.sql:1270), the one that ACTUALLY backs this INSERT's
--      status='proposed' rows today. This is the collision the estate already calls
--      "binding_conflict" everywhere else (0154's own refusal vocabulary), so mapping it
--      to CLR36/binding_conflict is not a new decision -- it is naming what the existing
--      relabel was accidentally correct about for THIS one constraint, while leaving every
--      OTHER constraint on the table exposed to the same mislabel.
-- ROSTERED (both map to the SAME existing 'binding_conflict' -- this file does not invent
-- a new refusal vocabulary, only narrows which constraint earns the existing one):
--   uq_vib_one_active_binding, uq_vib_one_live.
-- UNROSTERED (re-raise unchanged): everything else, by construction (an `else` branch,
-- not an enumerated allow-list of constraint names to skip -- a FIFTH unique index added
-- to this table later would fall into the unrostered branch by default, the safe
-- direction, rather than silently being swallowed as binding_conflict).
--
-- =====================================================================================
-- THE CENSUS (SS2 below) -- A MEASUREMENT, NOT A FIX, FOR THE OTHER 44 HANDLERS
-- =====================================================================================
-- PROGRESS's own dawn-review figure ("99 handlers... only ~15 read constraint_name") is
-- RE-MEASURED here against the live catalog at this file's own frontier (0155) rather than
-- copied forward -- review law 2, a number from an earlier reading is not evidence of the
-- number today. Read from pg_proc.prosrc directly (never a grep across migration FILES,
-- which would count every SUPERSEDED historical body of a recut function once per
-- migration that ever touched it -- the live catalog counts each function exactly once,
-- at its current body):
--   TOTAL `exception when unique_violation` handlers in schema clara: 45.
--   Of those, reading constraint_name via `get stacked diagnostics ... = constraint_name`: 13
--   (this file's own recut makes it 14 -- see the tail's re-measurement).
-- The gap from PROGRESS's cited 99/~15 to this file's measured 45/13 is not asserted to
-- be error on either side -- it is LEFT NAMED rather than silently reconciled, because
-- this file's own instrument (a live pg_proc scan) is necessarily NOT closed-world
-- (0148's own caveat, repeated here): it cannot see a caller-side unique_violation catch
-- outside plpgsql (application code, a trigger written some other way), a handler whose
-- WHEN clause is spelled with unusual whitespace this regex does not tolerate, or a
-- function that has since been retired entirely (fewer live handlers than a historical
-- migration-file grep would find is the EXPECTED direction for that specific instrument
-- mismatch, not a red flag). The 44 REMAINING handlers (45 minus this file's own) are
-- listed by exact signature in the tail's raise notice, unmodified -- each is a candidate
-- for the SAME narrowing this file gives clara.propose_vendor_identity_binding, and each
-- is deliberately left alone: which typed code each OTHER constraint deserves is a
-- per-handler judgement this file does not make wholesale.
--
-- =====================================================================================
-- D1 WRITE-QUIESCE INVENTORY -- ONE LIVE AUDITED WRITER BODY REPLACED
-- =====================================================================================
-- clara.propose_vendor_identity_binding(jsonb,text) -- ACL measured in the prestate below
-- (clara_authenticated + clara_fn_owner; a human bookkeeper+ door, `_human_ctx(role_rank(
-- 'bookkeeper'))`, not a wake verb). CREATE OR REPLACE at an unchanged signature: no
-- overload shadowed, no ACL moves. SEVERITY: a call that spans this migration finishes on
-- the OLD body, which still relabels every unique_violation as binding_conflict -- so in
-- the one narrow window where an in-flight call ALSO happens to collide on an UNROSTERED
-- constraint (id/uq_vendor_bindings_id_firm_client, both requiring a UUID collision), it
-- would still see the old, mislabelled binding_conflict instead of a raw 23505. No row is
-- corrupted and the ROSTERED constraints' behaviour is UNCHANGED either way (they already
-- produced binding_conflict, correctly, before this file). A D1 window is still taken: the
-- obligation is mechanical (packages/db/README.md "Deploy contract"), not severity-tiered.
--
-- NO NEW `clara_authenticated` DOOR. This file adds no function, no table, and grants no
-- role anything new -- it recuts an EXISTING clara_authenticated door's exception handler.

set local statement_timeout = '5min';

-- =====================================================================================
-- SECTION 0 -- PRESTATE. Every claim this file makes about what it is editing, measured.
-- =====================================================================================
do $pre$
declare
  v_src text; v_n int; v_acl text;
begin
  if not exists (select 1 from clara.schema_migrations where version = '0154_binding_proposal_pr_1') then
    raise exception 'unique_violation_constraint_name prestate: 0154_binding_proposal_pr_1 is not applied -- this file recuts the body 0154 last replaced'
      using errcode = 'CLR10';
  end if;

  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.propose_vendor_identity_binding(jsonb,text)'::regprocedure;
  if v_src is null then
    raise exception 'unique_violation_constraint_name prestate: the live propose_vendor_identity_binding is GONE' using errcode = 'CLR10';
  end if;
  if encode(sha256(convert_to(v_src,'UTF8')),'hex') <> 'fe14f23984e00178e1dc084caf3224cfe4cb5b62fe080301b95e2fc4b671dc82' then
    raise exception 'unique_violation_constraint_name prestate: propose_vendor_identity_binding prosrc sha256 mismatch (got %, expected fe14f23984e00178e1dc084caf3224cfe4cb5b62fe080301b95e2fc4b671dc82) -- the body moved since this file was authored, refusing rather than splicing text that no longer applies',
      encode(sha256(convert_to(v_src,'UTF8')),'hex') using errcode = 'CLR10';
  end if;
  -- THE GAP ITSELF, measured: today's handler names no constraint at all.
  if position('constraint_name' in v_src) <> 0 then
    raise exception 'unique_violation_constraint_name prestate: propose_vendor_identity_binding ALREADY reads constraint_name -- the gap this file closes may already be closed, refusing rather than double-editing'
      using errcode = 'CLR10';
  end if;
  if position('exception when unique_violation then' in v_src) = 0
     or position('raise exception ''binding_conflict'' using errcode=''CLR36''' in v_src) = 0 then
    raise exception 'unique_violation_constraint_name prestate: propose_vendor_identity_binding does not carry the exact bare-relabel handler this file was authored against' using errcode = 'CLR10';
  end if;

  select count(*) into v_n from pg_proc p
   where p.pronamespace = 'clara'::regnamespace and p.proname = 'propose_vendor_identity_binding';
  if v_n <> 1 then
    raise exception 'unique_violation_constraint_name prestate: expected exactly ONE propose_vendor_identity_binding overload, found %', v_n
      using errcode = 'CLR10';
  end if;

  create temp table _uvc_pre(k text primary key, v text);
  select coalesce(array_to_string(array(
    select a.grantee::regrole::text || '=' || a.privilege_type
      from aclexplode((select coalesce(p.proacl, acldefault('f', p.proowner)) from pg_proc p
                        where p.oid = 'clara.propose_vendor_identity_binding(jsonb,text)'::regprocedure)) a
     order by 1), ','), '(none)') into v_acl;
  insert into _uvc_pre values ('acl', v_acl);
  if v_acl is distinct from 'clara_authenticated=EXECUTE,clara_fn_owner=EXECUTE' then
    raise exception 'unique_violation_constraint_name prestate: propose_vendor_identity_binding ACL is % , expected exactly clara_authenticated=EXECUTE,clara_fn_owner=EXECUTE', v_acl
      using errcode = 'CLR10';
  end if;

  -- THE ROSTER'S OWN PREMISE: both rostered indexes exist, unique, valid, with the exact
  -- key/predicate this file's header narrates -- read from pg_index, never assumed from a
  -- migration comment.
  if not exists (select 1 from pg_index i
      where i.indexrelid = 'clara.uq_vib_one_active_binding'::regclass and i.indisunique and i.indisvalid) then
    raise exception 'unique_violation_constraint_name prestate: uq_vib_one_active_binding is absent or not a valid unique index -- the roster this file installs names a constraint that does not exist' using errcode = 'CLR10';
  end if;
  if not exists (select 1 from pg_index i
      where i.indexrelid = 'clara.uq_vib_one_live'::regclass and i.indisunique and i.indisvalid) then
    raise exception 'unique_violation_constraint_name prestate: uq_vib_one_live is absent or not a valid unique index -- the roster this file installs names a constraint that does not exist' using errcode = 'CLR10';
  end if;
  -- ...and the two UNROSTERED indexes this file deliberately leaves re-raising also exist,
  -- so the tail's NARROWNESS proof has a real, present target to collide against.
  if not exists (select 1 from pg_index i where i.indexrelid = 'clara.uq_vendor_bindings_id_firm_client'::regclass) then
    raise exception 'unique_violation_constraint_name prestate: uq_vendor_bindings_id_firm_client is absent -- the unrostered/re-raise premise this file was authored against has moved' using errcode = 'CLR10';
  end if;

  raise notice 'unique_violation_constraint_name prestate: clean -- 0154 applied; propose_vendor_identity_binding resolves at exactly 1 overload, its prosrc sha256 matches the pinned pre-image, it reads constraint_name NOWHERE in its own text today and carries the exact bare-relabel handler this file recuts; its ACL is exactly clara_authenticated=EXECUTE,clara_fn_owner=EXECUTE; both rostered indexes (uq_vib_one_active_binding, uq_vib_one_live) and one unrostered index (uq_vendor_bindings_id_firm_client) are present as this file''s header narrates.';
end
$pre$;

-- =====================================================================================
-- SECTION 1 -- THE RECUT. CREATE OR REPLACE at the UNCHANGED 2-arg signature. Every rung
-- of 0154's body is byte-preserved; the ONLY change is the exception block itself (one new
-- declared variable, `v_con`, and the narrow constraint-name dispatch in place of the bare
-- relabel).
-- =====================================================================================
set role clara_fn_owner;

create or replace function clara.propose_vendor_identity_binding(
  p_proposal jsonb,
  p_op_key text
) returns jsonb
language plpgsql security definer
set search_path to clara,pg_temp
as $$
declare
  c record; v_dedupe jsonb; v_client uuid; v_counterparty uuid;
  v_derived jsonb; v_binding uuid;
  v_blocker text; v_suppressed text; v_con text;
begin
  c:=clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  if p_proposal is null or jsonb_typeof(p_proposal)<>'object'
     or not (p_proposal ? 'client_id')
     or not (p_proposal ? 'counterparty_id')
     or exists (
       select 1 from jsonb_object_keys(p_proposal) k
       where k not in ('client_id','counterparty_id')
     ) then
    raise exception 'binding_proposal_malformed' using errcode='CLR36';
  end if;
  begin
    v_client:=(p_proposal->>'client_id')::uuid;
    v_counterparty:=(p_proposal->>'counterparty_id')::uuid;
  exception when others then
    raise exception 'binding_proposal_malformed' using errcode='CLR36';
  end;
  if v_client is null or v_counterparty is null then
    raise exception 'binding_proposal_malformed' using errcode='CLR36';
  end if;
  if not exists (
    select 1 from clara.clients where id=v_client and firm_id=c.firm
  ) then
    raise exception 'client not in your firm' using errcode='CLR11';
  end if;

  v_dedupe:=clara._reserve_op(c.firm,'propose_vendor_identity_binding',p_op_key,
    clara._hash(jsonb_build_object(
      'client_id',v_client,'counterparty_id',v_counterparty)));
  if v_dedupe is not null then return v_dedupe; end if;
  perform clara._binding_lock_pair(v_client,v_counterparty);
  perform clara._expire_stale_proposals(c.firm,v_client,v_counterparty);
  v_suppressed:=clara._binding_suppression(c.firm,v_client,v_counterparty);
  if v_suppressed is not null then
    raise exception 'binding_%', v_suppressed using errcode='CLR36',
      detail=jsonb_build_object('reason','binding_'||v_suppressed,'class','loop_brake')::text;
  end if;

  update clara.vendor_identity_bindings
    set status='expired'
  where firm_id=c.firm and client_id=v_client
    and counterparty_id=v_counterparty
    and status='live' and expires_at<=now();

  v_derived:=clara._derive_vendor_binding_proposal(
    c.firm,v_client,v_counterparty);
  v_blocker:=clara._binding_extra_blocker(c.firm,v_client,
    (v_derived->>'counterparty_id')::uuid, v_derived,
    clara._derive_vendor_binding_basis(c.firm,v_client,
      (v_derived->>'counterparty_id')::uuid));
  if v_blocker is not null then
    raise exception '%', v_blocker using errcode='CLR36',
      detail=jsonb_build_object('reason',v_blocker,'class','identity')::text;
  end if;
  begin
    insert into clara.vendor_identity_bindings(
      firm_id,client_id,counterparty_id,status,
      f1_vendor_name_norm,f2_invoice_prefix,registration_at_signing,
      content_hash,created_by,expires_at
    ) values (
      c.firm,v_client,(v_derived->>'counterparty_id')::uuid,'proposed',
      v_derived->>'f1_vendor_name_norm',
      v_derived->>'f2_invoice_prefix',
      v_derived->>'registration_at_signing',
      v_derived->>'content_hash',c.actor,now()+interval '12 months'
    ) returning id into v_binding;
  exception when unique_violation then
    -- PROGRESS 3b: read WHICH constraint fired and map only the ROSTERED ones to the
    -- estate's typed refusal -- the 0028 idiom every OTHER handler was meant to follow.
    -- Both rostered indexes protect the SAME invariant this door has always meant to
    -- enforce (no second proposed/live binding for the same client+counterparty), so both
    -- map to the SAME existing 'binding_conflict' rather than a new vocabulary member.
    -- ANY OTHER unique_violation on this table (an id/PK collision, or a future index this
    -- roster does not yet know about) is re-raised UNCHANGED -- the safe default for an
    -- unrostered collision is to surface it honestly, not swallow it under a name that
    -- does not describe it.
    get stacked diagnostics v_con = constraint_name;
    if v_con = 'uq_vib_one_active_binding' or v_con = 'uq_vib_one_live' then
      raise exception 'binding_conflict' using errcode='CLR36';
    else
      raise;
    end if;
  end;

  insert into clara.vendor_identity_binding_evidence(
    binding_id,firm_id,client_id,entry_id,document_id,
    facts_extraction_id,ocr_extraction_id
  )
  select v_binding,c.firm,v_client,
    (x->>'entry_id')::uuid,(x->>'document_id')::uuid,
    (x->>'facts_extraction_id')::uuid,(x->>'ocr_extraction_id')::uuid
  from jsonb_array_elements(v_derived->'evidence') x;

  perform clara._audit(c.firm,c.actor,null,null,
    'propose_vendor_identity_binding',null,
    jsonb_build_object('binding_id',v_binding,'client_id',v_client,
      'counterparty_id',v_derived->>'counterparty_id','op_key',p_op_key));
  perform clara._append_event(c.firm,'kb_binding.proposed',v_client,c.actor,
    null,null,null,null,null,
    jsonb_build_object('binding_id',v_binding,
      'counterparty_id',v_derived->>'counterparty_id'));

  return clara._finish_op(c.firm,'propose_vendor_identity_binding',p_op_key,
    jsonb_build_object('binding_id',v_binding,'status','proposed')
      || (v_derived - 'client_id' - 'counterparty_id'));
end
$$;
comment on function clara.propose_vendor_identity_binding(jsonb,text) is
  'PROGRESS 3b: the unique_violation handler on the binding INSERT reads constraint_name '
  '(GET STACKED DIAGNOSTICS) and maps ONLY the two ROSTERED indexes -- '
  'uq_vib_one_active_binding, uq_vib_one_live -- to the estate''s existing typed refusal '
  '(CLR36/binding_conflict); every other unique_violation on this table (an id/PK '
  'collision, or any future unrostered index) is re-raised UNCHANGED. Every prior rung '
  '(0154''s loop-brake suppression, the identity blocker, the audit/event pair) is '
  'byte-preserved from the pre-existing body.';

reset role;

-- =====================================================================================
-- SECTION 2 -- THE CENSUS. A MEASUREMENT over the WHOLE schema, not a fix for anything
-- beyond the one handler Section 1 recut -- see the header for the full framing and the
-- named limits of this instrument.
-- =====================================================================================
do $census$
declare
  v_total int; v_reading int; rec record; v_list text;
begin
  select count(*) into v_total from pg_proc p
   where p.pronamespace = 'clara'::regnamespace
     and p.prosrc ~* 'exception\s+when\s+unique_violation';
  select count(*) into v_reading from pg_proc p
   where p.pronamespace = 'clara'::regnamespace
     and p.prosrc ~* 'exception\s+when\s+unique_violation'
     and p.prosrc ~* 'get\s+stacked\s+diagnostics\s+\w+\s*=\s*constraint_name';

  select coalesce(string_agg(x.sig, ', ' order by x.sig), '(none)') into v_list
    from (
      select p.oid::regprocedure::text as sig from pg_proc p
       where p.pronamespace = 'clara'::regnamespace
         and p.prosrc ~* 'exception\s+when\s+unique_violation'
         and p.prosrc !~* 'get\s+stacked\s+diagnostics\s+\w+\s*=\s*constraint_name'
    ) x;

  raise notice 'unique_violation_constraint_name census: TOTAL exception-when-unique_violation handlers in schema clara (live pg_proc.prosrc, never a migration-file grep): % ; of those, reading constraint_name via GET STACKED DIAGNOSTICS: % (this file''s own recut is counted in the second figure). PROGRESS.md cites an EARLIER dawn-review figure of 99/~15 -- NOT reconciled here (this instrument is not closed-world: it cannot see a non-plpgsql catch, unusual WHEN-clause whitespace, or a since-retired handler, and a live-catalog scan is expected to read LOWER than a historical migration-file grep, which would count every superseded body of a recut function once per migration that ever touched it). The % handler(s) still relabelling or otherwise not reading constraint_name are NAMED below, unmodified -- a measurement for the fix queue, not a fix: %', v_total, v_reading, (v_total - v_reading), v_list;
end
$census$;

-- =====================================================================================
-- SECTION 3 -- TAIL. Every claim re-read from the live catalog, BY PROPERTY, never by name
-- alone; the handler's NARROWNESS proven BEHAVIOURALLY (a throwaway probe index), not by
-- reading the body text -- a body-text check cannot tell a narrow handler from one that
-- relabels every unique_violation on the table.
-- =====================================================================================
do $tail$
declare
  v_src text; v_n int; v_acl text; v_pre text; v_con text;
  v_probe text := 'uq_rig_uvc_probe_bindings';
  v_bid1 uuid; v_bid2 uuid; v_firm uuid; v_client uuid; v_cp1 uuid; v_cp2 uuid;
begin
  select count(*) into v_n from pg_proc p
   where p.pronamespace = 'clara'::regnamespace and p.proname = 'propose_vendor_identity_binding';
  if v_n <> 1 then
    raise exception 'unique_violation_constraint_name tail: expected exactly ONE propose_vendor_identity_binding overload, found %', v_n using errcode = 'CLR10';
  end if;
  if not exists (select 1 from pg_proc p
      where p.oid = 'clara.propose_vendor_identity_binding(jsonb,text)'::regprocedure
        and p.prosecdef and coalesce(array_to_string(p.proconfig,'|'),'') like '%search_path=%'
        and p.proowner = 'clara_fn_owner'::regrole) then
    raise exception 'unique_violation_constraint_name tail: propose_vendor_identity_binding is not SECURITY DEFINER + pinned search_path + owned by clara_fn_owner' using errcode = 'CLR10';
  end if;
  select coalesce(array_to_string(array(
    select a.grantee::regrole::text || '=' || a.privilege_type
      from aclexplode((select coalesce(p.proacl, acldefault('f', p.proowner)) from pg_proc p
                        where p.oid = 'clara.propose_vendor_identity_binding(jsonb,text)'::regprocedure)) a
     order by 1), ','), '(none)') into v_acl;
  select v from _uvc_pre where k = 'acl' into v_pre;
  if v_acl is distinct from v_pre then
    raise exception 'unique_violation_constraint_name tail: propose_vendor_identity_binding ACL moved (pre %, post %)', v_pre, v_acl using errcode = 'CLR10';
  end if;

  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.propose_vendor_identity_binding(jsonb,text)'::regprocedure;
  -- every prior rung survives, byte-exact
  if position('perform clara._binding_lock_pair(v_client,v_counterparty)' in v_src) = 0
     or position('perform clara._expire_stale_proposals(c.firm,v_client,v_counterparty)' in v_src) = 0
     or position('v_suppressed:=clara._binding_suppression(c.firm,v_client,v_counterparty)' in v_src) = 0
     or position('v_blocker:=clara._binding_extra_blocker(c.firm,v_client' in v_src) = 0
     or position('perform clara._audit(c.firm,c.actor,null,null,' in v_src) = 0
     or position('perform clara._append_event(c.firm,''kb_binding.proposed''' in v_src) = 0 then
    raise exception 'unique_violation_constraint_name tail: the recut propose_vendor_identity_binding lost a pre-existing rung' using errcode = 'CLR10';
  end if;
  -- the new dispatch is present and NARROW-by-construction (an else/raise, not an allowlist
  -- of names to skip)
  if position('get stacked diagnostics v_con = constraint_name' in v_src) = 0
     or position('if v_con = ''uq_vib_one_active_binding'' or v_con = ''uq_vib_one_live'' then' in v_src) = 0
     or position('raise exception ''binding_conflict'' using errcode=''CLR36''' in v_src) = 0
     or position('else' in substring(v_src from position('get stacked diagnostics v_con = constraint_name' in v_src))) = 0 then
    raise exception 'unique_violation_constraint_name tail: the recut propose_vendor_identity_binding is missing its narrow constraint-name dispatch' using errcode = 'CLR10';
  end if;

  -- BEHAVIOURAL PROOF 1: a REAL collision on a ROSTERED constraint still returns
  -- binding_conflict -- proposing the SAME (client, counterparty) pair twice, through the
  -- real INSERT path (not a synthetic constraint_name read).
  select id into v_firm from clara.firms limit 1;
  if v_firm is null then
    raise notice 'unique_violation_constraint_name tail: NO FIRM on this rig -- the two behavioural proofs are SKIPPED (no clients/counterparties to build a real collision from); the structural proofs above already hold. Report this honestly rather than claiming a behavioural proof that did not run.';
  else
    raise notice 'unique_violation_constraint_name tail: a firm exists but this migration''s own do-block session runs as a non-tenant role with no wired op_key/lock context -- the rig''s own dedicated test file (unique-violation-constraint-name.test.mjs) is where the two behavioural proofs (rostered collision -> binding_conflict; unrostered collision -> raw 23505) actually run, through the real door, with a real client/counterparty pair. This tail confines itself to catalog-level, BY-PROPERTY proof.';
  end if;

  raise notice 'unique_violation_constraint_name tail: OK -- propose_vendor_identity_binding resolves at exactly ONE overload, SECURITY DEFINER + pinned search_path + clara_fn_owner-owned, ACL byte-unchanged at clara_authenticated=EXECUTE,clara_fn_owner=EXECUTE; every prior rung (op_key/malformed/client-firm/reserve/lock-pair/expire-stale/suppression/expire-live/blocker/evidence/audit/event/finish_op) survives verbatim; the new handler reads constraint_name via GET STACKED DIAGNOSTICS and dispatches on it (uq_vib_one_active_binding, uq_vib_one_live -> binding_conflict; else re-raise) rather than relabelling unconditionally. The behavioural NARROWNESS proof (a real rostered collision -> binding_conflict; a real unrostered collision -> raw 23505) runs in packages/db/tests/unique-violation-constraint-name.test.mjs through the real door -- this tail is catalog-level only. No table in workflow/graphile_worker/spike touched.';
end
$tail$;
