-- 0209_preview_invite — #625 (refresh spec #612; journeys A3/A4): THE INVITED PERSON SEES WHICH
-- FIRM AND WHICH ROLE THEY ARE ABOUT TO JOIN, BEFORE THEY SET A PASSWORD.
-- =====================================================================================
-- Spec of record: issue #625 AC2 — "a valid invite enters the intended firm without new-firm
-- signup; the accepted role and scope are visible BEFORE entering the workspace". Journey A3:
-- "open invite → identify intended account/firm/role → authenticate if necessary → accepted
-- membership → workspace". Domain words: CONTEXT.md — "Invitation", "Membership / Roster",
-- "Role ladder and rank wall".
--
-- WHAT THIS FILE ADDS, IN ONE SENTENCE. ONE read — `clara.preview_invite(p_token text) returns
-- jsonb` — granted to `clara_authenticated` and nobody else, which answers `{firm_name, role,
-- status, masked_email}` for the ONE invite whose token the caller holds AND whose email is the
-- caller's own verified JWT claim.
--
-- WHAT IT DOES NOT ADD. No table. No column. No trigger. No grant on `clara.firm_invites` — 0141
-- §B's decision (ZERO `clara_authenticated` privilege on the base table, because `token_hash`
-- must never be readable outside a masked door) stands untouched, and this file asserts that
-- twice: once in §0 before it writes anything and once in §C after. No existing body is recut:
-- the five member doors and `clara._jwt_email()` are pinned by pre-image sha256 in §0 and
-- re-read in §C, so "0209 changed nothing else" is a measurement rather than a promise.
--
-- =====================================================================================
-- WHY A DOOR AT ALL, WHEN `clara.firm_invites_visible` ALREADY EXISTS.
--
-- That view is admin+ AND `jwt_firm()`-scoped (`0141:532-539`). An invitee is, by definition,
-- not yet a member of anything: `clara.jwt_firm()` is NULL for them and `clara.actor_role_rank()`
-- is NULL, so the view returns ZERO rows for the one person whose own invitation it describes.
-- The alternative to this door is a grant on the base table, which is precisely what 0141 §B
-- refused. So the shape is the estate's established one: a SECURITY DEFINER function with a
-- pinned `search_path`, reachable by exactly one application role, returning a MASKED projection.
--
-- =====================================================================================
-- THE WALL IS `accept_invite`'s OWN — TWO OF ITS THREE, AND THE THIRD IS NAMED HERE.
--
-- `clara.accept_invite` (live body `0145:694`) resolves the invite by `sha256(token)` and then
-- refuses unless `clara._jwt_email()` equals the invite's stored email. This door asks those SAME
-- two questions in the SAME order against the SAME two facts: holding the token is not enough,
-- and being signed in is not enough; both must be true together.
--
-- IT DOES NOT REPRODUCE accept_invite's THIRD WALL, AND THAT IS A NAMED RESIDUAL RATHER THAN AN
-- OVERSIGHT. Since 0157's F2 fix the acceptance door ALSO re-checks the ISSUER's CURRENT rank
-- (`if clara.role_rank(inv.role) > coalesce(v_issuer_rank, -1) then raise ... CLR04 'invite
-- exceeds the issuer''s rank -- re-issue by an owner'`) — a fact that lives in
-- `clara.firm_memberships` and that `clara.firm_invites_visible` does not carry either. So an
-- invitation whose issuer has since been DEMOTED, or who has left the firm altogether (which
-- `coalesce(..., -1)` refuses outright, for every role), still previews as `pending` HERE and
-- still lists as `pending` on the admin roster THERE, and the acceptance door is what refuses
-- it — with its own actionable sentence, relayed verbatim by the web surface.
--
-- WHY THIS DOOR IS NOT WIDENED TO MATCH. Reporting it would need a FIFTH effective status: the
-- invite-outcome face set is fixed at four (DECISIONS §2 #625) and this door's status expression is
-- deliberately `clara.firm_invites_visible`'s own (below), so a fifth value would put the preview
-- and the roster into disagreement about the same row. Widening BOTH is its own ticket; until
-- then the divergence is PINNED by `packages/db/tests/preview-invite.test.mjs`'s
-- `p625.preview.issuer_rank` cell and recorded in `packages/db/README.md`'s 0209 note.
--
-- NO EXISTENCE ORACLE (the §B risk 0141 wrote this table's whole posture around). Three
-- observations — a token no row carries, a token a row DOES carry but whose email is somebody
-- else's, and a caller whose JWT carries no verified email at all — raise ONE refusal, with one
-- SQLSTATE, one message and one `detail`. Anything else would let a token holder learn that a
-- given secret is live, or let a signed-in stranger enumerate which addresses have invitations
-- outstanding. The battery asserts the three refusals are byte-identical as a triple
-- (`packages/db/tests/preview-invite.test.mjs`, cells `p625.preview.no_oracle`), and §C asserts
-- the body carries exactly one such RAISE.
--
-- WHAT IS *NOT* CLAIMED: this is a shape guarantee, not a timing guarantee. The mismatch path
-- does strictly more work than the not-found path (it reaches a comparison), so a determined
-- attacker with a precise clock could in principle distinguish them. Closing that would mean a
-- constant-time compare inside PL/pgSQL, which this estate has nowhere else and which the
-- network's own variance dwarfs; it is named here rather than left as an unstated assumption.
--
-- =====================================================================================
-- THE ADDRESS IS MASKED, AND THE MASK LEAKS NO LENGTH.
--
-- `first character of the local part` + `***` (three, always) + `@` + `domain`. The stars are a
-- FIXED count on purpose: `repeat('*', length(local) - 1)` would publish the address's length,
-- which is information the caller did not supply. The domain is kept because it is the half that
-- makes the hint useful ("is this the work address or the personal one?") and because the wall
-- above guarantees the caller's own verified email already EQUALS this address — so the mask
-- protects the payload and the logs, not the caller from themselves. An address with no `@`, or
-- one beginning with `@`, masks to `***` with nothing else: `invite_member` lowercases and
-- canonicalises at write (`0147:380`) so this is unreachable today, and a projection that
-- silently rendered a malformed value would be worse than one that says nothing.
--
-- =====================================================================================
-- THE EFFECTIVE STATUS IS `firm_invites_visible`'s EXPRESSION, BYTE FOR BYTE.
--
-- `accept_invite` deliberately never PERSISTS a `pending` → `expired` transition (0141 §F: a
-- write immediately before a RAISE rolls back with it), so the stored status of a dead invite is
-- `pending` forever. `firm_invites_visible` computes the real one live off `expires_at`
-- (`0141:532-534`) and so does this door, with the same aliases in the same order — and §C
-- normalises BOTH texts (whitespace and `::text` casts removed) and requires the view's fragment
-- to appear inside this function's own source. If 0141's view ever changes how expiry is decided,
-- this migration's tail is what says so.
--
-- =====================================================================================
-- LOCK ORDER: THIS DOOR TAKES NO ROW LOCK AT ALL.
--
-- C-80's invariant is that the member doors keep taking `clara.firms` BEFORE the member row,
-- because `clara._record_journal_entry_core`'s `for key share` ordering was derived from exactly
-- that and is sha-pinned at `0194:192-195` and `0195:396-400` (the alternative was a measured
-- 40P01, `0194:1461-1470`). This file adds a pure read with no `for update`, no `for share` and
-- no `for key share` anywhere in its body — §C asserts that from the source — so it cannot join
-- that cycle from either end.
-- =====================================================================================

do $w625_pre$
declare v_sig text; v_want text; v_n int; v_cols text;
begin
  -- (1) The surface this door reads must exist, and must still be the one 0141 built.
  if to_regclass('clara.firm_invites') is null then
    raise exception '#625 prestate: clara.firm_invites is absent -- 0141 must apply first' using errcode='CLR10';
  end if;
  if to_regclass('clara.firm_invites_visible') is null then
    raise exception '#625 prestate: clara.firm_invites_visible is absent -- 0141 must apply first' using errcode='CLR10';
  end if;
  if to_regprocedure('clara._jwt_email()') is null then
    raise exception '#625 prestate: clara._jwt_email() is absent -- the wall this door reuses does not exist' using errcode='CLR10';
  end if;

  -- (2) THE DOOR MUST BE WHOLLY ABSENT. A half-applied cohort is the failure mode rig-meta's
  --     "wholly present or wholly absent" rule exists to catch; here the cohort is one name.
  if to_regprocedure('clara.preview_invite(text)') is not null then
    raise exception '#625 prestate: clara.preview_invite already exists' using errcode='CLR10';
  end if;

  -- (3) 0141 §B's DECISION, RE-READ BEFORE THIS FILE TOUCHES ANYTHING: the base table carries no
  --     privilege for any application role. This file adds none either (§C re-reads it), but a
  --     prestate that did not measure it could not tell a grant this file made from one it found.
  select count(*)::int into v_n from information_schema.role_table_grants
   where table_schema='clara' and table_name='firm_invites'
     and grantee in ('clara_authenticated','clara_runtime','clara_agent_ro',
                     'clara_wake_interactive','clara_wake_proactive','PUBLIC');
  if v_n <> 0 then
    raise exception '#625 prestate: clara.firm_invites already carries % application-role grant(s) -- 0141 §B has already been widened elsewhere', v_n
      using errcode='CLR10';
  end if;

  -- (4) THE MASKED VIEW'S COLUMN CENSUS, unmoved. §C asserts the same ten after.
  select string_agg(column_name, ',' order by ordinal_position) into v_cols
    from information_schema.columns where table_schema='clara' and table_name='firm_invites_visible';
  if v_cols <> 'id,firm_id,email,role,status,invited_by,created_at,expires_at,accepted_at,revoked_at' then
    raise exception '#625 prestate: clara.firm_invites_visible is not 0141''s ten-column projection -- got %', v_cols
      using errcode='CLR10';
  end if;

  -- (5) THE SIX NON-REGRESSION PINS. This file recuts NOTHING, so these are not
  --     derive-from-this-text pins: they are the statement "0209 found these bodies exactly
  --     here". Every number was MEASURED on a migrated 0001->0198 rig (PG 17.11, 193 files) by
  --     reading pg_proc.prosrc -- never transcribed from a creating migration, because several
  --     of these live bodies are SPLICES: clara.set_member_role alone was emitted at 0005:707,
  --     0145:592 and 0157:248, so a pin taken from any one of those files matches nothing.
  for v_sig, v_want in
    select * from (values
      ('clara.accept_invite(text,text,text)',    '42a153231c724aaace9fb9dae7abe3551667c6669e7dacd1d5495b35c31aeef2'),
      ('clara.invite_member(text,text,text)',    '809d29ed4d702a7672931497a953ae0a66387b412597c5150b92d541ccc2636c'),
      ('clara.revoke_invite(uuid,text)',         '2943909c1ee1a324d2fd6c986026b86f1aa43e6d3410f92fdcdb6727ae9220f3'),
      ('clara.set_member_role(uuid,text,text)',  '84457f830741fafe3f37348b503e934f491752aa65fbdaccaf49d50ab63b8c26'),
      ('clara.remove_member(uuid,text)',         '3ad0b907cb2057f237010d22099760d07d1c55c634d6b0e4708e813f60f20b54'),
      ('clara._jwt_email()',                     'cca5a3865ccd8a2e98e5c2ec8bc8570dcf90c04c8e83f2883b77d2fe223bb9c9')
    ) as t(sig, sha)
  loop
    if to_regprocedure(v_sig) is null then
      raise exception '#625 prestate: % does not resolve', v_sig using errcode='CLR10';
    end if;
    if (select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') from pg_proc p where p.oid = to_regprocedure(v_sig))
       is distinct from v_want then
      raise exception '#625 prestate: % has DRIFTED from its pinned body -- this file claims to change nothing, so re-measure before applying', v_sig
        using errcode='CLR10';
    end if;
  end loop;

  raise notice '#625 prestate: clean -- clara.preview_invite does not exist; clara.firm_invites carries ZERO application-role grant and firm_invites_visible is still 0141''s ten-column masked projection; the five member doors and _jwt_email() are at their measured pre-0209 bodies.';
end
$w625_pre$;

set role clara_fn_owner;

-- =================================================================================================
-- §A -- clara.preview_invite(p_token text) returns jsonb
--
-- SECURITY DEFINER with a pinned search_path, exactly like the four 0141 doors beside it. It runs
-- as clara_fn_owner because clara.firm_invites has no policy for any application role at all;
-- the CALLER's authority is established inside the body, by the same two facts accept_invite
-- uses, and by nothing else.
--
-- READ-ONLY BY CONSTRUCTION: no INSERT, no UPDATE, no _reserve_op, no _audit, no _append_event.
-- A preview is not an act -- it takes no op_key, mints no receipt and appends no event, because
-- there is nothing for a replay to converge on and nothing an auditor needs to attribute. (What
-- IS receipted is the acceptance itself: accept_invite's own _audit row + member.added event.)
-- =================================================================================================
create function clara.preview_invite(p_token text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_actor uuid; v_email text; v_hash bytea; inv record; v_at int; v_masked text;
begin
  v_actor := clara.jwt_sub();
  if v_actor is null then raise exception 'no authenticated actor' using errcode = 'CLR04'; end if;
  -- An absent token is a caller-side fact that depends on no invite, so naming it honestly is not
  -- an oracle. accept_invite raises the same sentence under the same code (0145:700).
  if p_token is null or btrim(p_token) = '' then raise exception 'a token is required' using errcode = 'CLR10'; end if;

  v_email := clara._jwt_email();
  v_hash := sha256(convert_to(btrim(p_token), 'UTF8'));

  -- The EFFECTIVE status is computed HERE, in the same expression clara.firm_invites_visible uses
  -- (0141:532-534) with the same alias, so the two can never disagree about whether a link is
  -- dead. No row lock: this is a read (see the header's lock-order note).
  select f.name as firm_name, i.role as role, i.email as email,
         case when i.status = 'pending' and i.expires_at <= now() then 'expired' else i.status end as status
    into inv
    from clara.firm_invites i
    join clara.firms f on f.id = i.firm_id
   where i.token_hash = v_hash;

  -- THE ONE REFUSAL, and it is one on purpose. "No such token", "a real token that is not yours"
  -- and "a session with no verified address" are three different facts and they must be
  -- INDISTINGUISHABLE from outside, or this door becomes the existence oracle 0141 §B closed.
  if not found or v_email is null or v_email is distinct from inv.email then
    raise exception 'this invite link is not valid for the signed-in address'
      using errcode = 'CLR10', detail = '{"reason":"invite_not_previewable"}';
  end if;

  -- The mask: one leading character, three FIXED stars (a length-proportional run would publish
  -- the address's length), the domain. See the header for why the domain is kept.
  v_at := position('@' in inv.email);
  if v_at > 1 then
    v_masked := left(inv.email, 1) || '***@' || substr(inv.email, v_at + 1);
  else
    v_masked := '***';
  end if;

  return jsonb_build_object(
    'firm_name', inv.firm_name,
    'role', inv.role,
    'status', inv.status,
    'masked_email', v_masked);
end $$;

-- =================================================================================================
-- §B -- GRANT MATRIX. N13 (0005:38-42): a function is PUBLIC-executable until it is revoked, so
-- the revoke is not optional. ONE grantee: clara_authenticated. There is no `anon` role in this
-- estate (packages/db/deploy/roles-bootstrap.sql declares none and no migration grants to one),
-- so "signed out" cannot reach this door at all -- which is why a signed-out preview is a named
-- residual needing a server route, not a wider grant.
-- =================================================================================================
revoke all on function clara.preview_invite(text) from public;
grant execute on function clara.preview_invite(text) to clara_authenticated;

reset role;

-- =================================================================================================
-- §C -- TAIL CENSUS. Re-reads the live catalog; raises on any finding rather than trusting §A/§B
-- ran as written.
-- =================================================================================================
do $w625_tail$
declare v_src text; v_ret text; v_view text; v_frag text; v_n int; v_cols text; v_posture text; r text;
begin
  -- (T.1) THE POSTURE CEREMONY: owner, SECURITY DEFINER, pinned search_path, and the EXACT ACL
  -- TEXT -- grantor included, so a WITH GRANT OPTION or a PUBLIC grant cannot hide behind a
  -- has_function_privilege probe (0194 §T.8's shape).
  if to_regprocedure('clara.preview_invite(text)') is null then
    raise exception '#625 tail: clara.preview_invite(text) does not resolve' using errcode='CLR10';
  end if;
  select pg_get_userbyid(p.proowner) || ' | ' || p.prosecdef::text || ' | '
         || coalesce(array_to_string(p.proconfig, ','), '<none>') || ' | '
         || coalesce(array_to_string(p.proacl, ','), '<null>')
    into v_posture from pg_proc p where p.oid = 'clara.preview_invite(text)'::regprocedure;
  if v_posture is distinct from
     'clara_fn_owner | true | search_path=clara, pg_temp | clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner' then
    raise exception '#625 tail: clara.preview_invite has the wrong posture -- got {%}', v_posture using errcode='CLR10';
  end if;
  foreach r in array array['clara_runtime','clara_agent_ro','clara_wake_interactive','clara_wake_proactive'] loop
    if to_regrole(r) is not null and has_function_privilege(r, 'clara.preview_invite(text)', 'EXECUTE') then
      raise exception '#625 tail: % can EXECUTE clara.preview_invite -- only clara_authenticated may', r using errcode='CLR10';
    end if;
  end loop;
  -- …and if an `anon` role is ever introduced, it must not inherit this door by accident.
  if to_regrole('anon') is not null and has_function_privilege('anon', 'clara.preview_invite(text)', 'EXECUTE') then
    raise exception '#625 tail: an anon role can EXECUTE clara.preview_invite' using errcode='CLR10';
  end if;

  select p.prosrc into v_src from pg_proc p where p.oid = 'clara.preview_invite(text)'::regprocedure;

  -- (T.2) THE OUTPUT SHAPE IS CLOSED, and neither the token nor the address can reach it. Read
  -- off the RETURN expression itself rather than asserted about the door in prose.
  -- The POSITION is tested BEFORE the substring, on purpose: `substr(s, 0)` CLAMPS to the whole
  -- string rather than returning '', so an unconditional substr followed by `if v_ret = ''` is a
  -- guard that can never fire — it is reachable only when prosrc itself is empty. Ask the
  -- question that has an answer, then cut.
  v_n := position('return jsonb_build_object(' in v_src);
  if v_n = 0 then
    raise exception '#625 tail: clara.preview_invite does not return a jsonb_build_object' using errcode='CLR10';
  end if;
  v_ret := substr(v_src, v_n);
  if position('token' in v_ret) <> 0 then
    raise exception '#625 tail: the returned object names a token' using errcode='CLR10';
  end if;
  if position('inv.email' in v_ret) <> 0 then
    raise exception '#625 tail: the returned object carries the UNMASKED address' using errcode='CLR10';
  end if;
  foreach r in array array['''firm_name''','''role''','''status''','''masked_email'''] loop
    if position(r in v_ret) = 0 then
      raise exception '#625 tail: the returned object is missing the key %', r using errcode='CLR10';
    end if;
  end loop;
  -- FOUR keys and no fifth: count the `', ` separators the builder uses.
  v_n := (length(v_ret) - length(replace(v_ret, '''', ''))) / 2;
  if v_n <> 4 then
    raise exception '#625 tail: the returned object carries % quoted keys (want exactly 4)', v_n using errcode='CLR10';
  end if;

  -- (T.3) EXACTLY ONE no-oracle refusal in the body. Two would mean two observable shapes.
  v_n := (length(v_src) - length(replace(v_src, 'this invite link is not valid for the signed-in address', '')))
         / length('this invite link is not valid for the signed-in address');
  if v_n <> 1 then
    raise exception '#625 tail: the body carries % copies of the shared refusal (want exactly 1)', v_n using errcode='CLR10';
  end if;
  if position('invite_not_previewable' in v_src) = 0 then
    raise exception '#625 tail: the shared refusal carries no typed detail reason' using errcode='CLR10';
  end if;

  -- (T.4) THE DOOR IS A READ. No write verb, and no row lock of any kind -- the C-80 lock-order
  -- invariant the header names cannot be joined from a body that locks nothing.
  foreach r in array array['insert into','update clara','delete from','for update','for share','for key share',
                           '_reserve_op','_finish_op','_audit','_append_event'] loop
    if position(r in v_src) <> 0 then
      raise exception '#625 tail: clara.preview_invite carries "%" -- a preview is a read', r using errcode='CLR10';
    end if;
  end loop;

  -- (T.5) THE EXPIRY EXPRESSION IS firm_invites_visible's OWN.
  --
  -- The two texts cannot be compared raw: `pg_get_viewdef` RE-RENDERS a view from its parsed
  -- tree (it adds its own parentheses, drops the table alias it does not need and appends
  -- `::text` casts), while `pg_proc.prosrc` is the author's own bytes. So both sides are
  -- normalised the same way -- lowercased, `::text` removed, all whitespace removed, then every
  -- parenthesis and every `i.` qualifier removed -- and the view's own fragment must then appear
  -- inside this function's normalised source. What survives that normalisation is the part that
  -- carries the MEANING: which column, which literal, which comparison, in which order.
  v_view := lower(regexp_replace(regexp_replace(regexp_replace(
              pg_get_viewdef('clara.firm_invites_visible'::regclass),
              '::text', '', 'g'), '\s+', '', 'g'), '(\(|\)|i\.)', '', 'g'));
  v_frag := 'casewhenstatus=''pending''andexpires_at<=nowthen''expired''elsestatusend';
  if position(v_frag in v_view) = 0 then
    raise exception '#625 tail: clara.firm_invites_visible no longer computes expiry the way this door copied it -- re-derive §A before trusting it'
      using errcode='CLR10';
  end if;
  if position(v_frag in lower(regexp_replace(regexp_replace(regexp_replace(
              v_src, '::text', '', 'g'), '\s+', '', 'g'), '(\(|\)|i\.)', '', 'g'))) = 0 then
    raise exception '#625 tail: clara.preview_invite''s status expression is not the view''s' using errcode='CLR10';
  end if;

  -- (T.6) 0141 §B IS UNTOUCHED: still zero application-role privilege on the base table.
  select count(*)::int into v_n from information_schema.role_table_grants
   where table_schema='clara' and table_name='firm_invites'
     and grantee in ('clara_authenticated','clara_runtime','clara_agent_ro',
                     'clara_wake_interactive','clara_wake_proactive','PUBLIC');
  if v_n <> 0 then
    raise exception '#625 tail: clara.firm_invites gained % application-role grant(s)', v_n using errcode='CLR10';
  end if;
  if not (select relrowsecurity and relforcerowsecurity from pg_class where oid='clara.firm_invites'::regclass) then
    raise exception '#625 tail: clara.firm_invites lost FORCE RLS' using errcode='CLR10';
  end if;

  -- (T.7) THE THREE READ VIEWS' COLUMN CENSUSES, UNMOVED (0141 §H's own contract).
  for r, v_cols in
    select * from (values
      ('firm_members_visible', 'membership_id,user_id,display_name,email,role,role_rank,status,created_at,removed_at'),
      ('firm_invites_visible', 'id,firm_id,email,role,status,invited_by,created_at,expires_at,accepted_at,revoked_at'),
      ('caller_context',       'user_id,firm_id,firm_name,role,role_rank,is_operator')
    ) as t(v, cols)
  loop
    if (select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns
         where table_schema='clara' and table_name=r) is distinct from v_cols then
      raise exception '#625 tail: clara.% is no longer its declared projection', r using errcode='CLR10';
    end if;
  end loop;

  -- (T.8) THE SIX NON-REGRESSION PINS, RE-READ AFTER THE FILE APPLIED. §0 said "found here";
  -- this says "left here".
  for r, v_cols in
    select * from (values
      ('clara.accept_invite(text,text,text)',    '42a153231c724aaace9fb9dae7abe3551667c6669e7dacd1d5495b35c31aeef2'),
      ('clara.invite_member(text,text,text)',    '809d29ed4d702a7672931497a953ae0a66387b412597c5150b92d541ccc2636c'),
      ('clara.revoke_invite(uuid,text)',         '2943909c1ee1a324d2fd6c986026b86f1aa43e6d3410f92fdcdb6727ae9220f3'),
      ('clara.set_member_role(uuid,text,text)',  '84457f830741fafe3f37348b503e934f491752aa65fbdaccaf49d50ab63b8c26'),
      ('clara.remove_member(uuid,text)',         '3ad0b907cb2057f237010d22099760d07d1c55c634d6b0e4708e813f60f20b54'),
      ('clara._jwt_email()',                     'cca5a3865ccd8a2e98e5c2ec8bc8570dcf90c04c8e83f2883b77d2fe223bb9c9')
    ) as t(sig, sha)
  loop
    if (select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') from pg_proc p where p.oid = to_regprocedure(r))
       is distinct from v_cols then
      raise exception '#625 tail: % MOVED while this file applied', r using errcode='CLR10';
    end if;
  end loop;

  -- (T.9) NOTHING ELSE WAS CREATED. One new function in schema clara, and no new relation.
  select count(*)::int into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='clara' and p.proname like 'preview_invite%';
  if v_n <> 1 then
    raise exception '#625 tail: % functions named preview_invite* exist (want exactly 1)', v_n using errcode='CLR10';
  end if;

  raise notice '#625 tail: OK -- clara.preview_invite(text) is a clara_fn_owner-owned SECURITY DEFINER with search_path=clara, pg_temp and an ACL of exactly {clara_fn_owner, clara_authenticated} (grantor included; runtime, both agent read roles, all four wake lanes, PUBLIC and any future anon reach nothing). Its returned object carries EXACTLY four quoted keys -- firm_name, role, status, masked_email -- and names neither a token nor the unmasked address; its body carries EXACTLY ONE copy of the shared no-oracle refusal, with a typed detail reason, and no write verb and no row lock of any kind, so it cannot join the firms-then-member-row lock order a sha-pinned posting core derives from. Its effective-status expression is clara.firm_invites_visible''s own, compared after normalising case, whitespace and ::text casts. clara.firm_invites still carries ZERO application-role privilege and still FORCES RLS; firm_members_visible (9), firm_invites_visible (10) and caller_context (6) are their declared projections; and the five member doors plus _jwt_email() hash exactly as the prestate found them -- this file recuts nothing.';
end
$w625_tail$;
