-- UNNUMBERED_f_a9_chat_token_cap.sql -- Wave-F Track A, F-A9 PR-0:
-- THE CHAT DAILY TOKEN HARD-CAP, REMOVED. A HOTFIX -- live behaviour is already in
-- violation of an owner ruling, so this ships AHEAD of the rest of F-A9.
--
-- Authored UNNUMBERED; the number is claimed at MERGE PREPARATION (standing law,
-- AGENTS.md + .claude/rules/db-migrations.md). Nothing in this file or in the battery
-- keys on the number -- the prestate pins the live body by prosrc SHA-256 and the
-- battery gates on the migration STEM (`f_a9_chat_token_cap`), never a filename.
--
-- LAW OF RECORD. Digest law 76 / SS9 -- "meter, never cap": per-call usage is RECORDED,
-- and a spend-shaped brake on a professional's own work is not the product's to hold.
-- Ruled TA-P12 = A (the brake census) at the 2026-08-22 Track-A sitting; record of
-- record `docs/adr/0074-the-track-a-sitting.md`, member tables
-- `docs/plan/active/track-a-sitting-3.md`. TA-P12 named this ONE gate as
-- already-violating live behaviour and instructed that it ship as its own batch ahead of
-- the item -- which is what this file is.
--
-- SPEC OF RECORD. `docs/plan/active/metering-design.md` SS3.3 gate 1 + SS5's PR-0 row;
-- `docs/plan/active/metering-survey.md` SSA.5(1) (the byte-level derivation) and SSC
-- (the roster consequence); `docs/plan/active/metering-annexes.md` Annex B.1 step 1
-- (this file's contents, enumerated), D21 (the roster), Annex C cell C.9 (the behaviour
-- this file makes true, proven in the battery rather than here).
--
-- =====================================================================================
-- WHAT THIS FILE DOES -- ONE live body, THREE splices, nothing else
-- =====================================================================================
-- `clara.begin_chat_turn(uuid,uuid,text,jsonb,text)` is re-cut ONCE:
--
--   (1) THE SHARED LIMITS SELECT IS REWRITTEN, NOT DELETED. `0006:963-965` is ONE select
--       that loads `daily_token_limit` into `v_token_limit` AND `max_concurrent_runs`
--       into `v_run_cap`, plus a not-found fallback that sets both. The KEPT concurrency
--       check reads `v_run_cap`, so deleting the select would strand it; leaving
--       `daily_token_limit` in it would strand a read of a column F-A9 PR-1B drops
--       (PL/pgSQL is late-bound -- the DROP would succeed and the FIRST chat turn after
--       the window would raise `column ... does not exist`). It is rewritten to load
--       `coalesce(max_concurrent_runs,3)` alone.
--
--   (2) THE TOKEN-BUDGET REFUSAL BLOCK IS REMOVED (`0006:966-974`). It read today's
--       `clara.firm_usage_daily.tokens_used` and raised CLR14 at
--       `tokens_used >= daily_token_limit`. That is the gate the ruling kills.
--
--   (3) THE THREE DECLARATIONS THAT DIE WITH IT are dropped -- `v_token_limit`,
--       `v_tokens_used`, and `v_today` (`0006:929-931`). `v_today`'s ONLY two uses were
--       inside (2), and dropping it is what takes this body OUT of the live
--       bare-clock-token set (S5.25 arm (D)) -- see THE ROSTER, below.
--
-- WHAT IS DELIBERATELY *NOT* IN THIS FILE, each for a stated reason:
--   * THE CONCURRENCY FLOOR IS KEPT, BYTE-UNCHANGED (`0006:976-985`). It is engine
--     protection, not spend -- law 76's own carve-out, and design SS3.3 gate 2's word is
--     "KEEP, byte-unchanged". The tail asserts its text verbatim, character for
--     character, in the recut body. Its CLR14 refusal message is UNTOUCHED for the same
--     reason: survey SSA.5(2) records that this arm writes no `outcome` string (a raised
--     exception only), so it carries no rename obligation. The `refused_budget` rename
--     the ruling mandates belongs to `clara.admit_autodraft_task` and
--     `sweep_run_items.outcome`, batched to PR-1B.
--   * NO COLUMN IS DROPPED. `clara.firm_limits.daily_token_limit` stays until PR-1B's
--     DDL 2, by design -- this file removes the READER, PR-1B disposes the column once
--     the unattended lane's readers are gone too. Cell C.9 exists in that gap and
--     retires when the column does.
--   * `clara.settle_chat_turn` IS UNTOUCHED. It still writes `firm_usage_daily` /
--     `task_usage`; those tables (and the writers that feed them) retire in PR-4, with
--     its own reviewed migration and its own window. This file leaves the METER intact
--     and removes only the BRAKE.
--   * NO TEST DATA IS TOUCHED and no row of any table is read or written by this file.
--
-- THE REST OF THIS PR, named here so a reader of the migration alone is not misled about
-- its blast radius. Removing this gate leaves `begin_chat_turn` raising CLR14 for exactly
-- ONE reason, and the surfaces above it were written for two:
--   * `packages/db/tests/x42-s5-helpers.mjs` -- the S5.25 arm (D) roster loses
--     `begin_chat_turn`, REVERSE-gated on this file's stem (D21; see THE ROSTER below);
--   * `packages/runtime/src/chatRoutes.ts` -- the CLR14 -> 429 mapping attached a
--     daily-budget reset sentence and a next-UTC-midnight timestamp to every CLR14, and
--     `apps/dashboard/app/chat/page.tsx` renders that copy VERBATIM under the DB message.
--     A concurrency floor has no reset instant, so both halves of that pair are now null
--     (law 22 -- a visible record must not lie). The DB message itself is untouched;
--     it already names the live numbers;
--   * the battery: `rig-runtime-metering.test.mjs` (cell C.9 + the meter cell) and
--     `packages/runtime/tests/admission.test.mjs` invert the two cells whose PREMISE was
--     the removed refusal (law 31), and two new cells read the 429 payload and the
--     dashboard banner as VALUES rather than as source text.
--
-- =====================================================================================
-- SS0 QUIESCE INVENTORY (rule D1) -- ONE body, riding window W1
-- =====================================================================================
--   1. clara.begin_chat_turn(uuid,uuid,text,jsonb,text)  [replaced in place]
-- and NOTHING else. `begin_chat_turn` is the runtime's chat-admission hot path
-- (`packages/runtime/src/chatRoutes.ts` calls it on every turn), so an in-flight call
-- finishes on the OLD body. The quiesce guard below refuses to apply while a runtime
-- heartbeat is fresh.
--
-- CREATE OR REPLACE, NEVER DROP+CREATE, AND IT IS LOAD-BEARING. The signature does not
-- change, so there is no overload to retire. A literal DROP followed by CREATE, run as
-- the deploying superuser, would do two silent harms: the recreated body would be OWNED
-- by that superuser, and this is a SECURITY DEFINER function -- it would begin executing
-- as a superuser instead of as `clara_fn_owner`; and the DROP would discard the
-- `clara_runtime` EXECUTE grant (`0006:1176`), so the runtime would take 42501 on the
-- first turn after the window. CREATE OR REPLACE preserves owner and ACL. The tail
-- proves owner, ACL, DEFINER, `search_path` and volatility all unmoved rather than
-- assuming the guarantee.
--
-- SPLICED, NOT RETYPED. The recut is `pg_get_functiondef` -> three exact `replace()`
-- calls -> `execute`. Retyping a 78-line judgement body to change 9 lines of it risks a
-- silent character-level drift in the 69 lines that must NOT move; splicing makes their
-- survival structural rather than careful. Every anchor's occurrence count is asserted
-- BEFORE the splice: two occurrences would splice both, zero would splice nothing while
-- this file reported success.
--
-- PRESTATE PIN. The whole prosrc is pinned by SHA-256, not just the anchors. Measured on
-- a fresh rig at the 0102 frontier (`pnpm db:migrate` + `pnpm db:seed`), never read out
-- of migration text: `clara.begin_chat_turn` has exactly ONE generation in this estate
-- (0006 creates it; no later file re-creates or splices it -- grep-confirmed and
-- rig-confirmed), so its live tip IS `0006:923-999` byte for byte. A mismatch means the
-- body moved for a reason this file does not know about, and the ceremony stops rather
-- than splicing against a premise that is no longer true.
--
-- THE ROSTER, and why it is a test-side edit rather than a SQL one. S5.25 arm (D)'s
-- census (`packages/db/tests/x42-s5-helpers.mjs`) MEASURES, from the live catalog, every
-- `clara` function whose body reads a bare clock token, and compares it to a roster as an
-- exact set equality IN BOTH DIRECTIONS. Dropping `v_today` takes `begin_chat_turn` out
-- of the MEASURED set, so the roster must lose the name in this same PR or the next
-- estate run goes red with a one-name diff. The removal is gated on THIS FILE'S STEM
-- (never its number, which is claimed at merge): the name is pushed back onto the roster
-- on any database that has not applied it, so `db-slice-frontiers`' legs pinned at
-- 0042-0045 -- where this body still reads the clock -- stay green and still fail on a
-- genuine drift. The tail below measures the departure with the census's OWN detector
-- expression, so the two halves are proven from the same instrument.

-- =====================================================================================
-- SS0.0 QUIESCE GUARD (D1) -- refuse to replace a live hot-path body under a live runtime
-- =====================================================================================
do $f_a9_quiesce$
declare v_component text; v_beat timestamptz;
begin
  if to_regclass('clara.runtime_heartbeats') is null then
    raise exception 'F-A9 PR-0 QUIESCE GUARD: clara.runtime_heartbeats is ABSENT -- the catalog has drifted from the migration chain (0006 creates it); refuse rather than guess whether a runtime is live'
      using errcode='CLR10';
  end if;
  select h.component, h.beat_at into v_component, v_beat from clara.runtime_heartbeats h
   where h.beat_at > now() - interval '90 seconds' order by h.beat_at desc limit 1;
  if v_component is not null then
    raise exception 'F-A9 PR-0 QUIESCE GUARD: a runtime heartbeat is fresh (component %, beat_at %) -- this file replaces clara.begin_chat_turn, the chat-admission hot path, and an in-flight call finishes on the OLD body (D1); stop clara-runtime, wait for staleness (>90s), and re-apply',
      v_component, v_beat
      using errcode='CLR10';
  end if;
end
$f_a9_quiesce$;

-- =====================================================================================
-- SS0.1 PRESTATE -- every claim this file makes about what it is editing, measured
-- =====================================================================================
do $f_a9_pre$
declare v_src text; v_def text; v_sha text; v_n int; v_owner text; v_acl text; v_cfg text[];
begin
  -- (0.1) THE TARGET EXISTS, EXACTLY ONCE. A prior recut that CREATEd an overload rather
  -- than REPLACING the live body would leave the old shape reachable (the 0054:132-146
  -- lesson) -- and this file's splice would then fix one of two live gates.
  begin
    perform 'clara.begin_chat_turn(uuid,uuid,text,jsonb,text)'::regprocedure;
  exception when others then
    raise exception 'F-A9 PR-0 prestate: clara.begin_chat_turn(uuid,uuid,text,jsonb,text) does not exist -- the Slice-4 runtime core (0006) is not live' using errcode='CLR10';
  end;
  select count(*)::int into v_n from pg_proc p
   where p.pronamespace='clara'::regnamespace and p.proname='begin_chat_turn';
  if v_n <> 1 then
    raise exception 'F-A9 PR-0 prestate: expected exactly 1 begin_chat_turn body, found % -- an overload this file does not know about would keep the capped shape reachable', v_n
      using errcode='CLR10';
  end if;

  select p.prosrc into v_src from pg_proc p where p.oid='clara.begin_chat_turn(uuid,uuid,text,jsonb,text)'::regprocedure;
  if v_src is null then
    raise exception 'F-A9 PR-0 prestate: clara.begin_chat_turn is GONE' using errcode='CLR10';
  end if;

  -- (0.2) NOT ALREADY APPLIED. Checked BEFORE the sha pin, deliberately: a re-run would
  -- fail the pin too, and "sha mismatch" is the wrong diagnosis to hand an operator who
  -- simply ran the ceremony twice.
  if position('daily_token_limit' in v_src) = 0 then
    raise exception 'F-A9 PR-0 prestate: clara.begin_chat_turn no longer reads daily_token_limit -- the cap removal looks ALREADY APPLIED (or the body moved); refuse rather than splice a body this file does not recognise' using errcode='CLR10';
  end if;

  -- (0.3) THE BODY IS THE 0006 TIP, PINNED BY PROSRC SHA-256. See the header's PRESTATE
  -- PIN section for why the whole body and not merely the anchors.
  v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
  if v_sha <> 'f8df7588a1e383480d69734be4be2d5ffc3c975987cfa9e23df8673c59c85c72' then
    raise exception 'F-A9 PR-0 prestate: clara.begin_chat_turn prosrc sha256 mismatch (got %, expected f8df7588a1e383480d69734be4be2d5ffc3c975987cfa9e23df8673c59c85c72) -- this is NOT the single-generation 0006 body the splice anchors below were verified against. Either a migration this file does not know about re-cut it, or it moved for some other reason. STOP; do not re-cut against a wrong premise', v_sha
      using errcode='CLR10';
  end if;

  -- (0.4) THE FOUR ANCHORS, counted on the DEFINITION -- the same text `replace` will run
  -- against. Three are spliced; the fourth (the KEPT concurrency block) is counted here so
  -- the tail's verbatim-survival assertion is a differential against a measured prestate
  -- rather than a self-referential read of this file's own output.
  v_def := pg_get_functiondef('clara.begin_chat_turn(uuid,uuid,text,jsonb,text)'::regprocedure);

  v_n := (length(v_def) - length(replace(v_def, $anc1$  v_token_limit bigint; v_run_cap int;
  v_today date := (now() at time zone 'UTC')::date;
  v_tokens_used bigint; v_active int; v_task uuid;
$anc1$, ''))) / length($anc1$  v_token_limit bigint; v_run_cap int;
  v_today date := (now() at time zone 'UTC')::date;
  v_tokens_used bigint; v_active int; v_task uuid;
$anc1$);
  if v_n <> 1 then
    raise exception 'F-A9 PR-0 prestate: the declaration block occurs % time(s) (expected exactly 1)', v_n using errcode='CLR10';
  end if;

  v_n := (length(v_def) - length(replace(v_def, $anc2$  select coalesce(daily_token_limit, 1000000), coalesce(max_concurrent_runs, 3)
    into v_token_limit, v_run_cap from clara.firm_limits where firm_id = v_firm;
  if not found then v_token_limit := 1000000; v_run_cap := 3; end if;
$anc2$, ''))) / length($anc2$  select coalesce(daily_token_limit, 1000000), coalesce(max_concurrent_runs, 3)
    into v_token_limit, v_run_cap from clara.firm_limits where firm_id = v_firm;
  if not found then v_token_limit := 1000000; v_run_cap := 3; end if;
$anc2$);
  if v_n <> 1 then
    raise exception 'F-A9 PR-0 prestate: the shared limits SELECT occurs % time(s) (expected exactly 1)', v_n using errcode='CLR10';
  end if;

  v_n := (length(v_def) - length(replace(v_def, $anc3$
  -- Budget (fail-closed): reject NEW work when the UTC day is already at/over limit.
  -- Overshoot ≤ the in-flight admitted runs' spend (they check at admission, settle later).
  select coalesce(tokens_used, 0) into v_tokens_used
    from clara.firm_usage_daily where firm_id = v_firm and usage_date = v_today;
  if coalesce(v_tokens_used, 0) >= v_token_limit then
    raise exception 'daily token budget exhausted for firm (used %/% tokens on UTC day %; resets 00:00 UTC / 08:00 MYT)',
      coalesce(v_tokens_used, 0), v_token_limit, v_today using errcode = 'CLR14';
  end if;
$anc3$, ''))) / length($anc3$
  -- Budget (fail-closed): reject NEW work when the UTC day is already at/over limit.
  -- Overshoot ≤ the in-flight admitted runs' spend (they check at admission, settle later).
  select coalesce(tokens_used, 0) into v_tokens_used
    from clara.firm_usage_daily where firm_id = v_firm and usage_date = v_today;
  if coalesce(v_tokens_used, 0) >= v_token_limit then
    raise exception 'daily token budget exhausted for firm (used %/% tokens on UTC day %; resets 00:00 UTC / 08:00 MYT)',
      coalesce(v_tokens_used, 0), v_token_limit, v_today using errcode = 'CLR14';
  end if;
$anc3$);
  if v_n <> 1 then
    raise exception 'F-A9 PR-0 prestate: the token-budget refusal block occurs % time(s) (expected exactly 1)', v_n using errcode='CLR10';
  end if;

  v_n := (length(v_def) - length(replace(v_def, $anc4$  -- Compute-cap: count COMPUTE runs only (queued/running/cancel_requested chat tasks).
  -- held + awaiting_input are zero-compute and consume NO slot (§0.4 / S4-C7/ND3).
  -- Race-free under the per-firm advisory lock (S4-P5: advisory-lock + count + insert).
  select count(*) into v_active from clara.agent_tasks
    where firm_id = v_firm and kind = 'chat_turn'
      and status in ('queued','running','cancel_requested');
  if v_active >= v_run_cap then
    raise exception 'concurrent compute-run cap reached for firm (% of % running)', v_active, v_run_cap
      using errcode = 'CLR14';
  end if;
$anc4$, ''))) / length($anc4$  -- Compute-cap: count COMPUTE runs only (queued/running/cancel_requested chat tasks).
  -- held + awaiting_input are zero-compute and consume NO slot (§0.4 / S4-C7/ND3).
  -- Race-free under the per-firm advisory lock (S4-P5: advisory-lock + count + insert).
  select count(*) into v_active from clara.agent_tasks
    where firm_id = v_firm and kind = 'chat_turn'
      and status in ('queued','running','cancel_requested');
  if v_active >= v_run_cap then
    raise exception 'concurrent compute-run cap reached for firm (% of % running)', v_active, v_run_cap
      using errcode = 'CLR14';
  end if;
$anc4$);
  if v_n <> 1 then
    raise exception 'F-A9 PR-0 prestate: the KEPT concurrency block occurs % time(s) (expected exactly 1) -- the tail cannot prove its survival against a prestate it could not measure', v_n using errcode='CLR10';
  end if;

  -- (0.5) THE SECURITY SHAPE, captured so the tail is a differential rather than a wish.
  select pg_get_userbyid(p.proowner), coalesce(p.proacl::text,'(null)'), p.proconfig
    into v_owner, v_acl, v_cfg
    from pg_proc p where p.oid='clara.begin_chat_turn(uuid,uuid,text,jsonb,text)'::regprocedure;
  if v_owner <> 'clara_fn_owner' then
    raise exception 'F-A9 PR-0 prestate: clara.begin_chat_turn is owned by % (expected clara_fn_owner) -- a SECURITY DEFINER body running as an unexpected role is not a premise this file will splice against', v_owner using errcode='CLR10';
  end if;
  if v_acl not like '%clara_runtime=X%' then
    raise exception 'F-A9 PR-0 prestate: clara_runtime does not hold EXECUTE on clara.begin_chat_turn (acl %) -- the runtime cannot already be calling the body this file is about to replace', v_acl using errcode='CLR10';
  end if;
  -- CREATE first, INSERT second, deliberately: PL/pgSQL substitutes variables into
  -- ordinary SQL statements but NOT into utility statements, so a
  -- `create temporary table ... as select v_sha ...` would not see these variables.
  create temporary table f_a9_pr0_prestate (sha text, pre_owner text, acl text, cfg text[]) on commit drop;
  insert into f_a9_pr0_prestate (sha, pre_owner, acl, cfg) values (v_sha, v_owner, v_acl, v_cfg);

  raise notice 'F-A9 PR-0 prestate: clean -- clara.begin_chat_turn is the single-generation 0006 body (sha %), owned by % with clara_runtime EXECUTE, all four anchors unique, and the cap is not already removed', v_sha, v_owner;
end
$f_a9_pre$;

-- =====================================================================================
-- SS1 THE RECUT -- one body, three splices, one replace-and-execute
-- =====================================================================================
do $f_a9_cut$
declare v_def text; v_next text; v_a text;
begin
  v_def := pg_get_functiondef('clara.begin_chat_turn(uuid,uuid,text,jsonb,text)'::regprocedure);
  v_next := v_def;

  -- (1) the three dead declarations go. `v_today` leaves with them, and that departure is
  -- the whole of this file's S5.25 arm (D) consequence.
  v_a := $anc1$  v_token_limit bigint; v_run_cap int;
  v_today date := (now() at time zone 'UTC')::date;
  v_tokens_used bigint; v_active int; v_task uuid;
$anc1$;
  v_next := replace(v_next, v_a, $new1$  v_run_cap int;
  v_active int; v_task uuid;
$new1$);

  -- (2) the shared limits SELECT is REWRITTEN to load max_concurrent_runs alone. Its
  -- comment keeps its own SS0.4 cite -- the fn-constant default discipline is unchanged,
  -- there is simply one constant left instead of two.
  v_a := $anc2$  select coalesce(daily_token_limit, 1000000), coalesce(max_concurrent_runs, 3)
    into v_token_limit, v_run_cap from clara.firm_limits where firm_id = v_firm;
  if not found then v_token_limit := 1000000; v_run_cap := 3; end if;
$anc2$;
  v_next := replace(v_next, v_a, $new2$  select coalesce(max_concurrent_runs, 3)
    into v_run_cap from clara.firm_limits where firm_id = v_firm;
  if not found then v_run_cap := 3; end if;
$new2$);

  -- (3) the token-budget refusal block goes, comment and all. What replaces it is a
  -- comment that says WHY the gate is absent, so a future reader does not restore it as
  -- a missing safety belt: it was removed deliberately, by an owner ruling, and the
  -- meter that replaces it is a record rather than a brake.
  v_a := $anc3$
  -- Budget (fail-closed): reject NEW work when the UTC day is already at/over limit.
  -- Overshoot ≤ the in-flight admitted runs' spend (they check at admission, settle later).
  select coalesce(tokens_used, 0) into v_tokens_used
    from clara.firm_usage_daily where firm_id = v_firm and usage_date = v_today;
  if coalesce(v_tokens_used, 0) >= v_token_limit then
    raise exception 'daily token budget exhausted for firm (used %/% tokens on UTC day %; resets 00:00 UTC / 08:00 MYT)',
      coalesce(v_tokens_used, 0), v_token_limit, v_today using errcode = 'CLR14';
  end if;
$anc3$;
  v_next := replace(v_next, v_a, $new3$
  -- NO SPEND REFUSAL HERE, AND ITS ABSENCE IS DELIBERATE (F-A9 PR-0, digest law 76 /
  -- §9 "meter, never cap"; owner ruling TA-P12 = A, 2026-08-22 Track-A sitting). This
  -- body used to refuse a new turn once the firm's per-UTC-day token total reached the
  -- configured limit. That gate is GONE: a professional's own work is not throttled by
  -- a spend budget. Usage is still RECORDED at settle -- the meter stays, the brake does
  -- not. The only refusal left below is the CONCURRENCY floor, which is engine
  -- protection (law 76's carve-out), not spend.
$new3$);

  if v_next = v_def then
    raise exception 'F-A9 PR-0 SS1: the recut produced a byte-identical definition -- no splice applied' using errcode='CLR10';
  end if;
  execute v_next;
  raise notice 'F-A9 PR-0 SS1: clara.begin_chat_turn recut -- the daily token-budget refusal is removed, the shared limits select now loads max_concurrent_runs alone, and v_token_limit/v_tokens_used/v_today are gone';
end
$f_a9_cut$;

-- =====================================================================================
-- SS2 TAIL SELF-PROOF -- raises on failure; every claim measured against the prestate
-- =====================================================================================
do $f_a9_tail$
declare
  v_src text; v_sha text; v_n int; v_owner text; v_acl text; v_cfg text[];
  v_pre record; v_flagged boolean; v_re text;
begin
  select * into v_pre from f_a9_pr0_prestate;

  select count(*)::int into v_n from pg_proc p
   where p.pronamespace='clara'::regnamespace and p.proname='begin_chat_turn';
  if v_n <> 1 then
    raise exception 'F-A9 PR-0 tail: begin_chat_turn now has % bodies (expected exactly 1) -- the recut created an overload instead of replacing the live body', v_n using errcode='CLR10';
  end if;

  select p.prosrc, pg_get_userbyid(p.proowner), coalesce(p.proacl::text,'(null)'), p.proconfig
    into v_src, v_owner, v_acl, v_cfg
    from pg_proc p where p.oid='clara.begin_chat_turn(uuid,uuid,text,jsonb,text)'::regprocedure;
  v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
  if v_sha = v_pre.sha then
    raise exception 'F-A9 PR-0 tail: the prosrc sha is UNCHANGED (%) -- the body was not replaced', v_sha using errcode='CLR10';
  end if;

  -- (2.1) THE CAP IS GONE. Three independent negative reads: the column, the ledger table
  -- it consulted, and the three dead variables. Any one surviving is a stranded read that
  -- PR-1B's column drop would turn into a runtime failure on the first chat turn.
  if position('daily_token_limit' in v_src) <> 0 then
    raise exception 'F-A9 PR-0 tail: the recut body still reads firm_limits.daily_token_limit -- PR-1B drops that column and PL/pgSQL is late-bound, so this would pass here and kill every chat turn after that window' using errcode='CLR10';
  end if;
  if position('firm_usage_daily' in v_src) <> 0 then
    raise exception 'F-A9 PR-0 tail: the recut body still reads clara.firm_usage_daily -- the budget block was not fully removed' using errcode='CLR10';
  end if;
  if position('v_token_limit' in v_src) <> 0 or position('v_tokens_used' in v_src) <> 0 or position('v_today' in v_src) <> 0 then
    raise exception 'F-A9 PR-0 tail: one of v_token_limit / v_tokens_used / v_today survives in the recut body -- a declaration without a use, or worse, a use this file did not find' using errcode='CLR10';
  end if;
  if position('CLR14' in v_src) = 0 then
    raise exception 'F-A9 PR-0 tail: CLR14 is absent from the recut body -- the KEPT concurrency refusal was removed with the budget block' using errcode='CLR10';
  end if;

  -- (2.2) THE CONCURRENCY FLOOR SURVIVED BYTE-FOR-BYTE. Counted, not merely present: the
  -- prestate measured exactly one occurrence, so exactly one must remain.
  v_n := (length(v_src) - length(replace(v_src, $anc4$  -- Compute-cap: count COMPUTE runs only (queued/running/cancel_requested chat tasks).
  -- held + awaiting_input are zero-compute and consume NO slot (§0.4 / S4-C7/ND3).
  -- Race-free under the per-firm advisory lock (S4-P5: advisory-lock + count + insert).
  select count(*) into v_active from clara.agent_tasks
    where firm_id = v_firm and kind = 'chat_turn'
      and status in ('queued','running','cancel_requested');
  if v_active >= v_run_cap then
    raise exception 'concurrent compute-run cap reached for firm (% of % running)', v_active, v_run_cap
      using errcode = 'CLR14';
  end if;
$anc4$, ''))) / length($anc4$  -- Compute-cap: count COMPUTE runs only (queued/running/cancel_requested chat tasks).
  -- held + awaiting_input are zero-compute and consume NO slot (§0.4 / S4-C7/ND3).
  -- Race-free under the per-firm advisory lock (S4-P5: advisory-lock + count + insert).
  select count(*) into v_active from clara.agent_tasks
    where firm_id = v_firm and kind = 'chat_turn'
      and status in ('queued','running','cancel_requested');
  if v_active >= v_run_cap then
    raise exception 'concurrent compute-run cap reached for firm (% of % running)', v_active, v_run_cap
      using errcode = 'CLR14';
  end if;
$anc4$);
  if v_n <> 1 then
    raise exception 'F-A9 PR-0 tail: the KEPT concurrency block occurs % time(s) in the recut body (expected exactly 1, byte-unchanged) -- design §3.3 gate 2 says KEEP, byte-unchanged', v_n using errcode='CLR10';
  end if;

  -- (2.3) THE REST OF THE BODY IS UNMOVED. Four load-bearing arms this file never names,
  -- read positively so their survival is evidence rather than an absence of complaint.
  if position('pg_advisory_xact_lock(202991617, hashtext(v_firm::text))' in v_src) = 0 then
    raise exception 'F-A9 PR-0 tail: the namespaced admission lock (S4-ND6) is missing from the recut body' using errcode='CLR10';
  end if;
  if position($m$where session_id = p_session and turn_key = p_turn_key and role = 'user' limit 1$m$ in v_src) = 0 then
    raise exception 'F-A9 PR-0 tail: the turn_key replay read is missing from the recut body' using errcode='CLR10';
  end if;
  if position($m$if v_visibility = 'private' and v_created_by <> p_author then$m$ in v_src) = 0 then
    raise exception 'F-A9 PR-0 tail: the private-session continuation authority (ruling 9, the no-oracle arm) is missing from the recut body' using errcode='CLR10';
  end if;
  if position($m$raise exception 'a turn is already live for this session' using errcode = 'CLR13';$m$ in v_src) = 0 then
    raise exception 'F-A9 PR-0 tail: the one-live-turn CLR13 mapping is missing from the recut body' using errcode='CLR10';
  end if;
  v_n := (length(v_src) - length(replace(v_src, 'max_concurrent_runs', ''))) / length('max_concurrent_runs');
  if v_n <> 1 then
    raise exception 'F-A9 PR-0 tail: max_concurrent_runs is read % time(s) (expected exactly 1 -- the rewritten shared select)', v_n using errcode='CLR10';
  end if;

  -- (2.4) THE SECURITY SHAPE IS UNMOVED -- a differential against the prestate's own
  -- capture, which is the whole reason CREATE OR REPLACE was used instead of DROP+CREATE.
  if v_owner <> v_pre.pre_owner then
    raise exception 'F-A9 PR-0 tail: owner moved from % to % -- a SECURITY DEFINER body that changed owner changed WHO it executes as', v_pre.pre_owner, v_owner using errcode='CLR10';
  end if;
  if v_acl <> v_pre.acl then
    raise exception 'F-A9 PR-0 tail: proacl moved from % to %', v_pre.acl, v_acl using errcode='CLR10';
  end if;
  if v_cfg is distinct from v_pre.cfg then
    raise exception 'F-A9 PR-0 tail: proconfig (search_path) moved from % to %', v_pre.cfg, v_cfg using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_proc p
   where p.oid='clara.begin_chat_turn(uuid,uuid,text,jsonb,text)'::regprocedure
     and p.prosecdef and p.provolatile='v' and p.prolang=(select oid from pg_language where lanname='plpgsql');
  if v_n <> 1 then
    raise exception 'F-A9 PR-0 tail: the recut body is no longer a VOLATILE plpgsql SECURITY DEFINER function' using errcode='CLR10';
  end if;

  -- (2.5) THE ROSTER DEPARTURE, MEASURED WITH THE CENSUS'S OWN INSTRUMENT. This is the
  -- DB-side half of the x42-s5-helpers.mjs edit that ships in the same PR: the detector
  -- expression and the regex below are the census's (x42b2-s5c-clock.test.mjs.6), copied
  -- verbatim, so the two halves cannot disagree about what "reads a bare clock token"
  -- means. If this body still flagged, the roster edit would be a lie and the next estate
  -- run would go red on a one-name diff.
  v_re := '\m(now\(\)|current_timestamp\M|localtimestamp\M|clock_timestamp\(\)|statement_timestamp\(\)|transaction_timestamp\(\))';
  select lower(regexp_replace(regexp_replace(regexp_replace(
           coalesce(p.prosrc,'')||coalesce(pg_get_functiondef(p.oid),''),
           '/\*[\s\S]*?\*/','','g'),'--[^\n]*','','g'),'\s+',' ','g')) ~* v_re
    into v_flagged
    from pg_proc p where p.oid='clara.begin_chat_turn(uuid,uuid,text,jsonb,text)'::regprocedure;
  if v_flagged then
    raise exception 'F-A9 PR-0 tail: clara.begin_chat_turn STILL flags on S5.25 arm (D)''s bare-clock detector -- the roster edit in this PR removes the name, so a body that still reads a clock would redden the census in both directions' using errcode='CLR10';
  end if;

  raise notice 'F-A9 PR-0 tail: OK -- clara.begin_chat_turn is recut (sha % -> %); the daily token cap is gone (no daily_token_limit read, no firm_usage_daily read, no v_token_limit/v_tokens_used/v_today); the concurrency floor survives BYTE-UNCHANGED (exactly 1 occurrence, CLR14 intact) and max_concurrent_runs is read exactly once; the advisory lock, the turn_key replay, the private-session no-oracle arm and the CLR13 one-live-turn mapping are all present; owner (%), proacl and search_path are unmoved and the body is still VOLATILE plpgsql SECURITY DEFINER; and the body no longer flags on S5.25 arm (D)''s own bare-clock detector, which is the measured basis for this PR''s roster removal. NO column was dropped (firm_limits.daily_token_limit is PR-1B''s), settle_chat_turn is untouched, and no row of any table was read or written. No table in workflow/graphile_worker/spike touched. D1 write-quiesce taken (ONE body).',
    v_pre.sha, v_sha, v_owner;
end
$f_a9_tail$;
