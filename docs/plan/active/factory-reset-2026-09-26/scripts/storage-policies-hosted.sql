-- the six storage.objects policies as read off hosted on 2026-09-26 before the reset; re-created after the chain

-- (storage-provision.sql re-creates the two clara_storage_docs_* ones itself; all six are idempotent here)

drop policy if exists "clara wiki insert" on storage.objects;
create policy "clara wiki insert" on storage.objects as permissive for insert to "clara_storage_docs"
  with check (((bucket_id = 'firm-docs'::text) AND (name ~ '^firms/[0-9a-f-]{36}/wiki/[0-9a-f-]{36}/[0-9a-f]{64}[.]md$'::text)));

drop policy if exists "clara wiki select" on storage.objects;
create policy "clara wiki select" on storage.objects as permissive for select to "clara_storage_docs"
  using (((bucket_id = 'firm-docs'::text) AND (name ~ '^firms/[0-9a-f-]{36}/wiki/[0-9a-f-]{36}/[0-9a-f]{64}[.]md$'::text)));

drop policy if exists "clara_storage_docs_insert" on storage.objects;
create policy "clara_storage_docs_insert" on storage.objects as permissive for insert to "clara_storage_docs"
  with check (((bucket_id = 'firm-docs'::text) AND (name ~ '^firms/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/docs/[0-9a-f]{64}\.[a-z0-9]{1,12}$'::text)));

drop policy if exists "clara_storage_docs_select" on storage.objects;
create policy "clara_storage_docs_select" on storage.objects as permissive for select to "clara_storage_docs"
  using (((bucket_id = 'firm-docs'::text) AND (name ~ '^firms/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/docs/[0-9a-f]{64}\.[a-z0-9]{1,12}$'::text)));

drop policy if exists "clara_storage_reports_insert" on storage.objects;
create policy "clara_storage_reports_insert" on storage.objects as permissive for insert to "clara_storage_docs"
  with check (((bucket_id = 'firm-docs'::text) AND (name ~ '^firms/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/reports/[0-9a-f]{64}\.(pdf|json)$'::text)));

drop policy if exists "clara_storage_reports_select" on storage.objects;
create policy "clara_storage_reports_select" on storage.objects as permissive for select to "clara_storage_docs"
  using (((bucket_id = 'firm-docs'::text) AND (name ~ '^firms/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/reports/[0-9a-f]{64}\.(pdf|json)$'::text)));
