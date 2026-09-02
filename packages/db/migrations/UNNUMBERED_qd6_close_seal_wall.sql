-- =====================================================================================
-- Q-D6 -- THE CLOSE-SEAL WALL WHILE THE DEFERRED-OPENING BANNER IS UP.
-- =====================================================================================
-- UNNUMBERED BY LAW (裁-108): the number is claimed at MERGE PREP, not at authoring, and
-- the four-step (rename -> citation true-up -> prove nothing mechanical keys on the
-- FILENAME -> fresh-rig in-sequence re-verify) is the lead's act at that moment.
--
-- THE RULING THIS FILE BUILDS, verbatim and the owner's own (constraint 1,
-- `docs/plan/active/fa7b-gate-record.md:44-46`):
--
--   "Q-D6 -- RULED: a close may NOT SEAL while the deferred-opening banner is up, and NO
--    owner-override door ships. Drawer-1 (absolute, no attestation path) is the mechanism.
--    Accounting-correctness ruling under constraint 1, the owner's own."
--
-- Ruled IN for beta 2026-09-02 (裁-119). The posture it walls is design D-6
-- (`docs/plan/active/fa7b-onboarding-design.md:402-411`): playbooks (3) bank-only and
-- (4) shoebox take NO opening seed at onboarding; `commit_client_onboarding`'s THIRD arm
-- (`0017_wave_b.sql:2816-2818`) activates such a client on a `carry_down_deferred` plan
-- item with the opening uncaptured, and the client workspace carries a permanent banner
-- saying so. Until this file, nothing stopped that client's first close from SEALING on
-- an opening nobody ever captured.
--
-- =====================================================================================
-- THE SHAPE DECISION -- (a), the gate framework, NOT a finalize_close recut.
-- =====================================================================================
-- `finalize_close`'s drawer sweep (`0128_f_a4_pr_1b2_a4_truth.sql:184-196`) is already
-- fully generic: it re-evaluates EVERY catalog row in-transaction and refuses on the FIRST
-- drawer-1 `fail` with `reason=drawer1_identity_failed`, naming the check_key, with no
-- attestation branch. `_evaluate_close_gates` (0056), `_close_dry_run_core` (0104),
-- `_close_readiness_core`, `get_close_plan` and `_close_drawer1_unclean` all loop the
-- catalog by SELECT rather than by a hard-coded roster. So the wall is a CATALOG ROW plus
-- its evaluator, and `finalize_close`'s 21,658-byte body is NOT touched.
--
-- ONE live body is nevertheless replaced, and it is named honestly rather than described
-- as "rows-only": `clara._measure_one_gate(text,uuid,uuid)` dispatches on
-- `case chk.check_key` and has no dynamic resolution (`close_gate_checks.evaluator_fn` is
-- a documentation column -- 0104's own words, and the census re-confirmed it: nothing
-- resolves it at runtime). A catalog row whose key is absent from that dispatch falls to
-- `else ... 'no_evaluator_wired'` -> state 'error' -> drawer-1 `drawer1_state_unknown`,
-- which would refuse EVERY close for EVERY client. The dispatch arm is therefore
-- mandatory, and it is exactly the seam 0104 used to add `undated_documents`.
--
-- D1 INVENTORY (`packages/db/README.md`, "Deploy contract"): `_measure_one_gate` is STABLE
-- and read INSIDE `finalize_close`'s transaction, so an in-flight finalize spanning this
-- migration completes on the body it started with and would skip the new gate. That is a
-- D1 write-quiesce obligation on the close writers for this file's deploy window, and it
-- is the file's ONLY one. Before/after prosrc sha are pinned in the prestate and re-read in
-- the tail.
--
-- =====================================================================================
-- THE PREDICATE, AND WHY IT IS THE BANNER'S OWN FACT RATHER THAN A RE-DERIVATION (裁-107b)
-- =====================================================================================
-- The banner has no column of its own. Design D-6 rules it derived from THREE live reads,
-- and that is exactly what the web surface does today
-- (`apps/web/components/registers/opening-register.tsx:54,60` +
--  `apps/web/components/registers/opening-position-gate.tsx:82-85`):
--   (1) `opening_seed_registry` for the client   -- a live seed suppresses it;
--   (2) `onboarding_plan_items.item_key='carry_down_deferred'` in state deferred|resolved;
--   (3) `onboarding_plan_items.item_key='first_year_zero_opening'` in state answered|
--       resolved, which WINS -- a first-year client has nothing to carry down.
-- Reads (2) and (3) are taken here with the SAME keys and the SAME state sets, in the same
-- precedence. Read (1) is taken at the ACCOUNTING grain rather than the presentation grain,
-- and this is the one deliberate difference:
--   * the web surface suppresses the banner as soon as ANY non-cancelled seed exists,
--     because the seed WORKBENCH takes over that panel;
--   * an OPEN seed is a seed being drafted, not an opening that has been captured. The
--     capture act is `approve_opening_seed` (`0017_wave_b.sql:3991`) / its correction
--     sibling `approve_opening_correction` (`0017:4282`) setting `state='finalized'` --
--     MEASURED on the rig, not assumed: those two are the only bodies in the schema that
--     write that value. `reopen_opening_seed` puts it back to 'open', which correctly
--     re-arms this wall mid-correction.
--   * Sealing a year against a half-drafted seed is precisely what the ruling forbids, so
--     the wall keys on 'finalized'. Under constraint 1 accounting-correctness outranks the
--     presentation choice; the divergence is RECORDED here, not hidden.
--
-- A CANCELLED plan is excluded, and that is the only plan-state filter. A cancelled
-- onboarding is an undone record (`cancel_client_onboarding` is its sole writer, measured),
-- so its stale deferred item must not wall a client whose onboarding was redone. Every
-- other plan state counts -- `committed` (the interview path design D-6 names) and `open`
-- (`bootstrap_client_plan`'s pre-0017 retrofit, whose item likewise means the carry-down is
-- still owed). An earlier draft of this file narrowed the wall to committed plans only; the
-- rig replay showed that narrowing bought nothing real and cost fidelity to the banner, so
-- it was dropped. The banner does not read plan state either.
--
-- WHAT THE RIG REPLAY FOUND, recorded because it changed a fixture and not only this file:
-- `tests/rig-fixtures.mjs`'s legacy-activation bridge drove EVERY synthetic client to
-- 'active' through the deferred arm -- the cheapest of the three, chosen for brevity and
-- never because it modelled anything -- so the whole estate's fixture population read, to
-- the DB, as playbook-③/④ clients sealing on an uncaptured opening, and this gate correctly
-- refused them. The fixture is what was wrong: a synthetic client with no prior books has a
-- FIRST-YEAR-ZERO opening. The bridge now answers `first_year_zero_opening` and marks the
-- carry-down todo `resolved`, which is both true and self-consistent. The gate was not
-- weakened to accommodate it.
--
-- NO OVERRIDE DOOR IS ADDED, and none is needed: `attest_close_exception`
-- (`0056_wave_e_close_model.sql:1853-1858`) structurally refuses any gate whose drawer is
-- not 2 -- "a drawer-1 identity has no override, for anybody". Drawer 1 IS the mechanism
-- the ruling names, and it is already absolute.
--
-- WHAT IS NOT TOUCHED, having been read rather than assumed: `abandon_close`,
-- `open_fiscal_year`/`_open_fiscal_year_core`, `reopen_fiscal_year`. None of the three
-- consults the gate catalog or `_measure_one_gate` (census: `_close_drawer1_unclean`'s
-- only caller in the whole schema is `_agent_begin_close_core`). Abandoning a close and
-- opening/reopening a year stay reachable for a deferred-opening client BY DESIGN -- the
-- ruling forbids SEALING, nothing else.
--
-- THE READERS NEED NO CHANGE, and that too was measured, not assumed: `get_close_plan`,
-- `_close_readiness_core` (behind `get_close_readiness`) and `_close_dry_run_core` (behind
-- `wake_dry_run_close_readiness`) all enumerate the catalog / the run's results generically,
-- so the new gate and its reason surface to a reader BEFORE finalize is ever called.
-- `verify_close` is deliberately untouched: it verifies a SEALED receipt's four strict
-- probes against the pinned position and never runs before a seal, so it has no honest
-- place to report a pre-seal refusal.

-- PRECAUTIONARY, not load-bearing: this file writes ONE catalog row and two function
-- bodies and touches no user data, so nothing here is a heavy pass. The runner supplies
-- the transaction (transaction control in a migration file is refused by the lexer).
set local statement_timeout = '5min';

-- =====================================================================================
-- 0 -- PRESTATE. Every claim this file makes about what it is editing, measured here.
-- =====================================================================================
do $qd6_pre$
declare
  v_n int; v_src text; v_sha text; v_anchor text;
begin
  -- (0.1) The close model is live and the catalog is the fourteen-row post-0104 shape.
  if to_regclass('clara.close_gate_checks') is null then
    raise exception 'qd6 prestate: clara.close_gate_checks does not exist -- 0056''s close model is not applied'
      using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from clara.close_gate_checks;
  if v_n <> 14 then
    raise exception 'qd6 prestate: close_gate_checks carries % row(s), expected 14 (0056''s thirteen + 0104''s undated_documents) -- another lane has moved the catalog; STOP and re-derive the census before proceeding', v_n
      using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from clara.close_gate_checks where drawer = 1;
  if v_n <> 6 then
    raise exception 'qd6 prestate: drawer 1 carries % row(s), expected 6', v_n using errcode = 'CLR10';
  end if;
  perform 1 from clara.close_gate_checks k where k.check_key = 'deferred_opening_resolved';
  if found then
    raise exception 'qd6 prestate: the catalog ALREADY carries a deferred_opening_resolved row -- this file looks ALREADY APPLIED, and the catalog is append-only so it cannot correct itself'
      using errcode = 'CLR10';
  end if;

  -- (0.2) The drawer domain still admits 1, so the INSERT needs no ALTER; and the catalog
  -- is still append-only by TRIGGER SHAPE, which is why a wrong title would be permanent
  -- and is therefore worth getting right in one shot (0104's D-18 lesson).
  select count(*)::int into v_n from pg_constraint con
   where con.conrelid = 'clara.close_gate_checks'::regclass and con.contype = 'c'
     and pg_get_constraintdef(con.oid) = 'CHECK ((drawer = ANY (ARRAY[1, 2, 3])))';
  if v_n <> 1 then
    raise exception 'qd6 prestate: clara.close_gate_checks does not carry the pinned drawer CHECK (found % match(es))', v_n
      using errcode = 'CLR10';
  end if;
  -- READ BY IDENTITY, NEVER BY SPELLING (law 3, and 0104's own hard-won note): pg_get_
  -- triggerdef deparses the handler by name, so a text probe can read FALSE on a database
  -- where the trigger is present and working. tgfoid is an OID equality. The tgtype bits
  -- are 2 = BEFORE, 8 = DELETE, 16 = UPDATE, 1 = FOR EACH ROW; tgenabled is checked because
  -- a DISABLED trigger is a wall that does not refuse.
  select count(*)::int into v_n from pg_trigger t
   where t.tgrelid = 'clara.close_gate_checks'::regclass and not t.tgisinternal
     and t.tgfoid = 'clara._tf_append_only()'::regprocedure
     and (t.tgtype & 2) <> 0 and (t.tgtype & 8) <> 0 and (t.tgtype & 16) <> 0
     and (t.tgtype & 1) <> 0 and t.tgenabled <> 'D';
  if v_n <> 1 then
    raise exception 'qd6 prestate: clara.close_gate_checks does not carry exactly one ENABLED, BEFORE DELETE OR UPDATE, FOR EACH ROW trigger on clara._tf_append_only() (found %) -- the append-only premise (a shipped title is structurally uncorrectable) is not verified on this database', v_n
      using errcode = 'CLR10';
  end if;

  -- (0.3) THE ONE BODY THIS FILE REPLACES, pinned by its LIVE prosrc sha (superseded-body
  -- law: read the catalog, never the file). This is 0104's S2 body, unmoved since.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara._measure_one_gate(text,uuid,uuid)'::regprocedure;
  if v_src is null then
    raise exception 'qd6 prestate: clara._measure_one_gate(text,uuid,uuid) does not exist -- 0104 is not applied'
      using errcode = 'CLR10';
  end if;
  v_sha := encode(sha256(convert_to(v_src, 'UTF8')), 'hex');
  if v_sha <> '5dde819aa69e85150f8554370453385a10258e43415c6b68a0b9d6ae5c24c71c' then
    raise exception 'qd6 prestate: clara._measure_one_gate drifted from the pinned prosrc (got %) -- either a later change moved this body or this file already applied. The extend-only proof in the tail would be meaningless; STOP.', v_sha
      using errcode = 'CLR10';
  end if;
  create temp table qd6_pins(name text primary key, sha text not null, src text not null) on commit drop;
  insert into qd6_pins(name, sha, src) values ('clara._measure_one_gate(text,uuid,uuid)', v_sha, v_src);

  -- (0.4) THE INSERTION ANCHOR IS UNIQUE IN THE LIVE BODY, so S2's added arm provably
  -- lands in the `case chk.check_key` dispatch and nowhere else, and the tail's
  -- extend-only proof has exactly one seam (0104's own idiom, 0.7).
  v_anchor := E'      else jsonb_build_object(''state'', ''error'', ''reason'', ''no_evaluator_wired'')\n';
  if (length(v_src) - length(replace(v_src, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception 'qd6 prestate: the terminal no_evaluator_wired arm does not occur EXACTLY once in the live _measure_one_gate body -- the insertion point is not the shape this file was authored against'
      using errcode = 'CLR10';
  end if;

  -- (0.5) THE EVALUATOR NAME IS FREE (exact signature, never a bare name -- law 3).
  if to_regprocedure('clara._close_gate_deferred_opening(uuid,uuid)') is not null then
    raise exception 'qd6 prestate: clara._close_gate_deferred_opening(uuid,uuid) already exists'
      using errcode = 'CLR10';
  end if;

  -- (0.6) THE THREE RELATIONS THE PREDICATE READS, and the exact column domains it keys on.
  -- A silently-widened state domain would change what this wall means, so it is pinned.
  foreach v_anchor in array array['clara.onboarding_plans', 'clara.onboarding_plan_items',
                                  'clara.opening_seed_registry'] loop
    if to_regclass(v_anchor) is null then
      raise exception 'qd6 prestate: % does not exist -- 0017''s Wave-B onboarding core is not applied', v_anchor
        using errcode = 'CLR10';
    end if;
  end loop;
  select count(*)::int into v_n from pg_constraint con
   where con.conrelid = 'clara.onboarding_plans'::regclass and con.contype = 'c'
     and pg_get_constraintdef(con.oid) = E'CHECK ((state = ANY (ARRAY[''open''::text, ''committed''::text, ''cancelled''::text])))';
  if v_n <> 1 then
    raise exception 'qd6 prestate: onboarding_plans.state is not the pinned three-value domain (found % match(es)) -- the committed/open discriminator this wall keys on has moved', v_n
      using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from pg_constraint con
   where con.conrelid = 'clara.onboarding_plan_items'::regclass and con.contype = 'c'
     and pg_get_constraintdef(con.oid) = E'CHECK ((state = ANY (ARRAY[''pending''::text, ''answered''::text, ''resolved''::text, ''deferred''::text])))';
  if v_n <> 1 then
    raise exception 'qd6 prestate: onboarding_plan_items.state is not the pinned four-value domain (found % match(es))', v_n
      using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from pg_constraint con
   where con.conrelid = 'clara.opening_seed_registry'::regclass and con.contype = 'c'
     and pg_get_constraintdef(con.oid) = E'CHECK ((state = ANY (ARRAY[''open''::text, ''finalized''::text, ''cancelled''::text])))';
  if v_n <> 1 then
    raise exception 'qd6 prestate: opening_seed_registry.state is not the pinned three-value domain (found % match(es)) -- the ''finalized'' capture act this wall keys on has moved', v_n
      using errcode = 'CLR10';
  end if;

  -- (0.7) THE OVERRIDE DOOR IS ALREADY STRUCTURALLY CLOSED. The ruling says none ships;
  -- this measures that none EXISTS to ship, so drawer 1 is a real mechanism and not a label.
  select p.prosrc into v_src from pg_proc p
   where p.oid = to_regprocedure('clara.attest_close_exception(uuid,text,text,text,text,uuid)');
  if v_src is null or position('if v_chk.drawer <> 2 then' in v_src) = 0 then
    raise exception 'qd6 prestate: attest_close_exception no longer carries its drawer<>2 refusal -- drawer 1 would stop being absolute and this ruling would need a different mechanism'
      using errcode = 'CLR10';
  end if;

  raise notice 'qd6 prestate: clean -- catalog at fourteen rows (six in drawer 1) with no deferred_opening_resolved key; drawer CHECK and append-only trigger pinned by shape; _measure_one_gate at its 0104 prosrc sha with exactly one no_evaluator_wired arm; _close_gate_deferred_opening(uuid,uuid) unused; the three read relations present with their pinned state domains; attest_close_exception still refuses every non-drawer-2 gate.';
end
$qd6_pre$;

-- =====================================================================================
-- S1 -- clara._close_gate_deferred_opening : THE NEW DRAWER-1 EVALUATOR. ADDITIVE.
-- =====================================================================================
-- No window: nothing in flight can be inside a body that does not exist.
--
-- STABLE is honest: it reads three tables and writes nothing. SECURITY DEFINER + a pinned
-- search_path is the house shape for every `_close_gate_*` evaluator, and the owner is
-- clara_fn_owner so the catalog's own RLS is the one that applies.
--
-- FAIL CLOSED ON THE MISSING FISCAL YEAR, copied from `_close_gate_undated`'s ARM-0
-- (0104 S1) and for the same reason: a gate that answers `pass` because it could not read
-- is not a gate. `unknown` on a drawer-1 row is refused by `finalize_close` as
-- `drawer1_state_unknown` -- an unevaluated identity has not passed.
--
-- THE PAYLOAD rides into `measured_digest` (md5 over this object). It names the plan and
-- the item that hold the posture, so a reader of `get_close_readiness` sees WHICH plan owes
-- the opening, not merely that something does. No wall-clock and no session-dependent
-- rendering is in it, so the digest is stable across connections.
create function clara._close_gate_deferred_opening(p_client uuid, p_fy uuid) returns jsonb
language plpgsql stable security definer set search_path = clara, pg_temp as $fn$
declare
  v_fy record; v_deferred jsonb; v_seed uuid;
begin
  select * into v_fy from clara.fiscal_years fy where fy.id = p_fy;
  if v_fy.id is null then
    return jsonb_build_object('state', 'unknown', 'reason', 'fiscal_year_not_found',
      'deferred_count', 0, 'deferred', '[]'::jsonb, 'finalized_seed_id', null);
  end if;

  -- READS (2) and (3) of design D-6's three, with the web surface's own keys, state sets
  -- and precedence: a `first_year_zero_opening` answer WINS over a `carry_down_deferred`
  -- item on the same plan (a first-year client has nothing to carry down). The interview
  -- mints exactly one of the two (`interview.v1.questions.ts:87-92`, a @frozen file), so
  -- the NOT EXISTS is defensive rather than load-bearing -- and it is here precisely so
  -- that a plan carrying both can never be read one way by the banner and another by the
  -- wall.
  select coalesce(jsonb_agg(jsonb_build_object('plan_id', p.id, 'item_id', i.id,
           'item_state', i.state) order by p.created_at, p.id, i.id), '[]'::jsonb)
    into v_deferred
    from clara.onboarding_plans p
    join clara.onboarding_plan_items i on i.plan_id = p.id
   where p.client_id = p_client
     and p.scope_kind = 'client'
     -- A CANCELLED onboarding is an undone record, so its stale item must not wall a client
     -- whose onboarding was redone. Every other plan state counts: `committed` (the
     -- interview path design D-6 names) and `open` (bootstrap_client_plan's pre-0017
     -- retrofit, whose item means the carry-down is likewise still owed). The banner reads
     -- no plan state either.
     and p.state <> 'cancelled'
     and i.item_key = 'carry_down_deferred'
     and i.state in ('deferred', 'resolved')
     and not exists (select 1 from clara.onboarding_plan_items z
            where z.plan_id = p.id and z.item_key = 'first_year_zero_opening'
              and z.state in ('answered', 'resolved'));

  if jsonb_array_length(v_deferred) = 0 then
    return jsonb_build_object('state', 'pass', 'reason', 'no_deferred_opening',
      'deferred_count', 0, 'deferred', '[]'::jsonb, 'finalized_seed_id', null);
  end if;

  -- READ (1), taken at the ACCOUNTING grain: the capture act is the seed reaching
  -- 'finalized' (approve_opening_seed / approve_opening_correction -- the only two writers
  -- of that value in the schema). An OPEN seed is a draft, not a captured opening, and
  -- reopen_opening_seed puts a finalized one back to 'open', which re-arms this wall for
  -- the duration of the correction. `uq_opening_seed_registry_once` keeps at most one
  -- non-cancelled seed per client, so this read is unambiguous.
  select s.id into v_seed
    from clara.opening_seed_registry s
   where s.client_id = p_client and s.state = 'finalized'
   order by s.finalized_at desc, s.id desc
   limit 1;
  if v_seed is not null then
    return jsonb_build_object('state', 'pass', 'reason', 'opening_seed_finalized',
      'deferred_count', jsonb_array_length(v_deferred), 'deferred', v_deferred,
      'finalized_seed_id', v_seed);
  end if;

  -- THE WALL. `fail` and not `unknown`: this is a determinate measurement of a fact that
  -- was read, not an inability to see. finalize_close turns it into CLR41
  -- `drawer1_identity_failed` naming this check_key, with no attestation branch anywhere.
  return jsonb_build_object('state', 'fail', 'reason', 'deferred_opening_unresolved',
    'deferred_count', jsonb_array_length(v_deferred), 'deferred', v_deferred,
    'finalized_seed_id', null);
end $fn$;
revoke all on function clara._close_gate_deferred_opening(uuid, uuid) from public;
alter function clara._close_gate_deferred_opening(uuid, uuid) owner to clara_fn_owner;

-- =====================================================================================
-- S2 -- clara._measure_one_gate GAINS ITS deferred_opening_resolved ARM. (D1)
-- =====================================================================================
-- THE ONE BODY WINDOW THIS FILE SHARES WITH THE FINALIZE PATH. The fourteen pre-existing
-- lines are retyped from the PINNED live source and the tail proves extend-only BY
-- CONSTRUCTION: deleting the added arm from the new prosrc must reproduce the pinned
-- prosrc byte for byte. Nothing else about the body moves -- not the signature, not the
-- volatility, not the `exception when others` wrapper (which is what makes a raising
-- evaluator fail CLOSED as state='error'), not the return shape's `measured_present` flag.
create or replace function clara._measure_one_gate(p_check_key text, p_client uuid, p_fy uuid)
  returns jsonb
language plpgsql stable security definer set search_path = clara, pg_temp as $fn$
declare
  v_fy record; chk record; v_measured jsonb; v_state text;
begin
  select * into v_fy from clara.fiscal_years fy where fy.id = p_fy;
  select * into chk from clara.close_gate_checks k where k.check_key = p_check_key;
  begin
    v_measured := case chk.check_key
      when 'ar_control_tie'            then clara.ar_control_tie(p_client, v_fy.ends_on)
      when 'ap_control_tie'            then clara.ap_control_tie(p_client, v_fy.ends_on)
      when 'fa_control_tie'            then clara.fa_control_tie_out(p_client, v_fy.id)
      when 'bank_recon_identity'       then clara.bank_recon_close_state(p_client, v_fy.id)
      when 'bank_recon_informational'  then clara.bank_recon_close_state(p_client, v_fy.id)
      when 'fa_register_tie_view'      then clara.fa_register_tie(p_client, v_fy.ends_on)
      when 'pl_retained_earnings_roll' then jsonb_build_object('state', 'pass', 'note', 'computed in finalize_close under the lock')
      when 'opening_continuity_tie'    then jsonb_build_object('state', 'pass', 'note', 'asserted in finalize_close against the prior pin')
      when 'depreciation_through_fy_end' then clara._close_gate_depreciation(p_client, v_fy.id)
      when 'closing_stock_present'     then clara._close_gate_closing_stock(p_client, v_fy.id)
      when 'unapproved_drafts_in_period' then clara._close_gate_drafts(p_client, v_fy.id)
      when 'open_bank_recon_items'     then clara._close_gate_bank_items(p_client, v_fy.id)
      when 'uncoded_documents'         then clara._close_gate_uncoded(p_client, v_fy.id)
      when 'undated_documents'         then clara._close_gate_undated(p_client, v_fy.id)
      when 'deferred_opening_resolved' then clara._close_gate_deferred_opening(p_client, v_fy.id)
      else jsonb_build_object('state', 'error', 'reason', 'no_evaluator_wired')
    end;
    v_state := case
      when chk.drawer = 3 then 'advisory'
      when coalesce(v_measured ->> 'state', 'error') in ('tie', 'pass') then 'pass'
      when coalesce(v_measured ->> 'state', 'error') = 'mismatch' then 'fail'
      when coalesce(v_measured ->> 'state', 'error') = 'fail' then 'fail'
      when coalesce(v_measured ->> 'state', 'error') = 'unknown' then 'unknown'
      else 'error'
    end;
  exception when others then
    v_state := 'error';
    v_measured := jsonb_build_object('state', 'error', 'sqlstate', sqlstate,
      'message', sqlerrm);
  end;
  return jsonb_build_object('state', v_state,
    'measured_present', v_measured is not null, 'measured', v_measured);
end $fn$;
revoke all on function clara._measure_one_gate(text, uuid, uuid) from public;
alter function clara._measure_one_gate(text, uuid, uuid) owner to clara_fn_owner;

-- =====================================================================================
-- S3 -- THE FIFTEENTH CATALOG ROW. DRAWER 1.
-- =====================================================================================
-- INSERT is lawful; only UPDATE and DELETE are trapped (0056:378-379, verified by shape in
-- the prestate). Drawer 1 IS the ruling ("Drawer-1 (absolute, no attestation path) is the
-- mechanism") -- attest_close_exception refuses every gate whose drawer is not 2, so no
-- override door exists to ship. applies_when 'always': the deferred-opening posture is
-- possible for any client, not only a goods trader.
--
-- THE TITLE IS PERMANENT (the catalog is append-only, D-18's lesson) so it states the
-- IDENTITY that must hold, in the same voice as the other five drawer-1 rows.
insert into clara.close_gate_checks (check_key, drawer, title, evaluator_fn, applies_when) values
  ('deferred_opening_resolved', 1,
   'A deferred opening position has been captured before seal',
   'clara._close_gate_deferred_opening', 'always');

-- =====================================================================================
-- TAIL CENSUS -- re-read the LIVE catalog and prove every claim this file made.
-- =====================================================================================
do $qd6_tail$
declare
  v_n int; v_src text; v_pinned text; v_sha text; v_arm text; v_probe jsonb;
begin
  -- (T.1) The catalog is fifteen rows, seven in drawer 1, and the fifteenth is ours with
  -- the shape the ruling asks for.
  select count(*)::int into v_n from clara.close_gate_checks;
  if v_n <> 15 then
    raise exception 'qd6 tail: close_gate_checks carries % row(s), expected 15', v_n using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from clara.close_gate_checks where drawer = 1;
  if v_n <> 7 then
    raise exception 'qd6 tail: drawer 1 carries % row(s), expected 7', v_n using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from clara.close_gate_checks
   where check_key = 'deferred_opening_resolved' and drawer = 1 and applies_when = 'always'
     and evaluator_fn = 'clara._close_gate_deferred_opening';
  if v_n <> 1 then
    raise exception 'qd6 tail: the deferred_opening_resolved row is not drawer 1 / always / clara._close_gate_deferred_opening' using errcode = 'CLR10';
  end if;

  -- (T.2) The catalog's evaluator_fn NAMES a function that actually resolves, by EXACT
  -- signature (law 3: a name is a projection, not the thing).
  if to_regprocedure((select evaluator_fn from clara.close_gate_checks
                       where check_key = 'deferred_opening_resolved') || '(uuid,uuid)') is null then
    raise exception 'qd6 tail: the catalog row names an evaluator that does not resolve at (uuid,uuid)' using errcode = 'CLR10';
  end if;

  -- (T.3) EXTEND-ONLY BY CONSTRUCTION. Delete the one added arm from the new live prosrc
  -- and the result must be the PINNED pre-image, byte for byte. This is the whole proof
  -- that the fourteen pre-existing dispatch arms, the v_state derivation, the exception
  -- wrapper and the return shape are untouched -- it is not asserted, it is reconstructed.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara._measure_one_gate(text,uuid,uuid)'::regprocedure;
  select src into v_pinned from qd6_pins where name = 'clara._measure_one_gate(text,uuid,uuid)';
  v_arm := E'      when ''deferred_opening_resolved'' then clara._close_gate_deferred_opening(p_client, v_fy.id)\n';
  if (length(v_src) - length(replace(v_src, v_arm, ''))) / length(v_arm) <> 1 then
    raise exception 'qd6 tail: the added dispatch arm does not occur exactly once in the new _measure_one_gate body' using errcode = 'CLR10';
  end if;
  if replace(v_src, v_arm, '') <> v_pinned then
    raise exception 'qd6 tail: removing the added arm does NOT reproduce the pinned pre-image -- this recut changed more than one line' using errcode = 'CLR10';
  end if;

  -- (T.4) D1 INVENTORY, recorded rather than described: the before sha is the prestate's
  -- pin, the after sha is read back here. These two values are the deploy window's
  -- evidence and the next CoR's starting pin.
  v_sha := encode(sha256(convert_to(v_src, 'UTF8')), 'hex');
  if v_sha = (select sha from qd6_pins where name = 'clara._measure_one_gate(text,uuid,uuid)') then
    raise exception 'qd6 tail: _measure_one_gate''s prosrc sha did not move -- the CoR did not take' using errcode = 'CLR10';
  end if;

  -- (T.5) THE NEW ARM IS REACHED THROUGH THE SHIPPING DISPATCH, not through a copy of it.
  -- `_measure_one_gate` is called by key with a NULL client and a NULL fiscal year: the
  -- evaluator's own ARM-0 answers `unknown / fiscal_year_not_found`, which proves the arm
  -- dispatches to OUR body (a missing arm would answer `no_evaluator_wired`, and a raising
  -- one would answer `error` with a sqlstate).
  v_probe := clara._measure_one_gate('deferred_opening_resolved', null, null);
  if v_probe ->> 'state' <> 'unknown'
     or (v_probe -> 'measured') ->> 'reason' <> 'fiscal_year_not_found' then
    raise exception 'qd6 tail: the deferred_opening_resolved arm did not dispatch to clara._close_gate_deferred_opening (got %)', v_probe::text
      using errcode = 'CLR10';
  end if;

  -- (T.6) THE ROW LANDED IN DRAWER 1, which is the INPUT attest_close_exception's guard
  -- reads -- and this assertion is exactly that, no more. It does NOT execute the guard
  -- (that needs a human context, which a migration has none of), so it is stated as a
  -- drawer assertion rather than dressed up as a proof of the refusal. The guard is
  -- EXECUTED, for the owner and for a capability-holding admin, by cell qd6.W2 in
  -- packages/db/tests/qd6-close-seal-wall.test.mjs -- same commit.
  select count(*)::int into v_n from clara.close_gate_checks
   where check_key = 'deferred_opening_resolved' and drawer = 2;
  if v_n <> 0 then
    raise exception 'qd6 tail: the new gate landed in drawer 2 -- it would be attestable, which the ruling forbids' using errcode = 'CLR10';
  end if;

  raise notice 'qd6 tail: OK -- the gate catalog is FIFTEEN rows (seven in drawer 1, six in drawer 2, two in drawer 3); deferred_opening_resolved is drawer 1 / applies_when always / clara._close_gate_deferred_opening, and that name resolves at the exact (uuid,uuid) signature; _measure_one_gate gained EXACTLY the one dispatch arm (proved by reconstructing the pinned pre-image after deleting it) and its prosrc sha moved from 5dde819aa69e85150f8554370453385a10258e43415c6b68a0b9d6ae5c24c71c to %; the arm was exercised through the SHIPPED dispatch and answered unknown/fiscal_year_not_found from the new evaluator''s own fail-closed ARM-0; the row is in drawer 1, which is the input attest_close_exception''s guard reads -- the guard itself is EXECUTED by test cell qd6.W2, not here. D1: _measure_one_gate is read inside finalize_close''s transaction, so this file''s deploy takes a close-writer quiesce window. Behavioural proof: packages/db/tests/qd6-close-seal-wall.test.mjs, same commit.', v_sha;
end
$qd6_tail$;
