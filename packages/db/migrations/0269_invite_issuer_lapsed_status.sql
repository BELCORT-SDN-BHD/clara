-- 0269_invite_issuer_lapsed_status — #872 (lane 10, riders wave 2): A FIFTH, READ-TIME-ONLY
-- EFFECTIVE STATUS FOR A STILL-PENDING INVITE WHOSE ISSUER NO LONGER HOLDS ADMIN STANDING.
-- =====================================================================================
-- Spec of record: ticket #872's Agent Brief, ready-for-agent after the owner's ruling below.
-- R1 (docs/plan/active/refresh-wave-2026-09-15/DECISIONS.md §3.0, 2026-09-15) ruled "do not add a
-- fifth status" — adding one to only ONE of the two reads would make the preview and the admin
-- roster "each say a different thing about the same row". #872's owner ruling, dated 2026-09-18,
-- SUPERSEDES R1: a fifth status is added, but to BOTH reads at once, computed by ONE expression
-- both bodies carry — so the divergence R1 was refusing to create cannot occur.
--
-- OWNER RULING (2026-09-18), VERBATIM FROM THE TICKET: "A fifth effective status exists,
-- `issuer_lapsed` (发件人已失效): an invite that is still pending whose issuer's current
-- membership no longer carries admin standing (demoted or removed). It is computed at read time
-- by one expression shared by preview_invite and the admin roster read, so the two can never
-- disagree, and it is reversible: re-promoting the issuer returns the invite to pending. No
-- write-time change. An invite in that state can still be accepted; the preview shows the notice
-- and the accept door is unchanged."
--
-- =====================================================================================
-- WHAT THIS FILE CHANGES, IN ONE SENTENCE. TWO existing bodies are RECUT — `clara.preview_invite
-- (text)` (0224) and the view `clara.firm_invites_visible` (0141 §H) — each gaining ONE new
-- WHEN-arm in the SAME status CASE expression they already shared (the "expired" arm, unchanged):
-- when the row is still `pending` AND the issuer's CURRENT active membership rank is below
-- `role_rank('admin')` (demoted below admin, or no active membership at all), the effective
-- status reads `issuer_lapsed` instead of `pending`. Every other branch of the CASE — `expired`,
-- and the pass-through for `accepted`/`revoked` — is untouched, character for character.
--
-- WHAT THIS FILE DOES NOT CHANGE. No table, no column, no trigger, no new grant, no new relation.
-- `clara.firm_invites.status` keeps its four-value CHECK (0141:181) exactly as it stands — this
-- status is NEVER written to that column; it exists only in the two reads' own projection.
-- `clara.accept_invite`'s issuer-rank wall (0157 F2: `if clara.role_rank(inv.role) >
-- coalesce(v_issuer_rank, -1) then raise ... CLR04`) is NOT recut and is re-measured byte-for-byte
-- at the tail below — the owner ruling's "the accept door is unchanged" is a checked fact here,
-- not an assumption. The five member doors this estate already pins elsewhere are untouched too
-- (this file recuts neither `invite_member`, `revoke_invite`, `set_member_role` nor
-- `remove_member`).
--
-- WHY NO NEW FUNCTION AND NO NEW GRANT. A first draft factored the issuer-rank lookup into a
-- standalone two-argument helper, `clara._invite_issuer_rank(p_firm_id, p_invited_by)`, mirroring
-- `clara.actor_role_rank()`'s SECURITY DEFINER shape. MEASURED on this rig (a scratch probe: a
-- plain view referencing a SECURITY DEFINER function with no EXECUTE grant to the querying role
-- raises 42501 even though the view itself is owner-executed and the function is definer-owned —
-- Postgres checks EXECUTE against the ACTUAL INVOKING role for every function named in a view's
-- body, never against the view owner) that helper would need EXECUTE granted to
-- `clara_authenticated` for `clara.firm_invites_visible` to keep working — and PostgREST exposes
-- every EXECUTE-granted function as an RPC door. A bare two-argument `(firm_id, user_id) -> rank`
-- door callable with ARBITRARY arguments is precisely the cross-tenant membership oracle
-- `clara.shares_my_firm_human`/`_wake` (0002:453-465) were split into one-argument, self-scoped
-- helpers to avoid — and unlike those, this lookup cannot be self-scoped to the CALLER's own firm,
-- because `preview_invite`'s caller is the INVITEE, who by definition has no firm context yet
-- (`clara.jwt_firm()` is NULL for them — 0224's own header). So this file uses a CORRELATED
-- SUBQUERY against `clara.firm_memberships` directly inside each body instead: no new function,
-- no new grant, no new RPC surface, and no oracle. Both bodies already carry (owner-executed view;
-- SECURITY DEFINER function) whatever ambient authority they need to read that table, exactly as
-- `firm_invites_visible` already reads `clara.firm_invites` itself with zero grant to
-- `clara_authenticated` on the base table.
--
-- THE SUBQUERY IS THE SAME 0157 F2 ALREADY USES, mirrored: `select clara.role_rank(m.role) from
-- clara.firm_memberships m where m.user_id = <invited_by> and m.firm_id = <firm_id> and m.status
-- = 'active'` — the ISSUER's own current, active membership. `coalesce(..., -1)` is the SAME
-- fail-closed floor accept_invite's wall already uses for a non-member issuer (0157:715:
-- "An issuer with no active membership at all reads as rank -1").
--
-- REVERSIBILITY IS STRUCTURAL, NOT A SEPARATE MECHANISM. Nothing is written when an issuer is
-- demoted or removed, and nothing is written when they are re-promoted or re-added: the CASE is
-- evaluated fresh on every read, off `clara.firm_memberships`'s LIVE state, so the very next read
-- after a re-promotion reports `pending` again with no migration, no sweep and no backfill.
--
-- WHY "STILL PENDING" GATES THIS ARM, NOT A BARE RANK COMPARISON. An `accepted` or `revoked`
-- invite's issuer's later fate is not this door's business — the row already answered a different
-- question. The WHEN-arm's own `i.status = 'pending'` guard (repeated from the `expired` arm
-- immediately above it) is what keeps `issuer_lapsed` from ever overriding one of the three
-- settled outcomes, and the `expired` arm is checked FIRST so an invite that is BOTH stale and
-- issuer-lapsed reports `expired` — the same "still pending" premise the owner ruling states.
-- =====================================================================================

do $w872_pre$
declare v_n int; v_cols text; v_view_sha text; v_fn_sha text; v_accept_sha text; v_fm_grants text;
begin
  -- (1) The two bodies this file recuts, and the table the new arm reads, must already exist.
  if to_regclass('clara.firm_invites_visible') is null then
    raise exception '#872 prestate: clara.firm_invites_visible is absent -- 0141 must apply first' using errcode='CLR10';
  end if;
  if to_regprocedure('clara.preview_invite(text)') is null then
    raise exception '#872 prestate: clara.preview_invite(text) is absent -- 0224 must apply first' using errcode='CLR10';
  end if;
  if to_regclass('clara.firm_memberships') is null then
    raise exception '#872 prestate: clara.firm_memberships is absent' using errcode='CLR10';
  end if;
  if to_regprocedure('clara.role_rank(text)') is null then
    raise exception '#872 prestate: clara.role_rank(text) is absent' using errcode='CLR10';
  end if;

  -- (2) firm_memberships carries the four columns the new subquery names, unmoved.
  select string_agg(column_name, ',' order by ordinal_position) into v_cols
    from information_schema.columns where table_schema = 'clara' and table_name = 'firm_memberships';
  if position('user_id' in v_cols) = 0 or position('firm_id' in v_cols) = 0
     or position(',role,' in ',' || v_cols || ',') = 0 or position(',status,' in ',' || v_cols || ',') = 0 then
    raise exception '#872 prestate: clara.firm_memberships is missing one of user_id/firm_id/role/status -- got %', v_cols
      using errcode='CLR10';
  end if;

  -- (3) THE FRONTIER PINS, MEASURED ON THIS RIG NOW -- never transcribed from 0141 or 0224's own
  --     text, because a ticket earlier in this lane's chain could in principle have recut either
  --     body first (this wave's #871 stopped without applying any migration, so as-measured here
  --     these are still 0141's and 0224's own original bodies, but this file does not ASSUME
  --     that -- it MEASURES it, the same discipline 0224 §0(5) itself used for the five member
  --     doors it was careful not to touch).
  select encode(sha256(convert_to(pg_get_viewdef('clara.firm_invites_visible'::regclass, true), 'UTF8')), 'hex')
    into v_view_sha;
  if v_view_sha is distinct from '8bc47b6b4608cd1caae8a0257f8dff887fc1247f5b730a02a78882ae0bfcb7b6' then
    raise exception '#872 prestate: clara.firm_invites_visible has DRIFTED from its pinned pre-image -- re-measure before applying (got %)', v_view_sha
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_fn_sha
    from pg_proc p where p.oid = 'clara.preview_invite(text)'::regprocedure;
  if v_fn_sha is distinct from '0c26f516ecb971055265a8ab6ee94c3d98c8b9037b2f0f801c66e1e37263a511' then
    raise exception '#872 prestate: clara.preview_invite has DRIFTED from its pinned pre-image -- re-measure before applying (got %)', v_fn_sha
      using errcode='CLR10';
  end if;

  -- (4) accept_invite's OWN issuer-rank wall is NOT recut by this file -- pinned here so the
  --     tail can prove "the accept door is unchanged" from the OTHER side, the same layered-pin
  --     convention 0234 uses for a body it does not itself recut (packages/db/README.md's own
  --     note on that file).
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_accept_sha
    from pg_proc p where p.oid = 'clara.accept_invite(text,text,text)'::regprocedure;
  if v_accept_sha is distinct from '42a153231c724aaace9fb9dae7abe3551667c6669e7dacd1d5495b35c31aeef2' then
    raise exception '#872 prestate: clara.accept_invite has DRIFTED from its pinned pre-image -- this file must not touch it, so re-measure before applying (got %)', v_accept_sha
      using errcode='CLR10';
  end if;

  -- (4b) `clara.firm_memberships`'s OWN grant matrix, MEASURED NOW (never assumed zero: unlike
  --      `clara.firm_invites`, this table already carries a direct `clara_authenticated` /
  --      `clara_agent_ro` SELECT grant behind its own RLS policies -- this file's new subquery
  --      reads it through the VIEW's ambient owner-executed authority regardless, exactly as
  --      `firm_invites_visible` already reads `clara.firm_invites` despite THAT table's zero
  --      grant, so this file adds no grant here either way; the tail re-measures the SAME string
  --      from the pin below, not from a temp-table handoff, because neither §A nor §B contains a
  --      GRANT or REVOKE statement at all -- this fact cannot move while this file applies).
  select coalesce(string_agg(grantee || ':' || privilege_type, ',' order by grantee, privilege_type), '') into v_fm_grants
    from information_schema.role_table_grants
   where table_schema = 'clara' and table_name = 'firm_memberships'
     and grantee in ('clara_authenticated','clara_runtime','clara_agent_ro',
                     'clara_wake_interactive','clara_wake_proactive','PUBLIC');
  if v_fm_grants is distinct from 'clara_agent_ro:SELECT,clara_authenticated:SELECT' then
    raise exception '#872 prestate: clara.firm_memberships'' application-role grant matrix has DRIFTED from its measured pin -- got %', v_fm_grants
      using errcode='CLR10';
  end if;

  -- (5) `issuer_lapsed` must not already be a live value anywhere reachable -- the whole point
  --     is that this file is what introduces it.
  if position('issuer_lapsed' in coalesce(pg_get_viewdef('clara.firm_invites_visible'::regclass, true), '')) <> 0 then
    raise exception '#872 prestate: clara.firm_invites_visible already names issuer_lapsed' using errcode='CLR10';
  end if;
  select p.prosrc into v_cols from pg_proc p where p.oid = 'clara.preview_invite(text)'::regprocedure;
  if position('issuer_lapsed' in v_cols) <> 0 then
    raise exception '#872 prestate: clara.preview_invite already names issuer_lapsed' using errcode='CLR10';
  end if;

  raise notice '#872 prestate: clean -- firm_invites_visible and preview_invite are at their measured pre-images, neither names issuer_lapsed yet, accept_invite is at its pinned body, and firm_memberships carries the four columns the new arm reads.';
end
$w872_pre$;

set role clara_fn_owner;

-- =================================================================================================
-- §A -- clara.firm_invites_visible, recut. Ten columns, same order, same types -- CREATE OR
-- REPLACE VIEW requires it and this file adds no eleventh. ONLY the `status` CASE gains a WHEN-arm.
-- =================================================================================================
create or replace view clara.firm_invites_visible with (security_barrier) as
  select i.id, i.firm_id, i.email, i.role,
    case
      when i.status = 'pending' and i.expires_at <= now() then 'expired'
      -- #872 -- THE NEW ARM. Still pending, and the issuer's OWN current active membership
      -- (0157 F2's own query, unchanged) ranks below admin -- demoted below admin, or no active
      -- membership at all (`coalesce(..., -1)`, the same fail-closed floor accept_invite uses).
      when i.status = 'pending' and coalesce(
             (select clara.role_rank(m.role) from clara.firm_memberships m
                where m.user_id = i.invited_by and m.firm_id = i.firm_id and m.status = 'active'),
             -1) < clara.role_rank('admin')
        then 'issuer_lapsed'
      else i.status
    end as status,
    i.invited_by, i.created_at, i.expires_at, i.accepted_at, i.revoked_at
  from clara.firm_invites i
  where i.firm_id = clara.jwt_firm()
    and coalesce(clara.actor_role_rank(), -1) >= clara.role_rank('admin');

-- =================================================================================================
-- §B -- clara.preview_invite(text), recut. Byte-identical to 0224's body except the SAME new
-- WHEN-arm, added to the SAME status CASE, with the SAME aliases (`i` for clara.firm_invites) --
-- the two bodies carry the fragment identically, which is what "one shared expression" means here.
-- =================================================================================================
create or replace function clara.preview_invite(p_token text) returns jsonb
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
  -- (0141:532-534, widened by #872), with the same alias, so the two can never disagree about
  -- whether a link is dead OR whether its issuer still holds admin standing. No row lock: this is
  -- a read (see the header's lock-order note).
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

reset role;

-- =================================================================================================
-- §C -- TAIL CENSUS. Re-reads the live catalog; raises on any finding rather than trusting §A/§B
-- ran as written. No new grant is asserted here because none was made -- see the header's "why no
-- new function and no new grant".
-- =================================================================================================
do $w872_tail$
declare v_viewdef text; v_src text; v_n int; v_cols text; v_posture text; v_accept_sha text; r text; v_relopts text[];
begin
  if to_regclass('clara.firm_invites_visible') is null then
    raise exception '#872 tail: clara.firm_invites_visible does not resolve' using errcode='CLR10';
  end if;
  if to_regprocedure('clara.preview_invite(text)') is null then
    raise exception '#872 tail: clara.preview_invite(text) does not resolve' using errcode='CLR10';
  end if;

  select pg_get_viewdef('clara.firm_invites_visible'::regclass, true) into v_viewdef;
  select p.prosrc into v_src from pg_proc p where p.oid = 'clara.preview_invite(text)'::regprocedure;
  -- pg_get_viewdef RE-RENDERS the view from its parsed tree: it appends `::text` to every text
  -- literal (including a role-name ARGUMENT like `'admin'`), which `prosrc` (the author's own
  -- bytes) never does. Stripped here, once, exactly as 0224 §C(T.5) already established for this
  -- same view, so every token check below is comparing MEANING, not one deparser's spelling.
  v_viewdef := replace(v_viewdef, '::text', '');

  -- (T.1) BOTH bodies now name issuer_lapsed, EXACTLY ONCE each -- two would mean two observable
  -- shapes, the same "exactly one" discipline 0224 §C(T.3) applied to its own refusal string.
  v_n := (length(v_viewdef) - length(replace(v_viewdef, 'issuer_lapsed', ''))) / length('issuer_lapsed');
  if v_n <> 1 then
    raise exception '#872 tail: clara.firm_invites_visible names issuer_lapsed % times (want exactly 1)', v_n using errcode='CLR10';
  end if;
  v_n := (length(v_src) - length(replace(v_src, 'issuer_lapsed', ''))) / length('issuer_lapsed');
  if v_n <> 1 then
    raise exception '#872 tail: clara.preview_invite names issuer_lapsed % times (want exactly 1)', v_n using errcode='CLR10';
  end if;

  -- (T.2) BOTH bodies read the ISSUER's CURRENT ACTIVE membership rank against role_rank('admin')
  -- -- the shared fact, checked as independent tokens (format-insensitive: this survives
  -- pg_get_viewdef's own reformatting of the view, whatever it chooses to do with parens,
  -- whitespace or alias qualifiers).
  foreach r in array array['firm_memberships', 'role_rank(''admin'')'] loop
    if position(r in lower(v_viewdef)) = 0 then
      raise exception '#872 tail: clara.firm_invites_visible is missing "%" in its recut status expression', r using errcode='CLR10';
    end if;
    if position(r in lower(v_src)) = 0 then
      raise exception '#872 tail: clara.preview_invite is missing "%" in its recut status expression', r using errcode='CLR10';
    end if;
  end loop;
  -- The membership must be ACTIVE and the fail-closed floor must still be -1, in BOTH bodies.
  foreach r in array array['status = ''active''', 'coalesce('] loop
    if position(r in lower(v_viewdef)) = 0 then
      raise exception '#872 tail: clara.firm_invites_visible is missing "%"', r using errcode='CLR10';
    end if;
    if position(r in lower(v_src)) = 0 then
      raise exception '#872 tail: clara.preview_invite is missing "%"', r using errcode='CLR10';
    end if;
  end loop;

  -- (T.3) THE `expired` ARM IS UNTOUCHED, character for character, in preview_invite's own
  -- source -- 0224's original text, unmoved.
  if position('when i.status = ''pending'' and i.expires_at <= now() then ''expired''' in v_src) = 0 then
    raise exception '#872 tail: clara.preview_invite''s expired arm has moved -- 0224''s own text must survive byte for byte' using errcode='CLR10';
  end if;

  -- (T.4) THE OUTPUT SHAPE IS STILL CLOSED -- 0224's own T.2, re-read: four keys, neither a
  -- token nor the unmasked address.
  v_n := position('return jsonb_build_object(' in v_src);
  if v_n = 0 then
    raise exception '#872 tail: clara.preview_invite no longer returns a jsonb_build_object' using errcode='CLR10';
  end if;
  if position('token' in substr(v_src, v_n)) <> 0 then
    raise exception '#872 tail: the returned object names a token' using errcode='CLR10';
  end if;
  if position('inv.email' in substr(v_src, v_n)) <> 0 then
    raise exception '#872 tail: the returned object carries the UNMASKED address' using errcode='CLR10';
  end if;

  -- (T.5) THE DOOR IS STILL A READ. No write verb, no row lock of any kind, no op reservation --
  -- 0224's own T.4, re-read after the recut.
  foreach r in array array['insert into','update clara','delete from','for update','for share','for key share',
                           '_reserve_op','_finish_op','_audit','_append_event'] loop
    if position(r in v_src) <> 0 then
      raise exception '#872 tail: clara.preview_invite carries "%" -- a preview is a read', r using errcode='CLR10';
    end if;
  end loop;

  -- (T.6) THE POSTURE AND ACL ARE PRESERVED ACROSS THE RECUT -- CREATE OR REPLACE FUNCTION keeps
  -- the existing grant matrix; this proves it rather than assumes it (0224 §C(T.1)'s own exact
  -- ACL text, grantor included).
  select pg_get_userbyid(p.proowner) || ' | ' || p.prosecdef::text || ' | '
         || coalesce(array_to_string(p.proconfig, ','), '<none>') || ' | '
         || coalesce(array_to_string(p.proacl, ','), '<null>')
    into v_posture from pg_proc p where p.oid = 'clara.preview_invite(text)'::regprocedure;
  if v_posture is distinct from
     'clara_fn_owner | true | search_path=clara, pg_temp | clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner' then
    raise exception '#872 tail: clara.preview_invite''s posture or ACL moved across the recut -- got {%}', v_posture using errcode='CLR10';
  end if;

  -- (T.7) THE VIEW'S OWN POSTURE AND COLUMN CENSUS ARE UNMOVED: security_barrier, ten columns,
  -- same names and order (0141's own ten-column contract, re-read).
  select reloptions into v_relopts from pg_class where oid = 'clara.firm_invites_visible'::regclass;
  if not (v_relopts @> array['security_barrier=true']) then
    raise exception '#872 tail: clara.firm_invites_visible lost security_barrier' using errcode='CLR10';
  end if;
  select string_agg(column_name, ',' order by ordinal_position) into v_cols
    from information_schema.columns where table_schema='clara' and table_name='firm_invites_visible';
  if v_cols is distinct from 'id,firm_id,email,role,status,invited_by,created_at,expires_at,accepted_at,revoked_at' then
    raise exception '#872 tail: clara.firm_invites_visible is no longer 0141''s ten-column projection -- got %', v_cols using errcode='CLR10';
  end if;

  -- (T.8) 0141 §B IS STILL UNTOUCHED: zero application-role privilege on the base table, and
  -- FORCE RLS still stands -- the same census 0224 §C(T.6) ran, re-read after this recut too.
  select count(*)::int into v_n from information_schema.role_table_grants
   where table_schema='clara' and table_name='firm_invites'
     and grantee in ('clara_authenticated','clara_runtime','clara_agent_ro',
                     'clara_wake_interactive','clara_wake_proactive','PUBLIC');
  if v_n <> 0 then
    raise exception '#872 tail: clara.firm_invites gained % application-role grant(s)', v_n using errcode='CLR10';
  end if;
  if not (select relrowsecurity and relforcerowsecurity from pg_class where oid='clara.firm_invites'::regclass) then
    raise exception '#872 tail: clara.firm_invites lost FORCE RLS' using errcode='CLR10';
  end if;

  -- (T.9) NO NEW GRANT AND NO NEW FUNCTION. The header's "why no new function and no new grant"
  -- is checked here, not merely argued: `_invite_issuer_rank` (the rejected design) must not
  -- exist, and `clara.firm_memberships`'s OWN grant matrix is byte-identical to the pin the
  -- prestate measured -- neither §A nor §B contains a GRANT or REVOKE, so this cannot have moved.
  if to_regprocedure('clara._invite_issuer_rank(uuid,uuid)') is not null then
    raise exception '#872 tail: clara._invite_issuer_rank exists -- the header says this file uses a correlated subquery instead, not a standalone helper' using errcode='CLR10';
  end if;
  select coalesce(string_agg(grantee || ':' || privilege_type, ',' order by grantee, privilege_type), '') into v_cols
    from information_schema.role_table_grants
   where table_schema='clara' and table_name='firm_memberships'
     and grantee in ('clara_authenticated','clara_runtime','clara_agent_ro',
                     'clara_wake_interactive','clara_wake_proactive','PUBLIC');
  if v_cols is distinct from 'clara_agent_ro:SELECT,clara_authenticated:SELECT' then
    raise exception '#872 tail: clara.firm_memberships'' application-role grant matrix MOVED while this file applied -- got %', v_cols using errcode='CLR10';
  end if;

  -- (T.10) ACCEPT_INVITE IS BYTE-IDENTICAL TO ITS PINNED PRE-IMAGE -- the owner ruling's "the
  -- accept door is unchanged", checked rather than assumed.
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_accept_sha
    from pg_proc p where p.oid = 'clara.accept_invite(text,text,text)'::regprocedure;
  if v_accept_sha is distinct from '42a153231c724aaace9fb9dae7abe3551667c6669e7dacd1d5495b35c31aeef2' then
    raise exception '#872 tail: clara.accept_invite MOVED while this file applied -- it must not have' using errcode='CLR10';
  end if;

  raise notice '#872 tail: OK -- clara.firm_invites_visible and clara.preview_invite both name issuer_lapsed exactly once, both read the issuer''s CURRENT active clara.firm_memberships rank against role_rank(''admin'') with the same fail-closed coalesce(..., -1) floor, the expired arm and the four-key output shape and the no-write/no-lock discipline are unmoved, the view''s security_barrier/ten-column contract and the function''s owner/SECURITY DEFINER/search_path/ACL are preserved across the recut, 0141 §B (zero application-role grant + FORCE RLS on clara.firm_invites) is untouched, no clara._invite_issuer_rank helper and no new grant on clara.firm_memberships were introduced, and clara.accept_invite is byte-identical to its pinned pre-image.';
end
$w872_tail$;
