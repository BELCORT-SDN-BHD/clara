-- 0288_seeding_lane_retired — #1012 (riders wave 3, lane 07): RETIRE THE PRIOR-GL SEEDING LANE.
-- =====================================================================================
-- Spec of record: ticket #1012's Agent Brief (ready-for-agent), which carries the owner's
-- ruling of 2026-09-20 on #983 (closed): the prior-GL seeding lane gets NO browser entrance,
-- because the product direction is the Client KB — "用户不必先手工登记交易对方绑定，Clara 才能开始
-- 工作" (docs/PRD.md, Client Knowledge). Nobody pre-registers by hand what Clara can learn from
-- a source, so the lane that asked a professional to tick a pre-registration list has no
-- successor UI to build: it is retired instead.
--
-- WHAT THIS FILE DOES, IN ONE SENTENCE. Three WRITE doors — `clara.create_seeding_batch`,
-- `clara.tick_seeding_proposal`, `clara.decline_seeding_proposal` — are recut IN PLACE to one
-- shared typed refusal (CLR34, `detail.reason = 'seeding_lane_retired'`, one message), and
-- nothing else in the lane moves.
--
-- WHAT DOES NOT MOVE, AND WHY EACH ONE STAYS.
--   · `clara.cancel_seeding_batch` / `clara.complete_seeding_batch` — BYTE-UNCHANGED, pinned in
--     the prestate AND re-pinned in the tail. A batch left open at the moment of retirement
--     must still be closeable by the firm that owns it; retiring the closers would strand it.
--   · Every READ of a batch or a proposal (the two relations' RLS policies, the web client's
--     PostgREST reads) — untouched. All history stays readable: this file deletes no batch, no
--     proposal and no page.
--   · The two relations themselves, their CHECK constraints, their policies and their grants.
--   · `clara.list_review_queue` and the `document_capabilities` rows for `prior_gl` — those two
--     are #1012's own work as well, and they are spliced/republished in §C and §D below.
--   · The signature, the owner, the SECURITY DEFINER posture, the `search_path` and the ACL of
--     all three recut doors. The retirement must answer a TYPED REFUSAL to the caller who could
--     reach the door yesterday, which is only possible while that caller can still reach it —
--     a revoked grant would answer `42501 insufficient_privilege` instead, which is the wrong
--     sentence and the wrong shape for the web layer's refusal mapping. So no grant moves: the
--     runtime lane still holds EXECUTE on the creator, the human lane on the two deciders, and
--     nobody gains anything.
--
-- WHY A REFUSAL AND NOT A DROP (the 0271/#1003 question, answered the other way). #1003 dropped
-- `clara.create_account_set_v1` because it had zero live callers and a dropped body needs no
-- re-derivation. These three have live callers TODAY — the runtime's seeding-prepare route, the
-- web Reports panel's tick/decline dialogs — and a caller that meets `42883 undefined_function`
-- reports an internal error, not a retirement. The estate's own idiom for that case is 0007's
-- `clara.ingest_document`: keep the signature, keep the arity, answer a deterministic typed
-- retirement. This file follows 0007, not 0271.
--
-- WHY THE REFUSAL IS THE WHOLE BODY. The three doors' first statements were, respectively, a
-- `_reserve_op` idempotency reservation (creator) and a `clara._human_ctx(role_rank('admin'))`
-- ladder (both deciders). Raising BEFORE either one is deliberate: the retirement must write
-- nothing at all, and a reservation is a write (`clara.op_receipts`). A caller who replays a
-- retired op_key therefore gets the same refusal every time rather than a cached receipt — the
-- lane has no state to be idempotent about any more. The cost, named honestly: the deciders no
-- longer distinguish "not an admin" from "retired", and the creator no longer distinguishes
-- "not a prior GL" from "retired". That is the point of a retirement — the answer does not
-- depend on the request — and no access is loosened by it: the ACLs above are unchanged, so
-- exactly the roles that could call these doors yesterday can call them today, and receive a
-- refusal.
--
-- REDO-SAFE (#957), AND BIMODAL BY CONSTRUCTION. Every pin on a body this file RECUTS is
-- written to succeed on either branch: FIRST APPLY (the live body is the measured pre-image,
-- pinned by sha) or REDO (the live body already carries this file's own retirement marker).
-- `CLARA_MIGRATION_REDO` can therefore only ever exercise the second branch — so the FIRST
-- branch was proven by hand, inside a rolled-back transaction that restored the three
-- pre-images and ran §A verbatim (see the ticket report for the transcript). Pins on bodies
-- this file MUST NOT touch are hard, single-valued and re-asserted in the tail.
--
-- PRE-IMAGE PINS, MEASURED ON clara_l07 (LANE 07's OWN RIG) ON 2026-09-23, off `pg_proc.prosrc`,
-- after this lane's earlier ticket #899 (0287) had applied:
--   · clara.create_seeding_batch(uuid,uuid,jsonb,text)
--       cb71109bcb19774b0b9a3cc1ab1c7df308d50f852aa71641e9ba34ec9ddca4b6
--   · clara.tick_seeding_proposal(uuid,text)
--       17830ded558b0ffcd62b88ada6dab9684dc3ac001589aace557602fd5079084b
--   · clara.decline_seeding_proposal(uuid,text,text)
--       3cbf7183bde1a411aab8541f3b30d96390cc1f451f887fd17ca7c0196871ad33
--   · clara.cancel_seeding_batch(uuid,text,text)   — MUST NOT MOVE
--       0b655b1a5d23920593ae3f41dd8942c0bfaa1cdc7a89daba64eaf50a2ac7eba5
--   · clara.complete_seeding_batch(uuid,text)      — MUST NOT MOVE
--       96a62e0c02387980629ce40ffea06d4a2d4a66dbefb888dac2059e12679bf7ba
--
-- NO NEW GRANTED OBJECT, NO rig-meta COHORT. This file creates no function, table, column,
-- trigger, policy or grant: it recuts three already-granted bodies in place. `rig-meta.mjs`'s
-- cohorts audit GRANT correctness on NEWLY introduced callable objects, and there is none here,
-- so the grant matrix is unchanged BY DESIGN (the three names stay exactly where they are in
-- WAVE_B_HUMAN_FNS / WAVE_B_RUNTIME_FNS, with a comment naming this file). It still ships its
-- OWN preintegration gate (`seeding-lane-retired-preintegration-gate.mjs`) because it ships a
-- NEW test file that must quiet-skip, rather than hard-fail, on a chain that predates 0288.
-- =====================================================================================

set local statement_timeout = '5min';   -- runner rule: statement_timeout is the first executable statement
set local lock_timeout = '5s';

-- =====================================================================================
-- §A  PRESTATE. Everything this file builds on, measured on the lane database, never
--     transcribed from another file's text.
-- =====================================================================================
do $p1012_pre$
declare
  v_creator  text := 'clara.create_seeding_batch(uuid,uuid,jsonb,text)';
  v_ticker   text := 'clara.tick_seeding_proposal(uuid,text)';
  v_decliner text := 'clara.decline_seeding_proposal(uuid,text,text)';
  v_cancel   text := 'clara.cancel_seeding_batch(uuid,text,text)';
  v_complete text := 'clara.complete_seeding_batch(uuid,text)';
  v_sha text; v_redo boolean; r record; v_n int;
begin
  -- (a) THE FIVE LANE DOORS ALL RESOLVE AT THEIR EXACT SIGNATURES. A missing one means this
  --     file is being applied out of order, or against an estate that never had 0017.
  foreach v_sha in array array[v_creator, v_ticker, v_decliner, v_cancel, v_complete] loop
    if to_regprocedure(v_sha) is null then
      raise exception '#1012 prestate: % does not resolve -- 0017_wave_b.sql must apply first', v_sha
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (b) THE THREE RECUT TARGETS, BIMODALLY PINNED. FIRST APPLY requires the measured
  --     pre-image; a REDO is recognised by this file's OWN marker already being in the body.
  for r in select * from (values
      (v_creator,  'cb71109bcb19774b0b9a3cc1ab1c7df308d50f852aa71641e9ba34ec9ddca4b6'),
      (v_ticker,   '17830ded558b0ffcd62b88ada6dab9684dc3ac001589aace557602fd5079084b'),
      (v_decliner, '3cbf7183bde1a411aab8541f3b30d96390cc1f451f887fd17ca7c0196871ad33')
      ) as t(sig, want) loop
    select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex'),
           position('seeding_lane_retired' in p.prosrc) > 0
      into v_sha, v_redo
      from pg_proc p where p.oid = r.sig::regprocedure;
    if v_redo then
      raise notice '#1012 prestate: % already carries the retirement marker -- REDO branch (CLARA_MIGRATION_REDO of this same file).', r.sig;
    elsif v_sha is distinct from r.want then
      raise exception '#1012 prestate: % has DRIFTED from its measured pre-image (got %, expected %) -- re-measure on THIS database before recutting it',
        r.sig, v_sha, r.want using errcode = 'CLR10';
    end if;
  end loop;

  -- (c) THE TWO CLOSERS THIS FILE MUST NOT TOUCH, hard-pinned. A batch left open at retirement
  --     is closed through exactly these two, so a drift here is a reason to STOP, not to adapt.
  for r in select * from (values
      (v_cancel,   '0b655b1a5d23920593ae3f41dd8942c0bfaa1cdc7a89daba64eaf50a2ac7eba5'),
      (v_complete, '96a62e0c02387980629ce40ffea06d4a2d4a66dbefb888dac2059e12679bf7ba')
      ) as t(sig, want) loop
    select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
      from pg_proc p where p.oid = r.sig::regprocedure;
    if v_sha is distinct from r.want then
      raise exception '#1012 prestate: % has DRIFTED from its measured pre-image (got %) -- this file must not touch it, so re-measure before applying',
        r.sig, v_sha using errcode = 'CLR10';
    end if;
  end loop;

  -- (d) THE ACL POSTURE THE RECUT MUST PRESERVE, measured rather than assumed: the creator is
  --     runtime-only, both deciders are human-only, and NO role beyond those holds EXECUTE.
  if not has_function_privilege('clara_runtime', v_creator::regprocedure, 'execute')
     or has_function_privilege('clara_authenticated', v_creator::regprocedure, 'execute')
     or has_function_privilege('clara_agent_ro', v_creator::regprocedure, 'execute') then
    raise exception '#1012 prestate: % is not the runtime-only door this file preserves', v_creator
      using errcode = 'CLR10';
  end if;
  foreach v_sha in array array[v_ticker, v_decliner] loop
    if not has_function_privilege('clara_authenticated', v_sha::regprocedure, 'execute')
       or has_function_privilege('clara_runtime', v_sha::regprocedure, 'execute')
       or has_function_privilege('clara_agent_ro', v_sha::regprocedure, 'execute') then
      raise exception '#1012 prestate: % is not the human-only door this file preserves', v_sha
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (e) THE HISTORY THIS FILE PROMISES TO LEAVE READABLE, counted now so the tail can prove
  --     the same counts after. On a seeded lane rig this is usually 0/0; on hosted it is not.
  select count(*)::int into v_n from clara.seeding_batches;
  raise notice '#1012 prestate: % seeding batch(es) and % proposal(s) exist and must survive this file untouched.',
    v_n, (select count(*)::int from clara.seeding_proposals);

  raise notice '#1012 prestate: OK -- the five lane doors resolve; the three recut targets are at their measured pre-images (or already retired, on a redo); cancel/complete are byte-identical to their pins; the creator is runtime-only and both deciders human-only.';
end
$p1012_pre$;

-- =====================================================================================
-- §B  THE RETIREMENT. Three `create or replace function` statements at the EXACT existing
--     signatures — which is what preserves the ACL (CREATE OR REPLACE never resets one) and
--     what makes this file redo-safe. Each body is the SAME typed refusal: same SQLSTATE, same
--     `detail.reason`, same sentence. Nothing reads, nothing writes, nothing reserves.
-- =====================================================================================
set role clara_fn_owner;

create or replace function clara.create_seeding_batch(p_client uuid, p_document uuid,
    p_proposals jsonb, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $fn$
begin
  -- #1012: the prior-GL seeding lane is retired (owner ruling 2026-09-20, #983). Raising
  -- ahead of the idempotency reservation is deliberate: a retired door writes nothing at all,
  -- not even a receipt.
  raise exception 'the prior-GL seeding lane is retired: Clara learns a client''s counterparties and coding from the source itself, so no seeding batch, tick or decline is accepted; existing batches stay readable and can still be cancelled or completed'
    using errcode = 'CLR34', detail = '{"reason":"seeding_lane_retired"}';
end $fn$;

create or replace function clara.tick_seeding_proposal(p_proposal uuid, p_op_key text)
    returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $fn$
begin
  -- #1012: retired. Raising ahead of the role ladder is deliberate (see 0288's header): the
  -- answer must not depend on the request, and no proposal may change state again.
  raise exception 'the prior-GL seeding lane is retired: Clara learns a client''s counterparties and coding from the source itself, so no seeding batch, tick or decline is accepted; existing batches stay readable and can still be cancelled or completed'
    using errcode = 'CLR34', detail = '{"reason":"seeding_lane_retired"}';
end $fn$;

create or replace function clara.decline_seeding_proposal(p_proposal uuid, p_reason text,
    p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $fn$
begin
  -- #1012: retired. A proposal nobody can tick is also a proposal nobody needs to decline —
  -- the batch's own cancel/complete doors close the history out instead.
  raise exception 'the prior-GL seeding lane is retired: Clara learns a client''s counterparties and coding from the source itself, so no seeding batch, tick or decline is accepted; existing batches stay readable and can still be cancelled or completed'
    using errcode = 'CLR34', detail = '{"reason":"seeding_lane_retired"}';
end $fn$;

reset role;

-- =====================================================================================
-- §E  TAIL. Re-reads the live catalog rather than trusting the statements above ran as
--     written, and drives the retirement behaviourally inside a forced-rollback
--     subtransaction (the 0018/0019/0020/0146/0260 CLR99-probe idiom) so nothing synthetic
--     survives this migration's own commit.
-- =====================================================================================
do $p1012_tail$
declare
  v_creator  text := 'clara.create_seeding_batch(uuid,uuid,jsonb,text)';
  v_ticker   text := 'clara.tick_seeding_proposal(uuid,text)';
  v_decliner text := 'clara.decline_seeding_proposal(uuid,text,text)';
  v_cancel   text := 'clara.cancel_seeding_batch(uuid,text,text)';
  v_complete text := 'clara.complete_seeding_batch(uuid,text)';
  v_sha text; v_src text; r record; v_n int;
  v_msg constant text :=
    'the prior-GL seeding lane is retired: Clara learns a client''s counterparties and coding from the source itself, so no seeding batch, tick or decline is accepted; existing batches stay readable and can still be cancelled or completed';
begin
  -- 1 · ALL THREE CARRY THE SAME REFUSAL: same SQLSTATE literal, same reason, same sentence.
  --     A "shared refusal" that is three different sentences is not shared, so this is checked
  --     as a literal on each body rather than inferred from one of them.
  foreach v_sha in array array[v_creator, v_ticker, v_decliner] loop
    -- prosrc is the RAW body text, so a quote inside the sentence is still DOUBLED there
    -- (`client''s`); un-double it once so the literal below is the sentence a caller receives,
    -- not a SQL-escaped cousin of it.
    select replace(p.prosrc, '''''', '''') into v_src from pg_proc p where p.oid = v_sha::regprocedure;
    if position(v_msg in v_src) = 0 then
      raise exception '#1012 tail: % does not carry the shared retirement sentence', v_sha using errcode = 'CLR10';
    end if;
    if position('''CLR34''' in v_src) = 0 or position('"reason":"seeding_lane_retired"' in v_src) = 0 then
      raise exception '#1012 tail: % does not raise CLR34 with detail.reason = seeding_lane_retired', v_sha using errcode = 'CLR10';
    end if;
    -- and the old lane machinery is GONE from each body: no reservation, no context ladder,
    -- no insert, no event.
    for r in select * from (values ('_reserve_op'), ('_finish_op'), ('_human_ctx'), ('_append_event'),
                                   ('_audit'), ('insert into')) as t(dead) loop
      if position(r.dead in v_src) <> 0 then
        raise exception '#1012 tail: % still contains "%" -- a retired door does nothing at all', v_sha, r.dead
          using errcode = 'CLR10';
      end if;
    end loop;
  end loop;

  -- 2 · POSTURE AND ACL PRESERVED on all three: owner, SECURITY DEFINER, search_path, and the
  --     exact lane each door belonged to. A retirement that silently widened or narrowed a
  --     grant would be a different change from the one this file claims to be.
  for r in select p.oid::regprocedure::text sig, p.proowner::regrole::text owner, p.prosecdef secdef,
                  array_to_string(p.proconfig, ',') cfg
             from pg_proc p
            where p.oid = any (array[v_creator::regprocedure, v_ticker::regprocedure, v_decliner::regprocedure]) loop
    if r.owner <> 'clara_fn_owner' or not r.secdef or coalesce(r.cfg,'') <> 'search_path=clara, pg_temp' then
      raise exception '#1012 tail: % lost its definer posture (owner=%, secdef=%, config=%)',
        r.sig, r.owner, r.secdef, r.cfg using errcode = 'CLR10';
    end if;
  end loop;
  if not has_function_privilege('clara_runtime', v_creator::regprocedure, 'execute')
     or has_function_privilege('clara_authenticated', v_creator::regprocedure, 'execute') then
    raise exception '#1012 tail: % is no longer the runtime-only door it was', v_creator using errcode = 'CLR10';
  end if;
  foreach v_sha in array array[v_ticker, v_decliner] loop
    if not has_function_privilege('clara_authenticated', v_sha::regprocedure, 'execute')
       or has_function_privilege('clara_runtime', v_sha::regprocedure, 'execute') then
      raise exception '#1012 tail: % is no longer the human-only door it was', v_sha using errcode = 'CLR10';
    end if;
  end loop;

  -- 3 · THE TWO CLOSERS ARE BYTE-IDENTICAL TO THEIR PRESTATE PINS.
  for r in select * from (values
      (v_cancel,   '0b655b1a5d23920593ae3f41dd8942c0bfaa1cdc7a89daba64eaf50a2ac7eba5'),
      (v_complete, '96a62e0c02387980629ce40ffea06d4a2d4a66dbefb888dac2059e12679bf7ba')
      ) as t(sig, want) loop
    select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
      from pg_proc p where p.oid = r.sig::regprocedure;
    if v_sha is distinct from r.want then
      raise exception '#1012 tail: % MOVED while this file applied -- it must not have (got %)', r.sig, v_sha
        using errcode = 'CLR10';
    end if;
  end loop;

  -- 4 · BEHAVIOURAL PROBE: the INSTALLED bodies actually refuse, and they write nothing. Built
  --     and discarded inside a forced-rollback subtransaction.
  declare
    v_probe_user uuid; v_probe_firm uuid; v_probe_client uuid; v_probe_batch uuid;
    v_probe_proposal uuid; v_probe_doc uuid; v_caught text; v_detail text; v_receipts int;
  begin
    begin
      v_probe_user := gen_random_uuid();
      insert into clara.users(id, display_name) values (v_probe_user, '1012-seeding-retirement probe');
      insert into clara.firms(id, name) values (gen_random_uuid(), '1012-seeding-retirement probe firm')
        returning id into v_probe_firm;
      insert into clara.firm_memberships(firm_id, user_id, role, status)
        values (v_probe_firm, v_probe_user, 'admin', 'active');
      insert into clara.clients(firm_id, name, status)
        values (v_probe_firm, '1012-seeding-retirement probe client', 'active')
        returning id into v_probe_client;
      -- A PRE-RETIREMENT batch + open proposal, planted directly: after §B no door can mint
      -- one, and the point of the probe is a proposal that WOULD have been tickable.
      insert into clara.documents(firm_id, sha256) values (v_probe_firm, repeat('a', 64))
        returning id into v_probe_doc;
      insert into clara.seeding_batches(firm_id, client_id, source_document_id, source_sha256, state)
        values (v_probe_firm, v_probe_client, v_probe_doc, repeat('a', 64), 'open')
        returning id into v_probe_batch;
      insert into clara.seeding_proposals(batch_id, firm_id, client_id, proposal_kind,
          proposal_key, payload, evidence, state)
        values (v_probe_batch, v_probe_firm, v_probe_client, 'wiki_fact', 'wf:probe',
          '{"slug":"profile","fact":"probe"}'::jsonb, '{"prior_gl_lines":[1]}'::jsonb, 'proposed')
        returning id into v_probe_proposal;

      perform set_config('request.jwt.claims', jsonb_build_object('sub', v_probe_user)::text, true);

      -- (i) the creator
      begin
        perform clara.create_seeding_batch(v_probe_client, v_probe_doc, '[]'::jsonb, 'p1012-probe-create');
        raise exception '#1012 BEHAVIOURAL probe: create_seeding_batch SUCCEEDED after its retirement'
          using errcode = 'CLR10';
      exception when sqlstate 'CLR34' then
        get stacked diagnostics v_caught = message_text, v_detail = pg_exception_detail;
        if v_caught is distinct from v_msg or coalesce(v_detail::jsonb ->> 'reason','') <> 'seeding_lane_retired' then
          raise exception '#1012 BEHAVIOURAL probe: create_seeding_batch refused with the WRONG sentence/reason (%, %)', v_caught, v_detail
            using errcode = 'CLR10';
        end if;
      end;
      -- (ii) the ticker
      begin
        perform clara.tick_seeding_proposal(v_probe_proposal, 'p1012-probe-tick');
        raise exception '#1012 BEHAVIOURAL probe: tick_seeding_proposal SUCCEEDED after its retirement'
          using errcode = 'CLR10';
      exception when sqlstate 'CLR34' then null;
      end;
      -- (iii) the decliner
      begin
        perform clara.decline_seeding_proposal(v_probe_proposal, 'probe reason', 'p1012-probe-decline');
        raise exception '#1012 BEHAVIOURAL probe: decline_seeding_proposal SUCCEEDED after its retirement'
          using errcode = 'CLR10';
      exception when sqlstate 'CLR34' then null;
      end;

      -- (iv) NOTHING WAS WRITTEN by any of the three refusals.
      select count(*)::int into v_receipts from clara.op_receipts
       where firm_id = v_probe_firm
         and fn in ('create_seeding_batch','tick_seeding_proposal','decline_seeding_proposal');
      if v_receipts <> 0 then
        raise exception '#1012 BEHAVIOURAL probe: a retired door reserved % operation receipt(s)', v_receipts
          using errcode = 'CLR10';
      end if;
      if (select state from clara.seeding_proposals where id = v_probe_proposal) <> 'proposed' then
        raise exception '#1012 BEHAVIOURAL probe: the planted proposal changed state' using errcode = 'CLR10';
      end if;

      -- THE CLOSERS ARE NOT DRIVEN HERE, deliberately. Both emit a domain event carrying the
      -- batch's source document, and clara._append_event refuses a document_id that is not in
      -- the firm/client FILING history — so driving them inside this probe would need a planted
      -- clara.document_filings row, which fires six triggers (agent congruence, agent receipt,
      -- close serialisation, firm knowledge) that have nothing to do with this migration. They
      -- are driven for real, on a document filed through the real doors, by
      -- packages/db/tests/seeding-lane-retired.test.mjs. Here they are pinned by body only.
      perform set_config('request.jwt.claims', '', true);
      raise exception 'clara_1012_probe_rollback' using errcode = 'CLR99';
    exception
      when sqlstate 'CLR99' then null; -- expected: fixtures discarded
    end;
  end;

  -- 5 · HISTORY SURVIVED. This file deletes nothing.
  select count(*)::int into v_n from clara.seeding_batches;
  raise notice '#1012 tail: OK -- clara.create_seeding_batch, clara.tick_seeding_proposal and clara.decline_seeding_proposal all answer the SAME typed refusal (CLR34 / seeding_lane_retired / one sentence) and contain no reservation, context ladder, insert, audit or event; all three keep their clara_fn_owner SECURITY DEFINER posture, their pinned search_path and their exact lane grants (creator runtime-only, deciders human-only); clara.cancel_seeding_batch and clara.complete_seeding_batch are byte-identical to their measured pre-images (their behaviour is driven by seeding-lane-retired.test.mjs, not here -- see the probe''s own note); % seeding batch(es) survive, none deleted.', v_n;
end
$p1012_tail$;
