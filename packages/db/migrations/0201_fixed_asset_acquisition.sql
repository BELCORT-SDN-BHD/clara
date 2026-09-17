-- 0201_fixed_asset_acquisition — #639 (refresh spec #612; journeys C1, C3, C7): A SUPPORTED
-- ACQUISITION PRODUCES ITS JOURNAL *AND* ITS FIXED-ASSET REGISTER ROW IN ONE COMMIT, ON EVERY
-- LANE, WHILE THE DEPRECIATION PARTICULARS WAIT ALONE.
-- =====================================================================================
-- Spec of record: issue #639 — "完成资产购入与登记，独立等待缺失折旧资料". Domain words:
-- CONTEXT.md — "Fixed asset acquisition", "Pending particulars", "Depreciation particulars",
-- "Dependent particulars question". Builds on 0041 (the fixed-asset register), 0178/0195 (the
-- accounting-work lane and its posting core) and 0180 (#629's versioned Work question).
--
-- WHAT THIS FILE ADDS, IN ONE SENTENCE. A LANE-AGNOSTIC BIRTH TRIGGER on
-- `clara.journal_entries` so an acquisition posted by ANY approve path — including the Work
-- lane's, which reaches no subledger hook — births its register row before the fixed-asset belt
-- looks for one; plus the provenance and reads that make the acquisition visible as its own fact,
-- and a runtime-callable particulars door so the answer to the dependent question can be applied
-- on behalf of the human who asked for the work.
--
-- =====================================================================================
-- THE MEASUREMENT THAT SHAPES EVERYTHING BELOW: A WORK-LANE ACQUISITION COULD NOT COMMIT AT ALL.
--
-- `clara._fa_on_approve` (0041:2227) is a HOOK, not a verb. Its one caller is a single line
-- spliced into `clara._subledger_on_approve` (0041:4530), and THAT function's callers are the
-- approve cores `0037_wave_c_a_subledger.sql:3840-3845` pinned as four — `_approve_entry_core`,
-- `_approve_opening_entry`, `approve_wrong_client_correction`, `reverse_entry` — which MEASURED on
-- clara_639 at 0200 are now SIX (0056's close model added `finalize_close` and
-- `reopen_fiscal_year`). §F (T.5) re-derives and re-pins the measured set.
--
-- `clara._record_journal_entry_core` — the live posting core the Work lane runs (0195:1685) — is
-- a FIFTH approve path. It inserts the entry as `draft` (0195:2098) and then approves it with a
-- raw `update clara.journal_entries set status='approved', …` (0195:2110-2113). It calls NO hook.
-- So a `claraWork_v3` run posting Dr <enrolled fixed-asset cost account> / Cr bank births NOTHING,
-- and the DEFERRED belt `t_je_fa_movement_belt` (0041:2741-2743) then raises CLR40
-- `fa_belt_unregistered_movement` AT COMMIT — after the operation receipt (0195:2130) and the
-- Work `result` (0195:2194) have already been written, and takes them down with it.
--
-- MEASURED ON THE RIG BEFORE THIS FILE WAS WRITTEN, not reasoned about:
-- `packages/db/tests/fixed-asset-acquisition.test.mjs` cell `p639.birth.work_lane`, run against a
-- clara_639 pinned at 0200, failed with SQLSTATE CLR40 and the message "this entry moves an
-- account enrolled for the fixed-asset register (200-D41 as cost) without a register act".
--
-- AND THE IN-TREE CLAIM THAT SAYS OTHERWISE IS STALE. `0041:4528-4529` reads "All four approve
-- paths funnel through this function, so this one line is what makes FA materialisation intrinsic
-- at every one of them"; it was true when 0041 shipped and stopped being true when 0178 minted a
-- fifth approve path. `x41-wave-d-a-fa.test.mjs`'s own census counts FUNCTIONS containing the
-- hook literal, not approve PATHS, which is why it stayed green for 137 migrations. The new cell
-- `p639.census.approve_paths` enumerates the paths themselves.
--
-- =====================================================================================
-- THE CHOICE: A LANE-AGNOSTIC TRIGGER, NOT A SIXTH RECUT OF THE POSTING CORE.
--
-- Splicing the hook into `clara._record_journal_entry_core` would recut the SIXTH copy of a
-- ~450-line body already pinned by 0194 (`0194:175-177`) and re-cut by 0195, and it would collide
-- with every other ticket in this wave that touches the accounting-work lane. The instrument used
-- here is the one the belt ITSELF uses: a DEFERRED CONSTRAINT TRIGGER on `clara.journal_entries`,
-- gated `when (new.status = 'approved')`.
--
-- ORDERING IS THE WHOLE PREMISE, AND IT WAS MEASURED, NOT ASSUMED. PostgreSQL fires the deferred
-- after-trigger queue in the order the events were queued, and for one row event that order is
-- ALPHABETICAL BY TRIGGER NAME — not creation order. Measured on clara_639 (PG 17.11) with two
-- deferred constraint triggers carrying these exact two names, created in the OPPOSITE order to
-- their names and flushed with `set constraints all immediate`: the observed firing order was
-- `t_je_fa_acquisition_birth` then `t_je_fa_movement_belt`. The cell
-- `p639.birth.fire_order` re-measures it on every run rather than quoting this comment.
--
-- IT IS IDEMPOTENT AGAINST THE HOOK BY CONSTRUCTION. Arm 4 of `_fa_on_approve` already ends in
-- `on conflict (acquisition_line_id) do nothing` (0041:2630) against the unique index at
-- `0041:328`; this trigger performs the SAME insert with the SAME conflict target, so on the four
-- lanes that already birth it writes nothing, and on the Work lane it writes the row the estate
-- was missing. `p639.birth.idempotent` proves the pair births exactly one row per cost line.
--
-- THE GUARD IS ARM 4's, VERBATIM, PLUS ONE EXCLUSION ARM 4 DOES NOT CARRY. Arm 4 excludes
-- K-family openings, reversal mirrors and `fa_disposal` entries; it does NOT exclude
-- `origin='scheduled_run'`, which is harmless there only because a depreciation run debits the
-- EXPENSE account and the birth join requires the COST account. `0041:2603`'s own risk note says
-- so. This trigger closes the mechanical site itself, so a phantom birth would need BOTH guards
-- to fail rather than either.
--
-- A NEW WRITE INSIDE THE APPROVE TRANSACTION HAS NO REMEDY IF IT RAISES — `claraWork_v3` is
-- deploy-locked. So the trigger body performs exactly one INSERT and one event append, reads only
-- relations the definer already reads (`journal_entries`, `journal_lines`, `fa_account_profiles`),
-- and takes no lock the belt does not already take.
--
-- =====================================================================================
-- PROVENANCE: ONE COLUMN, AND TWO FACTS DERIVED BY JOIN.
--
-- `clara.fixed_assets.acquisition_document_id` is the ONE provenance fact an approve-time writer
-- can see. The operation receipt is inserted AFTER the approve (`0195:2130` vs `:2110`) and the
-- Work `result` is built inside the core (`:2194`), so an approve-time write of a receipt id or a
-- work id would stamp NULL forever — 0195:2123-2127 records the estate's own ruling on exactly
-- this. Work and receipt are therefore DERIVED BY JOIN from `acquisition_entry_id` at read time.
--
-- AND THE COLUMN IS WRITE-ONCE-AT-BIRTH, WHICH IS A MEASUREMENT, NOT A PREFERENCE.
-- `clara._tf_fixed_assets_immutable_0017` (0017) refuses any UPDATE that changes a column outside
-- its post-approval allowlist — `{status, disposed_at, disposal_entry_id, superseded_by_asset_id,
-- superseded_at, updated_at}` plus the particulars while they are incomplete — and
-- `acquisition_document_id` is in neither set. That trigger is NOT in #639's allowed recuts
-- (DECISIONS §1.3 gives this ticket `_fa_asset_json` and `get_fixed_asset` and nothing else), so
-- a row birthed by `_fa_on_approve` arm 4 — which is every document-lane row, the very rows that
-- HAVE a document — can never be back-filled.
--
-- THE READ IS THEREFORE THE AUTHORITY AND THE COLUMN IS ITS BIRTH-TIME COPY:
-- `coalesce(f.acquisition_document_id, e.document_id)` over the acquisition entry. The two can
-- never disagree — the tail below asserts it across the whole estate, and
-- `p639.provenance.document_lane` re-measures it on a real filed document. The column is not
-- redundant decoration: it is what survives if a later ticket ever re-files an entry's document,
-- and it is the only projection available to a reader that holds the register row alone.
--
-- =====================================================================================
-- THE PARTICULARS DOOR THE RUN CAN CALL — AND WHAT IT DELIBERATELY DOES NOT DO.
--
-- `clara.complete_fixed_asset_particulars` (0041:3035) is `clara_authenticated`-only, so no run
-- can apply the answer to its own dependent question. This file adds a SECOND door,
-- `clara.complete_fixed_asset_particulars_for(…, p_obo)`, granted to `clara_runtime` ONLY, on the
-- `clara.admit_periodic_adjustment_work` OBO shape (0194:1298-1314): actor-explicit, and the
-- authority is RE-READ LIVE rather than trusted from a snapshot — active membership of the
-- client's own firm, the bookkeeper floor, and an active client. A parked question may be
-- answered hours later, and the human who asked may by then have been demoted.
--
-- IT WRITES NO JOURNAL, AND THAT IS THE POINT OF THE WHOLE TICKET. The acquisition posted when it
-- posted; supplying the depreciation particulars afterwards is a register fact, never a second
-- accounting entry. Both doors share `clara._fa_validate_particulars` (0041:2970) and
-- `clara._fa_particulars_complete`, and the new shared core `clara._fa_complete_particulars_core`
-- carries the two walls 0041's door carries (a non-depreciable enrolment admits only
-- `method='none'`; a residual may not exceed cost) so the two can never drift on them.
--
-- NO NEW `accounting_work` PURPOSE. Purpose does not decide which approve path runs, so a new
-- purpose would not have birthed the asset either; it would only have forced a recut of a body
-- DECISIONS §1.3 closes.
--
-- =====================================================================================
-- THE REFUSAL VOCABULARY THIS FILE OWNS. Everything else it can raise is INHERITED and
-- deliberately NOT re-spelled: CLR40 `fa_belt_unregistered_movement` /
-- `fa_cost_adjustment_deferred` / `fa_k_gl_balance_on_enrolled` (0041's belt), CLR37
-- `fa_particulars_invalid` + axis / `fa_particulars_already_complete` (0041's validator), CLR10
-- `generic_control_leg` (0178:1355-1367 — which is why a credit-financed acquisition reaches the
-- register only through intake → coding), CLR19 `write_into_closed_period`.
--
--   CLR04 obo_not_active      + obo   the named human is no longer an active member of the firm
--   CLR04 insufficient_role   + obo   …or no longer holds the bookkeeper floor
--   CLR10 client_inactive             the client is archived
--   CLR11 client_not_found            no oracle: another firm's client answers the same way
--   CLR11 asset_not_found             …and so does another client's asset
--
-- =====================================================================================

do $p639_pre$
declare v_sha text; v_n int; v_sig text;
begin
  if to_regclass('clara.fixed_assets') is null then
    raise exception '#639 prestate: clara.fixed_assets is absent -- 0003/0041 must apply first'
      using errcode='CLR10';
  end if;

  -- (1) NOTHING OF THIS SLICE EXISTS YET. A half-applied #639 must be visible, not merged into.
  select count(*)::int into v_n from information_schema.columns
   where table_schema='clara' and table_name='fixed_assets' and column_name='acquisition_document_id';
  if v_n <> 0 then
    raise exception '#639 prestate: clara.fixed_assets.acquisition_document_id already exists'
      using errcode='CLR10';
  end if;
  if exists (select 1 from pg_trigger
              where tgrelid='clara.journal_entries'::regclass and tgname='t_je_fa_acquisition_birth') then
    raise exception '#639 prestate: t_je_fa_acquisition_birth already exists on clara.journal_entries'
      using errcode='CLR10';
  end if;
  if to_regprocedure('clara.complete_fixed_asset_particulars_for(uuid,uuid,jsonb,text,uuid)') is not null then
    raise exception '#639 prestate: a runtime particulars door already exists' using errcode='CLR10';
  end if;

  -- (2) THE PREREQUISITE ROSTER, in `::regprocedure` form (the 0180:102-159 idiom). Every one of
  -- these is a body this file CALLS or RELIES ON; an absent one means a lane this file assumes is
  -- simply not there, and the honest answer is to refuse to apply rather than to ship a trigger
  -- that silently never fires.
  foreach v_sig in array array[
      'clara._fa_on_approve(uuid)',
      'clara._tf_fa_movement_belt()',
      'clara._fa_validate_particulars(jsonb)',
      'clara._fa_particulars_complete(clara.fixed_assets)',
      'clara._fa_asset_json(uuid,date)',
      -- 0042's two later splices INTO `_fa_asset_json`. They are prerequisites of the RECUT, not
      -- of the trigger: the recut carries the live body forward and would fail to compile without
      -- them, which is the honest place to say so.
      'clara._fa_split_month_advisory(uuid)',
      'clara._fa_disposal_draft_outstanding(uuid,uuid,date)',
      'clara._fa_accumulated(uuid,date)',
      'clara._fa_uncharged_months(uuid,date)',
      'clara._fa_asset_charges(uuid,date,boolean)',
      'clara._fa_month_start(date)', 'clara._fa_month_end(date)', 'clara._fa_today()',
      'clara.get_fixed_asset(uuid)',
      'clara.complete_fixed_asset_particulars(uuid,uuid,jsonb,text)',
      'clara.open_work_question(uuid,text,jsonb,jsonb,text,jsonb)',
      'clara.answer_work_question(uuid,integer,jsonb,text)',
      'clara.get_work_pending_question(uuid)',
      'clara._append_event(uuid,text,uuid,uuid,uuid,text,uuid,uuid,uuid,jsonb)',
      'clara._reserve_op(uuid,text,text,bytea)',
      'clara._finish_op(uuid,text,text,jsonb)',
      'clara._audit(uuid,uuid,uuid,text,text,uuid,jsonb)',
      'clara.role_rank(text)',
      'clara._hash(jsonb)'] loop
    if to_regprocedure(v_sig) is null then
      raise exception '#639 prestate: prerequisite % is absent', v_sig using errcode='CLR10';
    end if;
  end loop;

  -- (3) THE TWO BODIES THIS FILE RECUTS, PINNED BY PRE-IMAGE sha256(prosrc). These are the FIRST
  -- fixed-asset pins ever written: `grep -ln '_fa_asset_json\|get_fixed_asset' migrations/018*.sql
  -- migrations/019*.sql` returns nothing, so no earlier file constrains them. BOTH VALUES WERE
  -- MEASURED ON A MIGRATED clara_639 (0001->0200, PG 17.11) — they CANNOT be read off 0041's text,
  -- because what lives in pg_proc is the body after every later splice.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara._fa_asset_json(uuid,date)'::regprocedure;
  if v_sha <> '477c4428a3ba342cd6016df864926fd4bd4d7430108e5ffe490fdf9d401fd45c' then
    raise exception '#639 prestate: clara._fa_asset_json has DRIFTED from the pinned 0041 body (sha %) -- re-derive the recut against the LIVE body before applying', v_sha
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara.get_fixed_asset(uuid)'::regprocedure;
  if v_sha <> 'e6cd2aadaabeb4ee158ebcb2fa1c41ed6ce6ca791c2f8c0b3d72fda4f53e0ff8' then
    raise exception '#639 prestate: clara.get_fixed_asset has DRIFTED from the pinned 0041 body (sha %) -- re-derive the recut against the LIVE body before applying', v_sha
      using errcode='CLR10';
  end if;

  -- (4) THE BELT IS STILL THE DEFERRED CONSTRAINT TRIGGER THIS FILE ORDERS ITSELF AGAINST. If it
  -- had become immediate, or had been renamed, "the birth fires first" would be a sentence about
  -- a trigger that no longer exists.
  if not exists (select 1 from pg_trigger t
                  where t.tgrelid='clara.journal_entries'::regclass
                    and t.tgname='t_je_fa_movement_belt'
                    and t.tgdeferrable and t.tginitdeferred and t.tgconstraint <> 0) then
    raise exception '#639 prestate: t_je_fa_movement_belt is not a DEFERRED constraint trigger on clara.journal_entries'
      using errcode='CLR10';
  end if;
  -- …and it sorts AFTER the name this file is about to install, which is what decides the order.
  if not ('t_je_fa_acquisition_birth' < 't_je_fa_movement_belt') then
    raise exception '#639 prestate: the birth trigger name does not sort before the belt'
      using errcode='CLR10';
  end if;

  -- (5) THE PARTIAL-BIRTH GUARD. The trigger's idempotency rests entirely on
  -- `acquisition_line_id` being a UNIQUE, always-present key for a hook-born row. A register row
  -- that names an acquisition LINE but no ENTRY (or the reverse, outside the supersede family)
  -- would make `on conflict (acquisition_line_id) do nothing` silently birth a twin.
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
                  where n.nspname='clara' and c.relkind='i'
                    and c.oid in (select indexrelid from pg_index i
                                   where i.indrelid='clara.fixed_assets'::regclass and i.indisunique
                                     and i.indnatts = 1
                                     and i.indkey[0] = (select attnum from pg_attribute
                                                         where attrelid='clara.fixed_assets'::regclass
                                                           and attname='acquisition_line_id'))) then
    raise exception '#639 prestate: clara.fixed_assets has no UNIQUE index on acquisition_line_id -- the birth would not be idempotent'
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from clara.fixed_assets f
   where f.acquisition_line_id is not null and f.acquisition_entry_id is null;
  if v_n <> 0 then
    raise exception '#639 prestate: % half-born register row(s) name a line but no entry', v_n
      using errcode='CLR10';
  end if;

  raise notice '#639 prestate: clean -- no acquisition column, trigger or runtime particulars door exists, the two recut reads are at their pinned 0041 texts, the FA belt is still a deferred constraint trigger that sorts after the birth, and no register row is half-born.';
end
$p639_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §A  THE PROVENANCE COLUMN. Nullable, write-once at birth, tenant-congruent.
-- =====================================================================================
alter table clara.fixed_assets add column acquisition_document_id uuid;
alter table clara.fixed_assets
  add constraint fk_fa_acquisition_document
  foreign key (acquisition_document_id) references clara.documents(id);
-- The tenant-congruent half, the shape `fk_fa_acquisition_entry_congruent` already uses: a
-- register row may only ever name a document of its OWN firm.
alter table clara.fixed_assets
  add constraint fk_fa_acquisition_document_congruent
  foreign key (acquisition_document_id, firm_id) references clara.documents(id, firm_id);
create index if not exists ix_fixed_assets_acquisition_document
  on clara.fixed_assets(acquisition_document_id) where acquisition_document_id is not null;
comment on column clara.fixed_assets.acquisition_document_id is
  '#639: the source document of the entry that acquired this asset, COPIED AT BIRTH by '
  'clara._tf_fa_acquisition_birth. Write-once: clara._tf_fixed_assets_immutable_0017 forbids any '
  'later write, so a row birthed by _fa_on_approve arm 4 carries NULL and the READ resolves the '
  'acquisition entry''s own document_id instead. The two can never disagree (0201 tail T.7).';

-- =====================================================================================
-- §B  THE LANE-AGNOSTIC BIRTH. A deferred constraint trigger, named to fire before the belt.
--
-- WHY `after insert or update` AND NOT `after update` ALONE: the belt is declared the same way,
-- because an entry may be born approved on a lane that does not draft first. The `when` clause is
-- byte-identical to the belt's, so the two triggers are queued for exactly the same events.
-- =====================================================================================
create function clara._tf_fa_acquisition_birth() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare l record; v_actor uuid; v_asset uuid;
begin
  -- ARM 4's PREDICATE, VERBATIM (0041:2603) …
  if new.is_opening_balance then return null; end if;
  if new.reversal_of is not null then return null; end if;
  if new.flags ? 'fa_disposal' then return null; end if;
  -- … PLUS THE ONE EXCLUSION ARM 4 DOES NOT CARRY. A depreciation run debits the EXPENSE account,
  -- so the cost join below misses it today; closing the site itself means a phantom birth would
  -- need BOTH guards to fail rather than either (0041:2603's own risk note).
  if new.origin = 'scheduled_run' then return null; end if;

  v_actor := coalesce(new.checker_actor, new.maker_actor);
  for l in select jl.id as line_id, jl.account_code, jl.debit_cents,
                  fp.accum_depr_account_code as accum_code,
                  fp.depr_expense_account_code as expense_code
           from clara.journal_lines jl
           join clara.fa_account_profiles fp on fp.client_id = jl.client_id
             and fp.asset_account_code = jl.account_code and fp.active
           where jl.entry_id = new.id and jl.debit_cents > 0
           order by jl.id loop
    v_asset := null;
    -- THE SAME INSERT ARM 4 MAKES, WITH THE SAME CONFLICT TARGET. On the four lanes that already
    -- birth, the hook got here first and this writes nothing; on the Work lane it writes the row
    -- the estate never had. The placeholder description is arm 4's, byte for byte, so a
    -- professional cannot tell which instrument birthed the row — and completion replaces it.
    insert into clara.fixed_assets(firm_id, client_id, description, acquired_date, cost_cents,
        residual_cents, depreciation_method, asset_account_code, accum_depr_account_code,
        depr_expense_account_code, acquisition_entry_id, acquisition_line_id,
        acquisition_document_id, accumulated_depreciation_cents, status)
      values (new.firm_id, new.client_id,
        'Fixed asset (particulars pending) - ' || l.account_code || ' RM'
          || to_char(l.debit_cents / 100.0, 'FM999999999990.00'),
        new.posting_date, l.debit_cents, 0,
        case when l.accum_code is null then 'none' end,
        l.account_code, l.accum_code, l.expense_code, new.id, l.line_id,
        new.document_id, 0, 'active')
      on conflict (acquisition_line_id) do nothing
      returning id into v_asset;
    if v_asset is not null then
      perform clara._append_event(new.firm_id, 'asset.acquired', new.client_id, v_actor,
        null, null, new.id, new.document_id, null,
        jsonb_build_object('asset_id', v_asset, 'line_id', l.line_id,
          'cost_cents', l.debit_cents, 'born_by', 'acquisition_birth_trigger'));
    end if;
  end loop;
  return null;
end $$;
revoke all on function clara._tf_fa_acquisition_birth() from public;
comment on function clara._tf_fa_acquisition_birth() is
  '#639: the LANE-AGNOSTIC fixed-asset acquisition birth. A deferred constraint trigger on '
  'clara.journal_entries, named to fire before t_je_fa_movement_belt (deferred triggers fire in '
  'alphabetical trigger-name order -- measured on clara_639, PG 17.11). Idempotent against '
  'clara._fa_on_approve arm 4 through the same on conflict (acquisition_line_id) do nothing.';

create constraint trigger t_je_fa_acquisition_birth
  after insert or update on clara.journal_entries
  deferrable initially deferred for each row when (new.status = 'approved')
  execute function clara._tf_fa_acquisition_birth();

-- =====================================================================================
-- §C  THE ACQUISITION READ. Two new ungranted projections and the two recut reads.
-- =====================================================================================

-- The ACQUISITION as its own fact: what was bought, when, on whose instruction, out of which
-- journal entry, under which Work and against which receipt. Work and receipt are DERIVED — the
-- receipt is written after the approve, so nothing could have stamped them.
create function clara._fa_acquisition_json(p_asset uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare f clara.fixed_assets%rowtype; e clara.journal_entries%rowtype;
        r record; d record; v_doc uuid;
begin
  select * into f from clara.fixed_assets where id = p_asset;
  if not found then return null; end if;
  if f.acquisition_entry_id is null then
    -- A supersede/revision successor has no acquisition entry of its own by design (0041 SS1.1);
    -- saying so is the honest answer, not an empty object that reads like a missing fact.
    return jsonb_build_object('entry_id', null, 'line_id', f.acquisition_line_id,
      'document_id', f.acquisition_document_id, 'cost_cents', f.cost_cents, 'currency', 'MYR',
      'acquired_date', f.acquired_date, 'asset_account', f.asset_account_code,
      'derived_from', 'supersede_successor');
  end if;
  select * into e from clara.journal_entries where id = f.acquisition_entry_id;
  -- THE COLUMN IS THE BIRTH-TIME COPY; THE ENTRY IS THE AUTHORITY. A row birthed by
  -- clara._fa_on_approve arm 4 carries NULL because 0017's post-approval immutability wall makes
  -- a back-fill unwritable, and that is exactly the document lane -- the rows that HAVE a
  -- document. The coalesce is what makes the read lane-independent.
  v_doc := coalesce(f.acquisition_document_id, e.document_id);
  select o.id, o.work_id, o.purpose, o.logical_op_id, o.created_at, o.on_behalf_of
    into r from clara.operation_receipts o
   where o.effects ->> 'entry_id' = f.acquisition_entry_id::text and o.outcome = 'committed'
   order by o.created_at limit 1;
  select doc.original_filename, doc.mime_type, doc.sha256, doc.document_kind
    into d from clara.documents doc where doc.id = v_doc;
  return jsonb_build_object(
    'entry_id', f.acquisition_entry_id,
    'line_id', f.acquisition_line_id,
    'document_id', v_doc,
    'document_filename', d.original_filename,
    'document_mime', d.mime_type,
    'document_sha256', d.sha256,
    'document_kind', d.document_kind,
    'posting_date', e.posting_date,
    'approved_at', e.approved_at,
    'entry_status', e.status,
    'entry_origin', e.origin,
    'memo', e.memo,
    'reversal_of', e.reversal_of,
    'reversed_by', e.reversed_by,
    'acquired_date', f.acquired_date,
    'cost_cents', f.cost_cents,
    -- MYR ONLY, AND SAID OUT LOUD. Multi-currency is the accepted PRD:127 deferral and admission
    -- already refuses anything else (0178:734-736); a silent absence would read like a gap.
    'currency', 'MYR',
    'asset_account', f.asset_account_code,
    'work_id', r.work_id,
    'receipt_id', r.id,
    'receipt_logical_op_id', r.logical_op_id,
    'receipt_created_at', r.created_at,
    'on_behalf_of', r.on_behalf_of,
    'work_status', (select aw.status from clara.accounting_work aw where aw.id = r.work_id),
    'work_purpose', (select aw.purpose from clara.accounting_work aw where aw.id = r.work_id),
    'derived_from', 'acquisition_entry');
end $$;
revoke all on function clara._fa_acquisition_json(uuid) from public;

-- THE CORRECTION CHAIN, MADE VISIBLE RATHER THAN RE-LINKED (#639 AC4).
--
-- Reversing an acquisition UNWINDS its register row (0041:2540-2588); re-booking at the corrected
-- cost births a NEW row keyed to the NEW line, and in-place cost adjustment is refused by name
-- (0041:2726-2733, `fa_cost_adjustment_deferred`). No column links the two, and this file does not
-- add one: a stored link would be a claim about intent that only a human holds.
--
-- What it projects instead is what the database actually knows, and EVERY ROW SAYS HOW IT WAS
-- DERIVED so a reader can weigh it:
--   * `supersede`        — the split/revision lineage. STRUCTURAL and exact.
--   * `co_acquired_on_same_document` — the same document (usually the SAME entry) birthed both
--     rows: one invoice, two cost lines, two register rows. Exact, and deliberately ORDERLESS —
--     neither sibling precedes or supersedes the other.
--   * `source_document`  — the same source document, booked at two DIFFERENT approvals, so the
--     order is real; the comparison is strict, never `>=`.
--   * `reversed_acquisition_on_same_enrolment` — a DERIVATION, not a link: the same client, the
--     same enrolled cost account, across a reversal boundary. It is the honest candidate set, and
--     naming it as derived is what keeps it from being read as a stored fact.
create function clara._fa_acquisition_history(p_asset uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare f clara.fixed_assets%rowtype; e clara.journal_entries%rowtype;
        v_doc uuid; v_rev_at timestamptz; v_rows jsonb;
begin
  select * into f from clara.fixed_assets where id = p_asset;
  if not found then return null; end if;
  select * into e from clara.journal_entries where id = f.acquisition_entry_id;
  v_doc := coalesce(f.acquisition_document_id, e.document_id);
  select m.approved_at into v_rev_at from clara.journal_entries m where m.id = e.reversed_by;

  select coalesce(jsonb_agg(x order by x ->> 'relation', x ->> 'acquired_date'), '[]'::jsonb)
    into v_rows
    from (
      select distinct on (g.id) jsonb_build_object(
          'asset_id', g.id, 'description', g.description, 'status', g.status,
          'cost_cents', g.cost_cents, 'acquired_date', g.acquired_date,
          'acquisition_entry_id', g.acquisition_entry_id,
          'particulars_complete', clara._fa_particulars_complete(g),
          'relation', k.relation, 'link', k.link) as x
        from clara.fixed_assets g
        join lateral (
          select ge.approved_at, ge.reversed_by,
                 coalesce(g.acquisition_document_id, ge.document_id) as doc,
                 (select rm.approved_at from clara.journal_entries rm where rm.id = ge.reversed_by)
                   as rev_at
            from clara.journal_entries ge where ge.id = g.acquisition_entry_id) ge on true
        join lateral (values
            -- CO-ACQUIRED, NOT SUPERSEDING. One cost line births one register row BY DESIGN
            -- (0041 SS9.4, :2591-2593), so a two-line invoice — a machine and its freight — is
            -- ORDINARY. Round-1 review measured what the first cut said about such a pair: both
            -- rows shared the acquisition entry, therefore the document, therefore this arm, and
            -- because they also shared `approved_at` the `>=` below resolved to 'successor' in
            -- BOTH directions — each sibling told a professional the other had superseded it.
            -- Siblings get their OWN word instead, and it makes no claim about order.
            ('co_acquired_on_same_document', 'co_acquired',
             (v_doc is not null and ge.doc = v_doc
              and (g.acquisition_entry_id = e.id or ge.approved_at = e.approved_at))),
            -- one source document, two DIFFERENT approvals: now the order is real, and it is
            -- STRICT — an equal timestamp can never resolve to 'successor' on both sides again.
            ('source_document',
             case when ge.approved_at > e.approved_at then 'successor' else 'predecessor' end,
             (v_doc is not null and ge.doc = v_doc
              and g.acquisition_entry_id <> e.id and ge.approved_at <> e.approved_at)),
            -- this row's acquisition was reversed, and g was booked after that reversal
            ('reversed_acquisition_on_same_enrolment', 'successor',
             (v_rev_at is not null and ge.approved_at >= v_rev_at)),
            -- …or g's own acquisition was reversed before this row was booked
            ('reversed_acquisition_on_same_enrolment', 'predecessor',
             (ge.rev_at is not null and ge.rev_at <= e.approved_at))
          ) as k(link, relation, hit) on k.hit
       where g.client_id = f.client_id and g.firm_id = f.firm_id and g.id <> f.id
         and g.asset_account_code = f.asset_account_code
         and g.acquisition_entry_id is not null
       order by g.id, k.link
       limit 40) s;

  return jsonb_build_object(
    'status', f.status,
    'acquisition_entry_id', f.acquisition_entry_id,
    'acquisition_reversed_by', e.reversed_by,
    'acquisition_reversed_at', v_rev_at,
    'acquisition_reverses', e.reversal_of,
    'supersedes_asset_id', f.supersedes_asset_id,
    'superseded_by_asset_id', f.superseded_by_asset_id,
    'superseded_at', f.superseded_at,
    'disposed_at', f.disposed_at,
    'disposal_entry_id', f.disposal_entry_id,
    'related', v_rows,
    -- SAID PLAINLY RATHER THAN IMPLIED: when the acquisition was reversed and nothing was
    -- re-booked, the chain is genuinely open and the surface must say so instead of showing an
    -- empty list that reads like "nothing happened".
    'chain_open', (e.reversed_by is not null
                   and not exists (select 1 from jsonb_array_elements(v_rows) y
                                    where y ->> 'relation' = 'successor')));
end $$;
revoke all on function clara._fa_acquisition_history(uuid) from public;

-- clara._fa_asset_json — RECUT. THE LIVE PRE-IMAGE, CARRIED THROUGH VERBATIM, with ONE
-- derivation and THREE keys added and NOTHING removed.
--
-- THE PRE-IMAGE IS NOT 0041's TEXT, AND THAT IS A MEASUREMENT RATHER THAN A STYLE NOTE. A first
-- cut of this file rebuilt the body from `0041:4074-4103` and SILENTLY DROPPED two later splices:
-- 0042's S5.4 added the WDB-G14 split-month changeover advisory (`_fa_split_month_advisory`) and
-- the WDB-G10 second-disposal freeze (`_fa_disposal_draft_outstanding` plus the outstanding draft
-- id). Both live in `pg_proc` and in NEITHER creating file's copy of the function; 0042's own tail
-- asserted them at 0042-apply time and cannot re-check them here. The body below is the LIVE
-- `prosrc` at sha `477c4428…` — the exact text the prestate pins — with #639's additions marked.
-- §F (T.8) asserts all four 0042 markers survived, so this cannot happen again unnoticed.
create or replace function clara._fa_asset_json(p_asset uuid, p_as_of date) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare f clara.fixed_assets%rowtype; v_acc bigint; v_unch jsonb; v_split jsonb;
  v_dfreeze boolean; v_ddraft uuid; v_doc uuid;
begin
  select * into f from clara.fixed_assets where id = p_asset;
  if not found then return null; end if;
  v_acc := case when f.baseline_as_of is null or p_as_of >= f.baseline_as_of
                then clara._fa_accumulated(p_asset, p_as_of) end;
  -- ONE call, BOTH projections [round-3 fold F3]: the WD-R6 advisory's MONTHS ride the row
  -- itself, not only its count, so the professional reading /assets sees WHICH months a row
  -- owes -- including a SUPERSEDED predecessor's, which is the exact shape that used to go
  -- silently unpaid. Computing it once keeps list_fixed_assets at one arithmetic pass per row.
  v_unch := clara._fa_uncharged_months(p_asset, clara._fa_month_end(clara._fa_today()));
  -- 0042 (Wave D-b, design SS6.4; WDB-G14): THE MID-MONTH CHANGEOVER ADVISORY. DERIVED here
  -- and never stored -- the ruling pins the arithmetic exactly as it is and adds VISIBILITY,
  -- which is the condition the ruling itself carries: a professional reading this row must be
  -- able to see that a changeover month went wholly to the predecessor, and be told to raise
  -- an adjusting entry if that difference could be material.
  v_split := clara._fa_split_month_advisory(p_asset);
  -- [CROSS-SECTION EDIT -- round-5 fix lane (DB<->surface seam). Reported, not silent.]
  -- 0042 (Wave D-b, design SS6.1; WDB-G10): THE SECOND-DISPOSAL FREEZE, PROJECTED.
  -- S5.6 makes clara.dispose_fixed_asset refuse a second draft while one is outstanding.
  -- NOTHING carried that state to a reader, so /assets kept offering a dispose form whose
  -- only possible outcome on such a row was the CLR39 refusal -- and the ONE remedy the
  -- refusal names (approve or withdraw the outstanding draft) had no door on the screen the
  -- professional was looking at. A guard the surface cannot see is a guard that reads as a
  -- broken form.
  --   * THE VERDICT IS THE GUARD'S OWN FUNCTION, not a second copy of its predicate: the
  --     surface and the refusal cannot drift apart, because they ask the same body the same
  --     question with the same 'infinity' horizon.
  --   * THE ID IS A CONVENIENCE, and is allowed to be null (a lineage the predicate admits
  --     but this ordered pick cannot name). The reader is keyed on the VERDICT, so the panel
  --     still renders and still says where to go; only the inline withdraw affordance needs
  --     the id.
  -- Both ride ix_journal_entries_fa_disposal_draft (0041:785, client-keyed partial).
  v_dfreeze := clara._fa_disposal_draft_outstanding(f.client_id, p_asset, 'infinity'::date);
  v_ddraft := null;
  if v_dfreeze then
    select je.id into v_ddraft from clara.journal_entries je
      where je.client_id = f.client_id and je.status = 'draft' and je.flags ? 'fa_disposal'
        and (je.flags -> 'fa_disposal' ->> 'asset_id')::uuid = p_asset
        and (je.flags -> 'fa_disposal' ->> 'disposal_date')::date <= 'infinity'::date
      order by (je.flags -> 'fa_disposal' ->> 'disposal_date')::date, je.id
      limit 1;
  end if;
  -- 0201 (#639): THE ACQUISITION'S SOURCE DOCUMENT. The column is the BIRTH-TIME COPY written
  -- by clara._tf_fa_acquisition_birth; the acquisition ENTRY is the authority, because a row
  -- birthed by clara._fa_on_approve arm 4 can never be back-filled (0017's post-approval
  -- immutability allowlist) and that is exactly the document lane. One index lookup on a FK.
  select coalesce(f.acquisition_document_id, e.document_id) into v_doc
    from clara.journal_entries e where e.id = f.acquisition_entry_id;
  return jsonb_build_object(
    'id', f.id, 'description', f.description, 'status', f.status,
    'particulars_complete', clara._fa_particulars_complete(f),
    'acquired_date', f.acquired_date, 'effective_from', f.effective_from,
    'superseded_at', f.superseded_at, 'cost_cents', f.cost_cents,
    'residual_cents', f.residual_cents, 'accumulated_cents', v_acc,
    'nbv_cents', case when v_acc is null then null else f.cost_cents - v_acc end,
    'method', f.depreciation_method, 'rate_bps', f.depreciation_rate_bps,
    'useful_life_months', f.useful_life_months, 'start_date', f.depreciation_start_date,
    'asset_account', f.asset_account_code, 'accum_account', f.accum_depr_account_code,
    'expense_account', f.depr_expense_account_code, 'ca_class', f.ca_class,
    'is_commercial_vehicle', f.is_commercial_vehicle, 'is_new', f.is_new,
    'superseded_by_asset_id', f.superseded_by_asset_id, 'disposed_at', f.disposed_at,
    'disposal_entry_id', f.disposal_entry_id,
    'uncharged_due', v_unch,
    'uncharged_due_count', jsonb_array_length(v_unch),
    'split_month_advisory', v_split,
    'split_month_advisory_count', jsonb_array_length(v_split),
    -- [CROSS-SECTION EDIT -- round-5 fix lane. Reported, not silent.] WDB-G10's UI face.
    'disposal_draft_outstanding', v_dfreeze,
    'disposal_draft_entry_id', v_ddraft,
    -- 0201 (#639): THE ACQUISITION, on every row shape the register renders, so the list can
    -- link to the journal entry and the source document without a second read per row.
    'acquisition_entry_id', f.acquisition_entry_id,
    'acquisition_line_id', f.acquisition_line_id,
    'acquisition_document_id', v_doc);
end $$;

-- clara.get_fixed_asset — RECUT. The LIVE pre-image (sha `e6cd2aad…`, which for THIS body is
-- byte-identical to 0041's own text — measured, not assumed), carried through verbatim. `asset`,
-- `lineage`, `charges`, `schedule` and `uncharged_due` keep their exact shapes; THREE blocks are
-- added: `acquisition`, `particulars` and `history`.
create or replace function clara.get_fixed_asset(p_asset uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare
  c record; f clara.fixed_assets%rowtype; v_as_of date; v_lineage jsonb := '[]'::jsonb; v_cur uuid;
  v_charges jsonb; v_sched jsonb; v_horizon date; v_calc jsonb; v_hops int := 0;
begin
  c := clara._human_ctx(clara.role_rank('viewer'));
  select * into f from clara.fixed_assets where id = p_asset and firm_id = c.firm;
  if not found then
    raise exception 'fixed asset is not in your firm' using errcode = 'CLR11';
  end if;
  v_as_of := clara._fa_today();
  -- LINEAGE IS WALKED UPWARD (design SS1.1's split-lineage law): the disposed portion of a
  -- split is reachable only from itself upward, so every read traverses supersedes_asset_id.
  v_cur := f.supersedes_asset_id;
  while v_cur is not null and v_hops < 64 loop
    v_lineage := v_lineage || jsonb_build_array(clara._fa_asset_json(v_cur, v_as_of));
    select supersedes_asset_id into v_cur from clara.fixed_assets where id = v_cur;
    v_hops := v_hops + 1;
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'period_start', d.period_start,
      'period_end', d.period_end, 'amount_cents', d.amount_cents,
      'effective_date', d.effective_date, 'entry_id', d.entry_id, 'run_id', d.run_id,
      'unwind_of', d.unwind_of) order by d.effective_date, d.period_start, d.id), '[]'::jsonb)
    into v_charges from clara.fa_depreciation d where d.asset_id = p_asset;
  -- THE SCHEDULE IS DB-PROJECTED (design SS6), from the SAME arithmetic that posts. The
  -- horizon is the later of the asset's life end and ten years out, so a carried asset whose
  -- date clock is already exhausted still projects its remaining money-clock months.
  v_sched := '[]'::jsonb;
  if f.status = 'active' and clara._fa_particulars_complete(f)
     and f.depreciation_method in ('straight_line', 'reducing_balance') then
    v_horizon := clara._fa_month_end(greatest(
      (clara._fa_month_start(f.depreciation_start_date)
        + make_interval(months => coalesce(f.useful_life_months, 0)))::date,
      (clara._fa_month_start(v_as_of) + interval '120 months')::date));
    v_calc := clara._fa_asset_charges(p_asset, v_horizon, false);
    select coalesce(jsonb_agg(jsonb_build_object(
        'period_start', (x ->> 'month')::date,
        'period_end', clara._fa_month_end((x ->> 'month')::date),
        'projected_cents', (x ->> 'amount_cents')::bigint)
        order by (x ->> 'month')::date), '[]'::jsonb)
      into v_sched from jsonb_array_elements(v_calc -> 'months') x;
  end if;
  return jsonb_build_object('asset', clara._fa_asset_json(p_asset, v_as_of),
    'lineage', v_lineage, 'charges', v_charges, 'schedule', v_sched,
    'uncharged_due', clara._fa_uncharged_months(p_asset, clara._fa_month_end(v_as_of)),
    -- 0201 (#639): THE ACQUISITION IS COMPLETE EVEN WHILE THE PARTICULARS ARE NOT, so they are
    -- two blocks rather than two halves of one. "Policy/schedule clearly separate" (AC8) becomes
    -- structural here, not a layout choice the surface could quietly undo.
    'acquisition', clara._fa_acquisition_json(p_asset),
    'particulars', jsonb_build_object(
      'complete', clara._fa_particulars_complete(f),
      'method', f.depreciation_method,
      'useful_life_months', f.useful_life_months,
      'rate_bps', f.depreciation_rate_bps,
      'residual_cents', f.residual_cents,
      'start_date', f.depreciation_start_date,
      'description', f.description,
      'ca_class', f.ca_class,
      'is_commercial_vehicle', f.is_commercial_vehicle,
      'is_new', f.is_new,
      -- A land enrolment admits `none` ALONE, and the form must know that BEFORE it offers a
      -- method rather than after the door refuses one (0041:3080-3083, axis `non_depreciable`).
      'non_depreciable', (f.accum_depr_account_code is null)),
    'history', clara._fa_acquisition_history(p_asset));
end $$;
-- =====================================================================================
-- §D  THE PARTICULARS, APPLIED ON BEHALF OF THE INITIATOR.
-- =====================================================================================

-- The shared core. `clara.complete_fixed_asset_particulars` (0041:3035) is NOT recut here —
-- DECISIONS §1.3 gives #639 two bodies and that is not one of them — so this core is written to
-- be BYTE-EQUIVALENT to its arms, and the tail asserts that both doors still reach the same
-- validator and the same two extra walls.
create function clara._fa_complete_particulars_core(p_firm uuid, p_actor uuid, p_client uuid,
    p_asset uuid, p_particulars jsonb, p_op_key text, p_door text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_dedupe jsonb; v_firm uuid; fa clara.fixed_assets%rowtype; v_p jsonb; v_res bigint;
begin
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10',
      detail = '{"reason":"invalid_op_key"}';
  end if;
  v_dedupe := clara._reserve_op(p_firm, p_door, p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'asset', p_asset,
      'particulars', p_particulars)));
  if v_dedupe is not null then return v_dedupe; end if;
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  if v_firm is null or v_firm <> p_firm then
    raise exception 'client is not in your firm' using errcode = 'CLR11',
      detail = '{"reason":"client_not_found"}';
  end if;
  perform pg_advisory_xact_lock(203005004, hashtext(p_client::text));
  select * into fa from clara.fixed_assets where id = p_asset and client_id = p_client for update;
  if not found then
    raise exception 'fixed asset is not in this client' using errcode = 'CLR11',
      detail = '{"reason":"asset_not_found"}';
  end if;
  if clara._fa_particulars_complete(fa) then
    raise exception 'this asset''s particulars are already complete; use revise_fixed_asset_particulars for a prospective change'
      using errcode = 'CLR37',
        detail = jsonb_build_object('reason', 'fa_particulars_already_complete',
          'asset_id', p_asset)::text;
  end if;
  if fa.status not in ('pending', 'active') then
    raise exception 'only a pending or active register row can be completed'
      using errcode = 'CLR37',
        detail = jsonb_build_object('reason', 'fa_particulars_invalid', 'axis', 'lifecycle',
          'asset_id', p_asset, 'status', fa.status)::text;
  end if;
  v_p := clara._fa_validate_particulars(p_particulars);
  if fa.accum_depr_account_code is null and (v_p ->> 'method') <> 'none' then
    raise exception 'this asset sits on a non-depreciable enrolment (no accumulated-depreciation account); its method must be none'
      using errcode = 'CLR37', detail = '{"reason":"fa_particulars_invalid","axis":"non_depreciable"}';
  end if;
  v_res := coalesce((v_p ->> 'residual_cents')::bigint, 0);
  if (v_p ->> 'method') <> 'none' and v_res > fa.cost_cents then
    raise exception 'a residual value cannot exceed cost'
      using errcode = 'CLR37', detail = '{"reason":"fa_particulars_invalid","axis":"residual"}';
  end if;
  -- NO JOURNAL IS WRITTEN HERE, AND THAT IS THE WHOLE TICKET. The acquisition posted when it
  -- posted; the depreciation particulars are a register fact that arrives later.
  update clara.fixed_assets set
    depreciation_method = v_p ->> 'method',
    useful_life_months = nullif(v_p ->> 'useful_life_months', '')::int,
    depreciation_rate_bps = nullif(v_p ->> 'rate_bps', '')::int,
    residual_cents = case when (v_p ->> 'method') = 'none' then coalesce(fa.residual_cents, 0)
                          else v_res end,
    depreciation_start_date = (v_p ->> 'start_date')::date,
    description = coalesce(nullif(v_p ->> 'description', ''), fa.description),
    ca_class = coalesce(nullif(v_p ->> 'ca_class', ''), fa.ca_class),
    is_commercial_vehicle = coalesce(nullif(v_p ->> 'is_commercial_vehicle', '')::boolean,
                                     fa.is_commercial_vehicle),
    is_new = coalesce(nullif(v_p ->> 'is_new', '')::boolean, fa.is_new),
    updated_at = now()
    where id = p_asset;
  perform clara._audit(p_firm, p_actor, null, null, p_door, null,
    jsonb_build_object('client', p_client, 'asset', p_asset, 'particulars', v_p,
      'op_key', p_op_key));
  return clara._finish_op(p_firm, p_door, p_op_key,
    jsonb_build_object('asset_id', p_asset, 'client_id', p_client, 'particulars_complete', true));
end $$;
revoke all on function clara._fa_complete_particulars_core(uuid,uuid,uuid,uuid,jsonb,text,text) from public;

-- clara.complete_fixed_asset_particulars_for — THE RUNTIME DOOR. `clara_runtime` ONLY.
--
-- THE AUTHORITY IS RE-READ LIVE, never trusted from admission. A Work parks on its dependent
-- question and may be answered hours later; the human who asked may by then have been demoted,
-- deactivated, or had the client archived. Each of the three reads has its OWN diagnosis, in the
-- order 0195's commit-time arms use, so a surface can tell the three apart.
create function clara.complete_fixed_asset_particulars_for(p_client uuid, p_asset uuid,
    p_particulars jsonb, p_op_key text, p_obo uuid) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_firm uuid; v_role text; v_status text; v_client_status text;
begin
  if p_obo is null then
    raise exception 'the human this operation acts for is required' using errcode = 'CLR04',
      detail = '{"reason":"obo_not_active"}';
  end if;
  select cl.firm_id, cl.status into v_firm, v_client_status
    from clara.clients cl where cl.id = p_client;
  if v_firm is null then
    -- MEASURED, NOT CLAIMED (round-1 review). An earlier draft of this comment said "NO ORACLE: an
    -- unknown client and another firm's client answer the same way". They do not: the lookup runs
    -- as a SECURITY DEFINER owned by clara_fn_owner, so a FOREIGN firm's real client resolves a
    -- firm here and falls through to the membership arm below (CLR04 `obo_not_active`), while an
    -- unknown uuid stops here (CLR11 `client_not_found`). That difference is deliberate and is the
    -- reason this door exists at all: it is granted to `clara_runtime` ONLY (§E), it names an
    -- explicit `p_obo`, and 0195's commit-time ladder gives each of the three failures its own
    -- diagnosis so a surface can tell "the client is gone" from "the human who asked is gone" from
    -- "they are no longer allowed". The estate's no-existence-oracle discipline
    -- (`packages/db/tests/rig-helpers.mjs:64`) is about HUMAN doors reachable from a browser;
    -- `clara.complete_fixed_asset_particulars` (0041:3035) is that door and keeps CLR11 for both.
    raise exception 'client not found' using errcode = 'CLR11',
      detail = '{"reason":"client_not_found"}';
  end if;
  -- THE LIVE READ IS TAKEN UNDER A LOCK, not merely re-read (round-1 review, note 639-A6).
  -- `clara.set_member_role` (0157) takes `clara.firms … for update` and THEN updates the
  -- membership, so 0195:1792-1797 records the measured pair a door needs to queue behind it: the
  -- firm row `for key share` first (weakest mode, same lock ORDER as the posting core, so no new
  -- 40P01 edge), then the membership `for share`. Without them a demotion committing between this
  -- read and the register UPDATE would slip past an authority check whose whole purpose is to be
  -- current.
  perform 1 from clara.firms f where f.id = v_firm for key share;
  select m.role, m.status into v_role, v_status from clara.firm_memberships m
   where m.user_id = p_obo and m.firm_id = v_firm
   order by (m.status = 'active') desc, m.created_at desc limit 1
     for share;
  if v_role is null or v_status <> 'active' then
    raise exception 'the initiating member is no longer active in this firm' using errcode = 'CLR04',
      detail = jsonb_build_object('reason', 'obo_not_active', 'obo', p_obo)::text;
  end if;
  if clara.role_rank(v_role) < clara.role_rank('bookkeeper') then
    raise exception 'the initiating member no longer holds the bookkeeper floor'
      using errcode = 'CLR04',
        detail = jsonb_build_object('reason', 'insufficient_role', 'obo', p_obo)::text;
  end if;
  if v_client_status is distinct from 'active' then
    raise exception 'client is not active' using errcode = 'CLR10',
      detail = '{"reason":"client_inactive"}';
  end if;
  return clara._fa_complete_particulars_core(v_firm, p_obo, p_client, p_asset, p_particulars,
    p_op_key, 'complete_fixed_asset_particulars_for');
end $$;
revoke all on function clara.complete_fixed_asset_particulars_for(uuid,uuid,jsonb,text,uuid) from public;
comment on function clara.complete_fixed_asset_particulars_for(uuid,uuid,jsonb,text,uuid) is
  '#639: complete a fixed asset''s depreciation particulars ON BEHALF OF the human whose Work '
  'asked the dependent question. clara_runtime ONLY -- the browser uses '
  'clara.complete_fixed_asset_particulars. Live-authority rechecks (active membership, '
  'bookkeeper floor, active client), complete-once, op-keyed, and it writes NO journal entry.';

-- =====================================================================================
-- §E  GRANTS. The recut reads keep 0041's loop (create or replace preserves an ACL, but the loop
-- is re-run so the grant matrix is a FACT of this file rather than an inheritance); the new
-- runtime door goes to clara_runtime and to nobody else.
-- =====================================================================================
do $p639_acl$ declare f text; begin
  foreach f in array array[
      'clara.get_fixed_asset(uuid)', 'clara.list_fixed_assets(uuid)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to clara_authenticated', f);
    execute format('alter function %s owner to clara_fn_owner', f);
  end loop;
  execute 'revoke all on function clara.complete_fixed_asset_particulars_for(uuid,uuid,jsonb,text,uuid) from public';
  execute 'grant execute on function clara.complete_fixed_asset_particulars_for(uuid,uuid,jsonb,text,uuid) to clara_runtime';
  execute 'alter function clara.complete_fixed_asset_particulars_for(uuid,uuid,jsonb,text,uuid) owner to clara_fn_owner';
  for f in select unnest(array[
      'clara._tf_fa_acquisition_birth()', 'clara._fa_acquisition_json(uuid)',
      'clara._fa_acquisition_history(uuid)',
      'clara._fa_complete_particulars_core(uuid,uuid,uuid,uuid,jsonb,text,text)']) loop
    execute format('revoke all on function %s from public', f);
    execute format('alter function %s owner to clara_fn_owner', f);
  end loop;
end $p639_acl$;

reset role;

-- =====================================================================================
-- §F  TAIL CENSUS. Every claim this file made, re-READ from the committed catalog.
-- =====================================================================================
do $p639_tail$
declare v_n int; v_src text; v_names text[]; v_birth text; v_belt text;
begin
  -- (T.1) THE COLUMN, its two foreign keys and its index.
  select count(*)::int into v_n from information_schema.columns
   where table_schema='clara' and table_name='fixed_assets'
     and column_name='acquisition_document_id' and data_type='uuid' and is_nullable='YES';
  if v_n <> 1 then
    raise exception '#639 tail: clara.fixed_assets.acquisition_document_id is not a nullable uuid column'
      using errcode='CLR10';
  end if;
  for v_src in select unnest(array['fk_fa_acquisition_document','fk_fa_acquisition_document_congruent']) loop
    if not exists (select 1 from pg_constraint
                    where conrelid='clara.fixed_assets'::regclass and conname=v_src and contype='f') then
      raise exception '#639 tail: foreign key % is absent', v_src using errcode='CLR10';
    end if;
  end loop;

  -- (T.2) THE BIRTH TRIGGER IS A DEFERRED CONSTRAINT TRIGGER, ON THE SAME EVENTS AND THE SAME
  -- `when` CLAUSE AS THE BELT, AND ITS NAME SORTS FIRST. All four are what make "the register row
  -- exists before the belt looks for it" true; any one of them alone does not.
  select t.tgname into v_birth from pg_trigger t
   where t.tgrelid='clara.journal_entries'::regclass and t.tgname='t_je_fa_acquisition_birth'
     and t.tgdeferrable and t.tginitdeferred and t.tgconstraint <> 0;
  if v_birth is null then
    raise exception '#639 tail: t_je_fa_acquisition_birth is not a DEFERRED constraint trigger'
      using errcode='CLR10';
  end if;
  select t.tgname into v_belt from pg_trigger t
   where t.tgrelid='clara.journal_entries'::regclass and t.tgname='t_je_fa_movement_belt'
     and t.tgdeferrable and t.tginitdeferred and t.tgconstraint <> 0;
  if v_belt is null then
    raise exception '#639 tail: the FA movement belt is no longer a DEFERRED constraint trigger'
      using errcode='CLR10';
  end if;
  if not (v_birth < v_belt) then
    raise exception '#639 tail: % does not sort before % -- deferred triggers fire in name order', v_birth, v_belt
      using errcode='CLR10';
  end if;
  select pg_get_triggerdef(t.oid) into v_src from pg_trigger t
   where t.tgrelid='clara.journal_entries'::regclass and t.tgname='t_je_fa_acquisition_birth';
  if position('AFTER INSERT OR UPDATE' in upper(v_src)) = 0
     or position('NEW.STATUS = ''APPROVED''' in upper(v_src)) = 0 then
    raise exception '#639 tail: the birth trigger is not gated on the belt''s own events/WHEN (%)', v_src
      using errcode='CLR10';
  end if;

  -- (T.3) THE FOUR EXCLUSIONS ARE IN THE BODY, and the trigger is a definer owned by the fn owner
  -- (a trigger that ran as the caller would see a partial world under FORCE RLS).
  select p.prosrc into v_src from pg_proc p where p.oid='clara._tf_fa_acquisition_birth()'::regprocedure;
  foreach v_birth in array array['is_opening_balance','reversal_of','fa_disposal','scheduled_run',
                                 'on conflict (acquisition_line_id) do nothing'] loop
    if position(v_birth in v_src) = 0 then
      raise exception '#639 tail: the birth trigger body lost the % guard', v_birth using errcode='CLR10';
    end if;
  end loop;
  if not exists (select 1 from pg_proc p
                  where p.oid='clara._tf_fa_acquisition_birth()'::regprocedure
                    and p.prosecdef and pg_get_userbyid(p.proowner)='clara_fn_owner') then
    raise exception '#639 tail: the birth trigger is not a SECURITY DEFINER owned by clara_fn_owner'
      using errcode='CLR10';
  end if;

  -- (T.4) 0042:171-179's SINGLE-MARKER CHECK, RE-ASSERTED. The hook is still spliced into
  -- clara._subledger_on_approve exactly once: this file adds a SECOND instrument, never a second
  -- call site.
  select p.prosrc into v_src from pg_proc p where p.oid='clara._subledger_on_approve(uuid)'::regprocedure;
  v_n := (length(v_src) - length(replace(v_src, 'clara._fa_on_approve(p_entry)', '')))
         / length('clara._fa_on_approve(p_entry)');
  if v_n <> 1 then
    raise exception '#639 tail: the FA hook call appears % time(s) in _subledger_on_approve, expected 1', v_n
      using errcode='CLR10';
  end if;

  -- (T.5) THE SUBLEDGER-HOOK CALLER CENSUS, RE-DERIVED FROM THE CATALOG AND RE-PINNED AT ITS
  -- MEASURED SIZE (DECISIONS §1.4: if a pinned caller census has moved, re-derive and re-assert it
  -- in the same migration's tail).
  --
  -- 0037:3840-3845 pinned FOUR — `_approve_entry_core`, `_approve_opening_entry`,
  -- `approve_wrong_client_correction`, `reverse_entry`. MEASURED on clara_639 at 0200 the live set
  -- is SIX: 0056's close model added `finalize_close` (the closing-transfer entry it approves) and
  -- `reopen_fiscal_year` (the mirror it approves when a year is reopened). Both call the hook with
  -- their own entry, both are genuine approve paths, and neither was known to 0037. The pinned
  -- four is therefore STALE IN THE CATALOG by two — stated here rather than left for the next
  -- reader to trip over, and re-pinned so a SEVENTH caller is caught.
  --
  -- The new birth trigger is NOT one of them: it births directly, which is the whole point.
  select array_agg(p.proname order by p.proname) into v_names
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='clara' and position('clara._subledger_on_approve(' in p.prosrc) > 0
     and p.proname <> '_subledger_on_approve';
  if v_names is distinct from array['_approve_entry_core','_approve_opening_entry',
                                    'approve_wrong_client_correction','finalize_close',
                                    'reopen_fiscal_year','reverse_entry'] then
    raise exception '#639 tail: the subledger hook caller set is % -- 0201 re-pinned the measured six (0037:3840-3845 pinned four; 0056 added two)', v_names
      using errcode='CLR10';
  end if;
  if position('clara._subledger_on_approve(' in
       (select p.prosrc from pg_proc p where p.oid='clara._tf_fa_acquisition_birth()'::regprocedure)) <> 0 then
    raise exception '#639 tail: the birth trigger calls the subledger hook -- it must birth directly'
      using errcode='CLR10';
  end if;

  -- (T.6) THE BELT'S FIVE DOORS ARE UNTOUCHED. This file must not have changed the belt at all;
  -- 0056:3018-3032's six literals are only re-asserted if it did, and it did not.
  select p.prosrc into v_src from pg_proc p where p.oid='clara._tf_fa_movement_belt()'::regprocedure;
  foreach v_birth in array array['f.acquisition_line_id = r.line_id', 'fa_disposal',
                                 'depreciation_charges', 'new.reversal_of is not null',
                                 'is_opening_balance', 'fa_belt_unregistered_movement',
                                 'fa_cost_adjustment_deferred', 'fa_k_gl_balance_on_enrolled'] loop
    if position(v_birth in v_src) = 0 then
      raise exception '#639 tail: the FA belt lost its % door', v_birth using errcode='CLR10';
    end if;
  end loop;

  -- (T.7) THE PROVENANCE COPY CAN NEVER DISAGREE WITH ITS AUTHORITY. Read over the WHOLE estate,
  -- not over this file's own assumptions.
  select count(*)::int into v_n from clara.fixed_assets f
    join clara.journal_entries e on e.id = f.acquisition_entry_id
   where f.acquisition_document_id is not null
     and f.acquisition_document_id is distinct from e.document_id;
  if v_n <> 0 then
    raise exception '#639 tail: % register row(s) name a document their acquisition entry does not', v_n
      using errcode='CLR10';
  end if;

  -- (T.8) THE TWO RECUT READS STILL CARRY EVERY KEY THEY CARRIED, and now carry the new ones. Read
  -- from the LIVE bodies: a recut that dropped `uncharged_due` would break the register's own
  -- advisory and nothing else in this file would notice.
  select p.prosrc into v_src from pg_proc p where p.oid='clara._fa_asset_json(uuid,date)'::regprocedure;
  -- THE 0042 SPLICES ARE IN THIS LIST ON PURPOSE. A recut rebuilt from 0041's text drops them
  -- silently — measured, because the first cut of this very file did exactly that.
  foreach v_birth in array array['particulars_complete','uncharged_due','nbv_cents','accumulated_cents',
                                 'clara._fa_split_month_advisory(p_asset)','split_month_advisory_count',
                                 'clara._fa_disposal_draft_outstanding(','disposal_draft_outstanding',
                                 'disposal_draft_entry_id',
                                 'acquisition_entry_id','acquisition_line_id','acquisition_document_id'] loop
    if position(v_birth in v_src) = 0 then
      raise exception '#639 tail: the recut _fa_asset_json lost/lacks the % key', v_birth using errcode='CLR10';
    end if;
  end loop;
  select p.prosrc into v_src from pg_proc p where p.oid='clara.get_fixed_asset(uuid)'::regprocedure;
  foreach v_birth in array array['''lineage''','''charges''','''schedule''','''uncharged_due''',
                                 '''acquisition''','''particulars''','''history''',
                                 'clara._human_ctx(clara.role_rank(''viewer''))'] loop
    if position(v_birth in v_src) = 0 then
      raise exception '#639 tail: the recut get_fixed_asset lost/lacks %', v_birth using errcode='CLR10';
    end if;
  end loop;

  -- (T.9) BOTH PARTICULARS DOORS REACH THE SAME VALIDATOR AND THE SAME TWO EXTRA WALLS. 0041's
  -- door is NOT recut here, so this is the instrument that keeps the pair from drifting.
  for v_birth in select unnest(array['clara.complete_fixed_asset_particulars(uuid,uuid,jsonb,text)',
                                     'clara._fa_complete_particulars_core(uuid,uuid,uuid,uuid,jsonb,text,text)']) loop
    select p.prosrc into v_src from pg_proc p where p.oid = v_birth::regprocedure;
    foreach v_belt in array array['clara._fa_validate_particulars','clara._fa_particulars_complete',
                                  'fa_particulars_already_complete','non_depreciable',
                                  'a residual value cannot exceed cost'] loop
      if position(v_belt in v_src) = 0 then
        raise exception '#639 tail: % does not carry the % wall', v_birth, v_belt using errcode='CLR10';
      end if;
    end loop;
    if position('journal_entries' in v_src) <> 0 then
      raise exception '#639 tail: % touches clara.journal_entries -- answering particulars writes NO journal', v_birth
        using errcode='CLR10';
    end if;
  end loop;

  -- (T.9b) THE RUNTIME DOOR'S LIVE READ IS TAKEN UNDER A LOCK, not merely re-read. `for key share`
  -- on clara.firms then `for share` on the membership is the pair 0195:1792-1797 measured against
  -- `clara.set_member_role`'s own `for update`; without them a demotion committing between the
  -- role read and the register UPDATE would slip past the authority check this door exists for.
  -- Pinned as text because the lock is invisible in the catalog.
  select p.prosrc into v_src from pg_proc p
   where p.oid='clara.complete_fixed_asset_particulars_for(uuid,uuid,jsonb,text,uuid)'::regprocedure;
  -- The EXECUTABLE forms, not the words: `prosrc` carries this function's comments too, and a pin
  -- that a comment alone could satisfy is not a pin.
  if position('clara.firms f where f.id = v_firm for key share;' in v_src) = 0
     or position('for share;' in v_src) = 0 then
    raise exception '#639 tail: the runtime particulars door no longer takes the firm key-share + membership share pair'
      using errcode='CLR10';
  end if;

  -- (T.10) THE GRANT MATRIX, grantee by grantee. The runtime door is runtime-only; the two recut
  -- reads are clara_authenticated-only; the four internals are granted to nobody.
  if not has_function_privilege('clara_runtime',
       'clara.complete_fixed_asset_particulars_for(uuid,uuid,jsonb,text,uuid)', 'execute') then
    raise exception '#639 tail: clara_runtime cannot execute the particulars overload' using errcode='CLR10';
  end if;
  foreach v_birth in array array['clara_authenticated','clara_agent_ro','clara_wake_interactive',
                                 'clara_wake_proactive'] loop
    if has_function_privilege(v_birth,
         'clara.complete_fixed_asset_particulars_for(uuid,uuid,jsonb,text,uuid)', 'execute') then
      raise exception '#639 tail: % may execute the runtime-only particulars overload', v_birth
        using errcode='CLR10';
    end if;
  end loop;
  foreach v_birth in array array['clara.get_fixed_asset(uuid)','clara.list_fixed_assets(uuid)'] loop
    if not has_function_privilege('clara_authenticated', v_birth, 'execute') then
      raise exception '#639 tail: clara_authenticated lost execute on %', v_birth using errcode='CLR10';
    end if;
    if has_function_privilege('clara_runtime', v_birth, 'execute') then
      raise exception '#639 tail: clara_runtime gained execute on the human read %', v_birth
        using errcode='CLR10';
    end if;
  end loop;
  foreach v_birth in array array['clara._tf_fa_acquisition_birth()','clara._fa_acquisition_json(uuid)',
                                 'clara._fa_acquisition_history(uuid)',
                                 'clara._fa_complete_particulars_core(uuid,uuid,uuid,uuid,jsonb,text,text)'] loop
    foreach v_belt in array array['clara_authenticated','clara_runtime','clara_agent_ro',
                                  'clara_wake_interactive','clara_wake_proactive','public'] loop
      if has_function_privilege(v_belt, v_birth, 'execute') then
        raise exception '#639 tail: % may execute the internal %', v_belt, v_birth using errcode='CLR10';
      end if;
    end loop;
  end loop;

  -- (T.11) DEFINER HYGIENE on every body this file created.
  foreach v_birth in array array['clara._tf_fa_acquisition_birth()','clara._fa_acquisition_json(uuid)',
                                 'clara._fa_acquisition_history(uuid)',
                                 'clara._fa_complete_particulars_core(uuid,uuid,uuid,uuid,jsonb,text,text)',
                                 'clara.complete_fixed_asset_particulars_for(uuid,uuid,jsonb,text,uuid)',
                                 'clara._fa_asset_json(uuid,date)','clara.get_fixed_asset(uuid)'] loop
    if not exists (select 1 from pg_proc p where p.oid = v_birth::regprocedure
                    and p.prosecdef and pg_get_userbyid(p.proowner) = 'clara_fn_owner'
                    and exists (select 1 from unnest(p.proconfig) cfg where cfg like 'search_path=%')) then
      raise exception '#639 tail: % is not a search_path-pinned SECURITY DEFINER owned by clara_fn_owner', v_birth
        using errcode='CLR10';
    end if;
  end loop;

  raise notice '#639 tail: clean -- the birth trigger is deferred, sorts before the belt and carries all four exclusions; the hook is still spliced exactly once and the subledger-hook caller set is the re-derived six; the belt is untouched; the provenance copy agrees with its authority everywhere; both recut reads keep every key INCLUDING 0042 S5.4''s split-month advisory and disposal freeze; both particulars doors share the validator and write no journal; and the grant matrix is runtime-only for the overload and human-only for the reads.';
end
$p639_tail$;
