-- wave-b-0017-ceremony.sql — WB-R18 ceremony SQL artifacts (owner-!-gated; NOT a
-- migration — applied manually in the ceremony window per the runbook
-- docs/ops/wave-b-ceremony-runbook.md, AFTER the atomic 0017 apply).
--
-- Part A — serializable RPC pinning (settled dashboard plan F10). PostgREST honors a
-- function's proconfig default_transaction_isolation when opening the RPC transaction
-- (postgrest docs references/transactions.md); both approval fns ASSERT serializable
-- in-body, so without this pin every dashboard approval refuses not_serializable.
-- The paired live probe (runbook): call approve_opening_seed with a CURRENT plan
-- revision but ONE STALE ENTRY token — expect the typed revision_mismatch refusal
-- (proves the level took and the fn ran past the isolation assert); a
-- not_serializable refusal ABORTS the ceremony step.

alter function clara.approve_opening_seed(uuid, uuid, text, jsonb, text, text)
  set default_transaction_isolation = 'serializable';
alter function clara.approve_opening_correction(uuid, jsonb, text, text)
  set default_transaction_isolation = 'serializable';

do $$
declare v int := 0;
begin
  select count(*) into v from pg_proc
   where oid in ('clara.approve_opening_seed(uuid,uuid,text,jsonb,text,text)'::regprocedure,
                 'clara.approve_opening_correction(uuid,jsonb,text,text)'::regprocedure)
     and proconfig::text like '%default_transaction_isolation=serializable%';
  if v <> 2 then
    raise exception 'ceremony: serializable proconfig missing (found % of 2)', v;
  end if;
end $$;

-- Part B — the Storage wiki RLS policy pair (design W5(3); RUN IN THE SUPABASE SQL
-- EDITOR — storage schema; the local rig has no storage schema, so this block is
-- fenced off by default). Without it every wiki put 403s in production while the rig
-- stays green. INSERT + SELECT only, the clara_storage_docs role, the wiki key family
-- ONLY: firms/{uuid}/wiki/{uuid}/{64-hex}.md — the docs policy pair stays untouched.
--
--   create policy "clara wiki insert" on storage.objects for insert
--     to clara_storage_docs
--     with check (
--       bucket_id = 'firm-docs'
--       and name ~ '^firms/[0-9a-f-]{36}/wiki/[0-9a-f-]{36}/[0-9a-f]{64}[.]md$'
--     );
--   create policy "clara wiki select" on storage.objects for select
--     to clara_storage_docs
--     using (
--       bucket_id = 'firm-docs'
--       and name ~ '^firms/[0-9a-f-]{36}/wiki/[0-9a-f-]{36}/[0-9a-f]{64}[.]md$'
--     );
--
-- Probe after applying: one wiki put → re-download → sha match (runbook step 6b).

-- Part C — the wiki_projection checkpoint seed-at-head (W4 cold start; idempotent;
-- the v25 consumer stays DORMANT until this exists — wikiColdStartReady gate).

insert into clara.relay_checkpoints (consumer, firm_id, last_seq)
  select 'wiki_projection', firm_id, n from clara.firm_event_seq
on conflict do nothing;
