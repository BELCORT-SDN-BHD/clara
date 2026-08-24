-- UNNUMBERED_f_a7_pi_additive.sql -- Wave-F Track A, F-A7 (the filing verb + the interview
-- model layer), PR-1, TRAIN pi. Authored UNNUMBERED; the number is claimed at MERGE
-- PREPARATION (standing law, AGENTS.md + .claude/rules/db-migrations.md). The battery gates
-- on the CATALOG and on this file's STEM, never on a number.
--
-- Design of record: docs/plan/active/filing-and-interview-design.md v2 (SS3.3 rider 4, SS3.4,
-- SS4 train pi, SS6 row 1) + -annexes-1.md Annex A/C (D-4, D-6, D-11, D-19) +
-- -annexes-2.md Annex I.1 (the pi row) / I.2 ("New objects, no D1").
--
-- =====================================================================================
-- SS0 -- D1 WRITE-QUIESCE INVENTORY: **EMPTY**
-- =====================================================================================
-- This file replaces NO live body. Every function, table, view, trigger and policy below
-- is NEW. `pg_get_functiondef` on the frontier returns nothing for any name created here
-- (the tail re-proves that as a census, rather than this comment asserting it). There is
-- therefore no ceremony, no quiesce window and no prosrc-SHA prestate pin to take: a
-- prestate pin names the body you are about to replace, and this file replaces none.
--
-- =====================================================================================
-- WHAT THIS FILE DOES -- four additive limbs
-- =====================================================================================
-- (A) THE COMMON RECEIPT CONTRACT + THE ONE READ SURFACE (design SS3.4, decision D-6).
--     TA-P4 A extends receipts across F-A2/F-A4/F-A5/F-A6/F-A8 and F-A7 adds its own; one
--     physical table would make six items co-own one live body, against TA-P1's wake-sibling
--     rider. So: a written column CONTRACT, one bookkeeper+ read view
--     `clara.agent_receipts_visible`, and SEVEN per-item shim views it unions.
--
--     MEASURED FACT THAT SHAPES THIS (rig replay, frontier 0102, 2026-08-23): **ZERO of the
--     seven member receipt tables exist.** `entry_post_receipts` (F-A2) ·
--     `bank_agent_receipts` (F-A3) · `agent_act_receipts` (F-A4) · `report_agent_receipts`
--     (F-A5) · `web_fetch_receipts` (F-A8) · `agent_filing_receipts` (F-A7 train beta) are all
--     absent; `freeform_read_log` (F-A6) exists but pre-contract. A literal `union all` over
--     base tables is therefore unbuildable today, and a view that each arriving item re-cuts
--     would put six items back on one live body -- the very thing D-6 refuses.
--
--     THE MECHANISM. Each item owns ONE shim view. pi creates all seven as TYPED EMPTY STUBS
--     (`select null::<type> ... where false`), ungranted. When an item's receipt table lands,
--     that item's OWN migration runs exactly one statement --
--         create or replace view clara._agent_receipt_src_<item> as
--           select <its projection> from clara.<its receipt table>;
--     -- and then `select clara._assert_receipt_surface_conforms('_agent_receipt_src_<item>')`
--     in its tail. `clara.agent_receipts_visible` is created ONCE, here, and is never touched
--     again by anybody: the union reads the shims, so replacing a shim repoints the union with
--     no CoR of it. Order-independent; no merge-time coordination between member lanes.
--
--     WHY NOT A REGISTRY OF `projection_sql` TEXT REBUILT BY A FUNCTION (the shape first
--     ruled). Two independent reasons, both measured rather than argued. (1) A persisted
--     `clara.*` function containing `EXECUTE` is a hard red on `scripts/check-wiki-dynamic-sql.mjs`,
--     which `pnpm lint` runs on every PR: the probe returned
--     `runs dynamic SQL whose target cannot be statically proven non-wiki: EXECUTE 'create or
--     replace view clara.agent_receipts_visible as ' || v_sql`, with a positive control (the
--     same function minus the EXECUTE) returning zero findings. The gate's own text calls a
--     waiver "a CONTRACT change, not a lint fix". (2) A stored SQL string EXECUTEd inside a
--     SECURITY DEFINER function is an arbitrary-DDL door: one registry row installs a
--     `clara_fn_owner`-owned view over any table, past RLS. Ruling superseded 2026-08-23 by
--     the orchestrator on those two grounds; recorded here as the decision.
--
--     THE CONTRACT IS A PROJECTION CONTRACT, NOT A PHYSICAL-COLUMN ONE. The design names ten
--     column names (SS3.4). F-A2's table as designed carries `model_snapshot jsonb` and
--     `gate_verdicts jsonb` and none of `failing_rungs / trigger_kind / trigger_id /
--     authorization_id / adopted_verbatim` (`f-a2-annexes-3-record.md` E.1); F-A8's design
--     diverges the same way. Requiring the physical names would force two live redesigns for
--     no gain. Each member therefore keeps its own table exactly as designed and PROJECTS onto
--     the contract in its shim. **No in-flight F-A2 or F-A8 PR needs a change.**
--
--     THE CONTRACT IS 19 COLUMNS: the design's ten, plus eight identity/scope columns that a
--     firm-filtered read surface cannot exist without (`receipt_kind` the discriminator the
--     design itself names, `receipt_id`, `firm_id`, `client_id`, `subject_id`, `acting_actor`,
--     `on_behalf_of`, `occurred_at`), plus `scope` (R-L26). Registered as a DESIGN DELTA to
--     SS3.4's ten, not a ruling. `receipt_id` / `subject_id` / `trigger_id` are `text` because
--     member primary keys are `uuid` on some tables and `bigint` on others
--     (`freeform_read_log.id` is `bigint`, measured) -- `text` is the only common type, and the
--     member table, never this view, is the record of authority.
--
--     `scope` (R-L26, 2026-08-23) -- `firm` | `platform`, NON-NULLABLE, and APPENDED AT 19
--     rather than placed beside `firm_id` where it reads better. Two reasons, both mechanical.
--     (a) ORDINALS 1-18 WERE ALREADY BROADCAST to the six member lanes; `create or replace
--     view` permits only a TRAILING append, so inserting mid-list would break every shim an
--     earlier train position had installed, repairable only by a `drop view` that the union
--     forbids. (b) NON-NULLABLE because a three-valued column in a VISIBILITY predicate is
--     exactly how a row becomes visible to everyone by accident. A lane still holding the
--     18-column form is refused loudly on ARITY, never silently admitted.
--
--     WHY R-L26 NEEDED THE PREDICATE TO MOVE, NOT JUST THE COLUMN (L19's measurement,
--     reproduced here): under a bare `firm_id = clara.jwt_firm()` a row with `firm_id IS NULL`
--     evaluates to NULL, which `is not true`, so it is hidden from EVERY firm -- strictly worse
--     than the mapping R-L26 rejected, because that at least showed the receipt to one firm.
--     The scope floor in SS2.4 is what makes the platform arm exist at all.
--
--     WHAT THE WALL IS, AND WHERE IT IS NOT A WALL. `create or replace view` REFUSES a rename,
--     a retype, a drop and a reorder, so a non-conforming projection is UNINSTALLABLE rather
--     than merely reported -- Postgres is the enforcer, not a checker anyone can skip. It does
--     NOT refuse an EXTRA TRAILING column, and the union reads only the columns it named at
--     creation, so a trailing column would install unseen. That hole is closed by ARITY:
--     `_assert_receipt_surface_conforms` compares the column COUNT against
--     `clara.agent_receipt_contract` before it compares names, and the battery carries the
--     refusal cell. The contract lives in a table precisely so that comparison is
--     differential, never self-referential.
--
--     NULLABILITY IS DOCUMENTED, NOT ENFORCED, and this file says so rather than implying
--     otherwise: a view column carries no NOT NULL, so `agent_receipt_contract.nullable`
--     records the contract for the reader and for the member's own CHECK to honour. The
--     structural half of the wall is name + type + arity.
--
--     KNOWN, REGISTERED COST: an EIGHTH receipt-bearing item beyond TA-P4 A's seven needs one
--     CoR of `agent_receipts_visible`. The census cell fails loudly if an unregistered item
--     appears, so the cost is visible rather than silent.
--
-- (B) THE FIRM-SCOPED UNATTRIBUTED-DOCUMENT QUESTION CARRIER (design SS3.3 rider 4, D-11).
--     `clara.firm_open_questions` -- a NEW relation with **no `client_id` column at all**,
--     because a client-bound question belongs in `open_questions` and making that table's
--     `client_id` nullable breaks its FK, its scope CHECK and nine live consumers (survey
--     finding 5). Plus its ungranted core and its two human verbs.
--
-- (C) THE NAME-FAMILY COLLISION PREDICATE, AS A PURE FUNCTION (design SS3.3 rider 2, D-4,
--     D-19). Deterministic, in the DB, never in the model; its domain is `clients` UNION the
--     firm's `counterparties`, because ADR-0074:185-188 names ROME PUBLIC ADVISORY a
--     COUNTERPARTY and a clients-only predicate cannot see the collision the ruling named.
--
-- (D) THE IDENTIFIER PROMOTION CARD (TA-P8 B, design SS1). Clara PROPOSES; one human click
--     writes the key through `clara.add_client_identifier`, whose body is UNCHANGED. The card
--     writes no identifier, ever.
--
-- =====================================================================================
-- WHAT THIS FILE DELIBERATELY DOES **NOT** DO -- and the measured reason for each
-- =====================================================================================
-- 1. NO `wake_*` WRAPPER. Annex A.1 gives the four pi wrappers the floor `clara_wake_filing`.
--    **That role does not exist.** The live role set is exactly `clara_authenticated ·
--    clara_agent_ro · clara_wake_interactive · clara_wake_proactive · clara_runtime ·
--    clara_fn_owner` (+ three LOGIN roles) -- `pg_roles` census on the frontier, and the
--    string `clara_wake_filing` appears in no `.sql` in this repo. It resolves to "the wake
--    write role, gated to the `filing` KIND by `assert_wake_allowed`", and the `filing` kind
--    plus its seven `wake_fn_allowlist` rows are TRAIN BETA's (annexes-1 SS A.3). A wrapper
--    shipped now would be reachable by no principal: a dead body, and the reachability census
--    idiom exists to keep those out. `wake_open_firm_question`, `wake_reattribute_document`,
--    `wake_propose_filing_correction` and `wake_propose_identifier_promotion` therefore ride
--    beta, where each costs one allowlist row and one grant over the cores installed here.
--    Orchestrator ruling 2026-08-23; conductor verified the role's absence independently.
-- 2. NO CORRECTION SIBLING. On top of (1) they need `_file_document_write` (train alpha1) to
--    re-file at all and the extended `client_resolutions.method` / `document_filings.basis`
--    CHECKs (train alpha2); the design already states the posted arm "does not work at all
--    until train alpha2 extends that body". Both siblings ride beta.
-- 3. NO `egress.misrouted` EVENT TYPE. It exists for the correction siblings; registering it
--    now would touch `event_types` + `trigger_taxonomy` + `taxonomy_active` -- a shared
--    surface -- for a consumer that does not arrive until beta. It rides beta with them.
--    For the same reason the core in (B) writes `clara._audit` and does NOT `_append_event`:
--    no new event type is minted by this file.
-- 4. `resolve_firm_question` CARRIES NO `p_file` ARM. Annex A.1 sketches
--    `(..., p_client uuid default null, p_file boolean default false, p_op_key)`, which is not
--    a legal Postgres signature (a defaulted parameter may not precede a non-defaulted one),
--    and its filing arm is `confirm_attribution_candidate(p_candidate, p_op_key,
--    p_file_document)` -- measured live signature -- which takes an attribution CANDIDATE, not
--    a (question, client) pair. Wiring that needs beta's verdict path. pi ships the verb whole
--    without the arm rather than a half-verb that refuses one of its own parameters; beta adds
--    the arm. Divergence recorded, not silently absorbed.
-- 5. NO CHANGE TO `clara.add_client_identifier`, to `0062`/`0063`, or to any name-only wall.
--
-- =====================================================================================
-- SS1 -- PRESTATE. Fail-closed; an absent premise aborts the apply, loudly.
-- =====================================================================================
do $$
declare v_missing text;
begin
  -- (a) Nothing this file creates may already exist. A silent collision would mean a
  --     half-applied predecessor, not an idempotent re-run.
  select string_agg(t.n, ', ' order by t.n) into v_missing
    from (values ('agent_receipt_contract'),('agent_receipt_surfaces'),
                 ('agent_receipts_visible'),('firm_open_questions'),
                 ('client_identifier_promotions'),
                 ('_agent_receipt_src_f_a2'),('_agent_receipt_src_f_a3'),
                 ('_agent_receipt_src_f_a4'),('_agent_receipt_src_f_a5'),
                 ('_agent_receipt_src_f_a6'),('_agent_receipt_src_f_a7'),
                 ('_agent_receipt_src_f_a8'),('_agent_receipts_all')) t(n)
   where to_regclass('clara.'||t.n) is not null;
  if v_missing is not null then
    raise exception 'F-A7 pi prestate: relation(s) already present: %', v_missing
      using errcode = 'CLR10';
  end if;

  -- (b) The premises this file builds on must be LIVE, each named individually so the
  --     failure says which one is missing rather than that "something" is.
  select string_agg(t.n, ', ' order by t.n) into v_missing
    from (values ('clara.jwt_firm()'),('clara.actor_role_rank()'),('clara.role_rank(text)'),
                 ('clara._human_ctx(integer)'),('clara._reserve_op(uuid,text,text,bytea)'),
                 ('clara._finish_op(uuid,text,text,jsonb)'),('clara._hash(jsonb)'),
                 ('clara._audit(uuid,uuid,uuid,text,text,uuid,jsonb)'),
                 ('clara.add_client_identifier(uuid,text,text,text)'),
                 ('clara._tf_append_only()'),('clara._tf_no_truncate()')) t(n)
   where to_regprocedure(t.n) is null;
  if v_missing is not null then
    raise exception 'F-A7 pi prestate: required live function(s) absent: %', v_missing
      using errcode = 'CLR10';
  end if;

  -- (c) The read-surface idiom this file copies must still be the estate's idiom: the four
  --     `*_visible` siblings, each a VIEW owned by clara_fn_owner with ACL exactly
  --     `clara_authenticated=r`. Copying a pattern that has moved is how a surface drifts.
  select string_agg(c.relname, ', ' order by c.relname) into v_missing
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'clara'
     and c.relname in ('agent_tasks_visible','coding_tasks_visible',
                       'document_intakes_visible','document_processing_tasks_visible')
     and (c.relkind <> 'v'
          or pg_get_userbyid(c.relowner) <> 'clara_fn_owner'
          or not has_table_privilege('clara_authenticated', c.oid, 'select'));
  if v_missing is not null then
    raise exception 'F-A7 pi prestate: the *_visible read-surface idiom has moved on: %', v_missing
      using errcode = 'CLR10';
  end if;
  if (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname='clara' and c.relkind='v'
         and c.relname in ('agent_tasks_visible','coding_tasks_visible',
                           'document_intakes_visible','document_processing_tasks_visible')) <> 4 then
    raise exception 'F-A7 pi prestate: expected the four *_visible siblings; the idiom census is short'
      using errcode = 'CLR10';
  end if;

  -- (d) `client_identifiers.kind` is a closed world the promotion card must mirror EXACTLY.
  --     Re-derived from the live CHECK, never copied from a design table.
  if (select pg_get_constraintdef(oid) from pg_constraint
       where conrelid = 'clara.client_identifiers'::regclass
         and conname = 'client_identifiers_kind_check')
     is distinct from
     'CHECK ((kind = ANY (ARRAY[''tin''::text, ''ssm''::text, ''bank_account''::text])))' then
    raise exception 'F-A7 pi prestate: client_identifiers.kind is not the three-value world the promotion card mirrors (live: %)',
      coalesce((select pg_get_constraintdef(oid) from pg_constraint
                 where conrelid = 'clara.client_identifiers'::regclass
                   and conname = 'client_identifiers_kind_check'), '(no such constraint)')
      using errcode = 'CLR10';
  end if;

  raise notice 'F-A7 pi prestate: clean -- 13 new relations absent, 11 premises live, the four *_visible siblings hold the idiom, client_identifiers.kind is the three-value world';
end $$;

set role clara_fn_owner;

-- =====================================================================================
-- SS2 -- (A) THE COMMON RECEIPT CONTRACT AND THE ONE READ SURFACE
-- =====================================================================================

-- SS2.1 The written contract. A TABLE, not a comment and not a constant inside the checker,
-- so every conformance comparison is DIFFERENTIAL against something authored outside the
-- thing being checked. Append-only and extend-only: a contract a later migration can DELETE
-- from is not a contract.
create table clara.agent_receipt_contract (
  ordinal     int         primary key check (ordinal >= 1),
  column_name text        not null unique check (column_name ~ '^[a-z][a-z0-9_]*$'),
  data_type   text        not null check (btrim(data_type) <> ''),
  nullable    boolean     not null,
  semantics   text        not null check (btrim(semantics) <> ''),
  added_at    timestamptz not null default now()
);
comment on table clara.agent_receipt_contract is
  'TA-P4 A / F-A7 D-6: the common agent-receipt READ contract. data_type is written exactly as '
  'pg_catalog.format_type() renders it, so conformance is a literal comparison. `nullable` is '
  'DOCUMENTATION -- a view column carries no NOT NULL; the member table''s own CHECK owns it.';

insert into clara.agent_receipt_contract(ordinal, column_name, data_type, nullable, semantics) values
  ( 1,'receipt_kind',    'text',                       false,'the discriminator; equals clara.agent_receipt_surfaces.receipt_kind for the owning item'),
  ( 2,'receipt_id',      'text',                       false,'the member row''s own primary key rendered as text (member PKs are uuid on some tables, bigint on others)'),
  ( 3,'firm_id',         'uuid',                       true ,'tenant scope; agent_receipts_visible filters on it. NULL exactly when scope=''platform'' -- a platform act (F-A8 Tier-1 official-source feeds) belongs to no firm; every firm-scoped act carries it'),
  ( 4,'client_id',       'uuid',                       true ,'NULL where the act is structurally client-less (pre-attribution filing, a firm-narrow read)'),
  ( 5,'subject_id',      'text',                       true ,'the thing acted on -- entry / document / filing / report -- as text, for the reason receipt_id is'),
  ( 6,'acting_actor',    'uuid',                       false,'who acted; clara.agent_user_id() on an agent lane'),
  ( 7,'on_behalf_of',    'uuid',                       true ,'NULL BY CONSTRUCTION on a director-less unattended lane; never false-by-inference'),
  ( 8,'occurred_at',     'timestamp with time zone',   false,'when the act was receipted'),
  ( 9,'model',           'text',                       true ,'the model name; NULL where the act made no model call'),
  (10,'model_version',   'text',                       true ,'the model version'),
  (11,'rationale',       'text',                       true ,'the agent''s stated reasoning for the act'),
  (12,'verdict',         'jsonb',                      true ,'what the DB saw: the candidate set, the citations, and the model''s own stated confidence AS AN ANNOTATION ONLY'),
  (13,'failing_rungs',   'text[]',                     true ,'the full failing-rung vector; empty means every rung passed'),
  (14,'via_wake_kind',   'text',                       true ,'the wake kind the act rode; NULL on a chat-turn-triggered act'),
  (15,'trigger_kind',    'text',                       true ,'wake_task | chat_turn -- mechanically bound, never model-supplied (TA-P4 A(2))'),
  (16,'trigger_id',      'text',                       true ,'the triggering task or turn'),
  (17,'authorization_id','uuid',                       true ,'the egress authorization the act consumed'),
  (18,'adopted_verbatim','boolean',                    true ,'true only where the persisted value equals the agent''s proposal byte-for-byte'),
  (19,'scope',           'text',                       false,'firm | platform. platform <=> firm_id IS NULL: an act on a PLATFORM fact (F-A8 Tier-1 official-source feeds) belongs to no firm and its receipt is visible to every firm''s bookkeeper+. APPENDED at 19 rather than placed beside firm_id so that ordinals 1-18, already broadcast to the member lanes, did not shift under them; a lane still holding the 18-column form is refused loudly on arity, never silently admitted');

-- SS2.2 The member registry. The CLOSED WORLD of receipt-bearing items (TA-P4 A's five, plus
-- F-A3's bank lane and F-A7 itself). `expected_source` is ADVISORY -- the item names its own
-- table -- and the census reports the ACTUAL sources derived from pg_depend beside it, so a
-- divergence is visible instead of being a claim nobody re-reads.
create table clara.agent_receipt_surfaces (
  item            text        primary key check (item ~ '^f_a[0-9]+$'),
  receipt_kind    text        not null unique check (receipt_kind ~ '^[a-z][a-z0-9_]*$'),
  shim_relname    text        not null unique check (shim_relname ~ '^_agent_receipt_src_f_a[0-9]+$'),
  expected_source text        not null check (expected_source ~ '^[a-z][a-z0-9_]*$'),
  registered_at   timestamptz not null default now()
);
comment on table clara.agent_receipt_surfaces is
  'F-A7 D-6: one row per receipt-bearing Wave-F item. Each item owns its shim view and nothing '
  'else; clara.agent_receipts_visible unions the shims and is never re-cut by a member.';

insert into clara.agent_receipt_surfaces(item, receipt_kind, shim_relname, expected_source) values
  ('f_a2','entry_post',    '_agent_receipt_src_f_a2','entry_post_receipts'),
  ('f_a3','bank_agent',    '_agent_receipt_src_f_a3','bank_agent_receipts'),
  ('f_a4','agent_act',     '_agent_receipt_src_f_a4','agent_act_receipts'),
  ('f_a5','report_agent',  '_agent_receipt_src_f_a5','report_agent_receipts'),
  ('f_a6','freeform_read', '_agent_receipt_src_f_a6','freeform_read_log'),
  ('f_a7','agent_filing',  '_agent_receipt_src_f_a7','agent_filing_receipts'),
  ('f_a8','web_fetch',     '_agent_receipt_src_f_a8','web_fetch_receipts');

-- SS2.3 The seven shims, as TYPED EMPTY STUBS. Ungranted: no role holds SELECT, so the only
-- entrance to receipt data is `agent_receipts_visible` and its two floors. A member replaces
-- ONLY its own line here, with `create or replace view`.
-- Each stub is written out in full and depends on NOTHING. Defining six of them as
-- `select * from <the first> where false` was the first draft and the tail refused it: it
-- makes six shims depend on a seventh (pg_depend says so), which both couples six items to
-- one item's view and makes the `wired` census read `true` before any receipt table exists.
-- Verbosity here buys seven genuinely independent surfaces.
create view clara._agent_receipt_src_f_a2 as select
  null::text as receipt_kind, null::text as receipt_id, null::uuid as firm_id,
  null::uuid as client_id, null::text as subject_id, null::uuid as acting_actor,
  null::uuid as on_behalf_of, null::timestamptz as occurred_at, null::text as model,
  null::text as model_version, null::text as rationale, null::jsonb as verdict,
  null::text[] as failing_rungs, null::text as via_wake_kind, null::text as trigger_kind,
  null::text as trigger_id, null::uuid as authorization_id, null::boolean as adopted_verbatim,
  null::text as scope
  where false;
create view clara._agent_receipt_src_f_a3 as select
  null::text as receipt_kind, null::text as receipt_id, null::uuid as firm_id,
  null::uuid as client_id, null::text as subject_id, null::uuid as acting_actor,
  null::uuid as on_behalf_of, null::timestamptz as occurred_at, null::text as model,
  null::text as model_version, null::text as rationale, null::jsonb as verdict,
  null::text[] as failing_rungs, null::text as via_wake_kind, null::text as trigger_kind,
  null::text as trigger_id, null::uuid as authorization_id, null::boolean as adopted_verbatim,
  null::text as scope
  where false;
create view clara._agent_receipt_src_f_a4 as select
  null::text as receipt_kind, null::text as receipt_id, null::uuid as firm_id,
  null::uuid as client_id, null::text as subject_id, null::uuid as acting_actor,
  null::uuid as on_behalf_of, null::timestamptz as occurred_at, null::text as model,
  null::text as model_version, null::text as rationale, null::jsonb as verdict,
  null::text[] as failing_rungs, null::text as via_wake_kind, null::text as trigger_kind,
  null::text as trigger_id, null::uuid as authorization_id, null::boolean as adopted_verbatim,
  null::text as scope
  where false;
create view clara._agent_receipt_src_f_a5 as select
  null::text as receipt_kind, null::text as receipt_id, null::uuid as firm_id,
  null::uuid as client_id, null::text as subject_id, null::uuid as acting_actor,
  null::uuid as on_behalf_of, null::timestamptz as occurred_at, null::text as model,
  null::text as model_version, null::text as rationale, null::jsonb as verdict,
  null::text[] as failing_rungs, null::text as via_wake_kind, null::text as trigger_kind,
  null::text as trigger_id, null::uuid as authorization_id, null::boolean as adopted_verbatim,
  null::text as scope
  where false;
create view clara._agent_receipt_src_f_a6 as select
  null::text as receipt_kind, null::text as receipt_id, null::uuid as firm_id,
  null::uuid as client_id, null::text as subject_id, null::uuid as acting_actor,
  null::uuid as on_behalf_of, null::timestamptz as occurred_at, null::text as model,
  null::text as model_version, null::text as rationale, null::jsonb as verdict,
  null::text[] as failing_rungs, null::text as via_wake_kind, null::text as trigger_kind,
  null::text as trigger_id, null::uuid as authorization_id, null::boolean as adopted_verbatim,
  null::text as scope
  where false;
create view clara._agent_receipt_src_f_a7 as select
  null::text as receipt_kind, null::text as receipt_id, null::uuid as firm_id,
  null::uuid as client_id, null::text as subject_id, null::uuid as acting_actor,
  null::uuid as on_behalf_of, null::timestamptz as occurred_at, null::text as model,
  null::text as model_version, null::text as rationale, null::jsonb as verdict,
  null::text[] as failing_rungs, null::text as via_wake_kind, null::text as trigger_kind,
  null::text as trigger_id, null::uuid as authorization_id, null::boolean as adopted_verbatim,
  null::text as scope
  where false;
create view clara._agent_receipt_src_f_a8 as select
  null::text as receipt_kind, null::text as receipt_id, null::uuid as firm_id,
  null::uuid as client_id, null::text as subject_id, null::uuid as acting_actor,
  null::uuid as on_behalf_of, null::timestamptz as occurred_at, null::text as model,
  null::text as model_version, null::text as rationale, null::jsonb as verdict,
  null::text[] as failing_rungs, null::text as via_wake_kind, null::text as trigger_kind,
  null::text as trigger_id, null::uuid as authorization_id, null::boolean as adopted_verbatim,
  null::text as scope
  where false;

-- SS2.4 The ONE read surface. Created once; never re-cut by a member. Two floors, both in the
-- single entrance: SCOPE (below) and the bookkeeper+ role floor in the estate's own ARM-0-safe
-- form (`coalesce(..., -1)`, so a NULL principal ranks below viewer rather than comparing NULL
-- and admitting nothing-or-everything by accident).
--
-- THE SCOPE FLOOR IS TWO CLOSED ARMS, NOT `firm_id = jwt_firm() OR firm_id IS NULL` (R-L26,
-- 2026-08-23, implemented one notch tighter than ruled and the difference is the whole point).
-- The ruling admits platform-scoped receipts -- F-A8 Tier-1 official-source feeds belong to no
-- firm -- to every firm's bookkeeper+. Written as a bare OR, `firm_id IS NULL` would be a
-- CROSS-TENANT READ CHANNEL any member could open BY ACCIDENT: one firm-scoped row that forgot
-- its firm_id becomes visible to every firm in the estate, silently. Written as two arms each
-- REQUIRING its own scope value, the correspondence `platform <=> firm_id IS NULL` is enforced
-- in BOTH directions and every inconsistent row is invisible rather than over-visible:
--   * scope='firm'     with a NULL firm_id      -> matches neither arm -> nobody sees it;
--   * scope='platform' with a non-NULL firm_id  -> matches neither arm -> nobody sees it;
--   * any other scope value                     -> matches neither arm -> nobody sees it.
-- A member that gets this wrong loses its own rows and finds out; no member can leak another
-- firm's. That is the fail-CLOSED direction, and it is the reason the arms are not an OR
-- between two walls (a shape this estate has been bitten by before).
-- The RAW union, ungranted, defined once so the member list lives in exactly one place. It is
-- UNFILTERED by construction -- that is what makes the dark-row census (SS2.7) able to see rows
-- the read surface hides. Nothing but `agent_receipts_visible` and that census may read it.
create view clara._agent_receipts_all as
    select * from clara._agent_receipt_src_f_a2
    union all select * from clara._agent_receipt_src_f_a3
    union all select * from clara._agent_receipt_src_f_a4
    union all select * from clara._agent_receipt_src_f_a5
    union all select * from clara._agent_receipt_src_f_a6
    union all select * from clara._agent_receipt_src_f_a7
    union all select * from clara._agent_receipt_src_f_a8;

create view clara.agent_receipts_visible as
  select r.* from clara._agent_receipts_all r
  where ((r.scope = 'firm'     and r.firm_id = clara.jwt_firm())
      or (r.scope = 'platform' and r.firm_id is null))
    and coalesce(clara.actor_role_rank(), -1) >= clara.role_rank('bookkeeper');
comment on view clara.agent_receipts_visible is
  'TA-P4 A / F-A7 D-6: the one bookkeeper+ read surface over every agent act receipt. Unions '
  'the seven per-item shim views; a member wires its own shim and never touches this view.';

-- SS2.5 The conformance checker. Plain catalog SQL -- no EXECUTE, so it is invisible to the
-- dynamic-SQL gate by construction rather than by waiver. ARITY IS CHECKED FIRST, because
-- `create or replace view` permits an extra TRAILING column and the union would read past it
-- in silence; arity is the only thing that catches that case.
create function clara._assert_receipt_surface_conforms(p_shim text) returns void
  language plpgsql stable security definer set search_path = clara, pg_temp as $fn$
declare v_oid oid; v_kind "char"; v_expected int; v_actual int; v_bad text;
begin
  if nullif(btrim(coalesce(p_shim, '')), '') is null then
    raise exception 'a receipt surface name is required' using errcode = 'CLR10',
      detail = '{"reason":"invalid_request","class":"shim_relname","constraint":"nonempty"}';
  end if;
  if not exists (select 1 from clara.agent_receipt_surfaces s where s.shim_relname = p_shim) then
    raise exception 'receipt surface % is not registered in clara.agent_receipt_surfaces', p_shim
      using errcode = 'CLR10', detail = '{"reason":"receipt_surface_unregistered"}';
  end if;
  v_oid := to_regclass('clara.' || quote_ident(p_shim));
  if v_oid is null then
    raise exception 'receipt surface clara.% does not exist', p_shim
      using errcode = 'CLR10', detail = '{"reason":"receipt_surface_absent"}';
  end if;
  select c.relkind into v_kind from pg_class c where c.oid = v_oid;
  if v_kind <> 'v' then
    raise exception 'receipt surface clara.% is a %, not a view', p_shim, v_kind
      using errcode = 'CLR10', detail = '{"reason":"receipt_surface_not_a_view"}';
  end if;

  select count(*)::int into v_actual
    from pg_attribute a where a.attrelid = v_oid and a.attnum > 0 and not a.attisdropped;
  select count(*)::int into v_expected from clara.agent_receipt_contract;
  if v_actual <> v_expected then
    raise exception 'receipt surface clara.% carries % column(s); the contract has %', p_shim, v_actual, v_expected
      using errcode = 'CLR10', detail = '{"reason":"receipt_contract_arity"}';
  end if;

  select string_agg(
           format('#%s expected %s %s, found %s %s', k.ordinal, k.column_name, k.data_type,
                  coalesce(k.actual_name, '(absent)'), coalesce(k.actual_type, '(absent)')),
           '; ' order by k.ordinal)
    into v_bad
    from (select ct.ordinal, ct.column_name, ct.data_type,
                 a.attname as actual_name,
                 format_type(a.atttypid, a.atttypmod) as actual_type
            from clara.agent_receipt_contract ct
            left join pg_attribute a
              on a.attrelid = v_oid and a.attnum = ct.ordinal and not a.attisdropped
           where a.attname is distinct from ct.column_name
              or format_type(a.atttypid, a.atttypmod) is distinct from ct.data_type) k;
  if v_bad is not null then
    raise exception 'receipt surface clara.% does not conform to the contract: %', p_shim, v_bad
      using errcode = 'CLR10', detail = '{"reason":"receipt_contract_mismatch"}';
  end if;
end $fn$;
comment on function clara._assert_receipt_surface_conforms(text) is
  'F-A7 D-6: every member migration calls this in its tail after wiring its shim. Arity first '
  '-- create-or-replace-view permits an extra trailing column and nothing else would see it.';

-- SS2.6 The census. Reports, never raises: it is the instrument the battery and each member's
-- tail READ, and a rung's own evaluation may not raise out of the ladder. `wired` is derived
-- from pg_depend -- what the shim actually reaches -- never from `expected_source`, which is
-- a claim.
create function clara.agent_receipt_source_census()
  returns table (item text, receipt_kind text, shim_relname text, expected_source text,
                 shim_exists boolean, wired boolean, actual_sources text[],
                 column_count int, conforms boolean, dark_rows bigint)
  language sql stable security definer set search_path = clara, pg_temp as $fn$
  select s.item, s.receipt_kind, s.shim_relname, s.expected_source,
         o.oid is not null                              as shim_exists,
         coalesce(array_length(d.sources, 1), 0) > 0    as wired,
         coalesce(d.sources, '{}'::text[])              as actual_sources,
         coalesce(a.n, 0)                               as column_count,
         (o.oid is not null and coalesce(a.n, 0) = (select count(*)::int from clara.agent_receipt_contract)
           and not exists (
             select 1 from clara.agent_receipt_contract ct
               left join pg_attribute pa
                 on pa.attrelid = o.oid and pa.attnum = ct.ordinal and not pa.attisdropped
              where pa.attname is distinct from ct.column_name
                 or format_type(pa.atttypid, pa.atttypmod) is distinct from ct.data_type)) as conforms,
         coalesce(k.dark, 0)                            as dark_rows
    from clara.agent_receipt_surfaces s
    left join lateral (select to_regclass('clara.' || quote_ident(s.shim_relname))::oid as oid) o on true
    left join lateral (select count(*)::int as n from pg_attribute pa
                        where pa.attrelid = o.oid and pa.attnum > 0 and not pa.attisdropped) a on true
    left join lateral (
      select array_agg(distinct c2.relname order by c2.relname) as sources
        from pg_depend dep
        join pg_rewrite rw on rw.oid = dep.objid
        join pg_class c2 on c2.oid = dep.refobjid
        join pg_namespace n2 on n2.oid = c2.relnamespace
       where dep.classid = 'pg_rewrite'::regclass
         and dep.refclassid = 'pg_class'::regclass
         and rw.ev_class = o.oid
         and c2.oid <> o.oid
         and n2.nspname = 'clara') d on true
    -- R-L26 DARK ROWS, per shim: rows this member projects that match NEITHER arm of
    -- agent_receipts_visible's scope floor, and are therefore visible to NOBODY. Written
    -- `... is not true` and NOT `not (...)`: with a NULL scope the latter evaluates to NULL and
    -- the row would be excluded from the very census meant to find it.
    left join lateral (
      select count(*) as dark from clara._agent_receipts_all a
       where a.receipt_kind = s.receipt_kind
         and ((a.scope = 'firm'     and a.firm_id is not null)
           or (a.scope = 'platform' and a.firm_id is null)) is not true) k on true
   order by s.item;
$fn$;
comment on function clara.agent_receipt_source_census() is
  'F-A7 D-6: one row per registered receipt-bearing item. `wired` and `actual_sources` are '
  'derived from pg_depend (what the shim REACHES), never from expected_source (what it claims).';

-- SS2.7 THE DARK-ROW CENSUS. The one failure the contract checker CANNOT see.
--
-- A member that installs its shim from the pre-R-L26 eighteen-column form and adds
-- `null::text as scope` to satisfy arity projects `scope = NULL`. NULL matches NEITHER arm of
-- SS2.4's floor, so that member's receipts become invisible TO EVERYONE -- and nothing complains:
-- the DDL succeeds, `_assert_receipt_surface_conforms` passes (arity 19, types conform), and the
-- read simply returns nothing. The failure would surface only as a human noticing that a surface
-- which should have rows does not, which is not a mechanism. (Raised by the F-A8 lane, which is
-- itself immune -- its `scope` is a projection constant -- which is why it was worth raising.)
--
-- This function turns "invisible" into "reported". Its predicate is written `... is not true`
-- rather than `not (...)` DELIBERATELY: with a NULL `scope`, `not (...)` evaluates to NULL and
-- the row is EXCLUDED from its own census -- the three-valued trap that would make this
-- instrument silently blind to the exact defect it exists to find.
create function clara.agent_receipt_dark_rows()
  returns table (receipt_kind text, scope text, firm_id_is_null boolean, dark_rows bigint)
  language sql stable security definer set search_path = clara, pg_temp as $fn$
  select a.receipt_kind, a.scope, a.firm_id is null, count(*)
    from clara._agent_receipts_all a
   where ((a.scope = 'firm'     and a.firm_id is not null)
       or (a.scope = 'platform' and a.firm_id is null)) is not true
   group by 1, 2, 3
   order by 1, 2, 3;
$fn$;
comment on function clara.agent_receipt_dark_rows() is
  'F-A7 R-L26: every receipt row matching NEITHER arm of agent_receipts_visible''s scope floor -- '
  'a NULL scope, an unknown scope value, scope=firm with no firm_id, or scope=platform with one. '
  'Such rows are visible to nobody. Zero rows here means every member''s arm is lit.';

-- =====================================================================================
-- SS3 -- (B) THE FIRM-SCOPED UNATTRIBUTED-DOCUMENT QUESTION CARRIER
-- =====================================================================================
-- NO `client_id` COLUMN AT ALL (D-11). Not "nullable" -- absent. A client-bound question is
-- an `open_questions` row; a question that exists BECAUSE no client is known cannot carry one,
-- and a nullable column would let a caller put one there and quietly re-create the ambiguity.
create table clara.firm_open_questions (
  id              uuid        primary key default gen_random_uuid(),
  firm_id         uuid        not null references clara.firms(id),
  document_id     uuid        not null,
  kind            text        not null check (kind in ('unattributed','collision','contradiction',
                                                       'identity_document','correction_proposed',
                                                       'promotion_proposed')),
  question_text   text        not null check (btrim(question_text) <> '' and length(question_text) <= 4000),
  candidates      jsonb       not null default '[]'::jsonb check (jsonb_typeof(candidates) = 'array'),
  status          text        not null default 'open' check (status in ('open','resolved','dismissed')),
  opened_by       uuid        not null references clara.users(id),
  opened_at       timestamptz not null default now(),
  settled_by      uuid        references clara.users(id),
  settled_at      timestamptz,
  settlement_text text,
  named_client    uuid,
  receipt_id      text,
  unique (id, firm_id),
  constraint fk_firm_open_questions_document
    foreign key (document_id, firm_id) references clara.documents(id, firm_id),
  -- `named_client` is the client the HUMAN named when they answered. It is not the question's
  -- scope (there is none) and it exists only on a settled row.
  constraint fk_firm_open_questions_named_client
    foreign key (named_client, firm_id) references clara.clients(id, firm_id),
  constraint ck_firm_open_questions_settled check (
    (status = 'open'
       and settled_by is null and settled_at is null
       and settlement_text is null and named_client is null)
    or (status in ('resolved','dismissed')
       and settled_by is not null and settled_at is not null
       and nullif(btrim(settlement_text), '') is not null)),
  -- A dismissal names no client: dismissing is "this is not a question", not an attribution.
  constraint ck_firm_open_questions_dismissed_names_nobody check (
    status <> 'dismissed' or named_client is null)
);
comment on table clara.firm_open_questions is
  'F-A7 rider 4 / D-11: the FIRM-scoped question carrier for a document with no client yet. '
  'It deliberately has no client_id column -- survey finding 5.';
create index ix_firm_open_questions_open on clara.firm_open_questions(firm_id, opened_at desc)
  where status = 'open';
create index ix_firm_open_questions_document on clara.firm_open_questions(document_id);

-- The ungranted core. Train beta's `wake_open_firm_question` wrapper is the only agent-side
-- caller it will ever have; pi installs the core so beta adds a wrapper and an allowlist row
-- and nothing else.
create function clara._firm_question_core(
    p_actor uuid, p_firm uuid, p_obo uuid, p_wake_kind text,
    p_document uuid, p_kind text, p_question text, p_candidates jsonb, p_receipt text)
  returns uuid language plpgsql security definer set search_path = clara, pg_temp as $fn$
declare v_id uuid;
begin
  if p_actor is null or p_firm is null or p_document is null
     or nullif(btrim(coalesce(p_question, '')), '') is null
     or p_kind is null then
    raise exception 'firm question is malformed' using errcode = 'CLR10',
      detail = '{"reason":"invalid_request","class":"firm_question"}';
  end if;
  if p_candidates is not null and jsonb_typeof(p_candidates) <> 'array' then
    raise exception 'firm question candidates must be a json array' using errcode = 'CLR10',
      detail = '{"reason":"invalid_request","class":"candidates","constraint":"array"}';
  end if;
  -- Same-firm, and the document must exist. CLR11 rather than CLR10: a cross-firm document
  -- is an authority failure, not a malformed request.
  if not exists (select 1 from clara.documents d where d.id = p_document and d.firm_id = p_firm) then
    raise exception 'document not found in your firm' using errcode = 'CLR11',
      detail = '{"reason":"cross_firm","class":"document"}';
  end if;
  insert into clara.firm_open_questions(firm_id, document_id, kind, question_text,
      candidates, opened_by, receipt_id)
    values (p_firm, p_document, p_kind, btrim(p_question),
            coalesce(p_candidates, '[]'::jsonb), p_actor, nullif(btrim(coalesce(p_receipt,'')), ''))
    returning id into v_id;
  perform clara._audit(p_firm, p_actor, p_obo, p_wake_kind, 'open_firm_question', null,
    jsonb_build_object('question', v_id, 'document', p_document, 'kind', p_kind,
                       'candidate_count', jsonb_array_length(coalesce(p_candidates, '[]'::jsonb))));
  return v_id;
end $fn$;

create function clara.resolve_firm_question(
    p_question uuid, p_resolution text, p_client uuid, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $fn$
declare c record; v_dedupe jsonb; q record;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if nullif(btrim(coalesce(p_op_key, '')), '') is null then
    raise exception 'op_key is required' using errcode = 'CLR10',
      detail = '{"reason":"invalid_request","class":"op_key","constraint":"nonempty"}';
  end if;
  if p_question is null or nullif(btrim(coalesce(p_resolution, '')), '') is null then
    raise exception 'a firm question resolution is required' using errcode = 'CLR10',
      detail = '{"reason":"invalid_request","class":"resolution","constraint":"nonempty"}';
  end if;
  v_dedupe := clara._reserve_op(c.firm, 'resolve_firm_question', p_op_key,
    clara._hash(jsonb_build_object('question', p_question, 'resolution', p_resolution,
                                   'client', p_client)));
  if v_dedupe is not null then return v_dedupe; end if;
  select * into q from clara.firm_open_questions where id = p_question for update;
  if not found or q.firm_id <> c.firm then
    raise exception 'firm question not found' using errcode = 'CLR11',
      detail = '{"reason":"cross_firm","class":"firm_question"}';
  end if;
  if q.status <> 'open' then
    raise exception 'firm question is not open' using errcode = 'CLR10',
      detail = '{"reason":"already_settled","class":"firm_question"}';
  end if;
  if p_client is not null
     and not exists (select 1 from clara.clients cl where cl.id = p_client and cl.firm_id = c.firm) then
    raise exception 'client not in your firm' using errcode = 'CLR11',
      detail = '{"reason":"cross_firm","class":"client"}';
  end if;
  update clara.firm_open_questions
     set status = 'resolved', settled_by = c.actor, settled_at = now(),
         settlement_text = btrim(p_resolution), named_client = p_client
   where id = p_question;
  perform clara._audit(c.firm, c.actor, null, null, 'resolve_firm_question', null,
    jsonb_build_object('question', p_question, 'named_client', p_client, 'op_key', p_op_key));
  return clara._finish_op(c.firm, 'resolve_firm_question', p_op_key,
    jsonb_build_object('question_id', p_question, 'status', 'resolved', 'named_client', p_client));
end $fn$;

create function clara.dismiss_firm_question(p_question uuid, p_reason text, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $fn$
declare c record; v_dedupe jsonb; q record;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if nullif(btrim(coalesce(p_op_key, '')), '') is null then
    raise exception 'op_key is required' using errcode = 'CLR10',
      detail = '{"reason":"invalid_request","class":"op_key","constraint":"nonempty"}';
  end if;
  if p_question is null or nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'a dismissal reason is required' using errcode = 'CLR10',
      detail = '{"reason":"invalid_request","class":"reason","constraint":"nonempty"}';
  end if;
  v_dedupe := clara._reserve_op(c.firm, 'dismiss_firm_question', p_op_key,
    clara._hash(jsonb_build_object('question', p_question, 'reason', p_reason)));
  if v_dedupe is not null then return v_dedupe; end if;
  select * into q from clara.firm_open_questions where id = p_question for update;
  if not found or q.firm_id <> c.firm then
    raise exception 'firm question not found' using errcode = 'CLR11',
      detail = '{"reason":"cross_firm","class":"firm_question"}';
  end if;
  if q.status <> 'open' then
    raise exception 'firm question is not open' using errcode = 'CLR10',
      detail = '{"reason":"already_settled","class":"firm_question"}';
  end if;
  update clara.firm_open_questions
     set status = 'dismissed', settled_by = c.actor, settled_at = now(),
         settlement_text = btrim(p_reason)
   where id = p_question;
  perform clara._audit(c.firm, c.actor, null, null, 'dismiss_firm_question', null,
    jsonb_build_object('question', p_question, 'op_key', p_op_key));
  return clara._finish_op(c.firm, 'dismiss_firm_question', p_op_key,
    jsonb_build_object('question_id', p_question, 'status', 'dismissed'));
end $fn$;

-- =====================================================================================
-- SS4 -- (C) THE NAME-FAMILY COLLISION PREDICATE, AS A PURE FUNCTION
-- =====================================================================================
-- NORMALISATION DIVERGES FROM `name_normalized`, DELIBERATELY, and here is why. The estate's
-- expression is `lower(regexp_replace(name, '[^a-zA-Z0-9]', '', 'g'))` (`create_counterparty`,
-- live body) -- it strips SPACES too, so 'ROME PROPERTIES' becomes 'romeproperties' and the
-- leading token is gone. That expression exists for exact-match dedupe on a unique index,
-- which is a different job. A leading-token predicate needs boundary-PRESERVING
-- normalisation, so this function collapses every non-alphanumeric RUN to one space and takes
-- the first token. The design's "strip non-alphanumerics ... then take the leading token set"
-- cannot be read both ways at once; this is the reading that produces tokens.
create function clara.name_family_token(p_name text) returns text
  language sql immutable as $fn$
  select nullif(
           split_part(
             btrim(regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]+', ' ', 'g')),
             ' ', 1),
           '')
$fn$;
comment on function clara.name_family_token(text) is
  'F-A7 D-4: the leading token of a party name under boundary-preserving normalisation. NULL '
  'for a name with no alphanumeric content -- a NULL token matches nothing, so an unnameable '
  'party can never join a family.';

-- The candidate set. `clients` UNION the firm''s `counterparties` (D-19), because ADR-0074
-- names ROME PUBLIC ADVISORY a COUNTERPARTY: a clients-only predicate cannot see the very
-- collision the ruling used as its worked example.
-- SECURITY INVOKER (the default), deliberately -- not the definer semantics every other core in
-- this file carries. p_firm is CALLER-SUPPLIED, and a SECURITY DEFINER function with a caller-
-- supplied tenant parameter is the exact cross-tenant-oracle shape 0002:453-458 records the
-- estate paying for once: reached under the owner's privilege, its own `cl.firm_id = p_firm` /
-- `cp.firm_id = p_firm` predicates are the ONLY thing standing between a caller and another
-- firm's rows, because SECURITY DEFINER bypasses ambient RLS. Both `clara.clients` and
-- `clara.counterparties` carry their own forced-RLS `firm_id = clara.jwt_firm()` policies, so at
-- the default (invoker) semantics a future accidental direct grant runs under the CALLER's own
-- RLS on top of this function's predicates, not past it -- belt AND suspenders instead of a
-- single elevated belt. The function is reachable today only from the two SECURITY DEFINER cores
-- (`_firm_question_core`, `_identifier_promotion_core` via `name_family_is_ambiguous`), which
-- already run as clara_fn_owner: a definer caller's internal call to an invoker callee still
-- executes as the definer's effective role, so nothing here changes today's behaviour -- REVOKE
-- ALL FROM PUBLIC below is still the primary wall, this is defence-in-depth under it.
create function clara.name_family_candidates(p_firm uuid, p_name text)
  returns table (party_kind text, party_id uuid, party_name text, bound_client uuid)
  language sql stable set search_path = clara, pg_temp as $fn$
  with tok as (select clara.name_family_token(p_name) as t)
  select 'client'::text, cl.id, cl.name, cl.id
    from clara.clients cl, tok
   where p_firm is not null and tok.t is not null
     and cl.firm_id = p_firm
     and clara.name_family_token(cl.name) = tok.t
  union all
  select 'counterparty'::text, cp.id, cp.name, cp.client_id
    from clara.counterparties cp, tok
   where p_firm is not null and tok.t is not null
     and cp.firm_id = p_firm
     and cp.retired_at is null
     and cp.merged_into is null
     and clara.name_family_token(cp.name) = tok.t
  order by 1, 3, 2
$fn$;
comment on function clara.name_family_candidates(uuid, text) is
  'F-A7 D-4/D-19: every party in the firm sharing p_name''s leading token, over clients UNION '
  'the firm''s live counterparties. More than one row means CLARIFY -- the caller never picks.';

-- The wall''s own shape, so no caller re-derives ">1 means clarify" and gets it subtly wrong.
-- SECURITY INVOKER too, same reasoning as name_family_candidates above (this function's only
-- work is calling that one and comparing a count -- no direct table read of its own to guard).
create function clara.name_family_is_ambiguous(p_firm uuid, p_name text) returns boolean
  language sql stable set search_path = clara, pg_temp as $fn$
  select (select count(*) from clara.name_family_candidates(p_firm, p_name)) > 1
$fn$;
comment on function clara.name_family_is_ambiguous(uuid, text) is
  'F-A7 B2: true when the family predicate returns more than one party. Fail-closed reading: a '
  'name with no alphanumeric content returns zero candidates and is NOT ambiguous -- it has no '
  'basis at all, which B3 refuses on its own rung rather than this one.';

-- =====================================================================================
-- SS5 -- (D) THE IDENTIFIER PROMOTION CARD
-- =====================================================================================
-- The card writes NO identifier, ever (B9 / law 59). `confirm_identifier_promotion` is the
-- only path from a card to a key and it goes through `clara.add_client_identifier`, whose
-- body is UNCHANGED by this file.
create table clara.client_identifier_promotions (
  id               uuid        primary key default gen_random_uuid(),
  firm_id          uuid        not null,
  client_id        uuid        not null,
  kind             text        not null check (kind in ('tin','ssm','bank_account')),
  value_normalized text        not null check (btrim(value_normalized) <> ''),
  sightings        int         not null check (sightings >= 1),
  citations        jsonb       not null check (jsonb_typeof(citations) = 'array'
                                               and jsonb_array_length(citations) >= 1),
  rationale        text        not null check (btrim(rationale) <> '' and length(rationale) <= 4000),
  model            jsonb       not null check (jsonb_typeof(model) = 'object'
                                 and btrim(coalesce(model->>'provider', '')) <> ''
                                 and btrim(coalesce(model->>'model', '')) <> ''
                                 and btrim(coalesce(model->>'version', '')) <> ''),
  status           text        not null default 'proposed'
                                 check (status in ('proposed','confirmed','declined')),
  proposed_by      uuid        not null references clara.users(id),
  proposed_at      timestamptz not null default now(),
  settled_by       uuid        references clara.users(id),
  settled_at       timestamptz,
  identifier_id    uuid,
  unique (id, firm_id),
  constraint fk_client_identifier_promotions_client
    foreign key (client_id, firm_id) references clara.clients(id, firm_id),
  constraint ck_client_identifier_promotions_settled check (
    (status = 'proposed' and settled_by is null and settled_at is null and identifier_id is null)
    or (status = 'confirmed' and settled_by is not null and settled_at is not null
        and identifier_id is not null)
    or (status = 'declined' and settled_by is not null and settled_at is not null
        and identifier_id is null))
);
comment on table clara.client_identifier_promotions is
  'TA-P8 B: Clara PROPOSES an identifier as a typed card; one human click writes the key '
  'through the audited door. A card is not a key -- nothing reads this table as an identifier.';
create index ix_client_identifier_promotions_open
  on clara.client_identifier_promotions(firm_id, proposed_at desc) where status = 'proposed';

create function clara._identifier_promotion_core(
    p_actor uuid, p_firm uuid, p_obo uuid, p_wake_kind text,
    p_client uuid, p_kind text, p_value text, p_sightings int,
    p_citations jsonb, p_rationale text, p_model jsonb)
  returns uuid language plpgsql security definer set search_path = clara, pg_temp as $fn$
declare v_id uuid; v_value text;
begin
  if p_actor is null or p_firm is null or p_client is null or p_kind is null then
    raise exception 'identifier promotion is malformed' using errcode = 'CLR10',
      detail = '{"reason":"invalid_request","class":"promotion"}';
  end if;
  -- Byte-identical to `add_client_identifier`'s own normalisation (its live body, DC-1):
  -- a card whose value normalises differently from the key it would write is a card that
  -- promises something the door will not deliver.
  v_value := lower(regexp_replace(coalesce(p_value, ''), '\s+', '', 'g'));
  if nullif(btrim(v_value), '') is null then
    raise exception 'an identifier promotion needs a value' using errcode = 'CLR10',
      detail = '{"reason":"invalid_request","class":"value","constraint":"nonempty"}';
  end if;
  if not exists (select 1 from clara.clients cl where cl.id = p_client and cl.firm_id = p_firm) then
    raise exception 'client not in your firm' using errcode = 'CLR11',
      detail = '{"reason":"cross_firm","class":"client"}';
  end if;
  insert into clara.client_identifier_promotions(firm_id, client_id, kind, value_normalized,
      sightings, citations, rationale, model, proposed_by)
    values (p_firm, p_client, p_kind, v_value, p_sightings, p_citations, p_rationale, p_model, p_actor)
    returning id into v_id;
  perform clara._audit(p_firm, p_actor, p_obo, p_wake_kind, 'propose_identifier_promotion', null,
    jsonb_build_object('promotion', v_id, 'client', p_client, 'kind', p_kind,
                       'sightings', p_sightings));
  return v_id;
end $fn$;

create function clara.confirm_identifier_promotion(p_proposal uuid, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $fn$
declare c record; v_dedupe jsonb; p record; v_inner jsonb; v_identifier uuid;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if nullif(btrim(coalesce(p_op_key, '')), '') is null then
    raise exception 'op_key is required' using errcode = 'CLR10',
      detail = '{"reason":"invalid_request","class":"op_key","constraint":"nonempty"}';
  end if;
  v_dedupe := clara._reserve_op(c.firm, 'confirm_identifier_promotion', p_op_key,
    clara._hash(jsonb_build_object('proposal', p_proposal)));
  if v_dedupe is not null then return v_dedupe; end if;
  select * into p from clara.client_identifier_promotions where id = p_proposal for update;
  if not found or p.firm_id <> c.firm then
    raise exception 'identifier promotion not found' using errcode = 'CLR11',
      detail = '{"reason":"cross_firm","class":"promotion"}';
  end if;
  if p.status <> 'proposed' then
    raise exception 'identifier promotion is not open' using errcode = 'CLR10',
      detail = '{"reason":"already_settled","class":"promotion"}';
  end if;
  -- The inner key is DERIVED, never minted (0078's rule): a replayed step must reuse the
  -- inner reservation instead of writing a second identifier.
  v_inner := clara.add_client_identifier(p.client_id, p.kind, p.value_normalized,
                                         p_op_key || ':add_client_identifier');
  v_identifier := nullif(v_inner->>'identifier_id', '')::uuid;
  if v_identifier is null then
    raise exception 'the identifier door returned no identifier' using errcode = 'CLR10',
      detail = '{"reason":"promotion_not_confirmed","class":"identifier"}';
  end if;
  update clara.client_identifier_promotions
     set status = 'confirmed', settled_by = c.actor, settled_at = now(), identifier_id = v_identifier
   where id = p_proposal;
  perform clara._audit(c.firm, c.actor, null, null, 'confirm_identifier_promotion', null,
    jsonb_build_object('promotion', p_proposal, 'identifier', v_identifier, 'op_key', p_op_key));
  return clara._finish_op(c.firm, 'confirm_identifier_promotion', p_op_key,
    jsonb_build_object('promotion_id', p_proposal, 'status', 'confirmed',
                       'identifier_id', v_identifier));
end $fn$;

create function clara.decline_identifier_promotion(p_proposal uuid, p_reason text, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $fn$
declare c record; v_dedupe jsonb; p record;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if nullif(btrim(coalesce(p_op_key, '')), '') is null then
    raise exception 'op_key is required' using errcode = 'CLR10',
      detail = '{"reason":"invalid_request","class":"op_key","constraint":"nonempty"}';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'a decline reason is required' using errcode = 'CLR10',
      detail = '{"reason":"invalid_request","class":"reason","constraint":"nonempty"}';
  end if;
  v_dedupe := clara._reserve_op(c.firm, 'decline_identifier_promotion', p_op_key,
    clara._hash(jsonb_build_object('proposal', p_proposal, 'reason', p_reason)));
  if v_dedupe is not null then return v_dedupe; end if;
  select * into p from clara.client_identifier_promotions where id = p_proposal for update;
  if not found or p.firm_id <> c.firm then
    raise exception 'identifier promotion not found' using errcode = 'CLR11',
      detail = '{"reason":"cross_firm","class":"promotion"}';
  end if;
  if p.status <> 'proposed' then
    raise exception 'identifier promotion is not open' using errcode = 'CLR10',
      detail = '{"reason":"already_settled","class":"promotion"}';
  end if;
  update clara.client_identifier_promotions
     set status = 'declined', settled_by = c.actor, settled_at = now()
   where id = p_proposal;
  perform clara._audit(c.firm, c.actor, null, null, 'decline_identifier_promotion', null,
    jsonb_build_object('promotion', p_proposal, 'op_key', p_op_key));
  return clara._finish_op(c.firm, 'decline_identifier_promotion', p_op_key,
    jsonb_build_object('promotion_id', p_proposal, 'status', 'declined'));
end $fn$;

reset role;

-- =====================================================================================
-- SS6 -- RLS, APPEND-ONLY / NO-TRUNCATE, AND THE ACL
-- =====================================================================================
-- Every new base table: RLS ENABLED and FORCED with the estate's owner policy, so the only
-- reads and writes are through the SECURITY DEFINER verbs above. No app role holds DML on
-- any of the four; `clara.agent_receipts_visible` is the single granted surface in this file.
alter table clara.agent_receipt_contract        enable row level security;
alter table clara.agent_receipt_contract        force  row level security;
alter table clara.agent_receipt_surfaces        enable row level security;
alter table clara.agent_receipt_surfaces        force  row level security;
alter table clara.firm_open_questions           enable row level security;
alter table clara.firm_open_questions           force  row level security;
alter table clara.client_identifier_promotions  enable row level security;
alter table clara.client_identifier_promotions  force  row level security;

create policy p_agent_receipt_contract_owner       on clara.agent_receipt_contract
  for all to clara_fn_owner using (true) with check (true);
create policy p_agent_receipt_surfaces_owner       on clara.agent_receipt_surfaces
  for all to clara_fn_owner using (true) with check (true);
create policy p_firm_open_questions_owner          on clara.firm_open_questions
  for all to clara_fn_owner using (true) with check (true);
create policy p_client_identifier_promotions_owner on clara.client_identifier_promotions
  for all to clara_fn_owner using (true) with check (true);

-- The two registries are EXTEND-ONLY. A contract a later migration can UPDATE or DELETE from
-- is a convention; append-only is what makes it a contract.
create trigger t_agent_receipt_contract_append_only
  before delete or update on clara.agent_receipt_contract
  for each row execute function clara._tf_append_only();
create trigger t_agent_receipt_contract_no_truncate
  before truncate on clara.agent_receipt_contract
  for each statement execute function clara._tf_no_truncate();
create trigger t_agent_receipt_surfaces_append_only
  before delete or update on clara.agent_receipt_surfaces
  for each row execute function clara._tf_append_only();
create trigger t_agent_receipt_surfaces_no_truncate
  before truncate on clara.agent_receipt_surfaces
  for each statement execute function clara._tf_no_truncate();
-- The two lifecycle tables settle in place (open -> resolved/dismissed, proposed -> confirmed/
-- declined), so they are NOT append-only; they are no-truncate, and their state machines are
-- the CHECK constraints above plus `for update` in each verb.
create trigger t_firm_open_questions_no_truncate
  before truncate on clara.firm_open_questions
  for each statement execute function clara._tf_no_truncate();
create trigger t_client_identifier_promotions_no_truncate
  before truncate on clara.client_identifier_promotions
  for each statement execute function clara._tf_no_truncate();

-- ACL. The seven shims and the raw union stay UNGRANTED, and this is load-bearing, not tidiness.
--
-- A plain view executes with its OWNER's permissions, and every governed clara table carries the
-- estate's universal owner policy `for all to clara_fn_owner using (true)` (`0002:491` and its
-- siblings). FORCE RLS does not save you from it -- the owner policy is unrestricted by design.
-- So each `_agent_receipt_src_*` view INDIVIDUALLY sees every firm's rows, and the firm filter for
-- seven tables' worth of receipts lives in exactly ONE place: SS2.4's predicate. A later reader who
-- grants SELECT on a shim "just to debug something" opens a seven-table cross-tenant hole with no
-- second wall behind it. The tail asserts ZERO non-owner grantees on all eight views, so this is
-- safe by assertion rather than by convention.
--
-- THE SHIMS STAY AT THE DEFAULT (definer semantics). A MEASURED decision with the alternative
-- DISPROVEN, not an inherited default -- and the first reasoning written here was wrong, so the
-- measurement replaces it rather than sitting beside it. The claim was that
-- `security_invoker = true` on a shim "buys nothing" because the current user would resolve to
-- the outer view's owner. FALSE. The F-A8 lane built the real nesting on a rig (RLS+FORCE base
-- with one `clara_fn_owner` policy and zero app-role grants -> shim -> owner-run union -> read as
-- a real bookkeeper+ principal) and measured:
--     shim default (definer)      via the union -> 2 rows, WORKS
--     shim security_invoker=true  via the union -> REFUSED, 42501 permission denied on the base
-- The invoker setting does NOT stop at the union's owner: the human's identity propagates through
-- the owner-run union into the shim, and at the shim's base table that human holds no SELECT
-- grant -- which is precisely the posture every member adopted. So the option that reads like
-- hardening turns every item's arm dark. It fails loudly rather than silently, but it fails
-- totally, so it is refused.
--
-- THE RESIDUAL HOLE, NAMED because the ungrant is now the ONLY wall in front of it. Also measured:
-- with the shim at the default, a WRONGLY GRANTED `select` on a shim returns rows to a human,
-- bypassing this view's bookkeeper floor AND both arm predicates entirely. `security_invoker`
-- cannot close that, because it closes it only by closing everything. The ACL census in the tail
-- (and its adversarial twin in the battery, which grants one and proves the census FAILS) is
-- therefore not defence-in-depth -- it is the wall. On F-A8's firm-less shim the cost of that
-- mistake is Tier-1 draft content below the bookkeeper floor; on the six FIRM-SCOPED shims the
-- identical mistake is a CROSS-TENANT read, which is hard-constraint territory.
revoke all on clara._agent_receipts_all from public;
revoke all on clara._agent_receipt_src_f_a2 from public;
revoke all on clara._agent_receipt_src_f_a3 from public;
revoke all on clara._agent_receipt_src_f_a4 from public;
revoke all on clara._agent_receipt_src_f_a5 from public;
revoke all on clara._agent_receipt_src_f_a6 from public;
revoke all on clara._agent_receipt_src_f_a7 from public;
revoke all on clara._agent_receipt_src_f_a8 from public;
revoke all on clara.agent_receipt_contract from public;
revoke all on clara.agent_receipt_surfaces from public;
revoke all on clara.firm_open_questions from public;
revoke all on clara.client_identifier_promotions from public;
revoke all on clara.agent_receipts_visible from public;
grant select on clara.agent_receipts_visible to clara_authenticated;

-- Cores stay UNGRANTED (beta adds the wake wrappers over them); the human verbs go to
-- clara_authenticated and enforce the bookkeeper+ floor in their own bodies via `_human_ctx`.
revoke all on function clara._firm_question_core(uuid,uuid,uuid,text,uuid,text,text,jsonb,text) from public;
revoke all on function clara._identifier_promotion_core(uuid,uuid,uuid,text,uuid,text,text,int,jsonb,text,jsonb) from public;
revoke all on function clara._assert_receipt_surface_conforms(text) from public;
revoke all on function clara.agent_receipt_source_census() from public;
revoke all on function clara.agent_receipt_dark_rows() from public;
revoke all on function clara.name_family_token(text) from public;
revoke all on function clara.name_family_candidates(uuid,text) from public;
revoke all on function clara.name_family_is_ambiguous(uuid,text) from public;
revoke all on function clara.resolve_firm_question(uuid,text,uuid,text) from public;
revoke all on function clara.dismiss_firm_question(uuid,text,text) from public;
revoke all on function clara.confirm_identifier_promotion(uuid,text) from public;
revoke all on function clara.decline_identifier_promotion(uuid,text,text) from public;
grant execute on function clara.resolve_firm_question(uuid,text,uuid,text)     to clara_authenticated;
grant execute on function clara.dismiss_firm_question(uuid,text,text)          to clara_authenticated;
grant execute on function clara.confirm_identifier_promotion(uuid,text)        to clara_authenticated;
grant execute on function clara.decline_identifier_promotion(uuid,text,text)   to clara_authenticated;

-- =====================================================================================
-- SS7 -- TAIL SELF-PROOF. Raises on failure; every claim is re-READ from the catalog.
-- =====================================================================================
do $$
declare v_n int; v_bad text; v_census record; v_unwired text; v_cols text;
begin
  -- (1) The D1 claim, proven rather than asserted: every function this file installs is NEW,
  --     i.e. exactly ONE pg_proc row per name, and no name it installs pre-existed under a
  --     different signature. A second row would mean this file overloaded a live body.
  select string_agg(x.proname || ' x' || x.n, ', ' order by x.proname) into v_bad
    from (select p.proname, count(*)::int as n
            from pg_proc p join pg_namespace n2 on n2.oid = p.pronamespace
           where n2.nspname = 'clara'
             and p.proname in ('_assert_receipt_surface_conforms','agent_receipt_source_census',
                               '_firm_question_core','resolve_firm_question','dismiss_firm_question',
                               'name_family_token','name_family_candidates','name_family_is_ambiguous',
                               '_identifier_promotion_core','confirm_identifier_promotion',
                               'decline_identifier_promotion')
           group by p.proname having count(*) <> 1) x;
  if v_bad is not null then
    raise exception 'F-A7 pi tail: a name this file installs is overloaded, so it is not purely additive: %', v_bad
      using errcode = 'CLR10';
  end if;

  -- (2) The contract is 19 rows with contiguous ordinals 1..19. A gap would silently exempt a
  --     column from the checker, which walks by ordinal.
  select count(*)::int into v_n from clara.agent_receipt_contract;
  if v_n <> 19 then
    raise exception 'F-A7 pi tail: the receipt contract has % row(s), expected 19', v_n using errcode = 'CLR10';
  end if;
  if exists (select 1 from generate_series(1, 19) g
              where not exists (select 1 from clara.agent_receipt_contract ct where ct.ordinal = g)) then
    raise exception 'F-A7 pi tail: the receipt contract ordinals are not contiguous 1..19' using errcode = 'CLR10';
  end if;
  -- R-L26: `scope` must be the LAST ordinal and non-nullable. If a later hand inserts it
  -- mid-list the member lanes' broadcast ordinals shift silently; if it is marked nullable the
  -- platform arm's precondition stops being a precondition.
  if not exists (select 1 from clara.agent_receipt_contract
                  where ordinal = 19 and column_name = 'scope'
                    and data_type = 'text' and nullable = false) then
    raise exception 'F-A7 pi tail: contract ordinal 19 is not the non-nullable text `scope` column'
      using errcode = 'CLR10';
  end if;

  -- (3) Every registered shim EXISTS and CONFORMS -- through the checker itself, so this tail
  --     also proves the checker runs clean on a conforming surface (a checker nobody has seen
  --     pass is not evidence either).
  for v_census in select shim_relname from clara.agent_receipt_surfaces order by item loop
    perform clara._assert_receipt_surface_conforms(v_census.shim_relname);
  end loop;

  -- (4) The census agrees, and says the truth about pi: seven registered, seven present,
  --     seven conforming, ZERO wired. `wired` comes from pg_depend, so this is a read that
  --     can say no.
  select count(*)::int into v_n from clara.agent_receipt_source_census();
  if v_n <> 7 then
    raise exception 'F-A7 pi tail: the receipt-source census returned % row(s), expected 7', v_n using errcode = 'CLR10';
  end if;
  select string_agg(item, ', ' order by item) into v_bad
    from clara.agent_receipt_source_census() where not shim_exists or not conforms;
  if v_bad is not null then
    raise exception 'F-A7 pi tail: receipt shim(s) missing or non-conforming: %', v_bad using errcode = 'CLR10';
  end if;
  select string_agg(format('%s x%s', item, dark_rows), ', ' order by item) into v_bad
    from clara.agent_receipt_source_census() where dark_rows <> 0;
  if v_bad is not null then
    raise exception 'F-A7 pi tail: shim(s) projecting rows visible to NOBODY: %', v_bad using errcode = 'CLR10';
  end if;
  select string_agg(item, ', ' order by item) into v_unwired
    from clara.agent_receipt_source_census() where not wired;
  if v_unwired is distinct from 'f_a2, f_a3, f_a4, f_a5, f_a6, f_a7, f_a8' then
    raise exception 'F-A7 pi tail: expected all seven shims UNWIRED at pi; unwired set is %',
      coalesce(v_unwired, '(none)') using errcode = 'CLR10';
  end if;

  -- (5) The read surface: a view, owned by clara_fn_owner, with the contract's 19 columns in
  --     order, and an ACL of exactly `clara_authenticated=r` beyond the owner's own.
  if (select c.relkind from pg_class c join pg_namespace n2 on n2.oid = c.relnamespace
       where n2.nspname = 'clara' and c.relname = 'agent_receipts_visible') is distinct from 'v' then
    raise exception 'F-A7 pi tail: clara.agent_receipts_visible is not a view' using errcode = 'CLR10';
  end if;
  select string_agg(format('#%s %s %s', ct.ordinal, ct.column_name, ct.data_type), '; ' order by ct.ordinal)
    into v_cols
    from clara.agent_receipt_contract ct
    left join pg_attribute a
      on a.attrelid = 'clara.agent_receipts_visible'::regclass
     and a.attnum = ct.ordinal and not a.attisdropped
   where a.attname is distinct from ct.column_name
      or format_type(a.atttypid, a.atttypmod) is distinct from ct.data_type;
  if v_cols is not null then
    raise exception 'F-A7 pi tail: agent_receipts_visible does not carry the contract: %', v_cols
      using errcode = 'CLR10';
  end if;
  if not has_table_privilege('clara_authenticated', 'clara.agent_receipts_visible', 'select') then
    raise exception 'F-A7 pi tail: clara_authenticated cannot SELECT the one read surface' using errcode = 'CLR10';
  end if;
  select string_agg(r.rolname, ', ' order by r.rolname) into v_bad
    from pg_roles r
   where r.rolname in ('clara_agent_ro','clara_wake_interactive','clara_wake_proactive','clara_runtime')
     and has_table_privilege(r.rolname, 'clara.agent_receipts_visible', 'select');
  if v_bad is not null then
    raise exception 'F-A7 pi tail: agent_receipts_visible is readable by non-human role(s): %', v_bad
      using errcode = 'CLR10';
  end if;
  -- THE SHIM ACL CENSUS. Not "these five roles cannot read it" -- that is a closed list, and a
  -- grant to a role nobody thought of would pass it. This walks `relacl` itself and refuses ANY
  -- grantee other than the owner, on all seven shims AND the raw union. Each of those views sees
  -- every firm's rows under the universal owner policy, so being ungranted is the only thing
  -- standing between them and a seven-table cross-tenant read.
  select string_agg(format('%s->%s', x.relname, x.grantee), ', ' order by x.relname, x.grantee)
    into v_bad
    from (select c.relname,
                 coalesce(nullif(split_part(acl::text, '=', 1), ''), 'PUBLIC') as grantee
            from pg_class c
            join pg_namespace n2 on n2.oid = c.relnamespace
            cross join lateral unnest(coalesce(c.relacl, '{}'::aclitem[])) acl
           where n2.nspname = 'clara'
             and (c.relname like '\_agent\_receipt\_src\_%' or c.relname = '_agent_receipts_all')) x
   where x.grantee <> 'clara_fn_owner';
  if v_bad is not null then
    raise exception 'F-A7 pi tail: an internal receipt view has a non-owner grantee, so the one entrance is not one: %', v_bad
      using errcode = 'CLR10';
  end if;
  -- ...and the census can say NO: it must have SEEN eight views, not silently zero.
  select count(*)::int into v_n
    from pg_class c join pg_namespace n2 on n2.oid = c.relnamespace
   where n2.nspname = 'clara' and c.relkind = 'v'
     and (c.relname like '\_agent\_receipt\_src\_%' or c.relname = '_agent_receipts_all');
  if v_n <> 8 then
    raise exception 'F-A7 pi tail: the internal receipt-view ACL census saw % view(s), expected 8', v_n
      using errcode = 'CLR10';
  end if;

  -- (5b) R-L26: no DARK ROWS. At pi every shim is a stub so the honest answer is zero, but the
  -- instrument is proven runnable here and each member's tail re-runs it after wiring.
  select string_agg(format('%s/%s x%s', d.receipt_kind, coalesce(d.scope, '(null)'), d.dark_rows), ', ')
    into v_bad from clara.agent_receipt_dark_rows() d;
  if v_bad is not null then
    raise exception 'F-A7 pi tail: receipt rows visible to NOBODY (scope/firm_id disagree): %', v_bad
      using errcode = 'CLR10';
  end if;

  -- (6) The four new tables are RLS-enabled AND forced, and no app role holds DML on any.
  select string_agg(c.relname, ', ' order by c.relname) into v_bad
    from pg_class c join pg_namespace n2 on n2.oid = c.relnamespace
   where n2.nspname = 'clara'
     and c.relname in ('agent_receipt_contract','agent_receipt_surfaces','firm_open_questions',
                       'client_identifier_promotions')
     and (not c.relrowsecurity or not c.relforcerowsecurity);
  if v_bad is not null then
    raise exception 'F-A7 pi tail: RLS not enabled+forced on: %', v_bad using errcode = 'CLR10';
  end if;
  select string_agg(format('%s:%s:%s', t.relname, r.rolname, t.priv), ', ') into v_bad
    from (values ('agent_receipt_contract'),('agent_receipt_surfaces'),('firm_open_questions'),
                 ('client_identifier_promotions')) t0(relname)
    cross join (values ('insert'),('update'),('delete')) p(priv)
    cross join (values ('clara_authenticated'),('clara_agent_ro'),('clara_wake_interactive'),
                       ('clara_wake_proactive'),('clara_runtime')) r(rolname)
    cross join lateral (select t0.relname, p.priv) t
   where has_table_privilege(r.rolname, 'clara.' || t0.relname, p.priv);
  if v_bad is not null then
    raise exception 'F-A7 pi tail: an app role holds DML on a new table: %', v_bad using errcode = 'CLR10';
  end if;

  -- (7) firm_open_questions has NO client_id column. D-11 is a shape claim; this is the read
  --     that could say no.
  if exists (select 1 from pg_attribute a
              where a.attrelid = 'clara.firm_open_questions'::regclass
                and a.attnum > 0 and not a.attisdropped and a.attname = 'client_id') then
    raise exception 'F-A7 pi tail: firm_open_questions gained a client_id column -- D-11 says it has none'
      using errcode = 'CLR10';
  end if;

  -- (8) The cores are ungranted and the human verbs are granted to clara_authenticated ONLY.
  select string_agg(x.sig || '->' || x.rolname, ', ') into v_bad
    from (select s.sig, r.rolname
            from (values ('clara._firm_question_core(uuid,uuid,uuid,text,uuid,text,text,jsonb,text)'),
                         ('clara._identifier_promotion_core(uuid,uuid,uuid,text,uuid,text,text,int,jsonb,text,jsonb)'),
                         ('clara.name_family_token(text)'),
                         ('clara.name_family_candidates(uuid,text)'),
                         ('clara.name_family_is_ambiguous(uuid,text)'),
                         ('clara._assert_receipt_surface_conforms(text)'),
                         ('clara.agent_receipt_source_census()')) s(sig)
            cross join (values ('clara_authenticated'),('clara_agent_ro'),('clara_wake_interactive'),
                               ('clara_wake_proactive'),('clara_runtime')) r(rolname)
           where has_function_privilege(r.rolname, s.sig, 'execute')) x;
  if v_bad is not null then
    raise exception 'F-A7 pi tail: an ungranted core/helper is EXECUTE-reachable: %', v_bad using errcode = 'CLR10';
  end if;
  select string_agg(x.sig, ', ') into v_bad
    from (select s.sig from (values ('clara.resolve_firm_question(uuid,text,uuid,text)'),
                                    ('clara.dismiss_firm_question(uuid,text,text)'),
                                    ('clara.confirm_identifier_promotion(uuid,text)'),
                                    ('clara.decline_identifier_promotion(uuid,text,text)')) s(sig)
           where not has_function_privilege('clara_authenticated', s.sig, 'execute')
              or has_function_privilege('clara_agent_ro', s.sig, 'execute')
              or has_function_privilege('clara_wake_interactive', s.sig, 'execute')
              or has_function_privilege('clara_wake_proactive', s.sig, 'execute')) x;
  if v_bad is not null then
    raise exception 'F-A7 pi tail: a human verb has the wrong grant matrix: %', v_bad using errcode = 'CLR10';
  end if;

  -- (9) NO wake surface arrived. The four beta wrappers must be absent, and no
  --     `wake_fn_allowlist` row may name a `filing` kind: pi mints no wake authority at all.
  select string_agg(p.proname, ', ' order by p.proname) into v_bad
    from pg_proc p join pg_namespace n2 on n2.oid = p.pronamespace
   where n2.nspname = 'clara'
     and p.proname in ('wake_open_firm_question','wake_reattribute_document',
                       'wake_propose_filing_correction','wake_propose_identifier_promotion',
                       'wake_file_document');
  if v_bad is not null then
    raise exception 'F-A7 pi tail: a beta wake wrapper arrived in pi: %', v_bad using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from clara.wake_fn_allowlist where wake_kind = 'filing';
  if v_n <> 0 then
    raise exception 'F-A7 pi tail: % filing allowlist row(s) present; the filing kind is beta''s', v_n
      using errcode = 'CLR10';
  end if;

  -- (10) The family predicate, exercised rather than described. Token equality both ways on
  --      constants this file owns; no fixture, no seed dependency.
  if clara.name_family_token('ROME PROPERTIES SDN BHD') is distinct from 'rome'
     or clara.name_family_token('  rome-secretary ') is distinct from 'rome'
     or clara.name_family_token('BEE CREATIVE SOLUTION') is distinct from 'bee'
     or clara.name_family_token('   ') is not null
     or clara.name_family_token(null) is not null then
    raise exception 'F-A7 pi tail: the family token function does not tokenise as designed'
      using errcode = 'CLR10';
  end if;
  if clara.name_family_token('ROME PROPERTIES') = clara.name_family_token('BEE CREATIVE SOLUTION') then
    raise exception 'F-A7 pi tail: the family token collapses two distinct families' using errcode = 'CLR10';
  end if;

  raise notice 'F-A7 pi tail: OK -- 11 new functions each with exactly one pg_proc row (no live body replaced, D1 inventory EMPTY); the 19-column receipt contract is contiguous with the non-nullable `scope` LAST (R-L26); 7 shims registered, present, conforming and ALL UNWIRED (pg_depend-derived); agent_receipts_visible carries the contract in order, is SELECT-able by clara_authenticated and by no non-human role, and no shim is directly readable; RLS enabled+forced on all 4 new tables with zero app-role DML; firm_open_questions has NO client_id column; every core/helper is EXECUTE-unreachable and the 4 human verbs are clara_authenticated-only; ZERO wake wrappers and ZERO filing allowlist rows arrived. No table in workflow/graphile_worker/spike touched.';
end $$;
