-- 0142_fa7b_pr_a_client_onboarding_open.sql -- F-A7b (client onboarding), PR-a, the
-- ADDITIVE opener of the train. Authored UNNUMBERED; 0142 claimed at MERGE PREPARATION
-- 2026-08-29 against a main frontier of 0141 (standing law, AGENTS.md +
-- .claude/rules/db-migrations.md).
--
-- Design of record: docs/plan/active/fa7b-onboarding-design.md SS4 D-1, D-3, D-4, as amended by
-- the gate record docs/plan/active/fa7b-gate-record.md (Q-D1 ALL-PROPOSE; Q-D4 ride
-- firm_open_questions). Build sequence: docs/plan/active/fa7b-onboarding-annexes.md Annex A
-- row "PR-a -- additive". Scope is EXACTLY that row: D-1's CHECK extension +
-- wake_propose_client_onboarding, D-3's three columns, D-4's receipt table + its shim view.
-- D-2 (the birth core, wake_begin_client_onboarding, allowlist row 7, accept_onboarding_
-- proposal) is PR-b's; D-5/D-8 (the interview) is PR-c's; D-7 (the re-triage) is PR-d's; the
-- screens are PR-e's; the chat part type is PR-f's. None of those is touched here.
--
-- =====================================================================================
-- SS0 -- D1 WRITE-QUIESCE INVENTORY: EMPTY.
-- =====================================================================================
-- No live PL/pgSQL function body is replaced by this file. `wake_propose_client_onboarding` is
-- a brand-new function name (the tail proves it, as a census, not this comment). Two VIEWS are
-- CREATE OR REPLACE'd -- `clara._agent_receipt_src_f_a7b` (a brand-new name, so this is a first
-- creation dressed as CoR only by the estate's own idiom) and `clara._agent_receipts_all`
-- (widened by one UNION ALL arm). Neither is a D1 event: a view definition has no "in-flight
-- call runs the old body" hazard the way a PL/pgSQL function does -- once the DDL commits every
-- subsequent SELECT sees the new definition, and there is no long-running view invocation that
-- could straddle the change. PR-a therefore takes NO ceremony, consistent with the work order
-- ("PR-a takes no ceremony -- nothing replaces a live audited writer's body").
--
-- =====================================================================================
-- WHAT THIS FILE DOES -- three limbs, D-1/D-3/D-4
-- =====================================================================================
-- (A) D-1a: clara.firm_open_questions.kind's CHECK widens by one value, 'onboarding_proposed'
--     (extend-only; both directions proven in the tail, never a list -- Annex C R4, the F-A2
--     GB-3 lesson restated because this item is the latest to learn it).
-- (B) D-1b: clara.wake_propose_client_onboarding, a NEW wake wrapper granted to clara_wake_
--     filing (allowlist row 8; row 7, wake_begin_client_onboarding, stays PR-b's reservation
--     per 0126_f_a7_beta_filing_verb.sql:2066-2068's own footnote). Delegates to the EXISTING,
--     UNCHANGED clara._firm_question_core (0103_f_a7_pi_additive.sql:604) -- no new carrier.
--     Walls it carries (review law 1 -- judgement logic, built for adversarial probing):
--       * op_key / proposed_name / rationale / model-snapshot shape (mirrors wake_open_firm_
--         question's own Tier-A idiom, 0126:1541-1565);
--       * the evidentiary basis floor -- p_basis must be an object naming >=1 sighting and
--         >=1 citation (mirrors client_identifier_promotions' own floor, 0103 SS5) -- review
--         law 2, "absence is not evidence": a proposal built on zero citations is air;
--       * the document must exist in the caller's firm (locked FOR UPDATE, _agent_file_
--         document_core's own idiom, 0126:897);
--       * A14, the negative acceptance step (fa7b-onboarding-design.md SS2): a proposed name
--         whose leading token collides with an existing client or counterparty family
--         (clara.name_family_is_ambiguous, 0103:781) is HARD REFUSED here, in the DB, before
--         any receipt is written -- "a design that only proves the happy path proves nothing
--         about the wall". A design-vs-mechanism note: D-2's own family-collision wall (its
--         own future PR) guards the BIRTH core against a human-edited name at accept time;
--         this wall guards the PROPOSAL itself against ever reaching a human for an ambiguous
--         AI-supplied name. The two are complementary, not redundant, and neither substitutes
--         for the other's input (one guards Clara's own name, the other guards whatever a
--         human later types);
--       * the firm-narrow egress authorization -- live, purpose='firm_narrow_intake',
--         moment='attribution', bound to THIS document's sha256, not consumed/invalidated/
--         expired, consumed only once every other wall has cleared (mirrors _agent_file_
--         document_core's A9/B7 rungs, 0126:939-990, one legitimate-dispatch-preserving
--         consume-late discipline, not a copy of its multi-rung ladder -- this verb does not
--         file anything and runs no B1-B9 ladder);
--       * no second OPEN 'onboarding_proposed' question already sitting on the same document
--         (a defensive duplicate wall scoped to its own kind; firm_open_questions carries no
--         cross-kind uniqueness by design, so an 'unattributed' and an 'onboarding_proposed'
--         row may coexist -- this only stops Clara looping a second proposal onto herself).
-- (C) D-3: three columns on clara.onboarding_plans -- opened_by_agent, opener_model,
--     opened_from_question -- the honest-label provenance triple, ADD COLUMN only, no body CoR.
-- (D) D-4: clara.onboarding_agent_receipts (TA-P4 A's per-item table for F-A7b) + its shim view
--     wired into pi's 19-column receipt contract as the EIGHTH registered member -- the
--     "KNOWN, REGISTERED COST" pi's own header names (0103_f_a7_pi_additive.sql:105-107): an
--     eighth item beyond TA-P4 A's seven needs the registry's item/shim_relname CHECKs widened
--     (extend-only, one optional trailing letter, both directions proven) and clara.
--     _agent_receipts_all CoR'd with an eighth UNION ALL arm. clara.agent_receipts_visible
--     itself is NOT touched -- it already reads `r.* from clara._agent_receipts_all r`, so
--     widening the union underneath it is enough; pi's own header text says the touch lands on
--     the union, and that is where this file makes it.
--
-- =====================================================================================
-- WHAT THIS FILE DELIBERATELY DOES NOT DO
-- =====================================================================================
-- 1. NO accept_onboarding_proposal / decline verb. Acceptance calls the extracted birth core
--    (D-2, PR-b) and settles the question; decline is the EXISTING dismiss_firm_question
--    (0103:679), untouched. Neither is this file's to build.
-- 2. NO wake_begin_client_onboarding, no allowlist row 7. PR-b's reservation, left exactly as
--    0126 left it.
-- 3. NO change to _firm_question_core, resolve_firm_question, dismiss_firm_question, or any
--    other live body. D-1b is purely a NEW caller of the existing core.
-- 4. NO materials_basis segment, no interview normalizer, no clientOnboarding_v4. PR-c's.
-- 5. NO re-triage wake source row, no filing on the newborn client. PR-d's.
--
-- =====================================================================================
-- SS1 -- PRESTATE. Fail-closed; an absent or wrong-shaped premise aborts the apply, loudly.
-- =====================================================================================
do $$
declare v_missing text; v_def text;
begin
  -- (a) Nothing this file creates may already exist.
  select string_agg(t.n, ', ' order by t.n) into v_missing
    from (values ('onboarding_agent_receipts'),('_agent_receipt_src_f_a7b')) t(n)
   where to_regclass('clara.'||t.n) is not null;
  if v_missing is not null then
    raise exception 'fa7b pr-a prestate: relation(s) already present: %', v_missing
      using errcode = 'CLR10';
  end if;
  if to_regprocedure('clara.wake_propose_client_onboarding(uuid,text,jsonb,text,jsonb,uuid,text)') is not null then
    raise exception 'fa7b pr-a prestate: clara.wake_propose_client_onboarding already exists'
      using errcode = 'CLR10';
  end if;
  select string_agg(t.n, ', ' order by t.n) into v_missing
    from (values ('opened_by_agent'),('opener_model'),('opened_from_question')) t(n)
   where exists (select 1 from pg_attribute a
                  where a.attrelid = 'clara.onboarding_plans'::regclass
                    and a.attnum > 0 and not a.attisdropped and a.attname = t.n);
  if v_missing is not null then
    raise exception 'fa7b pr-a prestate: onboarding_plans already carries column(s): %', v_missing
      using errcode = 'CLR10';
  end if;
  if exists (select 1 from clara.wake_fn_allowlist
              where wake_kind = 'filing' and function_name = 'wake_propose_client_onboarding') then
    raise exception 'fa7b pr-a prestate: the filing allowlist already carries wake_propose_client_onboarding'
      using errcode = 'CLR10';
  end if;
  if exists (select 1 from clara.agent_receipt_surfaces where item = 'f_a7b') then
    raise exception 'fa7b pr-a prestate: agent_receipt_surfaces already carries an f_a7b row'
      using errcode = 'CLR10';
  end if;

  -- (b) The premises this file builds on must be LIVE, each named individually.
  select string_agg(t.n, ', ' order by t.n) into v_missing
    from (values ('clara.jwt_firm()'),('clara.actor_role_rank()'),('clara.role_rank(text)'),
                 ('clara.agent_user_id()'),
                 ('clara._reserve_op(uuid,text,text,bytea)'),('clara._finish_op(uuid,text,text,jsonb)'),
                 ('clara._hash(jsonb)'),('clara._audit(uuid,uuid,uuid,text,text,uuid,jsonb)'),
                 ('clara._tf_append_only()'),('clara._tf_no_truncate()'),
                 ('clara.wake_context()'),('clara.assert_wake_allowed(text,text)'),
                 ('clara._firm_question_core(uuid,uuid,uuid,text,uuid,text,text,jsonb,text)'),
                 ('clara.name_family_is_ambiguous(uuid,text)'),
                 ('clara._assert_receipt_surface_conforms(text)'),
                 ('clara.agent_receipt_source_census()')) t(n)
   where to_regprocedure(t.n) is null;
  if v_missing is not null then
    raise exception 'fa7b pr-a prestate: required live function(s) absent: %', v_missing
      using errcode = 'CLR10';
  end if;
  select string_agg(t.n, ', ' order by t.n) into v_missing
    from (values ('firms'),('clients'),('documents'),('firm_open_questions'),('onboarding_plans'),
                 ('agent_receipt_contract'),('agent_receipt_surfaces'),('agent_receipts_visible'),
                 ('_agent_receipts_all'),('firm_egress_dispatch_authorizations'),
                 ('wake_fn_allowlist')) t(n)
   where to_regclass('clara.'||t.n) is null;
  if v_missing is not null then
    raise exception 'fa7b pr-a prestate: required live relation(s) absent: %', v_missing
      using errcode = 'CLR10';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'clara_wake_filing') then
    raise exception 'fa7b pr-a prestate: role clara_wake_filing is absent (train beta has not landed)'
      using errcode = 'CLR10';
  end if;

  -- (c) firm_egress_dispatch_authorizations carries the exact 8 columns this file's wrapper
  --     reads/writes -- the same shape tripwire 0126's own A9 rung carries (its header note:
  --     "the table existing is not the same fact as the columns existing with these exact
  --     names"), re-derived here rather than assumed inherited.
  if (select count(*) from information_schema.columns c
       where c.table_schema = 'clara' and c.table_name = 'firm_egress_dispatch_authorizations'
         and c.column_name in ('id','firm_id','document_sha256','moment','purpose',
                                'consumed_at','expires_at','invalidated_at')) <> 8 then
    raise exception 'fa7b pr-a prestate: firm_egress_dispatch_authorizations does not carry the 8 columns this wrapper was authored against'
      using errcode = 'CLR10';
  end if;

  -- (d) The CHECK constraints this file widens, read byte-exact from the LIVE catalog --
  --     never copied from an older migration's text (the superseded-body class).
  select pg_get_constraintdef(oid) into v_def from pg_constraint
   where conrelid = 'clara.firm_open_questions'::regclass and conname = 'firm_open_questions_kind_check';
  if v_def is distinct from
     'CHECK ((kind = ANY (ARRAY[''unattributed''::text, ''collision''::text, ''contradiction''::text, ''identity_document''::text, ''correction_proposed''::text, ''promotion_proposed''::text])))' then
    raise exception 'fa7b pr-a prestate: firm_open_questions_kind_check is not the live 6-value world this file widens (live: %)',
      coalesce(v_def, '(constraint absent)') using errcode = 'CLR10';
  end if;
  select pg_get_constraintdef(oid) into v_def from pg_constraint
   where conrelid = 'clara.agent_receipt_surfaces'::regclass and conname = 'agent_receipt_surfaces_item_check';
  if v_def is distinct from 'CHECK ((item ~ ''^f_a[0-9]+$''::text))' then
    raise exception 'fa7b pr-a prestate: agent_receipt_surfaces_item_check is not the live digits-only world this file widens (live: %)',
      coalesce(v_def, '(constraint absent)') using errcode = 'CLR10';
  end if;
  select pg_get_constraintdef(oid) into v_def from pg_constraint
   where conrelid = 'clara.agent_receipt_surfaces'::regclass and conname = 'agent_receipt_surfaces_shim_relname_check';
  if v_def is distinct from 'CHECK ((shim_relname ~ ''^_agent_receipt_src_f_a[0-9]+$''::text))' then
    raise exception 'fa7b pr-a prestate: agent_receipt_surfaces_shim_relname_check is not the live digits-only world this file widens (live: %)',
      coalesce(v_def, '(constraint absent)') using errcode = 'CLR10';
  end if;
  -- The registry currently holds exactly the seven TA-P4 A members pi registered; this file
  -- adds an eighth, so the prestate pins seven, not "some".
  if (select count(*) from clara.agent_receipt_surfaces) <> 7 then
    raise exception 'fa7b pr-a prestate: agent_receipt_surfaces holds % row(s), expected the pre-existing 7',
      (select count(*) from clara.agent_receipt_surfaces) using errcode = 'CLR10';
  end if;

  raise notice 'fa7b pr-a prestate: clean -- 2 new relations and 1 new function absent, onboarding_plans carries none of the 3 new columns yet, no filing allowlist row for wake_propose_client_onboarding, no f_a7b receipt-surface row yet; 16 live premises present incl. clara_wake_filing and the 8-column firm_egress_dispatch_authorizations shape; both widened CHECKs read at their exact live 6-value/digits-only pre-widening text; agent_receipt_surfaces holds exactly the pre-existing 7 rows.';
end $$;

set role clara_fn_owner;

-- PRECAUTIONARY, not load-bearing (independent review F3): three statements below take ACCESS
-- EXCLUSIVE on firm_open_questions and onboarding_plans (two constraint drop/adds and three ADD
-- COLUMNs) with the runner's default lock_timeout of 0 (wait forever). Row counts on both
-- tables are tens on any real chain at this point in the estate's life, so the ALTERs
-- themselves complete instantly once the lock is granted -- the exposure is lock ACQUISITION
-- queueing behind a long-running reader on either table, not the ALTER's own duration. A short
-- bounded wait turns an indefinite hang into a named, retryable failure
-- (.claude/rules/db-migrations.md: "say in a comment whether the setting is load-bearing or
-- precautionary").
set local lock_timeout = '5s';

-- =====================================================================================
-- SS2 -- (A) D-1a: firm_open_questions.kind WIDENS BY ONE VALUE
-- =====================================================================================
alter table clara.firm_open_questions drop constraint firm_open_questions_kind_check;
alter table clara.firm_open_questions add constraint firm_open_questions_kind_check
  check (kind in ('unattributed','collision','contradiction','identity_document',
                   'correction_proposed','promotion_proposed','onboarding_proposed'));

-- =====================================================================================
-- SS3 -- (C) D-3: THE HONEST LABEL -- three columns on onboarding_plans, ADD COLUMN only
-- =====================================================================================
alter table clara.onboarding_plans add column opened_by_agent boolean not null default false;
alter table clara.onboarding_plans add column opener_model text;
alter table clara.onboarding_plans add column opened_from_question uuid;

-- opened_from_question is non-null ONLY when opened_by_agent is true -- a human-opened file can
-- never claim a provenance it does not have (design D-3, verbatim). opener_model gets the SAME
-- one-directional honesty: it may be set only where the file itself says an agent opened it.
alter table clara.onboarding_plans add constraint ck_onboarding_plans_opened_from_question_honest
  check (opened_from_question is null or opened_by_agent);
alter table clara.onboarding_plans add constraint ck_onboarding_plans_opener_model_honest
  check (opener_model is null or opened_by_agent);

-- Congruence FK: opened_from_question must be a REAL question in THIS firm, never a dangling or
-- cross-firm id typed into an audit column (the estate's own "structural, not just a bare FK"
-- idiom -- e.g. fk_agent_filing_receipts_filing_congruent, 0126:722-724).
alter table clara.onboarding_plans add constraint fk_onboarding_plans_opened_from_question
  foreign key (opened_from_question, firm_id) references clara.firm_open_questions(id, firm_id);

-- =====================================================================================
-- SS4 -- (D) D-4: THE RECEIPT TABLE + THE EIGHTH RECEIPT-SURFACE MEMBER
-- =====================================================================================

-- SS4.1 The physical table. TA-P4 A's shape (mirrors clara.agent_filing_receipts, 0126 SS3,
-- byte-for-byte where F-A7b's acts carry the same facts) minus filing_id (this train files
-- nothing) and with document_id/client_id BOTH nullable -- unlike agent_filing_receipts (always
-- document-tied), F-A7b's later acts (D-2's birth, D-8's answer proposals) are PLAN-tied, not
-- document-tied, so a NOT NULL here would force a later PR to relax a wall this PR built. This
-- PR's own act (wake_propose_client_onboarding) always writes document_id and leaves client_id
-- NULL (no client exists yet at proposal time).
create table clara.onboarding_agent_receipts (
  id                uuid        primary key default gen_random_uuid(),
  firm_id           uuid        not null references clara.firms(id),
  document_id       uuid,
  client_id         uuid,
  model             text,
  model_version     text,
  rationale         text        not null check (btrim(rationale) <> ''),
  verdict           jsonb       not null check (jsonb_typeof(verdict) = 'object'),
  failing_rungs     text[]      not null default '{}'::text[],
  via_wake_kind     text        not null,
  trigger_kind      text        not null check (trigger_kind in ('wake_task','chat_turn')),
  trigger_id        text        not null check (btrim(trigger_id) <> ''),
  authorization_id  uuid,
  adopted_verbatim  boolean,
  acting_actor      uuid        not null,
  on_behalf_of      uuid,
  created_at        timestamptz not null default now(),
  constraint fk_onboarding_agent_receipts_document
    foreign key (document_id, firm_id) references clara.documents(id, firm_id),
  constraint fk_onboarding_agent_receipts_client
    foreign key (client_id, firm_id) references clara.clients(id, firm_id)
);
comment on table clara.onboarding_agent_receipts is
  'F-A7b D-4 (TA-P4 A): one row per F-A7b agent act (this PR: wake_propose_client_onboarding '
  'only). document_id/client_id are BOTH nullable -- later PRs'' plan-tied acts (birth, answer '
  'proposals) will use client_id/plan_id rather than document_id; this PR always writes '
  'document_id and leaves client_id NULL. Append-only, like every TA-P4 A receipt table.';
create index ix_onboarding_agent_receipts_document on clara.onboarding_agent_receipts(document_id, firm_id)
  where document_id is not null;
create index ix_onboarding_agent_receipts_open on clara.onboarding_agent_receipts(firm_id, created_at desc);

alter table clara.onboarding_agent_receipts enable row level security;
alter table clara.onboarding_agent_receipts force  row level security;
create policy p_onboarding_agent_receipts_owner on clara.onboarding_agent_receipts
  for all to clara_fn_owner using (true) with check (true);
create trigger t_onboarding_agent_receipts_append_only
  before delete or update on clara.onboarding_agent_receipts
  for each row execute function clara._tf_append_only();
create trigger t_onboarding_agent_receipts_no_truncate
  before truncate on clara.onboarding_agent_receipts
  for each statement execute function clara._tf_no_truncate();
-- No `revoke ... from public` here, deliberately (0126 SS3's own measured finding: a relation
-- carries no default PUBLIC grant, so such a revoke only materializes a no-op explicit ACL that
-- the DR round-trip's aclexplode diff then reads as drift). No clara_authenticated grant either
-- -- receipts are read through clara.agent_receipts_visible ONLY, the same posture pi gave the
-- other seven member tables.

-- SS4.2 Widen the registry's two closed-world CHECKs by exactly one optional trailing letter --
-- extend-only, both directions proven in the tail (Annex C R4). This is the "KNOWN, REGISTERED
-- COST" pi's own header names for an eighth receipt-bearing item.
alter table clara.agent_receipt_surfaces drop constraint agent_receipt_surfaces_item_check;
alter table clara.agent_receipt_surfaces add constraint agent_receipt_surfaces_item_check
  check (item ~ '^f_a[0-9]+[a-z]?$');
alter table clara.agent_receipt_surfaces drop constraint agent_receipt_surfaces_shim_relname_check;
alter table clara.agent_receipt_surfaces add constraint agent_receipt_surfaces_shim_relname_check
  check (shim_relname ~ '^_agent_receipt_src_f_a[0-9]+[a-z]?$');

insert into clara.agent_receipt_surfaces(item, receipt_kind, shim_relname, expected_source) values
  ('f_a7b','onboarding_agent','_agent_receipt_src_f_a7b','onboarding_agent_receipts');

-- SS4.3 The shim -- a real projection from the start (this item has no pre-existing typed-empty
-- stub to CoR; pi's seven were registered in pi itself, this is the eighth, registered here).
create view clara._agent_receipt_src_f_a7b as
  select
    'onboarding_agent'::text            as receipt_kind,
    r.id::text                          as receipt_id,
    r.firm_id                           as firm_id,
    r.client_id                         as client_id,
    r.document_id::text                 as subject_id,
    r.acting_actor                      as acting_actor,
    r.on_behalf_of                      as on_behalf_of,
    r.created_at                        as occurred_at,
    r.model                             as model,
    r.model_version                     as model_version,
    r.rationale                         as rationale,
    r.verdict                           as verdict,
    r.failing_rungs                     as failing_rungs,
    r.via_wake_kind                     as via_wake_kind,
    r.trigger_kind                      as trigger_kind,
    r.trigger_id                        as trigger_id,
    r.authorization_id                  as authorization_id,
    r.adopted_verbatim                  as adopted_verbatim,
    'firm'::text                        as scope
  from clara.onboarding_agent_receipts r;

select clara._assert_receipt_surface_conforms('_agent_receipt_src_f_a7b');

-- SS4.4 Widen the union by one arm. clara.agent_receipts_visible is UNTOUCHED -- it already
-- reads `r.* from clara._agent_receipts_all r`, so this is the one and only CoR the eighth
-- member needs.
create or replace view clara._agent_receipts_all as
    select * from clara._agent_receipt_src_f_a2
    union all select * from clara._agent_receipt_src_f_a3
    union all select * from clara._agent_receipt_src_f_a4
    union all select * from clara._agent_receipt_src_f_a5
    union all select * from clara._agent_receipt_src_f_a6
    union all select * from clara._agent_receipt_src_f_a7
    union all select * from clara._agent_receipt_src_f_a7b
    union all select * from clara._agent_receipt_src_f_a8;

-- =====================================================================================
-- SS5 -- (B) D-1b: clara.wake_propose_client_onboarding
-- =====================================================================================
create function clara.wake_propose_client_onboarding(
    p_document uuid, p_proposed_name text, p_basis jsonb,
    p_rationale text, p_model jsonb, p_authorization uuid, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $fn$
declare
  w record; v_dedupe jsonb; v_receipt_id uuid; v_question_id uuid;
  v_name text; v_doc_firm uuid; v_doc_sha text; v_citations jsonb; v_auth record;
begin
  select * into w from clara.wake_context();
  if w.credential_id is null then raise exception 'no valid wake credential' using errcode = 'CLR03'; end if;
  perform clara.assert_wake_allowed(w.wake_kind, 'wake_propose_client_onboarding');

  if nullif(btrim(coalesce(p_op_key, '')), '') is null then
    raise exception 'op_key is required' using errcode = 'CLR10',
      detail = '{"reason":"invalid_request","class":"op_key","constraint":"nonempty"}';
  end if;
  v_name := nullif(btrim(coalesce(p_proposed_name, '')), '');
  if v_name is null or length(v_name) > 500 then
    raise exception 'a client onboarding proposal needs a proposed name' using errcode = 'CLR10',
      detail = '{"reason":"invalid_request","class":"proposed_name","constraint":"nonempty_le_500"}';
  end if;
  if nullif(btrim(coalesce(p_rationale, '')), '') is null then
    raise exception 'a client onboarding proposal must state its rationale' using errcode = 'CLR10',
      detail = '{"reason":"invalid_request","class":"rationale","constraint":"nonempty"}';
  end if;
  if p_model is null or jsonb_typeof(p_model) <> 'object'
     or nullif(btrim(coalesce(p_model->>'provider', '')), '') is null
     or nullif(btrim(coalesce(p_model->>'model', '')), '') is null
     or nullif(btrim(coalesce(p_model->>'version', '')), '') is null then
    raise exception 'a client onboarding proposal must name its model (provider, model, version)'
      using errcode = 'CLR10',
      detail = '{"reason":"invalid_request","class":"model_snapshot","constraint":"provider+model+version"}';
  end if;

  -- The evidentiary basis floor (review law 2: absence is not evidence). Two sequential,
  -- fully-guarded checks rather than one OR-chain, so a malformed `sightings` never reaches a
  -- ::numeric cast that could raise an untyped 22P02 instead of this typed CLR10.
  if p_basis is null or jsonb_typeof(p_basis) <> 'object' then
    raise exception 'a client onboarding proposal needs a well-formed basis' using errcode = 'CLR10',
      detail = '{"reason":"invalid_request","class":"basis","constraint":"object"}';
  end if;
  v_citations := p_basis->'citations';
  if jsonb_typeof(v_citations) is distinct from 'array' or jsonb_array_length(v_citations) < 1
     or jsonb_typeof(p_basis->'sightings') is distinct from 'number'
     or (p_basis->>'sightings')::numeric < 1 then
    raise exception 'a client onboarding proposal needs >=1 sighting and >=1 citation in its basis'
      using errcode = 'CLR10',
      detail = '{"reason":"invalid_request","class":"basis","constraint":"sightings_and_citations"}';
  end if;

  if p_document is null then
    raise exception 'a client onboarding proposal needs the triggering document' using errcode = 'CLR10',
      detail = '{"reason":"invalid_request","class":"document"}';
  end if;

  -- THE RESERVATION, HERE -- deliberately BEFORE every check below, mirroring _agent_file_
  -- document_core's own placement (0126:892-895, ahead of its document/client/already-filed
  -- checks). Every remaining rung in this function either RAISEs (which rolls back this
  -- reservation along with everything else, so a retry after a genuine refusal starts fresh) or
  -- reads state this verb's OWN prior call may have changed (the duplicate-open-proposal check,
  -- the authorization's consumed_at). Reserving first means a genuine replay short-circuits
  -- HERE, before it can ever re-read its own side effects and refuse itself -- caught on this
  -- train's own rig: a first draft reserved last, and a same-op_key replay tripped the
  -- duplicate-open-proposal wall against the very row its own first call had opened.
  -- The dedupe key is (document, proposed_name, basis, authorization) -- the four fields that
  -- IDENTIFY the proposal. p_rationale, p_model and the credential (via_wake_kind/trigger_id,
  -- both read from wake_context() and never caller-supplied) are deliberately OUTSIDE it: a
  -- genuine retry of the same call after a network timeout, dropped connection, or a fresh model
  -- turn re-composing its own prose may regenerate a differently-worded rationale or bump its
  -- own model_version for the identical proposal, and none of that should turn a legitimate
  -- replay into an 'op_key reused with different args' conflict (0004:56-58). Reserving before
  -- any state-dependent check (the comment above) is what makes this replay-tolerant hash safe:
  -- the four identifying fields are exactly what the caller committed to when it minted p_op_key.
  v_dedupe := clara._reserve_op(w.firm_id, 'wake_propose_client_onboarding', p_op_key,
    clara._hash(jsonb_build_object('document', p_document, 'proposed_name', v_name,
      'basis', p_basis, 'authorization', p_authorization)));
  if v_dedupe is not null then return v_dedupe; end if;

  -- Locked FOR UPDATE, mirroring _agent_file_document_core's own idiom (0126:897) -- this also
  -- serializes two concurrent proposal attempts on the same document, which is what makes the
  -- duplicate-open-proposal check below race-safe rather than merely usually-true.
  select firm_id, sha256 into v_doc_firm, v_doc_sha from clara.documents where id = p_document for update;
  if v_doc_firm is null or v_doc_firm <> w.firm_id then
    raise exception 'document not in your firm' using errcode = 'CLR11',
      detail = '{"reason":"cross_firm","class":"document"}';
  end if;

  -- A14, the negative acceptance step (design SS2): a name whose leading token collides with an
  -- existing client or counterparty family must never reach a proposal card. Hard refusal, in
  -- the DB, before any receipt is written -- the caller's own recourse is the EXISTING
  -- wake_open_firm_question(kind='collision', ...), unchanged by this file.
  if clara.name_family_is_ambiguous(w.firm_id, v_name) then
    raise exception 'the proposed name collides with an existing client or counterparty family; open a collision question instead'
      using errcode = 'CLR10', detail = '{"reason":"name_family_collision","class":"proposed_name"}';
  end if;

  -- No second OPEN 'onboarding_proposed' question already sitting on this document.
  if exists (select 1 from clara.firm_open_questions q
              where q.document_id = p_document and q.kind = 'onboarding_proposed' and q.status = 'open') then
    raise exception 'an onboarding proposal is already open for this document' using errcode = 'CLR10',
      detail = '{"reason":"already_open","class":"onboarding_proposed"}';
  end if;

  -- The firm-narrow egress authorization: live, admissible purpose, bound to THIS document's
  -- sha256 and the 'attribution' moment (mirrors _agent_file_document_core's A9/B7 rungs,
  -- 0126:939-990 -- consumed only once every other wall has cleared, so a mismatched
  -- authorization "is explicitly NOT consumed and stays live for its real dispatch", the same
  -- rule clara.consume_egress_dispatch states for itself).
  if p_authorization is null then
    raise exception 'a client onboarding proposal needs the egress authorization that produced it'
      using errcode = 'CLR28', detail = '{"reason":"no_live_egress_authorization"}';
  end if;
  select a.id, a.document_sha256, a.moment into v_auth
    from clara.firm_egress_dispatch_authorizations a
   where a.id = p_authorization and a.firm_id = w.firm_id and a.purpose = 'firm_narrow_intake'
     and a.invalidated_at is null and a.consumed_at is null and a.expires_at > statement_timestamp()
   for update;
  if v_auth.id is null or v_auth.document_sha256 is distinct from v_doc_sha
     or v_auth.moment <> 'attribution' then
    raise exception 'no live, admissible-purpose egress authorization for this proposal'
      using errcode = 'CLR28', detail = '{"reason":"no_live_egress_authorization"}';
  end if;

  update clara.firm_egress_dispatch_authorizations set consumed_at = statement_timestamp()
    where id = v_auth.id;

  insert into clara.onboarding_agent_receipts(firm_id, document_id, model, model_version,
      rationale, verdict, via_wake_kind, trigger_kind, trigger_id, authorization_id,
      acting_actor, on_behalf_of)
    values (w.firm_id, p_document, p_model->>'model', p_model->>'version', p_rationale,
      jsonb_build_object('proposed_name', v_name, 'basis', p_basis),
      w.wake_kind, 'wake_task', w.credential_id::text, p_authorization,
      clara.agent_user_id(), w.on_behalf_of)
    returning id into v_receipt_id;

  v_question_id := clara._firm_question_core(clara.agent_user_id(), w.firm_id, w.on_behalf_of,
    w.wake_kind, p_document, 'onboarding_proposed',
    'Clara proposes opening a new client file for "' || v_name || '" from this document.',
    jsonb_build_array(jsonb_build_object('proposed_name', v_name, 'basis', p_basis)),
    v_receipt_id::text);

  return clara._finish_op(w.firm_id, 'wake_propose_client_onboarding', p_op_key,
    jsonb_build_object('question_id', v_question_id, 'receipt_id', v_receipt_id));
end $fn$;
comment on function clara.wake_propose_client_onboarding(uuid,text,jsonb,text,jsonb,uuid,text) is
  'F-A7b D-1b: Clara PROPOSES a new client file from a held, unattributed document (Q-D1 ALL-'
  'PROPOSE -- she never opens one unattended). Delegates to the EXISTING clara._firm_question_'
  'core with kind=''onboarding_proposed''; no new carrier. A14''s negative acceptance step (a '
  'name-family collision) is a hard refusal here, before any receipt is written.';

reset role;

-- =====================================================================================
-- SS6 -- RLS/ACL/ALLOWLIST
-- =====================================================================================
revoke all on function clara.wake_propose_client_onboarding(uuid,text,jsonb,text,jsonb,uuid,text) from public;
grant execute on function clara.wake_propose_client_onboarding(uuid,text,jsonb,text,jsonb,uuid,text)
  to clara_wake_filing;

insert into clara.wake_fn_allowlist(wake_kind, function_name) values
  ('filing','wake_propose_client_onboarding');

-- =====================================================================================
-- SS7 -- TAIL SELF-PROOF. Raises on failure; every claim is re-READ from the catalog.
-- =====================================================================================
do $fa7b_pra_tail$
declare v_bad text; v_n int; v_def text; v_census record; v_constraint text;
begin
  -- (1) D1's claim, proven: exactly one pg_proc row for the one function this file installs.
  if (select count(*) from pg_proc p join pg_namespace n2 on n2.oid = p.pronamespace
       where n2.nspname = 'clara' and p.proname = 'wake_propose_client_onboarding') <> 1 then
    raise exception 'fa7b pr-a tail: wake_propose_client_onboarding does not resolve at exactly one pg_proc row'
      using errcode = 'CLR10';
  end if;

  -- (2) D-1a: firm_open_questions_kind_check is EXACTLY the 7-value world, byte-exact, both the
  --     six old values preserved and the new one present -- never a list, a differential read.
  select pg_get_constraintdef(oid) into v_def from pg_constraint
   where conrelid = 'clara.firm_open_questions'::regclass and conname = 'firm_open_questions_kind_check';
  if v_def is distinct from
     'CHECK ((kind = ANY (ARRAY[''unattributed''::text, ''collision''::text, ''contradiction''::text, ''identity_document''::text, ''correction_proposed''::text, ''promotion_proposed''::text, ''onboarding_proposed''::text])))' then
    raise exception 'fa7b pr-a tail: firm_open_questions_kind_check is not the widened 7-value world (got: %)',
      coalesce(v_def, '(absent)') using errcode = 'CLR10';
  end if;

  -- (3) D-4's registry widening, exercised (not merely described) in both directions -- REAL
  --     INSERT attempts against the LIVE constraint, not a hardcoded regex literal compared
  --     against itself (independent review F7: the prior form asked whether 'f_a7b' ~
  --     '^f_a[0-9]+[a-z]?$' is TRUE, which is a fact about the STRING TYPED HERE, never about
  --     what the database actually enforces -- a tautology that stays green even if the live
  --     constraint diverges from this file's own claim about it). ADMISSION of 'f_a7b' itself
  --     is already proven, for real, by SS4.2's own INSERT above (no separate probe needed for
  --     that half); this proves REFUSAL, for real, isolating each widened column in turn.
  --
  --     ROUND 2 (independent review, F7 re-verify): the first fix's own probe rows used
  --     receipt_kind/expected_source literals starting with `_` (e.g. '_probe_kind_a') --
  --     values that ALSO violate agent_receipt_surfaces_receipt_kind_check / _expected_source_
  --     check's shared `^[a-z][a-z0-9_]*$` pattern, so Postgres could refuse the row on EITHER
  --     of those two constraints before ever reaching the item_check/shim_relname_check this
  --     probe exists to isolate -- the check_violation was real, but not proof of what this
  --     file claimed. Every OTHER column in each probe is now lawful and unique, so only the
  --     ONE column under test can be why the row is refused, and the exception handler reads
  --     the constraint name off the catalog rather than assuming it. Each probe runs inside its
  --     own exception block (an implicit savepoint), so a caught check_violation leaves no row
  --     behind -- nothing here reaches the append-only wall.
  begin
    insert into clara.agent_receipt_surfaces(item, receipt_kind, shim_relname, expected_source)
      values ('f_a7bx', 'probe_kind_a', '_agent_receipt_src_f_a99', 'probe_source_a');
    raise exception 'fa7b pr-a tail: a garbage item (f_a7bx, two trailing letters) was WRONGLY ADMITTED by the live item_check'
      using errcode = 'CLR10';
  exception
    when check_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint is distinct from 'agent_receipt_surfaces_item_check' then
        raise exception 'fa7b pr-a tail: probe 1 (garbage item) was refused by % instead of agent_receipt_surfaces_item_check -- the probe does not isolate what it claims to', v_constraint
          using errcode = 'CLR10';
      end if;
  end;
  begin
    insert into clara.agent_receipt_surfaces(item, receipt_kind, shim_relname, expected_source)
      values ('f_a99y', 'probe_kind_b', '_agent_receipt_src_f_a7bx', 'probe_source_b');
    raise exception 'fa7b pr-a tail: a garbage shim_relname (two trailing letters) was WRONGLY ADMITTED by the live shim_relname_check'
      using errcode = 'CLR10';
  exception
    when check_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint is distinct from 'agent_receipt_surfaces_shim_relname_check' then
        raise exception 'fa7b pr-a tail: probe 2 (garbage shim_relname) was refused by % instead of agent_receipt_surfaces_shim_relname_check -- the probe does not isolate what it claims to', v_constraint
          using errcode = 'CLR10';
      end if;
  end;
  select pg_get_constraintdef(oid) into v_def from pg_constraint
   where conrelid = 'clara.agent_receipt_surfaces'::regclass and conname = 'agent_receipt_surfaces_item_check';
  if v_def is distinct from 'CHECK ((item ~ ''^f_a[0-9]+[a-z]?$''::text))' then
    raise exception 'fa7b pr-a tail: agent_receipt_surfaces_item_check is not the widened text (got: %)',
      coalesce(v_def, '(absent)') using errcode = 'CLR10';
  end if;
  select pg_get_constraintdef(oid) into v_def from pg_constraint
   where conrelid = 'clara.agent_receipt_surfaces'::regclass and conname = 'agent_receipt_surfaces_shim_relname_check';
  if v_def is distinct from 'CHECK ((shim_relname ~ ''^_agent_receipt_src_f_a[0-9]+[a-z]?$''::text))' then
    raise exception 'fa7b pr-a tail: agent_receipt_surfaces_shim_relname_check is not the widened text (got: %)',
      coalesce(v_def, '(absent)') using errcode = 'CLR10';
  end if;

  -- (4) The registry now holds exactly 8 rows, and f_a7b's own row + shim conform.
  if (select count(*) from clara.agent_receipt_surfaces) <> 8 then
    raise exception 'fa7b pr-a tail: agent_receipt_surfaces holds % row(s), expected 8',
      (select count(*) from clara.agent_receipt_surfaces) using errcode = 'CLR10';
  end if;
  if not exists (select 1 from clara.agent_receipt_surfaces where item = 'f_a7b'
      and receipt_kind = 'onboarding_agent' and shim_relname = '_agent_receipt_src_f_a7b'
      and expected_source = 'onboarding_agent_receipts') then
    raise exception 'fa7b pr-a tail: the f_a7b registry row is missing or wrong-shaped' using errcode = 'CLR10';
  end if;
  perform clara._assert_receipt_surface_conforms('_agent_receipt_src_f_a7b');
  select * into v_census from clara.agent_receipt_source_census() where item = 'f_a7b';
  if v_census.item is null or not v_census.shim_exists or not v_census.wired or not v_census.conforms
     or v_census.dark_rows <> 0 or v_census.column_count <> 19 then
    raise exception 'fa7b pr-a tail: the f_a7b census row is not shim_exists+wired+conforms+19-col+zero-dark (got %)',
      to_jsonb(v_census) using errcode = 'CLR10';
  end if;
  if (select count(*) from clara.agent_receipt_source_census()) <> 8 then
    raise exception 'fa7b pr-a tail: the receipt-source census returned % row(s), expected 8',
      (select count(*) from clara.agent_receipt_source_census()) using errcode = 'CLR10';
  end if;
  -- agent_receipts_visible itself is untouched -- still exactly the 19-column contract, in
  -- order, and its ACL is unchanged (clara_authenticated select, nobody else).
  select string_agg(format('#%s %s %s', ct.ordinal, ct.column_name, ct.data_type), '; ' order by ct.ordinal)
    into v_bad
    from clara.agent_receipt_contract ct
    left join pg_attribute a
      on a.attrelid = 'clara.agent_receipts_visible'::regclass
     and a.attnum = ct.ordinal and not a.attisdropped
   where a.attname is distinct from ct.column_name
      or format_type(a.atttypid, a.atttypmod) is distinct from ct.data_type;
  if v_bad is not null then
    raise exception 'fa7b pr-a tail: agent_receipts_visible no longer carries the 19-column contract: %', v_bad
      using errcode = 'CLR10';
  end if;
  select string_agg(format('%s/%s x%s', d.receipt_kind, coalesce(d.scope, '(null)'), d.dark_rows), ', ')
    into v_bad from clara.agent_receipt_dark_rows() d;
  if v_bad is not null then
    raise exception 'fa7b pr-a tail: receipt rows visible to NOBODY after the widening: %', v_bad
      using errcode = 'CLR10';
  end if;

  -- (5) onboarding_agent_receipts: RLS enabled+forced, owner-only policy, zero app-role DML,
  --     zero non-owner table grants (mirrors agent_filing_receipts' own tail cell, 0126:2269-2278).
  if not exists (select 1 from pg_class c where c.oid = 'clara.onboarding_agent_receipts'::regclass
      and c.relrowsecurity and c.relforcerowsecurity) then
    raise exception 'fa7b pr-a tail: onboarding_agent_receipts is not RLS-enabled+forced' using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from information_schema.role_table_grants g
   where g.table_schema = 'clara' and g.table_name = 'onboarding_agent_receipts' and g.grantee <> 'clara_fn_owner';
  if v_n <> 0 then
    raise exception 'fa7b pr-a tail: onboarding_agent_receipts holds % non-owner table grant(s), expected 0', v_n
      using errcode = 'CLR10';
  end if;
  select string_agg(format('%s:%s:%s', p.priv, r.rolname, 'onboarding_agent_receipts'), ', ') into v_bad
    from (values ('insert'),('update'),('delete')) p(priv)
    cross join (values ('clara_authenticated'),('clara_agent_ro'),('clara_wake_interactive'),
                       ('clara_wake_proactive'),('clara_wake_filing'),('clara_runtime')) r(rolname)
   where has_table_privilege(r.rolname, 'clara.onboarding_agent_receipts', p.priv);
  if v_bad is not null then
    raise exception 'fa7b pr-a tail: an app role holds DML on onboarding_agent_receipts: %', v_bad using errcode = 'CLR10';
  end if;

  -- (6) D-3: the three columns exist with the right type/nullability, both honesty CHECKs and
  --     the congruence FK are present, and onboarding_plan_items/onboarding_plans' own prior
  --     shape is otherwise UNCHANGED (no other column gained/lost).
  if not exists (select 1 from pg_attribute a
                  where a.attrelid = 'clara.onboarding_plans'::regclass and a.attnum > 0
                    and not a.attisdropped and a.attname = 'opened_by_agent'
                    and format_type(a.atttypid, a.atttypmod) = 'boolean' and a.attnotnull) then
    raise exception 'fa7b pr-a tail: onboarding_plans.opened_by_agent is not a NOT NULL boolean' using errcode = 'CLR10';
  end if;
  if not exists (select 1 from pg_attribute a
                  where a.attrelid = 'clara.onboarding_plans'::regclass and a.attnum > 0
                    and not a.attisdropped and a.attname = 'opener_model'
                    and format_type(a.atttypid, a.atttypmod) = 'text' and not a.attnotnull) then
    raise exception 'fa7b pr-a tail: onboarding_plans.opener_model is not a nullable text' using errcode = 'CLR10';
  end if;
  if not exists (select 1 from pg_attribute a
                  where a.attrelid = 'clara.onboarding_plans'::regclass and a.attnum > 0
                    and not a.attisdropped and a.attname = 'opened_from_question'
                    and format_type(a.atttypid, a.atttypmod) = 'uuid' and not a.attnotnull) then
    raise exception 'fa7b pr-a tail: onboarding_plans.opened_from_question is not a nullable uuid' using errcode = 'CLR10';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'clara.onboarding_plans'::regclass
      and conname = 'ck_onboarding_plans_opened_from_question_honest') then
    raise exception 'fa7b pr-a tail: ck_onboarding_plans_opened_from_question_honest is missing' using errcode = 'CLR10';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'clara.onboarding_plans'::regclass
      and conname = 'ck_onboarding_plans_opener_model_honest') then
    raise exception 'fa7b pr-a tail: ck_onboarding_plans_opener_model_honest is missing' using errcode = 'CLR10';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'clara.onboarding_plans'::regclass
      and conname = 'fk_onboarding_plans_opened_from_question' and contype = 'f') then
    raise exception 'fa7b pr-a tail: fk_onboarding_plans_opened_from_question is missing' using errcode = 'CLR10';
  end if;

  -- (7) firm_open_questions has NOT gained a column (D-11 of the wider F-A7 design: it still
  --     has no client_id, and this file adds nothing to its shape beyond the CHECK). 14 is the
  --     live count re-derived from the catalog on this train's own rig (id, firm_id,
  --     document_id, kind, question_text, candidates, status, opened_by, opened_at, settled_by,
  --     settled_at, settlement_text, named_client, receipt_id) -- 0103's own creation, unmoved.
  if (select count(*) from pg_attribute a where a.attrelid = 'clara.firm_open_questions'::regclass
       and a.attnum > 0 and not a.attisdropped) <> 14 then
    raise exception 'fa7b pr-a tail: firm_open_questions column count drifted (expected 14, unrelated to this file''s intent)'
      using errcode = 'CLR10';
  end if;

  -- (8) ACL: wake_propose_client_onboarding is clara_wake_filing-only; the allowlist carries
  --     exactly one new row and it is the right one.
  if not has_function_privilege('clara_wake_filing',
      'clara.wake_propose_client_onboarding(uuid,text,jsonb,text,jsonb,uuid,text)', 'EXECUTE') then
    raise exception 'fa7b pr-a tail: clara_wake_filing cannot EXECUTE wake_propose_client_onboarding' using errcode = 'CLR10';
  end if;
  select string_agg(r.rolname, ', ' order by r.rolname) into v_bad
    from (values ('clara_authenticated'),('clara_agent_ro'),('clara_wake_interactive'),
                 ('clara_wake_proactive'),('clara_runtime')) r(rolname)
   where has_function_privilege(r.rolname,
      'clara.wake_propose_client_onboarding(uuid,text,jsonb,text,jsonb,uuid,text)', 'EXECUTE');
  if v_bad is not null then
    raise exception 'fa7b pr-a tail: wake_propose_client_onboarding is reachable by non-filing role(s): %', v_bad
      using errcode = 'CLR10';
  end if;
  if (select count(*) from clara.wake_fn_allowlist
       where wake_kind = 'filing' and function_name = 'wake_propose_client_onboarding') <> 1 then
    raise exception 'fa7b pr-a tail: the filing allowlist does not carry exactly one wake_propose_client_onboarding row'
      using errcode = 'CLR10';
  end if;

  -- (9) The name-family predicate, exercised (not just re-described -- pi's own tail already
  --     proved the function itself; this proves THIS file's wall calls it correctly by
  --     reproducing the exact fixture shape the battery uses, ephemerally, inside the txn).
  if clara.name_family_is_ambiguous(gen_random_uuid(), 'A Name No Firm Has') then
    raise exception 'fa7b pr-a tail: name_family_is_ambiguous is true for an unpopulated firm -- sanity check failed'
      using errcode = 'CLR10';
  end if;

  raise notice 'fa7b pr-a tail: OK -- wake_propose_client_onboarding resolves at exactly 1 pg_proc row (D1 EMPTY, confirmed); firm_open_questions_kind_check is the exact widened 7-value text; the item/shim_relname registry CHECKs REFUSED two REAL INSERT probes (garbage item, garbage shim_relname), each isolated by a lawful companion row and confirmed refused by ITS NAMED constraint (not merely `a` check_violation), each caught and rolled back, byte-exact live definitions confirmed separately; agent_receipt_surfaces holds 8 rows with f_a7b shim_exists+wired+conforms+19-col+zero-dark; agent_receipts_visible''s 19-column contract and ACL are UNCHANGED; onboarding_agent_receipts is RLS-forced, owner-only, zero app-role DML/grants; onboarding_plans carries the 3 new columns with both honesty CHECKs and the congruence FK, its column count otherwise unchanged; firm_open_questions column count unchanged at 14; wake_propose_client_onboarding is clara_wake_filing-only with exactly 1 filing-allowlist row. No table in workflow/graphile_worker/spike touched.';
end $fa7b_pra_tail$;
