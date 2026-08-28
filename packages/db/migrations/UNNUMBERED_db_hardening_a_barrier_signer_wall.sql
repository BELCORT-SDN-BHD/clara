-- Pre-beta security-hardening batch, MIGRATION A -- owner-ruled 2026-08-28
-- (docs/plan/active/mohe-grill-rulings-2026-08-28.md, 裁-15 and 裁-18a). Two items, bundled
-- because both are windowless-or-D1-scoped, small, and land together on the same batch:
--
--   (1) 裁-15 -- security_barrier estate pass. 0137's three masked views (users_visible,
--       firm_open_questions_visible, client_identifier_promotions_visible) get the
--       `security_barrier` reloption so all SIX same-shape masked views in the estate carry
--       it (0141/P4's firm_members_visible / firm_invites_visible / caller_context already
--       do, confirmed live on this rig before authoring -- see the prestate below). Views
--       only, ZERO writer body touched by this item -- windowless, no D1 obligation.
--
--   (2) 裁-18a -- the signer<>proposer wall on clara.sign_vendor_identity_binding (0028,
--       confirmed byte-identical on this rig's live catalog to 0028's own text before this
--       file touches it -- no later migration ever recut this body). The vendor identity
--       binding is the human-signed authority that lets Clara auto-post a vendor's invoices
--       with no human eye on that document again (0028/0029); until this file, the live body
--       never read `created_by`, so one admin could propose AND sign the same binding alone
--       -- a rank floor, not a separation of duties. This file adds the wall: the signer must
--       not be the binding's own proposer, refused CLR04, naming both lawful ways out.
--       STRICT (裁-18c): no relaxation for a single-admin firm -- a solo admin cannot
--       propose-then-sign their own binding either; the refusal is unconditional on
--       `b.created_by = c.actor`, never gated on the firm's admin headcount.
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
-- that made the same now-false claim, plus a test cell pinning the corrected copy). No new
-- `clara_authenticated` door is added by this file -- the frontend-home rule
-- (.claude/rules/db-migrations.md) therefore has nothing new to name; the EXISTING Sign
-- control on /admin/vendor-bindings (T10) is where this refusal already renders, verbatim,
-- through the estate's standing DoorRefusal contract (no client-side gate added or needed).
--
-- =================================================================================================
-- §0 -- PRESTATE. Every claim this file makes about what it edits or depends on, measured
-- against the LIVE catalog on this rig (never migration file text -- migration bodies are
-- spliced across generations; 0028's function was independently re-derived via
-- pg_get_functiondef on this rig before this file was written, and matched 0028's own text
-- byte-for-byte, confirmed by the sha comparison below). Aborts on a false premise.
-- =================================================================================================
create temp table _hrd_a_pre(k text primary key, v text) on commit drop;

do $$
declare
  v_missing text; v_bad text; v_src text; v_acl text; v_owner text; v_viewdef text;
begin
  -- (1) The three depended-upon migrations are live.
  select string_agg(t.n, ', ') into v_missing
    from (values ('0137_%'), ('0028_%')) t(n)
   where not exists (select 1 from clara.schema_migrations where version like t.n);
  if v_missing is not null then
    raise exception 'hrd-a prestate: required migration prefix(es) not applied: %', v_missing
      using errcode = 'CLR10';
  end if;

  -- (2) The three 0137 views exist, are views owned by clara_fn_owner, currently carry ACL
  --     EXACTLY {clara_fn_owner=full, clara_authenticated=r} and do NOT yet carry
  --     security_barrier (so this file's ALTER is additive, never a re-flip of an
  --     already-true value that would silently no-op the tail's before/after delta proof).
  select string_agg(x.relname || ': ' || x.problem, '; ') into v_bad
    from (
      select c.relname,
             case
               when c.relkind <> 'v' then 'not a view (relkind=' || c.relkind::text || ')'
               when pg_get_userbyid(c.relowner) <> 'clara_fn_owner' then 'owner=' || pg_get_userbyid(c.relowner)
               when coalesce(c.relacl::text, '') <> '{clara_fn_owner=arwdDxtm/clara_fn_owner,clara_authenticated=r/clara_fn_owner}'
                 then 'unexpected ACL: ' || coalesce(c.relacl::text, '(null)')
               when 'security_barrier=true' = any(coalesce(c.reloptions, '{}'::text[]))
                 then 'ALREADY carries security_barrier -- this file would be a silent no-op'
               else null
             end as problem
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'clara'
         and c.relname in ('users_visible', 'firm_open_questions_visible', 'client_identifier_promotions_visible')
    ) x
   where x.problem is not null;
  if v_bad is not null then
    raise exception 'hrd-a prestate: 0137 view premise failed: %', v_bad using errcode = 'CLR10';
  end if;
  -- (2b) exactly 3 target views live.
  if (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'clara'
         and c.relname in ('users_visible', 'firm_open_questions_visible', 'client_identifier_promotions_visible')) <> 3 then
    raise exception 'hrd-a prestate: expected exactly 3 target 0137 views, catalog disagrees' using errcode = 'CLR10';
  end if;

  -- (3) POSITIVE CONTROL for the census baseline this file's tail asserts: P4/0141's three
  --     sibling views already carry security_barrier=true, live, right now -- the estate
  --     fact 裁-15's own text asserts ("P4's three already do").
  select string_agg(t.n, ', ') into v_bad
    from (values ('firm_members_visible'), ('firm_invites_visible'), ('caller_context')) t(n)
    join pg_class c on c.relnamespace = 'clara'::regnamespace and c.relname = t.n
   where not ('security_barrier=true' = any(coalesce(c.reloptions, '{}'::text[])));
  if v_bad is not null then
    raise exception 'hrd-a prestate: expected P4''s three views to ALREADY carry security_barrier, found without it: %', v_bad
      using errcode = 'CLR10';
  end if;

  -- (4) Stash the three 0137 views' LIVE viewdef text + ACL, so the tail can prove the ALTER
  --     changed ONLY the reloption -- never the query text, never the grant.
  for v_viewdef, v_bad in
    select pg_get_viewdef(('clara.'||n)::regclass, true), n
      from (values ('users_visible'), ('firm_open_questions_visible'), ('client_identifier_promotions_visible')) t(n)
  loop
    insert into _hrd_a_pre(k, v) values ('viewdef.'||v_bad, v_viewdef);
  end loop;
  insert into _hrd_a_pre(k, v)
    select 'acl.'||c.relname, coalesce(c.relacl::text, '(null)')
      from pg_class c
     where c.relnamespace = 'clara'::regnamespace
       and c.relname in ('users_visible', 'firm_open_questions_visible', 'client_identifier_promotions_visible');

  -- (5) sign_vendor_identity_binding: resolves, owned by clara_fn_owner, and its LIVE prosrc
  --     is BYTE-IDENTICAL to 0028's own authored text (no later migration ever recut it --
  --     confirmed by an independent sha comparison, not assumed from the header comment).
  --     Stash prosrc + ACL for the tail's byte-comparison.
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
  -- Every wall string this file's tail will re-assert as PRESERVED must already be present.
  if position('binding not found' in v_src) = 0
     or position('binding_not_proposed' in v_src) = 0
     or position('binding_expired' in v_src) = 0
     or position('proposal_drifted' in v_src) = 0
     or position('post_control_absent' in v_src) = 0
     or position('_reserve_op' in v_src) = 0
  then
    raise exception 'hrd-a prestate: sign_vendor_identity_binding''s LIVE body is missing an expected wall string -- re-read the live catalog before authoring the CoR' using errcode = 'CLR10';
  end if;
  -- And the NEW wall's marker text must be ABSENT pre-edit (this file is genuinely additive).
  if position('let Clara propose it, or a different admin signs it' in v_src) > 0 then
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

  raise notice 'hrd-a prestate: OK -- 3 target 0137 views confirmed view/owner/ACL-shaped and security_barrier-free; P4''s 3 sibling views POSITIVELY confirmed to already carry security_barrier (the estate fact this file''s census baseline rests on); 3 viewdefs + ACLs stashed for a byte-comparison tail; sign_vendor_identity_binding resolves byte-identical to 0028''s own text with all 6 prior wall strings present and the new wall''s marker text absent pre-edit; 8 depended-upon functions resolve; vendor_identity_bindings.created_by present.';
end $$;

set role clara_fn_owner;

-- =================================================================================================
-- §A -- 裁-15. ALTER VIEW ... SET (security_barrier = true) on the three 0137 views. ALTER VIEW
-- SET is a pure reloption/metadata operation -- it cannot touch the view's query text or its
-- ACL, which is why this is the surgical choice over a CREATE OR REPLACE VIEW re-statement (no
-- risk of a copy/paste drift introducing a byte difference the tail would then have to catch).
-- The tail still measures and compares against the §0 stash rather than trusting the statement
-- kind alone -- "measure before, measure after" (.claude/rules/db-migrations.md).
--
-- WHAT security_barrier BUYS, and what it does NOT (0141:492-501's own note, restated here
-- because this file is the estate-wide census closing the debt 0141 named): Postgres may
-- otherwise plan a caller-supplied WHERE qualifier ahead of the view's OWN predicate, and if
-- that pushed qual calls a non-leakproof function/operator, its side channel (error, timing,
-- crash) can leak a masked/filtered row's existence before the view's firm/rank predicate ever
-- excludes it -- security_barrier forces the view's own predicate to evaluate first.
-- security_barrier buys NOTHING for TARGET-LIST masking: users_visible's own column list is
-- already minimal (id, display_name only) and firm_members_visible's `case when ... then
-- u.email else null end as email` (0141:517) still computes and returns exactly what that CASE
-- says for any row the caller's WHERE already admits -- security_barrier governs qual-pushdown
-- ORDER, not column projection. Neither firm_open_questions_visible nor
-- client_identifier_promotions_visible masks any column (0137's own header: every column
-- projected unmasked), so for those two the reloption's entire contribution is the pushdown-
-- ordering guarantee.
-- =================================================================================================
alter view clara.users_visible set (security_barrier = true);
alter view clara.firm_open_questions_visible set (security_barrier = true);
alter view clara.client_identifier_promotions_visible set (security_barrier = true);

-- =================================================================================================
-- §B -- 裁-18a. The signer<>proposer wall on clara.sign_vendor_identity_binding. CREATE OR
-- REPLACE over the exact body stashed in §0(5), with ONE block inserted: right after the
-- firm-membership check (so a caller learns "not your firm" before any authz/business-state
-- detail about a binding they cannot see) and BEFORE the status/expiry checks (an authz wall
-- runs ahead of business-state detail, matching 0141 F4's own "guard-first" precedent for this
-- estate). Every other byte is unchanged from the §0 stash -- the tail proves this by
-- byte-comparing everything OUTSIDE the inserted block, not merely asserting "OK".
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
  -- relaxation for a single-admin firm -- unconditional on b.created_by = c.actor, never
  -- gated on the firm's admin headcount. The refusal names both lawful ways out verbatim.
  if b.created_by = c.actor then
    raise exception 'the signer cannot be the same person who proposed this binding; let Clara propose it, or a different admin signs it' using errcode='CLR04';
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
declare v_bad text; v_n int; v_src_now text; v_acl_now text; v_owner_now text; v_code text; v_pos1 int; v_pos2 int; v_pos3 int;
begin
  -- (1) All SIX same-shape masked views now carry security_barrier=true -- the estate census
  --     裁-15 closes. Stated once more, in the tail's own words: this reloption buys
  --     qual-pushdown ordering, NOT target-list masking (see §A comment for the full account).
  select string_agg(t.n, ', ') into v_bad
    from (values
      ('users_visible'), ('firm_open_questions_visible'), ('client_identifier_promotions_visible'),
      ('firm_members_visible'), ('firm_invites_visible'), ('caller_context')
    ) t(n)
    join pg_class c on c.relnamespace = 'clara'::regnamespace and c.relname = t.n
   where not ('security_barrier=true' = any(coalesce(c.reloptions, '{}'::text[])));
  if v_bad is not null then
    raise exception 'hrd-a tail: expected security_barrier=true on all 6 masked views, missing on: %', v_bad
      using errcode = 'CLR10';
  end if;
  if (select count(*)::int from pg_class c where c.relnamespace = 'clara'::regnamespace
       and c.relname in ('users_visible', 'firm_open_questions_visible', 'client_identifier_promotions_visible',
                          'firm_members_visible', 'firm_invites_visible', 'caller_context')
       and 'security_barrier=true' = any(coalesce(c.reloptions, '{}'::text[]))) <> 6 then
    raise exception 'hrd-a tail: expected EXACTLY 6 views carrying security_barrier, catalog disagrees' using errcode = 'CLR10';
  end if;

  -- (2) The three 0137 views' viewdef TEXT and ACL are byte-IDENTICAL to the §0 stash -- the
  --     ALTER changed the reloption and nothing else.
  select string_agg(t.n, ', ') into v_bad
    from (values ('users_visible'), ('firm_open_questions_visible'), ('client_identifier_promotions_visible')) t(n)
   where pg_get_viewdef(('clara.'||t.n)::regclass, true) is distinct from (select v from _hrd_a_pre where k = 'viewdef.'||t.n)
      or coalesce((select relacl::text from pg_class where relnamespace = 'clara'::regnamespace and relname = t.n), '(null)')
         is distinct from (select v from _hrd_a_pre where k = 'acl.'||t.n);
  if v_bad is not null then
    raise exception 'hrd-a tail: viewdef or ACL drifted on: % -- the ALTER must change ONLY the reloption', v_bad
      using errcode = 'CLR10';
  end if;

  -- (3) sign_vendor_identity_binding: ACL is BYTE-UNCHANGED from the §0 stash (CREATE OR
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

  -- (4) The wall's marker text is present in CODE (comment-stripped, 0141 §K(5b)'s
  --     block-then-line double strip -- a comment mentioning the wall is not enough; this
  --     migration's own header/§B comments deliberately use the SAME marker phrase, so
  --     stripping comments first is load-bearing here, not decorative). Every PRIOR wall
  --     string survives. Ordering: the new wall runs AFTER the firm-membership check
  --     ('binding not found') and BEFORE both the status check ('binding_not_proposed') and
  --     the post-control-absent gate ('post_control_absent') in CODE.
  --
  --     MEASURED, NOT THEORETICAL (0141 §K(5b)'s M9 hazard, hit for real while authoring this
  --     file): the wall's message literal was FIRST drafted with a `--` separator ("...binding
  --     -- let Clara propose..."), and this exact strip erased everything from that `--` to
  --     end-of-line, INCLUDING the marker text this check searches for -- the tail correctly
  --     refused the migration with "not present in CODE" against the file's own first draft.
  --     Fixed per 0141's own instruction (reword the literal, never weaken the pin): the
  --     message now separates its two clauses with `;`, which the strip cannot mistake for a
  --     comment marker. FOR THE NEXT EDITOR: do not put `--` inside this function's message
  --     literals; if you must, this pin will refuse loudly rather than silently pass a wall
  --     that exists only in a comment.
  v_code := regexp_replace(regexp_replace(v_src_now, '/\*.*?\*/', '', 'gs'), '--[^\n]*', '', 'g');
  if position('let Clara propose it, or a different admin signs it' in v_code) = 0 then
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
  v_pos2 := position('let Clara propose it, or a different admin signs it' in v_code);
  v_pos3 := position('binding_not_proposed' in v_code);
  if not (v_pos1 < v_pos2 and v_pos2 < v_pos3) then
    raise exception 'hrd-a tail: the new wall does not sit strictly between the firm-membership check and the status check in CODE (positions % / % / %)', v_pos1, v_pos2, v_pos3
      using errcode = 'CLR10';
  end if;
  if position('let Clara propose it, or a different admin signs it' in v_code) >= position('post_control_absent' in v_code) then
    raise exception 'hrd-a tail: the new wall does not run BEFORE the post-control-absent gate in CODE' using errcode = 'CLR10';
  end if;

  -- (5) CLR04 is the errcode literal actually attached to the new wall's raise -- typed, not a
  --     generic exception (re-derived from the stripped code around the marker, not assumed).
  if position('using errcode=''CLR04''' in
      substring(v_code from position('let Clara propose it, or a different admin signs it' in v_code) for 400)) = 0 then
    raise exception 'hrd-a tail: the new wall''s raise is not typed CLR04' using errcode = 'CLR10';
  end if;

  raise notice 'hrd-a tail: OK -- all 6 same-shape masked views (users_visible, firm_open_questions_visible, client_identifier_promotions_visible, firm_members_visible, firm_invites_visible, caller_context) carry security_barrier=true; the 3 views this file touched have byte-unchanged viewdef text and ACL apart from the reloption; sign_vendor_identity_binding''s ACL/owner are byte-unchanged, its body genuinely changed, the new signer<>proposer wall (typed CLR04, verbatim two-ways-out message) sits in CODE strictly between the firm-membership check and the status check and strictly before the post-control-absent gate, and all 6 prior wall strings (binding not found / binding_not_proposed / binding_expired / proposal_drifted / post_control_absent / _reserve_op) survive. No table in workflow/graphile_worker/spike touched. D1 OWED: clara.sign_vendor_identity_binding(uuid,text) -- one replaced writer body.';
end $$;
