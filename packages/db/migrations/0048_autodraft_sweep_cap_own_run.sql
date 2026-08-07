-- 0048_autodraft_sweep_cap_own_run.sql -- known-bug F5: the autodraft sweep's per-firm
-- concurrency cap counts the sweep's OWN open run, so a sweep can refuse work its own
-- presence caused.
--
-- GOVERNING EVIDENCE: .tmp/H2-ACCEPTANCE-REPORT.txt FINDING F5 ("sweep concurrency starves
-- its own queue"), observed live during the §7-A H2 acceptance campaign -- six candidates
-- refused in one pass at 06:06:30 / 06:08:47 / 06:12:48 / 06:58:09-06:58:25 / 07:02:59,
-- recovering only on the 5-minute catch-up sweep (CLARA_AUTODRAFT_CATCHUP_SECONDS=300).
-- Harmless (nothing double-drafts; it is throughput, not a stall) but a firm ingesting a
-- batch looks frozen for minutes at a time. Ledger task #27.
--
-- THE MECHANISM. packages/runtime/lib/autodraft.mjs opens a sweep run via
-- clara.open_sweep_run BEFORE admitting a single item under it -- both admitDocument
-- (autodraft.mjs:79-93, per-document dispatch) and the estate-wide sweep (autodraft.mjs:
-- 269-272) call open_sweep_run first and only then loop clara.admit_autodraft_task calls
-- under the returned run id. So the run's own clara.sweep_runs row is ALREADY state='open'
-- by the time admit_autodraft_task's concurrency-cap query runs inside that very call. That
-- query has always read
--     (select count(*) from clara.sweep_runs where firm_id=f.firm_id and state='open')>=v_cap
-- with no exclusion, so the run counts itself: a firm at max_concurrent_sweeps=1 (schema
-- default is 2) refuses EVERY admission under its own, sole open run, because the count is
-- always >=1 the instant that run exists -- a sweep refusing work its own presence caused.
--
-- THE PINNED TEST, AND ITS RATIONALE (addressed here, not routed around). Before this
-- migration, packages/db/tests/wave-a-budget.test.mjs pinned exactly this shape as the
-- correct one: "concurrent-sweep cap: with max_concurrent_sweeps open runs already OPEN, a
-- sweep admission is refused_budget (bounds overshoot)" -- opening ONE run at cap=1 and
-- admitting UNDER THAT SAME RUN, asserting refused_budget, with the comment "the cap check
-- sees EXACTLY THE ONE open run >= max_concurrent_sweeps" as though that were the intended
-- shape. The REAL safety property that test exists to protect is genuine and is NOT being
-- weakened here: max_concurrent_sweeps bounds how many sweep runs may draw on a firm's
-- shared per-firm resources (the same pg_advisory_xact_lock(202991617,...) budget
-- serialization every path in this function already takes) AT THE SAME TIME. It was never
-- meant to mean "a run may not admit work under itself" -- that reading was the bug, not a
-- documented safety reason to preserve. The shape this migration ships: the cap query now
-- excludes the CALLER's own run (`and id<>p_run_id`), which is unconditionally safe in the
-- sweep branch because the malformed-input guard earlier in this same function ("or
-- (p_origin='sweep' and p_run_id is null)") already refuses CLR10 before this point can ever
-- be reached with p_origin='sweep' and a null p_run_id -- so p_run_id is provably non-null
-- on every path that reaches the exclusion (verified below, both prestate and tail, by
-- reading the guard's own text rather than assuming it). The change is WIDENING ONLY: every
-- call the old guard refused for a reason OTHER than self-count still refuses identically,
-- and the bound itself is unchanged -- a genuinely OTHER already-open run still counts, so a
-- second concurrent sweep at the same cap still refuses. packages/db/tests/wave-a-budget.
-- test.mjs is rewritten alongside this migration to pin BOTH halves: the fix itself (cap=1,
-- no other open run, admit under the caller's sole open run -> 'admitted', never
-- 'refused_budget') and a contrast cell proving the bound survives (cap=1, one OTHER open
-- run left standing, a second run's admission still -> 'refused_budget'/'concurrency').
--
-- PATCHED, NOT REBUILT -- 0046's law (S7.1), and 0036 §E's before it. clara.
-- admit_autodraft_task was already dynamically recut once since its last full CREATE (0036's
-- static rebuild, itself already downstream of 0031/0034): 0046 S7.1 rewrote the
-- sales-direction gate into the tri-state direction contract, widened the registry insert to
-- carry direction/backfill_batch_id, and widened the audit receipt -- all via
-- pg_get_functiondef + a count-guarded replace(), never by re-typing the function. A
-- from-file rebuild here would silently discard every one of those. This migration follows
-- the identical technique, scoped to the ONE two-line predicate the concurrency cap uses --
-- confirmed below (prestate 0.4/0.5, tail) to sit entirely outside every region 0046 touched
-- and to occur exactly once.
--
-- D1 WRITE-QUIESCE (packages/db/README.md:99-118). clara.admit_autodraft_task is the live
-- admission path both the per-document dispatcher and the estate-wide sweep call on every
-- pass. This migration replaces its body, so the repo-mandated D1 obligation applies once
-- this ships to a live runtime: quiesce new admit_autodraft_task-reaching writes (stop new
-- sweep/one-click dispatch, let in-flight admissions drain), apply, resume. The change is
-- strictly WIDENING (see above), so an interleaved apply cannot corrupt in-flight admission
-- -- but the quiesce remains the recorded procedure and this file does not license skipping
-- it. THIS PR DOES NOT DEPLOY OR APPLY ANYTHING LIVE -- the ceremony is a separate, later
-- step, gated on its own review.
--
-- CELLS: packages/db/tests/wave-a-budget.test.mjs -- the own-run-exclusion cell and its
-- contrast cell (both described above). No other test file asserts on the concurrency-cap
-- shape (grepped: wave-a-admission.test.mjs and x34-autodraft-retry-door.test.mjs exercise
-- admit_autodraft_task's other branches and do not touch max_concurrent_sweeps).
set local statement_timeout = '2min';

-- =====================================================================
-- SECTION 0 -- PRESTATE. Every claim made above is measured here, before anything changes.
-- Stashed into a temp table (rather than re-measured from scratch in the tail) so the tail's
-- SECURITY DEFINER / search_path comparison is against what THIS run actually saw, not a
-- fresh assumption -- the same idiom 0047's prestate/tail pairing uses.
-- =====================================================================
create temp table _x48_pre(
  secdef boolean not null,
  config text not null,
  acl    text not null
) on commit drop;

do $prestate$
declare
  v_n int; v_def text; v_count int; v_secdef boolean; v_config text; v_acl text;
  v_anchor text;
begin
  -- (0.1) FRONTIER.
  select count(*) into v_n from clara.schema_migrations
    where version = '0047_settle_guard_identity';
  if v_n <> 1 then
    raise exception '0048 prestate: 0047_settle_guard_identity is not recorded as applied -- apply in order'
      using errcode = 'CLR10';
  end if;

  -- (0.2) EXACTLY ONE admit_autodraft_task overload, at the pinned 5-arity signature.
  select count(*) into v_n from pg_proc p
    where p.pronamespace = 'clara'::regnamespace and p.proname = 'admit_autodraft_task';
  if v_n <> 1 then
    raise exception '0048 prestate: expected exactly ONE clara.admit_autodraft_task overload, found %', v_n
      using errcode = 'CLR10';
  end if;
  perform 'clara.admit_autodraft_task(uuid,text,uuid,text,bigint)'::regprocedure;

  select pg_get_functiondef('clara.admit_autodraft_task(uuid,text,uuid,text,bigint)'::regprocedure)
    into v_def;

  -- (0.3) THE MALFORMED-INPUT GUARD THE FIX RELIES ON MUST BE LIVE, READ POSITIVELY -- the
  -- proof that p_origin='sweep' reaching the concurrency-cap check below already implies
  -- p_run_id is not null, so the exclusion this migration adds can never be a silent no-op
  -- against a null p_run_id, and is never reached with one either.
  if position('or (p_origin=''sweep'' and p_run_id is null)' in v_def) = 0 then
    raise exception '0048 prestate: the sweep-requires-run_id malformed-input guard is missing from the live body -- refusing to add a p_run_id exclusion this file cannot prove is always non-null'
      using errcode = 'CLR10';
  end if;

  -- (0.4) THE 0046 MARKERS THIS PATCH MUST NOT DISTURB -- proves this is the POST-0046 body;
  -- the tail re-reads both unchanged.
  if position('clara._autodraft_direction_tri(' in v_def) = 0
     or position('clara._sales_lane_active(' in v_def) = 0 then
    raise exception '0048 prestate: admit_autodraft_task is missing the 0046 S7.1 tri-state direction markers -- not the post-0046 body this migration accounts for'
      using errcode = 'CLR10';
  end if;

  -- (0.5) THE ANCHOR -- the two-line concurrency-cap predicate -- occurs EXACTLY ONCE.
  v_anchor := '  if p_origin=''sweep'' and (select count(*) from clara.sweep_runs' || chr(10)
    || '      where firm_id=f.firm_id and state=''open'')>=v_cap then';
  v_count := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
  if v_count <> 1 then
    raise exception '0048 prestate: the concurrency-cap anchor occurs % times in the live body (expected 1) -- this is not the body this migration was authored against', v_count
      using errcode = 'CLR10';
  end if;

  -- (0.6) STASH SECURITY DEFINER / search_path / ACL for the tail's byte-identical proof.
  select prosecdef, coalesce(array_to_string(proconfig, '|'), '<none>'),
      coalesce(pg_catalog.array_to_string(proacl, '|'), '<default>')
    into v_secdef, v_config, v_acl
    from pg_proc where oid = 'clara.admit_autodraft_task(uuid,text,uuid,text,bigint)'::regprocedure;
  if not v_secdef then
    raise exception '0048 prestate: clara.admit_autodraft_task is not SECURITY DEFINER -- refusing to re-ship a body whose privilege shape this file does not recognise'
      using errcode = 'CLR10';
  end if;
  if v_config = '<none>' or position('search_path=' in v_config) = 0 then
    raise exception '0048 prestate: clara.admit_autodraft_task carries no pinned search_path (proconfig %)', v_config
      using errcode = 'CLR10';
  end if;
  insert into _x48_pre(secdef, config, acl) values (v_secdef, v_config, v_acl);

  raise notice '0048 prestate: clean (frontier 0047, one admit_autodraft_task overload, sweep/run_id guard present, 0046 markers present, cap anchor occurs exactly once)';
end
$prestate$;

-- =====================================================================
-- SECTION 1 -- THE SPLICE. Harvested from the live catalog, patched, never re-typed (the
-- 0046/0036§E law restated in the header above: re-typing would silently revert 0046 S7.1's
-- three prior edits to this same function).
-- =====================================================================
set role clara_fn_owner;
do $splice$
declare
  v_def text; v_next text; v_anchor text; v_repl text; v_count int;
begin
  select pg_get_functiondef('clara.admit_autodraft_task(uuid,text,uuid,text,bigint)'::regprocedure)
    into v_def;

  v_anchor := '  if p_origin=''sweep'' and (select count(*) from clara.sweep_runs' || chr(10)
    || '      where firm_id=f.firm_id and state=''open'')>=v_cap then';
  v_repl := '  -- [0048 / F5 FIX] EXCLUDE THE CALLER''S OWN OPEN RUN FROM THE CAP COUNT.' || chr(10)
    || '  -- open_sweep_run always opens this run BEFORE any item under it is admitted' || chr(10)
    || '  -- (packages/runtime/lib/autodraft.mjs), so the row THIS very call is running under' || chr(10)
    || '  -- is already state=''open'' when the count below runs. Without the exclusion, a run' || chr(10)
    || '  -- always counts itself, so a firm at max_concurrent_sweeps=1 refuses every' || chr(10)
    || '  -- admission under its own sole open run unconditionally -- a sweep refusing work' || chr(10)
    || '  -- its own presence caused (H2 acceptance FINDING F5).' || chr(10)
    || '  --' || chr(10)
    || '  -- `id<>p_run_id` IS SAFE HERE WITHOUT AN EXTRA NULL GUARD: the malformed-input' || chr(10)
    || '  -- check above (`or (p_origin=''sweep'' and p_run_id is null)`) already refuses' || chr(10)
    || '  -- CLR10 before this point is reached with p_origin=''sweep'' and a null p_run_id,' || chr(10)
    || '  -- so p_run_id is provably non-null on every path that reaches here.' || chr(10)
    || '  --' || chr(10)
    || '  -- THE BOUND ITSELF IS UNCHANGED. A genuinely OTHER already-open run still counts,' || chr(10)
    || '  -- so a second concurrent sweep at the same cap still refuses' || chr(10)
    || '  -- (packages/db/tests/wave-a-budget.test.mjs carries the contrast cell that pins' || chr(10)
    || '  -- exactly that, alongside the own-run-exclusion cell that pins this fix).' || chr(10)
    || '  if p_origin=''sweep'' and (select count(*) from clara.sweep_runs' || chr(10)
    || '      where firm_id=f.firm_id and state=''open'' and id<>p_run_id)>=v_cap then';

  v_count := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
  if v_count <> 1 then
    raise exception '0048 S1: the concurrency-cap anchor occurs % times in the functiondef about to be edited (expected 1)', v_count
      using errcode = 'CLR10';
  end if;
  v_next := replace(v_def, v_anchor, v_repl);
  execute v_next;
  raise notice '0048 S1: admit_autodraft_task recut -- the concurrency cap now excludes the caller''s own open run';
end
$splice$;
reset role;

-- The grant is UNTOUCHED and deliberately not re-issued: CREATE OR REPLACE preserves a
-- function's existing ACL by Postgres's own rule. Section 2 below PROVES that rather than
-- trusting the rule, by comparing proacl before and after.

-- =====================================================================
-- SECTION 2 -- TAIL. Proves the splice landed, landed EXACTLY ONCE, and disturbed nothing
-- else: the old (self-counting) anchor is gone, the new predicate is present exactly once,
-- SECURITY DEFINER / search_path / ACL are byte-identical to the prestate stash, the 0046
-- markers and the sweep/run_id guard this fix relies on both survive unchanged, and the
-- function still has exactly one overload.
-- =====================================================================
do $tail$
declare
  v_def text; v_n int; v_secdef boolean; v_config text; v_acl text; v_pre record;
begin
  select count(*) into v_n from pg_proc p
    where p.pronamespace = 'clara'::regnamespace and p.proname = 'admit_autodraft_task';
  if v_n <> 1 then
    raise exception '0048 tail: expected exactly ONE clara.admit_autodraft_task overload after the splice, found %', v_n;
  end if;

  select pg_get_functiondef('clara.admit_autodraft_task(uuid,text,uuid,text,bigint)'::regprocedure)
    into v_def;

  if position('and id<>p_run_id)>=v_cap then' in v_def) = 0 then
    raise exception '0048 tail: the caller-exclusion predicate is missing from the post-splice body';
  end if;
  -- The OLD, self-counting anchor must be GONE -- not merely superseded in prose beside it.
  if position('where firm_id=f.firm_id and state=''open'')>=v_cap then' in v_def) <> 0 then
    raise exception '0048 tail: the OLD self-counting concurrency-cap predicate is still present in the post-splice body -- the replace did not land cleanly';
  end if;
  -- Exactly one occurrence of the new predicate (a duplicate would mean the replace ran twice
  -- or matched more than the intended anchor).
  if (length(v_def) - length(replace(v_def, 'and id<>p_run_id)>=v_cap then', '')))
      / length('and id<>p_run_id)>=v_cap then') <> 1 then
    raise exception '0048 tail: the new concurrency-cap predicate occurs more than once in the post-splice body';
  end if;

  -- The 0046 markers and the sweep/run_id guard this fix depends on both survive untouched.
  if position('clara._autodraft_direction_tri(' in v_def) = 0
     or position('clara._sales_lane_active(' in v_def) = 0 then
    raise exception '0048 tail: the 0046 S7.1 tri-state direction markers were lost by this splice';
  end if;
  if position('or (p_origin=''sweep'' and p_run_id is null)' in v_def) = 0 then
    raise exception '0048 tail: the sweep-requires-run_id malformed-input guard was lost by this splice';
  end if;

  -- SECURITY DEFINER, the pinned search_path, and the ACL are byte-identical to the
  -- prestate stash -- proven, not assumed.
  select * into v_pre from _x48_pre;
  select prosecdef, coalesce(array_to_string(proconfig, '|'), '<none>'),
      coalesce(pg_catalog.array_to_string(proacl, '|'), '<default>')
    into v_secdef, v_config, v_acl
    from pg_proc where oid = 'clara.admit_autodraft_task(uuid,text,uuid,text,bigint)'::regprocedure;
  if v_secdef is distinct from v_pre.secdef then
    raise exception '0048 tail: SECURITY DEFINER changed by this splice (was %, now %)', v_pre.secdef, v_secdef;
  end if;
  if v_config is distinct from v_pre.config then
    raise exception '0048 tail: proconfig changed by this splice (was %, now %)', v_pre.config, v_config;
  end if;
  if v_acl is distinct from v_pre.acl then
    raise exception '0048 tail: proacl changed by this splice (was %, now %)', v_pre.acl, v_acl;
  end if;

  raise notice '0048 tail: clean -- the caller-exclusion predicate is present exactly once, the old self-counting predicate is gone, the 0046 markers and the sweep/run_id guard survive, SECURITY DEFINER + search_path + ACL are byte-identical to prestate';
end
$tail$;
