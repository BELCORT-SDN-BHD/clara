-- 0050_egress_release_skip_consent.sql -- H2 ACCEPTANCE FINDING F4: the egress-hold
-- RELEASE path must not release a task whose hold is consent-based.
--
-- GOVERNING EVIDENCE: .tmp/H2-ACCEPTANCE-REPORT.txt, "FINDING F4 -- a correct wall that
-- reads as an outage: the egress hold storm" (lines 354-376), witnessed live 05:42-05:48Z
-- 2026-08-07: the release/re-hold pair cycled ~29 workflow runs/minute for six minutes,
-- DB connections went 32/60 -> 42/60, and the health-check flapped twice through the proxy.
--
-- MIGRATION NUMBER claimed at MERGE time (standing law, CLAUDE.md + RENUMBER.md). The
-- ruled merge order for the three open F-lane PRs is #209 = 0048_autodraft_sweep_cap_own_run,
-- #211 = 0049_direction_zero_evidence, and THIS PR merges LAST as 0050. The frontier probe
-- below pins 0047_settle_guard_identity as the last migration whose NAME this file can
-- assert (0048/0049 land in the same merge train and migrate.mjs applies them, in version
-- order, before this file -- naming them here would couple this migration to two filenames
-- neither this branch nor this DB can see).
--
-- =====================================================================================
-- PROVENANCE OF THE BODY BEING RECUT -- read this before touching the lane list.
-- =====================================================================================
-- The LIVE body of clara.release_held_document_tasks(int) is
--   packages/db/migrations/0038_wave_c_b_bank.sql:7143   (section E4)
-- NOT 0009_coding_floor.sql:2242. 0009's body is the pre-0038 one and carries only
-- `lane in ('ocr','invoice_facts')`; 0038 E4 WIDENED it to the triple
-- `lane in ('ocr','invoice_facts','statement_facts')` and left, in its own postcheck
-- (0038:7187-7190), the reason in one line: "a held statement task would stall forever".
-- The first cut of this migration recut 0009's body by mistake and silently dropped
-- statement_facts -- a REVERT of 0038, caught in review by execution against the live
-- catalog. This file recuts 0038:7143 verbatim and changes ONE thing: which held rows the
-- picked-CTE selects. The prestate below REFUSES to apply over any other body.
--
-- WHAT WENT WRONG (the F4 defect itself). clara.claim_document_processing_task
-- (live body 0038:6839) computes THREE distinct hold reasons and writes ALL of them to the
-- SAME status, 'held_egress', with no reason column:
--   'kill_switch'      -- p_egress_approved false, lane in ('ocr','invoice_facts',
--                         'statement_facts'). The kill switch gates the whole EGRESSING
--                         triple and nothing else.
--   'no_consent'       -- lane='invoice_facts' ONLY: zero of the document's active filing
--                         clients hold a live clara.client_egress_consents row.
--   'partial_consent'  -- lane='invoice_facts' ONLY: SOME but not all of them do.
-- clara.release_held_document_tasks released every held_egress row in the triple
-- UNCONDITIONALLY the moment the runtime saw CLARA_DOC_EGRESS_APPROVED=1
-- (packages/runtime/lib/reconciler-documents.mjs) -- it had no way to tell the three
-- reasons apart, because none of them is ever written down. A released invoice_facts task
-- without a live consent gets re-claimed and re-derives 'no_consent' on the very next
-- dispatch, landing right back at held_egress -- the release and the re-hold repeating in
-- lockstep, unboundedly, saturating the pool. The kill switch has standing authority to
-- lift ITS OWN hold; it has none over a hold the CLIENT's own consent (or its absence)
-- put there.
--
-- THE LANE SPLIT THIS RECUT MIRRORS (0038:6866-6883, quoted structurally, not by hand):
--   if t.lane in ('ocr','invoice_facts','statement_facts') and not <switch> -> kill_switch
--   elsif t.lane='invoice_facts' -> the LEGACY purpose-blind consent gate
-- So the consent re-derivation belongs to invoice_facts AND NOWHERE ELSE. 0038's own
-- header is explicit that widening the legacy branch to statement_facts "would make the
-- LEGACY, purpose-blind consent table authorize a statement-specific vendor read -- the
-- precise conflation 0020 section 1 built a separate relation to avoid": the statement
-- lane's authorization is the TYPED (consent, activation) pair, checked at ENQUEUE
-- (clara._enqueue_invoice_facts_core), never here. A held statement_facts task therefore
-- has exactly ONE possible hold cause -- the kill switch -- and the release sweep, which
-- the runtime calls only when it believes the switch is back on, must release it.
-- Same for 'ocr': the claim body runs no per-client consent check for that lane at all.
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
--      (0038:6870-6878) -- copying it here is drift risk (two copies of one rule), the same
--      risk 0009/0011/0013/0015/0038 already accepted by inlining it at claim time each time
--      the consent shape changed, rather than centralizing it then. This migration follows
--      that established precedent instead of introducing a new one, and adds the tail
--      cross-check (below) that pins the two lane lists in step -- 0038's own E8 idiom.
--
-- THE GUARD'S TRUTH TABLE (lane x hold cause -> release_held_document_tasks's verdict,
-- called ONLY while the runtime believes CLARA_DOC_EGRESS_APPROVED=1 -- reconciler-
-- documents.mjs never calls it otherwise):
--   lane            | cause blocking it            | RELEASED? | why
--   ----------------|------------------------------|-----------|-----------------------------
--   ocr             | kill_switch (the only cause) | YES       | kill-switch-only lane; no
--                   |                              |           | consent check ever applies
--   statement_facts | kill_switch (the only cause  | YES       | kill-switch-only lane; its
--                   | REACHABLE at claim time)     |           | typed (consent,activation)
--                   |                              |           | gate is at ENQUEUE, and the
--                   |                              |           | LEGACY table must never
--                   |                              |           | authorize a statement read
--                   |                              |           | (0038 E3 / 0020 section 1)
--   invoice_facts   | kill_switch, fully consented | YES       | re-derived: v_clients>0 and
--                   | (every active filing client  |           | every filing client has a
--                   | holds a live consent)        |           | live, unrevoked consent
--   invoice_facts   | no_consent (zero filing      | NO        | re-derived: no filing has a
--                   | clients hold a live consent, |           | live consent OR no active
--                   | or no active filing at all)  |           | filing exists at all
--   invoice_facts   | partial_consent (SOME but    | NO        | re-derived: at least one
--                   | not all filing clients       |           | active filing's client
--                   | consented)                   |           | still lacks a live consent
-- A held task the guard declines to release is left EXACTLY as it was (status untouched,
-- still held_egress) -- the fn never raises, it just narrows which rows `picked` selects.
--
-- THE RUNTIME HALF ships in the SAME PR (packages/runtime/lib/reconciler-documents.mjs).
-- This function is only half the release: the reconciler used to rewrite every held_egress
-- task in its own working copy to 'queued' off the env flag alone and dispatch it, no
-- matter what this function had just decided. Fixing only the DB half would have left the
-- storm running at exactly the same rate with a differently-worded row. The reconciler now
-- treats the post-release DB row as authoritative and never dispatches a task that still
-- reads held_egress.
--
-- OPERATIONAL CONSEQUENCE, deliberate: consent-held tasks now accumulate in
-- clara.document_processing_tasks until the consent ceremony happens, so
-- packages/runtime/lib/health.mjs:273 will carry a standing "N document task(s) held for
-- egress approval" WARNING (a warning string only -- it does not feed the /ready gate).
-- That is the fail-closed behaviour working: the alternative is the storm. Surfacing WHICH
-- client needs a ceremony is a read-only view over the same join, registered as follow-up,
-- deliberately not in this fix.

-- Prestate. Runs BEFORE the role switch, as the connecting (migration-runner) role, on the
-- same table migrate.mjs itself owns and reads (packages/db/scripts/migrate.mjs:93-101) --
-- never under clara_fn_owner, which is not guaranteed a grant on clara.schema_migrations.
--
-- PROBE THE BODY BEING REPLACED, not just the frontier (0038's E4-prestate idiom,
-- 0038:7040-7043): a blind CREATE OR REPLACE is how the first cut of this migration
-- silently reverted 0038. Refuse to apply over anything but the body this file was written
-- against.
do $pre50$
declare v_src text;
begin
  if not exists (select 1 from clara.schema_migrations where version = '0047_settle_guard_identity') then
    raise exception '0050 prestate: 0047_settle_guard_identity is not applied -- frontier mismatch' using errcode='CLR10';
  end if;

  select p.prosrc into v_src from pg_proc p
   where p.oid='clara.release_held_document_tasks(int)'::regprocedure;
  if v_src is null then
    raise exception '0050 prestate: clara.release_held_document_tasks(int) is GONE' using errcode='CLR10';
  end if;
  if position('lane in (''ocr'',''invoice_facts'',''statement_facts'')' in v_src)=0 then
    raise exception '0050 prestate: the body being replaced is NOT 0038:7143 -- its kill-switch lane list is not (ocr, invoice_facts, statement_facts). Refusing to recut a body this migration cannot account for: a blind replace here is exactly how the statement lane got silently reverted once already'
      using errcode='CLR10';
  end if;
  if position('client_egress_consents' in v_src)<>0 then
    raise exception '0050 prestate: the release body ALREADY re-derives the consent hold -- 0050 (or an equivalent recut) has already been applied to this database'
      using errcode='CLR10';
  end if;

  -- The CLAIM body must still carry the split this recut mirrors: the kill switch over the
  -- whole egressing triple, the LEGACY consent gate over invoice_facts ALONE. If either has
  -- moved, the release predicate below is no longer the claim's mirror and this file must be
  -- rewritten, not applied.
  select p.prosrc into v_src from pg_proc p
   where p.oid='clara.claim_document_processing_task(uuid,text,boolean)'::regprocedure;
  if v_src is null then
    raise exception '0050 prestate: clara.claim_document_processing_task is GONE' using errcode='CLR10';
  end if;
  if position('t.lane in (''ocr'',''invoice_facts'',''statement_facts'')' in v_src)=0 then
    raise exception '0050 prestate: the claim body''s kill-switch lane list is not (ocr, invoice_facts, statement_facts) -- the release list this file installs would not track it'
      using errcode='CLR10';
  end if;
  if position('elsif t.lane=''invoice_facts'' then' in v_src)=0 then
    raise exception '0050 prestate: the claim body''s LEGACY consent branch is no longer invoice_facts-only -- the lane split this recut mirrors has moved'
      using errcode='CLR10';
  end if;
  if position('client_egress_purpose' in v_src)<>0 then
    raise exception '0050 prestate: the claim body gained a TYPED-consent edge -- the ratified 0020 section 6 battery forbids it, and this recut assumes the typed gate lives at enqueue'
      using errcode='CLR10';
  end if;
end $pre50$;

set role clara_fn_owner;

-- 0038:7143 verbatim except for the picked-CTE's WHERE. The lane triple, the ordering, the
-- SKIP LOCKED, the clamp, the ocr-only extraction_status reset and the receipt shape are all
-- unchanged.
create or replace function clara.release_held_document_tasks(p_limit int default 1000)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_n int; v_ids uuid[];
begin
  -- The kill-switch RELEASE sweep. A lane that can be HELD and cannot be RELEASED is a
  -- permanent stall, so this lane list must track claim_document_processing_task's
  -- kill-switch list EXACTLY (0038 E4/E8; the migration tail re-asserts it).
  --
  -- F4 fix: 'held_egress' alone does NOT mean "kill-switch-blocked" -- the claim body
  -- writes three different hold reasons to that one status and records none of them. For
  -- the ONE lane that can be held for a reason the kill switch has no authority over
  -- (invoice_facts, the LEGACY purpose-blind consent gate) re-derive that gate FRESH, right
  -- here, off the same join the claim body runs (0038:6870-6878). A row this predicate
  -- declines stays held_egress, untouched.
  with picked as (
    select t.id from clara.document_processing_tasks t
    where t.status='held_egress' and t.lane in ('ocr','invoice_facts','statement_facts')
      and (
        -- KILL-SWITCH-ONLY lanes. claim_document_processing_task runs no per-client LEGACY
        -- consent check for either: 'ocr' is pre-attribution, and 'statement_facts' is
        -- authorized by the TYPED (consent, activation) pair at enqueue -- reading the
        -- legacy table for it here would let a purpose-blind consent authorize a
        -- statement-specific vendor read (0038 E3 header / 0020 section 1). Their only
        -- hold cause is the switch this sweep's caller has already turned back on.
        t.lane in ('ocr','statement_facts')
        or (t.lane='invoice_facts' and (
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
           ))
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
alter function clara.release_held_document_tasks(int) owner to clara_fn_owner;

reset role;

-- ---------------------------------------------------------------------------
-- Migration-tail assertions, against the DB's own catalog. These assert the PROPERTIES,
-- not shape keywords: the first cut's tail matched 'client_egress_consents' /
-- 'document_filings' / 't.lane=''ocr''' / the ACLs and printed its success notice on a
-- database whose statement lane had just been permanently stalled. Every arm below is a
-- property a regression cannot satisfy by accident.
-- ---------------------------------------------------------------------------
do $tail50$
declare v_src text; v_claim text; v_pos int; v_window text;
begin
  select p.prosrc into v_src from pg_proc p
   where p.oid='clara.release_held_document_tasks(int)'::regprocedure;
  if v_src is null then
    raise exception '0050 tail: clara.release_held_document_tasks(int) not found' using errcode='CLR10';
  end if;

  ---- (1) THE PROPERTY THAT REGRESSED, asserted twice: the literal triple, and 0038's own
  ---- windowed read of the held_egress filter (0038:8726-8734), which cannot be satisfied
  ---- by a lane literal that lives somewhere else in the body.
  if position('lane in (''ocr'',''invoice_facts'',''statement_facts'')' in v_src)=0 then
    raise exception '0050 tail: the release lane list is not (ocr, invoice_facts, statement_facts) -- a held statement task would stall forever (0038 E4 postcheck, verbatim)'
      using errcode='CLR10';
  end if;
  -- Anchored on the SELECTION PREDICATE itself (`t.status='held_egress'`), not on the first
  -- mention of the token anywhere in the body: a comment naming held_egress must not be able
  -- to satisfy, or to displace, this read.
  v_pos := position('t.status=''held_egress''' in v_src);
  if v_pos=0 then
    raise exception '0050 tail: release_held_document_tasks lost its held_egress selection predicate entirely -- section rebuilt, not amended' using errcode='CLR10';
  end if;
  v_window := substring(v_src from v_pos for 220);
  if position('''ocr''' in v_window)=0 or position('''invoice_facts''' in v_window)=0
     or position('''statement_facts''' in v_window)=0 then
    raise exception '0050 tail: the held_egress filter itself does not carry ocr, invoice_facts AND statement_facts -- a held statement task can never be released'
      using errcode='CLR10';
  end if;

  ---- (2) The consent re-derivation exists AND is scoped to invoice_facts alone.
  if position('client_egress_consents' in v_src)=0 or position('document_filings' in v_src)=0 then
    raise exception '0050 tail: the release fn no longer re-derives the consent hold (document_filings x client_egress_consents) -- F4 regression'
      using errcode='CLR10';
  end if;
  if position('t.lane=''invoice_facts'' and (' in v_src)=0 then
    raise exception '0050 tail: the consent re-derivation is not scoped to lane=invoice_facts -- it must gate that lane and no other'
      using errcode='CLR10';
  end if;
  if position('t.lane in (''ocr'',''statement_facts'')' in v_src)=0 then
    raise exception '0050 tail: the kill-switch-only branch (ocr, statement_facts) is missing -- those lanes must release without any consent re-derivation'
      using errcode='CLR10';
  end if;
  ---- and the release path must NOT have gained a TYPED-consent edge: the statement lane's
  ---- (consent, activation) pair is adjudicated at enqueue, never in the release sweep.
  if position('client_egress_purpose' in v_src)<>0 then
    raise exception '0050 tail: the release fn reads the TYPED-consent surface -- the statement lane is gated at ENQUEUE, and re-adjudicating it here would re-hold a task the enqueue gate already cleared'
      using errcode='CLR10';
  end if;
  ---- and the ocr-only document-status reset survived the recut.
  if position('and t.lane=''ocr''' in v_src)=0 then
    raise exception '0050 tail: the ocr-only extraction_status=''pending'' reset was lost in the recut' using errcode='CLR10';
  end if;

  ---- (3) The claim body and the release sweep still agree on the kill-switch lane set
  ---- (0038 tail section (3), 0038:8200-8210). A lane that can be HELD and not RELEASED is a
  ---- permanent stall, and the two lists now live in three different migrations.
  select p.prosrc into v_claim from pg_proc p
   where p.oid='clara.claim_document_processing_task(uuid,text,boolean)'::regprocedure;
  if position('''ocr'',''invoice_facts'',''statement_facts''' in v_claim)=0
     or position('''ocr'',''invoice_facts'',''statement_facts''' in v_src)=0 then
    raise exception '0050 tail: the kill-switch HOLD lane list and the RELEASE lane list are not both (ocr, invoice_facts, statement_facts)'
      using errcode='CLR10';
  end if;

  ---- (4) ACLs: CREATE OR REPLACE preserves grants, so this asserts nothing drifted --
  ---- release stays a runtime-lane verb only.
  if not has_function_privilege('clara_runtime', 'clara.release_held_document_tasks(int)'::regprocedure, 'execute') then
    raise exception '0050 tail: clara_runtime lost EXECUTE on release_held_document_tasks -- CREATE OR REPLACE must preserve the runtime grant' using errcode='CLR10';
  end if;
  if has_function_privilege('clara_authenticated', 'clara.release_held_document_tasks(int)'::regprocedure, 'execute')
     or has_function_privilege('clara_agent_ro', 'clara.release_held_document_tasks(int)'::regprocedure, 'execute') then
    raise exception '0050 tail: release_held_document_tasks is reachable from a non-runtime role -- release is a runtime-lane verb only' using errcode='CLR10';
  end if;
  if exists(select 1 from pg_proc p, aclexplode(p.proacl) a
            where p.oid='clara.release_held_document_tasks(int)'::regprocedure
              and a.grantee=0 and a.privilege_type='EXECUTE') then
    raise exception '0050 tail: PUBLIC holds EXECUTE on release_held_document_tasks' using errcode='CLR10';
  end if;

  raise notice '0050 tail: release_held_document_tasks re-derives the LEGACY consent hold for lane=invoice_facts ONLY; ocr + statement_facts stay kill-switch-only; the (ocr, invoice_facts, statement_facts) release list still tracks the claim body; ACLs preserved, runtime-only';
end $tail50$;
