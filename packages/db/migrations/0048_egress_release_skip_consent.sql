-- 0048_egress_release_skip_consent.sql -- H2 ACCEPTANCE FINDING F4: the egress-hold
-- RELEASE path must not release a task whose hold is consent-based.
--
-- GOVERNING EVIDENCE: .tmp/H2-ACCEPTANCE-REPORT.txt, "FINDING F4 -- a correct wall that
-- reads as an outage: the egress hold storm" (lines 354-376), witnessed live 05:42-05:48Z
-- 2026-08-07: the release/re-hold pair cycled ~29 workflow runs/minute for six minutes,
-- DB connections went 32/60 -> 42/60, and the health-check flapped twice through the proxy.
--
-- MIGRATION NUMBER claimed at MERGE time (standing law, CLAUDE.md + RENUMBER.md). 0048 is
-- the WORKING number; the frontier probe below pins 0047_settle_guard_identity as the
-- applied predecessor.
--
-- WHAT WENT WRONG. clara.claim_document_processing_task (0015:3340) computes THREE distinct
-- hold reasons and writes ALL of them to the SAME status, 'held_egress', with no reason
-- column: 'kill_switch' (CLARA_DOC_EGRESS_APPROVED=0, lane in ('ocr','invoice_facts')),
-- 'no_consent' (invoice_facts lane, zero of the document's active filing clients hold a
-- live clara.client_egress_consents row), and 'partial_consent' (invoice_facts lane, SOME
-- but not all of them do). clara.release_held_document_tasks (0009:2242, unchanged since)
-- released every held_egress row in either lane UNCONDITIONALLY the moment the runtime saw
-- CLARA_DOC_EGRESS_APPROVED=1 (packages/runtime/lib/reconciler-documents.mjs:253-262) --
-- it had no way to tell the three reasons apart, because none of them is ever written down.
-- A released invoice_facts task without a live consent gets re-claimed and re-derives
-- 'no_consent' on the very next dispatch, landing right back at held_egress -- the release
-- and the re-hold repeating in lockstep, unboundedly, saturating the pool. The kill switch
-- has standing authority to lift ITS OWN hold; it has none over a hold the CLIENT's own
-- consent (or its absence) put there.
--
-- THE CHOSEN SHAPE: (a) release-time re-derivation, NO SCHEMA CHANGE. The two candidates
-- registered were (a) re-derive the hold class fresh at release time, straight off
-- clara.document_filings + clara.client_egress_consents (the exact join the claim fn
-- already runs), or (b) persist the hold reason on the task row at hold time and have the
-- release read it back. (a) wins on the evidence in this schema specifically, not as a
-- general default:
--   1. The reason is NOT persisted anywhere today -- clara.document_processing_tasks
--      carries no hold_reason column, claim_document_processing_task's UPDATE never
--      writes error_code for a hold (that column is reserved for TERMINAL 'failed' rows:
--      'attempt_cap','budget'), and the runtime side drops the reason on the floor too
--      (invoiceFacts.v1.behavior.mjs's interpretClaimReceipt returns {claimed:false,
--      status:'held_egress',doc:null} for a hold -- the CLR28 payload never reaches a
--      column). Shape (b) is therefore not "read a reason that's already there" -- it is
--      "add a column, backfill it, and keep it honest across every future hold-writing
--      path", which is real net-new surface for a bug whose actual defect is a missing
--      RE-CHECK, not a missing RECORD.
--   2. A persisted reason would be STALE the instant it mattered most: the whole point of
--      calling release is "something changed, go see if any hold should lift now" --
--      typically a fresh grant_client_egress. A reason column captures what was true AT
--      HOLD TIME; re-deriving captures what is true NOW, which is the only question the
--      release path actually needs answered. Shape (a) is self-healing the moment consent
--      is granted -- no second write path has to remember to clear the column.
--   3. The predicate to re-derive already exists, verbatim, in claim_document_processing_task
--      (0015:3361-3372) -- copying it here is drift risk (two copies of one rule), the same
--      risk 0009/0011/0013/0015 already accepted by inlining it at claim time each time the
--      consent shape changed, rather than centralizing it then. This migration follows that
--      established precedent instead of introducing a new one.
-- The OCR lane needs no re-derivation at all: claim_document_processing_task runs NO
-- per-client consent check for lane='ocr' (only the kill-switch arm applies), so every OCR
-- held_egress row is safe to release unconditionally once the switch is on -- exactly the
-- prior behaviour, preserved as a fast path.
--
-- THE GUARD'S TRUTH TABLE (lane x hold cause -> release_held_document_tasks's verdict,
-- called ONLY while the runtime believes CLARA_DOC_EGRESS_APPROVED=1 -- reconciler-
-- documents.mjs never calls it otherwise):
--   lane           | cause blocking it            | RELEASED? | why
--   ---------------|-------------------------------|-----------|------------------------------
--   ocr            | kill_switch (the only cause)  | YES       | lane='ocr' fast path; no
--                  |                               |           | consent check ever applies
--   invoice_facts  | kill_switch, fully consented  | YES       | re-derived: v_clients>0 and
--                  | (every active filing client   |           | every filing client has a
--                  | holds a live consent)         |           | live, unrevoked consent
--   invoice_facts  | no_consent (zero filing       | NO        | re-derived: no filing has a
--                  | clients hold a live consent,  |           | live consent OR no active
--                  | or no active filing at all)   |           | filing exists at all
--   invoice_facts  | partial_consent (SOME but not | NO        | re-derived: at least one
--                  | all filing clients consented) |           | active filing's client
--                  |                               |           | still lacks a live consent
-- A held task the guard declines to release is left EXACTLY as it was (status untouched,
-- still held_egress) -- the fn never raises, it just narrows which rows `picked` selects.

-- Prestate: 0047 must already be the applied predecessor. Runs BEFORE the role switch,
-- as the connecting (migration-runner) role, on the same table migrate.mjs itself owns and
-- reads (packages/db/scripts/migrate.mjs:93-101) -- never under clara_fn_owner, which is
-- not guaranteed a grant on clara.schema_migrations.
do $pre48$
begin
  if not exists (select 1 from clara.schema_migrations where version = '0047_settle_guard_identity') then
    raise exception '0048 prestate: 0047_settle_guard_identity is not applied -- frontier mismatch' using errcode='CLR10';
  end if;
end $pre48$;

set role clara_fn_owner;

create or replace function clara.release_held_document_tasks(p_limit int default 1000)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_n int; v_ids uuid[];
begin
  -- F4 fix: re-derive the SAME hold predicate claim_document_processing_task uses
  -- (0015:3361-3372), fresh, right here -- never trust the 'held_egress' status alone to
  -- mean "kill-switch-blocked". A row this predicate declines stays held_egress untouched.
  with picked as (
    select t.id from clara.document_processing_tasks t
    where t.status='held_egress' and t.lane in ('ocr','invoice_facts')
      and (
        t.lane='ocr'
        or (
          exists (
            select 1 from clara.document_filings f
            where f.document_id=t.document_id and f.retired_at is null
          )
          and not exists (
            select 1 from clara.document_filings f
            where f.document_id=t.document_id and f.retired_at is null
              and not exists (
                select 1 from clara.client_egress_consents c
                where c.client_id=f.client_id and c.revoked_at is null
              )
          )
        )
      )
    order by t.created_at,t.id for update skip locked
    limit greatest(1,least(p_limit,10000))
  ), moved as (
    update clara.document_processing_tasks t set status='queued'
    from picked p where t.id=p.id returning t.id
  )
  select count(*)::int,array_agg(id) into v_n,v_ids from moved;
  if v_ids is not null then
    update clara.documents d set extraction_status='pending'
      where d.id in (select t.document_id from clara.document_processing_tasks t
        where t.id=any(v_ids) and t.lane='ocr');
  end if;
  return jsonb_build_object('released',coalesce(v_n,0));
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Migration-tail assertion, against the DB's own catalog (0033's idiom): the deployed
-- source now re-derives the consent hold, keeps the OCR fast path, and the ACLs that make
-- this a runtime-only verb are exactly as CREATE OR REPLACE promises to leave them.
-- ---------------------------------------------------------------------------
do $tail48$
declare v_src text;
begin
  select pg_get_functiondef('clara.release_held_document_tasks(int)'::regprocedure) into v_src;
  if v_src is null then
    raise exception '0048 tail: clara.release_held_document_tasks(int) not found' using errcode='CLR10';
  end if;
  if position('client_egress_consents' in v_src) = 0 then
    raise exception '0048 tail: the release fn no longer re-derives the consent hold -- F4 regression' using errcode='CLR10';
  end if;
  if position('document_filings' in v_src) = 0 then
    raise exception '0048 tail: the release fn no longer reads document_filings -- F4 regression' using errcode='CLR10';
  end if;
  if position('t.lane=''ocr''' in v_src) = 0 then
    raise exception '0048 tail: the OCR-lane fast path (kill-switch-only, no consent check) is missing' using errcode='CLR10';
  end if;
  if not has_function_privilege('clara_runtime', 'clara.release_held_document_tasks(int)'::regprocedure, 'execute') then
    raise exception '0048 tail: clara_runtime lost EXECUTE on release_held_document_tasks -- CREATE OR REPLACE must preserve the runtime grant' using errcode='CLR10';
  end if;
  if has_function_privilege('clara_authenticated', 'clara.release_held_document_tasks(int)'::regprocedure, 'execute')
     or has_function_privilege('clara_agent_ro', 'clara.release_held_document_tasks(int)'::regprocedure, 'execute') then
    raise exception '0048 tail: release_held_document_tasks is reachable from a non-runtime role -- release is a runtime-lane verb only' using errcode='CLR10';
  end if;
  if exists(select 1 from pg_proc p, aclexplode(p.proacl) a
            where p.oid='clara.release_held_document_tasks(int)'::regprocedure
              and a.grantee=0 and a.privilege_type='EXECUTE') then
    raise exception '0048 tail: PUBLIC holds EXECUTE on release_held_document_tasks' using errcode='CLR10';
  end if;
  raise notice '0048 tail: release_held_document_tasks re-derives the consent hold at release time (OCR fast-paths on kill-switch only); ACLs preserved, runtime-only';
end $tail48$;
