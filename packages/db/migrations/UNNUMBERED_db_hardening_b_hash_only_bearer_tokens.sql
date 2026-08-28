-- Pre-beta security-hardening batch, MIGRATION B -- owner-ruled 2026-08-28
-- (docs/plan/active/mohe-grill-rulings-2026-08-28.md, 裁-16). Hash-only bearer tokens at rest,
-- both instances named at the sitting, in one PR:
--
--   (a) clara.invite_member's receipt. Its LIVE body (0141) mints the plaintext invite token
--       and hands it to `_finish_op`, which BOTH returns it to the caller AND persists it,
--       verbatim, into `op_receipts.result` -- durable plaintext-at-rest for a bearer
--       credential (measured: p4t1-invite.test.mjs's own [C3] cell pins exactly this as the
--       pre-fix shape, and is fixed in the SAME commit below). `_finish_op`'s own contract
--       (0004:62-68) is `result := p_result; return p_result` -- the same jsonb is BOTH the
--       return value and the persisted row. This file does NOT touch `_finish_op` itself (it
--       is a universal helper called by every governed writer in the estate -- recutting its
--       signature is a different, much larger blast radius than this ruling asks for).
--       Instead `invite_member` is recut to call `_finish_op` with a HASH-ONLY receipt (so
--       `op_receipts.result` never carries the plaintext), capture ITS return value, then
--       merge the plaintext token into invite_member's OWN final `return` -- one layer above
--       `_finish_op`, after persistence already happened. THE CONTRACT, stated once here:
--       the plaintext token is returned to the caller EXACTLY ONCE, on the call that actually
--       mints it; `op_receipts.result` stores only `token_hash` (hex); a replay of the SAME
--       op_key short-circuits at `_reserve_op` (0004:46-60) and returns THAT persisted,
--       hash-only jsonb -- a replay CANNOT re-mint or re-surface the plaintext, by
--       construction (there is no plaintext anywhere for it to read back). `accept_invite`'s
--       own token handling was VERIFIED, not changed: it already computes
--       `sha256(convert_to(btrim(p_token),'UTF8'))` and looks up `firm_invites.token_hash`
--       (0141 §F) -- it never receives, stores or returns a plaintext token itself.
--
--   (b) clara.firm_admissions.token (0002:255-260). Census of every reader/writer (below)
--       found the admission token stored and compared as PLAINTEXT `uuid` -- an
--       operator-minted, single-use bearer credential for `create_firm` (0017's live body,
--       the T2/T3 lineage's frontier CoR; 0004's and 0005's own `create_firm` bodies are
--       superseded, applied, immutable text, left untouched). Converted to the SAME
--       hash-only shape `firm_invites`/`firm_open_questions` etc. already use: a new
--       `token_hash bytea` column (backfilled from every existing row's plaintext BEFORE the
--       plaintext column is dropped -- the last legitimate read of it), a fresh `id` surrogate
--       primary key (nothing in the estate holds a foreign key onto `firm_admissions.token`,
--       confirmed by census), and `create_firm` recut to compare against the hash. The
--       function's own SIGNATURE is UNCHANGED (`p_admission_token` stays `uuid`) -- every
--       existing caller (the frontend door, `packages/db/scripts/onboard-rpr.mjs`, the O7
--       seed, every rig fixture) keeps handing the SAME plaintext value it always held; only
--       the column it is compared against, and what persists at rest, changes.
--
--       EMAIL-WALL FINDING (the sitting's own "report either way" instruction): NO.
--       `create_firm` carries no email binding on the admission token whatsoever --
--       `firm_invites`/`accept_invite` binds a token to ONE email via `firm_invites.email` +
--       the caller's verified JWT email (0141 §F); `firm_admissions` has no such column and
--       `create_firm`'s body (0017:2438-2490) never reads `clara._jwt_email()` or any email at
--       all. Whoever holds the plaintext admission token, and is signed in as ANY account with
--       no active firm membership, can consume it and become that firm's owner -- a pure
--       bearer-credential model, unlike the invite door. This is a FINDING, not a fix: adding
--       an identity/email binding to `create_firm` is a judgement-logic change to WHO the
--       ceremony admits, a different and larger question than "does the credential sit in
--       plaintext at rest" -- named here for the owner, not silently patched into this hardening
--       PR's scope.
--
--       COMPANION FILES UPDATED IN THE SAME PR (not migrations, but they read/write the column
--       this file changes and would break or silently regress to plaintext otherwise):
--       `packages/db/scripts/onboard-rpr.mjs` (the discovery query), `docs/ops/gate-f-provisioning.md`
--       (Act 2(b)'s mint recipe -- rewritten to the same mint-then-hash CTE shape),
--       `packages/db/tests/rig-fixtures.mjs` + `packages/runtime/tests/relay-fixtures.mjs`
--       (both carry their own `seedAdmission()`), `packages/db/tests/rig-isolation.test.mjs`
--       (T23's own `token = $1` read), `packages/db/tests/wave-b/wb-calls.mjs`
--       (`admissionRow`'s own `a.token=$1` read). `packages/db/seeds/0002_core_seed.sql`'s
--       fixed synthetic tokens (`k_tok_a`/`k_tok_b`) are UNCHANGED as VALUES -- they are public
--       constants checked into the repo already, not secrets; only the INSERT's target column
--       changes from `token` to `token_hash`.
--
-- D1 WRITE-QUIESCE OWED: TWO live audited writer bodies replaced --
-- clara.invite_member(text,text,text) and clara.create_firm(text,uuid,text). Quiesce both for
-- this file's deploy window (packages/db/README.md, "Deploy contract").
--
-- COLLISION NOTE (why this file sits UNPUSHED after authoring): P4 tranche-2 is, at the time
-- this file is authored, CoR-ing create_firm/set_member_role/add_member/invite_member/
-- accept_invite in its own live fix round. A cross-PR CREATE OR REPLACE on the same body
-- silently overwrites whichever PR merges second's CoR with no conflict and no warning (the
-- 0136 lesson) -- so THIS file is authored and rig-tested now, against the current frontier,
-- but held back from push until tranche-2 merges; then rebased onto the new frontier and its
-- own §0 prestate re-run against the LIVE (tranche-2-recut) bodies before it ever ships.
-- =================================================================================================

-- =================================================================================================
-- §0 -- PRESTATE. Every claim measured against the LIVE catalog on this rig.
-- =================================================================================================
create temp table _hrd_b_pre(k text primary key, v text) on commit drop;

do $$
declare
  v_missing text; v_bad text; v_src text; v_acl text; v_owner text; v_n int;
begin
  -- (1) invite_member and create_firm resolve, owned by clara_fn_owner. Stash prosrc/ACL for
  --     both -- the tail proves the ACL is byte-unchanged and the body genuinely changed.
  if to_regprocedure('clara.invite_member(text,text,text)') is null then
    raise exception 'hrd-b prestate: clara.invite_member(text,text,text) does not resolve' using errcode = 'CLR10';
  end if;
  select p.prosrc, coalesce(p.proacl::text, '(null)'), pg_get_userbyid(p.proowner)
    into v_src, v_acl, v_owner
    from pg_proc p where p.oid = 'clara.invite_member(text,text,text)'::regprocedure;
  if v_owner <> 'clara_fn_owner' then
    raise exception 'hrd-b prestate: invite_member is not owned by clara_fn_owner (owner=%)', v_owner using errcode = 'CLR10';
  end if;
  if position('v_token' in v_src) = 0 or position('_finish_op' in v_src) = 0
     or position('token_hash' in v_src) = 0 or position('firm_invites' in v_src) = 0 then
    raise exception 'hrd-b prestate: invite_member''s LIVE body is missing an expected fragment -- re-read the live catalog' using errcode = 'CLR10';
  end if;
  -- The CURRENT plaintext-leak shape must be present pre-edit (the exact fragment this file
  -- removes) -- a prestate that cannot see the defect it is about to fix is not grounded.
  if position('''token'',v_token' in replace(v_src, ' ', '')) = 0 then
    raise exception 'hrd-b prestate: invite_member''s pre-fix plaintext-token receipt fragment not found -- re-read the live catalog before authoring the CoR' using errcode = 'CLR10';
  end if;
  insert into _hrd_b_pre(k, v) values ('invite_member.prosrc', v_src), ('invite_member.acl', v_acl);

  if to_regprocedure('clara.create_firm(text,uuid,text)') is null then
    raise exception 'hrd-b prestate: clara.create_firm(text,uuid,text) does not resolve' using errcode = 'CLR10';
  end if;
  select p.prosrc, coalesce(p.proacl::text, '(null)'), pg_get_userbyid(p.proowner)
    into v_src, v_acl, v_owner
    from pg_proc p where p.oid = 'clara.create_firm(text,uuid,text)'::regprocedure;
  if v_owner <> 'clara_fn_owner' then
    raise exception 'hrd-b prestate: create_firm is not owned by clara_fn_owner (owner=%)', v_owner using errcode = 'CLR10';
  end if;
  if position('wheretoken=p_admission_token' in replace(v_src, ' ', '')) = 0 then
    raise exception 'hrd-b prestate: create_firm''s LIVE body does not compare token=p_admission_token -- re-read the live catalog (recut lineage: 0004 -> 0005 -> 0017 is the frontier)' using errcode = 'CLR10';
  end if;
  if position('invalid or consumed admission token' in v_src) = 0
     or position('actor already belongs to a firm' in v_src) = 0
     or position('the agent identity cannot own a firm' in v_src) = 0
     or position('consumed_op_key' in v_src) = 0
     or position('consumed_result' in v_src) = 0 then
    raise exception 'hrd-b prestate: create_firm''s LIVE body is missing an expected wall/column fragment' using errcode = 'CLR10';
  end if;
  insert into _hrd_b_pre(k, v) values ('create_firm.prosrc', v_src), ('create_firm.acl', v_acl);

  -- (2) firm_admissions: exactly the pre-hardening shape (token uuid PK, no token_hash yet).
  if not exists (
    select 1 from pg_attribute a where a.attrelid = 'clara.firm_admissions'::regclass
      and a.attname = 'token' and a.attnum > 0 and not a.attisdropped
  ) then
    raise exception 'hrd-b prestate: clara.firm_admissions.token column absent -- already migrated?' using errcode = 'CLR10';
  end if;
  if exists (
    select 1 from pg_attribute a where a.attrelid = 'clara.firm_admissions'::regclass
      and a.attname = 'token_hash' and a.attnum > 0 and not a.attisdropped
  ) then
    raise exception 'hrd-b prestate: clara.firm_admissions.token_hash ALREADY exists -- this file would double-apply' using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from clara.firm_admissions;
  insert into _hrd_b_pre(k, v) values ('firm_admissions.rowcount', v_n::text);

  -- (3) Depended-upon functions/objects resolve.
  select string_agg(t.n, ', ') into v_missing
    from (values
      ('clara._human_ctx(integer)'), ('clara.role_rank(text)'), ('clara._reserve_op(uuid,text,text,bytea)'),
      ('clara._finish_op(uuid,text,text,jsonb)'), ('clara._hash(jsonb)'), ('clara._audit(uuid,uuid,uuid,text,text,uuid,jsonb)'),
      ('clara._append_event(uuid,text,uuid,uuid,uuid,text,uuid,uuid,uuid,jsonb)'), ('clara.jwt_sub()')
    ) t(n) where to_regprocedure(t.n) is null;
  if v_missing is not null then
    raise exception 'hrd-b prestate: depended-upon function(s) missing: %', v_missing using errcode = 'CLR10';
  end if;

  raise notice 'hrd-b prestate: OK -- invite_member and create_firm resolve at clara_fn_owner with prosrc/ACL stashed, invite_member''s pre-fix plaintext-token receipt fragment confirmed present, create_firm''s token= comparison and wall strings confirmed present; firm_admissions carries token but not yet token_hash, % row(s) stashed for a rowcount-preserved tail proof; 8 depended-upon functions resolve.', v_n;
end $$;

set role clara_fn_owner;

-- =================================================================================================
-- §A -- firm_admissions: hash-only storage. A surrogate `id` PK (nothing in the estate holds a
-- foreign key onto `token`, confirmed by census -- see header), `token_hash` backfilled from
-- every existing row's plaintext BEFORE that plaintext column is dropped, then the plaintext
-- column is gone. `gen_random_uuid()` as the id default is VOLATILE, so this ADD COLUMN
-- rewrites the table -- immaterial at this table's size (an operator-seeded admission ledger,
-- never a books table).
-- =================================================================================================
alter table clara.firm_admissions add column id uuid not null default gen_random_uuid();
alter table clara.firm_admissions add column token_hash bytea;
update clara.firm_admissions set token_hash = sha256(convert_to(token::text, 'UTF8')) where token_hash is null;
alter table clara.firm_admissions alter column token_hash set not null;

do $$
declare v_pk text;
begin
  select conname into v_pk from pg_constraint
   where conrelid = 'clara.firm_admissions'::regclass and contype = 'p';
  if v_pk is null then
    raise exception 'hrd-b: firm_admissions has no primary key to drop -- unexpected shape' using errcode = 'CLR10';
  end if;
  execute format('alter table clara.firm_admissions drop constraint %I', v_pk);
end $$;

alter table clara.firm_admissions add constraint firm_admissions_pkey primary key (id);
create unique index uq_firm_admissions_token_hash on clara.firm_admissions (token_hash);
alter table clara.firm_admissions drop column token;

-- =================================================================================================
-- §B -- invite_member: hash-only receipt. Every byte outside the RECEIPT tail is unchanged from
-- the §0 stash. `_finish_op` persists a HASH-ONLY jsonb (no plaintext token in op_receipts.result
-- from this call on); its return value (== what was just persisted) is captured, and the
-- plaintext token is merged into invite_member's OWN return, one layer above persistence. A
-- replay of the SAME op_key never reaches this code at all -- it returns at the `_reserve_op`
-- dedupe branch above, with whatever is in op_receipts.result: hash-only, going forward.
-- =================================================================================================
create or replace function clara.invite_member(p_email text, p_role text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; v_dedupe jsonb; v_email text; v_token text; v_id uuid; v_expires timestamptz; v_receipt jsonb;
begin
  c := clara._human_ctx(clara.role_rank('admin'));
  if p_op_key is null or btrim(p_op_key) = '' then raise exception 'op_key is required' using errcode = 'CLR10'; end if;
  v_email := lower(btrim(p_email));
  if v_email is null or v_email = '' or position('@' in v_email) = 0 then
    raise exception 'a valid email is required' using errcode = 'CLR10';
  end if;
  if clara.role_rank(p_role) is null then raise exception 'bad role' using errcode = 'CLR10'; end if;
  v_dedupe := clara._reserve_op(c.firm, 'invite_member', p_op_key,
    clara._hash(jsonb_build_object('email', v_email, 'role', p_role)));
  if v_dedupe is not null then return v_dedupe; end if;
  perform 1 from clara.firms where id = c.firm for update;                 -- serialize per-firm
  if exists (
    select 1 from clara.firm_memberships m join clara.users u on u.id = m.user_id
     where m.firm_id = c.firm and m.status = 'active' and u.email = v_email
  ) then
    raise exception 'that email already belongs to a member of this firm' using errcode = 'CLR10';
  end if;
  if exists (select 1 from clara.firm_invites where firm_id = c.firm and email = v_email and status = 'pending') then
    raise exception 'an invite is already pending for this email' using errcode = 'CLR10';
  end if;
  -- No pgcrypto (0098:269) -- two concatenated gen_random_uuid() calls (core PG13+,
  -- pg_strong_random-backed CSPRNG) give 244 combined random bits, well beyond what guessing
  -- resistance for an emailed, time-boxed, single-use token needs.
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_expires := now() + interval '7 days';
  begin
    insert into clara.firm_invites(firm_id, email, role, token_hash, expires_at, invited_by)
      values (c.firm, v_email, p_role, sha256(convert_to(v_token, 'UTF8')), v_expires, c.actor)
      returning id into v_id;
  exception when unique_violation then
    raise exception 'an invite is already pending for this email' using errcode = 'CLR10';
  end;
  perform clara._audit(c.firm, c.actor, null, null, 'invite_member', null,
    jsonb_build_object('invite', v_id, 'email', v_email, 'role', p_role));
  perform clara._append_event(c.firm, 'invite.issued', null, c.actor, null, null, null, null, null,
    jsonb_build_object('invite', v_id, 'role', p_role));
  -- 裁-16a: op_receipts.result carries ONLY the hash, going forward -- never the plaintext.
  v_receipt := clara._finish_op(c.firm, 'invite_member', p_op_key,
    jsonb_build_object('invite_id', v_id, 'token_hash', encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), 'expires_at', v_expires));
  -- The plaintext is handed back to THIS caller, exactly once, ABOVE persistence -- a replay of
  -- this op_key short-circuits at the _reserve_op branch above and never reaches this line, so
  -- it can never re-mint or re-surface the plaintext.
  return v_receipt || jsonb_build_object('token', v_token);
end $$;

-- =================================================================================================
-- §C -- create_firm: compare the admission token against its hash. Every byte outside the ONE
-- comparison line is unchanged from the §0 stash. `p_admission_token` stays `uuid` -- callers
-- are unaffected; only what the row stores, and what it is compared against, changes.
-- =================================================================================================
create or replace function clara.create_firm(
    p_name text,p_admission_token uuid,p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare
  v_actor uuid; v_firm uuid; v_plan uuid; a record; v_result jsonb;
begin
  v_actor:=clara.jwt_sub();
  if v_actor is null then
    raise exception 'no authenticated actor' using errcode='CLR04';
  end if;
  if not exists(select 1 from clara.users where id=v_actor) then
    raise exception 'unknown actor' using errcode='CLR04';
  end if;
  if exists(select 1 from clara.users where id=v_actor and is_agent) then
    raise exception 'the agent identity cannot own a firm' using errcode='CLR04';
  end if;
  if p_op_key is null or btrim(p_op_key)='' or nullif(btrim(p_name),'') is null then
    raise exception 'firm name and op_key are required' using errcode='CLR10';
  end if;
  select * into a from clara.firm_admissions
    where token_hash=sha256(convert_to(p_admission_token::text,'UTF8')) for update;
  if not found then
    raise exception 'invalid or consumed admission token' using errcode='CLR04';
  end if;
  if a.consumed_at is not null then
    if a.consumed_op_key=p_op_key and a.consumed_result is not null then
      return a.consumed_result;
    end if;
    raise exception 'invalid or consumed admission token' using errcode='CLR04';
  end if;
  if exists(select 1 from clara.firm_memberships
      where user_id=v_actor and status='active') then
    raise exception 'actor already belongs to a firm' using errcode='CLR10';
  end if;
  insert into clara.firms(name) values(btrim(p_name)) returning id into v_firm;
  insert into clara.firm_memberships(firm_id,user_id,role)
    values(v_firm,v_actor,'owner');
  -- [R2-F4] The firm-plan opener is recorded both as opener and contributor.
  insert into clara.onboarding_plans(
      firm_id,scope_kind,review_maker,reviewed_at,contributors)
    values(v_firm,'firm',v_actor,now(),array[v_actor]) returning id into v_plan;
  insert into clara.onboarding_plan_revisions(plan_id,revision_n,snapshot)
    values(v_plan,1,clara._onboarding_plan_snapshot(v_plan));
  v_result:=jsonb_build_object('firm_id',v_firm,'plan_id',v_plan);
  update clara.firm_admissions set consumed_at=now(),
    consumed_op_key=p_op_key,consumed_result=v_result
    where id=a.id;
  perform clara._audit(v_firm,v_actor,null,null,'create_firm',null,
    jsonb_build_object('name',p_name,'plan_id',v_plan,'op_key',p_op_key));
  perform clara._append_event(v_firm,'firm.created',null,v_actor,null,null,
    null,null,null,jsonb_build_object('plan_id',v_plan));
  return v_result;
end $$;

reset role;

-- =================================================================================================
-- §K -- TAIL CENSUS.
-- =================================================================================================
do $$
declare v_bad text; v_n int; v_src_now text; v_acl_now text; v_owner_now text; v_code text;
begin
  -- (1) firm_admissions: token GONE, token_hash NOT NULL + unique, id PK, rowcount preserved.
  if exists (
    select 1 from pg_attribute a where a.attrelid = 'clara.firm_admissions'::regclass
      and a.attname = 'token' and a.attnum > 0 and not a.attisdropped
  ) then
    raise exception 'hrd-b tail: firm_admissions.token STILL present -- the plaintext column was not dropped' using errcode = 'CLR10';
  end if;
  if not exists (
    select 1 from pg_attribute a where a.attrelid = 'clara.firm_admissions'::regclass
      and a.attname = 'token_hash' and a.attnum > 0 and not a.attisdropped
  ) then
    raise exception 'hrd-b tail: firm_admissions.token_hash absent' using errcode = 'CLR10';
  end if;
  if exists (select 1 from clara.firm_admissions where token_hash is null) then
    raise exception 'hrd-b tail: at least one firm_admissions row has a NULL token_hash' using errcode = 'CLR10';
  end if;
  if not exists (
    select 1 from pg_constraint where conrelid = 'clara.firm_admissions'::regclass
      and contype = 'p' and conkey = (select array_agg(attnum) from pg_attribute
        where attrelid = 'clara.firm_admissions'::regclass and attname = 'id')
  ) then
    raise exception 'hrd-b tail: firm_admissions primary key is not on id' using errcode = 'CLR10';
  end if;
  if not exists (
    select 1 from pg_indexes where schemaname = 'clara' and tablename = 'firm_admissions'
      and indexname = 'uq_firm_admissions_token_hash'
  ) then
    raise exception 'hrd-b tail: uq_firm_admissions_token_hash index missing' using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from clara.firm_admissions;
  if v_n::text is distinct from (select v from _hrd_b_pre where k = 'firm_admissions.rowcount') then
    raise exception 'hrd-b tail: firm_admissions row count moved -- was %, now %',
      (select v from _hrd_b_pre where k = 'firm_admissions.rowcount'), v_n using errcode = 'CLR10';
  end if;
  -- firm_admissions is still forced RLS, owner-only, ZERO clara_authenticated/agent/wake/runtime
  -- reach -- this file changes column shape, never the access wall.
  if not exists (
    select 1 from pg_class c where c.oid = 'clara.firm_admissions'::regclass
      and c.relrowsecurity and c.relforcerowsecurity
  ) then
    raise exception 'hrd-b tail: firm_admissions lost forced RLS' using errcode = 'CLR10';
  end if;
  select string_agg(t.role, ', ') into v_bad
    from (values ('clara_authenticated'), ('clara_agent_ro'), ('clara_wake_interactive'), ('clara_wake_proactive'), ('clara_runtime')) t(role)
   where has_table_privilege(t.role, 'clara.firm_admissions'::regclass, 'select');
  if v_bad is not null then
    raise exception 'hrd-b tail: firm_admissions unexpectedly reachable by: %', v_bad using errcode = 'CLR10';
  end if;

  -- (2) invite_member: ACL byte-unchanged, prosrc genuinely changed, the new hash-only receipt
  --     shape present in CODE, the OLD plaintext-in-receipt fragment GONE.
  select coalesce(p.proacl::text, '(null)'), pg_get_userbyid(p.proowner), p.prosrc
    into v_acl_now, v_owner_now, v_src_now
    from pg_proc p where p.oid = 'clara.invite_member(text,text,text)'::regprocedure;
  if v_acl_now is distinct from (select v from _hrd_b_pre where k = 'invite_member.acl') then
    raise exception 'hrd-b tail: invite_member''s ACL moved -- was %, now %',
      (select v from _hrd_b_pre where k = 'invite_member.acl'), v_acl_now using errcode = 'CLR10';
  end if;
  if v_owner_now <> 'clara_fn_owner' then
    raise exception 'hrd-b tail: invite_member owner drifted to %', v_owner_now using errcode = 'CLR10';
  end if;
  if v_src_now = (select v from _hrd_b_pre where k = 'invite_member.prosrc') then
    raise exception 'hrd-b tail: invite_member''s body is byte-identical to prestate -- the fix did not land' using errcode = 'CLR10';
  end if;
  v_code := regexp_replace(regexp_replace(v_src_now, '/\*.*?\*/', '', 'gs'), '--[^\n]*', '', 'g');
  if position('''token_hash'',encode(sha256' in replace(v_code, ' ', '')) = 0 then
    raise exception 'hrd-b tail: invite_member''s _finish_op call does not carry a hash-only receipt in CODE' using errcode = 'CLR10';
  end if;
  if position('v_receipt||jsonb_build_object(''token''' in replace(v_code, ' ', '')) = 0 then
    raise exception 'hrd-b tail: invite_member''s final return does not merge the plaintext token above persistence, in CODE' using errcode = 'CLR10';
  end if;
  if position('''token'',v_token' in replace(v_code, ' ', '')) > 0
     and position('v_receipt||jsonb_build_object(''token''' in replace(v_code, ' ', '')) = 0 then
    raise exception 'hrd-b tail: a bare token-in-jsonb fragment survives outside the merge-after-persist shape' using errcode = 'CLR10';
  end if;
  -- The exact pre-fix fragment (_finish_op called with the raw token inline) must be ABSENT.
  if position('jsonb_build_object(''invite_id'',v_id,''token'',v_token' in replace(v_code, ' ', '')) > 0 then
    raise exception 'hrd-b tail: invite_member still calls _finish_op with the raw token inline -- the plaintext-at-rest defect survives' using errcode = 'CLR10';
  end if;

  -- (3) create_firm: ACL byte-unchanged, prosrc genuinely changed, compares token_hash now
  --     (never bare token=), every prior wall string preserved.
  select coalesce(p.proacl::text, '(null)'), pg_get_userbyid(p.proowner), p.prosrc
    into v_acl_now, v_owner_now, v_src_now
    from pg_proc p where p.oid = 'clara.create_firm(text,uuid,text)'::regprocedure;
  if v_acl_now is distinct from (select v from _hrd_b_pre where k = 'create_firm.acl') then
    raise exception 'hrd-b tail: create_firm''s ACL moved -- was %, now %',
      (select v from _hrd_b_pre where k = 'create_firm.acl'), v_acl_now using errcode = 'CLR10';
  end if;
  if v_owner_now <> 'clara_fn_owner' then
    raise exception 'hrd-b tail: create_firm owner drifted to %', v_owner_now using errcode = 'CLR10';
  end if;
  if v_src_now = (select v from _hrd_b_pre where k = 'create_firm.prosrc') then
    raise exception 'hrd-b tail: create_firm''s body is byte-identical to prestate -- the fix did not land' using errcode = 'CLR10';
  end if;
  v_code := regexp_replace(regexp_replace(v_src_now, '/\*.*?\*/', '', 'gs'), '--[^\n]*', '', 'g');
  if position('token_hash=sha256(convert_to(p_admission_token' in replace(v_code, ' ', '')) = 0 then
    raise exception 'hrd-b tail: create_firm does not compare token_hash in CODE' using errcode = 'CLR10';
  end if;
  if position('wheretoken=p_admission_token' in replace(v_code, ' ', '')) > 0 then
    raise exception 'hrd-b tail: create_firm still compares the bare plaintext token in CODE' using errcode = 'CLR10';
  end if;
  if position('invalid or consumed admission token' in v_code) = 0
     or position('actor already belongs to a firm' in v_code) = 0
     or position('the agent identity cannot own a firm' in v_code) = 0
     or position('unknown actor' in v_code) = 0
     or position('no authenticated actor' in v_code) = 0
     or position('firm name and op_key are required' in v_code) = 0 then
    raise exception 'hrd-b tail: a prior wall string was lost across create_firm''s CoR' using errcode = 'CLR10';
  end if;

  raise notice 'hrd-b tail: OK -- firm_admissions carries token_hash (NOT NULL, unique-indexed) and no plaintext token column, id-keyed PK, row count preserved (%), forced RLS with zero app-role reach unchanged; invite_member''s ACL/owner byte-unchanged, body genuinely changed, _finish_op now persists a hash-only receipt and the plaintext is merged into the caller-facing return ABOVE persistence, the pre-fix inline-plaintext fragment is gone; create_firm''s ACL/owner byte-unchanged, body genuinely changed to compare token_hash, the bare token= comparison is gone, and all 6 prior wall strings survive. D1 OWED: clara.invite_member(text,text,text), clara.create_firm(text,uuid,text) -- two replaced writer bodies. No table in workflow/graphile_worker/spike touched.', v_n;
end $$;
