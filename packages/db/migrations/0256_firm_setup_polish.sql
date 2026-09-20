-- 0256_firm_setup_polish — #895: THE THREE 0218 DEFECTS #648's OWN FIX ROUND FOUND AND LEFT WHILE
-- THE MIGRATION WAS DELIBERATELY BYTE-FROZEN.
-- =====================================================================================
-- Spec of record: issue #895 and its Agent Brief (comment dated 2026-09-17, `65fde7f3`), citing
-- `WAVE-DIGEST.md` §3 rows 27-29 (#648) and `648-fixround-1.md` N2/N3/N4. Domain words: CONTEXT.md
-- — "Firm setup", "Knowledge revision", "Firm profile fact".
--
-- WHAT THIS FILE FIXES, IN ONE SENTENCE EACH. `clara.seed_firm_setup_plan` stops bumping a plan's
-- CAS token / revision number / revision history when its own reconciliation inserted nothing;
-- `clara.get_firm_setup`'s `counter.required_total` stops reading the catalogue's constant
-- required-row count for a firm that has NO plan at all; and the same door's `confirmed_facts`
-- projection stops showing a WITHDRAWN firm default forever.
--
-- WHY ALL THREE RODE TOGETHER, AND WHY NOW. #648's own fix-round report (`648-fixround-1.md`
-- N2/N3/N4) found all three while `0218_firm_setup.sql` was kept BYTE-FROZEN for that wave's
-- integration, each with a documented reason it was unreachable that round: (1) the seed control
-- only ever renders PRE-seed today, so the wasted bump was invisible; (2) both web consumers
-- null-check `plan_id` before rendering `counter`, so the real-looking fraction never painted; (3)
-- a `knowledge_record_id` carve-out on the web side already hid a withdrawn fact from the
-- Knowledge register's OWN list, so `get_firm_setup`'s stale SQL-side inclusion never surfaced
-- there either. Nothing in 0219-0224 (the very next lane) touched either door, so all three gaps
-- are still exactly where the fix round found them — the AI triage comment on #895 (2026-09-17,
-- `65fde7f3`) re-measured that against the current catalog before this file was written. Riding
-- with #894 (0255) was offered by that same comment and accepted; #894 touches a DIFFERENT object
-- (`uq_onboarding_plans_one_open_firm`) and recuts NEITHER function this file recuts — its own
-- prestate pins `clara.claim_paid_firm` read-only, which this file does not reference at all.
--
-- =====================================================================================
-- DEFECT 1 — `clara.seed_firm_setup_plan` BUMPED THE PLAN EVEN WHEN IT RECONCILED NOTHING.
--
-- The reconciliation itself (`insert … where not exists …`) was always correct: an existing item
-- is never touched. But the door called `clara._firm_setup_bump` UNCONDITIONALLY afterwards —
-- rotating the CAS token, advancing `revision_n` and appending a REVISION SNAPSHOT — even when
-- `get diagnostics v_added = row_count` read zero. A firm whose plan is already fully seeded (the
-- ordinary state after the first seed, or after `firmInterview_v3` pre-filled every row) grows one
-- wasted revision per admin click that lands on `/settings/setup`, if a caller ever seeds more
-- than once. Nothing in the estate calls this door twice today (the web control renders only
-- PRE-seed), which is exactly why #648's fix round could leave it and why this defect needed a
-- deliberate rig probe rather than a production symptom to surface it (see the ticket report).
--
-- THE FIX. The bump moves inside `if v_added > 0 then … end if;`. The audit row and the domain
-- event are UNCHANGED and still fire unconditionally, carrying `seeded=0` on a no-op run: "an
-- admin reconciled the checklist and nothing was missing" stays a readable, receipted fact even
-- though the plan's own token/revision/history do not move. A caller may still safely retry the
-- SAME `op_key` (idempotent replay, unchanged) or reconcile again under a FRESH `op_key` (now a
-- true no-op rather than a wasted revision).
--
-- =====================================================================================
-- DEFECT 2 — `clara.get_firm_setup`'S `counter.required_total` WAS NOT PLAN-AWARE.
--
-- `v_req_total` counted `clara.firm_setup_keys where required_for_commit` — the catalogue's own
-- constant (today 8 rows) — with NO reference to whether this firm even HAS a firm-scope plan.
-- `v_req_done`, by contrast, JOINS the plan (`on p.id is not null and i.plan_id = p.id …`), so for
-- a plan-less firm (`clara._firm_setup_plan` returns an all-NULL row; `p.id` is NULL) it correctly
-- reads 0. The result: `counter = {"required_answered": 0, "required_total": 8}` — a real-looking
-- fraction for a firm that has not even been seeded once, exactly the AI triage's own words
-- ("counts the required total off the catalogue while the answered count joins the plan"). Every
-- production caller of this door is null-checking `plan_id` first (the ticket's own "current
-- behavior"), which is why this stayed invisible rather than why it is correct.
--
-- `v_unseeded` (which feeds the `seeded` boolean, the ONLY externally-visible consumer of that
-- variable) is ALREADY plan-aware, restated here rather than left an accident: its LEFT JOIN
-- carries the identical `p.id is not null` guard, so for a plan-less firm the join matches nothing
-- for ANY catalogue row and `v_unseeded` reads the full catalogue count (today 12) — the same
-- "N of N" a freshly-opened, never-seeded REAL plan would show, and exactly what keeps `seeded`
-- reading an honest `false`. Measured directly (see the ticket report's PROBE 1): this file makes
-- NO functional change to `v_unseeded` or to `seeded`, only to `v_req_total`.
--
-- THE FIX. `v_req_total`'s query gains the identical `and p.id is not null` guard `v_req_done`
-- already carries. A plan-less firm now reads `counter = {"required_answered": 0,
-- "required_total": 0}` — no progress painted against a plan that does not exist, rather than a
-- fraction borrowed from the catalogue alone.
--
-- STATED RESIDUAL, NOT FIXED HERE: `required_outstanding` (`v_out`) is built the same
-- plan-unaware-looking way (its LEFT JOIN carries `p.id is not null` too, so for a plan-less firm
-- EVERY required catalogue key is listed as "outstanding" — arguably true of a plan that has never
-- been opened, and unlike `required_total` it is not presented as a FRACTION of anything, so it
-- carries no denominator to look dishonest against). #895's Agent Brief names `counter.required_
-- total` and `v_unseeded` only ("required total and unseeded count plan-aware"); `required_
-- outstanding` is untouched and is a candidate for a follow-up ticket if a future caller ever
-- renders it before checking `plan_id`.
--
-- =====================================================================================
-- DEFECT 3 — `confirmed_facts` DID NOT FILTER OUT A WITHDRAWN FIRM DEFAULT.
--
-- The per-ITEM projection two blocks above (0218 §F, `v_items`'s own `knowledge_records` join)
-- already filters `r.superseded_at is null and r.state = 'live'` before it will attach a
-- `knowledge_record_id` to a catalogue row. The `confirmed_facts` projection, built from the SAME
-- `clara.knowledge_records` relation a few lines later, filtered only `r.superseded_at is null` —
-- and `clara.withdraw_knowledge` (0192 §E.4) appends a revision with `state = 'withdrawn'` and
-- `superseded_at` left NULL, because `ck_knowledge_records_state` constrains BOTH `live` and
-- `withdrawn` rows to a null `superseded_at` (`(superseded_at is null) = (state in ('live',
-- 'withdrawn'))`, measured live below). So a withdrawn firm default passed the item projection's
-- own filter's FIRST half, failed the second (`state = 'live'`) there and correctly disappeared
-- from `items[].knowledge_record_id` — but `confirmed_facts` never carried that second half at
-- all, and kept listing the withdrawn record forever, with `state: "withdrawn"` sitting right on
-- the object as the one clue the read never acted on. Measured live (ticket report PROBE 3):
-- answer `currency`, withdraw the captured record, re-read — the withdrawn record survives in
-- `confirmed_facts` on the UNPATCHED body.
--
-- THE FIX. `and r.state = 'live'` — the exact clause the per-item join already carries — is added
-- to `confirmed_facts`'s own `where`. A live fact stays, a withdrawn one leaves, and a SUPERSEDED
-- one was already excluded by the pre-existing `superseded_at is null` half (a superseded
-- revision's `superseded_at` is never null — `ck_knowledge_records_state`'s same clause forces the
-- opposite for that state).
--
-- =====================================================================================
-- WHAT THIS FILE DOES NOT DO, each with its authority (Agent Brief "Out of scope" / "Key
-- interfaces").
--   * it does NOT edit `0218_firm_setup.sql` in place — applied migration bytes are immutable
--     (packages/db/README.md). Both bodies are recut here, in full, by `create or replace
--     function`, which the tail re-reads rather than trusts for owner/ACL/posture.
--   * it does NOT touch `answer_firm_setup_item`, `defer_firm_setup_item` or `commit_firm_setup` —
--     none of the three defects lives in any of them, and the Agent Brief's "Key interfaces" names
--     only `seed_firm_setup_plan` and `get_firm_setup`.
--   * it does NOT touch `#891` or `#892` (Agent Brief "Out of scope"), `clara.firm_setup_keys`, the
--     partial unique index #894 (0255) just widened, or `clara._firm_setup_plan` /
--     `clara._assert_firm_setup_answer` / `clara._firm_setup_bump` — every helper this file's two
--     doors call stays byte-identical, pinned below and re-read at the tail.
--   * it mints NO knowledge key, NO event type, NO relation and NO grant. Both recut functions
--     keep their EXACT pre-image signature, so `create or replace function` preserves owner and
--     ACL — the tail re-reads both rather than trusting that sentence. No `rig-meta.mjs` cohort
--     changes: `FIRM_SETUP_0218_COHORT` already lists both names under the human ACL boundary, and
--     this file adds no name and moves no grant, so that cohort needs no edit (the #894 precedent:
--     an object-only or body-only change that touches no grant lands with zero `rig-meta.mjs`
--     diff).
-- =====================================================================================

set local statement_timeout = '5min';   -- runner rule: the first executable statement

-- =====================================================================================
-- §0 PRESTATE. Every claim this file makes about what it is recutting, MEASURED on this rig now —
-- not transcribed from 0218's own text, which could have drifted under an earlier lane ticket.
-- =====================================================================================
do $i895_pre$
declare v_sha text; v_src text; v_txt text;
begin
  -- 0.1 · BOTH TARGET FUNCTIONS EXIST AT THE SIGNATURES THIS FILE RECUTS.
  if to_regprocedure('clara.seed_firm_setup_plan(text)') is null then
    raise exception '#895 prestate: clara.seed_firm_setup_plan(text) is absent -- 0218 must apply first'
      using errcode='CLR10';
  end if;
  if to_regprocedure('clara.get_firm_setup()') is null then
    raise exception '#895 prestate: clara.get_firm_setup() is absent -- 0218 must apply first'
      using errcode='CLR10';
  end if;

  -- 0.2 · THE TWO PRE-IMAGE PINS. MEASURED live on this lane database at frontier 0255 (#894
  -- applied, touches neither function), PostgreSQL 17.11. Lane 06's own rig, 2026-09-20.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara.seed_firm_setup_plan(text)'::regprocedure;
  if v_sha <> 'e610ca8703948cdd5198467d8a99d0c4aa774fabbf4b5bb654ff67b816964f16' then
    raise exception '#895 prestate: clara.seed_firm_setup_plan has DRIFTED from its pinned pre-image (sha %) -- re-derive the recut against the live body before applying', v_sha
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara.get_firm_setup()'::regprocedure;
  if v_sha <> '4179599f143a313b9a7a6880d0b5a6473157b4a54b1b0bc37476e7a087519f78' then
    raise exception '#895 prestate: clara.get_firm_setup has DRIFTED from its pinned pre-image (sha %) -- re-derive the recut against the live body before applying', v_sha
      using errcode='CLR10';
  end if;

  -- 0.3 · NEITHER RECUT HAS ALREADY LANDED (a second application of this file, or a build that
  -- shipped the fix another way, would otherwise be indistinguishable from a clean run).
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.seed_firm_setup_plan(text)'::regprocedure;
  if position($tag$#895$tag$ in v_src) <> 0 then
    raise exception '#895 prestate: clara.seed_firm_setup_plan already carries a #895 marker'
      using errcode='CLR10';
  end if;
  if position($tag$if v_added > 0 then$tag$ in v_src) <> 0 then
    raise exception '#895 prestate: clara.seed_firm_setup_plan already conditions its bump on v_added'
      using errcode='CLR10';
  end if;

  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.get_firm_setup()'::regprocedure;
  if position($tag$#895$tag$ in v_src) <> 0 then
    raise exception '#895 prestate: clara.get_firm_setup already carries a #895 marker'
      using errcode='CLR10';
  end if;
  if position($tag$where required_for_commit and p.id is not null$tag$ in v_src) <> 0 then
    raise exception '#895 prestate: clara.get_firm_setup already gates required_total on p.id'
      using errcode='CLR10';
  end if;
  if position($tag$r.superseded_at is null
       and r.state = 'live'$tag$ in v_src) <> 0 then
    raise exception '#895 prestate: clara.get_firm_setup already filters confirmed_facts on r.state'
      using errcode='CLR10';
  end if;
  -- …and the exact PRE-image fragments this file replaces are still there, byte for byte.
  if position($tag$select count(*)::int into v_req_total from clara.firm_setup_keys where required_for_commit;$tag$
      in v_src) = 0 then
    raise exception '#895 prestate: clara.get_firm_setup''s required_total query text has changed -- re-derive the splice'
      using errcode='CLR10';
  end if;
  if position($tag$where r.firm_id = c.firm and r.scope_kind = 'firm' and r.superseded_at is null$tag$
      in v_src) = 0 then
    raise exception '#895 prestate: clara.get_firm_setup''s confirmed_facts where-clause text has changed -- re-derive the splice'
      using errcode='CLR10';
  end if;

  -- 0.4 · THE MEASURED REASON DEFECT 3 EXISTS AT ALL: `ck_knowledge_records_state` constrains
  -- BOTH `live` and `withdrawn` to a null `superseded_at`, so `superseded_at is null` alone can
  -- never distinguish the two. If this constraint has moved, the fix above no longer follows from
  -- the reasoning in this file's header and must be re-derived.
  select pg_get_constraintdef(c.oid) into v_txt from pg_constraint c
   where c.conrelid = 'clara.knowledge_records'::regclass and c.conname = 'ck_knowledge_records_state';
  if v_txt is distinct from
     'CHECK (((superseded_at IS NULL) = (state = ANY (ARRAY[''live''::text, ''withdrawn''::text]))))' then
    raise exception '#895 prestate: ck_knowledge_records_state reads {%}, not the pinned text this file''s DEFECT 3 reasoning depends on', v_txt
      using errcode='CLR10';
  end if;

  -- 0.5 · THE FOUR HELPERS BOTH DOORS CALL ARE UNTOUCHED BY THIS FILE (read-only dependencies; no
  -- pin owed under packages/db/README.md's rule since neither is recut here, but their PRESENCE at
  -- the signatures the recut bodies call is a real prestate, same as 0218 §0.2's own list).
  if to_regprocedure('clara._firm_setup_plan(uuid)') is null
     or to_regprocedure('clara._firm_setup_bump(uuid,uuid)') is null
     or to_regprocedure('clara._reserve_op(uuid,text,text,bytea)') is null
     or to_regprocedure('clara._finish_op(uuid,text,text,jsonb)') is null
     or to_regprocedure('clara._knowledge_row_json(clara.knowledge_records)') is null then
    raise exception '#895 prestate: a helper either recut body calls is absent' using errcode='CLR10';
  end if;

  raise notice '#895 prestate: clean -- clara.seed_firm_setup_plan and clara.get_firm_setup are live at their pinned pre-images, neither already carries a #895 marker or this file''s own fix, the exact pre-image fragments this file splices are present byte for byte, ck_knowledge_records_state reads the text DEFECT 3''s reasoning depends on (live and withdrawn both force a null superseded_at), and every helper either body calls is present.';
end
$i895_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §A — `clara.seed_firm_setup_plan`, RECUT. DEFECT 1: the bump is now conditional on `v_added > 0`.
-- The full 0218 §E.1 body; the ONLY change is the `if v_added > 0 then … end if;` wrapping the
-- existing `clara._firm_setup_bump` call. Nothing else moves — same reservation, same state gate,
-- same reconciliation INSERT, same audit row, same event, same result shape, same op-key finish.
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

  -- #895 DEFECT 1: a reconciliation that inserts NOTHING must leave the plan's own CAS token,
  -- revision number and revision history untouched. The audit row and the domain event below
  -- still fire UNCONDITIONALLY, carrying seeded=0 on a no-op run, so "an admin reconciled and
  -- nothing was missing" stays a receipted, readable fact even though nothing about the plan
  -- itself moved. A replay under the SAME op_key was already, and remains, unaffected by this —
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
-- §B — `clara.get_firm_setup`, RECUT. DEFECT 2: `counter.required_total` gains the same
-- `p.id is not null` guard `required_answered` already carries. DEFECT 3: `confirmed_facts` gains
-- the `r.state = 'live'` filter the per-item join two blocks above already carries. The full 0218
-- §F body otherwise, unchanged — same items projection, same required_outstanding query (§895's
-- header states why that one is a residual, not fixed here), same catalogue_total, same
-- confirmed_facts columns.
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
  -- #895: ALREADY plan-aware, restated here rather than left an accident of the LEFT JOIN's own
  -- predicate below. For a plan-less firm (p.id null) the join matches NOTHING for any catalogue
  -- row, so every row counts as unseeded -- the same "N of N" a freshly-opened, never-seeded REAL
  -- plan would show -- which is exactly what keeps `seeded` two blocks below reading an honest
  -- `false`. Measured (ticket #895 report, PROBE 1): this file makes NO functional change here.
  select count(*)::int into v_unseeded
    from clara.firm_setup_keys k
    left join clara.onboarding_plan_items i
      on p.id is not null and i.plan_id = p.id and i.item_key = k.item_key
   where i.id is null;
  -- #895 DEFECT 2: the catalogue's constant required-row count is real regardless of whether a
  -- plan exists, but painting it as THIS FIRM's required_total before a plan exists reads like
  -- real progress (0 of N) against a plan that has never been opened. Gains the identical
  -- `p.id is not null` guard `v_req_done` below already carries -- a plan-less firm now reads
  -- counter = {0, 0}, never a fraction borrowed from the catalogue alone.
  select count(*)::int into v_req_total from clara.firm_setup_keys
   where required_for_commit and p.id is not null;
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
     -- #895 DEFECT 3: the per-item join above already adds `and r.state = 'live'` on top of
     -- `superseded_at is null` (0218 §F); this projection carried only the second half. Since
     -- `ck_knowledge_records_state` constrains BOTH `live` and `withdrawn` rows to a null
     -- `superseded_at`, a withdrawn firm default stayed in confirmed_facts forever. Adding the
     -- SAME live-state filter the per-item join already carries is the whole fix: a live fact
     -- stays, a withdrawn one leaves, and a superseded one was already excluded by the
     -- pre-existing half (a superseded revision's superseded_at is never null).
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
-- §T TAIL CENSUS. Re-read the COMMITTED catalog and say what it found. Nothing here trusts this
-- file's own text: every claim is measured off pg_catalog. `seed_firm_setup_plan` and
-- `get_firm_setup` are `_human_ctx`-gated (identity comes off a JWT claim), so — like every other
-- migration in this chain that recuts a gated door — this tail proves the CODE SHAPE landed by
-- reading the committed `prosrc`; the BEHAVIOURAL proof (a real seed/read cycle through
-- `humanQuery`) is `firm-setup.test.mjs`'s job, run at the gate.
-- =====================================================================================
do $i895_tail$
declare v_src text; v_posture text; v_n int; v_txt text;
begin
  -- 1 · DEFECT 1's SHAPE: the bump is inside a `v_added > 0` guard, and every arm this file did
  -- NOT touch is still there byte for byte.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.seed_firm_setup_plan(text)'::regprocedure;
  if position($tag$if v_added > 0 then
    p := clara._firm_setup_bump(p.id, c.actor);
  end if;$tag$ in v_src) = 0 then
    raise exception '#895 tail: clara.seed_firm_setup_plan does not condition its bump on v_added > 0'
      using errcode='CLR10';
  end if;
  foreach v_txt in array array[
      'not exists (select 1 from clara.onboarding_plan_items i',
      'clara._reserve_op(c.firm, ''seed_firm_setup_plan''',
      'clara._audit(c.firm, c.actor, null, null, ''seed_firm_setup_plan''',
      'firm_setup.seeded',
      'clara._finish_op(c.firm, ''seed_firm_setup_plan''']
  loop
    if position(v_txt in v_src) = 0 then
      raise exception '#895 tail: clara.seed_firm_setup_plan LOST an arm this file must not have touched: %', v_txt
        using errcode='CLR10';
    end if;
  end loop;

  -- 2 · DEFECT 2's SHAPE, and DEFECT 3's, both read off the committed get_firm_setup body.
  select p.prosrc into v_src from pg_proc p where p.oid = 'clara.get_firm_setup()'::regprocedure;
  if position($tag$select count(*)::int into v_req_total from clara.firm_setup_keys
   where required_for_commit and p.id is not null;$tag$ in v_src) = 0 then
    raise exception '#895 tail: clara.get_firm_setup''s required_total is not gated on p.id is not null'
      using errcode='CLR10';
  end if;
  if position($tag$where r.firm_id = c.firm and r.scope_kind = 'firm' and r.superseded_at is null
       and r.state = 'live'$tag$ in v_src) = 0 then
    raise exception '#895 tail: clara.get_firm_setup''s confirmed_facts where-clause does not filter on r.state = ''live'''
      using errcode='CLR10';
  end if;
  -- …and the OLD plan-unaware required_total text is GONE.
  if position($tag$select count(*)::int into v_req_total from clara.firm_setup_keys where required_for_commit;$tag$
      in v_src) <> 0 then
    raise exception '#895 tail: clara.get_firm_setup still carries the plan-unaware required_total text'
      using errcode='CLR10';
  end if;
  -- …v_unseeded, required_outstanding, catalogue_total and the items/confirmed_facts SHAPES this
  -- file did not intend to change are still there.
  foreach v_txt in array array[
      'select count(*)::int into v_unseeded',
      'select coalesce(jsonb_agg(k.item_key order by k.sort_order), ''[]''::jsonb) into v_out',
      'select count(*)::int into v_total from clara.firm_setup_keys;',
      'r.knowledge_key = k.knowledge_key and r.superseded_at is null
           and r.state = ''live'' and r.applies_when = ''{}''::jsonb']
  loop
    if position(v_txt in v_src) = 0 then
      raise exception '#895 tail: clara.get_firm_setup LOST a shape this file must not have touched: %', v_txt
        using errcode='CLR10';
    end if;
  end loop;

  -- 3 · POSTURE. `create or replace function` preserves owner, SECURITY DEFINER, search_path,
  -- plan_cache_mode and ACL when the signature is unchanged -- a claim about the server, re-read
  -- rather than trusted (0218 §J / 0212 §T's own rule).
  select pg_get_userbyid(p.proowner) || ' | ' || p.prosecdef::text || ' | '
         || coalesce(array_to_string(p.proconfig, ','), '<none>') || ' | '
         || coalesce(array_to_string(p.proacl, ','), '<null>')
    into v_posture from pg_proc p where p.oid = 'clara.seed_firm_setup_plan(text)'::regprocedure;
  if v_posture is distinct from
     'clara_fn_owner | true | search_path=clara, pg_temp,plan_cache_mode=force_custom_plan | clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner' then
    raise exception '#895 tail: clara.seed_firm_setup_plan has the wrong posture after the recut; got {%}', v_posture
      using errcode='CLR10';
  end if;
  select pg_get_userbyid(p.proowner) || ' | ' || p.prosecdef::text || ' | '
         || coalesce(array_to_string(p.proconfig, ','), '<none>') || ' | '
         || coalesce(array_to_string(p.proacl, ','), '<null>')
    into v_posture from pg_proc p where p.oid = 'clara.get_firm_setup()'::regprocedure;
  if v_posture is distinct from
     'clara_fn_owner | true | search_path=clara, pg_temp,plan_cache_mode=force_custom_plan | clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner' then
    raise exception '#895 tail: clara.get_firm_setup has the wrong posture after the recut; got {%}', v_posture
      using errcode='CLR10';
  end if;
  -- …and ZERO MACHINE REACH, unmoved: still not one of the eight 0218 names is EXECUTE-reachable
  -- by any machine role.
  foreach v_txt in array array['clara.seed_firm_setup_plan(text)', 'clara.get_firm_setup()'] loop
    if has_function_privilege('clara_runtime', v_txt::regprocedure, 'execute')
       or has_function_privilege('clara_agent_ro', v_txt::regprocedure, 'execute')
       or has_function_privilege('clara_wake_interactive', v_txt::regprocedure, 'execute')
       or has_function_privilege('clara_wake_proactive', v_txt::regprocedure, 'execute') then
      raise exception '#895 tail: % is EXECUTE-reachable by a machine role after the recut', v_txt
        using errcode='CLR10';
    end if;
  end loop;

  -- 4 · NOTHING ELSE IN THE 0218 COHORT MOVED. The three other doors, the catalogue table and the
  -- partial unique index #894 widened are untouched by this file (no `create or replace`, no
  -- `alter`, no `drop` naming any of them).
  select count(*)::int into v_n from pg_proc p
   where p.pronamespace='clara'::regnamespace
     and p.proname in ('answer_firm_setup_item','defer_firm_setup_item','commit_firm_setup',
                       '_firm_setup_plan','_assert_firm_setup_answer','_firm_setup_bump');
  if v_n <> 6 then
    raise exception '#895 tail: the untouched firm-setup cohort has % of its 6 other names (expected all present, none duplicated)', v_n
      using errcode='CLR10';
  end if;
  select pg_get_indexdef(i.indexrelid) into v_txt from pg_index i
   where i.indexrelid = 'clara.uq_onboarding_plans_one_firm'::regclass;
  if v_txt is null or position('scope_kind = ''firm''' in v_txt) = 0 or position('state' in v_txt) <> 0 then
    raise exception '#895 tail: uq_onboarding_plans_one_firm moved -- this file does not touch #894''s index'
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from clara.firm_setup_keys;
  if v_n <> 12 then
    raise exception '#895 tail: clara.firm_setup_keys holds % rows (expected 12) -- this file inserts none', v_n
      using errcode='CLR10';
  end if;

  raise notice '#895 tail: OK -- clara.seed_firm_setup_plan bumps the plan''s CAS token, revision number and revision history ONLY when its own reconciliation inserted at least one row, while the audit row and the firm_setup.seeded event still fire unconditionally (seeded=0 on a no-op run); clara.get_firm_setup''s counter.required_total is now gated on p.id is not null exactly as required_answered already was, so a plan-less firm reads counter={0,0} rather than a real-looking fraction borrowed from the catalogue alone, while v_unseeded/seeded stay answer-identical (already plan-aware, confirmed by the removed old text''s absence and every other shape''s presence); confirmed_facts now filters r.state = ''live'' exactly as the per-item join two blocks above already does, so a withdrawn firm default leaves it, a live one stays and a superseded one remains excluded by the pre-existing superseded_at half; both recut functions kept their exact clara_fn_owner/SECURITY DEFINER/search_path/plan_cache_mode/ACL posture and stay EXECUTE-unreachable by every machine role; and the other six names in the 0218 cohort, clara.firm_setup_keys''s twelve rows and #894''s widened partial unique index are all untouched.';
end
$i895_tail$;
