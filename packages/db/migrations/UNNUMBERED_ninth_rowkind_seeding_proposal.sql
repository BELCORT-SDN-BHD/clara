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
-- several OPEN seeding_proposals across potentially several open batches -- so it
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
-- =====================================================================================

set role clara_fn_owner;

do $ninth_rowkind$
declare
  v_sig text := 'clara.list_review_queue(jsonb,jsonb,integer)';
  v_def text; v_next text; v_anchor text; v_repl text; v_cnt int; v_n int; r record;
  v_pre_owner text; v_pre_acl text; v_post_owner text; v_post_acl text;
  v_pre_sha text; v_post_sha text;
begin
  select p.oid::regprocedure::text, pg_get_functiondef(p.oid), p.proowner::regrole::text,
         p.proacl::text, encode(sha256(pg_get_functiondef(p.oid)::bytea),'hex')
    into v_sig, v_def, v_pre_owner, v_pre_acl, v_pre_sha
    from pg_proc p where p.oid = v_sig::regprocedure;
  if v_def is null then
    raise exception 'ninth-rowkind prestate: clara.list_review_queue is GONE' using errcode = 'CLR10';
  end if;

  -- PRESTATE (a): idempotency -- this splice has not already landed on this database.
  if position('seeding_proposal' in v_def) <> 0 then
    raise exception 'ninth-rowkind prestate: the queue already projects seeding_proposal -- this splice has already been applied to this database'
      using errcode = 'CLR10';
  end if;

  -- PRESTATE (b): a WITNESS that the live body is the post-0043 body this splice was
  -- derived against -- both-directions proof starts here, before anything is touched.
  -- 'fixed_asset_incomplete'/'staff_advance_incomplete' each land TWICE (their CTE's
  -- own row_kind literal + the json builder's `case when p.row_kind=...` gate); every
  -- other kind below lands once, as its own `'<kind>'::text row_kind` CTE literal.
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
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception 'ninth-rowkind prestate: list_review_queue carries the marker "%" % time(s), expected % -- the body drifted or lost a prior splice', r.marker, v_n, r.want
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
  -- CTEs).
  -- =====================================================================
  v_anchor := 'null::uuid finding_id';
  v_repl := 'null::uuid finding_id,null::text client_name,null::uuid[] batch_ids,null::int open_proposal_count';
  v_next := replace(v_def, v_anchor, v_repl);
  v_cnt := (length(v_next) - length(v_def)) / (length(v_repl) - length(v_anchor));
  if v_cnt <> 7 then
    raise exception 'ninth-rowkind splice (a1): the null::uuid finding_id anchor rewrote % time(s), expected 7', v_cnt
      using errcode = 'CLR10';
  end if;

  v_anchor := 'lf.id finding_id';
  v_repl := 'lf.id finding_id,null::text client_name,null::uuid[] batch_ids,null::int open_proposal_count';
  v_next := replace(v_next, v_anchor, v_repl);
  if position('lf.id finding_id,null::text client_name' in v_next) = 0 then
    raise exception 'ninth-rowkind splice (a2): the lint_rows finding_id anchor did not rewrite'
      using errcode = 'CLR10';
  end if;

  -- =====================================================================
  -- SPLICE (b): the new seeding_rows CTE + extend the all_rows union. Anchored on
  -- the WHOLE all_rows block (the 0043 S3.8 idiom) so the union list and the CTE
  -- insertion land in one atomic replace().
  -- =====================================================================
  v_anchor :=
    '  ), all_rows as (' || chr(10) ||
    '    select * from draft_rows union all select * from filing_rows' || chr(10) ||
    '    union all select * from question_rows union all select * from task_rows' || chr(10) ||
    '    union all select * from compliance_rows union all select * from lint_rows' || chr(10) ||
    '    union all select * from fa_rows union all select * from adv_rows' || chr(10) ||
    '  ), keyed as (';
  v_cnt := (length(v_next) - length(replace(v_next, v_anchor, ''))) / length(v_anchor);
  if v_cnt <> 1 then
    raise exception 'ninth-rowkind splice (b) prestate: the all_rows union block appears % time(s) (expected 1)', v_cnt
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
    -- proposal-level: ONE row per client carrying every OPEN proposal
    -- (state='proposed') across every batch that client owns -- the panel is
    -- already the per-batch/per-proposal surface; this row is the BRIDGE into
    -- it (PRD SS5 journey 6), never a second list. WHICH CLIENTS CHASE: mirrors
    -- create_seeding_batch's own admitted set (active OR onboarding), never the
    -- active-only guard the other eight kinds carry -- see this file's header.
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
     or position('seeding_rows as (' in v_next) = 0 then
    raise exception 'ninth-rowkind splice (b): the seeding_rows CTE / union extension did not land'
      using errcode = 'CLR10';
  end if;

  -- =====================================================================
  -- SPLICE (c): the row-json builder gains three keys, always present (usually
  -- null, matching finding_id's own posture) rather than gated by a `case when
  -- row_kind=` -- unlike asset_id/advance_id, these three cannot be derived from
  -- the shared `id` column, so they ride their OWN dedicated columns from (a)/(b)
  -- above and are projected directly.
  -- =====================================================================
  v_anchor := $$'autodraft',clara._autodraft_attempt_budget(p.filing_id))$$;
  v_cnt := (length(v_next) - length(replace(v_next, v_anchor, ''))) / length(v_anchor);
  if v_cnt <> 1 then
    raise exception 'ninth-rowkind splice (c) prestate: the autodraft json-builder anchor appears % time(s) (expected 1)', v_cnt
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
  -- =====================================================================
  select p.oid::regprocedure::text, pg_get_functiondef(p.oid), p.proowner::regrole::text,
         p.proacl::text, encode(sha256(pg_get_functiondef(p.oid)::bytea),'hex')
    into v_sig, v_def, v_post_owner, v_post_acl, v_post_sha
    from pg_proc p where p.oid = v_sig::regprocedure;

  if position('''seeding_proposal''::text row_kind' in v_def) = 0 then
    raise exception 'ninth-rowkind postcheck: seeding_proposal row_kind literal did not land' using errcode = 'CLR10';
  end if;
  if position('cl.name client_name' in v_def) = 0
     or position('array_agg(distinct sp.batch_id order by sp.batch_id) batch_ids' in v_def) = 0
     or position('count(*)::int open_proposal_count' in v_def) = 0
     or position('''client_name'',p.client_name' in v_def) = 0
     or position('''batch_ids'',to_jsonb(p.batch_ids)' in v_def) = 0
     or position('''open_proposal_count'',p.open_proposal_count' in v_def) = 0 then
    raise exception 'ninth-rowkind postcheck: the new columns/json keys did not fully land' using errcode = 'CLR10';
  end if;
  if position('join clara.clients cl on cl.id=sp.client_id and cl.status in (''active'',''onboarding'')' in v_def) = 0 then
    raise exception 'ninth-rowkind postcheck: the writer-mirrored active/onboarding guard did not land' using errcode = 'CLR10';
  end if;

  -- EVERY PRE-EXISTING KIND SURVIVES AT ITS EXACT PRE-SPLICE COUNT -- the
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
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception 'ninth-rowkind postcheck: marker "%" is now % (expected %) -- a pre-existing kind was dropped or duplicated', r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;
  -- finding_id itself: 8 CTEs now each carry exactly one `finding_id` token in
  -- their column list (the literal text moved -- `null::uuid finding_id,null::text
  -- client_name...` and `lf.id finding_id,null::text client_name...` -- but the
  -- bare token `finding_id` as a column NAME still occurs once per producing CTE,
  -- plus once more in seeding_rows' own null::uuid finding_id, plus once in the
  -- json builder's own 'finding_id',p.finding_id key -- 8 (CTEs) + 1 (json key) = 9
  -- times as the exact substring 'finding_id,' immediately followed by the next
  -- column, OR verified simpler: both original anchors are proven present above,
  -- and the seeding_rows CTE supplies the ninth `null::uuid finding_id` occurrence
  -- of the ORIGINAL anchor text, so the total must now read 8.
  v_n := (length(v_def) - length(replace(v_def, 'null::uuid finding_id', ''))) / length('null::uuid finding_id');
  if v_n <> 8 then
    raise exception 'ninth-rowkind postcheck: null::uuid finding_id now occurs % time(s), expected 8 (the 7 pre-existing CTEs + this migration''s own seeding_rows)', v_n
      using errcode = 'CLR10';
  end if;
  v_n := (length(v_def) - length(replace(v_def, 'lf.id finding_id', ''))) / length('lf.id finding_id');
  if v_n <> 1 then
    raise exception 'ninth-rowkind postcheck: lf.id finding_id now occurs % time(s), expected 1 (lint_rows, untouched)', v_n
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

  raise notice 'ninth-rowkind (裁-17) OK: clara.list_review_queue gains row_kind=''seeding_proposal'' (batch-level, one row per client with >=1 OPEN seeding_proposals, client_name/batch_ids/open_proposal_count new+null-elsewhere, aged_since/created_at = oldest open proposal, guard mirrors create_seeding_batch''s own active-or-onboarding admitted set, section always needs_review/lane NULL so ready/needs_review/needs_you counts are untouched); the eight pre-existing row kinds (draft, uncoded_filing, open_question, coding_task, compliance_watch, lint_finding, fixed_asset_incomplete, staff_advance_incomplete) survive at their EXACT pre-splice marker counts; the compliance/lint envelopes and counts{} are BYTE-UNTOUCHED (no key added, no key removed); owner (%) and ACL (%) are byte-unchanged; this is a READER (STABLE SECURITY DEFINER, no table write) so no D1 write-quiesce is owed. prosrc sha256: % -> %.', v_post_owner, v_post_acl, v_pre_sha, v_post_sha;
end
$ninth_rowkind$;

reset role;
