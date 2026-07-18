-- Slice 5 Supabase Storage ceremony artifact (DO NOT run in the local DB rig).
-- Run this in the Supabase SQL editor as the project owner after the private
-- `firm-docs` bucket exists. The runtime URL must end in /object/firm-docs and
-- its short-lived signed JWT must carry role=clara_storage_docs plus a future
-- exp. Rotate by issuing the replacement JWT first, updating the runtime secret,
-- verifying INSERT+SELECT, then revoking the old signing credential out of band.
-- The local Postgres rig has no storage schema, so this posture is ceremony-tested.

do $$
begin
  if not exists (select 1 from pg_roles where rolname='clara_storage_docs') then
    create role clara_storage_docs nologin nosuperuser nocreatedb nocreaterole
      noinherit noreplication nobypassrls;
  else
    alter role clara_storage_docs nologin nosuperuser nocreatedb nocreaterole
      noinherit noreplication nobypassrls;
  end if;
end $$;

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
