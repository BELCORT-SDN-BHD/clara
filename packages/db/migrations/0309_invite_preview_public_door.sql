-- 0309_invite_preview_public_door.sql -- #871 (riders wave 4, lane 05): THE SIGNED-OUT INVITE
-- PREVIEW, served by a SERVER-ONLY read that no browser and no client credential can reach.
-- =====================================================================================
-- Spec of record: ticket #871's Agent Brief as REPLACED by the owner's ruling comment of
-- 2026-09-23 ("Owner's ruling (2026-09-23) and the re-brief"). The ticket body's brief -- "a new
-- server route on the existing service-key courier pattern; no new client-reachable database
-- grant" -- was STOPPED in riders wave 2 with evidence
-- (docs/plan/active/riders-2026-09-20/reports/wave2-lane10-ticket871.md): the service-role key
-- holds ZERO privilege on schema clara by design (0001 creates the schema with no grant, and
-- `grep -rn service_role packages/db/migrations` returns nothing), clara.preview_invite needs a
-- signed-in caller whose verified e-mail equals the invite's, and
-- docs/plan/active/refresh-wave-2026-09-14/brief-620.md had already disqualified the service-role
-- key as this estate's privileged-read mechanism. The owner took the recommendation: a server-only
-- database door on the AUTH-WALL PATTERN (0163), never a service-key exception.
--
-- WHAT THIS FILE ADDS, IN ONE SENTENCE. One SECURITY DEFINER read,
-- `clara.preview_invite_by_token(p_token text, p_origin_digest bytea)`, callable ONLY by a new
-- NOLOGIN group role `clara_invite_preview` (whose NOLOGIN login shell
-- `clara_invite_preview_login` inherits it), plus the evidence table its own rate wall counts.
--
-- WHAT THIS FILE DOES NOT CHANGE, and §D re-measures every one of them byte for byte:
--   * `clara.preview_invite(text)` (0224, recut once by 0269) -- NOT recut. The signed-in preview
--     keeps its JWT-email wall, its ACL of exactly {clara_fn_owner, clara_authenticated} and its
--     own single refusal. #871's "Out of scope" says so in as many words.
--   * `clara.firm_invites_visible` (0141 §H, recut by 0269) -- the admin roster read, untouched.
--   * `clara.accept_invite(text,text,text)` -- the acceptance door and its issuer-rank wall stand
--     untouched: this file adds a READ and nothing else. Accepting while signed out stays out of
--     scope, and this door mints nothing, consumes nothing and moves no invite row.
--   * `clara.claim_confirmation_attempt(bytea,bytea)` (0163) -- the auth wall's own door, whose
--     SHAPE this file's wall mirrors and whose BODY it leaves alone. See "THE RATE WALL" below
--     for why an invite preview must not spend the auth wall's own budget.
--   * No grant of any kind to `service_role`, to `clara_authenticated`, to `clara_runtime` or to
--     any wake lane. The new door's ACL is {clara_fn_owner, clara_invite_preview} and §D asserts
--     the EXACT ACL TEXT, grantor included (0224 §C.T1's shape).
--
-- =====================================================================================
-- THE ROLE PAIR, MIRRORED FROM 0163 LINE FOR LINE, AND NO CREDENTIAL IN THIS FILE.
-- =====================================================================================
-- `clara_invite_preview` is a NOLOGIN GROUP role that owns the one EXECUTE grant;
-- `clara_invite_preview_login` is a NOLOGIN LOGIN SHELL that is a member of it and holds nothing
-- of its own. Both are created NOLOGIN and PASSWORD-LESS, exactly as 0163 creates
-- clara_auth_wall / clara_auth_wall_login: flipping the shell to LOGIN and giving it a password is
-- an OUT-OF-BAND OPERATOR CEREMONY (packages/db/deploy/read-logins-ceremony.sql's form), and §D
-- REFUSES `rolcanlogin` on either role so a credential can never arrive by migration. The release
-- runbook carries the ceremony; this file carries no secret and no `alter role ... login`.
-- `postgres` is granted the login shell for the SAME reason 0163 grants it: a rig can SET ROLE
-- into the lane with no password-bearing credential.
--
-- FROM-SCRATCH LAWFULNESS, AND 0154'S CLUSTER-WIDE ROLE CENSUS. 0154's tail pins
-- `count(*) from pg_roles where rolname like 'clara%'` at the literal 14 -- a measured proof that
-- 0154 mints no role (packages/db/README.md, "From-scratch reapply on a reused cluster (#867)").
-- This file is 0309: `scripts/migrate.mjs` applies migrations in ASCENDING NUMERIC ORDER
-- (`migrations.sort((a, b) => a.num - b.num)`), so at the moment 0154 runs on a from-scratch chain
-- these two roles DO NOT EXIST and its census is untouched. What DOES move is the count at THIS
-- file's own point in the chain: 18 before (0002's six groups + 0006/0009's three shells + 0121's
-- pair + 0126's group + 0160's pair + 0163's pair), 20 after. The #867 cluster-REUSE hazard grows
-- from four leftover roles to six, and `scripts/role-census-reset.mjs` handles that WITHOUT AN
-- EDIT -- it derives its roster from the migration files themselves (`rolesMintedAfterPin()`), so
-- it now reports and drops six. `packages/db/README.md`'s #867 section and
-- `tests/role-census-reset.test.mjs`'s pinned counts are trued in the same commit, as is
-- `deploy/roles-bootstrap.sql` (the estate's "a role mints a same-commit roles-bootstrap twin"
-- law) and `tests/rig-cluster-reset.mjs`'s CHAIN_MINTED_ROLES, which
-- `tests/chain-minted-roles-drift-guard.test.mjs` enforces from the migration text.
--
-- =====================================================================================
-- THE ANSWER SHAPE, AND WHY EVERY OUTCOME IS RETURNED RATHER THAN RAISED.
-- =====================================================================================
-- Three outcomes, one jsonb envelope:
--   {"outcome":"preview","firm_name":...,"role":...,"status":...,"masked_email":...}
--   {"outcome":"not_previewable"}                        -- ONE value, for FOUR facts (below)
--   {"outcome":"rate_limited","retry_after_seconds":N}
--
-- A REFUSAL CANNOT BE AN EXCEPTION HERE, AND THAT IS A MEASURED CONSTRAINT RATHER THAN A STYLE
-- CHOICE. This door counts its own attempts in a table; `raise exception` aborts the transaction
-- and ROLLS THAT ROW BACK, so a raising refusal would make the wall vacuous -- a token-enumeration
-- spree would cost nothing and leave no evidence. `clara.claim_confirmation_attempt` answers
-- `allowed:false` for exactly this reason (0163's own body returns the refused arm rather than
-- raising it). The only exceptions this door raises are the two CALLER-SIDE input-shape facts that
-- depend on no invite and no window -- an absent token and a malformed digest -- which is the same
-- line 0224 draws ("an absent token is a caller-side fact that depends on no invite, so naming it
-- honestly is not an oracle") and the same CLR10 `a digest is required` 0163 raises.
--
-- THE ONE REFUSAL, AND THE FOUR FACTS IT HIDES. `{"outcome":"not_previewable"}` is the answer for
-- an UNKNOWN token, an EXPIRED invite, a REVOKED invite and an ALREADY-ACCEPTED invite. The
-- owner's ruling spells it: "never an existence oracle for a token that does not match (a wrong,
-- expired, revoked or unknown token gets one and the same answer)". The value is a jsonb constant
-- with ONE key, so "identical" is a byte comparison rather than a promise, and there is no field a
-- caller could read to tell the four apart. Timing is not an oracle either: both window counts run
-- BEFORE the lookup on every arm, and an arm the wall refuses returns before the lookup whether
-- the token names an invite or names nothing.
--
-- THE FIVE-STATE DERIVATION AND THE MASK ARE SHARED, NOT FORKED. The status CASE expression AND
-- the masking block below are both COPIED CHARACTER FOR CHARACTER out of `clara.preview_invite`'s
-- live body (0224 §A as widened by 0269 §2), including their aliases, and §D.T7 / §D.T7b assert --
-- on the LIVE catalog, whitespace-normalised -- that each is present in BOTH bodies. The mask
-- earns its own pin for the reason the ruling gives it: the masked address is the one field this
-- ticket says must never widen, so a later recut of the signed-in mask alone must be a red cell
-- rather than a silently wider answer on a PUBLIC page (spec review SPEC-871-C, 2026-09-24). So a future ticket that recuts one of them
-- and not the other is caught by a cell rather than by a person seeing two different answers about
-- one invite. A shared SQL FUNCTION was considered and refused for 0269's own measured reason:
-- Postgres checks EXECUTE against the INVOKING role for every function named in a view's body, so
-- a helper `clara.firm_invites_visible` could call would need a grant to `clara_authenticated`,
-- and PostgREST exposes every EXECUTE-granted function as an RPC door -- a bare
-- `(firm_id, user_id) -> rank` cross-tenant oracle. That trade is unchanged by this file.
--
-- WHY THE DOOR RETURNS A PREVIEW ONLY FOR AN OPEN INVITE. `pending` and `issuer_lapsed` are the
-- two statuses this estate already calls NON-BLOCKING -- apps/web/lib/firm/invite-preview.ts's
-- `INVITE_PREVIEW_NON_BLOCKING_STATUSES`, and #872's owner ruling ("an invite in that state can
-- still be accepted; the preview shows the notice and the accept door is unchanged"). Every other
-- effective status means there is nothing left to accept, and the 2026-09-23 ruling puts expired
-- and revoked behind the single refusal, so the two rules meet exactly. The status is still
-- DERIVED in all five states by the shared expression -- `tests/invite-preview-public.test.mjs`
-- drives each of the five and compares this door's behaviour against the roster's own answer for
-- the same row.
--
-- =====================================================================================
-- THE RATE WALL: THE AUTH WALL'S OWN SHAPE, OVER ITS OWN EVIDENCE.
-- =====================================================================================
-- Two independent limbs, a 15-minute window and a ceiling of 5 -- 0163's own numbers -- keyed on
-- (a) the invite token's sha256 and (b) the PEPPERED digest of the proxy-observed client address
-- the courier supplies (packages/runtime/lib/rate-wall-courier.mjs; absent or unparseable ⇒ the
-- route never calls this door at all). Both advisory locks are taken in numeric order, BOTH
-- WINDOWS ARE COUNTED BEFORE ANYTHING IS WRITTEN, and each limb's own wait is computed
-- independently and the MAXIMUM advertised.
--
-- COUNT FIRST, WRITE ONLY WHEN ADMITTING -- and that is where this wall's ORDERING departs from
-- 0163's, deliberately. 0163 inserts first and counts after, so its own BLOCKER-1 correction has to
-- carry the just-inserted row into both limbs' future windows (`offset v_count - 4`, guarded at
-- `>= 4`). Here the refused call writes NOTHING, so the arithmetic is the plain one -- with
-- `v_count` rows already in the window a future call is admitted once `v_count - 4` of them have
-- expired, the last of which is the ascending row at `offset v_count - 5` -- and the wall gains
-- two properties 0163 does not need: the table is BOUNDED at five rows per key per quarter-hour,
-- and a flood CANNOT slide a real invitee's window forward (see WHAT THE EVIDENCE TABLE HOLDS).
--
-- WHY ITS OWN EVIDENCE TABLE AND NOT `clara.confirmation_attempts`. The brief says "the estate's
-- existing entry rate wall", and the first cut of this file called
-- `clara.claim_confirmation_attempt` with the token digest in the e-mail limb. It was rejected on
-- a measurement rather than a preference: that table IS the applicant's five OTP guesses (0163's
-- own header -- "an 'accepted' stamp REMOVES the row from both limbs' windows ... the six-digit
-- code becomes guessable at leisure"), so routing previews through it either (a) settles them
-- 'rejected' and burns a stranger's signup-confirmation budget from the same address -- five
-- invite-link loads would lock out every signup behind that NAT for fifteen minutes -- or (b)
-- settles them 'accepted', which the counting predicate EXCLUDES, and the preview is then not
-- walled at all. A wall that cannot both hold and stay honest is not the wall to reuse; its SHAPE
-- is, and that is what this file copies. The two budgets stay independent on purpose.
--
-- THE REFUSAL IS SOFT BY CONSTRUCTION. A rate-limited preview is not a refused journey: the
-- landing page renders the sign-in flow WITHOUT the preview block (apps/web's reader treats it the
-- way it already treats an indefinite read -- "absence is not evidence"), so a ceiling of five
-- reloads per token per quarter-hour costs a real invitee a courtesy, never an admission.
--
-- WHAT THE EVIDENCE TABLE HOLDS. `token_hash` (the same sha256 the invite row is keyed by), the
-- peppered origin digest, and a timestamp -- no address, no e-mail, no plaintext token.
-- Append-only and no-truncate like `clara.confirmation_attempts`, forced-RLS with a single owner
-- policy, and no grant to any application role: only the definer body writes or reads it.
--
-- AND IT IS BOUNDED, WHICH THE FIRST CUT OF THIS FILE WAS NOT. The wall COUNTS BEFORE IT WRITES:
-- a call the window already refuses leaves NO row behind. The first cut inserted first and counted
-- after, which cost two things an adversarial round measured (ADV-L05-04, 2026-09-24): the table
-- grew one unprunable row per request from a PUBLIC, unauthenticated page GET, and -- worse --
-- every REFUSED reload slid the window forward, so anyone holding an invite link could keep a real
-- invitee's preview shut indefinitely (measured: twelve sequential calls left twelve rows and
-- pinned `retry_after_seconds` at the 900-second ceiling from the sixth on). Counting first bounds
-- the table at FIVE rows per key per quarter-hour and makes the wall self-clearing: fifteen minutes
-- after the fifth ADMITTED call the window is empty whatever the flood did.
-- `clara.confirmation_attempts` does not need this -- it is reached from a form POST inside the
-- signup flow, and an 'accepted' stamp removes its rows from both windows -- which is why this file
-- mirrors its SHAPE and not its ordering.
--
-- IT STILL HAS NO RETENTION SWEEP, AND PRUNING IT IS A MIGRATION RATHER THAN A JOB. The append-only
-- trigger raises unconditionally for EVERY role including the table's owner (measured:
-- `set role clara_fn_owner; delete from clara.invite_preview_attempts where attempted_at < ...`
-- raises 'invite_preview_attempts is append-only'), and TRUNCATE is blocked too. So a retention
-- lane must disable and re-enable that trigger inside its OWN migration, as the table owner; it
-- cannot be written as a background job against the shipped surface. The follow-up on #871 says so
-- in those words, and the bound above is what makes that follow-up housekeeping rather than an
-- availability question.

set local statement_timeout = '5min';
set local lock_timeout = '15s';

-- =================================================================================================
-- §0 -- PRESTATE. Every premise this file relies on, MEASURED on the live catalog before anything
-- changes, and re-measured in §D. The sha256 pins were taken on riders lane 05's database
-- (clara_l05) at 289 applied migrations / 0295_wave4_chart_rows, which is this lane's frontier --
-- never transcribed from a creating migration's own header (several of these bodies are splices).
-- =================================================================================================
create temporary table _p871_prestate (k text primary key, v jsonb) on commit drop;

do $pre$
declare v_names text; v_sha text; v_n int; v_bad text; v_present int; v_mode text;
begin
  -- (a) FIRST OR REDO, AND NEVER HALF OF EITHER. This file owns FOUR objects: the door, the
  -- evidence table and the two roles. All four absent is a FIRST apply; all four present is the
  -- supported #957 REDO over this file's own effects (`CLARA_MIGRATION_REDO`,
  -- packages/db/README.md "Redo (#957)"), which every statement below is written to survive:
  -- `create table if not exists`, `create index if not exists`, `drop policy`/`drop trigger if
  -- exists` before each create, `create or replace function`, and role creation already guarded by
  -- `if not exists`. ANY OTHER COUNT is a half-applied database and is refused rather than
  -- repaired, because this file cannot know which half is the older one.
  --
  -- The pins in (c) below are NOT bimodal: this file recuts no body, so every pinned sha is the
  -- same on both branches, and a redo cannot hide a drift behind its own post-image.
  select (case when to_regprocedure('clara.preview_invite_by_token(text,bytea)') is not null then 1 else 0 end)
       + (case when to_regclass('clara.invite_preview_attempts') is not null then 1 else 0 end)
       + (select count(*)::int from pg_roles
           where rolname in ('clara_invite_preview','clara_invite_preview_login'))
    into v_present;
  if v_present = 0 then
    v_mode := 'FIRST';
  elsif v_present = 4 then
    v_mode := 'REDO';
    raise notice '#871 prestate: this file''s own four objects are already present -- this is a REDO (#957) over its own effects, which the if-not-exists / create-or-replace shape below makes safe.';
  else
    raise exception '#871 prestate: % of this file''s four objects (door, attempts table, group role, login shell) are present -- a half-applied state this file will not repair', v_present
      using errcode='CLR10';
  end if;
  insert into _p871_prestate values ('mode', to_jsonb(v_mode));

  -- (b) THE CHAIN-MINTED ROLES THIS FILE'S PREMISES REST ON, BY NAME -- NEVER AN ABSOLUTE
  -- CLUSTER-WIDE CENSUS.
  --
  -- The first cut of this file raised unless `count(*) from pg_roles where rolname like 'clara%'`
  -- read EXACTLY 18, and that pin would have ABORTED the hosted wave-4 migrate step. A cluster-wide
  -- count is not a property of the migration chain: a live project also carries roles the chain
  -- never mints -- `clara_storage_docs`, from `deploy/storage-provision.sql`, which
  -- `docs/plan/active/riders-2026-09-20/RELEASE-W2-RUNBOOK.md` step 3 counts among the hosted-only
  -- role differences and which `deploy/roles-bootstrap.sql`'s own census names beside the schema
  -- lanes ("N schema lanes + clara_storage_docs"). MEASURED (adversarial ADV-L05-01, 2026-09-24):
  -- against a hosted-shaped census the shipped pin raised CLR10 'expected 18 ... found 19' and sent
  -- the operator to `scripts/role-census-reset.mjs`, which on hosted is the wrong and destructive
  -- thing to do; and the integrator's from-scratch proof runs on a DISPOSABLE cluster, which has no
  -- clara_storage_docs, so that proof could never have caught it.
  --
  -- What this file actually needs is that the chain-minted roles its grants and its tail talk about
  -- EXIST. 0160 and 0163 -- the two role-minting migrations whose pair shape this file mirrors --
  -- assert PRESENCE and ABSENCE and never a count (0160:57-59,119-122 and 0163:58-62,164-167), and
  -- that is the precedent followed here. The count is still RECORDED, so §D.T4 can prove this file
  -- moved it by exactly two (or, on a REDO, by nothing) whatever it started at.
  -- `packages/db/tests/invite-preview-public.test.mjs`'s p871.prestate.hosted_shaped drives this
  -- roster against a hosted-shaped census and shows the old absolute pin failing on the same
  -- transaction.
  select coalesce(string_agg(t.name, ', ' order by t.name), '(none)') into v_bad
    from (values
      -- 0002_foundation.sql -- the six group roles
      ('clara_fn_owner'),('clara_authenticated'),('clara_agent_ro'),
      ('clara_wake_interactive'),('clara_wake_proactive'),('clara_runtime'),
      -- 0006_runtime_core.sql -- the two login shells
      ('clara_runtime_login'),('clara_agent_read_login'),
      -- 0009_coding_floor.sql
      ('clara_wake_write_login'),
      -- 0121_f_a3_pr1b_agent_limb.sql -- the bank wake lane
      ('clara_wake_bank'),('clara_wake_bank_login'),
      -- 0126_f_a7_beta_filing_verb.sql
      ('clara_wake_filing'),
      -- 0131_f_a6_freeform_read.sql
      ('clara_freeform_ro'),('clara_freeform_login'),
      -- 0160_checkout_gate_c2_stripe_events.sql
      ('clara_stripe_webhook'),('clara_stripe_webhook_login'),
      -- 0163_checkout_gate_c3_folded_door.sql -- the pair whose shape this file mirrors
      ('clara_auth_wall'),('clara_auth_wall_login')
    ) t(name)
   where to_regrole(t.name) is null;
  if v_bad <> '(none)' then
    raise exception '#871 prestate: a chain-minted role this file relies on is absent: % -- this database did not run the migration chain that mints them', v_bad
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_roles where rolname like 'clara%';
  insert into _p871_prestate values ('role_count_before', to_jsonb(v_n));
  raise notice '#871 prestate: the 18 chain-minted clara roles this file relies on are all present; the cluster-wide clara%% census reads % and is RECORDED, not pinned -- a live project also carries deploy-minted roles such as clara_storage_docs.', v_n;

  -- (c) THE BODIES THIS FILE COPIES FROM, CALLS OR MUST NOT MOVE.
  select string_agg(format('%s live %s expected %s', t.sig, encode(sha256(convert_to(p.prosrc,'UTF8')),'hex'), t.pin), '; ')
    into v_bad
    from (values
      ('clara.preview_invite(text)',                   '01e729e01f0e7e1ce8cb98ca3710fd505d248d9ea34569fca1aead142b7531f4'),
      ('clara.role_rank(text)',                        '5ced25aed03ff000519af583c5c5b89c4d59c4cb5f20e49f39877435e8c2576f'),
      ('clara.accept_invite(text,text,text)',          '42a153231c724aaace9fb9dae7abe3551667c6669e7dacd1d5495b35c31aeef2'),
      ('clara.invite_member(text,text,text)',          '809d29ed4d702a7672931497a953ae0a66387b412597c5150b92d541ccc2636c'),
      ('clara.revoke_invite(uuid,text)',               '2943909c1ee1a324d2fd6c986026b86f1aa43e6d3410f92fdcdb6727ae9220f3'),
      ('clara.claim_confirmation_attempt(bytea,bytea)','6cd4d9bffd7816b14db4fb27dbf443421777332374c07a5ef9416cf55a8d18d5'),
      ('clara._tf_append_only()',                      '160e47b6659868d98163ee8cde1f851e6b8e6d344439a321a42c32fdd161fbf6'),
      ('clara._tf_no_truncate()',                      'e64ba9f6b93ba56d2752b095bae361dc4a3f0baf63e841e7c81f1b631c68eea8')
    ) t(sig, pin)
    join pg_proc p on p.oid = t.sig::regprocedure
   where encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') is distinct from t.pin;
  if v_bad is not null then
    raise exception '#871 prestate: a pinned body moved -- %', v_bad using errcode='CLR10';
  end if;
  insert into _p871_prestate
  select 'pinned_bodies', jsonb_object_agg(t.sig, encode(sha256(convert_to(p.prosrc,'UTF8')),'hex'))
    from (values
      ('clara.preview_invite(text)'),('clara.role_rank(text)'),('clara.accept_invite(text,text,text)'),
      ('clara.invite_member(text,text,text)'),('clara.revoke_invite(uuid,text)'),
      ('clara.claim_confirmation_attempt(bytea,bytea)'),
      ('clara._tf_append_only()'),('clara._tf_no_truncate()')
    ) t(sig) join pg_proc p on p.oid = t.sig::regprocedure;

  -- (d) THE ROSTER READ's own text. Not recut here; pinned so §D proves it.
  select encode(sha256(convert_to(pg_get_viewdef('clara.firm_invites_visible'::regclass, true),'UTF8')),'hex')
    into v_sha;
  if v_sha is distinct from 'eca579ad0c1d04503ee798f72b813513cc0df378f464d0103e19d6a703f13f92' then
    raise exception '#871 prestate: clara.firm_invites_visible definition moved (live %)', v_sha using errcode='CLR10';
  end if;
  insert into _p871_prestate values ('firm_invites_visible_sha', to_jsonb(v_sha));

  -- (e) THE COLUMNS THE DOOR READS. A renamed column would compile and answer nonsense.
  select string_agg(attname, ',' order by attnum) into v_names
    from pg_attribute
   where attrelid = 'clara.firm_invites'::regclass and attnum > 0 and not attisdropped;
  if v_names is distinct from
     'id,firm_id,email,role,token_hash,status,invited_by,expires_at,created_at,accepted_at,revoked_at' then
    raise exception '#871 prestate: unexpected firm_invites columns: %', v_names using errcode='CLR10';
  end if;
  insert into _p871_prestate values ('firm_invites_columns', to_jsonb(v_names));

  -- (f) THE SIGNED-IN DOOR'S ACL, so §D can prove this file widened nothing.
  select coalesce(array_to_string(p.proacl, ','), '<null>') into v_names
    from pg_proc p where p.oid = 'clara.preview_invite(text)'::regprocedure;
  if v_names is distinct from 'clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner' then
    raise exception '#871 prestate: clara.preview_invite ACL is not the 0224 pair: %', v_names using errcode='CLR10';
  end if;
  insert into _p871_prestate values ('preview_invite_acl', to_jsonb(v_names));
end $pre$;

-- =================================================================================================
-- §A -- THE ROLE PAIR. Cluster roles live OUTSIDE clara_fn_owner (0163's own note), so this block
-- runs before the SET ROLE below. Idempotent `if not exists` guards, exactly as 0160/0163 write
-- them, so the #867 cluster-reuse recipe can recreate them mid-chain.
-- =================================================================================================
do $role_invite_preview$
begin
  if not exists (select 1 from pg_roles where rolname='clara_invite_preview') then
    create role clara_invite_preview nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname='clara_invite_preview_login') then
    create role clara_invite_preview_login nologin inherit;
  end if;
  if not exists (
    select 1 from pg_auth_members m
    join pg_roles r on r.oid=m.member
    join pg_roles g on g.oid=m.roleid
    where r.rolname='clara_invite_preview_login' and g.rolname='clara_invite_preview'
  ) then
    grant clara_invite_preview to clara_invite_preview_login;
  end if;
  -- Test-only SET ROLE reachability; no password-bearing credential is created (0163's own line).
  if not exists (
    select 1 from pg_auth_members m
    join pg_roles r on r.oid=m.member
    join pg_roles g on g.oid=m.roleid
    where r.rolname='postgres' and g.rolname='clara_invite_preview_login'
  ) then
    grant clara_invite_preview_login to postgres;
  end if;
end $role_invite_preview$;

set role clara_fn_owner;

-- USAGE on the schema, and nothing else. The group role holds ZERO relation privilege anywhere in
-- this estate: the evidence table below is written by the DEFINER body, never by the caller.
grant usage on schema clara to clara_invite_preview;

-- =================================================================================================
-- §B -- THE WALL'S EVIDENCE. `clara.confirmation_attempts` (0163 §3) is the shape being mirrored:
-- forced RLS with a single owner policy, append-only, no truncate, no application grant.
-- =================================================================================================
-- REDO-SAFE BY CONSTRUCTION (#957): every statement below survives being run a second time over
-- this file's own effects, so `CLARA_MIGRATION_REDO=0309_invite_preview_public_door` can re-apply
-- an edited unmerged file without hand surgery on the ledger.
create table if not exists clara.invite_preview_attempts (
  id            uuid        primary key default gen_random_uuid(),
  token_hash    bytea       not null check (octet_length(token_hash)=32),
  origin_digest bytea       not null check (octet_length(origin_digest)=32),
  attempted_at  timestamptz not null default now()
);
create index if not exists ix_invite_preview_attempts_token_attempted
  on clara.invite_preview_attempts(token_hash, attempted_at desc);
create index if not exists ix_invite_preview_attempts_origin_attempted
  on clara.invite_preview_attempts(origin_digest, attempted_at desc);
alter table clara.invite_preview_attempts enable row level security;
alter table clara.invite_preview_attempts force row level security;
drop policy if exists p_invite_preview_attempts_owner on clara.invite_preview_attempts;
create policy p_invite_preview_attempts_owner on clara.invite_preview_attempts
  for all to clara_fn_owner using (true) with check (true);
drop trigger if exists t_invite_preview_attempts_append_only on clara.invite_preview_attempts;
create trigger t_invite_preview_attempts_append_only before delete on clara.invite_preview_attempts
  for each row execute function clara._tf_append_only();
drop trigger if exists t_invite_preview_attempts_no_truncate on clara.invite_preview_attempts;
create trigger t_invite_preview_attempts_no_truncate before truncate on clara.invite_preview_attempts
  for each statement execute function clara._tf_no_truncate();

comment on table clara.invite_preview_attempts is
  '#871: the signed-out invite preview''s own rate-wall evidence -- one row per call to clara.preview_invite_by_token, keyed by the invite token''s sha256 and the peppered client-address digest. Never the address, never the plaintext token, never an e-mail. Independent of clara.confirmation_attempts by design (0309''s header).';

-- =================================================================================================
-- §C -- THE DOOR. SECURITY DEFINER, pinned search_path, owned by clara_fn_owner.
-- =================================================================================================
create or replace function clara.preview_invite_by_token(p_token text, p_origin_digest bytea)
returns jsonb
language plpgsql
security definer
set search_path = clara, pg_temp
as $preview_by_token$
declare
  v_hash bytea;
  v_now timestamptz;
  v_token_count integer;
  v_origin_count integer;
  v_token_lock bigint;
  v_origin_lock bigint;
  v_retry_token integer;
  v_retry_origin integer;
  v_retry_after integer;
  inv record;
  v_at int;
  v_masked text;
begin
  -- THE TWO CALLER-SIDE INPUT FACTS, and the only two exceptions this door raises. Neither depends
  -- on an invite or on a window, so naming them honestly is not an oracle (0224's own line), and
  -- neither may be answered by a returned outcome: a malformed digest means the wall cannot be
  -- keyed at all, which is the one state in which refusing to count is the fail-CLOSED answer.
  if p_origin_digest is null or octet_length(p_origin_digest) <> 32 then
    raise exception 'a digest is required' using errcode = 'CLR10';
  end if;
  if p_token is null or btrim(p_token) = '' then
    raise exception 'a token is required' using errcode = 'CLR10';
  end if;
  v_hash := sha256(convert_to(btrim(p_token), 'UTF8'));

  -- THE WALL, AND IT RUNS BEFORE THE LOOKUP ON EVERY ARM -- so an unknown token costs exactly what
  -- a real one costs, in work and in budget. Serialize both independent limbs, always in numeric
  -- order; a 64-bit hash collision is fail-safe (it serializes extra callers, never admits one).
  v_token_lock := pg_catalog.hashtextextended(
    'clara.invite-preview-token:' || pg_catalog.encode(v_hash,'hex'), 0);
  v_origin_lock := pg_catalog.hashtextextended(
    'clara.invite-preview-origin:' || pg_catalog.encode(p_origin_digest,'hex'), 0);
  if v_token_lock <= v_origin_lock then
    perform pg_catalog.pg_advisory_xact_lock(v_token_lock);
    if v_origin_lock <> v_token_lock then
      perform pg_catalog.pg_advisory_xact_lock(v_origin_lock);
    end if;
  else
    perform pg_catalog.pg_advisory_xact_lock(v_origin_lock);
    perform pg_catalog.pg_advisory_xact_lock(v_token_lock);
  end if;

  -- COUNT BOTH WINDOWS FIRST. Under the two locks above this count is stable for the rest of the
  -- call, so counting before writing is not a check-then-act race -- it is the same serialized
  -- decision, taken one statement earlier.
  v_now := now();
  select count(*)::int into v_token_count
    from clara.invite_preview_attempts a
   where a.token_hash = v_hash
     and a.attempted_at > v_now - interval '15 minutes';
  select count(*)::int into v_origin_count
    from clara.invite_preview_attempts a
   where a.origin_digest = p_origin_digest
     and a.attempted_at > v_now - interval '15 minutes';

  if v_token_count >= 5 or v_origin_count >= 5 then
    -- A REFUSED CALL WRITES NOTHING. That is what bounds this table at five rows per key per
    -- window and what stops a flood from holding a real invitee's link shut: a refusal no longer
    -- extends the very window that refused it (ADV-L05-04, 2026-09-24).
    --
    -- EACH LIMB'S OWN WAIT, AND THE MAXIMUM IS ADVERTISED, because a wait computed from only the
    -- limb that fired can name a moment at which the other limb still refuses. With `v_count` rows
    -- already in a limb's window, a future call is admitted once `v_count - 4` of them have
    -- expired; the last of those to expire is the ascending row at `offset v_count - 5`. A limb
    -- under its ceiling constrains no future call, so its own wait is zero.
    if v_token_count >= 5 then
      select least(900, greatest(0, ceil(extract(epoch from
               ((a.attempted_at + interval '15 minutes') - v_now)))))::int
        into v_retry_token
        from clara.invite_preview_attempts a
       where a.token_hash = v_hash
         and a.attempted_at > v_now - interval '15 minutes'
       order by a.attempted_at asc
       offset v_token_count - 5 limit 1;
    else
      v_retry_token := 0;
    end if;
    if v_origin_count >= 5 then
      select least(900, greatest(0, ceil(extract(epoch from
               ((a.attempted_at + interval '15 minutes') - v_now)))))::int
        into v_retry_origin
        from clara.invite_preview_attempts a
       where a.origin_digest = p_origin_digest
         and a.attempted_at > v_now - interval '15 minutes'
       order by a.attempted_at asc
       offset v_origin_count - 5 limit 1;
    else
      v_retry_origin := 0;
    end if;
    v_retry_after := greatest(coalesce(v_retry_token, 0), coalesce(v_retry_origin, 0));
    -- NO `scope`. The auth wall names its limb because a person has to be told whether to change
    -- address or wait; here both limbs mean the same thing to the caller (come back later) and
    -- naming them would tell a prober which of two budgets it exhausted.
    return jsonb_build_object('outcome', 'rate_limited', 'retry_after_seconds', v_retry_after);
  end if;

  -- ADMITTED: now the attempt is evidence, and it is spent whether the token names an invite or
  -- names nothing -- enumeration costs exactly what a legitimate read costs.
  insert into clara.invite_preview_attempts(token_hash, origin_digest)
  values (v_hash, p_origin_digest);

  -- THE EFFECTIVE STATUS, computed by the expression clara.preview_invite and
  -- clara.firm_invites_visible already share (0141:532-534 as widened by #872 / 0269) -- copied
  -- character for character, aliases included, and pinned against the live signed-in body in
  -- §D.T7. No row lock: this is a read.
  select f.name as firm_name, i.role as role, i.email as email,
         case
           when i.status = 'pending' and i.expires_at <= now() then 'expired'
           when i.status = 'pending' and coalesce(
                  (select clara.role_rank(m.role) from clara.firm_memberships m
                     where m.user_id = i.invited_by and m.firm_id = i.firm_id and m.status = 'active'),
                  -1) < clara.role_rank('admin')
             then 'issuer_lapsed'
           else i.status
         end as status
    into inv
    from clara.firm_invites i
    join clara.firms f on f.id = i.firm_id
   where i.token_hash = v_hash;

  -- THE ONE REFUSAL. An unknown token, an EXPIRED invite, a REVOKED invite and an ALREADY-ACCEPTED
  -- invite are four different facts and they are INDISTINGUISHABLE from outside: one jsonb value,
  -- one key, nothing to read. Anything else rebuilds the existence oracle 0141 §B closed.
  if not found or inv.status not in ('pending', 'issuer_lapsed') then
    return jsonb_build_object('outcome', 'not_previewable');
  end if;

  -- The mask: one leading character, three FIXED stars (a length-proportional run would publish the
  -- address's length), the domain. 0224's own expression, and its own reason for keeping the domain.
  v_at := position('@' in inv.email);
  if v_at > 1 then
    v_masked := left(inv.email, 1) || '***@' || substr(inv.email, v_at + 1);
  else
    v_masked := '***';
  end if;

  return jsonb_build_object(
    'outcome', 'preview',
    'firm_name', inv.firm_name,
    'role', inv.role,
    'status', inv.status,
    'masked_email', v_masked);
end
$preview_by_token$;

comment on function clara.preview_invite_by_token(text, bytea) is
  '#871: the SIGNED-OUT invite preview. Server-only -- EXECUTE is held by clara_invite_preview and by nobody else, and no client credential is a member of that role. Returns {outcome:preview,firm_name,role,status,masked_email} for an OPEN invite (pending or issuer_lapsed), the single {outcome:not_previewable} for an unknown, expired, revoked or accepted token, or {outcome:rate_limited,retry_after_seconds} when its own 15-minute/5-attempt wall refuses. Never the plaintext token, never the unmasked address, never the inviter.';

-- =================================================================================================
-- §C2 -- GRANT MATRIX. N13 (0005:38-42): a function is PUBLIC-executable until it is revoked, so
-- the revoke is not optional. ONE grantee: the new group role.
-- =================================================================================================
revoke all on function clara.preview_invite_by_token(text, bytea) from public;
grant execute on function clara.preview_invite_by_token(text, bytea) to clara_invite_preview;

reset role;

-- =================================================================================================
-- §D -- TAIL CENSUS. Re-reads the live catalog and raises on any finding rather than trusting
-- §A/§B/§C ran as written.
-- =================================================================================================
do $p871_tail$
declare
  v_posture text; v_src text; v_ret text; v_signed_in text; v_frag text; v_n int; v_pre int;
  v_names text; v_sha text; v_pre_txt text; r text; v_mode text; v_delta int;
  -- THE SHARED DERIVATION, quoted once. Whitespace-normalised before every comparison, so an
  -- indentation change in either body is not a false red while a CHANGED PREDICATE is a true one.
  c_status_case constant text := $frag$case
           when i.status = 'pending' and i.expires_at <= now() then 'expired'
           when i.status = 'pending' and coalesce(
                  (select clara.role_rank(m.role) from clara.firm_memberships m
                     where m.user_id = i.invited_by and m.firm_id = i.firm_id and m.status = 'active'),
                  -1) < clara.role_rank('admin')
             then 'issuer_lapsed'
           else i.status
         end as status$frag$;
  -- THE SHARED MASK, quoted once: one leading character, three FIXED stars, the domain.
  c_mask_block constant text := $mask$v_at := position('@' in inv.email);
  if v_at > 1 then
    v_masked := left(inv.email, 1) || '***@' || substr(inv.email, v_at + 1);
  else
    v_masked := '***';
  end if;$mask$;
begin
  -- (T.1) THE DOOR'S POSTURE: owner, SECURITY DEFINER, pinned search_path and the EXACT ACL TEXT,
  -- grantor included -- so a WITH GRANT OPTION or a PUBLIC grant cannot hide behind a
  -- has_function_privilege probe (0224 §C.T1's shape).
  if to_regprocedure('clara.preview_invite_by_token(text,bytea)') is null then
    raise exception '#871 tail: clara.preview_invite_by_token(text,bytea) does not resolve' using errcode='CLR10';
  end if;
  select pg_get_userbyid(p.proowner) || ' | ' || p.prosecdef::text || ' | '
         || coalesce(array_to_string(p.proconfig, ','), '<none>') || ' | '
         || coalesce(array_to_string(p.proacl, ','), '<null>')
    into v_posture from pg_proc p where p.oid = 'clara.preview_invite_by_token(text,bytea)'::regprocedure;
  if v_posture is distinct from
     'clara_fn_owner | true | search_path=clara, pg_temp | clara_fn_owner=X/clara_fn_owner,clara_invite_preview=X/clara_fn_owner' then
    raise exception '#871 tail: the door has the wrong posture -- got {%}', v_posture using errcode='CLR10';
  end if;

  -- (T.2) NOBODY ELSE MAY CALL IT. Every application role this estate has, plus the Supabase
  -- platform names in case a live project carries them (absent here, hence the to_regrole guard).
  -- PUBLIC is not in this list because it is not in pg_roles: the EXACT ACL TEXT above is what
  -- proves there is no PUBLIC grant -- one would appear as a bare `=X/clara_fn_owner` entry.
  foreach r in array array[
      'clara_authenticated','clara_runtime','clara_runtime_login','clara_agent_ro',
      'clara_agent_read_login','clara_freeform_ro','clara_freeform_login','clara_wake_interactive',
      'clara_wake_proactive','clara_wake_bank','clara_wake_filing','clara_wake_write_login',
      'clara_wake_bank_login','clara_stripe_webhook','clara_stripe_webhook_login','clara_auth_wall',
      'clara_auth_wall_login','clara_storage_docs','anon','authenticated','service_role',
      'authenticator'] loop
    if to_regrole(r) is not null
       and has_function_privilege(r, 'clara.preview_invite_by_token(text,bytea)', 'EXECUTE') then
      raise exception '#871 tail: % can EXECUTE clara.preview_invite_by_token -- only clara_invite_preview may', r
        using errcode='CLR10';
    end if;
  end loop;
  if not has_function_privilege('clara_invite_preview', 'clara.preview_invite_by_token(text,bytea)', 'EXECUTE') then
    raise exception '#871 tail: clara_invite_preview cannot EXECUTE its own door' using errcode='CLR10';
  end if;
  if not has_function_privilege('clara_invite_preview_login', 'clara.preview_invite_by_token(text,bytea)', 'EXECUTE') then
    raise exception '#871 tail: the login shell does not inherit the door' using errcode='CLR10';
  end if;

  -- (T.3) THE ROLE PAIR: both present, both NOLOGIN, the membership chain, and NO credential. A
  -- login attribute here would mean this migration minted a reachable credential, which is exactly
  -- what the out-of-band ceremony exists to keep out of git.
  foreach r in array array['clara_invite_preview','clara_invite_preview_login'] loop
    if not exists (select 1 from pg_roles where rolname = r) then
      raise exception '#871 tail: role % is absent', r using errcode='CLR10';
    end if;
    if exists (select 1 from pg_roles where rolname = r and (rolcanlogin or rolsuper or rolbypassrls or rolcreatedb or rolcreaterole)) then
      raise exception '#871 tail: role % carries LOGIN or an escalation attribute -- the credential is an out-of-band ceremony', r
        using errcode='CLR10';
    end if;
  end loop;
  if not exists (
    select 1 from pg_auth_members m
    join pg_roles r on r.oid=m.member join pg_roles g on g.oid=m.roleid
    where r.rolname='clara_invite_preview_login' and g.rolname='clara_invite_preview') then
    raise exception '#871 tail: the login shell is not a member of the group role' using errcode='CLR10';
  end if;
  if not exists (
    select 1 from pg_auth_members m
    join pg_roles r on r.oid=m.member join pg_roles g on g.oid=m.roleid
    where r.rolname='postgres' and g.rolname='clara_invite_preview_login') then
    raise exception '#871 tail: postgres is not a member of the login shell (rig SET ROLE reachability)' using errcode='CLR10';
  end if;
  -- The group holds USAGE on clara and NOT ONE relation privilege anywhere in the schema.
  if not has_schema_privilege('clara_invite_preview', 'clara', 'USAGE') then
    raise exception '#871 tail: clara_invite_preview has no USAGE on schema clara' using errcode='CLR10';
  end if;
  select string_agg(format('%s:%s', table_name, privilege_type), ', ' order by table_name, privilege_type)
    into v_names from information_schema.role_table_grants
   where grantee in ('clara_invite_preview','clara_invite_preview_login') and table_schema = 'clara';
  if v_names is not null then
    raise exception '#871 tail: the invite-preview lane holds table privileges it must not: %', v_names using errcode='CLR10';
  end if;

  -- (T.4) THE CLUSTER ROLE CENSUS MOVED BY EXACTLY THIS FILE'S OWN TWO ROLES, AND BY NOTHING ELSE
  -- -- a RELATIVE delta against the count §0(b) recorded, never an absolute pin (see §0(b) for why
  -- an absolute one is unsound on a live project). 0154's own pin (14, at its own point in the
  -- chain) is untouched by a role minted here: migrations apply in ascending numeric order. On a
  -- REDO the two roles were already present when §0(b) counted, so the lawful delta is zero.
  select (v #>> '{}')::int into v_pre from _p871_prestate where k = 'role_count_before';
  select v #>> '{}' into v_mode from _p871_prestate where k = 'mode';
  select count(*)::int into v_n from pg_roles where rolname like 'clara%';
  v_delta := case when v_mode = 'REDO' then 0 else 2 end;
  if v_n <> v_pre + v_delta then
    raise exception '#871 tail: the clara role count moved from % to % on a % apply, expected exactly +%', v_pre, v_n, v_mode, v_delta
      using errcode='CLR10';
  end if;

  -- (T.5) THE EVIDENCE TABLE: forced RLS, exactly one policy, both guard triggers, no grant.
  select string_agg(format('rls=%s force=%s', c.relrowsecurity::text, c.relforcerowsecurity::text), '')
    into v_names from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname='clara' and c.relname='invite_preview_attempts';
  if v_names is distinct from 'rls=true force=true' then
    raise exception '#871 tail: invite_preview_attempts is not forced-RLS (%)', v_names using errcode='CLR10';
  end if;
  select coalesce(string_agg(polname, ',' order by polname), '(none)') into v_names
    from pg_policy where polrelid = 'clara.invite_preview_attempts'::regclass;
  if v_names is distinct from 'p_invite_preview_attempts_owner' then
    raise exception '#871 tail: unexpected policies on invite_preview_attempts: %', v_names using errcode='CLR10';
  end if;
  select coalesce(string_agg(tgname, ',' order by tgname), '(none)') into v_names
    from pg_trigger where tgrelid = 'clara.invite_preview_attempts'::regclass and not tgisinternal;
  if v_names is distinct from 't_invite_preview_attempts_append_only,t_invite_preview_attempts_no_truncate' then
    raise exception '#871 tail: unexpected triggers on invite_preview_attempts: %', v_names using errcode='CLR10';
  end if;
  select string_agg(format('%s:%s', grantee, privilege_type), ', ') into v_names
    from information_schema.role_table_grants
   where table_schema='clara' and table_name='invite_preview_attempts' and grantee <> 'clara_fn_owner';
  if v_names is not null then
    raise exception '#871 tail: invite_preview_attempts carries application grants: %', v_names using errcode='CLR10';
  end if;

  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.preview_invite_by_token(text,bytea)'::regprocedure;

  -- (T.6) THE OUTPUT SHAPE IS CLOSED, read off the RETURN expressions themselves. Ask the question
  -- that has an answer before cutting: `substr(s, 0)` CLAMPS rather than returning '' (0224's own
  -- note), so the position is tested first.
  v_n := position($ret$return jsonb_build_object(
    'outcome', 'preview',$ret$ in v_src);
  if v_n = 0 then
    raise exception '#871 tail: the door does not return the preview envelope' using errcode='CLR10';
  end if;
  v_ret := substr(v_src, v_n);
  if position('token' in v_ret) <> 0 then
    raise exception '#871 tail: the returned object names a token' using errcode='CLR10';
  end if;
  if position('inv.email' in v_ret) <> 0 then
    raise exception '#871 tail: the returned object carries the UNMASKED address' using errcode='CLR10';
  end if;
  if position('invited_by' in v_ret) <> 0 then
    raise exception '#871 tail: the returned object names the inviter' using errcode='CLR10';
  end if;
  -- …and the ONE refusal is a one-key constant, spelled exactly once in the body.
  select count(*)::int into v_n from regexp_matches(v_src, $nr$jsonb_build_object\('outcome', 'not_previewable'\)$nr$, 'g');
  if v_n <> 1 then
    raise exception '#871 tail: the single refusal is spelled % time(s), expected exactly 1', v_n using errcode='CLR10';
  end if;

  -- (T.7) THE DERIVATION IS SHARED, NOT FORKED -- proven on the LIVE catalog, in both directions:
  -- the quoted expression is present in the NEW body AND in the signed-in door's body.
  v_frag := regexp_replace(c_status_case, '\s+', '', 'g');
  if position(v_frag in regexp_replace(v_src, '\s+', '', 'g')) = 0 then
    raise exception '#871 tail: the new door does not carry the shared status expression' using errcode='CLR10';
  end if;
  select p.prosrc into v_signed_in from pg_proc p where p.oid = 'clara.preview_invite(text)'::regprocedure;
  if position(v_frag in regexp_replace(v_signed_in, '\s+', '', 'g')) = 0 then
    raise exception '#871 tail: clara.preview_invite no longer carries the shared status expression -- the two reads have FORKED' using errcode='CLR10';
  end if;

  -- (T.7b) THE MASK IS SHARED TOO, and it gets its own pin because it is the field the ruling
  -- singles out: "never the address itself". The status CASE forking would make two readers
  -- disagree; the MASK forking would make a PUBLIC, signed-out page publish more of a stranger's
  -- address than the signed-in one does, silently. Same live-catalog, whitespace-normalised
  -- comparison, in both directions.
  v_frag := regexp_replace(c_mask_block, '\s+', '', 'g');
  if position(v_frag in regexp_replace(v_src, '\s+', '', 'g')) = 0 then
    raise exception '#871 tail: the new door does not carry the shared masking block' using errcode='CLR10';
  end if;
  if position(v_frag in regexp_replace(v_signed_in, '\s+', '', 'g')) = 0 then
    raise exception '#871 tail: clara.preview_invite no longer carries the shared masking block -- the two masks have FORKED' using errcode='CLR10';
  end if;

  -- (T.8) NOTHING THIS FILE PROMISED NOT TO TOUCH HAS MOVED.
  select v #>> '{}' into v_pre_txt from _p871_prestate where k = 'preview_invite_acl';
  select coalesce(array_to_string(p.proacl, ','), '<null>') into v_names
    from pg_proc p where p.oid = 'clara.preview_invite(text)'::regprocedure;
  if v_names is distinct from v_pre_txt then
    raise exception '#871 tail: clara.preview_invite ACL moved (pre %, post %)', v_pre_txt, v_names using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(pg_get_viewdef('clara.firm_invites_visible'::regclass, true),'UTF8')),'hex')
    into v_sha;
  select v #>> '{}' into v_pre_txt from _p871_prestate where k = 'firm_invites_visible_sha';
  if v_sha is distinct from v_pre_txt then
    raise exception '#871 tail: clara.firm_invites_visible moved (pre %, post %)', v_pre_txt, v_sha using errcode='CLR10';
  end if;
  select string_agg(format('%s live %s', t.sig, encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')), '; ')
    into v_names
    from (select key as sig, value #>> '{}' as pin from jsonb_each((select v from _p871_prestate where k='pinned_bodies'))) t
    join pg_proc p on p.oid = t.sig::regprocedure
   where encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') is distinct from t.pin;
  if v_names is not null then
    raise exception '#871 tail: a pinned body moved under this migration -- %', v_names using errcode='CLR10';
  end if;

  raise notice '#871 tail OK: clara.preview_invite_by_token is SECURITY DEFINER, owned by clara_fn_owner, EXECUTE-reachable by clara_invite_preview (and its NOLOGIN shell) and by nobody else -- no anon, no service_role, no runtime, no authenticated; both new roles are NOLOGIN and credential-less; the cluster clara role census moved by exactly this file''s own two roles (a RELATIVE delta, never an absolute pin -- a live project also carries deploy-minted roles) with 0154''s own pin untouched; the wall''s evidence table is forced-RLS, owner-only, append-only and grant-free; the answer carries neither the token, the inviter nor the unmasked address; the ONE refusal is a single-key constant spelled once; and the five-state status expression AND the masking block are both byte-shared with clara.preview_invite, whose ACL, body and roster view are all unmoved.';
end $p871_tail$;
