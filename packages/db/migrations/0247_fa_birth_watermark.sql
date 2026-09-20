-- 0247_fa_birth_watermark — #972 (riders wave 2, lane 04): THE FIXED-ASSET ACQUISITION BIRTH
-- HONOURS THE ENROLMENT WATERMARK ON EVERY FIRING, NOT ONLY AT THE FIRST APPROVE.
-- =====================================================================================
-- Spec of record: issue #972 — "x41.s4 reds on the persistent depreciation rig from a dated,
-- pre-existing defect, not #651's". Domain words: 0041 §1.2's ENROLMENT WATERMARK
-- (clara.fa_account_profiles.enrolled_at) — this file coins none of its own.
-- Builds on 0041 (the register, its belt and the §1.2 watermark) and 0216 (#639's lane-agnostic
-- birth trigger, whose body this file recuts and whose prestate/pin/tail idioms it follows).
--
-- =====================================================================================
-- THE DEFECT, IN ONE PARAGRAPH.
--
-- `clara._tf_fa_acquisition_birth` (0216 §B) is a DEFERRED CONSTRAINT TRIGGER declared
-- `after insert or update on clara.journal_entries … when (new.status = 'approved')`. "Approved"
-- is a STATE, not an event, so the trigger fires again on ANY later UPDATE that leaves the entry
-- approved. `clara.reverse_entry` records a reversal by stamping `reversed_by` on the original
-- and DELIBERATELY leaving its status 'approved' (the house reversal law, pre-0041) — so every
-- reversal re-fires this trigger on the entry being reversed.
--
-- Its birth join carried no watermark: `fp.asset_account_code = jl.account_code and fp.active`.
-- An entry approved BEFORE its account was enrolled therefore births nothing at approve (there is
-- no profile yet) and nothing at enrolment (§1.2 births nothing retroactively, by design) — and
-- then births a register row the moment somebody reverses it, because by then the profile exists
-- and is active. That is precisely the retroactive birth the watermark exists to forbid.
--
-- WHAT IT COST. The register then holds cost the post-watermark ledger movement does not account
-- for. `clara.fa_register_tie`'s pre-enrolment column cannot explain it — that column explains a
-- register that is SHORT of the GL (cost_diff = -gl_pre_enrolment_cost_cents), and this row makes
-- the register LONG of it (cost_diff = +77,000 on the x41.b3 fixture, accum_diff = 0) once the
-- reversal mirror has landed in the GL. `x41.s4`, the x41-family-scoped tie sweep, reported it as
-- an UNEXPLAINED difference at its settled as-of, on one more client per rig run, forever.
-- `x41.b3` stayed green throughout because it stopped at `reversed_by` and never looked at the
-- register again; this file's commit extends it to look.
--
-- NOT #651's. Two independent reviews dated the two oldest offending rows to 19:20:49 and
-- 19:22:04 on 2026-09-18, while 0227_depreciation_history was applied at 19:50:37 that evening.
-- Re-measured on the lane-04 rig before a line of this file was written: a single x41.b3 run on a
-- chain at 0234 (0227 long applied) births one such row, every time.
--
-- =====================================================================================
-- THE FIX: ONE PREDICATE, AND IT IS THE TIE'S OWN, NEGATED.
--
-- `clara.fa_register_tie` -- the read `x41.s4` drives, and the instrument that REPORTED this
-- defect -- already decides which GL movement is PRE-ENROLMENT, once per column:
-- `coalesce(j.approved_at, j.created_at) < v_enrolled` (0041:4367 cost, :4376 accumulated).
-- This file adds that test's exact NEGATION to the birth join:
-- `coalesce(new.approved_at, new.created_at) >= fp.enrolled_at`. The instrument that BIRTHS a
-- register row and the instrument that AUDITS it therefore answer "was this entry approved before
-- the account was enrolled?" with the same expression, and a difference the tie reports is either
-- explained by its own pre-enrolment column or is nobody's.
--
-- WHY NOT THE BELT'S PHRASING, WHICH AN EARLIER CUT OF THIS FILE COPIED. `clara._tf_fa_movement_belt`
-- (0041 §S2.6) spells its own watermark with a SESSION-CLOCK fallback, and its comment says why:
-- it needs a transaction-constant instant to close the interval at `retired_at` against a
-- same-transaction retire. The birth has no upper bound to close and no such race -- and the
-- fallback is actively WRONG here. This trigger's whole finding is that it re-fires on a LATER
-- transaction (`clara.reverse_entry`'s `reversed_by` stamp), and in that transaction the session
-- clock is the REVERSING transaction's, always at or after enrolment: the fallback would re-admit
-- exactly the entry this file exists to exclude. `created_at` is the ENTRY's own instant, which is
-- the thing the birth is asking about. Copying the belt also spent a clock read the estate's own
-- structural census (`packages/db/tests/x42-s5-helpers.mjs`, S5.25 arm (D),
-- FA_ACQUISITION_0216_CLOCK_NAMES) states in prose this body does not have -- `x42.r7.s5c.5` and
-- `x42.s5c.6` both reddened with a one-name diff. The predicate above spends none, so the census
-- reads true without widening its roster, and this file's tail re-proves it off the catalog (T.8).
--
-- AND THE FALLBACK IS BELT-AND-BRACES, NOT LOAD-BEARING. This is a constraint trigger gated
-- `when (new.status = 'approved')`, and an approved row can never carry a NULL `approved_at`:
-- `clara._tf_entry_immutable` refuses the draft->approved transition outright when
-- `new.approved_at is null` ("illegal approval transition"), and its approved->approved arm
-- allows only `reversed_by` / `reversal_reason` / `updated_at`, so the stamp can never be removed
-- afterwards either. Both guards are asserted in the prestate below and driven live by
-- `p972.source`. Should that law ever break, `coalesce(..., new.created_at)` is still the
-- conservative answer for the case this file is about -- an entry CREATED before enrolment stays
-- out of the birth's scope -- and `clara.journal_entries.created_at` is itself NOT NULL.
--
-- WHY NO UPPER BOUND HERE, AND WHY THAT IS NOT A HALF-FIX. The belt closes the enrolment interval
-- at both ends (`retired_at`) because it joins every profile generation; the birth join takes only
-- `fp.active`, and `ck_fap_retired` makes `active` and `retired_at is null` the SAME fact
-- (asserted in the prestate). So on the set this trigger considers, the lower bound is the whole
-- interval. The birth's blindness to RETIRED generations is 0216's, older than this defect, and
-- is not touched here.
--
-- WHAT THIS FILE DOES NOT DO. It does not clean register rows a long-lived rig already carries:
-- `clara.fixed_assets` rows are corrected by opening supersede and never deleted
-- (`clara._tf_fixed_assets_immutable_0017`, CLR13), the affected client count drifts run to run,
-- and #972 puts that out of scope explicitly. It does not touch `clara.reverse_entry` (whose
-- contract is unchanged: still stamps `reversed_by`, still leaves the original approved), the
-- belt, `clara._fa_on_approve` arm 4 (which is only ever called by an approve writer, at approve,
-- where the watermark holds trivially), or `clara.fa_register_tie` — the read that PROVES the fix
-- must not be changed by the file that fixes it.
--
-- REFUSAL VOCABULARY: none. This file adds no door and no new refusal; a pre-watermark entry is
-- now simply out of the birth's scope, exactly as it already is out of the belt's.
-- =====================================================================================

do $p972_pre$
declare
  v_sha text; v_src text; v_n int; v_pin record; v_redo boolean := false;
  -- The live pre-image of the ONE body this file recuts, measured off pg_proc.prosrc on the
  -- lane-04 rig (clara_l04, PG 17, chain 0001..0234 + wave-2 lane commits) — never transcribed
  -- from file text. It is also, verifiably, 0216's file text: this body was created directly by
  -- 0216 §B and has never been spliced.
  c_birth_pre constant text := '090217b0e74d8b1d8381e8b0e9c63c3822763b4eba9f641786247d2fb1fe687c';
  -- The marker that makes a RE-APPLY of this very file (the #957 redo mode) visible rather than
  -- merged into: the live body already carries the watermark this file installs.
  c_marker constant text := 'coalesce(new.approved_at, new.created_at) >= fp.enrolled_at';
  -- …and the SIGNAL the redo detector keys on, which is deliberately LOOSER than the marker.
  -- A fix round edits the predicate's own words (this file's first cut spelled the fallback
  -- `now()`; the review that measured the reddened clock census is why it no longer does), and a
  -- detector keyed on the exact marker cannot see a rig carrying an EARLIER cut of this same
  -- file: it would read that rig as 0216-fresh and refuse on the sha pin. `>= fp.enrolled_at` is
  -- the part every cut of this file has in common and 0216's own body has not.
  c_redo_signal constant text := '>= fp.enrolled_at';
  -- clara.fa_register_tie's OWN pre-enrolment test, which the marker above is the negation of.
  c_tie constant text := 'coalesce(j.approved_at, j.created_at) < v_enrolled';
begin
  if to_regclass('clara.fixed_assets') is null or to_regclass('clara.fa_account_profiles') is null then
    raise exception '#972 prestate: the fixed-asset register is absent -- 0041 must apply first'
      using errcode='CLR10';
  end if;
  if to_regprocedure('clara._tf_fa_acquisition_birth()') is null then
    raise exception '#972 prestate: clara._tf_fa_acquisition_birth is absent -- 0216 must apply first'
      using errcode='CLR10';
  end if;

  -- (1) THE WATERMARK COLUMN IS STILL THE §1.2 WATERMARK: present and NOT NULL.
  if not exists (select 1 from information_schema.columns
                  where table_schema='clara' and table_name='fa_account_profiles'
                    and column_name='enrolled_at' and is_nullable='NO') then
    raise exception '#972 prestate: clara.fa_account_profiles.enrolled_at is missing or nullable -- there is no watermark to apply'
      using errcode='CLR10';
  end if;
  -- …and `active` really is the same fact as `retired_at is null`, which is what makes the single
  -- lower-bound predicate this file installs EQUAL to the belt's two-sided interval on the set
  -- the birth join considers (see the header). Asserted, not assumed.
  if not exists (select 1 from pg_constraint c
                  where c.conrelid='clara.fa_account_profiles'::regclass and c.conname='ck_fap_retired'
                    and position('retired_at IS NULL' in pg_get_constraintdef(c.oid)) > 0) then
    raise exception '#972 prestate: ck_fap_retired is gone or no longer ties `active` to a NULL retired_at -- re-derive this file''s scope argument'
      using errcode='CLR10';
  end if;

  -- (2) THE TRIGGER IS STILL 0216's TRIGGER. Deferred, initially deferred, insert-or-update,
  -- gated on the approved STATE (which is the whole reason it re-fires), and named to sort before
  -- the belt. If any of this drifted, the defect this file fixes is not the defect on this rig.
  select count(*)::int into v_n from pg_trigger t
   where t.tgrelid='clara.journal_entries'::regclass and t.tgname='t_je_fa_acquisition_birth'
     and t.tgdeferrable and t.tginitdeferred and not t.tgisinternal
     and position('AFTER INSERT OR UPDATE' in pg_get_triggerdef(t.oid)) > 0
     and position($w$WHEN ((new.status = 'approved'::text))$w$ in pg_get_triggerdef(t.oid)) > 0;
  if v_n <> 1 then
    raise exception '#972 prestate: t_je_fa_acquisition_birth is not the deferred insert-or-update constraint trigger 0216 installed (matched % of 1)', v_n
      using errcode='CLR10';
  end if;
  if not ('t_je_fa_acquisition_birth' < 't_je_fa_movement_belt') then
    raise exception '#972 prestate: the birth trigger name no longer sorts before the belt'
      using errcode='CLR10';
  end if;

  -- (3) IS THIS A REDO OF THIS VERY FILE? (#957: a rig may re-apply the highest applied,
  -- unmerged migration after an edit.) The recut below is `create or replace`, so it is safe over
  -- its own old effects — but a prestate pinned to the PRE-image would refuse the redo outright.
  -- The redo is admitted LOUDLY, and only on the one signal that means it: the live body already
  -- carries A watermark this file installed (c_redo_signal, not the exact marker -- see its own
  -- comment). Everything else below, and the whole tail, still runs, and the tail's T.1 is what
  -- proves the redo landed THIS cut's predicate rather than the one it replaced.
  select p.prosrc into v_src from pg_proc p where p.oid='clara._tf_fa_acquisition_birth()'::regprocedure;
  if position(c_redo_signal in v_src) > 0 then
    v_redo := true;
    raise notice '#972 prestate: the live clara._tf_fa_acquisition_birth ALREADY carries a watermark against fa_account_profiles.enrolled_at (this file''s own earlier effect) -- treating this as a #957 REDO of 0247 itself. The recut is create-or-replace and the tail below re-proves the whole post-state from scratch, including that the predicate is THIS cut''s.';
  end if;

  -- (4) PRE-IMAGE sha256(prosrc) PINS, EVERY ONE MEASURED ON THE LANE-04 RIG off pg_proc.prosrc.
  for v_pin in select * from (values
      -- RECUT by this file.
      ('clara._tf_fa_acquisition_birth()', c_birth_pre, 'recut'),
      -- NON-REGRESSION: this file must not move any of these, and §T re-reads them afterwards.
      -- The belt is where the correct watermark already lives (this file copies its expression);
      -- `_fa_on_approve` is the OTHER birth site and is deliberately untouched; `fa_register_tie`
      -- is the instrument that proves the fix and must not be changed by it; `reverse_entry` is
      -- the door whose `reversed_by` stamp re-fires the trigger and whose contract is unchanged.
      ('clara._tf_fa_movement_belt()',
       'be97ea51a8db4d69a32da6986a1f0ab7b136c7dc8432913fe783354a3e4c8b5a', 'unmoved'),
      ('clara._fa_on_approve(uuid)',
       '7ffa9a710bf2ba5fc6c49ed184251f7cbb37c834a213f0ddeeb3a3ba91b98fc0', 'unmoved'),
      ('clara.fa_register_tie(uuid,date)',
       'c9f47463e1e5c02d56bc1ed7a5396d672990bf2f50de20e33cb47a59cbe67586', 'unmoved'),
      ('clara.reverse_entry(uuid,text,text)',
       'cc01323e453de38afb83f0e50b300a488e8a963ce458c621dee9abec4651f4b9', 'unmoved')
    ) as t(sig, sha, kind) loop
    if v_redo and v_pin.kind = 'recut' then continue; end if;
    select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
      from pg_proc p where p.oid = v_pin.sig::regprocedure;
    if v_sha is distinct from v_pin.sha then
      raise exception '#972 prestate: % (%) has DRIFTED from its pinned pre-image (measured %, expected %) -- re-derive this file against the LIVE body before applying', v_pin.sig, v_pin.kind, v_sha, v_pin.sha
        using errcode='CLR10';
    end if;
  end loop;

  -- (5) THE TIE REALLY DOES DECIDE PRE-ENROLMENT THE WAY THIS FILE IS ABOUT TO NEGATE, exactly
  -- twice -- once per column. The fix's whole claim is "the birth now admits exactly what the
  -- audit read calls POST-enrolment"; if clara.fa_register_tie stopped saying it in these words,
  -- that claim is false and this file must be re-derived. (Its whole body is also sha-pinned
  -- above and re-read in §T; this arm says WHICH sentence in it the fix depends on.)
  select p.prosrc into v_src from pg_proc p where p.oid='clara.fa_register_tie(uuid,date)'::regprocedure;
  v_n := (length(v_src) - length(replace(v_src, c_tie, ''))) / length(c_tie);
  if v_n <> 2 then
    raise exception '#972 prestate: clara.fa_register_tie phrases its pre-enrolment test % time(s), expected exactly 2 (cost and accumulated)', v_n
      using errcode='CLR10';
  end if;

  -- (6) THE WATERMARK'S FIRST OPERAND CAN NEVER BE NULL ON A ROW THIS TRIGGER FIRES FOR, and
  -- that is what makes the `created_at` arm belt-and-braces rather than load-bearing (header).
  -- clara._tf_entry_immutable refuses the draft->approved transition when approved_at is absent,
  -- and its approved->approved arm allows only the reversal-linkage pair plus updated_at, so the
  -- stamp can never be removed afterwards. Asserted here, and DRIVEN live by p972.source.
  select p.prosrc into v_src from pg_proc p where p.oid='clara._tf_entry_immutable()'::regprocedure;
  if position('new.approved_at is null' in v_src) = 0
     or position('illegal approval transition' in v_src) = 0 then
    raise exception '#972 prestate: clara._tf_entry_immutable no longer refuses an approval that carries no approved_at -- re-derive this file''s NULL argument before applying'
      using errcode='CLR10';
  end if;
  if position($a$v_allowed := array['reversed_by','reversal_reason','updated_at'];$a$ in v_src) = 0 then
    raise exception '#972 prestate: clara._tf_entry_immutable''s approved->approved allow-list is no longer exactly {reversed_by, reversal_reason, updated_at} -- approved_at may now be nullable after approval, so re-derive this file''s NULL argument'
      using errcode='CLR10';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema='clara' and table_name='journal_entries'
                    and column_name='created_at' and is_nullable='NO') then
    raise exception '#972 prestate: clara.journal_entries.created_at is nullable -- the watermark''s fallback operand is no longer guaranteed'
      using errcode='CLR10';
  end if;

  raise notice '#972 prestate: clean -- the watermark column is NOT NULL, ck_fap_retired still equates `active` with a NULL retired_at, t_je_fa_acquisition_birth is still 0216''s deferred insert-or-update constraint trigger sorting before the belt, clara.fa_register_tie still phrases its pre-enrolment test exactly twice, clara._tf_entry_immutable still guarantees an approved entry carries approved_at, and every pinned pre-image matches.';
end
$p972_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §A  THE RECUT. 0216 §B's body, byte for byte, plus ONE join predicate and its comment.
--     `create or replace` keeps the owner, the ACL, the SECURITY DEFINER flag and the
--     search_path, and is safe to run over its own old effects (#957 redo).
-- =====================================================================================
create or replace function clara._tf_fa_acquisition_birth() returns trigger
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
             -- #972 THE §1.2 WATERMARK, ON EVERY FIRING — NOT ONLY THE FIRST APPROVE. This is a
             -- DEFERRED constraint trigger gated on the approved STATE, so it fires again on any
             -- later UPDATE that leaves the entry approved, and clara.reverse_entry records a
             -- reversal by stamping `reversed_by` while leaving the original approved. Without
             -- this line that re-fire birthed a register row from an entry approved BEFORE the
             -- account was enrolled — the retroactive birth §1.2 exists to forbid, which
             -- clara.fa_register_tie's pre-enrolment column cannot explain (it explains a
             -- register SHORT of the GL; this made it LONG). The expression is that column's own
             -- test NEGATED (0041:4367, :4376), so the instrument that births the register row
             -- and the instrument that audits it cannot disagree about which entries are
             -- pre-enrolment. It reads NO session clock, by design: on the re-fire the clock
             -- belongs to the REVERSING transaction, which is always at or after enrolment and
             -- would re-admit the very entry this line excludes. The `created_at` arm is
             -- unreachable while clara._tf_entry_immutable holds (an approved row always carries
             -- approved_at) and conservative if it ever does not.
             and coalesce(new.approved_at, new.created_at) >= fp.enrolled_at
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
  'clara._fa_on_approve arm 4 through the same on conflict (acquisition_line_id) do nothing. '
  '#972 (0247): the join carries the 0041 §1.2 enrolment watermark as the exact negation of '
  'clara.fa_register_tie''s own pre-enrolment test, so a re-fire caused by a later UPDATE that '
  'leaves the entry approved -- clara.reverse_entry''s reversed_by stamp -- can never birth a row '
  'from a PRE-ENROLMENT entry, and the birth cannot disagree with the read that audits it. It '
  'reads NO session clock: on that re-fire the clock is the REVERSING transaction''s.';

reset role;

-- =====================================================================================
-- §T  THE TAIL. Every assertion re-read from the CATALOG after the recut.
-- =====================================================================================
do $p972_tail$
declare
  v_src text; v_n int; v_pin record; v_sha text;
  c_marker constant text := 'coalesce(new.approved_at, new.created_at) >= fp.enrolled_at';
  c_tie constant text := 'coalesce(j.approved_at, j.created_at) < v_enrolled';
  -- The OLD, watermark-free join, verbatim. A vacuous replace would leave this present.
  c_old constant text := '             and fp.asset_account_code = jl.account_code and fp.active
           where jl.entry_id = new.id';
begin
  select p.prosrc into v_src from pg_proc p where p.oid='clara._tf_fa_acquisition_birth()'::regprocedure;

  -- T.1 the watermark is IN, exactly once.
  v_n := (length(v_src) - length(replace(v_src, c_marker, ''))) / length(c_marker);
  if v_n <> 1 then
    raise exception '#972 tail T.1: the recut birth body carries the watermark % time(s), expected exactly 1', v_n
      using errcode='CLR10';
  end if;
  -- T.2 …and the OLD watermark-free join is GONE, so a vacuous replace cannot pass this file.
  if position(c_old in v_src) <> 0 then
    raise exception '#972 tail T.2: the recut birth body still carries the watermark-FREE join -- the replace was vacuous'
      using errcode='CLR10';
  end if;

  -- T.3 the four early returns 0216 shipped survive, one each. This file widens no exclusion and
  -- drops none: it narrows the JOIN and nothing else.
  for v_pin in select * from (values
      ('if new.is_opening_balance then return null; end if;', 1),
      ('if new.reversal_of is not null then return null; end if;', 1),
      ($$if new.flags ? 'fa_disposal' then return null; end if;$$, 1),
      ($$if new.origin = 'scheduled_run' then return null; end if;$$, 1)) as t(marker, want) loop
    v_n := (length(v_src) - length(replace(v_src, v_pin.marker, ''))) / length(v_pin.marker);
    if v_n <> v_pin.want then
      raise exception '#972 tail T.3: the recut birth body carries "%" % time(s), expected % -- the recut damaged 0216''s guard', v_pin.marker, v_n, v_pin.want
        using errcode='CLR10';
    end if;
  end loop;

  -- T.4 still ONE insert with ONE conflict target — the idempotency 0216 rests on.
  for v_pin in select * from (values
      ('insert into clara.fixed_assets(', 1),
      ('on conflict (acquisition_line_id) do nothing', 1),
      ($$'asset.acquired'$$, 1)) as t(marker, want) loop
    v_n := (length(v_src) - length(replace(v_src, v_pin.marker, ''))) / length(v_pin.marker);
    if v_n <> v_pin.want then
      raise exception '#972 tail T.4: the recut birth body carries "%" % time(s), expected %', v_pin.marker, v_n, v_pin.want
        using errcode='CLR10';
    end if;
  end loop;

  -- T.5 the FUNCTION's own shape is unmoved: owner, SECURITY DEFINER, search_path, and an ACL
  -- that grants EXECUTE to nobody. `create or replace` preserves all four; this proves it did.
  select count(*)::int into v_n from pg_proc p
   where p.oid='clara._tf_fa_acquisition_birth()'::regprocedure
     and p.proowner::regrole::text='clara_fn_owner' and p.prosecdef
     and 'search_path=clara, pg_temp' = any(p.proconfig);
  if v_n <> 1 then
    raise exception '#972 tail T.5: clara._tf_fa_acquisition_birth lost its owner, its SECURITY DEFINER flag or its pinned search_path'
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_proc p, unnest(coalesce(p.proacl, '{}'::aclitem[])) as a
   where p.oid='clara._tf_fa_acquisition_birth()'::regprocedure
     and a::text not like 'clara_fn_owner=%';
  if v_n <> 0 then
    raise exception '#972 tail T.5b: clara._tf_fa_acquisition_birth gained % grant(s) -- it is an INTERNAL, granted to nobody', v_n
      using errcode='CLR10';
  end if;

  -- T.6 the TRIGGER is untouched: still exactly one, still deferred/initially deferred, still
  -- insert-or-update on the approved STATE, still sorting before the belt.
  select count(*)::int into v_n from pg_trigger t
   where t.tgrelid='clara.journal_entries'::regclass and t.tgname='t_je_fa_acquisition_birth'
     and t.tgdeferrable and t.tginitdeferred and not t.tgisinternal
     and t.tgfoid='clara._tf_fa_acquisition_birth()'::regprocedure
     and position('AFTER INSERT OR UPDATE' in pg_get_triggerdef(t.oid)) > 0
     and position($w$WHEN ((new.status = 'approved'::text))$w$ in pg_get_triggerdef(t.oid)) > 0;
  if v_n <> 1 then
    raise exception '#972 tail T.6: t_je_fa_acquisition_birth is no longer 0216''s deferred insert-or-update constraint trigger (matched % of 1)', v_n
      using errcode='CLR10';
  end if;

  -- T.7 NON-REGRESSION, re-read: the belt, the other birth site, the proving read and the
  -- reversal door are byte-for-byte what the prestate measured.
  for v_pin in select * from (values
      ('clara._tf_fa_movement_belt()',
       'be97ea51a8db4d69a32da6986a1f0ab7b136c7dc8432913fe783354a3e4c8b5a'),
      ('clara._fa_on_approve(uuid)',
       '7ffa9a710bf2ba5fc6c49ed184251f7cbb37c834a213f0ddeeb3a3ba91b98fc0'),
      ('clara.fa_register_tie(uuid,date)',
       'c9f47463e1e5c02d56bc1ed7a5396d672990bf2f50de20e33cb47a59cbe67586'),
      ('clara.reverse_entry(uuid,text,text)',
       'cc01323e453de38afb83f0e50b300a488e8a963ce458c621dee9abec4651f4b9')
    ) as t(sig, sha) loop
    select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
      from pg_proc p where p.oid = v_pin.sig::regprocedure;
    if v_sha is distinct from v_pin.sha then
      raise exception '#972 tail T.7: % MOVED (measured %, expected %) -- this file recuts exactly one body', v_pin.sig, v_sha, v_pin.sha
        using errcode='CLR10';
    end if;
  end loop;

  -- T.8 THE RECUT SPENDS NO CLOCK READ. Not decoration: the estate's own structural census
  -- (x42 S5.25 arm (D)) states in prose that this body carries none, and an earlier cut of this
  -- file reddened two of its cells by copying the belt's clock-bearing phrasing. The detector is
  -- arm (D)'s OWN regex, spelled here so the migration proves the property it must not break
  -- rather than leaving it to a battery that runs later.
  if v_src ~* '\m(now\(\)|current_timestamp\M|localtimestamp\M|clock_timestamp\(\)|statement_timestamp\(\)|transaction_timestamp\(\))' then
    raise exception '#972 tail T.8: the recut birth body reads a bare clock token -- x42 arm (D)''s roster says this body has none, and the watermark must be the ENTRY''s own instant'
      using errcode='CLR10';
  end if;

  -- T.9 …AND THE TIE STILL PHRASES THE TEST THIS FILE NEGATES, twice, one per column. The whole
  -- argument that the birth and the audit read agree on scope.
  select p.prosrc into v_src from pg_proc p where p.oid='clara.fa_register_tie(uuid,date)'::regprocedure;
  v_n := (length(v_src) - length(replace(v_src, c_tie, ''))) / length(c_tie);
  if v_n <> 2 then
    raise exception '#972 tail T.9: clara.fa_register_tie phrases its pre-enrolment test % time(s), expected exactly 2 -- the birth''s watermark is its negation', v_n
      using errcode='CLR10';
  end if;

  raise notice '#972 tail OK: clara._tf_fa_acquisition_birth carries the 0041 §1.2 watermark exactly once in clara.fa_register_tie''s own words negated, reads no bare clock token, the watermark-free join is gone, 0216''s four exclusions and its single conflict-targeted insert survive, the function keeps its owner/definer/search_path and grants nobody EXECUTE, t_je_fa_acquisition_birth is unchanged, and the belt, clara._fa_on_approve, clara.fa_register_tie and clara.reverse_entry are byte-for-byte unmoved.';
end
$p972_tail$;
