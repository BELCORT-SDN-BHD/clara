-- 0257_firm_setup_applicability — #891: LET THE FIRM-SETUP CATALOGUE SKIP AN ITEM THAT DOES NOT
-- APPLY TO THIS FIRM.
-- =====================================================================================
-- Spec of record: issue #891 and its Agent Brief (comment dated 2026-09-17, `65fde7f3`), citing
-- #648's own review of `WAVE-DIGEST.md` §3 row 23. Domain words: CONTEXT.md — "Firm setup",
-- "Onboarding plan".
--
-- WHAT IS WRONG, RESTATED FROM THE TICKET. `mpers_eligibility` (a Sdn Bhd's own CA 2016 s.244
-- screen) and `tin` (MyInvois, exempt below RM1M turnover) are asked of every firm and carried as
-- NOT required for commit, because `clara.firm_setup_keys` (0218 §A) has no predicate column and
-- the catalogue is append-only by trigger (`t_firm_setup_keys_append_only`) with `item_key` as its
-- primary key — the twelve shipped rows can never be updated, so a plain added column would sit
-- NULL on all of them forever. The product rules already exist and are not invented here: the
-- pre-admission interview's `eligibilitySegment.appliesTo` reads `prior.entity_type === 'sdn_bhd'`
-- (packages/runtime/workflows/interview.v2.segments.ts:375) and its `tinValidatorGatedByTurnover`
-- exempts a firm whose turnover answer is exactly `'<RM1M'` (interview.v1.core.ts:226-228's
-- `tinExempt`, restated verbatim at interview.v2.segments.ts:64-69). This file mirrors BOTH
-- predicates exactly and invents nothing.
--
-- =====================================================================================
-- APPLICABILITY STORAGE: A DERIVATION DOOR, NOT A SECOND RELATION — AND WHY.
--
-- The Agent Brief offers two shapes: "a second relation keyed by item_key, or a derivation door."
-- A relation would need to carry a stored per-plan verdict that a later correction to `entity_type`
-- or `turnover` would have to keep in sync — a second write path for a fact the plan's own answers
-- already determine. A DERIVATION DOOR needs none of that: `clara._firm_setup_applicability(plan,
-- item_key)` reads the SAME plan's own `entity_type` / `turnover` answer, live, on every call, so
-- an item's applicability is always exactly what today's recorded answers say it is — including
-- the moment right after one of them is CORRECTED (see AC4 below). It is a private helper, in the
-- `_firm_setup_plan` / `_assert_firm_setup_answer` / `_firm_setup_bump` closure's own shape:
-- `security definer`, `search_path` pinned, `revoke all … from public`, reached only from the two
-- doors this file recuts. EXACTLY TWO branches, both hardcoded to the one item_key each predicate
-- names — no expression language, no config table, and every other catalogue row is unconditionally
-- `'applicable'` (Agent Brief "Out of scope": "A general expression language").
--
-- THE THREE VERDICTS. `'applicable'` — asked. `'inapplicable'` — the dependency is answered and the
-- predicate says no; never asked. `'undetermined'` — the dependency (`entity_type` for
-- `mpers_eligibility`, `turnover` for `tin`) is not yet answered on THIS plan; neither asked nor
-- counted, because nothing is known yet. A plan-less firm (`p_plan` null) reads `'undetermined'` for
-- both conditional keys, which composes with every existing plan-less-firm reading (#895, 0256):
-- `_firm_setup_applicability(null, …)` never returns `'inapplicable'`, so it changes nothing about
-- `v_unseeded` / `seeded` for a firm that holds no firm-scope plan at all.
--
-- =====================================================================================
-- `clara.seed_firm_setup_plan`: AN INAPPLICABLE OR UNDETERMINED ITEM IS NOT SEEDED.
--
-- The reconciliation's `insert … select … where not exists (…)` (0218 §E.1, #895's own conditional
-- bump untouched) gains ONE more `and` clause: `clara._firm_setup_applicability(p.id, k.item_key) =
-- 'applicable'`. An item that is inapplicable or undetermined right now simply is not one of the
-- rows this call inserts — it is not seeded, never appears as `pending`, and the answer door's own
-- "reconcile the checklist first" refusal (`firm_setup_item_not_seeded`) is what a caller meets if
-- it tries to answer one anyway, exactly as it already is for any other never-reconciled row. The
-- reconciliation is IDEMPOTENT and callable again: once the dependency it reads is answered, a LATER
-- call picks the now-determined item up. Everything else in this door — the `not exists` half that
-- never touches an existing item, the `v_added > 0` conditional bump (#895), the unconditional audit
-- row and `firm_setup.seeded` event — is untouched, byte for byte.
--
-- =====================================================================================
-- `clara.get_firm_setup`: ITEMS CARRY APPLICABILITY, LIVE; THE REQUIRED COUNTER EXCLUDES BOTH
-- INAPPLICABLE AND UNDETERMINED — AND, WHERE ONE OF THE TWO CONDITIONAL ITEMS IS DETERMINED,
-- APPLICABLE AND ACTUALLY SEEDED, IT NOW COUNTS TOWARD THAT SAME REQUIRED TOTAL.
--
-- Two additions, both self-contained to this ONE door:
--   (1) every item in `items[]` gains an `'applicability'` field — `clara._firm_setup_applicability`
--       called fresh for THIS read, never stored. An item answered before its dependency changed
--       KEEPS its answer (nothing in this file deletes or rewrites an `onboarding_plan_items` row)
--       and is simply reported `applicability: 'inapplicable'` beside that unchanged answer — AC4.
--   (2) `counter.required_total` / `required_answered` — 0218's own `k.required_for_commit`, PLUS
--       `mpers_eligibility` or `tin` specifically, but ONLY while BOTH (a) the item has actually
--       been seeded (`i.id is not null` — it is a real row on THIS plan, not a hypothetical one a
--       caller has not yet reconciled) AND (b) it reads `'applicable'` right now. An item that never
--       got seeded (still undetermined, or settled inapplicable) contributes to neither side; an
--       item that WAS seeded, required and answered, whose dependency is later corrected to make it
--       inapplicable, drops out of BOTH sides on the very next read — "excludes an inapplicable item
--       from numerator and denominator" (AC3), symmetrically for both conditional rows.
--
-- WHY THIS STAYS A `get_firm_setup`-ONLY CONCEPT, NEVER `clara.commit_firm_setup`'s. The catalogue's
-- own `required_for_commit` column is untouched — still `false` on both `mpers_eligibility` and
-- `tin`, exactly as shipped (append-only; this file contains no `update` or `alter table` on
-- `clara.firm_setup_keys` at all). `commit_firm_setup` (0218 §E.4) reads `k.required_for_commit`
-- directly off the catalogue and is NOT recut here — the Agent Brief's "Key interfaces" names only
-- `seed_firm_setup_plan` and `get_firm_setup`, and "Out of scope" excludes widening what blocks a
-- commit. So a Sdn Bhd whose MPERS screen or a >=RM1M firm's TIN sits unanswered still commits
-- successfully; the progress COUNTER on `/settings/setup` shows it as outstanding, honestly, while
-- the checklist itself stays exactly as forgiving as #648 shipped it. This asymmetry is a DELIBERATE,
-- NAMED residual of this file, not an oversight — a candidate for a follow-up ticket if the owner
-- decides the counter's honesty should become a real gate.
--
-- WHY BOTH CONDITIONAL ITEMS ARE TREATED THE SAME WAY FOR THE COUNTER, RATHER THAN ONLY `tin`. The
-- Agent Brief's own "Current behavior" sentence treats them symmetrically — "both carried as not
-- required for commit to keep the gap FROM BLOCKING ANYONE" — i.e., for the SAME reason (the
-- predicate gap this file closes), not because either one is inherently less mandatory than the
-- other. Nothing in the brief distinguishes them for this purpose, and inventing an asymmetric rule
-- for one but not the other would be a second, unstated business decision.
--
-- REGRESSION THIS FILE MEASURED AND DELIBERATELY AVOIDED: gating a conditional item's counter
-- contribution on LIVE applicability ALONE (without also requiring `i.id is not null`) would count
-- `mpers_eligibility` the moment `entity_type` is merely ANSWERED `'sdn_bhd'` — even before any
-- caller has reconciled the checklist again — which would silently raise `required_total` out from
-- under a caller that never re-seeds. `firm-setup.test.mjs`'s own `p648.commit.outstanding` answers
-- `entity_type` as `'sdn_bhd'` (its sample-answer helper's first option) as part of a loop that
-- never seeds again, and asserts `required_total === 8` throughout — this file's `i.id is not null`
-- guard is what keeps that assertion true after this recut, because that cell's own plan never
-- carries a seeded `mpers_eligibility` row.
--
-- WHY `v_unseeded` (and so `seeded`) EXCLUDES AN INAPPLICABLE ROW BUT NOT AN UNDETERMINED ONE.
-- `seeded` reads "TRUE once every catalogue row has a plan item" (`lib/firm-setup/types.ts`'s own
-- comment) — a claim an INAPPLICABLE row can now never satisfy by construction, since this file's
-- seed change means it is never inserted. Left unchanged, `v_unseeded` would never reach zero for a
-- firm whose `entity_type` or `turnover` genuinely settles the predicate the other way, and the
-- "Start firm setup" control would show forever. So `v_unseeded`'s existing `left join … where i.id
-- is null` gains `and clara._firm_setup_applicability(p.id, k.item_key) <> 'inapplicable'`: an
-- inapplicable row is SETTLED (nothing more will ever seed it) and drops out; an UNDETERMINED row
-- still counts (its fate is not yet known), so the reconcile control correctly stays available until
-- the dependency it needs is answered. Measured: for a plan-less firm this changes nothing (§ above).
--
-- =====================================================================================
-- WHAT THIS FILE DOES NOT DO, each with its authority (Agent Brief "Key interfaces" / "Out of
-- scope").
--   * it does NOT edit `0218_firm_setup.sql` or `0256_firm_setup_polish.sql` in place — applied
--     migration bytes are immutable (packages/db/README.md). Both recut bodies below are pasted in
--     full via `create or replace function`, which the tail re-reads rather than trusts for
--     owner/ACL/posture.
--   * it does NOT touch `answer_firm_setup_item`, `defer_firm_setup_item` or `commit_firm_setup` —
--     none of the three own the two named interfaces, and "Out of scope" names no widening of the
--     commit gate. `defer_firm_setup_item` still floors its refusal on `k.required_for_commit`
--     (unmoved, still `false` for both conditional rows), so either one can still be explicitly
--     skipped with a reason once it is seeded.
--   * it does NOT edit `clara.firm_setup_keys` — no `update`, no `alter table`, no new column, no
--     new row. The twelve shipped rows are byte-identical to 0218 §A.1, re-measured at the tail.
--   * it does NOT touch `clara._firm_setup_plan`, `clara._assert_firm_setup_answer` or
--     `clara._firm_setup_bump`, `uq_onboarding_plans_one_firm` (#894, 0255), or any pre-admission
--     interview workflow file (frozen; mirrored, not moved — Agent Brief "Out of scope").
--   * it mints no knowledge key, no event type, no relation and no grant. The one new function is
--     EXECUTE-reachable by nobody, in the shape of the three existing ungranted helpers; neither
--     recut door's signature changes, so `create or replace function` preserves owner and ACL —
--     the tail re-reads both rather than trusting that sentence. No `rig-meta.mjs` cohort is added:
--     `_firm_setup_applicability` is ungranted, and none of `_firm_setup_plan` /
--     `_assert_firm_setup_answer` / `_firm_setup_bump` (0218) nor `_legal_enforcement_mode` (0234)
--     — the estate's other fully-ungranted helpers — carry a cohort entry either; a cohort exists
--     only to police a GRANTED name's presence across a frontier boundary; the migration's own tail
--     below is what polices an ungranted one's posture.
-- =====================================================================================

set local statement_timeout = '5min';   -- runner rule: the first executable statement

-- =====================================================================================
-- §0 PRESTATE. Every claim this file makes about what it is recutting, MEASURED on this rig now —
-- not transcribed from 0218's or 0256's own text, which could have drifted under an earlier ticket
-- in this lane (#894, #895 both already applied here).
-- =====================================================================================
do $i891_pre$
declare v_sha text; v_src text; v_txt text; v_n int;
begin
  -- 0.1 · BOTH TARGET FUNCTIONS EXIST AT THE SIGNATURES THIS FILE RECUTS.
  if to_regprocedure('clara.seed_firm_setup_plan(text)') is null then
    raise exception '#891 prestate: clara.seed_firm_setup_plan(text) is absent -- 0218 must apply first'
      using errcode='CLR10';
  end if;
  if to_regprocedure('clara.get_firm_setup()') is null then
    raise exception '#891 prestate: clara.get_firm_setup() is absent -- 0218 must apply first'
      using errcode='CLR10';
  end if;

  -- 0.2 · THE TWO PRE-IMAGE PINS. MEASURED live on this lane database at frontier 0256 (#894 and
  -- #895 applied; #895 already recut both these functions once). Lane 06's own rig, 2026-09-20,
  -- PostgreSQL 17.11.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara.seed_firm_setup_plan(text)'::regprocedure;
  if v_sha <> '8854fde0be3842fa8dcd656d628a271dc8b0905321c2851362938d6483a2cac2' then
    raise exception '#891 prestate: clara.seed_firm_setup_plan has DRIFTED from its pinned pre-image (sha %) -- re-derive the recut against the live body before applying', v_sha
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara.get_firm_setup()'::regprocedure;
  if v_sha <> 'fec8e6867e0707f319297557ca406c08297a57b8eb5bcf660b3ccfc3dba2a321' then
    raise exception '#891 prestate: clara.get_firm_setup has DRIFTED from its pinned pre-image (sha %) -- re-derive the recut against the live body before applying', v_sha
      using errcode='CLR10';
  end if;

  -- 0.3 · NEITHER RECUT HAS ALREADY LANDED, and the new function is not already taken.
  if to_regprocedure('clara._firm_setup_applicability(uuid,text)') is not null then
    raise exception '#891 prestate: clara._firm_setup_applicability(uuid,text) already exists' using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.seed_firm_setup_plan(text)'::regprocedure;
  if position($tag$_firm_setup_applicability$tag$ in v_src) <> 0 then
    raise exception '#891 prestate: clara.seed_firm_setup_plan already references the applicability door'
      using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.get_firm_setup()'::regprocedure;
  if position($tag$_firm_setup_applicability$tag$ in v_src) <> 0 then
    raise exception '#891 prestate: clara.get_firm_setup already references the applicability door'
      using errcode='CLR10';
  end if;

  -- 0.4 · THE TWO PREDICATE LITERALS THIS FILE HARDCODES ARE STILL CATALOGUE MEMBERS. A future
  -- widening of either allowed_values array would not itself break this file's logic, but this stop
  -- makes the assumption a checked fact rather than a silent one.
  if not exists (select 1 from clara.knowledge_keys where knowledge_key = 'entity_type'
                   and allowed_values ? 'sdn_bhd') then
    raise exception '#891 prestate: entity_type no longer admits ''sdn_bhd'' -- the mpers_eligibility predicate must be re-derived'
      using errcode='CLR10';
  end if;
  if not exists (select 1 from clara.knowledge_keys where knowledge_key = 'turnover_band'
                   and allowed_values ? '<RM1M') then
    raise exception '#891 prestate: turnover_band no longer admits ''<RM1M'' -- the tin exemption predicate must be re-derived'
      using errcode='CLR10';
  end if;

  -- 0.5 · THE CATALOGUE'S OWN SHAPE FOR THE TWO CONDITIONAL ROWS, measured rather than assumed:
  -- both are `capture`, NOT `required_for_commit`, and neither carries a `knowledge_key` (D8/D10) —
  -- exactly the rows whose required-ness this file's counter change may now widen, and whose
  -- catalogue value it must NOT touch.
  select count(*)::int into v_n from clara.firm_setup_keys
   where item_key in ('mpers_eligibility','tin') and item_kind = 'capture'
     and required_for_commit = false and knowledge_key is null;
  if v_n <> 2 then
    raise exception '#891 prestate: mpers_eligibility/tin no longer read capture/not-required/no-knowledge-key -- this file''s counter reasoning must be re-derived'
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from clara.firm_setup_keys;
  if v_n <> 12 then
    raise exception '#891 prestate: the firm setup catalogue holds % rows (expected 12)', v_n using errcode='CLR10';
  end if;

  -- 0.6 · onboarding_plan_items.state STILL ADMITS EXACTLY THESE FOUR VALUES — the derivation
  -- door's own "answered or resolved" dependency check depends on this set being unchanged.
  select pg_get_constraintdef(c.oid) into v_txt from pg_constraint c
   where c.conrelid='clara.onboarding_plan_items'::regclass and c.conname='onboarding_plan_items_state_check';
  if v_txt is distinct from
     'CHECK ((state = ANY (ARRAY[''pending''::text, ''answered''::text, ''resolved''::text, ''deferred''::text])))' then
    raise exception '#891 prestate: onboarding_plan_items_state_check reads {%}, not the pinned four-value set this file''s dependency check depends on', v_txt
      using errcode='CLR10';
  end if;

  -- 0.7 · THE HELPERS BOTH RECUT BODIES CALL ARE PRESENT (read-only dependencies; no pin owed since
  -- neither is recut here, same as 0256 §0.5's own list).
  if to_regprocedure('clara._firm_setup_plan(uuid)') is null
     or to_regprocedure('clara._firm_setup_bump(uuid,uuid)') is null
     or to_regprocedure('clara._reserve_op(uuid,text,text,bytea)') is null
     or to_regprocedure('clara._finish_op(uuid,text,text,jsonb)') is null
     or to_regprocedure('clara._knowledge_row_json(clara.knowledge_records)') is null then
    raise exception '#891 prestate: a helper either recut body calls is absent' using errcode='CLR10';
  end if;

  raise notice '#891 prestate: clean -- clara.seed_firm_setup_plan and clara.get_firm_setup are live at their pinned (post-#895) pre-images, neither already references an applicability door, clara._firm_setup_applicability(uuid,text) is not yet taken, entity_type/turnover_band still admit the two literals this file hardcodes, mpers_eligibility/tin still read capture/not-required/no-knowledge-key over a 12-row catalogue, onboarding_plan_items.state still admits exactly pending/answered/resolved/deferred, and every helper either recut body calls is present.';
end
$i891_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §A — THE DERIVATION DOOR. Ungranted, in the `_firm_setup_plan` / `_assert_firm_setup_answer` /
-- `_firm_setup_bump` closure's own shape. See the file header for why a door rather than a relation.
-- =====================================================================================
create function clara._firm_setup_applicability(p_plan uuid, p_item_key text) returns text
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare v_dep_state text; v_dep_answer jsonb;
begin
  if p_item_key = 'mpers_eligibility' then
    -- eligibilitySegment.appliesTo: prior.entity_type === 'sdn_bhd' (interview.v2.segments.ts:375).
    select i.state, i.answer into v_dep_state, v_dep_answer
      from clara.onboarding_plan_items i
     where i.plan_id = p_plan and i.item_key = 'entity_type';
    if not found or v_dep_state not in ('answered','resolved') then
      return 'undetermined';
    end if;
    if (v_dep_answer #>> '{}') = 'sdn_bhd' then
      return 'applicable';
    end if;
    return 'inapplicable';
  elsif p_item_key = 'tin' then
    -- tinExempt(turnover) = turnover = '<RM1M' (interview.v1.core.ts:226-228; restated verbatim by
    -- interview.v2.segments.ts:64-69's tinValidatorGatedByTurnover).
    select i.state, i.answer into v_dep_state, v_dep_answer
      from clara.onboarding_plan_items i
     where i.plan_id = p_plan and i.item_key = 'turnover';
    if not found or v_dep_state not in ('answered','resolved') then
      return 'undetermined';
    end if;
    if (v_dep_answer #>> '{}') = '<RM1M' then
      return 'inapplicable';
    end if;
    return 'applicable';
  else
    -- The other ten catalogue rows carry no predicate at all (Agent Brief: "the two predicates" —
    -- singular pair, no third).
    return 'applicable';
  end if;
end $$;
revoke all on function clara._firm_setup_applicability(uuid, text) from public;

-- =====================================================================================
-- §B — `clara.seed_firm_setup_plan`, RECUT. ONE new `and` clause on the reconciliation INSERT;
-- every other line — the reservation, the state gate, #895's conditional bump, the audit row and
-- the event — is 0256 §A's body verbatim.
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
  -- admits three values and a fourth would be a CHECK violation (0218 §0.5b).
  --
  -- #891: …AND ONLY A ROW THAT IS APPLICABLE RIGHT NOW. An inapplicable or not-yet-determined row
  -- is simply not one of the rows this call inserts -- it is not asked, and stays not-yet-asked
  -- until a LATER reconciliation finds its dependency answered (see the migration header).
  insert into clara.onboarding_plan_items(
      plan_id, firm_id, item_kind, item_key, question, answer, state, required_for_commit)
  select p.id, p.firm_id,
         case k.item_kind when 'education' then 'todo' else k.item_kind end,
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
-- §C — `clara.get_firm_setup`, RECUT. Every item gains `applicability`; the required counter and
-- `v_unseeded` both become applicability-aware. See the file header for the exact reasoning behind
-- each clause. The items projection's join shape, `required_outstanding`, `catalogue_total` and the
-- whole `confirmed_facts` block are 0256 §B's body verbatim.
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
  ) x;

  select coalesce(jsonb_agg(k.item_key order by k.sort_order), '[]'::jsonb) into v_out
    from clara.firm_setup_keys k
    left join clara.onboarding_plan_items i
      on p.id is not null and i.plan_id = p.id and i.item_key = k.item_key
   where k.required_for_commit and (i.id is null or i.state = 'pending');

  select count(*)::int into v_total from clara.firm_setup_keys;
  -- #891: an INAPPLICABLE row is SETTLED -- this file's seed change means it is never inserted, so
  -- counting it as "still needs seeding" forever would keep `seeded` false for a firm this catalogue
  -- genuinely has nothing left to ask. An UNDETERMINED row still counts: its fate is not yet known,
  -- and the reconcile control must stay available until the dependency it needs is answered.
  select count(*)::int into v_unseeded
    from clara.firm_setup_keys k
    left join clara.onboarding_plan_items i
      on p.id is not null and i.plan_id = p.id and i.item_key = k.item_key
   where i.id is null
     and clara._firm_setup_applicability(p.id, k.item_key) <> 'inapplicable';
  -- #891: EFFECTIVE required total/answered -- the catalogue's own required_for_commit set, PLUS
  -- the two conditional rows exactly while EACH is (a) actually seeded on this plan (i.id is not
  -- null -- a real row, not a hypothetical one nobody has reconciled yet) and (b) reads applicable
  -- right now. An item that never got seeded, or that settled inapplicable, contributes to neither
  -- side; one that WAS seeded, counted and answered, whose dependency is later corrected to make it
  -- inapplicable, drops out of BOTH sides on the very next read. See the migration header for why
  -- the `i.id is not null` guard is load-bearing (it is what keeps `p648.commit.outstanding`'s own
  -- required_total=8 true after this recut) and why this stays a get_firm_setup-only concept.
  select count(*)::int into v_req_total
    from clara.firm_setup_keys k
    left join clara.onboarding_plan_items i
      on p.id is not null and i.plan_id = p.id and i.item_key = k.item_key
   where p.id is not null
     and (k.required_for_commit
          or (k.item_key in ('mpers_eligibility','tin') and i.id is not null
              and clara._firm_setup_applicability(p.id, k.item_key) = 'applicable'));
  select count(*)::int into v_req_done
    from clara.firm_setup_keys k
    join clara.onboarding_plan_items i
      on p.id is not null and i.plan_id = p.id and i.item_key = k.item_key
   where (k.required_for_commit
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
-- file's own text: every claim is measured off pg_catalog. The two recut doors are `_human_ctx`-
-- gated (identity comes off a JWT claim), so — like every other migration in this chain that recuts
-- a gated door — this tail proves the CODE SHAPE landed by reading the committed `prosrc`; the
-- BEHAVIOURAL proof (a real seed/read cycle through `humanQuery`) is
-- `firm-setup-applicability.test.mjs`'s job, run at the gate.
-- =====================================================================================
do $i891_tail$
declare v_src text; v_posture text; v_n int; v_txt text;
begin
  -- 1 · THE NEW DOOR: owner, SECURITY DEFINER, pinned search_path, EXECUTE for nobody -- the exact
  -- posture of the three existing ungranted firm-setup helpers.
  if to_regprocedure('clara._firm_setup_applicability(uuid,text)') is null then
    raise exception '#891 tail: clara._firm_setup_applicability(uuid,text) does not resolve' using errcode='CLR10';
  end if;
  select pg_get_userbyid(p.proowner) || ' | ' || p.prosecdef::text || ' | '
         || coalesce(array_to_string(p.proconfig, ','), '<none>') || ' | '
         || coalesce(array_to_string(p.proacl, ','), '<null>')
    into v_posture from pg_proc p where p.oid = 'clara._firm_setup_applicability(uuid,text)'::regprocedure;
  if v_posture is distinct from
     'clara_fn_owner | true | search_path=clara, pg_temp | clara_fn_owner=X/clara_fn_owner' then
    raise exception '#891 tail: clara._firm_setup_applicability has the wrong posture -- expected owner clara_fn_owner, SECURITY DEFINER, search_path=clara, pg_temp and EXECUTE for nobody; got {%}', v_posture
      using errcode='CLR10';
  end if;
  if has_function_privilege('clara_runtime', 'clara._firm_setup_applicability(uuid,text)'::regprocedure, 'execute')
     or has_function_privilege('clara_agent_ro', 'clara._firm_setup_applicability(uuid,text)'::regprocedure, 'execute')
     or has_function_privilege('clara_authenticated', 'clara._firm_setup_applicability(uuid,text)'::regprocedure, 'execute')
     or has_function_privilege('clara_wake_interactive', 'clara._firm_setup_applicability(uuid,text)'::regprocedure, 'execute')
     or has_function_privilege('clara_wake_proactive', 'clara._firm_setup_applicability(uuid,text)'::regprocedure, 'execute') then
    raise exception '#891 tail: clara._firm_setup_applicability is EXECUTE-reachable by some role -- it must be reachable only from inside the two doors that call it'
      using errcode='CLR10';
  end if;
  -- …and its two hardcoded branches name exactly the two predicate item_keys, nothing else.
  select p.prosrc into v_src from pg_proc p where p.oid = 'clara._firm_setup_applicability(uuid,text)'::regprocedure;
  if position($tag$p_item_key = 'mpers_eligibility'$tag$ in v_src) = 0
     or position($tag$p_item_key = 'tin'$tag$ in v_src) = 0
     or position($tag$item_key = 'entity_type'$tag$ in v_src) = 0
     or position($tag$item_key = 'turnover'$tag$ in v_src) = 0
     or position($tag$'sdn_bhd'$tag$ in v_src) = 0
     or position($tag$'<RM1M'$tag$ in v_src) = 0 then
    raise exception '#891 tail: clara._firm_setup_applicability does not name the two mirrored predicates' using errcode='CLR10';
  end if;

  -- 2 · THE SEED'S SHAPE: the applicability guard is present, and every arm this file did NOT touch
  -- is still there byte for byte (the #895 conditional bump included).
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.seed_firm_setup_plan(text)'::regprocedure;
  if position($tag$and clara._firm_setup_applicability(p.id, k.item_key) = 'applicable'$tag$ in v_src) = 0 then
    raise exception '#891 tail: clara.seed_firm_setup_plan does not gate its reconciliation INSERT on applicability'
      using errcode='CLR10';
  end if;
  foreach v_txt in array array[
      'not exists (select 1 from clara.onboarding_plan_items i',
      'if v_added > 0 then',
      'clara._reserve_op(c.firm, ''seed_firm_setup_plan''',
      'clara._audit(c.firm, c.actor, null, null, ''seed_firm_setup_plan''',
      'firm_setup.seeded',
      'clara._finish_op(c.firm, ''seed_firm_setup_plan''']
  loop
    if position(v_txt in v_src) = 0 then
      raise exception '#891 tail: clara.seed_firm_setup_plan LOST an arm this file must not have touched: %', v_txt
        using errcode='CLR10';
    end if;
  end loop;

  -- 3 · THE READ'S SHAPE: applicability on every item, the required-total/answered/`v_unseeded`
  -- guards, and every shape this file did not intend to change still present.
  select p.prosrc into v_src from pg_proc p where p.oid = 'clara.get_firm_setup()'::regprocedure;
  if position($tag$'applicability', clara._firm_setup_applicability(p.id, k.item_key)) as j,$tag$ in v_src) = 0 then
    raise exception '#891 tail: clara.get_firm_setup does not carry applicability on each item' using errcode='CLR10';
  end if;
  if position($tag$or (k.item_key in ('mpers_eligibility','tin') and i.id is not null
              and clara._firm_setup_applicability(p.id, k.item_key) = 'applicable'))$tag$ in v_src) = 0 then
    raise exception '#891 tail: clara.get_firm_setup''s per-item required flag is not applicability-aware' using errcode='CLR10';
  end if;
  if position($tag$and clara._firm_setup_applicability(p.id, k.item_key) <> 'inapplicable';$tag$ in v_src) = 0 then
    raise exception '#891 tail: clara.get_firm_setup''s v_unseeded does not exclude a settled-inapplicable row' using errcode='CLR10';
  end if;
  if position($tag$or (k.item_key in ('mpers_eligibility','tin') and i.id is not null
              and clara._firm_setup_applicability(p.id, k.item_key) = 'applicable'));$tag$ in v_src) = 0 then
    raise exception '#891 tail: clara.get_firm_setup''s required_total is not applicability-aware' using errcode='CLR10';
  end if;
  if position($tag$or (k.item_key in ('mpers_eligibility','tin')
              and clara._firm_setup_applicability(p.id, k.item_key) = 'applicable'))
     and i.state in ('answered','resolved','deferred');$tag$ in v_src) = 0 then
    raise exception '#891 tail: clara.get_firm_setup''s required_answered is not applicability-aware' using errcode='CLR10';
  end if;
  foreach v_txt in array array[
      'select count(*)::int into v_total from clara.firm_setup_keys;',
      'select coalesce(jsonb_agg(k.item_key order by k.sort_order), ''[]''::jsonb) into v_out',
      'r.knowledge_key = k.knowledge_key and r.superseded_at is null
           and r.state = ''live'' and r.applies_when = ''{}''::jsonb',
      'where r.firm_id = c.firm and r.scope_kind = ''firm'' and r.superseded_at is null
       and r.state = ''live''']
  loop
    if position(v_txt in v_src) = 0 then
      raise exception '#891 tail: clara.get_firm_setup LOST a shape this file must not have touched: %', v_txt
        using errcode='CLR10';
    end if;
  end loop;

  -- 4 · POSTURE, both recut doors. `create or replace function` preserves owner, SECURITY DEFINER,
  -- search_path, plan_cache_mode and ACL when the signature is unchanged -- re-read, not trusted.
  select pg_get_userbyid(p.proowner) || ' | ' || p.prosecdef::text || ' | '
         || coalesce(array_to_string(p.proconfig, ','), '<none>') || ' | '
         || coalesce(array_to_string(p.proacl, ','), '<null>')
    into v_posture from pg_proc p where p.oid = 'clara.seed_firm_setup_plan(text)'::regprocedure;
  if v_posture is distinct from
     'clara_fn_owner | true | search_path=clara, pg_temp,plan_cache_mode=force_custom_plan | clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner' then
    raise exception '#891 tail: clara.seed_firm_setup_plan has the wrong posture after the recut; got {%}', v_posture
      using errcode='CLR10';
  end if;
  select pg_get_userbyid(p.proowner) || ' | ' || p.prosecdef::text || ' | '
         || coalesce(array_to_string(p.proconfig, ','), '<none>') || ' | '
         || coalesce(array_to_string(p.proacl, ','), '<null>')
    into v_posture from pg_proc p where p.oid = 'clara.get_firm_setup()'::regprocedure;
  if v_posture is distinct from
     'clara_fn_owner | true | search_path=clara, pg_temp,plan_cache_mode=force_custom_plan | clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner' then
    raise exception '#891 tail: clara.get_firm_setup has the wrong posture after the recut; got {%}', v_posture
      using errcode='CLR10';
  end if;
  foreach v_txt in array array['clara.seed_firm_setup_plan(text)', 'clara.get_firm_setup()'] loop
    if has_function_privilege('clara_runtime', v_txt::regprocedure, 'execute')
       or has_function_privilege('clara_agent_ro', v_txt::regprocedure, 'execute')
       or has_function_privilege('clara_wake_interactive', v_txt::regprocedure, 'execute')
       or has_function_privilege('clara_wake_proactive', v_txt::regprocedure, 'execute') then
      raise exception '#891 tail: % is EXECUTE-reachable by a machine role after the recut', v_txt
        using errcode='CLR10';
    end if;
  end loop;

  -- 5 · THE CATALOGUE ITSELF DID NOT MOVE: still 12 rows, the same item_keys in the same order, and
  -- mpers_eligibility/tin still read their exact shipped values (this file mints no `update`).
  select count(*)::int into v_n from clara.firm_setup_keys;
  if v_n <> 12 then
    raise exception '#891 tail: clara.firm_setup_keys holds % rows (expected 12) -- this file inserts and edits none', v_n
      using errcode='CLR10';
  end if;
  select string_agg(item_key, ',' order by sort_order) into v_txt from clara.firm_setup_keys;
  if v_txt is distinct from 'legal_name,ssm,entity_type,address,mia,turnover,tin,fye,mpers_eligibility,framework,accounting_basis,currency' then
    raise exception '#891 tail: the catalogue''s item_key order moved -- got {%}', v_txt using errcode='CLR10';
  end if;
  select count(*)::int into v_n from clara.firm_setup_keys
   where item_key in ('mpers_eligibility','tin') and required_for_commit = false and knowledge_key is null;
  if v_n <> 2 then
    raise exception '#891 tail: mpers_eligibility/tin no longer read not-required/no-knowledge-key -- this file must not have edited the catalogue'
      using errcode='CLR10';
  end if;

  -- 6 · NOTHING ELSE IN THE FIRM-SETUP COHORT MOVED: the other three doors, the three other private
  -- helpers, and #894's widened partial unique index.
  select count(*)::int into v_n from pg_proc p
   where p.pronamespace='clara'::regnamespace
     and p.proname in ('answer_firm_setup_item','defer_firm_setup_item','commit_firm_setup',
                       '_firm_setup_plan','_assert_firm_setup_answer','_firm_setup_bump');
  if v_n <> 6 then
    raise exception '#891 tail: the untouched firm-setup cohort has % of its 6 other names (expected all present, none duplicated)', v_n
      using errcode='CLR10';
  end if;
  select pg_get_indexdef(i.indexrelid) into v_txt from pg_index i
   where i.indexrelid = 'clara.uq_onboarding_plans_one_firm'::regclass;
  if v_txt is null or position('scope_kind = ''firm''' in v_txt) = 0 or position('state' in v_txt) <> 0 then
    raise exception '#891 tail: uq_onboarding_plans_one_firm moved -- this file does not touch #894''s index'
      using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.commit_firm_setup(uuid,uuid,text)'::regprocedure;
  if v_src is null or position('where k.required_for_commit' in v_src) = 0
     or position('and (i.id is null or i.state = ''pending'')' in v_src) = 0 then
    raise exception '#891 tail: clara.commit_firm_setup moved -- this file must not have recut the commit gate'
      using errcode='CLR10';
  end if;

  raise notice '#891 tail: OK -- clara._firm_setup_applicability(uuid,text) is a new, ungranted, clara_fn_owner-owned SECURITY DEFINER helper (EXECUTE for nobody, not even clara_authenticated) mirroring exactly the two interview predicates (eligibilitySegment.appliesTo on entity_type=sdn_bhd; tinExempt on turnover=<RM1M), returning applicable/inapplicable/undetermined; clara.seed_firm_setup_plan''s reconciliation now inserts only a row that reads applicable right now, with #895''s conditional bump and every other arm unmoved; clara.get_firm_setup carries a live applicability field on every item, its per-item required flag and its required_total/required_answered counter now also count mpers_eligibility/tin exactly while each is seeded (i.id is not null) AND applicable -- excluding both from either side the moment either is inapplicable or was never seeded -- and v_unseeded excludes a settled-inapplicable row while still counting an undetermined one, with every other projection (required_outstanding, catalogue_total, confirmed_facts) unmoved; both recut doors kept their exact clara_fn_owner/SECURITY DEFINER/search_path/plan_cache_mode/ACL posture and stay EXECUTE-unreachable by every machine role; the twelve catalogue rows, the other three doors, the three other private helpers, #894''s widened index and clara.commit_firm_setup''s own catalogue-driven gate are all untouched.';
end
$i891_tail$;
