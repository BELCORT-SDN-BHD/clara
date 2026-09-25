-- 0349_admit_autodraft_task_outcome_disclosure — #1132 (riders sweep wave, lane 07): A CATALOG
-- COMMENT ON clara.admit_autodraft_task, PLUS THIS FILE'S OWN README SECTION, DISCLOSE THAT A
-- SUCCESSFUL ADMISSION WRITES NO clara.sweep_run_items ROW — THE DOCUMENTATION PATH, NOT THE
-- ENUM WIDENING.
-- =====================================================================================
-- Spec of record: issue #1132's Agent Brief (issue body; the issue carries zero comments). The
-- brief offers TWO candidate fixes and defers the choice to the owner: (1) document the trap on
-- clara.admit_autodraft_task and name clara.op_receipts as the correct read, or (2) widen
-- clara.sweep_run_items.outcome with a new 'admitted' member. Lane note (SWEEP-PLAN.md /
-- the orchestrator's own scan): "#1132 takes the DOCUMENTATION path, a comment on function plus
-- a README section, not the enum widening." This file takes (1) only. The CHECK on
-- clara.sweep_run_items.outcome is untouched — pinned in the prestate and re-measured in the
-- tail, byte for byte.
--
-- =====================================================================================
-- THE TRAP, MEASURED RATHER THAN RESTATED.
--
-- clara.admit_autodraft_task(uuid,text,uuid,text,bigint) — last recut at
-- packages/db/migrations/0036_wave_c0_deferred_belts.sql:1159-1485, UNTOUCHED by this file (no
-- later migration patches it: grepped both ways, confirmed again in this file's own prestate) —
-- carries several return arms. Every refusal/noop arm (noop_existing x4, refused_attempts x2,
-- skipped_direction, lane_changed, refused_budget x2) writes a run-bound clara.sweep_run_items
-- row when p_run_id is not null (0036:1182, 1190, 1232, 1240, 1251, 1337, 1367, 1400, 1411, and
-- the unique_violation handler's own noop at 1476). The ONE genuinely successful arm —
-- 0036:1468-1470, returning
-- through clara._finish_op with outcome 'admitted' or 're_admitted' — writes ONLY
-- clara.op_receipts (via clara._finish_op → clara.op_receipts, the idempotency ledger every
-- admit_autodraft_task call reads and writes through clara._reserve_op / clara._finish_op).
-- No sweep_run_items insert exists on that return path. A reader who assumes every admission
-- outcome is visible on clara.sweep_run_items therefore reads NOTHING for a successful one, and
-- if they instead read what a LATER settlement wrote, they read what the task's own posting
-- attempt decided, which can silently disagree with what admission itself decided (the brief's
-- own example: 'admitted' now, 'failed' later for an unrelated reason during posting).
--
-- GROUNDED, NOT ONLY READ OFF THE BODY TEXT (wave-3 addendum: "a door's behaviour is asserted
-- only after it was driven"): `tests/admit-autodraft-task-outcome-disclosure.test.mjs`'s
-- `p1132.trap` cell drives a real admission through the real door on this lane's own database,
-- asserts ZERO clara.sweep_run_items rows follow it, asserts clara.op_receipts DOES carry the
-- real 'admitted' outcome, THEN re-admits the SAME filing on a second run (the registry
-- short-circuit's 'noop_existing' arm) and asserts that call DOES write one row — the contrast
-- that proves the first assertion discriminates a real difference, standing in for the
-- deliberately-broken-subject vacuity control this WO's rule 4 asks for (this file may never
-- edit an applied migration, so there is no subject in THIS file to break and restore; the
-- contrast arm is the equivalent proof that the zero-row assertion is not vacuously true).
--
-- =====================================================================================
-- WHY DOCUMENTATION, AND WHY A CATALOG COMMENT SPECIFICALLY.
--
-- The ticket's own AC lists the enum widening as a fallback the OWNER may prefer, not the
-- default. The lane's owner ruling takes the documentation path. A catalog comment (readable by
-- ANY client of pg_proc, including a human at psql \df+ or an agent reading the schema) is this
-- estate's existing idiom for "the one statement about a function every reader can find" —
-- `clara.create_client`'s own #1038 closure comment
-- (packages/db/migrations/0316_create_client_human_grant_withdrawn.sql) is the precedent this
-- file follows, cross-checked live by `client-birth-wall.test.mjs`'s own
-- `obj_description(...)` read. The README section is the second, slower-to-find place the same
-- fact lives, for a reader who greps packages/db/README.md before the catalog.
--
-- =====================================================================================
-- WHAT THIS FILE DOES NOT CHANGE, PINNED IN THE PRESTATE AND RE-MEASURED IN THE TAIL.
--
-- clara.admit_autodraft_task's BODY (prosrc) is byte-identical before and after — this file adds
-- a CATALOG COMMENT only, never a CREATE OR REPLACE FUNCTION. clara.sweep_run_items.outcome's
-- CHECK constraint is byte-identical before and after — no 'admitted' member is added. No table,
-- index, trigger, grant or RLS policy anywhere moves. This file mints NO new function, table or
-- other catalog name, so it owes NO packages/db/tests/rig-meta.mjs cohort entry (the shared-files
-- rule's own qualifier: "one cohort entry per migration that mints a new name" — this one mints
-- none).
--
-- Windows/portability note: `sha256(bytea) returns bytea` is core Postgres (14+); this estate has
-- no `pgcrypto` extension installed, so the one prosrc pin below uses
-- `encode(sha256(convert_to(prosrc,'UTF8')),'hex')` — the `0286`/`0347`/`0348` idiom, never
-- `digest(...)`.

set local statement_timeout = '5min';
set local lock_timeout = '15s';

-- =================================================================================================
-- §0 — PRESTATE. Every premise this file relies on, MEASURED on the live catalog before anything
-- changes, and re-measured in the tail. The sha256 pin was taken on riders lane 07's database
-- (clara_l09) at 311 applied migrations / 0348_rate_wall_attempts_retention, this lane's own
-- frontier — never transcribed from a creating migration's own header.
-- =================================================================================================
create temporary table _p1132_pre (k text primary key, v jsonb) on commit drop;

do $pre$
declare
  v_comment text;
  v_sha text;
  v_check text;
  v_mode text;
begin
  -- (a) THE FUNCTION EXISTS AND ITS BODY IS THE MEASURED PRE-IMAGE. Pinned by sha256(prosrc),
  -- measured LIVE on this lane database now (wave-3 addendum: "pin what is LIVE, never a copied
  -- literal"). This file never recuts this body; the tail re-measures the SAME sha.
  if to_regprocedure('clara.admit_autodraft_task(uuid,text,uuid,text,bigint)') is null then
    raise exception '#1132 prestate: clara.admit_autodraft_task(uuid,text,uuid,text,bigint) is absent'
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
    from pg_proc p where p.oid = 'clara.admit_autodraft_task(uuid,text,uuid,text,bigint)'::regprocedure;
  if v_sha is distinct from 'e492813ca194a1c35098c79e1b18c5c3d51063829140b667e95113b011c18b3c' then
    raise exception '#1132 prestate: clara.admit_autodraft_task has DRIFTED from its measured pre-image -- this file must not touch its body, so re-measure before applying (got %)',
      v_sha using errcode='CLR10';
  end if;
  insert into _p1132_pre values ('fn_sha', to_jsonb(v_sha));

  -- (b) FIRST OR REDO, AND NEVER HALF OF EITHER. `comment on function ... is '...'` is naturally
  -- idempotent (create-or-replace-shaped: it always sets, never appends), so the ONLY two sane
  -- states are "no comment yet" (FIRST) or "already carries exactly #1132's own comment" (REDO,
  -- #957). Any OTHER non-null comment is a foreign comment this file refuses to clobber.
  select obj_description('clara.admit_autodraft_task(uuid,text,uuid,text,bigint)'::regprocedure, 'pg_proc')
    into v_comment;
  if v_comment is null then
    v_mode := 'FIRST';
  elsif v_comment like '#1132:%' then
    v_mode := 'REDO';
    raise notice '#1132 prestate: clara.admit_autodraft_task already carries a #1132 comment — this is a REDO (#957) over this file''s own effects.';
  else
    raise exception '#1132 prestate: clara.admit_autodraft_task already carries a FOREIGN catalog comment this file will not overwrite: %', v_comment
      using errcode='CLR10';
  end if;
  insert into _p1132_pre values ('mode', to_jsonb(v_mode));

  -- (c) THE CHECK constraint is the exact 7-value enumeration this file relies on and does NOT
  -- widen — the one 0151 (F-A9 PR-1B) left it in, no 'admitted' member.
  select pg_get_constraintdef(c.oid) into v_check from pg_constraint c
   where c.conrelid='clara.sweep_run_items'::regclass and c.conname='sweep_run_items_outcome_check';
  if v_check is distinct from
     'CHECK ((outcome = ANY (ARRAY[''drafted''::text, ''skipped_lane''::text, ''refused_budget''::text, ''refused_concurrency''::text, ''refused_attempts''::text, ''noop_existing''::text, ''posted''::text])))' then
    raise exception '#1132 prestate: sweep_run_items_outcome_check is not the expected 7-value enumeration (got %) -- this file documents that it carries no ''admitted'' member and must not proceed against a drifted constraint', v_check
      using errcode='CLR10';
  end if;
  insert into _p1132_pre values ('check_def', to_jsonb(v_check));

  raise notice '#1132 prestate: clean (%) -- clara.admit_autodraft_task(uuid,text,uuid,text,bigint) is present with the measured pre-image body, carries no foreign catalog comment, and clara.sweep_run_items.outcome''s CHECK is the expected 7-value enumeration with no admitted member.',
    v_mode;
end $pre$;

-- =================================================================================================
-- §A — THE CHANGE. A catalog comment only. No CREATE OR REPLACE FUNCTION, no DDL on
-- clara.sweep_run_items. REDO-safe by construction (#957): a `comment on` statement always sets
-- the comment fresh, so a second run over this file's own effects reads back identically.
-- =================================================================================================
comment on function clara.admit_autodraft_task(uuid,text,uuid,text,bigint) is
  '#1132: a successful (''admitted'' or ''re_admitted'') outcome from this function writes no clara.sweep_run_items row -- only a refusal or a registry short-circuit (skipped_lane, refused_budget, refused_concurrency, refused_attempts, noop_existing) writes one, and only when p_run_id is not null. To read the REAL admission outcome for a successful admission, read clara.op_receipts where fn=''admit_autodraft_task'' and op_key=''autodraft:''||filing_id||'':''||origin -- the result column carries {outcome, task_id, reserved_tokens}. clara.sweep_run_items.outcome''s CHECK carries no ''admitted'' member by deliberate choice (documentation over enum-widening, #1132''s own ruling): a caller that assumes a sweep_run_item always reflects what THIS function decided reads nothing for a genuinely admitted filing, or reads whatever a LATER settlement wrote instead, which can silently disagree with the admission decision itself.';

-- =================================================================================================
-- §T — TAIL. Every premise re-measured, never trusted.
-- =================================================================================================
do $tail$
declare
  v_comment text;
  v_sha text;
  v_check text;
begin
  -- T.1 · THE BODY IS BYTE-FOR-BYTE UNMOVED — this file changed catalog METADATA only.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
    from pg_proc p where p.oid = 'clara.admit_autodraft_task(uuid,text,uuid,text,bigint)'::regprocedure;
  if to_jsonb(v_sha) is distinct from (select v from _p1132_pre where k = 'fn_sha') then
    raise exception '#1132 tail T.1: clara.admit_autodraft_task''s BODY moved while this file applied -- it must not have (got %)', v_sha
      using errcode='CLR10';
  end if;

  -- T.2 · THE COMMENT IS SET AND NAMES THE TICKET, THE MISSING ROW AND THE REAL READ SITE.
  select obj_description('clara.admit_autodraft_task(uuid,text,uuid,text,bigint)'::regprocedure, 'pg_proc')
    into v_comment;
  if v_comment is null or v_comment not like '#1132:%' then
    raise exception '#1132 tail T.2: clara.admit_autodraft_task does not carry the expected #1132 catalog comment (got %)', v_comment
      using errcode='CLR10';
  end if;
  if position('sweep_run_items' in v_comment) = 0 or position('op_receipts' in v_comment) = 0 then
    raise exception '#1132 tail T.2: the catalog comment must name both clara.sweep_run_items and clara.op_receipts (got %)', v_comment
      using errcode='CLR10';
  end if;

  -- T.3 · THE CHECK CONSTRAINT ON clara.sweep_run_items.outcome IS BYTE-FOR-BYTE UNMOVED — the
  -- enum-widening alternative was NOT taken.
  select pg_get_constraintdef(c.oid) into v_check from pg_constraint c
   where c.conrelid='clara.sweep_run_items'::regclass and c.conname='sweep_run_items_outcome_check';
  if to_jsonb(v_check) is distinct from (select v from _p1132_pre where k = 'check_def') then
    raise exception '#1132 tail T.3: sweep_run_items_outcome_check moved while this file applied -- it must not have (got %)', v_check
      using errcode='CLR10';
  end if;
  if v_check like '%''admitted''%' then
    raise exception '#1132 tail T.3: sweep_run_items_outcome_check now admits ''admitted'' -- this file must not widen the enum'
      using errcode='CLR10';
  end if;

  raise notice '#1132 tail: OK -- clara.admit_autodraft_task carries the #1132 catalog comment (naming both clara.sweep_run_items and clara.op_receipts), its body is byte-identical to the measured pre-image, and clara.sweep_run_items.outcome''s CHECK constraint is byte-identical to the measured pre-image with no ''admitted'' member added.';
end $tail$;
