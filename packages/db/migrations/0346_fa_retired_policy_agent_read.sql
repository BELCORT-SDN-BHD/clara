-- 0346_fa_retired_policy_agent_read — #1092 (rider; sweep wave, lane 05): THE RUNTIME READ
-- CREDENTIAL REACHES A CLIENT'S DEFAULT DEPRECIATION POLICIES, SO THE FIXED-ASSET PARTICULARS
-- PROPOSAL'S `retired_account_policy` GROUND CAN FIRE.
-- =====================================================================================
-- Spec of record: issue #1092's Agent Brief (body only; `gh issue view 1092 --comments` returns
-- ZERO comments, so there is no later owner ruling to override it). Originating ticket #933
-- (`docs/plan/active/riders-2026-09-20/reports/wave4-lane05-ticket933.md`, follow-up 2) named the
-- gap; this lane's #1090 closed the sibling `client_knowledge` gap one ground above it.
--
-- THE GAP, RE-MEASURED ON THIS LANE DATABASE BEFORE THIS FILE WAS WRITTEN.
-- `packages/runtime/lib/fa-particulars-proposal.ts` already accepts, ranks and tests a
-- `retired_account_policy` ground (`FaProposalRetiredPolicy`, ranked below `client_knowledge` and
-- above `account_siblings`). The rows it would come from live in
-- `clara.fa_account_depreciation_policies` (#932, 0277 §A). Measured live, moments before this
-- file: `has_table_privilege('clara_agent_ro', 'clara.fa_account_depreciation_policies', 'SELECT')`
-- is FALSE, `clara_runtime`'s is FALSE, every wake role's is FALSE, and the relation carries
-- exactly two policies — `p_fadp_owner` (`clara_fn_owner`, ALL) and `p_fadp_human`
-- (`clara_authenticated`, SELECT, `firm_id = clara.jwt_firm()`), 0277:299-308. So the ground is
-- unreachable by construction and the proposal falls through to `account_siblings` every time.
--
-- WHAT THIS FILE ADDS, IN ONE SENTENCE. ONE read policy (`p_fadp_agent`) and ONE table-level
-- SELECT grant for `clara_agent_ro` — and NOTHING else: no function, no column, no index, no door,
-- no widening of any other role, and no change to the two write doors, which stay
-- `clara_authenticated`-only (the tail re-measures that rather than claiming it).
--
-- WHY `clara_agent_ro` AND NOT `clara_runtime`. The read that consumes this is the proposal's
-- input-loading step, and a workflow step reads under the run's own OBO READ credential:
-- `readScoped` (packages/runtime/workflows/chatTurn.v15.infra.ts, byte-carried from v14) checks a
-- connection out of the READ pool, whose group role is `clara_agent_ro`
-- (`packages/runtime/lib/pools.mjs:101`, `POOL_ROLES.read`). That is the SAME credential
-- `loadPendingFixedAssetStepV4` already reads the register itself with
-- (`claraWork.v4.impl.ts:673-698`, under `p_fixed_assets_agent`). `clara_runtime` is the
-- unscoped service identity; granting it here would put a client's policy rows behind a
-- credential that carries no firm at all, for a read that has a firm-walled credential available.
-- It is deliberately left with nothing.
--
-- WHY THE POLICY IS PLAIN TENANCY (`firm_id = clara.wake_firm()`) AND NOT "RETIRED ROWS ONLY",
-- WHICH WAS THIS FILE'S FIRST DRAFT AND IS THE NARROWER WALL. The ticket's title says "retired
-- depreciation policies", and `... and not active` would have been tighter. It was rejected for a
-- measured reason, not a stylistic one: THE READ'S OWN HONESTY GUARD NEEDS TO SEE THE LIVE ROW.
-- `clara.set_fa_depreciation_policy` is version-forward — setting a policy again retires version N
-- and inserts version N+1 (0277 §D) — so an account can hold a RETIRED version 1 underneath a LIVE
-- version 2. A register row that was already pending when version 2 landed still opens a question,
-- and a step that proposed from the retired version 1 while a live version 2 says something else
-- would be putting a SUPERSEDED human judgement on a form under Clara's own sentence ("the one a
-- person of this firm signed for it (version 1) and later retired said …"). The read therefore
-- carries `and not exists (… where q.active)` — see `FA_RETIRED_ACCOUNT_POLICY_SQL` in
-- `packages/runtime/lib/fa-particulars-proposal.ts`, the statement's one home. Under a
-- retired-only RLS policy that sub-select would see nothing and ALWAYS pass: the guard would be
-- vacuous under the very credential that runs it, which is worse than a slightly wider read.
-- `fp.read` drives both arms, and its own vacuity control shows the guard is what suppresses the
-- superseded row.
--
-- WHAT THAT WIDENING ACTUALLY COSTS, MEASURED RATHER THAN ASSERTED. `clara_agent_ro` ALREADY holds
-- table-level SELECT on `clara.fixed_assets` under `p_fixed_assets_agent` (`firm_id =
-- clara.wake_firm()`) — measured live on this rig — and that register carries the SAME five
-- drivers per ASSET (`depreciation_method`, `useful_life_months`, `depreciation_rate_bps`,
-- `residual_cents`, `cost_cents`). A per-account DEFAULT of those same drivers is therefore not a
-- new class of data for this credential; it is the account-level statement of what the credential
-- can already read row by row. The shape used here is the estate's own: 52 of the 52 policies
-- `clara_agent_ro` holds today are plain tenancy predicates, and the ONE table-level column grant
-- anywhere in this estate is an UPDATE pair on `clara.wake_intents` — so a column-level SELECT
-- grant would have been a novel mechanism with no precedent and a silent-by-default failure mode
-- for every column added later.
--
-- WHAT STAYS SHUT, AND IS ASSERTED RATHER THAN ASSUMED (tail §Z):
--   * SELECT and only SELECT for `clara_agent_ro` (INSERT/UPDATE/DELETE/TRUNCATE all absent);
--   * `clara_runtime`, `clara_wake_interactive`, `clara_wake_proactive`, `clara_freeform_ro` and
--     PUBLIC gain nothing — each named, so a later grant to any of them fails here;
--   * `clara.set_fa_depreciation_policy` and `clara.retire_fa_depreciation_policy` keep EXECUTE
--     for `clara_authenticated` alone and stay byte-identical to §0's pins;
--   * `p_fadp_human`'s own predicate is untouched (the ticket's own out-of-scope: "granting the
--     human-authenticated role anything beyond what it already has").
--
-- IT RECUTS NO FUNCTION. `clara.wake_firm`, the two policy doors and the two 0292-recut birth
-- bodies are RELIED ON, unmodified, and pinned in §0 and re-measured in §Z.
--
-- WHAT THIS FILE DELIBERATELY DOES NOT DO. It does not touch `deriveFaParticularsProposal` or its
-- ranking order (the ticket's own out-of-scope). It does not build the input-loading step:
-- `loadFaProposalInputsStepV6` does not exist in this repository (`packages/runtime/workflows/
-- claraWork.v6.impl.ts` is absent, `registry.ts` still resolves `claraWork_v5`) and it lives
-- inside a frozen-workflow closure this lane must never create or edit (work order rule 5), so the
-- read and the mapping are delivered as an exported SQL constant plus a pure mapper in the
-- NON-frozen `packages/runtime/lib/fa-particulars-proposal.ts`, and as a successor contract in
-- this ticket's report — the same posture #933 and #1090 both took for the same unbuilt step.
-- =====================================================================================

-- =====================================================================================
-- §0 — PRESTATE. Fail closed: the relation must exist with RLS enabled AND forced, the agent
-- policy must be either ABSENT (a fresh apply) or already present with EXACTLY this file's own
-- predicate (a #957 REDO no-op — idempotent by construction), the two human-side policies 0277
-- created must be exactly as 0277 left them, and the five neighbour bodies this file relies on
-- without recutting must still carry the EXACT prosrc they were measured at, on this rig, moments
-- before this file was authored (after this lane's #1056 and #1090, neither of which touches any
-- of them).
-- =====================================================================================
do $prestate$
declare
  v_n int; v_rls boolean; v_force boolean; v_qual text; v_cmd "char"; v_roles text[];
  v_sha text;
  -- The five neighbour bodies, measured LIVE on clara_l03 (PG 17, chain 0001..0345) immediately
  -- before this file was authored — never transcribed from an earlier migration's header.
  c_wake_firm      constant text := '76311c51e878a658085bc36fee28d0175eacb2b0dbff3d6dec44f80239cbfabc';
  c_set_policy     constant text := '11f0aa0a82334438bebb3dadd1c990c08ebd0b014eabf7d86d41204c2820b67d';
  c_retire_policy  constant text := 'f75d3f25b690ad8ceabac201403180f0f67af19ba578cb816a14e11b9ac8c05e';
  c_birth          constant text := 'a584e946f9d99b881a6e856fb792823decbdbe9fd5fb2851702b85475395b69c';
  c_on_approve     constant text := '412fd7a04886676dfc8c93696fec4f5878b9a6821cb31472f203c3695faf643b';
begin
  if to_regclass('clara.fa_account_depreciation_policies') is null then
    raise exception '#1092 prestate: clara.fa_account_depreciation_policies is absent -- 0277 must apply first'
      using errcode = 'CLR10';
  end if;
  select c.relrowsecurity, c.relforcerowsecurity into v_rls, v_force
    from pg_class c where c.oid = 'clara.fa_account_depreciation_policies'::regclass;
  if not (v_rls and v_force) then
    raise exception '#1092 prestate: clara.fa_account_depreciation_policies is not RLS enabled+forced (enabled=%, forced=%) -- a grant onto an unwalled relation would be a firm-wide read',
      v_rls, v_force using errcode = 'CLR10';
  end if;

  -- 0277's OWN TWO POLICIES, unmoved. The human read's predicate is pinned because this ticket's
  -- out-of-scope names it: nothing here may widen what clara_authenticated already has.
  select pg_get_expr(p.polqual, p.polrelid), p.polcmd into v_qual, v_cmd
    from pg_policy p where p.polrelid = 'clara.fa_account_depreciation_policies'::regclass
     and p.polname = 'p_fadp_human';
  if not found or v_cmd <> 'r' or v_qual <> '(firm_id = clara.jwt_firm())' then
    raise exception '#1092 prestate: p_fadp_human is not 0277''s own SELECT policy (cmd=%, qual=%)', v_cmd, v_qual
      using errcode = 'CLR10';
  end if;
  select pg_get_expr(p.polqual, p.polrelid), p.polcmd into v_qual, v_cmd
    from pg_policy p where p.polrelid = 'clara.fa_account_depreciation_policies'::regclass
     and p.polname = 'p_fadp_owner';
  if not found or v_cmd <> '*' or v_qual <> 'true' then
    raise exception '#1092 prestate: p_fadp_owner is not 0277''s own definer-owner policy (cmd=%, qual=%)', v_cmd, v_qual
      using errcode = 'CLR10';
  end if;

  -- THE AGENT POLICY: absent (fresh apply) or already exactly this file's own (redo no-op).
  select pg_get_expr(p.polqual, p.polrelid), p.polcmd,
         (select array_agg(r.rolname order by r.rolname) from pg_roles r where r.oid = any(p.polroles))
    into v_qual, v_cmd, v_roles
    from pg_policy p where p.polrelid = 'clara.fa_account_depreciation_policies'::regclass
     and p.polname = 'p_fadp_agent';
  if found and (v_cmd <> 'r' or v_qual <> '(firm_id = clara.wake_firm())'
                or v_roles is distinct from array['clara_agent_ro']::text[]) then
    raise exception '#1092 prestate: p_fadp_agent already exists with a DIFFERENT shape (cmd=%, qual=%, roles=%) -- this is neither a fresh apply nor a redo of this unedited file',
      v_cmd, v_qual, v_roles using errcode = 'CLR10';
  end if;

  -- NOBODY BUT THE TWO 0277 GRANTEES (and, on a redo, clara_agent_ro) HOLDS ANYTHING HERE. A
  -- third grantee means some other change landed on this relation and this file's claims about
  -- "what stays shut" would be stale.
  select count(*)::int into v_n
    from information_schema.role_table_grants
   where table_schema = 'clara' and table_name = 'fa_account_depreciation_policies'
     and grantee not in ('clara_fn_owner', 'clara_authenticated', 'clara_agent_ro');
  if v_n <> 0 then
    raise exception '#1092 prestate: % unexpected grantee row(s) on clara.fa_account_depreciation_policies -- re-derive this file against the live ACL', v_n
      using errcode = 'CLR10';
  end if;

  -- THE FIVE NEIGHBOUR BODIES THIS FILE RELIES ON WITHOUT RECUTTING.
  select encode(sha256(prosrc::bytea), 'hex') into v_sha
    from pg_proc where oid = 'clara.wake_firm()'::regprocedure;
  if v_sha is distinct from c_wake_firm then
    raise exception '#1092 prestate: clara.wake_firm carries prosrc sha256 % -- the policy predicate this file installs means whatever THAT body means, so it is pinned; re-measure before authoring', v_sha
      using errcode = 'CLR10';
  end if;
  select encode(sha256(prosrc::bytea), 'hex') into v_sha
    from pg_proc where oid = 'clara.set_fa_depreciation_policy(uuid,text,text,integer,integer,bigint,text,text)'::regprocedure;
  if v_sha is distinct from c_set_policy then
    raise exception '#1092 prestate: clara.set_fa_depreciation_policy carries prosrc sha256 % -- not the version-forward body this file''s read guard is derived from', v_sha
      using errcode = 'CLR10';
  end if;
  select encode(sha256(prosrc::bytea), 'hex') into v_sha
    from pg_proc where oid = 'clara.retire_fa_depreciation_policy(uuid,text,text,text)'::regprocedure;
  if v_sha is distinct from c_retire_policy then
    raise exception '#1092 prestate: clara.retire_fa_depreciation_policy carries prosrc sha256 %', v_sha
      using errcode = 'CLR10';
  end if;
  -- The two 0292-recut birth bodies: this file's header claims a LIVE policy never needs to be a
  -- proposal ground because a covered acquisition is born COMPLETE (and an INCONGRUENT live policy
  -- births a pending row on a non-depreciable enrolment, where the `enrolment` ground outranks
  -- everything). Both claims are exactly these two bodies, so both are pinned.
  select encode(sha256(prosrc::bytea), 'hex') into v_sha
    from pg_proc where oid = 'clara._tf_fa_acquisition_birth()'::regprocedure;
  if v_sha is distinct from c_birth then
    raise exception '#1092 prestate: clara._tf_fa_acquisition_birth carries prosrc sha256 % -- this file''s "the live policy is never a ground" reasoning rests on 0292''s body', v_sha
      using errcode = 'CLR10';
  end if;
  select encode(sha256(prosrc::bytea), 'hex') into v_sha
    from pg_proc where oid = 'clara._fa_on_approve(uuid)'::regprocedure;
  if v_sha is distinct from c_on_approve then
    raise exception '#1092 prestate: clara._fa_on_approve carries prosrc sha256 % -- see the note on clara._tf_fa_acquisition_birth above', v_sha
      using errcode = 'CLR10';
  end if;

  raise notice '#1092 prestate: clean -- clara.fa_account_depreciation_policies is RLS enabled+forced with 0277''s own two policies unmoved, p_fadp_agent is absent (or already at this file''s exact shape, a redo no-op), no unexpected grantee holds anything, and the five neighbour bodies carry the exact prosrc this file relies on.';
end
$prestate$;

-- =====================================================================================
-- §A — THE READ POLICY AND THE GRANT. `drop policy if exists` then `create policy` (0277's and
-- 0286's own idiom) and a plain `grant select`: both idempotent, so a #957 REDO over this file's
-- own prior effect is safe by construction.
-- =====================================================================================
drop policy if exists p_fadp_agent on clara.fa_account_depreciation_policies;
-- THE SAME READ SHAPE `p_fixed_assets_agent` (0041) gives the register these rows are a default
-- FOR: firm-scoped by the wake credential, SELECT only. See this file's header for why the
-- predicate is plain tenancy rather than `and not active` — the read's own supersession guard
-- would be vacuous under a retired-only wall.
create policy p_fadp_agent on clara.fa_account_depreciation_policies
  for select to clara_agent_ro using (firm_id = clara.wake_firm());
grant select on clara.fa_account_depreciation_policies to clara_agent_ro;

comment on table clara.fa_account_depreciation_policies is
  'A default depreciation policy per enrolled fixed-asset account (#932, 0277): append-only, '
  'version-forward, one LIVE row per (client_id, asset_account_code). Read by '
  'clara_authenticated (p_fadp_human, jwt firm) and, since #1092 (0346), by the runtime read '
  'credential clara_agent_ro (p_fadp_agent, wake firm) SELECT-only, so the fixed-asset '
  'particulars proposal''s retired_account_policy ground can fire -- the read that consumes it '
  'is FA_RETIRED_ACCOUNT_POLICY_SQL in packages/runtime/lib/fa-particulars-proposal.ts, and it '
  'supplies a retired policy only while no LIVE version supersedes it. Written ONLY through '
  'clara.set_fa_depreciation_policy / clara.retire_fa_depreciation_policy, both '
  'clara_authenticated-only: no agent or runtime role writes here.';

-- =====================================================================================
-- §Z — TAIL. Proves the policy and the grant landed exactly as §A states, that every OTHER role
-- still holds nothing, that the two write doors are still human-only, and that the five neighbour
-- bodies §0 pinned are byte-identical. The FIRM-WALL ITSELF is not provable from inside this
-- transaction (`clara.wake_firm()` needs a minted wake credential, which needs a whole world);
-- it is driven by `packages/db/tests/fa-retired-policy-agent-read.test.mjs` (fp.wall), under a
-- real credential, with a second firm's credential as the control.
-- =====================================================================================
do $tail$
declare
  v_n int; v_qual text; v_cmd "char"; v_roles text[]; v_sha text; v_role text; v_priv text;
  c_wake_firm      constant text := '76311c51e878a658085bc36fee28d0175eacb2b0dbff3d6dec44f80239cbfabc';
  c_set_policy     constant text := '11f0aa0a82334438bebb3dadd1c990c08ebd0b014eabf7d86d41204c2820b67d';
  c_retire_policy  constant text := 'f75d3f25b690ad8ceabac201403180f0f67af19ba578cb816a14e11b9ac8c05e';
  c_birth          constant text := 'a584e946f9d99b881a6e856fb792823decbdbe9fd5fb2851702b85475395b69c';
  c_on_approve     constant text := '412fd7a04886676dfc8c93696fec4f5878b9a6821cb31472f203c3695faf643b';
begin
  select pg_get_expr(p.polqual, p.polrelid), p.polcmd,
         (select array_agg(r.rolname order by r.rolname) from pg_roles r where r.oid = any(p.polroles))
    into v_qual, v_cmd, v_roles
    from pg_policy p where p.polrelid = 'clara.fa_account_depreciation_policies'::regclass
     and p.polname = 'p_fadp_agent';
  if not found then
    raise exception '#1092 tail: p_fadp_agent did not land' using errcode = 'CLR10';
  end if;
  if v_cmd <> 'r' then
    raise exception '#1092 tail: p_fadp_agent is a % policy, not SELECT-only', v_cmd using errcode = 'CLR10';
  end if;
  if v_qual <> '(firm_id = clara.wake_firm())' then
    raise exception '#1092 tail: p_fadp_agent carries the predicate %, not the tenancy wall', v_qual using errcode = 'CLR10';
  end if;
  if v_roles is distinct from array['clara_agent_ro']::text[] then
    raise exception '#1092 tail: p_fadp_agent names %, not clara_agent_ro alone', v_roles using errcode = 'CLR10';
  end if;
  if pg_get_expr((select p.polwithcheck from pg_policy p
                   where p.polrelid = 'clara.fa_account_depreciation_policies'::regclass
                     and p.polname = 'p_fadp_agent'),
                 'clara.fa_account_depreciation_policies'::regclass) is not null then
    raise exception '#1092 tail: p_fadp_agent carries a WITH CHECK clause -- a read policy must not'
      using errcode = 'CLR10';
  end if;

  select count(*)::int into v_n from pg_policy
   where polrelid = 'clara.fa_account_depreciation_policies'::regclass;
  if v_n <> 3 then
    raise exception '#1092 tail: % policies on clara.fa_account_depreciation_policies, not the 3 this file implies (0277''s two + p_fadp_agent)', v_n
      using errcode = 'CLR10';
  end if;

  -- SELECT AND ONLY SELECT for the runtime read credential.
  if not has_table_privilege('clara_agent_ro', 'clara.fa_account_depreciation_policies', 'SELECT') then
    raise exception '#1092 tail: clara_agent_ro holds no SELECT on clara.fa_account_depreciation_policies' using errcode = 'CLR10';
  end if;
  foreach v_priv in array array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
    if has_table_privilege('clara_agent_ro', 'clara.fa_account_depreciation_policies', v_priv) then
      raise exception '#1092 tail: clara_agent_ro holds % on clara.fa_account_depreciation_policies -- this file grants SELECT and nothing else', v_priv
        using errcode = 'CLR10';
    end if;
  end loop;

  -- EVERY OTHER APPLICATION ROLE STILL HOLDS NOTHING. Named one by one so a later grant to any of
  -- them fails on a from-scratch chain rather than in production.
  foreach v_role in array array['clara_runtime', 'clara_wake_interactive', 'clara_wake_proactive',
                                'clara_wake_bank', 'clara_freeform_ro', 'public'] loop
    if has_table_privilege(v_role, 'clara.fa_account_depreciation_policies', 'SELECT') then
      raise exception '#1092 tail: % holds SELECT on clara.fa_account_depreciation_policies -- this file widens clara_agent_ro alone', v_role
        using errcode = 'CLR10';
    end if;
  end loop;

  -- THE HUMAN LANE IS UNTOUCHED (the ticket's own out-of-scope).
  select pg_get_expr(p.polqual, p.polrelid), p.polcmd into v_qual, v_cmd
    from pg_policy p where p.polrelid = 'clara.fa_account_depreciation_policies'::regclass
     and p.polname = 'p_fadp_human';
  if not found or v_cmd <> 'r' or v_qual <> '(firm_id = clara.jwt_firm())' then
    raise exception '#1092 tail: p_fadp_human moved (cmd=%, qual=%)', v_cmd, v_qual using errcode = 'CLR10';
  end if;

  -- THE TWO WRITE DOORS STAY HUMAN-ONLY. A read grant that came with an agent-writable door would
  -- be the real defect, so it is measured here rather than assumed from the fact this file has no
  -- `grant execute` in it.
  if not has_function_privilege('clara_authenticated',
        'clara.set_fa_depreciation_policy(uuid,text,text,integer,integer,bigint,text,text)'::regprocedure, 'EXECUTE')
     or has_function_privilege('clara_agent_ro',
        'clara.set_fa_depreciation_policy(uuid,text,text,integer,integer,bigint,text,text)'::regprocedure, 'EXECUTE')
     or has_function_privilege('clara_runtime',
        'clara.set_fa_depreciation_policy(uuid,text,text,integer,integer,bigint,text,text)'::regprocedure, 'EXECUTE') then
    raise exception '#1092 tail: clara.set_fa_depreciation_policy is no longer clara_authenticated-only'
      using errcode = 'CLR10';
  end if;
  if not has_function_privilege('clara_authenticated',
        'clara.retire_fa_depreciation_policy(uuid,text,text,text)'::regprocedure, 'EXECUTE')
     or has_function_privilege('clara_agent_ro',
        'clara.retire_fa_depreciation_policy(uuid,text,text,text)'::regprocedure, 'EXECUTE')
     or has_function_privilege('clara_runtime',
        'clara.retire_fa_depreciation_policy(uuid,text,text,text)'::regprocedure, 'EXECUTE') then
    raise exception '#1092 tail: clara.retire_fa_depreciation_policy is no longer clara_authenticated-only'
      using errcode = 'CLR10';
  end if;

  -- THE FIVE NEIGHBOUR BODIES ARE BYTE-IDENTICAL TO §0's PINS: this file recut none, and the tail
  -- measures that rather than trusting the prestate's own read.
  select encode(sha256(prosrc::bytea), 'hex') into v_sha
    from pg_proc where oid = 'clara.wake_firm()'::regprocedure;
  if v_sha is distinct from c_wake_firm then
    raise exception '#1092 tail: clara.wake_firm moved during this migration (now %)', v_sha using errcode = 'CLR10';
  end if;
  select encode(sha256(prosrc::bytea), 'hex') into v_sha
    from pg_proc where oid = 'clara.set_fa_depreciation_policy(uuid,text,text,integer,integer,bigint,text,text)'::regprocedure;
  if v_sha is distinct from c_set_policy then
    raise exception '#1092 tail: clara.set_fa_depreciation_policy moved during this migration (now %)', v_sha using errcode = 'CLR10';
  end if;
  select encode(sha256(prosrc::bytea), 'hex') into v_sha
    from pg_proc where oid = 'clara.retire_fa_depreciation_policy(uuid,text,text,text)'::regprocedure;
  if v_sha is distinct from c_retire_policy then
    raise exception '#1092 tail: clara.retire_fa_depreciation_policy moved during this migration (now %)', v_sha using errcode = 'CLR10';
  end if;
  select encode(sha256(prosrc::bytea), 'hex') into v_sha
    from pg_proc where oid = 'clara._tf_fa_acquisition_birth()'::regprocedure;
  if v_sha is distinct from c_birth then
    raise exception '#1092 tail: clara._tf_fa_acquisition_birth moved during this migration (now %)', v_sha using errcode = 'CLR10';
  end if;
  select encode(sha256(prosrc::bytea), 'hex') into v_sha
    from pg_proc where oid = 'clara._fa_on_approve(uuid)'::regprocedure;
  if v_sha is distinct from c_on_approve then
    raise exception '#1092 tail: clara._fa_on_approve moved during this migration (now %)', v_sha using errcode = 'CLR10';
  end if;

  raise notice '#1092 tail: OK -- p_fadp_agent is a SELECT-only, clara_agent_ro-only, wake-firm-scoped read policy (three policies on the relation now), clara_agent_ro holds SELECT and nothing else, no other application role or PUBLIC holds anything, p_fadp_human is unmoved, both write doors are still clara_authenticated-only, and the five neighbour bodies are byte-identical to what prestate pinned.';
end
$tail$;
