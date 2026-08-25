-- UNNUMBERED_f_a4_pr_1b2_a4_truth.sql — F-A4 PR-1b2: Annex A.4 row 7's truthful segregation_mode.
-- =================================================================================================
-- Number claimed at MERGE time (hard constraint 10). Owner ruling: PROGRESS.md "Known issues" ·
-- Annex A.4 row 7 vs invariant (i), F-A4 PR-1b cross-model review 2026-08-25, RULED by the owner
-- 2026-08-25 in the debt-clearing sprint. Design of record for the mechanism being corrected:
-- docs/plan/active/close-key-1-design.md v2 §3.9 · docs/plan/active/close-key-1-annexes-1-mechanics.md
-- Annex A.4 (rewritten by this same commit).
--
-- THE DEFECT THIS FILE CORRECTS. finalize_close's row 7 (no human ever touched the fiscal year --
-- v_human_preparer is null) stamps segregation_mode='agent_prepared' UNCONDITIONALLY, never reading
-- v_agent_prepared at all. Every OTHER row in the eight-combination table already conditions the
-- label on v_agent_prepared (rows 1-6: `case when v_agent_prepared then 'agent_prepared' else ...
-- end`); row 7 alone hard-codes the label, so a fiscal year nobody prepared -- neither a human NOR
-- the agent, e.g. a dormant year that mints zero entries -- receives a PERMANENT receipt claiming
-- Clara prepared it. This is Annex A.4's own invariant (i) failing to hold: "agent_prepared is
-- decided by A alone" was never literally true while row 7 ignored A.
--
-- THE RULING (owner, 2026-08-25). The stamp follows the REAL probe: 'agent_prepared' only when
-- v_agent_prepared actually reads true. A year with no human preparer AND no agent preparation
-- gets a NEW, truthful mode: 'no_preparation' -- chosen to sit in the same naming register as the
-- other three (each names WHO did the segregation-relevant work; this one names that nobody did),
-- distinct at a glance from 'agent_prepared' so a reviewer never mistakes an untouched year for an
-- agent-authored one. Its review requirements are AT LEAST as strict as agent_prepared's: row 7's
-- existing gate (a solo firm -- fewer than two eligible checkers -- must supply an explicit
-- self-attestation, checked BEFORE v_mode is ever assigned) applies identically to both outcomes,
-- so 'no_preparation' inherits the exact same floor, never a looser one. Nothing about WHEN the
-- raise fires moves: row 7 still never raises on the distinct-checker arm (there is no preparer to
-- be distinct from, and inventing one is law 68's ARM-0 failure) -- that half of the ruling was
-- never in question, only the mislabeling of the non-agent branch.
--
-- WHAT DOES NOT MOVE (D-2, checked not assumed). An all-agent-drafted, human-approved-without-
-- revision year -- the human's only touch is an APPROVAL, never setting last_human_editor -- still
-- resolves v_human_preparer to null (coalesce(last_human_editor, maker_actor) reads the agent) AND
-- v_agent_prepared to true (an approved, maker=agent, last_human_editor-still-null row exists), so
-- it lands on row 7's TRUE branch and stamps 'agent_prepared' with no distinct-checker raise --
-- exactly as ruled, exactly as before this file, in BOTH the old code and the new. This file only
-- ever changes the FALSE branch's label; the TRUE branch (and everything upstream of it) is
-- byte-identical. Preparation-authorship is not approval, and approval-without-revision earning no
-- raise is the design's own intent, not a gap this file introduces or repairs.
--
-- reopen_fiscal_year CHECKED, NOT TOUCHED. Its own segregation computation (0120:776-777,
-- unmoved by this file) is `case when v_agent_prepared then 'agent_prepared' when v_self then
-- 'solo_self_attested' else 'two_person' end` -- already conditions the label on the real probe,
-- with no row-7-shaped branch at all: `v_self` is always a well-defined boolean by the time this
-- line runs (the CLR05 arms above it already require v_checked or v_attest non-null, so the
-- "nobody at all" state this file's row-7 fix targets cannot arise here). Its prosrc is prestate-
-- pinned and tail-repinned to the SAME sha, proving the claim rather than asserting it.
--
-- D1 — WRITE-QUIESCE REQUIRED (packages/db/README.md "Deploy contract"): one live audited writer
-- CoR'd (finalize_close). reopen_fiscal_year is read/pinned only, not replaced -- no quiesce
-- obligation on its account. An in-flight finalize_close call spanning this migration completes on
-- the OLD body (Postgres's per-call semantics) and would still mint a row-7 'agent_prepared' stamp
-- on a preparation-less year; the quiesce window is what makes that impossible, not this file.
--
-- Timeout is PRECAUTIONARY: one CREATE OR REPLACE FUNCTION plus one CHECK swap, no backfill.
set local statement_timeout = '5min';

set role clara_fn_owner;

-- =================================================================================================
-- §0 · PRESTATE
-- =================================================================================================
do $prestate$
declare
  v_sha text;
  v_def text;
begin
  -- 0.1 · finalize_close pinned by its LIVE prosrc sha (superseded-body law: read the catalog,
  -- never re-derive from a migration file's own text -- this pin is what this file measured on
  -- its own rig, at the frontier it was authored against: main tip through 0127).
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha
    from pg_proc p where p.oid = 'clara.finalize_close(uuid,text,text)'::regprocedure;
  if v_sha is distinct from '11ade605d2a6d7fe17f4cbf8b8613674709e335dee5446dcc781f0f60a3f69fa' then
    raise exception 'f_a4_pr_1b2_a4_truth prestate: clara.finalize_close drifted from the pinned prosrc (got %) -- either a later change moved this body, or this file already applied', v_sha
      using errcode = 'CLR10';
  end if;

  -- 0.2 · reopen_fiscal_year pinned too, though this file CoRs nothing in it -- proving "checked,
  -- not touched" rather than merely claiming it (the same sha this migration will re-pin at the
  -- tail; any drift here means the "shares the arm?" investigation above needs redoing on a
  -- moved target, not that this file may proceed on a stale premise).
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha
    from pg_proc p where p.oid = 'clara.reopen_fiscal_year(uuid,text,jsonb,text,text)'::regprocedure;
  if v_sha is distinct from '3c1c24ee1c69c84538fd8ce7254955ee01045a3027b4942c171090b7e4820fd5' then
    raise exception 'f_a4_pr_1b2_a4_truth prestate: clara.reopen_fiscal_year drifted from the pinned prosrc (got %) -- this file does not touch this body but pins it to prove it stays byte-unmoved', v_sha
      using errcode = 'CLR10';
  end if;

  -- 0.3 · the segregation_mode CHECK at its EXACT pre-widening, three-value text (idempotency
  -- guard, fail-closed both ways: proves 'no_preparation' is ABSENT as well as proving the prior
  -- three are all still there -- "prove trued pins both ways", not a substring probe on the new
  -- value's own name alone).
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
    where c.conrelid = 'clara.close_receipts'::regclass and c.conname = 'close_receipts_segregation_mode_check';
  if v_def is distinct from 'CHECK ((segregation_mode = ANY (ARRAY[''two_person''::text, ''solo_self_attested''::text, ''agent_prepared''::text])))' then
    raise exception 'f_a4_pr_1b2_a4_truth prestate: close_receipts_segregation_mode_check is not at its exact post-0120/pre-widening text (got: %)', v_def
      using errcode = 'CLR10';
  end if;

  raise notice 'f_a4_pr_1b2_a4_truth prestate: clean -- finalize_close and reopen_fiscal_year at their pinned post-0120 prosrc shas, segregation_mode CHECK at its exact three-value pre-widening text (no_preparation absent)';
end
$prestate$;

-- =================================================================================================
-- §1 · close_receipts.segregation_mode CHECK -- extend-only, prior three values byte-carried.
-- =================================================================================================
alter table clara.close_receipts drop constraint close_receipts_segregation_mode_check;
alter table clara.close_receipts add constraint close_receipts_segregation_mode_check
  check (segregation_mode = any (array['two_person', 'solo_self_attested', 'agent_prepared', 'no_preparation']));

-- =================================================================================================
-- §2 · clara.finalize_close CoR -- row 7's ONE line. What this estate actually pins is
-- prosrc, not the full CREATE statement: the RETURNS/LANGUAGE/SECURITY DEFINER header below is
-- typed in this file's own house casing, so it and the trailing `;` will never literally match
-- pg_get_functiondef's canonical uppercase, no-trailing-semicolon rendering -- that is
-- pg_get_functiondef's own artifact on every such CoR in this estate, not a drift here. The
-- PROSRC BODY -- declare through end, the part the prestate sha actually measures -- is the
-- live pull verbatim, diffed line-for-line against the catalog read this file's prestate sha
-- was taken from: one statement changed (the row-7 assignment below), nothing else moved.
-- =================================================================================================
create or replace function clara.finalize_close(p_fy uuid, p_self_attestation text, p_op_key text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'clara', 'pg_temp'
as $function$
declare
  c record; v_fy record; v_run record; v_dedupe jsonb; g record;
  v_att record; v_prep record; v_human_preparer uuid; v_agent_prepared boolean; v_mode text;
  v_re text; v_re_n int; v_pl bigint; v_line int; v_entry uuid; v_permit uuid;
  v_pl_rows jsonb; v_open_diffs jsonb; v_prior_receipt record; v_pin jsonb;
  v_closing_pos jsonb; v_receipt uuid; v_gate_summary jsonb; v_watermark text;
  v_fa jsonb; v_n int; r record; v_reopen_settled jsonb; v_items text[]; v_missing text[];
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if not clara._has_capability(c.firm, c.actor, 'close_and_attest') then
    raise exception 'finalizing a close takes the close_and_attest capability (key 2)'
      using errcode = 'CLR04',
        detail = '{"reason":"capability_missing","capability":"close_and_attest"}';
  end if;
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  select * into v_fy from clara.fiscal_years fy where fy.id = p_fy;
  if v_fy.id is null or v_fy.firm_id <> c.firm then
    raise exception 'fiscal year is not in your firm'
      using errcode = 'CLR11', detail = '{"reason":"fiscal_year_not_in_firm"}';
  end if;
  perform 1 from clara.clients cl where cl.id = v_fy.client_id and cl.firm_id = c.firm;
  if not found then
    raise exception 'client is not in your firm'
      using errcode = 'CLR11', detail = '{"reason":"client_not_in_firm"}';
  end if;
  v_dedupe := clara._reserve_op(c.firm, 'finalize_close', p_op_key,
    clara._hash(jsonb_build_object('fy', p_fy, 'self_attestation', p_self_attestation)));
  if v_dedupe is not null then return v_dedupe; end if;
  perform pg_advisory_xact_lock(203005004, hashtext(v_fy.client_id::text));
  perform pg_advisory_xact_lock(203005007, hashtext(v_fy.client_id::text));
  select * into v_fy from clara.fiscal_years fy where fy.id = p_fy;
  if v_fy.status <> 'closing' then
    raise exception 'fiscal year % is %; finalize takes a year mid-close', v_fy.label, v_fy.status
      using errcode = 'CLR41', detail = '{"reason":"close_not_in_progress"}';
  end if;
  select * into v_run from clara.close_runs r2
    where r2.fiscal_year_id = p_fy and r2.state = 'in_progress';
  if v_run.id is null then
    raise exception 'no in-progress close run exists for this fiscal year'
      using errcode = 'CLR41', detail = '{"reason":"close_not_in_progress"}';
  end if;

  -- RE-EVALUATE EVERY GATE IN-TRANSACTION (the attestation-staleness law measures against
  -- THESE digests, not the begin-time ones).
  v_gate_summary := clara._evaluate_close_gates(v_run.id);

  -- THE DRAWER SWEEP over the FRESH results (latest row per check on this run).
  for g in
    select distinct on (r2.check_key) r2.*
      from clara.close_gate_results r2
      where r2.close_run_id = v_run.id
      order by r2.check_key, r2.seq desc
  loop
    if g.drawer = 1 and g.state = 'fail' then
      raise exception 'drawer-1 identity % FAILED -- no attestation path exists, for anybody', g.check_key
        using errcode = 'CLR41',
          detail = jsonb_build_object('reason', 'drawer1_identity_failed',
            'check_key', g.check_key, 'measured', g.measured)::text;
    elsif g.drawer = 1 and g.state in ('unknown', 'error') then
      raise exception 'drawer-1 identity % could not be evaluated (%) -- an unevaluated identity has not passed', g.check_key, g.state
        using errcode = 'CLR41',
          detail = jsonb_build_object('reason', 'drawer1_state_unknown',
            'check_key', g.check_key, 'state', g.state, 'measured', g.measured)::text;
    elsif g.drawer = 2 and g.state in ('fail', 'unknown', 'error') then
      v_items := clara._gate_outstanding_items(g.check_key, g.measured);
      if coalesce(array_length(v_items, 1), 0) = 0 then
        v_items := array['__gate__'];
      end if;
      select coalesce(array_agg(x.k order by x.k), '{}') into v_missing
        from unnest(v_items) x(k)
        where not exists (select 1 from clara.close_attestations a
                join clara.close_gate_results gr on gr.id = a.gate_result_id
                where a.close_run_id = v_run.id and a.check_key = g.check_key
                  and a.item_key = x.k and a.superseded_at is null
                  and gr.measured_digest = g.measured_digest);
      if coalesce(array_length(v_missing, 1), 0) > 0 then
        select a.*, gr.measured_digest as bound_digest into v_att
          from clara.close_attestations a
          join clara.close_gate_results gr on gr.id = a.gate_result_id
          where a.close_run_id = v_run.id and a.check_key = g.check_key
            and a.superseded_at is null
          order by a.attested_at desc limit 1;
        if v_att.id is not null and v_att.bound_digest <> g.measured_digest then
          raise exception 'the attestation on % signed a state that has since MOVED -- re-attest against the fresh measurement', g.check_key
            using errcode = 'CLR41',
              detail = jsonb_build_object('reason', 'close_attestation_stale',
                'check_key', g.check_key, 'attested_digest', v_att.bound_digest,
                'fresh_digest', g.measured_digest,
                'missing_or_stale_items', to_jsonb(v_missing))::text;
        end if;
        raise exception 'drawer-2 gate % is % and % item(s) carry no live attestation', g.check_key, g.state, array_length(v_missing, 1)
          using errcode = 'CLR41',
            detail = jsonb_build_object('reason', 'drawer2_unattested',
              'check_key', g.check_key, 'measured', g.measured,
              'missing_items', to_jsonb(v_missing))::text;
      end if;
    end if;
  end loop;

  -- SEGREGATION (E-R11 / §2.10, RE-AIMED by TA-P6 -- close-key-1-design.md §3.9 changes 1-3,
  -- Annex A.4's eight-combination table). v_human_preparer is now measured against the FY's
  -- last HUMAN preparer only (F2's fix: today's unfiltered read resolves to the agent on an
  -- agent-prepared year, so the distinct-checker test went vacuous). v_agent_prepared is an
  -- INDEPENDENT probe for a separate question -- never derived from v_human_preparer, which is
  -- exactly the derivation F2 broke.
  select je.* into v_prep from clara.journal_entries je
    join clara.users u on u.id = coalesce(je.last_human_editor, je.maker_actor)
    where je.client_id = v_fy.client_id
      and je.posting_date between v_fy.starts_on and v_fy.ends_on
      and u.is_agent = false
    order by coalesce(je.approved_at, je.updated_at) desc, je.id desc limit 1;
  v_human_preparer := coalesce(v_prep.last_human_editor, v_prep.maker_actor);
  select exists (
      select 1 from clara.journal_entries je2
        where je2.client_id = v_fy.client_id
          and je2.posting_date between v_fy.starts_on and v_fy.ends_on
          and je2.status = 'approved'
          and je2.maker_actor = clara.agent_user_id()
          and je2.last_human_editor is null)
    into v_agent_prepared;
  if v_human_preparer is null then
    -- ROW 7 of Annex A.4: no human ever touched the year -- there is no preparer to be distinct
    -- from, and inventing one to raise against would be law 68's ARM-0 failure. Never a raise on
    -- the distinct-checker arm here, regardless of eligible-checker count.
    if clara.eligible_checker_count(c.firm) < 2
       and (p_self_attestation is null or btrim(p_self_attestation) = '') then
      raise exception 'a solo firm closes with an explicit self-approval attestation'
        using errcode = 'CLR41',
          detail = '{"reason":"close_self_attestation_required"}';
    end if;
    -- OWNER RULING 2026-08-25 (Annex A.4 row 7 vs invariant (i)): the label follows the REAL
    -- probe here too, exactly as rows 1-6 already do -- 'agent_prepared' only when the agent
    -- genuinely prepared something; a year with no human preparer AND no agent preparation
    -- (v_agent_prepared reads false: nothing approved, maker=agent, last_human_editor-still-
    -- null exists -- most commonly a dormant year that minted zero entries at all) gets its own
    -- truthful mode, 'no_preparation', never the agent's name on work the agent never did. The
    -- gate immediately above (self-attestation for a solo firm) already governs BOTH outcomes
    -- identically, so 'no_preparation' inherits agent_prepared's exact review floor, never a
    -- looser one -- the ruling's "at least as strict" requirement holds by construction, not by
    -- a second check. D-2 (checked, not assumed, header comment above): an all-agent-drafted,
    -- human-approved-without-revision year still resolves v_agent_prepared TRUE here and stamps
    -- 'agent_prepared' exactly as before -- this line changes only the FALSE branch's label.
    v_mode := case when v_agent_prepared then 'agent_prepared' else 'no_preparation' end;
  elsif clara.eligible_checker_count(c.firm) >= 2 then
    -- ROWS 1-4: H=yes. The raise is decided by H and S alone and is untouched by A -- Clara's
    -- participation never excuses a human self-check, and never creates one.
    if v_human_preparer = c.actor then
      raise exception 'the closer must differ from the year''s last human preparer -- a different eligible human must finalize'
        using errcode = 'CLR41',
          detail = jsonb_build_object('reason', 'close_segregation_violation',
            'last_preparer', v_human_preparer)::text;
    end if;
    v_mode := case when v_agent_prepared then 'agent_prepared' else 'two_person' end;
  else
    -- ROWS 5-6: H=no.
    if p_self_attestation is null or btrim(p_self_attestation) = '' then
      raise exception 'a solo firm closes with an explicit self-approval attestation'
        using errcode = 'CLR41',
          detail = '{"reason":"close_self_attestation_required"}';
    end if;
    v_mode := case when v_agent_prepared then 'agent_prepared' else 'solo_self_attested' end;
  end if;

  -- THE P&L → RETAINED-EARNINGS ROLL, from DB-owned inputs only: trial_balance_as_of at
  -- ends_on minus at starts_on-1, restricted to P&L types by an EXPLICIT coa join (the
  -- read carries no type). Per-account movement = what the closing entry zeroes.
  select coalesce(jsonb_agg(jsonb_build_object('account_code', m.account_code,
           'account_type', m.account_type, 'movement_cents', m.mv)
         order by m.account_code), '[]'::jsonb),
         coalesce(sum(case when m.account_type = 'income' then -m.mv else 0 end)
                - sum(case when m.account_type = 'expense' then m.mv else 0 end), 0)
    into v_pl_rows, v_pl
    from (
      select a.account_code, a.account_type,
             coalesce(te.debit_cents - te.credit_cents, 0)
           - coalesce(ts.debit_cents - ts.credit_cents, 0) as mv
        from clara.coa_accounts a
        left join clara.trial_balance_as_of(v_fy.client_id, v_fy.ends_on) te
          on te.account_code = a.account_code
        left join clara.trial_balance_as_of(v_fy.client_id, v_fy.starts_on - 1) ts
          on ts.account_code = a.account_code
        where a.client_id = v_fy.client_id and a.account_type in ('income', 'expense')
    ) m
    where m.mv <> 0;

  -- THE RETAINED-EARNINGS RESOLUTION: the chart's own structural marker
  -- (special_acc_type = 'retained_earnings'), exactly one active -- else the close cannot
  -- know where the year rolls, and says so.
  select count(*)::int, min(a.account_code) into v_re_n, v_re
    from clara.coa_accounts a
    where a.client_id = v_fy.client_id and a.is_active
      and a.special_acc_type = 'retained_earnings';
  if v_re_n <> 1 then
    raise exception 'the chart carries % active retained-earnings account(s) (special_acc_type=''retained_earnings''); the close needs exactly one', v_re_n
      using errcode = 'CLR41',
        detail = jsonb_build_object('reason', 'drawer1_state_unknown',
          'resolution', 'special_acc_type=retained_earnings', 'count', v_re_n)::text;
  end if;

  -- THE OPENING-SIDE TIE against the PRIOR receipt's PIN (never a re-derivation where a
  -- pin exists; matrix A19g's close arm). First FY / pre-model prior: the Wave-B opening
  -- machinery asserted the seed (recorded in the snapshot, not re-argued).
  select cr.* into v_prior_receipt from clara.close_receipts cr
    where cr.fiscal_year_id = v_fy.prior_fy_id and cr.kind = 'close' and cr.status = 'active';
  if v_fy.prior_fy_id is not null and v_prior_receipt.id is null then
    raise exception 'the prior fiscal year carries no active close receipt; the opening continuity pin is unprovable -- close the prior year first'
      using errcode = 'CLR41',
        detail = '{"reason":"drawer1_identity_failed","check_key":"opening_continuity_tie","refusal":"prior_close_receipt_missing"}';
  end if;
  if v_prior_receipt.id is not null then
    v_pin := v_prior_receipt.snapshot -> 'closing_position';
    select coalesce(jsonb_agg(jsonb_build_object('account_code', d.code,
             'pinned_cents', d.pin, 'current_cents', d.cur) order by d.code), '[]'::jsonb)
      into v_open_diffs
      from (
        select coalesce(p.key, t.account_code) as code,
               coalesce((p.value ->> 0)::bigint, (p.value)::text::bigint, 0) as pin,
               coalesce(t.debit_cents - t.credit_cents, 0) as cur
          from jsonb_each(coalesce(v_pin, '{}'::jsonb)) p(key, value)
          full outer join (
            select tb.account_code, tb.debit_cents, tb.credit_cents
              from clara.trial_balance_as_of(v_fy.client_id, v_fy.starts_on - 1) tb
              join clara.coa_accounts a on a.client_id = v_fy.client_id
               and a.account_code = tb.account_code
              where a.account_type in ('asset', 'liability', 'equity')
          ) t on t.account_code = p.key
      ) d
      where d.pin <> d.cur;
    if jsonb_array_length(v_open_diffs) > 0 then
      raise exception 'this year''s opening no longer ties to the prior close''s pinned position -- the identity is absolute, with no override, for anybody'
        using errcode = 'CLR41',
          detail = jsonb_build_object('reason', 'drawer1_identity_failed',
            'check_key', 'opening_continuity_tie', 'diffs', v_open_diffs)::text;
    end if;
  end if;

  -- THE CLOSING ENTRY: permit → DRAFT insert → lines → the census-VISIBLE flip. A year
  -- with zero P&L movement mints no entry (an empty entry is not a journal), and the
  -- receipt records that honestly.
  v_receipt := gen_random_uuid();
  select coalesce(jsonb_agg(cr2.id), '[]'::jsonb) into v_reopen_settled
    from clara.close_receipts cr2
    where cr2.fiscal_year_id = v_fy.id and cr2.kind = 'reopen' and cr2.status = 'active';
  update clara.close_receipts set status = 'superseded'
    where fiscal_year_id = v_fy.id and kind = 'reopen' and status = 'active';
  if jsonb_array_length(v_pl_rows) > 0 then
    v_entry := gen_random_uuid();
    insert into clara.close_write_permits(firm_id, client_id, fiscal_year_id, close_run_id,
        purpose, target_entry_id, entries_expected)
      values (c.firm, v_fy.client_id, v_fy.id, v_run.id, 'close_entry', v_entry, 1)
      returning id into v_permit;
    insert into clara.journal_entries(id, client_id, status, posting_date, memo, origin,
        is_year_end, maker_actor, last_human_editor, close_receipt_id, closing_transfer)
      values (v_entry, v_fy.client_id, 'draft', v_fy.ends_on,
        'Year-end close ' || v_fy.label || ' — P&L to retained earnings', 'manual',
        true, c.actor, c.actor, v_receipt,
        -- TASK #17 FIX A: born marked. Before this fix the column stayed at its default false
        -- forever -- this entry is auto-approved in THIS SAME transaction, so it never sits as
        -- an editable draft revise_entry could later mark -- and the SST turnover evaluator's
        -- `not (is_year_end and closing_transfer)` exclusion never fired: the entry's income-leg
        -- DEBIT (zeroing the account the evaluator sums as credit-minus-debit) counted, and every
        -- year-end roll DEFLATED the rolling figure -- permanent SUPPRESSION of the 80%
        -- early-warning ladder, never a false alarm (measured direction, T7). A single-body fix
        -- (this one alone, without the reopen mirror below) would leave the mirror's own
        -- income-leg CREDIT unmarked on every reopened-then-reclosed year -- the mirror swaps
        -- debit/credit, so an unmarked mirror INVERTS the defect into compounding INFLATION
        -- of the rolling figure -- which is why both bodies are marked in this one migration
        -- (D-23, GM-7).
        true);
    v_line := 0;
    for r in select * from jsonb_array_elements(v_pl_rows) x(el) loop
      v_line := v_line + 1;
      insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents,
          credit_cents, description)
        values (v_entry, v_line, r.el ->> 'account_code',
          case when (r.el ->> 'movement_cents')::bigint < 0
               then -(r.el ->> 'movement_cents')::bigint else 0 end,
          case when (r.el ->> 'movement_cents')::bigint > 0
               then (r.el ->> 'movement_cents')::bigint else 0 end,
          'Close ' || (r.el ->> 'account_type'));
    end loop;
    v_line := v_line + 1;
    insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents,
        credit_cents, description)
      values (v_entry, v_line, v_re,
        case when v_pl < 0 then -v_pl else 0 end,
        case when v_pl > 0 then v_pl else 0 end,
        'Net result to retained earnings');
    perform clara._assert_balanced(v_entry);
    update clara.journal_entries set status='approved', approved_at = now(),
        checker_actor = c.actor
      where id = v_entry;
    perform clara._subledger_on_approve(v_entry);
    select count(*) into v_n from clara.open_items oi where oi.entry_id = v_entry;
    if v_n <> 0 then
      raise exception 'the closing entry minted % open item(s) -- a P&L→RE close must move no subledger', v_n
        using errcode = 'CLR41',
          detail = '{"reason":"drawer1_identity_failed","check_key":"pl_retained_earnings_roll"}';
    end if;
  end if;

  -- THE PIN: the per-balance-sheet-account closing position IN CENTS, read AFTER the
  -- closing entry posted (drawer 1's stored operand for FY(n+1); matrix A19f).
  select coalesce(jsonb_object_agg(t.account_code, (t.debit_cents - t.credit_cents)), '{}'::jsonb)
    into v_closing_pos
    from clara.trial_balance_as_of(v_fy.client_id, v_fy.ends_on) t
    join clara.coa_accounts a on a.client_id = v_fy.client_id
     and a.account_code = t.account_code
    where a.account_type in ('asset', 'liability', 'equity')
      and (t.debit_cents - t.credit_cents) <> 0;

  v_fa := clara.fa_control_tie_out(v_fy.client_id, v_fy.id);
  select md5(count(*)::text || coalesce(max(je.approved_at)::text, ''))
    into v_watermark
    from clara.journal_entries je
    where je.client_id = v_fy.client_id and je.status = 'approved';

  insert into clara.close_receipts(id, firm_id, client_id, fiscal_year_id, close_run_id,
      prior_close_receipt_id, kind, closed_by, segregation_mode, last_preparer_actor,
      self_attestation, pl_net_cents, retained_earnings_account, closing_tb_digest,
      gate_digest, books_watermark, dataset_sha256, close_entry_id, snapshot)
    values (v_receipt, c.firm, v_fy.client_id, v_fy.id, v_run.id,
      v_prior_receipt.id, 'close', c.actor, v_mode, v_human_preparer,
      nullif(btrim(coalesce(p_self_attestation, '')), ''), v_pl, v_re,
      md5(v_closing_pos::text), md5(v_gate_summary::text), v_watermark,
      encode(sha256(convert_to(v_closing_pos::text, 'UTF8')), 'hex'), v_entry,
      jsonb_build_object(
        'closing_position', v_closing_pos,
        'fy_end_source', v_fy.fy_end_source,
        'superseded_reopen_receipt_ids', v_reopen_settled,
        'gates', v_gate_summary,
        'attestations', coalesce((select jsonb_agg(jsonb_build_object('check_key', a.check_key,
            'item_key', a.item_key,
            'attested_by', a.attested_by, 'reason', a.reason, 'attested_at', a.attested_at,
            'gate_result_id', a.gate_result_id, 'superseded', a.superseded_at is not null)
            order by a.attested_at)
          from clara.close_attestations a where a.close_run_id = v_run.id), '[]'::jsonb),
        'pl_rows', v_pl_rows,
        'fa_roll', v_fa,
        'opening_tie', case when v_prior_receipt.id is not null
          then jsonb_build_object('basis', 'prior_receipt_pin',
                 'prior_receipt_id', v_prior_receipt.id, 'diffs', '[]'::jsonb)
          else jsonb_build_object('basis', 'wave_b_opening_machinery',
                 'note', 'no prior close receipt; the seed tie was asserted at approval') end,
        'watermark_basis', 'v1_count_maxapproved',
        'dataset_basis', 'v1_closing_position_sha256'));

  update clara.close_runs set state = 'finalized', ended_by = c.actor, ended_at = now()
    where id = v_run.id;
  update clara.fiscal_years set status = 'closed' where id = p_fy;

  perform clara._audit(c.firm, c.actor, null, null, 'finalize_close', v_entry,
    jsonb_build_object('fiscal_year_id', p_fy, 'close_run_id', v_run.id,
      'receipt_id', v_receipt, 'pl_net_cents', v_pl, 'segregation_mode', v_mode,
      'op_key', p_op_key));
  perform clara._append_event(c.firm, 'close.finalized', v_fy.client_id, c.actor,
    null, null, v_entry, null, null,
    jsonb_build_object('fiscal_year_id', p_fy, 'receipt_id', v_receipt));
  return clara._finish_op(c.firm, 'finalize_close', p_op_key,
    jsonb_build_object('receipt_id', v_receipt, 'fiscal_year_id', p_fy,
      'close_entry_id', v_entry, 'pl_net_cents', v_pl,
      'retained_earnings_account', v_re, 'segregation_mode', v_mode));
end $function$;

reset role;

-- =================================================================================================
-- §TAIL · census + self-proofs. STATIC only, matching 0120's own T.3 (its segregation-mode proof
-- was textual, not a full live close) -- deliberately, not by omission: a full behavioral three-
-- mode proof needs a real firm/client/CoA/eligible-checker shape this migration cannot safely
-- fabricate against an ARBITRARY live database without either polluting real firm data or hand-
-- rolling the app's own onboarding machinery from raw SQL (a materially riskier path than reusing
-- the already-hardened rig test fixtures). The behavioral proof lives in the SAME-COMMIT test file
-- update instead (packages/db/tests/f-a4-pr1b2-a4-truth.test.mjs), which this tail's own T.3 names.
-- =================================================================================================
do $tail$
declare
  v_def text; v_src text; v_sha text;
begin
  -- T.1 · the widened CHECK carries all four values, byte-carrying the prior three.
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
    where c.conrelid = 'clara.close_receipts'::regclass and c.conname = 'close_receipts_segregation_mode_check';
  if v_def is distinct from 'CHECK ((segregation_mode = ANY (ARRAY[''two_person''::text, ''solo_self_attested''::text, ''agent_prepared''::text, ''no_preparation''::text])))' then
    raise exception 'f_a4_pr_1b2_a4_truth tail: close_receipts_segregation_mode_check is not at its exact post-widening text (got: %)', v_def
      using errcode = 'CLR10';
  end if;

  -- T.2 · finalize_close's row-7 branch now conditions on v_agent_prepared, positionally (not two
  -- independent substring hits -- a mutant that kept the literal 'no_preparation' ELSEWHERE in the
  -- body but left row 7 hard-coded would still pass two unlinked position() checks). Anchor on the
  -- exact conditional statement this file installs.
  select p.prosrc into v_src from pg_proc p where p.oid = 'clara.finalize_close(uuid,text,text)'::regprocedure;
  if v_src !~ 'v_mode := case when v_agent_prepared then ''agent_prepared'' else ''no_preparation'' end;' then
    raise exception 'f_a4_pr_1b2_a4_truth tail: finalize_close row 7 does not condition segregation_mode on v_agent_prepared' using errcode = 'CLR10';
  end if;
  -- and the OLD unconditional stamp is genuinely GONE, not merely shadowed by the new line
  -- appearing somewhere else in the body (forward-only, fail-closed both ways). MEASURED: a
  -- regex spanning "v_human_preparer is null then" to the old assignment via `[^;]*` cannot
  -- cross the self-attestation raise block's own semicolons in between, so that shape can never
  -- match either the real pre-image OR a live-reverted mutant -- it is vacuously true (always
  -- passes) and proves nothing. The reverted-body detector is the OLD line's own exact text, at
  -- its real four-space indent (disambiguating it from this file's header-comment prose, which
  -- never sits at that indent): present only in the pre-ruling body, absent in the shipped one.
  if position('    v_mode := ''agent_prepared'';' in v_src) > 0 then
    raise exception 'f_a4_pr_1b2_a4_truth tail: finalize_close still carries the unconditional row-7 stamp' using errcode = 'CLR10';
  end if;

  -- T.3 · reopen_fiscal_year re-pinned to the SAME sha as the prestate -- "checked, not touched"
  -- proven, not merely claimed. The real behavioral three-mode proof (agent-prepared year ->
  -- agent_prepared; human-prepared year -> two_person/solo_self_attested; dormant zero-entry year
  -- -> no_preparation) lives in tests/f-a4-pr1b2-a4-truth.test.mjs, same commit.
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha
    from pg_proc p where p.oid = 'clara.reopen_fiscal_year(uuid,text,jsonb,text,text)'::regprocedure;
  if v_sha is distinct from '3c1c24ee1c69c84538fd8ce7254955ee01045a3027b4942c171090b7e4820fd5' then
    raise exception 'f_a4_pr_1b2_a4_truth tail: reopen_fiscal_year moved (got %) -- this file promised to touch nothing in it', v_sha
      using errcode = 'CLR10';
  end if;

  raise notice 'f_a4_pr_1b2_a4_truth tail: OK -- segregation_mode CHECK widened to four values (prior three byte-carried), finalize_close row 7 now conditions its label on v_agent_prepared (the old unconditional stamp confirmed absent), reopen_fiscal_year re-pinned byte-unmoved at the same prosrc sha as prestate. Behavioral three-mode proof: tests/f-a4-pr1b2-a4-truth.test.mjs, same commit.';
end
$tail$;
