-- =====================================================================================
-- 0049 direction-zero-evidence — CEREMONY POSTVERIFY (READ-ONLY, run AFTER the apply)
--
-- WHY THIS FILE EXISTS. 0049's tail measures the whole estate before and after the recut. It
-- HARD-REFUSES anything that crosses the sales boundary, anything that widens off
-- 'unresolved', any queue movement for an unread filing, and — since the 2026-08-08 revision —
-- any READ filing that moves off a defaulted direction unless the operator declared the exact
-- count in advance. The one thing a tail assertion cannot do is be READ afterwards: the
-- migration's own NOTICEs are discarded by the production runner (a bare pg.Client with no
-- 'notice' listener; that runner now prints them, but a ceremony must not depend on stdout it
-- did not capture). So the census is PERSISTED, and this file is how the ceremony reads it.
--
-- HOW TO RUN IT (read-only; safe against live):
--     python ~/.clara-tools/live_psql_file.py packages/db/deploy/direction-zero-evidence-0049-postverify.sql
--
-- WHAT A PASS LOOKS LIKE: four result sets and NO exception. Section (4) raises if the receipt
-- says a read filing moved — on live that number is ZERO, and a non-zero one is a STOP that
-- must be reconciled filing-by-filing before the ceremony closes, not a number to eyeball.
-- =====================================================================================

\echo '=== (1) THE RECEIPT — the durable census 0049 wrote inside its own transaction ==='
select r.id,
       r.measured_at,
       r.receipt->>'database'                       as database,
       r.receipt->>'applied_by'                     as applied_by,
       (r.receipt->>'filings_measured')::int        as filings_measured,
       (r.receipt->>'read_filings_moved')::int      as read_filings_moved,
       r.receipt->>'read_movement_declared'         as read_movement_declared,
       (r.receipt->>'unread_filings_now_unresolved')::int as unread_now_unresolved,
       r.receipt->'tri_before'                      as tri_before
  from clara.migration_receipts r
 where r.version = '0049_direction_zero_evidence'
 order by r.id desc
 limit 1;

\echo '=== (2) THE NAMED MOVEMENTS — every read filing that moved, in full (live expects none) ==='
select m->>'filing' as filing, m->>'client' as client, m->>'document' as document,
       m->>'from' as moved_from, m->>'to' as moved_to
  from clara.migration_receipts r
 cross join lateral jsonb_array_elements(r.receipt->'moved_filings') m
 where r.version = '0049_direction_zero_evidence'
   and r.id = (select max(id) from clara.migration_receipts
                where version = '0049_direction_zero_evidence');

\echo '=== (3) THE LIVE ANSWER NOW — the tri-state census over every non-retired filing ==='
select coalesce(clara._autodraft_direction_tri(df.document_id, df.client_id), '<null>') as tri,
       count(*) as filings,
       count(*) filter (where clara._document_facts_extraction(df.document_id) is null) as of_which_unread
  from clara.document_filings df
 where df.retired_at is null
 group by 1
 order by 1;

\echo '=== (4) THE GATE — a read movement on live is a STOP, not a number to eyeball ==='
do $$
declare v_rec jsonb; v_moved int; v_declared text;
begin
  select receipt into v_rec from clara.migration_receipts
   where version = '0049_direction_zero_evidence' order by id desc limit 1;
  -- ABSENCE IS THE FIRST FAILURE, NOT THE FALLBACK. No receipt means the apply did not run,
  -- ran on another database, or ran a build without the durable channel — every one of which
  -- is a ceremony stop, and none of which may read as "clean".
  if v_rec is null then
    raise exception '0049 postverify: NO receipt row exists for 0049_direction_zero_evidence on % — the migration has not been applied to THIS database, or was applied from a build predating the durable receipt. Do not close the ceremony.', current_database();
  end if;
  v_moved := (v_rec->>'read_filings_moved')::int;
  v_declared := v_rec->>'read_movement_declared';
  if v_moved <> 0 then
    raise exception '0049 postverify: % READ filing(s) moved off a defaulted direction (declared: %). On live this must be ZERO. Reconcile each filing in result set (2) against the estate before closing the ceremony.',
      v_moved, v_declared;
  end if;
  raise notice '0049 postverify OK — % filings measured, 0 read filings moved, % unread filings now answer unresolved with byte-identical queue rows.',
    v_rec->>'filings_measured', v_rec->>'unread_filings_now_unresolved';
end $$;
