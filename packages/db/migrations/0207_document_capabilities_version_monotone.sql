-- 0207_document_capabilities_version_monotone — #779: THE CAPABILITY REGISTRY'S VERSION NUMBER
-- STOPS BEING A CONVENTION AND BECOMES A DATABASE REFUSAL.
-- =====================================================================================
-- Spec of record: issue #779 (Agent Brief, 2026-09-14), which comes out of the #624 closure
-- review's NOTE 3 — "`registry_version` monotonicity is convention, not a constraint".
-- Parent file: 0191_document_capability_registry.sql, which is NOT edited here (its sha-pinned
-- `persist_document_extraction` splice and its own tail both stay byte-for-byte as they are).
--
-- WHAT WAS MEASURED, AND IS WRONG.
--
--   `clara.document_capabilities` (0191 §S1) holds one row per (format, document_kind), primary
--   keyed on that pair, with `registry_version int not null check (registry_version >= 1)`. That
--   CHECK enforces POSITIVITY and nothing else — a column CHECK cannot see the value it
--   replaces, so no constraint in the schema compares an incoming `registry_version` against the
--   row's current one.
--
--   0191's header says "ONE MONOTONE registry_version" and its tail notice repeats "one
--   registry_version"; both are PROSE. `packages/db/tests/document-capability-registry.test.mjs`
--   asserts `count(distinct registry_version) = 1` and `min(registry_version) >= 1` — a
--   table-wide, test-time OBSERVATION that a uniform backwards republish of every row would
--   satisfy anyway. So nothing anywhere stops a future writer from UPDATE-ing one pair's row to
--   a LOWER version than the one it replaces, and the database accepts it silently.
--
-- WHY A TRIGGER, AND WHY NOT A GRANT OR A POLICY.
--
--   The refusal has to reach the OWNER/MIGRATION role, because that is the only role that can
--   write this table at all: it is forced-RLS with an owner `for all` policy, `clara_authenticated`
--   holds SELECT only, and `clara_agent_ro` holds NO table privilege and reads the registry
--   through the SECURITY DEFINER doors (0165's ruling, which 0191's tail pins). A wall built out
--   of grants or RLS would therefore wall off exactly the roles that were never the hazard, and
--   leave the one that is. A BEFORE UPDATE row trigger comparing OLD to NEW is the only shape
--   that sees the transition and applies to every writer, owner included.
--
-- THE IN-REPO PRECEDENT IS COPIED, NOT INVENTED. `clara._tf_accounting_plans_immutable` (0193)
-- already refuses `new.current_revision < old.current_revision` — "a plan revision number never
-- goes backwards" — with `errcode='CLR08'` and a `detail.reason`. This is the same refusal about
-- a different counter, so it keeps the same code and the same detail shape rather than minting a
-- second spelling. CLR08 is the estate's immutability / append-only family.
--
-- THE CHECK IS UNCONDITIONAL ON UPDATE, deliberately. #779 words the invariant as "for the same
-- key", and the primary key (format, document_kind) is never rewritten by any in-repo writer —
-- but a body that only compared when the key was unchanged would leave a RE-KEYING update as a
-- way to land a lower version, which is a hole opened for no live caller's benefit. Comparing on
-- every UPDATE covers the ticket's case and that one, and refuses nothing any writer does today.
--
-- TWO RESIDUALS, RECORDED HERE RATHER THAN SILENTLY WIDENED (both are #779's own "out of scope"):
--
--   1. A DELETE-then-INSERT at a lower version is NOT blocked. This wall constrains UPDATE
--      transitions for a live row; a row that is deleted and re-inserted is, to the database, a
--      first publication of that key, and the invariant asked for was about transitions. Closing
--      it would mean refusing DELETE on the registry outright, which 0191 does not do and #779
--      did not ask for.
--   2. A WHOLESALE backwards republish — every row updated to the same lower integer — is
--      refused by this trigger row by row (each row's own version would decrease), but the
--      "every row published together carries the same integer" convention itself is still a
--      convention: nothing here enforces cross-row uniformity. #779 names that as a separate
--      question and it is not answered here.
--
-- WHAT DOES NOT CHANGE: the four capability levels and their closed set, the seeded verdicts
-- (the OFX `bank_statement` row included), the `registry_version >= 1` positivity CHECK, the two
-- policies, the grants, and the output of `clara._document_capability(text,text)` /
-- `clara.get_document_state(uuid,uuid)`. INSERT of a brand-new (format, document_kind) row is
-- untouched — the invariant constrains transitions, not first publication.
-- =====================================================================================

set local statement_timeout = '5min';   -- runner rule: statement_timeout is the first executable statement

-- =====================================================================================
-- §A  PRESTATE. What this file assumes, measured rather than remembered.
-- =====================================================================================
do $w779_pre$
declare v_n int; v_def text;
begin
  if to_regclass('clara.document_capabilities') is null then
    raise exception '#779 prestate: clara.document_capabilities is absent -- 0191 must apply first'
      using errcode = 'CLR10';
  end if;

  -- THE KEY THE INVARIANT IS ABOUT. A registry re-keyed since 0191 would make "the same
  -- (format, document_kind) row" mean something else than the wall below compares.
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
   where c.conrelid = 'clara.document_capabilities'::regclass and c.contype = 'p';
  if v_def is null or v_def not ilike '%(format, document_kind)%' then
    raise exception '#779 prestate: clara.document_capabilities is no longer primary-keyed on (format, document_kind) -- got %', coalesce(v_def, '<none>')
      using errcode = 'CLR10';
  end if;

  -- THE POSITIVITY CHECK STAYS. This file adds a transition wall ALONGSIDE it; if it had already
  -- been dropped, the column would have lost the half #779 explicitly keeps.
  select count(*)::int into v_n from pg_constraint c
   where c.conrelid = 'clara.document_capabilities'::regclass and c.contype = 'c'
     and pg_get_constraintdef(c.oid) ilike '%registry_version >= 1%';
  if v_n <> 1 then
    raise exception '#779 prestate: the registry_version >= 1 positivity CHECK is not on the column (found %)', v_n
      using errcode = 'CLR10';
  end if;

  -- THE DEFECT IS STILL THERE. Not a formality: a wall installed elsewhere in the meantime would
  -- make this one a SECOND refusal over one fact, and which one a caller saw would depend on
  -- trigger name order.
  if exists (select 1 from pg_trigger t
              where t.tgrelid = 'clara.document_capabilities'::regclass and not t.tgisinternal) then
    raise exception '#779 prestate: clara.document_capabilities already carries a user trigger -- the version wall was armed elsewhere; do not arm a second one'
      using errcode = 'CLR10';
  end if;
  if to_regprocedure('clara._tf_document_capabilities_version_monotone()') is not null then
    raise exception '#779 prestate: clara._tf_document_capabilities_version_monotone already exists'
      using errcode = 'CLR10';
  end if;

  -- The precedent this body mirrors must be the body it was derived from.
  if to_regprocedure('clara._tf_accounting_plans_immutable()') is null then
    raise exception '#779 prestate: clara._tf_accounting_plans_immutable is absent -- 0193, the precedent this wall copies, must apply first'
      using errcode = 'CLR10';
  end if;
end
$w779_pre$;

-- =====================================================================================
-- §B  THE WALL.
-- =====================================================================================
set role clara_fn_owner;

create function clara._tf_document_capabilities_version_monotone() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $fn$
begin
  if new.registry_version < old.registry_version then
    raise exception 'a capability registry_version never goes backwards (% x %: % -> %)',
      old.format, old.document_kind, old.registry_version, new.registry_version
      using errcode = 'CLR08',
        detail = jsonb_build_object(
          'reason', 'registry_version_monotone',
          'column', 'registry_version',
          'format', old.format,
          'document_kind', old.document_kind,
          'from', old.registry_version,
          'to', new.registry_version)::text;
  end if;
  return new;
end
$fn$;
revoke all on function clara._tf_document_capabilities_version_monotone() from public;
comment on function clara._tf_document_capabilities_version_monotone() is
  'BEFORE UPDATE row wall on clara.document_capabilities (#779): a capability row''s registry_version can never DECREASE across an update. Raises CLR08 with detail.reason = registry_version_monotone, mirroring clara._tf_accounting_plans_immutable''s "a plan revision number never goes backwards" (0193). Raising the version, and leaving it unchanged while another column moves, both still succeed; INSERT of a new (format, document_kind) pair is untouched. RESIDUAL: a DELETE-then-INSERT at a lower version is not blocked, and cross-row uniformity of the published version remains a convention (#779 out of scope).';

create trigger t_document_capabilities_version_monotone
  before update on clara.document_capabilities
  for each row execute function clara._tf_document_capabilities_version_monotone();

reset role;

-- =====================================================================================
-- §C  TAIL. The wall is installed, owned, walled off from PUBLIC — and it actually refuses.
-- =====================================================================================
do $w779_tail$
declare
  v_n int; v_def text; v_owner text; v_secdef boolean; v_cfg text[];
  v_stored int; v_err text; v_detail text; v_reason jsonb;
begin
  -- (1) THE TRIGGER IS INSTALLED, at the timing the invariant needs.
  select pg_get_triggerdef(t.oid) into v_def from pg_trigger t
   where t.tgrelid = 'clara.document_capabilities'::regclass
     and t.tgname = 't_document_capabilities_version_monotone' and not t.tgisinternal;
  if v_def is null then
    raise exception '#779 tail: t_document_capabilities_version_monotone is not installed'
      using errcode = 'CLR10';
  end if;
  if v_def !~* 'BEFORE UPDATE' or v_def !~* 'FOR EACH ROW' then
    raise exception '#779 tail: the version wall is not a BEFORE UPDATE FOR EACH ROW trigger -- got %', v_def
      using errcode = 'CLR10';
  end if;
  if v_def ~* '\mWHEN\M' then
    raise exception '#779 tail: the version wall gained a WHEN clause -- it must see EVERY update of the table'
      using errcode = 'CLR10';
  end if;

  -- (2) DEFINER HYGIENE, the house shape for clara._tf_*: owner-owned, SECURITY DEFINER, pinned
  -- search_path, and no EXECUTE for PUBLIC or for any application role.
  select p.proowner::regrole::text, p.prosecdef, p.proconfig
    into v_owner, v_secdef, v_cfg
    from pg_proc p where p.oid = 'clara._tf_document_capabilities_version_monotone()'::regprocedure;
  if v_owner <> 'clara_fn_owner' then
    raise exception '#779 tail: the wall function is owned by % rather than clara_fn_owner', v_owner
      using errcode = 'CLR10';
  end if;
  if not v_secdef or v_cfg is null or not ('search_path=clara, pg_temp' = any (v_cfg)) then
    raise exception '#779 tail: the wall function is not SECURITY DEFINER with a pinned search_path (secdef=%, config=%)', v_secdef, v_cfg
      using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n
    from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
   where p.oid = 'clara._tf_document_capabilities_version_monotone()'::regprocedure
     and a.grantee = 0 and a.privilege_type = 'EXECUTE';
  if v_n <> 0 then
    raise exception '#779 tail: PUBLIC holds EXECUTE on the wall function' using errcode = 'CLR10';
  end if;
  if pg_catalog.obj_description('clara._tf_document_capabilities_version_monotone()'::regprocedure, 'pg_proc') is null then
    raise exception '#779 tail: the wall function carries no comment' using errcode = 'CLR10';
  end if;

  -- (3) NOTHING 0191 OWNS MOVED. The positivity CHECK, the two policies, the absent application
  -- write grant. A transition wall that had cost the table one of those would be a net loss.
  select count(*)::int into v_n from pg_constraint c
   where c.conrelid = 'clara.document_capabilities'::regclass and c.contype = 'c'
     and pg_get_constraintdef(c.oid) ilike '%registry_version >= 1%';
  if v_n <> 1 then
    raise exception '#779 tail: the registry_version >= 1 positivity CHECK is gone' using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from pg_policies
   where schemaname = 'clara' and tablename = 'document_capabilities';
  if v_n <> 2 then
    raise exception '#779 tail: clara.document_capabilities carries % policies, not the owner + human-read pair', v_n
      using errcode = 'CLR10';
  end if;
  if pg_catalog.has_table_privilege('clara_authenticated', 'clara.document_capabilities', 'INSERT')
     or pg_catalog.has_table_privilege('clara_authenticated', 'clara.document_capabilities', 'UPDATE')
     or pg_catalog.has_table_privilege('clara_authenticated', 'clara.document_capabilities', 'DELETE')
     or pg_catalog.has_table_privilege('clara_agent_ro', 'clara.document_capabilities', 'SELECT') then
    raise exception '#779 tail: an application role gained a write grant (or the agent lane gained SELECT) on the registry'
      using errcode = 'CLR10';
  end if;

  -- (4) IT ACTUALLY REFUSES. Structural presence is not enforcement: a trigger whose body no
  -- longer compared the two versions would pass every assertion above. This probe RAISES the
  -- version, then tries to lower it, and is rolled back whole through the estate's in-migration
  -- sentinel idiom (0016 D-P1's shape) -- raising first so the refusal cannot be the column's
  -- own `>= 1` CHECK answering instead of the wall.
  begin
    update clara.document_capabilities set registry_version = registry_version + 4
     where format = 'pdf' and document_kind = 'invoice';
    begin
      update clara.document_capabilities set registry_version = registry_version - 2
       where format = 'pdf' and document_kind = 'invoice';
      raise exception '#779 tail: a BACKWARDS registry_version was ACCEPTED -- the wall is installed but does not enforce'
        using errcode = 'CLR10';
    exception when sqlstate 'CLR08' then
      get stacked diagnostics v_err = message_text, v_detail = pg_exception_detail;
      v_reason := nullif(v_detail, '')::jsonb;
      if coalesce(v_reason ->> 'reason', '') <> 'registry_version_monotone'
         or coalesce(v_reason ->> 'column', '') <> 'registry_version' then
        raise exception '#779 tail: the refusal carries no machine-readable reason (detail %)', coalesce(v_detail, '<null>')
          using errcode = 'CLR10';
      end if;
    end;
    select registry_version into v_stored from clara.document_capabilities
     where format = 'pdf' and document_kind = 'invoice';
    if v_stored is null then
      raise exception '#779 tail: the probe row vanished' using errcode = 'CLR10';
    end if;
    -- The RAISE must still be accepted, and the refused lowering must have changed nothing.
    if v_stored <> 5 then
      raise exception '#779 tail: after a raise to 5 and a refused lowering the stored version reads % -- the wall refused the wrong direction, or the refusal was not atomic', v_stored
        using errcode = 'CLR10';
    end if;
    raise exception '#779 version wall probe rollback' using errcode = 'ZA207';
  exception when sqlstate 'ZA207' then null;
  end;

  -- (5) THE PROBE LEFT NOTHING BEHIND.
  select count(distinct registry_version)::int into v_n from clara.document_capabilities;
  if v_n <> 1 then
    raise exception '#779 tail: the probe leaked -- the registry publishes % distinct versions', v_n
      using errcode = 'CLR10';
  end if;

  raise notice '#779 tail: OK -- clara.document_capabilities.registry_version monotonicity is now a DATABASE refusal rather than a convention. clara._tf_document_capabilities_version_monotone (clara_fn_owner-owned SECURITY DEFINER, search_path pinned to clara/pg_temp, PUBLIC-revoked, commented) fires BEFORE UPDATE FOR EACH ROW with no WHEN clause and refuses any update that LOWERS registry_version, raising CLR08 with detail.reason = registry_version_monotone plus the pair and both versions -- the same code and detail shape clara._tf_accounting_plans_immutable (0193) already raises for "a plan revision number never goes backwards". Proven behaviourally in this tail against the live table and rolled back whole: a raise to 5 succeeded, the subsequent lowering was refused with the typed code and left the stored value at 5, and the registry still publishes exactly ONE distinct version. Raising, and leaving the version unchanged while another column moves, both still succeed; INSERT of a new (format, document_kind) pair is untouched; the registry_version >= 1 positivity CHECK, the two policies, the absent application write grant and the agent lane''s door-only access are all re-read unchanged. RESIDUALS, named rather than closed (#779 out of scope): a DELETE-then-INSERT at a lower version is not blocked, and cross-row uniformity of the published version remains a convention. 0191_document_capability_registry.sql is not edited by this file.';
end
$w779_tail$;
