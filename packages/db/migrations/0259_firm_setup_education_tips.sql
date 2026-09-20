-- 0259_firm_setup_education_tips — #935 (firm setup 2/2): THREE OPTIONAL EDUCATION TIPS, A
-- READ-OR-LATER RENDERING, OUTSIDE THE REQUIRED COUNTERS AND THE AUDIT TRAIL.
-- =====================================================================================
-- Spec of record: issue #935 and its owner ruling (comment dated 2026-09-20: the three draft tips
-- below are "approved as drafted"). Parent: #892 (owner ruling 2026-09-18, "yes to both halves").
-- Sibling: #934 (0258_firm_setup_user_notes.sql), whose `user_note`/`retired_at` columns and
-- `get_firm_setup` recut this file builds on and re-pins rather than re-derives. Domain words:
-- CONTEXT.md — "Firm setup", "Firm setup education tip".
--
-- WHAT THE TICKET ASKS FOR, RESTATED. The checklist can carry short optional tips a new firm reads
-- once: a title, a paragraph, "Got it" and "Later". A tip never has an answer form, never counts
-- toward the required total, never blocks completion and never nags from the firm home. Reading or
-- skipping a tip is remembered so it stops appearing, but that record is not an accounting act: it
-- writes no audit row, no domain event, and never shows in Activity.
--
-- WHAT THIS FILE ADDS, IN ONE SENTENCE EACH.
--   (1) `clara.onboarding_plan_items.item_kind` is widened to admit `education` — the plan item now
--       carries the catalogue's OWN kind, and `clara.seed_firm_setup_plan` no longer folds it onto
--       `todo` (0218 §D.1's own reason for the fold: "a fourth value would be a CHECK violation" —
--       no longer true once this file lands).
--   (2) THREE new `clara.firm_setup_keys` rows, `item_kind = 'education'`, `required_for_commit =
--       false`, group `tips`, seeded via a plain `insert` (never an `update` — the append-only
--       trigger is never touched, unlike #934's backfill, because these rows are brand new and no
--       existing row is edited).
--   (3) A new, NARROW door, `clara.dismiss_firm_setup_tip`, the ONLY way to acknowledge or skip a
--       tip. It writes to `clara.onboarding_plan_items` (so the tip stops appearing on a re-read)
--       and calls NEITHER `clara._audit` NOR `clara._append_event` — the owner's ruling's two hard
--       properties, made structural rather than merely tested.
--   (4) `clara.answer_firm_setup_item` and `clara.defer_firm_setup_item` are RECUT to each refuse a
--       call against an `education` row (`CLR10 firm_setup_item_is_a_tip`). Without this, either
--       generic door would happily record an audited "accounting item" against a tip, because
--       neither one has ever discriminated on `item_kind` — there was no `education` row alive to
--       expose the gap until this file. Closing it is this file's own decision, not named in the
--       Agent Brief's acceptance criteria by name; the reasoning is above and the tail proves it.
--
-- WHAT THIS FILE DOES NOT DO, each with its authority.
--   * it does NOT touch `clara.get_firm_setup`. Its existing arms already carry every property the
--     ticket's AC2 asks for, for free, from the catalogue data alone:
--       - `required_total`/`required_answered` only ever count a row that is `required_for_commit`
--         (or one of the two named conditional rows) — an `education` row is neither, so it can
--         never inflate either side (0257/0258's own arms, verbatim, unmoved).
--       - `required_outstanding` only ever names a `required_for_commit` row — same reason.
--       - `items[]` already carries `kind` (`k.item_kind`) for every row, tips included, and groups
--         by `group_key` — a `tips` group needs no new SQL, only a new group key in the data and a
--         heading/purpose pair in the surface's own i18n.
--     This is a MEASURED claim, not a hope: the prestate below pins `get_firm_setup`'s pre-image and
--     the tail re-measures it byte-identical, and `firm-setup-education-tips.test.mjs`'s AC2 cell
--     proves the behaviour on a real, seeded tip.
--   * it does NOT touch `clara.commit_firm_setup`. Its outstanding-items gate already reads
--     `required_for_commit` alone (0218 §E.4, unmoved) — a tip can never block it, for the same
--     catalogue-data reason `get_firm_setup`'s counters cannot count one.
--   * it does NOT touch `clara._firm_setup_plan`, `clara._assert_firm_setup_answer`,
--     `clara._firm_setup_bump` or `clara._firm_setup_applicability` — all four are re-measured
--     present and byte-identical at the tail. `dismiss_firm_setup_tip` calls none of them: it needs
--     no plan lookup helper beyond its own inline query, no answer-shape grammar (a tip's `answer`
--     is a fixed `{tip_action: ...}` shape this door writes itself) and no revision bump (see below).
--   * it mints no knowledge key. All three tips carry `knowledge_key = null` — a tip is product
--     guidance, never a fact this estate captures onto the Knowledge register (D8/D10's own line,
--     extended to a kind that asserts nothing at all).
--   * `clara.dismiss_firm_setup_tip` does NOT rotate the plan's CAS token (no `p_expected_revision`
--     parameter, no call to `clara._firm_setup_bump`, no `onboarding_plan_revisions` row). A tip's
--     settlement is not a fact competing for the SAME optimistic-concurrency slot the twelve
--     accounting questions share — nothing about `required_total`/`required_outstanding`/
--     `confirmed_facts` ever depends on a tip's state, so a stale revision could never make one
--     accounting answer overwrite another because a tip moved. Two colleagues acting on the SAME
--     tip in the same instant just each see it gone on their next read (last-write-wins on one
--     column, with no fact lost — there is nothing in a tip's `answer` worth preserving from a
--     "loser"). This is a deliberate, narrower contract than the four accounting doors', not an
--     oversight: the header's own reasoning is the residual, and `p935.tip.idempotent` proves the
--     second call is a harmless no-op rather than an error.
--   * it does NOT retire anything and does not touch `clara.firm_setup_keys.retired_at` beyond
--     leaving it null on the three new rows — retiring a tip is #934's own column, exercised by
--     whichever later ticket first retires a live row (0258's own named residual, unchanged here).
--   * it does NOT widen `clara.firm_setup_keys.answer_shape`'s five-value CHECK for a sixth "none"
--     arm. A tip's `answer_shape`/`answer_options`/`answer_field` are INERT placeholders
--     (`'text'`/`'[]'`/`null`) that no code path ever reads: the surface never renders a form for
--     `item_kind = 'education'` (AC3), and `clara.dismiss_firm_setup_tip` never calls
--     `clara._assert_firm_setup_answer`. Inventing a real "no answer" shape for a value nothing
--     validates would be answer-shape vocabulary this ticket does not need.
--   * it grants `clara.dismiss_firm_setup_tip` to `clara_authenticated` alone — no `clara_runtime`,
--     no `clara_agent_ro`, no wake role, the exact posture the other four firm-setup doors already
--     hold, for the exact `_human_ctx`-gated-verb-on-a-JWT-less-role "dark grant" reason 0192 §H and
--     0218 §G already state.
--
-- =====================================================================================
-- REDO SAFETY (#957). Every DDL/DML step below tolerates being re-run over its own prior effects:
-- the CHECK widen is guarded by a definition probe, the catalogue insert is guarded by
-- `not exists`, and `create or replace function` is naturally idempotent. If a redo is ever used
-- here it is recorded in the ticket's report, per the work order.
-- =====================================================================================

set local statement_timeout = '5min';   -- runner rule: the first executable statement

-- =====================================================================================
-- SS0 PRESTATE. Every claim this file makes about what it is recutting, MEASURED on this rig now --
-- not transcribed from 0218's, 0256's, 0257's or 0258's own text, which could have drifted under an
-- earlier ticket in this lane (#894, #895, #891, #934 are all already applied here).
-- =====================================================================================
do $i935_pre$
declare v_sha text; v_n int; v_txt text; v_src text;
begin
  -- 0.1 · EVERY NAME THIS FILE RECUTS OR CALLS EXISTS.
  if to_regprocedure('clara.get_firm_setup()') is null
     or to_regprocedure('clara.seed_firm_setup_plan(text)') is null
     or to_regprocedure('clara.answer_firm_setup_item(uuid,uuid,text,jsonb,text)') is null
     or to_regprocedure('clara.defer_firm_setup_item(uuid,uuid,text,text,text)') is null
     or to_regprocedure('clara.commit_firm_setup(uuid,uuid,text)') is null
     or to_regprocedure('clara._human_ctx(int)') is null
     or to_regprocedure('clara.role_rank(text)') is null then
    raise exception '#935 prestate: a firm-setup name this file recuts or calls is absent -- 0218/0257/0258 must apply first'
      using errcode='CLR10';
  end if;

  -- 0.2 · PRE-IMAGE PINS. `seed_firm_setup_plan`, `answer_firm_setup_item` and
  -- `defer_firm_setup_item` are RECUT below and pinned as gates; `get_firm_setup` and
  -- `commit_firm_setup` are NOT recut and pinned as measured baselines, re-read byte-identical at
  -- the tail -- the checked form of "this file does not touch either read/gate".
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara.seed_firm_setup_plan(text)'::regprocedure;
  if v_sha <> '57f8c602730119442042a5a3754efa2ca180f3f87ced0af17aea603af3060118' then
    raise exception '#935 prestate: clara.seed_firm_setup_plan has DRIFTED from its pinned pre-image (sha %) -- re-derive the recut against the live body before applying', v_sha
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara.answer_firm_setup_item(uuid,uuid,text,jsonb,text)'::regprocedure;
  if v_sha <> '2539fd1e88d94de8a17ba8b71ae0a5f0ee64df71b1df315ad34217ef680712f2' then
    raise exception '#935 prestate: clara.answer_firm_setup_item has DRIFTED from its pinned pre-image (sha %) -- re-derive the recut against the live body before applying', v_sha
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara.defer_firm_setup_item(uuid,uuid,text,text,text)'::regprocedure;
  if v_sha <> 'f5625c6a26300039a2de196531be4a0d8dd641e479491398da5d0af4f3664aa3' then
    raise exception '#935 prestate: clara.defer_firm_setup_item has DRIFTED from its pinned pre-image (sha %) -- re-derive the recut against the live body before applying', v_sha
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara.get_firm_setup()'::regprocedure;
  if v_sha <> 'dfe46764c5c4932cc771c46c5ee743820da69ebb790420b15314fb6b5e1732b0' then
    raise exception '#935 prestate: clara.get_firm_setup has DRIFTED from its measured baseline (sha %) -- re-derive the untouched-baseline claim before applying', v_sha
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara.commit_firm_setup(uuid,uuid,text)'::regprocedure;
  if v_sha <> 'c527f0bf01a9a583d18180270a21bac4c7110b4daf64927ef7967bc428e9dc23' then
    raise exception '#935 prestate: clara.commit_firm_setup has DRIFTED from its measured baseline (sha %) -- re-derive the untouched-baseline claim before applying', v_sha
      using errcode='CLR10';
  end if;

  -- 0.3 · THE RECUT HAS NOT ALREADY LANDED (fresh-apply assumption; a redo edits this check).
  if to_regprocedure('clara.dismiss_firm_setup_tip(uuid,text,text)') is not null then
    raise exception '#935 prestate: clara.dismiss_firm_setup_tip already exists' using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid = 'clara.seed_firm_setup_plan(text)'::regprocedure;
  if position($tag$case k.item_kind when 'education' then 'todo' else k.item_kind end$tag$ in v_src) = 0 then
    raise exception '#935 prestate: clara.seed_firm_setup_plan no longer folds education onto todo -- already recut?'
      using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid = 'clara.answer_firm_setup_item(uuid,uuid,text,jsonb,text)'::regprocedure;
  if position($tag$firm_setup_item_is_a_tip$tag$ in v_src) <> 0 then
    raise exception '#935 prestate: clara.answer_firm_setup_item already refuses an education row' using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid = 'clara.defer_firm_setup_item(uuid,uuid,text,text,text)'::regprocedure;
  if position($tag$firm_setup_item_is_a_tip$tag$ in v_src) <> 0 then
    raise exception '#935 prestate: clara.defer_firm_setup_item already refuses an education row' using errcode='CLR10';
  end if;
  if exists (select 1 from clara.firm_setup_keys
              where item_key in ('tip_invite_colleagues','tip_knowledge_page','tip_start_from_conversation')) then
    raise exception '#935 prestate: an education tip row already exists' using errcode='CLR10';
  end if;

  -- 0.4 · THE ORIGINAL TWELVE, measured rather than assumed: exactly twelve rows, in the item_key
  -- order every prior ticket in this lane has re-measured (0258 SS0.4), and their pre-existing
  -- columns (excluding user_note/retired_at, #934's own new columns) hash to the SAME pin 0257/0258
  -- both re-proved untouched -- this file inserts three siblings beside them and edits none of them.
  select count(*)::int into v_n from clara.firm_setup_keys;
  if v_n <> 12 then
    raise exception '#935 prestate: the firm setup catalogue holds % rows (expected 12 before this file''s insert)', v_n
      using errcode='CLR10';
  end if;
  select string_agg(item_key, ',' order by sort_order) into v_txt from clara.firm_setup_keys;
  if v_txt is distinct from 'legal_name,ssm,entity_type,address,mia,turnover,tin,fye,mpers_eligibility,framework,accounting_basis,currency' then
    raise exception '#935 prestate: the catalogue''s item_key order is not the twelve this file builds beside -- got {%}', v_txt
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(string_agg(
      item_key || '|' || coalesce(knowledge_key,'') || '|' || item_kind || '|' ||
      required_for_commit::text || '|' || min_role || '|' || group_key || '|' ||
      answer_shape || '|' || answer_options::text || '|' || coalesce(answer_field,'') || '|' ||
      question || '|' || note || '|' || sort_order::text, '~' order by sort_order),'UTF8')),'hex')
    into v_sha from clara.firm_setup_keys;
  if v_sha <> '156dc83bce062e83ca4fe0185f6a18f9c57891ed8fe16d4e5d4d1f7134e6a1dd' then
    raise exception '#935 prestate: the twelve rows'' pre-existing columns have DRIFTED from the pinned baseline (sha %) -- re-derive the untouched-columns claim before applying', v_sha
      using errcode='CLR10';
  end if;

  -- 0.5 · `onboarding_plan_items.item_kind` admits EXACTLY must_ask/capture/todo, not yet education.
  select pg_get_constraintdef(c.oid) into v_txt from pg_constraint c
   where c.conrelid='clara.onboarding_plan_items'::regclass and c.conname='onboarding_plan_items_item_kind_check';
  if v_txt is null or position('must_ask' in v_txt) = 0 or position('capture' in v_txt) = 0
     or position('todo' in v_txt) = 0 or position('education' in v_txt) <> 0 then
    raise exception '#935 prestate: onboarding_plan_items_item_kind_check reads {%}, expected exactly must_ask/capture/todo (not yet education)', v_txt
      using errcode='CLR10';
  end if;

  raise notice '#935 prestate: clean -- every recut/called name is present at its pinned pre-image (seed/answer/defer to recut; get_firm_setup/commit_firm_setup as untouched baselines), clara.dismiss_firm_setup_tip does not yet exist, neither door yet refuses an education row, no tip row exists yet, the catalogue holds exactly its pinned twelve rows byte-identical to the prior tickets'' own pin, and onboarding_plan_items.item_kind does not yet admit education.';
end
$i935_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- SS A — THE THREE TIPS. Plain `insert`: these are brand-new rows, so the append-only trigger is
-- never disabled (contrast #934's backfill, which touched twelve EXISTING rows). `user_note` is set
-- directly at insert -- there is no "before" state for a tip's accountant sentence to fall back
-- from. `note` (engineer provenance, required not null) records this file's own authority rather
-- than the interview-segment provenance the twelve original rows carry, because a tip is not one of
-- FIRM_SEGMENTS_V2's questions.
-- =====================================================================================
insert into clara.firm_setup_keys
    (item_key, knowledge_key, item_kind, required_for_commit, min_role, group_key,
     answer_shape, answer_options, answer_field, question, note, user_note, sort_order) values

  ('tip_invite_colleagues', null, 'education', false, 'admin', 'tips',
   'text', '[]'::jsonb, null,
   'Invite your colleagues',
   'Ticket #935 (parent #892), owner ruling 2026-09-20 "approved as drafted". Education tip 1 of 3. '
   || 'answer_shape/answer_options/answer_field are inert placeholders: no code path renders a form '
   || 'or validates an answer for item_kind = education (see this migration''s header).',
   'Settings → Members sends an invitation by email; a bookkeeper sees client work, an admin also manages members and firm setup.',
   130),

  ('tip_knowledge_page', null, 'education', false, 'admin', 'tips',
   'text', '[]'::jsonb, null,
   'Where Clara keeps what it knows',
   'Ticket #935 (parent #892), owner ruling 2026-09-20 "approved as drafted". Education tip 2 of 3. '
   || 'answer_shape/answer_options/answer_field are inert placeholders: no code path renders a form '
   || 'or validates an answer for item_kind = education (see this migration''s header).',
   'Every client has a Knowledge page: facts, aliases, preferences and policies with their source; correct or withdraw anything there, and Clara reads it before every task.',
   140),

  ('tip_start_from_conversation', null, 'education', false, 'admin', 'tips',
   'text', '[]'::jsonb, null,
   'Start work from the conversation',
   'Ticket #935 (parent #892), owner ruling 2026-09-20 "approved as drafted". Education tip 3 of 3. '
   || 'answer_shape/answer_options/answer_field are inert placeholders: no code path renders a form '
   || 'or validates an answer for item_kind = education (see this migration''s header).',
   'Drop invoices, statements or a one-line instruction into the Clara rail; the work continues even if you close the tab, and anything Clara cannot settle appears under Needs you.',
   150);

-- =====================================================================================
-- SS B — WIDEN `onboarding_plan_items.item_kind` TO ADMIT `education`. Guarded by a definition
-- probe (redo safety, header): a redo that finds the CHECK already widened does nothing here.
-- =====================================================================================
do $i935_widen$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'clara.onboarding_plan_items'::regclass
       and conname = 'onboarding_plan_items_item_kind_check'
       and pg_get_constraintdef(oid) like '%education%') then
    alter table clara.onboarding_plan_items drop constraint if exists onboarding_plan_items_item_kind_check;
    alter table clara.onboarding_plan_items add constraint onboarding_plan_items_item_kind_check
      check (item_kind in ('must_ask','capture','todo','education'));
  end if;
end
$i935_widen$;

-- =====================================================================================
-- SS C — `clara.seed_firm_setup_plan`, RECUT. ONE line: the reconciliation now inserts the
-- catalogue's OWN `item_kind` verbatim, never folded onto `todo`. Every other line -- the
-- reservation, the state gate, #895's conditional bump, #891's applicability filter, the audit row
-- and the event -- is 0257 §B's body verbatim.
-- =====================================================================================
create or replace function clara.seed_firm_setup_plan(p_op_key text) returns jsonb
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
  -- must not be touched AT ALL, and an upsert would rewrite its question text even when it left the
  -- answer alone. #935: the catalogue's OWN item_kind is carried through -- onboarding_plan_items
  -- .item_kind now admits `education` too (SS B above), so no fold onto `todo` is needed any more.
  insert into clara.onboarding_plan_items(
      plan_id, firm_id, item_kind, item_key, question, answer, state, required_for_commit)
  select p.id, p.firm_id,
         k.item_kind,
         k.item_key, k.question, null, 'pending', k.required_for_commit
    from clara.firm_setup_keys k
   where not exists (select 1 from clara.onboarding_plan_items i
                      where i.plan_id = p.id and i.item_key = k.item_key)
     and clara._firm_setup_applicability(p.id, k.item_key) = 'applicable'
   order by k.sort_order;
  get diagnostics v_added = row_count;
  select count(*)::int into v_total from clara.firm_setup_keys;

  -- #895 DEFECT 1: a reconciliation that inserts NOTHING must leave the plan's own CAS token,
  -- revision number and revision history untouched. The audit row and the domain event below
  -- still fire UNCONDITIONALLY, carrying seeded=0 on a no-op run, so "an admin reconciled and
  -- nothing was missing" stays a receipted, readable fact even though nothing about the plan
  -- itself moved. A replay under the SAME op_key was already, and remains, unaffected by this --
  -- `clara._reserve_op` returned above before this point is ever reached on a second call.
  if v_added > 0 then
    p := clara._firm_setup_bump(p.id, c.actor);
  end if;
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

-- =====================================================================================
-- SS D — `clara.answer_firm_setup_item`, RECUT. ONE new guard, right after the catalogue lookup:
-- an education row is refused by name. Every other line is 0218 §E.2's body verbatim.
-- =====================================================================================
create or replace function clara.answer_firm_setup_item(
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
  -- #935: an education tip is never answered through this door -- it has no answer, and this door
  -- audits and emits an event on every acceptance, which a tip must never do. Its own narrow door
  -- (clara.dismiss_firm_setup_tip) is the only lawful way to settle one.
  if k.item_kind = 'education' then
    raise exception 'firm setup item % is an education tip -- use clara.dismiss_firm_setup_tip instead', v_key
      using errcode = 'CLR10',
        detail = jsonb_build_object('reason','firm_setup_item_is_a_tip','item_key',v_key)::text;
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

-- =====================================================================================
-- SS E — `clara.defer_firm_setup_item`, RECUT. The SAME one new guard as SS D, right after the
-- catalogue lookup. Every other line is 0218 §E.3's body verbatim.
-- =====================================================================================
create or replace function clara.defer_firm_setup_item(
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
  -- #935: same reasoning as clara.answer_firm_setup_item's new guard (SS D) -- a tip is never
  -- deferred through the door that audits and emits an event on every acceptance.
  if k.item_kind = 'education' then
    raise exception 'firm setup item % is an education tip -- use clara.dismiss_firm_setup_tip instead', v_key
      using errcode = 'CLR10',
        detail = jsonb_build_object('reason','firm_setup_item_is_a_tip','item_key',v_key)::text;
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

-- =====================================================================================
-- SS F — `clara.dismiss_firm_setup_tip`, THE NEW NARROW DOOR. AC3's "a door that writes no audit
-- row and emits no domain event". No `p_op_key`, no `p_expected_revision`: see the file header for
-- why a tip rides neither the idempotency ledger nor the plan's CAS token. Idempotent BY
-- CONSTRUCTION instead -- a repeat call on an already-settled tip is a silent no-op, never an error
-- and never a second write.
-- =====================================================================================
create function clara.dismiss_firm_setup_tip(p_plan uuid, p_item_key text, p_action text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp
  set plan_cache_mode = force_custom_plan as $door$
declare c record; k record; p clara.onboarding_plans; i record; v_key text; v_action text; v_state text;
begin
  c := clara._human_ctx(clara.role_rank('admin'));
  v_key := nullif(btrim(p_item_key), '');
  v_action := nullif(btrim(p_action), '');
  if v_key is null or v_action is null then
    raise exception 'item_key and action are required' using errcode = 'CLR10';
  end if;
  if v_action not in ('acknowledged','deferred') then
    raise exception 'firm setup tip action must be acknowledged or deferred, not %', v_action
      using errcode = 'CLR10',
        detail = jsonb_build_object('reason','firm_setup_tip_action_invalid','item_key',v_key)::text;
  end if;
  -- A RETIRED tip (#934's column) is settled and never interactable -- the same posture
  -- get_firm_setup already gives a retired row everywhere else.
  select * into k from clara.firm_setup_keys where item_key = v_key and retired_at is null;
  if not found then
    raise exception 'unknown firm setup item %', v_key using errcode = 'CLR10',
      detail = '{"reason":"firm_setup_item_unknown"}';
  end if;
  -- THE NARROW FENCE, the other half of SS D/E's guard: this door is for a TIP alone. Reusing it
  -- against one of the twelve accounting rows would silently drop their audit trail and event.
  if k.item_kind <> 'education' then
    raise exception 'firm setup item % is not an education tip -- use answer_firm_setup_item or defer_firm_setup_item', v_key
      using errcode = 'CLR10',
        detail = jsonb_build_object('reason','firm_setup_item_not_a_tip','item_key',v_key)::text;
  end if;
  perform clara._human_ctx(clara.role_rank(k.min_role));

  select * into p from clara.onboarding_plans
   where id = p_plan and firm_id = c.firm and scope_kind = 'firm' for update;
  if not found then
    raise exception 'firm setup plan not in your firm' using errcode = 'CLR11';
  end if;
  if p.state <> 'open' then
    raise exception 'the firm setup plan is not open' using errcode = 'CLR10',
      detail = '{"reason":"firm_setup_not_open"}';
  end if;

  select * into i from clara.onboarding_plan_items
   where plan_id = p.id and item_key = v_key for update;
  if not found then
    raise exception 'firm setup item % is not on this plan yet -- reconcile the checklist first', v_key
      using errcode = 'CLR10', detail = '{"reason":"firm_setup_item_not_seeded"}';
  end if;

  v_state := case v_action when 'acknowledged' then 'answered' else 'deferred' end;
  -- IDEMPOTENT BY CONSTRUCTION: only a still-`pending` tip is written. A repeat call -- the same
  -- action pressed twice, or "Got it" after "Later" -- reads back the tip's actual settled state
  -- rather than raising or silently overwriting it a second time.
  if i.state = 'pending' then
    update clara.onboarding_plan_items set
        state = v_state, answer = jsonb_build_object('tip_action', v_action),
        answered_by = c.actor, answered_at = now(), updated_at = now()
      where id = i.id;
  else
    v_state := i.state;
  end if;

  -- NO clara._audit CALL. NO clara._append_event CALL. NO clara._firm_setup_bump CALL. This is the
  -- whole of AC3's "writes no audit row and emits no domain event" -- structural, not merely tested.
  return jsonb_build_object('plan_id', p.id, 'item_key', v_key, 'state', v_state, 'tip_action', v_action);
end $door$;
revoke all on function clara.dismiss_firm_setup_tip(uuid, text, text) from public;
grant execute on function clara.dismiss_firm_setup_tip(uuid, text, text) to clara_authenticated;

reset role;

-- =====================================================================================
-- SS T TAIL CENSUS. Re-read the COMMITTED catalog and say what it found. Nothing here trusts this
-- file's own text: every claim is measured off pg_catalog. The four recut/new doors are
-- `_human_ctx`-gated (identity comes off a JWT claim), so -- like every other migration in this
-- chain that recuts a gated door -- this tail proves the CODE SHAPE landed by reading the committed
-- `prosrc`; the BEHAVIOURAL proof (a real door call through `humanQuery`) is
-- `firm-setup-education-tips.test.mjs`'s job, run at the gate.
-- =====================================================================================
do $i935_tail$
declare v_src text; v_posture text; v_n int; v_txt text; v_sha text;
begin
  -- 1 · THE CATALOGUE GAINED EXACTLY THREE ROWS, in the expected order, at the expected group/kind.
  select count(*)::int into v_n from clara.firm_setup_keys;
  if v_n <> 15 then
    raise exception '#935 tail: clara.firm_setup_keys holds % rows (expected 15 -- the twelve plus three tips)', v_n
      using errcode='CLR10';
  end if;
  select string_agg(item_key, ',' order by sort_order) into v_txt from clara.firm_setup_keys;
  if v_txt is distinct from 'legal_name,ssm,entity_type,address,mia,turnover,tin,fye,mpers_eligibility,framework,accounting_basis,currency,tip_invite_colleagues,tip_knowledge_page,tip_start_from_conversation' then
    raise exception '#935 tail: the catalogue''s item_key order is not the twelve plus the three tips, in that order -- got {%}', v_txt
      using errcode='CLR10';
  end if;
  if exists (select 1 from clara.firm_setup_keys
              where item_key in ('tip_invite_colleagues','tip_knowledge_page','tip_start_from_conversation')
                and (item_kind <> 'education' or required_for_commit <> false or group_key <> 'tips'
                     or knowledge_key is not null or retired_at is not null
                     or coalesce(btrim(user_note), '') = '')) then
    raise exception '#935 tail: a tip row does not read item_kind=education, required_for_commit=false, group_key=tips, knowledge_key=null, retired_at=null and a non-blank user_note'
      using errcode='CLR10';
  end if;

  -- 2 · THE ORIGINAL TWELVE'S PRE-EXISTING COLUMNS ARE BYTE-IDENTICAL TO THE PRESTATE'S PIN --
  -- this file only ever ADDS rows beside them.
  select encode(sha256(convert_to(string_agg(
      item_key || '|' || coalesce(knowledge_key,'') || '|' || item_kind || '|' ||
      required_for_commit::text || '|' || min_role || '|' || group_key || '|' ||
      answer_shape || '|' || answer_options::text || '|' || coalesce(answer_field,'') || '|' ||
      question || '|' || note || '|' || sort_order::text, '~' order by sort_order),'UTF8')),'hex')
    into v_sha from clara.firm_setup_keys
   where item_key not in ('tip_invite_colleagues','tip_knowledge_page','tip_start_from_conversation');
  if v_sha <> '156dc83bce062e83ca4fe0185f6a18f9c57891ed8fe16d4e5d4d1f7134e6a1dd' then
    raise exception '#935 tail: the original twelve rows'' pre-existing columns moved from the prestate''s pin (sha %) -- this file must only ever ADD rows beside them', v_sha
      using errcode='CLR10';
  end if;

  -- 3 · onboarding_plan_items.item_kind NOW ADMITS education, alongside the original three.
  select pg_get_constraintdef(c.oid) into v_txt from pg_constraint c
   where c.conrelid='clara.onboarding_plan_items'::regclass and c.conname='onboarding_plan_items_item_kind_check';
  if v_txt is null or position('must_ask' in v_txt) = 0 or position('capture' in v_txt) = 0
     or position('todo' in v_txt) = 0 or position('education' in v_txt) = 0 then
    raise exception '#935 tail: onboarding_plan_items_item_kind_check reads {%}, expected must_ask/capture/todo/education', v_txt
      using errcode='CLR10';
  end if;

  -- 4 · clara.seed_firm_setup_plan's RECUT no longer folds education onto todo, and carries the
  -- catalogue's own item_kind through the select-list instead.
  select p.prosrc into v_src from pg_proc p where p.oid = 'clara.seed_firm_setup_plan(text)'::regprocedure;
  if position($tag$case k.item_kind when 'education' then 'todo' else k.item_kind end$tag$ in v_src) <> 0 then
    raise exception '#935 tail: clara.seed_firm_setup_plan still folds education onto todo' using errcode='CLR10';
  end if;
  if position($tag$select p.id, p.firm_id,
         k.item_kind,
         k.item_key, k.question, null, 'pending', k.required_for_commit$tag$ in v_src) = 0 then
    raise exception '#935 tail: clara.seed_firm_setup_plan does not carry the catalogue''s own item_kind through the select-list'
      using errcode='CLR10';
  end if;
  -- The rest of the body -- the reservation, the state gate, #895's conditional bump, #891's
  -- applicability filter, the audit row and the event -- is 0257 §B's text verbatim; SS T.6 below
  -- proves the TWO untouched doors (get_firm_setup, commit_firm_setup) byte-identical instead of
  -- re-pinning this recut's own full body, the same division 0258's own tail drew for its analogous
  -- one-line recut of this same function.

  -- 5 · clara.answer_firm_setup_item and clara.defer_firm_setup_item EACH carry the new education
  -- guard, exactly once.
  select p.prosrc into v_src from pg_proc p where p.oid = 'clara.answer_firm_setup_item(uuid,uuid,text,jsonb,text)'::regprocedure;
  v_n := (length(v_src) - length(replace(v_src, 'firm_setup_item_is_a_tip', ''))) / length('firm_setup_item_is_a_tip');
  if v_n <> 1 then
    raise exception '#935 tail: clara.answer_firm_setup_item carries % occurrences of the education guard, expected exactly 1', v_n
      using errcode='CLR10';
  end if;
  if position($tag$select * into k from clara.firm_setup_keys where item_key = v_key;
  if not found then
    raise exception 'unknown firm setup item %', v_key using errcode = 'CLR10',
      detail = '{"reason":"firm_setup_item_unknown"}';
  end if;
  -- #935: an education tip is never answered through this door$tag$ in v_src) = 0 then
    raise exception '#935 tail: clara.answer_firm_setup_item''s guard is not placed right after the catalogue lookup'
      using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid = 'clara.defer_firm_setup_item(uuid,uuid,text,text,text)'::regprocedure;
  v_n := (length(v_src) - length(replace(v_src, 'firm_setup_item_is_a_tip', ''))) / length('firm_setup_item_is_a_tip');
  if v_n <> 1 then
    raise exception '#935 tail: clara.defer_firm_setup_item carries % occurrences of the education guard, expected exactly 1', v_n
      using errcode='CLR10';
  end if;

  -- 6 · clara.get_firm_setup and clara.commit_firm_setup are BYTE-IDENTICAL to their measured
  -- baselines -- this file touches neither (header's own claim, checked rather than stated).
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara.get_firm_setup()'::regprocedure;
  if v_sha <> 'dfe46764c5c4932cc771c46c5ee743820da69ebb790420b15314fb6b5e1732b0' then
    raise exception '#935 tail: clara.get_firm_setup moved (sha %) -- this file must not have touched it', v_sha
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara.commit_firm_setup(uuid,uuid,text)'::regprocedure;
  if v_sha <> 'c527f0bf01a9a583d18180270a21bac4c7110b4daf64927ef7967bc428e9dc23' then
    raise exception '#935 tail: clara.commit_firm_setup moved (sha %) -- this file must not have touched it', v_sha
      using errcode='CLR10';
  end if;

  -- 7 · clara.dismiss_firm_setup_tip's POSTURE: owner, SECURITY DEFINER, search_path/plan_cache_mode,
  -- ACL clara_authenticated alone, EXECUTE-unreachable by every machine role.
  if to_regprocedure('clara.dismiss_firm_setup_tip(uuid,text,text)') is null then
    raise exception '#935 tail: clara.dismiss_firm_setup_tip was not created' using errcode='CLR10';
  end if;
  select pg_get_userbyid(p.proowner) || ' | ' || p.prosecdef::text || ' | '
         || coalesce(array_to_string(p.proconfig, ','), '<none>') || ' | '
         || coalesce(array_to_string(p.proacl, ','), '<null>')
    into v_posture from pg_proc p where p.oid = 'clara.dismiss_firm_setup_tip(uuid,text,text)'::regprocedure;
  if v_posture is distinct from
     'clara_fn_owner | true | search_path=clara, pg_temp,plan_cache_mode=force_custom_plan | clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner' then
    raise exception '#935 tail: clara.dismiss_firm_setup_tip has the wrong posture; got {%}', v_posture
      using errcode='CLR10';
  end if;
  if has_function_privilege('clara_runtime', 'clara.dismiss_firm_setup_tip(uuid,text,text)'::regprocedure, 'execute')
     or has_function_privilege('clara_agent_ro', 'clara.dismiss_firm_setup_tip(uuid,text,text)'::regprocedure, 'execute')
     or has_function_privilege('clara_wake_interactive', 'clara.dismiss_firm_setup_tip(uuid,text,text)'::regprocedure, 'execute')
     or has_function_privilege('clara_wake_proactive', 'clara.dismiss_firm_setup_tip(uuid,text,text)'::regprocedure, 'execute') then
    raise exception '#935 tail: clara.dismiss_firm_setup_tip is EXECUTE-reachable by a machine role'
      using errcode='CLR10';
  end if;
  -- …and never calls any of the audit/event/bump/reserve primitives -- a static confirmation
  -- alongside the behavioural proof in the test file.
  select p.prosrc into v_src from pg_proc p where p.oid = 'clara.dismiss_firm_setup_tip(uuid,text,text)'::regprocedure;
  if position('clara._audit(' in v_src) <> 0 or position('clara._append_event(' in v_src) <> 0
     or position('clara._firm_setup_bump(' in v_src) <> 0 or position('clara._reserve_op(' in v_src) <> 0 then
    raise exception '#935 tail: clara.dismiss_firm_setup_tip calls an audit/event/bump/reserve primitive it must not'
      using errcode='CLR10';
  end if;

  -- 8 · NOTHING ELSE IN THE FIRM-SETUP COHORT MOVED: the untouched helpers and #894's index.
  select count(*)::int into v_n from pg_proc p
   where p.pronamespace='clara'::regnamespace
     and p.proname in ('_firm_setup_plan','_assert_firm_setup_answer','_firm_setup_bump',
                       '_firm_setup_applicability');
  if v_n <> 4 then
    raise exception '#935 tail: the untouched firm-setup helper cohort has % of its 4 names (expected all present, none duplicated)', v_n
      using errcode='CLR10';
  end if;
  select pg_get_indexdef(i.indexrelid) into v_txt from pg_index i
   where i.indexrelid = 'clara.uq_onboarding_plans_one_firm'::regclass;
  if v_txt is null or position('scope_kind = ''firm''' in v_txt) = 0 or position('state' in v_txt) <> 0 then
    raise exception '#935 tail: uq_onboarding_plans_one_firm moved -- this file does not touch #894''s index'
      using errcode='CLR10';
  end if;

  raise notice '#935 tail: OK -- clara.firm_setup_keys gained exactly three education-kind rows (tip_invite_colleagues/tip_knowledge_page/tip_start_from_conversation), required_for_commit=false, group tips, no knowledge_key, none retired, a non-blank user_note each, in sort order after the original twelve, whose own pre-existing columns hash unchanged to the prior pin; onboarding_plan_items.item_kind now admits education alongside must_ask/capture/todo; clara.seed_firm_setup_plan no longer folds education onto todo; clara.answer_firm_setup_item and clara.defer_firm_setup_item each carry exactly one occurrence of the new education guard; clara.get_firm_setup and clara.commit_firm_setup are byte-identical to their measured baselines (untouched); clara.dismiss_firm_setup_tip exists with the standard firm-setup-door posture, is EXECUTE-unreachable by every machine role, and calls no audit/event/bump/reserve primitive in its own body; and the four untouched helpers plus #894''s widened index are unmoved. The BEHAVIOURAL proof (no audit row, no domain event, a real door call under real roles) is firm-setup-education-tips.test.mjs''s job.';
end
$i935_tail$;
