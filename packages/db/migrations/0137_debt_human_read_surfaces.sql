-- Wave-F debt-clearing lane -- THREE ADDITIVE HUMAN READ SURFACES the 磨合 (frontend
-- integration) window found missing (PROGRESS.md's 磨合 lane row, "Backend gaps found and
-- honestly not-built"). Purely additive: zero live bodies replaced, D1 inventory EMPTY.
--
-- =====================================================================================
-- SS0 -- D1 WRITE-QUIESCE INVENTORY: **EMPTY**
-- =====================================================================================
-- Every relation created here is NEW. No function, trigger or policy this file installs
-- replaces a live body -- there is no ceremony, no quiesce window and no prosrc-SHA
-- prestate pin to take (the tail re-proves that as a census rather than this comment
-- asserting it).
--
-- =====================================================================================
-- WHAT THIS FILE DOES, AND THE IDIOM CHOSEN FOR EACH -- GROUNDED BEFORE BUILT
-- =====================================================================================
-- The estate has three read idioms: (i) a plain granted table + RLS policy
-- (`clara.client_facts`, 0055:461-467 -- no role-rank floor, a firm-scoped table's own RLS
-- IS the wall); (ii) a masked `_visible` view owned by `clara_fn_owner`, filtering rows (and
-- sometimes columns) in its own WHERE/SELECT rather than relying on the base table's RLS,
-- used whenever a role-RANK floor or a cross-table join is part of the visibility predicate
-- (`clara.agent_receipts_visible`, 0103:406-413; `clara.agent_tasks_visible`, 0006:684-694);
-- (iii) a SECURITY DEFINER read RPC returning a single row or a page
-- (`clara.get_open_question`/`clara.list_review_queue`, 0011:3596, 3748).
--
-- THIS FILE PICKS (ii) FOR ALL THREE SURFACES, and here is why, item by item.
--
-- (A) clara.firm_open_questions_visible / (B) clara.client_identifier_promotions_visible.
-- Both base tables (0103:559-596, 796-829) carry FORCED RLS with ONLY the owner policy
-- (0103:961-964) -- zero `clara_authenticated` grant, zero read RPC -- while their write
-- verbs (`resolve_firm_question`/`dismiss_firm_question`/`confirm_identifier_promotion`/
-- `decline_identifier_promotion`) ARE granted (0103:1046-1049). GROUNDING THE WHY, before
-- building anything: 0103's own remit statement (0103:945-947) says "`agent_receipts_visible`
-- is the single granted surface in this file" -- i.e. train pi built read access for item (A)
-- of its four limbs only; items (B) and (D) (the question carrier, the promotion card) got
-- write verbs and NO read surface, by SCOPE, not by a stated security wall. The design record
-- (`filing-and-interview-design.md` SS3.3 rider 4, SS3.4) is silent on a human list-read for
-- either table -- it specifies the write verbs and the receipts view only. PROGRESS.md's own
-- 磨合 lane row names both as "Backend gaps found and honestly not-built (Track-A debt,
-- pre-P6)" -- a gap, not a ruling. No deliberate wall found; proceeding to build.
--
-- Idiom (ii), not (i): a bare grant + firm-scoped RLS policy on the base table cannot express
-- the BOOKKEEPER+ floor its write verbs already enforce in-body via
-- `_human_ctx(role_rank('bookkeeper'))` -- Postgres RLS is per grantee ROLE, and the estate
-- has exactly one broad `clara_authenticated` role for every human, so a role-RANK floor
-- (a business-level value, not a Postgres role) has no precedent expressed directly in a base
-- table's RLS policy anywhere in this repo (grepped; zero hits). Every existing role-rank-
-- floored READ goes through either an RPC (`_human_ctx`) or a masked view
-- (`agent_receipts_visible`'s `coalesce(actor_role_rank(),-1) >= role_rank('bookkeeper')`,
-- 0103:410) -- a LIST read for a firm's inbox is the view shape, not the RPC shape, so this
-- file mirrors agent_receipts_visible's predicate rather than inventing a new one.
--
-- WHY ONE ARM, NOT agent_receipts_visible's TWO-CLOSED-ARM (`scope='firm'|'platform'`)
-- predicate. That shape exists because a receipt's `firm_id` is NULLABLE (a platform-scoped
-- act belongs to no firm, 0103:261) -- a bare `firm_id = jwt_firm()` would hide a firm=NULL
-- row from every firm, so R-L26 built two closed arms keyed on an explicit `scope` column.
-- Neither `firm_open_questions.firm_id` nor `client_identifier_promotions.firm_id` is
-- nullable (0103:561, 798) and neither table carries a `scope` column -- there is no
-- platform-scoped row to admit, so the two-arm machinery would be unused complexity solving
-- a problem these tables do not have. A single `firm_id = clara.jwt_firm()` arm is the
-- correct-strength predicate, not a narrowing.
--
-- COLUMN CENSUS, checked before deciding what to mask (task's own instruction). Neither
-- table's columns were built as agent-internal secrets the way a receipt's `model_snapshot`/
-- `gate_verdicts` might be: `firm_open_questions` carries no model/rationale column at all,
-- and `client_identifier_promotions.model` (provider/model/version) and `.rationale` are the
-- SAME kind of column the estate's OWN 19-column receipt contract exposes to bookkeeper+ by
-- design (0103:267-269, "the agent's stated reasoning for the act" -- ordinal 11, visible).
-- `client_identifier_promotions.value_normalized` is the actual proposed TIN/SSM/bank-account
-- VALUE -- sensitive, but the row's entire purpose is a human reviewing and confirming that
-- exact value before it is written as a real identifier (`confirm_identifier_promotion`,
-- 0103:866-904); a review card that hid the value under review would be useless, not safer.
-- Neither table has a masking need beyond the row-visibility floor, so both new views project
-- EVERY column, unchanged, in table order -- declared as a closed world below and tail-
-- censused.
--
-- (C) clara.users_visible -- the display-name read for journal_entries.maker_actor/
-- checker_actor and every other actor-id column with no NARROW human-lane way to resolve a
-- name. Census of clara.users' actual live columns (0002:191-197): id, display_name, email,
-- is_agent, created_at. MUST be a masked view (task's own instruction) exposing id + the name
-- column ONLY -- never email, never is_agent, never created_at.
--
-- CORRECTING AN EARLIER READ, TWICE, BOTH TIMES BY GOING BACK TO THE CATALOG RATHER THAN A
-- TEXT GREP (the estate's own spelling-is-not-identity law, applied to a grant rather than a
-- name). First pass: `clara.users` is NOT ungranted. `grant select on clara.users, clara.firms,
-- clara.firm_memberships, clara.audit_log to clara_authenticated;` (0002:534-536, plus a sibling
-- grant to clara_agent_ro at 0002:537-539) is a MULTI-RELATION grant statement whose object list
-- spans one line and whose `to clara_authenticated` clause sits on the next -- a single-line
-- text search for "clara.users" beside "to clara_authenticated" misses it, and this file's own
-- prestate/tail probes (`has_table_privilege`, re-derived from the catalog, not from grep) is
-- what actually caught the false premise: the FIRST candidate tail assertion below claimed the
-- base table carries no such grant, and the migration correctly REFUSED to apply, loudly, on a
-- database where it is measurably false. So: `p_users_human ... using (id = jwt_sub() or
-- shares_my_firm_human(id))` (0002:497-498) is LIVE, not dead code -- any `clara_authenticated`
-- caller can already `select * from clara.users` and get back EVERY column, including email,
-- for themselves or an ACTIVE firm-mate. That is a real, pre-existing, wider-than-necessary
-- surface (a name-resolution need never justifies an email read) -- but it is not this lane's
-- three-item remit to narrow an existing grant nobody asked this lane to touch, and doing so
-- blind could break an unknown consumer. This file's tail therefore proves clara.users' ACL is
-- BYTE-UNCHANGED by this migration (re-derived below), not that it is absent.
--
-- THE REAL, NARROWER GAP THIS VIEW CLOSES: the one global agent identity
-- (`clara.agent_user_id()`, 0002:334-335, seeded 0002:549-551 with `is_agent = true`) holds NO
-- `firm_memberships` row at all -- `shares_my_firm_human`/`shares_my_firm_wake` both resolve via
-- that table, so under the EXISTING base policy alone, NO firm's bookkeeper (nor the agent lane
-- itself) could ever resolve "Clara (agent)"'s name, which is exactly the actor on most
-- agent-authored journal entries. `clara.users_visible` admits `is_agent` as its own predicate
-- arm (a global identity is nobody's tenant secret) to close that gap, and projects id +
-- display_name ONLY so a name-resolution consumer is never handed email merely because it asked
-- for a name. The base `p_users_human`/`p_users_agent` policies and their pre-existing grants
-- are left byte-unmoved -- narrowing them is a different, larger change than this three-item
-- lane owns, named here as a flagged tension rather than silently worked around.
--
-- ROLE FLOOR for (C): NONE beyond `clara_authenticated` + the row predicate. Journal entries
-- themselves carry no role-rank floor on their own human read policy
-- (`p_journal_entries_human for all to clara_authenticated using (firm_id = jwt_firm())`,
-- 0003:509-515 loop) -- any authenticated firm member, viewer included, can already read the
-- raw maker_actor/checker_actor UUID on a row they can see, so gating the NAME resolution
-- behind a higher floor than the UUID it resolves would be strictly LESS visible information
-- behind a HIGHER wall, backwards from every other floor in this file.
--
-- MEMBERSHIP STATUS for (C): deliberately ANY status, not `status = 'active'` only. A journal
-- entry's maker_actor is permanently bound to whoever posted it (0003, immutable once
-- approved); a staff member who has since left the firm does not retroactively make their own
-- historical act unresolvable to a name the caller could already see via the raw UUID and the
-- existing (surviving) firm_memberships history row. Named here rather than left implicit.
--
-- =====================================================================================
-- SS1 -- PRESTATE. Fail-closed; an absent premise aborts the apply, loudly.
-- =====================================================================================
do $$
declare v_missing text; v_bad text;
begin
  -- (a) Nothing this file creates may already exist.
  select string_agg(t.n, ', ' order by t.n) into v_missing
    from (values ('firm_open_questions_visible'),
                 ('client_identifier_promotions_visible'),
                 ('users_visible')) t(n)
   where to_regclass('clara.'||t.n) is not null;
  if v_missing is not null then
    raise exception 'debt human-read-surfaces prestate: relation(s) already present: %', v_missing
      using errcode = 'CLR10';
  end if;

  -- (b) The premises this file builds on must be LIVE, each named individually.
  select string_agg(t.n, ', ' order by t.n) into v_missing
    from (values ('clara.jwt_firm()'), ('clara.actor_role_rank()'), ('clara.role_rank(text)')) t(n)
   where to_regprocedure(t.n) is null;
  if v_missing is not null then
    raise exception 'debt human-read-surfaces prestate: required live function(s) absent: %', v_missing
      using errcode = 'CLR10';
  end if;
  select string_agg(t.n, ', ' order by t.n) into v_missing
    from (values ('firm_open_questions'), ('client_identifier_promotions'),
                 ('users'), ('firm_memberships')) t(n)
   where to_regclass('clara.'||t.n) is null;
  if v_missing is not null then
    raise exception 'debt human-read-surfaces prestate: required live table(s) absent: %', v_missing
      using errcode = 'CLR10';
  end if;

  -- (c) The masked-`_visible`-view idiom this file copies must still be the estate's idiom:
  --     agent_receipts_visible is a VIEW owned by clara_fn_owner with ACL EXACTLY
  --     `clara_authenticated=r`. Copying a pattern that has moved is how a surface drifts.
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'clara' and c.relname = 'agent_receipts_visible' and c.relkind = 'v'
       and pg_get_userbyid(c.relowner) = 'clara_fn_owner'
       and has_table_privilege('clara_authenticated', c.oid, 'select')) then
    raise exception 'debt human-read-surfaces prestate: the masked-_visible-view idiom has moved on'
      using errcode = 'CLR10';
  end if;

  -- (d) Re-derive the exact live column shape of the three source tables/base table from the
  --     catalog -- never assumed from a migration's first CREATE (the estate's own spelling-
  --     is-not-identity law, AGENTS.md review law 3, applied to a column list rather than a
  --     name). A mismatch here means the view this file is about to create would silently
  --     mis-project.
  select string_agg(format('%s#%s expected %s found %s', k.tbl, k.ordinal, k.expect,
                            coalesce(a.attname, '(absent)')), '; ')
    into v_bad
    from (values
      ('firm_open_questions', 1,'id'),('firm_open_questions', 2,'firm_id'),
      ('firm_open_questions', 3,'document_id'),('firm_open_questions', 4,'kind'),
      ('firm_open_questions', 5,'question_text'),('firm_open_questions', 6,'candidates'),
      ('firm_open_questions', 7,'status'),('firm_open_questions', 8,'opened_by'),
      ('firm_open_questions', 9,'opened_at'),('firm_open_questions',10,'settled_by'),
      ('firm_open_questions',11,'settled_at'),('firm_open_questions',12,'settlement_text'),
      ('firm_open_questions',13,'named_client'),('firm_open_questions',14,'receipt_id'),
      ('client_identifier_promotions', 1,'id'),('client_identifier_promotions', 2,'firm_id'),
      ('client_identifier_promotions', 3,'client_id'),('client_identifier_promotions', 4,'kind'),
      ('client_identifier_promotions', 5,'value_normalized'),
      ('client_identifier_promotions', 6,'sightings'),('client_identifier_promotions', 7,'citations'),
      ('client_identifier_promotions', 8,'rationale'),('client_identifier_promotions', 9,'model'),
      ('client_identifier_promotions',10,'status'),('client_identifier_promotions',11,'proposed_by'),
      ('client_identifier_promotions',12,'proposed_at'),('client_identifier_promotions',13,'settled_by'),
      ('client_identifier_promotions',14,'settled_at'),('client_identifier_promotions',15,'identifier_id'),
      ('users',1,'id'),('users',2,'display_name'),('users',3,'email'),
      ('users',4,'is_agent'),('users',5,'created_at')
    ) as k(tbl, ordinal, expect)
    left join pg_attribute a
      on a.attrelid = ('clara.'||k.tbl)::regclass and a.attnum = k.ordinal and not a.attisdropped
   where a.attname is distinct from k.expect;
  if v_bad is not null then
    raise exception 'debt human-read-surfaces prestate: source table column shape has drifted: %', v_bad
      using errcode = 'CLR10';
  end if;

  raise notice 'debt human-read-surfaces prestate: clean -- 3 new relations absent, premises live, the masked-view idiom holds, source column shapes match';
end $$;

-- Stash clara.users' pre-existing ACL for a tail BYTE-COMPARISON. clara.users is NOT
-- ungranted (0002:534-539 grants clara_authenticated + clara_agent_ro select on it, in a
-- multi-relation statement this file's own header explains missing an earlier text-grep) and
-- this file must not touch that grant (out of this lane's three-item remit, see header item
-- C). The claim is "unchanged", so comparing post against pre states exactly that -- a DO
-- block's variables do not survive to a LATER do-block in the same file, so the estate's own
-- cross-block prestate/tail idiom (0047/0048/0049) is a `create temp table ... on commit
-- drop` capture, not a declared variable.
create temp table _debt_hrs_pre_acl(relname text primary key, acl text not null) on commit drop;
insert into _debt_hrs_pre_acl(relname, acl)
  select 'users', coalesce((select relacl::text from pg_class where oid = 'clara.users'::regclass), '(null)');

set role clara_fn_owner;

-- =====================================================================================
-- SS2 -- (A) THE FIRM QUESTIONS INBOX READ SURFACE
-- =====================================================================================
-- Owned by clara_fn_owner: the base table is FORCED RLS with only the owner policy
-- (0103:952-953, 961-962), so this view -- running as its owner -- reads every firm's rows
-- and does its OWN firm-scoping + role-floor filtering below, exactly as
-- agent_receipts_visible does over its own base relations. Every column, unchanged: the
-- header above states why nothing here needs masking.
create view clara.firm_open_questions_visible as
  select q.id, q.firm_id, q.document_id, q.kind, q.question_text, q.candidates, q.status,
         q.opened_by, q.opened_at, q.settled_by, q.settled_at, q.settlement_text,
         q.named_client, q.receipt_id
    from clara.firm_open_questions q
   where q.firm_id = clara.jwt_firm()
     and coalesce(clara.actor_role_rank(), -1) >= clara.role_rank('bookkeeper');
comment on view clara.firm_open_questions_visible is
  'Debt-clearing lane: the bookkeeper+ human read surface over clara.firm_open_questions '
  '(0103 shipped the write verbs, resolve_firm_question/dismiss_firm_question, but no read '
  'surface -- a gap, not a wall, per this file''s header). Single-arm firm_id predicate: '
  'firm_id is NOT NULL on this table, so R-L26''s two-closed-arm scope machinery does not '
  'apply here. Every base column is projected, unmasked -- none of them are agent-internal '
  'secrets (see header).';

-- =====================================================================================
-- SS3 -- (B) THE IDENTIFIER PROMOTION CARD READ SURFACE
-- =====================================================================================
create view clara.client_identifier_promotions_visible as
  select p.id, p.firm_id, p.client_id, p.kind, p.value_normalized, p.sightings, p.citations,
         p.rationale, p.model, p.status, p.proposed_by, p.proposed_at, p.settled_by,
         p.settled_at, p.identifier_id
    from clara.client_identifier_promotions p
   where p.firm_id = clara.jwt_firm()
     and coalesce(clara.actor_role_rank(), -1) >= clara.role_rank('bookkeeper');
comment on view clara.client_identifier_promotions_visible is
  'Debt-clearing lane: the bookkeeper+ human read surface over clara.client_identifier_promotions '
  '(0103 shipped confirm_identifier_promotion/decline_identifier_promotion, but no read surface). '
  'Single-arm firm_id predicate (no scope column, firm_id NOT NULL). value_normalized (the '
  'proposed TIN/SSM/bank-account value under review) and model/rationale (the same kind of '
  'attribution the estate''s own 19-column receipt contract already exposes to bookkeeper+) are '
  'projected UNMASKED -- see this file''s header for why hiding either would defeat the review '
  'the card exists for.';

-- =====================================================================================
-- SS4 -- (C) THE USER DISPLAY-NAME READ SURFACE
-- =====================================================================================
-- id + display_name ONLY -- never email, is_agent or created_at (task's own MINIMUM
-- instruction). Visible when the target is the one global agent identity (nobody's tenant
-- secret -- closes the measured gap in the base p_users_human policy's predicate, see
-- header) OR the target has ANY firm_memberships row (any status; see header) in the
-- caller's own firm. No role-rank floor: journal_entries' own human read policy carries none
-- (0003:509-515), and the raw actor UUID this view resolves is already visible at that floor.
create view clara.users_visible as
  select u.id, u.display_name
    from clara.users u
   where u.is_agent
      or exists (
           select 1 from clara.firm_memberships fm
            where fm.user_id = u.id and fm.firm_id = clara.jwt_firm()
         );
comment on view clara.users_visible is
  'Debt-clearing lane: the minimum human-lane display-name read for an actor-id column '
  '(journal_entries.maker_actor/checker_actor and similar) -- id + display_name ONLY, never '
  'email/is_agent/created_at. Visible: the global agent identity to every firm, or a user '
  'sharing (in ANY membership status, including removed) the caller''s own current firm.';

reset role;

-- =====================================================================================
-- SS5 -- ACL. Plain grant, mirroring agent_receipts_visible's own ACL comment (0103:990-1029):
-- the ungrant/grant boundary IS the wall for a masked view running at owner semantics: a
-- future accidental grant on the BASE tables (still owner-only, unchanged by this file) would
-- reopen the same hole these views close by construction.
-- =====================================================================================
grant select on clara.firm_open_questions_visible          to clara_authenticated;
grant select on clara.client_identifier_promotions_visible to clara_authenticated;
grant select on clara.users_visible                         to clara_authenticated;

-- =====================================================================================
-- SS6 -- TAIL SELF-PROOF. Raises on failure; every claim is re-READ from the catalog.
-- =====================================================================================
do $$
declare v_bad text; v_n int;
begin
  -- (1) All three views exist, are owned by clara_fn_owner, and carry ACL EXACTLY
  --     {clara_authenticated=r} -- no PUBLIC, no agent/wake/runtime role.
  select string_agg(x.relname || ': ' || x.problem, '; ') into v_bad
    from (
      select c.relname,
             case
               when c.relkind <> 'v' then 'not a view (relkind=' || c.relkind::text || ')'
               when pg_get_userbyid(c.relowner) <> 'clara_fn_owner' then 'owner=' || pg_get_userbyid(c.relowner)
               when not has_table_privilege('clara_authenticated', c.oid, 'select') then 'clara_authenticated cannot SELECT'
               when has_table_privilege('clara_agent_ro', c.oid, 'select') then 'clara_agent_ro CAN SELECT (leak)'
               when has_table_privilege('clara_wake_interactive', c.oid, 'select') then 'clara_wake_interactive CAN SELECT (leak)'
               when has_table_privilege('clara_wake_proactive', c.oid, 'select') then 'clara_wake_proactive CAN SELECT (leak)'
               when has_table_privilege('clara_runtime', c.oid, 'select') then 'clara_runtime CAN SELECT (leak)'
               when exists (select 1 from unnest(coalesce(c.relacl, '{}'::aclitem[])) a
                             where coalesce(nullif(split_part(a::text, '=', 1), ''), 'PUBLIC')
                                   not in ('clara_fn_owner', 'clara_authenticated'))
                 then 'non-owner/non-authenticated grantee present'
               else null
             end as problem
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'clara'
         and c.relname in ('firm_open_questions_visible', 'client_identifier_promotions_visible',
                           'users_visible')
    ) x
   where x.problem is not null;
  if v_bad is not null then
    raise exception 'debt human-read-surfaces tail: ACL/ownership defect: %', v_bad using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'clara' and c.relkind = 'v'
     and c.relname in ('firm_open_questions_visible', 'client_identifier_promotions_visible', 'users_visible');
  if v_n <> 3 then
    raise exception 'debt human-read-surfaces tail: expected 3 new views, found %', v_n using errcode = 'CLR10';
  end if;

  -- (2) CLOSED-WORLD COLUMN CENSUS -- each new view exposes EXACTLY its declared column list,
  --     in order, nothing more. `create or replace view` would refuse a rename/retype/reorder,
  --     but the estate's own D-6 lesson (0103:90-94) is that it does NOT refuse a hidden extra
  --     TRAILING column -- so arity is compared first, then names in order.
  select string_agg(format('%s: expected %s col(s) [%s], found %s [%s]',
           k.relname, k.n_expected, k.expected, v.n_actual, v.actual), '; ')
    into v_bad
    from (values
      ('firm_open_questions_visible', 14,
       'id,firm_id,document_id,kind,question_text,candidates,status,opened_by,opened_at,settled_by,settled_at,settlement_text,named_client,receipt_id'),
      ('client_identifier_promotions_visible', 15,
       'id,firm_id,client_id,kind,value_normalized,sightings,citations,rationale,model,status,proposed_by,proposed_at,settled_by,settled_at,identifier_id'),
      ('users_visible', 2, 'id,display_name')
    ) as k(relname, n_expected, expected)
    join lateral (
      select count(*)::int as n_actual,
             string_agg(a.attname, ',' order by a.attnum) as actual
        from pg_attribute a
       where a.attrelid = ('clara.'||k.relname)::regclass and a.attnum > 0 and not a.attisdropped
    ) v on true
   where v.n_actual <> k.n_expected or v.actual <> k.expected;
  if v_bad is not null then
    raise exception 'debt human-read-surfaces tail: closed-world column census failed: %', v_bad
      using errcode = 'CLR10';
  end if;

  -- (3a) firm_open_questions and client_identifier_promotions are UNCHANGED: still forced
  --      RLS, still owner-policy-only -- zero clara_authenticated grant on THESE TWO base
  --      relations, so the view is the only door (unlike clara.users, which was never
  --      ungranted to begin with -- see (3b) and the header).
  select string_agg(t.n, ', ') into v_bad
    from (values ('firm_open_questions'), ('client_identifier_promotions')) t(n)
   where has_table_privilege('clara_authenticated', ('clara.'||t.n)::regclass, 'select');
  if v_bad is not null then
    raise exception 'debt human-read-surfaces tail: base table(s) unexpectedly grant clara_authenticated SELECT directly: %. The read surface must be the VIEW only.', v_bad
      using errcode = 'CLR10';
  end if;

  -- (3b) clara.users' PRE-EXISTING ACL (0002:534-539) is BYTE-UNCHANGED by this file --
  --      proven by comparing against the prestate stash, not by asserting it is absent (it
  --      never was; see header item C).
  if (select acl from _debt_hrs_pre_acl where relname = 'users')
     is distinct from
     coalesce((select relacl::text from pg_class where oid = 'clara.users'::regclass), '(null)') then
    raise exception 'debt human-read-surfaces tail: clara.users'' ACL moved during this migration -- was %, now %',
      (select acl from _debt_hrs_pre_acl where relname = 'users'),
      coalesce((select relacl::text from pg_class where oid = 'clara.users'::regclass), '(null)')
      using errcode = 'CLR10';
  end if;

  -- (3c) All three source base tables still carry forced RLS.
  select string_agg(t.n, ', ') into v_bad
    from (values ('firm_open_questions'), ('client_identifier_promotions'), ('users')) t(n)
    join pg_class c on c.oid = ('clara.'||t.n)::regclass
   where not c.relrowsecurity or not c.relforcerowsecurity;
  if v_bad is not null then
    raise exception 'debt human-read-surfaces tail: base table(s) lost forced RLS: %', v_bad
      using errcode = 'CLR10';
  end if;

  raise notice 'debt human-read-surfaces tail: OK -- 3 new masked views (firm_open_questions_visible 14 cols, client_identifier_promotions_visible 15 cols, users_visible 2 cols), each owned by clara_fn_owner with ACL exactly {clara_authenticated=r}, zero agent/wake/runtime reach, closed-world column census clean; firm_open_questions and client_identifier_promotions remain forced-RLS owner-only with zero direct grant; clara.users'' pre-existing ACL (0002:534-539, never ungranted) is byte-unchanged; all three source base tables still carry forced RLS. No table in workflow/graphile_worker/spike touched.';
end $$;
