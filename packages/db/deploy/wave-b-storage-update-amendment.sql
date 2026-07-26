-- =====================================================================
-- STORAGE PROVISION — AMENDMENT 1: the upload path needs UPDATE (2026-07-26)
--
-- WHY THIS EXISTS. `storage-provision.sql` grants the dedicated custom role
-- `clara_storage_docs` object **INSERT + SELECT only**, and says so explicitly:
-- "no UPDATE/DELETE". On 2026-07-26 that posture stopped being compatible with
-- Supabase's Storage service: every upload began failing with
--
--     PUT -> 400  {"statusCode":"403","message":"permission denied for table objects"}
--
-- and document intake was DOWN for ~12 hours. Diagnosis in
-- `docs/ops/incident-2026-07-26-intake-storage.md`. The short version, all of it
-- established by probe rather than inference:
--
--   * NOT the credential — the storage-role JWT is valid to 2027-01-15, and the
--     SAME JWT still reads: an object GET returns bytes, and a DB-backed LIST
--     returns 200. So Storage DOES still assume the custom role.
--   * NOT the INSERT — performed directly as `clara_storage_docs` in a rolled-back
--     transaction, the exact insert SUCCEEDS. Grant and RLS policy are sufficient.
--   * NOT our config — no Fly release since v27, which uploaded successfully at
--     2026-07-25 20:08Z; no `storage.migrations` row since project creation.
--   * IT IS the UPDATE. As `clara_storage_docs`, both `update storage.objects` and
--     `delete storage.objects` raise **42501 permission denied for table objects** —
--     byte-identical to what the Storage API returned. (`storage.buckets` raises a
--     DIFFERENT message naming `buckets`, so that is not the failing call.)
--
-- So Supabase's upload now performs an upsert-shaped write, and our least-privilege
-- role withholds the UPDATE half by design. This is a vendor implementation change
-- meeting a deliberate security posture — not a misconfiguration.
--
-- WHY NOT THE DOCUMENTED PATTERN. Supabase's own guide
-- (https://supabase.com/docs/guides/storage/schema/custom-roles) says to write
-- `grant anon to <custom role>` — which would inherit anon's DELETE, UPDATE and
-- TRUNCATE on every bucket. That is strictly WORSE than the posture we already have,
-- and the guide only covers read access. Rejected.
--
-- WHAT THIS GRANTS, AND WHAT IT STILL REFUSES.
--   ✅ UPDATE on storage.objects, scoped by an RLS policy whose predicate is
--      IDENTICAL to the insert policy's — so the role can only ever touch objects at
--      `firms/<uuid>/docs/<sha256>.<ext>` inside `firm-docs`, exactly the namespace it
--      could already create.
--   🚫 DELETE stays withheld. `protect_objects_delete` also guards it. The upsert
--      shape needs INSERT+UPDATE; if a future probe shows DELETE is genuinely
--      required, that is a separate decision with its own amendment.
--   🚫 No base-role inheritance. The role stays NOINHERIT with no `anon` grant.
--   🚫 No widening of `storage.buckets` — currently denied, and deliberately left
--      alone until something proves it is needed. Adding unproven grants to a
--      security boundary is how boundaries rot.
--
-- THE GRANT ALONE WOULD NOT WORK, AND THAT IS THE POINT. RLS is enabled on
-- storage.objects, so without a matching UPDATE policy the privilege check passes and
-- the statement still touches zero rows. The policy is what makes uploads work, and
-- scoping it to the insert predicate is what keeps the boundary meaningful.
--
-- USAGE (live, DSN from the environment — NEVER in argv):
--     psql -v ON_ERROR_STOP=1 -f packages/db/deploy/wave-b-storage-update-amendment.sql
--
-- Idempotent: safe to re-run. Ends with assertions that fail the whole transaction
-- rather than leaving a half-applied boundary.
-- =====================================================================

begin;

do $$ begin raise notice '=== storage amendment 1 - UPDATE for the upload path ==='; end $$;

-- ---------------------------------------------------------------------
-- 0. PRECONDITIONS. Refuse to run against a surface that is not the one this
--    amendment was reasoned about.
-- ---------------------------------------------------------------------
do $$
declare v_ins text;
begin
  if not exists (select 1 from pg_roles where rolname='clara_storage_docs') then
    raise exception 'AMENDMENT ABORTED: role clara_storage_docs does not exist — run storage-provision.sql first';
  end if;
  if to_regclass('storage.objects') is null then
    raise exception 'AMENDMENT ABORTED: storage.objects is absent';
  end if;
  if not (select relrowsecurity from pg_class where oid='storage.objects'::regclass) then
    raise exception 'AMENDMENT ABORTED: RLS is DISABLED on storage.objects — the policy below would not constrain anything, so the grant would be unbounded';
  end if;

  select pg_get_expr(pol.polwithcheck, pol.polrelid) into v_ins
    from pg_policy pol
   where pol.polrelid='storage.objects'::regclass
     and pol.polname='clara_storage_docs_insert';
  if v_ins is null then
    raise exception 'AMENDMENT ABORTED: the insert policy clara_storage_docs_insert is missing — there is no predicate to mirror';
  end if;
  raise notice 'OK 0  preconditions: role present, RLS on, insert policy found';
end $$;

-- ---------------------------------------------------------------------
-- 1. The privilege.
-- ---------------------------------------------------------------------
grant update on storage.objects to clara_storage_docs;

-- ---------------------------------------------------------------------
-- 2. The policy — predicate MIRRORED from the insert policy, not retyped.
--    Built with EXECUTE so the two can never drift: a future change to the insert
--    predicate that forgets this policy is caught by the tail assertion below,
--    and re-running this file re-syncs them.
-- ---------------------------------------------------------------------
do $$
declare v_ins text;
begin
  select pg_get_expr(pol.polwithcheck, pol.polrelid) into v_ins
    from pg_policy pol
   where pol.polrelid='storage.objects'::regclass
     and pol.polname='clara_storage_docs_insert';

  if exists (select 1 from pg_policy where polrelid='storage.objects'::regclass
              and polname='clara_storage_docs_update') then
    execute 'drop policy clara_storage_docs_update on storage.objects';
  end if;

  execute format(
    'create policy clara_storage_docs_update on storage.objects for update to clara_storage_docs using (%s) with check (%s)',
    v_ins, v_ins);
  raise notice 'OK 1  update policy created, predicate mirrored from the insert policy';
end $$;

-- ---------------------------------------------------------------------
-- 3. ASSERTIONS. Prove the boundary is what the header claims.
-- ---------------------------------------------------------------------
do $$
declare v_ins text; v_using text; v_check text; v_bad text;
begin
  -- (a) UPDATE is now permitted at the grant level.
  if not has_table_privilege('clara_storage_docs','storage.objects','UPDATE') then
    raise exception 'ASSERT a: clara_storage_docs still lacks UPDATE on storage.objects';
  end if;

  -- (b) DELETE and TRUNCATE remain refused. This is the half of the original
  --     posture the amendment must NOT quietly give away.
  select string_agg(p,',') into v_bad from unnest(array['DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
   where has_table_privilege('clara_storage_docs','storage.objects',p);
  if v_bad is not null then
    raise exception 'ASSERT b: clara_storage_docs unexpectedly holds % on storage.objects', v_bad;
  end if;

  -- (c) The update policy's predicates are IDENTICAL to the insert policy's, both
  --     sides. A drifted predicate is a widened boundary wearing the right name.
  select pg_get_expr(polwithcheck,polrelid) into v_ins from pg_policy
   where polrelid='storage.objects'::regclass and polname='clara_storage_docs_insert';
  select pg_get_expr(polqual,polrelid), pg_get_expr(polwithcheck,polrelid)
    into v_using, v_check from pg_policy
   where polrelid='storage.objects'::regclass and polname='clara_storage_docs_update';
  if v_using is distinct from v_ins then
    raise exception 'ASSERT c: update USING (%) differs from insert WITH CHECK (%)', v_using, v_ins;
  end if;
  if v_check is distinct from v_ins then
    raise exception 'ASSERT c: update WITH CHECK (%) differs from insert WITH CHECK (%)', v_check, v_ins;
  end if;

  -- (d) The role did NOT acquire a base role along the way, and stays NOINHERIT.
  --     Each base role is existence-guarded: `pg_has_role` ERRORS on an unknown role,
  --     which would abort a run on any cluster lacking them (the rig fixture caught
  --     exactly that). A base role that does not exist cannot have been granted.
  --     The guard MUST be a CASE, not `exists(...) and pg_has_role(...)`: SQL does not
  --     short-circuit WHERE, so the planner is free to evaluate pg_has_role first and
  --     raise on the unknown role anyway. CASE is the one construct whose evaluation
  --     order Postgres guarantees. (The fixture caught this on the second run too.)
  select string_agg(r,',') into v_bad
    from unnest(array['anon','authenticated','service_role']) r
   where case when exists (select 1 from pg_roles where rolname = r)
              then pg_has_role('clara_storage_docs', r, 'MEMBER')
              else false end;
  if v_bad is not null then
    raise exception 'ASSERT d: clara_storage_docs inherits base role(s) % — the documented pattern this amendment deliberately rejected', v_bad;
  end if;
  if (select rolinherit from pg_roles where rolname='clara_storage_docs') then
    raise exception 'ASSERT d: clara_storage_docs is INHERIT — storage-provision requires NOINHERIT';
  end if;

  -- (e) storage.buckets was NOT widened.
  if has_table_privilege('clara_storage_docs','storage.buckets','SELECT') then
    raise exception 'ASSERT e: storage.buckets SELECT was granted — not part of this amendment, and unproven';
  end if;

  raise notice 'OK 2  UPDATE granted and policy-scoped; DELETE/TRUNCATE still refused; no base-role inheritance; buckets untouched';
end $$;

-- ---------------------------------------------------------------------
-- 4. NON-VACUITY. The policy must actually CONSTRAIN, not merely exist: an update
--    aimed OUTSIDE the reserved namespace must match zero rows even though the
--    grant now permits the statement.
-- ---------------------------------------------------------------------
do $$
declare v_n int;
begin
  set local role clara_storage_docs;
  -- A key that cannot satisfy the predicate (wrong bucket AND wrong shape).
  update storage.objects set metadata = metadata
   where bucket_id = 'firm-docs' and name = 'not/a/canonical/key';
  get diagnostics v_n = row_count;
  reset role;
  if v_n <> 0 then
    raise exception 'ASSERT f: an out-of-namespace update touched % row(s) — the policy is not constraining', v_n;
  end if;
  raise notice 'OK 3  an out-of-namespace update is permitted by the GRANT and matches ZERO rows - the policy binds';
end $$;

do $$ begin raise notice '=== storage amendment 1 COMPLETE - 4/4 ==='; end $$;

commit;
