-- 0218_firm_setup — #648 (journey A5): RESUME FIRM SETUP FROM THE FACTS THAT ARE ACTUALLY MISSING.
-- =====================================================================================
-- Spec of record: issue #648, the wave brief
-- `docs/plan/active/refresh-wave-2026-09-15/brief-648.md` and the wave rulings in
-- `DECISIONS.md` (§0 D8/D10, §1.2 migration numbers, §1.5 the append-only knowledge catalog,
-- §2 #648). Domain words: CONTEXT.md — "Firm setup", "Firm profile fact", "Firm knowledge
-- default".
--
-- WHAT THIS FILE ADDS, IN ONE SENTENCE. A firm's own onboarding plan — the `scope_kind='firm'`
-- row `clara._create_firm_core` has opened for every firm since 0145 and that NO human door has
-- ever been able to write — gains a code-populated CATALOGUE of the facts a firm must state
-- about itself, four HUMAN doors (reconciling seed / answer / defer / commit), one READ, and a
-- partial unique index that makes "one open firm plan per firm" a database fact.
--
-- WHAT IT DOES NOT DO, each with its authority:
--   * it RECUTS NOTHING. There is no `create or replace` in this file and no `alter table` on a
--     relation it did not create, beyond the one new index. `clara.update_onboarding_plan` stays
--     byte-identical and clara_runtime-ONLY (0017:5125-5135); `clara.commit_client_onboarding`
--     stays client-forcing (0017:2751-2771); `clara.capture_knowledge` is CALLED, never touched.
--     Therefore NO pre-image sha256 pin is owed by this file (brief §3 "Prestate / tail / pins";
--     gap-648 "Pinned function recut: NONE"). §J re-measures that claim against the committed
--     catalog rather than asserting it.
--   * it MINTS NO KNOWLEDGE KEY and NO `knowledge_plan_item_map` ROW (wave rule §1.5; D10). Both
--     relations are append-only (0192:185, :286-289) and a mistake there is permanent. The firm's
--     own IDENTITY facts (registered name, SSM number, registered address, TIN, MIA number) stay
--     PLAN ITEMS with an author and a revision snapshot, and get no knowledge record at all.
--   * it DOES NOT CALL `clara.promote_plan_answers_to_knowledge`. That door's promotion loop joins
--     `clara.knowledge_plan_item_map` on ONE GLOBAL `item_key` namespace with no scope
--     discriminator (0192:1685, :279-284), so a firm row mapped there would promote out of every
--     committed CLIENT plan as well. Avoiding it is also why this file recuts nothing.
--   * it GRANTS NOTHING to `clara_runtime`, `clara_agent_ro` or either wake role. Every name here
--     is `clara_authenticated`-only, because every one of them is gated by `clara._human_ctx` and
--     a `_human_ctx`-gated verb granted to a role that carries no JWT claims is a DARK grant
--     (0192 §H's rule). This file registers no wake allowlist row either.
--
-- =====================================================================================
-- SEEDING IS A RECONCILIATION, NEVER A BLIND INSERT — the single most load-bearing decision here.
--
-- A firm's plan arrives in this door in one of TWO states:
--   * EMPTY — the CLAIM path. `clara.claim_paid_firm` calls `clara._create_firm_core`
--     (0186:1652), which inserts the plan and its revision-1 snapshot and NO items
--     (0145:492-494).
--   * ALREADY FULL — the pre-admission path. `clara.create_firm` delegates to the same core
--     (0145:529) and the `firmInterview_v3` run then writes up to fourteen answered items into
--     that SAME plan in one `clara.update_onboarding_plan` call
--     (packages/runtime/workflows/firmInterview.v3.ts:163-166).
-- `uq_onboarding_plan_items_key unique(plan_id,item_key)` (0017:1056) turns a blind insert into a
-- raw 23505 on the second path. So `clara.seed_firm_setup_plan` INSERTS ONLY THE CATALOGUE ROWS
-- THAT ARE MISSING and touches no existing item at all — not its answer, not its answered_by, not
-- its answered_at, not its state, not even its question text. That is what makes AC1's "resume
-- without re-asking accepted facts" true of the plan a real firm actually has.
--
-- =====================================================================================
-- THE COMMIT GATE READS THE CATALOGUE, NOT THE PLAN ROW'S OWN `required_for_commit`.
--
-- A `firmInterview_v3`-filled plan carries TWO items this journey does not own —
-- `bookkeeper_email` (`requiredForCommit:true`; member provisioning, #625,
-- interview.v2.questions.ts:39) and `first_client_onboarding` (a todo appended unconditionally by
-- `buildFirmPlanItemsV2`, :120-129; #649's journey) — and the catalogue below deliberately
-- excludes both. If the commit gate swept plan rows by their own flag, #625's item would block
-- #648's commit for ever, and a lane that does not own an item would be refusing on its behalf.
-- So `clara.commit_firm_setup` asks exactly one question: is every CATALOGUE row that is
-- `required_for_commit` now answered, resolved or deferred? Foreign plan items are neither read
-- nor judged, and `clara.get_firm_setup` does not render them.
--
-- =====================================================================================
-- THE PARTIAL UNIQUE INDEX IS A CORRECTNESS FIX TO A LIVE DOOR, not merely a guard for new ones.
--
-- `uq_onboarding_plans_one_open` is built on `(firm_id, client_id) where state='open'`
-- (0017:1038-1039). A firm plan carries `client_id` NULL, NULLs are DISTINCT in a unique index,
-- and so that index has never deduplicated firm plans at all. Meanwhile `clara.claim_paid_firm`'s
-- replay arm resolves the plan with a bare `select p.id into v_plan ... where firm_id=... and
-- scope_kind='firm'` — no `LIMIT`, no `STRICT` (0186:1555-1557) — and PL/pgSQL's `SELECT INTO`
-- takes the FIRST row silently. `uq_onboarding_plans_one_open_firm` closes the shape that made
-- that silent. §0.6 proves no live firm violates it BEFORE the index is created; a loud failure
-- there is the correct outcome, because it would mean a real firm already holds two open plans.
--
-- RESIDUAL, STATED RATHER THAN HIDDEN: the index predicate is `state='open'` (the brief's own
-- wording), so it does not by itself forbid one COMMITTED firm plan beside one OPEN one. That
-- shape is unreachable today because `clara._create_firm_core` is the ONLY writer of a firm-scope
-- plan and runs exactly once per firm (§0.5(c) re-measures that there is exactly one such writer).
--
-- =====================================================================================
-- EVERY (errcode, detail.reason) PAIR THIS FILE RAISES AT RUNTIME.
--
-- clara.seed_firm_setup_plan          CLR04 (via _human_ctx)   below admin
--                                     CLR10                    op_key is required
--                                     CLR11                    this firm has no firm-scope plan
--                                     CLR10 'firm_setup_not_open'
-- clara.answer_firm_setup_item        CLR04 (via _human_ctx)   below admin, or below the key's floor
--                                     CLR10                    op_key / item_key / answer required
--                                     CLR10 'firm_setup_item_unknown'      not a catalogue row
--                                     CLR11                    plan absent OR not this firm's
--                                     CLR10 'firm_setup_not_open'
--                                     CLR06 'stale_plan'       the CAS lost
--                                     CLR10 'firm_setup_item_not_seeded'
--                                     CLR10 'firm_setup_answer_invalid'
--                                     …plus, for a catalogue row carrying a knowledge_key, every
--                                     refusal clara.capture_knowledge itself raises, VERBATIM
--                                     (knowledge_key_unknown, knowledge_value_invalid,
--                                     knowledge_already_live, knowledge_trust_insufficient, …).
-- clara.defer_firm_setup_item         as above, plus
--                                     CLR10 'firm_setup_item_required'
--                                     CLR10 'firm_setup_reason_required'
-- clara.commit_firm_setup             as above, plus
--                                     CLR10 'required_items_outstanding' (detail names them)
-- clara.get_firm_setup                CLR04 (via _human_ctx)   below admin
--
-- THE CAS REFUSAL IS CLR06 + detail.reason='stale_plan', WORD FOR WORD 0017:2655-2659's. It is
-- deliberately NOT `CLR31`: that function's own comment records the adjudication — "plan-CAS
-- rides the CLR06 revision class; CLR31/'stale_plan' is the SEED family's (K14)".
--
-- NO EXISTENCE ORACLE (the 0021 rule): `clara.answer_firm_setup_item` and its two siblings refuse
-- an absent plan id and another firm's REAL plan id with the byte-identical CLR11, and they do so
-- BEFORE taking any row lock on it.
--
-- ROLLBACK is a NEW append-only migration. An applied migration is never edited or deleted
-- (packages/db/README.md).
-- =====================================================================================

set local statement_timeout = '5min';   -- runner rule: the first executable statement

-- =====================================================================================
-- §0 PRESTATE. Every claim this file makes about what it is building on, measured before it
-- builds. Nothing here writes.
-- =====================================================================================
do $i648_pre$
declare n text; v_n int; v_txt text;
begin
  -- 0.1 · the relations this file writes into or references.
  foreach n in array array[
    'clara.onboarding_plans','clara.onboarding_plan_items','clara.onboarding_plan_revisions',
    'clara.knowledge_keys','clara.knowledge_records','clara.firm_memberships','clara.users',
    'clara.client_fact_keys','clara.wake_fn_allowlist',
    'clara.event_types','clara.trigger_taxonomy','clara.taxonomy_active'
  ] loop
    if to_regclass(n) is null then
      raise exception '#648 prestate: relation absent: %', n using errcode='CLR10';
    end if;
  end loop;

  -- 0.2 · the functions the doors call, in exact regprocedure form.
  foreach n in array array[
    'clara._human_ctx(integer)',
    'clara.role_rank(text)',
    'clara._reserve_op(uuid,text,text,bytea)',
    'clara._finish_op(uuid,text,text,jsonb)',
    'clara._hash(jsonb)',
    'clara._audit(uuid,uuid,uuid,text,text,uuid,jsonb)',
    'clara._append_event(uuid,text,uuid,uuid,uuid,text,uuid,uuid,uuid,jsonb)',
    'clara._onboarding_plan_snapshot(uuid)',
    'clara._tf_append_only()',
    'clara._tf_no_truncate()',
    'clara._knowledge_floor(text,text)',
    'clara._knowledge_row_json(clara.knowledge_records)',
    'clara.capture_knowledge(text,jsonb,text,text,text,uuid,text,jsonb,date,date,jsonb)'
  ] loop
    if to_regprocedure(n) is null then
      raise exception '#648 prestate: prerequisite function absent: %', n using errcode='CLR10';
    end if;
  end loop;

  -- 0.3 · THE THREE FIRM-DEFAULTABLE KEYS (D8). This file captures knowledge for exactly these
  -- and for nothing else, so their absence is a stop rather than a silently narrower catalogue.
  foreach n in array array['default_currency','reporting_framework','accounting_basis'] loop
    if not exists (select 1 from clara.knowledge_keys k where k.knowledge_key = n) then
      raise exception '#648 prestate: knowledge key % is absent (migration 0192 has not been applied)', n
        using errcode='CLR10';
    end if;
  end loop;
  -- …and the two keys the catalogue reads option lists FROM without capturing them (D8 keeps
  -- entity_type and turnover_band as CLIENT identity keys; the firm setup surface still renders
  -- their vocabulary rather than inventing a second one).
  foreach n in array array['entity_type','turnover_band','default_currency'] loop
    if not exists (select 1 from clara.knowledge_keys k
                    where k.knowledge_key = n and jsonb_typeof(k.allowed_values) = 'array') then
      raise exception '#648 prestate: knowledge key % carries no allowed_values array to derive options from', n
        using errcode='CLR10';
    end if;
  end loop;

  -- 0.4 · NOTHING OF THIS FILE IS ALREADY PRESENT.
  if to_regclass('clara.firm_setup_keys') is not null then
    raise exception '#648 prestate: clara.firm_setup_keys already exists' using errcode='CLR10';
  end if;
  foreach n in array array[
    'seed_firm_setup_plan','answer_firm_setup_item','defer_firm_setup_item',
    'commit_firm_setup','get_firm_setup','_firm_setup_plan','_assert_firm_setup_answer',
    '_firm_setup_bump'
  ] loop
    select count(*)::int into v_n from pg_proc p
     where p.pronamespace='clara'::regnamespace and p.proname = n;
    if v_n <> 0 then
      raise exception '#648 prestate: clara.% already exists (% bodies)', n, v_n using errcode='CLR10';
    end if;
  end loop;

  -- 0.5 · THE PLAN MODEL THIS FILE ASSUMES, measured rather than trusted.
  --   (a) `clara.onboarding_plan_items` still has NO `reason` column, and its `deferred` arm still
  --       names only answered_by/answered_at — which is what lets a deferral park its reason
  --       INSIDE `answer` (see §E.3's own note and the red-first probe in
  --       packages/db/tests/firm-setup.test.mjs, cell p648.defer.reason).
  if exists (select 1 from information_schema.columns
              where table_schema='clara' and table_name='onboarding_plan_items' and column_name='reason') then
    raise exception '#648 prestate: clara.onboarding_plan_items gained a `reason` column -- §E.3 must land the deferral reason there instead'
      using errcode='CLR10';
  end if;
  select pg_get_constraintdef(c.oid) into v_txt from pg_constraint c
   where c.conrelid='clara.onboarding_plan_items'::regclass
     and c.conname='ck_onboarding_plan_items_answer';
  if v_txt is null or position('deferred' in v_txt) = 0 then
    raise exception '#648 prestate: ck_onboarding_plan_items_answer is absent or no longer carries a deferred arm'
      using errcode='CLR10';
  end if;
  --   (b) `item_kind` admits exactly must_ask / capture / todo — which is why the seed MAPS a
  --       catalogue row of kind `education` onto `todo` rather than inserting a fourth value.
  select string_agg(pg_get_constraintdef(c.oid), ' | ') into v_txt from pg_constraint c
   where c.conrelid='clara.onboarding_plan_items'::regclass
     and pg_get_constraintdef(c.oid) like '%item_kind%';
  if v_txt is null or position('must_ask' in v_txt) = 0 or position('capture' in v_txt) = 0
     or position('todo' in v_txt) = 0 then
    raise exception '#648 prestate: clara.onboarding_plan_items.item_kind no longer admits must_ask/capture/todo'
      using errcode='CLR10';
  end if;
  --   (c) EXACTLY ONE writer of a firm-scope plan row, and it is clara._create_firm_core. The
  --       index in §B relies on this for the residual its header states.
  select count(*)::int into v_n from pg_proc p
   where p.pronamespace='clara'::regnamespace
     and position('insert into clara.onboarding_plans(' in p.prosrc) > 0
     and position('''firm''' in p.prosrc) > 0;
  if v_n <> 1 then
    raise exception '#648 prestate: % function bodies insert a firm-scope onboarding plan (expected exactly 1: clara._create_firm_core)', v_n
      using errcode='CLR10';
  end if;
  --   (d) the runtime-only item writer keeps its exact ACL. §J re-reads the SAME string, so a
  --       widening anywhere between here and the tail is a loud failure rather than a silence.
  select coalesce(array_to_string(p.proacl, ','), '<null>') into v_txt from pg_proc p
   where p.oid = 'clara.update_onboarding_plan(uuid,uuid,jsonb,uuid,text)'::regprocedure;
  if v_txt is distinct from 'clara_fn_owner=X/clara_fn_owner,clara_runtime=X/clara_fn_owner' then
    raise exception '#648 prestate: clara.update_onboarding_plan has an unexpected ACL {%} -- this file must neither widen nor depend on a widened one', v_txt
      using errcode='CLR10';
  end if;

  -- 0.6 · NO LIVE FIRM ALREADY VIOLATES THE INDEX §B CREATES. A loud failure here is the correct
  -- outcome: it would mean a real firm holds two open firm-scope plans and
  -- clara.claim_paid_firm's bare `select ... into` has been resolving one of them arbitrarily.
  select count(*)::int into v_n from (
    select 1 from clara.onboarding_plans
     where state='open' and scope_kind='firm'
     group by firm_id having count(*) > 1) d;
  if v_n <> 0 then
    raise exception '#648 prestate: % firm(s) already hold more than one OPEN firm-scope onboarding plan -- uq_onboarding_plans_one_open_firm cannot be created until that is resolved by hand', v_n
      using errcode='CLR10';
  end if;

  raise notice '#648 prestate: clean -- the three plan relations, the knowledge catalog and every helper this file calls are present; the three firm-defaultable knowledge keys (default_currency / reporting_framework / accounting_basis) exist and entity_type / turnover_band / default_currency carry the option arrays the catalogue derives from; no object of this file exists yet; onboarding_plan_items still has no reason column, still admits exactly must_ask/capture/todo and still carries a deferred arm naming only answered_by/answered_at; exactly one function body inserts a firm-scope plan (clara._create_firm_core); clara.update_onboarding_plan is still EXECUTE-reachable by clara_runtime and nobody else; and no firm holds more than one open firm-scope plan.';
end
$i648_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §A — THE CATALOGUE. "The facts a firm must state about itself" is DATA the owner can read and
-- ratify, in a table, rather than a literal buried in a function body — the same posture 0192 §A.3
-- takes for the promotion map, and the reason the brief asks for a catalogue at all.
--
-- WHERE THE ROWS COME FROM. `FIRM_SEGMENTS_V2` (packages/runtime/workflows/interview.v2.questions
-- .ts:33-47) — the live pre-admission firm interview's own inventory — MINUS exactly two entries:
--   * `bookkeeper_email` (:39) — `requiredForCommit:true`, but it is a MEMBER PROVISIONING act and
--     #625 owns member provisioning. A setup checklist that asked for it would be inviting a
--     colleague through the wrong door.
--   * `first_client_onboarding` (:120-129) — appended unconditionally by `buildFirmPlanItemsV2`,
--     and it is #649's journey, not a fact about the firm.
-- Nothing is invented: every `item_key`, every `required_for_commit` flag and every `item_kind`
-- is the segment's own (`defaultItem`, interview.v1.core.ts:292-301, maps requiredForCommit to
-- must_ask / capture). The `question` text is the segment's, with the CHAT-ONLY instruction
-- ("reply skip", the inline option list a Select renders anyway) lifted out into `note`, which
-- carries the segment's verbatim wording beside the reason the row exists.
--
-- THE ANSWER SHAPES ARE THE SURFACE'S CONTRACT, and they are catalogue data for the same reason
-- the questions are: a web form has to know whether a fact is a sentence, a bounded choice or a
-- month, and burying that in TypeScript would put the vocabulary in a second place.
--   text            a JSON string on one line
--   long_text       a JSON string over several lines (the registered address)
--   choice          a JSON string that must be one of `answer_options`
--   month           a JSON number 1-12 (the interview's own validateFye shape)
--   labelled_object a JSON object carrying exactly `answer_field` -> a non-empty string, which is
--                   the SUBSET of the interview's own folded object that a human statement can
--                   honestly fill in on this surface (see the residual note on `framework`).
-- `answer_options` is DERIVED, never re-typed: the three enumerations below are read out of
-- `clara.knowledge_keys.allowed_values` at seed time, so the firm setup surface and the knowledge
-- register can never offer two different vocabularies for the same fact.
--
-- THE GRANT MATRIX IS WRITTEN ONCE AND IS SELF-CONSISTENT. SELECT goes to `clara_authenticated`
-- and to NOBODY else. 0192:296-297's idiom additionally grants `clara_agent_ro` and
-- `clara_runtime`, and copying it here would contradict this file's own no-runtime-no-agent rule.
-- =====================================================================================
create table clara.firm_setup_keys (
  item_key            text        primary key check (btrim(item_key) <> ''),
  -- D8: NON-NULL for exactly the three FIRM-DEFAULTABLE keys. A row carrying one is CAPTURED as a
  -- firm-scope knowledge record when it is answered; a row carrying NULL is a plan item and
  -- nothing more. D10 keeps every identity fact in the second class deliberately.
  knowledge_key       text        references clara.knowledge_keys(knowledge_key),
  item_kind           text        not null
                        check (item_kind in ('must_ask','capture','todo','education')),
  required_for_commit boolean     not null,
  -- PER-KEY ELEVATION IS CATALOGUE DATA, never a second code branch. The doors floor at admin and
  -- then re-check THIS value, exactly as clara._knowledge_floor takes the higher of the
  -- scope-implied floor and the key's own `knowledge_keys.min_role` (0192:996-1008).
  min_role            text        not null default 'admin'
                        check (min_role in ('bookkeeper','admin','owner')),
  group_key           text        not null check (btrim(group_key) <> ''),
  answer_shape        text        not null
                        check (answer_shape in ('text','long_text','choice','month','labelled_object')),
  answer_options      jsonb       not null default '[]'::jsonb
                        check (jsonb_typeof(answer_options) = 'array'),
  answer_field        text        check (answer_field is null or btrim(answer_field) <> ''),
  question            text        not null check (btrim(question) <> ''),
  note                text        not null check (btrim(note) <> ''),
  sort_order          int         not null,
  created_at          timestamptz not null default now(),
  constraint ck_firm_setup_keys_labelled check (
    (answer_shape = 'labelled_object') = (answer_field is not null)),
  constraint ck_firm_setup_keys_choice check (
    answer_shape <> 'choice' or jsonb_array_length(answer_options) > 0)
);

-- APPEND-ONLY, the 0192:286-289 idiom verbatim. A catalogue the owner ratifies is not a table a
-- later migration silently edits: a changed question or a retired item is a NEW row in a NEW
-- migration, and the estate can always read what was asked at the time an answer was given.
create trigger t_firm_setup_keys_append_only before update or delete on clara.firm_setup_keys
  for each row execute function clara._tf_append_only();
create trigger t_firm_setup_keys_no_truncate before truncate on clara.firm_setup_keys
  for each statement execute function clara._tf_no_truncate();

alter table clara.firm_setup_keys enable row level security;
alter table clara.firm_setup_keys force row level security;
create policy p_firm_setup_keys_owner on clara.firm_setup_keys
  for all to clara_fn_owner using (true) with check (true);
-- A GLOBAL catalog (no firm dimension — product vocabulary, not tenant data). The read is
-- unconditional, and it is granted to the HUMAN lane only: see the header note above.
create policy p_firm_setup_keys_read on clara.firm_setup_keys
  for select to clara_authenticated using (true);
grant select on clara.firm_setup_keys to clara_authenticated;

-- A.1 — THE TWELVE ROWS. FIRM_SEGMENTS_V2's thirteen, minus `bookkeeper_email`.
insert into clara.firm_setup_keys
    (item_key, knowledge_key, item_kind, required_for_commit, min_role, group_key,
     answer_shape, answer_options, answer_field, question, note, sort_order) values

  ('legal_name', null, 'must_ask', true, 'admin', 'identity',
   'text', '[]'::jsonb, null,
   'What is the firm''s registered legal name?',
   'FIRM_SEGMENTS_V2 legal_name (interview.v2.questions.ts:34). D10: the firm''s own identity '
   || 'facts stay plan items with an author and a revision snapshot; no knowledge key is minted '
   || 'for them in this wave, because clara.knowledge_keys is append-only and a mistake there is '
   || 'permanent.', 10),

  ('ssm', null, 'must_ask', true, 'admin', 'identity',
   'text', '[]'::jsonb, null,
   'What is the firm''s SSM registration number?',
   'FIRM_SEGMENTS_V2 ssm, the shared registrationSegment (interview.v2.segments.ts:88-105). '
   || 'HONEST BOUNDARY: the Malaysian registration GRAMMAR that validates this answer in the '
   || 'interview lives in a frozen runtime module (lib/malaysian-registration.mjs), so this '
   || 'surface records the number EXACTLY as the practitioner types it and claims no format '
   || 'verification. D10 keeps it a plan item.', 20),

  ('entity_type', null, 'must_ask', true, 'admin', 'identity',
   'choice',
   (select k.allowed_values from clara.knowledge_keys k where k.knowledge_key = 'entity_type'),
   null,
   'What is the firm''s entity type?',
   'FIRM_SEGMENTS_V2 entity_type (interview.v2.questions.ts:36); question text from '
   || 'entityTypeQuestion (interview.v2.segments.ts:72-73), whose inline option list the Select '
   || 'renders instead. The options are READ from clara.knowledge_keys.allowed_values for the '
   || 'entity_type key rather than re-typed. D8 keeps entity_type a CLIENT identity key: it is '
   || 'not firm-defaultable, so this row carries no knowledge_key and answering it captures '
   || 'nothing.', 30),

  ('address', null, 'must_ask', true, 'admin', 'identity',
   'long_text', '[]'::jsonb, null,
   'What is the firm''s registered address?',
   'FIRM_SEGMENTS_V2 address (interview.v2.questions.ts:37). D10: plan item only.', 40),

  ('mia', null, 'capture', false, 'admin', 'identity',
   'text', '[]'::jsonb, null,
   'What is the firm''s MIA registration number?',
   'FIRM_SEGMENTS_V2 mia (interview.v2.questions.ts:38), verbatim: "What is the firm''s MIA '
   || 'registration number? (optional -- reply skip if none)". OPTIONAL and SKIPPABLE in the '
   || 'interview (requiredForCommit:false, skippable:true), and optional here: it may be deferred '
   || 'with a reason and the checklist still completes.', 50),

  ('turnover', null, 'must_ask', true, 'admin', 'tax',
   'choice',
   (select k.allowed_values from clara.knowledge_keys k where k.knowledge_key = 'turnover_band'),
   null,
   'What is the firm''s annual turnover band?',
   'FIRM_SEGMENTS_V2 turnover (interview.v2.questions.ts:40), verbatim: "What is the firm''s '
   || 'annual turnover band? (<RM1M / RM1M-5M / RM5M-25M / RM25M-100M / RM100M+)". The options '
   || 'are READ from clara.knowledge_keys.allowed_values for turnover_band. A BAND is not a '
   || 'measured turnover figure and no statutory threshold is decided from it here. D8 keeps '
   || 'turnover_band a CLIENT identity key, so this row captures nothing.', 60),

  ('tin', null, 'capture', false, 'admin', 'tax',
   'text', '[]'::jsonb, null,
   'What is the firm''s MyInvois TIN?',
   'FIRM_SEGMENTS_V2 tin (interview.v2.questions.ts:41), verbatim: "What is the firm''s MyInvois '
   || 'TIN? (required unless turnover < RM1M -- reply skip only if exempt)". The interview gates '
   || 'this on the turnover answer through tinValidatorGatedByTurnover; THIS catalogue has no '
   || 'applicability predicate, so the row is carried as NOT required for commit and the gate is '
   || 'stated in this note rather than enforced. D10: plan item only.', 70),

  ('fye', null, 'must_ask', true, 'admin', 'tax',
   'month', '[]'::jsonb, null,
   'Which month is the firm''s financial year-end?',
   'FIRM_SEGMENTS_V2 fye (interview.v2.questions.ts:42), verbatim: "Which month is the firm''s '
   || 'financial year-end? (1-12)". A whole month 1-12, the interview''s own validateFye shape. '
   || 'D8 keeps financial_year_end_month a CLIENT identity key, so this row captures nothing; '
   || 'the firm''s own fiscal-year RECORDS live in the close model, not here.', 80),

  ('mpers_eligibility', null, 'capture', false, 'admin', 'accounting',
   'labelled_object', '["eligible","ineligible"]'::jsonb, 'determination',
   'Is the firm eligible to apply MPERS under the CA 2016 s.244 private-entity test?',
   'FIRM_SEGMENTS_V2 eligibilitySegment (interview.v2.segments.ts:372-377). THE INTERVIEW ASKS '
   || 'THIS OF A SDN BHD ALONE (appliesTo: prior.entity_type = ''sdn_bhd''); this catalogue has '
   || 'no applicability predicate, so the row is seeded for every firm as NOT required for '
   || 'commit and may be deferred with a reason -- the conditionality is a named residual, not a '
   || 'silent one. The statutory screen itself, verbatim (interview.v2.frameworks.ts:265-272): '
   || '"Does ANY of the following apply to the company? -- it is required to prepare or lodge '
   || 'financial statements under securities or banking law (i.e. under an SC- or '
   || 'BNM-administered Act); it is a subsidiary, associate or jointly-controlled entity of an '
   || 'entity in the point above; it is a management company under the Interest Schemes Act 2016, '
   || 'or an entity specified as related to one. This is the CA 2016 s.244 private-entity test: '
   || '"no" means MPERS is available; "yes" means MFRS applies." The two determinations are the '
   || 'interview''s own (MpersEligibility, interview.v2.frameworks.ts:263).', 90),

  ('framework', 'reporting_framework', 'must_ask', true, 'admin', 'accounting',
   'labelled_object', '[]'::jsonb, 'framework_label',
   'On which reporting framework are the firm''s financial statements prepared?',
   'FIRM_SEGMENTS_V2 frameworkSegment (interview.v2.segments.ts:229-239). D8: FIRM-DEFAULTABLE, '
   || 'so answering it captures a firm-scope clara.knowledge_records row under the '
   || 'reporting_framework key -- an authority-bearing POLICY key, admitted from an ASSERTED '
   || 'source only (0192:940-946). RESIDUAL, STATED: the interview folds a richer object '
   || '({framework_code, framework_label, ...}) over an option table that lives in a frozen '
   || 'runtime module (interview.v2.frameworks.ts), so THIS surface records the framework the '
   || 'practitioner STATES under the interview''s own framework_label key and resolves no '
   || 'framework_code. Nothing in the estate reads that code today (0192''s own catalog '
   || 'description: "DESCRIPTIVE in this slice -- no posting or presentation code reads this '
   || 'row").', 100),

  ('accounting_basis', 'accounting_basis', 'must_ask', true, 'admin', 'accounting',
   'labelled_object', '[]'::jsonb, 'accounting_basis_label',
   'On what basis are the firm''s accounts prepared? (accrual / cash receipts-and-payments / modified cash / other)',
   'FIRM_SEGMENTS_V2 accountingBasisSegment (interview.v2.segments.ts:354-367), question text '
   || 'verbatim. D8: FIRM-DEFAULTABLE, so answering it captures a firm-scope knowledge record '
   || 'under the accounting_basis key -- also an authority-bearing POLICY key. Same stated '
   || 'residual as framework: the label the practitioner states is recorded under the '
   || 'interview''s own accounting_basis_label key; no basis CODE is resolved here.', 110),

  ('currency', 'default_currency', 'capture', false, 'admin', 'accounting',
   'choice',
   (select k.allowed_values from clara.knowledge_keys k where k.knowledge_key = 'default_currency'),
   null,
   'What is the firm''s default currency?',
   'FIRM_SEGMENTS_V2 currency (interview.v2.questions.ts:43), verbatim: "What is the firm''s '
   || 'default currency? (MYR default)". OPTIONAL and SKIPPABLE in the interview '
   || '(requiredForCommit:false, skippable:true) and optional here. D8: FIRM-DEFAULTABLE, so an '
   || 'ANSWER captures a firm-scope default_currency record; a DEFERRAL captures nothing. The '
   || 'options are READ from clara.knowledge_keys.allowed_values for default_currency, so the '
   || 'form can never offer a value the capture door would refuse.', 120);

reset role;

-- =====================================================================================
-- §B — THE PARTIAL UNIQUE INDEX. See the file header: this is a correctness fix to
-- clara.claim_paid_firm's live replay arm (0186:1555-1557), not merely a guard for the new doors.
-- §0.6 has already proven that no live firm violates it.
-- =====================================================================================
create unique index uq_onboarding_plans_one_open_firm
  on clara.onboarding_plans (firm_id)
  where state = 'open' and scope_kind = 'firm';

-- =====================================================================================
-- §C — EVENT TAXONOMY, one additive quadruple against the active version (the 0024 §B / 0192 §C
-- idiom). Registered BEFORE any door exists, because the events spine validates every
-- domain_events.event_type against clara.event_types and a door that emits an unregistered type
-- fails on its FIRST successful call.
--
-- client_scoped = FALSE on all four, and that is the whole of the decision: a firm setup act has
-- no client at all, and clara._tf_validate_domain_event FORBIDS a client_id on a non-client-scoped
-- type (0005:175-177), so this registration makes "a firm setup event never names a client" a
-- database fact rather than a convention.
--
-- EVERY DECISION IS `ignore`. The three wake-bound decisions each mint a wake_intents row that the
-- drain turns into a HELD clara.agent_tasks row — a task nothing in this slice would execute — and
-- `context_update` would advance a router checkpoint for a consumer that does not exist. The one
-- act here whose consequence a later read must see is the KNOWLEDGE capture, and that already
-- emits its own `knowledge.captured` through clara.capture_knowledge (0192 §C, also `ignore`).
-- =====================================================================================
set role clara_fn_owner;

with added(name, client_scoped, description, decision, note) as (values
  ('firm_setup.seeded', false, 'The firm setup checklist was reconciled against the catalogue', 'ignore',
    'a reconciliation adds only the catalogue rows a plan was missing; no consumer exists'),
  ('firm_setup.item_answered', false, 'A firm setup item was answered by a firm administrator', 'ignore',
    'the durable consequence of a firm-defaultable answer is its own knowledge.captured event'),
  ('firm_setup.item_deferred', false, 'An optional firm setup item was deferred with a stated reason', 'ignore',
    'a deferral records a decision not to answer; nothing downstream reads it in this slice'),
  ('firm_setup.committed', false, 'The firm setup checklist was committed', 'ignore',
    'the committed plan is itself the durable record; no wake and no checkpoint consumer exists')
), inserted_types as (
  insert into clara.event_types(name, client_scoped, description)
  select name, client_scoped, description from added
  returning name
)
insert into clara.trigger_taxonomy(version, event_type, decision, note)
select a.version, x.name, x.decision, x.note
from added x
join inserted_types i on i.name = x.name
cross join clara.taxonomy_active a;

reset role;

-- =====================================================================================
-- §D — THE PRIVATE CLOSURE. Three helpers, granted to nobody, reached only from the doors below.
-- =====================================================================================
set role clara_fn_owner;

-- D.1 — THE FIRM'S OWN PLAN. `clara._create_firm_core` opens exactly one `scope_kind='firm'` row
-- per firm (0145:492-494) and is the only writer of one (§0.5c), so this read is single-row by
-- construction; the ORDER BY is belt, not hope, and prefers an OPEN plan so a firm that has
-- already committed its setup still resolves to the row it committed. STABLE and unlocked: the
-- write doors take their own `for update` on the id this returns.
create function clara._firm_setup_plan(p_firm uuid) returns clara.onboarding_plans
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare r clara.onboarding_plans;
begin
  select * into r from clara.onboarding_plans
   where firm_id = p_firm and scope_kind = 'firm'
   order by (state = 'open') desc, created_at desc
   limit 1;
  return r;
end $$;
revoke all on function clara._firm_setup_plan(uuid) from public;

-- D.2 — THE ANSWER GRAMMAR, fail-closed exactly like clara._knowledge_assert_value (0192:668-725):
-- an answer shape this function cannot implement is REFUSED rather than stored unvalidated.
--
-- WHY IT VALIDATES AT ALL, given that clara.capture_knowledge validates again for the three
-- firm-defaultable keys: NINE of the twelve catalogue rows capture NOTHING (D8/D10), so for those
-- this is the only wall between a typed answer and the durable plan record. Validating all twelve
-- here and letting the capture door validate the three again is two belts, not a duplicated rule:
-- this one enforces the CATALOGUE's shape, that one enforces the KNOWLEDGE KEY's.
create function clara._assert_firm_setup_answer(p_item_key text, p_answer jsonb) returns void
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare k record; v_num numeric; v_txt text;
begin
  select * into k from clara.firm_setup_keys where item_key = p_item_key;
  if not found then
    raise exception 'unknown firm setup item %', p_item_key
      using errcode = 'CLR10', detail = '{"reason":"firm_setup_item_unknown"}';
  end if;
  if p_answer is null or jsonb_typeof(p_answer) = 'null' then
    raise exception 'firm setup item % needs an answer', p_item_key
      using errcode = 'CLR10',
        detail = jsonb_build_object('reason','firm_setup_answer_invalid','item_key',p_item_key)::text;
  end if;

  if k.answer_shape in ('text','long_text','choice') then
    if jsonb_typeof(p_answer) <> 'string' or btrim(p_answer #>> '{}') = '' then
      raise exception 'firm setup item % carries a non-empty JSON string, not %', p_item_key, jsonb_typeof(p_answer)
        using errcode = 'CLR10',
          detail = jsonb_build_object('reason','firm_setup_answer_invalid','item_key',p_item_key)::text;
    end if;
    if k.answer_shape = 'choice' and not (k.answer_options ? (p_answer #>> '{}')) then
      raise exception 'firm setup item % admits only its catalogue values, and % is not one of them',
        p_item_key, p_answer #>> '{}'
        using errcode = 'CLR10',
          detail = jsonb_build_object('reason','firm_setup_answer_invalid','item_key',p_item_key)::text;
    end if;

  elsif k.answer_shape = 'month' then
    if jsonb_typeof(p_answer) <> 'number' then
      raise exception 'firm setup item % carries a JSON number, not %', p_item_key, jsonb_typeof(p_answer)
        using errcode = 'CLR10',
          detail = jsonb_build_object('reason','firm_setup_answer_invalid','item_key',p_item_key)::text;
    end if;
    v_num := (p_answer #>> '{}')::numeric;
    if v_num is null or v_num <> trunc(v_num) or v_num < 1 or v_num > 12 then
      raise exception 'firm setup item % is a whole month 1-12, and % is not', p_item_key, p_answer::text
        using errcode = 'CLR10',
          detail = jsonb_build_object('reason','firm_setup_answer_invalid','item_key',p_item_key)::text;
    end if;

  elsif k.answer_shape = 'labelled_object' then
    -- EXACTLY the declared field and nothing else. A surface that quietly added a second key would
    -- be inventing a shape for a knowledge record whose catalog description names the interview's
    -- own object, and `shape_only` validation downstream would never notice.
    if jsonb_typeof(p_answer) <> 'object'
       or (select count(*) from jsonb_object_keys(p_answer)) <> 1
       or not (p_answer ? k.answer_field) then
      raise exception 'firm setup item % carries a JSON object of exactly one key, %', p_item_key, k.answer_field
        using errcode = 'CLR10',
          detail = jsonb_build_object('reason','firm_setup_answer_invalid','item_key',p_item_key)::text;
    end if;
    v_txt := p_answer ->> k.answer_field;
    if jsonb_typeof(p_answer -> k.answer_field) <> 'string' or v_txt is null or btrim(v_txt) = '' then
      raise exception 'firm setup item % needs a non-empty % value', p_item_key, k.answer_field
        using errcode = 'CLR10',
          detail = jsonb_build_object('reason','firm_setup_answer_invalid','item_key',p_item_key)::text;
    end if;
    if jsonb_array_length(k.answer_options) > 0 and not (k.answer_options ? v_txt) then
      raise exception 'firm setup item % admits only its catalogue values, and % is not one of them',
        p_item_key, v_txt
        using errcode = 'CLR10',
          detail = jsonb_build_object('reason','firm_setup_answer_invalid','item_key',p_item_key)::text;
    end if;

  else
    raise exception 'firm setup item % carries an answer shape (%) this door does not implement -- refusing to record an unvalidated answer',
      p_item_key, k.answer_shape
      using errcode = 'CLR10',
        detail = jsonb_build_object('reason','firm_setup_answer_invalid','item_key',p_item_key)::text;
  end if;
end $$;
revoke all on function clara._assert_firm_setup_answer(text, jsonb) from public;

-- D.3 — THE REVISION BUMP, one place so the four doors cannot drift into four dialects of the same
-- act: rotate the CAS token, advance the revision number, ACCUMULATE the actor into `contributors`
-- ([R2-F4] — every material maker, not merely the opener) and append the snapshot. Verbatim the
-- shape `clara.update_onboarding_plan` (0017:2693-2703) and `clara.resolve_onboarding_plan_item`
-- already use.
create function clara._firm_setup_bump(p_plan uuid, p_actor uuid) returns clara.onboarding_plans
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare r clara.onboarding_plans;
begin
  update clara.onboarding_plans set
      revision_token = gen_random_uuid(),
      revision_n = revision_n + 1,
      contributors = (select array_agg(distinct x.contributor order by x.contributor)
                        from unnest(contributors || array[p_actor]) as x(contributor)),
      updated_at = now()
    where id = p_plan
    returning * into r;
  insert into clara.onboarding_plan_revisions(plan_id, revision_n, snapshot)
    values (p_plan, r.revision_n, clara._onboarding_plan_snapshot(p_plan));
  return r;
end $$;
revoke all on function clara._firm_setup_bump(uuid, uuid) from public;

-- =====================================================================================
-- §E — THE FOUR HUMAN DOORS. Every one of them: owned by `clara_fn_owner`, SECURITY DEFINER,
-- `search_path` and `plan_cache_mode` pinned, PUBLIC revoked, EXECUTE to `clara_authenticated`
-- and to nobody else, floored at admin through `clara._human_ctx`, reserve-before-
-- mutable-validation through `_reserve_op`/`_finish_op` (0004:46's placement), one `clara._audit`
-- row and one registered `clara._append_event`.
-- =====================================================================================

-- E.1 — THE RECONCILING SEED. See the file header for why this is a reconciliation.
create function clara.seed_firm_setup_plan(p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp
  set plan_cache_mode = force_custom_plan as $door$
declare c record; p clara.onboarding_plans; v_dedupe jsonb; v_added int; v_total int; v_result jsonb;
begin
  c := clara._human_ctx(clara.role_rank('admin'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  p := clara._firm_setup_plan(c.firm);
  if p.id is null then
    raise exception 'this firm has no firm-scope onboarding plan' using errcode = 'CLR11';
  end if;
  select * into p from clara.onboarding_plans where id = p.id for update;
  -- RESERVE-BEFORE-MUTABLE-VALIDATION: after identity/authz and the target lookup, before the
  -- state gate. An exact retry replays this receipt rather than reconciling twice.
  v_dedupe := clara._reserve_op(c.firm, 'seed_firm_setup_plan', p_op_key,
    clara._hash(jsonb_build_object('plan', p.id)));
  if v_dedupe is not null then return v_dedupe; end if;
  if p.state <> 'open' then
    raise exception 'the firm setup plan is not open' using errcode = 'CLR10',
      detail = '{"reason":"firm_setup_not_open"}';
  end if;

  -- THE RECONCILIATION ITSELF. `not exists` rather than `on conflict do update`: an existing item
  -- must not be touched AT ALL, and an upsert would rewrite its question text even when it left
  -- the answer alone. `education` maps to `todo` because clara.onboarding_plan_items.item_kind
  -- admits three values and a fourth would be a CHECK violation (§0.5b).
  insert into clara.onboarding_plan_items(
      plan_id, firm_id, item_kind, item_key, question, answer, state, required_for_commit)
  select p.id, p.firm_id,
         case k.item_kind when 'education' then 'todo' else k.item_kind end,
         k.item_key, k.question, null, 'pending', k.required_for_commit
    from clara.firm_setup_keys k
   where not exists (select 1 from clara.onboarding_plan_items i
                      where i.plan_id = p.id and i.item_key = k.item_key)
   order by k.sort_order;
  get diagnostics v_added = row_count;
  select count(*)::int into v_total from clara.firm_setup_keys;

  p := clara._firm_setup_bump(p.id, c.actor);
  perform clara._audit(c.firm, c.actor, null, null, 'seed_firm_setup_plan', null,
    jsonb_build_object('plan', p.id, 'seeded', v_added, 'catalogue_total', v_total,
      'revision_n', p.revision_n, 'op_key', p_op_key));
  perform clara._append_event(c.firm, 'firm_setup.seeded', null, c.actor, null, null, null, null, null,
    jsonb_build_object('plan_id', p.id, 'seeded', v_added, 'catalogue_total', v_total,
      'revision_n', p.revision_n));
  v_result := jsonb_build_object('plan_id', p.id, 'revision_token', p.revision_token,
    'revision_n', p.revision_n, 'state', p.state, 'seeded', v_added, 'catalogue_total', v_total);
  return clara._finish_op(c.firm, 'seed_firm_setup_plan', p_op_key, v_result);
end $door$;
revoke all on function clara.seed_firm_setup_plan(text) from public;

-- E.2 — THE ANSWER DOOR. The HUMAN twin of the runtime-only `clara.update_onboarding_plan`, which
-- stays byte-identical and clara_runtime-only: two writers of one plan sharing one grant would be
-- two floors and two idempotency keys over the same rows.
--
-- THE CAS REFUSAL IS 0017:2655-2659's, word for word — CLR06 with detail.reason 'stale_plan'.
-- CLR31/'stale_plan' belongs to the SEED family (K14) and is deliberately not used here.
--
-- WHERE THE CATALOGUE ROW CARRIES A `knowledge_key`, THE SAME TRANSACTION CAPTURES THE FACT.
-- `clara.capture_knowledge` re-checks the caller's rank against `clara._knowledge_floor` (admin
-- for any firm-scope act), validates the value against the knowledge key's OWN catalog rule, and
-- refuses a second live row of the same (scope, key, applicability) with CLR10
-- `knowledge_already_live` naming the record — which is the designed refusal, not an accident: a
-- fact already on the register is CORRECTED through `clara.correct_knowledge`, never captured
-- twice. Its op_key is this door's, which is safe because `clara.op_receipts` is unique on
-- (firm_id, fn, op_key) and the two calls carry different `fn` values.
create function clara.answer_firm_setup_item(
    p_plan uuid, p_expected_revision uuid, p_item_key text, p_answer jsonb, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp
  set plan_cache_mode = force_custom_plan as $door$
declare
  c record; k record; p clara.onboarding_plans; i record; v_dedupe jsonb;
  v_key text; v_knowledge jsonb := null; v_result jsonb;
begin
  c := clara._human_ctx(clara.role_rank('admin'));
  v_key := nullif(btrim(p_item_key), '');
  if p_op_key is null or btrim(p_op_key) = '' or v_key is null then
    raise exception 'plan, item_key and op_key are required' using errcode = 'CLR10';
  end if;
  select * into k from clara.firm_setup_keys where item_key = v_key;
  if not found then
    raise exception 'unknown firm setup item %', v_key using errcode = 'CLR10',
      detail = '{"reason":"firm_setup_item_unknown"}';
  end if;
  -- PER-KEY ELEVATION, from catalogue DATA. The admin floor above is the lowest write floor; a
  -- row whose `min_role` is higher raises here, with no second rule anywhere in this file.
  perform clara._human_ctx(clara.role_rank(k.min_role));

  -- NO EXISTENCE ORACLE: the firm predicate is IN the lookup, so another firm's real plan id and
  -- a random uuid produce the identical CLR11 — and neither takes a row lock on a foreign plan.
  select * into p from clara.onboarding_plans
   where id = p_plan and firm_id = c.firm and scope_kind = 'firm' for update;
  if not found then
    raise exception 'firm setup plan not in your firm' using errcode = 'CLR11';
  end if;
  v_dedupe := clara._reserve_op(c.firm, 'answer_firm_setup_item', p_op_key,
    clara._hash(jsonb_build_object('plan', p_plan, 'revision', p_expected_revision,
      'item_key', v_key, 'answer', p_answer)));
  if v_dedupe is not null then return v_dedupe; end if;
  if p.state <> 'open' then
    raise exception 'the firm setup plan is not open' using errcode = 'CLR10',
      detail = '{"reason":"firm_setup_not_open"}';
  end if;
  if p.revision_token is distinct from p_expected_revision then
    -- AMB-9 adjudication, carried verbatim from 0017:2655-2659: plan-CAS rides the CLR06 revision
    -- class; CLR31/'stale_plan' is the SEED family's (K14).
    raise exception 'stale onboarding plan revision'
      using errcode = 'CLR06', detail = '{"reason":"stale_plan"}';
  end if;

  perform clara._assert_firm_setup_answer(v_key, p_answer);

  select * into i from clara.onboarding_plan_items
   where plan_id = p.id and item_key = v_key for update;
  if not found then
    raise exception 'firm setup item % is not on this plan yet -- reconcile the checklist first', v_key
      using errcode = 'CLR10', detail = '{"reason":"firm_setup_item_not_seeded"}';
  end if;

  update clara.onboarding_plan_items set
      state = 'answered', answer = p_answer,
      answered_by = c.actor, answered_at = now(), updated_at = now()
    where id = i.id;

  if k.knowledge_key is not null then
    v_knowledge := clara.capture_knowledge(
      p_knowledge_key => k.knowledge_key,
      p_value => p_answer,
      p_basis => 'Stated by a firm administrator in firm setup (item ' || v_key || ')',
      p_op_key => p_op_key,
      p_scope_kind => 'firm',
      p_client => null,
      p_source_kind => 'user_statement');
  end if;

  p := clara._firm_setup_bump(p.id, c.actor);
  -- The audit payload carries IDS AND KEYS, never the answer value: the plan item IS the record of
  -- record (0002's audit_log doctrine, 0192's own wording).
  perform clara._audit(c.firm, c.actor, null, null, 'answer_firm_setup_item', null,
    jsonb_build_object('plan', p.id, 'item_key', v_key, 'knowledge_key', k.knowledge_key,
      'knowledge_record_id', v_knowledge -> 'record_id', 'revision_n', p.revision_n,
      'op_key', p_op_key));
  perform clara._append_event(c.firm, 'firm_setup.item_answered', null, c.actor, null, null, null, null, null,
    jsonb_build_object('plan_id', p.id, 'item_key', v_key, 'knowledge_key', k.knowledge_key,
      'revision_n', p.revision_n));
  v_result := jsonb_build_object('plan_id', p.id, 'revision_token', p.revision_token,
    'revision_n', p.revision_n, 'item_key', v_key, 'state', 'answered',
    'answered_by', c.actor, 'knowledge', v_knowledge);
  return clara._finish_op(c.firm, 'answer_firm_setup_item', p_op_key, v_result);
end $door$;
revoke all on function clara.answer_firm_setup_item(uuid, uuid, text, jsonb, text) from public;

-- E.3 — THE DEFERRAL. "Optional education can be skipped and is never an accounting approval gate"
-- (#648 AC2) generalised: any catalogue row that is NOT `required_for_commit` may be set aside
-- with a stated reason, and the checklist still reaches `committed`.
--
-- WHERE THE REASON LANDS, and why it is not a new column. `clara.onboarding_plan_items` has no
-- `reason` column (§0.5a measures that), and its CHECK's deferred arm requires only
-- `answered_by`/`answered_at` — it places NO constraint on `answer` (0017:1063). So the reason
-- rides INSIDE `answer` as `{"deferred_reason": …}`, which survives a re-read, appears in the
-- revision snapshot, and needs no schema change to a merged migration. The battery drives this
-- door with a non-null answer on a deferred row as a red-first probe before the door exists
-- (packages/db/tests/firm-setup.test.mjs, cell p648.defer.reason).
--
-- A DEFERRAL IS NOT AN ERASER. An item already `answered` or `resolved` is refused: a fact a
-- practitioner has stated is corrected by answering again, or — where it reached the knowledge
-- register — withdrawn through `clara.withdraw_knowledge`. Letting a deferral overwrite it would
-- leave a live firm-scope knowledge record whose plan item says "skipped".
create function clara.defer_firm_setup_item(
    p_plan uuid, p_expected_revision uuid, p_item_key text, p_reason text, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp
  set plan_cache_mode = force_custom_plan as $door$
declare c record; k record; p clara.onboarding_plans; i record; v_dedupe jsonb;
        v_key text; v_reason text; v_result jsonb;
begin
  c := clara._human_ctx(clara.role_rank('admin'));
  v_key := nullif(btrim(p_item_key), '');
  v_reason := nullif(btrim(p_reason), '');
  if p_op_key is null or btrim(p_op_key) = '' or v_key is null then
    raise exception 'plan, item_key and op_key are required' using errcode = 'CLR10';
  end if;
  select * into k from clara.firm_setup_keys where item_key = v_key;
  if not found then
    raise exception 'unknown firm setup item %', v_key using errcode = 'CLR10',
      detail = '{"reason":"firm_setup_item_unknown"}';
  end if;
  perform clara._human_ctx(clara.role_rank(k.min_role));
  select * into p from clara.onboarding_plans
   where id = p_plan and firm_id = c.firm and scope_kind = 'firm' for update;
  if not found then
    raise exception 'firm setup plan not in your firm' using errcode = 'CLR11';
  end if;
  v_dedupe := clara._reserve_op(c.firm, 'defer_firm_setup_item', p_op_key,
    clara._hash(jsonb_build_object('plan', p_plan, 'revision', p_expected_revision,
      'item_key', v_key, 'reason', v_reason)));
  if v_dedupe is not null then return v_dedupe; end if;
  if p.state <> 'open' then
    raise exception 'the firm setup plan is not open' using errcode = 'CLR10',
      detail = '{"reason":"firm_setup_not_open"}';
  end if;
  if p.revision_token is distinct from p_expected_revision then
    raise exception 'stale onboarding plan revision'
      using errcode = 'CLR06', detail = '{"reason":"stale_plan"}';
  end if;
  if k.required_for_commit then
    raise exception 'firm setup item % is required and cannot be skipped', v_key
      using errcode = 'CLR10',
        detail = jsonb_build_object('reason','firm_setup_item_required','item_key',v_key)::text;
  end if;
  if v_reason is null then
    raise exception 'skipping firm setup item % needs a stated reason', v_key
      using errcode = 'CLR10',
        detail = jsonb_build_object('reason','firm_setup_reason_required','item_key',v_key)::text;
  end if;

  select * into i from clara.onboarding_plan_items
   where plan_id = p.id and item_key = v_key for update;
  if not found then
    raise exception 'firm setup item % is not on this plan yet -- reconcile the checklist first', v_key
      using errcode = 'CLR10', detail = '{"reason":"firm_setup_item_not_seeded"}';
  end if;
  if i.state in ('answered','resolved') then
    raise exception 'firm setup item % has already been answered -- correct it rather than skipping it', v_key
      using errcode = 'CLR10',
        detail = jsonb_build_object('reason','firm_setup_item_answered','item_key',v_key)::text;
  end if;

  update clara.onboarding_plan_items set
      state = 'deferred',
      answer = jsonb_build_object('deferred_reason', v_reason),
      answered_by = c.actor, answered_at = now(), updated_at = now()
    where id = i.id;

  p := clara._firm_setup_bump(p.id, c.actor);
  perform clara._audit(c.firm, c.actor, null, null, 'defer_firm_setup_item', null,
    jsonb_build_object('plan', p.id, 'item_key', v_key, 'revision_n', p.revision_n,
      'op_key', p_op_key));
  perform clara._append_event(c.firm, 'firm_setup.item_deferred', null, c.actor, null, null, null, null, null,
    jsonb_build_object('plan_id', p.id, 'item_key', v_key, 'revision_n', p.revision_n));
  v_result := jsonb_build_object('plan_id', p.id, 'revision_token', p.revision_token,
    'revision_n', p.revision_n, 'item_key', v_key, 'state', 'deferred',
    'deferred_reason', v_reason, 'answered_by', c.actor);
  return clara._finish_op(c.firm, 'defer_firm_setup_item', p_op_key, v_result);
end $door$;
revoke all on function clara.defer_firm_setup_item(uuid, uuid, text, text, text) from public;

-- E.4 — THE COMMIT. The firm plan has never had one: `clara.commit_client_onboarding` forces a
-- client (0017:2751-2771) and is untouched by this file. The gate reads the CATALOGUE, not the
-- plan row's own flag — see the file header for the two foreign items that would otherwise block
-- this journey's commit for ever.
create function clara.commit_firm_setup(p_plan uuid, p_expected_revision uuid, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp
  set plan_cache_mode = force_custom_plan as $door$
declare c record; p clara.onboarding_plans; v_dedupe jsonb; v_out jsonb; v_result jsonb;
begin
  c := clara._human_ctx(clara.role_rank('admin'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  select * into p from clara.onboarding_plans
   where id = p_plan and firm_id = c.firm and scope_kind = 'firm' for update;
  if not found then
    raise exception 'firm setup plan not in your firm' using errcode = 'CLR11';
  end if;
  v_dedupe := clara._reserve_op(c.firm, 'commit_firm_setup', p_op_key,
    clara._hash(jsonb_build_object('plan', p_plan, 'revision', p_expected_revision)));
  if v_dedupe is not null then return v_dedupe; end if;
  if p.state <> 'open' then
    raise exception 'the firm setup plan is not open' using errcode = 'CLR10',
      detail = '{"reason":"firm_setup_not_open"}';
  end if;
  if p.revision_token is distinct from p_expected_revision then
    raise exception 'stale onboarding plan revision'
      using errcode = 'CLR06', detail = '{"reason":"stale_plan"}';
  end if;

  select coalesce(jsonb_agg(k.item_key order by k.sort_order), '[]'::jsonb) into v_out
    from clara.firm_setup_keys k
    left join clara.onboarding_plan_items i
      on i.plan_id = p.id and i.item_key = k.item_key
   where k.required_for_commit
     and (i.id is null or i.state = 'pending');
  if jsonb_array_length(v_out) > 0 then
    raise exception 'the firm setup checklist still has required items outstanding'
      using errcode = 'CLR10',
        detail = jsonb_build_object('reason','required_items_outstanding','item_keys',v_out)::text;
  end if;

  update clara.onboarding_plans set
      state = 'committed', committed_at = now(), committed_by = c.actor
    where id = p.id;
  p := clara._firm_setup_bump(p.id, c.actor);

  perform clara._audit(c.firm, c.actor, null, null, 'commit_firm_setup', null,
    jsonb_build_object('plan', p.id, 'revision_n', p.revision_n, 'op_key', p_op_key));
  perform clara._append_event(c.firm, 'firm_setup.committed', null, c.actor, null, null, null, null, null,
    jsonb_build_object('plan_id', p.id, 'revision_n', p.revision_n));
  v_result := jsonb_build_object('plan_id', p.id, 'revision_token', p.revision_token,
    'revision_n', p.revision_n, 'state', 'committed', 'committed_at', p.committed_at,
    'committed_by', c.actor);
  return clara._finish_op(c.firm, 'commit_firm_setup', p_op_key, v_result);
end $door$;
revoke all on function clara.commit_firm_setup(uuid, uuid, text) from public;

-- =====================================================================================
-- §F — THE READ. THE JOURNEY'S ONE PRODUCTION-FACING READ. The web surface calls this and nothing
-- else: a parallel PostgREST `getRows` path over `clara.onboarding_plan_items` would mean AC7's
-- battery proves a door the browser never uses.
--
-- IT IS ADMIN-FLOORED, like the four doors. `/settings/setup` carries `minimumRole:'admin'` in the
-- navigation registry, so a bookkeeper never sees the section — and a DEEP LINK has to be refused
-- by the database rather than by the menu, which is what makes the denied face honest.
--
-- THE COUNTER IS REQUIRED-ANSWERED OVER REQUIRED-TOTAL, both counted HERE, from the catalogue and
-- the plan. Never a percentage, never a sum over facets that may overlap (#650 AC2), and never
-- the cross-batch aggregate progress #636 owns.
--
-- AUTHORITY IS JUDGED BY THE MEMBER'S CURRENT RANK, not the rank they held when they spoke: the
-- rule `clara.promote_plan_answers_to_knowledge` applies at 0192:1694-1703, applied here to a
-- read so that a downgraded or removed author is visible on the confirmed fact itself.
-- =====================================================================================
create function clara.get_firm_setup() returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp
  set plan_cache_mode = force_custom_plan as $read$
declare
  c record; p clara.onboarding_plans; v_items jsonb; v_out jsonb; v_facts jsonb;
  v_req_total int; v_req_done int; v_total int; v_unseeded int;
begin
  c := clara._human_ctx(clara.role_rank('admin'));
  p := clara._firm_setup_plan(c.firm);

  select coalesce(jsonb_agg(x.j order by x.sort_order), '[]'::jsonb) into v_items from (
    select jsonb_build_object(
        'item_key', k.item_key, 'kind', k.item_kind, 'group_key', k.group_key,
        'question', k.question, 'note', k.note,
        'required', k.required_for_commit, 'min_role', k.min_role,
        'answer_shape', k.answer_shape, 'answer_options', k.answer_options,
        'answer_field', k.answer_field, 'sort_order', k.sort_order,
        -- 'unseeded' is a REAL state of this surface, not a null: the catalogue row exists and the
        -- plan has no item for it yet, which is exactly what the reconciling seed fixes.
        'state', coalesce(i.state, 'unseeded'),
        'answer', i.answer, 'answered_by', i.answered_by,
        'answered_by_name', u.display_name, 'answered_at', i.answered_at,
        'knowledge_key', k.knowledge_key, 'knowledge_record_id', r.record_id) as j,
      k.sort_order as sort_order
      from clara.firm_setup_keys k
      left join clara.onboarding_plan_items i
        on p.id is not null and i.plan_id = p.id and i.item_key = k.item_key
      left join clara.users u on u.id = i.answered_by
      -- The record this ITEM produced, matched on the key and the UNCONDITIONAL applicability this
      -- door captures under. A #654 promotion that carries conditions of its own is a different
      -- row and is not claimed here.
      left join clara.knowledge_records r
        on k.knowledge_key is not null and r.firm_id = c.firm and r.scope_kind = 'firm'
           and r.knowledge_key = k.knowledge_key and r.superseded_at is null
           and r.state = 'live' and r.applies_when = '{}'::jsonb
  ) x;

  select coalesce(jsonb_agg(k.item_key order by k.sort_order), '[]'::jsonb) into v_out
    from clara.firm_setup_keys k
    left join clara.onboarding_plan_items i
      on p.id is not null and i.plan_id = p.id and i.item_key = k.item_key
   where k.required_for_commit and (i.id is null or i.state = 'pending');

  select count(*)::int into v_total from clara.firm_setup_keys;
  select count(*)::int into v_unseeded
    from clara.firm_setup_keys k
    left join clara.onboarding_plan_items i
      on p.id is not null and i.plan_id = p.id and i.item_key = k.item_key
   where i.id is null;
  select count(*)::int into v_req_total from clara.firm_setup_keys where required_for_commit;
  select count(*)::int into v_req_done
    from clara.firm_setup_keys k
    join clara.onboarding_plan_items i
      on p.id is not null and i.plan_id = p.id and i.item_key = k.item_key
   where k.required_for_commit and i.state in ('answered','resolved','deferred');

  select coalesce(jsonb_agg(y.j order by y.knowledge_key), '[]'::jsonb) into v_facts from (
    select clara._knowledge_row_json(r)
        || jsonb_build_object(
             'item_key', k.item_key,
             'question', k.question,
             'asserted_by_name', u.display_name,
             'key_description', kk.description,
             'value_shape', kk.value_shape,
             'validated_against', kk.validated_against,
             'authority_bearing', kk.authority_bearing,
             'asserted_by_active', (m.user_id is not null),
             'asserted_by_role', m.role,
             'authority_current', (m.user_id is not null and clara.role_rank(m.role)
               >= clara.role_rank(clara._knowledge_floor(r.knowledge_key, 'firm'))),
             -- 0192 §D.8: a firm default NEVER shadows a client's own live `clara.client_facts`
             -- row, because the legacy table is still what the estate reads for the five carried
             -- keys. The surface says so rather than letting the register look self-contradictory.
             'legacy_client_fact_key',
               exists (select 1 from clara.client_fact_keys f where f.fact_key = r.knowledge_key)
           ) as j,
        r.knowledge_key as knowledge_key
      from clara.knowledge_records r
      join clara.firm_setup_keys k on k.knowledge_key = r.knowledge_key
      left join clara.users u on u.id = r.asserted_by
      left join clara.knowledge_keys kk on kk.knowledge_key = r.knowledge_key
      left join clara.firm_memberships m
        on m.firm_id = r.firm_id and m.user_id = r.asserted_by and m.status = 'active'
     where r.firm_id = c.firm and r.scope_kind = 'firm' and r.superseded_at is null
  ) y;

  return jsonb_build_object(
    'plan_id', p.id, 'revision_token', p.revision_token, 'revision_n', p.revision_n,
    'state', p.state, 'committed_at', p.committed_at,
    'seeded', (p.id is not null and v_unseeded = 0),
    'catalogue_total', v_total,
    'counter', jsonb_build_object('required_answered', v_req_done, 'required_total', v_req_total),
    'items', v_items,
    'required_outstanding', v_out,
    'confirmed_facts', v_facts);
end $read$;
revoke all on function clara.get_firm_setup() from public;

reset role;

-- =====================================================================================
-- §G — THE EXACT EXECUTE MATRIX. `clara_authenticated` and nobody else, for every name this file
-- creates that any caller reaches. The three §D helpers stay ungranted: each is reachable only
-- from a door that has already resolved the caller's identity and floor.
--
-- NO `clara_runtime`, NO `clara_agent_ro`, NO WAKE ROLE, and no wake-allowlist row — every verb
-- here is `clara._human_ctx`-gated, and a `_human_ctx`-gated verb granted to a role that carries
-- no JWT claims is a DARK grant (0192 §H). §J re-reads the committed ACLs and fails if one ever
-- gains a second grantee.
-- =====================================================================================
grant execute on function
  clara.seed_firm_setup_plan(text),
  clara.answer_firm_setup_item(uuid, uuid, text, jsonb, text),
  clara.defer_firm_setup_item(uuid, uuid, text, text, text),
  clara.commit_firm_setup(uuid, uuid, text),
  clara.get_firm_setup()
to clara_authenticated;

-- =====================================================================================
-- §J TAIL CENSUS. Re-read the COMMITTED catalog and say what it found. Nothing here trusts this
-- file's own text: every claim is measured off pg_catalog, pg_policies, pg_index and the rows.
-- =====================================================================================
do $i648_tail$
declare
  n text; v_n int; v_txt text; v_posture text; v_missing text; v_expect text;
begin
  -- 1 · THE CATALOGUE RELATION: owner, forced RLS, the exact ACL, both append-only belts, and the
  -- two policies (owner ALL, human SELECT) and NOTHING ELSE.
  if to_regclass('clara.firm_setup_keys') is null then
    raise exception '#648 tail: clara.firm_setup_keys is absent' using errcode='CLR10';
  end if;
  select pg_get_userbyid(c.relowner) || ' | ' || c.relrowsecurity::text || ' | '
         || c.relforcerowsecurity::text || ' | ' || coalesce(array_to_string(c.relacl, ','), '<null>')
    into v_posture from pg_class c where c.oid = 'clara.firm_setup_keys'::regclass;
  if v_posture is distinct from
     'clara_fn_owner | true | true | clara_fn_owner=arwdDxtm/clara_fn_owner,clara_authenticated=r/clara_fn_owner' then
    raise exception '#648 tail: clara.firm_setup_keys has the wrong posture -- expected owner clara_fn_owner, RLS enabled AND forced, and SELECT to clara_authenticated ALONE (no clara_agent_ro, no clara_runtime); got {%}', v_posture
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_trigger t
   where t.tgrelid = 'clara.firm_setup_keys'::regclass and not t.tgisinternal
     and t.tgname in ('t_firm_setup_keys_append_only','t_firm_setup_keys_no_truncate');
  if v_n <> 2 then
    raise exception '#648 tail: clara.firm_setup_keys carries % of its 2 append-only belts', v_n using errcode='CLR10';
  end if;
  select string_agg(p.policyname || '->' || p.roles::text, ', ' order by p.policyname) into v_txt
    from pg_policies p where p.schemaname='clara' and p.tablename='firm_setup_keys';
  if v_txt is distinct from 'p_firm_setup_keys_owner->{clara_fn_owner}, p_firm_setup_keys_read->{clara_authenticated}' then
    raise exception '#648 tail: clara.firm_setup_keys has the wrong policy set {%}', v_txt using errcode='CLR10';
  end if;

  -- 2 · THE TWELVE ROWS, and the two deliberate exclusions BY NAME.
  select count(*)::int into v_n from clara.firm_setup_keys;
  if v_n <> 12 then
    raise exception '#648 tail: the firm setup catalogue holds % rows (expected 12)', v_n using errcode='CLR10';
  end if;
  foreach n in array array['bookkeeper_email','first_client_onboarding'] loop
    if exists (select 1 from clara.firm_setup_keys where item_key = n) then
      raise exception '#648 tail: the catalogue seeded %, which belongs to another ticket''s journey', n
        using errcode='CLR10';
    end if;
  end loop;
  select string_agg(item_key, ',' order by sort_order) into v_txt from clara.firm_setup_keys;
  if v_txt is distinct from 'legal_name,ssm,entity_type,address,mia,turnover,tin,fye,mpers_eligibility,framework,accounting_basis,currency' then
    raise exception '#648 tail: the catalogue is not FIRM_SEGMENTS_V2 minus the two exclusions; got {%}', v_txt
      using errcode='CLR10';
  end if;

  -- 3 · D8's WALL, measured: EXACTLY three rows carry a knowledge_key, and they are the three
  -- firm-defaultable keys. entity_type / turnover_band / financial_year_end_month are CLIENT
  -- identity keys and must carry NONE.
  select string_agg(item_key || '->' || knowledge_key, ',' order by item_key) into v_txt
    from clara.firm_setup_keys where knowledge_key is not null;
  if v_txt is distinct from 'accounting_basis->accounting_basis,currency->default_currency,framework->reporting_framework' then
    raise exception '#648 tail: the firm-defaultable set is {%}, not D8''s three (currency/framework/accounting_basis)', v_txt
      using errcode='CLR10';
  end if;

  -- 4 · THE OPTION LISTS ARE THE KNOWLEDGE CATALOG'S OWN, not a second vocabulary.
  for n, v_expect in
    select x.item_key, x.source_key from (values
      ('entity_type','entity_type'), ('turnover','turnover_band'), ('currency','default_currency')
    ) as x(item_key, source_key)
  loop
    if (select k.answer_options from clara.firm_setup_keys k where k.item_key = n)
       is distinct from
       (select kk.allowed_values from clara.knowledge_keys kk where kk.knowledge_key = v_expect) then
      raise exception '#648 tail: firm setup item % does not offer clara.knowledge_keys.allowed_values for %', n, v_expect
        using errcode='CLR10';
    end if;
  end loop;

  -- 5 · D10 / WAVE RULE §1.5: this file minted NO knowledge key and NO promotion-map row. Measured
  -- from `created_at`, which both relations default to `now()` — the TRANSACTION's start instant —
  -- so a row this migration inserted is exactly a row stamped at or after it.
  select count(*)::int into v_n from clara.knowledge_keys where created_at >= now();
  if v_n <> 0 then
    raise exception '#648 tail: % clara.knowledge_keys row(s) were minted in this transaction -- that catalog is append-only and belongs to #654', v_n
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from clara.knowledge_plan_item_map where created_at >= now();
  if v_n <> 0 then
    raise exception '#648 tail: % clara.knowledge_plan_item_map row(s) were minted in this transaction -- the promotion map has one GLOBAL item_key namespace and belongs to #654', v_n
      using errcode='CLR10';
  end if;

  -- 6 · THE FIVE GRANTED NAMES: owner, SECURITY DEFINER, pinned search_path AND plan_cache_mode,
  -- and the EXACT ACL (grantor included) — clara_authenticated and nobody else.
  for n in select unnest(array[
      'clara.seed_firm_setup_plan(text)',
      'clara.answer_firm_setup_item(uuid,uuid,text,jsonb,text)',
      'clara.defer_firm_setup_item(uuid,uuid,text,text,text)',
      'clara.commit_firm_setup(uuid,uuid,text)',
      'clara.get_firm_setup()'])
  loop
    if to_regprocedure(n) is null then
      raise exception '#648 tail: % does not resolve', n using errcode='CLR10';
    end if;
    select pg_get_userbyid(p.proowner) || ' | ' || p.prosecdef::text || ' | '
           || coalesce(array_to_string(p.proconfig, ','), '<none>') || ' | '
           || coalesce(array_to_string(p.proacl, ','), '<null>')
      into v_posture from pg_proc p where p.oid = n::regprocedure;
    if v_posture is distinct from
       'clara_fn_owner | true | search_path=clara, pg_temp,plan_cache_mode=force_custom_plan | clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner' then
      raise exception '#648 tail: % has the wrong posture -- expected owner clara_fn_owner, SECURITY DEFINER, search_path=clara, pg_temp, plan_cache_mode=force_custom_plan and EXECUTE to clara_authenticated only; got {%}', n, v_posture
        using errcode='CLR10';
    end if;
  end loop;

  -- 7 · THE THREE PRIVATE HELPERS: same owner/definer/search_path posture, and EXECUTE granted to
  -- NOBODY. A grant on any of them would be a caller able to bump a plan's revision, or to bypass
  -- the answer grammar, from outside the door that owns the act.
  for n in select unnest(array[
      'clara._firm_setup_plan(uuid)',
      'clara._assert_firm_setup_answer(text,jsonb)',
      'clara._firm_setup_bump(uuid,uuid)'])
  loop
    if to_regprocedure(n) is null then
      raise exception '#648 tail: % does not resolve', n using errcode='CLR10';
    end if;
    select pg_get_userbyid(p.proowner) || ' | ' || p.prosecdef::text || ' | '
           || coalesce(array_to_string(p.proconfig, ','), '<none>') || ' | '
           || coalesce(array_to_string(p.proacl, ','), '<null>')
      into v_posture from pg_proc p where p.oid = n::regprocedure;
    if v_posture is distinct from
       'clara_fn_owner | true | search_path=clara, pg_temp | clara_fn_owner=X/clara_fn_owner' then
      raise exception '#648 tail: private helper % has the wrong posture -- expected owner clara_fn_owner, SECURITY DEFINER, search_path=clara, pg_temp and EXECUTE for nobody; got {%}', n, v_posture
        using errcode='CLR10';
    end if;
  end loop;

  -- 8 · ZERO MACHINE REACH. Not one of this file's eight names is EXECUTE-reachable by the runtime
  -- role, the agent role or either wake role, and no wake allowlist row names one.
  v_missing := '';
  for n in select unnest(array[
      'clara.seed_firm_setup_plan(text)','clara.answer_firm_setup_item(uuid,uuid,text,jsonb,text)',
      'clara.defer_firm_setup_item(uuid,uuid,text,text,text)','clara.commit_firm_setup(uuid,uuid,text)',
      'clara.get_firm_setup()','clara._firm_setup_plan(uuid)',
      'clara._assert_firm_setup_answer(text,jsonb)','clara._firm_setup_bump(uuid,uuid)'])
  loop
    if has_function_privilege('clara_runtime', n::regprocedure, 'execute')
       or has_function_privilege('clara_agent_ro', n::regprocedure, 'execute')
       or has_function_privilege('clara_wake_interactive', n::regprocedure, 'execute')
       or has_function_privilege('clara_wake_proactive', n::regprocedure, 'execute') then
      v_missing := v_missing || ' ' || n;
    end if;
  end loop;
  if v_missing <> '' then
    raise exception '#648 tail: a machine role can EXECUTE:% -- every verb here is _human_ctx-gated and a grant to a claims-less role is a dark grant', v_missing
      using errcode='CLR10';
  end if;
  if exists (select 1 from clara.wake_fn_allowlist
              where function_name in ('seed_firm_setup_plan','answer_firm_setup_item',
                'defer_firm_setup_item','commit_firm_setup','get_firm_setup')) then
    raise exception '#648 tail: a wake allowlist row names a firm setup door' using errcode='CLR10';
  end if;
  if exists (select 1 from information_schema.role_table_grants
              where table_schema='clara' and table_name='firm_setup_keys'
                and grantee in ('clara_runtime','clara_agent_ro','clara_wake_interactive',
                                'clara_wake_proactive','PUBLIC')) then
    raise exception '#648 tail: a machine role holds a grant on clara.firm_setup_keys' using errcode='CLR10';
  end if;

  -- 9 · NOTHING THIS FILE DOES NOT OWN MOVED. The runtime-only item writer keeps the exact ACL
  -- §0.5d measured; the client commit door still forces a client; and neither was recut (this file
  -- contains no `create or replace` at all — measured here as "both still resolve at their
  -- original signatures with their original walls").
  select coalesce(array_to_string(p.proacl, ','), '<null>') into v_txt from pg_proc p
   where p.oid = 'clara.update_onboarding_plan(uuid,uuid,jsonb,uuid,text)'::regprocedure;
  if v_txt is distinct from 'clara_fn_owner=X/clara_fn_owner,clara_runtime=X/clara_fn_owner' then
    raise exception '#648 tail: clara.update_onboarding_plan''s ACL moved to {%} -- it stays runtime-only', v_txt
      using errcode='CLR10';
  end if;
  select p.prosrc into v_txt from pg_proc p
   where p.oid = 'clara.commit_client_onboarding(uuid,uuid,uuid,text,text)'::regprocedure;
  if v_txt is null or position('client onboarding is not open' in v_txt) = 0
     or position('p.client_id<>p_client' in v_txt) = 0 then
    raise exception '#648 tail: clara.commit_client_onboarding no longer forces a client -- this file must not have widened it'
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_proc p
   where p.pronamespace='clara'::regnamespace and p.proname='capture_knowledge';
  if v_n <> 1 then
    raise exception '#648 tail: clara.capture_knowledge has % bodies (expected exactly 1) -- this file CALLS it and must not have recut it', v_n
      using errcode='CLR10';
  end if;

  -- 10 · THE PARTIAL UNIQUE INDEX, read off pg_index rather than from this file's own DDL text.
  select pg_get_indexdef(i.indexrelid) into v_txt from pg_index i
   where i.indexrelid = 'clara.uq_onboarding_plans_one_open_firm'::regclass;
  if v_txt is null or position('UNIQUE' in v_txt) = 0
     or position('(firm_id)' in v_txt) = 0
     or position('WHERE ((state = ''open''::text) AND (scope_kind = ''firm''::text))' in v_txt) = 0 then
    raise exception '#648 tail: uq_onboarding_plans_one_open_firm is not the expected partial UNIQUE index; got {%}', v_txt
      using errcode='CLR10';
  end if;
  -- …and the 0017 index it complements is untouched, so nothing about CLIENT plans changed.
  select pg_get_indexdef(i.indexrelid) into v_txt from pg_index i
   where i.indexrelid = 'clara.uq_onboarding_plans_one_open'::regclass;
  if v_txt is null or position('(firm_id, client_id)' in v_txt) = 0 then
    raise exception '#648 tail: uq_onboarding_plans_one_open moved -- this file does not touch the client plan index'
      using errcode='CLR10';
  end if;

  -- 11 · THE PLAN TABLES GAINED NO COLUMN. This file adds an index and nothing else to a relation
  -- it did not create.
  select count(*)::int into v_n from information_schema.columns
   where table_schema='clara' and table_name='onboarding_plan_items';
  if v_n <> 13 then
    raise exception '#648 tail: clara.onboarding_plan_items has % columns (expected 0017''s 13) -- this file alters no merged relation', v_n
      using errcode='CLR10';
  end if;

  -- 12 · THE FOUR EVENTS are registered, non-client-scoped, and routed at the ACTIVE taxonomy
  -- version. A door that emitted an unregistered type would fail on its first successful call.
  select count(*)::int into v_n from clara.event_types
   where name in ('firm_setup.seeded','firm_setup.item_answered','firm_setup.item_deferred',
                  'firm_setup.committed') and client_scoped = false;
  if v_n <> 4 then
    raise exception '#648 tail: % of 4 firm setup event types are registered non-client-scoped', v_n using errcode='CLR10';
  end if;
  select count(*)::int into v_n from clara.trigger_taxonomy t cross join clara.taxonomy_active a
   where t.version = a.version and t.decision = 'ignore'
     and t.event_type in ('firm_setup.seeded','firm_setup.item_answered','firm_setup.item_deferred',
                          'firm_setup.committed');
  if v_n <> 4 then
    raise exception '#648 tail: % of 4 firm setup events are routed `ignore` at the active taxonomy version', v_n
      using errcode='CLR10';
  end if;

  -- 13 · THE DOORS RAISE THE PAIRS THE HEADER PROMISES. Literal probes over the committed bodies:
  -- the CAS is the CLR06 revision class with detail.reason 'stale_plan' (never the SEED family's
  -- CLR31), the commit gate names its outstanding items, and the deferral parks its reason inside
  -- `answer` rather than in a column that does not exist.
  foreach n in array array['answer_firm_setup_item','defer_firm_setup_item','commit_firm_setup'] loop
    select p.prosrc into v_txt from pg_proc p
     where p.pronamespace='clara'::regnamespace and p.proname = n;
    if position('''CLR06'', detail = ''{"reason":"stale_plan"}''' in v_txt) = 0 then
      raise exception '#648 tail: clara.% does not raise the 0017 CAS refusal (CLR06 + stale_plan)', n using errcode='CLR10';
    end if;
    -- `errcode = 'CLR31'`, not a bare 'CLR31': the doors' own comments NAME the SEED family's code
    -- in order to say they are not using it, and a substring probe on the bare token would red on
    -- the very sentence that records the adjudication.
    if position('errcode = ''CLR31''' in v_txt) <> 0 then
      raise exception '#648 tail: clara.% raises CLR31 -- that is the SEED family''s code, not the plan-CAS class', n
        using errcode='CLR10';
    end if;
  end loop;
  select p.prosrc into v_txt from pg_proc p
   where p.pronamespace='clara'::regnamespace and p.proname='commit_firm_setup';
  if position('''required_items_outstanding''' in v_txt) = 0 or position('''item_keys'',v_out' in v_txt) = 0 then
    raise exception '#648 tail: clara.commit_firm_setup does not NAME the required items it refuses on' using errcode='CLR10';
  end if;
  if position('k.required_for_commit' in v_txt) = 0 or position('clara.firm_setup_keys' in v_txt) = 0 then
    raise exception '#648 tail: clara.commit_firm_setup does not read the CATALOGUE for its required set' using errcode='CLR10';
  end if;
  select p.prosrc into v_txt from pg_proc p
   where p.pronamespace='clara'::regnamespace and p.proname='defer_firm_setup_item';
  if position('jsonb_build_object(''deferred_reason'', v_reason)' in v_txt) = 0 then
    raise exception '#648 tail: clara.defer_firm_setup_item does not park its reason inside `answer`' using errcode='CLR10';
  end if;
  select p.prosrc into v_txt from pg_proc p
   where p.pronamespace='clara'::regnamespace and p.proname='seed_firm_setup_plan';
  if position('not exists (select 1 from clara.onboarding_plan_items i' in v_txt) = 0 then
    raise exception '#648 tail: clara.seed_firm_setup_plan is not a reconciliation -- it must insert only the MISSING catalogue rows'
      using errcode='CLR10';
  end if;
  -- The probes name the DML FORMS, not the bare words: the body's own header says in prose why it
  -- is not an upsert, and a substring probe on "on conflict" would red on that sentence.
  if position('on conflict(plan_id' in v_txt) <> 0 or position('on conflict (plan_id' in v_txt) <> 0
     or position('update clara.onboarding_plan_items set' in v_txt) <> 0 then
    raise exception '#648 tail: clara.seed_firm_setup_plan touches existing plan items -- an accepted fact must never be rewritten by a reseed'
      using errcode='CLR10';
  end if;
  select p.prosrc into v_txt from pg_proc p
   where p.pronamespace='clara'::regnamespace and p.proname='answer_firm_setup_item';
  if position('clara.capture_knowledge(' in v_txt) = 0 then
    raise exception '#648 tail: clara.answer_firm_setup_item does not capture the firm-defaultable facts through the live capture door'
      using errcode='CLR10';
  end if;
  if position('promote_plan_answers_to_knowledge' in v_txt) <> 0 then
    raise exception '#648 tail: clara.answer_firm_setup_item calls the promotion door, whose item_key namespace is global and unscoped'
      using errcode='CLR10';
  end if;

  raise notice '#648 tail: OK -- clara.firm_setup_keys exists as a code-populated, append-only, FORCE-RLS catalogue owned by clara_fn_owner whose SELECT reaches clara_authenticated and NOBODY else (no clara_agent_ro, no clara_runtime, unlike the 0192:296-297 idiom it deliberately does not copy), carrying exactly the twelve FIRM_SEGMENTS_V2 rows minus bookkeeper_email (member provisioning, #625) and first_client_onboarding (#649), with exactly three of them firm-defaultable per D8 (currency->default_currency, framework->reporting_framework, accounting_basis->accounting_basis) and every option list READ from clara.knowledge_keys.allowed_values rather than re-typed; ZERO clara.knowledge_keys and ZERO clara.knowledge_plan_item_map rows were minted in this transaction (D10 / wave rule 1.5 -- both catalogs are append-only and belong to #654); clara.seed_firm_setup_plan / answer_firm_setup_item / defer_firm_setup_item / commit_firm_setup / get_firm_setup are PUBLIC-revoked clara_fn_owner-owned SECURITY DEFINER functions with search_path and plan_cache_mode pinned and EXECUTE reachable by clara_authenticated alone, their three private helpers are EXECUTE-reachable by nobody, and no runtime, agent or wake role reaches any of the eight names or the catalogue table; the seed is a RECONCILIATION (insert-where-not-exists, no upsert and no update of an existing plan item, so an answer written by firmInterview_v3 is never rewritten and never re-asked), the CAS refusal on all three mutating doors is 0017:2655-2659''s CLR06 + detail.reason stale_plan and never the SEED family''s CLR31, the commit gate reads the CATALOGUE''s required set and names every outstanding item, and the deferral parks its stated reason inside `answer` because onboarding_plan_items has no reason column and its deferred CHECK arm constrains none; uq_onboarding_plans_one_open_firm is a partial UNIQUE index on (firm_id) where state=open and scope_kind=firm -- a correctness fix to clara.claim_paid_firm''s bare SELECT INTO replay arm (0186:1555-1557) -- while 0017''s (firm_id, client_id) index is untouched; clara.update_onboarding_plan keeps its exact runtime-only ACL, clara.commit_client_onboarding still forces a client, clara.capture_knowledge still has exactly one body, and clara.onboarding_plan_items still has its 0017 thirteen columns; and the four firm_setup.* events are registered non-client-scoped and routed `ignore` at the active taxonomy version.';
end
$i648_tail$;
