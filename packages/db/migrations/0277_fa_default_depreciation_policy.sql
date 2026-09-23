-- 0277_fa_default_depreciation_policy — #932 (riders wave 3, lane 04): A DEFAULT DEPRECIATION
-- POLICY PER ENROLLED FIXED-ASSET ACCOUNT, APPLIED AT ACQUISITION WHEN THE ENTRY STATES NO
-- PARTICULARS, WITH ITS VERSION STAMPED ON THE REGISTER ROW IT BIRTHS.
-- =====================================================================================
-- Spec of record: issue #932, parent #883 (owner ruling 2026-09-18: a default depreciation
-- policy lives on the client's enrolled fixed-asset account; a person signs it once, Clara
-- applies it at every acquisition that states no particulars). Decisions taken (owner
-- 2026-09-18) and carried through verbatim: start date = the acquisition's OWN posting date;
-- default residual 0; ONE policy per enrolled account (no finer class this round); no amount
-- threshold; no back-fill of assets already waiting; no "please review" queue row once a policy
-- is applied — the provenance stamped on the row suffices.
--
-- Builds on 0041 (the register; `clara.fa_account_profiles`, the enrolment this policy is keyed
-- on; `clara._fa_particulars_complete`, the derived-completeness predicate a policy-born row
-- must satisfy without a human ever calling a completion door; `clara._fa_on_approve`, whose arm
-- 4 is BOTH acquisition birth sites) and 0216 (`clara._tf_fa_acquisition_birth`, the deferred
-- trigger, the OTHER birth site).
--
-- BOTH BIRTH SITES, NOT ONE — measured, not assumed. `clara._fa_on_approve` arm 4 fires
-- SYNCHRONOUSLY inside the approve statement, through `clara._subledger_on_approve`, every
-- approve writer's own call; `clara._tf_fa_acquisition_birth` is a DEFERRED constraint trigger
-- that fires at COMMIT of the SAME transaction, AFTER arm 4 already ran. Both target the SAME
-- conflict key (`on conflict (acquisition_line_id) do nothing`), and 0247's own comment on the
-- trigger says which one wins for an ordinary acquisition: "on the four lanes that already
-- birth, the hook [arm 4] got here first and this [the trigger] writes nothing." A policy
-- planted in ONLY the trigger (0247's own scope, the deferred site being the only thing THAT
-- ticket needed) is therefore unreachable for a normal approve — driven and measured on this
-- rig before this file's final cut: a policy set through `clara.set_fa_depreciation_policy` and
-- then an ordinary `buyAsset`-shaped approve still birthed the pre-0277 pending row, because arm
-- 4 got there first with no policy logic of its own. §E recuts the trigger (the Work lane's own
-- birth site, where arm 4 is never reached) and §E2 recuts arm 4 (the site every OTHER lane
-- actually births through) — the SAME policy lookup and the SAME two-branch column choice, in
-- both places, because the two sites already duplicate the whole insert shape independently and
-- neither routes through the other.
--
-- SEQUENCING NOTE, SUPERSEDING THE TICKET'S OWN TRIAGE COMMENT (which was checked against
-- `origin/main` at 0233 / dc9acfe1, before this lane existed). riders wave 2 already recut the
-- ONE body this ticket touches: `clara._tf_fa_acquisition_birth` stands at 0247's text on this
-- database (267 files / 0272, RIG.md's wave-3 addendum), not 0216's, and 0227's own additions to
-- `clara._fa_validate_particulars` and the two completion doors are 0249's fold now, not 0227's
-- own copies. This file's prestate pins the LIVE text of every body it touches or relies on,
-- MEASURED on this lane database moments before writing this file (RIG.md's wave-3 addendum: pin
-- what is live, never a sha from 0216 or 0227) — never transcribed from an earlier migration's
-- own header.
--
-- =====================================================================================
-- THE SHAPE, IN ONE PARAGRAPH.
--
-- `clara.fa_account_depreciation_policies` is an APPEND-ONLY, VERSION-FORWARD relation keyed on
-- (client_id, asset_account_code) — the exact enrolment key `clara.fa_account_profiles` already
-- carries, never a finer class. Two human doors: `clara.set_fa_depreciation_policy` (retires the
-- live row if one exists and inserts a fresh one with a version number one higher than any this
-- account has ever carried) and `clara.retire_fa_depreciation_policy` (ends the live row without
-- replacing it, so the account reverts to "no policy" — the birth trigger then parks the
-- question exactly as it does for an account that was never covered). Every row carries its
-- author (`created_by`), an optional `reason`, and its `effective_from` instant — the three facts
-- AC1 names — plus the method/life/rate/residual quadruple the Fixed Assets surface renders.
-- `reason` is NULLABLE: the owner's 2026-09-18 decision list enumerates method, life-or-rate and
-- residual as the form's fields and says nothing about a mandatory "why" on every set/retire,
-- and the closest in-repo precedent for THIS kind of per-account enrolment action —
-- `clara.retire_fa_account_profile` (0041 S3.2) — takes no reason at all. Forcing one here would
-- widen the ticket past what the owner decided; the column exists so a caller MAY record one.
--
-- BOTH birth sites (`clara._tf_fa_acquisition_birth` and `clara._fa_on_approve` arm 4) gain ONE
-- extra read per acquisition line: the account's live policy, if any. Covered, the register row
-- is born COMPLETE — method, life-or-rate, residual and a depreciation_start_date of the
-- acquisition's OWN posting date, the exact shape `clara._fa_particulars_complete` already
-- demands, so the row is picked up by the depreciation engine on its next run with NO code of
-- that engine's touched (`clara._fa_compute_charges` / `clara._fa_asset_charges`, pinned unmoved
-- below). Uncovered, the row is born EXACTLY as it always has been — the same placeholder
-- description, the same NULL columns, the same "particulars pending" question. `clara._fa_asset_json`
-- (0216's recut, the ONE
-- source both `clara.list_fixed_assets` and `clara.get_fixed_asset` read a row through) gains the
-- two provenance keys the register row carries, so "particulars from <account> policy v<N>" is a
-- read the surface renders, never a client-side inference.
--
-- WHAT THIS FILE DOES NOT DO. It does not touch `clara.upsert_fa_account_profile`,
-- `clara.retire_fa_account_profile` or the enrolment belt watermark (AC1's own "untouched"
-- requirement — pinned below, unmoved). It does not touch
-- `clara._fa_validate_particulars`, either completion door, `clara._fa_assert_completion_not_a_change`
-- or `clara._fa_assert_particulars_completable` (0249's fold) — a policy-born row never calls
-- the validator; it is populated directly from the policy's own already-validated columns, and a
-- SUBSEQUENT change to a policy-born asset's particulars still goes through
-- `clara.revise_fixed_asset_particulars`, the existing PROSPECTIVE revision door, exactly as the
-- ticket's "What to build" says (a policy-born row is a COMPLETE row like any other; completion
-- is not reachable a second time — `fa_particulars_already_complete` — which is precisely how
-- "particulars the acquisition itself states always win" holds: there is today no mechanism for
-- an acquisition entry itself to carry particulars at posting time — grepped, none exists — so a
-- policy can never have anything stated to override). It does not touch
-- `clara._fa_compute_charges`, `clara._fa_asset_charges` or `clara.fa_register_tie` (pinned
-- unmoved — the depreciation engine and the audit read need no change; AC4's "picked up on its
-- next run" is a consequence of the row being COMPLETE, not a new arithmetic path). It mints no
-- machine-role grant: both new doors are `clara_authenticated` only, `_human_ctx`-floored at
-- bookkeeper, exactly like every other S3 verb 0041 minted.
--
-- REFUSAL VOCABULARY (both new doors, reason `fa_policy_invalid`): axis `not_enrolled` (SET, no
-- active `fa_account_profiles` row names this account for this client), `method` (SET, not one
-- of straight_line / reducing_balance / none), `drivers` (SET, the life/rate pair does not match
-- `clara.fixed_assets`' own `ck_fa_method_drivers` congruence for the chosen method), `non_depreciable`
-- (SET, the enrolled profile carries no accumulated-depreciation account and the method is not
-- none), `residual` (SET, a negative residual), `not_set` (RETIRE, no active policy exists for
-- this account).
-- =====================================================================================

do $p932_pre$
declare
  v_sha text; v_pin record; v_redo boolean := false; v_n int;
  -- The live pre-images of the THREE bodies this file recuts, measured off pg_proc.prosrc on the
  -- lane-04 rig (clara_l04, PG 17, chain 0001..0272, no prior wave-3 lane-04 commit) moments
  -- before this file was written — never transcribed from an earlier migration's own header.
  c_birth_pre constant text :=
    '5ff7590994db3b1fd324a53487750fbe437636e055f84910f470ae8832cdb994';
  c_asset_json_pre constant text :=
    '0b657fe539fb55de182af7eb93a6cbfca74f6bca62d003185ee7e9d985db78f0';
  -- clara._fa_on_approve arm 4 — the OTHER birth site, MEASURED (not assumed) to be the one
  -- that actually fires for a normal approve: driven on this rig before this cut, a policy set
  -- through the new SET door plus an ordinary buyAsset-shaped approve still birthed the
  -- pre-0277 pending row when only the deferred trigger carried the policy lookup, because arm
  -- 4's own "on conflict (acquisition_line_id) do nothing" absorbed the trigger's later insert.
  -- This is 0247's own pinned "unmoved" sha for arm 4 (0247:184-185) — measured live here again,
  -- never carried over, and now the THIRD recut target.
  c_on_approve_pre constant text :=
    '7ffa9a710bf2ba5fc6c49ed184251f7cbb37c834a213f0ddeeb3a3ba91b98fc0';
begin
  if to_regclass('clara.fixed_assets') is null or to_regclass('clara.fa_account_profiles') is null then
    raise exception '#932 prestate: the fixed-asset register or its enrolment relation is absent -- 0041 must apply first'
      using errcode='CLR10';
  end if;
  if to_regprocedure('clara._tf_fa_acquisition_birth()') is null then
    raise exception '#932 prestate: clara._tf_fa_acquisition_birth is absent -- 0216 must apply first'
      using errcode='CLR10';
  end if;
  if to_regprocedure('clara._fa_on_approve(uuid)') is null then
    raise exception '#932 prestate: clara._fa_on_approve is absent -- 0041 must apply first'
      using errcode='CLR10';
  end if;
  if to_regprocedure('clara._fa_asset_json(uuid,date)') is null then
    raise exception '#932 prestate: clara._fa_asset_json is absent -- 0216 must apply first'
      using errcode='CLR10';
  end if;

  -- IS THIS A REDO OF THIS VERY FILE? (#957: a rig may re-apply the highest applied, unmerged
  -- migration after an edit.) The schema/door sections below are ALL naturally redo-safe by
  -- construction (`create table if not exists`, `create index if not exists`,
  -- `drop policy if exists` + `create policy`, `create or replace function`, `create or replace
  -- trigger`, guarded `alter table ... add column/constraint`), so only the THREE RECUT bodies'
  -- pre-image pins need a redo branch: on a redo their live text is already THIS file's own
  -- prior effect, not 0247's / 0216's pre-image. The signal is the one thing only a live apply
  -- of THIS file can have put in any of the three.
  if to_regprocedure(
       'clara.set_fa_depreciation_policy(uuid,text,text,integer,integer,bigint,text,text)'
     ) is not null then
    v_redo := true;
    raise notice '#932 prestate: clara.set_fa_depreciation_policy already exists -- treating this as a #957 REDO of 0277 itself. Every DDL section below is redo-safe by construction; the tail re-proves the whole post-state from scratch.';
  end if;

  -- PRE-IMAGE sha256(prosrc) PINS, EVERY ONE MEASURED ON THE LANE-04 RIG off pg_proc.prosrc,
  -- moments before this file was written. The three RECUT entries are skipped on a redo (their
  -- pre-image is this file's OWN prior effect, not the pin below); §T re-reads all seventeen
  -- afterwards to confirm the final state either way.
  for v_pin in select * from (values
      -- RECUT by this file (§E, §E2, §F).
      ('clara._tf_fa_acquisition_birth()', c_birth_pre, 'recut'),
      ('clara._fa_on_approve(uuid)', c_on_approve_pre, 'recut'),
      ('clara._fa_asset_json(uuid,date)', c_asset_json_pre, 'recut'),
      -- NON-REGRESSION: AC1's own "untouched" requirement, plus every neighbour body this
      -- file's new code relies on or whose contract a policy-born row must keep satisfying.
      ('clara.upsert_fa_account_profile(uuid,text,text,text,text)',
       '14cba9a309642dafa8a39131a3b850f9663b5b7d64e3fea8632852c11af0e41c', 'unmoved'),
      ('clara.retire_fa_account_profile(uuid,text,text)',
       '82d15cc67c95116521f64c3e11e85e3f806a7ce1c03bc361ec62db81b4fcd939', 'unmoved'),
      ('clara._fa_particulars_complete(clara.fixed_assets)',
       '4f96d11ef385a1b5ca26eedb088a4de8e7c6b0d457576053039468fcad6b32a9', 'unmoved'),
      ('clara._fa_validate_particulars(jsonb)',
       '971242090b8171fa7f5ca50acdba9f536b07b498018a12d9778cb24d2d40858b', 'unmoved'),
      ('clara.complete_fixed_asset_particulars(uuid,uuid,jsonb,text)',
       '42ec4851c5e50a3b6d84d203f84a7957ce687962ada6fe4a9ae406ed1889026c', 'unmoved'),
      ('clara._fa_complete_particulars_core(uuid,uuid,uuid,uuid,jsonb,text,text)',
       '054b758c53f60a0e385efba7af3890c040bc2097319e0bc31c57b9640dfc2afc', 'unmoved'),
      ('clara._fa_assert_completion_not_a_change(uuid,jsonb)',
       '8c4e0a6d51f1c8c749f940895b2bee47e8f2cd997629dca539a9cc7d6f3dae9d', 'unmoved'),
      ('clara._fa_assert_particulars_completable(uuid,clara.fixed_assets,jsonb)',
       '6e5993fa44ef4b52d1d77bce7bd546fd2ad7b53a1b8a92c57d4043580b04e107', 'unmoved'),
      ('clara.revise_fixed_asset_particulars(uuid,uuid,jsonb,date,text)',
       'c814f6fd766565653e9649fa02b23b69f2b7c968f2988efff298a2a6ca48b437', 'unmoved'),
      ('clara.fa_register_tie(uuid,date)',
       'c9f47463e1e5c02d56bc1ed7a5396d672990bf2f50de20e33cb47a59cbe67586', 'unmoved'),
      ('clara._fa_compute_charges(uuid,date,date)',
       'a6566557a258444c0511c6ed14bad033ce738c841e8ce54c50ce227ca152e048', 'unmoved'),
      ('clara._fa_asset_charges(uuid,date,boolean)',
       'a0122346d1e54ed847eebc60288e52b95cb5199e3035920f2c833fd2743ab849', 'unmoved'),
      ('clara.list_fixed_assets(uuid)',
       '8063a726881033c431bd9a65e252ae6a2a52732009becef6eeb07392532c7ef7', 'unmoved'),
      ('clara.get_fixed_asset(uuid)',
       'da9333ebdd3bcaeea916f31651dbf0e87378a525e8c19fd98035141f6fd8be5a', 'unmoved')
    ) as t(sig, sha, kind) loop
    if v_redo and v_pin.kind = 'recut' then continue; end if;
    select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
      from pg_proc p where p.oid = v_pin.sig::regprocedure;
    if v_sha is distinct from v_pin.sha then
      raise exception '#932 prestate: % (%) has DRIFTED from its pinned pre-image (measured %, expected %) -- re-derive this file against the LIVE body before applying', v_pin.sig, v_pin.kind, v_sha, v_pin.sha
        using errcode='CLR10';
    end if;
  end loop;

  -- ANCHOR: the method-driver congruence this file's CHECK constraint mirrors is still exactly
  -- what clara.fixed_assets' own ck_fa_method_drivers demands, so a policy can never validate a
  -- shape the register row it births would then refuse to have carried. Measured off
  -- pg_get_constraintdef's own rendering (uppercase keywords, the column's FULL name), not a
  -- guess at its text.
  if not exists (select 1 from pg_constraint c
                  where c.conrelid = 'clara.fixed_assets'::regclass and c.conname = 'ck_fa_method_drivers'
                    and pg_get_constraintdef(c.oid) like
                      '%reducing_balance%AND (depreciation_rate_bps IS NOT NULL)%AND (useful_life_months IS NOT NULL)%'
                    and pg_get_constraintdef(c.oid) like
                      '%straight_line%AND (depreciation_rate_bps IS NULL)%AND (useful_life_months IS NOT NULL)%'
                    and pg_get_constraintdef(c.oid) like
                      $$%'none'%AND (depreciation_rate_bps IS NULL)%AND (useful_life_months IS NULL)%$$) then
    raise exception '#932 prestate: clara.fixed_assets.ck_fa_method_drivers no longer reads the way this file''s own CHECK mirrors it -- re-derive ck_fadp_method_drivers against the live constraint'
      using errcode='CLR10';
  end if;

  raise notice '#932 prestate: clean -- the register, its enrolment relation, both birth sites (the deferred trigger and clara._fa_on_approve arm 4) and clara._fa_asset_json exist; every RECUT body is at its measured pre-image (or, on a redo, this file''s own prior effect); the AC1 non-regression list (the two profile doors, the whole particulars-completion family, the depreciation-arithmetic pair, the register tie and the two read RPCs) matches what was measured moments before this file was written; and clara.fixed_assets'' own method-driver congruence still reads the way this file''s CHECK mirrors it.';
end
$p932_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §A THE RELATION. Append-only, version-forward, keyed on the SAME (client_id,
--    asset_account_code) pair `clara.fa_account_profiles` uses. `create table if not exists` —
--    every constraint lives INSIDE the statement, so one guarded DDL covers the whole shape
--    atomically and is safe over a redo's own prior effect (packages/db/README.md, "Redo-safe by
--    construction").
-- =====================================================================================
create table if not exists clara.fa_account_depreciation_policies (
  id                 uuid        primary key default gen_random_uuid(),
  firm_id            uuid        not null,
  client_id          uuid        not null,
  asset_account_code text        not null,
  version            int         not null,
  method             text        not null,
  useful_life_months int,
  rate_bps           int,
  residual_cents     bigint      not null default 0,
  active             boolean     not null default true,
  effective_from     timestamptz not null default now(),
  reason             text,
  created_by         uuid        not null references clara.users(id),
  created_at         timestamptz not null default now(),
  retired_by         uuid        references clara.users(id),
  retired_at         timestamptz,
  retired_reason     text,
  constraint fk_fadp_client foreign key (client_id, firm_id)
    references clara.clients(id, firm_id),
  constraint fk_fadp_asset_acc foreign key (client_id, asset_account_code)
    references clara.coa_accounts(client_id, account_code),
  constraint ck_fadp_method check (method in ('straight_line', 'reducing_balance', 'none')),
  -- THE SAME CONGRUENCE clara.fixed_assets' own ck_fa_method_drivers demands (0041 S1.1), so a
  -- policy can never validate a shape the register row it births would then refuse to have
  -- carried: reducing_balance needs BOTH the rate (to charge) and the life (to terminate);
  -- straight_line needs the life and forbids the rate; none carries neither.
  constraint ck_fadp_method_drivers check (
    (method = 'reducing_balance' and rate_bps is not null and rate_bps between 1 and 10000
      and useful_life_months is not null and useful_life_months > 0)
    or (method = 'straight_line' and rate_bps is null
      and useful_life_months is not null and useful_life_months > 0)
    or (method = 'none' and rate_bps is null and useful_life_months is null)),
  constraint ck_fadp_residual_nonneg check (residual_cents >= 0),
  constraint ck_fadp_version_positive check (version > 0),
  constraint ck_fadp_retired check (
    (active and retired_by is null and retired_at is null)
    or (not active and retired_by is not null and retired_at is not null)),
  constraint uq_fadp_id_firm_client unique (id, firm_id, client_id),
  constraint uq_fadp_account_version unique (client_id, asset_account_code, version)
);
-- ONE LIVE POLICY PER ENROLLED ACCOUNT, ever — the owner's "no finer class this round" decision,
-- and the SAME shape `uq_fa_account_profiles_active` (0041:459-460) gives the enrolment itself.
create unique index if not exists uq_fadp_active
  on clara.fa_account_depreciation_policies (client_id, asset_account_code) where active;
create index if not exists ix_fadp_client
  on clara.fa_account_depreciation_policies (client_id, active);

create or replace function clara._tf_fadp_no_delete() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  raise exception 'a fixed-asset depreciation policy is retired, never deleted (retire_fa_depreciation_policy)'
    using errcode = 'CLR37',
      detail = jsonb_build_object('reason', 'fa_policy_never_deleted', 'policy_id', old.id)::text;
end $$;
revoke all on function clara._tf_fadp_no_delete() from public;
create or replace trigger t_fadp_no_delete before delete on clara.fa_account_depreciation_policies
  for each row execute function clara._tf_fadp_no_delete();
create or replace trigger t_fadp_no_truncate before truncate
  on clara.fa_account_depreciation_policies for each statement execute function clara._tf_no_truncate();

alter table clara.fa_account_depreciation_policies enable row level security;
alter table clara.fa_account_depreciation_policies force row level security;
drop policy if exists p_fadp_owner on clara.fa_account_depreciation_policies;
create policy p_fadp_owner on clara.fa_account_depreciation_policies
  for all to clara_fn_owner using (true) with check (true);
-- THE SAME READ SHAPE `p_fa_account_profiles_human` gives the enrolment (0041:498-499): direct
-- SELECT, firm-scoped by the JWT, no PostgREST view needed — the Q3 read-the-tables mechanism
-- lib/registers/accounts.ts and lib/registers/fa-account-profiles.ts already use.
drop policy if exists p_fadp_human on clara.fa_account_depreciation_policies;
create policy p_fadp_human on clara.fa_account_depreciation_policies
  for select to clara_authenticated using (firm_id = clara.jwt_firm());
grant select on clara.fa_account_depreciation_policies to clara_authenticated;

-- THE REGISTER ROW'S OWN PROVENANCE, guarded (an ALTER on an EXISTING table, not a fresh
-- `create table` — each piece is its own idempotent guard so a redo is safe over its old effect).
do $p932_alter$ begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'clara' and table_name = 'fixed_assets'
                    and column_name = 'depreciation_policy_id') then
    execute 'alter table clara.fixed_assets add column depreciation_policy_id uuid';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'clara' and table_name = 'fixed_assets'
                    and column_name = 'depreciation_policy_version') then
    execute 'alter table clara.fixed_assets add column depreciation_policy_version int';
  end if;
  -- TENANT CONGRUENCE, DECLARATIVELY (0041 S1.1's own idiom): a register row can never carry a
  -- policy id from another firm or client, by CONSTRAINT rather than by trusting the trigger
  -- that stamps it. NULL on every row the birth found no policy for -- a composite FK is
  -- trivially satisfied when the referencing column is NULL.
  if not exists (select 1 from pg_constraint
                  where conrelid = 'clara.fixed_assets'::regclass
                    and conname = 'fk_fa_depreciation_policy_congruent') then
    execute 'alter table clara.fixed_assets add constraint fk_fa_depreciation_policy_congruent '
      || 'foreign key (depreciation_policy_id, firm_id, client_id) '
      || 'references clara.fa_account_depreciation_policies(id, firm_id, client_id)';
  end if;
end
$p932_alter$;
create index if not exists ix_fixed_assets_depreciation_policy
  on clara.fixed_assets (depreciation_policy_id) where depreciation_policy_id is not null;

-- =====================================================================================
-- §B THE SET DOOR. bookkeeper+. VERSION-FORWARD, NEVER MUTATE — the SAME law
--    clara.upsert_fa_account_profile rests on (0041 S3.1): a real set RETIRES the live row (if
--    one exists) and INSERTS a fresh one with a version number one higher than any this account
--    has ever carried, so a policy interval stays a historical fact and a register row's own
--    stamped version can never point at a row this door later mutated.
-- =====================================================================================
create or replace function clara.set_fa_depreciation_policy(p_client uuid, p_asset_account text,
    p_method text, p_useful_life_months int, p_rate_bps int, p_residual_cents bigint,
    p_reason text, p_op_key text)
  returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  c record; v_dedupe jsonb; v_firm uuid; v_profile clara.fa_account_profiles%rowtype;
  v_method text; v_life int; v_rate int; v_residual bigint; v_version int; v_id uuid;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  v_dedupe := clara._reserve_op(c.firm, 'set_fa_depreciation_policy', p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'asset', p_asset_account,
      'method', p_method, 'useful_life_months', p_useful_life_months, 'rate_bps', p_rate_bps,
      'residual_cents', p_residual_cents)));
  if v_dedupe is not null then return v_dedupe; end if;
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  if v_firm is null or v_firm <> c.firm then
    raise exception 'client is not in your firm' using errcode = 'CLR11';
  end if;
  -- THE CLIENT RUNG (0041 S3.4 / 0249's own splice): the SAME per-client serialisation point the
  -- depreciation run and the particulars-completion doors already take, so a concurrent set and
  -- a concurrent run/completion on the same client order rather than race.
  perform pg_advisory_xact_lock(203005004, hashtext(p_client::text));

  -- A POLICY IS "PER ENROLLED ACCOUNT" (AC1, owner decision): keyed on the SAME live
  -- clara.fa_account_profiles row the register's own birth join already requires.
  select * into v_profile from clara.fa_account_profiles
    where client_id = p_client and asset_account_code = p_asset_account and active;
  if not found then
    raise exception 'account % is not an enrolled fixed-asset account for this client', p_asset_account
      using errcode = 'CLR37', detail = '{"reason":"fa_policy_invalid","axis":"not_enrolled"}';
  end if;

  v_method := lower(btrim(p_method));
  if v_method not in ('straight_line', 'reducing_balance', 'none') then
    raise exception 'method must be straight_line, reducing_balance or none'
      using errcode = 'CLR37', detail = '{"reason":"fa_policy_invalid","axis":"method"}';
  end if;
  -- THE SAME METHOD-DRIVER CONGRUENCE clara.fixed_assets' own ck_fa_method_drivers demands
  -- (prestate anchor above): a policy can never validate a shape the register row it births
  -- would then refuse to have carried.
  if v_method = 'none' then
    if p_useful_life_months is not null or p_rate_bps is not null then
      raise exception 'method none carries neither a useful life nor a rate'
        using errcode = 'CLR37', detail = '{"reason":"fa_policy_invalid","axis":"drivers"}';
    end if;
    v_life := null; v_rate := null;
  elsif v_method = 'straight_line' then
    if p_useful_life_months is null or p_useful_life_months <= 0 or p_rate_bps is not null then
      raise exception 'straight_line needs a positive useful life in months and no rate'
        using errcode = 'CLR37', detail = '{"reason":"fa_policy_invalid","axis":"drivers"}';
    end if;
    v_life := p_useful_life_months; v_rate := null;
  else
    if p_useful_life_months is null or p_useful_life_months <= 0
       or p_rate_bps is null or p_rate_bps < 1 or p_rate_bps > 10000 then
      raise exception 'reducing_balance needs a positive useful life (to terminate) AND an annual rate of 1..10000 basis points (to charge)'
        using errcode = 'CLR37', detail = '{"reason":"fa_policy_invalid","axis":"drivers"}';
    end if;
    v_life := p_useful_life_months; v_rate := p_rate_bps;
  end if;
  -- A NON-DEPRECIABLE ENROLMENT ADMITS ONLY method=none (the SAME wall
  -- clara._fa_assert_particulars_completable gives a hand-completed row, 0249): the profile
  -- carries no accumulated-depreciation account, so any other method would build an entry with
  -- nowhere to post.
  if v_profile.accum_depr_account_code is null and v_method <> 'none' then
    raise exception 'this account is a non-depreciable enrolment (no accumulated-depreciation account); its policy method must be none'
      using errcode = 'CLR37', detail = '{"reason":"fa_policy_invalid","axis":"non_depreciable"}';
  end if;
  v_residual := coalesce(p_residual_cents, 0);
  if v_residual < 0 then
    raise exception 'a residual value cannot be negative'
      using errcode = 'CLR37', detail = '{"reason":"fa_policy_invalid","axis":"residual"}';
  end if;
  if v_method = 'none' then v_residual := 0; end if;

  select coalesce(max(version), 0) + 1 into v_version
    from clara.fa_account_depreciation_policies
    where client_id = p_client and asset_account_code = p_asset_account;
  update clara.fa_account_depreciation_policies
    set active = false, retired_by = c.actor, retired_at = now(),
        retired_reason = 'superseded by set_fa_depreciation_policy v' || v_version
    where client_id = p_client and asset_account_code = p_asset_account and active;
  insert into clara.fa_account_depreciation_policies(firm_id, client_id, asset_account_code,
      version, method, useful_life_months, rate_bps, residual_cents, active, effective_from,
      reason, created_by)
    values (c.firm, p_client, p_asset_account, v_version, v_method, v_life, v_rate, v_residual,
      true, now(), nullif(btrim(p_reason), ''), c.actor)
    returning id into v_id;

  perform clara._audit(c.firm, c.actor, null, null, 'set_fa_depreciation_policy', null,
    jsonb_build_object('client', p_client, 'asset_account', p_asset_account, 'policy_id', v_id,
      'version', v_version, 'method', v_method, 'useful_life_months', v_life, 'rate_bps', v_rate,
      'residual_cents', v_residual, 'op_key', p_op_key));
  return clara._finish_op(c.firm, 'set_fa_depreciation_policy', p_op_key,
    jsonb_build_object('policy_id', v_id, 'client_id', p_client,
      'asset_account_code', p_asset_account, 'version', v_version, 'method', v_method,
      'useful_life_months', v_life, 'rate_bps', v_rate, 'residual_cents', v_residual,
      'active', true));
end $$;
revoke all on function clara.set_fa_depreciation_policy(uuid, text, text, int, int, bigint, text, text) from public;

-- =====================================================================================
-- §C THE RETIRE DOOR. bookkeeper+. Ends the live row WITHOUT replacing it — the account then
--    reverts to "no policy": the birth trigger parks the question exactly as it does for an
--    account that was never covered (AC1's "own human doors to set and retire a policy",
--    mirroring clara.retire_fa_account_profile's own shape, 0041 S3.2).
-- =====================================================================================
create or replace function clara.retire_fa_depreciation_policy(p_client uuid, p_asset_account text,
    p_reason text, p_op_key text)
  returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; v_dedupe jsonb; v_firm uuid; v_id uuid;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  v_dedupe := clara._reserve_op(c.firm, 'retire_fa_depreciation_policy', p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'asset', p_asset_account)));
  if v_dedupe is not null then return v_dedupe; end if;
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  if v_firm is null or v_firm <> c.firm then
    raise exception 'client is not in your firm' using errcode = 'CLR11';
  end if;
  perform pg_advisory_xact_lock(203005004, hashtext(p_client::text));

  update clara.fa_account_depreciation_policies
    set active = false, retired_by = c.actor, retired_at = now(),
        retired_reason = coalesce(nullif(btrim(p_reason), ''), 'retire_fa_depreciation_policy')
    where client_id = p_client and asset_account_code = p_asset_account and active
    returning id into v_id;
  if v_id is null then
    raise exception 'no active depreciation policy is set on % for this client', p_asset_account
      using errcode = 'CLR37', detail = '{"reason":"fa_policy_invalid","axis":"not_set"}';
  end if;

  perform clara._audit(c.firm, c.actor, null, null, 'retire_fa_depreciation_policy', null,
    jsonb_build_object('client', p_client, 'asset_account', p_asset_account, 'policy_id', v_id,
      'op_key', p_op_key));
  return clara._finish_op(c.firm, 'retire_fa_depreciation_policy', p_op_key,
    jsonb_build_object('policy_id', v_id, 'client_id', p_client,
      'asset_account_code', p_asset_account, 'active', false));
end $$;
revoke all on function clara.retire_fa_depreciation_policy(uuid, text, text, text) from public;

-- =====================================================================================
-- §D BULK GRANT LOOP (the 0038:8056-8064 idiom, copied 0041:4404-4423): revoke from public,
--    grant to clara_authenticated only, re-assert clara_fn_owner ownership. Idempotent — safe on
--    a redo.
-- =====================================================================================
do $p932_racl$ declare f text; begin
  foreach f in array array[
      'clara.set_fa_depreciation_policy(uuid,text,text,int,int,bigint,text,text)',
      'clara.retire_fa_depreciation_policy(uuid,text,text,text)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to clara_authenticated', f);
    execute format('alter function %s owner to clara_fn_owner', f);
  end loop;
end $p932_racl$;

-- =====================================================================================
-- §E THE BIRTH TRIGGER, RECUT. 0247's body, byte for byte, PLUS the policy lookup and the
--    two-branch column choice it feeds. The UNCOVERED branch is 0247's own values, unmoved.
-- =====================================================================================
create or replace function clara._tf_fa_acquisition_birth() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  l record; v_actor uuid; v_asset uuid; v_pol clara.fa_account_depreciation_policies%rowtype;
  v_desc text; v_method text; v_life int; v_rate int; v_residual bigint; v_start date;
  v_pol_id uuid; v_pol_ver int;
begin
  -- ARM 4's PREDICATE, VERBATIM (0041:2603) …
  if new.is_opening_balance then return null; end if;
  if new.reversal_of is not null then return null; end if;
  if new.flags ? 'fa_disposal' then return null; end if;
  -- … PLUS THE ONE EXCLUSION ARM 4 DOES NOT CARRY. A depreciation run debits the EXPENSE account,
  -- so the cost join below misses it today; closing the site itself means a phantom birth would
  -- need BOTH guards to fail rather than either (0041:2603's own risk note).
  if new.origin = 'scheduled_run' then return null; end if;

  v_actor := coalesce(new.checker_actor, new.maker_actor);
  for l in select jl.id as line_id, jl.account_code, jl.debit_cents,
                  fp.accum_depr_account_code as accum_code,
                  fp.depr_expense_account_code as expense_code
           from clara.journal_lines jl
           join clara.fa_account_profiles fp on fp.client_id = jl.client_id
             and fp.asset_account_code = jl.account_code and fp.active
             -- #972 THE §1.2 WATERMARK, ON EVERY FIRING — NOT ONLY THE FIRST APPROVE (0247,
             -- carried forward byte for byte; see 0247's own header for the full reasoning).
             and coalesce(new.approved_at, new.created_at) >= fp.enrolled_at
           where jl.entry_id = new.id and jl.debit_cents > 0
           order by jl.id loop
    v_asset := null;
    -- #932 THE ACCOUNT'S LIVE DEFAULT DEPRECIATION POLICY, IF ANY. Read once per line, inside
    -- the same loop that already resolves the enrolment: a policy is scoped to the SAME
    -- (client, asset_account_code) pair the profile join already keys on, so no extra join is
    -- needed, only one extra lookup. NULL when no active policy exists — the row then births
    -- EXACTLY as it always has (0216 §B / 0041 arm 4 / 0247).
    select * into v_pol from clara.fa_account_depreciation_policies
      where client_id = new.client_id and asset_account_code = l.account_code and active
      limit 1;
    if v_pol.id is not null then
      -- POLICY-COVERED: the row is born COMPLETE, never "particulars pending". The start date is
      -- the ACQUISITION'S OWN posting date (owner ruling 2026-09-18) — never today's date, and
      -- never the policy's own effective_from, which only gates WHICH acquisitions the policy
      -- reaches. Stated particulars always win: there is today no mechanism for an acquisition
      -- entry itself to carry particulars at posting time (this file's header), so there is
      -- nothing here that could ever override one.
      v_method := v_pol.method; v_life := v_pol.useful_life_months; v_rate := v_pol.rate_bps;
      v_residual := v_pol.residual_cents; v_start := new.posting_date;
      v_pol_id := v_pol.id; v_pol_ver := v_pol.version;
      v_desc := 'Fixed asset - ' || l.account_code || ' RM'
        || to_char(l.debit_cents / 100.0, 'FM999999999990.00');
    else
      -- UNCOVERED: 0247's shape, byte for byte. "Particulars pending" stays the placeholder
      -- description, and every depreciation column stays unset until a person completes it.
      v_method := case when l.accum_code is null then 'none' end;
      v_life := null; v_rate := null; v_residual := 0; v_start := null;
      v_pol_id := null; v_pol_ver := null;
      v_desc := 'Fixed asset (particulars pending) - ' || l.account_code || ' RM'
        || to_char(l.debit_cents / 100.0, 'FM999999999990.00');
    end if;
    -- THE SAME INSERT ARM 4 MAKES, WITH THE SAME CONFLICT TARGET, now widened by the four
    -- particulars columns a completion would otherwise be the only writer of, plus the two
    -- provenance columns. On the four lanes that already birth, the hook got here first and
    -- this writes nothing; on the Work lane it writes the row the estate never had.
    insert into clara.fixed_assets(firm_id, client_id, description, acquired_date, cost_cents,
        residual_cents, depreciation_method, asset_account_code, accum_depr_account_code,
        depr_expense_account_code, acquisition_entry_id, acquisition_line_id,
        acquisition_document_id, accumulated_depreciation_cents, status,
        useful_life_months, depreciation_rate_bps, depreciation_start_date,
        depreciation_policy_id, depreciation_policy_version)
      values (new.firm_id, new.client_id, v_desc,
        new.posting_date, l.debit_cents, v_residual, v_method,
        l.account_code, l.accum_code, l.expense_code, new.id, l.line_id,
        new.document_id, 0, 'active',
        v_life, v_rate, v_start, v_pol_id, v_pol_ver)
      on conflict (acquisition_line_id) do nothing
      returning id into v_asset;
    if v_asset is not null then
      perform clara._append_event(new.firm_id, 'asset.acquired', new.client_id, v_actor,
        null, null, new.id, new.document_id, null,
        jsonb_build_object('asset_id', v_asset, 'line_id', l.line_id,
          'cost_cents', l.debit_cents, 'born_by', 'acquisition_birth_trigger',
          'depreciation_policy_id', v_pol_id, 'depreciation_policy_version', v_pol_ver));
    end if;
  end loop;
  return null;
end $$;
revoke all on function clara._tf_fa_acquisition_birth() from public;
comment on function clara._tf_fa_acquisition_birth() is
  '#639: the LANE-AGNOSTIC fixed-asset acquisition birth. A deferred constraint trigger on '
  'clara.journal_entries, named to fire before t_je_fa_movement_belt (deferred triggers fire in '
  'alphabetical trigger-name order -- measured on clara_639, PG 17.11). Idempotent against '
  'clara._fa_on_approve arm 4 through the same on conflict (acquisition_line_id) do nothing. '
  '#972 (0247): the join carries the 0041 §1.2 enrolment watermark as the exact negation of '
  'clara.fa_register_tie''s own pre-enrolment test. #932 (0277): when the account carries a live '
  'clara.fa_account_depreciation_policies row, the register row is born COMPLETE from it '
  '(method, life-or-rate, residual, and a depreciation_start_date of the acquisition''s OWN '
  'posting date) and stamps the policy''s id and version; an account with no policy still births '
  'the pending row exactly as before.';

-- =====================================================================================
-- §E2 clara._fa_on_approve, RECUT. The body 0041 shipped and 0042/0227/0247 have each spliced
--    onto without ever re-declaring it (verified live, byte for byte, against the pinned
--    pre-image above), PLUS the SAME policy lookup and two-branch column choice §E gives the
--    deferred trigger — arm 4's own soft-birth arm (4) only, nothing else in this body moves.
--    THIS is the site that actually fires for an ordinary approve (this file's header); the
--    deferred trigger's own recut covers the Work lane, where arm 4 is never reached.
-- =====================================================================================
create or replace function clara._fa_on_approve(p_entry uuid) returns void
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  e record; o record; l record; d record; au record; su record;
  -- %ROWTYPE (not record): _fa_particulars_complete takes the composite type.
  a clara.fixed_assets%rowtype;
  v_actor uuid; v_asset uuid; v_prop jsonb; v_recomp jsonb; v_run uuid;
  v_mode text; v_ps date; v_pe date; v_want jsonb; v_have jsonb;
  v_cost bigint; v_accum bigint; v_res bigint; v_portion bigint;
  v_accum_share bigint; v_res_share bigint; v_disposed uuid; v_cont uuid;
  v_dispose_date date; v_unwound int := 0;
  v_bake bigint; v_stub_total bigint; v_ledger_at bigint; v_accum_at bigint; v_disp_accum bigint;
  -- #932 (0277): the SAME policy-lookup locals §E's recut of the deferred trigger declares.
  v_pol clara.fa_account_depreciation_policies%rowtype;
  v_desc text; v_method text; v_life int; v_rate int; v_residual bigint; v_start date;
  v_pol_id uuid; v_pol_ver int;
begin
  select * into e from clara.journal_entries where id = p_entry;
  if not found then return; end if;
  v_actor := coalesce(e.checker_actor, e.maker_actor);

  -- -----------------------------------------------------------------------------------
  -- (1) THE DEPRECIATION PROPOSAL (design SS3.2 "the hook at approve").
  -- -----------------------------------------------------------------------------------
  if e.flags ? 'depreciation_charges' then
    v_prop := e.flags -> 'depreciation_charges';
    -- ORIGIN. The proposal and the origin are one fact; a depreciation proposal on a manual
    -- entry would be a forged machine post wearing a human's clothes.
    if e.origin <> 'scheduled_run' then
      raise exception 'a depreciation proposal may only ride an origin=scheduled_run entry'
        using errcode = 'CLR38',
          detail = jsonb_build_object('reason', 'depreciation_stale', 'axis', 'origin',
            'entry_id', p_entry)::text;
    end if;
    select * into au from clara.fa_depreciation_authorities
      where id = (v_prop ->> 'authority_id')::uuid;
    if not found or au.client_id <> e.client_id or au.status <> 'live' then
      raise exception 'the depreciation authority this proposal names is not live for this client; re-run the period'
        using errcode = 'CLR38',
          detail = jsonb_build_object('reason', 'authority_not_live',
            'authority_id', v_prop ->> 'authority_id')::text;
    end if;
    -- THE PERIOD IS DERIVED, NOT CARRIED: the run verb posts the entry ON the period end, so
    -- the cadence period containing posting_date IS the run's period. One less thing a
    -- proposal can lie about. (Derived BEFORE the issuer binding, which now pins it.)
    if au.cadence = 'monthly' then
      v_ps := clara._fa_month_start(e.posting_date); v_pe := clara._fa_month_end(e.posting_date);
    else
      v_ps := clara._fa_fy_open_for(e.client_id, e.posting_date);
      v_pe := clara._fa_fy_end_for(e.client_id, e.posting_date);
    end if;
    -- THE ISSUER BINDING THAT SURVIVES THE MAKER-CHECKER GAP: the run verb's op key must be
    -- present in the durable op-receipt ledger under one of the two run verbs. A flags blob
    -- alone proves nothing about who wrote it; a receipt does.
    -- BOUND TO THIS CLIENT AND THIS PERIOD, not merely to the firm [round-3 small / STR minor
    -- 1]. clara.op_receipts carries no client column, but _reserve_op stores the REQUEST HASH,
    -- and the run core hashes exactly (client, period_start, period_end) -- so re-deriving that
    -- hash from e.client_id and the period this hook itself derived turns a firm-wide receipt
    -- lookup into an exact match on the act that minted it. An op-receipt belonging to a
    -- SIBLING CLIENT of the same firm no longer authenticates this proposal.
    if not exists (select 1 from clara.op_receipts r
                   where r.firm_id = e.firm_id
                     and r.fn in ('run_depreciation_period', 'run_depreciation_manual')
                     and r.op_key = v_prop ->> 'op_key'
                     and r.request_hash = clara._hash(jsonb_build_object(
                           'client', e.client_id, 'period_start', v_ps, 'period_end', v_pe))) then
      raise exception 'this depreciation proposal carries no issuer op-key receipt for this client and period; re-run the period'
        using errcode = 'CLR38',
          detail = jsonb_build_object('reason', 'depreciation_stale', 'axis', 'issuer')::text;
    end if;
    -- REGISTER FRESHNESS, RE-DERIVED UNDER THE LOCKS (the WCA-R7 approve-time-twin pattern).
    -- The draft window between proposal and approve is a window in which assets complete,
    -- disposals approve and charges unwind. The stored proposal is a statement about a world;
    -- if the world moved, the honest answer is one named refusal whose remedy is stated.
    v_recomp := clara._fa_compute_charges(e.client_id, v_ps, v_pe);
    select coalesce(jsonb_agg(x order by x ->> 'asset_id', x ->> 'period_start'), '[]'::jsonb)
      into v_want from jsonb_array_elements(v_recomp -> 'charges') x;
    select coalesce(jsonb_agg(x order by x ->> 'asset_id', x ->> 'period_start'), '[]'::jsonb)
      into v_have from jsonb_array_elements(v_prop -> 'charges') x;
    if v_want is distinct from v_have then
      raise exception 'the register moved since this depreciation run was proposed; withdraw this draft and re-run the period'
        using errcode = 'CLR38',
          detail = jsonb_build_object('reason', 'depreciation_stale', 'axis', 'charges',
            'period_start', v_ps, 'period_end', v_pe)::text;
    end if;
    -- MODE IS RE-DERIVED, NOT CARRIED (design SS3.3). The run verb's own decision -- ramp
    -- earned AND the entry not high-stakes -- is re-evaluated here from the same facts. It
    -- cannot have moved in between: the sequencing law refuses a second run while a draft is
    -- outstanding, so the ramp predicate is frozen for this entry's whole draft life. (A
    -- created_at/approved_at timestamp comparison was tried and REJECTED: it reads 'post' for
    -- any caller that drafts and approves inside ONE transaction, which is what a harness does.)
    v_mode := case when exists (select 1 from clara.journal_entries j
                       where j.client_id = e.client_id and j.origin = 'scheduled_run'
                         and j.status = 'approved' and j.reversed_by is null and j.id <> p_entry
                         and (j.flags -> 'depreciation_charges' ->> 'authority_id')::uuid = au.id)
                     and not clara.is_high_stakes(p_entry)
                   then 'post' else 'draft' end;
    insert into clara.fa_depreciation_runs(firm_id, client_id, authority_id, period_start,
        period_end, mode, entries, charged_cents, skipped, entry_id, op_key)
      values (e.firm_id, e.client_id, au.id, v_ps, v_pe, v_mode,
        (v_recomp ->> 'entries')::int, (v_recomp ->> 'charged_cents')::bigint,
        v_recomp -> 'skipped', p_entry, v_prop ->> 'op_key')
      returning id into v_run;
    for d in select (x ->> 'asset_id')::uuid as asset_id, (x ->> 'period_start')::date as ps,
                    (x ->> 'period_end')::date as pe, (x ->> 'amount_cents')::bigint as amt
             from jsonb_array_elements(v_prop -> 'charges') x order by 1, 2 loop
      -- THE OVERLAP REFUSAL (design SS1.3). The partial unique index catches only an EXACT
      -- duplicate range; ranges legitimately span months (the annual arm, stubs), so the
      -- overlapping case needs its own probe. Client-rung-serialised, so a plain probe is
      -- sound.
      if clara._fa_range_covered(d.asset_id, d.ps, d.pe) then
        raise exception 'a live depreciation charge already covers % .. % for asset %', d.ps, d.pe, d.asset_id
          using errcode = 'CLR38',
            detail = jsonb_build_object('reason', 'fa_charge_overlap', 'asset_id', d.asset_id,
              'period_start', d.ps, 'period_end', d.pe)::text;
      end if;
      insert into clara.fa_depreciation(firm_id, client_id, asset_id, period_start, period_end,
          amount_cents, effective_date, entry_id, run_id, unwind_of, is_live)
        values (e.firm_id, e.client_id, d.asset_id, d.ps, d.pe, d.amt,
          e.posting_date, p_entry, v_run, null, true);
      perform clara._append_event(e.firm_id, 'asset.depreciated', e.client_id, v_actor,
        null, null, p_entry, null, null,
        jsonb_build_object('asset_id', d.asset_id, 'run_id', v_run, 'period_start', d.ps,
          'period_end', d.pe, 'amount_cents', d.amt));
    end loop;
  end if;

  -- -----------------------------------------------------------------------------------
  -- (2) THE DISPOSAL PROPOSAL (design SS4.2/SS4.3).
  -- -----------------------------------------------------------------------------------
  if e.flags ? 'fa_disposal' then
    v_prop := e.flags -> 'fa_disposal';
    v_dispose_date := (v_prop ->> 'disposal_date')::date;
    select * into a from clara.fixed_assets where id = (v_prop ->> 'asset_id')::uuid;
    if not found or a.client_id <> e.client_id then
      raise exception 'the disposal proposal names an asset that is not this client''s'
        using errcode = 'CLR39',
          detail = jsonb_build_object('reason', 'disposal_stale', 'axis', 'asset')::text;
    end if;
    -- BOUND TO THIS CLIENT AND THIS REQUEST, not merely to the firm [round-3 small / STR minor
    -- 1] -- the same request-hash re-derivation the depreciation arm uses. The disposal verb
    -- hashes exactly these fields, and the proposal carries every one of them, so the receipt
    -- lookup is an exact match on the act that minted it rather than a firm-wide oracle.
    if not exists (select 1 from clara.op_receipts r
                   where r.firm_id = e.firm_id and r.fn = 'dispose_fixed_asset'
                     and r.op_key = v_prop ->> 'op_key'
                     and r.request_hash = clara._hash(jsonb_build_object(
                           'client', e.client_id, 'asset', a.id,
                           'disposal_date', v_dispose_date,
                           'proceeds_cents', (v_prop ->> 'proceeds_cents')::bigint,
                           'proceeds_account', v_prop ->> 'proceeds_account',
                           'gain_account', v_prop ->> 'gain_account',
                           'loss_account', v_prop ->> 'loss_account',
                           'cost_portion_cents',
                             nullif(v_prop ->> 'cost_portion_cents', '')::bigint))) then
      raise exception 'this disposal proposal carries no issuer op-key receipt for this client and request; re-issue the disposal'
        using errcode = 'CLR39',
          detail = jsonb_build_object('reason', 'disposal_stale', 'axis', 'issuer')::text;
    end if;
    if a.status <> 'active' or not clara._fa_particulars_complete(a) then
      raise exception 'this asset is no longer an active, complete register row; re-issue the disposal'
        using errcode = 'CLR39',
          detail = jsonb_build_object('reason', 'disposal_stale', 'axis', 'lifecycle',
            'asset_id', a.id, 'status', a.status)::text;
    end if;
    -- FRESHNESS on the stub, same doctrine as the run arm. THE SAME ONE BODY THE VERB CALLED
    -- [round-4 fold G2b] -- the stub now spans the lineage (ancestor months inside the disposal
    -- period ride it), so re-deriving it from clara._fa_asset_charges alone would refuse every
    -- revised asset's disposal as stale. Sorted by (asset, period) because the array is no
    -- longer single-asset and a period-only sort is not a total order across rows.
    v_recomp := clara._fa_disposal_stub(a.id, v_dispose_date);
    select coalesce(jsonb_agg(x order by x ->> 'asset_id', x ->> 'period_start'), '[]'::jsonb)
      into v_want from jsonb_array_elements(v_recomp -> 'charges') x;
    select coalesce(jsonb_agg(x order by x ->> 'asset_id', x ->> 'period_start'), '[]'::jsonb)
      into v_have from jsonb_array_elements(coalesce(v_prop -> 'stub_charges', '[]'::jsonb)) x;
    if v_want is distinct from v_have then
      raise exception 'the register moved since this disposal was proposed; withdraw this draft and re-issue the disposal'
        using errcode = 'CLR39',
          detail = jsonb_build_object('reason', 'disposal_stale', 'axis', 'stub',
            'asset_id', a.id)::text;
    end if;
    -- AND THE ACCUMULATED RELIEF IS RE-DERIVED TOO [round-3.5 fold G1]. The stub fingerprint
    -- above pins only THIS row's own uncharged months; the GL's accumulated-depreciation debit
    -- leg -- and therefore NBV and the gain or loss on this disposal -- is a LINEAGE figure. An
    -- ANCESTOR charged (or reversed) between draft and approve moves it silently, and the entry
    -- the checker approves would then relieve an amount the register no longer holds, breaking
    -- the tie at the disposal date with nothing to say why. Re-derived from the SAME period-net
    -- decomposition the verb used, under the same locks, and refused by name if it moved.
    v_bake := coalesce(a.accumulated_depreciation_cents, 0);
    v_stub_total := (v_recomp ->> 'amount_cents')::bigint;
    v_ledger_at := clara._fa_accumulated_periods_through(a.id,
                     clara._fa_month_end(v_dispose_date)) - v_bake + v_stub_total;
    v_accum_at := v_bake + v_ledger_at;
    v_portion := nullif(v_prop ->> 'cost_portion_cents', '')::bigint;
    v_disp_accum := case when v_portion is null then v_accum_at
                         else round(v_bake::numeric * v_portion / a.cost_cents)::bigint
                            + round(v_ledger_at::numeric * v_portion / a.cost_cents)::bigint end;
    if v_disp_accum is distinct from nullif(v_prop ->> 'accum_relieved_cents', '')::bigint then
      raise exception 'the accumulated depreciation this disposal relieves moved since it was proposed; withdraw this draft and re-issue the disposal'
        using errcode = 'CLR39',
          detail = jsonb_build_object('reason', 'disposal_stale', 'axis', 'accum',
            'asset_id', a.id, 'proposed_cents',
            nullif(v_prop ->> 'accum_relieved_cents', '')::bigint,
            'recomputed_cents', v_disp_accum)::text;
    end if;
    -- THE STUB MATERIALISES HERE, beside the disposal, from the same one hook. PER ASSET
    -- ALREADY: the wire shape has always carried asset_id and this loop has always minted from
    -- it, which is why the G2b lineage extension needed no new mechanism here -- an ancestor's
    -- month lands on the ANCESTOR's row, and the entry's single expense/accumulated leg pair
    -- carries the total (clara._fa_disposal_stub refuses a lineage whose account codes diverge).
    for d in select (x ->> 'asset_id')::uuid as asset_id, (x ->> 'period_start')::date as ps,
                    (x ->> 'period_end')::date as pe, (x ->> 'amount_cents')::bigint as amt
             from jsonb_array_elements(coalesce(v_prop -> 'stub_charges', '[]'::jsonb)) x
             order by 1, 2 loop
      if clara._fa_range_covered(d.asset_id, d.ps, d.pe) then
        raise exception 'a live depreciation charge already covers % .. % for asset %', d.ps, d.pe, d.asset_id
          using errcode = 'CLR38',
            detail = jsonb_build_object('reason', 'fa_charge_overlap', 'asset_id', d.asset_id,
              'period_start', d.ps, 'period_end', d.pe)::text;
      end if;
      insert into clara.fa_depreciation(firm_id, client_id, asset_id, period_start, period_end,
          amount_cents, effective_date, entry_id, run_id, unwind_of, is_live)
        values (e.firm_id, e.client_id, d.asset_id, d.ps, d.pe, d.amt,
          v_dispose_date, p_entry, null, null, true);
      perform clara._append_event(e.firm_id, 'asset.depreciated', e.client_id, v_actor,
        null, null, p_entry, null, null,
        jsonb_build_object('asset_id', d.asset_id, 'run_id', null, 'period_start', d.ps,
          'period_end', d.pe, 'amount_cents', d.amt));
    end loop;

    v_portion := nullif(v_prop ->> 'cost_portion_cents', '')::bigint;
    if v_portion is null then
      update clara.fixed_assets set status = 'disposed', disposed_at = v_dispose_date,
        disposal_entry_id = p_entry, updated_at = now() where id = a.id;
      perform clara._append_event(e.firm_id, 'asset.disposed', e.client_id, v_actor,
        null, null, p_entry, null, null,
        jsonb_build_object('asset_id', a.id, 'partial', false, 'disposal_date', v_dispose_date,
          'proceeds_cents', (v_prop ->> 'proceeds_cents')::bigint));
    else
      -- THE SUPERSEDE SPLIT (design SS4.3; WD-R7). The original -> superseded; two successors
      -- born with effective_from = THE ENTRY'S POSTING DATE, so a pre-split as-of read sees
      -- ONLY the original and a post-split read sees ONLY the successors. That effective
      -- dating is what makes the round-2 worked RM100,000 double-count unrepresentable
      -- [L2/round-2 fold 3]. THE REMAINDER ABSORBS ALL ROUNDING (WD-R7's sen law), so
      -- register totals tie at every as-of by construction rather than by luck.
      v_cost := a.cost_cents;
      v_res := coalesce(a.residual_cents, 0);
      -- THE BAKE CARRIES THE BASELINE SHARE AND NOTHING ELSE [round-3 fold F1]. The parent's
      -- LEDGER content is not divided here at all -- clara._fa_accumulated_at pro-rates it at
      -- READ time, by the same remainder-absorbing rule, so a charge that lands on the
      -- superseded parent after the split still reaches the continuing successor instead of
      -- disappearing into a frozen number. Only the CARRIED baseline (which can never move) is
      -- split now, with the remainder absorbed by the continuing row exactly as before.
      v_accum := coalesce(a.accumulated_depreciation_cents, 0);
      v_accum_share := round(v_accum::numeric * v_portion / v_cost)::bigint;
      v_res_share := round(v_res::numeric * v_portion / v_cost)::bigint;
      insert into clara.fixed_assets(firm_id, client_id, description, acquired_date, cost_cents,
          residual_cents, useful_life_months, depreciation_method, depreciation_rate_bps,
          asset_account_code, accum_depr_account_code, depr_expense_account_code,
          accumulated_depreciation_cents, depreciation_start_date, baseline_as_of, status,
          supersedes_asset_id, effective_from, disposed_at, disposal_entry_id,
          ca_class, is_commercial_vehicle, is_new)
        values (e.firm_id, e.client_id, a.description || ' (disposed portion)', a.acquired_date,
          v_portion, v_res_share, a.useful_life_months, a.depreciation_method,
          a.depreciation_rate_bps, a.asset_account_code, a.accum_depr_account_code,
          a.depr_expense_account_code, v_accum_share, a.depreciation_start_date, e.posting_date,
          'disposed', a.id, e.posting_date, v_dispose_date, p_entry,
          a.ca_class, a.is_commercial_vehicle, a.is_new)
        returning id into v_disposed;
      insert into clara.fixed_assets(firm_id, client_id, description, acquired_date, cost_cents,
          residual_cents, useful_life_months, depreciation_method, depreciation_rate_bps,
          asset_account_code, accum_depr_account_code, depr_expense_account_code,
          accumulated_depreciation_cents, depreciation_start_date, baseline_as_of, status,
          supersedes_asset_id, effective_from, ca_class, is_commercial_vehicle, is_new)
        values (e.firm_id, e.client_id, a.description, a.acquired_date,
          v_cost - v_portion, v_res - v_res_share, a.useful_life_months, a.depreciation_method,
          a.depreciation_rate_bps, a.asset_account_code, a.accum_depr_account_code,
          a.depr_expense_account_code, v_accum - v_accum_share, a.depreciation_start_date,
          e.posting_date, 'active', a.id, e.posting_date,
          a.ca_class, a.is_commercial_vehicle, a.is_new)
        returning id into v_cont;
      -- SPLIT LINEAGE LAW (design SS1.1): superseded_by_asset_id always names the CONTINUING
      -- successor; the disposed portion is reachable upward only, and every read traverses up.
      update clara.fixed_assets set status = 'superseded', superseded_by_asset_id = v_cont,
        superseded_at = e.posting_date, updated_at = now() where id = a.id;
      perform clara._append_event(e.firm_id, 'asset.disposed', e.client_id, v_actor,
        null, null, p_entry, null, null,
        jsonb_build_object('asset_id', a.id, 'partial', true, 'disposal_date', v_dispose_date,
          'proceeds_cents', (v_prop ->> 'proceeds_cents')::bigint,
          'disposed_asset_id', v_disposed, 'continuing_asset_id', v_cont));
    end if;
  end if;

  -- -----------------------------------------------------------------------------------
  -- (3) THE REVERSAL MIRROR: THE APPROVE-TIME TWINS (design SS2.4). Dependency-ordered --
  -- acquisition first (it refuses while descendants live), then the disposal restore, then
  -- the charge unwinds -- so every refusal reads UNTOUCHED state.
  -- K-family mirrors are skipped: the K-family owns its own rows (WD-R1's exclusion).
  -- -----------------------------------------------------------------------------------
  if e.reversal_of is not null and not e.is_opening_balance then
    select * into o from clara.journal_entries where id = e.reversal_of;

    -- EVERY REFUSAL READS UNTOUCHED STATE. All three probes run FIRST, from the one body the
    -- verb-side guard also calls (S2.4b), so no arm can mutate the world a later refusal is
    -- about to read, and the verb and the hook can never name different tokens.
    perform clara._fa_reversal_blocked(o.id);

    -- (3a) ACQUISITION REVERSAL -- the WHOLE revision chain unwinds (S2.4b law 1).
    if exists (select 1 from clara.fixed_assets f where f.acquisition_entry_id = o.id) then
      -- A superseded predecessor being unwound must ALSO release superseded_by_asset_id: the
      -- 0017 CHECK reads (status='superseded') = (superseded_by is not null), so leaving the
      -- link behind on an unwound row would violate it. Clearing it is honest anyway -- the
      -- revision it named is being unwound in the same statement.
      update clara.fixed_assets set status = 'unwound', superseded_by_asset_id = null,
        superseded_at = null, updated_at = now()
        where id = any(clara._fa_reversal_lineage(o.id)) and status <> 'unwound';
    end if;

    -- (3c) DISPOSAL REVERSAL -- full restore, or the PARTIAL-SPLIT reversal [L2/round-2 fold
    -- 9], DISCRIMINATED ON THE ENTRY [round-3 fold F4]: a partial disposal is one whose own
    -- fa_disposal proposal named a cost portion. Row lineage cannot decide this -- a revision
    -- successor and a split successor both carry supersedes_asset_id.
    if exists (select 1 from clara.fixed_assets f where f.disposal_entry_id = o.id) then
      if (o.flags -> 'fa_disposal' ->> 'cost_portion_cents') is not null then
        select * into a from clara.fixed_assets
          where disposal_entry_id = o.id and supersedes_asset_id is not null
            and status <> 'unwound' limit 1;
        if found then
          select * into su from clara.fixed_assets where id = a.supersedes_asset_id;
          -- THE WHOLE CLEAN CHAIN BELOW BOTH CHILDREN UNWINDS [round-3.5 fold G5], through the
          -- same closure the guard above admitted: a particulars revision made on a split
          -- successor is part of the split, not an independent act, and leaving it behind
          -- 'active' while its parent is unwound would strand a register row whose cost the GL
          -- no longer carries. Superseded links are released for the same 0017-CHECK reason arm
          -- 3a states: (status='superseded') = (superseded_by is not null).
          update clara.fixed_assets set status = 'unwound', disposed_at = null,
            disposal_entry_id = null, superseded_by_asset_id = null, superseded_at = null,
            updated_at = now()
            where id = any(clara._fa_revision_closure(
                            (select coalesce(array_agg(k.id), '{}'::uuid[])
                               from clara.fixed_assets k
                              where k.supersedes_asset_id = su.id and k.status <> 'unwound')))
              and status <> 'unwound';
          update clara.fixed_assets set status = 'active', superseded_by_asset_id = null,
            superseded_at = null, updated_at = now() where id = su.id;
        end if;
      else
        update clara.fixed_assets set status = 'active', disposed_at = null,
          disposal_entry_id = null, updated_at = now() where disposal_entry_id = o.id;
      end if;
    end if;

    -- (3b) CHARGE UNWINDS. is_live LAW (design SS1.3): FLIP the original false, THEN append
    -- the unwind row born DEAD. Neither can collide, because an unwind row never enters the
    -- partial unique index. Effective-dated at the MIRROR'S posting date (which the SS5.2 MYT
    -- splice makes the Malaysian legal date), so an as-of read before the reversal still sees
    -- the charge -- which is the truth.
    for d in select * from clara.fa_depreciation where entry_id = o.id and is_live
             order by asset_id, period_start loop
      update clara.fa_depreciation set is_live = false where id = d.id;
      insert into clara.fa_depreciation(firm_id, client_id, asset_id, period_start, period_end,
          amount_cents, effective_date, entry_id, run_id, unwind_of, is_live)
        values (d.firm_id, d.client_id, d.asset_id, d.period_start, d.period_end,
          d.amount_cents, e.posting_date, p_entry, null, d.id, false);
      v_unwound := v_unwound + 1;
    end loop;
  end if;

  -- -----------------------------------------------------------------------------------
  -- (4) SOFT-BIRTH (design SS2.2; WD-R1). One row per LINE -- a multi-unit leg births one
  -- row (SS4.3's split divides later) and freight on a second line births a second row BY
  -- DESIGN: no merge door exists, and the practice is one asset per line (SS9.4).
  -- EXCLUSIONS: K-family entries (the carry-down owns its own rows, and including them
  -- double-birthed at K5 and wedged K6) and reversal mirrors (arm 3 owns those).
  -- -----------------------------------------------------------------------------------
  -- A DISPOSAL NEVER BIRTHS [round-3.5 fold G4]. A disposal's accumulated-depreciation relief
  -- is a DEBIT, and the day a freed accumulated code is re-enrolled as some other profile's
  -- COST account that debit matches this join and soft-births a phantom register row with a
  -- fabricated cost -- probed end to end. The reservation predicate (S2.4c) now makes that
  -- re-enrolment unreachable, and this exclusion closes the mechanical site itself, so the
  -- phantom needs BOTH guards to fail rather than either.
  if not e.is_opening_balance and e.reversal_of is null and not (e.flags ? 'fa_disposal') then
    for l in select jl.id as line_id, jl.account_code, jl.debit_cents,
                    fp.accum_depr_account_code as accum_code,
                    fp.depr_expense_account_code as expense_code
             from clara.journal_lines jl
             join clara.fa_account_profiles fp on fp.client_id = jl.client_id
               and fp.asset_account_code = jl.account_code and fp.active
             where jl.entry_id = p_entry and jl.debit_cents > 0
             order by jl.id loop
      v_asset := null;
      -- #932 (0277): THE ACCOUNT'S LIVE DEFAULT DEPRECIATION POLICY, IF ANY — the SAME lookup
      -- §E's recut of the deferred trigger makes. THIS is the birth site that actually fires
      -- for a normal approve (this file's header): arm 4 runs synchronously, before the
      -- deferred trigger's own commit-time fire, and both share one conflict target, so
      -- whichever inserts first wins and the other's "on conflict … do nothing" absorbs it.
      select * into v_pol from clara.fa_account_depreciation_policies
        where client_id = e.client_id and asset_account_code = l.account_code and active
        limit 1;
      if v_pol.id is not null then
        v_method := v_pol.method; v_life := v_pol.useful_life_months; v_rate := v_pol.rate_bps;
        v_residual := v_pol.residual_cents; v_start := e.posting_date;
        v_pol_id := v_pol.id; v_pol_ver := v_pol.version;
        v_desc := 'Fixed asset - ' || l.account_code || ' RM'
          || to_char(l.debit_cents / 100.0, 'FM999999999990.00');
      else
        v_method := case when l.accum_code is null then 'none' end;
        v_life := null; v_rate := null; v_residual := 0; v_start := null;
        v_pol_id := null; v_pol_ver := null;
        v_desc := 'Fixed asset (particulars pending) - ' || l.account_code || ' RM'
          || to_char(l.debit_cents / 100.0, 'FM999999999990.00');
      end if;
      insert into clara.fixed_assets(firm_id, client_id, description, acquired_date, cost_cents,
          residual_cents, depreciation_method, asset_account_code, accum_depr_account_code,
          depr_expense_account_code, acquisition_entry_id, acquisition_line_id,
          accumulated_depreciation_cents, status,
          useful_life_months, depreciation_rate_bps, depreciation_start_date,
          depreciation_policy_id, depreciation_policy_version)
        values (e.firm_id, e.client_id, v_desc,
          e.posting_date, l.debit_cents, v_residual, v_method,
          l.account_code, l.accum_code, l.expense_code, p_entry, l.line_id,
          0, 'active', v_life, v_rate, v_start, v_pol_id, v_pol_ver)
        on conflict (acquisition_line_id) do nothing
        returning id into v_asset;
      if v_asset is not null then
        perform clara._append_event(e.firm_id, 'asset.acquired', e.client_id, v_actor,
          null, null, p_entry, e.document_id, null,
          jsonb_build_object('asset_id', v_asset, 'line_id', l.line_id,
            'cost_cents', l.debit_cents,
            'depreciation_policy_id', v_pol_id, 'depreciation_policy_version', v_pol_ver));
      end if;
    end loop;
  end if;
end $$;
revoke all on function clara._fa_on_approve(uuid) from public;

-- =====================================================================================
-- §F clara._fa_asset_json, RECUT. 0216's body, byte for byte, plus the two provenance keys. The
--    ONE source both clara.list_fixed_assets and clara.get_fixed_asset's own `asset` block read
--    a row through, so the Fixed Assets register list and the detail view both gain the keys
--    from ONE recut.
-- =====================================================================================
create or replace function clara._fa_asset_json(p_asset uuid, p_as_of date) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare f clara.fixed_assets%rowtype; v_acc bigint; v_unch jsonb; v_split jsonb;
  v_dfreeze boolean; v_ddraft uuid; v_doc uuid;
begin
  select * into f from clara.fixed_assets where id = p_asset;
  if not found then return null; end if;
  v_acc := case when f.baseline_as_of is null or p_as_of >= f.baseline_as_of
                then clara._fa_accumulated(p_asset, p_as_of) end;
  v_unch := clara._fa_uncharged_months(p_asset, clara._fa_month_end(clara._fa_today()));
  v_split := clara._fa_split_month_advisory(p_asset);
  v_dfreeze := clara._fa_disposal_draft_outstanding(f.client_id, p_asset, 'infinity'::date);
  v_ddraft := null;
  if v_dfreeze then
    select je.id into v_ddraft from clara.journal_entries je
      where je.client_id = f.client_id and je.status = 'draft' and je.flags ? 'fa_disposal'
        and (je.flags -> 'fa_disposal' ->> 'asset_id')::uuid = p_asset
        and (je.flags -> 'fa_disposal' ->> 'disposal_date')::date <= 'infinity'::date
      order by (je.flags -> 'fa_disposal' ->> 'disposal_date')::date, je.id
      limit 1;
  end if;
  select coalesce(f.acquisition_document_id, e.document_id) into v_doc
    from clara.journal_entries e where e.id = f.acquisition_entry_id;
  return jsonb_build_object(
    'id', f.id, 'description', f.description, 'status', f.status,
    'particulars_complete', clara._fa_particulars_complete(f),
    'acquired_date', f.acquired_date, 'effective_from', f.effective_from,
    'superseded_at', f.superseded_at, 'cost_cents', f.cost_cents,
    'residual_cents', f.residual_cents, 'accumulated_cents', v_acc,
    'nbv_cents', case when v_acc is null then null else f.cost_cents - v_acc end,
    'method', f.depreciation_method, 'rate_bps', f.depreciation_rate_bps,
    'useful_life_months', f.useful_life_months, 'start_date', f.depreciation_start_date,
    'asset_account', f.asset_account_code, 'accum_account', f.accum_depr_account_code,
    'expense_account', f.depr_expense_account_code, 'ca_class', f.ca_class,
    'is_commercial_vehicle', f.is_commercial_vehicle, 'is_new', f.is_new,
    'superseded_by_asset_id', f.superseded_by_asset_id, 'disposed_at', f.disposed_at,
    'disposal_entry_id', f.disposal_entry_id,
    'uncharged_due', v_unch,
    'uncharged_due_count', jsonb_array_length(v_unch),
    'split_month_advisory', v_split,
    'split_month_advisory_count', jsonb_array_length(v_split),
    'disposal_draft_outstanding', v_dfreeze,
    'disposal_draft_entry_id', v_ddraft,
    'acquisition_entry_id', f.acquisition_entry_id,
    'acquisition_line_id', f.acquisition_line_id,
    'acquisition_document_id', v_doc,
    -- 0227 (#651): THE CHANGE CLASSIFICATION, carried forward BYTE FOR BYTE — this file's own
    -- prestate/tail measured the live text with these two keys already present (0227 §H's own
    -- splice; NOT part of 0216's original literal body, which is why a naive copy of 0216's file
    -- text alone would have silently dropped them — caught by re-driving p651.class.required
    -- against this recut before this file's final cut).
    'change_class', f.change_class,
    'change_reason', f.change_reason,
    -- #932 (0277): PROVENANCE. NULL on every row a policy did not birth — the pre-0277 shape,
    -- unmoved. The Fixed Assets surface renders "particulars from <asset_account> policy v<N>"
    -- from these two keys beside the particulars, never a client-side inference.
    'depreciation_policy_id', f.depreciation_policy_id,
    'depreciation_policy_version', f.depreciation_policy_version);
end $$;
revoke all on function clara._fa_asset_json(uuid, date) from public;

reset role;

-- =====================================================================================
-- §T THE TAIL. Every assertion re-read from the CATALOG after the recut/creation.
-- =====================================================================================
do $p932_tail$
declare
  v_src text; v_n int; v_pin record; v_sha text; v_rls boolean; v_force boolean;
begin
  -- T.1 THE RELATION: exists, RLS enabled+forced, the two policies present, SELECT granted to
  -- clara_authenticated and NOTHING ELSE, the active-uniqueness index present.
  if to_regclass('clara.fa_account_depreciation_policies') is null then
    raise exception '#932 tail T.1: clara.fa_account_depreciation_policies does not exist' using errcode='CLR10';
  end if;
  select relrowsecurity, relforcerowsecurity into v_rls, v_force from pg_class
    where oid = 'clara.fa_account_depreciation_policies'::regclass;
  if not v_rls or not v_force then
    raise exception '#932 tail T.1b: clara.fa_account_depreciation_policies is not RLS enabled+forced' using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_policies
    where schemaname = 'clara' and tablename = 'fa_account_depreciation_policies';
  if v_n <> 2 then
    raise exception '#932 tail T.1c: expected exactly 2 policies on clara.fa_account_depreciation_policies, found %', v_n
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from information_schema.role_table_grants
    where table_schema = 'clara' and table_name = 'fa_account_depreciation_policies'
      and grantee = 'clara_authenticated';
  if v_n <> 1 then
    raise exception '#932 tail T.1d: expected exactly 1 grant row to clara_authenticated on the new relation (SELECT only), found %', v_n
      using errcode='CLR10';
  end if;
  select privilege_type into v_src from information_schema.role_table_grants
    where table_schema = 'clara' and table_name = 'fa_account_depreciation_policies'
      and grantee = 'clara_authenticated';
  if v_src <> 'SELECT' then
    raise exception '#932 tail T.1e: clara_authenticated''s one grant on the new relation is %, expected SELECT', v_src
      using errcode='CLR10';
  end if;
  if not exists (select 1 from pg_indexes
                  where schemaname = 'clara' and tablename = 'fa_account_depreciation_policies'
                    and indexname = 'uq_fadp_active') then
    raise exception '#932 tail T.1f: uq_fadp_active is missing -- one live policy per enrolled account is not enforced' using errcode='CLR10';
  end if;

  -- T.2 THE TWO NEW DOORS: SECURITY DEFINER, owned by clara_fn_owner, search_path pinned, PUBLIC
  -- holds no EXECUTE, clara_authenticated holds EXACTLY EXECUTE.
  for v_pin in select * from (values
      ('clara.set_fa_depreciation_policy(uuid,text,text,int,int,bigint,text,text)'),
      ('clara.retire_fa_depreciation_policy(uuid,text,text,text)')) as t(sig) loop
    select count(*)::int into v_n from pg_proc p
     where p.oid = v_pin.sig::regprocedure
       and p.proowner::regrole::text = 'clara_fn_owner' and p.prosecdef
       and 'search_path=clara, pg_temp' = any(p.proconfig);
    if v_n <> 1 then
      raise exception '#932 tail T.2: % is missing its definer/owner/search_path shape', v_pin.sig
        using errcode='CLR10';
    end if;
    if has_function_privilege('public', v_pin.sig::regprocedure, 'EXECUTE') then
      raise exception '#932 tail T.2b: PUBLIC holds EXECUTE on %', v_pin.sig using errcode='CLR10';
    end if;
    if not has_function_privilege('clara_authenticated', v_pin.sig::regprocedure, 'EXECUTE') then
      raise exception '#932 tail T.2c: clara_authenticated does NOT hold EXECUTE on %', v_pin.sig using errcode='CLR10';
    end if;
    if has_function_privilege('clara_runtime', v_pin.sig::regprocedure, 'EXECUTE') then
      raise exception '#932 tail T.2d: clara_runtime holds EXECUTE on % -- this is a human-judgement door, no machine role', v_pin.sig
        using errcode='CLR10';
    end if;
  end loop;

  -- T.3 THE BIRTH BODY carries the policy read exactly once, still returns exactly one insert
  -- with the same conflict target, and 0247's four early returns plus its watermark predicate
  -- all survive untouched.
  select p.prosrc into v_src from pg_proc p where p.oid = 'clara._tf_fa_acquisition_birth()'::regprocedure;
  for v_pin in select * from (values
      ('from clara.fa_account_depreciation_policies', 1),
      ('insert into clara.fixed_assets(', 1),
      ('on conflict (acquisition_line_id) do nothing', 1),
      ($$'asset.acquired'$$, 1),
      ('if new.is_opening_balance then return null; end if;', 1),
      ('if new.reversal_of is not null then return null; end if;', 1),
      ($$if new.flags ? 'fa_disposal' then return null; end if;$$, 1),
      ($$if new.origin = 'scheduled_run' then return null; end if;$$, 1),
      ('coalesce(new.approved_at, new.created_at) >= fp.enrolled_at', 1),
      ($$'Fixed asset (particulars pending) - '$$, 1),
      ($$'Fixed asset - '$$, 1)) as t(marker, want) loop
    v_n := (length(v_src) - length(replace(v_src, v_pin.marker, ''))) / length(v_pin.marker);
    if v_n <> v_pin.want then
      raise exception '#932 tail T.3: the recut birth body carries "%" % time(s), expected %', v_pin.marker, v_n, v_pin.want
        using errcode='CLR10';
    end if;
  end loop;
  select count(*)::int into v_n from pg_proc p
   where p.oid = 'clara._tf_fa_acquisition_birth()'::regprocedure
     and p.proowner::regrole::text='clara_fn_owner' and p.prosecdef
     and 'search_path=clara, pg_temp' = any(p.proconfig);
  if v_n <> 1 then
    raise exception '#932 tail T.3b: clara._tf_fa_acquisition_birth lost its owner, its SECURITY DEFINER flag or its pinned search_path' using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_trigger t
   where t.tgrelid = 'clara.journal_entries'::regclass and t.tgname = 't_je_fa_acquisition_birth'
     and t.tgdeferrable and t.tginitdeferred and not t.tgisinternal
     and t.tgfoid = 'clara._tf_fa_acquisition_birth()'::regprocedure;
  if v_n <> 1 then
    raise exception '#932 tail T.3c: t_je_fa_acquisition_birth is no longer the deferred insert-or-update constraint trigger on this recut body' using errcode='CLR10';
  end if;

  -- T.3d clara._fa_on_approve arm 4 — THE SITE THAT ACTUALLY FIRES FOR A NORMAL APPROVE — carries
  -- the SAME policy read exactly once, its own conflict target survives, and every OTHER
  -- section (the depreciation proposal, the disposal proposal, the reversal mirror) keeps a
  -- representative marker each, proving this recut moved arm 4's insert and nothing upstream of
  -- it in the same body.
  select p.prosrc into v_src from pg_proc p where p.oid = 'clara._fa_on_approve(uuid)'::regprocedure;
  for v_pin in select * from (values
      ('from clara.fa_account_depreciation_policies', 1),
      ('on conflict (acquisition_line_id) do nothing', 1),
      ($$'Fixed asset (particulars pending) - '$$, 1),
      ($$'Fixed asset - '$$, 1),
      -- non-regression markers, ONE per untouched arm, so a recut that damaged an earlier
      -- section fails here rather than only in a behavioural cell far from this migration.
      ($$e.flags ? 'depreciation_charges'$$, 1),
      ($$e.flags ? 'fa_disposal'$$, 2),
      ('e.reversal_of is not null and not e.is_opening_balance', 1),
      ('clara._fa_reversal_blocked(o.id)', 1)) as t(marker, want) loop
    v_n := (length(v_src) - length(replace(v_src, v_pin.marker, ''))) / length(v_pin.marker);
    if v_n <> v_pin.want then
      raise exception '#932 tail T.3d: the recut clara._fa_on_approve carries "%" % time(s), expected %', v_pin.marker, v_n, v_pin.want
        using errcode='CLR10';
    end if;
  end loop;
  select count(*)::int into v_n from pg_proc p
   where p.oid = 'clara._fa_on_approve(uuid)'::regprocedure
     and p.proowner::regrole::text='clara_fn_owner' and p.prosecdef
     and 'search_path=clara, pg_temp' = any(p.proconfig);
  if v_n <> 1 then
    raise exception '#932 tail T.3e: clara._fa_on_approve lost its owner, its SECURITY DEFINER flag or its pinned search_path' using errcode='CLR10';
  end if;
  -- …and the CALLER SET is unchanged (0247's own p972.sites cell pins it at exactly
  -- {_subledger_on_approve}): this recut changed arm 4's BODY, never who calls it.
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'clara' and p.proname = '_subledger_on_approve'
                    and p.prosrc like '%clara._fa_on_approve(%') then
    raise exception '#932 tail T.3f: clara._subledger_on_approve no longer calls clara._fa_on_approve' using errcode='CLR10';
  end if;

  -- T.4 THE COLUMN LIST: the two new provenance columns exist, NULLABLE, and the tenant-
  -- congruence FK is in place.
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'clara' and table_name = 'fixed_assets'
                    and column_name = 'depreciation_policy_id' and is_nullable = 'YES') then
    raise exception '#932 tail T.4: clara.fixed_assets.depreciation_policy_id is missing or NOT NULL' using errcode='CLR10';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'clara' and table_name = 'fixed_assets'
                    and column_name = 'depreciation_policy_version' and is_nullable = 'YES') then
    raise exception '#932 tail T.4b: clara.fixed_assets.depreciation_policy_version is missing or NOT NULL' using errcode='CLR10';
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'clara.fixed_assets'::regclass
                    and conname = 'fk_fa_depreciation_policy_congruent') then
    raise exception '#932 tail T.4c: fk_fa_depreciation_policy_congruent is missing' using errcode='CLR10';
  end if;

  -- T.5 clara._fa_asset_json carries the two provenance keys exactly once each, KEEPS 0227
  -- §H's change-classification keys (the ones a naive copy of 0216's pre-0227 file text would
  -- have silently dropped — the exact mistake this tail exists to catch), and its two callers
  -- (unmoved, re-read below) need no text change to surface any of them.
  select p.prosrc into v_src from pg_proc p where p.oid = 'clara._fa_asset_json(uuid,date)'::regprocedure;
  for v_pin in select * from (values
      ($$'depreciation_policy_id', f.depreciation_policy_id$$, 1),
      ($$'depreciation_policy_version', f.depreciation_policy_version$$, 1),
      ($$'change_class', f.change_class$$, 1),
      ($$'change_reason', f.change_reason$$, 1)) as t(marker, want) loop
    v_n := (length(v_src) - length(replace(v_src, v_pin.marker, ''))) / length(v_pin.marker);
    if v_n <> v_pin.want then
      raise exception '#932 tail T.5: the recut clara._fa_asset_json carries "%" % time(s), expected %', v_pin.marker, v_n, v_pin.want
        using errcode='CLR10';
    end if;
  end loop;
  select count(*)::int into v_n from pg_proc p
   where p.oid = 'clara._fa_asset_json(uuid,date)'::regprocedure
     and p.provolatile = 's' and p.proowner::regrole::text='clara_fn_owner' and p.prosecdef
     and 'search_path=clara, pg_temp' = any(p.proconfig);
  if v_n <> 1 then
    raise exception '#932 tail T.5b: clara._fa_asset_json lost its stable/definer/owner/search_path shape' using errcode='CLR10';
  end if;

  -- T.6 NON-REGRESSION, re-read: AC1's own "untouched" requirement plus every neighbour this
  -- file's new code relies on are byte-for-byte what the prestate measured.
  for v_pin in select * from (values
      ('clara.upsert_fa_account_profile(uuid,text,text,text,text)',
       '14cba9a309642dafa8a39131a3b850f9663b5b7d64e3fea8632852c11af0e41c'),
      ('clara.retire_fa_account_profile(uuid,text,text)',
       '82d15cc67c95116521f64c3e11e85e3f806a7ce1c03bc361ec62db81b4fcd939'),
      ('clara._fa_particulars_complete(clara.fixed_assets)',
       '4f96d11ef385a1b5ca26eedb088a4de8e7c6b0d457576053039468fcad6b32a9'),
      ('clara._fa_validate_particulars(jsonb)',
       '971242090b8171fa7f5ca50acdba9f536b07b498018a12d9778cb24d2d40858b'),
      ('clara.complete_fixed_asset_particulars(uuid,uuid,jsonb,text)',
       '42ec4851c5e50a3b6d84d203f84a7957ce687962ada6fe4a9ae406ed1889026c'),
      ('clara._fa_complete_particulars_core(uuid,uuid,uuid,uuid,jsonb,text,text)',
       '054b758c53f60a0e385efba7af3890c040bc2097319e0bc31c57b9640dfc2afc'),
      ('clara._fa_assert_completion_not_a_change(uuid,jsonb)',
       '8c4e0a6d51f1c8c749f940895b2bee47e8f2cd997629dca539a9cc7d6f3dae9d'),
      ('clara._fa_assert_particulars_completable(uuid,clara.fixed_assets,jsonb)',
       '6e5993fa44ef4b52d1d77bce7bd546fd2ad7b53a1b8a92c57d4043580b04e107'),
      ('clara.revise_fixed_asset_particulars(uuid,uuid,jsonb,date,text)',
       'c814f6fd766565653e9649fa02b23b69f2b7c968f2988efff298a2a6ca48b437'),
      ('clara.fa_register_tie(uuid,date)',
       'c9f47463e1e5c02d56bc1ed7a5396d672990bf2f50de20e33cb47a59cbe67586'),
      ('clara._fa_compute_charges(uuid,date,date)',
       'a6566557a258444c0511c6ed14bad033ce738c841e8ce54c50ce227ca152e048'),
      ('clara._fa_asset_charges(uuid,date,boolean)',
       'a0122346d1e54ed847eebc60288e52b95cb5199e3035920f2c833fd2743ab849'),
      ('clara.list_fixed_assets(uuid)',
       '8063a726881033c431bd9a65e252ae6a2a52732009becef6eeb07392532c7ef7'),
      ('clara.get_fixed_asset(uuid)',
       'da9333ebdd3bcaeea916f31651dbf0e87378a525e8c19fd98035141f6fd8be5a')
    ) as t(sig, sha) loop
    select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
      from pg_proc p where p.oid = v_pin.sig::regprocedure;
    if v_sha is distinct from v_pin.sha then
      raise exception '#932 tail T.6: % MOVED (measured %, expected %) -- this file recuts exactly three bodies and mints two new ones', v_pin.sig, v_sha, v_pin.sha
        using errcode='CLR10';
    end if;
  end loop;

  raise notice '#932 tail OK: clara.fa_account_depreciation_policies exists, RLS-walled, SELECT-only to clara_authenticated, one-live-per-account indexed; clara.set_fa_depreciation_policy and clara.retire_fa_depreciation_policy are clara_authenticated-only (never clara_runtime), definer-owned; BOTH recut birth sites (the deferred trigger and clara._fa_on_approve arm 4) carry the policy read and both branches'' description literals exactly once each, keep their own conflict-targeted insert and (the trigger) 0247''s four exclusions and watermark and (arm 4) its other three sections'' markers untouched; the two new register columns are NULLABLE with their tenant-congruence FK in place; clara._fa_asset_json carries both provenance keys exactly once; and the fourteen-body AC1/non-regression roster is byte-for-byte unmoved.';
end
$p932_tail$;
