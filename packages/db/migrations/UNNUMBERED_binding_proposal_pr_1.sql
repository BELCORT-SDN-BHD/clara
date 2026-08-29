-- UNNUMBERED_binding_proposal_pr_1.sql -- 裁-18b PR-1: the Clara vendor-binding PROPOSAL door.
-- Number claimed at MERGE PREPARATION (standing law, AGENTS.md + .claude/rules/db-migrations.md).
-- Authored and rig-replayed as 0150 against a main frontier of
-- 0147_db_hardening_b_hash_only_bearer_tokens (142 files); siblings hold 0148/0149.
--
-- Design of record: docs/plan/active/binding-proposal-design.md, as AMENDED by its own
-- "Rulings applied 2026-08-29 (裁-25)" header block. Gate record:
-- docs/plan/active/binding-proposal-gate-record.md (G1-G8, all RULED). Ruling ledger:
-- docs/plan/active/mohe-grill-rulings-2026-08-28.md 裁-25. WHERE THE RULING AND THE DESIGN
-- DISAGREE, THE RULING GOVERNS -- the design's SS4 build table predates it and is history.
--
-- SCOPE IS EXACTLY THE RULED PR-1 ROW, AND NOTHING ELSE:
--   * the proposal door clara.wake_propose_vendor_identity_binding, admitted on the wake kinds
--     `filing` AND `interactive` (G1 arm A: allowlist rows + grants on the EXISTING roles
--     clara_wake_filing / clara_wake_interactive -- no new wake kind, no new role, no
--     roles-bootstrap twin, no wake_credentials CHECK change, no sweep as trigger);
--   * the read verb clara.wake_list_binding_candidates -- eligibility computed by the DB ONLY
--     (G3), by CALLING the frozen derivation itself rather than re-implementing its predicate;
--     clara._coding_lane_core is UNTOUCHED;
--   * the 裁-22 basis contract through the MERGED shared resolver
--     clara._resolve_proposal_basis(p_documents uuid[], p_firm uuid, p_basis jsonb) (0143), with
--     the document SET = the three evidence invoices the derivation itself selected (G2, closed
--     by fact). `sightings` stays a FORBIDDEN argument -- derived by the DB, refused if supplied;
--   * the `decline` verb (G7 first half): admin floor, reason required, audited,
--     proposed -> declined, and read by the loop brake in wake_list_binding_candidates so Clara
--     never re-proposes what a human declined;
--   * the ONE-OPEN-PROPOSAL partial unique index per (client, counterparty) (G8) -- the human
--     door's second manual proposal now refuses with the EXISTING typed binding_conflict;
--   * the receipt-surface registry key widened to a `pb_*` family and the row `pb_binding` (G4:
--     two closed-world CHECK widenings, BOTH DIRECTIONS proven in the tail).
--
-- THE NAMED SHARED SURFACES THIS FILE TOUCHES -- FIVE, not the design's four. Annex G-f lists
-- clara.wake_fn_allowlist (+4 rows), the agent_receipt_surfaces closed-world CHECK pair (+ the
-- ninth member), clara._agent_receipts_all (+1 union arm), and -- train 2 only, NOT here --
-- clara.list_review_queue. It does NOT list the fifth: **clara.event_types**, the append-only
-- event-type registry clara.domain_events FKs into. This file adds two members to it
-- (kb_binding.agent_proposed, kb_binding.declined). The conductor's shared-surface ledger and
-- the PR body both carry the correction.
--
-- NOT IN SCOPE -- each is its own PR under the ruled five-PR sequence, and this file must not
-- pre-empt any of them:
--   * PR-2 -- the TENTH list_review_queue row_kind (`vendor_binding_proposed`). G5's premise
--     changed (裁-17's ninth, `seeding_proposal`, is live at 0146), so it ships next.
--     WHERE IT HOOKS IN, recorded here so PR-2 does not have to re-derive it:
--       - DB: clara.list_review_queue(jsonb,jsonb,integer) -- prosrc pinned in SS0 below at
--         d3a8ba444b8e387011c4d91d2291684eb2fad0588e64a3968610ec7137383657 -- a STABLE read whose
--         body is one CTE chain of `<kind>_rows as (select ... '<row_kind>'::text row_kind ...)`
--         arms unioned at the end; the tenth arm reads clara.vendor_identity_bindings where
--         status='proposed' and proposed_by_agent (both live after THIS file) joined to
--         clara.binding_agent_receipts for the rationale/model. NO D1 quiesce (STABLE, read-only).
--       - Frontend: REVIEW_QUEUE_ROW_KINDS at apps/web/lib/firm/needs-you.ts (nine members after
--         0146) and NEEDS_YOU_AFFORDANCES at apps/web/components/firm/needs-you-affordances.tsx.
--   * PR-3 -- the post-time binding re-check restored inside clara._approve_entry_core (G6,
--     OVERRULED into this item). Its OWN D1 write-quiesce window. _approve_entry_core is pinned
--     in SS0 and re-asserted BYTE-IDENTICAL in the tail of THIS file, precisely so PR-3's own
--     prestate has an undisturbed pre-image to pin.
--   * PR-4 -- the expiry sweep engine source + its enable ceremony (G7 second half). This file
--     adds NO clara.wake_engine_sources row (the two live rows both stay disabled) and NO
--     workflow export.
--
-- =====================================================================================
-- SS0 -- D1 WRITE-QUIESCE INVENTORY: EMPTY. Proven, not asserted.
-- =====================================================================================
-- NO live PL/pgSQL function body is replaced by this file. Every function it installs is a
-- BRAND-NEW NAME -- clara._derive_vendor_binding_basis, clara._propose_vendor_binding_agent_core,
-- clara.wake_propose_vendor_identity_binding, clara.wake_list_binding_candidates,
-- clara.decline_vendor_identity_binding -- and the tail proves each resolves at EXACTLY ONE
-- pg_proc row, as a census over pg_proc, never as a claim in this comment.
--
-- TWO VIEWS are CREATE OR REPLACE'd: clara._agent_receipt_src_pb_binding (a brand-new name, so a
-- first creation dressed as CoR only by the estate's idiom) and clara._agent_receipts_all
-- (widened by one UNION ALL arm, its NINTH). Neither is a D1 event -- a view definition has no
-- "an in-flight call runs the old body" hazard the way a PL/pgSQL function does; once the DDL
-- commits every subsequent SELECT sees the new definition (0142 SS0's own measured reasoning,
-- inherited verbatim rather than re-argued). clara.agent_receipts_visible is UNTOUCHED: it
-- already reads `r.* from clara._agent_receipts_all r`.
--
-- THE HUMAN DOOR'S BEHAVIOUR CHANGES WITHOUT ITS BODY CHANGING, AND THAT IS KNOWINGLY ACCEPTED
-- (G8, ruled). uq_vib_one_open_proposal makes a SECOND manual clara.propose_vendor_identity_
-- binding call on an already-proposed (client, counterparty) pair refuse -- and it refuses with
-- the ESTATE'S EXISTING TYPED binding_conflict, because that body already wraps its INSERT in
-- `exception when unique_violation then raise 'binding_conflict' using errcode='CLR36'`
-- (0028_vendor_identity_binding.sql:770-772). Its prosrc is pinned unchanged in SS0 AND
-- re-asserted byte-identical in the tail: the behaviour moved, the body did not. The battery
-- proves the typed refusal on BOTH paths (agent-then-human and human-then-agent).
--
-- THE DDL THIS FILE DOES TAKE, and why it is not a D1 obligation: six ADD COLUMNs, five CHECKs,
-- one FK and one partial unique index on clara.vendor_identity_bindings, plus two constraint
-- drop/adds on clara.agent_receipt_surfaces. Each takes ACCESS EXCLUSIVE briefly. The
-- `set local lock_timeout` below is PRECAUTIONARY, not load-bearing.
--
-- =====================================================================================
-- WHY A REFUSAL WRITES NO RECEIPT -- stated plainly rather than claimed away
-- =====================================================================================
-- Every wall in this file RAISEs. A raise rolls back the whole call, so no refused proposal can
-- leave a receipt behind: there is no path today that writes a binding_agent_receipts row with a
-- non-empty failing_rungs. This is a DELIBERATE deviation from the design annexes' cell R-2,
-- which assumed a non-raising refusal path this door does not have (and which PostgreSQL cannot
-- give it without an autonomous transaction). The `failing_rungs` column still exists -- the
-- 19-column receipt contract REQUIRES it at ordinal 13 -- and ck_bar_proposed_iff_clean is a
-- REAL wall over it, proven in the tail by direct INSERT probes in BOTH lying directions. It is
-- the shape a future non-raising refusal path must satisfy; it is not a description of a
-- behaviour that exists. Absence is not evidence, so the absence is named here rather than left
-- for a reviewer to discover.
--
-- =====================================================================================
-- SS1 -- PRESTATE. Fail-closed; an absent or wrong-shaped premise aborts the apply, loudly.
-- =====================================================================================
do $bp1_pre$
declare v_missing text; v_def text; v_src text; v_sha text; v_n int;
begin
  if not exists (select 1 from clara.schema_migrations
                  where version = '0147_db_hardening_b_hash_only_bearer_tokens') then
    raise exception 'binding proposal pr-1 prestate: 0147_db_hardening_b_hash_only_bearer_tokens is not applied -- frontier mismatch'
      using errcode = 'CLR10';
  end if;

  -- (a) NOTHING this file creates may already exist.
  select string_agg(t.n, ', ' order by t.n) into v_missing
    from (values ('binding_agent_receipts'),('_agent_receipt_src_pb_binding')) t(n)
   where to_regclass('clara.'||t.n) is not null;
  if v_missing is not null then
    raise exception 'binding proposal pr-1 prestate: relation(s) already present: %', v_missing using errcode = 'CLR10';
  end if;
  select string_agg(t.n, ', ' order by t.n) into v_missing
    from (values ('clara._derive_vendor_binding_basis(uuid,uuid,uuid)'),
                 ('clara._propose_vendor_binding_agent_core(uuid,uuid,text,uuid,uuid,uuid,jsonb,text,jsonb,text)'),
                 ('clara.wake_propose_vendor_identity_binding(uuid,uuid,jsonb,text,jsonb,text)'),
                 ('clara.wake_list_binding_candidates(uuid)'),
                 ('clara.decline_vendor_identity_binding(uuid,text,text)')) t(n)
   where to_regprocedure(t.n) is not null;
  if v_missing is not null then
    raise exception 'binding proposal pr-1 prestate: function(s) already present: %', v_missing using errcode = 'CLR10';
  end if;
  -- The BARE NAMES too, not just the signatures -- an overload under a different arity would
  -- make every "exactly one pg_proc row" tail cell a lie (review law 3: a signature probe reads
  -- one projection of the name; the bare-name census reads the name itself).
  select string_agg(p.proname, ', ' order by p.proname) into v_missing
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara' and p.proname in
     ('_derive_vendor_binding_basis','_propose_vendor_binding_agent_core',
      'wake_propose_vendor_identity_binding','wake_list_binding_candidates',
      'decline_vendor_identity_binding');
  if v_missing is not null then
    raise exception 'binding proposal pr-1 prestate: pg_proc already carries name(s) under some arity: %', v_missing
      using errcode = 'CLR10';
  end if;

  select string_agg(t.n, ', ' order by t.n) into v_missing
    from (values ('proposed_by_agent'),('proposer_model'),('proposal_receipt_id'),
                 ('declined_by'),('declined_at'),('decline_reason')) t(n)
   where exists (select 1 from pg_attribute a
                  where a.attrelid = 'clara.vendor_identity_bindings'::regclass
                    and a.attnum > 0 and not a.attisdropped and a.attname = t.n);
  if v_missing is not null then
    raise exception 'binding proposal pr-1 prestate: vendor_identity_bindings already carries column(s): %', v_missing
      using errcode = 'CLR10';
  end if;
  if exists (select 1 from pg_class where relname = 'uq_vib_one_active_binding'
              and relnamespace = 'clara'::regnamespace) then
    raise exception 'binding proposal pr-1 prestate: uq_vib_one_active_binding already exists' using errcode = 'CLR10';
  end if;
  -- PREFLIGHT for the widened index (conductor ruling (c): RECONCILE means REFUSE, never
  -- de-duplicate). Today's world admits N proposed rows per pair AND a proposed row alongside a
  -- live one; the new index forbids both. On a populated database the CREATE INDEX would fail
  -- with a bare 23505 naming one arbitrary tuple. This names every offending pair up front, so
  -- the operator gets a data decision to take rather than a mystery. Choosing FOR the owner
  -- which duplicate survives is not a migration's call.
  select string_agg(format('client=%s counterparty=%s x%s', t.client_id, t.counterparty_id, t.n), '; ')
    into v_missing
    from (select client_id, counterparty_id, count(*) n
            from clara.vendor_identity_bindings
           where status in ('proposed','live')
           group by client_id, counterparty_id having count(*) > 1) t;
  if v_missing is not null then
    raise exception 'binding proposal pr-1 prestate: % (client, counterparty) pair(s) already carry more than one proposed/live binding, so uq_vib_one_active_binding cannot be built -- reconcile them by hand first, this migration will not choose which row survives: %',
      (select count(*) from (select 1 from clara.vendor_identity_bindings where status in ('proposed','live')
                              group by client_id, counterparty_id having count(*) > 1) z),
      v_missing using errcode = 'CLR10';
  end if;
  -- vendor_identity_bindings is the 17-column shape this file was authored against.
  select count(*)::int into v_n from pg_attribute a
   where a.attrelid = 'clara.vendor_identity_bindings'::regclass and a.attnum > 0 and not a.attisdropped;
  if v_n <> 17 then
    raise exception 'binding proposal pr-1 prestate: vendor_identity_bindings carries % column(s), expected the pre-existing 17', v_n
      using errcode = 'CLR10';
  end if;

  if exists (select 1 from clara.wake_fn_allowlist
              where function_name in ('wake_propose_vendor_identity_binding','wake_list_binding_candidates')) then
    raise exception 'binding proposal pr-1 prestate: the allowlist already names a binding wake verb' using errcode = 'CLR10';
  end if;
  -- The whole allowlist, as a closed-world count: 88 rows over 7 kinds, ZERO of them naming any
  -- binding verb at all (survey S2, re-measured live here rather than inherited).
  select count(*)::int into v_n from clara.wake_fn_allowlist where function_name ilike '%binding%';
  if v_n <> 0 then
    raise exception 'binding proposal pr-1 prestate: the allowlist already carries % binding row(s)', v_n using errcode = 'CLR10';
  end if;
  if exists (select 1 from clara.agent_receipt_surfaces where item = 'pb_binding'
              or receipt_kind = 'binding_agent' or expected_source = 'binding_agent_receipts') then
    raise exception 'binding proposal pr-1 prestate: agent_receipt_surfaces already carries a pb_binding/binding_agent row'
      using errcode = 'CLR10';
  end if;

  -- (b) THE TWO CLOSED-WORLD REGEXES THIS FILE WIDENS, read BYTE-EXACT from the LIVE catalog --
  --     never copied from 0142's text (the superseded-body class).
  select pg_get_constraintdef(oid) into v_def from pg_constraint
   where conrelid = 'clara.agent_receipt_surfaces'::regclass and conname = 'agent_receipt_surfaces_item_check';
  if v_def is distinct from 'CHECK ((item ~ ''^f_a[0-9]+[a-z]?$''::text))' then
    raise exception 'binding proposal pr-1 prestate: agent_receipt_surfaces_item_check is not the live f_a-only world this file widens (live: %)',
      coalesce(v_def, '(constraint absent)') using errcode = 'CLR10';
  end if;
  select pg_get_constraintdef(oid) into v_def from pg_constraint
   where conrelid = 'clara.agent_receipt_surfaces'::regclass and conname = 'agent_receipt_surfaces_shim_relname_check';
  if v_def is distinct from 'CHECK ((shim_relname ~ ''^_agent_receipt_src_f_a[0-9]+[a-z]?$''::text))' then
    raise exception 'binding proposal pr-1 prestate: agent_receipt_surfaces_shim_relname_check is not the live f_a-only world this file widens (live: %)',
      coalesce(v_def, '(constraint absent)') using errcode = 'CLR10';
  end if;
  if (select count(*) from clara.agent_receipt_surfaces) <> 8 then
    raise exception 'binding proposal pr-1 prestate: agent_receipt_surfaces holds % row(s), expected the pre-existing 8',
      (select count(*) from clara.agent_receipt_surfaces) using errcode = 'CLR10';
  end if;

  -- (b2) THE EVENT-TYPE REGISTRY -- the fifth named shared surface this file touches, and the
  --      one the design's annex G-f ledger does not list. clara.domain_events.event_type is
  --      FK-bound to the APPEND-ONLY clara.event_types and additionally gated by the
  --      _tf_validate_domain_event trigger. Read the REGISTRY, not a CHECK on a relation that
  --      does not exist -- the first draft of this file did the latter and mistook an empty
  --      result for an open world.
  if to_regclass('clara.event_types') is null then
    raise exception 'binding proposal pr-1 prestate: clara.event_types is absent -- the event gate this file registers into does not exist'
      using errcode = 'CLR10';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'clara.domain_events'::regclass
                  and conname = 'domain_events_event_type_fkey' and contype = 'f') then
    raise exception 'binding proposal pr-1 prestate: domain_events no longer FKs its event_type to the registry -- the premise for registering has moved'
      using errcode = 'CLR10';
  end if;
  select string_agg(t.n, ', ' order by t.n) into v_missing
    from (values ('kb_binding.agent_proposed'),('kb_binding.declined')) t(n)
   where exists (select 1 from clara.event_types e where e.name = t.n);
  if v_missing is not null then
    raise exception 'binding proposal pr-1 prestate: clara.event_types already carries: %', v_missing using errcode = 'CLR10';
  end if;
  -- The three kb_binding.* members 0028 registered are the live world this file extends by two.
  if (select count(*) from clara.event_types where name like 'kb_binding.%') <> 3 then
    raise exception 'binding proposal pr-1 prestate: clara.event_types carries % kb_binding.* member(s), expected the pre-existing 3',
      (select count(*) from clara.event_types where name like 'kb_binding.%') using errcode = 'CLR10';
  end if;
  -- (the registry's pre-count is stashed in (k), once the temp table exists)

  -- (c) The status CHECK already admits 'declined' -- the value the decline verb writes. If it
  --     did not, this file would owe a widening it does not take.
  select pg_get_constraintdef(oid) into v_def from pg_constraint
   where conrelid = 'clara.vendor_identity_bindings'::regclass and conname = 'vendor_identity_bindings_status_check';
  if v_def is distinct from
     'CHECK ((status = ANY (ARRAY[''proposed''::text, ''live''::text, ''revoked''::text, ''declined''::text, ''expired''::text])))' then
    raise exception 'binding proposal pr-1 prestate: vendor_identity_bindings_status_check is not the live 5-value world (live: %)',
      coalesce(v_def, '(constraint absent)') using errcode = 'CLR10';
  end if;
  -- ck_vib_revoked is the honesty idiom the new declined pair mirrors; read live so the mirror
  -- is of the real thing, not of a remembered one.
  select pg_get_constraintdef(oid) into v_def from pg_constraint
   where conrelid = 'clara.vendor_identity_bindings'::regclass and conname = 'ck_vib_revoked';
  if v_def is distinct from 'CHECK (((status = ''revoked''::text) = (revoked_at IS NOT NULL)))' then
    raise exception 'binding proposal pr-1 prestate: ck_vib_revoked is not the live honesty idiom this file mirrors (live: %)',
      coalesce(v_def, '(constraint absent)') using errcode = 'CLR10';
  end if;

  -- (d) THE 裁-22 RESOLVER, BY EXACT SIGNATURE (review law 3 -- a bare name is a projection, not
  --     the thing) AND BY PROSRC SHA. This door is 裁-22's THIRD consumer; if the merged
  --     resolver ever drifts, this file must not silently wire onto a different contract.
  if to_regprocedure('clara._resolve_proposal_basis(uuid[],uuid,jsonb)') is null then
    raise exception 'binding proposal pr-1 prestate: clara._resolve_proposal_basis(uuid[],uuid,jsonb) -- 0143''s document-SET resolver -- is ABSENT'
      using errcode = 'CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara._resolve_proposal_basis(uuid[],uuid,jsonb)'::regprocedure;
  v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
  if v_sha <> 'dddd2747d3a440d2f5e644e1bac79c23ec227d6e71960c075016afb3fa60c3b5' then
    raise exception 'binding proposal pr-1 prestate: _resolve_proposal_basis prosrc sha256 mismatch (got %, expected dddd2747d3a440d2f5e644e1bac79c23ec227d6e71960c075016afb3fa60c3b5) -- the shared 裁-22 contract moved under this door',
      v_sha using errcode = 'CLR10';
  end if;
  -- And it must exist under EXACTLY ONE arity: a shadowed single-document overload would let a
  -- typo bind this door to the wrong contract at first call rather than here.
  select count(*)::int into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara' and p.proname = '_resolve_proposal_basis';
  if v_n <> 1 then
    raise exception 'binding proposal pr-1 prestate: clara._resolve_proposal_basis resolves at % pg_proc row(s), expected exactly 1', v_n
      using errcode = 'CLR10';
  end if;

  -- (e) THE 裁-18a SIGNER<>PROPOSER WALL IS LIVE, and this door must leave it satisfiable.
  --     Proven POSITIVELY (what a read actually SAW -- review law 2), by the wall's own DETAIL
  --     reason token in the live body, not by the body's absence of something.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.sign_vendor_identity_binding(uuid,text)'::regprocedure;
  if v_src is null then
    raise exception 'binding proposal pr-1 prestate: clara.sign_vendor_identity_binding is GONE' using errcode = 'CLR10';
  end if;
  if position('detail=''{"reason":"signer_is_proposer"}''' in v_src) = 0 then
    raise exception 'binding proposal pr-1 prestate: the 裁-18a signer<>proposer wall is NOT live in sign_vendor_identity_binding -- this door''s whole reason for existing (裁-18c''s first way out) is unproven'
      using errcode = 'CLR10';
  end if;
  -- It is an ACTOR COMPARISON, not a "the proposer must be human" test (annex G-a). Read in
  -- CODE: `b.created_by = c.actor`. Written the other way it would refuse Clara's proposals and
  -- strand every single-admin firm.
  if position('b.created_by = c.actor' in v_src) = 0 then
    raise exception 'binding proposal pr-1 prestate: the 裁-18a wall is not the actor comparison this door depends on'
      using errcode = 'CLR10';
  end if;
  v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
  if v_sha <> '5285581ec371856d525fb47d2cfabc6e72b3a37285b291390e8c7aa34034e941' then
    raise exception 'binding proposal pr-1 prestate: sign_vendor_identity_binding prosrc sha256 mismatch (got %, expected 5285581ec371856d525fb47d2cfabc6e72b3a37285b291390e8c7aa34034e941)',
      v_sha using errcode = 'CLR10';
  end if;

  -- (f) THE DO-NOT-TOUCH BODIES, pinned by prosrc sha256 so the tail's re-pin is a real
  --     before/after comparison and a drift ABORTS the apply rather than passing silently.
  --     Instrument: encode(sha256(convert_to(prosrc,'UTF8')),'hex') -- prosrc, never
  --     pg_get_functiondef (which folds in ACL-independent decoration).
  create temp table _bp1_pre(k text primary key, v text);
  insert into _bp1_pre(k, v)
  select t.sig,
         encode(sha256(convert_to(
           (select p.prosrc from pg_proc p where p.oid = t.sig::regprocedure), 'UTF8')), 'hex')
    from (values
      ('clara.propose_vendor_identity_binding(jsonb,text)'),
      ('clara.sign_vendor_identity_binding(uuid,text)'),
      ('clara.revoke_vendor_identity_binding(uuid,text,text)'),
      ('clara._derive_vendor_binding_proposal(uuid,uuid,uuid)'),
      ('clara._resolve_vendor_binding(uuid,uuid,uuid)'),
      ('clara._binding_common_prefix(text,text,text)'),
      ('clara._binding_f3_holds(uuid,text,text)'),
      ('clara._coding_lane_core(uuid,uuid)'),
      ('clara.get_vendor_binding(uuid)'),
      ('clara.list_vendor_bindings(uuid)'),
      ('clara.list_review_queue(jsonb,jsonb,integer)'),
      ('clara.agent_user_id()'),
      ('clara._approve_entry_core(jsonb,uuid,uuid,text,text)'),
      ('clara._draft_entry_core(uuid,uuid,uuid,text,boolean,uuid,uuid,date,text,jsonb,uuid,text,jsonb,text,bigint,jsonb,jsonb,jsonb,text)'),
      ('clara.revise_entry(uuid,jsonb,jsonb,jsonb,uuid,text,jsonb,jsonb)'),
      ('clara._firm_question_core(uuid,uuid,uuid,text,uuid,text,text,jsonb,text)'),
      ('clara._resolve_proposal_basis(uuid[],uuid,jsonb)'),
      ('clara.eligible_checker_count(uuid)')
    ) t(sig);
  if exists (select 1 from _bp1_pre where v is null) then
    raise exception 'binding proposal pr-1 prestate: a DO-NOT-TOUCH body did not resolve: %',
      (select string_agg(k, ', ' order by k) from _bp1_pre where v is null) using errcode = 'CLR10';
  end if;
  -- The two whose EXACT bytes this file's whole design rests on are pinned against literals, not
  -- merely stashed: the frozen derivation (survey S4 -- its content_hash covers the evidence
  -- array, so any drift un-signs every open proposal) and the shared lane body G3 forbids
  -- touching.
  if (select v from _bp1_pre where k = 'clara._derive_vendor_binding_proposal(uuid,uuid,uuid)')
     <> 'de0f58078f23ef2c6ce3f4a82cb29691a3633e3b8b9c48ae90babc53e7ee043c' then
    raise exception 'binding proposal pr-1 prestate: _derive_vendor_binding_proposal is NOT the byte-frozen de0f5807... body this design is built on (got %)',
      (select v from _bp1_pre where k = 'clara._derive_vendor_binding_proposal(uuid,uuid,uuid)') using errcode = 'CLR10';
  end if;
  if (select v from _bp1_pre where k = 'clara._coding_lane_core(uuid,uuid)')
     <> '721a6704e3284679103537bdda56bf741422041e16dda0f4654394f1d9506fda' then
    raise exception 'binding proposal pr-1 prestate: _coding_lane_core is not the 721a6704... body G3 rules untouched (got %)',
      (select v from _bp1_pre where k = 'clara._coding_lane_core(uuid,uuid)') using errcode = 'CLR10';
  end if;

  -- (g) The live premises this file builds ON, each named individually.
  select string_agg(t.n, ', ' order by t.n) into v_missing
    from (values ('clara.jwt_firm()'),('clara.jwt_sub()'),('clara.actor_role_rank()'),
                 ('clara.role_rank(text)'),('clara._human_ctx(integer)'),
                 ('clara.agent_user_id()'),('clara.wake_context()'),('clara._wake_task_id()'),
                 ('clara.name_family_is_ambiguous(uuid,text)'),
                 ('clara.assert_wake_allowed(text,text)'),
                 ('clara._reserve_op(uuid,text,text,bytea)'),('clara._finish_op(uuid,text,text,jsonb)'),
                 ('clara._hash(jsonb)'),('clara._audit(uuid,uuid,uuid,text,text,uuid,jsonb)'),
                 ('clara._append_event(uuid,text,uuid,uuid,uuid,text,uuid,uuid,uuid,jsonb)'),
                 ('clara._tf_append_only()'),('clara._tf_no_truncate()'),
                 ('clara._canonical_counterparty(uuid,uuid)'),('clara._binding_normalize(text)'),
                 ('clara._assert_receipt_surface_conforms(text)'),
                 ('clara.agent_receipt_source_census()'),('clara.agent_receipt_dark_rows()')) t(n)
   where to_regprocedure(t.n) is null;
  if v_missing is not null then
    raise exception 'binding proposal pr-1 prestate: required live function(s) absent: %', v_missing using errcode = 'CLR10';
  end if;
  select string_agg(t.n, ', ' order by t.n) into v_missing
    from (values ('firms'),('clients'),('counterparties'),('users'),('documents'),
                 ('document_regions'),('document_extractions'),('journal_entries'),('journal_lines'),
                 ('vendor_identity_bindings'),('vendor_identity_binding_evidence'),
                 ('wake_fn_allowlist'),('wake_credentials'),('op_receipts'),('client_resolutions'),
                 ('agent_receipt_contract'),('agent_receipt_surfaces'),('agent_receipts_visible'),
                 ('_agent_receipts_all')) t(n)
   where to_regclass('clara.'||t.n) is null;
  if v_missing is not null then
    raise exception 'binding proposal pr-1 prestate: required live relation(s) absent: %', v_missing using errcode = 'CLR10';
  end if;

  -- (h) BOTH executor roles G1 arm A grants to must already exist -- this file mints NO role and
  --     therefore owes NO packages/db/deploy/roles-bootstrap.sql twin (the W2/W3 law (1) does
  --     not fire). Proven by reading pg_roles, not by the absence of a CREATE ROLE below.
  select string_agg(t.n, ', ' order by t.n) into v_missing
    from (values ('clara_wake_filing'),('clara_wake_interactive'),('clara_fn_owner'),
                 ('clara_authenticated')) t(n)
   where not exists (select 1 from pg_roles where rolname = t.n);
  if v_missing is not null then
    raise exception 'binding proposal pr-1 prestate: required role(s) absent: %', v_missing using errcode = 'CLR10';
  end if;
  -- Both wake kinds already exist in the credential CHECK -- this file widens NO closed world
  -- there, which is exactly what makes G1 arm A cost two allowlist rows instead of a new kind.
  select pg_get_constraintdef(oid) into v_def from pg_constraint
   where conrelid = 'clara.wake_credentials'::regclass and conname = 'ck_wake_credentials_kind_0011';
  if v_def is null or position('''filing''' in v_def) = 0 or position('''interactive''' in v_def) = 0 then
    raise exception 'binding proposal pr-1 prestate: ck_wake_credentials_kind_0011 does not already admit both filing and interactive (live: %)',
      coalesce(v_def, '(absent)') using errcode = 'CLR10';
  end if;

  -- (i) The agent sentinel is a REAL is_agent user row (survey S3) -- what makes the honesty
  --     CHECK meaningful and 裁-18a satisfiable by construction.
  if not exists (select 1 from clara.users u where u.id = clara.agent_user_id() and u.is_agent) then
    raise exception 'binding proposal pr-1 prestate: clara.agent_user_id() is not a live is_agent users row' using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from clara.users where is_agent;
  if v_n <> 1 then
    raise exception 'binding proposal pr-1 prestate: clara.users carries % is_agent row(s), expected exactly 1', v_n using errcode = 'CLR10';
  end if;
  -- The honesty CHECK below is only legal because agent_user_id() is IMMUTABLE and relation-free
  -- (design risk R1 / prediction P-2). Measured here rather than assumed.
  if (select p.provolatile from pg_proc p where p.oid = 'clara.agent_user_id()'::regprocedure) <> 'i' then
    raise exception 'binding proposal pr-1 prestate: clara.agent_user_id() is not IMMUTABLE -- the honesty CHECK cannot be built on it'
      using errcode = 'CLR10';
  end if;

  -- (j) The composite keys the two new FKs need.
  if not exists (select 1 from pg_constraint where conrelid = 'clara.counterparties'::regclass
                  and contype = 'u' and pg_get_constraintdef(oid) = 'UNIQUE (id, firm_id, client_id)') then
    raise exception 'binding proposal pr-1 prestate: counterparties has no UNIQUE (id, firm_id, client_id) for the receipt FK'
      using errcode = 'CLR10';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'clara.vendor_identity_bindings'::regclass
                  and conname = 'uq_vendor_bindings_id_firm_client') then
    raise exception 'binding proposal pr-1 prestate: uq_vendor_bindings_id_firm_client is absent' using errcode = 'CLR10';
  end if;

  -- (k) CONSTRAINT 15: the frozen prior build and the Slice-0 parked run are not this file's
  --     business. Counted before, re-counted in the tail.
  insert into _bp1_pre(k, v) values ('foreign_objs',
    (select coalesce(count(*),0)::text from pg_class c join pg_namespace n2 on n2.oid = c.relnamespace
      where n2.nspname in ('workflow','graphile_worker','spike')));
  insert into _bp1_pre(k, v) values ('event_types_total',
    (select count(*)::text from clara.event_types));

  raise notice 'binding proposal pr-1 prestate: clean -- frontier 0147; 2 new relations + 5 new function names absent under EVERY arity; vendor_identity_bindings is the pre-existing 17-column shape carrying none of the 6 new columns and no uq_vib_one_open_proposal; the allowlist carries ZERO binding rows (of 88 over 7 kinds); agent_receipt_surfaces holds exactly 8 rows with both closed-world regexes read BYTE-EXACT at their live f_a-only text; the status CHECK already admits ''declined'' and ck_vib_revoked read live as the honesty idiom the declined pair mirrors; 裁-22''s clara._resolve_proposal_basis(uuid[],uuid,jsonb) resolves at EXACTLY ONE pg_proc row with prosrc dddd2747...; the 裁-18a signer<>proposer wall is POSITIVELY present in sign_vendor_identity_binding as an ACTOR COMPARISON (prosrc 5285581e...); 18 DO-NOT-TOUCH bodies stashed by prosrc sha256 with _derive_vendor_binding_proposal pinned at de0f5807... and _coding_lane_core at 721a6704...; 20 live functions + 18 live relations + 4 roles present; both wake kinds already in the credential CHECK (no closed world widened there); exactly one is_agent user row and agent_user_id() is IMMUTABLE (P-2''s precondition).';
end
$bp1_pre$;

set role clara_fn_owner;

-- PRECAUTIONARY, not load-bearing (.claude/rules/db-migrations.md asks which). The ALTERs below
-- take ACCESS EXCLUSIVE on clara.vendor_identity_bindings and clara.agent_receipt_surfaces. Both
-- carry tens of rows on any real chain, so the ALTERs themselves complete instantly once the
-- lock is granted -- the exposure is lock ACQUISITION queueing behind a long-running reader, and
-- a short bounded wait turns an indefinite hang into a named, retryable failure.
set local lock_timeout = '5s';

-- =====================================================================================
-- SS2 -- THE RECEIPT TABLE (design SS3.5 / annex B). A NINTH registered member, because
-- neither existing table can host this act: agent_filing_receipts'
-- ck_agent_filing_receipts_filed_iff_clean makes a clean, filing-less receipt structurally
-- impossible (and relaxing it is the vacuous-relaxation class the W2/W3 close named), and
-- agent_act_receipts demands a wake_task_id FK the chat-turn trigger has not got plus two
-- close-domain closed-world widenings. Both measured in the survey (S7), neither re-argued here.
-- =====================================================================================
create table clara.binding_agent_receipts (
  id               uuid        primary key default gen_random_uuid(),
  firm_id          uuid        not null references clara.firms(id),
  client_id        uuid        not null,
  counterparty_id  uuid        not null,
  binding_id       uuid,
  model            text,
  model_version    text,
  rationale        text        not null check (btrim(rationale) <> ''),
  verdict          jsonb       not null check (jsonb_typeof(verdict) = 'object'),
  failing_rungs    text[]      not null default '{}'::text[],
  via_wake_kind    text        not null,
  trigger_kind     text        not null check (trigger_kind in ('wake_task','wake_credential')),
  trigger_id       text        not null check (btrim(trigger_id) <> ''),
  authorization_id uuid,
  adopted_verbatim boolean,
  acting_actor     uuid        not null,
  on_behalf_of     uuid,
  created_at       timestamptz not null default now(),
  constraint uq_binding_agent_receipts_id_firm unique (id, firm_id),
  constraint fk_bar_client foreign key (client_id, firm_id)
    references clara.clients(id, firm_id),
  constraint fk_bar_counterparty foreign key (counterparty_id, firm_id, client_id)
    references clara.counterparties(id, firm_id, client_id),
  constraint fk_bar_binding foreign key (binding_id, firm_id, client_id)
    references clara.vendor_identity_bindings(id, firm_id, client_id),
  constraint ck_bar_proposed_iff_clean
    check ((binding_id is not null) = (failing_rungs = '{}'::text[]))
);
comment on table clara.binding_agent_receipts is
  '裁-18b PR-1: one row per Clara vendor-binding proposal act. client_id and counterparty_id are '
  'both NOT NULL -- unlike F-A7b''s plan-tied acts, every member of this family is client- AND '
  'counterparty-scoped, so a nullable here would be a wall nothing needs. binding_id is nullable '
  'and paired with failing_rungs by ck_bar_proposed_iff_clean (the 0126 filed-iff-clean idiom in '
  'the form that is TRUE for this act rather than borrowed and relaxed): TODAY every refusal in '
  'clara._propose_vendor_binding_agent_core RAISEs, so no live path writes a dirty row -- the '
  'CHECK is the wall a future non-raising refusal path must satisfy, and the migration''s own '
  'header says so plainly rather than implying a behaviour that does not exist. '
  'THE TRIGGER PAIR IS HONEST -- trigger_id NAMES WHAT trigger_kind SAYS IT IS. ''wake_task'' '
  'carries a REAL clara.agent_tasks id (read from the credential via clara._wake_task_id()); '
  '''wake_credential'' carries the credential uuid UNDER ITS OWN NAME. Conductor ruling '
  '2026-08-29, OVERRULING this item''s design SS3.5, which had it inherit the estate''s current '
  'looseness verbatim: the three live writers (0126 x2, 0142) pass a CREDENTIAL uuid under '
  '''wake_task'', and this table does not copy that. ''chat_turn'' is deliberately NOT carried '
  'over -- this door has no turn-id-bearing carrier, and an admitted-but-never-writable value is '
  'exactly the unreachable-arm defect this item''s own survey found next door (S5). Fixing the '
  'three existing writers is a separate backlog PR. Append-only.';
create index ix_binding_agent_receipts_binding on clara.binding_agent_receipts(binding_id, firm_id)
  where binding_id is not null;
create index ix_binding_agent_receipts_open on clara.binding_agent_receipts(firm_id, created_at desc);

alter table clara.binding_agent_receipts enable row level security;
alter table clara.binding_agent_receipts force  row level security;
create policy p_binding_agent_receipts_owner on clara.binding_agent_receipts
  for all to clara_fn_owner using (true) with check (true);
create trigger t_binding_agent_receipts_append_only
  before delete or update on clara.binding_agent_receipts
  for each row execute function clara._tf_append_only();
create trigger t_binding_agent_receipts_no_truncate
  before truncate on clara.binding_agent_receipts
  for each statement execute function clara._tf_no_truncate();
-- No `revoke ... from public` (0126 SS3's measured finding: a relation carries no default PUBLIC
-- grant, so such a revoke only materializes a no-op explicit ACL the DR round-trip's aclexplode
-- diff then reads as drift). No clara_authenticated grant either -- the read is
-- clara.agent_receipts_visible and nowhere else.

-- =====================================================================================
-- SS3 -- G4: WIDEN THE RECEIPT-SURFACE REGISTRY TO A `pb_*` FAMILY, and register pb_binding.
-- Extend-only, both directions proven in the tail by REAL INSERT probes.
-- =====================================================================================
-- The pre-beta ruling queue (裁-17, 裁-18, 裁-19) has no Wave-F number to honestly claim, and a
-- register whose keys lie is a register nobody can audit (gate record G4, arm A). The f_a arm is
-- preserved BYTE-FOR-BYTE inside the alternation, so no existing row's admissibility can move.
alter table clara.agent_receipt_surfaces drop constraint agent_receipt_surfaces_item_check;
alter table clara.agent_receipt_surfaces add constraint agent_receipt_surfaces_item_check
  check (item ~ '^(f_a[0-9]+[a-z]?|pb_[a-z][a-z0-9_]*)$');
alter table clara.agent_receipt_surfaces drop constraint agent_receipt_surfaces_shim_relname_check;
alter table clara.agent_receipt_surfaces add constraint agent_receipt_surfaces_shim_relname_check
  check (shim_relname ~ '^_agent_receipt_src_(f_a[0-9]+[a-z]?|pb_[a-z][a-z0-9_]*)$');

insert into clara.agent_receipt_surfaces(item, receipt_kind, shim_relname, expected_source) values
  ('pb_binding','binding_agent','_agent_receipt_src_pb_binding','binding_agent_receipts');

-- =====================================================================================
-- SS3a -- THE EVENT-TYPE REGISTRY: two new members (a FIFTH named shared surface).
-- =====================================================================================
-- clara.domain_events.event_type is FK-constrained to the APPEND-ONLY clara.event_types
-- registry and additionally gated by the _tf_validate_domain_event trigger, which raises CLR10
-- 'unknown event_type %' for anything unregistered. Both new acts therefore need a row, and both
-- are client_scoped (a binding is always a client's), matching the three kb_binding.* members
-- 0028 registered. This surface is NOT in the design's annex G-f shared-surface ledger; the PR
-- body adds it.
insert into clara.event_types(name, client_scoped, description) values
  ('kb_binding.agent_proposed', true, 'Clara proposed a vendor identity binding (裁-18b)'),
  ('kb_binding.declined',       true, 'A human admin declined a proposed vendor identity binding (裁-18b/G7)');

-- The shim -- a real projection from the start. subject_id is coalesce(binding_id,
-- counterparty_id) so a receipt without a binding row still names the thing it was about.
create view clara._agent_receipt_src_pb_binding as
  select
    'binding_agent'::text                             as receipt_kind,
    r.id::text                                        as receipt_id,
    r.firm_id                                         as firm_id,
    r.client_id                                       as client_id,
    coalesce(r.binding_id, r.counterparty_id)::text   as subject_id,
    r.acting_actor                                    as acting_actor,
    r.on_behalf_of                                    as on_behalf_of,
    r.created_at                                      as occurred_at,
    r.model                                           as model,
    r.model_version                                   as model_version,
    r.rationale                                       as rationale,
    r.verdict                                         as verdict,
    r.failing_rungs                                   as failing_rungs,
    r.via_wake_kind                                   as via_wake_kind,
    r.trigger_kind                                    as trigger_kind,
    r.trigger_id                                      as trigger_id,
    r.authorization_id                                as authorization_id,
    r.adopted_verbatim                                as adopted_verbatim,
    'firm'::text                                      as scope
  from clara.binding_agent_receipts r;

select clara._assert_receipt_surface_conforms('_agent_receipt_src_pb_binding');

-- The NINTH union arm. clara.agent_receipts_visible is UNTOUCHED; the eight existing arms are
-- reproduced from the LIVE view definition read on the rig, never from 0142's text.
create or replace view clara._agent_receipts_all as
    select * from clara._agent_receipt_src_f_a2
    union all select * from clara._agent_receipt_src_f_a3
    union all select * from clara._agent_receipt_src_f_a4
    union all select * from clara._agent_receipt_src_f_a5
    union all select * from clara._agent_receipt_src_f_a6
    union all select * from clara._agent_receipt_src_f_a7
    union all select * from clara._agent_receipt_src_f_a7b
    union all select * from clara._agent_receipt_src_f_a8
    union all select * from clara._agent_receipt_src_pb_binding;

-- =====================================================================================
-- SS4 -- THE HONEST-LABEL COLUMNS + THE DECLINE COLUMNS ON vendor_identity_bindings
-- (design SS3.4 W10/W11/W12, plus G7's decline half). ADD COLUMN only; no body CoR.
-- =====================================================================================
alter table clara.vendor_identity_bindings add column proposed_by_agent boolean not null default false;
alter table clara.vendor_identity_bindings add column proposer_model text;
alter table clara.vendor_identity_bindings add column proposal_receipt_id uuid;
alter table clara.vendor_identity_bindings add column declined_by uuid;
alter table clara.vendor_identity_bindings add column declined_at timestamptz;
alter table clara.vendor_identity_bindings add column decline_reason text;
-- 裁-32: the DIRECTING HUMAN of an `interactive` proposal, taken from the credential's
-- on_behalf_of (0011:1143). NULL for a `filing`-kind proposal (a clocked lane has no director)
-- and for a human proposal (the human IS created_by).
alter table clara.vendor_identity_bindings add column directed_by uuid;
-- ...and the principal maker/checker actually measures against. GENERATED, so it can never
-- disagree with the two columns it is derived from and no writer can set it directly -- the
-- difference between a derived fact and a copied one (review law 2).
alter table clara.vendor_identity_bindings
  add column effective_proposer uuid generated always as (coalesce(directed_by, created_by)) stored;
-- 裁-32's SOLO arm: the sole eligible human MAY sign their own directed proposal, but only with
-- an explicit self-approval attestation, written onto the row and rendered on the card.
alter table clara.vendor_identity_bindings add column self_approved boolean not null default false;
alter table clara.vendor_identity_bindings add column self_approval_reason text;

-- W10, THE HONEST LABEL -- BIDIRECTIONAL, so a human row cannot claim agency AND an agent row
-- cannot hide it. Legal because clara.agent_user_id() is `sql IMMUTABLE` and relation-free
-- (SS1(i) measured it; prediction P-2 settled admissibility on the rig).
-- RISK R1, NAMED IN CODE, NOT ONLY IN THE PR BODY: this CHECK's meaning is defined by
-- agent_user_id()'s BODY. If a later lane ever CoRs that function, the CHECK's meaning changes
-- silently and existing rows are NOT re-validated. Its prosrc is pinned in SS1(f) and re-asserted
-- in the tail; the stated alternative (a before-insert-or-update trigger reading the function at
-- write time) is deliberately NOT taken here, because a trigger is a live writer body and this
-- PR's D1 inventory is EMPTY by design.
alter table clara.vendor_identity_bindings add constraint ck_vib_proposed_by_agent_honest
  check (proposed_by_agent = (created_by = clara.agent_user_id()));
-- W11, the model/receipt honesty pair (0142's D-3 idiom): a human-proposed row may claim
-- neither a proposer model nor a proposal receipt.
alter table clara.vendor_identity_bindings add constraint ck_vib_proposer_model_honest
  check (proposer_model is null or proposed_by_agent);
alter table clara.vendor_identity_bindings add constraint ck_vib_proposal_receipt_honest
  check (proposal_receipt_id is null or proposed_by_agent);
-- W12, receipt congruence -- a STRUCTURAL composite FK, never a bare uuid: the receipt must
-- belong to the SAME firm as the binding (0142's fk_onboarding_plans_opened_from_question idiom).
alter table clara.vendor_identity_bindings add constraint fk_vib_proposal_receipt
  foreign key (proposal_receipt_id, firm_id) references clara.binding_agent_receipts(id, firm_id);
-- The decline pair, mirroring the LIVE ck_vib_revoked read byte-exact in SS1(c). Reusing
-- revoked_by/revoked_at for a decline is not merely dishonest, it is IMPOSSIBLE: ck_vib_revoked
-- says (status='revoked') = (revoked_at is not null), so a declined row stamping revoked_at
-- would violate it. Hence three columns of its own.
alter table clara.vendor_identity_bindings add constraint ck_vib_declined
  check ((status = 'declined') = (declined_at is not null));
alter table clara.vendor_identity_bindings add constraint ck_vib_decline_reason_honest
  check (decline_reason is null or declined_at is not null);
-- 裁-32 honesty: only an AGENT proposal can have had a director, and the self-approval
-- attestation is a pair that cannot half-exist and cannot precede a signature.
alter table clara.vendor_identity_bindings add constraint ck_vib_directed_by_honest
  check (directed_by is null or proposed_by_agent);
alter table clara.vendor_identity_bindings add constraint ck_vib_self_approval_pair
  check (self_approved = (self_approval_reason is not null));
alter table clara.vendor_identity_bindings add constraint ck_vib_self_approval_signed
  check (not self_approved or signed_at is not null);

comment on column clara.vendor_identity_bindings.proposed_by_agent is
  '裁-18b W10: the honest label. Bidirectionally CHECKed against created_by = clara.agent_user_id() '
  '-- a human row cannot claim agency and an agent row cannot hide it. The UI renders "Proposed by '
  'Clara" FROM THIS BOOLEAN, never by comparing a uuid in TypeScript (review law 3: the client '
  'must not carry the agent sentinel as a constant).';

-- =====================================================================================
-- SS5 -- G8: ONE ACTIVE BINDING ROW PER (client, counterparty)
-- =====================================================================================
-- Closes survey S6. No body change on either path: the human
-- clara.propose_vendor_identity_binding already wraps its INSERT in `exception when
-- unique_violation then raise 'binding_conflict' using errcode='CLR36'` (0028:770-772), and the
-- new agent core does the same, so this index surfaces as the estate's EXISTING typed refusal on
-- both. Without it the agent trigger LOOPS -- she would re-propose on every subsequent invoice
-- from the same vendor.
--
-- THE PREDICATE IS `status IN ('proposed','live')`, NOT `status='proposed'` -- conductor ruling
-- 2026-08-29 (c), from the cross-model adversarial pass, and the design's own §3.4 W7 is
-- OVERRULED here. A proposed-only index LOSES THE PROPOSE-VERSUS-SIGN RACE: a second proposer
-- clears the derivation's "no live binding" rung, then BLOCKS on the existing proposed row's
-- index entry; the signer commits `proposed -> live`, which REMOVES that entry from a
-- proposed-only index; the waiting insert then succeeds, leaving a live binding AND a fresh open
-- proposal for the same pair -- exactly the state this index exists to make unrepresentable.
-- Covering both statuses means the waiting insert still conflicts with the now-live row.
-- The pre-existing uq_vib_one_live (0028) is deliberately LEFT IN PLACE and untouched: it is a
-- narrower guarantee this index subsumes, and dropping a 0028 invariant is not this PR's to do.
create unique index uq_vib_one_active_binding
  on clara.vendor_identity_bindings(client_id, counterparty_id)
  where status in ('proposed','live');

-- =====================================================================================
-- SS6 -- clara._derive_vendor_binding_basis: the NON-HASHED derived sibling (design SS3.2)
-- =====================================================================================
-- WHY A SIBLING AND NOT AN EXTENSION OF THE DERIVATION (survey S4, the load-bearing finding):
-- _derive_vendor_binding_proposal's content_hash covers its evidence ARRAY, and
-- sign_vendor_identity_binding re-derives and compares all five fields plus the stored evidence,
-- raising proposal_drifted on any difference. Adding a single key to the derivation's evidence
-- items -- a document_regions id, say -- would change content_hash for every future derivation
-- and make every already-`proposed` row UN-SIGNABLE. So everything this door shows a human but
-- does not hash lives HERE, in a separate STABLE read that touches nothing frozen.
--
-- Every value it returns is read from the SAME relations the frozen derivation reads. None of it
-- enters content_hash. None of it is supplied by the model.
create function clara._derive_vendor_binding_basis(
    p_firm uuid, p_client uuid, p_counterparty uuid)
  returns jsonb language plpgsql stable security definer set search_path = clara, pg_temp as $fn$
declare
  v_cp uuid; v_matched int; v_dates int; v_span int;
  v_docs uuid[]; v_f1 jsonb; v_f2 jsonb; v_regions jsonb;
begin
  -- Canonicalise through the SAME helper the derivation uses, so "this counterparty" means one
  -- thing in both places. A CLR23 (unresolvable) is caught and turned into a null, exactly as
  -- the derivation does, so this read never raises where the derivation would merely refuse.
  begin
    v_cp := clara._canonical_counterparty(p_client, p_counterparty);
  exception when sqlstate 'CLR23' then
    v_cp := null;
  end;
  if v_cp is null then
    return jsonb_build_object('matched_approved_entries', 0, 'window_span_days', null,
      'distinct_posting_dates', 0, 'evidence_documents', '[]'::jsonb,
      'f1_evidence', '[]'::jsonb, 'f2_evidence', '[]'::jsonb, 'resolved_citations', '[]'::jsonb);
  end if;

  -- matched_approved_entries: the derivation's own window predicate WITHOUT its `limit 3`. It is
  -- a running total -- which is exactly why it is not hashed: hashing it would make every new
  -- invoice from this vendor drift an open proposal into proposal_drifted.
  select count(*)::int into v_matched
    from clara.journal_entries j
   where j.client_id = p_client
     and j.status = 'approved'
     and j.reversed_by is null
     and j.checked_via_rule_id is null
     and j.document_id is not null
     and exists (select 1 from clara.journal_lines l
                  where l.entry_id = j.id
                    and clara._canonical_counterparty(p_client, l.counterparty_id) = v_cp);

  -- The window itself -- the same three entries, selected the same way, so the two window facts
  -- the ladder gates on are read from the ladder's own window and not from a lookalike.
  with window_entries as materialized (
    select j.id, j.document_id, j.posting_date, j.approved_at
      from clara.journal_entries j
     where j.client_id = p_client
       and j.status = 'approved'
       and j.reversed_by is null
       and j.checked_via_rule_id is null
       and j.document_id is not null
       and exists (select 1 from clara.journal_lines l
                    where l.entry_id = j.id
                      and clara._canonical_counterparty(p_client, l.counterparty_id) = v_cp)
     order by j.approved_at desc, j.id desc
     limit 3
  )
  select count(distinct w.posting_date)::int,
         (max(w.posting_date) - min(w.posting_date))::int,
         coalesce(array_agg(w.document_id order by w.approved_at desc, w.id desc), '{}'::uuid[])
    into v_dates, v_span, v_docs
    from window_entries w;

  -- The per-document normalised name / invoice id the LCP was taken over, and the region rows
  -- behind them at each document's CURRENT invoice_facts generation. Presentational and derived
  -- -- region ids are generation-scoped, so hashing them would drift an open proposal on a
  -- re-extraction and un-sign a valid one (survey S4 again).
  with docs as (
    select d.document_id, d.ord from unnest(coalesce(v_docs,'{}'::uuid[])) with ordinality d(document_id, ord)
  ), fx as (
    select docs.document_id, docs.ord, x.id as extraction_id
      from docs
      left join lateral (
        select x2.id from clara.document_extractions x2
         where x2.document_id = docs.document_id and x2.engine_kind = 'invoice_facts' and x2.status = 'done'
         order by x2.version_n desc, x2.id desc limit 1) x on true
  ), reg as (
    select fx.document_id, fx.ord, fx.extraction_id, r.id as region_id, r.field_path, r.text_content
      from fx
      left join clara.document_regions r
        on r.extraction_id = fx.extraction_id
       and r.field_path in ('invoice.vendor_name','invoice.invoice_id')
  )
  select
    coalesce(jsonb_agg(distinct jsonb_build_object(
      'document_id', reg.document_id,
      'f1_vendor_name_norm', clara._binding_normalize(reg.text_content)))
      filter (where reg.field_path = 'invoice.vendor_name'), '[]'::jsonb),
    coalesce(jsonb_agg(distinct jsonb_build_object(
      'document_id', reg.document_id,
      'invoice_id_norm', clara._binding_normalize(reg.text_content)))
      filter (where reg.field_path = 'invoice.invoice_id'), '[]'::jsonb),
    coalesce(jsonb_agg(distinct jsonb_build_object(
      'document_id', reg.document_id, 'extraction_id', reg.extraction_id,
      'region_id', reg.region_id, 'field_path', reg.field_path,
      'text_content', reg.text_content))
      filter (where reg.region_id is not null), '[]'::jsonb)
    into v_f1, v_f2, v_regions
    from reg;

  return jsonb_build_object(
    'matched_approved_entries', v_matched,
    'window_span_days', v_span,
    'distinct_posting_dates', coalesce(v_dates, 0),
    'evidence_documents', to_jsonb(coalesce(v_docs, '{}'::uuid[])),
    'f1_evidence', v_f1,
    'f2_evidence', v_f2,
    'resolved_citations', v_regions);
end $fn$;
comment on function clara._derive_vendor_binding_basis(uuid,uuid,uuid) is
  '裁-18b SS3.2: the NON-HASHED derived basis. Everything the sign dialog shows a human beyond the '
  'five frozen content fields -- the running matched-entry COUNT, the two window facts, the '
  'per-document f1/f2 evidence, and the document_regions rows the fingerprint was taken from at '
  'each evidence document''s CURRENT invoice_facts generation. NONE of it enters content_hash: '
  'a count is a running total and region ids are generation-scoped, so hashing either would drift '
  'an open proposal into proposal_drifted on the next invoice or the next re-extraction (survey '
  'S4). clara._derive_vendor_binding_proposal is byte-untouched by this file. Ungranted: '
  'reachable only from inside a SECURITY DEFINER door.';
revoke all on function clara._derive_vendor_binding_basis(uuid,uuid,uuid) from public;

-- =====================================================================================
-- SS7 -- clara._propose_vendor_binding_agent_core: the UNGRANTED core -- the walls, the
-- receipt, the insert. SS3.4 IN FULL IS JUDGEMENT LOGIC (review law 1).
-- =====================================================================================
-- ORDERING LAW, and every rung's reason for sitting where it does:
--   1-2  credential + per-kind allowlist  -- the wrapper's, above this core.
--   3-7  SHAPE walls (op_key, ids, rationale, model, basis) -- BEFORE _reserve_op, so a blank
--        rationale or a model missing `version` refuses TYPED (CLR10) rather than as an untyped
--        23514 AFTER a reservation was burned (the wake_propose_identifier_promotion N-1 fix).
--   8    firm congruence on the client -- an IMMUTABLE fact about the client, so it is safe and
--        cheap before the reservation; `filing`/`interactive` credentials carry client_id IS NULL
--        (survey S2), which is exactly why the client arrives as an ARGUMENT and is walled here
--        explicitly rather than trusted from a credential the caller chose.
--   9    _reserve_op -- RESERVE-FIRST, deliberately BEFORE every state-dependent rung below.
--        Each of those either RAISEs (rolling the reservation back with everything else, so a
--        retry after a genuine refusal starts fresh) or reads state THIS verb's own prior call
--        changed -- the declined wall, the derivation's binding_conflict rung, and the
--        uq_vib_one_open_proposal index all do. Reserving first means a genuine replay
--        short-circuits HERE, before it can re-read its own side effects and refuse ITSELF
--        (0142's own rig lesson, :415-432, restated because it applies again). The dedupe hash
--        covers (client, counterparty, basis) -- the three fields that IDENTIFY the proposal.
--        p_rationale and p_model are deliberately OUTSIDE it: a genuine retry after a dropped
--        connection may re-word its own prose or bump its model_version for the identical
--        proposal, and none of that should turn a lawful replay into 'op_key reused with
--        different args'.
--   10   W14, the DECLINED loop brake -- a human said no; Clara does not ask again.
--   11   the frozen derivation -- W4 (counterparty liveness/attributability) and W8 (a live
--        binding already exists) are DELEGATED to it, unchanged, so there is exactly one
--        definition of "ready to bind" in the estate (G3).
--   12-13 the 裁-22 basis, resolved AFTER the reservation (0143's own ordering law) against the
--        THREE evidence documents THE DERIVATION ITSELF SELECTED -- never a document set the
--        model chose.
--   14-17 the writes.
-- =====================================================================================
-- SS6b -- clara._binding_extra_blocker: THE POST-DERIVATION IDENTITY WALLS, ONCE.
-- =====================================================================================
-- Every wall the 2026-08-29 cross-model adversarial pass added sits HERE, in one body that the
-- proposal writer and the eligibility read BOTH call. Returns the first blocking reason token,
-- or NULL when the pair is clean. It RAISES nothing: the writer turns a token into its typed
-- CLR36 refusal, the read verb reports it as `reason`, and the two can therefore never disagree
-- (G3 -- one fact, one definition).
--
-- WHY THESE WALLS ARE HERE AND NOT IN THE WINDOW. Every one of them belongs, logically, inside
-- clara._derive_vendor_binding_proposal. It cannot go there: its content_hash covers the
-- evidence array, so recutting it makes every already-`proposed` row un-signable (survey S4),
-- and G3 rules it untouched. So they are enforced ABOVE it, on the evidence it returns. The
-- consequence is stated rather than hidden: these walls protect NEW proposals only and do NOT
-- retro-check rows already sitting at status='proposed' (conductor ruling, 2026-08-29).
create function clara._binding_extra_blocker(
    p_firm uuid, p_client uuid, p_counterparty uuid, p_derived jsonb, p_basis jsonb)
  returns text language plpgsql stable security definer set search_path = clara, pg_temp as $fn$
declare
  v_cp_name text; v_registration text; v_bad_doc text;
  v_n_docs int; v_n_shas int; v_n_invoices int; v_span_days int;
begin
  select c.name, c.registration_normalized into v_cp_name, v_registration
    from clara.counterparties c where c.id = p_counterparty;

  -- W15 -- LAW 79'S FAMILY-COLLISION PREDICATE (conductor ruling (e); the CRITICAL finding of
  -- the 2026-08-29 pass). The predicate has existed since 0103:755 and no binding path has ever
  -- called it.
  -- THE ATTACK IT CLOSES: misattribute and approve three crafted `ROME...`-family invoices
  -- against vendor A. The derivation then stores vendor B's stable LCP beside vendor A's
  -- registration -- because F1 is a STABILITY feature matched by PREFIX (0030:29) and F3 accepts
  -- a NAME SUBSTRING (0028:311). A human signs a card that looks entirely right, and later
  -- name-only B invoices auto-post to A. In an ambiguous family a name can never authorize
  -- identity, so the proposal never reaches a card.
  if clara.name_family_is_ambiguous(p_firm, v_cp_name) then
    return 'binding_name_family_ambiguous';
  end if;

  -- W16 -- THE CORPUS IS THREE REAL, DISTINCT, INDEPENDENTLY-OBSERVED INVOICES (ruling (a)).
  -- The frozen window counts JOURNAL ENTRIES over caller-set POSTING DATES, with no distinct-
  -- document, hash or invoice-id requirement (0030:129, :181, :201) -- so ONE document booked
  -- three times with backdated posting dates, or three byte-different uploads of one invoice,
  -- passes it outright.
  select count(distinct e.doc), count(distinct d.sha256),
         (max(j.approved_at)::date - min(j.approved_at)::date)
    into v_n_docs, v_n_shas, v_span_days
    from (select (x->>'document_id')::uuid doc, (x->>'entry_id')::uuid ent
            from jsonb_array_elements(p_derived->'evidence') x) e
    join clara.documents d on d.id = e.doc
    join clara.journal_entries j on j.id = e.ent;
  if coalesce(v_n_docs,0) <> 3 or coalesce(v_n_shas,0) <> 3 then
    return 'binding_corpus_not_distinct';
  end if;
  -- Distinct PRINTED invoice identities, read from the same regions the LCP was taken over.
  select count(distinct nullif(btrim(f->>'invoice_id_norm'), ''))
    into v_n_invoices from jsonb_array_elements(p_basis->'f2_evidence') f;
  if coalesce(v_n_invoices,0) <> 3 then
    return 'binding_corpus_not_distinct';
  end if;
  -- THE TRUSTED CLOCK. posting_date is caller-controlled; approved_at is stamped by the approve
  -- door and is the only elapsed-OBSERVATION evidence on the row. The frozen window's own
  -- >=14-day span rides on posting_date alone; this requires the same span over approved_at, so
  -- "fourteen days apart" means fourteen days of having actually seen the vendor.
  if coalesce(v_span_days, -1) < 14 then
    return 'window_too_recent_unobserved';
  end if;

  -- W18 -- EVERY CORPUS MEMBER CARRIES A HARD IDENTIFIER, OR A HUMAN RESOLVED IT (ruling (e),
  -- second half). Per evidence document: if it PRINTS a vendor registration, that registration
  -- must normalise to the target counterparty's own -- a DIFFERING printed registration is the
  -- poisoned-corpus signature and refuses outright. If it prints none, the document must carry a
  -- HUMAN identity resolution; a machine attribution alone may not stand up an identity
  -- authority.
  select string_agg(distinct q.doc::text, ', ') into v_bad_doc
    from (
      select e.doc,
             (select clara._binding_normalize(min(r.text_content))
                from clara.document_regions r
                join clara.document_extractions x on x.id = r.extraction_id
               where x.document_id = e.doc and x.engine_kind = 'invoice_facts' and x.status = 'done'
                 and x.version_n = (select max(x2.version_n) from clara.document_extractions x2
                                     where x2.document_id = e.doc and x2.engine_kind = 'invoice_facts'
                                       and x2.status = 'done')
                 and r.field_path = 'invoice.vendor_registration') as printed,
             exists (select 1 from clara.client_resolutions cr
                      where cr.subject_kind = 'document' and cr.subject_id = e.doc
                        and cr.client_id = p_client and cr.method = 'human') as human_resolved
        from (select distinct (x->>'document_id')::uuid doc
                from jsonb_array_elements(p_derived->'evidence') x) e
    ) q
   where (q.printed is not null
          and q.printed is distinct from clara._binding_normalize(v_registration))
      or (q.printed is null and not q.human_resolved);
  if v_bad_doc is not null then
    return 'binding_identifier_unproven';
  end if;

  return null;
end $fn$;
comment on function clara._binding_extra_blocker(uuid,uuid,uuid,jsonb,jsonb) is
  '裁-18b PR-1, from the 2026-08-29 cross-model adversarial pass: the identity walls that belong '
  'inside clara._derive_vendor_binding_proposal''s window but cannot go there (its content_hash '
  'covers the evidence array, so recutting it un-signs every open proposal -- survey S4; G3 rules '
  'it untouched). Law 79''s family-collision predicate, corpus distinctness over document/sha256/'
  'printed invoice id, a >=14-day span over the TRUSTED approved_at clock rather than the '
  'caller-set posting_date, and a printed hard-identifier match (or a human identity resolution) '
  'per corpus member. Returns the first blocking reason token or NULL; raises nothing, so the '
  'proposal writer and clara.wake_list_binding_candidates share ONE definition and can never '
  'disagree. Protects NEW proposals only -- rows already at status=''proposed'' are not '
  're-checked. Ungranted.';
revoke all on function clara._binding_extra_blocker(uuid,uuid,uuid,jsonb,jsonb) from public;

create function clara._propose_vendor_binding_agent_core(
    p_actor uuid, p_firm uuid, p_obo uuid, p_wake_kind text, p_credential uuid, p_task uuid,
    p_client uuid, p_counterparty uuid, p_basis jsonb,
    p_rationale text, p_model jsonb, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $fn$
declare
  v_dedupe jsonb; v_derived jsonb; v_basis jsonb; v_resolved jsonb;
  v_docs uuid[]; v_binding uuid; v_receipt uuid; v_cp uuid;
  v_rationale text; v_trigger_kind text; v_trigger_id text;
  v_blocker text; v_bad_field int; v_bad_f1 int; v_bad_f2 int; v_covered int;
begin
  -- (3) op_key.
  if nullif(btrim(coalesce(p_op_key, '')), '') is null then
    raise exception 'op_key is required' using errcode = 'CLR10',
      detail = '{"reason":"invalid_request","class":"op_key","constraint":"nonempty"}';
  end if;
  -- (4) the two identifiers.
  if p_client is null or p_counterparty is null then
    raise exception 'a binding proposal needs both its client and its counterparty' using errcode = 'CLR10',
      detail = '{"reason":"invalid_request","class":"identifiers","constraint":"client+counterparty"}';
  end if;
  -- (5) rationale -- prose, receipt-only, NEVER a fact.
  v_rationale := nullif(btrim(coalesce(p_rationale, '')), '');
  if v_rationale is null then
    raise exception 'a binding proposal must state its rationale' using errcode = 'CLR10',
      detail = '{"reason":"invalid_request","class":"rationale","constraint":"nonempty"}';
  end if;
  -- (6) the model snapshot, all three parts non-blank.
  if p_model is null or jsonb_typeof(p_model) <> 'object'
     or nullif(btrim(coalesce(p_model->>'provider', '')), '') is null
     or nullif(btrim(coalesce(p_model->>'model', '')), '') is null
     or nullif(btrim(coalesce(p_model->>'version', '')), '') is null then
    raise exception 'a binding proposal must name its model (provider, model, version)' using errcode = 'CLR10',
      detail = '{"reason":"invalid_request","class":"model_snapshot","constraint":"provider+model+version"}';
  end if;
  -- (7) THE 裁-22 BASIS SHAPE, and the one thing this door refuses that no other door does.
  --     `sightings` is a FORBIDDEN KEY: the count of matching approved invoices is an
  --     AUTHORITATIVE NUMBER (PRD SS6 invariant 1) that the DB derives in
  --     _derive_vendor_binding_basis. A model that supplies one is not merely ignored, it is
  --     REFUSED -- the strictly stronger 裁-22 posture design SS3.2 argued for, because a
  --     silently-ignored claim is a claim a later reader may mistake for a checked fact.
  if p_basis is null or jsonb_typeof(p_basis) <> 'object' then
    raise exception 'a binding proposal needs a well-formed basis' using errcode = 'CLR10',
      detail = '{"reason":"invalid_request","class":"basis","constraint":"object"}';
  end if;
  if p_basis ? 'sightings' then
    raise exception 'a binding proposal may not assert its own sighting count; the database derives it'
      using errcode = 'CLR10',
      detail = '{"reason":"invalid_request","class":"basis","constraint":"no_model_sightings"}';
  end if;
  if jsonb_typeof(p_basis->'citations') is distinct from 'array'
     or jsonb_array_length(p_basis->'citations') < 1 then
    raise exception 'a binding proposal needs at least one citation in its basis' using errcode = 'CLR10',
      detail = '{"reason":"invalid_request","class":"basis","constraint":"nonempty_citations"}';
  end if;

  -- (8) W3, firm congruence on the client.
  if not exists (select 1 from clara.clients where id = p_client and firm_id = p_firm) then
    raise exception 'client not in your firm' using errcode = 'CLR11',
      detail = '{"reason":"cross_firm","class":"client"}';
  end if;

  -- (9) W13, reserve-first (see the ordering law above).
  v_dedupe := clara._reserve_op(p_firm, 'wake_propose_vendor_identity_binding', p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'counterparty', p_counterparty, 'basis', p_basis)));
  if v_dedupe is not null then return v_dedupe; end if;

  -- (9b) THE SHARED SERIALISATION KEY (conductor ruling (c)). Transaction-scoped, taken on
  --      (client, counterparty) by EVERY writer that moves a binding through its lifecycle --
  --      propose (both doors), sign, decline, reset. The unique index alone makes the bad END
  --      STATE unrepresentable; this makes the concurrent attempt WAIT rather than race to a
  --      typed refusal, so a lawful second actor is serialised instead of being told "conflict"
  --      for a row that was mid-flight. hashtextextended over the two uuids gives the two-int4
  --      key space pg_advisory_xact_lock wants, with the pair's own text as the seed.
  perform pg_advisory_xact_lock(
    hashtextextended(p_client::text || ':' || p_counterparty::text, 0));

  -- (10) W14, THE DECLINED LOOP BRAKE (G7). A human already said no to this exact pair; Clara
  --      does not ask again. This is a wall in the DOOR, not merely a hint in the read verb --
  --      a read verb Clara may choose not to call is not a brake. The HUMAN door is untouched:
  --      a person may always propose again, which is why this rung lives here and not in
  --      _derive_vendor_binding_proposal.
  if exists (select 1 from clara.vendor_identity_bindings b
              where b.firm_id = p_firm and b.client_id = p_client
                and b.counterparty_id = p_counterparty and b.status = 'declined') then
    raise exception 'binding_declined' using errcode = 'CLR36',
      detail = '{"reason":"binding_declined","class":"loop_brake"}';
  end if;

  -- (11) The frozen derivation. W4 and W8 are ITS rungs, delegated unchanged -- this door
  --      re-implements not one line of the eleven-rung ladder (G3).
  -- (10b) THE OPPORTUNISTIC EXPIRY FLIP, mirroring the human door verbatim (0028:750-754). With
  --       the widened uq_vib_one_active_binding a LIVE row past its expiry would otherwise block
  --       Clara's door forever, while the human door -- which does this flip -- sails past. The
  --       asymmetry is the defect; this removes it.
  update clara.vendor_identity_bindings
     set status = 'expired'
   where firm_id = p_firm and client_id = p_client and counterparty_id = p_counterparty
     and status = 'live' and expires_at <= now();

  v_derived := clara._derive_vendor_binding_proposal(p_firm, p_client, p_counterparty);
  v_cp := (v_derived->>'counterparty_id')::uuid;

  -- (12) The DB's own non-hashed derived block.
  v_basis := clara._derive_vendor_binding_basis(p_firm, p_client, v_cp);

  -- (12b) THE POST-DERIVATION IDENTITY WALLS -- W15 (law 79 family collision), W16 (corpus
  --       distinctness + the trusted approved_at span) and W18 (the printed hard identifier).
  --       They live in clara._binding_extra_blocker, ONE definition that BOTH this writer and
  --       clara.wake_list_binding_candidates call. That is not tidiness: G3 rules that one fact
  --       gets one definition, and a read verb that called a vendor ELIGIBLE that this door will
  --       refuse would be worse than no read verb at all -- it would send Clara to probe the
  --       door by refusal, the exact pattern the read verb exists to prevent.
  v_blocker := clara._binding_extra_blocker(p_firm, p_client, v_cp, v_derived, v_basis);
  if v_blocker is not null then
    raise exception '%', v_blocker using errcode = 'CLR36',
      detail = jsonb_build_object('reason', v_blocker, 'class', 'identity')::text;
  end if;

  -- (13) W6, 裁-22: every citation the MODEL supplied is resolved by the SHARED resolver against
  --      the THREE evidence documents the DERIVATION selected -- firm-congruent, current
  --      extraction generation, a real document_regions row. An unresolvable, cross-firm,
  --      stale-generation or foreign-document citation REFUSES the proposal: nothing is written,
  --      no receipt, no card. The document set comes from v_derived's own evidence array, so the
  --      model cannot widen the set it is allowed to cite from.
  select coalesce(array_agg(distinct (x->>'document_id')::uuid), '{}'::uuid[]) into v_docs
    from jsonb_array_elements(v_derived->'evidence') x;
  -- NOT REACHABLE TODAY, and said so rather than left to look like a live rung: the derivation
  -- refuses `insufficient_evidence` below three entries and its own window requires
  -- `document_id is not null`, so v_docs always holds three. It is a fail-closed tripwire for a
  -- future change to the derivation's window, and the resolver would refuse an empty set on the
  -- next line anyway -- this only makes the refusal name the derivation rather than the basis.
  if coalesce(array_length(v_docs,1),0) = 0 then
    raise exception 'binding_unattributable' using errcode = 'CLR36',
      detail = '{"reason":"no_evidence_documents","class":"basis"}';
  end if;
  v_resolved := clara._resolve_proposal_basis(v_docs, p_firm, p_basis);

  -- (13b) W17 -- THE SHARED RESOLVER IS A FLOOR, NOT THE WHOLE WALL (conductor ruling (d)).
  --       0143 proves each cited region is real, firm-congruent, current-generation and belongs
  --       to SOME document of the set (0143:320, :343) -- it never checks WHICH field the region
  --       is, WHAT it says, or whether the set is COVERED. So one current footer or total region
  --       from one of the three documents satisfies it, and the card then shows that as "the
  --       regions the fingerprint came from". It is not.
  --       This door therefore requires, of the RESOLVED set: every region is an
  --       invoice.vendor_name or invoice.invoice_id region; every vendor_name region normalises
  --       to the derivation's own F1; every invoice_id region normalises to one of the three the
  --       LCP was taken over; and the set COVERS ALL THREE evidence documents.
  select count(*) filter (where c.field_path not in ('invoice.vendor_name','invoice.invoice_id')),
         count(*) filter (where c.field_path = 'invoice.vendor_name'
                            and clara._binding_normalize(c.text_content)
                                is distinct from (v_derived->>'f1_vendor_name_norm')),
         count(*) filter (where c.field_path = 'invoice.invoice_id'
                            and not exists (select 1 from jsonb_array_elements(v_basis->'f2_evidence') f
                                             where nullif(btrim(f->>'invoice_id_norm'),'')
                                                   = clara._binding_normalize(c.text_content))),
         count(distinct z.document_id)
    into v_bad_field, v_bad_f1, v_bad_f2, v_covered
    from (select (e->>'region_id')::uuid rid, (e->>'document_id')::uuid document_id
            from jsonb_array_elements(v_resolved->'citations') e) z
    join clara.document_regions c on c.id = z.rid;
  if coalesce(v_bad_field,0) > 0 then
    raise exception 'basis_citation_irrelevant' using errcode = 'CLR10',
      detail = '{"reason":"basis_citation_irrelevant","class":"field_path"}';
  end if;
  if coalesce(v_bad_f1,0) > 0 or coalesce(v_bad_f2,0) > 0 then
    raise exception 'basis_citation_contradicts_derivation' using errcode = 'CLR10',
      detail = '{"reason":"basis_citation_contradicts_derivation","class":"text"}';
  end if;
  if coalesce(v_covered,0) <> coalesce(array_length(v_docs,1),0) then
    raise exception 'basis_coverage_incomplete' using errcode = 'CLR10',
      detail = '{"reason":"basis_coverage_incomplete","class":"documents"}';
  end if;

  -- (14) The binding row. proposed_by_agent is TRUE and created_by is the agent sentinel -- the
  --      bidirectional honesty CHECK makes those two facts one fact. proposal_receipt_id is set
  --      in (16), after the receipt exists: the two tables reference each other, so one write
  --      has to go second.
  --      W7: the partial unique index surfaces as the estate's EXISTING typed binding_conflict,
  --      the same word the human door has raised since 0028.
  begin
    insert into clara.vendor_identity_bindings(
        firm_id, client_id, counterparty_id, status,
        f1_vendor_name_norm, f2_invoice_prefix, registration_at_signing,
        content_hash, created_by, expires_at, proposed_by_agent, proposer_model, directed_by)
      values (
        p_firm, p_client, v_cp, 'proposed',
        v_derived->>'f1_vendor_name_norm',
        v_derived->>'f2_invoice_prefix',
        v_derived->>'registration_at_signing',
        v_derived->>'content_hash',
        clara.agent_user_id(), now() + interval '12 months', true,
        (p_model->>'provider') || '/' || (p_model->>'model') || '/' || (p_model->>'version'),
        p_obo)
      returning id into v_binding;
  exception when unique_violation then
    raise exception 'binding_conflict' using errcode = 'CLR36',
      detail = '{"reason":"binding_conflict","class":"open_proposal"}';
  end;

  -- (15) The evidence rows -- the derivation's own three, unchanged, exactly as the human door
  --      writes them.
  insert into clara.vendor_identity_binding_evidence(
      binding_id, firm_id, client_id, entry_id, document_id, facts_extraction_id, ocr_extraction_id)
  select v_binding, p_firm, p_client,
         (x->>'entry_id')::uuid, (x->>'document_id')::uuid,
         (x->>'facts_extraction_id')::uuid, (x->>'ocr_extraction_id')::uuid
    from jsonb_array_elements(v_derived->'evidence') x;

  -- (16) The receipt. Its `derived` block is written from the DB's OWN return values -- the five
  --      frozen content fields and the non-hashed sibling's counts -- so the receipt reproduces
  --      the card from DB-owned inputs (PRD SS6 invariant 1). `basis` is the RESOLVER'S OUTPUT
  --      AND NOTHING ELSE -- the caller's raw citations are read to build the resolver's input
  --      and are then persisted NOWHERE. An earlier draft of this file kept them beside the
  --      resolved set as `basis.claimed`, "clearly labelled". That is the shape 裁-22's own
  --      HIGH-2 ruling struck out of 0143 (`sightings_model`), and for the reason that applies
  --      here too: clara.agent_receipts_visible projects `verdict` to a human, so a
  --      model-authored list would sit in a human-readable receipt beside the checked one.
  --      Nothing is lost by dropping it -- every citation that survived resolution IS in the
  --      resolved set, deduped and canonicalised, and anything that did not survive refused the
  --      whole proposal.
  --      THE TRIGGER PAIR (conductor ruling 2026-08-29, overruling design SS3.5). trigger_id
  --      names what trigger_kind says it is, and nothing else. p_task is clara._wake_task_id()'s
  --      answer, read by the wrapper from the SAME credential wake_context() resolved: a real
  --      clara.agent_tasks id when the credential carries one, NULL otherwise. Neither branch is
  --      dead weight -- the battery drives both -- and neither ever writes a credential uuid
  --      under 'wake_task', which is what the three existing writers do and what this ruling
  --      forbids here.
  --      MEASURED, so a reviewer does not have to take it on trust: today no credential of
  --      EITHER ruled kind can carry a task, because clara.mint_wake_credential_for_task admits
  --      'close_prep' only. So the live product path takes the 'wake_credential' branch every
  --      time, and 'wake_task' is the branch PR-4's clocked expiry sweep will arrive on.
  if p_task is not null then
    v_trigger_kind := 'wake_task';   v_trigger_id := p_task::text;
  else
    v_trigger_kind := 'wake_credential'; v_trigger_id := p_credential::text;
  end if;
  insert into clara.binding_agent_receipts(
      firm_id, client_id, counterparty_id, binding_id, model, model_version,
      rationale, verdict, via_wake_kind, trigger_kind, trigger_id, acting_actor, on_behalf_of)
    values (
      p_firm, p_client, v_cp, v_binding, p_model->>'model', p_model->>'version',
      v_rationale,
      jsonb_build_object(
        'outcome', 'proposed',
        'basis', jsonb_build_object(
          'citations', v_resolved->'citations',
          'citation_count', v_resolved->'sightings'),
        'derived', jsonb_build_object(
          'f1_vendor_name_norm', v_derived->>'f1_vendor_name_norm',
          'f2_invoice_prefix', v_derived->>'f2_invoice_prefix',
          'registration_at_signing', v_derived->>'registration_at_signing',
          'content_hash', v_derived->>'content_hash',
          'matched_approved_entries', v_basis->'matched_approved_entries',
          'window_span_days', v_basis->'window_span_days',
          'distinct_posting_dates', v_basis->'distinct_posting_dates',
          'evidence_documents', v_basis->'evidence_documents')),
      p_wake_kind, v_trigger_kind, v_trigger_id, p_actor, p_obo)
    returning id into v_receipt;

  update clara.vendor_identity_bindings set proposal_receipt_id = v_receipt where id = v_binding;

  -- (17) Audit + event, mirroring the human door's own pair so one act reads the same way on
  --      both axes. The event type `kb_binding.agent_proposed` is NEW and is registered by §3a
  --      below -- clara.domain_events carries an FK to the append-only clara.event_types
  --      registry PLUS the _tf_validate_domain_event trigger, so an unregistered type raises
  --      CLR10 'unknown event_type'.
  --      HOW THAT WAS FOUND, recorded because the first draft got it wrong: this file's own
  --      prestate census originally read pg_constraint on `clara.events` -- a relation that does
  --      not exist -- and concluded from the empty result that there was no closed world at all.
  --      That is the absence-from-the-wrong-instrument class: the read saw nothing because it
  --      was pointed at nothing. The battery's first execution refused with CLR10 and named the
  --      real gate. The prestate below now reads the REGISTRY itself.
  perform clara._audit(p_firm, p_actor, p_obo, p_wake_kind,
    'wake_propose_vendor_identity_binding', null,
    jsonb_build_object('binding_id', v_binding, 'client_id', p_client,
      'counterparty_id', v_cp, 'receipt_id', v_receipt, 'op_key', p_op_key));
  perform clara._append_event(p_firm, 'kb_binding.agent_proposed', p_client, p_actor,
    p_obo, p_wake_kind, null, null, null,
    jsonb_build_object('binding_id', v_binding, 'counterparty_id', v_cp, 'receipt_id', v_receipt));

  return clara._finish_op(p_firm, 'wake_propose_vendor_identity_binding', p_op_key,
    jsonb_build_object('binding_id', v_binding, 'receipt_id', v_receipt, 'status', 'proposed'));
end $fn$;
comment on function clara._propose_vendor_binding_agent_core(uuid,uuid,uuid,text,uuid,uuid,uuid,uuid,jsonb,text,jsonb,text) is
  '裁-18b PR-1: the ungranted core behind clara.wake_propose_vendor_identity_binding -- the walls, '
  'the receipt and the insert. NO model-generated value enters clara.vendor_identity_bindings: '
  'the five content fields are exactly what the byte-frozen clara._derive_vendor_binding_proposal '
  'returns (PRD SS6 invariant 1). `sightings` is a FORBIDDEN basis key -- refused, not ignored. '
  'The only status transition this door can cause is null -> proposed: Clara never signs, '
  'declines, revokes or shortens an expiry. Reachable only from inside its wake wrapper.';
revoke all on function clara._propose_vendor_binding_agent_core(uuid,uuid,uuid,text,uuid,uuid,uuid,uuid,jsonb,text,jsonb,text) from public;

-- =====================================================================================
-- SS8 -- clara.wake_propose_vendor_identity_binding: the wake wrapper (G1 arm A)
-- =====================================================================================
create function clara.wake_propose_vendor_identity_binding(
    p_client uuid, p_counterparty uuid, p_basis jsonb,
    p_rationale text, p_model jsonb, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $fn$
declare w record;
begin
  select * into w from clara.wake_context();
  -- W1: a live wake credential. W2: the per-kind allowlist (PRD SS6 invariant 2(c)) -- `filing`
  -- and `interactive` are admitted, the other five kinds refused. The GRANT split (2(d)) is the
  -- second, independent wall: only clara_wake_filing and clara_wake_interactive can EXECUTE this
  -- at all. The battery proves BOTH with real credentials through the real executor roles.
  if w.credential_id is null then raise exception 'no valid wake credential' using errcode = 'CLR03'; end if;
  perform clara.assert_wake_allowed(w.wake_kind, 'wake_propose_vendor_identity_binding');
  return clara._propose_vendor_binding_agent_core(
    clara.agent_user_id(), w.firm_id, w.on_behalf_of, w.wake_kind, w.credential_id,
    clara._wake_task_id(),
    p_client, p_counterparty, p_basis, p_rationale, p_model, p_op_key);
end $fn$;
comment on function clara.wake_propose_vendor_identity_binding(uuid,uuid,jsonb,text,jsonb,text) is
  '裁-18b (G1 arm A): Clara PROPOSES a vendor identity binding from her own observation; a human '
  'ADMIN signs it. Admitted on the wake kinds `filing` (the filing lane''s own turn, after it '
  'files an invoice) and `interactive` (the human ask from the admin / vendor-bindings panel -- '
  '裁-18c''s first named way out, and therefore REQUIRED, not optional). Six arguments: three '
  'the DB re-validates, two provenance, one idempotency key -- there is no argument the model can '
  'use to assert a fact. Stamps clara.agent_user_id() as the actor, which is what makes 裁-18a''s '
  'signer<>proposer wall pass by construction for every proposal it makes.';

-- =====================================================================================
-- SS9 -- clara.wake_list_binding_candidates: the eligibility READ (G1/G3)
-- =====================================================================================
-- WHY THIS VERB EXISTS. Without it, trigger T1 degenerates into "call the proposal door on every
-- vendor and see what raises" -- a refusal-as-probe pattern the estate has paid for before. With
-- it, Clara learns eligibility by ASKING THE DATABASE.
--
-- AND WHY IT CALLS THE DERIVATION RATHER THAN RE-STATING ITS PREDICATE (G3, ruled): counting is
-- an authoritative number (PRD SS6). One fact gets ONE definition. So this verb does not
-- re-implement "three approved invoices, three distinct dates, >= 14 days apart, one stable name
-- fingerprint" -- it CALLS clara._derive_vendor_binding_proposal per candidate and reports the
-- ladder's OWN typed refusal word as `reason`. There is therefore exactly one definition of
-- "ready to propose" in the estate, and it is the one the proposal door itself will run.
-- clara._coding_lane_core is untouched.
create function clara.wake_list_binding_candidates(p_client uuid)
  returns table(counterparty_id uuid, counterparty_name text, eligible boolean, reason text,
                matched_approved_entries int, has_open_proposal boolean,
                has_live_binding boolean, has_declined_proposal boolean)
  language plpgsql stable security definer set search_path = clara, pg_temp as $fn$
declare
  w record; cp record; v_reason text; v_ok boolean; v_basis jsonb; v_derived jsonb;
  v_open boolean; v_live boolean; v_declined boolean;
begin
  select * into w from clara.wake_context();
  if w.credential_id is null then raise exception 'no valid wake credential' using errcode = 'CLR03'; end if;
  perform clara.assert_wake_allowed(w.wake_kind, 'wake_list_binding_candidates');
  if p_client is null then
    raise exception 'a client is required' using errcode = 'CLR10',
      detail = '{"reason":"invalid_request","class":"client","constraint":"nonnull"}';
  end if;
  -- The same explicit client wall the proposal door carries, and for the same reason: `filing`
  -- and `interactive` credentials carry client_id IS NULL, so the client arrives as an argument.
  if not exists (select 1 from clara.clients c where c.id = p_client and c.firm_id = w.firm_id) then
    raise exception 'client not in your firm' using errcode = 'CLR11',
      detail = '{"reason":"cross_firm","class":"client"}';
  end if;

  for cp in
    select c.id, c.name from clara.counterparties c
     where c.client_id = p_client and c.firm_id = w.firm_id and c.kind = 'vendor'
       and c.merged_into is null and c.retired_at is null
     order by c.name, c.id
  loop
    select exists (select 1 from clara.vendor_identity_bindings b
                    where b.client_id = p_client and b.counterparty_id = cp.id and b.status = 'proposed'),
           exists (select 1 from clara.vendor_identity_bindings b
                    where b.client_id = p_client and b.counterparty_id = cp.id and b.status = 'live'
                      and b.expires_at > now()),
           exists (select 1 from clara.vendor_identity_bindings b
                    where b.client_id = p_client and b.counterparty_id = cp.id and b.status = 'declined')
      into v_open, v_live, v_declined;

    v_basis := clara._derive_vendor_binding_basis(w.firm_id, p_client, cp.id);

    -- The ladder itself, run for real. A CLR36 is the derivation's OWN typed refusal word and is
    -- reported verbatim; anything else is re-raised, because swallowing an unexpected error here
    -- would turn a real fault into a quiet "not eligible" (review law 2 -- the fail-closed
    -- branch is a REFUSAL, never a silent one).
    begin
      v_derived := clara._derive_vendor_binding_proposal(w.firm_id, p_client, cp.id);
      v_ok := true; v_reason := null;
    exception
      when sqlstate 'CLR36' then
        v_ok := false; v_reason := sqlerrm; v_derived := null;
    end;

    -- ...and then the SAME post-derivation identity walls the proposal writer runs, out of the
    -- SAME body. A vendor that clears the frozen ladder but trips law 79's family collision,
    -- corpus distinctness, the trusted-clock span or the printed-identifier wall is NOT
    -- eligible, and this read says so in the writer's own words. Without this the read would
    -- send Clara at a door that is certain to refuse her -- probing by refusal, the exact
    -- pattern this verb exists to prevent.
    if v_ok and v_derived is not null then
      v_reason := clara._binding_extra_blocker(w.firm_id, p_client, cp.id, v_derived, v_basis);
      if v_reason is not null then v_ok := false; end if;
    end if;

    -- The loop brakes, in precedence order. A human's "no" outranks everything: Clara must not
    -- re-propose what a human declined (risk R7), and the proposal door refuses it too (W14), so
    -- this row and that wall agree.
    if v_declined then
      v_ok := false; v_reason := 'binding_declined';
    elsif v_open then
      v_ok := false; v_reason := 'binding_proposal_open';
    end if;

    counterparty_id := cp.id;
    counterparty_name := cp.name;
    eligible := v_ok;
    reason := v_reason;
    matched_approved_entries := coalesce((v_basis->>'matched_approved_entries')::int, 0);
    has_open_proposal := v_open;
    has_live_binding := v_live;
    has_declined_proposal := v_declined;
    return next;
  end loop;
end $fn$;
comment on function clara.wake_list_binding_candidates(uuid) is
  '裁-18b (G1/G3): the eligibility read that keeps trigger T1 from probing by refusal. One row per '
  'ACTIVE vendor counterparty of the client. `eligible`/`reason` come from CALLING the byte-frozen '
  'clara._derive_vendor_binding_proposal itself -- the ladder''s own typed CLR36 word, never a '
  'second implementation of its window (G3: one fact, one definition; clara._coding_lane_core is '
  'untouched). matched_approved_entries is the DB''s count, never Clara''s. A DECLINED proposal '
  'outranks every other verdict: the loop brake that stops her re-proposing what a human refused, '
  'and it agrees with the proposal door''s own W14 wall. Any non-CLR36 error is RE-RAISED, never '
  'swallowed into a quiet "not eligible".';

-- =====================================================================================
-- SS10 -- clara.decline_vendor_identity_binding: the human "no" (G7, first half)
-- =====================================================================================
-- The other half of the two-party shape 裁-18b builds: a card a human cannot answer "no" to is
-- not a consent surface. Survey A3 measured that the status CHECK has always admitted
-- 'declined' while NO verb anywhere ever wrote it -- an admin who disagreed could only let the
-- proposal rot. Admin floor (the SIGNER's floor, because declining is the same decision said the
-- other way), reason required, audited, proposed -> declined, and read by the loop brake.
create function clara.decline_vendor_identity_binding(
    p_binding uuid, p_reason text, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $fn$
declare c record; v_dedupe jsonb; b record; v_reason text;
begin
  c := clara._human_ctx(clara.role_rank('admin'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  if p_binding is null then
    raise exception 'binding is required' using errcode = 'CLR10';
  end if;
  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  if v_reason is null then
    raise exception 'a decline reason is required' using errcode = 'CLR36',
      detail = '{"reason":"decline_reason_required"}';
  end if;
  v_dedupe := clara._reserve_op(c.firm, 'decline_vendor_identity_binding', p_op_key,
    clara._hash(jsonb_build_object('binding_id', p_binding, 'reason', v_reason)));
  if v_dedupe is not null then return v_dedupe; end if;

  select * into b from clara.vendor_identity_bindings where id = p_binding for update;
  if not found or b.firm_id <> c.firm then
    raise exception 'binding not found' using errcode = 'CLR11';
  end if;
  if b.status <> 'proposed' then
    raise exception 'binding_not_proposed' using errcode = 'CLR36';
  end if;

  update clara.vendor_identity_bindings
     set status = 'declined', declined_by = c.actor, declined_at = now(), decline_reason = v_reason
   where id = p_binding;

  perform clara._audit(c.firm, c.actor, null, null,
    'decline_vendor_identity_binding', null,
    jsonb_build_object('binding_id', p_binding, 'client_id', b.client_id,
      'counterparty_id', b.counterparty_id, 'reason', v_reason, 'op_key', p_op_key));
  perform clara._append_event(c.firm, 'kb_binding.declined', b.client_id, c.actor,
    null, null, null, null, null,
    jsonb_build_object('binding_id', p_binding, 'counterparty_id', b.counterparty_id));
  return clara._finish_op(c.firm, 'decline_vendor_identity_binding', p_op_key,
    jsonb_build_object('binding_id', p_binding, 'status', 'declined'));
end $fn$;
comment on function clara.decline_vendor_identity_binding(uuid,text,text) is
  '裁-18b (G7): a human ADMIN declines a proposed vendor identity binding. Admin floor -- the '
  'signer''s own floor, because declining is that decision said the other way. Reason required, '
  'audited, evented, proposed -> declined only. Closes survey A3 (the status CHECK admitted '
  '''declined'' since 0028 and no verb ever wrote it). The decline is what the loop brake in '
  'clara.wake_list_binding_candidates and the W14 wall in the proposal core both read, so Clara '
  'never re-proposes what a human refused. Frontend home: the admin / vendor-bindings panel, '
  'beside Sign in the proposal dialog.';

reset role;

-- =====================================================================================
-- SS11 -- ACL + THE ALLOWLIST (G1 arm A's complete delta: 4 rows, 3 grants, 0 new roles)
-- =====================================================================================
revoke all on function clara.wake_propose_vendor_identity_binding(uuid,uuid,jsonb,text,jsonb,text) from public;
grant execute on function clara.wake_propose_vendor_identity_binding(uuid,uuid,jsonb,text,jsonb,text)
  to clara_wake_filing, clara_wake_interactive;

revoke all on function clara.wake_list_binding_candidates(uuid) from public;
grant execute on function clara.wake_list_binding_candidates(uuid)
  to clara_wake_filing, clara_wake_interactive;

revoke all on function clara.decline_vendor_identity_binding(uuid,text,text) from public;
grant execute on function clara.decline_vendor_identity_binding(uuid,text,text) to clara_authenticated;

insert into clara.wake_fn_allowlist(wake_kind, function_name) values
  ('filing',     'wake_propose_vendor_identity_binding'),
  ('interactive','wake_propose_vendor_identity_binding'),
  ('filing',     'wake_list_binding_candidates'),
  ('interactive','wake_list_binding_candidates');

-- =====================================================================================
-- SS12 -- TAIL SELF-PROOF. Raises on failure; every claim is RE-READ from the live catalog.
-- =====================================================================================
do $bp1_tail$
declare v_bad text; v_n int; v_def text; v_census record; v_constraint text; v_sha text; v_idx record; v_src text;
begin
  -- (1) THE D1 CLAIM, PROVEN AS A CENSUS: each of the five new function NAMES resolves at exactly
  --     one pg_proc row -- no overload was shadowed into existence, and nothing was replaced.
  select string_agg(format('%s x%s', t.n, coalesce(k.c,0)), ', ' order by t.n) into v_bad
    from (values ('_derive_vendor_binding_basis'),('_propose_vendor_binding_agent_core'),
                 ('wake_propose_vendor_identity_binding'),('wake_list_binding_candidates'),
                 ('decline_vendor_identity_binding')) t(n)
    left join lateral (select count(*)::int c from pg_proc p join pg_namespace n2 on n2.oid = p.pronamespace
                        where n2.nspname = 'clara' and p.proname = t.n) k on true
   where coalesce(k.c,0) <> 1;
  if v_bad is not null then
    raise exception 'binding proposal pr-1 tail: new function(s) do not resolve at exactly one pg_proc row: %', v_bad
      using errcode = 'CLR10';
  end if;

  -- (2) THE D1 INVENTORY IS EMPTY, PROVEN BY RE-PIN: every DO-NOT-TOUCH body is BYTE-IDENTICAL
  --     to its SS1 prestate stash. This is the cell that makes "zero audited writer bodies
  --     replaced" a measurement rather than a claim -- and it is what leaves PR-3 an undisturbed
  --     _approve_entry_core pre-image to pin.
  select string_agg(format('%s (was %s, now %s)', pre.k, left(pre.v,12), left(now.sha,12)), '; ' order by pre.k)
    into v_bad
    from _bp1_pre pre
    join lateral (select encode(sha256(convert_to(
           (select p.prosrc from pg_proc p where p.oid = pre.k::regprocedure), 'UTF8')), 'hex') as sha) now on true
   where pre.k not in ('foreign_objs','event_types_total') and now.sha is distinct from pre.v;
  if v_bad is not null then
    raise exception 'binding proposal pr-1 tail: a DO-NOT-TOUCH body CHANGED -- the D1 inventory is not empty: %', v_bad
      using errcode = 'CLR10';
  end if;
  if (select count(*) from _bp1_pre where k not in ('foreign_objs','event_types_total')) <> 18 then
    raise exception 'binding proposal pr-1 tail: the re-pin covered % bodies, expected 18',
      (select count(*) from _bp1_pre where k not in ('foreign_objs','event_types_total')) using errcode = 'CLR10';
  end if;
  -- The two that carry the design, re-pinned against their literals as well as against the stash
  -- (a stash that was itself wrong would compare equal to itself).
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara._derive_vendor_binding_proposal(uuid,uuid,uuid)'::regprocedure;
  if v_sha <> 'de0f58078f23ef2c6ce3f4a82cb29691a3633e3b8b9c48ae90babc53e7ee043c' then
    raise exception 'binding proposal pr-1 tail: _derive_vendor_binding_proposal drifted from de0f5807... (got %)', v_sha
      using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara._coding_lane_core(uuid,uuid)'::regprocedure;
  if v_sha <> '721a6704e3284679103537bdda56bf741422041e16dda0f4654394f1d9506fda' then
    raise exception 'binding proposal pr-1 tail: _coding_lane_core drifted from 721a6704... -- G3 says it is untouched (got %)', v_sha
      using errcode = 'CLR10';
  end if;

  -- (3) G4's two registry widenings, exercised in BOTH DIRECTIONS -- REAL INSERT probes against
  --     the LIVE constraints, never a regex literal compared against itself (0142's F7 round-2
  --     discipline: asking whether 'pb_binding' ~ '<pattern typed here>' is a fact about the
  --     STRING TYPED HERE, not about what the database enforces). ADMISSION of 'pb_binding' is
  --     already proven for real by SS3's own INSERT. These prove REFUSAL, each isolating ONE
  --     column by making every other column lawful and unique, and each confirming the refusal
  --     came from ITS NAMED constraint via get stacked diagnostics.
  begin
    insert into clara.agent_receipt_surfaces(item, receipt_kind, shim_relname, expected_source)
      values ('pb_Binding', 'probe_kind_a', '_agent_receipt_src_pb_probea', 'probe_source_a');
    raise exception 'binding proposal pr-1 tail: a garbage item (pb_Binding, uppercase) was WRONGLY ADMITTED by the live item_check'
      using errcode = 'CLR10';
  exception when check_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint is distinct from 'agent_receipt_surfaces_item_check' then
      raise exception 'binding proposal pr-1 tail: probe 1 was refused by % instead of agent_receipt_surfaces_item_check -- the probe does not isolate what it claims to', v_constraint
        using errcode = 'CLR10';
    end if;
  end;
  begin
    insert into clara.agent_receipt_surfaces(item, receipt_kind, shim_relname, expected_source)
      values ('pb_probeb', 'probe_kind_b', '_agent_receipt_src_pb_Probeb', 'probe_source_b');
    raise exception 'binding proposal pr-1 tail: a garbage shim_relname (uppercase) was WRONGLY ADMITTED by the live shim_relname_check'
      using errcode = 'CLR10';
  exception when check_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint is distinct from 'agent_receipt_surfaces_shim_relname_check' then
      raise exception 'binding proposal pr-1 tail: probe 2 was refused by % instead of agent_receipt_surfaces_shim_relname_check', v_constraint
        using errcode = 'CLR10';
    end if;
  end;
  -- The f_a arm SURVIVED the widening -- the direction a naive rewrite would silently break, and
  -- the one an "is pb_binding admitted?" probe can never see. Proven by a REAL INSERT that must
  -- be ADMITTED. The row is then unwound by raising a private sentinel out of the sub-block, so
  -- the implicit savepoint rolls the INSERT back: clara.agent_receipt_surfaces is APPEND-ONLY
  -- (measured the hard way on this file's own rig -- a DELETE here is refused by the guard), so
  -- a savepoint rollback is the only lawful way to undo a probe row.
  begin
    insert into clara.agent_receipt_surfaces(item, receipt_kind, shim_relname, expected_source)
      values ('f_a42', 'probe_kind_c', '_agent_receipt_src_f_a42', 'probe_source_c');
    raise exception 'bp1_probe_f_a_admitted' using errcode = 'CLR99';
  exception
    when check_violation then
      get stacked diagnostics v_constraint = constraint_name;
      raise exception 'binding proposal pr-1 tail: the widened %s REFUSED a lawful f_a member -- the pre-existing f_a family was BROKEN by the pb_ widening',
        coalesce(v_constraint,'(unnamed constraint)') using errcode = 'CLR10';
    when sqlstate 'CLR99' then
      if sqlerrm <> 'bp1_probe_f_a_admitted' then raise; end if;
  end;
  -- ...and the probe row really is gone, so the count cell below is not measuring the probe.
  if exists (select 1 from clara.agent_receipt_surfaces where item = 'f_a42') then
    raise exception 'binding proposal pr-1 tail: the f_a42 admission probe row survived its savepoint rollback'
      using errcode = 'CLR10';
  end if;
  select pg_get_constraintdef(oid) into v_def from pg_constraint
   where conrelid = 'clara.agent_receipt_surfaces'::regclass and conname = 'agent_receipt_surfaces_item_check';
  if v_def is distinct from 'CHECK ((item ~ ''^(f_a[0-9]+[a-z]?|pb_[a-z][a-z0-9_]*)$''::text))' then
    raise exception 'binding proposal pr-1 tail: agent_receipt_surfaces_item_check is not the widened text (got: %)',
      coalesce(v_def, '(absent)') using errcode = 'CLR10';
  end if;
  select pg_get_constraintdef(oid) into v_def from pg_constraint
   where conrelid = 'clara.agent_receipt_surfaces'::regclass and conname = 'agent_receipt_surfaces_shim_relname_check';
  if v_def is distinct from 'CHECK ((shim_relname ~ ''^_agent_receipt_src_(f_a[0-9]+[a-z]?|pb_[a-z][a-z0-9_]*)$''::text))' then
    raise exception 'binding proposal pr-1 tail: agent_receipt_surfaces_shim_relname_check is not the widened text (got: %)',
      coalesce(v_def, '(absent)') using errcode = 'CLR10';
  end if;

  -- (4) The registry now holds 9 rows; pb_binding conforms; the census sees 9; nothing is dark;
  --     agent_receipts_visible still carries the 19-column contract in order.
  if (select count(*) from clara.agent_receipt_surfaces) <> 9 then
    raise exception 'binding proposal pr-1 tail: agent_receipt_surfaces holds % row(s), expected 9',
      (select count(*) from clara.agent_receipt_surfaces) using errcode = 'CLR10';
  end if;
  if not exists (select 1 from clara.agent_receipt_surfaces where item = 'pb_binding'
      and receipt_kind = 'binding_agent' and shim_relname = '_agent_receipt_src_pb_binding'
      and expected_source = 'binding_agent_receipts') then
    raise exception 'binding proposal pr-1 tail: the pb_binding registry row is missing or wrong-shaped' using errcode = 'CLR10';
  end if;
  perform clara._assert_receipt_surface_conforms('_agent_receipt_src_pb_binding');
  select * into v_census from clara.agent_receipt_source_census() where item = 'pb_binding';
  if v_census.item is null or not v_census.shim_exists or not v_census.wired or not v_census.conforms
     or v_census.dark_rows <> 0 or v_census.column_count <> 19 then
    raise exception 'binding proposal pr-1 tail: the pb_binding census row is not shim_exists+wired+conforms+19-col+zero-dark (got %)',
      to_jsonb(v_census) using errcode = 'CLR10';
  end if;
  if (select count(*) from clara.agent_receipt_source_census()) <> 9 then
    raise exception 'binding proposal pr-1 tail: the receipt-source census returned % row(s), expected 9',
      (select count(*) from clara.agent_receipt_source_census()) using errcode = 'CLR10';
  end if;
  select string_agg(format('#%s %s %s', ct.ordinal, ct.column_name, ct.data_type), '; ' order by ct.ordinal)
    into v_bad
    from clara.agent_receipt_contract ct
    left join pg_attribute a
      on a.attrelid = 'clara.agent_receipts_visible'::regclass
     and a.attnum = ct.ordinal and not a.attisdropped
   where a.attname is distinct from ct.column_name
      or format_type(a.atttypid, a.atttypmod) is distinct from ct.data_type;
  if v_bad is not null then
    raise exception 'binding proposal pr-1 tail: agent_receipts_visible no longer carries the 19-column contract: %', v_bad
      using errcode = 'CLR10';
  end if;
  select string_agg(format('%s/%s x%s', d.receipt_kind, coalesce(d.scope,'(null)'), d.dark_rows), ', ')
    into v_bad from clara.agent_receipt_dark_rows() d;
  if v_bad is not null then
    raise exception 'binding proposal pr-1 tail: receipt rows visible to NOBODY after the widening: %', v_bad
      using errcode = 'CLR10';
  end if;

  -- (5) binding_agent_receipts: RLS enabled+forced, owner-only, zero non-owner grants, zero
  --     app-role DML, and the append-only trigger PAIR actually attached (a policy without the
  --     triggers is a table an owner-context bug can still rewrite).
  if not exists (select 1 from pg_class c where c.oid = 'clara.binding_agent_receipts'::regclass
      and c.relrowsecurity and c.relforcerowsecurity) then
    raise exception 'binding proposal pr-1 tail: binding_agent_receipts is not RLS-enabled+forced' using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from information_schema.role_table_grants g
   where g.table_schema = 'clara' and g.table_name = 'binding_agent_receipts' and g.grantee <> 'clara_fn_owner';
  if v_n <> 0 then
    raise exception 'binding proposal pr-1 tail: binding_agent_receipts holds % non-owner table grant(s), expected 0', v_n
      using errcode = 'CLR10';
  end if;
  select string_agg(format('%s:%s', p.priv, r.rolname), ', ') into v_bad
    from (values ('insert'),('update'),('delete')) p(priv)
    cross join (values ('clara_authenticated'),('clara_agent_ro'),('clara_wake_interactive'),
                       ('clara_wake_proactive'),('clara_wake_filing'),('clara_wake_bank'),
                       ('clara_freeform_ro'),('clara_runtime')) r(rolname)
   where has_table_privilege(r.rolname, 'clara.binding_agent_receipts', p.priv);
  if v_bad is not null then
    raise exception 'binding proposal pr-1 tail: an app role holds DML on binding_agent_receipts: %', v_bad using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from pg_trigger t
   where t.tgrelid = 'clara.binding_agent_receipts'::regclass and not t.tgisinternal
     and t.tgname in ('t_binding_agent_receipts_append_only','t_binding_agent_receipts_no_truncate');
  if v_n <> 2 then
    raise exception 'binding proposal pr-1 tail: binding_agent_receipts carries % of its 2 append-only triggers', v_n
      using errcode = 'CLR10';
  end if;

  -- (6) The six new columns, by type and nullability, plus the four new CHECKs and the FK.
  select string_agg(format('%s(%s,%s)', t.n, coalesce(k.typ,'(absent)'), coalesce(k.nn::text,'?')), ', ' order by t.n)
    into v_bad
    from (values ('proposed_by_agent','boolean',true),('proposer_model','text',false),
                 ('proposal_receipt_id','uuid',false),('declined_by','uuid',false),
                 ('declined_at','timestamp with time zone',false),('decline_reason','text',false),
                 ('directed_by','uuid',false),('effective_proposer','uuid',false),
                 ('self_approved','boolean',true),('self_approval_reason','text',false)) t(n,ty,req)
    left join lateral (select format_type(a.atttypid,a.atttypmod) typ, a.attnotnull nn
                         from pg_attribute a
                        where a.attrelid = 'clara.vendor_identity_bindings'::regclass
                          and a.attnum > 0 and not a.attisdropped and a.attname = t.n) k on true
   where k.typ is distinct from t.ty or k.nn is distinct from t.req;
  if v_bad is not null then
    raise exception 'binding proposal pr-1 tail: new vendor_identity_bindings column(s) wrong-shaped: %', v_bad
      using errcode = 'CLR10';
  end if;
  select string_agg(t.n, ', ' order by t.n) into v_bad
    from (values ('ck_vib_proposed_by_agent_honest'),('ck_vib_proposer_model_honest'),
                 ('ck_vib_proposal_receipt_honest'),('ck_vib_declined'),
                 ('ck_vib_decline_reason_honest'),('fk_vib_proposal_receipt')) t(n)
   where not exists (select 1 from pg_constraint
                      where conrelid = 'clara.vendor_identity_bindings'::regclass and conname = t.n);
  if v_bad is not null then
    raise exception 'binding proposal pr-1 tail: new constraint(s) missing on vendor_identity_bindings: %', v_bad
      using errcode = 'CLR10';
  end if;
  -- The honesty CHECK is BIDIRECTIONAL in text -- an equality, never a one-way implication. Read
  -- from the catalog, so a later hand-edit that weakens it to `or` cannot pass this cell.
  select pg_get_constraintdef(oid) into v_def from pg_constraint
   where conrelid = 'clara.vendor_identity_bindings'::regclass and conname = 'ck_vib_proposed_by_agent_honest';
  if v_def is distinct from 'CHECK ((proposed_by_agent = (created_by = clara.agent_user_id())))' then
    raise exception 'binding proposal pr-1 tail: ck_vib_proposed_by_agent_honest is not the bidirectional equality (live: %)',
      coalesce(v_def,'(absent)') using errcode = 'CLR10';
  end if;
  -- vendor_identity_bindings is now 17 + 6 = 23 columns, and nothing else moved.
  select count(*)::int into v_n from pg_attribute a
   where a.attrelid = 'clara.vendor_identity_bindings'::regclass and a.attnum > 0 and not a.attisdropped;
  if v_n <> 27 then
    raise exception 'binding proposal pr-1 tail: vendor_identity_bindings carries % column(s), expected 17+10=27', v_n
      using errcode = 'CLR10';
  end if;

  -- (7) G8's index, asserted BY PROPERTY from pg_index -- unique, valid, ready, live, exactly
  --     the two key columns (client_id, counterparty_id), and a partial predicate that is
  --     status='proposed'. Never by name alone: a name proves spelling, not behaviour (law 3).
  select i.indisunique, i.indisvalid, i.indisready, i.indislive,
         (select array_agg(a.attname order by k.ord)
            from unnest(i.indkey::smallint[]) with ordinality k(attnum, ord)
            join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum) as cols,
         pg_get_expr(i.indpred, i.indrelid) as pred
    into v_idx
    from pg_index i
   where i.indexrelid = 'clara.uq_vib_one_active_binding'::regclass;
  if v_idx.indisunique is not true or v_idx.indisvalid is not true
     or v_idx.indisready is not true or v_idx.indislive is not true then
    raise exception 'binding proposal pr-1 tail: uq_vib_one_active_binding is not a unique+valid+ready+live index (got %)',
      to_jsonb(v_idx) using errcode = 'CLR10';
  end if;
  if v_idx.cols is distinct from array['client_id','counterparty_id']::name[] then
    raise exception 'binding proposal pr-1 tail: uq_vib_one_active_binding keys are %, expected {client_id,counterparty_id}',
      v_idx.cols using errcode = 'CLR10';
  end if;
  if v_idx.pred is distinct from '(status = ANY (ARRAY[''proposed''::text, ''live''::text]))' then
    raise exception 'binding proposal pr-1 tail: uq_vib_one_active_binding predicate is %, expected status IN (proposed,live) -- a proposed-ONLY predicate loses the propose-vs-sign race',
      coalesce(v_idx.pred,'(none -- NOT PARTIAL, so it would forbid a second binding of ANY status)') using errcode = 'CLR10';
  end if;
  -- uq_vib_one_live is UNMOVED -- the widening added a sibling, it did not recut the original.
  if not exists (select 1 from pg_index i where i.indexrelid = 'clara.uq_vib_one_live'::regclass
                  and i.indisunique and pg_get_expr(i.indpred, i.indrelid) = '(status = ''live''::text)') then
    raise exception 'binding proposal pr-1 tail: uq_vib_one_live is gone or changed' using errcode = 'CLR10';
  end if;

  -- (8) ACL + allowlist. Both wake verbs reachable by BOTH ruled roles and by NOBODY else; the
  --     decline verb clara_authenticated-only and reachable by no wake role; the two ungranted
  --     internals reachable by no app role at all.
  select string_agg(format('%s!%s', t.fn, t.rolname), ', ') into v_bad
    from (values ('clara.wake_propose_vendor_identity_binding(uuid,uuid,jsonb,text,jsonb,text)','clara_wake_filing'),
                 ('clara.wake_propose_vendor_identity_binding(uuid,uuid,jsonb,text,jsonb,text)','clara_wake_interactive'),
                 ('clara.wake_list_binding_candidates(uuid)','clara_wake_filing'),
                 ('clara.wake_list_binding_candidates(uuid)','clara_wake_interactive'),
                 ('clara.decline_vendor_identity_binding(uuid,text,text)','clara_authenticated')) t(fn, rolname)
   where not has_function_privilege(t.rolname, t.fn, 'EXECUTE');
  if v_bad is not null then
    raise exception 'binding proposal pr-1 tail: a required EXECUTE grant is MISSING: %', v_bad using errcode = 'CLR10';
  end if;
  select string_agg(format('%s=%s', t.fn, t.rolname), ', ') into v_bad
    from (values
      ('clara.wake_propose_vendor_identity_binding(uuid,uuid,jsonb,text,jsonb,text)','clara_authenticated'),
      ('clara.wake_propose_vendor_identity_binding(uuid,uuid,jsonb,text,jsonb,text)','clara_agent_ro'),
      ('clara.wake_propose_vendor_identity_binding(uuid,uuid,jsonb,text,jsonb,text)','clara_wake_proactive'),
      ('clara.wake_propose_vendor_identity_binding(uuid,uuid,jsonb,text,jsonb,text)','clara_wake_bank'),
      ('clara.wake_propose_vendor_identity_binding(uuid,uuid,jsonb,text,jsonb,text)','clara_freeform_ro'),
      ('clara.wake_propose_vendor_identity_binding(uuid,uuid,jsonb,text,jsonb,text)','clara_runtime'),
      ('clara.wake_list_binding_candidates(uuid)','clara_authenticated'),
      ('clara.wake_list_binding_candidates(uuid)','clara_agent_ro'),
      ('clara.wake_list_binding_candidates(uuid)','clara_wake_proactive'),
      ('clara.wake_list_binding_candidates(uuid)','clara_wake_bank'),
      ('clara.wake_list_binding_candidates(uuid)','clara_freeform_ro'),
      ('clara.wake_list_binding_candidates(uuid)','clara_runtime'),
      ('clara.decline_vendor_identity_binding(uuid,text,text)','clara_wake_filing'),
      ('clara.decline_vendor_identity_binding(uuid,text,text)','clara_wake_interactive'),
      ('clara.decline_vendor_identity_binding(uuid,text,text)','clara_agent_ro'),
      ('clara.decline_vendor_identity_binding(uuid,text,text)','clara_runtime'),
      ('clara._propose_vendor_binding_agent_core(uuid,uuid,uuid,text,uuid,uuid,uuid,uuid,jsonb,text,jsonb,text)','clara_authenticated'),
      ('clara._propose_vendor_binding_agent_core(uuid,uuid,uuid,text,uuid,uuid,uuid,uuid,jsonb,text,jsonb,text)','clara_wake_filing'),
      ('clara._propose_vendor_binding_agent_core(uuid,uuid,uuid,text,uuid,uuid,uuid,uuid,jsonb,text,jsonb,text)','clara_wake_interactive'),
      ('clara._derive_vendor_binding_basis(uuid,uuid,uuid)','clara_authenticated'),
      ('clara._derive_vendor_binding_basis(uuid,uuid,uuid)','clara_wake_filing'),
      ('clara._derive_vendor_binding_basis(uuid,uuid,uuid)','clara_wake_interactive')
    ) t(fn, rolname)
   where has_function_privilege(t.rolname, t.fn, 'EXECUTE');
  if v_bad is not null then
    raise exception 'binding proposal pr-1 tail: a door is reachable by a role it must not be: %', v_bad using errcode = 'CLR10';
  end if;
  -- Exactly four new allowlist rows, exactly the ruled four; 88 + 4 = 92 total.
  select string_agg(format('%s/%s x%s', t.k, t.f, coalesce(c.n,0)), ', ' order by t.k, t.f) into v_bad
    from (values ('filing','wake_propose_vendor_identity_binding'),
                 ('interactive','wake_propose_vendor_identity_binding'),
                 ('filing','wake_list_binding_candidates'),
                 ('interactive','wake_list_binding_candidates')) t(k,f)
    left join lateral (select count(*)::int n from clara.wake_fn_allowlist a
                        where a.wake_kind = t.k and a.function_name = t.f) c on true
   where coalesce(c.n,0) <> 1;
  if v_bad is not null then
    raise exception 'binding proposal pr-1 tail: allowlist row(s) not present exactly once: %', v_bad using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from clara.wake_fn_allowlist where function_name ilike '%binding%';
  if v_n <> 4 then
    raise exception 'binding proposal pr-1 tail: the allowlist carries % binding row(s), expected exactly the 4 ruled ones', v_n
      using errcode = 'CLR10';
  end if;
  -- The five NOT-admitted kinds carry no row for either verb -- the closed-world half of W2,
  -- proven as an absence over the WHOLE allowlist rather than kind by kind.
  select string_agg(format('%s/%s', a.wake_kind, a.function_name), ', ') into v_bad
    from clara.wake_fn_allowlist a
   where a.function_name in ('wake_propose_vendor_identity_binding','wake_list_binding_candidates')
     and a.wake_kind not in ('filing','interactive');
  if v_bad is not null then
    raise exception 'binding proposal pr-1 tail: a non-ruled wake kind is allowlisted for a binding verb: %', v_bad
      using errcode = 'CLR10';
  end if;

  -- (9) NO new role, NO wake_credentials CHECK change, NO wake_engine_sources row, NO egress
  --     purpose widening -- the four "this file does not do that" claims, each MEASURED.
  if (select count(*) from pg_roles where rolname like 'clara%') <> 14 then
    raise exception 'binding proposal pr-1 tail: the clara role count moved from 14 to % -- this file mints no role and owes no roles-bootstrap twin',
      (select count(*) from pg_roles where rolname like 'clara%') using errcode = 'CLR10';
  end if;
  select pg_get_constraintdef(oid) into v_def from pg_constraint
   where conrelid = 'clara.wake_credentials'::regclass and conname = 'ck_wake_credentials_kind_0011';
  if v_def is distinct from
     'CHECK ((wake_kind = ANY (ARRAY[''interactive''::text, ''proactive''::text, ''autodraft''::text, ''interactive_client''::text, ''close_prep''::text, ''bank_agent''::text, ''filing''::text])))' then
    raise exception 'binding proposal pr-1 tail: ck_wake_credentials_kind_0011 moved (live: %)', coalesce(v_def,'(absent)')
      using errcode = 'CLR10';
  end if;
  if (select count(*) from clara.wake_engine_sources) <> 2
     or exists (select 1 from clara.wake_engine_sources where enabled) then
    raise exception 'binding proposal pr-1 tail: wake_engine_sources is not the untouched 2-row, both-disabled world (PR-4''s, not this file''s)'
      using errcode = 'CLR10';
  end if;

  -- (9a) THE TRIGGER CONTRACT (conductor ruling 2026-08-29). The closed world is exactly
  --      {wake_task, wake_credential} -- BOTH directions proven by real INSERT probes against
  --      the live CHECK, and 'chat_turn' proven ABSENT rather than merely not mentioned: it is
  --      the value the estate's other two receipt tables admit, so "we did not copy it" has to
  --      be a measurement, not a claim.
  select pg_get_constraintdef(oid) into v_def from pg_constraint
   where conrelid = 'clara.binding_agent_receipts'::regclass
     and pg_get_constraintdef(oid) like '%trigger_kind%';
  if v_def is distinct from
     'CHECK ((trigger_kind = ANY (ARRAY[''wake_task''::text, ''wake_credential''::text])))' then
    raise exception 'binding proposal pr-1 tail: the trigger_kind closed world is not {wake_task, wake_credential} (live: %)',
      coalesce(v_def,'(absent)') using errcode = 'CLR10';
  end if;
  --      The body must never write a credential uuid under 'wake_task'. Proven in CODE, on the
  --      live prosrc, comment-stripped -- the two assignments are paired the only honest way.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara._propose_vendor_binding_agent_core(uuid,uuid,uuid,text,uuid,uuid,uuid,uuid,jsonb,text,jsonb,text)'::regprocedure;
  v_src := regexp_replace(regexp_replace(v_src, '/\*.*?\*/', '', 'gs'), '--[^\n]*', '', 'g');
  if position('v_trigger_kind := ''wake_task'';   v_trigger_id := p_task::text;' in v_src) = 0
     or position('v_trigger_kind := ''wake_credential''; v_trigger_id := p_credential::text;' in v_src) = 0 then
    raise exception 'binding proposal pr-1 tail: the trigger_kind/trigger_id pairing is not the honest one in CODE'
      using errcode = 'CLR10';
  end if;
  if (select count(*) from regexp_matches(v_src, 'p_credential::text', 'g')) <> 1 then
    raise exception 'binding proposal pr-1 tail: p_credential::text appears more than once in CODE -- a second use could be writing it under the wrong kind'
      using errcode = 'CLR10';
  end if;

  -- (9b) THE EVENT-TYPE REGISTRY: exactly two new members, both client_scoped, the pre-existing
  --      world untouched -- and, the discriminating half, the gate STILL REFUSES an
  --      unregistered type. Registering two names must not have opened a hole; proven by a REAL
  --      insert probe through the live trigger, rolled back out of its own sub-block (the
  --      append-only guard on clara.domain_events forbids a DELETE, the same lesson §(3)'s f_a42
  --      probe learned on clara.agent_receipt_surfaces).
  select string_agg(t.n, ', ' order by t.n) into v_bad
    from (values ('kb_binding.agent_proposed'),('kb_binding.declined')) t(n)
   where not exists (select 1 from clara.event_types e where e.name = t.n and e.client_scoped);
  if v_bad is not null then
    raise exception 'binding proposal pr-1 tail: event_types is missing (or not client_scoped): %', v_bad
      using errcode = 'CLR10';
  end if;
  if (select count(*) from clara.event_types where name like 'kb_binding.%') <> 5 then
    raise exception 'binding proposal pr-1 tail: clara.event_types carries % kb_binding.* member(s), expected 3+2=5',
      (select count(*) from clara.event_types where name like 'kb_binding.%') using errcode = 'CLR10';
  end if;
  if (select count(*)::text from clara.event_types)
     is distinct from ((select v from _bp1_pre where k = 'event_types_total')::int + 2)::text then
    raise exception 'binding proposal pr-1 tail: clara.event_types moved by something other than this file''s 2 rows (was %, now %)',
      (select v from _bp1_pre where k = 'event_types_total'),
      (select count(*)::text from clara.event_types) using errcode = 'CLR10';
  end if;
  begin
    insert into clara.domain_events(firm_id, seq, event_type, client_id, actor, payload)
      values ((select id from clara.firms order by created_at limit 1), -424242,
              'kb_binding.definitely_not_registered', null, null, '{}'::jsonb);
    raise exception 'binding proposal pr-1 tail: an UNREGISTERED event_type was ADMITTED -- registering two names opened a hole in the gate'
      using errcode = 'CLR10';
  exception
    when sqlstate 'CLR10' then
      if sqlerrm not like 'unknown event_type %' then raise; end if;
  end;

  -- (10) CONSTRAINT 15: the frozen prior build and the Slice-0 parked run are exactly as found.
  if (select coalesce(count(*),0)::text from pg_class c join pg_namespace n2 on n2.oid = c.relnamespace
       where n2.nspname in ('workflow','graphile_worker','spike'))
     is distinct from (select v from _bp1_pre where k = 'foreign_objs') then
    raise exception 'binding proposal pr-1 tail: object count in workflow/graphile_worker/spike MOVED' using errcode = 'CLR10';
  end if;

  raise notice 'binding proposal pr-1 tail: OK -- D1 INVENTORY EMPTY, PROVEN: all 18 DO-NOT-TOUCH bodies re-pin BYTE-IDENTICAL to their SS1 prosrc stash (incl. _approve_entry_core, left undisturbed for PR-3''s own pre-image; _derive_vendor_binding_proposal re-pinned against de0f5807... and _coding_lane_core against 721a6704... independently of the stash), and each of the 5 new function NAMES resolves at exactly one pg_proc row under every arity. G4: the item/shim_relname registry CHECKs REFUSED two REAL uppercase INSERT probes, each isolated by lawful companion columns and confirmed refused by ITS NAMED constraint, and ADMITTED a real f_a42 probe -- the pre-existing f_a family survived the pb_ widening -- with both widened definitions read byte-exact; agent_receipt_surfaces holds 9 rows, pb_binding is shim_exists+wired+conforms+19-col+zero-dark, the census returns 9, agent_receipts_visible''s 19-column contract is unchanged and nothing is dark. binding_agent_receipts: RLS enabled+forced, owner-only, ZERO non-owner grants, ZERO app-role DML across 8 roles, both append-only triggers attached. vendor_identity_bindings: 6 new columns at the right type/nullability (17+6=23 total), 5 new CHECKs + 1 composite FK present, and ck_vib_proposed_by_agent_honest read from the catalog as a BIDIRECTIONAL EQUALITY. G8: uq_vib_one_open_proposal asserted BY PROPERTY from pg_index (unique+valid+ready+live, keys {client_id,counterparty_id}, predicate status=''proposed''), never by name; uq_vib_one_live unmoved. ACL: both wake verbs EXECUTE-able by clara_wake_filing AND clara_wake_interactive and by none of 6 other roles; decline is clara_authenticated-only; both internals ungranted; exactly 4 allowlist rows, all 4 ruled, and NO non-ruled wake kind names either verb. EVENT-TYPE REGISTRY (the FIFTH shared surface, absent from annex G-f): exactly 2 new members, both client_scoped, kb_binding.* 3->5, the whole registry moved by exactly +2, and an UNREGISTERED type is STILL refused by the live trigger via a real insert probe -- registering two names opened no hole. NO new role (14, unmoved -- no roles-bootstrap twin owed), NO wake_credentials CHECK change, NO wake_engine_sources row (2, both still disabled -- PR-4''s). No table in workflow/graphile_worker/spike touched.';
end
$bp1_tail$;
