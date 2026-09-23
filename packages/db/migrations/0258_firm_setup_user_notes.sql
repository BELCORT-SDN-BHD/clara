-- 0258_firm_setup_user_notes — #934 (firm setup 1/2): REPLACE THE TWELVE ENGINEER NOTES WITH ONE
-- ACCOUNTANT-READABLE SENTENCE EACH; A `user_note` AND A RETIRE COLUMN ON THE CATALOGUE.
-- =====================================================================================
-- Spec of record: issue #934 and its owner ruling (comment dated 2026-09-20: the twelve draft
-- notes below are "approved as drafted" and "seed them exactly as written"). Parent: #892 (owner
-- ruling 2026-09-18, "yes to both halves"). Sibling: #935 (education tips), which depends on the
-- retire column this file adds and lands after this file in the same lane. Domain words:
-- CONTEXT.md — "Firm setup", "Firm setup applicability", "Firm setup catalogue note".
--
-- WHAT IS WRONG, RESTATED FROM THE TICKET. A firm admin working through Settings -> Firm setup
-- sees, under each of the twelve questions, the ENGINEER's own provenance note -- file names, line
-- numbers, D8/D10 cross-references -- because `clara.get_firm_setup()` renders `firm_setup_keys
-- .note` (0218 SS A) straight onto the surface, and `note` has only ever carried that provenance
-- text (0218 SS A.1: "FIRM_SEGMENTS_V2 legal_name (interview.v2.questions.ts:34). D10: ..."). An
-- accountant does not need to know which TypeScript file asked the question; they need one
-- sentence saying what the answer is used for and what Clara does not check.
--
-- WHAT THIS FILE ADDS, IN ONE SENTENCE EACH.
--   (1) `clara.firm_setup_keys` gains `user_note` (nullable text) and `retired_at` (nullable
--       timestamptz), added by plain `alter table` -- a SCHEMA change, never a `create table`, and
--       never a rewrite of the table's PRIMARY KEY or any existing constraint.
--   (2) The twelve shipped rows are given their owner-approved `user_note` by ONE backfill
--       `update`, run with the table's append-only trigger DELIBERATELY DISABLED FOR THAT ONE
--       STATEMENT (SS B below explains why this is safe and how the tail proves the guard came back
--       on). No EXISTING column of any of the twelve rows is touched -- `note`, `question`, every
--       other column, stay byte-for-byte what 0218 shipped, pinned and re-measured at the tail.
--   (3) `clara.get_firm_setup()` is recut (`create or replace function`, pre-image pinned) to
--       PREFER `user_note` over `note` (`coalesce(k.user_note, k.note)`) and to OMIT a retired row
--       (`k.retired_at is null`) from every surface it appears on: `items[]`, `catalogue_total`,
--       `required_outstanding`, and both sides of `counter`.
--
-- WHAT THIS FILE DOES NOT DO, each with its authority.
--   * it does NOT touch `clara.seed_firm_setup_plan`. The ticket's AC1 names `get_firm_setup`
--     alone for the recut ("recuts get_firm_setup to prefer user_note over note and to omit
--     retired rows"); nothing in the Agent Brief or the owner's ruling asks the RECONCILIATION to
--     skip a retired row. This is a NAMED RESIDUAL: no row this file writes is ever retired (every
--     `retired_at` below is null), so the residual has NO OBSERABLE EFFECT today. A LATER ticket
--     that actually retires a catalogue row must decide, and build, whether `seed_firm_setup_plan`
--     should stop seeding a retired item -- exactly the shape #891 (0257) left as a named residual
--     for `commit_firm_setup`'s own gate. `clara.seed_firm_setup_plan`'s pre-image is MEASURED in
--     the prestate below and RE-MEASURED byte-identical at the tail, so this claim is checked, not
--     merely stated.
--   * it does NOT retire anything. Both new `retired_at` cells this file ever writes (the twelve
--     backfilled rows) are null. "Omit retired rows" is proved BEHAVIOURALLY by
--     `firm-setup-user-notes.test.mjs`'s `p934.notes.omits_retired` cell against a synthetic row
--     planted and removed by the same `withTriggerOff` idiom this file's own backfill uses (there
--     is no door, and no lawful DML, that retires one of the twelve today); the migration's own
--     tail (SS T.6/T.6b) proves only the STATIC code shape -- that every one of the six surfaces
--     `get_firm_setup` computes over the catalogue carries the `retired_at is null` filter -- the
--     same division of labour 0257's own tail already draws between code-shape and behaviour.
--   * it does NOT edit `clara.answer_firm_setup_item`, `clara.defer_firm_setup_item` or
--     `clara.commit_firm_setup` -- none of the three own the one named interface, and the ticket's
--     scope is `get_firm_setup` and the catalogue alone.
--   * it does NOT touch `clara._firm_setup_plan`, `clara._assert_firm_setup_answer`,
--     `clara._firm_setup_bump` or `clara._firm_setup_applicability` (0257) -- all four are
--     re-measured present, unmoved, at the tail.
--   * it mints no knowledge key, no event type, no new relation and no new grant. `user_note` and
--     `retired_at` are ordinary columns on an existing, already-granted relation; `get_firm_setup`
--     keeps its exact signature, so `create or replace function` preserves its owner, ACL,
--     SECURITY DEFINER and `search_path`/`plan_cache_mode` -- the tail re-reads all four rather
--     than trusting that sentence. No `rig-meta.mjs` cohort is added: a cohort exists only to
--     police a GRANTED NAME's presence across a frontier boundary (0257's own stated reason for the
--     same omission), and this file mints no new name at all -- only two columns on one already-
--     policed table and one recut of an already-policed function. The migration's own tail below is
--     what polices the two new columns' shape and posture.
--
-- =====================================================================================
-- WHY `user_note` IS NULLABLE, WITH A COALESCE FALLBACK, RATHER THAN `not null`.
--
-- The ticket's own words are "prefer `user_note` over `note`" -- a PRECEDENCE rule, not a
-- replacement. Every one of the twelve rows this file backfills carries a live `user_note`, so the
-- fallback never fires for them today; it exists so a FUTURE catalogue row (#935's education rows,
-- or any later addition) is never left rendering nothing at all if it is ever inserted before its
-- own accountant sentence is ready -- the same honesty `note` itself has always carried (`note text
-- not null` was never optional). Making `user_note` `not null` now would also block #935, a
-- DIFFERENT ticket with a DIFFERENT implementer, from choosing its own shape for the two education
-- rows' text; #934 owns the twelve backfilled rows and the read's precedence rule, not a permanent
-- constraint on every row this catalogue will ever hold. `firm-setup-user-notes.test.mjs`'s
-- `p934.notes.fallback` cell proves the fallback really fires, on a synthetic row, since none of
-- the twelve exercises it.
--
-- =====================================================================================
-- WHY THE BACKFILL DISABLES THE APPEND-ONLY TRIGGER FOR ONE STATEMENT, AND WHY THAT IS NOT A HOLE
-- IN THE APPEND-ONLY GUARANTEE.
--
-- `clara.firm_setup_keys` is append-only by `t_firm_setup_keys_append_only` (0218 SS A,
-- `clara._tf_append_only`, 0003:431-435): the trigger raises CLR08 on ANY `update` or `delete`,
-- unconditionally, for every role including the table owner. Postgres has no column-scoped
-- exception -- a trigger cannot admit "only this new column may be set" -- so populating a column
-- that has NEVER HELD DATA for twelve rows THAT ALREADY EXIST needs one of exactly two shapes: an
-- `alter table ... add column ... default <one constant>` (impossible here -- the twelve values
-- are twelve DIFFERENT sentences, not one constant), or a targeted `update` with the guard
-- deliberately, narrowly suspended. This file takes the second path, in the house shape
-- `0176_counterparty_alias_kind_scope.sql SS 3` and `packages/db/tests/README.md`
-- ("A fixture that turns a trigger off does it in ONE transaction") already established for
-- exactly this situation: `alter table ... disable trigger`, the ONE backfill `update` (touching
-- ONLY the new `user_note` column -- every pre-existing column of every row is absent from its SET
-- list), `alter table ... enable trigger`, all inside the runner's own per-migration transaction,
-- so a failure anywhere below rolls the disable back with everything else. The tail (SS T.3) proves
-- the trigger is enabled again by READING `pg_trigger.tgenabled` rather than trusting these lines,
-- and SS T.5 proves the twelve rows' PRE-EXISTING columns are byte-identical to a hash pinned in
-- the prestate below -- the append-only GUARANTEE (no existing fact is ever rewritten) survives;
-- only the WINDOW during which a brand-new column could receive its very first values does not.
--
-- =====================================================================================
-- REDO SAFETY (#957). Every DDL/DML step below tolerates being re-run over its own prior effects,
-- because this migration may need one `CLARA_MIGRATION_REDO` round before it merges (README.md,
-- "Redo (#957)"): `add column if not exists`, a constraint guarded by an existence check rather
-- than a bare `add constraint`, an `update` that sets the SAME twelve values it would set again,
-- and `create or replace function`. If a redo is ever used here it is recorded in the ticket's
-- report, per the work order.
-- =====================================================================================

set local statement_timeout = '5min';   -- runner rule: the first executable statement

-- =====================================================================================
-- SS0 PRESTATE. Every claim this file makes about what it is recutting, MEASURED on this rig now
-- -- not transcribed from 0218's, 0256's or 0257's own text, which could have drifted under an
-- earlier ticket in this lane (#894, #895, #891 all already applied here).
-- =====================================================================================
do $i934_pre$
declare v_sha text; v_n int; v_txt text; v_src text;
begin
  -- 0.1 · THE TARGET FUNCTION EXISTS AT THE SIGNATURE THIS FILE RECUTS, AND ITS SIBLING DOOR EXISTS
  -- TOO (measured, not recut -- SS0.2b pins it so the tail can prove it is UNTOUCHED).
  if to_regprocedure('clara.get_firm_setup()') is null then
    raise exception '#934 prestate: clara.get_firm_setup() is absent -- 0218 must apply first'
      using errcode='CLR10';
  end if;
  if to_regprocedure('clara.seed_firm_setup_plan(text)') is null then
    raise exception '#934 prestate: clara.seed_firm_setup_plan(text) is absent -- 0218 must apply first'
      using errcode='CLR10';
  end if;

  -- 0.2a · THE PRE-IMAGE PIN, gating THIS file's own recut. MEASURED live on this lane database at
  -- frontier 0257 (#894, #895, #891 all applied; #891 was the last to recut get_firm_setup).
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara.get_firm_setup()'::regprocedure;
  if v_sha <> '8064ba42de736256f88e5ecd47c653ca87f58692ba38d246849392bf5f5f91a1' then
    raise exception '#934 prestate: clara.get_firm_setup has DRIFTED from its pinned pre-image (sha %) -- re-derive the recut against the live body before applying', v_sha
      using errcode='CLR10';
  end if;

  -- 0.2b · A MEASURED BASELINE, not a gate: `seed_firm_setup_plan` is a read-only dependency this
  -- file never recuts (see header), so no APPLY-TIME check blocks on it drifting for some OTHER
  -- reason. The tail (SS T.7) re-measures this same sha and requires it UNCHANGED, which is what
  -- makes "this file does not touch seed_firm_setup_plan" a checked fact rather than a sentence.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara.seed_firm_setup_plan(text)'::regprocedure;
  if v_sha <> '57f8c602730119442042a5a3754efa2ca180f3f87ced0af17aea603af3060118' then
    raise exception '#934 prestate: clara.seed_firm_setup_plan has DRIFTED from its measured baseline (sha %) -- re-derive the untouched-baseline claim before applying', v_sha
      using errcode='CLR10';
  end if;

  -- 0.3 · THE RECUT HAS NOT ALREADY LANDED (fresh-apply assumption; a redo edits this check).
  select p.prosrc into v_src from pg_proc p where p.oid = 'clara.get_firm_setup()'::regprocedure;
  if position($tag$coalesce(k.user_note, k.note)$tag$ in v_src) <> 0 then
    raise exception '#934 prestate: clara.get_firm_setup already prefers user_note over note' using errcode='CLR10';
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema='clara' and table_name='firm_setup_keys' and column_name='user_note') then
    raise exception '#934 prestate: clara.firm_setup_keys.user_note already exists' using errcode='CLR10';
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema='clara' and table_name='firm_setup_keys' and column_name='retired_at') then
    raise exception '#934 prestate: clara.firm_setup_keys.retired_at already exists' using errcode='CLR10';
  end if;

  -- 0.4 · THE CATALOGUE'S OWN SHAPE, measured rather than assumed: exactly twelve rows, in the
  -- item_key order every prior ticket in this lane has re-measured (0257 SS0.5).
  select count(*)::int into v_n from clara.firm_setup_keys;
  if v_n <> 12 then
    raise exception '#934 prestate: the firm setup catalogue holds % rows (expected 12)', v_n using errcode='CLR10';
  end if;
  select string_agg(item_key, ',' order by sort_order) into v_txt from clara.firm_setup_keys;
  if v_txt is distinct from 'legal_name,ssm,entity_type,address,mia,turnover,tin,fye,mpers_eligibility,framework,accounting_basis,currency' then
    raise exception '#934 prestate: the catalogue''s item_key order is not the twelve this file backfills -- got {%}', v_txt
      using errcode='CLR10';
  end if;

  -- 0.5 · THE APPEND-ONLY TRIGGER IS PRESENT AND ENABLED -- SS B's disable/enable dance assumes
  -- this starting state, and the tail (SS T.3) proves the SAME trigger reads enabled again.
  select tgenabled into v_txt from pg_trigger
   where tgrelid = 'clara.firm_setup_keys'::regclass and tgname = 't_firm_setup_keys_append_only'
     and not tgisinternal;
  if v_txt is distinct from 'O' then
    raise exception '#934 prestate: t_firm_setup_keys_append_only reads tgenabled=%, expected O (enabled)', v_txt
      using errcode='CLR10';
  end if;

  -- 0.6 · A COMPREHENSIVE HASH OF EVERY PRE-EXISTING COLUMN OF THE TWELVE ROWS, MEASURED NOW.
  -- Re-asserted byte-identical at the tail (SS T.5) -- the checked form of "append-only rows
  -- untouched": this file's backfill SET list never names any of these columns, and this proves it
  -- rather than trusting the SET list's own text.
  select encode(sha256(convert_to(string_agg(
      item_key || '|' || coalesce(knowledge_key,'') || '|' || item_kind || '|' ||
      required_for_commit::text || '|' || min_role || '|' || group_key || '|' ||
      answer_shape || '|' || answer_options::text || '|' || coalesce(answer_field,'') || '|' ||
      question || '|' || note || '|' || sort_order::text, '~' order by sort_order),'UTF8')),'hex')
    into v_sha from clara.firm_setup_keys;
  if v_sha <> '156dc83bce062e83ca4fe0185f6a18f9c57891ed8fe16d4e5d4d1f7134e6a1dd' then
    raise exception '#934 prestate: the twelve rows'' pre-existing columns have DRIFTED from the pinned baseline (sha %) -- re-derive the untouched-columns claim before applying', v_sha
      using errcode='CLR10';
  end if;

  -- 0.7 · THE HELPERS `get_firm_setup`'S RECUT BODY CALLS ARE PRESENT (read-only dependencies; no
  -- pin owed since none is recut here, same as 0257 SS0.7's own list).
  if to_regprocedure('clara._human_ctx(int)') is null
     or to_regprocedure('clara._firm_setup_plan(uuid)') is null
     or to_regprocedure('clara._firm_setup_applicability(uuid,text)') is null
     or to_regprocedure('clara._knowledge_row_json(clara.knowledge_records)') is null
     or to_regprocedure('clara._knowledge_floor(text,text)') is null then
    raise exception '#934 prestate: a helper get_firm_setup''s recut body calls is absent' using errcode='CLR10';
  end if;

  raise notice '#934 prestate: clean -- clara.get_firm_setup is live at its pinned (post-#891) pre-image and does not yet prefer user_note; clara.seed_firm_setup_plan''s baseline is measured for the tail''s untouched-check; clara.firm_setup_keys holds exactly the twelve pinned rows in their pinned order with NEITHER user_note NOR retired_at yet, its append-only trigger is present and enabled, its twelve rows'' pre-existing columns hash to the pinned baseline, and every helper get_firm_setup''s body calls is present.';
end
$i934_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- SS A — THE SCHEMA CHANGE. Two nullable columns, `if not exists` for redo safety (header).
-- =====================================================================================
alter table clara.firm_setup_keys add column if not exists user_note text;
alter table clara.firm_setup_keys add column if not exists retired_at timestamptz;

comment on column clara.firm_setup_keys.user_note is
  '#934: the one accountant-readable sentence get_firm_setup PREFERS over `note` (coalesce) -- what
   the answer is used for and Clara''s stated boundary, never an accounting conclusion (ticket
   #934, "Rule for every note"). Nullable: a row with none falls back to `note` at the read
   (firm-setup-user-notes.test.mjs p934.notes.fallback). `note` itself is UNCHANGED and keeps
   carrying the engineer''s own provenance text -- it is simply no longer what a user is shown.';
comment on column clara.firm_setup_keys.retired_at is
  '#934: non-null once a catalogue item is retired. get_firm_setup omits a retired row from every
   surface (items[], catalogue_total, required_outstanding, both sides of counter). This file
   retires nothing -- every row here reads null. #935 depends on this column.';

do $i934_ck$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'clara.firm_setup_keys'::regclass
                    and conname = 'ck_firm_setup_keys_user_note') then
    alter table clara.firm_setup_keys
      add constraint ck_firm_setup_keys_user_note check (user_note is null or btrim(user_note) <> '');
  end if;
end
$i934_ck$;

-- =====================================================================================
-- SS B — THE BACKFILL. The twelve owner-approved sentences (ticket #934, ruling comment
-- 2026-09-20: "approved as drafted... seed them exactly as written"), English only -- the ticket's
-- Chinese gloss beside each is "for review only" and carries no stored value. The append-only
-- trigger is disabled for exactly this one statement and re-enabled immediately, inside the
-- runner's own per-migration transaction (header SS "WHY THE BACKFILL DISABLES..."; the tail SS T.3
-- re-reads it enabled rather than trusting these three lines).
-- =====================================================================================
alter table clara.firm_setup_keys disable trigger t_firm_setup_keys_append_only;

update clara.firm_setup_keys k
   set user_note = v.user_note
  from (values
    ('legal_name', 'Enter the name exactly as on the SSM certificate. It appears on every report and letter Clara produces for the firm.'),
    ('ssm', 'The registration number as printed by SSM. Clara does not validate the format here.'),
    ('entity_type', 'Sdn Bhd, LLP, partnership or sole proprietorship. Some later questions only apply to a Sdn Bhd.'),
    ('address', 'The registered address as filed with SSM, not the office you work from.'),
    ('mia', 'Optional. The firm''s MIA registration number, if it has one; skip with a reason if none.'),
    ('turnover', 'The firm''s own annual turnover band. It decides whether the TIN question below is required.'),
    ('tin', 'The firm''s MyInvois TIN. Required when annual turnover is RM1 million or more; otherwise skip with a reason.'),
    ('fye', 'The month the firm''s own financial year ends, 1 to 12. Clients keep their own year-end on their client record.'),
    ('mpers_eligibility', 'Applies to a Sdn Bhd only: whether the CA 2016 s.244 private-entity test lets the firm apply MPERS. Skip with a reason if the firm is not a Sdn Bhd.'),
    ('framework', 'MPERS or MFRS. This becomes the firm-wide default framework; a client can keep its own exception in Knowledge.'),
    ('accounting_basis', 'Accrual, cash receipts-and-payments, modified cash or other. This becomes the firm-wide default basis; a client can keep its own exception.'),
    ('currency', 'The currency the firm keeps its own books in, as a three-letter code. Client books carry their own currency.')
  ) as v(item_key, user_note)
 where k.item_key = v.item_key;

alter table clara.firm_setup_keys enable trigger t_firm_setup_keys_append_only;

-- The backfill's own row count, checked as a plain top-level statement (the 0176 house shape: no
-- `get diagnostics` here, because that reads the most recent command EXECUTED BY THE CURRENT
-- PL/pgSQL BLOCK, not a separate top-level `update` before it -- a nested `do` block would only
-- restate what the tail's per-key check below already proves more strongly).
do $i934_bf$
declare v_n int;
begin
  select count(*)::int into v_n from clara.firm_setup_keys where user_note is not null;
  if v_n <> 12 then
    raise exception '#934 backfill: % rows carry a user_note after the backfill, expected exactly 12', v_n using errcode='CLR10';
  end if;
end
$i934_bf$;

-- =====================================================================================
-- SS C — `clara.get_firm_setup`, RECUT. Five changes, all self-contained to this ONE door: the
-- `note` field prefers `user_note`; `items[]`, `required_outstanding`, `catalogue_total`,
-- `v_unseeded` and both `counter` sides all gain `k.retired_at is null` (`v_unseeded` was already
-- filtered by `<> 'inapplicable'`; this file adds the retirement filter beside it). Every other
-- line -- #891's applicability field and required-flag widening, the confirmed_facts block, the
-- return shape -- is 0257 SS C's body verbatim.
-- =====================================================================================
create or replace function clara.get_firm_setup() returns jsonb
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
        -- #934: PREFER the accountant-facing user_note over the engineer's own `note` -- a row
        -- with no user_note yet (never one of the twelve; see header) falls back rather than
        -- rendering nothing.
        'question', k.question, 'note', coalesce(k.user_note, k.note),
        -- #891: EFFECTIVELY required once seeded-and-applicable, for the two conditional rows, on
        -- TOP of the catalogue's own (immutable, untouched) required_for_commit flag.
        'required', (k.required_for_commit
          or (k.item_key in ('mpers_eligibility','tin') and i.id is not null
              and clara._firm_setup_applicability(p.id, k.item_key) = 'applicable')),
        'min_role', k.min_role,
        'answer_shape', k.answer_shape, 'answer_options', k.answer_options,
        'answer_field', k.answer_field, 'sort_order', k.sort_order,
        -- 'unseeded' is a REAL state of this surface, not a null: the catalogue row exists and the
        -- plan has no item for it yet, which is exactly what the reconciling seed fixes.
        'state', coalesce(i.state, 'unseeded'),
        'answer', i.answer, 'answered_by', i.answered_by,
        'answered_by_name', u.display_name, 'answered_at', i.answered_at,
        'knowledge_key', k.knowledge_key, 'knowledge_record_id', r.record_id,
        -- #891: 'applicable' | 'inapplicable' | 'undetermined', LIVE off clara._firm_setup_
        -- applicability -- never stored, so an item answered before it became inapplicable keeps
        -- its answer (untouched above) and is re-derived as inapplicable on every read.
        'applicability', clara._firm_setup_applicability(p.id, k.item_key)) as j,
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
     -- #934: a RETIRED catalogue row is settled -- never asked, never shown, never counted -- and
     -- is excluded from this projection entirely rather than rendered with a tombstone flag.
     where k.retired_at is null
  ) x;

  select coalesce(jsonb_agg(k.item_key order by k.sort_order), '[]'::jsonb) into v_out
    from clara.firm_setup_keys k
    left join clara.onboarding_plan_items i
      on p.id is not null and i.plan_id = p.id and i.item_key = k.item_key
   -- #934: a retired row can never be "outstanding" -- it is never asked at all.
   where k.retired_at is null and k.required_for_commit and (i.id is null or i.state = 'pending');

  -- #934: catalogue_total counts the LIVE catalogue -- a retired row is settled, not "still there
  -- but not required", so it is excluded here exactly as it is from items[] above.
  select count(*)::int into v_total from clara.firm_setup_keys where retired_at is null;
  -- #891: an INAPPLICABLE row is SETTLED -- this file's seed change means it is never inserted, so
  -- counting it as "still needs seeding" forever would keep `seeded` false for a firm this catalogue
  -- genuinely has nothing left to ask. An UNDETERMINED row still counts: its fate is not yet known,
  -- and the reconcile control must stay available until the dependency it needs is answered.
  -- #934: a RETIRED row is settled the same way an inapplicable one is -- excluded here too, so
  -- `seeded` can still reach true for a firm whose catalogue has nothing left to ask.
  select count(*)::int into v_unseeded
    from clara.firm_setup_keys k
    left join clara.onboarding_plan_items i
      on p.id is not null and i.plan_id = p.id and i.item_key = k.item_key
   where k.retired_at is null and i.id is null
     and clara._firm_setup_applicability(p.id, k.item_key) <> 'inapplicable';
  -- #891: EFFECTIVE required total/answered -- the catalogue's own required_for_commit set, PLUS
  -- the two conditional rows exactly while EACH is (a) actually seeded on this plan (i.id is not
  -- null -- a real row, not a hypothetical one nobody has reconciled yet) and (b) reads applicable
  -- right now. An item that never got seeded, or that settled inapplicable, contributes to neither
  -- side; one that WAS seeded, counted and answered, whose dependency is later corrected to make it
  -- inapplicable, drops out of BOTH sides on the very next read. See 0257's own header for why the
  -- `i.id is not null` guard is load-bearing and why this stays a get_firm_setup-only concept.
  -- #934: a RETIRED row is excluded from BOTH sides too, even where it is required_for_commit --
  -- proven on a synthetic row by firm-setup-user-notes.test.mjs's p934.notes.omits_retired, since
  -- this file retires none of the twelve.
  select count(*)::int into v_req_total
    from clara.firm_setup_keys k
    left join clara.onboarding_plan_items i
      on p.id is not null and i.plan_id = p.id and i.item_key = k.item_key
   where p.id is not null and k.retired_at is null
     and (k.required_for_commit
          or (k.item_key in ('mpers_eligibility','tin') and i.id is not null
              and clara._firm_setup_applicability(p.id, k.item_key) = 'applicable'));
  select count(*)::int into v_req_done
    from clara.firm_setup_keys k
    join clara.onboarding_plan_items i
      on p.id is not null and i.plan_id = p.id and i.item_key = k.item_key
   where k.retired_at is null
     and (k.required_for_commit
          or (k.item_key in ('mpers_eligibility','tin')
              and clara._firm_setup_applicability(p.id, k.item_key) = 'applicable'))
     and i.state in ('answered','resolved','deferred');

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
             -- 0192 SS D.8: a firm default NEVER shadows a client's own live `clara.client_facts`
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
       and r.state = 'live'
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
-- SS T TAIL CENSUS. Re-read the COMMITTED catalog and say what it found. Nothing here trusts this
-- file's own text: every claim is measured off pg_catalog. `get_firm_setup` is `_human_ctx`-gated
-- (identity comes off a JWT claim), so -- like every other migration in this chain that recuts a
-- gated door -- this tail proves the CODE SHAPE landed by reading the committed `prosrc`; the
-- BEHAVIOURAL proof (a real read through `humanQuery`) is `firm-setup-user-notes.test.mjs`'s job,
-- run at the gate.
-- =====================================================================================
do $i934_tail$
declare v_src text; v_posture text; v_n int; v_txt text; v_sha text; v_row record;
begin
  -- 1 · THE TWO NEW COLUMNS: present, nullable, the right type, the CHECK in place.
  select is_nullable, data_type into v_txt, v_src from information_schema.columns
   where table_schema='clara' and table_name='firm_setup_keys' and column_name='user_note';
  if v_txt is distinct from 'YES' or v_src is distinct from 'text' then
    raise exception '#934 tail: firm_setup_keys.user_note reads nullable=%/type=%, expected YES/text', v_txt, v_src
      using errcode='CLR10';
  end if;
  select is_nullable, data_type into v_txt, v_src from information_schema.columns
   where table_schema='clara' and table_name='firm_setup_keys' and column_name='retired_at';
  if v_txt is distinct from 'YES' or v_src is distinct from 'timestamp with time zone' then
    raise exception '#934 tail: firm_setup_keys.retired_at reads nullable=%/type=%, expected YES/timestamp with time zone', v_txt, v_src
      using errcode='CLR10';
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'clara.firm_setup_keys'::regclass
                    and conname = 'ck_firm_setup_keys_user_note') then
    raise exception '#934 tail: ck_firm_setup_keys_user_note is missing' using errcode='CLR10';
  end if;

  -- 2 · THE ROW COUNT AND ORDER DID NOT MOVE: still twelve, same item_keys, same order -- this
  -- file inserts and deletes none.
  select count(*)::int into v_n from clara.firm_setup_keys;
  if v_n <> 12 then
    raise exception '#934 tail: clara.firm_setup_keys holds % rows (expected 12) -- this file inserts and deletes none', v_n
      using errcode='CLR10';
  end if;
  select string_agg(item_key, ',' order by sort_order) into v_txt from clara.firm_setup_keys;
  if v_txt is distinct from 'legal_name,ssm,entity_type,address,mia,turnover,tin,fye,mpers_eligibility,framework,accounting_basis,currency' then
    raise exception '#934 tail: the catalogue''s item_key order moved -- got {%}', v_txt using errcode='CLR10';
  end if;

  -- 3 · THE APPEND-ONLY TRIGGER CAME BACK ON. Read off pg_trigger, not trusted from SS B's text.
  select tgenabled into v_txt from pg_trigger
   where tgrelid = 'clara.firm_setup_keys'::regclass and tgname = 't_firm_setup_keys_append_only'
     and not tgisinternal;
  if v_txt is distinct from 'O' then
    raise exception '#934 tail: t_firm_setup_keys_append_only reads tgenabled=% after the backfill, expected O (enabled)', v_txt
      using errcode='CLR10';
  end if;
  select tgenabled into v_txt from pg_trigger
   where tgrelid = 'clara.firm_setup_keys'::regclass and tgname = 't_firm_setup_keys_no_truncate'
     and not tgisinternal;
  if v_txt is distinct from 'O' then
    raise exception '#934 tail: t_firm_setup_keys_no_truncate reads tgenabled=%, expected O (enabled) -- this file must not have touched it', v_txt
      using errcode='CLR10';
  end if;

  -- 4 · NONE OF THE TWELVE IS RETIRED, and every one carries EXACTLY the owner-approved sentence
  -- (tail census re-reads the twelve keys, per the ticket's own AC1).
  if exists (select 1 from clara.firm_setup_keys where retired_at is not null) then
    raise exception '#934 tail: a row reads retired_at is not null -- this file retires none of the twelve'
      using errcode='CLR10';
  end if;
  for v_row in
    select * from (values
      ('legal_name', 'Enter the name exactly as on the SSM certificate. It appears on every report and letter Clara produces for the firm.'),
      ('ssm', 'The registration number as printed by SSM. Clara does not validate the format here.'),
      ('entity_type', 'Sdn Bhd, LLP, partnership or sole proprietorship. Some later questions only apply to a Sdn Bhd.'),
      ('address', 'The registered address as filed with SSM, not the office you work from.'),
      ('mia', 'Optional. The firm''s MIA registration number, if it has one; skip with a reason if none.'),
      ('turnover', 'The firm''s own annual turnover band. It decides whether the TIN question below is required.'),
      ('tin', 'The firm''s MyInvois TIN. Required when annual turnover is RM1 million or more; otherwise skip with a reason.'),
      ('fye', 'The month the firm''s own financial year ends, 1 to 12. Clients keep their own year-end on their client record.'),
      ('mpers_eligibility', 'Applies to a Sdn Bhd only: whether the CA 2016 s.244 private-entity test lets the firm apply MPERS. Skip with a reason if the firm is not a Sdn Bhd.'),
      ('framework', 'MPERS or MFRS. This becomes the firm-wide default framework; a client can keep its own exception in Knowledge.'),
      ('accounting_basis', 'Accrual, cash receipts-and-payments, modified cash or other. This becomes the firm-wide default basis; a client can keep its own exception.'),
      ('currency', 'The currency the firm keeps its own books in, as a three-letter code. Client books carry their own currency.')
    ) as expected(item_key, user_note)
  loop
    select user_note into v_txt from clara.firm_setup_keys where item_key = v_row.item_key;
    if v_txt is distinct from v_row.user_note then
      raise exception '#934 tail: %.user_note reads {%}, expected the owner-approved sentence {%}', v_row.item_key, v_txt, v_row.user_note
        using errcode='CLR10';
    end if;
  end loop;

  -- 5 · THE TWELVE ROWS' PRE-EXISTING COLUMNS ARE BYTE-IDENTICAL TO THE PRESTATE'S PIN -- the
  -- checked form of "append-only rows untouched".
  select encode(sha256(convert_to(string_agg(
      item_key || '|' || coalesce(knowledge_key,'') || '|' || item_kind || '|' ||
      required_for_commit::text || '|' || min_role || '|' || group_key || '|' ||
      answer_shape || '|' || answer_options::text || '|' || coalesce(answer_field,'') || '|' ||
      question || '|' || note || '|' || sort_order::text, '~' order by sort_order),'UTF8')),'hex')
    into v_sha from clara.firm_setup_keys;
  if v_sha <> '156dc83bce062e83ca4fe0185f6a18f9c57891ed8fe16d4e5d4d1f7134e6a1dd' then
    raise exception '#934 tail: the twelve rows'' pre-existing columns moved from the prestate''s pin (sha %) -- this file must only ever ADD user_note', v_sha
      using errcode='CLR10';
  end if;

  -- 6 · get_firm_setup's RECUT PROSRC carries every new fragment this file adds, and every arm it
  -- must not have touched is still present. Each fragment below is a SHORT, single physical line
  -- copied verbatim from the `create or replace function` text above it in this same file, so a
  -- transcription slip between the two would show up here as a failed tail rather than a silent
  -- drift between "what this file says it does" and "what it actually deployed".
  select p.prosrc into v_src from pg_proc p where p.oid = 'clara.get_firm_setup()'::regprocedure;
  foreach v_txt in array array[
      -- New in this file.
      $tag$'question', k.question, 'note', coalesce(k.user_note, k.note),$tag$,
      $tag$where k.retired_at is null and k.required_for_commit and (i.id is null or i.state = 'pending');$tag$,
      $tag$select count(*)::int into v_total from clara.firm_setup_keys where retired_at is null;$tag$,
      $tag$where k.retired_at is null and i.id is null$tag$,
      $tag$where p.id is not null and k.retired_at is null$tag$,
      -- Untouched arms (0257's own text, still present byte for byte).
      $tag$'required', (k.required_for_commit$tag$,
      $tag$'applicability', clara._firm_setup_applicability(p.id, k.item_key)) as j,$tag$,
      $tag$and i.state in ('answered','resolved','deferred');$tag$,
      $tag$join clara.firm_setup_keys k on k.knowledge_key = r.knowledge_key$tag$]
  loop
    if position(v_txt in v_src) = 0 then
      raise exception '#934 tail: clara.get_firm_setup is missing an expected fragment: %', v_txt
        using errcode='CLR10';
    end if;
  end loop;

  -- 6b · EXACTLY SIX `retired_at is null` filters -- items[], required_outstanding,
  -- catalogue_total, v_unseeded, v_req_total and v_req_done, no more and no fewer (a seventh would
  -- mean this file touched a query it should not have; a count below six would mean one of the
  -- six named surfaces lost its filter without the specific check above catching it).
  v_n := (length(v_src) - length(replace(v_src, 'retired_at is null', ''))) / length('retired_at is null');
  if v_n <> 6 then
    raise exception '#934 tail: clara.get_firm_setup carries % occurrences of "retired_at is null", expected exactly 6 (items, required_outstanding, catalogue_total, v_unseeded, v_req_total, v_req_done)', v_n
      using errcode='CLR10';
  end if;

  -- 7 · clara.seed_firm_setup_plan IS BYTE-IDENTICAL TO ITS MEASURED BASELINE -- this file touches
  -- it not at all (header's named residual: it does not skip a retired row today).
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara.seed_firm_setup_plan(text)'::regprocedure;
  if v_sha <> '57f8c602730119442042a5a3754efa2ca180f3f87ced0af17aea603af3060118' then
    raise exception '#934 tail: clara.seed_firm_setup_plan moved (sha %) -- this file must not have touched it', v_sha
      using errcode='CLR10';
  end if;

  -- 8 · POSTURE, get_firm_setup. `create or replace function` preserves owner, SECURITY DEFINER,
  -- search_path, plan_cache_mode and ACL when the signature is unchanged -- re-read, not trusted.
  select pg_get_userbyid(p.proowner) || ' | ' || p.prosecdef::text || ' | '
         || coalesce(array_to_string(p.proconfig, ','), '<none>') || ' | '
         || coalesce(array_to_string(p.proacl, ','), '<null>')
    into v_posture from pg_proc p where p.oid = 'clara.get_firm_setup()'::regprocedure;
  if v_posture is distinct from
     'clara_fn_owner | true | search_path=clara, pg_temp,plan_cache_mode=force_custom_plan | clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner' then
    raise exception '#934 tail: clara.get_firm_setup has the wrong posture after the recut; got {%}', v_posture
      using errcode='CLR10';
  end if;
  if has_function_privilege('clara_runtime', 'clara.get_firm_setup()'::regprocedure, 'execute')
     or has_function_privilege('clara_agent_ro', 'clara.get_firm_setup()'::regprocedure, 'execute')
     or has_function_privilege('clara_wake_interactive', 'clara.get_firm_setup()'::regprocedure, 'execute')
     or has_function_privilege('clara_wake_proactive', 'clara.get_firm_setup()'::regprocedure, 'execute') then
    raise exception '#934 tail: clara.get_firm_setup is EXECUTE-reachable by a machine role after the recut'
      using errcode='CLR10';
  end if;

  -- 9 · NOTHING ELSE IN THE FIRM-SETUP COHORT MOVED: the other five doors/helpers, plus #894's
  -- widened partial unique index.
  select count(*)::int into v_n from pg_proc p
   where p.pronamespace='clara'::regnamespace
     and p.proname in ('answer_firm_setup_item','defer_firm_setup_item','commit_firm_setup',
                       '_firm_setup_plan','_assert_firm_setup_answer','_firm_setup_bump',
                       '_firm_setup_applicability');
  if v_n <> 7 then
    raise exception '#934 tail: the untouched firm-setup cohort has % of its 7 other names (expected all present, none duplicated)', v_n
      using errcode='CLR10';
  end if;
  select pg_get_indexdef(i.indexrelid) into v_txt from pg_index i
   where i.indexrelid = 'clara.uq_onboarding_plans_one_firm'::regclass;
  if v_txt is null or position('scope_kind = ''firm''' in v_txt) = 0 or position('state' in v_txt) <> 0 then
    raise exception '#934 tail: uq_onboarding_plans_one_firm moved -- this file does not touch #894''s index'
      using errcode='CLR10';
  end if;

  raise notice '#934 tail: OK -- clara.firm_setup_keys gained two nullable columns (user_note text, retired_at timestamptz, both checked/typed as expected) with its append-only trigger disabled for exactly the one backfill update and re-enabled immediately (measured via pg_trigger.tgenabled, not trusted); the twelve shipped rows each carry EXACTLY their owner-approved accountant sentence in user_note, none is retired, and every one of their pre-existing columns hashes to the prestate''s pin (untouched); clara.get_firm_setup''s recut prosrc carries exactly six retired_at-is-null filters (items[], required_outstanding, catalogue_total, v_unseeded, required_total, required_answered) and now prefers user_note over note, keeping every arm #891 (0257) added and its exact clara_fn_owner/SECURITY DEFINER/search_path/plan_cache_mode/ACL posture, EXECUTE-unreachable by every machine role -- the BEHAVIOURAL proof that a retired row is really omitted is firm-setup-user-notes.test.mjs''s job; clara.seed_firm_setup_plan is byte-identical to its measured baseline (untouched, a named residual for a later ticket); and the other five firm-setup names, clara._firm_setup_applicability and #894''s widened index are all present and unmoved.';
end
$i934_tail$;
