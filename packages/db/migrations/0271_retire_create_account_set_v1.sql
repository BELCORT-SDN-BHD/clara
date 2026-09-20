-- 0271_retire_create_account_set_v1 — #1003 (lane 10, riders wave 2): RETIRE THE HUMAN
-- WRITER FOR ACCOUNT SETS. `clara.create_account_set_v1` is DROPPED; its live agent-lane
-- sibling is untouched and remains how the runtime creates an account set.
-- =====================================================================================
-- Spec of record: ticket #1003's Agent Brief, ready-for-agent after the owner's ruling below.
--
-- OWNER RULING (2026-09-20), ON THE TICKET: "Retire `clara.create_account_set_v1`: a new
-- migration revokes the human grant or drops the function, and applied history is not
-- touched. This is the ticket's own recommended Option A, confirmed rather than reshaped.
-- One correction to the ticket's framing ... the delta metrics database suite still drives
-- this door as an authenticated human through its shared fixture, and lists its exact
-- signature in the roster it treats as that lane's required public interface. Retiring the
-- door without retargeting that fixture turns a green suite red, so the brief makes it part
-- of the same change."
--
-- =====================================================================================
-- WHAT THIS FILE DOES, IN ONE SENTENCE. `drop function clara.create_account_set_v1(uuid,
-- text,text,jsonb,boolean,date,text)` — nothing else. No table, column, trigger, policy or
-- ACL on any relation moves; no other function is created, recut or granted.
--
-- WHY DROP AND NOT ONLY REVOKE. The ticket's own Option A text gives the reason: "removes a
-- decoy a future UI could be wired to instead of the newer door, and one more body every
-- security census has to re-confirm as dead." A revoked-but-present body is still a name a
-- census must keep re-deriving is unreachable; a dropped one needs no re-derivation. This is
-- also the estate's own idiom for a body with zero dependents (0118's seventeen-function
-- cutover: "No explicit revoke is needed or written, matching the estate's own drop idiom").
--
-- WHY THIS IS SAFE — THE DEPENDENCY CENSUS (measured on this rig, not assumed, in the
-- prestate below): zero `pg_depend` edges reference this function, zero triggers call it,
-- and it holds no `clara.wake_fn_allowlist` row (it was never wake-wrapped — its capability
-- was DERIVED at migration time into an independent sibling, never delegated to at runtime;
-- 0113's own header: "clara.create_account_set_v1's human body calls NEITHER clara._audit
-- NOR clara._report_agent_receipt", i.e. the derivation only ever READ this body's source
-- text once, historically, to author a new one — see 0113:145-165). Two independently
-- measured product-code censuses (T9, 2026-08-28, re-confirmed by #660) found zero callers
-- in `apps/web` or `apps/dashboard` history either.
--
-- WHAT SURVIVES, BYTE-IDENTICAL, PINNED BELOW AND RE-PINNED IN THE TAIL:
--   · `clara._agent_create_account_set_core` (0113) — the agent-lane core, still the runtime's
--     only way to create an account set;
--   · `clara.wake_create_account_set` (0115), granted to `clara_wake_interactive` (0116) —
--     the wake door in front of it. Out of scope for this ticket and untouched by this file.
-- The rest of the metric-definition lifecycle (propose/approve/reject/supersede, the
-- snapshot minters, the evaluators) is not named anywhere in this file: nothing here can
-- reach it.
--
-- WHAT THIS FILE DOES NOT COVER. The delta-metrics test suite's own fixture (its one
-- remaining caller of the retiring door) and the two live rig checks that name it by
-- signature (packages/db/tests/rig-meta.mjs's `METRICS_0058_HUMAN_FNS` cohort and
-- packages/db/tests/client-financial-pack.test.mjs's `pins_unmoved` pinned-body census) are
-- test-side source, not migration DDL — they are retargeted/updated in the same commit
-- series as this file, not inside it. So is `packages/db/tests/delta-fixtures.mjs`'s
-- `DELTA_ENTRYPOINTS` readiness roster.
--
-- REDO-SAFE (#957). The prestate below is written to succeed EITHER when this file has not
-- yet applied (the function present, pinned, and cleared to drop) OR when it already has
-- (the function already absent — a `CLARA_MIGRATION_REDO` re-run of this same file): it
-- never asserts the function's PRESENCE unconditionally, only its shape when present. The
-- drop statement itself is `drop function if exists`, a no-op on a database where it
-- already ran. The two sibling pins are re-checked unconditionally either way, since this
-- file must not touch them regardless of which branch it takes.
-- =====================================================================================

do $t1003_pre$
declare
  v_sig text := 'clara.create_account_set_v1(uuid,text,text,jsonb,boolean,date,text)';
  v_core_sig text := 'clara._agent_create_account_set_core(uuid,uuid,uuid,text,uuid,text,text,jsonb,boolean,date,text,jsonb)';
  v_wake_sig text := 'clara.wake_create_account_set(uuid,text,text,jsonb,boolean,date,text,jsonb,text)';
  v_present boolean;
  v_sha text;
  v_auth boolean;
  v_pub boolean;
  v_deps int;
  v_trigs int;
  v_allow int;
begin
  v_present := to_regprocedure(v_sig) is not null;

  if v_present then
    select encode(sha256(convert_to(prosrc,'UTF8')),'hex') into v_sha
      from pg_proc where oid = v_sig::regprocedure;
    if v_sha is distinct from '25f9274792b14c054f1633e4518f689084a8e6548d10e3079cec4e760fd28495' then
      raise exception '#1003 prestate: % has DRIFTED from its measured pre-image (got %) -- re-measure before dropping it',
        v_sig, v_sha using errcode='CLR10';
    end if;

    select has_function_privilege('clara_authenticated', v_sig::regprocedure, 'execute') into v_auth;
    select has_function_privilege('public', v_sig::regprocedure, 'execute') into v_pub;
    if v_auth is not true or v_pub is not false then
      raise exception '#1003 prestate: %''s ACL is not the expected clara_authenticated-only human-door shape (authenticated=%, public=%)',
        v_sig, v_auth, v_pub using errcode='CLR10';
    end if;

    select count(*)::int into v_deps from pg_depend where refobjid = v_sig::regprocedure;
    if v_deps <> 0 then
      raise exception '#1003 prestate: % has % pg_depend edge(s) -- it is not the free-standing writer this ticket measured, so dropping it needs re-review',
        v_sig, v_deps using errcode='CLR10';
    end if;

    select count(*)::int into v_trigs from pg_trigger where tgfoid = v_sig::regprocedure and not tgisinternal;
    if v_trigs <> 0 then
      raise exception '#1003 prestate: % is called from % trigger(s) -- it is not the unreferenced human door this ticket measured',
        v_sig, v_trigs using errcode='CLR10';
    end if;

    select count(*)::int into v_allow from clara.wake_fn_allowlist where function_name = 'create_account_set_v1';
    if v_allow <> 0 then
      raise exception '#1003 prestate: create_account_set_v1 holds a wake_fn_allowlist row -- it was never wake-wrapped, so one existing here is a finding, not a precondition'
        using errcode='CLR10';
    end if;

    raise notice '#1003 prestate: clara.create_account_set_v1 is present, byte-identical to its measured pre-image, granted to clara_authenticated alone with no PUBLIC entry, has zero pg_depend edges, zero calling triggers and no wake_fn_allowlist row -- clear to drop.';
  else
    raise notice '#1003 prestate: clara.create_account_set_v1 is already absent -- treating this run as a CLARA_MIGRATION_REDO of this file''s own drop; the drop statement below is a no-op and only the two sibling pins below are re-checked.';
  end if;

  -- THE TWO LIVE SIBLINGS THIS FILE MUST NOT TOUCH, pinned unconditionally (present-or-redo):
  -- the agent-lane core and the wake door in front of it.
  if to_regprocedure(v_core_sig) is null then
    raise exception '#1003 prestate: % is absent -- 0113 must apply first', v_core_sig using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(prosrc,'UTF8')),'hex') into v_sha
    from pg_proc where oid = v_core_sig::regprocedure;
  if v_sha is distinct from 'c8e50fbcf8bf3160192bd63e8b6d4ee830d1b06e0ac7257f227f26a53ecd65cf' then
    raise exception '#1003 prestate: % has DRIFTED from its measured pre-image (got %) -- this file must not touch it, so re-measure before applying',
      v_core_sig, v_sha using errcode='CLR10';
  end if;

  if to_regprocedure(v_wake_sig) is null then
    raise exception '#1003 prestate: % is absent -- 0115 must apply first', v_wake_sig using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(prosrc,'UTF8')),'hex') into v_sha
    from pg_proc where oid = v_wake_sig::regprocedure;
  if v_sha is distinct from 'a3dc0941acd3ded83835a335849c5feeb7dde672f59148a5e0b27ee843ce011b' then
    raise exception '#1003 prestate: % has DRIFTED from its measured pre-image (got %) -- this file must not touch it, so re-measure before applying',
      v_wake_sig, v_sha using errcode='CLR10';
  end if;
end
$t1003_pre$;

-- =====================================================================================
-- THE CHANGE. `if exists` is what makes this statement redo-safe (see the header): a no-op
-- on a database where this file already applied. The function is owned by clara_fn_owner,
-- so dropping it needs that role.
-- =====================================================================================
set role clara_fn_owner;
drop function if exists clara.create_account_set_v1(uuid,text,text,jsonb,boolean,date,text);
reset role;

-- =====================================================================================
-- TAIL. Re-reads the live catalog rather than trusting the DROP ran as written.
-- =====================================================================================
do $t1003_tail$
declare
  v_sig text := 'clara.create_account_set_v1(uuid,text,text,jsonb,boolean,date,text)';
  v_core_sig text := 'clara._agent_create_account_set_core(uuid,uuid,uuid,text,uuid,text,text,jsonb,boolean,date,text,jsonb)';
  v_wake_sig text := 'clara.wake_create_account_set(uuid,text,text,jsonb,boolean,date,text,jsonb,text)';
  v_sha text;
begin
  if to_regprocedure(v_sig) is not null then
    raise exception '#1003 tail: % still resolves after its DROP', v_sig using errcode='CLR10';
  end if;

  -- The two siblings are byte-identical to their prestate pins, and their own posture is
  -- exactly what it was before this file ran: the core reachable only from the wake door's
  -- own SECURITY DEFINER body (granted to nobody), the wake door still granted to
  -- clara_wake_interactive and to no human role.
  select encode(sha256(convert_to(prosrc,'UTF8')),'hex') into v_sha
    from pg_proc where oid = v_core_sig::regprocedure;
  if v_sha is distinct from 'c8e50fbcf8bf3160192bd63e8b6d4ee830d1b06e0ac7257f227f26a53ecd65cf' then
    raise exception '#1003 tail: % MOVED while this file applied -- it must not have (got %)', v_core_sig, v_sha using errcode='CLR10';
  end if;
  if has_function_privilege('clara_authenticated', v_core_sig::regprocedure, 'execute') then
    raise exception '#1003 tail: % is reachable by the human lane -- it never was and still must not be', v_core_sig using errcode='CLR10';
  end if;

  select encode(sha256(convert_to(prosrc,'UTF8')),'hex') into v_sha
    from pg_proc where oid = v_wake_sig::regprocedure;
  if v_sha is distinct from 'a3dc0941acd3ded83835a335849c5feeb7dde672f59148a5e0b27ee843ce011b' then
    raise exception '#1003 tail: % MOVED while this file applied -- it must not have (got %)', v_wake_sig, v_sha using errcode='CLR10';
  end if;
  if not has_function_privilege('clara_wake_interactive', v_wake_sig::regprocedure, 'execute') then
    raise exception '#1003 tail: % lost its clara_wake_interactive grant -- this file must not touch it', v_wake_sig using errcode='CLR10';
  end if;
  if has_function_privilege('clara_authenticated', v_wake_sig::regprocedure, 'execute') then
    raise exception '#1003 tail: % is reachable by the human lane -- it never was and still must not be', v_wake_sig using errcode='CLR10';
  end if;

  raise notice '#1003 tail: OK -- clara.create_account_set_v1 no longer resolves; clara._agent_create_account_set_core and clara.wake_create_account_set are byte-identical to their measured pre-images, the core remains reachable by nobody directly and the wake door remains granted to clara_wake_interactive alone. The delta-metrics fixture, its readiness roster and the two live rig checks that named the retired signature are updated in this same change''s test-side files, not here.';
end
$t1003_tail$;
