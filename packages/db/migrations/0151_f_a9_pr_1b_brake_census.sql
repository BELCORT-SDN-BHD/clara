-- 0151_f_a9_pr_1b_brake_census.sql -- Wave-F Track A, F-A9 PR-1B:
-- THE BRAKE CENSUS'S DB HALF. The unattended lane's spend brakes are REMOVED, the
-- engine-protective concurrency floor is KEPT and its refusal string RENAMED off the
-- one it shared with two spend caps, and `clara.firm_limits`' three now-dead cap columns
-- are disposed -- in that order, in one file, under ONE D1 write-quiesce window.
--
-- Authored UNNUMBERED; the number 0151 was CLAIMED at merge preparation 2026-08-30 (behind
-- 0148 the dup-open wall · 0149 裁-19's read layer · 0150 the COA template; standing law,
-- AGENTS.md + .claude/rules/db-migrations.md). Nothing in this file or in the battery
-- keys on the number -- the prestate pins every live body it replaces by prosrc SHA-256
-- and the battery gates on the migration STEM (`f_a9_pr_1b_brake_census`). The body is
-- byte-identical to the reviewed tip 42d201a8 (independent review CLEAR, 2026-08-30).
--
-- LAW OF RECORD. Digest law 76 / SS9 -- "meter, never cap": per-call usage is RECORDED,
-- and a spend-shaped brake on a professional's own work is not the product's to hold.
-- Digest law 81 (the same sitting's rider). Law 6 -- reverse-not-delete/append-only:
-- every historical `refused_budget` row KEEPS its string forever; the new value is
-- EXTEND-ONLY and applies to future rows alone. Law 22 -- a visible record must not lie:
-- once the two spend caps retire, every future refusal on this path is a concurrency
-- refusal, so it stops sharing the budget spelling. Ruled TA-P12 = A (the brake census)
-- at the 2026-08-22 Track-A sitting (record `docs/adr/0074-the-track-a-sitting.md`,
-- member tables `docs/plan/active/track-a-sitting-3.md`), with the 2026-08-23 owner
-- rulings on gates 6/7 folded into the design's own brake table.
--
-- SPEC OF RECORD. `docs/plan/active/metering-design.md` SS3.3 (gates 3,4,5,7) + SS3.4 +
-- SS5's PR-1B row; `docs/plan/active/metering-survey.md` SSA.5-SSA.7 (the byte-level
-- derivation) and SSC (the roster consequence); `docs/plan/active/metering-annexes.md`
-- Annex B.1 step 3 + B.2 (the D1 body list) + Annex C cells C.10-C.13, C.22, C.23.
--
-- =====================================================================================
-- WHAT THIS FILE DOES -- FIVE live bodies, then TWO DDL changes, in a load-bearing order
-- =====================================================================================
-- (1) `clara.admit_autodraft_task(uuid,text,uuid,text,bigint)` -- EIGHT splices (A1..A8):
--     * gate 5 REMOVE (the 15-drafts/day sales quota): the shared select at the head of
--       the sales branch is REWRITTEN to load `sales_admission_watermark` alone, and the
--       cap count + its `refused_budget`/`refused_sales_cap` refusal is REMOVED. The
--       7A-R5 backfill-batch door between them (`sales_backlog_held`) is UNTOUCHED, and
--       the tail proves its survival byte-for-byte rather than assuming it.
--     * gate 3 REMOVE (the 60%/100% token budget): the shared select that loaded
--       `daily_token_limit` + `sweep_budget_share` is REWRITTEN to load
--       `max_concurrent_sweeps` alone -- the KEPT concurrency check reads it -- the
--       `firm_usage_daily` FOR UPDATE budget read is REMOVED, and the refusal block goes.
--       The `insert into clara.firm_usage_daily ... on conflict do nothing` STAYS: the
--       admitted path's own reserve UPDATE needs that row (design SS3.9 -- PR-1B stops
--       READING the old ledger for budget purposes; PR-4 stops writing it).
--     * gate 4 KEEP + RENAME: the concurrency bound is byte-unchanged; only the outcome
--       and reason strings move `refused_budget` -> `refused_concurrency`.
--     * one comment splice: the receipt comment enumerating the `sweep_run_items.outcome`
--       CHECK is trued (it was already missing 0108's `posted`, and this file adds a
--       seventh value -- a comment that mis-states the constraint it cites is exactly the
--       thing SS3.3's rename exists to stop).
-- (2) `clara._reserve_processing_call(uuid,integer)` -- gate 7 REMOVE. Its own author
--     calls the budget the firm's vendor spend (`0038:7056-7058`), so law 76 reaches it.
--     The lane predicate, the advisory rung and the reservation INSERT all stay: what is
--     removed is the BRAKE, never the METER.
-- (3) `clara._settle_processing_call(uuid,integer)` -- GATE 7'S BACK HALF. **NOT NAMED BY
--     THE DESIGN, AND THE MEASUREMENT SAYS IT MUST BE HERE.** It enforces the IDENTICAL
--     `firm_document_limits.pages_per_day` budget over the IDENTICAL two-table UTC-day
--     sum. Removing the reserve-side check alone does not remove the brake -- it RELOCATES
--     it to settle time, i.e. AFTER the vendor pages were already bought, turning a
--     pre-flight refusal into a stranded reservation. That is worse than either state, so
--     gate 7's REMOVE takes both arms or neither. See THE CENSUS GAP, below.
-- (4) `clara.reconcile_sweep_runs()` -- the `refused_count` bucket learns the new value.
--     **ALSO NOT NAMED BY THE DESIGN.** It buckets `outcome in ('refused_budget',
--     'refused_attempts')`; without this splice every future concurrency refusal would
--     fall into NO counter and a finalized run would under-total against its
--     `expected_count` -- a renamed string silently deleting rows from a visible summary
--     (law 22, in the very file that exists to serve it).
-- (5) `clara.open_sales_backfill(uuid,integer,text,text)` -- COMMENT ONLY, behaviour
--     byte-identical. Its comment tells an operator that
--     `firm_limits.sales_admission_daily_cap` "still governs how fast this batch actually
--     moves" and to "raise the cap, not the batch, to go faster". This file DROPS that
--     column. The comment is trued to the survey's own honest-cost sentence: an open
--     batch is now bounded only by its `batch_size`.
-- (6) DDL 1 -- `clara.sweep_run_items.outcome`'s CHECK, drop+add, EXTEND-ONLY: the six
--     values it admits today all still pass, plus `refused_concurrency`. ACCESS
--     EXCLUSIVE, validates trivially (the prestate proves no row already claims it).
-- (7) DDL 2 -- `alter table clara.firm_limits drop column daily_token_limit,
--     sweep_budget_share, sales_admission_daily_cap`. Ordered LAST, after every body above
--     is already recut. Their single-column CHECKs (`firm_limits_daily_token_limit_check`,
--     `ck_firm_limits_sweep_budget_share`, `ck_firm_limits_sales_admission_daily_cap`)
--     FALL WITH THEIR COLUMNS -- there is no separate DROP CONSTRAINT, which would raise
--     "constraint ... does not exist".
--
--     THE ORDERING IS PRECAUTIONARY, NOT LOAD-BEARING, and saying which is the point
--     (`.claude/rules/db-migrations.md`). PL/pgSQL is late-bound, so a stranded read of a
--     dropped column would pass a migration and die on the first real call -- that hazard
--     is real and is why the order reads this way. But it is NOT what catches the mistake
--     here: hoisting DDL 2 above the recuts was run as a mutant and STILL SUCCEEDED, for
--     exactly the late-binding reason. **The real wall is SS8.4's whole-catalog census**,
--     which fails the migration if ANY clara function still names one of the three columns
--     in executable text, whatever order the statements ran in. Keep the order (it costs
--     nothing and matches how a reader reasons); do not mistake it for the guard.
--
-- THE CENSUS GAP THIS FILE CLOSES, stated plainly because it widens the D1 list.
-- The design (v2) and the survey both derive gate 7 from `_reserve_processing_call`
-- alone and both call the census closed-world. Measured against the LIVE catalog at the
-- 0147 frontier, `firm_document_limits.pages_per_day` is enforced by FIVE bodies:
--   * `_reserve_document_ingest`  -- gate 6, KEEP (engine protection, owner-ruled)
--   * `_resize_document_reservation`, `_settle_document_reservation`
--                                 -- gate 6's own family, same KEPT budget, UNTOUCHED
--   * `_reserve_processing_call`  -- gate 7, REMOVE (named by the design)
--   * `_settle_processing_call`   -- gate 7's back half, NOT named by the design
-- The two document-ingest siblings are consistent with gate 6's KEEP and are left alone.
-- `_settle_processing_call` is not: leaving it is the half-removal described in (3).
-- **If the conductor or the owner rules the settle arm out of PR-1B's scope, SS3 is the
-- one section to drop** -- it is deliberately self-contained, with its own prestate pin,
-- its own splices and its own tail arm.
--
-- WHAT IS DELIBERATELY *NOT* IN THIS FILE, each for a stated reason:
--   * GATE 6 IS UNTOUCHED (`clara._reserve_document_ingest`). Owner-ruled KEEP,
--     re-classified ENGINE PROTECTION 2026-08-23. **AND ITS "MANDATORY RENAME" HAS NO
--     SUBJECT AT THE BYTES**: measured, that body raises CLR18 with a message and writes
--     NO `outcome` string anywhere -- exactly like gate 8, which the design itself
--     exempts for that reason. There is nothing named `refused_budget` in it to rename.
--     Reported rather than invented; no splice is made on a premise that is false.
--   * GATE 8 IS UNTOUCHED (`clara.claim_document_processing_task`) -- KEEP, no string.
--   * GATE 2 IS UNTOUCHED (`clara.begin_chat_turn`) -- KEEP, and gate 1 already shipped
--     in F-A9 PR-0 (`0105`).
--   * NO CONCURRENCY BOUND MOVES. 3 runs / 2 sweeps / 2 OCR / 2 llm_witness are all
--     unchanged; only the unattended lane's refusal STRING moves.
--   * `clara.readmit_autodraft_after_withdrawal` IS UNTOUCHED. It mentions
--     `refused_budget` only inside a comment that QUOTES admit's own reasoning, and it
--     branches on an ADMITTING allowlist (`admitted`/`re_admitted`/
--     `re_admitted_after_withdrawal`), never on a refusal spelling -- so
--     `refused_concurrency` lands in its non-admitting arm correctly, by construction.
--     Measured, not assumed; the tail re-reads that allowlist.
--   * `clara.settle_autodraft_task` (both overloads) IS UNTOUCHED. Measured: neither
--     overload ever emits `refused_budget` -- their item outcomes are drafted / posted /
--     noop_existing / skipped_lane / refused_attempts.
--   * `clara.settle_chat_turn` IS UNTOUCHED -- PR-4's body, with the two table drops.
--   * NO ROW OF ANY TABLE IS INSERTED, UPDATED OR DELETED by this file. Every existing
--     `sweep_run_items.outcome='refused_budget'` row is left exactly as it is (law 6),
--     and the tail proves the count and the checksum of that population unmoved.
--   * NOTHING IN `workflow` / `graphile_worker` / `spike` IS TOUCHED (constraint 15).
--
-- SPLICED, NOT RETYPED, AND PROVEN BY RE-SUBSTITUTION. Every recut is
-- `pg_get_functiondef` -> exact `replace()` calls -> `execute`. Each anchor's occurrence
-- count is asserted BEFORE the splice (two would splice both, zero would splice nothing
-- while this file reported success), and the TAIL runs the INVERSE substitution on the
-- new prosrc and asserts it reproduces the pinned pre-image SHA-256 BYTE FOR BYTE. That
-- is what makes "nothing else moved" a measurement instead of a hope: a single stray
-- character anywhere in the 33kB `admit_autodraft_task` body would break the round trip.
--
-- PRESTATE PIN. Every body is pinned by the SHA-256 of its whole prosrc, measured on a
-- fresh rig at the 0147 frontier (`pnpm db:migrate` + `pnpm db:seed`), never read out of
-- migration text. `clara.admit_autodraft_task` in particular is a SEVEN-generation,
-- FOUR-times-dynamically-spliced body (0011 create -> 0031 -> 0034 -> 0036 full recreate
-- -> 0046 -> 0048 -> 0053; `0117` deliberately does NOT replace it), so its true tip is a
-- rig-replay fact and every line number any design cites for it is a prediction. A sha
-- mismatch means the body moved for a reason this file does not know about, and the
-- ceremony stops rather than splicing against a premise that is no longer true.
--
-- THE ROSTER. S5.25 arm (D)'s census (`packages/db/tests/x42-s5-helpers.mjs`) MEASURES,
-- from the live catalog, every `clara` function whose body reads a bare clock token, and
-- compares it to a roster as an exact set equality IN BOTH DIRECTIONS. Removing gate 7's
-- budget block takes the last two `now()` reads out of `clara._reserve_processing_call`,
-- so the roster must lose that name in this same PR, REVERSE-gated on this file's stem
-- (never its number) so `db-slice-frontiers`' legs pinned at earlier frontiers stay
-- green. `clara._settle_processing_call` STAYS on the roster (`settled_at=now()` in its
-- UPDATE) and so does `clara.admit_autodraft_task` (`v_today`'s remaining uses on the
-- reserve write and the `autodraft_attempts.usage_date` insert). All three facts are
-- MEASURED by the tail with the census's own detector expression, not predicted.
--
-- THE REST OF THIS PR (named so a reader of the migration alone is not misled about its
-- blast radius):
--   * `packages/db/tests/x42-s5-helpers.mjs` -- the roster edit above;
--   * eleven test files repaired (the survey's eight, plus `rig-runtime-metering.test.mjs`
--     C.9 -> C.9b, `f-a2-posted-chain.test.mjs` and `packages/runtime/tests/
--     admission.test.mjs`, all three of which write a column this file drops and none of
--     which the survey's re-scoped table names);
--   * `packages/db/tests/f-a9-pr-1b.test.mjs` -- the battery (C.10-C.13, C.22, C.23 plus
--     this file's own mutant panel);
--   * `packages/db/deploy/autopost-lane-unify-0031-postverify.sql` -- 0031's ceremony
--     postverify requires TWO `outcome','refused_budget` returns in admit's refusal
--     slice; succession-gated on this file's stem so it stays true on both sides.
-- The dashboard/apps-web rename surface is PR-1C's and is deliberately NOT here.

-- NO `statement_timeout` IS SET, AND THE OMISSION IS DELIBERATE, NOT FORGOTTEN
-- (`.claude/rules/db-migrations.md`: say which). Nothing here is a heavy pass: five
-- CREATE OR REPLACE FUNCTIONs touch no rows at all, and the two DDL statements are a
-- CHECK drop+add plus a three-column DROP on `clara.firm_limits` -- a table with at most
-- one row per firm. The CHECK swap's validation scan is over `sweep_run_items`, which the
-- prestate counts and reports, and it runs inside the D1 write-quiesce window this file's
-- own SS0.0 guard enforces, so there is no concurrent writer for its ACCESS EXCLUSIVE to
-- queue behind. This is the same shape `0108` used for the same swap on the same table,
-- also without a timeout. If a future estate makes `sweep_run_items` large enough for the
-- scan to matter, that is the line to revisit -- add the timeout, do not drop the guard.
--
-- =====================================================================================
-- SS0.0 QUIESCE GUARD (D1) -- refuse to replace live writer bodies under a live runtime
-- =====================================================================================
do $fa9b_quiesce$
declare v_component text; v_beat timestamptz;
begin
  if to_regclass('clara.runtime_heartbeats') is null then
    raise exception 'F-A9 PR-1B QUIESCE GUARD: clara.runtime_heartbeats is ABSENT -- the catalog has drifted from the migration chain (0006 creates it); refuse rather than guess whether a runtime is live'
      using errcode='CLR10';
  end if;
  select h.component, h.beat_at into v_component, v_beat from clara.runtime_heartbeats h
   where h.beat_at > now() - interval '90 seconds' order by h.beat_at desc limit 1;
  if v_component is not null then
    raise exception 'F-A9 PR-1B QUIESCE GUARD: a runtime heartbeat is fresh (component %, beat_at %) -- this file replaces FIVE live bodies including clara.admit_autodraft_task (the unattended admission hot path) and both processing-call reservation verbs, and an in-flight call finishes on the OLD body (D1); stop clara-runtime, wait for staleness (>90s), and re-apply',
      v_component, v_beat
      using errcode='CLR10';
  end if;
end
$fa9b_quiesce$;

-- =====================================================================================
-- SS0.1 PRESTATE -- every claim this file makes about what it is editing, measured
-- =====================================================================================
do $fa9b_pre$
declare
  v_src text; v_def text; v_sha text; v_n int; v_owner text; v_acl text; v_cfg text[];
  v_sig text; v_anchor text; v_i int;
  v_sigs text[] := array[
    'clara.admit_autodraft_task(uuid,text,uuid,text,bigint)',
    'clara._reserve_processing_call(uuid,integer)',
    'clara._settle_processing_call(uuid,integer)',
    'clara.reconcile_sweep_runs()',
    'clara.open_sales_backfill(uuid,integer,text,text)'
  ];
  v_names text[] := array[
    'admit_autodraft_task','_reserve_processing_call','_settle_processing_call',
    'reconcile_sweep_runs','open_sales_backfill'
  ];
  v_shas text[] := array[
    '5f63c4d5bc3e42fc18a883acd98b7f7dc71e67023d716873de82892797a986d9',
    '4efc855175aaae20a0b18abca48959c6f662893feee7ec9fa7c4e8c144e572cc',
    'bef44e7a9bfc7ab227215a4761250d7eb4b54775630c680a8c195e283ea6ca03',
    'deee8835c7899648bf4cae0045ba8a5a8071b11ff76ada709ef99ea36649a5ce',
    'c3b0c15c5c3b28584aa3f2c49395c37b1733f51fbb7b7737e4a1a785cfeb79ed'
  ];
begin
  -- (0.1) EACH TARGET EXISTS, EXACTLY ONCE, AND IS THE PINNED BODY. A prior recut that
  -- CREATEd an overload rather than REPLACING the live body would leave the old shape
  -- reachable (the 0054:132-146 lesson) and this file would fix one of two live gates.
  create temporary table fa9b_pre (name text primary key, sig text, sha text,
    pre_owner text, acl text, cfg text[], prosrc text) on commit drop;
  for v_i in 1 .. array_length(v_sigs,1) loop
    v_sig := v_sigs[v_i];
    begin
      perform v_sig::regprocedure;
    exception when others then
      raise exception 'F-A9 PR-1B prestate: % does not exist -- the estate is not at the frontier this file was measured against', v_sig using errcode='CLR10';
    end;
    select count(*)::int into v_n from pg_proc p
     where p.pronamespace='clara'::regnamespace and p.proname=v_names[v_i];
    if v_n <> 1 then
      raise exception 'F-A9 PR-1B prestate: expected exactly 1 body named clara.%, found % -- an overload this file does not know about would keep a spliced gate reachable', v_names[v_i], v_n using errcode='CLR10';
    end if;
    select p.prosrc, pg_get_userbyid(p.proowner), coalesce(p.proacl::text,'(null)'), p.proconfig
      into v_src, v_owner, v_acl, v_cfg
      from pg_proc p where p.oid=v_sig::regprocedure;
    v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
    if v_sha <> v_shas[v_i] then
      raise exception 'F-A9 PR-1B prestate: % prosrc sha256 mismatch (got %, expected %) -- this is NOT the body the splice anchors below were verified against. Either a migration this file does not know about re-cut it, or it moved for some other reason. STOP; do not re-cut against a wrong premise', v_sig, v_sha, v_shas[v_i] using errcode='CLR10';
    end if;
    if v_owner <> 'clara_fn_owner' then
      raise exception 'F-A9 PR-1B prestate: % is owned by % (expected clara_fn_owner) -- a SECURITY DEFINER body running as an unexpected role is not a premise this file will splice against', v_sig, v_owner using errcode='CLR10';
    end if;
    insert into fa9b_pre(name,sig,sha,pre_owner,acl,cfg,prosrc)
      values(v_names[v_i], v_sig, v_sha, v_owner, v_acl, v_cfg, v_src);
  end loop;

  -- (0.2) NOT ALREADY APPLIED. Checked BEFORE anything else that could produce a
  -- confusing diagnosis: a re-run would fail the sha pins too, and "sha mismatch" is the
  -- wrong thing to hand an operator who simply ran the ceremony twice.
  select prosrc into v_src from fa9b_pre where name='admit_autodraft_task';
  if position('daily_token_limit' in v_src) = 0 then
    raise exception 'F-A9 PR-1B prestate: clara.admit_autodraft_task no longer reads daily_token_limit -- the brake census looks ALREADY APPLIED (or the body moved); refuse rather than splice a body this file does not recognise' using errcode='CLR10';
  end if;
  if exists(select 1 from pg_constraint c
             where c.conrelid='clara.sweep_run_items'::regclass
               and c.conname='sweep_run_items_outcome_check'
               and pg_get_constraintdef(c.oid) like '%refused_concurrency%') then
    raise exception 'F-A9 PR-1B prestate: the outcome CHECK already admits refused_concurrency -- ALREADY APPLIED' using errcode='CLR10';
  end if;

  -- (0.3) THE THREE COLUMNS DDL 2 DROPS ALL EXIST, and the five that must SURVIVE it do
  -- too. A drop of a column that is already gone would abort; a survivor silently missing
  -- would mean the table is not the shape SS3.4 was written against.
  foreach v_anchor in array array['daily_token_limit','sweep_budget_share','sales_admission_daily_cap'] loop
    if not exists(select 1 from information_schema.columns
        where table_schema='clara' and table_name='firm_limits' and column_name=v_anchor) then
      raise exception 'F-A9 PR-1B prestate: clara.firm_limits.% is already absent -- DDL 2 would abort', v_anchor using errcode='CLR10';
    end if;
  end loop;
  foreach v_anchor in array array['firm_id','max_concurrent_runs','max_concurrent_sweeps','sales_lane_active','sales_admission_watermark','updated_at'] loop
    if not exists(select 1 from information_schema.columns
        where table_schema='clara' and table_name='firm_limits' and column_name=v_anchor) then
      raise exception 'F-A9 PR-1B prestate: clara.firm_limits.% is MISSING -- this file must not drop columns from a table it does not recognise', v_anchor using errcode='CLR10';
    end if;
  end loop;

  -- (0.4) THE OUTCOME CHECK IS THE 0108 SIX-VALUE ENUMERATION, PINNED AS TEXT, and no row
  -- already claims the new value (so the drop+add validates trivially).
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
   where c.conrelid='clara.sweep_run_items'::regclass and c.conname='sweep_run_items_outcome_check';
  if v_def is distinct from 'CHECK ((outcome = ANY (ARRAY[''drafted''::text, ''skipped_lane''::text, ''refused_budget''::text, ''refused_attempts''::text, ''noop_existing''::text, ''posted''::text])))' then
    raise exception 'F-A9 PR-1B prestate: sweep_run_items_outcome_check is not 0108''s six-value enumeration: %', v_def using errcode='CLR10';
  end if;
  select count(*)::int into v_n from clara.sweep_run_items where outcome='refused_concurrency';
  if v_n <> 0 then
    raise exception 'F-A9 PR-1B prestate: % sweep_run_items row(s) already carry outcome=refused_concurrency', v_n using errcode='CLR10';
  end if;

  -- (0.5) THE HISTORY POPULATION, captured so the tail's law-6 proof is a differential
  -- against a measured prestate rather than a self-referential read of this file's own
  -- output. Both the COUNT and a checksum over the PRIMARY KEY (run_id,filing_id -- this
  -- table has no surrogate id): a same-size population with different members would pass
  -- a count alone.
  -- ...and the WHOLE-CATALOG shape, because this file creates and drops NO function and NO
  -- relation: it re-cuts five existing bodies, swaps one CHECK and drops three columns. A
  -- moved count in the tail would mean a CREATE OR REPLACE landed as an overload (a new
  -- oid) or that a drop cascaded further than SS3.4 says. Signatures, not bare names: an
  -- overload is exactly the failure this census exists to catch (law 3).
  create temporary table fa9b_pre_hist (k text primary key, v text) on commit drop;
  insert into fa9b_pre_hist(k,v) values
    ('clara_functions', (select count(*)::text from pg_proc p
                          where p.pronamespace='clara'::regnamespace)),
    ('clara_fn_sig_ck', (select md5(string_agg(p.oid::regprocedure::text, ',' order by p.oid::regprocedure::text))
                           from pg_proc p where p.pronamespace='clara'::regnamespace)),
    ('clara_relations', (select count(*)::text from pg_class c
                          where c.relnamespace='clara'::regnamespace and c.relkind in ('r','v','m','p'))),
    ('refused_budget_rows', (select count(*)::text from clara.sweep_run_items where outcome='refused_budget')),
    ('refused_budget_ck',   (select coalesce(md5(string_agg(run_id::text||'/'||filing_id::text,',' order by run_id,filing_id)),'(empty)')
                               from clara.sweep_run_items where outcome='refused_budget')),
    ('all_items',           (select count(*)::text from clara.sweep_run_items)),
    ('all_items_ck',        (select coalesce(md5(string_agg(run_id::text||'/'||filing_id::text||'|'||outcome,',' order by run_id,filing_id)),'(empty)')
                               from clara.sweep_run_items));

  raise notice 'F-A9 PR-1B prestate: clean -- five live bodies pinned by prosrc sha at the 0147-measured frontier, all owned by clara_fn_owner; firm_limits carries the three doomed columns and the six survivors; the outcome CHECK is 0108''s six-value enumeration with 0 rows already claiming refused_concurrency; % existing sweep_run_items row(s), % of them refused_budget (checksum %); whole-catalog baseline: % clara function(s) (signature checksum %) over % relation(s).',
    (select v from fa9b_pre_hist where k='all_items'),
    (select v from fa9b_pre_hist where k='refused_budget_rows'),
    (select v from fa9b_pre_hist where k='refused_budget_ck'),
    (select v from fa9b_pre_hist where k='clara_functions'),
    (select v from fa9b_pre_hist where k='clara_fn_sig_ck'),
    (select v from fa9b_pre_hist where k='clara_relations');
end
$fa9b_pre$;

-- =====================================================================================
-- SS0.2 ANCHOR CENSUS -- every splice anchor occurs EXACTLY ONCE, counted before any cut
-- =====================================================================================
-- Held in a temp table so SS1-SS5 splice from the SAME strings the census counted: an
-- anchor retyped between the count and the cut would make the count meaningless.
create temporary table fa9b_anchors (id text primary key, target text, old text, new text) on commit drop;

insert into fa9b_anchors(id,target,old,new) values

-- ------------------------------------------------------------------ admit, splice A1
('A1','clara.admit_autodraft_task(uuid,text,uuid,text,bigint)',
$old$  v_op_key text; v_limit bigint; v_used bigint; v_share numeric; v_cap int;
$old$,
$new$  v_op_key text; v_cap int;
$new$),

-- ------------------------------------------------------------------ admit, splice A2
('A2','clara.admit_autodraft_task(uuid,text,uuid,text,bigint)',
$old$  v_cap_sales int; v_used_sales int;
$old$,
$new$  -- v_cap_sales / v_used_sales died with the 15-drafts/day sales quota (F-A9 PR-1B,
  -- design SS3.3 gate 5). Their only reads were the removed cap count below.
$new$),

-- ------------------------------------------------------------------ admit, splice A3
('A3','clara.admit_autodraft_task(uuid,text,uuid,text,bigint)',
$old$    select fl.sales_admission_watermark,coalesce(fl.sales_admission_daily_cap,15)
      into v_wm,v_cap_sales from clara.firm_limits fl where fl.firm_id=f.firm_id;
    v_cap_sales:=coalesce(v_cap_sales,15);
$old$,
$new$    -- REWRITTEN, NOT DELETED (F-A9 PR-1B, design SS3.3 gate 5). This one select used to
    -- load BOTH the watermark and coalesce(sales_admission_daily_cap,15). The 7A-R5
    -- backfill door immediately below still reads v_wm, and the same migration DROPS
    -- sales_admission_daily_cap -- PL/pgSQL is late-bound, so leaving the dead column in
    -- this select would pass the migration and then raise `column ... does not exist` on
    -- the FIRST sales-direction admission after the window.
    select fl.sales_admission_watermark
      into v_wm from clara.firm_limits fl where fl.firm_id=f.firm_id;
$new$),

-- ------------------------------------------------------------------ admit, splice A4
('A4','clara.admit_autodraft_task(uuid,text,uuid,text,bigint)',
$old$    select count(*)::int into v_used_sales from clara.autodraft_attempts aa
      where aa.firm_id=f.firm_id and aa.usage_date=v_today and aa.direction='sales'
        and aa.filing_id<>p_filing;
    if v_used_sales>=v_cap_sales then
      if p_run_id is not null then
        insert into clara.sweep_run_items(run_id,filing_id,firm_id,client_id,document_id,
            outcome,refusal_token)
          values(p_run_id,p_filing,f.firm_id,f.client_id,f.document_id,'refused_budget',
            jsonb_build_object('clr','CLR29','reason','refused_sales_cap',
              'gate','sales_daily_cap','cap',v_cap_sales,'used',v_used_sales))
          on conflict do nothing;
      end if;
      return jsonb_build_object('outcome','refused_budget','reason','refused_sales_cap',
        'cap',v_cap_sales,'used',v_used_sales);
    end if;
$old$,
$new$    -- NO SALES DAILY QUOTA HERE, AND ITS ABSENCE IS DELIBERATE (F-A9 PR-1B; digest law
    -- 76 / SS9 "meter, never cap"; owner ruling TA-P12 = A, 2026-08-22 Track-A sitting).
    -- A 15-drafts/day cap used to refuse here with outcome 'refused_budget' / reason
    -- 'refused_sales_cap'. It is GONE: a spend-shaped throttle on a professional's own
    -- backlog is not the product's to hold. THE HONEST COST, recorded rather than implied
    -- (survey SSA.5(5)): that cap was the ONLY per-day pacing an already-open backfill
    -- batch had, so an open batch is now bounded only by its own batch_size (1..500).
    -- Size the batch for the pace you want. The 7A-R5 backfill door above is untouched:
    -- it decides WHETHER a backlogged filing may be admitted at all, which is a
    -- governance question, not a spend one.
$new$),

-- ------------------------------------------------------------------ admit, splice A5
('A5','clara.admit_autodraft_task(uuid,text,uuid,text,bigint)',
$old$  select coalesce(fl.daily_token_limit,1000000),fl.sweep_budget_share,
      fl.max_concurrent_sweeps into v_limit,v_share,v_cap
    from clara.firms z left join clara.firm_limits fl on fl.firm_id=z.id
    where z.id=f.firm_id;
  v_share:=coalesce(v_share,0.60); v_cap:=coalesce(v_cap,2);
  insert into clara.firm_usage_daily(firm_id,usage_date,tokens_used)
    values(f.firm_id,v_today,0) on conflict(firm_id,usage_date) do nothing;
  select tokens_used into v_used from clara.firm_usage_daily
    where firm_id=f.firm_id and usage_date=v_today for update;
$old$,
$new$  -- REWRITTEN, NOT DELETED (F-A9 PR-1B, design SS3.3 gate 3). This select used to load
  -- daily_token_limit and sweep_budget_share alongside max_concurrent_sweeps; the first
  -- two are dropped by this same migration and the KEPT concurrency check below reads
  -- v_cap, so the select is narrowed rather than removed.
  select fl.max_concurrent_sweeps into v_cap
    from clara.firms z left join clara.firm_limits fl on fl.firm_id=z.id
    where z.id=f.firm_id;
  v_cap:=coalesce(v_cap,2);
  -- THE METER STAYS, THE BRAKE GOES. The FOR UPDATE read of firm_usage_daily.tokens_used
  -- that fed the removed budget test is gone with it, but this INSERT is NOT: the
  -- admitted path below still increments that row (design SS3.9 -- PR-1B stops READING the
  -- Slice-4 ledger for budget purposes; PR-4, its own reviewed migration, stops writing
  -- it and drops the tables).
  insert into clara.firm_usage_daily(firm_id,usage_date,tokens_used)
    values(f.firm_id,v_today,0) on conflict(firm_id,usage_date) do nothing;
$new$),

-- ------------------------------------------------------------------ admit, splice A6
-- Gate 3 REMOVE. Spliced BEFORE A7 so A7's rename anchor is unambiguous by construction
-- as well as by count -- the two blocks are adjacent and share their closing lines.
('A6','clara.admit_autodraft_task(uuid,text,uuid,text,bigint)',
$old$  if (p_origin='sweep' and v_used+p_reserve_tokens>(v_limit*v_share)::bigint)
     or (p_origin='one_click' and v_used+p_reserve_tokens>v_limit) then
    if p_run_id is not null then
      insert into clara.sweep_run_items(run_id,filing_id,firm_id,client_id,document_id,
          outcome,refusal_token)
        values(p_run_id,p_filing,f.firm_id,f.client_id,f.document_id,'refused_budget',
          jsonb_build_object('clr','CLR29','reason','refused_budget'))
        on conflict do nothing;
    end if;
    return jsonb_build_object('outcome','refused_budget','reason','refused_budget');
  end if;
$old$,
$new$  -- NO TOKEN-BUDGET REFUSAL HERE, AND ITS ABSENCE IS DELIBERATE (F-A9 PR-1B; digest law
  -- 76 / SS9 "meter, never cap"; owner ruling TA-P12 = A, 2026-08-22 Track-A sitting).
  -- This body used to refuse a sweep admission past sweep_budget_share (60%) of the
  -- firm's daily_token_limit, and a one_click admission past 100% of it. Both are GONE,
  -- along with the two columns they read. Usage is still RECORDED on the admitted path
  -- below and in clara.llm_usage_events (F-A9 PR-1A) -- the meter stays, the brake does
  -- not. The only refusal left on this path is the CONCURRENCY floor above, which is
  -- engine protection (law 76's own carve-out), not spend, and which is why its outcome
  -- string no longer spells itself 'refused_budget'.
$new$),

-- ------------------------------------------------------------------ admit, splice A7
('A7','clara.admit_autodraft_task(uuid,text,uuid,text,bigint)',
$old$        values(p_run_id,p_filing,f.firm_id,f.client_id,f.document_id,'refused_budget',
          jsonb_build_object('clr','CLR29','reason','refused_budget','gate','concurrency'))
        on conflict do nothing;
    end if;
    return jsonb_build_object('outcome','refused_budget','reason','refused_budget');
  end if;
$old$,
$new$        values(p_run_id,p_filing,f.firm_id,f.client_id,f.document_id,'refused_concurrency',
          jsonb_build_object('clr','CLR29','reason','refused_concurrency','gate','concurrency'))
        on conflict do nothing;
    end if;
    return jsonb_build_object('outcome','refused_concurrency','reason','refused_concurrency');
  end if;
$new$),

-- ------------------------------------------------------------------ admit, splice A8
-- The receipt comment cites the outcome CHECK's enumeration. It was already missing
-- 0108's 'posted'; this file adds a seventh value. A comment that mis-states the
-- constraint it names is the same defect class SS3.3's rename exists to close.
('A8','clara.admit_autodraft_task(uuid,text,uuid,text,bigint)',
$old$  -- clara.sweep_run_items.outcome is a CHECK-constrained enum
  -- ('drafted','skipped_lane','refused_budget','refused_attempts','noop_existing'), so
$old$,
$new$  -- clara.sweep_run_items.outcome is a CHECK-constrained enum ('drafted','skipped_lane',
  -- 'refused_budget','refused_attempts','noop_existing','posted' [0108],
  -- 'refused_concurrency' [F-A9 PR-1B]), so
$new$),

-- ------------------------------------------------------- _reserve_processing_call, R1
('R1','clara._reserve_processing_call(uuid,integer)',
$old$declare t record; v_limit int; v_used bigint; v_id uuid;
$old$,
$new$declare t record; v_id uuid;
$new$),

-- ------------------------------------------------------- _reserve_processing_call, R2
('R2','clara._reserve_processing_call(uuid,integer)',
$old$  -- 0038 (design 4.3): the statement OCR lane joins the page budget. The local statement parse
  -- deliberately does NOT -- it buys nothing, so charging it would misstate the firm's vendor
  -- spend.
$old$,
$new$  -- 0038 (design 4.3), re-cut at F-A9 PR-1B: the statement OCR lane is METERED here. The
  -- local statement parse deliberately is NOT -- it buys nothing, so recording a vendor
  -- page against it would misstate the firm's spend. The predicate below is therefore an
  -- identity gate on what counts as a metered call, never a budget.
$new$),

-- ------------------------------------------------------- _reserve_processing_call, R3
('R3','clara._reserve_processing_call(uuid,integer)',
$old$  select coalesce(l.pages_per_day,1000) into v_limit from clara.firms f
    left join clara.firm_document_limits l on l.firm_id=f.id where f.id=t.firm_id;
  select coalesce(sum(pages),0) into v_used from (
    select case when state='settled' then settled_pages else pages_reserved end::bigint as pages
    from clara.document_ingest_reservations
    where firm_id=t.firm_id and state<>'refunded'
      and created_at >= (date_trunc('day',now() at time zone 'utc') at time zone 'utc')
    union all
    select case when state='settled' then settled_pages else pages_reserved end::bigint
    from clara.processing_call_reservations
    where firm_id=t.firm_id and state<>'refunded'
      and created_at >= (date_trunc('day',now() at time zone 'utc') at time zone 'utc')
  ) q;
  if v_used + p_pages > v_limit then
    raise exception 'processing-call daily page limit reached' using errcode='CLR18';
  end if;
$old$,
$new$  -- NO PER-UTC-DAY PAGE BUDGET HERE, AND ITS ABSENCE IS DELIBERATE (F-A9 PR-1B, design
  -- SS3.3 gate 7; owner ruling 2026-08-23 on the design's SS4 split; digest law 76 / SS9
  -- "meter, never cap"). This body used to sum the firm's UTC-day pages across
  -- document_ingest_reservations and processing_call_reservations and refuse CLR18 past
  -- coalesce(firm_document_limits.pages_per_day,1000). 0038's own comment calls that
  -- budget the firm's VENDOR SPEND, which is precisely what law 76 says the product does
  -- not brake. The reservation row below still gets written -- the METER is the whole
  -- point of this verb -- and the per-firm advisory rung above still serialises it.
  -- GATE 6 IS UNAFFECTED: clara._reserve_document_ingest keeps its own docs/pages bound
  -- (owner-ruled KEEP, engine protection) and counts document_ingest_reservations ONLY,
  -- so nothing it refuses depended on the sum removed here.
$new$),

-- -------------------------------------------------------- _settle_processing_call, S1
('S1','clara._settle_processing_call(uuid,integer)',
$old$declare r record; v_limit int; v_used bigint;
$old$,
$new$declare r record;
$new$),

-- -------------------------------------------------------- _settle_processing_call, S2
('S2','clara._settle_processing_call(uuid,integer)',
$old$  select coalesce(l.pages_per_day,1000) into v_limit from clara.firms f
    left join clara.firm_document_limits l on l.firm_id=f.id where f.id=r.firm_id;
  select coalesce(sum(pages),0) into v_used from (
    select case when state='settled' then settled_pages else pages_reserved end::bigint as pages
    from clara.document_ingest_reservations
    where firm_id=r.firm_id and state<>'refunded'
      and created_at >= (date_trunc('day',now() at time zone 'utc') at time zone 'utc')
    union all
    select case when state='settled' then settled_pages else pages_reserved end::bigint
    from clara.processing_call_reservations
    where firm_id=r.firm_id and id<>r.id and state<>'refunded'
      and created_at >= (date_trunc('day',now() at time zone 'utc') at time zone 'utc')
  ) q;
  if v_used + p_pages > v_limit then
    raise exception 'actual processing-call pages exceed daily limit' using errcode='CLR18';
  end if;
$old$,
$new$  -- GATE 7'S BACK HALF, REMOVED WITH ITS FRONT HALF (F-A9 PR-1B). This body enforced the
  -- IDENTICAL firm_document_limits.pages_per_day budget over the IDENTICAL two-table
  -- UTC-day sum as clara._reserve_processing_call. Removing only the reserve-side check
  -- would not remove the brake: it would RELOCATE it to settle time -- after the vendor
  -- pages were already bought -- turning a pre-flight refusal into a stranded reservation
  -- that can neither settle nor be retried. Law 76 reaches a spend brake wherever it is
  -- enforced, so gate 7's REMOVE takes both arms. The settle UPDATE below is untouched:
  -- the actual page count is still RECORDED, which is the meter the ruling keeps.
$new$),

-- ---------------------------------------------------------- reconcile_sweep_runs, C1
('C1','clara.reconcile_sweep_runs()',
$old$        refused_count=(select count(*) from clara.sweep_run_items where run_id=sr.id
          and outcome in ('refused_budget','refused_attempts')),
$old$,
$new$        -- F-A9 PR-1B: 'refused_concurrency' is the unattended lane's concurrency refusal,
        -- renamed off the string it shared with two now-removed spend caps. It joins this
        -- bucket rather than getting its own counter because it IS a refusal and the run
        -- summary must still total to expected_count; historical 'refused_budget' rows
        -- keep their string forever (law 6) and keep counting here too.
        refused_count=(select count(*) from clara.sweep_run_items where run_id=sr.id
          and outcome in ('refused_budget','refused_concurrency','refused_attempts')),
$new$),

-- ------------------------------------------------------------ open_sales_backfill, O1
('O1','clara.open_sales_backfill(uuid,integer,text,text)',
$old$  -- batch_size is a BUDGET, not a RATE: the per-firm daily cap (clara.firm_limits.
  -- sales_admission_daily_cap, default 15) still governs how fast this batch actually moves,
  -- so a 500-document batch drains over roughly 34 days, not overnight. Raise the cap, not
  -- the batch, to go faster.
$old$,
$new$  -- batch_size IS THE ONLY BOUND ON THIS BATCH (re-cut at F-A9 PR-1B; digest law 76 / SS9
  -- "meter, never cap", owner ruling TA-P12 = A). Until this migration a per-firm daily
  -- cap (clara.firm_limits.sales_admission_daily_cap, default 15) ALSO paced admission, so
  -- a 500-document batch drained over roughly 34 days rather than overnight. That column
  -- is GONE and the quota with it: an open batch now moves as fast as the sweep can admit
  -- it, bounded only by batch_size. Size the batch for the pace you want -- there is no
  -- cap left to raise. BEHAVIOURALLY THIS BODY IS BYTE-IDENTICAL; only this comment moved.
$new$);

do $fa9b_anchor_census$
declare r record; v_def text; v_n int;
begin
  for r in select a.id, a.target, a.old from fa9b_anchors a order by a.id loop
    v_def := pg_get_functiondef(r.target::regprocedure);
    v_n := (length(v_def) - length(replace(v_def, r.old, ''))) / length(r.old);
    if v_n <> 1 then
      raise exception 'F-A9 PR-1B anchor census: anchor % on % occurs % time(s) (expected exactly 1) -- % would splice %', r.id, r.target, v_n,
        case when v_n=0 then 'zero occurrences' else 'two or more occurrences' end,
        case when v_n=0 then 'nothing while this file reported success' else 'all of them' end
        using errcode='CLR10';
    end if;
  end loop;
  -- The two KEPT blocks this file must NOT move, counted here so the tail's survival
  -- assertions are differentials against a measured prestate rather than self-reads.
  v_def := pg_get_functiondef('clara.admit_autodraft_task(uuid,text,uuid,text,bigint)'::regprocedure);
  v_n := (length(v_def) - length(replace(v_def, $keep1$      if not found then
        if p_run_id is not null then
          insert into clara.sweep_run_items(run_id,filing_id,firm_id,client_id,document_id,
              outcome,refusal_token)
            values(p_run_id,p_filing,f.firm_id,f.client_id,f.document_id,'skipped_lane',
              jsonb_build_object('clr','CLR29','reason','sales_backlog_held','direction','sales'))
            on conflict do nothing;
        end if;
        return jsonb_build_object('outcome','skipped_direction',
          'reason','sales_backlog_held','direction','sales');
      end if;
$keep1$, ''))) / length($keep1$      if not found then
        if p_run_id is not null then
          insert into clara.sweep_run_items(run_id,filing_id,firm_id,client_id,document_id,
              outcome,refusal_token)
            values(p_run_id,p_filing,f.firm_id,f.client_id,f.document_id,'skipped_lane',
              jsonb_build_object('clr','CLR29','reason','sales_backlog_held','direction','sales'))
            on conflict do nothing;
        end if;
        return jsonb_build_object('outcome','skipped_direction',
          'reason','sales_backlog_held','direction','sales');
      end if;
$keep1$);
  if v_n <> 1 then
    raise exception 'F-A9 PR-1B anchor census: the 7A-R5 sales_backlog_held door occurs % time(s) (expected exactly 1) -- the tail cannot prove its survival against a prestate it could not measure', v_n using errcode='CLR10';
  end if;
  v_n := (length(v_def) - length(replace(v_def, $keep2$  if p_origin='sweep' and (select count(*) from clara.sweep_runs
      where firm_id=f.firm_id and state='open' and id<>p_run_id)>=v_cap then
$keep2$, ''))) / length($keep2$  if p_origin='sweep' and (select count(*) from clara.sweep_runs
      where firm_id=f.firm_id and state='open' and id<>p_run_id)>=v_cap then
$keep2$);
  if v_n <> 1 then
    raise exception 'F-A9 PR-1B anchor census: the KEPT concurrency bound (0048''s own-run-excluding count) occurs % time(s) (expected exactly 1)', v_n using errcode='CLR10';
  end if;
  raise notice 'F-A9 PR-1B anchor census: all 15 splice anchors are unique, and both KEPT blocks (the 7A-R5 backfill door, the 0048 own-run-excluding concurrency bound) occur exactly once.';
end
$fa9b_anchor_census$;

-- =====================================================================================
-- SS1..SS5 THE RECUTS -- five bodies, one loop, every splice from the censused strings
-- =====================================================================================
do $fa9b_cut$
declare t record; s record; v_def text; v_next text; v_ids text;
begin
  for t in select distinct a.target from fa9b_anchors a order by 1 loop
    v_def := pg_get_functiondef(t.target::regprocedure);
    v_next := v_def;
    v_ids := '';
    for s in select b.id, b.old, b.new from fa9b_anchors b where b.target=t.target order by b.id loop
      v_next := replace(v_next, s.old, s.new);
      v_ids := v_ids || case when v_ids='' then '' else ',' end || s.id;
    end loop;
    if v_next = v_def then
      raise exception 'F-A9 PR-1B recut: % produced a byte-identical definition -- no splice applied', t.target using errcode='CLR10';
    end if;
    execute v_next;
    raise notice 'F-A9 PR-1B recut: % re-cut with splices [%]', t.target, v_ids;
  end loop;
end
$fa9b_cut$;

-- =====================================================================================
-- SS6 DDL 1 -- clara.sweep_run_items.outcome, drop+add, EXTEND-ONLY
-- =====================================================================================
-- ACCESS EXCLUSIVE for the duration of the swap; validates trivially because SS0.1 proved
-- no existing row claims the new value. EVERY value admitted before is still admitted --
-- historical 'refused_budget' rows are untouched forever (law 6). This is deliberately a
-- WIDENING and never a narrowing: nothing here retires a spelling.
alter table clara.sweep_run_items drop constraint sweep_run_items_outcome_check;
alter table clara.sweep_run_items add constraint sweep_run_items_outcome_check
  check (outcome in ('drafted','skipped_lane','refused_budget','refused_concurrency',
                     'refused_attempts','noop_existing','posted'));

-- =====================================================================================
-- SS7 DDL 2 -- clara.firm_limits loses its three dead cap columns. STRICTLY LAST.
-- =====================================================================================
-- Ordered AFTER every body above for the late-binding reason stated in the header:
-- PL/pgSQL does not resolve embedded SQL against the catalog until first execution, so a
-- stranded read passes the migration and dies on the first real call. SS8's whole-catalog
-- census re-proves that no clara function names any of the three after this statement.
--
-- THEIR CHECKS FALL WITH THEM. firm_limits_daily_token_limit_check (0006),
-- ck_firm_limits_sweep_budget_share (0011) and ck_firm_limits_sales_admission_daily_cap
-- (0046) are all SINGLE-COLUMN CHECKs, so DROP COLUMN removes each one; a literal
-- `drop constraint` afterwards would raise "constraint ... does not exist" and abort the
-- migration. ck_firm_limits_max_concurrent_sweeps is explicitly untouched, as are
-- max_concurrent_runs, max_concurrent_sweeps, sales_lane_active and
-- sales_admission_watermark. NO COLUMN OF clara.firm_document_limits IS TOUCHED.
alter table clara.firm_limits
  drop column daily_token_limit,
  drop column sweep_budget_share,
  drop column sales_admission_daily_cap;

-- =====================================================================================
-- SS8 TAIL SELF-PROOF -- raises on failure; every claim measured against the prestate
-- =====================================================================================
do $fa9b_tail$
declare
  p record; s record; v_src text; v_sha text; v_back text; v_n int; v_stripped text;
  v_owner text; v_acl text; v_cfg text[]; v_flagged boolean; v_re text; v_names text;
begin
  -- (8.1) EVERY BODY WAS REPLACED, ITS SECURITY SHAPE IS UNMOVED, AND THE DELTA IS
  -- EXACTLY THE SPLICES -- proven by INVERSE SUBSTITUTION back to the pinned pre-image.
  -- This is the strongest available statement of "nothing else moved": a single stray
  -- character anywhere in the 33kB admit body breaks the round trip.
  for p in select * from fa9b_pre order by name loop
    select pr.prosrc, pg_get_userbyid(pr.proowner), coalesce(pr.proacl::text,'(null)'), pr.proconfig
      into v_src, v_owner, v_acl, v_cfg
      from pg_proc pr where pr.oid=p.sig::regprocedure;
    v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
    if v_sha = p.sha then
      raise exception 'F-A9 PR-1B tail: % prosrc sha is UNCHANGED (%) -- the body was not replaced', p.sig, v_sha using errcode='CLR10';
    end if;
    v_back := v_src;
    for s in select b.id, b.old, b.new from fa9b_anchors b where b.target=p.sig order by b.id loop
      v_n := (length(v_back) - length(replace(v_back, s.new, ''))) / length(s.new);
      if v_n <> 1 then
        raise exception 'F-A9 PR-1B tail: splice % left % occurrence(s) of its replacement text in % (expected exactly 1) -- the re-substitution proof cannot run', s.id, v_n, p.sig using errcode='CLR10';
      end if;
      v_back := replace(v_back, s.new, s.old);
    end loop;
    if encode(sha256(convert_to(v_back,'UTF8')),'hex') <> p.sha then
      raise exception 'F-A9 PR-1B tail: RE-SUBSTITUTION FAILED for % -- putting the spliced text back does NOT reproduce the pinned pre-image (expected %, got %). The recut moved something this file did not name', p.sig, p.sha, encode(sha256(convert_to(v_back,'UTF8')),'hex') using errcode='CLR10';
    end if;
    if v_owner <> p.pre_owner then
      raise exception 'F-A9 PR-1B tail: % owner moved from % to % -- a SECURITY DEFINER body that changed owner changed WHO it executes as', p.sig, p.pre_owner, v_owner using errcode='CLR10';
    end if;
    if v_acl <> p.acl then
      raise exception 'F-A9 PR-1B tail: % proacl moved from % to %', p.sig, p.acl, v_acl using errcode='CLR10';
    end if;
    if v_cfg is distinct from p.cfg then
      raise exception 'F-A9 PR-1B tail: % proconfig (search_path) moved from % to %', p.sig, p.cfg, v_cfg using errcode='CLR10';
    end if;
    select count(*)::int into v_n from pg_proc pr
     where pr.oid=p.sig::regprocedure and pr.prosecdef
       and pr.prolang=(select oid from pg_language where lanname='plpgsql');
    if v_n <> 1 then
      raise exception 'F-A9 PR-1B tail: % is no longer a plpgsql SECURITY DEFINER function', p.sig using errcode='CLR10';
    end if;
    select count(*)::int into v_n from pg_proc pr
     where pr.pronamespace='clara'::regnamespace and pr.proname=p.name;
    if v_n <> 1 then
      raise exception 'F-A9 PR-1B tail: clara.% now has % bodies (expected exactly 1) -- a recut created an overload instead of replacing the live body', p.name, v_n using errcode='CLR10';
    end if;
  end loop;

  -- (8.2) THE BRAKES ARE GONE -- negative reads, one per removed gate, on EXECUTABLE text.
  -- Comments are stripped first, deliberately: this file leaves comments that NAME the
  -- removed strings on purpose (so a future reader does not restore a "missing" belt), and
  -- a bare `position()` over the raw prosrc would read those comments as survivals.
  select prosrc into v_src from pg_proc where oid='clara.admit_autodraft_task(uuid,text,uuid,text,bigint)'::regprocedure;
  v_stripped := regexp_replace(v_src, '--[^\n]*', '', 'g');
  foreach v_names in array array['daily_token_limit','sweep_budget_share','sales_admission_daily_cap',
                                 'v_limit','v_share','v_used_sales','v_cap_sales','refused_budget',
                                 'refused_sales_cap'] loop
    if position(v_names in v_stripped) <> 0 then
      raise exception 'F-A9 PR-1B tail: clara.admit_autodraft_task still carries % in EXECUTABLE text -- a removed gate, a dead declaration or a stranded read of a dropped column survives', v_names using errcode='CLR10';
    end if;
  end loop;
  -- `v_used` is checked as a whole word: `v_used_sales` is already gone above, and a bare
  -- substring test would be satisfied by any longer identifier that happens to contain it.
  if v_stripped ~ '\mv_used\M' then
    raise exception 'F-A9 PR-1B tail: clara.admit_autodraft_task still reads v_used -- the firm_usage_daily budget read survives' using errcode='CLR10';
  end if;
  for v_names in select unnest(array['clara._reserve_processing_call(uuid,integer)','clara._settle_processing_call(uuid,integer)']) loop
    select prosrc into v_src from pg_proc where oid=v_names::regprocedure;
    v_stripped := regexp_replace(v_src, '--[^\n]*', '', 'g');
    if position('pages_per_day' in v_stripped) <> 0 or v_stripped ~ '\mv_limit\M' then
      raise exception 'F-A9 PR-1B tail: % still enforces firm_document_limits.pages_per_day -- gate 7 was only half removed', v_names using errcode='CLR10';
    end if;
  end loop;

  -- (8.3) THE KEPT ARMS SURVIVED, read POSITIVELY (an absence of complaint is not evidence).
  select prosrc into v_src from pg_proc where oid='clara.admit_autodraft_task(uuid,text,uuid,text,bigint)'::regprocedure;
  if position('sales_backlog_held' in v_src) = 0 or position('sales_admission_watermark' in v_src) = 0 then
    raise exception 'F-A9 PR-1B tail: the 7A-R5 backfill door (sales_backlog_held / the watermark read) is GONE from admit_autodraft_task -- design SS3.3 gate 5 says it must survive byte-for-byte' using errcode='CLR10';
  end if;
  v_n := (length(v_src) - length(replace(v_src, $k2$  if p_origin='sweep' and (select count(*) from clara.sweep_runs
      where firm_id=f.firm_id and state='open' and id<>p_run_id)>=v_cap then
$k2$, ''))) / length($k2$  if p_origin='sweep' and (select count(*) from clara.sweep_runs
      where firm_id=f.firm_id and state='open' and id<>p_run_id)>=v_cap then
$k2$);
  if v_n <> 1 then
    raise exception 'F-A9 PR-1B tail: the KEPT concurrency bound occurs % time(s) in the recut body (expected exactly 1, byte-unchanged) -- design SS3.3 gate 4 says KEEP the bound', v_n using errcode='CLR10';
  end if;
  -- Counted on COMMENT-STRIPPED text: splice A8's trued CHECK enumeration names the new
  -- value in prose, and a raw count would read that comment as a fifth emission site.
  v_stripped := regexp_replace(v_src, '--[^\n]*', '', 'g');
  v_n := (length(v_stripped) - length(replace(v_stripped, 'refused_concurrency', ''))) / length('refused_concurrency');
  if v_n <> 4 then
    raise exception 'F-A9 PR-1B tail: refused_concurrency occurs % time(s) in admit_autodraft_task''s EXECUTABLE text (expected exactly 4 -- the item outcome, the refusal_token reason, and the returned outcome/reason pair)', v_n using errcode='CLR10';
  end if;
  if position('max_concurrent_sweeps' in v_src) = 0 then
    raise exception 'F-A9 PR-1B tail: the rewritten select no longer reads max_concurrent_sweeps -- the KEPT bound has no cap to read' using errcode='CLR10';
  end if;
  if position('insert into clara.firm_usage_daily' in v_src) = 0
     or position('update clara.firm_usage_daily set tokens_used=tokens_used+p_reserve_tokens' in v_src) = 0 then
    raise exception 'F-A9 PR-1B tail: the admitted path''s firm_usage_daily reserve write is GONE -- PR-1B stops READING that ledger for budget purposes; PR-4 stops WRITING it' using errcode='CLR10';
  end if;
  select prosrc into v_src from pg_proc where oid='clara._reserve_processing_call(uuid,integer)'::regprocedure;
  if position('insert into clara.processing_call_reservations' in v_src) = 0
     or position('pg_advisory_xact_lock(203005001' in v_src) = 0
     or position($m$t.lane not in ('invoice_facts','statement_facts')$m$ in v_src) = 0 then
    raise exception 'F-A9 PR-1B tail: gate 7''s METER (the reservation insert), its advisory rung (0041 tail 13(c)''s single reachable key) or its lane predicate did not survive -- the brake was to go, not the meter' using errcode='CLR10';
  end if;
  select prosrc into v_src from pg_proc where oid='clara._settle_processing_call(uuid,integer)'::regprocedure;
  if position($m$update clara.processing_call_reservations set state='settled',settled_pages=p_pages$m$ in v_src) = 0 then
    raise exception 'F-A9 PR-1B tail: _settle_processing_call''s settle UPDATE (the actual-page record) did not survive' using errcode='CLR10';
  end if;
  select prosrc into v_src from pg_proc where oid='clara.reconcile_sweep_runs()'::regprocedure;
  if position($m$outcome in ('refused_budget','refused_concurrency','refused_attempts')$m$ in v_src) = 0 then
    raise exception 'F-A9 PR-1B tail: reconcile_sweep_runs still buckets only the old two refusal strings -- every future concurrency refusal would fall into NO counter and a finalized run would under-total against expected_count' using errcode='CLR10';
  end if;

  -- (8.4) WHOLE-CATALOG CENSUSES -- closed-world, not name-by-name faith.
  -- Comment-stripped throughout: this file DELIBERATELY leaves comments naming the dropped
  -- columns and the retired string, so a future reader does not restore a "missing" belt.
  -- A raw prosrc census would read those comments as stranded reads.
  select coalesce(string_agg(pr.oid::regprocedure::text, ', ' order by pr.proname),'(none)')
    into v_names from pg_proc pr join pg_namespace n on n.oid=pr.pronamespace
   where n.nspname='clara'
     and regexp_replace(pr.prosrc,'--[^\n]*','','g') ~ '(daily_token_limit|sweep_budget_share|sales_admission_daily_cap)';
  if v_names <> '(none)' then
    raise exception 'F-A9 PR-1B tail: % still name(s) a column this migration just dropped in EXECUTABLE text -- PL/pgSQL is late-bound, so this would pass here and fail on the first real call', v_names using errcode='CLR10';
  end if;
  select coalesce(string_agg(pr.proname, ', ' order by pr.proname),'(none)')
    into v_names from pg_proc pr join pg_namespace n on n.oid=pr.pronamespace
   where n.nspname='clara' and regexp_replace(pr.prosrc,'--[^\n]*','','g') like '%pages\_per\_day%';
  if v_names <> '_reserve_document_ingest, _resize_document_reservation, _settle_document_reservation, _tf_firm_document_limits_upsert, settle_ingest_reservation' then
    raise exception 'F-A9 PR-1B tail: the surviving pages_per_day readers are {%} -- expected exactly gate 6''s KEPT family (_reserve_document_ingest, _resize_document_reservation, _settle_document_reservation) plus the limits-upsert trigger and settle_ingest_reservation. A name here that this file did not classify is an unclassified live usage gate', v_names using errcode='CLR10';
  end if;
  -- `refused_budget` survives in EXACTLY ONE place, and it is a READ of history, never an
  -- emission: reconcile_sweep_runs' refused_count bucket, which must keep counting the
  -- rows past runs already wrote (law 6). Any OTHER name here would be a live writer still
  -- spelling a concurrency refusal as a budget one (law 22).
  select coalesce(string_agg(pr.proname, ', ' order by pr.proname),'(none)')
    into v_names from pg_proc pr join pg_namespace n on n.oid=pr.pronamespace
   where n.nspname='clara'
     and regexp_replace(pr.prosrc,'--[^\n]*','','g') like '%refused\_budget%';
  if v_names <> 'reconcile_sweep_runs' then
    raise exception 'F-A9 PR-1B tail: the clara functions naming refused_budget in EXECUTABLE text are {%} -- expected exactly {reconcile_sweep_runs}, whose bucket READS the historical population. Any other name is a live writer still spelling a concurrency refusal as a budget one (law 22)', v_names using errcode='CLR10';
  end if;

  -- (8.5) THE COLUMN DROP, AND THE SURVIVORS.
  select count(*)::int into v_n from information_schema.columns
   where table_schema='clara' and table_name='firm_limits'
     and column_name in ('daily_token_limit','sweep_budget_share','sales_admission_daily_cap');
  if v_n <> 0 then
    raise exception 'F-A9 PR-1B tail: % of the three dead cap columns survive on clara.firm_limits', v_n using errcode='CLR10';
  end if;
  select count(*)::int into v_n from information_schema.columns
   where table_schema='clara' and table_name='firm_limits'
     and column_name in ('firm_id','max_concurrent_runs','updated_at','max_concurrent_sweeps','sales_lane_active','sales_admission_watermark');
  if v_n <> 6 then
    raise exception 'F-A9 PR-1B tail: only % of the 6 KEPT firm_limits columns survive -- the drop reached further than SS3.4 says', v_n using errcode='CLR10';
  end if;
  if not exists(select 1 from pg_constraint c where c.conrelid='clara.firm_limits'::regclass
                  and c.conname='ck_firm_limits_max_concurrent_sweeps') then
    raise exception 'F-A9 PR-1B tail: ck_firm_limits_max_concurrent_sweeps is GONE -- SS3.4 names it explicitly untouched' using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_constraint c where c.conrelid='clara.firm_limits'::regclass
    and c.conname in ('firm_limits_daily_token_limit_check','ck_firm_limits_sweep_budget_share','ck_firm_limits_sales_admission_daily_cap');
  if v_n <> 0 then
    raise exception 'F-A9 PR-1B tail: % of the three single-column CHECKs survived their column -- they were expected to fall WITH it', v_n using errcode='CLR10';
  end if;
  select count(*)::int into v_n from information_schema.columns
   where table_schema='clara' and table_name='firm_document_limits';
  if v_n <> 7 then
    raise exception 'F-A9 PR-1B tail: clara.firm_document_limits has % columns (expected 7, untouched by this file -- gate 6''s docs/pages budgets and both concurrency floors all stay)', v_n using errcode='CLR10';
  end if;

  -- (8.5b) THE WHOLE-CATALOG CENSUS, AFTER. This file creates and drops NO function and NO
  -- relation, so BOTH the count and the exact SIGNATURE set must be byte-identical to the
  -- prestate's. A moved signature checksum is the overload hazard caught (a CREATE OR
  -- REPLACE that landed as a new oid leaves the OLD gate reachable -- the 0054:132-146
  -- lesson); a moved relation count would mean a DROP COLUMN cascaded into a view.
  if (select count(*)::text from pg_proc pr where pr.pronamespace='clara'::regnamespace)
       <> (select v from fa9b_pre_hist where k='clara_functions')
     or (select md5(string_agg(pr.oid::regprocedure::text, ',' order by pr.oid::regprocedure::text))
           from pg_proc pr where pr.pronamespace='clara'::regnamespace)
       <> (select v from fa9b_pre_hist where k='clara_fn_sig_ck') then
    raise exception 'F-A9 PR-1B tail: the clara FUNCTION signature set MOVED (% -> %, checksum % -> %) -- this file re-cuts five bodies and creates none, so a change here means a CREATE OR REPLACE landed as an overload and the old gate is still reachable',
      (select v from fa9b_pre_hist where k='clara_functions'),
      (select count(*)::text from pg_proc pr where pr.pronamespace='clara'::regnamespace),
      (select v from fa9b_pre_hist where k='clara_fn_sig_ck'),
      (select md5(string_agg(pr.oid::regprocedure::text, ',' order by pr.oid::regprocedure::text))
         from pg_proc pr where pr.pronamespace='clara'::regnamespace)
      using errcode='CLR10';
  end if;
  if (select count(*)::text from pg_class c
       where c.relnamespace='clara'::regnamespace and c.relkind in ('r','v','m','p'))
       <> (select v from fa9b_pre_hist where k='clara_relations') then
    raise exception 'F-A9 PR-1B tail: the clara RELATION count moved -- a DROP COLUMN cascaded into a view or table this file never named' using errcode='CLR10';
  end if;

  -- (8.6) THE OUTCOME CHECK WIDENED, AND HISTORY IS UNTOUCHED (law 6). Both the count AND
  -- a checksum over the ids: a same-size population with different members passes a count.
  select pg_get_constraintdef(c.oid) into v_src from pg_constraint c
   where c.conrelid='clara.sweep_run_items'::regclass and c.conname='sweep_run_items_outcome_check';
  foreach v_names in array array['drafted','skipped_lane','refused_budget','refused_concurrency','refused_attempts','noop_existing','posted'] loop
    if position(''''||v_names||'''' in v_src) = 0 then
      raise exception 'F-A9 PR-1B tail: the widened outcome CHECK no longer admits % (%) -- this swap is EXTEND-ONLY', v_names, v_src using errcode='CLR10';
    end if;
  end loop;
  if (select count(*)::text from clara.sweep_run_items where outcome='refused_budget')
       <> (select v from fa9b_pre_hist where k='refused_budget_rows')
     or (select coalesce(md5(string_agg(run_id::text||'/'||filing_id::text,',' order by run_id,filing_id)),'(empty)')
           from clara.sweep_run_items where outcome='refused_budget')
       <> (select v from fa9b_pre_hist where k='refused_budget_ck') then
    raise exception 'F-A9 PR-1B tail: the historical refused_budget population MOVED -- this file must never rewrite a past row (law 6)' using errcode='CLR10';
  end if;
  if (select coalesce(md5(string_agg(run_id::text||'/'||filing_id::text||'|'||outcome,',' order by run_id,filing_id)),'(empty)')
        from clara.sweep_run_items)
       <> (select v from fa9b_pre_hist where k='all_items_ck') then
    raise exception 'F-A9 PR-1B tail: some sweep_run_items row changed outcome -- this file writes no rows at all' using errcode='CLR10';
  end if;

  -- (8.7) THE ROSTER CONSEQUENCE, MEASURED WITH THE CENSUS'S OWN INSTRUMENT. The regex is
  -- S5.25 arm (D)'s (x42-s5-helpers.mjs:146-147), copied verbatim, so the DB half and the
  -- test-side roster edit in this same PR cannot disagree about what "reads a bare clock
  -- token" means. One departure, two survivals -- each measured, none predicted.
  v_re := '\m(now\(\)|current_timestamp\M|localtimestamp\M|clock_timestamp\(\)|statement_timestamp\(\)|transaction_timestamp\(\))';
  select lower(regexp_replace(regexp_replace(regexp_replace(
           coalesce(pr.prosrc,'')||coalesce(pg_get_functiondef(pr.oid),''),
           '/\*[\s\S]*?\*/','','g'),'--[^\n]*','','g'),'\s+',' ','g')) ~* v_re
    into v_flagged from pg_proc pr where pr.oid='clara._reserve_processing_call(uuid,integer)'::regprocedure;
  if v_flagged then
    raise exception 'F-A9 PR-1B tail: clara._reserve_processing_call STILL flags on S5.25 arm (D)''s bare-clock detector -- this PR''s roster edit removes the name, so a body that still reads a clock would redden the census in both directions' using errcode='CLR10';
  end if;
  foreach v_names in array array['clara._settle_processing_call(uuid,integer)','clara.admit_autodraft_task(uuid,text,uuid,text,bigint)'] loop
    select lower(regexp_replace(regexp_replace(regexp_replace(
             coalesce(pr.prosrc,'')||coalesce(pg_get_functiondef(pr.oid),''),
             '/\*[\s\S]*?\*/','','g'),'--[^\n]*','','g'),'\s+',' ','g')) ~* v_re
      into v_flagged from pg_proc pr where pr.oid=v_names::regprocedure;
    if not v_flagged then
      raise exception 'F-A9 PR-1B tail: % no longer flags on S5.25 arm (D)''s bare-clock detector -- it STAYS on the roster, so a departure this PR did not budget for would redden the census', v_names using errcode='CLR10';
    end if;
  end loop;

  raise notice 'F-A9 PR-1B tail: OK -- the whole-catalog census is UNMOVED (same clara function count AND the same exact signature checksum, same relation count -- no overload was created and no DROP cascaded); FIVE bodies re-cut and each one''s delta proven to be EXACTLY its splices by inverse re-substitution back to the pinned pre-image sha; owner/proacl/search_path unmoved on all five and each is still a single plpgsql SECURITY DEFINER body. The three spend brakes are gone from executable text (the unattended 60%%/100%% token budget, the 15/day sales quota, and BOTH arms of the processing-call page budget); the KEPT arms survive positively (the 0048 own-run-excluding concurrency bound byte-unchanged, the 7A-R5 sales_backlog_held door, gate 7''s reservation insert + advisory rung + lane predicate, the settle UPDATE, the admitted path''s firm_usage_daily reserve write). refused_concurrency appears exactly 4 times in admit and reconcile_sweep_runs buckets it; NO clara function emits refused_budget in executable text any more, and NO clara function names any of the three dropped columns. clara.firm_limits lost exactly 3 columns (their single-column CHECKs falling with them) and kept exactly 6 plus ck_firm_limits_max_concurrent_sweeps; clara.firm_document_limits is untouched; the pages_per_day readers left are exactly gate 6''s KEPT family plus the limits trigger and settle_ingest_reservation. The outcome CHECK admits all 7 values and the historical refused_budget population is byte-identical by count AND checksum -- no row of any table was written. _reserve_processing_call has LEFT S5.25 arm (D)''s measured set while _settle_processing_call and admit_autodraft_task remain on it. No table in workflow/graphile_worker/spike touched. D1 write-quiesce taken (FIVE bodies).';
end
$fa9b_tail$;
