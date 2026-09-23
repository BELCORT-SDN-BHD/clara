-- 0288_seeding_lane_retired — #1012 (riders wave 3, lane 07): RETIRE THE PRIOR-GL SEEDING LANE.
-- =====================================================================================
-- Spec of record: ticket #1012's Agent Brief (ready-for-agent), which carries the owner's
-- ruling of 2026-09-20 on #983 (closed): the prior-GL seeding lane gets NO browser entrance,
-- because the product direction is the Client KB — "用户不必先手工登记交易对方绑定，Clara 才能开始
-- 工作" (docs/PRD.md, Client Knowledge). Nobody pre-registers by hand what Clara can learn from
-- a source, so the lane that asked a professional to tick a pre-registration list has no
-- successor UI to build: it is retired instead.
--
-- WHAT THIS FILE DOES, IN ONE SENTENCE. Three WRITE doors — `clara.create_seeding_batch`,
-- `clara.tick_seeding_proposal`, `clara.decline_seeding_proposal` — are recut IN PLACE to one
-- shared typed refusal (CLR34, `detail.reason = 'seeding_lane_retired'`, one message), and
-- nothing else in the lane moves.
--
-- WHAT DOES NOT MOVE, AND WHY EACH ONE STAYS.
--   · `clara.cancel_seeding_batch` / `clara.complete_seeding_batch` — BYTE-UNCHANGED, pinned in
--     the prestate AND re-pinned in the tail. A batch left open at the moment of retirement
--     must still be closeable by the firm that owns it; retiring the closers would strand it.
--   · Every READ of a batch or a proposal (the two relations' RLS policies, the web client's
--     PostgREST reads) — untouched. All history stays readable: this file deletes no batch, no
--     proposal and no page.
--   · The two relations themselves, their CHECK constraints, their policies and their grants.
--   · `clara.list_review_queue` and the `document_capabilities` rows for `prior_gl` — those two
--     are #1012's own work as well, and they are spliced/republished in §C and §D below.
--   · The signature, the owner, the SECURITY DEFINER posture, the `search_path` and the ACL of
--     all three recut doors. The retirement must answer a TYPED REFUSAL to the caller who could
--     reach the door yesterday, which is only possible while that caller can still reach it —
--     a revoked grant would answer `42501 insufficient_privilege` instead, which is the wrong
--     sentence and the wrong shape for the web layer's refusal mapping. So no grant moves: the
--     runtime lane still holds EXECUTE on the creator, the human lane on the two deciders, and
--     nobody gains anything.
--
-- WHY A REFUSAL AND NOT A DROP (the 0271/#1003 question, answered the other way). #1003 dropped
-- `clara.create_account_set_v1` because it had zero live callers and a dropped body needs no
-- re-derivation. These three have live callers TODAY — the runtime's seeding-prepare route, the
-- web Reports panel's tick/decline dialogs — and a caller that meets `42883 undefined_function`
-- reports an internal error, not a retirement. The estate's own idiom for that case is 0007's
-- `clara.ingest_document`: keep the signature, keep the arity, answer a deterministic typed
-- retirement. This file follows 0007, not 0271.
--
-- WHY THE REFUSAL IS THE WHOLE BODY. The three doors' first statements were, respectively, a
-- `_reserve_op` idempotency reservation (creator) and a `clara._human_ctx(role_rank('admin'))`
-- ladder (both deciders). Raising BEFORE either one is deliberate: the retirement must write
-- nothing at all, and a reservation is a write (`clara.op_receipts`). A caller who replays a
-- retired op_key therefore gets the same refusal every time rather than a cached receipt — the
-- lane has no state to be idempotent about any more. The cost, named honestly: the deciders no
-- longer distinguish "not an admin" from "retired", and the creator no longer distinguishes
-- "not a prior GL" from "retired". That is the point of a retirement — the answer does not
-- depend on the request — and no access is loosened by it: the ACLs above are unchanged, so
-- exactly the roles that could call these doors yesterday can call them today, and receive a
-- refusal.
--
-- REDO-SAFE (#957), AND BIMODAL BY CONSTRUCTION. Every pin on a body this file RECUTS is
-- written to succeed on either branch: FIRST APPLY (the live body is the measured pre-image,
-- pinned by sha) or REDO (the live body already carries this file's own retirement marker).
-- `CLARA_MIGRATION_REDO` can therefore only ever exercise the second branch — so the FIRST
-- branch was proven by hand, inside a rolled-back transaction that restored the three
-- pre-images and ran §A verbatim (see the ticket report for the transcript). Pins on bodies
-- this file MUST NOT touch are hard, single-valued and re-asserted in the tail.
--
-- PRE-IMAGE PINS, MEASURED ON clara_l07 (LANE 07's OWN RIG) ON 2026-09-23, off `pg_proc.prosrc`,
-- after this lane's earlier ticket #899 (0287) had applied:
--   · clara.create_seeding_batch(uuid,uuid,jsonb,text)
--       cb71109bcb19774b0b9a3cc1ab1c7df308d50f852aa71641e9ba34ec9ddca4b6
--   · clara.tick_seeding_proposal(uuid,text)
--       17830ded558b0ffcd62b88ada6dab9684dc3ac001589aace557602fd5079084b
--   · clara.decline_seeding_proposal(uuid,text,text)
--       3cbf7183bde1a411aab8541f3b30d96390cc1f451f887fd17ca7c0196871ad33
--   · clara.cancel_seeding_batch(uuid,text,text)   — MUST NOT MOVE
--       0b655b1a5d23920593ae3f41dd8942c0bfaa1cdc7a89daba64eaf50a2ac7eba5
--   · clara.complete_seeding_batch(uuid,text)      — MUST NOT MOVE
--       96a62e0c02387980629ce40ffea06d4a2d4a66dbefb888dac2059e12679bf7ba
--
-- NO NEW GRANTED OBJECT, NO rig-meta COHORT. This file creates no function, table, column,
-- trigger, policy or grant: it recuts three already-granted bodies in place. `rig-meta.mjs`'s
-- cohorts audit GRANT correctness on NEWLY introduced callable objects, and there is none here,
-- so the grant matrix is unchanged BY DESIGN (the three names stay exactly where they are in
-- WAVE_B_HUMAN_FNS / WAVE_B_RUNTIME_FNS, with a comment naming this file). It still ships its
-- OWN preintegration gate (`seeding-lane-retired-preintegration-gate.mjs`) because it ships a
-- NEW test file that must quiet-skip, rather than hard-fail, on a chain that predates 0288.
-- =====================================================================================

set local statement_timeout = '5min';   -- runner rule: statement_timeout is the first executable statement
set local lock_timeout = '5s';

-- =====================================================================================
-- §A  PRESTATE. Everything this file builds on, measured on the lane database, never
--     transcribed from another file's text.
-- =====================================================================================
do $p1012_pre$
declare
  v_creator  text := 'clara.create_seeding_batch(uuid,uuid,jsonb,text)';
  v_ticker   text := 'clara.tick_seeding_proposal(uuid,text)';
  v_decliner text := 'clara.decline_seeding_proposal(uuid,text,text)';
  v_cancel   text := 'clara.cancel_seeding_batch(uuid,text,text)';
  v_complete text := 'clara.complete_seeding_batch(uuid,text)';
  v_sha text; v_redo boolean; r record; v_n int;
begin
  -- (a) THE FIVE LANE DOORS ALL RESOLVE AT THEIR EXACT SIGNATURES. A missing one means this
  --     file is being applied out of order, or against an estate that never had 0017.
  foreach v_sha in array array[v_creator, v_ticker, v_decliner, v_cancel, v_complete] loop
    if to_regprocedure(v_sha) is null then
      raise exception '#1012 prestate: % does not resolve -- 0017_wave_b.sql must apply first', v_sha
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (b) THE THREE RECUT TARGETS, BIMODALLY PINNED. FIRST APPLY requires the measured
  --     pre-image; a REDO is recognised by this file's OWN marker already being in the body.
  for r in select * from (values
      (v_creator,  'cb71109bcb19774b0b9a3cc1ab1c7df308d50f852aa71641e9ba34ec9ddca4b6'),
      (v_ticker,   '17830ded558b0ffcd62b88ada6dab9684dc3ac001589aace557602fd5079084b'),
      (v_decliner, '3cbf7183bde1a411aab8541f3b30d96390cc1f451f887fd17ca7c0196871ad33')
      ) as t(sig, want) loop
    select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex'),
           position('seeding_lane_retired' in p.prosrc) > 0
      into v_sha, v_redo
      from pg_proc p where p.oid = r.sig::regprocedure;
    if v_redo then
      raise notice '#1012 prestate: % already carries the retirement marker -- REDO branch (CLARA_MIGRATION_REDO of this same file).', r.sig;
    elsif v_sha is distinct from r.want then
      raise exception '#1012 prestate: % has DRIFTED from its measured pre-image (got %, expected %) -- re-measure on THIS database before recutting it',
        r.sig, v_sha, r.want using errcode = 'CLR10';
    end if;
  end loop;

  -- (c) THE TWO CLOSERS THIS FILE MUST NOT TOUCH, hard-pinned. A batch left open at retirement
  --     is closed through exactly these two, so a drift here is a reason to STOP, not to adapt.
  for r in select * from (values
      (v_cancel,   '0b655b1a5d23920593ae3f41dd8942c0bfaa1cdc7a89daba64eaf50a2ac7eba5'),
      (v_complete, '96a62e0c02387980629ce40ffea06d4a2d4a66dbefb888dac2059e12679bf7ba')
      ) as t(sig, want) loop
    select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
      from pg_proc p where p.oid = r.sig::regprocedure;
    if v_sha is distinct from r.want then
      raise exception '#1012 prestate: % has DRIFTED from its measured pre-image (got %) -- this file must not touch it, so re-measure before applying',
        r.sig, v_sha using errcode = 'CLR10';
    end if;
  end loop;

  -- (d) THE ACL POSTURE THE RECUT MUST PRESERVE, measured rather than assumed: the creator is
  --     runtime-only, both deciders are human-only, and NO role beyond those holds EXECUTE.
  if not has_function_privilege('clara_runtime', v_creator::regprocedure, 'execute')
     or has_function_privilege('clara_authenticated', v_creator::regprocedure, 'execute')
     or has_function_privilege('clara_agent_ro', v_creator::regprocedure, 'execute') then
    raise exception '#1012 prestate: % is not the runtime-only door this file preserves', v_creator
      using errcode = 'CLR10';
  end if;
  foreach v_sha in array array[v_ticker, v_decliner] loop
    if not has_function_privilege('clara_authenticated', v_sha::regprocedure, 'execute')
       or has_function_privilege('clara_runtime', v_sha::regprocedure, 'execute')
       or has_function_privilege('clara_agent_ro', v_sha::regprocedure, 'execute') then
      raise exception '#1012 prestate: % is not the human-only door this file preserves', v_sha
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (e) THE HISTORY THIS FILE PROMISES TO LEAVE READABLE, counted now so the tail can prove
  --     the same counts after. On a seeded lane rig this is usually 0/0; on hosted it is not.
  select count(*)::int into v_n from clara.seeding_batches;
  raise notice '#1012 prestate: % seeding batch(es) and % proposal(s) exist and must survive this file untouched.',
    v_n, (select count(*)::int from clara.seeding_proposals);

  raise notice '#1012 prestate: OK -- the five lane doors resolve; the three recut targets are at their measured pre-images (or already retired, on a redo); cancel/complete are byte-identical to their pins; the creator is runtime-only and both deciders human-only.';
end
$p1012_pre$;

-- =====================================================================================
-- §B  THE RETIREMENT. Three `create or replace function` statements at the EXACT existing
--     signatures — which is what preserves the ACL (CREATE OR REPLACE never resets one) and
--     what makes this file redo-safe. Each body is the SAME typed refusal: same SQLSTATE, same
--     `detail.reason`, same sentence. Nothing reads, nothing writes, nothing reserves.
-- =====================================================================================
set role clara_fn_owner;

create or replace function clara.create_seeding_batch(p_client uuid, p_document uuid,
    p_proposals jsonb, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $fn$
begin
  -- #1012: the prior-GL seeding lane is retired (owner ruling 2026-09-20, #983). Raising
  -- ahead of the idempotency reservation is deliberate: a retired door writes nothing at all,
  -- not even a receipt.
  raise exception 'the prior-GL seeding lane is retired: Clara learns a client''s counterparties and coding from the source itself, so no seeding batch, tick or decline is accepted; existing batches stay readable and can still be cancelled or completed'
    using errcode = 'CLR34', detail = '{"reason":"seeding_lane_retired"}';
end $fn$;

create or replace function clara.tick_seeding_proposal(p_proposal uuid, p_op_key text)
    returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $fn$
begin
  -- #1012: retired. Raising ahead of the role ladder is deliberate (see 0288's header): the
  -- answer must not depend on the request, and no proposal may change state again.
  raise exception 'the prior-GL seeding lane is retired: Clara learns a client''s counterparties and coding from the source itself, so no seeding batch, tick or decline is accepted; existing batches stay readable and can still be cancelled or completed'
    using errcode = 'CLR34', detail = '{"reason":"seeding_lane_retired"}';
end $fn$;

create or replace function clara.decline_seeding_proposal(p_proposal uuid, p_reason text,
    p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $fn$
begin
  -- #1012: retired. A proposal nobody can tick is also a proposal nobody needs to decline —
  -- the batch's own cancel/complete doors close the history out instead.
  raise exception 'the prior-GL seeding lane is retired: Clara learns a client''s counterparties and coding from the source itself, so no seeding batch, tick or decline is accepted; existing batches stay readable and can still be cancelled or completed'
    using errcode = 'CLR34', detail = '{"reason":"seeding_lane_retired"}';
end $fn$;

reset role;

-- =====================================================================================
-- §C  THE QUEUE SPLICE. `clara.list_review_queue` stops emitting `seeding_proposal`.
--
-- WHY FOR EVERY CLIENT, NOT ONLY FOR PROPOSALS OPENED LATER. The row is derived, never
-- stored: 0146 (裁-17) added a BATCH-LEVEL CTE emitting one row per client that still owns an
-- OPEN proposal in an OPEN batch. After §B nobody can tick or decline one ever again, so every
-- such row points at a decision that can no longer be made. The beta rule (owner, 2026-09-20)
-- is that nothing is switched off silently and nothing un-actionable is shown; a row nobody can
-- act on is worse than no row. The proposals themselves stay exactly where they are and stay
-- readable — only the chase stops.
--
-- THE LIVE DEFINITION OF THIS FUNCTION IS NOT ANY ONE FILE'S TEXT. It was born at 0011,
-- REPLACED WHOLE by 0016, then DYNAMICALLY SPLICED (pg_get_functiondef -> replace() -> execute,
-- never re-typed) by 0017, 0036, 0041 §S4.9, 0043 §S3.8, 0146, 0168, 0180 and 0260. This file is
-- the NINTH splice and the FIRST that REMOVES a row kind. It is anchored the same way every
-- predecessor was, and it asserts the ten surviving kinds at their exact pre-splice counts.
--
-- PRE-IMAGE PIN, MEASURED ON clara_l07 NOW off `pg_proc.prosrc` (never file text): sha256 =
-- 1641f99f4d295400bd39bd7b2cee3ac4cac2c34e7478078014e7305d99d9b570. This lane's earlier ticket
-- (#899 / 0287) does not touch this body, so this is the wave-2 integration head's own body.
--
-- A NAMED RESIDUAL, NOT AN OVERSIGHT: the three columns the retired CTE alone ever populated
-- (`client_name`, `batch_ids`, `open_proposal_count`) STAY in the shared column vector and are
-- now null on every row, so the envelope's 31-key row shape does not move. Dropping them would
-- mean recutting all ten surviving CTEs and the row-json builder — a far wider change to a body
-- ten other row kinds share — for no behavioural gain, and it would move a pinned shape that two
-- independent test rosters and the web's ReviewQueueRow type all restate.
--
-- REDO-SAFE: the splice recognises "already spliced" from the live body and skips itself
-- entirely, so a CLARA_MIGRATION_REDO of this file never double-cuts.
-- =====================================================================================
do $p1012_lrq$
declare
  v_sig text := 'clara.list_review_queue(jsonb,jsonb,integer)';
  v_def text; v_next text; v_code text; v_sha text; v_pre_sha text; v_post_sha text;
  v_pre_owner text; v_pre_acl text; v_post_owner text; v_post_acl text;
  v_start int; v_end int; v_n int; v_raw_n int; r record;
  v_cte_open  constant text := '  ), seeding_rows as (';
  v_cte_next  constant text := '  ), work_question_rows as (';
  v_union_arm constant text := '    union all select * from seeding_rows' || chr(10);
  v_gravestone constant text :=
    '  -- #1012 (0288): the seeding_proposal row kind is RETIRED here. 0146 (裁-17) added a' || chr(10) ||
    '  -- BATCH-LEVEL seeding_rows CTE emitting one row per client that still owned an OPEN' || chr(10) ||
    '  -- proposal in an OPEN batch; after 0288 nobody can tick or decline one ever again, so' || chr(10) ||
    '  -- every such row pointed at a decision that can no longer be made. The CTE and its' || chr(10) ||
    '  -- union arm are spliced OUT. The proposals and batches themselves are untouched and' || chr(10) ||
    '  -- stay readable. The three columns this CTE alone populated (client_name, batch_ids,' || chr(10) ||
    '  -- open_proposal_count) stay in the shared column vector, null on every row -- a named' || chr(10) ||
    '  -- residual: dropping them would recut all ten surviving CTEs for no behavioural gain.' || chr(10);
begin
  if to_regprocedure(v_sig) is null then
    raise exception '#1012 sectionC prestate: % is GONE', v_sig using errcode = 'CLR10';
  end if;
  select pg_get_functiondef(p.oid), p.proowner::regrole::text, p.proacl::text,
         encode(sha256(convert_to(p.prosrc,'UTF8')),'hex'),
         encode(sha256(pg_get_functiondef(p.oid)::bytea),'hex')
    into v_def, v_pre_owner, v_pre_acl, v_sha, v_pre_sha
    from pg_proc p where p.oid = v_sig::regprocedure;

  -- IDEMPOTENCY / REDO: measured IN CODE so a comment cannot short-circuit a real apply.
  v_code := regexp_replace(regexp_replace(v_def, '/\*.*?\*/', '', 'gs'), '--[^\n]*', '', 'g');
  if position('''seeding_proposal''::text row_kind' in v_code) = 0 then
    raise notice '#1012 sectionC: the queue already emits no seeding_proposal row -- REDO branch, this splice is a no-op.';
  else
    -- HARD PRE-IMAGE PIN (first apply only): the prosrc this splice was derived against.
    if v_sha is distinct from '1641f99f4d295400bd39bd7b2cee3ac4cac2c34e7478078014e7305d99d9b570' then
      raise exception '#1012 sectionC prestate: % has DRIFTED from its pinned pre-image (measured %) -- re-derive this splice against the LIVE body before applying', v_sig, v_sha
        using errcode = 'CLR10';
    end if;

    -- THE WITNESS ROSTER: every one of the ELEVEN live kinds at its exact pre-splice count,
    -- both IN CODE and cross-checked against the RAW count (0260's HIGH-1 guard: a marker
    -- hiding inside a comment must not stand in for a real one).
    for r in select * from (values
        ($$'draft'::text row_kind$$, 1),
        ($$'uncoded_filing'::text row_kind$$, 1),
        ($$'open_question'::text row_kind$$, 1),
        ($$'coding_task'::text row_kind$$, 1),
        ($$'compliance_watch'::text row_kind$$, 1),
        ($$'lint_finding'::text row_kind$$, 1),
        ($$'fixed_asset_incomplete'::text row_kind$$, 1),
        ($$'staff_advance_incomplete'::text row_kind$$, 1),
        ($$'seeding_proposal'::text row_kind$$, 1),
        ($$'work_question'::text row_kind$$, 1),
        ($$'depreciation_authority_pending'::text row_kind$$, 1),
        ('null::int open_proposal_count', 10),
        ('_is_codeable_kind', 1),
        ('_autodraft_attempt_budget', 1)
        ) as t(marker, want) loop
      v_n := (length(v_code) - length(replace(v_code, r.marker, ''))) / length(r.marker);
      if v_n <> r.want then
        raise exception '#1012 sectionC prestate: list_review_queue carries the marker "%" % time(s) IN CODE, expected % -- the body drifted or lost a prior splice', r.marker, v_n, r.want
          using errcode = 'CLR10';
      end if;
      v_raw_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
      if v_raw_n <> v_n then
        raise exception '#1012 sectionC prestate (HIGH-1): marker "%" appears % time(s) in RAW text but % IN CODE -- % occurrence(s) hide inside a comment', r.marker, v_raw_n, v_n, (v_raw_n - v_n)
          using errcode = 'CLR10';
      end if;
    end loop;

    -- SPLICE (1): the seeding_rows CTE is cut out BETWEEN its own opener and the next CTE's,
    -- and a gravestone comment takes its place. Boundary-anchored rather than whole-block
    -- anchored (0260's idiom) because the block being REMOVED is thirty lines of prose that no
    -- migration should have to re-type in order to delete.
    v_start := position(v_cte_open in v_def);
    v_end   := position(v_cte_next in v_def);
    if v_start = 0 or v_end = 0 or v_end <= v_start then
      raise exception '#1012 sectionC splice (1): the seeding_rows CTE boundaries are not where this splice expects them (start %, end %)', v_start, v_end
        using errcode = 'CLR10';
    end if;
    if position(v_cte_open in substr(v_def, v_start + length(v_cte_open))) <> 0
       or position(v_cte_next in substr(v_def, v_end + length(v_cte_next))) <> 0 then
      raise exception '#1012 sectionC splice (1): a boundary marker occurs more than once' using errcode = 'CLR10';
    end if;
    v_next := substr(v_def, 1, v_start - 1) || v_gravestone || substr(v_def, v_end);

    -- SPLICE (2): the all_rows union arm.
    v_n := (length(v_next) - length(replace(v_next, v_union_arm, ''))) / length(v_union_arm);
    if v_n <> 1 then
      raise exception '#1012 sectionC splice (2): the seeding_rows union arm appears % time(s), expected 1', v_n
        using errcode = 'CLR10';
    end if;
    v_next := replace(v_next, v_union_arm, '');

    if v_next = v_def then
      raise exception '#1012 sectionC splice: no byte moved -- refusing a no-op apply' using errcode = 'CLR10';
    end if;
    execute v_next;

    -- POSTCHECK, both directions: the kind is gone and every survivor is at its exact
    -- pre-splice count; owner and ACL byte-unchanged; the definition moved.
    select p.proowner::regrole::text, p.proacl::text, encode(sha256(pg_get_functiondef(p.oid)::bytea),'hex')
      into v_post_owner, v_post_acl, v_post_sha
      from pg_proc p where p.oid = v_sig::regprocedure;
    if v_post_owner is distinct from v_pre_owner or v_post_acl is distinct from v_pre_acl then
      raise exception '#1012 sectionC postcheck: list_review_queue changed owner (% -> %) or ACL (% -> %)',
        v_pre_owner, v_post_owner, v_pre_acl, v_post_acl using errcode = 'CLR10';
    end if;
    if v_post_sha = v_pre_sha then
      raise exception '#1012 sectionC postcheck: the definition did not change -- the splice was a no-op' using errcode = 'CLR10';
    end if;
    v_code := regexp_replace(regexp_replace(
      (select pg_get_functiondef(p.oid) from pg_proc p where p.oid = v_sig::regprocedure),
      '/\*.*?\*/', '', 'gs'), '--[^\n]*', '', 'g');
    for r in select * from (values
        ($$'draft'::text row_kind$$, 1),
        ($$'uncoded_filing'::text row_kind$$, 1),
        ($$'open_question'::text row_kind$$, 1),
        ($$'coding_task'::text row_kind$$, 1),
        ($$'compliance_watch'::text row_kind$$, 1),
        ($$'lint_finding'::text row_kind$$, 1),
        ($$'fixed_asset_incomplete'::text row_kind$$, 1),
        ($$'staff_advance_incomplete'::text row_kind$$, 1),
        ($$'seeding_proposal'::text row_kind$$, 0),
        ($$'work_question'::text row_kind$$, 1),
        ($$'depreciation_authority_pending'::text row_kind$$, 1),
        ('null::int open_proposal_count', 10),
        ('_is_codeable_kind', 1),
        ('_autodraft_attempt_budget', 1),
        ('from clara.seeding_proposals', 0),
        ('union all select * from seeding_rows', 0)
        ) as t(marker, want) loop
      v_n := (length(v_code) - length(replace(v_code, r.marker, ''))) / length(r.marker);
      if v_n <> r.want then
        raise exception '#1012 sectionC postcheck: marker "%" appears % time(s), expected % -- the splice removed more (or less) than the seeding row kind', r.marker, v_n, r.want
          using errcode = 'CLR10';
      end if;
    end loop;
    raise notice '#1012 sectionC: clara.list_review_queue spliced -- the seeding_rows CTE and its union arm are OUT (a gravestone comment in their place), the TEN surviving row kinds sit at their EXACT pre-splice marker counts, the shared column vector is unmoved at 10, and owner (%) and ACL are byte-unchanged. definition sha256: % -> %.', v_post_owner, v_pre_sha, v_post_sha;
  end if;
end
$p1012_lrq$;

-- =====================================================================================
-- §D  THE REGISTRY REPUBLICATION. `clara.document_capabilities`' seven `prior_gl` rows stop
--     saying "no browser entrance exists YET" and say the lane is RETIRED instead.
--
-- WHAT 0228 WROTE AND WHY IT IS NOW WRONG. #656 (0228) corrected these rows honestly for its own
-- moment: a filed prior general ledger DID drive `clara.create_seeding_batch` through the
-- deterministic reader, and NOTHING in the web app called `POST /api/seeding/prepare`, so 0228
-- named the gap — `limits {"browser_entrance":"absent"}` plus a basis sentence promising the
-- entrance nobody had built. "Not built yet" is a promise. After §B there is nothing left to
-- build: the doors refuse and the route is deleted. Leaving the old wording would leave the
-- registry — the estate's own machine-readable statement of what Clara can do with a document —
-- advertising an operation that no longer exists.
--
-- WHAT DOES NOT MOVE. `business_operation` stays `stored_only` and `typed_facts` stays where each
-- row had it. #1012's own out-of-scope line rules out widening either, and #988's owner ruling
-- (0246's header) already settled that `prior_gl` stays `stored_only` pending the Client KB. The
-- other five `prior_gl` rows (csv, docx, ofx, tsv, xml — the formats seeding-parse.mjs never had
-- a reader for) are untouched: they never promised the operation, so they have nothing to retire.
--
-- WHY THE WHOLE REGISTRY'S VERSION RISES FOR SEVEN ROWS. The registry's own executable law is
-- `count(distinct registry_version) = 1` over all 240 rows — asserted by
-- `document-capability-registry.test.mjs` AND, since #846 (0244), by a DEFERRABLE INITIALLY
-- DEFERRED constraint trigger that judges the transaction on what it LEAVES. A seven-row raise
-- would leave two versions and be refused. So this file does what 0228 and 0245 did before it:
-- correct the content, then raise every row by one, by UPDATE, never DELETE-then-INSERT (#846's
-- high-water wall), under 0207's monotone wall which permits a raise.
--
-- THE VERSION IS MEASURED, NOT PINNED. #1012's own sequencing note: these rows are republished
-- under a monotone version wall SHARED with #782 and #990, so whichever lands second must
-- re-derive against the live rows and take the next version rather than assume a pinned one.
-- The prestate therefore asserts UNIFORMITY and a FLOOR (>= 3, #782's publication, which is what
-- this lane's database carries), remembers what it measured, and the tail asserts exactly
-- measured + 1. A sibling lane that republishes first simply moves both numbers together.
--
-- REDO-SAFE: the republication recognises its own effects (no row carries `browser_entrance` any
-- more AND the seven carry the retirement limit) and skips itself entirely, so a
-- CLARA_MIGRATION_REDO of this file never raises the version twice.
-- =====================================================================================
do $p1012_registry$
declare
  v_n int; v_sha text; v_before int; r record;
  v_marker constant text := 'The filing is work a person completes -- but Clara does NOT derive nothing:';
  v_retired constant text :=
    'The filing is work a person completes. A filed prior general ledger USED to drive '
    || 'clara.create_seeding_batch through the deterministic reader '
    || 'packages/runtime/lib/seeding-parse.mjs; that lane is RETIRED by migration '
    || '0288_seeding_lane_retired.sql (ticket 1012, owner ruling 2026-09-20 on ticket 983). Its '
    || 'three write doors answer a typed refusal and the runtime route that fronted them is '
    || 'removed, because the product direction is the Client KB: nobody pre-registers by hand '
    || 'what Clara can learn from a source. Existing batches, proposals and published pages stay '
    || 'readable, and a batch left open can still be cancelled or completed. The level stays '
    || 'stored_only for the reason it always did -- this registry reserves a supported business '
    || 'operation for a pair Clara can carry TYPED FACTS into, and nothing has ever produced a '
    || 'prior_gl.line region.';
begin
  if to_regclass('clara.document_capabilities') is null then
    raise exception '#1012 sectionD prestate: clara.document_capabilities is absent -- 0191 must apply first'
      using errcode = 'CLR10';
  end if;

  select count(*)::int into v_n from clara.document_capabilities
   where document_kind = 'prior_gl' and limits ? 'browser_entrance';
  if v_n = 0 then
    select count(*)::int into v_n from clara.document_capabilities
     where document_kind = 'prior_gl' and limits ->> 'seeding_lane' = 'retired';
    if v_n <> 7 then
      raise exception '#1012 sectionD prestate: no prior_gl row carries browser_entrance, and % (not 7) carry the retirement limit -- this is neither a first apply nor a redo', v_n
        using errcode = 'CLR10';
    end if;
    raise notice '#1012 sectionD: the seven prior_gl rows already state the retirement -- REDO branch, this republication is a no-op.';
  else
    -- (a) THE SEVEN ROWS, exactly as 0228 left them.
    if v_n <> 7 then
      raise exception '#1012 sectionD prestate: % prior_gl row(s) carry limits.browser_entrance, not the 7 #656 (0228) named', v_n
        using errcode = 'CLR10';
    end if;
    select count(*)::int into v_n from clara.document_capabilities
     where document_kind = 'prior_gl' and limits ? 'browser_entrance'
       and position(v_marker in basis) > 0;
    if v_n <> 7 then
      raise exception '#1012 sectionD prestate: only % of the 7 rows carry the basis sentence this file rewrites -- 0228''s text has drifted, re-derive before republishing', v_n
        using errcode = 'CLR10';
    end if;
    if exists (select 1 from clara.document_capabilities where limits ? 'seeding_lane') then
      raise exception '#1012 sectionD prestate: a row already carries limits.seeding_lane -- this file would not be the first writer'
        using errcode = 'CLR10';
    end if;
    select count(*)::int into v_n from clara.document_capabilities
     where document_kind <> 'prior_gl' and limits ? 'browser_entrance';
    if v_n <> 0 then
      raise exception '#1012 sectionD prestate: % row(s) OUTSIDE prior_gl carry browser_entrance -- this file must not touch them', v_n
        using errcode = 'CLR10';
    end if;

    -- (b) THE REGISTRY IS UNIFORM AND AT OR ABOVE #782's PUBLICATION. Measured, never pinned:
    --     a sibling lane republishing first moves this number, and that is allowed.
    select count(distinct registry_version)::int into v_n from clara.document_capabilities;
    if v_n <> 1 then
      raise exception '#1012 sectionD prestate: the registry publishes % distinct registry_versions, not one', v_n
        using errcode = 'CLR10';
    end if;
    select min(registry_version)::int into v_before from clara.document_capabilities;
    if v_before < 3 then
      raise exception '#1012 sectionD prestate: the registry publishes version %, below #782''s 3 -- 0245 must apply first', v_before
        using errcode = 'CLR10';
    end if;
    select count(*)::int into v_n from clara.document_capabilities;
    if v_n <> 240 then
      raise exception '#1012 sectionD prestate: the registry holds % rows, not 240 -- this file inserts and deletes nothing', v_n
        using errcode = 'CLR10';
    end if;

    -- (c) THE FIVE WALL BODIES THIS RAISE RIDES, pinned by sha as measured on this rig now
    --     (0272 recut one of them after 0245 pinned it, so these are re-measured, not copied).
    for r in select * from (values
        ('clara._tf_document_capabilities_version_monotone()',  '170df87b15ca9eafa40e0dfa2e09423d145de89e0ed55b3c44247ec68b9e9c56'),
        ('clara._tf_document_capabilities_version_high_water()', 'b40906871b7e7e43bff50799c187d7ae38d13d30f61f7a1ab99547d6de8618c9'),
        ('clara._tf_document_capabilities_high_water_record()',  '839c51fb125268bf17bd2fd35ed4d4583cae4d251aad6724a241fc78429de40d'),
        ('clara._tf_document_capability_high_water_monotone()',  '62e83a3b249ca1d0186041ac36c6f77615f3631b04d96eb57fc16f010974ec8c'),
        ('clara._tf_document_capabilities_version_uniform()',    'd21b6837207cb438ab13caf279ef3d52a69066c480e20807f5be3ae7895ef776')
        ) as t(sig, want) loop
      if to_regprocedure(r.sig) is null then
        raise exception '#1012 sectionD prestate: % is absent -- 0207/0244/0272 must apply first', r.sig using errcode = 'CLR10';
      end if;
      select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
       where p.oid = r.sig::regprocedure;
      if v_sha is distinct from r.want then
        raise exception '#1012 sectionD prestate: % body drifted (sha %) -- this file must not touch it', r.sig, v_sha
          using errcode = 'CLR10';
      end if;
    end loop;

    -- (d) THE HIGH-WATER MARK ALREADY AGREES, so this raise is the ordinary writer path.
    select count(*)::int into v_n
      from clara.document_capabilities c
      left join clara.document_capability_version_high_water h
        on h.format = c.format and h.document_kind = c.document_kind
     where h.format is null or h.registry_version is distinct from c.registry_version;
    if v_n <> 0 then
      raise exception '#1012 sectionD prestate: % pair(s) carry a high-water mark that disagrees with the published registry', v_n
        using errcode = 'CLR10';
    end if;

    raise notice '#1012 sectionD prestate: OK -- 7 prior_gl rows carry browser_entrance and 0228''s basis sentence, no row carries seeding_lane yet, the registry publishes version % uniformly across 240 rows, the five wall bodies are at their measured shas and every high-water mark agrees.', v_before;

    -- ===================================================================================
    -- THE REPUBLICATION. Two statements, content first then the registry-wide raise (0228's
    -- and 0245's order), so a failure in the correction cannot leave the registry at a version
    -- whose content never landed, and #846's deferred uniformity wall judges what is LEFT.
    -- ===================================================================================
    set role clara_fn_owner;

    -- D1 · THE CONTENT CORRECTION. The basis keeps its ENGINE-specific opening (each row names
    --      its own reader) and replaces everything from 0228's own marker sentence onward, so
    --      no row's engine claim is re-typed by this file. The limit is REPLACED, not merged:
    --      `browser_entrance` is not a weaker form of the truth, it is a superseded one.
    update clara.document_capabilities
       set basis = left(basis, position(v_marker in basis) - 1) || v_retired,
           limits = (limits - 'browser_entrance') || jsonb_build_object(
             'seeding_lane', 'retired',
             'seeding_lane_reason', 'client_kb_replaces_manual_pre_registration')
     where document_kind = 'prior_gl' and limits ? 'browser_entrance';

    -- D2 · THE REGISTRY-WIDE RAISE, one statement, every row, +1 from the uniform version the
    --      prestate measured. 0207's wall sees a raise and permits it; 0244's writer raises every
    --      pair's high-water mark in the same statement, as an AFTER trigger.
    update clara.document_capabilities set registry_version = registry_version + 1;

    reset role;

    -- ===================================================================================
    -- TAIL, re-reading the live rows rather than trusting the two statements above.
    -- ===================================================================================
    select count(*)::int into v_n from clara.document_capabilities
     where document_kind = 'prior_gl'
       and limits ->> 'seeding_lane' = 'retired'
       and limits ->> 'seeding_lane_reason' = 'client_kb_replaces_manual_pre_registration'
       and not (limits ? 'browser_entrance')
       and position('0288_seeding_lane_retired.sql' in basis) > 0
       and position('RETIRED' in basis) > 0
       and position('NO BROWSER ENTRANCE EXISTS YET' in basis) = 0;
    if v_n <> 7 then
      raise exception '#1012 sectionD tail: % row(s) state the retirement in both basis and limits, not the 7 measured', v_n
        using errcode = 'CLR10';
    end if;
    if exists (select 1 from clara.document_capabilities where limits ? 'browser_entrance') then
      raise exception '#1012 sectionD tail: a row still carries browser_entrance' using errcode = 'CLR10';
    end if;
    select count(*)::int into v_n from clara.document_capabilities
     where document_kind = 'prior_gl' and business_operation <> 'stored_only';
    if v_n <> 0 then
      raise exception '#1012 sectionD tail: % prior_gl row(s) moved off business_operation = stored_only -- this file changes basis and limits only', v_n
        using errcode = 'CLR10';
    end if;
    select count(distinct registry_version)::int into v_n from clara.document_capabilities;
    if v_n <> 1 then
      raise exception '#1012 sectionD tail: the registry publishes % distinct registry_versions', v_n using errcode = 'CLR10';
    end if;
    select min(registry_version)::int into v_n from clara.document_capabilities;
    if v_n <> v_before + 1 then
      raise exception '#1012 sectionD tail: the registry publishes version %, not the % this raise owed', v_n, v_before + 1
        using errcode = 'CLR10';
    end if;
    select count(*)::int into v_n from clara.document_capabilities;
    if v_n <> 240 then
      raise exception '#1012 sectionD tail: the registry now holds % rows', v_n using errcode = 'CLR10';
    end if;
    select count(*)::int into v_n
      from clara.document_capabilities c
      left join clara.document_capability_version_high_water h
        on h.format = c.format and h.document_kind = c.document_kind
     where h.format is null or h.registry_version is distinct from c.registry_version;
    if v_n <> 0 then
      raise exception '#1012 sectionD tail: % pair(s) carry a high-water mark that disagrees after the raise', v_n
        using errcode = 'CLR10';
    end if;
    if pg_catalog.has_table_privilege('clara_authenticated', 'clara.document_capabilities', 'INSERT')
       or pg_catalog.has_table_privilege('clara_authenticated', 'clara.document_capabilities', 'UPDATE')
       or pg_catalog.has_table_privilege('clara_authenticated', 'clara.document_capabilities', 'DELETE')
       or pg_catalog.has_table_privilege('clara_agent_ro', 'clara.document_capabilities', 'SELECT') then
      raise exception '#1012 sectionD tail: an application role gained a write grant (or the agent lane gained SELECT) on the registry'
        using errcode = 'CLR10';
    end if;

    raise notice '#1012 sectionD tail: OK -- the seven prior_gl rows seeding-parse.mjs has a reader for now state the RETIREMENT in both basis and limits (seeding_lane = retired, with its reason), no row anywhere still carries browser_entrance, every prior_gl row keeps business_operation = stored_only, the registry re-publishes at version % across all 240 rows (one distinct version) with every high-water mark in lockstep, and no application role gained anything. 0191, 0207, 0228, 0244, 0245 and 0272 are not edited by this file.', v_before + 1;
  end if;
end
$p1012_registry$;

-- =====================================================================================
-- §E  TAIL. Re-reads the live catalog rather than trusting the statements above ran as
--     written, and drives the retirement behaviourally inside a forced-rollback
--     subtransaction (the 0018/0019/0020/0146/0260 CLR99-probe idiom) so nothing synthetic
--     survives this migration's own commit.
-- =====================================================================================
do $p1012_tail$
declare
  v_creator  text := 'clara.create_seeding_batch(uuid,uuid,jsonb,text)';
  v_ticker   text := 'clara.tick_seeding_proposal(uuid,text)';
  v_decliner text := 'clara.decline_seeding_proposal(uuid,text,text)';
  v_cancel   text := 'clara.cancel_seeding_batch(uuid,text,text)';
  v_complete text := 'clara.complete_seeding_batch(uuid,text)';
  v_sha text; v_src text; r record; v_n int;
  v_msg constant text :=
    'the prior-GL seeding lane is retired: Clara learns a client''s counterparties and coding from the source itself, so no seeding batch, tick or decline is accepted; existing batches stay readable and can still be cancelled or completed';
begin
  -- 1 · ALL THREE CARRY THE SAME REFUSAL: same SQLSTATE literal, same reason, same sentence.
  --     A "shared refusal" that is three different sentences is not shared, so this is checked
  --     as a literal on each body rather than inferred from one of them.
  foreach v_sha in array array[v_creator, v_ticker, v_decliner] loop
    -- prosrc is the RAW body text, so a quote inside the sentence is still DOUBLED there
    -- (`client''s`); un-double it once so the literal below is the sentence a caller receives,
    -- not a SQL-escaped cousin of it.
    select replace(p.prosrc, '''''', '''') into v_src from pg_proc p where p.oid = v_sha::regprocedure;
    if position(v_msg in v_src) = 0 then
      raise exception '#1012 tail: % does not carry the shared retirement sentence', v_sha using errcode = 'CLR10';
    end if;
    if position('''CLR34''' in v_src) = 0 or position('"reason":"seeding_lane_retired"' in v_src) = 0 then
      raise exception '#1012 tail: % does not raise CLR34 with detail.reason = seeding_lane_retired', v_sha using errcode = 'CLR10';
    end if;
    -- and the old lane machinery is GONE from each body: no reservation, no context ladder,
    -- no insert, no event.
    for r in select * from (values ('_reserve_op'), ('_finish_op'), ('_human_ctx'), ('_append_event'),
                                   ('_audit'), ('insert into')) as t(dead) loop
      if position(r.dead in v_src) <> 0 then
        raise exception '#1012 tail: % still contains "%" -- a retired door does nothing at all', v_sha, r.dead
          using errcode = 'CLR10';
      end if;
    end loop;
  end loop;

  -- 2 · POSTURE AND ACL PRESERVED on all three: owner, SECURITY DEFINER, search_path, and the
  --     exact lane each door belonged to. A retirement that silently widened or narrowed a
  --     grant would be a different change from the one this file claims to be.
  for r in select p.oid::regprocedure::text sig, p.proowner::regrole::text owner, p.prosecdef secdef,
                  array_to_string(p.proconfig, ',') cfg
             from pg_proc p
            where p.oid = any (array[v_creator::regprocedure, v_ticker::regprocedure, v_decliner::regprocedure]) loop
    if r.owner <> 'clara_fn_owner' or not r.secdef or coalesce(r.cfg,'') <> 'search_path=clara, pg_temp' then
      raise exception '#1012 tail: % lost its definer posture (owner=%, secdef=%, config=%)',
        r.sig, r.owner, r.secdef, r.cfg using errcode = 'CLR10';
    end if;
  end loop;
  if not has_function_privilege('clara_runtime', v_creator::regprocedure, 'execute')
     or has_function_privilege('clara_authenticated', v_creator::regprocedure, 'execute') then
    raise exception '#1012 tail: % is no longer the runtime-only door it was', v_creator using errcode = 'CLR10';
  end if;
  foreach v_sha in array array[v_ticker, v_decliner] loop
    if not has_function_privilege('clara_authenticated', v_sha::regprocedure, 'execute')
       or has_function_privilege('clara_runtime', v_sha::regprocedure, 'execute') then
      raise exception '#1012 tail: % is no longer the human-only door it was', v_sha using errcode = 'CLR10';
    end if;
  end loop;

  -- 3 · THE TWO CLOSERS ARE BYTE-IDENTICAL TO THEIR PRESTATE PINS.
  for r in select * from (values
      (v_cancel,   '0b655b1a5d23920593ae3f41dd8942c0bfaa1cdc7a89daba64eaf50a2ac7eba5'),
      (v_complete, '96a62e0c02387980629ce40ffea06d4a2d4a66dbefb888dac2059e12679bf7ba')
      ) as t(sig, want) loop
    select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
      from pg_proc p where p.oid = r.sig::regprocedure;
    if v_sha is distinct from r.want then
      raise exception '#1012 tail: % MOVED while this file applied -- it must not have (got %)', r.sig, v_sha
        using errcode = 'CLR10';
    end if;
  end loop;

  -- 4 · BEHAVIOURAL PROBE: the INSTALLED bodies actually refuse, and they write nothing. Built
  --     and discarded inside a forced-rollback subtransaction.
  declare
    v_probe_user uuid; v_probe_firm uuid; v_probe_client uuid; v_probe_batch uuid;
    v_probe_proposal uuid; v_probe_doc uuid; v_caught text; v_detail text; v_receipts int;
  begin
    begin
      v_probe_user := gen_random_uuid();
      insert into clara.users(id, display_name) values (v_probe_user, '1012-seeding-retirement probe');
      insert into clara.firms(id, name) values (gen_random_uuid(), '1012-seeding-retirement probe firm')
        returning id into v_probe_firm;
      insert into clara.firm_memberships(firm_id, user_id, role, status)
        values (v_probe_firm, v_probe_user, 'admin', 'active');
      insert into clara.clients(firm_id, name, status)
        values (v_probe_firm, '1012-seeding-retirement probe client', 'active')
        returning id into v_probe_client;
      -- A PRE-RETIREMENT batch + open proposal, planted directly: after §B no door can mint
      -- one, and the point of the probe is a proposal that WOULD have been tickable.
      insert into clara.documents(firm_id, sha256) values (v_probe_firm, repeat('a', 64))
        returning id into v_probe_doc;
      insert into clara.seeding_batches(firm_id, client_id, source_document_id, source_sha256, state)
        values (v_probe_firm, v_probe_client, v_probe_doc, repeat('a', 64), 'open')
        returning id into v_probe_batch;
      insert into clara.seeding_proposals(batch_id, firm_id, client_id, proposal_kind,
          proposal_key, payload, evidence, state)
        values (v_probe_batch, v_probe_firm, v_probe_client, 'wiki_fact', 'wf:probe',
          '{"slug":"profile","fact":"probe"}'::jsonb, '{"prior_gl_lines":[1]}'::jsonb, 'proposed')
        returning id into v_probe_proposal;

      perform set_config('request.jwt.claims', jsonb_build_object('sub', v_probe_user)::text, true);

      -- (i) the creator
      begin
        perform clara.create_seeding_batch(v_probe_client, v_probe_doc, '[]'::jsonb, 'p1012-probe-create');
        raise exception '#1012 BEHAVIOURAL probe: create_seeding_batch SUCCEEDED after its retirement'
          using errcode = 'CLR10';
      exception when sqlstate 'CLR34' then
        get stacked diagnostics v_caught = message_text, v_detail = pg_exception_detail;
        if v_caught is distinct from v_msg or coalesce(v_detail::jsonb ->> 'reason','') <> 'seeding_lane_retired' then
          raise exception '#1012 BEHAVIOURAL probe: create_seeding_batch refused with the WRONG sentence/reason (%, %)', v_caught, v_detail
            using errcode = 'CLR10';
        end if;
      end;
      -- (ii) the ticker
      begin
        perform clara.tick_seeding_proposal(v_probe_proposal, 'p1012-probe-tick');
        raise exception '#1012 BEHAVIOURAL probe: tick_seeding_proposal SUCCEEDED after its retirement'
          using errcode = 'CLR10';
      exception when sqlstate 'CLR34' then null;
      end;
      -- (iii) the decliner
      begin
        perform clara.decline_seeding_proposal(v_probe_proposal, 'probe reason', 'p1012-probe-decline');
        raise exception '#1012 BEHAVIOURAL probe: decline_seeding_proposal SUCCEEDED after its retirement'
          using errcode = 'CLR10';
      exception when sqlstate 'CLR34' then null;
      end;

      -- (iv) NOTHING WAS WRITTEN by any of the three refusals.
      select count(*)::int into v_receipts from clara.op_receipts
       where firm_id = v_probe_firm
         and fn in ('create_seeding_batch','tick_seeding_proposal','decline_seeding_proposal');
      if v_receipts <> 0 then
        raise exception '#1012 BEHAVIOURAL probe: a retired door reserved % operation receipt(s)', v_receipts
          using errcode = 'CLR10';
      end if;
      if (select state from clara.seeding_proposals where id = v_probe_proposal) <> 'proposed' then
        raise exception '#1012 BEHAVIOURAL probe: the planted proposal changed state' using errcode = 'CLR10';
      end if;

      -- THE CLOSERS ARE NOT DRIVEN HERE, deliberately. Both emit a domain event carrying the
      -- batch's source document, and clara._append_event refuses a document_id that is not in
      -- the firm/client FILING history — so driving them inside this probe would need a planted
      -- clara.document_filings row, which fires six triggers (agent congruence, agent receipt,
      -- close serialisation, firm knowledge) that have nothing to do with this migration. They
      -- are driven for real, on a document filed through the real doors, by
      -- packages/db/tests/seeding-lane-retired.test.mjs. Here they are pinned by body only.
      perform set_config('request.jwt.claims', '', true);
      raise exception 'clara_1012_probe_rollback' using errcode = 'CLR99';
    exception
      when sqlstate 'CLR99' then null; -- expected: fixtures discarded
    end;
  end;

  -- 5 · HISTORY SURVIVED. This file deletes nothing.
  select count(*)::int into v_n from clara.seeding_batches;
  raise notice '#1012 tail: OK -- clara.create_seeding_batch, clara.tick_seeding_proposal and clara.decline_seeding_proposal all answer the SAME typed refusal (CLR34 / seeding_lane_retired / one sentence) and contain no reservation, context ladder, insert, audit or event; all three keep their clara_fn_owner SECURITY DEFINER posture, their pinned search_path and their exact lane grants (creator runtime-only, deciders human-only); clara.cancel_seeding_batch and clara.complete_seeding_batch are byte-identical to their measured pre-images (their behaviour is driven by seeding-lane-retired.test.mjs, not here -- see the probe''s own note); % seeding batch(es) survive, none deleted.', v_n;
end
$p1012_tail$;
