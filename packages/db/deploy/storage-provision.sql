-- Slice 5 Supabase Storage ceremony artifact (DO NOT run in the local DB rig).
-- Run this in the Supabase SQL editor as the project owner after the private
-- `firm-docs` bucket exists. The runtime URL must end in /object/firm-docs and
-- its short-lived signed JWT must carry role=clara_storage_docs plus a future
-- exp. Rotate by issuing the replacement JWT first, updating the runtime secret,
-- verifying INSERT+SELECT, then revoking the old signing credential out of band.
-- The local Postgres rig has no storage schema, so this posture is ceremony-tested.

-- Role normalization is SPLIT by privilege (the 0002 §1 / HIGH-8 law, mirrored from
-- deploy/roles-bootstrap.sql). PostgreSQL requires SUPERUSER to set SUPERUSER /
-- BYPASSRLS / CREATEDB **even when setting them to false**, and REPLICATION can only
-- be changed by a role that itself has REPLICATION. Supabase's `postgres` is NOT a
-- superuser, so the previous unguarded `else alter role … nosuperuser …` made this
-- script FAIL 42501 on every re-run once the role existed — including during DR
-- recovery, where deploy/roles-bootstrap.sql legitimately creates the role first.
-- A freshly CREATEd role already defaults to all of these, so the guarantee holds on
-- a first apply regardless; the explicit normalizers are defense-in-depth.
do $$
declare
  v_super boolean := current_setting('is_superuser') = 'on';
  v_can_repl boolean := (select rolsuper or rolreplication from pg_roles where rolname = current_user);
begin
  if not exists (select 1 from pg_roles where rolname='clara_storage_docs') then
    -- defaults: NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION
    create role clara_storage_docs nologin noinherit;
  end if;
  -- Settable by a plain CREATEROLE deploy role.
  alter role clara_storage_docs nologin nocreaterole noinherit;
  if v_can_repl then
    alter role clara_storage_docs noreplication;
  end if;
  if v_super then
    alter role clara_storage_docs nosuperuser nocreatedb nobypassrls;
  end if;
end $$;

-- Fail closed if the role ended up with any escalation bit (whatever the deploy
-- role's own privileges were): the write-once custody posture depends on it.
do $$
declare bad text := '';
begin
  select string_agg(x, ', ') into bad from (
    select 'SUPERUSER' x from pg_roles where rolname='clara_storage_docs' and rolsuper
    union all select 'BYPASSRLS' from pg_roles where rolname='clara_storage_docs' and rolbypassrls
    union all select 'CREATEDB' from pg_roles where rolname='clara_storage_docs' and rolcreatedb
    union all select 'CREATEROLE' from pg_roles where rolname='clara_storage_docs' and rolcreaterole
    union all select 'REPLICATION' from pg_roles where rolname='clara_storage_docs' and rolreplication
    union all select 'LOGIN' from pg_roles where rolname='clara_storage_docs' and rolcanlogin
    union all select 'INHERIT' from pg_roles where rolname='clara_storage_docs' and rolinherit
  ) s;
  if bad is not null and bad <> '' then
    raise exception 'storage-provision ABORTED: clara_storage_docs carries unexpected attribute(s): %. It must be NOLOGIN NOINHERIT with no escalation bits.', bad;
  end if;
  raise notice 'clara_storage_docs attributes OK (nologin, noinherit, no escalation bits)';
end $$;

-- Storage's API executes as `authenticator` and SET ROLEs to the JWT's role
-- claim; without this membership that SET ROLE fails outright (ceremony-proven
-- 2026-07-19; `supabase_storage_admin` is reserved and un-grantable).
grant clara_storage_docs to authenticator;

grant usage on schema storage to clara_storage_docs;
revoke all on table storage.objects from clara_storage_docs;
grant select, insert on table storage.objects to clara_storage_docs;

drop policy if exists clara_storage_docs_insert on storage.objects;
create policy clara_storage_docs_insert on storage.objects
  for insert to clara_storage_docs
  with check (
    bucket_id='firm-docs'
    and name ~ '^firms/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/docs/[0-9a-f]{64}\.[a-z0-9]{1,12}$'
  );

drop policy if exists clara_storage_docs_select on storage.objects;
create policy clara_storage_docs_select on storage.objects
  for select to clara_storage_docs
  using (
    bucket_id='firm-docs'
    and name ~ '^firms/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/docs/[0-9a-f]{64}\.[a-z0-9]{1,12}$'
  );

-- Intentionally absent: UPDATE and DELETE grants/policies. Routine custody is
-- content-addressed, write-once, read-back verified, and delete-never.
