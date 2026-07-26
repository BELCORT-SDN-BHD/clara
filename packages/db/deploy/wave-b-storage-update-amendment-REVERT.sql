-- =====================================================================
-- REVERT of `wave-b-storage-update-amendment.sql` (2026-07-26)
--
-- WHY. The amendment granted UPDATE on storage.objects to clara_storage_docs on the
-- strength of a WRONG diagnosis. The reasoning was: "the upload path performs an
-- UPDATE, because a PUT with the role JWT returns permission-denied while the INSERT
-- succeeds." Both observations were true; the inference was not.
--
-- `putCanonical` (packages/runtime/lib/storage.mjs:81) uses **method: "POST"** — the
-- CREATE verb, which needs INSERT only. The function's NAME says put; the request says
-- POST. The probe that produced the 403 used PUT, which in Supabase Storage is the
-- UPDATE/replace endpoint — so it measured a verb the runtime never calls, and the
-- 403 was the correct, expected refusal of a privilege we deliberately withhold.
--
-- Proof the grant was unnecessary: after the amendment, intake STILL failed with
-- storage_error, and a POST with the same role JWT to a fresh canonical key returned
-- **200** — i.e. the create path was healthy all along.
--
-- THE ACTUAL ROOT CAUSE was never in the database: `NEXT_PUBLIC_CLARA_RUNTIME_URL` is
-- unset in the Cloudflare Pages build, so `runtimeBase()` returns "" and BOTH the byte
-- PUT and finalize go same-origin into a Pages Function instead of direct to Fly. The
-- runtime's spool contained NO `intake-*` files, so no bytes ever arrived; the 502's
-- body was a Cloudflare error page, not a Fly one. `intake.ts` states the requirement
-- in its own header: a deployment MUST set the runtime URL.
--
-- So this restores the ratified posture from `storage-provision.sql`: object
-- **INSERT + SELECT only**, no UPDATE, no DELETE. Least privilege is not something to
-- give away on a plausible-but-unverified inference.
--
-- USAGE:  psql -v ON_ERROR_STOP=1 -f packages/db/deploy/wave-b-storage-update-amendment-REVERT.sql
-- =====================================================================

begin;

do $$ begin raise notice '=== REVERT storage amendment 1 - restoring INSERT+SELECT only ==='; end $$;

drop policy if exists clara_storage_docs_update on storage.objects;
revoke update on storage.objects from clara_storage_docs;

do $$
declare v_bad text;
begin
  -- The posture storage-provision.sql ratifies: INSERT + SELECT, nothing else.
  select string_agg(p, ',') into v_bad
    from unnest(array['UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
   where has_table_privilege('clara_storage_docs','storage.objects',p);
  if v_bad is not null then
    raise exception 'REVERT FAILED: clara_storage_docs still holds % on storage.objects', v_bad;
  end if;

  if not has_table_privilege('clara_storage_docs','storage.objects','INSERT')
     or not has_table_privilege('clara_storage_docs','storage.objects','SELECT') then
    raise exception 'REVERT OVERSHOT: INSERT and/or SELECT were removed — the upload path needs both';
  end if;

  if exists (select 1 from pg_policy where polrelid='storage.objects'::regclass
              and polname='clara_storage_docs_update') then
    raise exception 'REVERT FAILED: the update policy still exists';
  end if;

  -- The insert and select policies must survive untouched.
  if not exists (select 1 from pg_policy where polrelid='storage.objects'::regclass
                  and polname='clara_storage_docs_insert')
     or not exists (select 1 from pg_policy where polrelid='storage.objects'::regclass
                     and polname='clara_storage_docs_select') then
    raise exception 'REVERT OVERSHOT: an original policy was removed';
  end if;

  raise notice 'OK  INSERT+SELECT intact; UPDATE/DELETE/TRUNCATE refused; update policy gone';
end $$;

do $$ begin raise notice '=== REVERT COMPLETE - ratified posture restored ==='; end $$;

commit;
