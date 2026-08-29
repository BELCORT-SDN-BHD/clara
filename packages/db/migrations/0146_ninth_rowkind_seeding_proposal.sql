-- =====================================================================================
-- 裁-17 (docs/plan/active/mohe-grill-rulings-2026-08-28.md): the firm-level needs-you
-- inbox gains a NINTH clara.list_review_queue row_kind, 'seeding_proposal'. Ruling text:
-- "the inbox row IS wanted. Backend: list_review_queue gains a ninth row_kind
-- seeding_proposal (one batch-level row per client with open proposals, linking into
-- the panel); frontend: a T0-registry affordance entry + the T9 panel as the acting
-- surface." A pre-beta DB tranche item; frontend home named below.
--
-- FRONTEND HOME (db-migrations.md's "a migration adding a clara_authenticated door
-- must name its frontend home" -- this is a live-body RECUT, not a new door, but the
-- same discipline applies to a new READ SHAPE): the needs-you inbox
-- (apps/web/app/(firm)/needs-you/page.tsx, components/firm/needs-you-inbox.tsx) is
-- ALREADY wired to list_review_queue; this migration only widens what it emits. The
-- new row's inline affordance (apps/web/components/firm/needs-you-affordances.tsx,
-- a SeedingProposalAffordance riding the SAME PR) deep-links into T9's
-- SeedingBatchesPanel (apps/web/components/reports/SeedingBatchesPanel.tsx, mounted
-- on the client Reports tab) -- the panel stays the ACTING surface (tick/decline);
-- this row is the inbox BRIDGE into it, per PRD SS5 journey 6.
--
-- THE LIVE DEFINITION OF THIS FUNCTION IS NOT ANY ONE MIGRATION'S TEXT. Created
-- 0011_daily_loop.sql:3748, REPLACED WHOLE by 0016_a21_compliance_watch.sql:4558
-- (compliance_watch, the `compliance` envelope, `coding_kind`), then DYNAMICALLY
-- SPLICED three more times (pg_get_functiondef -> replace() -> execute, never
-- re-typed): 0017_wave_b.sql:512-655 (lint_finding, the `lint` envelope, the
-- active-client guard on all six then-existing CTEs), 0041_wave_d_a_fa_register.sql
-- S4.9 (fixed_asset_incomplete, `asset_id` derived from the shared `id` column at
-- json-build time), 0043_wave_d_b1_staff_advances.sql S3.8 (staff_advance_incomplete,
-- `advance_id`, the SAME derived-from-`id` idiom). This file follows the SAME
-- discipline: read pg_get_functiondef on ITS OWN target, splice, prove both the
-- addition and the survival of all eight prior kinds.
--
-- WHY seeding_proposal CANNOT REUSE THE asset_id/advance_id SHORTCUT: those two keys
-- are derived AT JSON-BUILD TIME from the shared `id` column
-- (`case when p.row_kind='fixed_asset_incomplete' then p.id end`) because their
-- kind's OWN identifying id IS the shared `id` value for that row. This row is
-- BATCH-LEVEL -- one row per CLIENT (id := client_id), aggregating potentially
-- several OPEN seeding_proposals across potentially several OPEN batches -- so it
-- needs THREE independent pieces of data (client_name, batch_ids, open_proposal_count)
-- that cannot be recovered from a single client_id alone. They are therefore real,
-- NEW, DEDICATED columns threaded through every one of the eight pre-existing row
-- CTEs (null there, matching the finding_id precedent 0017 set) and projected
-- directly (never gated by a `case when row_kind=` -- unlike asset_id/advance_id,
-- these are always null except on the one kind that populates them, so no gate is
-- needed).
--
-- WHICH CLIENTS CHASE (a deliberate, reasoned DEVIATION from the active-client-only
-- guard the other eight kinds carry, per 0017's O8.4 note above): clara.create_seeding_batch
-- (0017_wave_b.sql:4339-4343) itself refuses a batch for a client whose status is
-- NOT IN ('active','onboarding') -- seeding is an onboarding-era activity by
-- construction (its source is a filed prior_gl/management_account document). An
-- active-ONLY guard on this new CTE would silently hide from the inbox exactly the
-- onboarding clients this row exists to chase -- the writer door's own admitted set is
-- mirrored here rather than the reader convention above it (hard constraint 1:
-- accounting-correctness precedence -- a reader that contradicts its own writer's
-- admitted set is the defect, not a style choice). An archived client's proposals stop
-- chasing, exactly like every other kind.
--
-- WHICH PROPOSALS CHASE (Codex cross-model review, fec6ab5b, MED-2 -- STRANDED ROWS):
-- an OPEN proposal (state='proposed') whose PARENT BATCH is also still OPEN. A
-- proposal can stay 'proposed' after its batch is completed or cancelled (0017's own
-- WB-R2 landing state: "unticked proposals STAY 'proposed' after completion" --
-- proven at packages/db/tests/wave-b/wb-s-seeding.test.mjs's own S4 cell) and
-- SeedingBatchesPanel.tsx:211 hides the Tick/Decline controls unless the OWNING
-- BATCH is open -- an unfiltered read would show an inbox row whose linked panel has
-- no way to ever settle it. The CTE below therefore joins clara.seeding_batches and
-- requires sb.state='open', so completing or cancelling a batch retires its row from
-- the inbox exactly when the panel retires its own acts (visibility, never blocking
-- -- the SAME symmetry 0041/0043 proved for fixed_asset_incomplete/staff_advance_
-- incomplete).
--
-- SECTION: 'needs_review' unconditionally (section_rank 2, lane NULL) -- the SAME
-- posture 0041/0043 gave fixed_asset_incomplete/staff_advance_incomplete (a human
-- decision pending, never blocking, never high-stakes by construction). `lane` stays
-- NULL so ready/needs_review/needs_you counts are UNTOUCHED by this kind, exactly like
-- those two -- `counts` itself is not touched by this migration at all.
--
-- THE COMPLIANCE AND LINT ENVELOPES ARE UNTOUCHED: this migration adds no new
-- top-level envelope key and no new `counts.*` integer -- only `rows[]` gains entries
-- of the new kind, plus three new (usually-null) per-row keys on every row, matching
-- the finding_id/asset_id/advance_id precedent.
--
-- COMMENT-STRIPPED VERIFICATION (Codex cross-model review, fec6ab5b, HIGH-1): every
-- presence/count assertion below -- the prestate roster, every splice anchor, and the
-- postcheck roster -- runs against a COMMENT-STRIPPED copy of the live body (the
-- 0141/M9 `regexp_replace` idiom: block comments stripped first, then line comments),
-- NEVER against raw prosrc. A raw-text position()/count check cannot tell a marker
-- sitting in real CODE from the identical bytes sitting inside a `/* ... */` or `--`
-- comment -- so a body whose CODE lost an arm while a decoy copy of its marker (or of
-- a splice anchor) sits in a comment would pass every raw-text check while returning
-- the wrong kinds at runtime. Every marker/anchor check below therefore ALSO asserts
-- the RAW-text occurrence count equals the STRIPPED-code occurrence count -- proving
-- no comment-only decoy exists anywhere near it, which is what makes it safe for the
-- actual `replace()` splice calls to keep operating on the raw text (they must, to
-- preserve the real body's real comments byte-for-byte). A text pin -- stripped or
-- not -- still cannot prove the splice changed RUNTIME BEHAVIOUR, which is why the
-- tail below closes with a BEHAVIOURAL postcheck: a real fixture, a real call, a real
-- assertion on the real returned row, built and discarded inside a forced-rollback
-- subtransaction (the 0018/0019/0020 `CLR99`-probe idiom) so nothing synthetic
-- survives past this migration's own commit.
--
-- MEASURED (merge-prep replay, 0001-0146 onto the 0145 frontier): prosrc sha256
-- 74be2568...aaf1cfa (0145 pre-image, unchanged since 0043 -- 0143/0144/0145 never
-- touch this fn) -> dd2dee4f...eac6c8ed (post-splice); owner/ACL byte-identical; a
-- READER (STABLE SECURITY DEFINER) -- no D1 write-quiesce owed.
-- =====================================================================================

set role clara_fn_owner;
-- LOW-5 (Codex cross-model review, fec6ab5b): bound the wait for the catalog lock this
-- DO block's CREATE OR REPLACE will need, so a genuinely stuck concurrent DDL session
-- fails the migration loudly instead of hanging it indefinitely. Precautionary, not
-- load-bearing -- this is a windowless reader recut with no data to migrate.
set local lock_timeout = '5s';

do $ninth_rowkind$
declare
  v_sig text := 'clara.list_review_queue(jsonb,jsonb,integer)';
  v_def text; v_next text; v_code text; v_anchor text; v_repl text;
  v_cnt int; v_n int; v_raw_n int; r record;
  v_pre_owner text; v_pre_acl text; v_post_owner text; v_post_acl text;
  v_pre_sha text; v_post_sha text;
  v_probe_firm uuid; v_probe_user uuid; v_probe_client uuid; v_probe_doc uuid;
  v_probe_batch uuid; v_probe_batch2 uuid; v_probe_result jsonb; v_probe_row jsonb;
begin
  select p.oid::regprocedure::text, pg_get_functiondef(p.oid), p.proowner::regrole::text,
         p.proacl::text, encode(sha256(pg_get_functiondef(p.oid)::bytea),'hex')
    into v_sig, v_def, v_pre_owner, v_pre_acl, v_pre_sha
    from pg_proc p where p.oid = v_sig::regprocedure;
  if v_def is null then
    raise exception 'ninth-rowkind prestate: clara.list_review_queue is GONE' using errcode = 'CLR10';
  end if;
  -- HIGH-1: strip block comments THEN line comments (the 0141/M9 order -- a block
  -- comment must not be allowed to hide a live line-comment marker from the second
  -- pass) into v_code; every roster/anchor CHECK below reads v_code, never v_def.
  v_code := regexp_replace(regexp_replace(v_def, '/\*.*?\*/', '', 'gs'), '--[^\n]*', '', 'g');

  -- PRESTATE (a): idempotency -- this splice has not already landed on this database.
  -- IN CODE: a comment claiming "seeding_proposal" already exists must not short-circuit
  -- a real (re-)apply.
  if position('seeding_proposal' in v_code) <> 0 then
    raise exception 'ninth-rowkind prestate: the queue already projects seeding_proposal -- this splice has already been applied to this database'
      using errcode = 'CLR10';
  end if;

  -- PRESTATE (b): a WITNESS that the live body is the post-0043 body this splice was
  -- derived against -- both-directions proof starts here, before anything is touched.
  -- 'fixed_asset_incomplete'/'staff_advance_incomplete' each land TWICE (their CTE's
  -- own row_kind literal + the json builder's `case when p.row_kind=...` gate); every
  -- other kind below lands once, as its own `'<kind>'::text row_kind` CTE literal.
  -- Each marker is verified TWICE: its count IN CODE must equal `want`, AND its RAW
  -- count must equal its CODE count (HIGH-1 -- a marker present in a comment ONLY, on
  -- top of a real-code occurrence that dropped to zero, would show raw=1/code=0 and
  -- is refused here, not silently accepted).
  for r in select * from (values
      ('fixed_asset_incomplete', 2),
      ('staff_advance_incomplete', 2),
      ($$'draft'::text row_kind$$, 1),
      ($$'uncoded_filing'::text row_kind$$, 1),
      ($$'open_question'::text row_kind$$, 1),
      ($$'coding_task'::text row_kind$$, 1),
      ($$'compliance_watch'::text row_kind$$, 1),
      ($$'lint_finding'::text row_kind$$, 1),
      ('null::uuid finding_id', 7),
      ('lf.id finding_id', 1),
      ('_autodraft_attempt_budget', 1)) as t(marker, want) loop
    v_n := (length(v_code) - length(replace(v_code, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception 'ninth-rowkind prestate: list_review_queue carries the marker "%" % time(s) IN CODE, expected % -- the body drifted or lost a prior splice', r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
    v_raw_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_raw_n <> v_n then
      raise exception 'ninth-rowkind prestate (HIGH-1): marker "%" appears % time(s) in RAW text but % time(s) IN CODE -- % occurrence(s) are hiding inside a comment', r.marker, v_raw_n, v_n, (v_raw_n - v_n)
        using errcode = 'CLR10';
    end if;
  end loop;

  -- =====================================================================
  -- SPLICE (a): extend the shared column vector across all EIGHT pre-existing row
  -- CTEs. All seven non-lint CTEs end their column list with the literal
  -- `null::uuid finding_id` (0017's own anchor, still exact); lint_rows alone ends
  -- with `lf.id finding_id`. Both anchors get the SAME three trailing null columns,
  -- in ONE replace() call each (replace() rewrites every occurrence, which is
  -- exactly wanted here -- the 0017 idiom for a literal repeated identically across
  -- CTEs). Each anchor's occurrence count is verified IN CODE first (HIGH-1), THEN
  -- the actual replace() runs on the RAW text (v_def/v_next) so every real comment in
  -- the installed body survives byte-for-byte.
  -- =====================================================================
  v_anchor := 'null::uuid finding_id';
  v_n := (length(v_code) - length(replace(v_code, v_anchor, ''))) / length(v_anchor);
  v_raw_n := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
  if v_n <> 7 or v_raw_n <> v_n then
    raise exception 'ninth-rowkind splice (a1) prestate: the finding_id anchor appears % time(s) IN CODE / % in RAW text (expected 7/7, HIGH-1 comment-hiding guard)', v_n, v_raw_n
      using errcode = 'CLR10';
  end if;
  v_repl := 'null::uuid finding_id,null::text client_name,null::uuid[] batch_ids,null::int open_proposal_count';
  v_next := replace(v_def, v_anchor, v_repl);
  v_cnt := (length(v_next) - length(v_def)) / (length(v_repl) - length(v_anchor));
  if v_cnt <> 7 then
    raise exception 'ninth-rowkind splice (a1): the null::uuid finding_id anchor rewrote % time(s), expected 7', v_cnt
      using errcode = 'CLR10';
  end if;
  v_code := regexp_replace(regexp_replace(v_next, '/\*.*?\*/', '', 'gs'), '--[^\n]*', '', 'g');

  v_anchor := 'lf.id finding_id';
  v_n := (length(v_code) - length(replace(v_code, v_anchor, ''))) / length(v_anchor);
  v_raw_n := (length(v_next) - length(replace(v_next, v_anchor, ''))) / length(v_anchor);
  if v_n <> 1 or v_raw_n <> v_n then
    raise exception 'ninth-rowkind splice (a2) prestate: the lint_rows finding_id anchor appears % time(s) IN CODE / % in RAW text (expected 1/1, HIGH-1 comment-hiding guard)', v_n, v_raw_n
      using errcode = 'CLR10';
  end if;
  v_repl := 'lf.id finding_id,null::text client_name,null::uuid[] batch_ids,null::int open_proposal_count';
  v_next := replace(v_next, v_anchor, v_repl);
  if position('lf.id finding_id,null::text client_name' in v_next) = 0 then
    raise exception 'ninth-rowkind splice (a2): the lint_rows finding_id anchor did not rewrite'
      using errcode = 'CLR10';
  end if;
  v_code := regexp_replace(regexp_replace(v_next, '/\*.*?\*/', '', 'gs'), '--[^\n]*', '', 'g');

  -- =====================================================================
  -- SPLICE (b): the new seeding_rows CTE + extend the all_rows union. Anchored on
  -- the WHOLE all_rows block (the 0043 S3.8 idiom) so the union list and the CTE
  -- insertion land in one atomic replace(). HIGH-1: the anchor must appear exactly
  -- once IN CODE, AND the raw count must match -- the review's sharpest attack (an
  -- old all_rows block pasted into a comment) is exactly a raw/code count mismatch
  -- here.
  -- =====================================================================
  v_anchor :=
    '  ), all_rows as (' || chr(10) ||
    '    select * from draft_rows union all select * from filing_rows' || chr(10) ||
    '    union all select * from question_rows union all select * from task_rows' || chr(10) ||
    '    union all select * from compliance_rows union all select * from lint_rows' || chr(10) ||
    '    union all select * from fa_rows union all select * from adv_rows' || chr(10) ||
    '  ), keyed as (';
  v_n := (length(v_code) - length(replace(v_code, v_anchor, ''))) / length(v_anchor);
  v_raw_n := (length(v_next) - length(replace(v_next, v_anchor, ''))) / length(v_anchor);
  if v_n <> 1 or v_raw_n <> v_n then
    raise exception 'ninth-rowkind splice (b) prestate: the all_rows union block appears % time(s) IN CODE / % in RAW text (expected 1/1, HIGH-1 comment-hiding guard)', v_n, v_raw_n
      using errcode = 'CLR10';
  end if;
  -- ONE dollar-quoted literal (the 0043 S3.8 idiom for a spliced-in CTE body),
  -- never a chr(10)-joined `||` chain: the wiki-dynamic-sql gate reconstructs a
  -- `||` chain of literals but a chain broken by a bare function call (chr(10))
  -- is NOT a chain of literals and cannot be proven safe by that mechanism --
  -- a single dollar-quoted string is, trivially (it IS the literal).
  v_repl := $seed$  ), seeding_rows as (
    -- 裁-17 (mohe-grill-rulings-2026-08-28.md): SEEDING PROPOSALS CHASE. Clara
    -- proposes vendor_account_rule/counterparty_birth/wiki_fact from a filed
    -- source document (clara.create_seeding_batch, 0017_wave_b.sql); a human
    -- ticks or declines each one in T9's SeedingBatchesPanel
    -- (apps/web/components/reports/SeedingBatchesPanel.tsx). BATCH-LEVEL, not
    -- proposal-level: ONE row per client carrying every OPEN proposal in every
    -- OPEN batch that client owns -- the panel is already the per-batch/per-
    -- proposal surface; this row is the BRIDGE into it (PRD SS5 journey 6),
    -- never a second list. WHICH CLIENTS CHASE: mirrors create_seeding_batch's
    -- own admitted set (active OR onboarding), never the active-only guard the
    -- other eight kinds carry -- see this file's header. WHICH PROPOSALS
    -- CHASE: the seeding_batches join requires sb.state='open' (MED-2) -- a
    -- proposal whose batch was completed or cancelled stops chasing, because
    -- SeedingBatchesPanel.tsx hides its Tick/Decline controls the moment the
    -- owning batch is no longer open.
    select 2 section_rank,'seeding_proposal'::text row_kind,'needs_review'::text section,
      sp.client_id,null::uuid counterparty_id,null::uuid filing_id,null::uuid entry_id,
      null::uuid question_id,null::uuid task_id,null::uuid document_id,null::text lane,
      false auto,false rule_backed,false high_stakes,min(sp.created_at) aged_since,
      null::bigint amount_cents,null::text period,
      format('%s open seeding proposal%s pending review',count(*),
        case when count(*)=1 then '' else 's' end) question_text,
      min(sp.created_at) created_at,sp.client_id id,''::text vendor_group,
      null::text coding_kind,null::uuid watch_id,null::text tier,null::uuid finding_id,
      cl.name client_name,array_agg(distinct sp.batch_id order by sp.batch_id) batch_ids,
      count(*)::int open_proposal_count
    from clara.seeding_proposals sp
    join clara.seeding_batches sb on sb.id=sp.batch_id and sb.state='open'
    join clara.clients cl on cl.id=sp.client_id and cl.status in ('active','onboarding')
    where sp.firm_id=c.firm and sp.state='proposed'
      and (v_client is null or sp.client_id=v_client)
    group by sp.client_id,cl.name
  ), all_rows as (
    select * from draft_rows union all select * from filing_rows
    union all select * from question_rows union all select * from task_rows
    union all select * from compliance_rows union all select * from lint_rows
    union all select * from fa_rows union all select * from adv_rows
    union all select * from seeding_rows
  ), keyed as ($seed$;
  v_next := replace(v_next, v_anchor, v_repl);
  if position('union all select * from seeding_rows' in v_next) = 0
     or position('seeding_rows as (' in v_next) = 0
     or position('join clara.seeding_batches sb on sb.id=sp.batch_id and sb.state=''open''' in v_next) = 0 then
    raise exception 'ninth-rowkind splice (b): the seeding_rows CTE / union extension (incl. the MED-2 open-batch join) did not land'
      using errcode = 'CLR10';
  end if;
  v_code := regexp_replace(regexp_replace(v_next, '/\*.*?\*/', '', 'gs'), '--[^\n]*', '', 'g');

  -- =====================================================================
  -- SPLICE (c): the row-json builder gains three keys, always present (usually
  -- null, matching finding_id's own posture) rather than gated by a `case when
  -- row_kind=` -- unlike asset_id/advance_id, these three cannot be derived from
  -- the shared `id` column, so they ride their OWN dedicated columns from (a)/(b)
  -- above and are projected directly.
  -- =====================================================================
  v_anchor := $$'autodraft',clara._autodraft_attempt_budget(p.filing_id))$$;
  v_n := (length(v_code) - length(replace(v_code, v_anchor, ''))) / length(v_anchor);
  v_raw_n := (length(v_next) - length(replace(v_next, v_anchor, ''))) / length(v_anchor);
  if v_n <> 1 or v_raw_n <> v_n then
    raise exception 'ninth-rowkind splice (c) prestate: the autodraft json-builder anchor appears % time(s) IN CODE / % in RAW text (expected 1/1, HIGH-1 comment-hiding guard)', v_n, v_raw_n
      using errcode = 'CLR10';
  end if;
  v_repl := $$'autodraft',clara._autodraft_attempt_budget(p.filing_id),'client_name',p.client_name,'batch_ids',to_jsonb(p.batch_ids),'open_proposal_count',p.open_proposal_count)$$;
  v_next := replace(v_next, v_anchor, v_repl);
  if position('''open_proposal_count'',p.open_proposal_count)' in v_next) = 0 then
    raise exception 'ninth-rowkind splice (c): the row-json builder extension did not land'
      using errcode = 'CLR10';
  end if;

  if v_next = v_def then
    raise exception 'ninth-rowkind splice: no byte moved -- refusing a no-op apply' using errcode = 'CLR10';
  end if;

  execute v_next;

  -- =====================================================================
  -- POSTCHECK, both directions: the new kind actually landed, AND every one of the
  -- eight pre-existing kinds' own markers survived at their EXACT pre-splice counts
  -- (a splice that dropped or duplicated one would still pass a presence-only check).
  -- HIGH-1: every check below runs against v_code (comment-stripped), with the same
  -- raw-vs-code cross-check as the prestate.
  -- =====================================================================
  select p.oid::regprocedure::text, pg_get_functiondef(p.oid), p.proowner::regrole::text,
         p.proacl::text, encode(sha256(pg_get_functiondef(p.oid)::bytea),'hex')
    into v_sig, v_def, v_post_owner, v_post_acl, v_post_sha
    from pg_proc p where p.oid = v_sig::regprocedure;
  v_code := regexp_replace(regexp_replace(v_def, '/\*.*?\*/', '', 'gs'), '--[^\n]*', '', 'g');

  if position('''seeding_proposal''::text row_kind' in v_code) = 0 then
    raise exception 'ninth-rowkind postcheck: seeding_proposal row_kind literal did not land IN CODE' using errcode = 'CLR10';
  end if;
  if position('cl.name client_name' in v_code) = 0
     or position('array_agg(distinct sp.batch_id order by sp.batch_id) batch_ids' in v_code) = 0
     or position('count(*)::int open_proposal_count' in v_code) = 0
     or position('''client_name'',p.client_name' in v_code) = 0
     or position('''batch_ids'',to_jsonb(p.batch_ids)' in v_code) = 0
     or position('''open_proposal_count'',p.open_proposal_count' in v_code) = 0 then
    raise exception 'ninth-rowkind postcheck: the new columns/json keys did not fully land IN CODE' using errcode = 'CLR10';
  end if;
  if position('join clara.clients cl on cl.id=sp.client_id and cl.status in (''active'',''onboarding'')' in v_code) = 0 then
    raise exception 'ninth-rowkind postcheck: the writer-mirrored active/onboarding guard did not land IN CODE' using errcode = 'CLR10';
  end if;
  if position('join clara.seeding_batches sb on sb.id=sp.batch_id and sb.state=''open''' in v_code) = 0 then
    raise exception 'ninth-rowkind postcheck (MED-2): the open-batch join did not land IN CODE' using errcode = 'CLR10';
  end if;

  -- EVERY PRE-EXISTING KIND SURVIVES AT ITS EXACT PRE-SPLICE COUNT, IN CODE -- the
  -- both-directions half of the proof. finding_id's two anchors now carry the
  -- extra trailing columns too, so their marker text changes shape; re-derive
  -- their SURVIVAL from the narrower `finding_id` token count instead (still 8:
  -- one per pre-existing CTE, unchanged by this splice) plus the row_kind-literal
  -- roster, which is untouched byte-for-byte.
  for r in select * from (values
      ('fixed_asset_incomplete', 2),
      ('staff_advance_incomplete', 2),
      ($$'draft'::text row_kind$$, 1),
      ($$'uncoded_filing'::text row_kind$$, 1),
      ($$'open_question'::text row_kind$$, 1),
      ($$'coding_task'::text row_kind$$, 1),
      ($$'compliance_watch'::text row_kind$$, 1),
      ($$'lint_finding'::text row_kind$$, 1),
      ('_autodraft_attempt_budget', 1)) as t(marker, want) loop
    v_n := (length(v_code) - length(replace(v_code, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception 'ninth-rowkind postcheck: marker "%" is now % IN CODE (expected %) -- a pre-existing kind was dropped or duplicated', r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
    v_raw_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_raw_n <> v_n then
      raise exception 'ninth-rowkind postcheck (HIGH-1): marker "%" appears % time(s) in RAW text but % time(s) IN CODE post-splice -- % occurrence(s) are hiding inside a comment', r.marker, v_raw_n, v_n, (v_raw_n - v_n)
        using errcode = 'CLR10';
    end if;
  end loop;
  -- finding_id itself: the literal text moved (`null::uuid finding_id,null::text
  -- client_name...`) but the bare `null::uuid finding_id` anchor still occurs once
  -- per pre-existing CTE (7) PLUS once more in seeding_rows' own copy -- 8 total.
  v_n := (length(v_code) - length(replace(v_code, 'null::uuid finding_id', ''))) / length('null::uuid finding_id');
  if v_n <> 8 then
    raise exception 'ninth-rowkind postcheck: null::uuid finding_id now occurs % time(s) IN CODE, expected 8 (the 7 pre-existing CTEs + this migration''s own seeding_rows)', v_n
      using errcode = 'CLR10';
  end if;
  v_n := (length(v_code) - length(replace(v_code, 'lf.id finding_id', ''))) / length('lf.id finding_id');
  if v_n <> 1 then
    raise exception 'ninth-rowkind postcheck: lf.id finding_id now occurs % time(s) IN CODE, expected 1 (lint_rows, untouched)', v_n
      using errcode = 'CLR10';
  end if;

  -- ACL / OWNER / SECURITY byte-unchanged (a live body REPLACEMENT, never a
  -- re-grant): this is a READER, so it carries no D1 write-quiesce obligation, but
  -- the ACL-preservation proof still applies -- the "or replace" recut of a
  -- function never touches an existing function's ACL, and this asserts that
  -- stays true.
  if v_post_owner <> v_pre_owner then
    raise exception 'ninth-rowkind postcheck: owner changed % -> %', v_pre_owner, v_post_owner using errcode = 'CLR10';
  end if;
  if v_post_acl is distinct from v_pre_acl then
    raise exception 'ninth-rowkind postcheck: ACL changed % -> %', v_pre_acl, v_post_acl using errcode = 'CLR10';
  end if;
  if v_post_sha = v_pre_sha then
    raise exception 'ninth-rowkind postcheck: prosrc sha256 did not change -- the splice was a no-op' using errcode = 'CLR10';
  end if;

  -- =====================================================================
  -- BEHAVIOURAL POSTCHECK (Codex cross-model review, fec6ab5b, HIGH-1): a text pin --
  -- stripped or not -- proves the SPLICE landed; it cannot prove the INSTALLED
  -- FUNCTION actually returns the new kind at runtime. Only execution can. Build a
  -- throwaway fixture (firm/user/membership/client/document/two OPEN batches/three
  -- proposals -- one per batch left open, one pre-decided so MED-2's join is also
  -- exercised positively), simulate that user's JWT via a LOCAL (transaction/
  -- subtransaction-scoped) request.jwt.claims GUC, call the INSTALLED
  -- clara.list_review_queue for real, and assert a row_kind='seeding_proposal' row
  -- for that client comes back with the right shape -- then force the subtransaction
  -- to unwind (the 0018/0019/0020 CLR99-probe idiom) so NONE of the fixture rows (or
  -- the local GUC) survive past this block. The probe sees the SPLICED body because
  -- `execute v_next` above already ran IN THIS SAME transaction (the runner wraps the
  -- whole file in one) -- not because anything has committed; the splice and this
  -- probe's forced rollback both commit together as one unit when the file finishes.
  -- =====================================================================
  begin
    v_probe_user := gen_random_uuid();
    insert into clara.users(id, display_name) values (v_probe_user, 'ninth-rowkind probe');
    insert into clara.firms(id, name) values (gen_random_uuid(), 'ninth-rowkind probe firm')
      returning id into v_probe_firm;
    insert into clara.firm_memberships(firm_id, user_id, role, status)
      values (v_probe_firm, v_probe_user, 'viewer', 'active');
    insert into clara.clients(firm_id, name, status)
      values (v_probe_firm, 'ninth-rowkind probe client', 'active') returning id into v_probe_client;
    -- clara.documents carries no client_id at this frontier (attribution lives on
    -- document_filings, not on the document itself) -- firm_id + sha256 only.
    insert into clara.documents(firm_id, sha256, status)
      values (v_probe_firm, repeat('a', 64), 'ingested') returning id into v_probe_doc;
    -- batch 1: OPEN, one OPEN proposal -- the positive case.
    insert into clara.seeding_batches(firm_id, client_id, source_document_id, source_sha256, state)
      values (v_probe_firm, v_probe_client, v_probe_doc, repeat('a', 64), 'open')
      returning id into v_probe_batch;
    insert into clara.seeding_proposals(batch_id, firm_id, client_id, proposal_kind, proposal_key, payload, evidence, state)
      values (v_probe_batch, v_probe_firm, v_probe_client, 'wiki_fact', 'ninth-rowkind:open',
        '{"slug":"probe","fact":"probe"}'::jsonb, '{}'::jsonb, 'proposed');
    -- batch 2: CANCELLED, one proposal STILL 'proposed' (WB-R2's own landing state) --
    -- MED-2's stranded-row case, proven NOT to count here.
    insert into clara.documents(firm_id, sha256, status)
      values (v_probe_firm, repeat('b', 64), 'ingested') returning id into v_probe_doc;
    insert into clara.seeding_batches(firm_id, client_id, source_document_id, source_sha256, state,
        cancelled_at, cancelled_by, cancel_reason)
      values (v_probe_firm, v_probe_client, v_probe_doc, repeat('b', 64), 'cancelled',
        now(), v_probe_user, 'ninth-rowkind probe cancel')
      returning id into v_probe_batch2;
    insert into clara.seeding_proposals(batch_id, firm_id, client_id, proposal_kind, proposal_key, payload, evidence, state)
      values (v_probe_batch2, v_probe_firm, v_probe_client, 'wiki_fact', 'ninth-rowkind:cancelled',
        '{"slug":"probe2","fact":"probe2"}'::jsonb, '{}'::jsonb, 'proposed');

    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_probe_user)::text, true);
    v_probe_result := clara.list_review_queue(jsonb_build_object('client_id', v_probe_client), null, 50);
    perform set_config('request.jwt.claims', '', true);

    select rw into v_probe_row from jsonb_array_elements(v_probe_result -> 'rows') rw
      where rw ->> 'row_kind' = 'seeding_proposal' limit 1;
    if v_probe_row is null then
      raise exception 'ninth-rowkind BEHAVIOURAL postcheck: no seeding_proposal row returned for a client with a real OPEN proposal in a real OPEN batch -- the splice did not actually change runtime behaviour'
        using errcode = 'CLR10';
    end if;
    if (v_probe_row ->> 'client_id')::uuid <> v_probe_client then
      raise exception 'ninth-rowkind BEHAVIOURAL postcheck: the returned row names the wrong client_id (got %)', v_probe_row ->> 'client_id'
        using errcode = 'CLR10';
    end if;
    if (v_probe_row ->> 'open_proposal_count')::int <> 1 then
      raise exception 'ninth-rowkind BEHAVIOURAL postcheck (MED-2): open_proposal_count is % (expected 1 -- the cancelled batch''s STILL-proposed proposal must NOT count)', v_probe_row ->> 'open_proposal_count'
        using errcode = 'CLR10';
    end if;
    if v_probe_row ->> 'client_name' <> 'ninth-rowkind probe client' then
      raise exception 'ninth-rowkind BEHAVIOURAL postcheck: client_name is wrong (got %)', v_probe_row ->> 'client_name'
        using errcode = 'CLR10';
    end if;
    if jsonb_typeof(v_probe_row -> 'batch_ids') <> 'array'
       or jsonb_array_length(v_probe_row -> 'batch_ids') <> 1
       or (v_probe_row -> 'batch_ids' -> 0)::text <> to_jsonb(v_probe_batch)::text then
      raise exception 'ninth-rowkind BEHAVIOURAL postcheck (MED-2): batch_ids is wrong (got %, expected exactly the OPEN batch %)', v_probe_row -> 'batch_ids', v_probe_batch
        using errcode = 'CLR10';
    end if;

    -- Force the subtransaction to unwind so no fixture row (and no local GUC change)
    -- commits -- the 0018/0019/0020 idiom, verbatim.
    raise exception 'clara_ninth_rowkind_probe_rollback' using errcode = 'CLR99';
  exception
    when sqlstate 'CLR99' then null;  -- expected: fixtures discarded
  end;

  raise notice 'ninth-rowkind (裁-17) OK: clara.list_review_queue gains row_kind=''seeding_proposal'' (batch-level, one row per client with >=1 OPEN seeding_proposals IN AN OPEN BATCH -- MED-2''s join, client_name/batch_ids/open_proposal_count new+null-elsewhere, aged_since/created_at = oldest open proposal, guard mirrors create_seeding_batch''s own active-or-onboarding admitted set, section always needs_review/lane NULL so ready/needs_review/needs_you counts are untouched); the eight pre-existing row kinds (draft, uncoded_filing, open_question, coding_task, compliance_watch, lint_finding, fixed_asset_incomplete, staff_advance_incomplete) survive at their EXACT pre-splice marker counts, verified IN CODE with a raw-vs-code cross-check at every marker (HIGH-1); the compliance/lint envelopes and counts{} are BYTE-UNTOUCHED (no key added, no key removed); owner (%) and ACL (%) are byte-unchanged; a BEHAVIOURAL probe (built and discarded in a forced-rollback subtransaction) proved the installed function actually returns the new row for a real open proposal in a real open batch, and does NOT count a stranded proposal whose batch was cancelled; this is a READER (STABLE SECURITY DEFINER, no table write) so no D1 write-quiesce is owed. prosrc sha256: % -> %.', v_post_owner, v_post_acl, v_pre_sha, v_post_sha;
end
$ninth_rowkind$;

reset role;
