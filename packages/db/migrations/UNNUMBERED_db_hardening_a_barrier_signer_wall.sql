-- Pre-beta security-hardening batch, MIGRATION A -- owner-ruled 2026-08-28
-- (docs/plan/active/mohe-grill-rulings-2026-08-28.md, 裁-15 and 裁-18a). Two items:
--
--   (1) 裁-15 -- security_barrier estate pass. WIDENED past the owner's original "six" briefing
--       (independent review, 2026-08-29, NEW-H1): the "six" was the reviewer's own count at
--       briefing time, not a product boundary. The actual same-shape family -- a view, owned by
--       clara_fn_owner, SELECT-granted to clara_authenticated, doing its OWN tenant scoping in
--       the view body (a call to jwt_firm()/actor_role_rank()/jwt_sub()) rather than relying on
--       the base table's RLS -- is ENUMERATED FROM THE CATALOG below, never hardcoded as a
--       count: eleven members at this migration's frontier (0142). Three already carry
--       security_barrier (0141/P4's firm_members_visible / firm_invites_visible /
--       caller_context); the other EIGHT (0137's three -- users_visible,
--       firm_open_questions_visible, client_identifier_promotions_visible -- plus five more
--       this review's own rig work found sharing the identical shape --
--       agent_receipts_visible, agent_tasks_visible, coding_tasks_visible,
--       document_intakes_visible, document_processing_tasks_visible) get it here.
--       DEMONSTRATED, not a hygiene item: an adversarial rig probe (a VOLATILE, near-zero-cost
--       leaky function pushed into a WHERE clause, forcing the planner's hand via
--       enable_indexscan/enable_bitmapscan=off -- both USERSET, so a caller controls them) found
--       users_visible leaking under the DEFAULT plan and three of the five newly-covered views
--       (agent_tasks_visible, document_processing_tasks_visible, coding_tasks_visible) leaking
--       under the forced plan, on a rig WITHOUT this file's ALTERs -- and NOT leaking on a rig
--       WITH them. See packages/db/tests/debt-human-read-surfaces.test.mjs's attack cells for
--       the live proof. agent_receipts_visible and document_intakes_visible are covered by the
--       SAME instrument (identical shape) but a leak was NOT independently demonstrated on
--       either -- stated honestly, not assumed from the shape alone. Views only, ZERO writer
--       body touched by this item -- windowless, no D1 obligation.
--
--   (2) 裁-18a -- the signer<>proposer wall on clara.sign_vendor_identity_binding (0028,
--       confirmed byte-identical on this rig's live catalog to 0028's own text before this
--       file touches it, BY PROSRC SHA256 -- see §0(5); no later migration ever recut this
--       body). The vendor identity binding is the human-signed authority that lets Clara
--       auto-post a vendor's invoices with no human eye on that document again (0028/0029);
--       until this file, the live body never read `created_by`, so one admin could propose AND
--       sign the same binding alone -- a rank floor, not a separation of duties. This file adds
--       the wall: the signer must not be the binding's own proposer, refused CLR04 with a
--       stable DETAIL reason token, naming both lawful ways out in the OWNER'S OWN RULED WORDS
--       (裁-18c: "let Clara propose, or add a second admin" -- NOT "a different admin signs
--       it", which would tell a genuinely solo firm to use a person who does not exist).
--       STRICT (裁-18c): no relaxation for a single-admin firm -- a solo admin cannot
--       propose-then-sign their own binding either; the refusal is unconditional on
--       b.created_by vs c.actor, never gated on the firm's admin headcount, and FAIL-CLOSED ON
--       NULL (independent review, PROVEN BY EXECUTION on a rig with created_by nulled: a bare
--       `=` comparison evaluates NULL, not TRUE, on a nulled column, so the wall would silently
--       NOT fire -- fixed with an explicit `is null` arm; see §B).
--       ORDERING (independent review, 2026-08-29): 裁-18a lands here; 裁-18b (the Clara
--       proposal door -- agent proposes, human signs, docs/plan/active/binding-proposal-*)
--       is its own later design+build train. Between this migration and 裁-18b's merge, a
--       genuinely single-admin firm's ONLY lawful exit for a binding that admin themselves
--       proposed is: add a second admin+-rank member (a bookkeeper proposes, the admin signs)
--       -- "let Clara propose" is not yet a real door. Pre-beta this affects only test fixtures
--       and BELCORT; recorded here, not silently absorbed.
--       MEASURED, NO BYPASS (independent review, F-B): clara_authenticated holds NEITHER
--       SELECT nor any DML privilege on the base table clara.vendor_identity_bindings directly
--       (FORCE RLS, checked live); sign_vendor_identity_binding is the ONLY function in the
--       schema whose body executes `update clara.vendor_identity_bindings set status='live'`
--       (checked live by exact-pattern census, not name-guessed) -- there is no second writer
--       this wall could be bypassed through. _reserve_op rolls back the whole transaction on a
--       RAISE (v2 §G, pre-existing estate law), so a CLR04 refusal from this wall never burns
--       the op_key -- proven in the battery (x36c.5), not merely cited.
--       This item replaces ONE live audited writer's body -- D1 WRITE-QUIESCE OWED at deploy
--       (packages/db/README.md, "Deploy contract"; .claude/rules/db-migrations.md). The D1
--       inventory is exactly one function: clara.sign_vendor_identity_binding(uuid,text).
--
-- Migration B (裁-16, hash-only bearer tokens) is authored and rig-tested separately and is
-- NOT part of this file -- it is held back from push until P4 tranche-2's live CoR of
-- create_firm/set_member_role/add_member/invite_member/accept_invite has merged (a
-- cross-PR CREATE OR REPLACE collision on the same bodies, the 0136 lesson), then rebased and
-- re-censused before it ships. This file has zero collision with that in-flight work: it
-- touches no function tranche-2 is CoR-ing.
--
-- Frontend ride-along, same PR: apps/web's vendor-bindings panel copy ("the same admin who
-- proposed it may also sign it") is now FALSE and is trued in the same commit (the two
-- messages/en.json strings under FirmAdminCompliance.vendorBindings, plus the code comments
-- that made the same now-false claim, plus test cells pinning the corrected copy AND the
-- owner's-words refusal). No new `clara_authenticated` door is added by this file -- the
-- frontend-home rule (.claude/rules/db-migrations.md) therefore has nothing new to name; the
-- EXISTING Sign control on /admin/vendor-bindings (T10) is where this refusal already renders,
-- verbatim, through the estate's standing DoorRefusal contract (no client-side gate added).
--
-- =================================================================================================
-- §0 -- PRESTATE. Every claim this file makes about what it edits or depends on, measured
-- against the LIVE catalog on this rig (never migration file text -- migration bodies are
-- spliced across generations). Aborts on a false premise.
-- =================================================================================================
create temp table _hrd_a_pre(k text primary key, v text) on commit drop;

-- The same-shape family's SHAPE PREDICATE, stated once here and reused verbatim in the tail: a
-- view, owned by clara_fn_owner, SELECT-granted to clara_authenticated, whose OWN body text
-- calls one of the three tenant-scoping functions the estate's masked-view idiom uses
-- (jwt_firm() rows a caller's own firm; actor_role_rank() a role floor; jwt_sub() a
-- self-scoped read, e.g. caller_context). This is a textual proxy (the catalog has no
-- structured "this view is tenant-scoped" flag) -- accepted because every same-shape view in
-- this estate is hand-authored to call one of these three by name, and a false negative (a view
-- that scopes some OTHER way) would simply be absent from the family, not silently mis-included.
do $$
declare
  v_missing text; v_bad text; v_src text; v_acl text; v_owner text; v_viewdef text; v_prosrc_sha text;
  v_family_extra text; v_family_absent text;
begin
  -- (1) The two depended-upon migrations are live.
  select string_agg(t.n, ', ') into v_missing
    from (values ('0137_%'), ('0028_%')) t(n)
   where not exists (select 1 from clara.schema_migrations where version like t.n);
  if v_missing is not null then
    raise exception 'hrd-a prestate: required migration prefix(es) not applied: %', v_missing
      using errcode = 'CLR10';
  end if;

  -- (2) THE FAMILY CENSUS -- catalog-derived, closed-world, TWO-SIDED (independent review):
  --     refuse if the LIVE catalog carries a same-shape view this file does not expect (a
  --     twelfth member -- P4 tranche-2 is expected to add one, firm_registration_requests_visible,
  --     but not yet, at this migration's own frontier) OR is MISSING one this file does expect
  --     (vanished, renamed, re-owned, or ungranted -- any of which would silently shrink what
  --     this file believes it is censusing). Named separately so a reader can tell which
  --     direction actually happened.
  create temp table _hrd_a_family_derived(relname text primary key) on commit drop;
  insert into _hrd_a_family_derived(relname)
    select c.relname
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'clara' and c.relkind = 'v'
       and pg_get_userbyid(c.relowner) = 'clara_fn_owner'
       and has_table_privilege('clara_authenticated', c.oid, 'select')
       and pg_get_viewdef(c.oid, true) ~ '\yjwt_firm\(|\yactor_role_rank\(|\yjwt_sub\(';
  create temp table _hrd_a_family_expected(relname text primary key) on commit drop;
  insert into _hrd_a_family_expected(relname) values
    ('agent_receipts_visible'), ('agent_tasks_visible'), ('caller_context'),
    ('client_identifier_promotions_visible'), ('coding_tasks_visible'),
    ('document_intakes_visible'), ('document_processing_tasks_visible'),
    ('firm_invites_visible'), ('firm_members_visible'), ('firm_open_questions_visible'),
    ('users_visible');
  select string_agg(d.relname, ', ') into v_family_extra
    from _hrd_a_family_derived d where not exists (select 1 from _hrd_a_family_expected e where e.relname = d.relname);
  select string_agg(e.relname, ', ') into v_family_absent
    from _hrd_a_family_expected e where not exists (select 1 from _hrd_a_family_derived d where d.relname = e.relname);
  if v_family_extra is not null or v_family_absent is not null then
    raise exception 'hrd-a prestate: the same-shape family (view/owner/grant/tenant-scoped-body predicate) has drifted from the eleven this file was authored against -- UNEXPECTED (catalog has, this file does not expect): %; MISSING (this file expects, catalog does not have -- vanished/renamed/re-owned/ungranted): %. Re-derive this file''s ALTER list and expected-set against the LIVE catalog before re-authoring.',
      coalesce(v_family_extra, '(none)'), coalesce(v_family_absent, '(none)')
      using errcode = 'CLR10';
  end if;

  -- (3) Among the eleven: EXACTLY the three P4/0141 views already carry security_barrier
  --     (POSITIVE CONTROL for this file's own census baseline) and the other EIGHT (the ones
  --     this file is about to ALTER) do NOT yet -- additive proof, never a re-flip of an
  --     already-true value that would silently no-op the tail's before/after delta.
  select string_agg(t.n, ', ') into v_bad
    from (values ('firm_members_visible'), ('firm_invites_visible'), ('caller_context')) t(n)
    join pg_class c on c.relnamespace = 'clara'::regnamespace and c.relname = t.n
   where not ('security_barrier=true' = any(coalesce(c.reloptions, '{}'::text[])));
  if v_bad is not null then
    raise exception 'hrd-a prestate: expected P4''s three views to ALREADY carry security_barrier, found without it: %', v_bad
      using errcode = 'CLR10';
  end if;
  select string_agg(x.relname || ': ' || x.problem, '; ') into v_bad
    from (
      select c.relname,
             case
               when coalesce(c.relacl::text, '') <> '{clara_fn_owner=arwdDxtm/clara_fn_owner,clara_authenticated=r/clara_fn_owner}'
                 then 'unexpected ACL: ' || coalesce(c.relacl::text, '(null)')
               when 'security_barrier=true' = any(coalesce(c.reloptions, '{}'::text[]))
                 then 'ALREADY carries security_barrier -- this file would be a silent no-op'
               else null
             end as problem
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'clara'
         and c.relname in ('users_visible', 'firm_open_questions_visible', 'client_identifier_promotions_visible',
                            'agent_receipts_visible', 'agent_tasks_visible', 'coding_tasks_visible',
                            'document_intakes_visible', 'document_processing_tasks_visible')
    ) x
   where x.problem is not null;
  if v_bad is not null then
    raise exception 'hrd-a prestate: target-view premise failed: %', v_bad using errcode = 'CLR10';
  end if;

  -- (4) Stash the eight target views' LIVE viewdef text + ACL, so the tail can prove the ALTER
  --     changed ONLY the reloption -- never the query text, never the grant.
  for v_viewdef, v_bad in
    select pg_get_viewdef(('clara.'||n)::regclass, true), n
      from (values ('users_visible'), ('firm_open_questions_visible'), ('client_identifier_promotions_visible'),
                   ('agent_receipts_visible'), ('agent_tasks_visible'), ('coding_tasks_visible'),
                   ('document_intakes_visible'), ('document_processing_tasks_visible')) t(n)
  loop
    insert into _hrd_a_pre(k, v) values ('viewdef.'||v_bad, v_viewdef);
  end loop;
  insert into _hrd_a_pre(k, v)
    select 'acl.'||c.relname, coalesce(c.relacl::text, '(null)')
      from pg_class c
     where c.relnamespace = 'clara'::regnamespace
       and c.relname in ('users_visible', 'firm_open_questions_visible', 'client_identifier_promotions_visible',
                          'agent_receipts_visible', 'agent_tasks_visible', 'coding_tasks_visible',
                          'document_intakes_visible', 'document_processing_tasks_visible');

  -- (5) sign_vendor_identity_binding: resolves, owned by clara_fn_owner. HIGH-1 (independent
  --     review): the WHOLE live body's sha256(prosrc) must equal the pinned pre-image -- not
  --     merely "contains these markers" (a marker census admits an intervening recut that keeps
  --     the markers and changes something else -- the recut-body class the estate has already
  --     paid for, PR-0 gate night, the 0136 lesson). INSTRUMENT, stated explicitly (independent
  --     review corrected the first draft's wrong instrument): `encode(sha256(convert_to(prosrc,
  --     'UTF8')),'hex')` on the LIVE pg_proc.prosrc -- the estate's own convention for this
  --     exact purpose (0134:129/160, 0136:441/510), and the value already published for this
  --     body at binding-proposal-survey.md:69. NOT pg_get_functiondef() (a different, larger
  --     text including signature/language/config) -- an earlier draft of this file's own report
  --     conflated the two instruments; this prestate uses prosrc alone, throughout.
  if to_regprocedure('clara.sign_vendor_identity_binding(uuid,text)') is null then
    raise exception 'hrd-a prestate: clara.sign_vendor_identity_binding(uuid,text) does not resolve' using errcode = 'CLR10';
  end if;
  select p.prosrc, coalesce(p.proacl::text, '(null)'), pg_get_userbyid(p.proowner)
    into v_src, v_acl, v_owner
    from pg_proc p where p.oid = 'clara.sign_vendor_identity_binding(uuid,text)'::regprocedure;
  if v_owner <> 'clara_fn_owner' then
    raise exception 'hrd-a prestate: sign_vendor_identity_binding is not owned by clara_fn_owner (owner=%)', v_owner
      using errcode = 'CLR10';
  end if;
  v_prosrc_sha := encode(sha256(convert_to(v_src, 'UTF8')), 'hex');
  if v_prosrc_sha <> 'bff40d61c1df2db40062f592b1c5c65b468934f5796cb0c8a3d4be4a7594312e' then
    raise exception 'hrd-a prestate: sign_vendor_identity_binding''s live prosrc sha256 does not match the pinned pre-image -- observed % (instrument: encode(sha256(convert_to(prosrc,''UTF8'')),''hex'')), expected bff40d61c1df2db40062f592b1c5c65b468934f5796cb0c8a3d4be4a7594312e. An intervening recut may have changed behaviour while keeping every marker string (the class this pin exists to catch) -- re-read the LIVE catalog, re-derive the delta this file means to apply, and re-pin both this hash and the tail''s post-image hash before re-authoring. Refusing rather than guessing.', v_prosrc_sha
      using errcode = 'CLR10';
  end if;
  -- Secondary, human-legible layer (not load-bearing on its own -- the sha above is the real
  -- guard): every wall string this file's tail will re-assert as PRESERVED is present, and the
  -- new wall's marker text is ABSENT pre-edit (this file is genuinely additive).
  if position('binding not found' in v_src) = 0
     or position('binding_not_proposed' in v_src) = 0
     or position('binding_expired' in v_src) = 0
     or position('proposal_drifted' in v_src) = 0
     or position('post_control_absent' in v_src) = 0
     or position('_reserve_op' in v_src) = 0
  then
    raise exception 'hrd-a prestate: sign_vendor_identity_binding''s LIVE body is missing an expected wall string -- re-read the live catalog before authoring the CoR' using errcode = 'CLR10';
  end if;
  if position('let Clara propose it, or add a second admin' in v_src) > 0 then
    raise exception 'hrd-a prestate: the signer<>proposer wall marker text is ALREADY present -- this file would double-apply it' using errcode = 'CLR10';
  end if;
  insert into _hrd_a_pre(k, v) values
    ('svib.prosrc', v_src), ('svib.acl', v_acl), ('svib.owner', v_owner);

  -- (6) Every function/table this file's new wall reads must resolve, and
  --     vendor_identity_bindings.created_by must be the column shape the wall relies on.
  select string_agg(t.n, ', ') into v_missing
    from (values
      ('clara._human_ctx(integer)'), ('clara.role_rank(text)'), ('clara._reserve_op(uuid,text,text,bytea)'),
      ('clara._finish_op(uuid,text,text,jsonb)'), ('clara._hash(jsonb)'), ('clara._audit(uuid,uuid,uuid,text,text,uuid,jsonb)'),
      ('clara._append_event(uuid,text,uuid,uuid,uuid,text,uuid,uuid,uuid,jsonb)'),
      ('clara._derive_vendor_binding_proposal(uuid,uuid,uuid)')
    ) t(n) where to_regprocedure(t.n) is null;
  if v_missing is not null then
    raise exception 'hrd-a prestate: depended-upon function(s) missing: %', v_missing using errcode = 'CLR10';
  end if;
  if not exists (
    select 1 from pg_attribute a
     where a.attrelid = 'clara.vendor_identity_bindings'::regclass
       and a.attname = 'created_by' and a.attnum > 0 and not a.attisdropped
  ) then
    raise exception 'hrd-a prestate: clara.vendor_identity_bindings.created_by column absent -- the wall this file adds has no column to compare' using errcode = 'CLR10';
  end if;
  -- LOW-5 (independent review): existence alone is not enough. The wall itself (§B) is written
  -- to refuse EXPLICITLY on a NULL created_by regardless of this column's declared nullability
  -- (PROVEN BY EXECUTION: a bare `=` comparison alone would fail OPEN on a nulled column -- see
  -- §B's own comment) -- but a type-shape drift (created_by retyped away from uuid) would still
  -- break the `= c.actor` comparison silently, so that half is still measured here.
  if not exists (
    select 1 from pg_attribute a join pg_type ty on ty.oid = a.atttypid
     where a.attrelid = 'clara.vendor_identity_bindings'::regclass
       and a.attname = 'created_by' and a.attnum > 0 and not a.attisdropped
       and ty.typname = 'uuid'
  ) then
    raise exception 'hrd-a prestate: clara.vendor_identity_bindings.created_by is not type uuid -- the wall''s comparison assumption does not hold' using errcode = 'CLR10';
  end if;

  raise notice 'hrd-a prestate: OK -- the same-shape family (view/owner/grant/tenant-scoped-body predicate) derives to EXACTLY the expected 11 members, two-sided; the 3 P4/0141 members already carry security_barrier, the 8 target members (0137''s three + 5 more this review found: agent_receipts_visible, agent_tasks_visible, coding_tasks_visible, document_intakes_visible, document_processing_tasks_visible) do not yet, ACL-shaped, viewdefs stashed for a byte-comparison tail; sign_vendor_identity_binding''s live prosrc sha256 (instrument: encode(sha256(convert_to(prosrc,''UTF8'')),''hex'')) matches the pinned pre-image bff40d61... exactly (HIGH-1) with all 6 prior wall strings present and the new wall''s marker text absent pre-edit; 8 depended-upon functions resolve; vendor_identity_bindings.created_by present, typed uuid (LOW-5).';
end $$;

set role clara_fn_owner;

-- MED-2 (independent review, 2026-08-29): bounded, PRECAUTIONARY (not load-bearing -- the D1
-- write-quiesce window named in this file's header is what actually prevents the hazard).
-- `set local` is transaction-scoped (this whole file runs in one migration transaction), so
-- setting it once here covers every statement below it -- §A's eight ALTER VIEWs and §B's CoR
-- alike (the same shape as 0142's own precedent for a heavy-pass timeout). A bounded FAIL FAST
-- (refuse, retry during a proper quiet window) rather than an unbounded hang if the D1 quiesce
-- was not followed perfectly.
set local lock_timeout = '5s';

-- =================================================================================================
-- §A -- 裁-15. ALTER VIEW ... SET (security_barrier = true) on the EIGHT target views, BY NAME
-- (independent review, caution B: the ALTER list is hardcoded to exactly what §0's closed-world
-- census already verified is live and unbarriered -- this file never ALTERs "whatever the
-- catalog query returns" at apply time, which would make it non-deterministic across frontiers;
-- the catalog-derived census in §0/§K is what guarantees these eight names are correct, not the
-- ALTER statements themselves). ALTER VIEW SET is a pure reloption/metadata operation -- it
-- cannot touch the view's query text or its ACL, which is why this is the surgical choice over a
-- CREATE OR REPLACE VIEW re-statement. The tail still measures and compares against the §0 stash
-- rather than trusting the statement kind alone -- "measure before, measure after".
--
-- WHAT security_barrier BUYS, and what it does NOT (0141:492-501's own note, restated here
-- because this file is the estate-wide census closing the debt 0141 named): Postgres may
-- otherwise plan a caller-supplied WHERE qualifier ahead of the view's OWN predicate, and if
-- that pushed qual calls a non-leakproof function/operator, its side channel (error, timing,
-- crash, or -- DEMONSTRATED here -- a planted VOLATILE probe's own side effect) can leak a
-- masked/filtered row's existence before the view's firm/rank predicate ever excludes it --
-- security_barrier forces the view's own predicate to evaluate first. security_barrier buys
-- NOTHING for TARGET-LIST masking: users_visible's own column list is already minimal (id,
-- display_name only) and firm_members_visible's `case when ... then u.email else null end as
-- email` (0141:517) still computes and returns exactly what that CASE says for any row the
-- caller's WHERE already admits -- security_barrier governs qual-pushdown ORDER, not column
-- projection.
-- =================================================================================================
alter view clara.users_visible set (security_barrier = true);
alter view clara.firm_open_questions_visible set (security_barrier = true);
alter view clara.client_identifier_promotions_visible set (security_barrier = true);
alter view clara.agent_receipts_visible set (security_barrier = true);
alter view clara.agent_tasks_visible set (security_barrier = true);
alter view clara.coding_tasks_visible set (security_barrier = true);
alter view clara.document_intakes_visible set (security_barrier = true);
alter view clara.document_processing_tasks_visible set (security_barrier = true);

-- =================================================================================================
-- §B -- 裁-18a. The signer<>proposer wall on clara.sign_vendor_identity_binding. CREATE OR
-- REPLACE over the exact body stashed in §0(5), with ONE block inserted: right after the
-- firm-membership check (so a caller learns "not your firm" before any authz/business-state
-- detail about a binding they cannot see) and BEFORE the status/expiry checks (an authz wall
-- runs ahead of business-state detail, matching 0141 F4's own "guard-first" precedent for this
-- estate). Every other byte is unchanged from the §0 stash -- the tail proves this THREE ways:
-- a whole-body sha256 pin (HIGH-1), a byte-exact strip-the-block comparison against the §0
-- stash (HIGH-1), and the marker/position census below -- not merely asserting "OK".
--
-- D1 WRITE-QUIESCE OWED: this CoR replaces a live audited writer's body. PostgreSQL runs an
-- in-flight PL/pgSQL call to completion on the body it STARTED with, so a call spanning this
-- migration's apply would silently finish on the OLD body and skip the wall. Quiesce
-- sign_vendor_identity_binding's callers for this file's deploy window (packages/db/README.md,
-- "Deploy contract").
-- =================================================================================================
create or replace function clara.sign_vendor_identity_binding(
  p_binding uuid,
  p_op_key text
) returns jsonb
language plpgsql security definer
set search_path to clara,pg_temp
as $$
declare
  c record; v_dedupe jsonb; b record; v_derived jsonb;
  v_stored_evidence jsonb;
begin
  c:=clara._human_ctx(clara.role_rank('admin'));
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  if p_binding is null then
    raise exception 'binding is required' using errcode='CLR10';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'sign_vendor_identity_binding',p_op_key,
    clara._hash(jsonb_build_object('binding_id',p_binding)));
  if v_dedupe is not null then return v_dedupe; end if;

  select * into b
  from clara.vendor_identity_bindings
  where id=p_binding
  for update;
  if not found or b.firm_id<>c.firm then
    raise exception 'binding not found' using errcode='CLR11';
  end if;
  -- 裁-18a (owner-ruled 2026-08-28, mohe-grill-rulings): separation of duties on an authority
  -- that lets Clara auto-post a vendor's invoices with no human eye on the document again --
  -- the signer must not be the same person who proposed the binding. STRICT (裁-18c): no
  -- relaxation for a single-admin firm -- unconditional on b.created_by vs c.actor, never
  -- gated on the firm's admin headcount. FAIL-CLOSED ON NULL (LOW-5, PROVEN BY EXECUTION,
  -- independent review 2026-08-29): a bare `b.created_by = c.actor` evaluates to NULL (not
  -- TRUE) whenever created_by is NULL, so a nullable-drift row would silently sign LIVE with
  -- no separation of duties at all -- measured for real on a rig with created_by nulled. The
  -- explicit `is null` arm refuses that case too, never relying on NOT NULL alone. The refusal
  -- names both lawful ways out in the OWNER'S OWN RULED WORDS (裁-18c's verbatim text) and
  -- carries a stable DETAIL reason token (MED-3, the estate's typed-refusal shape, the SAME
  -- idiom this body already uses below for post_control_absent) so a caller can discriminate
  -- this wall from any other CLR04 without parsing the message text.
  if b.created_by is null or b.created_by = c.actor then
    raise exception 'the signer cannot be the same person who proposed this binding; let Clara propose it, or add a second admin' using errcode='CLR04',detail='{"reason":"signer_is_proposer"}';
  end if;
  if b.status<>'proposed' then
    raise exception 'binding_not_proposed' using errcode='CLR36';
  end if;
  if b.expires_at<=now() then
    raise exception 'binding_expired' using errcode='CLR36';
  end if;

  update clara.vendor_identity_bindings
    set status='expired'
  where id<>p_binding
    and firm_id=c.firm and client_id=b.client_id
    and counterparty_id=b.counterparty_id
    and status='live' and expires_at<=now();

  v_derived:=clara._derive_vendor_binding_proposal(
    c.firm,b.client_id,b.counterparty_id);
  select coalesce(jsonb_agg(jsonb_build_object(
      'entry_id',ev.entry_id,
      'document_id',ev.document_id,
      'facts_extraction_id',ev.facts_extraction_id,
      'ocr_extraction_id',ev.ocr_extraction_id,
      'posting_date',j.posting_date
    ) order by j.approved_at desc,j.id desc),'[]'::jsonb)
    into v_stored_evidence
  from clara.vendor_identity_binding_evidence ev
  join clara.journal_entries j on j.id=ev.entry_id
  where ev.binding_id=p_binding;

  if b.f1_vendor_name_norm is distinct from
       v_derived->>'f1_vendor_name_norm'
     or b.f2_invoice_prefix is distinct from
       v_derived->>'f2_invoice_prefix'
     or b.registration_at_signing is distinct from
       v_derived->>'registration_at_signing'
     or b.content_hash is distinct from v_derived->>'content_hash'
     or v_stored_evidence is distinct from v_derived->'evidence' then
    raise exception 'proposal_drifted' using errcode='CLR36';
  end if;

  if not exists (
    select 1 from clara.schema_migrations
    where version='0029_vendor_binding_executor'
  ) then
    raise exception 'post-time control not yet deployed'
      using errcode='CLR36',detail='{"reason":"post_control_absent"}';
  end if;

  update clara.vendor_identity_bindings
    set status='live',signed_by=c.actor,signed_at=now()
  where id=p_binding;

  perform clara._audit(c.firm,c.actor,null,null,
    'sign_vendor_identity_binding',null,
    jsonb_build_object('binding_id',p_binding,'client_id',b.client_id,
      'counterparty_id',b.counterparty_id,'op_key',p_op_key));
  perform clara._append_event(c.firm,'kb_binding.signed',b.client_id,c.actor,
    null,null,null,null,null,
    jsonb_build_object('binding_id',p_binding,
      'counterparty_id',b.counterparty_id));
  return clara._finish_op(c.firm,'sign_vendor_identity_binding',p_op_key,
    jsonb_build_object('binding_id',p_binding,'status','live')
      || (v_derived - 'client_id' - 'counterparty_id'));
end
$$;

reset role;

-- =================================================================================================
-- §K -- TAIL CENSUS. Re-reads the live catalog; raises on any finding rather than trusting the
-- body above ran as written.
-- =================================================================================================
do $$
declare
  v_bad text; v_n int; v_src_now text; v_acl_now text; v_owner_now text; v_code text;
  v_pos1 int; v_pos2 int; v_pos3 int; v_prosrc_sha text; v_inserted_block text; v_stripped text;
  v_family_extra text; v_family_absent text;
begin
  -- (1) THE FAMILY CENSUS, RE-DERIVED (never a hardcoded list -- the SAME shape predicate as
  --     §0(2)), two-sided: the live catalog still resolves to EXACTLY the eleven expected
  --     members (a member vanishing, being renamed, re-owned or ungranted during this
  --     transaction would show up here as loudly as a stray new one).
  create temp table _hrd_a_tail_family_derived(relname text primary key) on commit drop;
  insert into _hrd_a_tail_family_derived(relname)
    select c.relname
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'clara' and c.relkind = 'v'
       and pg_get_userbyid(c.relowner) = 'clara_fn_owner'
       and has_table_privilege('clara_authenticated', c.oid, 'select')
       and pg_get_viewdef(c.oid, true) ~ '\yjwt_firm\(|\yactor_role_rank\(|\yjwt_sub\(';
  create temp table _hrd_a_tail_family_expected(relname text primary key) on commit drop;
  insert into _hrd_a_tail_family_expected(relname) values
    ('agent_receipts_visible'), ('agent_tasks_visible'), ('caller_context'),
    ('client_identifier_promotions_visible'), ('coding_tasks_visible'),
    ('document_intakes_visible'), ('document_processing_tasks_visible'),
    ('firm_invites_visible'), ('firm_members_visible'), ('firm_open_questions_visible'),
    ('users_visible');
  select string_agg(d.relname, ', ') into v_family_extra
    from _hrd_a_tail_family_derived d where not exists (select 1 from _hrd_a_tail_family_expected e where e.relname = d.relname);
  select string_agg(e.relname, ', ') into v_family_absent
    from _hrd_a_tail_family_expected e where not exists (select 1 from _hrd_a_tail_family_derived d where d.relname = e.relname);
  if v_family_extra is not null or v_family_absent is not null then
    raise exception 'hrd-a tail: the same-shape family drifted DURING this migration -- UNEXPECTED: %; MISSING: %', coalesce(v_family_extra, '(none)'), coalesce(v_family_absent, '(none)')
      using errcode = 'CLR10';
  end if;

  -- (2) EVERY member of the DERIVED family (not a hardcoded list, not merely "exactly N") now
  --     carries security_barrier=true. Stated once more, in the tail's own words: this
  --     reloption buys qual-pushdown ordering, NOT target-list masking (see §A comment).
  select string_agg(d.relname, ', ') into v_bad
    from _hrd_a_tail_family_derived d
    join pg_class c on c.relnamespace = 'clara'::regnamespace and c.relname = d.relname
   where not ('security_barrier=true' = any(coalesce(c.reloptions, '{}'::text[])));
  if v_bad is not null then
    raise exception 'hrd-a tail: expected security_barrier=true on every member of the (catalog-derived) same-shape family, missing on: %', v_bad
      using errcode = 'CLR10';
  end if;

  -- (3) The eight target views' viewdef TEXT and ACL are byte-IDENTICAL to the §0 stash -- the
  --     ALTER changed the reloption and nothing else.
  select string_agg(t.n, ', ') into v_bad
    from (values ('users_visible'), ('firm_open_questions_visible'), ('client_identifier_promotions_visible'),
                 ('agent_receipts_visible'), ('agent_tasks_visible'), ('coding_tasks_visible'),
                 ('document_intakes_visible'), ('document_processing_tasks_visible')) t(n)
   where pg_get_viewdef(('clara.'||t.n)::regclass, true) is distinct from (select v from _hrd_a_pre where k = 'viewdef.'||t.n)
      or coalesce((select relacl::text from pg_class where relnamespace = 'clara'::regnamespace and relname = t.n), '(null)')
         is distinct from (select v from _hrd_a_pre where k = 'acl.'||t.n);
  if v_bad is not null then
    raise exception 'hrd-a tail: viewdef or ACL drifted on: % -- the ALTER must change ONLY the reloption', v_bad
      using errcode = 'CLR10';
  end if;

  -- (4) sign_vendor_identity_binding: ACL is BYTE-UNCHANGED from the §0 stash (CREATE OR
  --     REPLACE preserves the grant; proven, not assumed); owner unchanged; prosrc genuinely
  --     CHANGED (the wall actually landed, not a no-op replace).
  select coalesce(p.proacl::text, '(null)'), pg_get_userbyid(p.proowner), p.prosrc
    into v_acl_now, v_owner_now, v_src_now
    from pg_proc p where p.oid = 'clara.sign_vendor_identity_binding(uuid,text)'::regprocedure;
  if v_acl_now is distinct from (select v from _hrd_a_pre where k = 'svib.acl') then
    raise exception 'hrd-a tail: sign_vendor_identity_binding''s ACL moved -- was %, now %',
      (select v from _hrd_a_pre where k = 'svib.acl'), v_acl_now using errcode = 'CLR10';
  end if;
  if v_owner_now <> 'clara_fn_owner' then
    raise exception 'hrd-a tail: sign_vendor_identity_binding owner drifted to %', v_owner_now using errcode = 'CLR10';
  end if;
  if v_src_now = (select v from _hrd_a_pre where k = 'svib.prosrc') then
    raise exception 'hrd-a tail: sign_vendor_identity_binding''s body is byte-identical to prestate -- the wall was not added' using errcode = 'CLR10';
  end if;

  -- (4b) HIGH-1: the new body's WHOLE sha256 (same instrument: encode(sha256(convert_to(prosrc,
  --      'UTF8')),'hex')) equals the pinned post-image -- re-derived on the same fresh
  --      0001-0142+this-file rig the pre-image was pinned against, 2026-08-29.
  v_prosrc_sha := encode(sha256(convert_to(v_src_now, 'UTF8')), 'hex');
  if v_prosrc_sha <> '5285581ec371856d525fb47d2cfabc6e72b3a37285b291390e8c7aa34034e941' then
    raise exception 'hrd-a tail: sign_vendor_identity_binding''s new prosrc sha256 does not match the pinned expected post-image (instrument: encode(sha256(convert_to(prosrc,''UTF8'')),''hex'')) -- observed %, expected 5285581ec371856d525fb47d2cfabc6e72b3a37285b291390e8c7aa34034e941', v_prosrc_sha
      using errcode = 'CLR10';
  end if;

  -- (4c) HIGH-1: THE SURGICAL-DELTA PROOF. Strip the EXACT inserted block (byte-for-byte the
  --      same text §B's CoR adds -- copy-pasted here, not re-derived, so a mismatch here means
  --      THIS check's own copy has drifted from §B, not that the live body is wrong) from the
  --      new body; the result must equal the OLD (prestate-stashed) body byte-for-byte. This is
  --      independent of, and strictly stronger than, the marker/position census in (5)-(6)
  --      below: a marker census can be fooled by a recut that keeps every marker AND adds the
  --      wall AND changes something else nearby; this cannot -- removing exactly the wall block
  --      must reproduce the pre-image with NOTHING else different, or it raises.
  v_inserted_block := $blk$  -- 裁-18a (owner-ruled 2026-08-28, mohe-grill-rulings): separation of duties on an authority
  -- that lets Clara auto-post a vendor's invoices with no human eye on the document again --
  -- the signer must not be the same person who proposed the binding. STRICT (裁-18c): no
  -- relaxation for a single-admin firm -- unconditional on b.created_by vs c.actor, never
  -- gated on the firm's admin headcount. FAIL-CLOSED ON NULL (LOW-5, PROVEN BY EXECUTION,
  -- independent review 2026-08-29): a bare `b.created_by = c.actor` evaluates to NULL (not
  -- TRUE) whenever created_by is NULL, so a nullable-drift row would silently sign LIVE with
  -- no separation of duties at all -- measured for real on a rig with created_by nulled. The
  -- explicit `is null` arm refuses that case too, never relying on NOT NULL alone. The refusal
  -- names both lawful ways out in the OWNER'S OWN RULED WORDS (裁-18c's verbatim text) and
  -- carries a stable DETAIL reason token (MED-3, the estate's typed-refusal shape, the SAME
  -- idiom this body already uses below for post_control_absent) so a caller can discriminate
  -- this wall from any other CLR04 without parsing the message text.
  if b.created_by is null or b.created_by = c.actor then
    raise exception 'the signer cannot be the same person who proposed this binding; let Clara propose it, or add a second admin' using errcode='CLR04',detail='{"reason":"signer_is_proposer"}';
  end if;
$blk$;
  v_stripped := replace(v_src_now, v_inserted_block, '');
  if v_stripped <> (select v from _hrd_a_pre where k = 'svib.prosrc') then
    raise exception 'hrd-a tail: stripping the exactly-one-inserted-block from the new body does not reproduce the OLD (prestate) body byte-for-byte -- the recut touched something beyond the wall, or the block text this check compares against has drifted from §B''s own text' using errcode = 'CLR10';
  end if;

  -- (5) The wall's marker text is present in CODE (comment-stripped, 0141 §K(5b)'s
  --     block-then-line double strip -- a comment mentioning the wall is not enough; this
  --     migration's own header/§B comments deliberately use the SAME marker phrase, so
  --     stripping comments first is load-bearing here, not decorative). Every PRIOR wall
  --     string survives. Ordering: the new wall runs AFTER the firm-membership check
  --     ('binding not found') and BEFORE both the status check ('binding_not_proposed') and
  --     the post-control-absent gate ('post_control_absent') in CODE.
  --
  --     MEASURED, NOT THEORETICAL (0141 §K(5b)'s M9 hazard): the wall's message literal must
  --     never contain `--` (it would be erased by this exact strip, INCLUDING the marker text
  --     this check searches for -- hit for real while first authoring this file's message, and
  --     fixed by separating clauses with `;` instead). FOR THE NEXT EDITOR: do not put `--`
  --     inside this function's message literals; if you must, this pin will refuse loudly
  --     rather than silently pass a wall that exists only in a comment.
  v_code := regexp_replace(regexp_replace(v_src_now, '/\*.*?\*/', '', 'gs'), '--[^\n]*', '', 'g');
  if position('let Clara propose it, or add a second admin' in v_code) = 0 then
    raise exception 'hrd-a tail: the signer<>proposer wall''s refusal text is not present in CODE' using errcode = 'CLR10';
  end if;
  if position('binding not found' in v_code) = 0
     or position('binding_not_proposed' in v_code) = 0
     or position('binding_expired' in v_code) = 0
     or position('proposal_drifted' in v_code) = 0
     or position('post_control_absent' in v_code) = 0
     or position('_reserve_op' in v_code) = 0
  then
    raise exception 'hrd-a tail: one or more PRIOR wall strings were lost across the CoR' using errcode = 'CLR10';
  end if;
  v_pos1 := position('binding not found' in v_code);
  v_pos2 := position('let Clara propose it, or add a second admin' in v_code);
  v_pos3 := position('binding_not_proposed' in v_code);
  if not (v_pos1 < v_pos2 and v_pos2 < v_pos3) then
    raise exception 'hrd-a tail: the new wall does not sit strictly between the firm-membership check and the status check in CODE (positions % / % / %)', v_pos1, v_pos2, v_pos3
      using errcode = 'CLR10';
  end if;
  if position('let Clara propose it, or add a second admin' in v_code) >= position('post_control_absent' in v_code) then
    raise exception 'hrd-a tail: the new wall does not run BEFORE the post-control-absent gate in CODE' using errcode = 'CLR10';
  end if;

  -- (6) CLR04 is the errcode literal actually attached to the new wall's raise -- typed, not a
  --     generic exception; and MED-3's DETAIL reason token is attached to the SAME raise (a
  --     substring window around the marker text, in stripped CODE).
  if position('using errcode=''CLR04''' in
      substring(v_code from position('let Clara propose it, or add a second admin' in v_code) for 400)) = 0 then
    raise exception 'hrd-a tail: the new wall''s raise is not typed CLR04' using errcode = 'CLR10';
  end if;
  if position('detail=''{"reason":"signer_is_proposer"}''' in
      substring(v_code from position('let Clara propose it, or add a second admin' in v_code) for 400)) = 0 then
    raise exception 'hrd-a tail: the new wall''s raise does not carry the MED-3 DETAIL reason token in CODE' using errcode = 'CLR10';
  end if;
  -- (6b) LOW-5: the NULL-safe arm is present in CODE (not merely "the column happens to be NOT
  --      NULL today") -- `is null` sits BEFORE the `= c.actor` comparison it OR's against, both
  --      inside the same IF, ahead of the refusal.
  if position('b.created_by is null or b.created_by = c.actor' in v_code) = 0 then
    raise exception 'hrd-a tail: the wall''s explicit NULL-safe arm (b.created_by is null or b.created_by = c.actor) is not present in CODE' using errcode = 'CLR10';
  end if;

  raise notice 'hrd-a tail: OK -- the same-shape family (catalog-derived, two-sided census) still resolves to EXACTLY the eleven expected members; EVERY member now carries security_barrier=true; the 8 views this file touched have byte-unchanged viewdef text and ACL apart from the reloption; sign_vendor_identity_binding''s ACL/owner are byte-unchanged, its body genuinely changed (prosrc sha256 pinned pre AND post, instrument encode(sha256(convert_to(prosrc,''UTF8'')),''hex'')), the surgical-delta strip-the-block proof reproduces the pre-image byte-for-byte, the new signer<>proposer wall (typed CLR04, DETAIL reason=signer_is_proposer, the owner''s-words two-ways-out message, explicit NULL-safe) sits in CODE strictly between the firm-membership check and the status check and strictly before the post-control-absent gate, and all 6 prior wall strings survive. No table in workflow/graphile_worker/spike touched. D1 OWED: clara.sign_vendor_identity_binding(uuid,text) -- one replaced writer body.';
end $$;
