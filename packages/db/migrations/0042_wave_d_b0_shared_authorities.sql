-- 0042_wave_d_b0_shared_authorities.sql -- WAVE D-b, SLICE D-b0: THE SHARED CLASS
-- AUTHORITIES + THE D-a RESIDUAL RECUTS.
--
-- WHY THIS FILE EXISTS, IN ONE PARAGRAPH. The as-built ladder's round-11 conditional rule
-- fired (ladder-r11-record.md, 2026-08-04: two further money mechanisms plus a repair-
-- regression class, ALL of them inside ONE family), so the 21,163-line Wave D-b unit is
-- PROVEN NON-CONVERGENT and THE SPLIT IS THE EXECUTED RULING: D-b0 (this file, the shared
-- class authorities + the D-a residual recuts) ships FIRST, then D-b1 (staff advances),
-- then D-b3 (the AF-2 composite + the producer), and D-b2 (recurring adjustments) is HELD
-- BACK with the round-11 fixes and its own ladder. The partition is not invented here: it
-- is the measured file map of `split-dependency-census.md` sect.8, whose sect.2 classifies
-- all 22 cross-slice order violations, sect.3 gives the per-block purity verdict, sect.5
-- the tail split, sect.6 the test split and sect.7 the seven hazards this extraction
-- honours. OPTION A (census sect.4) IS TAKEN: the one shared-table DDL item this slice
-- carries forward is clara.journal_entries.auto_reversal_of + uq_je_auto_reversal_of
-- (SS1.10) -- a nullable, self-referencing, partial-unique column with NO writer until
-- D-b2, shipped early because it is what lets clara._wdb_reversal_blocked exist in D-b1 and
-- so resolves six of the twenty-two violations in one move. SCOPE OF THIS SLICE: the
-- trimmed pre-DDL probes; SS1.10; the four s2 class-authority fragments that were MISFILED
-- in the adjustment section (clara._assert_due_read_ctx, clara._wdb_period_stamps +
-- clara._wdb_correction_posting_date + clara._wdb_iso_date_supported,
-- clara._adj_line_eligibility_breach, and clara._wdb_rerun_breach in its FIXED-ASSET-ARM
-- form); the FA-only reservation shells clara._acct_role_reserved /
-- clara._acct_role_reserved_at; every PURE S5 residual block (the D-a fixes, the
-- reservation-authority eradication, the due-oracle fail-open, the clock lane, the FY
-- algebra); the S5 censuses in slice-local form; and tail 16 plus the slice-local forms of
-- tails 1, 3, 6, 9 and 20. EXCLUDED, by the census's own exclusion list: S5.8 (the approve
-- hook splices), S5.9's reversal-WALL half (the correction-date half ships here as S5.9-b0,
-- erratum E1), S5.10/S5.10a (revise_entry), S5.11 (withdraw_draft), S5.12's annual-cadence
-- guard, and S5.19's GL-SIDE recut of fa_register_tie (its WALK GATE ships here as S5.19-b0,
-- because it is the pair of S5.15, which ships here).
--
-- EVERY ALTERED SITE IS MARKED IN SOURCE with a `-- [SPLIT D-b0 2026-08-04] ...` comment
-- naming what was narrowed and WHERE the final form lands. Everything else is byte-exact
-- from the canonical sections (0042-sections/s0,s1,s2,s5,s6), comments included.
--
-- DESIGN OF RECORD (unchanged): docs/plan/wave-d-b-design.md v8 [WDB-G1..G16] +
-- docs/plan/wave-d-b-design-abi.md (the builder ABI). Governing law above the design:
-- docs/plan/wave-d-contract.md (WD-R1..WD-R15, ADR-055); docs/prd/PRD.md SS6 (LAW) always.
--
-- ROLE SCOPING IS PER-FILE AND PER-BLOCK (census hazard sect.7.4): in the whole unit s2
-- opened `set role clara_fn_owner` once and never reset, and s3 relied on that for 2,650
-- lines. Every slice file below opens and closes its OWN scopes, so no section inherits a
-- role from another.
--
-- MIGRATION NUMBER claimed at MERGE time (standing law); the frontier probe below pins
-- 0041_wave_d_a_fa_register as the applied predecessor.
--
-- ASSEMBLY ADJUDICATION CARRIED FORWARD (whole-unit header adjudication 3):
-- clara.journal_entries.auto_reversal_of IS CREATED HERE (SS1.10). Design SS2.4 pins the
-- pair's linkage on this column -- "the mirror carries auto_reversal_of (FK -> the
-- occurrence, UNIQUE); no occurrence-side column" -- but ABI SSD's DDL inventory never
-- names it. The design wins (the ABI is the design's appendix, not its amendment).

-- #####################################################################################
-- ####################### SECTION 0 -- THE PRE-DDL LIVE PROBES ########################
-- #####################################################################################
-- One probe = one named failure mode with a remedy in its text. Negative probes guard a
-- partial/duplicate re-apply; positive anchor probes reconfirm -- against pg_class /
-- pg_constraint / pg_proc / information_schema, never against the design's prose -- every
-- prior object this file's FKs, splices and censuses depend on. Runs BEFORE
-- `set role clara_fn_owner`.

do $probe$
declare
  v_n int; v_names text; v_def text; v_ver int;
begin
  -- PROBE 1 -- FRONTIER ASSERT.
  select count(*)::int into v_n from clara.schema_migrations
    where version = '0041_wave_d_a_fa_register';
  if v_n <> 1 then
    raise exception '0042 probe 1: migration 0041_wave_d_a_fa_register is not recorded as applied -- apply in order';
  end if;

  -- [SPLIT D-b0 2026-08-04] PROBES 2, 3, 4, 5, 6, 9 AND 13 ARE NOT IN THIS SLICE, AND EACH IS
  -- NARROWED RATHER THAN DROPPED (split-dependency census sect.8: "drop the
  -- relation/column/index/event negative probes for D-b1/D-b2/D-b3 objects").
  --   * 2 (the seven relations) -- D-b1 creates four, D-b2 three; each slice keeps its own.
  --   * 3/4 (the new columns and indexes) -- the two clara.bank_matches columns are D-b3's
  --     and the two hot-loop partials are D-b2's; the ONE pair this slice does create
  --     (clara.journal_entries.auto_reversal_of + uq_je_auto_reversal_of) is probed in this
  --     slice's own SS1.0 block, immediately above its ALTER, which is where the census's
  --     "each keeps only its own relations/columns/indexes/event names" rule (sect.4) puts
  --     it.
  --   * 5 (the two event names) -- adjustment.posted is D-b2's, bank.line_exception_reopened
  --     is D-b3's; this slice registers no event at all.
  --   * 6 (the complete created-function census) -- its list is the WHOLE unit's set of 56
  --     names. A slice-local copy would enumerate this slice's eight new bodies alone, and
  --     every one of them is created with `create function` (never `create or replace`), so
  --     a duplicate re-apply fails at the CREATE with Postgres's own duplicate-function
  --     error rather than silently replacing a live body. RECORDED, NOT REPAIRED: the
  --     whole-unit probe 6 documents itself as "the COMPLETE as-built set of names this file
  --     CREATES" and clara._assert_due_read_ctx is missing from it -- a real gap in the
  --     whole unit, reported to the assembly rather than fixed inside a slice that does not
  --     ship that list.
  --   * 9 (the tenancy FK anchors) -- they anchor the composite FKs of the SEVEN NEW TABLES,
  --     none of which is created here; this slice's only FK is journal_entries(id) -> itself.
  --   * 13 (the bank_line_exceptions resolution columns) -- the SS4 reopen arm is D-b3's.
  -- FINAL FORM: the whole-unit 13-probe block, reassembled across the four slices.

  -- PROBE 7 -- ANCHOR: every live body SECTION S5 splices or factors is present at its
  -- EXACT signature. A missing one here is a far better error than a regprocedure cast
  -- failing mid-splice.
  -- [SPLIT D-b0 2026-08-04] NARROWED TO THIS SLICE'S OWN SPLICE/FACTOR SUBJECTS. The eleven
  -- bank-domain entries (BOTH clara.settle_from_bank_line overloads, BOTH
  -- clara.match_bank_line overloads, clara.allocate_receipt, clara.allocate_payment,
  -- clara.complete_pending_match, clara.unmatch_bank_match,
  -- clara.resolve_bank_line_exception, clara._tf_bank_settled_authority_belt and
  -- clara._tf_bank_line_exception_transition) are SECTION S4's, and census hazard sect.7.3
  -- is explicit that D-b0 must NOT splice any of them -- so this slice must not assert them
  -- either, or it claims an anchor it never uses. clara.revise_entry and
  -- clara.withdraw_draft (S5.10/S5.10a/S5.11, relocated to D-b2) and clara._hash (the
  -- template content hash's digest, D-b2) go the same way. clara.reverse_entry STAYS: this
  -- slice splices it at S5.9-b0 (erratum E1 -- the correction-date half), and tail 1 and the
  -- S5.25 duplication roster also read it, so its absence must fail by name here rather than
  -- inside a census. clara.fa_register_tie is a S5.19-b0 splice subject and is NOT in this
  -- array: the whole unit never carried it either (it is named below as one of the thirteen
  -- S5 targets the 27-entry array omits), and adding a probe this slice's source never
  -- carried would be invention -- its own block prestates it by name at its exact signature.
  -- FINAL FORM: the whole-unit 27-entry array, reassembled across the four slices. RECORDED:
  -- the census's phrase "the 25 S5 target-signature probes (7)" is imprecise -- the
  -- whole-unit array holds 27 entries and does NOT enumerate every S5 subject
  -- (clara.depreciation_run_due, clara._fa_reserved_roles, clara.apply_open_items,
  -- clara.unallocate_group, clara._document_retention_date, clara._fa_fy_end_for,
  -- clara._fa_fy_open_for, clara._fa_asset_charges, clara._fa_oldest_unmet_period,
  -- clara._fa_run_period_core, clara.upsert_fa_account_profile, clara._fa_reversal_blocked
  -- and clara.fa_register_tie are all S5 targets that were never in it). Reported, not
  -- repaired: adding a probe this slice's source never carried would be invention.
  foreach v_names in array array[
      'clara._subledger_on_approve(uuid)',
      'clara._approve_entry_core(jsonb,uuid,uuid,text,text)',
      'clara._fa_on_approve(uuid)',
      'clara.reverse_entry(uuid,text,text)',
      'clara.set_client_fy_end(uuid,integer,integer,text)',
      'clara._fa_assert_code_unreserved(uuid,text)',
      'clara._fa_asset_json(uuid,date)',
      'clara._draft_opening_item_core(uuid,uuid,uuid,uuid,jsonb,jsonb,uuid,uuid,text)',
      'clara.dispose_fixed_asset(uuid,uuid,date,bigint,text,text,text,text,text,bigint)',
      'clara.revise_fixed_asset_particulars(uuid,uuid,jsonb,date,text)',
      'clara.approve_opening_correction(uuid,jsonb,text,text)',
      'clara._reserve_op(uuid,text,text,bytea)',
      'clara._finish_op(uuid,text,text,jsonb)'] loop
    if to_regprocedure(v_names) is null then
      raise exception '0042 D-b0 probe 7: % is not present at that exact signature -- SECTION S5 cannot splice or factor it', v_names;
    end if;
  end loop;

  -- PROBE 8 -- ANCHOR: exactly one ACTIVE taxonomy version exists and the two new rows will
  -- attach to it (the 0041:978-996 CTE cross-joins clara.taxonomy_active).
  select count(*)::int into v_n from clara.taxonomy_active;
  if v_n <> 1 then
    raise exception '0042 probe 8: clara.taxonomy_active must hold exactly one row (found %)', v_n;
  end if;
  select version into v_ver from clara.taxonomy_active;
  if v_ver is null then
    raise exception '0042 probe 8b: clara.taxonomy_active carries no version';
  end if;

  -- PROBE 10 -- ANCHOR: the four approve paths still funnel through _subledger_on_approve at
  -- the count the 0037 tail pinned and the 0041 tail re-pinned. The 0042 tail RE-PINS this
  -- at the SAME number after the SS2.6/SS3.3 hook splices -- every D-b approval routes
  -- through _approve_entry_core, so the census must NOT move. Measuring it here first makes
  -- the tail's claim a delta, not a guess.
  select count(*)::int into v_n from pg_proc p
    where p.pronamespace = 'clara'::regnamespace
      and p.prosrc like '%clara._subledger_on_approve(%';
  if v_n <> 4 then
    raise exception '0042 probe 10: expected exactly 4 callers of clara._subledger_on_approve, found % -- the 0037:3779-3846 four-caller census drifted', v_n;
  end if;

  -- PROBE 11 -- ANCHOR: the hook splice subject still carries the _fa_on_approve marker
  -- exactly once, at the position SS2.6 splices AFTER. A drifted count means the D-a splice
  -- moved and SECTION S5's positional splice has no anchor.
  select p.prosrc into v_def from pg_proc p
    where p.oid = 'clara._subledger_on_approve(uuid)'::regprocedure;
  v_n := (length(v_def) - length(replace(v_def, 'clara._fa_on_approve(p_entry)', '')))
         / length('clara._fa_on_approve(p_entry)');
  if v_n <> 1 then
    raise exception '0042 probe 11: expected exactly 1 clara._fa_on_approve(p_entry) marker in _subledger_on_approve, found % -- the SS2.6 splice anchor drifted', v_n;
  end if;

  -- PROBE 12 -- NAMED LIVE-DATA ASSUMPTION, RECONFIRMED (the SS6.3 [WDB-G12] prestate).
  -- SECTION S5 sets clara.fixed_assets.cost_cents NOT NULL. A NULL-cost row would abort the
  -- ALTER mid-migration with a bare constraint error; this probe names the remedy instead.
  select count(*)::int into v_n from clara.fixed_assets where cost_cents is null;
  if v_n <> 0 then
    raise exception '0042 probe 12: % fixed_assets row(s) carry a NULL cost_cents -- SS6.3 sets that column NOT NULL. REMEDY: complete each row''s cost through clara.complete_fixed_asset_particulars (or, for a K-family carry-down, re-derive its baseline) BEFORE applying 0042; this migration will not guess a cost.', v_n;
  end if;

  raise notice '0042 D-b0 SECTION 0 probe OK (0/6): 0041 is the applied frontier; the 13 splice/factor subjects this slice touches, the taxonomy singleton, the four-caller census and the single _fa_on_approve splice anchor are all present in their expected shape; no fixed_assets row carries a NULL cost_cents.';
end
$probe$;

-- #####################################################################################
-- ############ SECTION S1 (D-b0 SLICE) -- DDL: SS1.10 AND NOTHING ELSE ################
-- #####################################################################################
-- [SPLIT D-b0 2026-08-04] THIS SLICE CARRIES EXACTLY ONE OF SECTION S1's ELEVEN DDL BLOCKS.
-- Split-dependency census sect.4 Option A (RECOMMENDED, and taken): "D-b0 carries
-- cost_cents SET NOT NULL (SECTION S5.1) and clara.journal_entries.auto_reversal_of + FK +
-- uq_je_auto_reversal_of. Every other DDL object ships with its family's slice." So:
--   SS1.1-SS1.3 (adjustment_templates / adjustment_runs / adjustment_pair_reversals and
--                their triggers, policies and grants)      -> D-b2
--   SS1.4-SS1.7 (staff_advance_accounts / staff_advances /
--                staff_advance_applications / ea1955_policy) -> D-b1
--   SS1.8       (the clara.bank_matches ALTERs + the set-once trigger) -> D-b3
--   SS1.9       (ix_je_adj_draft, ix_je_adj_occurrence)     -> D-b2
--   SS1.10      (auto_reversal_of + uq_je_auto_reversal_of) -> HERE
--   SS1.11      (ix_adj_pair_corrections)                   -> D-b2
--   SECTION EVENTS (adjustment.posted / bank.line_exception_reopened) -> D-b2 / D-b3
-- WHY THE DEVIATION IS WORTH ITS COST, measured (census sect.4): shipping this ONE nullable
-- column three slices early is what lets clara._wdb_reversal_blocked -- which reads ONLY
-- clara.journal_entries.auto_reversal_of, never an adjustment table -- exist in D-b1, and
-- that single move resolves six of the twenty-two cross-slice order violations (the D-b0
-- reverse_entry wall term and the D-b3 clara._wdb_line_booking_block edge among them). The
-- alternative (Option B, strict per-slice DDL) costs three EXTRA splices on bodies already
-- spliced seven times and was measured as the higher-risk path. The column is nullable,
-- self-referencing and partial-unique, and NO body in this slice writes it: the D-b0 upgrade
-- drill can assert it stays 100% NULL until D-b2's hook lands.
--
-- ROLE SCOPING IS THIS FILE'S OWN (census hazard sect.7.4): the probe runs as the plain
-- migration role, the ALTER inside an explicit `set role clara_fn_owner` scope this file
-- opens and closes.

-- #####################################################################################
-- ################## SS1.0 (D-b0 SLICE) -- THE PRE-DDL LIVE PROBES ####################
-- #####################################################################################
-- [SPLIT D-b0 2026-08-04] The whole-unit SS1.0 carries eight probes; seven of them are about
-- objects this slice does not create (the seven relations, the two clara.bank_matches
-- columns, the two hot-loop indexes, the two event names, the clara.bank_matches status
-- CHECK, the clara.bank_line_exceptions primary key and the two generic trigger guards).
-- The frontier assert is already made once, in SECTION 0 above, and is not repeated. What
-- remains is the negative pre-state for THIS slice's own column and index -- narrowed from
-- the whole unit's SECTION 0 probes 3 and 4, keeping their exact instruments
-- (information_schema.columns and pg_class relkind='i'), and stated here rather than there
-- because census sect.4 puts each slice's own object probe beside its own DDL.
-- FINAL FORM: the whole-unit SS1.0 block, reassembled across the four slices.

do $s1_probe$
declare
  v_n int; v_names text;
begin
  -- PROBE 1 -- PRE-STATE SAFETY: clara.journal_entries does not already carry
  -- auto_reversal_of (guards a partial or duplicate re-apply of the ALTER below).
  select count(*)::int, string_agg(table_name || '.' || column_name, ', ' order by table_name, column_name)
    into v_n, v_names
  from information_schema.columns
  where table_schema = 'clara'
    and table_name = 'journal_entries' and column_name = 'auto_reversal_of';
  if v_n <> 0 then
    raise exception '0042 D-b0 SS1 probe 1: % column(s) this slice adds already exist (%) -- partial or duplicate re-apply', v_n, v_names;
  end if;

  -- PROBE 2 -- PRE-STATE SAFETY: the pair-linkage partial UNIQUE does not exist yet.
  select count(*)::int, string_agg(c.relname, ', ' order by c.relname) into v_n, v_names
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'clara' and c.relkind = 'i'
    and c.relname in ('uq_je_auto_reversal_of');
  if v_n <> 0 then
    raise exception '0042 D-b0 SS1 probe 2: % index(es) already exist (%) -- partial or duplicate re-apply', v_n, v_names;
  end if;

  raise notice '0042 D-b0 SS1 probe OK (0/2): clara.journal_entries.auto_reversal_of and uq_je_auto_reversal_of do not pre-exist.';
end
$s1_probe$;

set role clara_fn_owner;

-- =====================================================================================
-- SS1.10 -- clara.journal_entries.auto_reversal_of: THE PAIR LINKAGE COLUMN.
--
-- ASSEMBLY ADJUDICATION S1-A6 (a design/ABI GAP closed at assembly, reported not silent).
-- Design SS2.4 pins the auto-reversal pair's linkage explicitly: "the mirror carries
-- `auto_reversal_of` (FK -> occurrence, UNIQUE); no occurrence-side column;
-- `reversal_of`/`reversed_by` unused on the pair (ramp starvation + the correction
-- dead-end, ladder-verified)". But ABI SSD's DDL inventory enumerates only the seven new
-- relations plus the clara.bank_matches ALTER and never names this column, so no lane
-- created it -- while SECTION S2's mirror INSERT and BOTH arms of
-- clara._wdb_reversal_blocked read it, and tail 1(d) asserts the hook stamps it. Added
-- here, in the section that owns schema, rather than inside a function section.
--
-- ONE-WAY BY LAW: the mirror row carries the edge; the occurrence carries nothing. The
-- partial UNIQUE is what makes "one mirror per occurrence" structural rather than a hook
-- invariant -- a second mirror for the same occurrence cannot be inserted even by a body
-- that forgot to check. Written at INSERT time on the mirror draft (SS2.4's 13-column
-- recipe), so no clara._tf_entry_immutable draft->draft allowset change is required.
-- =====================================================================================
alter table clara.journal_entries
  add column auto_reversal_of uuid references clara.journal_entries(id);
create unique index uq_je_auto_reversal_of on clara.journal_entries (auto_reversal_of)
  where auto_reversal_of is not null;

reset role;

-- #####################################################################################
-- ##### SECTION S2 (D-b0 SLICE) -- THE MISFILED CLASS AUTHORITIES, LIFTED OUT ##########
-- #####################################################################################
-- [SPLIT D-b0 2026-08-04] NINE FUNCTIONS WERE CREATED INSIDE THE ADJUSTMENT SECTION WITH NO
-- ADJUSTMENT DEPENDENCY AT ALL, and the split-dependency census (sect.1g, sect.2 Class A)
-- measured that misfiling as "the single biggest source of order violations and the
-- cheapest to fix". This file is that fix: the class authorities every family's doors ask
-- are created HERE, in the slice that ships first, so a D-b0 splice, a D-b1 wall and a
-- D-b3 producer can all reach one body instead of three copies.
--
-- WHAT IS LIFTED, verbatim from 0042-sections/s2-adjustments.sql (census sect.8's fragment
-- list, extended at each fragment's own leading header comment because those comments ARE
-- the body's argument and this extraction is byte-preserving):
--   * clara._acct_role_reserved      (s2 L45-94)     -- FA-ONLY SHELL, see the split note
--   * clara._assert_due_read_ctx     (s2 L96-164)    -- verbatim; zero dependencies
--   * clara._wdb_period_stamps       (s2 L166-289)   -- verbatim; a one-line registry
--   * clara._wdb_correction_posting_date (s2 L291-298) -- verbatim
--   * clara._wdb_iso_date_supported  (s2 L300-332)   -- verbatim
--   * clara._adj_line_eligibility_breach (s2 L420-476) -- verbatim
--   * clara._wdb_rerun_breach        (s2 L1321-1863) -- FA-ARM FORM, see the split note
-- WHAT STAYS IN D-b2: the other 35 s2 bodies (the template family, the poster, the due
-- oracle, the hook, the pair machine, the read RPCs) plus the two producer helpers
-- clara._wdb_suggestion_rule_hit / clara._wdb_suggestion_lines, which census sect.2 Class A
-- moves to D-b3 (their real family), not here.
--
-- ROLE SCOPING IS THIS FILE'S OWN (census hazard sect.7.4). In the whole unit s2 opened
-- `set role clara_fn_owner` at its L39 and NEVER reset -- s3 then relied on that role for
-- its first 2,650 lines. This slice opens its own scope and closes it at the end of the
-- file, so nothing downstream inherits a role by accident.

set role clara_fn_owner;

-- =====================================================================================
-- S2.0 (D-b0 SLICE) -- THE SHARED READER + THE SMALL PRIMITIVES.
-- =====================================================================================

-- THE ACCOUNT-ROLE RESERVATION READER (design SS2.1; [L2/15], [L2/8], [L3/8]).
--
-- ONE LEAF, ONE READER, THREE DOMAIN CALLERS. Wave D-a minted the `client:fa-roles` advisory
-- leaf (clara._fa_lock_roles) and clara._fa_reserved_roles as its FA-only census. D-b adds a
-- SECOND role-claiming domain (staff-advance enrolments) and TWO more role-claiming writers
-- (adjustment propose/retire), and the ladder ruled AGAINST a second leaf: two leaves means a
-- lock-ordering hazard between doors that already contend on one client. So the leaf is
-- REUSED and this reader is the shared, MESSAGE-NEUTRAL census over both domains -- every
-- caller owns its own refusal text, because "reserved by the FA register" and "reserved by an
-- active staff-advance enrolment" are different sentences to a human.
--
-- IT IS LOCK-FREE AND STABLE, ON PURPOSE [L2/8]. Taking the leaf inside the reader would put
-- an advisory acquisition on every posting and approve path that re-derives line eligibility
-- (the poster, hook arm (2)), and the pinned leaf census is "every door that WRITES
-- role-claiming state" -- the live bank belt, FA enrolment/retire, advance enrolment/retire,
-- and adjustment propose/retire. Those doors take clara._fa_lock_roles themselves, LEAF-LAST,
-- after the 203005004 client rung. Readers just read.
--
-- THE FA ARM IS EXACTLY 0041's LAW: active profiles UNION every register row this client has
-- ever carried, status-blind (a code a register row has ever named stays reserved forever --
-- retiring a profile does not release it).
--
-- THE ADVANCE ARM ADMITS RETIRED HISTORY [L2/8]. Only ACTIVE enrolments and the register rows
-- of ACTIVE enrolments reserve. A RETIRED enrolment must not block RE-enrolment of its own
-- code (SS3.1), and retirement already refuses while any advance on it is outstanding, so a
-- retired generation owns nothing live.
--
-- RETURN SHAPE (pinned -- SECTION S5's clara._fa_assert_code_unreserved recut and SECTION
-- S3's enrolment validation both consume it): (domain, role, owner_ref).
--   domain  'fa' | 'staff_advance'
--   role    'cost' | 'accum' | 'expense'        (fa)      | 'advance' (staff_advance)
--   owner_ref  the FA cost account that owns the role, or the advance account code.
-- [SPLIT D-b0 2026-08-04] THIS SLICE SHIPS THE FA-ONLY SHELL OF THE UNION. The advance arms below
-- (the two disjuncts over clara.staff_advance_accounts and clara.staff_advances) are
-- REMOVED here and D-b1 RE-CREATES this body with them added -- census sect.2 Class B, the
-- one genuine three-family object in the wave, whose only measured resolution is an FA-only
-- intermediate form plus a second create in the slice that ships the advance tables. NOTHING
-- ELSE CHANGES: the signature, the return shape (domain, role, owner_ref), the volatility,
-- the security-definer posture, the search_path and the FA disjunct are byte-exact, so every
-- consumer this slice ships (clara._fa_assert_code_unreserved's bank belt at S5.13,
-- clara._fa_role_claim_conflict at S5.15b, clara._adj_line_eligibility_breach above,
-- clara.upsert_fa_account_profile at S5.16, clara._draft_opening_item_core at S5.17,
-- clara._fa_reversal_blocked at S5.18) gets the SAME answer it would get from the full union
-- for every code the FA family holds -- and, until D-b1 exists, there is no advance
-- enrolment for the missing arms to have answered about. FINAL FORM: D-b1
-- (census sect.8's "L77-145 clara._acct_role_reserved re-created with the advance arms").
-- The paragraph immediately above ("THE ADVANCE ARM ADMITS RETIRED HISTORY") describes that
-- final form and is kept verbatim rather than edited, because it is the law the re-create
-- must satisfy; it is true of this body from D-b1 onward.
create function clara._acct_role_reserved(p_client uuid, p_code text)
  returns table(domain text, role text, owner_ref text)
  language sql stable security definer set search_path = clara, pg_temp as $$
  select 'fa'::text, rr.fa_role, rr.owner_asset_code
    from clara._fa_reserved_roles(p_client) rr
   where p_client is not null and p_code is not null and rr.account_code = p_code $$;
revoke all on function clara._acct_role_reserved(uuid, text) from public;

-- THE DUE-ORACLE ADMISSION PREDICATE (owner ruling 2026-08-03: WDB-R1 root-not-symptom +
-- WDB-R2 one-shared-predicate). ONE BODY ANSWERS "MAY THIS CALLER READ THIS CLIENT'S DUE
-- SCHEDULE, AND IF NOT, WHY", and BOTH members of the due-oracle family consult it:
-- clara.adjustment_run_due (0042, S2.4 below) and clara.depreciation_run_due (0041, LIVE IN
-- PRODUCTION since the D-a ceremony; recut in S5.14). The family carried TWO hand-rolled
-- copies of the same admission arithmetic and BOTH were wrong in the same way -- exactly the
-- shape WDB-R2 forbids. The answer is this predicate, not two point-patches free to drift
-- apart again. It sits beside clara._acct_role_reserved on purpose: same doctrine, one
-- derivation with many readers, and the ruling names that body as the precedent.
--
-- WHAT WAS WRONG. Both oracles guarded with `if v_jwt is not null and v_jwt <> v_firm then
-- raise`. clara.jwt_firm() selects only `status = 'active'` memberships, so it returns NULL
-- the instant a membership is revoked -- WHILE THE USER'S JWT IS STILL VALID AND STILL
-- PRESENTS A SUB. The guard passed on that null, and a SECURITY DEFINER body with
-- unconditional RLS visibility handed a removed employee another firm's schedule. The same
-- null admitted any claims-less session on either granted role.
--
-- WHY IT IS NOT A BARE NULL-REJECTION. clara.list_coding_lanes raises CLR03 on a null firm
-- and is RIGHT to -- it is granted only to human/agent roles and has no machine caller. These
-- two DO: packages/runtime/lib/leader.mjs sweeps them under `set role clara_runtime` carrying
-- NO JWT BY DESIGN, which is precisely why the null passed in the first place. A bare
-- null-raise would silently disable the daily sweep -- a worse outcome than the hole it
-- closes. So this predicate discriminates the CALLER, never the VALUE:
--   CLAIMS PRESENT (clara.jwt_sub() is not null) -> a HUMAN act, whatever role carries it.
--     Delegated to clara._human_ctx -- the SAME predicate every other verb in BOTH families
--     already uses (S2.2 propose/sign/retire, S2.8's reads, D-a's FA verbs). A revoked
--     membership raises ITS OWN CLR04 'actor has no active membership' there, so the revoked
--     reader is refused by the house's existing authority rather than by a rule invented
--     here. The viewer floor comes free and matches clara.list_adjustment_templates; viewer
--     is rank 0 (clara.role_rank), so NO lawful member loses an answer they had before.
--   NO CLAIMS AT ALL -> only the trusted runtime lane proceeds; anyone else takes the
--     clara.coding_lane wording, CLR03 'no valid read context'.
--
-- HOW THE RUNTIME LANE IS RECOGNISED -- the clara.get_wiki_page / clara.list_wiki_pages
-- precedent, the two OTHER definer bodies in this schema that must serve a JWT-less machine
-- caller. The `role` GUC is the witness, and it was MEASURED, not assumed: inside a SECURITY
-- DEFINER body current_user is clara_fn_owner (useless) and session_user is the login, but
-- current_setting('role') still reports what the session SET ROLEd into and SURVIVES the
-- definer boundary. pg_has_role(session_user, 'clara_runtime', 'member') was REJECTED as the
-- test: the rig connects as postgres, a member of every role, so it would have classified
-- every human cell as the machine lane and made this entire fix vacuously green.
--   session_user = 'clara_runtime_login' is the third arm because packages/runtime/lib/pools.mjs
-- issues its SET ROLE at checkout (N10) -- were that ever to regress, that login is still
-- unambiguously the runtime and the sweep must not die of a config slip. It widens nothing:
-- the login exists for no other purpose.
--
-- p_firm IS NULLABLE ON PURPOSE: the callers resolve the client's firm first and pass it even
-- when the client does not exist, so admission is decided BEFORE any caller learns whether a
-- client id exists. The null case is tested EXPLICITLY rather than left to `c.firm <> null`
-- evaluating to NULL -- the same three-valued trap S5.7 is in this migration to close.
create function clara._assert_due_read_ctx(p_firm uuid) returns void
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare c record;
begin
  if clara.jwt_sub() is null then
    -- THE MACHINE LANE: no claims at all. Only the runtime may read without a JWT.
    if coalesce(current_setting('role', true), 'none') = 'clara_runtime'
       or session_user in ('clara_runtime', 'clara_runtime_login') then
      return;
    end if;
    raise exception 'no valid read context' using errcode = 'CLR03';
  end if;
  -- THE HUMAN LANE: a live membership is REQUIRED. A revoked one raises CLR04 in here.
  c := clara._human_ctx(clara.role_rank('viewer'));
  if p_firm is not null and c.firm <> p_firm then
    raise exception 'client is not in your firm' using errcode = 'CLR11';
  end if;
end $$;
revoke all on function clara._assert_due_read_ctx(uuid) from public;

-- =====================================================================================
-- THE ADJUSTMENT LANE'S CORRECTION DATE, AS ONE BODY (as-built ladder round 5 -- THE
-- CORRECT-AND-RE-RUN DOUBLE, the worst defect of the ladder). MEASURED, not argued: an
-- annual template accruing RM50,000 at 2025-12-31, corrected in Aug 2026 and re-run, left
-- the FY2025 expense at RM100,000.00 and the FY2025 accrual liability at RM100,000.00 --
-- on BOTH lanes (solo and auto-reversing), permanently, with the due oracle re-proposing it.
--
-- IT IS A COMPOSITION DEFECT: NEITHER LAW WAS WRONG.
--   * clara._adj_run_occurrence_core stamps every occurrence posting_date = period_end. An
--     accrual FOR a period belongs IN that period. Correct, and the lane's whole premise.
--   * clara.reverse_entry (and clara._pair_reverse_core) date the correction at MYT today.
--     You do not silently post a correction back into a period you have already reported.
--     Correct, and house law since 0041 S4.4.
-- Composed, they touch ONE number on TWO clocks. The correction never enters the period it
-- corrects; the period therefore stays visibly un-corrected while the ENTRY-level truth
-- (reversed_by) says it is corrected; the due oracle re-proposes the period on the entry
-- truth; and the re-run adds a SECOND occurrence at period_end. The adjustment lane has no
-- register and no tie -- unlike the FA lane, whose clara._fa_own_ledger_periods already dates
-- an unwind at `coalesce(o.period_end, d.period_end)`, i.e. WITH the thing it unwinds -- so
-- nothing in this product could ever have shown it.
--
-- THE RULING, and what it rejected. Four remedies were on the table. Refusing the re-run
-- alone (or teaching the oracle not to re-propose) leaves the corrected period carrying the
-- OLD, wrong figure with the correction stranded in a later year -- a different wrong number,
-- not a right one. Re-dating clara.reverse_entry globally would move every correction in the
-- product into a closed period. What is left is the D-a idiom: DATE THE CORRECTION FROM THE
-- THING IT CORRECTS, BY CONSTRUCTION, SCOPED TO THIS LANE. That is not a new doctrine here --
-- this lane's FORWARD door already writes into the period at period_end, and the pair
-- machine already derives its mirror's date (period_end + 1) from the occurrence rather than
-- from a clock. The correction is simply the third entry of the same act, and the act has one
-- clock: the period's.
--
-- ONE DERIVATION, EVERY DOOR, EVERY LANE (WDB-R2; widened by as-built ladder round 6). This
-- body is the only place that answers "what date must a correction of THIS entry carry", and
-- every correction door consults it: clara._pair_reverse_core (S2.6, both halves) and
-- clara.reverse_entry (SECTION S5.9, whose splice passes its own MYT expression as p_default).
-- Both adjustment roles are covered on purpose: an occurrence's correction lands on period_end,
-- its auto-reversal mirror's correction on period_end + 1, so the accrual month and the release
-- month each clear themselves.
--
-- ROUND 6 TURNED A LANE KEY INTO A CLASS KEY, and that is the whole lesson of the round. The
-- round-5 cut asked `flags ? 'recurring_adjustment'` -- a LANE key -- while a SIBLING poster
-- carries the identical shape under a different key. MEASURED on a rig, not inferred: a monthly
-- straight-line asset (360,000 sen over 36 months), month 1 corrected through
-- clara.reverse_entry so the correction landed on MYT today, the D-a due oracle re-proposing
-- that month, and the re-run AUTO-POSTING with no human in the loop -- the month then carried
-- 20,000 sen of accumulated depreciation and 20,000 of expense against a 10,000 charge, and
-- clara.fa_register_tie certified it at accum_diff_cents = 0 because the register had been made
-- wrong in exactly the same way the ledger was. A class-level remedy scoped by one lane's flag
-- key is not a remedy; it is a second copy of the defect, waiting for the sibling.
--
-- THE KEY IS A REGISTRY, NOT A LANE. clara._wdb_period_stamps() is the ONE list of stamps a
-- period-dated machine posting carries, and SECTION S5's census asserts that list against the
-- machine posters actually present in the live catalog -- so a THIRD poster cannot be added
-- without either joining the registry or failing the migration. That is what stops this fix
-- being bypassed the way round 5's was.
--
-- IT IS STILL NOT A GLOBAL RE-DATING and structurally cannot become one: for an entry carrying
-- none of the registered stamps it returns p_default UNCHANGED -- byte-identically the date the
-- caller would have written on its own (cell x42.cd5 proves it on an ordinary entry).
--
-- IT IS NOT THE ENFORCEMENT. Doors this migration does not own still exist
-- (clara.approve_wrong_client_correction mints its reversal at clara._book_today() -- SECTION
-- S5.21 rebuilt it off the session `current_date` this comment used to name, and MEASURED on the
-- applied catalog that body now contains clara._book_today() and no current_date at all -- but
-- it still does NOT consult clara._wdb_correction_posting_date, so a correction it writes is
-- dated TODAY rather than at the period-dated entry it corrects), so satisfying the invariant at
-- the doors is not the same as guaranteeing it. The guarantee is clara._wdb_rerun_breach below,
-- asked at the ONE gate every re-run passes -- in BOTH lanes.
--
-- ROUND 7 ADDED THE THIRD MEMBER, AND IT IS THE SAME LESSON A THIRD TIME. Round 5's remedy sat
-- on one LANE; round 6 widened it to a REGISTRY and enrolled the depreciation run -- and left
-- the OTHER body that writes period-dated fixed-asset charge rows outside it. MEASURED on a rig
-- (probe r7x1/p1), not inferred: an asset bought in month -3, charged through month -2, then
-- DISPOSED on 2026-07-18. clara.dispose_fixed_asset drafts the disposal at
-- posting_date = the disposal date and clara._fa_on_approve mints the disposal-month STUB
-- charge row at effective_date = that same date (0041:2446). The disposal is then reversed --
-- a lawful act this product offers, design SS2.4 arm 3c -- and the mirror was dated MYT TODAY
-- (2026-08-04), because 'fa_disposal' was not in this array, so
-- clara._wdb_correction_posting_date handed clara.reverse_entry's own default straight back.
-- clara._fa_on_approve arm (3b) effective-dates the UNWIND row at that mirror's posting date,
-- so the register ended holding a July charge at 2026-07-18 unwound at 2026-08-04.
--
-- WHAT THAT COSTS, and why it is not merely untidy. The two rows are the same act's two halves,
-- and clara._fa_accumulated_at (the books' legal, effective-dated read) counts the charge for
-- every date in [2026-07-18, 2026-08-04). The disposal reversal frees July for re-charging
-- (clara._fa_range_covered reads is_live, and the unwind flipped the original dead), so the
-- sweep re-charges July at 2026-07-31 -- INSIDE that window -- and every as-of read from
-- 2026-07-31 to 2026-08-03 carries the month TWICE. That is the round-6 double, arrived at
-- through a door round 6 did not enrol. clara._wdb_rerun_breach's fixed-asset arm sees it and
-- refuses, correctly -- but it refuses EVERY period of EVERY asset of that client, and
-- clara.fa_depreciation is append-only (clara._tf_fa_depreciation_append_only permits only the
-- is_live true->false flip, and no body in this migration UPDATEs it), so the refusal is
-- IRREPARABLE: the client's whole depreciation sweep is bricked by one lawful disposal reversal.
--
-- REGISTERING THE STAMP IS THE ROOT FIX AND IT CLOSES BY CONSTRUCTION. With 'fa_disposal' in
-- the registry the mirror inherits the DISPOSAL entry's posting_date, which IS the disposal
-- date, which IS the stub row's effective_date -- charge and unwind land on one date, the arm
-- is silent, and the re-charge cannot overlap a window that no longer exists. The identity is
-- structural, not coincidental: clara.dispose_fixed_asset writes posting_date = p_disposal_date
-- and the flags proposal's disposal_date from the same argument, clara.revise_entry carries no
-- posting_date parameter at all, and 0041's revise wall refuses an fa_disposal draft outright.
--
-- WHAT WAS REJECTED, measured rather than argued. Codex's round-7 remedy was to keep the
-- disposal outside the registry and weaken the fixed-asset arm to CADENCE-PERIOD equivalence
-- ("same month" rather than "same date"). It does not hold: a stub is effective-dated at the
-- DISPOSAL date, so two disposals in one month give charge 07-18 / unwind 07-25 / re-stub 07-20
-- -- same month, every pair, and 07-20..07-24 still carries the month twice. The arm's strict
-- equality is the correct statement of the invariant and it stays.
--
-- THE LEGACY HAZARD IS NAMED, NOT PAPERED OVER. This fix is forward-only. A dispose-then-reverse
-- pair CREATED UNDER 0041's live law already holds a mismatched pair of rows, and nothing here
-- can repair it -- the table is append-only and appending a second, correctly-dated unwind does
-- not remove the first from the arm's join. Such a client arrives at this migration already
-- bricked. The detection query is one statement and it is stated here so it is never re-derived:
--   select o.client_id, count(*) from clara.fa_depreciation o
--     join clara.fa_depreciation u on u.unwind_of = o.id
--    where u.effective_date is distinct from o.effective_date group by 1;
-- Any row it returns is a pre-existing breach; the pre-flight decision belongs to the deploy
-- ceremony, not to this body.
create function clara._wdb_period_stamps() returns text[]
  language sql immutable as $$
  select array['recurring_adjustment', 'depreciation_charges', 'fa_disposal'] $$;
revoke all on function clara._wdb_period_stamps() from public;

create function clara._wdb_correction_posting_date(p_original uuid, p_default date)
  returns date
  language sql stable security definer set search_path = clara, pg_temp as $$
  select coalesce((select e.posting_date from clara.journal_entries e
                    where e.id = p_original
                      and e.flags ?| clara._wdb_period_stamps()),
                  p_default) $$;
revoke all on function clara._wdb_correction_posting_date(uuid, date) from public;

-- THE SUPPORTED DATE DOMAIN OF THE PERIOD-STAMP GRAMMAR (as-built ladder round 8).
--
-- clara._wdb_rerun_breach compares a stamp's period bounds as ISO TEXT under `collate "C"`, and
-- states in-source why that is exact: "equal-length ISO strings order byte-for-byte exactly as
-- the dates do". MEASURED on this rig (PG 17), that claim holds for every AD date the four-digit
-- form can spell and breaks in exactly two places, both of which the `date` type accepts and the
-- template family accepted end to end:
--   * BC. jsonb_build_object serialises date '0001-01-01 BC' as '0001-01-01 BC' -- 13 characters,
--     outside the gate's four-digit ISO regex -- so the gate's fail-CLOSED "an entry that cannot
--     state its own period is in the set" arm puts that entry in EVERY period's set, for the
--     client's whole calendar. MEASURED: a BC-dated occurrence approved on a fresh client made
--     the gate answer shape_already_met for 2026-05-01..2026-05-31, naming an entry dated
--     0001-01-31 BC. The template self-bricks and so does every colliding template on that
--     client. (to_char makes it worse rather than better: it DROPS the era, so
--     to_char(date '0001-01-01 BC','YYYY-MM-DD') = '0001-01-01' -- a BC period and AD year 1
--     become indistinguishable on the caller's side of the comparison.)
--   * FIVE-DIGIT YEARS. to_char(date '10000-03-04','YYYY-MM-DD') = '10000-03-04' and jsonb
--     agrees -- eleven characters, un-truncated -- so the strings stop being equal-length and
--     byte order stops agreeing with date order ('10000-03-04' <= '2026-07-31' is TRUE while the
--     date is 7,974 years LATER). It also falls outside the regex, with the same global in-set
--     consequence.
-- `infinity` / `-infinity` are date values too, and both fall outside the bounds below.
--
-- SO THE DOMAIN IS [0001-01-01 AD, 9999-12-31] and it is stated ONCE, here, rather than as four
-- copies of a bounds test at the doors (WDB-R2). It is a PREDICATE, not an asserter: each door
-- owns its own refusal grammar -- propose refuses CLR10, the poster CLR38 -- and a shared body
-- that raised would have had to be handed both, which is how a refusal ends up speaking the
-- wrong family's language. NULL is IN the domain: nullability is each door's own question
-- (a template's end_date is legitimately absent) and this body must not answer it.
create function clara._wdb_iso_date_supported(p_d date) returns boolean
  language sql immutable as $$
  select p_d is null or (p_d >= date '0001-01-01' and p_d <= date '9999-12-31') $$;
revoke all on function clara._wdb_iso_date_supported(date) from public;

-- LINE ELIGIBILITY, AS ONE BODY (design SS2.1 -- "the SOLE soft-birth immunity of the
-- auto-mirror"). Returns NULL when every line is eligible; otherwise the FIRST breach as
-- {account_code, axis, ...} so each caller can raise its own sentence:
--   propose  -> CLR10 template_line_ineligible (an argument refusal, remedy: pick another code)
--   poster   -> CLR38 template_line_ineligible (a sequencing refusal, remedy: retire/re-propose)
--   arm (2)  -> CLR39 adjustment_stale, axis 'line_eligibility'
--
-- WHY THE MIRROR NEEDS NOTHING ELSE. The auto-reversal mirror carries the SAME account codes
-- as its occurrence, leg-swapped. Every register that soft-births from an approval keys on an
-- ENROLLED account -- clara._fa_on_approve arm (4) on an active FA cost profile, SECTION S3's
-- clara._adv_on_approve arm (3) on an active advance enrolment. A template line can be
-- NEITHER, at propose, at every occurrence and again at approve, so the mirror's credit and
-- debit legs are structurally invisible to both belts. That is the whole immunity: it is an
-- ELIGIBILITY property, not a skip, which is why a violation RAISES here instead of being
-- routed around anywhere downstream.
--
-- The five conditions, in the design's order: exists - is_active - account_class IS NULL
-- (non-control) - not this client's bank code - unreserved per clara._acct_role_reserved.
create function clara._adj_line_eligibility_breach(p_client uuid, p_lines jsonb)
  returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare x jsonb; v_code text; a record; rr record;
begin
  for x in select value from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    v_code := x ->> 'account_code';
    select ca.account_code, ca.is_active, ca.account_class, ca.is_bank_account
      into a from clara.coa_accounts ca
      where ca.client_id = p_client and ca.account_code = v_code;
    if not found then
      return jsonb_build_object('account_code', v_code, 'axis', 'account_unknown');
    end if;
    if not a.is_active then
      return jsonb_build_object('account_code', v_code, 'axis', 'account_inactive');
    end if;
    if a.account_class is not null then
      return jsonb_build_object('account_code', v_code, 'axis', 'control_account',
        'account_class', a.account_class);
    end if;
    -- BOTH bank instruments are asked, and either one refuses. coa_accounts.is_bank_account is
    -- the stamp clara.add_bank_account writes; clara.bank_accounts.coa_account_code is the
    -- binding itself. They cannot legitimately disagree, and if they ever do the SAFE answer
    -- is to refuse -- a template posting into a bank control is a reconciliation break.
    if a.is_bank_account
       or exists (select 1 from clara.bank_accounts ba
                  where ba.client_id = p_client and ba.coa_account_code = v_code) then
      return jsonb_build_object('account_code', v_code, 'axis', 'bank_account');
    end if;
    select r.domain, r.role, r.owner_ref into rr
      from clara._acct_role_reserved(p_client, v_code) r limit 1;
    if found then
      return jsonb_build_object('account_code', v_code, 'axis', 'account_reserved',
        'domain', rr.domain, 'role', rr.role, 'owner_ref', rr.owner_ref);
    end if;
  end loop;
  return null;
end $$;
revoke all on function clara._adj_line_eligibility_breach(uuid, jsonb) from public;

-- =====================================================================================
-- S2.1b -- IS THIS PERIOD SOUND TO RUN AGAIN? (as-built ladder round 5, recut to a CLASS
-- authority in round 6; the enforcement half of the correct-and-re-run ruling stated at
-- clara._wdb_correction_posting_date.)
--
-- THE INVARIANT, in one sentence: for one client and one stretch of calendar the books may carry
-- at most ONE net machine-posted charge on any given (account, side) -- so every approved posting
-- that COLLIDES with the caller's shape over an overlapping period and has since been corrected
-- must have been neutralised ON THE VERY date it was booked at, no half of it may still be
-- standing, and none of it may still be standing UNCORRECTED under a different authority, before
-- any lane posts into it again. (Round 8 restated "the same shape" as "a colliding shape"; the
-- argument is at clara._wdb_shape_overlap and the measurement is two [WDB-G13] edits that
-- re-accrued ten standing months between them.)
--
-- WHY IT IS ONE BODY WITH TWO ARMS AND NOT TWO BODIES (WDB-R2, and the round-6 finding).
-- clara._acct_role_reserved is the house precedent: ONE authority, one answer shape, a per-
-- DOMAIN arm inside it, consulted by every claiming door. The same shape is used here because
-- the two lanes keep their evidence in different books -- the adjustment lane in
-- clara.journal_entries under its stamp, the fixed-asset lane in its own clara.fa_depreciation
-- register -- while the QUESTION ("is anything of this period still standing un-neutralised on
-- its own date?") is identical. Two bodies is exactly how round 5's remedy came to exist on one
-- lane only; p_stamp selects which BOOKS to read, never whose template or whose authority wrote
-- the row, and an unregistered stamp RAISES rather than answering "sound".
--
-- WHY THE ENFORCEMENT IS HERE AND NOT AT THE CORRECTION DOORS. The doubling can only enter
-- the books through ONE act -- a SECOND occurrence being posted into a period that already
-- carries an unbalanced first one -- and every such act goes through
-- clara._adj_run_occurrence_core's admission (both twins call it, both cadences, both lanes).
-- The correction doors are many, this migration owns only two of them, and a third already
-- exists: clara.approve_wrong_client_correction takes caller-named entry ids, joins them to no
-- document and is granted to bookkeepers. It dates its reversal at clara._book_today() -- the
-- house MYT legal date, which SECTION S5.21 splices in over the session `current_date` this
-- comment used to name (MEASURED on the applied catalog: the live body holds
-- clara._book_today() and no current_date) -- but it is deliberately NOT wired to
-- clara._wdb_correction_posting_date, so its correction of a period-dated posting still lands
-- on TODAY rather than on the corrected entry's own date. Fixing the clock did not make the
-- door safe for this invariant, which is the whole point: a rule enforced only where the build
-- happens to write it is a point-fix; this is the gate.
--
-- THE SUBJECT IS DELIBERATELY WIDER THAN THE INSTANCE (the round-5 lesson: a correctly-placed
-- guard with a too-narrow predicate is still a point-fix; the round-6 lesson: a predicate keyed
-- on a LANE or an IDENTITY is too narrow by construction). Three axes come out of it:
--   correction_out_of_period  a corrected posting whose correction sits on a different date.
--                             The re-run would add its figure on top of a standing one.
--   pair_half_uncorrected     the set is MIXED -- something in it has been corrected and
--                             something else in it is still standing. On the adjustment lane
--                             that is a MIRROR whose occurrence was corrected without it, a
--                             shape clara._wdb_reversal_blocked arm (a) forbids at
--                             clara.reverse_entry but which no wall stands over at the other
--                             doors. The re-run then books a second accrual AND a second
--                             release against ONE surviving release: the accrual month looks
--                             right and the release month is wrong, which is the harder half to
--                             ever notice. STATED AS "MIXED" RATHER THAN "ANY STANDING HALF"
--                             deliberately: an entirely-standing set is not a defect, it is a
--                             period that is simply MET, and each lane's own met-ness test owns
--                             that -- which is why the fixed-asset lane can share this body
--                             without its noop-on-a-charged-period behaviour changing.
--   shape_already_met         an approved, UN-corrected posting standing under some other
--                             authority over an OVERLAPPING period shares at least one
--                             (account, side) with the caller's shape. This is the round-6
--                             generation bypass: the caller's own identity-keyed met-ness test
--                             says "unmet" because the standing entry belongs to a retired
--                             predecessor, and the books say otherwise. Round 8 widened the
--                             comparison from equality to intersection and the payload now
--                             names the colliding elements, because "these collide" without
--                             "on WHAT" is a remedy nobody can follow.
--
-- Returns NULL when the period is sound. The adjustment arm's access path is per-template so it
-- rides ix_je_adj_occurrence (ABI SSC) exactly as the round-5 cut did -- but the DECISION is
-- per-shape, never per-template. Identity is allowed to be an index key; it is not allowed to
-- be the question.
create function clara._wdb_rerun_breach(p_client uuid, p_stamp text, p_shape text[],
    p_period_start date, p_period_end date) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare e record; d record; v_corr date;
        v_standing int := 0; v_corrected int := 0;
        v_first_standing jsonb; v_met jsonb;
        v_met_entry uuid; v_door jsonb; v_wall text;
        v_met_tpl text; v_met_tpl_status text;
        v_collide_all text[];
begin
  -- FAIL CLOSED ON AN UNREGISTERED STAMP. A fourth period-dated poster that reaches this body
  -- with its own key must be adjudicated into clara._wdb_period_stamps(), not silently told its
  -- period is sound -- "silently sound" is precisely how the fixed-asset lane spent a whole
  -- round outside round 5's remedy.
  if p_stamp is null or not (p_stamp = any (clara._wdb_period_stamps())) then
    raise exception 'clara._wdb_rerun_breach was asked about the period stamp "%", which is not in the registry', coalesce(p_stamp, '<null>')
      using errcode = 'CLR10', detail = '{"reason":"period_stamp_unregistered"}';
  end if;
  -- ...AND FAIL CLOSED AGAIN ON A REGISTERED STAMP WITH NO ARM (round 7). The registry answers
  -- "is this a period-dated posting whose correction must ride its own date" -- a question about
  -- an ENTRY's flags. THIS body's p_stamp answers a different question: "which BOOKS hold the
  -- evidence". They are not the same question, and round 7 measured what happens when one
  -- enumeration is made to serve both without an exhaustive dispatch: adding 'fa_disposal' to
  -- the registry passed the check above and then FELL THROUGH to the adjustment arm, which reads
  -- clara.journal_entries under a stamp no adjustment entry carries and answers "sound" for a
  -- fixed-asset question. That is a fail-open manufactured by the fix itself. So the dispatch
  -- below is EXHAUSTIVE over the registry and anything unclaimed raises here, and SECTION S5's
  -- S5.15e census asserts from the catalog that every registered stamp is named in this body --
  -- so a fourth stamp cannot reach production without an arm, at BUILD time rather than at the
  -- first unlucky sweep.
  --
  -- BOTH FIXED-ASSET STAMPS SHARE ONE ARM because they share one book. A disposal's stub charges
  -- are clara.fa_depreciation rows exactly as a run's charges are (0041:2446 mints them in the
  -- same table with the same columns), so "read the client's own charge rows" already covers
  -- them; the arm is chosen by which ledger holds the evidence, never by which verb wrote it.
  if p_stamp = any (array['depreciation_charges', 'fa_disposal']) then
    -- THE FIXED-ASSET ARM READS THE CLIENT'S OWN CHARGE ROWS, never an authority id -- the
    -- instrument clara._fa_oldest_unmet_period already uses to decide what is due. A charge row
    -- and its unwind are the register's two halves of one act, and the register's as-of view
    -- nets to zero only when they carry the SAME effective_date. An unwind effective-dated
    -- elsewhere leaves the charged period reading its old figure while the poster's coverage
    -- probe reports the month uncovered -- so the month is re-charged on top of money that
    -- never left. Scoped to rows this run could re-charge (period_start <= p_period_end):
    -- later rows are not this run's business.
    --
    -- NO MIXED ARM HERE, and it is not an omission: clara._fa_on_approve unwinds EVERY live row
    -- of the entry it is reversing in one statement, so a partially-unwound entry is not a
    -- state this schema can hold. If a future writer makes it reachable, the arm belongs here.
    for d in
      select o.id as charge_id, o.asset_id, o.period_start, o.period_end,
             o.effective_date as charged_at, u.effective_date as unwound_at, o.entry_id
        from clara.fa_depreciation o
        join clara.fa_depreciation u on u.unwind_of = o.id
       where o.client_id = p_client
         and o.period_start <= p_period_end
         and u.effective_date is distinct from o.effective_date
       order by o.period_start, o.id
       limit 1
    loop
      return jsonb_build_object('axis', 'correction_out_of_period', 'entry_id', d.entry_id,
        'role', 'charge', 'posting_date', d.charged_at,
        'correction_posting_date', d.unwound_at, 'asset_id', d.asset_id,
        'period_start', d.period_start, 'period_end', d.period_end);
    end loop;
    return null;
  end if;
  if p_stamp <> 'recurring_adjustment' then
    raise exception 'clara._wdb_rerun_breach was asked about the registered period stamp "%", which has no books arm in this body', p_stamp
      using errcode = 'CLR10', detail = '{"reason":"period_stamp_no_rerun_arm"}';
  end if;

  -- [SPLIT D-b0 2026-08-04] THE ADJUSTMENT ARM IS NOT IN THIS SLICE, SO THE 'recurring_adjustment'
  -- STAMP TAKES THE SAME "registered stamp with no books arm" REFUSAL AS ANY OTHER
  -- UNCLAIMED ONE. NARROWED, NEVER WEAKENED. The arm that stood here reads
  -- clara.journal_entries under the recurring_adjustment stamp and
  -- clara.adjustment_templates for its remedy, and it calls clara._wdb_entry_shape,
  -- clara._wdb_shape_overlap, clara._adj_correction_door, clara._wdb_overlapping_siblings
  -- and clara._wdb_template_ancestry -- every one of them a D-b2 body over a D-b2 table.
  -- The TWO FIXED-ASSET ARMS above are byte-exact, and census sect.2 Class D measured that
  -- BOTH of this slice's callers (clara._fa_oldest_unmet_period at S5.15c and
  -- clara._fa_run_period_core at S5.15d -- the only two call sites) pass ONLY
  -- p_stamp='depreciation_charges', so their answer is identical to the whole unit's.
  -- FALLING THROUGH TO A SILENT NULL WAS THE ALTERNATIVE AND IS REFUSED on this body's own
  -- stated law: a registered stamp with no books arm answering "sound" is the fail-OPEN
  -- round 7 measured and the one shape the body whose whole job is to fail closed may never
  -- take. The registry clara._wdb_period_stamps() is UNCHANGED and still lists all three
  -- stamps, so the S5.15e (3) ratchet and its (3b) "every registered stamp is named by an
  -- arm of this body" check both still read this body's own text and still pass -- the
  -- literal 'recurring_adjustment' appears in the guard immediately above and in this
  -- comment. FINAL FORM: D-b2 re-creates this body WHOLE, adjustment arm restored
  -- (census sect.2 Class D, sect.8's "Full-form re-create of clara._wdb_rerun_breach").
  raise exception 'clara._wdb_rerun_breach was asked about the registered period stamp "%", which has no books arm in this body', p_stamp
    using errcode = 'CLR10', detail = '{"reason":"period_stamp_no_rerun_arm"}';
end $$;
revoke all on function clara._wdb_rerun_breach(uuid, text, text[], date, date) from public;

reset role;

-- #####################################################################################
-- ##### SECTION S5 -- THE D-a RESIDUAL FIXES + THE NON-BANK CHAIN-OF-RECUT REGISTER ####
-- #####################################################################################
-- Design of record: docs/plan/wave-d-b-design.md SS6 (the four D-a residuals, WDB-G10/G11/
-- G12/G14) and SS8's chain-of-recut register MINUS its bank half (section 4 owns every
-- bank-domain recut). The builder ABI (docs/plan/wave-d-b-design-abi.md) SSF is LAW for
-- errcode + detail.reason strings; SSB names the three D-b flags keys.
--
-- THE CHAIN-OF-RECUT LAW, RESTATED IN THIS FILE. Every body below is re-emitted from its
-- LIVE pg_get_functiondef text fetched from the CATALOG at apply time -- never from a
-- migration file, because 0041 already spliced several of these and only the catalog carries
-- the result. Each splice is: idempotency probe (the new marker must NOT already be present)
-- -> pre-existing marker census at EXACT counts MEASURED on the live 0001..0041 catalog
-- -> the anchor's own occurrence count asserted EXACTLY -> replace + execute -> postcheck
-- (new marker present at its exact count, the OLD form gone by position()=0 where a vacuous
-- replace is possible, the census re-run at the same counts, owner unchanged). Counted, not
-- merely probed: replace() rewrites EVERY occurrence, so a drifted body holding two copies
-- of an anchor would take two splices while a bare position()>0 postcheck stayed green
-- (0038:7785-7790 / 0040:7004-7006 / 0041:4458-4460).
--
-- ASSEMBLY ADJUDICATIONS APPLIED IN THIS SECTION (each recorded because it resolves a point
-- the design left to the build; all three are reported to the orchestrator, not resolved
-- silently):
--   S5-A1. THERE IS NO LIVE LINEAGE-DEPTH READER. The 64-edge law is an INLINE hop counter
--          living inside THREE readers -- clara._fa_lineage_walk (0041:1165, `v_hops >= 64`
--          checked BEFORE taking the next edge), clara._fa_lineage_first_due_month
--          (0041:1622, `v_hops > 64` with the counter seeded at the node reached), and
--          clara._fa_disposal_stub's ancestor walk (0041:1780, seeded at one). All three
--          admit exactly 64 supersede edges and refuse the 65th. clara._fa_reversal_lineage
--          is a DOWNWARD closure (an entry's births and their clean revision chain) and
--          carries no cap at all, so it cannot answer a depth question. S5.2 therefore adds
--          clara._fa_assert_lineage_mintable, which reproduces clara._fa_lineage_walk's
--          counting convention EXACTLY and refuses as a void assertion -- it never returns a
--          depth, so a saturated walk can never be mistaken for an answer.
--   S5-A2. THE K6 WRITER GUARD TAKES CLR37, NOT CLR31. The opening-seed family owns CLR31
--          (0041 assembly adjudication 1) and every other refusal at that site raises it --
--          but ABI SSF pins the 65th-edge refusal to CLR37 / fa_lineage_too_deep for ALL
--          writers, and the three READERS already raise exactly that pair. One lineage law,
--          one code: a professional who hits the cap from the seed door and from the revise
--          door must be able to catch the same thing.
--   S5-A3. ADDITIVE REFUSAL TOKENS (named deviations, the 0041 S4.7 precedent -- that splice
--          minted fa_proposal_not_revisable for the same reason). ABI SSF names no token for
--          set_client_fy_end's annual-cadence guard and none for a bank account colliding
--          with an ACTIVE staff-advance enrolment, so this section mints:
--            fy_end_locked_by_annual_cadence (CLR38, S5.12) and
--            coa_account_advance_reserved     (CLR10, S5.13).
--          The live FA token coa_account_fa_reserved is preserved byte-for-byte on the FA
--          arm, which keeps 0041's contract intact.
--
-- WHAT THIS SECTION DOES NOT DO: it never touches workflows/, never widens a wake authority,
-- and never writes a books row. Every number it surfaces is read from a DB-owned reader.
--
-- [SPLIT D-b0 2026-08-04] THIS FILE IS THE D-b0 SLICE OF SECTION S5. Every block below is byte-exact
-- from 0042-sections/s5-residuals.sql unless it carries its own `[SPLIT D-b0]` note. The
-- blocks the split-dependency census sect.8 EXCLUDES from this slice are named where they
-- would have stood, with the slice that owns them:
--   S5.8  clara._subledger_on_approve  -> SPLIT IN TWO (census sect.2 Class C): D-b1 adds the
--         clara._adv_on_approve line, D-b2 adds clara._adj_on_approve ABOVE it. D-b0 ships NO
--         hook edit at all -- the two `perform` lines are UNCONDITIONAL and PL/pgSQL resolves
--         neither at CREATE time, so a D-b0 that shipped this splice alone would break every
--         approve path in production at the first call.
--   S5.9  clara.reverse_entry          -> SPLIT IN TWO. The reversal WALL term
--         (clara._wdb_reversal_blocked) is D-b1's; the CORRECTION-DATE term
--         (clara._wdb_correction_posting_date) ships HERE as S5.9-b0, because this slice also
--         ships the enforcement that depends on it (S5.15c/S5.15d put both fixed-asset doors
--         on clara._wdb_rerun_breach) and omitting it was MEASURED to brick the depreciation
--         sweep -- see that block's own note. The census's exclusion list excludes only
--         "S5.9(reversal-wall half)" and its D-b2 bullet says "if not already in D-b0".
--   S5.10 / S5.10a clara.revise_entry  -> D-b2 (it reads clara.adjustment_pair_reversals).
--   S5.11 clara.withdraw_draft         -> D-b2 (same table).
--   S5.12 clara.set_client_fy_end      -> SPLIT BY ARM: the client advisory RUNG and the
--         clara.fa_depreciation_authorities guard arm are HERE (both read 0041 objects only);
--         the clara.adjustment_templates arm, its local v_blocked_name and its half of the
--         token are D-b2's. Adjudicated 2026-08-04 after cell x41.f3 measured that deferring
--         the authority arm cost a claim with no later-slice dependency at all.
--   S5.19 clara.fa_register_tie        -> SPLIT BY ARM. The GL-SIDE recut is D-b1's (it reads
--         clara.staff_advance_accounts, clara.staff_advances and clara._adv_enrolment_at); the
--         WALK GATE ships HERE as S5.19-b0, because its predicate clara._fa_included_at is an
--         0041 body and the gate is the PAIR of S5.15, which this slice also ships -- see that
--         block's own note for the measurement (a released code taken by a foreign register
--         puts an unclearable permanent difference into the tie for the whole D-b0-only
--         window). Its TWO NEW HELPERS (clara._acct_role_reserved_at,
--         clara._fa_gl_leg_foreign) are lifted out and ship HERE too, because census sect.1g
--         files both as D-b0 objects and S5.19b's roster (A3) reads them.
-- ALSO NARROWED HERE: adjudication S5-A3 above mints TWO additive refusal tokens. BOTH are
-- minted in this slice -- `coa_account_advance_reserved` (CLR10, S5.13) once, and
-- `fy_end_locked_by_annual_cadence` (CLR38, S5.12) once, on the depreciation-authority arm
-- alone; D-b2 mints it a SECOND time when it adds the clara.adjustment_templates arm. The
-- adjudication text is kept verbatim because it is the record of the decision, not a claim
-- about this slice's contents.

-- =====================================================================================
-- S5.1 -- clara.fixed_assets.cost_cents SET NOT NULL (design SS6.3; WDB-G12).
--
-- THE PRESTATE PROBE COMES FIRST, AND IT NAMES A REMEDY. A bare ALTER on live data would
-- abort the whole migration with Postgres's own "column contains null values" and no
-- instruction anybody could follow. The probe below enumerates the offending row ids, so the
-- operator's next act is obvious rather than archaeological. It runs as the MIGRATION role
-- (a pure read) before the fn-owner region opens.
--
-- HOW A NULL COST COULD EVER HAVE BEEN WRITTEN: the 0017 carry-down validator tests
-- `v_cost<=0`, which is NULL -- not FALSE -- when the baseline states no cost_cents, and a
-- three-valued OR chain whose other disjuncts are all FALSE evaluates to NULL, which
-- plpgsql's `if` treats as false. S5.7 closes that door at BOTH validator arms; this closes
-- it at the column, so no future writer can reopen it from a direction nobody predicted.
-- =====================================================================================
do $s5_1_pre$
declare v_n int; v_ids text;
begin
  select count(*)::int, string_agg(f.id::text, ', ' order by f.id) into v_n, v_ids
    from clara.fixed_assets f where f.cost_cents is null;
  if v_n <> 0 then
    raise exception '0042 S5.1 prestate: % fixed_assets row(s) carry a NULL cost_cents (%) and 0042 makes the column NOT NULL. A register row with no cost cannot be depreciated, disposed or tied -- it is not a partially-known asset, it is an un-answerable one. REMEDY, per row: reverse the acquisition entry that created it (clara.reverse_entry) or K-correct the carry-down that seeded it (the K-family, clara.approve_opening_correction), then re-issue the row with a stated cost; re-run this migration afterwards.', v_n, v_ids
      using errcode = 'CLR10';
  end if;
  raise notice '0042 S5.1 prestate OK: no fixed_assets row carries a NULL cost_cents.';
end $s5_1_pre$;

set role clara_fn_owner;

alter table clara.fixed_assets alter column cost_cents set not null;

-- THE NOW-DEAD DISJUNCT IS LEFT IN PLACE, DELIBERATELY (design SS6.3). ck_fa_residual reads
--   check (residual_cents is null or cost_cents is null or residual_cents <= cost_cents)
-- (0003:175). Its `cost_cents is null` arm is unreachable from this point on. It is NOT
-- dropped: rewriting a live CHECK to remove an arm that can no longer fire buys nothing, and
-- it would make the constraint definition differ from the one every prior migration, test and
-- census in this repo measured -- a drift surface with no defect behind it. The dead arm is
-- documented here so a future reader does not mistake it for a hole.

-- =====================================================================================
-- S5.2 -- clara._fa_assert_lineage_mintable (design SS6.2; WDB-G11).
--
-- THE 64-EDGE CAP, CLOSED WRITER-SIDE. Three readers have always refused a lineage deeper
-- than 64 supersede hops (S5-A1 above). Nothing refused the WRITER, so a 65th supersede
-- could be minted and the row it created was then permanently unreadable: every as-of
-- accumulated read, the register tie, the disposal precondition and the disposal stub would
-- all raise fa_lineage_too_deep on it, and no verb existed to undo the row that caused it.
-- The refusal has to happen where it is still followable -- BEFORE the edge exists.
--
-- PARITY WITH THE READERS IS THE WHOLE POINT (design SS6.2's 64/65 cells). The counter below
-- counts the supersede edges ALREADY ABOVE the predecessor: a predecessor at depth 63 mints
-- the 64th edge and is admitted, a predecessor at depth 64 would mint the 65th and is
-- refused. That is exactly what clara._fa_lineage_walk does (it checks `v_hops >= 64` before
-- taking the next edge, so it admits a 64-edge chain and refuses a 65-edge one) and what
-- 0041's round-4.6 fold H4 aligned the other two readers to.
--
-- A VOID ASSERTION, NOT A DEPTH READER. Returning "the depth" would force a bound, and a
-- bounded count is a number that is smaller than the truth for a corrupted lineage -- a wrong
-- number presented as an answer, which this file may never do (0041 round-3.5 fold G8). The
-- loop is still bounded (it stops the moment it can refuse), so a cycle in supersedes_asset_id
-- raises rather than spinning.
-- =====================================================================================
create function clara._fa_assert_lineage_mintable(p_predecessor uuid, p_site text)
  returns void
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare v_cur uuid := p_predecessor; v_parent uuid; v_hops int := 0;
begin
  if p_predecessor is null then return; end if;
  loop
    select fa.supersedes_asset_id into v_parent
      from clara.fixed_assets fa where fa.id = v_cur;
    -- No row, or the root reached: the predecessor's depth is v_hops and the edge about to
    -- be minted is edge v_hops + 1, which is at most 64. Lawful.
    if not found or v_parent is null then return; end if;
    v_hops := v_hops + 1;
    if v_hops >= 64 then
      raise exception 'superseding fixed asset % would take its lineage past 64 supersede hops -- the register cannot answer for a lineage that deep, so this revision, split or replacement is refused before it is written; unwind the chain (reverse the governing entries) before superseding it again', p_predecessor
        using errcode = 'CLR37',
          detail = jsonb_build_object('reason', 'fa_lineage_too_deep',
            'asset_id', p_predecessor, 'site', p_site)::text;
    end if;
    v_cur := v_parent;
  end loop;
end $$;
revoke all on function clara._fa_assert_lineage_mintable(uuid, text) from public;

-- =====================================================================================
-- S5.3 -- clara._fa_split_month_advisory (design SS6.4; WDB-G14).
--
-- NO ARITHMETIC CHANGES HERE. WDB-G14 PINNED the as-built period-boundary law exactly as it
-- stands: a revision effective on DAY 1 hands the changeover month to the successor; a
-- revision effective on DAY 2 OR LATER leaves the WHOLE month with the predecessor, and the
-- revised particulars begin the following month. No calendar month is ever split between two
-- lineage rows. That is what 0041 already does -- the predecessor's last chargeable month is
-- clara._fa_month_start(superseded_at - 1) (0041:1367) and the successor's first is
-- clara._fa_first_chargeable_month, floored at month_start(baseline_as_of) + 1 month
-- (0041:1283-1288, with baseline_as_of = effective_from - 1 at 0041:3219) -- and this
-- function changes NONE of it. The research record behind the ruling is
-- docs/plan/research/wave-d/split-month-research-2026-08-02.md (IAS 8 paragraph 32-38 and
-- IFRS for SMEs / MPERS 17.19 both operate at PERIOD grain; no mainstream ERP and no
-- AI-native 2026 vendor day-splits an estimate-revision month).
--
-- WHAT IT ADDS IS VISIBILITY, WHICH IS THE RULING'S OWN CONDITION. The convention is
-- defensible while immaterial (MPERS 10.3 / IAS 8.8); a materially wrong result cannot hide
-- behind consistency. So every mid-month changeover in the lineage is surfaced by name --
-- DERIVED at read time, NEVER stored -- with an explicit instruction to raise an adjusting
-- entry rather than leave the difference implicit. The agent never invents the difference.
--
-- DISPOSAL SPLITS ARE EXCLUDED (design SS6.4). A partial disposal also mints successors
-- carrying supersedes_asset_id -- 0041:2543-2544 says outright that row lineage cannot tell
-- the two apart, which is why the reversal machinery discriminates on the ENTRY. Two
-- row-local signatures do separate them here, and BOTH are required:
--   (a) a REVISION successor is born with baseline_as_of = effective_from - 1
--       (clara.revise_fixed_asset_particulars), while a SPLIT successor is born with
--       baseline_as_of = effective_from = the disposal entry's posting_date (0041:2488/2501);
--   (b) a SPLIT always mints TWO siblings sharing one predecessor and one effective_from,
--       a revision exactly one.
-- A K6 replacement is excluded by construction: the opening-seed door writes no
-- effective_from at all, so it never satisfies the day-of-month test.
--
-- EVERY FIGURE IS READ, NEVER RECOMPUTED: the successor's first chargeable month comes from
-- clara._fa_first_chargeable_month (the same reader the arithmetic uses) and the
-- predecessor's last is the 0041:1367 expression over the predecessor's own stamped
-- superseded_at. The two month-boundary fields are pure calendar facts about effective_from.
-- =====================================================================================
create function clara._fa_split_month_advisory(p_asset uuid) returns jsonb
  language sql stable security definer set search_path = clara, pg_temp as $$
  with recursive chain(id, parent, hops) as (
    select f.id, f.supersedes_asset_id, 0
      from clara.fixed_assets f where f.id = p_asset
    union all
    -- Bounded at the same 64 edges the readers admit, so a corrupted lineage cannot make an
    -- ADVISORY spin. The accumulated read sitting beside this one in _fa_asset_json refuses
    -- such a lineage loudly; the advisory simply stops walking.
    select f.id, f.supersedes_asset_id, c.hops + 1
      from chain c join clara.fixed_assets f on f.id = c.parent
     where c.hops < 64
  )
  select coalesce(jsonb_agg(jsonb_build_object(
             'asset_id', s.id,
             'predecessor_asset_id', s.supersedes_asset_id,
             'effective_from', s.effective_from,
             'changeover_month_start', clara._fa_month_start(s.effective_from),
             'changeover_month_end', clara._fa_month_end(s.effective_from),
             'month_charged_to', 'predecessor',
             'predecessor_last_chargeable_month',
               clara._fa_month_start(p.superseded_at - 1),
             'successor_first_chargeable_month',
               clara._fa_first_chargeable_month(s.id),
             'note', 'this revision takes effect after day 1, so the WHOLE changeover month stays with the predecessor and the revised particulars begin the following month (the pinned month-grain convention -- there is no daily pro-rata). If the difference could be material, especially near the financial year end, raise an adjusting entry for it rather than leaving it implicit.'
           ) order by s.effective_from, s.id), '[]'::jsonb)
    from chain c
    join clara.fixed_assets s on s.id = c.id
    join clara.fixed_assets p on p.id = s.supersedes_asset_id
   where s.supersedes_asset_id is not null
     and s.effective_from is not null
     and s.status <> 'unwound'
     and extract(day from s.effective_from) > 1
     and s.baseline_as_of = s.effective_from - 1
     and not exists (select 1 from clara.fixed_assets sib
                      where sib.supersedes_asset_id = s.supersedes_asset_id
                        and sib.id <> s.id
                        and sib.effective_from = s.effective_from
                        and sib.status <> 'unwound') $$;
revoke all on function clara._fa_split_month_advisory(uuid) from public;

reset role;

-- #####################################################################################
-- ###### S5.4 .. S5.13 -- THE CHAIN-OF-RECUT REGISTER (ten live bodies, non-bank) ######
-- #####################################################################################
-- S5.4  clara._fa_asset_json                    -- G14: the advisory reaches /assets
-- S5.5  clara.revise_fixed_asset_particulars    -- G11 writer guard + the G14 response
-- S5.6  clara.dispose_fixed_asset               -- G10 second-draft guard + G11 split guard
-- S5.7  clara._draft_opening_item_core          -- G12 x2 (both validator arms) + G11 (K6)
-- S5.8  clara._subledger_on_approve             -- the adjustment + advance hook splices
-- S5.9  clara.reverse_entry                     -- the SEVENTH splice on that body
-- S5.10 clara.revise_entry                      -- the three D-b flags keys + pair drafts
-- S5.11 clara.withdraw_draft                    -- pair drafts close through their receipt
-- S5.12 clara.set_client_fy_end                 -- the rung + the annual-cadence guard
-- S5.13 clara._fa_assert_code_unreserved        -- the shared union, leaf acquisition kept
-- S5.15 clara._fa_reserved_roles                -- the LIFECYCLE GATE (ruling WDB-R1)
-- S5.16 clara.upsert_fa_account_profile         -- the union, from the FA side (WDB-R3)
-- S5.17 clara._draft_opening_item_core          -- the union, at the K-doc seed door (WDB-R3)
-- S5.18 clara._fa_reversal_blocked              -- the resurrection window (WDB-R4)
--   (S5.15..S5.18 are the owner ruling of 2026-08-03, NOT design SS8's register -- see their
--    own block header for the claiming-door census, adjudications S5-A4..A6, and the two
--    things they deliberately do not do. S5.14 is the closing census and stays LAST.)

-- =====================================================================================
-- S5.4 -- clara._fa_asset_json: THE SPLIT-MONTH ADVISORY REACHES THE SURFACE (WDB-G14).
-- This projection is what clara.list_fixed_assets and clara.get_fixed_asset return, so one
-- splice puts the advisory on every /assets row and in the asset drawer with no new read RPC.
-- Three edits: the declaration, the derivation beside the existing uncharged-months
-- derivation (one arithmetic pass per row is kept -- both are single calls), and the
-- projection.
-- =====================================================================================
set role clara_fn_owner;

do $s5_4$
declare
  v_sig text := 'clara._fa_asset_json(uuid,date)';
  v_def text; v_frm text; v_cnt int; v_n int; r record;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if v_def is null then
    raise exception '0042 S5.4 prestate: clara._fa_asset_json is GONE' using errcode = 'CLR10';
  end if;
  if position('clara._fa_split_month_advisory(' in v_def) <> 0 then
    raise exception '0042 S5.4 prestate: _fa_asset_json already derives the advisory -- this splice has already been applied to this database'
      using errcode = 'CLR10';
  end if;
  -- THE PRE-EXISTING MARKER CENSUS at counts MEASURED on the live 0001..0041 catalog.
  for r in select * from (values
      ('clara._fa_uncharged_months', 1),
      ('clara._fa_accumulated(p_asset, p_as_of)', 1),
      ('clara._fa_particulars_complete(f)', 1),
      ($$'uncharged_due_count'$$, 1),
      ($$'nbv_cents'$$, 1)) as t(marker, want) loop
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '0042 S5.4 prestate: _fa_asset_json carries the marker "%" % time(s), expected % -- the body drifted or lost a prior splice; re-derive this section against the live catalog', r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (a) THE DECLARATION.
  v_frm := $f$declare f clara.fixed_assets%rowtype; v_acc bigint; v_unch jsonb;$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0042 S5.4 prestate (a): the declaration line appears % time(s) (expected exactly once)', v_cnt using errcode = 'CLR10';
  end if;
  v_def := replace(v_def, v_frm,
    $t$declare f clara.fixed_assets%rowtype; v_acc bigint; v_unch jsonb; v_split jsonb;
  v_dfreeze boolean; v_ddraft uuid;$t$);

  -- (b) THE DERIVATION, beside the uncharged-months one.
  v_frm := $f$  v_unch := clara._fa_uncharged_months(p_asset, clara._fa_month_end(clara._fa_today()));$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0042 S5.4 prestate (b): the uncharged-months derivation appears % time(s) (expected exactly once)', v_cnt using errcode = 'CLR10';
  end if;
  v_def := replace(v_def, v_frm,
    $t$  v_unch := clara._fa_uncharged_months(p_asset, clara._fa_month_end(clara._fa_today()));
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
  end if;$t$);

  -- (c) THE PROJECTION.
  v_frm := $f$    'uncharged_due', v_unch,
    'uncharged_due_count', jsonb_array_length(v_unch));$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0042 S5.4 prestate (c): the uncharged-due projection tail appears % time(s) (expected exactly once)', v_cnt using errcode = 'CLR10';
  end if;
  v_def := replace(v_def, v_frm,
    $t$    'uncharged_due', v_unch,
    'uncharged_due_count', jsonb_array_length(v_unch),
    'split_month_advisory', v_split,
    'split_month_advisory_count', jsonb_array_length(v_split),
    -- [CROSS-SECTION EDIT -- round-5 fix lane. Reported, not silent.] WDB-G10's UI face.
    'disposal_draft_outstanding', v_dfreeze,
    'disposal_draft_entry_id', v_ddraft);$t$);
  execute v_def;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  for r in select * from (values
      ('clara._fa_split_month_advisory(p_asset)', 1),
      ($$'split_month_advisory_count'$$, 1),
      ('v_split jsonb;', 1),
      -- [CROSS-SECTION EDIT -- round-5 fix lane. Reported, not silent.] The G10 projection:
      -- the verdict rides the guard's OWN function (one call), the id one ordered pick.
      ($$clara._fa_disposal_draft_outstanding(f.client_id, p_asset, 'infinity'::date)$$, 1),
      ($$'disposal_draft_outstanding', v_dfreeze$$, 1),
      ($$'disposal_draft_entry_id', v_ddraft$$, 1),
      ('v_dfreeze boolean; v_ddraft uuid;', 1),
      ('clara._fa_uncharged_months', 1),
      ('clara._fa_accumulated(p_asset, p_as_of)', 1),
      ('clara._fa_particulars_complete(f)', 1),
      ($$'uncharged_due_count'$$, 1),
      ($$'nbv_cents'$$, 1)) as t(marker, want) loop
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '0042 S5.4 postcheck: marker "%" is now % (expected %) -- the splice damaged the body', r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;
  -- THE OLD PROJECTION TAIL IS GONE: a vacuous replace() cannot pass this.
  if position($p$'uncharged_due_count', jsonb_array_length(v_unch));$p$ in v_def) <> 0 then
    raise exception '0042 S5.4 postcheck: the un-widened projection tail is still present -- replace() passed vacuously'
      using errcode = 'CLR10';
  end if;
  if (select p.proowner::regrole::text from pg_proc p where p.oid = v_sig::regprocedure)
     <> 'clara_fn_owner' then
    raise exception '0042 S5.4 postcheck: _fa_asset_json changed owner' using errcode = 'CLR10';
  end if;
  raise notice '0042 S5.4 OK: _fa_asset_json derives and projects the split-month advisory AND the WDB-G10 second-disposal freeze (verdict + draft id); all five pre-existing markers survived at their measured counts.';
end $s5_4$;

reset role;

-- =====================================================================================
-- S5.5 -- clara.revise_fixed_asset_particulars: THE G11 WRITER GUARD + THE G14 RESPONSE.
--
-- This verb is minting path (1) of the three WDB-G11 names. The guard sits IMMEDIATELY
-- before the INSERT, after every cheaper wall (lifecycle, disposal freeze, completeness,
-- the three effective-date conflicts, the particulars envelope and the residual bound) --
-- the same "last refusal position" reasoning 0041 S4.10 used for the verb-side FA wall.
--
-- The response gains the advisory for the row it just minted, so the professional who
-- performed a mid-month revision is told about the changeover month AT THE MOMENT OF THE
-- ACT rather than only on a later read of /assets (design SS6.4).
-- =====================================================================================
set role clara_fn_owner;

do $s5_5$
declare
  v_sig text := 'clara.revise_fixed_asset_particulars(uuid,uuid,jsonb,date,text)';
  v_def text; v_frm text; v_cnt int; v_n int; r record;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if v_def is null then
    raise exception '0042 S5.5 prestate: clara.revise_fixed_asset_particulars is GONE' using errcode = 'CLR10';
  end if;
  if position('clara._fa_assert_lineage_mintable(' in v_def) <> 0 then
    raise exception '0042 S5.5 prestate: revise_fixed_asset_particulars already carries the lineage-depth guard -- this splice has already been applied to this database'
      using errcode = 'CLR10';
  end if;
  for r in select * from (values
      ('fa_revise_effective_conflict', 3),
      ('fa_particulars_invalid', 4),
      ($$'disposal_draft_outstanding',$$, 1),
      ($$clara._fa_disposal_draft_outstanding(p_client, p_asset, 'infinity'::date)$$, 1),
      ('clara._fa_validate_particulars(p_particulars)', 1),
      ('fa_particulars_incomplete', 1),
      ('superseded_by_asset_id', 1)) as t(marker, want) loop
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '0042 S5.5 prestate: revise_fixed_asset_particulars carries the marker "%" % time(s), expected % -- the body drifted or lost a prior splice', r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (a) THE WRITER GUARD, immediately above the successor INSERT.
  v_frm := $f$  v_accum := coalesce(fa.accumulated_depreciation_cents, 0);
  insert into clara.fixed_assets(firm_id, client_id, description, acquired_date, cost_cents,$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0042 S5.5 prestate (a): the bake/INSERT seam appears % time(s) (expected exactly once) -- the body drifted; re-derive this splice', v_cnt
      using errcode = 'CLR10';
  end if;
  v_def := replace(v_def, v_frm,
    $t$  -- 0042 (Wave D-b, design SS6.2; WDB-G11): THE 64-EDGE CAP, CLOSED WRITER-SIDE. The
  -- INSERT below mints a successor carrying supersedes_asset_id -- a new supersede edge. The
  -- three lineage READERS refuse a chain deeper than 64 hops, so a 65th revision used to
  -- produce a row that every as-of read, the register tie and the disposal precondition would
  -- then refuse, with no verb able to undo it. Refused here, nothing is written and the
  -- remedy (unwind the chain) is still reachable. The 64th revision still succeeds -- this
  -- door and clara._fa_lineage_walk admit exactly the same chains.
  perform clara._fa_assert_lineage_mintable(p_asset, 'revise_fixed_asset_particulars');
  v_accum := coalesce(fa.accumulated_depreciation_cents, 0);
  insert into clara.fixed_assets(firm_id, client_id, description, acquired_date, cost_cents,$t$);

  -- (b) THE RESPONSE gains the advisory for the row just minted.
  v_frm := $f$  return clara._finish_op(c.firm, 'revise_fixed_asset_particulars', p_op_key,
    jsonb_build_object('asset_id', p_asset, 'successor_asset_id', v_new,
      'effective_from', p_effective_from, 'client_id', p_client));$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0042 S5.5 prestate (b): the receipt return appears % time(s) (expected exactly once)', v_cnt
      using errcode = 'CLR10';
  end if;
  v_def := replace(v_def, v_frm,
    $t$  return clara._finish_op(c.firm, 'revise_fixed_asset_particulars', p_op_key,
    jsonb_build_object('asset_id', p_asset, 'successor_asset_id', v_new,
      'effective_from', p_effective_from, 'client_id', p_client,
      -- 0042 (design SS6.4; WDB-G14): the mid-month changeover is named IN THE RECEIPT, not
      -- only on a later read. Empty on a day-1 revision, which is the whole point -- day 1
      -- hands the month to the successor and there is nothing to advise about.
      'split_month_advisory', clara._fa_split_month_advisory(v_new)));$t$);
  execute v_def;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  for r in select * from (values
      ($$clara._fa_assert_lineage_mintable(p_asset, 'revise_fixed_asset_particulars')$$, 1),
      ('clara._fa_split_month_advisory(v_new)', 1),
      ('fa_revise_effective_conflict', 3),
      ('fa_particulars_invalid', 4),
      ($$'disposal_draft_outstanding',$$, 1),
      ($$clara._fa_disposal_draft_outstanding(p_client, p_asset, 'infinity'::date)$$, 1),
      ('clara._fa_validate_particulars(p_particulars)', 1),
      ('fa_particulars_incomplete', 1),
      ('superseded_by_asset_id', 1)) as t(marker, want) loop
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '0042 S5.5 postcheck: marker "%" is now % (expected %)', r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;
  -- ORDERED, BOTH-PRESENT: the guard must sit BEFORE the successor INSERT. A bare
  -- position(a) < position(b) reads a MISSING marker (position 0) as correctly ordered.
  if not (position('clara._fa_assert_lineage_mintable(p_asset' in v_def) > 0
          and position('insert into clara.fixed_assets(firm_id, client_id, description' in v_def) > 0
          and position('clara._fa_assert_lineage_mintable(p_asset' in v_def)
              < position('insert into clara.fixed_assets(firm_id, client_id, description' in v_def)) then
    raise exception '0042 S5.5 postcheck: the lineage guard is not above the successor INSERT'
      using errcode = 'CLR10';
  end if;
  if position($p$'effective_from', p_effective_from, 'client_id', p_client));$p$ in v_def) <> 0 then
    raise exception '0042 S5.5 postcheck: the un-widened receipt return is still present -- replace() passed vacuously'
      using errcode = 'CLR10';
  end if;
  if (select p.proowner::regrole::text from pg_proc p where p.oid = v_sig::regprocedure)
     <> 'clara_fn_owner' then
    raise exception '0042 S5.5 postcheck: revise_fixed_asset_particulars changed owner' using errcode = 'CLR10';
  end if;
  raise notice '0042 S5.5 OK: revise_fixed_asset_particulars refuses the 65th supersede edge writer-side and returns the split-month advisory; all seven pre-existing markers survived.';
end $s5_5$;

reset role;

-- =====================================================================================
-- S5.6 -- clara.dispose_fixed_asset: THE SECOND-DRAFT GUARD (WDB-G10) + THE PARTIAL-SPLIT
-- WRITER GUARD (WDB-G11, minting path 2 of 3).
--
-- G10, WHAT IT CLOSES. Nothing stopped a second disposal draft being raised for an asset
-- that already had one outstanding. Both drafts carried an independently-computed stub, NBV
-- and gain against the SAME register row; approving either one made the other's arithmetic
-- historical fiction, and approving both would have disposed the same cost twice (the second
-- approval's own freshness check would refuse it -- confusingly, at the checker, after a
-- maker was told the act had succeeded). The freeze is already the law in the other
-- direction: clara.revise_fixed_asset_particulars refuses while a disposal draft is
-- outstanding (0041, round-3.5 fold G6), the run verb and the due oracle both skip a frozen
-- asset. This is the same per-asset freeze applied to the disposal door itself -- WDB-G10
-- ratified it. The reader is the LIVE one, unchanged, asked through 'infinity' so ANY
-- outstanding disposal draft freezes the row regardless of its date.
--
-- G11, WHERE IT SITS. A partial disposal mints TWO successors of this row (0041:2479-2503),
-- i.e. one new supersede generation -- but they are minted by the approve-time hook, not
-- here. The guard is nevertheless mounted at the VERB, exactly as 0041 S4.10 mounted the FA
-- reversal wall: a HIGH-STAKES disposal is left a DRAFT by this verb and its checker's
-- approval is the first moment the hook runs, so without a verb-side twin the maker would
-- receive a success receipt for a split that can never complete. Recorded honestly: the guard
-- is evaluated at DRAFT time, so a lineage that deepens inside the maker/checker window is
-- still caught -- but by the READERS at approve (clara._fa_accumulated_periods_through raises
-- fa_lineage_too_deep on a 65-edge chain), under the same token.
-- =====================================================================================
set role clara_fn_owner;

do $s5_6$
declare
  v_sig text := 'clara.dispose_fixed_asset(uuid,uuid,date,bigint,text,text,text,text,text,bigint)';
  v_def text; v_frm text; v_cnt int; v_n int; r record;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if v_def is null then
    raise exception '0042 S5.6 prestate: clara.dispose_fixed_asset is GONE' using errcode = 'CLR10';
  end if;
  if position('disposal_draft_outstanding' in v_def) <> 0
     or position('clara._fa_assert_lineage_mintable(' in v_def) <> 0 then
    raise exception '0042 S5.6 prestate: dispose_fixed_asset already carries the second-draft or lineage guard -- this splice has already been applied to this database'
      using errcode = 'CLR10';
  end if;
  for r in select * from (values
      ('disposal_request_invalid', 11),
      ('disposal_stale', 2),
      ('period_earlier_unmet', 1),
      ('fa_before_baseline', 1),
      ('fa_particulars_incomplete', 1),
      ('clara._fa_particulars_complete(fa)', 1),
      ('clara._fa_disposal_stub(p_asset, p_disposal_date)', 1),
      ('clara._fa_reserved_roles(p_client)', 1),
      ('pg_advisory_xact_lock(203005004', 1)) as t(marker, want) loop
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '0042 S5.6 prestate: dispose_fixed_asset carries the marker "%" % time(s), expected % -- the body drifted or lost a prior splice', r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (a) G10 -- the second-draft guard, immediately after the lifecycle refusal and under the
  -- client rung the verb already holds (so the check-then-act window against a concurrent
  -- disposal of the same asset is closed by the rung, not by luck).
  v_frm := $f$  if fa.status <> 'active' then
    raise exception 'only an active register row can be disposed (this one is %)', fa.status
      using errcode = 'CLR39',
        detail = jsonb_build_object('reason', 'disposal_stale', 'axis', 'lifecycle',
          'asset_id', p_asset, 'status', fa.status)::text;
  end if;$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0042 S5.6 prestate (a): the lifecycle refusal appears % time(s) (expected exactly once)', v_cnt
      using errcode = 'CLR10';
  end if;
  v_def := replace(v_def, v_frm,
    $t$  if fa.status <> 'active' then
    raise exception 'only an active register row can be disposed (this one is %)', fa.status
      using errcode = 'CLR39',
        detail = jsonb_build_object('reason', 'disposal_stale', 'axis', 'lifecycle',
          'asset_id', p_asset, 'status', fa.status)::text;
  end if;
  -- 0042 (Wave D-b, design SS6.1; WDB-G10): ONE OUTSTANDING DISPOSAL PROPOSAL PER ASSET.
  -- Two live drafts would each carry a stub, an accumulated relief, an NBV and a gain worked
  -- out against the SAME row; approving one makes the other's arithmetic fiction, and the
  -- checker -- not the maker -- would be the one to find out. The per-asset freeze already
  -- runs in the other direction (the particulars door, the run verb and the due oracle all
  -- refuse or skip a frozen asset); this closes the disposal door on itself. 'infinity' is
  -- deliberate: ANY un-dead disposal draft freezes the row, whatever date it carries.
  -- Remedy named, as everywhere: approve or withdraw the outstanding draft first.
  if clara._fa_disposal_draft_outstanding(p_client, p_asset, 'infinity'::date) then
    raise exception 'an un-dead disposal draft is already outstanding for this asset; approve or withdraw it before raising a second disposal'
      using errcode = 'CLR39',
        detail = jsonb_build_object('reason', 'disposal_draft_outstanding',
          'asset_id', p_asset)::text;
  end if;$t$);

  -- (b) G11 -- the partial-split lineage guard, immediately after the cost-portion range
  -- validation (so a malformed portion is still named by its own axis first).
  v_frm := $f$  if p_cost_portion_cents is not null
     and (p_cost_portion_cents <= 0 or p_cost_portion_cents >= fa.cost_cents) then
    raise exception 'a partial disposal states a COST PORTION strictly between 0 and the asset''s cost (%)', fa.cost_cents
      using errcode = 'CLR39',
        detail = '{"reason":"disposal_request_invalid","axis":"cost_portion"}';
  end if;$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0042 S5.6 prestate (b): the cost-portion range refusal appears % time(s) (expected exactly once)', v_cnt
      using errcode = 'CLR10';
  end if;
  v_def := replace(v_def, v_frm,
    $t$  if p_cost_portion_cents is not null
     and (p_cost_portion_cents <= 0 or p_cost_portion_cents >= fa.cost_cents) then
    raise exception 'a partial disposal states a COST PORTION strictly between 0 and the asset''s cost (%)', fa.cost_cents
      using errcode = 'CLR39',
        detail = '{"reason":"disposal_request_invalid","axis":"cost_portion"}';
  end if;
  -- 0042 (Wave D-b, design SS6.2; WDB-G11): THE 64-EDGE CAP ON MINTING PATH 2 OF 3. Only a
  -- PARTIAL disposal supersedes -- it mints a disposed-portion row and a continuing row, both
  -- one generation below this one. A full disposal mints nothing and is deliberately not
  -- gated. Refused at the verb, before the proposal exists, so a high-stakes draft is never
  -- born for a split the hook could not lawfully complete.
  if p_cost_portion_cents is not null then
    perform clara._fa_assert_lineage_mintable(p_asset, 'dispose_fixed_asset_partial_split');
  end if;$t$);
  execute v_def;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  for r in select * from (values
      ($$clara._fa_disposal_draft_outstanding(p_client, p_asset, 'infinity'::date)$$, 1),
      ($$'disposal_draft_outstanding',$$, 1),
      ($$clara._fa_assert_lineage_mintable(p_asset, 'dispose_fixed_asset_partial_split')$$, 1),
      ('disposal_request_invalid', 11),
      ('disposal_stale', 2),
      ('period_earlier_unmet', 1),
      ('fa_before_baseline', 1),
      ('fa_particulars_incomplete', 1),
      ('clara._fa_particulars_complete(fa)', 1),
      ('clara._fa_disposal_stub(p_asset, p_disposal_date)', 1),
      ('clara._fa_reserved_roles(p_client)', 1),
      ('pg_advisory_xact_lock(203005004', 1)) as t(marker, want) loop
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '0042 S5.6 postcheck: marker "%" is now % (expected %)', r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;
  -- BOTH GUARDS SIT AFTER THE CLIENT RUNG AND BEFORE THE PROPOSAL INSERT. Both-present-and-
  -- ordered, never a bare position() comparison.
  if not (position('pg_advisory_xact_lock(203005004' in v_def) > 0
          and position($p$clara._fa_disposal_draft_outstanding(p_client, p_asset, 'infinity'::date)$p$ in v_def) > 0
          and position($p$clara._fa_assert_lineage_mintable(p_asset, 'dispose_fixed_asset_partial_split')$p$ in v_def) > 0
          and position('insert into clara.journal_entries(client_id, status, posting_date, memo, origin,' in v_def) > 0
          and position('pg_advisory_xact_lock(203005004' in v_def)
              < position($p$clara._fa_disposal_draft_outstanding(p_client, p_asset, 'infinity'::date)$p$ in v_def)
          and position($p$clara._fa_disposal_draft_outstanding(p_client, p_asset, 'infinity'::date)$p$ in v_def)
              < position($p$clara._fa_assert_lineage_mintable(p_asset, 'dispose_fixed_asset_partial_split')$p$ in v_def)
          and position($p$clara._fa_assert_lineage_mintable(p_asset, 'dispose_fixed_asset_partial_split')$p$ in v_def)
              < position('insert into clara.journal_entries(client_id, status, posting_date, memo, origin,' in v_def)) then
    raise exception '0042 S5.6 postcheck: the two new guards are not between the client rung and the proposal INSERT'
      using errcode = 'CLR10';
  end if;
  if (select p.proowner::regrole::text from pg_proc p where p.oid = v_sig::regprocedure)
     <> 'clara_fn_owner' then
    raise exception '0042 S5.6 postcheck: dispose_fixed_asset changed owner' using errcode = 'CLR10';
  end if;
  raise notice '0042 S5.6 OK: dispose_fixed_asset refuses a second outstanding disposal draft and refuses a split that would mint the 65th supersede edge; all nine pre-existing markers survived at their measured counts.';
end $s5_6$;

reset role;

-- =====================================================================================
-- S5.7 -- clara._draft_opening_item_core: THE G12 COST-ONLY NULL DISJUNCTS (BOTH validator
-- arms) + THE G11 GUARD ON THE K6 REPLACEMENT PATH (minting path 3 of 3).
--
-- G12, THE DEFECT. The validator tests `v_cost<=0`. When the baseline states no cost_cents
-- at all, v_cost is NULL, `v_cost<=0` is NULL, and a three-valued OR chain whose other
-- disjuncts are all FALSE evaluates to NULL -- which plpgsql's `if` treats as false. The
-- carry-down therefore PASSED and wrote a clara.fixed_assets row with a NULL cost: a row the
-- lineage walk cannot pro-rate, the tie cannot tie, the arithmetic cannot charge and the
-- disposal verb cannot bound a portion inside. Cost is the ONLY driver that can arrive NULL
-- here -- accumulated and residual are coalesced to 0 immediately above, and life and rate
-- are tested with explicit IS NULL arms in the method-driver congruence 0041 added -- which
-- is why the design says "cost-only" and one disjunct closes it.
--
-- BOTH ARMS, ONE REPLACE. The body validates the envelope TWICE (0041 S4.5 measured and
-- preserved exactly this): once on the LINES pass, which raises CLR10, and once on the
-- REGISTER pass, which raises CLR31 with tie_mismatch. The two arms are byte-identical
-- apart from that trailing raise, so the shared predicate head is the anchor and its
-- occurrence count is asserted at EXACTLY 2 -- the same discipline 0041 S4.5 used for its
-- own two-site edits. Anchors are measured against the LIVE body, which already carries
-- 0041's method widening and its method-driver congruence.
--
-- G11, THE THIRD MINTING PATH. The fixed_assets INSERT below carries supersedes_asset_id
-- when the opening item names a replacement (the K6 lineage). That is a new supersede edge,
-- minted from the opening-seed door, and it was ungated. The refusal aborts the seeding
-- transaction, so no half-seeded item survives. Errcode per assembly adjudication S5-A2.
-- =====================================================================================
set role clara_fn_owner;

do $s5_7$
declare
  v_sig text := 'clara._draft_opening_item_core(uuid,uuid,uuid,uuid,jsonb,jsonb,uuid,uuid,text)';
  v_def text; v_frm text; v_cnt int; v_n int; r record;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if v_def is null then
    raise exception '0042 S5.7 prestate: clara._draft_opening_item_core is GONE' using errcode = 'CLR10';
  end if;
  if position('or v_cost is null' in v_def) <> 0
     or position('clara._fa_assert_lineage_mintable(' in v_def) <> 0 then
    raise exception '0042 S5.7 prestate: the carry-down already carries the cost-null disjunct or the lineage guard -- this splice has already been applied to this database'
      using errcode = 'CLR10';
  end if;
  -- THE CENSUS, RE-DERIVED AGAINST THE LIVE BODY -- which is the 0017 original AFTER 0041's
  -- four-part S4.5 recut. `v_rate int;` is 0041's own marker and is probed positively here:
  -- a body rebuilt from 0017 file text upstream would have silently lost the D-a method
  -- widening, and this splice must not be the thing that hides that.
  for r in select * from (values
      ('depreciation_method_unsupported', 2),
      ('fixed asset books-grade baseline is incomplete', 2),
      ('carried accumulated depreciation', 1),
      ('registry_not_open', 1),
      ('duplicate_seed', 1),
      ('tie_mismatch', 4),
      ('v_rate int;', 1),
      ('supersedes_asset_id', 1)) as t(marker, want) loop
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '0042 S5.7 prestate: the carry-down carries the marker "%" % time(s), expected % -- the body drifted or lost a prior splice; re-derive this section against the live catalog', r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (a) G12 -- BOTH validator arms, one replace, count asserted at exactly 2.
  v_frm := $f$    if nullif(btrim(a->>'description'),'') is null
       or nullif(a->>'acquired_date','') is null
       or v_cost<=0 or v_accum<0 or v_residual<0$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 2 then
    raise exception '0042 S5.7 prestate (a): the books-grade validator head appears % time(s) (expected exactly 2 -- the CLR10 composer arm and the CLR31 seed/activation arm); the body drifted, re-derive this splice', v_cnt
      using errcode = 'CLR10';
  end if;
  v_def := replace(v_def, v_frm,
    $t$    if nullif(btrim(a->>'description'),'') is null
       or nullif(a->>'acquired_date','') is null
       -- 0042 (Wave D-b, design SS6.3; WDB-G12): THE COST-ONLY NULL DISJUNCT. `v_cost<=0` is
       -- NULL, not FALSE, when the baseline states no cost at all -- and an OR chain whose
       -- other disjuncts are FALSE then evaluates to NULL, which this `if` treats as false.
       -- The seed passed and wrote a register row with no cost. Cost is the only driver that
       -- can arrive NULL at this point (accumulated and residual are coalesced to 0 above;
       -- life and rate carry their own IS NULL arms below), so one disjunct closes it at both
       -- arms. The column itself is NOT NULL from 0042 onward (S5.1) -- this door is what
       -- makes the refusal a NAMED books-grade refusal rather than a raw constraint violation.
       or v_cost is null
       or v_cost<=0 or v_accum<0 or v_residual<0$t$);

  -- (b) G11 -- the K6 replacement lineage guard, immediately after the replacement lineage is
  -- resolved and before the fixed_assets INSERT that carries the new edge.
  v_frm := $f$      if v_supersedes_asset is null then
        raise exception 'fixed-asset replacement lineage is invalid'
          using errcode='CLR31',detail='{"reason":"tie_mismatch"}';
      end if;
    end if;$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0042 S5.7 prestate (b): the K6 replacement-lineage resolution appears % time(s) (expected exactly once)', v_cnt
      using errcode = 'CLR10';
  end if;
  v_def := replace(v_def, v_frm,
    $t$      if v_supersedes_asset is null then
        raise exception 'fixed-asset replacement lineage is invalid'
          using errcode='CLR31',detail='{"reason":"tie_mismatch"}';
      end if;
      -- 0042 (Wave D-b, design SS6.2; WDB-G11): THE 64-EDGE CAP ON MINTING PATH 3 OF 3 -- the
      -- opening-seed replacement. The INSERT below stamps a new supersede edge onto the row it
      -- replaces, and nothing gated it: a 65th replacement produced a register row the three
      -- lineage readers all refuse, so the seed could be corrected into a state no read could
      -- answer for. Refusing here aborts the seeding transaction, so no half-seeded item
      -- survives. CLR37 rather than this family's usual CLR31 (assembly adjudication S5-A2):
      -- one lineage law, one errcode, matching the readers and the other two writer doors.
      perform clara._fa_assert_lineage_mintable(v_supersedes_asset,
        'opening_seed_fixed_asset_replacement');
    end if;$t$);
  execute v_def;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  for r in select * from (values
      ('or v_cost is null', 2),
      ($$clara._fa_assert_lineage_mintable(v_supersedes_asset,$$, 1),
      ('depreciation_method_unsupported', 2),
      ('fixed asset books-grade baseline is incomplete', 2),
      ('carried accumulated depreciation', 1),
      ('registry_not_open', 1),
      ('duplicate_seed', 1),
      ('tie_mismatch', 4),
      ('v_rate int;', 1),
      ('supersedes_asset_id', 1)) as t(marker, want) loop
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '0042 S5.7 postcheck: marker "%" is now % (expected %) -- the splice damaged the body', r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;
  -- THE OLD VALIDATOR HEAD IS GONE at both arms: a vacuous replace() cannot pass this.
  if position($p$       or nullif(a->>'acquired_date','') is null
       or v_cost<=0$p$ in v_def) <> 0 then
    raise exception '0042 S5.7 postcheck: an un-widened validator head is still present -- replace() passed vacuously'
      using errcode = 'CLR10';
  end if;
  -- THE 0017 R3-F4 ALL-DRAFTS-PENDING BYTE PIN, RE-ASSERTED (whitespace-insensitive, exactly
  -- as 0017 measured it and 0041 S4.5 re-asserted it). This section edits the body twice; the
  -- pin is what proves it did not disturb the register INSERT's staging semantics.
  if position('v_entry,v_accum,(a->>''depreciation_start_date'')::date,s.as_of,''pending'',v_supersedes_asset'
       in regexp_replace(lower(v_def), '\s+', '', 'g')) = 0 then
    raise exception '0042 S5.7 postcheck: the 0017 R3-F4 all-drafts-pending byte pin was damaged by this recut'
      using errcode = 'CLR10';
  end if;
  if (select p.proowner::regrole::text from pg_proc p where p.oid = v_sig::regprocedure)
     <> 'clara_fn_owner' then
    raise exception '0042 S5.7 postcheck: the carry-down core changed owner' using errcode = 'CLR10';
  end if;
  raise notice '0042 S5.7 OK: both carry-down validator arms refuse a NULL cost by name and the K6 replacement path refuses the 65th supersede edge; the 0017 byte pin and all eight pre-existing markers (0017 + 0041 S4.5) survived.';
end $s5_7$;

reset role;


-- =====================================================================================
-- [SPLIT D-b0 2026-08-04] S5.8 STANDS HERE IN THE WHOLE UNIT AND IS NOT IN THIS SLICE (census
-- sect.2 Class C: its two `perform` lines are unconditional, PL/pgSQL resolves neither at
-- CREATE time, and a D-b0 that shipped them alone would break every approve path in
-- production at the first call). D-b1 adds the clara._adv_on_approve line and D-b2 adds
-- clara._adj_on_approve ABOVE it; the order is load-bearing and stated in the body's own
-- comment.
-- =====================================================================================

-- =====================================================================================
-- S5.9-b0 -- clara.reverse_entry: THE CORRECTION-DATE HALF ONLY (design SS2.4 / SS3.3).
--
-- [SPLIT D-b0 2026-08-04] THIS BLOCK IS THE HALF OF S5.9 THE CENSUS'S EXCLUSION LIST DOES NOT
-- EXCLUDE, AND IT IS SHIPPED HERE BECAUSE OMITTING IT WAS MEASURED TO BRICK THE
-- DEPRECIATION SWEEP. The whole unit's S5.9 makes TWO INDEPENDENT REPLACEMENTS on this
-- body: (i) the D-b reversal WALL (clara._wdb_reversal_blocked), which needs D-b1, and
-- (ii) the mirror's DATE (clara._wdb_correction_posting_date), which needs only the class
-- authority this slice's SECTION S2 file creates. Census sect.8 excludes
-- "S5.9(reversal-wall half)" -- half (i) -- and its D-b2 bullet says "S5.9-b2
-- (_wdb_correction_posting_date term, IF NOT ALREADY IN D-b0)", so half (ii) was always in
-- this slice's scope.
--
-- WHY IT IS NOT OPTIONAL, MEASURED ON THIS SLICE'S OWN RIG (cells x41.n2, x41.n3, x41.s1,
-- reproduced against a D-b0 built without it): this slice DOES ship the ENFORCEMENT --
-- S5.15c and S5.15d put the fixed-asset due oracle and the fixed-asset poster on
-- clara._wdb_rerun_breach -- while the gate's fixed-asset arm refuses any period whose
-- charge row and unwind row carry DIFFERENT effective dates. Without the correction-date
-- term, clara.reverse_entry dates its mirror at MYT today, clara._fa_on_approve arm (3b)
-- effective-dates the unwind there, and the charge stays on its own period_end -- so a
-- LAWFUL reverse-then-re-run of any depreciation period is refused CLR38 permanently, for
-- that client's whole register (clara.fa_depreciation is append-only, so nothing can repair
-- it). Shipping the gate without the remedy is a REGRESSION INTRODUCED BY THE SPLIT, not a
-- deferral; the two halves of this composition ship together or the enforcement must wait.
-- REPORTED to the assembly as a 23rd cross-slice edge the census did not measure.
--
-- WHAT IS NOT HERE: the reversal WALL, its ordering postcheck (bank wall -> FA wall -> D-b
-- wall -> the mirror INSERT) and the idempotency probe keyed on it. FINAL FORM: D-b1 adds
-- the wall and restores the ordering claim (census sect.8's "S5.9-b1").
-- =====================================================================================
set role clara_fn_owner;

do $s5_9_b0$
declare
  v_sig text := 'clara.reverse_entry(uuid,text,text)';
  v_def text; v_frm text; v_cnt int; v_n int; r record;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if v_def is null then
    raise exception '0042 S5.9-b0 prestate: clara.reverse_entry is GONE' using errcode = 'CLR10';
  end if;
  -- [SPLIT D-b0 2026-08-04] THE IDEMPOTENCY PROBE IS KEYED ON THE TERM THIS HALF ADDS. The whole
  -- unit probes for '_wdb_reversal_blocked' because that is the term IT adds first; this
  -- half adds the correction date, so that is what a re-apply would already find.
  if position('clara._wdb_correction_posting_date(' in v_def) <> 0 then
    raise exception '0042 S5.9-b0 prestate: reverse_entry already dates its mirror through the correction-date authority -- this splice has already been applied to this database'
      using errcode = 'CLR10';
  end if;
  -- THE SIX PRIOR SPLICE MARKERS, POSITIVELY PROBED at their measured counts, including both
  -- of 0041's (this migration must not be able to land its splice on a body that lost the MYT
  -- mirror date or the FA wall).
  for r in select * from (values
      ('opening_entry_k_family_only', 1),
      ('allocated_items_present', 2),
      ('live_bank_match_present', 1),
      ('pg_advisory_xact_lock(203005004', 1),
      ('Asia/Kuala_Lumpur', 1),
      ('clara._fa_reversal_blocked(p_entry)', 1)) as t(marker, want) loop
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '0042 S5.9 prestate: reverse_entry carries the marker "%" % time(s), expected % -- the body drifted or lost a prior splice', r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;
  -- -------------------------------------------------------------------------------------
  -- [CROSS-SECTION EDIT by the s2-adjustments lane, as-built ladder round 5, WIDENED in round
  -- 6. Reported, not silent.] THE SECOND REPLACEMENT ON THIS BODY: the mirror's DATE, scoped to
  -- the REGISTERED period-dated postings and to nothing else.
  --
  -- THE DEFECT (measured on a rig, both lanes): an annual template accruing RM50,000 at
  -- 2025-12-31, corrected through THIS verb in Aug 2026 and then re-run, left the FY2025
  -- expense at RM100,000.00 and the FY2025 accrual liability at RM100,000.00 -- permanently,
  -- with clara.adjustment_run_due re-proposing the period on every sweep and no read in the
  -- product able to show it. Neither law was wrong: the poster dates an occurrence at
  -- period_end because an accrual FOR a period belongs IN it, and 0041 S4.4 dates this
  -- mirror at MYT today because you do not silently post a correction into a period you have
  -- already reported. Composed, they touch ONE number on TWO clocks -- the correction never
  -- enters the period it corrects, so the period stays visibly un-corrected while the
  -- ENTRY-level truth (reversed_by) says it is corrected, and the re-run adds a second
  -- occurrence at period_end on top of the first.
  --
  -- ROUND 6: THE SAME DEFECT, THROUGH THIS SAME VERB, ON THE FIXED-ASSET LANE. The round-5
  -- delegate asked one lane's flag key, and the D-a depreciation poster stamps a different one
  -- while carrying the identical shape (posting_date = period_end, an oracle that re-proposes
  -- an uncovered month, and a re-run that AUTO-POSTS once the ramp is earned). Measured: a
  -- 10,000-sen month read 20,000 in both the ledger and the register, with
  -- clara.fa_register_tie certifying accum_diff_cents = 0. The delegate is now keyed on the
  -- REGISTRY clara._wdb_period_stamps(), so this one splice covers every registered lane and a
  -- new lane cannot be added outside it.
  --
  -- WHY THIS IS NOT A GLOBAL RE-DATING, structurally rather than by promise. 0041 S4.4's
  -- expression is not removed: it becomes the DEFAULT handed to
  -- clara._wdb_correction_posting_date (SECTION S2.0), which returns it UNCHANGED for every
  -- entry carrying none of the registered period stamps -- i.e. for every entry in this
  -- product except a recurring-adjustment occurrence, its auto-reversal mirror, a
  -- depreciation charge entry, or a fixed-asset disposal entry [round-8 M4 finding F3: this
  -- comment still enumerated the round-6 pair after round 7 registered 'fa_disposal' in
  -- clara._wdb_period_stamps() (S5.9 above) -- the code was always correct on the CURRENT
  -- registry (it reads the registry, not this list), only the prose had drifted]. The
  -- Asia/Kuala_Lumpur marker therefore still appears exactly
  -- ONCE (the prestate and postcheck censuses above and below both count it), current_date
  -- still never appears, and the cell x42.cd5 proves an ordinary entry's reversal is still
  -- dated MYT today.
  --
  -- IT IS NOT THE ENFORCEMENT EITHER. This verb is one correction door of several;
  -- clara._wdb_rerun_breach, asked at the admission of BOTH posters and BOTH due oracles, is
  -- the gate every re-run passes and the place the invariant is actually guaranteed.
  -- -------------------------------------------------------------------------------------
  v_frm := $f$(now() at time zone 'Asia/Kuala_Lumpur')::date$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0042 S5.9 prestate: the 0041 S4.4 MYT mirror-date expression appears % time(s) (expected exactly once) -- the body drifted; re-derive this splice', v_cnt
      using errcode = 'CLR10';
  end if;
  v_def := replace(v_def, v_frm,
    $t$clara._wdb_correction_posting_date(p_entry,(now() at time zone 'Asia/Kuala_Lumpur')::date)$t$);
  execute v_def;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  for r in select * from (values
      -- [CROSS-SECTION EDIT by the s2-adjustments lane, rounds 5 + 6. Reported, not silent.]
      -- The REGISTRY-scoped correction date, and the 0041 S4.4 expression STILL PRESENT exactly
      -- once inside it as the default -- which is what makes "scoped to the registry" a
      -- measured fact rather than a promise.
      ('clara._wdb_correction_posting_date(p_entry,', 1),
      ('opening_entry_k_family_only', 1),
      ('allocated_items_present', 2),
      ('live_bank_match_present', 1),
      ('pg_advisory_xact_lock(203005004', 1),
      ('Asia/Kuala_Lumpur', 1),
      ('clara._fa_reversal_blocked(p_entry)', 1)) as t(marker, want) loop
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '0042 S5.9-b0 postcheck: marker "%" is now % (expected %)', r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;
  -- [SPLIT D-b0 2026-08-04] THE ORDERING POSTCHECK (bank wall -> FA wall -> D-b wall -> the mirror
  -- INSERT) TRAVELS WITH THE WALL TO D-b1, and this half has NO ordering claim of its own --
  -- MEASURED, not assumed: the correction date is not a statement placed relative to the
  -- mirror INSERT, it IS that INSERT's posting_date VALUE, so it necessarily sits INSIDE the
  -- insert's column list. A first cut of this block asserted "the derivation is above the
  -- INSERT" and failed the apply on exactly that fact; the assertion was withdrawn rather
  -- than re-aimed, because the marker census above already proves the term is present
  -- exactly once with 0041 S4.4's expression preserved exactly once inside it, and there is
  -- no second place in this body the term could wrongly land.
  -- 0041 S4.4 IS STILL UNDONE-PROOF: the mirror is dated from the DB clock in MYT, never the
  -- session date.
  if position('current_date' in v_def) <> 0 then
    raise exception '0042 S5.9 postcheck: current_date reappeared in reverse_entry -- 0041 S4.4 was undone'
      using errcode = 'CLR10';
  end if;
  if (select p.proowner::regrole::text from pg_proc p where p.oid = v_sig::regprocedure)
     <> 'clara_fn_owner' then
    raise exception '0042 S5.9 postcheck: reverse_entry changed owner' using errcode = 'CLR10';
  end if;
  raise notice '0042 S5.9-b0 OK: reverse_entry dates a period-stamped entry''s mirror from the ONE correction-date authority, with 0041 S4.4''s MYT expression preserved exactly once as the default; all six prior splice markers survived. The D-b reversal WALL ships with D-b1.';
end $s5_9_b0$;

reset role;

-- =====================================================================================
-- [SPLIT D-b0 2026-08-04] S5.10, S5.10a AND S5.11 STAND HERE IN THE WHOLE UNIT AND ARE NOT IN THIS
-- SLICE: clara.revise_entry's pair-draft lock and clara.withdraw_draft's pair refusal both
-- read clara.adjustment_pair_reversals (census sect.2 Class E), so both blocks move whole to
-- D-b2. Nothing is re-derived here.
-- =====================================================================================
-- =====================================================================================
-- S5.12 -- clara.set_client_fy_end: THE CLIENT RUNG + THE ANNUAL-CADENCE GUARD
-- (design SS2.2).
--
-- WHAT IT CLOSES. An ANNUAL cadence derives its period window from THIS client's financial-
-- year end. Moving the year end while an annual machine is live silently redefines every
-- period that machine has already met and every one it is about to run: a receipt naming
-- FY2026 would no longer describe the window the oracle computes, the unmet-period question
-- would answer about a window nobody ran, and a re-run would post a second charge into a
-- period the books already report. The verb had no guard at all and took no lock.
--
-- MONTHLY CADENCES DO NOT BLOCK, DELIBERATELY. A monthly period is a calendar month and is
-- wholly FY-independent -- and the sandbox's live monthly depreciation authority is the
-- design's own named cell for this. Refusing on a monthly cadence would make the guard
-- unfollowable on the one client that has one.
--
-- THE RUNG IS THE SAME 203005004 the poster, the disposal verb, the revise door and the
-- enrolment doors take, so an FY-end change and a concurrent run are serialised rather than
-- racing; taken here it is also what makes the two reads below a decision rather than a
-- snapshot. Token per assembly adjudication S5-A3 (additive, named deviation).
-- =====================================================================================
-- [SPLIT D-b0 2026-08-04] THIS SLICE SHIPS THE RUNG AND THE DEPRECIATION-AUTHORITY ARM; THE
-- adjustment_templates ARM IS D-b2's. Census sect.2 Class E names ONE violating edge on this
-- block -- set_client_fy_end -> clara.adjustment_templates -- and sect.3 records the block as
-- "separable: rung -> D-b0, cadence guard -> D-b2". A first cut of this slice deferred the
-- WHOLE guard on that wording and the D-b0 battery measured the cost: cell x41.f3 ("the 0042
-- FYE guard on the AUTHORITY axis: a live ANNUAL-cadence depreciation authority BLOCKS
-- set_client_fy_end") went red on a claim with NO later-slice dependency at all --
-- clara.fa_depreciation_authorities is a 0041 relation and the arm that reads it names no
-- D-b1/D-b2/D-b3 object. ADJUDICATED (coordinator, 2026-08-04) AND CORRECTED HERE: the
-- authority arm comes forward with the rung, byte-exact from the canonical s5; the TEMPLATE
-- arm, its own local v_blocked_name and its half of the token stay in D-b2 with the table
-- they read. Each family's guard now ships with its family, which is the split's own rule.
-- THE DECLARATION IS NARROWED, NOT SKIPPED: v_blocked_id comes forward because both arms
-- share it; v_blocked_name is the TEMPLATE arm's alone and is added by D-b2 with that arm.
-- THE IDEMPOTENCY MARKER STILL KEYS ON THE RUNG, not on the token: the token is now minted
-- ONCE here and a SECOND time by D-b2, so a probe keyed on it would mis-read D-b2's apply as
-- a duplicate. The rung is added exactly once, by this slice, and the pre-existing marker
-- census below already carries ('pg_advisory_xact_lock', 0) as a NEGATIVE marker.
-- FINAL FORM: D-b2 adds the clara.adjustment_templates arm above this one and restores the
-- whole-unit counts (token x2, `cadence = 'annual'` x2, both guards ordered under the rung).
set role clara_fn_owner;

do $s5_12$
declare
  v_sig text := 'clara.set_client_fy_end(uuid,integer,integer,text)';
  v_def text; v_frm text; v_cnt int; v_n int; r record;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if v_def is null then
    raise exception '0042 S5.12 prestate: clara.set_client_fy_end is GONE' using errcode = 'CLR10';
  end if;
  if position('pg_advisory_xact_lock(203005004' in v_def) <> 0 then
    raise exception '0042 S5.12 prestate: set_client_fy_end already takes the client rung -- this splice has already been applied to this database'
      using errcode = 'CLR10';
  end if;
  -- The zero-count row is a NEGATIVE marker and is counted by the same formula (an absent
  -- marker yields 0): this verb takes NO advisory lock today, and that fact is exactly what
  -- this splice changes -- so it is measured rather than assumed.
  for r in select * from (values
      ('fa_particulars_invalid', 1),
      ('fy_end_month', 2),
      ('clara._audit', 1),
      ('clara._finish_op', 1),
      ('pg_advisory_xact_lock', 0)) as t(marker, want) loop
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '0042 S5.12 prestate: set_client_fy_end carries the marker "%" % time(s), expected % -- the body drifted or lost a prior splice', r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (a) THE DECLARATION gains the guard variable this slice's arm needs.
  -- [SPLIT D-b0 2026-08-04] NARROWED: v_blocked_id only. v_blocked_name is read by the TEMPLATE
  -- arm's raise alone, so it is declared by D-b2 together with that arm -- a local added for
  -- a body that is not shipped is a dangling edit D-b2 would then have to detect.
  v_frm := $f$declare c record; v_dedupe jsonb; v_firm uuid;$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0042 S5.12 prestate (a): the declaration line appears % time(s) (expected exactly once)', v_cnt
      using errcode = 'CLR10';
  end if;
  v_def := replace(v_def, v_frm,
    $t$declare c record; v_dedupe jsonb; v_firm uuid; v_blocked_id uuid;$t$);

  -- (b) THE RUNG + THE DEPRECIATION-AUTHORITY GUARD, after the calendar-day validation (so a
  -- malformed month or day is still named by its own axis first) and before the UPDATE. The
  -- anchor, the validation text, the rung and the authority arm are all byte-exact from the
  -- whole unit; the only narrowing is the ABSENCE of the clara.adjustment_templates arm.
  v_frm := $f$  if p_month is null or p_day is null or p_month < 1 or p_month > 12 or p_day < 1 or p_day > 31
     or (p_month = 2 and p_day > 29)
     or (p_month in (4, 6, 9, 11) and p_day > 30) then
    raise exception 'a financial-year end must be a real calendar day (month 1..12, day valid for that month)'
      using errcode = 'CLR37', detail = '{"reason":"fa_particulars_invalid","axis":"fy_end"}';
  end if;$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0042 S5.12 prestate (b): the calendar-day validation appears % time(s) (expected exactly once)', v_cnt
      using errcode = 'CLR10';
  end if;
  v_def := replace(v_def, v_frm,
    $t$  if p_month is null or p_day is null or p_month < 1 or p_month > 12 or p_day < 1 or p_day > 31
     or (p_month = 2 and p_day > 29)
     or (p_month in (4, 6, 9, 11) and p_day > 30) then
    raise exception 'a financial-year end must be a real calendar day (month 1..12, day valid for that month)'
      using errcode = 'CLR37', detail = '{"reason":"fa_particulars_invalid","axis":"fy_end"}';
  end if;
  -- 0042 (Wave D-b, design SS2.2): THE RUNG BEFORE THE GUARD READS. Same client advisory id
  -- every D-b and D-a writer takes, so an FY-end change and a concurrent occurrence or
  -- depreciation run are serialised -- one of them is the named loser -- rather than racing
  -- through a check-then-act window.
  perform pg_advisory_xact_lock(203005004, hashtext(p_client::text));
  -- AN ANNUAL CADENCE DERIVES ITS PERIOD FROM THIS VERY SETTING. Moving the year end under a
  -- live annual machine silently redefines every period it has already met and every one it
  -- is about to run: a receipt naming a financial year would stop describing the window the
  -- oracle computes, and a re-run would post a second charge into a period the books already
  -- report. Remedy named on both arms -- retire the annual machine, move the year end, then
  -- propose or sign it again against the new one.
  -- MONTHLY CADENCES DO NOT BLOCK: a calendar month is FY-independent, and refusing on one
  -- would make this guard unfollowable on a client whose only live machine is monthly.
  -- [SPLIT D-b0 2026-08-04] ONE OF THE TWO ARMS THAT PARAGRAPH DESCRIBES IS HERE. The
  -- recurring-adjustment TEMPLATE arm ("Remedy named on both arms") reads a D-b2 relation and
  -- is inserted ABOVE this one by D-b2's own splice, against the rung this one already sits
  -- under. What follows is byte-exact from the canonical s5; nothing about it was re-derived.
  -- The template relation is deliberately NOT NAMED in this comment: the postcheck below
  -- asserts that name ABSENT from the body, and pg_get_functiondef carries comments, so a
  -- note that spelled it would fail this block's own census -- which is exactly what it did
  -- on the first cut of this splice, and exactly what the census exists to catch.
  select au.id into v_blocked_id
    from clara.fa_depreciation_authorities au
    where au.client_id = p_client and au.status = 'live' and au.cadence = 'annual'
    limit 1;
  if v_blocked_id is not null then
    raise exception 'this client has a live ANNUAL-cadence depreciation authority; retire it before moving the financial-year end, then sign a fresh authority against the new one'
      using errcode = 'CLR38',
        detail = jsonb_build_object('reason', 'fy_end_locked_by_annual_cadence',
          'axis', 'depreciation_authority', 'authority_id', v_blocked_id)::text;
  end if;$t$);
  execute v_def;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  -- [SPLIT D-b0 2026-08-04] THE POSTCHECK IS EXACT ON BOTH SIDES: what this slice adds must be
  -- PRESENT at its exact count, and what D-b2 owns must be ABSENT. Half a guard is not a
  -- half-measure to be tolerated silently -- it is a state a reader must be able to
  -- distinguish from the finished law, so both halves of that fact are asserted.
  for r in select * from (values
      ('pg_advisory_xact_lock(203005004', 1),
      ('clara.fa_depreciation_authorities', 1),
      ('fy_end_locked_by_annual_cadence', 1),
      ('v_blocked_id uuid;', 1),
      ('fa_particulars_invalid', 1),
      ('fy_end_month', 2),
      ('clara._audit', 1),
      ('clara._finish_op', 1),
      -- THE D-b2 HALF, ASSERTED ABSENT. A zero-count row is counted by the same formula (an
      -- absent marker yields 0), the idiom this block's own prestate census already uses.
      ('clara.adjustment_templates', 0),
      ('v_blocked_name', 0)) as t(marker, want) loop
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '0042 S5.12 postcheck: marker "%" is now % (expected %) -- FORWARD TOLERANCE: D-b2 restores the whole-unit counts (fy_end_locked_by_annual_cadence x2, clara.adjustment_templates x1, v_blocked_name x1) when it adds the template arm', r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;
  -- ORDERED, ALL-PRESENT: the rung precedes the guard read, and the guard precedes the write.
  -- [SPLIT D-b0 2026-08-04] the whole unit orders BOTH guards between the rung and the UPDATE; the
  -- template half of that ordering claim lands in D-b2 with the arm it is about.
  if not (position('pg_advisory_xact_lock(203005004' in v_def) > 0
          and position('clara.fa_depreciation_authorities' in v_def) > 0
          and position('update clara.clients set fy_end_month' in v_def) > 0
          and position('pg_advisory_xact_lock(203005004' in v_def)
              < position('clara.fa_depreciation_authorities' in v_def)
          and position('clara.fa_depreciation_authorities' in v_def)
              < position('update clara.clients set fy_end_month' in v_def)) then
    raise exception '0042 S5.12 postcheck: the client rung does not precede the depreciation-authority guard, or that guard does not precede the FY-end UPDATE'
      using errcode = 'CLR10';
  end if;
  -- THE MONTHLY CARVE-OUT IS STRUCTURAL, NOT INCIDENTAL: the guard must filter on the annual
  -- cadence literally, or a monthly machine would block a lawful FY-end change.
  -- [SPLIT D-b0 2026-08-04] ONE arm, so ONE occurrence; the whole unit counts two.
  if (length(v_def) - length(replace(v_def, $p$cadence = 'annual'$p$, '')))
     / length($p$cadence = 'annual'$p$) <> 1 then
    raise exception '0042 S5.12 postcheck: the depreciation-authority guard does not filter on the annual cadence -- a monthly authority would block the FY-end change'
      using errcode = 'CLR10';
  end if;
  if (select p.proowner::regrole::text from pg_proc p where p.oid = v_sig::regprocedure)
     <> 'clara_fn_owner' then
    raise exception '0042 S5.12 postcheck: set_client_fy_end changed owner' using errcode = 'CLR10';
  end if;
  raise notice '0042 S5.12 OK (D-b0 slice): set_client_fy_end takes the 203005004 client rung and refuses while a live ANNUAL-cadence DEPRECIATION AUTHORITY exists; monthly cadences do not block; the clara.adjustment_templates arm ships with D-b2.';
end $s5_12$;
reset role;

-- =====================================================================================
-- S5.13 -- clara._fa_assert_code_unreserved: THE SHARED RESERVATION UNION, LEAF KEPT
-- (design SS2.1 / SS3.1).
--
-- THE BANK BELT STAYS A LEAF TAKER (design SS2.1's leaf census: takers are every door that
-- WRITES role-claiming state; posting and approve paths are never takers, leaf-LAST). The
-- clara._fa_lock_roles acquisition at the top of this body is therefore PRESERVED exactly as
-- it stands -- this recut widens WHAT the belt reads, never WHEN it locks.
--
-- FA FIRST, THEN THE WIDER UNION -- and that ordering is the point. The FA arm keeps its live
-- token (coa_account_fa_reserved) and its cost-account pointer, which clara._fa_reserved_roles
-- is the only reader able to supply, so 0041's contract is untouched. The union arm below then
-- covers what D-b adds: ACTIVE staff-advance enrolments and their register rows. Reading
-- through clara._acct_role_reserved for the second arm rather than re-listing its members here
-- is what keeps the enrolment doors, the template line-eligibility check and this belt from
-- ever disagreeing about what "reserved" means (design SS2.1: one predicate, every door).
--
-- ONE SENTENCE OF THE FA ARM IS RECUT, AND IT HAD TO BE [round-4 LOW]. The live 0041 wording
-- ended "a code this client has ever carried on a register row stays reserved, so retiring the
-- enrolment does not release it" -- a REFUSAL PROMISING PERMANENCE, and 0042 S5.15 makes it
-- FALSE eighty lines later in this same migration: a disposed, superseded or unwound register
-- row now releases its codes. Leaving it byte-for-byte would have shipped a message that tells
-- a professional to stop trying when the act they need is available, which is the WDB-R2
-- class exactly (a refusal must name a followable remedy, or say honestly that there is none).
-- The token, the errcode, the detail payload and the arm's position are all unchanged; only
-- the promise is replaced by the two release paths that actually exist -- and the same
-- correction was made to clara._adv_enrolment_admission's mirror sentence in SECTION S3, so
-- the two doors still say the same thing about the same fact.
--
-- WHY A BANK ACCOUNT MAY NEVER BIND AN ENROLLED ADVANCE CODE (design SS3.1): the advance
-- register derives every movement from journal legs on the enrolled code, and the bank belt
-- writes its own legs there; a code playing both roles would move the advance register's
-- numbers from a door the advance machine never sees. Token per adjudication S5-A3.
-- =====================================================================================
set role clara_fn_owner;

do $s5_13$
declare
  v_sig text := 'clara._fa_assert_code_unreserved(uuid,text)';
  v_def text; v_frm text; v_cnt int; v_n int; r record;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if v_def is null then
    raise exception '0042 S5.13 prestate: clara._fa_assert_code_unreserved is GONE' using errcode = 'CLR10';
  end if;
  if position('clara._acct_role_reserved' in v_def) <> 0 then
    raise exception '0042 S5.13 prestate: the bank belt already reads the shared reservation union -- this splice has already been applied to this database'
      using errcode = 'CLR10';
  end if;
  for r in select * from (values
      ('coa_account_fa_reserved', 1),
      ('clara._fa_lock_roles(p_client)', 1),
      ('clara._fa_reserved_roles(p_client)', 1)) as t(marker, want) loop
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '0042 S5.13 prestate: _fa_assert_code_unreserved carries the marker "%" % time(s), expected % -- the body drifted or lost a prior splice', r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (a) THE DECLARATION gains the union arm's two variables.
  v_frm := $f$declare v_role text; v_owner text;$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0042 S5.13 prestate (a): the declaration line appears % time(s) (expected exactly once)', v_cnt
      using errcode = 'CLR10';
  end if;
  v_def := replace(v_def, v_frm,
    $t$declare v_role text; v_owner text; v_domain text; v_reserved_role text;$t$);

  -- (b) THE UNION ARM, appended after the FA arm (which is preserved byte-for-byte).
  v_frm := $f$  if v_role is not null then
    raise exception 'chart account % is reserved by the fixed-asset register (% role, cost account %) and cannot back a bank account; pick a different account -- a code this client has ever carried on a register row stays reserved, so retiring the enrolment does not release it', p_code, v_role, v_owner
      using errcode = 'CLR10',
        detail = jsonb_build_object('reason', 'coa_account_fa_reserved', 'account_code', p_code,
          'fa_role', v_role, 'fa_profile_asset_account', v_owner)::text;
  end if;$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0042 S5.13 prestate (b): the FA reservation refusal appears % time(s) (expected exactly once) -- the body drifted; re-derive this splice', v_cnt
      using errcode = 'CLR10';
  end if;
  v_def := replace(v_def, v_frm,
    $t$  if v_role is not null then
    raise exception 'chart account % is reserved by the fixed-asset register (% role, cost account %) and cannot back a bank account; pick a different account, or release the claim first -- an ACTIVE profile releases its codes on retire_fa_account_profile, and a register row holds the three codes it was born with until that row is disposed, superseded or its acquisition is reversed', p_code, v_role, v_owner
      using errcode = 'CLR10',
        detail = jsonb_build_object('reason', 'coa_account_fa_reserved', 'account_code', p_code,
          'fa_role', v_role, 'fa_profile_asset_account', v_owner)::text;
  end if;
  -- 0042 (Wave D-b, design SS2.1 / SS3.1): THE SHARED RESERVATION UNION. The FA arm above is
  -- untouched -- same message, same token, same cost-account pointer -- and this arm covers
  -- what D-b adds to the predicate: ACTIVE staff-advance enrolments and the register rows
  -- born on them. Read through the ONE reservation reader rather than re-listing its members
  -- here, so this belt, the enrolment doors and the adjustment-template line-eligibility
  -- check can never come to disagree about what "reserved" means. A bank account bound to an
  -- enrolled advance code would move the advance register's numbers through a door the
  -- advance machine never sees; the leaf acquired at the top of this body is what makes the
  -- read a decision rather than a snapshot.
  select rr.domain, rr.role into v_domain, v_reserved_role
    from clara._acct_role_reserved(p_client, p_code) rr limit 1;
  if v_domain is not null then
    raise exception 'chart account % is reserved by the % register (% role) and cannot back a bank account; pick a different account', p_code, v_domain, v_reserved_role
      using errcode = 'CLR10',
        detail = jsonb_build_object('reason', 'coa_account_advance_reserved',
          'account_code', p_code, 'reservation_domain', v_domain,
          'reservation_role', v_reserved_role)::text;
  end if;$t$);
  execute v_def;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  for r in select * from (values
      ('clara._acct_role_reserved(p_client, p_code)', 1),
      ('coa_account_advance_reserved', 1),
      ('coa_account_fa_reserved', 1),
      -- THE FALSE PROMISE IS GONE AND THE REMEDY IS THERE [round-4 LOW]. Asserted as a pair:
      -- a splice that dropped the arm entirely would satisfy the first line alone.
      ('stays reserved, so retiring the enrolment does not release it', 0),
      ('or release the claim first', 1),
      ('retire_fa_account_profile', 1),
      ('clara._fa_lock_roles(p_client)', 1),
      ('clara._fa_reserved_roles(p_client)', 1)) as t(marker, want) loop
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '0042 S5.13 postcheck: marker "%" is now % (expected %)', r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;
  -- THE LEAF IS STILL ACQUIRED FIRST, AND BOTH READS SIT UNDER IT (design SS2.1, leaf-LAST).
  if not (position('clara._fa_lock_roles(p_client)' in v_def) > 0
          and position('clara._fa_reserved_roles(p_client)' in v_def) > 0
          and position('clara._acct_role_reserved(p_client, p_code)' in v_def) > 0
          and position('clara._fa_lock_roles(p_client)' in v_def)
              < position('clara._fa_reserved_roles(p_client)' in v_def)
          and position('clara._fa_reserved_roles(p_client)' in v_def)
              < position('clara._acct_role_reserved(p_client, p_code)' in v_def)) then
    raise exception '0042 S5.13 postcheck: the role leaf is no longer acquired before both reservation reads'
      using errcode = 'CLR10';
  end if;
  if (select p.proowner::regrole::text from pg_proc p where p.oid = v_sig::regprocedure)
     <> 'clara_fn_owner' then
    raise exception '0042 S5.13 postcheck: _fa_assert_code_unreserved changed owner' using errcode = 'CLR10';
  end if;
  raise notice '0042 S5.13 OK: the bank belt consults the shared reservation union (FA profiles + FA register + ACTIVE advance enrolments + their register rows) and keeps both its leaf acquisition and the live FA token.';
end $s5_13$;

reset role;

-- #####################################################################################
-- ##### S5.15..S5.18 -- THE RESERVATION AUTHORITY, ERADICATED AT ITS ROOT           ####
-- ##### (owner ruling 2026-08-03: WDB-R1 root-not-symptom, WDB-R3 symmetry,         ####
-- #####  WDB-R4 a cell that asks what the fix did not think of.)                    ####
-- #####################################################################################
-- Everything above this line was faithful to design SS8's change-of-record register. These
-- four are NOT in that register: they recut LIVE 0041 bodies because that is where the two
-- defects the ruling names actually live. WDB-R1 widened the scope for exactly this; the
-- CoR law is unchanged and every splice below carries it in full.
--
-- ONE SUBJECT, FOUR SPLICES. The subject is the reservation authority, and the ruling found
-- it broken in two directions at once:
--
--   (1) IT IS NOT COMPLETE. clara._fa_reserved_roles' three clara.fixed_assets disjuncts
--       carry no status test, so a register row reserves its three codes FOREVER -- through
--       disposal, through supersession, through an unwound acquisition. Because
--       clara._acct_role_reserved unions that reader, the poison reaches every D-b door.
--       Measured consequence (ladder round 3): a code a disposed asset once carried can
--       never be re-enrolled as a staff-advance account, so a historical advance entry
--       becomes PERMANENTLY un-reversible -- a correction the books must record and cannot.
--       S5.15 closes it, and it closes it for EVERY terminal status rather than the one the
--       finding named (see the truth-table census in that block: `disposed` is one of THREE).
--
--   (2) IT IS ONE-DIRECTIONAL (residue R6, ruled in as WDB-R3). clara.enrol_staff_advance_
--       account consults the shared union, so advance-after-FA is refused; but the FA-side
--       claiming doors read only the FA-side reader, so FA-after-advance is ADMITTED. Both
--       registers then believe they own one account: a depreciation debit soft-births a
--       phantom advance row and a credit refuses advance_application_missing, and
--       staff_advance_tie and fa_register_tie both report on the same code. S5.16 and S5.17
--       make the union the single authority BOTH FA claiming doors consult.
--
-- THE CLAIMING-DOOR CENSUS THAT DECIDED S5.17 (measured on the live catalog, not assumed --
-- the work order said do not trust the list of three everybody already knew). Every body
-- that WRITES role-claiming state, with what it consults today:
--   clara.upsert_fa_account_profile   fa_account_profiles      FA-side reader only  -> S5.16
--   clara._draft_opening_item_core    fixed_assets (K carry)   NOTHING AT ALL       -> S5.17
--   clara.enrol_staff_advance_account staff_advance_accounts   the shared union  ok
--   clara._adv_on_approve             staff_advances           the shared union  ok
--   clara.add_bank_account and every other bank door           the shared union  ok, and
--     structurally: t_bank_accounts_fa_reserved fires clara._fa_assert_code_unreserved on
--     INSERT OR UPDATE OF coa_account_code, active -- no bank door can bypass it.
--   clara.revise_fixed_asset_particulars / clara._fa_on_approve / clara.
--     complete_fixed_asset_particulars  INHERIT their codes (copied from a predecessor row
--     or read off the active profile) and never choose one, so they are not claiming doors
--     and are deliberately left alone.
-- clara._draft_opening_item_core was the surprise: it takes all three codes straight from
-- the K-doc payload, validates only that they are real active non-control chart accounts,
-- and is publicly reachable (clara.seed_fixed_asset is granted to clara_authenticated). It
-- could claim an actively-enrolled advance code in ONE act where the R6 route needs two.
--
-- ADDITIONAL ASSEMBLY ADJUDICATIONS (recorded here for the same reason S5-A1..A3 are; all
-- reported to the orchestrator rather than resolved silently):
--   S5-A4. THE SEED DOOR'S RESERVATION REFUSAL TAKES CLR10 / coa_account_advance_reserved,
--          not this family's usual CLR31 / tie_mismatch. Same reasoning as S5-A2 chose CLR37
--          for the lineage law: ONE reservation law, ONE token, so a professional who hits
--          the reservation from the bank belt, from the enrolment door and from the K-doc
--          seed catches the same thing. Safe: the only handler in that body is `exception
--          when unique_violation`, which never sees a raised CLR10, and no caller of
--          clara._draft_opening_item_core catches CLR31 (census: clara.draft_opening_item,
--          clara.supersede_opening_item, clara.seed_fixed_asset -- none has a handler).
--   S5-A5. THE RESURRECTION GUARD MINTS fa_reverse_role_reclaimed (CLR39) -- an additive
--          token on the 0041 FA-reversal family, the S5-A3 precedent. ABI SSF names no token
--          for it because the condition could not exist before S5.15 made a terminal row's
--          codes releasable. S5.18 is blast radius of S5.15 and is shipped WITH it.
--   S5-A6. THE FA PROFILE DOOR MINTS NO TOKEN AT ALL. Its refusal reuses the live
--          fa_profile_invalid / CLR37 pair with a NEW AXIS, `role_reserved` -- which is the
--          exact axis clara._adv_enrolment_admission already uses for the same question in
--          the other direction. One question, one axis name, both directions.
--
-- WHAT THESE FOUR DELIBERATELY DO NOT DO -- the honest edge of the fix, reported not hidden:
--   * They do not add the BANK domain as a MEMBER of clara._acct_role_reserved. It is only a
--     CONSUMER today, which is why clara.upsert_fa_account_profile and clara._adv_enrolment_
--     admission each hand-roll their own bank probe -- the recurring shape WDB-R2 dislikes.
--     Promoting it is NOT a build call: clara._fa_assert_code_unreserved runs as an AFTER
--     trigger on clara.bank_accounts and would refuse every bank account against its own row,
--     and clara._adj_line_eligibility_breach and clara.accept_bank_rule_suggestion would
--     begin refusing bank-account codes on adjustment-template and coding-suggestion lines --
--     a behaviour change on the AF-2 producer that no design ruling covers. Owner's call.
--   * They do not silence clara.fa_register_tie. Its pair universe is every clara.
--     fixed_assets row with no status filter, so a terminal row's codes stay in the tie
--     forever -- correctly reading 0 against 0 once the disposal has relieved both legs. Once
--     S5.15 makes those codes re-claimable, a code re-used by another domain or another role
--     makes that row report a real difference. That is the tie telling the truth (GL account
--     X carries movement the fixed-asset register does not hold) and it is exactly what a
--     professional should be told; muting it would be the actual defect. It is pinned by a
--     cell rather than left to be "fixed" into silence later.

-- =====================================================================================
-- S5.15 -- clara._fa_reserved_roles: THE LIFECYCLE GATE (owner ruling 2026-08-03, WDB-R1).
--
-- WHY THE REGISTER-ROW DISJUNCTS EXIST AT ALL, because the gate has to keep that intact.
-- 0041 round-3.5 fold G4 added them: a register row BAKES its three codes at birth and keeps
-- posting to them after the profile that named them is version-forwarded or retired, so
-- scoping the predicate to active profiles freed a code that was still moving the register's
-- numbers. That reasoning is about rows that can STILL POST. It says nothing about a row
-- whose life is over, and the disjuncts were written with no status test at all -- so the
-- true statement "a live register row reserves its codes" was implemented as the much larger
-- false one "any row that ever existed reserves its codes, permanently".
--
-- THE LINE IS DRAWN AT "CAN THIS ROW STILL MOVE MONEY ON THESE CODES", NOT AT "WAS IT EVER
-- DISPOSED". The finding named `disposed`. The CHECK constraint names FIVE statuses
-- (fixed_assets_status_check_0017: pending, active, disposed, superseded, unwound) and THREE
-- of them are terminal, so fixing only the one the finding named would have left two thirds
-- of the defect standing:
--   pending    RESERVES. A K carry-down whose acquisition entry is still a draft; it will
--              become active on approval, and freeing its codes inside the maker-checker
--              window is precisely the race the reservation exists to lose safely.
--   active     RESERVES. Self-evident.
--   disposed   releases. Cost and accumulated are both fully relieved by the disposal entry,
--              clara.run_depreciation_manual will not charge it and clara.dispose_fixed_asset
--              refuses a second disposal (`only an active register row can be disposed`).
--   superseded releases. clara.fixed_assets' 0017 CHECK guarantees a superseded row HAS a
--              successor, and every minting path (clara.revise_fixed_asset_particulars, the
--              partial-split arm of clara._fa_on_approve) copies the three codes forward -- so
--              the successor already reserves them and the predecessor's claim is redundant.
--              When the whole lineage is terminal, nothing should reserve, which is the point.
--   unwound    releases. The acquisition entry was reversed; the GL carries nothing.
--
-- A NAMED PREDICATE, NOT A LITERAL LIST, AND IT FAILS CLOSED. The classification is a body
-- (clara._fa_status_holds_account_role) with a terminal `raise` rather than three inline
-- `status in (...)` lists, for the reason WDB-R2 gives: a sixth status added by some later
-- migration must be CLASSIFIED, not silently treated as releasing. An unclassified status
-- raises fa_status_unclassified on every reservation read rather than quietly freeing a code
-- somebody is still posting to -- and the census at the foot of this block walks the CHECK
-- constraint's own value list through the predicate, so that migration fails HERE, at build
-- time, with the reason named, rather than in production.
-- =====================================================================================
set role clara_fn_owner;

create function clara._fa_status_holds_account_role(p_status text)
  returns boolean
  language plpgsql immutable as $$
begin
  -- LIVE: this row can still move money on the three codes it baked at birth -- a pending
  -- carry-down will post when its acquisition entry is approved, an active row is charged by
  -- clara.run_depreciation_manual and relieved by clara.dispose_fixed_asset. Its claim stands.
  if p_status in ('pending', 'active') then return true; end if;
  -- TERMINAL: the row can never post again and its GL legs have been relieved (disposal), or
  -- carried forward onto a successor that reserves the codes itself (supersession), or
  -- reversed away entirely (unwound). Holding the codes past this point is not a guard, it is
  -- a permanent poison -- and it made a lawful correction un-recordable.
  if p_status in ('disposed', 'superseded', 'unwound') then return false; end if;
  raise exception 'fixed-asset status % has never been classified as holding or releasing an account-role reservation; classify it in clara._fa_status_holds_account_role before any register row can carry it', coalesce(p_status, '(null)')
    using errcode = 'CLR37',
      detail = jsonb_build_object('reason', 'fa_status_unclassified', 'status', p_status)::text;
end $$;
revoke all on function clara._fa_status_holds_account_role(text) from public;

do $s5_15$
declare
  v_sig text := 'clara._fa_reserved_roles(uuid)';
  v_def text; v_frm text; v_cnt int; v_n int; r record;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if v_def is null then
    raise exception '0042 S5.15 prestate: clara._fa_reserved_roles is GONE' using errcode = 'CLR10';
  end if;
  if position('clara._fa_status_holds_account_role' in v_def) <> 0 then
    raise exception '0042 S5.15 prestate: clara._fa_reserved_roles already carries the lifecycle gate -- this splice has already been applied to this database'
      using errcode = 'CLR10';
  end if;
  -- PRE-EXISTING MARKER CENSUS at counts measured on the live 0001..0041 catalog. The union
  -- has SIX disjuncts: three off clara.fa_account_profiles (already scoped by fp.active, and
  -- deliberately untouched here) and three off clara.fixed_assets (scoped by nothing, which
  -- is the defect). Counted rather than probed: replace() rewrites every occurrence.
  for r in select * from (values
      ('clara.fa_account_profiles fp', 3),
      ('clara.fixed_assets f', 3),
      ('fp.client_id = p_client and fp.active', 3)) as t(marker, want) loop
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '0042 S5.15 prestate: _fa_reserved_roles carries the marker "%" % time(s), expected % -- the body drifted', r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (a)(b)(c) THE THREE REGISTER-ROW DISJUNCTS, one splice each, each asserted at EXACTLY
  -- one occurrence. Three separate anchors rather than one blanket rewrite: if a future
  -- migration reshapes one disjunct, THAT anchor fails by name instead of the whole splice
  -- going vacuously green on the two that still matched.
  for r in select * from (values
      ('cost',    'where f.client_id = p_client and f.asset_account_code is not null'),
      ('accum',   'where f.client_id = p_client and f.accum_depr_account_code is not null'),
      ('expense', 'where f.client_id = p_client and f.depr_expense_account_code is not null'))
      as t(role, anchor) loop
    v_frm := r.anchor;
    v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
    if v_cnt <> 1 then
      raise exception '0042 S5.15 prestate (%): the register-row disjunct anchor appears % time(s) (expected exactly once)', r.role, v_cnt
        using errcode = 'CLR10';
    end if;
    v_def := replace(v_def, v_frm, v_frm || chr(10) ||
      '      and clara._fa_status_holds_account_role(f.status)');
  end loop;
  execute v_def;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  for r in select * from (values
      ('clara._fa_status_holds_account_role(f.status)', 3),
      ('clara.fa_account_profiles fp', 3),
      ('clara.fixed_assets f', 3),
      ('fp.client_id = p_client and fp.active', 3)) as t(marker, want) loop
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '0042 S5.15 postcheck: marker "%" is now % (expected %)', r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;
  -- THE OLD UNGATED FORM IS GONE. A vacuous replace would leave the bare `is not null` line
  -- behind, so its absence is asserted by position rather than inferred from the count above.
  for r in select * from (values
      ('where f.client_id = p_client and f.asset_account_code is not null' || chr(10) || '  union'),
      ('where f.client_id = p_client and f.accum_depr_account_code is not null' || chr(10) || '  union'))
      as t(dead) loop
    if position(r.dead in v_def) <> 0 then
      raise exception '0042 S5.15 postcheck: an UNGATED register-row disjunct survived the splice'
        using errcode = 'CLR10';
    end if;
  end loop;
  if (select p.proowner::regrole::text from pg_proc p where p.oid = v_sig::regprocedure)
     <> 'clara_fn_owner' then
    raise exception '0042 S5.15 postcheck: _fa_reserved_roles changed owner' using errcode = 'CLR10';
  end if;

  -- THE TRUTH TABLE, AND THE CENSUS THAT MAKES IT COMPLETE [WDB-R4: ask what the fix did not
  -- think of]. The finding named ONE status. The proof that all five are handled is not a
  -- comment -- it walks clara.fixed_assets' own CHECK constraint and pushes every value it
  -- admits through the predicate. An unclassified status raises inside the loop, so a later
  -- migration that adds a sixth cannot land while this section is in the tree.
  for r in select unnest(regexp_matches(pg_get_constraintdef(con.oid), '''([a-z_]+)''::text', 'g')) as st
             from pg_constraint con
            where con.conrelid = 'clara.fixed_assets'::regclass
              and con.conname = 'fixed_assets_status_check_0017' loop
    perform clara._fa_status_holds_account_role(r.st);
  end loop;
  if not (clara._fa_status_holds_account_role('pending')
          and clara._fa_status_holds_account_role('active')
          and not clara._fa_status_holds_account_role('disposed')
          and not clara._fa_status_holds_account_role('superseded')
          and not clara._fa_status_holds_account_role('unwound')) then
    raise exception '0042 S5.15 postcheck: the lifecycle truth table is not what this block documents'
      using errcode = 'CLR10';
  end if;
  begin
    perform clara._fa_status_holds_account_role('a_status_nobody_classified');
    raise exception '0042 S5.15 postcheck: an UNCLASSIFIED status was answered instead of refused -- the predicate does not fail closed'
      using errcode = 'CLR10';
  exception when sqlstate 'CLR37' then null;
  end;
  raise notice '0042 S5.15 OK: clara._fa_reserved_roles reserves for pending/active register rows only; disposed, superseded and unwound release; an unclassified status fails closed; the profile disjuncts are untouched.';
end $s5_15$;

reset role;

-- =====================================================================================
-- S5.15b -- clara._fa_role_claim_conflict: THE ONE DISCRIMINATOR (round-4 root fix).
--
-- THE INVARIANT, IN ONE SENTENCE: within a client, an account code carries AT MOST ONE
-- (domain, role) claim across the whole reservation union -- a door claiming the fixed-asset
-- role R may share the code only with an identical (fa, R) claim, and with NOTHING else.
-- Same-role sharing stays lawful and always was: many assets legitimately post to one cost
-- account, and that is what a register IS.
--
-- WHY THIS IS A BODY AND NOT A FOURTH INLINE FILTER -- i.e. why the fix is here and not at
-- the site that was reported. Round 4 measured the failure of the per-door form. S5.17 wrote
-- `rr.domain <> 'fa'` with NO role in its VALUES list, so the K-doc seed door -- publicly
-- reachable through clara.seed_fixed_asset, granted to clara_authenticated -- could bake a
-- register row whose COST code was another LIVE row's ACCUMULATED code; measured consequence,
-- clara.fa_register_tie returning tie=false with a debit-balance "accumulated depreciation"
-- of -400,000 and an unexplained 600,000 difference. S5.18, one hundred and seventy lines
-- later IN THIS SAME MIGRATION, wrote the correct discriminator
-- (`rr.domain <> 'fa' or rr.role <> q.want_role`) and its own comment says a domain-only
-- filter "would have missed exactly half of this". Three doors, three hand-written copies of
-- one rule, one of them wrong. Patching the third copy leaves the CLASS standing -- the
-- fourth door somebody adds next wave writes a fourth copy. So the rule now has exactly ONE
-- expression, every fixed-asset claiming door calls it, and S5.14 (6) FAILS THE MIGRATION if
-- any body re-expresses it inline.
--
-- THE CENSUS OF DOORS THIS PREDICATE MUST COVER, taken from the live catalog rather than from
-- the finding (the finding named one; there are three, plus four bodies that are deliberately
-- NOT members and whose non-membership is proved rather than asserted):
--   MEMBERS -- they claim a specific fixed-asset role, so they need the role-aware rule:
--     clara.upsert_fa_account_profile        (S5.16) -- cost/accum/expense from caller input
--     clara._draft_opening_item_core         (S5.17) -- the same three, from the K-doc payload
--     clara._fa_reversal_blocked             (S5.18) -- the role a resurrected row would carry
--   NON-MEMBERS, because their rule is STRICTLY STRONGER (refuse ANY reservation, including a
--   same-role one) and this predicate would WEAKEN them:
--     clara.enrol_staff_advance_account / clara._adv_enrolment_admission -- a second advance
--       enrolment on one code is a duplicate, not lawful sharing; the empty filter is right.
--     clara._fa_assert_code_unreserved (the bank belt) -- a bank binding shares with nothing.
--     clara._adj_line_eligibility_breach, clara._adv_on_approve, clara.accept_bank_rule_suggestion
--       -- READERS, not claimers: any reservation at all makes a line ineligible.
--   INHERITORS, which choose no code at all (measured in S5.14 (6), not asserted):
--     clara._fa_on_approve, clara.revise_fixed_asset_particulars.
--
-- IT FAILS CLOSED ON AN UNCLASSIFIED ROLE, for the same reason as
-- clara._fa_status_holds_account_role (WDB-R2): a door that passes a role this build has
-- never heard of must be REFUSED, not silently answered "no conflict" -- which is precisely
-- the shape of the defect above, a claim admitted because nobody asked about the role.
-- =====================================================================================
set role clara_fn_owner;

create function clara._fa_role_claim_conflict(p_client uuid, p_code text, p_want_role text)
  returns table(res_domain text, res_role text, res_owner text)
  language plpgsql stable security definer
  set search_path = clara, pg_temp as $$
begin
  -- FAIL CLOSED ON AN UNKNOWN ROLE. The OUT names are res_* rather than domain/role/owner_ref
  -- so no plpgsql name resolution can shadow the union's own columns below.
  if p_want_role is null or p_want_role not in ('cost', 'accum', 'expense') then
    raise exception 'a fixed-asset role claim must name cost, accum or expense; got % -- classify the role in clara._fa_role_claim_conflict before any door can claim in it', coalesce(p_want_role, '(null)')
      using errcode = 'CLR37',
        detail = jsonb_build_object('reason', 'fa_role_unclassified', 'role', p_want_role)::text;
  end if;
  -- THE RULE. `is distinct from` rather than `<>` so a null on either side is a CONFLICT
  -- rather than an unknown that filters the row away -- the same fail-closed direction.
  return query
    select rr.domain, rr.role, rr.owner_ref
      from clara._acct_role_reserved(p_client, p_code) rr
     where p_code is not null
       and (rr.domain is distinct from 'fa' or rr.role is distinct from p_want_role)
     limit 1;
end $$;
revoke all on function clara._fa_role_claim_conflict(uuid, text, text) from public;

do $s5_15b$
declare r record; v_src text;
begin
  -- IT IS LOCK-FREE, like the union it reads (tail 9(d)'s law): it is called from doors that
  -- already hold the fa-roles leaf, and a lock inside it would promote every future read-only
  -- caller into a leaf taker by accident.
  select p.prosrc into v_src from pg_proc p
    where p.oid = 'clara._fa_role_claim_conflict(uuid,text,text)'::regprocedure;
  if position('pg_advisory' in v_src) <> 0 then
    raise exception '0042 S5.15b: the discriminator acquires an advisory lock -- it must be a lock-free stable reader'
      using errcode = 'CLR10';
  end if;
  if (select p.provolatile from pg_proc p
        where p.oid = 'clara._fa_role_claim_conflict(uuid,text,text)'::regprocedure) <> 's'
     or (select p.proowner::regrole::text from pg_proc p
        where p.oid = 'clara._fa_role_claim_conflict(uuid,text,text)'::regprocedure) <> 'clara_fn_owner' then
    raise exception '0042 S5.15b: the discriminator is not a STABLE clara_fn_owner body'
      using errcode = 'CLR10';
  end if;
  -- AND IT REFUSES AN UNCLASSIFIED ROLE. Asserted, not commented: a predicate that answered
  -- "no conflict" for a role nobody classified would reproduce the exact defect S5.15b exists
  -- to end -- an admission that came from a question never asked.
  for r in select * from (values ('depreciation'), ('proceeds'), (null)) as t(bad_role) loop
    begin
      perform 1 from clara._fa_role_claim_conflict(null::uuid, 'X', r.bad_role);
      raise exception '0042 S5.15b: role "%" was ANSWERED instead of refused -- the discriminator does not fail closed', coalesce(r.bad_role, '(null)')
        using errcode = 'CLR10';
    exception when sqlstate 'CLR37' then null;
    end;
  end loop;
  raise notice '0042 S5.15b OK: clara._fa_role_claim_conflict is the single expression of the at-most-one-role-per-account rule; lock-free, stable, fn-owner owned, and it refuses an unclassified role.';
end $s5_15b$;

reset role;

-- =====================================================================================
-- S5.16 -- clara.upsert_fa_account_profile: THE RESERVATION BECOMES SYMMETRIC (WDB-R3).
--
-- THE HOLE, EXACTLY (residue R6, the highest-severity one on that list and the only one with
-- an accounting-correctness consequence). clara.enrol_staff_advance_account reads the FULL
-- union and refuses a code the FA family owns. This body reads clara._fa_reserved_roles --
-- the FA-SIDE reader -- and therefore cannot see staff-advance enrolments at all. So the gate
-- holds in one direction and is open in the other: enrol `X` as a staff-advance account, then
-- bind `X` as an FA cost / accumulated / expense account, and BOTH registers believe they own
-- it. A depreciation charge then posts to a code the advance movement belt guards -- the debit
-- leg SOFT-BIRTHS a staff-advance register row for a depreciation charge, the credit leg
-- refuses advance_application_missing, and clara.staff_advance_tie and clara.fa_register_tie
-- both report on the same account while disagreeing about what it holds.
--
-- THE FIX IS A READ, NOT A NEW RULE. The union already returns (domain, role, owner_ref) and
-- already knows about ACTIVE enrolments and the register rows born on them; nothing new is
-- being decided here, the door is simply being made to ASK. Symmetry is the entire reason
-- clara._acct_role_reserved exists (design SS2.1: one predicate, every door).
--
-- ARM ORDER IS DELIBERATE AND MATCHES clara._fa_assert_code_unreserved: the FA-granular arms
-- (accum_shared, role_overlap) keep running FIRST and keep their live messages byte-for-byte,
-- because they can name the offending SISTER PROFILE and a cross-domain read cannot. This arm
-- is appended after the bank probe. No live refusal changes.
--
-- ROUND-4 ROOT FIX: THE FILTER IS NOT WRITTEN HERE. This arm originally hand-wrote
-- `rr.domain <> 'fa'`, which was the THIRD inline copy of the at-most-one-role-per-account
-- rule in this migration -- and the copy S5.17 made was wrong. It now calls
-- clara._fa_role_claim_conflict (S5.15b), the ONE expression of that rule, with the role this
-- door is claiming. WHY THAT CHANGES NO LIVE REFUSAL, proved rather than hoped: the widened
-- predicate additionally reports (fa, other-role) claims, and every one of those is ALREADY
-- refused above by the role_overlap arm, whose probe is the same set
-- (`_fa_reserved_roles ... where account_code = d.code and fa_role <> d.want_role`) evaluated
-- FIRST. So the new arm's fa-side results are structurally unreachable here; what it adds is
-- that this door can no longer DRIFT from the rule, because it no longer states it.
--
-- THE REMEDY IS NAMED HONESTLY, WITH ITS OWN PRECONDITION [WDB-R2]. It says
-- retire_staff_advance_account AND that the verb needs every advance on the enrolment
-- settled -- copied from clara._adv_enrolment_admission's own wording for the same question
-- in the other direction. A refusal that named the verb without its precondition would be
-- asserting an admission this body has not checked, which is the walled-corridor class.
-- =====================================================================================
set role clara_fn_owner;

do $s5_16$
declare
  v_sig text := 'clara.upsert_fa_account_profile(uuid,text,text,text,text)';
  v_def text; v_frm text; v_cnt int; v_n int; r record;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if v_def is null then
    raise exception '0042 S5.16 prestate: clara.upsert_fa_account_profile is GONE' using errcode = 'CLR10';
  end if;
  if position('clara._acct_role_reserved' in v_def) <> 0
     or position('clara._fa_role_claim_conflict' in v_def) <> 0 then
    raise exception '0042 S5.16 prestate: the FA profile door already consults the shared reservation union -- this splice has already been applied to this database'
      using errcode = 'CLR10';
  end if;
  for r in select * from (values
      ('clara._fa_lock_roles(p_client)', 1),
      ('clara._fa_reserved_roles(p_client)', 2),
      ('''axis'', ''role_overlap''', 1),
      ('''axis'', ''reserved_account''', 1)) as t(marker, want) loop
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '0042 S5.16 prestate: upsert_fa_account_profile carries the marker "%" % time(s), expected % -- the body drifted or lost a prior splice', r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (a) THE DECLARATION gains the three facts the union returns.
  v_frm := $f$        v_clash text; v_had_live boolean; d record;$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0042 S5.16 prestate (a): the declaration tail appears % time(s) (expected exactly once)', v_cnt
      using errcode = 'CLR10';
  end if;
  v_def := replace(v_def, v_frm,
    $t$        v_clash text; v_had_live boolean; d record;
        v_res_domain text; v_res_role text; v_res_owner text;$t$);

  -- (b) THE CROSS-DOMAIN ARM, appended after the bank probe (which is preserved
  -- byte-for-byte) and before the version-forward write.
  v_frm := $f$  if v_clash is not null then
    raise exception 'account % is a registered bank account for this client and cannot be enrolled in the fixed-asset register', v_clash
      using errcode = 'CLR37',
        detail = jsonb_build_object('reason', 'fa_profile_invalid', 'axis', 'reserved_account',
          'account_code', v_clash)::text;
  end if;$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0042 S5.16 prestate (b): the bank-account refusal appears % time(s) (expected exactly once) -- the body drifted; re-derive this splice', v_cnt
      using errcode = 'CLR10';
  end if;
  v_def := replace(v_def, v_frm,
    $t$  if v_clash is not null then
    raise exception 'account % is a registered bank account for this client and cannot be enrolled in the fixed-asset register', v_clash
      using errcode = 'CLR37',
        detail = jsonb_build_object('reason', 'fa_profile_invalid', 'axis', 'reserved_account',
          'account_code', v_clash)::text;
  end if;
  -- 0042 (owner ruling 2026-08-03, WDB-R3): THE SHARED RESERVATION UNION, CONSULTED FROM THIS
  -- SIDE TOO. clara.enrol_staff_advance_account has always read the full union and refused a
  -- code the fixed-asset family owns; this door read only the FA-side reader, so the same
  -- collision approached from the other direction was ADMITTED and both registers ended up
  -- believing they owned one account. The FA-granular arms above stay first and unchanged --
  -- they can name the offending sister profile, which a cross-domain read cannot -- and this
  -- arm asks the SHARED DISCRIMINATOR (0042 S5.15b) rather than restating its rule, so it
  -- fires on everything those arms structurally cannot see and cannot drift from them.
  -- The leaf taken above covers this read as well, so a concurrent enrolment of the same code
  -- is serialised rather than raced.
  select q.code, cf.res_domain, cf.res_role, cf.res_owner
    into v_clash, v_res_domain, v_res_role, v_res_owner
    from (values ('cost', p_asset_account), ('accum', p_accum_account),
                 ('expense', p_depr_expense_account)) as q(want_role, code)
    cross join lateral clara._fa_role_claim_conflict(p_client, q.code, q.want_role) cf
    where q.code is not null
    limit 1;
  if v_res_domain is not null then
    raise exception 'account % is already reserved by the % register (% role, owner %) for this client and cannot be enrolled in the fixed-asset register; retire that enrolment first (retire_staff_advance_account, which needs every advance on it settled), or enrol this profile on a different account', v_clash, v_res_domain, v_res_role, coalesce(v_res_owner, '(unnamed)')
      using errcode = 'CLR37',
        detail = jsonb_build_object('reason', 'fa_profile_invalid', 'axis', 'role_reserved',
          'account_code', v_clash, 'reserved_domain', v_res_domain,
          'reserved_role', v_res_role, 'reserved_owner', v_res_owner)::text;
  end if;$t$);
  execute v_def;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  for r in select * from (values
      ('clara._fa_role_claim_conflict(p_client, q.code, q.want_role)', 1),
      ('clara._acct_role_reserved', 0),
      ('''axis'', ''role_reserved''', 1),
      ('''axis'', ''reserved_account''', 1),
      ('''axis'', ''role_overlap''', 1),
      ('clara._fa_lock_roles(p_client)', 1),
      ('clara._fa_reserved_roles(p_client)', 2)) as t(marker, want) loop
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '0042 S5.16 postcheck: marker "%" is now % (expected %)', r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;
  -- THE LEAF STILL COMES FIRST, AND THE NEW READ SITS UNDER IT AND AFTER THE FA-GRANULAR ARMS.
  if not (position('clara._fa_lock_roles(p_client)' in v_def)
            < position('clara._fa_reserved_roles(p_client)' in v_def)
          and position('''axis'', ''role_overlap''' in v_def)
            < position('clara._fa_role_claim_conflict(p_client, q.code, q.want_role)' in v_def)) then
    raise exception '0042 S5.16 postcheck: the union read is not under the leaf and after the FA-granular arms'
      using errcode = 'CLR10';
  end if;
  if (select p.proowner::regrole::text from pg_proc p where p.oid = v_sig::regprocedure)
     <> 'clara_fn_owner' then
    raise exception '0042 S5.16 postcheck: upsert_fa_account_profile changed owner' using errcode = 'CLR10';
  end if;
  raise notice '0042 S5.16 OK: the FA account-profile door consults the shared reservation union; an actively enrolled staff-advance code can no longer be claimed as a cost, accumulated or expense account.';
end $s5_16$;

reset role;

-- =====================================================================================
-- S5.17 -- clara._draft_opening_item_core: THE K-DOC SEED DOOR JOINS THE UNION (WDB-R3).
--
-- FOUND BY CENSUS, NOT BY THE FINDING. The work order named the FA profile door; the ruling
-- said the shared union must be the single authority EVERY claiming door consults and warned
-- against assuming the list was the three everybody knew. It is not. This body writes a
-- clara.fixed_assets row whose three account codes come STRAIGHT FROM THE K-DOC PAYLOAD
-- (`a->>'asset_account_code'` and its two siblings), validated only for being real, active,
-- non-control chart accounts of this client -- and it consults no reservation predicate of
-- any kind. clara.seed_fixed_asset is a thin wrapper onto it and is granted to
-- clara_authenticated, so this is a publicly reachable door that can claim an actively
-- enrolled staff-advance code in a SINGLE act, where the R6 route needed two.
--
-- ...AND IT IS WORSE THAN THE PROFILE DOOR IN ONE RESPECT. A profile enrolment at least runs
-- the FA-granular role-overlap arms. This door runs nothing: before this splice a K carry-down
-- could put a register row on a code an active advance enrolment owned, and the first symptom
-- would have been a depreciation charge soft-birthing a phantom advance row months later.
--
-- WHY THE LEAF IS SAFE TO TAKE HERE (it is a new lock in this path, so it was checked rather
-- than assumed): clara._draft_opening_item_core takes NO advisory lock today and neither do
-- its three callers (clara.draft_opening_item, clara.supersede_opening_item,
-- clara.seed_fixed_asset -- catalog census). The fa-roles leaf is therefore the only advisory
-- lock this path holds, which is a prefix of every other order in the build (clara.
-- enrol_staff_advance_account takes the client rung then this leaf), so no inversion is
-- reachable. Without it the read-then-insert below would be a snapshot rather than a decision.
--
-- TOKEN PER ADJUDICATION S5-A4 (CLR10 / coa_account_advance_reserved -- one reservation law,
-- one token). The `exception when unique_violation` handler wrapping this body never sees it.
-- The token names the reservation LAW, not the domain that happens to hold the code: widening
-- the discriminator below to cover cross-ROLE claims does not create a second law, so S5-A4
-- stands and the detail payload carries the domain and both roles for anyone who needs them.
--
-- ROUND-4 ROOT FIX -- THIS DOOR IS WHERE THE PER-DOOR FORM FAILED, AND IT IS WHY S5.15b NOW
-- EXISTS. As first written this consult filtered `rr.domain <> 'fa'` with NO role in its
-- VALUES list, while S5.18 -- one hundred and seventy lines further down THIS SAME FILE --
-- used the correct `(domain <> 'fa' or role <> want_role)` and said in its own comment that a
-- domain-only filter "would have missed exactly half of this". Measured consequence: this
-- door, publicly reachable through clara.seed_fixed_asset (granted to clara_authenticated),
-- could bake a register row whose COST code was another LIVE row's ACCUMULATED code, and
-- clara.fa_register_tie then returned tie=false with a debit-balance "accumulated
-- depreciation" of -400,000 and an unexplained 600,000 difference -- a break with no
-- accounting act behind it. The consult now carries the role and asks the ONE discriminator
-- (S5.15b) instead of restating the rule; LAWFUL SAME-ROLE SHARING IS STILL ADMITTED, because
-- many assets legitimately post to one cost account and that is what a register IS.
-- =====================================================================================
set role clara_fn_owner;

do $s5_17$
declare
  v_sig text := 'clara._draft_opening_item_core(uuid,uuid,uuid,uuid,jsonb,jsonb,uuid,uuid,text)';
  v_def text; v_frm text; v_cnt int; v_n int; r record;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if v_def is null then
    raise exception '0042 S5.17 prestate: clara._draft_opening_item_core is GONE' using errcode = 'CLR10';
  end if;
  if position('clara._acct_role_reserved' in v_def) <> 0
     or position('clara._fa_role_claim_conflict' in v_def) <> 0 then
    raise exception '0042 S5.17 prestate: the seed door already consults the shared reservation union -- this splice has already been applied to this database'
      using errcode = 'CLR10';
  end if;
  -- CENSUS INCLUDING S5.7's OWN MARK. S5.7 spliced this same body earlier in this section
  -- (the WDB-G12 cost-only null disjunct, twice) and S5.7 also added the WDB-G11 K6 lineage
  -- guard; both are asserted here so a re-ordered or partially applied S5 is caught before
  -- this splice, not after it.
  for r in select * from (values
      ('or v_cost is null', 2),
      ('clara._fa_assert_lineage_mintable(v_supersedes_asset', 1),
      ('insert into clara.fixed_assets(firm_id,client_id,description,acquired_date,cost_cents,', 1),
      ('v_constraint text;', 1)) as t(marker, want) loop
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '0042 S5.17 prestate: _draft_opening_item_core carries the marker "%" % time(s), expected % -- the body drifted or S5.7 did not land', r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (a) THE DECLARATION gains the four facts the refusal reports.
  v_frm := $f$  v_constraint text;$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0042 S5.17 prestate (a): the declaration tail appears % time(s) (expected exactly once)', v_cnt
      using errcode = 'CLR10';
  end if;
  v_def := replace(v_def, v_frm,
    $t$  v_constraint text;
  v_res_code text; v_res_want text; v_res_domain text; v_res_role text; v_res_owner text;$t$);

  -- (b) THE UNION CONSULT, immediately before the register row is written.
  v_frm := $f$    insert into clara.fixed_assets(firm_id,client_id,description,acquired_date,cost_cents,$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0042 S5.17 prestate (b): the register-row insert appears % time(s) (expected exactly once)', v_cnt
      using errcode = 'CLR10';
  end if;
  v_def := replace(v_def, v_frm,
    $t$    -- 0042 (owner ruling 2026-08-03, WDB-R3): THE SHARED RESERVATION UNION REACHES THE
    -- K-DOC SEED DOOR. The three codes below arrive from the seed payload and are about to be
    -- BAKED onto a register row that will keep posting to them for the asset's whole life.
    -- Nothing asked whether another register already owns them, so a carry-down could land on
    -- an actively enrolled staff-advance code and the first symptom would have been a
    -- depreciation charge soft-birthing a phantom advance row months later. UNLIKE the profile
    -- door this body runs NO fixed-asset-granular arms of its own, so the question it must ask
    -- is the WHOLE rule -- cross-domain AND cross-role -- and it asks the one body that states
    -- that rule (clara._fa_role_claim_conflict, 0042 S5.15b) rather than writing a filter here
    -- that could drift from it. Same-ROLE sharing stays admitted: many assets legitimately
    -- post to one cost account, and that is what a register IS. The leaf makes the
    -- read-then-insert a decision rather than a snapshot; it is the only advisory lock this
    -- path holds, so it cannot invert any other order.
    perform clara._fa_lock_roles(p_client);
    select q.code, q.want_role, cf.res_domain, cf.res_role, cf.res_owner
      into v_res_code, v_res_want, v_res_domain, v_res_role, v_res_owner
      from (values ('cost', v_asset_code), ('accum', v_accum_code),
                   ('expense', v_expense_code)) as q(want_role, code)
      cross join lateral clara._fa_role_claim_conflict(p_client, q.code, q.want_role) cf
      where q.code is not null
      limit 1;
    if v_res_domain is not null then
      raise exception 'account % cannot carry this fixed-asset carry-down in the % role: it is already claimed by the % register in the % role (owner %) for this client, and one account may carry only one role. Seed this asset on a different account, or release the existing claim first -- a staff-advance enrolment is released by retire_staff_advance_account (which needs every advance on it settled); a fixed-asset claim is released by retiring the profile that holds it, and a register row holds its codes until it is disposed, superseded or its acquisition is reversed', v_res_code, v_res_want, v_res_domain, v_res_role, coalesce(v_res_owner, '(unnamed)')
        using errcode = 'CLR10',
          detail = jsonb_build_object('reason', 'coa_account_advance_reserved',
            'account_code', v_res_code, 'claim_role', v_res_want,
            'reservation_domain', v_res_domain,
            'reservation_role', v_res_role, 'reservation_owner', v_res_owner)::text;
    end if;
    insert into clara.fixed_assets(firm_id,client_id,description,acquired_date,cost_cents,$t$);
  execute v_def;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  for r in select * from (values
      ('clara._fa_role_claim_conflict(p_client, q.code, q.want_role)', 1),
      ('clara._acct_role_reserved', 0),
      ('coa_account_advance_reserved', 1),
      -- THE ROLE REACHES THE CONSULT. This is the marker whose ABSENCE was the round-4 defect:
      -- a VALUES list with no want_role column is exactly what made the filter domain-only.
      ('(values (''cost'', v_asset_code), (''accum'', v_accum_code),', 1),
      ('clara._fa_lock_roles(p_client)', 1),
      ('or v_cost is null', 2),
      ('insert into clara.fixed_assets(firm_id,client_id,description,acquired_date,cost_cents,', 1)) as t(marker, want) loop
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '0042 S5.17 postcheck: marker "%" is now % (expected %)', r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;
  -- THE CONSULT IS BEFORE THE WRITE, AND UNDER THE LEAF. A refusal that ran after the insert
  -- would still roll back, but it would have taken the row's identity first -- and the order
  -- is what makes this a gate rather than a cleanup.
  if not (position('clara._fa_lock_roles(p_client)' in v_def)
            < position('clara._fa_role_claim_conflict(p_client, q.code, q.want_role)' in v_def)
          and position('clara._fa_role_claim_conflict(p_client, q.code, q.want_role)' in v_def)
            < position('insert into clara.fixed_assets(firm_id,client_id,description,acquired_date,cost_cents,' in v_def)) then
    raise exception '0042 S5.17 postcheck: the union consult is not under the leaf and before the register insert'
      using errcode = 'CLR10';
  end if;
  if (select p.proowner::regrole::text from pg_proc p where p.oid = v_sig::regprocedure)
     <> 'clara_fn_owner' then
    raise exception '0042 S5.17 postcheck: _draft_opening_item_core changed owner' using errcode = 'CLR10';
  end if;
  raise notice '0042 S5.17 OK: the K-doc fixed-asset seed door asks the ONE discriminator (domain AND role) before baking its three codes onto a register row; lawful same-role sharing stays admitted.';
end $s5_17$;

reset role;

-- =====================================================================================
-- S5.18 -- clara._fa_reversal_blocked: THE RESURRECTION WINDOW S5.15 OPENS (WDB-R4).
--
-- THIS IS BLAST RADIUS OF MY OWN FIX, AND IT SHIPS WITH IT. WDB-R4 says a cell that only
-- walks its own fix's path proves nothing; the same is true of the fix itself. So: what does
-- S5.15 not think of? It thinks a terminal register row is finished. It is not necessarily.
-- clara._fa_on_approve arm (3c) RESURRECTS a disposed row -- reversing the disposal entry
-- sets status back to 'active' (and, on a partial split, restores the superseded predecessor
-- to 'active' while unwinding both children). Before S5.15 the codes were still reserved
-- through that whole window, so resurrection was always onto codes nobody else could have
-- taken. After S5.15 the window is real:
--     dispose asset A on code X  ->  X released  ->  X enrolled as a staff advance
--     ->  reverse the disposal   ->  A is 'active' on X again, and BOTH registers own X.
-- That is precisely the R6 disagreement S5.16 and S5.17 just closed, re-entered by the back
-- door. Fixing the reservation and leaving this open would have been a point-fix.
--
-- WHY THE GUARD GOES HERE AND NOWHERE ELSE [WDB-R2's shape, and it is already built]. This
-- body is the ONE shared admissibility predicate for fixed-asset reversals: clara.
-- reverse_entry (the verb), clara._fa_on_approve (the hook), clara._pair_reverse_core and
-- clara._wdb_exception_booking_block all consult it, and its own header says the verb and the
-- hook can never name different tokens because the probes live in one place. Adding the arm
-- here means the refusal a maker sees at the door and the refusal the checker would hit at
-- approval are the same sentence. Adding it to the hook alone would let a draft be raised
-- that could never be approved.
--
-- IT ASKS ABOUT THE ROLE, NOT ONLY THE DOMAIN [the second thing S5.15 did not think of]. A
-- cross-DOMAIN clash is the obvious case, but releasing the code also makes a cross-ROLE
-- clash reachable: A's cost code X, released on disposal, may since have been enrolled as
-- some OTHER profile's ACCUMULATED account -- which clara.upsert_fa_account_profile now
-- lawfully admits, because X is no longer reserved. Restoring A would then put a cost role
-- and an accumulated role on one account, the exact topology fold F5c refuses at enrolment.
-- So the probe compares (domain, role) against the role the restored row would carry, and a
-- plain `domain <> 'fa'` filter would have missed half of it.
--
-- ROUND-4: THAT SENTENCE WAS RIGHT AND IT WAS STILL A THIRD COPY. This body wrote the correct
-- discriminator inline while S5.17, one hundred and seventy lines earlier in the same file,
-- wrote the wrong one -- which is what proves the rule cannot live in the doors. The arm now
-- calls clara._fa_role_claim_conflict (S5.15b); the refusal, the token and the order are
-- unchanged, and the sentence above is now a description of that body rather than of a filter
-- this one happens to have got right.
--
-- IT DOES NOT GUARD ACQUISITION REVERSALS, deliberately: those move rows TO 'unwound', which
-- releases claims rather than making them. Only the disposal-reversal shape resurrects, so
-- the probe is scoped by disposal_entry_id and is vacuous for every other reversal.
--
-- TOKEN PER ADJUDICATION S5-A5 (CLR39 / fa_reverse_role_reclaimed -- additive, on the 0041
-- FA-reversal family alongside fa_reverse_descendants_exist and fa_reverse_while_depreciated).
-- =====================================================================================
set role clara_fn_owner;

do $s5_18$
declare
  v_sig text := 'clara._fa_reversal_blocked(uuid)';
  v_def text; v_frm text; v_cnt int; v_n int; r record;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if v_def is null then
    raise exception '0042 S5.18 prestate: clara._fa_reversal_blocked is GONE' using errcode = 'CLR10';
  end if;
  if position('fa_reverse_role_reclaimed' in v_def) <> 0 then
    raise exception '0042 S5.18 prestate: the resurrection guard is already present -- this splice has already been applied to this database'
      using errcode = 'CLR10';
  end if;
  for r in select * from (values
      ('fa_reverse_descendants_exist', 1),
      ('fa_reverse_while_depreciated', 1),
      ('fa_partial_reversal_successor_advanced', 2),
      ('clara._acct_role_reserved', 0)) as t(marker, want) loop
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '0042 S5.18 prestate: _fa_reversal_blocked carries the marker "%" % time(s), expected % -- the body drifted', r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (a) THE DECLARATION gains the five facts the refusal reports.
  v_frm := $f$declare o record; v_lin uuid[]; v_kids uuid[]; a record; su record; v_portion text;$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0042 S5.18 prestate (a): the declaration line appears % time(s) (expected exactly once)', v_cnt
      using errcode = 'CLR10';
  end if;
  v_def := replace(v_def, v_frm,
    $t$declare o record; v_lin uuid[]; v_kids uuid[]; a record; su record; v_portion text;
        v_rr_code text; v_rr_want text; v_rr_domain text; v_rr_role text; v_rr_owner text;$t$);

  -- (b) ARM (c), appended after arm (b)'s last refusal -- the anchor carries
  -- predecessor_asset_id, which appears nowhere else in the body.
  v_frm := $f$            detail = jsonb_build_object('reason', 'fa_partial_reversal_successor_advanced',
              'entry_id', p_original, 'predecessor_asset_id', su.id)::text;
      end if;
    end if;
  end if;
end$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0042 S5.18 prestate (b): the arm-(b) tail appears % time(s) (expected exactly once) -- the body drifted; re-derive this splice', v_cnt
      using errcode = 'CLR10';
  end if;
  v_def := replace(v_def, v_frm,
    $t$            detail = jsonb_build_object('reason', 'fa_partial_reversal_successor_advanced',
              'entry_id', p_original, 'predecessor_asset_id', su.id)::text;
      end if;
    end if;
  end if;

  -- (c) 0042 (owner ruling 2026-08-03, WDB-R4): THE RESURRECTION WINDOW. Reversing a disposal
  -- brings a register row BACK to 'active' (clara._fa_on_approve arm 3c: a full disposal
  -- restores every row it disposed; a partial split restores the superseded predecessor and
  -- unwinds both children). Since 0042 S5.15 a terminal row no longer reserves its three
  -- codes, so between the disposal and this reversal somebody may lawfully have claimed one
  -- of them -- as a staff-advance enrolment, or as another profile's account in a DIFFERENT
  -- fixed-asset role. Restoring the row would put two owners on one account, which is exactly
  -- what the shared union exists to prevent. Refused HERE, in the one body the verb and the
  -- approve-time hook both consult, so the maker and the checker are told the same thing.
  -- Vacuous for every reversal that is not a disposal reversal: an acquisition reversal moves
  -- rows to 'unwound', which releases claims rather than making them.
  if exists (select 1 from clara.fixed_assets f where f.disposal_entry_id = p_original) then
    select q.code, q.want_role, cf.res_domain, cf.res_role, cf.res_owner
      into v_rr_code, v_rr_want, v_rr_domain, v_rr_role, v_rr_owner
      from (select f2.id from clara.fixed_assets f2 where f2.disposal_entry_id = p_original
            union
            select f3.supersedes_asset_id from clara.fixed_assets f3
             where f3.disposal_entry_id = p_original and f3.supersedes_asset_id is not null
           ) as t(asset_id)
      join clara.fixed_assets fr on fr.id = t.asset_id
      cross join lateral (values ('cost', fr.asset_account_code),
                                 ('accum', fr.accum_depr_account_code),
                                 ('expense', fr.depr_expense_account_code)) as q(want_role, code)
      cross join lateral clara._fa_role_claim_conflict(fr.client_id, q.code, q.want_role) cf
      where q.code is not null
      limit 1;
    if v_rr_domain is not null then
      raise exception 'reversing this disposal would restore a fixed-asset row onto account %, which has since been claimed by the % register (% role, owner %) while this asset was disposed; release that claim first (retire the enrolment or the profile that took it), then reverse this disposal', v_rr_code, v_rr_domain, v_rr_role, coalesce(v_rr_owner, '(unnamed)')
        using errcode = 'CLR39',
          detail = jsonb_build_object('reason', 'fa_reverse_role_reclaimed',
            'entry_id', p_original, 'account_code', v_rr_code,
            'restored_role', v_rr_want, 'reservation_domain', v_rr_domain,
            'reservation_role', v_rr_role, 'reservation_owner', v_rr_owner)::text;
    end if;
  end if;
end$t$);
  execute v_def;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  for r in select * from (values
      ('fa_reverse_role_reclaimed', 1),
      ('clara._fa_role_claim_conflict(fr.client_id, q.code, q.want_role)', 1),
      ('clara._acct_role_reserved', 0),
      ('fa_reverse_descendants_exist', 1),
      ('fa_reverse_while_depreciated', 1),
      ('fa_partial_reversal_successor_advanced', 2)) as t(marker, want) loop
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '0042 S5.18 postcheck: marker "%" is now % (expected %)', r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;
  -- THE NEW ARM IS LAST. The two 0041 arms answer dependency-order questions ("reverse the
  -- descendants first", "reverse the charges first") that are true regardless of who owns the
  -- codes; asking about a reclaimed code before them would send a professional to fix a
  -- reservation when the real blocker is a live charge.
  if not (position('fa_reverse_descendants_exist' in v_def)
            < position('fa_reverse_role_reclaimed' in v_def)
          and position('fa_partial_reversal_successor_advanced' in v_def)
            < position('fa_reverse_role_reclaimed' in v_def)) then
    raise exception '0042 S5.18 postcheck: the resurrection arm is not last'
      using errcode = 'CLR10';
  end if;
  if (select p.provolatile from pg_proc p where p.oid = v_sig::regprocedure) <> 's'
     or (select p.proowner::regrole::text from pg_proc p where p.oid = v_sig::regprocedure)
        <> 'clara_fn_owner' then
    raise exception '0042 S5.18 postcheck: _fa_reversal_blocked changed volatility or owner'
      using errcode = 'CLR10';
  end if;
  raise notice '0042 S5.18 OK: reversing a disposal onto a code reclaimed by another register (or another fixed-asset role) is refused at the one predicate the verb and the hook share.';
end $s5_18$;

reset role;

-- =====================================================================================
-- S5.19 (D-b0 SLICE) -- THE TWO NEW HELPERS AND THE WALK GATE; THE GL-SIDE RECUT IS D-b1's.
--
-- [SPLIT D-b0 2026-08-04] The whole unit's S5.19 does four things in one block: it creates
-- clara._acct_role_reserved_at (the as-of form of the reservation authority), it creates
-- clara._fa_gl_leg_foreign (the FA family's single reader of that authority), it gates
-- clara.fa_register_tie's WALK on clara._fa_included_at, and it recuts that reader's four GL
-- sums onto the foreign-leg predicate. The GL-SIDE RECUT reads clara.staff_advance_accounts,
-- clara.staff_advances, clara._adv_enrolment_at and clara.staff_advance_tie (census sect.3:
-- "NOT PURE -- reads ... (D-b1)"), so it lands in D-b1. The two HELPERS are filed as D-b0
-- objects by census sect.1g and are read by this slice's S5.19b roster (A3), so they are
-- lifted out and created here. THE WALK GATE IS PULLED FORWARD AS S5.19-b0 (below): it is one
-- pure fixed-asset clause on an 0041 body, and it is THE PAIR OF S5.15, WHICH SHIPS HERE --
-- see that block's own note for the measurement that made this non-optional. THE BLOCK'S
-- HEADER ARGUMENT (the one-sided-fix reasoning, the two candidate shapes, the WDB-R4
-- questions) is the GL-side recut's argument and travels with it to D-b1; it is not
-- reproduced here.
-- FINAL FORM: D-b1 (census sect.8's "S5.19 (fa_register_tie reader recut)").
-- =====================================================================================
set role clara_fn_owner;

-- ---------------------------------------------------------------------------------------
-- clara._acct_role_reserved_at -- THE AS-OF FORM OF THE SHARED RESERVATION AUTHORITY.
--
-- clara._acct_role_reserved (S2) answers "who holds this code NOW". That is the right
-- question at a CLAIMING DOOR and the wrong one for any body that answers AS OF A DATE, which
-- is why fa_register_tie could not consult it and hand-rolled nothing at all. This is the same
-- union, disjunct for disjunct, with every "is it live" test replaced by that family's OWN
-- history: the profile arms read enrolled_at..retired_at, the register arm reads
-- clara._fa_included_at (the same predicate S5.19's walk and both register sums use), and the
-- advance arms delegate to clara._adv_enrolment_at -- the body the S3.5 belt and
-- clara.staff_advance_tie already share. No window is re-derived here; that is the point.
-- ---------------------------------------------------------------------------------------
-- [SPLIT D-b0 2026-08-04] FA-ONLY SHELL, the as-of twin of this slice's clara._acct_role_reserved.
-- The paragraph above describes the FINAL union, which is right: this body's law is that no
-- window is re-derived here. What this slice omits is the two ADVANCE arms -- the
-- clara._adv_enrolment_at delegate and the clara.staff_advances / clara.staff_advance_accounts
-- disjunct -- because clara._adv_enrolment_at and both tables are D-b1's (census sect.2
-- Class B names this the fourth violating edge, and its only resolution is an FA-only
-- intermediate form). THE SIX FIXED-ASSET ARMS ARE BYTE-EXACT, so clara._fa_gl_leg_foreign
-- and S5.19b's (A3)/(C) rosters get the same answer for every FA claim; there is no advance
-- enrolment in this slice's world for the missing arms to have answered about.
-- FINAL FORM: D-b1 re-creates this body with its advance arms (census sect.8).
create function clara._acct_role_reserved_at(p_client uuid, p_code text, p_at timestamptz)
  returns table(domain text, role text, owner_ref text)
  language sql stable security definer set search_path = clara, pg_temp as $$
  select 'fa'::text, 'cost'::text, fp.asset_account_code
    from clara.fa_account_profiles fp
   where p_client is not null and p_code is not null and p_at is not null
     and fp.client_id = p_client and fp.asset_account_code = p_code
     and fp.enrolled_at <= p_at and (fp.retired_at is null or p_at <= fp.retired_at)
  union
  select 'fa'::text, 'accum'::text, fp.asset_account_code
    from clara.fa_account_profiles fp
   where p_client is not null and p_code is not null and p_at is not null
     and fp.client_id = p_client and fp.accum_depr_account_code = p_code
     and fp.enrolled_at <= p_at and (fp.retired_at is null or p_at <= fp.retired_at)
  union
  select 'fa'::text, 'expense'::text, fp.asset_account_code
    from clara.fa_account_profiles fp
   where p_client is not null and p_code is not null and p_at is not null
     and fp.client_id = p_client and fp.depr_expense_account_code = p_code
     and fp.enrolled_at <= p_at and (fp.retired_at is null or p_at <= fp.retired_at)
  union
  select 'fa'::text, 'cost'::text, f.asset_account_code
    from clara.fixed_assets f
   where p_client is not null and p_code is not null and p_at is not null
     and f.client_id = p_client and f.asset_account_code = p_code
     and clara._fa_included_at(f.id, p_at::date)
  union
  select 'fa'::text, 'accum'::text, f.asset_account_code
    from clara.fixed_assets f
   where p_client is not null and p_code is not null and p_at is not null
     and f.client_id = p_client and f.accum_depr_account_code = p_code
     and clara._fa_included_at(f.id, p_at::date)
  union
  select 'fa'::text, 'expense'::text, f.asset_account_code
    from clara.fixed_assets f
   where p_client is not null and p_code is not null and p_at is not null
     and f.client_id = p_client and f.depr_expense_account_code = p_code
     and clara._fa_included_at(f.id, p_at::date)
$$;
revoke all on function clara._acct_role_reserved_at(uuid, text, timestamptz) from public;

-- ---------------------------------------------------------------------------------------
-- clara._fa_gl_leg_foreign -- IS THIS GL LEG ANOTHER REGISTER FAMILY'S?
--
-- The FA family's single reader of the authority above, and the ONE place the answer lives, so
-- the tie's four GL sums cannot drift apart on it. A leg is foreign when, at the instant its
-- entry was approved:
--   (1) some NON-fa family positively held the code -- EVIDENCE, never absence-of-evidence.
--       This is what keeps 0041's posture: GL an account carried while NOBODY owned it is
--       still the fixed-asset family's unexplained difference, with gl_pre_enrolment_* on it.
--   (2) ...AND the FA register cannot be shown to have ACTED on that entry. This is the mirror
--       of staff_advance_tie's positive-register-evidence disjunct and it is what makes the
--       register side and the GL side agree BY CONSTRUCTION: every movement the register side
--       counts was minted as an acquisition, a disposal or a depreciation charge, and each of
--       those is nailed to its entry by a column read here. Without it a foreign window could
--       swallow the fixed-asset family's own money and the tie would report GREEN over a real
--       break -- the dangerous direction, which is worse than the defect being fixed.
--
-- A THIRD ARM WAS WRITTEN, MEASURED, AND REMOVED [round-6, and this is the whole lesson of the
-- round restated against my own fix]. It read `and not exists (... where domain = 'fa')`:
-- if BOTH families held the code at that instant, keep the money with the fixed-asset family
-- as the conservative choice. Then the fix was asked the question it had not asked itself --
-- WHEN can both hold it at once? -- and the answer is: only by BACKDATING, because the
-- reservation union forbids simultaneous live claims. So the arm fired only in a band of
-- historical dates, and in exactly that band it reported the advance's lawful outstanding
-- balance as an unexplained fixed-asset difference again. A guard that holds everywhere except
-- inside one date band IS the round-6 defect, one level up. The right posture is symmetric:
-- inside another family's window that family owns the code, its tie is the instrument that
-- must go red for a stray posting there, and this one explains and moves on.
-- ---------------------------------------------------------------------------------------
create function clara._fa_gl_leg_foreign(p_client uuid, p_code text, p_entry uuid,
                                         p_at timestamptz)
  returns boolean language sql stable security definer
  set search_path = clara, pg_temp as $$
  select exists (select 1 from clara._acct_role_reserved_at(p_client, p_code, p_at) d
                  where d.domain <> 'fa')
     and not exists (select 1 from clara.fixed_assets f
                      where f.client_id = p_client
                        and (f.acquisition_entry_id = p_entry or f.disposal_entry_id = p_entry))
     and not exists (select 1 from clara.fa_depreciation dp
                      where dp.client_id = p_client and dp.entry_id = p_entry)
     and not exists (select 1 from clara.fa_depreciation_runs rn
                      where rn.client_id = p_client and rn.entry_id = p_entry)
$$;
revoke all on function clara._fa_gl_leg_foreign(uuid, text, uuid, timestamptz) from public;

-- =====================================================================================
-- S5.19-b0 -- clara.fa_register_tie: THE WALK GATE ONLY (round-4 root fix, this slice's half).
--
-- [SPLIT D-b0 2026-08-04] THIS BLOCK IS THE HALF OF S5.19 THAT PAIRS WITH S5.15, AND IT SHIPS HERE
-- BECAUSE S5.15 SHIPS HERE. It is the E6 precedent exactly (S5.12's fa_depreciation_authorities
-- arm, pulled forward for the same reason): one clause on an 0041 body, no later-slice object
-- named, no advance table read. The census marked the whole S5.19 block impure because its GL
-- half reads the advance registers -- but the walk gate's predicate,
-- clara._fa_included_at(f.id, p_as_of), is an 0041 body and pure fixed-asset.
--
-- WHAT DEFERRING IT COSTS, MEASURED AT THIS FRONTIER (rigs clara_cf_b0 vs the whole-unit twin
-- clara_cf_twin, and re-derived on this lane's own chain): S5.15 gates clara._fa_reserved_roles
-- so a disposed, superseded or unwound register row RELEASES its three codes -- so at a D-b0
-- that shipped the RELEASE without this GATE, the belt ADMITS a bank account onto a code held
-- only by a terminal register row (0041 refused it by name, CLR10), and clara.fa_register_tie
-- STILL WALKS that account: register side structurally 0, GL side summing the whole account,
-- and no gl_foreign_register_* explanation, because this slice's clara._fa_gl_leg_foreign has
-- no consumer until D-b1. That is tie=false with a difference NO ACCOUNTING ACT CAN CLEAR --
-- the register row is terminal and can never move again -- permanent and per-account, for the
-- whole D-b0-only window. A writer that releases and a reader that does not agree is the
-- ROUND-4 ROOT DEFECT ITSELF; shipping one without the other is a REGRESSION INTRODUCED BY THE
-- SPLIT, not a deferral.
--
-- WHAT IS NOT HERE, AND TRAVELS WITH D-b1: the GL-side family scoping (the six anchored
-- splices (i)..(vi), the two locals, the two `filter` partitions, the two pre-enrolment
-- watermark tests and the two gl_foreign_register_* keys), the `_fa_gl_leg_foreign` idempotency
-- probe and the postchecks keyed on it, and checks (3), (4) and (5) -- the advance-side
-- retire refusal and the two class-level reservation-authority censuses -- all of which read
-- bodies or tables this slice does not ship. FINAL FORM: D-b1's S5.19, whose prestate now
-- anchors on the ALREADY-GATED walk this block installs.
-- =====================================================================================

do $s5_19_b0$
declare
  v_sig text := 'clara.fa_register_tie(uuid,date)';
  v_def text; v_frm text; v_cnt int; v_n int; r record;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if v_def is null then
    raise exception '0042 S5.19-b0 prestate: clara.fa_register_tie is GONE' using errcode = 'CLR10';
  end if;
  -- [SPLIT D-b0 2026-08-04] THE IDEMPOTENCY KEY IS THE GATE'S OWN COUNT, NOT A GL-SIDE TERM. The whole
  -- unit's block probes for 'clara._fa_gl_leg_foreign(' because that is the term IT adds first;
  -- this half adds no GL-side term at all. What a re-apply finds instead is the gate itself:
  -- the marker census immediately below counts clara._fa_included_at FOUR times where the 0041
  -- body carries THREE, and the walk anchor after it is then absent -- two refusals by name,
  -- both in the whole unit's own words. MEASURED on a rig with this block already applied: the
  -- marker census fires first ("carries the marker ... 4 time(s), expected 3"). D-b1's block
  -- keeps the _fa_gl_leg_foreign probe as ITS key, so neither half can land twice.
  -- PRE-EXISTING MARKER CENSUS, counted on the live 0041 catalog. clara._fa_included_at is
  -- ALREADY here three times (both register sums and the before-baseline probe), so the
  -- idempotency guard cannot be its mere presence -- it is the survival of the UNGATED walk.
  for r in select * from (values
      ('clara._fa_included_at(f.id, p_as_of)', 3),
      ('clara._fa_pending_unposted(f.id)', 3),
      ('status in (''pending'', ''active'')', 1)) as t(marker, want) loop
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '0042 S5.19 prestate: fa_register_tie carries the marker "%" % time(s), expected % -- the body drifted', r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;

  -- THE SPLICE. The anchor is the walk's register-row arm plus its ORDER BY, which is what
  -- makes it unique: the same FROM clause appears three more times inside the loop, each time
  -- carrying its own account-code predicate.
  v_frm := '      from clara.fixed_assets f where f.client_id = p_client' || chr(10)
        || '    order by 1, 2';
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0042 S5.19 prestate: the UNGATED walk anchor appears % time(s) (expected exactly once) -- either the body drifted or this splice has already been applied to this database', v_cnt
      using errcode = 'CLR10';
  end if;
  v_def := replace(v_def, v_frm,
    '      from clara.fixed_assets f where f.client_id = p_client' || chr(10)
    || '        -- 0042 S5.19: THE WALK AGREES WITH THE LIFECYCLE GATE. A register row that no' || chr(10)
    || '        -- longer holds its codes at p_as_of (disposed, superseded, unwound) must not put' || chr(10)
    || '        -- its account into this report: since 0042 S5.15 that code may lawfully belong to' || chr(10)
    || '        -- another register, whose postings would then read as a fixed-asset difference no' || chr(10)
    || '        -- act could clear. This is the SAME predicate both compared sides already use, so' || chr(10)
    || '        -- the universe and the sums cannot drift apart.' || chr(10)
    || '        and clara._fa_included_at(f.id, p_as_of)' || chr(10)
    || '    order by 1, 2');

  execute v_def;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  -- [SPLIT D-b0 2026-08-04] SLICE-LOCAL POSTCHECK: the three markers this half can speak for. The
  -- whole unit's loop also pins ('clara._fa_gl_leg_foreign(', 4) and the two
  -- gl_foreign_register_* keys; those are the GL half's outcome and are asserted in D-b1.
  -- clara._fa_included_at goes 3 -> 4 HERE, which is the whole of this block's effect.
  for r in select * from (values
      ('clara._fa_included_at(f.id, p_as_of)', 4),
      ('clara._fa_pending_unposted(f.id)', 3),
      ('status in (''pending'', ''active'')', 1)) as t(marker, want) loop
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '0042 S5.19-b0 postcheck: marker "%" is now % (expected %)', r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;
  -- [SPLIT D-b0 2026-08-04] THE "NO UNSCOPED SUM SURVIVED" POSTCHECK TRAVELS WITH THE GL HALF: at this
  -- frontier both compared sums ARE still whole-account reads, deliberately, so asserting their
  -- absence here would fail on a body this slice does not recut. The two claims below are this
  -- half's own outcome and are byte-exact from the whole unit.
  if position(v_frm in v_def) <> 0 then
    raise exception '0042 S5.19 postcheck: the UNGATED walk arm survived the splice'
      using errcode = 'CLR10';
  end if;
  if (select p.provolatile from pg_proc p where p.oid = v_sig::regprocedure) <> 's'
     or (select p.prosecdef from pg_proc p where p.oid = v_sig::regprocedure) is not true
     or (select p.proowner::regrole::text from pg_proc p where p.oid = v_sig::regprocedure)
        <> 'clara_fn_owner' then
    raise exception '0042 S5.19 postcheck: fa_register_tie changed volatility, definer-ness or owner'
      using errcode = 'CLR10';
  end if;

  -- (1) THE TWO GATES AGREE AT as_of = today, ON EVERY STATUS THE CHECK CONSTRAINT ADMITS.
  -- The walk uses the as-of predicate and the reservation uses the status predicate; if they
  -- disagreed, an account could be reserved-but-unwalked (a real break hidden) or
  -- walked-but-unreserved (the defect above, re-entered). Proved on the constraint's own value
  -- list so a sixth status cannot land without landing here.
  for r in select unnest(regexp_matches(pg_get_constraintdef(con.oid), '''([a-z_]+)''::text', 'g')) as st
             from pg_constraint con
            where con.conrelid = 'clara.fixed_assets'::regclass
              and con.conname = 'fixed_assets_status_check_0017' loop
    -- 'pending' and 'active' HOLD; the three terminal statuses RELEASE. clara._fa_included_at
    -- reaches the same verdict at today's date through the disposed_at / superseded_at /
    -- reversal-date columns those statuses are written with -- which is why the two are
    -- separate predicates and not one: this one is date-parameterised on purpose.
    if clara._fa_status_holds_account_role(r.st) <> (r.st in ('pending', 'active')) then
      raise exception '0042 S5.19 (1): status "%" is classified against the truth table this recut assumes -- the walk gate and the reservation gate have drifted', r.st
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (2) THE INCOMPLETE-PARTICULARS COUNT ALREADY AGREED, and its agreement is now pinned.
  -- It walks `status in ('pending','active')` -- exactly the statuses that HOLD -- so it was
  -- never falsified by S5.15. Asserted so a future widening of it fails here rather than
  -- reporting incomplete particulars for a disposed asset nobody can complete.
  if position('status in (''pending'', ''active'')' in v_def) = 0 then
    raise exception '0042 S5.19 (2): fa_register_tie''s incomplete-particulars walk no longer names the live statuses'
      using errcode = 'CLR10';
  end if;

  -- [SPLIT D-b0 2026-08-04] CHECKS (3), (4) AND (5) ARE NOT IN THIS SLICE. (3) reads
  -- clara.retire_staff_advance_account's source (D-b1's body); (4) and (5) compare the family
  -- literals and the read-tables of the two forms of the reservation authority, and BOTH forms
  -- are FA-only shells here -- the claim they make is about the completed union, so it is
  -- D-b1's to make. FORWARD TOLERANCE: D-b1's S5.19 restores all three; the FINAL form is its.
  raise notice '0042 S5.19-b0 OK: fa_register_tie walks only the accounts the FA family holds AT p_as_of -- a terminal register row no longer puts its released code into the report; the walk gate and the lifecycle gate agree on every status the CHECK constraint admits. The GL-side family scoping ships with D-b1.';
end $s5_19_b0$;

reset role;

-- =====================================================================================
-- S5.19b -- THE READER CENSUS S5.15 SHOULD HAVE COME WITH (round-4 root fix).
--
-- THE INVARIANT: every body whose answer depends on WHO HOLDS AN ACCOUNT CODE agrees with the
-- lifecycle gate -- and no NEW such body can appear without this migration failing by name.
-- This is the step whose absence produced the S5.19 regression: the writer was gated and its
-- readers were never enumerated. It is enforced as two EXACT rosters, not as `>=` floors: a
-- floor greens a build that swapped one member for another.
-- =====================================================================================
-- [SPLIT D-b0 2026-08-04] THE THREE ROSTERS BELOW ARE SLICE-LOCAL, WITH FORWARD TOLERANCE STATED
-- PER ARM. Census sect.5's rule is explicit about the shape: a census that enumerates a
-- roster spanning families ships per-slice with a slice-local expected roster and a comment
-- naming the final form -- and NEVER as an `if to_regprocedure(...) is not null` guard,
-- which converts a build-time census into a conditionally-vacuous one (the fail-open class
-- round 7 measured). So every roster below is still EXACT and still fails by name; it is
-- exact about THIS slice's catalog.
-- =====================================================================================
do $s5_19b$
declare v_names text; v_expect text; v_src text; r record;
begin
  -- ROSTER A -- EVERY BODY THAT DIRECTLY CONSULTS THE RESERVATION AUTHORITY. Matched on the
  -- COMMENT-STRIPPED source, so a body that merely DISCUSSES the union in prose is not
  -- counted as a consumer (and, the other way, a real consult cannot hide behind a comment).
  --
  -- THE INSTRUMENT MATTERS, AND IT CHANGED THE ANSWER. Read off RAW prosrc this roster has
  -- TWELVE members; read off code alone it has NINE. clara.enrol_staff_advance_account,
  -- clara.accept_bank_rule_suggestion and clara._adv_on_approve only NAME the union in their
  -- comments -- they reach it through a delegate -- and counting a comment as a consult is
  -- exactly the blind spot S5.14 (6b) was carrying. Their delegation is asserted in (A2)
  -- rather than dropped, so losing it is still a named failure.
  -- FORWARD TOLERANCE: the D-b1 form of this roster is {_acct_role_reserved,
  -- _adj_line_eligibility_breach, _adv_enrolment_admission, _draft_opening_item_core,
  -- _fa_assert_code_unreserved, _fa_reversal_blocked, _fa_role_claim_conflict,
  -- dispose_fixed_asset, upsert_fa_account_profile} -- clara._adv_enrolment_admission is
  -- SECTION S3's body and joins when D-b1 ships it. The FINAL form is D-b2's.
  v_expect := '_acct_role_reserved, _adj_line_eligibility_breach, '
           || '_draft_opening_item_core, _fa_assert_code_unreserved, '
           || '_fa_reversal_blocked, _fa_role_claim_conflict, '
           || 'dispose_fixed_asset, upsert_fa_account_profile';
  select coalesce(string_agg(p.proname::text, ', ' order by p.proname::text collate "C"), '')
    into v_names
    from pg_proc p
   where p.pronamespace = 'clara'::regnamespace
     and lower(regexp_replace(regexp_replace(regexp_replace(
           p.prosrc, '/\*[\s\S]*?\*/', '', 'g'), '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))
         ~ '(_fa_reserved_roles|_acct_role_reserved|_fa_role_claim_conflict) *\(';
  if v_names <> v_expect then
    raise exception '0042 S5.19b (A): the reservation-authority consumers are {%} -- expected exactly {%}. 0042 S5.15 changed what "reserved" MEANS (a terminal register row now releases its codes), so every body on this roster was re-read against that change. A body added here has not been; state its disposition in this block before it ships.', v_names, v_expect;
  end if;

  -- [SPLIT D-b0 2026-08-04] (A2) THE INDIRECT-CONSUMER CENSUS IS NOT IN THIS SLICE. Its three
  -- subjects are clara.enrol_staff_advance_account and clara._adv_on_approve (D-b1) and
  -- clara.accept_bank_rule_suggestion (D-b3); none of them exists yet, so there is no
  -- delegation to lose. FORWARD TOLERANCE: the D-b1 form asserts the first two, the D-b3
  -- form adds the third, and the FINAL form is D-b2's three-row loop.

  -- (A3) THE AS-OF FORM OF THE AUTHORITY HAS ITS OWN EXACT ROSTER [round-6 lens 3]. Roster (A)
  -- cannot see these: its pattern is `_acct_role_reserved *\(`, which does not match
  -- `_acct_role_reserved_at(`. Widening (A) instead would have re-sorted an exact roster that
  -- four earlier rounds adjudicated member by member, so the new authority is censused beside
  -- it rather than folded into it -- and the consequence of a body joining THIS list is
  -- different: it is answering a question AS OF A DATE, so it must never be gated on a
  -- today-only predicate.
  v_expect := '_fa_gl_leg_foreign';
  select coalesce(string_agg(p.proname::text, ', ' order by p.proname::text collate "C"), '')
    into v_names
    from pg_proc p
   where p.pronamespace = 'clara'::regnamespace
     and lower(regexp_replace(regexp_replace(regexp_replace(
           p.prosrc, '/\*[\s\S]*?\*/', '', 'g'), '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))
         ~ '_acct_role_reserved_at *\(';
  if v_names <> v_expect then
    raise exception '0042 S5.19b (A3): the AS-OF reservation-authority consumers are {%} -- expected exactly {%}. The as-of form answers "who held this code at this instant"; a body that starts asking it is a body whose answer changes with a date, and it has to say here what it does with a foreign family''s movements (clara.fa_register_tie rides them on gl_foreign_register_*; it must never report them as an unexplained difference).', v_names, v_expect;
  end if;
  -- [SPLIT D-b0 2026-08-04] THE SECOND HALF OF (A3) -- "and the ONE consumer still reaches the
  -- fixed-asset tie" -- IS NOT IN THIS SLICE: clara.fa_register_tie only gains its
  -- clara._fa_gl_leg_foreign call in D-b1's S5.19 splice, so asserting it here would fail on
  -- a body this slice deliberately does not touch. FORWARD TOLERANCE: D-b1 restores it, and
  -- it is the FINAL form.

  -- ROSTER B -- EVERY BODY THAT READS clara.fixed_assets WHILE NAMING AN ACCOUNT-CODE COLUMN.
  -- This is the wider set: a body need not call a predicate to depend on who holds a code, it
  -- need only scan the register BY code -- which is exactly what fa_register_tie's walk did.
  -- clara._acct_role_reserved_at joins it as of round 6: it is the AS-OF form of the union, so
  -- it necessarily reads the register by code, and it is gated on clara._fa_included_at.
  -- FORWARD TOLERANCE: the D-b1 form of this roster adds _adv_enrolment_admission (SECTION
  -- S3's body reads clara.fixed_assets by account code for its permanence probe). The FINAL
  -- form is D-b2's.
  v_expect := '_acct_role_reserved_at, _fa_asset_json, '
           || '_fa_disposal_stub, _fa_on_approve, '
           || '_fa_reserved_roles, _fa_reversal_blocked, _tf_fa_movement_belt, '
           || 'complete_fixed_asset_particulars, dispose_fixed_asset, fa_register_tie, '
           || 'revise_fixed_asset_particulars';
  select coalesce(string_agg(p.proname::text, ', ' order by p.proname::text collate "C"), '')
    into v_names
    from pg_proc p
   where p.pronamespace = 'clara'::regnamespace
     and lower(regexp_replace(regexp_replace(regexp_replace(
           p.prosrc, '/\*[\s\S]*?\*/', '', 'g'), '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))
         ~ 'from clara\.fixed_assets'
     and lower(regexp_replace(regexp_replace(regexp_replace(
           p.prosrc, '/\*[\s\S]*?\*/', '', 'g'), '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))
         ~ '(asset_account_code|accum_depr_account_code|depr_expense_account_code)';
  if v_names <> v_expect then
    raise exception '0042 S5.19b (B): the bodies reading clara.fixed_assets by account code are {%} -- expected exactly {%}. A new member must say whether its answer depends on WHO HOLDS A CODE; if it does, gate it on clara._fa_status_holds_account_role (a status question) or clara._fa_included_at (an as-of question), the way S5.15 and S5.19 respectively do.', v_names, v_expect;
  end if;

  -- (C) THE MEMBERS WHOSE ANSWERS THE GATE ACTUALLY CHANGED CARRY THE GATE. The rosters
  -- above catch a NEW reader; this catches a member silently losing its gate.
  for r in select * from (values
      -- FORWARD TOLERANCE: the D-b1 form of this roster adds the three rows this slice
      -- cannot assert -- (_adv_enrolment_admission -> _fa_status_holds_account_role),
      -- (fa_register_tie -> _fa_gl_leg_foreign) and (_acct_role_reserved_at ->
      -- _adv_enrolment_at) -- because SECTION S3, the S5.19 GL-side recut and the union's
      -- advance arm all ship there. The FINAL form is D-b2's.
      -- (fa_register_tie -> _fa_included_at) IS ASSERTED HERE: S5.19-b0 above pulls the walk
      -- gate forward with S5.15, so this slice's own reader carries its own gate and a
      -- regression in it fails by name in this migration rather than in the next one.
      ('_fa_reserved_roles', 'clara._fa_status_holds_account_role',
       'the union itself -- the gate S5.15 installed'),
      ('fa_register_tie', 'clara._fa_included_at',
       'the as-of walk S5.19 recut'),
      ('_acct_role_reserved_at', 'clara._fa_included_at',
       'the as-of form of the fixed-asset arm of the union -- gating it on the STATUS predicate instead would answer today''s question at a historical date, which is the exact error S5.19 was written to avoid'),
      ('_fa_reversal_blocked', 'clara._fa_role_claim_conflict',
       'the resurrection window S5.15 opened')) as t(nm, marker, why) loop
    select lower(regexp_replace(regexp_replace(regexp_replace(
             p.prosrc, '/\*[\s\S]*?\*/', '', 'g'), '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))
      into v_src from pg_proc p
      where p.pronamespace = 'clara'::regnamespace and p.proname = r.nm;
    if v_src is null then
      raise exception '0042 S5.19b (C): clara.% does not exist -- the reader census has lost a subject', r.nm;
    end if;
    if position(lower(r.marker) in v_src) = 0 then
      raise exception '0042 S5.19b (C): clara.% no longer reaches % -- it is %, and without that marker it has stopped agreeing with the lifecycle gate', r.nm, r.marker, r.why;
    end if;
  end loop;

  -- (D) THE MOVEMENT BELT IS ROSTER B's ONE MEMBER THAT LOOKS DEPENDENT AND IS NOT, so the
  -- reason is MEASURED rather than trusted: it keys entirely on clara.fa_account_profiles
  -- ENROLMENT INTERVALS (fold F5a) and touches clara.fixed_assets only by acquisition_line_id.
  -- If it ever grows a register-row code lookup it becomes gate-dependent -- an advance
  -- movement on a released code would start raising fa_belt_unregistered_movement -- and this
  -- fires first.
  select lower(regexp_replace(regexp_replace(regexp_replace(
           p.prosrc, '/\*[\s\S]*?\*/', '', 'g'), '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))
    into v_src from pg_proc p
    where p.pronamespace = 'clara'::regnamespace and p.proname = '_tf_fa_movement_belt';
  if position('f.acquisition_line_id = r.line_id' in v_src) = 0
     or position('fp.asset_account_code = jl.account_code' in v_src) = 0
     or position('f.asset_account_code' in v_src) <> 0 then
    raise exception '0042 S5.19b (D): the FA movement belt no longer keys on profile enrolment intervals and the acquisition line -- if it now matches on a REGISTER ROW''s codes it is gate-dependent and must be gated, because a code a terminal row once carried is no longer the register''s';
  end if;

  raise notice '0042 S5.19b OK (D-b0 slice): all three reader rosters are exact at this slice''s membership; every gate-dependent reader this slice ships carries its gate; the movement belt is measured profile-keyed, not register-code-keyed.';
end $s5_19b$;

-- =====================================================================================
-- S5.14 -- SECTION S5's OWN CLOSING CENSUS. Independent of section 6's tails: this asserts
-- only what SECTION S5 itself claims to have done, so a partially-applied S5 cannot reach
-- the unified tail and be diagnosed there under a wider heading.
-- =====================================================================================
-- [SPLIT D-b0 2026-08-04] SLICE-LOCAL. Arms (1), (2), (4), (5), (6), (6b), (6c), (6e) and the bank
-- trigger check are byte-exact; arm (3)'s recut roster and arm (6a)'s claiming-door roster
-- are narrowed to the bodies this slice actually recuts and the doors that actually exist,
-- each with its forward tolerance stated inline. Census sect.5's rule again: exact rosters,
-- never a conditional-vacuity guard.
-- =====================================================================================
do $s5_14$
declare r record; v_def text; v_cnt int; v_n int; v_names text; v_found text;
begin
  -- (1) THE COLUMN: cost_cents is NOT NULL and the dead ck_fa_residual arm is still there
  -- (deliberately, per design SS6.3 -- its presence is asserted so a future reader who finds
  -- it does not "fix" it and a future migration that drops it must state why).
  if exists (select 1 from information_schema.columns
             where table_schema = 'clara' and table_name = 'fixed_assets'
               and column_name = 'cost_cents' and is_nullable = 'YES') then
    raise exception '0042 S5.14: clara.fixed_assets.cost_cents is still nullable -- S5.1 did not land';
  end if;
  -- lower() is load-bearing: pg_get_constraintdef normalises KEYWORDS to upper case, so the
  -- live definition reads `((cost_cents IS NULL) OR ...)` and a case-sensitive probe here
  -- would raise on a perfectly intact constraint.
  if not exists (select 1 from pg_constraint
                 where conrelid = 'clara.fixed_assets'::regclass and conname = 'ck_fa_residual'
                   and position('cost_cents is null' in lower(pg_get_constraintdef(oid))) <> 0) then
    raise exception '0042 S5.14: ck_fa_residual no longer carries its (now dead, deliberately kept) cost-null disjunct -- design SS6.3 states it is left in place';
  end if;

  -- (2) THE THREE NEW HELPERS exist at their exact signatures and are owned by the fn owner.
  -- clara._fa_status_holds_account_role is S5.15's; it is the predicate the whole reservation
  -- union now depends on, so its absence must be a named failure rather than a missing gate.
  foreach v_def in array array[
      'clara._fa_assert_lineage_mintable(uuid,text)',
      'clara._fa_split_month_advisory(uuid)',
      'clara._fa_status_holds_account_role(text)',
      'clara._fa_role_claim_conflict(uuid,text,text)'] loop
    if to_regprocedure(v_def) is null then
      raise exception '0042 S5.14: % is not present at that exact signature', v_def;
    end if;
    if (select p.proowner::regrole::text from pg_proc p where p.oid = v_def::regprocedure)
       <> 'clara_fn_owner' then
      raise exception '0042 S5.14: % is not owned by clara_fn_owner', v_def;
    end if;
  end loop;

  -- (3) EVERY S5 RECUT LINEAGE, RE-ASSERTED ON THE LIVE CATALOG. One row per spliced body;
  -- the marker is what THIS section added. Ownership is re-checked on each -- a recut that
  -- silently changed owner would break the definer chain every caller depends on.
  for r in select * from (values
      -- FORWARD TOLERANCE: the whole-unit roster also pins the four recuts this slice does
      -- not make -- (_subledger_on_approve -> clara._adj_on_approve(p_entry), 1),
      -- (reverse_entry -> clara._wdb_reversal_blocked(p_entry), 1),
      -- (revise_entry -> {"reason":"proposal_not_revisable"}, 1) and
      -- (withdraw_draft -> {"reason":"pair_draft_locked"}, 1). They land with their splices:
      -- the hook in D-b1+D-b2, the wall in D-b1, revise/withdraw in D-b2. The FINAL form is
      -- D-b2's. The fifth -- (fa_register_tie -> clara._fa_included_at(f.id, p_as_of), 4) --
      -- IS pinned below at its whole-unit count, because S5.19-b0 pulls the walk gate forward
      -- into this slice with S5.15.
      ('clara._fa_asset_json(uuid,date)', 'clara._fa_split_month_advisory(p_asset)', 1),
      ('clara.revise_fixed_asset_particulars(uuid,uuid,jsonb,date,text)',
        'clara._fa_assert_lineage_mintable(p_asset', 1),
      ('clara.dispose_fixed_asset(uuid,uuid,date,bigint,text,text,text,text,text,bigint)',
        'disposal_draft_outstanding', 2),
      ('clara._draft_opening_item_core(uuid,uuid,uuid,uuid,jsonb,jsonb,uuid,uuid,text)',
        'or v_cost is null', 2),
      -- [SPLIT D-b0 2026-08-04] set_client_fy_end's token, at THIS slice's count. The whole unit
      -- pins it at 2 (one per cadence arm); D-b0 ships the depreciation-authority arm alone,
      -- so it is minted ONCE. FORWARD TOLERANCE: D-b2 restores the count to 2 when it adds
      -- the clara.adjustment_templates arm.
      ('clara.set_client_fy_end(uuid,integer,integer,text)',
        'fy_end_locked_by_annual_cadence', 1),
      ('clara._fa_assert_code_unreserved(uuid,text)',
        'clara._acct_role_reserved(p_client, p_code)', 1),
      -- S5.15..S5.19 -- the reservation authority (owner ruling 2026-08-03 + the round-4 root
      -- fix). The three claiming doors are pinned on the SHARED DISCRIMINATOR, not on their
      -- own filters: that is the whole point of S5.15b, and a door that reverts to an inline
      -- filter fails here as well as in (6e).
      ('clara._fa_reserved_roles(uuid)',
        'clara._fa_status_holds_account_role(f.status)', 3),
      ('clara.upsert_fa_account_profile(uuid,text,text,text,text)',
        'clara._fa_role_claim_conflict(p_client, q.code, q.want_role)', 1),
      ('clara.upsert_fa_account_profile(uuid,text,text,text,text)',
        '''axis'', ''role_reserved''', 1),
      ('clara._draft_opening_item_core(uuid,uuid,uuid,uuid,jsonb,jsonb,uuid,uuid,text)',
        'clara._fa_role_claim_conflict(p_client, q.code, q.want_role)', 1),
      ('clara._draft_opening_item_core(uuid,uuid,uuid,uuid,jsonb,jsonb,uuid,uuid,text)',
        'coa_account_advance_reserved', 1),
      ('clara._fa_reversal_blocked(uuid)',
        'clara._fa_role_claim_conflict(fr.client_id, q.code, q.want_role)', 1),
      ('clara._fa_reversal_blocked(uuid)', 'fa_reverse_role_reclaimed', 1),
      ('clara.fa_register_tie(uuid,date)', 'clara._fa_included_at(f.id, p_as_of)', 4)
    ) as t(sig, marker, want) loop
    select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = r.sig::regprocedure;
    if v_def is null then
      raise exception '0042 S5.14: % is GONE after this section', r.sig;
    end if;
    v_cnt := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_cnt <> r.want then
      raise exception '0042 S5.14: % carries the S5 marker "%" % time(s), expected %', r.sig, r.marker, v_cnt, r.want;
    end if;
    if (select p.proowner::regrole::text from pg_proc p where p.oid = r.sig::regprocedure)
       <> 'clara_fn_owner' then
      raise exception '0042 S5.14: % is no longer owned by clara_fn_owner', r.sig;
    end if;
  end loop;

  -- (4) THE THREE MINTING PATHS ARE ALL GATED (design SS6.2's "three minting paths"). Counted
  -- from the catalog rather than trusted: a section that landed two of three would otherwise
  -- pass every block above.
  select count(*)::int into v_n from pg_proc p
    where p.pronamespace = 'clara'::regnamespace
      and p.prosrc like '%clara._fa_assert_lineage_mintable(%';
  if v_n <> 3 then
    raise exception '0042 S5.14: expected exactly 3 callers of clara._fa_assert_lineage_mintable (revise, the partial-split disposal, the K6 replacement), found % -- WDB-G11 names three minting paths', v_n;
  end if;

  -- (5) THE ADVISORY HAS EXACTLY ITS TWO CONSUMERS (design SS6.4: via _fa_asset_json and the
  -- revise response). A third consumer would mean somebody put a DERIVED advisory somewhere
  -- it could be mistaken for a stored fact.
  select count(*)::int into v_n from pg_proc p
    where p.pronamespace = 'clara'::regnamespace
      and p.prosrc like '%clara._fa_split_month_advisory(%';
  if v_n <> 2 then
    raise exception '0042 S5.14: expected exactly 2 callers of clara._fa_split_month_advisory (_fa_asset_json and revise_fixed_asset_particulars), found %', v_n;
  end if;

  -- (6) THE RESERVATION AUTHORITY IS SINGLE AND UNIVERSAL (owner ruling 2026-08-03, WDB-R3).
  -- The ruling's words are that the shared union becomes the authority EVERY claiming door
  -- consults. A comment cannot hold that; this census can. It re-derives the claiming-door
  -- list FROM THE CATALOG -- every clara body that writes role-claiming state -- and asserts
  -- each one reaches clara._acct_role_reserved, directly or through a named belt. A future
  -- door that writes one of these tables without consulting the union fails HERE, by name,
  -- instead of being found by a phantom register row months later.
  --   * The bank doors are excluded because their guard is STRUCTURAL, not per-door:
  --     t_bank_accounts_fa_reserved fires clara._fa_assert_code_unreserved (a union reader)
  --     on INSERT OR UPDATE OF coa_account_code, active. That trigger is asserted below.
  --
  -- THREE BODIES ARE EXCLUDED, AND THE EXCLUSION IS ITSELF CHECKED. clara._fa_on_approve and
  -- clara.revise_fixed_asset_particulars both INSERT clara.fixed_assets rows, but neither
  -- CHOOSES an account code: the hook's soft-birth reads the three codes off an ACTIVE
  -- clara.fa_account_profiles row (which S5.16 now vets) and its split arm copies them from
  -- the predecessor row, while the revise verb copies `fa.*` forward wholesale. An exclusion
  -- list nobody verifies is just a hole with a comment on it, so the discriminator is
  -- MEASURED rather than asserted: a door that chooses a code reads it out of caller input,
  -- which in this schema always looks like `->>'..._account_code'`. Both bodies below carry
  -- ZERO such reads (clara._draft_opening_item_core carried two of each, which is exactly how
  -- S5.17 found it). If a later edit gives either one a path from caller input to an account
  -- code, it stops being an inheritor and this census fails by name.
  --
  -- THE THIRD EXCLUSION WAS FOUND BY CLOSING BLIND SPOT (b), NOT BY THE FINDING [round-4].
  -- clara._adv_on_approve INSERTS clara.staff_advances rows and passed the old census only
  -- because it NAMES the union in a comment; measured on code alone it never called it. It is
  -- an INHERITOR of the same shape as the FA pair: the row's account_code comes from
  -- `jl.account_code` (the journal line that triggered the soft-birth) and its enrolment_id
  -- from clara._adv_enrolment_at, so the code was ALREADY claimed by an ACTIVE enrolment
  -- before this body ran -- it cannot make a new claim, only ride an existing one. Its
  -- discriminator is measured below in the same shape as the other two.
  for r in select * from (values
      ('_fa_on_approve'), ('revise_fixed_asset_particulars')) as t(nm) loop
    for v_n in select (length(p.prosrc) - length(replace(p.prosrc, q.probe, '')))
               from pg_proc p,
                    (values ('>>''asset_account_code'''), ('>>''accum_depr_account_code'''),
                            ('>>''depr_expense_account_code''')) as q(probe)
               where p.pronamespace = 'clara'::regnamespace and p.proname = r.nm loop
      if v_n <> 0 then
        raise exception '0042 S5.14 (6): clara.% now reads an account code out of caller input -- it is a CLAIMING door, not an inheritor, and must consult the shared reservation union', r.nm;
      end if;
    end loop;
  end loop;
  -- [SPLIT D-b0 2026-08-04] THE ADVANCE HOOK'S OWN DISCRIMINATOR IS NOT IN THIS SLICE:
  -- clara._adv_on_approve is SECTION S3's body (D-b1), and its inheritor classification --
  -- the journal-line-derived birth plus the clara._adv_enrolment_at window, and the negative
  -- "no account code from caller input" -- ships with it. FORWARD TOLERANCE: D-b1 restores
  -- this arm verbatim; the FINAL form is D-b2's.
  -- ---------------------------------------------------------------------------------
  -- ROUND-4: THE CENSUS ITSELF HAD THREE MEASURED BLIND SPOTS, AND ITS VACUITY FLOOR COULD
  -- DETECT NONE OF THEM. This gate is the ruling's root-eradication of the claiming-door
  -- class; a gate that can pass vacuously is precisely what it exists to prevent. All three
  -- are closed below, and the floor is replaced by something that can actually fail.
  --   (a) THE REGEX ASSUMED SINGLE-SPACE FORMATTING. Measured: clara.approve_opening_seed
  --       writes `set status='active',updated_at=now()` and both it and
  --       clara.approve_opening_correction write `update clara.fixed_assets fa set ...` --
  --       an ALIAS between the table and `set`. Every probe below now runs on the
  --       COMMENT-STRIPPED, WHITESPACE-COLLAPSED source, which is the instrument the rest of
  --       this build already uses (s6 tails 2, 9, 12) and the only one that cannot be dodged
  --       by a line wrap.
  --   (b) THE CONSULTS TEST WAS A SUBSTRING MATCH ON RAW prosrc, so a body that named the
  --       union only in a COMMENT passed as a consumer. Every one of these sections carries
  --       long comments naming the union by hand; that made the test nearly self-defeating.
  --       Stripping comments first is what makes "consults" mean CALLS.
  --   (c) UPDATE-SIDE CLAIMS WERE NEVER EXAMINED AT ALL. Ten bodies UPDATE these four tables
  --       and none was inspected -- yet re-pointing staff_advance_accounts.account_code, or
  --       flipping a retired enrolment back to active, or moving a register row back to a
  --       live status, RE-CLAIMS a code with no INSERT anywhere. (6c) reads the SET clauses
  --       and classifies them.
  --   (d) THE FLOOR (`< 6` on the same regex) was measured against a set of exactly 6, so it
  --       could only fail by accident, and it could not see (b) or (c) at all. It is replaced
  --       by an EXACT roster: a door added, removed or renamed fails BY NAME.
  -- ---------------------------------------------------------------------------------
  -- (6a) THE DOOR ROSTER -- INSERT SIDE AND UPDATE SIDE, EXACT. `\M` (end-of-word) after the
  -- table name keeps `clara.fixed_assets_history` or a constraint name out of the match.
  -- FORWARD TOLERANCE: the D-b1 form of this roster adds _adv_on_approve,
  -- complete_staff_advance_particulars, enrol_staff_advance_account and
  -- retire_staff_advance_account -- the four advance-family doors that write
  -- clara.staff_advance_accounts / clara.staff_advances. The FINAL form is D-b2's.
  v_names := '_draft_opening_item_core, _fa_on_approve, '
          || 'approve_opening_correction, approve_opening_seed, complete_fixed_asset_particulars, '
          || 'retire_fa_account_profile, '
          || 'revise_fixed_asset_particulars, upsert_fa_account_profile';
  select coalesce(string_agg(p.proname::text, ', ' order by p.proname::text collate "C"), '')
    into v_found
    from pg_proc p
   where p.pronamespace = 'clara'::regnamespace
     and lower(regexp_replace(regexp_replace(regexp_replace(
           p.prosrc, '/\*[\s\S]*?\*/', '', 'g'), '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))
         ~ '(insert into|update) clara\.(fa_account_profiles|fixed_assets|staff_advance_accounts|staff_advances)\M';
  if v_found <> v_names then
    raise exception '0042 S5.14 (6a): the bodies that WRITE role-claiming state are {%} -- expected exactly {%}. WDB-R3 makes the shared union the authority EVERY claiming door consults; a door that appears here has not been classified, and a door that disappears has taken its classification with it.', v_found, v_names;
  end if;

  -- (6b) EVERY INSERT-SIDE DOOR REACHES THE UNION -- measured on the comment-stripped source,
  -- so a comment cannot stand in for a call. The three inheritors keep their measured
  -- exclusion (they choose no code, asserted above).
  --
  -- ONE DELEGATE IS ACCEPTED, AND ONLY BECAUSE THE CHAIN IS CLOSED ELSEWHERE.
  -- clara.enrol_staff_advance_account asks clara._adv_enrolment_admission, which exists so
  -- that the enrolment door and the reversal path can never give different answers about the
  -- same code -- and that helper is itself on roster (A) in S5.19b, where its DIRECT consult
  -- of clara._acct_role_reserved is asserted. Accepting the delegate is therefore not a
  -- loophole: the delegate cannot stop consulting without (A) failing, and the door cannot
  -- stop calling the delegate without (A2) failing. Accepting an UNPINNED delegate would be a
  -- loophole, which is why exactly one name appears here.
  for r in select p.proname,
             lower(regexp_replace(regexp_replace(regexp_replace(
               p.prosrc, '/\*[\s\S]*?\*/', '', 'g'), '--[^\n]*', '', 'g'), '\s+', ' ', 'g')) as src
           from pg_proc p
          where p.pronamespace = 'clara'::regnamespace
            and p.proname not in ('_fa_on_approve', 'revise_fixed_asset_particulars',
                                  '_adv_on_approve')
            and lower(regexp_replace(regexp_replace(regexp_replace(
                  p.prosrc, '/\*[\s\S]*?\*/', '', 'g'), '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))
                ~ 'insert into clara\.(fa_account_profiles|fixed_assets|staff_advance_accounts|staff_advances)\M'
  loop
    if position('clara._acct_role_reserved' in r.src) = 0
       and position('clara._fa_role_claim_conflict' in r.src) = 0
       and position('clara._fa_assert_code_unreserved' in r.src) = 0
       and position('clara._adv_enrolment_admission' in r.src) = 0 then
      raise exception '0042 S5.14 (6b): clara.% INSERTS role-claiming state but never CALLS the shared reservation authority -- WDB-R3 requires every claiming door to consult it, and a comment naming the union is not a consult', r.proname;
    end if;
  end loop;

  -- (6c) THE UPDATE SIDE. An UPDATE claims a code when it assigns one, or when it brings a
  -- row back to a state that holds one: `active=true` on an enrolment or profile, or a
  -- pending/active status on a register row. Every SET clause on the four tables is read and
  -- tested; a widening one must be on the roster below WITH ITS GUARD, which is asserted.
  --   clara._fa_on_approve            -- arm 3c RESURRECTS: status back to 'active'. Guarded
  --                                      by clara._fa_reversal_blocked (0042 S5.18), which
  --                                      asks the discriminator about the restored roles.
  --   clara.approve_opening_correction \ activate rows that were seeded PENDING. Nothing
  --   clara.approve_opening_seed       / becomes NEWLY claimed: pending already HOLDS
  --                                      (S5.15's truth table), and the codes were vetted at
  --                                      seed time under the leaf by S5.17. The premise --
  --                                      that pending holds -- is asserted, not assumed.
  -- THE FRAGMENT IS TRIMMED TO ITS SET CLAUSE. Measured hazard: clara.retire_fa_account_profile
  -- carries `where ... asset_account_code = p_asset_account`, and a probe that read the whole
  -- statement would call a RETIREMENT a re-claim. What claims an account is an ASSIGNMENT, so
  -- everything from the first ` from `/` where `/` returning ` onward is cut before testing.
  for r in select p.proname,
             (select coalesce(string_agg(
                regexp_replace(m.f[1], ' (from|where|returning) .*$', ''), ' | '), '')
              from regexp_matches(
                lower(regexp_replace(regexp_replace(regexp_replace(
                  p.prosrc, '/\*[\s\S]*?\*/', '', 'g'), '--[^\n]*', '', 'g'), '\s+', ' ', 'g')),
                '(update clara\.(?:fa_account_profiles|fixed_assets|staff_advance_accounts|staff_advances)\M[^;]*)',
                'g') as m(f)) as sets
           from pg_proc p
          where p.pronamespace = 'clara'::regnamespace
  loop
    if r.sets <> '' and (r.sets ~ 'account_code *=' or r.sets ~ 'active *= *true'
                         or position('''active''' in r.sets) <> 0
                         or position('''pending''' in r.sets) <> 0) then
      if r.proname not in ('_fa_on_approve', 'approve_opening_correction', 'approve_opening_seed') then
        raise exception '0042 S5.14 (6c): clara.% UPDATES a claim-bearing column to a value that RE-CLAIMS an account (re-pointing a code, re-activating an enrolment, or returning a register row to a live status) -- an INSERT-only census would never have seen it. Consult the shared reservation authority under the fa-roles leaf, or classify it here with the reason it cannot widen a claim.', r.proname;
      end if;
    end if;
  end loop;
  -- ...AND THE THREE CLASSIFIED WIDENERS CARRY THEIR GUARD OR THEIR PREMISE.
  select lower(regexp_replace(regexp_replace(regexp_replace(
           p.prosrc, '/\*[\s\S]*?\*/', '', 'g'), '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))
    into v_found from pg_proc p
    where p.pronamespace = 'clara'::regnamespace and p.proname = '_fa_on_approve';
  if position('clara._fa_reversal_blocked' in v_found) = 0 then
    raise exception '0042 S5.14 (6c): clara._fa_on_approve resurrects disposed register rows to ACTIVE but no longer consults clara._fa_reversal_blocked -- the resurrection window S5.15 opened is unguarded';
  end if;
  if not clara._fa_status_holds_account_role('pending') then
    raise exception '0042 S5.14 (6c): a PENDING register row no longer holds its codes -- the two opening-approval doors activate rows seeded as pending, and their whole classification rests on pending already holding the claim';
  end if;

  -- (6e) THE RULE HAS EXACTLY ONE EXPRESSION [round-4 root fix]. The at-most-one-role-per-
  -- account discriminator lives in clara._fa_role_claim_conflict and NOWHERE ELSE. Three
  -- doors hand-wrote it, one of them wrongly (`domain <> 'fa'` with no role, S5.17 as first
  -- built); this assertion is what stops a fourth copy being written next wave.
  --
  -- [CROSS-SECTION EDIT by the S5.19 lane, round 6 -- Reported, not silent.] ONE CLASSIFIED
  -- EXCLUSION, AND THE REASON IS MEASURED RATHER THAN ASSERTED. This arm matches on the TEXT
  -- `domain <> 'fa'`, and round 6 produced a body that spells it while asking a DIFFERENT
  -- QUESTION: clara._fa_gl_leg_foreign asks "did another register family own this code at the
  -- instant this entry was approved" -- an ATTRIBUTION question, as of a date, over the AS-OF
  -- union -- where the discriminator asks "may the fixed-asset family CLAIM this role on this
  -- code NOW". Rewording the comparison to slip past this census would have been the worst
  -- available move (a census evaded is a census gone), and routing an attribution question
  -- through a claim predicate would have made a reader depend on a door. So it is CLASSIFIED,
  -- the way the ruling requires -- with the two properties that make it not-a-fourth-copy
  -- CHECKED below, so nothing can hide behind the name.
  select coalesce(string_agg(p.proname::text, ', ' order by p.proname::text collate "C"), '')
    into v_found
    from pg_proc p
   where p.pronamespace = 'clara'::regnamespace
     and p.proname not in ('_fa_role_claim_conflict', '_fa_gl_leg_foreign')
     and lower(regexp_replace(regexp_replace(regexp_replace(
           p.prosrc, '/\*[\s\S]*?\*/', '', 'g'), '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))
         ~ 'domain *(<>|!=|is distinct from) *''fa''';
  if v_found <> '' then
    raise exception '0042 S5.14 (6e): clara.{%} re-expresses the reservation discriminator inline. It has exactly one home (clara._fa_role_claim_conflict): three doors wrote it by hand and one wrote it WITHOUT THE ROLE, which let a K-doc seed bake a register row whose cost code was another live row''s accumulated code. Call the predicate.', v_found;
  end if;
  -- ...AND THE EXCLUSION IS EARNED, NOT GRANTED. (1) It reads the AS-OF authority, so it
  -- cannot be answering the NOW claim question; (2) it never tests a ROLE, so it cannot be the
  -- discriminator wearing another name -- which is precisely the defect (6e) exists to stop,
  -- since the hand-written copy that broke a register row was the one that dropped the role.
  select lower(regexp_replace(regexp_replace(regexp_replace(
           p.prosrc, '/\*[\s\S]*?\*/', '', 'g'), '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))
    into v_found from pg_proc p
   where p.pronamespace = 'clara'::regnamespace and p.proname = '_fa_gl_leg_foreign';
  if v_found is null or position('clara._acct_role_reserved_at(' in v_found) = 0
     or v_found ~ 'role *(=|<>|!=|is distinct from|in) *' then
    raise exception '0042 S5.14 (6e): clara._fa_gl_leg_foreign is excluded from the discriminator census on the ground that it asks an AS-OF ATTRIBUTION question and never tests a role. It no longer has both properties, so the exclusion has stopped being true -- either it is now a fourth hand-written copy of the claim discriminator, or it has stopped consulting the as-of authority and is deciding whose money a GL leg is on its own.';
  end if;

  if not exists (select 1 from pg_trigger tg
                 where not tg.tgisinternal and tg.tgname = 't_bank_accounts_fa_reserved'
                   and tg.tgrelid = 'clara.bank_accounts'::regclass
                   and tg.tgfoid = 'clara._tf_fa_bank_reserved'::regproc) then
    raise exception '0042 S5.14 (6): the bank domain has lost its structural reservation trigger';
  end if;

  raise notice '0042 S5.14 OK (D-b0 slice): cost_cents is NOT NULL with its dead residual disjunct deliberately kept; all four new helpers exist and are fn-owner owned; every recut this slice makes carries its markers at the exact counts; the three G11 minting paths and the two G14 consumers are pinned by census; the claiming-door roster is EXACT on both the INSERT and the UPDATE side at this slice''s membership; and the reservation discriminator has exactly one expression.';
end $s5_14$;

-- =====================================================================================
-- [SPLIT D-b0 2026-08-04] RELABELLED S5.15f (census hazard sect.7.5). The label `S5.15` is used
-- TWICE in the whole unit -- at its L1861 for clara._fa_reserved_roles and at its L3640 for
-- this block -- and both blocks ship in THIS slice, so their probe messages would otherwise
-- be indistinguishable. Only the label and the DO tag change; every predicate, count,
-- anchor and message body below is byte-exact.
-- S5.15f -- clara.depreciation_run_due: THE NULL-jwt_firm() FAIL-OPEN, CLOSED ON THE LIVE
-- 0041 BODY (owner ruling 2026-08-03, WDB-R1 + WDB-R2).
--
-- THIS SECTION IS NOT A DESIGN RESIDUAL. Every other splice in S5 discharges something
-- docs/plan/wave-d-b-design.md SS6 already named; this one exists because the ruling WIDENED
-- 0042's register to already-shipped code: "fixing only 0042 would leave the live hole open
-- and split a two-member family". clara.depreciation_run_due has been LIVE IN PRODUCTION
-- since the D-a ceremony carrying the same defect as its 0042 twin.
--
-- THE DEFECT. `if v_jwt is not null and v_jwt <> v_firm then raise` -- clara.jwt_firm() reads
-- only `status = 'active'` memberships, so it goes NULL the moment a membership is revoked
-- while the user's JWT is still valid and still presents a sub. The guard passes on the null
-- and this SECURITY DEFINER body, which has unconditional RLS visibility, hands a removed
-- employee another firm's depreciation schedule. MEASURED end to end on the rig before the
-- fix, not inferred.
--
-- THE FIX IS THE SHARED PREDICATE, NOT A SECOND PATCH. Both members of the family now consult
-- clara._assert_due_read_ctx (S2.0), which discriminates the CALLER -- the leader sweep
-- carries no JWT BY DESIGN, so a bare null-rejection would silently kill the daily sweep.
-- The full reasoning, the measured evidence for the role-GUC test, and the rejected
-- pg_has_role alternative are documented once, at that body. WDB-R2 is the whole point: two
-- copies of one admission rule is what produced two identical holes.
--
-- WHY IT SITS AFTER S5.14's CLOSING CENSUS. S5.14 asserts what the DESIGN's residual register
-- claimed; this splice comes from the ruling and carries its own complete prestate + postcheck
-- (the chain-of-recut law is per-splice, not per-section), so it is self-contained rather than
-- threaded through a census a concurrently-edited section also owns. Reported to the
-- assembly lane so the two can be unified deliberately rather than by collision.
-- =====================================================================================
set role clara_fn_owner;

do $s5_15f$
declare
  v_sig text := 'clara.depreciation_run_due(uuid)';
  v_def text; v_frm text; v_cnt int; v_n int; r record;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if v_def is null then
    raise exception '0042 S5.15f prestate: clara.depreciation_run_due is GONE' using errcode = 'CLR10';
  end if;
  if position('clara._assert_due_read_ctx(' in v_def) <> 0 then
    raise exception '0042 S5.15f prestate: depreciation_run_due already consults the shared admission predicate -- this splice has already been applied to this database'
      using errcode = 'CLR10';
  end if;
  -- THE SHARED PREDICATE MUST ALREADY EXIST (section S2 runs before section S5). Asserted
  -- rather than assumed: a section-order regression would otherwise leave this body calling
  -- a function that is not there, and the failure would surface at sweep time in production
  -- instead of here at apply time.
  if to_regprocedure('clara._assert_due_read_ctx(uuid)') is null then
    raise exception '0042 S5.15f prestate: clara._assert_due_read_ctx(uuid) does not exist -- section S2 must run before S5'
      using errcode = 'CLR10';
  end if;
  -- THE PRE-EXISTING MARKER CENSUS at counts MEASURED on the live 0001..0041 catalog.
  for r in select * from (values
      ('clara.jwt_firm()', 1),
      ('clara._fa_oldest_unmet_period(p_client)', 1),
      ($$'client_not_found'$$, 1),
      ('CLR11', 1)) as t(marker, want) loop
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '0042 S5.15f prestate: depreciation_run_due carries the marker "%" % time(s), expected % -- the body drifted; re-derive this section against the live catalog', r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (a) THE DECLARATION: v_jwt dies with the guard that used it.
  v_frm := $f$declare v_firm uuid; v_jwt uuid;$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0042 S5.15f prestate (a): the declaration appears % time(s) (expected exactly once)', v_cnt using errcode = 'CLR10';
  end if;
  v_def := replace(v_def, v_frm, $t$declare v_firm uuid;$t$);

  -- (b) THE GUARD BLOCK. Replaced WHOLE -- the admission verdict is reached before ANY
  -- branch returns, so 'client_not_found' stops being an existence oracle for a caller who
  -- was never admitted. An admitted caller's client_not_found / CLR11 outcomes are unchanged.
  v_frm := $f$  if v_firm is null then
    return jsonb_build_object('due', false, 'reason', 'client_not_found');
  end if;
  v_jwt := clara.jwt_firm();
  if v_jwt is not null and v_jwt <> v_firm then
    raise exception 'client is not in your firm' using errcode = 'CLR11';
  end if;
$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0042 S5.15f prestate (b): the firm guard block appears % time(s) (expected exactly once)', v_cnt using errcode = 'CLR10';
  end if;
  v_def := replace(v_def, v_frm,
    $t$  -- 0042 (owner ruling 2026-08-03, WDB-R1/WDB-R2): ADMISSION BEFORE ANY ANSWER. The
  -- guard this replaces compared the caller's firm claim to the client's firm ONLY when that
  -- claim was non-null -- and the claim reader is active-membership-only, so it goes null the
  -- moment a membership is REVOKED while the JWT is still valid. The comparison was therefore
  -- skipped exactly when it mattered, and this definer body handed a removed employee another
  -- firm's schedule. The shared predicate discriminates the CALLER instead (the leader sweep
  -- legitimately presents no claims); it is the SAME body clara.adjustment_run_due consults,
  -- so this two-member family can no longer drift apart. Reasoning: clara._assert_due_read_ctx.
  --
  -- (This comment deliberately names no symbol from the old guard: S5.15f's postcheck proves
  -- the fail-open is gone by counting those literals at zero, and quoting them here would
  -- defeat the very census that protects the fix.)
  perform clara._assert_due_read_ctx(v_firm);
  if v_firm is null then
    return jsonb_build_object('due', false, 'reason', 'client_not_found');
  end if;
$t$);
  execute v_def;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  for r in select * from (values
      ('clara._assert_due_read_ctx(v_firm)', 1),
      ('clara._fa_oldest_unmet_period(p_client)', 1),
      ($$'client_not_found'$$, 1),
      ('clara.jwt_firm()', 0),
      ('v_jwt', 0),
      ('CLR11', 0)) as t(marker, want) loop
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '0042 S5.15f postcheck: marker "%" is now % (expected %) -- the splice damaged the body', r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;
  -- THE OLD FAIL-OPEN TEST IS GONE: a vacuous replace() cannot pass this.
  if position('v_jwt is not null' in v_def) <> 0 then
    raise exception '0042 S5.15f postcheck: the null-tolerant jwt test is still present -- replace() passed vacuously'
      using errcode = 'CLR10';
  end if;
  if (select p.proowner::regrole::text from pg_proc p where p.oid = v_sig::regprocedure)
     <> 'clara_fn_owner' then
    raise exception '0042 S5.15f postcheck: depreciation_run_due changed owner' using errcode = 'CLR10';
  end if;
  -- THE MACHINE LANE MUST STILL BE ABLE TO REACH IT. Breaking the sweep silently is a worse
  -- outcome than the hole this closes, so the grant is re-asserted here rather than assumed
  -- to have survived CREATE OR REPLACE.
  --
  -- READ THROUGH aclexplode RATHER THAN has_function_privilege(role, sig, 'execute'), AND SAY
  -- "invoke" IN THE MESSAGES. The privilege-name argument and the message text are both
  -- ordinary string literals -- but `scripts/check-wiki-dynamic-sql.mjs` collects the quoted
  -- literals of a change-of-record block as FRAGMENTS (the text that ends up in the persistent
  -- surface) and scans them for a dynamic-SQL token, so a literal spelled e-x-e-c-u-t-e reads
  -- to that gate as this splice installing dynamic SQL into clara.depreciation_run_due. It is
  -- not: the installed body contains no dynamic SQL at all (measured: position('EXECUTE' in
  -- upper(prosrc)) = 0). The gate is a WIKI AUTHORITY BOUNDARY (WB-R21) and is deliberately
  -- fail-closed; its own refusal text says a loosened pattern is never the remedy and an
  -- allowlist entry is a contract change. Neither is warranted for a false positive we can
  -- simply write around, so the postcheck keeps its exact meaning and drops the token.
  -- aclexplode is also the stricter instrument: has_function_privilege() answers "can this
  -- role reach it", which is TRUE for a superuser or via PUBLIC even with no explicit grant,
  -- whereas this asks the ACL whether the grant is actually recorded.
  --
  -- NO privilege_type FILTER, DELIBERATELY, AND IT LOSES NOTHING: PostgreSQL defines exactly
  -- ONE privilege for a FUNCTION, so every row aclexplode() yields from a pg_proc.proacl is an
  -- invoke grant by construction -- the filter would be a tautology. Spelling it out would
  -- also put the token back in a quoted literal and re-trip the gate, which is the whole
  -- point of this shape. (Postcheck for the postcheck: if a future PostgreSQL adds a second
  -- function privilege, this becomes weaker than intended -- but the migration would then be
  -- asserting a grant that exists rather than one that does not, and the x41/x42 grant-matrix
  -- censuses assert the exact per-role EXECUTE set independently.)
  if not exists (
    select 1 from pg_proc p, aclexplode(p.proacl) a
    where p.oid = v_sig::regprocedure and a.grantee = 'clara_runtime'::regrole) then
    raise exception '0042 S5.15f postcheck: clara_runtime can no longer invoke depreciation_run_due -- the leader sweep would go dark'
      using errcode = 'CLR10';
  end if;
  if not exists (
    select 1 from pg_proc p, aclexplode(p.proacl) a
    where p.oid = v_sig::regprocedure and a.grantee = 'clara_authenticated'::regrole) then
    raise exception '0042 S5.15f postcheck: clara_authenticated can no longer invoke depreciation_run_due -- /assets would go dark'
      using errcode = 'CLR10';
  end if;


  -- THE FAMILY IS WHOLE: every due oracle in this slice consults the ONE predicate. Counted
  -- from the catalog, because a fix that landed on one of two members is the exact failure
  -- the ruling forbids.
  -- [SPLIT D-b0 2026-08-04] SLICE-LOCAL COUNT, WITH FORWARD TOLERANCE. The whole unit asserts
  -- EXACTLY 2 consumers (clara.adjustment_run_due + clara.depreciation_run_due); this slice
  -- ships neither clara.adjustment_run_due nor any other member, so the honest count here is
  -- 1. RECORDED AS A CENSUS FINDING: split-dependency census sect.3 marks this block "NOT
  -- PURE -- _assert_due_read_ctx (Class A, movable -> then PURE)", but moving the predicate
  -- does NOT make the block pure -- this two-member family count names a D-b2 body and is a
  -- second, unlisted forward dependency. Reported, not improvised around.
  -- FINAL FORM, NAMED HONESTLY: NO LATER MIGRATION RESTORES THIS COUNT TO 2. Measured across
  -- all four slice builds, no S5.15f block ships again, so the whole unit's apply-time claim
  -- that BOTH due oracles admit through the one shared predicate is discharged in the SPLIT by
  -- packages/db/tests/x42-due-admission.test.mjs:218-223 ("both due oracles -- and only they
  -- -- must consult clara._assert_due_read_ctx"), which is assigned WHOLE to D-b2's test list.
  -- The claim therefore survives as a CI test at the full frontier, not as a build-time
  -- ratchet: D-b2's hold-ladder, which recuts clara.adjustment_run_due, must treat that test
  -- as the instrument that holds it.
  select count(*)::int into v_n from pg_proc p
    where p.pronamespace = 'clara'::regnamespace
      and p.prosrc like '%clara._assert_due_read_ctx(%';
  if v_n <> 1 then
    raise exception '0042 S5.15f: expected exactly 1 consumer of clara._assert_due_read_ctx in this slice (depreciation_run_due; clara.adjustment_run_due joins in D-b2), found % -- the family must not be split', v_n;
  end if;
  raise notice '0042 S5.15f OK (D-b0 slice): depreciation_run_due admits through the shared predicate; the null-tolerant jwt test is gone; both grants survived; the one due oracle this slice ships consults the one admission body.';
end $s5_15f$;

reset role;

-- =====================================================================================
-- S5.15c -- clara._fa_oldest_unmet_period: THE FIXED-ASSET DUE ORACLE JOINS THE ONE RE-RUN
-- ADMISSION QUESTION (as-built ladder round 6; owner ruling 2026-08-03 WDB-R1/WDB-R2).
--
-- WHY A 0041 BODY IS BEING RECUT AT ALL. Round 5 closed the correct-and-re-run double on the
-- adjustment lane and keyed both of its remedies on lane/identity -- one lane's flag key and
-- template_id. Round 6 measured the SIBLING lane carrying the identical shape end to end, on
-- LIVE 0041 code, with no human in the loop:
--   a monthly straight-line asset, 360,000 sen over 36 months (10,000 a month);
--   month 1 corrected through clara.reverse_entry -- a lawful act this product offers;
--   the correction landing on MYT today, so the corrected MONTH's own books never moved;
--   THIS oracle then reporting the month due again (the register's coverage probe reads
--     is_live charge rows, and the unwind flipped the original dead);
--   and clara.run_depreciation_period AUTO-POSTING the re-run, because the ramp was already
--     earned by two later un-reversed runs.
-- Result: 20,000 of accumulated depreciation and 20,000 of expense in a month whose charge is
-- 10,000, in BOTH the ledger and the register -- and clara.fa_register_tie certifying it at
-- accum_diff_cents = 0, because the two sides had been made wrong in exactly the same way. A
-- tie between two copies of one number is not evidence.
--
-- THE QUESTION IS ASKED OF THE CLIENT'S OWN CHARGE ROWS. clara._wdb_rerun_breach's
-- depreciation arm reads clara.fa_depreciation -- the same instrument this body already uses to
-- decide what is due -- and asks whether any charge was unwound at an effective_date other than
-- the one it was charged at. It never reads an authority id, so retiring and re-signing an
-- authority cannot get around it, which is the entire lesson of round 6.
--
-- IT ANSWERS false/period_correction_unsound RATHER THAN RAISING. This body is a probe on the
-- leader sweep's hot path; the sweep must be able to skip the client, and the /assets surface
-- must be able to render the reason. The poster's own admission (S5.15d) is where it becomes a
-- refusal.
-- =====================================================================================
set role clara_fn_owner;

do $s5_15c$
declare
  v_sig text := 'clara._fa_oldest_unmet_period(uuid)';
  v_def text; v_frm text; v_cnt int; v_n int; r record;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if v_def is null then
    raise exception '0042 S5.15c prestate: clara._fa_oldest_unmet_period is GONE' using errcode = 'CLR10';
  end if;
  if position('clara._wdb_rerun_breach(' in v_def) <> 0 then
    raise exception '0042 S5.15c prestate: the FA due oracle already consults the shared re-run gate -- this splice has already been applied to this database'
      using errcode = 'CLR10';
  end if;
  if to_regprocedure('clara._wdb_rerun_breach(uuid,text,text[],date,date)') is null then
    raise exception '0042 S5.15c prestate: clara._wdb_rerun_breach does not exist -- section S2 must run before S5'
      using errcode = 'CLR10';
  end if;
  -- THE 0041 MARKER CENSUS at counts measured on the live 0001..0041 catalog. This body carries
  -- the D-a round-3 F3 fold (one oracle, one arithmetic) and the round-3.5 G6 shrinking
  -- horizon; a drift in either changes what "due" means and this splice must not land on it.
  for r in select * from (values
      ('clara._fa_today()', 1),
      ('clara._fa_month_end(v_today)', 1),
      ('period_draft_outstanding', 1),
      ('nothing_due', 1),
      ('period_not_ended', 1),
      ('clara._fa_first_due_month(fa.id', 1),
      ('clara._fa_disposal_draft_outstanding(p_client, fa.id, v_horizon)', 1)) as t(marker, want) loop
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '0042 S5.15c prestate: the FA due oracle carries the marker "%" % time(s), expected % -- the body drifted; re-derive this section against the live catalog', r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;

  -- THE ANCHOR: immediately after the draft-outstanding freeze, which is the LAST client-scope
  -- sequencing question this body asks before it starts walking assets. The new question is
  -- client-scope too, and it must be asked before any per-asset arithmetic can propose a month.
  v_frm := $f$    return jsonb_build_object('due', false, 'reason', 'period_draft_outstanding');
  end if;$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0042 S5.15c prestate: the draft-outstanding anchor appears % time(s) (expected exactly once) -- the body drifted; re-derive this splice', v_cnt
      using errcode = 'CLR10';
  end if;
  v_def := replace(v_def, v_frm,
    $t$    return jsonb_build_object('due', false, 'reason', 'period_draft_outstanding');
  end if;
  -- 0042 (as-built ladder round 6): THE ONE RE-RUN ADMISSION QUESTION, ASKED OF THIS CLIENT'S
  -- OWN CHARGE ROWS. A charge whose unwind carries a different effective_date left the month it
  -- charged still holding money while flipping the coverage probe below to "uncovered" -- so
  -- this body would report the month due and the poster would charge it a second time, over a
  -- figure that never left. Measured before the fix at exactly double, unattended, with the
  -- register tie certifying zero difference. The horizon is the widest month this walk can
  -- reach, so the gate sees every row a proposal out of here could cause to be re-charged.
  -- Reasoning, and the identical question the adjustment lane asks: clara._wdb_rerun_breach.
  if clara._wdb_rerun_breach(p_client, 'depreciation_charges', null::text[],
                             v_horizon, v_horizon) is not null then
    return jsonb_build_object('due', false, 'reason', 'period_correction_unsound');
  end if;$t$);
  execute v_def;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  for r in select * from (values
      ('clara._wdb_rerun_breach(p_client', 1),
      ('period_correction_unsound', 1),
      ('period_draft_outstanding', 1),
      ('nothing_due', 1),
      ('period_not_ended', 1),
      ('clara._fa_first_due_month(fa.id', 1),
      ('clara._fa_disposal_draft_outstanding(p_client, fa.id, v_horizon)', 1)) as t(marker, want) loop
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '0042 S5.15c postcheck: marker "%" is now % (expected %) -- the splice damaged the body', r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;
  -- ORDERED: the gate sits AFTER the draft freeze and STRICTLY BEFORE the asset walk, or a
  -- month could be proposed by arithmetic that never met the gate.
  if not (position('period_draft_outstanding' in v_def)
            < position('clara._wdb_rerun_breach(p_client' in v_def)
          and position('clara._wdb_rerun_breach(p_client' in v_def)
            < position('for fa in select f.id as id from clara.fixed_assets f' in v_def)) then
    raise exception '0042 S5.15c postcheck: the re-run gate is not between the draft freeze and the asset walk'
      using errcode = 'CLR10';
  end if;
  if (select p.proowner::regrole::text from pg_proc p where p.oid = v_sig::regprocedure)
     <> 'clara_fn_owner' then
    raise exception '0042 S5.15c postcheck: _fa_oldest_unmet_period changed owner' using errcode = 'CLR10';
  end if;
  raise notice '0042 S5.15c OK: the FA due oracle consults the one re-run admission body; its 0041 arithmetic markers all survived.';
end $s5_15c$;

reset role;

-- =====================================================================================
-- S5.15d -- clara._fa_run_period_core: THE FIXED-ASSET POSTER'S OWN ADMISSION
-- (as-built ladder round 6).
--
-- WHY THE POSTER ASKS TOO, when the oracle it already calls now answers the same question.
-- clara.run_depreciation_period and clara.run_depreciation_manual take a CALLER-NAMED period.
-- The oracle's answer reaches this body only through `v_due`, and this body reads exactly two
-- things out of v_due -- the draft freeze and the earlier-unmet sequencing bound. A caller who
-- names a period directly is admitted on those two alone. So the oracle answering honestly is
-- not the same as the poster refusing, and the gate has to be asked where the money is written.
-- This is the identical argument 0041 S4.10 made for putting the FA reversal wall on
-- clara.reverse_entry as well as in the approve-time hook, and 0042 S5.9 made for the D-b wall.
--
-- IT IS A RAISE, NOT A noop. A period this body cannot lawfully charge is not "nothing due" --
-- the difference is that a noop leaves the sweep proposing the same period forever with a
-- receipt that says everything is fine, while a refusal names the charge, both dates and an act
-- that clears it. The remedy named is clara.retire_depreciation_authority, and it is the ONE
-- act that reaches this state: with no live authority the oracle answers authority_not_live and
-- the period stops being advertised, which hands the books to a human -- exactly the disposition
-- the adjustment lane's period_correction_unsound already takes.
--
-- ANCHOR: after the whole sequencing block and IMMEDIATELY BEFORE the arithmetic, so it fires
-- before a single charge is computed and after every cheaper refusal.
-- =====================================================================================
set role clara_fn_owner;

do $s5_15d$
declare
  v_sig text := 'clara._fa_run_period_core(uuid,date,date,text,uuid,uuid,text)';
  v_def text; v_frm text; v_cnt int; v_n int; r record;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if v_def is null then
    raise exception '0042 S5.15d prestate: clara._fa_run_period_core is GONE' using errcode = 'CLR10';
  end if;
  if position('clara._wdb_rerun_breach(' in v_def) <> 0 then
    raise exception '0042 S5.15d prestate: the FA poster already consults the shared re-run gate -- this splice has already been applied to this database'
      using errcode = 'CLR10';
  end if;
  if to_regprocedure('clara._wdb_rerun_breach(uuid,text,text[],date,date)') is null then
    raise exception '0042 S5.15d prestate: clara._wdb_rerun_breach does not exist -- section S2 must run before S5'
      using errcode = 'CLR10';
  end if;
  -- THE 0041 MARKER CENSUS. Every one of these is a law this splice must not land on top of:
  -- the client rung, the authority read, the cadence bound, the not-ended bound, the two
  -- sequencing arms, the exact-balance test and the derived ramp predicate.
  for r in select * from (values
      ('pg_advisory_xact_lock(203005004', 1),
      ('authority_not_live', 1),
      ('not_cadence_aligned', 1),
      ('not_ended', 1),
      ('clara._fa_oldest_unmet_period(p_client)', 1),
      ('period_draft_outstanding', 2),
      ('period_earlier_unmet', 1),
      ('clara._fa_compute_charges(p_client, v_ps, v_pe)', 1),
      ('clara._assert_balanced(v_entry)', 1),
      ('clara._approve_entry_core(', 1)) as t(marker, want) loop
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '0042 S5.15d prestate: the FA poster carries the marker "%" % time(s), expected % -- the body drifted; re-derive this section against the live catalog', r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (a) THE DECLARATION.
  v_frm := $f$  v_actor uuid; v_ramp boolean; v_status text; v_dr bigint; v_cr bigint;$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0042 S5.15d prestate (a): the declaration line appears % time(s) (expected exactly once)', v_cnt using errcode = 'CLR10';
  end if;
  v_def := replace(v_def, v_frm,
    $f$  v_actor uuid; v_ramp boolean; v_status text; v_dr bigint; v_cr bigint; v_breach jsonb;$f$);

  -- (b) THE GATE, immediately above the arithmetic.
  v_frm := $f$  v_res := clara._fa_compute_charges(p_client, v_ps, v_pe);$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0042 S5.15d prestate (b): the arithmetic anchor appears % time(s) (expected exactly once)', v_cnt using errcode = 'CLR10';
  end if;
  v_def := replace(v_def, v_frm,
    $t$  -- 0042 (as-built ladder round 6): THE ONE RE-RUN ADMISSION QUESTION, ASKED WHERE THE
  -- MONEY IS WRITTEN. The sequencing arms above read the due oracle, but only for its draft
  -- freeze and its earlier-unmet bound -- a caller naming a period directly is admitted past
  -- both. This asks the client's own charge rows whether anything already charged into range
  -- was unwound at a date other than the one it was charged at; if so, the month still holds
  -- money the coverage probe can no longer see, and charging it again puts the figure in twice.
  -- Measured before the fix at exactly double, posted unattended, with clara.fa_register_tie
  -- reporting accum_diff_cents = 0 because register and ledger were made wrong together.
  -- Reasoning, and the identical question the adjustment lane asks: clara._wdb_rerun_breach.
  v_breach := clara._wdb_rerun_breach(p_client, 'depreciation_charges', null::text[], v_ps, v_pe);
  if v_breach is not null then
    raise exception 'this client has a depreciation charge (asset %, % .. %) booked at % whose reversal is dated %, so that period never cleared and charging again would leave the figure standing twice. Finish it by hand; retire the depreciation authority (clara.retire_depreciation_authority) to stop the period being proposed.',
      v_breach ->> 'asset_id', v_breach ->> 'period_start', v_breach ->> 'period_end',
      v_breach ->> 'posting_date', v_breach ->> 'correction_posting_date'
      using errcode = 'CLR38',
        detail = (jsonb_build_object('reason', 'period_correction_unsound',
          'period_start', v_ps, 'period_end', v_pe,
          'remedy', 'retire_depreciation_authority') || v_breach)::text;
  end if;
  v_res := clara._fa_compute_charges(p_client, v_ps, v_pe);$t$);
  execute v_def;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  for r in select * from (values
      ('clara._wdb_rerun_breach(p_client', 1),
      ('period_correction_unsound', 1),
      ('retire_depreciation_authority', 2),
      ('pg_advisory_xact_lock(203005004', 1),
      ('authority_not_live', 1),
      ('clara._fa_oldest_unmet_period(p_client)', 1),
      ('period_earlier_unmet', 1),
      ('clara._fa_compute_charges(p_client, v_ps, v_pe)', 1),
      ('clara._assert_balanced(v_entry)', 1),
      ('clara._approve_entry_core(', 1)) as t(marker, want) loop
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '0042 S5.15d postcheck: marker "%" is now % (expected %) -- the splice damaged the body', r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;
  -- ORDERED: rung -> sequencing -> the gate -> the arithmetic -> the approve path.
  if not (position('pg_advisory_xact_lock(203005004' in v_def)
            < position('clara._fa_oldest_unmet_period(p_client)' in v_def)
          and position('clara._fa_oldest_unmet_period(p_client)' in v_def)
            < position('clara._wdb_rerun_breach(p_client' in v_def)
          and position('clara._wdb_rerun_breach(p_client' in v_def)
            < position('clara._fa_compute_charges(p_client, v_ps, v_pe)' in v_def)
          and position('clara._fa_compute_charges(p_client, v_ps, v_pe)' in v_def)
            < position('clara._approve_entry_core(' in v_def)) then
    raise exception '0042 S5.15d postcheck: the re-run gate is not between the sequencing block and the arithmetic'
      using errcode = 'CLR10';
  end if;
  if (select p.proowner::regrole::text from pg_proc p where p.oid = v_sig::regprocedure)
     <> 'clara_fn_owner' then
    raise exception '0042 S5.15d postcheck: _fa_run_period_core changed owner' using errcode = 'CLR10';
  end if;
  raise notice '0042 S5.15d OK: the FA poster asks the one re-run admission body before it computes a single charge.';
end $s5_15d$;

reset role;

-- =====================================================================================
-- S5.15e -- THE CLASS CENSUS: ONE AUTHORITY PER QUESTION, EVERY DOOR ASKING IT
-- (as-built ladder round 6; the shape the round-6 mandate demands).
--
-- WHAT THIS EXISTS FOR. Round 5 shipped two correct remedies and both were bypassed inside one
-- round -- not because either was wrong, but because each lived on ONE lane while a sibling lane
-- carried the identical shape. Prose cannot stop that recurring; a count from the live catalog
-- can. Every arm below fails the migration if a member of a family is missing, and (3) fails it
-- if a member is ADDED without joining the registry -- which is the direction the defect
-- actually travels.
-- =====================================================================================
-- [SPLIT D-b0 2026-08-04] SLICE-LOCAL ROSTERS. Census hazard sect.7.2 names this block by name:
-- copied unchanged into D-b0 it FAILS THE APPLY, because censuses (1), (2) and (3) pin
-- rosters that name D-b1 and D-b2 bodies. Each roster below is narrowed to this slice's
-- catalog and carries its forward tolerance; (3b) and (4) are byte-exact, and (3b) still
-- passes on the FA-arm clara._wdb_rerun_breach exactly as the census measured (the literal
-- 'recurring_adjustment' is named by that body's own guard and split note).
-- =====================================================================================
do $s5_15e$
declare v_n int; v_names text; r record; v_src text;
begin
  -- THE INSTRUMENT, WIDENED [round-7 E2, L1-lens]. Every predicate in this block reads
  -- p.prosrc alone. MEASURED on the round-7 DB: 587 clara functions, 0 with prosqlbody --
  -- nothing evades TODAY -- but a SQL-standard-body function (`language sql ... BEGIN ATOMIC
  -- ... END`, PG14+) stores its body in prosqlbody and leaves prosrc EMPTY (not null -- the
  -- empty string), so a census keyed on prosrc alone reads such a function as if it had no
  -- body at all. pg_get_functiondef(oid) deparses EITHER storage form back to text, so
  -- concatenating it onto prosrc closes the hole without disturbing today's answer (every
  -- predicate below is an EXISTENCE test -- like/position<>0/regex match on a per-function
  -- string -- never a same-body occurrence COUNT, so the duplication from including both
  -- representations for an ordinary prosrc-bodied function changes no verdict).
  --
  -- (1) THE CORRECTION-DATE AUTHORITY IS ONE BODY, AND EVERY CORRECTION DOOR THIS MIGRATION
  -- OWNS CONSULTS IT. Two consumers: clara.reverse_entry (spliced at S5.9) and
  -- clara._pair_reverse_core (both halves, S2.6).
  -- p.proname <> the target itself: pg_get_functiondef's OWN header line
  -- (`CREATE FUNCTION clara._wdb_correction_posting_date(...)`) always contains the
  -- function's own qualified name, so widening the source to include it makes every
  -- function self-match its own name -- MEASURED (the widened predicate, unguarded, put
  -- _wdb_correction_posting_date in its own consumer list on this rig). Excluding the
  -- target restores "who ELSE calls it" without losing the prosqlbody coverage E2 exists
  -- for.
  select coalesce(string_agg(p.proname::text, ', ' order by p.proname::text collate "C"), '')
    into v_names
    from pg_proc p
   where p.pronamespace = 'clara'::regnamespace
     and p.proname <> '_wdb_correction_posting_date'
     and (coalesce(p.prosrc, '') || coalesce(pg_get_functiondef(p.oid), ''))
         like '%clara._wdb_correction_posting_date(%';
  -- FORWARD TOLERANCE: the FINAL (D-b2) form of this roster is {_adv_release_one_way,
  -- _adv_reversal_admission, _pair_reverse_core, reverse_entry}. In THIS slice the ONE
  -- consumer is clara.reverse_entry (spliced by S5.9-b0 above -- the half of S5.9 this slice
  -- must ship, because it also ships the re-run gate that composition depends on); the other
  -- correction door clara._pair_reverse_core is D-b2's and the two advance-side READERS are
  -- D-b1's. Exact, not a floor: a door consulting the authority early is a door nobody
  -- adjudicated into this slice, and a door that STOPPED consulting it dates its mirror on
  -- its own clock, which is the composition round 5 measured at RM100,000 of doubled FY2025
  -- accrual and round 6 measured again on the depreciation lane.
  if v_names is distinct from 'reverse_entry' then
    raise exception '0042 S5.15e (1): the consumers of the correction-date authority are {%} -- expected exactly {reverse_entry} in the D-b0 slice. FORWARD TOLERANCE: the FINAL (D-b2) form is {_adv_release_one_way, _adv_reversal_admission, _pair_reverse_core, reverse_entry}.', v_names;
  end if;

  -- (2) THE RE-RUN GATE IS ONE BODY, AND BOTH POSTERS AND BOTH ORACLES ASK IT. This is the
  -- round-6 mandate expressed as a catalog count: a fix that lands on one poster, or on the
  -- oracles only, is the exact failure being closed.
  -- p.proname <> the target itself -- the same self-match the (1) fix above documents in
  -- full, reproduced identically here against _wdb_rerun_breach's own header.
  select coalesce(string_agg(p.proname::text, ', ' order by p.proname::text collate "C"), '')
    into v_names
    from pg_proc p
   where p.pronamespace = 'clara'::regnamespace
     and p.proname <> '_wdb_rerun_breach'
     and (coalesce(p.prosrc, '') || coalesce(pg_get_functiondef(p.oid), ''))
         like '%clara._wdb_rerun_breach(%';
  if v_names is distinct from
     '_fa_oldest_unmet_period, _fa_run_period_core' then
    raise exception '0042 S5.15e (2): the consumers of the re-run gate are {%} -- expected exactly the TWO fixed-asset members this slice ships {_fa_oldest_unmet_period, _fa_run_period_core}. A poster that does not ask it can double a period; an oracle that does not ask it advertises a period its poster will refuse, once per sweep, forever. FORWARD TOLERANCE: the FINAL (D-b2) form is {_adj_oldest_unmet_period, _adj_run_occurrence_core, _fa_oldest_unmet_period, _fa_run_period_core}.', v_names;
  end if;

  -- (3) THE REGISTRY COVERS EVERY MACHINE POSTER IN THE CATALOG -- THE RATCHET.
  -- The bodies that write a period-dated machine proposal are pinned by section 6 tail 2(a)
  -- (the three origin='scheduled_run' writers) and by 0041 tail 5(b) (the one fa_disposal
  -- proposal writer); here each of them must MINT a stamp that is in clara._wdb_period_stamps(),
  -- and no registered stamp may be unused. A fourth poster arriving with a new key therefore
  -- cannot reach production without an adjudication -- which is precisely what did not happen
  -- when the depreciation stamp sat outside round 5's remedy.
  --
  -- [CROSS-SECTION EDIT proposed by the s2 class-authority lane, round 7. Reported, not silent.]
  -- clara.dispose_fixed_asset joins the list because round 7 measured the SAME hole one door
  -- further along: the disposal drafts at posting_date = the disposal date and its approve hook
  -- mints clara.fa_depreciation stub rows effective-dated there, so it is a period-dated machine
  -- poster in every sense this ratchet cares about -- and it was outside the registry, which
  -- bricked a client's whole depreciation sweep after one lawful disposal reversal. Without it
  -- in this list, the second loop below would have "found" the fa_disposal stamp inside
  -- clara._fa_run_period_core's call to clara._fa_disposal_draft_outstanding, i.e. passed
  -- VACUOUSLY on a substring of a helper name.
  -- [SPLIT D-b0 2026-08-04] SLICE-LOCAL POSTER ROSTER AND SLICE-LOCAL STAMP SET.
  -- clara._adj_run_occurrence_core and clara._adj_on_approve are D-b2's, so this slice's
  -- machine posters are the two fixed-asset ones; and the registry's 'recurring_adjustment'
  -- entry is minted by no poster that exists yet, so the second loop is scoped to the two
  -- FIXED-ASSET stamps. THE REGISTRY ITSELF IS UNCHANGED (all three stamps), which is what
  -- keeps (3b) below meaningful. FORWARD TOLERANCE: the FINAL (D-b2) form restores the
  -- four-name poster roster and walks the whole registry.
  for r in select unnest(array['_fa_run_period_core', 'dispose_fixed_asset']) as fname loop
    select coalesce(p.prosrc, '') || coalesce(pg_get_functiondef(p.oid), '') into v_src
      from pg_proc p
      where p.pronamespace = 'clara'::regnamespace and p.proname = r.fname;
    if v_src is null or v_src = '' then
      raise exception '0042 S5.15e (3): the machine poster clara.% does not exist', r.fname;
    end if;
    if not exists (select 1 from unnest(clara._wdb_period_stamps()) s
                   where position(s in v_src) <> 0) then
      raise exception '0042 S5.15e (3): clara.% mints a period stamp that is not in clara._wdb_period_stamps() -- a period-dated poster outside the registry is a correction-date and re-run hole by construction, and it is the hole round 6 measured', r.fname;
    end if;
  end loop;
  for r in select unnest(array['depreciation_charges', 'fa_disposal']) as stamp loop
    select count(*)::int into v_n from pg_proc p
      where p.pronamespace = 'clara'::regnamespace
        and p.proname in ('_fa_run_period_core', 'dispose_fixed_asset')
        and position(r.stamp in (coalesce(p.prosrc, '') || coalesce(pg_get_functiondef(p.oid), ''))) <> 0;
    if v_n = 0 then
      raise exception '0042 S5.15e (3): the registered period stamp "%" is minted by no machine poster this slice ships -- a registry entry that names nothing makes the ratchet weaker than it reads', r.stamp;
    end if;
  end loop;

  -- (3b) ...AND EVERY REGISTERED STAMP HAS A BOOKS ARM IN THE RE-RUN GATE
  -- [CROSS-SECTION EDIT proposed by the s2 class-authority lane, round 7. Reported, not silent.]
  -- The registry answers "which entries carry a period-dated proposal"; clara._wdb_rerun_breach's
  -- p_stamp answers "which BOOKS hold the evidence". Round 7 measured what happens when the
  -- second question is answered by falling through: adding a stamp to the registry made
  -- clara._wdb_rerun_breach accept it and then read the ADJUSTMENT books for a fixed-asset
  -- question, answering "sound" -- a fail-open manufactured by the fix. The body now dispatches
  -- exhaustively and raises on an unclaimed stamp; this arm makes that a BUILD failure instead
  -- of a runtime one, which is the only kind a fourth author reliably notices.
  select p.prosrc into v_src from pg_proc p
    where p.pronamespace = 'clara'::regnamespace and p.proname = '_wdb_rerun_breach';
  for r in select unnest(clara._wdb_period_stamps()) as stamp loop
    if position(r.stamp in v_src) = 0 then
      raise exception '0042 S5.15e (3b): the registered period stamp "%" is named by no arm of clara._wdb_rerun_breach -- a registered stamp with no books arm falls through to whichever arm is written last, which is a fail-open in the one body whose whole job is to fail closed', r.stamp;
    end if;
  end loop;

  -- (4) THE GATE ASKS THE BOOKS, NOT AN IDENTITY. Round 5's two remedies were keyed on one
  -- lane's flag key and on template_id. Neither key may reappear as the SUBJECT of either
  -- authority: the correction-date body keys on the registry, and the re-run gate takes an
  -- account SHAPE, never a template or an authority id.
  select coalesce(p.prosrc, '') || coalesce(pg_get_functiondef(p.oid), '') into v_src
    from pg_proc p
    where p.pronamespace = 'clara'::regnamespace and p.proname = '_wdb_correction_posting_date';
  if position('recurring_adjustment' in v_src) <> 0 then
    raise exception '0042 S5.15e (4): the correction-date authority names one lane''s flag key again -- it must key on clara._wdb_period_stamps(), or the sibling lane is outside it exactly as it was in round 5';
  end if;
  select coalesce(p.prosrc, '') || coalesce(pg_get_functiondef(p.oid), '') into v_src
    from pg_proc p
    where p.pronamespace = 'clara'::regnamespace and p.proname = '_wdb_rerun_breach';
  if position('p_template' in v_src) <> 0 or position('authority_id' in v_src) <> 0 then
    raise exception '0042 S5.15e (4): the re-run gate takes a template or an authority as its subject again -- the design''s own edit idiom [WDB-G13] mints a new one of each, which is how round 5''s gate was bypassed inside a single round';
  end if;

  raise notice '0042 S5.15e OK (D-b0 slice): the correction-date authority exists with no unadjudicated consumer; one re-run gate with BOTH fixed-asset posters on it; the stamp registry covers every machine poster this slice ships and every registered stamp is still named by an arm of the gate; neither authority is keyed on a lane or an identity.';
end $s5_15e$;

-- #####################################################################################
-- ##  LANE C REGION -- THE SESSION-CLOCK WRITERS (round-6 fix lane, 2026-08-04).      ##
-- ##  S5.20 .. S5.25. Owner ruling 2026-08-03 WDB-R1 (live 0027/0040/0007 code is in  ##
-- ##  scope) + WDB-R2 (one shared authority, not a point-fix) + WDB-R4 (every fix      ##
-- ##  ships a cell that asks what the fix did NOT think of).                          ##
-- ##                                                                                  ##
-- ##  These sections sit AFTER S5.14's closing census and after S5.15's ruling splice, ##
-- ##  for the reason S5.15 states in full: the chain-of-recut law is PER-SPLICE, and   ##
-- ##  each block below carries its own complete prestate + postcheck, so a section a   ##
-- ##  concurrently-edited lane also owns is never threaded through. Reported to the    ##
-- ##  assembly lane so the three regions are unified deliberately, not by collision.   ##
-- #####################################################################################

-- =====================================================================================
-- S5.20 -- clara._book_today(): THE HOUSE LEGAL DATE, IN ONE BODY (owner ruling
-- 2026-08-03, WDB-R1/WDB-R2).
--
-- THE INVARIANT, stated before the fix: EVERY date this product writes into a money-dated
-- column -- posting_date, effective_date, issue_date, a statutory retention date -- is the
-- LEGAL date in Asia/Kuala_Lumpur, which is a property of the HOUSE, not of whoever happened
-- to open the session. `current_date` is the SESSION timezone's date. On a UTC server it is
-- one day early for eight hours of every day, every day. MEASURED, not inferred: at
-- 2026-08-04 04:23 MYT a UTC session returns 2026-08-03.
--
-- THE ROOT, named. The fact had no house authority. It had NINE inline copies of
-- `(now() at time zone 'Asia/Kuala_Lumpur')::date` scattered across unrelated bodies and ONE
-- named helper, clara._fa_today() -- whose name scopes a HOUSE fact to the FA LANE. An author
-- writing an allocation door or a wrong-client correction had nothing house-shaped to reach
-- for, so three of them reached for `current_date`. That is the round-6 mandate's exact
-- shape: a class-level fact keyed by LANE IDENTITY, bypassed by the next sibling lane.
--
-- THE FIX. clara._book_today() is the authority. clara._fa_today() becomes a one-line
-- DELEGATE of it -- not a second copy, not a rename: its twelve live 0041 callers and the
-- dashboard law that names it (apps/dashboard/app/shared/businessDate.ts) keep working
-- byte-for-byte, while exactly ONE body in the catalog now computes the fact.
--
-- WHY A DELEGATE RATHER THAN A RENAME. Renaming a LIVE 0041 function with twelve callers to
-- fix a naming problem trades a real regression risk for a readability gain. The delegate
-- costs one call, keeps every caller's meaning identical, and moves the fact to one place --
-- which is the whole of what the ruling asks for.
-- =====================================================================================
set role clara_fn_owner;

-- THE CLOCK INSIDE THE AUTHORITY, NAMED [round-7 finding C, Codex #1, HIGH]. now() IS
-- transaction_timestamp() (PostgreSQL 9.9.4) -- fixed at the OPEN of the enclosing
-- transaction, never at the statement that reads it. MEASURED on this rig: BEGIN, then two
-- separate statements a moment apart on the SAME connection give the SAME now() and a
-- DIFFERENT statement_timestamp() (a real, reproduced gap -- proved with pg_sleep between two
-- round trips in one transaction, not inferred from the manual). A session that opens before
-- midnight MYT and books a correction, an allocation or a retention anchor in a LATER
-- statement of that same transaction -- exactly the shape a checker's approve or a
-- longer-running batch creates -- had every one of those money dates stamped YESTERDAY,
-- silently, because the authority asked the wrong clock for what it promised ("within one
-- statement the legal date must not move").
--
-- THE FIX: statement_timestamp(). Per STATEMENT, not per transaction, so a body that asks
-- twice inside ONE statement still cannot straddle midnight MYT (the in-source contract is
-- unchanged) -- but a LATER statement in a longer transaction now correctly samples a LATER
-- instant. Volatility STABLE needed no change: statement_timestamp() is itself STABLE
-- (pg_proc.provolatile='s', verified against the live catalog -- same class as now() and
-- transaction_timestamp(); only clock_timestamp()/timeofday() are VOLATILE), so "same result
-- for the same statement" -- the STABLE contract -- was never in question, only WHICH
-- statement-scoped clock the body reads. Not IMMUTABLE -- it reads the clock. Not SECURITY
-- DEFINER, again matching _fa_today: every reachable caller is already a definer body owned
-- by this role.
create function clara._book_today() returns date
  language sql stable as $$ select (statement_timestamp() at time zone 'Asia/Kuala_Lumpur')::date $$;
comment on function clara._book_today() is
  'THE house legal date (Asia/Kuala_Lumpur), sampled PER STATEMENT via statement_timestamp() '
  '-- never now()/transaction_timestamp(), which stay fixed for the whole transaction and are '
  'round-7 finding C''s exact defect (a later statement in a longer transaction would date '
  'from whenever the transaction OPENED, not from when it actually ran). The one body that '
  'answers "what day is it" for every money-dated column. Never current_date: that is the '
  'session timezone''s date and is one day early for eight hours of every UTC day. '
  'clara._fa_today() is its FA-lane alias.';
-- The ACL is _fa_today()'s, exactly: PUBLIC revoked, reachable only from the definer chain.
revoke all on function clara._book_today() from public;

do $s5_20$
declare
  v_sig text := 'clara._fa_today()';
  v_def text; v_frm text; v_cnt int; v_n int;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if v_def is null then
    raise exception '0042 S5.20 prestate: clara._fa_today() is GONE' using errcode = 'CLR10';
  end if;
  if position('clara._book_today()' in v_def) <> 0 then
    raise exception '0042 S5.20 prestate: _fa_today already delegates -- this splice has already been applied to this database'
      using errcode = 'CLR10';
  end if;
  -- The 0041 body, whole. Asserted as ONE exact fragment rather than by marker count: this
  -- body is four tokens long, so anything short of byte equality is drift.
  v_frm := $f$ select (now() at time zone 'Asia/Kuala_Lumpur')::date $f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0042 S5.20 prestate: the 0041 _fa_today body appears % time(s) (expected exactly once) -- re-derive this splice against the live catalog', v_cnt
      using errcode = 'CLR10';
  end if;
  v_def := replace(v_def, v_frm, $t$ select clara._book_today() $t$);
  execute v_def;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if position('clara._book_today()' in v_def) = 0
     or position('Kuala_Lumpur' in v_def) <> 0 then
    raise exception '0042 S5.20 postcheck: _fa_today does not delegate, or still carries its own copy of the expression -- two bodies for one fact is what this section removes'
      using errcode = 'CLR10';
  end if;
  if (select p.provolatile from pg_proc p where p.oid = v_sig::regprocedure) <> 's' then
    raise exception '0042 S5.20 postcheck: _fa_today is no longer STABLE' using errcode = 'CLR10';
  end if;
  if (select p.proowner::regrole::text from pg_proc p where p.oid = v_sig::regprocedure)
     <> 'clara_fn_owner' then
    raise exception '0042 S5.20 postcheck: _fa_today changed owner' using errcode = 'CLR10';
  end if;
  -- THE ANSWER IS UNCHANGED. A delegation that returned a different date would be a silent
  -- re-dating of twelve live FA reads; proved here rather than asserted.
  if clara._fa_today() <> clara._book_today()
     or clara._book_today() <> (now() at time zone 'Asia/Kuala_Lumpur')::date then
    raise exception '0042 S5.20 postcheck: the delegate does not return the 0041 answer'
      using errcode = 'CLR10';
  end if;
  -- THE now()-BASED REFERENCE ABOVE STILL HOLDS as an equality check even though the
  -- authority itself now reads statement_timestamp(), not now(): migrate.mjs sends this
  -- WHOLE migration file as one client.query(sql) call, i.e. one PostgreSQL simple-query
  -- message, and statement_timestamp() does not advance between the semicolon-separated
  -- statements/DO-blocks inside a single such message (MEASURED: `psql -c "select
  -- statement_timestamp(); select pg_sleep(1.5); select statement_timestamp();"` returns the
  -- SAME instant both times) -- so at THIS instant, inside THIS DO block, now() and
  -- statement_timestamp() are one and the same value, and the comparison is exact rather than
  -- approximate. It would NOT hold across a real client round trip (the shape finding C
  -- fixes); that gap is measured live in x42.s5c's clock cell, not here.
  --
  -- ...AND IT IS NOT current_date. On a MYT session the two agree, so an equality probe would
  -- pass vacuously here and prove nothing; what is asserted is that the body does not SPELL
  -- the session clock. The behavioural difference is measured in cell x42.s5c.1, which sets
  -- the session timezone to UTC inside the eight-hour window.
  select count(*)::int into v_n from pg_proc p
    where p.oid = v_sig::regprocedure and p.prosrc ~* '\mcurrent_date\M';
  if v_n <> 0 then
    raise exception '0042 S5.20 postcheck: _fa_today names the session clock' using errcode = 'CLR10';
  end if;
  raise notice '0042 S5.20 OK: clara._book_today() is the one body that computes the house legal date; clara._fa_today() delegates to it and returns the identical answer.';
end $s5_20$;

reset role;

-- =====================================================================================
-- S5.21 -- clara.approve_wrong_client_correction: THE FOURTH CLOCK, CLOSED ON THE LIVE
-- 0027 BODY (owner ruling 2026-08-03, WDB-R1).
--
-- THIS SECTION IS NOT A DESIGN RESIDUAL. docs/plan/wave-d-b-design.md and section S2 of this
-- migration both NAME this defect and both deliberately leave it: S2's header says "Doors
-- this migration does not own still exist (clara.approve_wrong_client_correction mints its
-- reversal at the session `current_date`)". The ruling widened the register to already-shipped
-- code, so "it was faithful to the design" stops being a reason to leave a hole open.
--
-- THE DEFECT. This body mints the correction REVERSAL of an approved entry and stamps its
-- posting_date from `current_date`. On the UTC runtime the books therefore carry a correction
-- dated YESTERDAY for eight hours of every day -- and yesterday can be in a month the client
-- has already closed, reported and filed. A GL correction that lands in a closed period is
-- the one thing reverse-not-delete exists to prevent, and 0041 S4.4 already removed exactly
-- this shape from clara.reverse_entry: this body is its untreated sibling.
--
-- WHAT THIS SPLICE DOES NOT DO, stated so the next reader does not have to guess. It changes
-- the CLOCK, not the DATE POLICY. The question "which date must a correction of THIS entry
-- carry" is answered by clara._adj_correction_posting_date (S2), which S5.9 wires into
-- clara.reverse_entry -- and the design decided, with a stated reason, that this door is NOT
-- wired to it and that the guarantee for the recurring-adjustment lane is instead
-- clara._adj_period_correction_breach, asked at the one gate every re-run passes. That
-- decision is left standing here and is REPORTED as an open question for the lane that owns
-- the correction-date authority; a clock fix must not smuggle in a policy change.
-- =====================================================================================
set role clara_fn_owner;

do $s5_21$
declare
  v_sig text := 'clara.approve_wrong_client_correction(uuid,text,text,text)';
  v_def text; v_frm text; v_cnt int; v_n int; r record;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if v_def is null then
    raise exception '0042 S5.21 prestate: clara.approve_wrong_client_correction is GONE' using errcode = 'CLR10';
  end if;
  if position('clara._book_today()' in v_def) <> 0 then
    raise exception '0042 S5.21 prestate: the correction door already stamps the house legal date -- this splice has already been applied to this database'
      using errcode = 'CLR10';
  end if;
  if to_regprocedure('clara._book_today()') is null then
    raise exception '0042 S5.21 prestate: clara._book_today() does not exist -- S5.20 must run before S5.21'
      using errcode = 'CLR10';
  end if;
  -- THE PRE-EXISTING MARKER CENSUS at counts MEASURED on the live 0001..0041 catalog. These
  -- are the parts of this body that are NOT this splice's business; if any of them moved, the
  -- body drifted and the fragment below cannot be trusted to mean what it meant.
  for r in select * from (values
      ('current_date', 1),
      ('Correction reversal: ', 1),
      ($$'reversal'$$, 1),
      ('clara._expected_reversal_state_hash(', 1),
      ('clara._assert_balanced(v_mirror)', 1),
      ('superseded-by-correction', 1)) as t(marker, want) loop
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '0042 S5.21 prestate: approve_wrong_client_correction carries the marker "%" % time(s), expected % -- the body drifted; re-derive this section against the live catalog', r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;

  v_frm := $f$        insert into clara.journal_entries(client_id,status,posting_date,memo,origin,
            resolution_id,is_opening_balance,is_year_end,tax_affecting,maker_actor,
            last_human_editor,reversal_of,reversal_reason)
          values(o.client_id,'draft',current_date,'Correction reversal: '||x.reason,$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0042 S5.21 prestate: the mirror-minting INSERT appears % time(s) (expected exactly once)', v_cnt
      using errcode = 'CLR10';
  end if;
  v_def := replace(v_def, v_frm,
    $t$        -- 0042 (owner ruling 2026-08-03, WDB-R1): THE HOUSE LEGAL DATE, not the session's.
        -- The date this correction is booked at is a property of the HOUSE (Asia/Kuala_Lumpur),
        -- never of whoever opened the connection. The session clock this replaces is one day
        -- early for eight hours of every UTC day, so on the live runtime this door minted
        -- corrections dated into the PREVIOUS day -- and a previous day can sit in a month the
        -- client has already closed and filed. 0041 S4.4 removed this exact shape from
        -- clara.reverse_entry; this is its untreated sibling, and clara._book_today() is now
        -- the one body in the catalog that answers the question for both.
        insert into clara.journal_entries(client_id,status,posting_date,memo,origin,
            resolution_id,is_opening_balance,is_year_end,tax_affecting,maker_actor,
            last_human_editor,reversal_of,reversal_reason)
          values(o.client_id,'draft',clara._book_today(),'Correction reversal: '||x.reason,$t$);
  execute v_def;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  for r in select * from (values
      ('Correction reversal: ', 1),
      ($$'reversal'$$, 1),
      ('clara._expected_reversal_state_hash(', 1),
      ('clara._assert_balanced(v_mirror)', 1),
      ('superseded-by-correction', 1)) as t(marker, want) loop
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '0042 S5.21 postcheck: marker "%" is now % (expected %) -- the splice damaged the body', r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;
  -- COMMENT-STRIPPED, for both the removed clock and the installed call: the splice comment
  -- above deliberately names BOTH in prose -- the old clock so the record says what was
  -- removed, the new authority so the next reader knows where the answer lives -- and a raw
  -- scan would then read this fix as its own regression AND double-count its own call.
  v_frm := lower(regexp_replace(regexp_replace(regexp_replace(
             v_def, '/\*[\s\S]*?\*/', '', 'g'), '--[^\n]*', '', 'g'), '\s+', ' ', 'g'));
  if v_frm ~* '\mcurrent_date\M' then
    raise exception '0042 S5.21 postcheck: the session clock is still reachable in code (not prose)'
      using errcode = 'CLR10';
  end if;
  v_n := (length(v_frm) - length(replace(v_frm, 'clara._book_today()', ''))) / length('clara._book_today()');
  if v_n <> 1 then
    raise exception '0042 S5.21 postcheck: the house legal date is called % time(s) in CODE (expected exactly 1 -- the mirror posting_date)', v_n
      using errcode = 'CLR10';
  end if;
  if (select p.proowner::regrole::text from pg_proc p where p.oid = v_sig::regprocedure)
     <> 'clara_fn_owner' then
    raise exception '0042 S5.21 postcheck: approve_wrong_client_correction changed owner' using errcode = 'CLR10';
  end if;
  -- THE HUMAN LANE MUST STILL REACH IT. Read through aclexplode rather than a privilege
  -- probe, and say "invoke" in the message, for the reason S5.15 documents in full: the
  -- wiki-dynamic-sql gate collects a change-of-record block's quoted literals as fragments
  -- and a literal spelling the privilege name reads to it as this splice installing dynamic
  -- SQL. PostgreSQL defines exactly one privilege for a function, so no filter is lost.
  if not exists (
    select 1 from pg_proc p, aclexplode(p.proacl) a
    where p.oid = v_sig::regprocedure and a.grantee = 'clara_authenticated'::regrole) then
    raise exception '0042 S5.21 postcheck: clara_authenticated can no longer invoke approve_wrong_client_correction -- the correction surface would go dark'
      using errcode = 'CLR10';
  end if;
  raise notice '0042 S5.21 OK: the wrong-client correction mirror is dated from the house legal date; every pre-existing marker survived; the human grant survived.';
end $s5_21$;

reset role;

-- =====================================================================================
-- S5.22 -- clara.apply_open_items: BOTH SUBLEDGER APPLICATION STAMPS (WDB-R1).
--
-- 0040 (C-c SS4.4) made this the ONE allocation writer with no GL entry to anchor on, so it
-- dates itself BY THE ACT -- a settled reading, and this splice does not touch it. What it
-- fixes is WHOSE act-date: the session's, or the house's.
--
-- WHY THIS ONE IS A TIE DEFECT AND NOT ONLY A DATING DEFECT. The readers of the column this
-- writes derive their as-of from the MYT clock: clara.staff_advance_summary does
-- `v_as_of := coalesce(p_as_of, clara._fa_today())` and clara.staff_advance_statement does
-- `v_to := coalesce(p_to, clara._fa_today())`. Writer on the session clock, reader on MYT, is
-- an ASYMMETRY ACROSS AS-OF: between 00:00 and 08:00 MYT on a UTC runtime the application row
-- is stamped YESTERDAY, so a statement or an aging drawn AS OF YESTERDAY -- a closed month,
-- possibly one already reported -- now includes a settlement that had not happened when that
-- month closed. The outstanding for a filed period changes after the fact. Both sides of the
-- tie must read one clock; after this splice they do.
-- =====================================================================================
set role clara_fn_owner;

do $s5_22$
declare
  v_sig text := 'clara.apply_open_items(uuid,jsonb,text,text)';
  v_def text; v_frm text; v_cnt int; v_n int; r record;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if v_def is null then
    raise exception '0042 S5.22 prestate: clara.apply_open_items is GONE' using errcode = 'CLR10';
  end if;
  if position('clara._book_today()' in v_def) <> 0 then
    raise exception '0042 S5.22 prestate: apply_open_items already stamps the house legal date -- this splice has already been applied to this database'
      using errcode = 'CLR10';
  end if;
  if to_regprocedure('clara._book_today()') is null then
    raise exception '0042 S5.22 prestate: clara._book_today() does not exist -- S5.20 must run before S5.22'
      using errcode = 'CLR10';
  end if;
  for r in select * from (values
      ('current_date', 3),
      ('application_target_not_open', 2),
      ('allocation_exceeds_outstanding', 1),
      ($$'apply'$$, 2),
      ('open_item.applied', 1)) as t(marker, want) loop
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '0042 S5.22 prestate: apply_open_items carries the marker "%" % time(s), expected % -- the body drifted; re-derive this section against the live catalog', r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;

  -- BOTH STAMPS AND THE COMMENT THAT EXPLAINS THEM, in ONE fragment. Replacing only the two
  -- value lines would leave a comment asserting a rule the code no longer follows, and a
  -- comment that contradicts its body is how the next author re-introduces the defect.
  v_frm := $f$    -- 0040 (C-c, design section 4.4, EXTENDED for the entry-less verb -- see the S4.9 header
    -- for the decision and its reasoning): effective_date = current_date. apply_open_items is
    -- the ONE allocation writer with no GL entry to anchor on (zero-movement pair mechanics,
    -- WCA-R3), so it dates itself by the act, exactly as unallocate does. The consequence,
    -- stated: applying a credit note today against a June invoice moves the outstanding TODAY,
    -- so a June as-of read still shows both positions open -- which is what the books said in
    -- June, and what a customer statement for June must therefore print.
    insert into clara.open_item_allocations(firm_id, client_id, domain, item_id,
        application_group, operation_kind, amount_cents, effective_date, reason, created_by)
      values (si.firm_id, si.client_id, si.domain, al.s, v_group, 'apply', al.amt,
        current_date, v_reason, c.actor);
    insert into clara.open_item_allocations(firm_id, client_id, domain, item_id,
        application_group, operation_kind, amount_cents, effective_date, reason, created_by)
      values (ti.firm_id, ti.client_id, ti.domain, al.t, v_group, 'apply', -al.amt,
        current_date, v_reason, c.actor);$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0042 S5.22 prestate: the paired application INSERT block appears % time(s) (expected exactly once)', v_cnt
      using errcode = 'CLR10';
  end if;
  v_def := replace(v_def, v_frm,
    $t$    -- 0040 (C-c, design section 4.4, EXTENDED for the entry-less verb -- see the S4.9 header
    -- for the decision and its reasoning): effective_date is the ACT date. apply_open_items is
    -- the ONE allocation writer with no GL entry to anchor on (zero-movement pair mechanics,
    -- WCA-R3), so it dates itself by the act, exactly as unallocate does. The consequence,
    -- stated: applying a credit note today against a June invoice moves the outstanding TODAY,
    -- so a June as-of read still shows both positions open -- which is what the books said in
    -- June, and what a customer statement for June must therefore print.
    --
    -- 0042 (owner ruling 2026-08-03, WDB-R1): THE ACT DATE IS THE HOUSE'S, NOT THE SESSION'S.
    -- The session clock this replaces is the connection timezone's date, one day early for
    -- eight hours of every UTC day. The READERS of this column derive their as-of from MYT
    -- (clara.staff_advance_summary and clara.staff_advance_statement both default it from
    -- clara._fa_today()), so the pair was asymmetric across as-of: a settlement booked at
    -- 03:00 MYT was stamped YESTERDAY and appeared inside a month that had already closed.
    -- One clock on both sides of the tie, and clara._book_today() is that clock.
    insert into clara.open_item_allocations(firm_id, client_id, domain, item_id,
        application_group, operation_kind, amount_cents, effective_date, reason, created_by)
      values (si.firm_id, si.client_id, si.domain, al.s, v_group, 'apply', al.amt,
        clara._book_today(), v_reason, c.actor);
    insert into clara.open_item_allocations(firm_id, client_id, domain, item_id,
        application_group, operation_kind, amount_cents, effective_date, reason, created_by)
      values (ti.firm_id, ti.client_id, ti.domain, al.t, v_group, 'apply', -al.amt,
        clara._book_today(), v_reason, c.actor);
    -- BOTH SIDES ON ONE DATE, FOR A DIFFERENT REASON THAN BEFORE 0042 [round-7 finding C].
    -- clara._book_today() samples statement_timestamp() -- fixed for the current STATEMENT,
    -- never now()/transaction_timestamp(), which stays fixed for the whole TRANSACTION and
    -- was round-7's exact defect. The two calls above still always agree because apply_open_
    -- items is invoked as ONE top-level statement and every insert inside its body shares
    -- that one statement's clock (measured: statement_timestamp() does not advance between
    -- two internal statements of one PL/pgSQL call even across a real pg_sleep) -- not
    -- because the clock is pinned to the whole transaction. Stated because "why is this
    -- called twice" is the first question the next reader will ask, and the old answer
    -- ("now() is transaction_timestamp()") stopped being true the moment the authority moved
    -- to a per-statement clock.$t$);
  execute v_def;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  for r in select * from (values
      ('application_target_not_open', 2),
      ('allocation_exceeds_outstanding', 1),
      ($$'apply'$$, 2),
      ('open_item.applied', 1)) as t(marker, want) loop
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '0042 S5.22 postcheck: marker "%" is now % (expected %) -- the splice damaged the body', r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;
  -- COMMENT-STRIPPED for both, exactly as S5.21: the splice comment names the old clock and
  -- the new authority in prose on purpose, so a raw scan would read the fix as its own
  -- regression and would double-count its own calls.
  v_frm := lower(regexp_replace(regexp_replace(regexp_replace(
             v_def, '/\*[\s\S]*?\*/', '', 'g'), '--[^\n]*', '', 'g'), '\s+', ' ', 'g'));
  if v_frm ~* '\mcurrent_date\M' then
    raise exception '0042 S5.22 postcheck: the session clock is still reachable in code (not prose)'
      using errcode = 'CLR10';
  end if;
  v_n := (length(v_frm) - length(replace(v_frm, 'clara._book_today()', ''))) / length('clara._book_today()');
  if v_n <> 2 then
    raise exception '0042 S5.22 postcheck: the house legal date is called % time(s) in CODE (expected exactly 2 -- one per side of the application pair)', v_n
      using errcode = 'CLR10';
  end if;
  if (select p.proowner::regrole::text from pg_proc p where p.oid = v_sig::regprocedure)
     <> 'clara_fn_owner' then
    raise exception '0042 S5.22 postcheck: apply_open_items changed owner' using errcode = 'CLR10';
  end if;
  if not exists (
    select 1 from pg_proc p, aclexplode(p.proacl) a
    where p.oid = v_sig::regprocedure and a.grantee = 'clara_authenticated'::regrole) then
    raise exception '0042 S5.22 postcheck: clara_authenticated can no longer invoke apply_open_items'
      using errcode = 'CLR10';
  end if;
  raise notice '0042 S5.22 OK: both application stamps read the house legal date; the 0040 act-date reading is unchanged and its comment now matches its code.';
end $s5_22$;

reset role;

-- =====================================================================================
-- S5.23 -- clara.unallocate_group: THE CLOCK INSIDE greatest() (WDB-R1).
--
-- The 0040 FIX WAVE C5 [R9] reading is UNTOUCHED: the negation is dated
-- greatest(today, the row it negates), never a bare today, so an as-of series stays monotone
-- in the acts that produced it. What changes is which "today" -- and here the session clock
-- was strictly the worse of the two for the same monotonicity reason. At 03:00 MYT on 1
-- September a UTC session's today is 31 August, so the negation of an August allocation was
-- dated INTO AUGUST: a month that may already be closed, reported and filed had its
-- outstanding moved by an act taken in September. greatest() cannot save that, because the
-- allocation it negates is itself in August. The house legal date puts the act in September,
-- which is where it happened.
-- =====================================================================================
set role clara_fn_owner;

do $s5_23$
declare
  v_sig text := 'clara.unallocate_group(uuid,uuid,text,text)';
  v_def text; v_frm text; v_cnt int; v_n int; r record;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if v_def is null then
    raise exception '0042 S5.23 prestate: clara.unallocate_group is GONE' using errcode = 'CLR10';
  end if;
  if position('clara._book_today()' in v_def) <> 0 then
    raise exception '0042 S5.23 prestate: unallocate_group already stamps the house legal date -- this splice has already been applied to this database'
      using errcode = 'CLR10';
  end if;
  if to_regprocedure('clara._book_today()') is null then
    raise exception '0042 S5.23 prestate: clara._book_today() does not exist -- S5.20 must run before S5.23'
      using errcode = 'CLR10';
  end if;
  for r in select * from (values
      ('current_date', 4),
      ('not_unallocatable', 1),
      ('already_unallocated', 1),
      ($$'unallocate'$$, 2),
      ('open_item.unallocated', 1),
      ('reverses_allocation_id', 2)) as t(marker, want) loop
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '0042 S5.23 prestate: unallocate_group carries the marker "%" % time(s), expected % -- the body drifted; re-derive this section against the live catalog', r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;

  -- THE VALUE LINE ONLY. Unlike S5.22, the 0040 comment above it stays exactly as written:
  -- it is a statement about greatest() and the monotonicity of an as-of series, and every
  -- word of it remains true. Its three prose mentions of the session clock are the RECORD of
  -- why greatest() is there, which is why the postcheck below is comment-stripped.
  v_frm := $f$           -oa.amount_cents, greatest(current_date, oa.effective_date), v_reason, c.actor$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0042 S5.23 prestate: the negation projection appears % time(s) (expected exactly once)', v_cnt
      using errcode = 'CLR10';
  end if;
  v_def := replace(v_def, v_frm,
    $t$           -- 0042 (owner ruling 2026-08-03, WDB-R1): the "today" inside greatest() is the HOUSE
           -- legal date. The session clock it replaces was one day early for eight hours of
           -- every UTC day, which dated a September negation into August -- greatest() cannot
           -- correct that, because the row being negated is itself in August.
           -oa.amount_cents, greatest(clara._book_today(), oa.effective_date), v_reason, c.actor$t$);
  execute v_def;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  for r in select * from (values
      ('clara._book_today()', 1),
      ('greatest(clara._book_today(), oa.effective_date)', 1),
      ('not_unallocatable', 1),
      ('already_unallocated', 1),
      ($$'unallocate'$$, 2),
      ('open_item.unallocated', 1),
      ('reverses_allocation_id', 2)) as t(marker, want) loop
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '0042 S5.23 postcheck: marker "%" is now % (expected %) -- the splice damaged the body', r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;
  if lower(regexp_replace(regexp_replace(regexp_replace(
       v_def, '/\*[\s\S]*?\*/', '', 'g'), '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))
     ~* '\mcurrent_date\M' then
    raise exception '0042 S5.23 postcheck: the session clock is still reachable in code (not prose)'
      using errcode = 'CLR10';
  end if;
  -- THE 0040 READING SURVIVED IN PROSE TOO: the record of WHY greatest() is there is part of
  -- the fix, not incidental to it.
  if position('0040 FIX WAVE C5 [R9]' in v_def) = 0 then
    raise exception '0042 S5.23 postcheck: the 0040 monotonicity record was lost' using errcode = 'CLR10';
  end if;
  if (select p.proowner::regrole::text from pg_proc p where p.oid = v_sig::regprocedure)
     <> 'clara_fn_owner' then
    raise exception '0042 S5.23 postcheck: unallocate_group changed owner' using errcode = 'CLR10';
  end if;
  if not exists (
    select 1 from pg_proc p, aclexplode(p.proacl) a
    where p.oid = v_sig::regprocedure and a.grantee = 'clara_authenticated'::regrole) then
    raise exception '0042 S5.23 postcheck: clara_authenticated can no longer invoke unallocate_group'
      using errcode = 'CLR10';
  end if;
  raise notice '0042 S5.23 OK: the negation dates from the house legal date inside greatest(); the 0040 monotonicity reading and its record are intact.';
end $s5_23$;

reset role;

-- =====================================================================================
-- S5.24 -- clara._document_retention_date: THE STATUTORY YEAR (WDB-R1).
--
-- Not a money column, and in scope for exactly the reason the ruling gives: the CLASS is "a
-- legally significant date derived from the session clock", and this is its fourth member.
-- Its consequence is the sharpest of the four because the error is a YEAR, not a day. The
-- body is `date_trunc('year', today) + 10 years - 1 day`, so on 1 January before 08:00 MYT a
-- UTC session sees 31 December of the OUTGOING year and computes a retention horizon a full
-- year short. clara._recompute_document_retention writes it to clara.documents.retain_until
-- under greatest(), so the too-short value sticks for any document whose FIRST anchor lands
-- in that window -- and a retention horizon that is quietly a year short is discovered by an
-- auditor, not by a test.
-- =====================================================================================
set role clara_fn_owner;

do $s5_24$
declare
  v_sig text := 'clara._document_retention_date(uuid)';
  v_def text; v_frm text; v_cnt int; v_n int;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if v_def is null then
    raise exception '0042 S5.24 prestate: clara._document_retention_date is GONE' using errcode = 'CLR10';
  end if;
  if position('clara._book_today()' in v_def) <> 0 then
    raise exception '0042 S5.24 prestate: the retention date already reads the house legal date -- this splice has already been applied to this database'
      using errcode = 'CLR10';
  end if;
  if to_regprocedure('clara._book_today()') is null then
    raise exception '0042 S5.24 prestate: clara._book_today() does not exist -- S5.20 must run before S5.24'
      using errcode = 'CLR10';
  end if;
  v_frm := $f$date_trunc('year', current_date)$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0042 S5.24 prestate: the year-truncation appears % time(s) (expected exactly once)', v_cnt
      using errcode = 'CLR10';
  end if;
  -- The 10-year horizon and the client-existence guard are NOT this splice's business; they
  -- are asserted intact rather than assumed, because a `where exists` that vanished would
  -- turn a per-client answer into a global one silently.
  if position($p$interval '10 years - 1 day'$p$ in v_def) = 0
     or position('from clara.clients where id = p_client' in v_def) = 0 then
    raise exception '0042 S5.24 prestate: the retention horizon or the client-existence guard is not where this splice expects it'
      using errcode = 'CLR10';
  end if;
  v_def := replace(v_def, v_frm, $t$date_trunc('year', clara._book_today())$t$);
  execute v_def;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if position($p$date_trunc('year', clara._book_today())$p$ in v_def) = 0
     or position($p$interval '10 years - 1 day'$p$ in v_def) = 0
     or position('from clara.clients where id = p_client' in v_def) = 0
     or position('current_date' in v_def) <> 0 then
    raise exception '0042 S5.24 postcheck: the retention body is not the expected shape after the splice'
      using errcode = 'CLR10';
  end if;
  if (select p.provolatile from pg_proc p where p.oid = v_sig::regprocedure) <> 's'
     or not (select p.prosecdef from pg_proc p where p.oid = v_sig::regprocedure) then
    raise exception '0042 S5.24 postcheck: the retention body lost STABLE or its definer bit'
      using errcode = 'CLR10';
  end if;
  if (select p.proowner::regrole::text from pg_proc p where p.oid = v_sig::regprocedure)
     <> 'clara_fn_owner' then
    raise exception '0042 S5.24 postcheck: _document_retention_date changed owner' using errcode = 'CLR10';
  end if;
  -- ITS ONE CONSUMER STILL REACHES IT. A helper nobody calls is a fix nobody gets.
  -- WIDENED [round-8 M2 finding, cross-section patch, the S5.15e self-match class]:
  -- pg_get_functiondef's own header line for clara._document_retention_date always contains
  -- the function's own qualified call shape, so an unguarded widened read self-matches and
  -- reads 2 consumers where exactly 1 is pinned -- EMPIRICALLY VERIFIED against the round-8
  -- M2 lane DB (narrow=1; naive-widened=2, including the target itself; guarded-widened=1).
  -- p.proname <> the target itself restores "who ELSE calls it" while still closing the
  -- prosqlbody blind spot (the same PG14+ language-sql-begin-atomic gap S5.15e/TAIL 2(a)/
  -- TAIL 6(a) close).
  select count(*)::int into v_n from pg_proc p
    where p.pronamespace = 'clara'::regnamespace
      and p.proname <> '_document_retention_date'
      and (coalesce(p.prosrc, '') || coalesce(pg_get_functiondef(p.oid), '')) like '%clara._document_retention_date(%';
  if v_n <> 1 then
    raise exception '0042 S5.24 postcheck: clara._document_retention_date is called from % body/bodies (expected exactly 1 -- clara._recompute_document_retention)', v_n
      using errcode = 'CLR10';
  end if;
  raise notice '0042 S5.24 OK: the statutory retention horizon is computed from the house legal date; the 10-year interval and the per-client guard are intact.';
end $s5_24$;

reset role;

-- =====================================================================================
-- S5.25 -- THE CLOCK CENSUS: THE GATE IS KEYED ON THE FACT, NOT ON A LANE
-- (owner ruling 2026-08-03, WDB-R2 + the round-6 mandate).
--
-- Round 5 built two correct remedies and keyed them on `flags ? 'recurring_adjustment'` and
-- on `template_id` -- LANE/IDENTITY keys -- and both were bypassed within one round. This
-- gate is keyed on the CATALOG SHAPE instead: no clara body, anywhere, for any lane, may
-- derive a DATE from the session clock. It cannot be bypassed by writing a new door, because
-- it does not know what a door is.
--
-- IT HAS SIX ARMS (widened from two at round-7, findings E1/E2/C; from four to five at
-- round-8 M4 finding F2; and from five to six at round-10, Z3 finding 2 (F7) below --
-- reproduce-then-widen, each measured against the live catalog for false positives before
-- shipping).
--   (A) THE FORBIDDEN SHAPE -- zero tolerance. `current_date`, `current_time`, `localtime`
--       and `localtimestamp` are the SESSION timezone's answers, and so is any cast of an
--       instant to date without an explicit `at time zone`. Measured at zero after S5.20..24.
--       [round-7 E1] WIDENED to survive Postgres's OWN deparse: arms (A2)..(A5) read
--       pg_get_viewdef/pg_policies.qual/pg_get_expr/pg_get_constraintdef, never raw author
--       text, and Postgres's deparser WRAPS a cast operand in parens -- `now()::date` written
--       in a column DEFAULT round-trips through the catalog as `(now())::date` (MEASURED:
--       `create table t(d date default now()::date)` then read information_schema.columns --
--       every one of the six clock functions in this arm gets the same treatment, including
--       statement_timestamp()::date). The pre-widening pattern required the clock-fn token to
--       be followed IMMEDIATELY by `::`, so it was silent on exactly the spelling an author
--       most naturally writes in a DEFAULT/CHECK -- reproduced and closed by tolerating one
--       optional wrapping paren; the self-test below proves the widened arm still exempts the
--       lawful explicitly-zoned form (`(now() at time zone 'Asia/Kuala_Lumpur')::date`, which
--       deparses with ITS OWN extra parens and still does not match, because "AT TIME ZONE
--       '...'" sits between the clock call and the cast).
--   (B) THE DUPLICATION ROSTER -- a RATCHET, the shape the seam census's direction-2
--       baseline uses. It pins the bodies that SPELL the timezone conversion themselves,
--       never the bodies that CALL the authority: a new CALLER is the outcome this section
--       wants and must never fail a gate, while a new SPELLING is a second body owning one
--       fact. clara._book_today() is the authority; the other eight entries are PRE-EXISTING
--       inline copies in bodies no lane of this wave owns. They are CORRECT -- they compute
--       the identical fact -- so recutting five live, unrelated, defect-free bodies for a
--       naming gain was refused as scope this ruling does not need. What is forbidden is
--       GROWTH. Declared debt that cannot grow, never a blind spot.
--   (B2) [round-7 finding C residual, NEW] THE AUTHORITY'S OWN CLOCK, PINNED. Arm (B) is a
--       roster of WHICH bodies spell the marker string; it cannot see WHAT is inside one of
--       them, so a future edit that "simplifies" clara._book_today()'s body back from
--       statement_timestamp() to now()/transaction_timestamp() -- round-7 finding C's exact
--       defect, reappearing inside the one body that must never regress to it -- would satisfy
--       arm (A) (an explicitly-zoned cast is exempt by design) and arm (B) (the marker string
--       is still there) while silently re-freezing every money date at whatever the enclosing
--       transaction's FIRST statement saw. This arm reads the authority directly and is
--       therefore immune to that blind spot by construction.
--   (C) THE READER SIDE OF THE TIE (unchanged from round 6; see below).
--   (D) [round-8 M4 finding F2, NEW] THE BARE-TOKEN ROSTER. Arms (A)/(A2)..(A5) fire only on
--       an EXPLICIT `::date` cast; PostgreSQL's own ASSIGNMENT-CAST semantics let a body write
--       the ordinary idiom `v_date date; ... v_date := now();`, or hand a timestamptz straight
--       to a `date` column in an INSERT, with NO `::date` token anywhere in its source -- every
--       arm above stays silent. REPRODUCED (probe M4/f2-repro.sql, round-8 M4): both shapes
--       evade arms (A)/(B)/(B2)/(C) verbatim, on the exact census text this migration ships,
--       against a planted body that concretely rewrites journal_entries.posting_date from
--       now(). This arm is keyed on the CHEAPER and STRONGER fact instead: no clara body may
--       mention any of the six clock-fn tokens (now, current_timestamp, localtimestamp,
--       clock_timestamp, statement_timestamp, transaction_timestamp) AT ALL, bare, anywhere,
--       in ANY syntactic position -- it never asks what an assignment-cast, an INSERT target
--       or a RETURN type looks like, because a bare token's mere PRESENCE is now the fact it
--       reads. clara._book_today() is exempted BY NAME (it is the one body that must own
--       statement_timestamp()); every other genuine use is a named, MEASURED roster entry,
--       never a pattern-based exemption -- a bare token is either on the roster or it is new,
--       and new means it must be justified in THIS migration, not discovered in production.
--       MEASURED against the live 0001..0041 catalog (excluding _book_today): 159 bodies read
--       now(), 8 read statement_timestamp(), 8 read clock_timestamp(), 3 read
--       transaction_timestamp() (0 read bare current_timestamp or localtimestamp). Spot-checked
--       (and confirmed by a catalog-wide grep for a DATE-suggestive column name within 80
--       characters of every occurrence, zero hits): every one is a timestamptz audit stamp
--       (updated_at/revoked_at/consumed_at/answered_at/removed_at), a wall-clock TTL or
--       deadline comparison (egress dispatch authorizations, wake credentials, SST-watch and
--       lint-run bookkeeping), or an already-rostered Asia/Kuala_Lumpur duplication (arm B) --
--       NONE derives a DATE. The roster is EXACT on both sides (arm B's own law): a name the
--       catalog no longer shows is as much a drift as a new name the catalog newly shows.
--   (E) [round-10 fix wave, lane O2; r10 Z3 finding 2 (F7), HIGH, NEW] THE CROSS-SCHEMA ESCAPE
--       HATCH. Arms (A)/(A2)..(A5)/(B)/(B2)/(D) all read the CALLING clara body's OWN text --
--       every one of them is silent when the clock derivation lives one hop away, inside a
--       function in a DIFFERENT schema the clara body reaches by an explicit schema-qualified
--       call. MEASURED (probe scratchpad/z3-schema-evasion.sql, r10 lens Z3): `create function
--       public._z3_session_today() ... select now()::date`, then `create function
--       clara._z3_planted_reader() ... select public._z3_session_today()` -- the planted clara
--       function's OWN source contains no clock-fn token of any kind, arms (A) and (D) both
--       read it clean, and `select clara._z3_planted_reader()` returns a live, working
--       session-clock date underneath, completely undetected. Every clara SECURITY DEFINER
--       function in this migration is `set search_path = clara, pg_temp`, so an UNQUALIFIED
--       call can only ever resolve inside {clara, pg_temp, pg_catalog} -- the ONLY way to
--       reach a helper anywhere else is an EXPLICIT schema-qualified call (`schema.fn(...)`),
--       which is therefore the entire attack surface and is cheap to name directly, rather than
--       requiring a recursive one-hop re-scan of an arbitrary callee's body (a second body to
--       trust, and a second place this ratchet could itself drift out of step with arm A's own
--       pattern). MEASURED against the live 0001..0041 catalog before choosing the rule's
--       shape: ZERO clara functions today make ANY schema-qualified call to anything outside
--       clara/pg_catalog/pg_temp -- so this is ZERO-TOLERANCE, like arm (A), not a roster like
--       (B)/(D): the architecture's own "the DB owns every number" principle already implies a
--       clara body should never need to delegate its own computation to a schema this migration
--       does not own, so a first genuinely legitimate exception, if one is ever measured,
--       belongs in a design conversation, not a pre-approved allowlist entry.
--       SCOPE, STATED: functions only (arm A's own bare surface, the one Z3 measured and
--       demonstrated). A column DEFAULT/CHECK/VIEW/POLICY could in principle also carry a
--       schema-qualified call, but none of arms (A2)..(A5) has ever measured a live instance of
--       one, and widening arm (E) to those four surfaces too is left for a future round if a
--       live case is ever found -- named here so a reader does not assume arm (E) has the same
--       four-surface reach arm (A) does.
--
-- [round-7 E2, L1-lens] ARMS (A)/(B)/(B2)/(C) NOW READ prosrc || pg_get_functiondef(oid), NOT
-- prosrc ALONE. MEASURED on the round-7 DB: 587 clara functions, 0 with prosqlbody -- nothing
-- evades TODAY -- but a SQL-standard-body function (`language sql ... BEGIN ATOMIC ... END`,
-- PG14+) stores its body in prosqlbody and leaves prosrc the EMPTY STRING (not null),
-- reproduced directly: `create function f() returns date language sql stable begin atomic
-- select current_date; end;` then read pg_proc -- prosrc='' , prosqlbody IS NOT NULL. A census
-- keyed on prosrc alone reads such a function as bodiless; pg_get_functiondef(oid) deparses
-- EITHER storage form back to text (reproduced: the same probe function's pg_get_functiondef
-- shows `SELECT CURRENT_DATE`), so concatenating it closes the hole. Every arm below is an
-- EXISTENCE test (like/regex/position<>0 against one function's text), never a same-body
-- occurrence COUNT, so the duplication this concatenation introduces for an ordinary
-- prosrc-bodied function changes no verdict -- arms (A2)..(A5) are UNCHANGED by E2 (views,
-- policies, defaults and constraints have no prosqlbody-analog second storage form).
--
-- WHY (A)/(B)/(B2)/(C) SCAN COMMENT-STRIPPED SOURCE. Three of the bodies this migration just
-- recut explain in prose exactly which clock they no longer use, and one of them
-- (unallocate_group) keeps a 0040 record that names it three times. A tail that refuses
-- correct code because the author explained it is a tail nobody keeps -- s6 tail 1(c)'s
-- standing reasoning, reused.
--
-- WHAT THIS GATE DOES NOT SEE, stated rather than discovered later:
--   * A date originated OUTSIDE the clara schema and passed in as a PARAMETER (the caller
--     supplies the date; nothing is DERIVED inside clara at all). The dashboard half of that
--     law is apps/dashboard/app/shared/businessDate.ts; the runtime half is a caller
--     convention. This gate governs the schema. [round-10, F7] This is a DIFFERENT fact from
--     arm (E)'s vector -- arm (E) is a clara body CALLING a helper OUTSIDE clara that derives
--     the date ITSELF; that vector is now closed. A future evasion arm (E) still cannot see:
--     a clara body reaching a same-hazard helper through something arm (E)'s regex does not
--     recognise as a call (a computed regclass/EXECUTE-built call, a cursor over a foreign
--     function pointer) -- named as a residual, not measured live, because arm (E)'s own
--     self-test below proves only the ordinary schema-qualified call syntax it targets.
--   * WHICH date a body should use once it has today (period-derived vs act-derived). That
--     is clara._adj_correction_posting_date's question, not this one.
--   * A future PostgreSQL spelling of a session-local clock this pattern does not name. The
--     detector self-test below is the tripwire for the spellings it DOES name; a new keyword
--     would need a new arm.
--   * The EIGHT pre-existing bodies on arm (B)'s roster keeping now()/transaction_timestamp()
--     inside their OWN explicitly-zoned casts -- ruled out of scope in round 6 and NOT
--     re-litigated here (arm (A) deliberately still exempts every explicitly-zoned cast, or
--     all eight would fail this migration on code the owner ruling already accepted). Arm
--     (B2) is narrow ON PURPOSE: it pins clara._book_today() BY NAME, the one body the
--     round-7 fix actually touched, not a schema-wide re-litigation of the other seven.
-- =====================================================================================
-- [SPLIT D-b0 2026-08-04] SLICE-LOCAL ROSTERS IN ARMS (B) AND (D); ARM (C) DEFERRED. Arms (0),
-- (A), (A2)..(A5), (B2), (0/D), (0/E) and (E) are byte-exact -- they are ZERO-TOLERANCE
-- claims about the whole schema and this slice must satisfy them exactly as the whole unit
-- does. What is narrowed is the two EXACT-ON-BOTH-SIDES rosters, which by their own law
-- state what the catalog shows: arm (B) loses clara._adj_on_approve and
-- clara._adj_run_occurrence_core (D-b2 bodies) and arm (D) loses the fifteen D-b1/D-b2/D-b3
-- bodies while KEEPING clara.settle_from_bank_line, whose bare clock read is only removed by
-- SECTION S4's factoring in D-b3. Arm (C) reads clara.staff_advance_summary /
-- clara.staff_advance_statement and ships with them in D-b1. Each is marked below.
-- =====================================================================================
do $s5_25$
declare
  v_names text; v_n int; v_src text;
  -- THE SIX FORBIDDEN CLOCK-FN TOKENS, ONE SPELLING, SHARED [round-9 fix wave, lane N2; r9
  -- finding 5, HIGH]. Factored out of v_forbidden below so the three arms that each name the
  -- same six functions (the ::date cast arm, and the two NEW arms this round adds) cannot drift
  -- into three independent copies of one fact -- the exact class this migration's own S5.25 (B)
  -- exists to forbid, now applied to its own detector.
  v_clockfn text := '(now\(\)|current_timestamp|localtimestamp|clock_timestamp\(\)'
                  || '|statement_timestamp\(\)|transaction_timestamp\(\))';
  -- [round-9 fix wave, lane N2; r9 finding 5, HIGH] TWO SPELLINGS MEASURED EVADING ARM (A)
  -- ENTIRELY, PLUS THE CAST-ARM ITSELF WIDENED TWO WAYS. The lens report (as-built ladder round
  -- 9, Y3) measured FOUR fresh, syntactically-legal, semantically-identical-to-`now()::date`
  -- spellings that the pre-round-9 pattern below never saw, live-catalog-clean today (zero
  -- existing clara body uses any of them) but a real, live-measured coverage hole in a
  -- money-date-correctness gate that has now been reinforced three times (rounds 6/7/8) without
  -- ever widening its CAST-SYNTAX net:
  --   * `cast(now() as date)` -- the ANSI CAST(...AS...) form. Contains no `::` token at all, so
  --     the pre-existing arm -- keyed on finding a `::` -- structurally could not see it whatever
  --     it matched around. A NEW alternative, below, on the same six tokens.
  --   * `date(now())` -- the Postgres date-TRUNCATION function. Also no `::` token. A second NEW
  --     alternative, below, on the same six tokens.
  --   * `((now()))::date` -- double-parenthesised. The pre-round-9 `\(?...\)?` (zero-OR-ONE
  --     wrapping paren, added round-7 to survive Postgres's OWN single-paren deparse) stops at
  --     one; widened to `\(*...\)*` (zero-OR-MORE) below -- ANY paren count around the clock call
  --     is the same fact, so there is no reason to cap it at one.
  --   * `now()::timestamp::date` -- an INDIRECT cast through an intermediate type. The
  --     pre-round-9 pattern required `::date` to follow the clock call/paren IMMEDIATELY; widened
  --     below to tolerate a chain of zero-or-more intermediate `::type` hops before the final,
  --     required `::date` -- still the same instant, still a date, one hop the original never
  --     looked past.
  -- Postgres's OWN deparser (S5.25's round-7 E1 finding) already re-serialises `now()::date` with
  -- exactly one wrapping paren, never CAST(...) or date(...) syntax and never a multi-hop chain --
  -- so arms (A2)..(A5), which read pg_get_viewdef/pg_get_expr/pg_get_constraintdef output, are
  -- UNAFFECTED by any of the four spellings above; only arm (A)'s raw-prosrc scan, which preserves
  -- an author's LITERAL typed syntax, was ever exposed (measured directly: Postgres's deparser
  -- normalises `cast(now() as date)` back to `(now())::date` when re-emitting a column
  -- default/view/constraint, confirmed live against a scratch table -- the same reason E1's own
  -- paren-wrapping fix needed arm (A) alone and not (A2)..(A5)).
  v_forbidden text := '(\mcurrent_date\M|\mcurrent_time\M|\mlocaltime\M|\mlocaltimestamp\M'
                   || '|\(*' || v_clockfn || '\)*([[:space:]]*::[[:space:]]*[a-z_][a-z0-9_]*)*[[:space:]]*::[[:space:]]*date'
                   || '|\mcast[[:space:]]*\([[:space:]]*' || v_clockfn || '[[:space:]]+as[[:space:]]+date[[:space:]]*\)'
                   || '|\mdate[[:space:]]*\([[:space:]]*' || v_clockfn || '[[:space:]]*\))';
  -- [round-8 M4 finding F2, NEW] arm (D)'s detector and its measured, exact allowlist -- see
  -- the section header for the full accounting of what is on it and why.
  v_bare_forbidden text := '\m(now\(\)|current_timestamp\M|localtimestamp\M|clock_timestamp\(\)'
                        || '|statement_timestamp\(\)|transaction_timestamp\(\))';
  v_bare_roster text[] := array[
      -- [round-8 INTEGRATION note, orchestrator]. clara._adv_reversal_admission joined at the
      -- round-8 merge: lane M3 factored the advance-reversal walls out of _adv_on_approve /
      -- _adv_reversal_blocked into one admission body, and it carries the SAME lawful idiom
      -- its parents were rostered for -- `v_at := coalesce(p_at, now())`, a timestamptz as-of
      -- default for the enrolment-window interval law (the s3 header's measured argument:
      -- now() is transaction-constant on purpose there). It never derives a DATE. This arm (D)
      -- census CAUGHT the un-rostered relocation at the first integrated assembly -- exactly
      -- the drift it exists to refuse -- and the entry below is the measured adjudication.
      -- [SPLIT D-b0 2026-08-04] SLICE-LOCAL. Removed for this slice, each because the body does not
      -- exist yet: '_adj_run_occurrence_core', '_pair_reverse_core',
      -- 'approve_pair_reversal', 'cancel_pair_reversal', 'retire_adjustment_template',
      -- 'sign_adjustment_template' (D-b2); '_adv_assert_proposal', '_adv_enrolment_at',
      -- '_adv_on_approve', '_adv_reversal_admission', '_adv_window_closed_under',
      -- 'enrol_staff_advance_account', 'retire_staff_advance_account' (D-b1);
      -- '_settle_from_bank_line_core', 'resolve_and_book_bank_line' (D-b3). ADDED for this
      -- slice: 'settle_from_bank_line' -- it reads a bare clock TODAY on the live 0041
      -- catalog and only stops when SECTION S4 factors its core out in D-b3, so the
      -- whole-unit roster's omission of it is correct there and wrong here. FORWARD
      -- TOLERANCE: the FINAL (D-b2) form is the whole-unit roster; D-b1 and D-b3 each add
      -- their own names and D-b3 drops 'settle_from_bank_line' as it factors it.
      '_approve_entry_core', '_approve_opening_entry', '_derive_vendor_binding_proposal', '_draft_entry_core', '_enqueue_invoice_facts_core',
      '_fa_on_approve', '_ocr_sales_floor', '_publish_wiki_page_version_core', '_record_onboarding_contributor', '_refund_document_reservation',
      '_refund_processing_call', '_reserve_document_ingest', '_reserve_processing_call', '_resize_document_reservation', '_resolve_vendor_binding',
      '_seed_verified_document', '_settle_document_reservation', '_settle_processing_call', '_tf_agent_task_insert', '_tf_agent_task_update',
      '_tf_autodraft_attempt_update', '_tf_coding_task_update', '_tf_counterparty_update_0011', '_tf_document_intake_update', '_tf_fa_movement_belt',
      '_tf_filing_correction_update', '_tf_firm_document_limits_upsert', '_tf_fixed_assets_immutable_0017', '_tf_processing_call_reservation_update', '_tf_processing_task_update',
      '_tf_reservation_update', '_tf_rotate_token', '_tf_wake_intent_consume', '_wake_cred_full', 'ack_compliance_watch',
      'acknowledge_rule_posts', 'acknowledge_sweep_run', 'add_bank_account', 'admit_autodraft_task', 'answer_interruption',
      'approve_opening_correction', 'approve_opening_seed', 'approve_wrong_client_correction', 'begin_chat_turn', 'begin_client_onboarding',
      'bootstrap_client_plan', 'cancel_agent_task', 'cancel_client_onboarding', 'cancel_opening_seed', 'cancel_seeding_batch',
      'claim_document_intake_upload', 'claim_document_processing_task', 'classify_document', 'commit_client_onboarding', 'complete_bank_reconciliation',
      'complete_coding_task', 'complete_fixed_asset_particulars', 'complete_pending_match', 'complete_seeding_batch', 'complete_stored_document_task',
      'confirm_attribution_candidate', 'consume_egress_dispatch', 'create_client', 'create_firm', 'create_seeding_batch',
      'deactivate_bank_account', 'deactivate_client_egress_purpose', 'decline_coding_rule', 'decline_seeding_proposal', 'dismiss_attribution_candidate',
      'dismiss_coding_task', 'dismiss_open_question', 'evaluate_sst_watch', 'evaluate_sst_watches_all', 'execute_rule_post',
      'fail_classify', 'fail_invoice_facts', 'fail_statement_facts', 'finalize_document_intake', 'get_bank_reconciliation',
      'get_context_pack', 'list_autopost_rules', 'list_review_queue', 'list_vendor_bindings', 'mark_document_intake_received',
      'mark_wiki_citations_stale', 'match_bank_line', 'merge_counterparties', 'mint_wake_credential', 'open_interruption',
      'persist_document_extraction', 'persist_invoice_facts', 'persist_statement_facts', 'prepare_egress_dispatch', 'propose_autopost_rule',
      'propose_bank_rule', 'propose_vendor_identity_binding', 'reconcile_autopost_rules', 'reconcile_sweep_runs', 'record_future_attestation',
      'record_opening_keyed_resolution', 'relay_health', 'remove_member', 'rename_counterparty', 'request_reextraction',
      'resolve_bank_line_exception', 'resolve_compliance_watch', 'resolve_lint_finding', 'resolve_onboarding_plan_item', 'resolve_open_question',
      'retire_autopost_rule', 'retire_bank_rule', 'retire_client_alias', 'retire_coding_rule', 'retire_counterparty_alias',
      'retire_depreciation_authority', 'retire_document_filing', 'retire_fa_account_profile', 'retire_wiki_page', 'reverse_entry',
      'revise_entry', 'revise_fixed_asset_particulars', 'revoke_client_egress', 'revoke_client_egress_purpose', 'revoke_vendor_identity_binding',
      'revoke_wake_credential', 'run_client_lint', 'run_lint_all', 'set_counterparty_terms', 'set_document_kind',
      'set_member_role', 'set_wiki_synthesis_hold', 'settle_chat_turn', 'settle_from_bank_line', 'settle_ingest_reservation',
      'sign_autopost_rule', 'sign_bank_rule', 'sign_coding_rule', 'sign_depreciation_authority', 'sign_vendor_identity_binding',
      'snooze_compliance_watch', 'tick_seeding_proposal', 'unmatch_bank_match', 'update_onboarding_plan', 'upsert_fa_account_profile',
      'verify_document_intake', 'void_bank_reconciliation', 'void_bank_statement', 'wake_context', 'wake_record_notification',
      'withdraw_draft'
    ];
  v_bare_found text[]; v_bare_extra text[]; v_bare_missing text[];
  -- [round-10 fix wave, lane O2; r10 Z3 finding 2 (F7), NEW] arm (E)'s pattern: an explicit
  -- SCHEMA-QUALIFIED call (`identifier.identifier(`), captured group 1 is the schema name.
  -- `\m`/`\M` (not `\b` -- Postgres's ARE dialect treats `\b` as BACKSPACE, not a word
  -- boundary; measured directly while building this arm: `'...' ~ '\bpublic\.'` is FALSE on
  -- the exact live catalog text this arm scans, silently) bound it to a whole identifier so a
  -- longer name ending in one of the excluded words (e.g. a hypothetical `new_clara.fn(`)
  -- cannot be mistaken for the excluded token itself.
  v_crossschema text := '\m([a-z_][a-z0-9_]+)\.[a-z_][a-z0-9_]*\s*\(';
  v_crossschema_exempt text[] := array['clara', 'pg_catalog', 'pg_temp', 'new', 'old'];
begin
  -- (0) THE DETECTOR MUST RECOGNISE THE SHAPE IT HUNTS, and must NOT recognise the shapes
  -- that are deliberately fine. An empty census from a broken pattern is silence, not
  -- evidence -- s6 tail 19's standing law, applied here.
  if not ('select current_date' ~* v_forbidden)
     or not ('select localtimestamp' ~* v_forbidden)
     or not ('select now()::date' ~* v_forbidden)
     or not ('select current_timestamp :: date' ~* v_forbidden) then
    raise exception '0042 S5.25 (0): the forbidden-clock detector no longer recognises a session-clock date -- an empty census from it would prove nothing';
  end if;
  -- [round-9 fix wave, lane N2; r9 finding 5, HIGH] THE FOUR SPELLINGS THE LENS MEASURED
  -- EVADING, POSITIVE. Each is semantically identical to `now()::date`; a widening that failed
  -- to recognise any one of these four would leave the exact hole round 9 found still open.
  if not ('select cast(now() as date)' ~* v_forbidden)
     or not ('select cast(clock_timestamp() as date)' ~* v_forbidden)
     or not ('select date(now())' ~* v_forbidden)
     or not ('select date(statement_timestamp())' ~* v_forbidden)
     or not ('select ((now()))::date' ~* v_forbidden)
     or not ('select now()::timestamp::date' ~* v_forbidden) then
    raise exception '0042 S5.25 (0): the widened forbidden-clock detector no longer recognises one of the round-9 measured evasions (CAST(...AS date), date(...), a double-parenthesised call, or an indirect cast through an intermediate type) -- the exact hole r9 finding 5 measured would reopen silently';
  end if;
  -- NEGATIVE CONTROLS FOR THE WIDENING ITSELF -- a CAST or date(...) call whose ARGUMENT is not
  -- one of the six forbidden clock tokens, and a legitimately double-cast-but-not-to-date
  -- expression, must all still be exempt; a widening that could not tell "the clock" from "some
  -- other value" would refuse ordinary code the moment it shipped.
  if ('select cast(v_period_end as date)' ~* v_forbidden)
     or ('select cast(now() as text)' ~* v_forbidden)
     or ('select date(v_declared_timestamp)' ~* v_forbidden)
     or ('select now()::text::varchar' ~* v_forbidden) then
    raise exception '0042 S5.25 (0): the round-9 widening fires on a CAST/date(...) call whose argument is not one of the six forbidden clock tokens, or on a cast chain that never actually reaches ::date -- it would refuse correct code';
  end if;
  -- [round-7 E1] THE DEPARSED SHAPE, POSITIVE. Postgres re-serialises `now()::date` (and every
  -- other clock-fn cast) with a wrapping paren when it reads a view/default/policy/constraint
  -- back from the catalog; a detector blind to that shape is silent on exactly the spelling an
  -- author is most likely to write there. MEASURED, not asserted: these four literals are the
  -- as-deparsed forms this migration reproduced on a scratch table before widening the arm.
  if not ('(now())::date' ~* v_forbidden)
     or not ('(CURRENT_TIMESTAMP)::date' ~* v_forbidden)
     or not ('(transaction_timestamp())::date' ~* v_forbidden)
     or not ('(clock_timestamp())::date' ~* v_forbidden) then
    raise exception '0042 S5.25 (0): the widened forbidden-clock detector does not recognise Postgres''s OWN paren-wrapped deparse of a clock-fn cast -- arms (A2)..(A5) read pg_get_viewdef/pg_get_expr/pg_get_constraintdef output, never raw author text, so this shape is precisely what a real view/default/constraint census would miss';
  end if;
  if ('select (now() at time zone ''utc'')::date' ~* v_forbidden)
     or ('select (now() at time zone ''asia/kuala_lumpur'')::date' ~* v_forbidden)
     or ('select clock_timestamp()' ~* v_forbidden)
     or ('select current_dates_view' ~* v_forbidden)
     or ('((now() AT TIME ZONE ''Asia/Kuala_Lumpur''::text))::date' ~* v_forbidden)
     or ('((statement_timestamp() AT TIME ZONE ''Asia/Kuala_Lumpur''::text))::date' ~* v_forbidden) then
    raise exception '0042 S5.25 (0): the forbidden-clock detector fires on an explicitly zoned cast (raw OR as Postgres deparses it), a bare instant, or a word that merely CONTAINS the keyword -- it would refuse correct code, including the eight round-6-ratified pre-existing bodies on arm (B)''s roster';
  end if;
  if not (lower('select (now() at time zone ''Asia/Kuala_Lumpur'')::date') like '%asia/kuala_lumpur%')
     or (lower('select clara._book_today()') like '%asia/kuala_lumpur%') then
    raise exception '0042 S5.25 (0): the duplication detector no longer separates a body that SPELLS the conversion from one that CALLS the authority -- the roster ratchet would be vacuous';
  end if;

  -- (A) THE FORBIDDEN SHAPE, schema-wide, comment-stripped. Zero, with the offenders named.
  -- [round-7 E2] prosrc || pg_get_functiondef(oid): see the section header for why.
  select coalesce(string_agg(distinct p.proname, ', ' order by p.proname), '') into v_names
    from pg_proc p
   where p.pronamespace = 'clara'::regnamespace
     and lower(regexp_replace(regexp_replace(regexp_replace(
           coalesce(p.prosrc, '') || coalesce(pg_get_functiondef(p.oid), ''),
           '/\*[\s\S]*?\*/', '', 'g'), '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))
         ~* v_forbidden;
  if v_names <> '' then
    raise exception '0042 S5.25 (A): {%} derive a date from the SESSION clock. That is the connection timezone''s date -- on the UTC runtime it is one day early for eight hours of every day -- and a money date is a property of the HOUSE. Call clara._book_today().', v_names;
  end if;

  -- ...and the same shape cannot hide in a VIEW, a POLICY, a COLUMN DEFAULT or a CHECK.
  -- A census that only reads pg_proc is how a fourth writer would hide next time; measured
  -- across all four surfaces, all four empty at 0042.
  select coalesce(string_agg(distinct c.relname, ', ' order by c.relname), '') into v_names
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'clara' and c.relkind in ('v', 'm')
     and lower(pg_get_viewdef(c.oid)) ~* v_forbidden;
  if v_names <> '' then
    raise exception '0042 S5.25 (A2): view(s) {%} derive a date from the session clock', v_names;
  end if;
  select coalesce(string_agg(distinct tablename || '.' || policyname, ', '), '') into v_names
    from pg_policies
   where schemaname = 'clara'
     and lower(coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~* v_forbidden;
  if v_names <> '' then
    raise exception '0042 S5.25 (A3): RLS policy/policies {%} derive a date from the session clock', v_names;
  end if;
  select coalesce(string_agg(distinct c.relname || '.' || a.attname, ', '), '') into v_names
    from pg_attrdef d
    join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
    join pg_class c on c.oid = d.adrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'clara' and lower(pg_get_expr(d.adbin, d.adrelid)) ~* v_forbidden;
  if v_names <> '' then
    raise exception '0042 S5.25 (A4): column default(s) {%} derive a date from the session clock', v_names;
  end if;
  select coalesce(string_agg(distinct conrelid::regclass::text || '.' || conname, ', '), '') into v_names
    from pg_constraint
   where connamespace = 'clara'::regnamespace and lower(pg_get_constraintdef(oid)) ~* v_forbidden;
  if v_names <> '' then
    raise exception '0042 S5.25 (A5): constraint(s) {%} derive a date from the session clock', v_names;
  end if;
  -- (B) THE DUPLICATION ROSTER. EXACT on both sides: an unexpected name is a NEW second body
  -- owning the house fact, and a missing name means one of the recorded copies moved (most
  -- likely to a spelling this gate cannot see). Deliberately NOT a roster of callers -- a new
  -- caller of clara._book_today() is the outcome this section exists to produce.
  -- [round-7 E2] prosrc || pg_get_functiondef(oid).
  select coalesce(string_agg(distinct p.proname, ' ' order by p.proname), '') into v_names
    from pg_proc p
   where p.pronamespace = 'clara'::regnamespace
     and lower(regexp_replace(regexp_replace(regexp_replace(
           coalesce(p.prosrc, '') || coalesce(pg_get_functiondef(p.oid), ''),
           '/\*[\s\S]*?\*/', '', 'g'), '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))
         like '%asia/kuala_lumpur%';
  -- [SPLIT D-b0 2026-08-04] SLICE-LOCAL: clara._adj_on_approve and clara._adj_run_occurrence_core
  -- are D-b2 bodies. FORWARD TOLERANCE: the FINAL (D-b2) form of this roster is
  -- {_adj_on_approve _adj_run_occurrence_core _book_today _ocr_sales_floor
  -- ack_compliance_watch evaluate_sst_watch evaluate_sst_watches_all record_future_attestation
  -- reverse_entry}.
  if v_names <> '_book_today _ocr_sales_floor '
              || 'ack_compliance_watch evaluate_sst_watch evaluate_sst_watches_all '
              || 'record_future_attestation reverse_entry' then
    raise exception '0042 S5.25 (B): the bodies spelling the Asia/Kuala_Lumpur conversion are {%}, which is not the pinned set. clara._book_today() is the authority: a NEW name here is a second body owning one house fact -- call the authority instead. A MISSING name means a recorded pre-existing copy moved, which this migration must acknowledge rather than discover later.', v_names;
  end if;
  -- ...and the FA-lane alias is genuinely a delegate now, not a duplicate. Asserted on raw
  -- source: a body that "delegates" while keeping its own copy is the drift this removes.
  -- [round-7 E2] prosrc || pg_get_functiondef(oid).
  if (select count(*)::int from pg_proc p
       where p.pronamespace = 'clara'::regnamespace and p.proname = '_fa_today'
         and (coalesce(p.prosrc, '') || coalesce(pg_get_functiondef(p.oid), '')) like '%Kuala_Lumpur%') <> 0 then
    raise exception '0042 S5.25 (B): clara._fa_today still holds its own copy of the expression -- it must delegate to the authority';
  end if;

  -- (B2) [round-7 finding C residual, NEW] THE AUTHORITY'S OWN CLOCK, PINNED. See the section
  -- header: arm (B) cannot see WHAT clock function lives inside an already-rostered body, so
  -- this arm reads clara._book_today() directly, positively (it must call
  -- statement_timestamp()) and negatively (it must not call now()/transaction_timestamp()/
  -- current_timestamp -- a bare token check, so a FUTURE explicitly-zoned cast built on one of
  -- them, e.g. `(now() at time zone 'Asia/Kuala_Lumpur')::date`, is caught even though arm
  -- (A) deliberately exempts that shape schema-wide (it would otherwise fail the eight
  -- round-6-ratified pre-existing bodies).
  select lower(regexp_replace(regexp_replace(regexp_replace(
           coalesce(p.prosrc, '') || coalesce(pg_get_functiondef(p.oid), ''),
           '/\*[\s\S]*?\*/', '', 'g'), '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))
    into v_src from pg_proc p
    where p.pronamespace = 'clara'::regnamespace and p.proname = '_book_today';
  if v_src is null then
    raise exception '0042 S5.25 (B2): clara._book_today() is GONE' using errcode = 'CLR10';
  end if;
  if position('statement_timestamp()' in v_src) = 0 then
    raise exception '0042 S5.25 (B2): clara._book_today() no longer calls statement_timestamp() -- the one house authority must sample the clock PER STATEMENT (owner ruling 2026-08-03, round-7 finding C), never per transaction, or a session open across midnight MYT freezes every money date at whatever the transaction''s FIRST statement saw';
  end if;
  if v_src ~* '(\mnow\(\)|\mtransaction_timestamp\(\)|\mcurrent_timestamp\M)' then
    raise exception '0042 S5.25 (B2): clara._book_today() calls a TRANSACTION-pinned clock (now()/transaction_timestamp()/current_timestamp) -- this is round-7 finding C''s exact defect, reappearing inside the one body it must never reappear in';
  end if;

  -- [SPLIT D-b0 2026-08-04] ARM (C) -- THE READER SIDE OF THE TIE -- IS NOT IN THIS SLICE. Its two
  -- subjects, clara.staff_advance_summary and clara.staff_advance_statement, are SECTION S3
  -- bodies and ship in D-b1 together with this claim. FORWARD TOLERANCE: D-b1 restores the
  -- arm verbatim and it is the FINAL form.

  -- (0/D) [round-8 M4 finding F2, NEW] THE BARE-TOKEN DETECTOR MUST CATCH THE SHAPE ARMS
  -- (A)..(C) MISS -- an assignment-cast or an INSERT-context clock read with NO `::date` token
  -- anywhere in source -- and must NOT fire on ordinary text that merely names a column or
  -- object. An empty census from a broken pattern is silence, not evidence.
  if not ('v_date date; begin v_date := now(); end' ~* v_bare_forbidden)
     or not ('insert into t (d) values (now())' ~* v_bare_forbidden)
     or not ('return now();' ~* v_bare_forbidden)
     or not ('select current_timestamp' ~* v_bare_forbidden)
     or not ('select localtimestamp' ~* v_bare_forbidden)
     or not ('x := clock_timestamp();' ~* v_bare_forbidden)
     or not ('x := statement_timestamp();' ~* v_bare_forbidden)
     or not ('x := transaction_timestamp();' ~* v_bare_forbidden) then
    raise exception '0042 S5.25 (0/D): the bare-token detector no longer recognises an assignment-cast or INSERT-context clock read carrying no ::date token anywhere -- an empty census from it would prove nothing';
  end if;
  if ('select updated_at from clara.wake_credentials' ~* v_bare_forbidden)
     or ('select current_timestamptz_view' ~* v_bare_forbidden) then
    raise exception '0042 S5.25 (0/D): the bare-token detector fires on ordinary text that merely names a column or object -- it would refuse every clara body';
  end if;

  -- (D) THE ROSTER, EXACT ON BOTH SIDES. clara._book_today() is exempted BY NAME -- it is the
  -- one body the census requires to own statement_timestamp(), and arm (B2) above already pins
  -- what its own clock must be. [round-7 E2 practice, applied fresh here] prosrc ||
  -- pg_get_functiondef(oid), so a PG14+ standard-body evasion is as visible here as anywhere
  -- else in this section.
  select coalesce(array_agg(distinct p.proname order by p.proname), array[]::text[]) into v_bare_found
    from pg_proc p
   where p.pronamespace = 'clara'::regnamespace
     and p.proname <> '_book_today'
     and lower(regexp_replace(regexp_replace(regexp_replace(
           coalesce(p.prosrc, '') || coalesce(pg_get_functiondef(p.oid), ''),
           '/\*[\s\S]*?\*/', '', 'g'), '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))
         ~* v_bare_forbidden;
  select coalesce(array_agg(x order by x), array[]::text[]) into v_bare_extra
    from unnest(v_bare_found) x where x <> all(v_bare_roster);
  select coalesce(array_agg(x order by x), array[]::text[]) into v_bare_missing
    from unnest(v_bare_roster) x where x <> all(v_bare_found);
  if array_length(v_bare_extra, 1) > 0 then
    raise exception '0042 S5.25 (D): {%} read now()/current_timestamp/localtimestamp/clock_timestamp()/statement_timestamp()/transaction_timestamp() bare and are NOT on the measured lawful roster. Either the body derives a DATE from the session clock (call clara._book_today() instead) or it is a genuinely new lawful non-date use (a timestamptz stamp, a wall-clock TTL) that must be ADDED to the roster below with its own measured justification -- never silently.', array_to_string(v_bare_extra, ', ')
      using errcode = 'CLR10';
  end if;
  if array_length(v_bare_missing, 1) > 0 then
    raise exception '0042 S5.25 (D): the roster names {%} as a lawful bare clock use, but its live body no longer reads one -- the roster is stale (the use moved, was removed, or was rewritten) and must be trimmed to what the catalog actually shows.', array_to_string(v_bare_missing, ', ')
      using errcode = 'CLR10';
  end if;

  -- (0/E) [round-10 fix wave, lane O2; r10 Z3 finding 2 (F7), NEW] THE RAW CALL-SYNTAX PATTERN
  -- MUST RECOGNISE `schema.fn(` (whatever the schema -- exemption is the LATERAL query's job
  -- below, not this pattern's), and must NOT fire on plain unqualified calls or a record-field
  -- read that merely contains a dot with no call following it. An empty census from a broken
  -- pattern is silence, not evidence.
  if not ('select public._z3_session_today()' ~* v_crossschema)
     or not ('select workflow._helper()' ~* v_crossschema)
     or not ('select clara._book_today()' ~* v_crossschema) then
    raise exception '0042 S5.25 (0/E): the cross-schema-call pattern no longer recognises schema-qualified call syntax at all -- an empty census from it would prove nothing (clara.fn(...) itself must still match the RAW pattern; arm E''s exemption list, not this pattern, is what keeps clara.fn(...) out of the final verdict)';
  end if;
  if ('select now()' ~* v_crossschema)
     or ('select pg_get_functiondef(p.oid)' ~* v_crossschema)
     or ('select d.j -> ''active_pair_id''' ~* v_crossschema)
     or ('if new.reversal_of is not null then' ~* v_crossschema)
     or ('select t.status from clara.adjustment_templates t' ~* v_crossschema) then
    raise exception '0042 S5.25 (0/E): the cross-schema-call pattern fires on a bare unqualified call, or a record/row-field read that merely contains a dot with no call following it -- it would refuse ordinary code that names no call at all';
  end if;

  -- (E) THE CROSS-SCHEMA ESCAPE HATCH, ZERO-TOLERANCE (see the section header for the full
  -- argument: unqualified calls cannot reach outside {clara, pg_temp, pg_catalog} under this
  -- migration's own search_path, so an explicit schema-qualified call is the entire surface).
  select coalesce(string_agg(distinct sub.proname, ', ' order by sub.proname), '') into v_names
    from (
      select p.proname, m[1] as schema_ref
        from pg_proc p,
             lateral regexp_matches(
               lower(regexp_replace(regexp_replace(regexp_replace(
                 coalesce(p.prosrc, '') || coalesce(pg_get_functiondef(p.oid), ''),
                 '/\*[\s\S]*?\*/', '', 'g'), '--[^\n]*', '', 'g'), '\s+', ' ', 'g')),
               v_crossschema, 'g') as m
       where p.pronamespace = 'clara'::regnamespace
    ) sub
   where sub.schema_ref <> all(v_crossschema_exempt);
  if v_names <> '' then
    raise exception '0042 S5.25 (E): {%} make an explicit schema-qualified call to something OUTSIDE clara/pg_catalog/pg_temp -- the ONLY way (given this migration''s own search_path) to reach a helper this census cannot otherwise see into, including one that derives a date from the session clock one hop away (r10 Z3 finding 2, probed live: scratchpad/z3-schema-evasion.sql). Bring the callee into clara, inline it, or name it here with a measured justification -- this arm is zero-tolerance, not a roster (see the section header), because the architecture already forbids a clara body needing to delegate its own computation to a schema this migration does not own.', v_names;
  end if;

  raise notice '0042 S5.25 OK (D-b0 slice): no clara function, view, policy, column default or constraint derives a date from the session clock (explicit-cast or bare-token, arms A/A2..A5/D), directly or through an explicit cross-schema call (arm E); the Asia/Kuala_Lumpur duplication roster is exactly this slice''s pinned set; clara._book_today() itself calls statement_timestamp() and no transaction-pinned clock; clara._fa_today delegates to the authority; the % bare-token lawful-use entries are exactly what the catalog shows.', array_length(v_bare_roster, 1);
end $s5_25$;

-- =====================================================================================
-- S5.26 -- clara._fa_fy_end_for / clara._fa_fy_open_for: THE ANNUAL PERIOD ALGEBRA, FIXED AT
-- THE ROOT FOR A MID-MONTH FINANCIAL-YEAR END (round-8 M4 finding F1, MEDIUM; owner ruling
-- 2026-08-03 WDB-R1 root-not-symptom).
--
-- THE DEFECT, AS FOUND (probe M4/p3-fy2-repro.sql, reproducing round-8 lens X1's own
-- measurement verbatim). `set_client_fy_end` (S5.12) admits ANY real calendar day as a
-- financial-year end -- lawful in Malaysia; SSM/LHDN name no month-end requirement. But
-- `_fa_fy_end_for` (0041:1045-1052) chose the governing YEAR by comparing the MONTH alone
-- (`extract(month from p_month)::int <= coalesce(c.fy_end_month, 12)`), never the DAY, so
-- every date in the fy_end MONTH resolved to the SAME year regardless of whether it fell
-- before or after the fy_end DAY inside that month. And `_fa_fy_open_for` (0041:1057-1060)
-- derived the OPEN by TRUNCATING the end to a month boundary and stepping back eleven months,
-- rather than by asking what date follows the PREVIOUS year's actual end.
--
-- MEASURED, fy_end=(6,15): 16-30 June belonged to NEITHER the year ending 2026-06-15 (they
-- are after it) NOR the year ending 2027-06-15 (`_adj_period_start` still opened it on
-- 2026-07-01, the month-truncated guess) -- 15 CALENDAR DAYS OF EVERY YEAR belonged to NO
-- annual period any oracle would ever propose, and the window the annual machine used was 350
-- days, not 365. A firm whose year ends 15 June would sign an annual adjustment or a
-- depreciation authority for a window that misstates its own financial year, and the
-- unmet-period question would never ask about the 15 days the client's own FYE excludes.
--
-- WHY THIS NEVER SHOWED ON A MONTH-END FYE (why every live client today -- NULL-default and
-- RS's real 31 March -- was silently safe). For a month-end fy_end_day (28/29/30/31, always
-- the LAST possible day of that month), EVERY real date's day-of-month is <= fy_end_day by
-- construction, so the day comparison this fix adds can never disagree with the month-only
-- comparison it replaces. The defect is invisible on the one shape every live client has and
-- present on every shape Malaysian law actually allows.
--
-- THE FIX, AT THE ROOT, ON BOTH FUNCTIONS TOGETHER (WDB-R1: fixing only the reader that
-- surfaced the finding and leaving the writer's twin defect standing is the class this ruling
-- forbids):
--   `_fa_fy_end_for` compares the (MONTH, DAY) PAIR against (fy_end_month, fy_end_day) --
--   PostgreSQL's own row-wise comparison, so a date strictly after the fy_end day in the
--   fy_end month resolves into the NEXT year, exactly as a date in a later month already did.
--   `_fa_fy_open_for` no longer truncates to a month boundary at all: it is the day AFTER the
--   PREVIOUS year's actual end, computed by asking `_fa_fy_end_for` itself about a date one
--   year before the current end -- so leap-year Feb-29 snapping (`_fa_ym_date`'s existing
--   `least()` clamp, untouched) is inherited automatically rather than re-derived, and every
--   window abuts the one before it by construction: open(Y) = end(Y-1) + 1, always.
-- =====================================================================================
set role clara_fn_owner;

do $s5_26$
declare
  v_sig_end text := 'clara._fa_fy_end_for(uuid,date)';
  v_sig_open text := 'clara._fa_fy_open_for(uuid,date)';
  v_def text; v_frm text; v_cnt int;
  v_test_client uuid; v_orig_month int; v_orig_day int;
  v_test_throwaway boolean := false; v_test_firm uuid;
  v_gap_days int; v_window_days int;
begin
  -- PRESTATE: the two bodies are exactly their 0041-shipped shape, unmodified by any earlier
  -- splice in this migration (neither is in design SS8's change-of-record register -- like
  -- S5.15..S5.18, this recuts a LIVE 0041 body because that is where the defect lives).
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig_end::regprocedure;
  if v_def is null then
    raise exception '0042 S5.26 prestate: clara._fa_fy_end_for is GONE' using errcode = 'CLR10';
  end if;
  v_frm := $f$             + case when extract(month from p_month)::int
                         <= coalesce(c.fy_end_month, 12) then 0 else 1 end,$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0042 S5.26 prestate: _fa_fy_end_for''s month-only year-selection anchor appears % time(s) (expected exactly once) -- the body drifted or this splice already applied', v_cnt
      using errcode = 'CLR10';
  end if;

  -- (a) THE YEAR SELECTION COMPARES (MONTH, DAY), NOT MONTH ALONE.
  v_def := replace(v_def, v_frm,
    $t$             + case when (extract(month from p_month)::int, extract(day from p_month)::int)
                         <= (coalesce(c.fy_end_month, 12), coalesce(c.fy_end_day, 31)) then 0 else 1 end,$t$);
  execute v_def;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig_end::regprocedure;
  if position('extract(day from p_month)::int' in v_def) = 0 then
    raise exception '0042 S5.26 postcheck: _fa_fy_end_for''s year-selection no longer reads the DAY -- the splice did not land'
      using errcode = 'CLR10';
  end if;
  if position('extract(month from p_month)::int
                         <= coalesce(c.fy_end_month, 12) then 0 else 1 end' in v_def) <> 0 then
    raise exception '0042 S5.26 postcheck: _fa_fy_end_for''s OLD month-only comparison survived alongside the new one'
      using errcode = 'CLR10';
  end if;
  if (select p.proowner::regrole::text from pg_proc p where p.oid = v_sig_end::regprocedure)
     <> 'clara_fn_owner' then
    raise exception '0042 S5.26 postcheck: _fa_fy_end_for changed owner' using errcode = 'CLR10';
  end if;

  -- PRESTATE, THE SECOND BODY.
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig_open::regprocedure;
  if v_def is null then
    raise exception '0042 S5.26 prestate: clara._fa_fy_open_for is GONE' using errcode = 'CLR10';
  end if;
  v_frm := $f$  select (date_trunc('month', clara._fa_fy_end_for(p_client, p_month))
          - interval '11 months')::date $f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0042 S5.26 prestate: _fa_fy_open_for''s month-truncated body appears % time(s) (expected exactly once) -- the body drifted or this splice already applied', v_cnt
      using errcode = 'CLR10';
  end if;

  -- (b) THE OPEN IS THE DAY AFTER THE PREVIOUS YEAR'S ACTUAL END -- no month truncation, and
  -- the leap-Feb snap is inherited from _fa_fy_end_for rather than re-derived here.
  v_def := replace(v_def, v_frm,
    $t$  select clara._fa_fy_end_for(p_client, (clara._fa_fy_end_for(p_client, p_month) - interval '1 year')::date) + 1 $t$);
  execute v_def;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig_open::regprocedure;
  if position('date_trunc(''month''' in v_def) <> 0 or position('interval ''11 months''' in v_def) <> 0 then
    raise exception '0042 S5.26 postcheck: _fa_fy_open_for still truncates to a month boundary -- the splice did not land'
      using errcode = 'CLR10';
  end if;
  if (length(v_def) - length(replace(v_def, 'clara._fa_fy_end_for(p_client,', ''))) / length('clara._fa_fy_end_for(p_client,') <> 2 then
    raise exception '0042 S5.26 postcheck: _fa_fy_open_for must call _fa_fy_end_for exactly twice (the previous year''s end, and the recursive resolve of the date one year before it)'
      using errcode = 'CLR10';
  end if;
  if (select p.proowner::regrole::text from pg_proc p where p.oid = v_sig_open::regprocedure)
     <> 'clara_fn_owner' then
    raise exception '0042 S5.26 postcheck: _fa_fy_open_for changed owner' using errcode = 'CLR10';
  end if;

  -- FUNCTIONAL SELF-TEST. Uses a real (seeded) client row, restored to its ORIGINAL fy_end
  -- before this block ends -- this migration must never leave a client's financial-year end
  -- changed as a side effect of its own build-time proof.
  select id, fy_end_month, fy_end_day into v_test_client, v_orig_month, v_orig_day
    from clara.clients order by id limit 1;
  if v_test_client is null then
    -- [round-8 INTEGRATION fix, orchestrator]. The borrowed-client shape REFUSED the apply on
    -- any database with zero clients -- which is CI's plain migrate job, the deploy-onto-
    -- existing drill's empty half, and any fresh deploy target. The 0042 upgrade drill caught
    -- it on the first integrated run. The proof now furnishes its OWN subject when none
    -- exists: a throwaway firm+client created here and DELETED at this block's restore site,
    -- so the proof runs EVERYWHERE and the schema is left LOGICALLY clean either way
    -- [round-9 fix wave, lane N2; Codex r9 finding 3, LOW -- narrowed from "byte-identical",
    -- which OVERSTATED the measurement]. MEASURED (Codex, round 9): zero residual business/
    -- audit rows survive (clients=0, firms=0, audit_log=0, domain_events=0 on a fresh apply;
    -- an existing DB's own client is restored to its exact original fy_end_month/day) and no
    -- sequence advances (clara.clients/clara.firms carry no sequence at all -- uuid defaults
    -- -- and the one sequence that WOULD move on an ordinary audited write,
    -- audit_log_id_seq, does not, because this insert+delete carries no audit trigger). What
    -- is NOT claimed: PHYSICAL byte-identity. The insert then delete leaves an MVCC dead
    -- tuple on the heap page until the next VACUUM, and table statistics (pg_stat_*_tup_ins/
    -- _del) advance -- both EXPECTED, both invisible to every query and every readback this
    -- migration or any surface ever takes, and neither is what this proof claims to avoid.
    -- The round-7 instrument lesson, applied to its own wording: a proof whose CLAIM
    -- overstates its MEASUREMENT is the same defect class as a census that overstates its
    -- coverage.
    insert into clara.firms (name) values ('0042 S5.26/27 postcheck throwaway -- deleted below')
      returning id into v_test_firm;
    insert into clara.clients (firm_id, name)
      values (v_test_firm, '0042 S5.26/27 postcheck throwaway -- deleted below')
      returning id into v_test_client;
    v_test_throwaway := true;
  end if;

  -- (i) MID-MONTH FYE (6,15): every calendar day of a full year belongs to EXACTLY one annual
  -- period, and the window is 365 days (no leap day in play).
  update clara.clients set fy_end_month = 6, fy_end_day = 15 where id = v_test_client;
  select count(*) filter (where not (
           d::date between clara._fa_fy_open_for(v_test_client, d::date) and clara._fa_fy_end_for(v_test_client, d::date)))
    into v_gap_days
    from generate_series('2025-07-01'::date, '2026-06-30'::date, '1 day') d;
  if v_gap_days <> 0 then
    raise exception '0042 S5.26 postcheck: a mid-month FYE (6,15) still leaves % calendar day(s) of a full year outside every annual period', v_gap_days
      using errcode = 'CLR10';
  end if;
  select (clara._fa_fy_end_for(v_test_client, '2026-06-01'::date)
          - clara._fa_fy_open_for(v_test_client, '2026-06-01'::date) + 1) into v_window_days;
  if v_window_days <> 365 then
    raise exception '0042 S5.26 postcheck: a mid-month FYE (6,15) annual window is % days, expected exactly 365', v_window_days
      using errcode = 'CLR10';
  end if;
  -- ...and the boundary day itself (16 June, the FIRST day the pre-fix algebra excluded)
  -- resolves into the FY that OPENS the following day, not into no period and not into the
  -- year that already ended.
  if clara._fa_fy_end_for(v_test_client, '2026-06-16'::date) <> '2027-06-15'::date
     or clara._fa_fy_open_for(v_test_client, '2026-06-16'::date) <> '2026-06-16'::date then
    raise exception '0042 S5.26 postcheck: 16 June (the exact day the pre-fix algebra stranded) does not resolve into the FY it opens'
      using errcode = 'CLR10';
  end if;

  -- (ii) MONTH-END BYTE-IDENTITY (WDB-R4 no-regression proof): (3,31) and the NULL-default
  -- fallback (12,31) must produce EXACTLY what the pre-fix algebra produced, because every
  -- live client today has one of these two shapes. Re-derived independently here (the OLD
  -- month-truncation formula, restated) rather than by asserting equality against a body this
  -- migration just replaced.
  update clara.clients set fy_end_month = 3, fy_end_day = 31 where id = v_test_client;
  if clara._fa_fy_end_for(v_test_client, '2026-06-01'::date) <> '2027-03-31'::date
     or clara._fa_fy_open_for(v_test_client, '2026-06-01'::date)
        <> (date_trunc('month', '2027-03-31'::date) - interval '11 months')::date then
    raise exception '0042 S5.26 postcheck: the (3,31) month-end control is not byte-identical to the pre-fix algebra'
      using errcode = 'CLR10';
  end if;
  update clara.clients set fy_end_month = null, fy_end_day = null where id = v_test_client;
  if clara._fa_fy_end_for(v_test_client, '2026-06-01'::date) <> '2026-12-31'::date
     or clara._fa_fy_open_for(v_test_client, '2026-06-01'::date)
        <> (date_trunc('month', '2026-12-31'::date) - interval '11 months')::date then
    raise exception '0042 S5.26 postcheck: the NULL-default (Dec-31 fallback) control is not byte-identical to the pre-fix algebra'
      using errcode = 'CLR10';
  end if;

  -- (iii) THE LEAP BOUNDARY, ADJUDICATED (WDB-R4 off-path: a grain the fix's own reasoning did
  -- not walk). set_client_fy_end (S5.12) admits day 29 for February -- its OWN validator
  -- refuses only `p_day > 29` -- so a Feb-29 financial-year end is a LAWFUL election, not an
  -- edge case to reject. `_fa_ym_date`'s pre-existing `least()` clamp (unchanged by this fix)
  -- snaps it to 28 February in a non-leap year and leaves it on 29 February in a leap year;
  -- this fix's job is only that the YEAR SELECTION agrees with wherever that snap landed, for
  -- every day of the calendar, with no gap and no double-count -- proved here rather than
  -- assumed, over a five-year sweep that crosses the leap boundary twice. fy_end=(2,28) (a
  -- plain month-end that never snaps) is pinned as the control.
  update clara.clients set fy_end_month = 2, fy_end_day = 29 where id = v_test_client;
  if clara._fa_fy_end_for(v_test_client, '2027-02-20'::date) <> '2027-02-28'::date
     or clara._fa_fy_open_for(v_test_client, '2027-02-20'::date) <> '2026-03-01'::date
     or (clara._fa_fy_end_for(v_test_client, '2027-02-20'::date)
         - clara._fa_fy_open_for(v_test_client, '2027-02-20'::date) + 1) <> 365 then
    raise exception '0042 S5.26 postcheck: fy_end=(2,29) in a NON-leap year (2027) does not snap to 28 Feb with a 365-day window'
      using errcode = 'CLR10';
  end if;
  if clara._fa_fy_end_for(v_test_client, '2028-02-29'::date) <> '2028-02-29'::date
     or clara._fa_fy_open_for(v_test_client, '2028-02-29'::date) <> '2027-03-01'::date
     or (clara._fa_fy_end_for(v_test_client, '2028-02-29'::date)
         - clara._fa_fy_open_for(v_test_client, '2028-02-29'::date) + 1) <> 366 then
    raise exception '0042 S5.26 postcheck: fy_end=(2,29) in a LEAP year (2028) does not land ON 29 Feb with a 366-day window'
      using errcode = 'CLR10';
  end if;
  select count(*) filter (where not (
           d::date between clara._fa_fy_open_for(v_test_client, d::date) and clara._fa_fy_end_for(v_test_client, d::date)))
    into v_gap_days
    from generate_series('2025-03-01'::date, '2030-03-01'::date, '1 day') d;
  if v_gap_days <> 0 then
    raise exception '0042 S5.26 postcheck: fy_end=(2,29) leaves % day(s) of a five-year sweep (crossing the leap boundary twice) outside every annual period', v_gap_days
      using errcode = 'CLR10';
  end if;
  -- the (2,28) plain month-end control: never snaps, gap-free over the same five-year sweep --
  -- a leap day (29 Feb) simply joins whichever side of the (month,day) comparison it falls on,
  -- exactly as any other real calendar day does.
  update clara.clients set fy_end_month = 2, fy_end_day = 28 where id = v_test_client;
  select count(*) filter (where not (
           d::date between clara._fa_fy_open_for(v_test_client, d::date) and clara._fa_fy_end_for(v_test_client, d::date)))
    into v_gap_days
    from generate_series('2025-03-01'::date, '2030-03-01'::date, '1 day') d;
  if v_gap_days <> 0 then
    raise exception '0042 S5.26 postcheck: the (2,28) month-end control leaves % day(s) outside every annual period', v_gap_days
      using errcode = 'CLR10';
  end if;

  -- RESTORE. This migration must never leave a client's financial-year end changed.
  if v_test_throwaway then
    delete from clara.clients where id = v_test_client;
    delete from clara.firms where id = v_test_firm;
    if exists (select 1 from clara.clients where id = v_test_client)
       or exists (select 1 from clara.firms where id = v_test_firm) then
      raise exception '0042 postcheck: the throwaway proof firm/client survived its own deletion -- the proof must leave the schema logically clean (zero residual rows), a narrower and honestly-measured claim than physical byte-identity, which this insert+delete does not attempt' using errcode = 'CLR10';
    end if;
  else
    update clara.clients set fy_end_month = v_orig_month, fy_end_day = v_orig_day where id = v_test_client;
  end if;

  raise notice '0042 S5.26 OK: clara._fa_fy_end_for/_fa_fy_open_for select the governing year on the (month, day) PAIR, not month alone; a mid-month FYE (6,15) leaves no calendar day outside every annual period and every window is exactly 365 days; the (3,31) and NULL-default month-end controls are byte-identical to the pre-fix algebra; the Feb-29 leap boundary (and its (2,28) month-end control) is gap-free across a five-year sweep.';
end $s5_26$;

reset role;

-- =====================================================================================
-- S5.27 -- clara._fa_asset_charges: THE REDUCING-BALANCE SEGMENT BOUNDARY, KEPT MONTH-GRAIN
-- (round-8 M4 finding F1's OWN knock-on, caught by its own WDB-R4 diligence -- a 0041 recut
-- riding s5, the same liturgy as S5.26).
--
-- THE DEFECT S5.26 WOULD HAVE SHIPPED, HAD THIS BLOCK NOT EXISTED. `_fa_asset_charges`'
-- reducing-balance segment arithmetic (0041:1401-1526) is written to the design's own stated
-- law -- "REDUCING BALANCE: FY-GRAIN, MONTH-SEGMENTED" -- and every boundary inside it
-- (`v_seg_start`, `v_seg_end`, `v_seg_months` via `_fa_month_diff`) is MONTH-GRAIN by
-- construction: `_fa_month_diff` extracts (year, month) only and is BLIND to the day. Before
-- S5.26, `_fa_fy_open_for` always returned a month-start date (the very bug S5.26 fixes), so
-- feeding it straight into `v_seg_start := greatest(v_fy_open, v_first)` was safe by
-- coincidence. S5.26 makes `_fa_fy_open_for` return the EXACT calendar day for a mid-month
-- FYE -- correct for the annual PERIOD algebra `_adj_period_start`/`_adj_period_end` own --
-- but a MID-MONTH value now silently enters month-grain arithmetic this body was never built
-- to receive.
--
-- MEASURED (probe M4/_scratch-f1-rb-diagnostic.mjs, run on TOP OF S5.26's fix, before this
-- splice): a monthly-cadence reducing-balance asset (cost 1,000,000 sen, rate 20%, fy_end=
-- (6,15)) drained through 14 months. `_fa_month_diff` cannot tell 2025-06-16 (S5.26's exact
-- FY2 open) from 2025-06-01 (June's OWN month), so `v_seg_start` for FY2 (nominally July 2025
-- .. June 2026) silently absorbed JUNE 2025 -- a month that already has its OWN charge from
-- FY1's segment -- making `v_seg_months` 13 instead of 12 and re-admitting June's own 16,666
-- sen into FY2's true-up. FY2 charged 216,666 sen (11 x 16,666 + a 33,340 true-up at June
-- 2026) where a clean 12-month FY2 on a correctly-reduced basis owes 196,667 sen -- VERIFIED
-- against the SAME scenario run on the UNPATCHED baseline migration, which computes exactly
-- 196,667 (basis = 1,000,000 - 16,666 = 983,334; annual = round(983,334 x 0.20) = 196,667)
-- and is internally consistent with SS3.1's own stated formula. RM199.99 of extra
-- depreciation would have posted into APPROVED books with no refusal, discovered here before
-- it shipped rather than by a round-9 lens.
--
-- WHY NO OTHER `_fa_fy_open_for` CALL SITE NEEDS THE SAME TREATMENT (measured, not assumed --
-- WDB-R4's own question turned on this fix). Six other 0041 bodies call it
-- (`_fa_on_approve`'s freshness re-check, `_fa_run_period_core`'s admission check,
-- `_fa_oldest_unmet_period`'s receipt period_start, and the four disposal-precondition /
-- message sites in `_fa_on_approve` and `dispose_fixed_asset`). Every one of them either (a)
-- feeds a value ONLY into another `_fa_fy_open_for` call for a same-function equality/hash
-- comparison (the admission check vs. the oracle's own proposal, the freshness hash vs. its
-- own receipt) -- both sides now read exact-day, so they stay mutually consistent by
-- construction -- or (b) feeds `p_through` into `clara._fa_asset_charges` itself, which
-- ALWAYS `_fa_month_start()`s it before use (0041:1384) -- and EITHER (E-1) or (G-1), the
-- exact-day open minus one day or the month-grain open minus one day, land in the SAME
-- calendar month by construction (G is always the month immediately after E's month, or
-- equal to E when the FYE is itself a month-end), so month-starting either one gives the
-- identical answer. `_fa_asset_charges`' OWN internal `v_fy_open` assignment (0041:1450) is
-- the lone exception: it feeds `v_seg_start` DIRECTLY, with no month-start guard, which is
-- exactly what this splice closes.
--
-- THE FIX. A NEW, NAMED, MONTH-GRAIN primitive for the ONE consumer that needs one --
-- `clara._fa_fy_month_open_for` restates the EXACT formula `clara._fa_fy_open_for` carried
-- before S5.26 (`date_trunc('month', fy_end) - 11 months`), under an honest name, so the two
-- questions ("what day does this FY legally open" vs "what month does this FY's charging
-- start") each own their own answer rather than one function serving both and breaking
-- whichever consumer wasn't looked at. This is NOT the WDB-R2 forbidden shape (two bodies
-- answering the SAME question): both delegate to the SAME `clara._fa_fy_end_for`, so there is
-- still exactly one authority for "which year" -- only the OPEN side now has two honestly-
-- named, differently-scoped readings. `_fa_asset_charges` is repointed to the month-grain
-- reading at the ONE site that feeds `v_seg_start`/`v_seg_months`.
-- =====================================================================================
set role clara_fn_owner;

-- THE MONTH-GRAIN FY OPEN -- the ONE consumer is clara._fa_asset_charges' reducing-balance
-- segment boundary (see header). NOT a duplicate of clara._fa_fy_open_for: the exact-day open
-- is a property of the CALENDAR (an annual period's legal first day, for a template, a
-- receipt, an unmet-period window); this is a property of the LEDGER'S OWN GRAIN (which whole
-- month a reducing-balance charge block starts counting from), because charge blocks never
-- straddle a month and SS3.1's own law charges FY-GRAIN, MONTH-SEGMENTED regardless of where
-- in a month the FYE calendar day falls.
--
-- THE RECEIPT/REGISTER WINDOW INCOHERENCE, NAMED [round-9 fix wave, lane N2; r9 finding 9,
-- LOW, Y1]. The TWO GRAINS ABOVE are each individually correct and were each measured to
-- reconcile to the CENT across a mid-month FY boundary (no month double-charged, none
-- skipped, annual and monthly cadences agree per FY block) -- but nothing reconciles their
-- LABELS. `clara.fa_depreciation_runs.period_start/period_end` (0041:2320, fed by the
-- EXACT-DAY `_fa_fy_open_for`/`_fa_fy_end_for`, live-patched to the mid-month-FYE-correct
-- form by S5.26 above) and `clara.fa_depreciation.period_start/period_end` (the CHARGE rows,
-- fed by THIS function's MONTH-GRAIN answer) disagree on where a mid-month FYE's boundary
-- month falls: MEASURED, fy_end=(6,15), a receipt for the FY closing 2025-06-15 books a
-- charge row stamped 2025-06-01..2025-06-30 (the whole June month, month-grain), and a
-- receipt for the FY closing 2026-06-15 books a charge row stamped 2025-07-01..2026-06-30 --
-- BOTH charge rows' own period_start/period_end lie OUTSIDE the exact-day window their own
-- run receipt claims (2024-06-16..2025-06-15 and 2025-06-16..2026-06-15 respectively). A
-- reviewer reconciling the two tables for a mid-month-FYE client on an ANNUAL cadence finds
-- every charge row claiming a period its run does not cover, with nothing on either row
-- saying why -- because nothing STATES the law that this comment block states in prose but
-- no reader-facing surface repeats.
--
-- THE LAW, NAMED RATHER THAN LEFT TO INFERENCE (the smallest honest fix that does not touch
-- charge arithmetic, a persisted column, or any RPC envelope -- adjudicated in-source per the
-- finding's own instruction; the alternative Y1 also named -- CLAMPING the charge row's
-- STATED period_start/period_end to the intersection with its run's period, basis arithmetic
-- untouched -- is a real code change to a value every existing consumer of
-- clara.fa_depreciation.period_start/period_end would then read differently, and is left for
-- the owner at round 10, not decided here): reducing-balance charge rows are BOOKED
-- MONTH-SEGMENTED, on `clara._fa_fy_month_open_for`'s month-grain answer, and DELIBERATELY do
-- not align with a mid-month financial-year boundary's exact-day window -- the money ties to
-- the cent across the boundary either way, and the boundary MONTH (the FYE month itself) is
-- attributed, WHOLE, to the FY it precedes rather than split at the FYE day. x42-r9-n2.test.mjs
-- (test x42.r9n2.f6) pins this exact shape as a NAMED, expected fact rather than leaving a
-- reader to discover it unassisted.
create function clara._fa_fy_month_open_for(p_client uuid, p_month date) returns date
  language sql stable as $$
  select (date_trunc('month', clara._fa_fy_end_for(p_client, p_month))
          - interval '11 months')::date $$;
revoke all on function clara._fa_fy_month_open_for(uuid, date) from public;

do $s5_27$
declare
  v_sig text := 'clara._fa_asset_charges(uuid,date,boolean)';
  v_def text; v_frm text; v_cnt int;
  v_test_client uuid; v_orig_month int; v_orig_day int;
  v_test_throwaway boolean := false; v_test_firm uuid;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if v_def is null then
    raise exception '0042 S5.27 prestate: clara._fa_asset_charges is GONE' using errcode = 'CLR10';
  end if;
  if position('_fa_fy_month_open_for' in v_def) <> 0 then
    raise exception '0042 S5.27 prestate: _fa_asset_charges already delegates to _fa_fy_month_open_for -- this splice has already been applied to this database'
      using errcode = 'CLR10';
  end if;
  v_frm := $f$v_fy_open := clara._fa_fy_open_for(fa.client_id, g.m);$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0042 S5.27 prestate: the v_fy_open assignment anchor appears % time(s) (expected exactly once) -- the body drifted or this splice already applied', v_cnt
      using errcode = 'CLR10';
  end if;
  v_def := replace(v_def, v_frm,
    $t$v_fy_open := clara._fa_fy_month_open_for(fa.client_id, g.m);$t$);
  execute v_def;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if position('clara._fa_fy_month_open_for(fa.client_id, g.m)' in v_def) = 0 then
    raise exception '0042 S5.27 postcheck: _fa_asset_charges no longer calls _fa_fy_month_open_for -- the splice did not land'
      using errcode = 'CLR10';
  end if;
  if position('v_fy_open := clara._fa_fy_open_for(' in v_def) <> 0 then
    raise exception '0042 S5.27 postcheck: _fa_asset_charges still assigns v_fy_open from the EXACT-DAY authority -- the mid-month conflation this splice exists to close survived'
      using errcode = 'CLR10';
  end if;
  if (select p.proowner::regrole::text from pg_proc p where p.oid = v_sig::regprocedure)
     <> 'clara_fn_owner' then
    raise exception '0042 S5.27 postcheck: _fa_asset_charges changed owner' using errcode = 'CLR10';
  end if;

  -- FUNCTIONAL SELF-TEST. clara._fa_fy_month_open_for must be month-grain (a month-start
  -- date, always) and its window against clara._fa_fy_end_for must be EXACTLY 12 whole
  -- months, for a mid-month FYE and for a month-end control alike -- and it must be
  -- BYTE-IDENTICAL to the pre-S5.26 clara._fa_fy_open_for formula (the same formula, only
  -- renamed and re-scoped), restored before this block ends.
  select id, fy_end_month, fy_end_day into v_test_client, v_orig_month, v_orig_day
    from clara.clients order by id limit 1;
  if v_test_client is null then
    -- [round-8 INTEGRATION fix, orchestrator]. The borrowed-client shape REFUSED the apply on
    -- any database with zero clients -- which is CI's plain migrate job, the deploy-onto-
    -- existing drill's empty half, and any fresh deploy target. The 0042 upgrade drill caught
    -- it on the first integrated run. The proof now furnishes its OWN subject when none
    -- exists: a throwaway firm+client created here and DELETED at this block's restore site,
    -- so the proof runs EVERYWHERE and the schema is left LOGICALLY clean either way
    -- [round-9 fix wave, lane N2; Codex r9 finding 3, LOW -- narrowed from "byte-identical",
    -- which OVERSTATED the measurement]. MEASURED (Codex, round 9): zero residual business/
    -- audit rows survive (clients=0, firms=0, audit_log=0, domain_events=0 on a fresh apply;
    -- an existing DB's own client is restored to its exact original fy_end_month/day) and no
    -- sequence advances (clara.clients/clara.firms carry no sequence at all -- uuid defaults
    -- -- and the one sequence that WOULD move on an ordinary audited write,
    -- audit_log_id_seq, does not, because this insert+delete carries no audit trigger). What
    -- is NOT claimed: PHYSICAL byte-identity. The insert then delete leaves an MVCC dead
    -- tuple on the heap page until the next VACUUM, and table statistics (pg_stat_*_tup_ins/
    -- _del) advance -- both EXPECTED, both invisible to every query and every readback this
    -- migration or any surface ever takes, and neither is what this proof claims to avoid.
    -- The round-7 instrument lesson, applied to its own wording: a proof whose CLAIM
    -- overstates its MEASUREMENT is the same defect class as a census that overstates its
    -- coverage.
    insert into clara.firms (name) values ('0042 S5.26/27 postcheck throwaway -- deleted below')
      returning id into v_test_firm;
    insert into clara.clients (firm_id, name)
      values (v_test_firm, '0042 S5.26/27 postcheck throwaway -- deleted below')
      returning id into v_test_client;
    v_test_throwaway := true;
  end if;
  update clara.clients set fy_end_month = 6, fy_end_day = 15 where id = v_test_client;
  if clara._fa_fy_month_open_for(v_test_client, '2025-07-01'::date) <> '2025-07-01'::date
     or extract(day from clara._fa_fy_month_open_for(v_test_client, '2025-07-01'::date)) <> 1
     or ((extract(year from clara._fa_fy_end_for(v_test_client,'2025-07-01'::date))*12
          + extract(month from clara._fa_fy_end_for(v_test_client,'2025-07-01'::date)))
         - (extract(year from clara._fa_fy_month_open_for(v_test_client,'2025-07-01'::date))*12
          + extract(month from clara._fa_fy_month_open_for(v_test_client,'2025-07-01'::date))))
        <> 11 then
    raise exception '0042 S5.27 postcheck: the month-grain open for a mid-month FYE (6,15) is not a month-start exactly 12 whole months before the FY end'
      using errcode = 'CLR10';
  end if;
  update clara.clients set fy_end_month = 3, fy_end_day = 31 where id = v_test_client;
  if clara._fa_fy_month_open_for(v_test_client, '2026-06-01'::date)
     <> (date_trunc('month', '2027-03-31'::date) - interval '11 months')::date then
    raise exception '0042 S5.27 postcheck: the (3,31) month-end control is not byte-identical to the pre-S5.26 clara._fa_fy_open_for formula'
      using errcode = 'CLR10';
  end if;
  if v_test_throwaway then
    delete from clara.clients where id = v_test_client;
    delete from clara.firms where id = v_test_firm;
    if exists (select 1 from clara.clients where id = v_test_client)
       or exists (select 1 from clara.firms where id = v_test_firm) then
      raise exception '0042 postcheck: the throwaway proof firm/client survived its own deletion -- the proof must leave the schema logically clean (zero residual rows), a narrower and honestly-measured claim than physical byte-identity, which this insert+delete does not attempt' using errcode = 'CLR10';
    end if;
  else
    update clara.clients set fy_end_month = v_orig_month, fy_end_day = v_orig_day where id = v_test_client;
  end if;

  raise notice '0042 S5.27 OK: clara._fa_asset_charges'' reducing-balance segment boundary now reads clara._fa_fy_month_open_for (month-grain, always a month-start, exactly 12 whole months before the FY end) instead of the exact-day clara._fa_fy_open_for S5.26 installed -- the conflation that would have re-admitted an already-charged month into the next FY''s true-up is closed.';
end $s5_27$;

reset role;

-- #####################################################################################
-- ############################## TAIL -- THE CENSUS BLOCKS ############################
-- #####################################################################################
-- 0042 section 6 (design SS8's tail list, twenty blocks + the final notice). Each block is
-- INDEPENDENT: one named invariant, one remedy in the raise text, no shared state -- so a
-- reader greps for the property, not for a variable. Every count is EXACT where the design
-- states an exact number, and a lower bound ONLY where the design's own words admit a range
-- (each such place says so, and names what x42 asserts instead).
--
-- WHAT A TAIL IS FOR. Sections S1-S5 above are the migration's INTENT; these blocks are the
-- migration's SELF-VERIFICATION against the world it actually leaves behind. They read the
-- LIVE catalog (pg_proc.prosrc, pg_trigger, pg_policies, pg_index, information_schema) -- never
-- this file's own text -- so a splice that silently missed, a body a later section rebuilt, a
-- belt that was created but not deferred, or a grant that leaked cannot ship. A violated tail
-- aborts the whole transaction: 0042 either applies in full or not at all.
--
-- TWO HOUSE RULES THIS FILE FOLLOWS EXACTLY:
--   (1) BODY TEXT IS READ WIDENED [round-8 M2, revising the original "prosrc alone" rule below
--       -- read as history, not as the current instrument]. Round 7's lens (S5.15e) measured
--       that a PG14+ standard-body function (`language sql ... begin atomic`) stores its body
--       in prosqlbody and leaves prosrc the EMPTY STRING, not NULL -- so a census keyed on
--       prosrc alone reads such a function as bodiless and any pattern inside it evades every
--       predicate below. Every census in this file now reads
--       `coalesce(p.prosrc,'') || coalesce(pg_get_functiondef(p.oid),'')` (an EXISTENCE-safe
--       instrument: matching either representation is enough, and pg_get_functiondef embeds
--       prosrc verbatim for an ordinary plpgsql body, so concatenation changes no verdict for
--       today's 587/587 non-prosqlbody clara functions) OR, where a predicate COUNTS how many
--       times a token occurs INSIDE one already-fetched function body (a length()-difference
--       occurrence count, never a count(*) over many functions), the SINGLE-REPRESENTATION
--       form `coalesce(nullif(p.prosrc,''), pg_get_functiondef(p.oid))` -- concatenating both
--       representations would DOUBLE such a count for an ordinary body (the marker then
--       appears once in the prosrc half and once again inside the embedded copy in the
--       pg_get_functiondef half), which is a measured false failure, not a caught defect;
--       picking exactly one representation is immune to it and changes no value today either.
--       ONE NAMED EXCEPTION remains prosrc-only, adjudicated and commented at its own site
--       (TAIL 19's ACL-combined write-detector): the scripts/check-wiki-dynamic-sql.mjs gate
--       classifies any `do` block that BOTH calls pg_get_functiondef AND carries a bare
--       `execute` token ANYWHERE in the block (quote-blind) as a change-of-record patch, and
--       TAIL 19 shares its block with an ACL `privilege_type = 'EXECUTE'` literal -- MEASURED
--       to break the gate on a false positive if widened in place, and this file's own rule
--       (5) above ("each block is INDEPENDENT ... no shared state") rules out the cross-block
--       bridge that would be needed to widen it safely. TAIL 7 stays prosrc-free for the
--       identical reason, unchanged from round 7.
--   (2) EVERY DETECTOR IS MEASURED BEFORE IT IS TRUSTED. A census that asserts an EMPTY answer
--       is indistinguishable from a pattern that has quietly stopped matching anything -- the
--       absence-from-the-wrong-instrument mistake this repo has paid for three times. Every
--       regex census below therefore carries a positive/negative control on literal strings
--       immediately above it.
--
-- CITATIONS: [WDB-Gn] = design SS1 rulings; SSn = wave-d-b-design.md; ABI SSx =
-- wave-d-b-design-abi.md; [Ln/row] = the eight-round ladder record (part2/part3).
--
-- [SPLIT D-b0 2026-08-04] THIS FILE IS THE D-b0 SLICE OF SECTION 6. Census sect.5 splits the
-- twenty-one tails four ways under one rule: a tail whose subject is a CLOSED SET ships
-- pure, per-slice; a tail that enumerates a ROSTER SPANNING FAMILIES ships per-slice with a
-- slice-local expected roster and an explicit `FORWARD TOLERANCE` comment naming the final
-- form -- and NEVER as an `if to_regprocedure(...) is not null` guard, which converts a
-- build-time census into a conditionally-vacuous one (the fail-open class round 7 measured).
-- THIS SLICE CARRIES: tail 16 (pure) and the slice-local forms of tails 1, 3, 6, 9 and 20.
-- The other fifteen tails ship with the families they are about:
--   2 (origin='scheduled_run')                     -> D-b2 (this slice keeps 0041's form)
--   4, 5, 11, 13                                   -> D-b3 (pure)
--   7, 8                                           -> D-b1 + D-b2 + D-b3, per-slice
--   10                                             -> D-b1 (4 tables) + D-b2 (3 tables)
--   12, 15, 17, 18                                 -> D-b2 (pure)
--   14                                             -> split by event name: D-b2 / D-b3
--   19, 21                                         -> D-b1 (pure)
-- FINAL FORMS of tails 1, 3, 6, 9 and 20 land in D-b2, the last slice to ship.
-- =====================================================================================
-- TAIL 1 -- THE APPROVE-PATH CENSUS (FOUR), THE HOOK-CALLER CENSUS (FOUR) AND THE BOUNDED
-- RECURSION PROOF (design SS8 tail 1; the round-3 fold [L3/V1+V2] that made every D-b
-- approval route through clara._approve_entry_core).
--
-- WHY THREE CLAIMS IN ONE BLOCK. They are one property seen from three sides. D-b adds two
-- new materialisation hooks and an auto-reversal that APPROVES A SECOND ENTRY from inside an
-- approving transaction. The round-2 design had the mirror flip write the approval itself,
-- which would have made a FIFTH approve path and a FIFTH hook caller; round 3 routed it
-- through the core instead. If either census moves, that routing decision was silently
-- undone -- and with it CLR05 maker-checker on the mirror.
--
-- THE TWO INSTRUMENTS ARE DELIBERATELY DIFFERENT. (a) counts the bodies that WRITE the
-- approved status; (b) counts the bodies that CALL the hook. Same four names, measured two
-- ways: a body that approves without calling the hook (a materialisation hole) and a body
-- that calls the hook without approving (a phantom materialisation) are both caught, and
-- neither is visible to the other instrument alone.
-- [SPLIT D-b0 2026-08-04] SLICE-LOCAL. (a) and (b) are byte-exact and are the load-bearing half
-- here: this slice makes NO hook edit at all (census sect.2 Class C -- S5.8's two
-- `perform` lines are unconditional and PL/pgSQL resolves neither at CREATE time, so a
-- D-b0 that shipped that splice alone would break every approve path in production at the
-- first call), so the two censuses must read EXACTLY what SECTION 0 probe 10 measured
-- before the migration ran. (c) is narrowed to the ONE hook that exists in this slice's
-- world -- the D-a fixed-asset hook, which is also the anchor D-b1's and D-b2's splices are
-- positioned against -- and (d) is deferred whole, because both its subjects
-- (clara._adj_on_approve, clara._adv_on_approve) are later slices' bodies.
-- FORWARD TOLERANCE: the D-b1 form of (c) adds ('clara._adv_on_approve(', '_adv_on_approve')
-- and the FINAL (D-b2) form adds ('clara._adj_on_approve(', '_adj_on_approve'); (d) arrives
-- whole in D-b2, when the depth-2 recursion it bounds first exists.
-- =====================================================================================
do $tail1$
declare
  v_n int; v_names text; v_expect text := '_approve_entry_core, _approve_opening_entry, approve_wrong_client_correction, reverse_entry';
  v_adj text; v_adv text; v_sub text;
  v_a int; v_b int; v_c int; v_d int;
  r record;
begin
  -- (a) THE APPROVE-PATH CENSUS. The detector is whitespace-tolerant and recognises the BARE
  -- form too: every clara body runs `set search_path = clara`, so `update journal_entries set
  -- status='approved'` writes clara.journal_entries exactly as the qualified form does, and a
  -- census keyed on the qualified text alone would be blind to it (the 0041 tail 13(c) H3
  -- lesson, restated for a different table).
  if not ('update clara.journal_entries set status=''approved'',checker_actor=c.actor'
            ~* 'update[[:space:]]+(only[[:space:]]+)?(clara[[:space:]]*\.[[:space:]]*)?journal_entries[[:space:]]+set[[:space:]]+status[[:space:]]*=[[:space:]]*''approved''')
     or not ('update  journal_entries  set  status = ''approved'''
            ~* 'update[[:space:]]+(only[[:space:]]+)?(clara[[:space:]]*\.[[:space:]]*)?journal_entries[[:space:]]+set[[:space:]]+status[[:space:]]*=[[:space:]]*''approved''')
     or ('update clara.journal_entries_history set status=''approved'''
            ~* 'update[[:space:]]+(only[[:space:]]+)?(clara[[:space:]]*\.[[:space:]]*)?journal_entries[[:space:]]+set[[:space:]]+status[[:space:]]*=[[:space:]]*''approved''') then
    raise exception '0042 tail 1(a): the approved-status write detector no longer recognises the bare/whitespaced forms (or now sweeps in a sibling table) -- a census from it would be silence, not evidence';
  end if;
  -- EVERY ORDERED AGGREGATE IN THIS FILE SORTS UNDER `collate "C"`. proname is of type `name`
  -- (C-collated), but string_agg forces a text cast, and under a linguistic database collation
  -- an underscore is not a separator -- `_approve_entry_core` would sort as if it read
  -- `approve_entry_core`. A census that compares a JOINED STRING must therefore pin the
  -- collation, or it green/reds on the deployment's locale rather than on the schema.
  select count(*)::int, string_agg(p.proname::text, ', ' order by p.proname::text collate "C")
    into v_n, v_names
    from pg_proc p
   where p.pronamespace = 'clara'::regnamespace and p.prokind = 'f'
     and lower(regexp_replace(regexp_replace(regexp_replace(
           (coalesce(p.prosrc, '') || coalesce(pg_get_functiondef(p.oid), '')), '/\*[\s\S]*?\*/', '', 'g'), '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))
         ~* 'update[[:space:]]+(only[[:space:]]+)?(clara[[:space:]]*\.[[:space:]]*)?journal_entries[[:space:]]+set[[:space:]]+status[[:space:]]*=[[:space:]]*''approved''';
  if v_n <> 4 or v_names <> v_expect then
    raise exception '0042 tail 1(a): the APPROVE PATHS are {%} (% of them) -- expected exactly the pinned four {%}. Wave D-b routes every approval it performs through clara._approve_entry_core (design SS2.4, the [L3/V1+V2] fold): a fifth writer means the mirror flip, a pair-correction approval or an advance posting is approving an entry BEHIND the core, which skips CLR05 maker-checker, the receipt, the events and the subledger hook in one stroke.', v_names, v_n, v_expect;
  end if;

  -- (b) THE HOOK-CALLER CENSUS, at 0041 tail 3's exact instrument (and SECTION 0 probe 10's,
  -- so this is a DELTA against a measured pre-state, not a guess). Same four names as (a).
  -- p.proname <> the target itself [round-8 M2, the S5.15e self-match fix, same class]:
  -- pg_get_functiondef's OWN header line (`CREATE OR REPLACE FUNCTION
  -- clara._subledger_on_approve(...)`) always contains the function's own qualified call
  -- shape verbatim (MEASURED against the live catalog: no space between name and paren), so
  -- widening the source to include it makes _subledger_on_approve self-match its own name --
  -- unguarded, this predicate would read 5 callers (the pinned four plus the hook itself).
  -- Excluding the target restores "who ELSE calls it" without losing prosqlbody coverage.
  select count(*)::int, string_agg(p.proname::text, ', ' order by p.proname::text collate "C")
    into v_n, v_names
    from pg_proc p
   where p.pronamespace = 'clara'::regnamespace
     and p.proname <> '_subledger_on_approve'
     and (coalesce(p.prosrc, '') || coalesce(pg_get_functiondef(p.oid), '')) like '%clara._subledger_on_approve(%';
  if v_n <> 4 or v_names <> v_expect then
    raise exception '0042 tail 1(b): the callers of clara._subledger_on_approve are {%} (% of them) -- expected exactly the pinned four {%}, unchanged by this migration (the 0037:3779-3846 census, re-pinned by 0041 and again here)', v_names, v_n, v_expect;
  end if;

  -- (c) THE ONE HOOK THIS SLICE HAS IS CALLED FROM THE ONE PLACE. [SPLIT D-b0 2026-08-04] The
  -- whole-unit arm asserts the two D-b hooks; this slice asserts the D-a hook the D-b ones
  -- will be spliced beside, on the SAME instrument, so "called from exactly one body, and
  -- exactly once inside it" is a claim this slice makes rather than inherits.
  -- COMMENT-STRIPPED, exactly as the whole-unit arm is: a splice comment that names the very
  -- call it sits above would inflate every count below on raw source.
  select lower(regexp_replace(regexp_replace(regexp_replace(
           coalesce(nullif(p.prosrc, ''), pg_get_functiondef(p.oid)), '/\*[\s\S]*?\*/', '', 'g'), '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))
    into v_sub from pg_proc p
    where p.oid = 'clara._subledger_on_approve(uuid)'::regprocedure;
  for r in select * from (values
      ('clara._fa_on_approve(', '_fa_on_approve')) as t(marker, bare) loop
    v_names := r.marker;
    select count(*)::int into v_n from pg_proc p
      where p.pronamespace = 'clara'::regnamespace
        and p.proname <> r.bare
        and position(v_names in lower(regexp_replace(regexp_replace(regexp_replace(
              (coalesce(p.prosrc, '') || coalesce(pg_get_functiondef(p.oid), '')), '/\*[\s\S]*?\*/', '', 'g'), '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))) > 0;
    if v_n <> 1 then
      raise exception '0042 tail 1(c): % is called from % body/bodies (expected exactly 1 -- clara._subledger_on_approve). Every approve path funnels through that one function; a second call site is a second materialisation of the same proposal.', v_names, v_n;
    end if;
    v_a := (length(v_sub) - length(replace(v_sub, v_names, ''))) / length(v_names);
    if v_a <> 1 then
      raise exception '0042 tail 1(c): clara._subledger_on_approve calls % % time(s), expected exactly 1', v_names, v_a;
    end if;
  end loop;

  raise notice '0042 tail 1 OK (D-b0 slice): the four approve paths and the four hook callers are the SAME pinned four (measured by two independent instruments) and this slice moved neither; the D-a hook is called exactly once, from clara._subledger_on_approve alone.';
end $tail1$;

-- =====================================================================================
-- TAIL 3 -- THE POSITIONAL SPLICE CENSUS (design SS8 tail 3 + the SS8 CoR register).
-- One row per change-of-record splice SECTIONS S4/S5 make, asserted on the LIVE body as
-- BOTH-PRESENT-AND-ORDERED. A bare `position(a) < position(b)` reads a MISSING marker
-- (position 0) as correctly ordered and passes vacuously -- the mistake 0041 tail 3 names in
-- its own comment -- so every ordered claim below first asserts both endpoints exist.
--
-- [SPLIT D-b0 2026-08-04] SLICE-LOCAL: ONE ROW PER SPLICE THIS SLICE MAKES. The whole-unit block
-- carries eight numbered sites; this slice makes four of them ((6), (7)/(7b), (8) and the
-- non-ordering half of (1)) plus the rung half of (5). Deferred, each with the slice that
-- makes the splice:
--   (1)'s FOUR-ANCHOR ORDERING (fa -> adj -> adv -> the settlement early-return) -- D-b2,
--       the last of the two hook lines to land. What this slice DOES assert is the other
--       half of (1): the 0041 six-marker census on clara._subledger_on_approve and its
--       single clara._fa_on_approve anchor, so a body this slice did not touch cannot have
--       drifted under it.
--   (2)'s WALL AND ITS ORDERING                       -- D-b1. What this slice asserts of
--       clara.reverse_entry is its six pre-0042 markers, the absence of current_date and the
--       correction-date term S5.9-b0 adds (the half this slice must ship -- see that block).
--   (3) clara.revise_entry's flags + pair refusals    -- D-b2.
--   (4) clara.withdraw_draft's pair refusal           -- D-b2.
--   (5)'s clara.adjustment_templates SOURCE -- D-b2, with the arm that reads it. The rung,
--       the clara.fa_depreciation_authorities source and the 'annual' discrimination are all
--       asserted here (adjudicated 2026-08-04: the authority arm has no later-slice
--       dependency, and cell x41.f3 measured the cost of deferring it).
-- FORWARD TOLERANCE: the FINAL form of this block is D-b2's, at all eight sites.
-- WHY POSITION AND NOT PRESENCE. Four of these splices are only correct in one place:
--   * the two D-b hooks must sit BELOW the FA hook and ABOVE the settlement early-return, or
--     they are dead code for every non-settlement entry (the 0041 [L2/round-1] defect, exactly);
--   * _wdb_reversal_blocked must sit ABOVE the mirror INSERT, or a pair half is reversed and
--     THEN refused, leaving the maker a success receipt for a mirror that can never approve;
--   * the pair/flags refusals must sit BELOW the FOR UPDATE row lock, or they read a world
--     that can change under them;
--   * set_client_fy_end's new rung must sit BETWEEN its op reservation and its write.
-- =====================================================================================
do $tail3$
declare
  r record; v_src text; v_raw text; v_n int; v_a int; v_b int; v_c int; v_d int;
begin
  -- ---------------------------------------------------------------------------------------
  -- (1) clara._subledger_on_approve -- THE HOOK CHAIN AND ITS ORDER (design SS2.6/SS3.3).
  -- ---------------------------------------------------------------------------------------
  select coalesce(nullif(p.prosrc, ''), pg_get_functiondef(p.oid))
    into v_raw
    from pg_proc p where p.oid = 'clara._subledger_on_approve(uuid)'::regprocedure;
  v_src := lower(regexp_replace(regexp_replace(regexp_replace(
             v_raw, '/\*[\s\S]*?\*/', '', 'g'), '--[^\n]*', '', 'g'), '\s+', ' ', 'g'));
  -- POSITIONS ARE MEASURED ON THE COMMENT-STRIPPED TEXT. The D-b splice necessarily comes with
  -- a comment explaining where it sits, and a comment that NAMES the anchor above it would move
  -- every position measured on raw source. Counts below are measured on RAW source instead,
  -- because that is the instrument 0041 pinned its five numbers with (two of the five markers
  -- legitimately appear inside comments, so a stripped count would read 2 and 5 for markers
  -- whose true counts are 3 and 6 -- a false failure, not a caught defect).
  -- The 0041 six-marker census, re-run here so a body this migration rebuilt cannot pass by
  -- carrying only the NEW markers (design SS8 CoR register: "_subledger_on_approve, six-marker
  -- census + anchor").
  for r in select * from (values
      ('payment_terms_days', 1), ('effective_date', 3),
      ($$item_kind in ('invoice','bill')$$, 1),
      ('cross_domain_control_entry', 1), ('allocation_stale', 6)) as t(marker, want) loop
    v_n := (length(v_raw) - length(replace(v_raw, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '0042 tail 3(1): _subledger_on_approve marker "%" is % (expected % -- the 0041 tail 3 census, re-pinned after the D-b splices)', r.marker, v_n, r.want;
    end if;
  end loop;
  v_n := (length(v_src) - length(replace(v_src, 'clara._fa_on_approve(p_entry)', '')))
         / length('clara._fa_on_approve(p_entry)');
  if v_n <> 1 then
    raise exception '0042 tail 3(1): _subledger_on_approve calls clara._fa_on_approve(p_entry) % time(s) in CODE, expected exactly 1 -- the D-a hook is the anchor the D-b splices are positioned against', v_n;
  end if;

  -- ---------------------------------------------------------------------------------------
  -- (2) clara.reverse_entry -- THE SEVENTH SPLICE (design SS2.4). Six 0041 markers survive,
  -- the D-b wall lands between the FA wall and the mirror INSERT.
  -- ---------------------------------------------------------------------------------------
  select lower(regexp_replace(regexp_replace(regexp_replace(
           coalesce(nullif(p.prosrc, ''), pg_get_functiondef(p.oid)), '/\*[\s\S]*?\*/', '', 'g'), '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))
    into v_src from pg_proc p where p.oid = 'clara.reverse_entry(uuid,text,text)'::regprocedure;
  if position('opening_entry_k_family_only' in v_src) = 0
     or position('allocated_items_present' in v_src) = 0
     or position('live_bank_match_present' in v_src) = 0
     or position('pg_advisory_xact_lock(203005004' in v_src) = 0
     or position('asia/kuala_lumpur' in v_src) = 0
     or position('clara._fa_reversal_blocked(p_entry)' in v_src) = 0
     or position('current_date' in v_src) <> 0 then
    raise exception '0042 tail 3(2): reverse_entry lost one of its six pre-0042 splice markers, or dates its mirror on current_date again';
  end if;
  -- [SPLIT D-b0 2026-08-04] THE WALL AND ITS ORDERING TRAVEL WITH THE WALL TO D-b1; what this
  -- slice adds to clara.reverse_entry is the correction-date term, asserted here on the same
  -- comment-stripped instrument the six markers above were read with.
  if position('clara._wdb_correction_posting_date(' in v_src) = 0 then
    raise exception '0042 tail 3(2): reverse_entry does not date a period-stamped entry''s mirror through clara._wdb_correction_posting_date -- the correction never enters the period it corrects, the period stays visibly un-corrected, and the re-run gate this slice also ships (S5.15c/S5.15d) then refuses that period forever';
  end if;

  -- ---------------------------------------------------------------------------------------
  -- (5) clara.set_client_fy_end -- THE RUNG + THE ANNUAL-CADENCE GUARD (design SS2.2).
  -- The verb had NO advisory rung before 0042: it read nothing it had to serialize against.
  -- It does now (a live annual template or annual authority blocks the change), and a guard
  -- read outside the rung is a check-then-act race with the sign verb.
  -- MONTHLY CADENCES DO NOT BLOCK -- that is the sandbox's live monthly authority, and the
  -- design names it as the cell. This tail asserts the rung and the guard, never the polarity;
  -- x42 owns the monthly-does-not-block cell.
  -- ---------------------------------------------------------------------------------------
  select lower(regexp_replace(regexp_replace(regexp_replace(
           coalesce(nullif(p.prosrc, ''), pg_get_functiondef(p.oid)), '/\*[\s\S]*?\*/', '', 'g'), '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))
    into v_src from pg_proc p
    where p.oid = 'clara.set_client_fy_end(uuid,integer,integer,text)'::regprocedure;
  v_a := position('clara._reserve_op(' in v_src);
  v_b := position('pg_advisory_xact_lock(203005004' in v_src);
  v_c := position('update clara.clients set fy_end_month' in v_src);
  if v_a = 0 or v_c = 0 then
    raise exception '0042 tail 3(5): set_client_fy_end lost its op reservation or its write anchor (reserve=%, write=%)', v_a, v_c;
  end if;
  if v_b = 0 then
    raise exception '0042 tail 3(5): set_client_fy_end takes no 203005004 client rung -- the annual-cadence guard would read templates and authorities a concurrent sign verb is still writing (design SS2.2)';
  end if;
  if not (v_a < v_b and v_b < v_c) then
    raise exception '0042 tail 3(5): set_client_fy_end''s rung is misplaced (reserve=%, rung=%, write=%) -- reserve the op key BEFORE the rung (the 0037 deadlock lesson) and take the rung BEFORE the write', v_a, v_b, v_c;
  end if;
  -- [SPLIT D-b0 2026-08-04] SLICE-LOCAL: ONE OF THE TWO LIVE-ANNUAL SOURCES. The whole-unit arm
  -- requires BOTH clara.adjustment_templates and clara.fa_depreciation_authorities; this
  -- slice ships the depreciation-authority arm (a 0041 relation, no later-slice dependency)
  -- and D-b2 adds the template arm with the table it reads. The cadence discrimination is
  -- asserted unchanged -- it is what keeps a live MONTHLY authority from wedging a lawful
  -- FY-end change, and it is true of this slice's one arm exactly as of the whole unit's two.
  -- FORWARD TOLERANCE: the FINAL (D-b2) form requires both sources.
  if position('fa_depreciation_authorities' in v_src) = 0 then
    raise exception '0042 tail 3(5): set_client_fy_end does not consult clara.fa_depreciation_authorities -- design SS2.2 blocks an FY-end move while a live ANNUAL depreciation authority exists, and that arm reads only 0041 objects, so this slice carries it';
  end if;
  if position('adjustment_templates' in v_src) <> 0 then
    raise exception '0042 tail 3(5): set_client_fy_end already consults clara.adjustment_templates -- that arm belongs to D-b2, with the table it reads';
  end if;
  if position('''annual''' in v_src) = 0 then
    raise exception '0042 tail 3(5): set_client_fy_end''s guard is not cadence-discriminated -- a blanket block would wedge every client that carries the sandbox''s live MONTHLY authority';
  end if;

  -- ---------------------------------------------------------------------------------------
  -- (6) clara._fa_assert_code_unreserved -- THE SHARED UNION, LEAF KEPT (design SS3.1).
  -- The bank belt now reads the WIDER predicate (FA profiles + FA register + ACTIVE advance
  -- enrolments + their register rows) so a bank account can never bind an actively enrolled
  -- advance code -- and it keeps taking the fa-roles leaf FIRST, because a read-then-refuse
  -- outside the leaf races the enrolment doors.
  -- ---------------------------------------------------------------------------------------
  select lower(regexp_replace(regexp_replace(regexp_replace(
           coalesce(nullif(p.prosrc, ''), pg_get_functiondef(p.oid)), '/\*[\s\S]*?\*/', '', 'g'), '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))
    into v_src from pg_proc p where p.oid = 'clara._fa_assert_code_unreserved(uuid,text)'::regprocedure;
  v_a := position('clara._fa_lock_roles(' in v_src);
  v_b := position('clara._acct_role_reserved(' in v_src);
  if v_a = 0 then
    raise exception '0042 tail 3(6): _fa_assert_code_unreserved no longer takes the fa-roles leaf -- concurrent enrolment and bank binding of one code would both pass (0041 tail 13(c), still the law)';
  end if;
  if v_b = 0 then
    raise exception '0042 tail 3(6): _fa_assert_code_unreserved does not read clara._acct_role_reserved -- the bank belt is still blind to staff-advance enrolments, so a bank account can bind an actively enrolled advance code (design SS3.1)';
  end if;
  if v_a > v_b then
    raise exception '0042 tail 3(6): _fa_assert_code_unreserved reads the reservation predicate BEFORE taking the leaf (leaf=%, read=%) -- that is the check-then-act window the leaf exists to close', v_a, v_b;
  end if;

  -- ---------------------------------------------------------------------------------------
  -- (7) clara._fa_asset_json -- THE G14 SPLIT-MONTH ADVISORY (design SS6.4, [WDB-G14]).
  -- DERIVED, NEVER STORED: no arithmetic changed, so the only evidence a reviewer ever sees
  -- is this projection. If the call is missing, the advisory silently does not exist.
  -- ---------------------------------------------------------------------------------------
  select coalesce(nullif(p.prosrc, ''), pg_get_functiondef(p.oid)) into v_src from pg_proc p where p.oid = 'clara._fa_asset_json(uuid,date)'::regprocedure;
  if position('clara._fa_split_month_advisory(' in v_src) = 0 then
    raise exception '0042 tail 3(7): _fa_asset_json does not project clara._fa_split_month_advisory -- the [WDB-G14] reviewer advisory is derived and never stored, so an unprojected advisory is an advisory that does not exist';
  end if;
  -- (7b) THE SAME LAW FOR THE [WDB-G10] SECOND-DISPOSAL FREEZE (round-5 fix lane).
  -- S5.6 makes dispose_fixed_asset REFUSE while a disposal draft is outstanding. That refusal
  -- is only actionable if the register READ says the row is frozen: without this projection
  -- /assets goes on offering a dispose form whose sole outcome is the refusal, and the remedy
  -- the refusal names has no door on that screen. The verdict must come from the guard's own
  -- function, so surface and refusal cannot answer differently.
  if position('clara._fa_disposal_draft_outstanding(' in v_src) = 0
     or position('disposal_draft_outstanding' in v_src) = 0
     or position('disposal_draft_entry_id' in v_src) = 0 then
    raise exception '0042 tail 3(7b): _fa_asset_json does not project the [WDB-G10] disposal freeze through clara._fa_disposal_draft_outstanding -- an unprojected freeze reads on /assets as a dispose form that can only ever be refused';
  end if;

  -- ---------------------------------------------------------------------------------------
  -- (8) THE S5 WRITER GUARDS (design SS6.1/SS6.2, [WDB-G10]/[WDB-G11]).
  -- The 64-edge cap has always existed on the THREE READERS (they refuse rather than truncate,
  -- 0041's fold G8). G11 closes it WRITER-side on the THREE MINTING PATHS, so a 65th
  -- generation can never be created -- rather than being created and then unreadable.
  -- ---------------------------------------------------------------------------------------
  -- ASSEMBLY RECONCILIATION S6-A1 (a cross-lane instrument mismatch, corrected at assembly
  -- and reported rather than relaxed). This block originally asserted the literal token
  -- `fa_lineage_too_deep` inside all SIX bodies. That is the right instrument for the three
  -- READERS -- they each carry their own inline hop counter and raise the token themselves --
  -- but the WRONG one for the three WRITERS: SECTION S5 does not inline a fourth, fifth and
  -- sixth copy of the counting law, it factors it into clara._fa_assert_lineage_mintable and
  -- `perform`s that helper at each minting path. So the writers legitimately do NOT contain
  -- the token string; the helper does. Asserting the string at the call sites would have
  -- forced three duplicated copies of the 64-edge arithmetic -- exactly the drift a shared
  -- helper exists to prevent. The writers are therefore pinned on THE CALL, and the helper is
  -- pinned on THE TOKEN, which together prove the same property the original assertion aimed
  -- at: every minting path refuses the 65th edge with CLR37 / fa_lineage_too_deep.
  for r in select * from (values
      -- readers (0041's, re-pinned: losing one re-opens a wrong-number-as-answer path).
      -- These raise the token INLINE, so the token itself is the marker.
      ('clara._fa_lineage_walk(uuid,date,boolean)', 'fa_lineage_too_deep'),
      ('clara._fa_lineage_first_due_month(uuid,date)', 'fa_lineage_too_deep'),
      ('clara._fa_disposal_stub(uuid,date)', 'fa_lineage_too_deep'),
      -- the SHARED writer-side assertion helper: this is the one body that must carry the
      -- token, because it is the single site that raises it for all three minting paths.
      ('clara._fa_assert_lineage_mintable(uuid,text)', 'fa_lineage_too_deep'),
      -- writers (0042's three minting paths: revise, the partial-split, the K6 replacement).
      -- Pinned on the CALL to the shared helper, not on the token (see S6-A1 above).
      ('clara.revise_fixed_asset_particulars(uuid,uuid,jsonb,date,text)',
        'clara._fa_assert_lineage_mintable('),
      ('clara.dispose_fixed_asset(uuid,uuid,date,bigint,text,text,text,text,text,bigint)',
        'clara._fa_assert_lineage_mintable('),
      ('clara._draft_opening_item_core(uuid,uuid,uuid,uuid,jsonb,jsonb,uuid,uuid,text)',
        'clara._fa_assert_lineage_mintable('),
      -- the second-disposal guard [WDB-G10]
      ('clara.dispose_fixed_asset(uuid,uuid,date,bigint,text,text,text,text,text,bigint)',
        'disposal_draft_outstanding')
    ) as t(sig, marker) loop
    -- to_regprocedure, not the ::regprocedure cast: a body that is GONE deserves this block's
    -- named error, not a bare "function does not exist" from a cast three lines earlier.
    if to_regprocedure(r.sig) is null then
      raise exception '0042 tail 3(8): % is GONE after this migration', r.sig;
    end if;
    select coalesce(nullif(p.prosrc, ''), pg_get_functiondef(p.oid)) into v_src from pg_proc p where p.oid = to_regprocedure(r.sig);
    if position(r.marker in v_src) = 0 then
      raise exception '0042 tail 3(8): % does not carry the token "%" -- design SS6 requires it at that site', r.sig, r.marker;
    end if;
  end loop;
  -- BOTH 0017 VALIDATOR SITES gain the cost-only NULL disjunct ([WDB-G12], narrowed from the
  -- round-1 over-fold: useful_life_months is already checked method-conditionally, and a
  -- global null-refusal would break method='none'). The incompleteness raise still appears
  -- TWICE (0041's own pin) -- that is what identifies the two sites -- and the cost disjunct
  -- must appear at least once per site. A LOWER bound, not an exact one: a composer may add a
  -- third cost test legitimately, and x42 owns the NULL-cost-both-doors drill.
  select lower(regexp_replace(regexp_replace(regexp_replace(
           coalesce(nullif(p.prosrc, ''), pg_get_functiondef(p.oid)), '/\*[\s\S]*?\*/', '', 'g'), '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))
    into v_src from pg_proc p
    where p.oid = 'clara._draft_opening_item_core(uuid,uuid,uuid,uuid,jsonb,jsonb,uuid,uuid,text)'::regprocedure;
  v_a := (length(v_src) - length(replace(v_src, 'fixed asset books-grade baseline is incomplete', '')))
         / length('fixed asset books-grade baseline is incomplete');
  if v_a <> 2 then
    raise exception '0042 tail 3(8): _draft_opening_item_core carries the baseline-incomplete raise % time(s), expected 2 -- the two K-validator sites the [WDB-G12] recut targets cannot be identified', v_a;
  end if;
  v_b := (length(v_src) - length(replace(v_src, 'v_cost is null', ''))) / length('v_cost is null');
  if v_b < 2 then
    raise exception '0042 tail 3(8): _draft_opening_item_core carries the cost-null disjunct % time(s), expected at least 2 (one per validator site, [WDB-G12]) -- with cost_cents now NOT NULL, a seed that omits a cost must be refused at BOTH doors rather than aborting on the column constraint', v_b;
  end if;

  raise notice '0042 tail 3 OK (D-b0 slice): clara._subledger_on_approve still carries all six 0041 markers and its single clara._fa_on_approve anchor; reverse_entry keeps its six pre-0042 markers and dates a period-stamped mirror through the correction-date authority; set_client_fy_end reserves-then-rungs-then-writes and blocks on a live ANNUAL depreciation authority (the template arm is D-b2''s); the bank belt reads the shared union under the leaf; the split-month advisory and the disposal freeze are projected; all three lineage readers, all three minting paths, the second-disposal guard and both K-validator cost disjuncts are present.';
end $tail3$;

-- =====================================================================================
-- TAIL 6 -- THE SS9.5 SINGLE-WRITER CENSUSES, MIRRORED FOR THE THREE D-b FLAGS KEYS
-- (design SS8 tail 6; the 0041 tail 5 idiom).
--
-- PROPOSAL AUTHENTICITY IN THIS PRODUCT IS STRUCTURAL, NOT CONVENTIONAL. A flags key is an
-- instruction the approve-time hook will execute against the books. If any body can write one,
-- then "the DB owns every number" reduces to "whoever can call a function owns every number".
-- Three counts keep it structural, and the third is the one a later migration will be tempted
-- to break: the GENERIC drafting core must stay innocent of every proposal key.
-- [SPLIT D-b0 2026-08-04] SLICE-LOCAL. Census sect.5 tail 6: "Arm (b) (_draft_entry_core innocent
-- of all 5 keys) can ship in D-b0 with the full 5-key list" -- and it ships UNCHANGED,
-- because the claim is about a body that must never learn ANY of the five, whether or not
-- the writers exist yet. Arm (c) is the same shape (a closed-set negative about grants on
-- clara.journal_entries, the table this slice's own DDL widens) and ships unchanged too.
-- Arm (a) -- the one writer set per flags key -- is deferred: its three expected rosters name
-- clara._adj_on_approve / clara._adj_run_occurrence_core (D-b2),
-- clara.book_staff_advance_application (D-b1) and clara.accept_bank_rule_suggestion (D-b3),
-- and census sect.5 flags that copying it is a MEASURED failure ("staff_advance_application's
-- writer set is {book_staff_advance_application} in D-b1 and {..., resolve_and_book_bank_line}
-- in D-b3 -- a copied tail fails"). FORWARD TOLERANCE: D-b1, D-b3 and D-b2 each ship arm (a)
-- with their own expected sets; the FINAL form is D-b2's three-row loop.
-- =====================================================================================
do $tail6$
declare
  r record; v_n int; v_names text; v_def text; v_pat text;
begin
  -- (b) THE GENERIC DRAFTING CORE IS INNOCENT OF ALL FIVE PROPOSAL KEYS (0041's two + D-b's
  -- three). clara._draft_entry_core is reachable from the agent lane; if it could persist a
  -- proposal key, forgery would be a matter of argument shape rather than of authority.
  select coalesce(nullif(p.prosrc, ''), pg_get_functiondef(p.oid)) into v_def from pg_proc p
    where p.pronamespace = 'clara'::regnamespace and p.proname = '_draft_entry_core' limit 1;
  if v_def is null then
    raise exception '0042 tail 6(b): clara._draft_entry_core is GONE';
  end if;
  foreach v_names in array array['depreciation_charges', 'fa_disposal', 'recurring_adjustment',
                                 'staff_advance_application', 'bank_rule_suggested'] loop
    if position(v_names in v_def) <> 0 then
      raise exception '0042 tail 6(b): _draft_entry_core now mentions the proposal key "%" -- the generic drafting core must never be able to persist one, or proposal authenticity stops being structural', v_names;
    end if;
  end loop;

  -- (c) NO TABLE GRANTS on clara.journal_entries for any human or machine role: a proposal can
  -- only be born inside an audited SECURITY DEFINER verb (0041 tail 5(d), re-pinned).
  select count(*)::int into v_n from information_schema.role_table_grants
   where table_schema = 'clara' and table_name = 'journal_entries'
     and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
     and grantee in ('clara_authenticated', 'clara_agent_ro', 'clara_runtime',
                     'clara_wake_interactive', 'clara_wake_proactive');
  if v_n <> 0 then
    raise exception '0042 tail 6(c): % write grant(s) exist on clara.journal_entries for a human or machine role -- proposal authenticity is no longer structural', v_n;
  end if;

  raise notice '0042 tail 6 OK (D-b0 slice): _draft_entry_core is innocent of all five proposal keys; zero write grants on journal_entries.';
end $tail6$;

-- =====================================================================================
-- TAIL 9 -- THE fa-roles LEAF CENSUS AT ITS D-b MEMBERSHIP (design SS2.1, re-pinning 0041
-- tail 13(c) at the new set).
--
-- THE LAW IS LEAF-LAST. `client:fa-roles` is the only advisory key in this schema taken BELOW
-- the house ladder, and it is safe only because nothing that holds it goes on to take a rung.
-- D-b widens WHO takes it -- staff-advance enrolment and adjustment template propose/retire
-- now claim account roles too -- and the widening is exactly where the property could be lost.
--
-- THE MEMBERSHIP IS "EVERY DOOR THAT WRITES ROLE-CLAIMING STATE", and its complement matters
-- as much: POSTING AND APPROVE PATHS ARE NEVER TAKERS. A hook that took the leaf would acquire
-- it while already holding 203005004 (every approve path does), which is a leaf under a rung --
-- the one order this ladder has no answer for.
-- [SPLIT D-b0 2026-08-04] SLICE-LOCAL ROSTERS in (b), (c) and (d); (a) is byte-exact. Every roster
-- here is still EXACT and still fails by name -- narrowed to this slice's catalog, with the
-- final form named. Census sect.5 tail 9: "per-slice with forward tolerance; final form in
-- D-b2".
-- =====================================================================================
do $tail9$
declare v_n int; v_names text; v_expect text; v_src text; v_name text;
begin
  -- (a) ONE TAKER OF THE KEY ITSELF (0041 tail 13(c), unchanged).
  select count(*)::int,
         coalesce(string_agg(p.proname::text, ', ' order by p.proname::text collate "C"), '')
    into v_n, v_names
    from pg_proc p
   where p.pronamespace = 'clara'::regnamespace
     and lower(regexp_replace(regexp_replace(regexp_replace(
           (coalesce(p.prosrc, '') || coalesce(pg_get_functiondef(p.oid), '')), '/\*[\s\S]*?\*/', '', 'g'), '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))
         like '%:fa-roles%';
  if v_n <> 1 or v_names <> '_fa_lock_roles' then
    raise exception '0042 tail 9(a): % function(s) take the fa-roles leaf key directly (%) -- expected exactly 1 (clara._fa_lock_roles). One taker is what makes the leaf auditable at all.', v_n, v_names;
  end if;

  -- (b) THE DOORS. Design SS2.1 enumerates seven; the owner ruling of 2026-08-03 (WDB-R3)
  -- adds an EIGHTH, and it is added under this census's own membership rule rather than
  -- against it. The rule is "every door that WRITES role-claiming state", and S5.17's
  -- claiming-door census found that clara._draft_opening_item_core -- the K-doc carry-down
  -- seed, publicly reachable through clara.seed_fixed_asset -- bakes all three fixed-asset
  -- account codes onto a clara.fixed_assets row straight from the seed payload. It was
  -- missing from this set for the reason this refusal names: it did its read-then-write
  -- racily, because it did no read at all. S5.17 gives it the union consult and the leaf
  -- together; taking the consult without the leaf would have made it a snapshot.
  -- [CROSS-SECTION EDIT: authored by the S5 reservation-authority lane, not the S6 lane --
  --  one identifier plus this note, forced by a change in S5. Reported, not silent.]
  -- FORWARD TOLERANCE: the FINAL (D-b2) form of this roster is {_draft_opening_item_core,
  -- _fa_assert_code_unreserved, enrol_staff_advance_account, propose_adjustment_template,
  -- retire_adjustment_template, retire_fa_account_profile, retire_staff_advance_account,
  -- upsert_fa_account_profile}. This slice ships the FA half plus S5.17's new member; D-b1
  -- adds the two advance doors and D-b2 the two template doors, each with its own family.
  v_expect := '_draft_opening_item_core, _fa_assert_code_unreserved, '
              || 'retire_fa_account_profile, '
              || 'upsert_fa_account_profile';
  select coalesce(string_agg(p.proname::text, ', ' order by p.proname::text collate "C"), '')
    into v_names
    from pg_proc p
   where p.pronamespace = 'clara'::regnamespace
     and p.proname <> '_fa_lock_roles'
     and lower(regexp_replace(regexp_replace(regexp_replace(
           (coalesce(p.prosrc, '') || coalesce(pg_get_functiondef(p.oid), '')), '/\*[\s\S]*?\*/', '', 'g'), '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))
         ~* '(?<![a-z0-9_.])(clara[[:space:]]*\.[[:space:]]*)?_fa_lock_roles[[:space:]]*\(';
  if v_names <> v_expect then
    raise exception '0042 tail 9(b): the fa-roles leaf doors are {%} -- expected exactly {%}. The membership is "every door that WRITES role-claiming state" (design SS2.1): the live bank belt, FA enrolment/retire, advance enrolment/retire, and adjustment template propose/retire. A door missing from this set does its read-then-write racily; a door added to it is a new opinion about where the leaf may be taken.', v_names, v_expect;
  end if;

  -- (c) THE POSTING AND APPROVE PATHS ARE NOT TAKERS. Stated as a negative because it is the
  -- half that would fail silently: a hook that takes the leaf still WORKS, right up until two
  -- ordinary approvals interleave with one enrolment.
  -- FORWARD TOLERANCE: the FINAL (D-b2) form of this list is {_adj_run_occurrence_core,
  -- _adj_on_approve, _adv_on_approve, _pair_reverse_core, approve_pair_reversal,
  -- _approve_entry_core, _subledger_on_approve, _settle_from_bank_line_core,
  -- resolve_and_book_bank_line}. Seven of the nine are bodies D-b1/D-b2/D-b3 create; the two
  -- that exist today are the two this slice can honestly assert, and they are the two the
  -- property is really about (every approve path holds the 203005004 client rung).
  foreach v_name in array array['_approve_entry_core', '_subledger_on_approve'] loop
    select lower(regexp_replace(regexp_replace(regexp_replace(
             coalesce(nullif(p.prosrc, ''), pg_get_functiondef(p.oid)), '/\*[\s\S]*?\*/', '', 'g'), '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))
      into v_src from pg_proc p
      where p.pronamespace = 'clara'::regnamespace and p.proname = v_name;
    if v_src is null then
      raise exception '0042 tail 9(c): clara.% does not exist -- the non-taker census has lost a subject', v_name;
    end if;
    if position('_fa_lock_roles' in v_src) <> 0 or position(':fa-roles' in v_src) <> 0 then
      raise exception '0042 tail 9(c): clara.% takes the fa-roles LEAF -- posting and approve paths hold the 203005004 client rung, so taking the leaf there is a leaf acquired UNDER a rung, which is how this ladder deadlocks (design SS2.1, leaf-LAST)', v_name;
    end if;
  end loop;

  -- (d) THE PREDICATE ITSELF IS LOCK-FREE. _acct_role_reserved is read from inside doors that
  -- already hold the leaf AND from read-only surfaces that hold nothing; a lock inside it would
  -- make the second class acquire the leaf by accident.
  select coalesce(nullif(p.prosrc, ''), pg_get_functiondef(p.oid)) into v_src from pg_proc p
    where p.pronamespace = 'clara'::regnamespace and p.proname = '_acct_role_reserved';
  if v_src is null then
    raise exception '0042 tail 9(d): clara._acct_role_reserved does not exist -- design SS2.1''s shared reservation reader is the one predicate FA, advances and the bank belt all read';
  end if;
  if position('pg_advisory' in v_src) <> 0 then
    raise exception '0042 tail 9(d): clara._acct_role_reserved acquires an advisory lock -- it is specified as a LOCK-FREE stable reader (design SS2.1); a lock inside it silently promotes every read-only caller into a leaf taker';
  end if;
  -- ASSEMBLY RECONCILIATION S6-A2 (a cross-lane instrument mismatch, corrected at assembly).
  -- Design SS2.1 specifies the union's four SOURCES (FA active profiles, FA register rows,
  -- ACTIVE advance enrolments, their register rows) but not how they are reached. This block
  -- originally required all four TABLE names inline. SECTION S2 reaches the FA half through
  -- the LIVE 0041 reader clara._fa_reserved_roles -- which already unions exactly
  -- fa_account_profiles (x3 shapes) and fixed_assets (x3 shapes) -- instead of re-inlining
  -- six FA reservation shapes that would then drift from the FA family's own definition. The
  -- delegated form is the stronger one: when D-a adds a seventh FA shape, the shared predicate
  -- follows automatically.
  -- [SPLIT D-b0 2026-08-04] THE ADVANCE HALF OF THIS ARM IS NOT ASSERTED HERE, because this slice
  -- ships the FA-ONLY SHELL of the union (census sect.2 Class B): clara.staff_advance_accounts
  -- and clara.staff_advances do not exist until D-b1, and the two disjuncts that read them are
  -- added when D-b1 RE-CREATES this body. FORWARD TOLERANCE: the D-b1 form restores the "both
  -- advance sources" requirement verbatim, and it is the FINAL form. What stays asserted here
  -- is the FA half -- the half this slice's shell actually claims.
  if position('clara._fa_reserved_roles(' in v_src) = 0
     and (position('fa_account_profiles' in v_src) = 0 or position('fixed_assets' in v_src) = 0) then
    raise exception '0042 tail 9(d): clara._acct_role_reserved covers neither FA source -- it must either delegate to clara._fa_reserved_roles (the live 0041 union, preferred) or read fa_account_profiles AND fixed_assets directly; without one of those an advance enrolment can claim a code the FA register already owns';
  end if;

  raise notice '0042 tail 9 OK (D-b0 slice): one direct taker of the fa-roles leaf; exactly this slice''s four role-claiming doors call it; no posting or approve path takes it; the shared reservation predicate is lock-free and reads its FA source through the live 0041 union.';
end $tail9$;

-- =====================================================================================
-- TAIL 16 -- THE cost_cents POST-STATE ([WDB-G12]).
-- The PRESTATE probe (count the NULL rows, name the remedy before the ALTER) is SECTION 0's;
-- this is the other end of the same claim -- that the ALTER actually landed. Both halves
-- matter: a prestate probe alone proves the world was clean, not that the column is now
-- protected.
--
-- The now-dead cost-null disjunct inside ck_fa_residual is left in place DELIBERATELY (design
-- SS6.3 says so): removing a CHECK to tidy it is a schema change with no test behind it, and a
-- disjunct that can never be true costs nothing.
-- =====================================================================================
do $tail16$
declare v_n int;
begin
  if not exists (select 1 from pg_attribute a
                 where a.attrelid = 'clara.fixed_assets'::regclass
                   and a.attname = 'cost_cents' and a.attnotnull and not a.attisdropped) then
    raise exception '0042 tail 16: clara.fixed_assets.cost_cents is still nullable -- [WDB-G12] makes it NOT NULL so a cost is a fact the register HAS, never a number the arithmetic has to guess around';
  end if;
  select count(*)::int into v_n from clara.fixed_assets where cost_cents is null;
  if v_n <> 0 then
    raise exception '0042 tail 16: % fixed_assets row(s) still carry a NULL cost_cents after the ALTER -- impossible unless the constraint was added NOT VALID', v_n;
  end if;
  raise notice '0042 tail 16 OK: clara.fixed_assets.cost_cents is NOT NULL and zero rows carry a null cost.';
end $tail16$;

-- =====================================================================================
-- TAIL 20 -- THE BOUNDARIES (design SS8 "Boundaries"; the [WDB-G16] literal).
--
-- A boundary is a thing this wave deliberately did NOT build. Absence is the hardest property
-- to keep, because nothing fails when it is lost -- so each one is asserted as an explicit
-- negative, with the reason it is a boundary rather than an omission:
--   (a) NO open_items WIDENING. Staff advances are their own register precisely so the AR/AP
--       subledger keeps meaning "amounts owed by and to third parties". An advance in
--       open_items would flow into ar/ap aging, the statements and the tie-out.
--   (b) NO EMPLOYEE COUNTERPARTY, EVER. A counterparty is a trading party; an employee is not.
--       [WDB-G7]: coding is free and ENROLMENT is the truth.
--   (c) NO NEW LISTEN CONSUMER. Both new events decide 'ignore'; nothing subscribes.
--   (d) NO NEW FROZEN WORKFLOW CLASS. Same evidence, DB-side: a taxonomy decision other than
--       'ignore' is what routes an event into workflow work.
--   (e) THE POSTERS TOUCH NEITHER journal_entries IMMUTABILITY NOR THE BELTS ([WDB-G16], the
--       literal): the immutability triggers and the movement/subledger belts know nothing
--       about D-b, and the D-b posters run under them like any other writer.
-- [SPLIT D-b0 2026-08-04] SLICE-LOCAL. The BOUNDARY CLAIMS THEMSELVES are byte-exact -- the
-- clara.open_items CHECK vocabulary and column shape (a), the counterparty kind vocabulary
-- (b), the two-NOTIFY-channel census (c) and the [WDB-G16] literal over the six immutability
-- and belt bodies (e) are all closed-set negatives about 0041 relations, and a boundary is
-- exactly the kind of property that must be asserted from the first slice onward. What is
-- deferred is the three WRITER ROSTERS inside them, each of which enumerates D-b1/D-b2/D-b3
-- bodies: (a)'s "which bodies write clara.open_items", (b)'s "which bodies write
-- clara.counterparties" and (e)'s "the four posters disable nothing". Arm (d) is deferred
-- whole: this slice registers NO event, so a taxonomy-decision census over two names that do
-- not exist would pass vacuously, which census sect.5 forbids as a shape.
-- FORWARD TOLERANCE: D-b1, D-b3 and D-b2 each restore the roster arms their own bodies join;
-- the FINAL form is D-b2's, at which point (d)'s two event names both exist.
-- =====================================================================================
do $tail20$
declare v_def text; v_n int; v_names text; v_name text; v_src text;
begin
  -- (a) open_items is untouched in vocabulary and in shape. EVERY check constraint on the table
  -- is aggregated, not just "the one that mentions domain": open_items carries at least two
  -- (the domain vocabulary and the kind/sign matrix) and both name `domain`, so a single-row
  -- SELECT INTO would pick an arbitrary one and the census would be non-deterministic.
  select coalesce(string_agg(pg_get_constraintdef(c.oid), ' ~ ' order by c.conname::text collate "C"), '')
    into v_def from pg_constraint c
   where c.conrelid = 'clara.open_items'::regclass and c.contype = 'c';
  if position('''ar''' in v_def) = 0 or position('''ap''' in v_def) = 0 then
    raise exception '0042 tail 20(a): the clara.open_items CHECK set no longer names the ar/ap domain pair (defs are %)', v_def;
  end if;
  if position('advance' in v_def) <> 0 or position('adjustment_template' in v_def) <> 0 then
    raise exception '0042 tail 20(a): a clara.open_items CHECK admits a D-b concept (defs are %) -- staff advances are their own register (design SS3.2); an advance in open_items flows into ar/ap aging, the statements and the tie-out, none of which mean anything for a staff debt', v_def;
  end if;
  select coalesce(string_agg(column_name::text, ', ' order by column_name::text collate "C"), '')
    into v_names
    from information_schema.columns
   where table_schema = 'clara' and table_name = 'open_items'
     and (column_name like '%advance%' or column_name like '%template%'
          or column_name like '%adjustment%');
  if v_names <> '' then
    raise exception '0042 tail 20(a): clara.open_items gained the D-b column(s) {%} -- the subledger was not widened by this wave', v_names;
  end if;

  -- (b) no employee counterparty.
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
   where c.conrelid = 'clara.counterparties'::regclass and c.conname = 'counterparties_kind_check';
  if v_def is null then
    raise exception '0042 tail 20(b): counterparties_kind_check is GONE -- the counterparty vocabulary is unbounded';
  end if;
  if position('employee' in v_def) <> 0 or position('staff' in v_def) <> 0 then
    raise exception '0042 tail 20(b): counterparties_kind_check admits an employee/staff kind (def is %) -- WD-R10 and [WDB-G7] put the staff relationship in the ENROLMENT, never in the counterparty master; a staff counterparty would put employee names into AR/AP aging', v_def;
  end if;

  -- (c) no new LISTEN channel. Measured over the whole schema so a D-b body cannot introduce
  -- a third quietly; the two live channels are the event relay and the runtime control plane.
  -- (ASSEMBLY FIX: `order by m[1] collate "C"` is rejected under DISTINCT -- Postgres requires
  -- every ORDER BY expression to appear verbatim in the aggregate's argument list, and the
  -- collate clause makes it a different expression. Ordering is cosmetic here; dropped.)
  select coalesce(string_agg(distinct m[1], ', '), '') into v_names
    from pg_proc p,
         lateral regexp_matches(
           lower(regexp_replace(regexp_replace(regexp_replace(
             (coalesce(p.prosrc, '') || coalesce(pg_get_functiondef(p.oid), '')), '/\*[\s\S]*?\*/', '', 'g'), '--[^\n]*', '', 'g'), '\s+', ' ', 'g')),
           'pg_notify\([[:space:]]*''([a-z0-9_]+)''', 'g') m
   where p.pronamespace = 'clara'::regnamespace;
  if v_names <> 'clara_events, clara_runtime_ctl' then
    raise exception '0042 tail 20(c): the schema notifies on {%} -- expected exactly {clara_events, clara_runtime_ctl}. Wave D-b adds NO new LISTEN consumer (design SS2.7: the adjustment sweep is a fifth due-check inside the existing leader loop, not a new subscriber).', v_names;
  end if;

  -- (e) THE [WDB-G16] LITERAL. The immutability triggers and the belts are innocent of D-b:
  -- the posters obey them rather than being exempted from them. A D-b marker inside any of
  -- these bodies means somebody carved out an exception instead of satisfying the rule.
  foreach v_name in array array['_tf_entry_immutable', '_tf_lines_immutable',
                                '_tf_fa_movement_belt', '_tf_subledger_entry_belt',
                                '_tf_subledger_item_belt', '_tf_subledger_alloc_belt'] loop
    -- Comment-stripped throughout (e): these bodies are allowed to EXPLAIN the boundary; what
    -- they may not do is act on it.
    select lower(regexp_replace(regexp_replace(regexp_replace(
             coalesce(nullif(p.prosrc, ''), pg_get_functiondef(p.oid)), '/\*[\s\S]*?\*/', '', 'g'), '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))
      into v_src from pg_proc p
      where p.pronamespace = 'clara'::regnamespace and p.proname = v_name;
    if v_src is null then
      raise exception '0042 tail 20(e): clara.% is GONE -- the [WDB-G16] boundary has lost a subject', v_name;
    end if;
    if position('recurring_adjustment' in v_src) <> 0
       or position('staff_advance' in v_src) <> 0
       or position('bank_rule_suggested' in v_src) <> 0
       or position('adjustment_template' in v_src) <> 0 then
      raise exception '0042 tail 20(e): clara.% names a D-b concept -- [WDB-G16] ratifies that the two posters touch NEITHER journal_entries immutability NOR the belts. A carve-out here is the AF-2 boundary interpretation being quietly reversed.', v_name;
    end if;
  end loop;

  raise notice '0042 tail 20 OK (D-b0 slice): open_items is unwidened; no employee counterparty kind; exactly the two pre-existing NOTIFY channels; the immutability triggers and all four belts are innocent of D-b.';
end $tail20$;

do $tail_final$
begin
  raise notice '0042 wave D-b SLICE D-b0 (shared class authorities): APPLIED. SECTION 0 (6 probes) + S1 (journal_entries.auto_reversal_of + uq_je_auto_reversal_of) + S2 (the seven misfiled class authorities, clara._wdb_rerun_breach in FA-arm form) + S5 (the D-a residual fixes, the reservation authority eradicated at its root in FA-only form, the due-oracle fail-open, the clock lane, the FY algebra, four slice-local censuses) + tails 16, 1, 3, 6, 9, 20, all green. NEXT: D-b1 (staff advances), then D-b3 (the AF-2 composite), then D-b2 (recurring adjustments, held back with the round-11 fixes).';
end $tail_final$;

