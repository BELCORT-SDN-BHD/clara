-- 0206_operator_support_applicant_name — #776:
-- THE OPERATOR SUPPORT CONSOLE GAINS A LAWFUL WAY TO SHOW THE APPLICANT'S NAME.
-- =====================================================================================
-- Spec of record: issue #776 and the Agent Brief in its triage comment. Domain words: CONTEXT.md.
-- docs/ARCHITECTURE.md §2 (the admission-and-operator-support anchor) records the closed gap.
--
-- WHAT THIS FILE ADDS, IN ONE SENTENCE. ONE new read —
-- `clara.resolve_operator_support_applicants(uuid[])` — that turns the applicant ids an operator
-- already holds on their support queue into `clara.users.display_name`, for the OPERATOR FIRM'S
-- OWNER and nobody else.
--
-- WHY NOT `clara.users_visible`. That view admits the global agent identity or a target holding a
-- `clara.firm_memberships` row (any status, removed included) in the CALLER's own firm. An
-- unapproved applicant holds no membership anywhere, so the same-firm requirement structurally
-- cannot serve this surface — and RELAXING it would widen a view every firm reads. The answer is a
-- NARROWER door, not a wider view: `clara.users_visible` is not extended, not reused, and not
-- named anywhere below.
--
-- WHY IT IS NOT A USER-EXISTENCE ORACLE. The read is SCOPED TO THE APPLICANTS OF SUPPORT CASES: an
-- id resolves only if it is `clara.firm_registration_requests.applicant` (the registration and
-- payment arms — a payment's applicant is its registration's) or `clara.stripe_events.applicant`
-- (the problem arm). A uuid that is a real `clara.users` row but is nobody's support applicant
-- answers EXACTLY the way an unknown uuid does: with no row at all. That equality is the whole
-- privacy claim, and `packages/db/tests/operator-support.test.mjs` os.17 asserts it against a
-- positive control (the operator's own, genuinely existing, user row).
--
-- WHY display_name AND NOT email. 0137 deliberately projected id + display_name and recorded that
-- "a name-resolution need never justifies an email read". `clara.users.display_name` is NOT NULL,
-- so a resolvable user always has a name and there is no absence for an email to fill. The ticket
-- permits email; this file declines it on purpose rather than by omission.
--
-- WHAT AN UNRESOLVABLE APPLICANT LOOKS LIKE, AND WHY IT IS AN ABSENCE RATHER THAN A ROW. Two
-- shapes exist and both are ordinary: a NULL applicant (a `metadata_missing` problem has none) and
-- an id naming no `clara.users` row (`clara.stripe_events.applicant` is provider metadata with no
-- foreign key). Neither is an error and neither answers with a null-named row — they are simply
-- ABSENT from the result, so the console keeps the honest truncated-id display it has today
-- instead of painting a blank where a name would be.
--
-- =====================================================================================
-- EVERY (errcode, detail.reason) PAIR THIS FILE RAISES AT RUNTIME:
--
-- clara.resolve_operator_support_applicants                  (operator-firm owner)
--   CLR04 (from clara._human_ctx)                 — no authenticated actor / no active membership
--                                                   / below the owner floor
--   CLR04 detail.reason = 'not_operator_firm'     — an owner of a firm that is not the operator's
--
-- AND NOTHING ELSE. In particular an empty answer is never a refusal and a refusal is never an
-- empty answer: a caller who may not ask is refused outright — the same posture
-- `clara.list_operator_support_queue` takes — so "there is no name" and "you were not allowed to
-- ask" can never be confused by the surface above.
--
-- ROLLBACK is a NEW append-only migration. An applied migration is never edited or deleted.
-- =====================================================================================

set local statement_timeout = '5min';   -- runner rule: the first executable statement

-- =====================================================================================
-- §0 PRESTATE.
-- =====================================================================================
do $w776_pre$
declare n text; v_src text; v_frag_norm constant text :=
  regexp_replace(lower($q$exists (select 1 from clara.firms f where f.id = clara.jwt_firm() and f.is_operator)$q$), '\s+', '', 'g');
begin
  -- 0.1 · the prerequisites this door calls and the REFERENCE body it copies its authority from.
  foreach n in array array[
    'clara._human_ctx(integer)',
    'clara.role_rank(text)',
    'clara.jwt_firm()',
    'clara.approve_firm_registration(uuid,text)',
    'clara.list_operator_support_queue(boolean)'
  ] loop
    if to_regprocedure(n) is null then
      raise exception '#776 prestate: prerequisite absent: % (migration 0145/0188 has not been applied)', n
        using errcode='CLR10';
    end if;
  end loop;

  -- 0.2 · the three relations the scope predicate and the projection read.
  foreach n in array array['clara.users', 'clara.firm_registration_requests', 'clara.stripe_events'] loop
    if to_regclass(n) is null then
      raise exception '#776 prestate: relation absent: %', n using errcode='CLR10';
    end if;
  end loop;
  if not exists (select 1 from information_schema.columns
      where table_schema='clara' and table_name='users' and column_name='display_name'
        and is_nullable='NO') then
    raise exception '#776 prestate: clara.users.display_name is absent or nullable -- this file''s claim that a resolvable user always has a name would be false'
      using errcode='CLR10';
  end if;
  if not exists (select 1 from information_schema.columns
      where table_schema='clara' and table_name='stripe_events' and column_name='applicant') then
    raise exception '#776 prestate: clara.stripe_events.applicant is absent' using errcode='CLR10';
  end if;
  if not exists (select 1 from information_schema.columns
      where table_schema='clara' and table_name='firm_registration_requests' and column_name='applicant') then
    raise exception '#776 prestate: clara.firm_registration_requests.applicant is absent' using errcode='CLR10';
  end if;

  -- 0.3 · the NAME IS FREE. A same-named body already present would mean this file is silently
  -- recutting somebody else's door rather than adding one.
  if exists (select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
              where ns.nspname='clara' and p.proname='resolve_operator_support_applicants') then
    raise exception '#776 prestate: clara.resolve_operator_support_applicants already exists'
      using errcode='CLR10';
  end if;

  -- 0.4 · THE AUTHORITY FRAGMENT THIS FILE BYTE-COPIES still lives in the reference body. A copy
  -- of a fragment that has moved is a re-derived predicate wearing a copied predicate's clothes.
  select regexp_replace(
           regexp_replace(
             regexp_replace(lower(p.prosrc), '/\*.*?\*/', '', 'gs'), '--[^\n]*', '', 'g'),
           '\s+', '', 'g')
    into v_src from pg_proc p
   where p.oid = 'clara.approve_firm_registration(uuid,text)'::regprocedure;
  if position(v_frag_norm in v_src) = 0 then
    raise exception '#776 prestate: the REFERENCE body (approve_firm_registration) no longer carries the operator-authority fragment this file copies'
      using errcode='CLR10';
  end if;

  -- 0.5 · RECORD clara.users's table ACL so the tail can prove this file did not move it. 0137
  -- named the pre-existing base-table grant and its p_users_human policy as a flagged tension owned
  -- by a different, larger change; this file must leave both exactly where it found them.
  perform set_config('clara.x776_users_acl',
    coalesce((select array_to_string(c.relacl, ' | ') from pg_class c
               where c.oid = 'clara.users'::regclass), '(null)'), false);
  perform set_config('clara.x776_users_policies',
    coalesce((select string_agg(polname, ', ' order by polname) from pg_policy
               where polrelid = 'clara.users'::regclass), '(none)'), false);

  raise notice '#776 prestate: clean -- the operator-authority reference body and the support queue both resolve, clara.users.display_name is NOT NULL, both applicant columns exist, no clara.resolve_operator_support_applicants name is taken, and clara.users''s ACL and policy roster are recorded for the tail.';
end
$w776_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §1 THE DOOR.
--
-- SET-SHAPED ON PURPOSE. The console reads a PAGE of support cases and needs every name on it; a
-- one-id-per-call door would turn one screen into twenty round trips, and a door that took no
-- argument at all would be an estate-wide roster of every applicant who ever registered. An array
-- of the ids the caller already holds is the narrowest shape that serves the surface.
--
-- THE SCOPE PREDICATE IS THE PRIVACY CLAIM, not a convenience filter: `u.id` must be some support
-- case's applicant. The two `exists` arms are the two origins the three arms actually have —
-- `clara.firm_registration_requests.applicant` (NOT NULL, FK to clara.users) for the registration
-- and payment arms, and `clara.stripe_events.applicant` (nullable provider metadata, no FK) for
-- the problem arm. `clara.firm_registration_payments` needs no arm of its own: a payment's
-- applicant is its registration's, and 0188 arm 2 joins the two.
--
-- NO `clara.users_visible`, NO `clara.firm_memberships`, NO EMAIL — see the header.
-- =====================================================================================
create function clara.resolve_operator_support_applicants(
  p_applicants uuid[]
) returns table(
  applicant    uuid,
  display_name text
)
  language plpgsql stable security definer
  set search_path = clara, pg_temp
  set plan_cache_mode = force_custom_plan
  as $$
begin
  perform clara._human_ctx(clara.role_rank('owner'));
  if not exists (select 1 from clara.firms f where f.id = clara.jwt_firm() and f.is_operator) then
    raise exception 'insufficient role' using errcode = 'CLR04', detail = '{"reason":"not_operator_firm"}';
  end if;

  -- `coalesce(..., '{}')` so a NULL array is an EMPTY ANSWER rather than an error: the console
  -- calls this with whatever its rows carry, and a page of cases whose applicants are all null is
  -- an ordinary page. A NULL ELEMENT inside the array matches nothing, for the same reason.
  return query
  select u.id, u.display_name
    from clara.users u
   where u.id = any (coalesce(p_applicants, '{}'::uuid[]))
     and (exists (select 1 from clara.firm_registration_requests r where r.applicant = u.id)
       or exists (select 1 from clara.stripe_events e where e.applicant = u.id));
end $$;

revoke all on function clara.resolve_operator_support_applicants(uuid[]) from public;
grant execute on function clara.resolve_operator_support_applicants(uuid[]) to clara_authenticated;

comment on function clara.resolve_operator_support_applicants(uuid[]) is
  '#776: resolve the applicant ids on an operator support case to clara.users.display_name. OWNER '
  'of the OPERATOR firm only -- clara.approve_firm_registration''s own predicate, byte-copied and '
  're-derived at call time; a caller below that floor is refused CLR04 / '
  'detail.reason not_operator_firm, never handed an empty list. SCOPED to the applicants of '
  'support cases (clara.firm_registration_requests.applicant or clara.stripe_events.applicant), so '
  'it is no existence oracle over clara.users: a real user who is nobody''s support applicant '
  'answers exactly like an unknown id. THE SCOPE IS STATED EXACTLY, because it is slightly WIDER '
  'than the live queue''s own arms: it resolves anyone who has EVER been an applicant of a '
  'registration request or of a Stripe event -- including an already-decided registration, which '
  'clara._operator_support_cases'' arm 1 (undecided + no payment row) no longer surfaces. That is '
  'deliberate and acceptable: the queue''s arms are a MOVING predicate (a decision, a payment, a '
  'resolved provider problem each remove a case from it) while a name lookup must stay answerable '
  'for the case sheet an operator still has open, and re-deriving the arms here would couple this '
  'read to every future change of them. The residual disclosure is bounded on three sides -- the '
  'CLR04 operator-firm OWNER floor gates every call, the answer is display_name alone (no email, '
  'no firm, no state), and the caller must already hold the uuid. So the widening cannot turn a '
  'guessed uuid into an existence signal about an ordinary user; it can only confirm that a uuid '
  'the operator already has once appeared on the registration or provider lane. A null or '
  'unresolvable id is ABSENT from the result, never '
  'a null-named row. Projects display_name and NOT email (0137''s ruling stands). Does not read, '
  'extend or reuse clara.users_visible. Its ONE web lane is apps/web/lib/operator/reads.ts.';

reset role;

-- =====================================================================================
-- §T FAIL-CLOSED TAIL. Re-reads the LIVE catalog and raises on any finding.
-- =====================================================================================
do $w776_tail$
declare
  v_sig constant text := 'clara.resolve_operator_support_applicants(uuid[])';
  v_bad text;
  v_n integer;
  v_strip text;
  v_frag constant text := $q$exists (select 1 from clara.firms f where f.id = clara.jwt_firm() and f.is_operator)$q$;
  v_frag_norm constant text := regexp_replace(lower(v_frag), '\s+', '', 'g');
  v_rank_frag_norm constant text := regexp_replace(lower($q$clara.role_rank('owner'$q$), '\s+', '', 'g');
  v_rank_count integer;
  v_relation text;
  v_books text[] := array['clara.clients', 'clara.documents', 'clara.journal_entries',
                          'clara.journal_lines', 'clara.accounting_work', 'clara.operation_receipts',
                          'clara.agent_receipts', 'clara.wiki_pages', 'clara.client_facts',
                          'clara.domain_events'];
begin
  -- (1) EXACTLY ONE body, at the EXACT signature. A bare-name lookup would be satisfied by an
  --     overload while every caller bound to something else.
  select count(*)::int into v_n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname='clara' and p.proname='resolve_operator_support_applicants';
  if v_n <> 1 then
    raise exception '#776 tail: clara.resolve_operator_support_applicants has % bodies (expected exactly 1)', v_n
      using errcode='CLR10';
  end if;
  if to_regprocedure(v_sig) is null then
    raise exception '#776 tail: % does not resolve', v_sig using errcode='CLR10';
  end if;

  -- (2) POSTURE, read from the catalog: owner, SECURITY DEFINER, STABLE, both proconfig pins.
  --     Whitespace-insensitive, because PostgreSQL NORMALIZES a GUC list when it stores it.
  select case when not p.prosecdef then 'not SECURITY DEFINER'
              when pg_get_userbyid(p.proowner) <> 'clara_fn_owner'
                then 'owned by ' || pg_get_userbyid(p.proowner)
              when p.provolatile <> 's' then 'not STABLE (provolatile ' || p.provolatile::text || ')'
              when replace(coalesce(array_to_string(p.proconfig, ','), ''), ' ', '')
                     not like '%search_path=clara,pg_temp%' then 'search_path is not pinned'
              when replace(coalesce(array_to_string(p.proconfig, ','), ''), ' ', '')
                     not like '%plan_cache_mode=force_custom_plan%'
                then 'plan_cache_mode is not pinned (0183)'
              else null end
    into v_bad from pg_proc p where p.oid = v_sig::regprocedure;
  if v_bad is not null then
    raise exception '#776 tail: % is %', v_sig, v_bad using errcode='CLR10';
  end if;

  -- (3) THE EXACT ACL, grantor included -- not a roster sweep, which cannot see a grant to a role
  --     outside the `clara\_%` namespace. A NULL proacl (the create default, where PUBLIC holds
  --     EXECUTE implicitly) fails this too, which is the point.
  select coalesce(array_to_string(p.proacl, ' | '), '(null)') into v_bad
    from pg_proc p where p.oid = v_sig::regprocedure;
  if v_bad is distinct from 'clara_fn_owner=X/clara_fn_owner | clara_authenticated=X/clara_fn_owner' then
    raise exception '#776 tail: the EXECUTE ACL is not exactly what this file granted: %', v_bad
      using errcode='CLR10';
  end if;
  if has_function_privilege('public', v_sig::regprocedure, 'execute') then
    raise exception '#776 tail: PUBLIC still holds EXECUTE on %', v_sig using errcode='CLR10';
  end if;
  select string_agg(r.rolname, ', ' order by r.rolname) into v_bad
    from pg_roles r
   where r.rolname like 'clara\_%' and r.rolname not in ('clara_fn_owner', 'clara_authenticated')
     and has_function_privilege(r.rolname, v_sig::regprocedure, 'execute');
  if v_bad is not null then
    raise exception '#776 tail: a non-human role reaches the name door: %', v_bad using errcode='CLR10';
  end if;

  select regexp_replace(
           regexp_replace(
             regexp_replace(lower(p.prosrc), '/\*.*?\*/', '', 'gs'), '--[^\n]*', '', 'g'),
           '\s+', '', 'g')
    into v_strip from pg_proc p where p.oid = v_sig::regprocedure;

  -- (4) THE BYTE-COPIED AUTHORITY, with the owner-rank floor stated EXACTLY once (0145 §K (8b)'s
  --     own round-3 correction: a presence-only check stays green while a second, decorative
  --     occurrence masks a downgrade of the real one).
  if position(v_frag_norm in v_strip) = 0 then
    raise exception '#776 tail: the name door does not carry the byte-copied operator-authority fragment'
      using errcode='CLR10';
  end if;
  v_rank_count := (length(v_strip) - length(replace(v_strip, v_rank_frag_norm, '')))
                  / length(v_rank_frag_norm);
  if v_rank_count <> 1 then
    raise exception '#776 tail: the owner-rank floor occurs % time(s), expected exactly 1', v_rank_count
      using errcode='CLR10';
  end if;
  if position('not_operator_firm' in v_strip) = 0 then
    raise exception '#776 tail: the name door does not carry the not_operator_firm detail reason'
      using errcode='CLR10';
  end if;

  -- (5) THE SCOPE PREDICATE AND THE PROJECTION, measured in the committed text. Both `exists` arms
  --     must be there: with either one missing this door still answers, and still answers
  --     plausibly, for a NARROWER or WIDER set than the console's cases -- a silent change to the
  --     privacy claim that no positive assertion about a resolvable name would notice.
  if position('r.applicant=u.id' in v_strip) = 0 or position('e.applicant=u.id' in v_strip) = 0 then
    raise exception '#776 tail: the scope predicate no longer joins BOTH clara.firm_registration_requests.applicant and clara.stripe_events.applicant'
      using errcode='CLR10';
  end if;
  if position('u.display_name' in v_strip) = 0 then
    raise exception '#776 tail: the projection no longer reads clara.users.display_name' using errcode='CLR10';
  end if;
  -- …AND NO EMAIL, NO users_visible, NO membership read. Three literal probes, because each is a
  -- different widening and each would pass every behavioural cell about a resolvable name.
  if position('u.email' in v_strip) > 0 or position('.email' in v_strip) > 0 then
    raise exception '#776 tail: the name door reads an email column -- 0137''s ruling is that a name-resolution need never justifies an email read'
      using errcode='CLR10';
  end if;
  if position('users_visible' in v_strip) > 0 then
    raise exception '#776 tail: the name door reads clara.users_visible -- this read is deliberately narrower than that view'
      using errcode='CLR10';
  end if;
  if position('firm_memberships' in v_strip) > 0 then
    raise exception '#776 tail: the name door reads clara.firm_memberships -- its scope is support cases, not memberships'
      using errcode='CLR10';
  end if;
  -- (6) NO FIRM BOOKS, NO DYNAMIC SQL -- the same two halves 0188 §5 (4) states for its own three
  --     bodies, applied to the surface that now sits beside them.
  foreach v_relation in array v_books loop
    if position(v_relation in v_strip) > 0 then
      raise exception '#776 tail: the name door names %, which is a firm''s books', v_relation
        using errcode='CLR10';
    end if;
  end loop;
  if position('execute' in v_strip) > 0 then
    raise exception '#776 tail: the name door builds dynamic SQL' using errcode='CLR10';
  end if;

  -- (7) NOTHING ELSE MOVED. clara.users keeps the table ACL and the policy roster the prestate
  --     block recorded a few statements ago -- a real before/after comparison across this one
  --     transaction, not a claim. 0137 owns that tension; this file must not touch it.
  select coalesce(array_to_string(c.relacl, ' | '), '(null)') into v_bad
    from pg_class c where c.oid = 'clara.users'::regclass;
  if v_bad is distinct from current_setting('clara.x776_users_acl', true) then
    raise exception '#776 tail: clara.users''s table ACL moved during this file (% -> %)',
      current_setting('clara.x776_users_acl', true), v_bad using errcode='CLR10';
  end if;
  select coalesce(string_agg(polname, ', ' order by polname), '(none)') into v_bad
    from pg_policy where polrelid = 'clara.users'::regclass;
  if v_bad is distinct from current_setting('clara.x776_users_policies', true) then
    raise exception '#776 tail: clara.users''s policy roster moved during this file (% -> %)',
      current_setting('clara.x776_users_policies', true), v_bad using errcode='CLR10';
  end if;
  select count(*) into v_n from pg_class c
   where c.oid = 'clara.users'::regclass and c.relrowsecurity and c.relforcerowsecurity;
  if v_n <> 1 then
    raise exception '#776 tail: clara.users no longer forces row level security' using errcode='CLR10';
  end if;
  -- …and the two 0188 doors are byte-untouched: this file is ADDITIVE, and reshaping a
  -- `returns table` would have needed a drop-and-recreate that moves the ACLs os.02 pins.
  foreach v_relation in array array['clara.list_operator_support_queue(boolean)',
                                    'clara.get_operator_support_case(text,text)'] loop
    if not exists (
      select 1 from pg_proc p
       where p.oid = v_relation::regprocedure
         and p.prosecdef and pg_get_userbyid(p.proowner) = 'clara_fn_owner'
         and has_function_privilege('clara_authenticated', p.oid, 'execute')
         and not has_function_privilege('public', p.oid, 'execute')
    ) then
      raise exception '#776 tail: % moved -- this file adds a door, it recuts none', v_relation
        using errcode='CLR10';
    end if;
  end loop;

  raise notice '#776 tail: OK -- clara.resolve_operator_support_applicants exists exactly once at (uuid[]), owned by clara_fn_owner, STABLE SECURITY DEFINER with search_path and plan_cache_mode pinned, PUBLIC-revoked and EXECUTE-reachable by clara_authenticated ALONE (no agent, runtime, wake or webhook role); it carries clara.approve_firm_registration''s operator-authority fragment byte-for-byte with the owner-rank floor stated exactly once and the not_operator_firm detail reason, so a caller below that floor is REFUSED rather than handed an empty list; its scope predicate still joins BOTH clara.firm_registration_requests.applicant and clara.stripe_events.applicant, so a real clara.users row that is nobody''s support applicant answers exactly like an unknown id; it projects display_name and reads no email column, no clara.users_visible, no clara.firm_memberships, no firm books and builds no dynamic SQL; and clara.users keeps the exact table ACL, policy roster and forced RLS it had before this file, with both 0188 doors untouched.';
end
$w776_tail$;
